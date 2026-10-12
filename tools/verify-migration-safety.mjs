#!/usr/bin/env node
/**
 * verify-migration-safety — a migration may not blank the sheet.
 *
 * NEW at 3.415.2, and it exists because of the worst defect this project
 * has produced.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT HAPPENED, 26 AUGUST 2026, IN GRAHAM'S LIVE WORLD.
 *
 * `migratePooledMovement` wrote with `{ diff: false, recursive: false }`.
 *
 * `recursive: false` tells Foundry not to MERGE an update into the
 * document. The pass's dotted keys expand to
 * `{system: {combat: {movement: {…}}}}` and `system` is then replaced by
 * that object outright. Every field the update did not name fell back to
 * its template default.
 *
 * It ran once — the first migration to fire since 3.312.0, because
 * 3.412.1 raised the schema version — and on every player character it
 * blanked identity (level, race, heritage, background, class, ethics,
 * deity), reset all six attribute bases to 0, reset every skill rank to
 * 0, and rewrote 30,000 XP to the template's 10,000, dropping six
 * level-3 characters to level 1.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY A SOURCE CHECK AND NOT A UNIT TEST.
 *
 * Every unit test of that pass passed, and still does. The pass computes
 * the right pools, is idempotent, preserves the stored value, and refuses
 * what it should refuse — `verify-speed-pool` proves all of it. The
 * defect was not in what it decided. It was in HOW IT WROTE, one options
 * object away from the logic, in a Foundry API no Node harness can call.
 *
 * That is the same shape as every other expensive defect here — a
 * decision or an effect living where nothing can reach it — and the
 * answer is the same one section F of `verify-conditionals` and section J
 * of `verify-speed-pool` reached: when the dangerous thing cannot be
 * executed, read the source and refuse the pattern.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
  const full = path.join(dir, e.name);
  if (e.isDirectory()) return walk(full);
  return e.name.endsWith(".mjs") ? [full] : [];
});

const files = walk(path.join(SYSTEM_ROOT, "module"));
ok("A1 the scan reads the module tree", files.length > 100,
  "a scan that reads nothing proves nothing");

/* ================================================================== *
 * B. `recursive: false` — the flag that blanked the sheets
 * ================================================================== */

const RECURSIVE_FALSE = /recursive\s*:\s*false/;
const offenders = [];
for (const file of files) {
  fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    // Comments describe the defect on purpose; they are not the defect.
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    if (RECURSIVE_FALSE.test(line)) {
      offenders.push(`${path.relative(SYSTEM_ROOT, file)}:${i + 1}`);
    }
  });
}
ok("B1 no document write uses recursive: false", offenders.length === 0,
  `${offenders.join(", ")} — it REPLACES the containing object, and every ` +
  "field the update does not name reverts to its template default");

// AND THE DETECTOR MUST DETECT. A guard that cannot see the thing it
// guards against is the check-that-proves-nothing this project keeps
// paying for.
ok("B2 the scan recognises the pattern it exists for",
  RECURSIVE_FALSE.test("await actor.update(update, { diff: false, recursive: false });")
  && RECURSIVE_FALSE.test("{recursive:false}"));
ok("B3 and does not flag an ordinary write",
  !RECURSIVE_FALSE.test("await actor.update(update, { diff: false });")
  && !RECURSIVE_FALSE.test("await actor.update(update);"));

/* ================================================================== *
 * C. Every migration write names a dotted path
 *
 * A pass that writes a whole `system` object rather than dotted keys can
 * blank a sheet without any flag at all. Dotted keys are the discipline
 * that makes a partial update partial.
 * ================================================================== */

const migrationSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "migration.mjs"), "utf8");

/**
 * One exported function's body, so a check can name the pass it means.
 *
 * THE FIRST VERSION SEARCHED THE WHOLE FILE, and a mutation gutting
 * `migratePooledMovement` survived it: the identical dotted-key line
 * exists in `migrateMovementArrays` beside it, so the file-wide regex
 * stayed green while the pass it named had been replaced by a
 * whole-object write. A check that cannot tell two functions apart
 * proves the wrong thing about both.
 */
const functionBody = (source, name) => {
  const at = source.indexOf(`export async function ${name}`);
  if (at === -1) return null;
  const open = source.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return null;
};

/**
 * Comments describe the defect on purpose — at length, in the very
 * function that caused it — so a check reading raw source finds the
 * phrase it is banning inside the explanation of why it is banned.
 * Stripped before testing, exactly as section B strips them.
 */
const stripComments = (text) => String(text)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/^\s*\/\/.*$/gm, " ");

const pooledPass = stripComments(functionBody(migrationSrc, "migratePooledMovement") ?? "") || null;
ok("C0 the pooled-movement pass was found", Boolean(pooledPass),
  "if this fails every check below proves nothing");

// A WHOLE-OBJECT WRITE BLANKS THE SHEET WITH NO FLAG AT ALL. Caught
// both as an argument literal and as an assignment building one.
const WHOLE_SYSTEM = /update\(\s*\{\s*system\s*:|\bupdate\.system\s*=|\bupdate\[\s*["'`]system["'`]\s*\]\s*=/;
ok("C1 no migration pass replaces the whole system object",
  !WHOLE_SYSTEM.test(migrationSrc),
  "write dotted keys — they are what makes a partial update partial");

ok("C2 the pooled-movement pass itself writes dotted keys",
  Boolean(pooledPass) && /update\[`system\.combat\.movement\.\$\{field\}`\]/.test(pooledPass)
  && !WHOLE_SYSTEM.test(pooledPass),
  "the pass that caused this must stay the shape that is safe");

ok("C3 and no longer suppresses the merge",
  Boolean(pooledPass) && !/recursive\s*:\s*false/.test(pooledPass));

ok("C4 the whole-object detector recognises both spellings",
  WHOLE_SYSTEM.test("update.system = { combat: {} }")
  && WHOLE_SYSTEM.test("actor.update({ system: { identity: {} } })")
  && !WHOLE_SYSTEM.test("update[`system.combat.movement.${field}`] = pooled;"));

/* ================================================================== */

const label = "verify-migration-safety";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed (${files.length} files scanned)`);
