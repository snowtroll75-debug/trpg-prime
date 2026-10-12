#!/usr/bin/env node
/**
 * verify-chapter10-271-280 — the Grimoire, Divine Decree to Force Punch.
 *
 * NEW at 3.589.0. Graham's R1-R8 of 25 September 2026, all eight "your
 * recommendation".
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS BLOCK'S FINDING WAS NOT THE GAPS. IT WAS THE WRONG ANSWERS.
 *
 * Sixteen entries print a degree ladder and three were modelled. Of the
 * thirteen that were not, SIX carried one flat condition row applied on
 * every failing degree — and a spell that does something confident and
 * wrong is worse at a table than one that does nothing visible:
 *
 *   DOMINATE      applied `controlled` on a SUCCESSFUL Will save.
 *   ENTHRALL      applied `fixated` on a Success the page calls
 *                 "unaffected".
 *   DIVINE DECREE applied `injured 2` on a Success, and its header
 *                 omitted the word "basic", so a successful save took the
 *                 FULL 10d8.
 *   DULLING CLOUD applied `stunned 2` always — too much on a Success and
 *                 too little on a Fumble.
 *   FATIGUE       applied `fatigued 1` with no duration against a spell
 *                 duration of "varies", which parses to nothing: every
 *                 Fatigue was PERMANENT where the Success rung is one
 *                 round.
 *   FLARE         the same, for `dazzled`.
 *
 * Section B asserts each of the six, per rung, so none of them can slide
 * back to a flat row.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND A FINDING I HAD TO WITHDRAW, WHICH IS THE LESSON WORTH KEEPING.
 *
 * The audit told Graham that a `bonus` row could not give a creature a
 * fly speed, and that Fly and Earth Glide therefore needed new
 * machinery. The evidence was `pooledSpeedValue({base: 0, status: 20})`
 * returning null — and that is the MIGRATION's helper, whose own docs say
 * the null means "no update needed". Driven on a real actor in Graham's
 * world, with the exact change a bonus row produces, `fly.total` went
 * 0 -> 20, and `fly-workflow.mjs` gates flight on the total.
 *
 * A bonus would have worked. `speedGrant` survives for a narrower
 * reason — "equal to its land Speed or 20 feet, whichever is greater" is
 * not a number — and Section F asserts THAT sentence rather than the
 * claim I withdrew.
 *
 * Third time this project has recorded the same shape against a movement
 * slot. 3.410.0's was an `allSpeeds` bonus written to bare numbers, and
 * the check that passed it "asked whether the PATH existed — it did —
 * rather than whether a bonus could land there".
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  DRAINABLE, casterGainFrom, normaliseResourceDrain, resourceDrainLine
} from "../module/magic/resource-drain.mjs";
import {
  GRANTED_SPEED_PATH, grantedSpeedBase, grantedSpeedLine, grantedSpeeds, normaliseGrantedSpeed
} from "../module/combat/granted-speeds.mjs";
import { SPEED_KEYS, resolveMovement } from "../module/combat/speed-pool.mjs";
import {
  DEFAULT_RECORD_TYPES, applicableRecordedRoll, normaliseRecordTypes, recordedRolls,
  seersVisionCastLine, seersVisionConsumes, seersVisionRecord, withRecordedRoll
} from "../module/magic/seers-vision.mjs";
import { declaredDegrees, effectAppliesOnDegree } from "../module/magic/spell-degrees.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { spendPowerPoints } from "../module/power-points.mjs";
import { aggregateWarpSelection } from "../module/magic/spell-warp.mjs";
import { parseSpellDuration } from "../module/magic/effect-duration.mjs";
import { bonusTargetFor } from "../module/magic/spell-effects.mjs";
import { BLIND_ROLL_MODE } from "../module/traits.mjs";
import { restoreFromSnapshot } from "./lib/mutation-safety.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const code = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
// COMMENTS STRIPPED BEFORE ASKING SOURCE ANYTHING — block 26 had two
// checks fail because they matched the comment that described the bug
// they forbade. A comment about a defect always contains the defect.
const codeOnly = (...p) => code(...p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally {
    await db.close();
  }
  return out;
}
const spells = await spellsPack();
ok("A0 the spells pack could be read", spells !== null);
const sysOf = (n) => spells?.get(n)?.system ?? null;
const rowsOf = (n) => sysOf(n)?.effects ?? [];
const rowOf = (n, kind) => rowsOf(n).find((r) => r.kind === kind) ?? null;
/** The rows that apply to a target who rolled this degree. */
const onDegree = (n, degree) => rowsOf(n).filter((r) => r.kind !== "note"
  && effectAppliesOnDegree(r, degree));

/* ================================================================== *
 * A. THE THREE NEW KINDS ARE REACHABLE AND DO SOMETHING
 * ================================================================== */

