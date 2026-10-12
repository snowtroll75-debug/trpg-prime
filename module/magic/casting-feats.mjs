/**
 * SPONTANEOUS SCHOLAR and ALTERED CANTRIP — the last two Chapter 5 feats.
 *
 * NEW at 3.382.0.
 *
 * ────────────────────────────────────────────────────────────────────
 * SPONTANEOUS SCHOLAR (Class; prereq Learned Caster, BSB +2, Int +2)
 *
 * "You gain the ability to cast a number of spells without studying your
 * spell library. The number of spells you can cast in this way equals
 * your Intelligence ability score per day. These spells must come from
 * your known repertoire (spells already in your spell library) and must
 * be of a PP cost no higher than half your caster level (rounded up)."
 *
 * WHAT IT LIFTS ONLY EXISTS FOR ONE KIND OF CASTER, and that is the fact
 * worth knowing before reading a line of this. `canCastSpell` — the rule
 * that refused anything unprepared — was DELETED at 3.348.0 on Graham's
 * own ruling, and replaced by a rule about the spell rather than the
 * character. Today the single gate is `spellCastBlocked`, which refuses
 * exactly one thing: a BOOK-POOL spell that is not prepared today.
 *
 * So for a "list"-style learned caster (Cleric, Druid) every spell on the
 * sheet is already castable and this feat would grant nothing whatever.
 * For a "book"-style one (Wizard, and the Arcanist's book cantrips) it is
 * the difference between a spell being available and not. That is also
 * the caster the feat is plainly written for — "your spell library", and
 * an Intelligence-sized allowance.
 *
 * Implemented, therefore, as a WAIVER OF THAT ONE GATE rather than as a
 * new casting mode. It cannot be anything else: there is no other
 * restriction left in the system for it to lift.
 *
 * "INTELLIGENCE ABILITY SCORE" — AND A FALSE DILEMMA I RAISED AND THEN
 * ANSWERED BY LOOKING. The first version of this comment agonised over
 * score-versus-modifier, warned Graham that an Intelligence of 18 would
 * give eighteen casts a day, and asked him to rule between 18 and 4.
 *
 * There is no such choice. TRG Prime HAS NO 3-18 ABILITY SCALE. An
 * ability score in this game IS the small point-buy number —
 * `attributes.mjs` quotes the chapter directly: "you are given 6 points
 * to distribute... no ability score can exceed 4 points", rising to a
 * maximum of 6 through level increases. Score and modifier are the same
 * number. The 18 was D&D's scale, imported by me into a game that does
 * not use it, and the actor silently clamped it to 4.
 *
 * So the allowance is ONE TO SIX casts a day, which is an ordinary
 * number for a feat, and the question was never worth asking.
 *
 * WHICH FIELD, THOUGH, IS A REAL QUESTION, and the live pass answered it.
 * `.base` is the points ALLOCATED at creation; `.total` is that plus
 * racial, class, item, magic and status bonuses — the score the character
 * actually has and the one their sheet shows. "Your Intelligence ability
 * score" is the latter. Reading `.base` would have quietly denied an
 * elf's racial bonus, or a headband's, to every holder of this feat.
 *
 * ────────────────────────────────────────────────────────────────────
 * ALTERED CANTRIP (Racial; prereq BSB +1)
 *
 * "Choose a cantrip from a magical tradition other than your own and
 * incorporate it into your repertoire as one of your cantrips. When you
 * cast this cantrip, you wield it as if it were an inherent part of your
 * own magical tradition... this feat replaces one of your existing
 * cantrips and does not add an additional one."
 *
 * THE SECOND SENTENCE IS ALREADY TRUE and needs no code. There is no
 * positive tradition gate at cast time — `traditionGate` is a NEGATIVE
 * rule that blocks a tradition somebody has been explicitly cut off from
 * (Forbidden Magic), and nothing anywhere refuses a spell for merely
 * belonging to a tradition that is not yours. So a cantrip in the
 * repertoire is already wielded as if it were your own. Saying so is the
 * implementation; writing code to "make it count as your tradition"
 * would change nothing and look like it did.
 *
 * THE THIRD SENTENCE IS THE WHOLE MECHANISM. "Replaces one of your
 * existing cantrips and does not add an additional one" — so this is a
 * SWAP, not a grant, and the count must not move.
 */

/* ------------------------------------------------------------------ *
 * SPONTANEOUS SCHOLAR
 * ------------------------------------------------------------------ */

/** Does this list of feat names include Spontaneous Scholar? */
function ownsSpontaneousScholar(featNames = []) {
  return (Array.isArray(featNames) ? featNames : [])
    .some((n) => String(n ?? "").trim().toLowerCase() === "spontaneous scholar");
}

/**
 * The day's allowance — the Intelligence score the character HAS.
 *
 * @param {number} intelligenceScore `attributes.intelligence.total` —
 *   the effective score, not the `.base` allocation.
 * @returns {number}
 */
function spontaneousScholarPerDay(intelligenceScore) {
  const score = Math.floor(Number(intelligenceScore) || 0);
  return Math.max(0, score);
}

