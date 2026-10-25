/**
 * "By increasing the difficulty of the check by N you may…" — Chapter 4's
 * second family of printed player options.
 *
 * DISTINCT FROM THE TIME LADDERS, and the wording is what separates them.
 * A ladder says "apply the following modifiers", which is a number on the
 * ROLL's side. These say "increase the difficulty of the check", which is
 * a number on the DC's side. Transfer Runes and First Aid already work
 * this way; this generalises that shape into a table any action can
 * carry.
 *
 * FOUR OF THEM ARE REPEATABLE — "each time you increase the difficulty in
 * this way, another target is affected" — which a yes/no cannot express.
 * That is why an option carries a `max` and the prompt asks for a count
 * rather than a tick. Graham's ruling, 19 August 2026.
 *
 * Pure and Foundry-free; the dialog lives in
 * difficulty-tradeoffs-workflow.mjs.
 */

/** The largest number of repeats the prompt will offer. */
export const REPEAT_LIMIT = 5;

/**
 * A TRADE-OFF'S PRICE WAIVED BY A DECLARATION (3.670.0; Inner Tempest's
 * Monkey Stance: "take no penalty for using these actions for 1 AP", B6-5:
 * the 1-AP High Jump and Long Jump carry no +2 to their DC). Group Coercion
 * and Experienced Tracker waive theirs by name; this is the declared form,
 * on any item or applied effect:
 *
 *   flags.trg-prime.tradeoffWaivers = [{ actions: ["highJump", "longJump"], option: "forOneAp", label: "Monkey Stance" }]
 *
 * The waivers this action takes, in the shape `resolveTradeoffs` reads
 * (`{ [optionKey]: { dc: 0 } }`).
 *
 * @param {Iterable<object>} carriers
 * @param {string} actionKey
 * @returns {Record<string, {dc: number}>}
 */
export function declaredTradeoffWaivers(carriers = [], actionKey = "") {
  const out = {};
  const wanted = String(actionKey ?? "").trim().toLowerCase();
  for (const carrier of carriers ?? []) {
    if (!carrier || carrier.disabled) continue;
    const raw = carrier.flags?.["trg-prime"]?.tradeoffWaivers;
    for (const row of Array.isArray(raw) ? raw : raw ? [raw] : []) {
      const actions = (Array.isArray(row?.actions) ? row.actions : []).map((a) => String(a ?? "").trim().toLowerCase());
      const option = String(row?.option ?? "").trim();
      if (option && actions.includes(wanted)) out[option] = { dc: 0 };
    }
  }
  return out;
}

/**
 * @typedef {object} TradeoffOption
 * @property {string} key
 * @property {string} label      What the player is buying.
 * @property {number} dc         DC increase per unit.
 * @property {boolean} repeatable
 * @property {object} effect     What it does — see applyTradeoffs.
 */

const opt = (key, label, dc, effect, repeatable = false) =>
  Object.freeze({ key, label, dc, repeatable, effect: Object.freeze(effect) });

