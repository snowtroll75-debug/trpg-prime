#!/usr/bin/env node
/**
 * mutate-spell-rune — can verify-spell-rune fail?
 *
 * NEW at 3.523.0.
 *
 * R1 IS THE GAP ITSELF PUT BACK: stop writing the field and all five
 * spells go back to promising a rune and delivering nothing, which is
 * what they did for the whole life of the pack without erring or looking
 * wrong on the card.
 *
 * F3 IS THE ONE THAT WOULD BE WORSE THAN THE GAP. Let the spell overwrite
 * a better rune and a Potency IV greatsword becomes a Potency I greatsword
 * because a level-0 cantrip touched it — and the restore hands back the
 * field the spell captured, so it would not even be repaired when the
 * spell ended. A cantrip that damages a player's equipment is a worse
 * failure than one that does nothing.
 *
 * R4 IS THE QUIET ONE. Two casts on one sword, and a restore that does
 * not check whose loan it is writes back a field containing the other
 * cast's rune — leaving a Potency rune on the weapon permanently. That is
 * Wild Morph's claw bug in a different costume, and it is invisible until
 * somebody double-casts.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "spell-rune.mjs");
const W = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const N = path.join(SYSTEM_ROOT, "module", "combat", "target-relay.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-spell-rune.mjs");

const MUTATIONS = [
  /* ── F: the field ──────────────────────────────────────────────── */
  {
    file: R,
    name: "R1 THE GAP ITSELF — the rune is never written",
    from: "  const addition = `${POTENCY_LABEL} ${roman(want)}`;\n  return current ? `${current}, ${addition}` : addition;",
    to: "  return current;",
    breaks: "F1/F2/F4/F11/F12 — the spell promises a rune and delivers nothing, which is what it did for the whole life of the pack"
  },
  {
    file: R,
    name: "F3 A BETTER RUNE IS OVERWRITTEN",
    from: "  if (currentPotency(current) >= want) return current;",
    to: "",
    breaks: "F3/F5/F10/F11 — a level-0 cantrip would knock a Potency IV greatsword down, and the restore would hand back the field it had already spoiled"
  },
  {
    file: R,
    name: "F4 A WORSE RUNE IS LEFT ALONE INSTEAD OF RAISED",
    from: "  if (currentPotency(current) >= want) return current;",
    to: "  if (currentPotency(current) > 0) return current;",
    breaks: "F4/F11/F12 — the 8 PP a warped Magic Weapon costs would buy nothing on any weapon that already had a rune"
  },
  {
    file: R,
    name: "F10 EQUAL IS TREATED AS AN UPGRADE",
    from: "  if (from >= to) return { outcome: \"redundant\", from, to };",
    to: "  if (from > to) return { outcome: \"redundant\", from, to };",
    breaks: "F10b/F11/F12 — the card would announce a raise that the field did not make"
  },

  /* ── T: the ladder ─────────────────────────────────────────────── */
  {
    file: R,
    name: "T3 THE CEILING STOPS CLAMPING",
    from: "  return Math.min(start + steps, ceiling);",
    to: "  return start + steps;",
    breaks: "T3/T4/T10 — a mod arriving from a macro would walk a spell past the tier its own sentence prints"
  },
  {
    file: R,
    name: "T7 THE OFFER IS ONE PURCHASE TOO MANY",
    from: "  return Math.max(0, ceiling - start);",
    to: "  return Math.max(0, ceiling);",
    breaks: "T7/T8/T9/T10/P8 — the spell already grants I, so offering four steps to IV sells one that buys nothing"
  },
  {
    file: R,
    name: "T5 A NEGATIVE STEP COUNT LOWERS THE TIER",
    from: "  const steps = Math.max(0, int(warpMods?.potencyStep));",
    to: "  const steps = int(warpMods?.potencyStep);",
    breaks: "T5 — a warp only ever buys more"
  },

  /* ── Q: the item's ceiling (Graham's ruling, 8 Sep 2026) ───────── */
  {
    file: R,
    name: "Q1 THE 3.523.0 DEFECT PUT BACK — the ceiling is ignored",
    from: "  return cap > 0 ? Math.min(want, cap) : want;",
    to: "  return want;",
    breaks: "Q6/Q7/Q13 — a warped Magic Weapon writes Potency III onto a standard axe, the rune chapter reads it back as I, and the weapon is left reporting an invalid configuration"
  },
  {
    file: R,
    name: "Q9 A MISSING CEILING IS TREATED AS A CEILING OF ZERO",
    from: "  return cap > 0 ? Math.min(want, cap) : want;",
    to: "  return Math.min(want, cap);",
    breaks: "Q9 — an item whose ceiling could not be read would receive no rune at all rather than the one it was promised"
  },
  {
    file: R,
    name: "Q10 THE SHORTFALL IS NEVER MENTIONED",
    from: "  if (!lost) return null;",
    to: "  return null;",
    breaks: "Q10/Q10b — the player pays for steps that cannot land and the card says nothing, which is what the live pass found"
  },

  /* ── N: who may write it (found live as a player, 8 Sep 2026) ──── */
  {
    file: N,
    name: "N1 THE RUNE WRITE LOSES ITS OWN RELAY ACTION",
    from: '  SPELL_RUNE: "target.spellRune",',
    to: '  SPELL_RUNE: "target.itemHp",',
    breaks: "N1/N2 — sharing ITEM_HP's action would put one action in charge of two different fields, and the handler would write hit points where a rune was meant"
  },
  {
    file: N,
    name: "N7 THE HANDLER WRITES SOMETHING OTHER THAN WHAT WAS SENT",
    from: "      await deps.updateItem(item, payload.update ?? {});",
    to: "      await deps.updateItem(item, {});",
    breaks: "N5/N6/N7 — the relay would answer ok and write nothing, which is the silent failure this whole section exists to abolish"
  },
  {
    file: N,
    name: "N8 THE ITEM IS TAKEN FROM THE REQUEST RATHER THAN THE TARGET",
    // THE UPDATE LINE IS CARRIED FOR UNIQUENESS AND NOTHING ELSE. The
    // guard above it is written identically in the ITEM_HP case, so the
    // guard alone matches twice; the `payload.update` line is what tells
    // the two cases apart. Context carried to make an anchor unique is
    // the legitimate use of it — carrying lines that are NOT needed for
    // that is the brittleness recorded in the 3.523.0 notes.
    from: "      if (!item) return { ok: false, reason: \"item not found on that target\" };\n      await deps.updateItem(item, payload.update ?? {});",
    to: "      await deps.updateItem(item, payload.update ?? {});",
    breaks: "N8 — a request naming an item that is not on that target would fall through to the write"
  },
  {
    file: N,
    name: "N10 A SECOND GM WRITES TOO",
    from: "  return activeGM.id === user.id;",
    to: "  return true;",
    breaks: "N10/N11 — a second GM and the player's own client would each write the field back"
  },

  /* ── E: which items ────────────────────────────────────────────── */
  {
    file: R,
    name: "E3 MAGIC JAWS OFFERS EVERY WEAPON",
    from: "  if (unarmedOnly) return isUnarmedAttack(item?.system);",
    to: "  if (unarmedOnly) return true;",
    breaks: "E3 — \"one of the target's unarmed attacks\" would imbue the longsword on their hip"
  },

  {
    file: R,
    name: "E7 THE DEFECT: NATURAL ATTACKS ARE OFFERED TO WEAPON SPELLS AGAIN",
    from: '  if (type === "weapon" && isNaturalAttack(item?.system)) return false;',
    to: "",
    breaks: "E1 — Magic Weapon and Shillelagh would imbue a bite, and page 166 says natural attacks are not weapons"
  },
  {
    file: R,
    name: "E8 SHILLELAGH'S HELD-ONLY IS IGNORED",
    from: "  if (limits?.heldOnly === true && !item?.system?.equipped) return false;",
    to: "",
    breaks: "E8 — '1 club or staff you HOLD' would reach the club in the pack"
  },
  {
    file: R,
    name: "E9 SHILLELAGH'S NAMES ARE IGNORED",
    from: "  if (!wanted.length) return true;",
    to: "  return true;",
    breaks: "E9 — Shillelagh would imbue a longsword"
  },

  /* ── R: the restore ────────────────────────────────────────────── */
  {
    file: R,
    name: "R1r THE RESTORE BECOMES A SUBTRACTION",
    from: "  return String(previous ?? \"\");",
    to: "  return String(previous ?? \"\").replace(/,?\\s*Potency\\s+[IVX]+/i, \"\");",
    breaks: "R1/R2 — it would strip a potency rune the PLAYER etched while the spell was running, which is exactly why Blade Ally writes back instead"
  },
  {
    file: R,
    name: "R4 A LOAN IS RESTORED BY WHICHEVER CAST ENDS FIRST",
    from: "  return Boolean(loan) && Boolean(castId) && loan.castId === castId;",
    to: "  return Boolean(loan);",
    breaks: "R4/R5/R5b — two casts on one sword and the first to expire writes back a field holding the second's rune, leaving it there for good"
  },

  /* ── W: the vocabulary ─────────────────────────────────────────── */
  {
    file: W,
    name: "W1 potencyStep LEAVES THE DECLARED VOCABULARY",
    // NOT ANCHORED ON THE LIST'S CLOSING BRACE (A3). `potencyStep` is not
    // the last key — `potencyMax` follows it — so the line alone is a
    // valid deletion and stays valid when the list grows again.
    from: "    potencyStep: 0,",
    to: "",
    breaks: "W1 — an undeclared mod key is offered, charged, and silently dropped"
  },
  {
    file: W,
    name: "W1b potencyMax LEAVES IT",
    // The trailing comma on the line above is valid JS on its own, so this
    // needs no part of the `};` that follows.
    from: "    potencyMax: 0",
    to: "",
    breaks: "W1b/W3/W4 — the ceiling would never reach the chooser and every purchase would be offered"
  },
  {
    file: W,
    name: "W2 THE STEPS STOP ACCUMULATING",
    from: "    if (m.potencyStep) mods.potencyStep += Number(m.potencyStep) * times;",
    to: "    if (m.potencyStep) mods.potencyStep = Number(m.potencyStep);",
    breaks: "W2/W5 — three purchases would be charged and one step delivered"
  },
  {
    file: W,
    name: "W3 THE CEILING SCALES WITH THE PURCHASES",
    from: "    if (m.potencyMax) mods.potencyMax = Math.max(int0(mods.potencyMax), Number(m.potencyMax) || 0);",
    to: "    if (m.potencyMax) mods.potencyMax += Number(m.potencyMax) * times;",
    breaks: "W3/W5 — buying the step three times would raise the ladder as well as climb it"
  },
  {
    file: W,
    name: "W4 THE CHOOSER FALLS BACK TO UNLIMITED",
    from: "  if (m.potencyStep && m.potencyMax) {",
    to: "  if (false && m.potencyStep && m.potencyMax) {",
    breaks: "W4/W4b/P8 — the number box would take any count at all, and a player could buy nine steps of a max IV warp"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, W, N, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-rune: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-spell-rune: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spell-rune: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
