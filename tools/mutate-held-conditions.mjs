#!/usr/bin/env node
/** mutate-held-conditions — the mutation half of verify-held-conditions. NEW at 3.686.0 (H17). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const HC = m("conditions", "held-conditions.mjs"), HW = m("conditions", "held-conditions-workflow.mjs"), SE = m("magic", "spell-effects.mjs"),
  FW = m("feats-workflow.mjs"), EW = m("magic", "emanation-workflow.mjs"), IW = m("injury-workflow.mjs"), RW = m("rest", "rest-workflow.mjs"),
  XW = m("combat", "exhaustion-workflow.mjs"), CA = m("codex-actions-workflow.mjs"), API = m("module-api-workflow.mjs"),
  TP = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), FIX = path.join(SYSTEM_ROOT, "tools", "ea-block8a-core-fixes.mjs"),
  RLW = m("combat", "target-relay-workflow.mjs"), CRW = m("magic", "counteract-relay-workflow.mjs"), RL = m("combat", "target-relay.mjs"), CR = m("magic", "counteract-row.mjs"),
  TO = m("magic", "turn-options-workflow.mjs"), IH = m("magic", "item-healing-workflow.mjs");
const MUTATIONS = [
  { name: "P1 a zero value is kept", file: HC, from: "    if (v > 0) values[k] = v;", to: "    values[k] = v;", breaks: "P1" },
  { name: "P1b endWith is always on", file: HC, from: "endWith: raw.endWith === true,", to: "endWith: true,", breaks: "P1b/P3d" },
  { name: "P2 a disabled effect still holds", file: HC, from: "  if (!effect || effect.disabled) return null;", to: "  if (!effect) return null;", breaks: "P2" },
  { name: "P3 the end takes off everything", file: HC, from: "const to = Math.max(0, Math.min(from, Math.max(kept, from - value)));", to: "const to = 0;", breaks: "P3/D5" },
  { name: "P3c another hold's share is ignored", file: HC, from: "const to = Math.max(0, Math.min(from, Math.max(kept, from - value)));", to: "const to = Math.max(0, from - value);", breaks: "P3c/D5b" },
  { name: "P4 counteractAs forgets the DC", file: HC, from: "  return { targetLevel: pp, dc: dc > 0 ? dc : null };", to: "  return { targetLevel: pp, dc: null };", breaks: "P4" },
  { name: "D1 reduceCondition ignores a hold", file: FW, from: "    if (actorConditionHeld(actor, key)) return { from, to: from, floor: from, held: true };\n", to: "", breaks: "D1" },
  { name: "D2 the floor ignores a hold", file: EW, from: "  if (actorConditionHeld(actor, condition)) {\n    floor = Math.max(floor,", to: "  if (false) {\n    floor = Math.max(floor,", breaks: "D2" },
  { name: "D3 the injury clock runs on a held injury", file: IW, from: "    if (actorConditionHeld(actor, key)) continue;\n", to: "", breaks: "D3" },
  { name: "W3 Fast Healing lowers a held injury", file: IW, from: "  if (actorConditionHeld(actor, \"injured\")) return 0;\n", to: "", breaks: "W3" },
  { name: "D4 the hourly save lowers a held fatigue", file: XW, from: "  const heldDown = delta < 0 && actorConditionHeld(actor, \"fatigued\");", to: "  const heldDown = false;", breaks: "D4" },
  { name: "D4b a hold stops a Fumble's rise too", file: XW, from: "  const heldDown = delta < 0 && actorConditionHeld(actor, \"fatigued\");", to: "  const heldDown = actorConditionHeld(actor, \"fatigued\");", breaks: "D4b" },
  { name: "D6 every client lowers it", file: HW, from: "    if (!isActingClientFor(actor)) return;\n", to: "", breaks: "D6/W8" },
  { name: "D6 the hook never lowers", file: HW, from: "    settleEndedHold(actor, effect).catch(", to: "    Promise.resolve(null).catch(", breaks: "D5/D6" },
  { name: "W1 relief ignores a hold", file: SE, from: "            if (holds.length) {\n              lines.push(line(heldRefusedLine(", to: "            if (false) {\n              lines.push(line(heldRefusedLine(", breaks: "W1" },
  { name: "W2 a night's rest clears held fatigue", file: RW, from: "ate && drank && !actorConditionHeld(actor, \"fatigued\")) {", to: "ate && drank) {", breaks: "W2" },
  { name: "W2 a night's rest lowers held Soul Drain", file: RW, from: "FULL_NIGHT_HOURS && !actorConditionHeld(actor, \"soulDrain\")) {", to: "FULL_NIGHT_HOURS) {", breaks: "W2" },
  { name: "W4 a creature ability heals a held injury", file: CA, from: "    if (actorConditionHeld(actor, key)) {\n      lines.push", to: "    if (false) {\n      lines.push", breaks: "W4" },
  { name: "W5 a counteract by name takes a held condition", file: SE, from: " && !actorConditionHeld(target, c), traitedRows);", to: ", traitedRows);", breaks: "W5" },
  { name: "W6 the counteract check is not prefilled", file: SE, from: "            const result = await rollCounteractCheck(caster, knownAs ? { targetLevel: knownAs.targetLevel, dc: knownAs.dc } : {});", to: "            const result = await rollCounteractCheck(caster);", breaks: "W6" },
  { name: "W7 the hook is not registered", file: TP, from: "  registerHeldConditionHooks();\n", to: "", breaks: "W7" },
  { name: "W9 no helper for modules", file: API, from: "      conditionHeld: async (actor, key) => (await import(\"./conditions/held-conditions.mjs\")).actorConditionHeld(actor, key),\n", to: "", breaks: "W9" },
  { name: "X1 Remove Curse counteracts any effect", file: FIX, from: "traits: [\"curse\"], limit: 1, label: \"Remove Curse\"", to: "traits: [\"fear\"], limit: 1, label: \"Remove Curse\"", breaks: "X1/X3" },
  { name: "K1 the counteract never relays", file: RLW, from: "  if (direct || !needsRelay(target)) { await effect.delete(); return true; }", to: "  { await effect.delete(); return true; }", breaks: "K2" },
  { name: "K2 the relay sends no traits", file: RLW, from: "{ effectId: String(effectId), traits: (traits ?? []).map(String) }", to: "{ effectId: String(effectId), traits: [] }", breaks: "K2" },
  { name: "K3 the GM deletes whatever it is asked", file: CRW, from: "  if (!counteractReachesEffect(traits, { id: effect.id, name: effect.name, sourceTraits })) return false;\n", to: "", breaks: "K3" },
  { name: "K3b the relay's GM side is not the check", file: RLW, from: "      return counteractEffectAsGM(target, effectId, traits);", to: "      return Boolean(await target.effects?.get?.(effectId)?.delete?.()) || true;", breaks: "K6" },
  { name: "K3 the relay handler ignores the answer", file: RL, from: "return removed ? { ok: true, result: true } : { ok: false, reason: \"that effect is not one this counteract can reach\" };", to: "return { ok: true, result: true };", breaks: "K3" },
  { name: "K4 any traits reach any effect", file: CR, from: "  return counteractCandidates(spec, () => false, [{ ...row, statuses: [] }]).length > 0;", to: "  return true;", breaks: "K3/K4" },
  { name: "K5 the counteract deletes directly again", file: SE, from: "                if (!await counteractEffectOn(target, candidate.key, spec.traits)) {", to: "                await target.effects?.get?.(candidate.key)?.delete?.(); if (false) {", breaks: "K5" },
  { name: "H1 conditionRemove ignores the hold", file: SE, from: "            if (heldNow(target, key)) {", to: "            if (false) {", breaks: "H1/H1b/H2" },
  { name: "H1b the hold's refusal is followed by \"had no\"", file: SE, from: "          if (gone.length || !refusedHeld) lines.push(line(gone.length", to: "          lines.push(line(gone.length", breaks: "H1b" },
  { name: "H3 Renewal's Touch ignores the hold", file: TO, from: "  const refused = await heldRefusal(actor, option);\n  if (refused) return refused;\n", to: "", breaks: "H3" },
  { name: "H3b Renewal's Touch spends the AP first", file: TO, from: "    const refused = await heldRefusal(actor, btn.dataset.option);", to: "    const refused = \"\";", breaks: "H3b" },
  { name: "H4 the rune offers a held condition", file: IH, from: "      const held = standing.filter((c) => !actorConditionHeld(target, c));", to: "      const held = standing;", breaks: "H4" },
  { name: "D4c the held fatigue card says a reduction", file: XW, from: "    if (heldDown) lines.push(", to: "    if (false) lines.push(", breaks: "D4c" },
  { name: "D4c the held fatigue returns the lowered value", file: XW, from: "  const result = heldDown ? current : next;", to: "  const result = next;", breaks: "D4c" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-held-conditions.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-held-conditions: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-held-conditions: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-held-conditions: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
