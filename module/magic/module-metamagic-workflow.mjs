/**
 * A MODULE'S METAMAGIC, THE DOCUMENTS HALF (3.684.0; Eldritch Arts Block 6,
 * G1–G4). What the cast workflow asks of the registries: which options this
 * actor may take on this cast (owned feats, granted effects, held rods, a
 * Focus use left), what the taken ones answer, what the cost modifiers and PP
 * sources say, and — once the cast has settled — the Focus uses, the resource
 * payments, the `after` callbacks and the sources' settlements. The rules and
 * the arithmetic are in module-metamagic.mjs; nothing here decides a number.
 *
 * DEFAULT-OFF. With nothing registered every function answers the empty
 * thing at once, and the cast workflow is what it was.
 *
 * A MODULE'S CALLBACK THAT THROWS costs its own answer, never the cast —
 * logged, as the other registries' are (cast-hooks.mjs).
 *
 * `ctx.castPP` IN `apply` (3.684.1) is put together by the cast before any
 * option answers (cast-pp.mjs `metamagicCastPP`), and is NOT the settled
 * cast's `castPP` (`castRiderPP`, G12): it counts options paid in AP (G3 or
 * `payment.kind: "ap"`) or a resource at their PP, which the settled one
 * drops; the settled one adds the Component Savant swap's PP and every
 * `basePPAdd`, which `apply` cannot know; and Signature Spell's −1 follows
 * each one's own count. See the G1 contract in module-api.mjs.
 */
import {
  registeredMetamagic, registeredMetamagicPayments, registeredCastCostModifiers, registeredCastPPSources
} from "../module-api.mjs";
import {
  cleanMetamagicAnswer, emptyModuleMetamagic, foldModuleMetamagic, grantedMetamagicKeys, metamagicFieldId,
  metamagicOpenedBy, scopeAdmits, castDiscount, metamagicPaidOn, metamagicCatalogueOf, CATALOGUE_PROBE_SPELLS, takenPP
} from "./module-metamagic.mjs";

const SYSTEM_ID = "trg-prime";
const whole = (v) => Math.max(0, Math.trunc(Number(v) || 0));
const text = (v) => String(v ?? "").trim();

async function guarded(label, fn, fallback) {
  try {
    return await fn();
  } catch (error) {
    console.error(`TRG Prime | ${label} threw; its answer is ignored`, error);
    return fallback;
  }
}

const featItemsOf = (actor) => Array.from(actor?.items ?? []).filter((i) => i?.type === "feat");
const effectsOf = (actor) => Array.from(actor?.appliedEffects ?? actor?.effects ?? []);

/**
 * The module options this cast offers. `base` is the cast's ctx (see
 * module-api.mjs `registerMetamagic` for its keys) plus `scopeKind` from
 * `moduleMetamagicScope`. Entries not opened for this actor ride along
 * hidden: a preset (S-M4) may still name them.
 * @returns {Promise<Array>}
 */
