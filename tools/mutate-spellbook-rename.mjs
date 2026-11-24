#!/usr/bin/env node
/**
 * mutate-spellbook-rename — every check in verify-spellbook-rename can fail.
 * Source mutations are applied and reverted under the shared file guard;
 * pack mutations are restored and re-read.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "data", "spellbook-rename.mjs");
const MIGRATION = path.join(SYSTEM_ROOT, "module", "migration.mjs");
const ACTOR_TPL = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-spellbook-rename.mjs");

const MUTATIONS = [
  { file: RULE, name: "M1 the book is not renamed", from: "    update.name = SPELLBOOK_NEW_NAME;\n", to: "" },
  { file: RULE, name: "M2 the grant stamp is not moved",
    from: '    update["flags.trg-prime.grantedBy.requested"] = SPELLBOOK_NEW_NAME;', to: "" },
  { file: RULE, name: "M3 a re-described book is overwritten",
    from: "    if (item.system?.description === SPELLBOOK_OLD_DESCRIPTION) {", to: "    if (true) {" },
  { file: RULE, name: "M4 any gear item is renamed, not only the old name",
    from: 'item.type === "gear" && item.name === SPELLBOOK_OLD_NAME', to: 'item.type === "gear"' },
  { file: RULE, name: "M5 the class grant is not moved",
    from: '    if (list !== null) update["system.grantedGear"] = list;', to: "" },
  { file: RULE, name: "M6 the grant list loses its other entries",
    from: 'return changed ? out.join(",") : null;', to: 'return changed ? SPELLBOOK_NEW_NAME : null;' },
  { file: MIGRATION, name: "M7 the pass is gated below the schema stamp",
    from: 'runIf("3.712.3", "the Wizard\'s Spellbook renamed', to: 'runIf("3.712.2", "the Wizard\'s Spellbook renamed' },
  { file: MIGRATION, name: "M8 the pass forgets world items",
    from: "migrateSpellbookRename([...actors, ...tokenActors], Array.from(game.items ?? []))",
    to: "migrateSpellbookRename([...actors, ...tokenActors], [])" },
  { file: MIGRATION, name: "M9 the GM is not told", from: "if (result.spellbookRenamed?.length) {", to: "if (false) {" },
  { file: ACTOR_TPL, name: "M10 the Magic tab hint keeps the old name",
    from: "open the Spellbook item in your inventory", to: "open the Wizard's Spellbook item in your inventory" }
];

async function withPackItem(pack, id, mutate, body) {
  const dir = path.join(SYSTEM_ROOT, "packs", pack);
  const key = `!items!${id}`;
  let db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const original = await db.get(key).catch(() => null);
  if (!original) { await db.close(); return "ANCHOR MISSING"; }
  try {
    const mutated = JSON.parse(JSON.stringify(original));
    mutate(mutated);
    await db.put(key, mutated);
    await db.close();
    return await body();
  } finally {
    db = new ClassicLevel(dir, { valueEncoding: "json" });
    await db.open();
    await db.put(key, original);
    const back = await db.get(key).catch(() => null);
    await db.close();
    if (JSON.stringify(back) !== JSON.stringify(original)) {
      process.stderr.write(`mutate-spellbook-rename: FAILED TO RESTORE ${pack}/${id} — the pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const PACK_MUTATIONS = [
  { name: "P1 the gear item keeps the old name", pack: "gear", id: "6useCNgleUx3BiUw",
    mutate: (d) => { d.name = "Wizard's Spellbook"; } },
  { name: "P2 the book stops being a container", pack: "gear", id: "6useCNgleUx3BiUw",
    mutate: (d) => { d.system.spellbookContainer = false; } },
  { name: "P3 the Wizard still grants the old name", pack: "classes", id: "jXcruOONJIf5IBtI",
    mutate: (d) => { d.system.grantedGear = "Wizard's Spellbook"; } }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([RULE, MIGRATION, ACTOR_TPL, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spellbook-rename: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }

for (const m of PACK_MUTATIONS) {
  results.push({ name: m.name, state: await withPackItem(m.pack, m.id, m.mutate, async () => (run() ? "SURVIVED" : "caught")) });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length
  ? `\nmutate-spellbook-rename: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spellbook-rename: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
