/**
 * DAMAGE THAT LINGERS (3.650.0; Fiends & Fables 3.0 block 17 R3 — Graham,
 * 15 October 2026: "Okay please implement").
 *
 * The Iron Golem's breath: "All affected creatures must make a basic Fort
 * saving throw to avoid 4d10 poison damage. The poison lingers after the
 * initial round. Any creature that initially takes damage from the poison
 * must make a saving throw at the beginning of each of their turns or suffer
 * the same damage again. This continues for 4 rounds or until the target
 * takes no damage from the poison."
 *
 * An area declares `lingering: { rounds: 4 }`. Every creature its damage
 * reached carries a record — the breath's own roll ("the same damage"), its
 * type, the save and its DC — on an effect of its own. At the start of each
 * of its turns it makes the same basic save against that roll; the record
 * ends after its rounds, or on the first turn it takes nothing.
 *
 * Pure.
 */

export const LINGERING_FLAG = "lingeringDamage";
const SAVES = ["fortitude", "reflex", "will"];

/** A record to stamp, or null when it could never do anything. */
export function lingeringRecord({ label = "", amount = 0, type = "", save = "", dc = 0, basic = true, rounds = 0, sourceName = "", sourceLevel = 0 } = {}) {
  const amt = Math.max(0, Math.floor(Number(amount) || 0));
  const left = Math.max(0, Math.trunc(Number(rounds) || 0));
  const s = String(save ?? "").trim().toLowerCase();
  const t = String(type ?? "").trim().toLowerCase();
  if (!amt || !left || !SAVES.includes(s) || !t) return null;
  return {
    label: String(label || "Lingering damage"), amount: amt, type: t, save: s,
    dc: Math.max(0, Math.trunc(Number(dc) || 0)), basic: basic !== false, roundsLeft: left,
    sourceName: String(sourceName ?? ""), sourceLevel: Math.max(0, Math.trunc(Number(sourceLevel) || 0))
  };
}

/**
 * After one turn's save: what is left. Ends when the damage dealt was nothing
 * ("until the target takes no damage") or when the last round is spent.
 *
 * @returns {object|null} the record to keep, or null to end it
 */
export function lingeringAfterTurn(record, dealt) {
  if (!record) return null;
  if (!(Number(dealt) > 0)) return null;
  const left = Math.max(0, Math.trunc(Number(record.roundsLeft) || 0) - 1);
  return left > 0 ? { ...record, roundsLeft: left } : null;
}
