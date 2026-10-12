#!/usr/bin/env node
/**
 * mutate-skill-ladder — can the Shape Stone checks fail?
 *
 * NEW at 3.605.0. SURVIVED and an unmatched anchor are both failures.
 *
 * SECTION A IS THE ONE WORTH READING. Two functions answer "which rung
 * does this roll land on" — `skillLadderDegree` for a rung map and
 * `effectiveSaveDegree` for gated rows — and A1 holds them against each
 * other. Every mutation in L is therefore also a mutation in A: a clamp
 * broken here disagrees with the save ladder, which is exactly the drift
 * the agreement exists to catch.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "skill-ladder.mjs");
const FLOW = at("module", "magic", "skill-ladder-workflow.mjs");
const EFF = at("module", "magic", "spell-effects.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const MANIFEST = at("module", "data", "pack-repairs.mjs");
const AUTHOR = at("tools", "author-shape-stone.mjs");
const VERIFY = at("tools", "verify-skill-ladder.mjs");

const MUTATIONS = [
  /* ---------------- N. the declaration ---------------- */
  { file: RULE, name: "N ANY WORD IS A SKILL, so a typo rolls a bonus-free check",
    from: `    if (Object.prototype.hasOwnProperty.call(SKILLS, k) && !skills.includes(k)) skills.push(k);`,
    to: `    if (k && !skills.includes(k)) skills.push(k);`, breaks: "N3" },
  { file: RULE, name: "N duplicates survive",
    from: `    if (Object.prototype.hasOwnProperty.call(SKILLS, k) && !skills.includes(k)) skills.push(k);`,
    to: `    if (Object.prototype.hasOwnProperty.call(SKILLS, k)) skills.push(k);`, breaks: "N3d" },
  { file: RULE, name: "N a row naming no skill is accepted",
    from: `  if (!skills.length) return null;`, to: `  ;`, breaks: "N3b" },
  { file: RULE, name: "N A LADDER WITH NO RUNGS IS ACCEPTED",
    from: `  if (!Object.keys(degrees).length) return null;`, to: `  ;`, breaks: "N4" },
  { file: RULE, name: "N a rung named for no real degree is kept",
    from: `    if (!DEGREE_BY_KEY[k] || !rung || typeof rung !== "object") continue;`,
    to: `    if (!rung || typeof rung !== "object") continue;`, breaks: "N4b" },
  { file: RULE, name: "N another kind reads as a ladder",
    from: `  if (text(raw.kind) !== SKILL_LADDER_KIND) return null;`, to: `  ;`, breaks: "N2" },
  { file: RULE, name: "N a condition loses its value",
    from: `      if (id) conditions.push({ key: id, value: Math.trunc(Number(c?.value) || 0) || null });`,
    to: `      if (id) conditions.push({ key: id, value: null });`, breaks: "N5b" },

  /* ---------------- L. reading the ladder ---------------- */
  { file: RULE, name: "L A PARTIAL FALLS OFF THE LADDER instead of clamping to Failure",
    from: `  return (nearest ?? worst)?.key ?? key;`, to: `  return key;`, breaks: "L3" },
  { file: RULE, name: "L A BLUNDER IS SAFER THAN A FUMBLE",
    from: `    if (worst === null || entry.rank < worst.rank) worst = entry;`, to: `    ;`,
    breaks: "L4" },
  { file: RULE, name: "L it clamps UPWARD, so a Partial becomes a Success",
    from: `    if (entry.rank <= self.rank && (nearest === null || entry.rank > nearest.rank)) nearest = entry;`,
    to: `    if (entry.rank >= self.rank && (nearest === null || entry.rank < nearest.rank)) nearest = entry;`,
    breaks: "L3" },
  { file: RULE, name: "L A CRITICAL IS DRAGGED DOWN TO A PRINTED RUNG",
    from: `  if (self.success) return key;`, to: `  ;`, breaks: "L2b" },
  { file: RULE, name: "L a clamped result stops admitting it was clamped",
    from: `    clamped: at !== lower(rolled),`, to: `    clamped: false,`, breaks: "L5" },
  { file: RULE, name: "L the roll that was made is replaced by the rung",
    from: `    rolled: lower(rolled),`, to: `    rolled: at,`, breaks: "L6" },
  { file: RULE, name: "L a rung with no entry stops reading as unaffected",
    from: `    unaffected: !rung`, to: `    unaffected: false`, breaks: "L2b" },

  /* ---------------- B. the bystanders ---------------- */
  { file: FLOW, name: "B THE CASTER IS OFFERED as somebody standing on their own spell",
    from: `    .filter((t) => t && t.id !== casterTokenId && t.actor);`,
    to: `    .filter((t) => t && t.actor);`, breaks: "B1" },
  { file: FLOW, name: "B the list stops being ordered by distance",
    from: `  return [...list].sort((a, b) => distance(a) - distance(b));`, to: `  return list;`,
    breaks: "B2" },
  { file: FLOW, name: "B AN INVENTED RADIUS HIDES A CREATURE FROM THE GM",
    from: `  return [...list].sort((a, b) => distance(a) - distance(b));`,
    to: `  return [...list].filter((t) => distance(t) < 100).sort((a, b) => distance(a) - distance(b));`,
    breaks: "B3" },
  { file: FLOW, name: "B a token with no actor is offered",
    from: `    .filter((t) => t && t.id !== casterTokenId && t.actor);`,
    to: `    .filter((t) => t && t.id !== casterTokenId);`, breaks: "B4" },

  /* ---------------- C. the card ---------------- */
  { file: RULE, name: "C A SPELL THAT ASKED NOBODY LOOKS LIKE ONE THAT DID",
    from: `  return \`<em>\${spellName}: nobody was standing on it, so no checks were called for.</em>\`;`,
    to: `  return "";`, breaks: "C2" },
  { file: RULE, name: "C THE CARD SHOWS A DEGREE THE PLAYER DID NOT ROLL",
    from: `  const readAt = outcome.clamped
    ? \` (<strong>\${rolledLabel}</strong>, read at the <strong>\${at}</strong> rung)\`
    : \` (<strong>\${at}</strong>)\`;`,
    to: `  const readAt = \` (<strong>\${at}</strong>)\`;`, breaks: "C3" },
  { file: RULE, name: "C an unaffected creature is told it was affected",
    from: `  const what = outcome.unaffected
    ? "is unaffected"`, to: `  const what = false
    ? "is unaffected"`, breaks: "C4" },
  { file: RULE, name: "C the table's half goes unsaid",
    from: `  return "<em>Judged at the table: who was standing on the stone when it moved, and whether "`,
    to: `  return "<em>" + ("`, breaks: "C5" },
  { file: RULE, name: "C the opening stops naming the DC",
    from: `    + \`check against DC <strong>\${dc}</strong> — \${spellName}.\`;`,
    to: `    + \`check — \${spellName}.\`;`, breaks: "C1" },

  /* ---------------- W. the workflow ---------------- */
  { file: FLOW, name: "W EVERY BYSTANDER ARRIVES PRE-TICKED",
    from: `    + \`name="bystander" value="\${t.uuid}"> \${t.name}</label>\`).join("");`,
    to: `    + \`name="bystander" value="\${t.uuid}" checked> \${t.name}</label>\`).join("");`,
    breaks: "W1" },
  { file: FLOW, name: "W THE CHECK LOSES EVERY CONDITIONAL, AURA AND ITEM BONUS",
    from: `      modifiers: skill?.checkModifiers ?? [`, to: `      modifiers: [`, breaks: "W2" },
  { file: FLOW, name: "W it stops being typed as a skill check",
    from: `      type: "skill",`, to: `      type: "generic",`, breaks: "W2c" },
  { file: FLOW, name: "W THE WORST OF THE OFFERED SKILLS IS USED",
    from: `      if (a > b) best = key;`, to: `      if (a < b) best = key;`, breaks: "W3" },
  { file: FLOW, name: "W the rung's conditions are never applied",
    from: `  const { applyConditionTags } = await import("../combat/effect-application-workflow.mjs");`,
    to: `  const applyConditionTags = async () => {};`, breaks: "W4" },
  { file: FLOW, name: "W an empty picker falls through to rolling nothing silently",
    from: `  if (!chosen.length) {`, to: `  if (false) {`, breaks: "W5" },
  { file: EFF, name: "W a malformed ladder is passed over in silence",
    from: `        lines.push(line(\`<em>\${spell.name} declares a malformed skill ladder.</em>\`));`,
    to: `        ;`, breaks: "W6" },
  { file: EFF, name: "W THE 3.605.0 LIVE DEFECT RETURNS: the ladder falls below the recipients gate",
    from: `    if (effect.kind === "skillLadder") {`,
    to: `    if (false) {`, breaks: "W8" },
  { file: EFF, name: "W A SECOND ROUTE TO THE SAME ROW is left in the per-recipient switch",
    from: `    for (const target of recipients) {
      switch (effect.kind) {`,
    to: `    for (const target of recipients) {
      switch (effect.kind) {
        case "skillLadder": break;`, breaks: "W8b" },
  { file: EFF, name: "W THE DC IS ALWAYS ZERO, so every bystander succeeds",
    from: `        dc: Number(saveDC ?? rollData?.saveDC ?? 0) || 0,`, to: `        dc: 0,`,
    breaks: "W7" },
  { file: KINDS, name: "the kind leaves the handled vocabulary",
    from: `  "skillLadder",`, to: `  ;`, breaks: "N0" },

  /* ---------------- A. the agreement ---------------- */
  { file: RULE, name: "A THE TWO LADDERS DRIFT: this one stops clamping at all",
    from: `  if (declared.includes(key)) return key;

  const self = DEGREE_BY_KEY[key];
  if (!self) return key;
  if (self.success) return key;`,
    to: `  if (declared.includes(key)) return key;
  return key;
  const self = DEGREE_BY_KEY[key];
  if (!self) return key;
  if (self.success) return key;`, breaks: "A1" },

  /* ---------------- K. the manifest ---------------- */
  { file: MANIFEST, name: "K Shape Stone's entry is aimed at the wrong field",
    from: `    id: "shape-stone-effects", pack: "spells", name: "Shape Stone",
    field: "effects", since: "3.605.0",`,
    to: `    id: "shape-stone-effects", pack: "spells", name: "Shape Stone",
    field: "notes", since: "3.605.0",`, breaks: "K1" },
  { file: AUTHOR, name: "K THE CHECK CANNOT READ THE PLAN and passes for the wrong reason",
    from: `  "Shape Stone": (sy) => {`, to: `  "Shape Stone": function (sy) {`, breaks: "K0" }
];

