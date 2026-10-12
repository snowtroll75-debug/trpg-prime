import { TRGCheck } from "../dice/check.mjs";
import { resolveAgainstDefences } from "../combat/damage-workflow.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { isActingGM } from "../acting-gm.mjs";
import { automatesBroadcast, automatesInvoked } from "../combat/turn-automation.mjs";
import { levelDC } from "../dice/resolution.mjs";
import { dyingCheckBonus } from "../feats.mjs";
import { ANGELSTEP_DYING_BONUS } from "../elixirs.mjs";
import { compareInitiative } from "./initiative.mjs";
import {
  actsThisTurn,
  applyDyingChange,
  computeAPRegain,
  dyingCheckOutcome,
  effectiveDeathState,
  stabiliseWouldHelp,
  stabilisedDyingDelta
} from "../combat/turn-economy.mjs";
import {
  BLEEDING_FLAT_CHECK_DC,
  RECURRING_FLAT_CHECK_DC,
  bleedingSeverity
} from "../conditions/registry.mjs";
import { DAMAGE_TYPES } from "../config.mjs";
import { applyDamageAndCheckDying } from "../combat/dying-workflow.mjs";
import { actorDeathState, applyDyingRecovery, isDead, reapDead } from "../combat/death-state.mjs";
import { resetParryTrackingForTurn } from "../combat/attack-workflow.mjs";
import { clearExpiredBasicActionStances } from "../combat/basic-action-stances.mjs";
import { clearExpiredAidBonuses } from "../combat/aid-bonus.mjs";
import { clearShieldBashLostBonus } from "../combat/shield-bash.mjs";
import { expireStaleDelay } from "./delay.mjs";
import { expireStaleReadiedAction } from "../combat/ready.mjs";
import { decrementPainToleranceSuppressions } from "../combat/pain-tolerance.mjs";
import { expireTimedConditions } from "../combat/effect-application-workflow.mjs";
import { effectExpiredLine } from "../combat/effect-expiry.mjs";
import { offerZealousBattlecry, settleZealousBattlecry } from "../combat/zealous-battlecry-workflow.mjs";
import { expireRage } from "../combat/rage-workflow.mjs";
import { reclaimOrphanedRageTemporaryHP } from "../combat/rage-workflow.mjs";
import { sweepSustainedLapses } from "../magic/active-spells.mjs";
import { sweepActiveSpellExpiry } from "../magic/active-spells.mjs";
import { regionExpiredLine } from "../magic/region-expiry.mjs";
import { applyPerTurnEmanations } from "../magic/luminance-workflow.mjs";
import { applyRecurringLadders } from "../magic/recurring-ladder-workflow.mjs";
import { expirePendingModifiers } from "../pending-modifiers.mjs";
import { rollConditionSaves } from "../magic/condition-save-workflow.mjs";
import { clearThornsIntensity } from "../magic/thorns-workflow.mjs";
import { sweepRefocusRestores } from "../combat/refocus-workflow.mjs";
import { offerReactiveStance } from "../combat/reactive-stance.mjs";
import { resetQuickLoadForTurn } from "../combat/reload-workflow.mjs";
import { clearTraitUsage } from "../traits-workflow.mjs";
import { clearPreparedReaction } from "../combat/prepare.mjs";
import { resetMovementForTurn } from "../combat/movement-workflow.mjs";
import { resolveTurnEndFall } from "../combat/fly-workflow.mjs";
import { deletionValue } from "../deletion.mjs";
import {
  surpriseRoundApplies,
  shouldSkipWithAmbushAwareness,
  surpriseRoundInEffect,
  apForTurn
} from "../combat/surprise.mjs";

import { reactionsAtTurnStart } from "../combat/opportunity-rules.mjs";
import { applyElementalNexus } from "../magic/elemental-nexus-workflow.mjs";
import { fireDirectedStrikes } from "../magic/directed-strike-workflow.mjs";
import { abilityApPenalty } from "../creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Marks the Flat-Footed that Chapter 4 Step 4 hands everybody when combat
 * begins, so that it — and nothing else wearing the same condition — is the
 * one cleared at the start of its owner's turn. See `#beginCombat`.
 */
const INITIAL_FLAT_FOOTED_FLAG = "initialFlatFooted";

/**
 * The phase label that Phase 3's own cards carry.
 *
 * Written once so the summary card's heading and the flat checks' subtitles
 * cannot drift apart — the whole point of the subtitle is that a reader can
 * match the two, and two spellings of the same phase would defeat it.
 */
const END_PHASE_LABEL = "Phase 3 — End Phase";

/**
 * Combat document for TRG Prime.
 *
 * Foundry's default initiative roll evaluates the formula declared in
 * system.json, which cannot express an open-ended chain or the percentile
 * tens/units structure that advantage relies on. Rolling initiative from the
 * tracker therefore routes through TRGCheck exactly as the sheet button does,
 * so the Open-Ended Initiative setting governs both paths.
 */
export class TRGCombat extends Combat {
  /** Read the initiative open-ended setting defensively. */
  static get openEnded() {
    try {
      return game.settings.get(SYSTEM_ID, "openEndedInitiative")
        ? "both"
        : "none";
    } catch {
      return "none";
    }
  }

