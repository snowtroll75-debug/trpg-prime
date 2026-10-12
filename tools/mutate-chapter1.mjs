#!/usr/bin/env node
/**
 * mutate-chapter1 — can verify-chapter1 fail? NEW at 3.549.0.
 *
 * Chapter 1 is the chapter every other chapter stands on: the check
 * ladder, the dice, the size table, the race modifiers. Before 3.549.0
 * essentially none of it was pinned, and two rules had already drifted
 * unnoticed — the Halfling and Gnome double-count, and the casting DC's
 * rounding. So each mutation here breaks a rule that WAS shipping wrong
 * or COULD have been, and asks whether the new checks would have said so.
 *
 * THE PACK MUTATIONS (section P) are the ones that matter most. The
 * double-count survived for weeks because nothing read the pack and
 * compared it against the printed table; P1 and P2 recreate exactly that
 * defect and prove section J now catches it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ClassicLevel } from "classic-level";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RES = path.join(SYSTEM_ROOT, "module", "dice", "resolution.mjs");
const OE = path.join(SYSTEM_ROOT, "module", "dice", "open-ended.mjs");
const ATK = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "casting.mjs");
const CFG = path.join(SYSTEM_ROOT, "module", "config.mjs");
const TE = path.join(SYSTEM_ROOT, "module", "combat", "turn-economy.mjs");
const ATTR = path.join(SYSTEM_ROOT, "module", "attributes.mjs");
const EP = path.join(SYSTEM_ROOT, "module", "effect-parser.mjs");
const ITEM = path.join(SYSTEM_ROOT, "module", "documents", "item.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const AC = path.join(SYSTEM_ROOT, "module", "combat", "ability-collapse.mjs");
const DW = path.join(SYSTEM_ROOT, "module", "combat", "death-watch-workflow.mjs");
const ACW = path.join(SYSTEM_ROOT, "module", "combat", "ability-collapse-workflow.mjs");
const DS = path.join(SYSTEM_ROOT, "module", "combat", "death-state.mjs");
const TRG = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter1.mjs");

const MUTATIONS = [
  /* ── A: the core check ─────────────────────────────────────────── */
  {
    file: RES,
    name: "A1 equalling the DC stops being a success",
    from: '  { key: "success", label: "Success", min: 0, rank: 4, success: true },',
    to: '  { key: "success", label: "Success", min: 1, rank: 4, success: true },',
    breaks: "A1 — 'equals or exceeds' is the whole of the core rule"
  },
  {
    file: RES,
    name: "A2 the margin is measured the wrong way round",
    from: "  const margin = hasDC ? total - target : null;",
    to: "  const margin = hasDC ? target - total : null;",
    breaks: "A1-A4 — every degree in the system inverts"
  },

  /* ── B/C: the dice ─────────────────────────────────────────────── */
  {
    file: OE,
    name: "B1 a 1 on a later roll chains, contrary to the printed rule",
    from: "    if (next < profile.high) break;",
    to: "    if (next < profile.high && next > profile.low) break;",
    breaks: "B5/B6 — 'a roll of 1 on anything other than the first roll does not cause one to roll again'"
  },
  {
    file: OE,
    name: "B2 the low chain adds instead of subtracting",
    from: "    total += direction * next;",
    to: "    total += Math.abs(direction) * next;",
    breaks: "B3/B4 — page 10's own Deception example comes out +34 instead of -11"
  },
  {
    file: OE,
    name: "C1 the d100 explosion threshold slips by one",
    from: "  d100: { faces: 100, high: 96, low: 5",
    to: "  d100: { faces: 100, high: 95, low: 5",
    breaks: "C3 — a 95 starts chaining when the rule says 96-100"
  },
  {
    file: OE,
    name: "C2 double zero stops reading as 100",
    from: "  return raw === 0 ? 100 : raw;",
    to: "  return raw;",
    breaks: "C7/C11 — 'the exception to this is double zeroes'"
  },
  {
    file: OE,
    name: "D1 the d20 chaos trigger moves off 1",
    from: "chaosOnFollowUp: 1",
    to: "chaosOnFollowUp: 2",
    breaks: "D1/D2 — chaos is 'a 1 rolled immediately after an open-ended 20 or 1'"
  },
  {
    file: OE,
    name: "D2 the d100 chaos number moves off 66",
    from: "chaosOnInitial: 66",
    to: "chaosOnInitial: 65",
    breaks: "D5 — the printed number is 66"
  },

  /* ── E: attacks ────────────────────────────────────────────────── */
  {
    file: ATK,
    name: "E1 meeting the DB exactly stops hitting",
    from: "  let hits = av >= -forgiveness;",
    to: "  let hits = av > forgiveness;",
    breaks: "E2 — 'meets or exceeds'"
  },
  {
    file: ATK,
    name: "E2 the critical threshold moves off 5",
    from: "  if (effective >= base + increment) {",
    to: "  if (effective >= base + 1 + increment) {",
    breaks: "E4/E6 — 'if your attack value is 5 or greater'"
  },
  {
    file: ATK,
    name: "E3 an unmodified 1 stops always missing",
    from: "  const autoMiss = face === 1;",
    to: "  const autoMiss = false;",
    breaks: "E12 — Chapter 7's auto-miss, which page 7 points at"
  },
  {
    file: ATK,
    name: "E4 an unmodified 20 stops always hitting",
    from: "  const autoHit = face === 20;",
    to: "  const autoHit = false;",
    breaks: "E13 — Chapter 7's auto-hit"
  },

  /* ── F/G: the two constants a whole chapter hangs on ───────────── */
  {
    file: RES,
    name: "F1 the Level DC constant drifts",
    from: "LEVEL_DC_BASE = 14;",
    to: "LEVEL_DC_BASE = 15;",
    breaks: "F1-F3 — 'Level DC = level + 14'"
  },
  {
    file: CAST,
    name: "G1 the casting DC goes back to rounding up",
    from: "  return 10 + Math.floor(Number(pp) * 1.5);",
    to: "  return 10 + Math.ceil(Number(pp) * 1.5);",
    breaks: "G2/G4/G6/G8 — the exact regression this release fixed"
  },
  {
    file: RES,
    name: "F2 the basic save's bonus dice stop reaching the ladder",
    from: "        bonusBaseDamage: severity?.bonusDice ?? 0,",
    to: "        bonusBaseDamage: 0,",
    breaks: "F7-F10 — the printed Basic Saving Throw Table"
  },
  {
    file: AW,
    name: "F3 the refocus backlash drops its margin again",
    from: "        const bs = basicSavingThrow(saveDegree, margin);",
    to: "        const bs = basicSavingThrow(saveDegree);",
    breaks: "F13 — the defect this release closed, reintroduced"
  },

  /* ── I: death and action points ────────────────────────────────── */
  {
    file: TE,
    name: "I1 death becomes 'equal to' rather than 'greater than'",
    from: "  if (next > threshold) {",
    to: "  if (next >= threshold) {",
    breaks: "I2 — a character dies a full point early"
  },
  {
    file: TE,
    name: "I2 the default Death State drifts",
    from: "const DEFAULT_DEATH_STATE = 5;",
    to: "const DEFAULT_DEATH_STATE = 4;",
    breaks: "I1 — 'most characters have a Death State of 5'"
  },
  {
    file: TE,
    name: "I3 a turn stops starting with 3 AP",
    from: "BASE_AP = 3;",
    to: "BASE_AP = 2;",
    breaks: "I9/I10 — 'a set amount of Action Points (AP) usually 3'"
  },

  /* ── J: the size table ─────────────────────────────────────────── */
  {
    file: CFG,
    name: "J1 a size row's base HP drifts",
    from: "  large: { label: \"Large\", baseHP: 50",
    to: "  large: { label: \"Large\", baseHP: 55",
    breaks: "J2 — the printed Creature Size Modifiers table"
  },
  {
    file: CFG,
    name: "J2 a size row's reach drifts",
    from: "huge: { label: \"Huge\", baseHP: 80, strMod: 2, dexMod: -2, reach: 15,",
    to: "huge: { label: \"Huge\", baseHP: 80, strMod: 2, dexMod: -2, reach: 10,",
    breaks: "J5 — Huge has 15' reach, and reach drives melee range and AoO"
  },

  /* ── K/M/N: abilities, the failed stabilisation, backgrounds ───── */
  {
    file: ATTR,
    name: "K1 the creation pool changes size",
    from: "const CREATION_POOL = 6;",
    to: "const CREATION_POOL = 7;",
    breaks: "K1 — 'you are given 6 points to distribute'"
  },
  {
    file: ATTR,
    name: "K2 the creation ceiling changes",
    from: "const CREATION_MAX = 4;",
    to: "const CREATION_MAX = 5;",
    breaks: "K2 — 'no ability score can exceed 4 points'"
  },
  {
    file: ATTR,
    name: "K3 the level-based ceiling passes 6",
    from: "const ABSOLUTE_MAX = 6;",
    to: "const ABSOLUTE_MAX = 7;",
    breaks: "K6 — 'to a maximum of 6'"
  },
  {
    file: EP,
    name: "M1 the increase parser reads reductions too",
    from: '  return conditionDelta(text, conditionLabel, "increase");',
    to: '  return conditionDelta(text, conditionLabel, "(?:increase|reduce)");',
    breaks: "M4 — a successful revival would raise the patient's Dying"
  },
  {
    file: EP,
    name: "M2 the reduction parser reads increases too",
    from: '  return conditionDelta(text, conditionLabel, "reduce");',
    to: '  return conditionDelta(text, conditionLabel, "(?:reduce|increase)");',
    breaks: "M3 — a botched revival would heal the patient, which is how this pair went wrong originally"
  },
  {
    file: ITEM,
    name: "N1 the duplicate-identity refusal stops being wired",
    from: "    if (this._refusedAsDuplicateIdentity(options)) return false;",
    to: "    if (this.name === \"never\") return false;",
    breaks: "N3 — the rule goes back to being a warning the sheet alone shows"
  },
  {
    file: ITEM,
    name: "N2 the identity removal lock stops being wired",
    from: "    if (this._refusedAsIdentityRemoval(options)) return false;",
    to: "    if (this.name === \"never\") return false;",
    breaks: "N4 — 'it cannot be amended at higher levels'"
  },
  /* ── O: the -5 consequences ────────────────────────────────────── */
  {
    file: AC,
    name: "O1 the collapse threshold drifts",
    from: "COLLAPSE_THRESHOLD = -5;",
    to: "COLLAPSE_THRESHOLD = -6;",
    breaks: "O1-O8 — the printed score is -5"
  },
  {
    file: AC,
    name: "O2 Dexterity -5 knocks you out as well",
    from: '    condition: "immobilised",',
    to: '    condition: "unconscious",',
    breaks: "O2/O3 — '(but not unconscious)' is the whole distinction that sentence draws"
  },
  {
    file: AC,
    name: "O3 Constitution -5 stops being fatal",
    from: '    condition: "dead",',
    to: '    condition: "petrified",',
    breaks: "O4 — 'A character with a Constitution score of -5 is dead'"
  },
  {
    file: AC,
    name: "O4 a score WORSE than -5 steps over the rule",
    from: "    if (value > COLLAPSE_THRESHOLD) continue;",
    to: "    if (value !== COLLAPSE_THRESHOLD) continue;",
    breaks: "O11 — a drain that overshoots would leave the character standing"
  },
  {
    file: AC,
    name: "O5 the mindless exemption is hard-coded away from the penalty it excuses",
    from: "  return MINDLESS_PENALISED_ATTRIBUTES.includes(key);",
    to: '  return key === "intelligence";',
    breaks: "O17/O18 — every mindless creature in the game falls unconscious from its Charisma"
  },
  {
    file: AC,
    name: "O6 the exemption spreads to Constitution",
    from: "  return MINDLESS_PENALISED_ATTRIBUTES.includes(key);",
    to: '  return MINDLESS_PENALISED_ATTRIBUTES.includes(key) || key === "constitution";',
    breaks: "O19 — a mindless creature would become unkillable by Constitution"
  },
  {
    file: AC,
    name: "O7 death stops swallowing the other conditions",
    from: "  const conditions = dead\n    ? []\n    : Array.from(new Set(reasons.map((r) => r.condition)));",
    to: "  const conditions = Array.from(new Set(reasons.map((r) => r.condition)));",
    breaks: "O13 — a corpse would carry Unconscious and Dead at once"
  },
  {
    file: DS,
    name: "O8 isDead stops seeing a fatal Constitution",
    from: "  return constitutionIsFatal(actor?.system);",
    to: "  return false;",
    breaks: "O24 — reapDead's own guard would refuse to reap a Constitution death"
  },
  {
    file: AC,
    name: "O9 the conditions never come back off",
    from: "  const remove = owned.filter((c) => {",
    to: "  const remove = [].filter((c) => {",
    breaks: "O26c — a restored score would leave the character unconscious for ever"
  },
  {
    file: AC,
    name: "O10 it wakes anybody, not only those it put under",
    from: "    if (c === \"unconscious\" && otherReasonUnconscious) return false;",
    to: "    if (c === \"immobilised\" && otherReasonUnconscious) return false;",
    breaks: "O28 — a character unconscious at 0 HP would be woken by an unrelated recovery"
  },
  {
    file: ACW,
    name: "O11 every client races to apply it",
    from: "    if (!isActingGM()) return false;",
    to: "    if (false) return false;",
    breaks: "O29 — the same reason the death watch is gated"
  },
  {
    file: TRG,
    name: "O12 the hooks are never registered",
    from: "  registerAbilityCollapseHooks();",
    to: "  ;",
    breaks: "O30 — a rule with no trigger is a rule with no caller: correct, tested, not happening"
  },

  {
    file: ACW,
    name: "O13 presence goes back to the derived set alone",
    from: "        present: presentStatuses(actor),",
    to: "        present: Array.from(actor.statuses ?? []),",
    breaks: "O32 — the exact double-apply found live at 3.550.0"
  },
  {
    file: ACW,
    name: "O14 the death branch trusts the derived set again",
    from: '        if (!presentStatuses(actor).includes("dead")) {',
    to: '        if (!actor.statuses?.has?.("dead")) {',
    breaks: "O33 — the death announces and reaps twice"
  },
  {
    file: ACW,
    name: "O15 a hook settles inline again",
    from: '    if (touched) scheduleSettle(actor);',
    to: '    if (touched) settleAbilityCollapse(actor);',
    breaks: "O34 — one hook bypassing the queue is enough to double-apply"
  },
  {
    file: ACW,
    name: "O16 the scheduler stops deferring out of the hook's task",
    from: "      await new Promise((resolve) => setTimeout(resolve, 0));\n      do {\n        entry.again = false;\n        await settleAbilityCollapse(actor);",
    to: "      do {\n        entry.again = false;\n        await settleAbilityCollapse(actor);",
    breaks: "O35 — the write is made inside the event that triggered it"
  },
  {
    file: DW,
    name: "O17 the death watch trusts the derived set again",
    from: "    if (!needsReaping(isDead(actor), alreadySkulled(actor))) return false;",
    to: '    if (!needsReaping(isDead(actor), Boolean(actor.statuses?.has?.("dead")))) return false;',
    breaks: "O37 — two Dead effects, which is how this was found"
  },
  {
    file: DW,
    name: "O18 the death watch reaps inline again",
    from: "    if (touched) scheduleReap(actor);",
    to: "    if (touched) reapIfNewlyDead(actor);",
    breaks: "O38 — the pattern that carried this fault since 3.373.0"
  },

  {
    file: ITEM,
    name: "N3 the lock narrows back to background alone",
    from: 'static LOCKED_IDENTITY_TYPES = Object.freeze(["race", "heritage", "background"]);',
    to: 'static LOCKED_IDENTITY_TYPES = Object.freeze(["background"]);',
    breaks: "N8 — race and heritage go back to being swappable at any level, which is the asymmetry 3.552.0 closed"
  },

  {
    file: COMBAT,
    name: "L1 tracker initiative goes back round the pipeline",
    from: '    const check = await TRGCheck.roll({\n      actor,\n      label: "Initiative",',
    to: '    const check = await Promise.resolve(new TRGCheck({\n      actor,\n      label: "Initiative",',
    breaks: "L5 — the sheet and the tracker roll initiative under different rules"
  }
];

