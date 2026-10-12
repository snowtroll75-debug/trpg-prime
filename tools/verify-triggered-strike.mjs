#!/usr/bin/env node
/**
 * verify-triggered-strike — a reaction spent on a blow already landed.
 *
 * NEW at 3.467.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAR CRY, AND WHY IT IS NOT A `strikeRider`.
 *
 *   "TRIGGER An ally within range inflicts a critical strike with a melee
 *    weapon. ... The weapon used to make the Strike deals an additional
 *    1d6 sonic damage and the ally can immediately attempt an additional
 *    attack against the same target as a free action."
 *
 * Every other rider arms a FUTURE blow. This one is spent on one that has
 * already been rolled and printed. Graham ruled on 2 September 2026 that
 * the die lands on the strike that triggered it — riding the ally's next
 * strike would have been `strikeRider` verbatim and far cheaper, and it
 * would have quietly changed the spell so the critical that paid for the
 * reaction got nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION T IS THE ONE THAT MATTERS: THE TRIGGER IS CHECKED.
 *
 * A reaction whose trigger nothing verifies is a spell castable whenever
 * a player likes. The printed conditions are all asked of the record the
 * attack workflow already keeps — there must BE a critical, it must be
 * THIS round, and it must have been dealt with a MELEE weapon.
 *
 * NOTHING NEW IS REMEMBERED, and that is deliberate.
 * `attack-workflow.mjs` writes `lastCriticalInjury` for Ambush and
 * Sniping, carrying targetActorId, round and weaponIsRanged. Section R
 * asserts this file reads THAT record rather than starting a second
 * history of the same event.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  CRITICAL_RECORD_FLAG, normaliseTriggeredStrike, triggeredStrikeQualifies,
  triggeredStrikeLine, freeAttackLine, triggeredStrikeRefusal, victimIsPrecise
} from "../module/magic/triggered-strike.mjs";

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

const ROW = { kind: "triggeredStrike", label: "War Cry", dice: "1d6", damageType: "sonic", weapon: "melee", freeAttack: true };
const CRIT = { targetActorId: "victim1", targetActorUuid: "Scene.s1.Token.t1.Actor.victim1", round: 3, weaponIsRanged: false };

/* ── A. THE ROW ──────────────────────────────────────────────────── */
ok("A1 a well-formed row normalises", normaliseTriggeredStrike(ROW)?.dice === "1d6");
ok("A2 a row of another kind is not one", normaliseTriggeredStrike({ ...ROW, kind: "strikeRider" }) === null);
ok("A3 a malformed formula is refused", normaliseTriggeredStrike({ ...ROW, dice: "1d6+1" }) === null);
ok("A4 a row with no damage type is refused", normaliseTriggeredStrike({ ...ROW, damageType: "" }) === null);
ok("A5 an unknown weapon kind is refused", normaliseTriggeredStrike({ ...ROW, weapon: "siege" }) === null);
// `any` IS THE DEFAULT so a second spell need not inherit War Cry's own
// restriction — the reason `on` defaults to `self` in per-turn.mjs.
ok("A6 an undeclared weapon kind means any", normaliseTriggeredStrike({ ...ROW, weapon: "" })?.weapon === "any");
/*
 * A7 TESTS THE UNDECLARED ROW, which is the only case a default means.
 *
 * The first draft asserted `ROW` (which says `freeAttack: true`) and a
 * row that says `false`. Both still passed when the default was flipped
 * to `raw.freeAttack === true`, so the mutation SURVIVED: a row that
 * simply did not mention the free attack would have offered nothing, and
 * neither case looked at one. The same shape as `on` defaulting to
 * `self` in per-turn.mjs — the value that matters is the absent one.
 */
const { freeAttack: _drop, ...ROW_SILENT } = ROW;
ok("A7 the free attack is offered unless refused",
  normaliseTriggeredStrike(ROW)?.freeAttack === true
  && normaliseTriggeredStrike({ ...ROW, freeAttack: false })?.freeAttack === false
  && normaliseTriggeredStrike(ROW_SILENT)?.freeAttack === true);