export async function offeredModuleMetamagic(actor, base = {}) {
  const entries = registeredMetamagic();
  if (!entries.length || !base.scopeKind) return [];
  const feats = featItemsOf(actor);
  const featNames = feats.map((i) => String(i.name ?? ""));
  const granted = grantedMetamagicKeys(effectsOf(actor));
  // LENT TO THIS CREATURE (3.685.0, H9; Metamagic Resonance): opened as a
  // grant is, and marked with its lender and cost factor. See lent-metamagic.mjs.
  const lent = (Array.isArray(base.lent) ? base.lent : []).filter((l) => l && !l.used);
  for (const l of lent) if (!granted.includes(l.key)) granted.push(l.key);
  const { moduleMetamagicRodsOf } = await import("../rod-powers.mjs");
  const rods = moduleMetamagicRodsOf(Array.from(actor?.items ?? []), entries.map((e) => e.key))
    .filter((rod) => whole(base.basePP) <= whole(rod.maxPP));
  const { itemUsesRemaining } = await import("../uses-workflow.mjs");
  const offers = [];
  for (const spec of entries) {
    if (!scopeAdmits(spec, base.scopeKind)) continue;
    const opened = spec.preset ? null : metamagicOpenedBy(spec, { featNames, granted, rods });
    // A PRESET'S OWN FEAT (3.684.0; Eldritch Arts Block 6, G1 — review, Low).
    // `opened` is null for a preset-only entry (it is never offered), so its
    // granting feat was never found and a `focus` preset (Subconscious
    // Casting's) never spent its Focus use. The feat is looked up all the
    // same — owned feats only: a preset is not opened by a grant or a rod —
    // so the Focus test below and the settle's spend reach it.
    const owner = opened ?? (spec.preset ? metamagicOpenedBy(spec, { featNames, granted: [], rods: [] }) : null);
    const item = owner?.source === "feat"
      ? feats.find((i) => String(i.name ?? "").trim().toLowerCase() === owner.feat.toLowerCase()) ?? null
      : null;
    // A FOCUS OPTION IS OFFERED ONLY WHILE ITS FEAT HAS A USE (S-M1), as
    // Dispel's Focus modifier is (C9). A feat with no tracked uses is offered
    // and nothing is spent.
    let focusItemId = "";
    if (spec.focus && item) {
      const left = itemUsesRemaining(item);
      if (Number.isFinite(left) && left <= 0) continue;
      if (Number.isFinite(left)) focusItemId = item.id;
    }
    const ctx = { ...base, actor, item };
    if (spec.applies && !(await guarded(`metamagic "${spec.key}" applies()`, () => spec.applies(ctx), false))) continue;
    const ppCost = typeof spec.ppCost === "function"
      ? whole(await guarded(`metamagic "${spec.key}" ppCost()`, () => spec.ppCost(ctx), 0))
      : whole(spec.ppCost);
    const choices = typeof spec.choices === "function"
      ? (await guarded(`metamagic "${spec.key}" choices()`, () => spec.choices(ctx), []) ?? [])
        .map((c) => ({ value: text(c?.value), label: text(c?.label) || text(c?.value), ...(c?.ppCost !== undefined ? { ppCost: whole(c.ppCost) } : {}) }))
        .filter((c) => c.value)
      : spec.choices;
    offers.push({
      key: spec.key, spec, label: spec.label, hint: spec.hint,
      ppCost: opened?.source === "rod" ? 0 : ppCost,
      max: spec.max, choices: Array.isArray(choices) && choices.length ? choices : null,
      focus: Boolean(focusItemId), focusItemId, itemId: item?.id ?? "",
      feat: owner?.feat ?? "", source: opened?.source ?? "",
      rodItemId: opened?.rod?.itemId ?? "", rodName: opened?.rod?.name ?? "", rodCost: opened?.rod?.cost ?? 0,
      kind: spec.kind, group: spec.group,
      required: Boolean(opened) && spec.required,
      preset: spec.preset,
      hidden: !opened || spec.preset,
      ...(opened?.source === "grant" && lent.some((l) => l.key === spec.key)
        ? { lent: (({ costFactor, label, effectId }) => ({ costFactor, label, effectId }))(lent.find((l) => l.key === spec.key)) }
        : {})
    });
  }
  return offers;
}

/**
 * G3 — the payments that apply to this cast, each with the dialog field ids
 * of the offered options it covers (core ids as they are; module keys as
 * `x-<field id>`).
 */
export async function offeredMetamagicPayments(actor, ctx = {}, { coreIds = [], moduleKeys = [] } = {}) {
  const payments = registeredMetamagicPayments();
  if (!payments.length) return [];
  const out = [];
  for (const p of payments) {
    const optionIds = [];
    for (const name of p.options) {
      const lower = name.toLowerCase();
      for (const id of coreIds) if (String(id).toLowerCase() === lower) optionIds.push(id);
      for (const key of moduleKeys) if (key === lower) optionIds.push(`x-${metamagicFieldId(key)}`);
    }
    if (!optionIds.length) continue;
    if (p.applies && !(await guarded(`metamagic payment "${p.key}" applies()`, () => p.applies({ ...ctx, actor }), false))) continue;
    out.push({ key: p.key, label: p.label, ap: p.ap, dcAsIfPP: p.dcAsIfPP, max: p.max, optionIds });
  }
  return out;
}

