#!/usr/bin/env node
/**
 * mutate-scorching-ray — can the R5/R13 checks fail?
 *
 * NEW at 3.600.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE TWO DEFECTS THIS RELEASE FIXED ARE THE FIRST TWO PACK MUTATIONS AND THE
 * FIRST TWO PENALTY MUTATIONS: take the AP modes away and the extra actions buy
 * nothing again; advance the penalty per ray and a three-ray volley is charged
 * three times over before the second ray has even flown.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "ray-volley.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const VERIFY = at("tools", "verify-scorching-ray.mjs");

const MUTATIONS = [
  /* ---------------- A. the ray count ---------------- */
  { file: RULE, name: "A THE CAP GOES: nine actions buy nine rays",
    from: `  return Math.min(MAX_RAYS, actions);`, to: `  return actions;`, breaks: "A4" },
  { file: RULE, name: "A the cap becomes two",
    from: `export const MAX_RAYS = 3;`, to: `export const MAX_RAYS = 2;`, breaks: "A3" },
  { file: RULE, name: "A A CAST OF NOTHING FIRES NOTHING, so the spell does nothing",
    from: `  if (actions <= 1) return 1;`, to: `  if (actions <= 1) return actions;`, breaks: "A5" },
  { file: RULE, name: "A a nonsense AP becomes zero rays",
    from: `const int = (v) => Math.trunc(Number(v) || 0);`,
    to: `const int = (v) => Math.trunc(Number(v));`, breaks: "A5b" },

  /* ---------------- T. distinct targets ---------------- */
  { file: RULE, name: "T THE LIST IS TRUNCATED INSTEAD OF DEDUPLICATED",
    from: `    const key = actor.uuid ?? actor.id ?? actor;
    if (seen.has(key)) continue;
    seen.add(key);`, to: `    ;`, breaks: "T2" },
  { file: RULE, name: "T the cap on targets is dropped, so every marked creature is shot",
    from: `    if (out.length >= int(rays)) break;`, to: `    ;`, breaks: "T3" },
  { file: RULE, name: "T AN UNTARGETED TOKEN CONSUMES A RAY",
    from: `    if (!actor) continue;`, to: `    ;`, breaks: "T5" },
  // THE BREAK MOVES BEFORE THE PUSH, which is the only way a ray count of zero
  // can actually yield no targets. The `Math.max(1, …)` this used to mutate was
  // dead: the first creature is already in `out` when the test runs.
  { file: RULE, name: "T A RAY COUNT OF ZERO ASKS FOR NO TARGETS AT ALL",
    from: `    out.push(actor);`, to: `    if (out.length >= int(rays)) break;
    out.push(actor);`, breaks: "T6" },

  /* ---------------- M. the penalty ---------------- */
  { file: CAST, name: "M THE DEFECT RESTORED: each ray advances the penalty as it flies",
    from: `      deferMapAdvance: true,`, to: `      deferMapAdvance: false,`, breaks: "M5" },
  { file: CAST, name: "M and the volley advances it a second time on top",
    from: `  if (!deferMapAdvance && spellCountsTowardMAP(spellData)) {`,
    to: `  if (spellCountsTowardMAP(spellData)) {`, breaks: "M5b" },
  { file: CAST, name: "M THE COUNT IS NOT FROZEN: each ray reads the flag afresh",
    from: `      mapCount: mapBefore,`, to: `      mapCount: null,`, breaks: "M4b" },
  { file: CAST, name: "M the volley never advances the penalty at all",
    from: `    await setAttackCount(actor, mapBefore + advance);`, to: `    ;`,
    breaks: "M6" },
  { file: CAST, name: "M it advances by the rays BOUGHT rather than the rays fired",
    from: `  const advance = volleyMapAdvance(results.length);`,
    to: `  const advance = volleyMapAdvance(rays);`, breaks: "M2" },
  { file: RULE, name: "M the advance goes negative",
    from: `  return Math.max(0, int(firedCount));`, to: `  return int(firedCount);`, breaks: "M3b" },
  { file: CAST, name: "M a spell that does not count toward the penalty is charged anyway",
    from: `  if (advance && counts(spell.system)) {`, to: `  if (advance) {`, breaks: "M6b" },

  /* ---------------- V. the volley in the workflow ---------------- */
  { file: CAST, name: "V THE VOLLEY IS NEVER REACHED, so one ray flies again",
    from: `    spellAttack = await resolveSpellVolley(actor, spell, check, lines, clMods, warpMods, {`,
    to: `    spellAttack = await resolveSpellAttack(actor, spell, check, lines, clMods, warpMods, {`,
    breaks: "V1" },
  { file: CAST, name: "V the ray count never leaves the AP mode",
    from: `      rays: Number(apMode?.rays ?? 0)`, to: `      rays: 0`, breaks: "V1b" },
  { file: CAST, name: "V EVERY ATTACK SPELL IN THE PACK BECOMES A VOLLEY",
    from: `  if (rays <= 1) return resolveSpellAttack(actor, spell, check, lines, clMods, warpMods, opts);`,
    to: `  ;`, breaks: "V2" },
  { file: CAST, name: "V every ray resolves against the first marked creature",
    from: `      targetOverride: targetActor,`, to: `      targetOverride: null,`, breaks: "V3" },
  { file: CAST, name: "V the override is ignored even when given",
    from: `  const targetActor = targetOverride ?? Array.from(game.user?.targets ?? [])[0]?.actor ?? null;`,
    to: `  const targetActor = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;`, breaks: "V3" },
  { file: CAST, name: "V THE PER-CAST LINES ARE PRINTED ONCE PER RAY",
    from: `      quiet: index > 0`, to: `      quiet: false`, breaks: "V4" },
  { file: CAST, name: "V the penalty note stops honouring quiet",
    from: `  if (spellMap && !quiet) {`, to: `  if (spellMap) {`, breaks: "V4b" },
  { file: CAST, name: "V and so does the bonus pool",
    from: `  for (const row of quiet ? [] : poolRows) {`, to: `  for (const row of poolRows) {`,
    breaks: "V4b" },
  { file: CAST, name: "V a volley with nothing marked fires into nothing, silently",
    from: `    lines.push(line(volleyNoTargetsLine(spell.name)));`, to: `    ;`, breaks: "V6" },

  /* ---------------- D. downstream ---------------- */
  { file: CAST, name: "D ONLY THE FIRST RAY'S TARGET RECEIVES THE SPELL'S ROWS",
    from: `      effectTargets = Array.isArray(spellAttack?.rays) && spellAttack.rays.length
        ? spellAttack.rays.map((r) => r.targetActor).filter(Boolean)
        : (spellAttack?.targetActor ? [spellAttack.targetActor] : []);`,
    to: `      effectTargets = spellAttack?.targetActor ? [spellAttack.targetActor] : [];`,
    breaks: "D1" },
  { file: CAST, name: "D TWO CRITICAL INJURIES ARE DROPPED FROM A THREE-RAY VOLLEY",
    from: `  const injuryRays = Array.isArray(spellAttack?.rays) && spellAttack.rays.length
    ? spellAttack.rays
    : (spellAttack ? [spellAttack] : []);`,
    to: `  const injuryRays = spellAttack ? [spellAttack] : [];`, breaks: "D2" },
  { file: CAST, name: "D only the first ray's dice reach the card",
    from: `    rolls: results.flatMap((r) => r.rolls ?? []),`, to: `    rolls: results[0]?.rolls ?? [],`,
    breaks: "D3" },

  /* ---------------- C. the card ---------------- */
  { file: RULE, name: "C a volley of one announces rays it does not have",
    from: `  if (rays <= 1) return "";`, to: `  ;`, breaks: "C1" },
  { file: RULE, name: "C A SHORTFALL GOES UNMENTIONED, so three actions buying two rays is silent",
    from: `  const shortfall = fired < rays`, to: `  const shortfall = false`, breaks: "C3" },
  { file: RULE, name: "C the closing line stops naming the jump",
    from: `  return \`<em>Multiple attack penalty now advances by \${fired} &mdash; from \${mapBefore} to \``,
    to: `  return \`<em>Multiple attack penalty advances. \` + \`\``, breaks: "C5" },
  { file: RULE, name: "C and it announces itself for a single ray",
    from: `  if (fired <= 1) return "";`, to: `  ;`, breaks: "C4" },
  { file: RULE, name: "C an empty volley stops saying what to do",
    from: `  return \`<em>\${spellName} found no target — mark one or more creatures and cast again.</em>\`;`,
    to: `  return \`<em>\${spellName} found no target.</em>\`;`, breaks: "C6" }
];

