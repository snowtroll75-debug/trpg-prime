/**
 * VIBRANT THORNS — a rider on being HIT, and the mirror of a strike rider.
 *
 * NEW at 3.440.0. Pure; no Foundry.
 *
 *   "Whenever a creature adjacent to you or a creature that hits you with
 *    an unarmed attack lands a melee blow, they suffer 1 piercing damage.
 *    Furthermore, whenever you cast an essence spell, the potency of your
 *    thorns intensifies, inflicting 1d6 damage on those who come into
 *    contact with them until the beginning of your next turn."
 *
 *   Vibrant Thorns, PP 1, Duration 1 minute.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SAME PACKET, POINTED THE OTHER WAY.
 *
 * `strike-riders.mjs` hangs a secondary damage packet on the blows you
 * DEAL. This hangs one on the blows you TAKE, and it lands in the same
 * function — `resolveWeaponDamage` — a few lines from the Vicious rune,
 * which already feeds damage back into the wielder and is the nearest
 * existing shape. So thorns are rolled, resolved against the ATTACKER's
 * own defences and applied through the same pipeline as everything else:
 * a creature immune to piercing walks through a briar patch unharmed,
 * which is what a separate packet is for.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT "ADJACENT" HAS TO MEAN, and why the second clause is not ignored.
 *
 * The printed trigger has two routes into one verb: *"a creature adjacent
 * to you, OR a creature that hits you with an unarmed attack, lands a
 * melee blow."* An unarmed attacker is adjacent by definition, so the
 * second clause adds nothing for a human — but it is written down, so it
 * is implemented rather than argued away: a creature whose unarmed reach
 * exceeds five feet still sets the thorns off.
 *
 * ADJACENT IS FIVE FEET, and that number is the system's own default
 * melee reach rather than a constant invented here. A reach weapon
 * striking from ten feet is NOT adjacent and the thorns do not reach it,
 * which is the whole point of the word being in the spell.
 *
 * A DISTANCE NOBODY MEASURED DOES NOT TRIGGER. Off a canvas — a Strike
 * resolved with no tokens placed — the honest answer is that nothing can
 * say whether the attacker was adjacent, and thorns that fired anyway
 * would be a different rule. The unarmed route still works there, because
 * that one does not depend on geometry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONLY A BLOW THAT LANDS. "Lands a melee blow" — a miss touches no
 * thorns. And only a MELEE one: an arrow does not come into contact with
 * anything growing on the archer's target.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE INTENSIFIED WINDOW IS A ROUND STAMP, NOT A DURATION.
 *
 * "Until the beginning of your next turn" is the turn clock's question,
 * not the world clock's, and this project has answered it before:
 * Luminance hangs off the turn-start pass for exactly this reason. So
 * casting an essence spell stamps the round it happened in, and the
 * caster's next turn-start clears it. Nothing counts seconds, and a
 * window opened out of combat simply never closes on its own — which is
 * the truthful answer when there are no turns to begin.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "ESSENCE", NOT "POSITIVE" — SETTLED BY THE BOOK ITSELF.
 *
 * Core 3.5 said both: the body read "whenever you cast an ESSENCE spell"
 * and the +4 PP warp read "or 1d6 after you cast a POSITIVE spell". This
 * file shipped the body's word at 3.440.0 on the grounds that `Essence`
 * is a real trait carried by real spells and "positive" is not a trait at
 * all, and recorded the disagreement rather than resolving it quietly.
 *
 * CORE 3.7 (29 August 2026) AMENDS THE WARP TO "ESSENCE" and renames the
 * POSITIVE trait to ESSENCE throughout — Magnificent Dawn, Metabolism and
 * Reincarnated Embrace all carried it. So the reading was right and the
 * book now agrees with it, and those three spells sharpen a druid's
 * thorns where under the old word they would not have.
 */

import { DEGREE_ORDER, ladderDegree } from "./save-ladder.mjs";

/** The system flag carrying one creature's thorns. */
export const THORNS_FLAG = "thorns";

/**
 * Adjacent, in feet — the system's default melee reach.
 *
 * NOT EXPORTED, and neither is the trait below: both are reachable by
 * driving `normaliseThorns`, `thornsTriggered` and `intensifiesThorns`,
 * which is what ships. The uncalled-export ratchet asked, and stopping
 * exporting was the honest answer rather than two "harness-only" keeps.
 */
const ADJACENT_FEET = 5;

/** The trait whose casting intensifies the thorns. */
const INTENSIFY_TRAIT = "essence";

