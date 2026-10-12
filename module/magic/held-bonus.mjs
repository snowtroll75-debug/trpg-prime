/**
 * A BONUS THAT WAITS — granted now, spent later on one roll of the
 * holder's choosing.
 *
 * NEW at 3.411.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SHAPE SEVEN PP 1 SPELLS SHARE, and one PP 0 spell already had.
 *
 *   Guidance          +1 status to one attack, save or skill check
 *   Learned Council   +2 circumstance to one attack, save or skill check
 *   Weapon Surge      +1 status to the attack roll of your next Strike
 *   Wizard Strike     +1 to your next attack check
 *   Physical Boost    +1 status to the next Str/Dex/Con based check
 *
 * Guidance was built first, at 3.400.0, as a bespoke marker with its own
 * card button, its own hardcoded +1, and its own hardcoded label. Wiring
 * four more the same way would have been four more buttons and five
 * copies of one idea — the "two places deciding one question" shape this
 * project has paid for repeatedly, multiplied.
 *
 * SO GUIDANCE MOVED ONTO THIS. It is now the first held bonus rather
 * than a mechanism of its own, and its printed hour of immunity is
 * expressed as a field rather than as code.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SCOPE VOCABULARY IS THE CHECK CARD'S, NOT THE CONDITIONAL ENGINE'S.
 *
 * `conditionals.mjs` scopes by six axes because it decorates a roll being
 * assembled and can see everything about it. This is offered on a card
 * that has ALREADY been posted, and a posted card carries only what it
 * was told to carry: `type`, `subject` and (from 3.411.0) `actionKey`.
 *
 * So a held bonus may narrow by those three and no more. A spell that
 * wants to key on a trait or a tradition cannot be one of these, and
 * saying so plainly is better than a scope that silently never matches.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE PAYLOADS, ONE MECHANISM (3.413.0).
 *
 * Four more PP 1 spells turned out to be this same sentence — "one
 * triggered check, then the spell ends" — differing only in WHAT is
 * held:
 *
 *   Loremasters Edge   advantage on a Recall Knowledge check
 *   Revelation Divine  advantage on a Search or Recall Knowledge check
 *   Moment Of Fortune  advantage on the next save, then the spell ends
 *   Inspiration        roll 1d6 and add it to a non-attack skill check
 *
 * `kind` is DECLARED, never inferred from which fields happen to be
 * present. Guessing "no value means advantage" would turn a pack entry
 * that merely forgot its value into a silently different spell.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY ADVANTAGE IS SPENT AFTER THE ROLL — Graham's ruling, 26 Aug 2026.
 *
 * The faithful reading is "roll with advantage", a state the check
 * enters before any dice. `save-advantage.mjs` records what insisting on
 * that costs: something offered only in the roll configuration dialog is
 * offered on almost no rolls at all, because a save forced by a spell, a
 * trap or a fall never opens one. Juggernaut shipped that way, appeared
 * in the dialog on the single path that opens one, and did nothing
 * anywhere else.
 *
 * So a held advantage is a BUTTON ON THE POSTED CARD, and spending it
 * rolls a second chain and keeps the better total. The distribution is
 * identical, because it is the same operation `#rollD20` performs —
 * `chains.reduce((a, b) => (b.total > a.total ? b : a))` — reached a
 * moment later. What the player gains from the delay is knowing what
 * they need before deciding; what the system gains is a spell that works
 * on every roll instead of on the few that open a dialog.
 *
 * AND IT IS A CHAIN, NOT A FACE. This system's d20 is open-ended, so a
 * chain can total well past 20. Rerolling a bare face and comparing
 * faces would cap the challenger at 20 while the original kept its
 * chain — a worse roll winning because only it was allowed to explode.
 */

import { checkAbilities } from "../dice/check-abilities.mjs";

/** The system flag carrying one held bonus's specification. */
export const HELD_BONUS_FLAG = "heldBonus";

/** Where a per-round held bonus records the round it was spent (3.612.0). */
export const HELD_SPENT_ROUND_FLAG = "heldSpentRound";

/** What a held bonus does when it is spent. */
export const HELD_KINDS = Object.freeze(["modifier", "advantage", "die"]);

/** The die formula a `die` payload may carry. */
const DIE_PATTERN = /^([1-9]\d*)d([1-9]\d*)$/i;

/**
 * Is this a die formula this system will actually roll?
 *
 * REFUSED RATHER THAN PASSED TO THE DICE ENGINE. "1d6+1" is a plausible
 * thing for an author to write and would either throw at spend time or
 * quietly roll something else; a spell that refuses to load is better
 * than one that rolls a formula nobody checked.
 */
