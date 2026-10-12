/**
 * What an ability score of -5 does to you (Core 3.8, Chapter 1, p13).
 *
 * NEW at 3.550.0, from Graham's ruling of 10 September 2026 on the pages
 * 6-15 audit: apply these automatically rather than warning about them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SIX SENTENCES, quoted so they can be argued with:
 *
 *   STR  "too weak to move in any way and is unconscious"
 *   DEX  "incapable of moving and is effectively immobile (but not
 *         unconscious)"
 *   CON  "is dead"
 *   INT  "comatose (unless it is mindless)"
 *   WIS  "incapable of rational thought and is unconscious"
 *   CHA  "not able to exert himself in any way and is unconscious"
 *
 * Until now nothing in the system compared any attribute against any
 * threshold, so a drain that pushed Constitution to -5 sat on the sheet
 * as a number and the character carried on fighting.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PURE, AND THAT IS THE POINT. The decision lives here so a harness can
 * drive all six sentences without a world; the workflow beside this file
 * does nothing but carry the answer to the actor. Same split as
 * death-state's `needsReaping` and the reaping that acts on it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE READINGS THIS FILE MAKES, each of them a judgement rather than a
 * transcription, and each recorded here rather than buried:
 *
 * 1. "-5" IS READ AS "-5 OR WORSE". The book states the score exactly,
 *    but a -6 is not less collapsed than a -5, and a drain that
 *    overshoots must not step over the rule entirely. Nothing in the
 *    system currently produces a total below -5 except by stacking, so
 *    this is a guard rather than a live case.
 *
 * 2. COMATOSE IS APPLIED AS UNCONSCIOUS. There is no Comatose condition
 *    in Appendix 2 — the register runs to 34 and none of them is it.
 *    Unconscious is the nearest thing the system has and carries the
 *    consequences that matter (flat-footed, immobilised, prone), so
 *    Intelligence -5 lands as Unconscious with the printed word said on
 *    the card. A distinct condition would be a rules addition, which is
 *    not this release's business.
 *
 * 3. THE MINDLESS EXEMPTION IS WIDENED TO CHARISMA, AND THIS ONE NEEDS A
 *    RULING. The book writes "unless it is mindless" against Intelligence
 *    alone. But this system's own Mindless rule
 *    (creature-traits.mjs) applies a -5 penalty to Intelligence AND
 *    Charisma, so read literally, every mindless creature in the game —
 *    every zombie, ooze and construct — would be permanently Unconscious
 *    from its Charisma the moment it was imported, while being expressly
 *    exempted from the identical consequence one attribute along.
 *
 *    That cannot be what the sentence means. The exemption is keyed off
 *    MINDLESS_PENALISED_ATTRIBUTES rather than a list written out here,
 *    so the carve-out and the penalty can never drift apart: whatever
 *    the Mindless rule drives to -5, the Mindless rule also excuses.
 *
 *    FLAGGED FOR GRAHAM. If the ruling is that Charisma should collapse a
 *    mindless creature after all, this is one constant, not a rewrite.
 */

import { MINDLESS_PENALISED_ATTRIBUTES, isMindless } from "../creature-traits.mjs";

/**
 * The score at which an ability stops functioning.
 *
 * NOT EXPORTED. It is used only by the two rules in this file, and an
 * exported constant with no caller outside is the "well-tested opinion"
 * the uncalled-export ratchet exists to catch. The threshold is pinned by
 * BEHAVIOUR instead — verify-chapter1 drives -4, -5 and -6 — which is a
 * better assertion than reading the number back anyway.
 */
const COLLAPSE_THRESHOLD = -5;

/**
 * The six sentences as data. `condition` is what the system applies;
 * `printed` is what the book says, carried through to the card so a
 * player reads the rule rather than a condition name.
 */
export const ABILITY_COLLAPSE = Object.freeze({
  strength: Object.freeze({
    condition: "unconscious",
    printed: "too weak to move in any way, and unconscious"
  }),
  dexterity: Object.freeze({
    condition: "immobilised",
    printed: "incapable of moving, and effectively immobile (but not unconscious)"
  }),
  constitution: Object.freeze({
    condition: "dead",
    printed: "dead"
  }),
  intelligence: Object.freeze({
    condition: "unconscious",
    printed: "comatose"
  }),
  wisdom: Object.freeze({
    condition: "unconscious",
    printed: "incapable of rational thought, and unconscious"
  }),
  charisma: Object.freeze({
    condition: "unconscious",
    printed: "not able to exert themselves in any way, and unconscious"
  })
});

/**
 * Is this attribute excused its collapse on a mindless creature?
 *
 * See reading 3 in the header. Derived from the Mindless penalty's own
 * attribute list so the exemption always covers exactly what the penalty
 * drives down.
 *
 * @param {string} key
 * @param {boolean} mindless
 * @returns {boolean}
 */
export function collapseExempt(key, mindless) {
  if (!mindless) return false;
  return MINDLESS_PENALISED_ATTRIBUTES.includes(key);
}

/**
 * What a set of ability totals does to the creature carrying them.
 *
 * @param {object} totals e.g. { strength: 0, constitution: -5, ... }
 * @param {object} [options]
 * @param {boolean} [options.mindless]
 * @returns {{dead: boolean, conditions: string[], reasons: Array<{
 *   ability: string, condition: string, printed: string, value: number}>}}
 */
