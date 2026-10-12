#!/usr/bin/env node
/**
 * Author the pages 251-260 spell work settled in block 25.
 *
 * Graham's R1-R10, 23 September 2026. Idempotent: every edit REPLACES
 * the field it owns rather than adding to it, so re-running writes the
 * same rows and a half-finished run can simply be run again.
 *
 * THAT CLAIM WAS FALSE IN THIS FILE ONCE ALREADY, in the two warp edits
 * at the bottom. They read `mods: { ...(w.mods ?? {}), newKey: v }`,
 * which looks careful and is the bug: a key written by an EARLIER RUN of
 * this same script survives the spread, so replacing one key with a
 * better one silently keeps both. Ball Lightning carried `extraTargets`
 * and `targetCap` together for two runs, the source read correctly, and
 * `verify-warp-repeats` was the only thing that knew. Block 24 shipped a
 * stale `sizeSteps` for the same reason; writing the lesson at the top
 * of the file did not stop me repeating it four hundred lines down.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE AUDIT'S HEADLINE FINDING WAS WRONG, and the correction is why this
 * script looks the way it does.
 *
 * R1 reported seventeen printed degree ladders and "not one modelled as
 * one". Measured afterwards: `onSave` — a mature degree-gating mechanism
 * with its own hard-won rules — already exists, 19 spells and 59 rows
 * across the pack use it, and TWO of the seventeen (Bane and Colour
 * Spray) were already laddered with it correctly.
 *
 * So the real count is fifteen, and the right tool for thirteen of them
 * is the mechanism that already exists. A `saveLadder` extension
 * carrying conditions was written and then reverted for exactly that
 * reason: it would have been a second way to say the same thing, needing
 * to be kept in step with the first on precisely the spells where a
 * mismatch would matter. `saveLadder` keeps the two it is right for —
 * Apocalypse and Blight Cloud, whose rungs scale DAMAGE, which `onSave`
 * does not do.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE RULES OF `onSave` THAT EVERY ROW BELOW OBEYS. See
 * magic/spell-degrees.mjs, which records what each one cost to learn.
 *
 * 1. DECLARE THE RUNGS THE PAGE PRINTS, AND ONLY THOSE. These ladders
 *    print four (Critical/Success/Failure/Fumble); the system rolls
 *    seven. `effectiveSaveDegree` remaps the other three before any row
 *    is read — a Partial down to `failure`, a Blunder to `fumble` — so
 *    authoring a rung the page does not print would replace that mapping
 *    with a guess.
 *
 * 2. "CRITICAL: THE TARGET IS UNAFFECTED" IS THE ABSENCE OF A ROW. A
 *    roll that SAVED and is not named takes nothing. Charm Animal prints
 *    no Critical line at all and needs none.
 *
 * 3. "AS FAILURE, BUT ALSO ..." MEANS THE FAILURE ROW MUST NAME THE
 *    FUMBLE TOO. Gating is per row against one remapped degree, so a
 *    Fumble does not inherit the Failure rung — Brain Lock's `stunned 3`
 *    is declared on both, or a fumbling target ends up paralyzed and not
 *    stunned at all.
 */

import { ClassicLevel } from "classic-level";

/* A degree-gated condition row, in Colour Spray's proven shape. */
const cond = (condition, onSave, extra = {}) =>
  ({ kind: "condition", target: "targets", condition, onSave, ...extra });
/* A degree-gated line for the card — the page's own sentence. */
const say = (onSave, text) => ({ kind: "note", onSave, text });
/* An ungated line, for what the whole spell does. */
const note = (text) => ({ kind: "note", text });

/*
 * Calm and Calm Animal print the same four rungs word for word, so the
 * rows are built once. The -1 is a STATUS penalty (Bane's shape). Both
 * failing rungs are adjudicated rather than applied: "emotion effects
 * are suppressed" has no engine, and whether hostility ends the effect
 * is a judgement about what is happening at the table.
 */
const calmRungs = () => [
  { kind: "bonus", target: "targets", slot: "attack", bonusType: "status",
    value: -1, onSave: ["success"] },
  say(["failure"], "Emotion effects on it are suppressed and it can't use hostile actions. If any other creature is hostile to it, it ceases to be affected."),
  say(["fumble"], "Emotion effects on it are suppressed and it can't use hostile actions — and hostility does NOT end the effect.")
];

