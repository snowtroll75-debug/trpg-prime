#!/usr/bin/env node
/** mutate-turn-end-clock — the mutation half of verify-turn-end-clock (3.707.2). */
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
const MUTATIONS = [
  { name: "P never marked", file: ED, from: "    if (turns !== null && UNTIL_YOUR_TURN_END.test(String(text ?? \"\"))) {", to: "    if (false) {" },
  { name: "P the target's turn marked too", file: ED, from: "const UNTIL_YOUR_TURN_END = /until the end of your next turn/i;", to: "const UNTIL_YOUR_TURN_END = /until the end of (?:your|its|their) next turn/i;" },
  { name: "C out of an encounter too", file: ED, from: "  if (!parsed?.untilTurnEnd || !inCombat) return null;", to: "  if (!parsed?.untilTurnEnd) return null;" },
  { name: "C the backstop two rounds", file: ED, from: "const TURN_END_BACKSTOP_SECONDS = 18;", to: "const TURN_END_BACKSTOP_SECONDS = 12;" },
  { name: "S the cast's own turn ends it", file: ED, from: "  return String(stamp?.castTurn ?? \"\") !== String(endingTurn);", to: "  return true;" },
  { name: "S anybody's turn ends it", file: ED, from: "  if (!of || !turnOfUuid || of !== String(turnOfUuid)) return false;", to: "  if (!of || !turnOfUuid) return false;" },
  { name: "C the round clock kept", file: SE, from: "    out.expiresRound = null;\n    out.spellEffectEnd = atTurnEnd.backstopEnd;", to: "    out.spellEffectEnd = atTurnEnd.backstopEnd;" },
  { name: "C the caster never stamped", file: SE, from: "    if (parsedDuration?.untilTurnEnd && caster?.uuid) parsedDuration.turnEndOf = caster.uuid;", to: "" },
  { name: "W the ward's writer drops it", file: SE, from: "          if (timing.turnEndOf) effectFlags[SYSTEM_ID].endsAtTurnEndOf = timing.turnEndOf;", to: "" },
  { name: "C the sheet shows the backstop", file: SE, from: "  if (effect?.flags?.[SYSTEM_ID]?.endsAtTurnEndOf) return \"Until the end of the caster's next turn\";", to: "" },
  { name: "S the sweep never reads it", file: EA, from: "    if (!dueAtTurnEnd(effect.getFlag?.(SYSTEM_ID, TURN_END_FLAG), { turnOfUuid, endingTurn })) continue;", to: "    if (true) continue;" },
  { name: "S the sweep reads the round after", file: CB, from: "round: context?.round ?? this.round, combatantId: combatant.id })) {", to: "round: this.round + 1, combatantId: combatant.id })) {" },
  { name: "R the condition writer drops it", file: EA, from: "  if (endsAtTurnEndOf?.of) updates[`flags.${SYSTEM_ID}.${TURN_END_FLAG}`] = { of: String(endsAtTurnEndOf.of), castTurn: String(endsAtTurnEndOf.castTurn ?? \"\") };", to: "" },
  { name: "R the relay does not carry it", file: TRW, from: "\"endsAtTurnStartOf\", \"endsAtTurnEndOf\"]) {", to: "\"endsAtTurnStartOf\"]) {" },
  { name: "F no turn clock is a local rule", file: ED, from: "  if (end && typeof end.of === \"string\" && end.of) return true;", to: "  if (false) return true;" },
  { name: "F the start-of-turn clock is not", file: ED, from: "  return typeof start === \"string\" && start.length > 0;", to: "  return false;" },
  { name: "F a round clock counts too", file: ED, from: "export function keepsOwnTurnClock(flags) {\n", to: "export function keepsOwnTurnClock(flags) {\n  if (flags?.conditionExpiresRound) return true;\n" },
  { name: "F the helper always toggles", file: EA, from: "  if (!ruled.length) {\n    await actor.toggleStatusEffect(\"flatFooted\", { active: false });", to: "  if (true) {\n    await actor.toggleStatusEffect(\"flatFooted\", { active: false });" },
  { name: "F the untimed one kept beside a clocked one", file: EA, from: "    if (ruled.includes(effect) || effect.statuses?.size !== 1) continue;", to: "    continue;" },
  { name: "F the clocked one deleted beside an untimed one", file: EA, from: "    if (ruled.includes(effect) || effect.statuses?.size !== 1) continue;", to: "    if (effect.statuses?.size !== 1) continue;" },
  { name: "F _onEndTurn back to the blanket toggle", file: CB, from: "    if (actor.hasCondition?.(\"flatFooted\")) await shedFlatFootedAtTurnEnd(actor);", to: "    if (actor.hasCondition?.(\"flatFooted\")) await actor.toggleStatusEffect(\"flatFooted\", { active: false });" },
  { name: "R the GM's client trusts the object whole", file: TR, from: "          ? { of: carried.endsAtTurnEndOf.of, castTurn: String(carried.endsAtTurnEndOf.castTurn ?? \"\") }", to: "          ? carried.endsAtTurnEndOf" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-turn-end-clock.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-turn-end-clock: verify-turn-end-clock already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-turn-end-clock: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-turn-end-clock: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
