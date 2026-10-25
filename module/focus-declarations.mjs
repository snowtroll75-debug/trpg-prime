/**
 * FOCUS AND INNATE DECLARATIONS FOR COMPANION MODULES (3.664.0).
 *
 * Inner Tempest is built on the Focus trait: every technique is "ready
 * until used; once used, it becomes expended … until it is restored with
 * Refocus" (Inner Tempest 1.2, Chapters 1 and 7). Core already tracks that
 * — expended is a spent per-day use, Refocus hands one back — and these
 * are the five things the book needs on top, each a DECLARATION a module
 * puts on a carrier (an applied effect, or an active ability item; see
 * declaration-carriers.mjs) rather than a name core has to know:
 *
 *   flags.trg-prime.focusExtraUses: [{value, traits?, names?, restoresAll?}]
 *       Deep Focus: "Each technique you possess with the Focus trait can be
 *       used one additional time before it becomes expended". Ghost Art
 *       Mastery: the same, for one chosen art. Added to `itemUsesMax` for
 *       every Focus item the row matches — derived, never written onto the
 *       item, so losing the feature takes the use away with it.
 *
 *   …restoresAll (default true): "When you successfully Refocus a
 *       technique, all of the uses granted to that technique by Deep Focus
 *       are restored." Graham, 20 Oct 2026: that rule applies ONLY to
 *       abilities with extra uses from these declarations. Everything else
 *       keeps core's one use per Refocus (`restoredUses`).
 *
 *   flags.trg-prime.actionAbilityOptions: [{action, ability, label?}]
 *       Considered Mind (Kensai): "When making Refocus (Mental Focus)
 *       checks, you may use your Intelligence modifier instead of Wisdom."
 *       Unwavering Purpose (Oathblade) the same with Charisma. Scoped to one
 *       ACTION, not the whole skill — the Kensai's other Mental Focus checks
 *       stay on Wisdom. Applied as the difference, and only when it helps.
 *
 *   spell flags.trg-prime.castingAbilityOverride: "<attribute key>"
 *       "Charisma is your magical ability score for this spell" — one innate
 *       spell's own ability, read for its innate attack and save DC.
 *       Pillars of Faith has written this flag since 0.4.0 and nothing in
 *       core read it.
 *
 *   The innate PP gate (Graham, 20 Oct 2026): an innate spell cannot be
 *       cast while its base PP exceeds the level it is cast at. For
 *       characters and companions only — a printed stat block's spell-likes
 *       are the creature's own (91 Fiends & Fables innate spells sit above
 *       their creature's level, and they are right to).
 *
 * Pure: plain objects in, plain answers out. Wired by uses-workflow.mjs,
 * combat/refocus-workflow.mjs, combat/action-workflow.mjs and
 * magic/cast-workflow.mjs.
 */

import { hasFocusTrait } from "./combat/refocus.mjs";

const FLAG_SCOPE = "trg-prime";

const norm = (s) => String(s ?? "").trim().toLowerCase();

/** Does this traits string carry the Focus trait (whole word)? Core's own test. */
const carriesFocus = (traits) => hasFocusTrait(traits);

/** A traits string or array as a lowercased list. */
function traitList(traits) {
  if (Array.isArray(traits)) return traits.map(norm).filter(Boolean);
  return String(traits ?? "").split(",").map(norm).filter(Boolean);
}

/** A declaration flag on one carrier, as an array of rows. */
function rowsOn(carrier, key) {
  const raw = carrier?.flags?.[FLAG_SCOPE]?.[key];
  if (Array.isArray(raw)) return raw.filter((r) => r && typeof r === "object");
  return raw && typeof raw === "object" ? [raw] : [];
}

/**
 * The focusExtraUses rows that reach one item.
 *
 * A row with neither `traits` nor `names` reaches every Focus item. With
 * `traits`, the item must carry at least one of them; with `names`, the
 * item's name must be one of them (both given: either may match). An item
 * without the Focus trait is never reached — extra uses "before it becomes
 * expended" only mean anything for an ability that expends.
 *
 * @param {{name?: string, system?: {traits?: string}}} item
 * @param {Array<object>} carriers
 * @returns {Array<{value: number, restoresAll: boolean, label: string}>}
 */
