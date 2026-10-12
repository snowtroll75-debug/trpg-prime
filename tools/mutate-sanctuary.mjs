#!/usr/bin/env node
/**
 * mutate-sanctuary — can the R1 checks fail?
 *
 * NEW at 3.598.0. SURVIVED and an unmatched anchor are both failures.
 *
 * SECTION D RESTORES THE DEFECT I ALMOST SHIPPED: read `defence` without
 * asking whether the save is deferred, and the protected ALLY rolls Will to
 * resist their own 2 PP ward while `beneficial-save.mjs` calls it an attack.
 *
 * SECTION L RESTORES THE FEAR BUG: take the ladder round
 * `effectiveSaveDegree` and a BLUNDER — the worst save in the game — matches
 * no rung and the attack goes through, while a mere fumble locks the attacker
 * out for a minute.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "sanctuary.mjs");
const GATE = at("module", "combat", "sanctuary-gate.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const BENEFIT = at("module", "magic", "beneficial-save.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const VERIFY = at("tools", "verify-sanctuary.mjs");

const MUTATIONS = [
  /* ---------------- L. the ladder ---------------- */
  { file: RULE, name: "THE FEAR BUG RESTORED: the ladder is read without the degree rule",
    from: `  const key = effectiveSaveDegree(LADDER, rolledDegree);`,
    to: `  const key = String(rolledDegree ?? "").trim().toLowerCase();`, breaks: "L4" },
  { file: RULE, name: "a degree the ladder does not name blocks for the duration instead",
    from: `  return row?.outcome ?? SANCTUARY.PASSED;`,
    to: `  return row?.outcome ?? SANCTUARY.BLOCKED_DURATION;`, breaks: "L4c" },
  { file: RULE, name: "A SUCCESS IS NO LONGER NAMED, so a clean save blocks the attack",
    from: `  Object.freeze({ onSave: ["success"], outcome: SANCTUARY.PASSED }),`,
    to: `  Object.freeze({ onSave: ["partial"], outcome: SANCTUARY.PASSED }),`, breaks: "L1" },
  { file: RULE, name: "a failure locks the attacker out for the whole duration",
    from: `  Object.freeze({ onSave: ["failure"], outcome: SANCTUARY.BLOCKED_TURN }),`,
    to: `  Object.freeze({ onSave: ["failure"], outcome: SANCTUARY.BLOCKED_DURATION }),`, breaks: "L2" },
  { file: RULE, name: "and a fumble only costs them a turn",
    from: `  Object.freeze({ onSave: ["fumble"], outcome: SANCTUARY.BLOCKED_DURATION })`,
    to: `  Object.freeze({ onSave: ["fumble"], outcome: SANCTUARY.BLOCKED_TURN })`, breaks: "L3" },

  /* ---------------- V. the record ---------------- */
  { file: RULE, name: "V A PASS IS FORGOTTEN, so a creature that got through saves every swing",
    from: `  if (entry.state === SANCTUARY.PASSED) return { mustSave: false, blocked: false, reason: null };`,
    to: `  ;`, breaks: "V2" },
  { file: RULE, name: "V a turn lockout never lifts",
    from: `    return { mustSave: true, blocked: false, reason: null };
  }
  // AN UNREADABLE VERDICT IS NOT A LOCKOUT.`,
    to: `    return { mustSave: false, blocked: true, reason: SANCTUARY.BLOCKED_TURN };
  }
  // AN UNREADABLE VERDICT IS NOT A LOCKOUT.`, breaks: "V3b" },
  { file: RULE, name: "V a later round passes freely instead of saving afresh",
    from: `    if (Number(entry.round) === Number(round)) {`, to: `    if (false) {`, breaks: "V3" },
  { file: RULE, name: "V A LOCKOUT OUT OF COMBAT LASTS FOR EVER",
    from: `    if (round === null || entry.round === null) return { mustSave: true, blocked: false, reason: null };`,
    to: `    ;`, breaks: "V6" },
  { file: RULE, name: "V a hand-edited verdict becomes a permanent lockout",
    from: `  // AN UNREADABLE VERDICT IS NOT A LOCKOUT. A hand-edited flag must not be
  // able to make a creature unattackable for ever.
  return { mustSave: true, blocked: false, reason: null };`,
    to: `  return { mustSave: false, blocked: true, reason: SANCTUARY.BLOCKED_DURATION };`,
    breaks: "V7" },
  { file: RULE, name: "V the record is mutated in place",
    from: `  return {
    ...(record ?? {}),
    [String(attackerId)]: {`,
    to: `  const out = record ?? {};
  return Object.assign(out, {
    [String(attackerId)]: {`, breaks: "V8" },
  { file: RULE, name: "V a fumble stores the round as well, so it can expire",
    from: `      round: state === SANCTUARY.BLOCKED_TURN ? (round === null ? null : Number(round)) : null`,
    to: `      round: round === null ? null : Number(round)`, breaks: "V4" },

  /* ---------------- D. whose save it is ---------------- */
  { file: CAST, name: "D THE DEFECT ALMOST SHIPPED: the protected ally rolls Will to resist its own ward",
    // RE-ANCHORED 3.609.0: Turn Undead's own deferral now follows this line.
    from: `      && !spellDefersItsSave(spellData.effects)\n`, to: `\n`, breaks: "D1" },
  { file: RULE, name: "D the deferral rule stops recognising the row",
    // RE-ANCHORED 3.609.0: Visage Of Horror's row defers too, on the next line.
    from: `.some((e) => normaliseSanctuary(e) !== null\n`,
    to: `.some((e) => false\n`, breaks: "D1b" },
  { file: RULE, name: "D and recognises every row as deferring",
    from: `.some((e) => normaliseSanctuary(e) !== null\n`,
    to: `.some((e) => true\n`, breaks: "D1b" },
  { file: BENEFIT, name: "D A 2 PP WARD ON A FRIEND IS CALLED AN ATTACK",
    from: `  if (String(spellData?.defence ?? "").trim() && !spellDefersItsSave(spellData?.effects)) return false;`,
    to: `  if (String(spellData?.defence ?? "").trim()) return false;`, breaks: "D2" },
  { file: BENEFIT, name: "D and every save spell becomes a favour",
    from: `  if (String(spellData?.defence ?? "").trim() && !spellDefersItsSave(spellData?.effects)) return false;`,
    to: `  ;`, breaks: "D2b" },
  { file: BENEFIT, name: "D the ward stops counting as a helpful row",
    from: `    return kind === "heal" || kind === "temphp" || kind === "bonus" || kind === "sanctuary";`,
    to: `    return kind === "heal" || kind === "temphp" || kind === "bonus";`, breaks: "D2" },

  /* ---------------- G. the gate ---------------- */
  { file: ATTACK, name: "G THE GATE MOVES AFTER THE SPEND, so a refused attempt costs an AP",
    from: `    if (sanctuary.blocked && !sanctuary.wastesAction) return null;`, to: `    ;`, breaks: "G2b" },
  { file: ATTACK, name: "G a failed save no longer stops the attack",
    from: `  if (sanctuary.blocked) return null;`, to: `  ;`, breaks: "G2c" },
  { file: ATTACK, name: "G the gate is never asked",
    from: `    sanctuary = await sanctuaryCheck(actor, targetActor, \`\${weapon.name} attack\`);`,
    to: `    sanctuary = { blocked: false };`, breaks: "G2" },
  { file: GATE, name: "G A FUMBLE NO LONGER WASTES THE ACTION, so the worst save is the cheapest",
    from: `      wastesAction = true;
    } else {`, to: `    } else {`, breaks: "G2e" },
  { file: GATE, name: "G and neither does a failure",
    from: `      lines.push(sanctuaryBlockedTurnLine(attacker.name, targetActor.name, round !== null));
      blocked = true;
      wastesAction = true;`,
    to: `      lines.push(sanctuaryBlockedTurnLine(attacker.name, targetActor.name, round !== null));
      blocked = true;`, breaks: "G2e" },
  { file: CAST, name: "G A SPELL ATTACK IGNORES THE WARD, so it stops swords and not Magic Missile",
    from: `    const ward = await sanctuaryCheck(actor, targetActor, spell.name);`,
    to: `    const ward = { blocked: false };`, breaks: "G3" },
  { file: GATE, name: "G a suppressed ward protects anyway",
    from: `    .filter((e) => !e.disabled && e.getFlag?.(SYSTEM_ID, WARD_FLAG));`,
    to: `    .filter((e) => e.getFlag?.(SYSTEM_ID, WARD_FLAG));`, breaks: "G4" },
  { file: GATE, name: "G A SAVE WITH NO DEGREE IS RECORDED AS A PASS",
    from: `    if (!degree) {`, to: `    if (false) {`, breaks: "G4b" },
  { file: APPLIER, name: "G the ward carries no DC, so the later save has nothing to beat",
    from: `              sanctuaryDC: Number(saveDC ?? 0) || null,`, to: `              sanctuaryDC: null,`,
    breaks: "G1c" },
  { file: APPLIER, name: "G the ward forgets who cast it",
    from: `              sanctuaryCaster: caster?.uuid ?? "",`, to: `              sanctuaryCaster: "",`,
    breaks: "G1c" },
  { file: APPLIER, name: "G the ward's effect carries changes, so it alters the sheet",
    from: `            changes: [],
            flags: wardFlags`, to: `            changes: [{ key: "system.combat.defence.total", mode: 2, value: "1" }],
            flags: wardFlags`, breaks: "G1b" },
  { file: KINDS, name: "G the kind leaves the handled vocabulary",
    from: `  "sanctuary",`, to: `  ;`, breaks: "G1" },

  /* ---------------- H. the hostile action ---------------- */
  { file: ATTACK, name: "H A WARDED FIGHTER SWINGS ALL DAY with the spell still up",
    from: `    await endSanctuaryOnHostileAction(actor);`, to: `    ;`, breaks: "H1" },
  { file: GATE, name: "H every action ends the ward, including moving and drinking a potion",
    from: `    if (action) {`, to: `    if (false) {`, breaks: "H2" },
  { file: GATE, name: "H A FAILURE TO END THE WARD RETHROWS and loses the player's action",
    from: `    console.error("TRG Prime | a sanctuary ward could not be ended", error);
    return false;`,
    to: `    console.error("TRG Prime | a sanctuary ward could not be ended", error);
    throw error;`, breaks: "H3b" }
];

