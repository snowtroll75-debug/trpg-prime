/**
 * A SKILL CHECK THE SPELL'S VICTIM ROLLS (3.605.0, Graham's Shape Stone
 * ruling of 29 September 2026).
 *
 * Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SHAPE STONE IS THE ONE BEING BUILT. IT IS NOT THE ONLY ONE.
 *
 *   SHAPE STONE (PP 8, page 316)
 *     "Creatures standing on the stone during its transformation must
 *      each make an Acrobatics check to maintain their balance.
 *        Success  The creature is unaffected.
 *        Failure  The creature falls prone atop the stone.
 *        Fumble   The creature falls off the stone (if applicable) and
 *                 lands prone."
 *
 * Measured against the pack: FOUR spells print this same sentence — a
 * NAMED SKILL rolled against the caster's DC, with a degree ladder whose
 * rungs each say what happens. Shape Stone, Transmute Rock & Mud, Shroud
 * and Web. Three of the four carry `effects: []`.
 *
 * So the mechanism is named for what it is rather than for the spell that
 * paid for it, and the rungs are DECLARED PER SPELL. The other three are
 * reported rather than built: Transmute Rock & Mud offers a choice of a
 * Reflex save OR the check, Shroud's rungs change the spell's DURATION
 * instead of applying anything, and Web's outcome depends on WHICH skill
 * was used and repeats on every move. Each is a ruling of its own.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LADDER IS READ THE SAME WAY A SAVE LADDER IS, AND THAT IS CHECKED.
 *
 * Shape Stone names three rungs of seven. A Critical is not printed, and
 * neither is a Partial or a Blunder — so the same question arises as for
 * every gated spell in the Grimoire, and it gets the same answer:
 *
 *   A SUCCEEDING DEGREE THAT IS NOT NAMED APPLIES NOTHING. Heroic and
 *   Critical are better than the Success rung, and Shape Stone's Success
 *   rung is "unaffected" — so nothing happening is the printed outcome
 *   arrived at by the ordinary route, not a special case.
 *
 *   A FAILING DEGREE IS CLAMPED TO THE HARSHER SIDE. Partial falls to
 *   Failure; Blunder falls to Fumble. The alternative — letting a Blunder
 *   fall off the bottom of the ladder — would make the worst roll in the
 *   game safer than the second worst, which is the defect that rule was
 *   written for.
 *
 * `effectiveSaveDegree` in magic/spell-degrees.mjs already decides this
 * for effect rows, and `skillLadderDegree` decides it for a rung map. Two
 * functions answering one question is how they drift, so the harness holds
 * them against each other across all seven degrees rather than trusting
 * this paragraph — the same guard `verify-spell-degrees` puts on
 * `prison.mjs`.
 */

import { DEGREE_BY_KEY } from "../dice/resolution.mjs";
import { SKILLS } from "../config.mjs";

/** The effect kind a spell declares this with. */
export const SKILL_LADDER_KIND = "skillLadder";

const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();

/**
 * The ladder a row declares, or null when it declares nothing usable.
 *
 * THE SKILLS ARE VALIDATED AGAINST THE SHEET'S OWN VOCABULARY, because a
 * row naming a skill this system does not have is a check nobody can
 * roll — and it would fail silently, as a bystander with no bonus.
 */
