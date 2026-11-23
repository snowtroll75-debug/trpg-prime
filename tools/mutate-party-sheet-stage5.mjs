#!/usr/bin/env node
/**
 * mutate-party-sheet-stage5 — mutations against verify-party-sheet-stage5.mjs
 * (3.712.0, Party Sheet V2 Stage 5: Skills, Group Check, Encounter, Notes).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const K = path.join(SYSTEM_ROOT, "module", "party-skills.mjs");
const R = path.join(SYSTEM_ROOT, "module", "party-rewards-workflow.mjs");
const SH = path.join(SYSTEM_ROOT, "module", "sheets", "party-sheet.mjs");
const H = path.join(SYSTEM_ROOT, "templates", "actor", "party-sheet.hbs");
const MUTATIONS = [
  { name: "a missing skill reads as 0", file: K, from: "  if (!skill || !Number.isFinite(total)) return { key, state: \"unavailable\", value: null };", to: "  if (!skill || !Number.isFinite(total)) return { key, state: \"ok\", value: 0 };", breaks: "K4" },
  { name: "a hidden NPC's number is given out", file: K, from: "  if (restricted) return { key, state: \"hidden\", value: null };", to: "", breaks: "K5/K6" },
  { name: "a tie is not marked", file: K, from: "      cell.best = cell.state === \"ok\" && values.length > 1 && cell.value === column.best;", to: "      cell.best = cell.state === \"ok\" && values.length > 1 && cell.value === column.best && row === rows.find((r) => r.cells[i].value === column.best);", breaks: "K7" },
  { name: "anyone's modifier is a button", file: K, from: "      cell.rollable = row.canRoll && cell.state === \"ok\";", to: "      cell.rollable = cell.state === \"ok\";", breaks: "K8" },
  { name: "the sort ignores the direction", file: K, from: "a.name.localeCompare(b.name) * (sort === \"desc\" ? -1 : 1)", to: "a.name.localeCompare(b.name)", breaks: "K9" },
  { name: "the filter ignores the key", file: K, from: " || str(column?.key).toLowerCase().includes(needle)", to: "", breaks: "K10" },
  { name: "the click rolls without the member's own sheet", file: SH, from: "    return roll.call(sheet, event, { dataset: { skill: key } });", to: "    return roll(event, { dataset: { skill: key } });", breaks: "K12" },
  { name: "a player rolls someone else's member", file: SH, from: "    if (!game.user.isGM && !member.isOwner) {\n      ui.notifications?.warn(`You do not control", to: "    if (false) {\n      ui.notifications?.warn(`You do not control", breaks: "K13" },
  { name: "the group check brings its own modifiers", file: K, from: "        subject: plan.skill,\n        dc: plan.dc,", to: "        subject: plan.skill,\n        modifiers: [{ label: \"Skill\", value: Number(actor.system.skills[plan.skill].total), type: \"untyped\" }],\n        dc: plan.dc,", breaks: "G5" },
  { name: "the group check ignores the visibility", file: K, from: "        rollMode: plan.rollMode || undefined,", to: "", breaks: "G5" },
  { name: "the card goes out publicly whatever was chosen", file: K, from: "  await deps.post(groupCheckCard({ partyName: deps.partyName, label: plan.label, summary }), plan.rollMode);", to: "  await deps.post(groupCheckCard({ partyName: deps.partyName, label: plan.label, summary }), \"\");", breaks: "G8" },
  { name: "a member without the skill rolls anyway", file: K, from: "    if (!actor?.system?.skills?.[plan.skill]) {", to: "    if (false) {", breaks: "G4" },
  { name: "one failed roll stops the rest", file: K, from: "      console.error(\"TRG Prime | group check\", error);\n      results.push(", to: "      throw error;\n      results.push(", breaks: "G10" },
  { name: "a member counted twice", file: K, from: "  const actors = members.filter((a) => a?.uuid && !seen.has(a.uuid) && seen.add(a.uuid));", to: "  const actors = members.filter((a) => a?.uuid);", breaks: "G2" },
  { name: "a group result is invented", file: K, from: "Each member rolled their own check; the rules set no group result.", to: "The group succeeds if most succeed.", breaks: "G7" },
  { name: "a player may run a group check", file: SH, from: "  static async groupCheck(event) {\n    event.preventDefault();\n    if (!game.user.isGM) return;", to: "  static async groupCheck(event) {\n    event.preventDefault();", breaks: "G12" },
  { name: "a version 1 encounter loses its counts", file: R, from: "    const count = Math.max(1, Math.floor(Number(entry?.count) || 1));\n    const tokens", to: "    const count = 1;\n    const tokens", breaks: "E1" },
  { name: "a party member is offered", file: R, from: "    if (isMember || actor.type === \"party\") continue;", to: "    if (actor.type === \"party\") continue;", breaks: "E3" },
  { name: "a second linked token is ticked", file: R, from: "    if (seenIdentity.has(identity)) reasons.push(\"another token of the same creature\");", to: "", breaks: "E5" },
  { name: "the defeated are ticked", file: R, from: "    if (source.defeated) reasons.push(\"defeated\");", to: "", breaks: "E6" },
  { name: "the friendly are ticked", file: R, from: "    if (disposition === friendly) reasons.push(\"friendly\");", to: "", breaks: "E6" },
  { name: "a missing token is silently dropped", file: R, from: "    if (!token || !actor) { missing.push(source?.name || \"a token that no longer exists\"); continue; }", to: "    if (!token || !actor) continue;", breaks: "E7" },
  { name: "the same token counts again", file: R, from: "    } else if (entry.tokens.includes(tokenUuid) || pick.linked) {", to: "    } else if (pick.linked) {", breaks: "E9" },
  { name: "a linked actor counts per token", file: R, from: "    } else if (entry.tokens.includes(tokenUuid) || pick.linked) {", to: "    } else if (entry.tokens.includes(tokenUuid)) {", breaks: "E11/E13" },
  { name: "an imported token is not shown as imported", file: R, from: "    if (counted) reasons.push(\"already imported\");", to: "    if (false) reasons.push(\"already imported\");", breaks: "E10" },
  { name: "a hand-added creature is not flagged", file: R, from: "    if (handAdded) reasons.push(`${actor.name} is in the encounter already, added by hand`);", to: "", breaks: "E12" },
  { name: "an import with nothing new still writes", file: R, from: "  if (added) await party.update({ \"system.encounter\": encounter });", to: "  await party.update({ \"system.encounter\": encounter });", breaks: "E14" },
  { name: "Clear does not ask", file: SH, from: "    const ok = await DialogV2.confirm({\n      window: { title: \"Clear Encounter\" },", to: "    const ok = true || await DialogV2.confirm({\n      window: { title: \"Clear Encounter\" },", breaks: "E17" },
  { name: "players get the editor", file: SH, from: "editable: isGM && this.isEditable", to: "editable: this.isEditable || true", breaks: "N2" },
  { name: "secrets shown to players", file: SH, from: "      secrets: isGM, relativeTo: actor", to: "      secrets: true, relativeTo: actor", breaks: "N2" },
  { name: "the whole form is written on a change", file: SH, from: "    if (!name || !foundry.utils.hasProperty(data, name)) return data;\n    return foundry.utils.expandObject({ [name]: foundry.utils.getProperty(data, name) });", to: "    return data;", breaks: "N4" },
  { name: "a live render replaces the open editor", file: SH, from: "    if (root.querySelector(\"prose-mirror[open], prose-mirror.active\")) return true;\n", to: "", breaks: "N5" },
  { name: "the Skills tab is not declared", file: SH, from: "        { id: \"skills\", icon: \"fa-solid fa-list-check\", label: \"Skills\" },\n", to: "", breaks: "T1" },
  { name: "Group Check is offered to players", file: H, from: "      <button type=\"button\" data-action=\"groupCheck\"", to: "      <button type=\"button\" data-player-ok data-action=\"groupCheck\"", breaks: "T4" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-party-sheet-stage5.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([K, R, SH, H]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-party-sheet-stage5: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-party-sheet-stage5: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-party-sheet-stage5: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
