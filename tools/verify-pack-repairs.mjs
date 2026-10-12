#!/usr/bin/env node
/**
 * verify-pack-repairs — a pack fix reaches the characters who already
 * own the item, and touches nothing else.
 *
 * NEW at 3.431.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Found on 28 August 2026 by opening a spell instead of casting it.
 * Borin Slatevein's Protective Ward held the data from BEFORE 3.430.0
 * fixed it, and a sweep found one stale copy per pack fix shipped that
 * week: Grokash's Song Of Despair with no recovery floor, Merrick's
 * Bless still selling a 2 PP warp that bought nothing.
 *
 * A spell on a character is a COPY. Every pack fix this project has
 * shipped reached the compendium and stopped there, so three defects
 * recorded as FIXED were still live on the characters who owned them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS FILE IS ACTUALLY GUARDING, which is not the repair.
 *
 * It is guarding a MIGRATION, and a migration is the one piece of code
 * that runs once, unattended, against data nobody can get back. One of
 * this project's own blanked every player sheet in this world on
 * 26 August 2026 — two days before this was written — and Graham
 * re-levelled six characters by hand rather than restore a backup.
 *
 * So the checks that matter are not "does it repair the three known
 * spells". They are:
 *
 *   - section B: a house-ruled copy is NEVER written to;
 *   - section C: running it twice does nothing the second time, proven
 *     by construction rather than by argument;
 *   - section E: the manifest's `to` side still equals what the PACK
 *     actually carries, so a drifted entry fails here instead of
 *     repairing owned copies to a value that no longer exists anywhere.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";
import { classifyRepairs, repairUpdate, repairsForName } from "../module/pack-repair.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const migration = read("module", "migration.mjs");
const rule = read("module", "pack-repair.mjs");

const clone = (v) => JSON.parse(JSON.stringify(v));
const ward = (field) => PACK_REPAIRS.find((r) => r.id === `protective-ward-${field}`);

/* ================================================================== *
 * A. THE THREE STATES
 * ================================================================== */

const areaRow = ward("area");
ok("A1 a pre-fix value is stale",
  classifyRepairs({ area: areaRow.from }, [areaRow])[0].state === "stale");
ok("A2 the current value is already current",
  classifyRepairs({ area: areaRow.to }, [areaRow])[0].state === "current");
ok("A3 anything else is somebody's own answer",
  classifyRepairs({ area: "20-foot emanation" }, [areaRow])[0].state === "custom");
// A MISSING FIELD IS NOT STALE. An item that never had the field at all
// is not the pre-fix shape, and inventing one would be a write nobody
// asked for.
ok("A4 a missing field is not repaired",
  classifyRepairs({}, [areaRow])[0].state === "custom");

/* ================================================================== *
 * B. A HOUSE-RULED COPY IS NEVER WRITTEN TO
 * ================================================================== */

const wardRows = repairsForName(PACK_REPAIRS, "Protective Ward");
const stale = Object.fromEntries(wardRows.map((r) => [r.field, clone(r.from)]));
const houseRuled = { ...clone(stale), area: "45-foot emanation" };

const classifiedHouse = classifyRepairs(houseRuled, wardRows);
const updateHouse = repairUpdate(classifiedHouse);
ok("B1 the house-ruled field is not in the update",
  !Object.prototype.hasOwnProperty.call(updateHouse ?? {}, "system.area"),
  JSON.stringify(Object.keys(updateHouse ?? {})));
// AND THE REST OF THE ITEM IS STILL REPAIRED. Refusing the whole item
// because one field was edited would leave a GM's own area sitting on a
// spell that still cannot be sustained.
ok("B2 its stale neighbours still are",
  Object.prototype.hasOwnProperty.call(updateHouse ?? {}, "system.sustained"));
ok("B3 and the refusal is reported, not silent",
  classifiedHouse.some((r) => r.field === "area" && r.state === "custom"),
  "a GM who house-ruled a spell needs to hear their version was kept");

/* ================================================================== *
 * C. IDEMPOTENT BY CONSTRUCTION
 * ================================================================== */

const first = repairUpdate(classifyRepairs(clone(stale), wardRows));
ok("C1 the first run has something to do", first !== null);
// APPLY IT, then ask again. The second answer must be "nothing".
const afterFirst = clone(stale);
for (const [k, v] of Object.entries(first)) afterFirst[k.replace(/^system\./, "")] = v;
ok("C2 the second run writes nothing at all",
  repairUpdate(classifyRepairs(afterFirst, wardRows)) === null,
  "idempotence is the property a re-runnable migration lives on");
