import { DEGREES, DEGREE_BY_KEY } from "../dice/resolution.mjs";

const SYSTEM_ID_FLOORS = "trg-prime";

/** Every `inflictedFloors` entry the actor's items and effects declare. */
export function inflictedFloorsOf(actor) {
  const sources = [...(actor?.items ?? []), ...(actor?.appliedEffects ?? [])];
  const out = [];
  for (const source of sources) {
    const declared = source?.flags?.[SYSTEM_ID_FLOORS]?.inflictedFloors;
    if (!Array.isArray(declared)) continue;
    for (const entry of declared) {
      if (entry?.action && entry?.condition && Number(entry.value) > 0) out.push({ ...entry, sourceName: source.name });
    }
  }
  return out;
}

/** The floors that apply when `actionKey` lands `conditionKey` — pure, for the harness. */
export function inflictedFloorsFor(floors, actionKey, conditionKey) {
  const a = String(actionKey ?? "").trim().toLowerCase();
  const c = String(conditionKey ?? "").trim().toLowerCase();
  return (floors ?? []).filter((f) => String(f.action).toLowerCase() === a && String(f.condition).toLowerCase() === c);
}

async function applyInflictedFloors(actor, target, actionKey, conditionKey) {
  const floors = inflictedFloorsFor(inflictedFloorsOf(actor), actionKey, conditionKey);
  if (!floors.length) return;
  const { createEffectsOn } = await import("./target-relay-workflow.mjs");
  const inCombat = Boolean(globalThis.game?.combat?.started);
  const docs = floors.map((f) => {
    const rounds = Math.max(1, Math.trunc(Number(f.rounds) || 1));
    const data = {
      name: `${f.sourceName}: ${conditionKey} cannot drop below ${f.value}`,
      img: "icons/svg/terror.svg",
      origin: actor?.uuid ?? null,
      description: `${conditionKey} cannot be reduced below ${f.value} (from ${actor?.name ?? "?"}'s ${f.sourceName}).`,
      duration: inCombat ? { rounds } : {},
      changes: [],
      flags: { [SYSTEM_ID_FLOORS]: { conditionFloors: { [conditionKey]: Number(f.value) }, inflictedBy: actor?.uuid ?? null } }
    };
    if (inCombat) data.flags[SYSTEM_ID_FLOORS].conditionExpiresRound = Number(globalThis.game.combat.round ?? 0) + rounds;
    return data;
  });
  // One floor per source: replace a standing one rather than stacking.
  const stale = Array.from(target.effects ?? [])
    .filter((e) => e.flags?.[SYSTEM_ID_FLOORS]?.conditionFloors?.[conditionKey] && e.flags?.[SYSTEM_ID_FLOORS]?.inflictedBy === actor?.uuid)
    .map((e) => e.id);
  if (stale.length && target.isOwner) await target.deleteEmbeddedDocuments("ActiveEffect", stale);
  await createEffectsOn(target, docs);
}

const SYSTEM_ID = "trg-prime";
/**
 * Chapter 4/6 Basic and Skill Actions — outcomes that name a specific
 * condition to gain or lose, applied automatically rather than left
 * as text for a person to action by hand. Confirmed against the full
 * rulebook entry for each action before building anything here;
 * scoped deliberately to the deterministic cases only — a fumble
 * outcome that hands a *choice* to the target (Grapple's "can either
 * grab you... or force you to fall prone") stays as text, since
 * that's not something to decide for the table.
 *
 * `target: "self"` is the actor performing the action; `target:
 * "target"` is whoever they targeted. `active: false` is always safe
 * to apply even if the condition isn't currently present — this
 * project's own toggleStatusEffect is a no-op in that case, same as
 * it's already used elsewhere in this codebase.
 */
