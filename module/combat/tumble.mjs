/**
 * TUMBLE (Chapter 6, Acrobatics; page 198 for moving through a creature's
 * space). The rules half, pure, so the harness drives it. The Foundry half
 * (the chooser, the leg, the failure's reactions) is tumble-workflow.mjs.
 *
 * THE BOOK, Core 3.7 / 3.8:
 *   "Action 1 AP. You take a Stride action as part of this action. During
 *   this movement, you can try to either move through an enemy's
 *   threatened area or move through the space of one enemy without
 *   provoking a reaction. Attempt an Acrobatics check against the enemy's
 *   Fortitude DC or Acrobatics DC (whichever is higher) ...
 *   Critical: ... treating the squares in its space as normal movement. If
 *   you don't have enough Speed to move all the way through its space,
 *   your movement ends but you do not trigger reactions.
 *   Success: ... treating the squares in its space as difficult terrain. If
 *   you don't have enough Speed ..., you get the same effect as a failure.
 *   Failure: Your movement ends, and you trigger reactions as if you had
 *   moved out of the square you started in.
 *   Fumble: As failure except you also fall prone.
 *   The DC is increased by 2 if you are trying to move through the enemy's
 *   space."
 *
 * WHAT WAS WRONG (3.715.1; Graham, 26 November 2026, after Wednesday's game:
 * "the Tumble action on the Acrobatics skill ... is not working" — the move
 * cost extra AP, it still provoked, and the DC was wrong or had no target):
 *   - the 1 AP bought the check and nothing else: the Stride it includes was
 *     never given, so the drag afterwards was charged as a second Stride;
 *   - that Stride provoked from everyone, the Tumbled enemy included;
 *   - the enemy was whoever happened to be targeted, or nobody, and the +2
 *     for going through its space was never added;
 *   - a failure ended nothing and drew no reactions.
 */

/** "The DC is increased by 2 if you are trying to move through the enemy's space." */
const TUMBLE_SPACE_DC = 2;

/** The two things a Tumble may be for. */
export const TUMBLE_THROUGH = Object.freeze({ space: "space", area: "area" });

const PASSED = new Set(["heroic", "critical", "success"]);
const FAILED = new Set(["failure", "fumble", "blunder"]);

function feetOf(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

/**
 * THE ENEMIES A TUMBLE MAY BE MADE PAST: those your Stride can bring you
 * into the threatened area of. That is within your Speed plus the enemy's
 * reach (never less than 5 ft), which covers entering its space too.
 *
 * @param {Array<{id: string, feet: number|null, reach?: number}>} rows one
 *   per enemy token, with its distance from yours and its reach
 * @param {number} speedFeet your land Speed
 * @returns {Array} the rows in range, nearest first (stable)
 */
export function tumbleCandidates(rows = [], speedFeet = 0) {
  const speed = feetOf(speedFeet);
  return (Array.isArray(rows) ? rows : [])
    .map((row, i) => ({ row, i, feet: row?.feet === null || row?.feet === undefined ? NaN : Number(row.feet) }))
    .filter(({ row, feet }) => row && Number.isFinite(feet) && feet <= speed + Math.max(5, feetOf(row.reach)))
    .sort((a, b) => a.feet - b.feet || a.i - b.i)
    .map(({ row }) => row);
}

/** One chooser value per enemy and per purpose: `<tokenId>|space` or `<tokenId>|area`. */
export function tumbleChoiceValue(tokenId, through) {
  return `${String(tokenId ?? "")}|${through === TUMBLE_THROUGH.space ? TUMBLE_THROUGH.space : TUMBLE_THROUGH.area}`;
}

/** The chooser's value, read back. */
export function parseTumbleChoice(value) {
  const text = String(value ?? "");
  const cut = text.lastIndexOf("|");
  if (cut <= 0) return null;
  const tokenId = text.slice(0, cut);
  const through = text.slice(cut + 1);
  if (!Object.values(TUMBLE_THROUGH).includes(through)) return null;
  return { tokenId, through };
}

/**
 * What the chooser opens on: the creature already targeted, if it is a
 * candidate, otherwise the nearest; past it, not through it (the +2 is the
 * one a player has to choose).
 */
export function tumbleDefaultChoice(candidates = [], targetedId = null) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return null;
  const id = String(targetedId ?? "");
  const picked = id && list.some((c) => String(c?.id) === id) ? id : String(list[0].id);
  return tumbleChoiceValue(picked, TUMBLE_THROUGH.area);
}

/** The DC added for the purpose chosen. */
export function tumbleDCAdjustment(through) {
  return through === TUMBLE_THROUGH.space ? TUMBLE_SPACE_DC : 0;
}

/**
 * WHAT A DEGREE DOES.
 *
 * @param {string} degree the collapsed degree (critical/success/failure/fumble;
 *   heroic and blunder read as critical and fumble)
 * @param {string|null} through `space`, `area`, or null when no enemy was chosen
 *   (no token on the scene: the old behaviour, through a space)
 * @returns {{passed: boolean, passage: "normal"|"difficult"|null, armStride: boolean,
 *   exemptEnemy: boolean, failureReactions: boolean}}
 *   - passage: the marker the movement hook spends on the enemy's squares
 *   - armStride: the Stride the action includes, armed free of AP
 *   - exemptEnemy: that Stride provokes no reaction from the Tumbled enemy
 *   - failureReactions: reactions as if leaving the starting square
 */
export function tumbleOutcome(degree, through = TUMBLE_THROUGH.space) {
  const d = String(degree ?? "").toLowerCase();
  const passed = PASSED.has(d);
  const failed = FAILED.has(d);
  const viaSpace = through !== TUMBLE_THROUGH.area;
  return {
    passed,
    passage: passed && viaSpace ? (d === "success" ? "difficult" : "normal") : null,
    armStride: passed,
    exemptEnemy: passed,
    failureReactions: failed
  };
}

/**
 * THE STRIDE THE ACTION INCLUDES: a land-Speed compound leg, free of AP (the
 * Tumble's 1 AP paid for it), that must be the next action. It provokes as a
 * Stride does, except from the enemy the Tumble beat.
 *
 * @param {{speedFeet: number, exemptTokenId?: string|null}} opts
 */
export function tumbleLeg({ speedFeet = 0, exemptTokenId = null } = {}) {
  const exempt = exemptTokenId ? [String(exemptTokenId)] : [];
  return {
    speedKey: "land",
    maxFeet: feetOf(speedFeet),
    provokes: true,
    exemptReactorTokenIds: exempt,
    note: "Tumble's Stride",
    nextAction: true
  };
}

/** The card's line for the Stride. */
export function tumbleStrideLine({ speedFeet = 0, enemyName = "", through = TUMBLE_THROUGH.area, passage = null } = {}) {
  const feet = feetOf(speedFeet);
  const who = enemyName || "The enemy";
  const space = through === TUMBLE_THROUGH.space && passage
    ? ` You may move through ${enemyName || "its"}${enemyName ? "'s" : ""} space: its squares count as ${passage === "difficult" ? "difficult terrain" : "normal movement"}.`
    : "";
  return `<strong>Stride:</strong> drag the token up to ${feet} ft, no further AP. ${who} gets no reaction to it; other enemies still may.${space}`;
}
