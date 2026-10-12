#!/usr/bin/env node
/**
 * verify-feat-grants — a grant nothing applies is not a smaller feature.
 *
 * NEW at 3.421.0. Two defects, one shape.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEFECT A. THE DIVINE ASPECT COULD NOT OFFER ITS OWN SPELLS.
 *
 * Graham, 27 August 2026: "Divine Aspects are not working properly and
 * not allowing the character to select specialist spells."
 *
 * `grantChosenSpell` drops specialist spells unless a caller asks for
 * them (Graham's own ruling, 15 August: a free repertoire pick must not
 * reach what a heritage or school is meant to HAND you). The paragraph
 * defending that default names the divine aspect in its list of things
 * being protected — and `useDivineAspect`, which IS the granting side of
 * that rule, never passed the flag. All 44 spells the ten aspects list
 * carry `specialist: true`, so the pool was emptied before the aspect's
 * own filter ran: "no matching spells found in the compendium", every
 * aspect, every character, always.
 *
 * The guard was written with the victim's name in it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEFECT B. A FEAT'S GRANTS ONLY EVER RAN FROM THE ITEM PICKER.
 *
 * Graham, same message: "the Archetype feat Blessed by Gods is not
 * applying the Lay on Hands Specialist Spell."
 *
 * `GRANT_FIELDS` has always had a `feat` entry and twelve feats in the
 * pack grant a spell. But `feat` was missing from `AUTOGRANT_ITEM_TYPES`,
 * so nothing applied them on arrival; only `picker-workflow` called
 * `applyAllGrants` itself. Every other route — the Cleric's Priestly
 * Path, the Fighter's Martial Training, the Rogue's Archetypal Path, a
 * drag from the compendium, a class or race granting the feat — dropped
 * them silently.
 *
 * And a second guard would still have stopped it: the autorun skipped
 * anything carrying a `grantedBy` stamp because "a granted item's own
 * grants belong to whatever granted it". They belonged to nobody.
 * Priestly Path does not list Lay On Hands anywhere, so the chain ended.
 *
 * `grant-cleanup`'s own header has described the relationship it takes
 * down as "race -> abilities/feats, FEAT -> SPELLS" the whole time. The
 * removal side was built for a grant the application side never made.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { declaresGrants } from "../module/grants.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const feats = read("module", "feats-workflow.mjs");
const autorun = read("module", "grant-autorun.mjs");
const workflow = read("module", "grants-workflow.mjs");

/** The body of a named function, so a claim about "inside it" stays true
 *  as the function grows. Same technique verify-rage's C6 was rebuilt on
 *  after a character count fenced the wrong range. */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  if (start < 0) return "";
  let depth = 0;
  let i = source.indexOf("{", start);
  if (i < 0) return "";
  const from = i;
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") { depth -= 1; if (!depth) return source.slice(from, i + 1); }
  }
  return "";
}

/* ================================================================== *
 * A. THE DIVINE ASPECT ASKS FOR SPECIALIST SPELLS
 *
 * The whole of defect A is one missing argument, so this section is
 * about that argument being present in the right function.
 * ================================================================== */

const aspect = functionBody(feats, "async function useDivineAspect(actor, item)");
ok("A1 useDivineAspect is still a function this file can find", aspect.length > 200,
  "the anchor moved; every check below would silently pass on an empty string");
ok("A2 the aspect's chooser asks for specialist spells",
  /allowSpecialist:\s*true/.test(aspect),
  "all 44 aspect spells carry specialist:true, so without it the list is empty");
ok("A3 and it is the aspect's own call that asks, not a neighbour's",
  /allowSpecialist:\s*true[\s\S]{0,400}flagKey:\s*"aspectSpecialistSpell"/.test(aspect),
  "the flag and the key must belong to the same grantChosenSpell call");

// THE DEFAULT ITSELF MUST SURVIVE. Fixing this by flipping the default
// would re-open Graham's 15 August ruling and let every free repertoire
// pick reach the 106 specialist spells.
ok("A4 the exclusion is still the default for everyone else",
  /allowSpecialist = false/.test(feats),
  "Graham, 15 Aug 2026 — a free pick must not take what a school hands you");

// EVERY OTHER GRANTING CHOOSER ASKS TOO. Four choosers are the granting
// side of that rule and all four must say so.
// FIVE SINCE 3.623.0: Cloistered Priest's "Cleric Specialist Spell" (block
// 40's R3) asked for none and so could never offer one.
ok("A5 all five specialist-spell choosers ask for them",
  (feats.match(/allowSpecialist:\s*true/g) ?? []).length === 5,
  `Bard, Druid, the Specialist Spell feat, the divine aspect and Cloistered Priest — found `
  + `${(feats.match(/allowSpecialist:\s*true/g) ?? []).length}`);

