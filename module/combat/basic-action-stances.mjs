import { CHANGE_TYPE } from "../effect-change-types.mjs";
/**
 * Chapter 4 Basic Actions — Tier 3: temporary bonuses lasting "until
 * the beginning of your next turn," and Take Cover's differently-
 * shaped duration. Built on this project's existing Active Effect /
 * bonus pool pipeline (TRGActiveEffect, addBonus, applyTarget) rather
 * than a parallel mechanism — a Custom-mode change targeting a
 * recognised bonus slot (e.g. "system.combat.defence.dodge") is
 * already picked up automatically during derived-data preparation,
 * the same way Conviction's Defence Boost already works.
 *
 * AVERT GAZE JOINED THEM AT 3.556.0, and the note that kept it out is
 * worth keeping because it was right when it was written:
 *
 *   "Avert Gaze is deliberately left out — its bonus only applies
 *    against 'visual abilities,' a category this system has no way to
 *    detect automatically, and granting a blanket save bonus instead
 *    would be wrong, not just an approximation."
 *
 * The refusal to grant a blanket bonus still stands. The premise did
 * not: `visual` is one of the appendix's own traits and 32 pack entries
 * carry it, and the conditional engine's `traits` axis asks exactly the
 * question — the traits of whatever PROVOKED the check. Found by the
 * pages 61-70 audit, which is the second time in three blocks that a
 * comment describing a real limit outlived the limit.
 *
 * SO IT IS A CONDITIONAL, NOT A CHANGE. The other two stances write
 * numbers into bonus slots because their bonuses are unconditional
 * while the stance is up; this one is never unconditional, so the
 * effect it creates carries no changes at all — only the two
 * conditionals below, which the check dialog collects from effects the
 * same way it collects them from items.
 *
 * Aim's stacking-per-round mechanic and Aid Defensive/Offensive's
 * third-party ally targeting are both substantially different problems,
 * not variations on this one.
 */
export const BASIC_ACTION_STANCE_EFFECTS = {
  fightDefensively: {
    name: "Fight Defensively",
    icon: "icons/skills/melee/shield-block-gray-blue.webp",
    changes: [
      { key: "system.combat.defence.dodge", value: 2 },
      { key: "system.combat.attack.circumstance", value: -4 }
    ]
  },
  fullDefence: {
    name: "Full Defence",
    icon: "icons/magic/defensive/shield-barrier-blue.webp",
    changes: [{ key: "system.combat.defence.dodge", value: 4 }]
  },
  /**
   * Avert Gaze (Chapter 4): "+2-circumstance bonus to your saving throws
   * against visual abilities that specifically necessitate looking at a
   * creature or object... until the beginning of your next turn."
   *
   * GRAHAM'S RULING, 16 September 2026 (R1): OFFER IT, NEVER ASSUME IT.
   * The trait is necessary and not sufficient — a flare that blinds
   * everyone nearby carries `visual` without asking anybody to look at
   * it — so the system's job is to put the tick in front of the player
   * on the rolls where it could apply and let them answer the one
   * question only they can. Both entries are therefore `auto: false`.
   *
   * TWO ENTRIES, which is Trap Finder's shape and for Trap Finder's
   * reason. The first is scoped to saves against something carrying the
   * trait: the common case, offered with the trait as evidence. The
   * second covers saves against something that does NOT carry it —
   * a monster's gaze in a statblock nobody tagged — because a bonus
   * reachable only when the data happens to be right is a bonus that
   * quietly stops existing at the table.
   */
  avertGaze: {
    name: "Avert Gaze",
    icon: "icons/magic/perception/eye-slit-orange.webp",
    changes: [],
    conditionals: [
      {
        kind: "modifier",
        value: 2,
        type: "circumstance",
        label: "Avert Gaze",
        scope: "Saves against a visual ability that requires looking at it",
        auto: false,
        when: { checkTypes: ["save"], traits: ["visual"] }
      },
      {
        kind: "modifier",
        value: 2,
        type: "circumstance",
        label: "Avert Gaze",
        scope: "Saves against a visual ability the GM rules you must look at",
        auto: false,
        when: { checkTypes: ["save"], not: { traits: ["visual"] } }
      }
    ]
  }
};

