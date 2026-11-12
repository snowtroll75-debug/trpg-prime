/**
 * A MODULE'S METAMAGIC, AND THE OTHER WAYS A CAST IS PAID FOR (3.684.0;
 * Eldritch Arts Block 6, seams G1–G4 — the Block 6 audit's Appendix D,
 * S-M1, S-M3, S-M4 and S-M11, with Appendices A, B, E and F where their
 * feats name these seams). Graham approved every question as proposed on
 * 4 November 2026 ("proposed except Q89: One release"). Pure; no Foundry.
 *
 * WHAT WAS THERE. The core's metamagic is a hard-coded table
 * (metamagic.mjs `buildMetamagicOptions`): twenty-one feats matched by name,
 * and the held metamagic rods. "No module can add metamagic today. It is a
 * hard-coded table, and item casts get none at all" (the audit's headline).
 * This file is the registry's logic and its arithmetic; the documents half
 * (owned feats, Focus uses, dialogs, the PP pool) is in
 * module-metamagic-workflow.mjs, and the cast reads both.
 *
 * G1 — `registerMetamagic(key, spec)`. An option offered in the Warp? dialog
 * BESIDE the core's, in the same totals: its PP raise the Casting DC, count
 * against the max-PP-per-cast cap and are refunded by degree exactly as the
 * core's are, because they join the same `metamagicPP`. What a spec declares
 * (`normaliseMetamagicSpec`):
 *
 *   feat        the owned feat name(s) that open it; omitted → granted only
 *   label, hint
 *   ppCost      n or (ctx) => n, per application (default 0; never negative —
 *               a discount is `discount`, below, because Q93 rules that a
 *               cheaper spell is cheaper to PAY, not to cast)
 *   max         >1 → the number box, as Selective and Split
 *   choices     [{value, label, ppCost?}] or (ctx) => [...]: a select, as
 *               Imposing Will (Spell Surge's four)
 *   focus       spends one Focus use of the opening feat (Q96: when the cast
 *               pays its PP — Success or better, Failure, Fumble, Blunder; not
 *               a Partial, not a refunded cast; an innate cast when cast).
 *               Offered only while the feat has a use.
 *   kind        "quicken" | "extend": a core kind it IS, so the core's one
 *               Quicken (and one doubling) holds across feat, rod and module
 *   scope       { innate: true, item: true } by default. Never a cantrip and
 *               never a scroll, potion or stored spell (Q94); an item cast
 *               only when the cast's options say `itemMetamagic === true`
 *               (G6's Metamagic Conduit).
 *   preset      true: never offered; applied only when castSpell names it
 *               (`options.metamagic.preset`, S-M4: Subconscious Casting)
 *   payment     "pp" (default); { ap: n, dcAsIfPP: true } — its PP become AP
 *               and, with dcAsIfPP, still count for the Casting DC; or
 *               { resource: { label, cost, available(ctx), pay(ctx) } } — paid
 *               in something else (Spell Weaver's charges), tested before the
 *               cast and paid when the Focus use would be (Q96)
 *   group       an exclusivity group: one option of a group per cast
 *   required    applied without a tick whenever it applies (Wellspring)
 *   needsSpell  true: left out of a catalogue asked with no spell
 *   applies(ctx) → boolean          offer it for this cast?
 *   effects     a static answer, the same shape `apply` returns
 *   apply(ctx)  → answer | { cancel: true }, awaited once it is taken
 *   after(ctx)  → { lines }, awaited once the cast has settled (alias
 *               `onSettled`, the audit's name)
 *
 * THE ANSWER (`cleanMetamagicAnswer`), every key optional — data, not code,
 * wherever the appendix allows:
 *
 *   mods          warp mods, folded into the cast's as a warp's are: dice add,
 *                 numbers add, flags OR, the first text wins
 *   dcDelta, apDelta
 *   discount      { pp, floor } — PP off what is PAID (G4's channel), never the
 *                 DC, cap or save DC (Q93). Spell Weaver's −2 (floor 0),
 *                 Ley-Etched Symbol's −1 (floor 1).
 *   checkBias     "advantage" | "disadvantage" on the casting check (Focused
 *                 Spell; a spell attack's check is its attack, Q111)
 *   addTraits     traits the cast gains for this cast (Pact Channeler)
 *   addedDamage   [{ dice, type, label }] — a new typed pool on each creature
 *                 the spell damages (Pact Channeler's Demonic and Grave)
 *   saveDC        [{ value, type, label }] — typed rows: untyped add, a typed
 *                 bonus keeps the highest of its type (Pulse, Surge, Fey)
 *   targets       { extra: [{ tokenUuid, damageFactor, label }],
 *                   share: [{ tokenUuid }] } — a second creature at half
 *                 damage (Echo, Q75); a recipient for a self-only spell's
 *                 self rows (Resonant Harmony)
 *   rangeFactor, durationFactor, areaFactor   ×1.5 of a parseable printed
 *                 value (Spell Surge, Spell Weaver)
 *   dieStep       every damage die of the cast one size up (d4→…→d12)
 *   fumbleBias, resonanceBias   that cast's Spell Fumble and Resonance rolls
 *                 (G5's channel: declared on the cast, read by those rolls)
 *   savingStep    1: a Heroic pays as a Critical, a Critical as a Success
 *                 (Spellthread's sidebar 15)
 *   basePPAdd     PP counted as BASE, so a Critical's "half base" reads them
 *                 (Spellthread's woven spells, Q126)
 *   freeWarpPP    a warp of up to n PP with no PP and no DC (Resonance Surge)
 *   lines, note   card text
 *
 * G2 — `registerCastPPSource`: another way to pay a cast's PP, the rod draw
 * generalised (`castPPSplit`). G3 — `registerMetamagicPayment`: an option's
 * PP paid in AP while the Casting DC counts them (`metamagicAPPayments`).
 * G4 — `registerCastCostModifier`: PP off what is paid, with a floor
 * (`castDiscount`, `discountedParts`).
 */

import { addDice, steppedDiceFormula } from "./caster-level-mods.mjs";

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);
const whole = (v) => Math.max(0, int(v));
const BIASES = Object.freeze(["advantage", "disadvantage"]);
const DICE_TERM = /^\s*\d+d\d+(\s*[+-]\s*(\d+d\d+|\d+))*\s*$/i;

/**
 * THE CORE'S OWN METAMAGIC IDS (metamagic.mjs). A module key may not take one:
 * `kind` is how a module option says it IS a core kind, and a key that read
 * as a core id would be reported, preset and catalogued as the core's.
 */
