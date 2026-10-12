/**
 * Conditions that end WITHOUT a clock on the effect that applied them.
 *
 * MOVED HERE AT 3.590.0, from verify-condition-clocks.mjs, unchanged.
 *
 * WHY IT MOVED. The block-28 harness asked the same question of its own
 * nineteen spells and answered it a SECOND time, worse: it had no idea
 * that stunned ends itself, so it reported Jolts and Holy Shout as
 * applying a condition that never comes off. Two places deciding one
 * question, with the better answer in the older one — this project's
 * named anti-pattern, and the reason a pack-wide census and a per-block
 * census must read the same map.
 *
 * Each entry NAMES THE RULE THAT ENDS IT, which is what stops the list
 * growing into a convenient exemption pile: an addition has to be able
 * to finish the sentence. `verify-condition-clocks` A3 pins the size and
 * A4 pins that every entry gives a reason.
 */
export const SELF_ENDING = new Map([
  ["stunned", "spent as AP and reduced at the start of its owner's turn (TRGCombat._onStartTurn)"],
  ["frightened", "shed by the Recover action (frightenedRecoveryDelta)"],
  ["sickened", "shed by Retch (sickenedRetchDelta)"],
  ["prone", "shed by standing up"],
  ["flatFooted", "shed at the start of its owner's turn"],
  ["bleeding", "its own flat check (TRGCombat._onEndTurn)"],
  ["recurring", "its own flat check (TRGCombat._onEndTurn)"],
  ["dying", "the death-state machinery"],
  ["doomed", "the death-state machinery and a full night's rest"],
  ["fatigued", "shed by resting"],
  ["fixated", "the spell's own re-save, printed on the entries that use it"],
  ["controlled", "the spell's own re-save, printed on the entries that use it"],
  ["soulDrain", "reduced by a full night's rest (soulDrainRecovery)"]
]);
