#!/usr/bin/env node
/**
 * verify-hide-from-animals — a ward that ends when its bearer acts.
 *
 * NEW at 3.503.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT CARRIED `effects: []` AND DID NOTHING.
 *
 *   "Animals cannot sense the warded creature … If a warded character
 *    touches an animal or attacks any creature, EVEN WITH A SPELL, the
 *    spell ends."
 *
 * SECTION C IS THE JUDGEMENT AND THE ONE WORTH ARGUING WITH: a spell that
 * only forces a save still ends the ward. The sentence says "attacks any
 * creature", and only the die is different.
 *
 * SECTION G IS WHERE THE TWO ENDINGS SIT. Both are single functions every
 * route crosses; a ward that asked each caller to remember would end on a
 * Strike from the sheet and not on one from a reaction feat.
 *
 * SECTION N IS THE HONESTY. The sensing half is not modelled, and it is
 * named twice — on the effect, where a GM looking at the token reads it,
 * and on the card, where the caster does.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  HIDE_FLAG, normaliseHideFromAnimals, castEndsHiding, hideEffectName,
  hidePlacedLine, hideRemainderLine, hideEndedLine, HIDE_END_REASONS
} from "../module/magic/hide-from-animals.mjs";
import { spellHasNoMechanics } from "../module/magic/spell-narration.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const ATTACK = read("module", "combat", "attack-workflow.mjs");
const CAST = read("module", "magic", "cast-workflow.mjs");
const FLOW = read("module", "magic", "hide-from-animals-workflow.mjs");
const EFFECTS = read("module", "magic", "spell-effects.mjs");

/* ================================================================== *
 * N. THE ROW
 * ================================================================== */

const row = normaliseHideFromAnimals({ kind: "hideFromAnimals", label: "Hide From Animals" });
equal("N1 the row reads back whole", row?.label, "Hide From Animals");
ok("N2 a malformed row is refused",
  normaliseHideFromAnimals(null) === null
  && normaliseHideFromAnimals({ kind: "note" }) === null);
ok("N3 a stored record with no kind still normalises",
  normaliseHideFromAnimals({ label: "Hide From Animals" })?.label === "Hide From Animals",
  "one validator for the pack row and the flag read back off a live effect");
equal("N4 the flag both ends name", HIDE_FLAG, "hideFromAnimals");

/* ================================================================== *
 * C. WHAT COUNTS AS AN ATTACK
 * ================================================================== */

ok("C1 an attack spell ends it", castEndsHiding({ category: "attack" }));
// C2 IS THE JUDGEMENT. "Attacks any creature, even with a spell" — only
// the die is different, and under-ending leaves a player hidden from
// things that can see them.
ok("C2 A SAVE SPELL ENDS IT TOO",
  castEndsHiding({ defence: "Basic Reflex" }),
  "a spell that forces a save is an attack on a creature in every sense the sentence means");
ok("C3 a spell that is neither leaves it standing",
  castEndsHiding({ category: "utility" }) === false,
  "Light and Mage Hand are not attacks");
ok("C4 THE WARD'S OWN CAST DOES NOT END IT",
  castEndsHiding({ category: "", defence: "" }) === false,
  "Hide From Animals declares no defence and no attack — placing it must not spend it");
ok("C5 nothing at all is not an attack",
  castEndsHiding(null) === false && castEndsHiding(undefined) === false);
ok("C6 a blank defence string is not a defence",
  castEndsHiding({ defence: "   " }) === false,
  "whitespace is what 300 pack rows carry where a field is absent");

/* ================================================================== *
 * G. THE TWO GATES
 * ================================================================== */

ok("G1 THE WEAPON GATE IS IN THE ATTACK WORKFLOW",
  ATTACK.includes("endHidingWards(actor, \"weapon\")"),
  "every route to a weapon attack crosses rollWeaponAttack");
ok("G2 THE SPELL GATE IS IN THE CAST WORKFLOW",
  CAST.includes("endHidingWards(actor, \"spell\")"));
ok("G3 and it asks first whether the spell is an attack",
  CAST.includes("if (castEndsHiding(spellData)) {"),
  "otherwise casting Light would end it");
// G4 IS THE ORDERING THAT MAKES A REFUSED CAST FREE.
ok("G4 THE SPELL GATE IS BELOW THE ACTION SPEND",
  CAST.indexOf("endHidingWards(actor, \"spell\")")
    > CAST.indexOf("await spendActionCost(actor, totalCastAP, spell.name);"),
  "a cast refused for PP, a component or a cancelled picker never happened, and ending "
  + "a ward on an attack nobody made is a resource lost to a change of mind");