/* ── T. THE TRIGGER ──────────────────────────────────────────────── */
const spec = normaliseTriggeredStrike(ROW);
ok("T1 a melee critical this round answers the trigger",
  triggeredStrikeQualifies(spec, CRIT, 3).ok === true);
ok("T2 and it names the creature that was hit",
  triggeredStrikeQualifies(spec, CRIT, 3).targetActorId === "victim1");
// NO CRITICAL AT ALL is the case a player will hit most often — casting
// the reaction hopefully.
ok("T3 NO CRITICAL, NO CRY", triggeredStrikeQualifies(spec, null, 3).ok === false);
/*
 * T4 IS THE ONE A LAZY IMPLEMENTATION WOULD MISS. `lastCriticalInjury`
 * is NOT cleared between rounds — Ambush reads the same flag — so a
 * reaction that only asked "is there a record" would let a cleric answer
 * a critical from four rounds ago, at any time, for ever.
 */
ok("T4 A CRITICAL FROM AN EARLIER ROUND DOES NOT",
  triggeredStrikeQualifies(spec, { ...CRIT, round: 1 }, 3).ok === false,
  "the record outlives its round, so a stale one must be refused");
// "WITH A MELEE WEAPON" IS IN THE PRINTED TRIGGER. Without this a War Cry
// answers a critical crossbow bolt from across the field.
ok("T5 AND NEITHER DOES A RANGED CRITICAL",
  triggeredStrikeQualifies(spec, { ...CRIT, weaponIsRanged: true }, 3).ok === false,
  "\"inflicts a critical strike with a melee weapon\"");
ok("T6 a ranged-scoped row is the mirror",
  triggeredStrikeQualifies(normaliseTriggeredStrike({ ...ROW, weapon: "ranged" }), { ...CRIT, weaponIsRanged: true }, 3).ok === true
  && triggeredStrikeQualifies(normaliseTriggeredStrike({ ...ROW, weapon: "ranged" }), CRIT, 3).ok === false);
ok("T7 an any-scoped row takes either",
  triggeredStrikeQualifies(normaliseTriggeredStrike({ ...ROW, weapon: "any" }), { ...CRIT, weaponIsRanged: true }, 3).ok === true);
ok("T8 a record with no target is refused",
  triggeredStrikeQualifies(spec, { ...CRIT, targetActorId: "" }, 3).ok === false);
// OUTSIDE AN ENCOUNTER there is no round at all, and null matches null so
// a one-off strike still works. Recorded as a limitation, not a feature:
// nothing there can tell a stale record from a fresh one.
ok("T9 outside initiative a null round still matches",
  triggeredStrikeQualifies(spec, { ...CRIT, round: null }, null).ok === true);
// EVERY REFUSAL SAYS WHY. A reaction that did nothing and said nothing is
// a player wondering whether the spell is broken.
for (const [label, rec, round] of [
  ["no record", null, 3], ["stale round", { ...CRIT, round: 1 }, 3], ["ranged", { ...CRIT, weaponIsRanged: true }, 3]
]) {
  ok(`T10 the refusal for "${label}" says why`,
    triggeredStrikeQualifies(spec, rec, round).why.trim().length > 0);
}

