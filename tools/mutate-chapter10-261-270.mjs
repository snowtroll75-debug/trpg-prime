#!/usr/bin/env node
/**
 * mutate-chapter10-261-270 — can the pages 261-270 checks fail?
 *
 * NEW at 3.587.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MUTATIONS THIS BLOCK NEEDS ARE THE ONES THAT PUT BACK A SILENCE
 * AND THE ONES THAT PUT BACK A WRONG PATH, because those are the two
 * things the live drive found:
 *
 *   Death Knell read `system.details.level`, which does not exist here.
 *   Every creature returned undefined, so the spell healed nothing and
 *   blamed the bestiary.
 *
 *   The check dialog rendered a swing as "0 —": reachable, ticked-able,
 *   and worth precisely nothing when ticked.
 *
 *   `actor.effects.get(id)` misses an item-transferred effect, so a
 *   one-shot on one would be used and never spent.
 *
 * Each is a mutation below, put back one line at a time. Several more
 * attack the boundary between "it exists" and "it does anything",
 * because that boundary is where this project's last three defects
 * lived.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const PENDING = at("pending-modifiers.mjs");
const SPELLPENDING = at("magic", "spell-pending.mjs");
const KNELL = at("magic", "death-knell.mjs");
const GRANT = at("magic", "granted-ability.mjs");
const SUPPRESS = at("conditions", "suppression.mjs");
const CONDITIONALS = at("conditionals.mjs");
const DIALOG = at("apps", "check-dialog.mjs");
const CHECK = at("dice", "check.mjs");
const COMBAT = at("documents", "combat.mjs");
const EFFECTS = at("magic", "spell-effects.mjs");
const KINDS = at("magic", "effect-kinds.mjs");
const LADDER = at("magic", "save-ladder.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-chapter10-261-270.mjs");

const MUTATIONS = [
  /* ── C: Death Knell, and the path the live drive found ────────── */
  { file: EFFECTS, name: "C THE LIVE DEFECT: the level path goes back to the one that does not exist",
    from: `            targetLevel: target.system?.identity?.level ?? null,`,
    to: `            targetLevel: target.system?.details?.level ?? null,`, breaks: "C1" },
  { file: KNELL, name: "C: Success heals per level instead of per two levels",
    from: `const HEAL_PER_LEVEL = Object.freeze({ dying: 0.5, kill: 1 });`,
    to: `const HEAL_PER_LEVEL = Object.freeze({ dying: 1, kill: 1 });`, breaks: "C2" },
  { file: KNELL, name: "C: the killing rung stops at the death state instead of one past it",
    from: `    return { refusal: null, dyingTo: state + 1, kills: true, healing, levelUnknown };`,
    to: `    return { refusal: null, dyingTo: state, kills: true, healing, levelUnknown };`, breaks: "C3" },
  { file: KNELL, name: "C: a target without Dying is killed anyway",
    from: `  if (!hasDying) {`, to: `  if (false) {`, breaks: "C4" },
  { file: KNELL, name: "C: an unrecorded level becomes level zero",
    from: `  const levelUnknown = targetLevel === null || targetLevel === undefined || !Number.isFinite(rawLevel);`,
    to: `  const levelUnknown = false;`, breaks: "C5" },
  { file: KNELL, name: "C: the card stops telling the two apart",
    from: `  const gain = outcome.levelUnknown`, to: `  const gain = false`, breaks: "C6" },
  { file: KNELL, name: "C: a rung the spell does not have is honoured",
    from: `  if (rate === undefined) {`, to: `  if (false) {`, breaks: "C7" },
  { file: EFFECTS, name: "C: Dying is set before the hit points are zeroed",
    from: `          if (outcome.kills) await target.update({ "system.resources.hp.value": 0 });
          await target.toggleStatusEffect("dying", { value: outcome.dyingTo });`,
    to: `          await target.toggleStatusEffect("dying", { value: outcome.dyingTo });
          if (outcome.kills) await target.update({ "system.resources.hp.value": 0 });`,
    breaks: "C9" },
  { file: EFFECTS, name: "C: the caster's hit points stop moving",
    from: `            if (gained > 0) await caster.update({ "system.resources.hp.value": kbefore + gained });`,
    to: `            if (false) await caster.update({ "system.resources.hp.value": kbefore + gained });`,
    breaks: "B5" },

  /* ── D: a rung made of advantage ──────────────────────────────── */
  { file: PENDING, name: "D THE LIVE DEFECT: a swing prints a bare number again",
    from: `      lead: swing
        ? kind === PENDING_KINDS.ADVANTAGE ? "Advantage" : "Disadvantage"`,
    to: `      lead: swing
        ? ""`, breaks: "D4" },
  { file: PENDING, name: "D: a stored entry with no kind is refused instead of read as a modifier",
    from: `  return PENDING_KIND_VALUES.includes(kind) ? kind : PENDING_KINDS.MODIFIER;`,
    to: `  return PENDING_KIND_VALUES.includes(kind) ? kind : "advantage";`, breaks: "D2" },
  { file: PENDING, name: "D: the modifier row loses its type",
    from: `        : \`\${entry.value > 0 ? \`+\${entry.value}\` : String(entry.value)} \${entry.type}\`.trim(),`,
    to: `        : \`\${entry.value > 0 ? \`+\${entry.value}\` : String(entry.value)}\`.trim(),`, breaks: "D5" },
  { file: PENDING, name: "D: every pending row arrives pre-ticked",
    from: `      auto: Boolean(entry.auto),`, to: `      auto: true,`, breaks: "D7" },
  { file: PENDING, name: "D THE SILENT SHAPE: a ticked swing is pushed as a modifier of zero",
    from: `    if (kind === PENDING_KINDS.MODIFIER) {
      modifiers.push({ label: row.label, value: row.value, type: row.type });
    } else {
      kinds.push(kind);
    }`,
    to: `    modifiers.push({ label: row.label, value: row.value, type: row.type });
    if (kind !== PENDING_KINDS.MODIFIER) { /* nothing */ }`, breaks: "D8" },
  { file: PENDING, name: "D: everything ticked is spent, one-shot or not",
    from: `    if (row.oneShot) consume.push(row.id);`, to: `    consume.push(row.id);`, breaks: "D10" },
  { file: PENDING, name: "D: \"before the end of its next turn\" stops depending on whose turn it is",
    from: `  return isOwnTurn ? 2 : 1;`, to: `  return 1;`, breaks: "D16" },
  { file: SPELLPENDING, name: "D: a span is honoured whether or not the row asks for one",
    from: `  if (lower(effect.span) === lower(PENDING_SPAN_NEXT_TURN)) {`,
    to: `  if (true) {`, breaks: "D17" },
  { file: SPELLPENDING, name: "D: an unclockable span is given a clock anyway",
    from: `    if (Number.isFinite(turns) && turns > 0) grant.turns = turns;`,
    to: `    grant.turns = turns;`, breaks: "D18" },
  { file: SPELLPENDING, name: "D: a row with no words is offered as an unlabelled tick box",
    from: `  if (!scope) return null;`, to: `  if (false) return null;`, breaks: "D19" },
  { file: SPELLPENDING, name: "D: a modifier rung with no number is honoured",
    from: `  } else if (!value) {`, to: `  } else if (false) {`, breaks: "D20" },
  { file: SPELLPENDING, name: "D: a swing that is not one of the two is honoured",
    from: `    if (!SWINGS.includes(swing)) return null;`, to: `    if (false) return null;`, breaks: "D21" },
  { file: SPELLPENDING, name: "D: the card stops saying a clock is running",
    from: `  const clock = grant.turns ? " It is offered in the roll dialog until then." : "";`,
    to: `  const clock = "";`, breaks: "D22" },
  { file: DIALOG, name: "D: pending kinds replace the conditional ones instead of combining",
    from: `    bias: resolveBias(result.bias ?? BIAS.NORMAL, [...conditionalKinds, ...pendingKinds], BIAS),`,
    to: `    bias: resolveBias(result.bias ?? BIAS.NORMAL, pendingKinds, BIAS),`, breaks: "D12" },
  { file: DIALOG, name: "D: the dialog stops pre-ticking an auto row",
    from: `<input type="checkbox" name="pending" value="\${entry.id}"\${entry.auto && (!entry.checkTypes?.length || entry.checkTypes.includes(checkType)) ? " checked" : ""}>`,
    to: `<input type="checkbox" name="pending" value="\${entry.id}">`, breaks: "D14" },
  { file: COMBAT, name: "D: nothing sweeps a pending entry whose roll never came",
    from: `    const lapsed = await expirePendingModifiers(actor);`,
    to: `    const lapsed = [];`, breaks: "D23" },

  /* ── E/F: what may be spent ───────────────────────────────────── */
  { file: CONDITIONALS, name: "E: oneShot stops being carried through normalisation",
    from: `    oneShot: Boolean(raw.oneShot),`, to: `    oneShot: false,`, breaks: "E4" },
  { file: CONDITIONALS, name: "E: every conditional in the pack becomes spendable",
    from: `    oneShot: Boolean(raw.oneShot),`, to: `    oneShot: true,`, breaks: "E5" },
  { file: CONDITIONALS, name: "F THE LIVE DEFECT: a transferred effect is treated as the actor's own",
    from: `      const owned = kind === "effect" && document?.parent?.documentName === "Item";`,
    to: `      const owned = false;`, breaks: "F1" },
  { file: CONDITIONALS, name: "F: an item's conditional becomes spendable",
    from: `    if (row.sourceKind !== "effect") continue;`, to: `    if (false) continue;`, breaks: "F3" },
  { file: CONDITIONALS, name: "F: a row that is not one-shot is spent anyway",
    from: `    if (!row?.oneShot) continue;`, to: `    if (false) continue;`, breaks: "F5" },
  { file: CONDITIONALS, name: "F: one source is spent twice",
    from: `    if (!id || seen.has(id)) continue;`, to: `    if (!id) continue;`, breaks: "F6" },
  { file: DIALOG, name: "F: a spend that could not land goes back to being silent",
    from: `      else ui.notifications?.warn?.(
        \`\${label || "A one-shot bonus"} was used but could not be cleared — remove it by hand.\`);`,
    to: `      else { /* nothing */ }`, breaks: "F7" },
  { file: CHECK, name: "F: the dialog-less path stops spending one-shots",
    from: `        for (const { sourceId, label } of applied.spent ?? []) {`,
    to: `        for (const { sourceId, label } of []) {`, breaks: "F9" },
  { file: CHECK, name: "F: the dialog-less path applies EVERY pending entry, not only the auto ones",
    from: `      const auto = pendingModifierRows(check.actor).filter((row) => row.auto\n`,
    to: `      const auto = pendingModifierRows(check.actor).filter((row) => true\n`, breaks: "F10" },

  /* ── G: the seven with a rail ─────────────────────────────────── */
  { file: SUPPRESS, name: "G: a complete ignore becomes a large number again",
    from: `  if (raw.all === true) {`, to: `  if (false) {`, breaks: "G5" },
  { file: SUPPRESS, name: "G: a complete ignore subtracts rather than zeroing",
    from: `    if (!Number.isFinite(amount)) { out.set(condition, 0); continue; }`,
    to: `    if (!Number.isFinite(amount)) { continue; }`, breaks: "G6" },
  { file: SUPPRESS, name: "G: a warp cap clamps a complete ignore down to a number",
    from: `  if (spec.all) return { ...spec };`, to: `  if (false) return { ...spec };`, breaks: "G7" },
  { file: SUPPRESS, name: "G: the card prints Infinity at the table",
    from: `  if (spec.all) return \`ignores <strong>\${spec.condition}</strong> entirely\`;`,
    to: `  if (false) return "";`, breaks: "G8" },
  { file: SUPPRESS, name: "G: every option in a choice is given the same amount",
    from: `    const amount = Math.trunc(Number(entry?.amount));`,
    to: `    const amount = 10;`, breaks: "G10" },
  { file: SUPPRESS, name: "G: a cancelled choice falls back to the first option",
    from: `  const option = choice.options.find((o) => o.condition === wanted);
  if (!option) return null;`,
    to: `  const option = choice.options.find((o) => o.condition === wanted) ?? choice.options[0];
  if (!option) return null;`, breaks: "G12" },
  { file: EFFECTS, name: "G: the choice is asked AFTER the warp, so a bought bump raises nothing",
    from: `          const suppressChoice = normaliseSuppressionChoice(effect);`,
    to: `          const suppressChoice = null; const unusedChoice = normaliseSuppressionChoice(effect);`,
    breaks: "G13" },
  { file: GRANT, name: "G: a grant row with no uuid is honoured",
    from: `  if (!uuid) return null;`, to: `  if (false) return null;`, breaks: "G32" },
  { file: GRANT, name: "G: a creature that already has the ability is given a second copy",
    from: `  return (items ?? []).some((item) => text(item?.name).toLowerCase() === wanted);`,
    to: `  return false;`, breaks: "G33" },
  { file: GRANT, name: "G: a missing compendium entry passes silently",
    from: `    return \`<em>\${spellName} names an ability the pack does not hold — nothing applied.</em>\`;`,
    to: `    return "";`, breaks: "G34" },
  { file: EFFECTS, name: "G: the granted ability loses its teardown and becomes permanent",
    from: `          const gaFlags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: [madeAbility.id] } };`,
    to: `          const gaFlags = { [SYSTEM_ID]: { spellBuff: true } };`, breaks: "B7" },

  { file: LADDER, name: "A: the shared rung parser stops refusing unparseable dice",
    from: `    if (dice && !/^\\d+(d\\d+)?(\\s*\\+\\s*\\d+)?$/i.test(dice)) return null;`,
    to: `    if (false) return null;`, breaks: "A2b" },

  /* ── B: reachability, the 3.586.3 question ────────────────────── */
  { file: KINDS, name: "B: a new kind is authored but never declared handled",
    from: `  "grantAbility",`, to: ``, breaks: "B1" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

const run = () => {
  try {
    execFileSync(process.execPath, [VERIFY], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

if (!run()) {
  console.error("verify-chapter10-261-270 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-chapter10-261-270: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-261-270: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
