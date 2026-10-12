#!/usr/bin/env node
/**
 * mutate-condition-relief — can verify-condition-relief fail?
 *
 * NEW at 3.517.0.
 *
 * S1 IS THE ONE THIS FILE EXISTS FOR, and it is the mutation that reads
 * as a rounding error. Make the amount bump a flat 1 and "+2 PP: increase
 * the amount … (or 5 for soul drain)" cures ONE point of a condition the
 * book only ever moves in fives — the caster paid, the card prints a
 * number, and the number is a fifth of what was bought.
 *
 * D1 IS THE QUIET ONE. Drop the daily key and one Restoration blocks
 * every other relief spell on that creature for the day; drop the check
 * and the limit the book prints does not exist at all. Neither errors.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const C = path.join(SYSTEM_ROOT, "module", "magic", "condition-relief.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-condition-relief.mjs");

const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const MUTATIONS = [
  /* ── X: 3.625.1 ───────────────────────────────────────────────── */
  {
    file: C,
    name: "X1 casterGains is never read",
    from: "    casterGains: raw.casterGains === true",
    to: "    casterGains: false",
    breaks: "X1 — Share Burden's caster would never take the condition on"
  },
  {
    file: E,
    name: "X3 the prompt asks whatever the creature holds",
    from: "            if (held.length === 1) reliefPick = held[0];\n            else if (held.length > 1) {",
    to: "            {",
    breaks: "X3 — four allies asked a question three of them cannot answer"
  },
  {
    file: E,
    name: "X4 the caster gains it when healing themselves too",
    from: "          if (reliefSpec.casterGains && caster && caster !== target && caster.uuid !== target.uuid) {",
    to: "          if (reliefSpec.casterGains && caster) {",
    breaks: "X4 — a self-cast Share Burden would undo itself"
  },
  /* ── S: the unit the book counts in ────────────────────────────── */
  {
    file: C,
    name: "S1 A SOUL DRAIN BUMP CURES ONE POINT INSTEAD OF FIVE",
    from: "    amount: base + bumps * RELIEVABLE[condition].step",
    to: "    amount: base + bumps",
    breaks: "S2/S2b — \"(or 5 for soul drain)\" would buy a fifth of what it says"
  },
  {
    file: C,
    name: "S2 A REDIRECT TAKES THE PRINTED AMOUNT RATHER THAN THE NEW CONDITION'S",
    from: "  const base = condition === spec.condition ? spec.amount : RELIEVABLE[condition].step;",
    to: "  const base = spec.amount;",
    breaks: "P2b — \"instead cure 5 points of soul drain\" would cure one"
  },
  {
    file: C,
    name: "S3 A NEGATIVE MOD BUYS LESS",
    from: "  const bumps = Math.max(0, int(warpMods?.reliefBump));",
    to: "  const bumps = int(warpMods?.reliefBump);",
    breaks: "S3 — a warp only ever buys more"
  },
  {
    file: C,
    name: "S4 A SOUL DRAIN ROW THAT NAMES NO AMOUNT CURES ONE POINT",
    from: "    amount: Math.max(1, int(raw.amount) || RELIEVABLE[condition].step),",
    to: "    amount: Math.max(1, int(raw.amount) || 1),",
    breaks: "N3 — the book only ever moves soul drain in fives"
  },

  /* ── C: which condition ────────────────────────────────────────── */
  {
    file: C,
    name: "C1 THE REDIRECT IS IGNORED — every warp reduces fatigue",
    // RE-ANCHORED AT 3.591.0: the one-liner became three when the row's
    // own base-text choices joined the warp's "instead" (Metabolism).
    from: "  if (swap.length) return swap;",
    to: "  ;",
    breaks: "C2/P2 — four \"instead\" warps charged and buying nothing"
  },
  {
    file: C,
    name: "C2 A PICK NOBODY BOUGHT IS APPLIED",
    from: "  const condition = offered.includes(picked) ? picked : offered[0];",
    to: "  const condition = picked || offered[0];",
    breaks: "P3c — whatever the prompt returns would become a reduction"
  },
  {
    file: C,
    name: "C3 THE CASTER IS ASKED WHEN THERE IS NOTHING TO CHOOSE",
    from: "  return reliefChoices(spec, warpMods).length > 1;",
    to: "  return reliefChoices(spec, warpMods).length > 0;",
    breaks: "C1b/C3 — a dialog on every unwarped Restoration that decides nothing"
  },
  {
    file: C,
    name: "C4 an unknown condition survives the warp list",
    from: "    .filter((c) => RELIEVABLE[c]);",
    to: "    .filter(Boolean);",
    breaks: "P2/C2 — a typo in a warp would name a condition nothing can reduce"
  },

  /* ── N: the declaration ────────────────────────────────────────── */
  {
    file: C,
    name: "N1 A ROW NAMING AN UNKNOWN CONDITION IS ACCEPTED",
    from: "  if (!RELIEVABLE[condition]) return null;",
    to: "  if (false) return null;",
    breaks: "N2 — it would reduce nothing and print a line saying it had"
  },
  {
    file: C,
    name: "N2 the kind is not checked",
    from: "  if (text(raw.kind) !== \"conditionRelief\") return null;",
    to: "  if (false) return null;",
    breaks: "N2b — a heal row would be read as a condition relief"
  },

  /* ── D: the daily limit ────────────────────────────────────────── */
  {
    file: C,
    name: "D1 ONE RESTORATION BLOCKS EVERY RELIEF SPELL ON THAT CREATURE",
    from: "  return Boolean(record && key && record[key] === true);",
    to: "  return Boolean(record && key && Object.keys(record).length);",
    breaks: "D3 — the book names one spell, not a category"
  },
  {
    file: C,
    name: "D2 THE LIMIT THE BOOK PRINTS STOPS EXISTING",
    from: "  return Boolean(record && key && record[key] === true);",
    to: "  return false;",
    breaks: "D2 — a creature could be restored all day"
  },
  /*
   * D3 WAS WRITTEN AND DELETED, along with the guard it aimed at.
   *
   * It neutered `if (!key) return false;` in `alreadyRelievedToday` and
   * SURVIVED, because with no key `record[undefined]` is undefined, which
   * is not `true` — the line below already answered false. The SEVENTH
   * dead guard this project has deleted rather than written a check
   * around. The rule it stated is still asserted by D4; what went was the
   * line that could not change an answer.
   *
   * `markRelievedToday`'s identical-looking guard stays: there it decides
   * whether a key is written at all, and D4b covers it.
   */
  {
    file: C,
    name: "D4 THE RECORD ERASES WHAT WAS THERE",
    from: "  return { ...(record ?? {}), [key]: true };",
    to: "  return { [key]: true };",
    breaks: "D5 — one spell's record would wipe another's"
  },

  /* ── W: the mod channel ────────────────────────────────────────── */
  {
    file: W,
    name: "W1 THE REDIRECT IS DROPPED BY THE AGGREGATE — inert again",
    from: "    if (m.reliefConditions) mods.reliefConditions = [...m.reliefConditions];",
    to: "    ;",
    breaks: "W1 — offered, charged, printed as warped, and doing nothing"
  },
  {
    file: W,
    name: "W2 the amount bump is dropped",
    from: "    if (m.reliefBump) mods.reliefBump += Number(m.reliefBump) * times;",
    to: "    ;",
    breaks: "W2 — the same inert shape, one line over"
  },
  {
    file: W,
    name: "W3 the redirect key leaves the declared list",
    from: "    reliefConditions: null,",
    to: "    reliefConditionsUnused: null,",
    breaks: "W1 — an undeclared mod key is dropped in silence"
  },
  {
    file: W,
    name: "W4 THE BUMP IS BOUGHT ONCE AND NO MORE",
    from: "    if (m.reliefBump) mods.reliefBump += Number(m.reliefBump) * times;",
    to: "    if (m.reliefBump) mods.reliefBump += Number(m.reliefBump);",
    breaks: "W2b — the count box would be offered and only the first purchase would land"
  },
  {
    file: W,
    name: "W5 A REDIRECT BECOMES A QUANTITY",
    from: "    if (m.reliefConditions) mods.reliefConditions = [...m.reliefConditions];",
    to: "    if (m.reliefConditions) mods.reliefConditions = [...m.reliefConditions, ...m.reliefConditions.slice(0, times - 1)];",
    breaks: "W3 — \"instead\" states which condition, and states it once"
  },

  /* ── L: the card ───────────────────────────────────────────────── */
  {
    file: C,
    name: "L1 THE CARD STOPS SAYING THE CONDITION CLEARED",
    from: "  if (after <= 0) return `<strong>${targetName}</strong> is no longer <strong>${label}</strong> (was ${before}).`;",
    to: "  if (false) return \"\";",
    breaks: "L2/L2b — \"Fatigued 1 → Fatigued 0\" over a condition that is gone"
  },
  {
    file: C,
    name: "L2 THE DAILY REFUSAL STOPS NAMING THE RULE",
    from: "  return `<em>${targetName} has already benefited from ${spellName} today — a creature may `\n    + \"only benefit from one each day, so nothing was applied.</em>\";",
    to: "  return `<em>Nothing happened.</em>`;",
    breaks: "L4/L4b — the shape this project spends its releases removing"
  },
  {
    file: C,
    name: "L3 nothing to reduce stops admitting the PP is spent",
    from: "  return `<em>${targetName} is not ${label} — nothing to reduce, and the ${spentNoun} is spent.</em>`;",
    to: "  return `<em>${targetName} is not ${label}.</em>`;",
    breaks: "L3 — a caster cannot tell a wasted cast from a failed one"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([C, W, E, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-condition-relief: verify already fails on an unmodified tree.\n");
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

/*
 * THE PACK PASS, ADDED AT 3.591.0. K4 and K4b are a CENSUS — who uses
 * this channel, and with which half of it — and a census over pack data
 * cannot be made to fail by changing any line of code. They were
 * therefore two checks nobody had ever seen fail, which is the thing
 * this whole file exists to prevent, and the omission was invisible for
 * as long as the census answered "one".
 */
const { ClassicLevel } = await import("classic-level");
const SPELLS = path.join(SYSTEM_ROOT, "packs", "spells");

const PACK_MUTATIONS = [
  { spell: "Metabolism", name: "P: the second user of the channel drops off the census",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "conditionRelief"); },
    breaks: "K4" },
  { spell: "Metabolism", name: "P: the base-text choice is flattened, and K4b's half goes quiet",
    mutate: (sy) => { delete sy.effects.find((e) => e.kind === "conditionRelief").choices; },
    breaks: "K4b" },
  { spell: "Restoration", name: "P: the FIRST user drops off, and the census still says two",
    mutate: (sy) => { sy.effects = sy.effects.filter((e) => e.kind !== "conditionRelief"); },
    breaks: "K4" }
];

for (const m of PACK_MUTATIONS) {
  const db = new ClassicLevel(SPELLS, { valueEncoding: "json" });
  await db.open();
  let key = null;
  let pristine = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() !== m.spell.toLowerCase()) continue;
      key = k; pristine = JSON.parse(JSON.stringify(v)); break;
    }
    if (key) {
      const mutated = JSON.parse(JSON.stringify(pristine));
      m.mutate(mutated.system);
      await db.put(key, mutated);
    }
  } finally { if (db.status === "open") await db.close(); }
  if (!key) { results.push({ name: m.name, state: "ANCHOR MISSING" }); continue; }
  // RESTORED IN A FINALLY: a crash here must not leave Graham's Grimoire mutated.
  try {
    results.push({ name: m.name, state: run() ? "SURVIVED" : "caught", breaks: m.breaks });
  } finally {
    const db2 = new ClassicLevel(SPELLS, { valueEncoding: "json" });
    await db2.open();
    try { await db2.put(key, pristine); } finally { await db2.close(); }
  }
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-condition-relief: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-condition-relief: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
