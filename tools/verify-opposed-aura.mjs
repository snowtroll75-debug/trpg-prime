#!/usr/bin/env node
/**
 * verify-opposed-aura — "a creature with an opposing aura type to your
 * own", and whether the bonus it gates is REACHED.
 *
 * NEW at 3.446.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE QUESTION THREE SPELLS WAITED ON, and Graham's two rulings of
 * 31 August 2026 that answered it:
 *
 *   1. An aura type IS the Aligned trait.
 *   2. "Any PC that takes a Divine Aspect should gain the aligned trait
 *      of that aspect. A character that has the Balanced trait gains no
 *      benefit from a spell that affects opposed auras (as they have
 *      nothing to oppose) and this is deliberate."
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS THE ONE THAT MATTERS. A conditional bonus that is granted
 * and never consulted is this project's most-repeated defect — Cutting
 * Words' inert gate, `freezeMembership`, the area warp that charged for
 * nothing. So the granted record is driven THROUGH the two channels that
 * consume it rather than inspected where it is written.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { opposingTraitsOf, opposedAuraLine, opposedAuraAttackBonus, opposedAuraRecordsFor, OPPOSED_AURA_FLAG }
  from "../module/magic/opposed-aura.mjs";
import { aspectAlignedTraits } from "../module/divine-aspect.mjs";
import { emanationEffectData } from "../module/magic/emanation-effects.mjs";
import { normaliseDefenceDC, defenceDCBonus } from "../module/combat/defence-dc.mjs";
import { creatureTraits, ALIGNMENT_OPPOSITES } from "../module/creature-traits.mjs";
import { warpedBonusValue, warpedEmanationEffects } from "../module/magic/spell-warp.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const attackSrc = read("module", "combat", "attack-workflow.mjs");
const actorSrc = read("module", "documents", "actor.mjs");
const castSrc = read("module", "magic", "cast-workflow.mjs");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const sys = (traits, granted = "") => ({ details: { traits, grantedTraits: granted } });

/* ================================================================== *
 * A. WHAT OPPOSES WHAT
 * ================================================================== */

ok("A0 the pairs are the Codex's, not a copy",
  ALIGNMENT_OPPOSITES.good === "evil" && ALIGNMENT_OPPOSITES.chaos === "order",
  "without this every comparison below would be a comparison with itself");
ok("A1 a Good caster opposes Evil", opposingTraitsOf(sys("Good")).join() === "evil");
ok("A2 and an Evil caster opposes Good", opposingTraitsOf(sys("Evil")).join() === "good");
ok("A3 two traits oppose two",
  opposingTraitsOf(sys("Chaos, Good")).sort().join() === "evil,order");
// GRAHAM'S RULING, AND THE HALF THAT IS EASY TO GET WRONG.
ok("A4 BALANCE OPPOSES NOBODY", opposingTraitsOf(sys("Balance")).length === 0,
  "\"they have nothing to oppose, and this is deliberate\"");
ok("A5 an unaligned creature likewise", opposingTraitsOf(sys("Humanoid")).length === 0);
ok("A6 a creature with no traits at all does not throw",
  opposingTraitsOf({}).length === 0 && opposingTraitsOf().length === 0);
// A NON-ALIGNMENT TRAIT IS NOT AN ALIGNMENT. "Order" is; "Humanoid" is not.
ok("A7 only the five aligned traits count",
  opposingTraitsOf(sys("Humanoid, Fiend, Good")).join() === "evil");

/* ================================================================== *
 * B. THE DIVINE ASPECT GRANTS ITS ALIGNMENT
 *
 * NOTHING WAS MAPPED. Every one of the ten aspects already carried its
 * alignment in its own trait line, which is why this was a wiring job.
 * ================================================================== */

const aspect = (traits) => ({ type: "divine-aspect", system: { traits } });

ok("B1 Dawn grants Good", aspectAlignedTraits([aspect("Good")]).join() === "good");
ok("B2 Justice grants both of its own",
  aspectAlignedTraits([aspect("Good, Order")]).sort().join() === "good,order");
ok("B3 Magic grants Balance", aspectAlignedTraits([aspect("Balance")]).join() === "balance");
ok("B4 two aspects grant the union, once each",
  aspectAlignedTraits([aspect("Evil, Order"), aspect("Order")]).sort().join() === "evil,order");
