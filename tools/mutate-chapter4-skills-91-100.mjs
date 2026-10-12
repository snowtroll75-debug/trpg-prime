#!/usr/bin/env node
/**
 * mutate-chapter4-skills-91-100 — can the block-9 verify fail?
 *
 * NEW at 3.565.0.
 *
 * P2 AND W1 ARE THE PAIR THIS RUNNER EXISTS FOR. Page 91's NEGATIVE PP
 * rule had never fired in this system's history — every spend site wrote
 * `Math.max(0, pool - cost)` and discarded the shortfall the rule is
 * about. P2 puts the clamp back in the pure function; W1 takes the
 * spend out of the workflow. Either one leaves the arithmetic looking
 * right and the pool untouched, which is exactly how the gap survived
 * this long.
 *
 * T3 IS THE STEALTH ONE. Drop the cancelling row and a character who
 * Takes Cover before Sneaking rolls at +8 where page 93 allows +4 — a
 * printed exception overridden by an Active Effect that does not know it
 * exists. Nothing else in the harness would notice.
 *
 * X1 IS THE HOUSEKEEPING ONE, and it is here because the defect it
 * guards against is invisible to `verify-rules-have-callers`: that
 * ratchet counts uncalled EXPORTS, and every one of the nine dead names
 * removed from outcome-effects.mjs was module-local.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const PP = path.join(SYSTEM_ROOT, "module", "power-points.mjs");
const SR = path.join(SYSTEM_ROOT, "module", "skill-requirements.mjs");
const RI = path.join(SYSTEM_ROOT, "module", "recharge-item.mjs");
const SP = path.join(SYSTEM_ROOT, "module", "sense-power.mjs");
const ST = path.join(SYSTEM_ROOT, "module", "stealth.mjs");
const SV = path.join(SYSTEM_ROOT, "module", "survival-rules.mjs");
const TH = path.join(SYSTEM_ROOT, "module", "thievery.mjs");
const SM = path.join(SYSTEM_ROOT, "module", "sense-motive.mjs");
const CI = path.join(SYSTEM_ROOT, "module", "charged-items.mjs");
const BC = path.join(SYSTEM_ROOT, "module", "combat", "basic-action-conditions.mjs");
const WF = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const SKILLDATA = path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs");
const RES = path.join(SYSTEM_ROOT, "module", "dice", "resolution.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-chapter4-skills-91-100.mjs");

const MUTATIONS = [
  /* ── P: power points ───────────────────────────────────────────── */
  {
    file: PP,
    name: "P2 THE SHORTFALL IS DISCARDED — the rule that never fired, restored",
    from: "  const shortfall = Math.max(0, spent - pool);",
    to: "  const shortfall = 0;",
    breaks: "P2b/P4 — the pool still floors correctly and no Soul Drain is ever charged, "
      + "which is exactly what every spend site did before 3.565.0"
  },
  {
    file: PP,
    name: "P3 THE BOUNDARY SLIPS — emptying your pool drains you",
    from: "  const shortfall = Math.max(0, spent - pool);",
    to: "  const shortfall = Math.max(0, spent - pool + 1);",
    breaks: "P3 — spending exactly what you hold would cost 5 Soul Drain"
  },
  {
    file: PP,
    name: "P5b A NEGATIVE COST BECOMES A REFUND",
    from: "  const spent = Math.max(0, Math.trunc(Number(cost) || 0));",
    to: "  const spent = Math.trunc(Number(cost) || 0);",
    breaks: "P5b — 'spend -3 PP' would hand the character three points and hide the bug"
  },

  /* ── A: the Adept gate ─────────────────────────────────────────── */
  {
    file: SR,
    name: "A2b THE TIER LIST IS NOT SPLIT — the Bard is refused",
    from: "  return String(tiers ?? \"\")\n    .split(/[,/]/)",
    to: "  return String(tiers ?? \"\")\n    .split(/,/)",
    breaks: "A2b — a Bard's \"Adept/Expert\" arrives as one string no equality test matches, "
      + "the same mistake effectiveTiers records for class feats"
  },
  {
    file: SR,
    name: "A4 AN UNGATED SKILL IS GATED TOO",
    from: "  if (!needed) return true;",
    to: "  if (!needed) return Boolean(String(tiers ?? \"\").trim());",
    breaks: "A4 — a classless character could put ranks in nothing at all"
  },

  /* ── R: Recharge Item ──────────────────────────────────────────── */
  {
    file: RI,
    name: "R3b THE LADDER ROUNDS DOWN — a Success does nothing below 4th level",
    from: "  return Math.ceil(level / per);",
    to: "  return Math.floor(level / per);",
    breaks: "R3b — 'round up' is printed, and a floor makes the action inert for four levels"
  },
  {
    file: RI,
    name: "R6 A PARTIAL LOCKS THE ITEM OUT",
    from: "    immune: gains || fumble,",
    to: "    immune: true,",
    breaks: "R6 — a Partial offers a retry, and an item locked out cannot be retried"
  },
  {
    file: CI,
    name: "R8b A FLEXIBLE WAND LOSES ITS EXTRA LEVEL",
    from: "  if (kind === \"wand\") return wandLevel(costs[0] ?? 0, { flexible: Boolean(flag.flexible) });",
    to: "  if (kind === \"wand\") return wandLevel(costs[0] ?? 0);",
    breaks: "R8b — and with it the DC of recharging one"
  },

  /* ── S: Sense Power ────────────────────────────────────────────── */
  {
    file: SP,
    name: "S4 THE AURA MODIFIERS SUM INSTEAD OF TAKING THE WORST",
    from: "  const worst = chosen.reduce((a, b) => (b.modifier < a.modifier ? b : a));",
    to: "  const worst = { label: chosen[0].label, modifier: chosen.reduce((s, r) => s + r.modifier, 0) };",
    breaks: "S4 — three ticked boxes would reach -30 against a DC the GM just typed"
  },
  {
    file: SP,
    name: "S2 AN UNDECLARED AURA STILL OPPOSES THE CHECK",
    from: "  if (!chosen.length) return null;",
    to: "  if (!chosen.length) return { label: \"Aura\", value: -5, type: \"circumstance\" };",
    breaks: "S2 — ordinary magic is simply found; an untouched dialog must change nothing"
  },

  /* ── T: Stealth ────────────────────────────────────────────────── */
  {
    file: ST,
    name: "T3 TAKE COVER'S +8 IS LEFT TO STACK — D9, restored",
    from: "  const standing = Math.max(0, Math.trunc(Number(takeCoverStealthBonus) || 0));",
    to: "  const standing = 0;",
    breaks: "T3 — a character who Takes Cover then Sneaks rolls +8 where page 93 allows +4"
  },
  {
    file: ST,
    name: "T7c AN UNKNOWN SIZE IS TREATED AS TOO BIG",
    from: "  if (!key) return null;",
    to: "  if (!key) return false;",
    breaks: "T7c — the commonest case is an object that is not on the sheet at all"
  },
  {
    file: BC,
    name: "T8 HIDE STOPS APPLYING ITS CONDITION",
    from: "  hide: {\n    success: [{ target: \"self\", conditionKey: \"hidden\", active: true }]\n  },",
    to: "  hide: {\n  },",
    breaks: "T8 — back to the gap the audit found: Sneak transitions and Hide does not"
  },
  {
    file: BC,
    name: "T9 A FUMBLED SNEAK KEEPS ITS CONCEALMENT",
    from: "    fumble: [\n      { target: \"self\", conditionKey: \"undetected\", active: false },\n      { target: \"self\", conditionKey: \"hidden\", active: false }\n    ]",
    to: "    fumble: []",
    breaks: "T9 — 'you've been spotted' would leave the sneaker still Hidden"
  },

  /* ── V: Survival ───────────────────────────────────────────────── */
  {
    file: SV,
    name: "V1 THE FREE FOUR BECOME FREE THREE",
    from: "const COVER_TRACKS_FREE_CHARACTERS = 4;",
    to: "const COVER_TRACKS_FREE_CHARACTERS = 3;",
    breaks: "V1 — 'beyond the first four' is the whole rule and the off-by-one is invisible "
      + "unless 4 and 5 are both pinned"
  },
  {
    file: SV,
    name: "V2e THE FIVE-HERB CEILING IS REMOVED",
    from: "  return Math.min(MAX_HERBS_AT_ONCE, 1 + Math.floor(held / RANKS_PER_EXTRA_HERB));",
    to: "  return 1 + Math.floor(held / RANKS_PER_EXTRA_HERB);",
    breaks: "V2f — the printed 'maximum of 5 herbs at once' would not hold"
  },
  {
    file: SV,
    name: "V4 A HEROIC GATHERS NOTHING — 3.402.0's bug again",
    from: "const HERB_YIELD = Object.freeze({ heroic: 4, critical: 4, success: 2, partial: 1 });",
    to: "const HERB_YIELD = Object.freeze({ critical: 4, success: 2, partial: 1 });",
    breaks: "V4 — rolling better making things worse, which this project has now shipped once"
  },
  {
    file: SV,
    name: "V5b A FAILED GATHER PICKS UP THE FULL-DAY BONUS",
    from: "  if (!base) return 0;",
    to: "  if (!base) return soleActivity ? 1 : 0;",
    breaks: "V5b — nothing plus a bonus is still nothing"
  },

  /* ── H: Thievery ───────────────────────────────────────────────── */
  {
    file: TH,
    name: "H2 THE COMBAT AUTO-FAIL IS DROPPED",
    from: "  if (inCombat) return \"the creature is in combat\";",
    to: "  if (false) return \"the creature is in combat\";",
    breaks: "H2 — a successful mid-encounter pickpocket, which is what the system did before"
  },
  {
    file: TH,
    name: "H3 A CRITICAL EARNS ONE SUCCESS, NOT TWO",
    from: "  if (key === \"critical\") return 2;",
    to: "  if (key === \"critical\") return 1;",
    breaks: "H3 — 'achieving two successes towards disabling it' is the printed difference "
      + "between a Critical and a Success on this action"
  },
  {
    file: TH,
    name: "H5 A FUMBLE RESETS THE PROGRESS",
    from: "  const banked = Math.min(need, Math.max(0, Math.trunc(Number(already) || 0)) + earned);",
    to: "  const banked = earned;",
    breaks: "H5 — the harsher reading of a sentence the book did not write"
  },

  /* ── M: Detect Deception ───────────────────────────────────────── */
  {
    file: SM,
    name: "M1 THE KEY KEEPS ITS DOTS — 3.559.1's trap, for the third time",
    from: "  return String(targetUuid ?? \"\").trim().replaceAll(\".\", \"_\").toLowerCase();",
    to: "  return String(targetUuid ?? \"\").trim().toLowerCase();",
    breaks: "M1 — setFlag would nest the record a level deeper than every reader looks"
  },
  {
    file: SM,
    name: "M4 A PLAIN SUCCESS CLEARS THE MISREAD",
    from: "  else if (outcome === \"critical\" || outcome === \"heroic\") delete next[key];",
    to: "  else if (outcome !== \"failure\") delete next[key];",
    breaks: "M4 — 'until you achieve a critical success' would last exactly one check"
  },
  {
    file: SM,
    name: "M8b A CLEARED KEY TRAVELS AS AN ABSENCE — the live defect, restored",
    from: "    if (!(key in now)) patch[`${prefix}.${key}`] = deletion;",
    to: "    if (false) patch[`${prefix}.${key}`] = deletion;",
    breaks: "M8b/M8c — setFlag merges, so a Critical would print \"cleared\" on the card "
      + "while the -4 stayed on the sheet. This is what shipped in 3.565.0 and what "
      + "driving it live caught"
  },
  {
    file: SM,
    name: "M9 AN UNCHANGED RECORD STILL PATCHES",
    from: "    if (!was[key]) patch[`${prefix}.${key}`] = true;",
    to: "    patch[`${prefix}.${key}`] = true;",
    breaks: "M9 — a write on every roll, and the empty patch is what stops one happening"
  },
  {
    file: SKILLDATA,
    name: "N1 THE OLD PRE-3.8.1 NAME COMES BACK",
    from: 'name: "Sense Magic (Broad)"',
    to: 'name: "Sense Power (Broad)"',
    breaks: "N1 — the 3.8.1 register settled on Sense Magic, and a stale display name is "
      + "what sent this audit looking for an errata that no longer exists"
  },
  {
    file: SKILLDATA,
    name: "N3 DISABLE DEVICE REGAINS ITS ARTICLE",
    from: 'name: "Disable Device"',
    to: 'name: "Disable a Device"',
    breaks: "N3 — 3.8.1 dropped it from the heading and the index"
  },
  {
    file: SKILLDATA,
    name: "N4 CONCEAL AN OBJECT TAKES THE SEARCHER'S LADDER BACK",
    from: '      success: "The creature does not notice where you concealed the object.",',
    to: '      success: "The searcher finds the concealed object.",',
    breaks: "N4 — errata E7 restored: your own success would print the searcher finding it"
  },
  {
    file: RES,
    name: "N6 THE DIFFICULTY LABEL STOPS NAMING THE DC",
    from: '  { key: "easy", label: "Easy (DC -2)", modifier: -2 },',
    to: '  { key: "easy", label: "Easy (-2)", modifier: -2 },',
    breaks: "N6/N6e — the ambiguity 3.8.1 spent a revision removing, back in the dialog"
  },
  {
    file: WF,
    name: "G2 A HANDLER READS THE RAW DEGREE — the live defect of 3.565.1",
    from: "    const next = withMisread(held, targetActor.uuid, degree);",
    to: "    const next = withMisread(held, targetActor.uuid, shadowborn.degree);",
    breaks: "G1/G2/W13 — a Detect Deception that BLUNDERS prints \"Fumble\" on the card "
      + "and writes nothing, because the action declares no blunder"
  },
  {
    file: WF,
    name: "G2b RECHARGE ITEM READS THE RAW DEGREE",
    from: "      const consequence = rechargeConsequence(degree);",
    to: "      const consequence = rechargeConsequence(shadowborn.degree);",
    breaks: "G1/G2 — same failure on the action that actually moves PP"
  },
  {
    file: WF,
    name: "G3 A HANDLER IS GATED ON rawDegree AGAIN",
    from: '  if (action.key === "gatherHerbs" && gatherHerbsSetup && degree) {',
    to: '  if (action.key === "gatherHerbs" && gatherHerbsSetup && rawDegree) {',
    breaks: "G3 — a degree the action does not declare reaches a handler with no branch "
      + "for it, and the yield line silently reads zero"
  },
  {
    file: WF,
    name: "W13b THE WRITE GOES BACK TO setFlag",
    from: "      await actor.update(patch);",
    to: "      await actor.setFlag?.(SYSTEM_ID, DETECT_DECEPTION_FLAG, next);",
    breaks: "W13b/W13c — the merge bug again, at the one call site that matters"
  },
  {
    file: SM,
    name: "M6 THE RECORD IS MUTATED IN PLACE",
    from: "  const next = { ...(record ?? {}) };",
    to: "  const next = record ?? {};",
    breaks: "M6 — the caller holds a live document flag, and a write gets skipped because "
      + "'nothing changed'"
  },

  /* ── W: the wiring ─────────────────────────────────────────────── */
  {
    file: WF,
    name: "W1 THE PP IS NEVER SPENT — the defect, restored",
    from: "      const paid = await applyPowerPointCost(actor, ppCost, ppLabel);",
    to: "      const paid = { note: \"\" };",
    breaks: "W1 — Dispel, Sigil and Recharge Item cost nothing again"
  },
  {
    file: WF,
    name: "W3 DISPEL LOSES ITS COUNTERACT MODIFIER",
    from: "    const value = counteractModifier(dispelSetup.pp, dispelSetup.effectValue);",
    to: "    const value = 0;",
    breaks: "W3 — the action the rulebook calls a counteract check stops being one"
  },
  {
    file: WF,
    name: "W8 THE TAKE COVER BONUS IS ASSUMED RATHER THAN READ",
    from: "      takeCoverStealthBonus: Number(",
    to: "      takeCoverStealthBonusUnused: Number(",
    breaks: "W8 — a character not Taking Cover would get a phantom correction, and one who "
      + "is would get none"
  },
  {
    file: WF,
    name: "W10 GATHER HERBS HARD-CODES ITS CEILING",
    from: "      herbsAtOnce(skillRanks(actor, invokedSkillKey ?? \"survival\"))",
    to: "      5",
    breaks: "W10 — a 1st-level forager offered five herbs at once"
  },
  {
    file: WF,
    name: "W12 A GUARDED OBJECT STOPS RAISING THE DC",
    from: "    finalDC += GUARDED_OBJECT_DC;",
    to: "    finalDC += 0;",
    breaks: "W12 — page 96's +5 applied by nobody"
  },
  {
    file: WF,
    name: "W13 DETECT DECEPTION STOPS RECORDING THE MISREAD",
    from: "    const next = withMisread(held, targetActor.uuid, degree);",
    to: "    const next = { ...held };",
    breaks: "W13 — the -4 would be computed by a rule nothing ever writes to"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [V], { stdio: "pipe" });
    return true;
  }
  catch { return false; }
}

const guard = guardFiles([PP, SR, RI, SP, ST, SV, TH, SM, CI, BC, WF, SKILLDATA, RES, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter4-skills-91-100: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-chapter4-skills-91-100: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-chapter4-skills-91-100: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
