#!/usr/bin/env node
/**
 * verify-ff30-block25 — 3.658.0, Fiends & Fables 3.0 block 25 (the Shades;
 * Graham, 17 October 2026: "Go with your recommendation").
 *
 *   R2   "Sneak Attack (6d6)" is Sneak Attack (the Shade Stalker)
 *   R6   an aura switched on for a while by its Use, rolling damage and a
 *        critical injury by degree (the Soul Shade's Soul Eclipse)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (...p) => import(pathToFileURL(path.join(SYSTEM_ROOT, "module", ...p)).href);

const R = await imp("rogue.mjs");
const CA = await imp("creature-auras.mjs");
const SW = await imp("aura-switch.mjs");
const ACT = await imp("creature-activation.mjs");

/* ---- R2 ---- */
const ab = (name) => ({ type: "ability", name, system: {} });
const actor = (...names) => ({ items: names.map(ab), system: { skills: { stealth: { ranks: 16 } } } });
equal("B1 Sneak Attack (6d6) is Sneak Attack, its dice from 16 Stealth ranks; a bare Sneak Attack as before; another name is not",
  [R.hasSneakDice(actor("Sneak Attack (6d6)")), R.sneakDiceLabel(actor("Sneak Attack (6d6)")), R.sneakDiceFor(actor("Sneak Attack (6d6)"), 16),
    R.hasSneakDice(actor("Sneak Attack")), R.hasSneakDice(actor("Sneak Attack Training")), R.hasSneakDice(actor("Sneak Attack (fire)"))],
  [true, "Sneak Attack", 6, true, false, false]);

/* ---- R6 ---- */
const eclipse = { id: "aura-soul-eclipse", name: "Soul Eclipse", triggers: ["turnStart"], radius: 5280, save: "fortitude", emitterState: "soul-eclipse",
  damageByDegree: { type: "essence", critical: "2d6", success: "4d6", partial: "4d6", failure: "6d6", fumble: "6d6" },
  criticals: { partial: "minor", failure: "serious", fumble: "deadly" } };
const a = CA.normaliseAura(eclipse, { id: "i", name: "Soul Eclipse" }, 0, 22);
equal("B2 the ladder by degree — a Heroic reads the Critical, a Blunder the Fumble",
  ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => { const e = CA.auraDegreeEffect(a, d); return [e.formula, e.severity]; }),
  [["2d6", null], ["2d6", null], ["4d6", null], ["4d6", "minor"], ["6d6", "serious"], ["6d6", "deadly"], ["6d6", "deadly"]]);
const N = (extra) => CA.normaliseAura({ name: "X", triggers: ["turnStart"], radius: 10, save: "will", ...extra }, { id: "x" }, 0, 1);
equal("B3 a malformed rung or severity is dropped; no type, no table",
  [N({ damageByDegree: { type: "fire", success: "lots", failure: "3d6+2" } }).damageByDegree, N({ damageByDegree: { failure: "3d6" } }).damageByDegree, N({ criticals: { failure: "grievous", fumble: "Deadly" } }).criticals],
  [{ type: "fire", failure: "3d6+2" }, null, { fumble: "deadly" }]);
ok("B4 an aura with only a by-degree ladder is rolled; one with neither is not",
  CA.auraRolls(a) && !CA.auraRolls(CA.normaliseAura({ name: "X", triggers: ["turnStart"], radius: 10, save: "will" }, { id: "x" }, 0, 1)));
equal("B5 the switch, its record and its span", [SW.auraSwitchOf({ flags: { "trg-prime": { creatureAbility: { auraSwitch: { state: "Soul-Eclipse", seconds: 3600 } } } } }),
  SW.auraSwitchOf({ flags: { "trg-prime": { creatureAbility: { auraSwitch: { state: "x" } } } } }), SW.auraSwitchRecord({ state: "soul-eclipse", seconds: 3600 }, 100),
  SW.auraSwitchSpan(3600), SW.auraSwitchSpan(600), SW.auraSwitchSpan(90)],
  [{ state: "soul-eclipse", seconds: 3600 }, null, { state: "soul-eclipse", until: 3700 }, "1 hour", "10 minutes", "90 seconds"]);
