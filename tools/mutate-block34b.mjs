#!/usr/bin/env node
/**
 * mutate-block34b — can verify-block34b fail?
 *
 * NEW at 3.612.0. Each mutation puts back a defect the block's audit or the
 * 3.611.1 drive found, or breaks one of the channels built to answer it.
 * SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const CAST = at("module", "magic", "cast-workflow.mjs");
const ROW = at("module", "magic", "temp-immunity-row.mjs");
const SHIFT = at("module", "dice", "degree-shift.mjs");
const CHECK = at("module", "dice", "check.mjs");
const CARD = at("module", "dice", "check-card-interactions.mjs");
const REACT = at("module", "magic", "save-reaction-spells.mjs");
const REACTF = at("module", "magic", "save-reaction-spells-workflow.mjs");
const ENTRY = at("module", "magic", "entry-check.mjs");
const ENTRYF = at("module", "magic", "entry-check-workflow.mjs");
const BOOT = at("scripts", "trg-prime.mjs");
const ARR = at("module", "magic", "false-arrogance.mjs");
const ARRF = at("module", "magic", "false-arrogance-workflow.mjs");
const HELD = at("module", "magic", "held-bonus.mjs");
const HELDF = at("module", "magic", "held-bonus-workflow.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const EMAN = at("module", "magic", "emanation-effects.mjs");
const PLANF = at("tools", "block34b-plan.mjs");
const VERIFY = at("tools", "verify-block34b.mjs");

const MUTATIONS = [
  // A — F1
  { file: CAST, name: "F1 — the save path rolls for the immune again",
    from: "    targets = await dropTemporarilyImmune(spell.name, spellData.effects, targets, lines);\n", to: "", breaks: "A4" },
  { file: CAST, name: "F1 — a spell with no save ignores the immunity",
    from: "    if (!isAttack) effectTargets = await dropTemporarilyImmune(spell.name, effEffects, effectTargets, lines);\n", to: "", breaks: "A6" },
  { file: ROW, name: "F1 — the immunity row names no key",
    from: "    if (spec) keys.add(spec.key || text(spellName));", to: "    if (spec && spec.key) keys.add(spec.key);", breaks: "A1" },
  { file: CAST, name: "F1 — the refusal is printed twice",
    from: "      if (!lines.includes(said)) lines.push(said);", to: "      lines.push(said);", breaks: "A7" },
  // B — G1
  { file: CAST, name: "G1 — the capped are 'not chosen' again",
    from: "              .filter((a) => !ticked.includes(a))", to: "              .filter((a) => !areaTargets.includes(a))", breaks: "B1" },
  // C — R4
  { file: SHIFT, name: "R4 — a Partial becomes a Critical too",
    from: "  fateful: Object.freeze({ success: \"critical\", failure: \"fumble\" })",
    to: "  fateful: Object.freeze({ success: \"critical\", partial: \"critical\", failure: \"fumble\" })", breaks: "C1" },
  { file: REACT, name: "R4 — the bonus has no ceiling",
    from: "  return Math.min(FATEFUL_MAX_BONUS, FATEFUL_BASE_BONUS + added);", to: "  return FATEFUL_BASE_BONUS + added;", breaks: "C5" },
  { file: REACT, name: "R4 — Lucky Break answers a Fumble",
    from: "const LUCKY_BREAK_DEGREES = Object.freeze([\"partial\", \"failure\"]);",
    to: "const LUCKY_BREAK_DEGREES = Object.freeze([\"partial\", \"failure\", \"fumble\"]);", breaks: "C6" },
  { file: REACT, name: "R4 — a caster out of range may answer",
    from: "    return { ok: false, reason: \"out of range\" };", to: "    return { ok: true, reason: \"\" };", breaks: "C7" },
  { file: CHECK, name: "R4 — Fateful Temptation's shift is dropped",
    from: "        check.degreeShift = fate.shift;\n", to: "", breaks: "C11" },
  { file: CHECK, name: "R4 — the Conviction die forgets the shift",
    from: "    this.outcome = applyDegreeShift(buildOutcome({\n      dieTotal: this.dice.total,\n      modifiers: this.modifiers,\n      dc: this.dc,\n      ...(this._outcomeArgs ?? {})\n    }), this.degreeShift);\n    return this.outcome;",
    to: "    this.outcome = buildOutcome({\n      dieTotal: this.dice.total,\n      modifiers: this.modifiers,\n      dc: this.dc,\n      ...(this._outcomeArgs ?? {})\n    });\n    return this.outcome;", breaks: "C14" },
  { file: CHECK, name: "R4 — the reroll spends the waiting bonuses again",
    from: "    this._visionDraw = null;\n", to: "    this._visionDraw = null;\n    await this.#takeCuttingWords();\n", breaks: "C15" },
  { file: CARD, name: "R4 — a rebuilt card hands the fumble back as a failure",
    from: "  }), raw.degreeShift ?? \"\");", to: "  }), \"\");", breaks: "C16" },
  { file: CAST, name: "R4 — a reaction cast opens the target picker over the save",
    from: "  if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {",
    to: "  if (spellNeedsTarget(spellData) && !storingNow && !presetTargets) {", breaks: "C17" },
  { file: REACTF, name: "R4 — a failed Fateful Temptation still gives its bonus",
    from: "  // A FAILED CASTING GIVES NOTHING, and its own card says so.\n  if (!result?.cast) return null;",
    to: "  // A FAILED CASTING GIVES NOTHING, and its own card says so.", breaks: "C19" },
  { file: CHECK, name: "R4 — Lucky Break is offered on the reroll's second throw",
    // RE-ANCHORED AT 3.622.0: the Chance trait's one-effect test follows it.
    from: "    if (check.actor && check.type === \"save\" && !check.flat && !check.saveReactionResolved\n      && check.outcome?.degree?.key && !check.chanceUsed) {",
    to: "    if (check.actor && check.type === \"save\" && !check.flat\n      && check.outcome?.degree?.key && !check.chanceUsed) {", breaks: "C13" },
  // D — R6
  { file: PLANF, name: "R6 — a Partial reads as a Success",
    from: "          success: { unaffected: true, clears: true },",
    to: "          success: { unaffected: true, clears: true },\n          partial: { unaffected: true },", breaks: "D2" },
  { file: ENTRY, name: "R6 — Acrobatics clears the web too",
    from: "    clears: Boolean(rung?.clears) && Boolean(spec?.clearsWith) && lower(skill) === spec.clearsWith",
    to: "    clears: Boolean(rung?.clears)", breaks: "D3" },
  { file: ENTRY, name: "R6 — a creature standing still in the web is checked",
    from: "  return Boolean(startedInside) && Number(enteredAny) > 0;", to: "  return Boolean(startedInside);", breaks: "D5" },
  { file: ENTRYF, name: "R6 — every client answers the move",
    from: "    if (!isActingGM()) return;\n    await applyEntryChecks", to: "    await applyEntryChecks", breaks: "D12" },
  { file: ENTRYF, name: "R6 — a Critical does not end the checks",
    from: "      if (turnKey && cleared?.region === region.id && cleared?.turn === turnKey) continue;\n", to: "", breaks: "D14" },
  { file: BOOT, name: "R6 — the hook is never registered",
    from: "  registerEntryChecks();\n", to: "", breaks: "D15" },
  { file: CAST, name: "R6 — the check is recorded without the cast's DC",
    from: "          dc: nominalSaveDC, casterUuid: actor.uuid ?? null, spellUuid: spell.uuid ?? null,",
    to: "          dc: 10, casterUuid: actor.uuid ?? null, spellUuid: spell.uuid ?? null,", breaks: "D11" },
  // E — R8 False Arrogance
  { file: ARR, name: "R8 — a failed save feeds False Arrogance",
    from: "const ARROGANCE_CHECK_TYPES = Object.freeze([\"attack\", \"skill\"]);",
    to: "const ARROGANCE_CHECK_TYPES = Object.freeze([\"attack\", \"skill\", \"save\"]);", breaks: "E4" },
  { file: ARR, name: "R8 — the penalty climbs past −2",
    from: "  return Math.min(ARROGANCE_MAX_PENALTY, now + 1);", to: "  return now + 1;", breaks: "E5" },
  { file: ARRF, name: "R8 — a second failure stacks a second effect",
    from: "  if (existing) await existing.delete();\n", to: "", breaks: "E8" },
  { file: PLANF, name: "R8 — a Critical earns no immunity",
    from: "onSave: [\"critical\", \"success\", \"partial\", \"failure\", \"fumble\"], length: \"24 hours\"",
    to: "onSave: [\"success\", \"partial\", \"failure\", \"fumble\"], length: \"24 hours\"", breaks: "E2" },
  { file: CHECK, name: "R8 — nothing asks the failed roll",
    from: "      const rattled = await onArroganceCheck(check);\n", to: "      const rattled = null;\n", breaks: "E10" },
  // F — R8 Inspire Heroics
  { file: HELD, name: "R8 — a per-round bonus is spent for good",
    from: "    perRound: raw.perRound === true\n", to: "    perRound: false\n", breaks: "F1" },
  { file: HELDF, name: "R8 — Inspire Heroics' advantage is deleted on use",
    from: "    await effect.setFlag(SYSTEM_ID, HELD_SPENT_ROUND_FLAG, key);\n    return true;\n", to: "", breaks: "F7" },
  { file: CARD, name: "R8 — the advantage is offered twice in a round",
    // RE-ANCHORED 3.613.0: the per-round filter is heldOffersThisRound now.
    from: "  const held = heldOffersThisRound(candidates, roundNow);\n", to: "  const held = candidates;\n", breaks: "F8" },
  { file: WARP, name: "R8 — the warps widen nothing",
    from: "      return { ...effect, checkTypes: [...new Set([...types.map((c) => String(c).toLowerCase()), ...extra])] };",
    to: "      return { ...effect };", breaks: "F5" },
  { file: EMAN, name: "R8 — the composition's members carry nothing",
    from: "        ...(held ? { [HELD_BONUS_FLAG]: held } : {})", to: "        ...({})", breaks: "F6" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-block34b does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}
let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) { console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`); unmatched++; continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
    else console.log(`  caught    ${m.name}`);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}
process.stdout.write(survived + unmatched
  ? `\nmutate-block34b: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-block34b: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
