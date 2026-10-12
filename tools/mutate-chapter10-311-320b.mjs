#!/usr/bin/env node
/**
 * mutate-chapter10-311-320b — can the second-half checks fail?
 *
 * NEW at 3.596.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IN SECTION C IS THE DEFECT THAT WAS NEARLY SHIPPED:
 * `rollCounteractCheck` returns a TRGCheck, so a `result.success` read is
 * undefined for ever and every counteract fails, plausibly and in silence.
 * It was in the first draft of this release and only the check caught it.
 *
 * SECTION P MUTATES THE PACK, because four spells' whole content is rows.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const APPLIER = at("module", "magic", "spell-effects.mjs");
const CR = at("module", "magic", "counteract-row.mjs");
const TI = at("module", "magic", "temp-immunity-row.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const VERIFY = at("tools", "verify-chapter10-311-320b.mjs");

const MUTATIONS = [
  /* ---------------- C. the counteract row ---------------- */
  { file: APPLIER, name: "C THE DEFECT NEARLY SHIPPED: the check is asked for a field it has not got",
    from: `            const degree = result?.outcome?.degree ?? null;`,
    to: `            const degree = result?.success ?? null;`, breaks: "C6" },
  { file: APPLIER, name: "C: any degree at all counts as a success",
    from: `            if (degree.success) {`, to: `            if (degree) {`, breaks: "C6" },
  { file: APPLIER, name: "C: a blank DC is counted as a failure rather than reported",
    from: `            if (!degree) {`, to: `            if (false) {`, breaks: "C6b" },
  { file: APPLIER, name: "C: the TARGET rolls the caster's counteract check",
    from: `            const result = await rollCounteractCheck(caster);`,
    to: `            const result = await rollCounteractCheck(target);`, breaks: "C7" },
  { file: APPLIER, name: "C: the check is rolled for both conditions whether the target has them or not",
    // RE-ANCHORED 3.613.0: the candidates are gathered by counteractCandidates (R14).
    from: `          let held = counteractCandidates(spec, (c) => Boolean(target.hasCondition?.(c)), traitedRows);`,
    to: `          let held = spec.conditions.map((c) => ({ kind: "condition", key: c, label: c }));`, breaks: "C3c" },
  { file: APPLIER, name: "C: nothing to counteract goes back to silence",
    from: `            lines.push(line(nothingToCounteractLine(target.name, spec)));`,
    to: `            ;`, breaks: "C4c" },
  { file: CR, name: "C: a row naming no condition is accepted, so a success removes nothing",
    // RE-ANCHORED 3.613.0: a row may name traits instead (R14).
    from: `  if (!conditions.length && !traits.length) return null;`, to: `  ;`, breaks: "C2" },
  { file: CR, name: "C: any kind of row with a conditions array becomes a counteract",
    from: `  if (!raw || raw.kind !== "counteract") return null;`, to: `  if (!raw) return null;`,
    breaks: "C2b" },
  { file: CR, name: "C: the held test is ignored and every named condition is rolled for",
    // RE-ANCHORED 3.613.0: an older spec may carry no conditions list.
    from: `  return (spec.conditions ?? []).filter((c) => has(c));`, to: `  return spec.conditions ?? [];`,
    breaks: "C3" },
  { file: CR, name: "C: the refusal line stops naming what it was looking for",
    // RE-ANCHORED 3.613.0: the line names traits too (R14).
    from: `  return \`<em>\${targetName} is \${said} — nothing to counteract.</em>\`;`,
    to: `  return \`<em>\${targetName} — nothing to counteract.</em>\`;`, breaks: "C4" },
  { file: CR, name: "C: a success says the condition is still there",
    from: `  return \`<strong>\${targetName}</strong> is no longer <strong>\${condition}</strong> &mdash; \``,
    to: `  return \`<strong>\${targetName}</strong> is <strong>\${condition}</strong> &mdash; \``,
    breaks: "C4b" },
  { file: KINDS, name: "C: the kind leaves the handled vocabulary",
    from: `  "conditional", "conditionRelief", "conjureItem", "counteract", "counteractPeril", "counterPerform", "damage",`,
    to: `  "conditional", "conditionRelief", "conjureItem", "counteractPeril", "counterPerform", "damage",`, breaks: "C5" },

  /* ---------------- S. the temporary-immunity row ---------------- */
  { file: TI, name: "S: a week becomes six days, which nothing about the page would show",
    from: `  week: ONE_WEEK, weeks: ONE_WEEK`, to: `  week: ONE_DAY * 6, weeks: ONE_DAY * 6`,
    breaks: "S1" },
  { file: TI, name: "S: a day becomes an hour",
    from: `  day: ONE_DAY, days: ONE_DAY,`, to: `  day: 3600, days: 3600,`, breaks: "S1b" },
  // RE-AIMED at 3.597.0: the units moved to temporary-immunity.mjs so one
  // file defines a week, and this row module re-exports them. The mutation
  // now breaks the re-export, which is what S1c reads through.
  { file: TI, name: "S: the row module defines its own, shorter week again",
    from: `export { ONE_DAY, ONE_WEEK } from "../temporary-immunity.mjs";`,
    to: `export const ONE_DAY = 86400; export const ONE_WEEK = ONE_DAY * 5;`,
    breaks: "S1c" },
  { file: TI, name: "S: A LENGTH NOTHING CAN READ becomes an immunity of NaN seconds",
    from: `    if (!unit) return null;`, to: `    ;`, breaks: "S3" },
  { file: TI, name: "S: an immunity of no duration is issued anyway",
    from: `  if (seconds <= 0) return null;`, to: `  ;`, breaks: "S3b" },
  { file: TI, name: "S: a row authored in seconds is ignored",
    from: `  let seconds = Math.max(0, int(raw.seconds));`, to: `  let seconds = 0;`, breaks: "S3c" },
  { file: TI, name: "S: any kind of row with a length becomes an immunity",
    from: `  if (!raw || raw.kind !== "tempImmunity") return null;`, to: `  if (!raw) return null;`,
    breaks: "S3d" },
  { file: TI, name: "S: the already-immune line stops saying the target already was",
    from: `  return \`<em>\${targetName} is already immune to \${spellName} — \${remaining} left.</em>\`;`,
    to: `  return \`<em>\${targetName} — \${remaining} left.</em>\`;`, breaks: "S6" },
  { file: APPLIER, name: "S: THE IMMUNITY IS KEYED BY NOTHING when the row names no key",
    from: `          const key = spec.key || spell.name;`, to: `          const key = spec.key;`,
    breaks: "S4b" },
  { file: APPLIER, name: "S: a target already immune is stamped again, restarting its week",
    from: `          if (already > 0) {`, to: `          if (false) {`, breaks: "S4c" },
  { file: APPLIER, name: "S: the record is never pruned, so expired immunities accumulate for ever",
    from: `            withImmunity(prunedImmunities(record, now), key, spec.seconds, now));`,
    to: `            withImmunity(record, key, spec.seconds, now));`, breaks: "S4d" },
  { file: KINDS, name: "S: the kind leaves the handled vocabulary",
    from: `  "strikeRider", "suppress", "tempHP", "tempImmunity", "thorns", "trait",`,
    to: `  "strikeRider", "suppress", "tempHP", "thorns", "trait",`, breaks: "S4" }
];

