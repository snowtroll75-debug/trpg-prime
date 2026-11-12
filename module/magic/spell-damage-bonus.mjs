/**
 * A FLAT BONUS ON THE CASTER'S OWN SPELL DAMAGE (3.675.0; Eldritch Arts
 * Block 1, C1). Pure; no Foundry.
 *
 *   ELEMENTAL SURGE (Emberkin, Eldritch Arts Chapter 2): "You add your
 *   Charisma ability score as a racial bonus to all spell damage rolls."
 *
 * The spell riders (caster-damage-riders.mjs) hang DICE of their own type on
 * a spell; the damage conditionals (combat/damage-conditionals.mjs) are read
 * on a WEAPON's roll only. Nothing added a number to a spell's own damage
 * roll, so the bonus is declared on an effect the feature carries:
 *
 *   flags["trg-prime"].spellDamageBonus = {
 *     label: "Elemental Surge",
 *     valueFrom: "charisma",     // or value: 2
 *     type: "race",              // a BONUS_TYPES key; untyped when unknown
 *     traits: ["fire"]           // optional: only spells with one of these
 *   }
 *
 * WHICH ROLL. The spell's own damage roll, once per casting: the attack
 * path's packet and the save path's primary pool. A spell's second pool,
 * splash and recurring damage are not "the" damage roll and take nothing,
 * so a two-pool spell is not paid the bonus twice. Healing is not damage.
 *
 * VALUED AT THE SPELL (3.684.0; Eldritch Arts Block 6, G12): `valueFrom:
 * "spellPP"` is the spell's printed PP, and `instantOnly: true` keeps the row
 * to a spell printing no Duration (Dangerous Sorcery, Graham's Q146). The
 * caller hands both in (`spellPP`, `noDuration`).
 *
 * TYPED STACKING, as BONUS_TYPES says: a "highest" type keeps its best row,
 * a "stack" type (race, class, untyped) sums. Penalties always count.
 *
 * PER DIE, BY DAMAGE TYPE (3.683.0; Eldritch Arts Block 5, C6):
 *
 *   EMBERBORN FURY (Emberkin, Cinderblood): "Whenever you deal fire damage
 *   with a spell or effect, you add +1 damage per die rolled."
 *   ELEMENTAL APOTHEOSIS (Emberkin): "Whilst you have the immunity, all
 *   elemental damage that you inflict of that type inflicts an additional
 *   point of damage per die."
 *
 * Neither can be said by the flat row above: the number grows with the dice,
 * and it is scoped by the DAMAGE'S type, not the spell's traits (an Orb of
 * Fire cast as cold is not fire damage). So a row may say instead:
 *
 *   flags["trg-prime"].spellDamageBonus = {
 *     label: "Emberborn Fury",
 *     perDie: 1,                 // a whole number > 0, per die rolled
 *     damageTypes: ["fire"],     // the pool's damage type; omitted = any type
 *     type: "race",              // stacking, as above
 *     traits: ["…"]              // optional, as above
 *   }
 *
 * A row with `perDie` is per-die ONLY: the flat reader skips it, so a world
 * whose rows are all flat reads exactly as before. `damageTypes` is read on a
 * per-die row.
 *
 * WHICH DICE (Graham, Q70, 3 November 2026: "as proposed"): the caster's
 * spells by any route (cantrips, innate spells, item casts), on EVERY pool
 * of a matching type the cast rolls (the primary, a critical's extra dice,
 * the secondary, a ladder's rung, the immune alternate; not the
 * vs-trait "holy half", which keeps its own roll),
 * counting the dice actually in that pool after warps. Not weapons, not rune
 * riders, not recurring damage. Two such feats stack: a Cinderblood with
 * Fury and Apotheosis adds +2 a fire die. "Your magical abilities' damage"
 * (Elemental Reprisal, a breath) is the module's own roll, so it asks
 * `helpers.spellDamagePerDieBonus(actor, {type, dice})` where it builds it.
 */

