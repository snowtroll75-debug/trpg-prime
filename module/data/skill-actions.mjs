/**
 * Skill Actions (Core 3.1, Chapter 4). Static system data, organised the
 * way the rulebook organises it: attached to the skill(s) that invoke
 * them, surfaced through a small selector when the player rolls that
 * skill (Generic Check, or one of the actions listed here) rather than
 * living as separate draggable items.
 *
 * General Skill Actions are "usable with several different skills" —
 * represented here with a `skills` array rather than one fixed skill, so
 * the same entry appears correctly under every skill that can invoke it.
 * The skill actually clicked through is what the check rolls against;
 * these entries carry no skill of their own.
 *
 * Complete: 96 actions covering all 26 skills, 90 of them with structured
 * outcomes. This header used to say the file
 * held Acrobatics and five General Skill Actions and that everything else
 * was deferred — true when it held ten, and quietly wrong for a long time
 * after. "Deferred" now describes only the five General Skill Actions
 * that are standalone subsystems rather than checks (Create, Earn Income,
 * Learn a Spell, Study Target, Spell Concentration) — each still has an
 * entry here for its selector/outcome text, but its actual mechanics live
 * in dedicated code the entry's `key` hooks into. Learn a Spell (3.230.4)
 * was the last of these left unbuilt, waiting since 3.15.0 on a Spell
 * Library concept the Wizard's Spellbook (3.230.3) finally supplied.
 *
 * Having an entry here is not the same as being automated. Roughly a
 * third of these have code that keys off them; the rest roll the check,
 * print the matched outcome and spend the AP, which for many of them is
 * all the rulebook asks for.
 */

/**
 * Trained-action proficiency tiers (Chapter 4 skill tables — see
 * trg_prime_skill_action_extract). An action listed among a skill's *Trained
 * Actions* requires the character to be trained (at least 1 rank) in the skill
 * they invoke it through; the gate lives in `resolveAction`
 * (`module/combat/action-workflow.mjs`). Actions omitted here are Untrained
 * and are never gated.
 *
 * The tier is a property of the action, consistent across every skill it can
 * be invoked from — the general actions carry one tier apiece (Recall
 * Knowledge and Subsist Untrained; Research, Study Target, Create, Identify
 * Power, Transfer Runes, Earn Income, Learn a Spell Trained), and each
 * skill-specific action
 * inherits its skill's classification. Stamped onto `SKILL_ACTIONS` at load
 * (each matching entry gains `proficiency: "trained"`) so the one Set below is
 * the single, auditable source that mirrors the rulebook table.
 *
 * Not in the book's per-skill lists, so deliberately left Untrained/ungated:
 * `extendRage` and `refocus`. Extend Rage is only reachable while already
 * raging (which needs the trained Invoke Rage), and Refocus recovers a Focus
 * ability rather than being a Mental-Focus-trained check — gating either would
 * only ever block a case the book doesn't. `spatialAwareness` is Mental
 * Focus's one genuinely Untrained action. ("Sense Power" in the table is this
 * data's two Sense Power actions.)
 */
export const TRAINED_ACTION_KEYS = Object.freeze(new Set([
  // General Skill Actions (Trained under every skill that invokes them)
  "research", "earnIncome", "identifyPower", "studyTarget", "create", "transferRunes", "learnSpell",
  // Acrobatics
  "aerialManoeuvre", "catfall", "kipUp", "nimbleCrawl",
  // Athletics (Swim only — Force Open / High Jump / Long Jump are Untrained)
  "swim",
  // Climbing (Grab an Edge only — Climb is Untrained)
  "grabAnEdge",
  // Crafting (Create / Research / Study Target are general, above)
  "identifyAlchemy", "repair",
  // Deception (Aggravate / Bluff / Create a Diversion are Untrained)
  "disguise", "feint",
  // Diplomacy (Encourage / Gather Information / Make an Impression / Request Untrained)
  "barterSelling", "barterPurchasing", "command", "rally",
  // Handle Animal (Mount / Dismount is Untrained)
  "commandAnAnimal", "expressRider", "guideWithKnees", "stayInSaddle", "trainAnimal",
  // Linguistics
  "createForgery", "decipherWriting", "discernSecretMessage",
  // Medicine (First Aid / Resuscitation / Recall Knowledge are Untrained)
  "treatDisease", "treatInjury", "treatToxin", "treatWounds",
  // Meditation (every action is Trained)
  "cleansingTrance", "clearMind", "healingTrance", "powerRecovery",
  // Mental Focus (Spatial Awareness is Untrained; extendRage/refocus ungated — see note).
  // spellConcentration is General (Trained) and also listed under Power Manipulation.
  "invokeRage", "painTolerance", "revokeRage", "stunnedManoeuvre", "spellConcentration",
  // Power Manipulation (every action is Trained — all require Adept)
  "dispel", "rechargeItem", "senseMagicBroad", "senseMagicFocused", "sigil",
  // Sense Motive (Detect Deception / Pierce Disguise are Untrained)
  "readEmotion", "senseMentalEffect",
  // Stealth (Conceal an Object / Hide / Sneak are Untrained)
  "ambush", "sniping",
  // Survival (Sense Direction / Subsist are Untrained)
  "coverTracks", "gatherHerbs", "track",
  // Thievery (Pick Pocket / Trickery are Untrained)
  "disableADevice", "pickLock",
  // Nature, Survival, Occultism, Religion: a peril's own disabling skill
  // (Chapter 12, page 397; 3.620.0), Trained as Disable Device is.
  "disablePeril"
]));