const fx = (state, until, disabled = false) => ({ disabled, flags: { "trg-prime": { auraSwitch: { state, until } } } });
equal("B6 live while its time runs, not once it has run out or when disabled",
  [SW.auraSwitchStates([fx("soul-eclipse", 3700)], 3699), SW.auraSwitchStates([fx("soul-eclipse", 3700)], 3700), SW.auraSwitchStates([fx("soul-eclipse", 3700, true)], 0), SW.auraSwitchStates([{ flags: {} }], 0)],
  [["soul-eclipse"], [], [], []]);
{
  const emitter = (states) => [{ id: "e", centreFeet: { x: 0, y: 0 }, widthFeet: 50, states, auras: [a] }];
  const subject = { id: "s", centreFeet: { x: 4000, y: 0 }, widthFeet: 5, immunities: {}, traits: [] };
  equal("B7 a creature 4,000 feet off is caught at its turn start only while the eclipse is on",
    [CA.aurasCatching({ trigger: "turnStart", subject, emitters: emitter(["soul-eclipse"]) }).length, CA.aurasCatching({ trigger: "turnStart", subject, emitters: emitter([]) }).length,
      CA.aurasCatching({ trigger: "enter", subject, emitters: emitter(["soul-eclipse"]) }).length], [1, 0, 0]);
}
ok("B8 an ability with a switch has a Use", ACT.isUsable({ type: "ability", name: "Soul Eclipse", flags: { "trg-prime": { creatureAbility: { auraSwitch: { state: "soul-eclipse", seconds: 3600 } } } } }));

/* ---- source ---- */
const src = { caw: read("module", "creature-aura-workflow.mjs"), act: read("module", "creature-activation-workflow.mjs") };
ok("S1 an emitter's switched-on states join its states; a rolled aura's by-degree ladder is applied, its damage typed and its critical rolled",
  /\.\.\.auraSwitchStates\(Array\.from\(token\.actor\?\.effects \?\? \[\]\), Number\(game\.time\?\.worldTime \?\? 0\)\)/.test(src.caw)
  && /if \(aura\.damageByDegree \|\| aura\.criticals\) \{\n\s+lines\.push\(\.\.\.await applyAuraDegreeEffect\(actor, aura, degree, emitterToken\)\);/.test(src.caw)
  && /const dealt = await applyTypedDamage\(actor, \{ amount, type, sourceLevel: level, sourceName: aura\.name \}\);/.test(src.caw)
  && /await rollCriticalInjury\(emitterToken\?\.actor \?\? actor, \{ targetActor: actor, damageType: type \|\| "bludgeoning", severity, attackBonus: 0 \}\);/.test(src.caw));
ok("S2 the Use lays the switch's effect, restarting one already running, and posts the card",
  /if \(auraSwitchOf\(item\)\) return useAuraSwitch\(actor, item, lines\);/.test(src.act)
  && /if \(old\.length\) await actor\.deleteEmbeddedDocuments\("ActiveEffect", old\);/.test(src.act)
  && /flags: \{ \[SYSTEM_ID\]: \{ \[AURA_SWITCH_FLAG\]: record, spellEffect: true, spellEffectEnd: record\.until \} \}/.test(src.act)
  && /is on for \$\{auraSwitchSpan\(sw\.seconds\)\}/.test(src.act));

// 3.658.1 — found live testing 3.658.0.
const after = read("module", "combat", "declared-after-strikes-workflow.mjs");
ok("S3 a weapon's own after-strike replaces the creature's of the same key when that one does not name the weapon",
  /if \(at < 0\) specs\.push\(spec\);\n\s+else if \(specs\[at\]\.weaponNames\.length && !specs\[at\]\.weaponNames\.includes\(String\(weapon\.name \?\? ""\)\.trim\(\)\.toLowerCase\(\)\)\) specs\[at\] = spec;/.test(after));
ok("S4 a by-degree ladder is not called Unaffected; a darkness aura's card says the GM sets the light",
  /!aura\.damage && !aura\.damageByDegree && !aura\.criticals && !auraTraitEffectLands/.test(src.caw)
  && /emitted\?\.traits\?\.includes\("darkness"\) \? `<p><em>Its darkness is magical: set the scene's light\.<\/em><\/p>`/.test(src.act));
const EXPECTED = 13;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block25: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block25: ${checks} checks\n  all pass\n`);
