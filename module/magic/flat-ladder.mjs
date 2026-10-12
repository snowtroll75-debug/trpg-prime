/**
 * FOUR PRINTED OUTCOMES, WITH NO DICE IN THEM.
 *
 * NEW at 3.485.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS OFF THE FLAT-DAMAGE BACKLOG, AND THEY ARE NOT ONE THING.
 *
 *   SERENITY (12 PP, 10-foot radius, 1 minute, Curse/Enchantment/Mental)
 *     "Each target must make a Will Saving Throw and suffers the result
 *      every time they take an offensive action.
 *        Critical  unaffected.
 *        Success   5 Mental damage.
 *        Failure   10 Mental damage and -20 critical injury.
 *        Fumble    10 Mental damage and a critical injury."
 *
 *   WORD OF DEATH (20 PP, 1 creature, Auditory/Enchantment/Mental/Word)
 *     "Critical  20 damage.
 *      Success   50 damage; if this brings the target to 0 HP, the
 *                target dies instantly.
 *      Failure   if the target has 100 HP or fewer, it dies instantly;
 *                otherwise it drops to -10 HP.
 *      Fumble    the target dies instantly."
 *
 * I EXPECTED THESE TO SHARE A MECHANISM AND THEY DO NOT. Reading them is
 * what settled it: one is a standing curse that repeats a fixed penalty,
 * the other is instant death gated on a hit-point threshold. What they
 * share is the SHAPE the prisons already established — four printed
 * outcomes, worse rolls costing more — and that is the part worth
 * factoring out. The payloads are their own.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LADDER RUNS THE WRONG WAY, AGAIN.
 *
 * Word Of Death's Success (50) is worse than its Critical (20), exactly
 * as Flame Prison's Success (16d6) is worse than its Critical (8d6).
 * `prison.mjs` records why that is stored as four printed outcomes
 * rather than derived from one, and the same reasoning applies here with
 * more force: no rule generates "20, 50, dies-or--10, dies".
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SEVEN ROLLED DEGREES AGAIN.
 *
 * Both spells print four; this system rolls seven. The mapping is the
 * one Graham confirmed on 2 September 2026 for the prisons — an unnamed
 * degree takes the nearest named one that is NO BETTER than it — and it
 * is imported from `prison.mjs` rather than restated, because two copies
 * of a ruling are two things to keep in step.
 */

import { prisonDegree, PRISON_DEGREES } from "./prison.mjs";

/** The degrees a flat ladder may name — the same four the prisons use. */
export const FLAT_DEGREES = PRISON_DEGREES;

/**
 * Which printed degree a rolled one resolves to.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IMPORTED AND THEN NEVER CALLED — FOUND LIVE, 4 September 2026.
 *
 * At 3.485.0 this was imported from `prison.mjs` precisely so the ruling
 * would have one owner, and the only thing that ever called it was
 * `verify-flat-ladder`. Production asked `flatOutcome` for the RAW
 * rolled degree, which is one of seven; the ladder names four; the other
 * three matched no rung, and `applyFlatLadder` returned an empty array
 * in silence.
 *
 * So a BLUNDER on Word Of Death did nothing at all — no damage, no
 * death, not a line on the card — while a fumble killed outright. The
 * worst roll in the game was safer than the second worst, which is the
 * exact fault `spell-degrees.mjs` was written to fix. Heroic and partial
 * vanished the same way.
 *
 * `verify-rules-have-callers` could not see it: a verifier IS a caller.
 * A test is not a use.
 *
 * THE MAPPING NOW LIVES INSIDE `flatOutcome`, which is the one door
 * every rung is fetched through, so no future caller can forget it.
 */
export const flatDegree = prisonDegree;

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

