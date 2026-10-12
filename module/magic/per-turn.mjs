/**
 * AN EMANATION THAT DOES SOMETHING EVERY TURN.
 *
 * NEW at 3.461.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE KIND EXISTED; ONLY ONE SPELL COULD USE IT.
 *
 * `perTurn` was added at 3.435.1 for Luminance and has been a live
 * emanation kind ever since — but `applyPerTurnEmanations` computed its
 * effect with `luminanceTurnEffect`, which reads Luminance's own Sustain
 * state and ignores the row completely. The `formula` and `mode` fields
 * the pack entry carries were never read by anything. A second spell
 * declaring `perTurn` would have inherited Luminance's growing dice and
 * its undead inversion.
 *
 * AURA OF VITALITY IS THAT SECOND SPELL:
 *
 *   "At the beginning of your turn, each ally within the spells radius is
 *    healed of 2d8 HP of damage and 1 point of recurring or bleed damage."
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 1 September 2026: ALL ALLIES HEAL ON THE CASTER'S
 * TURN.
 *
 * That is what the sentence says — "at the beginning of YOUR turn" — and
 * it is NOT how the existing mechanism worked. Luminance heals each
 * creature at the start of ITS OWN turn, which is the right reading of
 * "all creatures that begin their turn in the radius". Over a full round
 * both heal everyone once; they differ for a creature that dies before
 * its turn comes round, or that walks in or out mid-round.
 *
 * So a row now declares WHOSE turn triggers it. Luminance is `self` and
 * keeps the behaviour it has had since August; Aura of Vitality is
 * `caster`, and the whole circle resolves in one moment each round.
 *
 * DEFAULTING TO `self` IS DELIBERATE. It is what the only existing row
 * means, so an undeclared row behaves exactly as it did before this file
 * was written — the same reason `inDamageScope` treats "no scope" as
 * "everyone".
 */

/** Whose turn sets a per-turn emanation off. */
export const PER_TURN_TRIGGERS = Object.freeze(["self", "caster"]);

const text = (v) => String(v ?? "").trim();
const DICE_OR_FLAT = /^\d+(d\d+)?$/i;

/**
 * A per-turn row, or null when it is malformed.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normalisePerTurn(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "perTurn") return null;

  const formula = text(raw.formula);
  if (!DICE_OR_FLAT.test(formula)) return null;

  const mode = text(raw.mode).toLowerCase() || "heal";
  if (mode !== "heal" && mode !== "damage") return null;

  // A DAMAGE ROW MUST NAME ITS TYPE, for the reason every other row in
  // this system must: an empty type means "the weapon's own" elsewhere,
  // and a row that forgot one must not inherit that meaning.
  const damageType = text(raw.damageType).toLowerCase();
  if (mode === "damage" && !damageType) return null;

  const on = text(raw.on).toLowerCase() || "self";
  if (!PER_TURN_TRIGGERS.includes(on)) return null;

  return {
    formula,
    mode,
    damageType: mode === "damage" ? damageType : null,
    // "AND 1 POINT OF RECURRING OR BLEED DAMAGE" — Aura of Vitality's
    // second clause, and Luminance's too. Declared per row rather than
    // assumed for the kind, because a per-turn row that only heals HP is
    // a perfectly ordinary thing to want.
    bleedRemoved: Math.max(0, Math.trunc(Number(raw.bleedRemoved) || 0)),
    on
  };
}

/**
 * Does this row fire on the turn now beginning?
 *
 * @param {object|null} spec a normalised row
 * @param {boolean} isCaster is the creature whose turn it is the caster?
 * @param {boolean} isMember is that creature inside the emanation?
 */
export function perTurnFires(spec, { isCaster = false, isMember = false } = {}) {
  if (!spec) return false;
  // THE CASTER'S TURN FIRES IT WHEREVER THE CASTER IS STANDING. The
  // circle is centred on them, so they are always inside it — but a
  // caster who has been moved out of their own emanation by some other
  // effect must still open the round for everyone in it.
  if (spec.on === "caster") return isCaster;
  return isMember;
}

/**
 * Who the effect reaches when it fires.
 *
 * @returns {"all"|"one"} every member of the emanation, or just the
 *   creature whose turn began
 */
export function perTurnReaches(spec) {
  return spec?.on === "caster" ? "all" : "one";
}

/** What the card says when a per-turn heal lands. */
export function perTurnHealLine(name, who, healed, formula, rolled, bleedNote = "") {
  // WHAT ACTUALLY HAPPENED, not what was rolled — a creature at full
  // health is healed of nothing, and "healed 6" over an unchanged HP bar
  // is the card lying. Song Of Despair's recovery line taught this on 28
  // August 2026 and Luminance's own line already obeys it.
  return `<strong>${name}</strong>: ${who} `
    + (healed > 0
      ? `healed <strong>${healed}</strong> HP (${formula} rolled ${rolled}).`
      : `already at full health — no healing (${formula} rolled ${rolled}).`)
    + bleedNote;
}
