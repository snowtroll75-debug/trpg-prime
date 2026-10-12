#!/usr/bin/env node
/**
 * mutate-inspire-competence — can verify-inspire-competence fail?
 * NEW at 3.448.0.
 *
 * E1 IS THE ONE THAT MATTERS. It deletes the call from `evaluate`, which
 * is exactly how the first spell of this shape failed: Cutting Words'
 * card said the target "is affected" and the penalty went nowhere. The
 * name survives in the dynamic import inside the hook, so a whole-file
 * check would not notice.
 *
 * F1 IS GRAHAM'S RULING. The Aid bonus is measured against an EASY DC
 * for the ALLY'S level; a mutation that uses the caster's makes the same
 * encouragement worth more from a higher-level Bard, which the rule does
 * not say.
 *
 * B1 IS THE SPELL'S OWN SENTENCE. "The minimum bonus granted is +1" is
 * what separates it from an ordinary Aid, which grants nothing on a
 * failure.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "magic", "inspire-competence.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "inspire-competence-workflow.mjs");
const K = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const A = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-inspire-competence.mjs");

const MUTATIONS = [
  /* ── B: the floor that is this spell's own ─────────────────────── */
  {
    file: R,
    name: "B1 THE SENTENCE: the minimum bonus is dropped",
    from: "  return Math.max(MINIMUM_BONUS, earned);",
    to: "  return earned;",
    breaks: "B5 — a failed cast grants nothing, and the spell is an ordinary Aid"
  },
  {
    file: R,
    name: "B2 the floor replaces the table instead of flooring it",
    from: "  return Math.max(MINIMUM_BONUS, earned);",
    to: "  return MINIMUM_BONUS;",
    breaks: "B1/B7 — a heroic cast earns the same as a fumble"
  },
  {
    file: R,
    name: "B3 the spell grows a ladder of its own",
    from: "  const outcome = buildOutcome({ dieTotal: total, dc: aidDC(leadLevel) });",
    to: "  const outcome = { bonusCheck: total >= aidDC(leadLevel) ? 2 : 0 };",
    breaks: "B8 — two places deciding one question, and the rule names the shared one"
  },
  {
    file: R,
    name: "B4 a cast with no check grants nothing",
    from: "  if (!Number.isFinite(total)) return MINIMUM_BONUS;",
    to: "  if (!Number.isFinite(total)) return 0;",
    breaks: "B6 — the printed minimum carries no exception for a checkless cast"
  },

  /* ── D: the DC ─────────────────────────────────────────────────── */
  {
    file: R,
    name: "D1 the Aid check stops being Easy",
    from: 'const AID_DIFFICULTY = "easy";',
    to: 'const AID_DIFFICULTY = "medium";',
    breaks: "A1 — Graham's rule says an EASY skill check"
  },
  {
    file: R,
    name: "D2 the DC ignores the lead's level",
    from: "  const base = levelDC(Number(leadLevel) || 0);",
    to: "  const base = levelDC(0);",
    breaks: "A1/A1b — a 12th-level ally is aided as easily as a 1st-level one"
  },
  {
    file: A,
    name: "D3 the DC is taken from the CASTER instead of the ally",
    from: "          const bonus = inspireCompetenceBonus(castTotal, target.system?.identity?.level ?? 0);",
    to: "          const bonus = inspireCompetenceBonus(castTotal, caster?.system?.identity?.level ?? 0);",
    breaks: "F2 — the same encouragement becomes worth more from a higher-level Bard"
  },

  /* ── C: what is carried ────────────────────────────────────────── */
  {
    file: R,
    name: "C1 the bonus becomes status rather than circumstance",
    from: '    type: "circumstance"',
    to: '    type: "status"',
    breaks: "C3 — the type is what stops two Bards stacking"
  },
  {
    file: R,
    name: "C2 a record may fall below the minimum",
    from: "  const value = Math.max(MINIMUM_BONUS, Math.trunc(Number(bonus) || 0));",
    to: "  const value = Math.trunc(Number(bonus) || 0);",
    breaks: "C1b — a zero stored on the ally, eaten by their next check for nothing"
  },
  {
    file: F,
    name: "C3 two casts stack instead of the larger winning",
    from: "  if (held && Number(held.bonus) >= record.bonus) return held;",
    to: "  if (false) return held;",
    breaks: "F5 — a circumstance bonus that stacks is not a circumstance bonus"
  },
  {
    file: F,
    name: "C4 clearing a spent bonus can throw",
    from: "    console.error(\"TRG Prime | Could not clear a spent Inspire Competence bonus\", error);",
    to: "    throw error; // eslint-disable-line no-useless-catch",
    breaks: "F6 — this runs inside a roll that has already happened"
  },

  /* ── T: which check spends it ──────────────────────────────────── */
  {
    file: R,
    name: "T1 the bonus reaches every kind of check",
    from: '  return String(checkType ?? "").trim().toLowerCase() === "skill";',
    to: "  return true;",
    breaks: "D2/D3 — it lands on saves and attacks, and the pair with Counter Perform stops meaning anything"
  },
  {
    file: R,
    name: "T2 it reaches saves instead of skills",
    from: '  return String(checkType ?? "").trim().toLowerCase() === "skill";',
    to: '  return String(checkType ?? "").trim().toLowerCase() === "save";',
    breaks: "D1/D2 — Counter Perform's territory, and not this spell's"
  },

  /* ── E: is it REACHED? ─────────────────────────────────────────── */
  {
    file: K,
    name: "E1 THE OLD FAILURE: the roll stops asking for a waiting bonus",
    from: "    await this.#takeInspireCompetence();",
    to: "    ;",
    breaks: "E2 — Cutting Words exactly: the card says it worked and nothing lands"
  },
  {
    file: K,
    name: "E2 the bonus is pushed after the roll",
    from: "    await this.#takeInspireCompetence();",
    to: "",
    breaks: "E2/E3 — moved below, it prints on the card and changes no outcome"
  },
  {
    file: K,
    name: "E3 the check type stops being asked",
    from: "      if (!inspireCompetenceConsumes(this.type, pending)) return;",
    to: "      if (false) return;",
    breaks: "E5d — the encouragement lands on attacks and saves alike"
  },
  {
    file: K,
    name: "E4 the modifier is computed and dropped",
    from: "      this.modifiers.push(modifier);\n      // SPENT EVEN IF A LARGER CIRCUMSTANCE BONUS WINS THE POOL",
    to: "      // SPENT EVEN IF A LARGER CIRCUMSTANCE BONUS WINS THE POOL",
    breaks: "E5b — a modifier that goes nowhere"
  },
  {
    file: K,
    name: "E5 the bonus is spent before the roll sees it",
    // ANCHORED WITH ITS NEIGHBOUR. `this.modifiers.push(modifier);` occurs
    // three times in check.mjs — once per spell that uses this road — so
    // the bare line went ANCHOR x3 and proved nothing.
    from: "      this.modifiers.push(modifier);\n      // SPENT EVEN IF A LARGER CIRCUMSTANCE BONUS WINS THE POOL",
    to: "      await consumeInspireCompetence(this.actor);\n      this.modifiers.push(modifier);\n      // SPENT EVEN IF A LARGER CIRCUMSTANCE BONUS WINS THE POOL",
    breaks: "E5d — consuming first spends a bonus the roll never saw"
  },
  {
    file: K,
    name: "E6 a failure in the hook loses the roll",
    from: "      console.error(\"TRG Prime | Inspire Competence could not be applied to this check\", error);",
    to: "      throw error;",
    breaks: "E6 — a stale flag would cost the player their card"
  },

  /* ── S: what the card says ─────────────────────────────────────── */
  {
    file: A,
    name: "S1 the GM-adjudicated half stops being printed",
    from: '            "<em>The GM may rule this has no effect where encouragement would interfere "',
    to: '            "<em>"',
    breaks: "F4 — the table loses the one judgement the spell reserves for it"
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
    process.stderr.write("mutate-inspire-competence: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-inspire-competence: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-inspire-competence: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
