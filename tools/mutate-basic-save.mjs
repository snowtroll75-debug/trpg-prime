#!/usr/bin/env node
/**
 * mutate-basic-save — can verify-basic-save fail? NEW at 3.440.0.
 *
 * The ladder was correct and completely unpinned before this pair, so
 * every mutation here is aimed at a rule that has been shipping right by
 * luck rather than by measurement.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RES = path.join(SYSTEM_ROOT, "module", "dice", "resolution.mjs");
const ATK = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const SB = path.join(SYSTEM_ROOT, "tools", "spell-book-fields.json");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-basic-save.mjs");

const MUTATIONS = [
  /* ── L: the ladder ─────────────────────────────────────────────── */
  {
    file: RES,
    name: "L1 a critical save stops negating the damage",
    from: '    case "critical":\n      return { damageMultiplier: 0, bonusBaseDamage: 0, criticalSeverity: null };',
    to: '    case "critical":\n      return { damageMultiplier: 0.5, bonusBaseDamage: 0, criticalSeverity: null };',
    breaks: "B1/B2 — a critical save becomes a success"
  },
  {
    file: RES,
    name: "L2 a success stops halving",
    from: '    case "success":\n      return { damageMultiplier: 0.5, bonusBaseDamage: 0, criticalSeverity: null };',
    to: '    case "success":\n      return { damageMultiplier: 1, bonusBaseDamage: 0, criticalSeverity: null };',
    breaks: "B3 — the word buys nothing on the half the players notice most"
  },
  {
    file: RES,
    name: "L3 a partial takes the tier dice too",
    from: '    case "partial":\n      return { damageMultiplier: 1, bonusBaseDamage: 0, criticalSeverity: null };',
    to: '    case "partial":\n      return { damageMultiplier: 1, bonusBaseDamage: 1, criticalSeverity: "minor" };',
    breaks: "B4 — a partial is not a failure and buys no tier"
  },
  {
    file: RES,
    name: "L4 the tier dice are dropped",
    from: "        bonusBaseDamage: severity?.bonusDice ?? 0,",
    to: "        bonusBaseDamage: 0,",
    breaks: "B5-B10/C1 — the whole 'a die per save tier failure' half of the ruling"
  },
  {
    file: RES,
    name: "L5 the critical stops being triggered",
    from: "        criticalSeverity: severity?.severity ?? null",
    to: "        criticalSeverity: null",
    breaks: "B5/C1 — 'this also triggers a critical if the save line has the wording'"
  },
  {
    file: RES,
    name: "L6 a failure that reached no tier gets one anyway",
    from: "      const failedBy = margin === null ? 0 : Math.max(0, -Math.round(Number(margin)));",
    to: "      const failedBy = margin === null ? 0 : Math.max(5, -Math.round(Number(margin)));",
    breaks: "B11/B13 — failing by 4, or by an unknown margin, invents a minor critical"
  },
  {
    file: RES,
    name: "L7 a fumble stops walking the same ladder",
    from: '    case "failure":\n    case "fumble":\n    case "blunder": {',
    to: '    case "failure": {',
    breaks: "B12 — a worse failure would fall through to the default and be gentler"
  },
  {
    file: RES,
    name: "L8 an unknown degree becomes a free critical",
    from: "    default:\n      return { damageMultiplier: 1, bonusBaseDamage: 0, criticalSeverity: null };",
    to: '    default:\n      return { damageMultiplier: 1, bonusBaseDamage: 1, criticalSeverity: "minor" };',
    breaks: "B14 — the unsafe direction on a degree nobody planned for"
  },

  /* ── C: one ladder, not two ────────────────────────────────────── */
  {
    file: ATK,
    name: "C1 the shared severity bands move under the save",
    from: "  if (effective >= base + increment) {",
    to: "  if (effective >= base - 1 + increment) {",
    breaks: "B7/C1 — proof the save really reads the attack's bands rather than a copy"
  },

  /* ── G: the word is the gate ───────────────────────────────────── */
  {
    file: CW,
    name: "G1 the word stops being read",
    from: "    basic: /\\bbasic\\b/i.test(s),",
    to: "    basic: true,",
    breaks: "D1 — every save spell in the pack becomes a basic save"
  },
  {
    file: CW,
    name: "G2 the ladder escapes its gate",
    from: "  const isBasic = parsed.basic && Boolean(damageFormula);",
    to: "  const isBasic = Boolean(damageFormula);",
    breaks: "D2 — 'spells without the word rely purely on their description'"
  },
  {
    file: CW,
    name: "G3 a basic save with no damage takes the ladder anyway",
    from: "  const isBasic = parsed.basic && Boolean(damageFormula);",
    to: "  const isBasic = parsed.basic;",
    breaks: "D2 — the four declared spells would roll `0d0` bonus dice"
  },

  /* ── E: what the basic branch does with the tier ───────────────── */
  {
    file: CW,
    // RE-ANCHORED AT 3.585.1. The line moved when Graham ruled that a
    // spell's critical scales from its BASE DAMAGE entry rather than
    // from its damage formula; the rule this mutation pins — the tier
    // dice are the spell's own, never a fixed die — did not move.
    name: "E1 the tier dice stop using the spell's own die",
    from: "      const saveCrit = criticalBonusDamage(spell.system, bs.criticalSeverity, bs.bonusBaseDamage);",
    to: "      const saveCrit = bs.bonusBaseDamage ? `${bs.bonusBaseDamage}d6` : \"\";",
    breaks: "E1 — 'a die of BASE DAMAGE per tier', not a fixed d6"
  },
  {
    file: CW,
    name: "E2 the halving is applied after the tier dice are added",
    from: "      let amount = Math.floor(baseDamage * bs.damageMultiplier);",
    to: "      let amount = baseDamage;",
    breaks: "E3 — and a success would stop halving at the call site even with the ladder intact"
  },
  {
    file: CW,
    name: "E3 a reached tier no longer lands an injury",
    from: "      if (bs.criticalSeverity && !packet.immune) {",
    to: "      if (false) {",
    breaks: "E4 — the critical half of the ruling, deleted at the call site"
  },
  {
    file: CW,
    name: "E4 the damage packet stops being marked critical",
    // RE-ANCHORED AT 3.591.0: the secondary damage pool applies its own
    // packet with the same flag, so the bare line now appears twice. The
    // PRIMARY packet is the one this check is about.
    from: `      if (packet.taken > 0) {
        const applied = await applyDamageAndCheckDying(target, packet.taken, {
          isCritical: Boolean(bs.criticalSeverity)`,
    to: `      if (packet.taken > 0) {
        const applied = await applyDamageAndCheckDying(target, packet.taken, {
          isCritical: false`,
    breaks: "E5"
  },
  {
    // ADDED AT 3.591.0 beside E5's re-anchor: the second pool's flag
    // needs its own witness, or E5b is a check nobody has seen fail.
    file: CW,
    name: "E4b the SECOND damage packet stops being marked critical",
    from: `      if (secondPacket && secondPacket.taken > 0) {
        const appliedSecond = await applyDamageAndCheckDying(target, secondPacket.taken, {
          isCritical: Boolean(bs.criticalSeverity)`,
    to: `      if (secondPacket && secondPacket.taken > 0) {
        const appliedSecond = await applyDamageAndCheckDying(target, secondPacket.taken, {
          isCritical: false`,
    breaks: "E5b"
  },
  {
    file: CW,
    name: "E5 the tier damage skips the target's defences",
    // NARROWED AT 3.548.0. The old anchor quoted the whole option
    // object, which then grew a `spellDamageSource` spread and stopped
    // matching — an anchor carrying context it does not change, which is
    // what verify-mutation-anchors exists to discourage.
    from: "      const packet = resolveAgainstDefences(target.system ?? {}, {",
    to: "      const packet = { taken: amount, immune: false, steps: [] }; const bypassed = ({",
    breaks: "E6 — failing a save would become the way to bypass an immunity"
  },

  /* ── H: the ruling as a shape (3.442.0) ────────────────────────── */
  //
  // EACH OF THESE CREATES THE DEFECT rather than switching off the guard.
  // The first draft did the latter — `unruled.length === 0` replaced by
  // `true` — and survived, because with nothing currently unruled there
  // was nothing for the guard to stop reporting. Third time this session
  // that shape has been caught by the runner rather than by me.
  {
    file: CHECK,
    name: "H1 a spell of the ruled shape loses its declaration",
    from: '  "Shock Bolt":',
    to: '  "Shock Bolt but spelled wrong":',
    breaks: "G1 — a damage spell whose prose says basic, with no ruling and no declaration, goes unreported"
  },
  {
    file: CHECK,
    name: "H2 a spell that has had its ruling stays on the waiting list",
    // Re-anchored 3.610.0: Storm Of Vengeance came off the waiting list.
    from: '  "Shock Bolt":',
    to: '  "Surge Of The Tempest":',
    breaks: "G2 — Surge is ruled and marked, so a declaration for it is a place to hide rather than a list that shrinks"
  },
  {
    file: CHECK,
    name: "H3 the reference and the pack stop being keyed the same way",
    from: 'const bookKey = (n) => String(n).toUpperCase().replace(/[^A-Z0-9]/g, "");',
    to: "const bookKey = (n) => String(n);",
    breaks: "G0 — every lookup misses, the sweep has nothing to sweep, and a shape silently becomes no spells at all"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([RES, ATK, CW, SB, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-basic-save: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-basic-save: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-basic-save: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
