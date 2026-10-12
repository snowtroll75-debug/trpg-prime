#!/usr/bin/env node
/**
 * mutate-resurrection — can the R6 checks fail?
 *
 * NEW at 3.602.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST PACK MUTATION IS THE DEFECT: `effects: []` again, and a PP 12
 * spell's four printed consequences go back to being a GM's memory.
 *
 * SECTION S MUTATES THE SEAL, which is the one new mechanism — and the first
 * of them is the one that matters: let Restoration lift an injury the page
 * says nothing can lift.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "resurrection.mjs");
const SEAL = at("module", "conditions", "sealed.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const REGISTRY = at("module", "conditions", "registry.mjs");
const VERIFY = at("tools", "verify-resurrection.mjs");

const MUTATIONS = [
  /* ---------------- P. the pools ---------------- */
  { file: RULE, name: "P restored at full health rather than one Hit Point",
    from: `  "system.resources.hp.value": 1,`, to: `  "system.resources.hp.value": 30,`, breaks: "P1" },
  { file: RULE, name: "P and with its Power Points intact",
    from: `  "system.resources.pp.value": 0,`, to: `  "system.resources.pp.value": 99,`, breaks: "P2" },
  { file: RULE, name: "P the daily pools survive the grave",
    from: `  "system.resources.endeavour.value": 0,`, to: `  "system.resources.endeavour.value": 1,`,
    breaks: "P3" },
  { file: RULE, name: "P AP IS EMPTIED TOO, so a creature raised in combat cannot act",
    from: `  "system.resources.conviction.value": 0\n});`,
    to: `  "system.resources.conviction.value": 0,
  "system.resources.ap.value": 0\n});`, breaks: "P4" },
  { file: RULE, name: "P THE OLD R17 DEFECT: luck is emptied with the daily pools",
    from: `  "system.resources.conviction.value": 0\n});`,
    to: `  "system.resources.conviction.value": 0,
  "system.resources.luck.value": 0\n});`, breaks: "P3b" },
  { file: RULE, name: "P THE SHIPPED DEFECT: the frozen rule is handed to Foundry itself",
    from: `  return { ...RESTORED_POOLS };`, to: `  return RESTORED_POOLS;`, breaks: "P7" },
  { file: RULE, name: "P every caller shares one object, so one write spoils the rule",
    from: `  return { ...RESTORED_POOLS };`,
    to: `  globalThis.__shared ??= { ...RESTORED_POOLS };\n  return globalThis.__shared;`, breaks: "P7b" },
  { file: RULE, name: "P a nested object is written instead of dotted keys",
    from: `  "system.resources.hp.value": 1,`, to: `  "system.resources": { hp: { value: 1 } },`,
    breaks: "P5" },

  /* ---------------- D. death state ---------------- */
  { file: RULE, name: "D THE PERMANENT COST IS NOT CHARGED: Death State stands still",
    from: `  return Math.max(0, int(current) - 1);`, to: `  return Math.max(0, int(current));`, breaks: "D1" },
  { file: RULE, name: "D it falls by two",
    from: `  return Math.max(0, int(current) - 1);`, to: `  return Math.max(0, int(current) - 2);`,
    breaks: "D1b" },
  { file: RULE, name: "D AND IT GOES NEGATIVE, which nothing reads correctly",
    from: `  return Math.max(0, int(current) - 1);`, to: `  return int(current) - 1;`, breaks: "D2" },
  { file: RULE, name: "D a soul below zero reads as safe",
    from: `  return int(next) <= 0;`, to: `  return int(next) === 0;`, breaks: "D3c" },
  { file: RULE, name: "D and a living creature's soul is destroyed",
    from: `  return int(next) <= 0;`, to: `  return int(next) <= 1;`, breaks: "D3b" },
  { file: APPLIER, name: "D the creature's own Death State is ignored for a flat five",
    from: `            const was = Number(target.system?.combat?.deathState ?? 5);`,
    to: `            const was = 5;`, breaks: "D4b" },
  { file: APPLIER, name: "D the soul line fires on every return",
    from: `            if (soulIsDestroyed(now)) lines.push(line(soulDestroyedLine(target.name)));`,
    to: `            lines.push(line(soulDestroyedLine(target.name)));`, breaks: "D5" },

  /* ---------------- S. the seal ---------------- */
  { file: APPLIER, name: "S RESTORATION LIFTS AN INJURY NOTHING CAN LIFT",
    from: `            if (isSealed(seals, relief.condition, nowSeconds)) {`, to: `            if (false) {`,
    breaks: "S8" },
  { file: APPLIER, name: "S the refusal is silent, so Restoration reads as broken",
    from: `              lines.push(line(sealRefusedLine(target.name, relief.label,
                describeRemaining(sealRemaining(seals, relief.condition, nowSeconds)))));`,
    to: `              ;`, breaks: "S8b" },
  { file: SEAL, name: "S A SEAL NEVER EXPIRES, so a week becomes for ever",
    from: `  return Math.max(0, until - Number(now));`, to: `  return 1;`, breaks: "S1b" },
  { file: SEAL, name: "S it expires a second early",
    from: `  return sealRemaining(record, condition, now) > 0;`,
    to: `  return sealRemaining(record, condition, now) > 1;`, breaks: "S1c" },
  { file: SEAL, name: "S one seal seals every condition",
    from: `  const until = Number((record ?? {})[text(condition).toLowerCase()]);`,
    to: `  const until = Number(Object.values(record ?? {})[0]);`, breaks: "S2" },
  { file: SEAL, name: "S A SHORTER SECOND SEAL SHORTENS THE FIRST",
    from: `    [key]: Number.isFinite(existing) && existing > until ? existing : until`,
    to: `    [key]: until`, breaks: "S3" },
  { file: SEAL, name: "S a seal of no length is accepted",
    from: `  if (!key || int(seconds) <= 0) return { ...(record ?? {}) };`, to: `  ;`, breaks: "S4" },
  { file: SEAL, name: "S a nonsense record reads as sealed",
    from: `  if (!Number.isFinite(until)) return 0;`, to: `  ;`, breaks: "S5" },
  { file: SEAL, name: "S lapsed seals are kept for ever",
    from: `    if (Number(until) > Number(now)) out[key] = Number(until);`, to: `    out[key] = Number(until);`,
    breaks: "S6" },
  { file: SEAL, name: "S the condition's casing decides whether it is sealed",
    from: `  const key = text(condition).toLowerCase();`, to: `  const key = text(condition);`, breaks: "S7" },
  { file: SEAL, name: "S the refusal stops quoting the page",
    from: `  return \`<em>\${targetName}'s <strong>\${label}</strong> cannot be removed or reduced by any means\``,
    to: `  return \`<em>\${targetName}'s <strong>\${label}</strong> stays\``, breaks: "S9" },

  // S10 CLAIMS SOMETHING ABOUT ANOTHER FILE — that a sealed Injured 2 still
  // reads as an ordinary Injured 2 — so this pack sabotages THAT file to prove
  // the claim bites. registry.mjs has its own pair; this is not a duplicate of
  // it, it is the seal's half of the argument.
  { file: REGISTRY, name: "S the injured penalty stops being charged at all",
    from: `  if (active("injured")) {`, to: `  if (false) {`, breaks: "S10" },
  { file: REGISTRY, name: "S it is charged at a flat 1 whatever the value",
    from: `      allChecks(label, -value("injured"), { includeDefence: true, type: "untyped" });`,
    to: `      allChecks(label, -1, { includeDefence: true, type: "untyped" });`, breaks: "S10c" },

  /* ---------------- F. the closed door ---------------- */
  { file: RULE, name: "F EVERY SPELL'S FAILURE BECOMES FINAL",
    from: `  return (Array.isArray(effects) ? effects : []).some((e) => e?.kind === "resurrect");`,
    to: `  return true;`, breaks: "F1b" },
  { file: RULE, name: "F and no spell's is",
    from: `  return (Array.isArray(effects) ? effects : []).some((e) => e?.kind === "resurrect");`,
    to: `  return false;`, breaks: "F1" },
  { file: RULE, name: "F a stamped creature is no longer refused",
    from: `  return Boolean(record);`, to: `  return false;`, breaks: "F2" },
  { file: CAST, name: "F THE DOOR NEVER CLOSES: a failed check is merely reported",
    from: `    if (spellFailureIsFinal(spellData.effects)) {`, to: `    if (false) {`, breaks: "F3" },
  { file: CAST, name: "F it closes on a SUCCESSFUL cast instead",
    from: `  if (!outcome.cast) {
    const { spellFailureIsFinal, FAILED_FLAG, failureClosesLine } = await import("./resurrection.mjs");`,
    to: `  if (outcome.cast) {
    const { spellFailureIsFinal, FAILED_FLAG, failureClosesLine } = await import("./resurrection.mjs");`,
    breaks: "F3" },
  { file: APPLIER, name: "F THE POOLS ARE EMPTIED BEFORE THE REFUSAL IS CHECKED",
    from: `          if (resurrectionRefused(target.getFlag?.(SYSTEM_ID, FAILED_FLAG))) {
            lines.push(line(alreadyFailedLine(target.name)));
            break;
          }
`, to: ``, breaks: "F4" },
  { file: KINDS, name: "the kind leaves the handled vocabulary",
    from: `  "resurrect",`, to: `  ;`, breaks: "K0" },

  /* ---------------- C. the card ---------------- */
  { file: RULE, name: "C the card stops admitting what the seal does not cover",
    from: `    + "rest. (A GM may still clear it by hand; the seal is a rule about the fiction, not about "
    + "the table.)"`, to: `    + "rest."`, breaks: "C2b" },
  { file: RULE, name: "C the death-state line stops naming the old value",
    from: `  return \`<strong>\${targetName}</strong>'s Death State falls from <strong>\${was}</strong> to \``,
    to: `  return \`<strong>\${targetName}</strong>'s Death State falls to \``, breaks: "C3" },
  { file: RULE, name: "C the soul line decides the outcome instead of the GM",
    from: `    + "<strong>destroyed or corrupted</strong>. What that means is the GM's to decide — the spell "`,
    to: `    + "<strong>destroyed</strong>. They are gone. "`, breaks: "C4" }
];

const PACK = [
  { spell: "Resurrection", name: "P THE DEFECT RESTORED: four consequences go back to a GM's memory",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "resurrect"); }, breaks: "K2" },
  { spell: "Resurrection", name: "P: the aftermath lands on the caster instead of the corpse",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "resurrect").target = "self"; }, breaks: "K2b" },
  { spell: "Resurrection", name: "P: the pools reading goes unprinted",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !/THE POOLS THIS EMPTIES/.test(e.text ?? ""));
    }, breaks: "K4" },
  { spell: "Resurrection", name: "P: the permanence of Death State goes unsaid",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !/DEATH STATE IS PERMANENT/.test(e.text ?? ""));
    }, breaks: "K5" },
  { spell: "Resurrection", name: "P THE INERT WARP IS WIRED TO A LIVE KEY THAT MEANS SOMETHING ELSE",
    mutate: (sy) => { sy.warps[1].mods = { durationText: "1 year" }; }, breaks: "K6b" },
  { spell: "Resurrection", name: "P: and its inertness goes undeclared",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !/\+2 PP WARP IS PRINTED/.test(e.text ?? ""));
    }, breaks: "K6" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-resurrection does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-resurrection: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-resurrection: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