const RAW_SKILL_ACTIONS = [
  // --- Acrobatics -----------------------------------------------------
  {
    key: "arrestAFall",
    name: "Arrest a Fall",
    skills: ["acrobatics"],
    traits: "",
    apCost: "Reaction",
    trigger: "You fall",
    requirements: "You have a fly speed.",
    requirement: "combat.movement.fly",
    checkType: "skill",
    against: "fixed",
    fixedDC: 25,
    outcomes: {
      heroic: "",
      critical: "",
      success: "You fall without taking damage.",
      partial: "",
      failure: "You fall normally.",
      fumble: "",
      blunder: ""
    },
    description: "You twist and turn to slow your fall. DC 25, adjusted for favourable or unfavourable conditions."
  },
  {
    key: "balance",
    name: "Balance",
    skills: ["acrobatics"],
    traits: "Movement",
    apCost: "1",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You move up to your Speed.",
      success: "You move up to your Speed, treating it as difficult terrain.",
      partial: "",
      failure: "You must remain stationary to keep your balance (wasting the action) or you fall. If you fall, your turn ends.",
      fumble: "You fall and your turn ends.",
      blunder: ""
    },
    description: "Navigate a narrow surface or uneven ground. You are flat-footed whilst on such terrain. The DC is set by the GM based on the terrain."
  },
  {
    key: "hover",
    name: "Hover",
    skills: ["acrobatics"],
    traits: "Movement",
    apCost: "Free",
    requirements: "You have a fly speed.",
    requirement: "combat.movement.fly",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You hover in place as a Free Action.",
      partial: "",
      failure: "You must expend an action to hover as normal.",
      fumble: "",
      blunder: ""
    },
    description: "Attempt to hover without expending an action (or spend 1 AP to hover in place without a check)."
  },
  {
    key: "squeeze",
    name: "Squeeze",
    skills: ["acrobatics"],
    traits: "Movement",
    // Per Graham: Squeeze has no AP cost at all. How long it takes is the
    // result of the check — 10 feet per round on a critical, down to 10
    // or 5 feet per minute — so the cost is genuinely variable rather
    // than absent, and "Varies" is what the rest of the file calls that.
    // It was an empty string, which reached spendActionCost and the card
    // subtitle as nothing; briefly and wrongly set to 1 before Graham
    // corrected it.
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You squeeze through the tight space at a speed of 10' per round.",
      success: "You squeeze through at a speed of 10' per minute.",
      partial: "You squeeze through at a speed of 5' per minute.",
      failure: "You fail to make any progress but may make another attempt in one minute.",
      fumble: "You wedge yourself in, becoming Immobilised to all actions except this one, which you may retry after 1 minute. You become unstuck if a later check is a failure or better; another fumble means you can't get free without assistance. A successful Aid check from another creature allows further attempts.",
      blunder: ""
    },
    description: "Reserved for exceptionally tight, restrictive spaces — twisting, bending and compressing your body through a confined space. The rulebook does not state an AP cost for this action; GM discretion."
  },
  {
    key: "tumble",
    name: "Tumble",
    skills: ["acrobatics"],
    traits: "Movement",
    apCost: "1",
    checkType: "skill",
    against: ["skillDC:acrobatics", "fortitudeDC"],
    outcomes: {
      heroic: "",
      critical: "You move through the enemy's space, treating its squares as normal movement. If you lack the Speed to move all the way through, your movement ends but you don't trigger reactions.",
      success: "You move through the enemy's space, treating its squares as difficult terrain. If you lack the Speed to move all the way through, treat it as a Failure.",
      partial: "",
      failure: "Your movement ends, and you trigger reactions as if you had moved out of the square you started in.",
      fumble: "As Failure, and you also fall prone.",
      blunder: ""
    },
    description: "Take a Stride action as part of this action, attempting to move through an enemy's threatened area or space without provoking a reaction, rolled against the enemy's Fortitude DC or Acrobatics DC, whichever is higher. The DC is increased by 2 if moving through the enemy's own space."
  },
  {
    key: "aerialManoeuvre",
    name: "Aerial Manoeuvre",
    skills: ["acrobatics"],
    traits: "Movement",
    apCost: "1",
    requirements: "You have at least 1 rank in Acrobatics.",
    requirement: "skills.acrobatics.ranks",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "Your manoeuvre is successful.",
      partial: "",
      failure: "Your manoeuvre fails; the GM determines what this means for you.",
      fumble: "As Failure, but the consequences have repercussions.",
      blunder: ""
    },
    description: "Attempt a challenging manoeuvre whilst airborne. The GM determines which manoeuvres are feasible. Chapter 8 grants this independently of a fly speed — 'Additionally, if you have at least 1 rank in the Acrobatics skill, you can use the Aerial Manoeuvre action' — distinct from Arrest a Fall/Fly/Hover, which do require a fly speed."
  },
  {
    key: "catfall",
    name: "Catfall",
    skills: ["acrobatics"],
    traits: "Movement",
    apCost: "Reaction",
    checkType: "skill",
    against: "fixed",
    fixedDC: 30,
    outcomes: {
      heroic: "",
      critical: "You reduce the fall by an amount of feet equal to your Acrobatics skill bonus x5. If this reduces the distance fallen below 10 feet, you take no damage and land on your feet.",
      success: "You reduce the fall by an amount of feet equal to your Acrobatics skill bonus x2. If this reduces the distance fallen below 10 feet, you take no damage and land on your feet.",
      partial: "You reduce the fall by an amount equal to your Acrobatics skill bonus.",
      failure: "You fall normally.",
      fumble: "You twist in a bizarre fashion and overcomplicate the fall. The fall distance is doubled for damage purposes.",
      blunder: ""
    },
    description: "Reduce the severity of a fall by twisting your body and landing precisely."
  },
  {
    key: "kipUp",
    name: "Kip Up",
    skills: ["acrobatics"],
    // MOVEMENT, as page 76 prints it — restored at 3.557.0. It was the one
    // difference in the twenty-three actions on pages 75-80 whose traits
    // and AP were compared against the book, and it had no mechanical
    // bite at the time it was found: the movement Attack of Opportunity
    // fires from a token actually moving rather than from this trait, and
    // Full Defence's "a single Movement action" allowance exempts Free
    // actions — which Kip Up is — before it ever reads the trait line.
    // Restored anyway. Twice in the preceding fortnight a trait that
    // "happened not to matter yet" was the thing a later rule then read.
    traits: "Movement",
    apCost: "Free",
    checkType: "skill",
    against: "fixed",
    fixedDC: 20,
    outcomes: {
      heroic: "",
      critical: "",
      success: "You spring to your feet in a flash without triggering a reaction.",
      partial: "",
      failure: "You stand normally.",
      fumble: "You freeze, failing to move and wasting 1 AP.",
      blunder: ""
    },
    description: "Attempt to stand up from Prone without using an action or triggering a reaction."
  },
  {
    key: "nimbleCrawl",
    name: "Nimble Crawl",
    skills: ["acrobatics"],
    traits: "Movement",
    apCost: "1",
    requirements: "You are prone and your Speed is at least 10 feet.",
    checkType: "skill",
    against: "fixed",
    fixedDC: 20,
    outcomes: {
      heroic: "",
      critical: "You move up to your Speed.",
      success: "You move up to your Speed, treating it as difficult terrain (every 5 feet costs 10 feet of movement).",
      partial: "",
      failure: "You crawl normally.",
      fumble: "You freeze, failing to move.",
      blunder: ""
    },
    description: "Attempt to crawl incredibly swiftly."
  },
  {
    key: "escape",
    name: "Escape",
    // Acrobatics Untrained (Chapter 4 skill table), which is why Escape
    // surfaces from that skill — but ALL THREE ROUTES ARE OFFERED at
    // invocation since 3.336.0 (escape.mjs), because the rules let the
    // check be Acrobatics, Athletics or an Unarmed Attack and the third
    // of those is not a skill at all. The DC is the escaped effect's own
    // DC, which the system can't know, so `against: none` leaves it to
    // the GM. The book states only Critical, Success and Fumble.
    skills: ["acrobatics"],
    traits: "Attack",
    apCost: "1",
    requirements: "You are grabbed or immobilised.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You break free, removing the grabbed and immobilised conditions. You may immediately take any action with the Move trait, but may move no more than 5 feet.",
      success: "You break free, removing the grabbed and immobilised conditions imposed by your chosen target.",
      partial: "",
      failure: "You fail to break free.",
      fumble: "You fail to escape your target and cannot attempt to Escape again until the beginning of your next turn.",
      blunder: ""
    },
    description: "Break free of a grab, immobilisation, or similar impediment. Select the specific source imposing the grabbed or immobilised condition — a creature's grasp, magical bindings, a physical obstacle — then choose your route out — Acrobatics, Athletics or an Unarmed Attack — and roll against that effect's DC. You are asked which before the check is made. The GM sets the DC from the effect."
  },

  // --- General Skill Actions (the five that fit a plain check) --------
  {
    key: "identifyPower",
    // GRAHAM'S AMENDMENT, 16 September 2026 (pages 61-70 audit, E2): the
    // printed line became "Using either Arcana, Nature, Occultism,
    // Religion OR AN APPROPRIATE SPECIALIST SKILL". The four knowledge
    // skills stay in `skills` below and are the ordinary route; this flag
    // opens the second one, and is read by `specialistSkillActions` so
    // the next action the book opens up needs no code change.
    specialistSkills: true,
    name: "Identify Power",
    skills: ["arcana", "religion", "occultism", "nature"],
    traits: "Concentrate, Secret",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You learn all the attributes of the magic, including its name (for an effect), what it does, any means of activating it (for an item or location), and whether it is cursed.",
      success: "For an item or location, you get a sense of what it does and learn any means of activating it. For an ongoing effect, you learn its name and what it does. You can't try again hoping for a critical.",
      partial: "",
      failure: "You fail to identify the magic and can't try again for 1 day.",
      fumble: "You misidentify the magic as something else, the GM's choice.",
      blunder: ""
    },
    description: "General Skill Action — the skill matches your tradition (Arcane/Arcana, Divinity/Religion, Ethereal/Occultism, Verdant/Nature), OR an appropriate specialist skill, which you invoke by choosing this action from that specialist skill's own row. You are asked how long to spend before the roll — 10 minutes (+0), 1 minute (-2), 1 round (-5), 1 AP (-10) — and the modifier is applied for you. The GM sets the difficulty; an interrupted attempt must restart."
  },
  {
    key: "recallKnowledge",
    name: "Recall Knowledge",
    // "linguistics" added 3.337.0 — Chapter 4 lists Recall Knowledge
    // (untrained) and Research (trained) among Linguistics' own actions,
    // and the skill was missing from both. A character who put their
    // ranks into Linguistics could not invoke either from it, and
    // Linguistics is the skill a player reaches for to recall what a
    // script says or to research a text.
    skills: ["arcana", "artistry", "crafting", "culture", "linguistics", "medicine", "nature", "occultism", "planes", "religion"],
    traits: "Concentrate",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You recall the knowledge accurately and gain additional information or context.",
      success: "You recall the knowledge accurately, or gain a useful clue about your current situation.",
      partial: "",
      failure: "",
      fumble: "You recall incorrect information, or gain an erroneous or misleading clue.",
      blunder: ""
    },
    description: "General Skill Action — remember useful information on a topic related to the skill you invoke this from. The GM determines the difficulty and which skills apply; time spent modifies the DC at GM discretion."
  },
  {
    key: "research",
    name: "Research",
    // "linguistics" added 3.337.0 — see Recall Knowledge above.
    skills: ["arcana", "artistry", "crafting", "culture", "linguistics", "medicine", "nature", "occultism", "planes", "religion"],
    traits: "Concentrate",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You uncover highly valuable or rare information, learn hidden truths, or discover something that significantly changes your understanding. You may gain an advantage or resource related to the research (GM discretion).",
      success: "You gather solid, accurate information and form a clearer picture of the topic, resolving your inquiry or helping progress a related task.",
      partial: "",
      failure: "",
      fumble: "You misinterpret the data, consult biased or incorrect sources, or draw flawed conclusions, leading to a misleading or unproductive result.",
      blunder: ""
    },
    description: "General Skill Action — dedicate significant time to investigating a subject via an appropriate Lore, Knowledge, or other applicable skill, determined by the GM based on method and topic. Takes considerably longer than Recall Knowledge and can be part of a downtime activity."
  },
  {
    key: "studyTarget",
    name: "Study Target",
    // A "General Skill Action (Trained)" invoked through the knowledge skill
    // that fits the subject — the same six skills that drive its capacity —
    // plus Crafting, which lists Study Target among its own trained actions
    // (so via Crafting it needs a Crafting specialty, per 3.108.0). Capacity
    // is unchanged; the invoked skill only supplies the check bonus.
    // No DC or difficulty is stated, so the GM sets the DC and it defaults
    // to Medium (Difficulty Modifier Table). The time-spent modifiers
    // (1 round −2, 1 minute +0, 10 minutes +2, 1 hour +5) are offered as a
    // pre-roll choice by the workflow.
    skills: ["arcana", "crafting", "culture", "nature", "occultism", "planes", "religion"],
    traits: "Concentrate",
    apCost: "1 minute",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "Your target is considered 'Studied'.",
      partial: "",
      failure: "You have failed to study the target but may try again.",
      fumble: "You believe that you have studied the target correctly, but something has gone wrong. When you cast a spell that links to this studied target later, things will not go according to plan (GM discretion).",
      blunder: ""
    },
    description: "Memorise a person, place, or thing in detail so that later spells or abilities may impersonate, travel to, or summon that specific target. You may hold Studied Targets equal to your Int + level, plus one for every 5 combined ranks across the knowledge skills (Arcana, Culture, Nature, Occultism, Planes, Religion). Spend more or less time for a modifier: 1 round -2, 1 minute +0, 10 minutes +2, 1 hour +5."
  },
  {
    key: "create",
    name: "Create",
    // A General Skill Action (Trained), Manipulate. The item type decides
    // which of these skills can make it (Core Table); the workflow filters
    // the offered types to the invoked skill. GM sets the DC (against: none);
    // via Crafting it needs a Crafting specialty (crafting's trainedActions
    // include "create", 3.108.0). Multi-day project tracked by
    // create-crafting-workflow.mjs.
    skills: ["crafting", "nature", "arcana", "occultism", "religion"],
    traits: "Manipulate",
    apCost: "Varies (per day)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You do competent work — ranks × item level × the success modifier in gold pieces per day, until the total meets the item's value.",
      partial: "You do average work — ranks × item level in gold pieces per day. Continue daily, or make another check tomorrow.",
      failure: "You struggle and waste a day of work. You may make another check the following day.",
      fumble: "Your work is truly shoddy. After 1d6 days you realise the project has failed; the raw materials are ruined and you must begin again.",
      blunder: ""
    },
    description: "Make an item from a formula and raw materials over one or more days. Requires ranks in the skill ≥ the item's level, the formula, tools (and often a workshop), the mundane specialty or the required feat, and raw materials worth at least half the item's Price. One check at the start sets your rate; Success earns ranks × item level × a success modifier (by how far you beat the DC) in gp/day, Partial a flat ranks × item level, until the total meets the Price. Consumables and ammunition are crafted in batches; inventing a formula raises the DC by 5."
  },
  {
    key: "earnIncome",
    name: "Earn Income",
    // A General Skill Action (Trained) usable with any skill you're trained
    // in, so it's offered under every skill; the workflow enforces the
    // trained requirement on the invoked skill. The GM secretly sets the DC
    // (against: none) and assigns the task level. Income = task level ×
    // skill ranks, tracked as a multi-day task by earn-income-workflow.mjs.
    skills: [
      "acrobatics", "arcana", "artistry", "athletics", "climbing", "crafting",
      "culture", "deception", "diplomacy", "handleAnimal", "intimidate",
      "linguistics", "medicine", "meditation", "mentalFocus", "nature",
      "occultism", "perception", "perform", "planes", "powerManipulation",
      "religion", "senseMotive", "stealth", "survival", "thievery"
    ],
    traits: "",
    apCost: "Varies (per day)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You do outstanding work. Your skill ranks count as 2 higher for working out your earnings.",
      success: "You do competent work and gain earnings equal to the task level times your skill ranks.",
      partial: "You do average work and gain 50% of the earnings.",
      failure: "You do shoddy work and are paid the bare minimum — your income is divided by 10 (round down).",
      fumble: "You earn nothing and are fired immediately. You can't continue the task, and your reputation suffers.",
      blunder: ""
    },
    description: "Earn money with a trained skill while not adventuring. The GM assigns a task level and secretly sets the DC; income (gp) = task level × your skill ranks, adjusted by your result. After the first day you earn the same amount each day with no further check until the task ends (GM-set duration). Tracked as a task on your sheet — work another day or finish it from the Earn Income manager."
  },
  {
    key: "subsist",
    name: "Subsist",
    skills: ["culture", "planes", "survival"],
    traits: "",
    apCost: "8 hours",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You provide a subsistence living for yourself and one additional creature, or improve your own food and shelter to a comfortable living.",
      success: "You find enough food and shelter with basic protection from the elements for a subsistence living.",
      partial: "",
      failure: "You're exposed to the elements and don't get enough food, becoming Fatigued until you attain sufficient food and shelter.",
      fumble: "You attract trouble, eat something you shouldn't, or otherwise worsen your situation: a -2 circumstance penalty to Subsist checks for 1 week, and you find no food at all.",
      blunder: ""
    },
    description: "General Skill Action — provide food and shelter for yourself (and possibly others), typically using Culture in a settlement or Survival in the wild. Assumes at least 8 hours spent; you are asked before the roll whether you spent less (-5 circumstance) and whether you are feeding an additional person (-2 circumstance), and both are applied for you. Being circumstance penalties, taking both applies the worse of the two rather than their sum."
  },
  {
    key: "transferRunes",
    name: "Transfer Runes",
    skills: ["arcana", "religion", "occultism", "nature"],
    traits: "Magical, Manipulate, Rune",
    apCost: "10 minutes",
    requirements: "You have a runestone with an inscribed rune, an item to transfer it to, and the Magical Crafting feat.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You transfer the rune successfully.",
      partial: "You transfer the rune successfully, but a small crack appears in the runestone, rendering it useless for future rune storing.",
      failure: "The runestone cracks; both the rune and runestone are lost.",
      fumble: "As Failure, and you also destroy the item you were attempting to transfer the rune to.",
      blunder: ""
    },
    description: "General Skill Action — use one of the magical skills to transfer a magical rune from a Runestone to another item. You choose the rune, the item receiving it and the time before rolling: 1 minute raises the difficulty by 2 and 1 round by 5, and transferring from an item rather than a Runestone raises it by a further 5. The rune is moved for you on a Success, the runestone is marked cracked on a Partial, and the destruction a Failure or Fumble calls for is offered at the moment it happens — a Failure destroys the source, a Fumble the receiving item too (both items, when transferring item to item)."
  },
  {
    key: "learnSpell",
    name: "Learn a Spell",
    // The fifth and last of the deferred General Skill Action subsystems
    // (module header) — unbuilt since 3.15.0, waiting on a "Spell
    // Library" concept the Wizard's Spellbook item (3.230.3) now
    // supplies. See learn-spell.mjs for the full rule and its
    // provenance. Only ever offered under the tradition skill, gated to
    // a book-style caster (learnSpellEligible) in action-workflow.mjs —
    // the DC and any item bonus are computed dynamically from the
    // chosen spell and source, overriding this entry's own `against`.
    skills: ["arcana", "religion", "occultism", "nature"],
    traits: "Concentrate",
    apCost: "1 hour per PP",
    requirements: "Have the minimum casting level to cast the spell, and materials worth the table's Price.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You expend half the materials (or none at all, learning from a scroll) and learn the spell — add it to your Spell Library.",
      success: "You expend the materials and learn the spell — add it to your Spell Library.",
      partial: "You fail to learn the spell, but may try again with a +2 modifier. The materials aren't expended.",
      failure: "You fail to learn the spell but may try again. The materials aren't expended.",
      fumble: "As Failure, but the materials are expended. Learning from a spellbook, the worst you can roll is a Failure instead.",
      blunder: ""
    },
    description: "General Skill Action (Trained) — learn a new spell of your tradition from a spellbook, a scroll, or someone who already knows it. Materials Price and Difficulty come from the spell's own PP cost (a printed table, PP 0-2 through 19-20, +40,000 gp/+2 DC per PP above that). Learning from a spellbook grants a +2 item bonus to the check but floors the worst possible result at Failure; a scroll's materials survive a Critical untouched. On success the spell joins your Spell Library — a Wizard's own Spellbook, currently — without touching the free per-level slots that class already grants."
  },

  // --- Athletics -------------------------------------------------------
  {
    key: "forceOpen",
    name: "Force Open",
    skills: ["athletics"],
    traits: "Attack",
    apCost: "1",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You successfully open the target and cause no damage to it.",
      success: "You force open the target and, unless it is particularly sturdy or durable, it gains the Broken condition (GM discretion).",
      partial: "",
      failure: "",
      fumble: "You jam the target shut, increasing the difficulty of future attempts to Force it Open by one step. If the target is a container holding fragile items, some may be destroyed by your efforts (GM discretion).",
      blunder: ""
    },
    description: "Attempt to force open a door, window, container, or something else deemed appropriate by the GM. Without an appropriate tool (such as a crowbar), the difficulty increases by one step."
  },
  {
    key: "highJump",
    name: "High Jump",
    skills: ["athletics"],
    traits: "Movement",
    apCost: "2 (or 1 with a +2 difficulty increase)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You make the jump.",
      partial: "",
      failure: "You leap half the required distance.",
      fumble: "You don't leap at all, and instead trip and fall forward 5 feet, landing prone.",
      blunder: ""
    },
    description: "Take a Stride (minimum 10 feet moved) and then make a vertical leap. The DC is 4 per foot jumped; if you didn't Stride at least 10 feet, the DC is doubled. You are asked the distance and whether you made the Stride before the roll, and the DC is worked out for you and shown — leave the distance at zero to set the DC yourself. The GM may further adjust it for the situation. You are also offered the printed trade-off: +2 DC to jump for 1 AP instead of 2."
  },
  {
    key: "longJump",
    name: "Long Jump",
    skills: ["athletics"],
    traits: "Movement",
    apCost: "2 (or 1 with a +2 difficulty increase)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You make the jump.",
      partial: "",
      failure: "You leap half the required distance.",
      fumble: "You don't leap at all, and instead trip and fall forward 5 feet, landing prone.",
      blunder: ""
    },
    description: "Take a Stride (minimum 10 feet moved) and then make a horizontal leap. The DC equals the number of feet you're attempting to jump; if you didn't Stride at least 10 feet, the DC is doubled. You are asked the distance and whether you made the Stride before the roll, and the DC is worked out for you and shown — leave the distance at zero to set the DC yourself. When a jump is both vertical and horizontal, add the difficulty modifiers together. You are also offered the printed trade-off: +2 DC to jump for 1 AP instead of 2."
  },
  {
    key: "swim",
    name: "Swim",
    skills: ["athletics"],
    traits: "Movement",
    apCost: "1",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You move through the water 10 feet, plus 5 feet per 20 feet of your land Speed.",
      success: "You move through the water 5 feet, plus 5 feet per 20 feet of your land Speed.",
      partial: "",
      failure: "",
      fumble: "You make no progress, and if you're holding your breath, you lose 1 round of air.",
      blunder: ""
    },
    description: "Move through a body of water or similar liquid. If the water is calm, no check is needed (treat as a Success) unless attempting to swim faster. If you end your turn in water without a successful Swim this turn, you sink 10 feet or are moved by the current, unless your last action was entering the water."
  },

  // --- Climbing ----------------------------------------------------------
  {
    key: "climb",
    name: "Climb",
    skills: ["climbing"],
    traits: "Movement",
    apCost: "1",
    requirements: "You have both hands free.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You move 5 feet plus 5 feet per 20 feet of your land Speed (10 feet for most PCs).",
      success: "You move 5 feet per 20 feet of your land Speed (5 feet for most PCs, minimum 5 feet if your Speed is below 20 feet).",
      partial: "You move 5 feet.",
      failure: "You hang but do not move anywhere.",
      fumble: "You fall. If you began the climb on stable ground, you fall and land prone.",
      blunder: ""
    },
    description: "Traverse an incline, whether upwards, downwards, or horizontally. The GM sets the DC based on the steepness and environmental conditions. You are flat-footed while climbing unless you have a Climb Speed. Increasing the difficulty by 2 lets you climb with one hand occupied, or ignore the flat-footed condition."
  },
  {
    key: "grabAnEdge",
    name: "Grab an Edge",
    skills: ["climbing"],
    traits: "Manipulate",
    apCost: "Reaction",
    trigger: "You fall and have an edge within your reach.",
    requirements: "You have two free hands, or are holding an item that would allow you to halt a fall (such as a pick or grappling hook).",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You grab the edge or handhold. You still take damage from the distance fallen so far, but treat the fall as though it were 30 feet shorter.",
      success: "You grab the edge or handhold. You still take damage from the distance fallen so far, but treat the fall as though it were 20 feet shorter.",
      partial: "",
      failure: "",
      fumble: "You continue to fall, bang your head, and are Stunned 3.",
      blunder: ""
    },
    description: "Attempt to stop your fall by grabbing hold of a ledge or other appropriate surface (GM discretion). The DC is usually the same as the Climb difficulty."
  },

  // --- Crafting ------------------------------------------------------
  {
    key: "evaluate",
    name: "Evaluate",
    skills: ["crafting"],
    traits: "",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You learn the exact value of the item and whether it has magical properties (though not what those properties are).",
      success: "You determine the exact value of the item and its resell value.",
      partial: "",
      failure: "You fail to determine the value of the item.",
      fumble: "You evaluate the item incorrectly, with the price being wildly inaccurate (GM discretion).",
      blunder: ""
    },
    description: "Determine the value of an item. Choose how long to spend: 10 minutes (+0), 1 minute (-2), 1 round (-5), 1 AP (-10) — apply as a situational modifier. An interrupted attempt must restart. The GM sets the difficulty. Can also be used to determine the most valuable item visible in a treasure hoard."
  },
  {
    key: "identifyAlchemy",
    name: "Identify Alchemy",
    skills: ["crafting"],
    traits: "Concentrate",
    apCost: "10 minutes",
    requirements: "Craft Alchemy feat, alchemist's tools.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You identify the item and the means of activating it.",
      partial: "",
      failure: "You fail to identify the item, but can try again.",
      fumble: "You misidentify the item as another item of the GM's choice.",
      blunder: ""
    },
    description: "Identify the nature of an alchemical item, given alchemist's tools. An interrupted attempt must restart."
  },
  {
    key: "repair",
    name: "Repair",
    skills: ["crafting"],
    traits: "Manipulate",
    apCost: "10 minutes",
    requirements: "You have a repair kit.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You restore 2 Hit Points per rank in the Crafting skill.",
      success: "You restore 1 Hit Point per rank in the Crafting skill.",
      partial: "",
      failure: "",
      fumble: "You deal 2d6 damage to the item, ignoring its Hardness.",
      blunder: ""
    },
    description: "Fix a damaged item: place it on a stable surface and use a repair kit with both hands for 10 minutes. The GM sets the difficulty, usually equal to the DC required to create the item. You cannot Repair a destroyed item. Increasing the difficulty by 2 repairs it in 1 minute, or by 5 in 1 round."
  },

  // --- Deception (Aggravate shared with Intimidate) -------------------
  {
    key: "aggravate",
    name: "Aggravate",
    skills: ["deception", "intimidate"],
    traits: "Concentrate, Manipulate",
    apCost: "2",
    checkType: "skill",
    against: ["skillDC:senseMotive", "willDC"],
    outcomes: {
      heroic: "",
      critical: "The target is infuriated by your insults and will attack you and only you for the remainder of the encounter.",
      success: "As Critical, but the target may make a Will Saving Throw at the beginning of each turn to act normally.",
      partial: "The target will use their next action to attack you if you are within range of their attacks.",
      failure: "The target behaves normally.",
      fumble: "As Critical, except the target can choose not to attack if they wish. If they choose to attack you, all their attacks gain a +4 circumstance bonus and the difficulty for you to resist their spells increases by the same amount.",
      blunder: ""
    },
    description: "Draw the attention of an enemy and force them to focus their attacks upon you. Gains the Auditory or Visual trait depending on how you cause the aggravation. An opposed check against the target's Sense Motive or Will DC, whichever is higher."
  },
  {
    key: "bluff",
    name: "Bluff",
    skills: ["deception"],
    traits: "Auditory, Concentrate, Linguistic, Mental",
    apCost: "1 round (minimum)",
    checkType: "skill",
    against: "skillDC:senseMotive",
    outcomes: {
      heroic: "",
      critical: "The target believes your lie and suffers a -4 circumstance penalty to any future attempts to disbelieve it (within reason).",
      success: "The target believes your lie.",
      partial: "",
      failure: "",
      fumble: "The target doesn't believe your lie and gains a +4 circumstance bonus against future Bluff attempts from you. This bonus is removed if you ever get a Critical result against them with a future Bluff.",
      blunder: ""
    },
    description: "Convince those around you that a falsehood is true. Compared against the Sense Motive DC of every creature who can hear you. The GM may apply a circumstance penalty based on the nature of the lie, and a target may later make a Sense Motive check against your Deception DC if given reason to disbelieve (GM discretion)."
  },
  {
    key: "createADiversion",
    name: "Create a Diversion",
    skills: ["deception"],
    traits: "Mental",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:perception",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You become hidden to each creature you succeed against, until the end of your turn or until you do anything except Step or use Hide/Sneak. Striking a creature leaves it flat-footed against that attack before you become observed; any other action makes you observed just before you act (GM discretion).",
      partial: "",
      failure: "You fail to divert the creature.",
      fumble: "",
      blunder: ""
    },
    description: "Use a gesture, trick, or distracting words to redirect a creature's attention. Gains the Manipulate trait for a gesture/trick, or Auditory and Linguistic for distracting words. Compared against the Perception DC of each creature whose attention you're diverting. Whether or not you succeed, you take a -4 circumstance penalty to divert the same target again for 1 minute."
  },
  {
    key: "disguise",
    name: "Disguise",
    skills: ["deception"],
    traits: "Concentrate, Manipulate",
    apCost: "10 minutes",
    checkType: "none",
    outcomes: {
      heroic: "",
      critical: "Despite your best efforts, the observer can see through your ruse and can discern your true identity if they have prior knowledge of you without the disguise.",
      success: "",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Change your appearance to that of someone else. Requires a disguise kit; a simpler, quicker disguise might do without one if not imitating a specific individual (GM discretion). Putting on the disguise itself needs no check — if someone who has reason to doubt it interacts with you directly, they make a Pierce Disguise (Sense Motive) check against your Deception DC: Success means they can tell you aren't who you claim; Failure means they believe your disguise (a new check may be needed if circumstances change)."
  },
  {
    key: "feint",
    name: "Feint",
    skills: ["deception"],
    traits: "Mental",
    apCost: "1",
    // "a Hard (DC +2) Deception check" — stated in the description, field
    // never set, so it had been rolling at Medium (two easier). Same class
    // as the Ambush/Sniping difficulty fix (3.103.0).
    difficulty: "hard",
    requirements: "You are within melee range of the target.",
    checkType: "skill",
    against: ["levelDC", "skillDC:senseMotive"],
    outcomes: {
      heroic: "",
      critical: "The target is left reeling by your unorthodox manoeuvres and becomes flat-footed against your melee attacks until the end of your next turn.",
      success: "Your target is thrown for a moment but quickly recovers, leaving them flat-footed against the next melee attack you make against them before the end of your current turn.",
      partial: "",
      failure: "",
      fumble: "You are flat-footed against the target's melee attacks until the end of your next turn.",
      blunder: ""
    },
    description: "Twist and turn to conceal the true nature of your attacks: a Hard (DC +2) Deception check against the target's level DC, or their Sense Motive DC if higher."
  },

  // --- Diplomacy -------------------------------------------------------
  {
    // THE RUNG HAD NOTHING TO LAND ON. Page 81 says "attempt an Easy
    // Diplomacy check" and names no DC, so this declared `difficulty:
    // "easy"` against `against: "none"` — and a rung is applied to the DC
    // (Graham, 16 September 2026), so the -2 was subtracted from nothing.
    // It was one of only two actions in the register in that state.
    //
    // A LEVEL-BASED DC, which is what Chapter 4 already says an unstated
    // one is: Graham's ruling of 27 August 2026 defaults an action with
    // no printed DC to Medium on the Difficulty Modifier Table, which IS
    // the level DC. The encourager's own level is the only one the
    // sentence offers, so the check is their level DC at Easy.
    //
    // INFERRED FROM TWO RULINGS RATHER THAN PRINTED, and flagged to
    // Graham as such when it shipped.
    key: "encourage",
    name: "Encourage",
    skills: ["diplomacy"],
    traits: "Auditory, Concentrate, Emotion, Linguistic",
    apCost: "1",
    // "An Easy (+2) Diplomacy check" — Easy is a −2 step in DIFFICULTIES
    // (the book writes the magnitude, the word gives the direction, per
    // Graham). Field was unset, so it had been rolling at Medium (two
    // harder than intended).
    difficulty: "easy",
    checkType: "skill",
    against: "selfLevelDC",
    outcomes: {
      heroic: "",
      critical: "The target may, as a free action, immediately make a new saving throw to shrug off a mental effect with a +2 circumstance bonus.",
      success: "The target may, as a free action, immediately make a new saving throw to shrug off a mental effect.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Shout encouraging words to an ally within 30 feet, helping them recover from a mental effect. An Easy (+2) Diplomacy check. The ally is then temporarily immune to your attempts to encourage them for the next hour, and the system tracks it."
  },
  {
    key: "gatherInformation",
    name: "Gather Information",
    skills: ["diplomacy"],
    traits: "Secret",
    apCost: "1+ hours",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You learn pretty much every applicable piece of information you can, based on what's known by the local populace.",
      success: "You gather several key pieces of information about the individual or topic.",
      partial: "",
      failure: "",
      fumble: "You gather false information about the subject matter.",
      blunder: ""
    },
    description: "Canvass the local populace about a specific individual or topic chosen before the check. Usually takes at least 1 hour, more depending on the size of the area and other factors. The GM sets the difficulty and any modifiers (population, settlement size, bribes, etc.)."
  },
  {
    key: "makeAnImpression",
    name: "Make an Impression",
    skills: ["diplomacy"],
    traits: "Auditory, Linguistic, Mental",
    apCost: "Varies",
    checkType: "skill",
    against: "willDC",
    outcomes: {
      heroic: "",
      critical: "The target's attitude toward you improves by two steps.",
      success: "The target's attitude toward you improves by one step.",
      partial: "You may immediately roll again, treating another Partial as a Failure.",
      failure: "The target's attitude toward you decreases by one step.",
      fumble: "The target's attitude toward you decreases by two steps.",
      blunder: ""
    },
    description: "Engage the target in a reasonable amount of conversation attempting to impress your best intentions, then make a Diplomacy check against their Will DC (the GM may modify this based on circumstances)."
  },
  {
    key: "request",
    name: "Request",
    skills: ["diplomacy"],
    traits: "Auditory, Concentrate, Linguistic, Mental",
    apCost: "1",
    requirements: "The NPC's attitude is friendly or helpful.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "The NPC agrees to your request wholeheartedly.",
      success: "The NPC agrees to your request, but might expect or request some kind of reward or amendment to it.",
      partial: "The NPC agrees to your request but has a proposal of their own which you must accept for this to be a success.",
      failure: "The NPC refuses the request, though they might offer an alternative more beneficial to them.",
      fumble: "The NPC's attitude toward you decreases by one step as they refuse your request.",
      blunder: ""
    },
    description: "Ask for the assistance of an NPC whose attitude is friendly or helpful. The GM determines the DC based on what's asked."
  },
  {
    key: "barterSelling",
    name: "Barter (Selling)",
    skills: ["diplomacy"],
    traits: "Auditory, Linguistic, Mental",
    apCost: "1 minute (minimum)",
    checkType: "skill",
    against: ["levelDC", "skillDC:diplomacy"],
    outcomes: {
      heroic: "",
      critical: "The trader is in real need of the item and will purchase it for 40% plus your Diplomacy skill ranks of its original price.",
      success: "The trader is happy to give you a good price: 20% plus your Diplomacy skill ranks of its original price.",
      partial: "The trader is only willing to buy the item at the normal 20%.",
      failure: "The trader has an abundance of the item and will only offer 10% of the original price.",
      fumble: "Offended by your negotiation, the trader refuses to deal with you and may bar you from the shop.",
      blunder: ""
    },
    description: "Negotiate a better price when selling an item to an NPC trader. Uses a level-based DC (the trader's level) or the trader's Diplomacy DC, whichever is higher. The GM may apply modifiers for the trader's interest, local supply and demand, recent events, or your reputation."
  },
  {
    key: "barterPurchasing",
    name: "Barter (Purchasing)",
    skills: ["diplomacy"],
    traits: "Auditory, Linguistic, Mental",
    apCost: "1 minute (minimum)",
    checkType: "skill",
    against: ["levelDC", "skillDC:diplomacy"],
    outcomes: {
      heroic: "",
      critical: "The trader sees you as a valuable customer, or is eager to offload stock: you pay your Diplomacy skill ranks +10% less than the listed price.",
      success: "Your charm or reasoning pays off: you pay 10% less than the listed price.",
      partial: "The trader appreciates the conversation but stands firm — you pay the listed price.",
      failure: "The trader sees you as difficult or needy — you pay 10% more than the listed price.",
      fumble: "The trader is insulted by your haggling and either refuses the sale or demands 20% more.",
      blunder: ""
    },
    description: "Negotiate a better price when purchasing an item from an NPC trader. Uses a level-based DC (the trader's level) or the trader's Diplomacy DC, whichever is higher. The GM may apply modifiers for the trader's interest, local supply and demand, recent events, or your reputation."
  },
  {
    key: "command",
    name: "Command",
    skills: ["diplomacy"],
    traits: "Auditory, Concentrate, Emotion, Linguistic",
    apCost: "1",
    checkType: "skill",
    against: "willDC",
    outcomes: {
      heroic: "",
      critical: "The target carries out your command to the best of their ability until your request is completed or 1 minute passes, whichever comes first.",
      success: "The target carries out your command to the best of their ability until the end of their next turn.",
      partial: "",
      failure: "The target ignores you and is immune to your commands for 10 minutes.",
      fumble: "The target is enraged by your command and will attempt to do the opposite (GM discretion).",
      blunder: ""
    },
    description: "Shout a command at an allied NPC, compared against their Will DC. Increasing the difficulty by 2 doubles the number of targets; doubling again each further step."
  },
  {
    key: "rally",
    name: "Rally",
    skills: ["diplomacy"],
    traits: "Auditory, Concentrate, Emotion, Linguistic",
    apCost: "2",
    checkType: "skill",
    against: "willDC",
    outcomes: {
      heroic: "",
      critical: "Reduce the creature's frightened value by 2.",
      success: "Reduce the creature's frightened value by 1.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Attempt to reduce panic in creatures within a 10-foot emanation around you who are frightened, compared against their Will DC; each is then temporarily immune to your Rally for 1 hour, tracked for you. Increasing the difficulty by 2 doubles the size of the emanation, doubling again each further step; increasing it by 4 reduces the AP cost by 1."
  },

  // --- Handle Animal ---------------------------------------------------
  {
    key: "mountDismount",
    name: "Mount / Dismount",
    skills: ["handleAnimal"],
    traits: "Movement",
    apCost: "1",
    requirements: "You are adjacent to a willing mount.",
    // A CHECK ONLY IN AN ENCOUNTER (3.506.0), AND TWO DEGREES BECAUSE
    // THOSE ARE THE TWO IT PRINTS — the `degrees: "binary"` field it
    // carried until 3.510.0 was deleted once the rulebook rule was
    // shown to give the identical answer for all seven degrees.
    // Graham's ruling of 6 Sep 2026: "rollable only if a combat is
    // running (success or failure only). Outside of combat it should be
    // an automatic success." DC 20 matches Kip Up, the nearest action in
    // shape — 1 AP, physical, done under pressure — and the four others
    // already on that number.
    //
    // It was `checkType: "none"` until this release, which is why the
    // PLAINS HERITAGE's `mountDismount` advantage had never once
    // applied. See module/combat/action-degrees.mjs.
    checkType: "skill",
    checkInEncounterOnly: true,
    against: "fixed",
    fixedDC: 20,
    outcomes: {
      heroic: "",
      critical: "",
      success: "You mount, or dismount and end adjacent to the mount.",
      partial: "",
      failure: "You do not get on or off. The AP is spent.",
      fumble: "",
      blunder: ""
    },
    description: "Mount the creature and ride it, or dismount if already mounted, placing you adjacent to the mount. Outside an encounter this succeeds automatically; while a combat is running it is a DC 20 Handle Animal check that either succeeds or fails."
  },
  {
    key: "commandAnAnimal",
    name: "Command an Animal",
    skills: ["handleAnimal"],
    traits: "Auditory, Concentrate",
    apCost: "1",
    checkType: "skill",
    against: "willDC",
    outcomes: {
      heroic: "",
      critical: "The animal does as you command for the next minute.",
      success: "The animal does as you command on its next turn.",
      partial: "You may immediately expend another AP to treat this check as a Success, otherwise treat as a Failure.",
      failure: "The animal is hesitant or resistant and does nothing.",
      fumble: "The animal ignores you and takes a completely different action (GM discretion).",
      blunder: ""
    },
    description: "Command an animal to follow a course of action, against its Will DC. The GM may apply a modifier based on the command and the animal's disposition. Automatically fails if the animal is hostile or unfriendly; increase your degree of success by one step if it's helpful. You may increase the DC by 5 to attempt this for 0 AP."
  },
  {
    key: "expressRider",
    name: "Express Rider",
    skills: ["handleAnimal"],
    traits: "Movement",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "Increase your mount's travel speed by 50%.",
      success: "Increase your mount's travel speed by 20%.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Get greater speed out of your mount, increasing its daily travel speed. The GM sets the difficulty."
  },
  {
    key: "guideWithKnees",
    name: "Guide with Knees",
    skills: ["handleAnimal"],
    traits: "Concentrate, Movement, Open",
    apCost: "Free",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You can use both hands this turn.",
      partial: "You can use both hands this turn, but any two-handed actions suffer a -2 circumstance penalty.",
      failure: "You can only use one hand this turn.",
      fumble: "You fall out of the saddle and land prone.",
      blunder: ""
    },
    description: "Guide your mount with your knees so you can use both hands in combat. Make the check at the start of your turn."
  },
  {
    key: "stayInSaddle",
    name: "Stay in Saddle",
    skills: ["handleAnimal"],
    traits: "Movement",
    apCost: "Reaction",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You stay in the saddle.",
      partial: "",
      failure: "You fall out of the saddle.",
      fumble: "You fall out of the saddle and take a Light Bludgeoning critical.",
      blunder: ""
    },
    description: "React instantly to avoid falling when your mount rears or bolts unexpectedly, or when you take damage."
  },
  {
    key: "trainAnimal",
    name: "Train Animal",
    skills: ["handleAnimal"],
    traits: "Manipulate",
    apCost: "Varies (usually about 1 week)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "The animal takes to the action quickly, learning it in 2-3 days (GM discretion). If it already knew the action, you can Command it without a check; if it was new, add it to the animal's Commandable actions (still requiring a check to use).",
      success: "As Critical, but it takes the animal 1 week to learn the action.",
      partial: "",
      failure: "The animal doesn't learn the trick.",
      fumble: "",
      blunder: ""
    },
    description: "Teach an animal to perform a specific action — either one it already knows by default (Awareness, Drop Prone, Jump, Stand, Stride, Strike) or a new one. The GM sets the difficulty and time required."
  },

  // --- Intimidate (Aggravate is shared with Deception, above) ---------
  {
    key: "coerce",
    name: "Coerce",
    skills: ["intimidate"],
    traits: "Auditory, Concentrate, Linguistic, Mental",
    apCost: "1 minute (minimum)",
    checkType: "skill",
    against: "willDC",
    outcomes: {
      heroic: "",
      critical: "You get the information you need and the target agrees to follow your suggestions as long as they aren't placed in direct harm. They comply while you're in close proximity but become unfriendly (if not already) after about a day — unlikely to attack you directly given the fear you've instilled, for now.",
      success: "As Critical, but once the target becomes unfriendly they may retaliate indirectly (report you to the authorities, help your enemies, etc.).",
      partial: "The target doesn't do what you say.",
      failure: "The target doesn't do what you say, and their attitude toward you drops by one step.",
      fumble: "The target doesn't do what you say, their attitude drops by two steps, and they're immune to further Intimidate attempts from you for at least 1 week.",
      blunder: ""
    },
    description: "After spending at least 1 minute in conversation with a target who can see or sense you, make an opposed Intimidate check against their Will DC, modified by circumstances the GM determines. You are asked before the roll how many additional targets to take on, at +2 DC each."
  },
  {
    key: "demoralise",
    name: "Demoralise",
    skills: ["intimidate"],
    traits: "Auditory, Concentrate, Emotion, Fear, Mental",
    apCost: "1",
    checkType: "skill",
    against: "willDC",
    outcomes: {
      heroic: "",
      critical: "The target becomes Frightened 2.",
      success: "The target becomes Frightened 1.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Shout and taunt to provoke a reaction that disrupts a target's focus. Choose one target within 30 feet you're aware of, against their Will DC. The difficulty increases by one step if you speak a language the target doesn't understand. Regardless of the result, the target is immune to further Demoralise attempts from you for 10 minutes. Increasing the difficulty by 2 lets you demoralise an additional target, doubling again each further step."
  },

  // --- Linguistics -----------------------------------------------------
  {
    key: "createForgery",
    name: "Create Forgery",
    skills: ["linguistics"],
    traits: "Secret",
    apCost: "Varies (days or weeks)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "The observer does not detect the forgery.",
      partial: "",
      failure: "The observer knows your document is a forgery.",
      fumble: "",
      blunder: ""
    },
    description: "Skilfully create a deceptive document, requiring appropriate writing materials. The GM makes a Secret Linguistics check on your behalf. Only an observer who scrutinises the document and makes a Sense Motive or Linguistics check against your Linguistics DC has a chance of uncovering the ruse — even a fooled observer may examine it again later if suspicions are aroused."
  },
  {
    key: "decipherWriting",
    name: "Decipher Writing",
    skills: ["linguistics"],
    traits: "Concentrate, Secret",
    apCost: "1 minute per page",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You decipher and understand the full content of the text.",
      success: "You understand the meaning of the text but can't translate it word for word.",
      partial: "You nearly have it — you may make the check again at +2 after spending the same amount of time again.",
      failure: "You can't understand the text, and take a -2 circumstance penalty to further checks to decipher it.",
      fumble: "You misinterpret the text.",
      blunder: ""
    },
    description: "Interpret obscure or ancient text, crack a cipher, or decode a hidden message. The GM sets the difficulty based on content and complexity; an unfamiliar language increases the DC further."
  },
  {
    key: "discernSecretMessage",
    name: "Discern Secret Message",
    skills: ["linguistics"],
    traits: "Concentrate, Secret",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:deception",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You learn the information contained in the secret message.",
      partial: "",
      failure: "You don't detect any hidden meaning in the message.",
      fumble: "You detect false information from the message.",
      blunder: ""
    },
    description: "If you overhear or otherwise intercept a secret message, attempt to learn its true meaning, compared against the Deception DC of the creature passing the message."
  },

  // --- Medicine --------------------------------------------------------
  {
    key: "firstAid",
    name: "First Aid",
    skills: ["medicine"],
    traits: "Flourish, Manipulate",
    apCost: "3",
    requirements: "You have a hand free.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You reduce the bleeding by 3.",
      success: "You reduce the bleeding by 2.",
      partial: "You reduce the bleeding by 1.",
      failure: "",
      fumble: "You increase the bleed damage by 1.",
      blunder: ""
    },
    description: "Perform first aid on an adjacent bleeding creature. The DC depends on how much the target is bleeding — Light (1-4 Hits) DC 20, Moderate (5-8) DC 25, Severe (9-12) DC 30, Dire (13+) DC 40 — and is read off the target and filled in for you. Increasing the difficulty by 4 reduces the AP cost by 1 (minimum 1 AP)."
  },
  {
    key: "resuscitation",
    name: "Resuscitation",
    skills: ["medicine"],
    traits: "Flourish, Manipulate",
    apCost: "3",
    requirements: "You have a hand free.",
    checkType: "skill",
    against: "levelDC",
    difficulty: "hard",
    outcomes: {
      heroic: "You reduce the target's Dying condition by 3.",
      critical: "You reduce the target's Dying condition by 2.",
      success: "You reduce the target's Dying condition by 1.",
      partial: "",
      failure: "",
      fumble: "You increase the target's Dying condition by 1.",
      blunder: "You increase the target's Dying condition by 2."
    },
    description: "Give medical assistance to an adjacent creature with the Dying condition. A Hard (+2) level-based DC using the target's level. Increasing the difficulty by one step reduces the AP cost by 1 (minimum 1 AP)."
  },
  {
    key: "treatDisease",
    name: "Treat Disease",
    skills: ["medicine"],
    traits: "Manipulate",
    apCost: "8 hours",
    requirements: "You are using healer's tools or other appropriate medical equipment.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You grant the creature a +4 circumstance bonus to its next saving throw against the disease.",
      success: "You grant the creature a +2 circumstance bonus to its next saving throw against the disease.",
      partial: "You grant the creature a +1 circumstance bonus to its next saving throw against the disease.",
      failure: "",
      fumble: "Your efforts cause the creature to take a -2 circumstance penalty to its next save against the disease.",
      blunder: ""
    },
    description: "After caring for a diseased creature for 8 hours, make an opposed Medicine check against the disease's own save DC — taken from the affliction on the target and filled in for you, the worst of them if it carries several. You can't try again for that creature until after its next save against the disease."
  },
  {
    key: "treatInjury",
    name: "Treat Injury",
    skills: ["medicine"],
    traits: "Healing, Manipulate",
    apCost: "8 hours",
    requirements: "You are using healer's tools or other appropriate medical equipment.",
    checkType: "skill",
    // THE DC IS THE PATIENT'S INJURY (page 194): 20 for a Minor injury,
    // 24 for a Serious one, 30 for a Deadly one. Resolved from the target
    // in the workflow, which is why this is "none" rather than a fixed
    // number — there are three of them. Rebuilt at 3.579.0 for the
    // block-19 audit's D7 and Graham's R7.
    against: "none",
    outcomes: {
      heroic: "",
      critical: "The injury is treated and begins healing, and the rest it needs is halved again.",
      success: "The injury is treated and begins healing: a Minor injury's three days of rest become two, a Serious injury becomes Minor after 10 days, and a Deadly injury becomes Serious after 20.",
      partial: "No progress today, and nothing lost — the eight hours may be spent again tomorrow.",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Spend at least 8 hours caring for a living creature with an Injury, using a Healer's Kit. The DC is read from the patient's worst injury — 20 Minor, 24 Serious, 30 Deadly (page 194). A Minor injury heals in three days of rest without any check at all; this halves that. A Serious or Deadly injury does not start healing until it has been treated."
  },
  {
    key: "treatToxin",
    name: "Treat Toxin",
    skills: ["medicine"],
    traits: "Manipulate",
    apCost: "1 minute (minimum)",
    requirements: "You are using healer's tools or other appropriate medical equipment.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You grant the creature a +4 circumstance bonus to its next saving throw against the poison.",
      success: "You grant the creature a +2 circumstance bonus to its next saving throw against the poison.",
      partial: "",
      failure: "",
      fumble: "Your efforts cause the creature to take a -2 circumstance penalty to its next save against the poison.",
      blunder: ""
    },
    description: "Spend at least 1 minute treating a patient to prevent the spread of poison, compared against the poison's own save DC — taken from the affliction on the target and filled in for you, the worst of them if it carries several. You can't try again for that creature until after its next save against the poison."
  },
  {
    key: "treatWounds",
    name: "Treat Wounds",
    skills: ["medicine"],
    traits: "Healing, Manipulate",
    apCost: "10 minutes",
    requirements: "You are using healer's tools or other appropriate medical equipment.",
    checkType: "skill",
    against: "fixed",
    fixedDC: 20,
    outcomes: {
      heroic: "",
      critical: "The target regains 20 Hit Points.",
      success: "The target regains 10 Hit Points.",
      partial: "The target regains 5 Hit Points.",
      failure: "",
      fumble: "The target takes 10 damage and is immune to your attempts to Treat Wounds until your next Daily Preparation.",
      blunder: ""
    },
    description: "Spend 10 uninterrupted minutes mending minor bruising and scratches on one target, who becomes temporarily immune to Treat Wounds for 1 hour, tracked for you. DC 20, modified by circumstances (GM discretion). Increasing the DC before rolling heals more Hit Point damage (+1 HP per +1 DC, max +20, doubled on a Critical) or, for every +5 DC, an additional target."
  },

  // --- Meditation ------------------------------------------------------
  {
    key: "cleansingTrance",
    name: "Cleansing Trance",
    skills: ["meditation"],
    traits: "Bonus, Concentrate, Healing, Mental",
    apCost: "1 hour",
    checkType: "skill",
    against: "none",
    bonusCheck: true,
    description: "After meditating for 1 hour, attempt to cure one poison or disease afflicting you: make a new saving throw against the effect, applying the bonus result from the Bonus Check Table as a modifier."
  },
  {
    key: "clearMind",
    name: "Clear Mind",
    skills: ["meditation"],
    traits: "Bonus, Concentrate, Mental",
    apCost: "Varies (usually at least 1 hour)",
    checkType: "skill",
    against: "none",
    bonusCheck: true,
    description: "After meditating for an appropriate time on a task, make a skill check and apply the bonus result from the Bonus Check Table to a subsequent skill check."
  },
  {
    key: "healingTrance",
    name: "Healing Trance",
    skills: ["meditation"],
    traits: "Concentrate, Healing, Mental",
    apCost: "1 hour",
    // "An Easy (DC +2) level-based check" — Easy = −2 step. The real path
    // is the GM-run Rest macro, which is fixed to roll this at Easy too
    // (rest-workflow.mjs); the field keeps the direct-invoke card honest.
    difficulty: "easy",
    checkType: "skill",
    against: "levelDC",
    outcomes: {
      heroic: "",
      critical: "You triple the amount of Hit Points regained naturally.",
      success: "You double the amount of Hit Points regained naturally.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "After meditating for one hour, heal yourself of physical damage. An Easy (DC +2) level-based check using your own level. You cannot use Healing Trance again for 1 hour. Automated through the Rest macro (GM-run, covers the whole party's rest together) — invoking this directly from here rolls the check but doesn't apply anything, since the healing it boosts only happens as part of that shared rest period."
  },
  {
    key: "powerRecovery",
    name: "Power Recovery",
    skills: ["meditation"],
    traits: "Concentrate, Mental",
    apCost: "Free (after each hour of rest)",
    checkType: "skill",
    against: "levelDC",
    outcomes: {
      heroic: "You regain an additional 2 PP per caster level.",
      critical: "You regain an additional PP per caster level.",
      success: "You regain an additional PP per two caster levels (round up).",
      partial: "You regain an additional 1 PP.",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Attempt to increase the amount of Power Points you regain while resting. A Medium (DC +0) level-based check using your own level, made after each hour of rest. Automated through the Rest macro (GM-run, covers the whole party's rest together) — invoking this directly from here rolls the check but doesn't apply anything, since the PP it boosts only accrues as part of that shared rest period."
  },

  // --- Mental Focus ----------------------------------------------------
  {
    key: "spatialAwareness",
    name: "Spatial Awareness",
    skills: ["mentalFocus"],
    traits: "Concentrate, Mental",
    apCost: "Free",
    checkType: "skill",
    // "A level-based DC using your own level" (description) → selfLevelDC, the
    // same class of fix as Refocus (3.114.1). It was "none", leaving the degree
    // unresolved, so its automated outcome (lose 1/2 AP, or Stun with none left)
    // never fired. "The GM will ask for this check" governs *when* it's rolled,
    // not the DC. Confirmed by Graham.
    against: "selfLevelDC",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You may act normally.",
      partial: "",
      failure: "You immediately lose 1 AP. If you have no AP remaining, you gain Stunned 1.",
      fumble: "You immediately lose 2 AP. If you have no AP remaining, you gain Stunned 2.",
      blunder: ""
    },
    description: "When you need to regain your bearings (such as after being teleported), the GM will ask for this check. A level-based DC using your own level."
  },
  {
    key: "invokeRage",
    name: "Invoke Rage",
    skills: ["mentalFocus"],
    // OPEN REMOVED AT 3.559.0. Page 88 prints this action as
    // CONCENTRATE EMOTION MENTAL RAGE, and the Open trait was the one
    // trait difference in the forty actions of pages 81-90.
    //
    // It was not decoration. `traits.mjs` enforces Open — "you can use an
    // action with the open trait only if you haven't used an action with
    // the attack or open trait yet this turn" — so a character who had
    // already swung was REFUSED the rage, on the one action a frenzied
    // fighter most wants mid-fight. A restriction the book does not
    // impose, with no comment anywhere recording a reason for it.
    //
    // The book plainly does use the trait on purpose: Guide with Knees is
    // printed OPEN two pages earlier and carries it. So the absence here
    // is a decision, not an omission.
    traits: "Concentrate, Emotion, Mental, Rage",
    apCost: "Varies",
    requirements: "You have the Frenzy feat; you aren't fatigued or raging.",
    checkType: "skill",
    against: "selfLevelDC",
    outcomes: {
      heroic: "It takes you 1 action to rage.",
      critical: "It takes you 2 actions to rage.",
      success: "It takes you 3 actions to rage.",
      partial: "",
      failure: "You fail to rage after using 3 actions, but may roll again next round.",
      fumble: "You froth and growl for 3 actions, then see red. You rage, but cannot discern friend from foe: you gain the Confused condition, and your rage does not end until the condition does.",
      blunder: ""
    },
    description: "You laugh uncontrollably, bite your shield, or gnash your teeth as your eyes roll with a look of madness. A level-based check using your own level; the AP it costs is the result of the check, not a fixed price. While raging: you cannot use any action with the Defence trait; you gain a +2 circumstance bonus to Strength- and Constitution-based checks (Athletics, Fortitude saves, Strength-based attack rolls, and the base damage of Strength-based attacks); you gain temporary HP equal to your class bonus x 20; you take a -2 circumstance penalty to DB; you cannot use Concentrate actions unless they also have the Rage trait; you cannot cast spells; you are immune to Stun; and you gain a +2 circumstance bonus to Will saving throws. Rage lasts until ended with Revoke Rage or after 1 minute, and can be extended a further minute at a time with Extend Rage."
  },
  {
    key: "extendRage",
    name: "Extend Rage",
    skills: ["mentalFocus"],
    traits: "Concentrate, Emotion, Mental, Rage",
    apCost: "Free",
    requirements: "You are raging.",
    checkType: "skill",
    against: "selfLevelDC",
    outcomes: {
      heroic: "Your rage continues for a further minute.",
      critical: "Your rage continues for a further minute.",
      success: "Your rage continues for a further minute.",
      partial: "The rage is not extended; it ends when its current minute runs out.",
      failure: "The rage is not extended; it ends when its current minute runs out.",
      fumble: "The rage is not extended; it ends when its current minute runs out.",
      blunder: "The rage is not extended; it ends when its current minute runs out."
    },
    description: "Choose to extend your rage for a further minute with an additional level-based Mental Focus check using your own level. The difficulty increases by one step for each attempt: the first is Hard (+2), the second Very Hard (+5), the third Incredibly Hard (+10), and the fourth Impossible — no rage can be extended a fourth time. The rulebook states neither an AP cost nor an outcome table for this check, so it is treated as a Free action, and a Success or better extends while a Partial or worse does not."
  },
  {
    key: "painTolerance",
    name: "Pain Tolerance",
    skills: ["mentalFocus"],
    traits: "Concentrate, Flourish, Mental",
    apCost: "Free",
    checkType: "skill",
    against: "fixed",
    fixedDC: 20,
    outcomes: {
      heroic: "",
      critical: "You ignore up to 1 point of the Dazed, Injured, or Weakened condition until the end of your next turn.",
      success: "You ignore up to 1 point of the Dazed, Injured, or Weakened condition until the end of your current turn.",
      partial: "",
      failure: "",
      fumble: "You cannot push through the pain, and are immune to this check for 1 hour.",
      blunder: ""
    },
    description: "Grit your teeth and push pain to the back of your mind — choose which of Dazed, Injured, or Weakened to ignore a point of; the reduction and its later restoration are automatic. Raise the DC above 20 in the roll dialog to ignore more: every 4 points of DC buys one additional point of whichever condition you selected, and the extra points are applied and restored with the first."
  },
  {
    key: "refocus",
    name: "Refocus",
    skills: ["mentalFocus"],
    traits: "Concentrate, Mental",
    apCost: "1",
    checkType: "skill",
    // "A level-based check using your own level" (description) — like Invoke/
    // Revoke/Extend Rage, which use selfLevelDC. It was "none", which leaves the
    // degree unresolved for the GM to adjudicate on the card, so the outcome-
    // driven effects (the Focus restore in 3.114.0 and the blunder backlash)
    // never fired automatically. selfLevelDC resolves the degree at roll time.
    // Found live-testing the Focus restore (3.114.1).
    against: "selfLevelDC",
    outcomes: {
      heroic: "",
      critical: "You instantly regain the use of the ability and may use it again immediately (AP dependant).",
      success: "You regain the use of the ability and may use it again at the beginning of your next turn.",
      partial: "You fail to regain the ability and must wait 1 minute before it can be used again.",
      failure: "You fail to regain the ability and cannot attempt to Refocus that ability again for 10 minutes.",
      fumble: "You fail to regain the ability and cannot use it again until your next daily preparation.",
      blunder: "As Fumble, but your mind also backlashes; you take 1d4 mental damage per level (basic Will)."
    },
    description: "You steel your mind and centre your will, attempting to restore an ability with the Focus trait. You make a level-based check using your own level."
  },
  {
    key: "revokeRage",
    name: "Revoke Rage",
    skills: ["mentalFocus"],
    traits: "Concentrate, Emotion, Mental, Rage",
    apCost: "Varies",
    requirements: "You have the Frenzy feat; you are raging.",
    checkType: "skill",
    against: "selfLevelDC",
    outcomes: {
      heroic: "",
      critical: "It takes you 1 action to end your rage.",
      success: "It takes you 2 actions to end your rage.",
      partial: "It takes you 3 actions to end your rage.",
      failure: "You fail to end your rage after using 3 actions, but may roll again next round.",
      fumble: "You fail to end your rage after using 3 actions and must continue raging for the full minute. When it ends, you are Fatigued 2.",
      blunder: ""
    },
    description: "You focus your inner anger and release your primal energy, ending your rage. A level-based Mental Focus check using your own level, at Medium difficulty; the AP it costs is the result of the check. When you eventually come out of Rage, you are Fatigued 1 for 1 hour. (The rulebook sets this difficulty \"based upon your original Invoke Rage Result\" but gives no mapping; per Graham that clause is set aside pending a rules revision, so every Revoke Rage is a plain Medium check for now.)"
  },
  {
    // THE DIFFICULTY HAD NOTHING TO LAND ON until 3.559.0. This declared
    // `difficulty: "veryHard"` and `against: "none"` — and a difficulty
    // rung is applied to the DC (Graham's instruction of 16 September
    // 2026, following the Example Difficulty table), so with no DC the
    // printed +5 was added to nothing at all. It was one of only two
    // actions in the whole register in that state.
    //
    // "The DC of the check is based upon the level of the creature or
    // effect that delivered the stun" — so it is the TARGET's level DC,
    // and the +5 now lands on it. Nothing records which creature stunned
    // you, so the player targets it, exactly as they do for the six
    // Will-DC actions on these same pages.
    key: "stunnedManoeuvre",
    name: "Stunned Manoeuvre",
    skills: ["mentalFocus"],
    traits: "Concentrate, Mental",
    apCost: "Reaction",
    // "at Very Hard (+5) difficulty" — stated, field never set, so it had
    // been rolling at Medium (five easier). Setting it was half the fix
    // and the comment that stood here recorded the other half as
    // impossible: "the DC itself is based on the level of the creature or
    // effect that delivered the stun, which the system can't know, so
    // `against: none` leaves that DC to the GM."
    //
    // WHICH LEFT THE +5 ADDED TO NOTHING. A difficulty rung is applied to
    // the DC, so a rung with no DC is inert — and this was one of only two
    // actions in the register in that state. The system cannot know WHICH
    // creature stunned you, but the player can target it, exactly as they
    // do for the six Will-DC actions on these same pages. Fixed 3.559.0.
    difficulty: "veryHard",
    checkType: "skill",
    against: "levelDC",
    outcomes: {
      heroic: "",
      critical: "You ignore the stun completely.",
      success: "You reduce the stun taken by half (round up).",
      partial: "",
      failure: "",
      fumble: "You increase the stun taken by 1.",
      blunder: ""
    },
    description: "Ignore effects that stun you by sheer power of will. Target whatever stunned you: the DC is that creature's level DC at Very Hard (+5) difficulty, and the +5 is applied to the DC."
  },
  {
    key: "spellConcentration",
    name: "Spell Concentration",
    // A General Skill Action (Trained) listed under both Mental Focus and Power
    // Manipulation (Chapter 4 skill tables), so it surfaces from either. The DC
    // is the spell's own casting DC — which the system can't know here — so
    // `against: none` leaves it to the GM. The book fixes the base difficulty at
    // Medium (+0) — the system default, so no `difficulty` field is needed —
    // raised per the severity of a critical injury that interrupted you: Minor
    // Hard +2, Serious Very Hard +5, Deadly Incredibly Hard +10, set in the dialog.
    skills: ["mentalFocus", "powerManipulation"],
    traits: "Concentrate, Mental",
    apCost: "Free",
    trigger: "You are interrupted (take damage) whilst casting or sustaining a spell.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You maintain the spell (if sustained) or cast it normally.",
      success: "You maintain the spell (if sustained) or cast it normally, but also gain 1 point of Fatigue.",
      partial: "As Success, but you gain 2 points of Fatigue.",
      failure: "The spell fails, and you lose half the PP (if casting).",
      fumble: "Your spell fails; you lose the PP (if casting) and must roll on the Spell Failure Table.",
      blunder: "As Fumble, but you must also make a Magical Resonance roll."
    },
    description: "When interrupted by taking damage while casting or sustaining a spell, attempt to avoid losing the magical energies you are harnessing. Make a check using the spell's original casting DC at Medium (+0) difficulty. If the damage was also a critical injury the difficulty rises — Minor is Hard (+2), Serious is Very Hard (+5), and Deadly is Incredibly Hard (+10) (set in the roll dialog)."
  },

  // --- Perception ------------------------------------------------------
  {
    key: "awareness",
    name: "Awareness",
    skills: ["perception"],
    traits: "Concentrate",
    apCost: "Free",
    checkType: "skill",
    against: "none",
    description: "Remain keenly aware of your surroundings to notice significant occurrences — catching something from your peripheral vision, uncovering concealed beings nearby, or acting swiftly in a surprise round. Doesn't require a specific action, though you must be conscious with functional senses. The GM sets the difficulty based on the circumstances."
  },
  {
    key: "search",
    name: "Search",
    skills: ["perception"],
    traits: "Concentrate",
    apCost: "1",
    checkType: "skill",
    against: "none",
    description: "Focus your attention on locating specific objects or beings — revealing an invisible creature that's made its presence known, uncovering a hidden creature nearby, or examining an area for concealed traps, perils, or hidden items. A comprehensive search usually takes about 1 minute per 20-foot by 20-foot area, longer if the GM deems it cluttered or intricate."
  },
  {
    key: "timeSense",
    name: "Time Sense",
    skills: ["perception"],
    traits: "Concentrate",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You pinpoint the exact amount of time that has passed and detect even the subtlest irregularities, including hidden magical time effects or shifts in chronology.",
      success: "You accurately estimate the passage of time or confirm it's behaving normally.",
      partial: "",
      failure: "",
      fumble: "Your internal sense of time is completely off, possibly causing you to misjudge an event's timing or miss signs of a temporal disturbance.",
      blunder: ""
    },
    description: "Attune your senses to the passage of time, gauging how much has passed or detecting irregularities in its flow — changes in ambient light, bodily rhythms, environmental cues, or temporal anomalies caused by magic or planar shifts. The GM sets the DC based on complexity. May be taken passively or actively; more time spent observing can improve accuracy (GM discretion)."
  },

  // --- Perform -----------------------------------------------------------
  {
    key: "entertain",
    name: "Entertain",
    skills: ["perform"],
    traits: "",
    apCost: "1 or more",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "Your performance leaves a lasting impression on the observers, who will share stories and tales of your exceptional ability with others.",
      success: "You demonstrate your skill and talent, earning the genuine appreciation of observers who recognise and admire the quality of your performance.",
      partial: "",
      failure: "Your performance is a bit naff and instantly forgettable.",
      fumble: "What was that? If your audience has things to throw at you, they probably will.",
      blunder: ""
    },
    description: "Deliver a short performance — a song, dance, or series of jokes — ideal for swiftly demonstrating your talent or leaving an impression. May influence the difficulty of future Diplomacy checks or the attitudes of those who witnessed it (GM discretion)."
  },

  // --- Power Manipulation (the skill itself requires Adept) ------------
  {
    key: "dispel",
    name: "Dispel",
    skills: ["powerManipulation"],
    traits: "Concentrate, Manipulate, Warding",
    apCost: "2",
    requirements: "Adept. Range 120 feet. Target one spell or effect you are aware of.",
    // "You expend an amount of PP up to the maximum that you can use to
    // cast a spell" (page 91) — a DECLARED amount, not a fixed one, so
    // the workflow prompts for it rather than reading a number here.
    // The ceiling is the caster's own per-cast PP cap.
    ppCostPrompt: "spellMaximum",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You dispel the effect and only expend half the PP.",
      success: "You dispel the effect and expend the PP.",
      partial: "You fail to dispel the effect but only expend half the PP.",
      failure: "You fail to dispel the effect and expend the PP.",
      fumble: "You fail to dispel the effect, expend the PP, and trigger a Resonance Event.",
      blunder: ""
    },
    description: "Unravel the magic behind a spell or effect. Expend PP up to the maximum you can use to cast a spell, then make the check (classed as a Counteract check) against the target magical item or effect. If you successfully counteract a magic item, it becomes mundane for 10 minutes (non-magical properties unaffected); artifacts and similar items automatically fail."
  },
  {
    key: "rechargeItem",
    name: "Recharge Item",
    skills: ["powerManipulation"],
    traits: "Alteration, Concentrate",
    apCost: "10 minutes",
    requirements: "Adept. You have the spells contained within the item on your spell list. PP Cost 2.",
    // "PP Cost 2" (page 91).
    ppCost: 2,
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "You accelerate the item's natural charging process; it regains an additional 1 PP per caster level.",
      critical: "You accelerate the item's natural charging process; it regains an additional 1 PP per 2 caster levels (round up).",
      success: "You accelerate the item's natural charging process; it regains an additional 1 PP per 4 caster levels (round up).",
      partial: "The item is resistant to your efforts; you may continue for another 10 minutes and try again, or treat as Failure.",
      failure: "The item is resistant to your efforts, and you fail to increase its recharge rate.",
      fumble: "Your efforts block the item's natural recharging process for 24 hours, and it becomes temporarily immune to this skill until your next Daily Preparation. You may also trigger a Magical Resonance Event.",
      blunder: ""
    },
    description: "Concentrate on a charged magical item you have invested, attempting to increase its recharging capability. Spend 10 minutes holding it and chanting, then make a check with the DC based on the item's level and rarity. Once used successfully, the item is temporarily immune until your next Daily Preparation; only one successful recharge check per item per day."
  },
  {
    key: "senseMagicBroad",
    name: "Sense Magic (Broad)",
    skills: ["powerManipulation"],
    traits: "Concentrate, Insight",
    apCost: "2",
    requirements: "Adept. Area: 20-foot emanation.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You sense the aura normally and automatically identify it.",
      success: "You sense the aura normally.",
      partial: "",
      failure: "The magical aura is hidden to you.",
      fumble: "",
      blunder: ""
    },
    description: "Send out a pulse that registers the presence of magic — no more than presence or absence, and you may ignore magic you're already fully aware of. More difficult auras (a different tradition -5, active Shadow magic -10, an active magical trap -10, active Insight magic -5) are opposed by your check against the spell's DC (or level DC if unknown). Once detected, other skills/abilities may ascertain exactly what the magic is."
  },
  {
    key: "senseMagicFocused",
    name: "Sense Magic (Focused)",
    skills: ["powerManipulation"],
    traits: "Concentrate, Insight",
    apCost: "3",
    requirements: "Adept. Range 10 feet; Area: 5-foot square.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You sense the aura normally and automatically identify it.",
      success: "You sense the aura normally.",
      partial: "",
      failure: "The magical aura is hidden to you.",
      fumble: "",
      blunder: ""
    },
    description: "As Sense Magic (Broad), but detects the presence or absence of magic in a 5-foot square; you may move your focus each round. Penetrates barriers up to 3 feet of wood/dirt, 1 foot of stone, 1 inch of common metal, or a thin sheet of lead, which blocks it."
  },
  {
    key: "sigil",
    name: "Sigil",
    skills: ["powerManipulation"],
    traits: "Concentrate, Manipulate, Warding",
    apCost: "1 minute",
    requirements: "Adept. Ranks 2. PP Cost 1.",
    // "Ranks 2" (page 91) — the only rank gate on an action in the core
    // book, enforced through the same `minRank` the Pillars of Faith
    // actions use. Graham's ruling R2, 17 September 2026.
    minRank: 2,
    // "PP Cost 1" (page 91). Spent by the workflow through
    // power-points-workflow.mjs, so a caster short of it goes below 0 and
    // pays the Soul Drain page 91 prints for it.
    ppCost: 1,
    checkType: "skill",
    against: "fixed",
    fixedDC: 20,
    outcomes: {
      heroic: "",
      critical: "Your sigil is scribed and may be visible or invisible.",
      success: "Your sigil is scribed and visible to all.",
      partial: "",
      failure: "You have failed, but may try again.",
      fumble: "Your sigil is incorrect and may resemble someone else's (GM discretion).",
      blunder: ""
    },
    description: "Harmlessly place your unique magical sigil (about 1 square inch) on the targeted creature or object. The mark can be scrubbed or scraped off with 5 minutes of work, or fades naturally over a week if on a creature."
  },

  // --- Sense Motive ----------------------------------------------------
  {
    key: "detectDeception",
    name: "Detect Deception",
    skills: ["senseMotive"],
    traits: "Concentrate",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:deception",
    outcomes: {
      heroic: "",
      critical: "You recognise the target is lying and discern what they're attempting to conceal.",
      success: "You realise the target is lying, but not what they're hiding.",
      partial: "",
      failure: "You believe the target is telling the truth.",
      fumble: "As Failure, but you take a -4 circumstance penalty on all future Detect Deception checks against the target until you achieve a Critical against them with this skill.",
      blunder: ""
    },
    description: "When you suspect a creature is being deceptive, compare your Sense Motive check against their Deception DC."
  },
  {
    key: "pierceDisguise",
    name: "Pierce Disguise",
    skills: ["senseMotive"],
    traits: "Concentrate",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:deception",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You realise the creature is disguised and not who it seems, but not necessarily who or what is beneath the disguise. If it's impersonating a specific individual you know, the GM might grant a bonus.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Recognise that a creature has changed its appearance. If particularly alert, the GM might allow this without an action. Opposed by the disguised creature's Deception check."
  },
  {
    key: "readEmotion",
    name: "Read Emotion",
    skills: ["senseMotive"],
    traits: "Concentrate",
    apCost: "1",
    checkType: "skill",
    against: "willDC",
    outcomes: {
      heroic: "",
      critical: "You accurately identify the creature's emotional state and whether it's being influenced by emotion-based effects (fear, charm, etc.).",
      success: "You correctly identify the creature's current emotion (anger, fear, guilt, etc.).",
      partial: "",
      failure: "You cannot discern their emotional state.",
      fumble: "You misread the creature's emotions entirely, potentially drawing incorrect conclusions.",
      blunder: ""
    },
    description: "Study a creature's micro-expressions, posture, and vocal tone to infer their current emotional state, against their Will DC."
  },
  {
    key: "senseMentalEffect",
    name: "Sense Mental Effect",
    skills: ["senseMotive"],
    traits: "Concentrate",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You determine the creature is affected by a mental effect and may make an appropriate skill check to determine what it is, as a free action.",
      success: "You determine the creature is affected by a mental effect but can't tell exactly what it is.",
      partial: "",
      failure: "You fail to sense a mental effect.",
      fumble: "If the target is affected, you believe it to be something beneficial. Otherwise, you believe they're affected by a false effect.",
      blunder: ""
    },
    description: "Examine a creature within 30 feet to ascertain whether it's currently affected by a mental effect, even if unaware of it. Choose how long to spend interacting: 10 minutes (+2), 1 minute (+0), 1 round (-2), 1 AP (-5), Free (-10). The difficulty is typically the effect's save DC, adjusted for how overt its manifestation is (GM discretion)."
  },

  // --- Stealth ---------------------------------------------------------
  {
    key: "concealAnObject",
    name: "Conceal an Object",
    skills: ["stealth"],
    traits: "Manipulate, Secret",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:perception",
    // THE PRINTED LADDER IS THE SEARCHER'S, NOT YOURS, and 3.8.1 is what
    // made that legible. The 3.8 entry printed "Success — The searcher
    // finds the object" directly under YOUR action, so succeeding at your
    // own Conceal check meant the searcher found it (audit errata E7).
    // The 3.8.1 rewrite separates the two checks in prose — yours is
    // "make a Stealth check against that creature's Perception DC", and
    // the ladder belongs to "a creature actively searching… makes a
    // Search (Perception) check against your Stealth DC" — but still
    // prints the searcher's ladder under the action.
    //
    // SO THE ACTION CARRIES YOUR OUTCOMES. A card that says "Success: the
    // searcher finds the concealed object" when you have just succeeded
    // would be the card contradicting itself, which is the defect E7
    // named. The searcher's ladder is in the description, where a GM
    // rolling their Search check can read it. Flagged to Graham as a
    // reading rather than assumed.
    outcomes: {
      heroic: "",
      critical: "",
      success: "The creature does not notice where you concealed the object.",
      partial: "",
      failure: "It sees you conceal the object and knows its location.",
      fumble: "",
      blunder: ""
    },
    description: "Conceal an object on your person, beneath your clothing, or among your carried possessions; it must be Small or smaller. If another creature can observe you while you conceal it, roll this check against that creature's Perception DC. Once concealed, the object is hidden from casual observation and a creature must specifically search you or your possessions to find it. A searcher makes a Search (Perception) check against your Stealth DC: Success — the searcher finds the concealed object; Failure — it remains concealed; Fumble — it remains concealed and the searcher concludes no such object is hidden in the area searched."
  },
  {
    key: "hide",
    name: "Hide",
    skills: ["stealth"],
    traits: "Secret",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:perception",
    outcomes: {
      heroic: "",
      critical: "",
      success: "If the creature had visual contact with you, you transition from Observed to Hidden. If already Hidden or Undetected, you maintain that state.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Take advantage of cover or concealment to obscure yourself from view. The GM secretly rolls your Stealth check against the Perception DC of each observing creature, factoring in any cover you have. Losing cover, being unconcealed, or performing any action other than Hide/Sneak/Step returns you to Observed; Striking a creature leaves it flat-footed against that attack first."
  },
  {
    key: "sneak",
    name: "Sneak",
    skills: ["stealth"],
    traits: "Movement, Secret",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:perception",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You remain completely undetected by the creature throughout your movement, until you perform any action other than Hide, Sneak, or Step.",
      partial: "",
      failure: "A slight noise or sign gives your position away, though you remain unseen — you're Hidden from the creature throughout your movement and remain so.",
      fumble: "You've been spotted — the creature continues to observe you throughout your movement (unless you're invisible and were previously Hidden, in which case you're Hidden instead).",
      blunder: ""
    },
    description: "Move silently and unnoticed, up to half your Speed using any available movement type. If undetected with no possible means of observation, a Fumble is instead treated as a regular Failure. At the end of your movement, the GM secretly rolls your Stealth check against the Perception DC of each creature you were Hidden from or Undetected by at the start. Maintaining cover throughout grants +2 (or +4 for greater cover); taking a -4 circumstance penalty lets you Sneak at full Speed."
  },
  {
    key: "ambush",
    name: "Ambush",
    skills: ["stealth"],
    traits: "Concentrate, Flourish",
    apCost: "Reaction",
    trigger: "A melee target is flanked, unaware, or flat-footed against you, and you've inflicted a critical with a weapon with the Agile trait.",
        // "A Hard (DC +2) check against the target's Perception DC" — its
    // own description says so and the field was never set, so both of
    // these rolled at Medium, two points easier than the rulebook, on
    // every use since they were written.
    difficulty: "hard",
checkType: "skill",
    against: "skillDC:perception",
    outcomes: {
      heroic: "You may modify the critical result by up to 20.",
      critical: "You may modify the critical result by up to 15.",
      success: "You may modify the critical result by up to 10.",
      partial: "You may modify the critical result by up to 5.",
      failure: "The ambush is ineffective.",
      fumble: "",
      blunder: ""
    },
    description: "A Hard (DC +2) check against the target's Perception DC; the difficulty decreases by one step for each size category larger than you the target is."
  },
  {
    key: "sniping",
    name: "Sniping",
    skills: ["stealth"],
    traits: "Concentrate, Flourish",
    apCost: "Reaction",
    trigger: "The target is unaware or flat-footed to you, and you've inflicted a critical with a ranged weapon within its first range increment.",
        // "A Hard (DC +2) check against the target's Perception DC" — its
    // own description says so and the field was never set, so both of
    // these rolled at Medium, two points easier than the rulebook, on
    // every use since they were written.
    difficulty: "hard",
checkType: "skill",
    against: "skillDC:perception",
    outcomes: {
      heroic: "You may modify the critical result by up to 20.",
      critical: "You may modify the critical result by up to 15.",
      success: "You may modify the critical result by up to 10.",
      partial: "You may modify the critical result by up to 5.",
      failure: "The sniping is ineffective.",
      fumble: "",
      blunder: ""
    },
    description: "A Hard (DC +2) check against the target's Perception DC; the difficulty decreases by one step for each size category larger than you the target is."
  },

  // --- Survival (Subsist, shared with Culture and Planes, is above) ---
  {
    key: "senseDirection",
    name: "Sense Direction",
    skills: ["survival"],
    traits: "Secret",
    apCost: "Varies (usually about a minute)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You possess a keen sense of location and orientation; in environments with cardinal directions, you have precise knowledge of them.",
      success: "Your sense of direction is good enough to avoid becoming completely lost; in environments with cardinal directions, you have a basic understanding of their orientation.",
      partial: "",
      failure: "",
      fumble: "",
      blunder: ""
    },
    description: "Use celestial bodies, natural features, or the behaviour of wildlife to maintain your sense of direction. Usually attempted once per day. Unfamiliar or unique environments may require a minimum number of Survival ranks; lacking a compass increases the difficulty by one step."
  },
  {
    key: "coverTracks",
    name: "Cover Tracks",
    skills: ["survival"],
    traits: "Concentrate, Movement",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    description: "While travelling, cover any obvious traces of your and your party's passing, moving at half your normal Speed. Others attempting to track you must succeed at a Tracking check against your Tracking DC. Covering tracks for a small group is easy, but each character's tracks hidden beyond the first four apply a -2 circumstance penalty to your Tracking DC."
  },
  {
    key: "gatherHerbs",
    name: "Gather Herbs",
    skills: ["survival"],
    // "General" is not an Appendix 3 trait — dropped (it was the lone
    // standing trait-validator warning since 3.94.0).
    traits: "Manipulate",
    apCost: "8 hours (or halved overland Speed while travelling)",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You gather 4 yields of the sought-after herb.",
      success: "You gather 2 yields of the sought-after herb.",
      partial: "You gather 1 yield of the sought-after herb.",
      failure: "You find nothing.",
      fumble: "",
      blunder: ""
    },
    description: "Gather herbs while travelling (overland Speed halved) or as your sole activity for 8 hours (granting 1 additional yield). Declare which herb you're seeking at the start; 5 ranks in Survival lets you search for two herbs at once, +1 more per additional 5 ranks (max 5 herbs at 20 ranks). Each herb has a level-based difficulty."
  },
  {
    // SURVEY WILDLIFE (Chapter 5, General feat). An action that exists only
    // because a feat grants it — "you can pick up on signs of nearby
    // creatures in a wilderness environment" — so it is gated to owners the
    // way every other feat-granted action on this table is.
    key: "surveyWildlife",
    name: "Survey Wildlife",
    skills: ["survival"],
    // EXPLORE, the trait's name (3.622.0; block 39's A16). Spelt "Exploration",
    // it matched nothing, and the action was usable in an encounter.
    traits: "Concentrate, Explore, Secret",
    apCost: "10 minutes",
    checkType: "skill",
    against: "none",
    requiresFeat: "Survey Wildlife",
    outcomes: {
      heroic: "",
      critical: "You read the signs clearly — nests, scat and marks on vegetation tell you what has been here.",
      success: "You find signs of the creatures nearby.",
      partial: "",
      failure: "You find nothing you can make sense of.",
      fumble: "You misread the signs, and the GM may tell you about a creature that was never here.",
      blunder: ""
    },
    description: "Spend 10 minutes surveying your surroundings for signs of nearby creatures — nests, scat, marks on vegetation. The GM sets the DC from how visible the signs are. On a success you may make a Recall Knowledge check at a -2 circumstance penalty to learn more about the creatures from those signs alone."
  },
  {
    key: "track",
    name: "Track",
    skills: ["survival"],
    traits: "Concentrate, Movement",
    apCost: "Varies",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You locate a new trail or continue following your current one, and gain a good sense of what you're tracking (numbers, race, footwear, etc.).",
      success: "You locate a new trail or continue following your current one.",
      partial: "",
      failure: "You lose the trail, but can try again after 1 hour.",
      fumble: "You lose the trail and can't try again for 24 hours.",
      blunder: ""
    },
    description: "Skilfully follow tracks at up to half your normal Speed. After a successful Track check, continue for up to 1 hour without an additional check; in tense situations this becomes a single action, with the GM determining how often checks are needed. Difficulty depends on track freshness, weather, and terrain. Increasing the difficulty by 5 lets you track at full Speed."
  },
  {
    // ASSESS TRACKS (Chapter 5 class feat, p.115) — built at 3.568.0, the
    // block-11 audit's only note-only feat. It sits here beside Track
    // rather than in feats-workflow because it IS a skill action: a
    // Survival check with a DC, a degree and a printed payout.
    //
    // `against: "levelDC"` is the unconditional half. The second DC —
    // "or against their Survival DC, IF they are actively covering their
    // tracks" — is a CONDITION, not a whichever-is-higher, so it is asked
    // in the workflow rather than declared as an array here. See
    // module/assess-tracks.mjs for why the array form is the wrong rule.
    key: "assessTracks",
    name: "Assess Tracks",
    skills: ["survival"],
    // EXPLORE, the trait's name (3.622.0; block 39's A16). Spelt "Exploration",
    // it matched nothing, and the action was usable in an encounter.
    traits: "Concentrate, Explore",
    apCost: "Varies",
    checkType: "skill",
    against: "levelDC",
    // GATED ON THE FEAT, the same way Survey Wildlife's action is: this is
    // a class feat's granted ability, not something every tracker can do,
    // and the sheet filters the action list on this field. `requirements`
    // below is the printed prose for the card; `requiresFeat` is the gate.
    requiresFeat: "Assess Tracks",
    requirements: "You have tracks to read.",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You learn the creature's base Speed, plus one additional detail for every point by which your check exceeded the difficulty.",
      partial: "",
      failure: "You learn nothing. You may retry after an hour of further observation.",
      fumble: "",
      blunder: ""
    },
    description: "Discern details about a creature from its tracks. Make a Level based Survival check against the creature you are tracking, or against their Survival DC if they are actively covering their tracks. On a success you learn its base Speed plus one further detail per point of margin — whether it has a climb or swim speed, its movement-based feats or traits, and possibly its diet, size and obvious supernatural traits, at the GM's discretion."
  },

  // --- Thievery ----------------------------------------------------------
  {
    key: "pickPocket",
    name: "Pick Pocket",
    skills: ["thievery"],
    traits: "Manipulate",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:perception",
    outcomes: {
      heroic: "",
      critical: "",
      success: "Your attempt is successful and goes unnoticed by both the target and any observers.",
      partial: "",
      failure: "The target notices, or an observer does.",
      fumble: "",
      blunder: ""
    },
    description: "Steal a small object (Tiny or smaller, no more than 1 lb) from another creature while avoiding detection, as an opposed check against their Perception DC. A pocketed, purse-kept, or otherwise closely-guarded item increases the DC by 5. Observers' Perception DCs are also compared if present. Automatically fails if the target is in combat or on guard."
  },
  {
    key: "trickery",
    name: "Trickery",
    skills: ["thievery"],
    traits: "Manipulate",
    apCost: "1",
    checkType: "skill",
    against: "skillDC:perception",
    outcomes: {
      heroic: "",
      critical: "",
      success: "The creature does not notice your Trickery attempt.",
      partial: "",
      failure: "The creature notices your Trickery attempt.",
      fumble: "",
      blunder: ""
    },
    description: "Palm a small, unattended object without detection, against the Perception DC of all observing creatures. Regardless of success, you take the object — only concealment varies. Typically limited to objects of negligible weight (GM discretion for exceptions)."
  },
  {
    key: "disableADevice",
    name: "Disable Device",
    skills: ["thievery"],
    traits: "Manipulate",
    apCost: "Varies",
    requirements: "You have tools.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You disable the device (or make two successes of progress on a complex one), with no evidence of tampering; if the device can be rearmed, you may do so later.",
      success: "You disable the device, or achieve one success toward disabling a complex device.",
      partial: "",
      failure: "",
      fumble: "You trigger the device.",
      blunder: ""
    },
    description: "Disable a trap or intricate device; complex devices require multiple successes. Some devices need a higher Thievery proficiency tier. Choose how long to spend: 10 minutes (+2), 1 minute (+0), 1 round (-5), 1 AP (-10)."
  },
  {
    key: "pickLock",
    name: "Pick Lock",
    skills: ["thievery"],
    traits: "Manipulate",
    apCost: "Varies",
    requirements: "You have tools.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You unlock it (or achieve two successes toward a complex lock), leaving no trace of tampering.",
      success: "You open the lock, or achieve one success toward a complex lock.",
      partial: "",
      failure: "",
      fumble: "You break your tools.",
      blunder: ""
    },
    description: "Pick a lock without a key; difficulty depends on the lock's complexity and construction, and higher-quality locks may need multiple successes. Improvised picks apply a penalty if you lack proper tools (GM discretion). Choose how long to spend: 10 minutes (+2), 1 minute (+0), 1 round (-5), 1 AP (-10)."
  },
  // DISABLE A PERIL (3.620.0; Chapter 12, page 397, Graham's R17):
  // "Environmental perils can often be overcome with Nature or Survival
  // skills, while echoes can be addressed using Occultism or Religion. The
  // specific skill and corresponding DC required to disable a peril are
  // indicated in its stat block." Disable Device's ladder, with the
  // targeted peril's Disable DC; refused for a skill the peril does not
  // list (peril-workflow.mjs).
  //
  // A HAUNT'S OWN SKILLS (3.629.0; Pillars of Faith, Chapter 8): "A haunt
  // can normally be disabled using the skills listed in its Disable entry"
  // — Diplomacy (the Last Watchman), Linguistics (the Oathbound Door),
  // Performance (the Choir Beneath the Floor) and a specialist Spirit Lore
  // (the Reliquary) among them. Offered under those skills too; the peril's
  // line still refuses any skill it does not name.
  {
    key: "disablePeril",
    name: "Disable a Peril",
    skills: ["nature", "survival", "occultism", "religion", "diplomacy", "linguistics", "perform"],
    specialistSkills: true,
    traits: "Manipulate",
    apCost: "Varies",
    requirements: "A peril you have detected, which names this skill to disable it. Target it first.",
    checkType: "skill",
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You disable the peril, or achieve two successes toward a complex one (three on a heroic).",
      success: "You disable the peril, or achieve one success toward a complex one.",
      partial: "",
      failure: "",
      fumble: "You trigger the peril.",
      blunder: ""
    },
    description: "Overcome an environmental peril (Nature or Survival) or lay an echo to rest (Occultism or Religion) — or any skill a haunt's Disable line names — against the DC in its stat block. A haunt is suppressed rather than disabled. A peril of complex components needs several successes: a critical counts as two, a heroic as three. A fumble or blunder triggers it. Choose how long to spend: 10 minutes (+2), 1 minute (+0), 1 round (-5), 1 AP (-10)."
  }
];