export function abilityCollapse(totals = {}, { mindless = false } = {}) {
  const reasons = [];
  let dead = false;

  // Iterated over the RULE rather than over the actor's keys, so an
  // attribute missing from a malformed statblock is simply absent rather
  // than throwing, and a seventh key someone invents is ignored.
  for (const [ability, rule] of Object.entries(ABILITY_COLLAPSE)) {
    const value = Number(totals?.[ability]);
    if (!Number.isFinite(value)) continue;
    if (value > COLLAPSE_THRESHOLD) continue;
    if (collapseExempt(ability, mindless)) continue;

    reasons.push({ ability, condition: rule.condition, printed: rule.printed, value });
    if (rule.condition === "dead") dead = true;
  }

  // DEATH SWALLOWS THE REST. A corpse is not additionally Unconscious and
  // Immobilised; stacking three conditions on a dead actor would just be
  // three things for somebody to clear by hand later.
  const conditions = dead
    ? []
    : Array.from(new Set(reasons.map((r) => r.condition)));

  return { dead, conditions, reasons };
}

/**
 * Read the six totals off an actor's system data.
 *
 * NOT EXPORTED, for the same reason as COLLAPSE_THRESHOLD above:
 * `actorAbilityCollapse` is this module's public form for an actor, and a
 * second exported entry point that nothing calls is one more thing
 * claiming to be automation.
 *
 * @param {object} actorSystem
 * @returns {object} ability key to resolved total
 */
function abilityTotals(actorSystem) {
  const attributes = actorSystem?.attributes ?? {};
  const totals = {};
  for (const ability of Object.keys(ABILITY_COLLAPSE)) {
    const total = attributes?.[ability]?.total;
    if (total !== undefined && total !== null) totals[ability] = Number(total);
  }
  return totals;
}

/**
 * The whole question for one actor's system data.
 *
 * @param {object} actorSystem
 * @returns {{dead: boolean, conditions: string[], reasons: Array<object>}}
 */
export function actorAbilityCollapse(actorSystem) {
  return abilityCollapse(abilityTotals(actorSystem), { mindless: isMindless(actorSystem) });
}

/**
 * What must change on an actor to bring it into line with the rule.
 *
 * PURE, AND EXTRACTED FROM THE WORKFLOW AT 3.550.0 because the first
 * draft left this arithmetic inside the hook, where nothing could drive
 * it — and mutate-chapter1 duly walked past two checks that could only
 * read the source and hope. The tricky half of this rule is not which
 * score collapses, it is what comes back OFF and when, so that is the
 * half that most needed to be drivable.
 *
 * THE OWNERSHIP RULE. This only ever removes a condition it applied
 * itself. A character Unconscious at 0 HP, or from a spell, is not woken
 * by their Strength being restored — the rule has no way to tell whose
 * Unconscious it is looking at, so it takes back only what it put there
 * and leaves everything else alone.
 *
 * @param {object} options
 * @param {string[]} options.demanded   conditions the rule now requires
 * @param {string[]} options.owned      conditions this rule applied before
 * @param {string[]} options.present    conditions the actor currently has
 * @param {boolean}  [options.otherReasonUnconscious] 0 HP, Dying or Dead
 * @returns {{apply: string[], remove: string[], owned: string[]}}
 */
export function collapseTransition({
  demanded = [],
  owned = [],
  present = [],
  otherReasonUnconscious = false
} = {}) {
  const has = (c) => present.includes(c);

  const apply = demanded.filter((c) => !has(c));

  const remove = owned.filter((c) => {
    if (demanded.includes(c)) return false;
    if (!has(c)) return false;
    // The one exception, and the reason this is not a plain set
    // difference: waking somebody who is unconscious for a reason this
    // rule knows nothing about would be a worse bug than the one the
    // recovery path exists to fix.
    if (c === "unconscious" && otherReasonUnconscious) return false;
    return true;
  });

  // What will be standing BECAUSE of this rule once the above is done:
  // what it still demands and already owned, plus what it is about to
  // apply. A condition somebody else had applied first is never claimed,
  // and so can never later be removed, by this rule.
  const nextOwned = Array.from(new Set([
    ...owned.filter((c) => demanded.includes(c) && !remove.includes(c)),
    ...apply
  ]));

  return { apply, remove, owned: nextOwned };
}

/**
 * Whether Constitution alone has killed this creature.
 *
 * Split out because `isDead` needs exactly this and nothing else — a
 * character Unconscious from Strength -5 is not dead, and asking the full
 * collapse there would have been an invitation to read `reasons.length`
 * as death.
 *
 * @param {object} actorSystem
 * @returns {boolean}
 */
export function constitutionIsFatal(actorSystem) {
  const value = Number(actorSystem?.attributes?.constitution?.total);
  if (!Number.isFinite(value)) return false;
  // Constitution is not in the Mindless penalty's list, so the exemption
  // cannot reach it — asked through the same function regardless, so that
  // stays true by construction rather than by my remembering it.
  if (collapseExempt("constitution", isMindless(actorSystem))) return false;
  return value <= COLLAPSE_THRESHOLD;
}
