#!/usr/bin/env node
/**
 * verify-damage-scope — a spell whose damage only reaches some creatures.
 *
 * NEW at 3.460.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * QUENCH CARRIED NO DAMAGE AT ALL, AND THAT WAS THE SAFE STATE.
 *
 *   "Non-magical fires within the area are extinguished and FIRE
 *    CREATURES take 4d8 damage (basic Fortitude)."
 *
 * The ladder this system has — an area, a Basic save, a formula scaled
 * by degree — would have burned everyone standing in the mist. The
 * missing piece was never the number; it was the two words in front of
 * it.
 *
 * GRAHAM'S RULING, 1 September 2026: A FIRE CREATURE IS ONE IMMUNE TO
 * FIRE. There is no Fire trait on creatures and no "fire" among the
 * twelve creature types, so he chose the marker already populated on the
 * creatures the spell is about — Fire Dragon, Scaleborn carries
 * `immunities: "fire, sleep, paralyzed"`.
 *
 * SECTION R IS THE ONE THAT MATTERS: the scope has to be asked BEFORE
 * the saves, or the card fills with successful saves by creatures the
 * spell was never going to touch.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { damageScope, inDamageScope, damageScopeLine } from "../module/magic/damage-scope.mjs";

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
function before(hay, a, b) {
  const i = hay.indexOf(a); const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

/* ================================================================== *
 * S. WHAT A SCOPE IS
 * ================================================================== */

ok("S1 a scope is read from the entry", damageScope({ damageScope: "immune:fire" })?.immuneTo === "fire");
ok("S2 no declaration means no scope", damageScope({}) === null && damageScope(null) === null);
// A SCOPE THAT NAMES NOTHING IS NOT A SCOPE. `{immuneTo: ""}` would match
// every creature, which is the opposite of a restriction.
ok("S3 AN EMPTY SCOPE IS REFUSED, NOT DEFAULTED",
  damageScope({ damageScope: "immune:" }) === null,
  "an empty scope would quietly match everyone");
ok("S4 and an unknown form is ignored",
  damageScope({ damageScope: "fire" }) === null
  && damageScope({ damageScope: "type:fire" }) === null,
  "only the declared form is honoured, so a typo cannot silently restrict a spell");

/* ================================================================== *
 * W. WHO IT REACHES
 * ================================================================== */

const scope = damageScope({ damageScope: "immune:fire" });
const fiery = { combat: { immunities: "fire, sleep, paralyzed", weaknesses: "cold" } };
const plain = { combat: { immunities: "", weaknesses: "" } };
const other = { combat: { immunities: "cold", weaknesses: "" } };
ok("W1 a fire-immune creature is inside the scope", inDamageScope(scope, fiery) === true);
ok("W2 an ordinary creature is not", inDamageScope(scope, plain) === false);
ok("W3 nor one immune to something else", inDamageScope(scope, other) === false);
// NO SCOPE MEANS EVERYONE, so every other damaging spell is untouched.
ok("W4 A SPELL WITH NO SCOPE REACHES EVERYONE",
  inDamageScope(null, plain) === true && inDamageScope(null, fiery) === true,
  "this file must not change any spell that does not declare a scope");
ok("W5 and a creature with no defences at all is outside it",
  inDamageScope(scope, {}) === false,
  "absence of an immunity is not an immunity");

/* ================================================================== *
 * C. THE CARD
 * ================================================================== */

ok("C1 the line names what the damage reaches",
  /only creatures immune to <strong>fire<\/strong>/.test(damageScopeLine(scope, [])));
// NAMED, NOT COUNTED. This is a spell whose whole point is that it passes
// most of the people standing in it.
ok("C2 AND NAMES WHO WAS SPARED",
  /unharmed: Borin, Nella/.test(damageScopeLine(scope, ["Borin", "Nella"])),
  "\"3 spared\" leaves a table wondering which three");
ok("C3 a spell with no scope says nothing", damageScopeLine(null, ["Borin"]) === "");

/* ================================================================== *
 * R. IS IT REACHED?
 * ================================================================== */

const cast = strip(read("module", "magic", "cast-workflow.mjs"));
ok("R1 the cast asks for a scope", cast.includes("const scope = damageScope(spellData);"));
ok("R2 and filters the targets by it",
  cast.includes("if (inDamageScope(scope, t.system ?? {}, ownedCreatureTypeSystem(t), actor?.system ?? {})) inside.push(t);"));
