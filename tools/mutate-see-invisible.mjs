#!/usr/bin/env node
/**
 * mutate-see-invisible — can the R12 checks fail?
 *
 * NEW at 3.597.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST MUTATION IS THE HOLE ITSELF: take the `invisible` read out of
 * the avoidance rule and the condition goes back to being a HUD toggle that
 * changes nothing — the state the system shipped in for a year.
 *
 * THE SECOND IS THE MISTAKE I NEARLY MADE: author the spell on the `sense`
 * rail, whose `finds` field is read only by the sheet. That mutation prints
 * a beautiful card and changes no attack.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const TARGETING = at("module", "combat", "targeting.mjs");
const ATTACK = at("module", "combat", "attack.mjs");
const INVIS = at("module", "combat", "invisibility.mjs");
const SIGHT = at("module", "magic", "avoidance-sight.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const KINDS = at("module", "magic", "effect-kinds.mjs");
const VERIFY = at("tools", "verify-see-invisible.mjs");

const MUTATIONS = [
  { file: TARGETING, name: "THE HOLE RESTORED: the avoidance rule stops reading the condition",
    from: `  const invisible = Boolean(targetActor.hasCondition("invisible"));`,
    to: `  const invisible = false;`, breaks: "C2" },
  { file: TARGETING, name: "the read happens but is never passed to the rule",
    from: `  let baseDC = missChanceDC({ hidden, concealed, invisible, seeInvisible });`,
    to: `  let baseDC = missChanceDC({ hidden, concealed });`, breaks: "C2b" },
  { file: TARGETING, name: "SEE INVISIBLE IS READ OFF THE TARGET, so the victim benefits from it",
    from: `    ? seeInvisibleLevel(Array.from(attackerActor?.appliedEffects ?? attackerActor?.effects ?? []))`,
    to: `    ? seeInvisibleLevel(Array.from(targetActor?.appliedEffects ?? targetActor?.effects ?? []))`,
    breaks: "R7" },
  { file: TARGETING, name: "the level is read even when nobody is invisible",
    from: `  const seeInvisible = invisible
    ? seeInvisibleLevel(Array.from(attackerActor?.appliedEffects ?? attackerActor?.effects ?? []))
    : SEE_INVISIBLE.NONE;`,
    to: `  const seeInvisible = seeInvisibleLevel(Array.from(attackerActor?.appliedEffects ?? attackerActor?.effects ?? []));`,
    breaks: "R7b" },
  { file: TARGETING, name: "the card names Concealed for a check the invisibility set",
    from: `  const condition = invisibleDC === baseDC && invisibleDC !== null
    ? "Invisible"
    : concealed && baseDC === 17 ? "Concealed" : "Hidden";`,
    to: `  const condition = concealed ? "Concealed" : "Hidden";`, breaks: "R9" },

  { file: ATTACK, name: "INVISIBLE BECOMES THE CONCEALED DC, so the condition protects LESS than hiding",
    from: `  invisible: 10`, to: `  invisible: 17`, breaks: "L1" },
  { file: ATTACK, name: "See Invisible stops downgrading, so the spell does nothing at its base tier",
    from: `  if (seeInvisible === "concealed") return MISS_CHANCE_DC.concealed;`,
    to: `  if (seeInvisible === "concealed") return MISS_CHANCE_DC.invisible;`, breaks: "L2" },
  { file: ATTACK, name: "the +4 PP option only downgrades instead of removing the check",
    from: `  if (seeInvisible === "clear") return null;`,
    to: `  if (seeInvisible === "clear") return MISS_CHANCE_DC.concealed;`, breaks: "L2b" },
  { file: ATTACK, name: "THE PAGE 64 RULE IS REVERSED: two conditions roll at the LOWEST DC",
    from: `  return real.length ? Math.max(...real) : null;`,
    to: `  return real.length ? Math.min(...real) : null;`, breaks: "L5" },
  { file: ATTACK, name: "invisibility is dropped from the comparison altogether",
    from: `  if (invisible) contributions.push(invisibleAvoidanceDC(seeInvisible));`, to: `  ;`,
    breaks: "L4" },
  { file: ATTACK, name: "A LONE NULL CONTRIBUTION REACHES Math.max and becomes a flat check on a 1",
    from: `  const real = contributions.filter((value) => value != null);`,
    to: `  const real = contributions;`, breaks: "L4c" },
  { file: ATTACK, name: "See Invisible reveals a creature standing in the dark as well",
    from: `  if (concealed) contributions.push(MISS_CHANCE_DC.concealed);`,
    to: `  if (concealed && seeInvisible !== "clear") contributions.push(MISS_CHANCE_DC.concealed);`,
    breaks: "L5c" },

  { file: INVIS, name: "A DISABLED SPELL STILL COUNTS",
    from: `    if (effect?.disabled) continue;`, to: `    ;`, breaks: "R3" },
  { file: INVIS, name: "AN UNKNOWN FLAG VALUE READS AS THE BASE LEVEL",
    from: `    if (!isSeeInvisibleLevel(value)) continue;`, to: `    ;`, breaks: "R5" },
  { file: INVIS, name: "the cheaper tier wins when a caster holds both",
    from: `    if (value === SEE_INVISIBLE.CLEAR) return SEE_INVISIBLE.CLEAR;
    best = SEE_INVISIBLE.CONCEALED;`,
    to: `    best = SEE_INVISIBLE.CONCEALED;`, breaks: "R4" },
  { file: INVIS, name: "the levels widen to anything truthy",
    from: `  return LEVELS.includes(value);`, to: `  return Boolean(value);`, breaks: "R6" },
  { file: INVIS, name: "the card stops naming which tier is doing the work",
    from: `  if (level === SEE_INVISIBLE.CLEAR) return " (See Invisible — its invisibility is no help against you)";`,
    to: `  if (level === SEE_INVISIBLE.CLEAR) return "";`, breaks: "R8" },
  { file: INVIS, name: "THE AMBIGUOUS WORDING RETURNS: \"seen clearly\" beside a Concealed label",
    from: `  if (level === SEE_INVISIBLE.CLEAR) return " (See Invisible — its invisibility is no help against you)";`,
    to: `  if (level === SEE_INVISIBLE.CLEAR) return " (See Invisible — seen clearly)";`, breaks: "R8c" },
  { file: INVIS, name: "and names it even when the target is plainly visible",
    from: `  if (!invisible) return "";`, to: `  ;`, breaks: "R8b" },

  { file: SIGHT, name: "a sight nothing reads is accepted",
    from: `  if (!isAvoidanceSightKey(sight)) return null;`, to: `  ;`, breaks: "N2" },
  { file: SIGHT, name: "a level the sight rejects is accepted",
    from: `  if (!spec.valid(level)) return null;`, to: `  ;`, breaks: "N2c" },
  { file: SIGHT, name: "ANY KIND WEARING THE FIELDS becomes an avoidance sight",
    from: `  if (!raw || raw.kind !== "avoidanceSight") return null;`, to: `  if (!raw) return null;`,
    breaks: "N2d" },
  { file: SIGHT, name: "THE WARP ADDS INSTEAD OF REPLACING, so the +4 PP option is ignored",
    from: `  const level = warped || text(raw.level) || spec.default;`,
    to: `  const level = text(raw.level) || warped || spec.default;`, breaks: "N3" },
  { file: SIGHT, name: "THE DOUBLED BRACKETS RETURN: the card reads \"( (10 minutes))\"",
    from: `  return \`<strong>\${casterName}</strong>: \${spec.label} &mdash; \${how}\${durationText}.\`;`,
    to: `  return \`<strong>\${casterName}</strong>: \${spec.label} &mdash; \${how}\`
    + \`\${durationText ? \` (\${durationText})\` : ""}.\`;`, breaks: "N5b" },
  { file: SIGHT, name: "the line stops distinguishing the two tiers",
    from: `    ? "invisible creatures are seen clearly and are not concealed to you"`,
    to: `    ? "invisible creatures have the concealed condition to you"`, breaks: "N5" },
  { file: SIGHT, name: "THE SIGHT'S FLAG IS RENAMED to one nothing reads",
    from: `    flag: SEE_INVISIBLE_FLAG,`, to: `    flag: "seesTheUnseen",`, breaks: "S1" },

  { file: APPLIER, name: "the effect is made with no flag at all, so it sits there doing nothing",
    from: `          const senseFlags = { [SYSTEM_ID]: { spellBuff: true, [senseSpec.flag]: senseSpec.level } };`,
    to: `          const senseFlags = { [SYSTEM_ID]: { spellBuff: true } };`, breaks: "N4b" },
  { file: APPLIER, name: "the spell lasts for ever because the duration is never attached",
    from: `          if (senseTiming.foundryDuration) {
            senseData.duration = { ...senseTiming.foundryDuration, startTime: Number(game.time?.worldTime ?? 0) };
          }`, to: `          ;`, breaks: "N4c" },
  // THE BACKTICK ANCHOR IS BUILT, NOT WRITTEN. The applier's line is itself
  // a template literal, so spelling it inside one here is a syntax error —
  // '\x60' is the backtick and a single-quoted string leaves ${...} alone.
  { file: APPLIER, name: "a malformed row goes back to silence",
    from: '            lines.push(line(' + '\x60'
      + '<em>${spell.name} declares a sight this system does not read.</em>' + '\x60' + '));',
    to: "            ;", breaks: "N4d" },
  { file: KINDS, name: "the kind leaves the handled vocabulary",
    from: `  "avoidanceSight",`, to: `  ;`, breaks: "N4" }
];

const PACK = [
  { spell: "See Invisible", name: "P THE DEFECT RESTORED: a PP 4 spell goes back to doing nothing",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "avoidanceSight"); }, breaks: "P1" },
  { spell: "See Invisible", name: "P THE MISTAKE I NEARLY MADE: authored on the `sense` rail instead",
    mutate: (sy) => {
      sy.effects = sy.effects.map((e) => e.kind === "avoidanceSight"
        ? { kind: "sense", target: "self", category: "precise", detects: "invisible", label: "See Invisible" }
        : e);
    }, breaks: "P1" },
  { spell: "See Invisible", name: "P: the sight lands on whoever was targeted rather than the caster",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "avoidanceSight").target = "targets"; },
    breaks: "P1b" },
  { spell: "See Invisible", name: "P: the base spell ships at the +4 PP tier",
    mutate: (sy) => { sy.effects.find((e) => e.kind === "avoidanceSight").level = "clear"; },
    breaks: "P1c" },
  { spell: "See Invisible", name: "P THE INERT WARP RETURNS: the +4 PP option buys nothing",
    mutate: (sy) => { sy.warps.find((w) => /seen clearly/i.test(w.text)).mods = {}; }, breaks: "P3" },
  { spell: "See Invisible", name: "P: the +4 PP option is wired to the duration key instead",
    mutate: (sy) => {
      sy.warps.find((w) => /seen clearly/i.test(w.text)).mods = { durationText: "8 hours" };
    }, breaks: "P3" },
  { spell: "See Invisible", name: "P: the two halves it leaves to the table go unsaid",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "note"); }, breaks: "P4" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};
if (!run()) {
  console.error("verify-see-invisible does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const m of MUTATIONS) {
  const original = originals.get(m.file);
  const n = original.split(m.from).length - 1;
  if (n !== 1) {
    console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(m.file, original.replace(m.from, m.to));
  const stillPasses = run();
  fs.writeFileSync(m.file, original);
  if (stillPasses) { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else console.log(`  caught    ${m.name}`);
}
for (const [file, original] of originals) fs.writeFileSync(file, original);

const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");
async function withSpell(name, fn) {
  const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
  await db.open();
  let key = null;
  let pristine = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== name.toLowerCase()) continue;
      key = k; pristine = JSON.parse(JSON.stringify(v)); break;
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(pristine));
    fn(mutated.system);
    await db.put(key, mutated);
  } finally { if (db.status === "open") await db.close(); }
  try {
    return run() ? "SURVIVED" : "caught";
  } finally {
    const db2 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
    await db2.open();
    try { await db2.put(key, pristine); } finally { await db2.close(); }
  }
}
for (const m of PACK) {
  let state;
  try { state = await withSpell(m.spell, (sy) => m.mutate(sy)); }
  catch (err) { state = `ERROR ${err.message}`; }
  if (state === "caught") console.log(`  caught    ${m.name}`);
  else if (state === "SURVIVED") { console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`); survived++; }
  else { console.error(`  ${state}  ${m.name} (${m.spell})`); unmatched++; }
}

const TOTAL = MUTATIONS.length + PACK.length;
process.stdout.write(survived + unmatched
  ? `\nmutate-see-invisible: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-see-invisible: OK — all ${TOTAL} mutations caught `
    + `(${MUTATIONS.length} in the code, ${PACK.length} in the pack), tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
