#!/usr/bin/env node
/**
 * mutate-sacrificing-shield — can verify-sacrificing-shield fail?
 *
 * NEW at 3.499.0.
 *
 * S8 IS THE ONE THAT WOULD BE FOUND AT A TABLE AS AN ABSURDITY: without
 * the cap, a three-point scratch the ally shrugs off costs the caster
 * five, and a wizard at 4 HP is put Dying by a blow that did nothing.
 *
 * L1 IS THE ONE THAT WOULD NOT BE FOUND AS A RULES BUG AT ALL. Two
 * casters warding each other hand the same five points back and forth
 * until the client stops answering, which is reported as Foundry hanging.
 *
 * P4 IS THE QUIET ONE. A ward placed above the temporary-HP pool is spent
 * on damage that never reached the ally — the resource is simply gone,
 * with a card saying it worked.
 *
 * C3 IS THE HONESTY. The +2 PP condition warp is sold and not built; the
 * printed line is the only thing standing between a table and a silent
 * failure.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "sacrificing-shield.mjs");
const DYING = path.join(SYSTEM_ROOT, "module", "combat", "dying-workflow.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-sacrificing-shield.mjs");

const MUTATIONS = [
  /* ── S: the split ──────────────────────────────────────────────── */
  {
    file: P,
    name: "S1 THE CAP COMES OFF: a scratch costs the caster the full five",
    from: "  const absorbed = Math.min(record.amount, incoming);",
    to: "  const absorbed = record.amount;",
    breaks: "S8/S9 — a wizard at 4 HP put Dying by a blow their ally shrugged off"
  },
  {
    file: P,
    name: "S2 the remainder stops being what is left",
    from: "  return { absorbed, remaining: incoming - absorbed };",
    to: "  return { absorbed, remaining: incoming };",
    breaks: "S7/S9 — the ally would take the whole blow AND the caster take five"
  },
  {
    file: P,
    name: "S3 the ally loses damage the ward never took",
    from: "  if (!shieldCatches(record, incoming)) return { absorbed: 0, remaining: incoming };",
    to: "  if (!shieldCatches(record, incoming)) return { absorbed: 0, remaining: 0 };",
    breaks: "S11 — a ward that could not fire would erase the blow instead"
  },
  {
    file: P,
    name: "S4 A ZERO BLOW SPENDS THE WARD",
    from: "  return Math.max(0, int(damage)) > 0;",
    to: "  return true;",
    breaks: "S2 — a one-round ward lost to a rounding artefact"
  },
  {
    file: P,
    name: "S5 a ward with no caster fires anyway",
    from: "  if (!record.casterUuid) return false;",
    to: "",
    breaks: "S3/S11 — damage would vanish into a shield with nowhere to send it"
  },
  {
    file: P,
    name: "S6 an emptied ward keeps catching",
    from: "  if (record.amount <= 0) return false;",
    to: "",
    breaks: "S4 — a ward that redirects nothing would still be spent by a blow"
  },

  /* ── A: what the warp buys ─────────────────────────────────────── */
  {
    file: P,
    name: "A1 THE WARP BUYS NOTHING",
    from: "  return BASE_ABSORB + Math.max(0, int(warpMods?.bonusValue));",
    to: "  return BASE_ABSORB;",
    breaks: "A2/A3 — the one warp on this spell that was never inert, made inert"
  },
  {
    file: P,
    name: "A2 the book's own number moves",
    from: "const BASE_ABSORB = 5;",
    to: "const BASE_ABSORB = 4;",
    breaks: "A1 — \"reduced by 5\" is printed"
  },
  {
    file: P,
    name: "A3 a nonsense mod is allowed to shrink the ward",
    from: "  return BASE_ABSORB + Math.max(0, int(warpMods?.bonusValue));",
    to: "  return BASE_ABSORB + int(warpMods?.bonusValue);",
    breaks: "A4 — a negative mod would sell the caster a smaller shield"
  },
  {
    file: P,
    name: "A4 a negative amount is stored on the ward",
    from: "    amount: Math.max(0, int(raw.amount ?? BASE_ABSORB)),",
    to: "    amount: int(raw.amount ?? BASE_ABSORB),",
    breaks: "N4 — a ward that healed both creatures"
  },

  /* ── P: where the gate sits ────────────────────────────────────── */
  {
    file: DYING,
    name: "P1 THE GATE IS NEVER REACHED",
    from: "  if (!redirected) {",
    to: "  if (false) {",
    breaks: "P1/L2 — the spell would go back to doing nothing at all"
  },
  {
    file: DYING,
    name: "P2 THE WARD MOVES ABOVE THE TEMPORARY-HP POOL",
    from: "  const absorbed = await spendTemporaryHP(actor, incoming);\n  let amount = absorbed.damageRemaining;",
    to: "  const redirectEarly = await redirectWithShield(actor, incoming);\n"
      + "  void redirectEarly;\n"
      + "  const absorbed = await spendTemporaryHP(actor, incoming);\n"
      + "  let amount = absorbed.damageRemaining;",
    breaks: "P4 — the ward spent on damage that never reached the ally"
  },
  {
    file: DYING,
    name: "P3 THE WARD MOVES BELOW THE DYING MACHINERY",
    from: "  const alreadyDying = Boolean(actor.hasCondition?.(\"dying\"));",
    to: "  const alreadyDying = Boolean(actor.hasCondition?.(\"dying\"));\n"
      + "  void (await redirectWithShield(actor, 0));",
    breaks: "P6 — Massive Damage decided on a number the ward should have reduced"
  },
  {
    file: DYING,
    name: "P4 THE WARD IS SPENT AFTER ITS OWN REDIRECT RESOLVES",
    from: "  if (actor?.effects?.get?.(effect.id)) await effect.delete();\n\n  const caster = await resolveShieldCaster(record.casterUuid);",
    to: "  const caster = await resolveShieldCaster(record.casterUuid);\n"
      + "  if (actor?.effects?.get?.(effect.id)) await effect.delete();",
    breaks: "P7 — the shape that let Delayed Respite catch its own released blow"
  },
  {
    file: DYING,
    name: "P5 the reduced number is discarded",
    from: "      amount = redirect.remaining;",
    to: "",
    breaks: "P1 — the caster would take their share and the ally take the blow whole"
  },

  /* ── L: the loop guard ─────────────────────────────────────────── */
  {
    file: DYING,
    name: "L1 THE REDIRECTED WOUND CROSSES WARDS OF ITS OWN",
    from: "  await applyDamageAndCheckDying(caster, split.absorbed, { redirected: true });",
    to: "  await applyDamageAndCheckDying(caster, split.absorbed);",
    breaks: "L1 — two casters warding each other would hang the client"
  },
  {
    file: DYING,
    name: "L2 the guard is dropped at the permission relay",
    from: "    return relayDamage(actor, damage, { isCritical, nonlethal, redirected, damageTypes, sourceLevel, sourceName }, () =>",
    to: "    return relayDamage(actor, damage, { isCritical, nonlethal, damageTypes, sourceLevel, sourceName }, () =>",
    breaks: "L3 — the loop would reappear on whichever client owns the caster"
  },

  /* ── D: what the cards say ─────────────────────────────────────── */
  {
    file: P,
    name: "D1 a fully absorbed blow claims a remainder of nothing",
    from: "      : \"; the blow reaches them for nothing.\");",
    to: "      : `; <strong>${remaining}</strong> still reaches them.`);",
    breaks: "D3 — \"0 still reaches them\" reads as a number the card failed to compute"
  },
  {
    file: P,
    name: "D2 THE MISSING CASTER GOES UNSAID",
    from: "  return `<em>${label} had nobody left to take the wound — its caster is no longer on the `\n    + `scene, so the blow reaches ${targetName} in full.</em>`;",
    to: "  return \"\";",
    breaks: "D4 — an ally takes a whole blow they paid to halve, with no line saying why"
  },
  {
    file: DYING,
    name: "D3 the firing card is never posted",
    from: "  await postCard(caster, record.label, [\n    line(shieldAbsorbedLine(caster.name, actor.name, split.absorbed, split.remaining))\n  ]);",
    to: "",
    breaks: "D5 — HP moving between two sheets with nothing said anywhere"
  },

  /* ── C: the clause the system does not honour ──────────────────── */
  {
    file: P,
    name: "C1 THE UNBUILT WARP STOPS BEING DECLARED",
    from: "  if (!conditions) return base;",
    to: "  return base;",
    breaks: "C3 — a clause sold and quietly dropped"
  },
  {
    file: P,
    name: "C2 it is declared even when nobody bought it",
    from: "  if (!conditions) return base;",
    to: "",
    breaks: "C4 — a reminder about a warp the caster does not have"
  },
  {
    file: P,
    name: "C3 the cast stops naming what is not absorbed",
    from: "  const base = \"<em>Only HP damage is absorbed: conditions, critical injuries, bleed and \"",
    to: "  const base = \"<em>The ward is placed. \"",
    breaks: "C1/C2 — \"no effects from any other part of the attack\" cuts both ways"
  },
  /* ── W: the phantom key ─────────────────────────────────── */
  {
    // W1 IS THE LIVE DEFECT, REPRODUCED EXACTLY. This is the code that
    // shipped in 3.499.0 and failed at the table on 5 September 2026.
    file: EFFECTS,
    name: "W1 THE READER GOES BACK TO MATCHING THE WARP'S TEXT",
    from: "          const sConditions = Boolean(warpMods?.absorbConditions);",
    to: "          const sConditions = Boolean(warpMods?.applied?.some?.(\n"
      + "            (w) => /condition/i.test(String(w?.text ?? \"\"))\n"
      + "          ));",
    breaks: "W5/W6 — the shape that was bought, named on the card, and never printed"
  },
  {
    file: EFFECTS,
    name: "W2 and so does the bleed reader, as it did for months",
    from: "          const bleedWarp = Boolean(warpMods?.reduceBleed);",
    to: "          const bleedWarp = Boolean(warpMods?.applied?.some?.(\n"
      + "            (w) => /bleed/i.test(String(w?.text ?? \"\"))\n"
      + "          ));",
    breaks: "W5/W7 — Reaper's Resonance's only warp, inert again"
  },
  {
    file: WARP,
    name: "W3 THE MOD IS DROPPED FROM THE AGGREGATE",
    from: "    if (m.absorbConditions) mods.absorbConditions = true;",
    to: "",
    breaks: "W1 — an undeclared mod is thrown away between the chooser and the cast"
  },
  {
    file: WARP,
    name: "W4 the key is never declared, so it is dropped anyway",
    from: "    absorbConditions: false,",
    to: "",
    breaks: "W8 — the vocabulary is what decides which mods survive"
  },
  {
    file: WARP,
    name: "W5 the bleed key is dropped",
    from: "    if (m.reduceBleed) mods.reduceBleed = true;",
    to: "",
    breaks: "W9 — a reader pointed at a key nothing ever sets"
  },
  {
    file: WARP,
    name: "W6 the flag is set by whichever warp was taken",
    from: "    if (m.absorbConditions) mods.absorbConditions = true;",
    to: "    mods.absorbConditions = true;",
    breaks: "W2/W3 — a clause printed for a caster who bought a different option"
  },

  /* ── G: the placement ──────────────────────────────────────────── */
  {
    file: EFFECTS,
    name: "G1 THE WARD FORGETS WHO CAST IT",
    from: "                casterUuid: caster?.uuid ?? \"\",",
    to: "                casterUuid: \"\",",
    breaks: "G7 — every ward would be one with nowhere to send the wound"
  },
  {
    file: EFFECTS,
    name: "G2 the warp is not folded in at placement",
    from: "          const sAmount = shieldAmount(warpMods);",
    to: "          const sAmount = shieldAmount({});",
    breaks: "G10 — every warped ward would redirect five while the card said six"
  }
];

/*
 * SIX OF THESE SURVIVED WHEN THIS RUNNER FIRST RAN, and that is what it
 * is for. Four were the ordering checks — P4/P5/P6 used indexOf, which
 * finds the FIRST call, so a mutation that ADDED a second gate left the
 * original in place and every ordering check still passed. AN ADDED CALL
 * IS NOT A MOVED ONE; the invariant was never "somewhere below the pool"
 * but "there is one gate", and P8 now says so.
 *
 * The other two were lines nothing tested at all: the firing card, and
 * the warp mods reaching the arithmetic. Both are now D5 and G10. No
 * mutation is kept here because it "documents" an untested line — that is
 * the vacuous shape this project has caught five times already.
 */

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, DYING, EFFECTS, WARP, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-sacrificing-shield: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-sacrificing-shield: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-sacrificing-shield: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
