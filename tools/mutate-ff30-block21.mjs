#!/usr/bin/env node
/**
 * mutate-ff30-block21 — the mutation half of verify-ff30-block21 (3.654.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const DA = m("combat", "declared-after-strikes.mjs"), DAW = m("combat", "declared-after-strikes-workflow.mjs"), PE = m("peril-effect.mjs"), PW = m("peril-workflow.mjs"),
  CAR = m("creature-ability-rules.mjs"), CR = m("codex-action-rules.mjs"), CW = m("codex-actions-workflow.mjs"), AW = m("combat", "action-workflow.mjs"),
  MW = m("combat", "movement-workflow.mjs"), TS = m("creature-turn-start.mjs"), TW = m("creature-turn-start-workflow.mjs");
const MUTATIONS = [
  { name: "the choice is not read", file: DA, from: "  if (!expose && !save && !raw.selfHeal && raw.dispel !== true && !selfCondition && !castChoice) return null;", to: "  if (!expose && !save && !raw.selfHeal && raw.dispel !== true && !selfCondition) return null;", breaks: "B2" },
  { name: "blank spell names kept", file: DA, from: "    ? { spells: raw.castChoice.spells.map((n) => String(n ?? \"\").trim()).filter(Boolean),", to: "    ? { spells: raw.castChoice.spells.map((n) => String(n ?? \"\").trim()),", breaks: "B1" },
  { name: "the choice is never offered", file: DAW, from: "    if (spec.castChoice) lines.push(...await castChoiceFromStrike(actor, targetActor, spec));\n", to: "", breaks: "S3" },
  { name: "the spell is cast at its own DC", file: DAW, from: "presetTargets: Boolean(token), fixedDC: dc || null", to: "presetTargets: Boolean(token), fixedDC: null", breaks: "S3" },
  { name: "the immune creature takes the swap anyway", file: PE, from: ".has(type) ? swap : type;", to: " ? swap : type;", breaks: "B4" },
  { name: "the swap is ignored", file: PE, from: "  if (!swap || !type) return type;", to: "  return type;", breaks: "B4" },
  { name: "the area deals the immune type", file: PW, from: "applyTypedDamage(actor, { amount, type: takenType, ", to: "applyTypedDamage(actor, { amount, type: spec.damage.type, ", breaks: "S1" },
  { name: "the jump provokes after all", file: CAR, from: "noProvoke: j.noProvoke === true,", to: "noProvoke: false,", breaks: "B6" },
  { name: "junk jump prices read", file: CAR, from: "Number.isFinite(Number(j.ap)) && Number(j.ap) >= 0", to: "true", breaks: "B6" },
  { name: "the jump pays the printed AP", file: AW, from: "  if (ownJump) effectiveApCost = String(ownJump.ap);\n", to: "", breaks: "S4" },
  { name: "the +2 trade is offered anyway", file: AW, from: "  if (hasTradeoffs(action.key) && !ownJump && !skipDialog(event)) {", to: "  if (hasTradeoffs(action.key) && !skipDialog(event)) {", breaks: "S4" },
  { name: "the jump's move provokes", file: MW, from: "    const moverImmune = jumpAvoided || firstFree || Boolean(", to: "    const moverImmune = firstFree || Boolean(", breaks: "S4" },
  { name: "junk Constrict packets kept", file: CR, from: "    .filter((x) => /^\\d+d\\d+([+-]\\d+)?$/i.test(x.dice) && /^[a-z]+$/.test(x.type));", to: "    .filter((x) => x.dice);", breaks: "B7" },
  { name: "the acid is never rolled", file: CW, from: "    for (const extra of constrictExtraPackets(spec)) {\n      const xr", to: "    for (const extra of []) {\n      const xr", breaks: "S2" },
  { name: "the acid ignores the save", file: CW, from: "      const xAmount = Math.floor(xr.total * bs.damageMultiplier);", to: "      const xAmount = xr.total;", breaks: "S2" },
  { name: "the moonlight is not said", file: TS, from: "        ...(turnStart.condition ? { condition: String(turnStart.condition) } : {}),\n", to: "", breaks: "B9" },
  { name: "the card has no button", file: TW, from: "  const regenButton = a.kind === \"regeneration\" && a.amount > 0;", to: "  const regenButton = false;", breaks: "S5" },
  { name: "the button heals twice", file: TW, from: "  await message.setFlag(SYSTEM_ID, \"regenerate\", { ...spec, used: true });\n", to: "", breaks: "S5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block21.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block21: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block21: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block21: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