const PACK = [
  { spell: "Sanctuary", name: "P THE DEFECT RESTORED: the whole spell goes back to nothing",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "sanctuary"); }, breaks: "P1" },
  { spell: "Sanctuary", name: "P: the ward lands on the caster instead of the creature touched",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "sanctuary").target = "self"; }, breaks: "P1b" },
  { spell: "Sanctuary", name: "P: the printed save is dropped, so the DC has nothing to come from",
    mutate: (sy) => { sy.defence = ""; }, breaks: "P2" },
  { spell: "Sanctuary", name: "P: whose save it is goes unsaid",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /THE SAVE IS THE OPPONENT/.test(e.text)));
    }, breaks: "P3" },
  { spell: "Sanctuary", name: "P: the four unprinted degrees go unexplained",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /Heroic save/.test(e.text)));
    }, breaks: "P3b" },
  { spell: "Sanctuary", name: "P: the out-of-combat reading goes unstated",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /OUT OF COMBAT/.test(e.text)));
    }, breaks: "P3c" },
  { spell: "Sanctuary", name: "P: what counts as a hostile action goes unlisted",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => !(e.kind === "note" && /HOSTILE ACTION BY THE PROTECTED/.test(e.text)));
    }, breaks: "P3d" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-sanctuary does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-sanctuary: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-sanctuary: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
