/**
 * WHAT A CASTER IS HOLDING — the register page 242's control levels need.
 *
 * NEW at 3.585.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CAP EXISTED AND NOTHING COULD BE OVER IT.
 *
 * Control Levels have been derived onto the sheet since they were
 * written, and exactly one thing asked about them: Aligned Control,
 * which refused an attempt that would breach the cap. Its own comment
 * said why the check was half a check —
 *
 *   "What is already held is the GM's to know — this system tracks no
 *    register of controlled creatures — so the cap is checked against
 *    this target alone and the card says so."
 *
 * — and passed `controlledAlready: 0`. So a caster with a cap of 18
 * could take an 8-level creature, then another, then another, and each
 * attempt was measured against an empty slate. Summons and created
 * undead never reported to the cap at all, because nothing existed for
 * them to report to.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE PAGE DOES NOT ACTUALLY FORBID GOING OVER.
 *
 * Graham's R4, 22 September 2026, on both halves. The page:
 *
 *   "You may have an amount of creature levels controlled at any one
 *    time equal to your control levels. If you exceed this amount then
 *    the highest-level creature that you currently have under your
 *    control can make a DC 20 Will saving throw every round to release
 *    itself. This process will continue until you have less than equal
 *    to your control levels under your control."
 *
 * That is a PRESSURE RULE, not a prohibition — you may hold more than
 * you can control, and what you are holding starts fighting you. A
 * refusal up front is a different and stricter rule than the one
 * printed, and it hid the interesting half of the page.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN ENTRY MAY HAVE NO CREATURE BEHIND IT, DELIBERATELY.
 *
 * Conjuring reports a LEVEL and leaves the GM to place whatever they
 * choose — `conjuredCreatureNote` writes a sentence on the card, and no
 * token is created by the system. So an entry carries a `handle` when a
 * real creature is known (Aligned Control has one; a GM who selected a
 * token has one) and null when only the level is. Both count toward the
 * tally, because the cap is about levels held. Only the first can roll
 * its own save; see the workflow for what happens to the second.
 */

/** The saving throw a creature over its controller's cap gets, every round. */
export const CONTROL_RELEASE_DC = 20;

/** Where a controlled creature came from, for the panel and the card. */
export const CONTROL_SOURCES = Object.freeze({
  aligned: "Aligned Control",
  conjured: "Conjured",
  undead: "Created undead",
  dominated: "Dominated",
  other: "Other"
});

/** Numbers we may act on — see sustain-clock.mjs for why this is a function. */
function readable(value) {
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

/** One entry's creature level, floored at 0. */
export function entryLevel(entry) {
  const raw = entry?.level;
  if (!readable(raw)) return 0;
  return Math.max(0, Math.floor(Number(raw)));
}

/**
 * Total creature levels held.
 *
 * @param {object[]} entries
 * @returns {number}
 */
export function controlledLevels(entries = []) {
  return (Array.isArray(entries) ? entries : []).reduce((sum, e) => sum + entryLevel(e), 0);
}

/**
 * Is this caster over their cap, and which creature is pulling hardest?
 *
 * "THE HIGHEST-LEVEL CREATURE", and ties broken by the OLDEST entry.
 * The page names one creature per round and does not say which of two
 * equals; taking the one that has been held longest makes the rule
 * deterministic and means a caster cannot dodge it by re-taking the
 * creature that is trying to escape.
 *
 * @param {object[]} entries
 * @param {number} cap system.magic.controlLevels
 * @returns {{over: number, held: number, cap: number, highest: object|null}}
 */
export function controlOverflow(entries = [], cap = 0) {
  const list = Array.isArray(entries) ? entries : [];
  const held = controlledLevels(list);
  const limit = readable(cap) ? Math.max(0, Math.floor(Number(cap))) : 0;
  const over = Math.max(0, held - limit);

  let highest = null;
  if (over > 0) {
    for (const entry of list) {
      if (!highest || entryLevel(entry) > entryLevel(highest)) highest = entry;
    }
  }
  return { over, held, cap: limit, highest };
}

/**
 * Whether a creature's DC 20 Will save frees it.
 *
 * FIVE DEGREES, AND THE CONVENTION THIS PROJECT ALREADY USES for a rule
 * that names only success and failure: anything that beats the DC frees
 * it, anything that does not leaves it held. Heroic and Critical are
 * successes, Fumble and Blunder are failures — stated rather than left
 * to a `=== "success"` that would quietly hold a creature that rolled a
 * Critical.
 *
 * @param {string} degreeKey
 * @returns {boolean}
 */
export function releasesItself(degreeKey) {
  return ["heroic", "critical", "success"].includes(String(degreeKey ?? "").trim());
}

/**
 * The sentence the overflow card prints.
 *
 * @param {object} overflow the result of `controlOverflow`
 * @returns {string}
 */
export function overflowLine(overflow) {
  if (!overflow || overflow.over <= 0) return "";
  const name = overflow.highest?.name ?? "The highest-level creature";
  return `<strong>${overflow.held} of ${overflow.cap} control levels</strong> — `
    + `${overflow.over} over. <strong>${name}</strong> (level ${entryLevel(overflow.highest)}) `
    + `rolls a DC ${CONTROL_RELEASE_DC} Will save to release itself.`;
}

/**
 * Add an entry, replacing any entry that already names the same creature.
 *
 * RE-TAKING A CREATURE IS NOT HOLDING IT TWICE. Aligned Control can be
 * used again on something already held — to refresh a duration, or
 * after a failed attempt — and counting it twice would push a caster
 * over their own cap for doing nothing new.
 *
 * @param {object[]} entries
 * @param {object} entry
 * @returns {object[]} a new array
 */
export function addControlled(entries = [], entry = {}) {
  const list = (Array.isArray(entries) ? entries : []).filter((e) => !sameCreature(e, entry));
  return [...list, entry];
}

/** Drop the entry with this id. */
export function removeControlled(entries = [], id = "") {
  return (Array.isArray(entries) ? entries : []).filter((e) => String(e?.id ?? "") !== String(id ?? ""));
}

/**
 * Do these two entries name the same creature?
 *
 * BY HANDLE WHEN THERE IS ONE, because that is what names a creature —
 * an unlinked token's synthetic actor shares the base actor's id, which
 * is the whole reason `actor-handle.mjs` exists. Two level-only entries
 * from two separate conjurings are two creatures however alike they
 * look, so they never match.
 */
function sameCreature(a, b) {
  const handleA = a?.handle ?? null;
  const handleB = b?.handle ?? null;
  if (!handleA || !handleB) return false;
  return JSON.stringify(handleA) === JSON.stringify(handleB);
}
