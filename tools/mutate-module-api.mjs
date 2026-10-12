#!/usr/bin/env node
/**
 * mutate-module-api — twelve mutations against verify-module-api.mjs.
 *
 * Each one is a way the companion-module API could quietly stop working
 * while every file still parsed: the federation dropping the system pack
 * or sweeping in strangers, a registry consulted by nobody, a core entry
 * overwritten by a module, the hook never fired. Each must turn the
 * verify red; one that survives is a hole in the verify, and is reported
 * as a failure rather than a skip.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const PACKS = path.join(SYSTEM_ROOT, "module", "content-packs.mjs");
const API = path.join(SYSTEM_ROOT, "module", "module-api.mjs");
const RACIAL = path.join(SYSTEM_ROOT, "module", "racial-pp.mjs");
const LANG = path.join(SYSTEM_ROOT, "module", "languages.mjs");
const ACTIONS = path.join(SYSTEM_ROOT, "module", "data", "skill-actions.mjs");
const FEATS = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const CONFIG = path.join(SYSTEM_ROOT, "module", "config.mjs");
const INIT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");

const MUTATIONS = [
  {
    name: "federation drops the system pack",
    file: PACKS,
    from: "  return system ? [system, ...extenders] : extenders;",
    to: "  return extenders;",
    breaks: "A1 — a chooser would see only module content"
  },
  {
    name: "federation sweeps in every module pack, flag or not",
    file: PACKS,
    from: "  const registeredPacks = all.filter((p) => eligible(p) && !declares(p) && registered.has(idOf(p)));",
    to: "  const registeredPacks = all.filter((p) => eligible(p) && !declares(p));",
    breaks: "A3 — an unrelated module's spells would land in the feats chooser"
  },
  {
    name: "a runtime registration is ignored",
    file: PACKS,
    from: "&& !declares(p) && registered.has(idOf(p)));",
    to: "&& !declares(p) && false);",
    breaks: "A2 — registerPack would do nothing"
  },
  {
    name: "getDocument only ever asks the system pack",
    file: PACKS,
    from: "      if (pack.index?.size && !pack.index.has(id)) continue;",
    to: "      if (pack !== this.primary) continue;",
    breaks: "A14 — a picked module entry could never be fetched"
  },
  {
    name: "a system pack can be re-registered",
    file: API,
    from: '  if (id.startsWith("trg-prime.")) { problem(`registerPack: "${id}" is a system pack and cannot be re-registered`); return false; }',
    to: "",
    breaks: "A5/A6 — a module could point a core name at a module pack"
  },
  {
    name: "racialPPDue never consults the registry",
    file: RACIAL,
    from: "RACIAL_PP_PER_LEVEL[key] ?? HERITAGE_PP_PER_LEVEL[key] ?? registeredRacialPP(key) ?? 0",
    to: "RACIAL_PP_PER_LEVEL[key] ?? HERITAGE_PP_PER_LEVEL[key] ?? 0",
    breaks: "B4 — a module race's PP would silently be 0"
  },
  {
    name: "addLanguage overwrites a core language",
    file: LANG,
    from: "  if (!clean || CANONICAL.has(clean.toLowerCase())) return false;",
    to: "  if (!clean) return false;",
    breaks: "B12/B13 — a module could change Aelvish's rarity"
  },
  {
    name: "addSkillActions replaces a core key",
    file: ACTIONS,
    from: '    if (!key || SKILL_ACTIONS.some((a) => a.key === key)) { skipped.push(key || "?"); continue; }',
    to: '    if (!key) { skipped.push("?"); continue; }',
    breaks: "B31/B32 — Tumble could be shadowed by a module"
  },
  {
    name: "effectiveClasses ignores registered archetypes",
    file: FEATS,
    from: "    for (const extra of ARCHETYPE_CLASS_GRANTS[classKey] ?? registeredArchetype(classKey)?.classGrants ?? []) {",
    to: "    for (const extra of ARCHETYPE_CLASS_GRANTS[classKey] ?? []) {",
    breaks: "B22 — a module archetype would open no class feats"
  },
  {
    name: "substituteSkillActions ignores registered substitutions",
    file: FEATS,
    from: "    const raw = SKILL_SUBSTITUTION_FEATS[key] ?? registeredSkillSubstitution(key);",
    to: "    const raw = SKILL_SUBSTITUTION_FEATS[key];",
    breaks: "B24b — Rite of Passing would never open Perform Last Rites from Perform"
  },
  {
    name: "classNeedsDivineAspect ignores registered classes",
    file: CONFIG,
    from: "  return DIVINE_ASPECT_CLASSES.includes(clean) || Boolean(registeredClass(clean)?.needsDivineAspect);",
    to: "  return DIVINE_ASPECT_CLASSES.includes(clean);",
    breaks: "B17 — a module Healer would never be offered a Divine Aspect"
  },
  {
    name: "the degree resolver ignores registered upgrades",
    file: path.join(SYSTEM_ROOT, "module", "skill-feats.mjs"),
    from: "    const entries = registeredDegreeUpgrades(name);",
    to: "    const entries = null;",
    breaks: "B24d — Keeper of Records would never upgrade a Partial"
  },
  {
    name: "the registration hook is never fired",
    file: INIT,
    from: "  fireRegistrationHook(game.trgPrime.modules);",
    to: "  // fireRegistrationHook(game.trgPrime.modules);",
    breaks: "C2 — no module could register anything"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-module-api.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([PACKS, API, RACIAL, LANG, ACTIONS, FEATS, CONFIG, INIT, path.join(SYSTEM_ROOT, "module", "skill-feats.mjs")]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-module-api: verify-module-api already fails on an unmodified tree. Fix that first.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${occurrences})` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-module-api: FAILED — ${bad.length} of ${results.length} mutations were not caught.\n`
    : `\nmutate-module-api: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
