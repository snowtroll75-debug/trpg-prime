/**
 * A MODULE'S HAND ON THE FUMBLE AND THE RESONANCE ROLLS (3.684.0; Eldritch
 * Arts Block 6, G5 — the audit's D6, Appendix D's S-M6, Appendix F's S6s-4).
 *
 * The Spell Fumble Table and the Magical Resonance Event table are each a
 * top open-ended percentile, higher is worse, and until this release nothing
 * but the core could lean on either:
 *
 *   - Mana Bound (Adept): "a −20-circumstance modifier to the Fumble result
 *     roll … does not affect Blunders or Chaos results" — on a Spellcraft
 *     check. The flat `spellFumbleModifier` effect flag (Urloch's +10) is
 *     summed for every fumble roll, Blunders and tradition-skill releases
 *     included, so it cannot say this.
 *   - Spell Surge, Spellthread: that cast's "Spell Fumble or Resonance … at
 *     disadvantage" (EA-M20: roll the first percentile twice, keep the
 *     higher; the open-ended continuation is rolled once, as High Magic's
 *     Resonance already is).
 *   - High Magic Resonance (Sorcerer): "you only roll on the resonance table
 *     once" — Graham's Q147, as proposed: it lifts ONLY the disadvantage High
 *     Magic brings. A disadvantage from anything else (Spell Surge) stands,
 *     and Absolute Chaos (UM 66) still rolls twice more.
 *   - Resonance Surge (Sorcerer): "automatically trigger a Resonance Event
 *     (which is resolved after the effects of the spell you cast)" — Q148:
 *     "The forced Resonance is rolled as a High Magic Resonance of that
 *     cast": with that cast's modifiers and, for a High Magic cast, its
 *     disadvantage, and none in a suppression area (the core's suppressors).
 *
 * High Magic Resonance's other half — "the first spell fumble that you make
 * each day as a spell fail", Q147: the first FUMBLE degree each day becomes
 * a Failure automatically and a Blunder is not eased — is NOT this seam. It
 * is a degree, read before the fumble roll is owed, and the core has had the
 * seam for it since 3.678.0: `registerCastDegreeRemap` (magic/cast-hooks.mjs
 * `remapCastDegree`), whose ctx has carried `highMagic` since 3.683.0. The
 * module remaps "fumble" → "failure" once a day and stamps its feat. (A
 * charged item's release check is not remapped; that is a release, not a
 * casting check, and Q147 says nothing of wands.)
 *
 * THE RULES ARE THE MODULE'S; this file asks, in registration order, and
 * cleans the answers. A modifier that throws costs its own answer, never the
 * roll — logged.
 *
 * What a cast says about itself to these rolls (`castFacts`) is carried on
 * the cast's Resonance context, so every Resonance the cast provokes — chaos,
 * a named natural, a critical's 66, the fumble's 66, a forced one — is asked
 * the same way, with the metamagic keys taken and the casting options taken.
 * A metamagic's own `fumbleBias` / `resonanceBias` (Spell Surge's) rides the
 * same channel: the cast declares it there and both rolls read it.
 */
import { registeredFumbleModifiers, registeredResonanceModifiers } from "../module-api.mjs";

const BIASES = Object.freeze(["advantage", "disadvantage"]);
const text = (v) => String(v ?? "").trim();

/** "advantage" | "disadvantage" | "" — a bias as answered, cleaned. Pure. */
export function cleanBias(value) {
  const v = text(value).toLowerCase();
  return BIASES.includes(v) ? v : "";
}

/**
 * The bias left when every source has had its say: any advantage against any
 * disadvantage cancels, as a d20's do; two disadvantages are one. Pure.
 * @param {string[]} biases
 * @returns {"advantage"|"disadvantage"|"normal"}
 */
export function combineBias(biases = []) {
  const list = (Array.isArray(biases) ? biases : []).map(cleanBias);
  const adv = list.includes("advantage");
  const dis = list.includes("disadvantage");
  if (adv && dis) return "normal";
  if (dis) return "disadvantage";
  if (adv) return "advantage";
  return "normal";
}

/**
 * Which of two first percentiles is kept on a table where HIGHER IS WORSE
 * (the Spell Fumble Table, the Resonance Event table): disadvantage the
 * higher, advantage the lower. Pure.
 */
export function keptPercentile(first, second, bias) {
  const a = Number(first) || 0;
  const b = Number(second) || 0;
  if (bias === "disadvantage") return Math.max(a, b);
  if (bias === "advantage") return Math.min(a, b);
  return a;
}

/**
 * WHAT A CAST TELLS ITS FUMBLE AND RESONANCE ROLLS (plain data, so it can
 * ride a Resonance context that is handed on to a critical's roll). Pure.
 * @returns {{spellName: string, spellUuid: string, metamagic: string[], castOptions: string[], fumbleBias: string, resonanceBias: string, innate: boolean, itemCast: boolean, ritual: boolean, stored: boolean}}
 */
export function castFacts({
  spell = null, metamagic = [], castOptions = [], fumbleBias = "", resonanceBias = "",
  innate = false, itemCast = false, ritual = false, stored = false, storedForeign = false
} = {}) {
  const keys = (list) => (Array.isArray(list) ? list : Array.from(list ?? []))
    .map((k) => (typeof k === "string" ? k : text(k?.key)))
    .map(text).filter(Boolean);
  return {
    spellName: text(spell?.name),
    spellUuid: text(spell?.uuid),
    metamagic: keys(metamagic),
    castOptions: keys(castOptions),
    fumbleBias: cleanBias(fumbleBias),
    resonanceBias: cleanBias(resonanceBias),
    innate: Boolean(innate), itemCast: Boolean(itemCast), ritual: Boolean(ritual), stored: Boolean(stored),
    // AN ABSORBED SPELL'S RELEASE (3.684.0, G5 ↔ G16 — review): Runebreaker's.
    storedForeign: Boolean(stored) && Boolean(storedForeign)
  };
}