function focusExtraUseRows(item, carriers = []) {
  if (!carriesFocus(item?.system?.traits)) return [];
  const itemTraits = new Set(traitList(item?.system?.traits));
  const itemName = norm(item?.name);
  const out = [];
  for (const carrier of carriers ?? []) {
    for (const row of rowsOn(carrier, "focusExtraUses")) {
      const value = Math.floor(Number(row.value) || 0);
      if (value <= 0) continue;
      const wantTraits = traitList(row.traits);
      const wantNames = (Array.isArray(row.names) ? row.names : row.names ? [row.names] : []).map(norm).filter(Boolean);
      const filtered = wantTraits.length || wantNames.length;
      const byTrait = wantTraits.some((t) => itemTraits.has(t));
      const byName = wantNames.includes(itemName);
      if (filtered && !byTrait && !byName) continue;
      out.push({ value, restoresAll: row.restoresAll !== false, label: String(row.label ?? carrier?.name ?? "") });
    }
  }
  return out;
}

/** The extra daily uses the declarations give one item. */
export function focusExtraUses(item, carriers = []) {
  return focusExtraUseRows(item, carriers).reduce((sum, r) => sum + r.value, 0);
}

/**
 * How many uses a successful Refocus hands back.
 *
 * One (core, unchanged) unless the item has extra uses from a declaration
 * that restores all — then every use, up to the maximum.
 *
 * @param {number} current  uses remaining now
 * @param {number|null} max the item's daily maximum
 * @param {boolean} restoresAll
 * @returns {number} the new remaining count
 */
export function refocusRestoredUses(current, max, restoresAll) {
  const cur = Math.max(0, Math.floor(Number(current) || 0));
  if (max === null || max === undefined || !Number.isFinite(Number(max))) return cur + 1;
  const cap = Math.max(0, Math.floor(Number(max)));
  return restoresAll ? cap : Math.min(cap, cur + 1);
}

/** Whether Refocus on this item restores every use. */
export function refocusRestoresAll(item, carriers = []) {
  return focusExtraUseRows(item, carriers).some((r) => r.restoresAll);
}

/**
 * Rows to add to an action check when a declaration lets it use another
 * ability score. The skill's own ability stays the skill's; this adds the
 * difference, as an untyped modifier, only when the option is higher.
 * With several options the best one is taken, once.
 *
 * @param {Array<object>} carriers
 * @param {string} actionKey   e.g. "refocus"
 * @param {string} skillAbility the rolled skill's ability key
 * @param {Record<string, {total?: number}>} attributes
 * @returns {Array<{label: string, value: number, type: string}>}
 */
export function actionAbilityRows(carriers, actionKey, skillAbility, attributes = {}) {
  const action = norm(actionKey);
  const base = Number(attributes?.[norm(skillAbility)]?.total ?? 0);
  let best = null;
  for (const carrier of carriers ?? []) {
    for (const row of rowsOn(carrier, "actionAbilityOptions")) {
      if (norm(row.action) !== action) continue;
      const ability = norm(row.ability);
      const score = Number(attributes?.[ability]?.total);
      if (!Number.isFinite(score) || score <= base) continue;
      if (!best || score > best.score) {
        best = { score, ability, label: String(row.label ?? carrier?.name ?? "") };
      }
    }
  }
  if (!best) return [];
  const word = (k) => k.charAt(0).toUpperCase() + k.slice(1);
  return [{
    label: `${best.label ? `${best.label}: ` : ""}${word(best.ability)} instead of ${word(norm(skillAbility))}`,
    value: best.score - base,
    type: "untyped"
  }];
}

/**
 * The attribute key an innate cast of this spell uses: the spell's own
 * `castingAbilityOverride` when it names a real attribute, else the
 * actor's casting ability.
 *
 * @param {object} spell
 * @param {string} actorCastingAbility
 * @param {Record<string, unknown>} attributes
 * @returns {string}
 */
export function innateAbilityKey(spell, actorCastingAbility, attributes = {}) {
  const override = norm(spell?.flags?.[FLAG_SCOPE]?.castingAbilityOverride);
  if (override && Object.hasOwn(attributes ?? {}, override)) return override;
  return String(actorCastingAbility ?? "");
}

/** Actor types whose innate casting the PP gate governs. */
const INNATE_GATED_ACTOR_TYPES = Object.freeze(["character", "companion"]);

/**
 * Graham, 20 Oct 2026: an innate spell cannot be cast while its base PP is
 * above the level it is cast at. Null when the cast may proceed, else the
 * reason. Cantrips (0 PP) always pass; item casts were paid for at the
 * workbench and are never refused here.
 *
 * @param {{actorType: string, basePP: number, castLevel: number, isItemCast?: boolean}} args
 * @returns {string|null}
 */
