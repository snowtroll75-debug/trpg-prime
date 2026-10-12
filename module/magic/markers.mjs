/**
 * Markers — a spell leaves a named flag, and a rule elsewhere reads it.
 *
 * NEW at 3.395.0, built for Stabilise (Chapter 10, PP 0) and deliberately
 * kept to one spell until a second one needs it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A NEW EFFECT KIND RATHER THAN REUSING ONE
 *
 * Stabilise does not change a number on the target. It changes what
 * happens the next time a DIFFERENT subsystem — the Dying Check at the
 * end of the target's turn — computes a result. None of the eight
 * existing effect kinds expresses that:
 *
 *   bonus/defence/attack  modify a value on the sheet; Stabilise
 *                         modifies a decision made in combat.mjs
 *   condition             would need a "Stabilised" entry in the
 *                         condition registry, which is the rulebook's
 *                         vocabulary and does not contain one. Inventing
 *                         a condition to carry a spell's bookkeeping
 *                         would put a word on the character sheet that
 *                         the book never prints.
 *   note                  prints a line and changes nothing — which is
 *                         precisely the "automation that is really a
 *                         reminder" this chapter has been removing.
 *
 * So: a marker. An ActiveEffect that carries a KEY and no changes, whose
 * only job is to be found by name-free lookup and then consumed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE KEY IS THE LOOKUP, NOT THE NAME
 *
 * The obvious cheap version reads `effect.name === "Stabilise"`. That is
 * the exact shape that cost this project Improved Combat Reflexes: the
 * code matched a string, the pack held a different one, both the code
 * and its test agreed with each other and neither had opened the pack.
 * A rename in the compendium, a world copy, or a translation breaks a
 * name match silently.
 *
 * `flags["trg-prime"].marker` is written by the effect application and
 * read by the rule. Neither end ever spells the spell's title, so the
 * spell can be called anything.
 *
 * WHAT STILL HAS TO BE CHECKED is that the pack actually carries a
 * marker effect with a key this registry knows — a spell whose effect
 * says `marker: "stabilized"` would apply cleanly and do nothing at all,
 * for ever, in silence. `verify-markers.mjs` opens the pack and fails on
 * any marker key that is not in MARKERS, and on any MARKERS entry no
 * pack item uses. Both directions, because §5.12: a registry entry
 * nothing reaches is as dead as a pack key nothing implements.
 */

const SYSTEM_ID = "trg-prime";

/**
 * Every marker key this system understands.
 *
 * `label` is what the card and the Effects tab show. `applied`, when
 * present, is how the card says the target now carries it — "is
 * Stabilised" reads, but "is Fist of Rock" did not (3.577.1; F3 of the
 * 3.577.0 live test), so a marker named for a thing rather than a state
 * says its own sentence. `reader` names the
 * module that consumes it, and is documentation with teeth: the verify
 * file checks that the named module really does import `consumeMarker`,
 * so an entry cannot be added here and left unwired.
 */
