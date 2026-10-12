import { hasHandAndAHalfTrait, itemRequiredHands, handsOccupied } from "./held-items.mjs";

const DialogV2 = foundry.applications.api.DialogV2;

/** Whether a weapon carries the Hand & a Half trait. */
export function isHandAndAHalf(traits) {
  return hasHandAndAHalfTrait({ system: { traits } });
}

/**
 * Ask, when equipping a Hand & a Half weapon, whether it is being wielded
 * two-handed. The grip is stored on the weapon (`system.twoHandedGrip`) and the
 * attack workflow reads it silently — so grip is a deliberate equip-time choice
 * rather than a prompt on every swing. Returns the chosen grip, or null if the
 * caster cancels (equip should then be aborted).
 *
 * @param {string} weaponName
 * @param {boolean} current  the weapon's current stored grip (pre-checks the box)
 * @returns {Promise<boolean|null>}
 */
export async function promptTwoHandedGrip(weaponName, current = false) {
  const result = await DialogV2.wait({
    window: { title: `${weaponName} — Grip`, icon: "fa-solid fa-hand-fist" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `
      <div class="trg-prime trg-check-dialog">
        <div class="form-group">
          <label><input type="checkbox" name="twoHanded"${current ? " checked" : ""}> Wield two-handed</label>
          <p class="hint">Hand &amp; a Half (Chapter 6): held two-handed, it takes both hands and multiplies your melee Strength damage bonus by 1.5. Leave unchecked to keep a hand free. You can change grip by re-equipping.</p>
        </div>
      </div>`,
    buttons: [
      {
        action: "confirm",
        label: "Equip",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return Boolean(result.twoHanded);
}

/**
 * Whether equipping this item is actually allowed right now, given
 * the actor's two-hand limit. Unequipping is never checked here —
 * it always frees hands, never needs a budget check.
 *
 * @param {Actor} actor
 * @param {Item} item The item about to be equipped.
 * @returns {{allowed: boolean, reason: string|null}}
 */
export function canEquip(actor, item) {
  const actorSize = actor.system?.identity?.size ?? "medium";
  const thisItemHands = itemRequiredHands(item, actorSize);

  if (thisItemHands === null) {
    return {
      allowed: false,
      reason: `${item.name} is too large for a creature of your size to wield at all.`
    };
  }
  if (!thisItemHands) return { allowed: true, reason: null };

  // THROUGH `handsOccupied`, not a plain sum (3.575.0), so a light
  // shield's hand can take a torch — the same answer "is a hand free"
  // gets everywhere else.
  const others = Array.from(actor.items ?? [])
    .filter((other) => other.id !== item.id && other.system?.equipped);
  const before = handsOccupied(others, actorSize);
  const after = handsOccupied([...others, item], actorSize);
  if (after > 2) {
    return {
      allowed: false,
      reason: `${item.name} needs ${thisItemHands} hand${thisItemHands === 1 ? "" : "s"}, but you only have ${Math.max(0, 2 - before)} free — a standard character can only hold two hands' worth of items at once.`
    };
  }
  return { allowed: true, reason: null };
}
