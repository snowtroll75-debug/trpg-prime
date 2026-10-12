/**
 * Does a spell deal damage at all? Pure; no Foundry.
 *
 * NEW at 3.403.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 25 August 2026, on Sickly Ray:
 *
 *   SICKLY RAY  PP 1 · ATTACK SOUL WIZARD
 *   "A sickly green ray of energy is released from your outstretched
 *    palm. The result of your attack determines the outcome of the
 *    spell. … THIS SPELL INFLICTS NO ACTUAL HP DAMAGE."
 *
 *   "So it inflicts no critical as it inflicts no damage."
 *
 * WHY THAT NEEDED SAYING. A critical spell attack rolls on the critical
 * injury table, and the table does not ask how much damage was dealt. So
 * a spell with no damage at all could critically hit for ZERO and still
 * maim its target — which is what the live pass caught Tanglefoot doing:
 * a cantrip that grabs somebody left the target prone, dying and
 * soul-drained.
 *
 * Tanglefoot's half of that was fixed at 3.402.0 by the maneuver rule —
 * its check IS its attack, so it makes no spell attack to critically
 * hit with. Sickly Ray is the OTHER half, and the maneuver rule does not
 * reach it: Sickly Ray genuinely makes a spell attack, its outcomes are
 * attack outcomes ("Critical Inflicted / Hit for Damage / Miss"), and
 * its category is correct. What it does not do is deal damage.
 *
 * SO THE RULE IS ABOUT DAMAGE, NOT ABOUT SPELLS. An injury is a wound,
 * and a wound needs damage. This is the predicate that says whether
 * there was any.
 *
 * FIVE SPELLS ARE CATEGORY `attack` WITH NO DAMAGE: Sickly Ray,
 * Spectral Grasp, Tanglefoot, Tangling Creepers and Telekinetic
 * Manoeuvre. Three are maneuvers and covered by that rule; this covers
 * all five, and anything added later.
 */

/**
 * Whether this spell can deal HP damage.
 *
 * THREE PLACES A SPELL CAN CARRY DAMAGE, and all three are asked. The
 * obvious one is `damage.formula`; `damage.parts` is the multi-part
 * shape; and a `damage` entry in the effects array is how Magic Missile
 * and its kin deal theirs. Checking only the first would have called
 * Magic Missile damage-free and switched its criticals off.
 *
 * A FORMULA OF "0" STILL COUNTS AS DAMAGE. It is a damaging spell whose
 * dice happened to sum to nothing, which is a different thing from a
 * spell the book says inflicts none — and this predicate is about the
 * spell, not about one roll's result.
 *
 * @param {object} spellSystem a spell's `system`
 * @returns {boolean}
 */
export function spellDealsDamage(spellSystem) {
  const damage = spellSystem?.damage;
  if (String(damage?.formula ?? "").trim()) return true;
  if (Array.isArray(damage?.parts) && damage.parts.length > 0) return true;
  const effects = spellSystem?.effects;
  if (Array.isArray(effects) && effects.some((e) => e?.kind === "damage")) return true;
  return false;
}

/**
 * Whether a critical spell attack should roll a critical injury.
 *
 * SEPARATE FROM THE PREDICATE ABOVE so the reason reads at the call
 * site: this is not "does the spell have a damage field", it is "did
 * anything happen that a creature could be injured by".
 *
 * @param {object} spellSystem
 * @returns {boolean}
 */
export function spellInflictsCriticalInjury(spellSystem) {
  return spellDealsDamage(spellSystem);
}

