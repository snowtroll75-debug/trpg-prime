#!/usr/bin/env node
/**
 * mutate-shadow-tether — can the R8 checks fail?
 *
 * NEW at 3.599.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST PACK MUTATION RESTORES THE INVENTED RULE: a bare `condition`
 * row, which pins the target where it stands on a failed save — a far better
 * spell than the printed one, and not the printed one.
 *
 * THE FIRST CODE MUTATION IS THE BOUNDARY: `>` becomes `>=` and a creature
 * standing at exactly thirty feet is immobilised by a tether the page calls
 * slack.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "distance-trigger.mjs");
const WATCH = at("module", "magic", "distance-trigger-workflow.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const BOOT = at("scripts", "trg-prime.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const VERIFY = at("tools", "verify-shadow-tether.mjs");

const MUTATIONS = [
  /* ---------------- B. the boundary ---------------- */
  { file: RULE, name: "THE BOUNDARY MOVES: thirty feet exactly becomes taut",
    from: `  return measured > spec.feet;`, to: `  return measured >= spec.feet;`, breaks: "B1" },
  { file: RULE, name: "and the tether never goes taut at all",
    from: `  return measured > spec.feet;`, to: `  return false;`, breaks: "B1b" },
  // THE COMPARISON WRITTEN THE OTHER WAY ROUND. `!(x <= n)` looks identical
  // to `x > n` and differs on exactly one input: NaN, where every comparison
  // is false. This is the mutation the deleted `Number.isFinite` guard was
  // pretending to be protection against.
  { file: RULE, name: "AN UNMEASURABLE DISTANCE IMMOBILISES SOMEBODY",
    from: `  return measured > spec.feet;`, to: `  return !(measured <= spec.feet);`, breaks: "B3" },
  { file: RULE, name: "a malformed spec fires on any distance",
    from: `  if (!spec) return false;`, to: `  ;`, breaks: "B4" },

  /* ---------------- R. the refusals ---------------- */
  { file: RULE, name: "R a row with no condition arms, fires, and applies nothing",
    from: `  if (!condition) return null;`, to: `  ;`, breaks: "R1" },
  { file: RULE, name: "R A TETHER OF NO LENGTH is accepted, so it fires on the first step",
    from: `  if (feet <= 0) return null;`, to: `  ;`, breaks: "R2" },
  { file: RULE, name: "R a negative threshold is accepted",
    from: `  if (feet <= 0) return null;`, to: `  if (feet === 0) return null;`, breaks: "R2b" },
  { file: RULE, name: "R an origin nothing resolves is accepted",
    from: `  if (!TRIGGER_ORIGINS.includes(from)) return null;`, to: `  ;`, breaks: "R3" },
  // (the kind guard's mutation lives in section A, beside the round-trip check
  // it also breaks — one anchor, one mutation.)
  { file: RULE, name: "R the condition keeps its casing and misses the registry",
    from: `  const condition = text(raw.condition).toLowerCase();`,
    to: `  const condition = text(raw.condition);`, breaks: "R6" },

  /* ---------------- A. the applier ---------------- */
  { file: APPLIER, name: "A the tether forgets what it measures from",
    from: `              tetherAnchor: casterToken?.uuid ?? ""`, to: `              tetherAnchor: ""`,
    breaks: "A2" },
  { file: APPLIER, name: "A and it carries no spec, so the watcher has no rule to read",
    from: `              [TETHER_FLAG]: { kind: "distanceTrigger", ...tetherSpec },`,
    to: `              [TETHER_FLAG]: true,`, breaks: "A2b" },
  // THE DEFECT THE DRIVE FOUND, restored exactly: store the normalised spec
  // without its kind and the watcher's re-normalisation returns null for ever.
  { file: APPLIER, name: "A THE STORED SPEC LOSES ITS KIND, so the tether can never fire",
    from: `              [TETHER_FLAG]: { kind: "distanceTrigger", ...tetherSpec },`,
    to: `              [TETHER_FLAG]: tetherSpec,`, breaks: "A2b" },
  { file: RULE, name: "A the kind guard is loosened instead, so any stored object reads as a tether",
    from: `  if (!raw || raw.kind !== "distanceTrigger") return null;`, to: `  if (!raw) return null;`,
    breaks: "A2d" },
  { file: APPLIER, name: "A A TARGET ALREADY BEYOND THE TETHER IS ARMED INSTEAD OF CAUGHT",
    from: `            tautNow = distanceTriggerFires(tetherSpec, feetNow);`, to: `            ;`,
    breaks: "A3" },
  { file: APPLIER, name: "A the cast-time test runs without tokens, measuring nothing as zero",
    from: `          if (casterToken && targetToken) {`, to: `          if (true) {`, breaks: "A3c" },
  { file: APPLIER, name: "A the effect carries changes, so it alters the sheet",
    from: `            changes: [],
            flags: tetherFlags`,
    to: `            changes: [{ key: "system.combat.movement.land.base", mode: 5, value: "0" }],
            flags: tetherFlags`, breaks: "A4" },
  { file: APPLIER, name: "A a malformed row goes back to silence",
    from: `            lines.push(line(` + '\x60' + `<em>\${spell.name} declares a malformed tether.</em>` + '\x60' + `));`,
    to: `            ;`, breaks: "A5" },
  { file: KINDS, name: "A the kind leaves the handled vocabulary",
    from: `  "distanceTrigger",`, to: `  ;`, breaks: "A1" },

  /* ---------------- W. the watcher ---------------- */
  { file: BOOT, name: "W THE WATCHER IS NEVER REGISTERED, so the tether never fires",
    from: `  registerDistanceTriggers();`, to: `  ;`, breaks: "W1" },
  { file: WATCH, name: "W it fires on any token update, not only a move",
    from: `    if (!("x" in changed) && !("y" in changed)) return;`, to: `    ;`, breaks: "W2b" },
  { file: WATCH, name: "W THE TETHER NEVER FIRES ONCE: it stays armed and re-applies for ever",
    from: `    await tether.delete();
    fired.push(spec.condition);`, to: `    fired.push(spec.condition);`, breaks: "W4" },
  { file: WATCH, name: "W the condition gets a fresh clock instead of the spell's",
    from: `      spellEffectEnd: tether.getFlag(SYSTEM_ID, "spellEffectEnd") ?? null,`,
    to: `      spellEffectEnd: null,`, breaks: "W5" },
  { file: WATCH, name: "W AN ANCHOR THAT HAS GONE LEAVES THE TETHER ARMED, measuring nothing",
    from: `    if (!anchor) {`, to: `    if (false) {`, breaks: "W6" },
  { file: WATCH, name: "W and its removal is silent",
    from: `          + ` + '\x60' + `\${actor.name}'s tether has nothing left to measure from — it is removed.</em></p></div>` + '\x60',
    to: `          + ` + '\x60' + `</em></p></div>` + '\x60', breaks: "W6" },
  { file: WATCH, name: "W a second distance function is written instead of the system's",
    from: `    const feet = distanceBetween(moved, anchor);`,
    to: `    const feet = Math.round(Math.hypot(moved.x - anchor.x, moved.y - anchor.y) / 50) * 5;`,
    breaks: "W7" },
  { file: WATCH, name: "W the tethers of whoever moved are not the ones measured",
    from: `  const tethers = tethersOn(actor);`, to: `  const tethers = [];`, breaks: "W3" },

  /* ---------------- C. the card ---------------- */
  { file: RULE, name: "C the armed line stops naming the threshold",
    from: "    + `are more than ${spec.feet} feet from you${durationText}.`;",
    to: "    + `are far from you${durationText}.`;", breaks: "C1" },
  { file: RULE, name: "C the immediate line stops saying why it landed at once",
    from: `  return ` + '\x60' + `<strong>\${targetName}</strong> is already \${feetApart} feet away &mdash; the tether is taut and ` + '\x60',
    to: `  return ` + '\x60' + `<strong>\${targetName}</strong> is caught and ` + '\x60', breaks: "C2" },
  { file: RULE, name: "C the fired line stops naming the distance that did it",
    from: `  return ` + '\x60' + `<strong>\${targetName}</strong> moves \${feetApart} feet from you and the tether snaps taut &mdash; ` + '\x60',
    to: `  return ` + '\x60' + `<strong>\${targetName}</strong> is caught by the tether &mdash; ` + '\x60', breaks: "C3" }
];

