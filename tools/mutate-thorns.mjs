#!/usr/bin/env node
/**
 * mutate-thorns — can verify-thorns fail? NEW at 3.440.0.
 *
 * W2 IS THE ONE THAT MATTERS. It swaps the two actors in the call, so
 * the thorns prick their own owner every time somebody hits them. The
 * dice still roll, the card still prints a line, and nothing else in
 * attack-workflow.mjs would ever notice — which is why the check asks
 * for the argument order by name rather than for the call.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TH = path.join(SYSTEM_ROOT, "module", "magic", "thorns.mjs");
const WF = path.join(SYSTEM_ROOT, "module", "magic", "thorns-workflow.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CB = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-thorns.mjs");

const MUTATIONS = [
  /* ── W: is it reached, and pointed the right way? ──────────────── */
  {
    file: AW,
    name: "W1 the damage step stops applying thorns",
    from: "    for (const thornLine of await applyThorns(actor, targetActor, {",
    to: "    for (const thornLine of await Promise.resolve([]).then(() => [], () => [], applyThorns, {",
    breaks: "E1 — and the name survives in the import at the top of the file"
  },
  {
    file: AW,
    name: "W2 the thorns prick their own owner",
    from: "    for (const thornLine of await applyThorns(actor, targetActor, {",
    to: "    for (const thornLine of await applyThorns(targetActor, actor, {",
    breaks: "E2 — dice still roll, a line still prints, and the wrong creature bleeds"
  },
  {
    file: AW,
    name: "W3 the melee distance stops being passed",
    from: "      meleeDistance: isRanged ? null : distanceToTarget",
    to: "      meleeDistance: null",
    breaks: "E7 — every ARMED blow silently stops triggering, and only unarmed ones work"
  },
  {
    file: AW,
    name: "W4 every blow is reported as melee",
    from: "      melee: isMelee,",
    to: "      melee: true,",
    breaks: "E4 — an arrow pricks thorns it never touched"
  },
  {
    file: AW,
    name: "W5 thorns fire before the blow resolves",
    // RE-ANCHORED AT 3.465.0 with the loop's third source, and at 3.576.0
    // with its fourth (the rounds' and improvised weapons' typed extras), and
    // at 3.617.0 with its fifth (the unguents' secondary damage).
    from: "      ...strikeRunes.filter((r) => !r.addsToStrike), ...strikeRiderPackets(actor, weapon, riderCtx), ...areaPackets, ...typedExtras, ...unguentPackets\n    ]) {",
    to: "    ]) { if (true) break;",
    breaks: "A2/E3 — the reader can no longer see the rune loop, so the ordering claim is not vacuous"
  },

  /* ── T: which blows touch them ─────────────────────────────────── */
  {
    file: TH,
    name: "T1 a miss touches the thorns",
    from: "  if (!hit || !melee) return false;",
    to: "  if (!melee) return false;",
    breaks: "C4 — \"lands a melee blow\""
  },
  {
    file: TH,
    name: "T2 a ranged attack touches them",
    from: "  if (!hit || !melee) return false;",
    to: "  if (!hit) return false;",
    breaks: "C3"
  },
  {
    file: TH,
    name: "T3 reach stops mattering",
    from: "  return Number(distanceFeet) <= spec.reachFeet;",
    to: "  return true;",
    breaks: "C2/C6 — a polearm at ten feet gets pricked, and so does an unmeasured blow"
  },
  {
    file: TH,
    name: "T4 an unmeasured distance fires them anyway",
    from: "  if (distanceFeet === null || distanceFeet === undefined) return false;",
    to: "  if (distanceFeet === null || distanceFeet === undefined) return true;",
    breaks: "C6 — off a canvas, thorns that fired would be a different rule"
  },
  {
    file: TH,
    name: "T5 the unarmed route is dropped",
    from: "  if (unarmed) return true;",
    to: "  ;",
    breaks: "C5/C7 — a printed clause argued away"
  },

  /* ── I: the intensified window ─────────────────────────────────── */
  {
    file: TH,
    name: "I1 unstamped thorns are intensified",
    from: "  if (stampedRound === null || stampedRound === undefined) return false;",
    to: "  if (stampedRound === null || stampedRound === undefined) return true;",
    breaks: "D1 — every Vibrant Thorns deals 1d6 from the moment it is cast"
  },
  {
    file: TH,
    name: "I2 the window never closes inside a combat",
    from: "  return Number(currentRound) <= Number(stampedRound) + 1;",
    to: "  return true;",
    breaks: "D4 — one essence spell sharpens the thorns for the whole minute"
  },
  {
    file: TH,
    name: "I3 the window closes a round early",
    from: "  return Number(currentRound) <= Number(stampedRound) + 1;",
    to: "  return Number(currentRound) <= Number(stampedRound);",
    breaks: "D3 — it would end at the end of the round rather than at your next turn"
  },
  {
    file: TH,
    name: "I4 thorns with nothing to rise to intensify anyway",
    from: "  if (!spec?.intensified) return false;",
    to: "  if (!spec) return false;",
    breaks: "D6"
  },
  {
    file: TH,
    name: "I5 the intensified formula is used even when the window is shut",
    from: "  return intensified && spec.intensified ? spec.intensified : spec.damage;",
    to: "  return spec.intensified || spec.damage;",
    breaks: "D7 — 1d6 on every blow, all minute"
  },
  {
    file: TH,
    name: "I6 the trait stops being matched as a whole word",
    from: "  return new RegExp(`\\\\b${INTENSIFY_TRAIT}\\\\b`, \"i\").test(String(traitLine ?? \"\"));",
    to: "  return String(traitLine ?? \"\").toLowerCase().includes(INTENSIFY_TRAIT);",
    breaks: "D11 — Quintessence would sharpen the thorns"
  },

  /* ── N: what thorns are ────────────────────────────────────────── */
  {
    file: TH,
    name: "N1 a formula nobody checked reaches the roller",
    from: "  if (!DICE_OR_FLAT.test(damage)) return null;",
    to: "  if (false) return null;",
    breaks: "B4"
  },
  {
    file: TH,
    name: "N2 the intensified formula stops being checked",
    from: "  if (intensified && !DICE_OR_FLAT.test(intensified)) return null;",
    to: "  ;",
    breaks: "B4 — the half that only fires on an essence cast, so it would fail at a table"
  },
  {
    file: TH,
    name: "N3 an empty damage type is accepted",
    from: "  if (!damageType) return null;",
    to: "  if (false) return null;",
    breaks: "B5"
  },
  {
    file: TH,
    name: "N4 a declared reach is ignored",
    from: "    reachFeet: Math.max(0, Math.trunc(Number(raw.reachFeet ?? ADJACENT_FEET)) || ADJACENT_FEET)",
    to: "    reachFeet: ADJACENT_FEET",
    breaks: "B7"
  },

  /* ── R: the workflow half ──────────────────────────────────────── */
  {
    file: WF,
    name: "R1 the packet skips the attacker's defences",
    from: "    const packet = resolveAgainstDefences(attacker.system ?? {}, {",
    to: "    const packet = { taken: roll.total, immune: false }; const unusedPacket = ((x) => x)({",
    breaks: "G2 — the one secondary packet in the system that ignored an immunity"
  },
  {
    file: WF,
    name: "R2 the damage lands on the wrong creature inside the workflow",
    from: "    if (packet.taken > 0) await applyDamageAndCheckDying(attacker, packet.taken, { isCritical: false });",
    to: "    if (packet.taken > 0) await applyDamageAndCheckDying(defender, packet.taken, { isCritical: false });",
    breaks: "G3 — the same defect as W2, one layer down"
  },
  {
    file: WF,
    name: "R3 the roll is no longer reported beside the result",
    from: "      + `${spec.damageType} (${formula} rolled ${rawTotal}${rawTotal !== roll.total ? `, ${roll.total} after the save` : \"\"}`",
    to: "      + `${spec.damageType} (${formula}`",
    breaks: "G5 — an immunity becomes indistinguishable from a bad die"
  },
  {
    file: WF,
    name: "R4 a disabled effect keeps its thorns",
    from: "    if (effect.disabled) continue;",
    to: "    if (false) continue;",
    breaks: "G6"
  },

  /* ── H: the hooks ──────────────────────────────────────────────── */
  {
    file: CW,
    name: "H1 casting no longer intensifies",
    from: "    for (const sharp of await intensifyThorns(actor, spell)) lines.push(line(sharp));",
    to: "    ;",
    breaks: "F2 — the name still appears in the import at the top of cast-workflow.mjs"
  },
  {
    file: CB,
    name: "H2 the turn clock never closes the window",
    from: "    await clearThornsIntensity(actor);",
    to: "    ;",
    breaks: "F5 — one essence spell sharpens the thorns until the spell itself expires"
  },
  {
    file: FX,
    name: "H3 the applier accepts malformed thorns",
    // RE-ANCHORED 3.613.0: the row is warped first (Vibrant Thorns' +4 PP).
    from: "          const spec = normaliseThorns(warpedThorns(effect, warpBonus));\n          if (!spec) {",
    to: "          const spec = normaliseThorns(warpedThorns(effect, warpBonus)) ?? effect;\n          if (false) {",
    breaks: "H2 — a spell grows thorns nothing can roll and says nothing"
  },
  {
    file: FX,
    name: "H4 the effect is written under a flag nothing reads",
    from: "          const thornFlags = { [SYSTEM_ID]: { [THORNS_FLAG]: spec } };",
    to: "          const thornFlags = { [SYSTEM_ID]: { thornsSpec: spec } };",
    breaks: "H3 — the applier and the strike path stop agreeing on where thorns live"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([TH, WF, AW, CW, CB, FX, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-thorns: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-thorns: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-thorns: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
