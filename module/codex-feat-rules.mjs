/**
 * THE CODEX FEATS THAT ACT (3.632.0; Fiends & Fables 3.0 block 2, Graham's
 * rulings of 10 October 2026: "go with your recommendations for all").
 *
 *   CRIMSON COVENANT  "When you suffer a bleed result of 5 or greater, your
 *                     next attack gains +4 luck bonus. If you deal a critical
 *                     injury because of this attack, your bleeding stops."
 *                     (ruling 2: a critical injury that leaves Bleeding 5+ on
 *                     the character arms it; the next weapon attack spends it.)
 *   HOWLING KINSHIP   "both you and the creature gain +1 circumstance bonus to
 *                     all attack rolls while within 10 feet of each other"
 *                     (ruling 3: master and animal companion, measured.)
 *   SCALY RESILIENCE  "You secrete an oily substance that grants you
 *                     Resistance against the breath weapon. Additionally, you
 *                     gain a +1-circumstance bonus to either your DB or saving
 *                     throw against the attack." (ruling 4: a declared breath
 *                     reaching the character spends the reaction, adds the +1
 *                     to the save and halves the damage.)
 *
 * Pure: the workflows read the flags and the tokens and ask these.
 */

export const CRIMSON_COVENANT = "Crimson Covenant";
export const CRIMSON_COVENANT_FLAG = "crimsonCovenant";
export const HOWLING_KINSHIP = "Howling Kinship";
const HOWLING_KINSHIP_FEET = 10;
export const SCALY_RESILIENCE = "Scaly Resilience";

const owns = (items, name) => Array.from(items ?? []).some((i) => i?.type === "feat"
  && String(i?.name ?? "").trim().toLowerCase() === name.toLowerCase());

export function ownsCodexFeat(items, name) { return owns(items, name); }

/** Does this critical injury's tag list leave a bleed result of 5 or more? */
export function crimsonCovenantArms(items, tags = []) {
  if (!owns(items, CRIMSON_COVENANT)) return false;
  return (tags ?? []).some((t) => String(t?.key ?? "") === "bleeding" && Number(t?.value) >= 5);
}

/**
 * At the start of a weapon attack: the modifier to add, and what the flag
 * becomes. "armed" → +4 luck and "live" (this attack is the one). A "live"
 * left from an attack that dealt no critical is cleared — the covenant
 * was spent on it.
 */
export function crimsonCovenantAtAttack(state) {
  const s = String(state?.state ?? state ?? "");
  if (s === "armed") return { modifier: { label: CRIMSON_COVENANT, value: 4, type: "luck" }, next: "live" };
  if (s === "live") return { modifier: null, next: null };
  return { modifier: null, next: undefined };
}

/** A critical injury dealt by this attack stops the attacker's bleeding. */
export function crimsonCovenantStopsBleeding(state) {
  return String(state?.state ?? state ?? "") === "live";
}

/**
 * Howling Kinship's +1, for an attacker whose partner (its companion, or its
 * master) is within 10 ft, when the master owns the feat.
 */
export function howlingKinshipModifier({ masterOwnsFeat = false, partnerFeet = Infinity } = {}) {
  if (!masterOwnsFeat) return null;
  if (!(Number(partnerFeet) <= HOWLING_KINSHIP_FEET)) return null;
  return { label: HOWLING_KINSHIP, value: 1, type: "circumstance" };
}

/**
 * Scaly Resilience against a breath: the save row and the damage halving.
 * Only for a declared breath, and only with the reaction to spend.
 */
export function scalyResilience({ ownsFeat = false, isBreath = false, reactionAvailable = true } = {}) {
  if (!ownsFeat || !isBreath || !reactionAvailable) return null;
  return { saveModifier: { label: SCALY_RESILIENCE, value: 1, type: "circumstance" }, resist: true };
}
