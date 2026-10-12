#!/usr/bin/env node
/**
 * mutate-conjured-weapon — can verify-conjured-weapon fail?
 *
 * NEW at 3.543.0, beside the verify.
 *
 * C2 AND C3 PULL AGAINST EACH OTHER on purpose. One says the martial warp
 * must WIDEN the list, the other that no warp may put a two-handed weapon
 * on it. A filter that simply gave up would satisfy the first and break
 * the second, so neither can rot quietly.
 *
 * C4 IS THE ONE THE HARNESS FOUND FOR ITSELF. My first melee test read
 * `system.range`, which is 0 on every weapon in the pack because reach
 * lives in the traits string — so the check passed while a Composite
 * Shortbow sat in the offered list. The mutation restores that reading.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "conjured-weapon.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "conjured-weapon-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-conjured-weapon.mjs");

const MUTATIONS = [
  {
    file: R,
    name: "C1 THE CATEGORY FILTER STOPS FILTERING",
    from: "  if (!cats.includes(category)) return false;",
    to: "  if (false) return false;",
    breaks: "C1/N2 — the caster is offered every weapon in the game, which is a bigger "
      + "spell than the one that was written"
  },
  {
    file: R,
    name: "C2 THE MARTIAL WARP REPLACES INSTEAD OF WIDENING",
    from: "  return [...base, ...added].filter((c) => {",
    to: "  return [...(added.length ? added : base)].filter((c) => {",
    breaks: "C2 — buying \"the weapon can be a martial weapon\" would take the simple ones "
      + "away, and no warp in the pack removes something already paid for"
  },
  {
    file: R,
    name: "C3 THE HAND COUNT STOPS MATTERING",
    from: "  if (rule.hands != null && Number(item?.system?.hands ?? 1) !== Number(rule.hands)) return false;",
    to: "  if (false) return false;",
    breaks: "C3 — a greatsword becomes conjurable, and the spell says one-handed"
  },
  {
    file: R,
    name: "C4 THE MELEE TEST GOES BACK TO READING system.range",
    from: "    const traits = String(item?.system?.traits ?? \"\");\n    if (/\\brange\\b/i.test(traits)) return false;",
    to: "    if (Number(item?.system?.range ?? 0) > 0) return false;",
    breaks: "C4b — this is exactly what shipped in my first draft: every pack weapon has "
      + "range 0, so the test passes on a field nobody uses and a bow is offered"
  },
  {
    file: R,
    name: "C4c THE MELEE TEST ALSO REJECTS THROWN WEAPONS",
    from: "    if (/\\brange\\b/i.test(traits)) return false;",
    to: "    if (/\\brange\\b|\\bthrown\\b/i.test(traits)) return false;",
    breaks: "C4c — a trident is a melee weapon you may also throw; excluding it is the "
      + "filter over-reaching in the other direction"
  },
  {
    file: R,
    name: "D2 THE DAMAGE TYPE IS NOT OVERRIDDEN",
    from: "  data.system.damageType = rule?.damageType ?? CONJURED_WEAPON_DAMAGE;",
    to: "  data.system.damageType = data.system.damageType ?? CONJURED_WEAPON_DAMAGE;",
    breaks: "D2 — the conjured weapon deals its ordinary damage, and \"of pure magic\" "
      + "means nothing"
  },
  {
    file: R,
    name: "D2b THE PACK ENTRY IS MUTATED INSTEAD OF COPIED",
    from: "  const data = foundryClone(base);",
    to: "  const data = base;",
    breaks: "D2b — every future mace in the game turns to force damage, and only the "
      + "first cast looks right"
  },
  {
    file: R,
    name: "D4 THE WEAPON ARRIVES ALREADY EQUIPPED",
    from: "  data.system.equipped = false;",
    to: "  data.system.equipped = true;",
    breaks: "D4 — \"you can wield it OR GIVE IT to another creature\"; the spell makes the "
      + "weapon, it does not decide whose hand it is in"
  },
  {
    file: R,
    name: "N1 A ROW WITH NO CATEGORIES IS ACCEPTED",
    from: "  if (!categories.length) return null;",
    to: "  if (false) return null;",
    breaks: "N1 — an authoring mistake becomes a spell that offers everything"
  },
  {
    file: F,
    name: "E1 THE WEAPON STOPS SAYING IT ENDS WITH THE SPELL",
    from: "      castId: castId ?? null,\n      endsWithSpell: true",
    to: "      castId: castId ?? null",
    breaks: "E1/E2 — THIS IS WHAT 3.543.0 ACTUALLY SHIPPED. The collector reads "
      + "endsWithSpell, so without it the conjured weapon is permanent: six PP for a "
      + "force weapon that never goes away. Measured live before the check existed"
  },
  {
    file: E,
    name: "E2 THE COLLECTOR IGNORES THE DECLARATION AND KEEPS EVERYTHING",
    from: "  if (ids.length) await actor.deleteEmbeddedDocuments(\"Item\", ids);",
    to: "  if (false) await actor.deleteEmbeddedDocuments(\"Item\", ids);",
    breaks: "E2 — the flag is stamped and nothing reads it, which is worth exactly as "
      + "much as the comment that claimed removal happened"
  },
  {
    file: E,
    name: "E2b THE COLLECTOR TAKES EVERY ITEM OF THAT CASTING",
    from: "      && i.getFlag?.(SYSTEM_ID, \"endsWithSpell\") === true)",
    to: "      && true)",
    breaks: "E2b — Bless Water's Holy Water is made by a spell and the caster KEEPS it; "
      + "a collector that empties the inventory would satisfy E2 alone"
  },
  {
    file: W,
    name: "A1 THE NEW MOD IS NEVER AGGREGATED — offered, charged, dropped",
    from: "    if (Array.isArray(m.weaponCategories) && m.weaponCategories.length) {",
    to: "    if (false) {",
    breaks: "C2/P2 — the martial warp charges 1 PP and widens nothing, which is the shape "
      + "every unbuilt warp in this pack already wears"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, W, F, E, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-conjured-weapon: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-conjured-weapon: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-conjured-weapon: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
