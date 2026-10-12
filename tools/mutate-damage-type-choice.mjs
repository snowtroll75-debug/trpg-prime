#!/usr/bin/env node
/**
 * mutate-damage-type-choice — can the R9 checks fail?
 *
 * NEW at 3.603.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST PACK MUTATION IS THE SHIPPED DEFECT: put the frozen type back,
 * and Shadow Blast goes back to dealing force through every suit of armour
 * in the world whatever the caster chose.
 *
 * SECTION N MUTATES A FILE THIS RELEASE ONLY TOUCHED — elemental-nexus —
 * because the widening is what made that guard necessary. A check that
 * claims something about another file sabotages that file to prove it.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "damage-type-choice.mjs");
const SOURCES = at("module", "magic", "element-sources.mjs");
const NEXUS = at("module", "magic", "elemental-nexus.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const VERIFY = at("tools", "verify-damage-type-choice.mjs");

const MUTATIONS = [
  /* ---------------- T. the offer ---------------- */
  { file: RULE, name: "T the whitelist narrows back to the four elements",
    from: `    if (isDamageType(k) && !seen.includes(k)) seen.push(k);`,
    to: `    if (isElement(k) && !seen.includes(k)) seen.push(k);`, breaks: "T2" },
  { file: RULE, name: "T ANY WORD AT ALL IS ACCEPTED as a damage type",
    from: `  return Object.prototype.hasOwnProperty.call(DAMAGE_TYPES, lower(type));`,
    to: `  return true;`, breaks: "T3" },
  { file: RULE, name: "T duplicates are kept",
    from: `    if (isDamageType(k) && !seen.includes(k)) seen.push(k);`,
    to: `    if (isDamageType(k)) seen.push(k);`, breaks: "T4" },
  { file: RULE, name: "T THE OLD `elements` FIELD STOPS BEING READ, breaking the two built spells",
    from: `    : Array.isArray(raw?.elements) ? raw.elements : [];`, to: `    : [];`, breaks: "T6" },
  { file: RULE, name: "T the legacy field wins over the new one",
    from: `  const declared = Array.isArray(raw?.damageTypes)
    ? raw.damageTypes
    : Array.isArray(raw?.elements) ? raw.elements : [];`,
    to: `  const declared = Array.isArray(raw?.elements)
    ? raw.elements
    : Array.isArray(raw?.damageTypes) ? raw.damageTypes : [];`, breaks: "T7" },

  /* ---------------- C. the choice ---------------- */
  { file: RULE, name: "C A CHOICE THAT WAS NOT OFFERED IS HONOURED ANYWAY",
    from: `  if (offered.includes(pick)) return pick;`,
    to: `  if (isDamageType(pick)) return pick;`, breaks: "C2" },
  { file: RULE, name: "C nothing chosen quietly takes the first",
    from: `  return offered.length === 1 ? offered[0] : null;`,
    to: `  return offered[0] ?? null;`, breaks: "C3" },
  { file: RULE, name: "C a single offer still demands an answer",
    from: `  return offered.length === 1 ? offered[0] : null;`, to: `  return null;`, breaks: "C4" },
  { file: RULE, name: "C the pick stops being case-folded",
    from: `  const pick = lower(chosen);`, to: `  const pick = String(chosen ?? "");`, breaks: "C1b" },

  /* ---------------- E. the element facts ---------------- */
  { file: RULE, name: "E THE FOUR WIDEN, giving Nexus a save table it does not have",
    from: `export const ELEMENTS = Object.freeze(["acid", "cold", "electricity", "fire"]);`,
    to: `export const ELEMENTS = Object.freeze(["acid", "cold", "electricity", "fire", "sonic"]);`,
    breaks: "E1" },
  { file: RULE, name: "E every damage type reads as an element",
    from: `  return ELEMENTS.includes(lower(type));`, to: `  return isDamageType(type);`, breaks: "E2b" },
  { file: RULE, name: "E acid gains an opposite the book never names",
    from: `const OPPOSITES = Object.freeze({ fire: "cold", cold: "fire" });`,
    to: `const OPPOSITES = Object.freeze({ fire: "cold", cold: "fire", acid: "electricity" });`,
    breaks: "E3b" },
  { file: RULE, name: "E A TYPE OUTSIDE THE FOUR IS GIVEN A SAVE, so N1 never fires",
    from: `  return ELEMENT_SAVES[lower(element)] ?? null;`,
    to: `  return ELEMENT_SAVES[lower(element)] ?? "Reflex";`, breaks: "E5" },
  { file: RULE, name: "E a nine-type offer reads as elemental, so the dialog lies",
    from: `  return list.length > 0 && list.every((t) => isElement(t));`,
    to: `  return list.length > 0;`, breaks: "E6b" },
  { file: RULE, name: "E an empty offer reads as elemental",
    from: `  return list.length > 0 && list.every((t) => isElement(t));`,
    to: `  return list.every((t) => isElement(t));`, breaks: "E6c" },

  /* ---------------- D. Damage Reduction ---------------- */
  { file: RULE, name: "D THE WHOLE POINT GOES SILENT: no DR rule reaches the card",
    from: `    case "full": return "Damage Reduction applies in full";`, to: `    case "full": return "";`,
    breaks: "D1" },
  { file: RULE, name: "D physical and energy types swap their rules",
    from: `    case "full": return "Damage Reduction applies in full";
    case "half": return "armour may use only half its Damage Reduction";`,
    to: `    case "full": return "armour may use only half its Damage Reduction";
    case "half": return "Damage Reduction applies in full";`, breaks: "D5" },
  { file: RULE, name: "D force is described as reducible",
    from: `    case "none": return "Damage Reduction does not apply";`,
    to: `    case "none": return "Damage Reduction applies in full";`, breaks: "D3" },
  { file: RULE, name: "D the label stops coming from config",
    from: `  return DAMAGE_TYPES[lower(type)]?.label ?? text(type);`, to: `  return text(type);`,
    breaks: "D6" },
  { file: RULE, name: "D the card stops naming the rule beside the type",
    from: `  return \`<strong>\${label}</strong> — <strong>\${damageTypeLabel(type)}</strong> chosen\`
    + \`\${dr ? \` (\${dr})\` : ""}.\`;`,
    to: `  return \`<strong>\${label}</strong> — <strong>\${damageTypeLabel(type)}</strong> chosen.\`;`,
    breaks: "P6" },

  /* ---------------- S. the source ---------------- */
  { file: SOURCES, name: "S EVERY TYPE GROWS A SOURCE, so Shadow Blast's card sprouts one",
    from: `  return SOURCES[lower(element)] ?? null;`,
    to: `  return SOURCES[lower(element)] ?? "an appropriate source";`, breaks: "S3" },
  { file: SOURCES, name: "S cold forgets the air temperature",
    from: `  cold: "packed snow or ice — or the air itself, if it is colder than -5°C",`,
    to: `  cold: "packed snow or ice",`, breaks: "S2b" },
  { file: SOURCES, name: "S electricity forgets the overcast sky",
    from: `  electricity: "you must be outdoors, and the weather must be overcast",`,
    to: `  electricity: "you must be outdoors",`, breaks: "S2c" },
  { file: SOURCES, name: "S THE CARD CLAIMS THE CONDITION AS FACT rather than the GM's call",
    from: `  return \`<em>Drawn from \${name}: \${source}. Whether one is at hand is the GM's call.</em>\`;`,
    to: `  return \`<em>Drawn from \${name}: \${source}.</em>\`;`, breaks: "S4" },

  /* ---------------- N. the nexus guard ---------------- */
  { file: NEXUS, name: "N THE GUARD THE WIDENING NEEDED IS GONE",
    from: `  return Boolean(nexusSave(element));`, to: `  return true;`, breaks: "N1" },
  { file: NEXUS, name: "N and no element can power a nexus at all",
    from: `  return Boolean(nexusSave(element));`, to: `  return false;`, breaks: "N1b" },
  { file: NEXUS, name: "N the refusal stops naming the four that work",
    from: `    + \`the printed rule gives a save only for acid, cold, electricity and fire.</em>\`;`,
    to: `    + \`the printed rule does not allow it.</em>\`;`, breaks: "N3" },

  /* ---------------- W. the workflow ---------------- */
  { file: CAST, name: "W THE CHOICE IS ASKED AFTER A FUMBLE TOO",
    from: `  let damageChoiceRefused = false;
  if (outcome.cast) {`, to: `  let damageChoiceRefused = false;
  if (true) {`, breaks: "W1" },
  { file: CAST, name: "W THE CHOSEN TYPE OVERWRITES THE FORMULA as well",
    from: `    ? { ...(baseDamageRow ?? {}), type: damageChoice }`,
    to: `    ? { type: damageChoice }`, breaks: "W3" },
  { file: CAST, name: "W the save path stops taking the override",
    from: `      damage: damageForCast,`, to: `      damage: apMode?.damage ?? null,`, breaks: "W4" },
  { file: CAST, name: "W THE ATTACK PATH STOPS TAKING IT, so Energy Bolt stays fire",
    from: `      damageOverride: damageForCast`, to: `      damageOverride: null`, breaks: "W5" },
  { file: CAST, name: "W and stops honouring it",
    from: `  const dmg = damageOverride ?? spellData.damage ?? {};`,
    to: `  const dmg = spellData.damage ?? {};`, breaks: "W5b" },
  { file: CAST, name: "W a refused choice is silent",
    from: `        lines.push(line(typeRefusal(label)));`, to: `        ;`, breaks: "W6" },
  { file: CAST, name: "W A REFUSED CHOICE DEALS FORCE ANYWAY, so the card contradicts the dice",
    from: `        damageChoiceRefused = true;`, to: `        ;`, breaks: "W6b" },
  { file: CAST, name: "W the attack path stops honouring the refusal",
    from: `  if (isAttack && outcome.cast && !damageChoiceRefused) {`,
    to: `  if (isAttack && outcome.cast) {`, breaks: "W6c" },
  { file: CAST, name: "W and so does the save path",
    // RE-ANCHORED 3.609.0: a mode may carry its own save (Transmute Rock & Mud).
    from: `  } else if (outcome.cast && !damageChoiceRefused && (effDefence ?? spellData.defence)`,
    to: `  } else if (outcome.cast && (effDefence ?? spellData.defence)`, breaks: "W6d" },
  { file: CAST, name: "W THE SOURCE LINE IS PRINTED FOR EVERY SPELL, including the one with no source rule",
    from: `        if (sourceLine && choiceRow.printSource) lines.push(line(sourceLine));`,
    to: `        if (sourceLine) lines.push(line(sourceLine));`, breaks: "W7" },
  { file: KINDS, name: "the kind leaves the handled vocabulary",
    from: `  "damageTypeChoice",`, to: `  ;`, breaks: "W8" }
];

