#!/usr/bin/env node
/**
 * verify-area-rider — secondary damage that comes from the GROUND, and
 * the unarmed strike scope that arrived with it.
 *
 * NEW at 3.465.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE SPELLS OFF THE PRINTED-DAMAGE BACKLOG, TWO MECHANISMS.
 *
 *   CONSECRATE   "all attacks made against undead creatures within the
 *                 consecrated area gain a +2-circumstance bonus and
 *                 inflict 1d4 essence secondary damage"
 *   DESECRATE     the same sentence with "living" for "undead"
 *   FORCE PUNCH  "your unarmed attacks inflict 1d6 secondary force
 *                 damage"
 *
 * All three say SECONDARY, the rune chapter's word and the word
 * `strike-riders.mjs` was built around — so all three produce packets in
 * the shape `resolveWeaponDamage` already consumes, and join the same
 * loop rather than getting one of their own.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION D IS THE ONE THAT MATTERS, and it exists because of a mistake
 * this file caught while it was being written.
 *
 * The first draft of the workflow read `runningEmanations()`. Both pack
 * entries would have refused it silently: Consecrate's area is
 * "40-foot-radius (B)" and Desecrate's "40-foot-radius", and
 * `emanationIsLive` requires the word "emanation", so the list would
 * always have been empty and the die would never have rolled. The PACK
 * was right — an emanation follows its caster, and consecrated ground is
 * a place you walk away from for a day.
 *
 * So D asks the pack what these areas actually SAY, rather than trusting
 * that the source I chose can see them. It is the same question that
 * A6 asks for Aura Of Vitality in verify-per-turn, arrived at from the
 * opposite direction — there the word had to be present, here it must
 * be absent.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  AREA_RIDER_KEY, AREA_RIDER_SUBJECTS, normaliseAreaRider, areaRiderReaches,
  areaRiderAttackBonus, areaRiderPacket
} from "../module/magic/area-rider.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";
import { normaliseStrikeRider, riderPacketsFor } from "../module/magic/strike-riders.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
/*
 * CODE WITHOUT ITS COMMENTS, and this helper was added because D6 failed
 * on the very first run — against a sentence in the workflow's own header
 * explaining that it does NOT read the emanation list.
 *
 * That is the third time in two days a check has been satisfied, or here
 * broken, by prose: verify-emanation's guard locator matched a comment
 * quoting the guard, and verify-hazard-terrain's matched one spelling of
 * it. A claim about what the code DOES must be asked of the code.
 */
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const RIDER = { kind: "areaRider", label: "Consecrated ground", subject: "undead", dice: "1d4", damageType: "essence", attackBonus: 2 };

/* ── A. THE ROW ──────────────────────────────────────────────────── */
ok("A1 a well-formed row normalises", normaliseAreaRider(RIDER)?.dice === "1d4");
ok("A2 and carries its subject", normaliseAreaRider(RIDER)?.subject === "undead");
ok("A3 a row of another kind is not one", normaliseAreaRider({ ...RIDER, kind: "hazard" }) === null);
ok("A4 nor is a row with no dice", normaliseAreaRider({ ...RIDER, dice: "" }) === null);
ok("A5 nor one with a malformed formula", normaliseAreaRider({ ...RIDER, dice: "1d4+1" }) === null,
  "the same refusal isRiderDice makes — it would throw or roll something nobody checked");
// A MISSING DAMAGE TYPE MEANS SOMETHING ELSE IN THIS SYSTEM — a rune's
// "the weapon's own" — so a row that forgot one must not inherit it.
ok("A6 nor one with no damage type", normaliseAreaRider({ ...RIDER, damageType: "" }) === null);
// THE SUBJECT IS THE WHOLE RULE: it is the only word Consecrate and
// Desecrate differ by. A row without it is not a rider that reaches
// everybody; it is one nobody can act on.
ok("A7 AND A ROW WITH NO SUBJECT IS REFUSED", normaliseAreaRider({ ...RIDER, subject: "" }) === null,
  "it is the only word Consecrate and Desecrate differ by");