export const TRADEOFFS = Object.freeze({
  // "By increasing the difficulty of the jump check by 2 you may High
  // Jump for 1 AP." Both jumps already ADMIT this in their printed cost
  // — "2 (or 1 with a +2 difficulty increase)" — so the option was
  // documented on the card and offered nowhere.
  highJump: Object.freeze([
    opt("forOneAp", "Jump for 1 AP instead of 2", 2, { kind: "apCost", value: "1" })
  ]),
  longJump: Object.freeze([
    opt("forOneAp", "Jump for 1 AP instead of 2", 2, { kind: "apCost", value: "1" })
  ]),

  // Climb prints two, independently electable, and they stack into +4.
  climb: Object.freeze([
    opt("oneHand", "Climb with one hand occupied", 2, { kind: "note" }),
    opt("notFlatFooted", "Ignore flat-footed while climbing", 2, { kind: "note" })
  ]),

  // Repair's pair is a time ladder in everything but wording — but it is
  // worded as a DC increase, so it belongs here and not in TIME_LADDERS.
  // MUTUALLY EXCLUSIVE: you cannot repair the item in one minute and in
  // one round at once.
  repair: Object.freeze([
    opt("oneMinute", "Repair in 1 minute", 2, { kind: "apCost", value: "1 minute", group: "time" }),
    opt("oneRound", "Repair in 1 round", 5, { kind: "apCost", value: "1 round", group: "time" })
  ]),

  command: Object.freeze([
    opt("doubleTargets", "Double the number of targets", 2, { kind: "doubling", noun: "targets" }, true)
  ]),

  rally: Object.freeze([
    opt("doubleEmanation", "Double the size of the emanation", 2, { kind: "doubling", noun: "emanation" }, true),
    opt("cheaper", "Reduce the AP cost by 1", 4, { kind: "apReduction", value: 1, min: 1 })
  ]),

  // "You may increase the DC by 5 before rolling in an attempt carry out
  // this action for 0 AP." Zero, not one — this one really is free.
  commandAnAnimal: Object.freeze([
    opt("forFree", "Command for 0 AP", 5, { kind: "apCost", value: "0" })
  ]),

  demoralise: Object.freeze([
    opt("extraTarget", "Demoralise an additional target", 2, { kind: "extra", noun: "target" }, true)
  ]),
  coerce: Object.freeze([
    opt("extraTarget", "Coerce an additional target", 2, { kind: "extra", noun: "target" }, true)
  ]),

  track: Object.freeze([
    opt("fullSpeed", "Track at full speed", 5, { kind: "note" })
  ])
});

/**
 * The options an action offers, or an empty array.
 * @param {string} actionKey
 * @returns {ReadonlyArray<TradeoffOption>}
 */
export function tradeoffOptions(actionKey) {
  return TRADEOFFS[actionKey] ?? [];
}

/** Whether an action prints any trade-off at all. */
export function hasTradeoffs(actionKey) {
  return tradeoffOptions(actionKey).length > 0;
}

/**
 * The most units of an option a player may buy.
 *
 * One for a one-shot; REPEAT_LIMIT for a repeatable one. The chapter puts
 * no ceiling on the repeatables — "each time you increase the difficulty
 * in this way" runs forever — but a dialog has to stop somewhere, and a
 * +10 DC for four extra targets is already well past what a table will
 * reach for. The cap is on the PROMPT, not on the rule.
 *
 * @param {TradeoffOption} option
 * @returns {number}
 */
export function optionMax(option) {
  return option?.repeatable ? REPEAT_LIMIT : 1;
}

/**
 * Clamp a requested count to what the option allows.
 * @param {TradeoffOption} option
 * @param {*} count
 * @returns {number}
 */
export function clampCount(option, count) {
  const n = Math.floor(Number(count) || 0);
  if (!option || n <= 0) return 0;
  return Math.min(n, optionMax(option));
}

/**
 * What a set of elections costs in DC, and what each one bought.
 *
 * `counts` is keyed by option key. Anything absent, zero, negative or
 * unparseable buys nothing — a prompt that returns junk must not silently
 * raise the DC.
 *
 * MUTUALLY EXCLUSIVE OPTIONS: where two options share an `effect.group`,
 * only the LAST elected one survives. Repair is the only case in the
 * chapter — you cannot repair an item in one minute and in one round at
 * the same time — and letting both through would charge +7 DC for a
 * contradiction.
 *
 * @param {string} actionKey
 * @param {Record<string, number>} counts
 * @returns {{dcIncrease:number, chosen:Array<{option:TradeoffOption, count:number, description:string}>}}
 */
