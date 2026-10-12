#!/usr/bin/env node
/**
 * mutate-hide-from-animals — can verify-hide-from-animals fail?
 *
 * NEW at 3.503.0.
 *
 * C2 IS THE JUDGEMENT THIS SPELL TURNS ON. "Attacks any creature, even
 * with a spell" — a spell that only forces a save is still an attack, and
 * a system that disagreed would leave a warded caster hidden after
 * dropping a Stinking Cloud on somebody.
 *
 * G1/G2 ARE THE ONLY REASON THE RULE IS KEPT AT ALL. A ward that ended on
 * a Strike from the sheet but not on one from a reaction feat would be
 * worse than one nobody automated, because the table would trust it.
 *
 * G7 IS THE ONE THAT WOULD MAKE THE SYSTEM UNUSABLE rather than wrong: a
 * card on every weapon attack in the game.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "hide-from-animals.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "hide-from-animals-workflow.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-hide-from-animals.mjs");

const MUTATIONS = [
  /* ── N: the row ────────────────────────────────────────────────── */
  {
    file: P,
    name: "N1 a malformed row becomes a ward",
    from: "  if (raw.kind !== undefined && text(raw.kind) !== \"hideFromAnimals\") return null;",
    to: "",
    breaks: "N2 — every effect row would place one"
  },
  {
    file: P,
    name: "N2 the flag is renamed at one end",
    from: "const HIDE_FLAG = \"hideFromAnimals\";",
    to: "const HIDE_FLAG = \"hidden\";",
    breaks: "N4 — the placer and the two gates would name different flags"
  },

  /* ── C: what counts as an attack ───────────────────────────────── */
  {
    file: P,
    name: "C1 A SAVE SPELL STOPS ENDING IT",
    from: "  return Boolean(text(spellSystem.defence));",
    to: "  return false;",
    breaks: "C2 — a warded caster still hidden after dropping a cloud on somebody"
  },
  {
    file: P,
    name: "C2 an attack spell stops ending it",
    from: "  if (text(spellSystem.category).toLowerCase() === \"attack\") return true;",
    to: "",
    breaks: "C1 — the plainest reading of \"even with a spell\""
  },
  {
    file: P,
    name: "C3 EVERY CAST ENDS IT, including the ward's own",
    from: "  if (text(spellSystem.category).toLowerCase() === \"attack\") return true;",
    to: "  return true;",
    breaks: "C3/C4 — casting Light would end it, and so would placing it"
  },
  {
    file: P,
    name: "C4 a blank defence field counts as a defence",
    from: "  return Boolean(text(spellSystem.defence));",
    to: "  return spellSystem.defence !== undefined;",
    breaks: "C6 — whitespace is what 300 pack rows carry where a field is absent"
  },

  /* ── G: the two gates ──────────────────────────────────────────── */
  {
    file: ATTACK,
    name: "G1 THE WEAPON GATE IS REMOVED",
    from: "    const { endHidingWards } = await import(\"../magic/hide-from-animals-workflow.mjs\");\n    await endHidingWards(actor, \"weapon\");",
    to: "",
    breaks: "G1 — the half the table forgets, unautomated again"
  },
  {
    file: CAST,
    name: "G2 THE SPELL GATE IS REMOVED",
    from: "    const { endHidingWards } = await import(\"./hide-from-animals-workflow.mjs\");\n    await endHidingWards(actor, \"spell\");",
    to: "",
    breaks: "G2 — \"even with a spell\" is the clause most easily missed"
  },
  {
    file: CAST,
    name: "G3 the spell gate stops asking whether the spell is an attack",
    from: "  if (castEndsHiding(spellData)) {",
    to: "  if (true) {",
    breaks: "G3 — casting Light would end it"
  },
  {
    file: CAST,
    name: "G4 THE SPELL GATE MOVES ABOVE THE ACTION SPEND",
    from: "  await spendActionCost(actor, totalCastAP, spell.name);\n\n  /*\n   * AND A SPELL COUNTS AS AN ATTACK (3.503.0).",
    to: "  if (castEndsHiding(spellData)) {\n    const { endHidingWards } = await import(\"./hide-from-animals-workflow.mjs\");\n    await endHidingWards(actor, \"spell\");\n  }\n  await spendActionCost(actor, totalCastAP, spell.name);\n\n  /*\n   * AND A SPELL COUNTS AS AN ATTACK (3.503.0).",
    breaks: "G4 — a ward spent on a cast that was then refused"
  },
  {
    file: FLOW,
    name: "G5 THE CARD IS POSTED BEFORE THE WARD IS DELETED",
    from: "  await actor.deleteEmbeddedDocuments(\"ActiveEffect\", wards.map((w) => w.id));",
    to: "  setTimeout(() => actor.deleteEmbeddedDocuments(\"ActiveEffect\", wards.map((w) => w.id)), 0);",
    breaks: "G6 — a card that can be read while the thing it describes is still there"
  },
  {
    file: FLOW,
    name: "G6 A CARD ON EVERY ATTACK IN THE GAME",
    from: "  if (!wards.length) return 0;",
    to: "",
    breaks: "G7 — not wrong, unusable"
  },
  {
    file: FLOW,
    name: "G7 a disabled ward is ended anyway",
    from: "    if (e.disabled) return false;",
    to: "",
    breaks: "G8 — a GM who switched the effect off has already ended it"
  },

  /* ── D: what is said and admitted ──────────────────────────────── */
  {
    file: P,
    name: "D1 THE EFFECT'S NAME STOPS ADMITTING THE UNAUTOMATED HALF",
    from: "  return `${spec?.label || \"Hide From Animals\"} (animals cannot sense them — run by hand)`;",
    to: "  return `${spec?.label || \"Hide From Animals\"}`;",
    breaks: "D1 — a GM reads the effect's name and nothing else"
  },
  {
    file: P,
    name: "D2 the card promises only the ending",
    from: "Animals — including blindsense, blindsight, scent and tremorsense — simply act ",
    to: "The ward is placed. ",
    breaks: "D3/D4 — a table assuming the hiding was enforced too"
  },
  {
    file: P,
    name: "D3 both endings give the same reason",
    from: "  spell: \"they attacked with a spell\"",
    to: "  spell: \"they attacked\"",
    breaks: "D5/D6 — a player retrying the same action three times"
  },

  /* ── P: the placement ──────────────────────────────────────────── */
  {
    file: EFFECTS,
    name: "P1 THE WARD IS NEVER PLACED",
    from: "        case \"hideFromAnimals\": {",
    to: "        case \"hideFromAnimalsUnused\": {",
    breaks: "P7 — the kind would be unhandled and the card would say so"
  },
  {
    file: EFFECTS,
    name: "P2 the effect is named without its clause",
    from: "            name: hideEffectName(spec),",
    to: "            name: spec.label,",
    breaks: "D1 — the one place a GM looking at the token will read it"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, FLOW, ATTACK, CAST, EFFECTS, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-hide-from-animals: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-hide-from-animals: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-hide-from-animals: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
