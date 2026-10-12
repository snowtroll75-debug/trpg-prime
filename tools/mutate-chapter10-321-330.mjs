#!/usr/bin/env node
/**
 * mutate-chapter10-321-330 — can block 32's first checks fail?
 *
 * NEW at 3.606.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IN SECTION W IS THE DEFECT FOUND WHILE DRIVING THIS
 * RELEASE: the ladder branch reading the SPELL's damage type rather than
 * the ladder's. Every earlier ladder stored the same type twice, so it had
 * never shown; Slay The Soul stores none, and would have dealt force.
 *
 * SECTION P MUTATES THE PACK, because nine spells' whole content is rows.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const LADDER = at("module", "magic", "save-ladder.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const END = at("module", "magic", "end-save.mjs");
const END_WF = at("module", "magic", "end-save-workflow.mjs");
const BOOT = at("scripts", "trg-prime.mjs");
const FM = at("module", "combat", "forced-movement-workflow.mjs");
const FALL = at("module", "combat", "falling-workflow.mjs");
const MARK = at("module", "magic", "markers.mjs");
const REST = at("module", "rest", "rest-workflow.mjs");
const RES = at("module", "magic", "resurrection.mjs");
const SKL = at("module", "magic", "skill-ladder.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const REPAIRS = at("module", "data", "pack-repairs.mjs");
const VERIFY = at("tools", "verify-chapter10-321-330.mjs");

const MUTATIONS = [
  /* ---------------- L. the ladder's vocabulary ---------------- */
  { file: LADDER, name: "L: the three words are refused as bad dice",
    from: `    if (RUNG_WORDS.includes(word)) {`, to: `    if (false) {`, breaks: "L1" },
  { file: LADDER, name: "L: a recurring ladder accepts the words again",
    from: `      if (!allowWords) return null;`, to: `      ;`, breaks: "L2" },
  { file: LADDER, name: "L: half is not floored — 6.5 sonic damage",
    // RE-ANCHORED 3.609.0: "double" joined the shared words.
    from: `const fixed = dice === "half" ? Math.floor(total / 2) : dice === "double" ? total * 2 : total;`,
    to: `const fixed = dice === "half" ? total / 2 : dice === "double" ? total * 2 : total;`, breaks: "L4" },
  { file: LADDER, name: "L: half and full swap",
    from: `const fixed = dice === "half" ? Math.floor(total / 2) : dice === "double" ? total * 2 : total;`,
    to: `const fixed = dice === "full" ? Math.floor(total / 2) : dice === "double" ? total * 2 : total;`, breaks: "L4b" },
  { file: LADDER, name: "L: no shared roll reads as a roll of 0",
    from: `    if (shared === null || shared === undefined || !Number.isFinite(Number(shared))) {`,
    to: `    if (false) {`, breaks: "L4d" },
  { file: LADDER, name: "L: margin damage ignores the margin and deals 1",
    from: `    const value = typeof fromMargin === "function" ? fromMargin(margin, 1, 0) : null;`,
    to: `    const value = 1;`, breaks: "L5" },
  { file: LADDER, name: "L: a destination rung is harmless again",
    from: `    harmless: !dice && !slays && !severity && dropsTo === null && !soulDestroyed && !persistent,`,
    to: `    harmless: !dice && !slays && !severity && !soulDestroyed && !persistent,`, breaks: "L5e" },
  { file: LADDER, name: "L: THE MASSACRE DEFECT A THIRD TIME — a critical with no dice is harmless",
    from: `    harmless: !dice && !slays && !severity && dropsTo === null && !soulDestroyed && !persistent,`,
    to: `    harmless: !dice && !slays && dropsTo === null && !soulDestroyed && !persistent,`, breaks: "L6" },
  { file: LADDER, name: "L: a 0 destination is dropped as falsy",
    from: `    if (hp === null || hp === "" || !Number.isFinite(Number(hp))) continue;`,
    to: `    if (!hp) continue;`, breaks: "L5i" },
  { file: LADDER, name: "L: the soul is never destroyed",
    from: `  const soulDestroyed = (spec.soulDestroyedOn ?? []).includes(rung);`,
    to: `  const soulDestroyed = false;`, breaks: "L6d" },
  { file: LADDER, name: "L: a dice-less rung prints 0 damage again",
    from: `  if (!outcome?.dice) {\n    const parts = [];`, to: `  if (false) {\n    const parts = [];`,
    breaks: "L7" },

  /* ---------------- W. the cast workflow ---------------- */
  { file: CAST, name: "W THE DEFECT FOUND DRIVING: the ladder reads the spell's type, not its own",
    from: `      const ladderType = saveLadder.damageType || damageType;`,
    to: `      const ladderType = damageType;`, breaks: "W2" },
  { file: CAST, name: "W: the card says the ladder's type but the defences see the spell's",
    from: `          type: ladderType,`, to: `          type: damageType,`, breaks: "W2b" },
  { file: CAST, name: "W: a margin rung is measured against nobody's margin",
    from: `          margin,\n          fromMargin: valueFromMargin`, to: `          margin: null,\n          fromMargin: valueFromMargin`,
    breaks: "W3b" },
  { file: CAST, name: "W: an unmeasurable rung goes silent",
    from: `      if (rungAmount.why) {`, to: `      if (false) {`, breaks: "W3d" },
  { file: CAST, name: "W: Slay The Soul's Failure stops putting anybody at 0 HP",
    from: `        const dropped = await enterDyingAt(target, outcome.dropsTo, { isCritical: Boolean(outcome.severity) });`,
    to: `        const dropped = null;`, breaks: "W4" },
  { file: CAST, name: "W: a destroyed soul is never written onto the body",
    from: `        await target.setFlag?.(SYSTEM_ID, SOUL_DESTROYED_FLAG,`,
    to: `        await target.unsetFlag?.(SYSTEM_ID, SOUL_DESTROYED_FLAG,`, breaks: "W5" },
  { file: CAST, name: "W: a critical with no dice in front of it never lands",
    from: `      if (outcome.severity && (taken > 0 || (!outcome.dice && !outcome.slays))) {`,
    to: `      if (outcome.severity && taken > 0) {`, breaks: "W6" },
  { file: CAST, name: "W: half/full ladders never roll the shared damage",
    from: `  } else if (saveLadder && ladderUsesSharedRoll(saveLadder) && damageFormula) {`,
    to: `  } else if (false) {`, breaks: "W7" },

  /* ---------------- E. the end save ---------------- */
  { file: END, name: "E: A HEROIC ESCAPES THE PRICE — the upward walk is gone",
    from: `  for (let i = from; i >= 0; i -= 1) if (has(DEGREE_ORDER[i])) return DEGREE_ORDER[i];`,
    to: `  return null;`, breaks: "E2d" },
  { file: END, name: "E: a DC of 0 is taken as a DC",
    from: `    saveDC: Number.isFinite(dc) && dc > 0 ? dc : null`, to: `    saveDC: Number.isFinite(dc) ? dc : null`,
    breaks: "E3" },
  { file: END, name: "E: a negative price is accepted",
    from: `    if (!Number.isFinite(n) || n < 0) return null;`, to: `    if (!Number.isFinite(n)) return null;`,
    breaks: "E3c" },
  { file: BOOT, name: "E: the hook is never registered",
    from: `  registerEndSaveHooks();`, to: `  ;`, breaks: "E5" },
  { file: END_WF, name: "E: every client rolls the save",
    from: `      if (game?.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;`,
    to: `      ;`, breaks: "E5c" },
  { file: APPLIER, name: "E: the save is stamped on the FATIGUE, not the quickened",
    from: `            }, { on: effect.condition, castId });`, to: `            }, { on: "fatigued", castId });`,
    breaks: "E6" },
  { file: END_WF, name: "E: with a cast id, any quickened will do",
    from: `    ? candidates.find((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId) ?? null`,
    to: `    ? candidates.find((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId) ?? candidates[0] ?? null`,
    breaks: "E6b" },

  /* ---------------- F. forced Step, fall ---------------- */
  { file: KINDS, name: "F: forcedMove leaves the handled vocabulary",
    from: `  "forcedMove",\n`, to: ``, breaks: "F1" },
  { file: FM, name: "F: the forced Step never moves the token",
    from: `  if (destination) await targetToken.update(destination);`,
    to: `  ;`, breaks: "F2b" },
  { file: APPLIER, name: "F: the target is startled TOWARD the caster — moved away from itself",
    from: `          const moved = await forceMoveAway(caster, target, feet);`,
    to: `          const moved = await forceMoveAway(target, caster, feet);`, breaks: "F3" },
  { file: APPLIER, name: "F: the pit forgets its victims are targeted, and they land on themselves",
    from: `          const fell = await rollFalling(target, { distance: feet, onto: null, note });`,
    to: `          const fell = await rollFalling(target, { distance: feet, note });`, breaks: "F4" },
  { file: FALL, name: "F: a creature can be landed on by its own fall",
    from: `  const landedOn = targeted && targeted !== actor && targeted.uuid !== actor?.uuid ? targeted : null;`,
    to: `  const landedOn = targeted;`, breaks: "F5" },

  /* ---------------- H. the haunting ---------------- */
  { file: MARK, name: "H: the haunting is spent by one night",
    // RE-ANCHORED 3.612.0: False Arrogance's marker now follows Haunted.
    from: `    reader: "module/rest/rest-workflow.mjs",\n    consumed: false\n  }),\n  // FALSE ARROGANCE`,
    to: `    reader: "module/rest/rest-workflow.mjs"\n  }),\n  // FALSE ARROGANCE`, breaks: "H1c" },
  { file: REST, name: "H: a haunted rest recovers anyway",
    from: `  const realHours = haunted ? 0 : tableHours;`, to: `  const realHours = tableHours;`, breaks: "H2b" },
  { file: REST, name: "H: a haunted rest stops the party's clock",
    from: `    hours: tableHours,`, to: `    hours: realHours,`, breaks: "H2c" },
  { file: APPLIER, name: "H: a gated self row ignores the targets' rolls again",
    from: `      ? (isDegreeGated(effect)\n        ? (ladderResults.some`, to: `      ? (false\n        ? (ladderResults.some`,
    breaks: "H3" },

  /* ---------------- R. the soul ---------------- */
  { file: RES, name: "R: an empty record reads as a destroyed soul",
    from: `  return Boolean(record && typeof record === "object" && String(record.by ?? "").trim());`,
    to: `  return Boolean(record);`, breaks: "R1c" },
  { file: APPLIER, name: "R: Resurrection raises a destroyed soul",
    from: `            if (soulIsGone(gone)) {`, to: `            if (false) {`, breaks: "R3" },

  /* ---------------- A. the article ---------------- */
  { file: SKL, name: "A THE 3.605.1 DEFECT RESTORED: \"a Acrobatics\"",
    from: `  return /^[aeiou]/i.test(String(word ?? "").trim()) ? "an" : "a";`, to: `  return "a";`, breaks: "A1" },

  /* ---------------- P. the manifest ---------------- */
  { file: REPAIRS, name: "P: Speak With Dead's new save is repaired on the compendium only",
    from: `    id: "speak-with-dead-defence-3606",`, to: `    id: "speak-with-dead-defence-3606", since: "3.605.0", _x:`,
    breaks: "P11" }
];

