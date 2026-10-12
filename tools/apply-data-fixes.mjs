#!/usr/bin/env node
/**
 * apply-data-fixes — declared corrections to compiled pack data.
 *
 * NEW at 3.370.0.
 *
 * WHY THIS EXISTS. Pack data lives in binary LevelDB. Editing it by hand
 * — through the Foundry UI or a one-off script — produces a change that
 * appears in no diff, is invisible to review, and silently outlives
 * everyone's memory of why it was made. It is the one part of this
 * project where "declared and checked, never inferred" had nowhere to
 * live. Now it does: every hand-edit is a row in tools/data-fixes.json
 * with a reason, and this applies them.
 *
 * IT REFUSES RATHER THAN FORCES. Each fix names the value it expects to
 * find. If the current value is neither `from` nor `to`, somebody has
 * changed it since the fix was written, the reason recorded may no
 * longer hold, and this stops and says so. Overwriting an unexpected
 * value would be exactly the silent edit the file exists to prevent.
 *
 * Usage: node tools/apply-data-fixes.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FIXES_FILE = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const dryRun = process.argv.includes("--dry-run");

function readPath(obj, dotted) {
  return dotted.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function writePath(obj, dotted, value) {
  const keys = dotted.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = value;
}
/**
 * JSON has no `undefined`, so a fix that adds a field it expects to be
 * ABSENT writes `"from": null`. Treating the two as the same value here
 * is what lets an addition be declared with the same from/to guard as a
 * change — without it, every addition would have to be forced.
 */
const same = (a, b) => {
  if ((a === undefined || a === null) && (b === undefined || b === null)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * A new embedded active effect on a pack item.
 *
 * Effects live under their own `!items.effects!<itemId>.<effectId>` keys
 * rather than inside the item, so adding one is a different operation
 * from setting a field and is declared as `"op": "addEffect"`. Idempotent
 * by effect NAME: re-running finds the effect already there and writes
 * nothing, which is what makes the fixes file safe to replay.
 */
function effectKeyFor(itemId, effectId) {
  return `!items.effects!${itemId}.${effectId}`;
}

/** Deterministic 16-char id from the fix's own id, so replays match. */
function stableId(seed) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  }
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  let n = BigInt(h1) * 0x100000000n + BigInt(h2);
  while (out.length < 16) {
    out += alphabet[Number(n % BigInt(alphabet.length))];
    n = n / BigInt(alphabet.length) + 7n;
  }
  return out;
}

const { fixes } = JSON.parse(fs.readFileSync(FIXES_FILE, "utf8"));
const byPack = new Map();
for (const fix of fixes) {
  if (!byPack.has(fix.pack)) byPack.set(fix.pack, []);
  byPack.get(fix.pack).push(fix);
}

let applied = 0;
let alreadyDone = 0;
const refused = [];

