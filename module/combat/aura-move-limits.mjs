/**
 * WHAT AN AURA'S RUNG DOES TO A CREATURE'S MOVEMENT (3.651.0; F&F 3.0 block
 * 18 R8 — Graham, 16 October 2026: "As recommended"). The Eclipse Hag's
 * Shifting Aura:
 *
 *   Success  "the area is treated as difficult terrain until the beginning
 *            of the target's next turn" — `difficult`: each square of the
 *            creature's moves inside the hag's radius costs double (+5 ft a
 *            square, as core charges any difficult square), until its next
 *            turn.
 *   Failure  "the target cannot move towards the hag for the rest of their
 *            turn" — `noApproach`: a move that would END nearer the hag than
 *            it began is refused, for that creature's turn.
 *
 * A rung declares which with the aura's `moveLimits: { success: "difficult",
 * failure: "noApproach" }`; the workflow lays it on the creature as an
 * effect carrying `flags.trg-prime.auraMoveLimit`, and the movement hook
 * reads it. Pure.
 */
export const AURA_MOVE_LIMIT_FLAG = "auraMoveLimit";
const AURA_MOVE_LIMIT_KINDS = Object.freeze(["difficult", "noApproach"]);

/** An aura's declared limits by rung, cleaned. */
export function normaliseMoveLimits(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const [rung, kind] of Object.entries(raw)) {
    const k = String(kind ?? "").trim();
    if (AURA_MOVE_LIMIT_KINDS.includes(k)) out[String(rung).trim().toLowerCase()] = k;
  }
  return Object.keys(out).length ? out : null;
}

/** The limit a degree lays, or "" (an unprinted Heroic reads the Critical, a Blunder the Fumble). */
export function moveLimitFor(limits, degree) {
  if (!limits) return "";
  const key = String(degree ?? "").toLowerCase();
  const fallback = { heroic: "critical", blunder: "fumble" }[key];
  return limits[key] ?? (fallback ? limits[fallback] ?? "" : "");
}

/**
 * Which of the creature's turns the limit belongs to: the one in progress if
 * it is acting, otherwise its next.
 *
 * @param {{round: number, turn: number, ownTurnIndex: number, acting: boolean}} c
 */
export function limitTurn({ round = 0, turn = 0, ownTurnIndex = 0, acting = false } = {}) {
  const r = Math.trunc(Number(round) || 0);
  if (acting) return r;
  return Number(ownTurnIndex) > Number(turn) ? r : r + 1;
}

/** The record to lay. */
export function auraMoveLimitRecord({ kind, emitterTokenId = "", emitterName = "", radiusFeet = 0, label = "", forRound = 0 } = {}) {
  if (!AURA_MOVE_LIMIT_KINDS.includes(kind)) return null;
  return {
    kind, emitterTokenId: String(emitterTokenId), emitterName: String(emitterName),
    radiusFeet: Math.max(0, Math.trunc(Number(radiusFeet) || 0)), label: String(label || "Aura"),
    forRound: Math.trunc(Number(forRound) || 0)
  };
}

/**
 * The extra feet a path pays inside the radius: +5 for every square entered
 * whose distance to the emitter is within it (the origin square excluded).
 *
 * @param {Array<number|null>} squareFeet each path square's distance to the emitter, origin first
 */
export function difficultSurchargeFeet(squareFeet = [], radiusFeet = 0, squareSize = 5) {
  const r = Number(radiusFeet) || 0;
  let extra = 0;
  for (const d of squareFeet.slice(1)) if (d !== null && Number.isFinite(Number(d)) && Number(d) <= r) extra += squareSize;
  return extra;
}

/** "Cannot move towards": refused when the move ends nearer than it began. */
export function approachRefusal(record, startFeet, endFeet, moverName = "This creature") {
  if (!record || record.kind !== "noApproach") return "";
  if (!Number.isFinite(Number(startFeet)) || !Number.isFinite(Number(endFeet))) return "";
  if (Number(endFeet) >= Number(startFeet)) return "";
  return `${moverName} cannot move towards ${record.emitterName || "the aura's source"} this turn (${record.label})`;
}

/** Whether a noApproach record binds this turn (its own turn of `forRound`). */
export function approachLimitLive(record, { round = 0, acting = false } = {}) {
  return Boolean(record) && record.kind === "noApproach" && acting && Math.trunc(Number(round) || 0) === record.forRound;
}
