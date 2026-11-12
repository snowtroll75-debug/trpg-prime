/**
 * WHAT A MODULE CHANGES ABOUT A DISPEL (3.683.0; Eldritch Arts Block 5, D10,
 * seam C9). Graham's Q63, Q67, Q84, Q85 and Q88.
 *
 * Page 91's Dispel is one fixed shape: declare up to your per-cast PP, roll
 * Power Manipulation as a counteract check (±2 per level or PP of difference),
 * pay the PP, half on a Critical or a Partial. Six of Eldritch Arts' feats
 * change a piece of it:
 *
 *   Resonant Ascendance  "Regardless of the outcome, you only expend half of
 *                        the normal PP" — a PP factor (Q63: half the declared
 *                        PP, rounded up, whatever the degree).
 *   Runebreaker          "it costs you 2 PP less (min 1)" — a PP reduction.
 *   Dispel Power         "without expending PP. You replace the PP cost with
 *                        your caster level … Very Hard (DC +5) … the Focus
 *                        trait", with its own Critical/Success/Failure/Fumble
 *                        (Q84) — a replacement, a difficulty, a ladder, a use.
 *   Threadbreaker's Precision  "+2 racial bonus to the Dispel check …
 *                        if you successfully counter a spell, the caster is
 *                        also Dazed 1" (Q67) — a modifier, and a rider.
 *   Mirrored Rebuke      a counter's Success reflects the spell (Q85) — a rider.
 *   Glyph Shatter        a Success may fracture the effect — a rider.
 *
 * `registerDispelModifier(key, { offer(ctx), onResult(ctx) })` (module-api.mjs).
 * `offer` is asked before the Dispel prompt and answers what the modifier
 * does as DATA, or null. The answers travel with the Dispel's setup, which is
 * plain data a resumed card stores (the GM may set the DC after the roll), so
 * nothing here holds a function or a document past the prompt.
 *
 * The rules of the arithmetic are this file's; which feat applies when is the
 * module's. Pure, except the two awaited askers at the bottom, which read the
 * registry and catch what a module throws (a module that throws costs its own
 * modifier, never the Dispel).
 */
import { registeredDispelModifiers } from "../module-api.mjs";
import { DIFFICULTIES } from "../dice/resolution.mjs";

const OUTCOME_KEYS = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
const SUCCESSES = Object.freeze(["heroic", "critical", "success"]);
const str = (v) => String(v ?? "").trim();
const int = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};
const difficultyIndex = (key) => DIFFICULTIES.findIndex((d) => d.key === key);

/**
 * One module's answer, cleaned. Null when it offers nothing (no label).
 *
 * @param {string} key the registered key
 * @param {object|null} raw what `offer(ctx)` answered
 * @returns {object|null}
 */
function normaliseDispelOffer(key, raw) {
  if (!raw || typeof raw !== "object" || !str(raw.label)) return null;
  const factor = Number(raw.ppFactor);
  // A REPLACEMENT IS A NUMBER OR NOTHING: an unreadable one must not become a
  // free Dispel at a counteract value of 0.
  const replace = raw.ppReplace === null || raw.ppReplace === undefined || raw.ppReplace === ""
    || !Number.isFinite(Number(raw.ppReplace)) ? null : int(raw.ppReplace);
  const difficulty = str(raw.difficulty);
  let outcomes = null;
  if (raw.outcomes && typeof raw.outcomes === "object") {
    const rows = Object.fromEntries(OUTCOME_KEYS.map((k) => [k, str(raw.outcomes[k])]));
    if (Object.values(rows).some(Boolean)) outcomes = rows;
  }
  return {
    key: str(key).toLowerCase(),
    label: str(raw.label),
    hint: str(raw.hint),
    // A TICK THE PLAYER MAY LEAVE, or applied with a line on the prompt.
    optional: raw.optional === true,
    // (0, 1): a fraction of the PP paid. Anything else is not a factor.
    ppFactor: Number.isFinite(factor) && factor > 0 && factor < 1 ? factor : null,
    ppReduction: Math.max(0, int(raw.ppReduction)),
    ppReplace: replace === null ? null : Math.max(0, replace),
    difficulty: difficultyIndex(difficulty) >= 0 && !DIFFICULTIES[difficultyIndex(difficulty)].auto ? difficulty : "",
    outcomes,
    focus: raw.focus === true,
    focusItemId: raw.focus === true ? str(raw.itemId ?? raw.item?.id) : "",
    modifiers: (Array.isArray(raw.modifiers) ? raw.modifiers : [])
      .map((m) => ({ label: str(m?.label) || str(raw.label), value: int(m?.value), type: str(m?.type) || "untyped" }))
      .filter((m) => m.value),
    // A BIAS ON THE CHECK (3.685.0; found checking Eldritch Arts Block 7:
    // Eaog Balls, "any attempt to dispel the spell are made with
    // disadvantage"). "advantage" or "disadvantage"; joined with the check's
    // other biases, so the two cancel.
    bias: ["advantage", "disadvantage"].includes(str(raw.bias).toLowerCase()) ? str(raw.bias).toLowerCase() : ""
  };
}

