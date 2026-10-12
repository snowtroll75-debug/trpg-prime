#!/usr/bin/env node
/**
 * verify-pp2-bonuses — twelve PP 2 spells that granted nothing.
 *
 * NEW at 3.504.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ALL TWELVE CARRIED `effects: []`. Between them they print bonuses to
 * jumping, tumbling, searching, tracking, hiding, sneaking, noticing,
 * recalling, disguising, surviving, defending, and three one-shot
 * bonuses spent on the next check.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NO NEW MACHINERY, AND THAT WAS MEASURED RATHER THAN HOPED FOR.
 *
 * The ruling was "build scoped skill-action bonuses". They were already
 * built, in four pieces nobody had joined:
 *
 *   the check carries `actionKey`      populated from `action.key` at
 *                                      five sites in action-workflow
 *   97 declared skill actions          module/data/skill-actions.mjs
 *   `matchesCheck` reads `actionKey`   one of its eight axes
 *   a MODIFIER conditional has `value` conditionals.mjs
 *
 * SECTION W IS THE ONE THING THAT DID HAVE TO BE BUILT, and it is here
 * because of a defect this release nearly shipped: `grantsFor` reads
 * `extraConditionals` and nothing else, so a conditional's NUMBER could
 * not be warped. Five of these spells sell "+1 to the bonus" as warps
 * that were ALREADY LIVE on `bonusValue` — authoring them as conditionals
 * without `warpedGrants` would have made five working warps inert. That
 * is the 3.499.1 phantom-key defect from the other direction, in a
 * release whose whole point is making spells do what they print.
 *
 * SECTION S IS THE RULING WITH TEETH: a scope that names an ACTION must
 * not become a bonus to the whole skill. Jump raises High Jump, not
 * Climb.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { normaliseSpellConditional, warpedGrants, grantsFor, conditionalLine, conditionalRemainderLine } from "../module/magic/spell-conditional.mjs";
import { normaliseConditional, matchesCheck, AXIS_CONTEXT_KEYS } from "../module/conditionals.mjs";
import { warpedBonusValue } from "../module/magic/spell-warp.mjs";
import { SKILL_ACTION_KEYS } from "./lib/skill-action-keys.mjs";
import { normaliseHeldBonus, heldBonusMatches, heldBonusCastLine } from "../module/magic/held-bonus.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

const SCOPED = {
  "Jump": ["highJump", "longJump"],
  "Light Feet": ["highJump", "longJump", "tumble"],
  "Spot": ["search", "track"],
  "Concealing Terrain": ["hide", "sneak"],
  "Dareveil": ["makeAnImpression"],
  "Heightened Awareness": ["awareness", "recallKnowledge"]
};
/*
 * SELF MIRAGE LEFT THIS LIST AT 3.506.0, and it is the most instructive
 * of the twelve.
 *
 * It shipped here scoped to the `disguise` action and was INERT TWICE
 * OVER. `disguise` is one of only two of the 97 declared skill actions
 * carrying `checkType: "none"` — no check object is built for those, so
 * no `actionKey` ever reaches `matchesCheck`, and the bonus hung on a
 * roll that does not happen. And it was on the wrong side of the roll
 * regardless: the printed +4 covers "Deception checks to prevent others
 * from seeing through your disguise", which the disguised character
 * never rolls. Pierce Disguise is the OBSERVER's Sense Motive check,
 * resolved against the disguised character's Deception DC.
 *
 * Every check in section P passed on it. They asked whether the row was
 * scoped to the actions it named — and it was, to an action that is not
 * a check.
 *
 * Graham's ruling of 6 Sep 2026 moved it to the DC side, through the
 * channel `defence-dc.mjs` was built for. `verify-action-degrees` owns
 * it now, and asserts both what it does and what it must not do.
 */
const SLOTTED = { "Hunters Spirit": "survival", "Anticipate Attack": "defence" };
const HELD = ["Prescience", "Divine Grace", "Spirit Lore"];