const PACK = [
  { spell: "Shadow Tether", name: "P THE INVENTED RULE RESTORED: a bare condition pins the target where it stands",
    mutate: (sy) => {
      sy.effects = [{ kind: "condition", target: "targets", condition: "immobilised" },
        ...sy.effects.filter((e) => e.kind !== "distanceTrigger")];
    }, breaks: "D1" },
  { spell: "Shadow Tether", name: "P: the tether is authored at the wrong length",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "distanceTrigger").feet = 60; }, breaks: "D1b" },
  { spell: "Shadow Tether", name: "P: it immobilises with the wrong condition",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "distanceTrigger").condition = "slowed"; },
    breaks: "D1d" },
  { spell: "Shadow Tether", name: "P: the damage is made conditional on the save degree",
    mutate: (sy) => { sy.damage.formula = "1d8"; }, breaks: "D3" },
  { spell: "Shadow Tether", name: "P: the save is dropped",
    mutate: (sy) => { sy.defence = ""; }, breaks: "D3b" },
  { spell: "Shadow Tether", name: "P: the extra-target warp goes inert",
    mutate: (sy) => { sy.warps[0].mods = {}; }, breaks: "D4" },
  { spell: "Shadow Tether", name: "P: that the damage does not wait goes unsaid",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /DEALT REGARDLESS/.test(e.text)));
    }, breaks: "D5" },
  { spell: "Shadow Tether", name: "P: the already-beyond-30 reading goes unstated",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /ALREADY BEYOND 30 FEET/.test(e.text)));
    }, breaks: "D5c" },
  { spell: "Shadow Tether", name: "P: THE OLD NOTE THAT DESCRIBED THE GAP COMES BACK",
    mutate: (sy) => {
      sy.effects.push({ kind: "note",
        text: "The immobilisation only triggers if the target moves more than 30 ft from you; "
          + "2d8 essence damage is dealt regardless (Basic Reflex)." });
    }, breaks: "D6" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-shadow-tether does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-shadow-tether: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-shadow-tether: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