/**
 * Which offers apply: every one that is not optional, and the optional ones
 * ticked. Unavailable offers (a spent Focus use) never apply.
 *
 * @param {Array<object>} offers normalised offers
 * @param {string[]} taken the keys ticked on the prompt
 * @returns {Array<object>}
 */
export function appliedDispelOffers(offers = [], taken = []) {
  const ticked = new Set((taken ?? []).map((k) => str(k).toLowerCase()));
  return (offers ?? []).filter((o) => o && !o.unavailable && (!o.optional || ticked.has(o.key)));
}

/**
 * The applied offers as ONE setup, plain data, merged into the Dispel's:
 *
 *   ppFactor     the smallest factor (two halves are not a quarter, Q63's
 *                spirit: the cheapest single reading, not a product);
 *   ppReduction  summed (Runebreaker's −2 beside another's);
 *   ppReplace    the highest replacement, or null;
 *   difficulty   the hardest step any applied offer names, or "";
 *   outcomes     the first applied offer's own ladder, or null;
 *   focusItemIds the items whose Focus use the Dispel spends;
 *   modifiers    every row, for the check.
 *
 * @param {Array<object>} applied from `appliedDispelOffers`
 * @returns {object}
 */
export function combinedDispelModifiers(applied = []) {
  const list = (applied ?? []).filter(Boolean);
  const factors = list.map((o) => o.ppFactor).filter((f) => f !== null && f !== undefined);
  const replaces = list.map((o) => o.ppReplace).filter((r) => r !== null && r !== undefined);
  const hardest = list.map((o) => o.difficulty).filter(Boolean)
    .sort((a, b) => difficultyIndex(b) - difficultyIndex(a))[0] ?? "";
  return {
    modifierKeys: list.map((o) => o.key),
    modifierLabels: list.map((o) => o.label),
    ppFactor: factors.length ? Math.min(...factors) : null,
    ppReduction: list.reduce((n, o) => n + Math.max(0, int(o.ppReduction)), 0),
    ppReplace: replaces.length ? Math.max(...replaces) : null,
    difficulty: hardest,
    outcomes: list.find((o) => o.outcomes)?.outcomes ?? null,
    focusItemIds: [...new Set(list.filter((o) => o.focus && o.focusItemId).map((o) => o.focusItemId))],
    modifiers: list.flatMap((o) => o.modifiers ?? []),
    // EVERY APPLIED BIAS (3.685.0), each joined by the roll's own reconciliation.
    biases: list.map((o) => o.bias).filter(Boolean)
  };
}

/**
 * The value the counteract check compares: the PP declared, or what a
 * replacement puts in its place (Dispel Power: the caster level).
 *
 * @param {object} setup the Dispel's setup
 * @returns {number}
 */
export function dispelCounteractValue(setup = {}) {
  const replace = setup?.ppReplace;
  return replace !== null && replace !== undefined && Number.isFinite(Number(replace))
    ? Math.max(0, int(replace))
    : Math.max(0, int(setup?.pp));
}

/**
 * The PP a Dispel actually costs, and the label the pool's card gives it.
 *
 * Page 91: the PP declared, "only expend half the PP" on a Critical and a
 * Partial, ROUNDED UP (a 1 PP Dispel still costs 1; action-workflow.mjs has
 * said why since 3.565.0). Then, in order:
 *
 *   - A REPLACEMENT spends nothing: "without expending PP" (Dispel Power).
 *   - A REDUCTION comes off what is declared, never below 1: "it costs you
 *     2 PP less (min 1)" (Runebreaker).
 *   - A FACTOR is a fraction of that, rounded up as Dispel rounds, WHATEVER
 *     THE DEGREE (Q63: "Half the declared PP, rounded up, whatever the
 *     degree"). The degree's own half does not compound with it: the cheaper
 *     of the two is paid, so a Critical under Resonant Ascendance costs half,
 *     not a quarter.
 *   - AN OWN LADDER replaces "the usual Dispel results", and the half PP was
 *     one of them: under it the degree halves nothing.
 *
 * The PP DECLARED for the counteract check is untouched by all but the
 * replacement (`dispelCounteractValue`).
 *
 * @param {string} degree the Dispel's resolved degree
 * @param {object} setup `{ pp, ppFactor, ppReduction, ppReplace, outcomes, modifierLabels }`
 * @returns {{pp: number, label: string}}
 */
