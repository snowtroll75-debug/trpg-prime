#!/usr/bin/env node
/**
 * verify-feat-choice-label — a feat that has chosen says what it chose.
 * NEW at 3.553.1.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE REQUEST.
 *
 * Graham, 15 September 2026: "when the feats Skill Focus and Weapon
 * Focus are selected, the feat should show the selected pick in brackets
 * next to its name on the sheet."
 *
 * Both feats are repeatable and both are nothing BUT their pick — "a
 * different group per copy", "a different action per copy" — so three
 * copies of Weapon Focus were three identical rows, and the only way to
 * tell them apart was to press Use on each and read the dialog.
 *
 * THE RULE, given the same day once the first build showed it reaching
 * further than the two feats named: "if a feat or ability can be taken
 * multiple times, each time selecting a new option then the option
 * should be shown in brackets. If it may only be taken once, then
 * don't." Which is `system.repeatable` — a field the feats pack already
 * carries, and which agrees with the printed text wherever the book
 * says "you may select this feat multiple times".
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS PINS.
 *
 *   A. The display rule itself, driven.
 *   B. Where the pick is read from — the effect's own `choiceLabel`, and
 *      failing that the effect NAME every chooser writes in the same
 *      shape, so a character who chose before 3.553.1 sees their picks
 *      without a migration.
 *   C. That both choosers still write that shape, and stamp the label.
 *   D. That the SHEET uses it, and that the item's own name is left
 *      alone — every grant, prerequisite and "already held" test matches
 *      on the name, and a renamed document stops answering to them.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { featDisplayName, choiceFromEffectName } from "../module/feats.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function eq(label, actual, expected) {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ================================================================== *
 * A. THE DISPLAY RULE
 * ================================================================== */
eq("A1 a pick is shown in brackets after the name",
  featDisplayName("Weapon Focus", "Brawling"), "Weapon Focus (Brawling)");
eq("A2 and a skill action reads the same way",
  featDisplayName("Skill Focus", "Sneak"), "Skill Focus (Sneak)");
eq("A3 a feat with no pick is left exactly as it is",
  featDisplayName("Toughness", ""), "Toughness");
eq("A4 as is one whose pick has not been made yet",
  featDisplayName("Weapon Focus", null), "Weapon Focus");
// A background may grant the feat with its pick already in the name, and
// the pack prints a few that way. "Weapon Focus (Brawling) (Brawling)"
// is the obvious way to get this wrong.
eq("A5 a name that already carries its pick is not doubled",
  featDisplayName("Weapon Focus (Brawling)", "Brawling"), "Weapon Focus (Brawling)");
eq("A6 matched whatever the case", featDisplayName("Weapon Focus (brawling)", "Brawling"),
  "Weapon Focus (brawling)");
eq("A7 but a different pick is still appended",
  featDisplayName("Weapon Focus (Sword)", "Brawling"), "Weapon Focus (Sword) (Brawling)");
eq("A8 spacing around the pick is tidied", featDisplayName("Skill Focus", "  Sneak  "),
  "Skill Focus (Sneak)");
eq("A9 nothing at all is still nothing", featDisplayName("", "Brawling"), "");

/* ================================================================== *
 * B. WHERE THE PICK COMES FROM
 * ================================================================== */
// Asserted with a name that would parse to something ELSE, or the two
// readers agree and the check cannot tell which one answered.
eq("B1 the effect's own label is used when it has one",
  choiceFromEffectName("Skill Focus", { name: "Skill Focus: an older wording +2", label: "Sneak" }),
  "Sneak");
// THE FALLBACK IS WHAT MAKES THIS WORK WITHOUT A MIGRATION. Every
// chooser writes "<Feat>: <pick> +N", so a character who chose before
// 3.553.1 has the answer sitting in the effect's name.
eq("B2 and failing that it is recovered from the effect name",
  choiceFromEffectName("Weapon Focus", { name: "Weapon Focus: Brawling +1" }), "Brawling");
eq("B3 including the +2 form", choiceFromEffectName("Skill Focus", { name: "Skill Focus: Sneak +2" }),
  "Sneak");
eq("B4 a multi-word pick survives",
  choiceFromEffectName("Skill Focus", { name: "Skill Focus: Recall Knowledge +2" }),
  "Recall Knowledge");
eq("B5 an effect belonging to another feat is not read",
  choiceFromEffectName("Weapon Focus", { name: "Shadow Stance: Concealed" }), "");