export function normaliseSkillLadder(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== SKILL_LADDER_KIND) return null;

  const skills = [];
  for (const s of Array.isArray(raw.skills) ? raw.skills : []) {
    const k = lower(s);
    if (Object.prototype.hasOwnProperty.call(SKILLS, k) && !skills.includes(k)) skills.push(k);
  }
  if (!skills.length) return null;

  const degrees = {};
  for (const [key, rung] of Object.entries(raw.degrees ?? {})) {
    const k = lower(key);
    if (!DEGREE_BY_KEY[k] || !rung || typeof rung !== "object") continue;
    const conditions = [];
    for (const c of Array.isArray(rung.conditions) ? rung.conditions : []) {
      const id = lower(c?.key ?? c);
      if (id) conditions.push({ key: id, value: Math.trunc(Number(c?.value) || 0) || null });
    }
    // A RUNG MAY SET HOW LONG THE SPELL LASTS ON THIS CREATURE (3.606.0,
    // block 32's R2). Shroud: "Success The effect lasts for 1 round.
    // Failure The effect lasts its normal duration." Empty means the
    // spell's own duration; `unaffected` is its own declared word.
    degrees[k] = {
      text: text(rung.text),
      conditions,
      duration: text(rung.duration),
      unaffected: rung.unaffected === true
    };
  }
  // A LADDER WITH NO RUNGS IS NOT A LADDER. A row that declared one and
  // then named none would otherwise make every creature roll a check that
  // could not do anything, which is worse than not rolling.
  if (!Object.keys(degrees).length) return null;

  /*
   * TWO SHAPES OF LADDER, DECLARED RATHER THAN INFERRED (3.606.0).
   *
   *   SHAPE STONE — bystanders. The GM names who was standing on the
   *   stone from every token on the scene; the rungs apply conditions.
   *
   *   SHROUD — the spell's own target. "If the creature is unwilling, it
   *   can attempt an Acrobatics check to avoid the shroud and reduce the
   *   effect." So the picker lists the CAST's targets, the GM ticks the
   *   unwilling ones, and each rung GOVERNS what the spell's other rows do
   *   to that creature: nothing, a round of them, or their full duration.
   *   An unticked target is willing and takes the spell as cast.
   *
   * `candidates` defaults to the scene and `governs` to false, so Shape
   * Stone — the only ladder before this — reads exactly as it did.
   */
  const candidates = text(raw.candidates) === "targets" ? "targets" : "scene";
  return {
    skills,
    degrees,
    label: text(raw.label) || "Check",
    candidates,
    governs: candidates === "targets" && raw.governs === true,
    prompt: text(raw.prompt),
    purpose: text(raw.purpose),
    judged: text(raw.judged),
    nobody: text(raw.nobody)
  };
}

/**
 * Which rung this roll reads at.
 *
 * See the header: unnamed succeeding degrees apply nothing, unnamed
 * failing degrees clamp to the harsher named rung.
 */
export function skillLadderDegree(spec, rolled) {
  const declared = Object.keys(spec?.degrees ?? {});
  const key = lower(rolled);
  if (declared.includes(key)) return key;

  const self = DEGREE_BY_KEY[key];
  if (!self) return key;
  if (self.success) return key;

  let nearest = null;
  let worst = null;
  for (const name of declared) {
    const entry = DEGREE_BY_KEY[name];
    if (!entry) continue;
    if (entry.rank <= self.rank && (nearest === null || entry.rank > nearest.rank)) nearest = entry;
    if (worst === null || entry.rank < worst.rank) worst = entry;
  }
  return (nearest ?? worst)?.key ?? key;
}

/**
 * What this roll does to the creature that made it.
 *
 * RETURNS THE RUNG AND THE DEGREE IT WAS READ AT, both, so a card can say
 * "rolled a Partial, read at Failure" rather than quietly showing the one
 * the player did not roll.
 */
export function skillLadderOutcome(spec, rolled) {
  const at = skillLadderDegree(spec, rolled);
  const rung = spec?.degrees?.[at] ?? null;
  return {
    rolled: lower(rolled),
    at,
    clamped: at !== lower(rolled),
    conditions: rung?.conditions ?? [],
    text: rung?.text ?? "",
    duration: rung?.duration ?? "",
    unaffected: !rung || rung.unaffected === true
  };
}

/**
 * Who takes a governed spell's rows, and for how long.
 *
 * THE WILLING ARE NOT ASKED. A target the GM left unticked is accepting
 * the spell and takes it for its own duration; a resisting one takes what
 * its rung says — nothing, or the rows for the rung's duration.
 *
 * @param {Array<{actor:any, resisted:boolean, outcome:object|null}>} rolls
 * @returns {Array<{duration: string, actors: any[]}>} one group per length;
 *   "" means the spell's own duration
 */
