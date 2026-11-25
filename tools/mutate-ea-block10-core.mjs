#!/usr/bin/env node
/** mutate-ea-block10-core — the mutation half of verify-ea-block10-core (3.693.0: H27 investment cost and refusal, H28 damage ignored as healing). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const p = (...x) => path.join(SYSTEM_ROOT, ...x);
const MI = p("module", "magic-items.mjs");
const MIW = p("module", "magic-items-workflow.mjs");
const API = p("module", "module-api.mjs");
const APIW = p("module", "module-api-workflow.mjs");
const SHEET = p("module", "sheets", "actor-sheet.mjs");
const RW = p("module", "reactions", "reactions-workflow.mjs");
const DW = p("module", "combat", "damage-workflow.mjs");
const CW = p("module", "magic", "cast-workflow.mjs");
const SJ = p("system.json");
const AS = p("module", "magic", "area-save-workflow.mjs");
const HZ = p("module", "magic", "hazard-terrain-workflow.mjs");
const CC = p("module", "dice", "check-card-interactions.mjs");
const IL = p("module", "item-innate-level.mjs");
const MUTATIONS = [
  { name: "H27 a bad answer is a cost", file: MI, from: "    if (Number.isFinite(v) && v >= 0) return v;", to: "    return Number.isFinite(v) ? v : 0;" },
  { name: "H27 an unanswered item is free", file: MI, from: "    if (Number.isFinite(v) && v >= 0) return v;\n  }\n  return 1;", to: "    if (Number.isFinite(v) && v >= 0) return v;\n  }\n  return 0;" },
  { name: "H27 uninvested items count", file: MI, from: "    if (!i?.system?.invested || (except && i === except)) continue;", to: "    if (except && i === except) continue;" },
  { name: "H27 the item itself is counted twice", file: MI, from: "    if (!i?.system?.invested || (except && i === except)) continue;", to: "    if (!i?.system?.invested) continue;" },
  { name: "H27 a module's refusal is not asked by investRefusal", file: MIW, from: "  const mine = await moduleInvestRefusal(actor, item);\n  if (mine) return mine;\n", to: "" },
  { name: "H27 investItem skips a module's refusal", file: MIW, from: "\n      || await moduleInvestRefusal(actor, item);", to: ";" },
  { name: "H27 a refused step still invests", file: MIW, from: "      if (answer?.refused) {", to: "      if (false) {" },
  { name: "H27 investItem counts by items again", file: MIW, from: "  if (usedBefore + cost > slots) {", to: "  if (usedBefore + 1 > slots) {" },
  { name: "H27 investRefusal counts by items", file: MIW, from: "  if (used + cost > slots) return", to: "  if (used + 1 > slots) return" },
  { name: "H27 the sheet counts items", file: SHEET, from: "    const investedCount = investedSlotsUsed(Array.from(actor.items ?? []), actor, registeredInvestCosts());", to: "    const investedCount = Array.from(actor.items ?? []).filter((i) => i.system?.invested).length;" },
  { name: "H27 the cost is not registered", file: API, from: "  registry.investCosts.set(k, fn);", to: "" },
  { name: "H27 the helper is not exposed", file: APIW, from: "    registerInvestRefusal: (key, fn, moduleId) => registerInvestRefusal(key, fn, moduleId),", to: "" },
  { name: "H28 the amount is not carried", file: RW, from: "    // knows it; null where it does not.\n    amount: Number.isFinite(Number(event.amount))", to: "    // knows it; null where it does not.\n    amountX: Number.isFinite(Number(event.amount))" },
  { name: "H28r a later packet's amount is not carried", file: RW, from: "    types: Array.from(event.types ?? []).map((t) => String(t ?? \"\").trim().toLowerCase()).filter(Boolean),\n    amount: Number.isFinite", to: "    types: Array.from(event.types ?? []).map((t) => String(t ?? \"\").trim().toLowerCase()).filter(Boolean),\n    amountX: Number.isFinite" },
  { name: "H28 the fraction rounds up", file: RW, from: "  return Math.max(0, Math.floor(a * h));", to: "  return Math.max(0, Math.ceil(a * h));" },
  { name: "H28 an unknown amount heals nothing silently", file: RW, from: "  if (amount === null || amount === undefined) return null;", to: "  if (amount === null || amount === undefined) return 0;" },
  { name: "H28 the heal is never applied", file: RW, from: "  const healed = await healActor(target, back, { magical: true });\n  return [`${target.name} regains", to: "  const healed = back; void healActor;\n  return [`${target.name} regains" },
  { name: "H28r a cast's healing is not remembered", file: RW, from: "        if (out.scope === \"cast\") rememberHeal(scopeKey, target, grant);", to: "" },
  { name: "H28r a later packet is not healed", file: RW, from: "    for (const grant of healsRemembered(scopeKey, target)) {", to: "    for (const grant of []) {" },
  { name: "H28r a secondary type healed at the primary's amount", file: RW, from: "  return types.slice(1).some((t) => grant.includes(t)) ? \"byHand\" : \"none\";", to: "  return types.slice(1).some((t) => grant.includes(t)) ? \"amount\" : \"none\";" },
  { name: "H28r any type heals", file: RW, from: "  if (grant.includes(\"all\") || grant.includes(types[0])) return \"amount\";", to: "  return \"amount\";" },
  { name: "H28r the area save passes no amount", file: AS, from: "{ spellName: \"\", source: null, amount: dealt }", to: "{ spellName: \"\", source: null }" },
  { name: "H28r the area save drops the lines", file: AS, from: " + bracersLine + (reactionLines.length ? ` ${reactionLines.join(\" \")}` : \"\");", to: " + bracersLine;" },
  { name: "H28r the hazard passes no amount", file: HZ, from: "source: null, amount: rolls.reduce((a, b) => a + b, 0) });", to: "source: null });" },
  { name: "H28r the cage drops the lines", file: CC, from: "outcome), ...reactionLines];", to: "outcome)];" },
  { name: "H28 a typed packet passes no amount", file: DW, from: "      amount: Math.max(0, Math.floor(Number(amount) || 0))\n    }));", to: "      amountX: 0\n    }));" },
  { name: "H28 a spell attack passes no amount", file: CW, from: "spellDamageReactions(targetActor, spell, actor, [damageType], dealt)", to: "spellDamageReactions(targetActor, spell, actor, [damageType])" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.714.0\"", to: "\"version\": \"3.693.0\"" },
  { name: "H29 an opted-in grant is not read", file: IL, from: "(flags.grantedBy?.atItemLevel === true ? flags.grantedBy?.sourceId : null)", to: "null" },
  { name: "H29 every grant is read, opted in or not", file: IL, from: "(flags.grantedBy?.atItemLevel === true ? flags.grantedBy?.sourceId : null)", to: "(flags.grantedBy?.sourceId ?? null)" },
  { name: "H29 the opt-in comes before the rune's record", file: IL, from: "flags[GRANT_FLAG]?.itemId ?? (flags.grantedBy", to: "(flags.grantedBy?.atItemLevel === true ? flags.grantedBy?.sourceId : null) ?? flags[GRANT_FLAG]?.itemId ?? (flags.grantedBy" },
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-ea-block10-core.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-ea-block10-core: verify-ea-block10-core already fails on the unmutated tree."); process.exit(1); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block10-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block10-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