// FILTERED, because a trait line is not promised to hold only alignments
// and a rule about alignment must not hand over whatever else is written
// there next.
ok("B5 a non-alignment word on the line is not granted",
  aspectAlignedTraits([aspect("Good, Radiant, Humanoid")]).join() === "good");
ok("B6 no aspects grants nothing", aspectAlignedTraits([]).length === 0
  && aspectAlignedTraits().length === 0);

// IS IT REACHED? The grant is worthless unless it lands in the derived
// field `creatureTraits` unions — which is the whole of the ruling.
const actorClean = strip(actorSrc);
ok("B7 the actor grants it through the DERIVED field",
  actorClean.includes("const fromAspects = aspectAlignedTraits(aspectsOf(actor));")
  && actorClean.includes("...effectGrantedTraits(actor), ...fromAspects"),
  "written into details.traits it would be a trait a player can save permanently");
// AND END TO END: a Cleric of Dawn opposes Evil.
{
  const cleric = sys("Humanoid", aspectAlignedTraits([aspect("Good")]).join(", "));
  ok("B8 a Cleric of Dawn reads as Good",
    creatureTraits(cleric).includes("good"));
  ok("B8b and therefore opposes Evil",
    opposingTraitsOf(cleric).join() === "evil");
}

/* ================================================================== *
 * C. WHAT THE CARD SAYS — including when it says nothing applies
 * ================================================================== */

ok("C1 the condition is named", opposedAuraLine(["evil"]).includes("Evil"));
ok("C2 two are named readably", opposedAuraLine(["order", "evil"]) ===
  "only against creatures with the Order or Evil trait");
// THE STONE SHIELD LESSON. A bonus that can never apply must SAY so.
ok("C3 a Balance caster is told why nothing applies",
  /no opposing aura/.test(opposedAuraLine([])));
ok("C3b and that sentence is not a bonus in disguise",
  !/\+/.test(opposedAuraLine([])));
ok("C4 rubbish does not throw", typeof opposedAuraLine() === "string");
ok("C5 the cast prints it for any spell that declares the condition",
  strip(castSrc).includes("opposedAuraLine(opposingTraitsOf(system))"));
// AND THE CIRCLE CARRIES IT. Printing the condition while recording an
// empty one would be a card that reads correctly over an aura that fires
// at nobody — the two halves must come from the same call.
ok("C6 the emanation records the caster's own opposites",
  strip(castSrc).includes("opposedTo: opposingTraitsOf(system),"),
  "recorded at the cast, so a caster who later changes does not change it");

/* ================================================================== *
 * D. THE GRANT REACHES BOTH CHANNELS
 *
 * A conditional bonus must NOT be written into the sheet total, or it
 * raises the number against everybody — the defect this design exists to
 * avoid. So it is carried as records the two channels consult.
 * ================================================================== */

const attackAura = {
  name: "Wellspring Of Valour", opposedTo: ["evil"],
  effects: [{ kind: "bonus", slot: "attack", bonusType: "status", value: 1, opposedAura: true }]
};
const defenceAura = {
  name: "Radiant Aegis", opposedTo: ["evil"],
  effects: [{ kind: "bonus", slot: "defence", bonusType: "status", value: 1, opposedAura: true }]
};
const plainAura = {
  name: "Bless",
  effects: [{ kind: "bonus", slot: "attack", bonusType: "status", value: 1 }]
};

const attackData = emanationEffectData(attackAura, "cast1", "Cleric");
const defenceData = emanationEffectData(defenceAura, "cast2", "Cleric");
const plainData = emanationEffectData(plainAura, "cast3", "Cleric");

ok("D1 a conditional bonus writes NO sheet change",
  attackData.changes.length === 0 && defenceData.changes.length === 0,
  "a change row would raise the number against every opponent");
ok("D1b but the effect is still placed",
  Boolean(attackData) && Boolean(defenceData),
  "an aura a player paid for must be visible even when it rarely fires");
ok("D2 the attack side is carried as its own record",
  Array.isArray(attackData.flags["trg-prime"][OPPOSED_AURA_FLAG])
  && attackData.flags["trg-prime"][OPPOSED_AURA_FLAG][0].opposedTo.join() === "evil");
ok("D3 the defence side rides the existing defence-DC channel",
  Array.isArray(defenceData.flags["trg-prime"].defenceDC)
  && defenceData.flags["trg-prime"].defenceDC[0].when.sourceAlignments.join() === "evil");
