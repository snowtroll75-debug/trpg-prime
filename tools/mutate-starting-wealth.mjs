#!/usr/bin/env node
/**
 * mutate-starting-wealth — can verify-starting-wealth fail? NEW at 3.552.0.
 *
 * Chapter 6's wealth rule is arithmetic, and arithmetic is where a
 * harness is most likely to be reading rather than driving: every
 * mutation below is a plausible one-token slip that leaves the source
 * looking entirely reasonable. The clamp on the wrong side of zero and
 * the formula that re-rolls are the two that would be hardest to notice
 * at the table — a character would just be quietly richer or poorer
 * than the book says, once.
 *
 * The pack mutations matter for the same reason they did in chapter 2:
 * every value here is DATA, and a wrong row shows up in no diff.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const WEALTH = path.join(SYSTEM_ROOT, "module", "starting-wealth.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "starting-wealth-workflow.mjs");
const ITEM = path.join(SYSTEM_ROOT, "module", "documents", "item.mjs");
const ACTOR = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const MIGRATION = path.join(SYSTEM_ROOT, "module", "migration.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-starting-wealth.mjs");

const MUTATIONS = [
  /* ── the arithmetic ────────────────────────────────────────────── */
  {
    file: WEALTH,
    name: "A1 the Charisma clamp turns round",
    from: "  return Math.max(0, cha);",
    to: "  return Math.min(0, cha);",
    breaks: "A1/A3 — 'Ignore any negative modifiers to Charisma' is a floor, not a ceiling"
  },
  {
    file: WEALTH,
    name: "A2 the Charisma clamp disappears entirely",
    from: "  return Math.max(0, cha);",
    to: "  return cha;",
    breaks: "A3 — a -2 Charisma character would be two points poorer than the book says"
  },
  {
    file: WEALTH,
    name: "A3 the multiplier drifts by an order of magnitude",
    from: "GP_PER_WEALTH_POINT = 50;",
    to: "GP_PER_WEALTH_POINT = 500;",
    breaks: "A5/A7 — 'multiplied by 50 gp'"
  },
  {
    file: WEALTH,
    name: "A4 the score reads the base Charisma rather than the total",
    from: "  const cha = Math.trunc(Number(system?.attributes?.charisma?.total ?? 0) || 0);",
    to: "  const cha = Math.trunc(Number(system?.attributes?.charisma?.base ?? 0) || 0);",
    breaks: "A6 — a race's or an item's Charisma would stop counting towards starting coin"
  },
  {
    file: WEALTH,
    name: "A5 the class contribution is dropped from the sum",
    from: "      value: fromClass.value,",
    to: "      value: 0,",
    breaks: "A6 — class is one of the three named elements of the score"
  },

  /* ── the debt case ─────────────────────────────────────────────── */
  {
    file: WEALTH,
    name: "A6 a score of exactly zero stops counting as debt",
    from: "    indebted: score <= 0,",
    to: "    indebted: score < 0,",
    breaks: "A12 — Chapter 6 says 'a wealth score of 0 OR LESS'"
  },
  {
    file: WEALTH,
    name: "A7 a negative score is clamped to nothing",
    from: "    gp: score * GP_PER_WEALTH_POINT,",
    to: "    gp: Math.max(0, score) * GP_PER_WEALTH_POINT,",
    breaks: "A10 — the debt is the point; hiding it makes a debtor look merely broke"
  },

  /* ── the Gambler's formula ─────────────────────────────────────── */
  {
    file: WEALTH,
    name: "C1 an unrolled formula reads as zero rather than pending",
    from: "  return { value: 0, formula: raw, pending: true };",
    to: "  return { value: 0, formula: raw, pending: false };",
    breaks: "C5/C13 — a wrong total shown confidently is worse than one shown as unknown"
  },
  {
    file: WEALTH,
    name: "C2 a recorded roll of zero is mistaken for no roll at all",
    from: "  if (Number.isFinite(rolled) && recorded !== null && recorded !== \"\") {",
    to: "  if (rolled) {",
    breaks: "C12 — 1d4-2 can legitimately roll to 0, and to -1"
  },
  {
    file: WEALTH,
    name: "C3 the formula test decides by looking for a d",
    from: "  return !Number.isFinite(Number(text));",
    to: "  return /d/i.test(text);",
    breaks: "C4 — works for 1d4-2 and starts calling every future 'd'-bearing value a formula"
  },
  {
    file: ITEM,
    name: "C4 the wealth roll is taken behind a guard that is never true",
    from: "    await this._recordWealthRoll();",
    to: "    if (options?.trgRollWealth) await this._recordWealthRoll();",
    breaks: "E1 — still defined, still called, and never reached: the chapter-1 N3/N4 failure exactly"
  },
  {
    file: WEALTH,
    name: "C5 the roll is retaken over one already recorded",
    from: "  if (recorded !== undefined && recorded !== null && recorded !== \"\") return \"\";",
    to: "  if (recorded === 0) return \"\";",
    breaks: "C17 — a character's starting wealth would change when their sheet was copied"
  },

  /* ── the payout ────────────────────────────────────────────────── */
  {
    file: WEALTH,
    name: "D1 the payout replaces the purse rather than adding to it",
    from: "  return { ...currency, gp: gold + Math.max(0, Math.trunc(Number(gp) || 0)) };",
    to: "  return { ...currency, gp: Math.max(0, Math.trunc(Number(gp) || 0)) };",
    breaks: "D3 — a character who already had coin would lose it"
  },
  {
    file: WEALTH,
    name: "D2 the payout drops the rest of the purse",
    from: "  return { ...currency, gp: gold + Math.max(0, Math.trunc(Number(gp) || 0)) };",
    to: "  return { gp: gold + Math.max(0, Math.trunc(Number(gp) || 0)) };",
    breaks: "D4 — silver, copper, platinum and mithril are not gold's to discard"
  },
  {
    file: FLOW,
    name: "D3 a character in debt is paid a negative pile of gold",
    from: "  if (wealth.indebted) {",
    to: "  if (false && wealth.indebted) {",
    breaks: "D6 — Chapter 6 sends a score of 0 or less to the GM, not to the purse"
  },
  {
    file: FLOW,
    name: "D4 starting wealth can be taken twice",
    from: "  if (startingWealthGranted(actor)) {",
    to: "  if (false && startingWealthGranted(actor)) {",
    breaks: "D7 — it is a starting purse, not an income"
  },
  {
    file: FLOW,
    name: "D5 an unrolled formula is paid out as though it were settled",
    from: "  if (wealth.pending) {",
    to: "  if (false && wealth.pending) {",
    breaks: "D8 — the Gambler would be paid as if they had rolled a 2"
  },

  /* ── the migration, and the fact that it says so ───────────────── */
  {
    file: MIGRATION,
    name: "F1 the backfill writes to fifteen characters and says nothing",
    from: "    if (result.wealthBackfill?.length) {",
    to: "    if (false && result.wealthBackfill?.length) {",
    breaks: "F7 — the silent write this pass actually shipped as, found on its first live run"
  },
  {
    file: MIGRATION,
    name: "F2 the backfill overwrites a value the GM set by hand",
    from: '      if (String(item.system?.wealth ?? "").trim()) continue;',
    to: "      if (false) continue;",
    breaks: "F4 — a house-ruled value must survive, and the pass must be safe to re-run"
  },
  {
    file: MIGRATION,
    name: "F3 the pass skips unlinked token actors",
    from: "    () => migrateStartingWealthValues([...actors, ...tokenActors]))) ?? [];",
    to: "    () => migrateStartingWealthValues(actors))) ?? [];",
    breaks: "F3 — an unlinked token carries its own copies of the background and class"
  },
  {
    file: MIGRATION,
    name: "F4 a formula arriving by migration is never rolled",
    from: "      if (!Number.isFinite(Number(value))) {",
    to: "      if (false) {",
    breaks: "F6 — a Gambler backfilled this way would read as pending for ever"
  },

  /* ── the wiring ────────────────────────────────────────────────── */
  {
    file: ACTOR,
    name: "E1 the score stops being derived on the actor at all",
    from: "    system.wealth = startingWealthFor(this);",
    to: "",
    breaks: "E5 — nothing on the sheet would know the character had a wealth score"
  },
  {
    file: SHEET,
    name: "E2 the payout button keeps being offered after it is taken",
    from: "      wealth && actor.type === \"character\" && !context.startingWealthTaken",
    to: "      wealth && actor.type === \"character\"",
    breaks: "E9 — a button that reappears invites the double payout D4 covers"
  },
  {
    file: SHEET,
    name: "E3 the sheet action is unwired",
    from: "      grantStartingWealth: TRGActorSheet.grantStartingWealth,",
    to: "",
    breaks: "E8 — the whole rule becomes unreachable from the sheet"
  }
];