// "3d8+10" (3.640.0, the Balor's flames) as well as "1d6" and "1".
const DICE_OR_FLAT = /^(?:[1-9]\d*d[1-9]\d*(?:[+-]\d+)?|[1-9]\d*)$/i;
const text = (value) => String(value ?? "").trim();
const SAVE_KEYS = Object.freeze(["fortitude", "reflex", "will"]);

/*
 * A CONDITION LADDER IN PLACE OF DAMAGE (3.685.0, H1; Eldritch Arts' Prismatic
 * Guard: "any creature that successfully damages one of the protected targets
 * with a melee strike must make a Fortitude saving throw: Critical unaffected;
 * Success Dazzled until the end of their turn; … Fumble permanently Blinded").
 * Degree key → effect rows, applied to the attacker by the spell engine. A
 * missing rung reads as the core's ladders read one (`ladderDegree`, m42).
 */
function normaliseThornsLadder(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  for (const key of DEGREE_ORDER) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const rows = raw[key];
    out[key] = Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object") : [];
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A thorns row after the warps this cast bought (3.613.0).
 *
 * Vibrant Thorns: "+4 PP: The damage increases by 1, or 1d6 after you cast
 * an essence spell" — two growths for one purchase, because the thorns have
 * two damages. The row declares what one purchase adds to each in
 * `warpStep`; `times` is how often it was bought (the `bonusValue` the
 * aggregator already counts). A flat damage grows by a number and a die by
 * dice of its own size, which is all either line on the page asks; a shape
 * the step cannot grow is left as printed rather than guessed at.
 *
 * @param {object} raw the authored row
 * @param {number} times purchases
 * @returns {object} a row `normaliseThorns` accepts
 */
export function warpedThorns(raw, times = 0) {
  const n = Math.max(0, Math.trunc(Number(times) || 0));
  const step = raw?.warpStep;
  if (!raw || !n || !step || typeof step !== "object") return raw;
  const grow = (formula, by) => {
    const f = text(formula);
    if (!by) return f;
    if (/^\d+$/.test(f) && /^\d+$/.test(text(by))) return String(Number(f) + Number(by) * n);
    const a = /^(\d+)d(\d+)$/i.exec(f);
    const b = /^(\d+)d(\d+)$/i.exec(text(by));
    if (a && b && a[2] === b[2]) return `${Number(a[1]) + Number(b[1]) * n}d${a[2]}`;
    return f;
  };
  return { ...raw, damage: grow(raw.damage, step.damage), intensified: grow(raw.intensified, step.intensified) };
}

/**
 * Validate and normalise one authored thorns row.
 *
 * IDEMPOTENT, like every other spec this project stores on a flag and
 * reads back — `held-bonus.mjs` is where that lesson was paid for.
 *
 * BOTH FORMULAE ARE REQUIRED AND BOTH ARE CHECKED. "1" and "1d6" are
 * different shapes and an author could plausibly write either in either
 * slot, so both are accepted in both — but neither may be something the
 * dice engine has never seen.
 */
export function normaliseThorns(raw) {
  if (!raw || typeof raw !== "object") return null;
  const damage = text(raw.damage);
  const intensified = text(raw.intensified);
  // A LADDER MAY STAND IN FOR THE DAMAGE (3.685.0, H1), and then needs a
  // rolled save to read it by.
  const ladder = normaliseThornsLadder(raw.ladder);
  // IDEMPOTENT FOR A ROLLED SAVE TOO (3.685.0): a spell's thorns are stored
  // normalised (`save: ""`, `saveRoll: {…}`) and read back through here, so
  // the normalised field is accepted where the authored one is absent.
  const saveSource = raw.save && typeof raw.save === "object" ? raw.save
    : raw.saveRoll && typeof raw.saveRoll === "object" ? raw.saveRoll : null;
  const rolledSave = Boolean(saveSource) && SAVE_KEYS.includes(text(saveSource.key).toLowerCase());
  if (ladder && !rolledSave) return null;
  if (!(ladder && !damage) && !DICE_OR_FLAT.test(damage)) return null;
  if (intensified && !DICE_OR_FLAT.test(intensified)) return null;
  const damageType = text(raw.damageType).toLowerCase();
  if (!damageType && !(ladder && !damage)) return null;
  // "+ 1 DAMAGE PER CASTER LEVEL (MAXIMUM +15)" (3.685.0, H1; Glyph of
  // Retribution). Stamped into `damage` at the cast by `spellThorns`; kept on
  // the row so a stamped row reads the same twice.
  const levelMax = Math.trunc(Number(raw.casterLevelBonus?.max ?? raw.casterLevelBonus ?? 0) || 0);
  const out = {
    label: text(raw.label) || "Thorns",
    damage,
    intensified,
    damageType,
    reachFeet: Math.max(0, Math.trunc(Number(raw.reachFeet ?? ADJACENT_FEET)) || ADJACENT_FEET),
    /*
     * A SAVE THE ATTACKER MAY MAKE — Elemental Shield, 3.473.0.
     *
     *   "any adjacent creature that attacks you with a melee attack must
     *    make a Basic Reflex saving throw or take 2d6 damage."
     *
     * Vibrant Thorns has no save and passes nothing, so this is empty for
     * it and the behaviour it has had since August is untouched.
     *
     * PRINTED, NOT ROLLED, which is the position hazard-terrain took for
     * Verdant Retribution's Basic Fortitude and for the same reason: this
     * fires inside somebody else's completed Strike, and a prompt would
     * arrive after the damage it is meant to halve. Named on the card so a
     * table can apply it rather than silently dropped.
     */
    save: typeof raw.save === "string" ? text(raw.save) : "",
    /*
     * A SAVE THAT IS ROLLED (3.640.0; Fiends & Fables 3.0 block 10, R4).
     * The Aroch's Reactive Slime — "the attacker must make a basic Reflex
     * save against 2d6 acid damage" — and the Balor's flames on whoever
     * strikes it, where "this saving throw does not lessen the damage".
     * A creature's own ability, so its DC is printed and its save is rolled
     * for the attacker rather than left on the card:
     *
     *   save: { key: "reflex", dc: 21, basic: true, avoidsCriticalOnly: false }
     */
    saveRoll: rolledSave
      ? {
        key: text(saveSource.key).toLowerCase(),
        dc: Math.max(0, Math.trunc(Number(saveSource.dc) || 0)),
        // AT THE CASTER'S SAVE DC (3.685.0, H1): `dc: "spell"` is stamped by
        // the cast (`spellThorns`); until then it is 0, which the workflow
        // never rolls against the defender's Level DC.
        ...(text(saveSource.dc).toLowerCase() === "spell" || saveSource.dcFrom === "spell" ? { dcFrom: "spell" } : {}),
        // A LADDER'S SAVE IS NOT BASIC: its rung is the whole result.
        basic: ladder ? false : saveSource.basic !== false,
        avoidsCriticalOnly: saveSource.avoidsCriticalOnly === true
      }
      : null,
    // "R: Trigger …" — a REACTION: spent from the creature's pool, and
    // refused in combat when none is left.
    reaction: raw.reaction === true,
    // MOLTEN BLOOD (3.644.0, F&F 3.0 block 14 R4): "struck for a critical
    // hit in melee" — only a critical blow sets it off.
    criticalOnly: raw.criticalOnly === true
  };
  if (ladder) out.ladder = ladder;
  if (levelMax > 0) out.casterLevelBonus = { max: levelMax };
  if (raw.casterLevelStamped === true) out.casterLevelStamped = true;
  if (text(raw.spellName)) out.spellName = text(raw.spellName);
  return out;
}

/**
 * A SPELL'S THORNS, AS CAST (3.685.0, H1). The cast's Save DC on a
 * `dc: "spell"` save, and "+ caster level, max N" folded into the damage —
 * once (`casterLevelStamped`), so a row read again is not grown again.
 *
 * @param {object} spec a normalised row
 * @param {{saveDC?: number, casterLevel?: number, spellName?: string}} cast
 * @returns {object} a row `normaliseThorns` accepts
 */
export function spellThorns(spec, { saveDC = 0, casterLevel = 0, spellName = "" } = {}) {
  if (!spec) return spec;
  const out = { ...spec, ...(spec.saveRoll ? { saveRoll: { ...spec.saveRoll } } : {}) };
  if (out.saveRoll?.dcFrom === "spell" && Number(saveDC) > 0) out.saveRoll.dc = Math.trunc(Number(saveDC));
  if (out.casterLevelBonus && !out.casterLevelStamped && out.damage) {
    const add = Math.min(Math.max(0, Math.trunc(Number(casterLevel) || 0)), out.casterLevelBonus.max);
    // ONTO A FLAT TERM ALREADY THERE (3.685.0, review): "1d6+1" at CL 10 is
    // "1d6+11", not the bonus dropped.
    if (add > 0) {
      const flat = /^(.*?)([+-])(\d+)$/.exec(out.damage);
      if (/^\d+$/.test(out.damage)) out.damage = String(Number(out.damage) + add);
      else if (flat) {
        const sum = (flat[2] === "-" ? -Number(flat[3]) : Number(flat[3])) + add;
        out.damage = sum === 0 ? flat[1] : `${flat[1]}${sum > 0 ? "+" : "-"}${Math.abs(sum)}`;
      } else out.damage = `${out.damage}+${add}`;
    }
    out.casterLevelStamped = true;
  }
  if (spellName && !out.spellName) out.spellName = String(spellName);
  // BACK INTO THE AUTHORED SHAPE, so `normaliseThorns` reads it again.
  return {
    ...out,
    save: out.saveRoll ? { ...out.saveRoll } : out.save
  };
}

/** The rows a rolled degree reads on a thorns ladder (m42 for missing rungs). */
export function thornsLadderRows(spec, degree) {
  if (!spec?.ladder) return { at: null, rows: [] };
  const at = ladderDegree(spec.ladder, degree);
  return { at, rows: at ? spec.ladder[at] ?? [] : [] };
}

/**
 * A rolled thorns save's effect on the damage (3.640.0): the basic save's
 * multiplier, never below full when the save only avoids the critical.
 */
export function thornsSaveMultiplier(spec, basicMultiplier) {
  const m = Number(basicMultiplier) || 0;
  return spec?.saveRoll?.avoidsCriticalOnly ? Math.max(1, m) : m;
}

/**
 * Did this blow come into contact with the thorns?
 *
 * @param {object} spec a normalised thorns row
 * @param {object} blow
 * @param {boolean} blow.hit          did the attack land?
 * @param {boolean} blow.melee        was it a melee blow?
 * @param {boolean} blow.unarmed      was it an unarmed attack?
 * @param {number|null} blow.distanceFeet  measured distance, or null
 */
export function thornsTriggered(spec, { hit, melee, unarmed, distanceFeet, critical = false } = {}) {
  if (!spec) return false;
  if (!hit || !melee) return false;
  if (spec.criticalOnly && !critical) return false;
  // The second printed route, which needs no geometry.
  if (unarmed) return true;
  if (distanceFeet === null || distanceFeet === undefined) return false;
  return Number(distanceFeet) <= spec.reachFeet;
}

/**
 * Is the intensified window open on this round?
 *
 * OPEN ON THE ROUND IT WAS STAMPED AND NOT AFTER. The caster's own
 * turn-start clears the stamp, so a window that is still on the flag
 * during a later round means the clock never ran — out of combat, where
 * there are no turns. Read as open in that case, because the spell said
 * it would be and nothing has happened to end it.
 */
export function thornsIntensified(spec, { stampedRound = null, currentRound = null } = {}) {
  if (!spec?.intensified) return false;
  if (stampedRound === null || stampedRound === undefined) return false;
  if (currentRound === null || currentRound === undefined) return true;
  return Number(currentRound) <= Number(stampedRound) + 1;
}

/** The formula a triggered blow rolls. */
export function thornsFormula(spec, intensified) {
  if (!spec) return "";
  return intensified && spec.intensified ? spec.intensified : spec.damage;
}

/**
 * Does casting this spell intensify the thorns?
 *
 * READS THE TRAIT LINE, because that is what the book names and what the
 * pack actually carries. A list of spell names here would be a second
 * place deciding which spells are Essence, and it would be wrong the
 * moment one was added.
 */
export function intensifiesThorns(traitLine) {
  return new RegExp(`\\b${INTENSIFY_TRAIT}\\b`, "i").test(String(traitLine ?? ""));
}

/** What the cast card says the thorns will do. */
/** What the card adds when a thorns rider carries a save. */
export function thornsSaveNote(spec) {
  return spec?.save
    ? `A <strong>${spec.save}</strong> save applies to this damage — apply by hand.`
    : "";
}

export function thornsCastLine(spec) {
  if (!spec) return "";
  // A SAVE AT THE CAST'S DC, OR A LADDER (3.685.0, H1), said on the card.
  const saveWord = spec.saveRoll ? `${spec.saveRoll.basic ? "basic " : ""}${spec.saveRoll.key.charAt(0).toUpperCase()}${spec.saveRoll.key.slice(1)}${spec.saveRoll.dc ? ` DC ${spec.saveRoll.dc}` : ""}` : "";
  if (spec.ladder && !spec.damage) {
    return `anyone who lands a melee blow on you from within ${spec.reachFeet} feet rolls <strong>${saveWord}</strong>, and its result applies`;
  }
  const base = `<strong>${spec.damage} ${spec.damageType}</strong> to anyone who lands a melee blow on you from within ${spec.reachFeet} feet${saveWord ? ` (${saveWord})` : ""}`;
  if (!spec.intensified) return base;
  return `${base}, rising to <strong>${spec.intensified}</strong> until the beginning of your next turn whenever you cast an ${INTENSIFY_TRAIT} spell`;
}