// AN ORDINARY EMANATION IS UNTOUCHED, with no vestigial keys.
ok("D4 Bless still writes a plain sheet change",
  plainData.changes.length === 1);
ok("D4b and carries neither conditional key",
  !("defenceDC" in plainData.flags["trg-prime"])
  && !(OPPOSED_AURA_FLAG in plainData.flags["trg-prime"]));

/* ---- the ATTACK channel, driven ---- */

const held = attackData.flags["trg-prime"][OPPOSED_AURA_FLAG];
ok("D5 the bonus applies against an opposed target",
  opposedAuraAttackBonus(held, sys("Evil, Fiend"))?.value === 1);
ok("D6 and not against anybody else",
  opposedAuraAttackBonus(held, sys("Humanoid")) === null);
ok("D6b nor against a creature aligned the SAME way",
  opposedAuraAttackBonus(held, sys("Good")) === null,
  "an opposed aura is not any aura");
ok("D7 it is typed status, so Appendix 1 governs it",
  opposedAuraAttackBonus(held, sys("Evil"))?.type === "status");
// ORDERED LARGEST FIRST ON PURPOSE. The first draft listed 1 then 3, so a
// mutation making the LAST record win still answered 3 and survived — the
// check could not tell "largest" from "last".
ok("D8 two auras do not stack — the larger wins",
  opposedAuraAttackBonus([{ ...held[0], value: 3 }, ...held], sys("Evil"))?.value === 3,
  "listed largest-first, so a last-one-wins bug answers 1");
ok("D8b and in the other order too",
  opposedAuraAttackBonus([...held, { ...held[0], value: 3 }], sys("Evil"))?.value === 3);
// A RECORD WORTH NOTHING IS NOT A BONUS. An aura granted at zero would
// otherwise print a "+0" line on an attack card.
ok("D8c a zero record grants nothing",
  opposedAuraAttackBonus([{ ...held[0], value: 0 }], sys("Evil")) === null);
ok("D8d and a negative one is not a penalty",
  opposedAuraAttackBonus([{ ...held[0], value: -2 }], sys("Evil")) === null,
  "a grant must never subtract from somebody's attack roll");
// THE BALANCE CASE, THROUGH THE REAL GRANT rather than a hand-made record.
{
  const balanced = emanationEffectData(
    { ...attackAura, opposedTo: opposingTraitsOf(sys("Balance")) }, "cast4", "Cleric");
  ok("D9 a Balance caster's aura is placed and can never fire",
    Boolean(balanced)
    && opposedAuraAttackBonus(balanced.flags["trg-prime"][OPPOSED_AURA_FLAG], sys("Evil")) === null,
    "Graham: they have nothing to oppose, and this is deliberate");
}

/* ---- the DEFENCE channel, driven through its own normaliser ---- */

const entry = normaliseDefenceDC(defenceData.flags["trg-prime"].defenceDC[0], { name: "Radiant Aegis" });
ok("D10 the entry survives normalisation", Boolean(entry));
ok("D10b carrying the alignment axis", entry.sourceAlignments.join() === "evil");
// AN ENTRY SCOPED BY NOTHING IS STILL REFUSED — the axis must widen the
// vocabulary without widening what an unscoped entry may claim.
ok("D11 an unscoped entry is still refused",
  normaliseDefenceDC({ dc: "defence", value: 1 }, {}) === null);
ok("D11b while the alignment axis alone is scope enough",
  Boolean(normaliseDefenceDC({ dc: "defence", value: 1, when: { sourceAlignments: ["evil"] } }, {})));

{
  const defender = { items: [], effects: [{ flags: { "trg-prime": { defenceDC: [defenceData.flags["trg-prime"].defenceDC[0]] } } }] };
  ok("D12 the DB rises against an Evil attacker",
    defenceDCBonus(defender, "defence", "", [], "", ["evil"]).total === 1);
  ok("D13 and not against an unaligned one",
    defenceDCBonus(defender, "defence", "", [], "", []).total === 0,
    "the Balance and unaligned case from the other side");
  ok("D13b nor against a Good one",
    defenceDCBonus(defender, "defence", "", [], "", ["good"]).total === 0);
}

