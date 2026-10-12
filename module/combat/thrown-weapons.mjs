/**
 * Thrown weapons leave your hand (Chapter 6).
 *
 * THE DEFECT. In the 13 Aug 2026 combat playtest, Bugbear Soldier 1 threw its
 * Javelin fifteen times over ten rounds. Its Javelin quantity at the end was
 * 3 — the same number the compendium statblock ships. Nothing decremented,
 * nothing was removed, nothing landed anywhere. A thrown weapon was, in
 * effect, a melee weapon with a longer reach and infinite ammunition.
 *
 * The machinery to do this properly already existed one file over:
 * `ammunition-workflow.consumeAmmunition` spends a round per shot and reports
 * what is left, and Rog's crossbow correctly read "Fired Bolts (10) — 9 left"
 * on its first shot of the same fight. This file is the same shape for the
 * thrown case, deliberately — not a second, cleverer mechanism.
 *
 * WHERE IT GOES AFTERWARDS. Graham, 13 Aug 2026: "a thrown weapon should be
 * removed from the characters sheet. It would need to be retrieved however so
 * perhaps placing it on the party sheet would work." Asked which way NPCs
 * should go, he chose party sheet for PCs, nowhere for NPCs — so a Bugbear's
 * javelins do not accumulate on the players' party sheet, and the GM hands one
 * back if it matters.
 *
 * QUANTITY, THEN THE ITEM. A stack of three javelins throws one and becomes a
 * stack of two; the last one throws and the item goes. That is the same rule
 * ammunition follows, and it is why the return value distinguishes "spent" from
 * "removed" — the card wants to say which happened.
 *
 * THE ONE EXEMPTION: NATURAL ATTACKS. The Fire Giant's Rock is `attackMode:
 * "thrown"` and `natural: true`, quantity 1 — and after the fix above, the
 * giant threw its Rock once and the Rock left its sheet permanently. A giant
 * does not carry a finite inventory of boulders; the statblock's Rock is the
 * creature's capacity to pick something up and hurl it, in exactly the way its
 * Slam is its capacity to hit you, and the rest of the system already reads
 * `system.natural` that way (`held-items` charges it no hands because it is
 * part of the body, not something held).
 *
 * The exemption is deliberately about the WEAPON, not the attack: the Rock
 * stays `thrown`, so it keeps its range increment, its Range 120 trait, and
 * every ranged rule that follows from being thrown. The only thing being
 * suppressed is the spend. Reclassifying it as `missile` would have been the
 * cheaper edit and the wrong one — a missile weapon would then want ammunition
 * it does not have, and the throw would stop reading as a throw.
 */

import { fieldToRunes } from "../rune-catalogue.mjs";
import { runeUsageAllows, weaponUsage } from "../weapon-rune-usage.mjs";
import { recoveredAsAmmunition } from "./ammunition.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Does this weapon leave the hand when used at range?
 *
 * TWO WAYS TO BE THROWN, and both count. A javelin is `attackMode: "thrown"`
 * and is always hurled. A dagger is a melee weapon carrying the Thrown trait,
 * and only leaves the hand on the throws — the attack workflow already works
 * out which of those happened (`thrownByDistance`), so this asks about the
 * ATTACK rather than about the weapon alone.
 *
 * @param {object} weaponSystem
 * @param {boolean} thrownAttack Whether this particular attack was a throw.
 * @returns {boolean}
 */
export function leavesTheHand(weaponSystem, thrownAttack) {
  if (!thrownAttack) return false;
  const mode = String(weaponSystem?.attackMode ?? "").toLowerCase();
  if (mode === "thrown") return true;
  return /\bthrown\b/i.test(String(weaponSystem?.traits ?? ""));
}

/**
 * Is this weapon part of the creature rather than part of its kit?
 *
 * Asked of the WEAPON alone, not of the attack — a natural weapon is
 * inexhaustible whichever way it is used, so there is no throw that spends one
 * and no melee blow that spends one either.
 *
 * Truthiness rather than `=== true`: the compendium records exactly `true` and
 * the template defaults to `false`, but `held-items.mjs` and `documents/item.mjs`
 * both read this flag as truthy, and a homebrew weapon that those two files
 * treat as natural must not be one this file quietly deletes. Erring toward
 * "natural" only ever preserves an item.
 *
 * @param {object} weaponSystem
 * @returns {boolean}
 */
export function isNaturalWeapon(weaponSystem) {
  return Boolean(weaponSystem?.natural);
}

/**
 * What a throw leaves behind, given a starting quantity.
 *
 * Pure, so the "last one" boundary is checkable without a world. A quantity
 * that is absent or unparseable is treated as a single item — that is how the
 * compendium records a lone weapon, and treating it as zero would make the
 * first throw of a plain dagger a no-op.
 *
 * @param {number|undefined} quantity
 * @returns {{remaining: number, removeItem: boolean}}
 */
export function afterThrow(quantity) {
  const parsed = Number(quantity);
  // Normalised ONCE, here. `current` is guaranteed at least 1, so `current - 1`
  // is guaranteed at least 0 and needs no second clamp on the way out.
  //
  // It had one — `Math.max(0, remaining)` — and the two copies masked each
  // other: mutating this fallback from 1 to 0 produced remaining -1, which the
  // clamp quietly turned back into 0, so neither line could be broken into a
  // visible failure. The clamp was the duplicate, so the clamp went.
  const current = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 1;
  const remaining = current - 1;
  return { remaining, removeItem: remaining <= 0 };
}

