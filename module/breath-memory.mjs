/**
 * BREATH MEMORY (3.631.0; Fiends & Fables 3.0 block 1, Chapter 2).
 *
 * Five Codex abilities ride on a breath weapon that has already been used:
 *
 *   Clinging Breath   "Trigger a target took damage from the creature's
 *   Scorching Breath   breath weapon on its last turn. At the beginning of
 *                      the creature's turn, it must make a basic Fortitude
 *                      save to avoid taking half the breath weapon's dice
 *                      again (round up) as acid [fire] damage."
 *   Shadow Breath     "Trigger a target takes damage from the creature's
 *                      breath weapon. Targets are affected by a Blindness
 *                      spell using the same saving throw as their initial
 *                      one … Success blinded until its next turn begins.
 *                      Failure blinded for 1 minute. Fumble permanently."
 *   Slowing Breath    "Affected targets must make a Fortitude saving throw:
 *                      Partial slowed 1 for 1 round. Failure slowed 1 for 1
 *                      minute. Fumble slowed 2 for 1 minute."
 *   Penetrating Breath "completely bypasses DR … and also ignores Energy
 *                      Resistance."
 *
 * So a breath that is used (a declared area effect with `breath: true`)
 * leaves a record on the breather: who it reached, each one's save degree,
 * and what it dealt. The riders read that record — the by-degree ones at
 * once, the next-turn ones when the breather's next turn begins — and the
 * record is dropped after that turn.
 *
 * Declared on the rider's entry:
 *
 *   creatureAbility.breathRider = { kind: "nextTurnDamage", fraction: 0.5, type: "acid", save: "fortitude" }
 *   creatureAbility.breathRider = { kind: "byBreathDegree", conditions: {…}, outcomes: {…} }
 *   creatureAbility.breathRider = { kind: "save", save: "fortitude", conditions: {…}, outcomes: {…} }
 *   creatureAbility.breathRider = { kind: "penetrating" }
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
export const BREATH_FLAG = "breathMemory";

/** The breath rider an item declares, or null. */
function breathRiderOf(item) {
  const r = item?.flags?.[SYSTEM_ID]?.creatureAbility?.breathRider;
  return r && typeof r === "object" && r.kind ? r : null;
}

/** Every rider the creature carries, by kind. */
export function breathRiders(items = []) {
  return Array.from(items ?? []).map((i) => ({ item: i, rider: breathRiderOf(i) })).filter((x) => x.rider);
}

/**
 * The record one breath leaves.
 * @param {{name: string, formula?: string, type?: string}} breath the breath ability and its dice
 * @param {Array<{uuid: string, name: string, degree: string, damage: number}>} results
 * @param {{round?: number|null, worldTime?: number}} clock
 */
export function breathRecord(breath, results = [], { round = null, worldTime = 0 } = {}) {
  return {
    ability: String(breath?.name ?? ""),
    formula: String(breath?.formula ?? ""),
    type: String(breath?.type ?? ""),
    round: Number.isFinite(Number(round)) ? Number(round) : null,
    worldTime: Number(worldTime) || 0,
    targets: (results ?? []).map((r) => ({ uuid: r.uuid, name: r.name, degree: r.degree, damage: Math.max(0, Number(r.damage) || 0) }))
  };
}

/** "half the breath weapon's dice again (round up)": 13d8 → 7d8. */
export function halfDiceFormula(formula, fraction = 0.5) {
  const m = /^(\d+)d(\d+)/i.exec(String(formula ?? "").trim());
  if (!m) return "";
  const n = Math.ceil(Number(m[1]) * fraction);
  return n > 0 ? `${n}d${m[2]}` : "";
}

/**
 * Whether a next-turn rider fires: the record is from the breather's LAST
 * turn — the round before this one in combat (the same round means the
 * breath was this very turn), or within a minute out of it.
 */
export function nextTurnRiderDue(record, { round = null, worldTime = 0 } = {}) {
  if (!record?.targets?.length) return false;
  if (record.round !== null && round !== null) return round === record.round + 1;
  return (Number(worldTime) || 0) - (record.worldTime || 0) <= 60;
}

/** The targets a damage-dependent rider reaches: those the breath damaged. */
export function damagedTargets(record) {
  return (record?.targets ?? []).filter((t) => t.damage > 0);
}
