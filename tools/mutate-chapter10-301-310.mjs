#!/usr/bin/env node
/**
 * mutate-chapter10-301-310 — can the pages 301-310 checks fail?
 *
 * NEW at 3.594.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE DEFECT: take the `enemies` branch away and
 * Prayer goes back to blessing half a room, which is what it did for
 * every release before this one.
 *
 * SECTION P MUTATES THE PACK, because most of this block is authored
 * rows and a check that reads one must be shown to fail when it is wrong.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const APPLIER = at("module", "magic", "spell-effects.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const VERIFY = at("tools", "verify-chapter10-301-310.mjs");

const MUTATIONS = [
  { file: APPLIER, name: "THE DEFECT: Prayer goes back to blessing half a room",
    from: `        : effect.target === "enemies"
          ? (areaCaught.length ? areaCaught : targets)
            .filter((t) => t?.uuid && hostileUuids.includes(t.uuid))`,
    to: ``, breaks: "A1" },
  { file: APPLIER, name: "the enemies row draws from the SAVE list rather than the area",
    from: `          ? (areaCaught.length ? areaCaught : targets)
            .filter((t) => t?.uuid && hostileUuids.includes(t.uuid))`,
    to: `          ? targets.filter((t) => t?.uuid && hostileUuids.includes(t.uuid))`, breaks: "A1" },
  { file: APPLIER, name: "THE TWO SIDES DISAGREE: the foe rows reach everybody in the area",
    from: `            .filter((t) => t?.uuid && hostileUuids.includes(t.uuid))`,
    to: `            .filter((t) => t?.uuid)`, breaks: "A1" },
  /*
   * THE EARLY REFUSAL IS INERT and cannot be mutated: with it removed,
   * `allSkills` still matches no slot set and `bonusTargetFor` still
   * answers null. It is kept for the reason its neighbour `allSpeeds`
   * is — "null is visible to a harness, a wrong path is not" — so what
   * B1b actually guards is the slot never acquiring a pool of its own.
   * This is that mutation.
   */
  { file: APPLIER, name: "allSkills acquires a pool, and stops expanding",
    from: `const COMBAT_BONUS_SLOTS = new Set([
  "attack", "defence", "initiative", "dr",`,
    to: `const COMBAT_BONUS_SLOTS = new Set([
  "allSkills", "attack", "defence", "initiative", "dr",`, breaks: "B1c" },
  { file: APPLIER, name: "allSkills expands to every key on the sheet, skills or not",
    from: `    const keys = Object.keys(target?.system?.skills ?? {}).filter((k) => SKILL_SLOTS.has(k));`,
    to: `    const keys = Object.keys(target?.system?.skills ?? {});`, breaks: "B2" },
  { file: APPLIER, name: "SILENT NOTHING: a creature with no skills gets an empty effect",
    from: `    if (!keys.length) return { applied: false, reason: "no skills to modify" };`,
    to: `    ;`, breaks: "B2b" },
  { file: APPLIER, name: "the healing warp is folded in AFTER the row is validated",
    from: `          const rateSpec = normaliseHealingRate({
            ...effect,
            value: rateCap > 0 ? Math.min(rateRaw, rateCap) : rateRaw
          });`,
    to: `          const rateSpec = normaliseHealingRate(effect);`, breaks: "C4" },
  { file: APPLIER, name: "the printed ceiling stops binding",
    from: `            value: rateCap > 0 ? Math.min(rateRaw, rateCap) : rateRaw`,
    to: `            value: rateRaw`, breaks: "C4" },
  { file: APPLIER, name: "an unbought warp-only row is announced as a fault every cast",
    from: `            if (!effect.fromWarp) {
              lines.push(line(\`<em>\${spell.name} declares a malformed healing rate.</em>\`));
            }`,
    to: `            lines.push(line(\`<em>\${spell.name} declares a malformed healing rate.</em>\`));`,
    breaks: "C4b" },
  { file: APPLIER, name: "the card prints the slot's key again, as allSpeeds once did",
    from: `  [ALL_SKILLS_SLOT]: "to every skill check",`, to: `  ;`, breaks: "A4" },
  { file: WARP, name: "the aggregator forgets the healing bump",
    from: `    if (m.healingRateBump) mods.healingRateBump += Number(m.healingRateBump) * times;`,
    to: `    ;`, breaks: "C5" },
  { file: WARP, name: "the ceiling is bought rather than stated",
    from: `    if (m.healingRateMax) mods.healingRateMax = Math.max(mods.healingRateMax, Number(m.healingRateMax) || 0);`,
    to: `    if (m.healingRateMax) mods.healingRateMax += Number(m.healingRateMax) * times;`,
    breaks: "C5b" }
];

