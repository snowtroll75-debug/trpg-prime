#!/usr/bin/env node
/**
 * verify-pack-ids — every document id in the built core packs is one
 * Foundry can load.
 *
 * NEW at 3.685.2. Foundry ids are exactly sixteen alphanumeric characters.
 * Scorching Breath ("ff30ScorchingBrth") and Wing Buffet
 * ("ff30WingBuffet001"), authored at 3.631.0, were seventeen; in the live
 * world (Foundry 14.367) both loaded with a null id, and the compendium's
 * index listed a third, null-id Scorching Breath. They were the only two
 * among the core packs' 2,613 documents. Nothing read the BUILT packs for
 * it, so nothing said so.
 *
 *   A  the rule (tools/lib/pack-ids.mjs) on hand-built records: a sound one
 *      passes; a long, short, punctuated or null id fails, at the top level,
 *      in an embedded key's chain, and in a parent's embedded list; a key
 *      whose id is not the record's fails
 *   B  the built packs: every pack system.json declares opens and holds
 *      records, and every record in every directory under packs/ (declared
 *      or not) has sound ids, top-level and embedded; the two retired ids
 *      are gone and their entries are there under the new ones, once
 *   C  the sources: the declarations author sixteen-character ids, and the
 *      declare tool deletes the retired keys before it authors
 *
 * READ FROM A COPY. ClassicLevel writes a pack's LOG and MANIFEST when it
 * opens one, so each pack directory is copied to a temporary directory and
 * read there: this verify leaves packs/ as it found it.
 *
 * `TRG_PACK_IDS_ROOT` points B at another packs directory. Only
 * mutate-pack-ids.mjs sets it, to a copy it has seeded with a bad record.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { isFoundryId, recordIdProblems } from "./lib/pack-ids.mjs";
import { NEW_ENTRIES, RETIRED_ENTRY_IDS } from "./ff30-codex-declarations.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ------------------------------------------------------------ A. the rule */
const GOOD = "ff30ScorchBreath", PARENT = "2JbfDpEYPpPX2Q8h", CHILD = "6UdXUstboiBY80hD";
equal("A1 a sound top-level record, and a sound embedded one, have no problems", [
  recordIdProblems(`!items!${GOOD}`, { _id: GOOD, effects: [CHILD] }),
  recordIdProblems(`!items.effects!${PARENT}.${CHILD}`, { _id: CHILD })
], [[], []]);
ok("A2 THE DEFECT: a seventeen-character id fails, in the key and as the _id",
  recordIdProblems("!items!ff30ScorchingBrth", { _id: "ff30ScorchingBrth" }).length === 2);
equal("A3 fifteen characters, punctuation and a non-ASCII letter all fail; sixteen digits pass", [
  isFoundryId("ff30WingBuffet0"), isFoundryId("ff30Wing-Buffet1"), isFoundryId("ff30WingBuffeté1"), isFoundryId("1234567890123456"), isFoundryId(null), isFoundryId(1234567890123456)
], [false, false, false, true, false, false]);
ok("A4 an embedded record fails on a bad id of its own, or on a bad parent in its key",
  recordIdProblems(`!items.effects!${PARENT}.ff30ScorchingBrth`, { _id: "ff30ScorchingBrth" }).length > 0
  && recordIdProblems(`!items.effects!ff30WingBuffet001.${CHILD}`, { _id: CHILD }).length === 1);
