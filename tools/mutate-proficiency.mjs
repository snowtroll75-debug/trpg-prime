#!/usr/bin/env node
/**
 * mutate-proficiency — can verify-proficiency fail?
 *
 * NEW at 3.535.0, alongside the verify it exists to falsify.
 *
 * THIS PAIR IS THE WHOLE POINT OF THE RELEASE. `proficiency-rules.mjs`
 * shipped for sixteen releases with a header claiming a harness that did
 * not exist, and the way that claim stayed true-looking is that nothing
 * ever tried to break it. A verify with no mutate is a verify that has
 * never been asked whether it can fail — which is the same position the
 * module was in before, with more files.
 *
 * G1–G3 ARE POSITIVE CONTROLS ON THE VERIFY ITSELF. Three of them,
 * because this file's checks scan populations — the tower shield, the
 * named items, the cross-product — and "no violations" is also what an
 * empty search returns. That exact vacuity survived at 3.533.0 and again
 * at 3.534.0; it is not a hypothetical failure mode here.
 *
 * WHAT IS DELIBERATELY NOT MUTATED: the fail-open branch for items with
 * no category. Removing it puts a -4 on every attack in every existing
 * world, and the module's own comment says so. A mutation that "breaks"
 * by making the pack universally non-proficient would be caught by S2
 * for the wrong reason — it would prove the harness notices a
 * catastrophe, not that it notices a rule.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "proficiency-rules.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-proficiency.mjs");

const MUTATIONS = [
  /* ── A: armour ─────────────────────────────────────────────────── */
  {
    file: P,
    name: "A1 A NAMED EXCLUSION STOPS EXCLUDING",
    from: "    if (profile.armourExclude.has(key)) {",
    to: "    if (false) {",
    breaks: "R1 — the Bard's leather helmet is barred by name and by nothing else, so a "
      + "dead exclusion hands out an item the class does not have"
  },
  {
    file: P,
    name: "A2 THE OTHER-ARMOUR TIERS STOP BEING TIERED",
    from: '      for (const tier of profile.otherTiers) {',
    to: '      for (const tier of []) {',
    breaks: "R1b — every helmet, greave and bracer in the Other table becomes unusable by "
      + "everyone, which is most of what a fighting character wears"
  },
  {
    file: P,
    name: "A3 ARMOUR NAMED SPECIFICALLY IS NO LONGER GRANTED",
    from: "      if (profile.armourNames.has(key)) {",
    to: "      if (false) {",
    breaks: "R-section — the Ranger's medium armour is granted by name rather than by "
      + "category, so this is the whole of what the class prints"
  },
  {
    file: P,
    name: "A4 THE MATERIAL RULES STOP GRANTING",
    from: "      if (armourRuleMatches(rule, item)) return { proficient: true, why: rule.why ?? \"granted\" };",
    to: "      if (false) return { proficient: true, why: rule.why ?? \"granted\" };",
    breaks: "R1b/S-section — the module's comment says these were split across two "
      + "branches once and a Fey lost a leather helmet it was plainly proficient with"
  },

  /* ── S: shields ────────────────────────────────────────────────── */
  {
    file: P,
    name: "S1 SHIELD CATEGORIES STOP GRANTING",
    from: "    if (profile.shieldCategories.has(category)) {",
    to: "    if (false) {",
    breaks: "S5b/S5c — nobody may raise any shield, tower included, and the printed "
      + "sentences all disagree with the table at once"
  },
  {
    file: P,
    name: "S2 A SHIELD NAMED SPECIFICALLY IS NO LONGER GRANTED",
    from: "    if (profile.shieldNames.has(key)) {",
    to: "    if (false) {",
    breaks: "R2/R2b — the Druid's wooden and bone shields are named, not categorised"
  },
  {
    file: P,
    name: "S3 EVERY SHIELD BECOMES A TOWER SHIELD'S EQUAL",
    from: "    if (profile.shieldCategories.has(category)) {",
    to: "    if (profile.shieldCategories.size) {",
    breaks: "S5b/S5c — the five classes whose shields stop at heavy would raise a tower "
      + "shield anyway, and the parenthetical in two printed sentences would mean nothing"
  },

  /* ── W: weapons ────────────────────────────────────────────────── */
  {
    file: P,
    name: "W1 WEAPON GROUPS STOP GRANTING",
    from: "    if (profile.weaponGroups.has(norm(system.group))) {",
    to: "    if (false) {",
    breaks: "S-section — a class granted a whole weapon group loses all of it, which is "
      + "how the alchemical group is given"
  },
  {
    file: P,
    name: "W2 THE RUNE WAIVER GRANTS PROFICIENCY TO EVERYONE",
    from: "    const waiver = weaponWaivesProficiency(item);\n    if (waiver.waived) return { proficient: true, why: waiver.why };",
    to: "    return { proficient: true, why: \"granted\" };",
    breaks: "S-section — every non-proficient weapon in the game would come out proficient "
      + "and the -4 would never appear on any card"
  },

  /* ── C: the table itself ───────────────────────────────────────── */
  {
    file: P,
    name: "C1 THE CREATURE CLASSES FALL OUT OF THE LOOKUP",
    // Anchor updated at 3.560.0: a module class (registered) answers after
    // both core tables, so the line grew a third operand.
    from: "  const entry = CLASS_PROFICIENCY[key] ?? CREATURE_CLASS_PROFICIENCY[key] ?? registered;",
    to: "  const entry = CLASS_PROFICIENCY[key] ?? registered;",
    breaks: "C1/C2/C3 — this is the exact drift that went unnoticed for sixteen releases, "
      + "and the harness now exists to notice it"
  },
  {
    file: P,
    name: "C2 NAME MATCHING BECOMES CASE-SENSITIVE",
    from: "  .toLowerCase()\n  .replace(/[^a-z0-9]/g, \"\");",
    to: "  .replace(/[^a-z0-9]/g, \"\");",
    breaks: "N1 — every name the table spells differently from the pack silently grants "
      + "nothing, in both the grant and the exclusion direction"
  },

  {
    file: P,
    name: "R6 THE SHIELD LIST THAT STOPS AT HEAVY STOPS STOPPING",
    from: 'const SHIELDS_BUT_TOWER = ["buckler", "light", "heavy"];',
    to: 'const SHIELDS_BUT_TOWER = ["buckler", "light", "heavy", "tower"];',
    breaks: "R6/R6b/S5b — Graham ruled on 9 Sep 2026 that the Crusader has no tower "
      + "shield; this is that ruling being quietly undone in the table"
  },

  /* ── G: positive controls on the verify ────────────────────────── */
  {
    file: V,
    name: "G1 THE TOWER-SHIELD SEARCH LOOKS FOR A CATEGORY THAT DOES NOT EXIST",
    from: '  && String(i.system?.category ?? "").toLowerCase() === "tower");',
    to: '  && String(i.system?.category ?? "").toLowerCase() === "notower");',
    breaks: "S5a — with no tower shield found, every class is trivially not proficient "
      + "with it and S5b would compare two empty lists and pass"
  },
  {
    file: V,
    name: "G2 THE PROSE TEST MATCHES A WORD EVERY CLASS PRINTS",
    from: '  .filter((c) => /tower/i.test(String(c.system?.proficiencies ?? "")))',
    to: '  .filter((c) => /shield/i.test(String(c.system?.proficiencies ?? "")))',
    breaks: "S5b — the coupling would be asserted against a word that carries no meaning, "
      + "which is the parser-that-invents-defects this file refuses to write"
  },
  {
    file: V,
    name: "G3 THE CROSS-PRODUCT RUNS OVER NO ITEMS AT ALL",
    from: "const gear = [...packContents.values()].flat();",
    to: "const gear = [];",
    breaks: "C0/N1/S0/P1 — an empty pack list makes every population check in the file pass "
      + "by finding nothing, and that is the failure this harness has already shipped twice"
  },
  {
    file: V,
    name: "G4 THE PACK WALK GOES BACK TO A HARDCODED LIST",
    from: 'const allPackNames = fs.readdirSync(path.join(SYSTEM_ROOT, "packs"))\n  .filter((d) => fs.statSync(path.join(SYSTEM_ROOT, "packs", d)).isDirectory());',
    to: 'const allPackNames = ["armour", "weapons", "shields"];',
    breaks: "P1 — this is the 3.535.0 defect re-introduced exactly as it shipped: a list "
      + "that looks complete, omits the packs holding every named magic item, and reports "
      + "a clean pass over what it cannot see"
  },
  {
    file: V,
    name: "G5 THE FAIL-OPEN CHECK STOPS LOOKING FOR EMPTY CATEGORIES",
    from: 'const fallsOpen = (item) => !String(item?.system?.category ?? "").trim();',
    to: 'const fallsOpen = (item) => String(item?.system?.category ?? "").trim() === "\u0000";',
    breaks: "P2 — the seven categoryless magic weapons could return and every class would "
      + "swing them freely again, which is the half of this defect no mutation of the "
      + "module itself can reach"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-proficiency: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-proficiency: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-proficiency: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
