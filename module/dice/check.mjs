import { withCheckModifiers } from "./check-modifiers.mjs";
import {
  CHAIN_PROFILES,
  OPEN_ENDED,
  rollChain,
  rollPercentile
} from "./open-ended.mjs";
import { checkAbilities } from "./check-abilities.mjs";
import {
  BONUS_TYPES,
  DEGREES,
  DIFFICULTY_BY_KEY,
  buildOutcome,
  levelDC,
  stepDifficultyHarder
} from "./resolution.mjs";
import { bannerDisplay } from "../combat/action-degrees.mjs";
import { applyDegreeShift, degreeShiftLine } from "./degree-shift.mjs";
import {
  autoFailLine, autoFailedOutcome, conditionLabel, hasCondition, perceptionBySense, reflexAutoFail, senseFumbleOutcome
} from "../conditions/condition-rules.mjs";
import {
  CONVICTION_SPENDS,
  awardConviction,
  getConvictionState,
  luckOfHeroes,
  markConvictionSpent,
  spendConvictionAdvantage
} from "../conviction.mjs";
import { roguishSkillPicks, scoundrelsLuckBonus, scoundrelsLuckRefund } from "../rogue.mjs";
import { luckFumbleChoice } from "../luck.mjs";

const SYSTEM_ID = "trg-prime";
const CARD_TEMPLATE = "systems/trg-prime/templates/chat/check-card.hbs";

/** Roll bias options. */
export const BIAS = Object.freeze({
  NORMAL: "normal",
  ADVANTAGE: "advantage",
  DISADVANTAGE: "disadvantage"
});

function renderTemplateCompat(path, data) {
  const handlebars = foundry.applications?.handlebars;
  if (handlebars?.renderTemplate) return handlebars.renderTemplate(path, data);
  return renderTemplate(path, data);
}

function setting(key, fallback) {
  try {
    return game.settings.get(SYSTEM_ID, key);
  } catch {
    return fallback;
  }
}

/**
 * Apply a chat visibility mode WITHOUT ever costing the card.
 *
 * `ChatMessage.applyMode` throws on a mode it does not recognise, and it
 * is called after the dice have already been rolled — so an unknown mode
 * does not degrade the card's visibility, it destroys the card outright.
 * The roll happens, the player watches the dialog close, and nothing
 * reaches chat.
 *
 * THAT IS NOT HYPOTHETICAL. Foundry v14 renamed its chat modes, and
 * `secretRollMode` still returned the legacy "blindroll". Every Secret
 * action — Identify Power, Gather Information, Create a Forgery, Decipher
 * Writing, Discern Secret Message, Conceal an Object, Sense Direction,
 * and both Hide and Sneak — rolled and posted nothing, silently, for as
 * long as this world has been on v14. Found live on 16 Aug 2026 only
 * because an audit happened to roll one of them and went looking in the
 * console for a card that never arrived.
 *
 * `traits.mjs` now names the mode correctly, which is the actual fix.
 * This is the insurance: the NEXT rename should cost a wrong visibility
 * and a console warning, which is visible and recoverable, rather than a
 * vanished result nobody can tell apart from "I forgot to press Roll".
 *
 * @param {object} data Message data, mutated in place as applyMode does.
 * @param {string} mode
 */
export function applyMessageMode(data, mode) {
  try {
    ChatMessage.applyMode(data, mode);
    return;
  } catch (err) {
    const known = Object.keys(globalThis.CONFIG?.ChatMessage?.modes ?? {});
    console.warn(
      `TRG Prime | chat mode "${mode}" was rejected by this Foundry version` +
      `${known.length ? ` (it accepts: ${known.join(", ")})` : ""}. ` +
      "Posting the card publicly rather than losing it.",
      err
    );
  }
  // Second chance at the world default before giving up on a mode
  // entirely — a bad EXPLICIT mode should not override the GM's setting.
  try {
    ChatMessage.applyMode(data, game.settings.get("core", "messageMode"));
  } catch {
    // Leave `data` as it is: unmodified message data posts publicly, which
    // is the one outcome that cannot lose the result.
  }
}

const sign = (value) => (value >= 0 ? `+${value}` : String(value));

/**
 * The outcome-derived half of the card's data: everything that depends on
 * modifiers/DC/degree, as opposed to the dice-chain visual (which never
 * changes once rolled). Exported standalone so the chat-card interaction
 * handlers (Bonus die, GM setting a DC after the fact) can recompute this
 * half in isolation, without needing the original TRGCheck instance —
 * which is long gone by the time someone clicks a button on the card.
 *
 * @param {object} outcome The result of buildOutcome().
 * @param {object} [options]
 * @param {boolean} [options.suppressDegree] Never show a degree banner
 *   (initiative and similar checks with no meaningful DC at all).
 * @param {boolean} [options.bonusCheck] Show the Bonus Check Table line.
 */
export function buildOutcomeDisplay(
  outcome, { suppressDegree = false, bonusCheck = false, declaredOutcomes = [] } = {}
) {
  const banner = bannerDisplay(declaredOutcomes, outcome.degree?.key ?? null, DEGREES);
  return {
    // THE BANNER NAMES A RESULT THE ACTION HAS (3.508.0). The DEGREE is
    // untouched — `outcome.degree` still carries what the dice produced,
    // and every rule that reads it (Chaos, the Bonus Check Table,
    // Shadowborn Agility) reads the real one. See combat/action-degrees.
    //
    // BOTH THE KEY AND THE LABEL (3.508.1). The first version supplied
    // only the key, which the template uses for the CSS class — so the
    // card was coloured by the collapsed degree while the word above it
    // still came from `outcome.degree.label`. Found live.
    degreeKey: banner.key ?? "none",
    degreeLabel: banner.label,
    outcome,
    modifiers: outcome.modifiers.map((modifier) => ({
      ...modifier,
      display: sign(modifier.value),
      typeLabel: BONUS_TYPES[modifier.type]?.label ?? modifier.type
    })),
    modifierTotalDisplay: sign(outcome.modifierTotal),
    showDC: outcome.dc !== null,
    showDegree: !suppressDegree,
    showBonusCheck: bonusCheck && outcome.degree !== null,
    bonusCheckDisplay: outcome.bonusCheck === null ? "" : sign(outcome.bonusCheck),
    // A DECLARED SUCCESS HAS NO MARGIN (3.630.1, F2 of the 3.630.0 live
    // test): Prism Lotus's Success read "Fails DC by 6" under the word.
    marginText:
      outcome.declared
        ? "Declared — the dice do not count"
        : outcome.margin === null
        ? ""
        : outcome.margin >= 0
          ? `Exceeds DC by ${outcome.margin}`
          : `Fails DC by ${Math.abs(outcome.margin)}`
  };
}

/**
 * A single TRG Prime check.
 *
 * Every d20 resolution in the system funnels through this class: skills,
 * attributes, saving throws, Spellcraft, flat checks and bonus checks. Attack
 * rolls will layer on top of it once the combat module lands, which is why the
 * unmodified faces of each die are preserved on the result.
 */
