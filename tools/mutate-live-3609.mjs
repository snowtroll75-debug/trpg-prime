#!/usr/bin/env node
/**
 * mutate-live-3609 — can verify-live-3609 fail?
 *
 * NEW at 3.609.1. Each mutation puts back one of the nine shipped defects
 * the 3.609.0 drive found, and (3.609.2) the three the 3.609.1 drive found. SURVIVED and an unmatched anchor are both
 * failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const LADDER = at("module", "magic", "recurring-ladder-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const FLOW = at("module", "magic", "emanation-workflow.mjs");
const EFFECTS = at("module", "magic", "spell-effects.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const GATE = at("module", "combat", "sanctuary-gate.mjs");
const CHOICE = at("module", "magic", "area-choice.mjs");
const CONDITIONALS = at("module", "conditionals.mjs");
const SPELL_CONDITIONAL = at("module", "magic", "spell-conditional.mjs");
const TEMPLATE = at("module", "magic", "spell-template.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const VERIFY = at("tools", "verify-live-3609.mjs");

const MUTATIONS = [
  { file: LADDER, name: "F1 — the critical has no target again",
    from: "          targetActor: actor,\n          damageType: spec.damageType,",
    to: "          damageType: spec.damageType,", breaks: "A1" },
  { file: LADDER, name: "F1 — the saving creature rolls its own critical",
    from: "        await rollCriticalInjury(caster ?? actor, {", to: "        await rollCriticalInjury(actor, {", breaks: "A2" },
  { file: CAST, name: "F2 — Turn Undead's circle asks the entry save again",
    from: "        save: spellSavesOnTurnStart(spellData.effects) ? null : emanationSave(spellData),",
    to: "        save: emanationSave(spellData),", breaks: "B1" },
  { file: FLOW, name: "F3 — the write-back reconciles, and the emanation hangs",
    from: "await recordEmanation(actor, entry.id, { ...emanation, tested }, { reconcile: false });",
    to: "await recordEmanation(actor, entry.id, { ...emanation, tested });", breaks: "C3/C4" },
  { file: FLOW, name: "F3 — the switch is ignored",
    from: "  if (!descriptor?.frozen && reconcile) {", to: "  if (!descriptor?.frozen) {", breaks: "C2" },
  { file: EFFECTS, name: "F4 — the hold is never stamped",
    from: "          if (effect.hold) {\n", to: "          if (false) {\n", breaks: "D3" },
  { file: COMBAT, name: "F4 — the turn spends a held stun",
    from: "    if (stunned && acting.canAct && stunHold > 0 && regain.stunnedRemaining < stunHold) {",
    to: "    if (false) {", breaks: "D5" },
  { file: CHOICE, name: "F5 — area-choice rows keyed by the sheet again",
    from: "  return text(a?.uuid || a?.id);", to: "  return text(a?.id);", breaks: "E1/E3" },
  { file: GATE, name: "F5 — an unlinked opponent is remembered by its sheet",
    from: "  return tokenId ? `token-${tokenId}` : String(attacker?.id ?? \"\");",
    to: "  return String(attacker?.id ?? \"\");", breaks: "E5" },
  { file: CONDITIONALS, name: "F6 — a read-back universal grant is dropped",
    from: "  const always = Boolean(when.always || raw.always === true);",
    to: "  const always = Boolean(when.always);", breaks: "F2/F3/F4" },
  { file: CONDITIONALS, name: "F6 — any top-level truthy `always` counts",
    from: "  const always = Boolean(when.always || raw.always === true);",
    to: "  const always = Boolean(when.always || raw.always || true);", breaks: "F5" },
  { file: SPELL_CONDITIONAL, name: "F6 — disadvantage is called advantage",
    from: "  const behind = others.filter((g) => String(g.kind) === \"disadvantage\");",
    to: "  const behind = [];", breaks: "F6" },
  { file: TEMPLATE, name: "F7 — a burst is an emanation again",
    from: "/emanation/.test(word) ? \"emanation\" : /burst/.test(word) ? \"burst\" : \"radius\"",
    to: "/emanation|burst/.test(word) ? \"emanation\" : \"radius\"", breaks: "G1" },
  { file: TEMPLATE, name: "F7 — every burst centres on the caster",
    from: "    || (config.shape === \"burst\" && !(Number(rangeFeet) > 0)));",
    to: "    || config.shape === \"burst\");", breaks: "G4" },
  { file: CAST, name: "F8 — the Save DC reads only the spell's defence",
    from: "    const castDefence = effDefence ?? spellData.defence;", to: "    const castDefence = spellData.defence;", breaks: "H1" },
  { file: CAST, name: "F8 — the terrain loop reads the spell's rows",
    from: "      for (const row of (effEffects ?? [])) {\n        if (row?.kind !== \"difficultTerrain\"",
    to: "      for (const row of (spellData.effects ?? [])) {\n        if (row?.kind !== \"difficultTerrain\"", breaks: "H3/H4" },
  { file: ACTOR, name: "F9 — the ceiling ignores the allowance",
    from: "      + (key === \"ap\" ? Math.max(0, Number(apAllowance) || 0) : 0)\n",
    to: "\n", breaks: "I1" },
  { file: EFFECTS, name: "F9 — Time Stop grants no allowance",
    from: "            [`flags.${SYSTEM_ID}.apOverflow`]: overflow + extra\n",
    to: "\n", breaks: "I3" },
  { file: COMBAT, name: "F9 — the allowance is never cleared",
    from: "      [`flags.${SYSTEM_ID}.apOverflow`]: deletionValue(),\n", to: "", breaks: "I5" },
  { file: EFFECTS, name: "F9 — the secret roll is public again",
    from: "            { rollMode: CONST.DICE_ROLL_MODES?.BLIND ?? \"blindroll\" }).catch(() => {});",
    to: "            {}).catch(() => {});", breaks: "I6" },
  // 3.609.2 — the 3.609.1 drive's three.
  { file: ATTACK, name: "G1 — the Strike reads the data from before the ward gate",
    from: "    ...(actor.system.combat?.attack?.checkModifiers ?? [", to: "    ...(system.combat?.attack?.checkModifiers ?? [", breaks: "J1" },
  { file: CAST, name: "G2 — the save path gets the spell's own rows",
    from: "        effects: effEffects,\n        // AND ITS OWN ALTERNATIVE", to: "        // AND ITS OWN ALTERNATIVE", breaks: "J2" },
  { file: CAST, name: "G3 — the clean-up reads the spell's rows and deletes the mud",
    from: "shouldClearAreaRegion(placedArea?.regionId, { effects: effEffects },",
    to: "shouldClearAreaRegion(placedArea?.regionId, spellData,", breaks: "J3" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-live-3609 does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}
let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) { console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`); unmatched++; continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
    else console.log(`  caught    ${m.name}`);
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}
process.stdout.write(survived + unmatched
  ? `\nmutate-live-3609: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-live-3609: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
