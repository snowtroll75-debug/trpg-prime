#!/usr/bin/env node
/**
 * verify-rolled-auras-sunlight — 3.627.0, Graham's two rulings of 7 Oct 2026
 * for Pillars of Faith Chapter 9: an aura that declares its conditions has
 * its save ROLLED and those conditions applied (core auras stay as cards);
 * and sunlight is what the GM marks on the scene or the token, after which
 * Sunlight Weakness applies, lifts, and suppresses a sun-shy Fast Healing.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const ca = await import(new URL("../module/creature-auras.mjs", import.meta.url));
const stench = ca.normaliseAura({
  id: "ghast", name: "Ghast Stench", kind: "save", radius: 10, triggers: ["turnStart", "enter"], save: "fortitude",
  livingOnly: true, immunityOn: "success", immunitySeconds: 60, traits: ["Aura", "Poison"],
  outcomes: { failure: "sickened 1", fumble: "sickened 1 and slowed 1 while sickened" },
  conditions: { failure: [{ key: "sickened", value: 1 }], fumble: [{ key: "sickened", value: 1 }, { key: "slowed", value: 1, endsWith: "sickened" }] }
}, { id: "f", name: "Ghast Stench" });
equal("A1 the declared fields survive normalising", [stench.livingOnly, stench.immunityOn, stench.traits, Object.keys(stench.conditions)], [true, "success", ["aura", "poison"], ["failure", "fumble"]]);
const card = ca.normaliseAura({ id: "fa", name: "Frightful Aura", radius: 30, triggers: ["enter"], save: "will", outcomes: { failure: "frightened 3" }, immunitySeconds: 60 }, {});
equal("A2 an aura that declares no conditions does not roll — the Codex's stay cards; one that does, rolls", [ca.auraRolls(card), ca.auraRolls(stench), card.immunityOn, card.livingOnly], [false, true, "always", false]);
equal("A3 a Fumble: sickened, and slowed for as long as it stays sickened", ca.auraOutcomeTags(stench, "fumble").tags, [{ key: "sickened", value: 1, resave: false }, { key: "slowed", value: 1, endsWith: "sickened", resave: false }]);
equal("A4 a Blunder reads the Fumble's row, a Partial the Failure's, a Success nothing", [ca.auraOutcomeTags(stench, "blunder").tags.length, ca.auraOutcomeTags(stench, "partial").tags.map((t) => t.key), ca.auraOutcomeTags(stench, "success").tags], [2, ["sickened"], []]);
const despair = ca.normaliseAura({ id: "despair", name: "Aura of Despair", radius: 30, triggers: ["turnStart", "enter"], save: "will", partialImmunity: { to: "paralyzed", seconds: 86400 },
  conditions: { failure: [{ key: "frightened", value: 3 }, { key: "paralyzed", rounds: 1 }], blunder: [{ key: "zeroHP" }, { key: "unconscious" }] } }, {});
equal("A5 under the partial window the paralysis is dropped and the fear kept", ca.auraOutcomeTags(despair, "failure", { immuneToPartial: true }).tags.map((t) => t.key), ["frightened"]);
equal("A6 without it both land, the paralysis on a one-round clock", ca.auraOutcomeTags(despair, "failure", { combatRound: 3 }).tags, [{ key: "frightened", value: 3, resave: false }, { key: "paralyzed", value: null, expiresRound: 4, resave: false }]);
equal("A7 the Blunder's collapse is carried as zeroHP", ca.auraOutcomeTags(despair, "blunder").tags.some((t) => t.zeroHP === true), true);
equal("A8 'a creature that SAVES is immune' opens only on a success; the default opens regardless", [ca.auraImmunityOpens(stench, true), ca.auraImmunityOpens(stench, false), ca.auraImmunityOpens(card, false)], [true, false, true]);
const aw = read("module", "creature-aura-workflow.mjs");
ok("A9 announcing a rolled aura rolls it and says the result on the same card", /const rolled = auraRolls\(aura\) \? await rollAuraSave\(subjectToken, aura, emitterToken\) : null;\s*if \(rolled\) lines\.push/.test(aw));
ok("A10 the save is the emitter's Level DC unless one is printed, and carries the aura's traits", /const dc = aura\.dc \|\| levelDC\(emitterLevel\);/.test(aw) && /traits: aura\.traits\.join\(", "\)/.test(aw));
ok("A11 a creature that is not living is passed over, with no window opened", /if \(!isLivingCreature\(actor\?\.system \?\? \{\}\)\) \{\s*return \{ lines: \[[^\n]*\], succeeded: false, skipped: true \};/.test(aw) && /if \(rolled\?\.skipped\) \{/.test(aw));
ok("A12 a rolled aura's whole window follows the declared rule", /\} else if \(rolled && aura\.immunitySeconds > 0\) \{\s*[\s\S]{0,200}if \(auraImmunityOpens\(aura, rolled\.succeeded\)\) \{/.test(aw));

const su = await import(new URL("../module/sunlight.mjs", import.meta.url));
equal("B1 the token's word wins, then the scene's, else nobody has said", [
  su.sunlightState({ sceneFlag: "sunlit", tokenFlag: "shade" }), su.sunlightState({ sceneFlag: "dark", tokenFlag: "sun" }),
  su.sunlightState({ sceneFlag: "sunlit" }), su.sunlightState({ sceneFlag: "dark" }), su.sunlightState({})], ["shade", "sun", "sun", "shade", "unknown"]);
equal("B2 leaving the sun restores what was held before", su.sunlightRestore({ injured: 1, slowed: 0 }, { injured: 2, slowed: 2 }), { injured: 1, slowed: 0 });
equal("B3 a condition raised past the sun's by something else is left alone", su.sunlightRestore({ injured: 0, slowed: 0 }, { injured: 4, slowed: 2 }), { slowed: 0 });
equal("B4 a sun-shy rate is recognised", [su.suppressedInSunlight({ flags: { "trg-prime": { suppressedInSunlight: true } } }), su.suppressedInSunlight({ flags: {} })], [true, false]);
const ts = read("module", "creature-turn-start-workflow.mjs");
ok("B5 at turn start: applied in the sun, lifted in the shade, the old card only where nobody has said", /if \(state === "sun"\) \{ await applySunlightAtTurnStart\(tokenDocument, a\); continue; \}\s*if \(state === "shade"\) \{ await liftSunlight\(actor, "begins its turn out of the sun"\); continue; \}/.test(ts));
const sw = read("module", "sunlight-workflow.mjs");
ok("B6 the weakness records what it replaced and is applied once", /if \(!actor\.getFlag\?\.\(SYSTEM_ID, SUNLIGHT_STATE_FLAG\)\?\.active\) \{\s*const before = /.test(sw) && /await actor\.setFlag\(SYSTEM_ID, SUNLIGHT_STATE_FLAG, \{ active: true, before, source: announcement\.ability \}\);/.test(sw));
ok("B7 a scene or token marked out of the sun lifts it at once", /Hooks\.on\("updateScene"/.test(sw) && /Hooks\.on\("updateToken"/.test(sw) && /if \(sunlightStateOfToken\(tokenDocument\) !== "sun"\) await liftSunlight\(actor, reason\);/.test(sw));
const cb = read("module", "documents", "combat.mjs");
ok("B8 Fast Healing that the sun suppresses heals nothing in the sun", /\.filter\(\(e\) => !\(sunlit && suppressedInSunlight\(e\)\)\)/.test(cb) && /\|\| sunlightStateOfToken\(combatant\?\.token\) === "sun";/.test(cb));
ok("B9 the hooks are registered at init", /registerSunlightHooks\(\);/.test(read("scripts", "trg-prime.mjs")));

const EXPECTED = 22;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-rolled-auras-sunlight: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-rolled-auras-sunlight: ${checks} checks — all green.`);