/* ================================================================== *
 * B. NO GRANT TYPE IS STRANDED
 *
 * The general form of defect B. A type in GRANT_FIELDS that is not in
 * AUTOGRANT_ITEM_TYPES declares grants that nothing applies.
 * ================================================================== */

const grantTypes = [...functionBody(workflow, "export const GRANT_FIELDS = Object.freeze")
  .matchAll(/^ {2}"?([a-z-]+)"?:\s*\[/gm)].map((m) => m[1]);
ok("B1 the GRANT_FIELDS table is still readable from source", grantTypes.length >= 8,
  `parsed ${grantTypes.length} types — the shape changed and B2 would pass vacuously`);

const autoList = /AUTOGRANT_ITEM_TYPES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(autorun)?.[1] ?? "";
const autoTypes = [...autoList.matchAll(/"([a-z-]+)"/g)].map((m) => m[1]);
// FOUNDATION_ITEM_TYPES is spread in rather than listed.
const foundation = ["race", "heritage", "background", "origin"];
ok("B1b the spread is still the four foundations",
  /\.\.\.FOUNDATION_ITEM_TYPES/.test(autoList),
  "if the spread went away the names must be listed literally");
const covered = new Set([...autoTypes, ...foundation]);

const stranded = grantTypes.filter((t) => !covered.has(t));
ok("B2 every type that declares grants has something that applies them",
  stranded.length === 0,
  `${stranded.join(", ")} declare grant fields that only the Apply Grants button ever runs`);

ok("B3 a feat is one of them", covered.has("feat"),
  "twelve feats in the pack grant a spell");
ok("B4 and so is a creature type", covered.has("creature-type"));

/* ================================================================== *
 * C. A GRANTED ITEM'S OWN GRANTS
 *
 * The second guard, and the pure decision that replaced it.
 * ================================================================== */

ok("C1 an item that declares nothing declares nothing",
  declaresGrants({}, [{ field: "grantedSpells" }]) === false);
ok("C2 a blank field is not a declaration",
  declaresGrants({ grantedSpells: "   " }, [{ field: "grantedSpells" }]) === false,
  "a half-finished pack entry must not earn a grant pass");
ok("C3 a named spell is",
  declaresGrants({ grantedSpells: "Lay on Hands" }, [{ field: "grantedSpells" }]) === true);
ok("C4 any one of several fields is enough",
  declaresGrants({ grantedFeats: "Evasion" },
    [{ field: "grantedSpells" }, { field: "grantedFeats" }]) === true);
// A TYPE WITH NO ENTRY MUST NOT THROW. GRANT_FIELDS[type] is undefined
// for a weapon or a piece of gear, and the guard runs on every create.
ok("C5 a type with no grant fields at all is safe to ask about",
  declaresGrants({ grantedSpells: "Lay on Hands" }, undefined) === false
  && declaresGrants(undefined, undefined) === false);

// THE GUARD ITSELF. Both copies — the createItem hook and the sweep —
// must ask the question rather than returning on the stamp alone.
// SCOPED BY REGION, NOT BY A CHARACTER COUNT. The first draft of these
// two fenced the search to 200 characters after the stamp, which is the
// mistake verify-rage's C6 was rebuilt to remove: a comment grew and the
// claim silently became a claim about a different piece of code.
const sweep = functionBody(autorun, "export async function queueGrantPass(actor)");
const hookStart = autorun.indexOf('Hooks.on("createItem"');
const hook = hookStart < 0 ? "" : autorun.slice(hookStart, autorun.indexOf("queueGrantPass(actor);", hookStart));
ok("C5b both regions were actually located", sweep.length > 200 && hook.length > 200,
  `sweep ${sweep.length}, hook ${hook.length} — an empty region passes every regex below`);

const asksTheQuestion = (region) =>
  /grantedBy/.test(region) &&
  /declaresGrants\(item\.system, GRANT_FIELDS\[item\.type\]\)/.test(region);

ok("C6 the sweep lets a granted item with grants of its own through",
  asksTheQuestion(sweep),
  "the stamp alone used to skip it, and nothing applied them instead");
ok("C7 and the createItem hook does the same",
  asksTheQuestion(hook),
  "two guards, and either one alone still loses Lay On Hands");
// NARROW ON PURPOSE. A granted item with nothing of its own must still
// be skipped, or every chained create earns a needless pass.
ok("C8 a granted item with nothing to grant is still skipped",
  /!declaresGrants\(/.test(sweep),
  "the negation is what keeps 411 feats out of the sweep");

/* ================================================================== *
 * D. THE PACK — the data these two defects were hiding
 * ================================================================== */

ok("D1 the removal side always expected a feat to grant a spell",
  /feat\s*(?:->|&rarr;|→)\s*spells|feat → spells/i.test(read("module", "grant-cleanup.mjs")),
  "grant-cleanup's header names the relationship the application side never made");

/* ================================================================== */

const label = "verify-feat-grants";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
