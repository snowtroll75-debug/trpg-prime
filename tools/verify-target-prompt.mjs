#!/usr/bin/env node
/**
 * verify-target-prompt — what the target picker says.
 *
 * NEW at 3.407.2. Found in live play: a caster transforming a handful of
 * mud with Healing Earth was asked to "Choose the target(s) for this
 * attack." The sentence was hardcoded for every caller — weapon attacks,
 * alchemical items and every targeted spell alike.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  targetPromptText, DEFAULT_TARGET_PROMPT, ATTACK_TARGET_PROMPT, targetRowNote
} from "../module/combat/target-prompt.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};

// A1 IS THE DEFECT. A cantrip that transforms mud is not an attack.
ok("A1 a non-attack is not called an attack",
  !/attack/i.test(targetPromptText({ targets: "a handful of dirt or mud" })),
  "Healing Earth was asked which creature to attack");
ok("A2 and the book's own words are shown",
  targetPromptText({ targets: "a handful of dirt or mud" }) === "Targets: a handful of dirt or mud");

ok("A3 an attack with no printed targets keeps the attack wording",
  targetPromptText({ isAttack: true }) === ATTACK_TARGET_PROMPT,
  "the original sentence was right where it came from");
ok("A4 an unknown caller gets a neutral sentence",
  targetPromptText() === DEFAULT_TARGET_PROMPT);
ok("A4b which says nothing about attacking", !/attack/i.test(DEFAULT_TARGET_PROMPT));

// A5: THE PRINTED LINE WINS EVEN FOR AN ATTACK — "Targets 1 living
// creature" tells a player more than "for this attack" does.
ok("A5 a printed line beats the attack wording",
  targetPromptText({ isAttack: true, targets: "1 living creature" }) === "Targets: 1 living creature");

ok("A6 blank and whitespace targets fall back", targetPromptText({ targets: "   " }) === DEFAULT_TARGET_PROMPT);
ok("A6b as does a missing one", targetPromptText({ targets: null }) === DEFAULT_TARGET_PROMPT);

/* The dialog must actually SHOW it, and every caller must supply one. */
{
  const t = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs"), "utf8");
  ok("B1 the dialog renders the prompt it was given",
    /<p class="hint">\$\{prompt\}<\/p>/.test(t));
  ok("B2 and no longer hardcodes the attack sentence",
    !/Choose the target\(s\) for this attack\.<\/p>/.test(t),
    "the string may only survive in target-prompt.mjs, where an attack asks for it");
  ok("B3 its default is the neutral one", /prompt = targetPromptText\(\)/.test(t));

  const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
  // B4 RE-ANCHORED AT 3.498.0. The cast now composes its prompt from two
  // pieces — the printed line and, where the enforced number is not the
  // obvious one, the target cap's note — so `prompt:` no longer sits
  // directly against `targetPromptText(`. What this asserts is unchanged:
  // the spell's own printed targets reach the picker.
  ok("B4 a spell offers its own printed targets",
    /targetPromptText\(\{[\s\S]{0,160}targets: spellData\?\.targets/.test(cast));
  ok("B4c and the composed prompt is what the picker is handed",
    /prompt: \[[\s\S]{0,400}\]\.filter\(Boolean\)\.join\(" "\),/.test(cast),
    "the pieces must reach the dialog, not merely be computed");
  ok("B4b and marks itself an attack only when it is one",
    /isAttack: spellData\?\.category === "attack"/.test(cast));

  const atk = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs"), "utf8");
  ok("B5 a weapon attack still says attack",
    /prompt: targetPromptText\(\{ isAttack: true \}\)/.test(atk));

  const alch = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "alchemical-workflow.mjs"), "utf8");
  // 3.578.0 (block 18, R4): a thrown bomb IS an attack now — rolled
  // against the target's DB by the thrown-weapon rules.
  ok("B6 a thrown bomb says attack",
    /prompt: targetPromptText\(\{ isAttack: true \}\)/.test(alch));
}