export function governedGroups(rolls) {
  const groups = new Map();
  for (const r of Array.isArray(rolls) ? rolls : []) {
    if (!r?.actor) continue;
    if (r.resisted && (!r.outcome || r.outcome.unaffected)) continue;
    const length = r.resisted ? String(r.outcome.duration ?? "") : "";
    if (!groups.has(length)) groups.set(length, []);
    groups.get(length).push(r.actor);
  }
  return Array.from(groups, ([duration, actors]) => ({ duration, actors }));
}

/** The skills this ladder offers, for the card and the dialog. */
export function skillLadderLabels(spec) {
  return (spec?.skills ?? []).map((k) => SKILLS[k]?.label ?? k);
}

/* ══════════════════════════════════════════════════════════════════ *
 * THE CARD
 * ══════════════════════════════════════════════════════════════════ */

/** What the card says before anybody rolls. */
export function skillLadderOpeningLine(spellName, spec, dc, names) {
  const who = names.length
    ? `<strong>${names.join("</strong>, <strong>")}</strong>`
    : "<em>nobody</em>";
  const skills = skillLadderLabels(spec).join(" or ");
  return `${who} must each attempt ${indefiniteArticle(skills)} <strong>${skills}</strong> `
    + `check against DC <strong>${dc}</strong> — ${spellName}.`;
}

/**
 * "a" or "an", by the first letter of what follows (3.606.0).
 *
 * FOUND ON THE 3.605.1 LIVE TEST: "must each attempt a Acrobatics check".
 * The article was typed into the sentence, so it was wrong for every skill
 * that starts with a vowel — Acrobatics, Athletics, Arcana, Artistry,
 * Intimidate — which is five of the skills a ladder is most likely to name.
 *
 * BY LETTER, NOT BY SOUND. No skill in SKILLS starts with a silent letter or
 * a "you" sound, so the letter is the whole rule here, and a table of
 * exceptions nothing needs would be a table nobody tests.
 *
 * MODULE-LOCAL. The opening line is its caller; the harness drives it
 * through that line, with every skill in SKILLS.
 */
function indefiniteArticle(word) {
  return /^[aeiou]/i.test(String(word ?? "").trim()) ? "an" : "a";
}

/** And when the GM named nobody, which is a spell that asked no questions. */
export function skillLadderNobodyLine(spellName, spec = null) {
  if (spec?.nobody) return `<em>${spellName}: ${spec.nobody}</em>`;
  return `<em>${spellName}: nobody was standing on it, so no checks were called for.</em>`;
}

/** What the card says about one creature's result. */
export function skillLadderResultLine(name, spec, outcome, rolledTotal, dc) {
  const at = DEGREE_BY_KEY[outcome.at]?.label ?? outcome.at;
  const rolledLabel = DEGREE_BY_KEY[outcome.rolled]?.label ?? outcome.rolled;
  // THE ROLL THAT WAS MADE AND THE RUNG IT WAS READ AT. A card that
  // printed only the rung would be showing a degree the player did not
  // roll, and the clamp is exactly where somebody will want to check the
  // working.
  const readAt = outcome.clamped
    ? ` (<strong>${rolledLabel}</strong>, read at the <strong>${at}</strong> rung)`
    : ` (<strong>${at}</strong>)`;
  const what = outcome.unaffected
    ? "is unaffected"
    : outcome.text || "is affected";
  return `<strong>${name}</strong> rolls <strong>${rolledTotal}</strong> vs DC `
    + `<strong>${dc}</strong>${readAt} — ${what}.`;
}

/**
 * And the half the table settles.
 *
 * PER SPELL SINCE 3.606.0. This was Shape Stone's sentence, written into
 * the module when Shape Stone was the only ladder — so Shroud's card would
 * have closed by talking about a stone. A row that declares `judged` says
 * its own; one that does not keeps Shape Stone's, word for word.
 */
export function skillLadderJudgedLine(spec = null) {
  if (spec?.judged) return `<em>${spec.judged}</em>`;
  return "<em>Judged at the table: who was standing on the stone when it moved, and whether "
    + "there is anywhere to fall off to.</em>";
}
