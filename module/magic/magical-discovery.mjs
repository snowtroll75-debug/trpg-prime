/**
 * Magical Discovery (Chapter 5 feat, `packs-source/feats/magical-
 * discovery.json`): "You have unlocked the secrets of a new spell or
 * gain an additional slot to memorise a spell in. If you are an
 * instinctive caster, you may learn an additional spell and add it to
 * your repertoire. If you are a learned caster, you gain an additional
 * spell memorised slot each day. You may select this feat multiple
 * times but never more than once every two levels."
 *
 * 3.226.0 replaces the original one-shot grant (a standalone spell,
 * outside the repertoire schedule entirely, for the instinctive branch
 * only — the learned branch was a note-only reminder with no mechanical
 * effect at all) with the printed reading: each copy is worth ONE
 * bonus SLOT, fed straight into the existing schedule
 * (`repertoireState`'s `bonus`, `memorisationState`'s `bonusLeveled`)
 * so it fills through the class's own Pick Spell / Memorise Spell
 * button exactly like a schedule-granted slot — nothing new to learn,
 * and it counts against the same `repertoirePick` / `dailyMemorised`
 * bookkeeping everything else already uses.
 *
 * The "never more than once every two levels" cadence is deliberately
 * NOT enforced — no repeatable feat in this pack has code-level cadence
 * gating (Elemental Spell, Favoured Terrain, Increase Size, Specialist
 * Spell and half a dozen others all rely on the printed text alone, with
 * `template.json`'s feat schema carrying no field for it at all), so
 * Magical Discovery stays consistent with that rather than becoming the
 * one exception.
 *
 * Pure functions only — the Foundry side (the Use button's confirmation
 * card, and the rare classless-caster chooser) lives in
 * feats-workflow.mjs.
 */

const SYSTEM_ID = "trg-prime";

/**
 * Which bucket a single copy of the feat counts toward: the actor's own
 * declared caster style when the class states one (every class since
 * 3.224.0 does); otherwise whatever THIS copy recorded when its "which
 * kind of caster are you?" question was asked — a rare path, since a
 * class-less caster is the only character who still gets asked at all.
 *
 * @param {object} actor
 * @param {object} item The feat item (a specific copy).
 * @returns {"instinctive"|"learned"|""}
 */
export function magicalDiscoveryStyleFor(actor, item) {
  const declared = String(actor?.system?.magic?.casterStyle ?? "").trim().toLowerCase();
  if (declared === "instinctive" || declared === "learned") return declared;
  return String(item?.flags?.[SYSTEM_ID]?.magicalDiscoveryStyleChoice ?? "").trim().toLowerCase();
}

/**
 * How many bonus slots of the given style this actor's Magical Discovery
 * feats are worth — one slot per owned copy whose bucket matches.
 *
 * @param {object} actor
 * @param {"instinctive"|"learned"} style
 * @returns {number}
 */
export function magicalDiscoveryBonus(actor, style) {
  const wanted = String(style ?? "").trim().toLowerCase();
  if (!wanted) return 0;
  return Array.from(actor?.items ?? []).filter((item) => {
    if (item?.type !== "feat") return false;
    if (String(item?.name ?? "").trim().toLowerCase() !== "magical discovery") return false;
    return magicalDiscoveryStyleFor(actor, item) === wanted;
  }).length;
}