eq("B6 nor is one with no pick in it at all",
  choiceFromEffectName("Weapon Focus", { name: "Weapon Focus" }), "");
eq("B7 an empty effect yields nothing", choiceFromEffectName("Weapon Focus", {}), "");
eq("B8 and so does a missing feat name", choiceFromEffectName("", { name: "X: Y +1" }), "");

/* ================================================================== *
 * C. THE CHOOSERS STILL WRITE WHAT B READS
 *
 * B2's fallback is a promise about a SHAPE, and a shape is only worth
 * parsing while the code that writes it still does. Asserted as whole
 * statements: the effect name AND the stamped label, for both feats.
 * ================================================================== */
{
  const fw = strip(read("module", "feats-workflow.mjs"));
  ok("C1 Weapon Focus names its effect in the shape the fallback reads",
    /name: `Weapon Focus: \$\{choice\} \+1`,/.test(fw));
  ok("C2 and stamps the pick as a label",
    /flags: \{ \[SYSTEM_ID\]: \{ weaponFocusGroup: choice, choiceLabel: choice \} \}/.test(fw));
  ok("C3 Skill Focus names its effect the same way",
    /name: `Skill Focus: \$\{action\.name\} \+2`,/.test(fw));
  ok("C4 and stamps the action's name, not its key",
    /flags: \{ \[SYSTEM_ID\]: \{ skillFocusAction: choice, choiceLabel: action\.name \} \}/.test(fw),
    "the flag stores 'sneak'; the sheet has to show 'Sneak'");
  // THE GATE IS REPEATABILITY, and nothing else. A feat taken once has
  // no second copy to be told apart from, so its row says only its name.
  ok("C5 only a REPEATABLE feat is labelled",
    /if \(!item \|\| item\.system\?\.repeatable !== true\) return "";/.test(fw),
    "a feat you take once needs no brackets — Graham's rule of 15 September 2026");
  ok("C5b a chooser whose answer is an ITEM is read from what it granted",
    /const granted = Array\.from\(actor\?\.items \?\? \[\]\)\s*\.filter\(\(i\) => i\.getFlag\?\.\(SYSTEM_ID, "grantedBy"\)\?\.sourceId === item\.id\);\s*if \(granted\.length === 1\) return String\(granted\[0\]\.name \?\? ""\)\.trim\(\);/
      .test(fw),
    "Specialist Spell buys a spell and writes no effect; one granted thing only, never a package");
  ok("C5a and a chooser that records elsewhere marks itself",
    /const own = String\(item\.getFlag\?\.\(SYSTEM_ID, "choiceLabel"\) \?\? ""\)\.trim\(\);\s*if \(own\) return own;/
      .test(fw),
    "Armour Focus writes its DR onto the ARMOUR, so it has no effect of its own to read");
  ok("C6 read from the effect this feat created, not from any effect",
    /if \(effect\.getFlag\?\.\(SYSTEM_ID, FEAT_SOURCE_FLAG\) !== item\.id\) continue;/.test(fw),
    "a second copy of the feat would otherwise show the first copy's group");
}