const found = new Map();
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
try {
  await db.open();
  for await (const [, v] of db.iterator()) {
    if (v?.type !== "spell") continue;
    found.set(v.name, v);
  }
} finally {
  await db.close().catch(() => {});
}

for (const [name, actions] of Object.entries(SCOPED)) {
  const row = (found.get(name)?.system?.effects ?? []).find((e) => e.kind === "conditional");
  ok(`P:${name} declares a conditional`, Boolean(row));
  const grant = row?.grants?.[0];
  equal(`P:${name} grants a modifier`, grant?.kind, "modifier",
    "an advantage grant has no number, and these spells print one");
  ok(`P:${name} is scoped to its printed actions`,
    JSON.stringify(grant?.when?.actions ?? []) === JSON.stringify(actions),
    `got ${JSON.stringify(grant?.when?.actions)}`);
  // THE RULING WITH TEETH. A scope that named a SKILL instead of actions
  // would silently widen the spell.
  ok(`P:${name} names no whole skill`, grant?.when?.subjects === undefined,
    "a `subjects` axis would raise every use of the skill, which is what scoping refuses");
  ok(`P:${name} applies without asking`, grant?.auto === true,
    "a High Jump is a High Jump — there is no reading decision to put to the player");
}

for (const [name, slot] of Object.entries(SLOTTED)) {
  const row = (found.get(name)?.system?.effects ?? []).find((e) => e.kind === "bonus");
  equal(`P:${name} takes the ${slot} slot`, row?.slot, slot,
    "the printed text covers the whole skill or defence, so scoping would grant LESS than the book");
  ok(`P:${name} carries a value`, Number(row?.value) > 0);
  // A BONUS ROW'S `note` IS A BRACKETED QUALIFIER, not a label. Both of
  // these first shipped carrying the spell's own name, which the effect
  // name builder would have printed a second time — caught by
  // `verify-spell-narration` E2, and asserted here at the source.
  ok(`P:${name} carries no note, or a bracketed one`,
    !row?.note || /^\(.*\)$/.test(String(row.note)),
    `note: ${JSON.stringify(row?.note)}`);
}
// P: HUNTERS SPIRIT'S SECOND HALF is a note, per the ruling — there is no
// travel-pace machinery for "you do not move at half speed" to hook.
ok("P:Hunters Spirit names the travel clause for the GM",
  (found.get("Hunters Spirit")?.system?.effects ?? [])
    .some((e) => e.kind === "note" && /half speed/i.test(String(e.text ?? ""))));

/*
 * P:HELD — AND THIS IS WHERE I ASSERTED A FIELD OF MY OWN INVENTION.
 *
 * The first version of this loop read `row.scope.length > 8` and passed
 * on all three. `normaliseHeldBonus` has never read a `scope` field: it
 * requires `checkTypes`, refuses a held bonus that names none, and
 * returned NULL for all three rows — they would have applied and then
 * offered no button at all, the same defect `verify-held-bonus` D1 was
 * written for in the first place, and D1 is what caught it.
 *
 * So the assertion is the normaliser itself. A check that invents the
 * shape it is checking agrees with nothing but itself.
 */
for (const name of HELD) {
  const row = (found.get(name)?.system?.effects ?? []).find((e) => e.kind === "heldBonus");
  ok(`P:${name} is a held bonus`, Boolean(row),
    "the printed sentence says 'your next' — a standing bonus would be a stronger spell");
  const spec = normaliseHeldBonus(row);
  ok(`P:${name} SURVIVES THE NORMALISER`, Boolean(spec),
    `${JSON.stringify(row)} — a row that normalises to null is a spell that applies and offers nothing`);
  ok(`P:${name} names what it waits for`, Boolean(spec?.checkTypes?.length),
    "an unscoped held bonus would be offered on damage rolls and flat checks alike");
}
// P:HELD THE SCOPES, ASSERTED ONE BY ONE rather than by "it has some".
const held = (n) => normaliseHeldBonus(
  (found.get(n)?.system?.effects ?? []).find((e) => e.kind === "heldBonus"));
