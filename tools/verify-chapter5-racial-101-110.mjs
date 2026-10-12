#!/usr/bin/env node
/**
 * verify-chapter5-racial-101-110 — block 10 of the page-by-page audit.
 *
 * Pages 101–109 are Chapter 5's 105 racial feats, A to Z; page 110 opens
 * the Archetype feats with the first eight. The data layer came through
 * clean — 105/105 present, categorised, race-tagged, prerequisites and
 * printed bonuses exact — so this file guards the three things the audit
 * actually changed, and one thing it had to retract.
 *
 * ───────────────────────────────────────────────────────────────────
 * THE RETRACTION IS PART OF THE FILE, DELIBERATELY.
 *
 * The block-10 report named five feats with "no automation of any kind".
 * Three of the five were wrong, and they were wrong because the report
 * was written from a detector invented for the occasion which counted
 * only two of the five routes automation arrives by:
 *
 *   Fast Healer      carries flags["trg-prime"].fastHealing: 1, read
 *                    every round by documents/combat.mjs
 *   Ambitious        feats.mjs featPickBonuses() — an extra class-feat pick
 *   Polyglot Savant  languages.mjs grants two from common/uncommon
 *
 * `tools/feat-evidence.mjs` — which knows all five routes and whose
 * header names Fast Healer as the canonical example of this exact
 * mistake — reports NOTHING: 0 across all 436 feats. Section Z below
 * holds those three to their real mechanisms, so the next detector
 * written in a hurry fails against the truth instead of replacing it.
 *
 * WHAT IS GUARDED HERE:
 *
 *   A  DRACORIS, and the `targetTypes` axis built for it. The fourth
 *      corner of the who-provokes / who-is-aimed-at × by-category /
 *      by-uuid matrix — see module/conditionals.mjs. Most of the axis's
 *      own behaviour is checked in verify-conditionals; this section
 *      checks the RULE: the two authored rows, on the four skills
 *      Graham named, and the fallback standing down.
 *   B  HULKING FORM, and the fact that the spell it names does not exist.
 *   C  ASCENDAN SCHOLAR, the one real defect of the five.
 *   H  THE HERITAGE FEATS — Beastman and the three half-races, and the
 *      chain that opens their lineages. Added at 3.567.3 after I reported
 *      a missing Beastman race that was never supposed to exist.
 *   D  The errata, still printed in 3.8.1.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { matchesCheck, normaliseConditional, SCOPE_AXES } from "../module/conditionals.mjs";
import {
  hulkingFormSize, hulkingFormChange, hulkingFormNote, hasHulkingForm,
  hulkingFormEffectData, HULKING_FORM_SECONDS
} from "../module/hulking-form.mjs";
import { featPickBonuses, effectiveRaces } from "../module/feats.mjs";
import { LANGUAGE_FEAT_GRANTS, languageAllowance } from "../module/languages.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const src = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");

/** Every item and effect document in a pack, by name. */
async function readPack(name) {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const items = new Map();
  const effectsByItem = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) {
        items.set(String(value?.name ?? "").trim().toLowerCase(), { id: key.slice(7), value });
      } else if (key.startsWith("!items.effects!")) {
        const itemId = key.slice("!items.effects!".length).split(".")[0];
        if (!effectsByItem.has(itemId)) effectsByItem.set(itemId, []);
        effectsByItem.get(itemId).push(value);
      }
    }
  } finally { await db.close(); }
  return { items, effectsByItem };
}

const feats = await readPack("feats");
const spells = await readPack("spells");

/* ================================================================== *
 * A. DRACORIS — "+1 racial bonus to all interactions with creatures of
 *    the Wyrm type", and the axis that had to exist first.
 *
 * THE AXIS IS THE FINDING. Authored on `sourceTypes` — the only type
 * axis there was — the rule would have fired when a Wyrm attacked the
 * Dracoris and never when the Dracoris spoke to one. That is not a bonus
 * that fails to appear; it is a bonus that appears in the wrong half of
 * the game, which nobody questions because it appears.
 * ================================================================== */

ok("A0 the axis exists at all", SCOPE_AXES.includes("targetTypes"),
  "without it the rule below can only be authored wrong");

