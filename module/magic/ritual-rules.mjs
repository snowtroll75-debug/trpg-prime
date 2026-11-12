/**
 * A RITUAL'S RULES FROM A SOURCEBOOK (3.679.0; Eldritch Arts Block 2b, D13).
 *
 * The core's Magic Ritual (Chapter 9) is Spellcraft against the casting DC,
 * paid in the primary's PP, capped at Success. Eldritch Arts' Chapter 7 adds:
 *
 *   - THE RITUAL VARIANT: "Any character trained in Arcana (Arcane), Religion
 *     (Divine), Occultism (Ethereal), or Nature (Verdant) may serve as the
 *     primary caster", the PP replaced by a vital, material or communal
 *     sacrifice, and "the Ritual Check uses the primary casters tradition
 *     skill … This check is considered to be Very Hard (DC +5) level-based";
 *   - RITUAL SPELLS, which "ignore the core cap that limits a ritual's result
 *     to Success";
 *   - the goods and feats that move a ritual's DC or count its casters.
 *
 * The rules are the module's; this file asks, in registration order, and
 * cleans the answers. A module that throws costs its own answer, never the
 * ritual — logged, and said on the card.
 */
import { registeredRitualRules } from "../module-api.mjs";

const SEP = ":";

const str = (v) => String(v ?? "").trim();
const num = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/**
 * The other ways to pay, each keyed `<rules key>:<variant key>`.
 * @returns {Promise<Array<{key: string, label: string, hint: string}>>}
 */
export async function ritualVariantsFor(ctx) {
  const out = [];
  for (const { key, spec } of registeredRitualRules()) {
    if (typeof spec.variants !== "function") continue;
    try {
      const list = await spec.variants(ctx);
      for (const v of Array.isArray(list) ? list : []) {
        const vk = str(v?.key);
        const label = str(v?.label);
        if (!vk || !label) continue;
        out.push({ key: `${key}${SEP}${vk}`, label, hint: str(v?.hint) });
      }
    } catch (err) {
      console.error(`TRG Prime | ritual rules "${key}": variants failed`, err);
    }
  }
  return out;
}

/** Every module's extra fields for the ritual dialog, joined. */
export async function ritualFieldsFor(ctx) {
  const parts = [];
  for (const { key, spec } of registeredRitualRules()) {
    if (typeof spec.fields !== "function") continue;
    try {
      const html = await spec.fields(ctx);
      if (typeof html === "string" && html.trim()) parts.push(html);
    } catch (err) {
      console.error(`TRG Prime | ritual rules "${key}": fields failed`, err);
    }
  }
  return parts.join("");
}

/**
 * What the modules make of this ritual once its dialog is answered.
 * `ctx.variant` is the chosen `<rules key>:<variant key>`, or "".
 *
 * @returns {Promise<{variant: string, dc: {value: number, label: string}|null,
 *   skill: {key: string, label: string}|null, dcRows: Array<{label: string, value: number}>,
 *   modifiers: Array<{label: string, value: number, type: string}>, seats: number,
 *   lines: string[], refused: string}>}
 */