/* ── U. WHICH CREATURE, EXACTLY ──────────────────────────────────── */
/*
 * THE DEFECT THIS SECTION EXISTS FOR SHIPPED IN 3.467.0 AND THE CARD
 * HID IT.
 *
 * Driving War Cry: "ZZ Ally's critical deals a further 6 sonic to ZZ
 * Undead Foe (1d6 rolled 6)" — true about the roll, true about the name,
 * and the six landed on the BASE ACTOR in the sidebar, which fell to
 * 24/30, while the token that had actually been hit sat at 27/30.
 *
 * AN UNLINKED TOKEN'S SYNTHETIC ACTOR SHARES THE BASE ACTOR'S `id`, so
 * `game.actors.get(targetActorId)` is the sheet the creature was stamped
 * from, not the creature. Most NPCs are unlinked. Nothing in sections A,
 * T, L or E could see it: every rule was right and the card named the
 * right creature.
 *
 * ONLY THE HP BAR SHOWED IT, which is why this is asserted on the
 * RECORD's shape and the applier's resolution order rather than on any
 * sentence.
 */
ok("U1 the verdict carries the uuid when the record has one",
  triggeredStrikeQualifies(spec, CRIT, 3).targetActorUuid === "Scene.s1.Token.t1.Actor.victim1");
ok("U2 and reports the answer as precise", victimIsPrecise(triggeredStrikeQualifies(spec, CRIT, 3)) === true);
// A RECORD FROM BEFORE 3.468.0 HAS NO UUID. The honest answer there is
// that the creature is identified only by species — said out loud rather
// than silently damaging the sidebar.
const { targetActorUuid: _none, ...OLD_CRIT } = CRIT;
ok("U3 AN OLD RECORD IS STILL USABLE", triggeredStrikeQualifies(spec, OLD_CRIT, 3).ok === true);
ok("U4 but is NOT reported as precise",
  victimIsPrecise(triggeredStrikeQualifies(spec, OLD_CRIT, 3)) === false,
  "an unlinked token cannot be told from its sidebar sheet by id alone");
ok("U5 and a refused verdict is never precise",
  victimIsPrecise(triggeredStrikeQualifies(spec, null, 3)) === false);

/* ── L. WHAT THE CARD SAYS ───────────────────────────────────────── */
ok("L1 the line names both creatures and the roll",
  /Ally/.test(triggeredStrikeLine(spec, "Ally", "Foe", 4, 4))
  && /Foe/.test(triggeredStrikeLine(spec, "Ally", "Foe", 4, 4))
  && /1d6 rolled 4/.test(triggeredStrikeLine(spec, "Ally", "Foe", 4, 4)));
// WHAT LANDED AND WHAT WAS ROLLED, the rule Song Of Despair's recovery
// line taught: a creature resistant to sonic must not be described as
// taking the full die.
ok("L2 AND IT SAYS SO WHEN DEFENCES ATE SOME",
  /reduced by their defences/.test(triggeredStrikeLine(spec, "Ally", "Foe", 1, 4))
  && !/reduced by their defences/.test(triggeredStrikeLine(spec, "Ally", "Foe", 4, 4)));
ok("L3 the free attack is offered, not taken",
  /may immediately Strike/.test(freeAttackLine(spec, "Ally", "Foe")),
  "Graham ruled it is offered — it spends another player's free action");
ok("L4 and a row that declines it offers nothing",
  freeAttackLine(normaliseTriggeredStrike({ ...ROW, freeAttack: false }), "Ally", "Foe") === "");
ok("L5 the refusal names the spell and the ally",
  /War Cry/.test(triggeredStrikeRefusal("War Cry", "Ally", "they have not landed a critical"))
  && /Ally/.test(triggeredStrikeRefusal("War Cry", "Ally", "they have not landed a critical")));

/* ── R. IT READS THE RECORD THAT ALREADY EXISTS ──────────────────── */
const attack = strip(read("module", "combat", "attack-workflow.mjs"));
ok("R1 the attack workflow still writes the record",
  attack.includes(`setFlag(SYSTEM_ID, "${CRITICAL_RECORD_FLAG}"`));