/*
 * Charm Animal and Charm Kind share their two failing rungs.
 *
 * ONE ROW PER RUNG, NOT A SENTENCE ABOUT BOTH. "Becomes friendly; if it
 * was already friendly, helpful" is what `charmAttitude` already does
 * with a floor of `friendly`, so the Failure rung is that floor and the
 * Fumble rung is a floor of `helpful`. The card reports the move that
 * actually happened, which is why neither row repeats it in prose.
 */
const charmRungs = () => [
  { kind: "attitude", target: "targets", to: "friendly", onSave: ["failure"] },
  { kind: "attitude", target: "targets", to: "helpful", onSave: ["fumble"] },
  say(["failure", "fumble"], "It can't use hostile actions against you.")
];

/*
 * A HEROIC SAVE MUST GET AT LEAST WHAT A CRITICAL GETS, and saying so
 * takes one extra rung on four spells.
 *
 * FOUND BY DRIVING EVERY DEGREE through the finished rows rather than
 * the four the page prints. The two mechanisms disagree about `heroic`
 * on purpose, and the disagreement is invisible until one spell uses
 * both. `effectiveSaveDegree` answers "a save the spell does not name
 * applies nothing", which is exactly right where the Critical rung is
 * "the target is unaffected" — there is nothing to apply.
 *
 * It is exactly WRONG where the Critical rung says something MORE than
 * unaffected. Brain Lock's Critical ends the spell. Banishment's stuns
 * the CASTER. Charm Kind's leaves the target aware it was attacked.
 * Apocalypse's makes it immune to the rest of the casting — and its
 * `saveLadder`, which walks DOWN to the nearest printed rung instead,
 * was already handing a Heroic the Critical's 2d6. So a perfect save
 * took the damage and the card did not say the target was now immune:
 * the two halves of one spell reading the same roll two ways.
 *
 * Declared rather than inferred. "Beating the best printed outcome
 * should beat it" is the rule `spell-degrees.mjs` states, and these four
 * are where beating it has consequences worth printing.
 */

