import { fieldToRunes } from "../rune-catalogue.mjs";
import { extractTraitValue } from "./attack.mjs";

/**
 * Ammunition (Chapter 6). Pure logic; ammunition-workflow.mjs drives the
 * Foundry side.
 *
 * Ammunition existed as a compendium of nine items, an inventory row and
 * a picker entry, and touched an attack at no point whatsoever: the
 * attack pipeline read Armour Rending only from the *weapon's* trait
 * string, and `compatibleWeaponGroup` was read nowhere in the codebase.
 * Penetrating Arrows' AR 1, Distance Arrows' extra range, the Fire
 * Bolt's 3 fire damage — none of it did anything.
 *
 * Per Graham directly: ammunition Armour Rending adds to the weapon's
 * own ("an attack from one of these arrows gains AR 1" reads as
 * something the attack gains on top of what it had), and quantity counts
 * individual rounds rather than bundles.
 */

/**
 * What a weapon fires: its declared `ammunitionFamily`, or its group.
 *
 * THE GROUPS WENT BACK TO THE BOOK (3.575.0, Graham 19 Sep 2026). The
 * printed weapon groups put every crossbow and the Repeater in BOW and the
 * blowgun in DART, and the pack had given them groups of their own so that
 * ammunition — matched on group — would not let arrows into a crossbow.
 * Two questions were sharing one field: which feats and proficiencies
 * reach this weapon (the group) and what goes in it (the ammunition). They
 * are two fields now. A weapon that declares nothing fires what its group
 * name says, which is every bow, sling and every world copy of a crossbow
 * made before this release (whose group still reads Crossbow).
 *
 * @param {object} weaponSystem
 * @returns {string} lower-cased
 */
export function weaponAmmunitionFamily(weaponSystem) {
  const declared = String(weaponSystem?.ammunitionFamily ?? "").trim().toLowerCase();
  return declared || String(weaponSystem?.group ?? "").trim().toLowerCase();
}

/**
 * Whether a piece of ammunition can be fired from a weapon.
 *
 * The ammunition's `compatibleWeaponGroup` ("For") names the family it
 * fits — Bow, Crossbow, Blowgun, Sling — and the weapon's family is
 * `weaponAmmunitionFamily`.
 *
 * @param {object} ammoSystem An ammunition item's system data.
 * @param {object} weaponSystem A weapon item's system data.
 * @returns {boolean}
 */
export function ammunitionFitsWeapon(ammoSystem, weaponSystem) {
  const wanted = String(ammoSystem?.compatibleWeaponGroup ?? "").trim().toLowerCase();
  const family = weaponAmmunitionFamily(weaponSystem);
  if (!wanted || !family) return false;
  return wanted === family;
}

/**
 * Whether a weapon is fired rather than swung or thrown — the only kind
 * that draws on ammunition. Thrown weapons *are* their own projectile.
 *
 * @param {object} weaponSystem
 * @returns {boolean}
 */
export function weaponUsesAmmunition(weaponSystem) {
  // A CREATURE'S OWN MISSILE DRAWS ON NOTHING (3.637.1; Fiends & Fables 3.0
  // block 7, found live): the Flame Beetle's Fire Mote, "range 30", is fired
  // — no Strength on its damage — but the beetle is its own quiver. A
  // natural weapon in missile mode is ranged without ammunition.
  if (String(weaponSystem?.category ?? "").trim().toLowerCase() === "natural") return false;
  return String(weaponSystem?.attackMode ?? "melee") === "missile";
}

/** Rounds left in a stack of ammunition. */
export function roundsRemaining(ammoSystem) {
  return Math.max(0, Math.floor(Number(ammoSystem?.quantity ?? 0)));
}

/**
 * Every compatible, non-empty stack the actor is carrying.
 *
 * @param {Array} items The actor's items.
 * @param {object} weaponSystem
 * @returns {Array} Ammunition items, in name order.
 */
