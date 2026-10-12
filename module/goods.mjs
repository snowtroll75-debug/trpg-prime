/**
 * THE GOODS — what Chapter 6's Goods descriptions print that the Goods
 * table has no column for (pages 167-170). NEW at 3.576.0. Pure; no
 * Foundry. The Foundry side is goods-workflow.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE PAGES 161-170 AUDIT (D11): NONE OF THE 101 GEAR ITEMS CARRIED AN
 * EFFECT OR A CONDITIONAL. A Compass, a Bedroll, Earplugs and a Portable
 * Ram were text. Graham's rulings of 19 September 2026:
 *
 *   R8   Every printed Goods bonus as a conditional the player ticks,
 *        offered only while the item is equipped — held or worn — since
 *        the bonus is only printed for the item in use.
 *   R8b  The Compass gives its +5 as well as Chapter 4's "one step harder
 *        without a compass": two different sentences.
 *   R8   Saddlebags: "an animal's Strength score is considered 1 higher
 *        for carrying capacity" (stowage.mjs, beside the Backpack).
 *   R5   Improvised attacks, and the five Goods that name one.
 *   R9   Caltrops and Oil.
 *
 * WHERE THE FACTS LIVE. On the items, as flags set in the pack by
 * tools/data-fixes.json — `goodsConditionals`, `improvised`, `goodsUse` —
 * rather than recognised by name, so a renamed compass keeps its bonus
 * and a homebrew item can be given one.
 */

import { wornAndStanding } from "./item-quality.mjs";

const SYSTEM_ID = "trg-prime";

/** The flag a Goods item's printed bonuses are declared under. */
const GOODS_CONDITIONALS_FLAG = "goodsConditionals";

/** The flag naming what using a Goods item does ("caltrops", "oil"). */
export const GOODS_USE_FLAG = "goodsUse";

/** The flag an item that doubles as an improvised weapon carries. */
const IMPROVISED_FLAG = "improvised";

const flagOf = (item, key) => item?.flags?.[SYSTEM_ID]?.[key];

/* ───────────────────────────── R8: bonuses ──────────────────────────── */

/**
 * The conditionals every equipped Goods item offers.
 *
 * OFFERED, NOT ASSUMED (Graham's R8): nothing on a Perception check says
 * whether it is about "minute details" or a sound through a door, so the
 * player ticks the row. EQUIPPED AND STANDING, because a compass in the
 * pack is not being read and a destroyed one points nowhere.
 *
 * @param {Array} items the actor's items
 * @returns {Array} conditional entries, in item order
 */
export function goodsConditionals(items = []) {
  const out = [];
  for (const item of items ?? []) {
    if (item?.type !== "gear" || !wornAndStanding(item)) continue;
    const rows = flagOf(item, GOODS_CONDITIONALS_FLAG);
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      const entry = goodsConditionalEntry(item.name, row);
      if (entry) out.push(entry);
    }
  }
  return out;
}

/** One authored row, made into a conditional entry — or null if malformed. */
function goodsConditionalEntry(itemName, row) {
  if (!row || typeof row !== "object") return null;
  const kind = row.kind === "advantage" ? "advantage" : "modifier";
  const value = Number(row.value);
  if (kind === "modifier" && (!Number.isFinite(value) || value === 0)) return null;
  const when = row.when && typeof row.when === "object" ? row.when : null;
  if (!when) return null;
  const label = String(row.label ?? "").trim();
  return {
    kind,
    ...(kind === "modifier" ? { value, type: String(row.type ?? "item") } : {}),
    label: label ? `${itemName} (${label})` : String(itemName),
    scope: String(row.scope ?? label ?? ""),
    auto: false,
    when
  };
}

/* ───────────────────────── R5: improvised attacks ───────────────────── */

/**
 * The printed rows an improvised weapon can stand in for — transcribed
 * from the Chapter 6 weapon tables (pages 157-158), not read from the
 * pack, so a pack edit cannot silently change what a torch hits with.
 *
 * THROWN TRAITS ARE LEFT OFF. An improvised attack here is a melee
 * attack; hurling the thing is left at the table, because a thrown
 * weapon leaves the hand and the thrown-weapon bookkeeping expects a
 * weapon item to move, not a torch.
 */
const IMPROVISED_AS = Object.freeze({
  club: Object.freeze({ label: "club", damage: "1d5", damageType: "bludgeoning", fumbleDC: 12, traits: "" }),
  staff: Object.freeze({ label: "quarterstaff", damage: "1d6", damageType: "bludgeoning", fumbleDC: 12, traits: "Double, Hand & a Half, Trip" }),
  handaxe: Object.freeze({ label: "hand axe", damage: "1d6", damageType: "slashing", fumbleDC: 8, traits: "Agile, Sweep" }),
  lightHammer: Object.freeze({ label: "light hammer", damage: "1d6", damageType: "bludgeoning", fumbleDC: 6, traits: "Agile" }),
  lightPick: Object.freeze({ label: "light pick", damage: "1d4", damageType: "piercing", fumbleDC: 8, traits: "AR 1, Agile, Mighty +2" })
});