export function isHeldDie(formula) {
  return DIE_PATTERN.test(String(formula ?? "").trim());
}

/** The check types a card can report. */
const CHECK_TYPES = Object.freeze([
  "attack", "save", "skill", "specialist", "attribute", "cast", "spellcraft",
  "initiative", "flat", "damage"
]);

const list = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .map((entry) => String(entry ?? "").trim().toLowerCase())
  .filter(Boolean);

/*
 * THE NARROWING AXES KEEP THEIR CASE. Found live at 3.505.0, 6 Sep 2026,
 * on Spirit Lore's own card: "holds Spirit Lore — +4 status to one skill
 * check", for a spell that raises exactly one action, Recall Knowledge.
 * The sentence read wider than the spell, and three spells had been
 * printing it that way since 3.413.0.
 *
 * `subjects` and `actions` were lower-cased on the way in, so
 * `recallKnowledge` became `recallknowledge` and no sentence could name
 * it again. They are stored as declared now and compared case-insensitively
 * in `heldBonusMatches`, which is where the comparison belongs — it
 * already lower-cases the card's own key to meet them.
 */
const keys = (value) => (Array.isArray(value) ? value : value ? [value] : [])
  .map((entry) => String(entry ?? "").trim())
  .filter(Boolean);

/** `recallKnowledge` → `Recall Knowledge`, for a sentence a player reads. */
const humanise = (key) => String(key)
  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
  .replace(/^./, (c) => c.toUpperCase());

/** "a, b or c" — the list separator a printed scope uses. */
const orList = (items) => (items.length < 2
  ? (items[0] ?? "")
  : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);

/**
 * Validate and normalise one authored held bonus.
 *
 * RETURNS NULL RATHER THAN THROWING, the position every normaliser in
 * this project takes: a typo in one spell should cost that spell, not
 * every card the character ever sees. `verify-held-bonus` is what makes
 * a dropped entry loud at build time.
 *
 * A BONUS OF ZERO IS MALFORMED, not a no-op — it would occupy a button
 * that changes nothing.
 */
export function normaliseHeldBonus(raw) {
  if (!raw || typeof raw !== "object") return null;

  // `heldKind`, NOT `kind`, AND THE NAME MATTERS.
  //
  // This is handed the WHOLE EFFECT ROW from the pack, and that row's
  // own `kind` is already spoken for: it is `"heldBonus"`, the word that
  // told `applySpellEffects` to come here in the first place. Reading
  // `raw.kind` would see "heldBonus", find it absent from HELD_KINDS,
  // and refuse the spec — silently turning Guidance, Learned Council,
  // Physical Boost, Weapon Surge and Wizard Strike into "declares a
  // malformed held bonus" all at once. Caught before shipping only
  // because the applier's call site was read rather than assumed.
  //
  // DEFAULTS TO "modifier" so those five entries stay untouched; any
  // kind an author does spell must be one this file implements, because
  // an unrecognised kind reaching the card is a button whose click does
  // nothing at all.
  //
  // AND IT MUST BE IDEMPOTENT, which the first version was not. The
  // applier stores the NORMALISED spec on the effect flag, and the card
  // normalises it again on the way back out — so this function is fed
  // its own output at least as often as it is fed a pack row. A
  // normalised spec spells the payload `kind`, because by then the row's
  // routing `kind` is long gone. Reading only `heldKind` made the return
  // trip fall back to "modifier", find a value of 0, and refuse:
  // Inspiration and the three advantage spells applied cleanly and then
  // offered no button at all. Found in live play, 26 Aug 2026, and
  // invisible to a harness that only ever fed it authored rows.
  //
  // `kind` is accepted ONLY when it names a real payload, which is what
  // keeps the routing word "heldBonus" from being mistaken for one.
  const declared = raw.heldKind
    ?? (HELD_KINDS.includes(String(raw.kind ?? "").trim().toLowerCase()) ? raw.kind : null);
  const kind = String(declared ?? "modifier").trim().toLowerCase() || "modifier";
  if (!HELD_KINDS.includes(kind)) return null;

  // A modifier needs a number and a die needs a formula; ADVANTAGE needs
  // neither, and demanding a value from it would be the inference this
  // file just refused to make, wearing a different hat.
  let value = 0;
  if (kind === "modifier") {
    value = Math.trunc(Number(raw.value));
    if (!Number.isFinite(value) || value === 0) return null;
  }
  const die = kind === "die" ? String(raw.die ?? "").trim() : "";
  if (kind === "die" && !isHeldDie(die)) return null;

  const checkTypes = list(raw.checkTypes);
  // AN UNSCOPED HELD BONUS IS REFUSED. One that matched every card would
  // be offered on damage rolls and flat checks alike, which no printed
  // spell means; `conditionals.mjs` takes the same position for the same
  // reason.
  if (!checkTypes.length) return null;
  if (checkTypes.some((type) => !CHECK_TYPES.includes(type))) return null;

  return {
    label: String(raw.label ?? "Held bonus"),
    kind,
    value,
    die,
    bonusType: String(raw.bonusType ?? "status").trim().toLowerCase() || "status",
    checkTypes,
    subjects: keys(raw.subjects),
    actions: keys(raw.actions),
    // THE ABILITY AXIS (3.613.0, R1 of block 35): Physical Boost's "the next
    // Constitution, Strength, or Dexterity based check" — any check affected
    // by one of those scores, whatever its type. See dice/check-abilities.mjs.
    abilities: list(raw.abilities),
    immunitySeconds: Math.max(0, Math.trunc(Number(raw.immunitySeconds) || 0)),
    spentNote: String(raw.spentNote ?? ""),
    // ONCE EACH ROUND, NOT ONCE (3.612.0, R8 — Inspire Heroics: "may make
    // one skill check each round with advantage"). Spending records the
    // round instead of ending the effect; see `heldBonusSpentThisRound`.
    perRound: raw.perRound === true
  };
}

