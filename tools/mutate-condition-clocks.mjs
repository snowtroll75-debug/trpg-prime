#!/usr/bin/env node
/**
 * mutate-condition-clocks — can the pack-wide clock census fail?
 *
 * NEW at 3.590.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CENSUS SHIPPED UNPAIRED AT 3.589.0 AND THE SWEEP SAID SO.
 * `verify-condition-clocks` went in with the twelve clock fixes and no
 * mutate- file beside it, which the sweep reports as "unproven" — and it
 * is right to: a census whose only evidence is that it passes is a
 * census that might be counting nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MUTATIONS COME IN TWO KINDS, and the second is the important one.
 *
 * The first loosens an EXCLUSION. A1 ("every condition a spell applies
 * can end") passes trivially if the exclusions swallow everything, so
 * each one is widened in turn and A1 must notice. That is the failure
 * mode an exclusion list has: it grows quietly when a check starts
 * failing, and each addition looks reasonable on its own.
 *
 * The second puts back a REAL DEFECT, in the pack, in the shape it
 * actually shipped: Hold Animal paralysing a creature permanently on a
 * save it had SUCCEEDED at. The census exists for that row. If it cannot
 * catch that row, it is decoration.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, ...parts);
const CHECK = at("tools", "verify-condition-clocks.mjs");
const SELFEND = at("tools", "lib", "self-ending-conditions.mjs");
const SAVE = at("module", "magic", "condition-save.mjs");
const TIMING = at("module", "magic", "condition-timing-rules.mjs");
const DURATION = at("module", "magic", "effect-duration.mjs");

const MUTATIONS = [
  /* ── the exclusions, widened one at a time ─────────────────────── */
  { file: SELFEND, name: "THE EXEMPTION PILE: paralyzed quietly ends itself",
    from: `  ["soulDrain", "reduced by a full night's rest (soulDrainRecovery)"]`,
    to: `  ["soulDrain", "reduced by a full night's rest (soulDrainRecovery)"],
  ["paralyzed", "nothing at all, which is the point of this mutation"]`,
    breaks: "A3 — an exclusion added without moving the number" },
  { file: SELFEND, name: "an exclusion is added with no reason given",
    from: `  ["dying", "the death-state machinery"],`,
    to: `  ["dying", ""],`, breaks: "A4" },
  { file: SELFEND, name: "an exclusion names a condition the registry does not have",
    from: `  ["fixated", "the spell's own re-save, printed on the entries that use it"],`,
    to: `  ["petrifying", "the spell's own re-save, printed on the entries that use it"],`,
    breaks: "A2" },
  { file: SELFEND, name: "the whole exclusion list is emptied",
    from: `  ["stunned", "spent as AP and reduced at the start of its owner's turn (TRGCombat._onStartTurn)"],`,
    to: ``, breaks: "A1 or A3" },

  /* ── the escape save stops being an exit ───────────────────────── */
  { file: SAVE, name: "A SAVE THAT LEADS NOWHERE counts as a clock",
    from: `export const ON_SUCCESS = Object.freeze(["end", "shorten", "reduceValue"]);`,
    to: `export const ON_SUCCESS = Object.freeze(["end", "shorten", "reduceValue", "none"]);`,
    breaks: "the census's own exclusion, which counts only end/reduceValue" },
  { file: SAVE, name: "a malformed escape save is accepted anyway",
    from: `const pick = (vocab, raw) => vocab.find((v) => v.toLowerCase() === lower(raw)) ?? null;`,
    to: `const pick = (vocab, raw) => vocab.find((v) => v.toLowerCase() === lower(raw)) ?? vocab[0];`,
    breaks: "a row whose onSuccess is nonsense would silently become \"end\"" },

  /* ── the two lengths that are lengths ──────────────────────────── */
  { file: TIMING, name: "a rolled duration stops being read, so its rows lose their clock",
    from: `export function parseRolledDuration(raw) {`,
    to: `export function parseRolledDuration(raw) {\n  if (raw !== undefined) return null;`,
    breaks: "A1 — Word Of Blinding and Magnificent Dawn" },
  // RE-ANCHORED AT 3.591.0: `valueFromMargin` was written beside
  // `roundsFromMargin` and opens with the same two lines, so the short
  // anchor became ambiguous rather than wrong.
  { file: TIMING, name: "a margin-scaled length stops being a length",
    from: `export function roundsFromMargin(margin, per) {
  const step = Math.trunc(Number(per) || 0);
  if (step < 1) return null;`,
    to: `export function roundsFromMargin(margin, per) {
  return null;`,
    breaks: "A1 — Holy Shout's two rungs" },

  /* ── and the duration reader underneath all of it ──────────────── */
  { file: DURATION, name: "\"permanent\" goes back to being indistinguishable from a typo",
    from: `  if (/\\bpermanent(ly)?\\b/.test(t)) {`, to: `  if (false) {`,
    breaks: "A1 — Blindness's fumble rung means it" },
  { file: DURATION, name: "a row's own duration is no longer a declaration",
    from: `  return String(effect?.duration ?? "").trim().length > 0;`, to: `  return false;`,
    breaks: "A1 — every per-row duration in the pack" }
];

