#!/usr/bin/env node
/**
 * verify-healers — the two self-contained healers.
 *
 * NEW at 3.470.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS OFF THE PRINTED-DAMAGE BACKLOG, TWO MECHANISMS.
 *
 *   VITAL BEACON  "It initially restores 4d12 HP but after each use of
 *                  healing, the die type is reduced by one step. After
 *                  healing 4d4, the spell ends."
 *   LIFE SIPHON   "TRIGGER You cast an arcane soul spell of at least
 *                  2 PP ... regaining 1d6 HP per 2 PP of the spell."
 *
 * ─────────────────────────────────────────────────────────────────────
 * B4 IS THE ONE THAT MATTERS FOR THE BEACON.
 *
 * "AFTER healing 4d4, the spell ends" — the 4d4 IS rolled and IS applied
 * and the spell ends afterwards. FIVE uses, not four. An implementation
 * that ended the spell on reaching 4d4 would quietly steal the last heal
 * and the card would look identical.
 *
 * S3 IS THE ONE THAT MATTERS FOR THE SIPHON. The PP counted is what was
 * SPENT, not the printed cost: a Heroic success halves the total, so a
 * 3 PP spell cast Heroically spends 1 and is worth nothing. Reading the
 * printed cost would pay out where the book does not.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  BEACON_FLAG, BEACON_STEPS, BEACON_BASE_DICE, normaliseBeacon, beaconExhausted,
  beaconFormula, beaconAvailable, beaconAfterUse, beaconBleedStopped,
  beaconLine, beaconEndsLine, beaconRefusal
} from "../module/magic/vital-beacon.mjs";
import {
  LAST_CAST_FLAG, normaliseLifeSiphon, lifeSiphonQualifies, lifeSiphonFormula,
  lifeSiphonLine, lifeSiphonRefusal
} from "../module/magic/life-siphon.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

/* ── B. THE BEACON ───────────────────────────────────────────────── */
const fresh = normaliseBeacon(null);
ok("B1 a fresh beacon rolls four dice", fresh.dice === BEACON_BASE_DICE && fresh.used === 0);
ok("B2 and starts at the strongest step", beaconFormula(fresh) === "4d12");

// THE WHOLE LADDER, WALKED. Each use steps the DIE TYPE and never the
// count — "the die type is reduced by one step".
const walked = [];
let state = fresh;
for (let i = 0; i < BEACON_STEPS.length; i += 1) {
  walked.push(beaconFormula(state));
  state = beaconAfterUse(state, null);
}
ok("B3 the ladder is 4d12 → 4d10 → 4d8 → 4d6 → 4d4",
  walked.join(" ") === "4d12 4d10 4d8 4d6 4d4",
  `got ${walked.join(" ")}`);

/*
 * B4 IS THE OFF-BY-ONE THIS SPELL INVITES. "After healing 4d4, the
 * spell ends" — so the fifth use HEALS and the sixth is refused. Ending
 * at 4d4 would steal a heal invisibly.
 */
ok("B4 THE 4d4 IS ROLLED, AND THE SPELL ENDS AFTER IT",
  walked.length === 5 && walked[4] === "4d4" && beaconExhausted(state) === true
  && beaconFormula(state) === null,
  "five uses, not four");
ok("B5 a spent beacon refuses and says why",
  beaconAvailable(state, null).ok === false
  && /spent/.test(beaconAvailable(state, null).why));

// ONCE PER ROUND, AND IT IS ABOUT THE BEACON. Two allies must not each
// take one in the same round.
const usedThisRound = beaconAfterUse(fresh, 3);
ok("B6 ONCE PER ROUND, counted on the beacon",
  beaconAvailable(usedThisRound, 3).ok === false
  && /already healed this round/.test(beaconAvailable(usedThisRound, 3).why));
ok("B7 and it is free again next round", beaconAvailable(usedThisRound, 4).ok === true);
// OUTSIDE AN ENCOUNTER there is no round, and the limit must not bite —
// the spell lasts until the next daily preparations and a party resting
// between fights is what it is for.
ok("B8 OUTSIDE INITIATIVE THE LIMIT DOES NOT BITE",
  beaconAvailable(beaconAfterUse(fresh, null), null).ok === true,
  "one use per session outside combat would be a different spell");

// THE WARPED BEACON ADDS A DIE, NOT A STEP.
const warped = normaliseBeacon({ dice: 5, used: 0, lastRound: null });
ok("B9 a warped beacon rolls five dice all the way down",
  beaconFormula(warped) === "5d12"
  && beaconFormula(beaconAfterUse(beaconAfterUse(beaconAfterUse(beaconAfterUse(warped))))) === "5d4");