/* ================================================================== *
 * D2. THE OTHER PLACE THAT PLACES THESE EFFECTS (3.446.2)
 *
 * THE DEFECT THIS SECTION EXISTS FOR. Two paths place an emanation's
 * effects — `emanationEffectData` for a creature crossing the boundary
 * later, and `applySpellEffects` for the creatures caught AT THE CAST —
 * and 3.446.0 taught only the first. Radiant Aegis therefore shipped
 * writing `system.combat.defence.status = 1` onto every ally in the
 * circle: an unconditional +1 DB against everybody, which is the Stone
 * Shield defect and the exact thing `opposedAura` exists to prevent.
 *
 * Found by casting it in Graham's world. The harness drove ONE caller
 * and assumed the other used the same road — the "is it REACHED?"
 * question asked once where it needed asking twice.
 * ================================================================== */

// THE ROUTING IS ONE RULE BOTH PATHS ASK, so they cannot diverge again.
{
  const defRow = { kind: "bonus", slot: "defence", bonusType: "status", value: 1, opposedAura: true };
  const atkRow = { kind: "bonus", slot: "attack", bonusType: "status", value: 2, opposedAura: true };
  const asDefence = opposedAuraRecordsFor(defRow, ["evil"], "Radiant Aegis");
  const asAttack = opposedAuraRecordsFor(atkRow, ["chaos"], "Wellspring Of Valour");
  ok("D2a a defence row becomes a defence-DC entry",
    asDefence.defenceDC[0].when.sourceAlignments.join() === "evil" && asDefence.attack.length === 0);
  ok("D2b an attack row becomes an attack record",
    asAttack.attack[0].opposedTo.join() === "chaos" && asAttack.defenceDC.length === 0);
  ok("D2c and each carries its own value",
    asDefence.defenceDC[0].value === 1 && asAttack.attack[0].value === 2);
  ok("D2d a Balance caster's empty list rides through",
    opposedAuraRecordsFor(defRow, [], "Radiant Aegis").defenceDC[0].when.sourceAlignments.length === 0);
}

// AND THE CAST-TIME APPLIER ASKS IT — the caller that was missing.
{
  const fx = strip(read("module", "magic", "spell-effects.mjs"));
  ok("D2e the cast-time applier routes a conditional row",
    fx.includes("if (effect.opposedAura) {")
    && fx.includes("opposedAuraRecordsFor(effect, opposedTo, spell.name)"),
    "this path wrote a flat sheet change and shipped an unconditional +1 DB");
  ok("D2f and places NO sheet change for it",
    /changes: \[\],\s*flags: conditional/.test(fx),
    "a change row is what made the bonus unconditional");
  ok("D2g the caster's opposites are resolved for it",
    fx.includes("const casterOpposes = opposingTraitsOf(caster?.system ?? {});")
    // NO CLOSING PAREN IN THE ANCHOR (3.528.0). It read
    // `"parsedDuration, castId, casterOpposes)"` and broke the moment the
    // call gained a `registersCast` argument — the threading it cares
    // about was untouched. What it asserts is that the caster's opposites
    // REACH the applier, not that they are the last thing to.
    && fx.includes("parsedDuration, castId, casterOpposes"),
    "resolved from the caster, as the emanation record does");
  const em = strip(read("module", "magic", "emanation-effects.mjs"));
  ok("D2h and the boundary path asks the same rule",
    em.includes("opposedAuraRecordsFor({ ...effect, value }, opposedTo, emanation.name)"),
    "two routings would drift, and this pair already drifted once");
}

/* ================================================================== *
 * E. AND THE ATTACK WORKFLOW ASKS BOTH
 *
 * The half that is easy to write and forget to reach.
 * ================================================================== */

const attackClean = strip(attackSrc);
ok("E1 the defender's channel is given the attacker's alignments",
  attackClean.includes('defenceDCBonus(targetActor, "defence", "", attackerTypes, actor?.uuid ?? "", attackerAlignments, creatureTraits(actor.system ?? {}))'));
ok("E1b read off the attacker, not the defender",
  attackClean.includes("const attackerAlignments = alignedTraitsOf(actor.system ?? {});"));
ok("E2 the attacker's own aura records are consulted against the target",
  attackClean.includes("opposedAuraAttackBonus(")
  && attackClean.includes("targetActor.system ?? {}"));
ok("E2b and pushed into the roll rather than computed and dropped",
  attackClean.includes("if (auraAttack) modifiers.push(auraAttack);"),
  "the Cutting Words failure: a modifier that goes nowhere");
