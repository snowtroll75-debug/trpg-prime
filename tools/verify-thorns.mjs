#!/usr/bin/env node
/**
 * verify-thorns — Vibrant Thorns, and whether the blow that lands is the
 * blow that gets pricked.
 *
 * NEW at 3.440.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS IS A RIDER ON BEING HIT, so its reachability question is asked in
 * a place the 3.437.0 pair never had to look: `resolveWeaponDamage`
 * damages the DEFENDER, and this must damage the person who swung. A
 * wiring that fed the packet to the wrong actor would be silent — the
 * card would still print a line, the dice would still roll, and the
 * thorns would be hurting their owner.
 *
 * Section E asks for the argument order by name for exactly that reason.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `bodyOf` IS A BRACE WALK PAST THE PARAMETER LIST, and every ordering or
 * presence claim is scoped to one statement and anchored on a call. The
 * suppression pair is where that was learned the hard way: four checks
 * asked things of a whole function body and all four survived their
 * mutations.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  THORNS_FLAG, normaliseThorns, thornsTriggered, thornsIntensified, thornsFormula,
  intensifiesThorns, thornsCastLine
} from "../module/magic/thorns.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const attack = read("module", "combat", "attack-workflow.mjs");
const applier = read("module", "magic", "spell-effects.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");
const combat = read("module", "documents", "combat.mjs");
const flow = read("module", "magic", "thorns-workflow.mjs");

const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

function bodyOf(src, signature) {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  let cursor = start + signature.length - 1;
  if (src[cursor] === "(") {
    let parens = 0;
    for (; cursor < src.length; cursor += 1) {
      if (src[cursor] === "(") parens += 1;
      else if (src[cursor] === ")") { parens -= 1; if (parens === 0) break; }
    }
  }
  const open = src.indexOf("{", cursor);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") { depth -= 1; if (depth === 0) return src.slice(open, i + 1); }
  }
  return "";
}
const has = (body, needle) => strip(body).includes(needle);
function before(body, a, b) {
  const clean = strip(body);
  const i = clean.indexOf(a); const j = clean.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

/* ================================================================== *
 * A. THE READER
 * ================================================================== */

const damageBody = bodyOf(attack, "async function resolveWeaponDamage(");
ok("A1 resolveWeaponDamage's body was found", damageBody.length > 0);
ok("A2 and reaches its real code", damageBody.includes("runeDamageFor(weapon, { target"),
  "a body that cannot see the rune loop is not this function's body");
ok("A3 the import is out of scope",
  !damageBody.includes('from "../magic/thorns-workflow.mjs"'),
  "the import-position trap: `applyThorns` is named up there too");

/* ================================================================== *
 * B. WHAT THORNS ARE
 * ================================================================== */

const spec = normaliseThorns({ label: "Vibrant Thorns", damage: "1", intensified: "1d6", damageType: "piercing" });
ok("B1 a plain thorns row normalises", spec?.damage === "1" && spec?.intensified === "1d6");
ok("B2 rubbish is refused", normaliseThorns(null) === null && normaliseThorns("1") === null);
ok("B3 a flat number and a die are both accepted as the damage",
  Boolean(normaliseThorns({ damage: "1", damageType: "piercing" }))
  && Boolean(normaliseThorns({ damage: "2d4", damageType: "piercing" })),
  "an author could plausibly write either, and the book uses both in one spell");
// A FLAT ADDITION IS NOW GIVEN TO THE ROLLER (3.640.0): the Balor's flames
// strike back for "3d8+10"; a bare die with no count still is not.
ok("B4 a formula the roller was never given is refused",
  normaliseThorns({ damage: "1d6+1", damageType: "piercing" })?.damage === "1d6+1"
  && normaliseThorns({ damage: "1", intensified: "d6", damageType: "piercing" }) === null
  && normaliseThorns({ damage: "d6", damageType: "piercing" }) === null);
ok("B5 an empty damage type is refused",
  normaliseThorns({ damage: "1", damageType: "" }) === null);
ok("B6 reach defaults to five feet", spec.reachFeet === 5);
ok("B7 and a declared reach is honoured",
  normaliseThorns({ damage: "1", damageType: "piercing", reachFeet: 10 }).reachFeet === 10);
