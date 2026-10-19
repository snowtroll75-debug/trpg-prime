#!/usr/bin/env node
/**
 * mutate-haunt-perils — the mutation half of verify-haunt-perils.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const PERIL = m("peril.mjs"), EFFECT = m("peril-effect.mjs"), WF = m("peril-workflow.mjs"), ACTION = m("combat", "action-workflow.mjs");
const ATTACK = m("combat", "attack-workflow.mjs"), ACT = m("creature-activation-workflow.mjs"), SPELL = m("magic", "spell-effects.mjs");
const WARP = m("magic", "spell-warp.mjs"), RELAY = m("combat", "target-relay.mjs"), API = m("module-api.mjs"), DIALOG = m("apps", "check-dialog.mjs");
const MUTATIONS = [
  { name: "the disabled fields look live", file: path.join(SYSTEM_ROOT, "styles", "trg-prime.css"), from: "  opacity: 0.45;\n  cursor: not-allowed;", to: "  cursor: not-allowed;", breaks: "H7" },
  { name: "the time left is minutes again", file: PERIL, from: "  if (s >= 3600 && s % 3600 === 0) return plural(s / 3600, \"hour\");", to: "", breaks: "H1" },
  { name: "an 'As Fumble' line says nothing of the Fumble", file: EFFECT, from: "  if (as && inherited && !/^As\\s/i.test(inherited)) text =", to: "  if (false) text =", breaks: "H2" },
  { name: "a blank rung prints nothing", file: WF, from: "  const unaffected = !outcome.text && !outcome.rows.length && !damageRoll && !rungFormula;", to: "  const unaffected = false;", breaks: "H3" },
  { name: "a Secret outcome is posted for all", file: ACTION, from: "lines, { ...cardOptions, secret: Boolean(secretRollMode(action)) });", to: "lines, { ...cardOptions, secret: false });", breaks: "H6" },
  { name: "the old fields stay live under a line", file: path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs"), from: "      context.perilDetectionByLine = Boolean(String(system.gm?.peril?.detection ?? \"\").trim());", to: "      context.perilDetectionByLine = false;", breaks: "H5" },
  { name: "a group's skills do not share its DC", file: PERIL, from: "    for (const n of named) {", to: "    for (const n of named.slice(-1)) {", breaks: "A1" },
  { name: "a Rank is ignored", file: PERIL, from: "      out.push({ ...n, dc: Number(m[1]), minRank: m[3] ? Number(m[3]) : 0 });", to: "      out.push({ ...n, dc: Number(m[1]), minRank: 0 });", breaks: "A1" },
  { name: "the whole segment is read, prose and earlier sentences too", file: PERIL, from: "    const clause = segment.split(/[.;]/).pop() ?? segment;", to: "    const clause = segment;", breaks: "A3" },
  { name: "a Lore is not a specialist skill", file: PERIL, from: "  for (const m of rest.matchAll(lore)) found.push({ at: m.index, skill: `lore:${slugifyKey(m[1])}`, label: m[1] });", to: "", breaks: "A3" },
  { name: "Performance is not Perform", file: PERIL, from: "const SKILL_ALIASES = Object.freeze({ performance: \"perform\", \"power manipulation\": \"powerManipulation\" });", to: "const SKILL_ALIASES = Object.freeze({});", breaks: "A2" },
  { name: "the legacy skill is lost", file: PERIL, from: "  if (parsed.length) return parsed;\n  return [{ skill: p.detectionSkill,", to: "  return parsed;\n  return [{ skill: p.detectionSkill,", breaks: "A5" },
  { name: "the hardest DC is used", file: PERIL, from: "  return entries.filter((e) => perilEntryMatches(e, skillKey)).sort((a, b) => a.dc - b.dc)[0] ?? null;", to: "  return entries.filter((e) => perilEntryMatches(e, skillKey)).sort((a, b) => b.dc - a.dc)[0] ?? null;", breaks: "B1" },
  { name: "a specialist skill never answers", file: PERIL, from: "  if (key.startsWith(\"specialist:\")) {", to: "  if (key.startsWith(\"specialist:\") && false) {", breaks: "B2" },
  { name: "Dispel uses the Disable DC on a haunt", file: PERIL, from: "    return { ok: true, reason: \"\", dc: perilCounteractable(p) ? perilCounteract(p, level).dc : (p.disableDC || null) };", to: "    return { ok: true, reason: \"\", dc: p.disableDC || null };", breaks: "B3" },
  { name: "the Counteract DC ignores the level", file: PERIL, from: "  return { level: lvl, dc: p.counteractDC || levelDC(lvl) };", to: "  return { level: lvl, dc: p.counteractDC || 14 };", breaks: "B4" },
  { name: "a haunt is disabled, not suppressed", file: PERIL, from: "  const suppresses = counteract || p.onDisable === \"suppressed\";", to: "  const suppresses = counteract;", breaks: "C1" },
  { name: "the suppression has no clock", file: PERIL, from: "    suppressedUntil: step.done && suppresses ? (Number(span) > 0 ? Number(now) + Number(span) : null) : p.suppressedUntil", to: "    suppressedUntil: step.done && suppresses ? null : p.suppressedUntil", breaks: "C1" },
  { name: "a Counteract banks successes", file: PERIL, from: "  const counteract = mode === \"counteract\" && perilCounteractable(p);", to: "  const counteract = false;", breaks: "C4" },
  { name: "a spell's forced rung is not honoured", file: PERIL, from: "done: force || [\"heroic\", \"critical\", \"success\"].includes(key) }", to: "done: [\"heroic\", \"critical\", \"success\"].includes(key) }", breaks: "C5" },
  { name: "a suppressed haunt can still be triggered", file: PERIL, from: "const PERIL_INACTIVE = Object.freeze([\"disabled\", \"suppressed\", \"resolved\", \"broken\", \"destroyed\"]);", to: "const PERIL_INACTIVE = Object.freeze([\"disabled\", \"broken\", \"destroyed\"]);", breaks: "C6" },
  { name: "an expired suppression is never re-armed", file: PERIL, from: "  return p.state === \"suppressed\" && p.suppressedUntil !== null && Number(now) >= p.suppressedUntil;", to: "  return false;", breaks: "C7" },
  { name: "Reset Immediately leaves it triggered", file: PERIL, from: "  if (p.actionType !== \"complex\" && /^\\s*immediately\\b/i.test(p.reset)) return \"armed\";", to: "", breaks: "C8" },
  { name: "the no-body mark is ignored", file: PERIL, from: "  if (actor?.system?.gm?.peril?.noBody === true) return true;", to: "", breaks: "C9" },
  { name: "every peril has a body", file: PERIL, from: "  return !(Number(actor?.system?.resources?.hp?.max ?? 0) > 0);", to: "  return false;", breaks: "C9" },
  { name: "a radius is ignored", file: EFFECT, from: "    scope: radiusM && everyone ? \"area\" : \"targets\",", to: "    scope: \"targets\",", breaks: "D1" },
  { name: "the deaf are not immune", file: EFFECT, from: "    immuneIf: /\\bdeaf creature is immune\\b/i.test(all) ? [\"deafened\"] : [],", to: "    immuneIf: [],", breaks: "D1" },
  { name: "Frightened in a run takes the clock", file: EFFECT, from: "        const timed = chain.length > 1 ? chain.filter((f) => f.row.key !== \"frightened\") : chain;", to: "        const timed = chain;", breaks: "D2" },
  { name: "prose between does not keep the clock", file: EFFECT, from: "      if (last && !sentence.slice(last.end, clock.index).trim()) {", to: "      if (last) {", breaks: "D3" },
  { name: "only the nearest condition is timed", file: EFFECT, from: "          if (/^\\s*(?:,|and|,\\s*and)\\s*$/i.test(sentence.slice(before[i].end, chain[0].at))) chain.unshift(before[i]); else break;", to: "          break;", breaks: "D3" },
  { name: "'or worse' reaches only the rung named", file: EFFECT, from: "    const span = m[3] === \"worse\" ? LADDER.slice(at) : m[3] === \"better\" ? LADDER.slice(0, at + 1) : [LADDER[at]];", to: "    const span = [LADDER[at]];", breaks: "D4" },
  { name: "the basic flag is lost", file: EFFECT, from: "    basic: Boolean(saveM?.[1]),", to: "    basic: false,", breaks: "D5" },
  { name: "the overflow is not read", file: EFFECT, from: "    if (from && into) spec.overflow =", to: "    if (false) spec.overflow =", breaks: "D6" },
  { name: "any clause after 'As Fumble' times what it inherits", file: EFFECT, from: "      const clock = /^\\s*(?:for|until)\\b/i.test(rest) ? clockOf(rest.split(/(?<=\\.)\\s+/)[0] ?? \"\") : {};", to: "      const clock = clockOf(rest.split(/(?<=\\.)\\s+/)[0] ?? \"\");", breaks: "D9" },
  { name: "an automation's chosen creatures are ignored", file: WF, from: "  }\n  const { actors, note } = effectTargets(peril, spec, targets);", to: "  }\n  const { actors, note } = effectTargets(peril, spec);", breaks: "F20" },
  { name: "'As Fumble' inherits nothing", file: EFFECT, from: "      rows = resolveRung(as[1].toLowerCase(), seen).map((r) => ({ ...r }));", to: "      rows = [];", breaks: "D7" },
  { name: "an increase ignores what is held", file: EFFECT, from: "    let next = Number(held(row.key) || 0) + Number(row.increase);", to: "    let next = Number(row.increase);", breaks: "E3" },
  { name: "no cap on an increase", file: EFFECT, from: "    if (overflow && overflow.key === row.key && next > overflow.cap) {", to: "    if (false) {", breaks: "E3" },
  { name: "the bonuses never reach the dialog", file: ACTION, from: "      extraConditionals: perilTarget?.bonuses ?? []", to: "      extraConditionals: []", breaks: "F1" },
  { name: "the dialog drops the extra conditionals", file: DIALOG, from: "              ...(Array.isArray(extraConditionals) ? extraConditionals : [])", to: "              ...[]", breaks: "F1" },
  { name: "Dispel banks as a Disable", file: WF, from: "    mode: action.key === \"dispel\" ? \"counteract\" : \"disable\"", to: "    mode: \"disable\"", breaks: "F3" },
  { name: "a bodiless peril can be struck", file: ATTACK, from: "    if (targetActor && perilHasNoBody(targetActor)) {", to: "    if (false) {", breaks: "F5" },
  { name: "a routine action is only a card", file: ACT, from: "  if (routine !== null) return routine;", to: "", breaks: "F6" },
  { name: "the warp's suppression is ignored", file: SPELL, from: "          const ladder = { ...(effect.suppress ?? {}), ...(warpMods?.perilSuppress ?? {}) };", to: "          const ladder = { ...(effect.suppress ?? {}) };", breaks: "F7" },
  { name: "the warp mod is dropped", file: WARP, from: "    if (m.perilSuppress && typeof m.perilSuppress === \"object\") mods.perilSuppress = { ...m.perilSuppress };", to: "", breaks: "F8" },
  { name: "the relay loses the force", file: RELAY, from: "force: payload.force === true };", to: "force: false };", breaks: "F9" },
  { name: "an automation without a function is accepted", file: API, from: "  const ok = key && (typeof spec?.trigger === \"function\" || typeof spec?.use === \"function\");", to: "  const ok = Boolean(key);", breaks: "F13" },
  { name: "Trigger ignores a suppression", file: WF, from: "  const can = perilCanAct(raw, now());", to: "  const can = { ok: true };", breaks: "F16" },
  { name: "a resolved peril resets", file: WF, from: "  if (p.state === \"resolved\") {", to: "  if (false) {", breaks: "F19" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-haunt-perils.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-haunt-perils: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-haunt-perils: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-haunt-perils: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
