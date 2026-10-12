#!/usr/bin/env node
/**
 * verify-caster-damage-riders — a rider on the caster's own spell damage
 * (3.625.0): Pillars of Faith's Consecrated Flame, +1d6 essence the first
 * time each round a fire spell damages an undead. Driven through the pure
 * module; both damage paths and the round reset structural.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { declaredSpellDamageRiders, spellDamageRidersFor, spellRidersBurnUpdate, spellRiderLine, SPELL_RIDERS_USED_FLAG } = await import(new URL("../module/magic/caster-damage-riders.mjs", import.meta.url));
const eff = (id, raw, extra = {}) => ({ id, name: id, flags: { "trg-prime": { spellDamageRider: raw } }, ...extra });
const flame = { label: "Consecrated Flame", dice: "1d6", damageType: "Essence", when: { damageTypes: ["Fire"], targetTypes: ["Undead"] }, oncePerRound: true };
const riders = declaredSpellDamageRiders([eff("cf", flame), eff("bad", { dice: "1d6+1", damageType: "fire" }), eff("none", { dice: "1d6" }), eff("off", flame, { disabled: true })]);
equal("A1 one rider reads (a non-die formula, a typeless one and a disabled one do not), lower-cased", riders.map((r) => [r.id, r.dice, r.damageType, r.damageTypes, r.targetTypes, r.oncePerRound]), [["cf", "1d6", "essence", ["fire"], ["undead"], true]]);
const ctx = (p) => ({ damageType: "fire", targetTypes: ["undead"], taken: 7, targetUuid: "Actor.skel", ...p });
equal("B1 fire damage that took HP from an undead: the rider joins", spellDamageRidersFor(riders, ctx({})).map((r) => r.id), ["cf"]);
equal("B2 …not cold damage, not against a living target, not when nothing was taken", [spellDamageRidersFor(riders, ctx({ damageType: "cold" })).length, spellDamageRidersFor(riders, ctx({ targetTypes: ["humanoid"] })).length, spellDamageRidersFor(riders, ctx({ taken: 0 })).length], [0, 0, 0]);
equal("B3 once per round PER CREATURE: burnt for the skeleton, still live for the zombie", [spellDamageRidersFor(riders, ctx({ used: spellRidersBurnUpdate(riders, "Actor.skel") })).length, spellDamageRidersFor(riders, ctx({ targetUuid: "Actor.zombie", used: spellRidersBurnUpdate(riders, "Actor.skel") })).length], [0, 1]);
equal("B4 the burn update keys rider and creature, WITHOUT DOTS (3.625.1 — setFlag would nest them), and keeps the rest", spellRidersBurnUpdate(riders, "Scene.s1.Token.t1.Actor.a1", { other: true }), { other: true, "cf:Scene|s1|Token|t1|Actor|a1": true });
equal("B8 a token actor's dotted uuid round-trips: burnt once, found burnt (the 0.7.0 live defect)", spellDamageRidersFor(riders, ctx({ targetUuid: "Scene.s1.Token.t1.Actor.a1", used: spellRidersBurnUpdate(riders, "Scene.s1.Token.t1.Actor.a1") })).length, 0);
equal("B5 the type match is case-blind", spellDamageRidersFor(riders, ctx({ damageType: "Fire", targetTypes: ["Undead"] })).length, 1);
equal("B6 a rider naming no axes joins every damaging blow", spellDamageRidersFor(declaredSpellDamageRiders([eff("x", { dice: "1d4", damageType: "good" })]), ctx({ damageType: "cold", targetTypes: [] })).length, 1);
ok("B7 the card lines", /<strong>4<\/strong> essence \(Consecrated Flame, 1d6\)/.test(spellRiderLine("Skeleton", riders[0], 4)) && /immune/.test(spellRiderLine("Skeleton", riders[0], 0, true)));

const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
ok("C1 STRUCTURAL: one helper, reached from the attack path after the holy half and from the save path after the second pool", (cast.match(/await applyCasterSpellDamageRiders\(actor, spell, /g) ?? []).length === 2 && /async function applyCasterSpellDamageRiders\(actor, spell, target, \{ damageType, taken, rolls, lines \}\)/.test(cast));
ok("C2 STRUCTURAL: the helper rolls, resolves as the rider's own type, applies, and burns the marker", /const roll = await new Roll\(rider\.dice\)\.evaluate\(\);[\s\S]*?type: rider\.damageType,[\s\S]*?await applyDamageAndCheckDying\(target, packet\.taken, \{\}\)[\s\S]*?setFlag\(SYSTEM_ID, SPELL_RIDERS_USED_FLAG, spellRidersBurnUpdate\(joining, target\?\.uuid \?\? "", used\)\)/.test(cast));
const combat = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs"), "utf8");
ok("C3 STRUCTURAL: the round reset clears the marker", new RegExp(`\\.${SPELL_RIDERS_USED_FLAG}\`\\]: deletionValue\\(\\)`).test(combat));

const EXPECTED = 13;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-caster-damage-riders: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-caster-damage-riders: ${checks} checks — all green.`);