  /** Resolve the coin flip once, so turn order does not shuffle on re-render. */
  static #coinFlip() {
    return Math.random();
  }

  /**
   * Build and evaluate the initiative check for a single combatant.
   * @param {Combatant} combatant
   * @returns {Promise<TRGCheck>}
   */
  static async rollCombatantInitiative(combatant) {
    const actor = combatant.actor;
    const bonus = Number(actor?.system?.combat?.initiative?.total ?? 0);

    // THROUGH `TRGCheck.roll`, NOT `new TRGCheck` + `evaluate` (3.549.0).
    //
    // The two are not the same entry point. `TRGCheck.roll` is where
    // automatic conditionals are collected and where a bias from an
    // effect or an ally's aura is resolved; constructing the check
    // directly skips all of it. So the sheet's initiative button and the
    // tracker's were running different rules — the sheet applied an
    // initiative advantage, the tracker could not see one.
    //
    // Nothing in the system currently grants a bias on initiative, so
    // this was a divergence waiting for the first feat that does rather
    // than a live defect. Found by the pages 6-15 audit, 10 September
    // 2026, and closed while the two paths are still known to agree.
    //
    // `toMessage: false` because the caller posts the card itself, with
    // the combatant's own speaker and the tracker's message options.
    const check = await TRGCheck.roll({
      actor,
      label: "Initiative",
      subtitle: "d100 + (Dex x5) + (Wis x5)",
      type: "initiative",
      die: "d100",
      openEnded: TRGCombat.openEnded,
      suppressDegree: true,
      rollMode: combatant.hidden
        ? CONST.DICE_ROLL_MODES.PRIVATE
        : game.settings.get("core", "messageMode"),
      modifiers: [
        { label: "Initiative bonus", value: bonus, type: "untyped" }
      ],
      toMessage: false
    });

    return check;
  }

  /** @inheritdoc */
  async rollInitiative(ids, { updateTurn = true, messageOptions = {} } = {}) {
    const combatantIds = typeof ids === "string" ? [ids] : ids;
    const currentId = this.combatant?.id;
    const updates = [];

    for (const id of combatantIds) {
      const combatant = this.combatants.get(id);
      if (!combatant?.isOwner) continue;

      // ZEALOUS BATTLECRY (3.614.0, R7): "Trigger You and at least 1 ally
      // are about to roll initiative." Asked before this combatant's dice.
      await offerZealousBattlecry(this, combatant);

      const check = await TRGCombat.rollCombatantInitiative(combatant);

      updates.push({
        _id: id,
        initiative: check.outcome.total,
        [`flags.${SYSTEM_ID}.tiebreak`]: TRGCombat.#coinFlip(),
        // ITS d100, for a Zealous Battlecry pair to compare (3.614.0, R7).
        [`flags.${SYSTEM_ID}.initDie`]: Number(check.dice?.total ?? 0)
      });

      await check.toMessage({
        speaker: ChatMessage.getSpeaker({
          actor: combatant.actor,
          token: combatant.token,
          alias: combatant.name
        }),
        ...messageOptions
      });
    }

    if (!updates.length) return this;

    await this.updateEmbeddedDocuments("Combatant", updates);

    // AND ANY PAIR WHOSE TWO MEMBERS HAVE NOW BOTH ROLLED TAKES THE HIGHER d100.
    await settleZealousBattlecry(this);

    // REACTIVE STANCE (Chapter 5): "Action Free; Trigger You roll
    // initiative. Enter any one known Stance that you know."
    //
    // HERE, BECAUSE THIS IS THE TRIGGER. Rolling initiative happens once
    // and happens here, and a stance entered before the first turn is the
    // whole point of the feat — offering it on the first turn instead
    // would be a different feat, and a worse one.
    for (const id of combatantIds) {
      const actor = this.combatants.get(id)?.actor;
      if (actor) await offerReactiveStance(actor);
      // A MODULE'S OWN INITIATIVE RULE (3.625.0). Pillars of Faith's Battle
      // Remembered: "When you roll Initiative and your Past-Life Echo is
      // available, you may activate Past-Life Echo as a Free action" — a
      // companion module's ability, which the system cannot name. The hook
      // fires once per combatant rolled, after the system's own offers, with
      // the actor and the combatant; a listener that wants nothing returns.
      if (actor) Hooks.callAll("trgPrimeInitiativeRolled", { actor, combatant: this.combatants.get(id), combat: this });
    }

    // Preserve whose turn it is across the re-sort.
    if (updateTurn && currentId) {
      const turn = this.turns.findIndex((t) => t.id === currentId);
      if (turn >= 0) await this.update({ turn });
    }

    return this;
  }

  /**
   * @inheritdoc
   * Highest initiative first, then highest Wisdom, then highest Dexterity,
   * then the stored coin flip.
   */
  _sortCombatants(a, b) {
    return compareInitiative(
      TRGCombat.#toEntry(a),
      TRGCombat.#toEntry(b)
    );
  }

  /** Is turn automation switched on at all? */
  static get #automationEnabled() {
    try {
      return Boolean(game.settings.get(SYSTEM_ID, "turnAutomation"));
    } catch {
      return false;
    }
  }

  /**
   * Whether this client should run automation reached by a CALLBACK that
   * fires on every connected client — `_onStartTurn`, `_onEndTurn`.
   *
   * This build's `_manageTurnEvents` is not gated on the active GM, so
   * those really do run everywhere and exactly one client must do the
   * work. `isActingGM()` is the right question here.
   */
  static get automates() {
    return automatesBroadcast({
      enabled: TRGCombat.#automationEnabled, isActingGM: isActingGM()
    });
  }

  /**
   * Whether this client should run automation reached by a METHOD THE
   * USER INVOKED — `startCombat`, `nextTurn`.
   *
   * ─────────────────────────────────────────────────────────────────────
   * THE DEFECT THIS SPLIT EXISTS TO KEEP DEAD (3.430.1).
   *
   * Graham, 28 August 2026: "No surprise round is being prompted at the
   * start of a combat. Actors are not beginning the fight flat-footed.
   * You should not be disabling rules that work!"
   *
   * Both of those are inside `#beginCombat`, and both were skipped by the
   * single line at the top of `startCombat` asking `automates` — which
   * asked `isActingGM()`. But `startCombat` is not a hook. It runs on the
   * ONE client whose user clicked Begin Combat, so there is nothing to
   * de-duplicate and the only real question is whether that user may
   * drive combat.
   *
   * With two GMs connected — Graham's world has exactly two — Foundry
   * names one of them `game.users.activeGM`, and every other GM's click
   * fell straight through to `super.startCombat()`. No surprise prompt,
   * no round-1 Flat-Footed, no error, nothing in the console. The rules
   * were being performed correctly on a client nobody was sitting at.
   *
   * See combat/turn-automation.mjs for why this is two questions.
   */
  static get automatesInvoked() {
    return automatesInvoked({
      enabled: TRGCombat.#automationEnabled, isGM: Boolean(game.user?.isGM)
    });
  }

  /**
   * Surprise (Chapter 4, Step 2): GM-adjudicated — compares Stealth
   * checks already rolled against Perception DCs, which this system
   * can't do for the GM sight-unseen. Presents a checkbox per
   * combatant; a dedicated "No Surprise" button covers the common
   * case (most encounters) without making the GM click through an
   * empty list every time.
   *
   * @param {Combatant[]} combatants
   * @returns {Promise<Set<string>>} IDs of surprised combatants —
   *   empty if the GM picked "No Surprise" or closed the dialog.
   */
  static async #promptSurpriseDetermination(combatants) {
    const { DialogV2 } = foundry.applications.api;
    const rows = combatants
      .map(
        (c) =>
          `<label style="display:flex;align-items:center;gap:6px"><input type="checkbox" name="surprised" value="${c.id}"> ${c.name}</label>`
      )
      .join("");

    const result = await DialogV2.wait({
      window: { title: "Surprise", icon: "fa-solid fa-eye-slash" },
      classes: ["trg-prime"],
      position: { width: 360 },
      content: `
        <div class="trg-prime trg-check-dialog">
          <p class="hint">Chapter 4, Step 2: check anyone who is unaware of the encounter at its start (failed their Perception check against the opposing side's Stealth). Leave everyone unchecked if neither side is being stealthy.</p>
          ${rows}
        </div>`,
      buttons: [
        {
          action: "confirm",
          label: "Confirm",
          icon: "fa-solid fa-check",
          default: true,
          callback: (event, button) => {
            const form = button.form ?? button.closest?.("form");
            const FDE =
              foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
            const data = new FDE(form).object;
            const raw = data.surprised;
            const ids = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
            return new Set(ids);
          }
        },
        {
          action: "none",
          label: "No Surprise",
          icon: "fa-solid fa-xmark",
          callback: () => new Set()
        }
      ],
      rejectClose: false
    });
    return result instanceof Set ? result : new Set();
  }

  /**
   * True while a `startCombat` call is awaiting the Surprise dialog.
   *
   * ONE BEGINNING PER COMBAT. `startCombat` opens a modal and then awaits
   * it, so between the click and the answer this method is suspended with
   * nothing marking it as under way — `this.started` is still false, because
   * `super.startCombat()` has not been reached. A second call in that window
   * (a GM clicking "Begin Combat" again because the first click looked
   * inert behind the dialog) therefore ran the whole thing a second time:
   * a second Surprise prompt, the `surprised` flags rewritten from the
   * second answer, Flat-Footed re-applied to everybody, and — worst —
   * another `nextTurn()` if the first combatant was surprised, walking the
   * turn pointer past a combatant who never acted.
   *
   * Found in the 13 Aug 2026 combat playtest, where three stacked prompts
   * appeared. That run reached them by driving `startCombat()` from a
   * script, but nothing about the defect needs a script: the dialog hides
   * the button that opened it, which is exactly the shape that invites a
   * second click.
   *
   * @type {boolean}
   */
  #beginning = false;

  /** @inheritdoc */
  async startCombat() {
    if (!TRGCombat.automatesInvoked) return super.startCombat();

    // Already begun, or already beginning — see #beginning above. Both
    // return `this` rather than throwing: asking a combat that has started
    // to start is a no-op, not an error.
    if (this.started || this.#beginning) return this;
    this.#beginning = true;
    try {
      return await this.#beginCombat();
    } finally {
      this.#beginning = false;
    }
  }

  /** The body of `startCombat`, run at most once — see `#beginning`. */
  async #beginCombat() {
    const combatants = Array.from(this.combatants ?? []);
    const surprised = await TRGCombat.#promptSurpriseDetermination(combatants);
    for (const c of combatants) {
      await c.setFlag(SYSTEM_ID, "surprised", surprised.has(c.id));
    }

    const surprisedCount = combatants.filter((c) => surprised.has(c.id)).length;
    const unsurprisedCount = combatants.length - surprisedCount;
    const needsSurpriseRound = surpriseRoundApplies(surprisedCount, unsurprisedCount);

    // THE FLAG GOES UP BEFORE THE ROUND STARTS, not after.
    //
    // `super.startCombat()` begins the first combatant's turn, and the
    // turn-start handler is what grants AP — it asks `apForTurn` whether
    // a surprise round is in effect. Setting the flag afterwards meant
    // the answer was no for the FIRST combatant in initiative order and
    // yes for everybody behind them: the character who acts first in the
    // surprise round got a full 3 AP, every round, since the rule was
    // written. Live testing on 12 Aug 2026 caught it three-handed —
    // 3 AP, then 2 AP, then a surprised combatant skipped.
    //
    // It reads as "the surprise round is disabled" from the GM's chair,
    // because the first thing that happens in one is wrong.
    if (needsSurpriseRound) {
      await this.setFlag(SYSTEM_ID, "surpriseRoundActive", true);
    }

    // Round 1's general Flat-Footed rule (Chapter 4, Step 4) applies
    // to everyone regardless of whether a surprise round happens at all —
    // removed per-combatant at the START of their turn (_onStartTurn), so
    // a character acts their first turn unimpeded. Graham, 13 Aug 2026.
    //
    // APPLIED BEFORE super.startCombat(), FOR THE SAME REASON THE SURPRISE
    // FLAG IS. `super.startCombat()` begins the first combatant's turn, and
    // beginning a turn is what sheds this condition. Applying it afterwards
    // meant the character at the top of the initiative order was handed
    // Flat-Footed a moment AFTER their only chance to lose it, and carried it
    // through the whole of their first turn — no Dexterity in their Defence,
    // no Reactions, Sneak Attack live against them — while everybody below
    // them shed it correctly. Caught live on 13 Aug 2026: Nomira acted first
    // and was the only combatant still Flat-Footed on her own turn.
    //
    // That is the second time this file has had this exact bug. The rule is:
    // anything a turn-start handler consumes must be in place before
    // super.startCombat() is called.
    //
    // STAMPED, because only THIS application clears that early. Flat-Footed
    // also arrives from a critical hit, from a basic action's outcome and
    // from Aim, and each of those keeps the duration it already had. Without
    // a mark saying which one is the round-1 one, clearing at start of turn
    // would wipe a critical's Flat-Footed a whole turn early.
    //
    // Only stamped when this call is what created it: a combatant who was
    // ALREADY Flat-Footed when initiative was rolled owns that condition
    // from somewhere else, and it is not ours to expire. That includes
    // conditions DERIVED through the registry's `includes` chain — a Dying
    // creature is Unconscious, therefore Prone, therefore Flat-Footed, and
    // none of that is this rule's to expire either.
    for (const c of combatants) {
      if (!c.actor) continue;
      if (c.actor.hasCondition?.("flatFooted")) continue;
      await c.actor.toggleStatusEffect("flatFooted", { active: true });
      const applied = TRGCombat.#flatFootedEffect(c.actor);
      if (applied) await applied.setFlag(SYSTEM_ID, INITIAL_FLAT_FOOTED_FLAG, true);
    }

    // SKITTISH STEEDS (page 176; 3.577.0, Graham's R8 of the block-17
    // audit): "Any animal intelligence steed immediately gains the fleeing
    // and frightened 4 conditions when a combat begins." Before the first
    // turn, for the same reason as everything above: a turn-start handler
    // must find the conditions already in place.
    await TRGCombat.#spookSteeds(combatants);

    // ONE INITIATIVE (page 200; the block-19 audit's D13, Graham's R13):
    // "During combat, your mount acts based on your initiative." Done
    // after the steeds have been asked whether they panic, so a panicking
    // mount is still moved into place beside its rider — a bolting horse
    // that acts on its own count is harder to run, not easier.
    {
      const { alignSteedInitiative } = await import("../combat/mounted-workflow.mjs");
      const moved = await alignSteedInitiative(this);
      if (moved.length) {
        await ChatMessage.create({
          content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
            + `<strong>Mounts take their riders' initiative</strong> (page 200): ${moved.join(", ")}.</p></div>`
        });
      }
    }

    const result = await super.startCombat();

    // And if the first combatant is one of the surprised, step past
    // them — they do not act in this round at all.
    if (needsSurpriseRound && this.combatant?.getFlag(SYSTEM_ID, "surprised")
      && !TRGCombat.#hasAmbushAwareness(this.combatant?.actor)) {
      await this.nextTurn();
    }

    return result;
  }

  /**
   * Every steed a combatant is riding, asked whether it panics.
   * See `steedPanics` in combat/mounted.mjs.
   */
  static async #spookSteeds(combatants) {
    const {
      MILITARY_MOUNT_FLAG, STEED_PANIC, STEED_PANIC_FLAG, mountedState, steedPanics
    } = await import("../combat/mounted.mjs");
    const { resolveActorHandle } = await import("../actor-handle.mjs");
    const seen = new Set();
    for (const c of combatants) {
      const state = mountedState(c.actor);
      if (!state.mounted || !state.steed) continue;
      const steed = await resolveActorHandle(state.steed);
      if (!steed || seen.has(steed.uuid)) continue;
      seen.add(steed.uuid);
      const panics = steedPanics({
        actorType: steed.type,
        creatureType: steed.system?.details?.creatureType,
        intelligence: Number(steed.system?.attributes?.intelligence?.total ?? 0),
        military: Boolean(steed.getFlag?.(SYSTEM_ID, MILITARY_MOUNT_FLAG))
      });
      if (!panics) continue;
      await steed.toggleStatusEffect("fleeing", { active: true });
      await steed.toggleStatusEffect("frightened", { value: STEED_PANIC.frightened });
      await steed.setFlag(SYSTEM_ID, STEED_PANIC_FLAG, true);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: steed }),
        content: `<div class="trg-prime trg-check-card"><p style="margin:2px 0"><strong>${steed.name}</strong>, `
          + `${c.actor.name}'s steed, panics as combat begins — <strong>fleeing</strong> and `
          + `<strong>frightened ${STEED_PANIC.frightened}</strong>. Command an Animal (Handle Animal) can calm it.</p></div>`
      });
    }
  }

  /** @inheritdoc */
  async nextTurn() {
    // Asked through the rule rather than off the raw flag, for the same
    // reason the AP grant is: the flag can still be up while the round
    // has already moved past the surprise round.
    // INVOKED, NOT BROADCAST (3.430.1). `nextTurn` is a method the GM's
    // own click runs, like `startCombat` beside it — see the note on
    // `automatesInvoked`. Asking `isActingGM()` here meant a second GM
    // connecting stopped the surprise round skipping surprised
    // combatants on the client actually running the fight.
    if (!TRGCombat.automatesInvoked
      || !surpriseRoundInEffect(this.getFlag(SYSTEM_ID, "surpriseRoundActive"), this.round)) {
      return super.nextTurn();
    }

    const startRound = this.round;
    let result = await super.nextTurn();
    while (
      this.round === startRound &&
      shouldSkipWithAmbushAwareness(
        Boolean(this.combatant?.getFlag(SYSTEM_ID, "surprised")),
        // Not a literal `true`. The loop only runs inside the surprise
        // round, but saying so with a constant is how a condition stops
        // being able to fail — and this is the second ordering bug this
        // file has had.
        surpriseRoundInEffect(this.getFlag(SYSTEM_ID, "surpriseRoundActive"), this.round),
        // AMBUSH AWARENESS (Chapter 5): "you can still act on your
        // initiative count in the surprise round, but only to take the
        // Full Defence action." Expressed by not skipping them.
        TRGCombat.#hasAmbushAwareness(this.combatant?.actor)
      )
    ) {
      result = await super.nextTurn();
    }

    if (this.round !== startRound) {
      // Everyone eligible has had their turn — the surprise round is
      // over, and round 2 proceeds normally with everyone included.
      await this.unsetFlag(SYSTEM_ID, "surpriseRoundActive");
    }

    return result;
  }

  /** Non-disabled effects for a condition, with value and damage type. */
  static #conditionEffects(actor, id) {
    return (actor?.effects ?? [])
      .filter((effect) => !effect.disabled && effect.statuses?.has?.(id))
      .map((effect) => ({
        effect,
        value: Math.max(1, Number(effect.getFlag(SYSTEM_ID, "value") ?? 1)),
        damageType: effect.getFlag(SYSTEM_ID, "damageType") ?? null
      }));
  }

  /** The actor's live Flat-Footed effect, or null. */
  /** Does this actor hold Ambush Awareness? */
  static #hasAmbushAwareness(actor) {
    return Array.from(actor?.items ?? []).some(
      (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "ambush awareness"
    );
  }

  static #flatFootedEffect(actor) {
    return (
      Array.from(actor?.effects ?? []).find(
        (effect) => !effect.disabled && effect.statuses?.has?.("flatFooted")
      ) ?? null
    );
  }

  /**
   * Removes the Flat-Footed applied by Chapter 4 Step 4 at the start of
   * combat, and only that one — see the stamping in `#beginCombat`.
   *
   * @param {Actor} actor
   * @returns {Promise<boolean>} Whether it was there and is now gone.
   */
  static async #clearInitialFlatFooted(actor) {
    const effect = TRGCombat.#flatFootedEffect(actor);
    if (!effect?.getFlag?.(SYSTEM_ID, INITIAL_FLAT_FOOTED_FLAG)) return false;
    // Deleted BY IDENTITY, not by status. `toggleStatusEffect(id, {active:
    // false})` re-finds an effect carrying that status and removes whatever
    // it lands on — which need not be the one just identified. A disabled
    // Flat-Footed sitting ahead of the live one in the collection was enough
    // to make it delete the wrong effect: the suppressed one vanished and the
    // stamped one stayed on for the whole turn. Caught by C7/C8 of
    // verify-combat-turn-state.mjs on the first run of that harness.
    await effect.delete();
    return true;
  }

  static #chatLine(text) {
    return `<p style="margin:2px 0">${text}</p>`;
  }

  static async #postTurnCard(actor, title, lines) {
    if (!lines.length) return;
    return ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
    });
  }

  /**
   * Phase 1: Assessment. Regain AP (Stunned, Slowed, Quickened applied),
   * reduce Stunned by the AP it consumed, and make the dying check.
   * @inheritdoc
   */
  async _onStartTurn(combatant) {
    await super._onStartTurn(combatant);
    if (!TRGCombat.automates) return;

    // Delay (Chapter 4): "your next turn occurs at your original
    // position" — a stale Delayed flag (never returned) is cleared
    // the moment this combatant's own turn naturally comes back
    // around, before the AP-pool check below, since this applies to
    // any combatant type.
    await expireStaleDelay(combatant);

    // A SURPRISED COMBATANT HAS NO TURN TO START. "Only characters who
    // are NOT surprised may act in it — everyone else is skipped
    // entirely for this round." `nextTurn` steps past them, but Foundry
    // still lands on them for an instant on the way through, and this
    // handler was granting them AP and posting a Phase 1 card that said
    // "Surprise round: AP capped at 2" — for a creature that does not
    // act at all. Live testing of 12 Aug 2026 read that card and
    // believed the surprised character had taken a turn.
    //
    // AMBUSH AWARENESS IS THE EXCEPTION, and this is the SECOND guard it
    // has to pass. Found by driving it, 20 Aug 2026: `nextTurn` stopped
    // on the character correctly — the feat's first half worked — and
    // then this early return gave them no AP at all, so they arrived at
    // a turn they could not spend. Exactly the failure granting them
    // Full Defence's cost was meant to prevent, one guard further down.
    //
    // A defect that only shows when both halves are driven together,
    // which is why neither harness caught it.
    if (
      surpriseRoundInEffect(this.getFlag(SYSTEM_ID, "surpriseRoundActive"), this.round)
      && combatant.getFlag(SYSTEM_ID, "surprised")
      && !TRGCombat.#hasAmbushAwareness(combatant.actor)
    ) return;

    const actor = combatant.actor;
    if (!actor?.system?.resources?.ap) return;

    /*
     * A CREATURE IN STASIS HAS NO TURN TO START (3.614.0, Graham's R2 of block
     * 35): "no rounds pass for any timed effects, conditions, afflictions, or
     * other ongoing effects". Its stasis is let go first if this is the round
     * it ends — the creature then has this turn — and otherwise nothing of
     * its own runs: no AP, no bleeding, no heals, no saves. Everybody else's
     * clocks still run, so the shared expiry sweep is asked here as well.
     */
    {
      const { stasisOn, stasisTurnStart, releaseStasis } = await import("../magic/stasis-workflow.mjs");
      const held = stasisOn(actor);
      const ends = Number(held?.flags?.[SYSTEM_ID]?.conditionExpiresRound);
      if (held && Number.isFinite(ends) && this.round >= ends) await releaseStasis(held);
      const said = await stasisTurnStart(actor);
      if (said) {
        const stasisLines = [TRGCombat.#chatLine(said)];
        for (const other of this.combatants ?? []) {
          const subject = other?.actor;
          if (!subject || subject === actor) continue;
          for (const label of await expireTimedConditions(subject, this.round)) {
            const gone = effectExpiredLine(label, subject.name);
            if (gone) stasisLines.push(TRGCombat.#chatLine(gone));
          }
        }
        await TRGCombat.#postTurnCard(actor, "Stasis", stasisLines);
        return;
      }
    }

    // Round 1's Flat-Footed (Chapter 4, Step 4) ends HERE, at the start of
    // the character's turn — not at the end of it. Graham, 13 Aug 2026:
    // "Flat-Footed condition should clear at the start of the characters
    // turn." Clearing it at end of turn meant a character spent the whole
    // of their first turn Flat-Footed: Dexterity struck from their Defence,
    // no Reactions available, and every Rogue in reach qualifying for Sneak
    // Attack (rogue.mjs `sneakAttackTargetQualifies`) for the duration.
    //
    // Placed after the surprised early-return above, deliberately: a
    // surprised combatant has no turn in the surprise round, so nothing of
    // theirs starts and their Flat-Footed rightly survives to their first
    // real turn. Placed before the dying check below, equally deliberately,
    // so a character who begins their turn Dying still sheds it.
    await TRGCombat.#clearInitialFlatFooted(actor);

    // WHERE THIS CREATURE IS STANDING (3.580.0; page 201, R2). Settled at
    // the top of every turn as well as on every move, because a token
    // PLACED in water — dropped on the map by the GM, summoned, pushed by
    // an effect that writes coordinates directly — never fired a move
    // hook, and would otherwise fight a whole encounter in a lake with
    // none of page 201 applying to it.
    {
      const { settleSubmersion } = await import("../combat/underwater-workflow.mjs");
      await settleSubmersion(actor, combatant.token ?? actor.getActiveTokens?.()?.[0] ?? null);
    }

    // Reset the Multiple Attack Penalty counter for the new turn — overwritten
    // where an unlinked token inherits one (3.622.1, F4).
    {
      const { clearAttackCount } = await import("../combat/turn-records.mjs");
      await clearAttackCount(actor);
    }
    // Reset Appendix 3's per-turn trait usage (Open, Flourish, Defence,
    // Teleportation, Word, Conviction). Stance is deliberately not reset
    // here: its "wait at least one round" deliberately spans turns.
    await clearTraitUsage(actor);
    // Movement is charged cumulatively across a turn, so the tally and
    // any armed movement action both reset here.
    await resetMovementForTurn(actor);
    // Reset Sweep's per-weapon "different target this turn" tracking.
    await actor.unsetFlag(SYSTEM_ID, "sweepTargets");
    // Reset Quick Load's once-per-round free reload availability.
    await resetQuickLoadForTurn(actor);
    // Reset Parry's "attacked this turn" tracking.
    await resetParryTrackingForTurn(actor);
    // Ready (Chapter 4): "if the trigger does not occur before the
    // beginning of your next turn, then the action is wasted."
    if (await expireStaleReadiedAction(actor)) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Ready — Wasted</h3></div></header><p style="margin:2px 0">The trigger never occurred — the readied action is lost.</p></div>`
      });
    }
    // Full Defence's single Move allowance resets with the stance it
    // belongs to — both end at the beginning of your next turn.
    await actor.unsetFlag(SYSTEM_ID, "fullDefenceMoves");
    // Clear Tier 3 Basic Action stances (Fight Defensively, Full
    // Defence) — "until the beginning of your next turn" (Chapter 4).
    await clearExpiredBasicActionStances(actor);
    // Clear any Aid Defensive/Offensive bonuses this actor granted to
    // an ally that went unused — "expire at the beginning of your
    // next turn if they are not used" (Chapter 4). Lives wherever
    // the ally's effect actually is, not necessarily on this actor.
    await clearExpiredAidBonuses(actor, this);
    // Clear Shield Bash's "lose shield bonus to DB" penalty —
    // "until the beginning of your next turn" (Chapter 4).
    await clearShieldBashLostBonus(actor);
    // Prepare (Chapter 4): "You may use this reaction once as a free
    // action until the beginning of your next turn" — whether it was
    // used or not, the preparation does not survive this boundary.
    await clearPreparedReaction(actor);

    const lines = [];

    // Timed critical injuries (Persistence M/D) — expired regardless of
    // Dying status, since turns still pass either way.
    // EVERY COMBATANT, NOT ONLY THIS ONE (3.433.0).
    //
    // Graham, 29 August 2026: "Injury duration from chapter 7 does not
    // kick in... I had to remove an Injury that had a duration of 1 round
    // manually."
    //
    // The sweep asked only about the combatant whose turn was starting,
    // so a condition on anybody else waited for THEIR turn to come round
    // — and if combat ended first, or they were never in the tracker, or
    // the acting-GM client was not the one at the table, it waited for
    // ever. Reproduced live on 29 August: a Stunned stamped to expire on
    // round 2 was still there at round 3.
    //
    // `expireTimedConditions` only deletes what is actually due, so
    // asking it about everybody costs nothing and removes the dependency
    // on whose turn it happens to be.
    // LUMINANCE AND ITS KIND (3.435.0): "all creatures that BEGIN THEIR
    // TURN in the radius". A question movement cannot answer, so it is
    // asked here rather than in the emanation sweep.
    for (const heal of await applyPerTurnEmanations(actor, combatant.token?.object ?? null)) {
      lines.push(TRGCombat.#chatLine(heal));
    }

    // AND A SAVE OWED FOR BEGINNING THE TURN THERE (3.609.0, block 33's R3).
    // Turn Undead — the same clock, a different question. See
    // magic/turn-save.mjs.
    {
      const { applyTurnSaves } = await import("../magic/turn-save-workflow.mjs");
      for (const said of await applyTurnSaves(actor, combatant.token?.object ?? null)) {
        lines.push(TRGCombat.#chatLine(said));
      }
    }

    // AN ELEMENTAL NEXUS ASKS THE SAME QUESTION FROM A REGION (3.477.0).
    // "Any creature that begins their turn within the spells radius" —
    // the same clock as Luminance, but the zone is a placed Region
    // rather than an emanation, so it is swept separately. See
    // magic/elemental-nexus.mjs.
    for (const bite of await applyElementalNexus(actor, combatant.token?.object ?? null)) {
      lines.push(TRGCombat.#chatLine(bite));
    }

    /*
     * AND A RECURRING LADDER SET TO THE START OF A TURN (3.590.0).
     *
     * `RECURRING_WHEN` HAS HELD "startOfTurn" SINCE 3.587.0 AND NOTHING
     * EVER PASSED IT. `normaliseRecurringLadder` accepted the moment,
     * `recordRecurringLadder` wrote it onto the Region, and the cast
     * card even printed "Anyone BEGINNING a turn inside rolls ..." --
     * while the only caller was `_onEndTurn`, with "endOfTurn" written
     * into the call. A spell authored that way would have declared its
     * second save, announced it on the card, and never rolled it once.
     *
     * A VOCABULARY ENTRY WITH NO DRIVER, which is the same defect shape
     * as a bonus slot with nowhere to land: what was measured was that
     * the WORD was accepted, not that anything acted on it. Found
     * authoring Incendiary Cloud, whose only save is this one: "each
     * creature that STARTS ITS TURN in the spell's area must make a
     * saving throw".
     *
     * HERE, BESIDE THE NEXUS, because it is the same clock question the
     * nexus asks and the page names the same boundary.
     */
    for (const burn of await applyRecurringLadders(
      actor, combatant.token?.object ?? null, "startOfTurn")) {
      lines.push(TRGCombat.#chatLine(burn));
    }

    // AND A WALL OCCUPIED AS THE TURN BEGINS (3.610.0, R9 — Wall Of Fire).
    {
      const { applyWallTurnSaves } = await import("../magic/wall-spell-workflow.mjs");
      for (const burn of await applyWallTurnSaves(actor, combatant.token?.object ?? null, "startOfTurn")) {
        lines.push(TRGCombat.#chatLine(burn));
      }
    }

    /*
     * AND THE BALL IS AIMED (3.588.0). "At the START of each of your
     * turns, you may as a free action direct the ball to a new target or
     * have it hit the current target again."
     *
     * HERE, BESIDE THE NEXUS, because both are the same clock question
     * and the page names the same boundary. It is the CASTER's turn that
     * matters, not the target's — so this asks the actor whose turn is
     * starting what balls THEY have running, and not who is standing
     * where.
     *
     * Graham's ruling of 24 September 2026 is what makes it safe to run
     * unattended: a turn where no free action is spent still strikes, so
     * an unanswered dialog produces the same result as a deliberate
     * "leave it" rather than a silently skipped attack.
     */
    for (const bolt of await fireDirectedStrikes(actor, combatant.token?.object ?? null)) {
      lines.push(TRGCombat.#chatLine(bolt));
    }

    /*
     * AND A NEW SAVE AGAINST A MOVEMENT BIND (3.606.0). Spirit Trap: "they
     * make a new saving throw at the beginning of their next turn." The
     * creature's OWN turn, so this asks the actor whose turn is starting.
     * See magic/movement-bind.mjs for why the new save re-reads the ladder.
     */
    {
      const { rollMovementBindSaves } = await import("../magic/movement-bind-workflow.mjs");
      for (const said of await rollMovementBindSaves(actor, combatant.token ?? null)) {
        lines.push(TRGCombat.#chatLine(said));
      }
    }

    // VIBRANT THORNS (3.440.0): "inflicting 1d6 damage ... UNTIL THE
    // BEGINNING OF YOUR NEXT TURN". Another question only the turn clock
    // can answer, so it is asked beside Luminance rather than given an
    // invented duration in seconds. Silent — the window closing is not
    // news, and a line every round for every thorned creature would be.
    await clearThornsIntensity(actor);

    const swept = new Set();
    for (const other of this.combatants ?? []) {
      const subject = other?.actor;
      if (!subject || swept.has(subject.id)) continue;
      swept.add(subject.id);
      for (const label of await expireTimedConditions(subject, this.round)) {
        // THE SENTENCE MOVED OUT AT 3.514.0, unchanged, so that the world
        // clock can print the same one. It had none at all until then —
        // see combat/effect-expiry.mjs for what the two clocks disagreed
        // about and why each was doing half the job.
        const said = effectExpiredLine(label, subject === actor ? "" : subject.name);
        if (said) lines.push(TRGCombat.#chatLine(said));
      }
    }

    // RAGE'S MINUTE, on the combat clock (3.416.0). It cannot ride
    // `expireTimedConditions` because that ends an effect by deleting
    // it, and ending a rage also clears its temporary HP and charges the
    // Fatigue the book asks for. Before this NOTHING ended a rage: the
    // printed minute was decorative, and a fumbled Revoke locked it
    // permanently. See combat/rage.mjs.
    // A RAGE WHOSE EFFECT IS ALREADY GONE still owes its temporary HP
    // back (3.433.0). See reclaimOrphanedRageTemporaryHP.
    const reclaimed = await reclaimOrphanedRageTemporaryHP(actor);
    if (reclaimed > 0) {
      lines.push(TRGCombat.#chatLine(
        `<strong>${reclaimed}</strong> unspent temporary HP from an ended rage is cleared.`));
    }

    const ragedOut = await expireRage(actor, { worldTime: game.time?.worldTime ?? null, round: this.round });
    if (ragedOut?.ended) {
      lines.push(TRGCombat.#chatLine(
        `<strong>The rage burns out.</strong> Now Fatigued ${ragedOut.fatigue} for 1 hour`
        + (ragedOut.temporaryHPLost > 0
          ? `, losing ${ragedOut.temporaryHPLost} unspent temporary HP.`
          : ".")));
    }

    // CONTROL LEVELS (page 242, 3.585.0): a caster holding more creature
    // levels than they can control has the highest-level one roll a
    // DC 20 Will save each round to break free. One save per round, on
    // the CONTROLLER's turn — the page's pressure is steady rather than
    // a stampede, and the controller's turn is the one moment per round
    // this can be asked exactly once.
    const { sweepControlOverflow } = await import("../magic/control-register-workflow.mjs");
    await sweepControlOverflow(actor);

    // Sustained spells (Chapter 9): a "Sustained"-word spell not sustained in
    // time lapses at the start of the caster's turn; its effects are removed.
    const lapsed = await sweepSustainedLapses(actor, this.round);
    for (const name of lapsed) {
      lines.push(TRGCombat.#chatLine(`<strong>${name}</strong> lapses (not sustained).`));
    }

    // AN EMANATION ON ITS OWN CLOCK (3.430.0). The sweep above ends
    // "Sustained"-word spells only, and Protective Ward is not one: its
    // duration is a flat minute that nothing was watching. Its effects
    // carry no duration of their own by design, so without this the ward
    // would follow its caster for the rest of the session.
    const faded = await sweepActiveSpellExpiry(actor, {
      worldTime: game.time?.worldTime ?? null, round: this.round
    });
    for (const name of faded) {
      lines.push(TRGCombat.#chatLine(`<strong>${name}</strong> fades — its duration is spent.`));
    }

    // AND A ROW WITH NOTHING BEHIND IT (3.511.0). Graham's ruling of
    // 7 Sep 2026: a sustained spell gets no clock on purpose, so out of
    // combat nothing ended its panel row even after its effects expired.
    // See magic/orphaned-spells.mjs — and its three guards, each of which
    // is a spell this would otherwise end on its first round.
    const { sweepOrphanedSpells } = await import("../magic/active-spells.mjs");
    const { orphanedSpellLine } = await import("../magic/orphaned-spells.mjs");
    for (const name of await sweepOrphanedSpells(actor)) {
      lines.push(TRGCombat.#chatLine(orphanedSpellLine(name)));
    }

    // AND THE AREA IT LEFT ON THE CANVAS (3.500.0). Scene-wide rather
    // than per-actor, unlike every sweep above it — a Region belongs to
    // the canvas, not to a character — but called from here because this
    // is where the round number lives. Six spells claimed a Region and
    // nothing ever deleted one; see magic/region-expiry.mjs.
    const { sweepRegionExpiry } = await import("../magic/region-expiry-workflow.mjs");
    for (const name of await sweepRegionExpiry(canvas?.scene ?? null, {
      worldTime: game.time?.worldTime ?? null, round: this.round
    })) {
      lines.push(TRGCombat.#chatLine(regionExpiredLine(name)));
    }

    // Refocus, Success (Chapter 6): "you may use it again at the beginning of
    // your next turn" — this is that boundary. Partial's one-minute wait comes
    // due on the world clock instead (scripts/trg-prime.mjs); both ask the
    // same predicate for whether it is time yet.
    for (const back of await sweepRefocusRestores(actor, { ownTurnStarted: true })) {
      lines.push(
        TRGCombat.#chatLine(
          `<strong>${back.name}</strong> is yours again (${back.next} / ${back.max}) — Refocus.`
        )
      );
    }

    // A DEAD CHARACTER TAKES NO TURN. Belt to `reapDead`'s braces: removal
    // from the tracker is what normally stops this handler ever being
    // reached, but a combatant re-added by hand, or an actor whose death was
    // written straight onto the sheet, would otherwise walk back into the
    // dying check below — which is exactly what Joe did on 13 Aug 2026,
    // passing a save that took a dead man from Dying 7 to Dying 6.
    if (isDead(actor)) {
      await reapDead(actor, this);
      await TRGCombat.#postTurnCard(actor, "Phase 1 — Assessment", [
        TRGCombat.#chatLine("<strong>Dead</strong> — no turn is taken, and no Dying Check is rolled.")
      ]);
      return;
    }

    // Dying check first: a dying creature regains no AP.
    const dying = actor.getConditionValue?.("dying");
    if (dying !== null && dying !== undefined) {
      await this.#processDyingCheck(actor, dying, lines);
      await TRGCombat.#postTurnCard(actor, "Phase 1 — Assessment", lines);
      return;
    }

    const stunned = actor.getConditionValue?.("stunned") ?? 0;
    // SLOWED AS APPLIED, NOT AS SHOWN (3.621.0; block 39's A3). Stunned
    // overrides Slowed on the sheet, and computeAPRegain counts the AP lost to
    // Stunned toward Slowed's — the page's Stunned 1 / Slowed 2 example keeps
    // 1 AP. Read from the effective set, Slowed was 0 while Stunned lasted.
    const slowed = Number(actor.conditions?.direct?.get?.("slowed") ?? actor.getConditionValue?.("slowed") ?? 0) || 0;
    const quickened = actor.hasCondition?.("quickened") ?? false;

    // A CREATURE THAT CANNOT ACT REGAINS NOTHING (3.578.0, page 190; the
    // block-18 audit's D10 and Graham's R14): "If a condition prevents you
    // from being able to act, you don't regain any actions or your
    // reaction." Unconscious and Petrified. Its Stunned is not spent on a
    // turn it regains nothing in, so the regain is computed from a pool of
    // nothing rather than skipped.
    const acting = actsThisTurn({
      unconscious: Boolean(actor.hasCondition?.("unconscious")),
      petrified: Boolean(actor.hasCondition?.("petrified")),
      paralyzed: Boolean(actor.hasCondition?.("paralyzed"))
    });

    // SLOW (I) / (II) (Creature Codex; 3.631.0): "reduces the creature's AP
    // by 1 / 2" — read as a Slowed of that value that never ends, so it
    // meets Stunned and Quickened in computeAPRegain the way the page does.
    const abilitySlow = abilityApPenalty(Array.from(actor.items ?? []));
    const regain = computeAPRegain({ stunned, slowed: slowed + abilitySlow, quickened, ...(acting.canAct ? {} : { base: 0 }) });
    // Surprise round (Chapter 4, Step 3): "up to 2 AP worth of
    // actions" — capped here rather than in computeAPRegain itself,
    // since Stunned/Slowed/Quickened's own interaction with AP is
    // unrelated to this and shouldn't be tangled together.
    // THE ROUND IS PART OF THE QUESTION. The flag comes down in
    // `nextTurn` AFTER `super.nextTurn()` has already begun the next
    // turn, so the first combatant of round two used to be granted AP
    // with the flag still up and opened the round capped at 2. Asking
    // "flag, and is this still round one?" is immune to that ordering
    // in a way that reading the flag alone is not.
    const flag = this.getFlag(SYSTEM_ID, "surpriseRoundActive");
    const surpriseRoundActive = surpriseRoundInEffect(flag, this.round);
    const finalAP = acting.canAct
      ? apForTurn(regain.ap, surpriseRoundActive, TRGCombat.#hasAmbushAwareness(actor))
      : 0;

    // IMPROVED COMBAT REFLEXES (3.378.0): "at the start of each of your
    // turns when you regain your actions, you gain an additional amount of
    // reactions... equal to your Dex." Here, because this IS the moment
    // the feat names, and because the pool has exactly one refill site —
    // granting them anywhere else would be a second place deciding how
    // many reactions a creature has.
    const reactionState = reactionsAtTurnStart({
      maxReactions: Number(actor.system?.resources?.reactions?.max ?? 1),
      reactionLost: regain.reactionLost,
      dexterity: Number(actor.system?.attributes?.dexterity?.total ?? 0),
      featNames: Array.from(actor?.items ?? [])
        .filter((i) => i.type === "feat")
        .map((i) => i.name)
    });
    const newReactions = acting.canAct ? reactionState.value : 0;

    await actor.update({
      "system.resources.ap.value": finalAP,
      "system.resources.reactions.value": newReactions,
      // THE TURN THESE AP BELONG TO (3.621.0; Appendix 2, block 39's R7):
      // "if you gain the Stunned Condition during your own turn, you
      // immediately deduct the Stunned value from any remaining AP" — which
      // is only true once the turn's AP has been regained. A Stunned laid on
      // in Phase 1, before this write, is spent by the regain above instead.
      [`flags.${SYSTEM_ID}.apGrantedTurn`]: { combatId: this.id, round: this.round, turn: this.turn },
      // The two Fighter per-round trackers reset where the reaction pool
      // refills, because that IS the round boundary the reaction economy
      // uses: Battle Readiness's one unrestricted spend, and Press the
      // Advantage's once-per-round prompt. Harmless no-ops for everyone
      // else (a ForcedDeletion is safe when the key is absent, same as
      // the old `-=` syntax it replaces).
      [`flags.${SYSTEM_ID}.nonMartialReactionSpent`]: deletionValue(),
      [`flags.${SYSTEM_ID}.pressAdvantageUsed`]: deletionValue(),
      // ...and Time Stop's extra actions (3.609.1, F9): spent or not, they
      // were for the turn time stood still, and the pool is back to its own
      // ceiling from here.
      [`flags.${SYSTEM_ID}.apOverflow`]: deletionValue(),
      // ...and the Great Cleave chain (3.353.1), for the same reason:
      // the chain costs one reaction and lives inside one trigger, so it
      // must not survive into a round where a fresh reaction is waiting.
      // A stuck flag here would be a permanently free Cleave.
      [`flags.${SYSTEM_ID}.cleaveChain`]: deletionValue(),
      // ...and the Rogue's (3.217.0): Opportunist's Strike is also
      // "once per round".
      [`flags.${SYSTEM_ID}.opportunistUsed`]: deletionValue(),
      // ...and the Ranger's (3.224.0): Precision Hunter's "once per
      // round, the first time you damage your hunted prey". The prey
      // DESIGNATION itself (huntedPrey) deliberately does not reset —
      // Hunt Prey has no printed duration.
      [`flags.${SYSTEM_ID}.precisionHunterUsed`]: deletionValue(),
      // ...and every declared strike rider's marker (3.564.0) — the same
      // "once per round, the first time you damage" window, as data.
      [`flags.${SYSTEM_ID}.damageRidersUsed`]: deletionValue(),
      // ...and the healing riders' (3.625.0): Vital Surge's "once per round".
      [`flags.${SYSTEM_ID}.healingRidersUsed`]: deletionValue(),
      // ...and the once-per-round strike riders' (3.625.0): Consecrated Armament, Final Sanction.
      [`flags.${SYSTEM_ID}.strikeRidersUsed`]: deletionValue(),
      // ...and the caster's spell-damage riders' (3.625.0): Consecrated Flame, per creature.
      [`flags.${SYSTEM_ID}.spellDamageRidersUsed`]: deletionValue(),
      // ...and Improved Combat Reflexes' Flat-Footed allowance (3.378.0),
      // which is "a single attack of opportunity each round" and so must
      // clear on the same boundary the reaction pool uses. A stuck flag
      // here would silently remove the feat's second clause for the rest
      // of the fight.
      [`flags.${SYSTEM_ID}.flatFootedOpportunityUsed`]: deletionValue(),
      // ...and Born to Ride's one free riding action (3.378.0).
      [`flags.${SYSTEM_ID}.bornToRideUsed`]: deletionValue()
    });

    // SHARED AP (page 200; the block-19 audit's D13, Graham's R13). The
    // pair's pool is "determined by the character with the lowest amount
    // of action points between you" — applied here, at the one moment
    // both pools are full, so the lower of the two maxima is what they
    // start the turn with and every spend below comes out of it.
    {
      const { syncSharedAP } = await import("../combat/mounted-workflow.mjs");
      const pool = await syncSharedAP(actor);
      if (pool !== null && pool < finalAP) {
        lines.push(TRGCombat.#chatLine(
          `<strong>Mounted:</strong> one shared pool of <strong>${pool} AP</strong> with the mount `
          + `(page 200 — the lower of the two), rather than ${finalAP}.`));
      }
    }

    /*
     * EXTRA CASTING TIME IS PAID HERE (3.592.0), and here because this is
     * the line AFTER the turn's AP has been granted and the mounted pool
     * has been reconciled. Paying any earlier would spend the previous
     * turn's leftovers and then hand the caster a full pool to act with.
     *
     * THE BUTTON RIDES THIS CARD ON PURPOSE. Graham, 25 September 2026:
     * the old "Complete the casting" button sat on the card posted when
     * the window opened and "disappears up the chat log" while the caster
     * stood there for two rounds. Phase 1 posts a fresh card at the start
     * of every turn, so putting the button on it means the one the player
     * needs is always the newest thing in the log.
     */
    {
      const { payPendingCastTurn } = await import("../magic/pending-cast-workflow.mjs");
      const casting = await payPendingCastTurn(actor);
      if (casting) {
        lines.push(TRGCombat.#chatLine(casting.line));
        lines.push(casting.buttons);
      }
    }

    if (!acting.canAct) {
      lines.push(TRGCombat.#chatLine(
        `<strong>${acting.reason}</strong> — cannot act: <strong>no AP and no reaction</strong> this turn.`
      ));
    } else if (acting.note) {
      lines.push(TRGCombat.#chatLine(`<em>${acting.note}</em>`));
    }

    if (surpriseRoundActive && finalAP < regain.ap) {
      lines.push(
        TRGCombat.#chatLine(
          `<strong>Surprise round:</strong> AP capped at ${finalAP} (would otherwise have been ${regain.ap}).`
        )
      );
    }

    if (acting.canAct && (stunned || slowed || quickened)) {
      lines.push(
        TRGCombat.#chatLine(
          `Regains <strong>${finalAP} AP</strong>` +
            (regain.quickenedBonus ? " (Quickened +1)" : "") +
            (regain.apLostToStunned
              ? `, losing ${regain.apLostToStunned} to Stunned`
              : "") +
            (regain.apLostToSlowed
              ? `, ${regain.apLostToSlowed} to Slowed`
              : "") +
            "."
        )
      );
    }

    if (regain.reactionLost) {
      lines.push(
        TRGCombat.#chatLine(
          "Stunned consumed every AP — <strong>no reaction this turn</strong>."
        )
      );
    }

    // A STUN SOMETHING HOLDS (3.609.1, F4): Vision Of Havoc's stays at 1
    // for its minute, ended by its save rather than by this countdown. The
    // AP it costs is still lost above; only the reduction is withheld.
    const stunHold = Math.max(0, ...Array.from(actor.effects ?? [])
      .filter((e) => e.statuses?.has?.("stunned"))
      .map((e) => Number(e.getFlag?.(SYSTEM_ID, "conditionHold")) || 0));
    if (stunned && acting.canAct && stunHold > 0 && regain.stunnedRemaining < stunHold) {
      if (Number(actor.getConditionValue?.("stunned") ?? 0) !== stunHold) {
        await actor.toggleStatusEffect("stunned", { value: stunHold });
      }
      lines.push(TRGCombat.#chatLine(`Stunned stays at ${stunHold} — it ends on its save, not with the turn.`));
    } else if (stunned && acting.canAct) {
      if (regain.stunnedRemaining > 0) {
        await actor.toggleStatusEffect("stunned", {
          value: regain.stunnedRemaining
        });
        lines.push(
          TRGCombat.#chatLine(`Stunned reduces to ${regain.stunnedRemaining}.`)
        );
      } else {
        await actor.toggleStatusEffect("stunned", { active: false });
        lines.push(TRGCombat.#chatLine("Stunned ends."));
      }
    }

    // Fast Healing (Bestial Resilience and kin): any active effect carrying
    // a numeric fastHealing flag heals that much at the start of the turn,
    // clamped to maximum HP. Summed across sources. Read from
    // appliedEffects, NOT actor.effects — compendium feats carry this flag
    // on TRANSFERRED effects, which V12+ keeps on the item (found live,
    // 3.185.1: Fast Healer's flag was invisible to the old read).
    // A RATE THE SUNLIGHT SUPPRESSES (3.627.0): Pillars of Faith's Fast
    // Healing, "suppressed while Sunlight Weakness applies" — under the
    // weakness, or beginning this turn in the sun (the weakness is applied
    // by the turn-start card a moment later). See sunlight.mjs.
    const { suppressedInSunlight } = await import("../sunlight.mjs");
    const { sunlightStateOfToken } = await import("../sunlight-workflow.mjs");
    const sunlit = Boolean(actor.getFlag?.(SYSTEM_ID, "sunlightWeakness")?.active)
      || sunlightStateOfToken(combatant?.token) === "sun";
    const healingRate = (flag) => Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter((e) => !e.disabled)
      .filter((e) => !(sunlit && suppressedInSunlight(e)))
      .reduce((total, e) => total + Math.max(0, Number(e.getFlag?.(SYSTEM_ID, flag) ?? 0)), 0);
    const fastHealingRate = healingRate("fastHealing");
    /*
     * REGENERATION HEALS HERE TOO (3.591.0), and until now it did not.
     *
     * Page 193: "A creature with fast healing OR REGENERATION regains
     * the listed amount of Hit Points each round at the beginning of its
     * turn." For HP the two rules are the same sentence; they part
     * company only on the INJURED condition, where fast healing works
     * every hour and regeneration every ten minutes.
     *
     * `injury-workflow.mjs` has read both rates since it was written,
     * on their two cadences \u2014 and its own comment says it reads them
     * "FROM THE SAME PLACE THE HP HALF READS THEM (documents/combat.mjs,
     * Phase 1)". That was true of `fastHealing` and false of
     * `regeneration`: this sum named one flag. So a creature with
     * Regeneration 5 healed its injuries on the right clock and NO HIT
     * POINTS AT ALL.
     *
     * Nothing had ever exercised it \u2014 measured across every pack: the
     * only healing rate authored anywhere is Fast Healer's `fastHealing:
     * 1`. Found writing Metabolism, which is the first spell to grant a
     * rate of either kind.
     *
     * THE CREATURE CODEX'S REGENERATION IS A DIFFERENT, STRONGER THING
     * \u2014 healing equal to the creature's level, a body that cannot die
     * while it runs, and an off-switch when it takes a big enough hit.
     * That one has its own rail in creature-turn-start.mjs, which posts a
     * card with a button because the off-switch needs a person. This is
     * the Core rule: a listed number, on the same clock as fast healing.
     */
    const regenerationRate = healingRate("regeneration");
    const fastHealing = fastHealingRate + regenerationRate;
    // "Non-magical healing (INCLUDING FAST HEALING) has no effect on you"
    // while Dying — Graham, 13 Aug 2026. THAT RULE IS ALREADY KEPT HERE, by
    // control flow rather than by a test: the dying check above returns for
    // any actor carrying the condition, so a Dying creature never reaches
    // this line. A guard was written here first and then removed, because an
    // `if` that can never be false is a check nothing can exercise and a
    // reassurance nothing has earned. If the dying branch above ever stops
    // returning, this is the rule that has to be reinstated — which is why
    // the sentence is still here even though the code is not.
    if (fastHealing > 0) {
      const hp = actor.system.resources?.hp ?? {};
      const healed = Math.min(fastHealing, Math.max(0, Number(hp.max ?? 0) - Number(hp.value ?? 0)));
      if (healed > 0) {
        await actor.update({ "system.resources.hp.value": Number(hp.value ?? 0) + healed });
        // NAMED FOR WHAT GRANTED IT. A player whose sheet says
        // Regeneration should not read "Fast Healing" on the card, and a
        // creature carrying both is told so rather than having one of
        // them silently absorbed into the other's name.
        const source = regenerationRate && fastHealingRate
          ? "Fast Healing and Regeneration"
          : regenerationRate ? "Regeneration" : "Fast Healing";
        lines.push(TRGCombat.#chatLine(`${source} restores <strong>${healed} HP</strong>.`));
      }
    }

    await TRGCombat.#postTurnCard(actor, "Phase 1 — Assessment", lines);

    // RENEWAL'S TOUCH (3.614.0, R8): "at the beginning of each of the targets
    // turns, it may choose to use one of the following effects for 2 AP".
    // After the AP are regained, so the 2 AP exist to spend. A card with a
    // button per option, for the creature's owner to press.
    {
      const { offerTurnOptions } = await import("../magic/turn-options-workflow.mjs");
      await offerTurnOptions(actor, this);
    }
  }

  /** Roll and apply the dying check. */
  async #processDyingCheck(actor, dying, lines) {
    const level = Number(actor.system.identity?.level ?? 1);
    const fortitude = Number(
      actor.system.combat?.saves?.fortitude?.total ?? 0
    );

    // Indomitable Resilience (Chapter 5): +2 racial to Dying Checks.
    const featBonus = dyingCheckBonus(
      Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name)
    );
    // ANGELSTEP PIGMENT (page 180; 3.577.0): "The next time the wearer
    // gains the dying condition, it gains a +4-item bonus on its next check
    // to recover." This is that check, so the marker is spent here.
    const { consumeMarker: consumeAngelstep } = await import("../magic/markers.mjs");
    const angelstep = await consumeAngelstep(actor, "angelstep");
    const check = await TRGCheck.roll({
      actor,
      label: "Dying Check",
      subtitle: `Dying ${dying} — Level-Based Fortitude Save`,
      type: "save",
      // NO `subject`, DELIBERATELY, and the reason is recorded where the
      // harness can read it — SAVE_SCOPE_EXEMPTIONS in
      // module/combat/save-advantage.mjs. The subtitle calls this a
      // Fortitude save, which would put it inside Juggernaut's reach, but a
      // character rolling it is unconscious and both halves of that family
      // are ACTIONS: a Reaction, or a Free action once upgraded. Naming the
      // save here would hand an unconscious character an action to take.
      dc: levelDC(level),
      modifiers: [
        { label: "Fortitude", value: fortitude, type: "untyped" },
        ...(featBonus ? [{ label: "Indomitable Resilience", value: featBonus, type: "race" }] : []),
        ...(angelstep ? [{ label: "Angelstep", value: ANGELSTEP_DYING_BONUS, type: "item" }] : [])
      ]
    });

    let degree = check.outcome?.degree?.key ?? "partial";

    // THE CHAOS ROW (page 194; the block-19 audit's D11, Graham's R11 of
    // 21 September 2026). The Dying Check prints seven results and the
    // code read six: "Chaos — Treat as a Modified Result and the GM
    // introduces a minor complication or benefit (no additional mechanics
    // required)."
    //
    // READ FROM THE DICE, NOT THE OUTCOME, and that is the whole point of
    // the ruling. `outcome.chaos` is gated on the optional `chaosResults`
    // world setting, which ships OFF — but page 194 prints Chaos as one of
    // this check's own seven rows, not as an optional rule, so it applies
    // at every table. "Treat as a Modified Result" is the degree the roll
    // already produced, so nothing here changes it; the row exists to tell
    // the GM to add something, which is what the card now does.
    if (check?.dice?.chaos) {
      lines.push(TRGCombat.#chatLine(
        "<strong>Chaos!</strong> Treated as the modified result above — and the GM introduces "
        + "a minor complication or benefit (page 194; no additional mechanics required)."));
    }

    // DEATHLESS (Chapter 11): "Activate Reaction; Trigger the wielder
    // makes a Dying Check ... Your Dying Check is treated as a Critical
    // Result." Offered rather than applied: it is once a day and the
    // player may be saving it for a worse moment than this one.
    const { DEATHLESS_DEGREE, equippedEventRune, eventUsesRemaining } =
      await import("../rune-events.mjs");
    const deathless = equippedEventRune(Array.from(actor.items ?? []), "deathless");
    // NOT ON A HEROIC (3.615.0, B6 of block 36): a Heroic Dying Check
    // already moves Dying as far as a Critical, so offering the rune there
    // spent the day's use for nothing.
    if (deathless && degree !== DEATHLESS_DEGREE && degree !== "heroic"
      && eventUsesRemaining(deathless.item, deathless.rune) > 0) {
      const use = await foundry.applications.api.DialogV2.confirm({
        window: { title: `${deathless.item.name} — Deathless` },
        content: `<p>Your Dying Check came up <strong>${degree}</strong>.</p>`
          + `<p>Spend the Deathless rune (a reaction, once a day) to treat it as a <strong>Critical Result</strong> instead?</p>`,
        rejectClose: false
      });
      if (use) {
        const spent = Number(
          deathless.item.flags?.["trg-prime"]?.runeState?.spent?.deathless ?? 0);
        await deathless.item.update({
          "flags.trg-prime.runeState.spent.deathless": spent + 1
        });
        degree = DEATHLESS_DEGREE;
        lines.push(TRGCombat.#chatLine(
          `<strong>${deathless.item.name}'s Deathless rune</strong> — the check is treated as a Critical Result.`));
      }
    }

    const outcome = dyingCheckOutcome(degree);

    if (outcome.dead) {
      lines.push(
        TRGCombat.#chatLine(
          "<strong>Blunder — the lights go out. The character has died.</strong>"
        )
      );
      // Death is a STATE, not a sentence. Pushed one past the effective
      // Death State — the same shape every other death in the system uses —
      // and then reaped, so the skull goes on and the combatant leaves the
      // order rather than coming round again next turn.
      await actor.toggleStatusEffect("dying", { value: actorDeathState(actor) + 1 });
      const reaped = await reapDead(actor, this);
      if (reaped.spared) lines.push(TRGCombat.#chatLine(`<strong>…but ${reaped.spared.label} answers it:</strong> Dying 0, ${reaped.spared.hp} HP.`));
      if (reaped.removed) {
        lines.push(TRGCombat.#chatLine("<em>Removed from the initiative order.</em>"));
      }
      return;
    }

    // STABILISE (Chapter 10): "The target's Dying condition does not
    // increase at the end of their turn." Applied, not offered — unlike
    // Deathless above, which is a once-a-day reaction the player may
    // want to save. Stabilise was already spent when it was cast, its
    // marker lasts one round, and there is no later moment to hold it
    // for; a prompt would only be a chance to waste it by accident.
    //
    // ASKED ONLY WHEN IT COULD MATTER. `consumeMarker` deletes what it
    // finds, so calling it on a Critical would spend the spell to
    // improve a roll that needed no help — "once per round" made into a
    // trap by the code rather than by the rules. The delta decides.
    let delta = outcome.delta;
    if (stabiliseWouldHelp(delta)) {
      const { consumeMarker } = await import("../magic/markers.mjs");
      if (await consumeMarker(actor, "stabilised")) {
        delta = stabilisedDyingDelta(delta, true);
        lines.push(TRGCombat.#chatLine(
          `<strong>Stabilise</strong> — the Dying condition does not increase.`));
      }
    }

    const deathState = effectiveDeathState(
      actor.system.combat?.deathState ?? 5,
      actor.getConditionValue?.("doomed") ?? 0
    );
    const result = applyDyingChange({
      dying,
      delta,
      deathState
    });

    if (result.dead) {
      lines.push(
        TRGCombat.#chatLine(
          `Dying rises to ${result.dying}, exceeding Death State ${deathState}. <strong>The character has died.</strong>`
        )
      );
      await actor.toggleStatusEffect("dying", { value: result.dying });
      const reaped = await reapDead(actor, this);
      if (reaped.spared) lines.push(TRGCombat.#chatLine(`<strong>…but ${reaped.spared.label} answers it:</strong> Dying 0, ${reaped.spared.hp} HP.`));
      if (reaped.removed) {
        lines.push(TRGCombat.#chatLine("<em>Removed from the initiative order.</em>"));
      }
      return;
    }

    if (result.recovered) {
      // RECOVERY LEAVES A STATE (Graham, 13 Aug 2026): Dying goes, Fatigued
      // rises by one, and — the part that was missing — the character is
      // UNCONSCIOUS at 0 HP. Without it Nomira spent eight rounds of the
      // playtest "recovered" and inert: unable to act, nothing on her sheet
      // saying why, and still being offered Attacks of Opportunity as an
      // eligible reactor.
      const state = await applyDyingRecovery(actor);
      if (state.blocked) {
        // A Fatal injury holds them at Dying 1 (page 193; R8).
        lines.push(TRGCombat.#chatLine(
          `Dying would reach 0 — but ${state.note} It holds at <strong>1</strong>.`));
        return;
      }
      lines.push(
        TRGCombat.#chatLine(
          state.unconscious
            ? `Dying reaches 0 — <strong>recovered</strong>, but still at 0 HP and <strong>Unconscious</strong>. Fatigued rises to ${state.fatigued}.`
            : `Dying reaches 0 — <strong>recovered</strong>, and already above 0 HP. Fatigued rises to ${state.fatigued}.`
        )
      );
      return;
    }

    if (outcome.delta !== 0) {
      await actor.toggleStatusEffect("dying", { value: result.dying });
    }
    lines.push(
      TRGCombat.#chatLine(
        `Dying ${outcome.delta > 0 ? "rises" : outcome.delta < 0 ? "falls" : "holds"} at <strong>${result.dying}</strong> (Death State ${deathState}).`
      )
    );
  }

  /**
   * Phase 3: End Phase. Apply Bleeding and Recurring Damage, then the flat
   * checks that may end them.
   * @inheritdoc
   */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    if (!TRGCombat.automates) return;

    const actor = combatant.actor;
    if (!actor) return;

    // NOTHING ENDS FOR A CREATURE IN STASIS (3.614.0, R2) — no bleeding, no
    // recurring damage, no Flat-Footed lifting. Only the Fumble's save.
    {
      const { stasisTurnEnd } = await import("../magic/stasis-workflow.mjs");
      const said = await stasisTurnEnd(actor);
      if (said) {
        await TRGCombat.#postTurnCard(actor, "Stasis", said.map((l) => TRGCombat.#chatLine(l)));
        return;
      }
    }

    // Flat-Footed from every source OTHER than Chapter 4 Step 4 — a
    // critical hit, a basic action's outcome — expires at the end of its
    // owner's turn, as it always has. Step 4's own Flat-Footed no longer
    // reaches here: _onStartTurn removed it at the top of this same turn
    // (Graham, 13 Aug 2026), so by now there is nothing of its to find.
    // Placed before the bleeds/recurrings early-return below, since this
    // needs to run regardless of either.
    if (actor.hasCondition?.("flatFooted")) {
      await actor.toggleStatusEffect("flatFooted", { active: false });
    }

    // Pain Tolerance (Chapter 6): "ignore up to 1 point... until the
    // end of your [current/next] turn" — decremented every time this
    // actor's own turn ends, restoring the suppressed point once the
    // counter reaches 0.
    await decrementPainToleranceSuppressions(actor);

    /*
     * A SECOND SAVE FOR WHOEVER IS STILL STANDING IN IT (3.587.0, R2).
     *
     * "Whenever a creature ends its turn in the area…" — the END
     * boundary, which is why it is here rather than beside the elemental
     * nexus in `_onStartTurn`. Movement cannot answer it: a creature
     * that has not moved all turn still owes the save, and no movement
     * hook fires for standing still.
     */
    /*
     * POSTS ITS OWN CARD, and that is not a style choice. `lines` is not
     * declared until ninety lines below this, behind
     *
     *   if (!bleeds.length && !recurrings.length) return;
     *
     * so appending to it would have skipped the ladder entirely for
     * every creature that was not also bleeding — which is nearly all of
     * them. Caught by grepping for the collector rather than assuming
     * one was in scope; the first draft pushed to a name that did not
     * exist.
     */
    const ladderLines = await applyRecurringLadders(
      actor, combatant.token?.object ?? null, "endOfTurn");
    // AND A WALL A CREATURE ENDS ITS TURN IN (3.610.0, R9 — Wall Of Blades),
    // on the same end-phase card.
    {
      const { applyWallTurnSaves } = await import("../magic/wall-spell-workflow.mjs");
      ladderLines.push(...await applyWallTurnSaves(actor, combatant.token?.object ?? null, "endOfTurn"));
    }
    if (ladderLines.length) {
      await TRGCombat.#postTurnCard(
        actor, END_PHASE_LABEL, ladderLines.map((said) => TRGCombat.#chatLine(said)));
    }

    // HEALED AT THE END OF ITS OWN TURN (3.609.0, R8 — Vigour). Its own card,
    // for the reason the ladder above gives. See magic/life-transfer.mjs.
    {
      const { applyTurnHeals } = await import("../magic/essence-trade-workflow.mjs");
      const healLines = await applyTurnHeals(actor);
      if (healLines.length) {
        await TRGCombat.#postTurnCard(actor, END_PHASE_LABEL, healLines.map((said) => TRGCombat.#chatLine(said)));
      }
    }

    /*
     * AND ANYTHING WAITING ON A ROLL THAT NEVER CAME (3.587.0, R4).
     *
     * Disorient's rungs are all bounded by "the end of their next turn",
     * and two of the three can go UNUSED — a target that rolls nothing
     * still sheds the penalty. Without this they would sit in the roll
     * dialog for the rest of the session, which is the failure mode the
     * pending list was built to avoid in the first place.
     *
     * HERE, AT THE END BOUNDARY, BECAUSE THAT IS THE MOMENT THE PAGE
     * NAMES. Counting it at the start of a turn would be measuring a
     * different moment and calling it this one — the defect shape this
     * project keeps recording.
     *
     * Unclocked entries are untouched; see expirePendingModifiers.
     */
    /*
     * AND THE ESCAPE SAVES A CREATURE OWES (3.590.0, R2). "At the end of
     * each of its turns, it can attempt a new Will save…" — Hold Animal,
     * Hold Kind, Dominate and Petrification all name this boundary.
     *
     * BESIDE THE RECURRING LADDER, and neither asks the other's
     * question: the ladder asks who is standing in a place, this asks
     * what a creature is carrying. See magic/condition-save.mjs.
     */
    const escapes = await rollConditionSaves(actor);
    if (escapes.length) {
      await TRGCombat.#postTurnCard(
        actor, END_PHASE_LABEL, escapes.map((said) => TRGCombat.#chatLine(said)));
    }

    const lapsed = await expirePendingModifiers(actor);
    if (lapsed.length) {
      await TRGCombat.#postTurnCard(actor, END_PHASE_LABEL, [
        TRGCombat.#chatLine(`No longer waiting on a roll: ${lapsed.join(", ")}.`)
      ]);
    }

    // FLY (Chapter 4): "If you're airborne at the end of your turn and
    // didn't use a Fly action this round, you fall." The one rule in the
    // Fly entry with a consequence rather than a cost, and the only one
    // a table would ever fail to notice — nothing at the table announces
    // that a token is still at elevation 40 with no Fly action spent.
    //
    // Placed with the other end-of-turn expiries rather than after the
    // bleed arithmetic below, which returns early when there is nothing
    // to bleed for.
    // `context.round`, NOT `this.round`. By the time this runs the combat
    // has already advanced, and at a round boundary `this.round` is the
    // NEW one — so a character who spent their whole turn on the wing was
    // compared against a round they could not possibly have flown in and
    // dropped anyway. Found live on 3.335.0, and nastier than it looks:
    // mid-round the two numbers agree, so with several creatures in the
    // fight only the last in initiative order would have fallen, and the
    // bug would have read as intermittent.
    await resolveTurnEndFall(combatant, context?.round ?? this.round);

    // Moment of Clarity (Chapter 5): "until the end of your turn" —
    // the clarity window closes here, when its owner's turn ends.
    const clarity = Array.from(actor.effects ?? [])
      .filter((e) => e.getFlag?.(SYSTEM_ID, "momentOfClarity"));
    if (clarity.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", clarity.map((e) => e.id));
    }

    // DROWNING AND SUFFOCATION (3.580.0; page 202, Graham's R3): "Reduce
    // your remaining air by 1 round at the end of each of your turns, or
    // by 2 if you attacked or cast any spells that turn", and once it has
    // run out, the Fortitude save at the end of each turn after.
    //
    // THE MAP COUNTER IS THE RECORD OF HAVING ATTACKED. It is cleared at
    // the top of every turn a few hundred lines above and advanced by
    // every attack and attack spell, so a non-zero value at the end of a
    // turn means exactly "attacked or cast this turn" — one fact, kept in
    // one place, rather than a second per-turn marker free to disagree
    // with the first.
    {
      const { advanceDrowningAtTurnEnd } = await import("../drowning-workflow.mjs");
      await advanceDrowningAtTurnEnd(actor, {
        actedViolently: Number(actor.getFlag?.(SYSTEM_ID, "attackCount") ?? 0) > 0
      });
    }

    // ONGOING AFFLICTIONS (3.578.0; page 190, Phase 3, and Graham's R1 of
    // the block-18 audit): "If you have a recurring damage condition or
    // any ongoing afflictions you take damage from them and then may make
    // checks to remove them." A poison whose stage runs in rounds deals
    // its damage and rolls its save here; one measured in minutes keeps
    // its button. Before the bleeds' early return below, which would
    // otherwise skip it for anyone not also bleeding.
    const { advanceAfflictionsAtEndPhase } = await import("../combat/affliction-workflow.mjs");
    await advanceAfflictionsAtEndPhase(actor);

    const lines = [];
    const bleeds = TRGCombat.#conditionEffects(actor, "bleeding");
    const recurrings = TRGCombat.#conditionEffects(actor, "recurring");
    // FRIGHTENED (3.621.0; Appendix 2, block 39's R7): "At the end of each
    // of your turns, you may make a Will Saving Throw against the original
    // DC of the fear effect". Offered here, at the end of the turn, as a card
    // with the save's button — "may", so it is the owner's to press. Before
    // the early return below, which most creatures take.
    if (actor.hasCondition?.("frightened")) {
      try {
        const { offerFrightenedRecovery } = await import("../conditions/condition-events-workflow.mjs");
        await offerFrightenedRecovery(actor);
      } catch (error) {
        console.error("TRG Prime | the Frightened save could not be offered", error);
      }
    }

    if (!bleeds.length && !recurrings.length) return;

    let damage = 0;
    // Battle Hardened (Chapter 5): "reduce all bleed condition values by
    // 1" — a numeric bleedReduction flag lowers EACH bleed entry's value,
    // exactly as the feat says, rather than the summed total once.
    // appliedEffects, not actor.effects: Battle Hardened's flag rides a
    // TRANSFERRED compendium effect (see the fastHealing note above).
    const bleedSources = Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter((e) => !e.disabled && Number(e.getFlag?.(SYSTEM_ID, "bleedReduction") ?? 0) > 0);
    const bleedReduction = bleedSources.reduce(
      (total, e) => total + Math.max(0, Number(e.getFlag(SYSTEM_ID, "bleedReduction"))), 0);
    // Named rather than hardcoded: Battle Hardened was the only source
    // when this was written, and the Sharuk-Dur orc heritage is now
    // another. Crediting the wrong feature is a small lie the card
    // repeats every round.
    const bleedCredit = [...new Set(
      bleedSources.map((e) => e.parent?.documentName === "Item" ? e.parent.name : e.name)
    )].join(", ") || "reduction";
    const bleedTotal = bleeds.reduce(
      (sum, b) => sum + Math.max(0, b.value - bleedReduction), 0);
    // The DAMAGE is reduced; the WOUND is not. Severity bands, and the
    // flat check that ends the condition, read the raw value — otherwise
    // a Sharuk-Dur orc with Bleeding 1 reduces it to 0, falls out of
    // every band, never rolls to remove it, and bleeds "0 damage"
    // forever. Suppressing a wound is not closing it.
    const rawBleedTotal = bleeds.reduce((sum, b) => sum + Math.max(0, b.value), 0);

    // Both of these run through the target's defences now. Recurring
    // Damage has always carried an explicit damage type and never once
    // been checked against immunity, so a creature immune to fire still
    // burned. Bleeding is piercing damage — a creature immune to piercing
    // does not bleed.
    if (bleedTotal) {
      // Graham's ruling (2 Aug 2026): DR never reduces Bleeding — armour
      // does nothing about an open wound. Immunity/resistance still apply.
      const packet = resolveAgainstDefences(actor.system, {
        amount: bleedTotal,
        type: "piercing",
        applyDR: false,
        creatureTypeSystem: ownedCreatureTypeSystem(actor)
      });
      damage += packet.taken;
      const band = bleedingSeverity(rawBleedTotal);
      lines.push(
        TRGCombat.#chatLine(
          packet.immune
            ? `Bleeding: <strong>immune</strong> — no damage.`
            : `Bleeding deals <strong>${packet.taken}</strong> damage (${band?.label ?? "—"})${bleedReduction ? ` — bleed values reduced by ${bleedReduction} (${bleedCredit})` : ""}.`
        )
      );
    } else if (bleeds.length && bleedReduction) {
      lines.push(
        TRGCombat.#chatLine(
          `Bleeding suppressed entirely — bleed values reduced by ${bleedReduction} (${bleedCredit}).`
        )
      );
    }

    for (const entry of recurrings) {
      const typeLabel = DAMAGE_TYPES[entry.damageType]?.label ?? "Fire";
      // Graham's ruling (2 Aug 2026): DR never reduces recurring damage —
      // "if you catch fire, what good is armour."
      const packet = resolveAgainstDefences(actor.system, {
        amount: entry.value,
        type: entry.damageType || "fire",
        applyDR: false,
        creatureTypeSystem: ownedCreatureTypeSystem(actor)
      });
      damage += packet.taken;
      lines.push(
        TRGCombat.#chatLine(
          packet.immune
            ? `Recurring ${typeLabel} damage: <strong>immune</strong> — no damage.`
            : `Recurring ${typeLabel} damage deals <strong>${packet.taken}</strong>.`
        )
      );
    }

    if (damage) {
      const result = await applyDamageAndCheckDying(actor, damage, { isCritical: false });
      if (result.case === "reached-zero") {
        lines.push(
          TRGCombat.#chatLine(
            `<strong>Reduced to 0 HP — Dying ${result.dying}.</strong>`
          )
        );
      } else if (result.case === "worsened-while-dying") {
        lines.push(
          TRGCombat.#chatLine(
            `<strong>Already Dying — Dying rises to ${result.dying} instead of losing further HP.</strong>`
          )
        );
      } else if (result.case === "died-while-dying") {
        lines.push(
          TRGCombat.#chatLine(
            `Dying rises to ${result.dying}, exceeding Death State ${result.deathState}. <strong>The character has died.</strong>`
          )
        );
      } else if (result.case === "massive-damage-death") {
        lines.push(
          TRGCombat.#chatLine(
            `<strong>Massive Damage — the character dies instantly.</strong>`
          )
        );
      }
    }

    // Flat checks to end. Recurring: always DC 16 per source. Bleeding: only
    // the Light band self-removes (Appendix 2, as ruled).
    //
    // EACH CHECK NAMES ITS OWN PHASE (3.373.0). `TRGCheck.roll` posts its
    // card the moment it resolves, and the Phase 3 summary card is posted
    // at the very end of this method — so every flat check lands in the log
    // ABOVE the card that explains it, and directly below whatever came
    // before. Across a turn boundary that neighbour is the next
    // combatant's Phase 1 card, which is exactly how Graham read this as
    // "the check to remove recurring damage is happening in Phase 1"
    // (reported 23 Aug 2026). The check was always in Phase 3; only its
    // card said nothing about where it belonged. Reordering the posts
    // would mean building the summary before its own results exist, so
    // the cheaper and more honest fix is to let each card identify itself.
    // THE SAME LEVER BLEEDING HAS (page 193; the block-19 audit's D18,
    // Graham's R18 of 21 September 2026). "The GM may rule that an action
    // taken against it — smothering flames, washing off acid — ends it
    // automatically or lowers the flat check DC." Bleeding's reduction
    // has been readable since Sharuk-Dur; recurring damage had only a
    // sentence in a dialog. Read the same way, from an effect flag, so a
    // GM (or a feat, or an item) lowers it by the same mechanism.
    const recurringEasier = Array.from(actor.appliedEffects ?? actor.effects ?? [])
      .filter((e) => !e.disabled)
      .reduce((total, e) => total
        + Math.max(0, Number(e.getFlag?.(SYSTEM_ID, "recurringFlatCheckReduction") ?? 0)), 0);
    const recurringDC = Math.max(1, RECURRING_FLAT_CHECK_DC - recurringEasier);
    for (const entry of recurrings) {
      const check = await TRGCheck.roll({
        actor,
        label: "Recurring Damage — Flat Check",
        subtitle: recurringEasier
          ? `${END_PHASE_LABEL} · DC ${recurringDC} (reduced by ${recurringEasier})`
          : END_PHASE_LABEL,
        type: "flat",
        flat: true,
        dc: recurringDC
      });
      if (check.outcome?.degree?.success) {
        await entry.effect.delete();
        lines.push(TRGCombat.#chatLine("The recurring damage <strong>ends</strong>."));
      }
    }

    if (rawBleedTotal && bleedingSeverity(rawBleedTotal)?.selfRemovable) {
      // Sharuk-Dur (Chapter 2): "the flat check to remove bleeding is 2
      // less". A LOWER DC is easier on a flat check, so the reduction is
      // subtracted; floored at 1, since a DC 0 flat check is not a check.
      const easier = Array.from(actor.appliedEffects ?? actor.effects ?? [])
        .filter((e) => !e.disabled)
        .reduce((total, e) => total + Math.max(0, Number(e.getFlag?.(SYSTEM_ID, "bleedFlatCheckReduction") ?? 0)), 0);
      const bleedDC = Math.max(1, BLEEDING_FLAT_CHECK_DC - easier);
      const check = await TRGCheck.roll({
        actor,
        label: "Bleeding — Flat Check",
        // Same reason as the recurring check above; the reduction note is
        // kept alongside the phase rather than replacing it.
        subtitle: easier
          ? `${END_PHASE_LABEL} · DC ${bleedDC} (reduced by ${easier})`
          : END_PHASE_LABEL,
        type: "flat",
        flat: true,
        dc: bleedDC
      });
      if (check.outcome?.degree?.success) {
        for (const entry of bleeds) await entry.effect.delete();
        lines.push(TRGCombat.#chatLine("The bleeding <strong>stops</strong>."));
      }
    } else if (rawBleedTotal) {
      lines.push(
        TRGCombat.#chatLine(
          "Bleeding above the Light band needs Medicine or magic to stop."
        )
      );
    }

    await TRGCombat.#postTurnCard(actor, END_PHASE_LABEL, lines);
  }

  /** Adapt a Combatant into the plain shape the comparator expects. */
  static #toEntry(combatant) {
    const attributes = combatant?.actor?.system?.attributes;
    return {
      initiative: combatant?.initiative ?? null,
      wisdom: attributes?.wisdom?.total ?? 0,
      dexterity: attributes?.dexterity?.total ?? 0,
      tiebreak: combatant?.getFlag?.(SYSTEM_ID, "tiebreak") ?? 0,
      id: combatant?.id ?? ""
    };
  }
}