const PACK = [
  { spell: "Prayer", name: "P: the foe half disappears again",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.target !== "enemies"); }, breaks: "A2b" },
  { spell: "Prayer", name: "P: the foes get the bonus rather than the penalty",
    mutate: (sy) => { sy.effects.filter((e) => e.target === "enemies").forEach((e) => { e.value = 1; }); },
    breaks: "A2c" },
  { spell: "Prayer", name: "P: skills drop out of the four the page names",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.slot !== "allSkills"); }, breaks: "A2" },
  /*
   * THE OLD MUTATION HERE FILTERED OUT THE `weaponDamageBonus` ROWS, and
   * at 3.594.1 there are none to filter — it mutated nothing and would
   * have reported itself caught for ever. Reinstated the other way round:
   * the rail the live drive rejected is wired back in.
   */
  { spell: "Prayer", name: "P THE REJECTED RAIL RETURNS: the damage quarter gets a row again",
    mutate: (sy) => {
      sy.effects.push({
        kind: "weaponDamageBonus", target: "allies", value: 1, bonusType: "luck",
        duration: { unit: "minute", value: 1 }
      });
    }, breaks: "A3" },
  { spell: "Prayer", name: "P: the card stops saying why the damage is by hand",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => !/DAMAGE BONUS IS BY HAND/.test(e.text ?? "")); },
    breaks: "A3b" },
  { spell: "Prayer", name: "P: the area is scoped to allies, and the foe rows land on nobody",
    mutate: (sy) => { sy.areaTargeting = "allies"; }, breaks: "A2e" },
  { spell: "Prayer", name: "P: the bonus stops being luck",
    mutate: (sy) => { sy.effects.filter((e) => e.bonusType).forEach((e) => { e.bonusType = "status"; }); },
    breaks: "A2d" },
  { spell: "Power Crystal", name: "P: the conjuring row is degree-gated, so an untargeted cast makes nothing",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "conjureItem").onSave = ["success"]; },
    breaks: "A5b" },
  { spell: "Regenerate", name: "P THE INERT WARP RETURNS: the fast healing is unbuyable again",
    mutate: (sy) => { sy.warps[1].mods = {}; }, breaks: "C1d" },
  { spell: "Regenerate", name: "P: the base grants the healing free",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "healingRate").value = 5; }, breaks: "C1b" },
  { spell: "Regenerate", name: "P: the row loses its warp-only mark and starts complaining",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "healingRate").fromWarp; }, breaks: "C1c" },
  { spell: "Rapid Repair", name: "P: the printed ceiling is removed",
    mutate: (sy) => { delete sy.warps[0].mods.healingRateMax; }, breaks: "C2c" },
  { spell: "Phantasmal Killer", name: "P THE UNGATED ROW: a critical success is frightened again",
    mutate: (sy) => { sy.effects.filter((e) => e.kind === "condition").forEach((e) => { delete e.onSave; }); },
    breaks: "D1" },
  // RE-AIMED 3.609.0: the maelstrom's saves are owed at the start of a turn
  // (block 33's R2), so it carries no prone row for this to ungate. Putting
  // one back, ungated, is the defect D1 and D3 exist for.
  { spell: "Portal Maelstrom", name: "P: an ungated prone lands at the cast again",
    mutate: (sy) => { sy.effects.push({ kind: "condition", target: "targets", condition: "prone" }); }, breaks: "D1" },
  { spell: "Ramirez Rhythm", name: "P: slowed on every degree again",
    mutate: (sy) => { delete sy.effects.find((e) => e.condition === "slowed").onSave; }, breaks: "D1" },
  { spell: "Ramirez Rhythm", name: "P: prone spreads beyond the fumble",
    mutate: (sy) => { sy.effects.find((e) => e.condition === "prone").onSave = ["failure", "fumble"]; },
    breaks: "D4b" },
  { spell: "Object Prowess", name: "P: the warp goes back to raising nothing",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "bonus"); }, breaks: "E1" },
  { spell: "Object Prowess", name: "P: only crafting is raised, and Create stops varying",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "bonus" || e.slot === "crafting"); },
    breaks: "E1" },
  { spell: "Qualm", name: "P: the four degrees flatten back to one",
    mutate: (sy) => { sy.effects.filter((e) => e.kind === "bonus").forEach((e) => { delete e.onSave; }); },
    breaks: "E2" },
  { spell: "Qualm", name: "P: the success penalty outlasts its round",
    mutate: (sy) => { delete sy.effects.find((e) => e.slot === "allSkills" && e.onSave?.includes("success")).duration; },
    breaks: "E2c" },
  { spell: "Orb Of The Void", name: "P: the soul drain becomes ordinary damage",
    mutate: (sy) => { sy.effects.filter((e) => e.kind === "resource").forEach((e) => { e.resource = "pp"; }); },
    breaks: "F1b" },
  { spell: "Orb Of The Void", name: "P: the fumble drains no more than a failure",
    mutate: (sy) => { sy.effects.find((e) => e.onSave?.includes("fumble") && e.kind === "resource").formula = "2d8"; },
    breaks: "F1" },
  { spell: "Resist Energy", name: "P THE KEY NOBODY READS: the warp is wired to defenceChoices again",
    mutate: (sy) => { sy.warps[1].mods = { defenceChoices: 1 }; }, breaks: "L4" },
  { spell: "Pale Flame", name: "P: the reason its damage is by hand goes unsaid",
    mutate: (sy) => { sy.effects = [{ kind: "note", text: "2d8 essence each turn." }]; }, breaks: "F3" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-chapter10-301-310 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-chapter10-301-310: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-301-310: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
