#!/usr/bin/env node
/**
 * mutate-block35b — can verify-block35b fail?
 *
 * NEW at 3.614.0. Each mutation breaks one of the channels block 35's second
 * part built, or puts back the 3.613.0 drive's F1. SURVIVED and an unmatched
 * anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const STASIS = at("module", "magic", "stasis.mjs");
const STASISF = at("module", "magic", "stasis-workflow.mjs");
const DYING = at("module", "combat", "dying-workflow.mjs");
const APPLY = at("module", "combat", "effect-application-workflow.mjs");
const LINKED = at("module", "combat", "linked-conditions-workflow.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const REACT = at("module", "magic", "save-reaction-spells.mjs");
const CHECK = at("module", "dice", "check.mjs");
const ZEAL = at("module", "combat", "zealous-battlecry.mjs");
const TURN = at("module", "magic", "turn-options.mjs");
const HEAL = at("module", "magic", "damage-heal.mjs");
const EMAN = at("module", "magic", "emanation.mjs");
const EMANFX = at("module", "magic", "emanation-effects.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const METAL = at("module", "magic", "material-shift.mjs");
const FX = at("module", "magic", "spell-effects.mjs");
const PLANF = at("tools", "block35b-plan.mjs");
const VERIFY = at("tools", "verify-block35b.mjs");

const MUTATIONS = [
  // A — R2
  { file: STASIS, name: "R2 — the stasis freezes its own clock too",
    from: "  return Boolean(stasis) && effect?.id !== stasis.id;", to: "  return Boolean(stasis);", breaks: "A3" },
  { file: STASIS, name: "R2 — a success ends the stasis outright",
    from: '  if (degree?.success) return "shorten";', to: '  if (degree?.success) return "end";', breaks: "A4" },
  { file: STASIS, name: "R2 — the frozen clocks do not move on",
    from: '  bump("conditionExpiresRound", elapsed?.rounds ?? 0);', to: "", breaks: "A6" },
  { file: DYING, name: "R2 — a creature in stasis takes damage",
    from: '    return { case: "stasis", newHP: Number(actor.system?.resources?.hp?.value ?? 0) };\n', to: "", breaks: "A8" },
  { file: APPLY, name: "R2 — the round clock runs out a frozen condition",
    from: "  const stasis = stasisEffectOf(effects);\n\n  for (const effect of effects) {\n    if (frozenByStasis(effect, stasis)) continue;\n",
    to: "  const stasis = stasisEffectOf(effects);\n\n  for (const effect of effects) {\n", breaks: "A9" },
  { file: LINKED, name: "R2 — the world-time conditions run out regardless",
    from: "    if (frozenByStasis(effect, stasis)) continue;\n", to: "", breaks: "A9" },
  { file: COMBAT, name: "R2 — a creature in stasis takes its turn",
    from: "      const said = await stasisTurnStart(actor);", to: "      const said = null;", breaks: "A10" },
  { file: STASISF, name: "R2 — a creature in stasis can be moved",
    from: "    ui.notifications.warn(`${doc.name} is in stasis and cannot be moved.`);\n    return false;",
    to: "    ui.notifications.warn(`${doc.name} is in stasis and cannot be moved.`);\n    return true;", breaks: "A11" },

  // B — R6
  { file: REACT, name: "R6 — any source opens the window",
    from: "  return Boolean(key) && window?.key === key && window?.moment === moment;",
    to: "  return Boolean(key) && window?.moment === moment;", breaks: "B2" },
  { file: REACT, name: "R6 — a worse modifier is offered",
    from: "  if (diff <= 0) return null;", to: "  if (diff < -100) return null;", breaks: "B3" },
  { file: CHECK, name: "R6 — Unity is never offered",
    from: "      const unity = await offerUnity(check);", to: "      const unity = null;", breaks: "B4" },

  // C — R7
  { file: ZEAL, name: "R7 — both take the lower die",
    from: "  const die = Math.max(Number(a.die), Number(b.die));", to: "  const die = Math.min(Number(a.die), Number(b.die));", breaks: "C1" },
  { file: COMBAT, name: "R7 — the pair is never settled",
    from: "    await settleZealousBattlecry(this);\n", to: "", breaks: "C4" },

  // D — R8
  { file: TURN, name: "R8 — the bleeding warp buys nothing",
    from: "    bleed: int(raw.bleed) ? int(raw.bleed) + int(warpMods?.bleedBump) : 0,",
    to: "    bleed: int(raw.bleed),", breaks: "D2" },
  { file: TURN, name: "R8 — the unlocked options are always offered",
    from: "  for (const [name, map] of Object.entries(raw.unlockable ?? {})) if (unlocked.includes(name)) add(map);",
    to: "  for (const [name, map] of Object.entries(raw.unlockable ?? {})) add(map);", breaks: "D3" },
  { file: COMBAT, name: "R8 — the turn card is never offered",
    from: "      await offerTurnOptions(actor, this);\n", to: "", breaks: "D5" },

  // E — R9
  { file: HEAL, name: "R9 — every blow heals",
    from: "  if (spentKey && spentKey === nowKey) return \"spent\";\n", to: "", breaks: "E2" },
  { file: HEAL, name: "R9 — the dying are healed off the track",
    from: '  if (dying || dead) return "withheld";\n', to: "", breaks: "E2" },
  { file: EMAN, name: "R9 — the heal does not travel with the aura",
    from: '"heldBonus", "defence", "damageHeal"]);', to: '"heldBonus", "defence"]);', breaks: "E3" },
  { file: DYING, name: "R9 — nothing asks after the blow",
    from: "  await healAfterDamage(actor, hpBefore);\n", to: "", breaks: "E5" },

  // F — R10
  { file: FX, name: "R10 — the fruit keeps the pack's heal whatever was warped",
    from: "              heal.formula = warpedHealFormula(String(effect.healOnUse), warpMods ?? {});",
    to: "              heal.formula = String(effect.healOnUse);", breaks: "F2" },

  // G — R11
  { file: METAL, name: "R11 — the warp unlocks nothing",
    from: "  return unlocked ? [...BASE_METALS, ...WARP_METALS] : [...BASE_METALS];",
    to: "  return [...BASE_METALS];", breaks: "G1" },
  { file: METAL, name: "R11 — a claw becomes silver",
    from: "    && !item?.system?.natural && String(item?.system?.category ?? \"\").toLowerCase() !== \"unarmed\";",
    to: "    ;", breaks: "G3" },

  // H — R15
  { file: WARP, name: "R15 — the movement warp is dropped by the aggregator",
    from: "    if (m.morphMovement) mods.morphMovement = true;\n", to: "", breaks: "H1" },
  { file: PLANF, name: "R15 — the movement warp goes back to buying nothing",
    from: '{ ppCost: 2, text: "You instead gain a movement type from one of your Studied Targets", mods: { morphMovement: true } }',
    to: '{ ppCost: 2, text: "You instead gain a movement type from one of your Studied Targets", mods: {} }', breaks: "H1/J1" },

  // I — F1
  { file: FX, name: "F1 — 'finds nobody to affect' over a critical again",
    from: "if (!isDegreeGated(effect) && !isAttackGated(effect) && !reportsItsOwnAbsence(effect)) {",
    to: "if (!isDegreeGated(effect) && !reportsItsOwnAbsence(effect)) {", breaks: "I1" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-block35b: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-block35b: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block35b: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
