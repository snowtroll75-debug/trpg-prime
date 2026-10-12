/**
 * A ZONE THAT BITES WHOEVER BEGINS A TURN IN IT.
 *
 * NEW at 3.477.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NEXUS OF ELEMENTAL ENERGY.
 *
 *   "When you cast this spell, you select a specific elemental energy
 *    type either: acid, cold, electricity, or fire ... affecting
 *    creatures within it based upon their saving throw WHICH VARIES
 *    BASED UPON THE ELEMENTAL TYPE (Fortitude for Acid and Cold, Reflex
 *    for Electricity and Fire). Any creature that begins their turn
 *    within the spells radius must make a saving throw.
 *      Critical  The creature resists the elemental energies and is
 *                unaffected.
 *      Success   2d6 damage of the appropriate elemental type.
 *      Partial   4d6.
 *      Failure   4d6 and a Minor Critical.
 *      Fumble    4d6 and a Light Critical."
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS A PLACE, NOT AN EMANATION.
 *
 * "Area 10-foot radius", "Range 60 feet" — cast sixty feet away and it
 * stays there. So it is a REGION, like consecrated ground, and NOT the
 * `perTurn` emanation kind that Aura Of Vitality uses. That distinction
 * cost a whole draft once already: area riders were first written
 * against `runningEmanations()`, which can never see a spell whose area
 * does not say "emanation".
 *
 * WHAT IT SHARES WITH LUMINANCE is only the question "who BEGINS a turn
 * here", which movement cannot answer — so it is asked from the turn
 * clock, beside the emanation sweep, rather than from a movement hook.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ELEMENT DECIDES THE SAVE, AND THAT IS THE UNUSUAL PART.
 *
 * Every other save in this system is fixed by the spell. This one is
 * chosen at cast: acid and cold ask Fortitude, electricity and fire ask
 * Reflex. `damage-type-choice.mjs` already carries that table — it shipped
 * with Elemental Shield at 3.473.0, tested and uncalled, for this spell.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "A LIGHT CRITICAL" IS NOT A SEVERITY THIS SYSTEM HAS.
 *
 * The book's own authoritative table gives three — Minor (AV 5-14),
 * Serious (15-24), Deadly (25+) — and the system implements exactly
 * those. "Light Critical" appears six times in the book anyway, in spell
 * text and in one sentence implying a five-point band the real table
 * does not use. It reads as an older edition's word left behind.
 *
 * GRAHAM'S RULING, 2 September 2026: READ IT AS SERIOUS. Fumble is worse
 * than Failure, Failure already gives a Minor, so the Fumble line has to
 * be worse than Minor — and Serious is the next tier the system knows.
 */

import { elementSave } from "./damage-type-choice.mjs";

/** Where a nexus is recorded on the Region its template created. */
export const NEXUS_FLAG = "elementalNexus";

/** The degrees this spell prints an outcome for. */
export const NEXUS_DEGREES = Object.freeze(["critical", "success", "partial", "failure", "fumble"]);

const SEVERITIES = Object.freeze(["minor", "serious", "deadly"]);
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const DICE = /^([1-9]\d*)d([1-9]\d*)$/i;

/*
 * SEVEN ROLLED DEGREES, FIVE PRINTED — and this spell prints one more
 * than the prisons do, because it names Partial itself.
 *
 * The rule is the one Graham confirmed on 2 September 2026 for the
 * prison ladder: an unnamed degree takes the nearest named one that is
 * NO BETTER than it. Only Heroic and Blunder are unnamed here, so only
 * they are mapped — Heroic to Critical (the best the spell offers) and
 * Blunder to Fumble (the worst).
 */
const DEGREE_FALLBACK = Object.freeze({
  heroic: "critical",
  critical: "critical",
  success: "success",
  partial: "partial",
  failure: "failure",
  fumble: "fumble",
  blunder: "fumble"
});

/** Which printed degree a rolled one resolves to. */
export function nexusDegree(rolled) {
  return DEGREE_FALLBACK[lower(rolled)] ?? null;
}

/**
 * A nexus row, or null when it is malformed.
 *
 * THE LADDER IS DECLARED, like the prisons'. Critical deals nothing and
 * Failure and Fumble deal the same 4d6 as Partial — a shape no formula
 * derives, so it is five printed outcomes stored as five.
 */