// THE CASTER GOES IN TOO, SINCE 3.552.4. The second form of a scope —
// "creatures with an opposed aura" — is a relationship, and a filter
// that only ever saw the target could not answer it. Asked as part of
// R2's own string so the two cannot drift apart.
// BEFORE THE SAVES. A creature the spell cannot touch must not roll one —
// a column of successful saves by bystanders is a card describing an
// event that did not happen.
// THE SAVE LOOP, NOT JUST ANY TARGET LOOP. `for (const target of
// targets) {` occurs twice in this file — an earlier one sits above the
// scope filter, so the bare string made this ordering read backwards.
// The needle is the loop's own first statement instead.
ok("R3 THE SCOPE IS ASKED BEFORE THE SAVES",
  before(cast, "const scope = damageScope(spellData);",
    "const save = target.system?.combat?.saves?.[parsed.key];"),
  "a bystander must not roll against a spell that cannot reach them");
ok("R4 and the card says who was spared",
  cast.includes("damageScopeLine(scope, sparedByScope)"));
// THE TEST GOES THROUGH THE SYSTEM'S OWN RESOLVER, not the raw field, so
// an Elemental immune to its native element by creature type is caught.
const scopeSrc = strip(read("module", "magic", "damage-scope.mjs"));
ok("R5 immunity is asked of actorDefences, not of the raw field",
  scopeSrc.includes("return actorDefences(targetSystem ?? {}, creatureTypeSystem)")
  && !scopeSrc.includes("combat?.immunities"),
  "a fire Elemental's immunity comes from its creature type, not its sheet");

/* ================================================================== *
 * Q. QUENCH ITSELF
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") spells.push(v);
  }
} finally { await db.close(); }
ok("Q0 the pack was read", spells.length > 600, `${spells.length}`);

const scoped = spells.filter((s) => damageScope(s.system));
// TWO SPELLS NOW, AND THEY USE DIFFERENT FORMS (3.552.4). Quench keys on
// an immunity; Wash Away Sin keys on the caster's own aligned trait.
// Named individually rather than counted loosely, so a third spell
// quietly acquiring a scope is still news.
// THREE AT 3.609.0, A THIRD FORM: Wall Of Light's "each undead and ooze"
// (block 33's R4) — `kinds:undead,ooze`, read by the kind gate's own test.
ok("Q1 exactly three spells declare a damage scope",
  scoped.length === 3 &&
    ["Quench", "Wash Away Sin", "Wall Of Light"].every((n) => scoped.some((s) => s.name === n)),
  `found ${scoped.length}: ${scoped.map((s) => s.name).join(", ")}`);

const quench = spells.find((s) => s.name === "Quench");
ok("Q2 Quench rolls the 4d8 the book prints",
  String(quench?.system?.damage?.formula ?? "") === "4d8");
// UNTYPED, DELIBERATELY. Typing it "fire" would be resisted or ignored by
// the very creatures it is meant to hurt, and this pack has no water type.
ok("Q3 AND IT IS UNTYPED",
  String(quench?.system?.damage?.type ?? "") === "",
  "a fire type would be shrugged off by every creature the spell targets");
ok("Q4 with the Basic save the book prints",
  /basic fortitude/i.test(String(quench?.system?.defence ?? "")),
  "the word is what makes the damage scale by degree");
ok("Q5 and it is scoped to fire-immune creatures",
  damageScope(quench?.system)?.immuneTo === "fire");
// THE TWO CLAUSES THIS MECHANISM DOES NOT TOUCH.
ok("Q6 the other half of the spell is still printed",
  (quench?.system?.effects ?? []).some(
    (r) => r?.kind === "note" && /counteract/i.test(String(r.text ?? ""))),
  "extinguishing fires and the counteract are not this mechanism");

/* ================================================================== *
 * A. THE OPPOSED-AURA FORM (3.552.4)
 *
 * Graham's ruling of 15 September 2026 on Wash Away Sin: the cone
 * catches everyone and the damage reaches "creatures with an opposed
 * aura". Driven, because every line of it is a judgement about who gets
 * hurt — and the last time this spell's damage side was touched it
 * landed on the caster's own party.
 * ================================================================== */

const aura = damageScope({ damageScope: "opposedAura" });
const traited = (t) => ({ details: { traits: t, grantedTraits: "" } });
const goodCleric = traited("good");

ok("A1 the form is recognised", Boolean(aura?.opposedAura));
ok("A1b and is not confused with the immunity form", !aura?.immuneTo);
ok("A2 a Good caster reaches an Evil creature",
  inDamageScope(aura, traited("evil, undead"), null, goodCleric) === true);
