/**
 * TRAVEL SPEED (Chapter 8, page 226) — the rules, pure.
 *
 * NEW at 3.582.0, for the pages 221-230 audit's D3 and Graham's R7 of
 * 22 September 2026: "Yes".
 *
 * The book prints a table of nine speeds against feet per minute, miles
 * per hour and miles per day, and the system had none of it — a GM with
 * a party of five read the table off the page and did the arithmetic by
 * hand.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DERIVED, NOT TABULATED, AND THE DERIVATION IS CHECKED AGAINST THE
 * PRINTED TABLE ROW FOR ROW.
 *
 *   Speed  FPM   MPH   MPD          feet per minute = Speed × 10
 *     10   100   1      8           miles per hour  = Speed ÷ 10
 *     15   150   1.5   12           miles per day   = MPH × 8
 *     20   200   2     16
 *     25   250   2.5   20           …and all nine rows fall out of it
 *     30   300   3     24           exactly, which is why this is three
 *     35   350   3.5   28           lines of arithmetic rather than a
 *     40   400   4     32           copy of the table.
 *     50   500   5     40
 *     60   600   6     48
 *
 * A TABLE WOULD ANSWER NINE SPEEDS AND SHRUG AT THE REST. Speeds of 45,
 * or 5 after an encumbrance penalty, or 75 on a mount, are all real and
 * none of them is printed; a lookup would have to round to a neighbour
 * and no rule says which way. `verify-chapter8-221-230` holds the nine
 * printed rows against these formulas, so if the book ever re-tunes one
 * the check fails rather than the formula quietly disagreeing with the
 * page.
 *
 * THE EIGHT-HOUR DAY IS THE BOOK'S OWN, implied by every row: 1 MPH
 * gives 8 MPD. It is named here rather than left as the number 8 inside
 * a multiplication, because a campaign that marches longer days changes
 * one constant instead of hunting an integer.
 *
 * Pure; no Foundry.
 */

/** Feet covered in a minute, per point of Speed. */
export const FEET_PER_MINUTE_PER_SPEED = 10;
/** Speed per mile per hour — a Speed of 10 is 1 mph. */
export const SPEED_PER_MPH = 10;
/** The book's travelling day: every printed row is MPH × 8. */
export const TRAVEL_HOURS_PER_DAY = 8;

/**
 * Terrain divides the distance covered: "When moving through difficult
 * terrain the above values are halved, and quartered when moving
 * through formidable terrain."
 */
export const TERRAIN_DIVISORS = Object.freeze({
  normal: 1,
  difficult: 2,
  formidable: 4
});

/**
 * What a Speed covers over time.
 *
 * @param {number} speed the character's Speed, in feet
 * @param {string} [terrain] "normal" | "difficult" | "formidable"
 * @returns {{feetPerMinute: number, milesPerHour: number, milesPerDay: number,
 *   terrain: string, divisor: number}}
 */
export function travelSpeed(speed, terrain = "normal") {
  const feet = Math.max(0, Number(speed) || 0);
  const key = TERRAIN_DIVISORS[String(terrain ?? "normal").toLowerCase()] ? String(terrain).toLowerCase() : "normal";
  const divisor = TERRAIN_DIVISORS[key];

  const feetPerMinute = (feet * FEET_PER_MINUTE_PER_SPEED) / divisor;
  const milesPerHour = (feet / SPEED_PER_MPH) / divisor;
  return {
    feetPerMinute,
    milesPerHour,
    milesPerDay: milesPerHour * TRAVEL_HOURS_PER_DAY,
    terrain: key,
    divisor
  };
}

/**
 * "When travelling as a party it is also important to note that the
 * character with the slowest speed determines how fast the party
 * travel."
 *
 * @param {Array<{name: string, speed: number}>} members
 * @returns {{speed: number, pacedBy: string|null, members: Array}}
 */
export function partyTravelSpeed(members = []) {
  const list = (Array.isArray(members) ? members : [])
    .map((m) => ({ name: String(m?.name ?? ""), speed: Math.max(0, Number(m?.speed) || 0) }))
    .filter((m) => m.speed > 0);
  if (!list.length) return { speed: 0, pacedBy: null, members: [] };

  // THE SLOWEST, and the FIRST of the slowest when several tie — a
  // stable answer, so the card names the same character each time it is
  // asked rather than whichever the sort happened to leave in front.
  let slowest = list[0];
  for (const member of list) if (member.speed < slowest.speed) slowest = member;
  return { speed: slowest.speed, pacedBy: slowest.name, members: list };
}

/**
 * How long a journey takes at a given Speed.
 *
 * @param {number} miles
 * @param {number} speed
 * @param {string} [terrain]
 * @returns {{days: number, hours: number, milesPerDay: number}|null}
 */
export function travelTime(miles, speed, terrain = "normal") {
  const distance = Math.max(0, Number(miles) || 0);
  const { milesPerDay, milesPerHour } = travelSpeed(speed, terrain);
  if (!(milesPerDay > 0)) return null;
  return {
    days: distance / milesPerDay,
    hours: milesPerHour > 0 ? distance / milesPerHour : 0,
    milesPerDay
  };
}

/** A tidy number for a card: 2.5 stays 2.5, 3.0 becomes 3. */
export function formatDistance(value) {
  const number = Number(value) || 0;
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 100) / 100);
}
