#!/usr/bin/env node
/**
 * verify-delayed-respite — Delayed Respite.
 *
 * NEW at 3.493.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT SHIPPED CARRYING NOTHING.
 *
 *   Cast R; Trigger a creature or object within range takes damage from
 *   an attack; Range 30 feet; Duration 1 round (D)
 *
 *   "You manipulate the flow of time, causing the impact of the attack to
 *    be delayed. Although damage and critical hits are determined as
 *    usual, the target's HP remain unaffected ... Once the spell ends,
 *    the results of the attack manifest instantly."
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION P IS THE WHOLE DESIGN: ONE GATE, NOT SIXTEEN CALL SITES.
 *
 * Every route that damages anything crosses `applyDamageDirect`, and the
 * 3.339.4 permission relay is the precedent for intercepting exactly
 * there. A spell that asked each caller to remember would be a spell that
 * worked for weapon damage and not for a rune.
 *
 * SECTION E IS THE RULING WITH TEETH: DISMISSAL FIRES THE PACKET. Both
 * endings run through ONE function, which is what stops the clock and a
 * dismissal disagreeing about whether the blow lands.
 *
 * SECTION O IS "ONE ATTACK, ONE PACKET" — a Respite that has caught a
 * blow is spent, so the second blow of a round lands now.
 *
 * SECTION D IS THE HONESTY: the card must not print "Now 30 / 30 HP"
 * under a twelve-damage hit. That reads as a broken damage path, and a
 * table would report it as one.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  RESPITE_FLAG, normaliseDelayedRespite, respiteCatches, respitePacket,
  respiteCaughtLine, respiteReleasedLine, respiteRemainderLine
} from "../module/magic/delayed-respite.mjs";

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
/** One function's body, so no check can match text from a neighbour. */
function bodyOf(source, signature) {
  const at = source.indexOf(signature);
  if (at < 0) return "";
  const rest = source.slice(at + signature.length);
  const stops = [rest.indexOf("\nexport "), rest.indexOf("\nasync function"), rest.indexOf("\nfunction ")]
    .filter((n) => n > 0);
  return rest.slice(0, stops.length ? Math.min(...stops) : rest.length);
}

/* ================================================================== *
 * N. THE DECLARED ROW
 * ================================================================== */

const row = normaliseDelayedRespite({ kind: "delayedRespite", label: "Delayed Respite" });
ok("N1 the row reads back whole", row.label === "Delayed Respite" && row.packet === null);
ok("N2 a malformed row is refused",
  normaliseDelayedRespite(null) === null
  && normaliseDelayedRespite({ kind: "note" }) === null);
// N3 THE SAME VALIDATOR READS THE PACK ROW AND THE STORED FLAG. The row
// carries `kind`; the record read back off a live effect does not, and
// a second shape would be a second chance to disagree.
ok("N3 a stored record with no kind still normalises",
  normaliseDelayedRespite({ label: "Delayed Respite", packet: { damage: 7 } })?.packet?.damage === 7,
  "one shape, one validator");

/* ================================================================== *
 * O. ONE ATTACK, ONE PACKET
 * ================================================================== */

ok("O1 an empty Respite catches a blow", respiteCatches({ packet: null }, 7));
ok("O2 A SPENT ONE CATCHES NOTHING",
  respiteCatches({ packet: { damage: 7 } }, 9) === false,
  "\"the impact of THE attack\" is singular — the second blow of a round lands now");
ok("O3 and no Respite catches nothing", respiteCatches(null, 7) === false);
// O4 ZERO DAMAGE IS NOT A BLOW. Catching it would spend the spell on
// nothing at all, which is the worst possible way for it to end.
ok("O4 zero damage does not spend the spell", respiteCatches({ packet: null }, 0) === false);
ok("O4b nor does a negative number", respiteCatches({ packet: null }, -3) === false);

/* ================================================================== *
 * K. THE PACKET
 * ================================================================== */

const packet = respitePacket(12, { isCritical: true, nonlethal: false });
equal("K1 the number is kept whole", packet.damage, 12);
equal("K2 and so is the critical", packet.isCritical, true);
equal("K3 and whether it was subdual", packet.nonlethal, false);
equal("K3b which is carried through when it is", respitePacket(4, { nonlethal: true }).nonlethal, true,
  "a delayed subdual blow that arrived lethal would kill somebody the rules do not");
equal("K4 a negative packet is floored", respitePacket(-5).damage, 0);

/* ================================================================== *
 * P. THE GATE — one primitive, not sixteen call sites
 * ================================================================== */

const dying = read("module", "combat", "dying-workflow.mjs");
const direct = bodyOf(dying, "async function applyDamageDirect(");

ok("P1 THE GATE IS INSIDE THE SHARED PRIMITIVE",
  direct.includes("const held = await catchWithRespite(actor, incoming, { isCritical, nonlethal });"),
  "every damage route in the system crosses this one function");