/**
 * Chapter 6, Improvised Attacks: "you suffer a -4-circumstance penalty to
 * the attack. Most improvised weapons will inflict 1d4 damage, but the GM
 * will have the final say on this, as well as the type of damage."
 */
export const IMPROVISED_PENALTY = -4;
const IMPROVISED_DAMAGE = "1d4";
/**
 * NOT PRINTED. The book gives an improvised weapon no Fumble DC; the
 * club's 12 is used, as the printed weapon nearest a chair leg or an
 * iron bar. Recorded here as a reading.
 */
const IMPROVISED_FUMBLE_DC = 12;

const DAMAGE_TYPES = Object.freeze(["bludgeoning", "piercing", "slashing"]);

/**
 * Can this item be swung as an improvised weapon? Anything held in the
 * hand that is not a weapon: an equipped gear item that takes a hand.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function canImproviseWith(item) {
  if (item?.type !== "gear" || !item?.system?.equipped) return false;
  return Math.trunc(Number(item?.system?.heldHands) || 0) >= 1;
}

/**
 * Does this item name the weapon it improvises as (a torch as a club)?
 * Such an item's damage type is the named weapon's, not the player's.
 */
export function improvisesAsNamedWeapon(item) {
  const declared = flagOf(item, IMPROVISED_FLAG);
  return Boolean(IMPROVISED_AS[String(declared?.as ?? "")]);
}

/**
 * The weapon data an improvised attack with this item is made as.
 *
 * DECLARED ON THE ITEM where the Goods description names a weapon:
 *   Torch            "an improvised club that also inflicts 1 fire damage"
 *   Pole, 10 ft      "an improvised quarterstaff (-10 to attack)" — Graham,
 *                    19 Sep 2026: -2, instead of the usual -4
 *   Axe, woodsman    "an improvised hand axe"
 *   Hammer, Tool     "an improvised light hammer"
 *   Shovel           "an improvised light pick"
 * Anything else is the generic 1d4, of the type the player picks.
 *
 * AN IMPROVISED WEAPON IS NOT A WEAPON OF ITS GROUP. It carries no
 * category or group, so Weapon Focus does not reach it and proficiency is
 * not asked (`improvised` — the -4 stands in for it).
 *
 * @param {object} item a gear item
 * @param {{damageType?: string}} [choice] the generic attack's type
 * @returns {object} weapon system data for the attack
 */
export function improvisedWeaponProfile(item, choice = {}) {
  const declared = flagOf(item, IMPROVISED_FLAG) ?? {};
  const named = IMPROVISED_AS[String(declared.as ?? "")] ?? null;
  const chosenType = DAMAGE_TYPES.includes(String(choice?.damageType ?? "")) ? String(choice.damageType) : "bludgeoning";
  // THE ITEM'S OWN PENALTY where it declares one — the pole's -2.
  const penalty = typeof declared.penalty === "number" && Number.isFinite(declared.penalty) ? declared.penalty : IMPROVISED_PENALTY;
  const extraDamage = String(declared.extraDamage ?? "").trim();
  const extraDamageType = String(declared.extraDamageType ?? "").trim().toLowerCase();
  return {
    damage: named?.damage ?? IMPROVISED_DAMAGE,
    damageType: named?.damageType ?? chosenType,
    traits: named?.traits ?? "",
    fumbleDC: named?.fumbleDC ?? IMPROVISED_FUMBLE_DC,
    attackMode: "melee",
    category: "",
    group: "",
    size: String(item?.system?.itemSize ?? "").trim() || "medium",
    natural: false,
    equipped: true,
    quantity: 1,
    quality: "standard",
    material: "",
    superiorTraits: "",
    runes: "",
    attackBonus: 0,
    hp: { value: 0, max: 0 },
    improvised: true,
    improvisedAs: named?.label ?? "",
    improvisedPenalty: penalty,
    improvisedExtraDamage: extraDamage,
    improvisedExtraDamageType: extraDamageType
  };
}

/**
 * The attack-roll row an improvised attack carries.
 *
 * @param {object} weaponSystem from `improvisedWeaponProfile`
 * @param {string} [itemName]
 * @returns {{label: string, value: number, type: string}|null}
 */
export function improvisedAttackModifier(weaponSystem, itemName = "") {
  if (!weaponSystem?.improvised) return null;
  const value = Number(weaponSystem.improvisedPenalty);
  if (!Number.isFinite(value) || value === 0) return null;
  const as = weaponSystem.improvisedAs ? ` as a ${weaponSystem.improvisedAs}` : "";
  return { label: `Improvised${itemName ? ` — ${itemName}` : ""}${as}`, value, type: "circumstance" };
}