// G4b IS WHAT G4 NEEDED AND DID NOT HAVE. Position checks use indexOf,
// which finds the FIRST call — so a SECOND gate added above the spend
// leaves the original where it is and the ordering still reads true. An
// added call is not a moved one; the invariant is that there is ONE.
// Third time this exact gap has been found by a mutation runner.
equal("G4b THERE IS ONE SPELL GATE",
  (CAST.match(/endHidingWards\(/g) ?? []).length, 1,
  "a second would end the ward twice, and the first would be above the spend");
equal("G4c AND ONE WEAPON GATE",
  (ATTACK.match(/endHidingWards\(/g) ?? []).length, 1);
// G5 CORRECTED AT 3.504.0 BY DRIVING IT. This asserted the gate sits
// above the target lookup "so an attack that finds no target has still
// been made" — and the live pass showed the TARGET PICKER runs before the
// gate either way: the ward was still on the token while "Select Target"
// was open. The behaviour is the one to want, so what is asserted now is
// the true and desirable fact: a cancelled picker leaves the ward, the
// same bargain the cast side makes with its action spend.
ok("G5 THE WEAPON GATE IS BELOW THE PICKER, so an uncommitted attack is free",
  ATTACK.indexOf("endHidingWards(actor, \"weapon\")")
    < ATTACK.indexOf("let targetToken = firstTargetToken();")
  && ATTACK.includes("BELOW THE TARGET PICKER, AND THAT IS RIGHT"),
  "an attack abandoned at the picker must not spend a one-minute ward");
ok("G6 THE WARD IS DELETED BEFORE ITS CARD IS POSTED",
  FLOW.includes("await actor.deleteEmbeddedDocuments(\"ActiveEffect\"")
  && FLOW.indexOf("await actor.deleteEmbeddedDocuments(\"ActiveEffect\"")
    < FLOW.indexOf("ChatMessage.create"),
  "the AWAIT is the half that matters: a deletion merely written above the card still "
  + "leaves it readable while the thing it describes is in place");
ok("G7 NOTHING IS SAID WHEN NOTHING IS WARDED",
  FLOW.includes("if (!wards.length) return 0;"),
  "this runs on every weapon attack in the game; a card each time would be unusable");
ok("G8 a disabled ward is not ended",
  FLOW.includes("if (e.disabled) return false;"),
  "a GM who switched the effect off has already ended it");

/* ================================================================== *
 * D. WHAT IS SAID, AND WHAT IS ADMITTED
 * ================================================================== */

const name = hideEffectName({ label: "Hide From Animals" });
ok("D1 THE EFFECT'S NAME ADMITS THE UNAUTOMATED HALF",
  /run by hand/i.test(name),
  "a GM looking at the token's effects reads the name, and nothing else");
ok("D2 the card says the ward is placed",
  hidePlacedLine("Merrick", " for 1 minute").includes("Merrick"));
const remainder = hideRemainderLine();
ok("D3 THE CARD NAMES BOTH HALVES",
  /GM runs that half/i.test(remainder) && /ends automatically/i.test(remainder)
  // AND THE SENSES BY NAME. The clause exists because blindsight and
  // tremorsense are exactly what a table will argue about.
  && /blindsense/i.test(remainder) && /tremorsense/i.test(remainder),
  "a card that only promised the ending would leave a table assuming the hiding was "
  + "enforced too");
ok("D4 and names the clause the GM must call",
  /touching an animal/i.test(remainder));
ok("D5 the ending says which act ended it",
  hideEndedLine("Merrick", HIDE_END_REASONS.weapon).includes("attacked")
  && hideEndedLine("Merrick", HIDE_END_REASONS.spell).includes("with a spell"));
ok("D6 the two reasons are different sentences",
  HIDE_END_REASONS.weapon !== HIDE_END_REASONS.spell,
  "\"the ward ended\" with no cause is a player retrying the same action three times");

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

let hide = null;
const declarers = [];
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
try {
  await db.open();
  for await (const [, value] of db.iterator()) {
    if (value?.type !== "spell") continue;
    if (value.name === "Hide From Animals") hide = value;
    if ((value.system?.effects ?? []).some((e) => e?.kind === "hideFromAnimals")) {
      declarers.push(value.name);
    }
  }
} finally {
  await db.close().catch(() => {});
}

ok("P1 Hide From Animals declares the ward",
  (hide?.system?.effects ?? []).some((e) => e.kind === "hideFromAnimals"));
equal("P2 on the touched creature, not the caster",
  (hide?.system?.effects ?? []).find((e) => e.kind === "hideFromAnimals")?.target, "targets");
equal("P3 its duration is unchanged", String(hide?.system?.duration ?? ""), "1 minute",
  "nothing here needed a data fix beyond the effects row");
ok("P4 its warp was already live",
  (hide?.system?.warps ?? []).some((w) => w?.mods?.extraTargets === 1),
  "one of the few in the pack that was never inert");
// P5 THE RATCHET.
ok("P5 exactly one spell places this ward",
  declarers.length === 1, `declarers: ${JSON.stringify(declarers)}`);
// P6 IT IS NO LONGER A SPELL WITH NOTHING TO SAY. Before this release the
// narration fallback was the whole of it.
ok("P6 THE SPELL IS NO LONGER MECHANICALLY EMPTY",
  spellHasNoMechanics(hide?.system ?? {}) === false,
  "it now carries an effect the applier reaches, so the description fallback stands down");
ok("P7 the applier reaches the kind",
  EFFECTS.includes('case "hideFromAnimals": {'));
// P8 IS THE GAP D1 LEFT. D1 proves the naming function admits the
// unautomated half; nothing proved the placer ever called it, and
// `name: spec.label` passed every check while the clause vanished from
// the only place a GM reads it.
ok("P8 THE PLACER USES THE NAMING FUNCTION",
  EFFECTS.includes("name: hideEffectName(spec),"),
  "a function that admits the clause and a placer that ignores it is a clause nobody sees");

if (failures.length) {
  process.stderr.write(`verify-hide-from-animals: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-hide-from-animals: OK — ${checks} checks. The ward ends itself at the two gates `
  + "every attack crosses, and the half the system does not model is admitted on the effect "
  + "and on the card.\n");
