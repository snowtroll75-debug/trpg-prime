#!/usr/bin/env node
/**
 * mutate-chapter4 — can verify-chapter4 fail? NEW at 3.556.0.
 *
 * The ones that matter are A1, B1 and D2. Each moves a single cell of a
 * table that everything in the system reads and nothing in the system
 * argues with: a degree boundary one point out, the Bonus Check Table's
 * top row, a bonus type that stops stacking. None of the three would
 * throw, log, or look wrong on a card — they would just quietly change
 * what every roll in the game means.
 *
 * And H4, which is R1 reversed: the ruling of 16 September 2026 was
 * "offer it, never assume it", and `auto: true` is the whole distance
 * between that and a +2 applied to saves nobody was looking at.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RES = path.join(SYSTEM_ROOT, "module", "dice", "resolution.mjs");
const DIALOG = path.join(SYSTEM_ROOT, "module", "apps", "check-dialog.mjs");
const POINTS = path.join(SYSTEM_ROOT, "module", "skill-points.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const CRAFT = path.join(SYSTEM_ROOT, "module", "create-crafting.mjs");
const INCOME = path.join(SYSTEM_ROOT, "module", "earn-income.mjs");
const BASIC = path.join(SYSTEM_ROOT, "module", "data", "basic-actions.mjs");
const SKILLDATA = path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs");
const STANCES = path.join(SYSTEM_ROOT, "module", "combat", "basic-action-stances.mjs");
const SPECIALIST = path.join(SYSTEM_ROOT, "module", "specialist-skill-table.mjs");
const WORKFLOW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const REGISTRY = path.join(SYSTEM_ROOT, "module", "bonuses", "registry.mjs");
const CONFIG = path.join(SYSTEM_ROOT, "module", "config.mjs");
const JUMPING = path.join(SYSTEM_ROOT, "module", "jumping.mjs");
const REACTIONS = path.join(SYSTEM_ROOT, "module", "combat", "reactions.mjs");
const MEDDC = path.join(SYSTEM_ROOT, "module", "medicine-dc.mjs");
const MEDMOD = path.join(SYSTEM_ROOT, "module", "medicine-modifiers.mjs");
const PAIN = path.join(SYSTEM_ROOT, "module", "combat", "pain-tolerance.mjs");
const ATTITUDE = path.join(SYSTEM_ROOT, "module", "attitude.mjs");
const DICE = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter4.mjs");

const MUTATIONS = [
  /* ---------------- the Action Resolution Table ---------------- */
  {
    file: RES,
    name: "A1 THE QUIET ONE: Partial starts one point lower",
    from: '  { key: "partial", label: "Partial", min: -4, rank: 3, success: false },',
    to: '  { key: "partial", label: "Partial", min: -5, rank: 3, success: false },',
    breaks: "A2 — 'Fails by less than 5' is Partial and 'Fails by 5+' is Failure; this moves the line"
  },
  {
    file: RES,
    name: "A2 equalling the DC stops being a success",
    from: '  { key: "success", label: "Success", min: 0, rank: 4, success: true },',
    to: '  { key: "success", label: "Success", min: 1, rank: 4, success: true },',
    breaks: "A2/A3 — 'Equals or Exceeds — Success', and every DC in the book is written to it"
  },

  /* ---------------- the Bonus Check Table ---------------- */
  {
    file: RES,
    name: "B1 the top of the Bonus Check Table reads +5",
    from: "  heroic: 4,",
    to: "  heroic: 5,",
    breaks: "B1/B2 — Aid, Meditation and every bonus-check action read this table"
  },
  {
    file: RES,
    name: "B2 an unrecognised degree is given a bonus rather than nothing",
    from: "  return BONUS_CHECK_TABLE[degreeKey] ?? 0;",
    to: "  return BONUS_CHECK_TABLE[degreeKey] ?? 2;",
    breaks: "B4 — a typo in a degree key would hand out +2 forever and look deliberate"
  },

  /* ---------------- difficulty, level DC, taking time, auto check ---- */
  {
    file: RES,
    name: "C1 the Easy rung is a point harder than printed",
    // THE LABEL MOVED AT 3.566.0, not the rule. 3.8.1 rewrote every
    // printed difficulty as "Easy (DC -2)" — Graham's own correction of
    // the pages 81-90 errata E1, and the printed form of his 16 September
    // ruling that a difficulty modifier moves the DC and never the roll.
    // This anchor carried the old label and reported ANCHOR MISSING.
    from: '  { key: "easy", label: "Easy (DC -2)", modifier: -2 },',
    to: '  { key: "easy", label: "Easy (DC -2)", modifier: -3 },',
    breaks: "C1 — and Aid rolls at Easy, so every assist in the game moves with it"
  },
  {
    file: RES,
    name: "C2 Routine stops resolving itself and becomes a +0 check",
    from: '  { key: "routine", label: "Routine (no check)", modifier: 0, auto: "success" },',
    to: '  { key: "routine", label: "Routine (no check)", modifier: 0 },',
    breaks: "C2/C4 — 'Routine: No Check Required' is not the same as a Medium check"
  },
  {
    file: RES,
    name: "C3 Impossible automatically SUCCEEDS",
    from: '  { key: "impossible", label: "Impossible (auto fail)", modifier: 0, auto: "failure" }',
    to: '  { key: "impossible", label: "Impossible (auto fail)", modifier: 0, auto: "success" }',
    breaks: "C3 — the label would still read 'auto fail' while the rung handed out successes"
  },
  {
    file: RES,
    name: "C4 the level modifier is 15",
    from: "LEVEL_DC_BASE = 14;",
    to: "LEVEL_DC_BASE = 15;",
    breaks: "C6/C7 — every level-based DC in the system, off by one"
  },
  {
    file: RES,
    name: "C5 an Auto Check counts ranks twice",
    from: "  return 10 + Math.max(0, Math.round(Number(ranks ?? 0)));",
    to: "  return 10 + 2 * Math.max(0, Math.round(Number(ranks ?? 0)));",
    breaks: "C9 — '10 + your rank bonus', and nothing else at all"
  },
  {
    file: DIALOG,
    name: "C6 Taking Time becomes untyped, so it stacks with a circumstance bonus",
    from: '        value: 4,\n        type: "circumstance"',
    to: '        value: 4,\n        type: "untyped"',
    breaks: "C8 — 'a special +4 CIRCUMSTANCE bonus', and only one of those applies at a time"
  },

  /* ---------------- the eleven bonus types ---------------- */
  {
    file: RES,
    name: "D1 class bonuses stop stacking",
    from: '  class: { label: "Class", stacking: "stack" },',
    to: '  class: { label: "Class", stacking: "highest" },',
    breaks: "D1/D4 — Roguish Skill, Song & Dance and Hunt Prey all stack onto the level table's own"
  },
  {
    file: RES,
    name: "D2 THE ONE THE OLD COMMENT INVITED: race bonuses take the highest",
    from: '  race: { label: "Race", stacking: "stack" },',
    to: '  race: { label: "Race", stacking: "highest" },',
    breaks: "D1/D4/J4 — page 62 and Appendix 1 both say they stack; this is the edit D2 warned about"
  },
  {
    file: RES,
    name: "D3 dodge bonuses stop stacking with each other",
    from: '  dodge: { label: "Dodge", stacking: "dodge" },',
    to: '  dodge: { label: "Dodge", stacking: "highest" },',
    breaks: "D1 — 'stack with all other bonuses to DB even other dodge bonuses'"
  },

  /* ---------------- ranks, flat checks ---------------- */
  {
    file: POINTS,
    name: "E1 skill ranks stop being capped at character level",
    from: "  return Math.min(want, levelCap, affordable);",
    to: "  return Math.min(want, affordable);",
    breaks: "E1 — page 62 says it three times, and nothing else would refuse a 9th rank at 4th level"
  },
  {
    // RE-ANCHORED at 3.597.0. `missChanceDC` gained the invisible condition
    // (R12) and became a collect-then-compare, so the early-return this was
    // aimed at no longer exists. The rule it guards is unchanged, and it is
    // the rule my first draft of R12 broke: page 64's highest-DC wins.
    file: ATTACK,
    name: "E2 two flat checks roll at the LOWER DC",
    from: "  return real.length ? Math.max(...real) : null;",
    to: "  return real.length ? Math.min(...real) : null;",
    breaks: "E4 — 'just roll once using the highest DC'"
  },

  /* ---------------- Create and Earn Income ---------------- */
  {
    file: CRAFT,
    name: "F1 the Create table keeps climbing past its last row",
    from: "  return Math.min(11, 3 + Math.floor((m - 5) / 2));",
    to: "  return 3 + Math.floor((m - 5) / 2);",
    breaks: "G3 — the printed table stops at 21+ → 11"
  },
  {
    file: INCOME,
    name: "F2 a Critical Earn Income counts ranks as one higher, not two",
    from: "      return { perDay: level * (rank + 2), fired: false, label: \"Critical — outstanding work\" };",
    to: "      return { perDay: level * (rank + 1), fired: false, label: \"Critical — outstanding work\" };",
    breaks: "G7 — 'Your skill ranks are considered to be 2 higher'"
  },

  /* ---------------- the Basic Action register ---------------- */
  {
    file: BASIC,
    name: "F3 an action loses a trait from its printed line",
    from: '    traits: "Attack, Flourish, Movement, Open",',
    to: '    traits: "Attack, Flourish, Movement",',
    breaks: "F2 — Charge is Open, which is what stops a second Open action in the same turn"
  },
  {
    file: BASIC,
    name: "F4 a Reaction is normalised into an AP cost",
    from: '    name: "Attack of Opportunity",\n    traits: "Attack",\n    apCost: "Reaction",',
    to: '    name: "Attack of Opportunity",\n    traits: "Attack",\n    apCost: "0",',
    breaks: "F2/F3 — a Reaction is not a 0 AP action; it needs a trigger and a reaction to spend"
  },

  /* ---------------- Avert Gaze (D1 / R1) ---------------- */
  {
    file: STANCES,
    name: "H1 Avert Gaze grants a flat bonus to every save",
    from: "    changes: [],",
    to: '    changes: [{ key: "system.combat.saves.will.circumstance", value: 2 }],',
    breaks: "H2 — the blanket bonus the original note was right to refuse"
  },
  {
    file: STANCES,
    name: "H2 THE RULING REVERSED: the bonus applies itself",
    from: '        scope: "Saves against a visual ability that requires looking at it",\n        auto: false,',
    to: '        scope: "Saves against a visual ability that requires looking at it",\n        auto: true,',
    breaks: "H4/H10 — Graham ruled offer-it-never-assume-it; the trait does not mean you had to look"
  },
  {
    file: STANCES,
    name: "H3 the GM's-call entry stops being scoped, so both offer at once",
    from: '        when: { checkTypes: ["save"], not: { traits: ["visual"] } }',
    to: '        when: { checkTypes: ["save"] }',
    breaks: "H6 — two entries offered on one save is a doubled +2 waiting to be ticked twice"
  },
  {
    file: BASIC,
    name: "H4 the card goes back to telling the player to apply it by hand",
    from: "The bonus is OFFERED on your saving-throw dialogs while the stance is up",
    to: "Apply manually as a save modifier",
    breaks: "H11/H12 — the sentence that described the gap this release closed"
  },

  /* ---------------- Identify Power through a specialist skill ---- */
  {
    file: SKILLDATA,
    name: "I1 Identify Power stops being open to specialist skills",
    // Anchored with the line after it: Disable a Peril declares the same
    // flag since 3.629.0.
    from: "    specialistSkills: true,\n    name: \"Identify Power\",",
    to: "    specialistSkills: false,\n    name: \"Identify Power\",",
    breaks: "I1 — Graham's amendment of 16 September 2026, undone by one word"
  },
  {
    file: SKILLDATA,
    name: "I1b the card goes back to describing only the tradition table",
    from: "Ethereal/Occultism, Verdant/Nature), OR an appropriate specialist skill, which you invoke ",
    to: "Ethereal/Occultism, Verdant/Nature). You invoke ",
    breaks: "I2a — the rule would work while its own card said it did not"
  },
  {
    file: SPECIALIST,
    name: "I2 a specialist invocation reads as an ordinary skill",
    from: "  if (!raw.startsWith(SPECIALIST_PREFIX)) return { specialist: false, key: raw };",
    to: "  if (raw) return { specialist: false, key: raw };",
    breaks: "I3 — the roll would look for a specialist key in system.skills and find nothing"
  },
  {
    file: WORKFLOW,
    name: "I3 the specialist check reads the ordinary skills collection",
    from: "      const specialist = system.specialistSkills?.[invoked.key];",
    to: "      const specialist = system.skills?.[invoked.key];",
    breaks: "I6 — a Herb Lore roll would silently carry no modifiers at all"
  },
  {
    file: WORKFLOW,
    name: "I4 the Trained gate stops asking whether you hold the specialist skill",
    from: "      if (!actor.system?.specialistSkills?.[invokedForGate.key]) {",
    to: "      if (false) {",
    breaks: "I8 — anyone could Identify Power through a specialist skill they do not have"
  },
  {
    file: WORKFLOW,
    name: "I5 the prefixed key is handed to conditionals as the subject",
    // RE-ANCHORED at 3.567.0, to the one line it actually changes. It
    // used to carry `actionKey` and `defaultDifficulty` with it, which
    // bought no uniqueness — the six-space indent already separates the
    // dialog's copy from the roll's — and died the moment block 10
    // inserted the `targetTypes` axis between them. The brittleness
    // check had been saying so about anchors of this shape all along.
    from: '      subject: readInvokedSkillKey(invokedSkillKey ?? "").key || action.skills?.[0] || "",',
    to: '      subject: invokedSkillKey || action.skills?.[0] || "",',
    breaks: "I9 — a conditional scoped to the specialist skill would stop matching its own roll"
  },
  {
    file: SHEET,
    name: "I6 the specialist row stops offering the action",
    // RE-ANCHORED 3.630.0: a feat may open more actions to the row (Veil Tracker).
    from: "    const openToSpecialists = [...specialistSkillActions(SKILL_ACTIONS), ...opened]",
    to: "    const openToSpecialists = [...opened]",
    breaks: "I10 — the rule would exist with no way in the interface to reach it"
  },

  /* ---------------- the stacking comment (D2) ---------------- */
  {
    file: WORKFLOW,
    name: "I8c R2'S RECORD IS DELETED — the gate survives with nothing to justify it",
    from: "    // missing. DO NOT REMOVE THIS GATE on the strength of not finding",
    to: "    // (provenance removed)",
    breaks: "I8b — the 3.8 book deleted the sentence this gate rests on; only this comment says why it stays"
  },
  {
    file: REGISTRY,
    name: "J1 the comment goes back to citing a rule the book never printed",
    from: " * Per-target stacking overrides. There are none, and there should not be.",
    to: " * Per-target stacking overrides.\n *\n * Chapter 4 says multiple race bonuses to the same *skill* do not stack and are wasted.",
    breaks: "J1/J3 — every stacking statement in the book was searched; that sentence is not one"
  },

  /* ---------------- the Master Skills Table (D3) ---------------- */
  {
    file: CONFIG,
    name: "K1 THE QUIET ONE: Acrobatics runs on Strength",
    from: '  acrobatics: { label: "Acrobatics", ability: "dexterity" },',
    to: '  acrobatics: { label: "Acrobatics", ability: "strength" },',
    breaks: "K2 — every Acrobatics roll in the game, and entirely plausible on a sheet"
  },
  {
    file: CONFIG,
    name: "K2 Perform runs on Wisdom",
    from: '  perform: { label: "Perform", ability: "charisma" },',
    to: '  perform: { label: "Perform", ability: "wisdom" },',
    breaks: "K2 — page 74 prints Cha, and Perform is how a Bard earns a living"
  },
  {
    file: SKILLDATA,
    name: "K3 High Jump becomes a trained action",
    from: '    key: "highJump",\n    name: "High Jump",\n    skills: ["athletics"],',
    to: '    key: "highJump",\n    name: "High Jump",\n    skills: ["athletics"],\n    proficiency: "trained",',
    breaks: "K5 — page 77 lists it under Athletics' UNTRAINED actions"
  },

  /* ---------------- the two jump DCs (D1 / R1) ---------------- */
  {
    file: JUMPING,
    name: "L1 THE QUIET ONE: High Jump is five per foot",
    from: '    dcPerFoot: 4,\n    formula: "4 per foot jumped"',
    to: '    dcPerFoot: 5,\n    formula: "4 per foot jumped"',
    breaks: "L1/L3 — and the prompt would still have quoted 4, which is how nobody would notice"
  },
  {
    file: JUMPING,
    name: "L2 Long Jump is two per foot",
    from: '    dcPerFoot: 1,\n    formula: "1 per foot jumped"',
    to: '    dcPerFoot: 2,\n    formula: "1 per foot jumped"',
    breaks: "L2/L4 — 'equal to the amount of feet that you are attempting to jump'"
  },
  {
    file: JUMPING,
    name: "L3 THE MISSING RUN-UP STOPS DOUBLING THE DC",
    from: "const NO_RUN_UP_MULTIPLIER = 2;",
    to: "const NO_RUN_UP_MULTIPLIER = 1;",
    breaks: "L3/L4 — 'if you didn't Stride at least 10 feet, the DC of the jump is doubled'"
  },
  {
    file: JUMPING,
    name: "L4 an undeclared distance becomes a DC of nothing",
    from: "  if (!(distance > 0)) return null;",
    to: "  if (distance < 0) return null;",
    breaks: "L6/L8 — a jump at DC 0 cannot be failed, and zero is the field's own default"
  },
  {
    file: WORKFLOW,
    name: "L5 cancelling and declining a distance become the same answer",
    // WIDENED AT 3.565.0 WITH THE LINE ABOVE IT. `if (declared ===
    // undefined) return null;` is the shared shape of every pre-roll
    // prompt in this workflow, and pages 91-100 added five more of them
    // — the anchor went from unique to eight matches in one release and
    // reported ANCHOR x8 rather than proving anything. The jump prompt's
    // own call is what makes it unique, and it is a line this mutation
    // is about rather than a passenger.
    from: "    const declared = await promptJumpDistance(action.key);\n    // THREE OUTCOMES, NOT TWO.",
    to: "    const declared = await promptJumpDistance(action.key);\n    if (!declared) return null;\n    // THREE OUTCOMES, NOT TWO.",
    breaks: "L19 — leaving the distance at zero would abandon the action instead of rolling it"
  },
  {
    file: WORKFLOW,
    name: "L6 the DC ignores the missing run-up",
    from: "    resolved.dc = jumpSetup.dc;",
    to: "    resolved.dc = jumpSetup.base;",
    breaks: "L20 — the card would print the doubling in its working and roll against the half"
  },

  /* ---------------- Kip Up's trait, and what it nearly cost ---- */
  {
    file: SKILLDATA,
    name: "M1 Kip Up loses the Movement trait again",
    from: '    traits: "Movement",\n    apCost: "Free",\n    checkType: "skill",\n    against: "fixed",\n    fixedDC: 20,',
    to: '    traits: "",\n    apCost: "Free",\n    checkType: "skill",\n    against: "fixed",\n    fixedDC: 20,',
    breaks: "M1 — page 76 prints it under MOVEMENT, like Catfall, Hover and Nimble Crawl"
  },
  {
    file: REACTIONS,
    name: "M2 THE ONE THE TRAIT FIX WOULD HAVE CAUSED: a Free action spends the Full Defence Move",
    from: "  if (isFreeAction(action)) return false;",
    to: "  if (isFreeAction(action)) { /* counted anyway */ }",
    breaks: "M5/M6 — Kip Up would burn the single Move Full Defence allows, and the Stride after it would be refused"
  },

  /* ---------------- O: pages 81-90 ---------------- */
  {
    file: SKILLDATA,
    name: "O1 THE ONE THAT REFUSED THE RAGE: Invoke Rage gets its Open trait back",
    from: "    traits: \"Concentrate, Emotion, Mental, Rage\",\n    apCost: \"Varies\",\n    requirements: \"You have the Frenzy feat; you aren't fatigued or raging.\",",
    to: "    traits: \"Concentrate, Emotion, Mental, Open, Rage\",\n    apCost: \"Varies\",\n    requirements: \"You have the Frenzy feat; you aren't fatigued or raging.\",",
    breaks: "O5 — a character who has already attacked this turn could not start raging"
  },
  {
    file: SKILLDATA,
    name: "O2 a printed action drops off its skill's register",
    from: '    key: "clearMind",',
    to: '    key: "clearMindX",',
    breaks: "O1 — page 87 lists Clear Mind under Meditation's trained actions"
  },
  {
    file: MEDDC,
    name: "O3 THE QUIET ONE: Severe bleeding is treated as Moderate",
    from: "  severe: 30,",
    to: "  severe: 25,",
    breaks: "O6 — page 86 prints Severe (9-12) at DC 30, and nothing on the card would look wrong"
  },
  {
    file: MEDDC,
    name: "O4 a creature that is not bleeding becomes a DC 20 patient",
    from: "  if (!band) return null;",
    to: "  if (!band) return { dc: 20, band: \"light\", value, label: \"not bleeding\" };",
    breaks: "O7 — First Aid's own requirement is 'an adjacent creature that is bleeding'"
  },
  {
    file: MEDDC,
    name: "O5 the EASIEST affliction is treated rather than the worst",
    from: "  return candidates.reduce((worst, entry) => (entry.dc > worst.dc ? entry : worst));",
    to: "  return candidates.reduce((worst, entry) => (entry.dc < worst.dc ? entry : worst));",
    breaks: "O8/O9 — a Medicine check would report success over the affliction still killing them"
  },
  {
    file: SKILLDATA,
    name: "O6 Stunned Manoeuvre's Very Hard rung goes back to landing on nothing",
    from: '    difficulty: "veryHard",\n    checkType: "skill",\n    against: "levelDC",',
    to: '    difficulty: "veryHard",\n    checkType: "skill",\n    against: "none",',
    breaks: "O13/O15 — the +5 would be added to no DC at all"
  },
  {
    file: DICE,
    name: "O7 THE INSTRUCTION REVERSED: the difficulty rung moves to the roll",
    from: "    return Number(this.baseDC) + Number(difficulty?.modifier ?? 0);",
    to: "    return Number(this.baseDC);",
    breaks: "O14 — Graham, 16 Sept 2026: always apply the modifier to the DC"
  },
  {
    file: MEDMOD,
    name: "O8 Treat Wounds' additional targets become free",
    from: "  return extra * TREAT_WOUNDS_DC_PER_TARGET;",
    to: "  return 0;",
    breaks: "O16 — 'for every 5 that you increase the DC you may heal an additional target'"
  },
  {
    file: MEDMOD,
    name: "O9 Pain Tolerance's extra points become free",
    from: "  return 1 + Math.floor(extra / PAIN_TOLERANCE_DC_PER_POINT);",
    to: "  return 1 + extra;",
    breaks: "O17 — the book prices this per whole four, not per point of DC"
  },
  {
    file: PAIN,
    name: "O10 the suppression goes back to always ignoring exactly one",
    from: "  const ignored = Math.max(1, Math.floor(Number(points) || 1));\n  return Math.max(0, Math.floor(Number(currentValue) || 0) - ignored);",
    to: "  return Math.max(0, Math.floor(Number(currentValue) || 0) - 1);",
    breaks: "O18 — the trade would be paid for and not delivered"
  },
  {
    file: ATTITUDE,
    name: "O11 a FRIENDLY animal improves the degree too",
    from: '  return attitudeIndex(attitude) === attitudeIndex("helpful") ? 1 : 0;',
    to: '  return attitudeIndex(attitude) >= attitudeIndex("friendly") ? 1 : 0;',
    breaks: "O20 — page 83 names one rung: 'if the animal is helpful towards you'"
  },
  {
    file: ATTITUDE,
    name: "O12 THE SIGN THE DEGREE_ORDER COMMENT WARNS ABOUT: improving makes it worse",
    from: "  return order[Math.max(0, index - Math.floor(by))];",
    to: "  return order[Math.min(order.length - 1, index + Math.floor(by))];",
    breaks: "O22 — DEGREE_ORDER runs best to worst, so better is one step BACK"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([
  RES, DIALOG, POINTS, ATTACK, CRAFT, INCOME, BASIC, SKILLDATA, STANCES,
  SPECIALIST, WORKFLOW, SHEET, REGISTRY, CONFIG, JUMPING, REACTIONS,
  MEDDC, MEDMOD, PAIN, ATTITUDE, DICE, CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter4: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-chapter4: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-chapter4: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