export const MARKERS = Object.freeze({
  stabilised: Object.freeze({
    label: "Stabilised",
    reader: "module/documents/combat.mjs"
  }),
  // THREE MORE, AND NONE OF THEM A SPELL (3.577.0). The block-17 elixirs
  // and herbs are resolved by the same `applySpellEffects`, and a marker is
  // the right shape for all three — each changes what a DIFFERENT
  // subsystem does later, which is exactly what this file was built for.
  // `verify-markers` now reads the alchemical pack as well as the spells.
  //
  // FIST OF ROCK IS READ, NOT SPENT. "For 1 hour, your fists deal 1d6 base
  // bludgeoning damage": every punch in the hour, so the attack workflow
  // FINDS it, and the effect's own duration is what ends it. `consumed:
  // false` is what lets the reader check below ask for `findMarker`
  // rather than `consumeMarker` — a reader of a lasting marker that
  // consumed it would be the bug, not the fix.
  fistOfRock: Object.freeze({
    label: "Fist of Rock",
    applied: "has fists of living rock",
    reader: "module/combat/attack-workflow.mjs",
    consumed: false
  }),
  // ANGELSTEP PIGMENT: "The next time the wearer gains the dying condition,
  // it gains a +4-item bonus on its next check to recover." Spent by that
  // Dying Check, which is what "next" means.
  angelstep: Object.freeze({
    label: "Angelstep",
    applied: "is marked with Angelstep pigment",
    reader: "module/documents/combat.mjs"
  }),
  // DREAM LICHEN: "A creature that sleeps for at least 8 hours ... Upon
  // waking ... the user automatically doubles the amount of the Soul Drain
  // condition they remove after a night's rest." Spent by that night.
  dreamLichen: Object.freeze({
    label: "Dream Lichen",
    applied: "has Dream Lichen in their system",
    reader: "module/rest/rest-workflow.mjs"
  }),
  // SPEAK WITH DEAD'S CRITICAL (3.606.0, block 32's R1): "their spirit
  // relentlessly haunts you for a full day. During this time, they
  // incessantly torment and disturb you, preventing any chance of rest or
  // respite." READ by the Rest workflow, which refuses the rest outright
  // while it lasts; NOT consumed, because it is a day of torment and not
  // one spoiled night — the effect's own duration is what ends it.
  haunted: Object.freeze({
    label: "Haunted",
    applied: "is haunted by a spirit",
    reader: "module/rest/rest-workflow.mjs",
    consumed: false
  }),
  // FALSE ARROGANCE (3.612.0, block 34's R8): the spell's own effect, lasting
  // as long as the Will save decided. READ, not spent: every failed attack
  // roll or skill check while it lasts writes the penalty, so the reader
  // finds it and the effect's own duration ends it.
  falseArrogance: Object.freeze({
    label: "False Arrogance",
    applied: "is filled with false arrogance",
    reader: "module/magic/false-arrogance-workflow.mjs",
    consumed: false
  }),
  // WATER BREATHING (3.617.0, B5 and C3 of block 37): "the ability to
  // breathe underwater". The spell had no rows, so a Potion of Water
  // Breathing was drunk and its drinker still started a breath clock and
  // drowned. READ, not spent: the drowning workflow finds it each time the
  // creature goes under, and the effect's own hour ends it.
  waterBreathing: Object.freeze({
    label: "Water Breathing",
    applied: "can breathe underwater",
    reader: "module/drowning-workflow.mjs",
    consumed: false
  }),
  // GUIDANCE WAS HERE, AND IS NOT ANY MORE.
  //
  // It was added at 3.400.0 as a marker carrying an `immunitySeconds`
  // field, deliberately general so other "temporarily immune" rules
  // could use it. At 3.411.0 four PP 1 spells turned out to share its
  // whole shape — a bonus that waits, is spent on one roll from the
  // card, and ends — and that shape became `magic/held-bonus.mjs`.
  //
  // GUIDANCE MOVED THERE, and this file's own rule then applied to
  // itself: "a registry entry nothing reaches is as dead as a pack key
  // nothing implements". `verify-markers` C2 said so the moment the
  // pack row changed, which is exactly what it is for.
  //
  // So markers are back to the one spell they were built for, which is
  // where this file's header always said they should stay until a
  // second one genuinely needed them. The second one did not.
});

/** @returns {boolean} whether `key` is a marker this system implements. */
export function isMarkerKey(key) {
  return Object.hasOwn(MARKERS, String(key ?? ""));
}

/**
 * The card line for a marker just applied: "Mira is <strong>Stabilised</strong>
 * (1 minute)." for a state, or the marker's own `applied` sentence for a
 * thing — "Mira has fists of living rock (1 hour)."
 *
 * @param {string} targetName
 * @param {string} key a MARKERS key
 * @param {string} [durationText] already formatted, e.g. " (1 hour)"
 * @returns {string} HTML
 */
export function markerAppliedLine(targetName, key, durationText = "") {
  const entry = MARKERS[key];
  if (!entry) return `${targetName}: unknown marker "${key}".`;
  const phrase = entry.applied
    ? `<strong>${entry.applied}</strong>`
    : `is <strong>${entry.label}</strong>`;
  return `${targetName} ${phrase}${durationText ?? ""}.`;
}

/**
 * The system-flag payload that marks an effect.
 *
 * WHY A WRITER EXISTS AT ALL, when the caller could write the object
 * literal in one line: because it did, and a mutation proved the cost.
 * `mutate-markers` #10 changed spell-effects.mjs to write the key under
 * `markerKey` instead of `marker` — and the whole harness stayed green.
 * Fifty-nine checks, and not one of them noticed that the spell now
 * applied a flag no reader would ever look at. Stabilise would have
 * cast, printed its line, shown its effect, and done nothing.
 *
 * The check that "would have caught it" is not the interesting question;
 * a cleverer assertion could compare the two spellings. THE PROBLEM IS
 * THAT THERE WERE TWO SPELLINGS — the applier deciding what to write and
 * the reader deciding what to look for, which is two places deciding one
 * question, the defect shape this chapter has paid for five times. The
 * harness could not see it because the stub built the flag object by
 * hand and agreed with the reader: §5.3, a check written beside the code
 * encodes the same mistake.
 *
 * So the string exists once, here, and both ends go through a function.
 * The mutation now has nothing to change that does not change both.
 *
 * @param {string} key
 * @returns {object} the payload to merge into `flags["trg-prime"]`
 */