const dracoris = feats.items.get("dracoris");
ok("A1 Dracoris is in the pack", Boolean(dracoris));

const authored = dracoris?.value?.flags?.["trg-prime"]?.conditionals ?? [];
equal("A2 it carries exactly two conditional rows", authored.length, 2);

const rows = authored.map((raw, i) => normaliseConditional(raw, { id: "dracoris", name: "Dracoris" }, i));
ok("A3 both rows survive normalisation", rows.every(Boolean),
  "a malformed row is dropped silently at runtime — the harness is where it must be loud");

const [exact, fallback] = rows;

// THE FOUR SKILLS GRAHAM NAMED, and no fifth. "All interactions" was the
// audit's question precisely because it names no check type; the ruling
// of 17 September 2026 fixed it to the social four, and a fifth skill
// creeping in later would be this file's business to refuse.
const SOCIAL = ["deception", "diplomacy", "intimidate", "sensemotive"];
equal("A4 the exact row names the four social skills",
  JSON.stringify([...(exact?.when?.subjects ?? [])].sort()), JSON.stringify([...SOCIAL].sort()));
equal("A5 and it is scoped to Wyrms", JSON.stringify(exact?.when?.targetTypes), JSON.stringify(["wyrm"]));
equal("A6 and it is a +1 race bonus", `${exact?.value}/${exact?.type}`, "1/race");
ok("A7 the exact row is automatic", exact?.auto === true,
  "targeting a Wyrm settles the whole scope — nothing is left for the player to judge");

const social = (targetTypes) => ({ checkType: "skill", subject: "diplomacy", targetTypes });

ok("A8 it applies to Diplomacy against a Wyrm", matchesCheck(exact, social(["wyrm"])) === true);
ok("A9 and to Sense Motive against a Wyrm",
  matchesCheck(exact, { checkType: "skill", subject: "senseMotive", targetTypes: ["wyrm"] }) === true);
ok("A10 and not to Athletics against a Wyrm",
  matchesCheck(exact, { checkType: "skill", subject: "athletics", targetTypes: ["wyrm"] }) === false);
ok("A11 and not to Diplomacy against a Humanoid", matchesCheck(exact, social(["humanoid"])) === false);
// THE MIRROR TEST. This is the defect the axis exists to prevent, stated
// as a check rather than as a comment.
ok("A12 and not to a save against a Wyrm's attack",
  matchesCheck(exact, { checkType: "save", subject: "fortitude", sourceTypes: ["wyrm"] }) === false,
  "being attacked by a Wyrm is not interacting with one");

// THE FALLBACK ROW, and the only thing that matters about it: that it
// cannot be taken alongside the exact row. Fire-Like Blood's shape.
ok("A13 the fallback is offered, not applied", fallback?.auto === false);
ok("A14 it appears on an untargeted social check",
  matchesCheck(fallback, { checkType: "skill", subject: "diplomacy" }) === true,
  "a Diplomacy roll from the sheet knows no target, and the bonus is still the player's");
ok("A15 and stands down the moment the roll knows its target",
  matchesCheck(fallback, social(["wyrm"])) === false
  && matchesCheck(fallback, social(["humanoid"])) === false,
  "both rows at once would let the +1 be taken twice");
ok("A16 the two rows never both match",
  [social(["wyrm"]), social(["humanoid"]), { checkType: "skill", subject: "diplomacy" }]
    .every((ctx) => !(matchesCheck(exact, ctx) && matchesCheck(fallback, ctx))));

// AND THE NOTE EFFECT NO LONGER LIES. It told the player to "queue via
// the Use button"; Dracoris has no Use handler and never had one.
const dracorisEffects = feats.effectsByItem.get(dracoris?.id) ?? [];
const affinity = dracorisEffects.find((e) => /wyrm affinity/i.test(String(e?.name ?? "")));
ok("A17 the Wyrm affinity note is still on the sheet", Boolean(affinity));
ok("A18 and no longer points at a button that does not exist",
  !/use button/i.test(String(affinity?.description ?? "")),
  "an instruction to press a control that does nothing is worse than silence");