/**
 * Fold the taken options. Refuses (rather than trims, as the innate budget
 * does) two options of one group, and a resource the caster cannot pay.
 * @returns {Promise<object>} the aggregate, with `refusal` or `cancelled` set
 *   when the cast must stop
 */
export async function appliedModuleMetamagic(actor, offers = [], taken = [], base = {}, { apKeys = [], coreMM = null } = {}) {
  const agg = emptyModuleMetamagic();
  if (!taken.length) return agg;
  const groups = new Map();
  for (const t of taken) {
    const offer = offers.find((o) => o.key === t.key);
    if (!offer?.group) continue;
    if (groups.has(offer.group)) {
      agg.refusal = `${groups.get(offer.group)} and ${offer.label} cannot both be applied to one spell`;
      return agg;
    }
    groups.set(offer.group, offer.label);
  }
  const takenKeys = taken.map((t) => t.key);
  const featItems = featItemsOf(actor);
  for (const t of taken) {
    const offer = offers.find((o) => o.key === t.key);
    if (!offer) continue;
    const spec = offer.spec;
    const item = offer.itemId ? featItems.find((i) => i.id === offer.itemId) ?? null : null;
    const ctx = { ...base, actor, item, times: t.times, choice: t.choice, taken: takenKeys.filter((k) => k !== t.key) };
    const pay = spec.payment ?? { kind: "pp" };
    if (pay.kind === "resource" && offer.source !== "rod") {
      const amount = typeof pay.cost === "function"
        ? whole(await guarded(`metamagic "${spec.key}" payment cost()`, () => pay.cost(ctx), 1))
        : whole(pay.cost) * Math.max(1, whole(t.times) || 1);
      const available = Number(await guarded(`metamagic "${spec.key}" payment available()`, () => pay.available({ ...ctx, amount }), 0));
      if (!(available >= amount)) {
        agg.refusal = `${offer.label} costs ${amount} ${pay.label}; ${Number.isFinite(available) ? available : 0} available`;
        return agg;
      }
      agg.resources.push({ key: spec.key, label: offer.label, resource: pay.label, amount, pay: pay.pay, ctx });
    }
    const raw = spec.apply
      ? await guarded(`metamagic "${spec.key}" apply()`, () => spec.apply(ctx), null)
      : spec.effects;
    const answer = cleanMetamagicAnswer(raw);
    if (answer.cancel) {
      agg.cancelled = answer.reason || `${offer.label} was not completed`;
      return agg;
    }
    foldModuleMetamagic(agg, offer, t, answer, {
      apPayment: apKeys.includes(t.key),
      coreQuickened: Boolean(coreMM?.quickened),
      coreExtended: Boolean(coreMM?.extend)
    });
    if (offer.focusItemId) agg.focus.push({ itemId: offer.focusItemId, label: offer.label });
    if (offer.source === "rod" && offer.rodItemId) agg.rodSpends = [...(agg.rodSpends ?? []), { itemId: offer.rodItemId, name: offer.rodName, pp: whole(offer.rodCost) }];
    if (spec.after) agg.after.push({ key: spec.key, label: offer.label, after: spec.after, ctx, pp: takenPP(offer, t) });
  }
  return agg;
}

/**
 * G4 — every registered cost modifier asked, with the module options' own
 * `discount`s beside them. Payment only (Q93).
 * @returns {Promise<{payable: number, reduction: number, labels: string[], lines: string[]}>}
 */
