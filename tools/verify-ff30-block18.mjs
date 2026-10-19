#!/usr/bin/env node
/**
 * verify-ff30-block18 — 3.651.0, Fiends & Fables 3.0 block 18 (the Hags to
 * the Arcane Lich; Graham, 16 October 2026).
 *
 *   R6   a weapon for grabbed targets only (the Kraken's Bite)
 *   R8   an aura rung's movement limits: difficult ground within its radius,
 *        and "cannot move towards" (the Eclipse Hag's Shifting Aura)
 *   R10  Stealthy Strike on Sneak Attack's rail
 *   R11  Change Shape forms with other speeds, an HP bonus, size without
 *        stats, Strikes they bring, abilities they grant, and after-strikes
 *        gated to forms (Huanling Shifting)
 *   R12  an innate spell's cooldown and a quickened innate (Time Stop 1/minute,
 *        Cold Bolt quickened)
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

const GG = await imp("combat", "grab-gate.mjs");
const AM = await imp("combat", "aura-move-limits.mjs");
const CA = await imp("creature-auras.mjs");
const CS = await imp("change-shape.mjs");
const DA = await imp("combat", "declared-after-strikes.mjs");
const IF = await imp("magic", "innate-frequency.mjs");

/* ---- R6 ---- */
const bite = { name: "Bite", flags: { "trg-prime": { creatureAttack: { onlyGrabbedBySelf: true } } } };
const kraken = { name: "Kraken", uuid: "Actor.K" };
equal("B1 the Bite strikes only a creature the Kraken holds",
  [GG.grabbedOnlyRefusal(bite, { name: "Sailor", grabbed: true, grabbedByUuid: "Actor.K" }, kraken),
    Boolean(GG.grabbedOnlyRefusal(bite, { name: "Sailor", grabbed: true, grabbedByUuid: "Actor.X" }, kraken)),
    Boolean(GG.grabbedOnlyRefusal(bite, { name: "Sailor", grabbed: false }, kraken)),
    Boolean(GG.grabbedOnlyRefusal(bite, null, kraken)),
    GG.grabbedOnlyRefusal({ name: "Tentacle", flags: {} }, { name: "Sailor" }, kraken)],
  ["", true, true, true, ""]);

/* ---- R8 ---- */
const shifting = CA.normaliseAura({ name: "Shifting Aura", radius: 30, save: "will", triggers: ["turnStart", "enter"],
  conditions: { fumble: [{ key: "immobilised", rounds: 1 }] }, moveLimits: { success: "difficult", partial: "noApproach", failure: "noApproach", critical: "bogus" } }, {}, 0, 15);
equal("B2 the rungs' limits are read, a bogus one dropped, and the aura now rolls",
  [shifting.moveLimits, CA.auraRolls(shifting), CA.auraRolls(CA.normaliseAura({ name: "X", radius: 30, save: "will", triggers: ["enter"] }, {}, 0, 1)),
    CA.auraRolls(CA.normaliseAura({ name: "Y", radius: 30, save: "will", triggers: ["enter"], moveLimits: { failure: "noApproach" } }, {}, 0, 1))],
  [{ success: "difficult", partial: "noApproach", failure: "noApproach" }, true, false, true]);
equal("B3 which rung lays which limit; a Blunder reads the Fumble, a Heroic the Critical",
  ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => AM.moveLimitFor({ success: "difficult", failure: "noApproach", fumble: "noApproach" }, d)),
  ["", "", "difficult", "", "noApproach", "noApproach", "noApproach"]);
equal("B4 the limit belongs to the creature's turn in progress, or its next",
  [AM.limitTurn({ round: 3, turn: 2, ownTurnIndex: 2, acting: true }), AM.limitTurn({ round: 3, turn: 1, ownTurnIndex: 4 }), AM.limitTurn({ round: 3, turn: 4, ownTurnIndex: 1 })],
  [3, 3, 4]);
equal("B5 inside the radius each square entered costs 5 feet more; the origin and squares outside cost nothing extra",
  [AM.difficultSurchargeFeet([10, 15, 25, 30, 35, null], 30), AM.difficultSurchargeFeet([40, 35], 30)],
  [15, 0]);
const noApp = AM.auraMoveLimitRecord({ kind: "noApproach", emitterName: "Eclipse", radiusFeet: 30, label: "Shifting Aura", forRound: 3 });
equal("B6 a move that ends nearer is refused; level or away is not; only on the turn named",
  [Boolean(AM.approachRefusal(noApp, 20, 15, "Hero")), AM.approachRefusal(noApp, 20, 20, "Hero"), AM.approachRefusal(noApp, 20, 30, "Hero"),
    AM.approachLimitLive(noApp, { round: 3, acting: true }), AM.approachLimitLive(noApp, { round: 4, acting: true }), AM.approachLimitLive(noApp, { round: 3, acting: false })],
  [true, "", "", true, false, false]);
