/**
 * NPC ATTITUDE — how one creature feels about another.
 *
 * NEW at 3.408.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PROSE EVERYWHERE, MODELLED NOWHERE.
 *
 * The ladder is printed all over the rulebook and existed only as
 * sentences in outcome text. Every one of these printed a line and
 * changed nothing:
 *
 *   Make an Impression   critical +2 steps · success +1 · failure −1 · fumble −2
 *   Coerce               failure −1 step · fumble −2 and immune for a week
 *   Request              "The NPC's attitude is friendly or helpful"
 *   Command an Animal    "automatically fails if hostile or unfriendly;
 *                         improve one degree if helpful"
 *   Tame                 one step better, for 1 minute
 *   Charm Kind/Animal/Undead, Thrall   "attitude becomes friendly"
 *   Pariah               "initial attitude one step worse"
 *   Alluring Caress      a more favourable view
 *
 * Seven spells and four skill actions, all of them reminders.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE STEPS ARE THESE FIVE.
 *
 * Page 82's CHANGING ATTITUDES section is the only place in the book that
 * DEFINES the ladder, and it names all five:
 *
 *     hostile · unfriendly · indifferent · friendly · helpful
 *
 * "Indifferent: The NPC doesn't care about you either way. (The default
 * starting attitude for most NPC's.)"
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT SAID "neutral" UNTIL 3.559.0, AND THE REASON GIVEN WAS WRONG.
 *
 * The note that stood here read: *"NOT 'indifferent'. Other games use
 * that word for the middle rung; this book says **neutral**, twice, and
 * using the familiar word instead of the printed one is how a vocabulary
 * quietly stops matching its source."*
 *
 * The principle is right and the count was not. The two "neutral"s are
 * the Tame spell — and *"you critically hit an ally or neutral within
 * range"*, which is not an attitude rung at all. Meanwhile "indifferent"
 * appears in the defining section above AND in Pariah ("unfriendly
 * instead of indifferent"). The ladder was found by reading the Tame
 * spell before page 82 had been audited; block 8 reached page 82.
 *
 * GRAHAM'S RULING R1, 16 September 2026: Indifferent is canonical, the
 * Tame spell's wording is errata, and "neutral" stays READABLE so that
 * nothing already stored on a creature stops resolving.
 *
 * So the ladder is the printed one and `neutral` is an ALIAS — accepted
 * wherever a rung is read, never written. That is the whole of the
 * compromise: the book's word is the system's word, and a sheet edited
 * by hand a month ago still works.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT IS RELATIONAL, AND THAT IS GRAHAM'S RULING (25 August 2026).
 *
 * Every printed sentence says "toward YOU". The ogre can be friendly to
 * the bard who impressed it and hostile to the paladin who did not, and
 * a single attitude per NPC would be wrong the moment two characters
 * roll different results on the same creature — which is exactly what
 * Make an Impression is for.
 *
 * So attitude is stored as a MAP keyed by the observer's uuid, on the
 * creature whose attitude it is. `attitudeToward(record, observerUuid)`.
 *
 * A PAIR NEVER RECORDED IS `indifferent`, not hostile. A creature the party
 * has never met is not thereby an enemy, and defaulting to the bottom of
 * the ladder would make every unrecorded NPC unimpressionable and every
 * animal uncommandable.
 */

import { DEGREE_ORDER } from "./creature-activation.mjs";

/** The ladder, worst to best. Order is the model — do not re-sort. */
export const ATTITUDE_STEPS = Object.freeze([
  "hostile", "unfriendly", "indifferent", "friendly", "helpful"
]);

/**
 * Words that are not rungs but resolve to one.
 *
 * ONE ENTRY, AND IT EARNS ITS PLACE. `neutral` was this system's own name
 * for the middle rung until 3.559.0 and is the Tame spell's word for it,
 * so it sits in saved creature data and in a printed sentence. Reading it
 * costs nothing; refusing it would silently reset every attitude recorded
 * before the rename.
 *
 * READ-ONLY. Nothing writes an alias back — `shiftAttitude` and friends
 * all return members of ATTITUDE_STEPS — so the data converges on the
 * printed word as soon as anything touches it.
 */