export class TRGCheck {
  constructor(config = {}) {
    this.actor = config.actor ?? null;
    this.label = config.label ?? "Check";
    this.subtitle = config.subtitle ?? "";
    this.type = config.type ?? "generic";
    this.die = config.die === "d100" ? "d100" : "d20";
    this.bias = Object.values(BIAS).includes(config.bias)
      ? config.bias
      : BIAS.NORMAL;
    this.flat = Boolean(config.flat);
    // THE ACTION'S HELD-OVER OUTCOME, handed in by the caller BEFORE the
    // roll — because `toMessage` writes the card's flag during the roll,
    // and anything assigned to the check afterwards is already too late.
    // See combat/action-workflow.mjs.
    this.pendingOutcome = config.pendingOutcome ?? null;
    // Initiative and similar rolls have no DC, so the degree banner is noise.
    this.suppressDegree = Boolean(config.suppressDegree);
    // Compact mode (weapon Attack rolls): the card shows only a short
    // result summary, with the full dice/modifier breakdown tucked
    // behind a hover icon rather than always visible. compactSummary is
    // typically set after the fact, once the outcome (hit/miss/critical)
    // is known — see rollWeaponAttack.
    this.compact = Boolean(config.compact);
    this.compactSummary = config.compactSummary ?? "";
    this.extraDetailLines = config.extraDetailLines ?? [];
    this.allowConviction = config.allowConviction !== false;
    // ONE ROLL, MANY DEFENCES (3.649.0; F&F 3.0 block 16 R5). Lightning
    // Strike "makes a single melee strike, comparing the result to the DB of
    // all creatures within range": the first creature's check rolls the die,
    // and each further one is handed that same die (`presetDice`) to meet its
    // own DB with. Nothing is rolled again, so nothing can differ.
    this.presetDice = config.presetDice ?? null;
    // AND ITS CONVICTION DIE (3.669.1): the first creature's +1d6, if spent,
    // met again here; a later creature is never asked for its own.
    this.presetConvictionDie = Math.max(0, Math.trunc(Number(config.presetConvictionDie) || 0));
    // A DEGREE SET WITHOUT THE NEED FOR A ROLL (3.669.2): a day's first
    // declared `exact` (Tianzhi Discipline). See `roll`.
    this.declaredDegree = config.declaredDegree ? String(config.declaredDegree) : "";
    this.convictionAdvantage = Boolean(config.convictionAdvantage);
    // LUCK ASKED FOR IN THE DIALOG (3.624.0, block 40's R11). Luck armed
    // from the sheet is read off the actor instead; see applyLuckToCheck.
    this.useLuck = Boolean(config.useLuck);
    this.bonusCheck = Boolean(config.bonusCheck);

    // Context for permanent-but-scoped racial and feature bonuses
    // (module/conditionals.mjs). `traits` are those of whatever PROVOKED
    // the check — an affliction's Poison, a spell's Sleep — which is what
    // lets "+2 against poison" resolve itself instead of asking.
    // `conditionalsResolved` is set by the configuration dialog, which
    // has already offered every matching entry; without it the automatic
    // ones would be applied a second time here.
    this.subject = config.subject ?? "";
    this.actionKey = config.actionKey ?? "";
    // THE ABILITIES THIS CHECK IS BASED ON (3.613.0, R1 of block 35):
    // Physical Boost reaches "any check affected by the ability score".
    // Worked out now, from the roller's own data, and carried on the card.
    this.abilities = checkAbilities({ type: this.type, subject: this.subject, abilities: config.abilities },
      this.actor?.system ?? null);
    // THE DEGREES THIS ACTION DECLARES TEXT FOR (3.508.0). Graham's
    // ruling: "the card banner should only show available results" — so
    // the banner names the nearest degree the action actually has, and
    // the list travels with the card because the card is re-rendered
    // from a flag long after the action object is gone.
    this.declaredOutcomes = Array.isArray(config.declaredOutcomes) ? config.declaredOutcomes : [];
    this.traits = config.traits ?? "";
    // `traditions` is the same idea for magic's own vocabulary — the
    // tradition of the spell that forced this save. Kept separate from
    // `traits` deliberately: 3.315.0 spent a release on what happens when
    // two different kinds of label share one field. A caller that doesn't
    // know the source leaves it blank, and a tradition-scoped conditional
    // then stays a question rather than becoming a wrong answer.
    this.traditions = config.traditions ?? "";
    // The CREATURE TYPE of whoever provoked this check — the undead
    // swinging the sword. Only a workflow holding both actors can fill
    // it; a sheet roll leaves it blank and type-scoped entries then stay
    // unasked rather than becoming a wrong answer, exactly as traditions
    // does.
    this.sourceTypes = config.sourceTypes ?? "";
    // THE CREATURE TYPE OF WHOEVER THIS CHECK IS AIMED AT (3.567.0) —
    // the Wyrm being talked to, rather than the undead swinging at you.
    // Mirror of the line above and filled by the same kind of caller;
    // blank on a roll with no target, at which point Dracoris's "+1 to
    // all interactions with creatures of the Wyrm type" correctly stays
    // out of a conversation with a farmer.
    this.targetTypes = config.targetTypes ?? "";
    // THE SPECIFIC CREATURE that provoked this check, by uuid (3.406.0).
    // Same contract as sourceTypes: only a workflow holding both actors
    // can fill it, and a sheet roll leaves it blank — at which point a
    // ward scoped to one creature correctly matches nothing rather than
    // guessing.
    this.sourceUuid = config.sourceUuid ?? "";
    // THE SPECIFIC CREATURE THIS ROLL IS AIMED AT (3.415.0). Mirror of
    // `sourceUuid` and filled by the same kind of caller — only a
    // workflow holding both actors can know it, and a sheet roll leaves
    // it blank, at which point a target-scoped entry matches nothing.
    this.targetUuid = config.targetUuid ?? "";
    // MELEE OR RANGED (3.650.0) — an attack check's, for the conditionals.
    this.attackMode = config.attackMode ?? "";
    // THE TARGET'S CREATURE TRAITS (3.664.0) — Spirit Stance's "against
    // spirits and incorporeal creatures". Filled beside `targetTypes`.
    this.targetTraits = config.targetTraits ?? "";
    // WHAT A WEAPON ATTACK IS STRUCK WITH (3.667.3): "unarmed", "natural"
    // or "weapon". See conditionals.mjs's `attackForms` axis.
    this.attackForm = config.attackForm ?? "";
    // THE WEAPON'S GROUP (3.668.0), for conditionals' `attackGroups` axis.
    this.attackGroup = config.attackGroup ?? "";
    // HOW FAR IT REACHES (3.668.0), for the `rangeBands` axis.
    this.rangeBand = config.rangeBand ?? "";
    // THE TARGET'S STATE AGAINST THIS ATTACKER (3.668.0): flatfooted,
    // isolated, duel. See conditionals.mjs's `targetStates` axis.
    this.targetStates = config.targetStates ?? "";
    // TICK-BOXES ON A ROLL WITH NO DIALOG (3.667.3): asked unless the roller
    // skipped the questions (Shift). A roll made again carries the first
    // roll's answer in `conditionalChoices` and is not asked twice.
    this.offerConditionals = config.offerConditionals !== false;
    this.conditionalChoices = Array.isArray(config.conditionalChoices) ? [...config.conditionalChoices] : null;
    this.conditionalsResolved = Boolean(config.conditionalsResolved);

    // THE SAVE-ADVANTAGE FAMILY (Chapter 5): Evasion, Juggernaut and
    // Resolve trigger on "you attempt a [reflex/fortitude/will] save,
    // BEFORE YOU ROLL", so the offer has to happen here, in the one place
    // that knows a save is about to be thrown and has not thrown it yet.
    //
    // `isArea` is the one fact the check cannot work out for itself — only
    // the workflow that forced the save knows whether it came from a
    // template — so a caller that knows passes it and a caller that does
    // not leaves the narrow reading in place.
    //
    // `saveSource` names what forces the save in the prompt, since `label`
    // is often written from the roller's side ("Falling — Injury Save").
    //
    // `saveReactionResolved` is the guard a RE-ROLL sets: Unbreakable
    // Resolve throws the same save again from its own card, and offering
    // the reaction a second time would let one trigger be answered twice.
    this.isArea = Boolean(config.isArea);
    this.saveSource = config.saveSource ?? "";
    this.saveReactionResolved = Boolean(config.saveReactionResolved);
    // A NAMED DEGREE SHIFT (3.612.0, R4) — Fateful Temptation's. Carried in
    // the card flags so a rebuilt outcome keeps it. See dice/degree-shift.mjs.
    this.degreeShift = String(config.degreeShift ?? "");
    this.rollMode = config.rollMode ?? game.settings.get("core", "messageMode");

    // A flat check "never includes any modifiers, bonuses, or penalties".
    this.modifiers = this.flat ? [] : [...(config.modifiers ?? [])];
    // ANOTHER CHECK'S WHOLE RESULT, MET AGAIN (3.670.0; Inner Tempest's
    // Drunken Strike, B6-3: "your attack total stands as your Feint check").
    // With `presetDice`, the other check's modifiers replace this one's, so
    // the total is that check's exactly; nothing else is added to it (no
    // tick-box, no waiting bonus, no conviction: they were the other roll's).
    this.presetModifiers = Array.isArray(config.presetModifiers) && config.presetDice;
    if (this.presetModifiers) {
      this.modifiers = config.presetModifiers.map((m) => ({ ...m }));
      this.conditionalsResolved = true;
      this.allowConviction = false;
    }

    this.difficulty = config.difficulty ?? "medium";
    this.baseDC = config.dc ?? null;

    this.openEnded = this.#resolveOpenEnded(config.openEnded);

    /** @type {Roll[]} Foundry Roll objects, retained for Dice So Nice. */
    this.rolls = [];
    /** @type {object|null} Populated by evaluate(). */
    this.outcome = null;
    /** @type {object|null} Detail of the die chain(s) actually used. */
    this.dice = null;
  }