/*
 * PACK MUTATIONS — the defect in the shape it shipped.
 */
const PACK_MUTATIONS = [
  { spell: "Hold Animal",
    name: "THE DEFECT ITSELF: paralysed permanently, on a save it succeeded at",
    mutate: (sy) => {
      sy.effects = sy.effects.filter((e) => e.kind !== "condition");
      sy.effects.unshift({ kind: "condition", target: "targets", condition: "paralyzed" });
    },
    breaks: "A1" },
  { spell: "Hold Kind", name: "its fumble rung loses the duration that bounds it",
    mutate: (sy) => {
      const row = sy.effects.filter((e) => e.kind === "condition")
        .find((e) => (e.onSave ?? []).includes("fumble"));
      delete row.duration;
      delete row.conditionSave;
    }, breaks: "A1" },
  { spell: "Petrification", name: "its escape save stops being able to end it",
    mutate: (sy) => {
      for (const row of sy.effects.filter((e) => e.kind === "condition" && e.conditionSave)) {
        row.conditionSave.onSuccess = "none";
      }
    }, breaks: "A1" },
  { spell: "Word Of Blinding", name: "its rolled duration is written where the parser will misread it",
    mutate: (sy) => {
      const row = sy.effects.filter((e) => e.kind === "condition").find((e) => e.durationRoll);
      if (!row) throw new Error("no durationRoll row on Word Of Blinding");
      row.duration = row.durationRoll;
      delete row.durationRoll;
    }, breaks: "A1 — a dice duration parses to null, which is no clock" },
  // A LINK IS A CLOCK (3.613.0, R13) — and only a link is Sickly Ray's.
  { spell: "Sickly Ray", name: "the critical's slowed loses its link to the sickened",
    mutate: (sy) => {
      const row = sy.effects.find((e) => e.kind === "condition" && e.condition === "slowed");
      if (!row) throw new Error("no slowed row on Sickly Ray");
      delete row.endsWith;
    }, breaks: "A1 — slowed for ever, the shape this census exists to refuse" },
  { spell: "Glitterdust", name: "a rung is applied with no gate and no length",
    mutate: (sy) => {
      sy.effects.push({ kind: "condition", target: "targets", condition: "blinded" });
    }, breaks: "A1" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

const run = () => {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

if (!run()) {
  console.error("verify-condition-clocks does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");

/** One spell's `system`, mutated and restored from the value read first. */
async function withSpell(name, fn) {
  let key = null;
  let pristine = null;
  const open = async () => {
    const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
    await db.open();
    return db;
  };
  const db = await open();
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== name.toLowerCase()) continue;
      key = k; pristine = JSON.parse(JSON.stringify(v));
      await db.put(k, fn(v));
      break;
    }
  } finally {
    await db.close();
  }
  if (!key) return "ANCHOR MISSING";
  try {
    return run() ? "SURVIVED" : "caught";
  } finally {
    const db2 = await open();
    try { await db2.put(key, pristine); } finally { await db2.close(); }
  }
}

for (const m of PACK_MUTATIONS) {
  let state;
  try {
    state = await withSpell(m.spell, (doc) => { m.mutate(doc.system); return doc; });
  } catch (err) {
    state = `ERROR ${err.message}`;
  }
  if (state === "caught") console.log(`  caught    ${m.name}`);
  else if (state === "SURVIVED") { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else { console.error(`  ${state}  ${m.name} (${m.spell})`); unmatched++; }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

const TOTAL = MUTATIONS.length + PACK_MUTATIONS.length;
process.stdout.write(survived + unmatched
  ? `\nmutate-condition-clocks: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-condition-clocks: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK_MUTATIONS.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