/**
 * Take Cover (Chapter 4): unlike the other two stances, its own
 * bonus depends on whether the actor already has standard cover
 * (upgrading to greater) or not (gaining standard) — a GM-adjudicated
 * fact this system doesn't track, so the workflow prompts for it.
 * Its expiry ("until you move from your current space, use an attack
 * action, become unconscious, or end this effect as a free action") is
 * not a next-turn boundary, so it is deliberately NOT flagged for
 * _onStartTurn cleanup like the other two stances.
 *
 * TWO OF THOSE FOUR TERMINATORS ARE REAL (3.334.0). Moving clears it,
 * from the movement hook; using the action again clears it, free, from
 * resolveAction. Both were added after the 18 August audit watched the
 * effect survive a Grapple and four moves across the field, still
 * reading +8.
 *
 * This comment previously argued that hand-deletion from the Active
 * Effects list WAS the rulebook's "free action" option. That was a note
 * outliving its reason: it made a missing feature sound like a design
 * decision, and it is why the gap went unnoticed until something drove
 * the action live. The remaining two terminators — attacking, and
 * falling unconscious — really are still manual, and say so on the card.
 */
/*
 * COVER IS THREE BONUSES, NOT ONE (3.579.0).
 *
 * Page 198: standard cover is "a +4-circumstance bonus to your DB, Reflex
 * saves and Hide & Sneak (Stealth) checks", and greater cover is the same
 * sentence at +8. The block-19 audit's D4 found standard giving DB alone,
 * greater giving DB and Stealth, and Reflex getting nothing at either.
 * Graham's R4 (21 September 2026): build all three, and add lesser cover
 * as a third choice worth +2 to DB only.
 *
 * LESSER COVER IS THE "a creature is in the way" ROW. It was defined in
 * ranged.mjs with a bonus of 2 and read by nothing, so it could not
 * happen at all. It cannot be hidden behind, which is the other half of
 * the table's Can Hide column — see `coverAllowsHide`.
 */
export const TAKE_COVER_EFFECTS = {
  lesser: {
    name: "Take Cover (Lesser)",
    icon: "icons/magic/defensive/shield-block-teal.webp",
    changes: [{ key: "system.combat.defence.circumstance", value: 2 }]
  },
  standard: {
    name: "Take Cover (Standard)",
    icon: "icons/magic/defensive/shield-block-teal.webp",
    changes: [
      { key: "system.combat.defence.circumstance", value: 4 },
      { key: "system.combat.saves.reflex.circumstance", value: 4 },
      { key: "system.skills.stealth.circumstance", value: 4 }
    ]
  },
  greater: {
    name: "Take Cover (Greater)",
    icon: "icons/magic/defensive/shield-block-teal.webp",
    changes: [
      { key: "system.combat.defence.circumstance", value: 8 },
      { key: "system.combat.saves.reflex.circumstance", value: 8 },
      { key: "system.skills.stealth.circumstance", value: 8 }
    ]
  }
};

const STANCE_FLAG = "stanceExpiresAtTurnStart";

/**
 * Applies a configured stance effect to the actor as a real Active
 * Effect, flagged for cleanup at the start of the actor's next turn.
 * Removes any existing effect of the same stance first — re-triggering
 * Fight Defensively or Full Defence refreshes the stance rather than
 * stacking a second copy of a Dodge bonus on top of itself (Dodge
 * bonuses always stack with each other by this system's own rules,
 * so without this the bonus would double on a second use).
 *
 * @param {Actor} actor
 * @param {string} actionKey
 * @returns {Promise<void>}
 */
/**
 * The stance's own changes, with Fight Defensively's attack penalty eased
 * by a madu (see `fightDefensivelyAttackPenalty`).
 */
