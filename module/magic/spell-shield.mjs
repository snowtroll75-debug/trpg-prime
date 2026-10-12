/**
 * spell-shield — a shield a spell makes, rather than one you carry.
 *
 * NEW at 3.542.0, and it exists because the Shield spell did not do the
 * thing it is named for.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * Shield shipped with one real row — a +1 defence bonus — and a note:
 *
 *   "Enables the Shield Block reaction (base DR 1 + BSB); after a Shield
 *    Block the spell ends and can't be recast for 10 minutes."
 *
 * Every mechanism in that sentence was prose. `shieldBlockEligibility`
 * filters for `item.type === "shield" && equipped` and knows nothing
 * about spells, so a caster with Shield up and no physical shield was
 * told "no shield is equipped". Measured, 9 Sep 2026. The spell gave +1
 * defence and no Shield Block at all.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A ROW AND NOT AN ITEM.
 *
 * The obvious repair is a `conjureItem` row, the way Bless Water makes
 * Holy Water. It does not work here, for a reason worth recording:
 *
 *   THE DR IS "1 + BSB". It scales with the caster's Base Spell Bonus,
 *   and an item cannot express that. A conjured shield would carry a
 *   fixed DR and be wrong at every level but one.
 *
 * So the spell's shield is not an object, it is a rule — and this is the
 * rule. Graham's ruling, 9 Sep 2026, choosing this shape over a flag or a
 * phantom pack item.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PURE, AND IT TAKES NUMBERS RATHER THAN AN ACTOR.
 *
 * `spellShieldDR` is given a base, a BSB and the warp mods, so the
 * harness can drive every combination without a world — the same reason
 * `proficiency-rules.mjs` is written this way. Reading BSB off an actor
 * is the caller's job and is one line at the call site.
 */

/** Where a character's live spell-shields are recorded. */
export const SPELL_SHIELD_FLAG = "spellShields";

/** The two fields an actor's Base Spell Bonus is spread across. */
export function casterBSB(actor) {
  const system = actor?.system ?? {};
  return Math.max(0, Math.trunc(Number(system?.magic?.bsb ?? 0)))
    + Math.max(0, Math.trunc(Number(system?.progression?.bsb ?? 0)));
}

/**
 * A spellShield row, or null when the row is malformed.
 *
 * REFUSED RATHER THAN DEFAULTED. A row with no `baseDR` is an authoring
 * mistake, and defaulting it to 1 would make the mistake invisible — the
 * spell would work and nobody would learn the row was wrong. Every other
 * `normalise*` in this directory refuses the same way.
 */
export function normaliseSpellShield(effect = {}) {
  if (effect?.kind !== "spellShield") return null;
  const baseDR = Number(effect?.baseDR);
  if (!Number.isFinite(baseDR) || baseDR < 0) return null;
  return {
    label: String(effect?.label ?? "").trim() || "Spell Shield",
    target: String(effect?.target ?? "self"),
    baseDR: Math.trunc(baseDR),
    scalesWithBSB: effect?.scalesWithBSB !== false,
    endsOnBlock: effect?.endsOnBlock !== false,
    lockoutMinutes: Math.max(0, Math.trunc(Number(effect?.lockoutMinutes ?? 0)))
  };
}

/**
 * What this spell-made shield stops.
 *
 * THE WARP RAISES THE BASE, NOT THE TOTAL. Shield's warp reads "increase
 * shield bonus & base DR by +1 (max +5)", and the word is BASE — a
 * caster who has bought it twice has a base of 3 and still adds their
 * BSB on top. Adding to the total instead would make the same purchase
 * worth less to a low-BSB caster than a high one, which is the opposite
 * of what a flat "+1" reads as.
 *
 * `bonusValue` is deliberately the SAME mod the spell's `bonus` row
 * reads, because the warp's sentence raises both halves at once — "shield
 * bonus & base DR". One purchase, one mod, both effects; giving the DR
 * its own key would let the two drift apart in a spell whose own
 * sentence binds them together.
 *
 * @param {object} args
 * @param {number} args.baseDR the row's printed base
 * @param {number} args.bsb the caster's Base Spell Bonus
 * @param {object} args.warpMods aggregated warp mods
 * @returns {number}
 */