export const BASIC_ACTION_CONDITION_EFFECTS = {
  dropProne: {
    success: [{ target: "self", conditionKey: "prone", active: true }]
  },
  stand: {
    success: [{ target: "self", conditionKey: "prone", active: false }]
  },
  grappleAttack: {
    success: [{ target: "target", conditionKey: "grabbed", active: true }],
    // CRITICAL GRABS TOO, and adds a penalty on top — corrected by Graham
    // on 23 August 2026 against a TYPO in the printed book.
    //
    // The book as printed reads "Critical: Your target is immobilised",
    // and this table transcribed that faithfully. Driving it exposed the
    // consequence: `grabbed` declares `includes: ["flatFooted",
    // "immobilised"]`, so Grabbed is a strict superset — and a critical
    // therefore left the target LESS affected than a success. Not Grabbed
    // meant outside the maintenance rule and outside anything else keyed
    // on Grabbed. Rolling better made things worse.
    //
    // The corrected text: "Your target is Grabbed and takes a -4
    // circumstance penalty to checks made to Escape your Grapple until the
    // end of your next turn."
    critical: [{
      target: "target",
      conditionKey: "grabbed",
      active: true,
      // Scoped to the Escape ACTION rather than to Acrobatics or Athletics
      // as a whole: Escape is what the sentence names, and a creature
      // rolling those skills for anything else is not escaping this grip.
      // `auto: true` because the action's own identity settles the scope
      // completely — there is no judgement left for a person to make.
      conditionals: [{
        kind: "modifier",
        value: -4,
        type: "circumstance",
        label: "Grappled (critical)",
        scope: "Escape checks against this Grapple",
        auto: true,
        when: { actions: ["escape"] }
      }]
    }],
    failure: [
      { target: "target", conditionKey: "grabbed", active: false },
      { target: "target", conditionKey: "immobilised", active: false }
    ],
    fumble: [
      { target: "target", conditionKey: "grabbed", active: false },
      { target: "target", conditionKey: "immobilised", active: false }
    ]
  },
  tripAttack: {
    success: [{ target: "target", conditionKey: "prone", active: true }],
    critical: [{ target: "target", conditionKey: "prone", active: true }],
    fumble: [{ target: "self", conditionKey: "prone", active: true }]
  },
  shoveAttack: {
    fumble: [{ target: "self", conditionKey: "prone", active: true }]
  },
  disarmAttack: {
    fumble: [{ target: "self", conditionKey: "flatFooted", active: true }]
  },
  escape: {
    success: [
      { target: "self", conditionKey: "grabbed", active: false },
      { target: "self", conditionKey: "immobilised", active: false }
    ],
    critical: [
      { target: "self", conditionKey: "grabbed", active: false },
      { target: "self", conditionKey: "immobilised", active: false }
    ]
  },

  // Skill Actions (Chapter 6) — same shape as the Basic Actions
  // above: a simple, immediate condition swap with no expiry
  // complexity.
  tumble: {
    fumble: [{ target: "self", conditionKey: "prone", active: true }]
  },
  highJump: {
    fumble: [{ target: "self", conditionKey: "prone", active: true }]
  },
  longJump: {
    fumble: [{ target: "self", conditionKey: "prone", active: true }]
  },
  climb: {
    fumble: [{ target: "self", conditionKey: "prone", active: true }]
  },
  guideWithKnees: {
    fumble: [{ target: "self", conditionKey: "prone", active: true }]
  },
  grabAnEdge: {
    fumble: [{ target: "self", conditionKey: "stunned", active: true, value: 3 }]
  },

  // Feint (Chapter 6): critical/success apply Flat-Footed to the
  // target, fumble applies it to yourself instead. Each degree has
  // its own stated expiry window (until the end of the feinter's
  // current or next turn) that this project has no existing
  // mechanism for — rather than build a bespoke one-off timing rule
  // for a single action, this follows the same precedent already
  // set by Grapple Attack's grabbed/immobilised above: apply the
  // condition immediately, leave it to be cleared manually (or by
  // whatever else removes Flat-Footed), consistent with how every
  // other persistent condition in this module is already handled.
  feint: {
    critical: [{ target: "target", conditionKey: "flatFooted", active: true }],
    success: [{ target: "target", conditionKey: "flatFooted", active: true }],
    fumble: [{ target: "self", conditionKey: "flatFooted", active: true }]
  },
  squeeze: {
    fumble: [{ target: "self", conditionKey: "immobilised", active: true }]
  },
  demoralise: {
    critical: [{ target: "target", conditionKey: "frightened", active: true, value: 2 }],
    success: [{ target: "target", conditionKey: "frightened", active: true, value: 1 }]
  },
  // The two Stealth outcomes that state a condition outright rather than
  // describing one. Added as data after an audit of all 297 outcome rows
  // showed these were the only genuinely unautomated condition
  // applications left in the ninety Skill Actions — everything else the
  // text names was either already here, or a word being used in its
  // ordinary English sense.
  //
  // Hide is deliberately absent: its success reads "if the creature had
  // visual contact with you, you transition from Observed to Hidden. If
  // already Hidden or Undetected, you maintain that state." Applying
  // Hidden to someone already Undetected would demote them, and the table
  // has no way to express "unless". Left for Graham to rule on.
  createADiversion: {
    // "You become hidden to each creature you succeed against, until the
    // end of your turn" — the duration is read from the same text and
    // stamped by the workflow.
    success: [{ target: "self", conditionKey: "hidden", active: true }]
  },
  // HIDE WAS MISSING UNTIL 3.565.0, and Sneak beside it was not — which
  // is how it went unnoticed. Page 93: "If the creature had visual
  // contact with you, you now transition from being observed to being
  // HIDDEN. If you were already hidden or undetected by the creature,
  // you maintain your previous state."
  //
  // THE SECOND SENTENCE IS WHY THERE IS NO DOWNGRADE HERE. Applying
  // Hidden to a character who is already Undetected would be a
  // DEMOTION — the rule says they keep the better state — and
  // `toggleStatusEffect` has no way to express "unless they already have
  // something better". The conditions registry makes Undetected include
  // Hidden's own consequences, so adding Hidden alongside it costs
  // nothing; taking Undetected away would cost the player a rank of
  // concealment for succeeding.
  hide: {
    success: [{ target: "self", conditionKey: "hidden", active: true }]
  },
  sneak: {
    success: [{ target: "self", conditionKey: "undetected", active: true }],
    failure: [{ target: "self", conditionKey: "hidden", active: true }],
    // "You've been spotted! Throughout your movement, the creature
    // continues to OBSERVE you." Observed is the absence of the other
    // two rather than a condition of its own, so a fumble clears them —
    // and until 3.565.0 it cleared nothing, leaving a sneaker who
    // fumbled still carrying whatever Hidden they set out with.
    //
    // THE PRINTED EXCEPTION IS NOT AUTOMATED and is not meant to be:
    // "if you are invisible and were previously hidden from the
    // creature, you're hidden instead". Whether the character is
    // invisible to THAT creature is the GM's call, and the outcome text
    // on the card states it for them.
    fumble: [
      { target: "self", conditionKey: "undetected", active: false },
      { target: "self", conditionKey: "hidden", active: false }
    ]
  }
};

