#!/usr/bin/env node
/**
 * mutate-ff30-block25 — the mutation half of verify-ff30-block25 (3.658.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RO = m("rogue.mjs"), CA = m("creature-auras.mjs"), SW = m("aura-switch.mjs"), CAW = m("creature-aura-workflow.mjs"), ACT = m("creature-activation.mjs"), ACTW = m("creature-activation-workflow.mjs"), AFTER = m("combat", "declared-after-strikes-workflow.mjs");
const MUTATIONS = [
  { name: "printed dice hide Sneak Attack (what 3.657.0 did)", file: RO, from: "  return hasClassAbility(actor, \"Sneak Attack\") || Array.from(", to: "  return hasClassAbility(actor, \"Sneak Attack\") || false && Array.from(", breaks: "B1" },
  { name: "any parenthesis is Sneak Attack", file: RO, from: "const SNEAK_PRINTED = /^sneak attack\\s*\\(\\s*\\d+d6\\s*\\)$/;", to: "const SNEAK_PRINTED = /^sneak attack\\s*\\(.*\\)$/;", breaks: "B1" },
  { name: "a Blunder reads nothing", file: CA, from: "const DEGREE_FALLBACK = Object.freeze({ heroic: \"critical\", blunder: \"fumble\" });", to: "const DEGREE_FALLBACK = Object.freeze({ heroic: \"critical\" });", breaks: "B2" },
  { name: "the ladder's criticals are dropped", file: CA, from: "    criticals: normaliseDegreeCriticals(raw.criticals),", to: "    criticals: null,", breaks: "B2" },
  { name: "a malformed rung is kept", file: CA, from: "    if (/^\\d+d\\d+(\\s*[+-]\\s*\\d+)?$/i.test(f)) out[k] = f;", to: "    if (f) out[k] = f;", breaks: "B3" },
  { name: "a ladder alone is not rolled", file: CA, from: " || aura?.damageByDegree || aura?.criticals || aura?.traitEffect", to: " || aura?.traitEffect", breaks: "B4" },
  { name: "the switch never runs out", file: SW, from: "    if (!rec?.state || !(Number(rec.until) > t)) continue;", to: "    if (!rec?.state) continue;", breaks: "B6" },
  { name: "a disabled switch still counts", file: SW, from: "    if (!e || e.disabled) continue;", to: "    if (!e) continue;", breaks: "B6" },
  { name: "the switch's span is lost", file: SW, from: "  return { state: sw.state, until: Math.trunc(Number(now) || 0) + sw.seconds };", to: "  return { state: sw.state, until: Math.trunc(Number(now) || 0) };", breaks: "B5" },
  { name: "the Use button is not offered", file: ACT, from: "own.compound || own.auraSwitch)) return true;", to: "own.compound)) return true;", breaks: "B8" },
  { name: "the switch does not reach the emitter", file: CAW, from: "        ...auraSwitchStates(Array.from(token.actor?.effects ?? []), Number(game.time?.worldTime ?? 0))\n", to: "", breaks: "S1" },
  { name: "the ladder is never applied", file: CAW, from: "  if (aura.damageByDegree || aura.criticals) {\n", to: "  if (false) {\n", breaks: "S1" },
  { name: "the Use is a bare card", file: ACTW, from: "  if (auraSwitchOf(item)) return useAuraSwitch(actor, item, lines);", to: "", breaks: "S2" },
  { name: "the Codex's rider keeps the claws' out (what 3.658.0 did)", file: AFTER, from: "    else if (specs[at].weaponNames.length && !specs[at].weaponNames.includes(String(weapon.name ?? \"\").trim().toLowerCase())) specs[at] = spec;\n", to: "", breaks: "S3" },
  { name: "the ladder is called Unaffected", file: CAW, from: "!aura.damage && !aura.damageByDegree && !aura.criticals && !auraTraitEffectLands", to: "!aura.damage && !auraTraitEffectLands", breaks: "S4" },
  { name: "the darkness goes unmentioned", file: ACTW, from: "emitted?.traits?.includes(\"darkness\") ?", to: "false ?", breaks: "S4" },
  { name: "a second use stacks a second effect", file: ACTW, from: "  if (old.length) await actor.deleteEmbeddedDocuments(\"ActiveEffect\", old);\n", to: "", breaks: "S2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block25.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block25: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block25: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block25: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