ok("B10 the +4 PP option stops one point of bleed per die",
  beaconBleedStopped(warped, true) === 5 && beaconBleedStopped(warped, false) === 0,
  "\"1 point per die of healing used\"");
// A USE IS A USE EVEN AT FULL HEALTH.
/*
 * B11 USES A CASE WHERE HEALED AND ROLLED DIFFER, and the first draft
 * did not: it asserted `beaconLine("A", 5, "4d12", 5)`, so the mutation
 * that printed the ROLL instead of what landed changed nothing and
 * SURVIVED. A creature two HP from full takes 2 of a 30 roll, and that
 * is the only case the distinction exists in.
 */
ok("B11 the line admits when nothing was healed",
  /already at full health/.test(beaconLine("A", 0, "4d12", 30)));
ok("B11b AND PRINTS WHAT LANDED, NOT WHAT WAS ROLLED",
  /regains <strong>2<\/strong> HP \(4d12 rolled 30\)/.test(beaconLine("A", 2, "4d12", 30)),
  "a creature near full health must not be told it gained the whole roll");
/*
 * B14 AND B15 ARE THE TWO DEFECTS DRIVING 3.470.0 FOUND, and neither was
 * visible from any rule in this file.
 *
 * B14 — THE BEACON CAME BACK. The handler called `unsetFlag` when the
 * last die was spent, and the sixth touch healed 4d12 again: absence of
 * the flag is indistinguishable from a FRESH beacon, because
 * `normaliseBeacon(null)` returns `{dice: 4, used: 0}` — right for a
 * spell just cast, wrong for one just spent. The card printed "its last
 * light is spent" immediately before proving otherwise.
 *
 * B15 — THE DECLARED LADDER WAS NEVER READ. The applier stored no
 * `steps`, so the pack row's ladder was decoration and the module's
 * default answered instead. The two are identical, so nothing in the
 * numbers could show it; only the stored flag did.
 */
ok("B14 A FRESH BEACON AND NO BEACON LOOK THE SAME to normaliseBeacon",
  normaliseBeacon(null).used === 0 && beaconExhausted(null) === false,
  "which is why a spent beacon must not be deleted");
ok("B14b SO THE SPENT STATE IS KEPT RATHER THAN UNSET",
  !strip(read("module", "dice", "check-card-interactions.mjs"))
    .includes("unsetFlag(SYSTEM_ID, BEACON_FLAG)"),
  "removing it makes the beacon infinite — the sixth touch healed 4d12 again");
ok("B15 the applier carries the declared ladder onto the beacon",
  strip(read("module", "magic", "spell-effects.mjs"))
    .includes("steps: Array.isArray(effect.steps) ? effect.steps : null,"),
  "without it the pack row is decoration and the module default answers");
// AND THE DECLARED LADDER IS ACTUALLY OBEYED — asked of the rule, not of
// the source, with a ladder that could not be confused with the default.
ok("B16 a declared ladder overrides the default",
  beaconFormula(normaliseBeacon({ dice: 2, used: 0, steps: ["2d20", "2d6"] })) === "2d20"
  && beaconFormula(beaconAfterUse(normaliseBeacon({ dice: 2, used: 0, steps: ["2d20", "2d6"] }))) === "2d6"
  && beaconExhausted(beaconAfterUse(beaconAfterUse(
    normaliseBeacon({ dice: 2, used: 0, steps: ["2d20", "2d6"] })))) === true,
  "a two-step ladder must end after two uses, not five");
ok("B12 there is a line for the beacon ending", beaconEndsLine().length > 10);
ok("B13 and one for a refusal", /Vital Beacon/.test(beaconRefusal("the beacon is spent")));

/* ── S. THE SIPHON ───────────────────────────────────────────────── */
const ROW = { kind: "lifeSiphon", label: "Life Siphon", tradition: "arcane", trait: "soul", minimumPP: 2, ppPerDie: 2, die: "d6" };
const spec = normaliseLifeSiphon(ROW);
const CAST = { name: "X", pp: 6, tradition: "arcane", traits: "Essence, Healing, Soul", round: 2 };

