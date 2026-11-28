#!/usr/bin/env node
/**
 * mutate-party-sheet-stage1 — can verify-party-sheet-stage1 fail? (3.708.0)
 *
 * Each mutation puts back a defect Stage 1 removed, or breaks a guard it
 * added. SURVIVED and an unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const MEM = M("party-members.mjs"), LS = M("party-live-sync.mjs"), PARTY = M("party.mjs");
const SHEET = M("sheets", "party-sheet.mjs"), RW = M("party-rewards-workflow.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "party-sheet.hbs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json");

const MUTATIONS = [
  /* R — resolution */
  { name: "roster order is lost (sorted)", file: MEM, from: "  const list = normaliseMembers(uuids);", to: "  const list = normaliseMembers(uuids).sort();", breaks: "R1" },
  { name: "a companion counts as a member", file: MEM, from: "status: isActor && eligible(actor) ? MEMBER_STATUS.OK : MEMBER_STATUS.INELIGIBLE", to: "status: MEMBER_STATUS.OK", breaks: "R2/R8/W5" },
  { name: "a failed lookup is reported as missing", file: MEM, from: "      entry.status = MEMBER_STATUS.ERROR;", to: "      entry.status = MEMBER_STATUS.MISSING;", breaks: "R2/R6" },
  { name: "a lookup that throws takes the whole roster down", file: MEM, from: "  const settled = await Promise.allSettled(pending.map((entry) => resolveAsync(entry.uuid)));", to: "  const settled = (await Promise.all(pending.map((entry) => resolveAsync(entry.uuid)))).map((value) => ({ status: \"fulfilled\", value }));", breaks: "R2" },
  { name: "every UUID is fetched async, even the ones already in memory", file: MEM, from: "      if (isDocument(found)) {", to: "      if (false) {", breaks: "R4" },
  { name: "a compendium index entry is taken for the actor", file: MEM, from: "  return Boolean(value) && typeof value === \"object\" && typeof value.update === \"function\";", to: "  return Boolean(value) && typeof value === \"object\";", breaks: "R7" },
  { name: "Rewards ignores the members it was given and resolves again", file: RW, from: "  members = members ?? await partyMembers(party);", to: "  members = await partyMembers(party);", breaks: "R9" },
  { name: "a deleted adversary is counted as live", file: RW, from: "    const actor = status === MEMBER_STATUS.OK ? found : null;", to: "    const actor = found;", breaks: "R12" },
  { name: "the sheet resolves the roster a second time for Rewards", file: SHEET, from: "await rewardsContext(actor, { members: activeMembers(roster) })", to: "await rewardsContext(actor)", breaks: "R14" },
  /* L — live sync */
  { name: "an unrelated actor's update reaches every sheet", file: LS, from: "      if (actor?.uuid) tell(actor.uuid);", to: "      if (actor?.uuid) for (const s of this.#keysBySheet.keys()) told.add(s);", breaks: "L5" },
  { name: "an item on a member is not traced to its actor", file: LS, from: "    current = current.parent ?? null;", to: "    current = null;", breaks: "L7/L8" },
  { name: "render:false is ignored", file: LS, from: "    if (event !== \"canvasReady\" && hookOptions(event, [document, ...rest]).render === false) return 0;\n", to: "", breaks: "L11" }, // re-anchored 3.709.0 (canvasReady has no options)
  { name: "a deleted token's actor is never noticed", file: LS, from: "        for (const key of this.#sheetsByKey.keys()) if (key.startsWith(prefix)) tell(key);", to: "        ;", breaks: "L13" },
  { name: "the token prefix loses its separator (t1 matches t10)", file: LS, from: "      const prefix = `${document?.uuid ?? \"\"}.Actor.`;", to: "      const prefix = `${document?.uuid ?? \"\"}`;", breaks: "L14" },
  { name: "re-watching accumulates the old keys", file: LS, from: "  watch(sheet, keys) {\n    this.#forget(sheet);", to: "  watch(sheet, keys) {", breaks: "L15/L16" },
  { name: "hooks are installed again on every watch", file: LS, from: "    if (this.#hookIds || !this.#hooks) return;", to: "    if (!this.#hooks) return;", breaks: "L17" },
  { name: "the hooks are never taken down", file: LS, from: "    if (this.#keysBySheet.size === 0) this.#uninstall();", to: "    ;", breaks: "L18" },
  { name: "one sheet throwing stops the rest", file: LS, from: "      try {\n        sheet.onPartyDocumentChanged?.(event);\n      } catch (error) {\n        console.error(\"TRG Prime | party sheet live update\", error);\n      }", to: "      sheet.onPartyDocumentChanged?.(event);", breaks: "L21" },
  { name: "an unlinked token's base actor is not watched", file: MEM, from: "    if (base) keys.add(base);", to: "    ;", breaks: "L22" },
  { name: "the sheet never leaves the registry on close", file: SHEET, from: "    partyLiveSync().unwatch(this);", to: "    ;", breaks: "L23" },
  { name: "the sheet re-renders at once, uncoalesced", file: SHEET, from: "  onPartyDocumentChanged() {\n    this.#coalescer.request();", to: "  onPartyDocumentChanged() {\n    this.render();", breaks: "L25" },
  /* C — coalescer */
  { name: "every request starts its own render", file: LS, from: "  request() {\n    if (this.pending) return;", to: "  request() {", breaks: "C1/C2" },
  { name: "a closed sheet is rendered anyway", file: LS, from: "    this.#timer = null;\n    if (!this.#deps.isRendered()) return;", to: "    this.#timer = null;", breaks: "C4" },
  { name: "a render replaces the field being typed in", file: LS, from: "    if (this.#deps.isBusy()) {", to: "    if (false) {", breaks: "C5" },
  { name: "cancel does not stop a render waiting for focus-out", file: LS, from: "        if (!this.#waitingForIdle) return;\n", to: "", breaks: "C9" },
  /* S, D — integrity and drops */
  { name: "THE DEFECT: any item type goes into the loot", file: PARTY, from: "  if (!isLootItem(item)) {\n    return {\n      ok: false,", to: "  if (false) {\n    return {\n      ok: false,", breaks: "D2" },
  { name: "a player may drop loot in", file: PARTY, from: "  if (!isGM) return { ok: false, reason: \"Only the GM can add to the party loot.\" };", to: "", breaks: "D3" },
  { name: "a stack of zero goes in", file: PARTY, from: "  if (!Number.isFinite(raw) || raw < 1) {", to: "  if (!Number.isFinite(raw)) {", breaks: "D4/D5" },
  { name: "the sheet skips the check and lets Foundry create anything", file: SHEET, from: "    const plan = planLootDrop({ item, isGM: game.user?.isGM === true, partyUuid: this.actor.uuid });\n    if (!plan.ok) {", to: "    const plan = planLootDrop({ item, isGM: game.user?.isGM === true, partyUuid: this.actor.uuid });\n    if (false) {", breaks: "D9" },
  { name: "THE DEFECT: a player's drag of loot is a copy again", file: PARTY, from: "  if (str(sourceParentType) !== PARTY_TYPE) return null;", to: "  return null;", breaks: "D10" },
  { name: "anyone may start a loot drag", file: SHEET, from: "  _canDragStart(selector) {\n    return game.user?.isGM === true;", to: "  _canDragStart(selector) {\n    return true;", breaks: "D13" },
  { name: "the drag guard is never installed", file: BOOT, from: "  registerPartyLootDragGuard();\n", to: "", breaks: "D13" },
  { name: "the render prunes the roster when a lookup fails", file: SHEET, from: "    const roster = await resolvePartyRoster(actor);\n", to: "    const roster = await resolvePartyRoster(actor);\n    if (roster.some((e) => e.status !== \"ok\")) await actor.update({ \"system.members\": roster.filter((e) => e.status === \"ok\").map((e) => e.uuid) });\n", breaks: "S6" },
  { name: "the GM is not told that entries need attention", file: HBS, from: "{{#if isGM}}{{#if hasUnresolved}}", to: "{{#if false}}{{#if hasUnresolved}}", breaks: "S10" },
  /* V — visibility */
  { name: "THE DEFECT: an NPC's statistics are shown to any player", file: MEM, from: "  if (String(actor.type ?? \"\") !== \"npc\") return true;", to: "  return true;", breaks: "V2" },
  { name: "player characters are gated too (against the ruling)", file: MEM, from: "  if (String(actor.type ?? \"\") !== \"npc\") return true;", to: "  if (false) return true;", breaks: "V1" },
  { name: "a gated row still carries the hit points", file: PARTY, from: "      isNPC: str(actor.type) === \"npc\",\n      conditions: []\n    };\n  }", to: "      isNPC: str(actor.type) === \"npc\",\n      hp: { max: Number(actor.system?.resources?.hp?.max) || 0 },\n      conditions: []\n    };\n  }", breaks: "V5" },
  { name: "the Rewards tab is offered to players", file: SHEET, from: "    if (!config || group !== \"primary\" || game.user?.isGM) return config;", to: "    return config;", breaks: "V8" },
  { name: "the Rewards context is built for a player", file: SHEET, from: "    const rewards = isGM ? await rewardsContext(", to: "    const rewards = true ? await rewardsContext(", breaks: "V9" },
  { name: "the whole system object is put back in the context", file: SHEET, from: "      isGM,\n      members,", to: "      system,\n      isGM,\n      members,", breaks: "V11" },
  { name: "a player may award XP", file: RW, from: "  if (!game.user?.isGM) {\n    ui.notifications?.warn(\"Only the GM awards experience.\");\n    return null;\n  }", to: "", breaks: "V12/W9" },
  /* T — tabs */
  { name: "the nav loses the .tabs container changeTab looks in", file: HBS, from: "<nav class=\"sheet-tabs tabs\" data-group=\"primary\"", to: "<nav class=\"sheet-tabs\" data-group=\"primary\"", breaks: "T2" },
  { name: "a click on the tab's icon does nothing (Foundry's event.target)", file: SHEET, from: "    const button = event.target?.closest?.(\"[data-tab]\");", to: "    const button = event.target;", breaks: "T3" },
  { name: "scroll positions are lost on a live render", file: SHEET, from: "      scrollable: ['section[data-tab=\"roster\"]', 'section[data-tab=\"skills\"]', '.party-skills-scroll', 'section[data-tab=\"loot\"]', 'section[data-tab=\"rewards\"]', 'section[data-tab=\"notes\"]']\n", to: "", breaks: "T6" }, // re-anchored 3.712.0: the two new panels
  /* F — the live test's findings (3.708.1) */
  { name: "LIVE: the Remove button reads the member's isGM again", file: HBS, from: "              {{#if ../isGM}}\n                <button type=\"button\" class=\"party-remove\"", to: "              {{#if isGM}}\n                <button type=\"button\" class=\"party-remove\"", breaks: "F1" }, // re-anchored 3.709.0 (inside the controls column)
  { name: "LIVE: the base actor is looked for on the synthetic actor only", file: MEM, from: "      ? (entry.actor.token?.baseActor?.uuid ?? entry.actor.baseActor?.uuid ?? null)", to: "      ? (entry.actor.baseActor?.uuid ?? null)", breaks: "F2" },
  { name: "LIVE: the merge compares prepared data again", file: PARTY, from: "    const system = { ...((item?._source ?? item)?.system ?? {}) };", to: "    const system = { ...(item?.system ?? {}) };", breaks: "F3" },
  { name: "LIVE: 'a affliction'", file: PARTY, from: "is ${/^[aeiou]/i.test(str(item.type) || \"document\") ? \"an\" : \"a\"} ${", to: "is a ${", breaks: "F4" },
  /* W, Z */
  { name: "XP is split across the deleted and ineligible entries too", file: RW, from: "  return activeMembers(await resolvePartyRoster(party));", to: "  return (await resolvePartyRoster(party)).map((e) => e.actor).filter(Boolean);", breaks: "R15/W5" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.720.1\"", to: "\"version\": \"3.707.3\"", breaks: "Z1" },
  { name: "package.json is left behind", file: PJ, from: "\"version\": \"3.720.1\"", to: "\"version\": \"3.707.3\"", breaks: "Z1" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-party-sheet-stage1.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-party-sheet-stage1: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-party-sheet-stage1: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-party-sheet-stage1: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