ok("A19 the DR half still rides its own effect",
  dracorisEffects.some((e) => (e?.changes ?? []).some((c) => c.key === "system.combat.dr.race" && String(c.value) === "1")),
  "the half that always worked must not be lost to the half that did not");

// THE AXIS MUST BE FILLED BY THE WORKFLOW THAT KNOWS THE TARGET.
// verify-conditionals proves both CONTEXTS carry the key; this proves
// somebody upstream actually puts a creature type in it.
const actionSrc = src("module", "combat", "action-workflow.mjs");
const attackSrc = src("module", "combat", "attack-workflow.mjs");
ok("A20 the action workflow fills it from the target",
  /targetTypes: creatureTypesOf\(targetActor\?\.system \?\? \{\}\)/.test(actionSrc),
  "an axis nothing fills is read on every roll and matches on none");
ok("A21 on BOTH the dialog and the roll",
  (actionSrc.match(/targetTypes: creatureTypesOf\(targetActor\?\.system \?\? \{\}\)/g) ?? []).length === 2,
  "the dialog sets conditionalsResolved, so filling only the roll works only when Shift is held");
ok("A22 and the attack workflow fills it too",
  /targetTypes: creatureTypesOf\(targetActor\?\.system \?\? \{\}\)/.test(attackSrc),
  "the type axes are a pair; leaving one path unfilled is how sourceUuids died");

/* ================================================================== *
 * B. HULKING FORM — and the spell that is not there.
 *
 * "While in your hybrid form, you gain the effects of the Enlarge
 * spell." Graham ruled the full spell. Building that ruling meant first
 * discovering that TRG Prime has no Enlarge spell in the book or the
 * pack — the word appears twice in 3.8.1 and both are this feat.
 * ================================================================== */

ok("B1 there is still no spell called Enlarge", !spells.items.has("enlarge"),
  "if one is ever written, this module should reference it instead of standing in for it");
ok("B2 Size Alteration is the spell it describes", spells.items.has("size alteration"));

// ERRATUM E4, RULED (Graham, 17 September 2026: "E4 should be Size
// Alteration"). The feat must now name a spell a player can actually
// look up. Both halves are checked, because correcting a name by
// deleting it would satisfy either one alone.
{
  const printed = String(feats.items.get("hulking form")?.value?.system?.description ?? "");
  ok("B1b the feat no longer cites a spell that does not exist",
    !/\bEnlarge\b/.test(printed),
    "it pointed the player at a pack entry that has never existed");
  ok("B1c and names the one it actually describes",
    /\bSize Alteration\b/.test(printed));
  // THE CLAUSE THE CODE IS BUILT FROM. 3.567.1 corrected the spell's NAME
  // the moment E4 was ruled, then Graham supplied the full corrected
  // sentence — and the pack kept the narrow fix, so it named the right
  // spell and dropped "(at base PP cost for 10 minutes)": the half that
  // gives the effect its duration. Live testing found that; nothing
  // checked it. These two are what check it.
  ok("B1d and carries the duration the module implements",
    /10 minutes/.test(printed),
    "a printed rule the code obeys but the text does not state is a rule nobody can look up");
  ok("B1e and the PP clause Graham's ruling turns on",
    /base PP cost/i.test(printed),
    "'at base PP cost' is what makes the effect free — dropping it loses the reason");
}
const sizeAlteration = String(spells.items.get("size alteration")?.value?.system?.description ?? "");
ok("B3 whose printed text is one step, all modifiers, nothing at Large",
  /increases in size by one step/i.test(sizeAlteration)
  && /all modifiers to size/i.test(sizeAlteration)
  && /no effect on a Large or larger creature/i.test(sizeAlteration),
  "the three clauses the module implements — if the spell is rewritten, this must be re-read");