const SYSTEM_ID = "trg-prime";
const ABILITIES = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);
/** BONUS_TYPES' stacking rule, by key (kept here so this file stays pure and import-free). */
const STACKING = Object.freeze({
  armour: "highest", circumstance: "highest", class: "stack", dodge: "stack", item: "highest", luck: "highest",
  naturalArmour: "highest", race: "stack", resistance: "highest", shield: "highest", status: "highest", untyped: "stack"
});

const lower = (v) => String(v ?? "").trim().toLowerCase();
const traitList = (v) => (Array.isArray(v) ? v : String(v ?? "").split(/[,;]/)).map(lower).filter(Boolean);

/**
 * The bonuses a caster's effects add to this spell's damage roll, stacked.
 *
 * @param {Iterable} effects the caster's applied effects
 * @param {{traits?: string|string[], attributes?: object}} context
 *   the spell's traits; the caster's `system.attributes` (for valueFrom)
 * @returns {Array<{label: string, value: number, type: string}>}
 */
export function declaredSpellDamageBonuses(effects = [], { traits = [], attributes = {}, spellPP = null, noDuration = null } = {}) {
  const have = new Set(traitList(traits));
  const rows = [];
  for (const effect of Array.from(effects ?? [])) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.spellDamageBonus;
    for (const row of Array.isArray(raw) ? raw : (raw ? [raw] : [])) {
      if (!row || typeof row !== "object") continue;
      // A per-die row (3.683.0, C6) is read by declaredSpellDamagePerDie only.
      if (row.perDie !== undefined && row.perDie !== null) continue;
      // AN INSTANT SPELL ONLY (3.684.0; Eldritch Arts Block 6, G12) —
      // Dangerous Sorcery: "a damage-dealing spell without a duration"; Graham's
      // Q146: one that prints no Duration entry. A caller that does not say
      // (null) is never matched by such a row.
      if (row.instantOnly === true && noDuration !== true) continue;
      const from = lower(row.valueFrom);
      // VALUED AT THE SPELL'S PP (3.684.0, G12): "a status bonus to damage
      // equivalent to its PP cost" — Q146, the printed PP, so a cantrip adds
      // 0 and warps or metamagic raise nothing. See magic/cast-pp.mjs.
      const value = from === "spellpp"
        ? Math.max(0, Math.trunc(Number(spellPP) || 0))
        : ABILITIES.includes(from)
        ? Math.trunc(Number(attributes?.[from]?.total ?? 0) || 0)
        : Math.trunc(Number(row.value) || 0);
      if (!value) continue;
      const wanted = traitList(row.traits);
      if (wanted.length && !wanted.some((t) => have.has(t))) continue;
      const type = STACKING[String(row.type ?? "").trim()] ? String(row.type).trim() : "untyped";
      rows.push({ label: String(row.label ?? effect.name ?? "").trim() || "Spell damage bonus", value, type });
    }
  }
  const best = new Map();
  const out = [];
  for (const row of rows) {
    if (row.value < 0 || STACKING[row.type] !== "highest") { out.push(row); continue; }
    const held = best.get(row.type);
    if (!held || row.value > held.value) best.set(row.type, row);
  }
  return [...best.values(), ...out];
}

/**
 * The formula with the bonuses added, and the card's words for them.
 *
 * @param {string} formula
 * @param {Array<{label: string, value: number, type: string}>} rows from declaredSpellDamageBonuses
 * @returns {{formula: string, total: number, text: string}}
 */
export function withSpellDamageBonus(formula, rows = []) {
  const total = (rows ?? []).reduce((sum, r) => sum + Math.trunc(Number(r?.value) || 0), 0);
  const base = String(formula ?? "").trim();
  if (!base || !total) return { formula: base, total: 0, text: "" };
  const text = rows
    .filter((r) => Number(r?.value))
    .map((r) => `${r.label} ${r.value > 0 ? "+" : ""}${r.value}${r.type && r.type !== "untyped" ? ` ${r.type === "race" ? "racial" : r.type}` : ""}`)
    .join(", ");
  return { formula: `${base} ${total < 0 ? "-" : "+"} ${Math.abs(total)}`, total, text };
}