ok("P:Prescience covers the three check types it prints",
  JSON.stringify(held("Prescience")?.checkTypes?.slice().sort())
    === JSON.stringify(["attack", "save", "skill"]));
ok("P:Divine Grace is narrowed to the Charisma skills",
  JSON.stringify(held("Divine Grace")?.subjects?.slice().sort())
    === JSON.stringify(["deception", "diplomacy", "intimidate", "perform"]),
  "the four core skills config.mjs keys to Charisma — a specialist one is named in the spent note");
// THE ROW DECLARES `recallKnowledge` AND THE SPEC KEEPS THAT CASE, since
// 3.505.0 — the card has to name the action, and a lower-cased key has no
// word boundary left to find. `heldBonusMatches` compares without regard
// to case on both sides. Both halves are asserted, because a declared key
// that no longer matches SKILL_ACTION_KEYS is a typo and a spec that
// stopped narrowing is a widening — and neither one implies the other.
const spiritLoreRow = (found.get("Spirit Lore")?.system?.effects ?? [])
  .find((e) => e.kind === "heldBonus");
ok("P:Spirit Lore declares the Recall Knowledge action key",
  JSON.stringify(spiritLoreRow?.actions) === JSON.stringify(["recallKnowledge"])
  && SKILL_ACTION_KEYS.includes("recallKnowledge"),
  "scoped exactly as Loremasters Edge already was");
ok("P:Spirit Lore's normalised spec still names one action",
  JSON.stringify(held("Spirit Lore")?.actions) === JSON.stringify(["recallKnowledge"]),
  "the axis is stored as declared so the card can print it");
ok("P:Spirit Lore's card names Recall Knowledge",
  /Recall Knowledge/.test(heldBonusCastLine(held("Spirit Lore"))),
  heldBonusCastLine(held("Spirit Lore")));
ok("P:Divine Grace's card names the four skills",
  /Deception, Diplomacy, Intimidate or Perform/.test(heldBonusCastLine(held("Divine Grace"))),
  heldBonusCastLine(held("Divine Grace")));
// P:HELD AND THEY REACH THE CHECKS THEY NAME, which is the branch a
// declared axis exists to take.
ok("P:Spirit Lore reaches a Recall Knowledge check",
  heldBonusMatches(held("Spirit Lore"), { type: "skill", subject: "arcana", actionKey: "recallKnowledge" }));
ok("P:Spirit Lore does NOT reach a plain Arcana check",
  heldBonusMatches(held("Spirit Lore"), { type: "skill", subject: "arcana" }) === false);
ok("P:Divine Grace reaches Diplomacy and not Stealth",
  heldBonusMatches(held("Divine Grace"), { type: "skill", subject: "diplomacy" })
  && heldBonusMatches(held("Divine Grace"), { type: "skill", subject: "stealth" }) === false);

/* ================================================================== *
 * S. THE SCOPE ACTUALLY NARROWS
 * ================================================================== */

const jump = normaliseSpellConditional(
  (found.get("Jump")?.system?.effects ?? []).find((e) => e.kind === "conditional"),
  normaliseConditional);
ok("S1 the Jump row normalises", Boolean(jump));
const jumpGrant = grantsFor(jump, {})[0];

ok("S2 IT MATCHES A HIGH JUMP", matchesCheck(jumpGrant, { actionKey: "highJump" }));
ok("S3 and a Long Jump", matchesCheck(jumpGrant, { actionKey: "longJump" }));
// S4 IS THE WHOLE POINT OF THE RULING.
ok("S4 AND NOT A CLIMB",
  matchesCheck(jumpGrant, { actionKey: "climb" }) === false,
  "Athletics covers Climb, Force Open and Swim; the spell raises jumping");
ok("S5 nor an unscoped skill check",
  matchesCheck(jumpGrant, { checkType: "skill", subject: "athletics" }) === false,
  "a declared axis must match — an Athletics check with no action is not a High Jump");