export function markerFlagData(key) {
  return { marker: String(key) };
}

/**
 * The marker key carried by one effect's flag data, or null.
 *
 * PURE, and takes the flag object rather than the ActiveEffect, so the
 * harness can run it on plain data with no Foundry present. The live
 * caller passes `effect.flags?.["trg-prime"]`.
 *
 * AN UNKNOWN KEY RETURNS NULL rather than throwing or passing through.
 * A stale marker left by an older version of the system should be inert,
 * not fatal — but see the note above: "inert" is only safe because the
 * verify file refuses to let an unknown key exist in the pack in the
 * first place. Silence at runtime is acceptable exactly when a check
 * upstream has made the silent case impossible.
 */
export function markerKeyOf(flagData) {
  const key = String(flagData?.marker ?? "").trim();
  return isMarkerKey(key) ? key : null;
}

/**
 * Find the first effect on an actor carrying the named marker.
 *
 * @param {object} actor a Foundry Actor (or anything with `.effects`)
 * @param {string} key
 * @returns {object|null} the ActiveEffect, or null
 */
export function findMarker(actor, key) {
  if (!isMarkerKey(key)) return null;
  for (const effect of actor?.effects ?? []) {
    if (effect?.disabled) continue;
    if (markerKeyOf(effect.flags?.[SYSTEM_ID]) === key) return effect;
  }
  return null;
}

/**
 * Spend a marker: report whether it was there, and delete it if so.
 *
 * ONE FUNCTION, NOT TWO. "Is it present?" and "remove it" as separate
 * calls is two places deciding one question, and the failure mode is the
 * one this chapter names: a caller that checks and forgets to consume
 * hands the player a permanent Stabilise. Returning the answer AND doing
 * the removal makes the correct use the only use.
 *
 * ONCE PER ROUND falls out of this for free. The spell's own duration is
 * one round, and the marker is deleted the first time it does anything,
 * so a second Stabilise cast on the same target in the same round finds
 * nothing to double up on.
 *
 * @param {object} actor
 * @param {string} key
 * @returns {Promise<boolean>} whether the marker was present and spent
 */
export async function consumeMarker(actor, key) {
  const effect = findMarker(actor, key);
  if (!effect) return false;

  // THE IMMUNITY IS STAMPED BEFORE THE DELETE, and the order is the
  // point. If the delete throws, the player has already had the benefit
  // — so the immunity they earned by spending it must be recorded too,
  // or a failure to tidy up becomes a second free casting. The same
  // reasoning as the `return true` in the catch below.
  const seconds = Number(MARKERS[key]?.immunitySeconds) || 0;
  if (seconds > 0) {
    try {
      const { withImmunity, IMMUNITY_FLAG, prunedImmunities } =
        await import("../temporary-immunity.mjs");
      const now = Number(game.time?.worldTime ?? 0);
      const record = actor?.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
      // PRUNED ON THE WAY PAST. Nothing depends on it — an expired entry
      // is already ignored — but a flag that only grows is a flag that
      // grows for ever.
      const next = withImmunity(prunedImmunities(record, now), key, seconds, now);
      await actor.setFlag(SYSTEM_ID, IMMUNITY_FLAG, next);
    } catch (err) {
      console.warn(`${SYSTEM_ID} | could not stamp the immunity for "${key}"`, err);
    }
  }

  try {
    await effect.delete();
  } catch (err) {
    // THE MARKER STILL COUNTS AS SPENT. If the delete failed the player
    // has already had the benefit this call is reporting, and returning
    // false here would hand it to them a second time — a failure to tidy
    // up must not become a failure to charge. Logged rather than
    // swallowed, because §5.4: a guard that hides a caller's problem is
    // worse than the problem.
    console.warn(`${SYSTEM_ID} | could not delete spent marker "${key}"`, err);
  }
  return true;
}
