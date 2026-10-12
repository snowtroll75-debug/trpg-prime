/**
 * The skill-point budget (Chapter 3: "N + Int skill points per level").
 *
 * Until 3.214.0 the sheet showed the per-level rate and nothing else: no
 * total, no tally of what had been spent, and no limit. A character
 * could put ranks in every skill on the sheet and nothing said a word.
 * Reported by Graham.
 *
 * Pure, so the harness can run every combination without an actor —
 * which is the standing rule here for anything a regex over a call site
 * would otherwise be asked to prove.
 *
 * TWO THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * It does not track what your rate was at each PAST level. Intelligence
 * changes as a character advances, and nothing on the sheet records what
 * it was at 4th — so the budget is your CURRENT rate across every level
 * you have. That is the number a player can check against the book, and
 * the tooltip says so plainly rather than implying a history the system
 * does not keep.
 *
 * It does not touch specialist skills. They carry no ranks — they are
 * flat bonuses with a label — so there is nothing for them to spend.
 */

/**
 * @param {object} options
 * @param {number} options.perLevel Points per level, already resolved
 *   (class figure + Intelligence + any racial bonus).
 * @param {number} options.level
 * @param {object} options.skills The actor's core skills.
 * @param {number} options.bonus A flat, one-time addition to the budget —
 *   currently only Endeavour's Skill Point purchase (module/endeavour.mjs).
 *   Unlike `perLevel`, this is NOT multiplied by level: it is a fixed
 *   number of extra points bought once, the same shape featBudget's
 *   `classBonusFeats` already uses for feats.
 * @returns {{available: number, spent: number, remaining: number, overspent: boolean}}
 */
export function skillPointBudget({
  perLevel = 0, level = 0, skills = {}, storedSkills = null, bonus = 0
} = {}) {
  const rate = Math.max(0, Math.floor(Number(perLevel) || 0));
  const levels = Math.max(0, Math.floor(Number(level) || 0));
  const available = rate * levels + Math.max(0, Math.floor(Number(bonus) || 0));
  const levelCap = Math.max(1, levels);
  let spent = 0;
  for (const skill of Object.values(skills ?? {})) {
    spent += Math.max(0, Math.floor(Number(skill?.ranks) || 0));
  }

  // Skills carrying more ranks than the character has levels.
  //
  // Read from the STORED skills, not the prepared ones. prepareSkills
  // clamps every rank to the character's level before this runs, so a
  // prepared read can never see an excess — it has already been tidied
  // away, and the sheet would have reported all clear while the stored
  // value stayed wrong and came back the moment the clamp changed.
  // Reading _source is the standing rule here for exactly this.
  //
  // The write path blocks new ones; this is for a character who arrives
  // already over, because their level was lowered or their sheet
  // predates the cap.
  const overLevel = [];
  for (const [key, skill] of Object.entries(storedSkills ?? {})) {
    const ranks = Math.max(0, Math.floor(Number(skill?.ranks) || 0));
    if (ranks > levelCap) {
      overLevel.push({
        key, label: skills?.[key]?.label ?? skill?.label ?? key, ranks, cap: levelCap
      });
    }
  }
  return {
    available,
    spent,
    remaining: available - spent,
    // A character built before the budget existed, or one whose
    // Intelligence has since dropped, can legitimately be over. Reported
    // rather than corrected — silently deleting somebody's ranks would
    // be far worse than showing them a red number.
    overspent: spent > available,
    // How far over, so the sheet can say it without doing arithmetic in
    // a template (where a negative "remaining" would read as nonsense).
    over: Math.max(0, spent - available),
    // ...and which skills exceed the LEVEL cap, which is a different
    // problem from being over on points and is fixed differently.
    overLevel,
    hasOverLevel: overLevel.length > 0,
    // Pre-worded, because the template has no pluralisation helper and
    // adding one for a single sentence is worse than saying it here.
    overLabel: `${Math.max(0, spent - available)} rank${spent - available === 1 ? "" : "s"}`
  };
}

/**
 * The most ranks this skill may be raised to, given what is left.
 *
 * Two separate caps, and the tighter wins: no skill may exceed your
 * LEVEL in ranks (Chapter 3), and no purchase may spend points you do
 * not have.
 *
 * @param {object} options
 * @param {number} options.current The skill's ranks before this change.
 * @param {number} options.wanted The value being written.
 * @param {number} options.remaining Points left before this change.
 * @param {number} options.level
 */
export function affordableRanks({ current = 0, wanted = 0, remaining = 0, level = 0 } = {}) {
  const now = Math.max(0, Math.floor(Number(current) || 0));
  const want = Math.max(0, Math.floor(Number(wanted) || 0));
  const levelCap = Math.max(1, Math.floor(Number(level) || 0));
  // LOWERING is always allowed — it hands points back, so an overspent
  // character can always dig themselves out.
  //
  // That falls out of the formula rather than needing a branch: the
  // affordable ceiling is `now + whatever is left`, which is never below
  // `now`, so a want at or below `now` is never the binding term. An
  // early return for it was here first and was exhaustively equivalent
  // over every plausible input — dead code that read like a rule. The
  // rule is stated here instead.
  const affordable = now + Math.max(0, Math.floor(Number(remaining) || 0));
  return Math.min(want, levelCap, affordable);
}