const PACK = [
  { spell: "Scorching Ray", name: "P THE DEFECT RESTORED: the extra actions buy nothing again",
    mutate: (sy) => { sy.apOptions = []; }, breaks: "P1" },
  { spell: "Scorching Ray", name: "P: the modes are there but buy no rays",
    mutate: (sy) => { for (const m of sy.apOptions) delete m.rays; }, breaks: "P1b" },
  { spell: "Scorching Ray", name: "P: three actions buy two rays",
    mutate: (sy) => { sy.apOptions[2].rays = 2; }, breaks: "P1b" },
  { spell: "Scorching Ray", name: "P THE TRAP: a mode carries an empty effects array and wipes the rows",
    mutate: (sy) => { for (const m of sy.apOptions) m.effects = []; }, breaks: "V5" },
  { spell: "Scorching Ray", name: "P: a mode loses the printed range",
    mutate: (sy) => { sy.apOptions[1].range = "60 feet"; }, breaks: "P2" },
  { spell: "Scorching Ray", name: "P: the damage moves onto the modes",
    mutate: (sy) => { sy.damage.formula = ""; }, breaks: "P3" },
  { spell: "Scorching Ray", name: "P: it stops being an attack spell",
    mutate: (sy) => { sy.category = "utility"; }, breaks: "P3b" },
  { spell: "Scorching Ray", name: "P: the +2 PP warp goes inert",
    mutate: (sy) => { sy.warps[0].mods = {}; }, breaks: "P4" },
  { spell: "Scorching Ray", name: "P: that targets must be marked first goes unsaid",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !/ONE RAY PER ACTION/.test(e.text ?? ""));
    }, breaks: "P5" },
  { spell: "Scorching Ray", name: "P: the one-check ruling goes unexplained",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !/ONE CAST A SPELL CHECK/.test(e.text ?? ""));
    }, breaks: "P6" },
  { spell: "Scorching Ray", name: "P: that the penalty is paid afterwards goes unsaid",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !/CLIMBS AFTERWARDS/.test(e.text ?? ""));
    }, breaks: "P7" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-scorching-ray does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-scorching-ray: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-scorching-ray: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