/* ================================================================== *
 * D. THE SHEET USES IT — AND ONLY THE SHEET
 * ================================================================== */
{
  const sheet = strip(read("module", "sheets", "actor-sheet.mjs"));
  ok("D1 the row's name is the display name",
    /name: featDisplayName\(item\.name, recordedFeatChoice\(this\.actor, item\)\),/.test(sheet),
    "a rule the sheet does not call is a rule the player never sees");
  ok("D2 there is exactly one place the row's name is built",
    (sheet.match(/name: featDisplayName\(/g) ?? []).length === 1);

  // THE ITEM ITSELF IS NEVER RENAMED. This is the half that would break
  // things quietly: Improved Critical and Weapon Specialisation both ask
  // for "the Weapon Focus group", grants match feats by name, and
  // `alreadyGrantedNames` dedupes on it.
  const fw = strip(read("module", "feats-workflow.mjs"));
  ok("D3 no chooser renames the feat document",
    !/item\.update\(\{\s*name:/.test(fw) && !/featItem\.update\(\{\s*name:/.test(fw),
    "the name is what every grant, prerequisite and duplicate test matches on");
  ok("D4 and the display rule is not used to build any stored name",
    !/featDisplayName/.test(fw),
    "feats-workflow writes documents; the display belongs to the sheet");
}

/* ================================================================== *
 * E. THE POPULATION, READ FROM THE PACK
 *
 * The rule is about repeatability, so the population is whatever the
 * pack says is repeatable — not a list kept here. What IS written down
 * is the verdict for each chooser that records a pick, so that a feat
 * changing its repeatability, or a new chooser arriving, fails rather
 * than quietly starting or stopping to show brackets.
 * ================================================================== */
{
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "feats"), {
    keyEncoding: "utf8", valueEncoding: "json"
  });
  await db.open();
  const feats = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.type === "feat") feats.push(value);
    }
  } finally { await db.close(); }
  ok("E1 the feats pack was read", feats.length > 300, `${feats.length} feats`);

  const repeatable = new Set(
    feats.filter((f) => f.system?.repeatable === true).map((f) => f.name.toLowerCase())
  );
  ok("E2 and it marks a meaningful number of feats repeatable",
    repeatable.size >= 10 && repeatable.size <= 40, `${repeatable.size} repeatable`);

  // THE PRINTED CLAUSE IS WHERE THE FLAG COMES FROM. Any feat whose text
  // says you may select it multiple times must carry it, or the brackets
  // it needs will never appear.
  const CLAIMS_REPEAT = /you may (?:select|take) this feat multiple times/i;
  const silent = feats
    .filter((f) => CLAIMS_REPEAT.test(String(f.system?.description ?? "")))
    .filter((f) => f.system?.repeatable !== true)
    .map((f) => f.name);
  eq("E3 every feat whose text says it repeats is flagged repeatable", silent, []);

  // The choosers that record a pick, and whether their row carries it.
  const SHOWS_ITS_PICK = {
    "weapon focus": true,
    "skill focus": true,
    "favoured terrain": true,
    "weapon proficient": true,
    "elemental spell": true,
    "artistic expertise": true,
    "armour focus": true,
    "specialist spell": true,
    "magical crafting": false,
    "flawless performance": false,
    "improved critical": false,
    "weapon specialisation": false,
    "signature spell": false,
    "alchemical crafting": false,
    "brew potion": false,
    "unusual weaponry": false,
    "adoptive race": false
  };
  const wrong = Object.entries(SHOWS_ITS_PICK)
    .filter(([name, shows]) => repeatable.has(name) !== shows)
    .map(([name, shows]) => `${name}: pack says repeatable=${repeatable.has(name)}, expected ${shows}`);
  eq("E4 each recorded verdict matches what the pack says", wrong, []);

  // The two that choose a weapon group and are NOT repeatable, named
  // because they are the ones that look as though they should be:
  // "Choose one weapon group for which you have already selected the
  // Weapon Focus feat", printed with no repeat clause.
  ok("E5 Improved Critical and Weapon Specialisation stay single-take",
    !repeatable.has("improved critical") && !repeatable.has("weapon specialisation"),
    "both choose a group; neither prints a repeat clause, so neither brackets it");

  // And every repeatable chooser that HAS a Use action stamps a label,
  // so its row shows the pick rather than the effect's whole sentence.
  const fw = strip(read("module", "feats-workflow.mjs"));
  // A STAMP THAT REPEATS THE STORED VALUE IS NOT ALWAYS A LABEL. Elemental
  // Spell stores its type lower-case because the cast dialog matches on it,
  // and the row read "Elemental Spell (fire)" live until it stamped the
  // option's own label instead.
  ok("E6a Elemental Spell shows the option's label, not the stored key",
    /choiceLabel: options\.find\(\(\[value\]\) => value === choice\)\?\.\[1\] \?\? choice/.test(fw),
    "the type is stored 'fire' and displayed 'Fire'");

  const unstamped = Object.entries(SHOWS_ITS_PICK)
    .filter(([, shows]) => shows)
    // Specialist Spell's answer is the spell it bought, read from the
    // grant itself — there is no effect to stamp.
    .filter(([name]) => name !== "specialist spell")
    .filter(([name]) => !new RegExp(`"${name}": \\{[\\s\\S]{0,4000}?choiceLabel`).test(fw))
    .map(([name]) => name);
  eq("E6 every repeatable chooser stamps the label its row shows", unstamped, []);
}

console.log(`verify-feat-choice-label: ${checks} checks`);
if (failures.length) {
  console.log(`\nverify-feat-choice-label: ${failures.length} FAILED`);
  for (const failure of failures) console.log(`  ${failure}`);
  process.exit(1);
}
console.log("verify-feat-choice-label: all pass");