export function spellShieldDR({ baseDR = 0, bsb = 0, warpMods = {} } = {}) {
  const base = Math.max(0, Math.trunc(Number(baseDR) || 0));
  const bump = Math.max(0, Math.trunc(Number(warpMods?.bonusValue) || 0));
  const cap = Math.trunc(Number(warpMods?.bonusMax) || 0);
  // THE CAP IS ON THE BASE, and it counts the printed base too. Shield
  // prints "(max +5)" against a base of 1, so four purchases is the
  // ceiling — the same arithmetic `bonusMax` already means everywhere
  // else, rather than a fifth reading of "max" invented here.
  const raised = cap > 0 ? Math.min(base + bump, cap) : base + bump;
  const scaled = Math.max(0, Math.trunc(Number(bsb) || 0));
  return raised + scaled;
}

/**
 * The spell-made shields a character currently has, ready for
 * `shieldBlockEligibility` to weigh against real ones.
 *
 * TAKES THE ROWS AND THE BSB, not the actor, for the same reason as
 * above. The caller gathers live spell-shield rows from the active-spell
 * registry; this decides what each one is worth.
 */
export function spellShieldSources(rows = [], bsb = 0) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ row: normaliseSpellShield(r?.effect ?? r), meta: r }))
    .filter(({ row }) => row)
    .map(({ row, meta }) => ({
      label: row.label,
      dr: spellShieldDR({ baseDR: row.baseDR, bsb, warpMods: meta?.warpMods ?? {} }),
      endsOnBlock: row.endsOnBlock,
      lockoutMinutes: row.lockoutMinutes,
      castId: meta?.castId ?? null,
      fromSpell: true
    }))
    .filter((s) => s.dr > 0);
}

/**
 * A SPELL SHIELD ENDS WITH ITS SPELL (3.575.0).
 *
 * The flag row a cast writes was never taken off again: not when the
 * spell ran out, not when it was dismissed, and not when it blocked — so
 * a caster who had once cast Shield could Shield Block with it for the
 * rest of the campaign. These are the rows that remain once `castId` has
 * ended. Pure; `removeEffectsByCastId` and the Shield Block workflow
 * write the result.
 *
 * @param {Array} rows The actor's SPELL_SHIELD_FLAG rows.
 * @param {string|null} castId
 * @returns {Array}
 */
export function spellShieldsWithout(rows = [], castId = null) {
  const list = Array.isArray(rows) ? rows : [];
  if (!castId) return list;
  return list.filter((row) => row?.castId !== castId);
}

/** Where "can't be recast for N minutes" is recorded, per spell name. */
export const SPELL_RECAST_LOCKOUT_FLAG = "spellRecastLockouts";

/**
 * "After a Shield Block the spell ends and can't be recast for 10
 * minutes." The lockout as a world-clock deadline, keyed by spell name.
 *
 * @param {object} lockouts The actor's current SPELL_RECAST_LOCKOUT_FLAG.
 * @param {string} spellName
 * @param {number} nowSeconds game.time.worldTime
 * @param {number} minutes
 * @returns {object} the updated lockouts
 */
export function withRecastLockout(lockouts = {}, spellName = "", nowSeconds = 0, minutes = 0) {
  const key = String(spellName ?? "").trim().toLowerCase();
  const span = Math.max(0, Math.trunc(Number(minutes) || 0)) * 60;
  if (!key || !span) return { ...(lockouts ?? {}) };
  return { ...(lockouts ?? {}), [key]: Math.trunc(Number(nowSeconds) || 0) + span };
}

/**
 * Seconds until this spell may be cast again, or 0.
 *
 * @param {object} lockouts
 * @param {string} spellName
 * @param {number} nowSeconds
 * @returns {number}
 */
export function recastLockoutRemaining(lockouts = {}, spellName = "", nowSeconds = 0) {
  const key = String(spellName ?? "").trim().toLowerCase();
  const until = Number(lockouts?.[key] ?? 0);
  return Math.max(0, Math.trunc(until - (Number(nowSeconds) || 0)));
}