/**
 * "A PP cost no higher than half your caster level (rounded up)."
 *
 * DELIBERATELY NOT `maxPPPerCast`, which lives in casting.mjs and
 * computes `casterLevel + 1` — the ordinary ceiling on what anybody may
 * cast. This is a second, tighter cap that applies only to these free
 * casts, and folding the two together would quietly raise one of them.
 *
 * @param {number} casterLevel `magic.casterLevelValue`.
 * @returns {number}
 */
function spontaneousScholarPPCap(casterLevel) {
  const level = Math.max(0, Math.floor(Number(casterLevel) || 0));
  return Math.ceil(level / 2);
}

/**
 * May this actor spend a Spontaneous Scholar cast on this spell?
 *
 * Returns a REASON on every refusal. A feat that silently declines to
 * fire is indistinguishable from a feat that is broken, and this one
 * fires at the moment a spell would otherwise be refused — the worst
 * possible place for an unexplained "no".
 *
 * @param {object} options
 * @param {string[]} [options.featNames]
 * @param {number} [options.ppCost] The spell's PP cost.
 * @param {number} [options.casterLevel]
 * @param {number} [options.intelligenceScore]
 * @param {number} [options.usedToday]
 * @returns {{allowed: boolean, reason: string|null, remaining: number, cap: number}}
 */
export function spontaneousScholarAllows({
  featNames = [],
  ppCost = 0,
  casterLevel = 0,
  intelligenceScore = 0,
  usedToday = 0
} = {}) {
  const cap = spontaneousScholarPPCap(casterLevel);
  const perDay = spontaneousScholarPerDay(intelligenceScore);
  const used = Math.max(0, Math.floor(Number(usedToday) || 0));
  const remaining = Math.max(0, perDay - used);

  if (!ownsSpontaneousScholar(featNames)) {
    return { allowed: false, reason: null, remaining: 0, cap };
  }
  if (perDay <= 0) {
    return { allowed: false, reason: "your Intelligence gives you no spontaneous casts", remaining: 0, cap };
  }
  if (remaining <= 0) {
    return { allowed: false, reason: `you have used all ${perDay} spontaneous casts today`, remaining: 0, cap };
  }
  const pp = Math.max(0, Math.floor(Number(ppCost) || 0));
  if (pp > cap) {
    return {
      allowed: false,
      reason: `Spontaneous Scholar reaches PP ${cap} at caster level ${Math.floor(Number(casterLevel) || 0)}, and this spell costs ${pp}`,
      remaining,
      cap
    };
  }
  return { allowed: true, reason: null, remaining, cap };
}

/* ------------------------------------------------------------------ *
 * ALTERED CANTRIP
 * ------------------------------------------------------------------ */

/** The traditions a caster counts as their own, from the actor's field. */
function ownTraditions(tradition) {
  return String(tradition ?? "")
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Is this spell from a tradition OTHER than the caster's own?
 *
 * THE FIRST FILTER IN THIS SYSTEM THAT WANTS A MISMATCH. Every other
 * tradition filter — `cantripPickEligible`, the memorisation pool —
 * requires the spell's tradition to INCLUDE the caster's. This one
 * requires that it does not, which is why it could not reuse any of them.
 *
 * A spell listing several traditions counts as your own if ANY of them is
 * yours: a cantrip on the arcane AND divine lists is not "from a
 * tradition other than your own" to an arcane caster, whatever else it is
 * also on.
 *
 * @param {string} spellTradition The spell's `system.tradition`.
 * @param {string} casterTradition The actor's `magic.tradition`.
 * @returns {boolean}
 */
export function isOffTradition(spellTradition, casterTradition) {
  const mine = ownTraditions(casterTradition);
  const theirs = ownTraditions(spellTradition);
  if (!theirs.length) return false;
  // A caster with no declared tradition has no "other" to speak of, and
  // offering them every cantrip in the game under a feat about ancestry
  // would be inventing a rule.
  if (!mine.length) return false;
  return !theirs.some((t) => mine.includes(t));
}

/**
 * Why Altered Cantrip cannot run, or null.
 *
 * @param {object} options
 * @param {number} options.ownedCantrips How many cantrips the actor holds.
 * @param {number} options.candidates How many off-tradition cantrips exist.
 * @param {string} options.casterTradition
 * @returns {string|null}
 */
export function alteredCantripBlocked({ ownedCantrips = 0, candidates = 0, casterTradition = "" } = {}) {
  if (!ownTraditions(casterTradition).length) {
    return "this character has no magical tradition, so there is no other tradition to borrow from";
  }
  // IT REPLACES, SO THERE MUST BE SOMETHING TO REPLACE. Granting one to a
  // character with no cantrips would add an additional one, which the
  // feat's last sentence forbids in so many words.
  if (ownedCantrips <= 0) {
    return "this character has no cantrips to replace — the feat swaps one, it does not add one";
  }
  if (candidates <= 0) {
    return "no cantrips from another tradition were found in the compendium";
  }
  return null;
}
