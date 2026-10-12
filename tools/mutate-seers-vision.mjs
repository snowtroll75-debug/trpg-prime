#!/usr/bin/env node
/**
 * mutate-seers-vision — can verify-seers-vision fail? NEW at 3.449.0.
 *
 * D1 IS GRAHAM'S RULING. Forcing something other than the first FACE —
 * a total, a clamped value, a face that does not reach `rollChain` —
 * silently re-decides whether a recorded 20 is a natural 20, which he
 * ruled on 31 August 2026 that it is.
 *
 * E1 IS THE OLD FAILURE, for the fourth spell running: the hook is
 * deleted from `evaluate` and the vision goes nowhere, exactly as
 * Cutting Words' penalty did.
 *
 * P1 IS THIS SPELL'S OWN. "They MAY use it" — a mutation that applies it
 * without asking turns a recorded 4 from a choice into a curse.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "seers-vision.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "seers-vision-workflow.mjs");
const K = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const A = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-seers-vision.mjs");

const MUTATIONS = [
  /* ── N: one spell, one name (3.449.1) ──────────────────────────── */
  {
    file: R,
    name: "N1 the fallback goes back to a typewriter apostrophe",
    from: 'export const SEERS_VISION_NAME = "Seer\u2019s Vision";',
    to: 'export const SEERS_VISION_NAME = "Seer\'s Vision";',
    breaks: "N4 — the two spellings on one screen, restored"
  },
  {
    file: R,
    name: "N2 the record drops the spell's own name",
    from: "    label: String(label ?? \"\"),",
    to: "    label: \"\",",
    breaks: "N1 — the prompt falls back to a constant for a spell that named itself"
  },
  {
    file: R,
    name: "N3 the carried name is ignored in favour of the constant",
    from: "  return label || SEERS_VISION_NAME;",
    to: "  return SEERS_VISION_NAME;",
    breaks: "N2 — a renamed spell keeps prompting under the old name"
  },
  {
    file: F,
    name: "N4 the prompt retypes its title",
    from: "    window: { title: name, icon: \"fa-solid fa-eye\" },",
    to: "    window: { title: \"Seer\'s Vision\", icon: \"fa-solid fa-eye\" },",
    breaks: "N7/N8 — exactly the hard-coded title that was found at the table"
  },
  {
    file: A,
    name: "N5 the effect stops handing the spell's name over",
    from: "            label: spell?.name ?? \"\",",
    to: "            label: \"\",",
    breaks: "N9 — the pack row names the spell and nothing carries it"
  },
  {
    file: K,
    name: "N6 the card's subtitle retypes the name",
    from: "        name: visionName(pending)",
    to: "        name: \"Seer\'s Vision\"",
    breaks: "E6c — the player-facing subtitle stops following the spell"
  },

  /* ── D: the die (Graham's ruling) ──────────────────────────────── */
  {
    file: R,
    name: "D1 THE RULING: the forced face never reaches the chain",
    from: "    if (!spent) {\n      spent = true;\n      return Number(face);",
    to: "    if (false) {\n      spent = true;\n      return Number(face);",
    breaks: "B1/B2 — the vision is recorded, offered, spent, and the die rolls normally anyway"
  },
  {
    file: R,
    name: "D2 the face is forced on every draw",
    from: "      spent = true;",
    to: "",
    breaks: "B4/B5 — an exploded chain re-rolls the same face forever"
  },
  {
    file: R,
    name: "D3 a number outside the die is clamped rather than refused",
    from: "  if (!Number.isFinite(face) || face < 1 || face > VISION_DIE_FACES) return null;",
    to: "  if (!Number.isFinite(face)) return null;",
    breaks: "A3 — a hand-edited flag hands somebody a silent 21"
  },

  /* ── C: which check may spend it ───────────────────────────────── */
  {
    file: R,
    name: "C1 a SECRET check may spend it",
    from: '  if (String(rollMode ?? "").trim().toLowerCase() === BLIND_ROLL_MODE) return false;',
    to: "  ;",
    breaks: "C5 — a player spends a number on a roll they are not allowed to see"
  },
  {
    file: R,
    name: "C2 every kind of check may spend it",
    from: '  return normaliseRecordTypes(pending.types).includes(type);',
    to: "  return true;",
    breaks: "C3/C4 — the sentence names two things, and an attack is neither"
  },
  {
    file: R,
    name: "C3b a record with no list may spend an attack",
    from: "  return list.length ? [...new Set(list)] : [...DEFAULT_RECORD_TYPES];",
    to: "  return list.length ? [...new Set(list)] : [...RECORDABLE_TYPES];",
    breaks: "F1d — every record written before 3.589.0 has no list"
  },
  {
    file: R,
    name: "C3 only saves may spend it",
    from: '  return normaliseRecordTypes(pending.types).includes(type);',
    to: '  return type === "save";',
    breaks: "C2 — half the spell's printed reach"
  },

  /* ── P: it is OFFERED, not taken ───────────────────────────────── */
  {
    file: K,
    name: "P1 THE CHOICE: the vision applies without asking",
    from: "      if (!(await promptSeersVision(pending, this.label))) return;",
    to: "      ;",
    breaks: "E6c/E6d — a recorded 4 stops being a choice and becomes a curse"
  },
  {
    file: F,
    name: "P2 a dismissed prompt counts as consent",
    from: '  return answer === "use";',
    to: '  return answer !== "roll";',
    breaks: "F2 — a spell the player forgot to decline spends itself"
  },
  {
    file: R,
    name: "P3 a second cast keeps the better vision",
    from: "  const kept = recordedRolls(raw).filter((r) => String(r.source ?? SEERS_VISION_NAME) !== record.source);\n  return [...kept, record];",
    to: "  const kept = recordedRolls(raw);\n  const better = kept.find((r) => Number(r.value) >= Number(record.value));\n  return better ? kept : [...kept.filter((r) => String(r.source ?? SEERS_VISION_NAME) !== record.source), record];",
    breaks: "F1 — \"casting this spell again immediately cancels any active instance\""
  },
  {
    file: F,
    name: "P4 clearing a spent vision can throw",
    from: "    console.error(\"TRG Prime | Could not clear a spent recorded roll\", error);",
    to: "    throw error; // eslint-disable-line no-useless-catch",
    breaks: "F3 — this runs inside a roll that is about to happen"
  },

  /* ── E: is it REACHED? ─────────────────────────────────────────── */
  {
    file: K,
    name: "E1 THE OLD FAILURE: the roll stops asking for a vision",
    from: "    await this.#takeSeersVision();",
    to: "    ;",
    breaks: "E2 — the fourth spell of this shape, going nowhere like the first"
  },
  {
    file: K,
    name: "E2 the vision is asked for AFTER the roll",
    from: "    await this.#takeSeersVision();",
    to: "",
    breaks: "E2/E3 — after the roll there is no die left to replace"
  },
  {
    file: K,
    name: "E3 the roll ignores the forced draw",
    from: "    const draw = this._visionDraw ?? (() => this.#drawDie(20));",
    to: "    const draw = () => this.#drawDie(20);",
    breaks: "E5 — the draw is built, and the die rolls normally"
  },
  {
    file: K,
    name: "E4 the roll mode stops being asked",
    from: "      if (!seersVisionConsumes(this.type, this.rollMode, pending)) return;",
    to: "      if (!pending) return;",
    breaks: "E6b/C5 — an attack, and a secret roll, both spend it"
  },
  {
    file: K,
    name: "E5 the vision is consumed before the draw is built",
    from: "      this._visionDraw = visionDraw(pending.value, () => this.#drawDie(20));",
    to: "      await consumeSeersVision(this.actor);\n      this._visionDraw = visionDraw(pending.value, () => this.#drawDie(20));",
    breaks: "E6e — the order that keeps the spend and the use together"
  },
  {
    file: K,
    name: "E6 a failure in the hook loses the roll",
    from: "      console.error(\"TRG Prime | Seer's Vision could not be applied to this check\", error);",
    to: "      throw error;",
    breaks: "E6f — a stale flag would cost the player their card"
  },
  {
    file: K,
    name: "E7 the card stops saying the die was replaced",
    from: "      subtitle: this.#subtitleWithVision(),",
    to: "      subtitle: this.subtitle,",
    breaks: "D3 — the Grapple defect at its sharpest: a replaced die nobody is told about"
  },

  /* ── V: the cast ───────────────────────────────────────────────── */
  {
    file: A,
    name: "V1 the spell chooses a number instead of rolling one",
    from: '          const visionRoll = await new Roll("1d20").evaluate();',
    to: "          const visionRoll = { total: 20 };",
    breaks: "F5 — the whole spell is the gamble that the roll is a good one"
  },
  {
    file: A,
    name: "V2 a refused record is swallowed",
    from: "          if (!recorded) {",
    to: "          if (false) {",
    breaks: "F7 — the card claims a vision nobody holds"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, F, K, A, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-seers-vision: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-seers-vision: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-seers-vision: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