/* ────────────────────────────────────────────────────────────────── *
 * P: THE PACKS. Read, mutated, restored and re-read, because a
 * corrupted pack is not something to find out about later.
 * ────────────────────────────────────────────────────────────────── */
async function withPackField(pack, name, mutate, body) {
  const dir = path.join(SYSTEM_ROOT, "packs", pack);
  const db = new ClassicLevel(dir, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let key = null;
  let original = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (v?.name === name && k.startsWith("!items!") && !k.slice(7).includes("!")) {
        key = k; original = JSON.parse(JSON.stringify(v)); break;
      }
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(original));
    mutate(mutated);
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
      process.stderr.write(`mutate-starting-wealth: FAILED TO RESTORE ${pack}/${name} — the pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const PACK_MUTATIONS = [
  {
    name: "P1 a background loses its wealth value",
    pack: "backgrounds", item: "Merchant",
    mutate: (doc) => { doc.system.wealth = ""; },
    breaks: "B2 — a blank value contributes 0 and looks like a background that prints 0"
  },
  {
    name: "P2 a background's wealth drifts by one",
    pack: "backgrounds", item: "Hermit",
    mutate: (doc) => { doc.system.wealth = "-1"; },
    breaks: "B3 — the Hermit prints -2"
  },
  {
    name: "P3 the Gambler's formula is flattened to a number",
    pack: "backgrounds", item: "Gambler",
    mutate: (doc) => { doc.system.wealth = "0"; },
    breaks: "B3 — the one row in the table that is rolled stops being rolled"
  },
  {
    name: "P4 a renamed background takes the rulebook's value with it",
    pack: "backgrounds", item: "Arcane Apprentice",
    mutate: (doc) => { doc.system.wealth = "0"; },
    breaks: "B6 — four rows carry pack names the rulebook does not use, and this is where a rename goes quiet"
  },
  {
    name: "P5 a class loses its wealth",
    pack: "classes", item: "Crusader",
    mutate: (doc) => { doc.system.wealth = "1"; },
    breaks: "B9 — the Crusader prints 3"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const SOURCES = [WEALTH, FLOW, ITEM, ACTOR, SHEET, MIGRATION, CHECK];
const guard = guardFiles(SOURCES);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-starting-wealth: verify already fails on an unmodified tree.\n");
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
  const outcome = await withPackField(m.pack, m.item, m.mutate, async () => (run() ? "SURVIVED" : "caught"));
  results.push({ name: m.name, state: outcome, breaks: m.breaks });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-starting-wealth: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-starting-wealth: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