/** A "highest" type keeps its best row (by `field`); the rest, and penalties, all count. */
function stackedBy(rows, field) {
  const best = new Map();
  const kept = [];
  for (const row of rows) {
    if (row[field] < 0 || STACKING[row.type] !== "highest") { kept.push(row); continue; }
    const held = best.get(row.type);
    if (!held || row[field] > held[field]) best.set(row.type, row);
  }
  return [...best.values(), ...kept];
}

/**
 * The per-die bonuses (3.683.0, C6) a caster's effects add to a pool of this
 * damage type, stacked.
 *
 * @param {Iterable} effects the caster's applied effects
 * @param {{damageType?: string, traits?: string|string[]}} context
 *   the POOL's damage type; the spell's traits (for a row's `traits`)
 * @returns {Array<{label: string, perDie: number, type: string}>}
 */
export function declaredSpellDamagePerDie(effects = [], { damageType = "", traits = [] } = {}) {
  const pool = lower(damageType);
  const have = new Set(traitList(traits));
  const rows = [];
  for (const effect of Array.from(effects ?? [])) {
    if (!effect || effect.disabled) continue;
    const declared = effect?.flags?.[SYSTEM_ID]?.spellDamageBonus;
    for (const row of Array.isArray(declared) ? declared : (declared ? [declared] : [])) {
      if (!row || typeof row !== "object" || row.perDie === undefined || row.perDie === null) continue;
      const perDie = Math.trunc(Number(row.perDie) || 0);
      if (perDie <= 0) continue;
      const types = traitList(row.damageTypes);
      if (types.length && !types.includes(pool)) continue;
      const wanted = traitList(row.traits);
      if (wanted.length && !wanted.some((t) => have.has(t))) continue;
      const type = STACKING[String(row.type ?? "").trim()] ? String(row.type).trim() : "untyped";
      rows.push({ label: String(row.label ?? effect.name ?? "").trim() || "Spell damage bonus", perDie, type });
    }
  }
  return stackedBy(rows, "perDie");
}

/**
 * How many dice a damage formula rolls: "2d6 + 1d4 + 3" is 3, "d8" is 1.
 * Keep and drop modifiers ("4d6kh3") count the dice thrown. Pure.
 */
export function countDamageDice(formula) {
  let n = 0;
  for (const m of String(formula ?? "").matchAll(/(?<![\w.@])(\d*)\s*d\s*(\d+|%)/gi)) {
    n += m[1] === "" ? 1 : Math.trunc(Number(m[1]) || 0);
  }
  return n;
}

/**
 * What the per-die rows add to one pool, and the card's words for it.
 *
 * @param {string|number} dice the pool's formula (its dice are counted) or a number of dice
 * @param {Array<{label: string, perDie: number, type: string}>} rows from declaredSpellDamagePerDie
 * @returns {{dice: number, perDie: number, total: number, text: string}}
 */
export function spellDamagePerDie(dice, rows = []) {
  const count = typeof dice === "number" ? Math.max(0, Math.trunc(dice) || 0) : countDamageDice(dice);
  const live = (rows ?? []).filter((r) => Math.trunc(Number(r?.perDie) || 0) > 0);
  const perDie = live.reduce((sum, r) => sum + Math.trunc(Number(r.perDie)), 0);
  const total = count * perDie;
  if (!total) return { dice: count, perDie, total: 0, text: "" };
  const named = live
    .map((r) => `${r.label} +${r.perDie}${r.type && r.type !== "untyped" ? ` ${r.type === "race" ? "racial" : r.type}` : ""}`)
    .join(", ");
  return { dice: count, perDie, total, text: `${named} per die × ${count} ${count === 1 ? "die" : "dice"} = +${total}` };
}