/**
 * The typed damage an improvised weapon adds of its own — the torch's
 * "also inflicts 1 fire damage". A separate packet, in the shape
 * `runeDamageFor` returns, so a creature immune to fire takes the club's
 * bludgeoning and not the flame.
 *
 * @param {object} weaponSystem
 * @param {string} [itemName]
 * @returns {Array<object>}
 */
export function improvisedDamagePackets(weaponSystem, itemName = "") {
  if (!weaponSystem?.improvised) return [];
  const dice = String(weaponSystem.improvisedExtraDamage ?? "").trim();
  const type = String(weaponSystem.improvisedExtraDamageType ?? "").trim();
  if (!dice || !type) return [];
  return [{ label: itemName || "Improvised weapon", dice, type, secondaryCritical: null }];
}

/* ─────────────────────────── R9: using goods ────────────────────────── */

/**
 * What the item's "use" button says, or "" for an item with none.
 *
 * @param {object} item
 * @returns {string}
 */
export function goodsUseLabel(item) {
  const use = String(flagOf(item, GOODS_USE_FLAG) ?? "").trim();
  if (use === "caltrops") return "Scatter caltrops in an adjacent square (1 AP)";
  if (use === "oil") {
    return oilPrepared(item)
      ? "Throw the prepared oil (1 AP) — a DC 10 flat check to ignite on a hit"
      : "Prepare the oil to throw (1 AP, Interact)";
  }
  if (use === GRAPPLING_HOOK.use) {
    return `Throw and anchor the hook (${GRAPPLING_HOOK.ap} AP) — a secret attack roll against the anchor point's DC`;
  }
  return "";
}

/**
 * THE GRAPPLING HOOK (page 168; 3.577.0). Graham's R2 of the block-17
 * audit: the description wins over the p.171 table's "Lower difficulty of
 * climbing checks", and the description is an attack:
 *
 *   "To anchor the grappling hook, an attack roll with the secret trait
 *    is required, targeting a specific DC determined by the chosen point
 *    of attachment, typically DC 20 or higher. Success grants the
 *    reassurance of a secure hold ... However, a fumbled attempt deceives
 *    with a false sense of security, leading to an unfortunate discovery
 *    when the hook unexpectedly dislodges ... while still partway up."
 *
 * READINGS, recorded in the release notes: the throw is 1 AP, as a
 * thrown attack is; it is a plain ranged attack with no improvised
 * penalty, because the hook is made to be thrown and the anchor's DC
 * already prices the throw; and a failure (or a partial) is visible —
 * the hook comes back when pulled — while only a fumble looks like a
 * success, which is the whole of "a false sense of security".
 */
export const GRAPPLING_HOOK = Object.freeze({ use: "grapplingHook", defaultDC: 20, ap: 1 });

/**
 * What an anchoring throw leaves behind, by degree.
 *
 * @param {string} degreeKey
 * @returns {{secure: boolean, seemsToHold: boolean, dislodges: boolean}}
 *   `seemsToHold` is what the thrower sees; `secure` is the truth.
 */
export function grapplingHookOutcome(degreeKey) {
  const key = String(degreeKey ?? "").trim().toLowerCase();
  const secure = ["success", "critical", "heroic"].includes(key);
  const dislodges = ["fumble", "blunder"].includes(key);
  return { secure, seemsToHold: secure || dislodges, dislodges };
}

/** The flag a pint of oil carries once it has been prepared to throw. */
export const OIL_PREPARED_FLAG = "oilPrepared";

/** Has this flask been prepared (Interact) and not yet thrown? */
export function oilPrepared(item) {
  return item?.flags?.[SYSTEM_ID]?.[OIL_PREPARED_FLAG] === true;
}

/**
 * CALTROPS (Chapter 6): "The first creature that moves into that square
 * must succeed at a DC 20 basic Reflex save or take 1d6 piercing damage.
 * Once a creature takes damage from caltrops, enough caltrops are ruined
 * that other creatures moving into the square are safe."
 */
export const CALTROPS = Object.freeze({ dc: 20, save: "reflex", damage: "1d6", die: 6, damageType: "piercing" });

/**
 * OIL (Chapter 6): "You must succeed at a DC 10 flat check for the oil to
 * ignite successfully when it hits. If the oil ignites, the target takes
 * 5 fire damage."
 */
export const OIL = Object.freeze({ igniteDC: 10, damage: 5, damageType: "fire" });

/**
 * What caltrops leave in the square after a creature has walked in.
 *
 * @param {{ruined?: boolean}} state
 * @param {number} taken the damage the creature actually took
 * @returns {{ruined: boolean}}
 */
export function caltropsAfterEntry(state, taken) {
  return { ruined: Boolean(state?.ruined) || Number(taken) > 0 };
}
