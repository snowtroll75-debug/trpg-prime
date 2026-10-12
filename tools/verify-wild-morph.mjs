#!/usr/bin/env node
/**
 * verify-wild-morph — Wild Morph.
 *
 * NEW at 3.493.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT SHIPPED WITH NOTHING AT ALL — no effects, no working warps.
 *
 *   "You draw upon your Wildshape power, altering a portion of your
 *    physical form. You gain a single natural attack form from one of
 *    your Studied Targets."
 *      +2 PP: an additional natural attack form (max 3)
 *      +2 PP: instead a movement type from one of your Studied Targets
 *      +4 PP: instead a special ability from one of your Studied Targets
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION I IS THE ONE THAT MATTERS, and it is about a MINUS FOUR.
 *
 * A created natural weapon with no `category` would be the only natural
 * attack in the game carrying an unfamiliar-weapon penalty, because the
 * proficiency engine reads the category and every character is proficient
 * with unarmed attacks. Hybrid Transformation's Bite learnt this already;
 * this check is what stops it being learnt twice.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION C IS THE OTHER: A GROWN CLAW MUST NOT OUTLIVE THE SPELL, and
 * Bless Water's Holy Water must not die with one. The item declares which
 * it is; the cleanup obeys the declaration rather than the stamp.
 *
 * SECTION G ASSERTS THE TWO INERT WARPS ARE INERT ON PURPOSE. "Instead a
 * movement type" and "instead a special ability" replace the attack with
 * something this system has no general shape for, so they are printed on
 * the card and adjudicated. That is a decision, not an oversight, and a
 * check that does not say so invites somebody to "fix" it with a guess.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  MAX_MORPH_FORMS, normaliseWildMorph, morphAttackData,
  wildMorphLine, noStudiedTargetLine, wildMorphRemainderLine
} from "../module/magic/wild-morph.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
/**
 * The body of one `case` in the effect switch.
 *
 * SLICED, NOT SEARCHED WHOLE-FILE. `if (!source) {` appears twice in
 * spell-effects.mjs — `mutate-wild-morph` said so, by reporting two
 * anchors — and a check that matched the other one would have passed
 * while this spell was silent.
 */
function caseBody(source, kind) {
  const at = source.indexOf(`        case "${kind}": {`);
  if (at < 0) return "";
  const end = source.indexOf("\n        case \"", at + 20);
  return source.slice(at, end > 0 ? end : source.length);
}

/** The body of one function, so a check cannot match text from elsewhere. */
function bodyOf(source, signature) {
  const at = source.indexOf(signature);
  if (at < 0) return "";
  const next = source.indexOf("\nexport ", at + signature.length);
  const end = source.indexOf("\nasync function", at + signature.length);
  const stop = [next, end].filter((n) => n > 0).sort((a, b) => a - b)[0] ?? source.length;
  return source.slice(at, stop);
}

/* ================================================================== *
 * N. THE DECLARED ROW
 * ================================================================== */

const row = normaliseWildMorph({ kind: "wildMorph", label: "Wild Morph", forms: 1 });
ok("N1 the row reads back whole", row.label === "Wild Morph" && row.forms === 1);
ok("N2 a malformed row is refused",
  normaliseWildMorph(null) === null && normaliseWildMorph({ kind: "note" }) === null);
equal("N3 the printed cap", MAX_MORPH_FORMS, 3);
equal("N4 THE CAP HOLDS however the warp is stacked",
  normaliseWildMorph({ kind: "wildMorph", forms: 9 }).forms, 3,
  "\"max 3\" is the spell's own sentence");
equal("N5 and a missing count is one form, not none",
  normaliseWildMorph({ kind: "wildMorph" }).forms, 1);
equal("N5b as is a nonsense one",
  normaliseWildMorph({ kind: "wildMorph", forms: -4 }).forms, 1);

/* ================================================================== *
 * I. THE ITEM THE SPELL GROWS
 * ================================================================== */

const item = morphAttackData(
  { name: "Claw", damage: "1d6", damageType: "slashing" }, "Dire Wolf", "cast-1");

equal("I1 it is a weapon", item.type, "weapon");
equal("I2 with the damage the player named", item.system.damage, "1d6");
equal("I2b and its type", item.system.damageType, "slashing");
ok("I3 natural and already equipped",
  item.system.natural === true && item.system.equipped === true,
  "a grown claw the character has to remember to equip is a claw that misses its round");

