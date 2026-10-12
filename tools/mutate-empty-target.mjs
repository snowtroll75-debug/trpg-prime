#!/usr/bin/env node
/**
 * mutate-empty-target — can verify-empty-target fail?
 * NEW at 3.450.0.
 *
 * W1 IS THE ONE THAT MATTERS. It imports the rule and never consults it,
 * which is exactly the shape of the defect this release repairs: a rule
 * that exists, reads well, and is never asked.
 *
 * W4 IS GRAHAM'S RULING. Turning the warning into a refusal breaks the
 * 3.286.0 repair — clearing every target is how a stale one is undone —
 * and is the silent removal his 27 August ruling forbids.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const T = path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs");
const P = path.join(SYSTEM_ROOT, "module", "combat", "target-prompt.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-empty-target.mjs");

const MUTATIONS = [
  /* ── R: when the warning is owed ───────────────────────────────── */
  {
    file: P,
    name: "R1 an empty scene is warned at too",
    from: "  if (offered < 1) return false;",
    to: "  if (false) return false;",
    breaks: "R4 — a sentence about the system rather than about the choice"
  },
  {
    file: P,
    name: "R2 the warning fires on every selection",
    from: "  return picked < 1;",
    to: "  return true;",
    breaks: "R2/R3 — a warning on a perfectly good choice is noise that teaches players to click through"
  },
  {
    file: P,
    name: "R3 it never fires",
    from: "  return picked < 1;",
    to: "  return false;",
    breaks: "R1 — the defect, restored"
  },
  {
    file: P,
    name: "R4 rubbish counts as an empty selection",
    from: "  if (!Number.isFinite(picked) || !Number.isFinite(offered)) return false;",
    to: "  ;",
    breaks: "R5 — NaN < 1 is false, so this survives only if the check drives it"
  },

  /* ── F: the shape the form actually returns (3.450.1) ──────────── */
  {
    file: P,
    name: "F1 THE SHIPPED BUG: unticked rows count as choices",
    from: '  return rows.filter((id) => typeof id === "string" && id.trim() !== "");',
    to: "  return rows;",
    breaks: "F1/F7 — four nulls read as four selections, and the warning never fires"
  },
  {
    file: P,
    name: "F2 a bare value is iterated as characters",
    from: "  const rows = Array.isArray(raw) ? raw : [raw];",
    to: "  const rows = Array.from(raw);",
    breaks: "F4 — one checkbox comes back bare, and 'solo' becomes four rows"
  },
  {
    file: P,
    name: "F3 blank strings survive as choices",
    from: '  return rows.filter((id) => typeof id === "string" && id.trim() !== "");',
    to: '  return rows.filter((id) => typeof id === "string");',
    breaks: "F6 — an empty string is not a token id"
  },
  {
    file: T,
    name: "F4 the callback hands back the raw form value again",
    from: "            return selectedTargetIds(new FDE(form).object.target);",
    to: "            const raw = new FDE(form).object.target;\n            return Array.isArray(raw) ? raw : [raw];",
    breaks: "W1b — exactly what shipped in 3.450.0"
  },

  /* ── S: what it says ───────────────────────────────────────────── */
  {
    file: P,
    name: "S1 the warning names a cost only one caller spends",
    from: '  "Nothing is ticked. This will still be resolved and its cost spent, "',
    to: '  "Nothing is ticked. The PP will still be spent, "',
    breaks: "S4 — false for a weapon attack and a thrown flask"
  },
  {
    file: P,
    name: "S2 it stops saying nothing is affected",
    from: '  + "but no creature will be affected.";',
    to: '  + "but that may be what you meant.";',
    breaks: "S3 — the one consequence the player needs to know"
  },

  /* ── W: is it reached, and may the player still say yes? ────────── */
  {
    file: T,
    name: "W1 THE OLD FAILURE: the rule is imported and never asked",
    from: "    if (!warnsOnEmptySelection(result.length, ordered.length)) break;",
    to: "    break;",
    breaks: "W1 — an empty Continue spends the spell in silence again"
  },
  {
    file: T,
    name: "W2 the warning becomes a refusal",
    from: '    if (await confirmEmptySelection(title) === "continue") break;',
    to: "    return false;",
    breaks: "W4 — Graham asked for a warning, and a refusal breaks clearing a stale target"
  },
  {
    file: T,
    name: "W3 the warning is shown and its answer ignored",
    from: '    if (await confirmEmptySelection(title) === "continue") break;',
    to: "    await confirmEmptySelection(title);\n    break;",
    breaks: "W4 — 'Go back' would return to the roll it was meant to prevent"
  },
  {
    file: T,
    name: "W4 a cancel falls through to the warning",
    from: '    if (result === null || result === undefined || result === "cancel") return false;',
    to: "    if (result === null || result === undefined) return false;",
    breaks: "W3 — cancelling is not confirming nobody"
  },
  {
    file: T,
    name: "W5 continuing is the default answer",
    from: '      { action: "back", label: "Go back", icon: "fa-solid fa-rotate-left", default: true },\n      { action: "continue", label: "Continue anyway", icon: "fa-solid fa-triangle-exclamation" }',
    to: '      { action: "back", label: "Go back", icon: "fa-solid fa-rotate-left" },\n      { action: "continue", label: "Continue anyway", icon: "fa-solid fa-triangle-exclamation", default: true }',
    breaks: "W8 — a stray Enter would spend the spell"
  },
  {
    file: T,
    name: "W6 dismissing the warning counts as consent",
    from: '  return answer === "continue" ? "continue" : "back";',
    to: '  return answer === "back" ? "back" : "continue";',
    breaks: "W9 — closing a warning is not agreeing with it"
  },
  {
    file: T,
    name: "W7 the warning dialog retypes the sentence",
    from: "      <p class=\"hint\">${EMPTY_SELECTION_WARNING}</p>",
    to: "      <p class=\"hint\">Nothing is ticked.</p>",
    breaks: "W6b — two places stating one warning"
  },

  /* ── C: area spells keep their own door out ────────────────────── */
  {
    file: C,
    name: "C1 area spells are dragged into the picker",
    // RE-ANCHORED 3.612.0: a reaction cast with its target preset skips it too.
    from: "  if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {",
    to: "  if (true) {",
    breaks: "C1 — every area cast warned at for a selection it never needed"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([T, P, C, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-empty-target: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-empty-target: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-empty-target: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