const MANIFEST = at("module", "data", "pack-repairs.mjs");
const AUTHOR = at("tools", "author-damage-type-choice.mjs");

// SECTION K SABOTAGES THE MANIFEST AND THE AUTHOR TOOL, because the check
// it pins reads both: the gap 3.603.0 shipped was a field in one and not
// the other, and only a mutation that removes one side proves the check
// notices.
MUTATIONS.push(
  { file: MANIFEST, name: "K THE 3.603.0 GAP RETURNS: modeLabel loses its entry",
    from: `    id: "shadow-blast-modeLabel", pack: "spells", name: "Shadow Blast",`,
    to: `    id: "shadow-blast-modeLabel", pack: "spells", name: "Shadow Blast Elsewhere",`,
    breaks: "K2" },
  { file: MANIFEST, name: "K and modePrompt loses its entry",
    from: `    id: "shadow-blast-modePrompt", pack: "spells", name: "Shadow Blast",`,
    to: `    id: "shadow-blast-modePrompt", pack: "spells", name: "Shadow Blast Elsewhere",`,
    breaks: "K2b" },
  { file: MANIFEST, name: "K the effects entry is aimed at the wrong field",
    from: `    id: "shadow-blast-effects", pack: "spells", name: "Shadow Blast",
    field: "effects", since: "3.603.0",`,
    to: `    id: "shadow-blast-effects", pack: "spells", name: "Shadow Blast",
    field: "notes", since: "3.603.0",`, breaks: "K1" },
  { file: AUTHOR, name: "K THE CHECK CANNOT READ THE PLAN and passes for the wrong reason",
    from: `  "Shadow Blast": (sy) => {`, to: `  "Shadow Blast": function (sy) {`, breaks: "K0" }
);