const ATTITUDE_ALIASES = Object.freeze({ neutral: "indifferent" });

/** Where a pair with no record sits. Page 82: the default for most NPCs. */
export const DEFAULT_ATTITUDE = "indifferent";

/**
 * The flag holding the map of observer uuid → attitude.
 *
 * Exported at 3.408.0 once `attitude-workflow.mjs` needed it. It spent
 * one commit un-exported because the uncalled-export ratchet was right:
 * an exported rule nobody calls is a well-tested opinion.
 */
export const ATTITUDE_FLAG = "attitude";

const clean = (value) => String(value ?? "").trim().toLowerCase();

/**
 * A rung name, whatever spelling arrived — or "" for a word that is
 * neither a rung nor an alias.
 *
 * The single place the alias table is consulted, so "is this a rung",
 * "where does it sit" and "move it" cannot disagree about what counts.
 */
function resolveStep(step) {
  const word = clean(step);
  if (ATTITUDE_STEPS.includes(word)) return word;
  return ATTITUDE_ALIASES[word] ?? "";
}

/** Is this one of the five printed steps, or a readable alias of one? */
export function isAttitude(step) {
  return resolveStep(step) !== "";
}

/**
 * The rung's position, 0 (hostile) to 4 (helpful), or null.
 *
 * NULL FOR AN UNKNOWN WORD rather than a guess. An alias resolves; a word
 * that is neither a rung nor an alias does not, because quietly mapping
 * anything at all onto the middle would let a vocabulary the book does
 * not use survive in the data — which is the mistake this file made in
 * the other direction until 3.559.0.
 */
export function attitudeIndex(step) {
  const word = resolveStep(step);
  const at = ATTITUDE_STEPS.indexOf(word);
  return at === -1 ? null : at;
}

/**
 * Move an attitude by N steps, clamped to the ends of the ladder.
 *
 * CLAMPED, NOT WRAPPED, and the difference is not academic: a fumbled
 * Coerce is −2, and a creature already unfriendly must land on hostile
 * rather than rolling over to helpful.
 *
 * AN UNKNOWN CURRENT VALUE IS TREATED AS THE DEFAULT, so a creature
 * whose sheet was hand-edited to something the ladder does not know
 * still moves sensibly rather than freezing.
 *
 * @param {string} current
 * @param {number} steps signed; positive is friendlier
 * @returns {string} a step from ATTITUDE_STEPS
 */
export function shiftAttitude(current, steps) {
  const from = attitudeIndex(current) ?? attitudeIndex(DEFAULT_ATTITUDE);
  const by = Math.trunc(Number(steps) || 0);
  const to = Math.max(0, Math.min(ATTITUDE_STEPS.length - 1, from + by));
  return ATTITUDE_STEPS[to];
}

/**
 * The flag holding TEMPORARY attitudes — a spell's override and when it
 * lapses.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A SECOND MAP, NOT A RICHER VALUE, and the reason is migration: the
 * permanent map already exists in live worlds holding bare strings.
 * Teaching it to hold either a string or an object would mean every
 * reader learning both shapes for ever, and the first reader that forgot
 * would read a live attitude as absent. Two maps, two shapes, one
 * question each.
 *
 * WHY IT IS NEEDED AT ALL — measured, not assumed. Every one of the six
 * spells that changes an attitude changes it for a WHILE:
 *
 *   Tame              1 minute (10 at CL 5), then a day's immunity
 *   Charm Undead      sustained, 1 minute
 *   Charm Kind        10 minutes
 *   Alluring Caress   10 minutes
 *   Charm Animal      1 hour
 *   Thrall            10 minutes / 24 hours / unlimited, by degree
 *
 * Make an Impression is the odd one out: a conversation genuinely
 * changes how somebody feels, so THAT stays permanent. A spell wears off
 * and the creature goes back to whatever it thought before — which is
 * only possible if the two are stored apart.
 */
