#!/usr/bin/env node
/**
 * mutate-fixes-3685-3b — can verify-fixes-3685-3b fail? (3.685.3, the review's findings)
 *
 * SURVIVED and an unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const PCW = M("magic", "power-crystal-workflow.mjs");
const UW = M("combat", "underwater-workflow.mjs");
const AF = M("combat", "affliction-workflow.mjs");
const BC = M("magic", "bardic-conviction.mjs");
const PEND = M("magic", "pending-cast-workflow.mjs");
const RULE = M("magic", "pending-cast.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json");
const AGM = M("acting-gm.mjs");

const MUTATIONS = [
  // R — one settlement at a time
  { name: "THE DEFECT: a spend's settlement does not wait for the last one", file: PCW, from: "    globalThis.setTimeout(() => { inTurn(actor, () => settleCrystals(actor, before, Number(after))); }, 0);", to: "    globalThis.setTimeout(() => { settleCrystals(actor, before, Number(after)); }, 0);", breaks: "R1/R2/R3" },
  { name: "the queue does not wait at all", file: PCW, from: "  const gate = before ? waitBounded(before, actor?.name ?? key) : Promise.resolve();", to: "  const gate = Promise.resolve();", breaks: "R1/R2/R3" },
  { name: "THE STALL: the queue waits for a write that never returns", file: PCW, from: "  const gate = before ? waitBounded(before, actor?.name ?? key) : Promise.resolve();", to: "  const gate = before ?? Promise.resolve();", breaks: "S1" },
  { name: "the bounded wait never lets go", file: PCW, from: "      resolve();\n    }, QUEUE_WAIT_MS);", to: "    }, QUEUE_WAIT_MS);", breaks: "S1" },
  // D — the departure's own write
  { name: "THE DEFECT: the departure's write is read as a spend", file: PCW, from: "    if (options?.[DEPARTURE_OPTION]) return;\n", to: "", breaks: "D1/D1b/D2" },
  { name: "the departure's write is not marked", file: PCW, from: "  await actor.update({ \"system.resources.pp.value\": left }, { [DEPARTURE_OPTION]: true });", to: "  await actor.update({ \"system.resources.pp.value\": left });", breaks: "D1/D1b" },
  { name: "every fall is taken for a departure", file: PCW, from: "    if (options?.[DEPARTURE_OPTION]) return;\n", to: "    if (options) return;\n", breaks: "D3/R1" },
  // U, A, B — one client
  { name: "THE DEFECT: every client settles going under water", file: UW, from: "    if (!isActingClientFor(actor)) return;\n", to: "", breaks: "U1/U2/U3/U4/G1" },
  { name: "every GM settles going under water", file: UW, from: "    if (!isActingClientFor(actor)) return;\n", to: "    if (!game.user?.isGM) return;\n", breaks: "U2/U3/U4/G1" },
  { name: "THE DEFECT: every client withdraws an affliction's conditions", file: AF, from: "    if (!isActingClientFor(actor)) return;\n", to: "", breaks: "A1/A2/G1" },
  { name: "THE DEFECT: every client reclaims the temporary point", file: BC, from: "      if (!isActingClientFor(actor)) return;\n", to: "", breaks: "B1/B2/G1" },
  { name: "NO GM CONNECTED: water asks only for the acting GM, so nobody settles it", file: UW, from: "    if (!isActingClientFor(actor)) return;\n", to: "    if (game.users?.activeGM?.id !== game.user?.id) return;\n", breaks: "N1/G1" },
  { name: "with no GM, every owner acts", file: AGM, from: "  return owners[0] === me;", to: "  return owners.includes(me);", breaks: "N1/N2/N3" },
  { name: "with no GM, nobody acts", file: AGM, from: "  return owners[0] === me;", to: "  return false;", breaks: "N1/N2/N3/N5" },
  { name: "with no GM, a non-owner may act", file: AGM, from: "    .filter((u) => u?.active && document.testUserPermission(u, \"OWNER\"))", to: "    .filter((u) => u?.active)", breaks: "N4" },
  // Q — the relay
  { name: "THE DEFECT: Phase 1 does not ask the holder", file: PEND, from: "    return asked.relayed ? (asked.result ?? null) : null;\n  }\n  return payHere(", to: "    return null && asked;\n  }\n  return payHere(", breaks: "Q1/Q1b/Q2" },
  { name: "THE DEFECT: a blow struck elsewhere is not relayed", file: PEND, from: "    const asked = await askHolder(actor, record, \"interrupt\", {", to: "    const asked = { relayed: false }; void ({", breaks: "Q3/Q4" },
  { name: "the holder's answer to a blow is dropped", file: PEND, from: "    return asked.relayed ? Boolean(asked.result) : false;\n  }\n  return interruptHere(", to: "    return false && asked;\n  }\n  return interruptHere(", breaks: "Q4b" },
  { name: "the hit-point watch ignores a casting held elsewhere", file: PEND, from: "    if (!waiting.has(actor.id) && !pendingCastOf(actor)) return;", to: "    if (!waiting.has(actor.id)) return;", breaks: "Q3/Q3b" },
  { name: "THE DEFECT: the GM's stop is not relayed", file: PEND, from: "    const asked = await askHolder(actor, record, \"stop\", { silent }, { notice: `stopping ${record.spellName}` });", to: "    const asked = { relayed: false, reason: \"none\" };", breaks: "Q5" },
  { name: "the GM's stop with nobody holding it says nothing", file: PEND, from: "    if (!silent) await postCard(actor, `${record.spellName} — Stopped`, [line(stoppedLine(record.spellName))]);\n    return true;", to: "    return false;", breaks: "Q6b" },
  { name: "the holder ignores what it is asked", file: PEND, from: "    if (data?.action !== RELAY_ASK || data.holderId !== game.user?.id) return;", to: "    if (data?.action !== RELAY_ASK || data.holderId === game.user?.id) return;", breaks: "Q1/Q3/Q5" },
  { name: "a holder who leaves is waited out", file: PEND, from: "      entry.resolve({ relayed: false, reason: \"left\" });", to: "      ;", breaks: "Q7" },
  { name: "the relay is never registered", file: BOOT, from: "  registerPendingCastRelay();\n", to: "", breaks: "Q9" },
  { name: "a disconnected starter is asked anyway", file: RULE, from: "  if (startedBy) return list.some((u) => u?.id === startedBy && u.active) ? startedBy : null;", to: "  if (startedBy) return startedBy;", breaks: "Q6/Q8" },
  { name: "an old record asks a GM", file: RULE, from: "  return list.find((u) => u?.active && !u.isGM && u.owner)?.id ?? null;", to: "  return list.find((u) => u?.active && u.owner)?.id ?? null;", breaks: "Q8" },
  // Q — the second review
  { name: "THE DEFECT: the holder acts for anybody", file: PEND, from: "      if (actor && !mayAskFor(data.op, game.users?.get?.(data.userId), actor)) refused = true;\n      else if (actor && !cancelledAsks", to: "      if (actor && !cancelledAsks", /* RE-ANCHORED 3.686.2 */ breaks: "Q10/Q10b/Q21" },
  { name: "AGAINST THE RULING: a blow from a player who does not own the caster is refused", file: PEND, from: "  if (op === \"interrupt\") return true;\n", to: "", breaks: "Q20" },
  { name: "a player may ask for a payment", file: PEND, from: "  if (op === \"pay\") return Boolean(user.isGM);", to: "  if (op === \"pay\") return true;", breaks: "Q21" },
  { name: "Stop and Complete are open to anybody", file: PEND, from: "  return mayAsk(user, actor);\n}", to: "  return true;\n}", breaks: "Q10/Q10b" },
  { name: "a relayed Complete ignores whether the time is paid", file: PEND, from: "    if (!pendingCastReady(record)) return false;\n    return settle(actor, \"complete\");", to: "    return settle(actor, \"complete\");", /* RE-ANCHORED 3.686.2 */ breaks: "Q11" },
  { name: "the card buttons ask for anybody", file: PEND, from: "        if (actor && mayAct(actor)) await stopPendingCast(actor);", to: "        if (actor) await stopPendingCast(actor);", breaks: "Q9" },
  { name: "THE DEFECT: a Stop nobody answered clears the flag anyway", file: PEND, from: "    if (asked.reason !== \"none\") return false;\n    // AND ONLY IF", to: "    // AND ONLY IF", breaks: "Q12" },
  { name: "a Stop whose flag could not be cleared still posts the card", file: PEND, from: "    } catch {\n      return false;\n    }\n    if (!silent) await postCard", to: "    } catch {\n      // refused\n    }\n    if (!silent) await postCard", breaks: "Q13" },
  { name: "THE DEFECT: an answer from anybody is taken", file: PEND, from: "      if (!entry || data.answererId !== entry.holder) return;", to: "      if (!entry) return;", breaks: "Q14" },
  { name: "the GM is not told who it is waiting for", file: PEND, from: "  if (notice) ui.notifications?.info?.(`Waiting for ${holderName}: ${notice}…`);", to: "", breaks: "Q15" },
  { name: "THE DEFECT: the holder does not acknowledge, so a slow step is given up on", file: PEND, from: "    reply({ action: RELAY_ACCEPTED });\n", to: "", breaks: "Q16" },
  { name: "an acknowledgement does not lengthen the wait", file: PEND, from: "        }, RELAY_WORK_MS);", to: "        }, RELAY_ACCEPT_MS);", breaks: "Q16" },
  { name: "a record written while the window ended stays written", file: PEND, from: "  if (waiting.get(actor.id) !== resolve) {\n    await actor.unsetFlag(SYSTEM_ID, PENDING_CAST_FLAG).catch(() => {});\n    return null;\n  }", to: "", breaks: "Q17b" },
  { name: "THE DEFECT: a payment writes its record back after the window ended", file: PEND, from: "  if (waiting.get(actor.id) !== resolve) return null;\n  await actor.setFlag", to: "  await actor.setFlag", breaks: "Q17" },
  { name: "THE DEFECT: a holder on another combat pays anyway", file: PEND, from: "  if (combatId && game.combat?.id !== combatId) {", to: "  if (false) {", breaks: "Q18" },
  { name: "THE DEFECT: AP the spender did not take is counted", file: PEND, from: "  if (!receipt) return 0;\n", to: "", breaks: "Q19" },
  // Z
  { name: "the version is not 3.685.3", file: SJ, from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.685.2\"", breaks: "Z1" },
  // NEW 3.686.2 (the 3.686.1 review, finding 6): an ask with no live holder.
  { name: "THE 3.686.1 DEFECT: a tab that does not hold the casting says nothing", file: PEND, from: "      reply({ action: RELAY_ANSWER, ghost: true, result: null, refused: false });\n      return;", to: "      return;", breaks: "X1/X2" },
  { name: "a ghost answer is final, pre-empting the tab that does hold it", file: PEND, from: "        if (entry.accepted || entry.ghosted) return;\n", to: "        relayWaiting.delete(data.requestId); clearTimeout(entry.timer); entry.resolve({ relayed: false, reason: \"none\" }); return;\n", breaks: "X3" },
  { name: "the asker's own account waits the full ten seconds", file: PEND, from: "    }, self ? RELAY_GHOST_MS * 2 : RELAY_ACCEPT_MS);", to: "    }, RELAY_ACCEPT_MS);", breaks: "X5" },
  { name: "the asker's own account's silence reads as a timeout", file: PEND, from: "      resolve({ relayed: false, reason: self ? \"none\" : \"timeout\" });", to: "      resolve({ relayed: false, reason: \"timeout\" });", breaks: "X5" },
  { name: "LOW 3: the holder acts without the asker's go", file: PEND, from: "    if (!(await go)) { reply({ action: RELAY_ANSWER, result: null, refused: false }); return; }", to: "    await go;", breaks: "X7c/X10" },
  { name: "LOW 3 (third review): a lost go is answered with silence, so the asker waits RELAY_WORK_MS", file: PEND, from: "    if (!(await go)) { reply({ action: RELAY_ANSWER, result: null, refused: false }); return; }", to: "    if (!(await go)) return;", breaks: "X10" },
  { name: "LOW 4: a removal before the new casting's flag is written ends it", file: PEND, from: "    if (state && state.resolve === waiting.get(actor.id) && !state.flagWritten) return;", to: "", breaks: "X11" },
  { name: "LOW 4: the casting never records its flag as written", file: PEND, from: "    state.flagWritten = true;\n", to: "", breaks: "X11b" },
  { name: "LOW 3: a lapsed ask is never cancelled", file: PEND, from: "  game.socket?.emit?.(RELAY_SOCKET, { action: RELAY_CANCEL,", to: "  void ({ action: RELAY_CANCEL,", breaks: "X7b" },
  { name: "LOW 3: a cancelled ask is still acknowledged", file: PEND, from: "    if (cancelledAsks.has(data.requestId)) return;\n    const go", to: "    const go", breaks: "X7b" },
  { name: "LOW 3: a flag cleared elsewhere leaves the holder's promise waiting", file: PEND, from: "    const resolve = waiting.get(actor.id); waiting.delete(actor.id);\n    resolve?.({ outcome: \"stopped\" });", to: "    return;" /* RE-ANCHORED 3.686.2 (third review) */, breaks: "X8" },
  { name: "LOW 3: a relayed Complete with the flag gone leaves the promise waiting", file: PEND, from: "    if (!record) { await settle(actor, \"stopped\"); return false; }\n", to: "    if (!record) return false;\n", breaks: "X9" },
  { name: "the resolver is held only after the flag is written", file: PEND, from: "  waiting.set(actor.id, resolveCast);\n  const state = { resolve: resolveCast, castId: record.castId, flagWritten: false };\n  castState.set(actor.id, state);\n  try {\n    const firstPayment = await payTowards(actor, record);\n    await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);\n", to: "  const state = { resolve: resolveCast, castId: record.castId, flagWritten: false };\n  castState.set(actor.id, state);\n  try {\n    const firstPayment = await payTowards(actor, record);\n    await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);\n    waiting.set(actor.id, resolveCast);\n", breaks: "X6" }, /* RE-ANCHORED 3.686.2 (third review) */
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-fixes-3685-3b.mjs")], { stdio: ["ignore", "pipe", "pipe"], timeout: 120000 }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-fixes-3685-3b: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-fixes-3685-3b: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-fixes-3685-3b: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
