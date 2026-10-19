#!/usr/bin/env node
/**
 * mutate-session-decisions-1015 — the mutation half of verify-session-decisions-1015 (3.646.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const EF = m("combat", "effect-application-workflow.mjs"), RW = m("combat", "target-relay-workflow.mjs"), RL = m("combat", "target-relay.mjs"), OPP = m("combat", "opportunity.mjs");
const CSS = path.join(SYSTEM_ROOT, "styles", "trg-prime.css");
const AW = m("combat", "action-workflow.mjs"), AT = m("combat", "attack-workflow.mjs"), GM = m("combat", "gm-authorisation.mjs"),
  CA = m("creature-auras.mjs"), AL = m("ally-aura-effects.mjs"), BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const MUTATIONS = [
  { name: "Ready fires with no reaction left", file: AW, from: "if (blocked || left < 1) {", to: "if (blocked) {", breaks: "D1a" },
  { name: "a readied action spends no reaction", file: AW, from: "          await consumeReadiedAction(actor);\n          await spendActionCost(actor, \"reaction\", \"Ready\", { traits: storedAction.traits ?? \"\" });\n", to: "          await consumeReadiedAction(actor);\n", breaks: "D1b" },
  { name: "a readied cast spends no reaction", file: AW, from: "            await consumeReadiedAction(actor);\n            await spendActionCost(actor, \"reaction\", \"Ready\", { traits: spell.system?.traits ?? \"\" });\n", to: "            await consumeReadiedAction(actor);\n", breaks: "D1c" },
  { name: "the GM's no is ignored", file: AT, from: "    if (!(await requestGMAuthorisation(actor, what))) return null;", to: "    await requestGMAuthorisation(actor, what);", breaks: "D2a" },
  { name: "an off-turn swing pays AP", file: AT, from: "} else if (!isReaction && !apPaid && !offTurnFree) {", to: "} else if (!isReaction && !apPaid) {", breaks: "D2b" },
  { name: "a timeout counts as a yes", file: GM, from: "  return allowed === true;", to: "  return allowed !== false;", breaks: "D2c" },
  { name: "every GM answers", file: GM, from: "if (data?.action !== ASK || !isActingGM()) return;", to: "if (data?.action !== ASK || !game.user?.isGM) return;", breaks: "D2d" },
  { name: "the listener is never registered", file: BOOT, from: "  registerGMAuthorisation();\n", to: "", breaks: "D2e" },
  { name: "includeSelf is not read", file: CA, from: "    includeSelf: kind === \"ally\" && raw.includeSelf === true,", to: "    includeSelf: false,", breaks: "D3a" },
  { name: "an unowned creature's conditions are written locally", file: EF, from: "  if (!direct && actor && actor.isOwner === false) {", to: "  if (false) {", breaks: "D4a" },
  { name: "the GM's re-entry relays again", file: RW, from: "applyConditionTags(target, tags, { ...options, direct: true }),", to: "applyConditionTags(target, tags, options),", breaks: "D4a" },
  { name: "the cast id is dropped on the GM's side", file: RL, from: "        castId: carried.castId ?? null,\n", to: "", breaks: "D4c" },
  { name: "the offer is GM-only again", file: OPP, from: "whisper: [...new Set([...ChatMessage.getWhisperRecipients(\"GM\").map((u) => u.id), ...reactorOwners])],", to: "whisper: ChatMessage.getWhisperRecipients(\"GM\").map((u) => u.id),", breaks: "D5" },
  { name: "Ready is free", file: AW, from: "      await spendActionCost(actor, action.apCost, action.name, { traits: action.traits });\n      await readyActionAndEndTurn", to: "      await readyActionAndEndTurn", breaks: "D6" },
  { name: "the fist comes first", file: AW, from: "      .sort((a, b) => Number(Boolean(a.system?.natural)) - Number(Boolean(b.system?.natural)));", to: ";", breaks: "D7" },
  { name: "the Endeavour buttons sit in one row again", file: CSS, from: "  flex-direction: column;\n  align-items: stretch;\n  gap: 4px;\n}", to: "  gap: 4px;\n}", breaks: "D8" },
  { name: "the Endeavour buttons are held to 28px again", file: CSS, from: "  height: auto;\n  min-height: 26px !important;", to: "  min-height: 26px !important;", breaks: "D8" },
  { name: "the source never stands in its aura", file: AL, from: "        if (self && !aura.includeSelf) continue;", to: "        if (self) continue;", breaks: "D3b" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-session-decisions-1015.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-session-decisions-1015: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-session-decisions-1015: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-session-decisions-1015: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
