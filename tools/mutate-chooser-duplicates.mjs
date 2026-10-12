#!/usr/bin/env node
/**
 * mutate-chooser-duplicates — can verify-chooser-duplicates fail?
 * NEW at 3.552.9.
 *
 * The first mutation is the behaviour as it shipped up to 3.552.8: the
 * chooser offering every candidate whether or not the character already
 * holds it, which is how the Test Cleric ended up with two Dazes.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATS = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const FW = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chooser-duplicates.mjs");

const MUTATIONS = [
  {
    file: FW,
    name: "A1 THE SHIPPED BEHAVIOUR: the dialog is built from the raw candidates again",
    from: "    rows.map((row) => [row.id, row.label]));",
    to: "    candidates.map((s) => [s._id, s.name]));",
    breaks: "C5/C6 — the rule would run and its answer would be thrown away"
  },
  {
    file: FW,
    name: "A2 the held list includes the pick being replaced",
    from: "  const heldNames = Array.from(actor.items ?? [])\n"
      + "    .filter((item) => item.id !== already?.id)\n"
      + "    .map((item) => item.name);",
    to: "  const heldNames = Array.from(actor.items ?? []).map((item) => item.name);",
    breaks: "C4 — a repertoire chooser would hide the very spell the player pressed Use to change"
  },
  {
    file: FW,
    name: "A3 every chooser hides duplicates, innate ones included",
    from: "  const rows = applyDuplicateRule(candidates, heldNames, duplicateMode({ innate }));",
    to: '  const rows = applyDuplicateRule(candidates, heldNames, "hide");',
    breaks: "C2 — the innate focus copy is a different spell, and refusing it refuses a legal pick"
  },
  {
    file: FW,
    name: "A4 an all-known list is reported as an empty compendium",
    from: "    ui.notifications.warn(allKnownRefusal(title));",
    to: "    ui.notifications.warn(`${title}: no matching spells found in the compendium.`);",
    breaks: "D1 — the sentence the cold-index bug hid behind for six releases"
  },
  {
    file: FEATS,
    name: "A5 the mode flips: innate hides, repertoire labels",
    from: '  return innate ? "label" : "hide";',
    to: '  return innate ? "hide" : "label";',
    breaks: "A1/A2 — exactly backwards, and each half wrong in its own way"
  },
  {
    file: FEATS,
    name: "A6 a held spell is matched on a fragment of its name",
    from: "    const isHeld = held.has(name.trim().toLowerCase());",
    to: "    const isHeld = [...held].some((h) => name.toLowerCase().includes(h));",
    breaks: "B8 — knowing Light would hide Dancing Lights"
  },
  {
    file: FEATS,
    name: "A7 the comparison stops normalising what the sheet holds",
    from: '    Array.from(heldNames ?? []).map((name) => String(name ?? "").trim().toLowerCase())',
    to: "    Array.from(heldNames ?? [])",
    breaks: "B7 — a renamed or imported item would slip past by its spacing"
  },
  {
    file: FEATS,
    name: "A8 the label is dropped and the duplicate shown as ordinary",
    from: "      label: isHeld ? `${name} (${ALREADY_KNOWN_SUFFIX})` : name,",
    to: "      label: name,",
    breaks: "B4 — an innate chooser would offer a spell you know with nothing said"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([FEATS, FW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chooser-duplicates: verify already fails on an unmodified tree.\n");
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

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-chooser-duplicates: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-chooser-duplicates: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