equal("B4 a Medium Beastman becomes Large", hulkingFormSize("medium"), "large");
equal("B5 a Small one becomes Medium", hulkingFormSize("small"), "medium");
// THE SPELL'S OWN EXCEPTION, carried across with it rather than dropped
// because a Beastman is never Large in practice. A rule implemented only
// where it happens to matter is a rule waiting for the day it does.
equal("B6 a Large creature gains nothing", hulkingFormSize("large"), null);
equal("B7 nor a Huge one", hulkingFormSize("huge"), null);
equal("B8 nor a Colossal one", hulkingFormSize("colossal"), null);
// LESSON 18: an unrecognised name is refused, never coerced to Medium
// and grown — which would silently make a typo into a Large character.
equal("B9 an unknown size is refused rather than guessed", hulkingFormSize("enormous"), null);
equal("B10 and so is a blank one", hulkingFormSize(""), null);

const change = hulkingFormChange("medium");
equal("B11 the change targets the one field everything derives from",
  change?.key, "system.identity.size");
equal("B12 by override", change?.type, "override");
// A RACE SETS THE SAME FIELD BY OVERRIDE AT PRIORITY 10. Equal priority
// would make the winner depend on application order, which is a coin
// toss that passes in testing and fails at a table.
ok("B13 at a priority that beats the race's", Number(change?.priority) > 10,
  `race effects write this field at priority 10; this is ${change?.priority}`);
equal("B14 no change at all when the spell would do nothing", hulkingFormChange("large"), null);
ok("B15 the card names the size rather than announcing success",
  /large/.test(hulkingFormNote("medium")) && /reach/i.test(hulkingFormNote("medium")));
ok("B16 and says so plainly when it does nothing", /no effect at Large/i.test(hulkingFormNote("large")));
ok("B17 the feat is recognised by name", hasHulkingForm(["Sudden Form", "Hulking Form"]) === true
  && hasHulkingForm(["Sudden Form"]) === false
  && hasHulkingForm([]) === false);

/* ---- THE TEN MINUTES (3.567.1) ----------------------------------- *
 * The corrected wording gave the clause a duration the hybrid form does
 * not have. A clock nothing acts on is the defect to guard against here:
 * a size step that never expires is a permanently Large character, and
 * nobody reports a bonus they still have.
 * ------------------------------------------------------------------ */

const effectData = hulkingFormEffectData("medium", { worldTime: 1000, systemId: "trg-prime" });
equal("B22 the effect carries the printed ten minutes", HULKING_FORM_SECONDS, 600);
equal("B23 as a Foundry duration the player can see",
  Number(effectData?.duration?.seconds), HULKING_FORM_SECONDS);
// BOTH CLOCKS, because the one Foundry SHOWS and the one the system ACTS
// on are different fields, and a visible clock that expires nothing is
// the worse half to be missing.
equal("B24 and as the end-time the world-clock sweep reads",
  Number(effectData?.flags?.["trg-prime"]?.spellEffectEnd), 1000 + HULKING_FORM_SECONDS);
ok("B25 flagged as a timed effect at all", effectData?.flags?.["trg-prime"]?.spellEffect === true,
  "expireSpellEffects skips anything without this flag, so the end time alone expires nothing");
ok("B26 the duration starts when the form is assumed",
  Number(hulkingFormEffectData("medium", { worldTime: 9999, systemId: "trg-prime" })
    ?.flags?.["trg-prime"]?.spellEffectEnd) === 9999 + HULKING_FORM_SECONDS,
  "a start time baked in at module load would expire the moment it was granted");
equal("B27 and no effect at all where nothing grows",
  hulkingFormEffectData("large", { systemId: "trg-prime" }), null);
ok("B28 the effect says what it costs, because the book names a PP cost",
  /No Power Points are spent/i.test(String(effectData?.description ?? ""))
  && /No PP is spent/i.test(hulkingFormNote("medium")),
  "Graham's ruling: 'at base PP cost' names which version of the spell, not a charge");
ok("B29 and the card names the ten minutes",
  /10 minutes/.test(hulkingFormNote("medium")),
  "the form has no duration and this does — 'while you're a beast' is the natural wrong guess");
// THE SWEEP MUST ACTUALLY READ THESE TWO FIELDS. Checking the module
// writes them proves nothing about whether anything is listening.
{
  const sweepSrc = src("module", "combat", "effect-application-workflow.mjs");
  ok("B30 something expires effects flagged this way",
    /export async function expireSpellEffects/.test(sweepSrc)
    && /getFlag\?\.\(SYSTEM_ID, SPELL_EFFECT_FLAG\)/.test(sweepSrc)
    && /getFlag\(SYSTEM_ID, SPELL_END_FLAG\)/.test(sweepSrc),
    "a clock nobody reads is a duration in the description and nowhere else");
}

