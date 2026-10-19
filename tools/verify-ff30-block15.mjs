#!/usr/bin/env node
/**
 * verify-ff30-block15 — 3.647.0, Fiends & Fables 3.0 block 15 (the Ettin to
 * the Ghast; Graham, 15 October 2026: "Your recommendations"):
 *   R7  Carrion Feast — the `carrionFeast` Codex action
 *   R8  Efreet Shifting — the `sizeShift` Codex action
 *   R9  Dual Minds — 4 AP, 2 reactions, single-target mental immunity, two saves
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (p) => import(new URL(`../module/${p}`, import.meta.url));
const DM = await imp("dual-minds.mjs");
const STI = await imp("magic/spell-trait-immunity.mjs");
const CR = await imp("codex-action-rules.mjs");
const src = {
  actor: read("module", "documents", "actor.mjs"),
  combat: read("module", "documents", "combat.mjs"),
  check: read("module", "dice", "check.mjs"),
  aw: read("module", "combat", "action-workflow.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs"),
  caw: read("module", "codex-actions-workflow.mjs")
};

// R9
const ettinItems = [{ name: "Dual Minds", flags: { "trg-prime": { dualMinds: true } } }];
equal("D1 Dual Minds: one target immune, several two saves, Fear counts as mental, a non-mental effect untouched, no Dual Minds nothing",
  [DM.dualMindsVerdict(ettinItems, "Enchantment, Mental", 1), DM.dualMindsVerdict(ettinItems, "Mental", 3), DM.dualMindsVerdict(ettinItems, "Fear", 1),
    DM.dualMindsVerdict(ettinItems, "Fire", 1), DM.dualMindsVerdict([], "Mental", 1)],
  ["immune", "twoSaves", "immune", null, null]);
equal("D2 two heads: 4 AP and 2 reactions", [DM.DUAL_MINDS_AP, DM.DUAL_MINDS_REACTIONS], [4, 2]);
{
  const ettin = { name: "Ettin", system: {}, items: ettinItems };
  const orc = { name: "Orc", system: {}, items: [] };
  const one = STI.partitionTraitImmune([ettin], "Mental", () => null);
  const two = STI.partitionTraitImmune([ettin, orc], "Mental", () => null);
  const area = STI.partitionTraitImmune([ettin], "Mental", () => null, { targetCount: Infinity });
  equal("D3 a mental spell at the Ettin alone is pruned; with another, or as an area, it is not",
    [one.kept.length, one.skipped[0]?.trait, two.kept.length, area.kept.length], [0, "mental", 2, 1]);
}
ok("D4 the sheet's AP and reactions rise", /if \(hasDualMinds\(this\.items\)\) \{\n      if \(reactions\) reactions\.max = Math\.max\(reactions\.max, DUAL_MINDS_REACTIONS\);[\s\S]{0,120}ap\.max = Math\.max\(Number\(ap\.max \?\? 0\), DUAL_MINDS_AP\);/.test(src.actor));
ok("D5 the turn grants 4 AP", /const dualBase = hasDualMinds\(actor\.items\) \? \{ base: DUAL_MINDS_AP \} : \{\};/.test(src.combat)
  && /const regain = computeAPRegain\(\{ stunned, slowed: slowed \+ abilitySlow, quickened, extra: fastAttack \? 1 : 0, \.\.\.dualBase,/.test(src.combat));
ok("D6 a mental save that reaches it rolls again and keeps the better", /dualMindsVerdict\(check\.actor\.items, check\.traits \?\? "", Infinity\) === "twoSaves"\) \{\n        const first = /.test(src.check)
  && /const keptFirst = rank\(first\.outcome\) > rank\(check\.outcome\)/.test(src.check) && /if \(keptFirst\) \{\n          check\.dice = first\.dice;\n          check\.outcome = first\.outcome;/.test(src.check));
ok("D7 a mental action aimed at it is refused; an area spell is never one target",
  /dualMindsVerdict\(targetActor\.items, action\.traits \?\? "", 1\) === "immune"/.test(src.aw)
  && /partitionTraitImmune\(areaTargets, spellData\.traits \?\? "", ownedCreatureTypeSystem, \{ targetCount: Infinity \}\)/.test(src.cast));

// R7
equal("C1 Carrion Feast: once per body per feeder", [CR.carrionFeastAllowed([], "A.g1"), CR.carrionFeastAllowed(["A.g1"], "A.g1"), CR.carrionFeastAllowed(["A.g1"], "A.g2"), CR.carrionFeastAllowed(null, "")], [true, false, true, false]);
ok("C2 the action heals its dice from an adjacent body and marks it", /const roll = await new Roll\(String\(spec\.heal \?\? "1d6"\)\)\.evaluate\(\);/.test(src.caw)
  && /return feet !== null && feet <= 5;/.test(src.caw) && /await body\.actor\.setFlag\(SYSTEM_ID, CARRION_FED_FLAG, fedBy\);/.test(src.caw));

// R8
equal("S1 Size Shift by degree", [CR.sizeShiftOutcome("critical", 1), CR.sizeShiftOutcome("success", 1), CR.sizeShiftOutcome("partial", -1), CR.sizeShiftOutcome("failure", 1)?.seconds, CR.sizeShiftOutcome("fumble", 1)?.seconds, CR.sizeShiftOutcome("blunder", 1)?.permanent, CR.sizeShiftOutcome("failure", 1, true)?.steps],
  [null, { steps: 1, rounds: 1, label: "until the end of its next turn" }, { steps: -1, seconds: 60, label: "for 1 minute" }, 3600, 86400, true, -1]);
ok("S2 the action spends a use, saves against the Level DC and lays the step", /if \(counted\) await item\.update\(\{ "system\.usesValue": left - 1 \}\);\n  const \{ levelDC \}/.test(src.caw)
  && /const outcome = sizeShiftOutcome\(degree\?\.key, dir === "larger" \? 1 : -1, Boolean\(check\?\.outcome\?\.chaos\)\);/.test(src.caw)
  && /await createEffectsOn\(target, \[\{ name: `\$\{item\.name\} \(\$\{actor\.name\}\)`, img: item\.img, changes: \[change\], flags \}\]\);/.test(src.caw));
ok("S3 both actions are registered", /weaponStrike, carrionFeast, sizeShift(, strikeBurst, sweepingStrike)?(, toggleEffect)? \}\);/.test(src.caw));

const EXPECTED = 13;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block15: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block15: ${checks} checks — all green.`);
