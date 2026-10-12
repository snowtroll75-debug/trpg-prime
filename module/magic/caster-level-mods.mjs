/**
 * Caster Level Modifications (Chapter 9).
 *
 * Cantrips (PP 0) scale for free as the caster's caster level rises — no PP is
 * spent, the spell simply grows stronger. A modifier written "CL N+" applies at
 * caster level N and again every N levels thereafter (N = 4 → CL 4, 8, 12, …);
 * a non-recurring "CL N" applies once, at caster level N. Each modifier may add
 * damage dice, Save DC, and/or attack bonus, once per step passed.
 *
 * The structured modifiers live on `spell.system.casterLevelMods` (parsed from
 * the CASTER LEVEL MODIFICATIONS block); this module resolves them against a
 * caster level so the casting path can fold the result into damage, Save DC,
 * and the attack roll.
 */

/**
 * Merge a dice term like "1d4" into a formula, combining same-size dice.
 * "3d4" + "2d4" → "5d4"; "3d4" + "1d6" → "3d4 + 1d6". Non-dice inputs pass
 * through unchanged so a blank increment never corrupts the base formula.
 * @param {string} formula
 * @param {string} add
 * @returns {string}
 */
export function addDice(formula, add) {
  if (!add) return formula || "";
  if (!formula) return String(add);
  const term = /^(\d+)d(\d+)$/;
  const a = String(formula).match(term);
  const b = String(add).match(term);
  if (a && b && a[2] === b[2]) return `${Number(a[1]) + Number(b[1])}d${a[2]}`;
  return `${formula} + ${add}`;
}

/**
 * Resolve every caster-level modifier on a spell at a given caster level.
 * @param {Array<object>} mods  structured `casterLevelMods`
 * @param {number} casterLevel
 * @returns {{steps:number, damageDice:string, saveDC:number, attack:number, applied:string[]}}
 */
/**
 * A caster's level, read from the one place it actually lives.
 *
 * ADDED AT 3.407.1 AFTER I GOT IT WRONG. The Healing Earth applier read
 * `system.level.value ?? system.details.level` — two fields that do not
 * exist on this system's actors. It therefore resolved to 0 for every
 * caster in the game, and the spell's CL 5 bonus could never apply to
 * anybody, silently, for ever.
 *
 * That is the `wisdom.value` / `.base` mistake again: a plausible path
 * that reads `undefined` and a `?? 0` that turns the mistake into a
 * number. The harness did not catch it because `healingEarthItemData` is
 * pure and takes the level as a PARAMETER — the checks fed it the right
 * value while the applier fed it a wrong one. The decision "what is this
 * caster's level" was being made inside a Foundry-only function where no
 * harness could reach it, which is the shape this project has now paid
 * for five times.
 *
 * IT WAS ALSO ALREADY DUPLICATED. The correct expression appeared twice
 * in cast-workflow.mjs, at the cast itself and again in the power-point
 * recovery path. Three copies of one fact, one of them wrong, is exactly
 * how the wrong one survives: the two right ones keep working and nobody
 * looks. Now there is one.
 *
 * THE ORDER MATTERS. `casterLevelValue` is the derived figure a class
 * table produces and is what a cast should use; `casterLevel` is the
 * stored input behind it; `identity.level` is the character's own level,
 * the fallback for an actor with no casting block at all.
 *
 * @param {object} system an actor's `system` data
 * @returns {number} the caster level, floored at 0
 */
/**
 * A WARP THAT SCALES THE ROW'S OWN PRINTED EXTRA (3.522.0).
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS SAY THIS AND NEITHER HALF WAS BUILT.
 *
 *   Cure     "+2 PP: the amount of healing increases by 1d8 AND THE
 *             EXTRA HEALING FOR THE 2-ACTION VERSION INCREASES BY 8"
 *   Inflict  "+2 PP: the amount of damage increases by 1d8 OR 1d8+8 FOR
 *             THE 2 AP VERSION"
 *
 * The dice half has been live since the bleed channel: `damageDice` adds
 * 1d8 and `addDice` appends it. The other half — the flat term on the
 * two-action row — reached nothing, so a caster who bought the warp got
 * the extra die and not the extra eight. Graham reported it on Cure and
 * it has stood open through six releases.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ROW'S OWN EXTRA, AGAIN, PER PURCHASE — rather than a literal 8.
 *
 * Both spells print exactly 8 on their two-action row, so the two
 * readings cannot be told apart in the data. This one is chosen because
 * it is the one that stays true: the number lives in ONE place (the AP
 * row's own formula), and a spell whose row prints a different extra
 * gets that extra rather than somebody else's eight. Authoring the 8 as
 * a warp mod would have put the same number in two places and waited.
 *
 * A ROW WITH NO FLAT TERM IS UNTOUCHED, which is what makes the rule
 * safe: Cure's 1 AP and 3 AP rows are a bare "1d8", so the warp adds
 * only its die to them — exactly as both spells' text says.
 *
 * @param {string} formula the AP row's own formula, e.g. "1d8 + 8"
 * @param {object} warpMods aggregated warp mods
 * @returns {string}
 */
