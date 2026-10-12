/**
 * Active Effect change types, as Foundry 14 actually spells them.
 *
 * WHAT WAS THERE BEFORE, AND WHY IT WAS SILENT
 *
 * Twenty call sites across ten modules wrote
 * `CONST.ACTIVE_EFFECT_CHANGE_TYPES.CUSTOM`. That enum exists on Foundry
 * 14.363 — but its keys are LOWERCASE (`{custom: 0, add: 20, …}`), so
 * `.CUSTOM` is `undefined`, and a change created with `type: undefined`
 * falls back to Foundry's default: **add**.
 *
 * Nothing threw. Nothing warned. The nine CUSTOM sites had been quietly
 * writing ADD-mode changes since the Foundry 14 port, and it cost two
 * different things:
 *
 *   1. POOL-ONLY TARGETS APPLIED NOTHING AT ALL. `system.combat.dr` and
 *      the two natural-armour targets have no sheet slots by design
 *      (TARGET_SLOTS.dr is `{}`) — they are read from the typed bonus
 *      pool, and only a CUSTOM-mode change ever reaches that pool (see
 *      documents/active-effect.mjs, which returns early unless
 *      `change.type === "custom"`). An ADD-mode change wrote the raw
 *      field `system.combat.dr.status` instead, which nothing reads.
 *      Found live on 12 Aug 2026: Shape Of The Animal's Brawn form
 *      printed "+2 status bonus Damage Reduction" on its card while the
 *      character's DR stayed 0.
 *
 *   2. APPENDIX 1 STACKING WAS BYPASSED EVERYWHERE ELSE. A slotted
 *      target — an attribute, a save — *looked* fine, because the ADD
 *      landed on a real slot the resolver reads. But two status bonuses
 *      to the same attribute then incremented the same field and came
 *      out as +4, where routing them through the pool suppresses the
 *      second and correctly gives +2. Measured both ways in the live
 *      world, same actor, same pair of effects.
 *
 * The second is the worse one: a wrong number that looks right.
 *
 * WHY A LOCAL TABLE RATHER THAN THE CONST
 *
 * Because this system already learned this lesson twice and did not
 * spread the answer. `effect-slots.mjs` and `sheets/actor-sheet.mjs`
 * both carry a comment saying Foundry 14 deprecated reaching into that
 * enum at all, and both use a plain literal instead — while twenty
 * writing call sites went on reading a property that was never there.
 * One table, imported, is the version of that fix which cannot be
 * half-applied.
 *
 * These are the STRING types Foundry 14 stores on a change. The numbers
 * beside the lowercase keys in the CONST are legacy mode values and are
 * NOT what `type` wants; effect-slots.mjs maps back to those separately
 * for its own still-numeric contract.
 */

export const CHANGE_TYPE = Object.freeze({
  CUSTOM: "custom",
  ADD: "add",
  MULTIPLY: "multiply",
  DOWNGRADE: "downgrade",
  UPGRADE: "upgrade",
  OVERRIDE: "override"
});

/** Every value above, for a harness that wants to check the set. */
export const CHANGE_TYPE_VALUES = Object.freeze(Object.values(CHANGE_TYPE));