ok("S1 a well-formed row normalises", spec?.tradition === "arcane" && spec?.trait === "soul");
ok("S2 a row naming no tradition is refused", normaliseLifeSiphon({ ...ROW, tradition: "" }) === null);
ok("S2b nor one naming no trait", normaliseLifeSiphon({ ...ROW, trait: "" }) === null);
ok("S2c a row of another kind is not one", normaliseLifeSiphon({ ...ROW, kind: "heal" }) === null);

ok("S3 a qualifying cast answers the trigger", lifeSiphonQualifies(spec, CAST, 2).ok === true);
ok("S3b and reports the PP spent", lifeSiphonQualifies(spec, CAST, 2).pp === 6);
ok("S4 no cast at all is refused", lifeSiphonQualifies(spec, null, 2).ok === false);
// SAME ROUND, for the reason War Cry asks it: the record is not cleared
// between rounds.
ok("S5 A CAST FROM AN EARLIER ROUND IS REFUSED",
  lifeSiphonQualifies(spec, { ...CAST, round: 1 }, 2).ok === false);
ok("S6 a spell of the wrong tradition is refused",
  lifeSiphonQualifies(spec, { ...CAST, tradition: "divinity" }, 2).ok === false);
// A SPELL MAY HAVE TWO TRADITIONS — "arcane, ethereal" is ordinary in
// this pack — so the named one must be found AMONG them.
ok("S7 BUT A TWO-TRADITION SPELL STILL COUNTS",
  lifeSiphonQualifies(spec, { ...CAST, tradition: "arcane, ethereal" }, 2).ok === true,
  "matching the whole string would refuse most of the pack");
ok("S8 a spell without the trait is refused",
  lifeSiphonQualifies(spec, { ...CAST, traits: "Essence, Healing" }, 2).ok === false);
ok("S9 a spell below the minimum is refused",
  lifeSiphonQualifies(spec, { ...CAST, pp: 1 }, 2).ok === false
  && /only 1 PP/.test(lifeSiphonQualifies(spec, { ...CAST, pp: 1 }, 2).why));
ok("S10 every refusal says why",
  [null, { ...CAST, round: 1 }, { ...CAST, tradition: "divinity" }, { ...CAST, pp: 0 }]
    .every((rec) => lifeSiphonQualifies(spec, rec, 2).why.trim().length > 0));

/*
 * F. THE ARITHMETIC, ROUNDED DOWN.
 *
 * "1d6 HP per 2 PP" counts whole pairs, so 7 PP buys three dice and not
 * three and a half. Rounding up would pay for a PP nobody spent.
 */
ok("F1 6 PP buys three dice", lifeSiphonFormula(spec, 6) === "3d6");
ok("F2 AND 7 PP BUYS THREE, NOT FOUR", lifeSiphonFormula(spec, 7) === "3d6",
  "whole pairs only");
ok("F3 2 PP buys one", lifeSiphonFormula(spec, 2) === "1d6");
ok("F4 1 PP buys none at all", lifeSiphonFormula(spec, 1) === null);
// THE WARPING OPTION DOUBLES THE SET: "+4 PP: increase the amount you
// heal by 1d6 per 2 PP" — another die per pair, not one flat die.
ok("F5 the warped siphon doubles the dice", lifeSiphonFormula(spec, 6, 1) === "6d6");
ok("F6 the line names the PP it drew on", /from 6 PP/.test(lifeSiphonLine("A", 4, "3d6", 4, 6)));
ok("F7 and admits when nothing was drawn",
  /already at full health/.test(lifeSiphonLine("A", 0, "3d6", 9, 6)));
ok("F8 there is a refusal line", /Life Siphon/.test(lifeSiphonRefusal("you have not cast a spell")));

/* ── R. THE RECORD, AND THAT IT IS REACHED ───────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
ok("R1 every successful cast is remembered",
  cast.includes("await actor.setFlag(SYSTEM_ID, LAST_CAST_FLAG, {"));
/*
 * R2 IS WHY THE RECORD HAD TO EXIST AT ALL. `registerActiveSpell` keeps
 * the same three facts but sits inside the lock/sustained/emanation
 * guard, and an ordinary arcane soul spell — exactly what Life Siphon
 * triggers on — never reaches it. So the new record must be written
 * OUTSIDE that guard.
 */
// THE GUARD IS NOW `if (registersCast)` (3.528.0) — its five limbs moved
// behind `castWillRegister` so the effect stamp and the registration
// could not disagree. This check is POSITIONAL on purpose: it asserts the
// record is written OUTSIDE the block, because an ordinary arcane soul
// spell never enters it. Only the guard's spelling changed.
ok("R2 OUTSIDE THE REGISTRATION GUARD",
  cast.indexOf("setFlag(SYSTEM_ID, LAST_CAST_FLAG")
    < cast.indexOf("if (registersCast)"),
  "an ordinary arcane soul spell registers nothing, and those are the ones it is about");