export function usableAmmunition(items, weaponSystem) {
  if (!weaponUsesAmmunition(weaponSystem)) return [];
  return Array.from(items ?? [])
    .filter(
      (item) =>
        item?.type === "ammunition" &&
        ammunitionFitsWeapon(item.system, weaponSystem) &&
        roundsRemaining(item.system) > 0
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * Armour Rending for an attack, per Graham: the weapon's own and the
 * ammunition's add together.
 *
 * @param {number} weaponAR From armourRendingValue.
 * @param {object|null} ammoSystem
 * @returns {number}
 */
export function combinedArmourRending(weaponAR, ammoSystem) {
  const weapon = Math.max(0, Number(weaponAR) || 0);
  const ammo = Math.max(0, Number(ammoSystem?.armourRending ?? 0) || 0);
  return weapon + ammo;
}

/**
 * Everything a piece of ammunition contributes to the attack it is fired
 * on, normalised so callers never handle a missing field.
 *
 * @param {object|null} ammoSystem
 * @returns {{armourRending: number, damageTypeOverride: string|null,
 *   rangeIncrementBonus: number, attackModifier: number,
 *   damageModifier: number, extraDamage: string|null,
 *   extraDamageType: string, splashDamage: number, allowsSubdual: boolean}}
 */
export function ammunitionEffects(ammoSystem) {
  const type = String(ammoSystem?.damageTypeOverride ?? "").trim();
  const extra = String(ammoSystem?.extraDamage ?? "").trim();
  return {
    armourRending: Math.max(0, Number(ammoSystem?.armourRending ?? 0) || 0),
    damageTypeOverride: type || null,
    rangeIncrementBonus: Number(ammoSystem?.rangeIncrementBonus ?? 0) || 0,
    /*
     * WHAT THE AMMUNITION ADDS TO THE ATTACK ROLL (3.513.0).
     *
     * Ammunition could already change damage, damage type, range, armour
     * rending, splash and subdual — everything except whether the shot
     * lands. Graham ruled on 7 September 2026 that Magic Stone's "+1 item
     * (magic) bonus" covers attack AND damage, which is the ordinary
     * reading of an enhancement bonus, and there was no field for the
     * first half.
     *
     * NOT CLAMPED TO ZERO, unlike armourRending and splash. A cursed or
     * warped-off round that flies worse is a coherent thing to author,
     * and the damage modifier beside it has never been clamped either.
     */
    attackModifier: Number(ammoSystem?.attackModifier ?? 0) || 0,
    damageModifier: Number(ammoSystem?.damageModifier ?? 0) || 0,
    extraDamage: extra || null,
    extraDamageType: String(ammoSystem?.extraDamageType ?? "").trim(),
    splashDamage: Math.max(0, Number(ammoSystem?.splashDamage ?? 0) || 0),
    allowsSubdual: Boolean(ammoSystem?.allowsSubdual)
  };
}

/**
 * The attack-roll modifier row this ammunition contributes, or null.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN `item` BONUS, AND THAT IS THE WHOLE POINT OF RETURNING A TYPED ROW
 * RATHER THAN A NUMBER. The weapon's own `attackBonus` is pushed as
 * `item` three lines away in the attack workflow, so a +1 Magic Stone
 * fired from a +2 sling gives +2 and not +3 — the typed-stacking engine
 * already does that, and it can only do it if this says what kind of
 * bonus it is. A bare number added to the total would stack with the
 * weapon and nothing would ever say so.
 *
 * BUILT HERE RATHER THAN IN THE WORKFLOW so a check can run it. The
 * workflow is Foundry-coupled and the harness cannot reach a decision
 * made inside it; what is left there is one null-check.
 *
 * @param {object|null} ammoSystem
 * @param {string} ammoName what the card calls it
 * @returns {{label: string, value: number, type: string}|null}
 */
/**
 * RUNED AMMUNITION'S POTENCY (3.618.0, B1 of block 37): "This rune may be
 * placed upon either a weapon or a batch of ammunition." Its tier is the
 * round's item bonus to attack and its +1 damage a tier (R7); and a batch
 * carrying one is a magical source. 0 for none.
 *
 * Read off the runes field directly: a batch has no quality to cap it, and
 * the builder priced it by the tier written.
 *
 * @param {object|null} ammoSystem
 * @returns {number}
 */
export function ammoPotencyTier(ammoSystem) {
  const potency = fieldToRunes("weapon", ammoSystem?.runes ?? "").find((rune) => rune.key === "potency");
  return Math.max(0, Math.min(6, Math.floor(Number(potency?.tier) || 0)));
}

export function ammunitionAttackModifier(ammoSystem, ammoName = "Ammunition") {
  // The round's own bonus and its potency are both ITEM bonuses: the higher.
  const own = Number(ammoSystem?.attackModifier ?? 0) || 0;
  const potency = ammoPotencyTier(ammoSystem);
  const value = potency > 0 && own >= 0 ? Math.max(own, potency) : own + potency;
  // A ZERO ROW WOULD PRINT A LINE ON EVERY SHOT saying the arrows gave
  // nothing, which is true of all nine authored rounds today.
  if (!value) return null;
  return { label: String(ammoName || "Ammunition"), value, type: "item" };
}

/**
 * A weapon's effective range increment once its ammunition is taken into
 * account — Distance Arrows "increase the range increment of the bow by
 * ten feet".
 *
 * @param {object} weaponSystem
 * @param {object|null} ammoSystem
 * @returns {number}
 */
export function effectiveRangeIncrement(weaponSystem, ammoSystem) {
  // The numeric rangeIncrement field is the source of truth when set, but many
  // weapons carry the distance only in a trait — "Range 100" on a bow, "Thrown
  // 30 ft" on a javelin. Fall back to parsing that trait so a weapon with a
  // blank field (every thrown weapon, and any bow whose field wasn't filled in)
  // still gets a real increment rather than none.
  let base = Number(weaponSystem?.rangeIncrement ?? 0) || 0;
  if (base <= 0) {
    const traits = weaponSystem?.traits ?? "";
    base = extractTraitValue(traits, "range") ?? extractTraitValue(traits, "thrown") ?? 0;
  }
  const bonus = Number(ammoSystem?.rangeIncrementBonus ?? 0) || 0;
  return Math.max(0, base + bonus);
}

/* ─────────────────────────────────────────────────────────────────────
 * WHAT THE PAGE 166 DESCRIPTIONS PRINT (3.576.0)
 *
 * The pages 161-170 audit found three rounds whose own sentences reached
 * nothing: Distance Arrows kept Deadly, the Fire Bolt's fire arrived as
 * piercing and its splash landed nowhere, and Blunt Arrows could not be
 * fired for subdual damage.
 * ───────────────────────────────────────────────────────────────────── */

/**
 * The weapon's traits once the round has had its say.
 *
 * DISTANCE ARROWS: "increase the range increment of the bow by ten feet
 * but reduce damage (-1 item) AND REMOVE THE DEADLY TRAIT." The first two
 * reached play; Deadly was read from the bow's own trait line, which
 * nothing the arrow declared could touch. The round now declares what it
 * removes (`removesTraits`), and the attack reads the bow through here.
 *
 * A trait is removed by its NAME, so a numbered trait ("Mighty +2") goes
 * whole when the round names "Mighty".
 *
 * @param {string} traits the weapon's trait line
 * @param {object|null} ammoSystem
 * @returns {string}
 */
export function traitsAfterAmmunition(traits, ammoSystem) {
  const line = String(traits ?? "");
  const removed = String(ammoSystem?.removesTraits ?? "")
    .split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  if (!removed.length) return line;
  return line.split(",")
    .map((t) => t.trim())
    .filter((t) => t && !removed.some((name) => t.toLowerCase() === name || t.toLowerCase().startsWith(`${name} `)))
    .join(", ");
}

/**
 * The typed damage a round adds of its own, as separate packets in the
 * shape `runeDamageFor` returns.
 *
 * THE FIRE BOLT: "the bolt explodes and inflicts an additional 3 fire
 * damage and 1 splash damage." The 3 was added to the bolt's formula and
 * so arrived as PIERCING — a creature immune to fire took it, one weak to
 * fire did not notice. A separate packet of its own type meets the
 * target's own defences, exactly as a Flaming rune's die does.
 *
 * THE SPLASH GOES WITH IT, on the target (Graham's splash ruling of
 * 3 September 2026: the target takes the splash, neighbours are named on
 * the card) — added to the same packet, because resistance halves the
 * sum and not two halves. It is the explosion's, so it is fire too.
 *
 * AN EXTRA OF THE SHOT'S OWN TYPE is not a packet: it stays in the
 * formula (`ammunitionFormulaExtra`) and meets the target's DR with the
 * rest of the hit.
 *
 * @param {object|null} ammoSystem
 * @param {string} [ammoName]
 * @param {string} [shotType] the damage type the shot itself deals
 * @returns {Array<object>}
 */
export function ammunitionDamagePackets(ammoSystem, ammoName = "Ammunition", shotType = "") {
  const fx = ammunitionEffects(ammoSystem);
  const type = fx.extraDamageType.toLowerCase();
  if (!fx.extraDamage || !type || type === String(shotType ?? "").trim().toLowerCase()) return [];
  return [{
    label: String(ammoName || "Ammunition"),
    dice: fx.splashDamage ? `${fx.extraDamage} + ${fx.splashDamage}` : fx.extraDamage,
    type,
    secondaryCritical: null,
    splash: fx.splashDamage
  }];
}

/**
 * What a round adds to the shot's own formula: an extra with no type of
 * its own (or the shot's own type), and a splash with no packet to ride.
 *
 * @param {object|null} ammoSystem
 * @param {string} [shotType]
 * @returns {string} a formula fragment such as " + 3", or ""
 */
export function ammunitionFormulaExtra(ammoSystem, shotType = "") {
  const fx = ammunitionEffects(ammoSystem);
  if (ammunitionDamagePackets(ammoSystem, "", shotType).length) return "";
  const parts = [fx.extraDamage, fx.splashDamage ? String(fx.splashDamage) : ""].filter(Boolean);
  return parts.map((p) => ` + ${p}`).join("");
}

/**
 * BLUNT ARROWS: "an archer can choose to inflict subdual damage with the
 * arrows by taking a -4-circumstance penalty to their attack." `allowsSubdual`
 * sat on the item and was read by nothing.
 */
export const SUBDUAL_SHOT_PENALTY = -4;

/**
 * THE SLING: "A sling can be used to throw found rocks at a -2-attack
 * bonus." Declared on the weapon as `foundAmmunitionPenalty`; a weapon
 * without one needs real rounds.
 *
 * @param {object} weaponSystem
 * @returns {number|null} the penalty, or null if it cannot
 */
export function foundAmmunitionPenalty(weaponSystem) {
  const value = Number(weaponSystem?.foundAmmunitionPenalty ?? 0);
  return Number.isFinite(value) && value < 0 ? value : null;
}

/* ─────────────────────────────────────────────────────────────────────
 * RECOVERING AMMUNITION (Chapter 6, page 166; Graham's R3, 19 Sep 2026)
 *
 * "At the end of the battle, you can recover half your expended
 * ammunition by taking a minute to search the battlefield." Counted per
 * stack while a combat runs; offered back, rounded down, when it ends.
 *
 * SHURIKEN COUNT: "treated as ammunition for the purposes of ... what
 * happens to them after they are thrown" — a weapon that declares
 * `recoveredAsAmmunition` is counted here rather than dropped on the
 * party sheet the way a javelin is.
 * ───────────────────────────────────────────────────────────────────── */

/** The actor flag the count lives under. */
export const AMMUNITION_SPENT_FLAG = "ammunitionSpent";

/**
 * The count after one more round is spent.
 *
 * A NEW COMBAT STARTS A NEW COUNT, so arrows fired in last night's fight
 * are not offered back again tonight.
 *
 * @param {object|null} record the current flag value
 * @param {string} combatId
 * @param {{id: string, name: string, source?: object|null}} stack
 * @returns {object} the new flag value
 */
export function withShotRecorded(record, combatId, stack) {
  const fresh = !record || record.combatId !== combatId;
  const stacks = fresh ? {} : { ...(record.stacks ?? {}) };
  const previous = stacks[stack.id] ?? { name: stack.name, fired: 0, source: null };
  stacks[stack.id] = {
    name: String(stack.name ?? previous.name ?? ""),
    fired: Math.max(0, Math.floor(Number(previous.fired) || 0)) + 1,
    // THE LAST ONE THROWN TAKES THE ITEM WITH IT, so what it was is kept
    // to put back. A stack that is still there needs no copy.
    source: stack.source ?? previous.source ?? null
  };
  return { combatId: String(combatId), stacks };
}

/** Half, rounded down (Graham's R3). */
export function recoverableRounds(fired) {
  return Math.floor(Math.max(0, Math.floor(Number(fired) || 0)) / 2);
}

/**
 * What the end of this combat offers back.
 *
 * @param {object|null} record
 * @param {string} combatId
 * @returns {Array<{id: string, name: string, fired: number, recover: number, source: object|null}>}
 */
export function recoveryPlan(record, combatId) {
  if (!record || record.combatId !== combatId) return [];
  return Object.entries(record.stacks ?? {})
    .map(([id, entry]) => ({
      id,
      name: String(entry?.name ?? ""),
      fired: Math.max(0, Math.floor(Number(entry?.fired) || 0)),
      recover: recoverableRounds(entry?.fired),
      source: entry?.source ?? null
    }))
    .filter((row) => row.recover > 0);
}

/** Is this thrown weapon handled as ammunition after the throw (shuriken)? */
export function recoveredAsAmmunition(weaponSystem) {
  return weaponSystem?.recoveredAsAmmunition === true;
}
