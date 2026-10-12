#!/usr/bin/env node
/**
 * mutate-inscribed-runes — can the R10 checks fail?
 *
 * NEW at 3.604.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST PACK MUTATION IS THE DEFECT I NEARLY SHIPPED: put the unitless
 * "10-radius" back, and no Region is ever drawn — the rune cannot exist, and
 * every other check in the file measures a record no cast would create.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "inscribed-rune.mjs");
const FLOW = at("module", "magic", "inscribed-rune-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const BOOT = at("scripts", "trg-prime.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const VERIFY = at("tools", "verify-inscribed-runes.mjs");

const MUTATIONS = [
  /* ---------------- R. the record ---------------- */
  { file: RULE, name: "R a nexus row reads as a rune",
    from: `export const RUNE_KINDS = Object.freeze(["runeWard", "runeWarning"]);`,
    to: `export const RUNE_KINDS = Object.freeze(["runeWard", "runeWarning", "elementalNexus"]);`,
    breaks: "R1" },
  { file: RULE, name: "R ANY ROW AT ALL IS A RUNE",
    from: `  if (!RUNE_KINDS.includes(kind)) return null;`, to: `  ;`, breaks: "R3" },
  { file: RULE, name: "R a rune with nowhere to be is accepted",
    from: `  if (!Number.isFinite(Number(c.x)) || !Number.isFinite(Number(c.y))) return null;`,
    to: `  ;`, breaks: "R5" },
  { file: RULE, name: "R and one with no radius",
    from: `  if (int(radiusFeet) <= 0) return null;`, to: `  ;`, breaks: "R5b" },
  { file: RULE, name: "R a record starts believing everybody is inside",
    from: `    inside: []`, to: `    inside: [...(Array.isArray(designated) ? designated : [])]`,
    breaks: "R6" },
  { file: RULE, name: "R AN EXPIRED RUNE STAYS LIVE FOR EVER",
    from: `  return Number(now) < Number(record.until);`, to: `  return true;`, breaks: "R7c" },
  { file: RULE, name: "R and a rune with no expiry is already over",
    from: `  if (record.until == null) return true;`, to: `  ;`, breaks: "R7" },

  /* ---------------- D. designation ---------------- */
  { file: RULE, name: "D THE WARD PROTECTS EVERYBODY INSIDE IT, enemies included",
    from: `  return (record?.designated ?? []).includes(text(uuid));`, to: `  return true;`,
    breaks: "D2b" },
  { file: RULE, name: "D and nobody at all",
    from: `  return (record?.designated ?? []).includes(text(uuid));`, to: `  return false;`,
    breaks: "D2" },
  { file: RULE, name: "D duplicates and blanks survive into the record",
    from: `    designated: [...new Set((Array.isArray(designated) ? designated : []).map(text).filter(Boolean))],`,
    to: `    designated: (Array.isArray(designated) ? designated : []).map(text),`, breaks: "D1" },

  /* ---------------- T. the trait ---------------- */
  { file: RULE, name: "T A HALF-ELF SETS OFF AN ELF RUNE (substring matching)",
    from: `  return list.includes(want);`, to: `  return list.some((t) => t.includes(want));`,
    breaks: "T3" },
  { file: RULE, name: "T A TRAITLESS RUNE FIRES ON A TRAILING COMMA",
    from: `    .filter(Boolean);`, to: `    ;`, breaks: "T4c" },
  { file: RULE, name: "T the trait is matched case-sensitively",
    from: `  const want = lower(record?.trait);`, to: `  const want = text(record?.trait);`,
    breaks: "T2b" },
  { file: RULE, name: "T the record stops folding the typed trait",
    from: `    trait: lower(trait),`, to: `    trait: text(trait),`, breaks: "T1" },

  /* ---------------- X. the edge trigger ---------------- */
  { file: RULE, name: "X EVERYBODY INSIDE COUNTS AS HAVING JUST ENTERED",
    from: `    entered: [...now].filter((id) => !before.has(id)),`, to: `    entered: [...now],`,
    breaks: "X4" },
  { file: RULE, name: "X and nobody ever leaves",
    from: `    left: [...before].filter((id) => !now.has(id)),`, to: `    left: [],`, breaks: "X2" },
  { file: RULE, name: "X the record remembers who was there BEFORE the sweep",
    from: `    inside: [...now]`, to: `    inside: [...before]`, breaks: "X3" },

  /* ---------------- G. geometry ---------------- */
  { file: FLOW, name: "G THE EDGE OF THE RADIUS IS OUTSIDE IT",
    from: `  return Math.sqrt((dx * dx) + (dy * dy)) <= Number(record.radiusFeet);`,
    to: `  return Math.sqrt((dx * dx) + (dy * dy)) < Number(record.radiusFeet);`, breaks: "G2" },
  { file: FLOW, name: "G a square ward, so the diagonal reaches 14 feet",
    from: `  return Math.sqrt((dx * dx) + (dy * dy)) <= Number(record.radiusFeet);`,
    to: `  return Math.abs(dx) <= Number(record.radiusFeet) && Math.abs(dy) <= Number(record.radiusFeet);`,
    breaks: "G4" },
  { file: FLOW, name: "G measured in pixels rather than feet",
    from: `  const dx = (Number(point.x) - Number(record.centre.x)) / Number(pxPerFoot);`,
    to: `  const dx = Number(point.x) - Number(record.centre.x);`, breaks: "G1" },
  { file: FLOW, name: "G a scene with no scale still answers",
    from: `  if (!record || !point || !(Number(pxPerFoot) > 0)) return false;`, to: `  ;`,
    breaks: "G5" },

  /* ---------------- B. the bonus rows ---------------- */
  { file: RULE, name: "B ONLY DEFENCE IS WARDED, so the saves half goes unbuilt",
    from: `  Object.freeze({ kind: "bonus", slot: "fortitude", value: 1, bonusType: "status" }),
  Object.freeze({ kind: "bonus", slot: "reflex", value: 1, bonusType: "status" }),
  Object.freeze({ kind: "bonus", slot: "will", value: 1, bonusType: "status" })`,
    to: `  Object.freeze({ kind: "bonus", slot: "fortitude", value: 1, bonusType: "status" })`,
    breaks: "B1" },
  { file: RULE, name: "B A SLOT WITH NOWHERE TO LAND, so the ward is invisible",
    from: `  Object.freeze({ kind: "bonus", slot: "defence", value: 1, bonusType: "status" }),`,
    to: `  Object.freeze({ kind: "bonus", slot: "allSaves", value: 1, bonusType: "status" }),`,
    breaks: "B3" },
  { file: RULE, name: "B the bonus is circumstance rather than the printed status",
    from: `  Object.freeze({ kind: "bonus", slot: "will", value: 1, bonusType: "status" })`,
    to: `  Object.freeze({ kind: "bonus", slot: "will", value: 1, bonusType: "circumstance" })`,
    breaks: "B5" },
  { file: RULE, name: "B it wards for two rather than the printed one",
    from: `  Object.freeze({ kind: "bonus", slot: "reflex", value: 1, bonusType: "status" }),`,
    to: `  Object.freeze({ kind: "bonus", slot: "reflex", value: 2, bonusType: "status" }),`,
    breaks: "B4" },
  { file: RULE, name: "B the rows are left editable by a cast",
    from: `export const WARD_BONUS_ROWS = Object.freeze([`,
    to: `export const WARD_BONUS_ROWS = ([`, breaks: "B8" },
  { file: FLOW, name: "B the applier is handed the wrong shape",
    from: `  return { name: record?.label || "Rune of Warding", effects: [...WARD_BONUS_ROWS] };`,
    to: `  return { name: record?.label || "Rune of Warding", effects: [] };`, breaks: "B7" },

  /* ---------------- C. the card ---------------- */
  { file: RULE, name: "C A CAST THAT WARDED NOBODY LOOKS LIKE A WORKING SPELL",
    from: `  return \`<em>\${label} is inscribed, but nobody was designated — the ward protects no one. \``,
    to: `  return \`<em>\${label} is inscribed.\` + (\``, breaks: "C2" },
  { file: RULE, name: "C the warning stops admitting it can never fire",
    from: `  return \`<em>\${label} names no race trait to watch for — it can never glow. \``,
    to: `  return \`<em>\${label} is inscribed. \``, breaks: "C5" },
  { file: RULE, name: "C the glow stops naming which creature crossed",
    from: `  return \`<strong>\${label}</strong> glows with a soft silver light — <strong>\${name}</strong> \`
    + \`(<strong>\${trait}</strong>) has entered the area.\`;`,
    to: `  return \`<strong>\${label}</strong> glows with a soft silver light.\`;`, breaks: "C6" },
  { file: RULE, name: "C the table's half goes unsaid",
    from: `  return "<em>Judged at the table: whether the inscribed surface survives, whether anyone is "`,
    to: `  return "<em>" + ("`, breaks: "C7" },

  /* ---------------- W. the workflow ---------------- */
  { file: FLOW, name: "W THE WARD IS APPLIED TO EVERYBODY WHO WALKS IN",
    from: `        if (!runeDesignates(record, uuid)) continue;`, to: `        ;`, breaks: "W2" },
  { file: FLOW, name: "W and taken off everybody who walks out",
    from: `      if (record.kind !== "runeWard" || !runeDesignates(record, uuid)) continue;`,
    to: `      ;`, breaks: "W3" },
  { file: FLOW, name: "W THE GLOW IS ANNOUNCED TO THE WHOLE TABLE",
    from: `          whisper: ChatMessage.getWhisperRecipients("GM")`, to: `          speaker: {}`,
    breaks: "W4" },
  { file: FLOW, name: "W the record never remembers this sweep",
    from: `    await region.setFlag(SYSTEM_ID, RUNE_FLAG, { ...record, inside });`, to: `    ;`,
    breaks: "W5" },
  { file: FLOW, name: "W every movement re-applies to everybody standing still",
    from: `    if (!entered.length && !left.length) continue;`, to: `    ;`, breaks: "W7" },
  { file: FLOW, name: "W a rename counts as walking",
    from: `    if (!("x" in changed) && !("y" in changed)) return;`, to: `    ;`, breaks: "W8" },
  { file: FLOW, name: "W every client sweeps, so the ward is applied five times",
    from: `    if (!isActingGM()) return;`, to: `    ;`, breaks: "W9" },
  { file: FLOW, name: "W runes are found by Region name rather than by their flag",
    from: `    const record = region.getFlag?.(SYSTEM_ID, RUNE_FLAG) ?? null;`,
    to: `    const record = /Rune/.test(region.name ?? "") ? {} : null;`, breaks: "W10" },
  { file: CAST, name: "W the rune is never recorded on the Region it drew",
    from: `        await region.setFlag(SYSTEM_ID, RUNE_FLAG, record);`, to: `        ;`, breaks: "W11" },
  { file: CAST, name: "W THE PICKER OFFERS EVERY TOKEN ON THE SCENE",
    from: `            return pointInRune({ centre, radiusFeet }, point, pxPerFoot);`,
    to: `            return true;`, breaks: "W12" },
  { file: CAST, name: "W the ward waits for somebody to move before it applies",
    from: `        await refreshRunes(canvas.scene);`, to: `        ;`, breaks: "W13" },
  { file: CAST, name: "W THE 24-HOUR WARP BUYS NOTHING: the printed duration is used",
    from: `            + Number(parseSpellDuration(warpedDurationText(spellData.duration, warpMods))?.seconds ?? 0)`,
    to: `            + Number(parseSpellDuration(spellData.duration)?.seconds ?? 0)`, breaks: "W14" },
  { file: BOOT, name: "W the watcher is never registered",
    from: `  registerInscribedRunes();`, to: `  ;`, breaks: "W15" },
  { file: KINDS, name: "the ward kind leaves the handled vocabulary",
    from: `  "runeWard",`, to: `  ;`, breaks: "R1b" }
];

