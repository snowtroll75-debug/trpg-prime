#!/usr/bin/env node
/**
 * verify-live-3612 — what the 3.612.0 live drive found.
 *
 * NEW at 3.612.1. `claude/live-testing-report-3.612.0.md` has the drive.
 *
 *   A  H1  a check card's buttons act on the creature that rolled, not its sheet
 *   B  G1  a reaction spell's sheet-cast note is not said on the reaction
 *   C  G2  a per-round held bonus says "each round"
 *   D  G3  Web's penalty rows carry no stray note word
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { heldBonusCastLine, normaliseHeldBonus } from "../module/magic/held-bonus.mjs";
import { PLAN } from "./block34b-plan.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ================================================================== *
 * A. H1 — the creature, not its sheet
 * ================================================================== */
{
  const check = read("module", "dice", "check.mjs");
  ok("A1 the card records the token and the actor's uuid beside the id",
    /actorId: this\.actor\?\.id \?\? null,[\s\S]{0,700}tokenId: this\.actor\?\.token\?\.id \?\? null,\s*\n\s*actorUuid: this\.actor\?\.uuid \?\? null,/.test(check));
  const card = read("module", "dice", "check-card-interactions.mjs");
  ok("A2 no button resolves the roller by the bare id any more",
    !card.includes("raw.actorId ? game.actors.get(raw.actorId) : null"));
  ok("A3 the card's resolver asks the token, then the uuid, then the id",
    /async function cardActor\(raw\) \{\s*\n\s*return resolveActorHandle\(\{ tokenId: raw\?\.tokenId, actorUuid: raw\?\.actorUuid, actorId: raw\?\.actorId \}\);/.test(card));
  const uses = (card.match(/= await cardActor\(raw\);/g) ?? []).length;
  // EIGHT SINCE 3.624.0: the natural-20 luck award (block 40's R15) resolves
  // its roller the same way.
  ok("A4 every button that used the id now uses it — Conviction, Scoundrel's Luck, Unbreakable Resolve, Devotion, Natural Defence, the held bonuses, the luck award",
    uses === 8, `${uses} uses`);
  const knife = read("module", "combat", "action-feat-detection.mjs");
  ok("A5 Knife Flurry's card names the creature too",
    knife.includes("handle: actorHandle(actor, actor.token ?? null)")
    && knife.includes("const actor = (await resolveActorHandle(card.handle)) ?? game.actors.get(card.actorId);"));
  const handle = read("module", "actor-handle.mjs");
  ok("A6 the resolver still asks the token first and the id last",
    handle.indexOf("const tokenId = text(handle?.tokenId);") < handle.indexOf("const uuid = text(handle?.actorUuid);")
    && handle.indexOf("const uuid = text(handle?.actorUuid);") < handle.indexOf("const actorId = text(handle?.actorId);")
    && handle.indexOf("const tokenId = text(handle?.tokenId);") > 0);
}

/* ================================================================== *
 * B. G1 — the sheet-cast note
 * ================================================================== */
{
  for (const name of ["Fateful Temptation", "Lucky Break"]) {
    const note = PLAN[name].effects.find((e) => e.kind === "note");
    ok(`B1 ${name}'s note is marked as said only on a cast from the sheet`, note?.sheetCastOnly === true);
  }
  const cast = read("module", "magic", "cast-workflow.mjs");
  ok("B2 a reaction cast drops those notes before anything reads the rows",
    cast.includes('if (reaction && Array.isArray(effEffects)) effEffects = effEffects.filter((e) => !(e?.kind === "note" && e.sheetCastOnly === true));')
    && cast.indexOf("e.sheetCastOnly === true") > cast.indexOf("let effEffects = apMode?.effects ?? spellData.effects;")
    && cast.indexOf("e.sheetCastOnly === true") < cast.indexOf("if (spellNeedsTarget(spellData) && !storingNow"));
}

/* ================================================================== *
 * C. G2 — "each round"
 * ================================================================== */
{
  const each = heldBonusCastLine(normaliseHeldBonus(PLAN["Inspire Heroics"].effects[0]));
  ok("C1 Inspire Heroics' line says each round", /advantage<\/strong> on one skill check each round/.test(each), each);
  const once = heldBonusCastLine(normaliseHeldBonus({ heldKind: "advantage", checkTypes: ["save"], label: "Moment Of Fortune" }));
  ok("C2 a held bonus spent once does not", !/each round/.test(once), once);
}

/* ================================================================== *
 * D. G3 — "Web webbed"
 * ================================================================== */
{
  const check = PLAN.Web.effects.find((e) => e.kind === "entryCheck");
  const rows = Object.values(check.degrees).flatMap((r) => r.rows ?? []);
  ok("D1 Web's rung rows carry no note word", rows.length === 3 && rows.every((r) => !("note" in r)));
}

if (failures.length) {
  console.log(`verify-live-3612: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-live-3612: OK — ${checks} checks. A card's buttons act on the creature that rolled, and three lines say what happened.`);
