#!/usr/bin/env node
/** mutate-audit-3697 — the mutation half of verify-audit-3697 (the 3.697.0 core automation audit). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const FD = M("familiar-derive.mjs");
const AC = M("documents", "actor.mjs");
const FW = M("feats-workflow.mjs");
const MK = M("magic", "markers.mjs");
const CA = M("magic", "casting.mjs");
const SA = M("magic", "spell-adder.mjs");
const CW = M("magic", "cast-workflow.mjs");
const PR = M("data", "pack-repairs.mjs");
const DF = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  { name: "A Fast Movement gives the familiar speeds it does not have", file: FD, from: "    if (speedBase(movement?.[key]) <= 0) continue;\n", to: "" },
  { name: "A Fast Movement is worth 10 feet", file: FD, from: "const FAST_MOVEMENT_FEET = 15;", to: "const FAST_MOVEMENT_FEET = 10;" },
  { name: "A Fast Movement read under another name", file: FD, from: "hasFamiliarAbility(abilityNames, \"Fast Movement\")", to: "hasFamiliarAbility(abilityNames, \"Fast Move\")" },
  { name: "A Fast Movement typed, so it would not stack", file: FD, from: "value: FAST_MOVEMENT_FEET, type: \"untyped\"", to: "value: FAST_MOVEMENT_FEET, type: \"status\"" },
  { name: "A actor preparation never pools it", file: AC, from: "      for (const entry of entries) actor.addBonus(target, entry);\n    }\n    // A SOURCEBOOK'S FAMILIAR", to: "    }\n    // A SOURCEBOOK'S FAMILIAR" },
  { name: "B Energy Resistant has no Use", file: FW, from: "  \"energy resistant\": {\n    hint:", to: "  \"energy resistance\": {\n    hint:" },
  { name: "B Ability Enhancement has no Use", file: FW, from: "  \"ability enhancement\": {\n    hint:", to: "  \"ability enhancements\": {\n    hint:" },
  { name: "B Speak in Tongues has no Use", file: FW, from: "  \"speak in tongues\": {\n    hint:", to: "  \"speak with tongues\": {\n    hint:" },
  { name: "B General Adeptness has no Use", file: FW, from: "  \"general adeptness\": {\n    hint:", to: "  \"general adept\": {\n    hint:" },
  { name: "B Energy Resistant writes immunity", file: FW, from: "changes: [{ key: \"system.combat.resistances\", type: CHANGE_TYPE.ADD, value: `, ${labels[picked]}`, priority: 20 }]", to: "changes: [{ key: \"system.combat.immunities\", type: CHANGE_TYPE.ADD, value: `, ${labels[picked]}`, priority: 20 }]" },
  { name: "B Ability Enhancement overwrites the base score", file: FW, from: "key: `system.attributes.${picked}.other`, type: CHANGE_TYPE.ADD, value: \"1\"", to: "key: `system.attributes.${picked}.base`, type: CHANGE_TYPE.ADD, value: \"1\"" },
  { name: "B Speak in Tongues keeps the old pick as well", file: FW, from: "        .filter((n) => !previous || n.toLowerCase() !== String(previous).toLowerCase());", to: ";" },
  { name: "B General Adeptness offers every feat", file: FW, from: "String(e.system?.category ?? \"\").trim().toLowerCase() === \"general\" && !owned.has(normalise(e.name))", to: "!owned.has(normalise(e.name))" },
  { name: "B General Adeptness's feat has no source, so it outlives the ability", file: FW, from: "      foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {\n        sourceId: item.id, sourceName: item.name, requested: feat.name\n      });\n", to: "" },
  { name: "C longArm unregistered", file: MK, from: "  longArm: Object.freeze({", to: "  longArmX: Object.freeze({" },
  { name: "C innerFocus spent on first read", file: MK, from: "    applied: \"needs no focus item\",\n    reader: \"module/documents/actor.mjs\",\n    consumed: false", to: "    applied: \"needs no focus item\",\n    reader: \"module/documents/actor.mjs\",\n    consumed: true" },
  { name: "C reach ignores Long Arm", file: AC, from: "combat.reach = sizeEntry.reach + (findMarker(actor, \"longArm\") ? LONG_ARM_FEET : 0);", to: "combat.reach = sizeEntry.reach;" },
  { name: "C Long Arm is 10 feet", file: AC, from: "const LONG_ARM_FEET = 5;", to: "const LONG_ARM_FEET = 10;" },
  { name: "D the illusory focus never set", file: AC, from: "system.magic.focusIllusory = Boolean(findMarker(actor, \"innerFocus\"));", to: "system.magic.focusIllusory = false;" },
  { name: "D the check penalty kept", file: CA, from: "  if (!magic.focusReady && magic.focusIllusory) return null;\n", to: "" },
  { name: "D Inner Focus gives the +1", file: CA, from: "  if (!magic.focusReady && magic.focusIllusory) return null;\n", to: "  if (!magic.focusReady && magic.focusIllusory) return { label: \"Casting Focus\", value: 1, type: \"item\" };\n" },
  { name: "D the fumble penalty kept", file: CA, from: "  return magic?.focusCasting && !magic?.focusReady && !magic?.focusIllusory ? 10 : 0;", to: "  return magic?.focusCasting && !magic?.focusReady ? 10 : 0;" },
  { name: "E the owned-copy repair names a different marker", file: PR, from: "    to: [{ kind: \"marker\", target: \"self\", marker: \"longArm\" }],\n    reason: \"\\\"Increasing your reach", to: "    to: [{ kind: \"marker\", target: \"self\", marker: \"longArms\" }],\n    reason: \"\\\"Increasing your reach" },
  { name: "E the owned-copy repair for Inner Focus missing", file: PR, from: "    id: \"audit3697-inner-focus-effects\", pack: \"spells\", name: \"Inner Focus\",\n    field: \"effects\"", to: "    id: \"audit3697-inner-focus-effectsX\", pack: \"spells\", name: \"Inner Focus\",\n    field: \"effects\"" },
  { name: "E data-fixes declares a different Changing Lungs", file: DF, from: "          \"marker\": \"waterBreathing\"\n        },\n        {\n          \"kind\": \"note\",\n          \"text\": \"You also breathe", to: "          \"marker\": \"waterBreathingX\"\n        },\n        {\n          \"kind\": \"note\",\n          \"text\": \"You also breathe" },
  { name: "F Spell Battery read under another name", file: SA, from: "&& String(i.name ?? \"\").trim().toLowerCase() === \"spell battery\");", to: "&& String(i.name ?? \"\").trim().toLowerCase() === \"battery\");" },
  { name: "F Spell Battery ignores the 30 feet", file: SA, from: "    if (Number.isFinite(feet) && feet > SPELL_BATTERY_FEET) continue;\n", to: "" },
  { name: "F Spell Battery counts at 30 feet as out of range", file: SA, from: "feet > SPELL_BATTERY_FEET) continue;", to: "feet >= SPELL_BATTERY_FEET) continue;" },
  { name: "F an unmeasured familiar does not say the range is the table's", file: SA, from: "Spell Battery${Number.isFinite(feet) ? \"\" : \" (within 30 ft)\"}", to: "Spell Battery" },
  { name: "F an unmeasured familiar refused", file: SA, from: "    if (Number.isFinite(feet) && feet > SPELL_BATTERY_FEET) continue;", to: "    if (!Number.isFinite(feet) || feet > SPELL_BATTERY_FEET) continue;" },
  { name: "F the cast never asks the familiars", file: CW, from: "withWondrousAdders(withWondrousAdders(spellAdderSources(actor), wondrous), battery)", to: "withWondrousAdders(spellAdderSources(actor), wondrous)" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.712.1\"", to: "\"version\": \"3.696.3\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-audit-3697.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-audit-3697: verify-audit-3697 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-audit-3697: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-audit-3697: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
