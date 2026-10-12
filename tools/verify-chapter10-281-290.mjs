#!/usr/bin/env node
/**
 * verify-chapter10-281-290 — the Grimoire, Forget to Keen Edge.
 *
 * NEW at 3.590.0. Graham's R1-R7 of 25 September 2026, "your
 * recommendation for all".
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS BLOCK'S FINDINGS CAME FROM AUTHORING IT, NOT FROM READING IT.
 *
 * The audit named eleven ladders, two transformations, eight spells with
 * rails and one that cannot be built. Writing them found SIX defects
 * that a reading would not have, and five of the six were mine, caught
 * the same afternoon:
 *
 *   A ROLLED DURATION PARSED AS THE WRONG NUMBER. "1d4 minutes" came out
 *   as 40 rounds and "3d6 rounds" as 6, because the numeric matcher
 *   found the digit that happened to sit before the unit. A confident
 *   number, from a string the author wrote correctly.
 *
 *   A MALFORMED `defence` ROW SAID NOTHING AT ALL. `applyDefenceEffect`
 *   returns null for a field outside its three, and the case fell
 *   through with no line pushed — the only kind in this applier that
 *   could fail invisibly. Found by writing one: Iron Body was authored
 *   `field: "dr"`, which is a real pool and not a defence field, and the
 *   cast printed a clean card with the DR silently absent.
 *
 *   `conjureItem` COPIES; IT DOES NOT DESCRIBE. Goodberry was authored
 *   with `name` and `description`, which the normaliser does not read,
 *   and there was no Goodberry in any conjurable pack either — so the
 *   spell made nothing and said it was malformed.
 *
 *   A CONJURED ITEM HAD NO CLOCK. Goodberry lasts a day; Bless Water's
 *   Holy Water is meant to be kept. The mechanism could only do the
 *   second, so five permanent healing berries for two PP.
 *
 *   `trait` IS THE POLYMORPH CHANNEL. Keen Edge was authored
 *   `{kind:"trait", traits:"keen"}`, which puts the word on the CREATURE.
 *   All three of Keen's readers ask the WEAPON, so the spell's entire
 *   mechanism would have applied cleanly, printed correctly, and changed
 *   no roll.
 *
 *   "startOfTurn" HAD NEVER FIRED — and this one was not mine. The
 *   moment has been in `RECURRING_WHEN` since 3.587.0;
 *   `normaliseRecurringLadder` accepted it, `recordRecurringLadder`
 *   wrote it onto the Region, and the cast card printed "Anyone
 *   BEGINNING a turn inside rolls ..." while the only caller was
 *   `_onEndTurn` with "endOfTurn" written into the call. A vocabulary
 *   entry with no driver: what had been measured was that the WORD was
 *   accepted, never that anything acted on it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND TWO THINGS I ALMOST "FIXED" THAT WERE RIGHT.
 *
 * Gaseous Form's "immune to bleed" looks inert from the damage layer —
 * `resolveAgainstDefences` does not know the word, and 20 bleed damage
 * against an actor immune to "bleed" lands 20. But bleeding is a
 * CONDITION, applied from some forty-five places that all ask
 * `isImmuneToCondition`, and that answers true for both spellings.
 * Section G pins it so the next reader does not undo it.
 *
 * Indomitable's base is a TRIGGER, not a suppression, and
 * `verify-condition-suppression` X2 had already pinned that decision
 * with its reason. Authoring it as a `suppress` row would have given a
 * standing "ignore 2 dazed AND 2 weakened for ten minutes", never
 * consumed. Section H pins that it stayed a note.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  GRANTABLE_WEAPON_TRAITS, WEAPON_TRAIT_FLAG, normaliseWeaponTrait,
  unreadableWeaponTraits, weaponHasSpellTrait, weaponTraitLine
} from "../module/magic/weapon-trait.mjs";
import {
  marginDurationText, parseRolledDuration, rolledDurationText, roundsFromMargin
} from "../module/magic/condition-timing-rules.mjs";
import { parseSpellDuration, unreadableEffectDurations } from "../module/magic/effect-duration.mjs";
import { normaliseConjuredItem, CONJURABLE_PACKS } from "../module/magic/conjured-item.mjs";
import { normaliseSaveLadder, normaliseRecurringLadder } from "../module/magic/save-ladder.mjs";
import { normaliseLightShift } from "../module/magic/light-shift.mjs";
import { declaredDegrees, effectAppliesOnDegree } from "../module/magic/spell-degrees.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { bonusTargetFor } from "../module/magic/spell-effects.mjs";
import { areaRegionIsClaimed, shouldClearAreaRegion } from "../module/magic/area-region-life.mjs";
// THE SAME MAP THE PACK-WIDE CENSUS READS. Restating it here answered
// the question a second time and worse — see tools/lib/self-ending-conditions.mjs.
import { SELF_ENDING } from "./lib/self-ending-conditions.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const equal = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const code = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
// COMMENTS STRIPPED BEFORE ASKING SOURCE ANYTHING — block 26 had two
// checks fail because they matched the comment describing the bug they
// forbade. A comment about a defect always contains the defect.
const codeOnly = (...p) => code(...p)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

async function packOf(name, type) {
  const dir = path.join(SYSTEM_ROOT, "packs", name);
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!")) continue;
      if (type && value?.type !== type) continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await packOf("spells", "spell");
const consumables = await packOf("consumables", "consumable");
ok("A0 the spells pack could be read", spells !== null);
ok("A0b the consumables pack could be read", consumables !== null);

const sysOf = (n) => spells?.get(n.toLowerCase())?.system ?? null;
const rowsOf = (n) => sysOf(n)?.effects ?? [];
const rowOf = (n, kind) => rowsOf(n).find((r) => r.kind === kind) ?? null;
const rowsKind = (n, kind) => rowsOf(n).filter((r) => r.kind === kind);
const warpsOf = (n) => sysOf(n)?.warps ?? [];
/** The non-note rows that reach a target who rolled this degree. */
const onDegree = (n, degree) => rowsOf(n)
  .filter((r) => r.kind !== "note" && effectAppliesOnDegree(r, degree));
const notesOf = (n) => rowsKind(n, "note").map((r) => String(r.text ?? "")).join(" ");

const applier = codeOnly("module", "magic", "spell-effects.mjs");

/* ================================================================== *
 * A. THE NEW KIND IS DECLARED, REACHABLE, AND READ
 * ================================================================== */

ok("A1 \"weaponTrait\" is declared handled", HANDLED_EFFECT_KINDS.includes("weaponTrait"));
ok("A2 the applier has a case for it", applier.includes('case "weaponTrait": {'),
  "a declared kind with no case prints Unhandled effect kind on a paid-for cast");