/**
 * The condition effects for a given action key and outcome degree, if
 * any are configured.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A SUCCEEDING DEGREE FALLS BACK DOWN THE LADDER, and that is the
 * printed rule rather than a kindness:
 *
 *   "Heroic: The check succeeds in the best way possible; this result is
 *    treated as a CRITICAL WITH EXTRA BENEFIT."
 *   — Actions Resolution Table
 *
 * FOUND BY THE LIVE PASS ON 3.402.0. Testing Tanglefoot with a forced
 * natural 20 rolled open-ended to 36 — a Heroic — and the card read
 * "heroic — no effect". Not one action in this table declared a `heroic`
 * entry, so a 22-point margin applied NOTHING while an 11-point margin
 * grabbed the target. Rolling better made things worse.
 *
 * THAT IS THE SAME BUG THIS FILE ALREADY FIXED ONCE, one degree higher.
 * See grappleAttack's critical above: the printed "immobilised" made a
 * critical weaker than a success, and Graham corrected it on 23 August.
 * The note there ends "Rolling better made things worse." This is that
 * sentence again — and it reached five actions, not one: grapple, trip,
 * feint, demoralise and escape all declare a critical and none declared
 * a heroic.
 *
 * WHY A FALLBACK RATHER THAN FIVE NEW ENTRIES. "Treated as a Critical"
 * is what the book says a Heroic IS, so the critical entry is not an
 * approximation of the heroic one — it is the floor the rules set. Five
 * copied entries would be five places to keep in step, and the next
 * action added would silently inherit the bug again. An action that
 * later wants a genuinely better heroic outcome simply declares one, and
 * this stops applying.
 *
 * @param {string} actionKey
 * @param {string} degree
 * @returns {Array<{target: "self"|"target", conditionKey: string, active: boolean}>}
 */
/*
 * FLAT-FOOTED WHILE CLIMBING (3.582.0; the pages 221-230 audit's D5,
 * Graham's R9 of 22 September 2026: "Yes").
 *
 * The Climb action's own printed text says it — "You are flat-footed
 * while climbing unless you have a Climb Speed" — and the difficulty
 * table sells the exception for +2 DC. Nothing applied Flat-Footed for
 * climbing in the first place, so the trade-off was selling a thing that
 * was already free, and the exception a climb speed grants was an
 * exception to nothing.
 *
 * NOT IN THE TABLE ABOVE, deliberately: every entry there is a flat
 * "this action at this degree applies this condition", and this one is
 * conditional on two things about the climber. A conditional entry in a
 * flat table is a table that has stopped being readable.
 *
 * IT IS NOT KEYED ON THE DEGREE EITHER. You are flat-footed WHILE
 * CLIMBING — the book ties it to being on the wall, not to how well the
 * check went, so a critical success is as exposed as a failure.
 */
export function climbingFlatFooted({ climbSpeed = 0, ignoresFlatFooted = false } = {}) {
  if (Number(climbSpeed) > 0) return [];
  if (ignoresFlatFooted === true) return [];
  return [{ target: "self", conditionKey: "flatFooted", active: true }];
}

