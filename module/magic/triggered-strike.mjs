/**
 * A REACTION THAT REACHES BACK INTO A STRIKE THAT HAS ALREADY LANDED.
 *
 * NEW at 3.467.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WAR CRY IS THE CASE.
 *
 *   "Cast R (verbal). TRIGGER An ally within range inflicts a critical
 *    strike with a melee weapon. Targets the triggering ally.
 *    Your deific cry imbues your ally's weapon with power. The weapon
 *    used to make the Strike deals an additional 1d6 sonic damage and
 *    the ally can immediately attempt an additional attack against the
 *    same target as a free action using their current multiple attack
 *    penalty."
 *
 * EVERY OTHER RIDER IN THIS SYSTEM ARMS A FUTURE BLOW. Flaming Weapon,
 * Talon Strike, Force Punch — all of them sit on an actor and wait. This
 * one is spent on a blow that has already been rolled, resolved and
 * printed, which is why it is a different file rather than another
 * `strikeRider` row.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 2 September 2026: THE DIE LANDS ON THE STRIKE THAT
 * TRIGGERED IT.
 *
 * Asked whether the 1d6 should hit the creature just critted, ride the
 * ally's NEXT strike instead, or simply be printed, he chose the first —
 * what the sentence says. Riding the next strike would have been far
 * cheaper (it is `strikeRider` verbatim) and would have quietly changed
 * the spell: the critical that paid for the reaction would get nothing.
 *
 * NOTHING NEW HAD TO BE REMEMBERED. `attack-workflow.mjs` already writes
 * `lastCriticalInjury` on the attacker — "Which creature the critical was
 * against, and the weapon facts each reaction's trigger turns on" —
 * carrying `targetActorId`, `round` and `weaponIsRanged`. It was built
 * for Ambush and Sniping, and it answers this spell's trigger exactly.
 * Recording a second history of the same event would have been two places
 * remembering one fact.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TRIGGER IS CHECKED, NOT ASSUMED.
 *
 * A reaction whose trigger nothing verifies is a spell that can be cast
 * whenever a player likes — so the printed conditions are asked of the
 * record: there must BE a critical, it must be this round, and it must
 * have been dealt with a MELEE weapon. "with a melee weapon" is in the
 * printed trigger, and a system that ignored it would let a War Cry
 * answer a critical crossbow bolt from across the field.
 *
 * SAME ROUND, because "immediately" is what a reaction means and the
 * record outlives its round — Ambush reads the same flag and it is not
 * cleared between rounds. Without this, a cleric could answer a critical
 * from four rounds ago. Outside an encounter there is no round at all,
 * and the honest answer there is that nothing can say how long ago it
 * was: `null` round matches `null` round, so a one-off strike outside
 * initiative still works and a stale one cannot be told apart. That
 * limitation is recorded rather than papered over.
 */

/** Where the attacker's own record of a critical lives. */
export const CRITICAL_RECORD_FLAG = "lastCriticalInjury";

const text = (v) => String(v ?? "").trim();
const DICE = /^([1-9]\d*)d([1-9]\d*)$/i;

/**
 * A triggered-strike row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normaliseTriggeredStrike(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "triggeredStrike") return null;

  const dice = text(raw.dice);
  if (!DICE.test(dice)) return null;

  const damageType = text(raw.damageType).toLowerCase();
  if (!damageType) return null;

  // WHICH KIND OF WEAPON THE TRIGGER NAMES. "melee" is War Cry's own
  // word; "any" exists so a second spell need not inherit a restriction
  // that belongs to this one.
  const weapon = text(raw.weapon).toLowerCase() || "any";
  if (weapon !== "any" && weapon !== "melee" && weapon !== "ranged") return null;

  return {
    label: text(raw.label) || "Triggered strike",
    dice,
    damageType,
    weapon,
    // "AND THE ALLY CAN IMMEDIATELY ATTEMPT AN ADDITIONAL ATTACK." Graham
    // ruled on 2 September 2026 that the system OFFERS this rather than
    // taking it: it spends another player's free action, and a player may
    // have reasons not to swing.
    freeAttack: raw.freeAttack !== false
  };
}

/**
 * Does the ally's recorded critical answer this spell's trigger?
 *
 * @param {object|null} spec a normalised row
 * @param {object|null} record the ally's `lastCriticalInjury` flag
 * @param {number|null} round the round now
 * @returns {{ok: boolean, why: string, targetActorId: string|null}}
 */
