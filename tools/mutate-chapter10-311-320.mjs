#!/usr/bin/env node
/**
 * mutate-chapter10-311-320 — can the pages 311-320 checks fail?
 *
 * NEW at 3.595.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST TWO MUTATIONS ARE THE DEFECT THE BLOCK WAS ABOUT: take the
 * land override away and twenty-seven forms go back to moving at whatever
 * the character's own legs did; make the land figure a GRANT and a form
 * printing Speed 20 stops being able to slow anybody.
 *
 * SECTION P MUTATES THE PACK, because most of this block is authored rows.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const APPLIER = at("module", "magic", "spell-effects.mjs");
const CASTER = at("module", "magic", "cast-workflow.mjs");
const SPEED = at("module", "magic", "speed-set.mjs");
const GRANTS = at("module", "combat", "granted-speeds.mjs");
const POOL = at("module", "combat", "speed-pool.mjs");
const SIZE = at("module", "magic", "size-step.mjs");
const POLY = at("module", "magic", "polymorph-warps.mjs");
const POLYWF = at("module", "magic", "polymorph-warps-workflow.mjs");
const VST = at("module", "magic", "vs-trait-damage.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const RELIEF = at("module", "magic", "condition-relief.mjs");
const VERIFY = at("tools", "verify-chapter10-311-320.mjs");

const MUTATIONS = [
  { file: SPEED, name: "THE DEFECT RESTORED: a replaced speed goes back to an effect change",
    from: `export function speedSetDerive(spec) {
  return normaliseSpeedSet(spec);
}`,
    to: `export function speedSetDerive(spec) {
  const set = normaliseSpeedSet(spec);
  if (!set) return null;
  return { key: \`system.combat.movement.\${set.key}.base\`, CHANGE_TYPE: "override", feet: set.feet };
}`, breaks: "S7" },
  { file: SPEED, name: "THE OTHER HALF: a land figure of zero is refused, so Air walks",
    from: `  return { key, feet: Math.max(0, int(raw.feet)) };`,
    to: `  const feet = Math.max(0, int(raw.feet));
  return feet ? { key, feet } : null;`, breaks: "S7b" },
  { file: SPEED, name: "a speed this system does not have is invented",
    from: `  if (!SETTABLE.includes(key)) return null;`, to: `  ;`, breaks: "S7c" },
  { file: GRANTS, name: "the reader stops finding a replaced speed on an item",
    from: `    const raw = item?.flags?.["trg-prime"]?.creatureAbility?.derives?.[SET_SPEED_PATH];`,
    to: `    const raw = null;`, breaks: "S7e" },
  { file: GRANTS, name: "and accepts a speed key this system has no pool for",
    from: `    if (!speedKeys.includes(key)) continue;
    out.push({ key, feet: Math.max(0, Math.trunc(Number(raw.feet) || 0)) });`,
    to: `    out.push({ key, feet: Math.max(0, Math.trunc(Number(raw.feet) || 0)) });`, breaks: "S7f" },
  { file: POOL, name: "A SET BECOMES A MAXIMUM, so a plant form can no longer slow anybody",
    from: `    movement.land.total = set.feet;`,
    to: `    movement.land.total = Math.max(Number(movement.land.total ?? 0), set.feet);`, breaks: "S7g" },
  { file: POOL, name: "the form's figure is replaced after armour and encumbrance, not before",
    from: `  for (const set of setSpeeds) {
    if (!SPEED_KEYS.includes(set?.key)) continue;
    if (set.key !== "land") continue;
    movement.land = speedPool(movement.land);
    movement.land.base = set.feet;
    movement.land.total = set.feet;
  }

  const result = landSpeed({`,
    to: `  const result = landSpeed({`, breaks: "S7h" },
  { file: POOL, name: "a form's other speeds are never replaced",
    from: `  for (const set of setSpeeds) {
    if (!SPEED_KEYS.includes(set?.key) || set.key === "land") continue;`,
    to: `  for (const set of []) {
    if (!SPEED_KEYS.includes(set?.key) || set.key === "land") continue;`, breaks: "S7i" },
  { file: APPLIER, name: "THE ITEM IS NEVER MADE, so the derivation has nothing to read",
    from: `                creatureAbility: { derives: { [SET_SPEED_PATH]: derive } },`,
    to: `                creatureAbility: { derives: {} },`, breaks: "S9c" },
  { file: APPLIER, name: "the spell stops taking the replaced speed back when it ends",
    from: `            grantedItems: [madeSet.id]`, to: `            grantedItems: null`, breaks: "S9d" },
  { file: SPEED, name: "the card stops saying whose figure it is",
    from: `the form's own figure, in place of `, to: `a figure. `, breaks: "S8" },
  { file: APPLIER, name: "THE SPEED IS TRUSTED FROM THE ROW rather than read back off the sheet",
    from: `          const shownSet = speedValue(target.system?.combat?.movement?.[set.key]) || set.feet;`,
    to: `          const shownSet = set.feet;`, breaks: "S9b" },
  { file: SIZE, name: "the size change drops to a priority a race outranks",
    from: `    priority: 30`, to: `    priority: 5`, breaks: "Z4" },
  /*
   * THE FIRST VERSION OF THIS MUTATION WAS A NO-OP and reported itself
   * caught: it wrapped `sizeStepUp` in `?? s`, and `sizeStepUp` already
   * clamps at the top of the table, so nothing changed. A mutation that
   * cannot change an answer proves nothing about the check beside it —
   * the same shape as a check that cannot fail, one layer out.
   */
  { file: SIZE, name: "THE CLAMP STOPS BEING NOTICED, so a colossal form gets an effect that changes nothing",
    from: `  if (!to || to === String(currentSize ?? "").trim().toLowerCase()) return null;`,
    to: `  if (!to) return null;`, breaks: "Z3c" },
  { file: SIZE, name: "a size the table does not know is accepted when no steps are asked",
    from: `  if (SIZE_STEPS.indexOf(from) < 0) return null;`, to: `  ;`, breaks: "Z3f" },
  { file: SIZE, name: "two steps move one",
    from: `  for (let i = 0; i < count; i += 1) size = step(size);`, to: `  size = step(size);`,
    breaks: "Z3b" },
  { file: WARP, name: "THE SIZE OFFERS ADD, so buying both alternatives is three steps",
    from: `    if (m.sizeSteps) mods.sizeSteps = Math.max(int0(mods.sizeSteps), Number(m.sizeSteps) || 0);`,
    to: `    if (m.sizeSteps) mods.sizeSteps += Number(m.sizeSteps) * times;`, breaks: "Z2" },
  { file: WARP, name: "the extra attacks stop counting the purchases",
    from: `    if (m.extraFormAttacks) mods.extraFormAttacks += Number(m.extraFormAttacks) * times;`,
    to: `    if (m.extraFormAttacks) mods.extraFormAttacks = 1;`, breaks: "N2" },
  { file: POLY, name: "THE PRINTED CAP IS DROPPED: a form grows nine new attacks",
    from: `  return Math.min(EXTRA_ATTACK_CAP, Math.max(0, int(mods?.extraFormAttacks)));`,
    to: `  return Math.max(0, int(mods?.extraFormAttacks));`, breaks: "N3" },
  { file: POLY, name: "the bought attack is not magical, unlike every attack beside it",
    from: `    extraTraits: "magical",`, to: `    ;`, breaks: "N4" },
  { file: POLY, name: "an unnamed attack becomes a row the pack cannot resolve",
    from: `  if (!name) return null;`, to: `  ;`, breaks: "N4c" },
  { file: POLY, name: "the direction is ignored and every form grows",
    from: `  const sign = String(direction ?? "").toLowerCase() === "smaller" ? -1 : 1;`,
    to: `  const sign = 1;`, breaks: "Z5" },
  { file: POLYWF, name: "the attack names come from the code instead of the pack",
    from: `  const pack = contentPack("creature-attacks");`, to: `  const pack = null;`, breaks: "N5" },
  { file: CASTER, name: "THE PROMPTS COME AFTER THE ROLL, so an abandoned cast has been paid for",
    from: `  if (warpMods.sizeSteps > 0 || warpMods.extraFormAttacks > 0) {`,
    to: `  if (false) {`, breaks: "N6" },
  { file: VST, name: "THE HOLY DICE APPLY TO EVERYBODY, which is a bigger first packet",
    from: `  if (!traits.length || !formula || !type) return null;`,
    to: `  if (!formula || !type) return null;`, breaks: "V4" },
  { file: VST, name: "the extra damage is refused when it names no type",
    from: `  const type = text(raw.type).toLowerCase();`, to: `  const type = text(raw.type).toLowerCase() || "force";`,
    breaks: "V4b" },
  { file: VST, name: "every creature matches the list",
    from: `  return spec.traits.filter((t) => has(t));`, to: `  return spec.traits;`, breaks: "V3b" },
  { file: CASTER, name: "THE SECOND PACKET TAKES THE FIRST'S TYPE, so fire resistance halves holy damage",
    from: `        type: vsSpec.type,`, to: `        type: damageType,`, breaks: "V5" },
  { file: VST, name: "R11 UNDONE: the spell's fire trait halves its own holy dice again",
    from: `    .filter((t) => t === own || !DAMAGE_WORDS.has(t));`,
    to: `    .filter(() => true);`, breaks: "V6" },
  { file: VST, name: "the packet's own type is stripped with the rest",
    from: `    .filter((t) => t === own || !DAMAGE_WORDS.has(t));`,
    to: `    .filter((t) => !DAMAGE_WORDS.has(t));`, breaks: "V6b" },
  { file: VST, name: "an aligned word stops counting as damage",
    from: `const DAMAGE_WORDS = new Set([...Object.keys(DAMAGE_TYPES), ...ALIGNED_TRAITS]);`,
    to: `const DAMAGE_WORDS = new Set(Object.keys(DAMAGE_TYPES));`, breaks: "V6d" },
  { file: CASTER, name: "the narrowing never reaches the packet",
    from: `        sourceTraits: vsTraitSourceTraits(spellSourceTraits(spell), vsSpec.type)`,
    to: `        ;`, breaks: "V6e" },
  { file: CASTER, name: "the resonance trigger reads the modified total rather than the die",
    from: `    if (resonanceFace > 0 && Number(check?.dice?.faces?.[0] ?? 0) === resonanceFace) {`,
    to: `    if (resonanceFace > 0 && Number(check?.outcome?.total ?? 0) === resonanceFace) {`,
    breaks: "W1b" },
  { file: RELIEF, name: "SOUL DRAIN GOES BACK TO ONES, which the audit wrongly asked for",
    from: `  soulDrain: Object.freeze({ label: "Soul Drain", step: 5 }),`,
    to: `  soulDrain: Object.freeze({ label: "Soul Drain", step: 1 }),`, breaks: "R1" },
  { file: RELIEF, name: "and the bump stops using the condition's own unit",
    from: `    amount: base + bumps * RELIEVABLE[condition].step`, to: `    amount: base + bumps`,
    breaks: "R1b" }
];

