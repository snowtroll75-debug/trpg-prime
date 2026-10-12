#!/usr/bin/env node
/**
 * mutate-chapter10-251-260 — can the pages 251-260 checks fail?
 *
 * NEW at 3.586.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MUTATIONS THIS BLOCK MOST NEEDS ARE THE ONES THAT PUT BACK A
 * SILENCE, because every defect it found was a silence:
 *
 *   - Acid Arrow's Sustain choice, authored last week, was recorded
 *     nowhere a picker could read it and offered nothing. The check that
 *     passed it asked whether a READER EXISTED, not whether THIS SPELL
 *     could reach it.
 *   - Barkskin's apOption carried `range: ""`, and `??` let an empty
 *     string replace the spell's printed "touch" rather than fall
 *     through to it.
 *   - `parseSpellDuration("permanent")` returned null, which the
 *     unreadable-duration sweep correctly refuses — so a deliberately
 *     permanent blindness and an unproofread "1 rnd" were the same
 *     thing to every reader in the system.
 *   - a Heroic save on Apocalypse took the Critical's damage from the
 *     ladder while the Critical's "immune to this casting" did not
 *     print, because the two mechanisms read `heroic` differently.
 *
 * Each is a mutation below, put back one line at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const DURATION = at("magic", "effect-duration.mjs");
const CHOICE = at("magic", "sustain-choice.mjs");
const SUSTAINWF = at("magic", "sustain-workflow.mjs");
const ACTIVE = at("magic", "active-spells.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const ANTIMAGIC = at("magic", "antimagic.mjs");
const EMANEFF = at("magic", "emanation-effects.mjs");
const EMANWF = at("magic", "emanation-workflow.mjs");
const EMAN = at("magic", "emanation.mjs");
const KINDS = at("magic", "effect-kinds.mjs");
const EFFECTS = at("magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter10-251-260.mjs");

const MUTATIONS = [
  /* ── A: "permanent" is a duration, not a parse failure ─────────── */
  { file: DURATION, name: "A THE GAP: permanence is a parse failure again",
    from: `  if (/\\bpermanent(ly)?\\b/.test(t)) {`,
    to: "  if (false) {", breaks: "A1" },
  { file: DURATION, name: "A: permanence is readable but does not say so",
    from: `    return { rounds: null, seconds: null, sustained: false, permanent: true };`,
    to: "    return { rounds: null, seconds: null, sustained: false };", breaks: "A3" },
  { file: DURATION, name: "A: a permanent effect is given six seconds instead of none",
    from: `    return { rounds: null, seconds: null, sustained: false, permanent: true };`,
    to: "    return { rounds: 1, seconds: 6, sustained: false, permanent: true };", breaks: "A2" },
  // THE NEUTERING MUTATION. If the branch is widened to anything without
  // a number in it, the whole unreadable-duration sweep stops working
  // and "1 rnd" ships. This is the one that matters most.
  { file: DURATION, name: "A: the branch widens and swallows every typo",
    from: `  if (/\\bpermanent(ly)?\\b/.test(t)) {`,
    to: "  if (!/\\d/.test(t)) {", breaks: "A6" },
  { file: DURATION, name: "A: permanence is checked before the numeric forms it must not shadow",
    from: `  if (/\\bpermanent(ly)?\\b/.test(t)) {
    return { rounds: null, seconds: null, sustained: false, permanent: true };
  }`,
    to: `  if (/\\bpermanent(ly)?\\b/.test(t) || /minute/.test(t)) {
    return { rounds: null, seconds: null, sustained: false, permanent: true };
  }`, breaks: "A8" },
  { file: DURATION, name: "A: the adverb the page actually prints stops reading",
    from: `  if (/\\bpermanent(ly)?\\b/.test(t)) {`,
    to: "  if (/\\bpermanent\\b/.test(t) && !/ly/.test(t)) {", breaks: "A5" },

  /* ── B: a Sustain that buys something other than time ──────────── */
  { file: CHOICE, name: "B THE GAP: only the emanation copy is read, as before",
    from: `  const raw = Array.isArray(entry?.sustainChoices) && entry.sustainChoices.length
    ? entry.sustainChoices
    : (Array.isArray(entry?.emanation?.sustainChoices) ? entry.emanation.sustainChoices : []);`,
    to: `  const raw = Array.isArray(entry?.emanation?.sustainChoices) ? entry.emanation.sustainChoices : [];`,
    breaks: "B1" },
  { file: CHOICE, name: "B: Luminance's copy stops being read, one release after Blink's starts",
    from: `    : (Array.isArray(entry?.emanation?.sustainChoices) ? entry.emanation.sustainChoices : []);`,
    to: "    : [];", breaks: "B2" },
  { file: CHOICE, name: "B: a keyless row is offered and then cannot be found",
    from: `    if (!key || seen.has(key)) continue;`, to: "    if (seen.has(key)) continue;",
    breaks: "B4" },
  { file: CHOICE, name: "B: two rows answer to one key",
    from: `    if (!key || seen.has(key)) continue;`, to: "    if (!key) continue;", breaks: "B5" },
  { file: CHOICE, name: "B: a row with no label renders blank in the dialog",
    from: `    out.push({ key, label: text(row?.label) || key, note: text(row?.note) });`,
    to: "    out.push({ key, label: text(row?.label), note: text(row?.note) });", breaks: "B6" },
  { file: CHOICE, name: "B: Luminance is handed the plain picker as well as its own",
    from: `  if (entry?.luminance) return false;`, to: "  if (false) return false;", breaks: "B8" },
  { file: CHOICE, name: "B: an undeclared key silently becomes the first row",
    from: `  return declaredSustainChoices(entry).find((c) => c.key === wanted) ?? null;`,
    to: "  return declaredSustainChoices(entry).find((c) => c.key === wanted) ?? declaredSustainChoices(entry)[0] ?? null;",
    breaks: "B11" },
  { file: CHOICE, name: "B: the card paraphrases with the button label instead of the note",
    from: `  return String(choice.note || choice.label || "").replace(/\\.$/, "");`,
    to: `  return String(choice.label || choice.note || "").replace(/\\.$/, "");`, breaks: "B13" },
  { file: ACTIVE, name: "B: the entry stops carrying what a Sustain buys",
    from: `    sustainChoices: Array.from(sustainChoices ?? []).map((c) => ({ ...c })),`,
    to: "    sustainChoices: [],", breaks: "B17" },
  { file: ACTIVE, name: "B: the pack row becomes mutable through the entry",
    from: `    sustainChoices: Array.from(sustainChoices ?? []).map((c) => ({ ...c })),`,
    to: "    sustainChoices: sustainChoices ?? [],", breaks: "B17" },
  // THE SHIPPED DEFECT, PUT BACK EXACTLY. This is the state Acid Arrow
  // was in: the field authored, a reader existing, and no route between.
  { file: CASTWF, name: "B THE SHIPPED DEFECT: the cast stops passing the choices at registration",
    from: `        sustainChoices: Array.isArray(spellData.sustainChoices) ? spellData.sustainChoices : [],`,
    to: "", breaks: "B18" },
  { file: SUSTAINWF, name: "B: the plain picker is never offered",
    from: `  if (offersPlainSustainChoice(entry)) {`, to: "  if (false) {", breaks: "B19" },
  { file: SUSTAINWF, name: "B: cancelling the picker still spends the action point",
    from: `    if (!plainChoice) return null;`, to: "    if (!plainChoice) plainChoice = null;",
    breaks: "B20" },
  { file: SUSTAINWF, name: "B: what the Sustain bought never reaches the card",
    from: `  if (plainChoice) choiceNote = sustainChoiceLine(plainChoice);`, to: "",
    breaks: "B22" },

  /* ── C: antimagic — suppressed, not ended ──────────────────────── */
  { file: ANTIMAGIC, name: "C THE GAP: the field suppresses nothing",
    from: `    if (!flags.spellBuff) continue;`, to: "    continue;", breaks: "C4" },
  { file: ANTIMAGIC, name: "C: it suppresses everything, including a poison",
    from: `    if (!flags.spellBuff) continue;`, to: "", breaks: "C7" },
  { file: ANTIMAGIC, name: "C: the field switches itself off the instant it comes on",
    from: `    if (castId && flags.castId === castId) continue;`, to: "", breaks: "C5" },
  { file: ANTIMAGIC, name: "C: two overlapping fields switch each other off",
    from: `    if (flags[ANTIMAGIC_FLAG]) continue;`, to: "", breaks: "C6" },
  // THE ONE WITH TEETH. Sweeping up an already-disabled effect means
  // switching it back ON when the field drops — the field restoring
  // something it never suppressed.
  { file: ANTIMAGIC, name: "C: an effect a GM switched off by hand is switched back on later",
    from: `    if (effect?.disabled) continue;`, to: "", breaks: "C8" },
  { file: ANTIMAGIC, name: "C: the restore list is recomputed rather than read back",
    from: `  const recorded = marker?.flags?.[systemId]?.[ANTIMAGIC_FLAG]?.suppressed;`,
    to: "  const recorded = [];", breaks: "C10" },
  { file: ANTIMAGIC, name: "C: the card stops promising the page's own sentence",
    from: `    ? \`<strong>\${name}</strong>: \${count} magical effect\${count === 1 ? "" : "s"} \`
      + \`function\${count === 1 ? "s" : ""} as before.\``,
    to: `    ? \`<strong>\${name}</strong>: \${count} effects lifted.\``, breaks: "C17" },
  { file: ANTIMAGIC, name: "C: a field that found nothing to suppress says nothing at all",
    from: `    : \`<strong>\${name}</strong>: inside the field. No magical effects to suppress.\`;`,
    to: '    : "";', breaks: "C15" },
  { file: ANTIMAGIC, name: "C: the card says ended, which is the one thing the page denies",
    from: "<strong>suppressed</strong> while inside the field \u2014 not ended.",
    to: "<strong>ended</strong> while inside the field.", breaks: "C14" },
  { file: EMAN, name: "C: an antimagic field stops being a live emanation and never follows its caster",
    // RE-ANCHORED 3.609.0: the list gained "turnSave" (Turn Undead).
    // RE-ANCHORED 3.612.0: the list gained "heldBonus" (Inspire Heroics).
    // RE-ANCHORED 3.613.0: the list gained "defence" (Protector's Sphere).
    from: `export const LIVE_EMANATION_EFFECT_KINDS = Object.freeze(["bonus", "perTurn", "antimagic", "zone", "turnSave", "heldBonus", "defence", "damageHeal"]);`,
    to: `export const LIVE_EMANATION_EFFECT_KINDS = Object.freeze(["bonus", "perTurn", "zone", "turnSave", "heldBonus", "defence", "damageHeal"]);`,
    breaks: "C19" },
  { file: KINDS, name: "C: the kind is undeclared and every card prints Unhandled",
    from: `  "antimagic",`, to: "", breaks: "C20" },
  { file: EFFECTS, name: "C: the applier falls through and calls a working spell broken",
    from: `        case "antimagic":
          break;`, to: "", breaks: "C21" },
  { file: EMANEFF, name: "C: a field with no bonus rows places no marker at all",
    // RE-ANCHORED 3.612.0: the guard gained a held bonus (Inspire Heroics).
    from: `  if (!changes.length && !defenceDC.length && !opposedAttack.length && !antimagic && !held && !damageHeal) return null;`,
    to: "  if (!changes.length && !defenceDC.length && !opposedAttack.length && !held && !damageHeal) return null;",
    breaks: "C22" },
  { file: EMANEFF, name: "C: the marker is born holding somebody else's suppression list",
    from: `        ...(antimagic ? { [ANTIMAGIC_FLAG]: { label: antimagic.label, suppressed: [] } } : {}),`,
    to: "        ...(antimagic ? { [ANTIMAGIC_FLAG]: { label: antimagic.label } } : {}),",
    breaks: "C23" },
  { file: EMANEFF, name: "C: nothing is written onto the marker, so nothing is ever restored",
    from: `    await created.setFlag(SYSTEM_ID, ANTIMAGIC_FLAG, {`,
    to: "    if (false) await created.setFlag(SYSTEM_ID, ANTIMAGIC_FLAG, {", breaks: "C25" },
  // ORDER, NOT PRESENCE. Deleting the marker first destroys the only
  // record of what has to come back — and does it silently.
  { file: EMANEFF, name: "C: removal deletes before it restores",
    from: `  await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  if (lifted) {`,
    to: `  if (lifted) {`, breaks: "C26" },
  { file: EMANEFF, name: "C: an effect that expired inside the field is updated anyway",
    from: `    const present = suppressed.filter((id) => actor.effects?.get?.(id));`,
    to: "    const present = suppressed;", breaks: "C27" },
  { file: EMANEFF, name: "C: two return shapes come back again",
    from: `  if (held) return { effect: null, line: "" };`, to: "  if (held) return null;",
    breaks: "C28" },
  { file: EMANWF, name: "C: the field closes over somebody and the card says nothing",
    from: `      if (applied?.line) {`, to: "      if (false) {", breaks: "C29" },
  // THE DEFECT THE LIVE DRIVE FOUND, PUT BACK. This is exactly the state
  // the release shipped in until it was driven: field up, card written,
  // nothing suppressed until the next footstep.
  { file: EMANWF, name: "C THE LIVE DEFECT: nothing is suppressed until somebody moves",
    from: `    const record = runningEmanations().find((r) => r.entry.id === castId);
    if (record) await refreshEmanation(record);`,
    to: "", breaks: "C30" },
  { file: EMANWF, name: "C: the cast reconciles BEFORE it adopts, so the adopted are swept as newcomers",
    from: `    await adoptCastEffects(castId);`,
    to: "", breaks: "C30b" },
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const files = Array.from(new Set(MUTATIONS.map((m) => m.file)));
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

if (!run()) {
  console.error("mutate-chapter10-251-260: the check FAILS before any mutation.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

process.stdout.write(survived + unmatched
  ? `\nmutate-chapter10-251-260: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-251-260: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
