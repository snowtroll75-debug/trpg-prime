/**
 * Attack of Opportunity — pure rules (Chapter 4, Reactions).
 *
 * No Foundry dependencies, so the decisions can be unit-tested directly.
 * The canvas glue (paths, distances, reach lookups, card posting) lives in
 * opportunity.mjs; this file only decides, given plain numbers, whether a
 * provoke happens and who is eligible to answer it.
 *
 * Movement model (Graham's ruling — d20 3.5 / Pathfinder 1e): you provoke a
 * creature when you *leave* a square that is within its reach. Approaching a
 * same-size foe never provokes (you only enter its threatened square, you
 * don't leave one); approaching a larger foe does, because you cross — and
 * then leave — the outer ring of its longer reach on the way in. "Leaving or
 * moving through" reach both reduce to the same test: did any square the
 * mover occupied *and then left* fall within the enemy's reach?
 */

/**
 * Melee reach in feet, including what a reach weapon adds.
 *
 * THE EXTENSION IS A DISTANCE since 3.576.0, not a yes/no worth +5: the
 * Whip prints a 15-foot reach (+10), and the attack path already measures
 * it that way (`weaponReachExtension`). `true` still means the trait's +5,
 * so an older caller reads as it always did.
 *
 * @param {number} baseReachFeet Size-derived reach (5 for Medium).
 * @param {number|boolean} [extension] feet a reach weapon adds
 * @returns {number}
 */
export function effectiveReach(baseReachFeet, extension = 0) {
  const base = Number(baseReachFeet) || 5;
  const extra = extension === true ? 5 : Math.max(0, Number(extension) || 0);
  return base + extra;
}

/**
 * Whether a move provokes a given enemy. `departedFeet` is the ordered list
 * of distances (feet, enemy-to-square) for every square the mover occupies
 * and then leaves — i.e. the whole path except the final resting square.
 * Provokes if any departed square was within the enemy's reach.
 *
 * @param {Array<number|null>} departedFeet
 * @param {number} reachFeet
 * @returns {boolean}
 */
export function movementProvokes(departedFeet, reachFeet) {
  const reach = Number(reachFeet) || 5;
  if (!Array.isArray(departedFeet)) return false;
  return departedFeet.some((d) => d !== null && d !== undefined && Number.isFinite(Number(d)) && Number(d) <= reach);
}

/**
 * Whether a movement action provokes at all. The unarmed default move
 * (Stride — no armed key) provokes; an armed action provokes per its own
 * `provokesReactions` config (Step is false, Crawl/Reposition true).
 *
 * @param {string|null} armedKey
 * @param {boolean} armedConfigProvokes
 * @param {boolean} [avoided] A feat has already bought this move out of
 *   provoking — Improved Reposition's Reflex save, taken before the move
 *   because `preMoveToken` is synchronous and cannot wait on a roll.
 *
 *   TAKEN HERE rather than by the caller skipping the call, because this
 *   is the one function that answers "does this move provoke". A caller
 *   that made its own exception would be a second place deciding it, and
 *   the header directly above records what that cost last time: this
 *   rule was once duplicated verbatim at its call site, with the tested
 *   copy inert.
 * @returns {boolean}
 */
export function moveActionProvokes(armedKey, armedConfigProvokes, avoided = false,
  moverImmune = false) {
  /*
   * IMMUNE TO REACTIONS PROVOKED BY MOVEMENT (3.548.0).
   *
   * The Swarm trait's fourth immunity, and until this release the token
   * `codex-trait-rules.mjs` pushed for it — `movement-reaction` — was
   * read by nothing at all. Ten Fiends & Fables swarms declared it, in
   * their trait AND in their immunities field, and every one of them
   * still provoked an Attack of Opportunity for leaving a threatened
   * square.
   *
   * TAKEN HERE, for the reason the header above already gives about
   * `avoided`: this is the one function that answers "does this move
   * provoke", and a caller making its own exception would be a second
   * place deciding it. The immunity is a property of the MOVER rather
   * than of the move, which is why it arrives as its own argument
   * instead of being read off the action.
   */
  if (moverImmune) return false;
  if (avoided) return false;
  if (!armedKey) return true;
  return Boolean(armedConfigProvokes);
}

/**
 * Whether a creature may answer a provoke with an Attack of Opportunity.
 *
 * @param {object} state
 * @param {boolean} [state.inCombat]
 * @param {number} [state.reactions] Reactions remaining.
 * @param {string|null} [state.blockReason] From actorReactionBlock (null = clear).
 * @param {boolean} [state.hasMeleeStrike]
 * @returns {{eligible: boolean, reason: string|null}}
 */
export function reactorEligibility({ inCombat = false, reactions = 0, blockReason = null, hasMeleeStrike = true } = {}) {
  if (!inCombat) return { eligible: false, reason: "not in this combat" };
  if (Number(reactions) < 1) return { eligible: false, reason: "no reaction available" };
  if (blockReason) return { eligible: false, reason: blockReason };
  if (!hasMeleeStrike) return { eligible: false, reason: "no melee strike" };
  return { eligible: true, reason: null };
}

/**
 * A critical Attack of Opportunity provoked by a *manipulate* action
 * disrupts that action, causing it to fail (Chapter 4). Movement- and
 * ranged-triggered AoOs never disrupt.
 *
 * @param {string} triggerKind "manipulate" | "movement" | "ranged"
 * @param {boolean} isCritical
 * @returns {boolean}
 */
export function disruptsOnCritical(triggerKind, isCritical) {
  return triggerKind === "manipulate" && Boolean(isCritical);
}


