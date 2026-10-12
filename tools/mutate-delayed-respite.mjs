#!/usr/bin/env node
/**
 * mutate-delayed-respite — can verify-delayed-respite fail?
 *
 * NEW at 3.493.0.
 *
 * P1 IS THE SHIPPED DEFECT: the spell carried nothing, so a blow that was
 * meant to hang in the air landed at once.
 *
 * E2 IS THE ONE THAT WOULD BE FOUND AT A TABLE AS A DOUBLE KILL. If the
 * packet is not cleared before it is dealt, a clock arriving on a spell
 * already dismissed deals the same blow twice.
 *
 * E3b IS THE RULING WITH TEETH. Dismissal FIRES the packet; release after
 * the effect is deleted and the packet is gone with it, which turns the
 * ruling silently into its opposite.
 *
 * D1 IS THE HONESTY ONE: a card reading "Now 30 / 30 HP" under a twelve
 * damage hit is indistinguishable from a broken damage path, and a table
 * would report it as one.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "delayed-respite.mjs");
const DY = path.join(SYSTEM_ROOT, "module", "combat", "dying-workflow.mjs");
const EAW = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const ATK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-delayed-respite.mjs");

const MUTATIONS = [
  /* ── O: one attack, one packet ─────────────────────────────────── */
  {
    file: P,
    name: "O1 A SPENT RESPITE CATCHES AGAIN: one casting holds every blow of the round",
    from: "  if (record.packet) return false;",
    to: "",
    breaks: "O2 — \"the impact of THE attack\" is singular"
  },
  {
    file: P,
    name: "O2 zero damage spends the spell on nothing",
    from: "  return int(damage) > 0;",
    to: "  return int(damage) >= 0;",
    breaks: "O4 — the worst possible way for the spell to end"
  },
  {
    file: P,
    name: "O3 a negative number is caught as a blow",
    from: "  return int(damage) > 0;",
    to: "  return int(damage) !== 0;",
    breaks: "O4b"
  },

  /* ── K: the packet ─────────────────────────────────────────────── */
  {
    file: P,
    name: "K1 THE SUBDUAL FLAG IS LOST: a held nonlethal blow arrives lethal",
    from: "    nonlethal: Boolean(nonlethal)",
    to: "    nonlethal: false",
    breaks: "K3b — it would kill somebody the rules do not"
  },
  {
    file: P,
    name: "K2 the critical is lost",
    from: "    isCritical: Boolean(isCritical),",
    to: "    isCritical: false,",
    breaks: "K2 — \"critical hits are determined as usual\""
  },
  {
    file: P,
    name: "K3 the number is not floored, so a negative packet heals",
    from: "    damage: Math.max(0, int(damage)),",
    to: "    damage: int(damage),",
    breaks: "K4"
  },
  {
    file: P,
    name: "K4 the validator refuses the record it stored itself",
    from: "  if (raw.kind !== undefined && String(raw.kind ?? \"\").trim() !== \"delayedRespite\") return null;",
    to: "  if (String(raw.kind ?? \"\").trim() !== \"delayedRespite\") return null;",
    breaks: "N3 — the stored flag carries no kind, so no packet would read back"
  },

  /* ── P: the gate ───────────────────────────────────────────────── */
  {
    file: DY,
    name: "P1 THE SHIPPED DEFECT: the blow is never caught",
    from: "  const held = await catchWithRespite(actor, incoming, { isCritical, nonlethal });",
    to: "  const held = null;",
    breaks: "P1 — the spell does nothing at all"
  },
  {
    file: DY,
    name: "P2 THE GATE MOVES BELOW THE TEMPORARY POOL",
    from: "  const held = await catchWithRespite(actor, incoming, { isCritical, nonlethal });",
    to: "  const absorbed = await spendTemporaryHP(actor, incoming);\n"
      + "  const held = await catchWithRespite(actor, incoming, { isCritical, nonlethal });",
    breaks: "P2 — a temporary pool spent on a blow that has not landed is spent twice"
  },
  {
    file: DY,
    name: "P3 the held blow falls through and lands anyway",
    from: "  if (held) {\n    return {\n      case: \"delayed\",",
    to: "  if (false) {\n    return {\n      case: \"delayed\",",
    breaks: "P1b — HP would move on a blow the spell caught"
  },
  {
    file: DY,
    name: "P4 a disabled Respite still catches",
    // WIDENED AT 3.499.0. Sacrificing Shield's finder lives in the same
    // file and is built to the same shape, so it repeats `if (e.disabled)
    // return false;` verbatim — the bare line stopped being unique and
    // this mutation reported ANCHOR x2 rather than running at all. It is
    // now anchored on the line plus the validator beneath it, which is
    // what makes it the Respite's rather than the ward's.
    from: "    if (e.disabled) return false;\n    const record = normaliseDelayedRespite(",
    to: "    if (false) return false;\n    const record = normaliseDelayedRespite(",
    breaks: "P4 — a GM who switched the effect off has ended it"
  },
  {
    file: DY,
    name: "P5 the packet is never written to the effect",
    from: "  await effect.setFlag(RESPITE_SYSTEM_ID, RESPITE_FLAG, {",
    to: "  await Promise.resolve({",
    breaks: "P5 — a packet held only in memory is lost on reload"
  },

  /* ── E: both endings, one function ─────────────────────────────── */
  {
    file: EAW,
    name: "E1 THE CLEAR LANDS ON AN EFFECT THAT IS ALREADY GONE",
    from: "  await effect.setFlag(SYSTEM_ID, RESPITE_FLAG, { ...raw, packet: null });\n"
      + "  // THE SPELL ENDS FIRST. See the header: leave the effect in place and\n"
      + "  // the blow it is releasing walks straight back into its own gate.\n"
      + "  // Callers delete afterwards too, and both tolerate this having gone.\n"
      + "  if (actor?.effects?.get?.(effect.id)) await effect.delete();",
    to: "  if (actor?.effects?.get?.(effect.id)) await effect.delete();\n"
      + "  await effect.setFlag(SYSTEM_ID, RESPITE_FLAG, { ...raw, packet: null });",
    breaks: "E2b2 — a stale second call would find the packet still on the deleted document"
  },
  {
    file: EAW,
    name: "E1b THE SELF-CATCH: the effect is still there when its own blow lands",
    from: "  if (actor?.effects?.get?.(effect.id)) await effect.delete();",
    to: "",
    breaks: "E2b — found live: the card said the blow landed and the HP did not move"
  },
  {
    file: EAW,
    name: "E1c the effect is deleted before the packet is cleared",
    from: "  await effect.setFlag(SYSTEM_ID, RESPITE_FLAG, { ...raw, packet: null });",
    to: "",
    breaks: "E2 — nothing would clear the packet at all"
  },
  {
    file: EAW,
    name: "E2 THE RULING REVERSED: dismissal discards the packet instead",
    from: "  await releaseRespitesByCastId(actor, castId, { dismissed });",
    to: "",
    breaks: "E3 — dismissal is an ending, and \"the results manifest instantly\""
  },
  {
    file: EAW,
    name: "E3 dismissal releases after the effect holding the packet is gone",
    from: "  await releaseRespitesByCastId(actor, castId, { dismissed });",
    to: "",
    breaks: "E3b — the ruling turns silently into its opposite"
  },
  {
    file: EAW,
    name: "E4 the world clock stops releasing it",
    from: "    await releaseDelayedRespite(actor, effect, { dismissed: false });",
    to: "",
    breaks: "E4 — the ordinary way a one-round spell ends"
  },
  {
    file: EAW,
    name: "E5 the subdual flag is dropped on release",
    from: "    nonlethal: Boolean(packet.nonlethal)",
    to: "    nonlethal: false",
    breaks: "E1c"
  },
  {
    file: EAW,
    name: "E6 an empty Respite deals a zero-damage blow",
    from: "  if (!packet || !Number(packet.damage)) return null;",
    to: "  if (!packet) return null;",
    breaks: "E5 — a spell that caught nothing did nothing"
  },
  {
    file: EAW,
    name: "E7 THE ARRIVING BLOW IS SILENT",
    from: "  await ChatMessage.create({",
    to: "  await Promise.resolve({",
    breaks: "D3 — hit points draining a round later with nothing said"
  },

  /* ── D: the card must not lie ──────────────────────────────────── */
  {
    file: ATK,
    name: "D1 THE CARD LIES: \"Now 30 / 30 HP\" under a twelve-damage hit",
    // RE-ANCHORED 3.614.0: stasis's branch comes first now (R2).
    from: '    } else if (damageResult.case === "delayed") {',
    to: '    } else if (false) {',
    breaks: "D1 — indistinguishable from a broken damage path"
  },
  {
    file: ATK,
    name: "D2 the catch is never announced on the attack card",
    from: "      lines.push(line(respiteCaughtLine(targetActor.name, damageResult.delayed)));",
    to: "",
    breaks: "D1b"
  },

  /* ── R: the card's words ───────────────────────────────────────── */
  {
    file: P,
    name: "R1 the early release stops being marked as early",
    from: "    + `${dismissed ? \" — released early\" : \"\"} — <strong>${packet.damage}</strong>`",
    to: "    + ` — <strong>${packet.damage}</strong>`",
    breaks: "R2b — dismissal is a choice somebody made, and the card should say so"
  },
  {
    file: P,
    name: "R2 THE HALF THE TABLE HOLDS STOPS BEING NAMED",
    from: "  return \"<em>The damage is held. Everything else the attack did — a critical injury, conditions, \"",
    to: "  return \"<em>The damage is held. \"",
    breaks: "R3 — the critical landed in front of them a moment earlier"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, DY, EAW, ATK, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-delayed-respite: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-delayed-respite: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-delayed-respite: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