/**
 * The extra damage a spell's critical inflicts.
 *
 * NEW at 3.585.1. Graham's ruling of 23 September 2026 on the second
 * half of page 247's sentence.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "Each damage inflicting spell will have a Base Damage Value which is
 * used to determine additional damage when warping the spell AND
 * INFLICTING CRITICALS. Be aware that if a spell does not have a base
 * damage entry, it's damage is not increased by factors which increase
 * base damage."
 *
 * 3.585.0 did the warping half (Empower and Intensified read the Base
 * Damage entry) and left this one open, because it changes every
 * damaging spell and was worth asking about rather than guessing.
 *
 * WHAT A CRITICAL ADDS, and why these numbers. A WEAPON critical adds
 * bonus dice of the weapon's own damage — minor 1, serious 2, deadly 3,
 * from `criticalFromAttack`. A spell's equivalent of "its own damage
 * die" is its Base Damage, which is what the page says the entry is
 * for. So the ladder is the same and only the die changes, rather than
 * a second scale invented for spells.
 *
 * AND A SPELL WITH NO ENTRY ADDS NOTHING — the page's second sentence,
 * which is the whole reason the field is consulted rather than the
 * damage formula. MEASURED against the pack: 20 damaging spells print
 * no Base Damage, and reading `damage.formula` instead would hand
 * Acidic Eruption's critical a further 45d6.
 *
 * THE SAVE PATH ALREADY ADDED BONUS DICE AND TOOK THEM FROM THE WRONG
 * PLACE: `bs.bonusBaseDamage` dice at the die size of the DAMAGE
 * formula. For the 81 spells whose base and damage differ in count that
 * was the right die by luck (all 99 share a face) and the wrong source
 * in principle; for the 20 with no entry it was bonus dice the page
 * says they do not get.
 *
 * @param {object} spellSystem the spell's `system`
 * @param {string|null} severity "minor" | "serious" | "deadly"
 * @param {number} [dice] an explicit die count, for the save path's own
 *   ladder; defaults to the weapon ladder's count for this severity
 * @returns {string} a dice formula, or "" when nothing is added
 */
export function criticalBonusDamage(spellSystem, severity, dice = null) {
  const base = String(spellSystem?.baseDamage ?? "").trim();
  if (!base) return "";
  /*
   * A SPELL MAY PRINT TWO BASE DAMAGES, and two do.
   *
   * FOUND IN THE 3.585.2 LIVE TEST, by asking every damaging spell in
   * the pack what its critical would add and noticing that two of the
   * 99 with an entry answered "nothing":
   *
   *   Sunburst      Base Damage 1d10/1d4 — "8d10 fire damage AND 8d4
   *                 essence damage to undead creatures"
   *   Umbral Blast  Base Damage 1d10/1d4 — "8d10 Cold damage AND 8d4
   *                 Secondary Essence damage"
   *
   * The slash is a PAIR: a primary base and a secondary that applies to
   * some targets or as a second type. `damage.formula` models only the
   * primary (8d10, typed fire and cold), so the primary base is the one
   * this scales — and taking it is unambiguous rather than a guess.
   *
   * Silently returning "" was the worse answer. Both spells would have
   * had criticals that added nothing while every neighbour scaled, and
   * nothing would have said so — the silent-nothing shape this project
   * keeps finding at the bottom of its defects.
   *
   * THE SECONDARY 8d4 IS STILL UNMODELLED, and was before this change.
   * That is a data gap for those two spells' own page, not something to
   * invent here.
   */
  const primary = base.split("/")[0].trim();
  const match = primary.match(/^(\d*)d(\d+)$/i);
  if (!match) return "";
  const faces = Number(match[2]);
  const count = dice === null
    ? ({ minor: 1, serious: 2, deadly: 3 }[String(severity ?? "").trim()] ?? 0)
    : Math.max(0, Math.floor(Number(dice) || 0));
  if (!count || !faces) return "";
  // THE BASE'S OWN DIE COUNT MULTIPLIES. "Base Damage 2d6" is one base
  // damage of two dice, so a serious critical adding two of them adds
  // 4d6 — not 2d6 with the printed pair quietly discarded.
  const per = Math.max(1, Number(match[1] || 1));
  return `${count * per}d${faces}`;
}