export const TEMP_ATTITUDE_FLAG = "attitudeTemp";

/**
 * The storage key for one observer.
 *
 * ADDED AT 3.408.1 AFTER A LIVE DEFECT, and it is the single author of
 * the key so that read and write cannot disagree — the `markerFlagData`
 * lesson, where a mutation renamed a flag and fifty-nine checks stayed
 * green because the writer and the reader each spelled it themselves.
 *
 * THE BUG: a Foundry uuid is full of dots ("Actor.0gyM3hQqfaYeJaO6"),
 * and `setFlag` EXPANDS a dotted key into nested objects. Storing the
 * uuid raw produced
 *
 *     { "Actor": { "0gyM3hQqfaYeJaO6": "helpful" } }
 *
 * while every read asked for `record["Actor.0gyM3hQqfaYeJaO6"]` and got
 * `undefined`. So the write appeared to succeed, the card correctly
 * announced "now helpful toward you (was neutral)" from the in-memory
 * result, and the attitude was unreadable for ever afterwards — the next
 * Make an Impression would start from neutral again.
 *
 * "A change that appears to work and vanishes" is precisely the failure
 * `withAttitude` already refused to cause by never mutating its input,
 * arriving instead through the one door no harness could see: the
 * Foundry boundary.
 */
export function attitudeKey(observerUuid) {
  return String(observerUuid ?? "").trim().replaceAll(".", "_");
}

/**
 * How this creature feels about one observer.
 *
 * @param {object} record the stored map, `flags["trg-prime"].attitude`
 * @param {string} observerUuid whose attitude is being asked about
 * @returns {string}
 */
export function attitudeToward(record, observerUuid) {
  const key = attitudeKey(observerUuid);
  if (!key) return DEFAULT_ATTITUDE;
  const stored = record?.[key];
  return isAttitude(stored) ? clean(stored) : DEFAULT_ATTITUDE;
}

/**
 * The record with one pair updated.
 *
 * RETURNS A NEW OBJECT and never mutates the argument — the caller is
 * writing it to a Foundry flag, and a mutated read-through of stored
 * data is how a change appears to work and then vanishes on reload.
 *
 * AN UNKNOWN STEP IS REFUSED rather than written. Storing a word the
 * ladder does not know would read back as the default for ever, which
 * looks exactly like the write never happened.
 *
 * AND AN ALIAS IS STORED AS THE PRINTED WORD (3.559.0). `neutral` reads
 * as the middle rung so nothing saved before the rename breaks, but
 * writing it back would keep the old spelling alive in the data for ever
 * — which is how a rename never finishes.
 */
export function withAttitude(record, observerUuid, step) {
  const key = attitudeKey(observerUuid);
  const next = { ...(record ?? {}) };
  const resolved = resolveStep(step);
  if (!key || !resolved) return next;
  next[key] = resolved;
  return next;
}

/**
 * The temporary attitude in force for one pair, or null.
 *
 * AN ENTRY WITH NO EXPIRY NEVER LAPSES — Thrall's fumble is "the duration
 * is unlimited", and a null `until` is how that is written down. It is
 * still stored in the temporary map rather than the permanent one,
 * because it is still a spell's doing and still ends if the spell does.
 */
export function temporaryAttitude(record, observerUuid, now) {
  const entry = record?.[attitudeKey(observerUuid)];
  if (!entry || !isAttitude(entry.step)) return null;
  if (entry.until === null || entry.until === undefined) return clean(entry.step);
  return Number(now) < Number(entry.until) ? clean(entry.step) : null;
}

/** Record a temporary attitude. `until` null means it does not lapse. */
export function withTemporaryAttitude(record, observerUuid, step, until) {
  const key = attitudeKey(observerUuid);
  const next = { ...(record ?? {}) };
  if (!key || !isAttitude(step)) return next;
  next[key] = { step: resolveStep(step), until: until === null || until === undefined ? null : Number(until) };
  return next;
}

