/**
 * CHANGE SHAPE (3.636.0; Fiends & Fables 3.0 block 6, ruling R10 — Graham,
 * 12 October 2026: "your recommendation on all"). The Barghest, page 18:
 *
 *   "Change Shape 1 AP (concentrate, divine, polymorph, transmutation)
 *    Assuming the guise of a goblinoid creature (such as a goblin,
 *    hobgoblin, or bugbear) or a wolf, the barghest alters its appearance,
 *    or it returns to its original form. While in the goblinoid guise, the
 *    barghest loses its bite and claw Strikes, adopts a small size when
 *    mimicking a goblin, and its Speed becomes 20 feet. When assuming the
 *    form of a wolf, the barghest's Speed increases to 40 feet, and its
 *    bite acquires the Monstrous Knockdown ability."
 *
 * A creature declares its forms on the ability —
 *
 *   creatureAbility.action = { kind: "changeShape", ap: 1, forms: [
 *     { key: "true", label: "Its own form", own: true },
 *     { key: "goblin", label: "Goblin guise", speed: 20, size: "small",
 *       loses: ["Bite", "Claw"] },
 *     { key: "wolf", label: "Wolf", speed: 40,
 *       conditionals: [ …Monstrous Knockdown's… ] } ] }
 *
 * — and the chosen form is ONE Active Effect, which replaces the last: a
 * land-speed adjustment into the movement pool (the form's speed less the
 * creature's own), a size override, the conditionals it gains, and the
 * weapons it loses named in its flag (the workflow unequips them and
 * re-equips them when the form ends). "Its own form" lays nothing.
 *
 * HUANLING SHIFTING (3.651.0; F&F 3.0 block 18 R11 — Graham, 16 October
 * 2026: "As recommended"). A form may also declare —
 *
 *   speeds     { climb, swim, fly, burrow }: those Speeds while in the form
 *   hpBonus    "does … increase HP by 25": added to maximum HP
 *   keepStats  "large in size which does not alter the creature's ability
 *              scores": the size overrides space and reach, while Strength,
 *              Dexterity and base HP are figured at the creature's own size
 *              (the effect carries `statSize`, which actor.mjs reads)
 *   equips     Strikes the form brings: equipped on entering, unequipped on
 *              leaving ("Bite (animal)", "Claw (tiger & eagle)")
 *   grants     abilities the form brings — Pouncing Assault, Scent — made
 *              from core's packs on entering and removed with the effect,
 *              through the granted-item cleanup every spell's grants use
 *
 * and an after-strike may name the forms it fires in (`requiresForm`: the
 * Venom, from the spider and serpent only — declared-after-strikes.mjs).
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
export const CHANGE_SHAPE_FLAG = "changeShapeForm";
const SIZES = Object.freeze(["tiny", "small", "medium", "large", "huge", "gargantuan", "colossal"]);
const MODES = Object.freeze(["climb", "swim", "fly", "burrow"]);
const names = (list) => (Array.isArray(list) ? list : []).map((n) => String(n ?? "").trim()).filter(Boolean);
const lower = (v) => String(v ?? "").trim().toLowerCase();

/** One declared form, normalised; null when it has no key. */
function normaliseForm(raw) {
  if (!raw || typeof raw !== "object" || !String(raw.key ?? "").trim()) return null;
  const speed = Number(raw.speed);
  return {
    key: String(raw.key).trim(),
    label: String(raw.label ?? raw.key).trim(),
    own: raw.own === true,
    speed: Number.isFinite(speed) && speed >= 0 ? Math.trunc(speed) : null,
    size: SIZES.includes(lower(raw.size)) ? lower(raw.size) : "",
    loses: names(raw.loses),
    conditionals: (Array.isArray(raw.conditionals) ? raw.conditionals : []).filter((c) => c && typeof c === "object"),
    speeds: Object.fromEntries(MODES.map((m) => [m, Number(raw.speeds?.[m])]).filter(([, v]) => Number.isFinite(v) && v >= 0).map(([m, v]) => [m, Math.trunc(v)])),
    hpBonus: Math.max(0, Math.trunc(Number(raw.hpBonus) || 0)),
    keepStats: raw.keepStats === true,
    equips: names(raw.equips),
    grants: names(raw.grants),
    // ABILITIES THE FORM SETS ASIDE (3.653.0; block 20 R0a — Graham, 16
    // October 2026: "humanoid forms should lose such things"). A
    // lycanthrope's humanoid form "loses many of its forms abilities": its
    // Scent, Nightvision, Echolocation, Keen Sense and the beast's own moves.
    // Named as printed, or by the name before a bracket ("Scent" is "Scent
    // (35 ft.)").
    suppresses: names(raw.suppresses)
  };
}

/** The forms an action declares; "its own form" first, added if missing. */
export function changeShapeForms(spec) {
  const forms = (Array.isArray(spec?.forms) ? spec.forms : []).map(normaliseForm).filter(Boolean);
  if (!forms.some((f) => f.own)) forms.unshift({ key: "own", label: "Its own form", own: true, speed: null, size: "", loses: [], conditionals: [], speeds: {}, hpBonus: 0, keepStats: false, equips: [], grants: [], suppresses: [] });
  return forms;
}

