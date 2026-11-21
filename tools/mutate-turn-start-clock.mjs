#!/usr/bin/env node
/** mutate-turn-start-clock — the mutation half of verify-turn-start-clock (3.707.1). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const ED = M("magic", "effect-duration.mjs");
const SE = M("magic", "spell-effects.mjs");
const EA = M("combat", "effect-application-workflow.mjs");
const CB = M("documents", "combat.mjs");
const TR = M("combat", "target-relay.mjs");
const TRW = M("combat", "target-relay-workflow.mjs");
const WD = M("magic", "ward.mjs");
const CW = M("magic", "cast-workflow.mjs");
const MUTATIONS = [
  { name: "P the phrase never marked", file: ED, from: "    if (turns !== null && UNTIL_YOUR_TURN_START.test(String(text ?? \"\"))) {", to: "    if (false) {" },
  { name: "P 'its next turn' marked too", file: ED, from: "export const UNTIL_YOUR_TURN_START = /until the (?:start|beginning) of your next turn/i;", to: "export const UNTIL_YOUR_TURN_START = /until the (?:start|beginning) of (?:your|its|their) next turn/i;" },
  { name: "C out of an encounter too", file: ED, from: "  if (!parsed?.untilTurnStart || !inCombat) return null;", to: "  if (!parsed?.untilTurnStart) return null;" },
  { name: "C the backstop a single round", file: ED, from: "export const TURN_START_BACKSTOP_SECONDS = 12;", to: "export const TURN_START_BACKSTOP_SECONDS = 6;" },
  { name: "C the round clock kept", file: SE, from: "    out.expiresRound = null;\n    out.spellEffectEnd = atTurnStart.backstopEnd;", to: "    out.spellEffectEnd = atTurnStart.backstopEnd;" },
  { name: "C the caster never stamped", file: SE, from: "    if (parsedDuration?.untilTurnStart && caster?.uuid) parsedDuration.turnStartOf = caster.uuid;", to: "" },
  { name: "W the ward's writer drops the stamp", file: SE, from: "          if (timing.turnStartOf) effectFlags[SYSTEM_ID].endsAtTurnStartOf = timing.turnStartOf;", to: "" },
  { name: "S any turn start ends it", file: EA, from: "  return Boolean(of) && Boolean(turnOfUuid) && of === String(turnOfUuid);", to: "  return Boolean(of) && Boolean(turnOfUuid);" },
  { name: "S the stamp never read", file: EA, from: "      endsAtTurnStartOf: effect.getFlag?.(SYSTEM_ID, TURN_START_FLAG)\n", to: "      endsAtTurnStartOf: null\n" },
  { name: "S the turn not named at the sweep", file: CB, from: "      for (const label of await expireTimedConditions(subject, this.round, { turnOf: actor })) {\n        // THE SENTENCE MOVED OUT AT 3.514.0", to: "      for (const label of await expireTimedConditions(subject, this.round)) {\n        // THE SENTENCE MOVED OUT AT 3.514.0" },
  { name: "R the condition writer drops it", file: EA, from: "  if (endsAtTurnStartOf) updates[`flags.${SYSTEM_ID}.${TURN_START_FLAG}`] = String(endsAtTurnStartOf);", to: "" },
  { name: "R the relay does not carry it", file: TRW, from: "\"sourceTraits\", \"endsAtTurnStartOf\"]) {", to: "\"sourceTraits\"]) {" },
  { name: "R the GM's client trusts any value", file: TR, from: "        endsAtTurnStartOf: typeof carried.endsAtTurnStartOf === \"string\" ? carried.endsAtTurnStartOf : null,", to: "        endsAtTurnStartOf: carried.endsAtTurnStartOf ?? null," },
  { name: "C the sheet shows the backstop", file: SE, from: "  if (effect?.flags?.[SYSTEM_ID]?.endsAtTurnStartOf) return \"Until the start of the caster's next turn\";", to: "" },
  { name: "F several foes allowed", file: WD, from: "  if (n === limit) return \"\";", to: "  if (n >= limit) return \"\";" },
  { name: "F none allowed", file: WD, from: "  if (n === 0) return `${spellName}: target the", to: "  if (n === 0) return \"\"; if (false) return `${spellName}: target the" },
  { name: "F the gate never refuses", file: CW, from: "    if (refusedFoes) {\n      ui.notifications.warn(refusedFoes);\n      return null;", to: "    if (refusedFoes) {\n      ui.notifications.warn(refusedFoes);" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-turn-start-clock.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-turn-start-clock: verify-turn-start-clock already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-turn-start-clock: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-turn-start-clock: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