  /**
   * Flat checks compare the die face directly to the DC, so they are never
   * open-ended. Otherwise the caller may override the world setting.
   */
  #resolveOpenEnded(requested) {
    if (this.flat) return OPEN_ENDED.NONE;
    if (requested) return requested;
    return setting("openEndedChecks", OPEN_ENDED.BOTH);
  }

  /** The DC after the difficulty modifier is applied. */
  get dc() {
    if (this.baseDC === null || this.baseDC === undefined) return null;
    const difficulty = DIFFICULTY_BY_KEY[this.difficulty];
    return Number(this.baseDC) + Number(difficulty?.modifier ?? 0);
  }

  /** Roll a single die through Foundry so Dice So Nice and the log see it. */
  async #drawDie(faces) {
    const roll = await new Roll(`1d${faces}`).evaluate();
    this.rolls.push(roll);
    return roll.total;
  }

  /** Draw a 0-9 digit from a d10. */
  async #drawDigit() {
    const raw = await this.#drawDie(10);
    return raw % 10;
  }

  async #rollD20() {
    // A SEER'S VISION REPLACES THE FIRST FACE, and nothing else. Every
    // later draw in an open-ended chain is the real die again, so the
    // recorded number behaves exactly as though rolled — which is the
    // ruling, expressed as one substitution rather than three rules
    // re-decided. See magic/seers-vision.mjs.
    //
    // WITH ADVANTAGE OR DISADVANTAGE the forced face lands on the FIRST
    // chain only, and the second is a real roll. "Instead of rolling"
    // replaces one roll, and which of two it replaces is a question the
    // printed sentence does not reach; flagged rather than decided
    // silently.
    const draw = this._visionDraw ?? (() => this.#drawDie(20));
    const profile = CHAIN_PROFILES.d20;

    const chains = [await rollChain({ draw, profile, openEnded: this.openEnded })];

    if (this.bias !== BIAS.NORMAL || this.luckFumble) {
      chains.push(await rollChain({ draw, profile, openEnded: this.openEnded }));
    }

    let chosen = chains[0];
    if (this.luckFumble) {
      // A FUMBLED LUCK CHECK (3.624.0, R11): "disadvantage or a -5 penalty
      // (whichever is worse)", decided on these two dice. A reroll draws
      // again, so the penalty line is replaced rather than added twice.
      const pick = luckFumbleChoice({ bias: this.bias, totals: chains.map((c) => c.total) });
      chosen = chains[pick.index];
      this.modifiers = this.modifiers.filter((m) => !m.luckFumble);
      this.modifiers.push({ label: pick.label, value: pick.penalty, type: "untyped", luckFumble: true });
    } else if (this.bias === BIAS.ADVANTAGE) {
      chosen = chains.reduce((a, b) => (b.total > a.total ? b : a));
    } else if (this.bias === BIAS.DISADVANTAGE) {
      chosen = chains.reduce((a, b) => (b.total < a.total ? b : a));
    }

    return {
      kind: "d20",
      chains,
      chosen,
      total: chosen.total,
      chaos: chosen.chaos,
      unmodified: chosen.faces[0]
    };
  }

  async #rollD100() {
    const percentile = await rollPercentile({
      drawTen: () => this.#drawDigit(),
      drawUnit: () => this.#drawDigit(),
      bias: this.bias
    });

    // The percentile value seeds an open-ended chain of its own.
    const profile = CHAIN_PROFILES.d100;
    let queued = percentile.value;
    const draw = async () => {
      if (queued !== null) {
        const value = queued;
        queued = null;
        return value;
      }
      return this.#drawDie(100);
    };

    const chain = await rollChain({ draw, profile, openEnded: this.openEnded });

    return {
      kind: "d100",
      percentile,
      chains: [chain],
      chosen: chain,
      total: chain.total,
      chaos: chain.chaos,
      unmodified: percentile.value
    };
  }

  /**
   * Roll the dice and resolve the outcome.
   * @returns {Promise<TRGCheck>}
   */
  /**
   * Spend any Cutting Words penalty this check's actor is carrying.
   *
   * DYNAMICALLY IMPORTED so `dice/` keeps no static dependency on
   * `magic/` — the layering every other cross-cutting rule in this file
   * follows.
   */
  async #takeCuttingWords() {
    // Not on another check's result met again (3.670.0, found in review):
    // its total is that check's, and nothing waiting is spent on it.
    if (!this.actor || this.presetModifiers) return;
    try {
      const { cuttingWordsConsumes, pendingCuttingWordsModifier } =
        await import("../magic/cutting-words.mjs");
      const { pendingCuttingWords, consumeCuttingWords } =
        await import("../magic/cutting-words-workflow.mjs");
      const pending = pendingCuttingWords(this.actor);
      if (!cuttingWordsConsumes(this.type, pending)) return;
      const modifier = pendingCuttingWordsModifier(pending);
      if (!modifier) return;
      this.modifiers.push(modifier);
      // SPENT EVEN IF A LARGER CIRCUMSTANCE PENALTY WINS THE POOL — the
      // spell was cast at one announced action and that action has now
      // happened. See consumeCuttingWords.
      await consumeCuttingWords(this.actor);
    } catch (error) {
      // A roll must never be lost to this. See consumeCuttingWords.
      console.error("TRG Prime | Cutting Words could not be applied to this check", error);
    }
  }

  /**
   * A waiting COUNTER PERFORM bonus, taken the same way and for the same
   * reasons as the penalty above — see magic/counter-perform.mjs. The two
   * spells are one mechanism pointed at different people, so they are
   * spent side by side rather than in two unrelated places.
   *
   * SEPARATE FROM `#takeCuttingWords` rather than folded into it: they
   * name different check types, carry different bonus types, and a single
   * function reading two flags would be the "two places deciding one
   * question" shape inverted — one place deciding two.
   */
  async #takeCounterPerform() {
    // Not on another check's result met again (3.670.0, found in review):
    // its total is that check's, and nothing waiting is spent on it.
    if (!this.actor || this.presetModifiers) return;
    try {
      const { counterPerformConsumes, pendingCounterPerformModifier } =
        await import("../magic/counter-perform.mjs");
      const { pendingCounterPerform, consumeCounterPerform } =
        await import("../magic/counter-perform-workflow.mjs");
      const pending = pendingCounterPerform(this.actor);
      if (!counterPerformConsumes(this.type, pending)) return;
      const modifier = pendingCounterPerformModifier(pending);
      if (!modifier) return;
      this.modifiers.push(modifier);
      // SPENT EVEN IF A LARGER STATUS BONUS WINS THE POOL — the spell was
      // cast at one announced save and that save has now happened.
      await consumeCounterPerform(this.actor);
    } catch (error) {
      // A roll must never be lost to this.
      console.error("TRG Prime | Counter Perform could not be applied to this check", error);
    }
  }

  /**
   * A waiting INSPIRE COMPETENCE bonus — the third spell to use this
   * road, and the first to reach SKILL checks.
   *
   * ITS OWN METHOD, for the reason `#takeCounterPerform` gives about
   * being separate from `#takeCuttingWords`: the three name different
   * check types and carry different bonus types, and one function
   * reading three flags would be one place deciding three questions.
   */
  async #takeInspireCompetence() {
    // Not on another check's result met again (3.670.0, found in review):
    // its total is that check's, and nothing waiting is spent on it.
    if (!this.actor || this.presetModifiers) return;
    try {
      const { inspireCompetenceConsumes, pendingInspireCompetenceModifier } =
        await import("../magic/inspire-competence.mjs");
      const { pendingInspireCompetence, consumeInspireCompetence } =
        await import("../magic/inspire-competence-workflow.mjs");
      const pending = pendingInspireCompetence(this.actor);
      if (!inspireCompetenceConsumes(this.type, pending)) return;
      const modifier = pendingInspireCompetenceModifier(pending);
      if (!modifier) return;
      this.modifiers.push(modifier);
      // SPENT EVEN IF A LARGER CIRCUMSTANCE BONUS WINS THE POOL — the
      // encouragement was spent on the check it was spent on.
      await consumeInspireCompetence(this.actor);
    } catch (error) {
      // A roll must never be lost to this.
      console.error("TRG Prime | Inspire Competence could not be applied to this check", error);
    }
  }

  /**
   * A SEER'S VISION, and the only hook on this road that replaces the
   * die rather than modifying the roll.
   *
   * "Use the recorded number INSTEAD OF ROLLING" — Graham's ruling of
   * 31 August 2026 is that it then behaves exactly as though rolled,
   * criticals and open-ended chains included. So this does not compute a
   * total: it forces the FIRST DIE FACE and lets `rollChain` do the
   * rest, which is why a recorded 20 explodes without this method
   * knowing that 20 explodes.
   *
   * OFFERED, NOT TAKEN. The other three spells apply themselves; a
   * recorded 4 is worse than most rolls, so this one asks. Declining
   * leaves the vision intact — only USING it ends the spell.
   */
  async #takeSeersVision() {
    // Not on another check's result met again (3.670.0, found in review):
    // its total is that check's, and nothing waiting is spent on it.
    if (!this.actor || this.presetModifiers) return;
    // ONE CHANCE EFFECT A ROLL (3.622.0) — see `chanceUsed`.
    if (this.chanceUsed) return;
    try {
      const { seersVisionConsumes, visionDraw, visionName } = await import("../magic/seers-vision.mjs");
      const { pendingSeersVision, promptSeersVision, consumeSeersVision } =
        await import("../magic/seers-vision-workflow.mjs");
      // THE CHECK IS PASSED IN (3.589.0): a creature may carry a Seer's
      // Vision and an Embrace Destiny at once, and only one of them can
      // be spent on an attack roll. The selection is the rule's, not
      // this method's — see applicableRecordedRoll.
      const pending = pendingSeersVision(this.actor, this.type, this.rollMode);
      if (!seersVisionConsumes(this.type, this.rollMode, pending)) return;
      if (!(await promptSeersVision(pending, this.label))) return;
      // THE DRAW IS BUILT HERE so the closure can capture the private
      // `#drawDie` — dice/ keeps no static dependency on magic/, and the
      // rule file never learns what a Foundry Roll is.
      this._visionDraw = visionDraw(pending.value, () => this.#drawDie(20));
      this._visionSpent = {
        value: pending.value,
        casterName: pending.casterName ?? "",
        name: visionName(pending)
      };
      // ENDED BY BEING USED, which is the spell's own wording — and only
      // the spell that was spent, so a second recorded number survives.
      await consumeSeersVision(this.actor, pending.source ?? "");
      this.chanceUsed = "Seer's Vision";
    } catch (error) {
      // A roll must never be lost to this.
      console.error("TRG Prime | Seer's Vision could not be applied to this check", error);
    }
  }

  /**
   * The card must describe the outcome it actually has — the Grapple
   * lesson. A check whose die was REPLACED and did not say so would be
   * the sharpest example of that failure this project has met.
   */
  #subtitleWithVision() {
    if (!this._visionSpent) return this.subtitle;
    const who = String(this._visionSpent.casterName ?? "").trim();
    const said = `${this._visionSpent.name}${who ? ` (${who})` : ""} — the foreseen ${this._visionSpent.value} replaced the die`;
    return this.subtitle ? `${this.subtitle} — ${said}` : said;
  }

  async evaluate() {
    // A WAITING CUTTING WORDS PENALTY IS TAKEN HERE (3.432.0).
    //
    // Graham's ruling, 28 August 2026: the Bard casts at an ANNOUNCED
    // action, so when the spell resolves there is no card to modify — the
    // penalty waits on the target and is spent by the next roll the
    // spell's printed trigger names. `evaluate` is the one place every
    // check in this system passes through, which is why it is asked here
    // rather than in the attack workflow and again in the skill one.
    //
    // BEFORE THE OUTCOME IS BUILT, not after. `buildOutcome` reads
    // `this.modifiers`, so a modifier pushed afterwards would print on
    // the card and change no degree — the shape of defect this project
    // has met in `pendingOutcome` and in the spell-attack bonus already.
    await this.#takeCuttingWords();
    // AND A WAITING COUNTER PERFORM BONUS (3.443.0), for the same reason
    // and in the same window: before `buildOutcome` reads `this.modifiers`,
    // so it can change a degree rather than merely print on the card.
    await this.#takeCounterPerform();
    await this.#takeInspireCompetence();
    await this.#takeSeersVision();

    this.dice = this.presetDice
      ? this.presetDice
      : this.die === "d100" ? await this.#rollD100() : await this.#rollD20();

    const difficulty = DIFFICULTY_BY_KEY[this.difficulty];
    const chaosEnabled = setting("chaosResults", false);

    this._outcomeArgs = {
      chaos: chaosEnabled && this.dice.chaos,
      auto: difficulty?.auto ?? null
    };

    this.outcome = this.#conditionForced(applyDegreeShift(buildOutcome({
      dieTotal: this.dice.total,
      modifiers: this.modifiers,
      dc: this.dc,
      ...this._outcomeArgs
    }), this.degreeShift));

    return this;
  }

  /**
   * WHAT A CONDITION DECIDES WHATEVER THE DICE SAY (3.621.0; Appendix 2,
   * block 39's R7). Immobilised fails every Reflex save by 20 and Paralyzed
   * by 25; Blinded or Deafened fumbles a Perception check that needs the lost
   * sense (`senseFumble`, set in `roll`). Applied after any degree shift — a
   * forced failure is not something a reaction moves — and once per check,
   * so a reroll says it once.
   */
  #conditionForced(outcome) {
    if (!outcome?.degree || this.flat) return outcome;
    if (this.type === "save" && String(this.subject ?? "").toLowerCase() === "reflex" && this.actor) {
      const forced = reflexAutoFail(this.actor.conditions?.effective);
      if (forced) {
        this.#sayOnce(autoFailLine(forced));
        return autoFailedOutcome(outcome, forced);
      }
    }
    if (this.senseFumble) {
      this.#sayOnce(`${conditionLabel(this.senseFumble)}: a Perception check that needs the lost sense automatically fumbles.`);
      return senseFumbleOutcome(outcome, this.senseFumble);
    }
    return outcome;
  }

  #sayOnce(text) {
    if ((this.extraDetailLines ?? []).includes(text)) return;
    this.extraDetailLines = [...(this.extraDetailLines ?? []), text];
  }

  /**
   * THE SAME SAVE THROWN AGAIN, in place (3.612.0, R4 — Lucky Break: "reroll
   * the failed saving throw"). Fresh dice under the same modifiers, bias and
   * DC; the first result is kept for the card. Not `evaluate()` again: that
   * also spends the waiting bonuses (Cutting Words, Counter Perform, a Seer's
   * Vision), which were spent once on the throw being replaced.
   */
  async reroll() {
    this.firstOutcome = this.outcome;
    this._visionDraw = null;
    this.dice = this.die === "d100" ? await this.#rollD100() : await this.#rollD20();
    this._outcomeArgs = {
      ...(this._outcomeArgs ?? {}),
      chaos: setting("chaosResults", false) && this.dice.chaos
    };
    this.outcome = this.#conditionForced(applyDegreeShift(buildOutcome({
      dieTotal: this.dice.total,
      modifiers: this.modifiers,
      dc: this.dc,
      ...this._outcomeArgs
    }), this.degreeShift));
    return this;
  }

  /**
   * Add a modifier after evaluation (the Conviction +1d6 Bonus arrives
   * between the roll and the reveal) and rebuild the outcome.
   */
  applyExtraModifier(modifier) {
    this.modifiers.push(modifier);
    // A CONDITION'S FORCED RESULT SURVIVES A LATE MODIFIER (3.645.0). An
    // Immobilised Reflex save that a Conviction die is added to still fails.
    this.outcome = this.#conditionForced(applyDegreeShift(buildOutcome({
      dieTotal: this.dice.total,
      modifiers: this.modifiers,
      dc: this.dc,
      ...(this._outcomeArgs ?? {})
    }), this.degreeShift));
    return this.outcome;
  }

  /** Whether +6, the most a Conviction die can add, would change the degree. */
  convictionCouldMove() {
    if (!this.outcome?.degree?.key) return false;
    const best = this.#conditionForced(applyDegreeShift(buildOutcome({
      dieTotal: this.dice.total,
      modifiers: [...this.modifiers, { label: "probe", value: 6, type: "untyped" }],
      dc: this.dc,
      ...(this._outcomeArgs ?? {})
    }), this.degreeShift));
    return best?.degree?.key !== this.outcome.degree.key;
  }

  /**
   * The dice-chain visual (chains, percentile, exploded, bias) — computed
   * once at roll time and unchanged by anything that happens afterward on
   * the card.
   */
  #buildDiceDisplay() {
    const chains = (this.dice?.chains ?? []).map((chain) => ({
      total: chain.total,
      chosen: chain === this.dice.chosen,
      faces: chain.faces.map((face, index) => ({
        face,
        operator: index === 0 ? null : chain.direction > 0 ? "+" : "\u2212"
      }))
    }));

    // TWO DIGITS ROLLED ONCE, and which position each took (3.419.0).
    // This used to map an ARRAY of tens dice with one marked "chosen",
    // which was the shape of the wrong rule: a d100 bias reorders the
    // pair it already rolled, it does not draw a second tens die. See
    // dice/open-ended.mjs.
    const percentile = this.dice?.percentile
      ? {
          tens: this.dice.percentile.tens,
          unit: this.dice.percentile.unit,
          drawn: this.dice.percentile.drawn ?? null,
          swapped: Boolean(this.dice.percentile.swapped)
        }
      : null;

    return {
      die: this.die,
      chains,
      percentile,
      diceTotal: this.dice?.total ?? 0,
      exploded: this.dice?.chosen?.exploded ?? false,
      biasLabel:
        this.bias === BIAS.ADVANTAGE
          ? "Advantage"
          : this.bias === BIAS.DISADVANTAGE
            ? "Disadvantage"
            : ""
    };
  }

  /** Data handed to the chat card template. */
  async getCardData() {
    const difficulty = DIFFICULTY_BY_KEY[this.difficulty];

    const bonusEligible =
      this.allowConviction && !this.luckUsed &&
      !this.flat && !this.convictionDecided &&
      CONVICTION_SPENDS.bonus.checkTypes.includes(this.type);
    const conviction =
      bonusEligible && this.actor ? getConvictionState(this.actor) : null;

    return {
      actorName: this.actor?.name ?? game.user.name,
      label: this.label,
      subtitle: this.#subtitleWithVision(),
      type: this.type,
      flat: this.flat,
      compact: this.compact,
      compactSummary: this.compactSummary,
      extraDetailLines: this.extraDetailLines,
      ...this.#buildDiceDisplay(),
      difficulty:
        difficulty && this.difficulty !== "medium" ? difficulty.label : null,
      ...buildOutcomeDisplay(this.outcome, {
        suppressDegree: this.suppressDegree,
        bonusCheck: this.bonusCheck,
        declaredOutcomes: this.declaredOutcomes
      }),
      showDCInput: !this.suppressDegree && this.outcome?.dc === null,
      bonusEligible: Boolean(bonusEligible && conviction?.ok),
      bonusPointsRemaining: conviction?.value ?? 0,
      bonusUsed: Boolean(this.convictionBonusSpent)
    };
  }

  /** Post the result to chat. */
  async toMessage(messageData = {}) {
    const cardData = await this.getCardData();
    const content = await renderTemplateCompat(CARD_TEMPLATE, cardData);

    const data = foundry.utils.mergeObject(
      {
        speaker: ChatMessage.getSpeaker({ actor: this.actor ?? undefined }),
        content,
        rolls: this.rolls,
        flags: {
          [SYSTEM_ID]: {
            check: {
              type: this.type,
              label: this.label,
              degree: this.outcome?.degree?.key ?? null,
              total: this.outcome?.total ?? null,
              dc: this.outcome?.dc ?? null,
              margin: this.outcome?.margin ?? null,
              chaos: this.outcome?.chaos ?? false,
              bonusCheck: this.outcome?.bonusCheck ?? null
            },
            // Raw inputs kept so the Bonus die button and the GM's DC
            // field (both live on the card, resolved after posting) can
            // recompute the outcome without needing this TRGCheck
            // instance, which no longer exists by the time either is
            // clicked. See check-card-interactions.mjs.
            checkCard: {
              actorId: this.actor?.id ?? null,
              // THE CREATURE, NOT ITS SIDEBAR SHEET (3.612.1, H1 of the 3.612.0
              // drive). An unlinked token's actor shares the base actor's id, so
              // every button below read the world actor: no held bonus was ever
              // offered on an NPC copy's card, and Spend Conviction spent the
              // world actor's point. Resolved through actor-handle.mjs, token
              // first; `actorId` stays for cards written before this.
              tokenId: this.actor?.token?.id ?? null,
              actorUuid: this.actor?.uuid ?? null,
              actorName: this.actor?.name ?? game.user.name,
              type: this.type,
              // The skill/save key, so a card whose DC arrives after the
              // fact can still answer scoped questions — Scoundrel's
              // Luck's "a skill modified by Roguish Skill" is the first.
              subject: this.subject,
              // THE ABILITIES IT IS BASED ON (3.613.0) — Physical Boost's scope.
              abilities: this.abilities,
              // THE ACTION THIS WAS ROLLED FROM (3.411.0). A held bonus
              // offered on an already-posted card can only narrow by what
              // the card carries, and without this an entry scoped to an
              // action would silently never match. See magic/held-bonus.mjs.
              actionKey: this.actionKey,
              declaredOutcomes: this.declaredOutcomes,
              // THE ACTION'S HELD-OVER OUTCOME (3.423.0). When the dice
              // produced no degree — no DC was set — the action stores
              // everything its consequence needs here, and `onSetDC`
              // runs it once a DC finally arrives. Without it the card
              // could be made to read "Heroic" over an action that did
              // nothing at all, which is what Graham found in Study
              // Target on 3.421.0. See combat/action-workflow.mjs's
              // pendingOutcomeContext.
              //
              // DROPPED WHEN THE ROLL ALREADY RESOLVED. The degree is
              // known by the time this flag is written, and a resolved
              // action has applied its outcome already — keeping one
              // would leave every action in the game re-runnable from
              // its own card.
              pendingOutcome: this.outcome?.degree?.key ? null : (this.pendingOutcome ?? null),
              label: this.label,
              subtitle: this.subtitle,
              flat: this.flat,
              suppressDegree: this.suppressDegree,
              bonusCheck: this.bonusCheck,
              dieTotal: this.dice.total,
              // THE OPEN-ENDED RULE THIS ROLL WAS MADE UNDER (3.413.0).
              // A held advantage rolls a second CHAIN after the card is
              // posted and keeps the better total. Without this the
              // challenger would be rolled under whatever the setting
              // happened to be at spend time — and if the original was
              // open-ended while the challenger was not, a worse roll
              // wins because only one of them could explode.
              openEnded: this.openEnded,
              // THE DIE THIS ROLL WAS MADE WITH (3.549.0). Same reason as
              // `openEnded` above, and found the same way: a held
              // advantage rolls a challenger after the card is posted,
              // and that challenger was hard-coded to `1d20`. On a d100
              // card — initiative is the one in play — the spend would
              // have measured a d20 against a d100 and kept the "better"
              // of two numbers that are not on the same scale, which a
              // d20 challenger loses roughly nineteen times in twenty.
              // Nothing currently grants an initiative advantage, so this
              // was a trap rather than a live defect. Pages 6-15 audit.
              die: this.die,
              modifiers: this.modifiers.map((modifier) => ({ ...modifier })),
              // THE SHIFT RIDES WITH THE INPUTS (3.612.0, R4), so a card
              // rebuilt by a Conviction die or a late DC moves it again.
              degreeShift: this.degreeShift,
              baseDC: this.baseDC,
              difficulty: this.difficulty,
              chaosArg: this._outcomeArgs?.chaos ?? false,
              autoArg: this._outcomeArgs?.auto ?? null,
              // DECIDED BEFORE THE RESULT WAS READ (3.645.0): the card offers
              // no second chance at a die the workflow could no longer see.
              bonusUsed: Boolean(this.convictionDecided),
              // LUCK CHANGED THIS CHECK (3.624.0, R12): no Conviction Bonus,
              // no reroll from another fortune effect.
              luckUsed: Boolean(this.luckUsed),
              // A DECLARED REFUND ALREADY GIVEN (3.669.0), so a late DC does
              // not give it twice. See conviction-refund.mjs.
              convictionRefunded: Boolean(this.convictionRefunded),
              // A DEGREE DECLARED WITHOUT THE ROLL (3.669.2), so a DC the
              // GM sets later declares it too, rather than showing the dice's.
              declaredDegree: this.declaredDegree || "",
              diceDisplay: this.#buildDiceDisplay()
            }
          }
        }
      },
      messageData
    );

    applyMessageMode(data, this.rollMode);
    return ChatMessage.create(data);
  }

  /**
   * Convenience entry point: roll a check and post it.
   * @param {object} config
   * @returns {Promise<TRGCheck>}
   */
  static async roll(config = {}) {
    /*
     * A SAVE OR A SKILL CHECK WITH NO MODIFIERS ROLLS THE CREATURE'S OWN
     * (3.653.1; found live testing 3.653.0, 16 October 2026). The Medusa's
     * Petrifying Gaze re-save came out "19 = 19 … Modifiers +0": the
     * end-of-turn escape save asked for a Fortitude save and passed nothing
     * to add to the die, so the Brave's +9 was never rolled. Nine more paths
     * did the same — a rune's after-strike save, Improved Reposition, Chance
     * of Redemption, the Elemental Nexus, an emanation's entry save, Directed
     * Strike, a recurring ladder and a prison's escape. A caller that states
     * its modifiers keeps them; one that states none gets the creature's own
     * save or skill rows, exactly as `withCheckModifiers` gives them.
     */
    if (config?.actor && !Array.isArray(config.modifiers) && (config.type === "save" || config.type === "skill")) {
      config = withCheckModifiers(config);
    }
    const check = new TRGCheck(config);

    // Automatic conditionals. Most checks in the system never open the
    // configuration dialog — an affliction's save, a spell's save, a
    // condition's recovery roll, and any roll where the player held
    // Shift — so applying these only in the dialog would have left the
    // engine reachable from the character sheet and nowhere else. Only
    // entries whose author marked them `auto` land here; anything
    // needing a person's judgement is still offered, not assumed.
    if (check.actor && !check.flat && !check.conditionalsResolved) {
      const { automaticSelections, collectConditionals, resolveBias, scalingFor } =
        await import("../conditionals.mjs");
      const { allyAuraConditionalsFor } = await import("../creature-aura-workflow.mjs");
      const entries = collectConditionals(
        Array.from(check.actor.items ?? []),
        Array.from(check.actor.appliedEffects ?? check.actor.effects ?? []),
        [
          ...(check.actor.system?.combat?.runeConditionals ?? []),
          // Ally auras. Reaching this path matters more than the dialog:
          // a save forced by a spell never opens one, and that is exactly
          // the roll Aura of Tranquility is written for.
          ...allyAuraConditionalsFor(check.actor)
        ],
        scalingFor(check.actor)
      );
      if (entries.length) {
        // ONE CONTEXT FOR BOTH HALVES (3.667.3): what applies unasked, and
        // what is offered as a tick-box below. Two copies would drift.
        const conditionalContext = {
          checkType: check.type,
          subject: check.subject,
          actionKey: check.actionKey,
          traits: check.traits,
          traditions: check.traditions,
          sourceTypes: check.sourceTypes,
          targetTypes: check.targetTypes,
          // THE TWO UUID AXES, WHICH THIS CONTEXT HAS NEVER CARRIED.
          //
          // `sourceUuids` shipped at 3.406.0 and `matchesCheck` has read
          // it ever since — but neither this object nor the dialog's ever
          // passed it, so every uuid-scoped conditional tested against an
          // empty list and matched nothing. Forbidding Ward's "+1 to
          // saving throws against that enemy" had never once applied. The
          // DB half of the same sentence goes down a different channel
          // that DID get the uuid, and looking correct in play is what
          // kept the silent half hidden. See conditionals.mjs's header.
          sourceUuid: check.sourceUuid,
          targetUuid: check.targetUuid,
          attackMode: check.attackMode,
          targetTraits: check.targetTraits,
          attackForm: check.attackForm,
          attackGroup: check.attackGroup,
          rangeBand: check.rangeBand,
          targetStates: check.targetStates
        };
        const applied = automaticSelections(entries, conditionalContext);
        check.modifiers.push(...applied.modifiers);
        if (applied.kinds.length) {
          check.bias = resolveBias(check.bias, applied.kinds, BIAS);
        }
        // SPENT HERE TOO (3.587.0). A one-shot conditional applied on
        // this route and not spent on it would apply for ever on every
        // roll that skips the dialog — and a forced save IS that roll,
        // which is precisely the roll Clarity is written for. The
        // dialog already does this; a rule with two call sites and one
        // implementation is the defect shape this project keeps finding.
        for (const { sourceId, label } of applied.spent ?? []) {
          const effect = check.actor?.effects?.get?.(sourceId);
          if (effect?.delete) await effect.delete();
          else ui.notifications?.warn?.(
            `${label || "A one-shot bonus"} was used but could not be cleared — remove it by hand.`);
        }
        // …AND THE TICK-BOXES, ASKED (3.667.3; Graham, 23 October 2026).
        // A roll that opens no dialog — a weapon attack, a Spellcraft
        // check, a forced save — never offered a conditional its author
        // left unticked, so it never applied. Now the matching ones are
        // asked in one small prompt before the dice. See
        // dice/offered-conditionals.mjs.
        const { offerConditionalsOnRoll } = await import("./offered-conditionals.mjs");
        await offerConditionalsOnRoll(check, entries, conditionalContext, BIAS);
      }
    }

    // Pending entries a spell or Skill Action left waiting, on the rolls
    // that never open a dialog to offer them (3.587.0).
    //
    // ONLY THE `auto` ONES. A pending entry is normally a question —
    // "is THIS the next check you meant?" — and a forced save has nobody
    // to ask. Disorient's Fumble rung asks nothing ("disadvantage on ALL
    // checks"), so it applies here; its Success and Failure rungs name a
    // roll the player chooses, and those wait for a dialog rather than
    // being spent on the first save that happens along.
    if (check.actor && !check.flat && !check.conditionalsResolved) {
      const { applyPendingSelections, consumePendingModifiers, pendingModifierRows } =
        await import("../pending-modifiers.mjs");
      const { resolveBias } = await import("../conditionals.mjs");
      // A ROW SCOPED TO A KIND OF CHECK (3.650.0; block 17 R8) waits for one:
      // Prankster's Cruelty's "-2 to its next ATTACK" is not spent on a save.
      // …AND ONE NAMING AN ACTION, FOR THAT ACTION (3.666.3).
      const { pendingFitsCheck } = await import("../combat/dedicated-rows.mjs");
      const auto = pendingModifierRows(check.actor).filter((row) => row.auto
        && (!Array.isArray(row.checkTypes) || !row.checkTypes.length || row.checkTypes.includes(check.type))
        && pendingFitsCheck(row, check.actionKey ?? ""));
      if (auto.length) {
        const taken = applyPendingSelections(auto, auto.map((row) => row.id));
        check.modifiers.push(...taken.modifiers);
        if (taken.kinds.length) check.bias = resolveBias(check.bias, taken.kinds, BIAS);
        if (taken.consume.length) await consumePendingModifiers(check.actor, taken.consume);
      }
    }

    // LUCK (3.624.0, block 40's R11/R12): rolled before the dice and
    // before every other fortune or Chance offer, which it then closes —
    // "you may only apply a fortune effect to a check once".
    // NOT ON DICE NOBODY READS (3.669.2, found in review): Luck armed from
    // the sheet stays armed through a day's first declared `exact`.
    if (check.actor && !check.flat && check.type !== "luck" && !check.declaredDegree && !check.presetModifiers) {
      const { applyLuckToCheck } = await import("../luck-workflow.mjs");
      const said = await applyLuckToCheck(check, { requested: check.useLuck });
      if (said.length) check.extraDetailLines = [...(check.extraDetailLines ?? []), ...said];
    }

    // The save-advantage family (Chapter 5), offered before the dice are
    // thrown because that is what its trigger says. Scoped by `subject`, so
    // a save that never declared which one it is offers nothing rather than
    // guessing — see SAVE_SCOPE_EXEMPTIONS for the one roll that is
    // deliberately outside the family's reach.
    //
    // COMBINED THROUGH `resolveBias`, NOT ASSIGNED. A save already carrying
    // Disadvantage from a condition must come out NORMAL, not Advantage;
    // writing the field directly would have quietly cancelled the penalty
    // instead of cancelling against it.
    if (check.actor && check.type === "save" && !check.flat && !check.saveReactionResolved) {
      const { offerSaveReaction } = await import("../magic/save-reactions.mjs");
      const { saveKeyOf } = await import("../combat/save-advantage.mjs");
      const save = saveKeyOf(check.subject);
      if (save) {
        const answer = await offerSaveReaction(check.actor, {
          // TWO DIFFERENT THINGS, KEPT APART. `saveSource` is what forces
          // the save and only a workflow that knows it can say so; `label`
          // is how the roll describes itself from the roller's side. Folding
          // one into the other produced "a fortitude save against Falling —
          // Injury Save" live on 21 Aug 2026.
          spellName: check.saveSource,
          sourceLabel: check.label,
          isArea: check.isArea,
          saveName: save,
          save
        });
        if (answer.advantage) {
          const { resolveBias } = await import("../conditionals.mjs");
          check.bias = resolveBias(check.bias, ["advantage"], BIAS);
          check.modifiers.push({
            label: answer.cost === "free" ? `${answer.label} (free)` : answer.label,
            value: 0,
            type: "untyped"
          });
        }
        // A REACTION THAT ROLLS A SKILL AND ADDS ITS BONUS CHECK (3.666.0):
        // Inner Tempest's Steel the Mind — see magic/save-bonus-reactions.mjs.
        // Asked here for the same reason as the advantage family: before
        // the dice, which is when "declared before the save is rolled"
        // fires.
        const { offerSaveBonusReaction } = await import("../magic/save-bonus-reactions.mjs");
        const bonus = await offerSaveBonusReaction(check.actor, {
          save, traits: check.traits, saveName: save, sourceLabel: check.saveSource || check.label
        });
        if (bonus) check.modifiers.push({ label: bonus.label, value: bonus.value, type: bonus.type });
      }
    }

    // FATEFUL TEMPTATION (3.612.0, R4): "Trigger: You or an ally within
    // range attempts a saving throw." Offered here, with the save-advantage
    // family and for the same reason — before the dice, which is when its
    // trigger fires — and cast through `castSpell`, so the casting check, the
    // PP and the reaction are the ordinary ones. Its +2 joins the modifiers
    // and its shift moves the degree the moment it is built.
    if (check.actor && check.type === "save" && !check.flat && !check.saveReactionResolved) {
      const { offerFatefulTemptation } = await import("../magic/save-reaction-spells-workflow.mjs");
      const fate = await offerFatefulTemptation(check);
      if (fate) {
        // CHANCE (3.622.0; Graham's R11 of block 39): "You can never have
        // more than a single chance effect alter a roll." Fateful
        // Temptation, Unity, Seer's Vision and Lucky Break all carry the
        // trait; the first to alter this roll closes it to the rest.
        check.chanceUsed = "Fateful Temptation";
        check.modifiers.push(fate.modifier);
        check.degreeShift = fate.shift;
        check.extraDetailLines = [...(check.extraDetailLines ?? []), fate.line];
      }
    }

    // UNITY (3.614.0, R6): "Each ally can use your saving throw modifier
    // instead of its own against the triggering spell." Before the dice, with
    // Fateful Temptation, and only for a save that names what forced it.
    if (check.actor && check.type === "save" && !check.flat && !check.saveReactionResolved
      && (check.saveSource || check.sourceUuid) && !check.chanceUsed) {
      const { offerUnity } = await import("../magic/save-reaction-spells-workflow.mjs");
      const unity = await offerUnity(check);
      if (unity) {
        check.chanceUsed = "Unity";
        check.modifiers.push(unity.modifier);
        check.extraDetailLines = [...(check.extraDetailLines ?? []), unity.line];
      }
    }

    /*
     * THE ROD OF ALERTNESS (3.616.0, Graham's R14 of block 36): "You make a
     * Perception or Sense Motive skill check (free action) … You may expend 2
     * PP from the rod to gain advantage on the check." Offered before the
     * dice, held rods only, and combined through `resolveBias` like every
     * other source of advantage here. See rod-powers.mjs.
     */
    if (check.actor && ["skill", "spellcraft"].includes(check.type) && !check.flat && !check.rodAdvantageResolved && !check.presetModifiers) {
      const { advantageRodFor, bonusRodFor } = await import("../rod-powers.mjs");
      // ONE ROD A ROUND (3.622.0; R11): not offered once a Rod has been used.
      const { rodUsedThisRound } = await import("../trait-rules-workflow.mjs");
      // ANY ROD THAT NAMES THIS CHECK (3.626.0): by skill, by action key, or
      // by check type — and a rod that buys a BONUS rather than advantage.
      const rodCtx = { actionKey: check.actionKey ?? "", checkType: check.type };
      const rod = rodUsedThisRound(check.actor) ? null : advantageRodFor(Array.from(check.actor.items ?? []), check.subject, rodCtx);
      const bonusRod = rodUsedThisRound(check.actor) ? null : bonusRodFor(Array.from(check.actor.items ?? []), { subject: check.subject, ...rodCtx });
      const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
      if (!rod && bonusRod && DialogV2) {
        check.rodAdvantageResolved = true;
        const answer = await DialogV2.wait({
          window: { title: `${check.label} — ${bonusRod.name}` },
          classes: ["trg-prime"],
          content: `<div class="trg-prime trg-check-dialog"><p>Spend <strong>${bonusRod.cost} PP</strong> from `
            + `<strong>${bonusRod.name}</strong> (it holds ${bonusRod.uses}) for a +${bonusRod.value} ${bonusRod.type} bonus on this check?${bonusRod.scope ? ` <em>(${bonusRod.scope})</em>` : ""}</p></div>`,
          buttons: [
            { action: "spend", label: `Spend ${bonusRod.cost} PP: +${bonusRod.value}` },
            { action: "no", label: "No", default: true }
          ],
          rejectClose: false
        });
        if (answer === "spend") {
          const rodItem = check.actor.items?.get?.(bonusRod.itemId);
          const { spendFromRod } = await import("../charged-items-workflow.mjs");
          const paid = rodItem ? await spendFromRod(check.actor, rodItem, bonusRod.cost) : "";
          check.modifiers.push({ label: bonusRod.name, value: bonusRod.value, type: bonusRod.type });
          if (paid) check.extraDetailLines = [...(check.extraDetailLines ?? []), paid];
        }
      }
      if (rod && DialogV2) {
        check.rodAdvantageResolved = true;
        const answer = await DialogV2.wait({
          window: { title: `${check.label} — ${rod.name}` },
          classes: ["trg-prime"],
          content: `<div class="trg-prime trg-check-dialog"><p>Spend <strong>${rod.cost} PP</strong> from `
            + `<strong>${rod.name}</strong> (it holds ${rod.uses}) for advantage on this check?</p></div>`,
          buttons: [
            { action: "spend", label: `Spend ${rod.cost} PP: advantage` },
            { action: "no", label: "No", default: true }
          ],
          rejectClose: false
        });
        if (answer === "spend") {
          const rodItem = check.actor.items?.get?.(rod.itemId);
          const { spendFromRod } = await import("../charged-items-workflow.mjs");
          const paid = rodItem ? await spendFromRod(check.actor, rodItem, rod.cost) : "";
          const { resolveBias } = await import("../conditionals.mjs");
          check.bias = resolveBias(check.bias, ["advantage"], BIAS);
          check.modifiers.push({ label: `${rod.name}: advantage`, value: 0, type: "untyped" });
          if (paid) check.extraDetailLines = [...(check.extraDetailLines ?? []), paid];
        }
      }
    }

    // A PERCEPTION CHECK WITHOUT A SENSE IT MAY NEED (3.621.0; Appendix 2,
    // block 39's R7). Blinded: "You automatically fumble Perception checks
    // that require you to be able to see, and if vision is your only primary
    // sense, all Perception checks are one difficulty level higher."
    // Deafened: an automatic fumble for one that needs hearing, and "a –4
    // status penalty to Perception checks that involve sound that also rely
    // on other senses". Which sense a check needs is the table's call, so it
    // is asked — only of a creature that has lost one.
    if (check.actor && check.type === "skill" && check.subject === "perception" && !check.flat && !check.senseResolved) {
      const conds = check.actor.conditions?.effective;
      const blinded = hasCondition(conds, "blinded");
      const deafened = hasCondition(conds, "deafened");
      if (blinded || deafened) {
        check.senseResolved = true;
        const answer = config.perceptionSense ?? await askPerceptionSense(check, { blinded, deafened });
        const sense = String(answer?.sense ?? answer ?? "other");
        const result = perceptionBySense(conds, sense);
        if (result.fumble) check.senseFumble = result.condition;
        if (result.harder && answer?.visionOnly !== false) {
          check.difficulty = stepDifficultyHarder(check.difficulty);
          check.extraDetailLines = [...(check.extraDetailLines ?? []),
            "Blinded: one difficulty step harder — vision is the only primary sense."];
        }
        if (result.penalty) {
          check.modifiers.push({ label: "Deafened (sound)", value: result.penalty, type: "status" });
        }
      }
    }

    // The Advantage spend chosen in the configuration dialog: verify and
    // deduct before the dice are rolled.
    let advantageSpent = false;
    let advantageKept = false;
    if (check.convictionAdvantage && check.actor && !check.declaredDegree) {
      advantageSpent = await spendConvictionAdvantage(check.actor);
      // LUCK OF HEROES (3.619.0, R8): a DC 15 flat check keeps the point.
      if (advantageSpent) advantageKept = await luckOfHeroes(check.actor, "advantage");
      if (advantageSpent) {
        // COMBINED, NOT ASSIGNED (3.622.0; block 39's A14). The Advantage
        // trait: "if an action gains both advantage and disadvantage, they
        // simply cancel each other out" — every other source of advantage
        // here goes through `resolveBias`, and this one overwrote a
        // Disadvantage instead of cancelling it.
        const { resolveBias } = await import("../conditionals.mjs");
        check.bias = resolveBias(check.bias, ["advantage"], BIAS);
        check.modifiers.push({
          // Named apart when kept, so the late-DC Scoundrel's Luck refund
          // (check-card-interactions) cannot hand the same point back again.
          label: advantageKept ? "Conviction: Advantage (kept, Luck of Heroes)" : "Conviction: Advantage",
          value: 0,
          type: "untyped"
        });
      }
    }

    await check.evaluate();

    // DUAL MINDS (3.647.0, F&F 3.0 block 15 R9): a mental effect that catches
    // an Ettin with others reaches both heads, "which each then get a separate
    // save" — rolled again, and the better stands, as one free head keeps
    // control. A mental effect aimed at it alone never gets here: the spell
    // and action gates find it immune.
    if (check.type === "save" && check.actor && !check.flat && check.outcome?.degree?.key) {
      const { dualMindsVerdict } = await import("../dual-minds.mjs");
      if (dualMindsVerdict(check.actor.items, check.traits ?? "", Infinity) === "twoSaves") {
        const first = { dice: check.dice, outcome: check.outcome, args: check._outcomeArgs };
        await check.reroll();
        const rank = (o) => Number(o?.degree?.rank ?? -1);
        const keptFirst = rank(first.outcome) > rank(check.outcome)
          || (rank(first.outcome) === rank(check.outcome) && Number(first.outcome?.total ?? 0) >= Number(check.outcome?.total ?? 0));
        const second = check.outcome;
        if (keptFirst) {
          check.dice = first.dice;
          check.outcome = first.outcome;
          check._outcomeArgs = first.args;
        }
        check.firstOutcome = null;
        check.extraDetailLines = [...(check.extraDetailLines ?? []),
          `Dual Minds: each head saves — ${first.outcome?.degree?.label ?? "?"} (${first.outcome?.total}) and ${second?.degree?.label ?? "?"} (${second?.total}); the better stands.`];
      }
    }

    // Scoundrel's Luck (Rogue, 1st): "you do not expend the conviction
    // used when gaining advantage on a skill modified by Roguish Skill
    // if the result of the check is a failure." Failure, Fumble or
    // Blunder — a Partial is its own degree (per Graham, 3.217.0). The
    // point comes back AND the once-per-round marker clears: a point
    // not expended was not spent.
    // NOT TWICE: a point Luck of Heroes already kept has nothing to refund.
    if (advantageSpent && !advantageKept && check.actor &&
      scoundrelsLuckRefund({
        hasAbility: scoundrelsLuckBonus(check.actor) > 0,
        advantageSpent,
        checkType: check.type,
        subject: check.subject,
        picks: roguishSkillPicks(check.actor),
        degree: check.outcome?.degree?.key ?? ""
      })) {
      await awardConviction(check.actor, 1);
      await check.actor.unsetFlag(SYSTEM_ID, "convictionSpent");
      check.extraDetailLines = [
        ...(check.extraDetailLines ?? []),
        "Scoundrel's Luck — the check failed: the conviction point spent on advantage is refunded, and does not count as this round's spend."
      ];
    } else if (advantageSpent && !advantageKept && check.actor) {
      // A DECLARED REFUND ON A GOOD RESULT (3.669.0; Inner Tempest's
      // Adaptive Mind, Graham's B5-3). See conviction-refund.mjs.
      const { convictionRefundRow, convictionRefundLine } = await import("../conviction-refund.mjs");
      const refund = convictionRefundRow(check.actor.items, {
        checkType: check.type, subject: check.subject, degree: check.outcome?.degree?.key ?? ""
      });
      if (refund) {
        await awardConviction(check.actor, 1);
        await check.actor.unsetFlag(SYSTEM_ID, "convictionSpent");
        check.convictionRefunded = true;
        check.extraDetailLines = [...(check.extraDetailLines ?? []), convictionRefundLine(refund.label)];
      }
    }

    // A DEGREE SET WITHOUT THE NEED FOR A ROLL (3.669.2; found live). A
    // day's first declared `exact` — Inner Tempest's Tianzhi Discipline, "the
    // first Refocus check … is treated as a Critical result without the need
    // for a roll" — is rolled but not read. Its card showed the dice's own
    // degree ("Fumble, fails DC by 18") above the outcome's Critical. Declared
    // here at that degree, before anybody reads it, as Prism Lotus's Success
    // is: the card says "Declared — the dice do not count", and nothing that
    // answers the dice (conviction, a reroll, a conversion) is offered.
    // A DC the GM sets later arrives at the card, which declares it there.
    if (check.declaredDegree && !check.flat && check.outcome?.degree?.key) {
      const { declaredAt } = await import("../magic/save-convert.mjs");
      const set = declaredAt(check.outcome, check.declaredDegree);
      if (set !== check.outcome) {
        check.outcome = set;
        check.luckUsed = true;
        check.saveReactionResolved = true;
      }
    }

    // SAID WHEN A SHIFT MOVED THE DEGREE (3.612.0, R4).
    if (check.outcome?.shiftedFrom) {
      const from = DEGREES.find((d) => d.key === check.outcome.shiftedFrom)?.label ?? check.outcome.shiftedFrom;
      check.extraDetailLines = [...(check.extraDetailLines ?? []),
        degreeShiftLine("Fateful Temptation", from, check.outcome.degree.label)];
    }

    // THE CONVICTION BONUS, BEFORE ANYBODY READS THE RESULT (3.645.0, F2).
    if (check.actor && !check.flat) await offerConvictionBonusNow(check);

    // A DECLARED SUCCESS (3.630.0) — Prism Lotus (Fate). Asked before any
    // reroll or conversion, because a declared Success leaves none to make.
    // Not on a degree already declared (3.669.2).
    if (check.actor && !check.flat && !check.chanceUsed && !check.outcome?.declared && check.outcome?.degree?.key) {
      const { offerFateDeclare } = await import("./fate-declare-workflow.mjs");
      const declared = await offerFateDeclare(check);
      if (declared) {
        check.extraDetailLines = [...(check.extraDetailLines ?? []), declared];
        check.saveReactionResolved = true;
      }
    }

    // LUCKY BREAK (3.612.0, R4): "Trigger: You fail (but don't fumble) a
    // saving throw." Offered once the degree is known, before anybody reads
    // it — the workflow that forced the save reads `check.outcome` the moment
    // this returns, so the reroll is the result it acts on.
    if (check.actor && check.type === "save" && !check.flat && !check.saveReactionResolved
      && check.outcome?.degree?.key && !check.chanceUsed) {
      const { offerLuckyBreak, offerSaveRerollSpells } = await import("../magic/save-reaction-spells-workflow.mjs");
      const luck = await offerLuckyBreak(check);
      if (luck) check.extraDetailLines = [...(check.extraDetailLines ?? []), luck];
      // A ROW-DECLARED REROLL SPELL (3.625.0), from the saver's side —
      // asked after Lucky Break and only if that found nothing, because a
      // save is rerolled once.
      if (!luck) {
        const answered = await offerSaveRerollSpells(check);
        if (answered) check.extraDetailLines = [...(check.extraDetailLines ?? []), answered];
        // AND AN ITEM'S (3.626.0): a shield rune or a worn talisman, when neither spell answered.
        if (!answered) {
          const { offerSaveRerollItems } = await import("../magic/save-reaction-spells-workflow.mjs");
          const fromItem = await offerSaveRerollItems(check);
          if (fromItem) check.extraDetailLines = [...(check.extraDetailLines ?? []), fromItem];
        }
      }
      // AND, IF IT STILL FAILED, A CONVERSION THE SAVER DECLARES (3.627.0):
      // Iron Will of the Tomb's "treat the failed save as a success instead".
      // Last, because a reroll might make the price unnecessary.
      {
        const { offerSaveConvert } = await import("../magic/save-convert-workflow.mjs");
        const converted = await offerSaveConvert(check);
        if (converted) check.extraDetailLines = [...(check.extraDetailLines ?? []), converted];
      }
    }

    // YOUR OWN FUMBLE, REROLLED (3.669.0; Inner Tempest's Fortune's
    // Reversal): a skill check or a save that came out a Fumble, offered to
    // the roller before anybody reads it, and the second result stands.
    // A BLUNDER TOO (3.669.1; Graham's B5-5 of 24 October 2026): it fails by
    // more than a Fumble does.
    if (check.actor && !check.flat && !check.fumbleRerolled && !check.presetDice && ["skill", "save"].includes(check.type)
      && ["fumble", "blunder"].includes(check.outcome?.degree?.key)) {
      const { offerFumbleReroll } = await import("../fumble-reroll-workflow.mjs");
      const { fumbleWords } = await import("../fumble-reroll.mjs");
      // CALLED WHAT IT WAS (3.669.2; found live): "the blunder is rerolled".
      const firstDegree = check.outcome.degree.key;
      const taken = await offerFumbleReroll(check.actor, check.type, { degree: firstDegree });
      if (taken) {
        check.fumbleRerolled = true;
        await check.reroll();
        check.extraDetailLines = [...(check.extraDetailLines ?? []),
          `${taken.label}: the ${fumbleWords(firstDegree).noun} is rerolled — ${check.outcome?.degree?.label ?? "?"} (${check.outcome?.total ?? "?"}) stands, even if worse.`];
      }
    }

    // A CHECK WHOSE DEGREE IS FINAL (3.630.0), announced for a module to
    // answer — Pillars of Faith's Soul Mirror ("on a Critical or Heroic save
    // against possession, the possessor makes a Will save") and Memory of
    // Lost Masters (a Critical with the remembered Lore restores the echo).
    // The source, when the caller knew it, travels as `sourceUuid`.
    if (check.actor && !check.flat && check.outcome?.degree?.key) {
      globalThis.Hooks?.callAll?.("trgPrimeCheckResolved", {
        actor: check.actor, type: check.type, subject: check.subject, degree: check.outcome.degree.key,
        traits: check.traits, sourceUuid: check.sourceUuid || "", label: check.label || ""
      });
    }

    // FALSE ARROGANCE (3.612.0, R8): a failed attack roll or skill check by a
    // creature carrying the spell writes its penalty for the next ones. Asked
    // here, once the degree is final, because every such roll passes through.
    if (check.actor && !check.flat && check.outcome?.degree) {
      const { onArroganceCheck } = await import("../magic/false-arrogance-workflow.mjs");
      const rattled = await onArroganceCheck(check);
      if (rattled) check.extraDetailLines = [...(check.extraDetailLines ?? []), rattled];
    }

    if (config.toMessage !== false) {
      await check.toMessage(config.messageData);
    }
    return check;
  }
}