/**
 * Which round a per-round held bonus is spent in: the combat round in a
 * fight, else the six-second slice of the world clock a round is.
 * @param {{combatId?: string|null, round?: number|null, worldTime?: number}} at
 */
export function heldRoundKey({ combatId = null, round = null, worldTime = 0 } = {}) {
  if (combatId && round !== null && round !== undefined) return `c:${combatId}:${round}`;
  return `t:${Math.floor((Number(worldTime) || 0) / 6)}`;
}

/** Whether a per-round held bonus has already been spent this round. */
export function heldBonusSpentThisRound(spec, spentKey, nowKey) {
  return Boolean(spec?.perRound) && Boolean(spentKey) && spentKey === nowKey;
}

/**
 * The held bonuses a card may offer, ONCE A ROUND HOWEVER MANY CASTINGS.
 *
 * NEW at 3.613.0, Graham's R4 of 2 October 2026. Inspire Heroics recast
 * while the first casting ran gave a creature two memberships, so two
 * advantages a round: "one skill check each round" is a property of the
 * creature, not of each casting. Per-round bonuses are grouped by label;
 * a label already spent this round offers nothing, and an unspent one
 * offers a single button. A once-only held bonus is untouched — two
 * Guidances are two spells the creature was given.
 *
 * @param {Array<{spec: object, spentKey?: string|null}>} entries
 * @param {string} nowKey this round's key (`heldRoundKey`)
 * @returns {Array<object>} the entries to offer, in order
 */
export function heldOffersThisRound(entries, nowKey) {
  const list = Array.isArray(entries) ? entries : [];
  const label = (e) => String(e?.spec?.label ?? "").trim().toLowerCase();
  const spentLabels = new Set(list
    .filter((e) => heldBonusSpentThisRound(e?.spec, e?.spentKey, nowKey))
    .map(label));
  const offered = new Set();
  const out = [];
  for (const entry of list) {
    if (!entry?.spec?.perRound) { out.push(entry); continue; }
    const key = label(entry);
    if (spentLabels.has(key) || offered.has(key)) continue;
    offered.add(key);
    out.push(entry);
  }
  return out;
}

/** The die steps a held die climbs (Inspiration's "max d10"). */
const DIE_STEPS = Object.freeze([4, 6, 8, 10]);

/**
 * How many times a die-step warp can usefully be bought from a printed die.
 *
 * @param {string} from the printed die ("1d6")
 * @param {number} step steps per purchase
 * @returns {number} at least 1
 */
export function heldDieStepMaxTimes(from, step = 1) {
  const m = String(from ?? "").match(DIE_PATTERN);
  const at = m ? DIE_STEPS.indexOf(Number(m[2])) : -1;
  if (at < 0) return 1;
  const per = Math.max(1, Math.trunc(Number(step) || 1));
  return Math.max(1, Math.floor((DIE_STEPS.length - 1 - at) / per));
}

/**
 * A held bonus after the warps this cast bought.
 *
 * NEW at 3.611.0. Inspiration prints three warps and `heldBonus` read
 * none of them, so all three carried `mods: {}`:
 *   +2 PP  "you may use Inspiration to modify an attack check or a saving throw"
 *   +2 PP  "increase the die by one step (max d10)"
 *   +6 PP  "roll an additional die"
 * The value is unchanged when nothing was bought, so every other held
 * bonus in the pack is untouched.
 *
 * @param {object} spec a normalised held bonus
 * @param {object} warpMods the aggregated warp mods
 * @returns {object} a new spec, still one `normaliseHeldBonus` accepts
 */
