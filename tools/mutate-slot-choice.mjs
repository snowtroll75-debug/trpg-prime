#!/usr/bin/env node
/**
 * mutate-slot-choice — can verify-slot-choice fail?
 *
 * NEW at 3.507.0.
 *
 * W1 IS THE ONE THIS RELEASE EXISTS FOR. A warp that declares no mod is
 * offered, charged, and printed as warped while doing nothing — and the
 * card gives the caster no way to tell. That defect has now been found in
 * the pack 48 times and in the code twice.
 *
 * N1 IS THE QUIET ONE. A slot arriving from the prompt that the spell
 * never offered is a resistance bonus on somebody's Defence, and it would
 * look entirely ordinary on the sheet.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SC = path.join(SYSTEM_ROOT, "module", "magic", "slot-choice.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-slot-choice.mjs");

const MUTATIONS = [
  /* ── C: the choice ─────────────────────────────────────────────── */
  {
    file: SC,
    name: "C1 THE PROMPT STOPS BEING ASKED FOR — the slot is settled by the code",
    // RE-ANCHORED 3.630.0: the count may grow with a warp (choiceExtra).
    from: "  return { count, prompt: spec.options.length > count };",
    to: "  return { count, prompt: false };",
    breaks: "C2b — \"selected when casting\" would become \"whichever is first\""
  },
  {
    file: SC,
    name: "C2 THE +2 PP WARP STOPS TAKING EVERY SAVE",
    from: "  if (warpMods?.allSlots) return { count: spec.options.length, prompt: false };",
    to: "  if (false) return { count: spec.options.length, prompt: false };",
    breaks: "C3 — the warp would buy a prompt the caster already paid to skip"
  },
  {
    file: SC,
    name: "C3 the warped casting is prompted anyway",
    from: "  if (warpMods?.allSlots) return { count: spec.options.length, prompt: false };",
    to: "  if (warpMods?.allSlots) return { count: spec.options.length, prompt: true };",
    breaks: "C3b — a dialog with nothing left to decide"
  },

  /* ── R: the rows ───────────────────────────────────────────────── */
  {
    file: SC,
    name: "R1 THE WARPED VALUE STOPS REACHING THE ROW",
    from: "  const value = added && typeof warpValue === \"function\"\n    ? warpValue(spec.value, added, warpMods?.bonusMax ?? null)\n    : spec.value;",
    to: "  const value = spec.value;",
    breaks: "R3 — the +4 PP warp would buy nothing, which is where this spell started"
  },
  {
    file: SC,
    name: "R2 the printed cap is ignored",
    from: "    ? warpValue(spec.value, added, warpMods?.bonusMax ?? null)",
    to: "    ? spec.value + added",
    breaks: "R3b — \"max +5\" is printed and would stop being enforced"
  },
  {
    file: SC,
    name: "R3 a negative mod shrinks the bonus",
    from: "  const added = Math.max(0, int(warpMods?.bonusValue));",
    to: "  const added = int(warpMods?.bonusValue);",
    breaks: "R3 — a warp only ever buys more"
  },

  /* ── N: the guards ─────────────────────────────────────────────── */
  {
    file: SC,
    name: "N1 A SLOT THE SPELL NEVER OFFERED IS APPLIED — a save bonus on Defence",
    from: "    .filter((s) => spec.options.includes(s));",
    to: "    .filter(Boolean);",
    breaks: "N1/N1b — whatever the prompt returns becomes a bonus somewhere"
  },
  {
    file: SC,
    name: "N2 the same slot twice stacks with itself",
    from: "  const unique = [...new Set(slots)];",
    to: "  const unique = slots;",
    breaks: "N2 — two rows on one save, and `resistance` is highest-wins"
  },
  {
    file: SC,
    name: "N3 a row naming an unknown list is accepted",
    from: "  if (!from || !CHOOSABLE[from]) return null;",
    to: "  if (!from) return null;",
    breaks: "N4b — a prompt with nothing in it"
  },
  {
    file: SC,
    name: "N4 an ordinary bonus row is treated as a choice",
    from: "  const from = text(raw.chooseFrom);",
    to: "  const from = text(raw.chooseFrom) || \"saves\";",
    breaks: "N4 — every bonus in the pack would prompt for a saving throw"
  },
  {
    file: SC,
    name: "N5 a choice granting nothing is accepted",
    from: "  if (!value) return null;",
    to: "  if (false) return null;",
    breaks: "N4c — a dialog that costs the caster a decision and grants +0"
  },

  /* ── W: the warp mod ───────────────────────────────────────────── */
  {
    file: WARP,
    name: "W1 THE `allSlots` MOD IS DROPPED BY THE AGGREGATE — the warp goes inert again",
    from: "    if (m.allSlots) mods.allSlots = true;",
    to: "    ;",
    breaks: "W2 — offered, charged, printed as warped, and doing nothing"
  },
  {
    file: WARP,
    name: "W2 the mod key leaves the declared list",
    // ANCHORED ON THE KEY, NOT THE BRACE AFTER IT. The first version
    // carried the closing `};` of `emptyWarpMods`, which `A3 NO ANCHOR
    // CARRIES A CLOSING DELIMITER IT DOES NOT CHANGE` refuses — that
    // list grows every release, and an anchor on where it stops is
    // disarmed by the next key anybody adds.
    from: "    allSlots: false",
    to: "    allSlotsUnused: false",
    breaks: "W2c — an undeclared key is dropped in silence"
  },

  /* ── L: the card ───────────────────────────────────────────────── */
  {
    file: SC,
    name: "L1 THE CARD STOPS SAYING THE WARP MADE THE CHOICE",
    from: "  return warped\n    ? `<em>${spellName} was warped to cover every saving throw — ${named}.</em>`\n    : `<em>${spellName} covers ${named}.</em>`;",
    to: "  return `<em>${spellName} covers ${named}.</em>`;",
    breaks: "L2 — a caster who paid 2 PP and saw no prompt cannot tell why"
  },
  {
    file: SC,
    name: "L2 a cancelled prompt looks like a spell that worked",
    // RE-ANCHORED 2 Oct 2026 (3.611.1): the noun is the list's own now.
    from: "  return `<em>No ${slotChoiceWords(chooseFrom).single} was chosen for ${spellName} — nothing applied.</em>`;",
    to: "  return `<em>${spellName}.</em>`;",
    breaks: "N3b — the anti-silence rule this project applies everywhere"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([SC, WARP, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-slot-choice: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-slot-choice: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-slot-choice: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