equal("B7 an unknown kind lays nothing", AM.auraMoveLimitRecord({ kind: "slow" }), null);

/* ---- R11 ---- */
const forms = CS.changeShapeForms({ forms: [
  { key: "humanoid", label: "Humanoid", own: true },
  { key: "spider", label: "Spider", size: "large", keepStats: true, hpBonus: 25, speeds: { climb: 25 }, loses: ["Slam"], equips: ["Bite"], grants: [] },
  { key: "tiger", label: "Tiger", size: "large", keepStats: true, hpBonus: 25, loses: ["Slam"], equips: ["Bite", "Claw"], grants: ["Pouncing Assault", "Stealthy Strike"] }
] });
const spider = CS.changeShapeEffectData(forms[1], { baseLand: 25, baseSpeeds: { climb: 0 }, baseSize: "medium", itemName: "Huanling Shifting" });
equal("B8 a form's other speeds, its HP and its size — the stats kept at the creature's own size",
  [spider.changes, spider.flags["trg-prime"].changeShapeForm],
  [[{ key: "system.combat.movement.climb.other", type: "custom", value: "25", priority: 20 },
    { key: "system.resources.hp.other", type: "add", value: "25", priority: 20 },
    { key: "system.identity.size", type: "override", value: "large", priority: 50 }],
   { key: "spider", loses: ["Slam"], equips: ["Bite"], statSize: "medium" }]);
equal("B9 the stats' size is the creature's own while such a form holds; otherwise its size",
  [CS.statSizeOf([{ flags: spider.flags }], "large"), CS.statSizeOf([], "large"), CS.statSizeOf([{ disabled: true, flags: spider.flags }], "large"),
    CS.statSizeOf([{ flags: { "trg-prime": { changeShapeForm: { key: "wolf" } } } }], "large")],
  ["medium", "large", "large", "large"]);
equal("B10 the current form's key, or its own",
  [CS.currentFormKey([{ flags: spider.flags }]), CS.currentFormKey([])], ["spider", "own"]);
equal("B11 a form's grants and equips survive normalising; the summary names them",
  [forms[2].grants, forms[2].equips, /gains Pouncing Assault, Stealthy Strike/.test(CS.changeShapeSummary(forms[2], 25)), /\+25 HP/.test(CS.changeShapeSummary(forms[2], 25))],
  [["Pouncing Assault", "Stealthy Strike"], ["Bite", "Claw"], true, true]);
const venom = DA.declaredAfterStrikes([{ name: "Bite", flags: { "trg-prime": { afterStrikes: [{ key: "huanling-venom", label: "Huanling Venom", requiresForm: ["spider", "serpent"], expose: { affliction: "Huanling Venom", level: "actorLevel" } }] } } }])[0];
equal("B12 the Venom fires from the spider and serpent only",
  ["spider", "serpent", "tiger", "own", undefined].map((form) => DA.declaredAfterStrikeFires(venom, { weaponName: "Bite", form })),
  [true, true, false, false, false]);

/* ---- R12 ---- */
const tstop = { system: { innate: true }, flags: { "trg-prime": { innateCooldownSeconds: 60, innateCooldownUntil: 1060 } } };
equal("B13 Time Stop waits out its minute",
  [IF.innateCooldownSeconds(tstop), IF.innateCooldownLeft(tstop, 1000), IF.innateCooldownLeft(tstop, 1060), IF.innateCooldownUntil(tstop, 2000),
    IF.innateCooldownLeft({ system: { innate: false }, flags: tstop.flags }, 1000)],
  [60, 60, 0, 2060, 0]);
const cold = { system: { innate: true }, flags: { "trg-prime": { innateQuickened: true } } };
equal("B14 a quickened innate costs 1 AP less, never below 1; anything else is unchanged",
  [IF.quickenedInnateAP(cold, 2), IF.quickenedInnateAP(cold, 1), IF.quickenedInnateAP(cold, "reaction"), IF.quickenedInnateAP({ system: { innate: true }, flags: {} }, 2)],
  [1, 1, "reaction", 2]);

/* ---- 3.651.1, found live ---- */
equal("B15 a form's token side is its size's footprint; its own form, or one with no size, keeps the token",
  [CS.formTokenSize(forms[1], { large: 2 }), CS.formTokenSize(forms[0], { large: 2 }), CS.formTokenSize({ key: "x", size: "", own: false }, { large: 2 })],
  [2, null, null]);