// ANCHORED ON THIS CALL, not on the shape. The first draft matched
// `filter((e) => !e.disabled)` anywhere in the file — and attack-workflow
// has more than one — so a mutation of THIS one survived by hiding behind
// a neighbour. The same import-position trap, one file over.
{
  const call = attackClean.slice(attackClean.indexOf("const auraAttack ="));
  const body = call.slice(0, call.indexOf("if (auraAttack)"));
  ok("E3 disabled effects are not consulted",
    /\.filter\(\(e\) => !e\.disabled\)/.test(body),
    "an aura that ended must stop helping");
  ok("E3b and the records come from the ATTACKER's own effects",
    /actor\.appliedEffects \?\? actor\.effects/.test(body));
}

/* ================================================================== *
 * F. THE PACK
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

ok("F0 the spells pack was read", spells.length > 600, `only ${spells.length} found`);

const wellspring = spells.find((s) => s.name === "Wellspring Of Valour");
ok("F1 Wellspring grants the conditional attack bonus",
  (wellspring?.system?.effects ?? []).some(
    (e) => e.kind === "bonus" && e.slot === "attack" && e.opposedAura === true && e.value === 1));
// BUILT AT 3.614.0 (block 35's R9): the heal is a `damageHeal` row now, and
// the "by hand" note is gone — a card that says "by hand" over an automated
// heal would be the opposite lie. See magic/damage-heal.mjs.
ok("F2 and its heal on first taking damage each round is built, with no by-hand note",
  (wellspring?.system?.effects ?? []).some((e) => e.kind === "damageHeal" && e.dice === "1d6")
  && !(wellspring?.system?.effects ?? []).some((e) => e.kind === "note" && /by hand/i.test(e.text)),
  "the on-damage trigger is built, and the card must not say otherwise");
const aegis = spells.find((s) => s.name === "Radiant Aegis");
ok("F1b Radiant Aegis grants the conditional DB bonus",
  (aegis?.system?.effects ?? []).some(
    (e) => e.kind === "bonus" && e.slot === "defence" && e.opposedAura === true && e.value === 1));
// A PLAIN ROW WOULD BE THE STONE SHIELD DEFECT — a DB bonus against every
// attacker in the scene, with the condition living in a note beside it.
ok("F1c and it is NOT authored as an unconditional one",
  !(aegis?.system?.effects ?? []).some(
    (e) => e.kind === "bonus" && e.slot === "defence" && !e.opposedAura));
ok("F1d with no note repeating the condition",
  !(aegis?.system?.effects ?? []).some(
    (e) => e.kind === "note" && /opposing aura/i.test(e.text ?? "")),
  "the cast card prints it; a note would be a second place saying it");

/* ---- THE WARP THAT CHARGED FOR NOTHING (3.446.1) ----
 * Seven live emanations sell "increase the bonus by +1" and the emanation
 * record was built from the RAW pack rows, so all seven took the PP and
 * placed the printed value. Found while authoring Radiant Aegis, whose
 * own +3 PP warp would have been the eighth.
 */
{
  const live = spells.filter((s) => emanationIsLive(s.system));
  const selling = live.filter((s) => (s.system.warps ?? []).some((w) => w.mods?.bonusValue));
  ok("F5 the live emanations that sell a bonus warp are still seven or more",
    selling.length >= 7, `${selling.length}: ${selling.map((s) => s.name).join(", ")}`);
  // DRIVEN THROUGH THE SHARED RULE, both directions and the cap.
  ok("F5b a warped bonus rises", warpedBonusValue(1, 1, 4) === 2);
  ok("F5c and stops at its cap", warpedBonusValue(1, 9, 4) === 4);
  ok("F5d a PENALTY warps away from zero", warpedBonusValue(-1, 1, 4) === -2,
    "Bane is stored negative; capping the raw value would hand the target a bonus");
  ok("F5e and its cap clamps magnitude, not sign", warpedBonusValue(-1, 9, 4) === -4);
  ok("F5f no cap means no ceiling", warpedBonusValue(1, 3, null) === 4);
  ok("F5g and no warp changes nothing", warpedBonusValue(1, 0, 4) === 1);
}
// DRIVEN, NOT READ. The first version of this section matched the
// arithmetic inline in the cast's argument list — and a mutation that
// disabled the branch while leaving the call visible SURVIVED it. The
// rule moved into a named function so it can be run.
{
  const rows = [
    { kind: "bonus", slot: "defence", bonusType: "status", value: 1, opposedAura: true },
    { kind: "perTurn", formula: "1d8", mode: "heal" }
  ];
  const warped = warpedEmanationEffects(rows, { bonusValue: 2, bonusMax: 5 });
  ok("F6 a live emanation's bonus row is warped", warped[0].value === 3);
  ok("F6b and everything else about the row survives",
    warped[0].opposedAura === true && warped[0].slot === "defence");
  // TESTED BY WHAT IT DID NOT GAIN. The first draft checked that `kind`
  // and `formula` survived — and they survive a mutation that runs the
  // row through the BONUS branch too, because spreading keeps them. What
  // distinguishes the two is the field the bonus branch adds.
  ok("F6c a non-bonus row is untouched",
    warped[1].kind === "perTurn" && warped[1].formula === "1d8"
    && !("value" in warped[1]),
    "Luminance's perTurn heal must not acquire a bonus value it never had");
  ok("F6d no warp changes nothing",
    warpedEmanationEffects(rows, null)[0].value === 1);
  // COPIED, NOT MUTATED — the rows come from pack data the record outlives.
  // EVERY ROW, NOT JUST THE WARPED ONE. The first draft checked index 0 —
  // the bonus row, which is rebuilt anyway — so a mutation that handed
  // BACK the untouched rows survived it. The pass-through row is the one
  // that can leak.
  ok("F6e the source rows are not written through",
    rows[0].value === 1 && warped[0] !== rows[0] && warped[1] !== rows[1],
    "writing through would make a warp permanent in the compendium");
  ok("F6f rubbish does not throw", warpedEmanationEffects().length === 0);
}
// AND THE CAST ASKS IT — one call to point at, now that the rule is real.
ok("F6g the emanation record is built from the warped rows",
  strip(castSrc).includes("warpedEmanationEffects(liveEmanationEffects(spellData), warpMods)"),
  "the record carried the pack rows untouched, so seven spells charged for nothing");
