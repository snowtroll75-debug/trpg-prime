#!/usr/bin/env node
/**
 * mutate-feat-choice-label — can verify-feat-choice-label fail?
 * NEW at 3.553.1.
 *
 * The one that matters most is A3: the display rule reaching for a pick
 * that is not there and printing "Toughness ()" on every feat a
 * character owns.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATS = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const FW = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-feat-choice-label.mjs");

const MUTATIONS = [
  {
    file: FEATS,
    name: "A1 a feat with no pick is bracketed anyway",
    from: "  if (!base || !pick) return base;",
    to: "  if (!base) return base;",
    breaks: "A3/A4 — 'Toughness ()' on every feat that never had a choice to make"
  },
  {
    file: FEATS,
    name: "A2 a name that already carries its pick is doubled",
    from: "  if (base.toLowerCase().endsWith(`(${pick.toLowerCase()})`)) return base;",
    to: "  if (false) return base;",
    breaks: "A5/A6 — 'Weapon Focus (Brawling) (Brawling)', which is how a background's grant reads"
  },
  {
    file: FEATS,
    name: "A3 the pick is not trimmed before it is shown",
    from: "  const pick = String(choice ?? \"\").trim();",
    to: "  const pick = String(choice ?? \"\");",
    breaks: "A8 — a stored answer with a stray space prints one inside the brackets"
  },
  {
    file: FEATS,
    name: "A4 the stamped label is ignored in favour of parsing",
    from: "  const declared = String(effect?.label ?? \"\").trim();",
    to: "  const declared = \"\";",
    breaks: "B1 — the exact answer is on the effect; parsing its name is the fallback, not the rule"
  },
  {
    file: FEATS,
    name: "A5 an effect belonging to another feat is read anyway",
    from: "  if (!base || !text.toLowerCase().startsWith(`${base.toLowerCase()}:`)) return \"\";",
    to: "  if (!base) return \"\";",
    breaks: "B5 — Shadow Stance would name the pick of a feat it has nothing to do with"
  },
  {
    file: FEATS,
    name: "A6 the trailing bonus is kept as part of the pick",
    from: "    .replace(/\\s*[+-]\\d+$/, \"\")",
    to: "    .replace(/\\s*$/, \"\")",
    breaks: "B2/B3 — 'Weapon Focus (Brawling +1)' reads as a group called Brawling +1"
  },
  {
    file: FW,
    name: "A7 Skill Focus stamps its flag key instead of the action's name",
    from: "flags: { [SYSTEM_ID]: { skillFocusAction: choice, choiceLabel: action.name } }",
    to: "flags: { [SYSTEM_ID]: { skillFocusAction: choice, choiceLabel: choice } }",
    breaks: "C4 — the flag holds 'sneak'; the sheet has to show 'Sneak'"
  },
  {
    file: FW,
    name: "A8 Weapon Focus stops stamping a label at all",
    from: "flags: { [SYSTEM_ID]: { weaponFocusGroup: choice, choiceLabel: choice } }",
    to: "flags: { [SYSTEM_ID]: { weaponFocusGroup: choice } }",
    breaks: "C2 — it would still work by parsing, which is exactly how a fallback quietly becomes the rule"
  },
  {
    file: FW,
    name: "A9 the effect name drifts out of the shape the fallback parses",
    from: "        name: `Weapon Focus: ${choice} +1`,",
    to: "        name: `Weapon Focus — ${choice} (+1 attack)`,",
    breaks: "C1 — every character who chose before 3.553.1 loses their label"
  },
  {
    file: FW,
    name: "A10 a feat you take once is bracketed anyway",
    from: '  if (!item || item.system?.repeatable !== true) return "";',
    to: '  if (!item) return "";',
    breaks: "C5 — 'Magical Crafting (Rune of Sharpness formula)' on a feat with no second copy to tell apart"
  },
  {
    file: FW,
    name: "A10b a chooser that records elsewhere stops marking itself",
    from: '  const own = String(item.getFlag?.(SYSTEM_ID, "choiceLabel") ?? "").trim();',
    to: '  const own = "";',
    breaks: "C5a — Armour Focus keeps its answer on the ARMOUR and would show nothing"
  },
  {
    file: FW,
    name: "A10d Elemental Spell stamps its stored key instead of the label",
    from: "            choiceLabel: options.find(([value]) => value === choice)?.[1] ?? choice",
    to: "            choiceLabel: choice",
    breaks: "E6a — the row reads 'Elemental Spell (fire)', which is how it shipped at 3.553.2"
  },
  {
    file: FW,
    name: "A10c a repeatable chooser stops stamping its label",
    from: "{ favouredTerrainActive: true, favouredTerrainType: choice, choiceLabel: choice }",
    to: "{ favouredTerrainActive: true, favouredTerrainType: choice }",
    breaks: "E6 — it would fall back to the effect name, which is the fallback becoming the rule again"
  },
  {
    file: FW,
    name: "A11 a second copy reads the first copy's effect",
    from: "    if (effect.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG) !== item.id) continue;",
    to: "    if (!effect.getFlag?.(SYSTEM_ID, FEAT_SOURCE_FLAG)) continue;",
    breaks: "C6 — three copies of Weapon Focus would all show the same group, which is the bug this fixes"
  },
  {
    file: FW,
    name: "A11b a feat that granted a PACKAGE names one of them at random",
    from: "  if (granted.length === 1) return String(granted[0].name ?? \"\").trim();",
    to: "  if (granted.length >= 1) return String(granted[0].name ?? \"\").trim();",
    breaks: "C5b — one granted thing is an answer; three is a guess"
  },
  {
    file: SHEET,
    name: "A12 the sheet goes back to the raw item name",
    from: "        name: featDisplayName(item.name, recordedFeatChoice(this.actor, item)),",
    to: "        name: item.name,",
    breaks: "D1 — the rule exists and the player never sees it"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([FEATS, FW, SHEET, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-feat-choice-label: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-feat-choice-label: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-feat-choice-label: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