export async function castCostDiscount(ctx = {}, extra = []) {
  const modifiers = registeredCastCostModifiers();
  const discounts = [...(extra ?? [])];
  const lines = [];
  for (const { key, modify } of modifiers) {
    const out = await guarded(`cast cost modifier "${key}"`, () => modify(ctx), null);
    if (!out) continue;
    const delta = Math.trunc(Number(out.ppDelta) || 0);
    if (delta < 0) discounts.push({ pp: -delta, floor: out.floor === undefined ? 1 : whole(out.floor), label: text(out.label) || key });
    for (const l of Array.isArray(out.lines) ? out.lines : out.lines ? [out.lines] : []) if (text(l)) lines.push(text(l));
  }
  if (!discounts.length) return { payable: whole(ctx.totalPP), reduction: 0, labels: [], lines };
  return { ...castDiscount(ctx.totalPP, discounts), lines };
}

/**
 * G2 — each registered PP source offered, and the caster asked how much to
 * draw from it, as the rod's draw is asked. Resolves null when a prompt is
 * closed (the cast is abandoned, nothing spent).
 * @returns {Promise<{draws: Array<{key, label, drawn, source}>, total: number}|null>}
 */
export async function askCastPPSources(ctx = {}) {
  const sources = registeredCastPPSources();
  const out = { draws: [], total: 0 };
  if (!sources.length) return out;
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  for (const source of sources) {
    const offer = await guarded(`cast PP source "${source.key}" offer()`, () => source.offer({ ...ctx }), null);
    const max = whole(offer?.max);
    if (!offer || !max) continue;
    const label = text(offer.label) || source.key;
    const owed = Math.max(0, whole(ctx.payable) - whole(ctx.ppPool) - whole(ctx.rodDraw) - out.total);
    const offered = Math.min(max, Math.max(0, whole(ctx.payable) - out.total));
    if (!offered) continue;
    const answer = DialogV2?.prompt ? await DialogV2.prompt({
      window: { title: `${ctx.spell?.name ?? "Spell"} — ${label}` },
      classes: ["trg-prime", "trg-check-dialog"],
      content: `<p>${ctx.spell?.name ?? "The spell"} costs <strong>${whole(ctx.payable)} PP</strong>; you have ${whole(ctx.ppPool)}.</p>`
        + `<div class="form-group"><label>PP to pay by ${label}</label>`
        + `<input type="number" name="draw" value="${Math.min(offered, owed)}" min="0" max="${offered}" step="1"></div>`
        + (offer.hint ? `<p class="hint">${text(offer.hint)}</p>` : "")
        + `<p class="hint">The degree decides what is paid: what is drawn here pays first, the rest from your pool.</p>`,
      ok: {
        label: "Continue",
        callback: (event, button) => {
          const FDE = globalThis.foundry?.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(button.form).object;
        }
      },
      rejectClose: false
    }) : { draw: 0 };
    if (answer === null || answer === undefined) return null;
    const drawn = Math.max(0, Math.min(offered, whole(answer.draw)));
    out.draws.push({ key: source.key, label, drawn, source });
    out.total += drawn;
  }
  return out;
}

/**
 * The end of a cast: the PP sources settled, the Focus uses spent and the
 * resource payments taken (Q96), then each taken option's `after`.
 * @param {Actor} actor
 * @param {object} agg appliedModuleMetamagic's aggregate
 * @param {Array} draws askCastPPSources' draws, with `paid` set
 * @param {object} facts the settled cast: { spell, degree, cast, refunded, innate,
 *   saveDC, innateSaveDC, ... } — spread into every `after(ctx)` and `settle`
 *   (3.684.0: `saveDC` is the cast's own Save DC, as on trgPrimeSpellSettled)
 * @returns {Promise<string[]>} lines for a card of their own
 */
