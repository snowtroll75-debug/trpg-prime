/**
 * THE FUMBLE TABLES' OWN RIDERS (Chapter 7, pages 220–223) — the rules,
 * pure.
 *
 * NEW at 3.582.0, for the pages 221-230 audit's D1 and Graham's R1 of
 * 22 September 2026: "Yes".
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG. Fifty-five of the 120 fumble rows tell the system to
 * do something, and `rollWeaponFumble` applied conditions, rolled self-
 * damage, and did none of the rest. The critical tables gained exactly
 * this treatment at 3.580.0 (the pages 201-210 audit's D15, Graham's
 * "All"); the fumble tables got nothing, so a character who had just
 * shot an ally, dropped their sword, or broken their bow read a sentence
 * about it and carried on unaffected.
 *
 * READ FROM THE ROW'S OWN TEXT, not from a hand-written list of row
 * numbers — the same argument `critical-riders.mjs` makes, for the same
 * reason. The tables are generated data, regenerated whenever the book
 * changes; a list of numbers beside them would be a second copy of the
 * book, free to fall out of step with the first.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT HERE.
 *
 * "IGNORING DR & RESISTANCE" (8 rows) NEEDS NO RULE. Measured before it
 * was written: `applySelfDamage` applies its damage through
 * `applyDamageAndCheckDying`, which writes hit points directly and never
 * runs the DR/resistance pipeline. Those eight rows have always ignored
 * DR — the card simply never said so. So this module reports the phrase
 * for the card to print and changes nothing, which is the honest shape:
 * a rule that was already right should not grow a second implementation
 * to look busy.
 *
 * WIND IS NOT HERE EITHER, and nor is anything else from page 226 —
 * Graham's R10 of 22 September 2026 leaves the fly speed's wind rules to
 * the GM.
 *
 * Pure; no Foundry. Every roll these riders need is made by the caller
 * and handed back in.
 */
import { levelDC, DIFFICULTY_BY_KEY } from "../dice/resolution.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { conditionMentions } from "../effect-parser.mjs";

/*
 * "A DC EQUAL TO YOUR LEVEL DC (HARD)" — and Hard is +2.
 *
 * MEASURED, NOT ASSUMED. The audit guessed +5 out loud and the
 * difficulty ladder says otherwise: `DIFFICULTIES` in dice/resolution.mjs
 * runs … easy −2, medium 0, HARD +2, very hard +5, incredibly hard +10.
 * Very hard is the +5. Read from that ladder rather than frozen here, so
 * a book that re-tunes its difficulty steps re-tunes these four rows too.
 */
export const FUMBLE_SAVE_DIFFICULTY = "hard";

/** The DC the four "Level DC (Hard)" rows ask for. */
export function fumbleSaveDC(level) {
  return levelDC(level) + Number(DIFFICULTY_BY_KEY[FUMBLE_SAVE_DIFFICULTY]?.modifier ?? 0);
}

/**
 * "You have somehow managed to attack one of your allies, reroll this
 * attack against a randomly selected ally within range. If no allies are
 * within range you inflict a Critical Injury to yourself."
 *
 * Nine rows across the four tables, in three shapes: a RANDOM ally
 * (66 on every table), the CLOSEST creature to the original target
 * (thrown 21-25, which says "this can be yourself"), and a reroll
 * IGNORING MAP (missile 98-99). Two more simply state the outcome —
 * "you critically hit an ally or neutral within range" (thrown 98-99)
 * and "you critically hit yourself" (unarmed 98-99).
 *
 * ROLLED, NOT OFFERED (Graham's R3, 22 September 2026: "Auto"). The row
 * is not giving the player a choice; it is telling them what has already
 * happened.
 *
 * @param {string} text
 * @returns {{target: string, ignoresMAP: boolean, includesSelf: boolean,
 *   fallback: string}|null}
 */
export function allyRerollRider(text) {
  const str = String(text ?? "");

  // "you critically hit yourself" — no reroll, no target choice.
  if (/\bcritically\s+hit\s+yourself\b/i.test(str)) {
    return { target: "self", ignoresMAP: false, includesSelf: true, fallback: "self" };
  }
  // "you critically hit an ally or neutral within range"
  if (/\bcritically\s+hit\s+an\s+ally\b/i.test(str)) {
    return { target: "randomAlly", ignoresMAP: false, includesSelf: false, fallback: "self", already: true };
  }
  const reroll = /\breroll\s+(?:this\s+|the\s+)?attack\b/i.exec(str);
  if (!reroll) return null;

  const tail = str.slice(reroll.index);
  const closest = /\bclosest\s+creature\b/i.test(tail);
  return {
    target: closest ? "closest" : "randomAlly",
    ignoresMAP: /\bignoring\s+MAP\b/i.test(tail),
    includesSelf: /\bthis\s+can\s+be\s+yourself\b/i.test(tail),
    // "If no allies are within range you inflict a Critical Injury to
    // yourself" / "you instead target a bystander or inflict a critical
    // to yourself".
    fallback: /\bcritical(?:\s+Injury)?\s+to\s+yourself\b/i.test(tail) ? "self" : "none"
  };
}

