/**
 * AN ITEM A MODULE OFFERS AT THE CAST (3.688.0; Eldritch Arts Block 9a, H19 —
 * the audit's D3, Graham's Q186–Q192, "Go with your recommendation", 13
 * November 2026).
 *
 * Eldritch Arts' catalysts: "A catalyst may be invoked when declaring a spell,
 * before the Spellcraft check is rolled" (Chapter 6); "consumed immediately
 * upon use, whether the spell succeeds or fails"; "A spellcaster may use only
 * one catalyst per spell". The core's reagents (reagents.mjs) are the same
 * kind of thing, but they are five fixed effects with no backlash, and
 * nothing in them asks a module.
 *
 * A module registers a KIND of item (`registerCastItemOption(key, spec)`):
 *
 *   label           the choice's name on the prompt ("Catalyst")
 *   offers(ctx)     the caster's items this cast may use: [{ itemId, label,
 *                   hint, consume }] (`consume: false`: an item that is not
 *                   spent — an embedded catalyst's daily use)
 *   apply(ctx)      what the chosen one does, in the module metamagic's own
 *                   answer vocabulary (module-metamagic.mjs
 *                   `cleanMetamagicAnswer`), cut to what an item may do:
 *                     mods, checkBias, discount, addTraits, addedDamage,
 *                     saveDC, rangeFactor, durationFactor, areaFactor,
 *                     dieStep, lines, note
 *                   and three of its own:
 *                     checkModifiers [{label, value, type}]  on the casting check
 *                     attack n (attackType)                   on the spell attack only
 *                     ignoreResistance [types]                the cast's damage of those types
 *   settle(ctx)     awaited once the cast has settled, with its degree:
 *                   answers { keep, lines }. The core spends one of the item
 *                   unless `keep` is true or the offer said `consume: false`.
 *
 * ONE PER KIND (L5230), chosen on a prompt of its own before the cost test,
 * so a PP discount (Resonant Crystal Shard) reaches the payment and the rest
 * reach the casting check, the warp channel and the damage exactly as a
 * module metamagic's do. What a kind's item is, and what it does, is the
 * module's; nothing below names a catalyst.
 */
import { cleanMetamagicAnswer } from "./module-metamagic.mjs";

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);

/** The answer keys an item may give; anything else a module answers is dropped. */
const CAST_ITEM_ANSWER_KEYS = Object.freeze([
  "mods", "checkBias", "discount", "addTraits", "addedDamage", "saveDC",
  "rangeFactor", "durationFactor", "areaFactor", "dieStep", "lines", "note",
  "checkModifiers", "attack", "attackType", "ignoreResistance"
]);

/** The form field a kind's choice carries. */
const castItemField = (key) => `castItem-${String(key).replace(/[^a-z0-9_-]/gi, "_")}`;

/**
 * One kind's offers, cleaned against the caster's items: an offer must name
 * an item the caster holds, and one that is spent must have one left.
 * Duplicates (the same item twice) keep the first.
 *
 * @param {Array} raw what `offers(ctx)` answered
 * @param {(id: string) => object|null} itemOf the caster's item by id
 * @returns {Array<{itemId: string, label: string, hint: string, consume: boolean}>}
 */
export function cleanCastItemOffers(raw, itemOf) {
  const out = [];
  const seen = new Set();
  for (const o of Array.isArray(raw) ? raw : []) {
    const itemId = text(o?.itemId);
    // A SLOT IN ONE ITEM (3.689.0, H21; Eldritch Arts' Catalyst rune: "You can
    // imbed an amount of catalysts" in one shield): one offer per item and
    // slot, the slot handed back to the module's apply and settle.
    const slot = text(o?.slot);
    const seenKey = slot ? `${itemId}#${slot}` : itemId;
    if (!itemId || seen.has(seenKey)) continue;
    const item = typeof itemOf === "function" ? itemOf(itemId) : null;
    if (!item) continue;
    const consume = o?.consume !== false;
    if (consume && Number(item.system?.quantity ?? 1) <= 0) continue;
    seen.add(seenKey);
    out.push({ itemId, label: text(o?.label) || text(item.name), hint: text(o?.hint), consume, ...(slot ? { slot } : {}) });
  }
  return out;
}

/**
 * The chosen item's answer, cleaned: the metamagic answer's own keys through
 * `cleanMetamagicAnswer` (so they fold as a metamagic's do), with the keys an
 * item may not give left out, and the three of its own.
 */
export function cleanCastItemAnswer(answer) {
  const a = answer && typeof answer === "object" ? answer : {};
  if (a.cancel === true) return { cancel: true, reason: text(a.reason) };
  const kept = {};
  for (const k of CAST_ITEM_ANSWER_KEYS) if (a[k] !== undefined) kept[k] = a[k];
  // An item raises no Casting DC, costs no AP of its own and widens no
  // saving step: those are a metamagic's, bought with PP. Only the keys above
  // reach `cleanMetamagicAnswer`, so the rest come out as its zeroes.
  const base = cleanMetamagicAnswer(kept);
  base.checkModifiers = (Array.isArray(a.checkModifiers) ? a.checkModifiers : [])
    .map((m) => ({ label: text(m?.label), value: int(m?.value), type: text(m?.type).toLowerCase() || "item" }))
    .filter((m) => m.value);
  base.attack = int(a.attack);
  base.attackType = text(a.attackType).toLowerCase() || "item";
  base.ignoreResistance = (Array.isArray(a.ignoreResistance) ? a.ignoreResistance : a.ignoreResistance ? [a.ignoreResistance] : [])
    .map((t) => text(t).toLowerCase()).filter(Boolean);
  return base;
}

/** An offer's value on the prompt: its item, and its slot when it has one (3.689.0). */
function castItemOfferValue(offer) {
  const slot = text(offer?.slot);
  return slot ? `${text(offer?.itemId)}#${slot}` : text(offer?.itemId);
}

/** Which offer of each kind was chosen on the prompt's form; "" (none) is no choice. */
export function readCastItemForm(kinds = [], form = {}) {
  const out = [];
  for (const kind of kinds ?? []) {
    const id = text(form?.[castItemField(kind.key)]);
    if (!id) continue;
    const offer = (kind.offers ?? []).find((o) => castItemOfferValue(o) === id);
    if (offer) out.push({ key: kind.key, label: kind.label, offer });
  }
  return out;
}

/** The prompt's body: one choice per kind, "None" first and default. */
export function castItemPromptHTML(kinds = [], esc = (s) => String(s)) {
  const rows = (kinds ?? []).map((kind) => {
    const opts = [`<option value="" selected>None</option>`,
      ...kind.offers.map((o) => `<option value="${esc(castItemOfferValue(o))}">${esc(o.label)}${o.hint ? ` — ${esc(o.hint)}` : ""}</option>`)];
    return `<div class="form-group"><label>${esc(kind.label)}</label><select name="${esc(castItemField(kind.key))}">${opts.join("")}</select></div>`;
  });
  return `<div class="trg-prime trg-check-dialog">${rows.join("")}<p class="hint">One of each, declared before the Spellcraft check is rolled.</p></div>`;
}

/**
 * What one settle answer says: keep the item, and the lines to post. A
 * `consume: false` offer is kept whatever the answer.
 */
export function castItemKept(offer, answer) {
  return offer?.consume === false || answer?.keep === true;
}

/** The quantity update that spends one: null deletes the item. */
export function spentQuantity(item) {
  const q = Math.max(0, Math.floor(Number(item?.system?.quantity ?? 1)));
  return q <= 1 ? null : q - 1;
}