export async function settleModuleMetamagic(actor, agg, draws = [], facts = {}) {
  const lines = [];
  for (const d of draws ?? []) {
    if (!d?.source?.settle) continue;
    const out = await guarded(`cast PP source "${d.key}" settle()`, () => d.source.settle({ actor, ...facts }, { drawn: d.drawn, paid: facts.refunded ? 0 : whole(d.paid) }), null);
    for (const l of Array.isArray(out?.lines) ? out.lines : []) if (text(l)) lines.push(text(l));
  }
  if (!agg?.taken?.length) return lines;
  if (metamagicPaidOn(facts.degree, { refunded: facts.refunded, innate: facts.innate })) {
    const { itemUsesRemaining, usesPoolItem } = await import("../uses-workflow.mjs");
    for (const f of agg.focus ?? []) {
      const item = actor?.items?.get?.(f.itemId) ?? null;
      const left = item ? itemUsesRemaining(item) : null;
      if (!item || !Number.isFinite(left)) continue;
      await (usesPoolItem(item) ?? item).update({ "system.usesValue": Math.max(0, left - 1) });
      lines.push(`${item.name}: its Focus use is spent (${f.label}).`);
    }
    for (const r of agg.resources ?? []) {
      const out = await guarded(`metamagic "${r.key}" payment pay()`, () => r.pay({ ...r.ctx, ...facts, amount: r.amount }), null);
      lines.push(`${r.label}: ${r.amount} ${r.resource} paid.`);
      for (const l of Array.isArray(out?.lines) ? out.lines : []) if (text(l)) lines.push(text(l));
    }
  }
  for (const a of agg.after ?? []) {
    const out = await guarded(`metamagic "${a.key}" after()`, () => a.after({ ...a.ctx, ...facts, pp: a.pp, metamagic: agg.keys }), null);
    for (const l of Array.isArray(out?.lines) ? out.lines : out?.lines ? [out.lines] : []) if (text(l)) lines.push(text(l));
  }
  return lines;
}

/** An actor a token or actor uuid names, or null. */
export function actorFromUuid(uuid) {
  const doc = text(uuid) ? globalThis.fromUuidSync?.(text(uuid)) ?? null : null;
  if (!doc) return null;
  return doc.actor ?? (doc.documentName === "Actor" || doc.type ? doc : null);
}

/**
 * `helpers.metamagicCatalogue(actor, { spell })` (S-M1): every owned or
 * granted option, core and module, as `{ key, label, ppCost, focus,
 * needsSpell, source }`. With a spell the core's options are gated on it, as
 * the Warp? dialog gates them; without one, on two probe spells that open
 * every core feat the actor owns.
 */
export async function metamagicCatalogue(actor, { spell = null } = {}) {
  const { buildMetamagicOptions } = await import("./metamagic.mjs");
  const featNames = featItemsOf(actor).map((i) => String(i.name).trim().toLowerCase());
  const elementalTypes = effectsOf(actor).map((e) => e.getFlag?.(SYSTEM_ID, "elementalSpellType") ?? e.flags?.[SYSTEM_ID]?.elementalSpellType).filter(Boolean);
  const casterLevel = Number(actor?.system?.magic?.casterLevelValue ?? 0);
  const probes = spell?.system
    ? [{ spellData: spell.system, basePP: Math.max(0, Number(spell.system.ppCost ?? 0)), tradition: String(spell.system.tradition ?? actor?.system?.magic?.tradition ?? "") }]
    : CATALOGUE_PROBE_SPELLS.map((spellData) => ({ spellData, basePP: 2, tradition: "divinity" }));
  const core = probes.flatMap((p) => buildMetamagicOptions({
    featNames, elementalTypes: elementalTypes.length ? elementalTypes : (spell ? [] : ["fire"]),
    spellData: p.spellData, basePP: p.basePP, casterLevel, tradition: p.tradition,
    charisma: Number(actor?.system?.attributes?.charisma?.total ?? 0)
  }));
  return metamagicCatalogueOf(core, registeredMetamagic(), { featNames, granted: grantedMetamagicKeys(effectsOf(actor)) }, { withSpell: Boolean(spell) });
}