/**
 * "Make a basic Fortitude Saving throw with a DC equal to your Level DC
 * (Hard) inflicting damage to yourself and a potential critical based
 * upon the result."
 *
 * Four rows, all at 100. Unarmed's is a Reflex save made by EVERY target
 * including the faller — "All targets including yourself basic Reflex
 * Saving throw … or take your damage and a potential critical."
 *
 * @param {string} text
 * @returns {{save: string, scope: string, difficulty: string}|null}
 */
export function levelDCSaveRider(text) {
  const str = String(text ?? "");
  const match = str.match(
    /\b(?:basic\s+)?(Fortitude|Reflex|Will)\s+Saving\s+throw\s+with\s+a\s+DC\s+equal\s+to\s+your\s+Level\s+DC\s*\(?(\w+)?\)?/i);
  if (!match) return null;
  const difficulty = String(match[2] ?? FUMBLE_SAVE_DIFFICULTY).toLowerCase();
  return {
    save: match[1].toLowerCase(),
    // "All targets including yourself" is the only row that reaches
    // past the fumbler.
    scope: /\ball\s+targets\s+including\s+yourself\b/i.test(str) ? "everyone" : "self",
    difficulty: DIFFICULTY_BY_KEY[difficulty] ? difficulty : FUMBLE_SAVE_DIFFICULTY
  };
}

/**
 * "The weapon slips in your grasp and you drop it at your feet."
 *
 * Six rows. Graham's R5 (22 September 2026): "Unequip" — the weapon is
 * actually taken out of the character's hands, not merely described as
 * dropped.
 *
 * THE BOMB CLAUSE TRAVELS. Thrown 11-15 adds "If this is a bomb or other
 * volatile item, it does not go off and must be a dud", which is the
 * difference between a dropped weapon and a dropped weapon that kills
 * you, so the card has to say it.
 *
 * @param {string} text
 * @returns {{drops: boolean, dud: boolean}|null}
 */
export function dropWeaponRider(text) {
  const str = String(text ?? "");
  if (!/\byou\s+drop\s+(?:it|the\s+weapon)\b/i.test(str)) return null;
  return { drops: true, dud: /\bmust\s+be\s+a\s+dud\b/i.test(str) };
}

/**
 * "Your weapon breaks", "it is broken", "the string has snapped
 * requiring 3 interact actions to fix".
 *
 * Four rows. Graham's R6: "Yes" — apply the Broken item condition, and
 * record the bow's repair cost.
 *
 * MISSILE 21-25 IS TWO RULES IN ONE SENTENCE: a bow's string snaps and
 * is repairable with Interact actions; any other missile weapon is
 * simply broken. Told apart here rather than in the workflow, because
 * which of the two applies is a fact about the weapon and the row.
 *
 * @param {string} text
 * @returns {{breaks: boolean, bowString: boolean, interacts: number}|null}
 */
export function breakWeaponRider(text) {
  const str = String(text ?? "");
  const snapped = /\bstring\s+has\s+snapped\b/i.exec(str);
  const broken = /\b(?:weapon\s+breaks|weapon\s+is\s+broken|it\s+is\s+broken)\b/i.test(str);
  if (!snapped && !broken) return null;
  const interacts = snapped
    ? Math.max(1, Math.trunc(Number((str.match(/requiring\s+(\d+)\s+interact\s+actions/i) ?? [])[1]) || 1))
    : 0;
  return { breaks: true, bowString: Boolean(snapped), interacts };
}

/**
 * "For Piercing or Slashing weapons, you inflict 1d4 recurring bleed to
 * yourself, for Bludgeoning you have just inflicted 1d10 damage ignoring
 * DR & Resistance."
 *
 * Six rows. ONE SENTENCE, TWO OUTCOMES, chosen by the weapon's own
 * damage type — which `extractSelfDamage` cannot express, because it
 * answers with a single packet and this row has two.
 *
 * @param {string} text
 * @returns {{piercingSlashing: object, bludgeoning: object}|null}
 */
export function typeSplitDamageRider(text) {
  const str = String(text ?? "");
  const match = str.match(
    /For\s+Piercing\s+or\s+Slashing\s+weapons,?\s+you\s+inflict\s+(\d+d\d+)\s+recurring\s+bleed[^,.]*,\s*for\s+Bludgeoning[^.]*?(\d+d\d+)\s+damage/i);
  if (!match) return null;
  return {
    piercingSlashing: { type: "bleed", formula: match[1] },
    bludgeoning: { type: "damage", formula: match[2], ignoresDR: ignoresDR(str) }
  };
}

/**
 * Whether the row says its damage ignores DR and resistance.
 *
 * REPORTED, NOT ENFORCED — see this file's header. Self-damage already
 * bypasses the pipeline; this exists so the card can say the thing the
 * book says.
 *
 * @param {string} text
 * @returns {boolean}
 */
