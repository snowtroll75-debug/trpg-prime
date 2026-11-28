#!/usr/bin/env node
/**
 * mutate-party-sheet-stage2 — can verify-party-sheet-stage2 fail? (3.709.0)
 *
 * SURVIVED and an unmatched anchor are both failures.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const PARTY = M("party.mjs"), DASH = M("party-dashboard.mjs"), LS = M("party-live-sync.mjs"), SHEET = M("sheets", "party-sheet.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "party-sheet.hbs");
const CSS = path.join(SYSTEM_ROOT, "styles", "trg-prime.css");
const SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json");

const MUTATIONS = [
  /* A */
  { name: "a missing figure reads as 0", file: PARTY, from: "  if (node === null || node === undefined) return null;\n  if (typeof node === \"object\") return numberOrNull(node.total);", to: "  if (node === null || node === undefined) return 0;\n  if (typeof node === \"object\") return Number(node.total) || 0;", breaks: "A6/A8" },
  { name: "Speed read from the base, not the resolved total", file: PARTY, from: "      speed: readSpeed ? numberOrNull(readSpeed(actor)) : null", to: "      speed: numberOrNull(system.combat?.movement?.land?.base)", breaks: "A2" },
  { name: "a missing pool shown as 0/0", file: PARTY, from: "  if (!node || typeof node !== \"object\") return null;\n  const value = numberOrNull(node.value);", to: "  if (!node || typeof node !== \"object\") return { key, value: 0, max: 0, pct: 0 };\n  const value = numberOrNull(node.value);", breaks: "A7" },
  { name: "Conviction shown where the world does not use it", file: PARTY, from: "      if (key === \"conviction\" && !conviction) return null;\n", to: "", breaks: "A5" },
  { name: "a granted condition is removable", file: PARTY, from: "removable: Boolean(c.id) && !c.granted", to: "removable: Boolean(c.id)", breaks: "A9" },
  /* B */
  { name: "an unlinked copy is taken for the member", file: DASH, from: "    mine = list.filter((t) => t.actorLink && str(t.actorId) === str(member?.id));", to: "    mine = list.filter((t) => str(t.actorId) === str(member?.id));", breaks: "B1" },
  { name: "tokens in canvas order, not a fixed one", file: DASH, from: "  mine = [...mine].sort((a, b) => str(a.id).localeCompare(str(b.id)));", to: "  mine = [...mine];", breaks: "B1/B5" },
  { name: "Find never moves past the first token", file: DASH, from: "  return at < 0 ? tokens[0] : tokens[(at + 1) % tokens.length];", to: "  return tokens[0];", breaks: "B5" },
  { name: "a player is offered hidden tokens", file: DASH, from: "    .filter((token) => isGM || (token.visible && !token.document?.hidden))", to: "    .filter((token) => true)", breaks: "F12" },
  /* C */
  { name: "a roll of 0 counts as not rolled", file: DASH, from: "  const unrolled = mine.filter((c) => c.initiative === null || c.initiative === undefined);", to: "  const unrolled = mine.filter((c) => !c.initiative);", breaks: "C5" },
  { name: "several waiting: the dashboard guesses the first", file: DASH, from: "  if (unrolled.length > 1) return { state: \"several\", count: unrolled.length };\n", to: "", breaks: "C6/C8" },
  { name: "a combatant this user does not own is rolled", file: DASH, from: "  if (!unrolled[0].isOwner) return { state: \"notYours\" };\n", to: "", breaks: "C7/C8" },
  { name: "the party button rolls a member twice", file: DASH, from: "    if (state.state === \"ready\" && !ids.includes(state.id)) ids.push(state.id);", to: "    if (state.state === \"ready\") ids.push(state.id);", breaks: "C8" },
  /* D */
  { name: "a gated NPC sets a player's pace", file: DASH, from: "  const visible = active.filter((r) => !r.restricted);", to: "  const visible = active;", breaks: "D5" },
  { name: "missing members counted as members", file: DASH, from: "  const active = rows.filter((r) => !r.missing);", to: "  const active = rows;", breaks: "D4" },
  { name: "the summary's own APL arithmetic, not Chapter 12's", file: DASH, from: "  const apl = averagePartyLevel(visible.map((r) => r.level));", to: "  const apl = { apl: Math.floor(visible.reduce((s, r) => s + (r.level || 0), 0) / (visible.length || 1)), exact: 0, members: visible.length };", breaks: "D3/D7" },
  /* E */
  { name: "HP stops at zero (dying cannot be recorded)", file: DASH, from: "  if (key !== \"hp\") next = Math.max(0, next);", to: "  next = Math.max(0, next);", breaks: "E1" },
  { name: "AP may go negative", file: DASH, from: "  if (key !== \"hp\") next = Math.max(0, next);", to: "  if (key === \"pp\") next = Math.max(0, next);", breaks: "E2" },
  { name: "the stepper clamps to max itself", file: DASH, from: "  if (next === current) return null;\n  return { path:", to: "  next = Math.min(next, 1);\n  if (next === current) return null;\n  return { path:", breaks: "E4" },
  /* F */
  { name: "a player may step resources", file: SHEET, from: "  static async stepMemberResource(event, target) {\n    event.preventDefault();\n    if (!game.user.isGM) return;", to: "  static async stepMemberResource(event, target) {\n    event.preventDefault();", breaks: "F2" },
  { name: "a player may apply damage", file: SHEET, from: "  static async applyMemberDamage(event, target) {\n    event.preventDefault();\n    if (!game.user.isGM) return;", to: "  static async applyMemberDamage(event, target) {\n    event.preventDefault();", breaks: "F2" },
  { name: "a player may remove conditions", file: SHEET, from: "  static async removeMemberCondition(event, target) {\n    event.preventDefault();\n    if (!game.user.isGM) return;", to: "  static async removeMemberCondition(event, target) {\n    event.preventDefault();", breaks: "F2" },
  { name: "conditions written as raw effects, not through the toggle", file: SHEET, from: "    await member.toggleStatusEffect(id, { active: false });", to: "    await member.effects.find((e) => e.statuses?.has?.(id))?.delete();", breaks: "F5" },
  { name: "a granted condition may be removed by itself", file: SHEET, from: "    if (member.conditions?.granted?.has?.(id)) {", to: "    if (false) {", breaks: "F6" },
  { name: "initiative trusts the button and skips the state check", file: SHEET, from: "    const state = initiativeState(combat, member);\n    if (state.state !== \"ready\") {", to: "    const state = initiativeState(combat, member);\n    if (false) {", breaks: "F7" },
  { name: "a control acts on any actor named in the page", file: SHEET, from: "    if (!uuid || !normaliseMembers(this.actor.system.members).includes(uuid)) return null;", to: "    if (!uuid) return null;", breaks: "F9" },
  { name: "Select takes a token this user does not control", file: SHEET, from: "    const owned = tokens.filter((t) => game.user.isGM || t.isOwner);\n    if (!owned.length) {\n      ui.notifications?.warn(tokens.length", to: "    const owned = tokens;\n    if (!owned.length) {\n      ui.notifications?.warn(tokens.length", breaks: "F10" },
  { name: "GM controls on a gated NPC row", file: SHEET, from: "      gm: isGM && !summary.restricted", to: "      gm: isGM", breaks: "F14" },
  /* G */
  { name: "the toolbar moves inside the Overview tab", file: HBS, from: "  <div class=\"party-toolbar\" role=\"toolbar\" aria-label=\"Party actions\">", to: "  <div class=\"party-toolbar-gone\">", breaks: "G1" },
  { name: "a player gets the HP steppers", file: HBS, from: "                      {{#if m.controls.gm}}<span class=\"party-steppers\">\n                        <button type=\"button\" class=\"party-step\" data-action=\"stepMemberResource\" data-resource=\"hp\"", to: "                      {{#if true}}<span class=\"party-steppers\">\n                        <button type=\"button\" class=\"party-step\" data-action=\"stepMemberResource\" data-resource=\"hp\"", breaks: "G7" },
  { name: "a player gets the damage button", file: HBS, from: "{{#if m.controls.gm}}<button type=\"button\" data-action=\"applyMemberDamage\"", to: "<button type=\"button\" data-action=\"applyMemberDamage\"", breaks: "G10" },
  { name: "a missing Defence prints blank", file: HBS, from: "{{#if (eq m.stats.defence null)}}&mdash;{{else}}{{m.stats.defence}}{{/if}}", to: "{{m.stats.defence}}", breaks: "G11" },
  // Re-anchored 3.712.0 (Stage 5): the Notes tab is built, so the defect is now its loss.
  { name: "the built Notes tab is not declared", file: SHEET, from: "        { id: \"notes\", icon: \"fa-solid fa-book-open\", label: \"Notes\" }", to: "", breaks: "G4" },
  /* H */
  { name: "every combatant change re-renders", file: LS, from: "      if (event === \"updateCombatant\" && !(\"initiative\" in (rest[0] ?? {})) && !(\"hidden\" in (rest[0] ?? {}))) return 0;\n", to: "", breaks: "H2" },
  { name: "every turn re-renders every sheet", file: LS, from: "      if (\"active\" in changes || \"scene\" in changes) tellEveryone();", to: "      tellEveryone();", breaks: "H4" },
  { name: "a token moving re-renders", file: LS, from: "      if (event === \"updateToken\" && !TOKEN_FIELDS.some((field) => field in (rest[0] ?? {}))) return 0;\n", to: "", breaks: "H8" },
  { name: "a linked token placed is not noticed", file: LS, from: "      if (document?.actorLink && document?.actorId) tell(`Actor.${document.actorId}`);\n", to: "", breaks: "H7" },
  /* L — the live test's findings (3.709.1) */
  { name: "LIVE: Foundry's pass leaves every player control disabled", file: SHEET, from: "      if (!offAlready.has(el)) el.disabled = false;", to: "      ;", breaks: "L1" },
  { name: "LIVE: a control the template disabled is re-enabled", file: SHEET, from: "      if (!offAlready.has(el)) el.disabled = false;", to: "      el.disabled = false;", breaks: "L1/L2" },
  { name: "LIVE: the tabs are not marked for players", file: HBS, from: "data-action=\"tab\" data-player-ok", to: "data-action=\"tab\"", breaks: "L3" },
  { name: "LIVE: Take Coin is not marked for players", file: HBS, from: "class=\"party-take-coin\" data-player-ok data-action=\"takeCoin\"", to: "class=\"party-take-coin\" data-action=\"takeCoin\"", breaks: "L3" },
  { name: "LIVE: a GM-only stepper is marked for players", file: HBS, from: "{{#if m.controls.gm}}<span class=\"party-steppers\">\n                        <button type=\"button\" class=\"party-step\" data-action=\"stepMemberResource\" data-resource=\"hp\" data-delta=\"-1\"", to: "{{#if m.controls.gm}}<span class=\"party-steppers\">\n                        <button type=\"button\" class=\"party-step\" data-player-ok data-action=\"stepMemberResource\" data-resource=\"hp\" data-delta=\"-1\"", breaks: "L4" },
  { name: "LIVE: + writes above the maximum again", file: DASH, from: "  if (step > 0 && Number.isFinite(top) && max !== null) next = Math.min(next, Math.max(top, current));\n", to: "", breaks: "L6/L7/L8" },
  { name: "LIVE: an over-maximum value is clamped down by a raise", file: DASH, from: "next = Math.min(next, Math.max(top, current));", to: "next = Math.min(next, top);", breaks: "L9" },
  { name: "LIVE: the sheet does not pass the maximum", file: SHEET, from: "      key, value: member.system?.resources?.[key]?.value, max: member.system?.resources?.[key]?.max,", to: "      key, value: member.system?.resources?.[key]?.value,", breaks: "L10" },
  /* I, Z */
  { name: "the member panel scrolls sideways", file: CSS, from: ".trg-prime .party-member-body {\n  display: flex;\n  flex-wrap: wrap;", to: ".trg-prime .party-member-body {\n  display: flex;\n  flex-wrap: nowrap;", breaks: "I2" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.720.1\"", to: "\"version\": \"3.708.1\"", breaks: "Z1" },
  { name: "package.json is left behind", file: PJ, from: "\"version\": \"3.720.1\"", to: "\"version\": \"3.708.1\"", breaks: "Z1" }
];

function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-party-sheet-stage2.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-party-sheet-stage2: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-party-sheet-stage2: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-party-sheet-stage2: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