const EDITS = {

  /* ─── R1: the thirteen condition ladders ─────────────────────────── */

  "Blindness": (y) => {
    y.effects = [
      cond("blinded", ["success"], { duration: "1 round" }),
      cond("blinded", ["failure"], { duration: "1 minute" }),
      // "permanent" parses to no timing at all, which is what permanent
      // means: nothing sweeps it and only a rule that removes blindness
      // will. Measured rather than assumed — parseSpellDuration returns
      // null for it, exactly as it does for "varies" and "see below".
      cond("blinded", ["fumble"], { duration: "permanent" }),
      note("The target is then immune to this casting of the spell for 1 hour.")
    ];
  },

  "Brain Lock": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      // BOTH RUNGS, because the page's Fumble is "as failure except…".
      cond("stunned", ["failure", "fumble"], { value: 3 }),
      cond("paralyzed", ["fumble"]),
      say(["critical", "heroic"], "Unaffected — and the spell ends."),
      note("You must Sustain the Spell each round, which forces the target to make a new saving throw.")
    ];
  },

  "Confusion": (y) => {
    y.effects = [
      cond("stunned", ["success"], { value: 1 }),
      cond("confused", ["failure", "fumble"], { duration: "1 minute" }),
      say(["failure"], "It can attempt a new save at the end of each of its turns to end the confusion."),
      say(["fumble"], "No save to end it early.")
    ];
  },

  "Cognitive Collapse": (y) => {
    y.effects = [
      cond("dazed", ["success"], { value: 2, duration: "1 round" }),
      cond("dazed", ["failure"], { value: 4 }),
      say(["fumble"],
        "The target's intellect is PERMANENTLY reduced: all mental ability scores fall to -5 and it loses every class ability requiring mental faculties, including all spellcasting. A PC becomes an NPC under the GM's control."),
      note("This curse can be removed only by remove curse or another effect that removes curses.")
    ];
  },

  "Calm": (y) => { y.effects = calmRungs(); },
  "Calm Animal": (y) => { y.effects = calmRungs(); },

  "Charm Animal": (y) => {
    y.effects = [
      ...charmRungs(),
      note("The spell ends if you use hostile actions against the target. Its save takes a +4 circumstance bonus if you or your allies recently threatened it.")
    ];
  },

  "Charm Kind": (y) => {
    y.effects = [
      ...charmRungs(),
      say(["critical", "heroic"], "Unaffected — and aware that you tried to charm it."),
      say(["success"], "Unaffected, and believes the spell was something harmless rather than a charm, unless it identifies the spell."),
      note("The spell ends if you use hostile actions against the target. Its save takes a +4 circumstance bonus if you or your allies recently threatened it.")
    ];
  },

  "Cloak Of Greying": (y) => {
    // "AS SUCCESS, BUT…" — each failing rung carries the success
    // sentence as well as its own addition, because a card printing only
    // the addition describes half of what happened to the target.
    y.effects = [
      say(["success"], "Aware of your presence, but will not directly interact with you unless given reason to (GM discretion); unlikely to remember you were there."),
      say(["failure"], "Aware of your presence but ignores you entirely unless you attack."),
      say(["fumble"], "Cannot sense you at all. If you attack, it may save again at -20 to resist.")
    ];
  },

  "Command": (y) => {
    y.effects = [
      say(["failure"], "For the FIRST action on its next turn, it must use a single action to do as commanded."),
      say(["fumble"], "It must use ALL its actions on its next turn to obey the command."),
      note("The target can't Delay or take reactions until it has obeyed.")
    ];
  },

  "Banishment": (y) => {
    y.effects = [
      say(["critical", "heroic"], "Resists being banished — and YOU are stunned 1."),
      say(["failure"], "Banished to its home plane."),
      say(["fumble"], "Banished, and barred from returning to this plane by any means for 1 week."),
      note("The spell fails if you aren't on your home plane when you cast it.")
    ];
  },

  /*
   * R10 — BUNGLE, and it is the one ladder here with FOUR failing rungs
   * rather than three. "Blunder: the target fails the action" is not a
   * larger penalty, it is a different outcome, so the Blunder has to be
   * declared: leave it out and rule 1's remapping reads it at the Fumble
   * rung and applies -4 to an action the page says simply fails.
   */
  "Bungle": (y) => {
    y.effects = [
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "circumstance",
        value: -2, onSave: ["failure"] },
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "circumstance",
        value: -4, onSave: ["fumble"] },
      say(["failure"], "-2 circumstance penalty to the action it is attempting."),
      say(["fumble"], "-4 circumstance penalty to the action it is attempting."),
      say(["blunder"], "The target FAILS the action outright."),
      // THE PENALTY IS TO ONE ACTION, NOT TO ATTACKS IN GENERAL. The
      // attack pool is the nearest thing the sheet holds, and it is
      // exactly right whenever the interrupted action is a Strike. Said
      // on the card rather than left for a GM to discover mid-round.
      note("Reaction, triggered when a creature takes an action you are aware of. The penalty applies to THAT action — it is placed in the attack pool, which is exact for a Strike and wants moving by hand for anything else.")
    ];
  },

  /*
   * CLONE IS NOT A SAVE LADDER AT ALL, and that is why it carries plain
   * notes. Its four outcomes hang off the CASTING CHECK, made months
   * after the cast — "make your casting check at the end of the growth
   * process" — while `onSave` rows are matched against saving-throw
   * results. Gated rows on a spell with no save would match nothing and
   * print nothing, which is the silent-nothing shape this project keeps
   * finding. So the ladder is printed in full, for the person who will
   * be reading this card in 1d6+1 months.
   */
  "Clone": (y) => {
    y.effects = [
      note("Resolved by your CASTING CHECK at the end of the growth, not by a saving throw. <strong>Critical</strong>: the clone is sound, and when the soul occupies it the body is Injured 2 for 1 week — unremovable and unreducible until the week is out. <strong>Success</strong>: as critical, but Injured 4. <strong>Failure</strong>: you fail to form the clone. <strong>Fumble</strong>: the clone appears successful but cannot hold the target's soul, and houses a malevolent intelligence instead."),
      note("Contamination or interference during the 1d6+1 months of growth makes the maximum result a failure.")
    ];
  },

  /* ─── R1: the two ladders that scale DAMAGE ──────────────────────── */

  "Apocalypse": (y) => {
    y.effects = [
      {
        kind: "saveLadder", target: "targets", damageType: "mental",
        ladder: { critical: "2d6", success: "2d6", partial: "2d6", failure: "4d6", fumble: "4d6" },
        criticalOn: { partial: "minor", failure: "serious", fumble: "deadly" }
      },
      say(["critical", "heroic"], "Realises the events are not real, and is immune to this casting."),
      say(["success", "partial"], "Must make a fresh saving throw at the beginning of its next turn."),
      say(["failure"], "May make a fresh saving throw at the beginning of its next turn."),
      note("If every affected creature reaches a Success or better, the spell ends immediately.")
    ];
  },

  "Blight Cloud": (y) => {
    y.effects = [
      {
        kind: "saveLadder", target: "targets", damageType: "aligned",
        ladder: { critical: "", success: "2d6", partial: "3d6", failure: "3d6", fumble: "4d6" },
        criticalOn: { failure: "minor", fumble: "serious" }
      },
      // Acid Cloud — the same page's twin, and the spell `saveLadder`
      // was built for — already carries this sentence. Blight Cloud
      // prints it too and had nothing at all.
      note("Creatures within the fog are concealed, and conceal those outside from within it. The cloud may be stationary or move 10 ft. away from you each round — chosen when the spell is cast. A creature that starts its turn in the area saves again.")
    ];
  },

  /* ─── R5: the bonuses that had no row ────────────────────────────── */

  /*
   * BRAWN AND CHANNEL THE ASPECT ARE CHOICES OF FORM, and `apOptions` is
   * already exactly that — "a VARIANT CHOOSER", as ap-scale.mjs records
   * it — used by fourteen spells and by Barkskin on this very page. So
   * neither needs a new mechanism: the caster is asked which, and the
   * chosen mode's own effects are the ones applied. A `chooseFrom` list
   * was the other candidate and is worse: it settles a SLOT for one
   * bonus, and Channel The Aspect's four aspects are not one bonus in
   * four places — one of them is an extra action.
   *
   * NO `range` KEY ON ANY MODE. `effRange = apMode?.range ?? range` uses
   * `??`, so an empty string REPLACES the spell's printed range instead
   * of falling through to it — which is what Barkskin's mode has been
   * quietly doing to its "touch" since it was authored. Omitting the key
   * is what makes the fallthrough happen.
   */
  "Brawn": (y) => {
    y.effects = [];
    y.modeLabel = "Ability";
    y.modePrompt = "Brawn enhances one physical ability score. Choose which:";
    y.apOptions = ["strength", "dexterity", "constitution"].map((slot) => ({
      ap: 2,
      label: `${slot[0].toUpperCase()}${slot.slice(1)} +1 status (warping: +4 PP each, max +4)`,
      // `note` IS A SCOPE QUALIFIER, NOT THE SPELL'S NAME. `effectName`
      // builds "<spell> <note>", so `note: "Brawn"` put "Brawn Brawn" on
      // the sheet — seen live. Zealous Conviction's "(vs mental
      // effects)" is the shape: it says WHICH of the spell's several
      // things this effect is.
      effects: [{ kind: "bonus", target: "targets", slot, value: 1, bonusType: "status",
        note: `(${slot[0].toUpperCase()}${slot.slice(1)})` }]
    }));
  },

  "Channel The Aspect": (y) => {
    y.effects = [];
    y.modeLabel = "Aspect";
    y.modePrompt = "Channel The Aspect grants one aspect of your deity. Choose which — you may change it later for 1 AP (manipulate):";
    y.apOptions = [
      {
        ap: 2, label: "Body — +4 status to Fortitude saves and Swim (Athletics)",
        effects: [
          { kind: "bonus", target: "self", slot: "fortitude", value: 4, bonusType: "status", note: "(Body)" },
          { kind: "bonus", target: "self", slot: "athletics", value: 4, bonusType: "status", note: "(Body)" },
          { kind: "note", text: "The Athletics bonus is for SWIM checks only — take it off any other use of the skill." }
        ]
      },
      {
        ap: 2, label: "Limbs — quickened, for Move or Strike only",
        // NO BONUS ROW, DELIBERATELY. Quickened grants an action, and
        // "only for a Move or a Strike" is a restriction on how that
        // action may be spent which nothing in the engine can enforce. A
        // row granting the action without the restriction would not be a
        // partial rule, it would be a wrong one.
        effects: [{ kind: "note", text: "You are QUICKENED for the duration, but the additional action may be used only for a Move or a Strike. Apply the extra action by hand." }]
      },
      {
        ap: 2, label: "Mind — +4 status to Recall Knowledge and Awareness (Perception)",
        effects: [
          { kind: "bonus", target: "self", slot: "perception", value: 4, bonusType: "status", note: "(Mind)" },
          { kind: "note", text: "The +4 also covers Recall Knowledge — which skill that is depends on the subject, so it is taken by hand." }
        ]
      },
      {
        ap: 2, label: "Spirit — +4 status to Will saves and Demoralise (Intimidate)",
        effects: [
          { kind: "bonus", target: "self", slot: "will", value: 4, bonusType: "status", note: "(Spirit)" },
          { kind: "bonus", target: "self", slot: "intimidate", value: 4, bonusType: "status", note: "(Spirit)" },
          { kind: "note", text: "The Intimidate bonus is for DEMORALISE — take it off any other use of the skill." }
        ]
      }
    ];
  },

  /*
   * BARKSKIN WAS ALREADY AUTOMATED and the audit missed it: its +1 has
   * lived in an `apOption` on the `naturalArmourFlat` slot since it was
   * authored. The only thing wrong with it is the empty `range` key
   * described above, which has been blanking the printed "touch".
   */
  "Barkskin": (y) => {
    y.apOptions = (y.apOptions ?? []).map(({ range, area, ...rest }) => ({
      ...rest,
      // AND ITS `note` WAS THE SPELL'S OWN NAME, so the sheet has read
      // "Barkskin Barkskin" since it was authored. Same fix as Brawn's,
      // found the same way — by looking at an effect after casting it.
      effects: (rest.effects ?? []).map((e) => e.note === "Barkskin"
        ? { ...e, note: "(natural armour)" } : e)
    }));
  },

  /*
   * BREEZE, CONCEAL THOUGHTS AND CLARITY ARE CONDITIONALS — a number
   * consulted for one kind of roll rather than added to a total. What
   * each is scoped to is something the dice cannot see ("against severe
   * heat", "any attempt to read your mind"), so neither Breeze nor
   * Conceal Thoughts is `auto`: the row is OFFERED in the roll dialog,
   * unticked, which is the pattern conditionals.mjs records for exactly
   * this case. Clarity IS auto, because its scope is a trait the save
   * context already carries.
   */
  "Breeze": (y) => {
    y.effects = [
      {
        kind: "conditional", label: "Breeze", target: "targets",
        grants: [{
          kind: "modifier", value: 2, bonusType: "circumstance", label: "Breeze",
          scope: "saves against very hot conditions, severe heat, breath weapons, and cloud vapours or gases",
          when: { checkTypes: ["save"] }
        }]
      },
      note("Does not function without air, or underwater. Casting it again dispels the previous casting.")
    ];
  },

  "Conceal Thoughts": (y) => {
    y.effects = [{
      kind: "conditional", label: "Conceal Thoughts", target: "targets",
      grants: [
        { kind: "modifier", value: 2, bonusType: "circumstance", label: "Conceal Thoughts",
          scope: "Deception checks against a Sense Motive discerning your true intentions",
          when: { checkTypes: ["skill"], subjects: ["deception"] } },
        { kind: "modifier", value: 4, bonusType: "circumstance", label: "Conceal Thoughts",
          scope: "saving throws against any attempt to read your mind",
          when: { checkTypes: ["save"] } }
      ]
    }];
  },

  "Clarity": (y) => {
    y.effects = [
      {
        kind: "conditional", label: "Clarity", target: "targets",
        grants: [{
          kind: "advantage", label: "Clarity",
          scope: "the next mental saving throw made within the duration",
          // AUTO, because this scope IS visible to the dice: a save
          // against a Mental-trait effect is a fact the save context
          // carries, which is how Courage reads `fear`.
          when: { checkTypes: ["save"], traits: ["mental"] }, auto: true
        }]
      },
      note("The spell ends once that saving throw has been made — dismiss it then; nothing counts the use for you.")
    ];
  },

  /*
   * THREE THAT GET AN ACCURATE NOTE AND NOTHING MORE, because what they
   * change is not modelled anywhere in the system and inventing half of
   * it here would be worse than saying so. Each note names the gap
   * rather than describing the spell vaguely: a gap named is a gap
   * somebody can close.
   */
  "Beast Of Burden": (y) => {
    y.effects = [note("The target's carrying capacity DOUBLES for the duration; its actual Strength is unchanged. The system tracks no carrying capacity, so this is applied at the table.")];
  },

  "Breeze Strike": (y) => {
    y.effects = [note("You ignore the first -4 worth of range penalties on ranged attacks (warping: +1 PP each, max -10) and gain one additional range increment. The attack workflow applies range penalties but nothing can yet waive them, so this comes off the roll by hand.")];
  },

  "Anticipate Casting": (y) => {
    y.effects = [note("The NEXT spell you cast within the duration has its AP cost lowered by 1 (minimum 1), and this spell then ends. Deduct the action by hand — a spell's AP cost is settled at the cast and nothing yet carries a discount into it.")];
  },

  /* ─── R7 / R8 and the two warps that had a key behind them ───────── */

  /*
   * R8 — BLINK'S SUSTAIN BUYS A BLINK, NOT MORE TIME, which is the
   * `"round"` sustainType: as emanation-growth.mjs puts it, those spells'
   * "duration is their own, and a Sustain buys the thing their text
   * names". The pack had Blink as an unsustained spell entirely, so the
   * Sustain its own description describes could not be taken at all.
   *
   * THE RESISTANCE IS A REAL ROW, not a note. "all damage except force"
   * is a form `defences.mjs` parses exactly — ALL_DAMAGE_EXCEPT — so the
   * resistance halves every type but force without anybody reading the
   * card.
   */
  "Blink": (y) => {
    y.sustained = true;
    y.sustainType = "round";
    y.sustainChoices = [{
      key: "blink",
      label: "Vanish and reappear 10 feet away, in a random direction",
      note: "vanishes and reappears 10 feet away in a random direction; the movement triggers no reactions"
    }];
    y.effects = [
      { kind: "defence", target: "self", field: "resistance", value: "all damage except force" },
      note("You also vanish and reappear as above at the END of each of your turns, without spending the Sustain.")
    ];
  },

  /*
   * R7 — BALL LIGHTNING. The +4 PP warp is a second ball with its own
   * target: two creatures, each taking 6d8 against its own basic Reflex.
   * That is the half with rails under it; the per-turn redirection is
   * the other half and has none — see the release notes.
   *
   * `targetCap: 2`, NOT `extraTargets: 1`, AND THE RATCHET IS WHY.
   *
   * It was authored as an increment first, and `verify-warp-repeats`
   * caught it: `extraTargets` is multiplied by `times`, so the option
   * moved from the one-shot bucket into "no printed ceiling" and the
   * chooser would have drawn a count box a caster could keep feeding —
   * four balls, six balls, as far as the PP held out.
   *
   * The page does not allow that, and says so in one word: "create an
   * additional ball which must have a different target, you may direct
   * BOTH balls each turn." Both. Two. `targetCap` is a TOTAL and is
   * deliberately not multiplied by `times` — a total bought twice is the
   * same total — so it is both the right number and the right shape, and
   * the warp stays the checkbox it should always have been.
   */
  "Ball Lightning": (y) => {
    // THE MODS ARE REPLACED, NOT SPREAD. This read
    // `{ ...(w.mods ?? {}), targetCap: 2 }`, and an earlier run of this
    // script had already written `extraTargets: 1` there — so the spread
    // carried the key I was replacing straight back in, the warp went on
    // scaling, and `verify-warp-repeats` went on failing while the
    // source said the right thing. That is block 24's stale `sizeSteps`
    // exactly, in the file whose header claims to have learned from it.
    // These warps are ours entirely; the page prints one option and this
    // states the whole of it.
    y.warps = (y.warps ?? []).map((w) => w.ppCost === 4
      ? { ...w, mods: { targetCap: 2 } } : w);
    y.effects = [note("At the start of each of your turns you may, as a FREE action, direct the ball at a new target within range or have it strike the current target again: 6d8 electricity, basic Reflex. Cast the strike again from the spell card each turn — the turn clock does not yet offer it.")];
  },

  /*
   * R2 — CALL ITEM's warp is the one other inert warp with a real key
   * behind it. "Free" rather than 0: `castTimeAP` returns null for a
   * label it cannot read as a number, and null means "outside the AP
   * economy, and castable during a fight", which is what a free action
   * is. A 0 would be a number, and a number gets measured against the
   * pool.
   */
  "Call Item": (y) => {
    y.warps = (y.warps ?? []).map((w) => w.ppCost === 1
      ? { ...w, mods: { castApSet: "Free" } } : w);
  },

  /*
   * R6 — ANTIMAGIC FIELD. The reading the audit asked about is settled
   * by the page's own closing sentence: "at the end of the spell's
   * duration, all magic continues to function as before". Nothing is
   * ended; what is inside is switched off and switched back on. See
   * magic/antimagic.mjs.
   *
   * THE AREA ALREADY SAYS "emanation", so the field follows its caster
   * and knows who is inside it without anything else being authored.
   */
  "Antimagic Field": (y) => {
    y.effects = [
      { kind: "antimagic", label: "Antimagic Field" },
      note("Spell effects on anyone inside are SUPPRESSED, not ended — they resume unchanged when the field drops or the creature steps out. THREE THINGS ARE NOT SWITCHED OFF: a CONDITION a spell already inflicted (a blindness or a stun is a state the creature is in, not magic being sustained on it), a creature's innate magical abilities, and an item's enchantment. Those stay with the GM.")
    ];
  },

  /* ─── R3 and R4: Aura Of Vitality ────────────────────────────────── */

  "Aura Of Vitality": (y) => {
    /*
     * R3 — the page prints `Area 20' radius (B)` and the pack lost the
     * mark. Since 3.585.0 made (B) functional this spell has been
     * failing to breach, which is the whole reason Graham said fix it.
     *
     * "EMANATION" IS KEPT. The word is the system's own for a
     * caster-centred area and the live-emanation machinery keys on it;
     * what went missing was the mark, not the noun. Replacing it with
     * the page's "radius" would fix the audit's sentence and break the
     * spell.
     */
    y.area = "20-foot emanation (B)";
    // R4 — Core 3.7 renamed persistent damage to RECURRING, and this
    // entry still says the old word in its description, its note and its
    // warp text.
    const fix = (s) => String(s ?? "")
      .replace(/\bpersistent\b/g, "recurring")
      .replace(/\bPersistent\b/g, "Recurring");
    y.description = fix(y.description);
    y.effects = (y.effects ?? []).map((e) => e.kind === "note" ? { ...e, text: fix(e.text) } : e);
    y.warps = (y.warps ?? []).map((w) => ({ ...w, text: fix(w.text) }));
  }
};

const db = new ClassicLevel("packs/spells", { valueEncoding: "json" });
await db.open();
const done = [];
for await (const [key, value] of db.iterator()) {
  if (!Object.prototype.hasOwnProperty.call(EDITS, value?.name)) continue;
  EDITS[value.name](value.system);
  await db.put(key, value);
  done.push(value.name);
}
await db.close();

console.log(`authored ${done.length}: ${done.sort().join(", ")}`);
const missing = Object.keys(EDITS).filter((n) => !done.includes(n));
if (missing.length) {
  console.error(`MISSING from the pack: ${missing.join(", ")}`);
  process.exit(1);
}
