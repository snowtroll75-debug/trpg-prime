#!/usr/bin/env node
/**
 * mutate-sourcebooks — the mutation half of verify-sourcebooks.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const SB = m("sourcebooks.mjs"), API = m("module-api.mjs"), AW = m("module-api-workflow.mjs"), PW = m("picker-workflow.mjs");
const CP = m("content-packs.mjs"), GR = m("grants.mjs"), GW = m("grants-workflow.mjs");
const MUTATIONS = [
  { name: "a module's content is filed as Core", file: SB, from: "  if (!id || id === SYSTEM_ID) return CORE_SOURCEBOOK;", to: "  return CORE_SOURCEBOOK;", breaks: "A2" },
  { name: "the manifest flag is ignored", file: SB, from: "  for (const candidate of [registered, manifestFlag, KNOWN_SOURCEBOOKS[id]?.title]) {", to: "  for (const candidate of [registered, KNOWN_SOURCEBOOKS[id]?.title]) {", breaks: "A2" },
  { name: "the \"TRG Prime:\" prefix stays on the title", file: SB, from: "  const title = String(moduleTitle ?? \"\").replace(/^\\s*TRG\\s*Prime\\s*[:\\-–—]\\s*/i, \"\").trim();", to: "  const title = String(moduleTitle ?? \"\").trim();", breaks: "A2" },
  { name: "the system's book can be renamed", file: API, from: "  if (id === \"trg-prime\") { problem(\"registerSourcebook: the system's own content is the Core Rulebook and cannot be renamed\"); return false; }\n", to: "", breaks: "A4" },
  { name: "the menu opens on All", file: SB, from: "    defaultValue: CORE_SOURCEBOOK,\n", to: "", breaks: "B1" },
  { name: "every entry is read as one book", file: SB, from: "    read: (entry) => resolve(entry?.packageName ?? SYSTEM_ID)", to: "    read: (entry) => resolve(\"trg-pillars-of-faith\")", breaks: "B1" },
  { name: "the menu is added twice", file: SB, from: "  if (list.some((f) => f?.key === \"sourcebook\")) return list;\n", to: "", breaks: "B2" },
  { name: "F&F's feats stay out", file: SB, from: "    packs: Object.freeze({ races: \"races\", heritages: \"heritages\", abilities: \"abilities\", feats: \"feats\" })", to: "    packs: Object.freeze({ races: \"races\", heritages: \"heritages\", abilities: \"abilities\" })", breaks: "C1" },
  { name: "registered packs come first", file: CP, from: "  const extenders = [...declaredPacks, ...registeredPacks];", to: "  const extenders = [...registeredPacks, ...declaredPacks];", breaks: "C3" },
  { name: "the granting item's book is not preferred", file: SB, from: "    if (own.length === 1) return own[0];", to: "    if (own.length === 2) return own[0];", breaks: "D1" },
  { name: "a tie across books picks the first", file: SB, from: "  return core.length === 1 ? core[0] : null;", to: "  return core.length === 1 ? core[0] : (list[0] ?? null);", breaks: "D1" },
  { name: "the compendium source is not read", file: SB, from: "  const m = /^Compendium\\.([^.]+)\\./.exec(source);", to: "  const m = null;", breaks: "D2" },
  { name: "matchGrants ignores books", file: GR, from: "    return preferredBySourcebook(candidates, preferPackage);", to: "    return null;", breaks: "D3" },
  { name: "the picker has no Sourcebook menu", file: PW, from: "  const facets = withSourcebookFacet(slotFacets, sourcebookResolver());", to: "  const facets = slotFacets;", breaks: "E1" },
  { name: "F&F is never registered", file: AW, from: "export function fireRegistrationHook(api) {\n  registerKnownSourcebookPacks();", to: "export function fireRegistrationHook(api) {", breaks: "E2" },
  { name: "the packs are looked up in game.packs again, empty at init", file: AW, from: "    const declared = new Map(Array.from(mod.packs ?? []).map((p) => [`${moduleId}.${p.name}`, p]));", to: "    const declared = new Map(Array.from(globalThis.game?.packs ?? []).map((p) => [p.collection, p]));", breaks: "E6" },
  { name: "a picker opens on an empty list", file: PW, from: "      if (books?.value) { books.value = \"\"; apply(); }", to: "      if (false) { books.value = \"\"; apply(); }", breaks: "E7" },
  { name: "the menu is built from the gated entries again", file: PW, from: "      const source = facet.valuesFrom === \"all\" ? fullIndex : entries;", to: "      const source = entries;", breaks: "E8" },
  { name: "the sourcebook facet does not ask for the whole pack", file: SB, from: "    valuesFrom: \"all\",\n", to: "", breaks: "B5" },
  { name: "the grant passes no book", file: GW, from: ", preferPackage: sourcePackageOf(sourceItem) });", to: " });", breaks: "E5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-sourcebooks.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-sourcebooks: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-sourcebooks: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-sourcebooks: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