function stanceChanges(config, actionKey, actor) {
  if (actionKey !== "fightDefensively") return config.changes;
  const penalty = fightDefensivelyAttackPenalty(Array.from(actor?.items ?? []));
  return config.changes.map((change) => (
    change.key === "system.combat.attack.circumstance" ? { ...change, value: penalty } : change));
}

/** Fight Defensively's printed attack penalty. */
export const FIGHT_DEFENSIVELY_ATTACK_PENALTY = -4;

/**
 * THE MADU (Chapter 6, shield descriptions): "When you raise the madu as
 * part of a fight defensively action, the penalty to your attack rolls is
 * significantly reduced to -3." Printed "-15"; Graham, 19 Sep 2026: a
 * typo for -3.
 *
 * Declared on the shield (`system.fightDefensivelyPenalty`, 0 meaning "the
 * action's own") rather than recognised by name. The least severe figure
 * an equipped, not-destroyed shield declares wins; no such shield, the
 * printed -4.
 *
 * @param {Array} items
 * @returns {number}
 */
export function fightDefensivelyAttackPenalty(items = []) {
  let eased = null;
  for (const item of items ?? []) {
    if (item?.type !== "shield" || !item?.system?.equipped) continue;
    const hp = item.system?.hp ?? {};
    const max = Math.max(0, Math.floor(Number(hp.max) || 0));
    if (max > 0 && Math.floor(Number(hp.value) || 0) <= -Math.ceil(max / 2)) continue;
    const declared = Math.trunc(Number(item.system?.fightDefensivelyPenalty) || 0);
    if (declared < 0 && (eased === null || declared > eased)) eased = declared;
  }
  return eased ?? FIGHT_DEFENSIVELY_ATTACK_PENALTY;
}

export async function applyBasicActionStance(actor, actionKey) {
  const config = BASIC_ACTION_STANCE_EFFECTS[actionKey];
  if (!config) return;

  const existing = actor.effects.filter((effect) => effect.name === config.name);
  if (existing.length) {
    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      existing.map((effect) => effect.id)
    );
  }

  // Archetype riders on the defensive stances (Chapter 5) — extra dodge
  // changes on the SAME stance effect, so they appear and expire with it:
  //   Aegis: "+2 Dodge bonus to DB" while wielding a shield.
  //   Vanguard: "+1 dodge bonus to DB" with a two-handed weapon.
  // Dodge stacks (Appendix 1), so these simply add alongside the stance's
  // own dodge value.
  const extraChanges = [];
  const featNames = Array.from(actor.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => String(i.name).trim().toLowerCase());
  const hasShield = Array.from(actor.items ?? []).some(
    (i) => i.type === "shield" && i.system?.equipped
  );
  if (featNames.includes("aegis") && hasShield) {
    extraChanges.push({ key: "system.combat.defence.dodge", value: 2 });
  }
  const { itemRequiredHands } = await import("../held-items.mjs");
  const hasTwoHander = Array.from(actor.items ?? []).some(
    (i) => i.type === "weapon" && i.system?.equipped &&
      (i.system?.attackMode ?? "melee") !== "missile" &&
      itemRequiredHands(i, actor.system?.identity?.size ?? "medium") === 2
  );
  if (featNames.includes("vanguard") && hasTwoHander) {
    extraChanges.push({ key: "system.combat.defence.dodge", value: 1 });
  }
  // Duelling Parry (Class, Chapter 5): "Your Dodge bonus when fighting
  // defensively is increased by +2" — while the Duelling Parry feat
  // stance's effect is up (requirements policed at stance entry).
  if (actionKey === "fightDefensively" &&
    Array.from(actor.effects ?? []).some(
      (e) => !e.disabled && e.name === "Duelling Parry" &&
        e.getFlag?.("trg-prime", "featStance")
    )) {
    extraChanges.push({ key: "system.combat.defence.dodge", value: 2 });
  }
  // Combat Defence (Class, Chapter 5): "increase your bonus to DB and
  // your penalty to AB by 1. At level 4 and for every 4 levels
  // thereafter... a further 1" — scales with the stance itself.
  if (featNames.includes("combat defence")) {
    const level = Math.max(0, Number(actor.system?.identity?.level ?? 0));
    const scale = 1 + Math.floor(level / 4);
    extraChanges.push({ key: "system.combat.defence.dodge", value: scale });
    if (actionKey === "fightDefensively") {
      extraChanges.push({ key: "system.combat.attack.circumstance", value: -scale });
    }
  }

  // ENTERING THE STANCE RESETS ITS ATTACK ALLOWANCE. Without this, a
  // character who fights defensively twice in one fight finds the counter
  // already spent and pays full price for the second stance's included
  // attack — the original defect, moved one turn later and made harder
  // to spot.
  if (actionKey === "fightDefensively") {
    await actor.setFlag("trg-prime", FIGHT_DEFENSIVELY_ATTACK_FLAG, 0);
  }

  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: config.name,
      img: config.icon,
      changes: [...stanceChanges(config, actionKey, actor), ...extraChanges].map((change) => ({
        key: change.key,
        type: CHANGE_TYPE.CUSTOM,
        value: String(change.value)
      })),
      flags: {
        "trg-prime": {
          [STANCE_FLAG]: true,
          // A stance whose bonus is CONDITIONAL publishes it here rather
          // than in `changes`. `collectConditionals` harvests effects as
          // well as items, so an entry declared on this effect reaches
          // the check dialog and leaves with the stance.
          ...(config.conditionals ? { conditionals: config.conditionals } : {})
        }
      }
    }
  ]);
}