export function basicActionConditionEffects(actionKey, degree) {
  const entry = BASIC_ACTION_CONDITION_EFFECTS[actionKey];
  if (!entry) return [];
  const own = entry[degree];
  if (own) return own;

  // A SUCCEEDING DEGREE FALLS BACK DOWN THE LADDER, and the first
  // version of this fix did not go far enough. It fell back from heroic
  // to critical only — which left `dropProne`, `createADiversion` and
  // `sneak` still broken, because those declare a SUCCESS and no
  // critical, so a heroic (and a critical) applied nothing where a plain
  // success applied something. My own check caught it, over every action
  // in the table rather than the five I had in mind.
  //
  // THE LADDER IS READ, NOT COPIED. `DEGREES` already knows which
  // degrees succeed and how they rank; naming them here would be a
  // second copy of the resolution table, and the next degree added would
  // not reach this.
  //
  // FAILING DEGREES DO NOT CASCADE. A fumble is not "a failure with
  // extra harm" the way a heroic is "a Critical with extra benefit" —
  // the book gives each its own text, and several actions mean something
  // specific by a fumble that a failure does not.
  // AN UNKNOWN DEGREE HAS NO RANK TO COMPARE. That is all this guard
  // does — it used to read `!self?.success`, and a mutation proved the
  // success half unreachable: the filter below already requires a LOWER
  // ranked SUCCEEDING degree, and every succeeding degree outranks every
  // failing one, so a partial or a fumble finds nothing regardless. The
  // fifth dead guard this project has removed on that reasoning.
  const self = DEGREE_BY_KEY[degree];
  if (!self) return [];
  const lower = DEGREES
    .filter((d) => d.success && d.rank < self.rank)
    .sort((a, b) => b.rank - a.rank);
  for (const step of lower) {
    if (entry[step.key]) return entry[step.key];
  }
  return [];
}

/**
 * Applies a list of condition effects (from basicActionConditionEffects)
 * to the right actor. Effects targeting "target" are silently skipped
 * if no target actor is available — nothing to apply it to, and this
 * shouldn't block the rest of the outcome from posting.
 *
 * @param {Array<{target: "self"|"target", conditionKey: string, active: boolean}>} effects
 * @param {Actor} actor
 * @param {Actor|null} targetActor
 * @returns {Promise<void>}
 */
export async function applyBasicActionConditionEffects(
  effects,
  actor,
  targetActor,
  { expiresRound = null, actionKey = null } = {}
) {
  for (const effect of effects) {
    const recipient = effect.target === "target" ? targetActor : actor;
    if (!recipient) continue;
    const options = { active: effect.active };
    if (effect.active && effect.value !== undefined) {
      options.value = effect.value;
    }
    const applied = await recipient.toggleStatusEffect(effect.conditionKey, options);

    // A FLOOR THE INFLICTOR CARRIES (3.561.0). Pillars of Faith's Korath:
    // "When you successfully Demoralise a creature, its frightened
    // condition cannot be reduced below 1 until the end of your next
    // turn." Declared as data on the heritage —
    // `flags.trg-prime.inflictedFloors: [{ action, condition, value, rounds }]`
    // — and stamped on the TARGET as its own effect, because the floor
    // and the condition have different lifetimes: the frightened value
    // recovers on its own clock, the floor ends with the Korath's turn.
    // Every reducer asks `conditionFloorFor` before it writes.
    if (effect.active && effect.target === "target" && actionKey) {
      await applyInflictedFloors(actor, recipient, actionKey, effect.conditionKey);
    }

    // Stamp the expiry the outcome stated, so the combat tracker clears
    // it at the right round. Without this every condition an action
    // applied was permanent — the stated windows in the text ("until the
    // end of your next turn") had no mechanism behind them at all.
    //
    // ALSO STAMPS ANY CONDITIONAL the outcome declared. Grapple's corrected
    // critical is the first: "Your target is Grabbed AND takes a -4
    // circumstance penalty to checks made to Escape your Grapple." The
    // condition and the penalty share one duration and one cause, so they
    // ride the same effect — two documents would be two things to expire
    // and one of them would eventually be missed.
    if (!effect.active) continue;
    const stamped = {};
    if (expiresRound !== null) stamped[`flags.${SYSTEM_ID}.conditionExpiresRound`] = expiresRound;
    if (Array.isArray(effect.conditionals) && effect.conditionals.length) {
      stamped[`flags.${SYSTEM_ID}.conditionals`] = effect.conditionals;
    }
    if (!Object.keys(stamped).length) continue;
    const document =
      applied?.update
        ? applied
        : recipient.effects?.find?.(
            (candidate) => !candidate.disabled && candidate.statuses?.has?.(effect.conditionKey)
          );
    if (document?.update) await document.update(stamped);
  }
}