/**
 * The Active Effect a form lays, or null for the creature's own form.
 * @param {object} form normalised
 * @param {{baseLand: number, itemName?: string}} ctx the creature's own land speed
 */
export function changeShapeEffectData(form, { baseLand = 0, itemName = "Change Shape", baseSpeeds = {}, baseSize = "" } = {}) {
  if (!form || form.own) return null;
  const changes = [];
  if (form.speed !== null) {
    const delta = form.speed - Math.trunc(Number(baseLand) || 0);
    if (delta) changes.push({ key: "system.combat.movement.land.other", type: "custom", value: String(delta), priority: 20 });
  }
  // THE OTHER SPEEDS (3.651.0): the form's Speed less the creature's own.
  for (const [mode, speed] of Object.entries(form.speeds ?? {})) {
    const delta = speed - Math.trunc(Number(baseSpeeds?.[mode]) || 0);
    if (delta) changes.push({ key: `system.combat.movement.${mode}.other`, type: "custom", value: String(delta), priority: 20 });
  }
  if (form.hpBonus > 0) changes.push({ key: "system.resources.hp.other", type: "add", value: String(form.hpBonus), priority: 20 });
  if (form.size) changes.push({ key: "system.identity.size", type: "override", value: form.size, priority: 50 });
  const flags = { [CHANGE_SHAPE_FLAG]: { key: form.key, loses: form.loses, ...(form.equips?.length ? { equips: form.equips } : {}),
    ...(form.size && form.keepStats && SIZES.includes(lower(baseSize)) ? { statSize: lower(baseSize) } : {}) } };
  if (form.conditionals.length) flags.conditionals = form.conditionals.map((c, i) => ({ id: `changeShape:${form.key}:${i}`, ...c }));
  return { name: `${itemName}: ${form.label}`, img: "icons/svg/mystery-man.svg", changes, flags: { [SYSTEM_ID]: flags } };
}

/** The card's sentence for a form. */
export function changeShapeSummary(form, baseLand = 0) {
  if (!form || form.own) return "returns to its own form.";
  const bits = [];
  if (form.speed !== null) bits.push(`Speed ${form.speed} feet${form.speed !== Math.trunc(Number(baseLand) || 0) ? "" : " (unchanged)"}`);
  if (form.size) bits.push(`${form.size.charAt(0).toUpperCase()}${form.size.slice(1)} size`);
  if (form.loses.length) bits.push(`no ${form.loses.join(" or ")} Strikes`);
  for (const [mode, speed] of Object.entries(form.speeds ?? {})) bits.push(`${mode.charAt(0).toUpperCase()}${mode.slice(1)} ${speed} feet`);
  if (form.hpBonus > 0) bits.push(`+${form.hpBonus} HP`);
  if (form.size && form.keepStats) bits.push("its ability scores unchanged");
  if (form.equips?.length) bits.push(`${form.equips.join(" and ")} Strikes`);
  if (form.conditionals.length) bits.push(`gains ${[...new Set(form.conditionals.map((c) => c.label).filter(Boolean))].join(", ")}`);
  if (form.grants?.length) bits.push(`gains ${form.grants.join(", ")}`);
  if (form.suppresses?.length) bits.push(`without ${form.suppresses.join(", ")}`);
  return `assumes the form: <strong>${form.label}</strong>${bits.length ? ` — ${bits.join("; ")}` : ""}.`;
}

/**
 * The creature's abilities and feats a form sets aside: those named, or
 * named with a bracket after the name ("Scent (35 ft.)" for "Scent").
 */
export function suppressedItems(items = [], suppresses = []) {
  const want = (suppresses ?? []).map(lower).filter(Boolean);
  if (!want.length) return [];
  return Array.from(items ?? []).filter((i) => ["ability", "feat"].includes(i?.type) && want.some((w) => {
    const n = lower(i?.name);
    return n === w || n.startsWith(`${w} (`);
  }));
}

/** The size a creature's statistics are figured at: its own while a keep-stats form holds. */
export function statSizeOf(effects = [], size = "") {
  for (const e of Array.from(effects ?? [])) {
    if (e?.disabled) continue;
    const f = e?.flags?.[SYSTEM_ID]?.[CHANGE_SHAPE_FLAG];
    if (f?.statSize && SIZES.includes(f.statSize)) return f.statSize;
  }
  return size;
}

/** The form a creature is in now: its key, or "own". */
export function currentFormKey(effects = []) {
  for (const e of Array.from(effects ?? [])) {
    const f = e?.flags?.[SYSTEM_ID]?.[CHANGE_SHAPE_FLAG];
    if (f?.key && !e?.disabled) return String(f.key);
  }
  return "own";
}

/*
 * THE TOKEN TAKES THE FORM'S SPACE (3.651.1; found live testing 3.651.0 —
 * the Huanling's Large spider stood on a one-square token). Core already
 * measures a Large creature as 2×2 from its size; the drawing now agrees.
 * The footprint is the grid squares a side, as flanking.mjs lists them; the
 * token's own size before the form is kept on the effect and put back.
 */
export function formTokenSize(form, footprints = {}) {
  if (!form || form.own || !form.size) return null;
  const side = Number(footprints[form.size]);
  return Number.isFinite(side) && side > 0 ? side : null;
}
