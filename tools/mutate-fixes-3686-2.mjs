#!/usr/bin/env node
/**
 * mutate-fixes-3686-2 — can verify-fixes-3686-2 fail? (3.686.2)
 *
 * SURVIVED and an unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const TR = M("combat", "target-relay.mjs"), PS = M("party-socket.mjs"), TRW = M("combat", "target-relay-workflow.mjs");
const MIG = M("migration.mjs"), LINKED = M("combat", "linked-conditions-workflow.mjs"), MAT = M("magic", "material-shift-workflow.mjs");
const STASIS = M("magic", "stasis-workflow.mjs"), ENDS = M("magic", "end-save-workflow.mjs"), ALIGNED = M("aligned-control-workflow.mjs");
const RUNES = M("rune-timers-workflow.mjs"), SRUNE = M("magic", "spell-rune-workflow.mjs"), LSHIFT = M("magic", "light-shift-workflow.mjs");
const CWR = M("condition-writer.mjs"), COLLAPSE = M("combat", "ability-collapse-workflow.mjs"), ENC = M("encumbrance-workflow.mjs");
const RW = M("combat", "refocus-workflow.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json");
const GUARD = ") return; // one connection of the acting GM; with no GM, one owner (3.686.2)";

const MUTATIONS = [
  { name: "THE DEFECT: the target relay ignores the election (two tabs, two hits)", file: TR, from: "  if (connectionWriter === false) return false;\n", to: "", breaks: "A1/A3" },
  { name: "THE DEFECT: the party relay ignores the election", file: PS, from: "  if (connectionWriter === false) return false;\n", to: "", breaks: "A2/A4" },
  { name: "the target handler drops the writer's answer", file: TR, from: "  if (!shouldHandleAsGM(user, activeGM, connectionWriter)) return", to: "  if (!shouldHandleAsGM(user, activeGM)) return", breaks: "A3" },
  { name: "the target relay is never told the election's answer", file: TRW, from: "          connectionWriter: isGMConnectionWriter(),\n", to: "", breaks: "A5" },
  { name: "the party relay is never told the election's answer", file: PS, from: "      connectionWriter: isGMConnectionWriter(),\n", to: "", breaks: "A5" },
  { name: "every tab of the active GM offers the migration", file: MIG, from: "  if (!isActingGM()) return;\n", to: "", breaks: "A6" },
  { name: "linked conditions: back to the hand-rolled guard", file: LINKED, from: `      if (!isActingClientFor(actor)${GUARD}`, to: "      if (game?.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;", breaks: "A7/A11" },
  { name: "material shift: every client restores", file: MAT, from: `      if (!isActingClientFor(effect.parent)${GUARD}`, to: "      ;", breaks: "A7" },
  { name: "stasis: back to the hand-rolled guard", file: STASIS, from: `      if (!isActingClientFor(effect.parent)${GUARD}`, to: "      if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;", breaks: "A7/A11" },
  { name: "end saves: every client rolls", file: ENDS, from: `      if (!isActingClientFor(actor)${GUARD}`, to: "      ;", breaks: "A7" },
  { name: "Aligned Control: every client offers the resave", file: ALIGNED, from: `    if (!isActingClientFor(target)${GUARD}`, to: "    ;", breaks: "A7" },
  { name: "rune timers: back to the hand-rolled guard", file: RUNES, from: `      if (!isActingClientFor(effect.parent)${GUARD}`, to: "      if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;", breaks: "A7/A11" },
  { name: "a lent rune returns on every tab of the GM", file: SRUNE, from: "shouldHandleAsGM(game.user, activeGM, isGMConnectionWriter())", to: "shouldHandleAsGM(game.user, activeGM)", breaks: "A8" },
  { name: "rage ends on every tab", file: BOOT, from: "    if (!isActingClientFor(effect.parent)) return;\n", to: "    if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;\n", breaks: "A9/A11" },
  { name: "the world-clock sweep runs on every tab", file: BOOT, from: "  Hooks.on(\"updateWorldTime\", async (worldTime) => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"updateWorldTime\", async (worldTime) => {\n    if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;", breaks: "A9/A11" },
  { name: "the one-time purge runs on every tab", file: BOOT, from: "  if (isActingGM()) {\n    await purgeOrphanedItemsOfType(\"action\");", to: "  if (game.user?.isGM && (!game.users?.activeGM || game.users.activeGM.id === game.user.id)) {\n    await purgeOrphanedItemsOfType(\"action\");", breaks: "A9/A11" },
  { name: "a light-shift circle moves on every tab", file: LSHIFT, from: "    if (!isActingGM()) return;\n    const scene = tokenDoc?.parent ?? null;", to: "    const scene = tokenDoc?.parent ?? null;", breaks: "A10" },
  { name: "the condition queue does not wait for the last write", file: CWR, from: "  const next = previous.catch(() => {}).then(work);", to: "  const next = Promise.resolve().then(work);", breaks: "C1" },
  { name: "a failure jams the condition queue", file: CWR, from: "  const next = previous.catch(() => {}).then(work);", to: "  const next = previous.then(work);", breaks: "C2" },
  { name: "the condition queue is keyed by the base actor id", file: CWR, from: "  const key = actor?.uuid ?? actor?.id;", to: "  const key = actor?.id ?? actor?.uuid;", breaks: "C1/C3" },
  { name: "ability collapse writes outside the queue", file: COLLAPSE, from: "  return withActorConditionWriter(actor, () => settleAbilityCollapseNow(actor));", to: "  return settleAbilityCollapseNow(actor);", breaks: "C4" },
  { name: "encumbrance writes outside the queue", file: ENC, from: "  return withActorConditionWriter(actor, () => syncEncumbranceNow(actor, { quiet }));", to: "  return syncEncumbranceNow(actor, { quiet });", breaks: "C4" },
  { name: "THE GAP (finding 10): a member's legacy restore is never moved", file: RW, from: "      if (merged) await owner.setFlag(SYSTEM_ID, REFOCUS_FLAG, merged);\n", to: "", breaks: "R1" },
  { name: "LOW 6: the merge keeps the LATEST restore, dropping the one already due", file: RW, from: "    restoreAt: restores.length ? Math.min(...restores) : null,", to: "    restoreAt: restores.length ? Math.max(...restores) : null,", breaks: "R3/R6" },
  { name: "LOW 6: the merge keeps the SHORTEST block", file: RW, from: "    blockedUntil: blocks.length ? Math.max(...blocks) : null,", to: "    blockedUntil: blocks.length ? Math.min(...blocks) : null,", breaks: "R6" },
  { name: "LOW 6: daily preparation's block is lost in the merge", file: RW, from: "    dailyPrep: list.some((x) => Boolean(x.dailyPrep))", to: "    dailyPrep: false", breaks: "R6" },
  { name: "LOW 6 (the old rule): the owner's own state wins, the member's pending restore is dropped", file: RW, from: "      const merged = mergeRefocusStates([owner.getFlag?.(SYSTEM_ID, REFOCUS_FLAG), ...members.map((m) => m.legacy)]);", to: "      const merged = owner.getFlag?.(SYSTEM_ID, REFOCUS_FLAG) ?? members[0].legacy;", breaks: "R3/R6" },
  { name: "a member's legacy flag is left on it", file: RW, from: "      for (const { item } of members) await item.unsetFlag(SYSTEM_ID, REFOCUS_FLAG);\n", to: "", breaks: "R1/R3/R6" },
  { name: "the sweep restores once per form alias (before Graham's 3.686.1)", file: RW, from: "      if (usesPoolItem(item) !== item) continue;\n      const state = refocusStateOf(item);", to: "      const state = refocusStateOf(item);", breaks: "R5" },
  { name: "a member reads its own state, not the owner's", file: RW, from: "  return usesPoolItem(item)?.getFlag?.(SYSTEM_ID, REFOCUS_FLAG) ?? null;", to: "  return item?.getFlag?.(SYSTEM_ID, REFOCUS_FLAG) ?? null;", breaks: "R4" },
  { name: "Wild Shape's configuration refills a spent pool (before Graham's 3.686.1)", file: M("feats-workflow.mjs"), from: "        \"system.usesValue\": initialiseUses || !Number.isFinite(spell.system.usesValue)\n          ? uses : Math.max(0, Math.min(uses, spell.system.usesValue))", to: "        \"system.usesValue\": Math.min(uses, Number(spell.system.usesValue ?? uses) || uses)", breaks: "G1" },
  { name: "the tether measures the moved token where it is drawn", file: M("magic", "distance-trigger-workflow.mjs"), from: "  const moved = recordedToken(tokenDocument);", to: "  const moved = tokenDocument.object ?? tokenDocument;", breaks: "G2" },
  { name: "the tether measures the anchor where it is drawn", file: M("magic", "distance-trigger-workflow.mjs"), from: "    const anchor = anchorDoc ? recordedToken(anchorDoc) : null;", to: "    const anchor = anchorDoc?.object ?? anchorDoc ?? null;", breaks: "G2" },
  { name: "Submerged goes back to water.svg", file: M("combat", "underwater-workflow.mjs"), from: "    img: \"icons/svg/waterfall.svg\",", to: "    img: \"icons/svg/water.svg\",", breaks: "G3" },
  // NEW 3.686.2 (second review): the startup waits, driven (LOW 8), and GM authorisation (MEDIUM 1).
  { name: "ally auras: canvasReady asks before the election settles", file: M("ally-aura-effects-workflow.mjs"), from: "    if (gmConnectionSettled()) syncAllyAuraEffects();\n    else gmConnectionReady().then(() => syncAllyAuraEffects());", to: "    syncAllyAuraEffects();", breaks: "S1" },
  { name: "ward zones: canvasReady asks before the election settles", file: M("combat", "ward-zone-workflow.mjs"), from: "    if (gmConnectionSettled()) sync(canvas?.scene);\n    else gmConnectionReady().then(() => sync(canvas?.scene));", to: "    sync(canvas?.scene);", breaks: "S2" },
  { name: "the pending-cast startup sweep asks before the election settles", file: M("magic", "pending-cast-workflow.mjs"), from: "    if (!gmConnectionSettled()) await gmConnectionReady();\n    const thisUser", to: "    const thisUser", breaks: "S3" },
  { name: "MEDIUM 1: only the elected tab answers GM authorisation", file: M("combat", "gm-authorisation.mjs"), from: "    if (data?.action !== ASK || !isActiveGMAccount()) return;", to: "    if (data?.action !== ASK || !(await import(\"../acting-gm.mjs\")).isActingGM()) return;", breaks: "S4" },
  { name: "(a): another tab's answer leaves this tab's dialog open", file: M("combat", "gm-authorisation.mjs"), from: "      if (open) { open.closedByOther = true; try { open.dialog?.close?.(); } catch (_err) { /* already closed */ } }\n", to: "", breaks: "S5" },
  { name: "(a): a dialog closed by another tab's answer still answers", file: M("combat", "gm-authorisation.mjs"), from: "    if (open?.closedByOther) return;\n", to: "", breaks: "S5" },
  { name: "(b): a merged state reads only its next-turn half", file: M("combat", "refocus.mjs"), from: "  if (state.nextTurn && ownTurnStarted) return true;", to: "  if (state.nextTurn) return Boolean(ownTurnStarted);", breaks: "R8" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.686.1\"", breaks: "Z1" },
  { name: "the download names the last release", file: SJ, from: "releases/download/v3.686.2/trg-prime.zip", to: "releases/download/v3.686.1/trg-prime.zip", breaks: "Z1" },
  { name: "package.json is left behind", file: PJ, from: "\"version\": \"3.686.2\"", to: "\"version\": \"3.686.1\"", breaks: "Z2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3686-2.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3686-2: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3686-2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3686-2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