// I4 THE MINUS FOUR. See the header: the proficiency engine reads the
// category, and a natural attack with none is the only one in the game
// that would be treated as an unfamiliar weapon.
equal("I4 THE CATEGORY IS UNARMED", item.system.category, "Unarmed");

// I5 THE DECLARATION THAT MAKES IT TEMPORARY.
equal("I5 it says it ends with the spell",
  item.flags["trg-prime"].endsWithSpell, true);
equal("I5b and which cast it belongs to", item.flags["trg-prime"].castId, "cast-1");
ok("I6 it names where the form came from",
  item.system.description.includes("Dire Wolf"),
  "a claw on a sheet with no provenance is one nobody can adjudicate");

// I7 AN UNNAMED FORM IS STILL AN ITEM, not an item called "".
const bare = morphAttackData({}, "", "cast-2");
ok("I7 a bare form still has a name, dice and a type",
  bare.name === "Natural Attack" && bare.system.damage === "1d4"
  && bare.system.damageType === "slashing",
  "an item called \"\" rolling \"\" is worse than a default nobody asked for");

/* ================================================================== *
 * W. IS IT REACHED
 * ================================================================== */

const seFile = read("module", "magic", "spell-effects.mjs");
const se = caseBody(seFile, "wildMorph");

ok("W1 the effect kind is handled", se.length > 0);
ok("W2 the Studied Target is asked for first",
  se.includes("const source = await promptMorphSource(target, spell.name);"),
  "the ruling is: pick the target, then name the form");
ok("W2b and the form second, with the source in hand",
  se.includes("const form = await promptMorphForm(spell.name, source.name, source.actor);"));

// W3 THE ITEM IS ACTUALLY CREATED. A prompt that asked two questions and
// wrote nothing to the sheet is the shape this whole tier exists against.
ok("W3 THE ATTACK IS PUT ON THE SHEET",
  // 3.622.0: each grown attack is marked magical first (block 39's R11).
  se.includes('await target.createEmbeddedDocuments("Item",')
  && se.includes("            grown.map((f) => {\n              const data = morphAttackData(f, source.name, castId);"),
  "\"grant a real one\" is the ruling, in Graham's words");

// W4 AND AN EFFECT CARRIES THE CLOCK. The items have no duration of
// their own; deleting the effect is what removes them.
ok("W4 an effect carries the duration", se.includes("await createEffectsOn(target, [mData]);"));

ok("W5 the warp is folded into the count",
  se.includes("forms: Number(effect.forms ?? 1) + Number(warpMods?.morphForms ?? 0)"),
  "it carried mods that bought nothing");

// W6 REFUSED OUT LOUD, IN BOTH DIRECTIONS. Anchored on the branches
// rather than on the sentences they print: a sentence still appears in
// the file when the `if` guarding it can no longer be true.
ok("W6 no Studied Target is said out loud",
  se.includes("if (!source) {") && se.includes("noStudiedTargetLine(spell.name)"),
  "a character who has studied nobody can fix that, and the line says how");
ok("W6b and no form described is a different sentence",
  se.includes("if (!grown.length) {")
  && se.includes("No form was described for ${spell.name} — nothing was grown."));

/* ================================================================== *
 * C. IT DOES NOT OUTLIVE THE SPELL — and neither does Holy Water die
 * ================================================================== */

const eaw = read("module", "combat", "effect-application-workflow.mjs");
const cleanup = bodyOf(eaw, "async function removeSpellItemsByCastId");

ok("C1 the cleanup exists", cleanup.length > 0);
// C2 DECLARED BY THE ITEM, NOT INFERRED FROM THE STAMP. Bless Water's
// Holy Water carries a castId too, and the caster keeps the flask.
ok("C2 IT REMOVES ONLY WHAT SAYS IT ENDS WITH THE SPELL",
  cleanup.includes('i.getFlag?.(SYSTEM_ID, "endsWithSpell") === true'),
  "a castId alone would take Bless Water's flask off the sheet");
ok("C2b and only from the cast that made it",
  cleanup.includes("i.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) === castId"));

// C3 BOTH ENDINGS. A form that survived one route and not the other is
// a form whose lifetime depends on how the spell happened to finish.
const expiry = bodyOf(eaw, "export async function expireSpellEffects");
const dismiss = bodyOf(eaw, "export async function removeEffectsByCastId");
ok("C3 the world clock removes it", expiry.includes("removeSpellItemsByCastId(actor, castId)"),
  "the ordinary way a minute-long spell ends");