for (const [packName, packFixes] of byPack) {
  const packDir = path.join(SYSTEM_ROOT, "packs", packName);
  if (!fs.existsSync(packDir)) {
    refused.push(`${packName}: no such pack directory`);
    continue;
  }
  const db = new ClassicLevel(packDir, { valueEncoding: "json" });
  await db.open();
  try {
    // One pass over the pack, matching by name. Names are what the fix
    // file records because an id means nothing to a reader reviewing it.
    const found = new Map();
    const effectNamesByItem = new Map();
    // The effect DOCUMENTS as well as their names, so a fix can edit one
    // that is already there — see the `editEffect` op below.
    const effectDocsByItem = new Map();
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && !key.slice(7).includes("!")) {
        for (const fix of packFixes) if (value?.name === fix.name) found.set(fix.id, { key, id: key.slice(7), value });
      } else if (key.startsWith("!items.effects!")) {
        const itemId = key.slice("!items.effects!".length).split(".")[0];
        if (!effectNamesByItem.has(itemId)) effectNamesByItem.set(itemId, new Set());
        effectNamesByItem.get(itemId).add(value?.name);
        if (!effectDocsByItem.has(itemId)) effectDocsByItem.set(itemId, []);
        effectDocsByItem.get(itemId).push({ key, value });
      }
    }

    for (const fix of packFixes) {
      const hit = found.get(fix.id);
      if (!hit) {
        refused.push(`${fix.id}: no item named "${fix.name}" in pack "${fix.pack}"`);
        continue;
      }

      if (fix.op === "addEffect") {
        const existing = effectNamesByItem.get(hit.id) ?? new Set();
        if (existing.has(fix.effect?.name)) {
          alreadyDone++;
          process.stdout.write(`  already applied  ${fix.id}  (${fix.name} already carries effect "${fix.effect.name}")\n`);
          continue;
        }
        if (dryRun) {
          process.stdout.write(`  would add effect ${fix.id}  ${fix.name} <- "${fix.effect.name}"\n`);
          applied++;
          continue;
        }
        const effectId = stableId(fix.id);
        const doc = {
          _id: effectId,
          type: "base",
          disabled: false,
          transfer: true,
          changes: [],
          statuses: [],
          ...fix.effect,
          _key: effectKeyFor(hit.id, effectId)
        };
        await db.put(effectKeyFor(hit.id, effectId), doc);
        applied++;
        process.stdout.write(`  added effect     ${fix.id}  ${fix.name} <- "${fix.effect.name}"\n`);
        continue;
      }

      /**
       * EDIT AN EFFECT THAT IS ALREADY THERE (3.549.0).
       *
       * `addEffect` could create one and a plain fix could set a field on
       * the ITEM, but the changes an Active Effect carries — the actual
       * arithmetic a race or a background applies — could be corrected by
       * neither. The Halfling and Gnome size double-count was the first
       * thing that needed it, and the alternative was a one-off script:
       * precisely the invisible hand-edit this file exists to prevent.
       *
       * Declared by item name AND effect name, with the same from/to
       * guard as every other row, so an effect somebody has changed since
       * is refused rather than overwritten.
       */
      if (fix.op === "editEffect") {
        const docs = effectDocsByItem.get(hit.id) ?? [];
        const doc = docs.find((d) => d.value?.name === fix.effect);
        if (!doc) {
          refused.push(`${fix.id}: "${fix.name}" carries no effect named "${fix.effect}"`);
          continue;
        }
        const currentValue = readPath(doc.value, fix.path);
        if (same(currentValue, fix.to)) {
          alreadyDone++;
          process.stdout.write(`  already applied  ${fix.id}  (${fix.name} / ${fix.effect}.${fix.path})\n`);
          continue;
        }
        if (!same(currentValue, fix.from)) {
          refused.push(
            `${fix.id}: expected ${fix.name} / ${fix.effect}.${fix.path} to be ${JSON.stringify(fix.from)} ` +
              `but found ${JSON.stringify(currentValue)}. Somebody changed it since this fix was written — ` +
              `re-read the recorded reason before forcing anything.`
          );
          continue;
        }
        if (dryRun) {
          process.stdout.write(`  would apply      ${fix.id}  ${fix.name} / ${fix.effect}.${fix.path}\n`);
          applied++;
          continue;
        }
        writePath(doc.value, fix.path, fix.to);
        await db.put(doc.key, doc.value);
        applied++;
        process.stdout.write(`  applied          ${fix.id}  ${fix.name} / ${fix.effect}.${fix.path}\n`);
        continue;
      }

      const current = readPath(hit.value, fix.path);

      // A SUPERSEDED FIX IS RETIRED, NOT REFUSED (3.411.0).
      //
      // When a later fix replaces an earlier one on the same path, the
      // earlier one's `from` stops matching for ever and it reports as
      // REFUSED on every run. That refusal is correct in mechanism and
      // useless in practice — and a standing false alarm is how a REAL
      // refusal later goes unread. The whole value of this tool is that
      // "refused" means somebody should look.
      //
      // So the record STAYS, with its reason and its history intact, and
      // declares which fix took over. Retired rather than deleted,
      // because the reason it was written is still the reason the pack
      // says what it says.
      if (fix.supersededBy) {
        const heir = fixes.find((other) => other.id === fix.supersededBy);
        if (!heir) {
          refused.push(`${fix.id}: supersededBy names "${fix.supersededBy}", which is not a fix in this file`);
          continue;
        }
        alreadyDone++;
        process.stdout.write(`  superseded       ${fix.id}  (by ${fix.supersededBy})\n`);
        continue;
      }

      if (same(current, fix.to)) {
        alreadyDone++;
        process.stdout.write(`  already applied  ${fix.id}  (${fix.name}.${fix.path} = ${JSON.stringify(fix.to)})\n`);
        continue;
      }
      if (!same(current, fix.from)) {
        refused.push(
          `${fix.id}: expected ${fix.name}.${fix.path} to be ${JSON.stringify(fix.from)} ` +
            `but found ${JSON.stringify(current)}. Somebody changed it since this fix was written — ` +
            `re-read the recorded reason before forcing anything.`
        );
        continue;
      }
      if (dryRun) {
        process.stdout.write(
          `  would apply      ${fix.id}  ${fix.name}.${fix.path}: ${JSON.stringify(fix.from)} → ${JSON.stringify(fix.to)}\n`
        );
        applied++;
        continue;
      }
      writePath(hit.value, fix.path, fix.to);
      await db.put(hit.key, hit.value);
      applied++;
      process.stdout.write(
        `  applied          ${fix.id}  ${fix.name}.${fix.path}: ${JSON.stringify(fix.from)} → ${JSON.stringify(fix.to)}\n`
      );
    }
  } finally {
    await db.close();
  }
}

if (refused.length) {
  process.stderr.write(`\napply-data-fixes: ${refused.length} fix(es) REFUSED\n`);
  for (const r of refused) process.stderr.write(`  ${r}\n`);
}
process.stdout.write(
  `\napply-data-fixes: ${applied} ${dryRun ? "would be applied" : "applied"}, ` +
    `${alreadyDone} already done, ${refused.length} refused.\n`
);
process.exit(refused.length ? 1 : 0);
