/**
 * HEALING PAID FOR BY THE SPELL YOU JUST CAST.
 *
 * NEW at 3.470.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LIFE SIPHON.
 *
 *   "Cast R (verbal). TRIGGER You cast an arcane soul spell of at least
 *    2 PP. You channel some of the spell's power to heal yourself,
 *    regaining 1d6 HP per 2 PP of the spell."
 *
 *   WARPING: +4 PP: increase the amount you heal by 1d6 per 2 PP.
 *
 * THE SAME SHAPE AS WAR CRY, one file later. A reaction whose subject is
 * something that has ALREADY happened — there, a critical; here, a cast
 * — so the trigger is a question about a record rather than about the
 * board. `triggered-strike.mjs` reads `lastCriticalInjury`, which the
 * attack workflow already kept for Ambush and Sniping; this needs the
 * equivalent for a cast, and nothing kept one.
 *
 * WHY `registerActiveSpell` COULD NOT ANSWER IT. That record carries
 * exactly the right fields — `pp`, `name`, `castRound` — but it is
 * written only for a spell that is LOCKED, SUSTAINED or a live emanation
 * (see the guard in cast-workflow.mjs, widened at 3.463.0). An ordinary
 * arcane soul spell registers nothing, and those are precisely the ones
 * this reaction is about. So the cast workflow now keeps a `lastCast`
 * record for every successful cast, and this file reads it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TRIGGER HAS THREE PARTS AND ALL THREE ARE ASKED.
 *
 *   "an ARCANE ... spell"        the tradition it was cast with
 *   "... SOUL spell"             a trait on the spell
 *   "... of at least 2 PP"       what was actually SPENT, not the
 *                                printed cost — a Heroic success halves
 *                                the total, and "the spell's power" is
 *                                the power that left you.
 *
 * THE PP SPENT IS THE HONEST READING and it is the one that can bite: a
 * Heroic 3 PP cast spends 1 and siphons nothing, where reading the
 * printed cost would have paid out. Recorded here rather than argued
 * about at the table.
 */

/** Where the caster's record of their last cast lives. */
export const LAST_CAST_FLAG = "lastCast";

/** The least PP a spell can cost and still be worth siphoning. */
const SIPHON_MINIMUM_PP = 2;

/** How many PP buy one die. */
const SIPHON_PP_PER_DIE = 2;

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/**
 * A life-siphon row, or null when it is malformed.
 */
export function normaliseLifeSiphon(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "lifeSiphon") return null;
  const tradition = lower(raw.tradition);
  const trait = lower(raw.trait);
  // BOTH HALVES OF THE TRIGGER MUST BE NAMED. A row missing either would
  // siphon from any spell at all, which is a different reaction.
  if (!tradition || !trait) return null;
  return {
    label: text(raw.label) || "Life Siphon",
    tradition,
    trait,
    minimumPP: Math.max(1, Math.trunc(Number(raw.minimumPP) || SIPHON_MINIMUM_PP)),
    ppPerDie: Math.max(1, Math.trunc(Number(raw.ppPerDie) || SIPHON_PP_PER_DIE)),
    // THE PRINTED DIE, "1d6" — a count and a size, because that is what
    // the book prints and what the pack must carry for the
    // printed-damage ratchet to see it. The count is multiplied by the
    // number of whole PP pairs below.
    die: text(raw.die) || "1d6"
  };
}

/**
 * Does the caster's last cast answer this reaction's trigger?
 *
 * @param {object|null} spec a normalised row
 * @param {object|null} record the caster's `lastCast` flag
 * @param {number|null} round the round now
 * @returns {{ok: boolean, why: string, pp: number}}
 */
export function lifeSiphonQualifies(spec, record, round = null) {
  const no = (why) => ({ ok: false, why, pp: 0 });
  if (!spec) return no("this spell declares no siphon");
  if (!record) return no("you have not cast a spell");

  // SAME ROUND, for the reason War Cry's trigger asks it: the record is
  // not cleared between rounds, so without this a caster could siphon
  // from a spell cast four rounds ago, at any time, for ever. Outside an
  // encounter both are null and match, which is the same honest
  // limitation recorded in triggered-strike.mjs.
  if ((record.round ?? null) !== (round ?? null)) {
    return no("that spell was not cast this round");
  }

  const traditions = String(record.tradition ?? "").toLowerCase();
  // A SPELL MAY HAVE TWO TRADITIONS — "arcane, ethereal" is an ordinary
  // entry in this pack — so this asks whether the named one is AMONG
  // them rather than whether it is the whole string.
  if (!traditions.split(/[,;/]/).map((t) => t.trim()).includes(spec.tradition)) {
    return no(`that spell was not ${spec.tradition}`);
  }

  const traits = String(record.traits ?? "").toLowerCase();
  if (!traits.split(/[,;/]/).map((t) => t.trim()).includes(spec.trait)) {
    return no(`that spell was not a ${spec.trait} spell`);
  }

  const pp = Math.max(0, Math.trunc(Number(record.pp) || 0));
  if (pp < spec.minimumPP) {
    return no(`that spell spent only ${pp} PP`);
  }
  return { ok: true, why: "", pp };
}

/**
 * The healing formula for a qualifying cast.
 *
 * ROUNDED DOWN, and 7 PP therefore buys three dice rather than three and
 * a half. "1d6 HP per 2 PP" counts whole pairs; a system that rounded up
 * would pay for a PP nobody spent.
 *
 * @param {object|null} spec
 * @param {number} pp the PP the triggering spell actually spent
 * @param {number} extraSets warping: another 1d6 per ppPerDie
 * @returns {string|null}
 */
export function lifeSiphonFormula(spec, pp, extraSets = 0) {
  if (!spec) return null;
  const m = /^([1-9]\d*)?d([1-9]\d*)$/i.exec(spec.die);
  if (!m) return null;
  const perSet = Number(m[1] ?? 1);
  const sets = Math.floor(Math.max(0, Number(pp) || 0) / spec.ppPerDie)
    * (1 + Math.max(0, Math.trunc(Number(extraSets) || 0)));
  const dice = perSet * sets;
  if (dice < 1) return null;
  return `${dice}d${m[2]}`;
}

/** What the card says when the siphon lands. */
export function lifeSiphonLine(name, healed, formula, rolled, pp) {
  return `<strong>Life Siphon</strong>: ${name} `
    + (healed > 0
      ? `draws back <strong>${healed}</strong> HP from ${pp} PP (${formula} rolled ${rolled}).`
      : `is already at full health — nothing is drawn back (${formula} rolled ${rolled}).`);
}

/** What the card says when the trigger is not met. */
export function lifeSiphonRefusal(why) {
  return `<em>Life Siphon finds nothing to draw on — ${why}.</em>`;
}