equal("S6 the axis it is scoped along", AXIS_CONTEXT_KEYS.actions, "actionKey",
  "the key the check object actually carries");

// S7 EVERY SCOPED ACTION IS A REAL ONE. A typo here is a bonus that
// never fires, and nothing else would notice.
const bad = [];
for (const [name, actions] of Object.entries(SCOPED)) {
  for (const a of actions) if (!SKILL_ACTION_KEYS.includes(a)) bad.push(`${name}:${a}`);
}
ok("S7 EVERY SCOPED ACTION KEY EXISTS", bad.length === 0, JSON.stringify(bad));
ok("S8 the reader found the action list at all",
  SKILL_ACTION_KEYS.length > 80,
  `only ${SKILL_ACTION_KEYS.length} keys parsed — the reader has probably stopped matching`);

/* ================================================================== *
 * C. THE THREE THINGS THE LIVE TEST FOUND
 *
 * All three shipped in 3.504.0, all three passed 78 checks, and all
 * three were visible on the first card Jump printed.
 * ================================================================== */

// C1 THE CARD SAID "ADVANTAGE" FOR A +4. `conditionalLine` hard-coded the
// word, true for exactly as long as every conditional in the pack was an
// advantage. R1 in verify-spell-conditionals asserted the SCOPE TEXT
// appeared in the sentence — and it still did.
const jumpLine = conditionalLine("Keldran", grantsFor(jump, {}));
ok("C1 A MODIFIER GRANT IS NOT CALLED AN ADVANTAGE",
  !/advantage/i.test(jumpLine), jumpLine);
ok("C1b it names the number and the bonus type", /\+4 status/.test(jumpLine), jumpLine);
ok("C1c and still names the scope", /High Jump and Long Jump/.test(jumpLine), jumpLine);
const advLine = conditionalLine("Keldran", grantsFor(normaliseSpellConditional({
  kind: "conditional", label: "x", target: "self",
  grants: [{ kind: "advantage", label: "x", scope: "Search (Perception)", when: { checkTypes: ["skill"] }, auto: true }]
}, normaliseConditional), {}));
ok("C1d an advantage grant still says advantage", /advantage on Search \(Perception\)/.test(advLine), advLine);
// C1e THE SENTENCE UNDERNEATH SAID IT TOO. Found live at 3.505.0, one
// line below the one 3.505.0 was released to fix: Jump's card read
// "+4 status to High Jump and Long Jump" and then "The advantage is
// offered on the rolls it covers". Fixing a sentence and not reading the
// one under it is how the same defect ships twice.
ok("C1e THE REMAINDER LINE DOES NOT CALL IT AN ADVANTAGE EITHER",
  !/advantage/i.test(conditionalRemainderLine()), conditionalRemainderLine());
ok("C1f and still says where it is applied by hand",
  /by hand/i.test(conditionalRemainderLine()));

// C2 `bonusType` IS WHAT A SPELL ROW SPELLS IT. `normaliseConditional`
// reads `type`, so all seven became circumstance; five print status.
const declaredType = (name) => (found.get(name)?.system?.effects ?? [])
  .find((e) => e.kind === "conditional")?.grants?.[0]?.bonusType;
const liveType = (name) => grantsFor(normaliseSpellConditional(
  (found.get(name)?.system?.effects ?? []).find((e) => e.kind === "conditional"),
  normaliseConditional), {})[0]?.type;
for (const name of Object.keys(SCOPED)) {
  ok(`C2:${name} the declared bonus type survives normalisation`,
    declaredType(name) === liveType(name),
    `row says ${declaredType(name)}, the live grant is ${liveType(name)}`);
}
// C2b FOUR NOW, NOT FIVE — Self Mirage was the fifth and left this list
// at 3.506.0 for the DC side. Named rather than counted, so the next
// change says which spell moved instead of only that the number did.
equal("C2b the ones that print a STATUS bonus",
  JSON.stringify(Object.keys(SCOPED).filter((n) => liveType(n) === "status")),
  JSON.stringify(["Jump", "Light Feet", "Spot", "Dareveil"]),
  "Concealing Terrain and Heightened Awareness print circumstance");

