#!/usr/bin/env node
/**
 * verify-self-target — the caster is in their own target list.
 *
 * NEW at 3.418.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS CHAPTER EXISTS TO KEEP DEAD.
 *
 * Graham, 27 August 2026: "My Cleric cast a Cure Spell and it did not
 * allow him to target himself... A character with healing spells that
 * cannot target themselves is in real trouble."
 *
 * `candidateTokens` filtered the acting token out of the picker:
 *
 *     canvas.tokens.placeables.filter((o) => o.id !== actorToken?.id)
 *
 * Cure reads `targets: "1 willing creature"` and heals whoever is
 * targeted, so the one creature a Cleric could never heal was himself.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A SOURCE CHECK.
 *
 * The filter lives in a function that reads `canvas.tokens.placeables`
 * and builds a DialogV2 — Foundry, top to bottom, and unreachable from
 * Node. The DECISION inside it is one line long and was wrong for
 * months. Same shape as every other expensive defect on this project,
 * and the same answer: when the code cannot be executed, read it and
 * refuse the pattern.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE EXCLUSION ALSO CAUSED A SECOND BUG, NOW GONE.
 *
 * The fallback sweep carried a note about having to walk every token
 * rather than the candidate list, because the candidates could not reach
 * the actor's own token to UNtarget it — the 3.286.0 playtest where a
 * Fighter confirmed an empty dialog and swung at himself. That hazard
 * existed only because of this filter.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { spellNeedsTarget } from "../module/magic/casting.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const targeting = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs"), "utf8");

/** The named function's body, so a check can say which one it means. */
const body = (source, name) => {
  const at = source.indexOf(`function ${name}`);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
};

/* ================================================================== *
 * A. THE CANDIDATE LIST — the section the defect bought
 * ================================================================== */

const candidates = body(targeting, "candidateTokens");
ok("A0 the candidate builder was found", Boolean(candidates),
  "if this fails every check below proves nothing");

// THE EXACT SHIPPED LINE, refused by name. A filter comparing a token
// against the acting token is the defect, whatever it is spelled.
ok("A1 the candidate list does not filter out the acting token",
  Boolean(candidates) && !/\.filter\(\s*\(?\s*\w+\s*\)?\s*=>\s*\w+\.id\s*!==\s*actorToken/.test(candidates),
  "this is the line that stopped a Cleric healing himself");
ok("A2 nor filters on any actor identity at all",
  Boolean(candidates) && !/!==\s*(actorToken|actor)\b/.test(candidates),
  "the picker offers; it does not adjudicate who may be chosen");
ok("A3 it takes no acting-token argument to filter by",
  /function candidateTokens\(\s*\)/.test(targeting),
  "a parameter it must not use is an invitation to use it again");

/* ================================================================== *
 * B. The caster is visible and distinguishable
 * ================================================================== */

ok("B1 the caster's own row is marked",
  /\(yourself\)/.test(targeting),
  "a row reading like the six around it is one a player has to hunt for");
ok("B2 the caster is listed first",
  /isSelf\(b\)[\s\S]{0,40}isSelf\(a\)/.test(targeting),
  "a healer opening this dialog is usually reaching for themselves");
// NEVER PRE-CHECKED. Appearing in the list is the fix; being chosen by
// default would be a different and worse bug — every attack would open
// aimed at the attacker.
ok("B3 the caster is not pre-selected",
  !/isSelf\([^)]*\)\s*\?\s*"checked"/.test(targeting),
  "pre-checking self would point every attack at its own caster");
ok("B4 only an already-targeted token is pre-checked",
  /currentlyTargeted\.has\(token\.id\) \? "checked" : ""/.test(targeting));

/* ================================================================== *
 * C. The spells that open the picker at all
 * ================================================================== */

// CURE IS THE REPORTED CASE, and it must reach the picker for the fix
// above to matter to it.
ok("C1 Cure opens the target picker",
  spellNeedsTarget({ targets: "1 willing creature", area: "", category: "utility" }) === true);
ok("C2 an attack spell opens it too",
  spellNeedsTarget({ targets: "", area: "", category: "attack" }) === true,
  "Graham's ruling: the option is there even where it is unlikely to be wanted");
// AN AREA SPELL STILL DOES NOT. Its template decides who is caught, and
// collecting a target the spell then ignores would be worse than not
// asking — that reasoning is unchanged and must stay unchanged.
ok("C3 an area spell does not open it",
  spellNeedsTarget({ area: "20-foot burst", targets: "1 creature" }) === false);
ok("C4 a spell naming no creatures does not open it",
  spellNeedsTarget({ targets: "", area: "", category: "utility" }) === false);

/* ================================================================== *
 * D. The downstream rule that self-targeting finally makes reachable
 * ================================================================== */

const cast = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");

// CONDUCTIVE HEALING says "to a target other than yourself". While the
// caster could never BE a target, that test was always true and the feat
// always fired. It only becomes a real distinction now.
ok("D1 Conductive Healing still excludes the caster",
  /effectTargets\.some\(\(t\) => t && t\.id !== actor\.id\)/.test(cast),
  "a rule that says 'other than yourself' needs self-targeting to mean anything");

/* ================================================================== */

const label = "verify-self-target";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