const PACK = [
  { spell: "Shape Of The Wyrm", name: "P THE PROSE RETURNS: a form's speeds go back to being a note",
    mutate: (sy) => {
      for (const o of sy.apOptions) o.effects = o.effects.filter((e) => e.kind !== "speedSet" && e.kind !== "speedGrant");
    }, breaks: "S2" },
  { spell: "Shape Of The Wyrm", name: "P: a form's land figure disagrees with its own label",
    mutate: (sy) => { sy.apOptions[0].effects.find((e) => e.kind === "speedSet").feet = 99; }, breaks: "S3" },
  { spell: "Shape Of The Wyrm", name: "P: a printed fly speed is granted at the wrong figure",
    mutate: (sy) => { sy.apOptions[1].effects.find((e) => e.kind === "speedGrant").feet = 5; }, breaks: "S3b" },
  { spell: "Shape Of The Wyrm", name: "P: a printed fly speed is granted to nobody",
    mutate: (sy) => {
      sy.apOptions[1].effects = sy.apOptions[1].effects.filter((e) => e.kind !== "speedGrant");
    }, breaks: "S3b" },
  { spell: "Shape Of The Elemental", name: "P: AIR WALKS AGAIN, at the speed it never printed",
    mutate: (sy) => { sy.apOptions[0].effects.find((e) => e.kind === "speedSet").feet = 30; }, breaks: "S4" },
  { spell: "Shape Of The Wyrm", name: "P: the note repeats the figure the sheet now shows",
    mutate: (sy) => { sy.apOptions[0].effects.find((e) => e.kind === "note").text += " Speed 30 ft."; },
    breaks: "S5" },
  { spell: "Shape Of The Elemental", name: "P: Hover is trimmed away with the figures",
    mutate: (sy) => {
      const n = sy.apOptions[0].effects.find((e) => e.kind === "note");
      n.text = n.text.replace(/Hover\.?/i, "");
    }, breaks: "S5b" },
  { spell: "Shape Of The Fey", name: "P: the land figure is a grant, so it can only ever raise",
    mutate: (sy) => {
      const r = sy.apOptions[0].effects.find((e) => e.kind === "speedSet");
      r.kind = "speedGrant";
    }, breaks: "S2" },
  { spell: "Shape Of The Plant", name: "P THE INERT WARP RETURNS: a size step buys nothing",
    mutate: (sy) => { sy.warps.find((w) => /one step/.test(w.text)).mods = {}; }, breaks: "Z1b" },
  { spell: "Shape Of The Beast", name: "P: two steps are sold as one",
    mutate: (sy) => { sy.warps.find((w) => /two steps/.test(w.text)).mods = { sizeSteps: 1 }; }, breaks: "Z1d" },
  { spell: "Shape Of The Animal", name: "P THE TRAP: the extra attack is wired to morphForms",
    mutate: (sy) => {
      sy.warps.find((w) => /additional natural attack/.test(w.text)).mods = { morphForms: 1 };
    }, breaks: "N1b" },
  { spell: "Shape Of The Wyrm", name: "P: one of the five extra-attack warps goes inert",
    mutate: (sy) => { sy.warps.find((w) => /additional natural attack/.test(w.text)).mods = {}; },
    breaks: "N1b" },
  { spell: "Searing Ray", name: "P: the holy half goes back to prose",
    mutate: (sy) => { delete sy.damage.vsTrait; }, breaks: "V1" },
  { spell: "Frostbound Shadow", name: "P: and so does the other spell that shares its shape",
    mutate: (sy) => { delete sy.damage.vsTrait; }, breaks: "V2" },
  { spell: "Shape Of The Humanoid", name: "P: the +4 becomes a DC others roll against",
    mutate: (sy) => {
      const b = sy.effects.find((e) => e.kind === "bonus");
      sy.effects = [{ ...b, kind: "defenceDC", dc: "skillDC:deception" },
        ...sy.effects.filter((e) => e.kind !== "bonus")];
    }, breaks: "H1" },
  { spell: "Shape Of The Humanoid", name: "P: the missing Study Target gate goes unsaid",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "note"); }, breaks: "H1e" },
  { spell: "Shadow Walk", name: "P: the resonance number is dropped",
    mutate: (sy) => { delete sy.resonanceOnNatural; }, breaks: "W1" },
  { spell: "Shadow Walk", name: "P: it fires on the wrong number",
    mutate: (sy) => { sy.resonanceOnNatural = 20; }, breaks: "W1" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-chapter10-311-320 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-chapter10-311-320: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-311-320: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