ok("C3 and every field now reads as current",
  classifyRepairs(afterFirst, wardRows).every((r) => r.state === "current"));
// NULL, NOT AN EMPTY OBJECT — so a caller cannot issue an empty update
// and count it as a change.
ok("C4 nothing to do is null rather than {}",
  repairUpdate([]) === null && repairUpdate(classifyRepairs({ area: areaRow.to }, [areaRow])) === null);

/* ================================================================== *
 * D. KEY ORDER MUST NOT DECIDE WHETHER A COPY IS BROKEN
 * ================================================================== */

// THE HAZARD THAT MADE THIS A DEEP COMPARE. Foundry round-trips an
// effect row through its own document layer and can hand the keys back
// in a different order. A stringify compare answers "custom" for that,
// so a stale copy would be read as house-ruled and left broken —
// silently, and in the exact case this file exists to catch.
const despair = PACK_REPAIRS.find((r) => r.id === "song-of-despair-floor");
const reordered = despair.from.map((row) => Object.fromEntries(Object.entries(row).reverse()));
ok("D1 a reordered but identical value is still stale",
  classifyRepairs({ effects: reordered }, [despair])[0].state === "stale",
  "JSON.stringify would call this custom and leave the spell without its floor");
ok("D2 a genuinely different value is still custom",
  classifyRepairs({ effects: [{ kind: "condition", condition: "frightened", value: 2 }] }, [despair])[0].state
    === "custom");
ok("D3 array length matters", classifyRepairs({ effects: [despair.from[0]] }, [despair])[0].state === "custom");
ok("D4 an extra key matters",
  classifyRepairs({ effects: despair.from.map((r, i) => (i ? r : { ...r, extra: 1 })) }, [despair])[0].state
    === "custom");

/* ================================================================== *
 * E. THE MANIFEST AGREES WITH WHAT ACTUALLY SHIPPED
 * ================================================================== */

ok("E1 every entry carries both sides and a reason",
  PACK_REPAIRS.every((r) => r.id && r.name && r.field && r.since
    && Object.prototype.hasOwnProperty.call(r, "from")
    && Object.prototype.hasOwnProperty.call(r, "to")
    && typeof r.reason === "string" && r.reason.length > 30));
ok("E2 ids are unique", new Set(PACK_REPAIRS.map((r) => r.id)).size === PACK_REPAIRS.length);
ok("E3 no entry repairs a field to the value it already had",
  PACK_REPAIRS.every((r) => JSON.stringify(r.from) !== JSON.stringify(r.to)),
  "an entry whose sides match can only ever be a no-op pretending to be a fix");
// ONE FIELD PER ITEM AT MOST. Two entries for the same (name, field)
// would be two answers to one question, and which won would depend on
// array order.
ok("E4 no item declares the same field twice",
  new Set(PACK_REPAIRS.map((r) => `${r.name.toLowerCase()}|${r.field}`)).size === PACK_REPAIRS.length);

// EVERY PACK THE MANIFEST NAMES (3.615.0): block 36 is the first to repair
// items outside the spells pack — the specific armours. Each entry is read
// against its own pack, keyed "pack|name".
const spellDir = path.join(SYSTEM_ROOT, "packs", "spells");
if (fs.existsSync(spellDir)) {
  const { ClassicLevel } = await import("classic-level");
  const byPack = new Map();
  for (const packName of new Set(PACK_REPAIRS.map((r) => r.pack))) {
    const dir = path.join(SYSTEM_ROOT, "packs", packName);
    if (!fs.existsSync(dir)) continue;
    const db = new ClassicLevel(dir, { valueEncoding: "json" });
    await db.open();
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && value?.name) byPack.set(`${packName}|${value.name.toLowerCase()}`, value.system);
    }
    await db.close();
  }
  const byName = { get: (r) => byPack.get(`${r.pack}|${r.name.toLowerCase()}`) };

  const drifted = [];
  const missing = [];
  for (const r of PACK_REPAIRS) {
    const sys = byName.get(r);
    if (!sys) { missing.push(r.name); continue; }
    if (JSON.stringify(sys[r.field]) !== JSON.stringify(r.to)) {
      drifted.push(`${r.name}.${r.field}`);
    }
  }
  // THE ANCHOR THAT KEEPS THIS HONEST. If the pack moves on and the
  // manifest does not, owned copies would be repaired to a value that
  // exists nowhere — a migration writing history rather than the truth.
  ok("E5 every `to` still equals what the pack carries",
    drifted.length === 0, drifted.join(", "));
  ok("E6 every named item is still in the pack", missing.length === 0, missing.join(", "));
  // AND THE `from` SIDE MUST NOT MATCH THE PACK, or the entry claims the
  // fix never happened and would repair current copies to the old value.
  const backwards = PACK_REPAIRS.filter((r) => {
    const sys = byName.get(r);
    return sys && JSON.stringify(sys[r.field]) === JSON.stringify(r.from);
  });
  ok("E7 no entry has its two sides the wrong way round",
    backwards.length === 0, backwards.map((r) => r.id).join(", "));
}