/*
 * R3 READS THE lastCast BLOCK ALONE. `registerActiveSpell` twenty lines
 * below ALSO says `pp: ppSpent,` — so a whole-file `includes` was
 * satisfied by that one, and the mutation swapping this record to the
 * printed cost SURVIVED. Two writers of the same field, and the check
 * was looking at the wrong one.
 */
ok("R3 it carries the PP actually spent", (() => {
  const at = cast.indexOf("setFlag(SYSTEM_ID, LAST_CAST_FLAG");
  if (at === -1) return false;
  const block = cast.slice(at, cast.indexOf("});", at));
  return block.includes("pp: ppSpent,");
})(), "a Heroic cast halves the total; the printed cost is not what left the caster");
ok("R4 the tradition and traits", cast.includes("tradition: String(spellData.tradition ?? \"\"),")
  && cast.includes("traits: String(spellData.traits ?? \"\"),"));

const effects = strip(read("module", "magic", "spell-effects.mjs"));
ok("E1 the applier handles the siphon", effects.includes('case "lifeSiphon": {'));
ok("E2 and asks the trigger", effects.includes("lifeSiphonQualifies(spec, record, game.combat?.round ?? null)"));
ok("E3 the siphon heals the CASTER", effects.includes('await caster.update({ "system.resources.hp.value": before + healed });'));
ok("E4 the applier arms the beacon", effects.includes('case "vitalBeacon": {')
  && effects.includes("await caster.setFlag(SYSTEM_ID, BEACON_FLAG,"));
// A SECOND CAST REPLACES THE FIRST — "only one vital beacon active at a
// time" — which is what setFlag does and an array would not.
ok("E5 AND A SECOND CAST REPLACES THE FIRST",
  !effects.includes("beacons.push"), "\"only one vital beacon active at a time\"");
const cards = strip(read("module", "dice", "check-card-interactions.mjs"));
// E6 ASSERTS THE PUSH AS A STATEMENT, not the string and not a substring
// of a guarded one. `if (false) lines.push(...)` keeps the markup in the
// file and emits nothing — it survived a plain `includes`, and then
// survived an unanchored regex too, because the push is still in there
// with a guard in front of it. Anchoring to the line start is what
// separates a statement from a fragment of one.
ok("E6 the beacon can actually be touched",
  /^\s*lines\.push\(line\(`<button type="button" data-action="touchVitalBeacon" `/m.test(effects)
  && cards.includes('html.querySelector?.(\'[data-action="touchVitalBeacon"]\')'),
  "a beacon with no way to use it is a spell that does nothing");
// THE BUTTON IS RE-ENABLED. A beacon is used up to five times from the
// SAME card, so disabling it for good would take four uses away.
ok("E7 and touched more than once", cards.includes("beaconButton.disabled = false;"),
  "five uses come from one card");

/* ── P. THE PACK ─────────────────────────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.set(String(v.name), v);
  }
} finally { await db.close(); }
ok("P1 the pack was read", pack.size > 600, `${pack.size} spells`);
const rowOf = (name, kind) =>
  (pack.get(name)?.system?.effects ?? []).find((r) => r?.kind === kind) ?? null;
ok("P2 Vital Beacon carries its pool", rowOf("Vital Beacon", "vitalBeacon") !== null);
ok("P3 Life Siphon carries its trigger",
  normaliseLifeSiphon(rowOf("Life Siphon", "lifeSiphon"))?.tradition === "arcane");
// THE CONVENTION I0 IN verify-strike-riders WAS ADDED FOR, after Force
// Punch shipped without one and hung a self-buff on whatever was targeted.
ok("P4 and both name their recipient",
  String(rowOf("Vital Beacon", "vitalBeacon")?.target ?? "") === "self"
  && String(rowOf("Life Siphon", "lifeSiphon")?.target ?? "") === "self",
  "both heal the caster; an unnamed recipient follows the current target");
ok("P5 the flags are the ones the readers look for",
  BEACON_FLAG === "vitalBeacon" && LAST_CAST_FLAG === "lastCast");

if (failures.length) {
  process.stderr.write(`verify-healers: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-healers: OK — ${checks} checks. The beacon spends five dice and the siphon counts whole pairs.\n`);