/** A number answered, or 0. Whole numbers only: the tables are read in whole points. */
function wholeOrZero(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * EVERY FUMBLE MODIFIER'S ANSWER, asked in registration order.
 *
 * `modify(ctx)` is awaited with `{ actor, blunder, pp, tradition, highMagic,
 * check: { type: "spellcraft"|"skill"|"concentration", skill }, ritual,
 * release, stored, storedForeign, metamagic, castOptions, cast }` and answers `{ modifier, bias,
 * label, line }` or null. A cast's own `fumbleBias` joins the biases.
 *
 * @returns {Promise<{modifier: number, bias: string, parts: {label: string, value: number}[], lines: string[]}>}
 */
export async function fumbleModifiersFrom(ctx = {}) {
  const parts = [];
  const biases = [cleanBias(ctx?.cast?.fumbleBias)];
  const lines = [];
  if (ctx?.cast?.fumbleBias) lines.push(`${ctx.cast.spellName || "This cast"}: its fumble is rolled with ${ctx.cast.fumbleBias}.`);
  for (const { key, modify } of registeredFumbleModifiers()) {
    try {
      const out = await modify({ ...ctx });
      if (!out || typeof out !== "object") continue;
      const value = wholeOrZero(out.modifier);
      const label = text(out.label) || key;
      if (value) parts.push({ label, value });
      const bias = cleanBias(out.bias);
      if (bias) biases.push(bias);
      if (text(out.line)) lines.push(text(out.line));
    } catch (err) {
      console.error(`TRG Prime | a module's fumble modifier "${key}" failed`, err);
    }
  }
  return { modifier: parts.reduce((s, p) => s + p.value, 0), bias: combineBias(biases), parts, lines };
}

/**
 * EVERY RESONANCE MODIFIER'S ANSWER AT THE ROLL, asked in registration order.
 *
 * `roll(ctx)` is awaited with `{ actor, reason, highMagic, pp, metamagic,
 * castOptions, cast, modifiers }` and answers `{ modifier, bias, single,
 * label, line }` or null. `single: true` lifts the disadvantage High Magic
 * brings and nothing else (High Magic Resonance). A cast's own
 * `resonanceBias` joins the biases.
 *
 * @returns {Promise<{modifier: number, biases: string[], single: boolean, parts: {label: string, value: number}[], lines: string[]}>}
 */
export async function resonanceModifiersFrom(ctx = {}) {
  const parts = [];
  const biases = [cleanBias(ctx?.cast?.resonanceBias)].filter(Boolean);
  const lines = [];
  let single = false;
  if (ctx?.cast?.resonanceBias) lines.push(`${ctx.cast.spellName || "This cast"}: its Resonance is rolled with ${ctx.cast.resonanceBias}.`);
  for (const { key, roll } of registeredResonanceModifiers()) {
    if (typeof roll !== "function") continue;
    try {
      const out = await roll({ ...ctx });
      if (!out || typeof out !== "object") continue;
      const value = wholeOrZero(out.modifier);
      const label = text(out.label) || key;
      if (value) parts.push({ label, value });
      const bias = cleanBias(out.bias);
      if (bias) biases.push(bias);
      if (out.single === true) single = true;
      if (text(out.line)) lines.push(text(out.line));
    } catch (err) {
      console.error(`TRG Prime | a module's Resonance modifier "${key}" failed`, err);
    }
  }
  return { modifier: parts.reduce((s, p) => s + p.value, 0), biases, single, parts, lines };
}

/**
 * THE BIAS A RESONANCE ROLL IS MADE WITH. Pure.
 *
 * High Magic's disadvantage ("make the roll with disadvantage", 3.678.0) is
 * one source, lifted by `single`; the caller's own `disadvantage` (Absolute
 * Chaos carrying the first roll's) and every module or cast bias are the
 * others.
 */
export function resonanceRollBias({ disadvantage = false, highMagic = false, single = false, biases = [] } = {}) {
  return combineBias([
    disadvantage ? "disadvantage" : "",
    highMagic && !single ? "disadvantage" : "",
    ...(Array.isArray(biases) ? biases : [])
  ]);
}

/**
 * THE RESONANCE EVENTS A CAST FORCES, asked once the spell has resolved
 * (Resonance Surge: "resolved after the effects of the spell you cast").
 *
 * `force(ctx)` is awaited with `{ actor, spell, spellData, degree, cast,
 * highMagic, pp, innate, itemCast, ritual, stored, storedForeign, metamagic,
 * castOptions }` (`cast` is whether the spell went off; `stored` a stored
 * spell's release and `storedForeign` an absorbed one's — 3.684.0, review:
 * Resonance Surge is not spent on a release) and answers `true`, a reason string, or
 * `{ reason, line }` to force one, else null. Each forcing answer is one
 * event, rolled by the core with the cast's own Resonance context.
 *
 * @returns {Promise<{key: string, reason: string, line: string}[]>}
 */
export async function forcedResonancesFrom(ctx = {}) {
  const out = [];
  for (const { key, force } of registeredResonanceModifiers()) {
    if (typeof force !== "function") continue;
    try {
      const answer = await force({ ...ctx });
      if (!answer) continue;
      if (answer === true) out.push({ key, reason: key, line: "" });
      else if (typeof answer === "string" && text(answer)) out.push({ key, reason: text(answer), line: "" });
      else if (typeof answer === "object") out.push({ key, reason: text(answer.reason) || key, line: text(answer.line) });
    } catch (err) {
      console.error(`TRG Prime | a module's forced Resonance "${key}" failed`, err);
    }
  }
  return out;
}
