/**
 * Encumbrance — the Foundry side.
 *
 * "If your speed is reduced to 0, you gain the Immobilised condition
 * until you shed some weight." Derived data works out *whether* that has
 * happened (combat.movement.immobilisedByLoad); applying and removing the
 * condition happens here, because mutating documents from inside
 * data preparation isn't done anywhere in this project and would recurse.
 *
 * The condition is tagged with a flag recording that encumbrance applied
 * it, so shedding weight removes only what the load imposed — an
 * Immobilised applied by a spell, a critical injury or the GM is left
 * exactly where it is.
 */

import { isActingGM } from "./acting-gm.mjs";
import { CONDITIONS } from "./conditions/registry.mjs";

const SYSTEM_ID = "trg-prime";
const LOAD_FLAG = "immobilisedByLoad";
/**
 * The flag marking an Encumbered that carried weight applied (3.573.0).
 *
 * SEPARATE FROM THE IMMOBILISED FLAG, so the two conditions are cleared
 * independently — a character who sheds enough to move again but is
 * still over their allowance keeps Encumbered and loses Immobilised.
 */
const ENCUMBERED_FLAG = "encumberedByLoad";

/**
 * Every condition on this actor that encumbrance applied under `flag`.
 *
 * ALL of them, not the first. Duplicates should not exist, and the
 * write below is now atomic so new ones will not appear — but a world
 * that already stacked eighteen of them (found live, 3.215.0) needs
 * them all cleared the moment the load drops, not one per item change.
 *
 * Read from `_source`, so an effect created microseconds ago by a
 * sibling call is visible. `actor.effects` is prepared data, and during
 * a burst of item writes it can still be showing the state from before
 * the last create — which is exactly how the duplicates got there.
 */
function appliedByLoad(actor, flag = LOAD_FLAG) {
  const stored = actor?._source?.effects ?? [];
  const ids = stored
    .filter((effect) => effect?.flags?.[SYSTEM_ID]?.[flag])
    .map((effect) => effect._id);
  return ids;
}

/**
 * Brings ONE load-driven condition into line with the actor's load.
 *
 * The shape below was worked out for Immobilised over several releases —
 * the atomic create with its flag already on it, the `_source` read, the
 * refusal to stack on a condition something else applied, the sweep of
 * pre-existing duplicates. Encumbered needs every one of those
 * properties, so it shares the function rather than owning a second copy
 * that would have to relearn them.
 */
async function syncLoadCondition(actor, { conditionId, flag, on, notice = "" }) {
  const existing = appliedByLoad(actor, flag);

  if (on) {
    if (existing.length > 1) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", existing.slice(1));
      return "unchanged";
    }
    if (existing.length === 1) return "unchanged";
    // Never stack on top of one something else applied.
    if (actor.hasCondition?.(conditionId)) return "unchanged";
    // THE REGISTRY IS THE FALLBACK, NOT THE RAW ID (3.574.1). Encumbered is
    // deliberately kept off the token HUD, so it is not in
    // `CONFIG.statusEffects` — and this used to fall straight through to
    // `{ name: conditionId }`, putting an effect called "encumbered" with
    // Foundry's default aura icon on every overloaded character. Found in
    // live testing of 3.574.0. The condition registry holds the label and
    // icon for every condition, HUD or not.
    const status = CONFIG.statusEffects?.find((entry) => entry.id === conditionId);
    const registered = CONDITIONS[conditionId];
    const name = status?.name
      ? game.i18n.localize(status.name)
      : (registered?.label ?? conditionId);
    const img = status?.img ?? registered?.icon;
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      ...(status ? foundry.utils.duplicate(status) : {}),
      name,
      ...(img ? { img } : {}),
      statuses: [conditionId],
      flags: { [SYSTEM_ID]: { [flag]: true } }
    }]);
    if (notice) ui.notifications?.info(notice);
    return "applied";
  }

  if (existing.length) {
    // EVERY one of them. Deleting the first and leaving the rest is
    // how a character stays conditioned after dropping the load.
    await actor.deleteEmbeddedDocuments("ActiveEffect", existing);
    return "removed";
  }

  return "unchanged";
}

