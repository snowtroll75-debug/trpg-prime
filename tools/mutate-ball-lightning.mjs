#!/usr/bin/env node
/**
 * mutate-ball-lightning — can the Ball Lightning checks fail?
 *
 * NEW at 3.588.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MUTATION THAT MATTERS MOST IS THE FIRST ONE.
 *
 * Graham ruled that a turn with no free action still strikes. The
 * tempting implementation is the opposite — treat an unanswered dialog
 * as "do nothing" — and it would look perfectly reasonable in review
 * while silently dropping nine tenths of a ten-round spell in any game
 * where the player was not watching the prompt. `B THE RULING REVERSED`
 * puts that back.
 *
 * The rest attack the two boundaries this project's last four defects
 * lived on: does the thing exist, and does anything happen when it runs.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const RULE = at("magic", "directed-strike.mjs");
const WORK = at("magic", "directed-strike-workflow.mjs");
const EFFECTS = at("magic", "spell-effects.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const KINDS = at("magic", "effect-kinds.mjs");
const COMBAT = at("documents", "combat.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-ball-lightning.mjs");

const MUTATIONS = [
  /* ── B: ruling 1 ──────────────────────────────────────────────── */
  { file: RULE, name: "B THE RULING REVERSED: no free action means no strike",
    from: `  const held = text(current);`, to: `  const held = "";`, breaks: "B1" },
  { file: RULE, name: "B: a redirect is not reported as one",
    from: `  if (pick) return { uuid: pick, redirected: true };`,
    to: `  if (pick) return { uuid: pick, redirected: false };`, breaks: "B2" },
  { file: RULE, name: "B: a ball with no target picks the first creature it can find",
    from: `  if (!held) return null;`, to: `  if (!held) return { uuid: "Actor.anyone", redirected: false };`,
    breaks: "B3" },
  { file: RULE, name: "B: a ball with nothing to strike says nothing",
    from: `    return \`<strong>\${label}</strong> has nothing to strike — its target is gone. Direct it at someone to bring it back.\`;`,
    to: `    return "";`, breaks: "B4" },
  { file: WORK, name: "B: a cancelled dialog stops meaning \"leave it\"",
    from: `  if (!chosen || chosen === "cancel") return "";`,
    to: `  if (!chosen || chosen === "cancel") return "SKIP";`, breaks: "B5" },
  { file: WORK, name: "B: the workflow decides the aim itself instead of asking the rule",
    from: `      const aim = strikeTargetFor({ current, chosen });`,
    to: `      const aim = chosen ? { uuid: chosen, redirected: true } : null;`, breaks: "B6" },

  /* ── C: ruling 3 ──────────────────────────────────────────────── */
  { file: RULE, name: "C: the range stops being enforced at all",
    from: `  return far <= limit;`, to: `  return true;`, breaks: "C1b" },
  { file: RULE, name: "C THE NULL DEFECT: no printed range becomes a range of zero",
    from: `  const limit = rangeFeet === null || rangeFeet === undefined ? NaN : Number(rangeFeet);
  if (!Number.isFinite(limit) || limit <= 0) return true;`,
    to: `  const limit = Number(rangeFeet);
  if (!Number.isFinite(limit)) return true;`, breaks: "C1c" },
  { file: RULE, name: "C: an unmeasured distance is treated as too far",
    from: `  if (!Number.isFinite(far)) return true;`, to: `  if (!Number.isFinite(far)) return false;`,
    breaks: "C1d" },
  { file: WORK, name: "C: the range is measured from the ball's target instead of the caster",
    from: `      distance = casterToken ? distanceBetween(casterToken, token) : null;`,
    to: `      distance = null;`, breaks: "C2" },
  { file: RULE, name: "C: the picker stops filtering by range",
    from: `    .filter((c) => withinDirectRange(c.distance, rangeFeet));`,
    to: `    .filter(() => true);`, breaks: "C3" },
  { file: RULE, name: "C: the caster is offered their own ball",
    from: `    .filter((c) => text(c.uuid) !== self)`, to: `    .filter(() => true)`, breaks: "C4" },
  { file: RULE, name: "C: a target another ball has taken is offered anyway",
    from: `    .filter((c) => !spoken.has(text(c.uuid)))`, to: `    .filter(() => true)`, breaks: "C6" },
  { file: RULE, name: "C: two balls may share a creature",
    from: `  return new Set(real).size === real.length;`, to: `  return true;`, breaks: "C7" },
  { file: WORK, name: "C: the finished assignment is never asked",
    from: `      if (!targetsAreDistinct(claimed)) {`, to: `      if (false) {`, breaks: "C8" },
  { file: EFFECTS, name: "C: the warp stops buying a second ball",
    from: `          const dsCount = Math.max(1, Math.trunc(Number(warpMods?.targetCap ?? effect.count ?? 1)) || 1);`,
    to: `          const dsCount = 1;`, breaks: "C10" },
  { file: WORK, name: "C: the second ball starts on the first ball's target",
    from: `          [DIRECTED_STRIKE_FLAG]: { ...descriptor, targetUuid: i === 0 ? String(descriptor.targetUuid ?? "") : "" }`,
    to: `          [DIRECTED_STRIKE_FLAG]: { ...descriptor }`, breaks: "C11" },

  /* ── D: ruling 2 ──────────────────────────────────────────────── */
  { file: WORK, name: "D: the save is rolled once at the cast and never again",
    from: `        type: "save",
        save: spec.save,`, to: `        type: "flat",
        save: spec.save,`, breaks: "D1" },
  { file: WORK, name: "D: the degree stops scaling the damage",
    from: `      let amount = Math.floor(roll.total * bs.damageMultiplier);`,
    to: `      let amount = roll.total;`, breaks: "D2" },
  { file: WORK, name: "D: the margin is dropped, so no save can ever reach a critical",
    from: `      const margin = Number.isFinite(Number(check?.outcome?.margin))
        ? Number(check.outcome.margin) : null;`,
    to: `      const margin = null;`, breaks: "D3" },
  { file: WORK, name: "D: the critical dice come from the strike formula, not the base damage",
    from: `        { baseDamage: String(raw?.baseDamage ?? "") }, bs.criticalSeverity, bs.bonusBaseDamage);`,
    to: `        { baseDamage: spec.formula }, bs.criticalSeverity, bs.bonusBaseDamage);`, breaks: "D4" },
  { file: EFFECTS, name: "D: the ball forgets its base damage",
    from: `            baseDamage: String(spell.system?.baseDamage ?? ""),`,
    to: `            baseDamage: "",`, breaks: "D5" },
  { file: WORK, name: "D: the strike stops being a magical source, so mundane resistance halves it",
    from: `        magical: true,
        area: false,
        targeted: false`, to: `        area: false,
        targeted: false`, breaks: "D6" },
  { file: WORK, name: "D: the strike is treated as an area",
    from: `        area: false,
        targeted: false`, to: `        area: true,
        targeted: true`, breaks: "D7" },
  { file: WORK, name: "D: a critical strike lands no injury",
    from: `        await rollCriticalInjury(caster, {`, to: `        await Promise.resolve({`, breaks: "D8" },

  /* ── E: the frozen DC ─────────────────────────────────────────── */
  { file: EFFECTS, name: "E THE SILENT DEFECT: the ball freezes the nominal DC instead",
    from: `            saveDC: Number(saveDC ?? 0) || 0,`,
    to: `            saveDC: Number(rollData?.saveDC ?? 0) || 0,`, breaks: "E1" },
  { file: EFFECTS, name: "E: the applier stops taking a DC at all",
    from: `saveResults = [], saveDC = null,`, to: `saveResults = [],`, breaks: "E2" },
  { file: CASTWF, name: "E: the cast stops passing the DC it rolled against",
    from: `      saveResults: spellSave?.results ?? [],
      // AND THE DC THOSE DEGREES WERE ROLLED AGAINST (3.588.0). A
      // directed strike freezes it, for the reason the emanations and
      // the nexus freeze theirs: a caster who later changes must not
      // change a spell already running.
      saveDC,`,
    to: `      saveResults: spellSave?.results ?? [],`, breaks: "E3" },
  { file: WORK, name: "E: the ball reads a live DC instead of its frozen one",
    from: `      const saveDC = Number(raw?.saveDC) || 0;`,
    to: `      const saveDC = Number(caster?.system?.magic?.saveDC) || 0;`, breaks: "E4" },

  /* ── F: lifecycle ─────────────────────────────────────────────── */
  { file: EFFECTS, name: "F: a ball is recorded once per recipient rather than once per cast",
    from: `          if (directedStrikeRecorded) break;
          directedStrikeRecorded = true;`, to: `          if (false) break;`, breaks: "F3" },
  { file: EFFECTS, name: "F: the ball loses its expiry, so the minute never ends it",
    from: `          if (dsTiming.expiresRound != null) dsFlags[SYSTEM_ID].conditionExpiresRound = dsTiming.expiresRound;`,
    to: ``, breaks: "F4" },
  { file: EFFECTS, name: "F: the ball loses its castId, so nothing can dispel it",
    from: `          if (castId) dsFlags[SYSTEM_ID].castId = castId;`, to: ``, breaks: "F5" },
  { file: WORK, name: "F: two balls become one effect holding two",
    from: `  for (let i = 0; i < spec.count; i += 1) {`, to: `  for (let i = 0; i < 1; i += 1) {`,
    breaks: "F6" },
  { file: WORK, name: "F: a suppressed ball keeps striking through an Antimagic Field",
    from: `    if (effect.disabled) continue;`, to: `    if (false) continue;`, breaks: "F7b" },
  { file: WORK, name: "F: a malformed ball is returned as a running one",
    from: `    if (spec) out.push({ effect, spec, raw });`,
    to: `    out.push({ effect, spec, raw });`, breaks: "F7d" },
  { file: WORK, name: "F: a bad flag throws out of the turn-advance path",
    from: `    console.error("TRG Prime | a directed strike could not be fired this turn", error);`,
    to: `    throw error;`, breaks: "F8" },

  /* ── G: the clock ─────────────────────────────────────────────── */
  { file: COMBAT, name: "G: nothing fires the ball on the caster's turn",
    from: `    for (const bolt of await fireDirectedStrikes(actor, combatant.token?.object ?? null)) {`,
    to: `    for (const bolt of []) {`, breaks: "G1" },

  /* ── H: the inference ─────────────────────────────────────────── */
  { file: RULE, name: "H: the inferred reading stops being recorded",
    from: ` * THE ONE THING STILL INFERRED, SAID OUT LOUD SO IT IS CHEAP TO CORRECT.`,
    to: ` * A NOTE.`, breaks: "H1" },
  { file: RULE, name: "H: the card stops flagging a target beyond the range",
    from: `  const note = outOfRange && !redirected`, to: `  const note = false`, breaks: "H2" },
  { file: RULE, name: "H: the caveat is printed on every line",
    from: `  const note = outOfRange && !redirected`, to: `  const note = true`, breaks: "H3" },
  { file: RULE, name: "H: a redirect is flagged out of range, which it cannot be",
    from: `  const note = outOfRange && !redirected`, to: `  const note = outOfRange`, breaks: "H4" },

  /* ── A: reachability ──────────────────────────────────────────── */
  { file: KINDS, name: "A: the kind is authored but never declared handled",
    from: `  "directedStrike",`, to: ``, breaks: "A2" },
  { file: EFFECTS, name: "A: the case records nothing and only prints a line",
    from: `          const dsSpec = await recordDirectedStrike(caster, {`,
    to: `          const dsSpec = await Promise.resolve({ label: spell.name }); const unused = ({`,
    breaks: "A4" },
  { file: RULE, name: "A: a strike with no dice is accepted",
    from: `  if (!formula || !DICE.test(formula)) return null;`, to: `  if (false) return null;`,
    breaks: "A10" },
  { file: RULE, name: "A: a strike with no damage type is accepted",
    from: `  if (!damageType) return null;`, to: `  if (false) return null;`, breaks: "A12" },
  { file: RULE, name: "A: a strike naming an unknown save is accepted",
    from: `  if (!SAVES.includes(save)) return null;`, to: `  if (false) return null;`, breaks: "A13" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

const run = () => {
  try {
    execFileSync(process.execPath, [VERIFY], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

if (!run()) {
  console.error("verify-ball-lightning does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

process.stdout.write(survived + unmatched
  ? `\nmutate-ball-lightning: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-ball-lightning: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
