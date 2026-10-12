#!/usr/bin/env node
/**
 * mutate-live-3612 — can verify-live-3612 fail?
 *
 * NEW at 3.612.1. Each mutation puts back one of the defects the 3.612.0
 * drive found. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const CHECK = at("module", "dice", "check.mjs");
const CARD = at("module", "dice", "check-card-interactions.mjs");
const KNIFE = at("module", "combat", "action-feat-detection.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const HELD = at("module", "magic", "held-bonus.mjs");
const PLANF = at("tools", "block34b-plan.mjs");
const VERIFY = at("tools", "verify-live-3612.mjs");

const MUTATIONS = [
  { file: CHECK, name: "H1 — the card records only the id",
    from: "              actorUuid: this.actor?.uuid ?? null,\n", to: "", breaks: "A1" },
  { file: CARD, name: "H1 — the resolver asks the id first",
    from: "  return resolveActorHandle({ tokenId: raw?.tokenId, actorUuid: raw?.actorUuid, actorId: raw?.actorId });",
    to: "  return game.actors.get(raw?.actorId) ?? resolveActorHandle({ tokenId: raw?.tokenId, actorUuid: raw?.actorUuid, actorId: raw?.actorId });", breaks: "A3" },
  { file: CARD, name: "H1 — the held bonuses read the sheet again",
    from: "  const roller = await cardActor(raw);\n  if (!roller?.isOwner) return;\n\n  const card = html.querySelector?.(\".trg-check-card\");\n  if (!card) return;\n\n  const { HELD_BONUS_FLAG",
    to: "  const roller = raw.actorId ? game.actors.get(raw.actorId) : null;\n  if (!roller?.isOwner) return;\n\n  const card = html.querySelector?.(\".trg-check-card\");\n  if (!card) return;\n\n  const { HELD_BONUS_FLAG", breaks: "A2/A4" },
  { file: KNIFE, name: "H1 — Knife Flurry resolves the sheet",
    from: "  const actor = (await resolveActorHandle(card.handle)) ?? game.actors.get(card.actorId);",
    to: "  const actor = game.actors.get(card.actorId);", breaks: "A5" },
  { file: CAST, name: "G1 — the sheet-cast note is said on the reaction",
    from: "  if (reaction && Array.isArray(effEffects)) effEffects = effEffects.filter((e) => !(e?.kind === \"note\" && e.sheetCastOnly === true));\n",
    to: "", breaks: "B2" },
  { file: PLANF, name: "G1 — Lucky Break's note is not marked",
    from: "{ kind: \"note\", sheetCastOnly: true, text: \"Cast in answer to your own failed save:",
    to: "{ kind: \"note\", text: \"Cast in answer to your own failed save:", breaks: "B1" },
  { file: HELD, name: "G2 — a per-round bonus reads as spent once",
    from: " + (spec?.perRound ? \" each round\" : \"\");", to: ";", breaks: "C1" },
  { file: HELD, name: "G2 — every held bonus says each round",
    from: " + (spec?.perRound ? \" each round\" : \"\");", to: " + \" each round\";", breaks: "C2" },
  { file: PLANF, name: "G3 — Web webbed",
    from: "value: -10, duration: \"2 rounds\" }", to: "value: -10, duration: \"2 rounds\", note: \"webbed\" }", breaks: "D1" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-live-3612 does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}
let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) { console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`); unmatched++; continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
    else console.log(`  caught    ${m.name}`);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}
process.stdout.write(survived + unmatched
  ? `\nmutate-live-3612: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-live-3612: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