const CORE_METAMAGIC_IDS = Object.freeze([
  "aligned", "componentMastery", "distant", "economic", "empower", "extend", "heighten",
  "imposingWill", "intensify", "lingering", "quicken", "reach", "selective", "silent",
  "split", "still", "temporal", "widen"
]);
const CORE_IDS_LOWER = new Set(CORE_METAMAGIC_IDS.map((id) => id.toLowerCase()));

/** The core kinds a module option may BE (so the one-of rules hold). */
const MODULE_METAMAGIC_KINDS =Object.freeze(["quicken", "extend"]);

/** A form-safe id for a key: the dialog names its inputs by it. */
export function metamagicFieldId(key) {
  return text(key).toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
}

/** "advantage" | "disadvantage" | "". */
function cleanMetamagicBias(value) {
  const v = text(value).toLowerCase();
  return BIASES.includes(v) ? v : "";
}

/**
 * Validate and freeze a spec. Returns `{ spec }` or `{ problem }` (the text
 * module-api.mjs reports). Functions stay functions; everything else is
 * cleaned to the shape the cast reads.
 */
export function normaliseMetamagicSpec(key, spec) {
  const k = text(key).toLowerCase();
  if (!k) return { problem: "registerMetamagic: a key is required" };
  if (CORE_IDS_LOWER.has(k)) return { problem: `registerMetamagic: "${key}" is a core metamagic id; use \`kind\` to say an option is that kind` };
  if (!spec || typeof spec !== "object") return { problem: `registerMetamagic: "${key}" needs a spec object` };
  for (const fn of ["applies", "apply", "after", "onSettled"]) {
    if (spec[fn] !== undefined && typeof spec[fn] !== "function") return { problem: `registerMetamagic: "${key}": ${fn} must be a function` };
  }
  if (spec.ppCost !== undefined && typeof spec.ppCost !== "function" && !(Number(spec.ppCost) >= 0)) {
    return { problem: `registerMetamagic: "${key}": ppCost must be a number of 0 or more, or a function (a discount is \`discount\`, Q93)` };
  }
  if (spec.choices !== undefined && typeof spec.choices !== "function" && !Array.isArray(spec.choices)) {
    return { problem: `registerMetamagic: "${key}": choices must be an array or a function` };
  }
  const kind = spec.kind == null || spec.kind === "" ? null : text(spec.kind).toLowerCase();
  if (kind && !MODULE_METAMAGIC_KINDS.includes(kind)) return { problem: `registerMetamagic: "${key}": kind must be one of ${MODULE_METAMAGIC_KINDS.join(", ")}` };
  const payment = normalisePayment(spec.payment);
  if (payment.problem) return { problem: `registerMetamagic: "${key}": ${payment.problem}` };
  const feats = (Array.isArray(spec.feat) ? spec.feat : spec.feat ? [spec.feat] : [])
    .map((f) => text(f)).filter(Boolean);
  const scope = spec.scope && typeof spec.scope === "object" ? spec.scope : {};
  return {
    spec: Object.freeze({
      key: k,
      feats: Object.freeze(feats),
      label: text(spec.label) || feats[0] || k,
      hint: text(spec.hint),
      ppCost: typeof spec.ppCost === "function" ? spec.ppCost : whole(spec.ppCost),
      max: Math.max(1, whole(spec.max) || 1),
      choices: typeof spec.choices === "function" ? spec.choices : (Array.isArray(spec.choices) ? spec.choices.map(cleanChoice).filter(Boolean) : null),
      focus: spec.focus === true,
      kind,
      // Q94: learned and innate casts; an item cast only through G6. Never a
      // cantrip, whatever a spec says: the core offers a cantrip none.
      scope: Object.freeze({ innate: scope.innate !== false, item: scope.item !== false }),
      preset: spec.preset === true,
      payment: payment.value,
      group: text(spec.group).toLowerCase(),
      required: spec.required === true,
      needsSpell: spec.needsSpell === true,
      applies: spec.applies ?? null,
      effects: spec.effects && typeof spec.effects === "object" ? spec.effects : null,
      apply: spec.apply ?? null,
      after: spec.after ?? spec.onSettled ?? null
    })
  };
}

function cleanChoice(c) {
  const value = text(c?.value);
  if (!value) return null;
  return { value, label: text(c.label) || value, ...(c.ppCost !== undefined ? { ppCost: whole(c.ppCost) } : {}) };
}

function normalisePayment(raw) {
  if (raw === undefined || raw === null || raw === "pp") return { value: Object.freeze({ kind: "pp" }) };
  if (raw === "ap") return { value: Object.freeze({ kind: "ap", ap: 1, dcAsIfPP: true }) };
  if (typeof raw !== "object") return { problem: "payment must be \"pp\", { ap, dcAsIfPP } or { resource }" };
  if (raw.resource) {
    const r = raw.resource;
    if (typeof r.available !== "function" || typeof r.pay !== "function") return { problem: "payment.resource needs available(ctx) and pay(ctx) functions" };
    return { value: Object.freeze({ kind: "resource", label: text(r.label) || "resource", cost: typeof r.cost === "function" ? r.cost : Math.max(1, whole(r.cost) || 1), available: r.available, pay: r.pay }) };
  }
  if (raw.ap !== undefined) return { value: Object.freeze({ kind: "ap", ap: Math.max(1, whole(raw.ap) || 1), dcAsIfPP: raw.dcAsIfPP !== false }) };
  return { problem: "payment must be \"pp\", { ap, dcAsIfPP } or { resource }" };
}

/**
 * WHICH CASTS TAKE A MODULE'S METAMAGIC (Q94, as proposed): "Learned and
 * innate casts. Charged items only through Metamagic Conduit. Never scrolls,
 * potions or stored spells. Cantrips no, as the core."
 *
 * A charged-item cast says so through the cast's options,
 * `itemMetamagic === true` (the cross-group contract with G6); a scroll or a
 * potion never does. A stored spell's release carries the warp it was stored
 * with, and a cast being STORED resolves nothing this seam could reach. A
 * threaded spell (S-M11) resolves under the first spell's check and takes
 * none of its own.
 *
 * @returns {{allowed: boolean, kind: "learned"|"innate"|"item"|"", reason: string}}
 */
export function moduleMetamagicScope({ cantrip = false, innateCantrip = false, innate = false, itemCast = false, itemMetamagic = false, stored = false, storing = false, thread = false } = {}) {
  if (cantrip || innateCantrip) return { allowed: false, kind: "", reason: "a cantrip takes no metamagic" };
  if (stored) return { allowed: false, kind: "", reason: "a stored spell carries the warp it was stored with" };
  if (storing) return { allowed: false, kind: "", reason: "a spell being stored resolves later" };
  if (thread) return { allowed: false, kind: "", reason: "a threaded spell resolves under the first spell's casting" };
  if (itemCast) return itemMetamagic === true
    ? { allowed: true, kind: "item", reason: "" }
    : { allowed: false, kind: "", reason: "an item's spell takes no metamagic (Q94)" };
  return { allowed: true, kind: innate ? "innate" : "learned", reason: "" };
}