/*
 * A3 IS THE CHECK THIS WHOLE KIND EXISTS FOR. `trait` applies cleanly
 * and prints correctly for Keen Edge; it simply writes the word onto the
 * wrong document. So the thing worth asserting is not that a case exists
 * but that the WEAPON is what carries it and the ATTACK is what reads it.
 */
const attack = codeOnly("module", "combat", "attack-workflow.mjs");
ok("A3 THE ATTACK ASKS THE WEAPON, not the wielder's traits",
  /const keen = [\s\S]{0,400}?weaponHasSpellTrait\(/.test(attack),
  "a spell-granted keen that nothing consults is the defect this kind was built to remove");
ok("A3b and it is folded into the EXISTING test rather than beside it",
  (attack.match(/const keen = /g) ?? []).length === 1
  && (attack.match(/weaponHasSpellTrait\(/g) ?? []).length === 1
  && /const keen = [\s\S]{0,400}?materialGrantedWeaponTraits\(/.test(attack),
  "3.573.0's lesson: ONE answer to \"is this blow keen\", asked at ONE site — a second call "
  + "is a second thing to keep in step, which is how the material grant went unread for months");
ok("A4 the applier stamps the CHOSEN weapon ids onto the spec",
  /case "weaponTrait": \{[\s\S]*?traitSpec\.weaponIds = traitWeapons;/.test(applier));
ok("A5 and chooses them through the shared weapon prompt",
  /case "weaponTrait": \{[\s\S]*?promptRiderWeapon: promptTraitWeapon/.test(applier),
  "four mechanisms now ask \"which weapon\"; they must ask it one way");
ok("A6 a trait nothing reads is refused out loud",
  /case "weaponTrait": \{[\s\S]*?unreadableWeaponTraits\(traitSpec\)[\s\S]*?nothing applied/.test(applier),
  "the position `ward` takes for a defence slot nobody implements");

equal("A7 keen normalises", JSON.stringify(normaliseWeaponTrait(
  { kind: "weaponTrait", label: "Keen Edge", traits: ["keen"], weapons: 1 })),
  JSON.stringify({ traits: ["keen"], label: "Keen Edge", weapons: 1 }));
equal("A8 a comma string is the same as a list",
  JSON.stringify(normaliseWeaponTrait({ kind: "weaponTrait", traits: "Keen, Razor" }).traits),
  JSON.stringify(["keen", "razor"]),
  "TWO traits, because a one-word string splits to itself and could not tell the two apart");
equal("A9 the polymorph kind is not this one",
  normaliseWeaponTrait({ kind: "trait", traits: "keen" }), null);
equal("A10 no traits is malformed", normaliseWeaponTrait({ kind: "weaponTrait", traits: "" }), null);
equal("A11 weapons floors at one",
  normaliseWeaponTrait({ kind: "weaponTrait", traits: "keen", weapons: -3 }).weapons, 1,
  "MINUS three, not zero: Number(0) is falsy, so `|| 1` answered this before the floor did");
equal("A12 razor is NOT grantable", unreadableWeaponTraits(
  normaliseWeaponTrait({ kind: "weaponTrait", traits: "razor" })).join(","), "razor",
  "Razor rides the RUNE channel (runeBonusesFor().criticalAV), not the trait string");
equal("A13 the grantable list is exactly what has a reader",
  JSON.stringify(GRANTABLE_WEAPON_TRAITS), JSON.stringify(["keen"]),
  "grow this when a reader grows, not before");

{
  const eff = [{ disabled: false, flags: { "trg-prime": { [WEAPON_TRAIT_FLAG]: { traits: ["keen"], weaponIds: ["sword"] } } } }];
  ok("A14 THE CHOSEN WEAPON IS KEEN", weaponHasSpellTrait(eff, "sword", "keen"));
  ok("A15 AND THE ONE BESIDE IT IS NOT", !weaponHasSpellTrait(eff, "bow", "keen"),
    "\"a rider bound to one weapon reaches that weapon and no other\"");
  ok("A16 a DISABLED effect grants nothing",
    !weaponHasSpellTrait([{ ...eff[0], disabled: true }], "sword", "keen"),
    "an Antimagic Field switches a spell off rather than deleting it (3.586.0)");
  ok("A17 an empty weapon id matches nothing",
    !weaponHasSpellTrait(
      [{ flags: { "trg-prime": { [WEAPON_TRAIT_FLAG]: { traits: ["keen"], weaponIds: ["", "sword"] } } } }],
      "", "keen"),
    "the BLANK IS IN THE LIST, which is the only shape where the guard is load-bearing: without "
    + "it `[\"\"].includes(\"\")` is true and an unidentified weapon carries the enchantment");
  ok("A18 a spec with no weaponIds reaches nothing",
    !weaponHasSpellTrait([{ flags: { "trg-prime": { [WEAPON_TRAIT_FLAG]: { traits: ["keen"] } } } }], "sword", "keen"));
  ok("A19 another trait on the same weapon is not this one",
    !weaponHasSpellTrait(eff, "sword", "agile"));
  ok("A20 the card names the weapon and the trait",
    weaponTraitLine({ traits: ["keen"] }, "Borin", ["Broadsword"]).includes("Broadsword")
    && weaponTraitLine({ traits: ["keen"] }, "Borin", ["Broadsword"]).includes("keen"));
}

/* ================================================================== *
 * B. KEEN EDGE ITSELF
 * ================================================================== */

{
  const row = rowOf("Keen Edge", "weaponTrait");
  ok("B1 KEEN EDGE GRANTS ITS TRAIT TO A WEAPON", row !== null,
    "the spell's whole mechanism is one word; a `trait` row puts it on the creature");
  equal("B1b and the trait is keen", JSON.stringify(normaliseWeaponTrait(row)?.traits), JSON.stringify(["keen"]));
  ok("B1c there is no `trait` row left behind", rowOf("Keen Edge", "trait") === null,
    "two rows would put the word in both places and only one would be read");
  equal("B2 it targets the creature holding the weapon", row?.target, "targets",
    "Range touch: the prompt then runs against THAT actor's items");
  ok("B3 the 50-projectiles half is said out loud", /ammunition/i.test(notesOf("Keen Edge")),
    "measured live: arrows are `ammunition` items and the weapon prompt offers `weapon` items only");
  ok("B4 and so is the already-Keen restriction", /already Keen/i.test(notesOf("Keen Edge")));
  ok("B5 the duration is readable", parseSpellDuration(sysOf("Keen Edge")?.duration) !== null,
    "an unreadable one leaves the weapon keen for ever");
  ok("B6 the razor warp stays inert",
    warpsOf("Keen Edge").some((w) => /razor/i.test(String(w.text))
      && Object.keys(w.mods ?? {}).length === 0),
    "Razor is a rune bonus, not a trait; wiring it here would grant a word nothing reads");
}

/* ================================================================== *
 * C. A ROLLED DURATION IS NOT A NUMBER
 * ================================================================== */

equal("C1 \"1d4 minutes\" IS NOT FORTY ROUNDS", parseSpellDuration("1d4 minutes"), null,
  "it used to read the FOUR");
equal("C2 \"3d6 rounds\" IS NOT SIX ROUNDS", parseSpellDuration("3d6 rounds"), null,
  "it used to read the SIX");
equal("C3 nor \"2d8 hours\"", parseSpellDuration("2d8 hours"), null);
equal("C4 a spaced die is still a die", parseSpellDuration("1 d 4 minutes"), null);
equal("C5 AND A PLAIN NUMBER STILL READS", parseSpellDuration("10 minutes")?.rounds, 100,
  "around a hundred and fifty pack entries go through this branch");
equal("C6 one round is still one round", parseSpellDuration("1 round")?.rounds, 1);
equal("C7 permanent is still permanent", parseSpellDuration("permanent")?.permanent, true);
equal("C8 sustained is still sustained", parseSpellDuration("sustained")?.sustained, true);
equal("C9 a turn-relative phrase still reads",
  parseSpellDuration("until the end of their next turn")?.rounds, 2);

/*
 * C10 IS THE MEASUREMENT THAT MADE C1 SAFE. If any pack duration
 * contained dice today, refusing them would turn a working entry into a
 * ship-blocking fault. Asserted rather than remembered, because the pack
 * changes every release and the claim is only true while it is true.
 */
{
  const withDice = [];
  for (const [, doc] of spells ?? []) {
    const d = String(doc?.system?.duration ?? "");
    if (/\d+\s*d\s*\d+/i.test(d)) withDice.push(`${doc.name}: ${d}`);
    for (const row of doc?.system?.effects ?? []) {
      const rd = String(row?.duration ?? "");
      if (rd && /\d+\s*d\s*\d+/i.test(rd)) withDice.push(`${doc.name} row: ${rd}`);
    }
  }
  equal("C10 NO PACK DURATION CONTAINS DICE, which is what makes C1 safe",
    withDice.join("; "), "",
    "a rolled duration says so with `durationRoll`, which is rolled when the condition lands");
}

/* ================================================================== *
 * D. A LENGTH COMPUTED FROM HOW BADLY THE SAVE WAS MISSED
 * ================================================================== */

/*
 * THE MARGIN ARRIVES NEGATIVE. Re-measured live in Graham's world on 25
 * September: a Will save of 18 against DC 25 reports margin -7. A check
 * written against +7 would pass on arithmetic and be wrong in play, so
 * the sign is asserted in the direction the engine actually produces.
 */
equal("D1 failed by 7, one round per 2", roundsFromMargin(-7, 2), 3);
equal("D2 failed by 9, one round per 4", roundsFromMargin(-9, 4), 2);
equal("D3 FAILED BY ONE STILL COSTS A ROUND", roundsFromMargin(-1, 2), 1,
  "zero rounds is a condition applied and instantly gone — the page gives it the condition");
equal("D4 AN UNMEASURED MARGIN IS NOT A MARGIN OF ZERO", roundsFromMargin(null, 2), null,
  "Number(null) is 0 and 0 is finite; the two must not be one answer");
equal("D4b nor is an absent one", roundsFromMargin(undefined, 2), null);
equal("D4c nor a NaN one", roundsFromMargin("nonsense", 2), null);
equal("D5 a step of zero is refused", roundsFromMargin(-9, 0), null);
equal("D6 the text it produces is a duration string",
  marginDurationText(roundsFromMargin(-9, 4)), "2 rounds",
  "deliberately a STRING, so it rejoins parseSpellDuration — the one reader that decides what a duration means");
equal("D7 one round is singular", marginDurationText(1), "1 round");

equal("D8 a rolled duration parses to formula and unit",
  JSON.stringify(parseRolledDuration("1d4 minutes")), JSON.stringify({ formula: "1d4", unit: "minute" }));
equal("D9 and its text floors at one", rolledDurationText(0, "round"), "1 round",
  "a 3d6 that came up 0 is not a condition that never applied");
equal("D10 plural above one", rolledDurationText(3, "round"), "3 rounds");

/* ================================================================== *
 * E. THE LADDERS THIS BLOCK AUTHORED
 * ================================================================== */

/*
 * EACH RUNG IS ASSERTED BY WHAT REACHES A TARGET WHO ROLLED IT, not by
 * counting rows. Block 27's six flat rows all had the right NUMBER of
 * effects; what was wrong was which degrees they reached.
 */
{
  // FORGET — three lengths of suppressed memory, and no condition to
  // hang a clock on, so the rungs are printed.
  equal("E1 Forget: a Critical is unaffected", onDegree("Forget", "critical").length, 0);
  ok("E1b its three lengths are each said",
    /1 week/.test(notesOf("Forget")) && /1 month/.test(notesOf("Forget")) && /1 year/.test(notesOf("Forget")));
  ok("E1c and it applies no condition it cannot end",
    rowsKind("Forget", "condition").length === 0,
    "there is no condition for a suppressed memory; inventing one would need a clock");

  // JOLTS — the basic-save shape, and the header omitted the word.
  ok("E2 JOLTS IS A BASIC SAVE", /basic/i.test(String(sysOf("Jolts")?.defence ?? "")),
    "as printed, a SUCCESSFUL save took the full 2d6 — the Divine Decree defect, fourth of its shape");
  equal("E2b only a fumble is stunned", rowsKind("Jolts", "condition").length, 1);
  equal("E2c and it is stunned 1", rowOf("Jolts", "condition")?.value, 1);
  equal("E2d a success is not stunned", onDegree("Jolts", "success").length, 0);
  equal("E2e nor a failure", onDegree("Jolts", "failure").length, 0);
  equal("E2f a fumble is", onDegree("Jolts", "fumble").length, 1);

  // HAZE OF DREAMS — half speed, then slowed.
  equal("E3 Haze Of Dreams: a success is untouched", onDegree("Haze Of Dreams", "success").length, 0);
  equal("E3b a failure is slowed in feet only", onDegree("Haze Of Dreams", "failure").length, 1);
  equal("E3c and a fumble takes the condition too", onDegree("Haze Of Dreams", "fumble").length, 2);
  equal("E3d the speed penalty lands on every speed the creature has",
    rowOf("Haze Of Dreams", "bonus")?.slot, "allSpeeds");
  ok("E3e and the half-speed approximation is admitted",
    /half/i.test(notesOf("Haze Of Dreams")) && /hand/i.test(notesOf("Haze Of Dreams")),
    "nothing in the bonus vocabulary halves a number");

  // HOLY SHOUT — the only spell in the Grimoire with a margin-scaled length.
  equal("E4 Holy Shout: a critical is unaffected", onDegree("Holy Shout", "critical").length, 0);
  equal("E4b a success is stunned 1", rowsKind("Holy Shout", "condition")
    .find((r) => effectAppliesOnDegree(r, "success"))?.value, 1);
  equal("E4c a partial is stunned 2", rowsKind("Holy Shout", "condition")
    .find((r) => effectAppliesOnDegree(r, "partial"))?.value, 2);
  {
    const fail = rowsKind("Holy Shout", "condition").find((r) => effectAppliesOnDegree(r, "failure"));
    const fumble = rowsKind("Holy Shout", "condition").find((r) => effectAppliesOnDegree(r, "fumble"));
    equal("E4d A FAILURE IS STUNNED ONE ROUND PER TWO", fail?.roundsPerMargin, 2);
    equal("E4e AND A FUMBLE UNCONSCIOUS ONE PER FOUR", fumble?.roundsPerMargin, 4);
    equal("E4f the fumble rung is unconscious, not stunned", fumble?.condition, "unconscious");
    /*
     * E4g GUARDS A LATENT TRAP. `roundsFromMargin` floors at one round,
     * so a row gated onto a SUCCESS would silently grant the minimum
     * rather than refusing — the margin on a success is positive and
     * `failedBy` clamps to zero. The floor is right for the rungs the
     * page gives; the gate is what keeps it off the ones it does not.
     */
    const marginRows = [];
    for (const [, doc] of spells ?? []) {
      for (const row of doc?.system?.effects ?? []) {
        if (row?.roundsPerMargin == null) continue;
        const gates = declaredDegrees(row) ?? [];
        if (gates.some((g) => g !== "failure" && g !== "fumble")) {
          marginRows.push(`${doc.name}: ${JSON.stringify(gates)}`);
        }
      }
    }
    equal("E4g EVERY margin-scaled row is gated to failure or fumble", marginRows.join("; "), "",
      "a success has no failure margin, and the floor would quietly hand it the minimum");
  }
  ok("E4h and both lengths are printed for the table", /per 2/.test(notesOf("Holy Shout")) && /per 4/.test(notesOf("Holy Shout")));

  // GUST — four rungs, and a terrain row that could not be honest.
  // THE LADDER IS READ BY ITS OWN RUNGS (3.609.0, block 33's R2): Gust's 2d6
  // is the Fumble's alone, so the row is ungated and says "" on every other
  // rung. It is left out of the gated count and asserted on its own below.
  const gustRows = (degree) => onDegree("Gust", degree).filter((r) => r.kind !== "saveLadder");
  equal("E5 Gust: a CRITICAL is unaffected", gustRows("critical").length, 0,
    "\"The creature is unaffected\" — the rung most easily lost when a row's gate is widened");
  equal("E5a and a success cannot move against the wind", gustRows("success").length, 0,
    "printed, because nothing models \"against\" a direction");
  {
    const ladder = rowOf("Gust", "saveLadder")?.ladder ?? {};
    ok("E5e and its ladder deals 2d6 on the Fumble alone",
      ladder.fumble === "2d6" && ["critical", "success", "partial", "failure"].every((k) => ladder[k] === ""));
  }
  equal("E5b a failure is prone", rowsKind("Gust", "condition")
    .filter((r) => effectAppliesOnDegree(r, "failure")).length, 1);
  ok("E5c THERE IS NO SAVE-GATED TERRAIN ROW", rowOf("Gust", "difficultTerrain") === null,
    "a terrain row is written onto the REGION, which never sees a degree — it would have made "
    + "the whole blast difficult ground for everyone, including the criticals, and said nothing");
  ok("E5d and the flyer's worse result is admitted", /FLYING/i.test(notesOf("Gust")));
}

/* ================================================================== *
 * F. THE TWO SAVE LADDERS, AND THE ONE WHOSE SAVE IS NOT AT THE CAST
 * ================================================================== */

{
  const hr = normaliseSaveLadder(rowOf("Hand Of The Reaper", "saveLadder"));
  ok("F1 Hand Of The Reaper carries a ladder", hr !== null);
  equal("F1b its Critical is harmless", hr?.ladder?.critical, "");
  equal("F1c success 4d10", hr?.ladder?.success, "4d10");
  equal("F1d partial 6d10", hr?.ladder?.partial, "6d10");
  equal("F1e failure 8d10", hr?.ladder?.failure, "8d10");
  equal("F1f fumble 12d10", hr?.ladder?.fumble, "12d10");
  equal("F1g a failure carries a Serious critical", hr?.criticalOn?.failure, "serious");
  equal("F1h and a fumble a Deadly one", hr?.criticalOn?.fumble, "deadly");
  equal("F1i the damage is essence", hr?.damageType, "essence");
  ok("F1j and \"dies instantly at 0 HP\" is said, not silently dropped",
    /DIES INSTANTLY/i.test(notesOf("Hand Of The Reaper")),
    "the damage path routes a creature at 0 into dying and takes no \"this one does not get up\"");

  /*
   * F2 IS THE ONE THAT FOUND THE MISSING DRIVER. Incendiary Cloud's save
   * is rolled when a creature STARTS ITS TURN in the cloud, so it has no
   * cast-time ladder at all — and the moment it needs had never fired.
   */
  const icRow = rowOf("Incendiary Cloud", "saveLadder");
  ok("F2 Incendiary Cloud declares a recurring ladder", icRow?.recurring != null);
  equal("F2b AND NO CAST-TIME ONE", normaliseSaveLadder(icRow), null,
    "\"each creature that STARTS ITS TURN in the spell's area\" — a creature standing in it "
    + "when it appears has not started a turn there yet");
  const ic = normaliseRecurringLadder(icRow?.recurring);
  ok("F2c the recurring ladder normalises", ic !== null);
  equal("F2d at the START of a turn", ic?.on, "startOfTurn");
  equal("F2e against Fortitude", ic?.save, "fortitude");
  equal("F2f in fire", ic?.damageType, "fire");
  equal("F2g EVERY RUNG BURNS, including the Critical", ic?.ladder?.critical, "2d6",
    "this spell prints no harmless outcome, so there is no empty rung");
  equal("F2h success 4d6", ic?.ladder?.success, "4d6");
  equal("F2i partial 4d6 and a Minor", `${ic?.ladder?.partial}/${ic?.criticalOn?.partial}`, "4d6/minor");
  equal("F2j failure 6d6 and a Serious", `${ic?.ladder?.failure}/${ic?.criticalOn?.failure}`, "6d6/serious");
  equal("F2k fumble 8d6 and a Deadly", `${ic?.ladder?.fumble}/${ic?.criticalOn?.fumble}`, "8d6/deadly");

  /*
   * F3 IS THE DEFECT ITSELF, and it is asserted against the SOURCE
   * because no pure function can be asked whether a turn boundary calls
   * one. The vocabulary accepted "startOfTurn" from 3.587.0; nothing
   * ever passed it.
   */
  const combat = codeOnly("module", "documents", "combat.mjs");
  ok("F3 THE START OF A TURN DRIVES ITS OWN LADDERS",
    /applyRecurringLadders\([\s\S]{0,120}?"startOfTurn"\)/.test(combat),
    "a vocabulary entry with no driver: accepted, recorded, announced on the card, never rolled");
  ok("F3b and the end of a turn still drives its own",
    /applyRecurringLadders\([\s\S]{0,120}?"endOfTurn"\)/.test(combat));
  ok("F3c the sweep answers per zone, not per call",
    codeOnly("module", "magic", "recurring-ladder-workflow.mjs")
      .includes("if (spec.on !== moment) continue;"),
    "one sweep serves both boundaries; a start-of-turn ladder must not fire at the end");
  ok("F3d the two calls are distinct sites",
    (combat.match(/applyRecurringLadders\(/g) ?? []).length === 2);

  /*
   * F3e IS THE SECOND REASON A RECURRING LADDER NEVER FIRED, and it is
   * the one the driver fix at 3.590.0 did not touch.
   *
   * `recordRecurringLadder` stamps the ladder onto the Region the
   * template drew \u2014 and `shouldClearAreaRegion` then DELETES that
   * Region at the end of the cast unless something claimed it. A
   * `saveLadder` was not a claiming kind, so the flag was written onto a
   * Region with seconds to live. The record SUCCEEDS, which is why
   * nothing said a word.
   *
   * FOUND BY CASTING IT, 25 September 2026: "20 ft radius template
   * placed \u2014 caught 3" and no Region on the scene afterwards.
   *
   * The claim is the `recurring` FIELD and not the kind: six spells
   * carry a plain cast-time ladder that has resolved by the time the
   * card prints, and claiming for those would put a Region on the scene
   * per cast \u2014 the 3.480.0 littering, reintroduced by its own fix.
   */
  ok("F3e A RECURRING LADDER KEEPS THE REGION IT IS WRITTEN ON",
    areaRegionIsClaimed({ effects: [rowOf("Incendiary Cloud", "saveLadder")] }),
    "the ladder is recorded onto a Region the cast then deletes");
  ok("F3f AND A PLAIN CAST-TIME LADDER STILL DOES NOT",
    !areaRegionIsClaimed({ effects: [{ kind: "saveLadder", ladder: { success: "4d6" } }] }),
    "six spells carry one; claiming for them litters a Region per cast");
  ok("F3g so the cast does not release Incendiary Cloud's Region",
    !shouldClearAreaRegion("r1", { effects: [rowOf("Incendiary Cloud", "saveLadder")] }));
  ok("F3h but a REFUNDED cast still releases it",
    shouldClearAreaRegion("r1", { effects: [rowOf("Incendiary Cloud", "saveLadder")] }, false, true),
    "a cast called off claims nothing, whatever the spell declares");
  /*
   * F3i IS THE CENSUS. Disturbing Tentacles shipped the recurring ladder
   * at 3.587.0 and did not claim either, so its "whenever a creature
   * ends its turn in the area" Will save had never been rolled once.
   * Asked of every such spell rather than the two that exist today.
   */
  ok("F3j EVERY recurring ladder in the pack keeps its Region", (() => {
    const unclaimed = [];
    for (const [, doc] of spells ?? []) {
      const rows = doc?.system?.effects ?? [];
      if (!rows.some((r) => r?.kind === "saveLadder" && r?.recurring)) continue;
      if (!areaRegionIsClaimed(doc.system)) unclaimed.push(doc.name);
    }
    return unclaimed.length === 0;
  })(), "a ladder on a deleted Region is recorded successfully and never rolled");
  ok("F3k and each one's duration can be counted, so the kept Region ends",
    (() => {
      for (const [, doc] of spells ?? []) {
        const rows = doc?.system?.effects ?? [];
        if (!rows.some((r) => r?.kind === "saveLadder" && r?.recurring)) continue;
        if (parseSpellDuration(doc.system?.duration) === null) return false;
      }
      return true;
    })(), "a claimed Region with no ending is the 3.500.0 defect");

  ok("F4 the concealment and the drift are printed rather than pretended",
    /concealed/i.test(notesOf("Incendiary Cloud")) && /10 feet/i.test(notesOf("Incendiary Cloud")));
}

/* ================================================================== *
 * G. THE TWO TRANSFORMATIONS
 * ================================================================== */

{
  ok("G1 Gaseous Form resists physical", rowsKind("Gaseous Form", "defence")
    .some((r) => r.field === "resistance" && /physical/i.test(String(r.value))));
  /*
   * G2 IS THE ROW I ALMOST "FIXED". From the damage layer it looks
   * inert: `resolveAgainstDefences` does not know the word "bleed", and
   * 20 bleed damage against an actor immune to it lands 20 — measured
   * live. But bleeding is a CONDITION, and `isImmuneToCondition`
   * answers true for both "bleed" and "bleeding", also measured live.
   * The row works; the probe was asking the wrong layer.
   */
  ok("G2 AND IS IMMUNE TO BLEED AND PRECISION", rowsKind("Gaseous Form", "defence")
    .some((r) => r.field === "immunity" && /bleed/i.test(String(r.value)) && /precision/i.test(String(r.value))),
    "bleed is a CONDITION here; isImmuneToCondition reads both spellings — do not \"fix\" this row");
  equal("G3 and it flies at 10 feet", rowOf("Gaseous Form", "speedGrant")?.feet, 10);
  equal("G3b on the fly key", rowOf("Gaseous Form", "speedGrant")?.key, "fly");
  ok("G4 the subtractive half is printed, not pretended",
    /removes a bonus|loses|LOSES/i.test(notesOf("Gaseous Form")),
    "nothing in the effect vocabulary removes a bonus a creature already has");

  /*
   * G5 IS THE SILENT-NOTHING DEFECT, CAUGHT BY WRITING ONE. `dr` is a
   * real pool-only bonus target (TARGET_SLOTS.dr is `{}`) and NOT one of
   * the three defence fields, so `{kind:"defence", field:"dr"}` resolved
   * to null and the case pushed no line. Driven live afterwards: the
   * bonus row takes the dummy's DR 0 -> 8, and a 20-point slashing hit
   * from 20 -> 12.
   */
  const ib = rowsKind("Iron Body", "bonus");
  ok("G5 IRON BODY'S DR IS A BONUS ROW", ib.some((r) => r.slot === "dr" && Number(r.value) === 8),
    "`{kind:\"defence\", field:\"dr\"}` is not one of the three fields and resolved to nothing");
  ok("G5b and dr is a slot a bonus can land on", bonusTargetFor("dr") !== null);
  ok("G6 NO DEFENCE ROW ANYWHERE NAMES A FIELD OUTSIDE THE THREE", (() => {
    const stray = [];
    for (const [, doc] of spells ?? []) {
      for (const row of doc?.system?.effects ?? []) {
        if (row?.kind !== "defence") continue;
        const f = String(row.field ?? "immunity");
        if (!["immunity", "resistance", "weakness"].includes(f)) stray.push(`${doc.name}: ${f}`);
      }
    }
    return stray.length === 0;
  })(), "a census, because the applier could only fail silently for these until this release");
  ok("G7 AND A MALFORMED ONE NOW SAYS SO", (() => {
    const m = /case "defence": \{[\s\S]*?\n        \}/.exec(applier);
    if (!m) return false;
    const body = m[0];
    // THE SUCCESS PATH MUST LEAVE BEFORE THE REFUSAL. Without the break a
    // row that WORKED prints its line and then the "nothing applied"
    // apology underneath it — the anti-silence rule inverted a second
    // time, which is the shape 3.411.1 recorded for the bonus card.
    const exits = /lines\.push\(line\(`\$\{target\.name\}: <strong>\$\{described\}[\s\S]{0,120}?break;\s*\}/.test(body);
    return exits && /nothing applied/.test(body) && /immunity, resistance or weakness/.test(body);
  })(), "every sibling case announces its own malformed row; this was the only one that could not");
  equal("G8 iron body's racial strength", rowsKind("Iron Body", "bonus")
    .find((r) => r.slot === "strength")?.bonusType, "racial");
  equal("G8b and its racial dexterity penalty", rowsKind("Iron Body", "bonus")
    .find((r) => r.slot === "dexterity")?.value, -3);
  ok("G9 the \"changes to 8\" reading is admitted", /CHANGES TO 8/i.test(notesOf("Iron Body")),
    "the DR pool only ever adds; a creature that already has DR comes out higher");
}

/* ================================================================== *
 * H. WHAT WAS DELIBERATELY NOT BUILT
 * ================================================================== */

ok("H1 INVULNERABILITY IS A NOTE, AND THAT IS A STATEMENT",
  rowsOf("Invulnerability").every((r) => r.kind === "note")
  && /artifacts|deific/i.test(notesOf("Invulnerability")),
  "\"immune to everything except what the GM considers potent\" has no rail and should not");

/*
 * H2 RESTATES `verify-condition-suppression` X2 FROM THIS SIDE. That
 * check pins the decision; this one pins that authoring block 28 did not
 * quietly overturn it. It was overturned, for about an hour, and X2's B3
 * sibling is what reported the leftover warp mods afterwards.
 */
ok("H2 Indomitable's base is still a note", rowsOf("Indomitable").every((r) => r.kind === "note"),
  "a `suppress` row IGNORES points continuously; this spell waits for the condition, "
  + "reduces it once, and ENDS — a suppression would never be consumed");
ok("H2b and its two warps are still inert",
  warpsOf("Indomitable").filter((w) => /ignore the injured|amount condition ignored/i.test(String(w.text)))
    .every((w) => Object.keys(w.mods ?? {}).length === 0),
  "deleting an edit does not delete what it already wrote — \"idempotent\" covers only the fields a script owns");

ok("H3 Freedom prints no invented number",
  rowsOf("Freedom").every((r) => r.kind === "note")
  && !/\+4|\+2/.test(notesOf("Freedom")),
  "authored first as a +4 status conditional — a figure that appears nowhere on the page");
ok("H3b and its automatic success is said", /AUTOMATICALLY SUCCEEDS/i.test(notesOf("Freedom")),
  "nothing in the check engine grants an automatic success");

ok("H4 Grace's move action is printed", /MOVE ACTION/i.test(notesOf("Grace")),
  "the cast cannot spend a move action for you");

for (const [name, why] of [
  ["Grant Spell", "the granted spell is chosen by hand at the table"],
  ["Lay Of The Land", "the radius the warp raises was never placed"]
]) {
  ok(`H5 ${name}'s inert warp was left alone`, warpsOf(name).some((w) => Object.keys(w.mods ?? {}).length === 0),
    `${why} — writing mods:{} over mods:{} claims an edit and changes nothing`);
}

/* ================================================================== *
 * J. THE BERRY, AND THE CLOCK A CONJURED ITEM DID NOT HAVE
 * ================================================================== */

{
  const row = rowOf("Goodberry", "conjureItem");
  const spec = normaliseConjuredItem(row);
  ok("J1 GOODBERRY'S ROW NORMALISES", spec !== null,
    "authored first with `name` and `description`, which the normaliser does not read");
  equal("J1b it names the consumables pack", spec?.pack, "consumables");
  ok("J1c which is a pack a spell may conjure from", CONJURABLE_PACKS.includes(spec?.pack ?? ""));
  equal("J1d and makes five", spec?.quantity, 5);

  /*
   * J2 IS THE HALF THAT WOULD HAVE BEEN MISSED. `conjureItem` COPIES a
   * compendium entry; there was no Goodberry in any conjurable pack, so
   * a correctly-shaped row would still have made nothing and said so.
   */
  /*
   * J2 FOLLOWS THE ROW'S OWN NAME, not a name typed here. Asking the
   * consumables pack for "goodberry" is satisfied by the berry existing
   * whatever the spell points at — and `conjureItemOnto` matches on the
   * row's `itemName`, so a single mistyped letter there makes the spell
   * create nothing while this check goes on passing.
   */
  const berry = consumables?.get(String(spec?.itemName ?? "").trim().toLowerCase()) ?? null;
  ok("J2 THE BERRY EXISTS IN THE PACK THE ROW NAMES", berry !== null,
    `the row names "${spec?.itemName}"; a row that names nothing prints `
    + "conjuredItemMissingLine and creates no item");
  equal("J2b and it is a consumable", berry?.type, "consumable");
  /*
   * J2c: FOUNDRY IDS ARE SIXTEEN CHARACTERS. The berry shipped with a
   * seventeen-character one at 3.590.0, so the document loaded with
   * `_id: null`. Harmless — creation assigns a fresh id, and the
   * conjured stack worked perfectly in Graham's world — but a pack entry
   * the platform refuses to identify is wrong, and it is the kind of
   * wrong that sends the next reader bisecting an unrelated hang.
   *
   * Asked of EVERY consumable, not just this one, because a hand-written
   * id is a thing a future author will do again.
   */
  ok("J2c every consumable's id is a Foundry id", (() => {
    const bad = [];
    for (const [, doc] of consumables ?? []) {
      const id = String(doc?._id ?? "");
      if (id.length !== 16) bad.push(`${doc.name}: "${id}" (${id.length})`);
    }
    return bad.length === 0;
  })(), "a 17-character id loads as null");
  {
    const eff = berry?.flags?.["trg-prime"]?.consumable?.effect ?? null;
    ok("J3 IT CARRIES ITS OWN HEALING", Array.isArray(eff?.effects) && eff.effects.length === 1,
      "the rail the five Potions of Cure use: a consumable's own `effects`, resolved by applySpellEffects");
    equal("J3b of one point", eff?.effects?.[0]?.formula, "1");
    equal("J3c onto whoever eats it", eff?.effects?.[0]?.target, "self");
    equal("J3d as a heal", eff?.effects?.[0]?.kind, "heal");
    equal("J3e used, not drunk", berry?.flags?.["trg-prime"]?.consumable?.kind, "other");
  }

  /*
   * J4 IS THE CLOCK. Goodberry lasts a day; Bless Water's Holy Water is
   * meant to be kept. The mechanism could only do the second.
   */
  ok("J4 A CONJURED ITEM CAN NOW EXPIRE",
    // RE-ANCHORED AT 3.594.0: the call gained a `stamp` argument for the
    // Power Crystal's points. The clock is still opt-in by duration and
    // still passed the same way, which is what this check is about.
    /case "conjureItem": \{[\s\S]*?conjureItemOnto\(target, spec, \{\s*castId, expires: conjureExpires/.test(applier),
    "without it, five permanent healing berries for two PP");
  ok("J4b opt-in by the duration the spell prints",
    /const conjureExpires = parsedDuration !== null && !parsedDuration\.permanent;/.test(applier),
    "Bless Water's duration is blank, so its flask is created exactly as it always was");
  ok("J4c and a companion effect carries the time",
    /case "conjureItem": \{[\s\S]*?spellExpiryTiming\(parsedDuration\)[\s\S]*?createEffectsOn\(target, \[ciData\]\)/.test(applier),
    "Magic Stone's shape: an item has nowhere to keep a duration");
  ok("J4d the item is stamped so the sweep will take it",
    /if \(expires\) \{[\s\S]*?endsWithSpell: true;?\n?\s*\}/.test(
      codeOnly("module", "magic", "conjured-item-workflow.mjs"))
    || /endsWithSpell = true;/.test(codeOnly("module", "magic", "conjured-item-workflow.mjs")),
    "removeSpellItemsByCastId deletes only an item that declares it");
  ok("J4e AND BLESS WATER'S FLASK IS STILL KEPT",
    parseSpellDuration(sysOf("Bless Water")?.duration) === null,
    "the whole opt-in rests on this staying true");
  equal("J4f goodberry's duration is a day", parseSpellDuration(sysOf("Goodberry")?.duration)?.seconds, 86400);

  ok("J5 the 8-point daily cap is counted by hand, and says so",
    /8-POINT DAILY CAP|8 points/i.test(notesOf("Goodberry")),
    "it spans casts, eaters and handfuls; no per-item rail sees across all three");
  ok("J6 and the Medicine bonus is not silently dropped",
    /Medicine/i.test(notesOf("Goodberry")));
}

/* ================================================================== *
 * K. THE REST OF THE RAILS
 * ================================================================== */

{
  equal("K1 Ice Slick is difficult terrain over its area",
    rowOf("Ice Slick", "difficultTerrain")?.target, "area");
  ok("K1b with no save gate", !rowOf("Ice Slick", "difficultTerrain")?.onSave,
    "the page gives the whole area no save; Gust's rung does, which is why Gust has no such row");

  ok("K2 Hypercognition's +5 lands on both skills it can reach",
    rowsKind("Hypercognition", "bonus").length === 2
    && rowsKind("Hypercognition", "bonus").every((r) => Number(r.value) === 5 && r.bonusType === "status"));
  /*
   * K2b ASKS THE ROWS WHICH SLOTS THEY NAME. Written first as a loop over
   * ["senseMotive", "perception"] typed here, which asserts that those
   * two slots exist — true whatever the spell aims at, so a row retargeted
   * to a slot nothing can reach passed it. The check is about THIS
   * SPELL's rows or it is about nothing.
   */
  for (const row of rowsKind("Hypercognition", "bonus")) {
    ok(`K2b "${row.slot}" is a slot a bonus can land on`, bonusTargetFor(row.slot) !== null,
      "measured live: senseMotive and perception are real skill keys carrying a status slot, "
      + "and both went 0 -> 5 on a real sheet");
  }
  equal("K2b2 and there are two of them", rowsKind("Hypercognition", "bonus").length, 2,
    "a zero-row spell would pass the loop above by having nothing to fail");
  /*
   * K2c IS THE HOLE THE MUTATION FOUND. `bonusTargetFor` refused only
   * `allSpeeds`; every other unknown word fell through to
   * `system.combat.<word>` — a path-shaped string rather than a
   * refusal, so `applyBonusEffect`'s `if (!placed)` guard never fired.
   * Measured live: the change reaches the bonus pool and nothing ever
   * resolves it. Asserted here rather than only in spell-effects,
   * because the claim the comment made was believed for five months.
   */
  ok("K2c A SLOT WITH NOWHERE TO LAND IS REFUSED", bonusTargetFor("multitasking") === null,
    "\"null is visible to a harness, a wrong path is not\" — true for allSpeeds alone until 3.590.0");
  ok("K2d and spellcraft is pooled where it actually lives",
    bonusTargetFor("spellcraft") === "system.magic.spellcraft",
    "it was routed through system.combat., which is the same silent nothing under a real name");
  ok("K2e EVERY SLOT ANY PACK ROW NAMES STILL LANDS", (() => {
    const stray = [];
    for (const [, doc] of spells ?? []) {
      for (const row of doc?.system?.effects ?? []) {
        if (row?.kind !== "bonus" || !row.slot) continue;
        // The two EXPANSIONS are refused on purpose (see bonusTargetFor);
        // `allSkills` joined `allSpeeds` at 3.594.0 for Prayer and Qualm.
        if (row.slot === "allSpeeds" || row.slot === "allSkills") continue;
        if (bonusTargetFor(row.slot) === null) stray.push(`${doc.name}: ${row.slot}`);
      }
    }
    return stray.length === 0;
  })(), "the census that made the refusal safe: no authored slot may start refusing");
  ok("K2c and Recall Knowledge's spread is admitted", /Recall Knowledge/i.test(notesOf("Hypercognition")));

  const ls = normaliseLightShift(rowOf("Inner Sanctum", "lightShift"));
  ok("K3 INNER SANCTUM'S CIRCLE NORMALISES", ls !== null,
    "authored first with no radiusFeet, which normaliseLightShift refuses — the card would "
    + "have read \"declares a malformed light shift\"");
  equal("K3b twenty feet of it", ls?.radiusFeet, 20);
  equal("K3c one step brighter", ls?.steps, 1);
  equal("K3d and it does not follow anybody", ls?.follows, false,
    "a sanctum is a placed area, not a glow that trails the caster");
  equal("K3e the row targets the caster, since that is where the template is centred",
    rowOf("Inner Sanctum", "lightShift")?.target, "self",
    "\"area\" is not a recipient the applier knows — it falls through to a targets list an "
    + "area spell with no save does not have");
  {
    const c = rowOf("Inner Sanctum", "conditional");
    equal("K4 its ward is +2 status", c?.grants?.[0]?.value, 2);
    equal("K4b to allies", c?.target, "allies");
    equal("K4c on saves", JSON.stringify(c?.grants?.[0]?.when?.checkTypes), JSON.stringify(["save"]));
    equal("K4d against the three traits printed",
      JSON.stringify(c?.grants?.[0]?.when?.traits),
      JSON.stringify(["possession", "fear", "translocation"]));
  }
  ok("K4e and the counteract check is printed", /counteract/i.test(notesOf("Inner Sanctum")));

  /*
   * K5 IS A RULING I OVERTURNED WITHOUT READING IT, and this is the
   * second time in one block.
   *
   * R7 asked for Heal's "+1 PP: heal an additional 10 HP or 5 soul
   * drain" and I wired `healBonus: 10`. `verify-warped-healing` X1 has
   * pinned that warp as deliberately inert since 3.531.0, with the
   * reasoning: the either/or is the shape Graham ruled on 7 September
   * ("each target gets whichever applies"), but SOUL DRAIN HAS NO
   * RELIEF PATH IN THE HEAL CASE AT ALL \u2014 so a `healBonus` alone
   * SELLS the soul-drain half and delivers only the HP half, which is
   * worse than the warp doing nothing.
   *
   * Asserted from this side too, so a later block reads a decision
   * rather than an empty object. Indomitable's H2 is the other one.
   */
  ok("K5 HEAL'S WARP IS STILL INERT, AND THAT IS A DECISION", (() => {
    const w = warpsOf("Heal").find((x) => /heal an additional 10 HP/i.test(String(x.text)));
    return Boolean(w) && Object.keys(w.mods ?? {}).length === 0;
  })(), "a healBonus alone sells the soul-drain half — see verify-warped-healing X1");
  ok("K5b and the whole either/or is still printed on the warp",
    /soul drain/i.test(String(warpsOf("Heal")
      .find((x) => /heal an additional 10 HP/i.test(String(x.text)))?.text ?? "")),
    "the text is what tells the table there is a second half to settle");
}

/* ================================================================== *
 * L. NOTHING THIS BLOCK AUTHORED CAN OUTLIVE ITS SPELL
 * ================================================================== */

/*
 * THE CENSUS `verify-condition-clocks` KEEPS FOR THE WHOLE PACK, asked
 * here of this block's nineteen spells only, so a regression names the
 * block that introduced it.
 */
{
  const BLOCK = [
    "Forget", "Freedom", "Gaseous Form", "Goodberry", "Grace", "Gust",
    "Hand Of The Reaper", "Haze Of Dreams", "Heal", "Holy Shout",
    "Hypercognition", "Ice Slick", "Incendiary Cloud", "Indomitable",
    "Inner Sanctum", "Invulnerability", "Iron Body", "Jolts", "Keen Edge"
  ];
  equal("L1 every spell this block touched is in the pack",
    BLOCK.filter((n) => sysOf(n) === null).join(", "), "");
  const unreadable = [];
  const unknownCondition = [];
  const unknownKind = [];
  for (const name of BLOCK) {
    const rows = rowsOf(name);
    for (const bad of unreadableEffectDurations(rows)) unreadable.push(`${name}[${bad.index}]: ${bad.duration}`);
    for (const row of rows) {
      if (!HANDLED_EFFECT_KINDS.includes(row.kind)) unknownKind.push(`${name}: ${row.kind}`);
      if (row.kind === "condition" && !CONDITIONS[row.condition]) {
        unknownCondition.push(`${name}: ${row.condition}`);
      }
    }
  }
  equal("L2 no row declares a duration this system cannot read", unreadable.join("; "), "",
    "a parse failure means no timing, and no timing means it never comes off the sheet");
  equal("L3 every condition named is a real one", unknownCondition.join("; "), "");
  equal("L4 and every kind is one the applier handles", unknownKind.join("; "), "");
  /*
   * L5 IS THE WHOLE-SPELL CLOCK. A condition row with no per-row
   * duration falls back to the spell's, so a spell whose duration does
   * not parse leaves every condition it applies on the sheet for ever —
   * which is exactly how Fatigue and Flare shipped before block 27.
   */
  const clockless = [];
  for (const name of BLOCK) {
    const conditions = rowsKind(name, "condition");
    if (!conditions.length) continue;
    for (const row of conditions) {
      if (row.duration || row.durationRoll || row.roundsPerMargin) continue;
      // A CONDITION THAT ENDS ITSELF NEEDS NO CLOCK, and which ones do
      // is decided in one place rather than restated here. Jolts'
      // stunned 1 and Holy Shout's stunned 1/2 are spent as AP; a check
      // that did not know that reported both as defects.
      if (SELF_ENDING.has(row.condition)) continue;
      if (parseSpellDuration(sysOf(name)?.duration) === null) clockless.push(`${name}: ${row.condition}`);
    }
  }
  equal("L5 NO CONDITION IS APPLIED WITHOUT A CLOCK", clockless.join("; "), "",
    "a condition with no timing never comes off, and the first to notice is a GM three sessions later");
}

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-chapter10-281-290: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-chapter10-281-290: OK — ${checks} checks. `
  + "Keen lands on the weapon, a rolled duration is refused rather than misread, "
  + "a berry expires, and the start of a turn rolls its own ladders.\n");
