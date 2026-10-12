/**
 * Drink Blood, automated (3.627.0).
 *
 * The Creature Codex: "Action 1 AP; Requirement A target who has the
 * grabbed, immobilised, paralyzed or unconscious condition or who is
 * willing, is within reach. The creature bites the target and feeds upon
 * its blood. This is automatic for all conditions except Grabbed, which
 * requires an Athletics check with a DC equal to the targets Fortitude DC.
 * The target takes Soul Drain 10, and the creature is healed of an equal
 * amount of HP." Pillars of Faith reprints it for the Unliving Vampire, and
 * Blood Renewal raises it: "the Soul Drain inflicted and HP restored
 * increase by 5. At 12th level, this increase becomes 10 instead of 5."
 *
 * Until now the ability's Use posted its text and applied nothing. It is
 * keyed by NAME, the way every bespoke feat automation is, so the Codex's
 * vampires and a sourcebook's player vampire run the same rule.
 *
 * "AN EQUAL AMOUNT" is read as the Soul Drain that actually landed: a target
 * immune to Soul Drain feeds nothing, and a ward that turns some aside
 * leaves only the rest to heal.
 *
 * Bonus declaration, on any applied effect of the drinker:
 *
 *   flags.trg-prime.drinkBloodBonus = { label: "Blood Renewal", value: 5, atLevel: { 12: 10 } }
 *
 * Pure.
 */
const SYSTEM_ID = "trg-prime";
const DRINK_BLOOD_BASE = 10;
/** The conditions that make a target a meal without a check, and the one that needs one. */
const FREE_CONDITIONS = Object.freeze(["immobilized", "immobilised", "paralyzed", "unconscious"]);
const CHECK_CONDITION = "grabbed";

/**
 * Which way the requirement is met, or why it is not.
 *
 * @param {string[]} conditions the target's condition ids
 * @param {{willing?: boolean}} opts
 * @returns {{ok: boolean, needsCheck: boolean, via: string}}
 */
export function drinkBloodRequirement(conditions = [], { willing = false } = {}) {
  const held = new Set(Array.from(conditions ?? []).map((c) => String(c).trim().toLowerCase()));
  const free = FREE_CONDITIONS.find((c) => held.has(c));
  if (free) return { ok: true, needsCheck: false, via: free };
  if (willing) return { ok: true, needsCheck: false, via: "willing" };
  if (held.has(CHECK_CONDITION)) return { ok: true, needsCheck: true, via: CHECK_CONDITION };
  return { ok: false, needsCheck: false, via: "" };
}

/**
 * The Soul Drain dealt (and HP restored): the base and every declared bonus,
 * each at the drinker's level.
 *
 * @returns {{amount: number, lines: string[]}}
 */
export function drinkBloodAmount(effects = [], level = 0) {
  let amount = DRINK_BLOOD_BASE;
  const lines = [];
  const lvl = Math.max(0, Math.floor(Number(level) || 0));
  for (const effect of Array.from(effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.drinkBloodBonus;
    if (!raw || typeof raw !== "object") continue;
    let value = Math.trunc(Number(raw.value) || 0);
    for (const [at, v] of Object.entries(raw.atLevel ?? {})) {
      if (lvl >= Number(at)) value = Math.max(value, Math.trunc(Number(v) || 0));
    }
    if (!value) continue;
    amount += value;
    lines.push(`${String(raw.label ?? "").trim() || "Bonus"} +${value}`);
  }
  return { amount, lines };
}