// SLICED TO THE `bonus` CASE. This matched the whole file until 3.447.0,
// when the new `freeWarp` case grew a call with the identical arguments —
// and a mutation of the bonus case's own call then SURVIVED, hiding
// behind its neighbour. The fourth time this session that a string
// occurring twice in one file has hidden a mutation; the answer is the
// same each time, which is to match inside the block being claimed about.
{
  const fx = strip(read("module", "magic", "spell-effects.mjs"));
  const from = fx.indexOf('case "bonus": {');
  const to = fx.indexOf('case "attitude": {', from);
  const bonusCase = from === -1 ? "" : fx.slice(from, to === -1 ? undefined : to);
  ok("F6b0 the bonus case was found", bonusCase.length > 0);
  ok("F6b and the ordinary applier asks the same function",
    bonusCase.includes("warpedBonusValue(Number(effect.value) || 0, warpBonus, warpBonusMax)"),
    "two copies of this arithmetic would drift, and the sign rule is what drifts");
}

ok("F3 its bonus warp rides the existing key",
  wellspring?.system?.warps?.[1]?.mods?.bonusValue === 1);
ok("F3b with no invented ceiling",
  wellspring?.system?.warps?.[1]?.mods?.bonusMax === undefined,
  "the book prints no maximum for this one, unlike the radius warp beside it");

// EVERY opposedAura ROW IN THE PACK MUST NAME A SLOT ONE OF THE TWO
// CHANNELS CAN CARRY. A row nobody routes is the silent-drop defect.
const ROUTED = ["attack", "defence"];
const stray = [];
for (const s of spells) {
  for (const e of (s.system?.effects ?? [])) {
    if (!e?.opposedAura) continue;
    if (!ROUTED.includes(String(e.slot ?? "").trim().toLowerCase())) {
      stray.push(`${s.name}: slot "${e.slot}"`);
    }
  }
}
ok("F4 no opposed-aura row names a slot neither channel carries",
  stray.length === 0, stray.join("; "));

/* ================================================================== */

if (failures.length) {
  process.stderr.write(`verify-opposed-aura: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-opposed-aura: OK — ${checks} checks. An aura type is the Aligned trait, `
  + `Balance opposes nobody, and both channels are reached.\n`);