export function warpedHeldBonus(spec, warpMods = {}) {
  if (!spec) return spec;
  const out = { ...spec, checkTypes: [...(spec.checkTypes ?? [])] };
  const extra = (Array.isArray(warpMods?.heldChecks) ? warpMods.heldChecks : [])
    .map((c) => String(c).trim().toLowerCase())
    .filter((c) => CHECK_TYPES.includes(c));
  for (const c of extra) if (!out.checkTypes.includes(c)) out.checkTypes.push(c);
  if (out.kind === "die") {
    const m = String(out.die).match(DIE_PATTERN);
    if (m) {
      let count = Number(m[1]) + Math.max(0, Math.trunc(Number(warpMods?.heldDice) || 0));
      const at = DIE_STEPS.indexOf(Number(m[2]));
      const steps = Math.max(0, Math.trunc(Number(warpMods?.heldDieStep) || 0));
      // A DIE OFF THE LADDER IS LEFT ALONE rather than guessed at; the
      // ladder's top is the printed ceiling.
      const faces = at < 0 ? Number(m[2]) : DIE_STEPS[Math.min(DIE_STEPS.length - 1, at + steps)];
      count = Math.max(1, count);
      out.die = `${count}d${faces}`;
    }
  }
  return out;
}

/**
 * Does this held bonus reach the check on this card?
 *
 * EVERY DECLARED AXIS MUST MATCH; an undeclared one is ignored. So
 * Guidance names three check types and nothing else and reaches all of
 * them, while Physical Boost names `attribute` plus three subjects and
 * reaches only those.
 *
 * @param {object} spec a normalised held bonus
 * @param {object} card {type, subject, actionKey}
 */
export function heldBonusMatches(spec, card) {
  if (!spec) return false;
  const type = String(card?.type ?? "").trim().toLowerCase();
  const subject = String(card?.subject ?? "").trim().toLowerCase();
  const action = String(card?.actionKey ?? "").trim().toLowerCase();

  // COMPARED CASE-INSENSITIVELY on both sides. The axes are stored as
  // the row declared them so the card can name them (see `keys` above);
  // the card's own key was already being lower-cased here.
  const has = (declared, value) => declared.some((d) => d.toLowerCase() === value);
  if (!spec.checkTypes.includes(type)) return false;
  if (spec.subjects.length && !has(spec.subjects, subject)) return false;
  if (spec.actions.length && !has(spec.actions, action)) return false;
  // A DECLARED ABILITY MUST BE ONE THE CHECK IS BASED ON. The card carries
  // them from 3.613.0; a card from before it is worked out from its type
  // and subject, which covers everything but a weapon Strike.
  const abilities = spec.abilities ?? [];
  if (abilities.length) {
    const based = checkAbilities(card ?? {});
    if (!abilities.some((a) => based.includes(a))) return false;
  }
  return true;
}

/** The modifier row a spent held bonus adds to the card. */
export function heldBonusModifier(spec) {
  return { label: spec?.label ?? "Held bonus", value: Number(spec?.value ?? 0), type: spec?.bonusType ?? "status" };
}

/**
 * The button's text — the label and what pressing it is worth.
 *
 * IT SAYS WHAT THE PAYLOAD IS, because the three read very differently
 * to a player deciding whether to spend: a flat +1 is a known quantity,
 * a d6 is a gamble, and a reroll is only worth taking when the first
 * roll was poor. A button that said "(free)" and nothing else would make
 * that decision blind.
 */
export function heldBonusButtonLabel(spec) {
  const label = spec?.label ?? "Held bonus";
  if (spec?.kind === "advantage") return `${label} — roll again, keep the better (free${spec.perRound ? ", once this round" : ""})`;
  if (spec?.kind === "die") return `${label} — +${spec.die} (free)`;
  const sign = Number(spec?.value ?? 0) >= 0 ? "+" : "";
  return `${label} — ${sign}${Number(spec?.value ?? 0)} (free)`;
}