const int = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/**
 * A flat-ladder row, or null when it is malformed.
 *
 * EVERY DEGREE MUST BE NAMED, for the reason `normalisePrison` gives: a
 * ladder missing one is not a spell with a gap, it is a spell whose
 * behaviour on that roll nobody decided.
 *
 * @param {object} raw the effect row as authored on the pack entry
 * @returns {object|null}
 */
export function normaliseFlatLadder(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "flatLadder") return null;

  const damageType = lower(raw.damageType);
  if (!damageType) return null;

  const ladder = {};
  for (const degree of FLAT_DEGREES) {
    const rung = raw.ladder?.[degree];
    if (rung === undefined || rung === null) return null;
    if (typeof rung !== "object") return null;
    ladder[degree] = {
      // DAMAGE MAY BE ZERO AND THAT IS A REAL ANSWER — Serenity's
      // Critical is "unaffected". Absent is a gap; zero is a decision.
      damage: Math.max(0, int(rung.damage)),
      // "DIES INSTANTLY" as its own field rather than a huge number,
      // because death here is a rule and not an amount of damage: Word
      // Of Death kills a creature on a Fumble whatever its hit points.
      dies: rung.dies === true,
      // "if the target has 100 HP or fewer, it dies instantly; otherwise
      // it drops to -10 HP" — a threshold, and the -10 with it.
      //
      // NULL IS ABSENT TOO, AND THIS NORMALISER MUST BE IDEMPOTENT.
      //
      // FOUND LIVE, 4 September 2026. A repeating curse stores its
      // NORMALISED ladder on the target and re-normalises it on every
      // bite. Normalising writes `null` where a field was absent; this
      // line tested only for `undefined`, so the second pass read that
      // `null` as a present value and `int(null)` is 0.
      //
      // "No death threshold" therefore became "a threshold of 0", and
      // Serenity — a spell whose worst rung is 10 Mental damage — bit a
      // creature on 50 HP and printed "drops to 0 HP". Fifty hit points
      // on one Strike, from a round trip through its own output.
      //
      // A normaliser that corrupts its own result is a trap for every
      // future caller that stores one, so the fix is idempotence rather
      // than storing the raw row at the one call site that noticed.
      diesAtOrBelow: rung.diesAtOrBelow === undefined || rung.diesAtOrBelow === null
        ? null : int(rung.diesAtOrBelow),
      dropsTo: rung.dropsTo === undefined || rung.dropsTo === null
        ? null : int(rung.dropsTo),
      // "if this brings the target to 0 HP, the target dies instantly"
      diesIfReducedToZero: rung.diesIfReducedToZero === true,
      // Serenity: a critical injury, optionally at a modifier.
      criticalInjury: rung.criticalInjury === true,
      criticalModifier: int(rung.criticalModifier)
    };
  }

  return {
    label: text(raw.label) || "Effect",
    damageType,
    save: text(raw.save) || "Will",
    ladder,
    // SERENITY REPEATS; WORD OF DEATH DOES NOT. Declared rather than
    // inferred from the presence of a duration — a later spell with a
    // duration and a one-off payload would otherwise start repeating.
    repeatsOnOffensiveAction: raw.repeatsOnOffensiveAction === true,
    // "Once targeted, the target is then temporarily immune for 10
    // minutes" — seconds, so the existing temporary-immunity mechanism
    // can carry it unchanged.
    immuneSeconds: Math.max(0, int(raw.immuneSeconds))
  };
}

/**
 * What one rung costs.
 *
 * TAKES A ROLLED DEGREE, NOT A PRINTED ONE. The seven-to-four mapping
 * happens HERE because this is the single door every rung is fetched
 * through — see `flatDegree` above for the release that shipped with the
 * mapping imported, exported, tested and never called. The mapping is
 * idempotent, so a printed degree passed in comes back as itself.
 *
 * @param {object|null} spec
 * @param {string} degree a rolled degree, or a printed one
 * @returns {object|null} null only when the key is not a degree at all
 */