/* ================================================================== *
 * F. THE MIGRATION'S WIRING
 * ================================================================== */

// RE-VERSIONED WITH THE MANIFEST. The pass is skipped by a world already
// past its version, so an entry added later than the pass's own version
// would never be applied — caught by verify-speed-pool F4 the hour the
// Cutting Words entry was added.
ok("F1 the pass is registered against a version",
  /runIf\("[\d.]+", "stale owned copies of repaired pack items"/.test(migration));
const passVersion = /runIf\("([\d.]+)", "stale owned copies of repaired pack items"/.exec(migration)?.[1] ?? "0.0.0";
const newestEntry = PACK_REPAIRS.map((r) => r.since).sort((a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}).at(-1);
ok("F1b and not behind the newest entry in the manifest",
  passVersion === newestEntry,
  `pass runs at ${passVersion}, newest entry is from ${newestEntry} — a world past ${passVersion} would never apply it`);
ok("F2 it runs over token actors as well as directory ones",
  /migrateStalePackCopies\(\[\.\.\.actors, \.\.\.tokenActors\], Array\.from\(game\.items \?\? \[\]\)\)/.test(migration),
  "an unlinked token carries its own copies and would be missed");
// DOTTED KEYS ONLY. The pass that blanked every sheet in this world
// wrote a whole nested object; `verify-migration-safety` refuses the
// pattern globally and this states it for the one function that matters.
ok("F3 the update is built from dotted keys",
  /update\[`system\.\$\{row\.field\}`\] = row\.to;/.test(rule));
ok("F4 and only from stale rows",
  /if \(row\?\.state !== "stale"\) continue;/.test(rule),
  "a current or custom row reaching the update is the whole failure mode");
// THE REPORT IS HALF THE SAFETY, and it must name the refusals too.
ok("F5 the migration posts a card naming what changed",
  /Spells and items brought up to date/.test(migration));
// THE BRANCH IS TESTED, not merely present. `(false ? "Left alone…" :
// "")` leaves both the variable and the sentence in the file and renders
// neither — presence-versus-reachability for the seventh time in four
// days, and it survived this file's first mutation run for exactly that
// reason. The anchor is the ternary's own condition.
const card = migration.slice(migration.indexOf("Spells and items brought up to date"));
ok("F6 and names the copies it refused to touch",
  /const left = \(result\.packCopies\.kept \?\? \[\]\)\.map\(line\)\.join\(""\);/.test(migration)
  && /\(left\s*\n\s*\? `<p[^`]*Left alone/.test(card),
  "a GM who house-ruled a spell needs to see that it was noticed");

// THE TRIGGER, AND THE SILENT FAILURE IT CAUSES WHEN IT IS FORGOTTEN.
//
// `runIf` only offers a pass to a world that PREDATES its version, and
// the prompt only appears at all when the world's stored schema is older
// than TRG_SCHEMA_VERSION. A pass registered ABOVE that constant is dead
// code that reads as shipped — written, checked, released, never run.
// This release nearly shipped exactly that: the constant still read
// 3.412.0, which is what Graham's world already stores.
const schema = /TRG_SCHEMA_VERSION = "([\d.]+)"/.exec(migration)?.[1] ?? "0.0.0";
const registered = [...migration.matchAll(/runIf\("([\d.]+)",/g)].map((m) => m[1]);
const cmp = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) { if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0); }
  return 0;
};
const unreachable = registered.filter((v) => cmp(v, schema) > 0);
ok("F7 no pass is registered above the schema version that triggers it",
  unreachable.length === 0,
  `${unreachable.join(", ")} — registered but can never be offered`);
ok("F8 and this release's pass is among the reachable ones",
  registered.includes(passVersion) && cmp(passVersion, schema) <= 0);

/* ================================================================== */

const label = "verify-pack-repairs";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
