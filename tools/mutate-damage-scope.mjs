#!/usr/bin/env node
/**
 * mutate-damage-scope — can verify-damage-scope fail?
 * NEW at 3.460.0.
 *
 * W4 IS THE ONE THAT PROTECTS EVERY OTHER SPELL. This mechanism sits in
 * the middle of the save path that 87 damaging spells use, and the only
 * thing keeping it out of their way is that a spell with no declaration
 * gets no scope. A mutation that scoped them all would be catastrophic
 * and completely silent.
 *
 * R3 IS GRAHAM'S CARD. A bystander who cannot be touched must not roll a
 * save — a column of successful saves is a card describing an event that
 * did not happen.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const S = path.join(SYSTEM_ROOT, "module", "magic", "damage-scope.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-damage-scope.mjs");

const MUTATIONS = [
  {
    file: S,
    name: "S1 an empty scope matches everyone",
    from: "  return immuneTo ? { immuneTo } : null;",
    to: "  return { immuneTo };",
    breaks: "S3 — a restriction that restricts nothing"
  },
  {
    file: S,
    name: "S2 any declaration is read as a scope",
    from: '  if (!raw.startsWith(IMMUNE_PREFIX)) return null;',
    to: "  if (!raw) return null;",
    breaks: "S4 — a typo would silently restrict a spell"
  },
  {
    file: S,
    name: "W1 THE BIG ONE: a spell with no scope stops reaching everyone",
    from: "  if (!scope) return true;",
    to: "  if (!scope) return false;",
    breaks: "W4 — 87 damaging spells would quietly stop damaging anybody"
  },
  /*
   * W2 IS RETIRED. It inverted `if (!immunities) return false;` and
   * SURVIVED, because `actorDefences` always returns a Set — empty for a
   * creature with no defences — so the guard could never fire. The line
   * was deleted rather than given a mutation that cannot fail, the same
   * answer `areaGrowthMaxTimes` reached. W5 still drives the case with a
   * bare `{}`; what changed is that it now exercises the real path.
   */
  {
    file: S,
    name: "W3 the immunity is read from the raw field again",
    from: "  return actorDefences(targetSystem ?? {}, creatureTypeSystem)\n    .immunities.has(scope.immuneTo);",
    to: "  return new Set(String(targetSystem?.combat?.immunities ?? \"\").split(\",\").map((x) => x.trim())).has(scope.immuneTo);",
    breaks: "R5 — a fire Elemental's immunity lives on its creature type"
  },
  {
    file: S,
    name: "C1 the card stops naming who was spared",
    from: "    ? `Damage reaches ${who} — unharmed: ${spared.join(\", \")}.`",
    to: "    ? `Damage reaches ${who} — ${spared.length} unharmed.`",
    breaks: "C2 — a table cannot act on a count"
  },
  {
    file: C,
    name: "R1 the cast never asks for a scope",
    from: "  const scope = damageScope(spellData);",
    to: "  const scope = null; void damageScope;",
    breaks: "R1 — Quench would burn everyone in the mist"
  },
  {
    file: C,
    name: "R2 the filter keeps everybody",
    from: "      if (inDamageScope(scope, t.system ?? {}, ownedCreatureTypeSystem(t), actor?.system ?? {})) inside.push(t);",
    to: "      inside.push(t);",
    breaks: "R2 — the scope would be printed and not applied"
  },
  {
    file: S,
    name: "A1 the opposed-aura form stops being recognised",
    from: '  if (raw === OPPOSED_AURA) return { opposedAura: true };',
    to: "",
    breaks: "A1/A11 — Wash Away Sin's damage goes back to reaching everyone the cone caught"
  },
  {
    file: S,
    name: "A2 'opposed' is read off the target alone",
    from: "    const theirs = new Set(alignedTraitsOf(targetSystem ?? {}));\n    return opposites.some((trait) => theirs.has(trait));",
    to: "    return alignedTraitsOf(targetSystem ?? {}).length > 0;",
    breaks: "A3 — a Good ally carries an aligned trait, and would take the damage meant for the Evil creature beside them"
  },
  {
    file: S,
    name: "A3 a caster with no aligned trait damages everybody instead of nobody",
    from: "    if (!opposites.length) return false;",
    to: "    if (!opposites.length) return true;",
    breaks: "A5 — the literal reading is that there is nothing for an aura to be opposed to"
  },
  {
    file: EFFECTS,
    name: "H1 the heal row goes back to filtering the save failures",
    from: "        ? (areaCaught.length ? areaCaught : targets)\n          .filter((t) => t?.uuid && !hostileUuids.includes(t.uuid))",
    to: "        ? targets.filter((t) => t?.uuid && !hostileUuids.includes(t.uuid))",
    breaks: "H1 — the live failure: damage correct, and 'Wash Away Sin finds nobody to affect'"
  },
  {
    file: EFFECTS,
    name: "H2 an allies row ALWAYS reads the area, even when there is none",
    // RE-ANCHORED AT 3.594.0: the `enemies` mirror added a second copy of
    // this expression, so the anchor carries the filter that tells the
    // ALLIES branch from its twin.
    from: "        ? (areaCaught.length ? areaCaught : targets)\n"
      + "          .filter((t) => t?.uuid && !hostileUuids.includes(t.uuid))",
    to: "        ? (areaCaught)\n"
      + "          .filter((t) => t?.uuid && !hostileUuids.includes(t.uuid))",
    breaks: "H2 — Forbidding Ward has no area, and its warded ally would vanish"
  },
  {
    file: C,
    name: "H3 the cast stops handing over the area-caught list",
    from: "      areaCaught: Array.isArray(areaTargets) ? areaTargets : [],",
    to: "",
    breaks: "H3 — the rule is written and reaches nothing, which is how this spell shipped for weeks"
  },
  {
    file: EFFECTS,
    name: "H4 friend-or-foe is classified over the failures alone",
    from: "  for (const candidate of [...targets, ...areaCaught]) {",
    to: "  for (const candidate of targets) {",
    breaks: "H4 — an ally who never rolled is never classified"
  },
  {
    file: S,
    name: "A4 the caster is passed but the opposites are read from the target",
    from: "    const opposites = alignedTraitsOf(casterSystem ?? {})",
    to: "    const opposites = alignedTraitsOf(targetSystem ?? {})",
    breaks: "A2/A3 — the relationship inverts, and the spell damages exactly the creatures it should spare"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([S, C, EFFECTS, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-damage-scope: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-damage-scope: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-damage-scope: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