ok("A8 an unknown subject is refused", normaliseAreaRider({ ...RIDER, subject: "eternal" }) === null);
ok("A9 only two subjects exist so far", AREA_RIDER_SUBJECTS.length === 2);

/* ── B. WHO IT REACHES ───────────────────────────────────────────── */
const undeadRider = normaliseAreaRider(RIDER);
const livingRider = normaliseAreaRider({ ...RIDER, subject: "living", label: "Desecrated ground" });
ok("B1 consecrated ground bites an undead standing in it",
  areaRiderReaches(undeadRider, { isUndead: true, inside: true }) === true);
ok("B2 and not a living creature standing in it",
  areaRiderReaches(undeadRider, { isUndead: false, inside: true }) === false);
// BOTH HALVES, AND THIS IS THE HALF A GEOMETRY BUG WOULD BREAK. A rider
// that fired on kind alone would follow the undead off the consecrated
// ground and bite it anywhere on the map.
ok("B3 AND NOT AN UNDEAD STANDING OUTSIDE IT",
  areaRiderReaches(undeadRider, { isUndead: true, inside: false }) === false,
  "the sentence is about where the creature is standing");
ok("B4 desecrated ground is the mirror",
  areaRiderReaches(livingRider, { isUndead: false, inside: true }) === true
  && areaRiderReaches(livingRider, { isUndead: true, inside: true }) === false);
ok("B5 no row reaches anybody", areaRiderReaches(null, { isUndead: true, inside: true }) === false);

/* ── C. WHAT IT PRODUCES ─────────────────────────────────────────── */
const packet = areaRiderPacket(undeadRider);
ok("C1 the packet carries the dice and type",
  packet.dice === "1d4" && packet.type === "essence");
// NOT CONDITIONAL. A conditional packet prints "apply if it applies" and
// hands the table a judgement; both halves are answered by the time a
// packet exists, so saying otherwise would describe a decision nobody
// made. Graham ruled on 2 September 2026 that the system applies this.
ok("C2 AND IT IS NOT CONDITIONAL", packet.conditional === false,
  "Graham ruled the system applies it; a conditional packet would print instead");
ok("C3 the attack bonus is separate from the damage",
  areaRiderAttackBonus(undeadRider, true) === 2 && areaRiderAttackBonus(undeadRider, false) === 0,
  "it lands on the attack roll, not in a damage packet");

/* ── D. WHAT THE PACK ACTUALLY SAYS ──────────────────────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const pack = new Map();
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") pack.set(String(v.name), v);
  }
} finally { await db.close(); }
ok("D1 the pack was read", pack.size > 600, `${pack.size} spells`);

const rowOf = (name, kind) =>
  (pack.get(name)?.system?.effects ?? []).find((r) => r?.kind === kind) ?? null;

ok("D2 Consecrate carries its 1d4 essence",
  normaliseAreaRider(rowOf("Consecrate", "areaRider"))?.dice === "1d4");
ok("D3 aimed at undead", normaliseAreaRider(rowOf("Consecrate", "areaRider"))?.subject === "undead");
ok("D4 Desecrate carries the same die at living",
  normaliseAreaRider(rowOf("Desecrate", "areaRider"))?.subject === "living");
/*
 * D5 IS THE CHECK THAT WOULD HAVE CAUGHT THE FIRST DRAFT.
 *
 * It read `runningEmanations()`. Neither of these areas is an emanation
 * — the word is not in either string — so the list would always have
 * been empty and the die would never have rolled once. Nothing in
 * sections A–C would have noticed: every rule in them was correct.
 */
