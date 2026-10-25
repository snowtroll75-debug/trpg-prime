#!/usr/bin/env node
/**
 * mutate-stance-declarations — the mutation half of verify-stance-declarations.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SD = m("stance-declarations.mjs"), CO = m("conditionals.mjs"), DD = m("combat", "defence-dc.mjs"), MA = m("combat", "magical-attacks.mjs");
const AW = m("combat", "attack-workflow.mjs"), ACW = m("combat", "action-workflow.mjs"), AL = m("alchemical-workflow.mjs");
const CK = m("dice", "check.mjs"), DG = m("apps", "check-dialog.mjs"), FW = m("feats-workflow.mjs");
const MUTATIONS = [
  { name: "a disabled stance counts", file: SD, from: "  if (!effect || effect.disabled) return false;", to: "  if (!effect) return false;", breaks: "A1" },
  { name: "any effect is a stance", file: SD, from: "  return Boolean(effect.flags?.[SYSTEM_ID]?.[STANCE_EFFECT_FLAG]);", to: "  return true;", breaks: "A2" },
  { name: "a single gated object is read", file: SD, from: "  return Array.isArray(raw) ? raw : [];", to: "  return Array.isArray(raw) ? raw : raw ? [raw] : [];", breaks: "A4" },
  { name: "gated conditionals are read out of a stance", file: CO, from: "      const gated = stanced ? stanceGatedRows(document, \"stanceConditionals\") : [];", to: "      const gated = stanceGatedRows(document, \"stanceConditionals\");", breaks: "B1" },
  { name: "gated conditionals are never read", file: CO, from: "      const gated = stanced ? stanceGatedRows(document, \"stanceConditionals\") : [];", to: "      const gated = [];", breaks: "B2" },
  { name: "an item with only gated rows is skipped", file: CO, from: "      if (!Array.isArray(plain) && !gated.length) continue;", to: "      if (!Array.isArray(plain)) continue;", breaks: "B4" },
  { name: "gated defence rows are read out of a stance", file: DD, from: "    if (!stanced) return;\n", to: "", breaks: "C1" },
  { name: "gated defence rows need a scope", file: DD, from: "{ id: document.id, name: document.name }, { stanceGated: true });", to: "{ id: document.id, name: document.name });", breaks: "C1" },
  { name: "the stance waiver frees every row", file: DD, from: "  if (!stanceGated && !actions.length", to: "  if (false && !actions.length", breaks: "C2" },
  { name: "the attacker's traits are ignored", file: DD, from: "    if ((entry.sourceTraits ?? []).length && !entry.sourceTraits.some((t) => traits.includes(t))) return false;\n", to: "", breaks: "C3" },
  { name: "a trait string is not split", file: DD, from: "  const traits = (Array.isArray(attackerTraits) ? attackerTraits : String(attackerTraits ?? \"\").split(/[,;]/))", to: "  const traits = (Array.isArray(attackerTraits) ? attackerTraits : [])", breaks: "C4" },
  { name: "traits alone are not scope", file: DD, from: " && !sourceTraits.length && !notSourceUuids.length) return null;", to: " && !notSourceUuids.length) return null;", breaks: "C5" },
  { name: "the target-trait axis is not matched", file: CO, from: "  if (wantedTargetTraits && !wantedTargetTraits.some((t) => targetTraits.includes(t))) return false;\n", to: "", breaks: "D1" },
  { name: "the target-trait exclusion is ignored", file: CO, from: "  if (excludes(excluded.targetTraits, targetTraits)) return false;\n", to: "", breaks: "D2" },
  { name: "the trait list is not folded", file: MA, from: "      targetTraits: (Array.isArray(raw.targetTraits) ? raw.targetTraits : []).map((t) => String(t ?? \"\").trim().toLowerCase()).filter(Boolean)", to: "      targetTraits: (Array.isArray(raw.targetTraits) ? raw.targetTraits : []).map((t) => String(t ?? \"\").trim()).filter(Boolean)", breaks: "E1" },
  { name: "magical against every target", file: MA, from: "    if ((d.targetTraits ?? []).length && !d.targetTraits.some((t) => traits.includes(t))) continue;\n", to: "", breaks: "E2" },
  { name: "the weapon attack drops the target's traits", file: AW, from: "    targetTraits: creatureTraits(targetActor?.system ?? {}),\n    // MELEE OR RANGED", to: "    // MELEE OR RANGED", breaks: "F1" },
  { name: "the defender is not told the attacker's traits", file: AW, from: "attackerAlignments, creatureTraits(actor.system ?? {}))", to: "attackerAlignments)", breaks: "F2" },
  { name: "the magical test is not told the target's traits", file: AW, from: ", targetTraits: creatureTraits(targetActor?.system ?? {}) }))", to: " }))", breaks: "F3" },
  { name: "an action's dialog drops the traits", file: ACW, from: "      targetTypes: creatureTypesOf(targetActor?.system ?? {}),\n      targetTraits: creatureTraits(targetActor?.system ?? {}),", to: "      targetTypes: creatureTypesOf(targetActor?.system ?? {}),", breaks: "F4" },
  { name: "a static-DC action hides the attacker's traits", file: ACW, from: "actor?.uuid ?? \"\", [], creatureTraits(actor?.system ?? {}));", to: "actor?.uuid ?? \"\");", breaks: "F5" },
  { name: "a bomb hides the thrower's traits", file: AL, from: "alignedTraitsOf(actor.system ?? {}),\n      creatureTraits(actor.system ?? {})\n    );", to: "alignedTraitsOf(actor.system ?? {})\n    );", breaks: "F6" },
  { name: "the check forgets the target's traits", file: CK, from: "          targetTraits: check.targetTraits,\n", to: "", breaks: "F7" },
  { name: "the dialog forgets the target's traits", file: DG, from: "attackMode, targetTraits, attackForm, attackGroup, rangeBand, targetStates,\n", to: "attackMode, attackForm, attackGroup, rangeBand, targetStates,\n", breaks: "F8" },
  { name: "modules cannot enter stances", file: FW, from: "  enterStance: (actor, item, options = {}) => enterFeatStance(actor, item, options),\n", to: "", breaks: "F9" },
  { name: "a module's flags can unmake the stance", file: FW, from: "        ...(flags && typeof flags === \"object\" ? flags : {}),\n        [FEAT_STANCE_FLAG]: true,\n        [FEAT_SOURCE_FLAG]: item.id,", to: "        [FEAT_STANCE_FLAG]: true,\n        [FEAT_SOURCE_FLAG]: item.id,\n        ...(flags && typeof flags === \"object\" ? flags : {}),", breaks: "F10" },
  { name: "modules cannot arm a move", file: m("module-api-workflow.mjs"), from: "        return armCompoundLeg(actor, clean, String(label || \"Move\"));\n", to: "        return false;\n", breaks: "F12" },
  { name: "a free move always provokes", file: m("module-api-workflow.mjs"), from: "          provokes: leg.provokes !== false\n        };", to: "          provokes: true\n        };", breaks: "F12" },
  { name: "modules cannot strike", file: m("module-api-workflow.mjs"), from: "      rollWeaponAttack: async (...args) => (await import(\"./combat/attack-workflow.mjs\")).rollWeaponAttack(...args),\n", to: "", breaks: "F13" },
  { name: "modules cannot ask the trait rules", file: m("module-api-workflow.mjs"), from: "      traitGate: async (...args) => (await import(\"./traits-workflow.mjs\")).traitGate(...args),\n", to: "", breaks: "F14" },
  { name: "a stance entered reports nothing", file: FW, from: "    ...extraLines\n  ]);\n  return true;\n}", to: "    ...extraLines\n  ]);\n}", breaks: "F11" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-stance-declarations.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-stance-declarations: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-stance-declarations: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-stance-declarations: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