export function resolveTradeoffs(actionKey, counts = {}, { waivers = {} } = {}) {
  const elected = tradeoffOptions(actionKey)
    .map((option) => ({ option, count: clampCount(option, counts?.[option.key]) }))
    .filter((entry) => entry.count > 0);

  // Keep only the last election in each exclusive group. Done as a filter
  // over the finished list rather than by splicing while building it —
  // the splice version has to track shifting indices, and got it wrong.
  const lastInGroup = new Map();
  elected.forEach((entry, index) => {
    const group = entry.option.effect?.group;
    if (group) lastInGroup.set(group, index);
  });

  const chosen = elected
    .filter((entry, index) => {
      const group = entry.option.effect?.group;
      return !group || lastInGroup.get(group) === index;
    })
    .map((entry) => ({ ...entry }));

  // WAIVERS (3.360.0). Two General feats buy some of these elections
  // outright — Group Coercion frees additional Coerce targets, Experienced
  // Tracker frees tracking at full Speed — and both are exceptions to a
  // price this table already sets. So the exception is applied HERE, where
  // the price is, rather than by each feat subtracting from a total it did
  // not compute.
  //
  // `freeCount` waives that many units of a repeatable option; `dc`
  // replaces its per-unit price outright. Neither is allowed to make the
  // increase negative — a waiver is a discount, never a rebate.
  const dcIncrease = chosen.reduce((sum, c) => {
    const waiver = waivers?.[c.option.key] ?? {};
    const perUnit = waiver.dc === undefined ? c.option.dc : Math.max(0, Number(waiver.dc) || 0);
    const paidFor = Math.max(0, c.count - Math.max(0, Math.floor(Number(waiver.freeCount) || 0)));
    // THE CARD SAYS WHAT WAS PAID (3.670.1; found live: Monkey Stance's
    // waived 1-AP jump read "(+2 DC)" under "Traded difficulty (+0 DC)").
    c.description = describeTradeoff(c.option, c.count, { paidDC: perUnit * paidFor });
    return sum + perUnit * paidFor;
  }, 0);
  return { dcIncrease, chosen };
}

/**
 * The line the card shows for one election.
 *
 * @param {TradeoffOption} option
 * @param {number} count
 * @returns {string}
 */
export function describeTradeoff(option, count = 1, { paidDC = null } = {}) {
  if (!option || count <= 0) return "";
  const dc = paidDC === null || paidDC === undefined ? option.dc * count : Math.max(0, Number(paidDC) || 0);
  // A price a waiver took away is named as waived, not as its printed DC.
  const cost = dc === 0 && option.dc > 0 ? " (waived)" : ` (+${dc} DC)`;

  switch (option.effect?.kind) {
    case "doubling": {
      // "Each time you increase the difficulty in this way, the amount of
      // targets is doubled again" — so n elections is a factor of 2^n,
      // not n. Spelled out on the card because ×8 for +6 DC is the sort
      // of thing a table wants to see stated rather than inferred.
      const factor = 2 ** count;
      return `${option.label}${count > 1 ? ` ${count} times` : ""} — ${option.effect.noun} ×${factor}${cost}`;
    }
    case "extra": {
      const noun = count === 1 ? option.effect.noun : `${option.effect.noun}s`;
      return `${count} additional ${noun}${cost}`;
    }
    default:
      return `${option.label}${cost}`;
  }
}

/**
 * The AP cost after any elections that change it.
 *
 * Applied in order, so an action carrying both an outright cost and a
 * reduction ends on whichever came last in its own printed list. No
 * action in the chapter carries both; the order is defined anyway rather
 * than left to chance.
 *
 * @param {string|number} apCost The action's printed cost.
 * @param {Array<{option:TradeoffOption, count:number}>} chosen
 * @returns {string|number}
 */
export function tradedApCost(apCost, chosen = []) {
  let cost = apCost;
  for (const { option } of chosen) {
    const effect = option?.effect;
    if (effect?.kind === "apCost") {
      cost = effect.value;
    } else if (effect?.kind === "apReduction") {
      // Only a numeric cost can be reduced. "10 minutes" minus 1 is not a
      // thing, and a rule that quietly turned it into one would be worse
      // than a rule that declined.
      const numeric = Number(String(cost ?? "").trim());
      if (Number.isFinite(numeric) && /^\d+$/.test(String(cost ?? "").trim())) {
        cost = String(Math.max(effect.min ?? 0, numeric - (effect.value ?? 1)));
      }
    }
  }
  return cost;
}