// Stamp the proficiency tier onto each entry from the single Set above, then
// freeze. Trained actions gain `proficiency: "trained"`; Untrained ones are
// left as-is (no field), which the gate reads as ungated.
//
// THE ARRAY IS NOT FROZEN since 3.560.0 (its entries still are): a
// companion module appends its own actions through `addSkillActions`
// below, and the six files that import SKILL_ACTIONS see them without
// any of them changing. Nothing else may push to it.
export const SKILL_ACTIONS = RAW_SKILL_ACTIONS.map((action) =>
  Object.freeze(TRAINED_ACTION_KEYS.has(action.key)
    ? { ...action, proficiency: "trained" }
    : action)
);

/**
 * Append module-supplied skill actions (3.560.0). An entry whose key is
 * already present is skipped and reported, never replaced.
 *
 * @returns {{added: string[], skipped: string[]}}
 */
export function addSkillActions(actions) {
  const added = [];
  const skipped = [];
  for (const action of actions ?? []) {
    const key = String(action?.key ?? "").trim();
    if (!key || SKILL_ACTIONS.some((a) => a.key === key)) { skipped.push(key || "?"); continue; }
    const entry = { ...action };
    if (entry.proficiency === undefined && entry.trained) entry.proficiency = "trained";
    delete entry.trained;
    SKILL_ACTIONS.push(Object.freeze(entry));
    added.push(key);
  }
  return { added, skipped };
}
