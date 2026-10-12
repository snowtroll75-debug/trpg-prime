#!/usr/bin/env node
/**
 * mutate-backgrounds — can verify-backgrounds fail? NEW at 3.553.0.
 *
 * Mostly PACK mutations, because the thing being checked is pack data:
 * a skill key with the wrong case, an effect keyed on a skill the
 * background does not print, a grant naming a feat that does not exist.
 * Every one of those is silent in play, which is the whole argument for
 * the check.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FW = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-backgrounds.mjs");

const MUTATIONS = [
  {
    file: FW,
    name: "A1 the Lay Healer's extra power point stops being granted",
    from: '...[{ background: "Lay Healer", value: 1 }]',
    to: '...[{ background: "Lay Healer", value: 0 }]',
    breaks: "E3 — the half of the Lay Healer's trade that is not the spell"
  },
  {
    file: FW,
    name: "A2 a background that asks a question loses its Use handler",
    from: '  "archaeologist": { hint:',
    to: '  "archaeologistx": { hint:',
    breaks: "D2 — the card says 'press Use on Archaeologist' and nothing answers"
  }
];

/* ────────────────────────────────────────────────────────────────── *
 * P: THE PACK. Read, mutated, restored and re-read outside guardFiles.
 * ────────────────────────────────────────────────────────────────── */
async function withPack(pack, mutate, body) {
  const dir = path.join(SYSTEM_ROOT, "packs", pack);
  const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let key = null;
  let original = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (mutate.match(k, v)) { key = k; original = JSON.parse(JSON.stringify(v)); break; }
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(original));
    mutate.apply(mutated);
    await db.put(key, mutated);
    await db.close();
    return await body();
  } finally {
    const restore = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
    await restore.open();
    if (key && original) await restore.put(key, original);
    const back = key ? await restore.get(key).catch(() => null) : null;
    await restore.close();
    if (key && JSON.stringify(back) !== JSON.stringify(original)) {
      process.stderr.write(`mutate-backgrounds: FAILED TO RESTORE ${pack} ${key} — the pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const item = (name) => (k, v) => k.startsWith("!items!") && !k.slice(7).includes("!") && v?.name === name;
const effectOf = (name) => (k, v) => k.startsWith("!items.effects!") && String(v?.name ?? "").startsWith(name);

const PACK_MUTATIONS = [
  {
    name: "P1 THE SILENT ONE: a skill-bonus effect is keyed on a skill that does not exist",
    pack: "backgrounds",
    match: effectOf("Detective: skill bonuses"),
    apply: (doc) => {
      const change = doc.changes.find((c) => c.key.includes("senseMotive"));
      if (change) change.key = "system.skills.sensemotive.class";
    },
    breaks: "C3 — the bonus applies to nothing, and looks identical in the compendium browser"
  },
  {
    name: "P2 an effect grants a skill the background does not print",
    pack: "backgrounds",
    match: effectOf("Acolyte: skill bonuses"),
    apply: (doc) => {
      doc.changes.push({ key: "system.skills.stealth.class", mode: 0, value: "1", priority: 20 });
    },
    breaks: "C3 — three printed skills, four granted"
  },
  {
    name: "P3 a skill bonus is worth 2, or overwrites instead of adding",
    pack: "backgrounds",
    match: effectOf("Barbarian: skill bonuses"),
    apply: (doc) => { doc.changes[0].value = "2"; },
    breaks: "C3 — the book prints a +1 class bonus"
  },
  {
    name: "P4 a background's declared skills drift from the printed page",
    pack: "backgrounds",
    match: item("Gambler"),
    apply: (doc) => { doc.system.skillBonuses = "Deception, Sense Motive, Stealth"; },
    breaks: "C1 — Thievery is what the book prints"
  },
  {
    name: "P5 a bonus feat is misspelled, so the grant resolves to nothing",
    pack: "backgrounds",
    match: item("Charlatan"),
    apply: (doc) => { doc.system.grantedFeats = "Silver Tounge"; },
    breaks: "B1/B2 — one letter, and the background hands over nothing at all"
  },
  {
    name: "P6 a background quietly gains a bonus feat the book does not give it",
    pack: "backgrounds",
    match: item("Weaver"),
    apply: (doc) => { doc.system.grantedFeats = "Toughness"; },
    breaks: "B1/B3 — the five that trade their feat away are named for exactly this"
  },
  {
    name: "P7 a specialist skill drifts from the printed name",
    pack: "backgrounds",
    match: item("Barkeep"),
    apply: (doc) => { doc.flags["trg-prime"].grantedSpecialistSkills = "Bar Lore"; },
    breaks: "D1 — Barkeeping is what the book prints"
  },
  {
    name: "P8 Archaeologist stops asking for its second lore",
    pack: "backgrounds",
    match: item("Archaeologist"),
    apply: (doc) => { delete doc.flags["trg-prime"].specialistChoice; },
    breaks: "D3 — the printed line is two specialist skills, one named and one chosen"
  },
  {
    name: "P9 the Diplomat's two languages become one",
    pack: "backgrounds",
    match: item("Diplomat"),
    apply: (doc) => { doc.system.languageChoices = "1 common|uncommon|rare|regional"; },
    breaks: "E1 — 'You begin play with two additional languages'"
  },
  {
    name: "P10 the Weaver's cantrip becomes innate, and stops using Spellcraft",
    pack: "backgrounds",
    match: item("Weaver"),
    apply: (doc) => { doc.flags["trg-prime"].spellChoice.innate = true; },
    breaks: "E5 — an innate spell never touches the Spellcraft bonus its own rule names"
  },
  {
    name: "P11 R3 is undone: the Cook's tick becomes an automatic bonus to ALL Crafting",
    pack: "backgrounds",
    match: item("Cook"),
    apply: (doc) => { doc.flags["trg-prime"].conditionals[0].auto = true; },
    breaks: "F4 — a Cooking bonus on every lockpick, saddle and sword the character makes"
  },
  {
    name: "P12 R2 is undone: the Entertainer's specialty slot disappears",
    pack: "backgrounds",
    match: effectOf("Entertainer: bonus specialty"),
    apply: (doc) => { delete doc.flags["trg-prime"].specialtyGrant; },
    breaks: "F1 — it is the whole of what that background's specialist line grants"
  },
  {
    name: "P13 the Lay Healer's spell grant is emptied",
    pack: "backgrounds",
    match: item("Lay Healer"),
    apply: (doc) => { doc.system.grantedSpells = ""; },
    breaks: "E2 — the background's entire distinguishing feature"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([FW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-backgrounds: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

for (const m of PACK_MUTATIONS) {
  const outcome = await withPack(m.pack, m, async () => (run() ? "SURVIVED" : "caught"));
  results.push({ name: m.name, state: outcome, breaks: m.breaks });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-backgrounds: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-backgrounds: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