/**
 * A HEAL ROW'S FORMULA, AFTER ITS WARPS (3.531.0).
 *
 * The heal row has consumed `damageDice` since the bleed channel — Cure's
 * "+2 PP: the amount of healing increases by 1d8" is carried as
 * `damageDice: "1d8"`, because on Cure the healing IS the spell's one
 * number and there is nothing else for a die to land on.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THAT BREAKS THE MOMENT A SPELL HEALS AND HURTS WITH DIFFERENT DICE.
 *
 * Wash Away Sin heals `1d8` and deals `1d6`, and its warp reads:
 *
 *   "+2 PP: increase both the healing and damage by 1 die"
 *
 * One `damageDice` string cannot be both. Set it to "1d8" and the damage
 * becomes `1d6 + 1d8`; set it to "1d6" and the healing becomes
 * `1d8 + 1d6`. Neither is "one more die" — they are two dice of the wrong
 * size, and `addDice` correctly refuses to merge them, which is how the
 * mistake would have reached the table looking deliberate.
 *
 * So `healDice` names the healing side ONLY, and falls back to
 * `damageDice` when it is absent so that Cure and every spell like it
 * keeps behaving exactly as it did.
 *
 * `healBonus` is the flat sibling. `warpedRowExtra` cannot serve here: it
 * multiplies a formula's TRAILING CONSTANT ("1d8 + 8" → "1d8 + 16"), and
 * Make Whole prints a bare "20" with a warp that adds five to it. Growing
 * an extra that exists and adding one that does not are different verbs,
 * so they are different mods rather than one mod with a surprise.
 *
 * ORDER MATTERS AND IS DELIBERATE: the row's own extra first, then the
 * dice, then the flat bonus — so "20" + 5 reads "20 + 5" and not a
 * constant folded into a die term.
 *
 * @param {string} formula the row's printed healing formula
 * @param {object} warpMods aggregated warp mods
 * @returns {string}
 */
export function warpedHealFormula(formula, warpMods = {}) {
  const dice = String(warpMods?.healDice ?? "").trim() || String(warpMods?.damageDice ?? "").trim();
  const withDice = addDice(warpedRowExtra(formula, warpMods), dice);
  const flat = Math.trunc(Number(warpMods?.healBonus) || 0);
  // A NEGATIVE BONUS IS NOT A HEAL. No warp in the pack prints one, and a
  // fix that did should not quietly turn healing into harm.
  if (flat <= 0) return withDice;
  return withDice ? `${withDice} + ${flat}` : String(flat);
}

export function warpedRowExtra(formula, warpMods = {}) {
  const repeats = Math.max(0, Math.trunc(Number(warpMods?.rowExtra) || 0));
  const text = String(formula ?? "");
  if (!repeats || !text) return text;
  // THE LAST TRAILING CONSTANT, and only a trailing one. "1d8 + 8" has an
  // extra; "8 + 1d8" is a formula whose author put the constant first and
  // is not what either spell prints, so it is left alone rather than
  // guessed at.
  const m = /^(.*?)\+\s*(\d+)\s*$/.exec(text);
  if (!m) return text;
  const grown = Number(m[2]) * (1 + repeats);
  return `${m[1].trimEnd()} + ${grown}`;
}

export function casterLevelOf(system) {
  const raw = system?.magic?.casterLevelValue
    ?? system?.magic?.casterLevel
    ?? system?.identity?.level
    ?? 0;
  return Math.max(0, Math.floor(Number(raw) || 0));
}

export function applyCasterLevelMods(mods, casterLevel) {
  const cl = Math.max(0, Math.floor(Number(casterLevel) || 0));
  /*
   * `persistent` JOINS THE RESOLVED SET AT 3.483.0.
   *
   * Orb Of Fire prints "CL 4+: The damage increases by 1d6 AND THE
   * PERSISTENT BY 1" — a ladder that climbs alongside the dice. Nothing
   * read it: `system.damage.persistent` was a stored field adjusted only
   * by warping, so a 12th-level caster's Orb Of Fire did 4d6 and the
   * same 1 recurring it did at 1st.
   *
   * Found on 3 September 2026 when Graham asked that every PP 0 damaging
   * cantrip scale the same way. Ten of the eleven already did; this and
   * Daze were the two that did not, and neither would ever have been
   * reported — a rider one point light looks exactly like a rider.
   */
  const out = { steps: 0, damageDice: "", saveDC: 0, attack: 0, persistent: 0, applied: [] };
  for (const mod of Array.isArray(mods) ? mods : []) {
    const threshold = Math.floor(Number(mod?.threshold) || 0);
    if (threshold < 1) continue;
    const steps = mod?.recurring
      ? Math.floor(cl / threshold)
      : cl >= threshold
        ? 1
        : 0;
    if (steps <= 0) continue;
    out.steps += steps;
    const diceTerm = String(mod?.damageDice ?? "").match(/^(\d+)d(\d+)$/);
    if (diceTerm) {
      out.damageDice = addDice(out.damageDice, `${Number(diceTerm[1]) * steps}d${diceTerm[2]}`);
    }
    if (mod?.persistent) out.persistent += Number(mod.persistent) * steps;
    if (mod?.saveDC) out.saveDC += Number(mod.saveDC) * steps;
    if (mod?.attack) out.attack += Number(mod.attack) * steps;
    if (mod?.text) out.applied.push(String(mod.text));
  }
  return out;
}

/**
 * A short human summary of what auto-warped ("+2d4 damage, +4 Save DC"), for the
 * cast card. Empty string when nothing applied.
 * @param {{damageDice:string, saveDC:number, attack:number}} resolved
 * @returns {string}
 */
export function describeCasterLevelMods(resolved) {
  const bits = [];
  if (resolved.damageDice) bits.push(`+${resolved.damageDice} damage`);
  if (resolved.persistent) bits.push(`+${resolved.persistent} recurring`);
  if (resolved.saveDC) bits.push(`+${resolved.saveDC} Save DC`);
  if (resolved.attack) bits.push(`+${resolved.attack} attack`);
  return bits.join(", ");
}