/* ────────────────────────────────────────────────────────────────── *
 * P: THE PACK.
 *
 * These do not go through guardFiles, because the thing being mutated is
 * binary LevelDB rather than a source file. The original value is read
 * first, written back in a finally, and re-read to prove it went back —
 * a corrupted races pack is not something to discover later.
 * ────────────────────────────────────────────────────────────────── */
const RACES = path.join(SYSTEM_ROOT, "packs", "races");

async function withEffectChanges(effectName, mutate, body) {
  const db = new ClassicLevel(RACES, { keyEncoding: "utf8", valueEncoding: "json" });
  await db.open();
  let key = null;
  let original = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (v?.name === effectName) { key = k; original = JSON.parse(JSON.stringify(v)); break; }
    }
    if (!key) return "ANCHOR MISSING";
    const mutated = JSON.parse(JSON.stringify(original));
    mutated.changes = mutate(mutated.changes);
    await db.put(key, mutated);
    await db.close();
    return await body();
  } finally {
    const restore = new ClassicLevel(RACES, { keyEncoding: "utf8", valueEncoding: "json" });
    await restore.open();
    if (key && original) await restore.put(key, original);
    const back = key ? await restore.get(key).catch(() => null) : null;
    await restore.close();
    if (key && JSON.stringify(back?.changes) !== JSON.stringify(original?.changes)) {
      process.stderr.write(`mutate-chapter1: FAILED TO RESTORE ${effectName} — the races pack is dirty.\n`);
      process.exit(3);
    }
  }
}