export function ignoresDR(text) {
  return /\bignoring\s+(?:DR\s*&?\s*)?[Rr]esistance\b/i.test(String(text ?? ""));
}

/**
 * Reactions: a row that triggers them, or one that takes them away.
 *
 * "You Trigger Reactions" (3 rows) and "You may use no Reactions until
 * the end of your next turn" (3 rows) are opposite statements about the
 * same resource, so they are answered together.
 *
 * @param {string} text
 * @returns {{triggers: boolean, blockedRounds: number}|null}
 */
export function reactionRider(text) {
  const str = String(text ?? "");
  const triggers = /\btriggers?\s+reactions\b/i.test(str);
  const blocked = /\b(?:use\s+)?no\s+Reactions\b/i.test(str);
  if (!triggers && !blocked) return null;
  return { triggers, blockedRounds: blocked ? 1 : 0 };
}

/**
 * "For some unknown reason, you move 10' in a random direction."
 *
 * Only unarmed 86-90 moves the CHARACTER; the other two "harmless
 * landing" rows move the weapon, which is the drop rider's business, not
 * this one's.
 *
 * @param {string} text
 * @returns {{feet: number, random: boolean, triggersReactions: boolean}|null}
 */
export function randomMovementRider(text) {
  const str = String(text ?? "");
  const match = str.match(/\byou\s+move\s+(\d+)'\s+in\s+a\s+random\s+direction\b/i);
  if (!match) return null;
  return {
    feet: Math.max(0, Math.trunc(Number(match[1]) || 0)),
    random: true,
    triggersReactions: /\btriggers?\s+reactions\b/i.test(str)
  };
}

/**
 * "You are Slowed 1 until you spend 2 Interact actions to free
 * yourself."
 *
 * Three rows. A duration measured in ACTIONS, which neither clock in
 * this system can count — so it becomes a button that charges the
 * actions and clears the condition, the same shape Cold 90's escape
 * took at 3.581.0.
 *
 * @param {string} text
 * @returns {{interacts: number, frees: string|null}|null}
 */
export function untilInteractRider(text) {
  const str = String(text ?? "");
  const match = str.match(/\buntil\s+you\s+spend\s+(\d+)\s+Interact\s+actions?\s+to\s+free\s+yourself\b/i);
  if (!match) return null;
  // The condition the clause frees you FROM is the one named before it.
  const before = conditionMentions(str.slice(0, match.index));
  return {
    interacts: Math.max(1, Math.trunc(Number(match[1]) || 1)),
    frees: before.length ? before[before.length - 1].key : null
  };
}

/**
 * The conditions a row grants "until healed".
 *
 * Thirteen rows. These correctly get no clock, and Graham's R15 asks for
 * the card to SAY so — a Weakened 1 until healed and a Stunned 2 are
 * printed identically today, and only one of them goes away on its own.
 *
 * @param {string} text
 * @returns {string[]} condition keys
 */
export function untilHealedConditions(text) {
  const str = String(text ?? "");
  const match = /\buntil\s+healed\b/i.exec(str);
  if (!match) return [];
  /*
   * THE CLAUSE GOVERNS BACK TO THE NEAREST "and", NOT TO THE START OF
   * THE SENTENCE — which is where this differs from the critical side's
   * scoping, deliberately, and one row is the reason.
   *
   * Unarmed 81-85: "You fall prone AND are Injured 2 until healed."
   * Twelve of the thirteen rows are a single clause and answer the same
   * either way; this one would otherwise print "Prone and Injured 2 last
   * until healed", and Prone ends when you stand up. Nothing is applied
   * differently — this rider only writes a line — but a line that says
   * the wrong thing is the reason the audit asked for it.
   */
  const sentenceStart = Math.max(0, str.lastIndexOf(".", match.index) + 1);
  const clause = str.slice(sentenceStart, match.index);
  const conjunction = /\s+(?:and|&)\s+/gi;
  let cut = 0;
  let found;
  while ((found = conjunction.exec(clause))) cut = found.index + found[0].length;
  return conditionMentions(clause.slice(cut))
    .map((mention) => mention.key)
    .filter((key, index, list) => CONDITIONS[key] && list.indexOf(key) === index);
}

/**
 * Everything a fumble row asks for, in one call.
 *
 * @param {object} row a fumble table row
 * @returns {object}
 */
export function fumbleRowRiders(row) {
  const effect = String(row?.effect ?? "");
  return {
    allyReroll: allyRerollRider(effect),
    levelDCSave: levelDCSaveRider(effect),
    dropWeapon: dropWeaponRider(effect),
    breakWeapon: breakWeaponRider(effect),
    typeSplit: typeSplitDamageRider(effect),
    ignoresDR: ignoresDR(effect),
    reactions: reactionRider(effect),
    randomMovement: randomMovementRider(effect),
    untilInteract: untilInteractRider(effect),
    untilHealed: untilHealedConditions(effect)
  };
}
