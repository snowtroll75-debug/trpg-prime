/**
 * A CREATURE WEAPON'S PRINTED SECONDARY DAMAGE (3.633.0; Fiends & Fables 3.0
 * block 3, ruling R2 — Graham, 11 October 2026).
 *
 * "Claw +20 (agile, finesse, magical, versatile - p) 2d6+6 slashing plus
 * 2d6 good." The "plus 2d6 good" is the book's secondary damage — the same
 * word Chapter 11 uses for a Flaming rune's 1d4 — so it is a PACKET of its
 * own type, resolved against the struck creature's own defences in the
 * attack workflow's secondary-damage loop, beside the rune and ammunition
 * packets. A good-immune target shrugs off the 2d6 good and still takes
 * the slashing.
 *
 * Declared on the weapon:
 *
 *   flags.trg-prime.creatureAttack.secondary = [{ dice: "2d6", type: "good" }]
 *
 * Magical when the weapon is (its traits name "magical"); otherwise as
 * magical as the strike itself, like an unguent's packet.
 *
 * AN ALIGNED WORD IS ALIGNED DAMAGE. "2d6 good" is Chapter 7's aligned
 * damage of the good alignment: "such damage only affects creatures of the
 * opposing trait", DR does not apply. So the packet is the type `aligned`,
 * conditional on the target exactly as an Aligned rune's is
 * (rune-damage.mjs) — resolved when the struck creature is known.
 *
 * Pure.
 */
import { ALIGNED_TRAITS } from "../aligned.mjs";
import { alignedDamageAffects } from "../creature-traits.mjs";

const SYSTEM_ID = "trg-prime";
const DICE = /^\s*\d+d\d+(\s*[+-]\s*\d+)?\s*$/i;
const TYPE = /^[a-z][a-z -]*$/i;

/** The declared secondary packets of a weapon, normalised; [] when none. */
export function creatureSecondaryPackets(weapon, targetSystem = null) {
  const raw = weapon?.flags?.[SYSTEM_ID]?.creatureAttack?.secondary;
  const rows = Array.isArray(raw) ? raw : (raw ? [raw] : []);
  const magical = /\bmagical\b/i.test(String(weapon?.system?.traits ?? ""));
  const out = [];
  for (const row of rows) {
    const dice = String(row?.dice ?? "").replace(/\s+/g, "");
    const type = String(row?.type ?? "").trim().toLowerCase();
    if (!DICE.test(dice) || !TYPE.test(type)) continue;
    const aligned = ALIGNED_TRAITS.includes(type);
    const applies = !aligned || (targetSystem ? alignedDamageAffects(type, targetSystem) : false);
    out.push({
      // An aligned packet's line already names its alignment ("— no extra
      // damage: … opposing good"), so its label carries only the dice.
      label: `${String(weapon?.name ?? "Strike")} (${aligned ? dice : `${dice} ${type}`})`,
      dice,
      type: aligned ? "aligned" : type,
      secondaryCritical: null,
      conditional: aligned,
      resolved: aligned ? Boolean(targetSystem) : false,
      applies,
      why: applies ? "" : `it harms only a creature with the trait opposing ${type}`,
      parameter: aligned ? type : "",
      against: aligned ? `a creature opposing ${type}` : "",
      // `mundane` packets take the strike's own magic in the loop; a
      // magical natural weapon's rider is magical outright.
      mundane: !magical
    });
  }
  return out;
}

/**
 * The alignment an ALIGNED packet carries, as the damage's source traits
 * (3.634.0, F&F 3.0 block 4 R3) — a creature's "plus 2d6 good" and an
 * Aligned rune alike. [] for any other packet.
 */
export function alignedPacketTraits(packet) {
  if (String(packet?.type ?? "").toLowerCase() !== "aligned") return [];
  const word = String(packet?.parameter ?? "").trim().toLowerCase();
  return ALIGNED_TRAITS.includes(word) ? [word] : [];
}

/**
 * AN ACTION'S OWN EXTRA DAMAGE (3.649.0; F&F 3.0 block 16 R4/R5) as packets
 * of the struck creature's damage loop — the Cloud Giant's Thundering Strike
 * "+2d12 bludgeoning", the Storm Giant's Lightning Strike "+3d12
 * electricity". The shape `creatureSecondaryPackets` builds for a weapon's
 * printed "plus 1d6 fire"; magical when the weapon is.
 *
 * @param {Array<{dice:string, type:string, label?:string}>} rows
 * @param {object} [weapon]
 */
export function actionDamagePackets(rows = [], weapon = null) {
  const magical = /\bmagical\b/i.test(String(weapon?.system?.traits ?? ""));
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const dice = String(row?.dice ?? "").replace(/\s+/g, "");
    const type = String(row?.type ?? "").trim().toLowerCase();
    if (!DICE.test(dice) || !TYPE.test(type) || ALIGNED_TRAITS.includes(type)) continue;
    out.push({
      label: `${String(row?.label ?? "").trim() || String(weapon?.name ?? "Strike")} (${dice} ${type})`,
      dice, type, secondaryCritical: null, conditional: false, resolved: false, applies: true,
      why: "", parameter: "", against: "", mundane: !magical
    });
  }
  return out;
}
