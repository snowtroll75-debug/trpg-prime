/**
 * RUNES THAT RUN FOR A WHILE — NEW at 3.615.0, Graham's R5, R6 and R10 of
 * block 36 (pages 361–370).
 *
 * Animated (page 366): "Once the rune has been activated, its effects last
 * for 1 minute, after which the shield drops to the ground, ending its
 * floating effect and may not be activated again for 1 minute."
 * Arrow Catching (page 366): "Activate Engage (1 AP) … When activated the
 * armour or shield increases its bonus to DB by +1 against missile
 * attacks." The page gives no duration; Graham ruled a minute, like
 * Animated (R6).
 *
 * ONE MECHANISM FOR BOTH. The item keeps its state where it always has
 * (`flags.trg-prime.runeState.<state>`), and a TIMER EFFECT on the wearer
 * keeps the minute — a spell-style effect with a world-time end and, in a
 * combat, an end round, so both expiry sweeps take it down like any other
 * timed effect. Its deletion is what ends the state: one place, whichever
 * route ended it.
 *
 * THE COOLDOWN is a world-time stamp on the item, which a combat round
 * moves on by six seconds like everything else.
 *
 * Pure; no Foundry. The documents half is rune-timers-workflow.mjs.
 */

export const RUNE_TIMER_FLAG = "runeTimer";
const ROUND_SECONDS = 6;

/**
 * The timer effect's flags for one activation.
 * @param {{itemId: string, key: string, state: string, durationSeconds: number, cooldownSeconds?: number}} spec
 * @param {{worldTime: number, round: number|null}} now
 */
export function runeTimerFlags(spec, now) {
  const seconds = Math.max(0, Math.floor(Number(spec?.durationSeconds) || 0));
  const rounds = Math.max(1, Math.ceil(seconds / ROUND_SECONDS));
  return {
    [RUNE_TIMER_FLAG]: {
      itemId: String(spec?.itemId ?? ""),
      key: String(spec?.key ?? ""),
      state: String(spec?.state ?? ""),
      cooldownSeconds: Math.max(0, Math.floor(Number(spec?.cooldownSeconds) || 0)),
      // ITS OWN WORDS AT THE END (3.673.0, C9): an item's timed use (the
      // Incense Burner's hour) says what ended, not "the rune's minute".
      ...(spec?.ending && typeof spec.ending === "object" ? { ending: { lapsed: String(spec.ending.lapsed ?? ""), manual: String(spec.ending.manual ?? "") } } : {})
    },
    spellEffect: true,
    spellEffectEnd: Number(now?.worldTime ?? 0) + seconds,
    ...(now?.round !== null && now?.round !== undefined ? { conditionExpiresRound: Number(now.round) + rounds } : {})
  };
}

/**
 * Seconds of cooldown left on one of an item's runes.
 * @param {object} item
 * @param {string} key the rune key
 * @param {number} worldTime
 */
export function runeCooldownLeft(item, key, worldTime) {
  const until = Number(item?.flags?.["trg-prime"]?.runeState?.cooldown?.[key] ?? 0);
  return Math.max(0, until - Number(worldTime ?? 0));
}

/** "1 minute", "48 seconds" — for the refusal. */
export function cooldownWords(seconds) {
  const s = Math.max(0, Math.ceil(Number(seconds) || 0));
  if (s >= 60 && s % 60 === 0) return `${s / 60} minute${s === 60 ? "" : "s"}`;
  const rounds = Math.ceil(s / ROUND_SECONDS);
  return `${s} seconds (${rounds} round${rounds === 1 ? "" : "s"})`;
}

/*
 * A SPECIFIC ITEM'S SPELL WITH A REST BETWEEN USES (3.616.0, Graham's R11
 * of block 36: "Build the cooldown"). Air Drake Armour: "Activate Command
 * (1 AP); Frequency at will. The armour allows the wearer to fly as the
 * spell. Once activated, the effect lasts for 1 minute and then cannot be
 * activated for another 10 minutes."
 *
 * The item declares it (`specificItem.cooldownSeconds`, and the effect's own
 * length as `effectSeconds`, a minute unless it says otherwise), and the
 * stamp is the same world-time cooldown the timed runes keep, under the key
 * "spellEffect" — so `runeCooldownLeft` answers for both.
 */
export const GRANT_COOLDOWN_KEY = "spellEffect";

/** The item's rest between uses, or null when it has none. */
export function grantCooldownSpec(sourceItem) {
  const spec = sourceItem?.flags?.["trg-prime"]?.specificItem ?? null;
  const cooldownSeconds = Math.max(0, Math.floor(Number(spec?.cooldownSeconds) || 0));
  if (!cooldownSeconds) return null;
  const effectSeconds = Math.max(0, Math.floor(Number(spec?.effectSeconds ?? 60) || 0));
  return { cooldownSeconds, effectSeconds };
}

/** When it may be activated again: the effect's minute, then the rest. */
export function grantCooldownUntil(spec, worldTime) {
  return Number(worldTime ?? 0) + Number(spec?.effectSeconds ?? 0) + Number(spec?.cooldownSeconds ?? 0);
}
