#!/usr/bin/env node
/**
 * mutate-party-sheet-stage4 — mutations against verify-party-sheet-stage4.mjs
 * (3.711.0, Party Sheet V2 Stage 4: the shared inventory, transfers and
 * treasury). Each one puts back a defect the stage exists to prevent.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const E = path.join(SYSTEM_ROOT, "module", "party-transfers.mjs");
const S = path.join(SYSTEM_ROOT, "module", "party-socket.mjs");
const SH = path.join(SYSTEM_ROOT, "module", "sheets", "party-sheet.mjs");
const H = path.join(SYSTEM_ROOT, "templates", "actor", "party-sheet.hbs");
const P = path.join(SYSTEM_ROOT, "module", "party.mjs");
const MUTATIONS = [
  { name: "a replayed id is not refused by this client", file: E, from: "  if (deps.ledger.has(id)) return { ok: false, duplicate: true, reason: \"that request has already been handled\" };\n", to: "", breaks: "R7" },
  { name: "the journal is not asked", file: E, from: "  if (journalHas(journal, request.requestId)) return { ok: false, duplicate: true, reason: \"that request has already been handled\" };\n", to: "", breaks: "R2/M6" },
  { name: "transfers no longer queue", file: E, from: "  return deps.queue.run(str(request.partyUuid) || \"?\", () => transferNow(request, deps));", to: "  return transferNow(request, deps);", breaks: "Q1/Q4/P1" },
  { name: "the source is not read again before its write", file: E, from: "        const current = holder.items?.get?.(item.id);\n        const have = current ? quantityOf(current) : 0;", to: "        const current = item;\n        const have = current ? quantityOf(current) : 0;", breaks: "X4/X6" },
  { name: "a created copy is not undone", file: E, from: "        if (created) await receiver.deleteEmbeddedDocuments(\"Item\", [created]);\n        else if", to: "        if (created) {}\n        else if", breaks: "F2/X4" },
  { name: "a merge is not undone", file: E, from: "          if (now) await receiver.updateEmbeddedDocuments(\"Item\", [{ _id: mergedInto, \"system.quantity\": Math.max(0, quantityOf(now) - take) }]);", to: "", breaks: "F4" },
  { name: "the success card goes out before the journal says done", file: E, from: "  await deps.writeJournal(party, journalFinish(readJournal(party), request.requestId));\n  // ANNOUNCED ONLY NOW, when every write has landed.\n  await deps.announce?.(plan.card(who));", to: "  await deps.announce?.(plan.card(who));\n  await deps.writeJournal(party, journalFinish(readJournal(party), request.requestId));", breaks: "U11" },
  { name: "nothing is claimed before the writes", file: E, from: "  await deps.writeJournal(party, journalClaim(readJournal(party), record));\n", to: "", breaks: "U12/F6" },
  { name: "membership is not required of a destination", file: E, from: "  if (isPartyMember(party, dest)) return { ok: true, override: false };", to: "  return { ok: true, override: false };", breaks: "O3/G1" },
  { name: "a player may use the override", file: E, from: "  if (override && requesterIsGM) return { ok: true, override: true };", to: "  if (override) return { ok: true, override: true };", breaks: "G2" },
  { name: "membership is not required of a player's source", file: E, from: "  if (!isPartyMember(party, source)) return { ok: false, reason: `${str(source.name) || \"that character\"} is not in ${str(party?.name) || \"the party\"}` };", to: "", breaks: "O4" },
  { name: "a player need not own the destination", file: E, from: "  if (!requesterIsGM && !userOwnsDestination) return { ok: false, reason: \"you do not own that character\" };", to: "", breaks: "O1" },
  { name: "a player need not own the source", file: E, from: "  if (!userOwnsSource) return { ok: false, reason: \"you do not own that character\" };", to: "", breaks: "O2/C6" },
  { name: "a split rounds up and makes coin", file: E, from: "    share[key] = Math.floor(have[key] / people.length);", to: "    share[key] = Math.ceil(have[key] / people.length);", breaks: "S1/S2" },
  { name: "a split goes ahead after the treasury changed", file: E, from: "  if (request.coin && JSON.stringify(normaliseCoin(request.coin)) !== JSON.stringify(split.share)) {", to: "  if (false) {", breaks: "S7" },
  { name: "a player may split", file: E, from: "  if (!requesterIsGM) return { ok: false, reason: \"only the GM can split the party's coin\" };", to: "", breaks: "S8" },
  { name: "a share may go to someone outside the party", file: E, from: "    if (!members.includes(uuid)) return { ok: false, reason: \"a share can only go to a member of the party\" };", to: "", breaks: "S9" },
  { name: "coin is taken without checking the purse", file: E, from: "  const short = COIN_DENOMINATIONS.filter((key) => want[key] > have[key]);", to: "  const short = [];", breaks: "C2/C3/Q4" },
  { name: "a coin addition is not undone", file: E, from: "      undo: () => to.update({ \"system.currency\": subtractCoinFloor(to.system?.currency, coin) })", to: "      undo: async () => {}", breaks: "F10" },
  { name: "a paid share is not taken back", file: E, from: "    undo: () => actor.update({ \"system.currency\": subtractCoinFloor(actor.system?.currency, split.share) })", to: "    undo: async () => {}", breaks: "F11" },
  { name: "an item arrives still equipped", file: E, from: "  if (payload.system.equipped) payload.system.equipped = false;", to: "", breaks: "D2/I5" },
  { name: "invested counts towards the merge", file: P, from: "    delete system.invested;\n", to: "", breaks: "I6" },
  { name: "any item type moves", file: E, from: "  if (!isLootItem(item)) {\n    return { ok: false, reason: `${str(item.name) || \"that\"} is ${", to: "  if (false) {\n    return { ok: false, reason: `${str(item.name) || \"that\"} is ${", breaks: "T1/T2" },
  { name: "a natural weapon can be handed over", file: E, from: "  if (item?.system?.natural === true || item?.system?.unarmed === true) return", to: "  if (false) return", breaks: "T4" },
  { name: "a granted item can be handed over", file: E, from: "  if (granted) return `${name} was granted by", to: "  if (false) return `${name} was granted by", breaks: "T5" },
  { name: "too many is quietly reduced", file: E, from: "  if (want > have) return { ok: false, reason: `only ${have} left of ${str(item.name)}` };", to: "  if (want > have) return { ok: true, take: have, remaining: 0, deleteSource: true };", breaks: "I7" },
  { name: "an undo that fails is not recorded", file: E, from: "      await deps.writeJournal(party, journalUnresolved(readJournal(party), request.requestId, problem)).catch(() => {});\n", to: "", breaks: "F6" },
  { name: "the GMs are not told of an undo that failed", file: E, from: "      await deps.alertGM?.(`<p><strong>Party transfer needs checking.</strong> ${problem}</p>`);\n", to: "", breaks: "F7" },
  { name: "the journal keeps every id", file: E, from: "done: done.slice(-JOURNAL_DONE_LIMIT) };", to: "done };", breaks: "R5" },
  { name: "this client's memory grows without bound", file: E, from: "    while (this.ids.size > this.limit) this.ids.delete(this.ids.keys().next().value);\n", to: "", breaks: "R6" },
  { name: "a duplicate is answered again", file: S, from: "  if (!result.duplicate) reply(", to: "  reply(", breaks: "M5" },
  { name: "every GM performs from their own client", file: S, from: "  if (iPerform()) {\n    result = await performTransfer(request, liveDeps());", to: "  if (game.user.isGM) {\n    result = await performTransfer(request, liveDeps());", breaks: "M7" },
  { name: "the sheet's transfers are not locked", file: SH, from: "  #transferOnce(work) {\n    return runOnce(TRGPartySheet.#running, `${this.actor.uuid}:transfer`, work);", to: "  #transferOnce(work) {\n    return work();", breaks: "P3" },
  { name: "the GM's drag onto a character is Foundry's copy again", file: SH, from: "      TRGPartySheet.distributeByDrag(source, actor).catch((error) => console.error(\"TRG Prime | party drag\", error));\n      return false;", to: "      return true;", breaks: "P4" },
  { name: "a drop on the member strip creates a copy", file: SH, from: "      if (strip && isGM) return this.#distribute(item, strip.dataset.dropMember);", to: "", breaks: "P5" },
  { name: "the search box writes to the actor", file: H, from: "<input type=\"search\" data-inventory-search data-player-ok", to: "<input type=\"search\" name=\"system.details.notes\" data-inventory-search data-player-ok", breaks: "U3" },
  { name: "any player opens any item", file: SH, from: "    if (!game.user.isGM && item.testUserPermission?.(game.user, \"OBSERVER\") !== true) {", to: "    if (false) {", breaks: "U5" },
  { name: "Split Coin is offered to players", file: H, from: "<button type=\"button\" data-action=\"splitCoin\">", to: "<button type=\"button\" data-player-ok data-action=\"splitCoin\">", breaks: "U2" },
  { name: "the override is not limited to the GM in the chooser", file: SH, from: "override: picked.override && isGM", to: "override: picked.override", breaks: "U6" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-party-sheet-stage4.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([E, S, SH, H, P]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-party-sheet-stage4: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-party-sheet-stage4: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-party-sheet-stage4: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