/**
 * AN ITEM CAST'S CEILING (Q130, Metamagic Conduit: "You cannot increase the
 * total modified PP cost to more than double the item's normal maximum" —
 * proposed and ruled: double the PP the item releases that spell at). G6
 * hands the ceiling as `itemMetamagicCeiling`; with none (0) it is double the
 * release PP. The reason a total over it is refused, or "".
 */
export function itemMetamagicCeilingRefusal({ releasePP = 0, metamagicPP = 0, ceiling = 0 } = {}) {
  const release = whole(releasePP);
  const cap = whole(ceiling) || release * 2;
  const total = release + whole(metamagicPP);
  return total > cap ? `${total} PP in all is more than this item's ${cap} PP ceiling (Metamagic Conduit)` : "";
}

/**
 * THE METAMAGIC PP AN ITEM'S CEILING COUNTS (3.684.0; Eldritch Arts Block 6,
 * G1 with G6 — review, Q130 Low). The ceiling read `ppSpent + basePPAdd`,
 * the PP paid from the pool, so an option paid in AP (G3, Metamagic Adept),
 * in AP by its own spec, or in a module resource (Weave) raised the "total
 * modified PP cost" past double the item's and was let through. Those PP are
 * still the cast's PP for the cap; only who pays them differs. A rod-paid
 * option is 0 PP (its taken `pp` is 0), as R12 prints.
 *
 * @param {object} agg the module aggregate (`appliedModuleMetamagic`)
 * @returns {number}
 */
export function itemCeilingMetamagicPP(agg = {}) {
  const taken = (agg?.taken ?? []).reduce((sum, t) => sum + whole(t?.pp), 0);
  return taken + whole(agg?.basePPAdd);
}

/** Does this entry's scope admit this kind of cast? */
export function scopeAdmits(spec, kind) {
  if (!kind) return false;
  if (kind === "innate") return spec?.scope?.innate !== false;
  if (kind === "item") return spec?.scope?.item !== false;
  return true;
}

/**
 * HOW AN ENTRY IS OPENED for this actor: by an owned feat it names, by an
 * applied effect's `flags.trg-prime.grantedMetamagic` (Metamagic Resonance;
 * the Wild Magic rows "All spells gain the X metamagic feat"), or by a held
 * rod whose `chargedItem.metamagic.kind` names the key (Block 9's Rods of
 * Focused Spell: "expend 2 PP from the rod … does not increase the casting
 * DC … or cost you any PP"). The feat is preferred, since only an owned feat
 * has a Focus use to spend.
 *
 * @param {object} spec normalised
 * @param {{featNames: string[], granted: string[], rods: Array<{kind, itemId, name, cost, maxPP}>}} owned
 * @returns {{source: "feat"|"grant"|"rod", feat?: string, rod?: object}|null}
 */
export function metamagicOpenedBy(spec, { featNames = [], granted = [], rods = [] } = {}) {
  const owned = new Set((featNames ?? []).map((n) => text(n).toLowerCase()));
  const feat = (spec?.feats ?? []).find((f) => owned.has(f.toLowerCase()));
  if (feat) return { source: "feat", feat };
  if ((granted ?? []).map((g) => text(g).toLowerCase()).includes(spec?.key)) return { source: "grant" };
  const rod = (rods ?? []).find((r) => text(r?.kind).toLowerCase() === spec?.key);
  if (rod) return { source: "rod", rod };
  return null;
}

/** The keys an actor's applied effects grant (`grantedMetamagic`). */
export function grantedMetamagicKeys(effects = []) {
  const out = [];
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.["trg-prime"]?.grantedMetamagic;
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const key = text(typeof row === "string" ? row : (row?.key ?? row?.coreId)).toLowerCase();
      if (key && !out.includes(key)) out.push(key);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The Warp? dialog's module section                                    */
/* ------------------------------------------------------------------ */

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[c]);

/**
 * HTML for the module options, under the core's "Metamagic Feats". Each row
 * names its feat (or its grant or rod), so the table can see whose option it
 * is. `payments` (G3) puts a "pay in AP instead" tick on the rows it covers.
 *
 * @param {Array} offers module-metamagic-workflow `offeredModuleMetamagic`
 * @param {Array} payments [{ key, label, ap, optionIds: [field ids] }]
 */
export function buildModuleMetamagicChooser(offers = [], payments = [], { coreShown = false } = {}) {
  if (!Array.isArray(offers) || !offers.length) return "";
  // HIDDEN: a preset-only entry, or one this actor has not opened (it rides
  // along only so a preset may name it).
  const shown = (offers ?? []).filter((o) => !o.hidden && !o.preset);
  const paymentRows = (payments ?? []).filter((p) => (p.optionIds ?? []).some((id) => id.startsWith("x-")));
  if (!shown.length) return "";
  const rows = shown.map((o) => {
    const id = metamagicFieldId(o.key);
    const who = o.source === "rod" ? ` (${esc(o.rodName)}, paid by the rod)` : o.feat ? ` (${esc(o.feat)})` : " (granted)";
    const cost = o.ppCost ? `<strong>+${o.ppCost} PP</strong> — ` : "";
    const focus = o.focus ? " <em>Focus</em>" : "";
    const pay = paymentTick(paymentRows, `x-${id}`);
    const hint = o.hint ? ` <span class="hint">${esc(o.hint)}</span>` : "";
    if (o.required) {
      return `<div class="form-group warp-option"><label><input type="checkbox" checked disabled><input type="hidden" name="mmx-${id}" value="1"><span>${cost}${esc(o.label)}${who}${focus} — applies${hint}</span></label>${pay}</div>`;
    }
    if (Array.isArray(o.choices) && o.choices.length) {
      const opts = o.choices.map((c) => `<option value="${esc(c.value)}">${esc(c.label)}${c.ppCost !== undefined ? ` (+${c.ppCost} PP)` : ""}</option>`).join("");
      return `<div class="form-group warp-option"><label><span>${cost}${esc(o.label)}${who}${focus}${hint}</span>
        <select name="mmx-${id}"><option value="">—</option>${opts}</select></label>${pay}</div>`;
    }
    if (o.max > 1) {
      return `<div class="form-group warp-option"><label><input type="number" name="mmx-${id}" value="0" min="0" max="${o.max}" style="width:3.2em;flex:0 0 3.2em"><span>× ${o.ppCost ? `<strong>+${o.ppCost} PP each</strong> — ` : ""}${esc(o.label)}${who}${focus}${hint}</span></label>${pay}</div>`;
    }
    return `<div class="form-group warp-option"><label><input type="checkbox" name="mmx-${id}" value="1"><span>${cost}${esc(o.label)}${who}${focus}${hint}</span></label>${pay}</div>`;
  }).join("");
  return `${coreShown ? "" : "<hr><p class=\"hint\"><strong>Metamagic Feats</strong> — options your feats open on this spell.</p>"}${rows}`;
}

