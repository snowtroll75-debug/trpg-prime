#!/usr/bin/env node
/**
 * verify-ff30-block33 — 3.663.0, Fiends & Fables 3.0 block 33 (the Unicorn,
 * Vampire and Wight; Graham, 19 October 2026: "R3 option A, R5 Option A").
 *
 *   R5   Spiteful Strike: offered on the kill, made with the reaction; half
 *        the damage it inflicts heals, and above 0 HP the creature is no
 *        longer destroyed (reading A1)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const SS = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "combat", "spiteful-strike.mjs")).href);

const ability = (rule) => ({ type: "ability", name: "Spiteful Strike", flags: { "trg-prime": { creatureAbility: { derives: { spitefulStrike: rule } } } } });
const claws = { type: "weapon", name: "Claws" }, bite = { type: "weapon", name: "Bite" };
equal("S1 the rule is read from the ability, its weapon named or not; a creature without it has none",
  [SS.spitefulStrikeRule([ability({ weapon: " Claws " })])?.weapon, SS.spitefulStrikeRule([ability(true)])?.weapon, SS.spitefulStrikeRule([{ type: "ability", name: "Bite", flags: {} }]), SS.spitefulStrikeRule([{ type: "ability", name: "Undead Spawn", flags: { "trg-prime": { creatureAbility: { derives: { undeadSpawn: true } } } } }])], ["Claws", "", null, null]);
equal("S2 the named weapon, else the first; none without a weapon",
  [SS.spitefulWeapon([bite, claws], "claws")?.name, SS.spitefulWeapon([bite, claws], "")?.name, SS.spitefulWeapon([bite, claws], "Tail")?.name, SS.spitefulWeapon([{ type: "ability", name: "x" }], "")], ["Claws", "Bite", "Bite", null]);
equal("S3 half the damage, rounded down, capped at its maximum; above 0 it survives",
  [SS.spitefulHeal(9, 123), SS.spitefulHeal(1, 123), SS.spitefulHeal(0, 123), SS.spitefulHeal(400, 123), SS.spitefulHeal(-5, 123)],
  [{ heal: 4, survives: true, hp: 4 }, { heal: 0, survives: false, hp: 0 }, { heal: 0, survives: false, hp: 0 }, { heal: 200, survives: true, hp: 123 }, { heal: 0, survives: false, hp: 0 }]);
const wf = read("module", "spiteful-strike-workflow.mjs");
ok("W1 the Strike spends the reaction, is made, and is measured on the targets' HP",
  /await spendReaction\(actor, "Spiteful Strike", \{ traits: "attack" \}\);\s*const \{ rollWeaponAttack \} = await import\("\.\/combat\/attack-workflow\.mjs"\);\s*await rollWeaponAttack\(actor, weapon\);\s*const dealt = targets\.reduce/.test(wf));
ok("W2 the Strike is made as it stood: its death's conditions are lifted first, and put back only if it is destroyed",
  /for \(const key of \["dead", "dying", "unconscious", "prone"\]\) if \(actor\.statuses\?\.has\?\.\(key\)\) await actor\.toggleStatusEffect\(key, \{ active: false \}\);\s*const \{ spendReaction \}/.test(wf)
  && /if \(!outcome\.survives\) \{\s*if \(lying\.prone\)[\s\S]{0,250}if \(lying\.dying\) await actor\.toggleStatusEffect\("dying", \{ value: lying\.dying \}\);\s*if \(lying\.dead\) await actor\.toggleStatusEffect\("dead", \{ active: true, overlay: true \}\);/.test(wf));
ok("W2b above 0 HP the HP is written, THEN its death's conditions come off (3.663.2), and it rejoins the encounter",
  /\} else \{\s*await actor\.update\(\{ "system\.resources\.hp\.value": outcome\.hp \}\);[\s\S]{0,400}?for \(const key of \["dead", "dying", "unconscious", "prone"\]\) if \(actor\.statuses\?\.has\?\.\(key\)\) await actor\.toggleStatusEffect\(key, \{ active: false \}\);\s*lines\.push/.test(wf) && /createEmbeddedDocuments\("Combatant"/.test(wf));
ok("W3 the button is pressed once, by its owner or the GM", /if \(data\.used\) \{ btn\.disabled = true; return; \}/.test(wf) && /if \(!\(game\.user\?\.isGM \|\| message\.isOwner\)\)/.test(wf) && /await message\.setFlag\(SYSTEM_ID, CARD_FLAG, \{ \.\.\.data, used: true \}\);/.test(wf));
const ch = read("module", "codex-hooks-workflow.mjs");
ok("H1 the kill offers it, and the button is wired at start-up",
  /await harvestNearbyDeath\(victim\);[\s\S]{0,300}await offerSpitefulStrike\(victim\);/.test(ch) && /registerSpitefulStrike\(\)/.test(ch));

const EXPECTED = 9;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block33: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block33: ${checks} checks\n  all pass\n`);