export function triggeredStrikeQualifies(spec, record, round = null) {
  const no = (why) => ({ ok: false, why, targetActorId: null });
  if (!spec) return no("this spell declares no triggered strike");
  // WHY, NOT JUST NO. A reaction that refuses silently is a player
  // wondering whether the spell is broken — the anti-silence rule, and
  // the reason `weaponRiderRequirement` returns a sentence too.
  if (!record) return no("they have not landed a critical");
  if (String(record.targetActorId ?? "") === "") return no("that critical recorded no target");
  if ((record.round ?? null) !== (round ?? null)) {
    return no("that critical was not this round");
  }
  if (spec.weapon === "melee" && record.weaponIsRanged === true) {
    return no("that critical was with a ranged weapon");
  }
  if (spec.weapon === "ranged" && record.weaponIsRanged !== true) {
    return no("that critical was with a melee weapon");
  }
  return {
    ok: true,
    why: "",
    targetActorId: String(record.targetActorId),
    // THE UUID IS PREFERRED WHERE THERE IS ONE. See `victimIsPrecise`.
    targetActorUuid: String(record.targetActorUuid ?? "") || null
  };
}

/** What the card says when the die lands. */
export function triggeredStrikeLine(spec, allyName, victimName, taken, rolled) {
  const reduced = Number(taken) !== Number(rolled) ? ", reduced by their defences" : "";
  return `<strong>${spec.label}</strong> — ${allyName}'s critical deals a further `
    + `<strong>${taken}</strong> ${spec.damageType} to ${victimName} `
    + `(${spec.dice} rolled ${rolled}${reduced}).`;
}

/** What the card says about the extra attack the ally is offered. */
export function freeAttackLine(spec, allyName, victimName) {
  if (!spec?.freeAttack) return "";
  return `<em>${allyName} may immediately Strike ${victimName} again as a free action, `
    + `at their current multiple attack penalty.</em>`;
}

/** What the card says when the trigger is not met. */
export function triggeredStrikeRefusal(spellName, allyName, why) {
  return `<em>${spellName} finds nothing to answer — ${allyName}: ${why}.</em>`;
}

/**
 * Is the creature this record names identifiable exactly?
 *
 * ─────────────────────────────────────────────────────────────────────
 * DRIVING 3.467.0 FOUND THE DEFECT THIS ANSWERS.
 *
 * The card read "War Cry — ZZ Ally's critical deals a further 6 sonic to
 * ZZ Undead Foe" and was telling the truth about the roll — but the six
 * landed on the BASE ACTOR in the sidebar, which fell to 24/30, while the
 * token that had actually been hit sat untouched at 27/30.
 *
 * AN UNLINKED TOKEN HAS A SYNTHETIC ACTOR WHOSE `id` IS THE BASE ACTOR'S.
 * So `game.actors.get(targetActorId)` is not the creature that was
 * struck; it is the sheet that creature was stamped from. Most NPCs are
 * unlinked, so this was most NPCs — and it is invisible from the card,
 * which names the right creature either way.
 *
 * A UUID IS THE HANDLE THAT SEPARATES THEM, carrying Scene and Token for
 * a synthetic actor. A record written before 3.468.0 has none, and the
 * honest thing there is to say so rather than silently damaging the
 * sidebar: the caller falls back to the id and this function reports
 * that the answer is approximate.
 */
export function victimIsPrecise(verdict) {
  return Boolean(verdict?.ok && verdict.targetActorUuid);
}
