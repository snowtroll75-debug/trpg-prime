/**
 * Spell components (Chapter 9, phase 4).
 *
 * A pre-cast gate — checked before any PP or AP is spent, exactly like the
 * trait and Rage gates — that blocks a cast the caster physically can't perform:
 *
 *  - SOMATIC: needs a genuinely free hand. A caster holding a two-handed weapon
 *    (both hands occupied) can't make the gestures. Suppressible: a feat or
 *    ability that lets you cast without somatic components sets the actor flag
 *    `flags.trg-prime.freeSomatic` (e.g. via an Active-Effect change on that
 *    key), which lifts the requirement.
 *  - MATERIAL: needs an equipped Material Component Pouch with uses left (the
 *    pouch is consumed on a successful cast in cast-workflow.mjs; this makes the
 *    "no pouch" case an upfront block rather than a silent no-op). Spells with
 *    their own costly `Cost` materials are a separate concern, handled by hand.
 *  - VERBAL: not gated (nothing to physically hold or free); a silence/gag
 *    ruling is left to the GM.
 *
 * Returns false (and warns) to abort the cast, true to proceed — the same shape
 * as traitGate, so the caller reads `if (!componentGate(...)) return null;`.
 */

import { hasFreeHandAvailable } from "../held-items.mjs";
import { findEquippedGearByTrait } from "../gear-uses.mjs";
import { inFormNow, naturalCastingWaives } from "./wildshape-feats.mjs";
import {
  isRunemage, symbolComponents, needsFreeHandFor, focusSatisfiesHand
} from "./runemage.mjs";

const POUCH_TRAIT = /\bmaterial component pouch\b/i;

/**
 * Whether a feat/ability lets this actor cast somatic spells without a free
 * hand. The hook is the `trg-prime.freeSomatic` actor flag so future feat
 * content can grant it without touching this gate.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function hasSomaticOverride(actor) {
  return Boolean(actor?.getFlag?.("trg-prime", "freeSomatic"));
}

/**
 * Whether the actor has a usable Material Component Pouch equipped. A pouch with
 * no use-tracking (max 0) counts as always-available; one that tracks uses must
 * have at least one left.
 * @param {Actor} actor
 * @returns {boolean}
 */
export function hasComponentPouch(actor) {
  const pouch = findEquippedGearByTrait(Array.from(actor?.items ?? []), POUCH_TRAIT);
  if (!pouch) return false;
  const max = Number(pouch.system?.uses?.max ?? 0);
  const value = Number(pouch.system?.uses?.value ?? 0);
  return max <= 0 || value > 0;
}

/**
 * The component gate. See the module comment for the rules it enforces.
 *
 * `materialProvided` is the SCROLL CLAUSE (Graham's ruling, 17 Aug 2026):
 * "Casting a spell from a scroll should be a normal cast not innate.
 * Material components are satisfied by the scroll itself but all other
 * components must still be met." Chapter 11 says the same thing from the
 * other side — "you… do not need to provide any material components as
 * they will have been provided when the scroll was created."
 *
 * ONE COMPONENT, NOT THE WHOLE GATE. Until 3.325.0 a scroll rode the
 * `innate` flag, which skipped this function entirely — so a scroll also
 * waived the SOMATIC requirement, and could be read with both hands full.
 * That was never a printed rule; it was a side effect of the flag that
 * carries several other exemptions a scroll genuinely does need.
 *
 * @param {Actor} actor
 * @param {object} spellData  the spell's `system`
 * @param {string} [spellName]
 * @param {object} [options]
 * @param {boolean} [options.materialProvided] The material component was
 *   supplied when the item was made, so only that one is waived.
 * @returns {boolean} false (and warns) to abort; true to proceed
 */
