/**
 * The three Chapter 5 feats that change what Channels can do.
 *
 *   Turn Undead        "When using your Channels ability, you may
 *                       instead use the Turn Undead spell."
 *   Versatile Channels "You can expend one of your uses of channels to
 *                       cast either a remove curse, remove disease,
 *                       remove paralysis or restore senses spell. The
 *                       spell is warped to your maximum PP."
 *   Alignment Channel  "Any spell or ability that you have which affects
 *                       creatures of the undead type in a harmful way,
 *                       may also be applied to affect eternals with the
 *                       evil trait."
 *
 * TWO OF THE THREE ARE THE SAME FEAT. Turn Undead and Versatile Channels
 * both widen the list the Channels button offers, and both spend the
 * same use — so they are one table here, not two handlers that each
 * remember to deduct a use. The third is a different mechanism entirely
 * and lives in magic/alignment-channel.mjs.
 *
 * NO SECOND POOL. Both feats say "using your Channels ability" and
 * "expend one of your uses of channels": the spell they add is cast
 * through the same button, off the same counter. A spell added with its
 * own daily count would be a second answer to how many channels a Cleric
 * has left — the defect this chapter keeps finding.
 */

const normalise = (name) => String(name ?? "").trim().toLowerCase();

/**
 * The four the Channels ability itself offers, as printed. Used only
 * when the ability item carries no `spellChoices` flag of its own — a
 * hand-made copy that predates the flag.
 */
export const PRINTED_CHANNEL_SPELLS = Object.freeze([
  "Cure", "Inflict", "Lifekeeping", "Restoration"
]);

/** feat (normalised) → the spells it adds to the Channels list. */
export const CHANNEL_FEAT_SPELLS = Object.freeze({
  "turn undead": Object.freeze(["Turn Undead"]),
  "versatile channels": Object.freeze([
    "Remove Curse", "Remove Disease", "Remove Paralysis", "Restore Senses"
  ])
});

/**
 * Every spell this Cleric's Channels button should offer.
 *
 * ORDER IS THE ABILITY'S OWN FIRST, then the feats in the order they are
 * declared above — so a Cleric who takes Turn Undead does not find their
 * four familiar options reshuffled underneath them. Duplicates collapse:
 * a feat that added something already on the list adds nothing, rather
 * than showing it twice.
 *
 * @param {object} opts
 * @param {string[]} [opts.base]       the ability's own list (its `spellChoices` flag)
 * @param {string[]} [opts.featNames]  every feat name on the actor
 * @returns {string[]}
 */
export function channelSpellOptions({ base = null, featNames = [] } = {}) {
  const out = [];
  const seen = new Set();
  const push = (name) => {
    const key = normalise(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name);
  };
  for (const name of Array.isArray(base) && base.length ? base : PRINTED_CHANNEL_SPELLS) push(name);
  const held = new Set((Array.isArray(featNames) ? featNames : []).map(normalise));
  for (const [feat, spells] of Object.entries(CHANNEL_FEAT_SPELLS)) {
    if (!held.has(feat)) continue;
    for (const name of spells) push(name);
  }
  return out;
}

/**
 * Which feat put this option on the list, or "" for one the ability
 * itself offers.
 *
 * The card says so. A Cleric pressing Channels and getting Remove
 * Disease should be able to see WHY it was on offer — and if a feat is
 * ever removed, why it stopped being.
 */
export function channelSpellSource(spellName) {
  const wanted = normalise(spellName);
  for (const [feat, spells] of Object.entries(CHANNEL_FEAT_SPELLS)) {
    if (spells.some((s) => normalise(s) === wanted)) return feat;
  }
  return "";
}

/** Every feat name this module speaks for — the register's evidence. */
export const CHANNEL_FEATS = Object.freeze(Object.keys(CHANNEL_FEAT_SPELLS));