// THE ROUND TRIP — this spec is read back off the flag on every blow.
ok("B8 normalising a normalised spec returns the same spec",
  JSON.stringify(spec) === JSON.stringify(normaliseThorns(spec)));

/* ================================================================== *
 * C. WHICH BLOWS TOUCH THEM
 * ================================================================== */

const melee = { hit: true, melee: true, unarmed: false };
ok("C1 an adjacent melee blow triggers them",
  thornsTriggered(spec, { ...melee, distanceFeet: 5 }));
ok("C2 a reach weapon from ten feet does not",
  thornsTriggered(spec, { ...melee, distanceFeet: 10 }) === false,
  '"adjacent" is the whole point of the word being in the spell');
ok("C3 a ranged attack never does",
  thornsTriggered(spec, { hit: true, melee: false, unarmed: false, distanceFeet: 5 }) === false,
  "an arrow comes into contact with nothing growing on its target");
// "LANDS a melee blow" — a miss touches no thorns.
ok("C4 a miss never does",
  thornsTriggered(spec, { hit: false, melee: true, unarmed: false, distanceFeet: 5 }) === false);
// THE SECOND PRINTED ROUTE, implemented rather than argued away.
ok("C5 an unarmed attack triggers them whatever the distance",
  thornsTriggered(spec, { hit: true, melee: true, unarmed: true, distanceFeet: 15 }));
// AND A DISTANCE NOBODY MEASURED DOES NOT FIRE THEM.
ok("C6 an unmeasured distance does not trigger an armed blow",
  thornsTriggered(spec, { ...melee, distanceFeet: null }) === false
  && thornsTriggered(spec, { ...melee }) === false,
  "off a canvas nothing can say whether the attacker was adjacent");
ok("C7 but the unarmed route still works with no geometry",
  thornsTriggered(spec, { hit: true, melee: true, unarmed: true, distanceFeet: null }));
ok("C8 no spec, no thorns", thornsTriggered(null, { ...melee, distanceFeet: 5 }) === false);

/* ================================================================== *
 * D. THE INTENSIFIED WINDOW
 * ================================================================== */

ok("D1 unstamped thorns are not intensified",
  thornsIntensified(spec, { stampedRound: null, currentRound: 3 }) === false);
ok("D2 the round it was stamped is intensified",
  thornsIntensified(spec, { stampedRound: 3, currentRound: 3 }));
// "UNTIL THE BEGINNING OF YOUR NEXT TURN" — the following round still
// counts, because the caster's own turn has not come round again until
// the clock says so.
ok("D3 and so is the round after, until the turn-start clears it",
  thornsIntensified(spec, { stampedRound: 3, currentRound: 4 }));
ok("D4 but not two rounds later",
  thornsIntensified(spec, { stampedRound: 3, currentRound: 5 }) === false,
  "a stamp nobody cleared must not intensify for ever inside a combat");
ok("D5 out of combat the window stays open",
  thornsIntensified(spec, { stampedRound: 0, currentRound: null }),
  "there are no turns to begin, and nothing has happened to end it");
ok("D6 thorns with no intensified formula never intensify",
  thornsIntensified(normaliseThorns({ damage: "1", damageType: "piercing" }),
    { stampedRound: 1, currentRound: 1 }) === false);

ok("D7 the formula follows the window",
  thornsFormula(spec, false) === "1" && thornsFormula(spec, true) === "1d6");
ok("D8 and falls back when there is nothing to rise to",
  thornsFormula(normaliseThorns({ damage: "1", damageType: "piercing" }), true) === "1");

ok("D9 an essence spell intensifies them",
  intensifiesThorns("Alteration, Essence, Soul") && intensifiesThorns("essence"));
ok("D10 and nothing else does",
  intensifiesThorns("Alteration, Morph, Plant") === false
  && intensifiesThorns("") === false && intensifiesThorns(null) === false);
// READ AS A WHOLE WORD. A trait line naming "Essences" or "Quintessence"
// is not an Essence spell.
ok("D11 the trait is matched as a whole word",
  intensifiesThorns("Quintessence") === false && intensifiesThorns("Essences") === false);

/* ================================================================== *
 * E. IS IT REACHED, AND POINTED THE RIGHT WAY?
 * ================================================================== */

ok("E1 the damage step applies thorns",
  has(damageBody, "applyThorns(actor, targetActor, {"),
  "anchored on the CALL, and on its argument order");