/**
 * Which sense a Perception check needs, asked of a Blinded or Deafened
 * creature (3.621.0). Returns {sense, visionOnly}.
 */
/**
 * THE CONVICTION BONUS, OFFERED WHILE IT CAN STILL CHANGE SOMETHING
 * (3.645.0, F2 of Graham's 14 October session).
 *
 * The +1d6 used to be a button on the posted card only. A card rebuilds its
 * own total, but an attack, a cast or a workflow's save has already been read
 * by then — the hit, the spell's degree, the damage halved — so the card said
 * the total rose and nothing that mattered moved. The die is now asked for
 * here, between the dice and the workflow reading them, whenever the result
 * is read at once:
 *
 * - an attack or a Spellcraft check, always (an attack's margin sets its
 *   critical, a cast's sets warping) — except an unmodified 1 on an attack,
 *   which misses whatever is added;
 * - a save or a skill check with its DC known, when +6 could move the degree.
 *
 * A save or skill check still waiting on the GM's DC keeps the card button,
 * which works there: nothing has read the card yet.
 *
 * ASKED ON A CARD SINCE 3.667.2, not a dialog: the dice and the total, never
 * the DB, the DC or the degree — "after the dice is rolled but before the
 * result is known" (Graham, 23 October 2026).
 */
async function offerConvictionBonusNow(check) {
  // A SHARED ROLL (3.669.1; found live on Spirit Roar, the card asked once
  // per enemy): only the first creature's check is asked. The others meet
  // its die, and its +1d6 when it was spent.
  if (check.presetDice) {
    check.convictionDecided = true;
    if (check.presetConvictionDie > 0 && check.outcome) {
      check.applyExtraModifier({ label: "Conviction (+1d6, the shared roll's)", value: check.presetConvictionDie, type: "untyped" });
      check.convictionDie = check.presetConvictionDie;
    }
    return;
  }
  if (!check.allowConviction || check.luckUsed) return;
  if (!CONVICTION_SPENDS.bonus.checkTypes.includes(check.type)) return;
  if (!check.outcome) return;
  const readsNow = check.type === "attack" || check.type === "spellcraft";
  const dc = check.outcome.dc;
  if (!readsNow && (dc === null || dc === undefined)) return;
  check.convictionDecided = true;
  if (check.type === "attack" && Number(check.dice?.unmodified) === 1) return;
  if (!(game.user?.isGM || check.actor.isOwner)) return;
  const state = getConvictionState(check.actor);
  if (!state.ok) return;
  if (!readsNow && !check.convictionCouldMove()) return;

  // ON THE CARD, BEFORE THE RESULT IS KNOWN (3.667.2; Graham, 23 Oct 2026).
  // The dice and the total are posted with Spend and No; the DB, the DC and
  // the degree are not. The roll waits for the press — the owner's or the
  // GM's, on any screen. See dice/conviction-now-workflow.mjs.
  const { askConvictionOnCard, settleConvictionCard } = await import("./conviction-now-workflow.mjs");
  const total = check.outcome.total;
  const { spend, message } = await askConvictionOnCard(check, state);
  const card = { actorName: check.actor.name, label: check.label ?? "Check", total };
  if (!spend) { await settleConvictionCard(message, { ...card, spent: false }); return; }
  // ASKED AGAIN AT THE SPEND, as the card button does: another window may
  // have spent this round's point while the card waited.
  if (!getConvictionState(check.actor).ok) {
    await settleConvictionCard(message, { ...card, spent: false });
    return;
  }
  const roll = await new Roll("1d6").evaluate();
  // ONE ROLL, ON THE MESSAGE AS IT IS CREATED — Dice So Nice shows it once.
  check.rolls.push(roll);
  check.applyExtraModifier({ label: "Conviction (+1d6)", value: roll.total, type: "untyped" });
  check.convictionBonusSpent = true;
  check.convictionDie = roll.total;
  await markConvictionSpent(check.actor);
  check.extraDetailLines = [...(check.extraDetailLines ?? []),
    `Conviction: +1d6 rolled <strong>${roll.total}</strong> before the result was read — the total is now <strong>${check.outcome.total}</strong>.`];
  await settleConvictionCard(message, { ...card, spent: true, die: roll.total, newTotal: check.outcome.total });
  await luckOfHeroes(check.actor, "bonus");
}