ok("P1b and it returns before HP move",
  direct.includes("if (held) {") && direct.includes('case: "delayed",'));

// P2 BEFORE EVERYTHING THAT FOLLOWS. Temporary HP, the Plant creature
// type, Massive Damage and the Dying ladder are all things that must not
// happen to a blow that has not landed yet.
const at = {
  gate: direct.indexOf("const held = await catchWithRespite"),
  temp: direct.indexOf("const absorbed = await spendTemporaryHP"),
  plant: direct.indexOf("if (isCritOnlyDamage(creatureTypeSystem)")
};
ok("P2 IT IS ASKED BEFORE TEMPORARY HP IS SPENT",
  at.gate > 0 && at.temp > 0 && at.gate < at.temp,
  "a temporary pool spent on a blow that has not landed is a pool spent twice");
ok("P2b and before the creature-type rules run",
  at.gate > 0 && at.plant > 0 && at.gate < at.plant);

// P3 ZERO IS REFUSED EARLIER STILL, so a Respite is never spent on a
// packet the damage path was going to discard anyway.
ok("P3 zero damage returns before the gate",
  direct.indexOf('if (!incoming) return { case: "none"') > 0
  && direct.indexOf('if (!incoming) return { case: "none"') < at.gate);

const catcher = bodyOf(dying, "async function catchWithRespite(");
ok("P4 a disabled Respite catches nothing", catcher.includes("if (e.disabled) return false;"),
  "a GM who switched the effect off has ended it");
ok("P5 the packet is written to the effect that caught it",
  catcher.includes("await effect.setFlag(RESPITE_SYSTEM_ID, RESPITE_FLAG, {"),
  "a packet held only in memory is a packet lost on reload");

/* ================================================================== *
 * E. BOTH ENDINGS, ONE FUNCTION
 * ================================================================== */

const eaw = read("module", "combat", "effect-application-workflow.mjs");
const release = bodyOf(eaw, "async function releaseDelayedRespite(");
const dismiss = bodyOf(eaw, "export async function removeEffectsByCastId(");
const expiry = bodyOf(eaw, "export async function expireSpellEffects(");

ok("E1 the release applies the stored damage",
  release.includes("await applyDamageAndCheckDying(actor, packet.damage, {"));
ok("E1b as a critical when it was one",
  release.includes("isCritical: Boolean(packet.isCritical),"));
ok("E1c and as subdual when it was that",
  release.includes("nonlethal: Boolean(packet.nonlethal)"));

// E2 THE PACKET IS CLEARED BEFORE IT IS APPLIED. Otherwise a second
// release — the clock arriving on a spell already dismissed — deals the
// same blow twice.
const cleared = release.indexOf("await effect.setFlag(SYSTEM_ID, RESPITE_FLAG, { ...raw, packet: null });");
const applied = release.indexOf("await applyDamageAndCheckDying(actor, packet.damage");
ok("E2 THE PACKET IS CLEARED BEFORE IT IS DEALT",
  cleared > 0 && applied > 0 && cleared < applied,
  "a double release would deal the same blow twice");

// E2b THE SPELL ENDS BEFORE THE BLOW LANDS — the book's own order, and
// FOUND LIVE at 3.493.0. `applyDamageAndCheckDying` crosses the gate this
// effect sits on, and the packet was emptied a line earlier: a Respite
// still present CATCHES ITS OWN RELEASED BLOW and is then deleted holding
// it. The card said the blow landed; the hit points did not move.
const gone = release.indexOf("if (actor?.effects?.get?.(effect.id)) await effect.delete();");
ok("E2b THE EFFECT IS REMOVED BEFORE THE PACKET IS DEALT",
  gone > 0 && applied > 0 && gone < applied,
  "otherwise the release walks straight back into its own gate");
ok("E2b2 and after the packet is cleared, so a stale re-call finds nothing",
  cleared > 0 && gone > cleared);

// E3 DISMISSAL FIRES IT — Graham's ruling of 4 September 2026, which
// makes dismissing the spell a weapon rather than a mercy.
// E3 THE OPTION TRAVELS FROM 3.494.0 — the same primitive is called by
// the Dismiss action and by the expiry sweeps, and `dismissed` is the
// only difference the card can see.
ok("E3 DISMISSAL RELEASES THE BLOW",
  dismiss.includes("await releaseRespitesByCastId(actor, castId, { dismissed });"));
// E3b AND BEFORE THE EFFECT IS DELETED. Afterwards the packet is gone
// with the effect that held it, and dismissal becomes the mercy the
// ruling says it is not.
const fires = dismiss.indexOf("await releaseRespitesByCastId");
const deletes = dismiss.indexOf('await actor.deleteEmbeddedDocuments("ActiveEffect", ids);');
ok("E3b before the effect carrying it is deleted",
  fires > 0 && deletes > 0 && fires < deletes,
  "the packet lives on the effect — delete it first and the blow is a mercy");