for (const name of ["Consecrate", "Desecrate"]) {
  const area = String(pack.get(name)?.system?.area ?? "");
  ok(`D5 ${name} IS A PLACE, NOT AN EMANATION`,
    !emanationIsLive(pack.get(name)?.system) && !/emanation/i.test(area),
    `area is "${area}" — reading these from runningEmanations() finds nothing, ever`);
}
ok("D6 so the workflow reads regions, not the emanation list",
  strip(read("module", "magic", "area-rider-workflow.mjs")).includes("canvas?.scene?.regions")
  && !strip(read("module", "magic", "area-rider-workflow.mjs")).includes("runningEmanations("),
  "consecrated ground stays where it was cast");

/* ── E. FORCE PUNCH AND THE UNARMED SCOPE ────────────────────────── */
const punch = normaliseStrikeRider(rowOf("Force Punch", "strikeRider"));
ok("E1 Force Punch carries a 1d6 force rider", punch?.dice === "1d6" && punch?.damageType === "force");
ok("E2 scoped to unarmed attacks", punch?.scope === "unarmed");
// A MINUTE OF PUNCHING, NOT ONE PUNCH. `once` defaults TRUE in
// normaliseStrikeRider, so a row that failed to say so would spend
// itself on the first swing and the other 9 rounds would be unarmed.
ok("E3 AND IT IS NOT SPENT BY THE FIRST SWING", punch?.once === false,
  "the spell lasts a minute and rides every unarmed attack in it");
const unarmed = { attackMode: "melee", category: "Unarmed", weaponId: "x" };
const sword = { attackMode: "melee", category: "Martial", weaponId: "y" };
ok("E4 it rides an unarmed strike", riderPacketsFor([punch], unarmed).length === 1);
ok("E5 and NOT a sword", riderPacketsFor([punch], sword).length === 0);
// A WEAPON THAT NAMES NO CATEGORY IS NOT UNARMED. Defaulting the other
// way would put the 1d6 on every swing by a caster whose weapon entry
// happens to be incomplete — a die the table cannot see the source of.
ok("E6 nor a weapon with no category at all",
  riderPacketsFor([punch], { attackMode: "melee", category: "", weaponId: "z" }).length === 0);
ok("E7 an any-scoped rider still rides everything",
  riderPacketsFor([normaliseStrikeRider({ dice: "1d6", damageType: "force", scope: "any" })], sword).length === 1,
  "the new scope must not narrow the old ones");

/* ── F. AND IT IS REACHED ────────────────────────────────────────── */
const attack = read("module", "combat", "attack-workflow.mjs");
ok("F1 the strike loop asks for area packets",
  attack.includes("areaRiderPackets(targetActor, targetTokenHere)"));
// THE TOKEN, NOT THE ACTOR. An Actor cannot say where it is standing,
// and this whole mechanism is a question about standing somewhere.
// A STRAY SHOT MAY NAME SOMEBODY ELSE (3.579.0). Page 192's stray shot
// strikes a different combatant, so the damage step takes an override —
// but it is still a TOKEN, which is the whole of what this check is for.
ok("F2 AND IT IS HANDED A TOKEN",
  attack.includes("const targetTokenHere = targetTokenOverride ?? firstTargetToken() ?? null;"),
  "an Actor cannot answer where it is standing");
ok("F3 the packets join the existing secondary-damage loop",
  attack.includes("...strikeRiderPackets(actor, weapon, riderCtx), ...areaPackets"),
  "a second loop would be a second place deciding how secondary damage meets a defence");
ok("F4 and the cast records the rider on the region",
  read("module", "magic", "cast-workflow.mjs").includes('if (row?.kind !== "areaRider" || !placedArea?.regionId) continue;'));
ok("F5 the flag key is the one the reader looks for",
  read("module", "magic", "area-rider-workflow.mjs").includes("AREA_RIDER_KEY") && AREA_RIDER_KEY === "areaRider");

if (failures.length) {
  process.stderr.write(`verify-area-rider: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-area-rider: OK — ${checks} checks. Consecrated ground bites what stands in it, and Force Punch rides bare hands.\n`);
