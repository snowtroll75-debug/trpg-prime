#!/usr/bin/env node
/**
 * mutate-chapter5-batch — can verify-chapter5-batch actually fail?
 *
 * NEW at 3.377.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE MUTATIONS WORTH READING are the ones that restore a plausible
 * misreading rather than a typo. Four of these are wrong implementations
 * a careful person could have written from the same sentence:
 *
 *   - The Bigger They Are read as RELATIVE size ("larger than you")
 *     instead of absolute ("Large or larger").
 *   - An unknown size defaulted to medium, the way `sizeCategoryDifference`
 *     does — right for a penalty, a silent gift here.
 *   - Savage Strikes' floor folded into its bonus, so the printed "1"
 *     becomes 1 + 1d4 and describes nothing that can happen.
 *   - Quick Identification read as "a flat +2 to Identify Power", which is
 *     right on the top rung and wrong on every other.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const PARSER = path.join(SYSTEM_ROOT, "module", "effect-parser.mjs");
const SKILLF = path.join(SYSTEM_ROOT, "module", "skill-feats.mjs");
const LADDER = path.join(SYSTEM_ROOT, "module", "general-skill-options.mjs");
const AWORK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const UNARMED = path.join(SYSTEM_ROOT, "module", "combat", "unarmed.mjs");
const ACTION = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");

const MUTATIONS = [
  /* ---- The Bigger They Are ---- */
  {
    name: "THE MISREADING: size taken as relative to the shooter",
    file: ATTACK,
    from: "  const index = SIZE_ORDER.indexOf(String(targetSize ?? \"\").trim().toLowerCase());\n  if (index === -1) return 0;\n  return index >= SIZE_ORDER.indexOf(\"large\") ? 2 : 0;",
    to: "  return sizeCategoryDifference(\"medium\", targetSize) >= 1 ? 2 : 0;",
    breaks: "A12/A13 — an unknown size would default to medium and score"
  },
  {
    name: "an unknown size defaults to Large and scores",
    file: ATTACK,
    from: "  if (index === -1) return 0;",
    to: "  if (index === -1) return 2;",
    breaks: "A12 — a silent +2 on every NPC with a blank size field"
  },
  {
    name: "the boundary slips a category, so Medium qualifies",
    file: ATTACK,
    from: "  return index >= SIZE_ORDER.indexOf(\"large\") ? 2 : 0;",
    to: "  return index >= SIZE_ORDER.indexOf(\"medium\") ? 2 : 0;",
    breaks: "A5 — the feat would apply to almost everything"
  },
  {
    name: "the weapon group stops being checked",
    file: ATTACK,
    from: "  if (String(weaponGroup ?? \"\").trim().toLowerCase() !== \"sling\") return 0;",
    to: "  void weaponGroup;",
    breaks: "A7/A8 — every weapon would get the sling's bonus"
  },
  {
    name: "the feat gate stops being checked",
    file: ATTACK,
    from: "  if (!owns) return 0;",
    to: "  void owns;",
    breaks: "A9 — everyone would have the feat"
  },
  {
    name: "the bonus never reaches the damage formula",
    file: AWORK,
    from: "  if (biggerBonus > 0) formula += ` + ${biggerBonus}`;",
    to: "  void biggerBonus;",
    breaks: "E1 — the note-only state it was in before this release"
  },
  {
    name: "the damage step stops being told the target's size",
    file: AWORK,
    from: "      targetSize: targetActor?.system?.identity?.size ?? null",
    to: "      targetSize: null",
    breaks: "E2 — the feat could never fire, and nothing would say so"
  },

  /* ---- Savage Strikes ---- */
  {
    name: "THE MISREADING: the flat-1 floor also takes the d4",
    file: PARSER,
    from: "  return [...list, { key: \"bleeding\", label: \"Bleeding\", value: 1 }];",
    to: "  return [...list, { key: \"bleeding\", label: \"Bleeding\", value: 1 + Math.max(0, bonus) }];",
    breaks: "B6 — the printed \"1 bleed damage\" would describe nothing that can happen"
  },
  {
    name: "the floor applies at any severity",
    file: PARSER,
    from: "  const seriousOrWorse = [\"serious\", \"deadly\"].includes(String(severity ?? \"\").trim().toLowerCase());",
    to: "  const seriousOrWorse = true;",
    breaks: "B7 — every unarmed critical would bleed, minor ones included"
  },
  {
    name: "a missing d4 silently becomes +0",
    file: PARSER,
    from: "    if (!Number.isFinite(bonus) || bonus <= 0) return list;",
    to: "    if (!Number.isFinite(bonus)) return list;",
    breaks: "B11 — a failed roll would be indistinguishable from the feat not applying"
  },
  {
    name: "the feat replaces Serrated's bonus instead of stacking",
    file: AWORK,
    from: "      applySerratedBonus(resolveEffectiveConditions(row, targetArmour), hasSerrated),",
    to: "      resolveEffectiveConditions(row, targetArmour),",
    breaks: "E3 — a Serrated unarmed strike would lose its +1"
  },
  {
    name: "unarmed stops being detected by trait",
    // THE RULE MOVED (3.576.0) to combat/unarmed.mjs, shared by all four
    // unarmed checks; the mutation follows it.
    file: UNARMED,
    from: "  return /\\bunarmed\\b/i.test(String(weaponSystem.traits ?? \"\"));",
    to: "  return false;",
    breaks: "E3's intent — feat-created natural attacks carry the trait, not the category"
  },

  /* ---- Shadowborn Agility ---- */
  {
    name: "THE MISREADING: the upgrade runs the wrong way along the ladder",
    file: SKILLF,
    from: "  Object.freeze({ actionKey: \"escape\", from: \"success\", to: \"critical\" })",
    to: "  Object.freeze({ actionKey: \"escape\", from: \"success\", to: \"partial\" })",
    breaks: "C2/C15 — the feat would make its owner worse at Escaping"
  },
  {
    name: "the upgrade ignores which action was rolled",
    file: SKILLF,
    from: "    (u) => u.actionKey === key && u.from === rolled",
    to: "    (u) => u.from === rolled",
    breaks: "C8 — a fumbled Tumble would become a failure too"
  },
  {
    name: "the upgrade ignores which degree was rolled",
    file: SKILLF,
    // Anchor updated at 3.561.0: the lookup moved inside the ownership
    // branch when module feats joined the same resolver.
    from: "    const match = SHADOWBORN_AGILITY_UPGRADES.find(\n      (u) => u.actionKey === key && u.from === rolled\n    );",
    to: "    const match = SHADOWBORN_AGILITY_UPGRADES.find((u) => u.actionKey === key);",
    breaks: "C4/C5 — every Escape would become a critical"
  },
  {
    name: "the feat gate stops being checked",
    file: SKILLF,
    // Anchor updated at 3.561.0 (same reason as above).
    from: "  if (ownsShadowbornAgility(featNames)) {",
    to: "  if (true) {",
    breaks: "C10 — everyone would have it"
  },
  {
    name: "the upgrade happens silently, with no line on the card",
    file: SKILLF,
    from: "  if (!result?.upgraded) return \"\";",
    to: "  return \"\";",
    breaks: "C16 — a card reading Critical over a die that did not critical, unexplained"
  },
  {
    name: "the Step option is offered on every upgrade",
    file: SKILLF,
    from: "  if (String(actionKey ?? \"\").trim() !== \"escape\") return base;",
    to: "  void actionKey;",
    breaks: "C20 — a wedged Squeeze would offer a Step out of nowhere"
  },
  {
    name: "the degree is upgraded AFTER the outcome text is chosen",
    file: ACTION,
    from: "    if (shadowbornNote) lines.push(line(shadowbornNote));",
    to: "",
    breaks: "C16/E4 — the upgrade would apply with nothing on the card saying so"
  },

  /* ---- Quick Identification ---- */
  {
    name: "THE MISREADING: the feat is a flat +2 on the standard ladder",
    file: LADDER,
    from: "  Object.freeze({ key: \"round\", label: \"1 round\", modifier: -2, apCost: \"1 round\" }),\n  Object.freeze({ key: \"action\", label: \"1 AP\", modifier: -5, apCost: \"1\" }),\n  Object.freeze({ key: \"free\", label: \"0 AP\", modifier: -10, apCost: \"0\" })",
    to: "  Object.freeze({ key: \"round\", label: \"1 round\", modifier: -3, apCost: \"1 round\" }),\n  Object.freeze({ key: \"action\", label: \"1 AP\", modifier: -8, apCost: \"1\" }),\n  Object.freeze({ key: \"free\", label: \"0 AP\", modifier: -10, apCost: \"0\" })",
    breaks: "D3 — right at the top of the ladder, wrong all the way down it"
  },
  {
    name: "the fifth rung is dropped",
    file: LADDER,
    // RE-ANCHORED AT 3.520.0: this named the list's last entry PLUS its
    // closing delimiter, which is the A3 shape — it dies the day an entry
    // is appended after it. It now names only the line it removes.
    from: "  Object.freeze({ key: \"free\", label: \"0 AP\", modifier: -10, apCost: \"0\" })",
    to: "",
    breaks: "D2/D5 — the feat's whole reason for existing"
  },
  {
    // Was anchored on the pre-3.377.1 one-liner and is superseded by
    // "the swap edits the shared ladder in place" below, which restores
    // the same defect against the descriptor-returning version.
    name: "everybody gets the feat's ladder",
    file: LADDER,
    from: "  if (!owns) return baseLadder;",
    to: "  void owns;",
    breaks: "D4/D8 — everybody would identify on the feat's ladder"
  },
  {
    // THE 3.377.1 BUG, restored exactly: the swap returns a bare list of
    // rungs instead of a ladder descriptor. promptTimeLadder reads
    // `ladder.options`, so Identify Power posted nothing at all — the feat
    // deleted the action it was meant to improve. The whole harness was
    // green, because every other check asks about numbers.
    name: "THE SHIPPED BUG: the swap returns rungs instead of a ladder",
    file: LADDER,
    from: "  return { ...baseLadder, options: QUICK_IDENTIFICATION_TIME_OPTIONS };",
    to: "  return QUICK_IDENTIFICATION_TIME_OPTIONS;",
    breaks: "D0 — a shape nothing downstream can read"
  },
  {
    name: "the swap loses the dialog's title and hint",
    file: LADDER,
    from: "  return { ...baseLadder, options: QUICK_IDENTIFICATION_TIME_OPTIONS };",
    to: "  return { options: QUICK_IDENTIFICATION_TIME_OPTIONS, defaultKey: baseLadder.defaultKey };",
    breaks: "D0 — the dialog would open untitled and unexplained"
  },
  {
    name: "the swap edits the shared ladder in place",
    file: LADDER,
    from: "  if (!owns) return baseLadder;\n  return { ...baseLadder, options: QUICK_IDENTIFICATION_TIME_OPTIONS };",
    to: "  baseLadder.options = QUICK_IDENTIFICATION_TIME_OPTIONS;\n  if (!owns) return baseLadder;\n  return baseLadder;",
    breaks: "D0/D4 — everyone would inherit the feat's ladder"
  },
  {
    name: "the ladder is chosen for the prompt but not for the modifier",
    file: ACTION,
    from: "  const actionLadder = (baseLadder && action.key === \"identifyPower\")\n    ? identifyPowerLadderFor(baseLadder, actorFeatNames)\n    : baseLadder;",
    to: "  const actionLadder = baseLadder;",
    breaks: "E6 — the feat would never apply"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-chapter5-batch.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([ATTACK, PARSER, SKILLF, LADDER, AWORK, UNARMED, ACTION]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter5-batch: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-chapter5-batch: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter5-batch: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