/* ---- wiring ---- */
const src = {
  atk: read("module", "combat", "attack-workflow.mjs"),
  rog: read("module", "rogue.mjs"),
  aw: read("module", "creature-aura-workflow.mjs"),
  mv: read("module", "combat", "movement-workflow.mjs"),
  cw: read("module", "codex-actions-workflow.mjs"),
  act: read("module", "documents", "actor.mjs"),
  dasw: read("module", "combat", "declared-after-strikes-workflow.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs")
};
ok("S1 the grabbed-only gate refuses before the Strike", /const \{ grabbedOnlyRefusal \} = await import\("\.\/grab-gate\.mjs"\);[\s\S]{0,400}if \(refusal\) \{ ui\.notifications\.warn\(refusal\); return null; \}/.test(src.atk));
ok("S2 Stealthy Strike rides Sneak Attack's dice, its offer and its card",
  /if \(hasSneakDice\(actor\) && sneakTargetQualifies &&/.test(src.atk) && /const sneakOffered = hasSneakDice\(actor\) && sneakAttackWeaponEligible/.test(src.atk)
  && /<strong>\$\{sneakDiceLabel\(actor\)\}<\/strong>/.test(src.atk)
  && /return hasSneakAttack\(actor\) \|\| hasStealthyStrike\(actor\);/.test(src.rog));
ok("S3 an aura rung lays its movement limit", /const kind = moveLimitFor\(aura\.moveLimits, degree\?\.key \?\? "failure"\);\n\s+if \(kind\) lines\.push\(await layAuraMoveLimit\(actor, kind, aura, emitterToken\)\);/.test(src.aw));
ok("S4 the movement hook refuses an approach and charges the difficult ground",
  /if \(auraLimits\.refusal\) \{\n\s+ui\.notifications\.warn\(`\$\{auraLimits\.refusal\}\.`\);\n\s+return false;/.test(src.mv)
  && /\+ Math\.max\(0, Number\(auraLimits\.surcharge\) \|\| 0\);/.test(src.mv)
  && /record\.kind === "difficult" && movementAction\(movement\) !== "fly"/.test(src.mv));
ok("S5 Change Shape grants a form's abilities and swaps its Strikes",
  /const granted = await grantFormAbilities\(actor, form\.grants \?\? \[\]\);\n\s+if \(granted\.ids\.length\) data\.flags\[SYSTEM_ID\]\.grantedItems = granted\.ids;/.test(src.cw)
  && /"system\.equipped": \(form\.equips \?\? \[\]\)\.includes\(i\.name\)/.test(src.cw)
  && /"system\.equipped": lost\.includes\(i\.name\)/.test(src.cw));
ok("S6 a keep-stats form's statistics are figured at the creature's own size",
  /const sizeEntry = SIZE_TABLE\[statSizeOf\(actor\?\.effects, system\.identity\?\.size\)\] \?\? null;/.test(src.act)
  && /size: statSizeOf\(actor\?\.effects, system\.identity\?\.size\),/.test(src.act));
ok("S7 the after-strike knows the attacker's form", /form: currentFormKey\(actor\.effects\),/.test(src.dasw));
ok("S8 an innate's clock refuses, and starts when it is cast; a quickened innate's AP",
  /const left = innateCooldownLeft\(spell, Number\(game\.time\?\.worldTime \?\? 0\)\);\n\s+if \(left > 0\) \{/.test(src.cast)
  && /\[`flags\.\$\{SYSTEM_ID\}\.\$\{INNATE_COOLDOWN_FLAG\}`\]: innateCooldownUntil\(spell/.test(src.cast)
  && /const effCastAP = quickenedInnateAP\(spell, apMode\?\.ap \?\? spellData\.castAP\);/.test(src.cast));

ok("S9 the token takes the form's footprint — not judged by its animating width (3.651.2) — and its own size back, carried from form to form",
  /if \(side && own\) \{\n\s+data\.flags\[SYSTEM_ID\]\[CHANGE_SHAPE_FLAG\]\.priorTokenSize = Number\(priorTokenSize\) \|\| Number\(own\.width\) \|\| 1;\n\s+await resizeActorTokens\(actor, side\);/.test(src.cw)
  && /if \(Number\(was\.priorTokenSize\) > 0\) \{ priorTokenSize = Number\(was\.priorTokenSize\); await resizeActorTokens\(actor, priorTokenSize\); \}/.test(src.cw)
  && /for \(const doc of actor\.getActiveTokens\?\.\(false, true\) \?\? \[\]\) \{\n\s+if \(doc\?\.update\) await resizeTokenInPlace\(doc, side\);/.test(src.cw));
ok("S10 a rung that limits movement is not called Unaffected", /&& !aura\.moveLimits\?\.\[String\(degree\?\.key \?\? "failure"\)\]\) \{/.test(src.aw));

const EXPECTED = 26;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block18: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block18: ${checks} checks\n  all pass\n`);