// C3 TWO AXES IN ONE GRANT ARE AN AND. Dareveil named an action and a
// trait together and fired only on a Make an Impression check that also
// carried the fear trait — which is nothing, ever.
const dareveil = normaliseSpellConditional(
  (found.get("Dareveil")?.system?.effects ?? []).find((e) => e.kind === "conditional"),
  normaliseConditional);
const dareveilGrants = grantsFor(dareveil, {});
equal("C3 Dareveil declares its two scopes separately", dareveilGrants.length, 2,
  "one grant naming both axes is an AND, and the printed sentence is an OR");
ok("C3b it reaches a Make an Impression check on its own",
  dareveilGrants.some((g) => matchesCheck(g, { actionKey: "makeAnImpression" })));
ok("C3c and a fear effect on its own",
  dareveilGrants.some((g) => matchesCheck(g, { checkType: "save", traits: ["fear"] })));
ok("C3d and not a Diplomacy check that is neither",
  dareveilGrants.every((g) => !matchesCheck(g, { checkType: "skill", subject: "diplomacy" })),
  "splitting the scopes must not widen them");

/* ================================================================== *
 * W. THE WARP THAT WOULD HAVE GONE INERT
 * ================================================================== */

const plain = warpedGrants(jump, {}, warpedBonusValue)[0];
equal("W1 unwarped, the printed number", plain.value, 4);
// W2 IS THE DEFECT THIS RELEASE NEARLY SHIPPED.
equal("W2 THE ALREADY-LIVE WARP REACHES THE CONDITIONAL",
  warpedGrants(jump, { bonusValue: 5, bonusMax: 50 }, warpedBonusValue)[0].value, 9,
  "grantsFor reads extraConditionals and nothing else; five working warps would have "
  + "gone inert the moment their spells became conditionals");
ok("W3 the cap is honoured",
  warpedGrants(jump, { bonusValue: 100, bonusMax: 50 }, warpedBonusValue)[0].value <= 50);
ok("W4 no warp leaves the value alone",
  warpedGrants(jump, { bonusValue: 0 }, warpedBonusValue)[0].value === 4);
// W4b IS THE FLOOR. `warpedBonusValue` adds whatever it is handed, sign
// and all — a negative mod arriving here would quietly sell the caster a
// SMALLER spell than the printed one. `bonusValue: 0` cannot catch that,
// because zero takes the early return.
ok("W4b A NEGATIVE MOD NEVER SHRINKS THE PRINTED NUMBER",
  warpedGrants(jump, { bonusValue: -3 }, warpedBonusValue)[0].value === 4,
  `a warp only ever buys more, got ${
    warpedGrants(jump, { bonusValue: -3 }, warpedBonusValue)[0].value}`);
// W5 AN ADVANTAGE GRANT HAS NO NUMBER TO RAISE.
const adv = normaliseSpellConditional({
  kind: "conditional", label: "x", target: "self",
  grants: [{ kind: "advantage", label: "x", scope: "y", when: { checkTypes: ["save"] }, auto: true }]
}, normaliseConditional);
ok("W5 an advantage grant passes through untouched",
  warpedGrants(adv, { bonusValue: 5 }, warpedBonusValue)[0].value === undefined,
  "growing a meaningless `value` on an advantage would be a number nothing reads");
ok("W6 without the arithmetic injected, nothing is warped",
  warpedGrants(jump, { bonusValue: 5 }, null)[0].value === 4,
  "the validator-injection shape this file already uses");

/* ================================================================== *
 * V. THE SPELLS THAT ARE DELIBERATELY NOT HERE
 * ================================================================== */

