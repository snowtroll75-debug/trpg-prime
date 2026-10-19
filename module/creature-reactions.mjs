/**
 * A CREATURE'S OWN REACTIONS AND TOGGLES (3.650.0; Fiends & Fables 3.0
 * block 17 — Graham, 15 October 2026: "Okay please implement").
 *
 *   reactionMove          a reaction that moves the creature, offered when its
 *                         trigger happens:
 *     trigger "missed"    a Strike against it misses — the Glimmerwick's
 *                         Gleam-Dart Escape ("Flies up to 10 feet … does not
 *                         provoke reactions"), only while `requiresEffect`
 *                         (its Luminous Aura) is on
 *     trigger "adjacent"  a creature ends a move adjacent to it — the
 *                         Goblin's Nimble Escape ("may use the step action")
 *   criticalReplacement   a critical with a named weapon may trade its injury
 *                         for one of a few lesser effects — the Glimmerwick's
 *                         Prankster's Cruelty
 *   toggleEffect          (a Codex action kind) an effect the creature turns
 *                         on and off for free — Luminous Aura
 *
 * Declared on `flags.trg-prime.creatureAbility`. Pure.
 */

const SYSTEM_ID = "trg-prime";
const TRIGGERS = ["missed", "adjacent"];
const SPEEDS = ["land", "fly", "swim", "climb", "burrow"];
const REPLACEMENTS = ["dropObject", "flatFooted", "nextAttackPenalty"];

const abilityOf = (item) => item?.flags?.[SYSTEM_ID]?.creatureAbility ?? null;

/** A reaction move's declaration, cleaned, or null. */
function reactionMoveSpec(raw) {
  if (!raw || typeof raw !== "object") return null;
  const trigger = String(raw.trigger ?? "").trim();
  if (!TRIGGERS.includes(trigger)) return null;
  const feet = Math.max(0, Math.trunc(Number(raw.feet) || 0));
  if (!feet) return null;
  const speedKey = SPEEDS.includes(String(raw.speedKey ?? "")) ? String(raw.speedKey) : "land";
  return {
    trigger, feet, speedKey,
    provokes: raw.provokes === true,
    requiresEffect: String(raw.requiresEffect ?? "").trim(),
    label: String(raw.label ?? "").trim()
  };
}

/** Every reaction move a creature carries for this trigger: [{ item, spec }]. */
export function reactionMovesOf(items = [], trigger = "") {
  const out = [];
  for (const item of Array.from(items ?? [])) {
    const spec = reactionMoveSpec(abilityOf(item)?.reactionMove);
    if (spec && spec.trigger === trigger) out.push({ item, spec: { ...spec, label: spec.label || String(item.name ?? "Reaction") } });
  }
  return out;
}

/** Whether a required effect is on: by name, not disabled. An empty requirement is met. */
export function requiredEffectOn(effects = [], name = "") {
  const want = String(name ?? "").trim().toLowerCase();
  if (!want) return true;
  return Array.from(effects ?? []).some((e) => !e?.disabled && String(e?.name ?? "").trim().toLowerCase() === want);
}

/** The compound-action leg a reaction move arms: free of AP, its limit, no reactions unless declared. */
export function reactionMoveLeg(spec) {
  return { speedKey: spec.speedKey, maxFeet: spec.feet, provokes: spec.provokes === true, label: spec.label };
}

/** A critical replacement offered for this weapon, or null. */
export function criticalReplacementFor(items = [], weaponName = "") {
  const want = String(weaponName ?? "").trim().toLowerCase();
  for (const item of Array.from(items ?? [])) {
    const raw = abilityOf(item)?.criticalReplacement;
    if (!raw || typeof raw !== "object") continue;
    const weapons = (Array.isArray(raw.weapons) ? raw.weapons : []).map((w) => String(w).trim().toLowerCase());
    if (!weapons.includes(want)) continue;
    const options = (Array.isArray(raw.options) ? raw.options : []).filter((o) => REPLACEMENTS.includes(o));
    if (!options.length) continue;
    return { label: String(item.name ?? "Critical replacement"), options, penalty: Math.trunc(Number(raw.penalty) || -2) };
  }
  return null;
}

/** The toggled effect's data for a `toggleEffect` action. */
export function toggledEffectData(item, spec = {}) {
  const flags = { toggledBy: String(item?.name ?? "") };
  if (spec.lightSource) flags.lightSource = String(spec.lightSource);
  if (Array.isArray(spec.conditionals) && spec.conditionals.length) flags.conditionals = spec.conditionals.map((c) => ({ ...c }));
  return { name: String(spec.label || item?.name || "Effect"), img: item?.img || "icons/svg/sun.svg", flags: { [SYSTEM_ID]: flags } };
}
