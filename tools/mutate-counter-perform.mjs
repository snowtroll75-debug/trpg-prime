#!/usr/bin/env node
/**
 * mutate-counter-perform — can verify-counter-perform fail? NEW at 3.443.0.
 *
 * R1 IS THE ONE THAT MATTERS. It deletes the call from `evaluate`, which
 * is exactly how Cutting Words failed the first time it shipped: the cast
 * card said the target "is affected" and the penalty went nowhere. The
 * name survives in the dynamic import inside `#takeCounterPerform`, so a
 * whole-file check would not notice.
 *
 * N1 IS THE BUG THIS PAIR ALREADY CAUGHT ONCE. `Number(null)` is zero and
 * zero is finite, so guarding a missing DC with `Number.isFinite` alone
 * turns "no DC" into DC 0 and hands out a heroic bonus. Written into the
 * first draft by the same hand that had just written a header warning
 * against guessing the DC.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const CP = path.join(SYSTEM_ROOT, "module", "magic", "counter-perform.mjs");
const WF = path.join(SYSTEM_ROOT, "module", "magic", "counter-perform-workflow.mjs");
const CK = path.join(SYSTEM_ROOT, "module", "dice", "check.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CWF = path.join(SYSTEM_ROOT, "module", "magic", "cutting-words-workflow.mjs");
const CWR = path.join(SYSTEM_ROOT, "module", "magic", "cutting-words.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-counter-perform.mjs");

const MUTATIONS = [
  /* ── R: is it reached? ─────────────────────────────────────────── */
  {
    file: CK,
    name: "R1 the roll stops asking for a waiting bonus",
    from: "    await this.#takeCounterPerform();",
    to: "    ;",
    breaks: "F1 — Cutting Words' original failure exactly: the card says it worked and nothing lands"
  },
  {
    file: CK,
    name: "R2 the bonus lands after the outcome is built",
    from: "    await this.#takeCuttingWords();",
    to: "",
    breaks: "F2/F3 — a modifier pushed after buildOutcome prints on the card and turns no save"
  },
  {
    file: CK,
    name: "R3 the bonus is spent before the roll sees it",
    from: "      this.modifiers.push(modifier);\n      // SPENT EVEN IF A LARGER STATUS BONUS WINS THE POOL",
    to: "      await consumeCounterPerform(this.actor);\n      this.modifiers.push(modifier);\n      // SPENT EVEN IF A LARGER STATUS BONUS WINS THE POOL",
    breaks: "F8 — consuming first spends a bonus the roll never saw"
  },
  {
    file: CK,
    name: "R4 the check type stops being asked",
    from: "      if (!counterPerformConsumes(this.type, pending)) return;",
    to: "      if (false) return;",
    breaks: "F6 — the shield lands on attacks, skill checks and damage rolls alike"
  },
  {
    file: CK,
    name: "R5 a failure in the hook loses the roll",
    from: "      // A roll must never be lost to this.\n      console.error(\"TRG Prime | Counter Perform could not be applied to this check\", error);",
    to: "      throw error; // eslint-disable-line no-useless-catch",
    breaks: "F9 — a stale flag would cost the player their card"
  },

  /* ── N: the number ─────────────────────────────────────────────── */
  {
    file: CP,
    name: "N1 a missing DC becomes DC zero",
    from: "  if (!usableNumber(incomingSaveDC) || !usableNumber(performTotal)) return 0;",
    to: "  if (!Number.isFinite(Number(incomingSaveDC)) || !Number.isFinite(Number(performTotal))) return 0;",
    breaks: "B8 — the bug this pair caught on its first run: null is 0, 0 is finite, and a good Perform comes back heroic"
  },
  {
    file: CP,
    name: "N2 the negative half of the table stops being disregarded",
    from: "  return Math.max(0, Number(outcome.bonusCheck) || 0);",
    to: "  return Number(outcome.bonusCheck) || 0;",
    breaks: "B6/B7/C1 — a fumbled performance makes the ally WORSE at resisting"
  },
  {
    file: CP,
    name: "N3 the spell grows a ladder of its own",
    from: "  const outcome = buildOutcome({ dieTotal: Number(performTotal), dc: Number(incomingSaveDC) });",
    to: "  const outcome = { bonusCheck: Number(performTotal) >= Number(incomingSaveDC) ? 2 : 0 };",
    breaks: "C1 — two places deciding one question, and the book names the shared one"
  },
  {
    file: CP,
    name: "N4 a bonus of zero is recorded anyway",
    from: "  const value = Math.max(0, Math.trunc(Number(bonus)) || 0);\n  if (!value) return null;",
    to: "  const value = Math.max(0, Math.trunc(Number(bonus)) || 0);",
    breaks: "D2/D3 — a stored zero looks like an effect and is eaten by the next save"
  },
  {
    file: CP,
    name: "N5 the bonus becomes circumstance rather than status",
    from: '    type: "status"\n  };\n}\n\n/** Does this check spend',
    to: '    type: "circumstance"\n  };\n}\n\n/** Does this check spend',
    breaks: 'D5 — the book says "granted as a status bonus", and the type is what stops two Bards stacking'
  },
  {
    file: CP,
    name: "N6 the spell reaches checks it does not name",
    from: '  return String(checkType ?? "").toLowerCase() === "save";',
    to: '  return true;',
    breaks: "E2/E3/E4 — the shield lands on an attack"
  },

  /* ── A: the applier ────────────────────────────────────────────── */
  {
    file: FX,
    name: "A1 the applier uses this cast's own degree instead of its total",
    from: "          const performTotal = Number(rollData?.castTotal);",
    to: "          const performTotal = Number(rollData?.saveDC);",
    breaks: "G2 — compared against the wrong number entirely"
  },
  {
    file: FX,
    name: "A2 a cast that rolled no check is compared anyway",
    from: "          if (!Number.isFinite(performTotal)) {",
    to: "          if (false) {",
    breaks: "G3"
  },
  {
    file: FX,
    name: "A3 a cancelled DC prompt applies something",
    from: "          if (incomingDC === null) {",
    to: "          if (false) {",
    breaks: "G5 — and with the prompt cancelled the bonus would be sized off nothing"
  },
  {
    file: CW,
    name: "A4 the cast stops threading its total",
    from: "        castTotal: check?.outcome?.total ?? null",
    to: "        castTotal: null",
    breaks: "G8 — every Counter Perform refuses itself, quietly, for want of a number"
  },

  /* ── W: the workflow ───────────────────────────────────────────── */
  {
    file: WF,
    name: "W1 two Bards stack instead of the larger winning",
    from: "  if (held && Number(held.bonus) >= record.bonus) return held;",
    to: "  if (false) return held;",
    breaks: "H2 — a status bonus that stacks is not a status bonus"
  },
  {
    file: WF,
    name: "W2 the bonus is written where nothing reads it",
    from: "  await target.setFlag(SYSTEM_ID, COUNTER_PERFORM_FLAG, record);",
    to: '  await target.setFlag(SYSTEM_ID, "counterPerformPending", record);',
    breaks: "H3 — the applier and the roll stop agreeing on where the bonus lives"
  },
  {
    file: WF,
    name: "W3 clearing a spent bonus can throw",
    from: "    console.error(\"TRG Prime | Could not clear a spent Counter Perform bonus\", error);",
    to: "    throw error; // eslint-disable-line no-useless-catch",
    breaks: "H4 — this runs inside a roll that has already happened"
  },

  /* ── S: the side gate (3.443.1) ────────────────────────────────── */
  {
    // THE DEFECT DRIVING FOUND (3.443.1). The gate was keyed to "enemies"
    // alone, so a spell declaring "allies" fell through it and the picker
    // offered a foe — a Bard shielding an enemy. Caught at a table, not by
    // the harness, which had asserted only that the pack carried the word.
    file: CWF,
    name: "S1 the side gate stops answering to allies",
    from: '  if (side !== "enemies" && side !== "allies") return null;',
    to: '  if (side !== "enemies") return null;',
    breaks: "H7b — Counter Perform's declaration goes back to meaning nothing"
  },
  {
    file: CWF,
    name: "S2 the side is read and then not passed on",
    from: "      rangeFeet,\n      side",
    to: "      rangeFeet",
    breaks: "H7c — the gate runs, judges every target as an enemy, and refuses every ally"
  },
  {
    file: CWR,
    name: "S3 the caster stops being a legal target for an allies spell",
    from: '  if (isSelf) {\n    if (!wantsAllies) return { eligible: false, reason: "is the caster" };',
    to: '  if (isSelf) {\n    if (true) return { eligible: false, reason: "is the caster" };',
    breaks: '"you or a studied ally" — H7e, the caster is the first person the spell names'
  },
  {
    file: CWR,
    name: "S4 an enemy is eligible for an allies spell",
    from: '  } else if (wantsAllies) {\n    if (isEnemy) return { eligible: false, reason: "is not an ally" };',
    to: '  } else if (wantsAllies) {\n    if (false) return { eligible: false, reason: "is not an ally" };',
    breaks: "H7d — the defect itself, one layer down"
  },

  /* ── T: the card names the check it rolled (3.443.2) ────────────── */
  {
    // THE DEFECT DRIVING FOUND (3.443.2). A cast without Bardic
    // Performance rolls SPELLCRAFT, and the card said "Perform 10" over
    // it. The number was right and the sentence was not.
    file: FX,
    name: "T1 THE DEFECT: the card calls every casting check a Perform check",
    from: "`<em>(${castSkill} ${performTotal} vs DC ${incomingDC})</em>`",
    to: "`<em>(Perform ${performTotal} vs DC ${incomingDC})</em>`",
    breaks: "J1/J1b — a Spellcraft 10 printed as a Perform 10"
  },
  {
    file: FX,
    name: "T2 an unnamed check is guessed to be a Perform one",
    from: '|| "Casting check"',
    to: '|| "Perform"',
    breaks: "J2 — the defect returning through the fallback"
  },
  {
    file: CW,
    name: "T3 the cast stops saying which check it rolled",
    from: '        castSkill: usePerform ? "Perform" : "Spellcraft"',
    to: '        castSkill: "Perform"',
    breaks: "J3 — one word for both roads, which is where this started"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([CP, WF, CK, FX, CW, CWF, CWR, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-counter-perform: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-counter-perform: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-counter-perform: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