/*
 * RESISTANCE LEFT THIS LIST AT 3.507.0, which is this section working
 * exactly as written. It was deferred out of 3.504.0 because "any one of
 * its saving throws (selected when casting)" was the single sentence in
 * the batch no existing kind could express, and V held it there until a
 * release built it on purpose. `verify-slot-choice` owns it now.
 *
 * MAGIC STONE LEFT IT AT 3.513.0, the same way. It was deferred because
 * "+1 item (magic) bonus" had nowhere to land — ammunition could change
 * damage, damage type, range, armour rending, splash and subdual, and not
 * whether the shot lands. Graham ruled on 7 September 2026 that the bonus
 * covers attack AND damage, `attackModifier` joined the template, and
 * `verify-magic-stone` owns the spell now.
 *
 * BREEZE LEFT THE LIST AT 3.586.0, and the reason is worth recording
 * because the deferral was sound and the answer was to stop trying to
 * solve it.
 *
 * It was held here because its scope would not reduce to traits: gases
 * scope to Poison but over-catch Ghoul Touch and Verdant Retribution,
 * there is NO Breath trait (the four "…Breath" creature abilities are
 * riders that TRIGGER off a breath weapon), and Breeze is the only
 * document in 2587 that mentions severe heat. All of that is still true.
 *
 * What changed is the question. A conditional does not have to be `auto`
 * — that flag means "the check's own identity settles the whole scope",
 * and conditionals.mjs has always had the other case: a row that is
 * OFFERED in the dialog, unticked, carrying its scope in the spell's own
 * words for a person to read. Breeze is that case exactly. Trying to
 * make the dice recognise "severe heat" was solving a problem the design
 * already said not to solve.
 *
 *   SHROUD   "the target perceives light as two steps lower". Every light
 *            mechanism here changes an AREA for everyone standing in it;
 *            this is a per-creature perception offset, which is new.
 *
 * PASS WITHOUT TRACE half-left the list at 3.512.0 and is not asserted
 * here any more: its one-at-a-time rule is built and `verify-single-
 * casting` owns that half, so `effects` is no longer the right question to
 * ask about it. Its tracking DC is still unbuilt, and the blocker is that
 * the Track action is authored `against: "none"`.
 */
// SHROUD LEFT THIS LIST AT 3.606.0, on a ruling rather than in silence:
// block 32's R2 ("go with your recommendation", 29 September 2026). The
// per-creature perception offset the paragraph above calls new is
// `lightPerception`, and the +2 is an AUTO conditional — unlike Breeze's,
// its scope IS a trait the dice can see ("saving throws against light
// effects" is a save against a spell carrying Light). Asserted built, the
// way Breeze is below, so a spell dropped from a deferral list is not
// dropped from being watched.
{
  const shroud = found.get("Shroud")?.system?.effects ?? [];
  const bonus = shroud.find((e) => e.kind === "conditional");
  ok("V:Shroud is built — its offset and its bonus",
    shroud.some((e) => e.kind === "lightPerception" && e.steps === -2)
      && bonus?.grants?.[0]?.value === 2 && bonus?.grants?.[0]?.auto === true
      && JSON.stringify(bonus?.grants?.[0]?.when?.traits) === JSON.stringify(["light"]),
    "two steps darker, and +2 circumstance to saves against Light, automatically");
}
// AND BREEZE IS NOW BUILT, asserted rather than merely removed. A spell
// dropped from a deferral list with nothing put in its place is a spell
// nobody is watching: this pins both that it grants something and that
// it grants it the un-auto way the paragraph above explains.
{
  const breeze = (found.get("Breeze")?.system?.effects ?? [])
    .find((e) => e.kind === "conditional");
  ok("V:Breeze is built, as an offered conditional",
    Boolean(breeze) && breeze.grants?.[0]?.value === 2 && breeze.grants?.[0]?.auto !== true,
    "+2, offered unticked — its scope is words for a person, not traits for the dice");
}

if (failures.length) {
  process.stderr.write(`verify-pp2-bonuses: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-pp2-bonuses: OK — ${checks} checks. Twelve spells that granted nothing now grant `
  + "what they print, scoped to the actions they name, with their existing warps still live.\n");
