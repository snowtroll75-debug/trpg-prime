/**
 * Special Actions (Core 3.1, Chapter 4). Static system data. "These
 * actions usually require you to have some kind of special ability or
 * movement type" — each carries a `requirement`, a dotted path into the
 * actor's own system data that must be greater than zero for the action
 * to appear at all (checked via meetsActionRequirement in action.mjs).
 */

export const SPECIAL_ACTIONS = Object.freeze([
  {
    // ALIGNED CONTROL (Creature Codex, Appendix — Aligned). Not a
    // movement type, which every other entry here is, but the same
    // shape: an action only some creatures have. Its requirement is a
    // derived flag rather than a speed, because "carries an aligned
    // trait, or Ebon Bind, or Grave Authority" is three routes and the
    // gate wants one number.
    key: "alignedControl",
    name: "Aligned Control",
    traits: "Concentrate",
    apCost: "1",
    requirement: "combat.alignedControl.available",
    requirements: "You share an aligned trait with the target and are at least 6 levels higher (4 if you share a creature type), within your Control Level.",
    checkType: "none",
    description: "You attempt to take control of a creature, item or place sharing your aligned trait. The target must be within visual range, or stored and in mental contact. They make an opposed level-based Will save against your Level DC: a Critical shrugs it off and makes them immune to you until their next daily preparation, a Success shrugs it off, a Partial is Controlled for 1 minute, a Failure for 1 hour, and a Fumble is permanent. Release is a 1 AP concentrate action at any time, and a hostile action from you or your allies lets them save again."
  },
  {
    // SENSE ALIGNED (Fiends & Fables 3.0 Appendix, passive and active
    // detection; 3.632.0, block 2 ruling 14). Any creature with an aligned
    // trait: a Perception check, opposed level based, against everything
    // sharing its trait within 60 ft. See aligned-sense-workflow.mjs.
    key: "senseAligned",
    name: "Sense Aligned",
    traits: "Detection",
    apCost: "0",
    requirement: "combat.alignedSense",
    requirements: "You carry an aligned trait (Balance, Chaos, Evil, Good or Order).",
    checkType: "none",
    description: "You make a Perception check (opposed level based) to sense creatures or items sharing your aligned trait within 60 feet — that they are present, not where or who. With Detect Aura running, the detection is active: +1 circumstance and each aura's strength."
  },
  {
    key: "burrow",
    name: "Burrow",
    traits: "Movement",
    requirement: "combat.movement.burrow",
    checkType: "none",
    description: "You dig your way through dirt, sand, or similar loose material at a rate up to your burrow Speed. You can't burrow through rock or denser substances unless you have an ability that allows it."
  },
  {
    key: "fly",
    name: "Fly",
    traits: "Movement",
    // "You can use an ACTION to Fly 0 feet to hover in place" — so this
    // button is the hover, and a hover costs what any other single
    // movement action costs. Flying somewhere is charged by the move
    // itself, as a Stride against the fly Speed, exactly as walking is.
    apCost: "1",
    requirement: "combat.movement.fly",
    checkType: "none",
    description: "You move through the air up to your fly Speed. Moving upward (straight up or diagonally) uses the rules for difficult terrain, and moving straight down covers 10 feet for every 5 feet of movement spent — both are applied automatically when you move with the Fly movement action. Flying to the ground avoids falling damage. Pressing this button is the 0-foot hover: it spends the action and counts as a Fly action for this round. If you are airborne at the end of your turn having used no Fly action that round, you fall automatically, from your token's own elevation."
  },
  {
    key: "sustainASpell",
    name: "Sustain a Spell",
    traits: "Concentrate",
    apCost: "1",
    requirements: "You have at least one spell active with a sustained duration, and you are not fatigued.",
    checkType: "none",
    description: "Choose one spell with a sustained duration you have in effect. Its duration continues until the end of your next turn. Some spells may have expanded effects if sustained. Sustaining for 1 minute or longer requires an Exhaustion Check (its own button, on this tab); beyond 10 minutes (100 rounds), you must expend the spell's Power Points again (no check required) for every additional 10 minutes or part thereof. You cannot recover Power Points while sustaining a spell. If your Sustain a Spell action is interrupted, the spell immediately ends unless you succeed at a Spell Concentration check (its own button, on the Magic tab)."
  },
  {
    key: "dismiss",
    name: "Dismiss",
    traits: "Concentrate",
    apCost: "1",
    checkType: "none",
    description: "Bring an end to a spell effect or magic item effect that can be dismissed according to its own description. Dismissal may end the effect entirely or end it for specific targets only, depending on the spell or item."
  }
]);