ok("R2 carrying who was hit", attack.includes("targetActorId: targetActor?.id ?? null"));
ok("R3 the round it happened", attack.includes("round: game.combat?.round ?? null"));
ok("R4 and whether the weapon was ranged", attack.includes("weaponIsRanged,"));
// R4b IS THE FIELD 3.468.0 ADDED, and without it the id alone cannot
// separate an unlinked token from the sheet it was stamped from.
ok("R4b AND THE UUID OF THE CREATURE STRUCK",
  attack.includes("targetActorUuid: targetActor?.uuid ?? null,"),
  "the id alone resolves to the sidebar sheet for an unlinked token");
// ONE HISTORY OF ONE EVENT. A second record would drift from this one.
ok("R5 AND THE SPELL READS THAT RECORD RATHER THAN KEEPING ITS OWN",
  strip(read("module", "magic", "spell-effects.mjs")).includes("getFlag?.(SYSTEM_ID, CRITICAL_RECORD_FLAG)"),
  "attack-workflow already remembers this for Ambush and Sniping");

/* ── E. AND IT IS REACHED ────────────────────────────────────────── */
const effects = strip(read("module", "magic", "spell-effects.mjs"));
ok("E1 the applier handles the kind", effects.includes('case "triggeredStrike": {'));
ok("E2 it asks whether the trigger was met",
  effects.includes("triggeredStrikeQualifies(spec, record, game.combat?.round ?? null)"));
// THE DAMAGE GOES TO THE VICTIM, NOT THE ALLY. The recipient of this
// effect is the ally — "Targets the triggering ally" — so an applier that
// damaged its recipient would hurt the wrong creature, and it would look
// entirely reasonable in the source.
ok("E3 THE DIE LANDS ON THE CREATURE THE ALLY HIT, not on the ally",
  effects.includes("applyDamageAndCheckDying(victim, packet.taken)")
  && !effects.includes("applyDamageAndCheckDying(ally,"),
  "the recipient is the triggering ally; the victim is read from their record");
// E3b IS THE RESOLUTION ORDER, and it is the whole fix. `fromUuidSync`
// returns the synthetic actor — the creature in the fight; `game.actors.get`
// returns the sheet. The uuid must be tried FIRST.
ok("E3b THE VICTIM IS RESOLVED BY UUID FIRST, id only as a fallback",
  effects.includes("await fromUuid(verdict.targetActorUuid)")
  && effects.indexOf("await fromUuid(verdict.targetActorUuid)")
     < effects.indexOf("game.actors?.get?.(verdict.targetActorId)"),
  "game.actors.get resolves an unlinked token to its sidebar sheet");
ok("E3c and an imprecise record says so on the card",
  effects.includes("if (!victimIsPrecise(verdict)) {"),
  "a record from before 3.468.0 identifies the creature only by species");
ok("E4 the die is resolved against the victim's own defences",
  effects.includes("resolveAgainstDefences(victim.system ?? {}, {"),
  "a creature immune to sonic takes nothing");
ok("E5 and a refusal is printed rather than swallowed",
  effects.includes("triggeredStrikeRefusal(spell.name, ally.name, verdict.why)"));

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
const warCry = (pack.get("War Cry")?.system?.effects ?? []).find((r) => r?.kind === "triggeredStrike");
ok("P2 War Cry carries its 1d6 sonic",
  normaliseTriggeredStrike(warCry)?.dice === "1d6"
  && normaliseTriggeredStrike(warCry)?.damageType === "sonic");
ok("P3 scoped to a melee critical", normaliseTriggeredStrike(warCry)?.weapon === "melee");
// THE ROW NAMES WHO IT IS AIMED AT — the convention I0 in
// verify-strike-riders was added for, after Force Punch shipped without
// one at 3.465.0 and hung a self-buff on whatever was targeted.
ok("P4 AND IT NAMES ITS RECIPIENT", String(warCry?.target ?? "") === "targets",
  "the printed Targets line is \"the triggering ally\"");

if (failures.length) {
  process.stderr.write(`verify-triggered-strike: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-triggered-strike: OK — ${checks} checks. The cry answers this round's melee critical, and only that.\n`);