const PACK = [
  /* ---------------- Restore Senses ---------------- */
  { spell: "Restore Senses", name: "P THE DEFECT RESTORED: a PP 4 spell goes back to doing nothing",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "counteract"); }, breaks: "C1" },
  { spell: "Restore Senses", name: "P: it restores sight but no longer hearing",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "counteract").conditions = ["blinded"]; },
    breaks: "C1b" },
  { spell: "Restore Senses", name: "P: the two refusals go unsaid",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "note"); }, breaks: "C8" },
  { spell: "Restore Senses", name: "P: the 10-minute warp goes inert",
    mutate: (sy) => { sy.warps[1].mods = {}; }, breaks: "C9" },

  /* ---------------- Scrying ---------------- */
  { spell: "Scrying", name: "P THE DEFECT RESTORED: a critical save buys nothing",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "tempImmunity" && e.onSave?.includes("critical")));
    }, breaks: "S1" },
  { spell: "Scrying", name: "P: the week is authored as a day",
    mutate: (sy) => {
      sy.effects.find((e) => e.kind === "tempImmunity" && e.onSave?.includes("critical")).length = "1 day";
    }, breaks: "S1" },
  { spell: "Scrying", name: "P THE NIGHTMARE DEFECT: a FAILED save also makes the target immune",
    mutate: (sy) => {
      sy.effects.push({ kind: "tempImmunity", target: "targets", onSave: ["failure"], length: "1 day" });
    }, breaks: "S2" },
  { spell: "Scrying", name: "P: the immunity is ungated, so every degree grants it",
    mutate: (sy) => {
      delete sy.effects.find((e) => e.kind === "tempImmunity" && e.onSave?.includes("success")).onSave;
    }, breaks: "S2" },
  { spell: "Scrying", name: "P: the two degrees the spell wins on go unprinted",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /succeeds/.test(e.text)));
    }, breaks: "S5" },
  { spell: "Scrying", name: "P: the Study Target shift goes unsaid",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /STUDY TARGET/.test(e.text)));
    }, breaks: "S5b" },

  /* ---------------- Shadow Weapon ---------------- */
  { spell: "Shadow Weapon", name: "P THE DEFECT RESTORED: the shadow blade goes back to prose",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "conjuredWeapon"); },
    breaks: "W1" },
  { spell: "Shadow Weapon", name: "P: a melee weapon of your choice narrows to the simple ones",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conjuredWeapon").categories = ["Simple"]; },
    breaks: "W1b" },
  { spell: "Shadow Weapon", name: "P: and the blade can be thrown",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conjuredWeapon").melee = false; },
    breaks: "W1c" },
  { spell: "Shadow Weapon", name: "P: the concealment and +1 halves go unsaid",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "note"); }, breaks: "W2" },

  /* ---------------- Scintillating Pattern ---------------- */
  { spell: "Scintillating Pattern", name: "P: the dazzle becomes an outcome of the save",
    mutate: (sy) => { sy.effects.find((e) => e.condition === "dazzled").onSave = ["failure", "fumble"]; },
    breaks: "P1" },
  { spell: "Scintillating Pattern", name: "P: the confusion runs 1d6 rounds",
    mutate: (sy) => {
      sy.effects.find((e) => e.condition === "confused" && e.onSave?.includes("failure"))
        .durationRoll = "1d6 rounds";
    }, breaks: "P2" },
  { spell: "Scintillating Pattern", name: "P: the confusion's roll is dropped, so it lasts the spell",
    mutate: (sy) => {
      delete sy.effects.find((e) => e.condition === "confused" && e.onSave?.includes("failure"))
        .durationRoll;
    }, breaks: "P2" },
  { spell: "Scintillating Pattern", name: "P: a fumble stops stunning",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.condition !== "stunned"); },
    breaks: "P3" },
  { spell: "Scintillating Pattern", name: "P: the fumble's confusion is rolled too, so it ends with the stun",
    mutate: (sy) => {
      sy.effects.find((e) => e.condition === "confused" && e.onSave?.includes("fumble"))
        .durationRoll = "1d4 rounds";
    }, breaks: "P3b" },
  { spell: "Scintillating Pattern", name: "P: a critical save is confused as well",
    mutate: (sy) => {
      sy.effects.push({ kind: "condition", target: "targets", condition: "confused", onSave: ["critical"] });
    }, breaks: "P4" },
  { spell: "Scintillating Pattern", name: "P: the save note goes back to a bare \"Unaffected.\"",
    mutate: (sy) => {
      sy.effects.find((e) => e.kind === "note" && e.onSave?.includes("critical")).text = "Unaffected.";
    }, breaks: "P4b" },
  { spell: "Scintillating Pattern", name: "P: the overlap, the ring and the triggers go unsaid",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /FOLLOWS THE STUN|20 FEET|re-save/.test(e.text)));
    }, breaks: "P5" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-chapter10-311-320b does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const m of MUTATIONS) {
  const original = originals.get(m.file);
  const n = original.split(m.from).length - 1;
  if (n !== 1) {
    console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(m.file, original.replace(m.from, m.to));
  const stillPasses = run();
  fs.writeFileSync(m.file, original);
  if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else console.log(`  caught    ${m.name}`);
}
for (const [file, original] of originals) fs.writeFileSync(file, original);

const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");
async function withSpell(name, fn) {
  const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
  await db.open();
  let key = null;
  let pristine = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== name.toLowerCase()) continue;
      key = k; pristine = JSON.parse(JSON.stringify(v)); break;
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(pristine));
    fn(mutated.system);
    await db.put(key, mutated);
  } finally { if (db.status === "open") await db.close(); }
  try {
    return run() ? "SURVIVED" : "caught";
  } finally {
    const db2 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
    await db2.open();
    try { await db2.put(key, pristine); } finally { await db2.close(); }
  }
}
for (const m of PACK) {
  let state;
  try { state = await withSpell(m.spell, (sy) => m.mutate(sy)); }
  catch (err) { state = `ERROR ${err.message}`; }
  if (state === "caught") console.log(`  caught    ${m.name}`);
  else if (state === "SURVIVED") { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else { console.error(`  ${state}  ${m.name} (${m.spell})`); unmatched++; }
}

const TOTAL = MUTATIONS.length + PACK.length;
process.stdout.write(survived + unmatched
  ? `\nmutate-chapter10-311-320b: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-311-320b: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