const PACK = [
  { spell: "Shape Stone", name: "P THE DEFECT RESTORED: the check is never called for",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "skillLadder"); },
    breaks: "P1" },
  { spell: "Shape Stone", name: "P: it rolls Athletics instead of the printed Acrobatics",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "skillLadder").skills = ["athletics"]; },
    breaks: "P2" },
  { spell: "Shape Stone", name: "P: the Fumble rung goes, so the worst roll is only a Failure",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "skillLadder").degrees.fumble; },
    breaks: "P3" },
  { spell: "Shape Stone", name: "P A SUCCESS KNOCKS THE CREATURE OVER",
    mutate: (sy) => {
      sy.effects.find((e) => e.kind === "skillLadder").degrees.success.conditions = [{ key: "prone" }];
    }, breaks: "P4c" },
  { spell: "Shape Stone", name: "P: a Failure stops applying prone",
    mutate: (sy) => {
      sy.effects.find((e) => e.kind === "skillLadder").degrees.failure.conditions = [];
    }, breaks: "P4" },
  { spell: "Shape Stone", name: "P THE ROW STOPS NORMALISING, so the spell prints a refusal",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "skillLadder").skills = ["tumbling"]; },
    breaks: "P1b" },
  { spell: "Shape Stone", name: "P: the note about whose call the list is goes",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !/THE GM SAYS WHO WAS STANDING ON IT/.test(e.text ?? ""));
    }, breaks: "P5" },
  // RE-AIMED AT 3.606.0: Shroud IS ruled now (block 32's R2) and already
  // carries a ladder, so adding one to it changed nothing and this survived.
  // Web is still a ruling of its own.
  { spell: "Web", name: "P6 A THIRD SPELL IS WIRED WITHOUT A RULING",
    mutate: (sy) => {
      sy.effects = [...(sy.effects ?? []), { kind: "skillLadder", label: "Web",
        skills: ["acrobatics"], degrees: { success: { text: "x" } } }];
    }, breaks: "P6" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-skill-ladder does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-skill-ladder: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-skill-ladder: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