/**
 * IMPROVED COMBAT REFLEXES (Class, Chapter 5; prereq BAB +10, Dex +2,
 * Combat Reflexes): "At the start of each of your turns when you regain
 * your actions, you gain an additional amount of reactions which may be
 * used to make attacks of opportunity equal to your Dex. Furthermore, you
 * can still make a single attack of opportunity each round even if you
 * are flat-footed."
 *
 * NEW at 3.378.0.
 *
 * A CORRECTION, kept because the mistake is more instructive than the
 * fact. This comment first claimed there was "no Combat Reflexes feat
 * anywhere in this system — not in the pack, not in the code". The second
 * half was true and the first was never checked: a grep of `module/`
 * found no code, and that was written up as an absence in the DATA too.
 * Graham produced the feat's sheet.
 *
 * Combat Reflexes is real, and it is already AUTOMATED — not by code but
 * by an active effect on the feat item itself:
 *
 *   { key: "system.resources.reactions.max", mode: 2, value: "1" }
 *
 * flagged `featPassive`. That is the same engine route the feat-evidence
 * tool missed three times on 23 August, and the same lesson: a search
 * that can only see one mechanism reports every other mechanism as
 * nothing. Absence of evidence, written up as evidence of absence.
 *
 * IT COMPOSES CLEANLY, which is why nothing here needed changing. The
 * base feat raises `reactions.max`; this function reads that max and adds
 * Dex on top, so a character with both starts on 1 + 1 + Dex. Check B4
 * drives exactly that case.
 *
 * ONE THING GRAHAM SHOULD KNOW. Both feats say their extra reactions are
 * "solely designated for making an Attack of Opportunity", and this
 * system tracks ONE undifferentiated reaction pool. The base feat's own
 * effect already ignores that restriction — it raises the general max —
 * so this follows it rather than inventing a second, stricter accounting
 * for the Improved half. Consistent, and consistently more generous than
 * the printed text.
 *
 * "EQUAL TO YOUR DEX" IS READ AS THE MODIFIER, NOT THE SCORE. This system
 * stores `attributes.dexterity.total` as the modifier — the same number
 * the feat's own prerequisite means by "Dex +2" — and reading it as a
 * raw score would hand a typical character eighteen extra reactions
 * instead of four. The prerequisite is the evidence: "+2" is a modifier's
 * notation.
 */
/*
 * THE NAME IS THE PACK'S, NOT THE ONE THE SENTENCE SUGGESTS. The feat is
 * filed as **"Combat Reflexes, Improved"** — surname-first, so it sorts
 * beside its base feat — and 3.378.0 matched "improved combat reflexes",
 * which is what the rulebook's prose calls it and what nothing in the
 * data is called. The feat did nothing at all, and the harness agreed
 * with the code because both used the name I had invented.
 *
 * Found by granting the real pack item to a real actor and reading the
 * bonus back: 0. §5.5 — measure before you claim — and the plainest
 * argument this project has for the live pass, since no amount of
 * checking my own arithmetic could have caught a name that never
 * appears in the data.
 *
 * BOTH ORDERINGS ARE ACCEPTED. The pack's is authoritative and section F
 * of the verify pins it there; the prose ordering is kept so that a feat
 * renamed to read naturally does not silently stop working — the failure
 * mode this comment exists because of.
 */
const IMPROVED_COMBAT_REFLEXES = Object.freeze([
  "combat reflexes, improved",
  "improved combat reflexes"
]);

/** Does this list of feat names include Improved Combat Reflexes? */
function hasImprovedCombatReflexes(featNames = []) {
  return (Array.isArray(featNames) ? featNames : [])
    .some((n) => IMPROVED_COMBAT_REFLEXES.includes(String(n ?? "").trim().toLowerCase()));
}

/**
 * The reactions an actor starts its turn with.
 *
 * @param {object} options
 * @param {number} options.maxReactions The actor's own pool.
 * @param {boolean} [options.reactionLost] Something cost them the turn's reactions.
 * @param {number} [options.dexterity] The Dex MODIFIER.
 * @param {string[]} [options.featNames]
 * @returns {{value: number, bonus: number}}
 */
export function reactionsAtTurnStart({
  maxReactions = 1,
  reactionLost = false,
  dexterity = 0,
  featNames = []
} = {}) {
  const base = Math.max(0, Math.floor(Number(maxReactions) || 0));
  // A lost reaction stays lost. The feat grants reactions "when you regain
  // your actions", and a creature that regains none regains none of these
  // either — otherwise the feat would quietly undo whatever took the turn
  // away, which is a bigger rule than the one printed.
  if (reactionLost) return { value: 0, bonus: 0 };
  if (!hasImprovedCombatReflexes(featNames)) return { value: base, bonus: 0 };
  // A NEGATIVE Dex must not SHRINK the pool. The feat only ever adds.
  const bonus = Math.max(0, Math.floor(Number(dexterity) || 0));
  return { value: base + bonus, bonus };
}

/**
 * Whether a creature may make an Attack of Opportunity while Flat-Footed.
 *
 * The feat allows "a single attack of opportunity each round even if you
 * are flat-footed" — ONE, and per ROUND, so it needs its own spend marker
 * rather than riding on the reaction pool. A creature with the feat and
 * four spare reactions still gets exactly one while Flat-Footed.
 *
 * @param {object} options
 * @param {string[]} [options.featNames]
 * @param {boolean} [options.usedThisRound] The per-round marker.
 * @returns {boolean}
 */
export function flatFootedOpportunityAllowed({ featNames = [], usedThisRound = false } = {}) {
  return hasImprovedCombatReflexes(featNames) && !usedThisRound;
}