const MANIFEST = at("module", "data", "pack-repairs.mjs");
const AUTHOR = at("tools", "author-inscribed-runes.mjs");

// SECTION K SABOTAGES THE MANIFEST AND THE AUTHOR TOOL — the ratchet 3.603.1
// added, pointed at this release. The `area` entry is the one that matters:
// without it a carried copy is repaired into a rune that still cannot exist.
MUTATIONS.push(
  { file: MANIFEST, name: "K THE 3.603.0 GAP SHAPE RETURNS: the ward's area loses its entry",
    from: `    id: "rune-of-warding-area", pack: "spells", name: "Rune Of Warding",`,
    to: `    id: "rune-of-warding-area", pack: "spells", name: "Rune Of Warding Elsewhere",`,
    breaks: "K2" },
  { file: MANIFEST, name: "K the warning's effects entry is aimed at the wrong field",
    from: `    id: "rune-of-warning-effects", pack: "spells", name: "Rune Of Warning",
    field: "effects", since: "3.604.0",`,
    to: `    id: "rune-of-warning-effects", pack: "spells", name: "Rune Of Warning",
    field: "notes", since: "3.604.0",`, breaks: "K1" },
  { file: AUTHOR, name: "K THE CHECK CANNOT READ THE PLAN and passes for the wrong reason",
    from: `  "Rune Of Warding": (sy) => {`, to: `  "Rune Of Warding": function (sy) {`,
    breaks: "K0" }
);