ok("A3 and does NOT reach a Good ally",
  inDamageScope(aura, traited("good"), null, goodCleric) === false,
  "the failure this spell shipped with was damage landing on the people it heals");
ok("A4 nor a creature carrying no aligned trait at all",
  inDamageScope(aura, traited(""), null, goodCleric) === false,
  "there is no opposing trait for the damage to key against — the same reading alignedDamageAffects takes");
ok("A5 a caster with no aligned trait opposes nobody",
  inDamageScope(aura, traited("evil"), null, traited("")) === false,
  "their cast is pure healing, which is what the printed clause leaves them with");
ok("A6 Order reaches Chaos", inDamageScope(aura, traited("chaos"), null, traited("order")) === true);
ok("A7 Balance has no opposite, so it damages nobody",
  inDamageScope(aura, traited("evil"), null, traited("balance")) === false,
  "the appendix's table as written; if it grows an entry this follows without an edit");
ok("A8 a granted trait counts, not only a typed one",
  inDamageScope(aura, { details: { traits: "", grantedTraits: "evil" } }, null, goodCleric) === true,
  "a Form spell's trait reaches every other aligned rule and must reach this one");
ok("A9 the immunity form still ignores the caster entirely",
  inDamageScope(damageScope({ damageScope: "immune:fire" }), fiery, null, traited("good")) === true &&
    inDamageScope(damageScope({ damageScope: "immune:fire" }), plain, null, traited("good")) === false,
  "Quench must behave exactly as it did before a second form existed");
ok("A10 and the card says who it reaches",
  /opposed to yours/.test(damageScopeLine(aura, [])),
  "a spared list without a reason is a table asking why");

/* ── THE HEAL SIDE READS THE AREA, NOT THE SAVE (3.552.6) ────────
 *
 * FOUND BY THE FIRST LIVE CAST, 15 September 2026. The damage half was
 * perfect — "unharmed: Test Crusader, ZZ Ally", the one Evil creature
 * took 6 essence — and the card then said "Wash Away Sin finds nobody
 * to affect", because the heal row was filtering `targets`, which on a
 * SAVE spell is the list of creatures who FAILED. An ally in the cone
 * never rolls; the spell heals them, it does not attack them.
 *
 * Read from source because the recipient split lives inside a Foundry
 * workflow. Asked as three separate facts so a partial revert is still
 * a failure. */
{
  const effects = strip(read("module", "magic", "spell-effects.mjs"));
  const cast = strip(read("module", "magic", "cast-workflow.mjs"));
  ok("H1 an allies row prefers the area-caught list",
    /\(areaCaught\.length \? areaCaught : targets\)\s*\.filter\(\(t\) => t\?\.uuid && !hostileUuids\.includes\(t\.uuid\)\)/.test(effects),
    "on a save spell `targets` is the failures, and an ally in the cone never rolled");
  ok("H2 falling back to targets when there is no area",
    /areaCaught\.length \? areaCaught : targets/.test(effects),
    "Forbidding Ward names one ally and one enemy with no area at all");
  ok("H3 and the cast hands the area-caught list over",
    /areaCaught: Array\.isArray\(areaTargets\) \? areaTargets : \[\],/.test(cast));
  ok("H4 with friend-or-foe decided over everyone considered",
    /for \(const candidate of \[\.\.\.targets, \.\.\.areaCaught\]\)/.test(effects),
    "an ally who never rolled was never classified, so the filter could not keep them");
}

const wash = spells.find((s) => s.name === "Wash Away Sin");
// AN ALLIES ROW IS AN AREA ROW, NARROWED. spell-effects.mjs resolves it
// from the area-caught list, which is why widening the cone and narrowing
// the row is one change rather than two that fight. Pinned here as well
// as in verify-warp-area-targeting, because this is the file that would
// be read by somebody wondering why the heal did not reach an enemy.
ok("A11 Wash Away Sin declares the form", wash?.system?.damageScope === "opposedAura");
ok("A12 its cone catches everyone, or the scope has nobody to filter",
  wash?.system?.areaTargeting === "all");
ok("A13 and its heal row is narrowed to allies",
  (wash?.system?.effects ?? []).find((e) => e?.kind === "heal")?.target === "allies",
  "a wider cone must not start healing the creatures it is damaging");

if (failures.length) {
  process.stderr.write(`verify-damage-scope: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-damage-scope: OK — ${checks} checks. The mist passes everyone it cannot burn.\n`);