/**
 * Where a thrown weapon goes once it has left the hand.
 *
 * @param {string} actorType Foundry actor type — "character", "npc", …
 * @returns {"party"|"nowhere"}
 */
export function thrownDestination(actorType) {
  // Graham, 13 Aug 2026: party sheet for PCs, nowhere for NPCs.
  return String(actorType ?? "").toLowerCase() === "character" ? "party" : "nowhere";
}

/** The party actor this world keeps, or null. */
function partyActor() {
  try {
    return Array.from(game.actors ?? []).find((a) => a.type === "party") ?? null;
  } catch {
    return null;
  }
}

/**
 * Spends one thrown weapon from the thrower's sheet and, for a PC, puts it on
 * the party sheet to be retrieved.
 *
 * Mirrors `consumeAmmunition`: called AFTER the roll, so an attack abandoned at
 * one of the prompts costs no javelins.
 *
 * A natural weapon is exempt entirely — see the header. The guard sits HERE,
 * at the one place that writes, rather than inside `leavesTheHand`: a hurled
 * Rock genuinely does leave the giant's hand, and saying otherwise would be a
 * lie told to every future caller of that predicate. What is untrue is that
 * the giant then has one fewer Rock.
 *
 * @param {Actor} actor
 * @param {Item} weapon
 * @param {boolean} thrownAttack Whether this attack was actually a throw.
 * @returns {Promise<{thrown: boolean, remaining: number, removed: boolean,
 *   recovered: "party"|"nowhere"|"battlefield"|null}>}
 */
/**
 * Does this weapon carry a Returning rune that is in force — equipped, and on
 * a thrown weapon, which is the rune's usage (B10)?
 */
export function returnsToHand(weapon) {
  if (!weapon?.system?.equipped) return false;
  const carries = fieldToRunes("weapon", weapon.system.runes ?? "").some((rune) => rune.key === "returning");
  return carries && runeUsageAllows("returning", weaponUsage(weapon.system)).ok;
}

export async function consumeThrownWeapon(actor, weapon, thrownAttack) {
  const idle = { thrown: false, remaining: 0, removed: false, recovered: null };
  if (!weapon?.system) return idle;
  // Before anything is read, written, dropped or deleted. The early return
  // also keeps the chat card silent rather than printing "Threw Rock — 0 left"
  // over and over for a boulder the giant never ran out of.
  if (isNaturalWeapon(weapon.system)) return idle;
  if (!leavesTheHand(weapon.system, thrownAttack)) return idle;
  /*
   * RETURNING (3.618.0, A7 of block 37): "When you make a thrown Strike with
   * this weapon, it flies back to your hand after the Strike is complete." It
   * used to be spent like any javelin while the card said it came back. A
   * weapon whose rune is in force keeps its count; "if your hands are full …
   * it falls to the ground in your space" is the table's to say.
   */
  if (returnsToHand(weapon)) {
    return { thrown: true, returned: true, remaining: Number(weapon.system.quantity ?? 1) || 1, removed: false, recovered: null };
  }

  const { remaining, removeItem } = afterThrow(weapon.system.quantity);
  // SHURIKEN ARE AMMUNITION AFTER THE THROW (3.576.0). "Treated as
  // ammunition for the purposes of ... what happens to them after they are
  // thrown" — so not onto the party sheet like a javelin: counted instead,
  // and half of them offered back when the battle ends (Graham's R3).
  const asAmmunition = recoveredAsAmmunition(weapon.system);
  const destination = asAmmunition ? "battlefield" : thrownDestination(actor?.type);
  if (asAmmunition) {
    const { recordAmmunitionSpent } = await import("./ammunition-workflow.mjs");
    await recordAmmunitionSpent(actor, weapon, { source: removeItem ? weapon.toObject() : null });
  }

  // The copy that lands on the ground is taken from the item as it is NOW,
  // before the stack is decremented — quantity 1, because one was thrown, not
  // however many are left behind in the thrower's hand.
  if (destination === "party") {
    const party = partyActor();
    if (party) {
      try {
        const dropped = weapon.toObject();
        dropped.system = { ...dropped.system, quantity: 1, equipped: false };
        delete dropped._id;
        const existing = Array.from(party.items ?? []).find(
          (i) => i.type === "weapon" && i.name === weapon.name
        );
        if (existing) {
          // Stack with the ones already recovered, rather than growing a
          // column of identical single javelins down the party sheet.
          const held = Number(existing.system?.quantity);
          await existing.update({
            "system.quantity": (Number.isFinite(held) && held > 0 ? Math.floor(held) : 1) + 1
          });
        } else {
          await party.createEmbeddedDocuments("Item", [dropped]);
        }
      } catch (_e) {
        // A party sheet that cannot be written to must not swallow the throw
        // itself — the weapon still leaves the thrower's hand below.
      }
    }
  }

  if (removeItem) await weapon.delete();
  else await weapon.update({ "system.quantity": remaining });

  return { thrown: true, remaining, removed: removeItem, recovered: destination };
}

export { SYSTEM_ID as THROWN_SYSTEM_ID };
