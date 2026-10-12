#!/usr/bin/env node
/**
 * verify-one-clock — an effect this system expires has ONE clock.
 *
 * NEW at 3.476.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * REPORTED FROM A LIVE SESSION, 2 September 2026.
 *
 * Protective Ward ended and the console filled with:
 *
 *   "A parent Document provided to the database operation must be a
 *    Document instance"
 *   "undefined id [...] does not exist in the EmbeddedCollection
 *    collection."
 *
 * REPRODUCED 3 September by advancing the world clock past a spell's
 * duration in Graham's own world: both errors, every time, while the
 * effect itself expired correctly.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO CLOCKS ON ONE EFFECT.
 *
 * `spellExpiryTiming` set OUR end — `spellEffectEnd` / `expiresRound`,
 * swept by `expireSpellEffects`, which DELETES the effect and reports it
 * on a card — and ALSO handed Foundry a `duration`, which its own
 * `ActiveEffectRegistry` sweeps and tries to UPDATE. Ours deleted first
 * and Foundry's batch then updated a document that was gone.
 *
 * THE FAILING ID WAS NOT THE WARD'S. Worth recording: the effect named
 * in the error had a different id from the ward being watched, because
 * one world-time advance expires everything due at once. The bug was
 * never about one spell — it was about every effect with two clocks.
 *
 * ─────────────────────────────────────────────────────────────────────
 * C1 IS THE FIX. An effect we expire gets no Foundry duration.
 *
 * L1 IS WHY THAT COSTS NOTHING. The sheets used to read Foundry's
 * `duration.label`; they now read the clock that actually governs the
 * effect. The old label was a second clock that agreed by construction —
 * losing it loses no information, and keeping it was the bug.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const effects = strip(read("module", "magic", "spell-effects.mjs"));

/* ── C. ONE CLOCK ────────────────────────────────────────────────── */
/*
 * C1 IS THE WHOLE FIX, and it is asserted on the one function that
 * decides both clocks — every one of the thirty-odd effect kinds reads
 * its answer, so fixing it there fixes all of them at once.
 */
ok("C1 AN EFFECT WE EXPIRE GETS NO FOUNDRY DURATION",
  effects.includes("if (out.spellEffect) out.foundryDuration = undefined;"),
  "ours deletes it and Foundry's registry then updates what is gone");
/*
 * C2 — AN EFFECT WITH NO CLOCK OF OURS KEEPS FOUNDRY'S. A duration
 * nobody sweeps is display-only and cannot race anything, so removing it
 * would cost a label for no benefit.
 */
ok("C2 and one we do not expire keeps it",
  effects.includes("foundryDuration: foundryDuration(parsed)"),
  "a duration nobody sweeps cannot race anything");
// THE ORDER MATTERS: the clear must come AFTER spellEffect is decided,
// or it would clear a flag that was about to be set.
ok("C3 the clock is cleared only once ours is known", (() => {
  const at = effects.indexOf("function spellExpiryTiming");
  if (at === -1) return false;
  const body = effects.slice(at, effects.indexOf("\n}", at));
  return body.indexOf("out.spellEffect = true") < body.indexOf("if (out.spellEffect) out.foundryDuration = undefined;");
})(), "clearing it first would clear a flag not yet set");

/* ── S. OUR SWEEP IS STILL THE ONE THAT ACTS ─────────────────────── */
const flow = strip(read("module", "combat", "effect-application-workflow.mjs"));
/*
 * S1 READS `expireSpellEffects`'s BODY ALONE. A whole-file `includes`
 * was satisfied by a SECOND `await effect.delete()` elsewhere in the
 * file, so the mutation that stopped the sweep deleting anything
 * SURVIVED — the same shape as the ambiguous anchor its mutation needed
 * fixing for. Two writers of one call, and the check was looking at the
 * wrong one.
 */
ok("S1 our sweep still deletes the effect", (() => {
  const at = flow.indexOf("export async function expireSpellEffects");
  if (at === -1) return false;
  const body = flow.slice(at, flow.indexOf("\n}", at));
  // THE GUARD IS PART OF THE LINE, not decoration around it. A bare
  // `includes("await effect.delete();")` is still satisfied when the
  // call is sitting under `if (false)`, which is precisely the mutation
  // this check exists to fail — a released Delayed Respite deletes
  // itself first (3.493.0), so the sweep's delete is conditional now
  // and the condition is what has to hold.
  // 3.614.1: through `endEffect`, so a stasis lets its clocks go first.
  return body.includes("if (actor.effects.get(effect.id)) await endEffect(effect, actor);");
})(), "the sweep is what actually removes a spell effect");
ok("S2 and still reports what ended", flow.includes("expired.push("));
ok("S3 reading our own end time", flow.includes("const end = effect.getFlag(SYSTEM_ID, SPELL_END_FLAG);"));

/* ── L. THE LABEL DID NOT GO WITH IT ─────────────────────────────── */
// NOT EXPORTED — only the label reads it, and the uncalled-export
// ratchet is right that a rule nobody outside calls should not
// advertise itself.
ok("L1 there is a remaining-time reader", effects.includes("function spellEffectRemaining(effect, worldTime = null) {"));
ok("L2 and a label built from it", effects.includes("export function spellEffectDurationLabel(effect, worldTime = null) {"));
/*
 * L3 — IT FALLS BACK. Effects this system does not expire still carry a
 * Foundry duration, and its label is still the right thing to print for
 * them.
 */
ok("L3 FALLING BACK TO FOUNDRY'S LABEL where we keep no clock",
  effects.includes('if (left === null) return effect?.duration?.label ?? "Ongoing";'),
  "an effect with no clock of ours still has Foundry's");
const sheet = strip(read("module", "sheets", "actor-sheet.mjs"));
const effSheet = strip(read("module", "sheets", "effect-sheet.mjs"));
ok("L4 the actor sheet reads it", sheet.includes("duration: spellEffectDurationLabel(effect),"));
ok("L5 and the effect sheet too", effSheet.includes("context.durationSummary = spellEffectDurationLabel(effect);"));
// NEITHER SHEET STILL READS THE RAW FOUNDRY LABEL, which would show
// "Ongoing" for every effect whose duration we just stopped setting.
ok("L6 AND NEITHER READS THE RAW FOUNDRY LABEL ANY MORE",
  !sheet.includes('effect.duration?.label ?? "Ongoing"')
  && !effSheet.includes('effect.duration?.label ?? "Ongoing"'),
  "it would now read \"Ongoing\" for every spell effect");

if (failures.length) {
  process.stderr.write(`verify-one-clock: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-one-clock: OK — ${checks} checks. One clock per effect, and the sheets read the one that governs it.\n`);
