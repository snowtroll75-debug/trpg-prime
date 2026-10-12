#!/usr/bin/env node
/**
 * mutate-wild-morph — can verify-wild-morph fail?
 *
 * NEW at 3.493.0.
 *
 * W3 IS THE SHIPPED DEFECT: the spell carried nothing, so "you gain a
 * natural attack form" was two prompts and no attack.
 *
 * I4 IS THE ONE THAT WOULD BE FOUND AT A TABLE, WRONGLY. A grown claw
 * with no category rolls at −4 for being an unfamiliar weapon, which
 * looks like bad luck for a whole session rather than a bug.
 *
 * C2 IS THE OTHER SIDE OF THE SAME COIN. The cleanup that takes a claw
 * away must not take Bless Water's flask — an item is removed because it
 * SAYS it ends with the spell, never because it carries the spell's stamp.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "wild-morph.mjs");
const SE = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const EAW = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-wild-morph.mjs");

const MUTATIONS = [
  /* ── N: the printed cap ────────────────────────────────────────── */
  {
    file: P,
    name: "N1 the cap is lost, so warps stack past the printed maximum",
    from: "    forms: Math.min(MAX_MORPH_FORMS, Math.max(1, int(raw.forms) || 1))",
    to: "    forms: Math.max(1, int(raw.forms) || 1)",
    breaks: "N4 — \"max 3\" is the spell's own sentence"
  },
  {
    file: P,
    name: "N2 the cap is raised past the printed one",
    from: "const MAX_MORPH_FORMS = 3;",
    to: "const MAX_MORPH_FORMS = 5;",
    breaks: "N3 — the number is printed, not chosen"
  },
  {
    file: P,
    name: "N3 a nonsense count grows nothing instead of one form",
    from: "    forms: Math.min(MAX_MORPH_FORMS, Math.max(1, int(raw.forms) || 1))",
    to: "    forms: Math.min(MAX_MORPH_FORMS, int(raw.forms) || 0)",
    breaks: "N5b — a spell that grew nothing looks like one that is broken"
  },
  {
    file: P,
    name: "N4 the kind stops being checked, so any row becomes a morph",
    from: "  if (raw.kind !== undefined && text(raw.kind) !== \"wildMorph\") return null;",
    to: "  if (false) return null;",
    breaks: "N2 — a note row would grow a claw"
  },

  /* ── I: the item, and the minus four ───────────────────────────── */
  {
    file: P,
    name: "I1 THE −4: the grown claw loses its category",
    from: "      category: \"Unarmed\",",
    to: "",
    breaks: "I4 — the only natural attack in the game rolling as an unfamiliar weapon"
  },
  {
    file: P,
    name: "I2 the form arrives unequipped",
    from: "      equipped: true,",
    to: "      equipped: false,",
    breaks: "I3 — a claw the character must remember to equip misses its round"
  },
  {
    file: P,
    name: "I3 THE TEMPORARY DECLARATION IS DROPPED: the claw is permanent",
    from: "        endsWithSpell: true",
    to: "        endsWithSpell: false",
    breaks: "I5 — a one-minute spell that grants a permanent natural attack"
  },
  {
    file: P,
    name: "I4 the cast is not stamped, so nothing can take it away",
    from: "        castId: castId ?? null,",
    to: "        castId: null,",
    breaks: "I5b — the cleanup matches on the cast"
  },
  {
    file: P,
    name: "I5 the provenance is lost",
    from: "      description: `A natural attack form drawn from ${text(sourceName) || \"a Studied Target\"} `",
    to: "      description: `A natural attack form `",
    breaks: "I6 — a claw nobody can adjudicate"
  },

  /* ── W: is it reached ──────────────────────────────────────────── */
  {
    file: SE,
    name: "W1 THE SHIPPED DEFECT: two prompts and no attack",
    // RE-ANCHORED AT 3.622.0: each grown attack is built, then marked magical.
    from: "            grown.map((f) => {\n              const data = morphAttackData(f, source.name, castId);",
    to: "            [].map((f) => {\n              const data = morphAttackData(f, source.name, castId);",
    breaks: "W3 — \"grant a real one\" was the ruling"
  },
  {
    file: SE,
    name: "W2 the effect kind stops being handled",
    from: '        case "wildMorph": {',
    to: '        case "wildMorphDisabled": {',
    breaks: "W1 — the spell falls through to the unhandled-kind branch"
  },
  {
    file: SE,
    name: "W3 the warp stops being folded in",
    from: "            forms: Number(effect.forms ?? 1) + Number(warpMods?.morphForms ?? 0)",
    to: "            forms: Number(effect.forms ?? 1)",
    breaks: "W5 — the 2 PP warp would buy nothing, as it did before this release"
  },
  {
    file: SE,
    name: "W4 nothing studied applies silently",
    // THE ANCHOR CARRIES THE LINE ABOVE IT. `if (!source) {` appears
    // twice in this file; this runner reported "ANCHOR x2" and that is
    // what sent the verify's own W-section to a sliced case body.
    from: "const source = await promptMorphSource(target, spell.name);\n          if (!source) {",
    to: "const source = await promptMorphSource(target, spell.name);\n          if (false) {",
    breaks: "W6 — the one refusal a player can act on"
  },
  {
    file: SE,
    name: "W5 no form described applies silently",
    from: "          if (!grown.length) {",
    to: "          if (false) {",
    breaks: "W6b"
  },
  {
    file: SE,
    name: "W6 the duration effect is never placed",
    from: "          await createEffectsOn(target, [mData]);",
    to: "",
    breaks: "W4 — the items have no clock of their own, so the claw would never end"
  },

  /* ── C: it must not outlive the spell, and Holy Water must live ── */
  {
    file: EAW,
    name: "C1 THE STAMP ALONE DECIDES: Bless Water's flask is deleted too",
    from: "      && i.getFlag?.(SYSTEM_ID, \"endsWithSpell\") === true)",
    to: "      && true)",
    breaks: "C2 — a real flask the caster keeps, taken off the sheet by a spell ending"
  },
  {
    file: EAW,
    name: "C2 the world clock stops removing the form",
    from: "      await removeSpellItemsByCastId(actor, castId);\n    } finally {\n      expiring.delete(claim);\n    }\n  }\n  return expired;",
    to: "    } finally {\n      expiring.delete(claim);\n    }\n  }\n  return expired;",
    breaks: "C3 — a claw surviving the ordinary end of a one-minute spell"
  },
  {
    file: EAW,
    name: "C3 dismissal stops removing the form",
    from: "  // AND ANYTHING THE SPELL BUILT. See removeSpellItemsByCastId.\n  await removeSpellItemsByCastId(actor, castId);",
    to: "",
    breaks: "C3b — the form's lifetime would depend on how the spell happened to end"
  },
  {
    file: EAW,
    name: "C4 the cast is read after the effect is deleted",
    // WIDENED AT 3.514.0. The bare line went ANCHOR x2 when
    // `expireTimedConditions` gained the same read — the third route that
    // had been leaving Wild Morph's claws behind. An anchor that is one
    // ordinary line is ambiguous the moment the same line is written
    // somewhere else, which is a cousin of `A3`: it anchors on text
    // rather than on the rule the text belongs to. Carries the comment
    // that is unique to the world clock's copy.
    from: "there is nothing left to ask which cast it belonged to.\n      const castId = effect.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) ?? null;",
    to: "there is nothing left to ask which cast it belonged to.\n      const castId = null; // read below instead",
    breaks: "C3c — a deleted effect cannot be asked which cast it was"
  },

  /* ── R: the card ───────────────────────────────────────────────── */
  {
    file: P,
    name: "R1 the card stops naming where the form came from",
    from: "  return `${actorName} grows ${named}, drawn from <strong>${sourceName}</strong>.`;",
    to: "  return `${actorName} grows ${named}.`;",
    breaks: "R1"
  },
  {
    file: P,
    name: "R2 the unautomated warps stop being printed",
    from: "  return \"<em>Warps that replace the attack form — a movement type (+2 PP) or a special ability \"",
    to: "  return \"<em>\" + \"\".concat(\"\") + \"Warps: \"",
    breaks: "R3 — the caster finds out what the choice costs them on the card"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, SE, EAW, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-wild-morph: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-wild-morph: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-wild-morph: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
