import { OPEN_ENDED } from "./dice/open-ended.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Register the world settings that govern check resolution.
 *
 * Rules as written: every d20 check is open-ended in both directions, with the
 * sole exception of flat checks, which compare the die face directly to the DC
 * and are therefore never open-ended. That exception is enforced in TRGCheck
 * rather than here, so it cannot be switched off by mistake.
 *
 * The remaining options are house rules, offered because the rulebook itself
 * notes that a roll may be top-ended or bottom-ended in specific cases.
 */
export function registerSystemSettings() {
  game.settings.register(SYSTEM_ID, "openEndedChecks", {
    name: "Open-Ended Checks",
    hint:
      "Rules as written: open-ended both ways. A 20 is re-rolled and added; a 1 is re-rolled and subtracted. Flat checks are never open-ended regardless of this setting. The other options are house rules.",
    scope: "world",
    config: true,
    type: String,
    default: OPEN_ENDED.BOTH,
    choices: {
      [OPEN_ENDED.BOTH]: "Open-ended both ways (default)",
      [OPEN_ENDED.TOP]: "Top-ended only (20s explode)",
      [OPEN_ENDED.BOTTOM]: "Bottom-ended only (1s explode)",
      [OPEN_ENDED.NONE]: "Closed — a plain d20"
    }
  });

  // Chapter 2, Regional languages: "Your GM will determine what regional
  // languages are available." The book deliberately names none, so the
  // catalogue can't — this is where a campaign's own languages live, and
  // they appear as a Regional group in every character's language picker.
  /*
   * THE OPTIONAL HARDER SAVE DC (3.583.0; page 237, Graham's R14:
   * "World Setting").
   *
   * > "Some GMs may wish to make the Save DC of a spell more difficult
   * >  if its result is Critical or Heroic. If this is the case, a
   * >  Critical result makes the Save DC Hard (+2), and Heroic Very Hard
   * >  (+5). If you apply this result, you do not save any PP."
   *
   * OFF BY DEFAULT, because the book offers it rather than printing it,
   * and because it TAKES AWAY the PP a Critical or Heroic just saved —
   * a table that turned it on without noticing that clause would find
   * their casters quietly poorer.
   */
  game.settings.register(SYSTEM_ID, "harderSaveDCOnCritical", {
    name: "Harder Save DC on Critical / Heroic",
    hint:
      "Page 237's optional rule. A Critical casting makes the spell's Save DC Hard (+2) and a Heroic one Very Hard (+5) — and the caster saves no PP, which the same paragraph requires. Off by default; the book offers this rather than printing it.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // EXTRAPLANAR CREATURES (3.633.0; Fiends & Fables 3.0 block 3, R14):
  // "immediately destroyed when it dies on the material plane and its
  // essence returns to its home plane." On by default; a campaign set on
  // another plane turns it off here.
  game.settings.register(SYSTEM_ID, "extraplanarDestruction", {
    name: "Extraplanar creatures are destroyed on death",
    hint:
      "Fiends & Fables: an Extraplanar creature that dies on the material plane is destroyed and its essence returns home. A card says so when one dies; with Wade Through the Mooks, an Extraplanar mook dies at 0 HP. Turn off while the party is on another plane.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "regionalLanguages", {
    name: "Regional Languages",
    hint:
      "Comma-separated. Chapter 2 leaves regional languages to the GM, so list your campaign's here and they become selectable alongside the 32 named languages. Players can still type a one-off name in the picker.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(SYSTEM_ID, "gridSpeedRounding", {
    name: "Round Speed Down to 5 ft",
    hint:
      "Chapter 6, Encumbered: \"if you are playing with a battle grid, then you always round your speed down to the nearest 5 ft.\" Turn this off for gridless play, where a Speed of 27 is perfectly usable.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "armourGrantsCR", {
    name: "Armour Grants Critical Resistance",
    hint:
      "Optional rule (Chapter 7): medium armour grants CR 1 and heavy armour CR 2. A Vital Strike that names an unarmoured location bypasses this portion of the target's CR automatically (page 203).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // ─────────────────────────────────────────────────────────────────
  // The three optional rules of page 204 (Graham's R12, R13 and R14 of
  // 21 September 2026). All three were printed in the book and had no
  // lever at all until 3.580.0.

  game.settings.register(SYSTEM_ID, "quickDamage", {
    name: "Quick Damage",
    hint:
      "Optional rule (Chapter 7, page 204): \"To speed up the game, you may wish to add extra dice of damage as static damage as well.\" The BAB and critical bonus dice become flat numbers from the page's own table — 1d2 is 1, 1d6 is 4, 1d12 is 7. The weapon's own base dice are still rolled.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "criticalThresholdShift", {
    name: "Modes of Lethality",
    hint:
      "Optional rule (Chapter 7, page 204): \"If you want to have less lethality… simply increase the AV required to inflict criticals. If you want the game to be more lethal, you may decrease the AV required.\" 0 leaves the printed 5/15/25. A positive number raises every band, a negative one lowers them.",
    scope: "world",
    config: true,
    type: Number,
    default: 0,
    range: { min: -4, max: 10, step: 1 }
  });

  game.settings.register(SYSTEM_ID, "specificLocationInjuries", {
    name: "Specific Location Injuries",
    hint:
      "Optional rule (Chapter 7, page 204): the Injured penalty applies only to actions appropriate to the injury. Legs penalise speed and Acrobatics; arms penalise attacks and Athletics. A location the page does not narrow keeps the ordinary all-checks penalty.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "chaosResults", {
    name: "Chaos Results",
    hint:
      "Optional rule. Flags a Chaos Result when a 1 is rolled immediately after an open-ended 20 or 1, or when a d100 check opens on 66.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "positionalAutomation", {
    name: "Automatic Positional Modifiers",
    hint:
      "Automatically apply range increment penalties, the -4 engaged-in-melee ranged penalty, firing-into-melee cover, stray shots, and flanking, using placed tokens' positions on the current scene. Requires both the attacker and target to be on the scene; falls back to manual play otherwise. Disable if your table doesn't use a mapped grid.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "glancingBlows", {
    name: "Glancing Blows",
    hint:
      "Optional rule, off by default. An attack with an Attack Value of 0 or 1 inflicts a glancing blow: damage is rolled normally and halved (round up).",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "turnAutomation", {
    name: "Turn Automation",
    hint:
      "Automates the encounter turn: Phase 1 AP regain (with Stunned, Slowed and Quickened applied), dying checks, and Phase 3 Bleeding and Recurring Damage with their flat checks. Runs on the GM's client only.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "autoChecks", {
    name: "Auto Checks (optional rule)",
    hint:
      "Chapter 4's optional Auto Check rule: for a skill you're trained in, forgo rolling to instead take a flat 10 + your rank bonus, outside stressful situations (an active encounter). Off by default, since the rulebook itself marks this as optional.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "enableLuck", {
    name: "Luck (optional rule, Appendix 5)",
    hint:
      "Appendix 5's optional Luck subsystem: a luck score (15 for a player's character, 0 for an NPC) and Luck Checks that apply fortune to a skill check, attack or saving throw. Off by default, since the rulebook itself presents this as an optional appendix. Enabling adds a Luck field and button to the character sheet and a Luck option to the roll dialogs.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(SYSTEM_ID, "openEndedInitiative", {
    name: "Open-Ended Initiative",
    hint:
      "Optional rule, off by default. As written, the d100 initiative check is not open-ended. Enable this to have 96-100 explode upward and 01-05 downward. Applies to both the sheet button and the combat tracker.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  // CONVICTION IS THE GM'S TO USE (3.619.0; Chapter 12, page 390, Graham's
  // R11): "If the GM opts not to implement the Conviction rules, these feats
  // are not necessary for core gameplay." On by default — it always was.
  game.settings.register(SYSTEM_ID, "useConviction", {
    name: "Use Conviction",
    hint:
      "Chapter 12's Conviction rules: the pool, its spends (Advantage, the +1d6 Bonus, Boost Defence, Cancel Fatigue, Recurring Healing, Surge) and the points gained on levelling. Turn off to hide the pool and every spend button.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "endeavourEnabled", {
    name: "Endeavour (optional rule)",
    hint:
      "Graham's Endeavour Rules — an optional downtime economy. Characters earn Endeavour (Chapter 12's reward table: a Heroic success with risk 2, without risk 1, a Blunder with risk 1, a Significant Challenge 1 — one award per check, given by the GM from the check card), then spend it between sessions on a Skill Point, a General/Racial/Class Feat, or an Ability Score increase. Off by default. Enabling adds an Endeavour table and spend button to the character sheet.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });
}