export function componentGate(actor, spellData, spellName = "This spell", { materialProvided = false } = {}) {
  let components = spellData?.components ?? {};

  // Component Savant (Chapter 5 metamagic): a queued one-cast swap replaces
  // one component type with another before the gate judges the cast. The
  // flag is consumed by cast-workflow after a completed cast.
  const swap = actor?.getFlag?.("trg-prime", "componentSwapNext");
  if (swap?.from && swap?.to && components[swap.from]) {
    components = { ...components, [swap.from]: false, [swap.to]: true };
  }

  /*
   * RUNEMAGE (Chapter 5): "you replace all non-somatic components with a
   * new component called Symbol." Applied AFTER the Component Savant swap
   * for the same reason the swap is applied before the gate — the swap
   * changes which components the spell has, and Symbol replaces whatever
   * it has by then.
   *
   * ONLY THE ARITHMETIC OF THIS FEAT WAS BUILT until 3.546.0. Measured
   * before the repair: this gate answered identically for a Runemage and
   * for a caster with no feats, so a Runemage still needed a Material
   * Component Pouch — for the 118 material spells in the pack, and the
   * feat's headline clause did nothing at all.
   */
  const allFeatNames = Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat" || i.type === "ability").map((i) => i.name);
  const runemage = isRunemage(allFeatNames);
  components = symbolComponents(components, runemage);

  const size = actor?.system?.identity?.size ?? "medium";

  // A held Casting Focus (Chapter 9) can stand in for a somatic component.
  const focusHand = Boolean(actor?.system?.magic?.focusCasting && actor?.system?.magic?.focusReady);
  // AND SO CAN A HELD ROD, STAFF OR WAND (3.615.0, Graham's R17 of block 36):
  // each "may be used as a somatic component for spell casting". Until then
  // a staff in one hand and a shield in the other refused every somatic
  // spell, the staff counting only as an occupied hand.
  const implementHand = Array.from(actor?.items ?? []).some((i) => i.system?.equipped
    && ["rod", "staff", "wand"].includes(String(i.flags?.["trg-prime"]?.chargedItem?.kind ?? "").toLowerCase()));

  // Natural Casting (Chapter 5, Druid): "You can complete the verbal and
  // somatic components of spells even when in a different form… you have
  // mastered the art of utilizing material components and focuses even
  // when they are seamlessly integrated into your transformed form."
  //
  // ONLY WHILE IN A FORM. Out of one, a Druid with this feat needs a free
  // hand and a pouch like everybody else: the feat is about what a paw
  // cannot do, not a standing exemption. "In a form" is answered in one
  // place — see `inFormNow` in wildshape-feats.mjs.
  const naturalCasting = naturalCastingWaives({
    featNames: Array.from(actor?.items ?? [])
      .filter((i) => i.type === "feat").map((i) => i.name),
    inForm: inFormNow({
      effects: Array.from(actor?.effects ?? []),
      items: Array.from(actor?.items ?? [])
    })
  });

  /*
   * THE HAND. Symbol needs one on EVERY spell, not only the ones that
   * were somatic — Graham's ruling, 10 Sep 2026, on "you must have room
   * to draw the rune". A Runemage with both hands full casts nothing.
   *
   * AND THE FOCUS DOES NOT HELP THERE. A held Casting Focus stands in for
   * somatic gestures (Chapter 9) and not for drawing a rune, which makes
   * Symbol stricter than the component it replaces — chosen deliberately
   * over the reading where the focus covers both.
   */
  if (
    needsFreeHandFor(components) &&
    !hasSomaticOverride(actor) &&
    !naturalCasting.somatic &&
    !(focusHand && focusSatisfiesHand(components)) &&
    !(implementHand && focusSatisfiesHand(components)) &&
    !hasFreeHandAvailable(Array.from(actor?.items ?? []), size)
  ) {
    ui.notifications.warn(
      components.symbol
        ? `${spellName} is cast with a Symbol component and needs a free hand to draw the rune, but both of your hands are occupied.`
        : `${spellName} has a somatic component and needs a free hand, but both of your hands are occupied.`
    );
    return false;
  }

  // The material clause is checked LAST and waived independently, so that a
  // scroll of a somatic-and-material spell still fails on the hand it needs.
  // Waiving the material component must not become waiving the gate.
  if (components.material && !materialProvided && !naturalCasting.material && !hasComponentPouch(actor)) {
    ui.notifications.warn(
      `${spellName} has a material component, but you have no Material Component Pouch equipped (or it's empty).`
    );
    return false;
  }

  return true;
}
