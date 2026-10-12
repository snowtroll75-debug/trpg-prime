#!/usr/bin/env node
/**
 * mutate-pending-cast — can the pending-cast checks fail?
 *
 * NEW at 3.584.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECT FIRST, and it is the absence of a whole moment: a
 * cast resolved inside one dialog flow, so there was no window in which
 * damage could arrive and page 238's rule could never fire. The first
 * mutations below close the window again in each of the ways it could be
 * closed — never opened, opened too late to matter, or opened and then
 * ignored.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const PEND = at("magic", "pending-cast.mjs");
const PENDWF = at("magic", "pending-cast-workflow.mjs");
const CASTWF = at("magic", "cast-workflow.mjs");
const ATTACK = at("combat", "attack-workflow.mjs");
const SCRIPT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const TURN = at("documents", "combat.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-pending-cast.mjs");

const MUTATIONS = [
  { file: PENDWF, name: "P THE GAP THE LIVE DRIVE FOUND: a paid-up turn goes back to offering nothing",
    from: `  if (extraApRemaining(record.apOwed, record.apPaid) === 0) {
    return {
      line: castingHeldLine(record.spellName, record),
      buttons: pendingCastButtons(record)
    };
  }`, to: `  if (extraApRemaining(record.apOwed, record.apPaid) === 0) return null;`, breaks: "P11" },
  { file: PENDWF, name: "P: a held turn charges AP it does not owe",
    from: `      line: castingHeldLine(record.spellName, record),`,
    to: `      line: castingHeldLine(record.spellName, record) + String(await payTowards(actor, record)),`,
    breaks: "P11b" },
  { file: PEND, name: "P: the held line stops saying the casting is open",
    from: "  return `<strong>Still holding ${spellName}.</strong>${paidFor} `",
    to: "  return `<strong>${spellName}</strong>${paidFor} `",
    breaks: "P11c" },
  { file: PEND, name: "P: a window that owed nothing claims to be paid in full",
    from: `  const paidFor = apOwed > 0`, to: `  const paidFor = apOwed >= 0`, breaks: "P11e" },
  /* ── P: paying for the time (3.592.0) ─────────────────────────── */
  { file: TURN, name: "P THE ORIGINAL DEFECT: the turn stops paying the window down",
    from: `      const casting = await payPendingCastTurn(actor);`,
    to: `      const casting = null;`, breaks: "P4" },
  { file: TURN, name: "P: the rule is imported and the turn never calls it",
    from: `      const { payPendingCastTurn } = await import("../magic/pending-cast-workflow.mjs");
      const casting = await payPendingCastTurn(actor);`,
    to: `      await import("../magic/pending-cast-workflow.mjs");
      const casting = null;`, breaks: "P4" },
  { file: TURN, name: "P: the progress line is computed and never reaches the card",
    from: `        lines.push(TRGCombat.#chatLine(casting.line));`, to: `        ;`, breaks: "P4c" },
  { file: TURN, name: "P THE SCROLLING BUTTON RETURNS: the card carries the line and not the buttons",
    from: `        lines.push(casting.buttons);`, to: `        ;`, breaks: "P4c" },
  { file: PEND, name: "P: a minute-unit window is charged in AP",
    from: `  if (String(unit ?? "") !== "AP") return 0;`, to: `  ;`, breaks: "P1b" },
  { file: PEND, name: "P: a caster outside combat is charged for turns that never come",
    from: `  if (!inCombat) return 0;`, to: `  ;`, breaks: "P1c" },
  { file: PEND, name: "P THE FULL THREE OR NOTHING: a caster who moved first pays nothing",
    from: `  const have = Math.max(0, Math.trunc(Number(available) || 0));
  return Math.min(have, extraApRemaining(owed, paid));`,
    to: `  const have = Math.max(0, Math.trunc(Number(available) || 0));
  return have >= 3 ? Math.min(3, extraApRemaining(owed, paid)) : 0;`, breaks: "P2b" },
  { file: PEND, name: "P THE OVERPAY: the last instalment takes the whole pool",
    from: `  return Math.min(have, extraApRemaining(owed, paid));`, to: `  return have;`, breaks: "P2c" },
  { file: PEND, name: "P: a part-paid window reads as ready",
    from: `  return extraApRemaining(apOwed, apPaid) === 0;`, to: `  return true;`, breaks: "P3" },
  { file: PEND, name: "P: a window owing nothing is never ready, and the button never appears",
    from: `  return extraApRemaining(apOwed, apPaid) === 0;`, to: `  return apPaid > 0;`, breaks: "P3c" },
  { file: PEND, name: "P SILENT NOTHING: a turn that paid nothing says nothing",
    from: `    : "<strong>no AP</strong> was available this turn";`, to: `    : "";`, breaks: "P10b" },
  { file: PEND, name: "P: the finished line stops naming the spell's own cost",
    // DISAMBIGUATED at 3.592.1: castingHeldLine now uses the same clause,
    // so the anchor carries the line above it that only this one has.
    from: "    + `<em>The spell may now be completed`\n"
      + "    + (own > 0 ? `; its own <strong>${own} AP</strong> is spent when it is.` : \".\")",
    to: "    + `<em>The spell may now be completed`\n    + \".\"",
    breaks: "P10c" },
  { file: PENDWF, name: "P: Complete is offered before the time is paid",
    from: `  const complete = pendingCastReady(record)
    ? `, to: `  const complete = true
    ? `, breaks: "P5" },
  { file: PENDWF, name: "P: the payment writes the pool directly, past the shared-AP rule",
    from: "    await spendActionPoints(actor, payment, `${record.spellName} \u2014 extra casting time`);",
    to: '    await actor.update({ "system.resources.ap.value": available - payment });', breaks: "P6" },
  { file: PENDWF, name: "P: the declaring turn stops counting as the first turn",
    from: `  const firstPayment = await payTowards(actor, record);`,
    to: `  const firstPayment = 0;`, breaks: "P6b" },
  { file: PENDWF, name: "P: progress is never written back, so every turn pays the first instalment",
    from: `  const paid = await payTowards(actor, record);
  await actor.setFlag(SYSTEM_ID, PENDING_CAST_FLAG, record);`,
    to: `  const paid = await payTowards(actor, record);`, breaks: "P6c" },
  { file: PENDWF, name: "P THE GHOST: a flag left by a reload is charged AP",
    from: `  if (!waiting.has(actor.id)) return null;`, to: `  ;`, breaks: "P7" },
  { file: CASTWF, name: "P THE DOUBLE CHARGE: the lump goes back into the final spend",
    from: `  const totalCastAP = totalCastTime(warpedCastAP, { apDelta: mm.apDelta });`,
    to: `  const extraApSpent = 0;
  const totalCastAP = totalCastTime(warpedCastAP, { extraApSpent, apDelta: mm.apDelta });`,
    breaks: "P8" },
  { file: CASTWF, name: "P: the window is no longer told what the spell itself costs",
    from: `      castAP: castTimeApCost(warpedCastAP),`, to: `      castAP: 0,`, breaks: "P9" },
  /* ── A: what an interruption does ──────────────────────────────── */
  { file: PEND, name: "A THE DEFECT: every interruption is a mere failure",
    from: "  return criticalSeverity ? \"fumble\" : \"failure\";", to: "  return \"failure\";", breaks: "A2" },
  { file: PEND, name: "A: every interruption is a fumble",
    from: "  return criticalSeverity ? \"fumble\" : \"failure\";", to: "  return \"fumble\";", breaks: "A1" },
  { file: PEND, name: "A: an empty severity reads as a critical, fumbling ordinary damage",
    from: "  return criticalSeverity ? \"fumble\" : \"failure\";",
    to: "  return criticalSeverity !== null ? \"fumble\" : \"failure\";", breaks: "A3" },

  /* ── B: what counts as one ─────────────────────────────────────── */
  { file: PEND, name: "B THE DEFECT: being healed interrupts the casting",
    from: "  return Number(after) < Number(before);", to: "  return Number(after) !== Number(before);", breaks: "B2" },
  { file: PEND, name: "B: nothing interrupts it at all",
    from: "  return Number(after) < Number(before);", to: "  return false;", breaks: "B1" },
  { file: PEND, name: "B THE OLD TRAP: Number(null) is 0, and 0 is finite",
    from: "  const readable = (v) => v !== null && v !== undefined && v !== \"\" && Number.isFinite(Number(v));",
    to: "  const readable = (v) => Number.isFinite(Number(v));", breaks: "B4b" },

  /* ── C: what the caster is told ────────────────────────────────── */
  { file: PEND, name: "C: minute increments are reported as AP",
    from: "  if (unit === \"minute\") return `${total} minute${total === 1 ? \"\" : \"s\"}`;", to: "", breaks: "C2" },
  { file: PEND, name: "C: an increment's size is ignored, so six AP reads as two",
    from: "  const total = n * each;", to: "  const total = n;", breaks: "C1" },
  { file: PEND, name: "C: the card stops saying nothing is spent yet",
    from: "    + \"Nothing is spent until it is cast (page 237).\";", to: "    + \"(page 237).\";", breaks: "C3" },
  { file: PEND, name: "C: stopping stops saying the bonus is lost",
    from: "  return `<strong>${spellName} — stopped.</strong> The accrued bonus is lost and the `",
    to: "  return `<strong>${spellName} — stopped.</strong> The casting ends and the `", breaks: "C4" },
  { file: PEND, name: "C: an interruption stops naming the degree it forces",
    from: "      + \"The casting check is automatically a <strong>fumble</strong> (page 238).\"",
    to: "      + \"The casting is interrupted (page 238).\"", breaks: "C5" },

  /* ── D: the seam ───────────────────────────────────────────────── */
  { file: CASTWF, name: "D THE DEFECT: the cast never waits, so there is no window at all",
    from: "    const window_ = await awaitPendingCast(actor, {",
    to: "    const window_ = await Promise.resolve({ outcome: \"complete\" }) && Object.assign({ outcome: \"complete\" }, {", breaks: "D1" },
  { file: CASTWF, name: "D THE DEFECT: an ordinary one-action cast waits too",
    from: "if (!isItemCast && !isInnate && !noCheckCantrip && Number(conditions.extraIncrements) > 0 && extraInc) {",
    to: "if (!isItemCast && !isInnate && !noCheckCantrip) {", breaks: "D4" },
  { file: CASTWF, name: "D: an item or innate cast waits for a check it never rolls",
    from: "  if (!isItemCast && !isInnate && !noCheckCantrip && Number(conditions.extraIncrements) > 0 && extraInc) {",
    to: "  if (Number(conditions.extraIncrements) > 0 && extraInc) {", breaks: "D4b" },
  { file: CASTWF, name: "D: stopping charges the spell anyway",
    from: "    if (window_.outcome === \"stopped\") return null;", to: "", breaks: "D5" },
  { file: CASTWF, name: "D THE DEFECT: the window opens and the interruption is ignored",
    from: "    degree = interruptedDegree(forcedInterruption.criticalSeverity);", to: "", breaks: "D6" },
  { file: CASTWF, name: "D: the interruption forces a failure even for a critical",
    from: "    degree = interruptedDegree(forcedInterruption.criticalSeverity);", to: "    degree = \"failure\";", breaks: "D6" },

  /* ── E: the machinery ──────────────────────────────────────────── */
  { file: PENDWF, name: "E: a second casting strands the first's resolver for ever",
    from: "  if (waiting.has(actor.id)) await stopPendingCast(actor, { silent: true });", to: "", breaks: "E3" },
  { file: PENDWF, name: "E: settling forgets to clear the resolver",
    from: "  waiting.delete(actor.id);", to: "", breaks: "E2" },
  { file: PENDWF, name: "E: a stale flag posts an interruption nobody is waiting for",
    from: "  if (!record || !waiting.has(actor.id)) return false;", to: "  if (!record) return false;", breaks: "E4" },
  { file: PENDWF, name: "E: the hook compares the numbers itself instead of asking the rule",
    from: "    if (!hitPointsLost(actor.system?.resources?.hp?.value, after)) return;",
    to: "    if (!(Number(after) < Number(actor.system?.resources?.hp?.value ?? 0))) return;", breaks: "E5" },
  { file: PENDWF, name: "E: a casting silently survives a reload as a dead button",
    from: "  Hooks.once(\"ready\", async () => {", to: "  (() => {})(async () => {", breaks: "E6" },
  { file: PENDWF, name: "E: Spell Concentration is offered without its DC",
    from: "    + `data-dc=\"${record.dc}\" data-severity=\"${criticalSeverity ?? \"\"}\" `",
    to: "    + `data-severity=\"${criticalSeverity ?? \"\"}\" `", breaks: "E7" },
  { file: PENDWF, name: "E: and without the severity, so a critical does not step it up",
    from: "data-severity=\"${criticalSeverity ?? \"\"}\" `", to: "`", breaks: "E8" },

  { file: PENDWF, name: "E THE CAUGHT DEFECT: the card names its caster by bare actor id",
    from: "        return await resolveActorHandle(JSON.parse(button.dataset.handle || \"{}\"));",
    to: "        return game.actors.get(button.dataset.handle);", breaks: "E9b" },
  { file: PENDWF, name: "E: the handle ignores the caster's token, so a wildshape resolves wrong",
    from: "  const handle = actorHandle(actor, actor?.token ?? actor?.getActiveTokens?.()?.[0] ?? null);",
    to: "  const handle = actorHandle(actor);", breaks: "E9c" },

  { file: PENDWF, name: "E THE LIVE DEFECT: the watch reads a vestigial field nothing writes",
    from: "    const after = changed?.system?.resources?.hp?.value;",
    to: "    const after = changed?.system?.hp?.value;", breaks: "E5b" },

  /* ── F: the wiring ─────────────────────────────────────────────── */
  { file: SCRIPT, name: "F THE DEFECT: the damage watch is never registered",
    from: "  registerPendingCastHooks();", to: "", breaks: "F1" },
  { file: SCRIPT, name: "F: the card's buttons are never wired",
    from: "  registerPendingCastCardListeners();", to: "", breaks: "F2" },
  { file: ATTACK, name: "F THE DEFECT: a critical injury does not fumble the casting",
    from: "    await interruptPendingCast(struck, { criticalSeverity: severity ?? \"minor\" });", to: "", breaks: "F3" },
  { file: ATTACK, name: "F: a caster criticalling someone else stops their own casting",
    from: "    const struck = targetActor ?? actor;", to: "    const struck = actor;", breaks: "F3b" },
  { file: CASTWF, name: "F: Spell Concentration goes back to asking for a DC nobody has",
    from: "rollSpellConcentration(actor, { dc: knownDC = null, criticalSeverity: knownSeverity = \"\" } = {}) {",
    to: "rollSpellConcentration(actor) {\n  const knownDC = null; const knownSeverity = \"\";", breaks: "F4" },
  { file: CASTWF, name: "F: the DC field ignores what it was given",
    from: "value=\"${Number(knownDC) || 0}\">", to: "value=\"0\">", breaks: "F4b" },
  { file: CASTWF, name: "F: the severity is not preselected",
    from: "k === String(knownSeverity ?? \"\") ? \" selected\" : \"\"", to: "\"\"", breaks: "F4c" }
];

/* ------------------------------------------------------------------ */

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
  console.error("mutate-pending-cast: the check FAILS before any mutation.");
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
  ? `\nmutate-pending-cast: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-pending-cast: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