// THE ARGUMENT ORDER IS THE RULE. `applyThorns(attacker, defender)`:
// swapped, the thorns would prick their own owner and nothing else in
// this file would notice.
ok("E2 the attacker is the one who gets pricked",
  /applyThorns\(\s*actor\s*,\s*targetActor\s*,/.test(strip(damageBody)),
  "swapped, a thorned creature damages itself every time it is hit");
ok("E3 it fires after the weapon's own damage has landed",
  before(damageBody, "...strikeRunes.filter((r) => !r.addsToStrike)", "applyThorns(actor, targetActor, {"),
  '"lands a melee blow" — the blow resolves first');
// Re-anchored at 3.667.0: the Strike's damage context also says
// "melee: isMelee,", so the check is held to the thorns call itself.
ok("E4 it is told whether the blow was melee",
  /applyThorns\(actor, targetActor, \{\s*melee: isMelee,/.test(damageBody));
// 3.576.0: through the one shared rule (combat/unarmed.mjs), which also
// knows a gauntlet is unarmed and a bracered punch still is.
ok("E5 and whether it was unarmed",
  /unarmed:\s*isUnarmedAttack\(weaponData\)/.test(strip(damageBody)));
ok("E6 and the measured melee distance",
  has(damageBody, "distanceFeet: meleeDistance"));
// THE DISTANCE HAS TO GET THERE. `distance` was ranged-only; a melee one
// had to be threaded in, and if that stops happening every armed blow
// silently stops triggering.
const attackBody = bodyOf(attack, "export async function rollWeaponAttack(");
ok("E7 the attack path measures and passes the melee distance",
  has(attackBody, "meleeDistance: isRanged ? null : distanceToTarget"),
  "without it every armed blow reads as an unmeasured distance and nothing fires");

/* ================================================================== *
 * F. THE INTENSIFY HOOK AND THE TURN CLOCK
 * ================================================================== */

const castBody = bodyOf(cast, "export async function castSpell(");
ok("F1 castSpell's body was found and reaches its real code",
  castBody.length > 0 && castBody.includes("componentGate(actor, spellData, spell.name)"));
ok("F2 casting intensifies the thorns",
  has(castBody, "intensifyThorns(actor, spell)"));
// AFTER THE CAST HAS SUCCEEDED. A failed cast sharpens nothing, and the
// applier runs after this, so the window is open by the time any effect
// this same cast creates could be read.
ok("F3 and does so before the effects are applied",
  before(castBody, "intensifyThorns(actor, spell)", "applySpellEffects(actor, spell, {"));

const turnBody = bodyOf(combat, "async _onStartTurn(");
ok("F4 the turn-start body was found and reaches its real code",
  turnBody.length > 0 && turnBody.includes("applyPerTurnEmanations("));
ok("F5 the caster's own turn beginning closes the window",
  has(turnBody, "clearThornsIntensity(actor)"),
  '"until the beginning of your next turn" — only the turn clock can answer it');

/* ================================================================== *
 * G. THE WORKFLOW HALF
 * ================================================================== */

const applyBody = bodyOf(flow, "export async function applyThorns(");
ok("G1 the apply function was found", applyBody.length > 0);
// EVERY OTHER SECONDARY PACKET IN THIS SYSTEM MEETS THE TARGET'S
// DEFENCES, and this one is resolved against the ATTACKER's.
ok("G2 the packet is resolved against the attacker's own defences",
  /resolveAgainstDefences\(attacker\.system/.test(strip(applyBody)),
  "a creature immune to piercing walks through a briar patch unharmed");
ok("G3 and applied to the attacker",
  has(applyBody, "applyDamageAndCheckDying(attacker, packet.taken"));
ok("G4 the trigger is asked with hit forced true",
  has(applyBody, "thornsTriggered(spec, { ...blow, hit: true })"),
  "this is only reached on a hit, and saying so beats a caller remembering to");
ok("G5 the line reports what was rolled as well as what landed",
  has(applyBody, "rolled ${rawTotal}"),
  "Luminance's lesson: without the roll beside the result an immunity looks like a bad die");
ok("G6 a disabled effect grows no thorns",
  has(bodyOf(flow, "function thornsOn("), "if (effect.disabled) continue;"));

/* ================================================================== *
 * H. THE APPLIER AND THE PACK
 * ================================================================== */

const caseBody = bodyOf(applier, 'case "thorns": {');
ok("H1 the applier has a thorns case", caseBody.length > 0);
ok("H2 malformed thorns are refused out loud",
  has(caseBody, "if (!spec) {") && has(caseBody, "malformed thorns"));
ok("H3 the effect is created under the flag the strike path reads",
  has(caseBody, '[THORNS_FLAG]: spec') && THORNS_FLAG === "thorns"
  && has(caseBody, 'createEffectsOn(target, [thornData])'));

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items!") && value?.type === "spell") spells.push(value);
  }
} finally { await db.close(); }

ok("H4 the spells pack was read", spells.length > 600, `only ${spells.length} found`);
const rows = [];
for (const s of spells) {
  for (const row of s.system?.effects ?? []) if (row?.kind === "thorns") rows.push({ spell: s.name, row });
}
/*
 * TWO NOW. Fiery Body was added at 3.452.0 — "Any creature that touches
 * you or damages you with an unarmed attack or non-reach melee weapon
 * takes 3d6 fire damage", which is this mechanism's own sentence, and
 * `thornsTriggered` already answers it exactly: true for an unarmed
 * blow, otherwise measured against reach. Found by comparing the printed
 * rulebook against the pack, not by reading more code.
 */
const thornSpells = rows.map((r) => r.spell).sort();
ok("H5 two spells declare thorns",
  rows.length === 2 && thornSpells.join(", ") === "Fiery Body, Vibrant Thorns",
  rows.map((r) => r.spell).join(", "));
const byThornName = Object.fromEntries(rows.map(({ spell, row }) => [spell, normaliseThorns(row)]));
ok("H5b Fiery Body burns whoever touches it, at reach",
  byThornName["Fiery Body"]?.damage === "3d6"
  && byThornName["Fiery Body"]?.damageType === "fire"
  && byThornName["Fiery Body"]?.reachFeet === 5);
// ONLY THE THORNS ARE WIRED, and Fiery Body must SAY so — it grants
// fire immunity, Critical Resistance 2, two weaknesses, an unarmed die,
// an extra die on fire spells and an innate spell, none of which this
// mechanism touches. A card showing 3d6 and nothing else would imply the
// whole entry was handled.
const fieryBody = spells.find((x) => x.name === "Fiery Body");
ok("H5c and the rest of that spell is printed rather than implied",
  (fieryBody?.system?.effects ?? []).some(
    (r) => r?.kind === "note" && /applied by hand/i.test(String(r.text ?? ""))),
  "the thorns are one clause of a very large spell");
ok("H6 and every thorns row in every pack normalises",
  rows.every(({ row }) => normaliseThorns(row) !== null));
const vt = byThornName["Vibrant Thorns"];
ok("H7 Vibrant Thorns is 1 piercing rising to 1d6, within five feet",
  vt?.damage === "1" && vt?.intensified === "1d6" && vt?.damageType === "piercing" && vt?.reachFeet === 5);
// RE-AIMED AT 3.613.0 (block 35's B8). The disagreement this pinned is
// gone: Core 3.8.1 prints "essence" in the warp too, so the warp is applied
// — the thorns grow by 1, or by 1d6 intensified — and its text says essence.
ok("H8 the warp is applied, and says essence",
  (() => {
    const sp = spells.find((s) => s.name === "Vibrant Thorns")?.system;
    const row = (sp?.effects ?? []).find((e) => e.kind === "thorns");
    return row?.warpStep?.damage === 1 && row?.warpStep?.intensified === "1d6"
      && /essence spell/.test(sp?.warps?.[0]?.text ?? "")
      && !(sp?.effects ?? []).some((e) => e.kind === "note" && /\+4 PP/.test(e.text));
  })());

ok("H9 the cast line names both damages and the reach",
  /1 piercing/.test(thornsCastLine(vt)) && /1d6/.test(thornsCastLine(vt))
  && /5 feet/.test(thornsCastLine(vt)) && !/undefined/.test(thornsCastLine(vt)));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-thorns: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-thorns: OK — ${checks} checks. Only a landed, adjacent, melee blow, the packet points at `
  + `the attacker, and the window is the turn clock's.\n`);