/* ================================================================== *
 * C. THE ROW ANNOTATION (3.443.2)
 *
 * WHY IT EXISTS. Driving Counter Perform on 31 August 2026 found the
 * side gate refusing a hostile token correctly and the picker above it
 * still offering that token as an ordinary row — the refusal arrived
 * after the choice. Nothing was spent; nothing was said either.
 *
 * DRIVEN, NOT READ. `targeting.mjs` cannot be imported outside Foundry,
 * which is exactly why this behaviour lives in the pure file: a claim
 * about it that only matched source text is the failure 3.443.1 was
 * written to stop repeating.
 * ================================================================== */

const TOKEN = { id: "t1", name: "Foe" };

ok("C1 a row with nothing to say is left alone",
  targetRowNote(TOKEN, () => null) === "",
  "an empty annotation must not print an empty dash");
ok("C1b as is a row with no gate at all",
  targetRowNote(TOKEN, null) === "" && targetRowNote(TOKEN, undefined) === ""
  && targetRowNote(TOKEN, "is not an ally") === "",
  "every spell that declares no side passes null here");
ok("C2 a refused row prints the gate's own sentence",
  targetRowNote(TOKEN, () => "is not an ally").includes("is not an ally"));
ok("C2b and prints it as an annotation, not as the name",
  /^ <em class="trg-target-note">— is not an ally<\/em>$/.test(targetRowNote(TOKEN, () => "is not an ally")),
  "it is appended to the row, so it must open with a separator");
// THE GATE IS ASKED ABOUT THIS ROW'S TOKEN, not about some other one. A
// note that ignored its argument would annotate every row identically.
ok("C3 the gate is asked about this row's own token",
  targetRowNote(TOKEN, (t) => (t === TOKEN ? "is not an ally" : null)).includes("is not an ally"));
// A THROWING NOTE COSTS THE ANNOTATION AND NOTHING ELSE. This decorates a
// dialog a player is waiting at; the gate downstream still refuses.
let threw = false;
try {
  ok("C4 a gate that throws costs only its own annotation",
    targetRowNote(TOKEN, () => { throw new Error("boom"); }) === "");
} catch { threw = true; }
ok("C4b and does not escape the row", threw === false);
ok("C5 whitespace is not an annotation", targetRowNote(TOKEN, () => "   ") === "");

/* And the dialog must actually ASK, and the cast must actually SUPPLY. */
{
  const t = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "targeting.mjs"), "utf8");
  ok("C6 the dialog annotates each row through the shared helper",
    /\$\{targetRowNote\(token, note\)\}/.test(t),
    "an annotation computed and not rendered is the Cutting Words failure in miniature");
  // GRAHAM'S RULING, 27 AUGUST 2026: the picker offers, it does not
  // adjudicate. Every candidate must still reach the row list.
  ok("C6b and still offers every candidate",
    /const rows = ordered\s*\n\s*\.map\(/.test(t) && !/ordered\s*\n?\s*\.filter\(/.test(t),
    "a row removed is the ruling broken — annotate, do not adjudicate");
  ok("C6c and leaves the box tickable",
    !/<input type="checkbox" name="target"[^>]*disabled/.test(t),
    "a box that cannot be ticked is a removal wearing a label");

  const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
  ok("C7 a spell hands the picker its own side gate",
    /note: dispositionReasonFor\(actor, spell\)/.test(cast),
    "the picker must not grow a second opinion about who may be targeted");
  const flow = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cutting-words-workflow.mjs"), "utf8");
  ok("C7b and the refusal is written in terms of that same gate",
    /const ask = dispositionReasonFor\(caster, spell\);/.test(flow),
    "two functions answering one question is the second place this project keeps paying to remove");
}

process.stdout.write(`verify-target-prompt: ${checks} checks\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