async function askPerceptionSense(check, { blinded, deafened }) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2) return { sense: "other", visionOnly: true };
  const options = [
    blinded ? '<option value="sight">Sight — automatically fumbles</option>' : "",
    deafened ? '<option value="hearing">Hearing alone — automatically fumbles</option>' : "",
    deafened ? '<option value="sound">Sound, with other senses — −4</option>' : "",
    '<option value="other" selected>Another sense</option>'
  ].join("");
  const answer = await DialogV2.wait({
    window: { title: `${check.label} — Senses` },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p>${check.actor?.name ?? "This creature"} is ${[blinded ? "Blinded" : "", deafened ? "Deafened" : ""].filter(Boolean).join(" and ")}. What does this check rely on?</p>
      <div class="form-group"><label>Sense</label><select name="sense">${options}</select></div>
      ${blinded ? '<div class="form-group"><label><input type="checkbox" name="visionOnly" checked> Vision is its only primary sense (one step harder)</label></div>' : ""}
    </div>`,
    buttons: [{
      action: "ok", label: "Roll", default: true,
      callback: (event, button) => {
        const form = button.form ?? button.closest?.("form");
        const FDE = globalThis.foundry?.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        const data = FDE && form ? new FDE(form).object : {};
        return { sense: data.sense ?? "other", visionOnly: blinded ? Boolean(data.visionOnly) : true };
      }
    }],
    rejectClose: false
  });
  return answer && typeof answer === "object" ? answer : { sense: typeof answer === "string" ? answer : "other", visionOnly: true };
}

/** Re-exported helpers so callers only need to import from one place. */
export { levelDC };