/** A G3 tick for one option row, or "". */
function paymentTick(payments = [], fieldId = "") {
  const p = (payments ?? []).find((row) => (row.optionIds ?? []).includes(fieldId));
  if (!p) return "";
  return ` <label class="hint"><input type="checkbox" name="mmap-${esc(fieldId)}" value="${esc(p.key)}"> ${esc(p.label)}: pay in ${p.ap} AP instead of the PP</label>`;
}

/** The G3 ticks for the core's rows, appended after the core chooser. */
export function corePaymentTicks(coreOptions = [], payments = []) {
  const rows = (coreOptions ?? []).map((o) => {
    const tick = paymentTick(payments, o.id);
    return tick ? `<div class="form-group warp-option"><span class="hint">${esc(o.label)} —</span>${tick}</div>` : "";
  }).filter(Boolean);
  return rows.length ? `<p class="hint">Paying a feat in actions:</p>${rows.join("")}` : "";
}

/**
 * What was taken, from the form and the presets (S-M4). A preset entry is
 * applied without a tick whether or not it is shown; a `required` one always.
 * @returns {Array<{key, times, choice}>}
 */
export function readModuleMetamagicForm(offers = [], form = {}, presets = []) {
  const taken = [];
  const presetMap = new Map();
  for (const p of Array.isArray(presets) ? presets : []) {
    const key = text(typeof p === "string" ? p : p?.key).toLowerCase();
    if (key) presetMap.set(key, { times: Math.max(1, whole(p?.times) || 1), choice: text(p?.choice) });
  }
  for (const o of offers ?? []) {
    const preset = presetMap.get(o.key);
    if (preset) {
      taken.push({ key: o.key, times: Math.min(o.max ?? 1, preset.times), choice: preset.choice });
      continue;
    }
    if (o.hidden || o.preset) continue;
    const raw = form?.[`mmx-${metamagicFieldId(o.key)}`];
    if (o.required) { taken.push({ key: o.key, times: 1, choice: "" }); continue; }
    if (Array.isArray(o.choices) && o.choices.length) {
      const value = text(raw);
      if (value && o.choices.some((c) => c.value === value)) taken.push({ key: o.key, times: 1, choice: value });
      continue;
    }
    const times = raw === true ? 1 : raw === false || raw == null ? 0 : whole(raw);
    if (times > 0) taken.push({ key: o.key, times: Math.min(o.max ?? 1, times), choice: "" });
  }
  return taken;
}

/** The PP one taken entry costs: its choice's own cost, else ppCost × times. */
export function takenPP(offer, taken) {
  if (taken?.choice && Array.isArray(offer?.choices)) {
    const c = offer.choices.find((row) => row.value === taken.choice);
    if (c && c.ppCost !== undefined) return whole(c.ppCost);
  }
  return whole(offer?.ppCost) * Math.max(1, whole(taken?.times) || 1);
}

/**
 * The PP of every module option taken on a cast (3.684.1; for `castPP` in
 * `apply(ctx)`, Graham's 4 November 2026 Wellspring Conduit ruling): each
 * one's `takenPP`, however it is paid, a rod-paid one at 0 (R12).
 */
export function moduleTakenPP(offers = [], taken = []) {
  return (taken ?? []).reduce((sum, t) => {
    const offer = (offers ?? []).find((o) => o.key === t.key);
    return offer && offer.source !== "rod" ? sum + takenPP(offer, t) : sum;
  }, 0);
}

/**
 * The PP a CORE option costs as ticked (metamagic.mjs's arithmetic, read
 * here for G3 so the core's aggregate is left exactly as it was).
 */
export function coreOptionPP(option, form = {}) {
  if (!option) return 0;
  if (option.kind === "select") {
    const value = text(form?.[`mm-${option.id}`]);
    const c = (option.choices ?? []).find((row) => row.value === value);
    return c ? whole(c.ppCost) : 0;
  }
  const v = form?.[`mm-${option.id}`];
  const times = v === true ? 1 : v === false || v == null ? 0 : whole(v);
  return whole(option.ppCost) * Math.min(times, option.max ?? 1);
}

/**
 * THE CORE OPTIONS TICKED, as the hooks report them (S-M1 "core ids
 * included"): an Elemental Spell row by its kind, a rod's by the feat it
 * applies ("extend", "quicken").
 * @returns {Array<{key, times, choice}>}
 */
export function coreMetamagicTaken(coreOptions = [], form = {}) {
  const out = [];
  for (const o of coreOptions ?? []) {
    const raw = form?.[`mm-${o.id}`];
    const key = o.rodItemId ? String(o.kind ?? o.id) : String(o.id).startsWith("elemental-") ? "elemental" : String(o.id);
    if (o.kind === "select") {
      const value = text(raw);
      if (value && (o.choices ?? []).some((c) => c.value === value)) out.push({ key, times: 1, choice: value });
      continue;
    }
    const times = raw === true ? 1 : raw === false || raw == null ? 0 : Math.min(whole(raw), o.max ?? 1);
    if (times > 0) out.push({ key, times, choice: o.elementalType ?? "" });
  }
  return out;
}

/**
 * G3 — AN OPTION'S PP PAID IN AP (Metamagic Adept: "by expending an
 * additional AP instead of increasing PP cost … the DC to cast the spell is
 * still increased … (as if the additional PP had been expended)"). For each
 * tick the form carries, the option's PP move out of what is paid and into
 * `dcPP` (counted by the Casting DC only: not paid, not capped, not in the
 * save DC; Appendix F's n7 (c)), and its AP join the cast's. A payment's
 * `max` is how many options a cast may pay that way ("any one … to any one
 * spell").
 *
 * @param {object} args
 * @param {Array} args.coreOptions the core's offered options
 * @param {Array} args.offers the module's offered options
 * @param {Array} args.taken readModuleMetamagicForm's answer
 * @param {object} args.form
 * @param {Array} args.payments [{ key, label, ap, dcAsIfPP, max, optionIds }]
 * @returns {{corePP: number, moduleKeys: string[], paymentKeys: string[], dcPP: number, apDelta: number, lines: string[], refusal: string}}
 */