/** Drop entries whose time has passed, so the flag cannot only grow. */
export function prunedTemporaryAttitudes(record, now) {
  const out = {};
  for (const [key, entry] of Object.entries(record ?? {})) {
    if (!entry || !isAttitude(entry.step)) continue;
    if (entry.until === null || entry.until === undefined || Number(now) < Number(entry.until)) {
      out[key] = entry;
    }
  }
  return out;
}

/**
 * What this creature ACTUALLY feels right now — the one question every
 * gate and card should ask.
 *
 * A LIVE SPELL WINS OVER THE CONVERSATION UNDERNEATH IT, and when it
 * lapses the conversation is still there. That is the whole point of the
 * split: charming someone does not erase the fact that you impressed
 * them last week, and a charm wearing off must not leave them neutral
 * toward a friend.
 */
export function effectiveAttitude(baseRecord, tempRecord, observerUuid, now) {
  return temporaryAttitude(tempRecord, observerUuid, now)
    ?? attitudeToward(baseRecord, observerUuid);
}

/**
 * "The target's attitude becomes friendly toward you. If it was friendly,
 * it becomes helpful."
 *
 * FIVE SPELLS PRINT THIS SENTENCE — Charm Kind, Charm Animal, Charm
 * Undead, Alluring Caress and Thrall's success — and it is neither a set
 * nor a shift. A set would make a helpful creature merely friendly, which
 * is a downgrade the text plainly does not intend; a shift would leave a
 * hostile one unfriendly, when the sentence says friendly outright.
 *
 * It is: raise to at least `floor`, and if already there, one better.
 *
 * @param {string} current
 * @param {string} floor the attitude the spell names
 */
export function charmedTo(current, floor) {
  const at = attitudeIndex(current) ?? attitudeIndex(DEFAULT_ATTITUDE);
  const to = attitudeIndex(floor);
  if (to === null) return isAttitude(current) ? clean(current) : DEFAULT_ATTITUDE;
  return at >= to ? shiftAttitude(current, 1) : ATTITUDE_STEPS[to];
}

/**
 * Apply a step change to one pair, returning both the new record and
 * what happened — so a card can say it.
 *
 * ONE CALL, NOT TWO. "What is it now?" and "write it" as separate steps
 * is the shape `consumeMarker` was written to avoid: a caller that reads
 * and forgets to write leaves the attitude unchanged while the card
 * announces that it moved.
 *
 * @returns {{record: object, from: string, to: string, moved: boolean}}
 */
export function applyAttitudeShift(record, observerUuid, steps) {
  const from = attitudeToward(record, observerUuid);
  const to = shiftAttitude(from, steps);
  return {
    record: withAttitude(record, observerUuid, to),
    from,
    to,
    moved: from !== to
  };
}

/**
 * The attitude gates the skill actions declare, keyed by action.
 *
 * DECLARED, NOT INFERRED FROM THE PROSE. `extractAttitudeShift` reads a
 * step CHANGE off an outcome sentence because there is one sentence per
 * degree and the wording is regular. A requirement is neither: Request
 * states it in `requirements`, Command an Animal states it mid-
 * `description` and in the opposite direction, and a parser that tried
 * to read both would be guessing at two different shapes to save writing
 * down two facts.
 *
 *   request           "The NPC's attitude is friendly or helpful."
 *   commandAnAnimal   "Automatically fails if the animal is hostile or
 *                      unfriendly; increase your degree of success by one
 *                      step if it's helpful."
 *
 * `atLeast` refuses below the rung; `failsAtOrBelow` is the mirror.
 */
export const ATTITUDE_GATES = Object.freeze({
  request: Object.freeze({
    atLeast: "friendly",
    refusal: "will not hear a request from someone they are only"
  }),
  commandAnAnimal: Object.freeze({
    failsAtOrBelow: "unfriendly",
    refusal: "will not take commands while it is"
  })
});

