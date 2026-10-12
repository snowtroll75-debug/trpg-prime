#!/usr/bin/env node
/**
 * verify-drive-3617 — the 3.617.0 live test's findings, and Graham's answers.
 *
 * NEW at 3.617.1 (claude/live-testing-report-3.617.0.md):
 *   A  F1 — the Gloves of Vitality healed nobody: "living" was asked as a trait
 *   B  F2 — the Gloves had no use button where wondrous items are listed;
 *      G1 — the Wondrous section's wording and marker predate R16
 *   C  Q1 — the Bracers' Base DR scales by BSB, as Mage Armour's does
 *   D  Q2 — the Bracers stop no more than their pool has left
 *   E  G2 — a fumbled save's bonus dice are named on the burst card
 *   F  O1 — Aid Another reaches the token's own actor
 *   G  the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const { wondrousUsePatientRefusal } = await import("../module/wondrous-use.mjs");
const { bracersBaseDR, bracersAfterDrain } = await import("../module/wondrous-effects.mjs");
const { bracersAreTheArmour } = await import("../module/bracers-workflow.mjs");
const { resolveAgainstDefences } = await import("../module/combat/damage-workflow.mjs");
const { aidRecipientPool } = await import("../module/skill-aid.mjs");
const { TRG_SCHEMA_VERSION } = await import("../module/migration.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const WUSEF = strip(read("module", "wondrous-use-workflow.mjs"));
const ITEMSF = strip(read("module", "magic-items-workflow.mjs"));
const SHEET = strip(read("module", "sheets", "actor-sheet.mjs"));
const HBS = read("templates", "actor", "actor-sheet.hbs");
const ACTOR = strip(read("module", "documents", "actor.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const BURST = strip(read("module", "burst-workflow.mjs"));
const SKILLS = strip(read("module", "skills.mjs"));

/* A — F1: who is living */
{
  ok("A1 F1 — a character with no creature type is living (the drive's Wiz and Ally were refused)",
    wondrousUsePatientRefusal({}, "Wiz") === "" && wondrousUsePatientRefusal({ details: { creatureType: "humanoid" } }, "Ally") === "");
  ok("A2 an undead or a construct is not",
    /not a living creature \(undead\)/.test(wondrousUsePatientRefusal({ details: { creatureType: "undead" } }, "U"))
    && /not a living creature \(construct\)/.test(wondrousUsePatientRefusal({ details: { creatureType: "construct" } }, "C")));
  ok("A3 the heal asks the gate, not isOfKind(…, \"living\")",
    /const refusal = wondrousUsePatientRefusal\(patient\.system \?\? \{\}, patient\.name\);/.test(WUSEF) && !/isOfKind\(/.test(WUSEF));
}

/* B — F2 and G1: the Wondrous section */
{
  ok("B1 F2 — Activate Item runs a wondrous item's use",
    /if \(wondrousUseOf\(item\)\) \{\s*const \{ useWondrousItem \} = await import\("\.\/wondrous-use-workflow\.mjs"\);\s*return useWondrousItem\(actor, item\);/.test(ITEMSF));
  ok("B2 and its button says so in the Wondrous section",
    /row\.wondrousUse = wondrousUseLabel\(item\);/.test(SHEET)
    && /data-action="activateItem" data-tooltip="\{\{#if item\.wondrousUse\}\}\{\{item\.wondrousUse\}\}/.test(HBS));
  ok("B3 G1 — a row is marked applied only when invested and worn",
    /row\.wondrousActive = wondrousActive\(item\) && wondrousEffects\.summary\.length > 0;/.test(SHEET)
    && /benefits apply while it is <strong>invested and worn<\/strong>/.test(HBS) && !/not merely worn/.test(HBS));
}

/* C — Q1: BSB, not BDB */
{
  const pair = [{ itemId: "b", itemName: "Bracers of Armour II", value: 2, armourHP: 30, stored: null }];
  ok("C1 Q1 — Bracers II: DR 2 at BSB 0, 4 at BSB 6, 6 at BSB 12",
    bracersBaseDR(pair, 0, 0).effective === 2 && bracersBaseDR(pair, 0, 6).effective === 4 && bracersBaseDR(pair, 0, 12).effective === 6);
  ok("C2 the actor passes the BSB (magic + progression), as Mage Armour's casterBSB does",
    /Math\.max\(0, Math\.trunc\(Number\(system\.magic\?\.bsb \?\? 0\)\)\) \+ Math\.max\(0, Math\.trunc\(Number\(system\.progression\?\.bsb \?\? 0\)\)\)/.test(ACTOR));
  const sys = (worn, bdb, bracers) => ({ combat: { armour: { dr: worn }, bdb: { total: bdb },
    bracers: { effective: bracers, itemId: bracers ? "b" : "" }, naturalArmour: { dr: 0 }, dr: { total: 0 } } });
  const armourWins = resolveAgainstDefences(sys(2, 6, 3), { amount: 10, type: "slashing" });
  const bracersWin = resolveAgainstDefences(sys(2, 6, 5), { amount: 10, type: "slashing" });
  ok("C3 worn armour is weighed after BDB, the bracers after BSB: Chain 2 × 2 = 4 beats 3, loses to 5",
    armourWins.taken === 6 && armourWins.bracersSource === false && bracersWin.taken === 5 && bracersWin.bracersSource === true);
  ok("C4 the weapon path compares the same two figures",
    /const wornEffectiveDR = effectiveDR\(wornArmourDR, targetSystem\.combat\?\.bdb\?\.total \?\? 0\);/.test(ATTACK)
    && /const bracersSource = bracersAreTheArmour\(wornEffectiveDR, targetBracers\);/.test(ATTACK)
    && /drAfterPenalty\(\s*equippedEffectiveDR,/.test(ATTACK));
}

/* D — Q2: no more than the pool */
{
  const at = (hp) => bracersBaseDR([{ itemId: "b", itemName: "B", value: 2, armourHP: 30, stored: { hp, inertUntil: 0 } }], 0, 6);
  ok("D1 Q2 — on 1 HP they stop 1; on 3, 3; on 30, the full 4", at(1).effective === 1 && at(3).effective === 3 && at(30).effective === 4);
  ok("D2 so a blow drains no more than is left, and the last point leaves them inert",
    bracersAfterDrain(at(1), at(1).effective, 0).inert && bracersAfterDrain(at(3), 2, 0).hp === 1);
  ok("D3 bracers on their last point still lose to armour that stops more",
    !bracersAreTheArmour(2, at(1)) && bracersAreTheArmour(0, at(1)));
}

/* E — G2: the burst names its bonus dice */
{
  ok("E1 G2 — a fumble's bonus base dice are on the card",
    /bonusText = ` \(\$\{rolled\.total\} \+ \$\{basic\.bonusBaseDamage\}d\$\{die\} = \$\{bonus\.total\} bonus base damage\)`;/.test(BURST)
    && /taken\$\{bonusText\}/.test(BURST));
}

/* F — O1: the token's own actor */
{
  ok("F1 O1 — Aid recipients are named by the token's actor uuid, and resolved by it",
    /\.map\(\(t\) => \(\{ id: t\.actor\.uuid, name: t\.name \}\)\)/.test(SKILLS)
    && /const first = aidRecipientActor\(result\.allyId\);/.test(SKILLS) && /const ally = aidRecipientActor\(id\);/.test(SKILLS)
    && /globalThis\.fromUuidSync\?\.\(key\)/.test(SKILLS) && !/game\.actors\.get\(result\.allyId\)/.test(SKILLS));
  const pool = aidRecipientPool({
    sceneAllies: [{ id: "Scene.s.Token.t1.Actor.A", name: "Ally (token)" }, { id: "Actor.W", name: "Wiz" }],
    partyCharacters: [{ id: "Actor.W", name: "Wiz" }, { id: "Actor.P", name: "PC" }],
    selfId: "Actor.W"
  });
  ok("F2 the unlinked token is offered as itself; the aider is not offered",
    pool.candidates.length === 1 && pool.candidates[0].id === "Scene.s.Token.t1.Actor.A");
}

/* G — the version */
{
  const sys = JSON.parse(read("system.json"));
  const [a, b, c] = String(sys.version).split(".").map(Number);
  ok("G1 3.617.1 or later, and the schema does not lead it",
    (a > 3 || b > 617 || (b === 617 && c >= 1)) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0);
}

if (failures.length) {
  console.log(`verify-drive-3617: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-3617: OK — ${checks} checks. The Gloves heal the living, from the Wondrous section; the Bracers scale by BSB and stop no more than they have; the burst names its dice; Aid reaches the token.`);