const PACK_MUTATIONS = [
  {
    name: "P1 the Halfling double-count returns",
    effect: "Halfling: ability modifiers",
    mutate: (changes) => [
      { key: "system.attributes.strength.racial", mode: 2, value: "-1", priority: 20 },
      ...changes.map((c) => (/dexterity/.test(c.key) ? { ...c, value: "2" } : c))
    ],
    breaks: "J15 — Str -2 / Dex +3 against a printed -1 / +2, which is exactly what shipped"
  },
  {
    name: "P2 the Gnome double-count returns",
    effect: "Gnome: ability modifiers",
    mutate: (changes) => [
      { key: "system.attributes.strength.racial", mode: 2, value: "-1", priority: 20 },
      { key: "system.attributes.dexterity.racial", mode: 2, value: "1", priority: 20 },
      ...changes
    ],
    breaks: "J15 — Str -2 / Dex +2 against a printed -1 / +1"
  },
  {
    name: "P3 a Medium race's modifiers drift",
    effect: "Dwarf: ability modifiers",
    mutate: (changes) => changes.map((c) => (/constitution/.test(c.key) ? { ...c, value: "3" } : c)),
    breaks: "J15 — the printed Dwarf line is Con +2"
  },
  {
    name: "P4 a race's speed drifts",
    effect: "Elf: size and speed",
    mutate: (changes) => changes.map((c) => (/movement\.land/.test(c.key) ? { ...c, value: "25" } : c)),
    breaks: "J14 — the Elf's printed speed is 30 feet"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const SOURCES = [RES, OE, ATK, CAST, CFG, TE, ATTR, EP, ITEM, COMBAT, AW, AC, ACW, DS, DW, TRG, CHECK];
const guard = guardFiles(SOURCES);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter1: verify already fails on an unmodified tree.\n");
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

for (const m of PACK_MUTATIONS) {
  const outcome = await withEffectChanges(m.effect, m.mutate, async () => (run() ? "SURVIVED" : "caught"));
  results.push({ name: m.name, state: outcome, breaks: m.breaks });
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-chapter1: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-chapter1: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