export function innateLevelRefusal({ actorType, basePP, castLevel, isItemCast = false, allowance = 0 }) {
  if (isItemCast) return null;
  if (!INNATE_GATED_ACTOR_TYPES.includes(String(actorType ?? ""))) return null;
  const pp = Math.max(0, Math.floor(Number(basePP) || 0));
  const level = Math.max(0, Math.floor(Number(castLevel) || 0));
  // A GRANT'S OWN ALLOWANCE (3.667.0; Graham, 22 Oct 2026, Inner Tempest
  // B3-2): the Mystic's discipline spells arrive one PP above the level
  // that grants them (Mage Armour at 1st, Fire Bolt at 3rd), and its
  // 1st-level picks include two PP 2 spells. "Castable up to base PP =
  // level + 1." Declared on the spell copy (`innatePPAllowance`), so every
  // other innate spell keeps the plain limit.
  const extra = Math.max(0, Math.floor(Number(allowance) || 0));
  if (pp <= level + extra) return null;
  return `base PP ${pp} is above level ${level}${extra ? ` + ${extra}` : ""} — an innate spell cannot be cast above your level`;
}

/** A spell copy's own innate PP allowance (3.667.0), 0 when none is declared. */
export function innatePPAllowanceOf(spell) {
  return Math.max(0, Math.floor(Number(spell?.flags?.[FLAG_SCOPE]?.innatePPAllowance) || 0));
}

/**
 * The item updates that clear every rune and wondrous Focus flag (3.664.0).
 * "Daily preparation restores all expended Focus abilities" — but a Focus
 * rune or wondrous item records its expended state as a flag, not a use
 * count, and only Refocus ever cleared it. Pure: items in, updates out.
 *
 * @param {Iterable} items
 * @returns {Array<object>}
 */
export function dailyFocusFlagClears(items) {
  const updates = [];
  for (const item of items ?? []) {
    const flags = item?.flags?.["trg-prime"] ?? {};
    const runeKeys = Object.keys(flags.runeState?.focusExpended ?? {});
    const update = {};
    for (const key of runeKeys) update[`flags.trg-prime.runeState.focusExpended.-=${key}`] = null;
    if (flags.wondrousFocusExpended) update["flags.trg-prime.-=wondrousFocusExpended"] = null;
    if (Object.keys(update).length) updates.push({ _id: item.id ?? item._id, ...update });
  }
  return updates;
}

/**
 * DECLARED CONVICTION (3.664.0). "You may increase your conviction pool and
 * conviction points by 1" — printed for Divine Resolve, Warrior's Resolve
 * and Scoundrel's Luck (core, wired by name), and for Inner Tempest's
 * Disciple's Resolve, Mystical Resolve, Oathblade's Resolve and the Fuku
 * heritage. Declared instead of named: `flags.trg-prime.convictionPool: N`
 * on any owned item raises the maximum (derived, so it leaves with the
 * item), and the item records the one-off point it put in the pool
 * (`convictionGiven`) so it happens once and can be taken back.
 */

/** The pool maximum the declarations add. Inactive abilities add nothing. */
export function declaredConvictionBonus(items = []) {
  let total = 0;
  for (const item of items ?? []) {
    if (item?.type === "ability" && item?.system?.active === false) continue;
    total += Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.convictionPool) || 0));
  }
  return total;
}

/**
 * The one-off point when a declaring item arrives: the new stored value,
 * or null when there is nothing to do (no declaration, or already given).
 *
 * @param {object} item
 * @param {number} current the stored conviction value (from _source)
 */
export function declaredConvictionTopUp(item, current) {
  const n = Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.convictionPool) || 0));
  if (!n || item?.flags?.[FLAG_SCOPE]?.convictionGiven) return null;
  return Math.max(0, Math.floor(Number(current) || 0)) + n;
}

/**
 * Does this item still owe its one-off conviction point? (3.667.1) A class
 * ability granted by its class — Inner Tempest's Disciple's Resolve and
 * Mystical Resolve — has no grants of its own, so the grant pass skipped it
 * and the point was never given: the pool read 2 and the points 1. Found in
 * the live test of 3.667.0. The grant pass now visits an item that owes one.
 */
export function owesConvictionPoint(item) {
  const n = Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.convictionPool) || 0));
  return n > 0 && !item?.flags?.[FLAG_SCOPE]?.convictionGiven;
}

/**
 * The stored-use top-ups when a carrier of `focusExtraUses` arrives
 * (3.667.1): every owned Focus item it reaches gains the extra uses at once,
 * so a technique already on the sheet when Deep Focus arrives holds 2 of 2,
 * not 1 of 2 until the next daily preparation. A use already spent stays
 * spent. Found in the live test of 3.667.0. Pure: updates out.
 *
 * @param {object} carrier the arriving item
 * @param {Iterable<object>} items the actor's other items
 * @returns {Array<{_id: string, "system.usesValue": number}>}
 */
