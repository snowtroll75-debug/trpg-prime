/**
 * Strike (Chapter 4). Graham directly: the Strike basic action was
 * spending its own AP cost, then telling the player to separately
 * click the weapon row's own Attack button — which spends AP again.
 * Fixed by having Strike itself never spend AP at all; it finds the
 * actor's actual usable attack(s) (equipped weapons and natural
 * attacks alike) and hands off directly to rollWeaponAttack, which
 * already spends the single, correct AP cost on its own.
 *
 * Ties into the Attacks/Weapons table rename and natural attacks
 * (Chapter 6, Unarmed Attacks): a PC with nothing equipped falls
 * back to Unarmed Strike specifically — "most humanoids will only
 * have access to the Unarmed Strike attack" — created and equipped
 * on demand (lazily, the first time it's actually needed) rather
 * than seeded on every new actor, so there's no creation-hook
 * complexity and no risk of a stray duplicate on an existing actor
 * that already has one some other way (a feat grant, for instance).
 */

const UNARMED_STRIKE_DATA = Object.freeze({
  name: "Unarmed Strike",
  type: "weapon",
  img: "icons/skills/melee/unarmed-punch-fist.webp",
  system: {
    equipped: true,
    invested: false,
    hp: { value: 0, max: 0 },
    traits: "Agile, Finesse",
    description:
      "A natural attack (Chapter 6, Unarmed Attacks table). Available to any character or creature.",
    attackBonus: 0,
    damage: "1d4",
    damageType: "subdual",
    baseDamage: 0,
    // `hands: 0` stood here to fill the schema's shape. The field left
    // the weapon schema at 3.369.0 because no rule ever read it — an
    // Unarmed Strike costs no hands because `itemRequiredHands` sees
    // `system.natural`, which is a fact about the attack rather than a
    // number somebody typed.
    range: "",
    armourRending: 0,
    proficiency: "",
    fumbleDC: 5,
    attackMode: "melee",
    rangeIncrement: 0,
    group: "Brawling",
    // "All characters are proficient with unarmed (natural) attacks."
    // Without the category this stub would be the ONE unarmed attack in
    // the game that nobody is proficient with, because the proficiency
    // engine reads the category and the stub is not in the pack.
    category: "Unarmed",
    size: "medium",
    itemLevel: 0,
    quality: "standard",
    material: "",
    superiorTraits: "",
    loaded: true,
    reloadProgress: 0,
    usedQuickLoadThisRound: false,
    spinBonus: 0,
    attackedThisTurn: false,
    natural: true
  }
});

/**
 * The actor's equipped weapon-type items — manufactured weapons and
 * natural attacks alike, since both live in the same Attacks/Weapons
 * table and both attack the same way.
 *
 * @param {Array} items
 * @returns {Array}
 */
export function usableAttacks(items) {
  return items.filter((item) => item.type === "weapon" && item.system?.equipped);
}

/**
 * Finds the actor's existing Unarmed Strike item, if any — checked
 * by name and the natural flag together, rather than only one or the
 * other, so a renamed copy or an unrelated item sharing the name
 * doesn't get mistaken for it.
 *
 * @param {Array} items
 * @returns {object|null}
 */
export function existingUnarmedStrike(items) {
  return (
    items.find(
      (item) =>
        item.type === "weapon" &&
        item.system?.natural &&
        item.name === UNARMED_STRIKE_DATA.name
    ) ?? null
  );
}

/**
 * Gets (creating and equipping if necessary) the actor's Unarmed
 * Strike item — the fallback when nothing else is equipped.
 *
 * @param {Actor} actor
 * @returns {Promise<Item>}
 */
export async function getOrCreateUnarmedStrike(actor) {
  const existing = existingUnarmedStrike(Array.from(actor.items ?? []));
  if (existing) {
    if (!existing.system.equipped) await existing.update({ "system.equipped": true });
    return existing;
  }
  const [created] = await actor.createEmbeddedDocuments("Item", [
    foundry.utils.deepClone(UNARMED_STRIKE_DATA)
  ]);
  return created;
}

/**
 * WHICH WEAPON A FEAT'S OR A REACTION'S STRIKE IS MADE WITH (3.645.0, F6 of
 * Graham's 14 October session). `meleeWeapon` took the first equipped melee attack, and
 * the Unarmed Strike is an equipped weapon — so a fighter holding a sword
 * Swiped with their fists whenever the fist came first. Asked, as the Strike
 * action asks, whenever more than one melee attack is ready; a held weapon is
 * offered first. Asked BEFORE the feat's AP is spent, so cancelling costs
 * nothing.
 *
 * @returns {Promise<Item|null|undefined>} the weapon; null when cancelled;
 *   undefined when there is nothing to choose between.
 */
export async function chooseMeleeAttack(actor, label) {
  const melee = usableAttacks(Array.from(actor?.items ?? []))
    .filter((w) => (w.system?.attackMode ?? "melee") === "melee");
  if (melee.length < 2) return undefined;
  const ordered = [...melee.filter((w) => !w.system?.natural), ...melee.filter((w) => w.system?.natural)];
  const { DialogV2 } = foundry.applications.api;
  const rows = ordered.map((w, index) =>
    `<label style="display:flex;align-items:center;gap:8px;padding:2px 0"><input type="radio" name="attack" value="${index}" ${index === 0 ? "checked" : ""}><span>${w.name}${w.system?.damage ? ` (${w.system.damage})` : ""}</span></label>`).join("");
  const picked = await DialogV2.wait({
    window: { title: `${label} — Which Weapon?`, icon: "fa-solid fa-hand-fist" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
    buttons: [
      { action: "confirm", label: "Use", default: true, callback: (event, button) => {
        const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        return new FDE(button.form ?? button.closest?.("form")).object.attack;
      } },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (picked === null || picked === undefined || picked === "cancel") return null;
  return ordered[Number(picked)] ?? null;
}
