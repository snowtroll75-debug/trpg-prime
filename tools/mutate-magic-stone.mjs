#!/usr/bin/env node
/**
 * mutate-magic-stone — can verify-magic-stone fail?
 *
 * NEW at 3.513.0.
 *
 * T1 IS THE ONE THIS FILE EXISTS FOR, and it is the mutation that looks
 * hardest to notice. Drop the `item` type off the row and a +1 Magic Stone
 * fired from a +2 sling gives +3 instead of +2 — the shot lands, the
 * number is plausible, and nothing anywhere says two enhancement bonuses
 * were stacked.
 *
 * I3 IS THE SILENT ONE. Change the weapon group and the spell puts three
 * pebbles in the caster's inventory that no weapon in the game will
 * accept. The card says the pebbles appeared, the inventory shows them,
 * and every sling refuses them.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const MS = path.join(SYSTEM_ROOT, "module", "magic", "magic-stone.mjs");
const AM = path.join(SYSTEM_ROOT, "module", "combat", "ammunition.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-magic-stone.mjs");

const MUTATIONS = [
  /* ── B: the bonus ──────────────────────────────────────────────── */
  {
    file: MS,
    name: "B1 THE WARP GOES INERT AGAIN — +2 PP buys nothing",
    from: "  if (!added || typeof warpValue !== \"function\") return 1;\n  return warpValue(1, added, warpMods?.bonusMax ?? null);",
    to: "  return 1;",
    breaks: "B2 — offered, charged, printed as warped, and doing nothing"
  },
  {
    file: MS,
    name: "B2 the printed ceiling is ignored",
    from: "  return warpValue(1, added, warpMods?.bonusMax ?? null);",
    to: "  return 1 + added;",
    breaks: "B2b — taking the option twice would reach +3, which the book does not offer"
  },
  {
    file: MS,
    name: "B3 A NEGATIVE MOD SHRINKS THE PRINTED BONUS",
    from: "  const added = Math.max(0, int(warpMods?.bonusValue));",
    to: "  const added = int(warpMods?.bonusValue);",
    breaks: "B3 — a warp only ever buys more"
  },

  /* ── I: the item ───────────────────────────────────────────────── */
  {
    file: MS,
    name: "I1 THE PEBBLES FIT NO WEAPON IN THE GAME",
    // ANCHORED ON THE VALUE, NOT THE DECLARATION. `A4 NO ANCHOR LEADS
    // WITH export` refuses the whole line, and rightly: leading with
    // `export` anchors on who may call the constant rather than on what
    // it says, so any change to its visibility disarms the mutation.
    from: "_GROUP = \"Sling\";",
    to: "_GROUP = \"Slings\";",
    breaks: "I3b/I3c — three pebbles in the inventory that every sling refuses"
  },
  {
    file: MS,
    name: "I2 THE PEBBLES BECOME PERMANENT +1 AMMUNITION",
    from: "        endsWithSpell: true",
    to: "        endsWithSpell: false",
    breaks: "I6 — the cleanup removes only what says it should be removed"
  },
  {
    file: MS,
    name: "I3 the casting that made them is not recorded",
    from: "        castId: castId ?? null,",
    to: "        castId: null,",
    breaks: "I6b — removeSpellItemsByCastId visits by castId and would find nothing"
  },
  {
    file: MS,
    name: "I4 A MAXIMUM OF 3 PEBBLES BECOMES ONE",
    // Anchored on the value — see the note on I1.
    from: "_COUNT = 3;",
    to: "_COUNT = 1;",
    breaks: "I2 — the book says a maximum of 3"
  },
  {
    file: MS,
    name: "I5 THE TWO HALVES OF ONE BONUS DISAGREE",
    from: "      damageModifier: bonus,",
    to: "      damageModifier: 1,",
    breaks: "I5 — a warped pebble would fly +2 and hit for +1"
  },
  {
    file: MS,
    name: "I6 the pebbles lose the trait the book prints",
    // Anchored on the value — see the note on I1.
    from: "_TRAITS = \"Disruptive, Magical\";",
    to: "_TRAITS = \"Magical\";",
    breaks: "I7 — the one thing about the trait this release does deliver is that a reader can see it"
  },

  /* ── F: the field ──────────────────────────────────────────────── */
  {
    file: AM,
    name: "F1 THE ATTACK MODIFIER IS NEVER READ — half the bonus vanishes",
    from: "    attackModifier: Number(ammoSystem?.attackModifier ?? 0) || 0,",
    to: "    attackModifier: 0,",
    breaks: "F1/I4 — the pebble would hit harder and land no more often"
  },
  {
    file: AM,
    name: "F2 a round that flies worse is clamped away",
    from: "    attackModifier: Number(ammoSystem?.attackModifier ?? 0) || 0,",
    to: "    attackModifier: Math.max(0, Number(ammoSystem?.attackModifier ?? 0) || 0),",
    breaks: "F1c — the damage modifier beside it has never been clamped"
  },

  /* ── T: the typed row ──────────────────────────────────────────── */
  {
    file: AM,
    name: "T1 THE BONUS STOPS BEING AN `item` BONUS — it stacks with the sling",
    from: "  return { label: String(ammoName || \"Ammunition\"), value, type: \"item\" };",
    to: "  return { label: String(ammoName || \"Ammunition\"), value, type: \"untyped\" };",
    breaks: "T2 — a +1 stone from a +2 sling would give +3, and nothing would say so"
  },
  {
    file: AM,
    name: "T2 EVERY SHOT PRINTS A ROW SAYING THE ROUND GAVE NOTHING",
    from: "  if (!value) return null;",
    to: "  if (false) return null;",
    breaks: "T3 — all nine authored rounds declare zero"
  },
  {
    file: AM,
    name: "T3 an unnamed round contributes a blank line",
    from: "  return { label: String(ammoName || \"Ammunition\"), value, type: \"item\" };",
    to: "  return { label: String(ammoName ?? \"\"), value, type: \"item\" };",
    breaks: "T4 — a blank label in the roll breakdown"
  },

  /* ── L: the card ───────────────────────────────────────────────── */
  {
    file: MS,
    name: "L1 THE CARD STOPS SAYING THE DISRUPTIVE TRAIT IS UNAUTOMATED",
    from: "  return \"<em>The pebbles carry the Disruptive trait — no rule in this system reads it,\"\n    + \" so what it disrupts is settled at the table.</em>\";",
    to: "  return \"<em>The pebbles carry the Disruptive trait.</em>\";",
    breaks: "L3 — a player cannot tell an unimplemented rule from a working one"
  },
  {
    file: MS,
    name: "L2 the card stops naming the weapon the pebbles need",
    from: "    + ` — +${int(value)} item bonus to attack and damage, fired from a sling.`;",
    to: "    + ` — +${int(value)} item bonus to attack and damage.`;",
    breaks: "L1c — pebbles are useless without the one weapon that throws them"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([MS, AM, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-magic-stone: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-magic-stone: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-magic-stone: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
