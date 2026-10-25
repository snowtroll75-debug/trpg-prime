#!/usr/bin/env node
/** mutate-block2-core — the mutation half of verify-block2-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const OA = m("combat", "one-attack.mjs"), AW = m("combat", "attack-workflow.mjs"), ACW = m("combat", "action-workflow.mjs"), RL = m("combat", "target-relay.mjs"), RLW = m("combat", "target-relay-workflow.mjs"), FW = m("feats-workflow.mjs"), SB = m("magic", "save-bonus-reactions.mjs"), CK = m("dice", "check.mjs"), DD = m("combat", "defence-dc.mjs"), CB = m("documents", "combat.mjs"), GS = m("general-skill-options.mjs"), CC = m("create-crafting.mjs"), WZ = m("combat", "ward-zone.mjs"), WZW = m("combat", "ward-zone-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"), UW = m("uses-workflow.mjs");
const MUTATIONS = [
  { name: "Maintain Clarity's Fumble is queued twice", file: ACW, from: "      const modifier = readsGenericModifier(action) ? extractModifier(outcome.text) : null;", to: "      const modifier = extractModifier(outcome.text);", breaks: "H6" },
  { name: "a module's row is read for healing", file: ACW, from: "      healAmount = readsText ? extractHealAmount(outcome.text) : null;", to: "      healAmount = extractHealAmount(outcome.text);", breaks: "H6" },
  { name: "every module action is told to clear nothing by hand", file: ACW, from: "      if (durationRounds && !game.combat?.started && applied.length) {", to: "      if (durationRounds && !game.combat?.started) {", breaks: "H5" },
  { name: "a turn ends silently", file: CB, from: "    Hooks.callAll(\"trgPrimeTurnEnded\", { actor, combatant, combat: this });\n", to: "", breaks: "H3" },
  { name: "Steady Heart breaks the Korath's floor", file: FW, from: "    const to = Math.max(0, from - Math.max(0, Math.trunc(Number(by) || 0)), floor);", to: "    const to = Math.max(0, from - Math.max(0, Math.trunc(Number(by) || 0)));", breaks: "H4" },
  { name: "the day turns over silently", file: UW, from: "  Hooks.callAll(\"trgPrimeDailyPreparation\", { actor });\n", to: "", breaks: "H2" },
  { name: "a defence watching one attacker is spent by anyone", file: OA, from: "  if (spec.fromUuids?.length && !spec.fromUuids.includes(String(event.attackerUuid ?? \"\"))) return false;\n", to: "", breaks: "A9b" },
  { name: "an object with no keys is no declaration", file: OA, from: "    : actions.length ? null : \"attack\";", to: "    : null;", breaks: "A1" },
  { name: "a DB defence is spent by an action too", file: OA, from: "  if (kind === \"action\") return spec.actions.includes(lower(event.actionKey));", to: "  if (kind === \"action\") return true;", breaks: "A2" },
  { name: "Impact Absorption is spent by a spell", file: OA, from: "  if (spec.against === \"weapon\") return kind === \"weapon\";", to: "  if (spec.against === \"weapon\") return ATTACK_KINDS.includes(kind);", breaks: "A3" },
  { name: "a disabled effect is spent", file: OA, from: "    if (!effect?.id || effect.disabled) continue;", to: "    if (!effect?.id) continue;", breaks: "A5" },
  { name: "THE DEFECT: a Strike leaves the bonus behind", file: AW, from: "    await consumeOneAttackEffects(targetActor, { kind: \"weapon\", attackerUuid: actor?.uuid ?? \"\" });\n", to: "", breaks: "A6" },
  { name: "a spell attack leaves it behind", file: CW, from: "    await consumeOneAttackEffects(targetActor, { kind: \"spell\", attackerUuid: actor?.uuid ?? \"\" });\n", to: "", breaks: "A7" },
  { name: "a Shove leaves Root the Body behind", file: ACW, from: "    await consumeOneAttackEffects(targetActor, { kind: \"action\", actionKey: action.key, attackerUuid: actor?.uuid ?? \"\" });\n", to: "", breaks: "A8" },
  { name: "the GM's client trusts the asker's list", file: RL, from: "      const removed = await deps.consumeOneAttack(target, event);", to: "      const removed = await deps.consumeOneAttack(target, payload.effects ?? event);", breaks: "A9" },
  { name: "an unowned defender is written directly", file: RLW, from: "  if (direct || !needsRelay(target)) {\n    await target.deleteEmbeddedDocuments(\"ActiveEffect\", ids);", to: "  if (true) {\n    await target.deleteEmbeddedDocuments(\"ActiveEffect\", ids);", breaks: "A10" },
  { name: "Nimble Dodge lasts for ever again", file: FW, from: "        flags: { [SYSTEM_ID]: { oneAttack: true } },\n", to: "", breaks: "A11" },
  { name: "Nimble Dodge spends no reaction again", file: FW, from: "      if (inCombat) await spendReaction(actor, \"Nimble Dodge\");\n", to: "", breaks: "A11" },
  { name: "a reaction with no skill is accepted", file: SB, from: "  if (!skill) return null;\n", to: "", breaks: "B1" },
  { name: "Steel the Mind answers any save", file: SB, from: "    if (e.saves.length && !e.saves.includes(key)) return false;\n", to: "", breaks: "B2" },
  { name: "Steel the Mind answers any effect", file: SB, from: "    if (e.traits.length && !e.traits.some((t) => carried.includes(t))) return false;\n", to: "", breaks: "B2" },
  { name: "a negative Bonus Check takes away", file: SB, from: "  return Math.max(0, Math.trunc(Number(bonusCheckValue) || 0));", to: "  return Math.trunc(Number(bonusCheckValue) || 0);", breaks: "B3" },
  { name: "the save never asks", file: CK, from: "        if (bonus) check.modifiers.push({ label: bonus.label, value: bonus.value, type: bonus.type });", to: "        void bonus;", breaks: "B4" },
  { name: "the reaction is spent before the answer", file: SB, from: "  if (!taken) return null;\n  if (inCombat) await spendReaction(actor, entry.label);", to: "  if (inCombat) await spendReaction(actor, entry.label);\n  if (!taken) return null;", breaks: "B5" },
  { name: "a list of DCs matches nothing again", file: DD, from: "    if (entry.dc !== \"any\" && !againsts.includes(entry.dc)) return false;", to: "    if (entry.dc !== \"any\" && entry.dc !== against) return false;", breaks: "C1" },
  { name: "the Dying Check has no scope", file: CB, from: "      actionKey: \"dyingCheck\",\n", to: "", breaks: "D1" },
  { name: "a declared ladder is never read", file: GS, from: "  return TIME_LADDERS[actionKey] ?? declaredTimeLadder(action);", to: "  return TIME_LADDERS[actionKey] ?? null;", breaks: "E3" },
  { name: "a rung with no cost is accepted", file: GS, from: "    if (!key || !label || !Number.isInteger(modifier) || !apCost) return null;", to: "    if (!key || !label) return null;", breaks: "E2" },
  { name: "a default outside the rungs is accepted", file: GS, from: "  if (!options.some((o) => o.key === defaultKey)) return null;\n", to: "", breaks: "E2" },
  { name: "the workflow ignores the action's ladder", file: ACW, from: "  const baseLadder = skipDialog(event) ? null : timeLadder(action.key, action);", to: "  const baseLadder = skipDialog(event) ? null : timeLadder(action.key);", breaks: "E4" },
  { name: "the action's traits are dropped again", file: CC, from: "  return [...new Set([...own, ...(alchemical ? [alchemical] : [])])].join(\", \");", to: "  return alchemical;", breaks: "F1" },
  { name: "any damage type is a ward", file: WZ, from: "  if (!WARD_DAMAGE_TYPES.includes(damageType)) return null;\n", to: "", breaks: "G1" },
  { name: "a Blunder still grants resistance", file: WZ, from: "  const field = spec.weakness ? \"weaknesses\" : \"resistances\";", to: "  const field = \"resistances\";", breaks: "G2" },
  { name: "leaving the circle keeps the resistance", file: WZ, from: "    remove: [...now].filter((u) => !want.has(u))", to: "    remove: []", breaks: "G3" },
  { name: "every client writes the occupants", file: WZW, from: "  if (!scene || !isActingGM()) return Promise.resolve();", to: "  if (!scene) return Promise.resolve();", breaks: "G4" },
  { name: "the ward never expires", file: WZW, from: "  if (Number(seconds) > 0) {", to: "  if (false) {", breaks: "G6" },
  { name: "a token moving does not resync", file: WZW, from: "  Hooks.on(\"updateToken\", (token, change) => {", to: "  Hooks.on(\"updateTokenX\", (token, change) => {", breaks: "G7" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block2-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block2-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block2-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block2-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
