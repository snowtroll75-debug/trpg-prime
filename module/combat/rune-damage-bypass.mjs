/**
 * RUNE DAMAGE THAT GOES THROUGH RESISTANCE (3.684.0; Eldritch Arts Block 6,
 * G19). Pure; no Foundry.
 *
 *   RUNEFORGE MASTERY (Runeblade, Level 18): "Your Runeblade Runes ignore any
 *   resistance to their damage type. Furthermore, immunity is treated as
 *   resistance."
 *
 * The system's one resistance bypass (Blackfire Ivy's, `setResistanceBypass`
 * in damage-workflow.mjs) is scoped to a CAST and lasts the cast. This one is
 * scoped to an ATTACKER's named runes: which of a weapon's runes are
 * Runeblade runes is the module's to know (its infusion records them), so the
 * attacker declares them, on an item or an applied effect:
 *
 *   flags["trg-prime"].runeDamageBypass = {
 *     label: "Runeforge Mastery",
 *     runes: ["flaming", "shock"],     // rune keys; "*" every rune
 *     weaponId: "…",                   // optional: only on that weapon
 *     immunityAsResistance: true       // an immune target resists instead
 *   }
 *
 * Read for each rune packet a Strike rolls (attack-workflow's packet loop),
 * and nowhere else: the Strike's own damage and a feat's strike riders are
 * not runes. "Ignore any resistance TO THEIR DAMAGE TYPE": a type resistance
 * (and the trait-keyed copy of it) is lifted; a category resistance
 * ("mundane", "all damage") is not about the type and stands. An immunity to
 * the type becomes a resistance to it, which the lifting does not then undo:
 * the second sentence would mean nothing if it did.
 */

const SYSTEM_ID = "trg-prime";
const lower = (v) => String(v ?? "").trim().toLowerCase();

/**
 * The bypass this attacker's documents declare for one rune, or null.
 * @param {Iterable} docs the attacker's items and applied effects
 * @param {{runeKey: string, weaponId?: string}} rune
 * @returns {{label: string, immunityAsResistance: boolean}|null}
 */
export function declaredRuneDamageBypass(docs = [], { runeKey = "", weaponId = "" } = {}) {
  const key = lower(runeKey);
  if (!key) return null;
  let found = null;
  for (const doc of Array.from(docs ?? [])) {
    if (!doc || doc.disabled) continue;
    const raw = doc.flags?.[SYSTEM_ID]?.runeDamageBypass;
    if (!raw || typeof raw !== "object") continue;
    const runes = (Array.isArray(raw.runes) ? raw.runes : []).map(lower).filter(Boolean);
    if (!runes.includes("*") && !runes.includes(key)) continue;
    const onWeapon = String(raw.weaponId ?? "").trim();
    if (onWeapon && onWeapon !== String(weaponId ?? "").trim()) continue;
    found = {
      label: String(raw.label ?? doc.name ?? "").trim() || "Rune damage bypass",
      immunityAsResistance: Boolean(found?.immunityAsResistance) || raw.immunityAsResistance === true
    };
  }
  return found;
}

/**
 * The defence lists a packet of this type meets, after a rune bypass.
 * Sets or arrays in; the same kind out.
 *
 * @param {{resistances?: Iterable, immunities?: Iterable, resistanceTraits?: Iterable}} lists
 * @param {string} type the packet's damage type
 * @param {{ignoreResistance?: boolean, immunityAsResistance?: boolean}} bypass
 */
export function runeBypassedDefences({ resistances = [], immunities = [], resistanceTraits = [] } = {}, type = "", { ignoreResistance = false, immunityAsResistance = false } = {}) {
  const t = lower(type);
  const same = (list, values) => (list instanceof Set ? new Set(values) : values);
  const strip = (list) => Array.from(list ?? []).filter((k) => lower(k) !== t);
  if (!t || (!ignoreResistance && !immunityAsResistance)) return { resistances, immunities, resistanceTraits };
  const immune = Array.from(immunities ?? []).some((k) => lower(k) === t);
  let res = ignoreResistance ? strip(resistances) : Array.from(resistances ?? []);
  const resTraits = ignoreResistance ? strip(resistanceTraits) : Array.from(resistanceTraits ?? []);
  let imm = Array.from(immunities ?? []);
  if (immunityAsResistance && immune) {
    imm = strip(immunities);
    res = [...res, t];
  }
  return { resistances: same(resistances, res), immunities: same(immunities, imm), resistanceTraits: same(resistanceTraits, resTraits) };
}