ok("C3b and so does a dismissal", dismiss.includes("removeSpellItemsByCastId(actor, castId)"));
// C3c THE CAST IS READ BEFORE THE EFFECT IS DELETED. Afterwards there is
// nothing left to ask which cast the form belonged to.
// BOTH HALVES ASSERTED PRESENT FIRST. An ordering check alone is
// vacuously true when the first string is missing (indexOf returns −1,
// which is less than everything) — `mutate-wild-morph` proved exactly
// that by deleting the read and surviving.
const castRead = expiry.indexOf("const castId = effect.getFlag?.(SYSTEM_ID, CAST_ID_FLAG)");
// 3.614.1: the sweep deletes through `endEffect`, so a stasis lets its clocks go first.
const effectGone = expiry.indexOf("await endEffect(effect, actor);");
ok("C3c the cast is read before the effect is deleted",
  castRead > 0 && effectGone > 0 && castRead < effectGone,
  "a deleted effect cannot be asked which cast it was");

/* ================================================================== *
 * R. THE CARD
 * ================================================================== */

ok("R1 the card names the form and the source",
  wildMorphLine("Merrick", ["Claw"], "Dire Wolf").includes("Claw")
  && wildMorphLine("Merrick", ["Claw"], "Dire Wolf").includes("Dire Wolf"));
ok("R1b and both forms when the warp bought two",
  wildMorphLine("Merrick", ["Claw", "Bite"], "Dire Wolf").includes("and"));
ok("R2 nothing studied says how to fix it",
  /Study Target/i.test(noStudiedTargetLine("Wild Morph")));
// R3 THE WARPS THIS SPELL DOES NOT AUTOMATE, printed every time — see
// section G for why they are not built.
ok("R3 the unautomated warps are named on every cast",
  /movement type/i.test(wildMorphRemainderLine())
  && /special ability/i.test(wildMorphRemainderLine()));
ok("R3b and so is the wildshape duration clause",
  /Wildshape/i.test(wildMorphRemainderLine()),
  "the clause that changes the duration is the one a table would otherwise miss");

/* ================================================================== *
 * G. THE SPELL AS SHIPPED
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let morph = null;
const declarers = [];
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.name === "Wild Morph") morph = value;
    if ((value?.system?.effects ?? []).some((e) => e?.kind === "wildMorph")) {
      declarers.push({ name: value.name, pp: Number(value.system.ppCost) });
    }
  }
} finally {
  await db.close().catch(() => {});
}

const gRow = (morph?.system?.effects ?? []).find((e) => e.kind === "wildMorph");
ok("G1 Wild Morph declares the morph", Boolean(gRow));
equal("G2 targeting the caster", gRow?.target, "self",
  "you alter a portion of YOUR physical form");
equal("G2b one form as printed", Number(gRow?.forms ?? 0), 1);
ok("G3 it carried nothing before this release",
  (morph?.system?.effects ?? []).length === 1,
  "the spell shipped with no effects at all");

const warps = morph?.system?.warps ?? [];
ok("G4 the extra-form warp is wired",
  warps.some((w) => Number(w.ppCost) === 2 && Number(w.mods?.morphForms) === 1));

// G5 THE TWO "INSTEAD" WARPS ARE INERT ON PURPOSE. They replace the
// attack with a movement type or a special ability — neither of which
// this system has a general shape for — so they are printed on the card
// and adjudicated. Asserted so that a future inert-warp sweep meets a
// decision rather than what looks like an oversight.
const instead = warps.filter((w) => /^\s*(You\s+)?instead|instead gain/i.test(String(w.text ?? "")));
equal("G5 two warps replace the attack form", instead.length, 2);
// BUILT AT 3.614.0 (Graham's R15): the movement type is a speed the creature
// gains from the studied target; the special ability is still the GM's, and
// its warp now carries a state so the card says it was bought rather than
// selling nothing in silence.
ok("G5b the movement is built and the special ability is said",
  instead.some((w) => w.mods?.morphMovement === true) && instead.some((w) => w.mods?.morphAbility === true),
  "neither may go back to an empty mods object, which is a warp that buys nothing");

// G6 THE RATCHET. One spell grows attack forms today.
ok("G6 exactly one spell declares a wild morph",
  declarers.length === 1 && declarers[0].pp === 1,
  `declarers: ${JSON.stringify(declarers)}`);

if (failures.length) {
  process.stderr.write(`verify-wild-morph: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-wild-morph: OK — ${checks} checks. A real attack form on the sheet, proficient, `
  + `capped at ${MAX_MORPH_FORMS}, and gone when the spell is.\n`);