/**
 * Applies Take Cover's effect.
 *
 * Still removes any existing Take Cover effect of either level first,
 * as a belt-and-braces guard against two copies stacking — though as of
 * 3.334.0 the workflow ENDS an active cover rather than reaching here
 * a second time, so this should no longer find anything. Swapping tiers
 * on a re-press was never a printed rule; ending is. A player who wants
 * the other tier ends it and takes it again.
 *
 * Not flagged for turn-start cleanup — its duration is positional, not
 * time-based. See TAKE_COVER_EFFECTS above for which of its four
 * terminators are automatic.
 *
 * @param {Actor} actor
 * @param {"standard"|"greater"} level
 * @returns {Promise<void>}
 */
export async function applyTakeCover(actor, level) {
  const config = TAKE_COVER_EFFECTS[level];
  if (!config) return;

  const existing = actor.effects.filter((effect) =>
    Object.values(TAKE_COVER_EFFECTS).some((entry) => entry.name === effect.name)
  );
  if (existing.length) {
    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      existing.map((effect) => effect.id)
    );
  }

  await actor.createEmbeddedDocuments("ActiveEffect", [
    {
      name: config.name,
      img: config.icon,
      changes: config.changes.map((change) => ({
        key: change.key,
        type: CHANGE_TYPE.CUSTOM,
        value: String(change.value)
      }))
    }
  ]);
}

/**
 * The Take Cover effect currently on this actor, or null.
 *
 * @param {Actor} actor
 * @returns {object|null}
 */
export function activeTakeCover(actor) {
  const names = Object.values(TAKE_COVER_EFFECTS).map((entry) => entry.name);
  return actor?.effects?.find((effect) => names.includes(effect.name)) ?? null;
}

/**
 * Which level of cover the creature is standing in, as far as the system
 * knows — "" when it knows of none.
 *
 * NEW at 3.579.0 for page 198's Can Hide column (R4). Cover is the GM's
 * to adjudicate, so this answers only for cover the system itself
 * applied: a creature that took Lesser Cover is a creature the system
 * knows cannot Hide.
 *
 * @param {Actor} actor
 * @returns {string} "lesser", "standard", "greater" or ""
 */
export function takeCoverLevelOf(actor) {
  const effect = activeTakeCover(actor);
  if (!effect) return "";
  for (const [key, entry] of Object.entries(TAKE_COVER_EFFECTS)) {
    if (entry.name === effect.name) return key;
  }
  return "";
}