const PACK = [
  { spell: "Slay The Soul", name: "P THE DEFECT RESTORED: a PP 10 spell does nothing again",
    mutate: (sy) => { sy.effects = []; }, breaks: "P1b" },
  { spell: "Slay The Soul", name: "P: a Critical rung is invented",
    mutate: (sy) => { sy.effects[0].ladder.critical = ""; }, breaks: "P2b" },
  { spell: "Soul Destruction", name: "P: the Fumble note goes, and the slain take 10d10 Soul Drain",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => !(e.kind === "note" && e.onSave)); }, breaks: "P1b" },
  { spell: "Soul Destruction", name: "P: the Failure's Soul Drain is 6d10",
    mutate: (sy) => { sy.effects.find((e) => e.formula === "10d10").formula = "6d10"; }, breaks: "P3" },
  { spell: "Sound Burst", name: "P: the deafened lasts the spell",
    mutate: (sy) => { delete sy.effects.find((e) => e.condition === "deafened").duration; }, breaks: "P4" },
  { spell: "Sound Burst", name: "P: the damage the ladder shares is gone",
    mutate: (sy) => { sy.damage.formula = ""; }, breaks: "P4b" },
  { spell: "Sunburst", name: "P: Sunburst stops being Basic",
    mutate: (sy) => { sy.defence = "Reflex"; }, breaks: "P5" },
  { spell: "Sunburst", name: "P: the blindness wears off",
    mutate: (sy) => { sy.effects[0].duration = "1 minute"; }, breaks: "P5b" },
  { spell: "Startle", name: "P: the Step is 10 feet",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "forcedMove").feet = 10; }, breaks: "P6" },
  { spell: "Snagging Pit", name: "P: the Fumble's victims may use reactions",
    mutate: (sy) => { delete sy.effects.find((e) => e.noReactions).noReactions; }, breaks: "P7" },
  { spell: "Speed", name: "P: Speed goes back to a note about fatigue",
    mutate: (sy) => { delete sy.effects[0].endSave; }, breaks: "P8" },
  { spell: "Speak With Dead", name: "P: no save, so no rung can be reached",
    mutate: (sy) => { sy.defence = ""; }, breaks: "P9" },
  { spell: "Speak With Dead", name: "P: the haunting lands on the corpse",
    mutate: (sy) => { sy.effects.find((e) => e.marker === "haunted").target = "targets"; }, breaks: "P9b" },
  { spell: "Suggestion", name: "P: the Fumble's hour goes unsaid",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => !e.onSave?.includes("fumble")); }, breaks: "P10" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-chapter10-321-330 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-chapter10-321-330: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-321-330: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