export function focusExtraTopUps(carrier, items = []) {
  if (!rowsOn(carrier, "focusExtraUses").length) return [];
  const out = [];
  for (const item of items ?? []) {
    if (!item || item === carrier || (carrier?.id && item.id === carrier.id)) continue;
    const extra = focusExtraUses(item, [carrier]);
    if (extra > 0) out.push({ _id: item.id, "system.usesValue": Math.max(0, Math.floor(Number(item.system?.usesValue) || 0)) + extra });
  }
  return out;
}

/** The value after a declaring item that gave its point leaves; null if none. */
export function declaredConvictionTakeBack(item, current) {
  const n = Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.convictionPool) || 0));
  if (!n || !item?.flags?.[FLAG_SCOPE]?.convictionGiven) return null;
  return Math.max(0, Math.floor(Number(current) || 0) - n);
}

/**
 * DECLARED FALL REDUCTION (3.664.0). Inner Tempest's Ren: "when calculating
 * damage or other consequences from a fall, treat the distance fallen as
 * 20 feet shorter" (and Awaken the Animism's further 20). A row
 * `fallReduction: {value, label}` on a carrier is subtracted from the
 * distance the falling dialog is given — always on, so the table no longer
 * has to remember it.
 *
 * @param {Array<object>} carriers
 * @returns {{feet: number, labels: string[]}}
 */
export function declaredFallReduction(carriers = []) {
  let feet = 0;
  const labels = [];
  for (const carrier of carriers ?? []) {
    for (const row of rowsOn(carrier, "fallReduction")) {
      const value = Math.max(0, Math.floor(Number(row.value) || 0));
      if (!value) continue;
      feet += value;
      labels.push(`${String(row.label ?? carrier?.name ?? "")} −${value} ft`.trim());
    }
  }
  return { feet, labels };
}

/**
 * DECLARED CARRYING STRENGTH (3.664.0). Kabuto: "you may increase your
 * weight allowance by 50". Weight Allowance is 50 + Strength × 10, so 50 lb
 * is 5 points of carrying Strength — declared as `carryStrength: 5` on any
 * owned item and added where Hauler and the Backpack already are.
 */
export function declaredCarryStrength(items = []) {
  let total = 0;
  for (const item of items ?? []) {
    if (item?.type === "ability" && item?.system?.active === false) continue;
    total += Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.carryStrength) || 0));
  }
  return total;
}

/** The six attribute keys a granted spell's own ability may name. */
const GRANT_ABILITY_KEYS = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);

/**
 * THE GRANTED SPELL'S OWN MAGICAL ABILITY (3.664.0). Inner Tempest's Kitsune
 * "can cast Ghost Sound as an innate cantrip using Charisma as the magical
 * ability"; the Hotaru's Guidance uses Wisdom. A granting item declares
 * `grantedSpellAbility` — one attribute key for every spell it grants, or
 * `{"Ghost Sound": "charisma"}` per spell — and the granted copy is stamped
 * with `castingAbilityOverride`, which `innateAbilityKey` already honours.
 * Null when nothing is declared or the word names no attribute.
 *
 * @param {object} sourceItem
 * @param {string} spellName
 * @returns {string|null}
 */
export function grantedSpellAbilityFor(sourceItem, spellName) {
  const raw = sourceItem?.flags?.[FLAG_SCOPE]?.grantedSpellAbility;
  let key = null;
  if (typeof raw === "string") key = norm(raw);
  else if (raw && typeof raw === "object") {
    const wanted = norm(spellName);
    for (const [name, ability] of Object.entries(raw)) {
      if (norm(name) === wanted) { key = norm(ability); break; }
    }
  }
  return key && GRANT_ABILITY_KEYS.includes(key) ? key : null;
}

/**
 * The extra flags a `spellChoice` entry stamps on the spell it grants
 * (3.664.0): `castingAbility: "wisdom"` becomes the chosen spell's
 * `castingAbilityOverride`. Null when the entry names no attribute.
 *
 * @param {{castingAbility?: string}} spec
 * @returns {{castingAbilityOverride: string}|null}
 */
export function spellChoiceExtraFlags(spec) {
  const key = norm(spec?.castingAbility);
  return key && GRANT_ABILITY_KEYS.includes(key) ? { castingAbilityOverride: key } : null;
}