export function flatOutcome(spec, degree) {
  if (!spec) return null;
  const d = flatDegree(degree);
  if (!d || !FLAT_DEGREES.includes(d)) return null;
  return spec.ladder[d];
}

/**
 * What actually happens to a creature on this rung, given its hit points.
 *
 * THE ORDER OF THE TESTS IS THE RULE. Word Of Death's Failure reads "if
 * the target has 100 HP or fewer, it dies instantly; OTHERWISE it drops
 * to -10" — so the threshold is asked BEFORE the drop, and a creature on
 * exactly 100 dies ("or fewer" includes the boundary). Its Success reads
 * "50 damage; IF THIS BRINGS the target to 0 HP" — so the damage lands
 * first and the death is a consequence of the result, not of the
 * starting total.
 *
 * @param {object|null} rung from `flatOutcome`
 * @param {number} currentHP
 * @returns {{damage:number, dies:boolean, finalHP:number|null, reason:string}}
 */
export function flatResolution(rung, currentHP) {
  const hp = int(currentHP);
  if (!rung) return { damage: 0, dies: false, finalHP: null, reason: "" };

  if (rung.dies) {
    return { damage: 0, dies: true, finalHP: null, reason: "the spell kills outright" };
  }
  if (rung.diesAtOrBelow !== null) {
    if (hp <= rung.diesAtOrBelow) {
      return {
        damage: 0, dies: true, finalHP: null,
        reason: `at ${hp} HP — ${rung.diesAtOrBelow} or fewer`
      };
    }
    return {
      damage: 0, dies: false, finalHP: rung.dropsTo ?? 0,
      reason: `above ${rung.diesAtOrBelow} HP — dropped to ${rung.dropsTo ?? 0}`
    };
  }
  const damage = rung.damage;
  const after = hp - damage;
  if (rung.diesIfReducedToZero && after <= 0) {
    return { damage, dies: true, finalHP: null, reason: "brought to 0 HP by the damage" };
  }
  return { damage, dies: false, finalHP: null, reason: "" };
}

/* ═════════════════════════════════════════════════════════════════════
 * WHAT COUNTS AS AN OFFENSIVE ACTION
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * Actions that carry the `attack` trait but are not offensive.
 *
 * GRAHAM'S RULING, 4 September 2026: use the attack trait the system
 * already has, minus the ones that plainly are not offensive.
 *
 * MEASURED, NOT GUESSED. Fourteen of the thirty-one basic actions carry
 * the trait, and two of them are defensive by their own names: Aid
 * Defensive helps an ally, and Escape gets you out of a grapple. A
 * cursed creature squirming free of a grab is not taking an offensive
 * action, and charging it for one would make the spell punish the thing
 * it is meant to leave alone.
 */
export const NOT_OFFENSIVE = Object.freeze(["aidDefensive", "escape"]);

/**
 * Effect kinds whose recipients are everyone who rolled, not the
 * failures.
 *
 * A ladder names an outcome for every degree — Serenity's Success is
 * five Mental, Word Of Death's is fifty — so the creatures it applies to
 * are the creatures who made a save, whatever they rolled. See the
 * comment at the recipient split in `spell-effects.mjs` for the release
 * that shipped without this and made one creature's outcome depend on
 * another creature's roll.
 *
 * `prison` IS DELIBERATELY NOT HERE. A prison resolves from its own card
 * interaction rather than from the cast's effect loop, so it never
 * reaches that split; adding it would be a change to spells this
 * release has not measured.
 */
// AND `movementBind` (3.606.0) — Spirit Trap names an outcome for every
// degree too, including "unaffected", so it is handed everyone who rolled
// and reads each one's rung itself.
export const LADDER_KINDS = Object.freeze(["flatLadder", "movementBind"]);

/**
 * Does this action trigger a repeating curse?
 *
 * @param {object|null} action the action being taken
 * @param {boolean} atUnwillingTarget a spell aimed at an unwilling creature
 * @returns {boolean}
 */