export function metamagicAPPayments({ coreOptions = [], offers = [], taken = [], form = {}, payments = [] } = {}) {
  // `paymentKeys` (3.684.0, G3 — review): the registry keys of the payments
  // TAKEN on this cast, once each, for the cast hooks' `metamagicPayments`
  // (Metamagic Adept is a Flourish: its module must know it was used).
  const out = { corePP: 0, moduleKeys: [], paymentKeys: [], dcPP: 0, apDelta: 0, lines: [], refusal: "" };
  const used = new Map();
  const byField = (id) => (payments ?? []).find((p) => (p.optionIds ?? []).includes(id));
  const charge = (payment, pp, label) => {
    const n = (used.get(payment.key) ?? 0) + 1;
    used.set(payment.key, n);
    if (n === 1) out.paymentKeys.push(payment.key);
    if (n > Math.max(1, whole(payment.max) || 1)) {
      out.refusal = `${payment.label} pays for at most ${Math.max(1, whole(payment.max) || 1)} option${whole(payment.max) > 1 ? "s" : ""} a cast`;
    }
    out.apDelta += Math.max(1, whole(payment.ap) || 1);
    if (payment.dcAsIfPP !== false) out.dcPP += pp;
    out.lines.push(`${label}: paid in ${Math.max(1, whole(payment.ap) || 1)} AP (${payment.label})${payment.dcAsIfPP !== false ? `; the Casting DC still counts its ${pp} PP` : ""}`);
  };
  for (const o of coreOptions ?? []) {
    const pp = coreOptionPP(o, form);
    if (!pp || !form?.[`mmap-${o.id}`]) continue;
    const payment = byField(o.id);
    if (!payment) continue;
    out.corePP += pp;
    charge(payment, pp, o.label);
  }
  for (const t of taken ?? []) {
    const field = `x-${metamagicFieldId(t.key)}`;
    if (!form?.[`mmap-${field}`]) continue;
    const payment = byField(field);
    const offer = (offers ?? []).find((o) => o.key === t.key);
    if (!payment || !offer) continue;
    out.moduleKeys.push(t.key);
    charge(payment, takenPP(offer, t), offer.label);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The aggregate                                                        */
/* ------------------------------------------------------------------ */

/** The empty module aggregate: what a cast with none taken folds in. */
export function emptyModuleMetamagic() {
  return {
    taken: [], keys: [],
    ppSpent: 0, dcPP: 0, apDelta: 0, dcDelta: 0,
    discounts: [], mods: {},
    checkBias: "", addTraits: [], addedDamage: [], saveDCRows: [],
    extra: [], share: [],
    rangeFactor: 1, durationFactor: 1, areaFactor: 1, dieStep: 0,
    fumbleBias: "", resonanceBias: "", savingStep: 0, basePPAdd: 0, freeWarpPP: 0,
    quicken: false, extend: false,
    lines: [], notes: [],
    focus: [], resources: [], after: []
  };
}

/** One apply answer (or a spec's static `effects`), cleaned. */
export function cleanMetamagicAnswer(answer) {
  const a = answer && typeof answer === "object" ? answer : {};
  if (a.cancel === true) return { cancel: true, reason: text(a.reason) };
  const factor = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : 1; };
  const discount = a.discount && typeof a.discount === "object"
    ? { pp: whole(a.discount.pp), floor: a.discount.floor === undefined ? 1 : whole(a.discount.floor), label: text(a.discount.label) }
    : (Number(a.ppDelta) < 0 ? { pp: whole(-Number(a.ppDelta)), floor: a.minPP === undefined ? 1 : whole(a.minPP), label: "" } : null);
  const targets = a.targets && typeof a.targets === "object" ? a.targets : {};
  const uuidOf = (row) => text(row?.tokenUuid ?? row?.uuid ?? row?.actorUuid);
  return {
    mods: a.mods && typeof a.mods === "object" ? { ...a.mods } : {},
    dcDelta: int(a.dcDelta),
    apDelta: int(a.apDelta),
    discount: discount && discount.pp > 0 ? discount : null,
    checkBias: cleanMetamagicBias(a.checkBias),
    addTraits: (Array.isArray(a.addTraits) ? a.addTraits : a.addTraits ? [a.addTraits] : []).map(text).filter(Boolean),
    addedDamage: (Array.isArray(a.addedDamage) ? a.addedDamage : [])
      .map((d) => ({ dice: text(d?.dice), type: text(d?.type).toLowerCase(), label: text(d?.label) }))
      .filter((d) => DICE_TERM.test(d.dice) && d.type),
    saveDC: (Array.isArray(a.saveDC) ? a.saveDC : Number.isFinite(Number(a.saveDC)) && Number(a.saveDC) ? [{ value: a.saveDC }] : [])
      .map((r) => ({ value: int(r?.value), type: text(r?.type).toLowerCase() || "untyped", label: text(r?.label) }))
      .filter((r) => r.value),
    extra: (Array.isArray(targets.extra) ? targets.extra : [])
      .map((r) => ({ tokenUuid: uuidOf(r), damageFactor: Math.min(1, Math.max(0, Number(r?.damageFactor ?? 1))), label: text(r?.label) }))
      .filter((r) => r.tokenUuid),
    share: (Array.isArray(targets.share) ? targets.share : []).map((r) => ({ tokenUuid: uuidOf(r) })).filter((r) => r.tokenUuid),
    rangeFactor: factor(a.rangeFactor),
    durationFactor: factor(a.durationFactor),
    areaFactor: factor(a.areaFactor),
    dieStep: int(a.dieStep),
    fumbleBias: cleanMetamagicBias(a.fumbleBias),
    resonanceBias: cleanMetamagicBias(a.resonanceBias),
    savingStep: Math.min(2, whole(a.savingStep)),
    basePPAdd: whole(a.basePPAdd),
    freeWarpPP: whole(a.freeWarpPP),
    lines: (Array.isArray(a.lines) ? a.lines : a.lines ? [a.lines] : []).map(text).filter(Boolean),
    note: text(a.note)
  };
}

/** Bias sources reconciled as a d20's: advantage against disadvantage is normal. */
export function joinedBias(...biases) {
  const list = biases.flat().map(cleanMetamagicBias);
  const adv = list.includes("advantage");
  const dis = list.includes("disadvantage");
  if (adv && dis) return "normal";
  if (adv) return "advantage";
  if (dis) return "disadvantage";
  return "";
}

/**
 * Fold one taken option into the aggregate.
 * @param {object} agg emptyModuleMetamagic()
 * @param {object} offer the offered option (with spec)
 * @param {{key, times, choice}} taken
 * @param {object} answer cleanMetamagicAnswer(...)
 * @param {{apPaid: boolean, payment: object|null, coreQuickened: boolean, coreExtended: boolean}} opts
 */
export function foldModuleMetamagic(agg, offer, taken, answer, { apPayment = null, coreQuickened = false, coreExtended = false } = {}) {
  const pp = offer.source === "rod" ? 0 : takenPP(offer, taken);
  const label = offer.label;
  agg.taken.push({ key: offer.key, times: taken.times, choice: taken.choice, label, feat: offer.feat ?? "", source: offer.source, pp });
  agg.keys.push(offer.key);
  const pay = offer.spec?.payment ?? { kind: "pp" };
  if (offer.source === "rod") {
    // ROD-PAID: 0 PP and no DC (R12's sentence), the rod's PP spent instead.
    agg.notes.push(`Rod: ${label} (${offer.rodCost} of ${offer.rodName}'s PP)`);
  } else if (apPayment) {
    // G3: paid in AP instead; metamagicAPPayments already counted the AP and dcPP.
    agg.notes.push(`${label} (paid in AP)`);
  } else if (pay.kind === "ap") {
    agg.apDelta += pay.ap * Math.max(1, taken.times || 1);
    if (pay.dcAsIfPP) agg.dcPP += pp;
    agg.notes.push(`+${pay.ap * Math.max(1, taken.times || 1)} AP: ${label}${pay.dcAsIfPP && pp ? ` (the Casting DC counts its ${pp} PP)` : ""}`);
  } else if (pay.kind === "resource") {
    agg.notes.push(`${label} (paid in ${pay.label})`);
  } else {
    agg.ppSpent += pp;
    agg.notes.push(`${pp ? `+${pp} PP: ` : ""}${label}${taken.choice ? ` — ${offer.choices?.find((c) => c.value === taken.choice)?.label ?? taken.choice}` : ""}`);
  }
  if (offer.kind === "quicken") {
    if (!coreQuickened && !agg.quicken) agg.apDelta -= 1;
    agg.quicken = true;
  }
  if (offer.kind === "extend") agg.extend = !coreExtended;
  agg.mods = mergeWarpMods(agg.mods, answer.mods);
  agg.dcDelta += answer.dcDelta;
  agg.apDelta += answer.apDelta;
  if (answer.discount) agg.discounts.push({ ...answer.discount, label: answer.discount.label || label });
  agg.checkBias = joinedBias(agg.checkBias, answer.checkBias) || agg.checkBias;
  for (const t of answer.addTraits) if (!agg.addTraits.some((x) => x.toLowerCase() === t.toLowerCase())) agg.addTraits.push(t);
  agg.addedDamage.push(...answer.addedDamage.map((d) => ({ ...d, label: d.label || label })));
  agg.saveDCRows.push(...answer.saveDC.map((r) => ({ ...r, label: r.label || label })));
  agg.extra.push(...answer.extra.map((r) => ({ ...r, label: r.label || label })));
  agg.share.push(...answer.share);
  agg.rangeFactor *= answer.rangeFactor;
  agg.durationFactor *= answer.durationFactor;
  agg.areaFactor *= answer.areaFactor;
  agg.dieStep += answer.dieStep;
  agg.fumbleBias = joinedBias(agg.fumbleBias, answer.fumbleBias) || agg.fumbleBias;
  agg.resonanceBias = joinedBias(agg.resonanceBias, answer.resonanceBias) || agg.resonanceBias;
  agg.savingStep = Math.max(agg.savingStep, answer.savingStep);
  agg.basePPAdd += answer.basePPAdd;
  agg.freeWarpPP += answer.freeWarpPP;
  agg.lines.push(...answer.lines);
  if (answer.note) agg.notes.push(answer.note);
  return agg;
}

const DICE_KEYS = new Set(["damageDice", "secondaryDice", "healDice", "persistentDice"]);

/**
 * Warp mods folded the way `aggregateWarpSelection` folds them: dice add,
 * numbers add, flags OR, arrays join, and a text (an override) is the first
 * one written — "two that agree until somebody edits one" is avoided by
 * never letting a second purchase silently replace the first.
 */
function mergeWarpMods(into = {}, add = {}) {
  const out = { ...(into ?? {}) };
  for (const [k, v] of Object.entries(add ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    if (DICE_KEYS.has(k)) out[k] = addDice(out[k] ?? "", String(v));
    else if (typeof v === "number") out[k] = (Number(out[k]) || 0) + v;
    else if (typeof v === "boolean") out[k] = Boolean(out[k]) || v;
    else if (Array.isArray(v)) out[k] = [...(Array.isArray(out[k]) ? out[k] : []), ...v];
    else if (out[k] === undefined || out[k] === null || out[k] === "") out[k] = v;
  }
  return out;
}

/**
 * TYPED SAVE DC ROWS (S-M1): "Untyped ones add; typed ones keep the highest
 * per type (the system's stacking)". Spell Surge's +2 is a CLASS bonus and so
 * does not stack with another class bonus to it (Appendix D, n8).
 * @returns {{value: number, labels: string[]}}
 */
function stackedSaveDCRows(rows = []) {
  let untyped = 0;
  const best = new Map();
  const labels = [];
  for (const r of rows ?? []) {
    const value = int(r?.value);
    if (!value) continue;
    const type = text(r?.type).toLowerCase() || "untyped";
    if (type === "untyped" || value < 0) { untyped += value; labels.push(`${value > 0 ? "+" : ""}${value} ${r.label || "metamagic"}`); continue; }
    const prior = best.get(type);
    if (!prior || value > prior.value) best.set(type, { value, label: r.label || "metamagic" });
  }
  for (const [type, r] of best) labels.push(`+${r.value} ${type} (${r.label})`);
  return { value: untyped + [...best.values()].reduce((s, r) => s + r.value, 0), labels };
}

/* ------------------------------------------------------------------ */
/* ×1.5 of range, duration and area; a die step                         */
/* ------------------------------------------------------------------ */

const FEET = /(\d+(?:\.\d+)?)\s*[-\s]?\s*(foot|feet|ft\.?|’|')/i;
const floor5 = (n) => Math.floor(n / 5) * 5;

/**
 * A range ×factor: "30 feet" ×1.5 → "45 feet". Touch, self, sight and
 * unlimited are not numbers and are left alone (null): "range/duration only
 * when numeric and parseable" (Appendix D, Spell Surge).
 */
function scaledRangeText(rangeText, factor) {
  const f = Number(factor);
  if (!(f > 0) || f === 1) return null;
  const m = String(rangeText ?? "").match(FEET);
  if (!m) return null;
  const to = floor5(Number(m[1]) * f);
  if (!(to > 0) || to === Number(m[1])) return null;
  return `${to} feet`;
}

const DOWN = { week: ["day", 7], day: ["hour", 24], hour: ["minute", 60], minute: ["round", 10] };

/**
 * A duration ×factor, written so `parseSpellDuration` reads it first: "1
 * minute" ×1.5 → "15 rounds (1 minute ×1.5)"; "10 minutes" → "15 minutes …".
 * A fraction is carried down a unit (an hour and a half is 90 minutes) and a
 * round is never split. Instantaneous, permanent, sustained, rolled and
 * turn-relative durations are not numbers: null.
 */
function scaledDurationText(durationText, factor) {
  const f = Number(factor);
  const printed = text(durationText);
  if (!(f > 0) || f === 1 || !printed) return null;
  if (/instant|permanent|sustain|\d+\s*d\s*\d+/i.test(printed)) return null;
  const m = printed.match(/(\d+)\s*(round|minute|hour|day|week)s?\b/i);
  if (!m) return null;
  let unit = m[2].toLowerCase();
  let value = Number(m[1]) * f;
  while (!Number.isInteger(value) && DOWN[unit]) { value *= DOWN[unit][1]; unit = DOWN[unit][0]; }
  value = Math.floor(value);
  if (!(value > 0)) return null;
  return `${value} ${unit}${value === 1 ? "" : "s"} (${printed} ×${f})`;
}

/**
 * The feet an area grows by at ×factor, as `areaGrowth` (warp-area.mjs):
 * the first distance printed, its radius or length × factor rounded down to
 * 5 ft (Appendix B's n8: "an area's radius or length is ×1.5 rounded down
 * to 5 ft"). A prose area grows by nothing.
 */
function scaledAreaGrowth(areaText, factor) {
  const f = Number(factor);
  if (!(f > 0) || f === 1) return 0;
  const m = String(areaText ?? "").match(FEET);
  if (!m) return 0;
  const from = Number(m[1]);
  return Math.max(0, floor5(from * f) - from);
}

/*
 * The die step itself lives beside `warpedRowExtra` (caster-level-mods.mjs,
 * `steppedDiceFormula`), which both damage paths and the heal rows read the
 * row through: the fold below sets `warpMods.dieStep` and steps the warp's
 * own dice.
 */

/**
 * The module aggregate folded into the cast's warp mods (S-M1 "applied by the
 * core to a parseable printed value, with the result written into the
 * existing `rangeOverride`, `durationText` and `areaGrowth`"). Mutates and
 * returns `warpMods`. A factor whose channel is already set by a warp or a
 * core feat is not applied — duration changes do not stack (Temporal
 * Extension's "doesn't stack with other duration modifiers") — and says so.
 *
 * @returns {{warpMods: object, lines: string[]}}
 */
export function foldModuleMetamagicMods(warpMods, agg, spellData = {}) {
  const lines = [];
  if (!agg) return { warpMods, lines };
  Object.assign(warpMods, mergeWarpMods(warpMods, agg.mods));
  if (agg.extend && !warpMods.durationText && text(spellData.duration)) {
    warpMods.durationText = `${spellData.duration} ×2 (Extended)`;
  }
  const save = stackedSaveDCRows(agg.saveDCRows);
  if (save.value) {
    warpMods.saveDC = (Number(warpMods.saveDC) || 0) + save.value;
    lines.push(`Save DC ${save.value > 0 ? "+" : ""}${save.value} (${save.labels.join(", ")})`);
  }
  if (agg.rangeFactor !== 1) {
    const to = warpMods.rangeOverride ? null : scaledRangeText(spellData.range, agg.rangeFactor);
    if (to) { warpMods.rangeOverride = to; lines.push(`Range ${spellData.range} → ${to}`); }
    else lines.push(`Range ×${agg.rangeFactor}: ${warpMods.rangeOverride ? "a warp already sets the range" : "the printed range is not a distance"} — not changed`);
  }
  if (agg.durationFactor !== 1) {
    const to = warpMods.durationText ? null : scaledDurationText(spellData.duration, agg.durationFactor);
    if (to) { warpMods.durationText = to; lines.push(`Duration → ${to}`); }
    else lines.push(`Duration ×${agg.durationFactor}: ${warpMods.durationText ? "another duration change already applies (they do not stack)" : "the printed duration is not a number of rounds, minutes or hours"} — not changed`);
  }
  if (agg.areaFactor !== 1) {
    const grow = warpMods.areaOverride ? 0 : scaledAreaGrowth(spellData.area, agg.areaFactor);
    if (grow) { warpMods.areaGrowth = (Number(warpMods.areaGrowth) || 0) + grow; lines.push(`Area ×${agg.areaFactor}: +${grow} ft`); }
    else lines.push(`Area ×${agg.areaFactor}: the printed area has no distance to grow — not changed`);
  }
  if (agg.dieStep) {
    // The row's own dice are stepped where it is read (`warpedRowExtra`).
    warpMods.dieStep = (Number(warpMods.dieStep) || 0) + agg.dieStep;
    for (const k of ["damageDice", "secondaryDice", "healDice"]) {
      if (warpMods[k]) warpMods[k] = steppedDiceFormula(warpMods[k], agg.dieStep);
    }
    lines.push(`Every damage die ${agg.dieStep > 0 ? "up" : "down"} ${Math.abs(agg.dieStep)} size${Math.abs(agg.dieStep) === 1 ? "" : "s"} (a d12 stays a d12)`);
  }
  if (agg.addedDamage.length) {
    warpMods.addedDamage = [...(Array.isArray(warpMods.addedDamage) ? warpMods.addedDamage : []), ...agg.addedDamage];
    lines.push(`Added damage: ${agg.addedDamage.map((d) => `${d.dice} ${d.type} (${d.label})`).join(", ")}, on each creature the spell damages`);
  }
  if (agg.share.length) warpMods.selfRowAlso = [...(Array.isArray(warpMods.selfRowAlso) ? warpMods.selfRowAlso : []), ...agg.share.map((s) => s.tokenUuid)];
  return { warpMods, lines };
}

/** The cast's traits with the module's added ones (Pact Channeler). */
export function withAddedTraits(traits, added = []) {
  const have = String(traits ?? "").split(/[,;]/).map((t) => t.trim()).filter(Boolean);
  const lower = new Set(have.map((t) => t.toLowerCase()));
  for (const t of added ?? []) if (text(t) && !lower.has(text(t).toLowerCase())) { have.push(text(t)); lower.add(text(t).toLowerCase()); }
  return have.join(", ");
}

/* ------------------------------------------------------------------ */
/* Paying                                                               */
/* ------------------------------------------------------------------ */

/**
 * G4 — PP OFF WHAT IS PAID, WITH A FLOOR (Q93: "Payment only. The DC, the cap
 * and the save DC read the PP as cast."). Each discount takes its PP only
 * down to its own floor and never raises a price already below it. They are
 * taken strictest floor first, so a discount that cannot reach 0 works on the
 * full price and one that can (Spell Weaver's min 0) on what is left — the
 * same ordering the free warp and the heritage discount already keep
 * (cast-workflow, Powerful Illusion: "Applied FIRST, so the discount that
 * cannot reach 0 works on what is left").
 *
 * @param {number} totalPP the PP as cast
 * @param {Array<{pp, floor, label}>} discounts
 * @returns {{payable: number, reduction: number, labels: string[]}}
 */
export function castDiscount(totalPP, discounts = []) {
  const price = whole(totalPP);
  let payable = price;
  const labels = [];
  const ordered = (discounts ?? [])
    .map((d) => ({ pp: whole(d?.pp ?? -Number(d?.ppDelta ?? 0)), floor: d?.floor === undefined ? 1 : whole(d.floor), label: text(d?.label) }))
    .filter((d) => d.pp > 0)
    .sort((a, b) => b.floor - a.floor);
  for (const d of ordered) {
    if (payable <= d.floor) continue;
    const next = Math.max(d.floor, payable - d.pp);
    labels.push(`−${payable - next} PP ${d.label || "discount"}${d.floor ? ` (minimum ${d.floor})` : ""}`);
    payable = next;
  }
  return { payable, reduction: price - payable, labels };
}

/**
 * The base and warp a DISCOUNTED price is split by degree from: the
 * reduction comes off the warp first, then the base, so a Critical (half the
 * base, all the warp) keeps the whole of the discount. `castingOutcome` is
 * then asked of these instead of the cast's own parts — for the PAYMENT only.
 */
export function discountedParts(basePP, warpPP, reduction) {
  let base = whole(basePP);
  let warp = whole(warpPP);
  let r = whole(reduction);
  const offWarp = Math.min(warp, r);
  warp -= offWarp; r -= offWarp;
  base = Math.max(0, base - r);
  return { basePP: base, warpPP: warp };
}

/**
 * ECONOMIC SPELL'S AND SIGNATURE SPELL'S PP OFF WHAT IS PAID (3.684.1;
 * Graham, 4 November 2026: "Yes for Economic and Signature spell"). Chapter 5:
 * Economic Spell "lower[s] the PP cost of a spell by up to your caster level
 * (min 1 PP)"; Signature Spell's "total PP cost of the spell is reduced by 1
 * PP". The cast's `totalPP` already holds both (and so the Casting DC, the cap
 * and the save DC read them); the payment did not, because `castingOutcome`
 * is asked of the parts before them. This is those PP — the parts' sum less
 * `totalPP`, after its floor, never negative — and the card's labels, the
 * Signature PP first (Economic "applies last"). The cast joins `cut` to G4's
 * reduction and splits the price by degree through `discountedParts`.
 *
 * @param {number} partsPP base + woven base + warp + metamagic, before either
 * @param {number} totalPP the PP as cast
 * @param {number} [signaturePP] the Signature Spell PP taken (0 or 1)
 * @returns {{cut: number, labels: string[]}}
 */
export function chapter5CostCut(partsPP, totalPP, signaturePP = 0) {
  const cut = Math.max(0, whole(partsPP) - whole(totalPP));
  const signature = Math.min(whole(signaturePP), cut);
  const labels = [
    ...(signature ? [`−${signature} PP Signature Spell`] : []),
    ...(cut - signature ? [`−${cut - signature} PP Economic Spell`] : [])
  ];
  return { cut, labels };
}

/**
 * G2 — WHO PAYS A CAST'S PP when part of it was drawn elsewhere (the rod draw
 * generalised: `rodDrawSplit`). Each source pays what was drawn from it, up to
 * what the degree spends, in the order asked — the rod first, as before —
 * and the caster the rest. So a Partial's smaller spend substitutes less, and
 * a Failure's half is paid from the draws first.
 *
 * @param {number} ppSpent what the degree spends
 * @param {number[]} draws drawn from each source, in order
 * @returns {{shares: number[], caster: number}}
 */
export function castPPSplit(ppSpent, draws = []) {
  let left = whole(ppSpent);
  const shares = (draws ?? []).map((d) => {
    const share = Math.min(left, whole(d));
    left -= share;
    return share;
  });
  return { shares, caster: left };
}

/**
 * Q96 — WHEN A FOCUS METAMAGIC'S USE IS SPENT (and when a resource payment is
 * taken): "When the cast pays its PP: Success or better, Failure, Fumble or
 * Blunder. Not on a Partial, nor on a refunded cast. On an innate cast, when
 * the spell is cast."
 */
export function metamagicPaidOn(degree, { refunded = false, innate = false } = {}) {
  if (refunded) return false;
  if (innate) return true;
  return ["heroic", "critical", "success", "failure", "fumble", "blunder"].includes(text(degree).toLowerCase());
}


/* ------------------------------------------------------------------ */
/* The catalogue                                                        */
/* ------------------------------------------------------------------ */

/**
 * WHAT METAMAGIC A CHARACTER HAS (S-M1's helper): every owned or granted
 * option, core and module, as `{ key, label, ppCost, focus, needsSpell,
 * source }`. Piercing Insight lists it for Sense Magic; Metamagic Resonance
 * reads it for "choose one metamagic feat you possess".
 *
 * @param {Array} coreOptions buildMetamagicOptions' rows (the caller asks it)
 * @param {Array} entries registered specs (normalised)
 * @param {{featNames, granted}} owned
 */
export function metamagicCatalogueOf(coreOptions = [], entries = [], owned = {}, { withSpell = false } = {}) {
  const out = [];
  const seen = new Set();
  for (const o of coreOptions ?? []) {
    const key = String(o.id).startsWith("elemental-") ? "elemental" : String(o.id);
    if (o.rodItemId || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: String(o.label ?? key), ppCost: whole(o.ppCost), focus: false, needsSpell: false, source: "core" });
  }
  for (const spec of entries ?? []) {
    if (spec.preset) continue;
    const opened = metamagicOpenedBy(spec, { ...owned, rods: [] });
    if (!opened) continue;
    if (!withSpell && spec.needsSpell) continue;
    out.push({ key: spec.key, label: spec.label, ppCost: typeof spec.ppCost === "number" ? spec.ppCost : null, focus: spec.focus, needsSpell: spec.needsSpell, source: opened.source === "grant" ? "granted" : "module", feat: opened.feat ?? "" });
  }
  return out;
}

/**
 * Two spells that between them open every core option the actor's feats
 * name, for a catalogue asked with no spell: Distant Spell needs a Self
 * range and Reach Spell any other, so one spell cannot do both.
 */
export const CATALOGUE_PROBE_SPELLS = Object.freeze([
  Object.freeze({ damage: { formula: "2d6", type: "fire" }, baseDamage: "1d6", duration: "1 minute", range: "30 feet", area: "20-foot burst",
    components: { verbal: true, somatic: true, material: true }, traits: "Mental, Composition", defence: "Will", castAP: 2 }),
  Object.freeze({ duration: "1 minute", range: "Self", components: { verbal: true }, castAP: 2 })
]);
