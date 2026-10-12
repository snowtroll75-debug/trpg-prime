/**
 * SONIC 90 — the row that says nothing has happened yet, and then waits.
 *
 * NEW at 3.581.0, for the pages 211-220 audit's D3 and D9 and Graham's
 * R3 and R9 of 21 September 2026.
 *
 * > "Other than some physical damage the target appears to be untouched
 * >  by your attack…for now. Each time the target spends more than 1 AP
 * >  in a round they must make a DC 5 flat check or fall unconscious for
 * >  1 minute."
 *
 * WHAT THERE WAS: the condition parser lifted the word `unconscious` out
 * of that second sentence and laid the target out the instant the
 * critical landed — on the one row in fourteen tables whose whole point
 * is that the target is still standing. And nothing watched the
 * expenditure that is supposed to earn it, so even with the premature
 * knockout the row's actual mechanism did not exist.
 *
 * Both halves are fixed, in the two places they belong: the parser no
 * longer takes a condition out of a consequence clause (a sentence rule,
 * not a row patch — see effect-parser.mjs), and the trigger lives here.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HUNG ON `spendActionPoints`, which is the one place in the system
 * where an action point actually leaves a pool. Every action, spell,
 * reaction and manoeuvre goes through it. A watch written into the turn
 * tracker instead would see a round's total and never "each time".
 *
 * THE WATCH IS AN ACTIVE EFFECT FLAG, not a module variable, because it
 * has to survive a reload, a GM handing over, and the ten minutes
 * between two sessions. It rides the Injured effect the row applies —
 * or its own marker effect when the row applied nothing else — so
 * clearing the injury clears the watch, which is what a GM would expect
 * from removing a critical's effect.
 */
const SYSTEM_ID = "trg-prime";
export const AP_WATCH_FLAG = "criticalApWatch";
const WATCH_EFFECT_NAME = "Critical: Watching Exertion";

/**
 * Record the trigger on the target.
 *
 * @param {Actor} actor the target
 * @param {object} watch {threshold, dc, tags, rounds, source}
 */
export async function armApSpendWatch(actor, watch) {
  if (!actor?.createEmbeddedDocuments) return null;

  const payload = {
    threshold: Math.max(0, Math.trunc(Number(watch?.threshold) || 0)),
    dc: Math.max(1, Math.trunc(Number(watch?.dc) || 1)),
    tags: Array.isArray(watch?.tags) ? watch.tags : [],
    rounds: Math.max(1, Math.trunc(Number(watch?.rounds) || 1))
  };

  const existing = Array.from(actor.effects ?? []).find(
    (effect) => effect.getFlag?.(SYSTEM_ID, AP_WATCH_FLAG)
  );
  if (existing) {
    await existing.update({ [`flags.${SYSTEM_ID}.${AP_WATCH_FLAG}`]: payload });
    return existing;
  }

  const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: WATCH_EFFECT_NAME,
    img: "icons/svg/sound.svg",
    // NOT A STATUS. The target is not Unconscious, is not anything — the
    // row says so — and a status here would put a condition on the HUD
    // for a thing that has not happened.
    changes: [],
    flags: { [SYSTEM_ID]: { [AP_WATCH_FLAG]: payload } }
  }]);
  return created ?? null;
}

/** The watch currently on this actor, or null. */
export function apSpendWatchOn(actor) {
  for (const effect of Array.from(actor?.effects ?? [])) {
    const watch = effect.getFlag?.(SYSTEM_ID, AP_WATCH_FLAG);
    if (watch) return { effect, watch };
  }
  return null;
}

/**
 * Ask for the flat check if this expenditure crosses the threshold.
 *
 * @param {Actor} actor
 * @param {number} spent how many AP just left the pool
 * @returns {Promise<boolean>} true if the check was failed
 */
export async function checkApSpendWatch(actor, spent) {
  const found = apSpendWatchOn(actor);
  if (!found) return false;

  const amount = Math.max(0, Math.trunc(Number(spent) || 0));
  if (amount <= found.watch.threshold) return false;

  const { TRGCheck } = await import("../dice/check.mjs");
  const check = await TRGCheck.roll({
    actor,
    label: "Exertion — Flat Check",
    subtitle: `Sonic critical · spent ${amount} AP`,
    type: "flat",
    flat: true,
    dc: found.watch.dc
  });

  if (check?.outcome?.degree?.success) return false;

  const { applyConditionTags, formatAppliedTags } = await import("./effect-application-workflow.mjs");
  const round = Number(globalThis.game?.combat?.round ?? 0);
  const now = Number(globalThis.game?.time?.worldTime ?? 0);
  const tags = (found.watch.tags ?? []).map((tag) => ({
    ...tag,
    expiresRound: round + found.watch.rounds,
    // A MINUTE IS BOTH TEN ROUNDS AND SIXTY SECONDS, and whichever clock
    // is moving should end it — the same pair of stamps a spell's own
    // minute carries.
    expiresTime: now + found.watch.rounds * 6
  }));
  const applied = tags.length ? await applyConditionTags(actor, tags) : [];

  await globalThis.ChatMessage.create({
    speaker: globalThis.ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime"><p>The exertion tells. `
      + (applied.length ? `<strong>${formatAppliedTags(applied)}</strong>` : "The check is failed")
      + " — page 217.</p></div>"
  });
  return true;
}