ok("E4 the world clock releases it too",
  expiry.includes("await releaseDelayedRespite(actor, effect, { dismissed: false });"),
  "the ordinary way a one-round spell ends");
const clockFires = expiry.indexOf("await releaseDelayedRespite(actor, effect");
// 3.614.1: the sweep deletes through `endEffect`, so a stasis lets its clocks go first.
const clockDeletes = expiry.indexOf("await endEffect(effect, actor);");
ok("E4b before the effect is deleted",
  clockFires > 0 && clockDeletes > 0 && clockFires < clockDeletes);

// E5 AN EMPTY RESPITE RELEASES NOTHING. A spell that caught no blow and
// ended is a spell that did nothing, not a spell that deals 0 damage.
ok("E5 a Respite that caught nothing deals nothing",
  release.includes("if (!packet || !Number(packet.damage)) return null;"));

/* ================================================================== *
 * D. THE CARD MUST NOT LIE ABOUT THE HIT POINTS
 * ================================================================== */

const atk = read("module", "combat", "attack-workflow.mjs");
ok("D1 THE ATTACK CARD KNOWS THE BLOW WAS HELD",
  atk.includes('if (damageResult.case === "delayed") {'),
  "\"Now 30 / 30 HP\" under a twelve-damage hit reads as a broken damage path");
ok("D1b and says so instead",
  atk.includes("lines.push(line(respiteCaughtLine(targetActor.name, damageResult.delayed)));"));
// D2 THE STEPS STILL PRINT. "Damage and critical hits are determined as
// usual" — only the arrival is deferred, and a card that hid the roll
// would be hiding the half the book says happens.
ok("D2 the damage breakdown still prints",
  atk.includes("<em>vs ${targetActor.name}:</em> ${packet.steps.join(\" \\u2192 \")} = <strong>${packet.taken}</strong>.`"));

// D3 AND THE ARRIVAL IS ANNOUNCED, from the one function both endings
// use. Hit points draining a round later with nothing said is the worst
// reading this spell has.
ok("D3 THE ARRIVING BLOW IS ANNOUNCED", release.includes("await ChatMessage.create({"),
  "a blow that lands in silence looks like hit points draining on their own");

/* ================================================================== *
 * R. THE CARD'S WORDS
 * ================================================================== */

ok("R1 the catch names the number", respiteCaughtLine("Merrick", packet).includes("12"));
ok("R1b and the critical", respiteCaughtLine("Merrick", packet).includes("critical"));
ok("R2 the release names the number", respiteReleasedLine("Merrick", packet).includes("12"));
ok("R2b and says when it was released early",
  respiteReleasedLine("Merrick", packet, true).includes("released early")
  && !respiteReleasedLine("Merrick", packet, false).includes("released early"));

// R3 THE HALF THE TABLE HOLDS, said on every cast. The critical injury
// will already have landed in front of them a moment earlier, and a card
// that deferred the number in silence would let them believe otherwise.
const remainder = respiteRemainderLine();
ok("R3 the card names the critical injury as NOT deferred", /critical injury/i.test(remainder));
ok("R3b and the conditions", /conditions/i.test(remainder));
ok("R3c and that dismissing releases it early", /[Dd]ismiss/.test(remainder));

/* ================================================================== *
 * G. THE SPELL AS SHIPPED
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
let respite = null;
const declarers = [];
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.name === "Delayed Respite") respite = value;
    if ((value?.system?.effects ?? []).some((e) => e?.kind === "delayedRespite")) {
      declarers.push({ name: value.name, pp: Number(value.system.ppCost) });
    }
  }
} finally {
  await db.close().catch(() => {});
}

const gRow = (respite?.system?.effects ?? []).find((e) => e.kind === "delayedRespite");
ok("G1 Delayed Respite declares it", Boolean(gRow));
equal("G2 on the target, not the caster", gRow?.target, "targets",
  "you delay the blow struck at somebody — usually not yourself");
equal("G3 one round, dismissible", String(respite?.system?.duration ?? ""), "1 round (D)",
  "the (D) is what makes dismissal a weapon");
ok("G4 the effect kind is handled at all",
  read("module", "magic", "spell-effects.mjs").includes('case "delayedRespite": {'));
// G5 THE RATCHET.
ok("G5 exactly one spell defers damage",
  declarers.length === 1 && declarers[0].pp === 1,
  `declarers: ${JSON.stringify(declarers)}`);
equal("G6 the flag is the one the gate reads", RESPITE_FLAG, "delayedRespite");

if (failures.length) {
  process.stderr.write(`verify-delayed-respite: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-delayed-respite: OK — ${checks} checks. One gate at the shared primitive, one packet `
  + "per casting, and both endings releasing through one function.\n");