const PACK = [
  { spell: "Shadow Blast", name: "P THE SHIPPED DEFECT: the type is frozen at force again",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "damageTypeChoice"); },
    breaks: "P1" },
  { spell: "Shadow Blast", name: "P: only the four elements are offered, losing five printed answers",
    mutate: (sy) => {
      sy.effects.find((e) => e.kind === "damageTypeChoice").damageTypes =
        ["acid", "cold", "electricity", "fire"];
    }, breaks: "P1b" },
  { spell: "Shadow Blast", name: "P: it grows a source rule the page never prints",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "damageTypeChoice").printSource = true; },
    breaks: "P1c" },
  { spell: "Shadow Blast", name: "P THE SHAPES GO BACK TO 'varies', so no template can be drawn",
    mutate: (sy) => { sy.apOptions = []; }, breaks: "P2" },
  { spell: "Shadow Blast", name: "P: the bigger shapes cost more actions than the page asks",
    mutate: (sy) => { sy.apOptions[2].ap = 3; }, breaks: "P2b" },
  { spell: "Shadow Blast", name: "P A MODE CARRIES `effects: []`, the 3.601.0 trap, wiping the rows",
    mutate: (sy) => { sy.apOptions[0].effects = []; }, breaks: "P2c" },
  { spell: "Shadow Blast", name: "P: the burst loses the 120 feet it is placed within",
    mutate: (sy) => { sy.apOptions[1].range = ""; }, breaks: "P2d" },
  { spell: "Shadow Blast", name: "P: the chooser calls a cone an action cost",
    mutate: (sy) => { sy.modeLabel = "Action Points"; }, breaks: "P2e" },
  { spell: "Energy Bolt", name: "P: Energy Bolt's choice row goes",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "damageTypeChoice"); },
    breaks: "P4" },
  { spell: "Energy Bolt", name: "P: it stops asking for its source requirement",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "damageTypeChoice").printSource; },
    breaks: "P4c" },
  { spell: "Searing Burst", name: "P THE FORMULA IS DROPPED WITH THE TYPE, so the spell deals nothing",
    mutate: (sy) => { sy.damage = { formula: "", type: "", persistent: "" }; }, breaks: "P4d" },
  { spell: "Elemental Shield", name: "P THE WIDENING BREAKS WHAT IT INHERITED: the elements row goes",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "elementalShield").elements = []; },
    breaks: "P5b" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-damage-type-choice does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-damage-type-choice: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-damage-type-choice: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