export async function prepareRitual(ctx) {
  const chosen = str(ctx?.variant);
  const [owner, own] = chosen.includes(SEP) ? [chosen.slice(0, chosen.indexOf(SEP)), chosen.slice(chosen.indexOf(SEP) + 1)] : ["", ""];
  const out = { variant: "", dc: null, skill: null, dcRows: [], modifiers: [], seats: 0, lines: [], refused: "" };
  for (const { key, spec } of registeredRitualRules()) {
    if (typeof spec.prepare !== "function") continue;
    const mine = key === owner;
    let got;
    try {
      got = await spec.prepare({ ...ctx, variant: mine ? own : "" });
    } catch (err) {
      console.error(`TRG Prime | ritual rules "${key}": prepare failed`, err);
      out.lines.push("<em>A module's ritual rules failed — see the console.</em>");
      // A failing module that OWNS the chosen variant cannot say how it is
      // paid, so the ritual does not go ahead on half an answer.
      if (mine) out.refused = "the ritual's rules failed (see the console)";
      continue;
    }
    if (!got || typeof got !== "object") continue;
    if (typeof got.refused === "string" && got.refused.trim() && !out.refused) out.refused = got.refused.trim();
    if (mine) {
      out.variant = chosen;
      const dcValue = Number(got.dc?.value);
      if (Number.isFinite(dcValue)) out.dc = { value: Math.trunc(dcValue), label: str(got.dc?.label) || "Ritual DC" };
      if (str(got.skill?.key)) out.skill = { key: str(got.skill.key), label: str(got.skill.label) || str(got.skill.key) };
    }
    for (const row of Array.isArray(got.dcRows) ? got.dcRows : []) {
      const value = num(row?.value);
      if (value && str(row?.label)) out.dcRows.push({ label: str(row.label), value });
    }
    for (const row of Array.isArray(got.modifiers) ? got.modifiers : []) {
      const value = num(row?.value);
      if (value && str(row?.label)) out.modifiers.push({ label: str(row.label), value, type: str(row?.type) || "untyped" });
    }
    out.seats += Math.max(0, num(got.seats));
    for (const text of Array.isArray(got.lines) ? got.lines : []) if (str(text)) out.lines.push(str(text));
  }
  // A VARIANT CHOSEN MUST BE ONE SOMEBODY OWNS AND ANSWERED: an unknown key
  // (a module switched off between the dialog and the roll) is not a way to
  // pay, and the ritual would otherwise go ahead free.
  if (chosen && !out.variant && !out.refused) out.refused = `the way of paying chosen (${chosen}) is no longer offered`;
  if (out.variant && (!out.dc || !out.skill) && !out.refused) out.refused = "the ritual variant gave no check to roll";
  return out;
}

/** Does any module lift this ritual's Success cap? */
export async function ritualCapLifted(ctx) {
  for (const { key, spec } of registeredRitualRules()) {
    if (typeof spec.liftsCap !== "function") continue;
    try {
      if ((await spec.liftsCap(ctx)) === true) return true;
    } catch (err) {
      console.error(`TRG Prime | ritual rules "${key}": liftsCap failed`, err);
    }
  }
  return false;
}

/**
 * A RITUAL SPELL'S PARTIAL TAKES EFFECT (3.687.0, H13; Eldritch Arts Block 8b,
 * Graham's Q171: "A Ritual spell's printed Partial takes effect, and no PP is
 * lost"). True when any module's `partialCasts(ctx)` answers true. The core's
 * own rituals (none answers) keep "The spell fails, but no PP is lost".
 */
export async function ritualPartialCasts(ctx) {
  for (const { key, spec } of registeredRitualRules()) {
    if (typeof spec.partialCasts !== "function") continue;
    try {
      if ((await spec.partialCasts(ctx)) === true) return true;
    } catch (err) {
      console.error(`TRG Prime | ritual rules "${key}": partialCasts failed`, err);
    }
  }
  return false;
}

/**
 * A RITUAL PERFORMED BY ITS PRIMARY ALONE (3.687.0, H14; Eldritch Arts Block
 * 8b, Graham's Q172: Elemental Convergence, Essence Reforging and Eternal
 * Invocation print no secondary casters). True when any module's
 * `minSecondaries(ctx)` answers 0. The overcasting room is unchanged — 2 PP a
 * secondary, so none when alone — and the cap per cast stands.
 */
export async function ritualAloneAllowed(ctx) {
  for (const { key, spec } of registeredRitualRules()) {
    if (typeof spec.minSecondaries !== "function") continue;
    try {
      const n = await spec.minSecondaries(ctx);
      if (n !== null && n !== undefined && n !== "" && Number(n) === 0) return true;
    } catch (err) {
      console.error(`TRG Prime | ritual rules "${key}": minSecondaries failed`, err);
    }
  }
  return false;
}

/**
 * The degrees a ritual casts the spell on: Success, or better when the cap is
 * lifted; and a Partial when a module says it takes effect (H13).
 */
export function ritualCasts(degree, { partial = false } = {}) {
  const d = str(degree);
  return ["success", "critical", "heroic"].includes(d) || (partial === true && d === "partial");
}