export function dispelPPPaid(degree, setup = {}) {
  const declared = Math.max(0, int(setup?.pp));
  const named = (setup?.modifierLabels ?? []).filter(Boolean).join(", ");
  const by = named ? ` (${named})` : "";
  const replace = setup?.ppReplace;
  if (replace !== null && replace !== undefined && Number.isFinite(Number(replace))) {
    return { pp: 0, label: `Dispel${by} — no PP` };
  }
  const reduction = Math.max(0, int(setup?.ppReduction));
  const base = reduction > 0 && declared > 0 ? Math.max(1, declared - reduction) : declared;
  const halves = !setup?.outcomes && (degree === "critical" || degree === "partial");
  const own = halves ? Math.ceil(base / 2) : base;
  const factor = Number(setup?.ppFactor);
  const factored = Number.isFinite(factor) && factor > 0 && factor < 1 ? Math.ceil(base * factor) : null;
  if (factored !== null && factored < own) {
    return { pp: factored, label: `Dispel${by} — ${factor === 0.5 ? "half" : `${Math.round(factor * 100)}%`} of ${base === declared ? declared : `${base} (${declared} less ${declared - base})`}` };
  }
  if (halves) return { pp: own, label: `Dispel${by} — half of ${base === declared ? declared : `${base} (${declared} less ${declared - base})`}` };
  if (base !== declared) return { pp: base, label: `Dispel${by} — ${declared} less ${declared - base}` };
  return { pp: base, label: named ? `Dispel${by}` : "Dispel" };
}

/**
 * The Dispel action with an own ladder in place of page 91's results, or the
 * action as it came. Read twice — when the roll is made (its banner) and when
 * the outcome lands (a card the GM resumes rebuilds the action from the
 * table, and the ladder rides the stored setup). Rungs the ladder does not
 * print fall back as every action's do (`declaredDegree`; m42).
 *
 * @param {object} action
 * @param {object|null} setup the Dispel's setup
 * @returns {object}
 */
export function dispelActionWithLadder(action, setup) {
  if (action?.key !== "dispel" || !setup?.outcomes || typeof setup.outcomes !== "object") return action;
  return { ...action, outcomes: { ...setup.outcomes } };
}

/**
 * A request as plain data, or null: what a stored card can carry. A function
 * is dropped, a document becomes its own data (its `toJSON`), and a request
 * that cannot be written at all (a cycle) is null.
 *
 * @param {object|null} value
 * @returns {object|null}
 */
export function plainCopy(value) {
  if (!value || typeof value !== "object") return null;
  try {
    return JSON.parse(JSON.stringify(value, (k, v) => (typeof v === "function" ? undefined : v)));
  } catch {
    return null;
  }
}

/**
 * Whether a counter-spell Dispel countered: a counter, at Success or better
 * on the degree the card resolved. What "countered" does is the riders'.
 *
 * @param {boolean} counterSpell
 * @param {string} degree
 * @returns {boolean}
 */
export function dispelCountered(counterSpell, degree) {
  return Boolean(counterSpell) && SUCCESSES.includes(str(degree));
}

/**
 * Every registered modifier's offer for this Dispel, cleaned, in
 * registration order.
 *
 * @param {object} ctx `{ actor, target, effect, declaredPP, counterSpell, presetDispel }`
 * @returns {Promise<Array<object>>}
 */
export async function offeredDispelModifiers(ctx = {}) {
  const out = [];
  for (const { key, spec } of registeredDispelModifiers()) {
    try {
      const offer = normaliseDispelOffer(key, await spec.offer(ctx));
      if (offer) out.push(offer);
    } catch (err) {
      console.error(`TRG Prime | dispel modifier "${key}": offer failed`, err);
    }
  }
  return out;
}

/**
 * The riders of the modifiers that applied, asked after the outcome, in
 * registration order. Each may answer `{ lines }` for a follow-up card.
 *
 * @param {object} ctx `{ actor, degree, countered, targetCaster, spell, check, … }`
 * @param {string[]} keys the applied modifiers' keys
 * @returns {Promise<string[]>} lines
 */
export async function dispelResultRiders(ctx = {}, keys = []) {
  const wanted = new Set((keys ?? []).map((k) => str(k).toLowerCase()));
  const lines = [];
  for (const { key, spec } of registeredDispelModifiers()) {
    if (!wanted.has(key) || typeof spec.onResult !== "function") continue;
    try {
      const got = await spec.onResult(ctx);
      for (const text of Array.isArray(got?.lines) ? got.lines : []) if (str(text)) lines.push(str(text));
    } catch (err) {
      console.error(`TRG Prime | dispel modifier "${key}": onResult failed`, err);
      lines.push("<em>A module's Dispel rider failed — see the console.</em>");
    }
  }
  return lines;
}
