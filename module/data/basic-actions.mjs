/**
 * Basic Actions (Core 3.1, Chapter 4). Static system data, not items —
 * "these actions are universally available to all creatures, except in
 * extraordinary situations." Every character can use every entry here;
 * there is nothing to grant or drag onto a sheet.
 *
 * Most resolve through the same generic engine as everything else in
 * action.mjs (checkType/against/outcomes). A handful — Strike, Attack of
 * Opportunity, Charge, Double Slice, Fight Defensively, Coup de Grace —
 * fundamentally *are* a weapon Strike (already automated by the weapon
 * row's own Attack button since 3.8.0) wrapped in extra rules text or a
 * bonus to apply manually; forcing them through the generic single-check
 * engine would either duplicate or under-serve that existing automation,
 * so they're checkType "none": informational cards pointing at the right
 * button rather than a second, weaker copy of it.
 */

export const BASIC_ACTIONS = Object.freeze([
  {
    key: "aidDefensive",
    name: "Aid Defensive",
    traits: "Attack",
    apCost: "1",
    checkType: "attack",
    against: "defence",
    bonusCheck: true,
    outcomes: {
      heroic: "Your ally gains a +4 circumstance bonus to their Defence against the target's next attack.",
      critical: "+3 circumstance bonus to your ally's Defence against the target's next attack.",
      success: "+2 circumstance bonus to your ally's Defence against the target's next attack.",
      partial: "+1 circumstance bonus to your ally's Defence against the target's next attack.",
      failure: "Your attempt is ineffective; no bonus is granted.",
      fumble: "No bonus is granted, and you roll on the appropriate attack fumble table.",
      blunder: ""
    },
    description: "You make a melee Strike against the target but are looking to assist your ally rather than inflict damage, weaving and distracting to throw the target off balance. Compare the attack roll to the Bonus Check Table. The bonus granted applies only in the matchup it was earned in — against that one target, or on your ally's next attack against them — and is removed the moment it is used. It expires at the beginning of your next turn if unused."
  },
  {
    key: "aidOffensive",
    name: "Aid Offensive",
    traits: "Attack",
    apCost: "1",
    checkType: "attack",
    against: "defence",
    bonusCheck: true,
    outcomes: {
      heroic: "Your ally gains a +4 circumstance bonus to their next attack against the target.",
      critical: "+3 circumstance bonus to your ally's next attack against the target.",
      success: "+2 circumstance bonus to your ally's next attack against the target.",
      partial: "+1 circumstance bonus to your ally's next attack against the target.",
      failure: "Your attempt is ineffective; no bonus is granted.",
      fumble: "No bonus is granted, and you roll on the appropriate attack fumble table.",
      blunder: ""
    },
    description: "You make a melee Strike against the target but are looking to assist your ally rather than inflict damage, weaving and distracting to throw the target off balance. Compare the attack roll to the Bonus Check Table. The bonus granted applies only in the matchup it was earned in — against that one target, or on your ally's next attack against them — and is removed the moment it is used. It expires at the beginning of your next turn if unused."
  },
  {
    key: "aim",
    name: "Aim",
    traits: "Concentrate",
    apCost: "3",
    requirements: "You are wielding a missile weapon and can see a target.",
    checkType: "none",
    description: "You remain very still and align your weapon with your target. You may spend up to 4 rounds aiming, each round granting a +1 circumstance bonus to your Attack Bonus (applied automatically). Whilst aiming you are flat-footed, and taking any other action loses all accrued bonus."
  },
  {
    key: "attackOfOpportunity",
    name: "Attack of Opportunity",
    traits: "Attack",
    apCost: "Reaction",
    trigger: "A target within reach uses an action with the manipulate trait or the movement trait, or makes a ranged attack.",
    checkType: "none",
    description: "Use your weapon's Attack button to swiftly retaliate against the triggering creature with a melee strike. If your attack is a critical hit and the trigger was a manipulate action, you disrupt their action, causing it to fail. This strike does not contribute to your Multiple Attack Penalty, and your Multiple Attack Penalty does not affect this strike (both halves of that exemption are automatic)."
  },
  {
    key: "avertGaze",
    name: "Avert Gaze",
    apCost: "1",
    checkType: "none",
    description: "You actively look away from a potential threat, gaining a +2 circumstance bonus to saving throws against visual abilities that require looking at a creature or object, until the beginning of your next turn or until you look again. The bonus is OFFERED on your saving-throw dialogs while the stance is up — ticked by you, never applied for you, because only you know whether the ability in front of you asks you to look at it. The GM may apply a situational penalty to actions you make against a creature you're actively looking away from."
  },
  {
    key: "charge",
    name: "Charge",
    traits: "Attack, Flourish, Movement, Open",
    apCost: "3",
    checkType: "none",
    description: "Target a creature, then press this to arm your next move as a Charge: two Strides (at least 10 feet, at most twice your Speed) directly towards them. The move is checked against all three limits for you, and if the target is within reach when you arrive the melee Strike is offered automatically with its +4 circumstance bonus — costing no further AP, since Charge's 3 AP already bought it. You can Charge while Burrowing, Climbing, Flying or Swimming instead of Striding if you have the corresponding movement type, and may use this action whilst mounted."
  },
  {
    key: "coupDeGrace",
    name: "Coup de Grace",
    traits: "Attack, Save",
    apCost: "3",
    checkType: "none",
    description: "Deliver a coup de grace to an adjacent helpless opponent (target their token first): you automatically hit, scoring the maximum result for your attack (treat as an unmodified 20) — the hit and critical severity are computed automatically. Roll and apply the weapon's damage as normal; if the target survives, their level-based Fortitude saving throw is then rolled automatically, and they die on a failure. If the target is immune to critical hits, the coup de grace deals no critical damage or effects and forces no save."
  },
  {
    key: "crawl",
    name: "Crawl",
    traits: "Movement",
    apCost: "1",
    requirements: "You are prone and your Speed is at least 10 feet.",
    checkType: "none",
    description: "You move 5 feet whilst prone."
  },
  {
    key: "delay",
    name: "Delay",
    trigger: "Your turn begins",
    apCost: "Free",
    checkType: "none",
    description: "Use this action on your own turn to temporarily remove yourself from the initiative order; use it again at any point to return — your initiative permanently changes to slot in right after whoever's turn is currently active, and you act immediately. Whilst Delayed you cannot use reactions. Delaying for an entire round without returning loses the delayed actions; your initiative remains unchanged and your next turn occurs at your original position (handled automatically). Recurring damage/effects due at the start or end of your turn still occur when you Delay, and beneficial effects that would end during your turn still expire, since Delaying still runs your normal end-of-turn processing."
  },
  {
    key: "disarmAttack",
    name: "Disarm Attack",
    traits: "Attack",
    apCost: "1",
    requirements: "You have at least one hand free.",
    checkType: "attack",
    against: "attackDC",
    outcomes: {
      heroic: "",
      critical: "You disarm the target. The item falls to the ground at the target's feet (or another appropriate appendage).",
      success: "The item nearly falls from the target's grasp. Until the beginning of the creature's turn, the target takes a -2 circumstance penalty when using the item, including to their Attack DC for further disarm attempts.",
      partial: "",
      failure: "",
      fumble: "You throw yourself off balance and become flat-footed until the beginning of your next turn.",
      blunder: ""
    },
    description: "Attempt to remove a weapon or other object from the target's grasp. You take a -2 circumstance penalty when disarming an opponent one size category larger than you, cumulative -2 per category beyond that (applied automatically against a selected target)."
  },
  {
    key: "doubleSlice",
    name: "Double Slice",
    traits: "Attack, Flourish",
    apCost: "3",
    requirements: "You are wielding a melee weapon in both hands.",
    checkType: "none",
    description: "Choose your two melee weapons and both Strikes are made for you against the same target, at the Multiple Attack Penalty that stood when you began — it does not climb between them. The second takes its -2 circumstance penalty automatically unless that weapon is agile. A result card then states what the pair actually did: only one critical can be inflicted, a fumble on either makes the other miss, and it tells you which card to roll damage from (or to combine both, choosing the more beneficial type). The penalty then advances by two."
  },
  {
    key: "dropProne",
    name: "Drop Prone",
    traits: "Movement",
    apCost: "1",
    requirements: "You are in contact with the ground.",
    checkType: "none",
    description: "You willingly drop to the ground, gaining the Prone condition."
  },
  {
    key: "escape",
    name: "Escape",
    traits: "Attack",
    apCost: "1",
    checkType: "skill",
    skills: ["athletics"],
    against: "none",
    outcomes: {
      heroic: "",
      critical: "You break free, removing the Grabbed and Immobilised conditions, and may immediately take any action with the Move trait, moving no more than 5 feet.",
      success: "You break free, removing the Grabbed and Immobilised conditions imposed by your chosen target.",
      partial: "",
      failure: "",
      fumble: "You fail to escape and cannot attempt to Escape again until the beginning of your next turn.",
      blunder: ""
    },
    description: "Choose the specific source of the condition you're breaking free from (a creature's grasp, magical bindings, a physical obstacle...), then attempt an Acrobatics, Athletics, or Unarmed Attack check against that effect's DC (this entry defaults to Athletics — swap the check as appropriate; no DC is set here since it depends entirely on what's holding you)."
  },
  {
    key: "fightDefensively",
    name: "Fight Defensively",
    traits: "Attack, Defence, Open",
    apCost: "2",
    checkType: "none",
    description: "Take a single attack action (use your weapon's Attack button) whilst ducking, dodging and parrying. You gain a +2 dodge bonus to DB and a -4 circumstance penalty to all attack actions, including this one (-3 while you raise a madu), until the beginning of your next turn (both applied automatically, and both expire on their own)."
  },
  {
    key: "flowingMovement",
    name: "Flowing Movement",
    apCost: "Free",
    checkType: "skill",
    /*
     * THE THREE MOVEMENT SKILLS (Graham, 25 September 2026).
     *
     * This entry declared `checkType: "skill"` and named NO skill, so
     * `action.skills?.[0]` was undefined and the check rolled a bare d20
     * with a modifier list reading `{ label: "Skill", value: 0 }` — the
     * character's Athletics nowhere in it, and nothing saying so.
     *
     * The page asks for "a check appropriate to one of the movement
     * types involved (the GM determines which)", which is a choice, and
     * these are the three it is between. `actionNeedsSkillChoice` in
     * combat/action.mjs is what turns more-than-one into a question.
     */
    skills: ["athletics", "acrobatics", "climbing"],
    against: "none",
    outcomes: {
      heroic: "",
      critical: "",
      success: "You move from one movement type to another without ending the action. All movement costs combine to determine when the action ends.",
      partial: "",
      failure: "Your initial movement action ends as normal.",
      fumble: "",
      blunder: ""
    },
    description: "Attempt to change from one movement type to another without ending the initial action or spending an additional AP. Make a check appropriate to one of the movement types involved (the GM determines which)."
  },
  {
    key: "fullDefence",
    name: "Full Defence",
    traits: "Defence, Open",
    apCost: "3",
    checkType: "none",
    description: "Instead of attacking, you duck and weave to avoid attacks until the beginning of your next turn, gaining a +4 dodge bonus to DB until then (applied automatically). The prohibition is enforced for you: Free Actions remain available and you may take a single Move action — dragging your token counts as that Move — but every other action, including Reactions, is refused while the stance holds."
  },
  {
    key: "grappleAttack",
    name: "Grapple Attack",
    traits: "Attack",
    apCost: "1",
    requirements: "You have at least one free hand or have your target grappled or immobilised.",
    checkType: "unarmed",
    against: "fortitudeDC",
    outcomes: {
      heroic: "",
      // Corrected by Graham, 23 Aug 2026 — the printed "immobilised" is a
      // typo. The card and the condition table must say the same thing:
      // a card that describes a different outcome from the one applied is
      // worse than no card, because the player trusts what they read.
      critical: "Your target is Grabbed and takes a -4 circumstance penalty to checks made to Escape your Grapple until the end of your next turn.",
      success: "Your target is grabbed until the end of your next turn unless you move or your target Escapes.",
      partial: "",
      failure: "You fail to grab your target. If you already had the target grabbed or immobilised, those conditions end.",
      fumble: "If you already had the target grabbed or immobilised, it breaks free. Your target can either grab you (as if it succeeded at using Grapple against you) or force you to fall prone.",
      blunder: ""
    },
    description: "Attempt to grab a creature or object with your free hand. You take a -4 circumstance penalty grappling an opponent 2 size categories larger, cumulative -4 per category beyond that (applied automatically against a selected target). You can Grapple a target you already have grabbed or restrained without a hand free, and maintain an existing Grab with an action at the start of your turn."
  },
  {
    key: "interact",
    name: "Interact",
    traits: "Manipulate",
    apCost: "1",
    checkType: "none",
    description: "Grab an unattended or stored object, open a door, or manipulate the terrain around you in a minor way. The GM may require a skill check (use the Generic Check option on the relevant skill) to determine success."
  },
  {
    key: "prepare",
    name: "Prepare",
    traits: "Concentrate, Flourish",
    apCost: "1",
    requirements: "You can use reactions.",
    checkType: "none",
    description: "Choose a single reaction you're able to use; you may use it once as a free action until the beginning of your next turn. A chooser opens and the choice is remembered — the next use of that reaction costs no reaction from your pool. Its trigger still has to occur, and the states that forbid reacting at all (Flat-Footed, Confused, Full Defence) still forbid it."
  },
  {
    key: "ready",
    name: "Ready",
    traits: "Concentrate",
    apCost: "2",
    checkType: "none",
    description: "Use this action to choose an action of no more than 2 AP to ready — or to ready casting a spell (2 AP or less, chosen at the moment the trigger occurs) — along with a trigger; your turn then ends automatically. Use this action again at any point to confirm the trigger has occurred and immediately perform the readied action through its own normal workflow — including any current bonuses/penalties, since those already apply the same way this system computes them at the moment it's used. If the trigger doesn't occur before the start of your next turn, the readied action is automatically wasted. Any additional AP for the turn may still be spent before readying (on your normal initiative count) or after the action triggers."
  },
  {
    key: "release",
    name: "Release",
    traits: "Manipulate",
    apCost: "Free",
    checkType: "none",
    provokeExempt: true,
    description: "Drop an item you're holding (a picker of your currently held items opens, and the chosen one is unequipped automatically), release your hold on something, or change grip from one-handed to two-handed or vice versa. Despite being a Manipulate action, this does not trigger reactions such as Attack of Opportunity."
  },
  {
    key: "reposition",
    name: "Reposition",
    traits: "Movement",
    apCost: "2",
    requirements: "Your speed is at least 10 feet, and you have at least one free hand.",
    checkType: "none",
    description: "Move up to half your speed (minimum 5 feet) and, at the end of your movement, exchange positions with one adjacent, willing target. Any reactions provoked by this action affect you, not the willing target."
  },
  {
    key: "shieldBlock",
    name: "Shield Block",
    traits: "Martial",
    apCost: "Reaction",
    requirements: "A shield with a DR bonus, equipped. Trigger: you take damage from an attack.",
    checkType: "none",
    description: "Your shield grants you DR against the incoming attack equal to its DR bonus, scaled by your BDB. You and your shield take any further damage — enter the incoming damage and both are worked out. After using Shield Block you lose your shield bonus to DB until the beginning of your next turn. A shield with no DR bonus cannot Shield Block at all."
  },
  {
    key: "shieldBash",
    name: "Shield Bash",
    traits: "Attack",
    apCost: "1",
    checkType: "attack",
    against: "defence",
    outcomes: {
      heroic: "A solid hit — damage is rolled automatically as a critical.",
      critical: "A solid hit — damage is rolled automatically as a critical.",
      success: "You hit — damage is rolled automatically.",
      partial: "You miss, but only just.",
      failure: "You miss.",
      fumble: "You fumble — a fumble check is rolled automatically against your shield's own Fumble DC.",
      blunder: "You fumble badly — a fumble check is rolled automatically against your shield's own Fumble DC."
    },
    description: "Attack with your shield as an impromptu weapon. Base damage depends on your shield type — Light 1d4 (Fumble DC 6), Heavy 1d6 (Fumble DC 8), Tower 1d8 (Fumble DC 10) — rolled automatically on a hit, along with any fumble check needed. Using Shield Bash loses any shield bonus to DB until the beginning of your next turn (applied automatically). Buckler and Parrying Scabbard can't be used this way."
  },
  {
    key: "shoveAttack",
    name: "Shove Attack",
    traits: "Attack",
    apCost: "1",
    requirements: "You have at least one hand free or a shield in your off hand.",
    checkType: "unarmed",
    against: "fortitudeDC",
    outcomes: {
      heroic: "",
      critical: "Your target is pushed up to 10 feet away. You can Stride after it, but must move the same distance and direction.",
      success: "Your target is pushed back 5 feet. You can Stride after it, but must move the same distance and direction.",
      partial: "",
      failure: "",
      fumble: "You lose your balance, fall, and land prone.",
      blunder: ""
    },
    description: "Push a creature away from you. You take a -4 circumstance penalty shoving an opponent 2 size categories larger, cumulative -4 per category beyond that (applied automatically against a selected target)."
  },
  {
    key: "stand",
    name: "Stand",
    traits: "Movement",
    apCost: "1",
    checkType: "none",
    description: "You stand up from Prone."
  },
  {
    key: "step",
    name: "Step",
    traits: "Movement",
    apCost: "1",
    requirements: "Your speed is at least 10 feet.",
    checkType: "none",
    description: "Move 5 feet. This doesn't trigger reactions (such as Attack of Opportunity) that a move action could otherwise trigger. You can't Step into difficult terrain, and can't Step using a Speed other than your land Speed."
  },
  {
    key: "stride",
    name: "Stride",
    traits: "Movement",
    apCost: "1",
    checkType: "none",
    description: "Move up to your Speed using any of your movement types."
  },
  {
    key: "strike",
    name: "Strike",
    traits: "Attack",
    apCost: "1",
    checkType: "none",
    description: "Attack with a weapon you're wielding or with an unarmed attack, targeting one creature within reach (melee) or range (ranged). This action wires directly into your currently equipped attack (or Unarmed Strike, if nothing else is equipped) — Multiple Attack Penalty, criticals, and fumbles are all handled automatically, with AP spent once."
  },
  {
    // IMPROVISED ATTACKS (Chapter 6, page 166; Graham's R5, 19 Sep 2026).
    // Built at 3.576.0 — "It is possible to attack with just about
    // anything" had no way to be done.
    key: "improvisedAttack",
    name: "Improvised Attack",
    traits: "Attack",
    apCost: "1",
    checkType: "none",
    description: "Attack with something you are holding that is not a weapon: a -4 circumstance penalty to the attack, and 1d4 damage — bludgeoning unless you choose another type. Items that name a weapon use it: a torch is an improvised club that also deals 1 fire, a 10-ft pole an improvised quarterstaff at -2, and a woodsman's axe, tool hammer and shovel the hand axe, light hammer and light pick they name. The item must be equipped (held). Melee only — hurling one is left at the table. It goes through the same Strike as a weapon: reach, multiple attack penalty, criticals and fumbles are all handled, with AP spent once."
  },
  {
    key: "takeCover",
    name: "Take Cover",
    apCost: "1",
    requirements: "You are benefiting from cover, are adjacent to a feature that allows taking cover, or are prone.",
    checkType: "none",
    description: "Press up against a wall or duck behind an obstacle for better cover. Standard cover becomes Greater cover (+8 circumstance to DB, Reflex saves and Stealth); otherwise you gain Standard cover (+4 circumstance to all three, page 198). A creature in the way is Lesser cover instead: +2 to DB alone, and you cannot Hide behind it. Both are applied automatically. It ends automatically when you move from your space, or when you use this action again — that second one is the rulebook's \"end it as a free action\" and costs no AP. Ending it on using an attack action or on falling unconscious is still by hand."
  },
  {
    key: "tripAttack",
    name: "Trip Attack",
    traits: "Attack",
    apCost: "1",
    requirements: "You have at least one hand free.",
    checkType: "unarmed",
    against: ["skillDC:acrobatics", "fortitudeDC"],
    outcomes: {
      heroic: "",
      critical: "The target falls and lands prone, taking the result of the attack as a Tiny Unarmed attack.",
      success: "The target falls and lands prone.",
      partial: "",
      failure: "",
      fumble: "You lose your balance and fall, landing prone.",
      blunder: ""
    },
    description: "Attempt to knock a creature to the ground: an unarmed attack against the target's Acrobatics DC or Fortitude DC, whichever is higher. You take a -4 circumstance penalty tripping an opponent 2 size categories larger, cumulative -4 per category beyond that (applied automatically against a selected target)."
  }
]);
