/**
 * NO CREATURE TARGETS FOR THE LENGTH OF A CAST (3.685.1, review of the
 * object-target seam). A spell marked `flags.trg-prime.targetsObject` aims at
 * an arrow, an aura or a square. Skipping the picker was not enough: the
 * user's targets, stale from an earlier attack, still reached the cast's row
 * fallback, Bardic Conviction's, the side gate, the "failure is final" stamp,
 * the metamagic and `trgPrimeSpellCast` targets and the cast reactions. So for
 * such a cast the user's targets are released, and put back when it ends, as
 * `castAsReaction` sets and restores them for a reaction's cast.
 */

/**
 * Run `run` with the user's targets released, then target the same tokens
 * again (also when `run` throws). Resolves what `run` resolves.
 *
 * RESTORED BY ID, from the canvas as it is when the cast ends (re-review), as
 * `castAsReaction` does: a token destroyed, deleted or left behind on another
 * scene during the cast is not found, and is skipped.
 *
 * @param {() => Promise<any>} run
 * @param {object} [user] the user whose targets these are
 * @param {object} [tokens] the canvas's token layer (`canvas.tokens`)
 */
export async function withTargetsReleased(run, user = globalThis.game?.user, tokens = globalThis.canvas?.tokens) {
  const set = (token, on) => { try { token?.setTarget?.(on, { user, releaseOthers: false, groupSelection: true }); } catch (err) { console.warn("TRG Prime | a target could not be set", err); } };
  const held = Array.from(user?.targets ?? []);
  const ids = held.map((t) => t?.id).filter(Boolean);
  for (const token of held) set(token, false);
  try {
    return await run();
  } finally {
    const now = new Set(Array.from(user?.targets ?? []).map((t) => t?.id));
    for (const id of ids) {
      if (now.has(id)) continue;
      const token = tokens?.get?.(id) ?? null;
      if (!token || token.destroyed) continue;
      set(token, true);
    }
  }
}