/**
 * Brings the Immobilised condition into line with the actor's load.
 *
 * @param {Actor} actor
 * @returns {Promise<"applied"|"removed"|"unchanged">}
 */
/**
 * Actors with a sync already in flight.
 *
 * Adding nineteen items in one call fires the item hook nineteen times,
 * and each call used to reach the "not applied yet" test before any of
 * the others had finished writing — so all nineteen applied. Found live
 * in 3.215.0 on a character carrying a test kit: eighteen stacked
 * Immobilised effects, none of which cleared when the load came off,
 * because the removal arm deleted one per call and nothing called it
 * again once the character was under the limit.
 */
const inFlight = new Set();

export async function syncEncumbranceImmobilised(actor, { quiet = false } = {}) {
  if (!actor?.system?.combat?.movement) return "unchanged";
  // Only the GM writes, so five connected clients don't race to apply the
  // same condition — the same gate the migration and turn automation use.
  if (!game.user?.isGM) return "unchanged";
  if (!isActingGM()) return "unchanged";
  if (inFlight.has(actor.id)) return "unchanged";

  inFlight.add(actor.id);
  try {
    // ENCUMBERED FIRST, and on ANY excess (3.573.0). "If you exceed your
    // weight allowance you gain the encumbered condition" — page 146, with
    // no 20 lb threshold, which is why this asks `_trgEncumbered` rather
    // than the step count. Graham ruled on 18 September 2026 that it
    // applies straight away. Until then the condition was registered and
    // applied to nobody, and Nimble Dodge's printed requirement ("you are
    // not encumbered") was gated on the step count instead — so a
    // character nineteen pounds overloaded could still use it.
    const encumbered = Boolean(actor._trgEncumbered);
    const encumberedResult = await syncLoadCondition(actor, {
      conditionId: "encumbered",
      flag: ENCUMBERED_FLAG,
      on: encumbered,
      notice: encumbered && !quiet
        ? `${actor.name} is over their Weight Allowance — Encumbered.`
        : ""
    });

    const immobilisedResult = await syncLoadCondition(actor, {
      conditionId: "immobilised",
      flag: LOAD_FLAG,
      on: Boolean(actor.system.combat.movement.immobilisedByLoad),
      notice: quiet ? "" : `${actor.name} is carrying too much to move — Immobilised until the load is reduced.`
    });

    // The Immobilised answer is returned unchanged, because that is what
    // every existing caller and check reads. The Encumbered arm reports
    // only when Immobilised had nothing to say, so a caller watching for
    // "applied" still sees the load doing something.
    return immobilisedResult !== "unchanged" ? immobilisedResult : encumberedResult;
  } finally {
    inFlight.delete(actor.id);
  }
}

/**
 * Registers the hooks that keep the condition current.
 *
 * Watched on the actor itself and on its items, since what a character
 * carries changes with every pickup, drop and equip.
 */
export function registerEncumbranceHooks() {
  const sync = (actor) => {
    if (actor) void syncEncumbranceImmobilised(actor);
  };

  Hooks.on("updateActor", (actor) => sync(actor));
  // A CHARACTER CREATED ALREADY OVERLOADED (3.574.1). The hooks above
  // fire on a CHANGE, so an actor that arrives over its allowance — an
  // import, a duplicate, a compendium drag — carried the load and none of
  // the condition until something moved. Found in live testing of
  // 3.574.0: a copy of the test kit, 1 lb over, with no Encumbered.
  Hooks.on("createActor", (actor) => sync(actor));
  // AND EVERY CHARACTER ALREADY IN THE WORLD, once, when the world opens.
  // Installing 3.573.0 left every overloaded character in every world
  // exactly as it was, Encumbered by the rules and not on the sheet, until
  // the player next picked something up. QUIET, because a world with a
  // dozen overloaded NPCs should not greet its GM with a dozen banners.
  Hooks.once("ready", () => {
    for (const actor of game.actors ?? []) {
      void syncEncumbranceImmobilised(actor, { quiet: true });
    }
  });
  Hooks.on("createItem", (item) => sync(item.parent));
  Hooks.on("updateItem", (item) => sync(item.parent));
  Hooks.on("deleteItem", (item) => sync(item.parent));
}