ok("A5 a record whose _id is not its key's id fails", recordIdProblems(`!items!${GOOD}`, { _id: CHILD }).some((p) => /is not the key's id/.test(p)));
ok("A6 a record with no _id, or a null one, fails",
  recordIdProblems(`!items!${GOOD}`, {}).length === 1 && recordIdProblems(`!items!${GOOD}`, { _id: null }).length === 1);
ok("A7 a parent listing a bad embedded id fails, as a string or as an inline document",
  recordIdProblems(`!items!${GOOD}`, { _id: GOOD, effects: ["ff30WingBuffet001"] }).length === 1
  && recordIdProblems(`!actors!${PARENT}`, { _id: PARENT, items: [{ _id: "ff30WingBuffet001", effects: [] }] }).length === 1
  && recordIdProblems(`!actors!${PARENT}`, { _id: PARENT, items: [{ _id: GOOD, effects: ["short"] }] }).length === 1);
ok("A8 a key whose id chain does not match its collection's depth fails",
  recordIdProblems(`!items.effects!${CHILD}`, { _id: CHILD }).length === 1 && recordIdProblems(`!items!${PARENT}.${CHILD}`, { _id: CHILD }).length > 0);

/* ------------------------------------------------------------ B. the built packs */
const { ClassicLevel } = await import("classic-level");
const PACKS = process.env.TRG_PACK_IDS_ROOT ? path.resolve(process.env.TRG_PACK_IDS_ROOT) : path.join(SYSTEM_ROOT, "packs");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "trg-pack-ids-"));
async function readPack(dir) {
  const copy = path.join(scratch, path.basename(dir));
  fs.cpSync(dir, copy, { recursive: true });
  fs.rmSync(path.join(copy, "LOCK"), { force: true });
  const db = new ClassicLevel(copy, { valueEncoding: "json", createIfMissing: false });
  await db.open();
  const records = [];
  try { for await (const [key, value] of db.iterator()) records.push([key, value]); } finally { await db.close(); }
  return records;
}
const manifest = JSON.parse(read("system.json"));
const declared = (manifest.packs ?? []).map((p) => path.basename(p.path));
const dirs = fs.readdirSync(PACKS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
const byPack = {};
const unreadable = [];
try {
  for (const name of dirs) {
    try { byPack[name] = await readPack(path.join(PACKS, name)); }
    catch (error) { unreadable.push(`${name}: ${error.code ?? error.message}`); }
  }
} finally { fs.rmSync(scratch, { recursive: true, force: true }); }
const all = Object.entries(byPack).flatMap(([pack, records]) => records.map(([key, value]) => ({ pack, key, value })));

equal("B1 every pack directory opens", unreadable, []);
equal("B2 every pack system.json declares is on disk and holds records", declared.filter((n) => !(byPack[n]?.length > 0)), []);
const problems = all.flatMap(({ pack, key, value }) => recordIdProblems(key, value).map((p) => `${pack} ${p}`));
equal("B3 THE DEFECT, cured: no record in any core pack has an id Foundry cannot load (top-level and embedded)", problems.slice(0, 20), []);
ok("B4 and the scan read the packs it claims to (thousands of records, embedded ones among them)",
  all.length > 2000 && all.some(({ key }) => key.startsWith("!items.effects!")), `${all.length} records`);
const codex = new Map((byPack["creature-abilities"] ?? []).map(([key, value]) => [key, value]));
equal("B5 the retired ids are gone from the Codex pack", RETIRED_ENTRY_IDS.filter((r) => codex.has(`!items!${r._id}`) || [...codex.values()].some((v) => v?._id === r._id)).map((r) => r._id), []);
equal("B6 their entries are there under the new ids, by the same names",
  RETIRED_ENTRY_IDS.map((r) => codex.get(`!items!${r.replacedBy}`)?.name ?? null), RETIRED_ENTRY_IDS.map((r) => r.name));
equal("B7 each new id is used once across all the core packs, and each name once in the Codex pack",
  RETIRED_ENTRY_IDS.map((r) => [all.filter(({ value }) => value?._id === r.replacedBy).length, [...codex.values()].filter((v) => String(v?.name ?? "").trim().toLowerCase() === r.name.toLowerCase()).length]),
  RETIRED_ENTRY_IDS.map(() => [1, 1]));

/* ------------------------------------------------------------ C. the sources */
equal("C1 the declarations author sixteen-character ids, and the retired ids are the ones they replace",
  [NEW_ENTRIES.every((e) => isFoundryId(e._id)), NEW_ENTRIES.map((e) => e._id).sort(), RETIRED_ENTRY_IDS.every((r) => !isFoundryId(r._id))],
  [true, RETIRED_ENTRY_IDS.map((r) => r.replacedBy).sort(), true]);
const DECLARE = read("tools", "declare-ff30-codex.mjs");
ok("C2 the declare tool deletes each retired key, then compacts, before and after authoring",
  /for \(const retired of RETIRED_ENTRY_IDS\) \{[\s\S]{0,200}if \(!dryRun\) await db\.del\(key\);/.test(DECLARE)
  && DECLARE.indexOf("for (const retired of RETIRED_ENTRY_IDS)") < DECLARE.indexOf("for (const entry of NEW_ENTRIES)")
  && /if \(removed && !dryRun\) await db\.compactRange\("!", "~"\);/.test(DECLARE));

const EXPECTED = 18;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-pack-ids: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-pack-ids: ${checks} checks — all green (${all.length} records in ${dirs.length} pack directories).`);
