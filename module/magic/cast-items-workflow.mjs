/**
 * H19's live half (3.688.0; Eldritch Arts Block 9a): the prompt, the fold, and
 * the spend. See magic/cast-items.mjs for the rules and the contract.
 */
import { registeredCastItemOptions } from "../module-api.mjs";
import {
  castItemKept, castItemPromptHTML, cleanCastItemAnswer, cleanCastItemOffers,
  readCastItemForm, spentQuantity
} from "./cast-items.mjs";
import { emptyModuleMetamagic, foldModuleMetamagic } from "./module-metamagic.mjs";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[c]);

/** Nothing chosen: what a cast with no item reads. */
export function emptyCastItems() {
  return { chosen: [], agg: emptyModuleMetamagic(), checkModifiers: [], attackRows: [], ignoreResistance: [], lines: [] };
}

/**
 * Ask the caster which item of each kind to use, and fold what the chosen
 * ones do. No kind with an offer: no prompt, nothing chosen. A closed prompt
 * cancels the cast (null), as the Casting Conditions prompt's does.
 *
 * @param {Actor} actor
 * @param {object} ctx the cast's facts (cast-workflow.mjs)
 * @returns {Promise<object|null>}
 */
export async function askCastItems(actor, ctx = {}) {
  const out = emptyCastItems();
  const kinds = [];
  const itemOf = (id) => actor?.items?.get?.(id) ?? null;
  for (const { key, spec } of registeredCastItemOptions()) {
    let raw = [];
    try { raw = await spec.offers({ ...ctx, actor }); } catch (err) { console.error(`TRG Prime | cast item "${key}": offers failed`, err); continue; }
    const offers = cleanCastItemOffers(raw, itemOf);
    if (offers.length) kinds.push({ key, label: spec.label, spec, offers });
  }
  if (!kinds.length) return out;
  const DialogV2 = foundry.applications.api.DialogV2;
  const form = await DialogV2.prompt({
    window: { title: `${ctx.spell?.name ?? "Spell"} — ${kinds.map((k) => k.label).join(", ")}` },
    classes: ["trg-prime"],
    content: castItemPromptHTML(kinds, esc),
    ok: {
      label: "Continue",
      callback: (event, button) => {
        const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        return new FDE(button.form).object;
      }
    },
    rejectClose: false
  });
  if (form === null || form === undefined) return null;
  for (const pick of readCastItemForm(kinds, form)) {
    const kind = kinds.find((k) => k.key === pick.key);
    const item = itemOf(pick.offer.itemId);
    let answer;
    try {
      answer = cleanCastItemAnswer(await kind.spec.apply({ ...ctx, actor, item, offer: pick.offer }));
    } catch (err) {
      console.error(`TRG Prime | cast item "${pick.key}": apply failed`, err);
      out.lines.push(`<em>${esc(pick.offer.label)}: a module's item failed — see the console. It is not spent.</em>`);
      continue;
    }
    if (answer.cancel) {
      ui.notifications?.warn?.(`${ctx.spell?.name ?? "Spell"}: ${answer.reason || `${pick.offer.label} cannot be used`}.`);
      return null;
    }
    const label = pick.offer.label;
    foldModuleMetamagic(out.agg, { key: `item:${pick.key}`, label, source: "item", spec: { payment: { kind: "pp" } } }, { times: 1 }, answer);
    out.checkModifiers.push(...answer.checkModifiers.map((m) => ({ ...m, label: m.label || label })));
    if (answer.attack) out.attackRows.push({ label, value: answer.attack, type: answer.attackType });
    for (const t of answer.ignoreResistance) if (!out.ignoreResistance.includes(t)) out.ignoreResistance.push(t);
    out.chosen.push({ key: pick.key, kindLabel: pick.label, spec: kind.spec, offer: pick.offer, itemId: pick.offer.itemId, itemName: item?.name ?? label });
  }
  // THE AGGREGATE'S BOOKKEEPING IS NOT A METAMAGIC'S: no PP, no keys reported
  // as metamagic. Only its effects are read (cast-workflow.mjs).
  out.agg.taken = [];
  out.agg.keys = [];
  out.agg.notes = [];
  out.lines.push(...out.chosen.map((c) => `<strong>${esc(c.kindLabel)}:</strong> ${esc(c.offer.label)}.`), ...out.agg.lines);
  out.agg.lines = [];
  return out;
}

/**
 * Once the cast has settled: each chosen item's `settle`, then the spend.
 * Returns the lines for the card and what happened to each, for
 * `trgPrimeSpellSettled`.
 *
 * @returns {Promise<{lines: string[], report: Array<{key, itemId, itemName, kept}>}>}
 */
export async function settleCastItems(actor, castItems, facts = {}) {
  const lines = [];
  const report = [];
  // ONCE (3.688.1): a ritual hands its items to the cast, and settles them
  // itself only when the cast did not.
  if (!castItems || castItems.settled) return { lines, report };
  castItems.settled = true;
  // A REFUNDED CAST (its area's placement cancelled: PP and AP given back)
  // was called off, not cast: nothing was used, so nothing is settled or spent.
  if (facts.refunded) {
    for (const c of castItems?.chosen ?? []) {
      lines.push(`${esc(c.itemName)} is not spent: the cast was called off.`);
      report.push({ key: c.key, itemId: c.itemId, itemName: c.itemName, kept: true });
    }
    return { lines, report };
  }
  for (const c of castItems?.chosen ?? []) {
    let answer = {};
    try {
      answer = (await c.spec.settle?.({ ...facts, actor, item: actor?.items?.get?.(c.itemId) ?? null, offer: c.offer })) ?? {};
    } catch (err) {
      console.error(`TRG Prime | cast item "${c.key}": settle failed`, err);
      lines.push(`<em>${esc(c.itemName)}: a module's settle step failed — see the console.</em>`);
    }
    for (const t of Array.isArray(answer?.lines) ? answer.lines : []) if (String(t ?? "").trim()) lines.push(String(t));
    const kept = castItemKept(c.offer, answer);
    if (!kept) {
      const item = actor?.items?.get?.(c.itemId) ?? null;
      if (item) {
        const next = spentQuantity(item);
        if (next === null) await item.delete();
        else await item.update({ "system.quantity": next });
      }
      lines.push(`${esc(c.itemName)} is spent.`);
    }
    report.push({ key: c.key, itemId: c.itemId, itemName: c.itemName, kept });
  }
  return { lines, report };
}
