#!/usr/bin/env node
/** mutate-target-prompt — can verify-target-prompt fail? NEW at 3.407.2. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "combat", "target-prompt.mjs");
const T = path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const A = path.join(SYSTEM_ROOT, "module", "alchemical-workflow.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "cutting-words-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-target-prompt.mjs");

const MUTATIONS = [
  {
    name: "THE DEFECT: everything is called an attack again",
    file: P,
    from: 'export const DEFAULT_TARGET_PROMPT = "Choose the target(s).";',
    to: 'export const DEFAULT_TARGET_PROMPT = "Choose the target(s) for this attack.";',
    breaks: "A4b — a healing cantrip asks which creature to attack"
  },
  {
    name: "the printed target line is ignored",
    file: P,
    from: "  if (printed) return `Targets: ${printed}`;",
    to: "  if (false) return `Targets: ${printed}`;",
    breaks: "A2/A5 — the book's own words never reach the player"
  },
  {
    name: "an attack loses its own wording",
    file: P,
    from: "  return isAttack ? ATTACK_TARGET_PROMPT : DEFAULT_TARGET_PROMPT;",
    to: "  return DEFAULT_TARGET_PROMPT;",
    breaks: "A3 — the sentence that was correct where it came from"
  },
  {
    name: "whitespace counts as a printed target line",
    file: P,
    from: '  const printed = String(targets ?? "").trim();',
    to: '  const printed = String(targets ?? "");',
    breaks: 'A6 — a blank targets field prints "Targets:    "'
  },
  {
    name: "the dialog stops showing what it was given",
    file: T,
    from: '<p class="hint">${prompt}</p>',
    to: '<p class="hint">Choose the target(s) for this attack.</p>',
    breaks: "B1/B2 — the hardcoded sentence returns and every caller's prompt is discarded"
  },
  {
    name: "a spell stops offering its printed targets",
    file: C,
    from: "        targets: spellData?.targets",
    to: '        targets: ""',
    breaks: "B4 — Healing Earth is generic again"
  },
  {
    name: "every spell claims to be an attack",
    file: C,
    from: '        isAttack: spellData?.category === "attack",',
    to: "        isAttack: true,",
    breaks: "B4b — a utility spell calls itself an attack"
  },
  {
    name: "a thrown bomb stops calling itself an attack",
    file: A,
    from: "    prompt: targetPromptText({ isAttack: true })",
    to: "    prompt: targetPromptText({ targets: item.system?.targets })",
    breaks: "B6"
  },

  /* ── N: the row annotation (3.443.2) ───────────────────────────── */
  {
    // N1 IS THE DEFECT DRIVING FOUND. The annotation is computed and
    // thrown away, so the row goes back to saying nothing and a player
    // learns the spell cannot reach that creature only after choosing it.
    name: "N1 THE DEFECT: the row says nothing again",
    file: T,
    from: "${targetRowNote(token, note)}",
    to: "",
    breaks: "C6 — the picker offers a hostile token as an ordinary row"
  },
  {
    name: "N2 the annotation is computed and swallowed",
    file: P,
    from: "  return ` <em class=\"trg-target-note\">— ${text}</em>`;",
    to: '  return "";',
    breaks: "C2/C2b — a gate with something to say and nowhere to say it"
  },
  {
    name: "N3 an empty reason prints a dangling dash",
    file: P,
    from: "  if (!text) return \"\";\n  return ` <em",
    to: "  return ` <em",
    breaks: "C1/C5 — every ordinary row grows an em-dash and nothing after it"
  },
  {
    name: "N4 a throwing gate escapes the row",
    file: P,
    from: "  } catch {\n    return \"\";",
    to: "  } catch (error) {\n    throw error; // eslint-disable-line no-useless-catch",
    breaks: "C4/C4b — decoration on a dialog costing the player the dialog"
  },
  {
    name: "N5 the gate is asked about the wrong token",
    file: P,
    from: "    reason = note(token);",
    to: "    reason = note(undefined);",
    breaks: "C3 — one answer stamped on every row"
  },
  {
    name: "N6 the picker adjudicates instead of annotating",
    file: T,
    from: "  const rows = ordered\n    .map(",
    to: "  const rows = ordered\n    .filter((token) => !targetRowNote(token, note))\n    .map(",
    breaks: "C6b — Graham's ruling: a picker that silently removes a choice teaches nothing"
  },
  {
    name: "N7 the cast stops handing over its side gate",
    file: C,
    from: "      note: dispositionReasonFor(actor, spell)",
    to: "      note: null",
    breaks: "C7 — the annotation machinery live and nothing ever feeding it"
  },
  {
    name: "N8 the refusal grows a second opinion",
    file: F,
    from: "  const ask = dispositionReasonFor(caster, spell);",
    to: "  const ask = () => null;",
    breaks: "C7b — two places deciding who a spell may reach"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, T, C, A, F, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-target-prompt: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-target-prompt: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-target-prompt: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
