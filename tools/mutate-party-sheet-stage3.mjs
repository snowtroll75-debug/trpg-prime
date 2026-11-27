#!/usr/bin/env node
/**
 * mutate-party-sheet-stage3 — can verify-party-sheet-stage3 fail? (3.710.0)
 *
 * SURVIVED and an unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const ACT = M("party-actions.mjs"), REST = M("rest", "rest-workflow.mjs"), TRAVEL = M("travel-dialog.mjs");
const SHEET = M("sheets", "party-sheet.mjs"), RW = M("party-rewards-workflow.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "party-sheet.hbs");
const SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json");

const MUTATIONS = [
  /* P */
  { name: "a party's action reaches a missing or ineligible entry", file: ACT, from: "    if (entry.status === MEMBER_STATUS.OK && entry.actor) {", to: "    if (entry.actor) {", breaks: "P6" },
  { name: "the same actor takes part twice", file: ACT, from: "      if (seen.has(key)) continue;\n", to: "", breaks: "P7" },
  { name: "who was left out is not said", file: ACT, from: "    ? ` Not included: ${excluded.map((e) => `${e.name} (${e.reason})`).join(\"; \")}.`", to: "    ? \"\"", breaks: "P8" },
  /* R */
  { name: "the party's Rest ignores its participants (the whole table again)", file: REST, from: "  const { actors, scopeNote } = candidates ?? restCandidates();", to: "  const { actors, scopeNote } = restCandidates();", breaks: "R1/R8" },
  { name: "an actor in the entries twice rests twice", file: REST, from: "    if (!key || seen.has(key)) continue;\n", to: "    if (!key) continue;\n", breaks: "R7" },
  { name: "the rows are keyed by actor id again", file: REST, from: "          <td><label><input type=\"checkbox\" name=\"include-${i}\" checked> ${actor.name}</label></td>", to: "          <td><label><input type=\"checkbox\" name=\"include-${actor.id}\" checked> ${actor.name}</label></td>", breaks: "R1/R5" },
  /* T */
  { name: "the party's Travel ignores its participants", file: TRAVEL, from: "  const { actors, scopeNote } = candidates ?? restCandidates();", to: "  const { actors, scopeNote } = restCandidates();", breaks: "T1/T2/T3" },
  { name: "a ticked traveller is dropped (rows read by id, written by position)", file: TRAVEL, from: "    .filter((actor, i) => result[`include-${i}`])", to: "    .filter((actor) => result[`include-${actor.id}`])", breaks: "T2/T3" },
  /* X */
  { name: "an NPC's share is shown as written", file: ACT, from: "    const written = str(actor?.type) === \"character\";", to: "    const written = true;", breaks: "X2" },
  { name: "an award with nobody to receive it is ok", file: ACT, from: "ok: xp > 0 && members.length > 0", to: "ok: xp > 0", breaks: "X3" },
  { name: "the award resolves its own members, not the ones confirmed", file: RW, from: "  const members = given ?? await partyMembers(party);", to: "  const members = await partyMembers(party);", breaks: "X9" },
  /* O */
  { name: "a second press runs again", file: ACT, from: "  if (running.has(key)) return null;\n", to: "", breaks: "O1" },
  { name: "a failure leaves the action locked", file: ACT, from: "  } finally {\n    running.delete(key);\n  }", to: "  } catch (e) { throw e; }\n  running.delete(key);", breaks: "O3" },
  /* B */
  // Re-anchored 3.712.0 (Stage 5): Group Check is built; the defect is now its being withheld.
  { name: "Group Check is built but not offered", file: ACT, from: "  { id: \"groupCheck\", label: \"Group Check\", icon: \"fa-solid fa-people-group\", gmOnly: true, implemented: true },", to: "  { id: \"groupCheck\", label: \"Group Check\", icon: \"fa-solid fa-people-group\", gmOnly: true, implemented: false },", breaks: "B2/B3" },
  { name: "players are offered the GM's actions", file: ACT, from: "  return PARTY_TOOLBAR_ACTIONS.filter((a) => a.implemented && (isGM || !a.gmOnly));", to: "  return PARTY_TOOLBAR_ACTIONS.filter((a) => a.implemented);", breaks: "B4" },
  { name: "the toolbar's Rest is outside the GM block", file: HBS, from: "    {{#if isGM}}\n      {{#if toolbar.show.partyRest}}", to: "    {{#if true}}\n      {{#if toolbar.show.partyRest}}", breaks: "B6" },
  /* S */
  { name: "a player may launch the party's Rest", file: SHEET, from: "  static async partyRest(event) {\n    event.preventDefault();\n    if (!game.user.isGM) return;", to: "  static async partyRest(event) {\n    event.preventDefault();", breaks: "S1" },
  { name: "the sheet's Rest is the whole table's dialog", file: SHEET, from: "      return openRestDialog({\n        candidates: { actors: participants.actors, scopeNote: partyScopeNote(this.actor.name, \"Resting\", participants) }\n      });", to: "      return openRestDialog();", breaks: "S3" },
  { name: "an award is written without the GM confirming it", file: SHEET, from: "    if (!(await confirmXPAward(this.actor, preview, reason))) return null;\n", to: "", breaks: "S7" }, // re-anchored 3.710.1
  { name: "the Encounter tab awards without the confirmation", file: SHEET, from: "    await this.#awardXP(context.summary.total, \"the encounter\");", to: "    await awardPartyXP(this.actor, context.summary.total, \"the encounter\");", breaks: "S8" },
  { name: "Begin Session can run twice at once", file: SHEET, from: "    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:session`, () => beginSession(this.actor));", to: "    await beginSession(this.actor);", breaks: "S6/S9" },
  { name: "LIVE: the chooser opens again on a second press (lock only around the award)", file: SHEET, from: "    await runOnce(TRGPartySheet.#running, `${this.actor.uuid}:xp`, async () => {\n      const context = await rewardsContext(this.actor);", to: "    await (async (f) => f())(async () => {\n      const context = await rewardsContext(this.actor);", breaks: "S10" },
  { name: "LIVE: the toolbar award nests the lock and refuses itself", file: SHEET, from: "      return choice ? this.#awardXPNow(choice.xp, choice.reason) : null;", to: "      return choice ? this.#awardXP(choice.xp, choice.reason) : null;", breaks: "S10/S11" },
  /* Z */
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.717.0\"", to: "\"version\": \"3.709.1\"", breaks: "Z1" },
  { name: "package.json is left behind", file: PJ, from: "\"version\": \"3.717.0\"", to: "\"version\": \"3.709.1\"", breaks: "Z1" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-party-sheet-stage3.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-party-sheet-stage3: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-party-sheet-stage3: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-party-sheet-stage3: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
