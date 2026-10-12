/**
 * The Creature Codex's own AB/DB adjustment for creatures and NPCs.
 *
 * Printed as a note beside the codex's BAB and Saving Throw tables:
 *
 *   "All creatures (NPC's) gain an other bonus to both AB and DB equal
 *    to half their level. DB is further modified with a Status bonus
 *    equal to class bonus -2."
 *
 * WHY THIS WAS INVISIBLE UNTIL NOW. Every stat block in both source
 * documents is written at 1st level, and at 1st level BOTH terms are
 * zero — half of one rounds to nothing, and the class bonus is 2, so
 * "class bonus − 2" is 0. The rule is real from 2nd level onward and
 * simply never shows on a printed block. Found by Graham reading the
 * codex, not by anything in the data (3.232.2).
 *
 * WHO IT APPLIES TO. "All creatures (NPC's)" — so `npc` and `companion`
 * actors, and NOT `character`. A player character's attack and defence
 * are fully described by Chapter 3's own class table; this is the
 * codex's way of giving a creature the equivalent scaling without a
 * printed table per creature type.
 *
 * "AN OTHER BONUS" IS AN UNTYPED ONE. The codex's word is `other`, which
 * is the name of a SLOT in this system, not of a bonus TYPE — Appendix 1
 * has eleven types and `other` is not among them. `SLOT_TYPE_ALIASES`
 * (module/bonuses/registry.mjs) maps the `other` slot to `untyped`, which
 * stacks. The first version of this file passed `type: "other"` straight
 * through and got the right answer for the wrong reason: `applyStacking`
 * falls back to `untyped` for any type it does not recognise, silently.
 * That fallback is a safety net, not an interface — an `other` entry
 * added to BONUS_TYPES later with different stacking would change this
 * rule's behaviour with nothing to notice. So the type is spelled
 * `untyped` deliberately, and the harness asserts every entry names a
 * type the registry actually knows.
 *
 * WHY IT GOES THROUGH THE BONUS POOL. `other` and `status` are typed
 * bonus SLOTS that a GM's own edits and ActiveEffects write into.
 * Assigning a derived value straight into either would silently eat
 * whatever had already landed there — the exact trap `prepareCombat`
 * already documents for `bab.base` and `bdb.class`. So these are pooled
 * contributions with a source label, the same way class-skill bonuses
 * and Instinctive Defence's dodge bonus already are, and they stack (or
 * don't) under the ordinary Appendix 1 rules rather than by fiat.
 */

/** Actor types the codex calls creatures. Characters are excluded. */
export const CREATURE_ACTOR_TYPES = Object.freeze(["npc", "companion"]);

export function isCreatureActorType(type) {
  return CREATURE_ACTOR_TYPES.includes(String(type ?? ""));
}

/**
 * The two terms, for one creature.
 *
 * `half their level` rounds DOWN. Nothing in the codex says so, but every
 * other halving in this system floors (the Crusader's Divine Grace, the
 * Wizard's Intense Spells, a familiar's caster-level cap all round down
 * or are printed as explicit fractions), and rounding a level-1 creature
 * UP would put a +1 on a stat block that plainly prints none.
 *
 * The status term is NOT clamped at zero. `classBonusForLevel` returns 0
 * below 1st level, which makes the term −2 there — and that is left as a
 * penalty rather than floored, because a level-0 creature is a GM typing
 * a deliberately weak thing and this system does not invent floors the
 * book does not print (the same reasoning `skillPointsPerLevel` records
 * for its own single clamp). Worth revisiting if a level-0 creature ever
 * turns out to be a real case rather than a data-entry accident.
 *
 * @param {object} args
 * @param {string} args.actorType
 * @param {number} args.level
 * @param {number} args.classBonus The actor's own resolved class bonus.
 * @returns {{attackOther: number, defenceOther: number, defenceStatus: number}}
 */
export function creatureLevelBonuses({ actorType, level, classBonus } = {}) {
  if (!isCreatureActorType(actorType)) {
    return { attackOther: 0, defenceOther: 0, defenceStatus: 0 };
  }
  const resolved = Math.max(0, Math.floor(Number(level) || 0));
  const half = Math.floor(resolved / 2);
  const status = Math.floor(Number(classBonus) || 0) - 2;
  return { attackOther: half, defenceOther: half, defenceStatus: status };
}

/**
 * The pooled entries for a creature, ready for `actor.addBonus`.
 *
 * Returns a target-keyed map rather than pushing directly, so the whole
 * rule can be RUN in a harness without a live actor (lesson 2).
 * Zero-valued terms are omitted entirely — a "+0 (other)" line on a
 * 1st-level companion's tooltip would be noise describing a rule that
 * is not doing anything yet.
 */
export function creatureBonusEntries({ actorType, level, classBonus } = {}) {
  const { attackOther, defenceOther, defenceStatus } =
    creatureLevelBonuses({ actorType, level, classBonus });
  const entries = {};
  if (attackOther !== 0) {
    entries["system.combat.attack"] = [{
      label: "Creature level", value: attackOther, type: "untyped", source: "creatureLevel"
    }];
  }
  const defence = [];
  if (defenceOther !== 0) {
    defence.push({
      label: "Creature level", value: defenceOther, type: "untyped", source: "creatureLevel"
    });
  }
  if (defenceStatus !== 0) {
    defence.push({
      label: "Creature class bonus", value: defenceStatus, type: "status", source: "creatureClassBonus"
    });
  }
  if (defence.length) entries["system.combat.defence"] = defence;
  return entries;
}