export function isOffensiveAction(action, atUnwillingTarget = false) {
  if (atUnwillingTarget) return true;
  const key = text(action?.key);
  if (NOT_OFFENSIVE.includes(key)) return false;
  return /\battack\b/i.test(String(action?.traits ?? ""));
}

/* ═════════════════════════════════════════════════════════════════════
 * THE CARD
 * ═══════════════════════════════════════════════════════════════════ */

/** The whole printed ladder, for the cast card. */
export function flatLadderLine(spec) {
  return FLAT_DEGREES
    .map((d) => {
      const r = spec.ladder[d];
      const bits = [];
      if (r.dies) bits.push("dies instantly");
      else if (r.diesAtOrBelow !== null) {
        bits.push(`dies at ${r.diesAtOrBelow} HP or fewer, else drops to ${r.dropsTo ?? 0}`);
      } else if (r.damage > 0) {
        bits.push(`${r.damage} ${spec.damageType}`);
        if (r.diesIfReducedToZero) bits.push("dies if brought to 0");
      } else bits.push("unaffected");
      if (r.criticalInjury) {
        bits.push(r.criticalModifier
          ? `a critical injury at ${r.criticalModifier}`
          : "a critical injury");
      }
      return `${d}: ${bits.join(", ")}`;
    })
    .join("; ");
}

/**
 * How the card names the degree, when the roll and the rung differ.
 *
 * A player who rolled a BLUNDER and reads "fumble: 10 mental" has been
 * told a number and not why it is theirs. Both, or the card is hiding
 * the one step a reader cannot reconstruct — the spell prints four
 * outcomes and the table rolls seven.
 *
 * NOT EXPORTED. Only the two line-builders below use it, and
 * `verify-rules-have-callers` was right to flag the exported version:
 * an export nobody outside this file calls is a wider surface than the
 * rule needs.
 */
function flatDegreeLabel(rolled) {
  const printed = flatDegree(rolled);
  const raw = lower(rolled);
  if (!printed) return raw;
  return printed === raw ? printed : `${raw} (as ${printed})`;
}

/** What the card says when the ladder bites. */
export function flatOutcomeLine(spec, name, degree, resolution, taken) {
  const shown = flatDegreeLabel(degree);
  if (resolution.dies) {
    return `<strong>${name} dies</strong> — ${resolution.reason}.`;
  }
  if (resolution.finalHP !== null) {
    return `<strong>${name}</strong> drops to <strong>${resolution.finalHP} HP</strong> — ${resolution.reason}.`;
  }
  if (!resolution.damage) {
    return `<em>${name} is unaffected (${shown}).</em>`;
  }
  const reduced = Number(taken) !== Number(resolution.damage) ? ", reduced by their defences" : "";
  return `<strong>${name}</strong>: ${shown} — <strong>${taken}</strong> ${spec.damageType}`
    + ` (${resolution.damage}${reduced}).`;
}

/** What the card says about a curse that will keep biting. */
export function flatCurseLine(spec, name, degree) {
  return `<em>${name} carries ${spec.label} (${flatDegreeLabel(degree)}) — it bites again on every`
    + " offensive action they take while it lasts.</em>";
}

/**
 * What the card says when a ladder was asked for a degree it cannot map.
 *
 * SAID OUT LOUD RATHER THAN RETURNED EMPTY. The 3.485.0 defect was
 * invisible for exactly one reason: an unmatched degree produced no
 * lines, so the card read "is affected" and then stopped, and nothing
 * anywhere said a rung had been asked for and not found. A diagnostic
 * nobody ever sees costs nothing; a silence costs a release.
 */
export function flatNoRungLine(spec, name, degree) {
  return `<em>${spec.label} has no outcome recorded for a ${lower(degree) || "missing"} result`
    + ` — ${name} is unaffected. This is a gap in the spell's data, not a rule.</em>`;
}