const PACK = [
  { spell: "Rune Of Warding", name: "P THE DEFECT I NEARLY SHIPPED: the unitless radius returns",
    mutate: (sy) => { sy.area = "10-radius"; }, breaks: "P5" },
  { spell: "Rune Of Warning", name: "P: and the warning's",
    mutate: (sy) => { sy.area = "30-radius centred on the object"; }, breaks: "P5b" },
  { spell: "Rune Of Warding", name: "P THE WARD ROW GOES, so a PP 4 ritual does nothing again",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "runeWard"); },
    breaks: "P1" },
  { spell: "Rune Of Warning", name: "P: and the warning's row",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "runeWarning"); },
    breaks: "P1" },
  { spell: "Rune Of Warding", name: "P: two ward rows, so the Region is recorded twice",
    mutate: (sy) => { sy.effects.push({ kind: "runeWard", label: "Rune of Warding" }); },
    breaks: "P1b" },
  { spell: "Rune Of Warding", name: "P: the eight hours go",
    mutate: (sy) => { sy.duration = ""; }, breaks: "P3" },
  { spell: "Rune Of Warning", name: "P: the 24-hour warp goes inert again",
    mutate: (sy) => { sy.warps[0].mods = {}; }, breaks: "P4" },
  { spell: "Rune Of Warding", name: "P: the note about fixed designation goes",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => !/DESIGNATION IS FIXED/.test(e.text ?? "")); },
    breaks: "P6" },
  { spell: "Rune Of Warning", name: "P: the note about the GM-only glow goes",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => !/TOLD TO THE GM/.test(e.text ?? "")); },
    breaks: "P7" },
  { spell: "Harrow", name: "P8 A NEW UNPARSEABLE AREA SLIPS IN unnoticed",
    mutate: (sy) => { sy.area = "10-foot radius"; }, breaks: "P8b" },
  { spell: "Bless", name: "P8: and one on a spell with no exception at all",
    mutate: (sy) => { sy.area = "a goodly space"; }, breaks: "P8" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-inscribed-runes does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-inscribed-runes: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-inscribed-runes: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