/**
 * What spending a held ADVANTAGE did.
 *
 * Compares two CHAIN TOTALS, not two faces — see the header. The kept
 * total is the better of the two, exactly as `#rollD20` chooses under
 * `BIAS.ADVANTAGE`, and the gain is what the check's total moves by when
 * the die total is replaced.
 *
 * A REROLL THAT LOSES IS STILL REPORTED. `improved: false` exists so the
 * card can say "the second roll was worse, the first stands" rather than
 * printing nothing — the anti-silence rule, and the correction 3.411.2
 * made when an applier refused a bonus and the card announced it anyway.
 * A player who spent a spell is owed the outcome either way.
 *
 * @param {object} options
 * @param {number} options.dieTotal the chain total already on the card
 * @param {number} options.rerollTotal the challenger chain's total
 * @param {number} options.checkTotal the check's total before spending
 * @param {number|null} [options.dc]
 */
export function heldAdvantageOutcome({ dieTotal, rerollTotal, checkTotal, dc = null } = {}) {
  const original = Number(dieTotal) || 0;
  const challenger = Number(rerollTotal) || 0;
  const kept = Math.max(original, challenger);
  const gain = kept - original;
  const before = Number(checkTotal) || 0;
  const after = before + gain;
  const threshold = dc === null || dc === undefined ? null : Number(dc);
  return {
    original,
    rerolled: challenger,
    kept,
    improved: gain > 0,
    // A TIE IS NOT AN IMPROVEMENT, and saying so is the honest report:
    // the spell was spent and the number did not move.
    gain,
    before,
    after,
    dc: threshold,
    turnedAside: threshold !== null && before < threshold && after >= threshold
  };
}

/**
 * The modifier row a spent held DIE adds, once the die has been rolled.
 *
 * The roll is injected rather than performed here, so the decision stays
 * pure and the harness can drive every face — including the one where a
 * 1d6 comes up 1 and the player is owed a card saying so.
 */
export function heldDieModifier(spec, rolled) {
  const value = Math.trunc(Number(rolled)) || 0;
  return {
    label: `${spec?.label ?? "Held bonus"} (${spec?.die ?? "die"})`,
    value,
    type: spec?.bonusType ?? "status"
  };
}

/**
 * What the CAST card says the target is now holding.
 *
 * Split out of `spell-effects.mjs` at 3.413.0, where it was one
 * hardcoded sentence reading `spec.value` and `spec.bonusType`. With
 * three payloads that sentence became wrong for two of them: an
 * advantage would have announced itself as "+0 status to one save
 * check", which is the shape this project keeps calling a card that
 * describes behaviour it does not have.
 */
export function heldBonusCastLine(spec) {
  // THE SENTENCE NAMES EVERY AXIS THE SPEC DECLARES, not only the check
  // type. It read "one skill check" for Spirit Lore, which raises exactly
  // one action; Loremasters Edge, Revelation Divine and Physical Boost
  // had been printing the same too-wide sentence since 3.413.0.
  const narrow = orList([
    ...(spec?.actions ?? []).map(humanise),
    ...(spec?.subjects ?? []).map(humanise)
  ]);
  // AN ABILITY-SCOPED BONUS IS NAMED BY ITS ABILITIES (3.613.0): "one
  // Strength, Dexterity or Constitution-based check", as the page prints it,
  // not a list of six check types.
  const based = (spec?.abilities ?? []).map(humanise);
  // "EACH ROUND" WHERE IT COMES BACK (3.612.1, G2 of the 3.612.0 drive):
  // Inspire Heroics' line read "advantage on one skill check", as if spent once.
  const scope = (based.length ? `one ${orList(based)}-based check` : `one ${(spec?.checkTypes ?? []).join(" / ")} check`)
    + (narrow ? ` (${narrow})` : "") + (spec?.perRound ? " each round" : "");
  if (spec?.kind === "advantage") return `<strong>advantage</strong> on ${scope}`;
  if (spec?.kind === "die") return `<strong>+${spec.die}</strong> to ${scope}`;
  const sign = Number(spec?.value ?? 0) >= 0 ? "+" : "";
  return `<strong>${sign}${Number(spec?.value ?? 0)} ${spec?.bonusType}</strong> to ${scope}`;
}

/**
 * Did spending it actually move the total, and did that turn the check?
 *
 * MOVED OUT OF guidance.mjs AT 3.411.0, unchanged in behaviour. A held
 * bonus of a type the character already has more of changes nothing —
 * Appendix 1 pools status bonuses highest-wins — and the card must say
 * so rather than implying a gain that did not happen.
 */
export function heldBonusResult({ total = 0, dc = null, gain = 0 } = {}) {
  const before = Number(total) || 0;
  const after = before + (Number(gain) || 0);
  const threshold = dc === null || dc === undefined ? null : Number(dc);
  return {
    applied: after !== before,
    before,
    after,
    dc: threshold,
    turnedAside: threshold !== null && before < threshold && after >= threshold
  };
}