for (const kind of ["resource", "speedGrant"]) {
  ok(`A1 "${kind}" is declared handled`, HANDLED_EFFECT_KINDS.includes(kind));
  ok(`A2 the applier has a case for "${kind}"`,
    codeOnly("module", "magic", "spell-effects.mjs").includes(`case "${kind}": {`),
    "a declared kind with no case prints Unhandled effect kind on a paid-for cast");
}
{
  const applier = codeOnly("module", "magic", "spell-effects.mjs");
  ok("A3 the resource case drains PP through the rule that charges for going below 0",
    /case "resource": \{[\s\S]*?await applyPowerPointCost\(target, asked, drain\.label\)/.test(applier),
    "Chapter 4's 5-Soul-Drain-per-point is that function's whole reason for existing");
  ok("A4 and applies soul drain through the rule that knows it can kill",
    /case "resource": \{[\s\S]*?await setSoulDrain\(target, held \+ asked\)/.test(applier),
    "Soul Drain lowers MAXIMUM hit points; setSoulDrain is what checks whether that went below 0");
  ok("A5 the speedGrant case creates the ability item the derivation reads",
    /case "speedGrant": \{[\s\S]*?creatureAbility: \{ derives: \{ movement: grant \} \}/.test(applier));
  ok("A6 and gives it the grantedItems lifecycle, so the spell takes it back",
    /case "speedGrant": \{[\s\S]*?grantedItems: \[madeSpeed\.id\]/.test(applier),
    "a permanent fly speed from a one-minute spell");
  ok("A7 a condition row may roll its value",
    /if \(cond\.valued && effect\.formula\) \{[\s\S]*?conditionValue = Math\.max\(0, rolled\.total\)/.test(applier),
    "Enervation's rungs are 1d8 / 2d8 / 4d8, and Number(\"1d8\") is NaN");
  ok("A8 and may carry its damage type",
    /\.\.\.\(effect\.damageType \? \{ damageType: String\(effect\.damageType\) \} : \{\}\)/.test(applier));
}
ok("A9 applyConditionTags forwards a tag's damage type",
  /\.\.\.\(tag\.damageType \? \{ damageType: String\(tag\.damageType\) \} : \{\}\)/
    .test(codeOnly("module", "combat", "effect-application-workflow.mjs")),
  "measured live: a recurring condition with no type silently becomes FIRE");

/* ================================================================== *
 * B. THE SIX THAT WERE WRONG — ASSERTED PER RUNG
 * ================================================================== */

ok("B1 Dominate stuns on a success and controls only on a failure",
  onDegree("dominate", "success").every((r) => r.condition === "stunned" && r.value === 1)
  && onDegree("dominate", "success").length === 1
  && onDegree("dominate", "failure").some((r) => r.condition === "controlled")
  && !onDegree("dominate", "success").some((r) => r.condition === "controlled"),
  "a successful Will save used to dominate the target");
ok("B2 Dulling Cloud stuns 1 / 2 / 3, not 2 always",
  onDegree("dulling cloud", "success")[0]?.value === 1
  && onDegree("dulling cloud", "failure")[0]?.value === 2
  && onDegree("dulling cloud", "fumble")[0]?.value === 3);
ok("B3 Enthrall fixates nobody who succeeded",
  onDegree("enthrall", "success").length === 0
  && onDegree("enthrall", "failure").some((r) => r.condition === "fixated"),
  "the page's Success rung is the word \"unaffected\"");
ok("B4 Divine Decree injures only on failure and fumble",
  onDegree("divine decree", "success").length === 0
  && onDegree("divine decree", "failure").some((r) => r.condition === "injured" && r.value === 2)
  && onDegree("divine decree", "fumble").some((r) => r.condition === "injured" && r.value === 2));
ok("B5 and its save is basic, so a success takes half rather than all of the 10d8",
  /^basic /i.test(String(sysOf("divine decree")?.defence ?? "")),
  "parseSpellDefence reads /basic/ out of this string to decide whether damage scales");
ok("B6 Fatigue's three rungs differ by DURATION, which is what the page prints",
  (() => {
    const s = onDegree("fatigue", "success")[0];
    const f = onDegree("fatigue", "failure")[0];
    const b = onDegree("fatigue", "fumble")[0];
    return s?.duration === "1 round" && f?.duration === "1 minute" && b?.duration === undefined
      && [s, f, b].every((r) => r?.value === 1);
  })(),
  "every Fatigue used to be permanent, because the spell's duration is \"varies\"");
ok("B7 Flare's dazzle is one round on a failure and a minute on a fumble",
  onDegree("flare", "failure")[0]?.duration === "1 round"
  && onDegree("flare", "fumble")[0]?.duration === "1 minute");
/*
 * THE GUARD THAT MAKES B6 AND B7 MEAN ANYTHING. A per-row duration is
 * only worth declaring if the row's own value is what gets read — and
 * both spells' own duration parses to NOTHING, which is how they came to
 * be permanent in the first place.
 */
ok("B8 \"varies\" really does parse to nothing, which is why the rows must say",
  parseSpellDuration("varies") === null && parseSpellDuration(sysOf("flare")?.duration) === null,
  "an effect that declares nothing gets the spell's duration, and theirs is unreadable");
ok("B9 a per-row duration is read per effect, not once per cast",
  /const durationSource = effectDurationText\(effect, spellDurationSource\);/
    .test(codeOnly("module", "magic", "spell-effects.mjs")));
/*
 * B9b EXISTS BECAUSE A MUTATION SURVIVED. `onDegree` above asks
 * `effectAppliesOnDegree` — the RULE — and a mutation that made the
 * applier's selector return every target regardless walked straight
 * through every check in this section. The rule being right is worth
 * nothing if the applier does not ask it.
 */
ok("B9b the applier chooses recipients through the degree selector",
  /: recipientsForEffect\(effect, ladderResults, targets\);/
    .test(codeOnly("module", "magic", "spell-effects.mjs")),
  "a gated row that reached every target would undo all of section B silently");
ok("B9c and the selector really does filter by degree",
  (() => {
    const row = { kind: "condition", condition: "stunned", onSave: ["success"] };
    return effectAppliesOnDegree(row, "success") === true
      && effectAppliesOnDegree(row, "failure") === false;
  })());
ok("B10 every condition these ladders name exists in the registry",
  ["stunned", "controlled", "fixated", "injured", "fatigued", "dazzled",
    "immobilised", "slowed", "doomed", "recurring"].every((c) => Boolean(CONDITIONS[c])));
ok("B11 no rung is gated on a degree its page does not print",
  ["dominate", "dulling cloud", "enthrall", "divine decree", "fatigue", "flare",
    "false mire", "earth bind"].every((n) => rowsOf(n)
      .every((r) => !(declaredDegrees(r) ?? []).includes("partial"))),
  "these print four rungs; effectiveSaveDegree maps the rest, and authoring one overrides it with a guess");

/* ================================================================== *
 * C. R4 — A LADDER THAT TAKES SOMETHING OTHER THAN HIT POINTS
 * ================================================================== */

ok("C1 a drain names a resource the rule knows",
  DRAINABLE.length === 2 && normaliseResourceDrain({ resource: "hp", formula: "2d6" }) === null);
ok("C2 a drain with no dice, or unparseable dice, is refused",
  normaliseResourceDrain({ resource: "pp" }) === null
  && normaliseResourceDrain({ resource: "pp", formula: "two d6" }) === null,
  "it would reach new Roll(\"\") mid-cast");
ok("C3 only PP may be shared back with the caster",
  normaliseResourceDrain({ resource: "pp", formula: "2d6", casterGains: "half" }).casterGains === "half"
  && normaliseResourceDrain({ resource: "soulDrain", formula: "2d8", casterGains: "all" }).casterGains === "",
  "nothing in the book hands a caster somebody else's Soul Drain");
ok("C4 the caster gains from what was TAKEN, not from what was rolled",
  casterGainFrom(2, "half") === 1 && casterGainFrom(3, "half") === 1
  && casterGainFrom(3, "all") === 3 && casterGainFrom(14, "") === 0,
  "a target holding 2 PP against a 4d6 drain loses 2; minting from the roll would invent power points");
ok("C5 the applier passes what was taken, not the roll",
  /casterGainFrom\(spend\.spent - spend\.shortfall, drain\.casterGains\)/
    .test(codeOnly("module", "magic", "spell-effects.mjs")));
ok("C6 the card prints both figures when they differ",
  /of 14 rolled/.test(resourceDrainLine("X", "Foe", { resource: "pp", rolled: 14, taken: 2 }))
  && !/rolled/.test(resourceDrainLine("X", "Foe", { resource: "pp", rolled: 4, taken: 4 })),
  "\"4 PP drained\" on a 14 roll looks like a bug to a player who watched the dice");
/* The overflow rule, asked of the rule rather than restated here. */
ok("C7 Chapter 4's below-zero charge is 5 Soul Drain per point",
  spendPowerPoints(3, 8).soulDrain === 25 && spendPowerPoints(3, 8).value === 0,
  "measured live: 3 PP past empty charged 15 Soul Drain and dropped max HP 82 -> 67");
ok("C8 and the PP path applies it through the rule that can kill",
  /const \{ setSoulDrain \} = await import\("\.\/combat\/dying-workflow\.mjs"\);/
    .test(codeOnly("module", "power-points-workflow.mjs")),
  "it wrote the condition directly before this, so an overspend could not kill anybody");

/* ── the two spells ── */
ok("C9 Eldritch Disruption drains 1d6 / 2d6 / 4d6 PP by degree",
  (() => {
    const by = (d) => onDegree("eldritch disruption", d).find((r) => r.kind === "resource");
    return by("success")?.formula === "1d6" && by("failure")?.formula === "2d6"
      && by("fumble")?.formula === "4d6"
      && onDegree("eldritch disruption", "critical").length === 0;
  })());
ok("C10 its 6d10 force still comes from the basic save it already had",
  /^basic /i.test(String(sysOf("eldritch disruption")?.defence ?? ""))
  && sysOf("eldritch disruption")?.damage?.formula === "6d10",
  "the drain is the SECOND ladder the entry prints, not a replacement for the first");
ok("C10b the warped share reaches the drain, rather than being charged for and dropped",
  /\.\.\.\(warpMods\?\.casterGains \? \{ casterGains: warpMods\.casterGains \} : \{\}\)/
    .test(codeOnly("module", "magic", "spell-effects.mjs")),
  "caught by verify-emanation E2b: a mod key the aggregator never read");
ok("C10c and the aggregator takes the better share rather than summing",
  (() => {
    const warps = [{ ppCost: 2, mods: { casterGains: "half" } },
      { ppCost: 4, mods: { casterGains: "all" } }];
    return aggregateWarpSelection(warps, { "warp-0": 1, "warp-1": 1 }).mods.casterGains === "all"
      && aggregateWarpSelection(warps, { "warp-0": 2 }).mods.casterGains === "half"
      && aggregateWarpSelection(warps, {}).mods.casterGains === "";
  })(),
  "half a pool plus all of it is not one and a half pools");
ok("C11 its two warps now buy the share they print",
  (sysOf("eldritch disruption")?.warps ?? []).some((w) => w.mods?.casterGains === "half")
  && (sysOf("eldritch disruption")?.warps ?? []).some((w) => w.mods?.casterGains === "all"));
ok("C12 Enervation's recurring damage is typed essence on every rung",
  ["success", "failure", "fumble"].every((d) => {
    const r = onDegree("enervation", d).find((x) => x.condition === "recurring");
    return r?.damageType === "essence";
  }),
  "an untyped recurring condition silently becomes FIRE — measured live");
ok("C13 and its dice rise 1d8 / 2d8 / 4d8",
  onDegree("enervation", "success").find((r) => r.condition === "recurring")?.formula === "1d8"
  && onDegree("enervation", "failure").find((r) => r.condition === "recurring")?.formula === "2d8"
  && onDegree("enervation", "fumble").find((r) => r.condition === "recurring")?.formula === "4d8");
ok("C14 its soul drain is on the two rungs that print it, and nothing on a success",
  onDegree("enervation", "success").filter((r) => r.kind === "resource").length === 0
  && onDegree("enervation", "failure").some((r) => r.kind === "resource" && r.formula === "2d8")
  && onDegree("enervation", "fumble").some((r) => r.kind === "resource" && r.formula === "4d8"));
ok("C15 and Doomed 1 only on the fumble",
  onDegree("enervation", "fumble").some((r) => r.condition === "doomed" && r.value === 1)
  && !onDegree("enervation", "failure").some((r) => r.condition === "doomed"));

/* ================================================================== *
 * D. R3 — DOUBT IS DISORIENT, ONE BLOCK LATER
 * ================================================================== */

{
  const rows = rowsOf("doubt").filter((r) => r.kind === "pending");
  ok("D1 Doubt uses the swing channel built for Disorient", rows.length === 2);
  ok("D2 its Failure rung is a one-shot disadvantage",
    (() => {
      const r = rows.find((x) => (x.onSave ?? []).includes("failure"));
      return r?.swing === "disadvantage" && r?.oneShot !== false && r?.auto !== true;
    })());
  ok("D3 its Fumble rung is every check, pre-ticked and not spent",
    (() => {
      const r = rows.find((x) => (x.onSave ?? []).includes("fumble"));
      return r?.swing === "disadvantage" && r?.oneShot === false && r?.auto === true;
    })(),
    "\"ALL of their checks\" asks the player nothing");
  ok("D4 both are bounded, so an unused one stops being offered",
    rows.every((r) => r.span === "endOfNextTurn"));
  ok("D5 and the secret save is printed, since nothing can hide a result from a player",
    rowsOf("doubt").some((r) => r.kind === "note" && /secret/i.test(r.text ?? "")));
}

/* ================================================================== *
 * E. R7 — A RECORDED D20, NOW FOR TWO SPELLS
 * ================================================================== */

ok("E1 Embrace Destiny records a d20 through the channel that forces a die FACE",
  rowOf("embrace destiny", "seersVision") !== null,
  "Graham's ruling of 31 August: a recorded 20 IS a natural 20, so the chain decides");
ok("E2 and declares the list its page prints, which includes an attack roll",
  (() => {
    const t = normaliseRecordTypes(rowOf("embrace destiny", "seersVision")?.types);
    return t.includes("attack") && t.includes("save") && t.includes("skill");
  })());
ok("E3 Seer's Vision keeps its own narrower list",
  JSON.stringify([...DEFAULT_RECORD_TYPES]) === JSON.stringify(["save", "skill"])
  && seersVisionConsumes("attack", "publicroll", { value: 9 }) === false,
  "\"a non-secret saving throw or skill check\" — an attack roll is neither");
ok("E4 a record written before this release still reads and keeps that list",
  seersVisionConsumes("skill", "publicroll", { value: 9 }) === true,
  "the flag held one bare object until 3.589.0 and may hold one in a live world now");
/*
 * E4b EXISTS BECAUSE A MUTATION SURVIVED. E4 asks
 * `seersVisionConsumes` about a bare object, which never goes through
 * `recordedRolls` — so removing the legacy branch broke nothing here.
 * The legacy shape is the one sitting in Graham's live world.
 */
ok("E4b a bare stored object is read as a list of one",
  recordedRolls({ value: 9 }).length === 1
  && recordedRolls([{ value: 9 }, { value: 4 }]).length === 2
  && recordedRolls(null).length === 0,
  "the flag held ONE record until 3.589.0; refusing it would quietly eat a live Seer's Vision");
ok("E5 a blind roll is refused for both, by the constant rather than a typed string",
  seersVisionConsumes("skill", BLIND_ROLL_MODE, { value: 9 }) === false
  && seersVisionConsumes("attack", BLIND_ROLL_MODE,
    seersVisionRecord({ value: 9, types: ["attack"] })) === false,
  "a player cannot spend a number on a roll they are not allowed to see");
ok("E6 the two spells do not cancel each other",
  (() => {
    const sv = seersVisionRecord({ value: 17 });
    const ed = seersVisionRecord({ value: 11, source: "Embrace Destiny", types: ["attack"] });
    const both = withRecordedRoll(withRecordedRoll(null, sv), ed);
    return both.length === 2;
  })(),
  "neither spell's sentence says a word about the other; one shared slot would have invented a rule");
ok("E7 recasting one replaces only its own",
  (() => {
    const sv = seersVisionRecord({ value: 17 });
    const ed = seersVisionRecord({ value: 11, source: "Embrace Destiny", types: ["attack"] });
    const after = withRecordedRoll(withRecordedRoll(withRecordedRoll(null, sv), ed),
      seersVisionRecord({ value: 2, source: "Embrace Destiny", types: ["attack"] }));
    return after.length === 2 && after.find((r) => r.source === "Embrace Destiny").value === 2
      && after.find((r) => r.source !== "Embrace Destiny").value === 17;
  })());
ok("E8 each check is offered the record it may actually spend",
  (() => {
    const both = withRecordedRoll(
      withRecordedRoll(null, seersVisionRecord({ value: 17 })),
      seersVisionRecord({ value: 11, source: "Embrace Destiny", types: ["attack"] }));
    return applicableRecordedRoll(both, "attack", "publicroll")?.value === 11
      && applicableRecordedRoll(both, "skill", "publicroll")?.value === 17;
  })());
ok("E9 the check passes what is being rolled, so that selection can happen",
  /pendingSeersVision\(this\.actor, this\.type, this\.rollMode\)/
    .test(codeOnly("module", "dice", "check.mjs")));
ok("E10 and spends only the record that was used",
  /consumeSeersVision\(this\.actor, pending\.source \?\? ""\)/
    .test(codeOnly("module", "dice", "check.mjs")),
  "clearing the flag outright would end a Seer's Vision because an Embrace Destiny was spent");
ok("E11 the cast card names the list the record carries, not Seer's Vision's",
  /attack roll/.test(seersVisionCastLine(11, "X", ["attack", "save", "skill"]))
  && !/attack roll/.test(seersVisionCastLine(17, "X")),
  "telling a player the wrong list about a spell they just paid for is worse than a missing line");

/* ================================================================== *
 * F. R6 — A GRANTED SPEED, AND THE CLAIM I WITHDREW
 * ================================================================== */

/*
 * F1 IS THE WITHDRAWAL, WRITTEN AS A CHECK. The audit said a bonus row
 * could not grant a fly speed. It can — measured on a real actor. So the
 * mechanism is justified by the SENTENCE it carries, and that is what is
 * asserted here.
 */
ok("F1 a grant reads its feet against the resolved land speed",
  grantedSpeedBase({ key: "fly", feet: 20, orLand: true }, 30) === 30
  && grantedSpeedBase({ key: "fly", feet: 20, orLand: true }, 15) === 20,
  "\"equal to its land Speed or 20 feet, whichever is greater\" — not a number a bonus could carry");
ok("F1b a flat grant ignores land entirely",
  grantedSpeedBase({ key: "burrow", feet: 5 }, 60) === 5,
  "Earth Glide prints 5 feet and means 5 feet");
ok("F2 a grant naming a speed that does not exist is refused",
  normaliseGrantedSpeed({ key: "teleport", feet: 30 }, SPEED_KEYS) === null);
ok("F3 a grant of nothing is refused, unless it defers to land",
  normaliseGrantedSpeed({ key: "fly", feet: 0 }, SPEED_KEYS) === null
  && normaliseGrantedSpeed({ key: "fly", feet: 0, orLand: true }, SPEED_KEYS) !== null);
ok("F4 grants are read from items, like a sense and a light step",
  grantedSpeeds([{ flags: { "trg-prime": { creatureAbility: { derives: {
    [GRANTED_SPEED_PATH]: { key: "fly", feet: 20, orLand: true } } } } } }], SPEED_KEYS).length === 1);
/* THE BEHAVIOUR, DRIVEN — not the shape of the call. */
{
  const landSpeed = ({ base }) => ({ speed: base, immobilised: base <= 0 });
  const human = { land: 30 };
  resolveMovement({ movement: human, grantedSpeeds: [{ key: "fly", feet: 20, orLand: true }], landSpeed });
  ok("F5 a creature with no fly speed gains one", human.fly?.total === 30);
  const slow = { land: 15 };
  resolveMovement({ movement: slow, grantedSpeeds: [{ key: "fly", feet: 20, orLand: true }], landSpeed });
  ok("F5b and a slow one gets the printed floor", slow.fly?.total === 20);
  const dragon = { land: 40, fly: 60 };
  resolveMovement({ movement: dragon, grantedSpeeds: [{ key: "fly", feet: 20, orLand: true }], landSpeed });
  ok("F6 A DRAGON THAT ALREADY FLIES 60 IS NOT SLOWED TO 20", dragon.fly.total === 60,
    "the half a careless assignment gets wrong");
  const none = { land: 30 };
  resolveMovement({ movement: none, landSpeed });
  ok("F7 and no grant leaves the speed absent, not zero",
    none.fly === undefined,
    "speedsPresentOn distinguishes absent from zero, and the sheet shows a row for what exists");
  const glide = { land: 30 };
  resolveMovement({ movement: glide, grantedSpeeds: [{ key: "burrow", feet: 5 }], landSpeed });
  ok("F8 a granted speed moves BASE as well as total",
    glide.burrow.base === 5,
    "speedsPresentOn reads base to answer \"can this creature burrow?\"");
}
ok("F9 the derivation reads them from the actor's items",
  /const granted = grantedSpeeds\(Array\.from\(actor\.items \?\? \[\]\), SPEED_KEYS\);/
    .test(codeOnly("module", "documents", "actor.mjs")));
ok("F10 and no file still claims a bonus cannot grant a speed",
  !/a bonus cannot|bonus row CANNOT|pooledSpeedValue\(\{base: 0/
    .test(code("module", "combat", "granted-speeds.mjs")
      + code("module", "combat", "speed-pool.mjs")
      + code("module", "magic", "spell-effects.mjs")
      + code("module", "documents", "actor.mjs")),
  "a comment asserting a measurement that is not true is what the next person builds on");
ok("F11 the withdrawal is recorded where the mechanism lives",
  /THE CLAIM I HAD TO WITHDRAW/.test(code("module", "combat", "granted-speeds.mjs")));
ok("F12 Fly grants a fly speed that defers to land",
  (() => {
    const r = rowOf("fly", "speedGrant");
    return r?.key === "fly" && r?.orLand === true && r?.feet === 20;
  })());
ok("F13 Earth Glide grants a flat burrow 5, and its warp raises it to a printed ceiling",
  rowOf("earth glide", "speedGrant")?.feet === 5
  && (sysOf("earth glide")?.warps ?? []).some((w) =>
    Number(w.mods?.bonusValue) === 5 && Number(w.mods?.bonusMax) === 20));
ok("F14 the card reads the number back off the sheet",
  /shownFeet = Number\(\s*target\.system\?\.combat\?\.movement\?\.\[grant\.key\]\?\.total/
    .test(codeOnly("module", "magic", "spell-effects.mjs")),
  "so the figure the player is told is the one the sheet will show them");
ok("F15 grantedSpeedLine names the speed and the feet",
  /burrow Speed of 5 feet/.test(grantedSpeedLine("X", { key: "burrow", feet: 5 }, 5)));

/* ================================================================== *
 * G. R6's OTHER SPELLS, AND R8
 * ================================================================== */

ok("G1 Fleeting Speed is a +30 status to all Speeds",
  (() => {
    const r = rowOf("fleeting speed", "bonus");
    return r?.value === 30 && r?.bonusType === "status" && r?.slot === "allSpeeds";
  })());
ok("G2 Divine Favour raises attacks AND damage, and says what it does not reach",
  rowOf("divine favour", "bonus")?.slot === "attack"
  && rowOf("divine favour", "weaponDamageBonus")?.value === 1
  && rowsOf("divine favour").some((r) => r.kind === "note" && /attack SPELLS/i.test(r.text ?? "")));
ok("G3 False Health's temporary HP is the casting ability score, doubled",
  rowOf("false health", "tempHP")?.formula === "@castingAbility * 2");
ok("G4 and the cast passes that score to formulas",
  /castingAbility,/.test(codeOnly("module", "magic", "cast-workflow.mjs").split("rollData: {")[1] ?? ""),
  "the first formula in the pack to need it; level, caster level and PP were enough until now");
ok("G5 Echolocation grants the pack's own Blindsight rather than redefining it",
  (() => {
    const r = rowOf("echolocation", "grantAbility");
    return /^Compendium\.trg-prime\.abilities\.Item\./.test(r?.uuid ?? "")
      && !JSON.stringify(rowsOf("echolocation")).includes("category");
  })(),
  "two definitions of one ability is two things to keep in step");
ok("G6 Divine Might finally has a bonus for its warp to raise",
  rowsOf("divine might").filter((r) => r.kind === "bonus").length === 2
  && rowsOf("divine might").some((r) => r.slot === "strength" && r.value === 1)
  && rowsOf("divine might").some((r) => r.slot === "constitution" && r.value === 1),
  "the key existed for months; the row it would act on did not");
ok("G7 and that warp now carries its printed ceiling",
  (sysOf("divine might")?.warps ?? []).some((w) =>
    Number(w.mods?.bonusValue) === 1 && Number(w.mods?.bonusMax) === 4));
ok("G8 Fatigue's level warp carries its ceiling too",
  (sysOf("fatigue")?.warps ?? []).some((w) =>
    Number(w.mods?.bonusValue) === 1 && Number(w.mods?.bonusMax) === 5));
ok("G9 every bonus slot this block authored is one the sheet actually has",
  (() => {
    const slots = ["fleeting speed", "divine favour", "divine might", "false mire", "foe to friend"]
      .flatMap((n) => rowsOf(n).filter((r) => r.kind === "bonus").map((r) => r.slot));
    return slots.length > 0 && slots.every((s) => s === "allSpeeds" || Boolean(bonusTargetFor(s)));
  })(),
  "\"performance\" resolves to a path that exists and takes the penalty silently — block 26's lesson");

/* ================================================================== *
 * H. R5 AND THE HONEST NOTES
 * ================================================================== */

ok("H1 Foe To Friend builds its Success rung and prints the rest",
  onDegree("foe to friend", "success").some((r) => r.kind === "bonus" && r.value === -5)
  && rowsOf("foe to friend").some((r) => r.kind === "note" && /by hand/i.test(r.text ?? "")));
ok("H2 Earth Prison builds its Success rung and prints the burial",
  onDegree("earth prison", "success").some((r) => r.condition === "slowed" && r.value === 1)
  && rowsOf("earth prison").some((r) => r.kind === "note" && /by hand/i.test(r.text ?? "")));
ok("H3 Entangle's difficult terrain is real and its escape check is printed",
  rowOf("entangle", "difficultTerrain") !== null
  && rowsOf("entangle").some((r) => r.kind === "note" && /Escape check/i.test(r.text ?? "")));
/*
 * THE FOUR THIS BLOCK DELIBERATELY DID NOT BUILD, each measured rather
 * than assumed. Asserted as notes so that "flagged" cannot silently
 * become "missing" — and so a later release that builds one has to come
 * here and say so.
 */
for (const [spell, pattern, why] of [
  ["eldritch shield", /judge|by hand|at the table/i, "the spell-attack path never calls defenceDCBonus"],
  ["entropic shield", /judge|by hand|at the table/i, "no axis says whether an attack was ranged"],
  ["effortless armour", /by hand|at the table/i, "prepareArmourCheckPenalty ASSIGNS acp.total"],
  ["eternal aspect", /choose|by hand|at the table/i, "four heterogeneous benefits; slot choice takes a list of slots"]
]) {
  ok(`H4 ${spell} still prints what it cannot automate`,
    rowsOf(spell).some((r) => r.kind === "note" && pattern.test(r.text ?? "")),
    why);
}

/* ================================================================== *
 * J. THE HARNESS PUT ITSELF BACK TOGETHER
 *
 * Not about pages 271-280, and here because this release is where it
 * happened. `mutate-checks-read-source` was killed by a command timeout
 * while holding the BLINDFOLD mutation — `if (false)` in blank-read.mjs's
 * own blanking hook. The tree stayed sabotaged; the next run of
 * `verify-checks-read-source` reported 437 vacuous pairs, which reads
 * like 437 broken checks rather than one broken instrument; and the full
 * sweep repeated it.
 *
 * `mutation-safety.mjs` had always said SIGKILL was the case it could
 * not catch, and that the lock's job was to let the next run "SAY SO".
 * Saying so was not enough. The originals now go to disk beside the
 * lock, and a run that reclaims a stale lock puts them back first.
 *
 * Proven against a real SIGKILL before these checks were written.
 * ================================================================== */

ok("J1 the snapshot helper exists and is harmless on a clean tree",
  typeof restoreFromSnapshot === "function"
  && restoreFromSnapshot(path.join(SYSTEM_ROOT, "tools", ".harness.snapshot.does-not-exist")).length === 0,
  "it runs on the recovery path of a run trying to start; throwing would be worse than the damage");
ok("J2 guardFiles writes the originals to disk before anything is mutated",
  /fs\.writeFileSync\(DEFAULT_SNAPSHOT, JSON\.stringify\(\{/
    .test(codeOnly("tools", "lib", "mutation-safety.mjs")),
  "the in-memory copy dies with the process, which is exactly the SIGKILL case");
/*
 * ANCHORED TO THE RECLAIM BLOCK, not to the file. The first version
 * compared `restoreFromSnapshot()` against the first
 * `fs.rmSync(lockPath, ...)` in the file — which is the one inside
 * `release()`, ninety lines earlier and nothing to do with reclaiming.
 * The order was right and the check said it was wrong. A check satisfied
 * (or refuted) by an unrelated occurrence is this project's most-recorded
 * defect shape, and that is now three times in two releases in my own
 * checks.
 */
ok("J3 a reclaimed stale lock restores before it does anything else",
  /restoreFromSnapshot\(\);\s*fs\.rmSync\(lockPath, \{ force: true \}\);/
    .test(codeOnly("tools", "lib", "mutation-safety.mjs")),
  "removing the lock first would lose the only record of what needed putting back");
ok("J4 and a finished run takes its snapshot with it",
  /fs\.rmSync\(DEFAULT_SNAPSHOT, \{ force: true \}\)/
    .test(codeOnly("tools", "lib", "mutation-safety.mjs")),
  "a snapshot that outlives its run is a trap for the next one");
ok("J5 restoring compares contents, so finished work is never reverted",
  /if \(fs\.existsSync\(file\) && fs\.readFileSync\(file\)\.equals\(want\)\) continue;/
    .test(codeOnly("tools", "lib", "mutation-safety.mjs")));
ok("J6 the incident is recorded where the mechanism lives",
  /THE SNAPSHOT THAT SURVIVES A SIGKILL/.test(code("tools", "lib", "mutation-safety.mjs")));
/*
 * J7 IS THE ONE THAT WOULD HAVE CAUGHT THE INCIDENT ITSELF. The
 * blindfold mutation is `if (false)` in the blanking hook, and a tree
 * carrying it makes every source-scanning check vacuous while looking
 * fine. Asserted directly, because the sweep took twenty-five minutes to
 * tell me and this takes none.
 */
ok("J6b and the harness's own scratch never ships",
  (() => {
    const src = codeOnly("tools", "build-zip.mjs");
    return /tools\/\.harness\.lock/.test(src) && /tools\/\.harness\.snapshot\.json/.test(src);
  })(),
  "the snapshot is a base64 copy of most of module/, and a killed run's copy is half-mutated");
ok("J7 the blanking hook is not currently blindfolded",
  /if \(typeof file === "string" && path\.resolve\(file\) === target\) \{/
    .test(code("tools", "lib", "blank-read.mjs")),
  "`if (false)` here makes 437 checks pass for the wrong reason");

/* ================================================================== *
 * I. THE AUTHORING SCRIPT
 * ================================================================== */

{
  const src = codeOnly("tools", "author-block27-spells.mjs");
  ok("I1 it replaces the fields it owns",
    /y\.effects = \[/.test(src) && !/y\.effects\.push\(/.test(src));
  ok("I2 and no warp edit spreads the mods it is replacing",
    !/mods: \{ \.\.\./.test(src),
    "block 25 left Ball Lightning carrying two contradictory keys for two runs");
  ok("I3 nothing was authored on a degree the pages do not print",
    !/onSave: \["partial"\]/.test(src));
  ok("I4 it records what it deliberately left as a note",
    /LEFT AS A NOTE/.test(code("tools", "author-block27-spells.mjs")));
}

/* ================================================================== */

process.stdout.write(failures.length
  ? `\nverify-chapter10-271-280: FAILED — ${failures.length} of ${checks}:\n  ${failures.join("\n  ")}\n`
  : `\nverify-chapter10-271-280: OK — ${checks} checks. Pages 271-280: six spells that were confidently wrong are now right per rung.\n`);
process.exit(failures.length ? 1 : 0);