export function normaliseNexus(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "elementalNexus") return null;

  const ladder = {};
  for (const degree of NEXUS_DEGREES) {
    const dice = text(raw.ladder?.[degree]);
    // CRITICAL DEALS NOTHING — "resists the elemental energies and is
    // unaffected" — so an empty entry is legal and means no damage. Every
    // OTHER degree must name dice, or it is a roll nobody decided.
    if (!dice) {
      if (degree === "critical") { ladder[degree] = ""; continue; }
      return null;
    }
    if (!DICE.test(dice)) return null;
    ladder[degree] = dice;
  }

  const criticalOn = {};
  for (const [degree, severity] of Object.entries(raw.criticalOn ?? {})) {
    const d = lower(degree);
    const s = lower(severity);
    if (NEXUS_DEGREES.includes(d) && SEVERITIES.includes(s)) criticalOn[d] = s;
  }

  return {
    label: text(raw.label) || "Elemental Nexus",
    ladder,
    criticalOn,
    // PRINTED, NOT APPLIED — Graham's ruling of 2 September 2026 on the
    // clause about elemental spells cast into the zone gaining a die and
    // imposing -2 on saves. It reaches into every other spell's damage
    // and save DC from outside, which is a far larger change than this
    // one spell; the card names it so a table can apply it.
    notes: (Array.isArray(raw.notes) ? raw.notes : []).map(text).filter(Boolean)
  };
}

/**
 * What one creature's turn in the zone costs.
 *
 * @returns {{dice: string, severity: string|null, harmless: boolean}|null}
 */
export function nexusOutcome(spec, degree) {
  if (!spec) return null;
  const d = lower(degree);
  if (!NEXUS_DEGREES.includes(d)) return null;
  const dice = spec.ladder[d];
  return { dice, severity: spec.criticalOn[d] ?? null, harmless: !dice };
}

/**
 * Which save this nexus asks for.
 *
 * FROM THE ELEMENT, NOT FROM THE ROW. The spell's own `defence` field
 * reads "varies", and the mapping is a fact about the elements that
 * `damage-type-choice.mjs` already holds for every spell that keys off
 * them.

 * IT CAN NOW ANSWER NULL, AND THAT IS NEW AT 3.603.0. The chooser's
 * whitelist used to be these four elements and nothing else; it is now
 * every damage type the system has, so a row declaring `slashing` would
 * reach this function and get no save back. `nexusIsCastable` below is
 * the guard that keeps such a row out of a Region rather than putting the
 * word "null" on a card.
 */
export function nexusSave(element) {
  return elementSave(element);
}

/**
 * May this nexus be placed with this element?
 *
 * NEW at 3.603.0, and the price of widening the chooser. `nexusSave` is
 * the whole mechanism — the zone exists to make everybody inside it roll
 * a particular save — so an element with no save is not a weaker nexus,
 * it is a Region that can never ask anybody anything. Refusing at the
 * point of placement is the only refusal that costs nothing; refusing
 * later would mean a zone sitting on the map that does nothing when
 * stepped into, which is indistinguishable from a broken release.
 */
export function nexusIsCastable(element) {
  return Boolean(nexusSave(element));
}

/** What the card says when an element cannot power a nexus. */
export function nexusUnsupportedLine(label, element) {
  return `<em>${label} cannot be built from <strong>${element}</strong> — `
    + `the printed rule gives a save only for acid, cold, electricity and fire.</em>`;
}

/** What the card says when the zone bites. */
export function nexusLine(spec, name, element, degree, taken, rolled, outcome) {
  if (outcome.harmless) {
    return `<strong>${spec.label}</strong> — ${name} rolls <strong>${degree}</strong> `
      + `and resists the ${element} entirely.`;
  }
  const reduced = Number(taken) !== Number(rolled) ? ", reduced by their defences" : "";
  return `<strong>${spec.label}</strong> — ${name} rolls <strong>${degree}</strong>, taking `
    + `<strong>${taken}</strong> ${element} (${outcome.dice} rolled ${rolled}${reduced}).`;
}

/** The whole printed ladder, for the cast card. */
export function nexusLadderLine(spec, element) {
  return NEXUS_DEGREES
    .map((d) => {
      const o = nexusOutcome(spec, d);
      if (o.harmless) return `${d}: unaffected`;
      const crit = o.severity ? `, a ${o.severity} ${element} critical` : "";
      return `${d}: ${o.dice}${crit}`;
    })
    .join("; ");
}