// WIRED INTO THE SHIFT, and — the part that matters — removed by it.
const featsSrc = src("module", "feats-workflow.mjs");
ok("B18 the shift builds the timed effect",
  /const hulking = hulkingHeld\s*\?\s*hulkingFormEffectData\(currentSize, \{/.test(featsSrc));
ok("B18b from the live world clock, not a constant",
  /worldTime: Number\(game\.time\?\.worldTime \?\? 0\)/.test(featsSrc));
// TWO EFFECTS NOW, AND THE FLAG IS WHAT BINDS THEM. The 3.567.0 design
// put the size change on the Hybrid Form effect so one deletion covered
// both; two deadlines cannot share one effect, so the guarantee moved to
// the source flag. If this line goes, the growth outlives the form.
ok("B19 stamped with the form's own source flag",
  /hulking\.flags\[SYSTEM_ID\]\[FEAT_SOURCE_FLAG\] = item\.id;/.test(featsSrc),
  "the revert deletes by that flag; without it a permanently Large Beastman");
ok("B19b and created AFTER the form's effect, not before",
  featsSrc.indexOf('name: "Hybrid Form"')
    < featsSrc.indexOf("hulking.flags[SYSTEM_ID][FEAT_SOURCE_FLAG] = item.id;"),
  "replaceFeatEffect clears every effect carrying that flag before writing its own");
// AND THE REVERT TAKES IT AWAY. This is the failure that matters: a
// size step which outlives the form is a permanently Large character,
// and nobody reports a bonus they still have.
{
  const at = featsSrc.indexOf('"hybrid transformation":');
  const revertAt = featsSrc.indexOf("if (inForm) {", at);
  // FROM the branch, not from the handler: an earlier `return;` guards
  // the AP cost, and slicing to it would hand this check an empty string
  // — which reads as a clean failure and is really a broken scan.
  const revert = featsSrc.slice(revertAt, featsSrc.indexOf("return;", revertAt));
  ok("B20a the revert branch was found", revertAt > at && revert.length > 100);
  ok("B20 returning to humanoid form deletes the feat's effects",
    /deleteEmbeddedDocuments\("ActiveEffect", stale\)/.test(revert),
    "the size effect carries the same flag, so this is what removes it early");
  ok("B20c and it sweeps by flag rather than by name",
    /getFlag\?\.\(SYSTEM_ID, FEAT_SOURCE_FLAG\) === item\.id/.test(revert),
    "a sweep by name would take the form's effect and leave the growth");
  // READ BEFORE THE EFFECT EXISTS, or a second shift would step up from
  // a size this feat granted a moment ago.
  const sizeReadAt = featsSrc.indexOf("const currentSize = actor.system?.identity?.size;");
  const formBuiltAt = featsSrc.indexOf('name: "Hybrid Form"');
  ok("B20b and the size is read before the effect is built",
    sizeReadAt >= 0 && formBuiltAt >= 0 && sizeReadAt < formBuiltAt,
    "an absent anchor is a failure here, not a pass — -1 is smaller than everything");
}
{
  const note = (feats.effectsByItem.get(feats.items.get("hulking form")?.id) ?? [])
    .map((e) => String(e?.description ?? "")).join(" ");
  ok("B21 the feat's own note effect no longer tells the player to do it by hand",
    !/Universal Modifier/i.test(note));
  // AND IT KEEPS UP WITH THE RULE. The note was written when the growth
  // lasted as long as the form did; it said so, and went on saying so
  // after 3.567.1 gave it ten minutes — true but no longer the whole
  // truth, and the half it omitted is the one that ends the effect while
  // the player is still a beast.
  ok("B21b and states the ten minutes", /10 minutes/.test(note),
    "the sheet is where a player checks a duration they have forgotten");
  ok("B21c and that nothing is paid for it", /No Power Points are spent/i.test(note));
}
// R2's SECOND HALF, RULED: "R2 Stacking." The bite, the natural DR and
// the size step are all live at once. Separate effects is HOW they end
// separately; it must not become how one replaces another.
ok("B31 the form keeps its own natural-armour change",
  /key: "system\.combat\.naturalArmourBase\.natural"/.test(featsSrc),
  "the size step stacks with the form's own contribution — it does not replace it");

/* ================================================================== *
 * C. ASCENDAN SCHOLAR — the one real defect of the five.
 *
 * Seven feats print a bonus to "your racial specialist skill(s)" on top
 * of their ordinary skill bonuses. Six called `specialistSkillBonus`.
 * This one was missed, and it survived because everything around it
 * looked right.
 * ================================================================== */

const SCHOLARS = [
  "cultural", "dwarven scholar", "elven scholar", "halfling scholar",
  "kornargon scholar", "orc scholar", "ascendan scholar"
];
for (const name of SCHOLARS) {
  ok(`C1 ${name} has a Use handler`,
    new RegExp(`"${name}":\\s*\\{`).test(featsSrc),
    "the family is only consistent if every member is in it");
}
ok("C2 Ascendan Scholar calls the shared mechanism",
  /"ascendan scholar":[\s\S]{0,400}?specialistSkillBonus\(actor, item, \{ title: "Ascendan Scholar", value: 1 \}\)/
    .test(featsSrc),
  "a seventh private copy of the bonus is how the six drift apart");
// ITS VALUE IS THE ODD ONE, and that is printed, not a slip: Ascendan
// Scholar gives +1 where the others give +2. Pinned so that "making it
// consistent" is a decision somebody has to take deliberately.
ok("C3 its specialist bonus is +1, as printed",
  /title: "Ascendan Scholar", value: 1/.test(featsSrc));
ok("C4 while Elven Scholar's is +2 — the values are not interchangeable",
  /title: "Elven Scholar", value: 2/.test(featsSrc));

/* ================================================================== *
 * Z. THE RETRACTION — the three feats the block-10 report got wrong.
 *
 * Each already worked. Each is pinned to the mechanism it actually uses,
 * so the claim "this feat does nothing" has to get past a check that
 * knows where to look.
 * ================================================================== */

const fastHealer = feats.effectsByItem.get(feats.items.get("fast healer")?.id) ?? [];
ok("Z1 Fast Healer carries the engine's fastHealing flag",
  fastHealer.some((e) => Number(e?.flags?.["trg-prime"]?.fastHealing) === 1),
  "reported as unimplemented; it was the flag route, which the ad-hoc detector did not count");
// THE READ, not the word. combat.mjs mentions fastHealing in three
// comments; a check satisfied by prose would pass on a file that had
// stopped healing anybody — which is the shape of the error this whole
// section exists to record.
/*
 * RE-ANCHORED AT 3.591.0, AND STILL THE READ RATHER THAN THE WORD. Phase
 * 1 now sums TWO rates through one parameterised helper, because
 * Regeneration healed injuries and no hit points until this release. So
 * the literal `getFlag?.(SYSTEM_ID, "fastHealing")` is gone and the read
 * happens through `flag`. Both halves are asserted and LINKED: the
 * helper must read the flag it is handed, and Fast Healer's rate must be
 * one of the rates handed to it. Either alone would pass on a file that
 * had stopped healing anybody.
 */
{
  const turn = src("module", "documents", "combat.mjs");
  ok("Z2 and the turn actually reads the flag every round",
    /const healingRate = \(flag\) =>[\s\S]{0,240}?getFlag\?\.\(SYSTEM_ID, flag\)/.test(turn)
      && /healingRate\("fastHealing"\)/.test(turn),
    "a flag nobody reads would have made the report right for the wrong reason");
  ok("Z2b and the sum it feeds is the one the heal uses",
    /const fastHealing = fastHealingRate \+ regenerationRate;/.test(turn)
      && /if \(fastHealing > 0\) \{/.test(turn),
    "3.591.0: the regeneration rate was read, named, and left out of the heal for one release");
}

// RUN, NOT READ. The table is one thing; the function the sheet's feat
// budget actually calls is another, and only the second can be worth a
// pick. R3's answer — "sit on the sheet as an unspent class-feat pick
// until used" — is exactly what an extra pick in this budget IS.
{
  const without = featPickBonuses([]);
  const with1 = featPickBonuses(["Ambitious"]);
  equal("Z3 Ambitious grants one extra class-feat pick",
    Number(with1.class) - Number(without.class), 1);
  ok("Z4 and nothing else moves with it",
    with1.racial === without.racial && with1.general === without.general,
    "a racial feat that quietly paid for a general pick would be a different rule");
  ok("Z4b the name is matched case-insensitively, as an item name arrives",
    Number(featPickBonuses(["ambitious"]).class) === 1);
}

equal("Z5 Polyglot Savant grants two languages",
  Number(LANGUAGE_FEAT_GRANTS?.["polyglot savant"]?.count), 2);
equal("Z6 from common and uncommon",
  JSON.stringify(LANGUAGE_FEAT_GRANTS?.["polyglot savant"]?.from), JSON.stringify(["common", "uncommon"]));
// AND THE ALLOWANCE ACTUALLY COUNTS THEM. A table nobody reads would
// have made the report right for the wrong reason — the Z2 guard again,
// and the reason this is run rather than grepped.
{
  const without = languageAllowance({ featureNames: [], linguisticsRanks: 0 });
  const with2 = languageAllowance({ featureNames: ["Polyglot Savant"], linguisticsRanks: 0 });
  equal("Z7 holding the feat is worth two more languages",
    Number(with2.total) - Number(without.total), 2);
  ok("Z8 and the allowance says where they came from",
    (with2.sources ?? []).some((s) => /polyglot savant/i.test(String(s.label ?? ""))),
    "a budget that grows without saying why is a number the player cannot check");
}

/* ================================================================== *
 * H. THE HERITAGE FEATS — the half of the trait line the audit read past.
 *
 * Four feats in this block print their trait line as "HERITAGE HUMAN":
 * Beastman, Half-Elf, Half-Ogre, Half-Orc. The block-10 audit checked
 * that `sourceRace` matched the printed race and reported 105/105 — and
 * for these four that test reads "Human", passes, and never looks at the
 * word in front of it.
 *
 * THAT IS HOW I CAME TO REPORT, in the 3.567.1 live-testing notes, that
 * there was "no Beastman race item... presumably yet to be built". There
 * is no Beastman RACE because Beastman is a HERITAGE FEAT, which is what
 * Graham said when he read it, and the whole mechanism was already here:
 *
 *   system.traits: "Heritage"      read by sheets/actor-sheet.mjs to
 *                                  collect a character's heritage feats
 *   HERITAGE_RACE_GRANTS           feats.mjs — which lineages each opens
 *   effectiveRaces()               birth race + those grants, which is
 *                                  what the picker gates racial feats on
 *
 * So a Human holding Beastman can take Hulking Form. Nothing was missing.
 * This section exists because I checked the races pack, found no Beastman,
 * and published the absence as a finding without asking what kind of thing
 * Beastman is — the fourth time in this cycle that my own instrument
 * produced something that read exactly like a defect.
 * ================================================================== */

const HERITAGE_FEATS = ["beastman", "half-elf", "half-ogre", "half-orc"];

for (const name of HERITAGE_FEATS) {
  const doc = feats.items.get(name)?.value;
  ok(`H1 ${name} is in the feats pack`, Boolean(doc),
    "it is a feat, not a race — the races pack is the wrong place to look");
  // THE TRAIT IS THE MECHANISM, not a label. The sheet collects heritage
  // feats by testing this field; a feat that loses it stops opening its
  // lineage and the player simply cannot see the feats they have bought.
  ok(`H2 ${name} carries the Heritage trait`,
    /\bheritage\b/i.test(String(doc?.system?.traits ?? "")),
    "sheets/actor-sheet.mjs collects heritage feats by testing system.traits");
  equal(`H3 ${name} is a Human heritage, as printed`,
    String(doc?.system?.sourceRace ?? ""), "Human");
  // THROUGH THE MECHANISM, NOT THE TABLE. Reading HERITAGE_RACE_GRANTS
  // here would prove the row exists and nothing about it being reachable
  // — and it would make this harness the only thing that names that
  // constant, which is the uncalled-export ratchet's whole complaint.
  // Asking effectiveRaces is the same question put to the code that
  // answers it in play.
  ok(`H4 ${name} opens at least one lineage beyond the birth race`,
    effectiveRaces("Human", [doc?.name ?? name]).split(",").length > 1,
    "a heritage feat that grants no lineage is a feat nobody can build on");
}

// THE CHAIN, RUN RATHER THAN READ. Three separate pieces have to agree —
// the trait on the feat, the grants table, and effectiveRaces — and each
// of them being present proves nothing about the three meeting.
equal("H5 a plain Human is only a Human", effectiveRaces("Human", []), "Human");
equal("H6 Beastman opens the Beastman lineage",
  effectiveRaces("Human", ["Beastman"]), "Human, Beastman");
// HALF-ORC OPENS TWO, and that asymmetry is the point of the table: the
// half-races open the parent lineage as well as their own, and Beastman
// opens only its own because there is no Beastman race to inherit from.
equal("H7 Half-Orc opens both its own and the Orc lineage",
  effectiveRaces("Human", ["Half-Orc"]), "Human, Half-Orc, Orc");
ok("H8 and the four combine without losing any",
  ["Beastman", "Half-Elf", "Elf", "Half-Ogre", "Half-Orc", "Orc"].every(
    (r) => effectiveRaces("Human", HERITAGE_FEATS.map((n) => n.replace(/(^|-)(\w)/g, (m) => m.toUpperCase())))
      .includes(r)),
  "a character may hold more than one, and each must still open what it opens");

// AND THE FEATS THEY OPEN ARE REALLY THERE. Hulking Form is the one this
// release built; if its sourceRace ever stopped matching what Beastman
// grants, the feat would be unreachable and nothing else would say so.
equal("H9 Hulking Form is a Beastman feat",
  String(feats.items.get("hulking form")?.value?.system?.sourceRace ?? ""), "Beastman");
ok("H10 which is exactly what the Beastman heritage opens",
  effectiveRaces("Human", ["Beastman"]).includes(
    String(feats.items.get("hulking form")?.value?.system?.sourceRace ?? "")),
  "a lineage nobody can reach is a feat nobody can take");

// H11 IS A REDUNDANCY, WRITTEN DOWN SO IT IS NOT MISTAKEN FOR A BUG.
// `effectiveRaces` pushes the feat's OWN NAME before it consults the
// grants table, so a heritage whose lineage is spelled the same as the
// feat is opened twice over: `beastman: ["Beastman"]` is belt and braces.
// Found by a mutation that emptied that row and changed nothing — which
// looked like a hole in the harness and is really a second guarantee.
// Kept rather than tidied away: the day the feat is renamed and the
// lineage is not, the table is what still holds.
ok("H11 a self-named heritage is opened by the feat's name alone",
  effectiveRaces("Human", ["Beastman"]).includes("Beastman"),
  "the mechanism, not the table, is the load-bearing half for these");
ok("H12 while a PARENT lineage exists only in the table",
  effectiveRaces("Human", ["Half-Orc"]).includes("Orc")
  && !["Half-Elf", "Half-Ogre"].some((n) => effectiveRaces("Human", [n]).includes("Orc")),
  "Orc is reachable from Half-Orc and from nothing else — that row does real work");

/* ================================================================== *
 * D. Errata — still printed in 3.8.1, so still worth reporting.
 * ================================================================== */

const monstrous = String(feats.items.get("monstrous vision")?.value?.system?.sourceRace ?? "");
ok("D1 the pack hyphenates Half-Orc even though page 106 does not",
  /Half-Orc/.test(monstrous),
  `sourceRace is "${monstrous}" — E1 is a book erratum, and the pack must not be "corrected" to match it`);

if (failures.length) {
  process.stderr.write(`\nverify-chapter5-racial-101-110: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter5-racial-101-110: OK — ${checks} checks.\n`);