/**
 * Command an Animal's OTHER half (page 83).
 *
 * ─────────────────────────────────────────────────────────────────────
 * "This check automatically fails if the animal is hostile or unfriendly
 * towards you. IF THE ANIMAL IS HELPFUL TOWARDS YOU, INCREASE YOUR DEGREE
 * OF SUCCESS BY ONE STEP."
 *
 * The refusal has been real since 3.408.0 — ATTITUDE_GATES stops the roll
 * — and this file's own header has listed the sentence IN FULL among the
 * rules it fixed since the same release. The reward was applied nowhere.
 * Found auditing pages 81-90 on 16 September 2026; built at 3.559.0.
 *
 * A STEP, NOT A DESTINATION, and that is why this is a step function.
 * `skill-feats.mjs` argues against a generic `improveDegree` because
 * Shadowborn Agility's upgrades name their destinations — "a result of
 * failure", "elevated to a Critical" — and a step-based reading of those
 * would silently change meaning if the ladder gained a rung. That
 * argument is right about those, and does not apply here: this sentence
 * says "one step" in as many words. Its second reason — that such a
 * function would have had one contrived caller — is what has changed.
 *
 * ONLY HELPFUL. Friendly is not enough; the book names one rung.
 *
 * @param {string} actionKey
 * @param {string} attitude The animal's attitude toward the commander.
 * @returns {number} How many steps better the degree becomes.
 */
export function attitudeDegreeSteps(actionKey, attitude) {
  if (String(actionKey ?? "") !== "commandAnAnimal") return 0;
  return attitudeIndex(attitude) === attitudeIndex("helpful") ? 1 : 0;
}

/**
 * A degree, that many steps better, clamped at Heroic.
 *
 * BEST TO WORST, so "better" is one step BACK — the opposite direction
 * from `worsenDegree`, which the DEGREE_ORDER comment in
 * `creature-activation.mjs` warns is exactly the sign a reader gets
 * wrong. Written here rather than beside it because this is the rule
 * that needed it, and because that file is about Codex traits.
 *
 * A HEROIC CANNOT IMPROVE; there is nothing past it, and inventing a step
 * would be inventing a degree.
 *
 * @param {string} degree
 * @param {number} [steps]
 * @returns {string|null} null for a degree the ladder does not know.
 */
export function improveDegree(degree, steps = 1) {
  const order = DEGREE_ORDER;
  const index = order.indexOf(String(degree ?? "").trim().toLowerCase());
  if (index < 0) return null;
  const by = Number(steps);
  if (!Number.isFinite(by) || by <= 0) return order[index];
  return order[Math.max(0, index - Math.floor(by))];
}

/**
 * Whether an action's attitude requirement is met, and why not.
 *
 * @returns {{allowed: boolean, gate: object|null, attitude: string}}
 */
export function attitudeGateFor(actionKey, current) {
  const gate = ATTITUDE_GATES[String(actionKey ?? "")] ?? null;
  const attitude = isAttitude(current) ? clean(current) : DEFAULT_ATTITUDE;
  if (!gate) return { allowed: true, gate: null, attitude };
  if (gate.atLeast) return { allowed: attitudeAtLeast(attitude, gate.atLeast), gate, attitude };
  return { allowed: !attitudeAtMost(attitude, gate.failsAtOrBelow), gate, attitude };
}

/**
 * Is this attitude at least as friendly as the one named?
 *
 * The gate Request needs — *"The NPC's attitude is friendly or helpful"*
 * — expressed as a threshold rather than a list, so a ladder that grows
 * a rung does not silently exclude it.
 */
export function attitudeAtLeast(current, threshold) {
  const a = attitudeIndex(current) ?? attitudeIndex(DEFAULT_ATTITUDE);
  const b = attitudeIndex(threshold);
  if (b === null) return false;
  return a >= b;
}

/** …and the mirror, for the "hostile or unfriendly" gates. */
export function attitudeAtMost(current, threshold) {
  const a = attitudeIndex(current) ?? attitudeIndex(DEFAULT_ATTITUDE);
  const b = attitudeIndex(threshold);
  if (b === null) return false;
  return a <= b;
}
