#!/usr/bin/env node
/**
 * mutate-ff30-block17 — the mutation half of verify-ff30-block17 (3.650.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CR = m("creature-reactions.mjs"), CRW = m("creature-reactions-workflow.mjs"), LD = m("magic", "lingering-damage.mjs"),
  CS = m("magic", "condition-save.mjs"), CSW = m("magic", "condition-save-workflow.mjs"), CN = m("conditionals.mjs"),
  DA = m("combat", "declared-after-strikes.mjs"), CHK = m("dice", "check.mjs"), DLG = m("apps", "check-dialog.mjs"),
  PEND = m("pending-modifiers.mjs"), ATK = m("combat", "attack-workflow.mjs"), PER = m("peril-workflow.mjs"),
  ACT = m("creature-activation-workflow.mjs"), CBT = m("documents", "combat.mjs"), MV = m("combat", "movement-workflow.mjs"),
  BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), CW = m("codex-actions-workflow.mjs");
const MUTATIONS = [
  { name: "the ranged axis is ignored", file: CN, from: "  if (wantedAttackModes && !wantedAttackModes.some((t) => attackModes.includes(t))) return false;\n", to: "", breaks: "B1" },
  { name: "the ranged axis cannot be excluded", file: CN, from: "  if (excludes(excluded.attackModes, attackModes)) return false;\n", to: "", breaks: "B2" },
  { name: "partialHolds is dropped in normalising", file: CS, from: "  if (raw.partialHolds === true) out.partialHolds = true;", to: "", breaks: "B3" },
  { name: "a Partial always escapes", file: CS, from: "  const succeeded = key === \"success\" || (key === \"partial\" && !spec.partialHolds);", to: "  const succeeded = key === \"success\" || key === \"partial\";", breaks: "B4" },
  { name: "a Fumble is never permanent", file: CS, from: "  if (spec.fumblePermanent && (key === \"fumble\" || key === \"blunder\")) return { ...nothing, permanent: true };", to: "", breaks: "B4" },
  { name: "a Partial holds for everyone", file: CS, from: "  const succeeded = key === \"success\" || (key === \"partial\" && !spec.partialHolds);", to: "  const succeeded = key === \"success\";", breaks: "B5" },
  { name: "the rung's escape save is lost", file: DA, from: "  if (row?.conditionSave && typeof row.conditionSave === \"object\") tag.conditionSave = { ...row.conditionSave };", to: "", breaks: "B6" },
  { name: "the record is not a basic save", file: LD, from: "basic: basic !== false, roundsLeft: left,", to: "basic: false, roundsLeft: left,", breaks: "B7" },
  { name: "a record with no rounds is kept", file: LD, from: "  if (!amt || !left || !SAVES.includes(s) || !t) return null;", to: "  if (!amt || !SAVES.includes(s) || !t) return null;", breaks: "B8" },
  { name: "a turn of no damage does not end it", file: LD, from: "  if (!(Number(dealt) > 0)) return null;\n", to: "", breaks: "B9" },
  { name: "the reaction move provokes", file: CR, from: "    provokes: raw.provokes === true,", to: "    provokes: raw.provokes !== false,", breaks: "B10" },
  { name: "the speed is always land", file: CR, from: "  const speedKey = SPEEDS.includes(String(raw.speedKey ?? \"\")) ? String(raw.speedKey) : \"land\";", to: "  const speedKey = \"land\";", breaks: "B10" },
  { name: "a reaction move of no feet is kept", file: CR, from: "  if (!feet) return null;\n  const speedKey", to: "  const speedKey", breaks: "B11" },
  { name: "a disabled aura still counts", file: CR, from: "  return Array.from(effects ?? []).some((e) => !e?.disabled && String", to: "  return Array.from(effects ?? []).some((e) => String", breaks: "B12" },
  { name: "the leg provokes", file: CR, from: "maxFeet: spec.feet, provokes: spec.provokes === true, label", to: "maxFeet: spec.feet, provokes: true, label", breaks: "B13" },
  { name: "any weapon may replace its injury", file: CR, from: "    if (!weapons.includes(want)) continue;\n", to: "", breaks: "B14" },
  { name: "unknown replacements are offered", file: CR, from: "  const options = (Array.isArray(raw.options) ? raw.options : []).filter((o) => REPLACEMENTS.includes(o));", to: "  const options = Array.isArray(raw.options) ? raw.options : [];", breaks: "B14" },
  { name: "the toggled effect sheds no light", file: CR, from: "  if (spec.lightSource) flags.lightSource = String(spec.lightSource);\n", to: "", breaks: "B15" },
  { name: "the attack mode never reaches the conditionals", file: CHK, from: "          attackMode: check.attackMode", to: "          attackMode: \"\"", breaks: "S1" },
  { name: "a scoped pending row is spent on any check", file: CHK, from: "        && (!Array.isArray(row.checkTypes) || !row.checkTypes.length || row.checkTypes.includes(check.type))\n", to: "", breaks: "S2" },
  { name: "the dialog pre-ticks it on any check", file: DLG, from: "${entry.auto && (!entry.checkTypes?.length || entry.checkTypes.includes(checkType)) ? \" checked\" : \"\"}", to: "${entry.auto ? \" checked\" : \"\"}", breaks: "S2" },
  { name: "immunity follows every save again", file: PER, from: "(!immunityRungs || immunityRungs.includes(key))", to: "true", breaks: "S3" },
  { name: "the rung's penalty never lands", file: PER, from: "    if (Array.isArray(penaltyRows) && penaltyRows.length) {", to: "    if (false) {", breaks: "S4" },
  { name: "the escape save has no DC", file: PER, from: "    for (const tag of tags) if (tag.conditionSave) tag.conditionSave = { label: title || peril.name, ...tag.conditionSave, saveDC: dc };\n", to: "", breaks: "S5" },
  { name: "the poison does not linger", file: PER, from: "        if (spec.lingering && record.damage > 0) {", to: "        if (false) {", breaks: "S6" },
  { name: "the lingering save is never rolled", file: CBT, from: "      for (const said of await applyLingeringDamage(actor)) lines.push(TRGCombat.#chatLine(said));", to: "", breaks: "S7" },
  { name: "the breath is used without the PP", file: ACT, from: "    if (ppCost > 0 && ppHeld < ppCost) {", to: "    if (false) {", breaks: "S8" },
  { name: "a petrification fumble keeps its clock", file: CSW, from: "      if (outcome.permanent) {", to: "      if (false) {", breaks: "S9" },
  { name: "the injury is rolled anyway", file: ATK, from: "  if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && !injuryReplaced && !noCriticalInjury) {", to: "  if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && !noCriticalInjury) {", breaks: "S10" },
  { name: "the miss offer goes back inside the fumble branch (what 3.650.0 shipped)", file: ATK, from: "  }\n\n  // A MISS THE DEFENDER MAY ANSWER BY MOVING", to: "\n  // A MISS THE DEFENDER MAY ANSWER BY MOVING", breaks: "S11" },
  { name: "no reaction is offered on a miss", file: ATK, from: "    await offerMissedReactions(targetActor, actor).catch(() => []);", to: "", breaks: "S11" },
  { name: "a Stride offers no adjacency reaction", file: MV, from: "  maybeOfferSwiftPursuit(tokenDocument, movement);\n  maybeOfferCreatureReactions(tokenDocument, movement);\n  return true;\n}", to: "  maybeOfferSwiftPursuit(tokenDocument, movement);\n  return true;\n}", breaks: "S12" },
  { name: "adjacency measured from the square the mover left (what 3.650.0 shipped)", file: CRW, from: "  const mover = moverAt(placed, at);", to: "  const mover = placed;", breaks: "S17" },
  { name: "the destination is not handed on", file: MV, from: ".then(({ offerAdjacentReactions }) => offerAdjacentReactions(doc, destination))", to: ".then(({ offerAdjacentReactions }) => offerAdjacentReactions(doc))", breaks: "S17" },
  { name: "the buttons are never bound", file: BOOT, from: "  registerCreatureReactionHooks();\n", to: "", breaks: "S13" },
  { name: "the toggle is not a Codex action", file: CW, from: "sweepingStrike, toggleEffect });", to: "sweepingStrike });", breaks: "S14" },
  { name: "the -2 is spent on any check", file: CRW, from: "oneShot: true, auto: true, checkTypes: [\"attack\"], turns:", to: "oneShot: true, auto: true, turns:", breaks: "S15" },
  { name: "the reaction is not spent", file: CRW, from: "    await spendReaction(actor, raw.spec.label);\n", to: "", breaks: "S16" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block17.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block17: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block17: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block17: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