/**
 * Ends Take Cover, wherever it came from.
 *
 * TWO OF THE CHAPTER'S FOUR TERMINATORS ARE NOW REAL (Graham, 18 Aug
 * 2026): pressing the action again, and moving out of your space. The
 * 18 August audit found the effect surviving both — it sat at +8 through
 * an Attack action and through four moves across the field, because
 * nothing but a hand-deletion had ever removed it, and the comment on
 * TAKE_COVER_EFFECTS above said so in as many words.
 *
 * The remaining two — "use an attack action" and "become unconscious" —
 * are deliberately still manual, and recorded as such rather than
 * guessed at.
 *
 * @param {Actor} actor
 * @returns {Promise<boolean>} Whether anything was removed.
 */
export async function endTakeCover(actor) {
  const effect = activeTakeCover(actor);
  if (!effect) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  return true;
}

/**
 * Whether the actor is currently in Full Defence — used by the reaction
 * gate, since Full Defence "prevents all other actions, including
 * Reactions, until the beginning of your next turn." Matched on the Full
 * Defence stance effect specifically (not any turn-start stance, so Fight
 * Defensively doesn't trip it) via the same name + cleanup flag
 * applyBasicActionStance stamps.
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
/** Where the attack Fight Defensively has already paid for is counted. */
export const FIGHT_DEFENSIVELY_ATTACK_FLAG = "fightDefensivelyAttack";

/** How many attacks the 2 AP buys: "a SINGLE attack action". */
export const FIGHT_DEFENSIVELY_ATTACK_ALLOWANCE = 1;

/**
 * Is this actor currently fighting defensively?
 *
 * @param {Actor} actor
 * @returns {boolean}
 */
export function isFightingDefensively(actor) {
  const name = BASIC_ACTION_STANCE_EFFECTS.fightDefensively.name;
  return Boolean(
    actor?.effects?.some(
      (effect) => effect.name === name && effect.getFlag?.("trg-prime", STANCE_FLAG) === true
    )
  );
}

/**
 * Has Fight Defensively already paid for this Strike?
 *
 * THE DEFECT THIS FIXES, reported by Graham from play on 19 Aug 2026:
 * "using the Fight Defensively action did not allow the character to
 * make an attack as part of the 2 AP cost of the action."
 *
 * The entry reads *"Take a single attack action (use your weapon's
 * Attack button) whilst ducking, dodging and parrying"* for 2 AP — so
 * the attack is INSIDE the cost. Pressing the button charged another AP
 * on top, which made the action cost 3 of a 3 AP pool and left nothing
 * for anything else. The stance still worked; it simply cost a whole
 * turn more than the book says.
 *
 * A SINGLE attack, so it is counted rather than merely permitted: the
 * second Strike in the same stance pays its own way, like any other.
 *
 * @param {boolean} inStance
 * @param {number} attacksUsed
 * @returns {boolean}
 */
export function fightDefensivelyCoversAttack(inStance, attacksUsed) {
  if (!inStance) return false;
  return (Number(attacksUsed) || 0) < FIGHT_DEFENSIVELY_ATTACK_ALLOWANCE;
}

export function isInFullDefence(actor) {
  const name = BASIC_ACTION_STANCE_EFFECTS.fullDefence.name;
  return Boolean(
    actor?.effects?.some(
      (effect) => effect.name === name && effect.getFlag?.("trg-prime", STANCE_FLAG) === true
    )
  );
}

/**
 * Removes every stance effect on the actor flagged for turn-start
 * cleanup — called from _onStartTurn, matching this project's
 * existing pattern for other "resets at the start of your turn"
 * tracking (Multiple Attack Penalty, Sweep, Quick Load, Parry).
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function clearExpiredBasicActionStances(actor) {
  const expired = actor.effects.filter(
    (effect) => effect.getFlag("trg-prime", STANCE_FLAG) === true
  );
  if (!expired.length) return;
  await actor.deleteEmbeddedDocuments(
    "ActiveEffect",
    expired.map((effect) => effect.id)
  );
}
