#!/usr/bin/env node
/**
 * verify-ea-block7-core — TRG Prime 3.685.0: the seams Eldritch Arts' Block 7
 * needs (H1–H11 of ELDRITCH_ARTS_BLOCK7_AUDIT.md §7, approved by Graham on
 * 7 November 2026 with Q151–Q166 "as proposed"), and the two §7 checks that
 * failed and so became seams (a dispel modifier's bias; a damage reaction's
 * weakness). Every seam is default-off: a row, answer or flag that does not
 * use the new shape reads as it did.
 *
 *   H1  spell thorns: the cast's Save DC, "+ caster level, max N", a ladder
 *   H2  caster-level steps on effect rows, a duration and an area
 *   H3  saves on a turn boundary: entry check at turn start; area ladder at
 *       the caster's turn (m100); a target's ladder at its turns (Q156)
 *   H4  a fly Speed of land Speed + N, grown by a bonus warp
 *   H5  cast reactions: exclude, turnBack, the Save DC in ctx
 *   H6  a check reaction makes a hit a miss
 *   H7  a critical reaction after the roll lowers the severity (Q151)
 *   H8  zone casting: gate disadvantage, the innate check (Q154), the
 *       Concentration DC rise
 *   H9  lent metamagic (Q163); a free warp that still raises the Save DC (Q162)
 *   H10 a strike rider that replaces the weapon's damage (Q161)
 *   H11 an effect that ends when its bearer regains HP (Q160)
 *   K   the §7 checks: dispel bias (seam), damage-reaction weakness (seam),
 *       a spell effect as a fallReduction carrier (holds already)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

const DialogV2 = { wait: async () => null, confirm: async () => false, prompt: async () => null };
globalThis.foundry = { applications: { api: { DialogV2 }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false,
  mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), deepClone: (x) => structuredClone(x), escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.Hooks = { on() {}, once() {}, off() {}, callAll() {}, call() { return true; } };
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => d };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
globalThis.CONFIG = { statusEffects: [], specialStatusEffects: {} };
let userTargets = new Set();
globalThis.game = { settings: { get: () => null }, user: { id: "u", isGM: true, get targets() { return userTargets; }, updateTokenTargets(ids) { userTargets = new Set([...tokens].filter((t) => ids.includes(t.id))); } }, users: [], combat: null, time: { worldTime: 0 } };
const tokens = [];
globalThis.canvas = { tokens: { placeables: tokens }, scene: { regions: [] } };
const docs = new Map();
globalThis.fromUuid = async (u) => docs.get(u) ?? null;

const src = {
  cw: read("module", "magic", "cast-workflow.mjs"), se: read("module", "magic", "spell-effects.mjs"), cb: read("module", "documents", "combat.mjs"),
  aw: read("module", "combat", "attack-workflow.mjs"), tw: read("module", "magic", "thorns-workflow.mjs"), api: read("module", "module-api.mjs"),
  ce: read("module", "conditions", "condition-events-workflow.mjs"), acw: read("module", "combat", "action-workflow.mjs"), mmw: read("module", "magic", "module-metamagic-workflow.mjs")
};

// ── H1 ────────────────────────────────────────────────────────────────────
{
  const T = await imp("magic/thorns.mjs");
  const glyph = T.normaliseThorns({ damage: "1d6", damageType: "sonic", save: { key: "fortitude", dc: "spell" }, casterLevelBonus: { max: 15 } });
  const cast = T.normaliseThorns(T.spellThorns(glyph, { saveDC: 22, casterLevel: 20, spellName: "Glyph of Retribution" }));
  const again = T.normaliseThorns(T.spellThorns(cast, { saveDC: 99, casterLevel: 3 }));
  equal("H1 Glyph of Retribution: the save at the cast's DC (22), \"+1 per caster level (maximum +15)\" folded in once (CL 20 → +15), and a stamped row read again is not grown again",
    [glyph.saveRoll.dc, glyph.saveRoll.dcFrom, cast.damage, cast.saveRoll.dc, cast.saveRoll.basic, again.damage, T.normaliseThorns(T.spellThorns(glyph, { saveDC: 22, casterLevel: 4 })).damage],
    [0, "spell", "1d6+15", 22, true, "1d6+15", "1d6+4"]);
  // STAMPED ONCE EVEN WHEN NOTHING WAS ADDED: a CL 0 cast read again later at CL 20 stays 1d6.
  equal("H1a a row stamped at caster level 0 is not grown when it is read again", T.normaliseThorns(T.spellThorns(T.normaliseThorns(T.spellThorns(glyph, { saveDC: 20, casterLevel: 0 })), { saveDC: 20, casterLevel: 20 })).damage, "1d6");
  const guard = T.normaliseThorns({ damageType: "", save: { key: "fortitude", dc: "spell" }, ladder: { critical: [], success: [{ kind: "condition", condition: "dazzled" }], partial: [{ kind: "condition", condition: "dazzled", rounds: 1 }], failure: [{ kind: "condition", condition: "blinded" }], fumble: [{ kind: "condition", condition: "blinded", permanent: true }] } });
  equal("H1b Prismatic Guard: a condition ladder in place of damage, its save not basic; each degree reads its rung, a Heroic the Critical's, a Blunder the Fumble's (m42); a ladder with no rolled save is refused",
    [Boolean(guard), guard.saveRoll.basic, ...["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => [T.thornsLadderRows(guard, d).at, T.thornsLadderRows(guard, d).rows.length]),
      T.normaliseThorns({ damageType: "", ladder: { failure: [] } })],
    [true, false, ["critical", 0], ["critical", 0], ["success", 1], ["partial", 1], ["failure", 1], ["fumble", 1], ["fumble", 1], null]);
  const vibrant = { kind: "thorns", label: "Vibrant Thorns", damage: "1", intensified: "1d6", damageType: "piercing", reachFeet: 5 };
  equal("H1c a thorns row with none of it (Vibrant Thorns) is what it was, cast or not; a normalised rolled save survives being read back (the spell path stores it normalised)",
    [T.normaliseThorns(vibrant), T.normaliseThorns(T.spellThorns(T.normaliseThorns(vibrant), { saveDC: 20, casterLevel: 9 }))?.damage,
      T.normaliseThorns(T.normaliseThorns({ damage: "2d6", damageType: "acid", save: { key: "reflex", dc: 21 } }))?.saveRoll?.dc],
    [{ label: "Vibrant Thorns", damage: "1", intensified: "1d6", damageType: "piercing", reachFeet: 5, save: "", saveRoll: null, reaction: false, criticalOnly: false }, "1", 21]);
  ok("H1d the cast stamps its Save DC and caster level; the workflow rolls at the stamped DC and applies a ladder's rows to the attacker through the spell engine",
    /const spec = normaliseThorns\(spellThorns\(normaliseThorns\(warpedThorns\(effect, warpBonus\)\), \{\n\s+saveDC: Number\(saveDC \?\? rollData\?\.saveDC \?\? 0\) \|\| 0,\n\s+casterLevel: Number\(rollData\?\.casterLevel \?\? casterLevelOf\(caster\?\.system\)\) \|\| 0,/.test(src.se)
    && /if \(spec\.ladder && !spec\.damage\) \{\n\s+lines\.push\(\.\.\.await applyThornsLadder\(attacker, defender, spec\)\);/.test(src.tw)
    && /const dc = thornsSaveDC\(spec, defender, levelDC\);/.test(src.tw)
    && /await applySpellEffects\(defender, \{ name: spec\.spellName \|\| spec\.label[^\n]+\{\n\s+targets: \[attacker\], effects: rows/.test(src.tw));
}

// ── H2 ────────────────────────────────────────────────────────────────────
{
  const C = await imp("magic/caster-level-mods.mjs");
  const brittle = [{ threshold: 4, recurring: true, rows: [{ match: { kind: "bonus", slot: "dr" }, add: { value: 1 } }, { match: { kind: "thorns" }, add: { damage: "1d4" } }] }];
  const rows = [{ kind: "bonus", slot: "dr", value: 1 }, { kind: "thorns", damage: "1d4", damageType: "piercing" }, { kind: "note", text: "x" }];
  equal("H2 Brittleskin (\"CL 4+: the DR increases by 1 and the damage increases by 1d4\", recurring): CL 3 nothing, CL 4 DR 2 and 2d4, CL 8 DR 3 and 3d4; rows are copied, not written",
    [C.casterLevelRows(rows, C.applyCasterLevelMods(brittle, 3)), C.casterLevelRows(rows, C.applyCasterLevelMods(brittle, 4)).slice(0, 2), C.casterLevelRows(rows, C.applyCasterLevelMods(brittle, 8)).slice(0, 2), rows[0].value],
    [rows, [{ kind: "bonus", slot: "dr", value: 2 }, { kind: "thorns", damage: "2d4", damageType: "piercing" }], [{ kind: "bonus", slot: "dr", value: 3 }, { kind: "thorns", damage: "3d4", damageType: "piercing" }], 1]);
  const invoke = [{ threshold: 8, rows: [{ match: { kind: "moduleMark", label: "Invoke True Name" }, add: { value: 2 } }] }];
  equal("H2b Invoke True Name (Q164: once, at CL 8: −4): a negative value grows away from 0; a non-recurring step is taken once; a match by label",
    [C.casterLevelRows([{ kind: "moduleMark", label: "Invoke True Name", value: -2 }], C.applyCasterLevelMods(invoke, 16))[0].value,
      C.casterLevelRows([{ kind: "moduleMark", label: "Other", value: -2 }], C.applyCasterLevelMods(invoke, 16))[0].value], [-4, -2]);
  const felt = [{ threshold: 4, recurring: true, duration: { amount: 1, unit: "hours" }, areaFeet: 20 }];
  const r9 = C.applyCasterLevelMods(felt, 9);
  equal("H2c Feltwarp (\"CL 4+: +1 hour\"): 1 hour at CL 9 is 3 hours; a duration in another unit is left as printed; an area grows 20 ft a step; the card says so",
    [C.casterLevelDuration("1 hour", r9.duration), C.casterLevelDuration("1 minute", r9.duration), r9.areaFeet, C.describeCasterLevelMods(r9)],
    ["3 hours", "1 minute", 40, "+2 hours duration, +40 ft area"]);
  const plain = C.applyCasterLevelMods([{ threshold: 4, recurring: true, damageDice: "1d6" }], 8);
  ok("H2d default-off: an entry without the new fields gives no rows, no duration, no area, and its rows pass through untouched (the same array)",
    plain.rows.length === 0 && plain.duration === null && plain.areaFeet === 0 && C.casterLevelRows(rows, plain) === rows && plain.damageDice === "2d6");
  ok("H2e the cast hands the effect engine its stepped rows and duration, and the area step joins the warp's area growth",
    /effects: casterLevelRows\(\(wallDissipated \? [^\n]+\n\s+\.filter\(\(r\) => !\(selfShapeBlocked && r\?\.target === "self"\)\), clMods\),/.test(src.cw)
    && /\? \{ durationOverride: casterLevelDuration\(spellData\.duration, clMods\.duration\) \}/.test(src.cw)
    && /const clArea = applyCasterLevelMods\(spellData\?\.casterLevelMods, casterLevel\)\.areaFeet;\n\s+if \(clArea > 0\) warpMods\.areaGrowth = \(Number\(warpMods\.areaGrowth\) \|\| 0\) \+ clArea;/.test(src.cw));
}

// ── H3 ────────────────────────────────────────────────────────────────────
{
  const L = await imp("magic/turn-ladder.mjs");
  const E = await imp("magic/entry-check.mjs");
  const bubble = L.normaliseTurnLadder({ kind: "turnLadder", save: "will", on: "casterTurnStart", atCast: true, replace: "worse", stopAt: "failure",
    degrees: { critical: { unaffected: true }, success: { rows: [{ kind: "condition", condition: "dazed" }] }, partial: { rows: [{}] }, failure: { rows: [{ kind: "condition", condition: "fixated" }] }, fumble: { rows: [{}, {}] } } });
  const s = (prev, rolled) => { const x = L.turnLadderStep(bubble, prev, rolled); return [x.at, x.apply, x.replaceOld, x.record]; };
  equal("H3 Bubble Buffet (m100): a first result takes hold; a later better one leaves the worse standing; a later worse one replaces it; a creature that failed rolls no more",
    [s(null, "success"), s("partial", "success"), s("success", "fumble"), L.turnLadderRollsAgain(bubble, "partial"), L.turnLadderRollsAgain(bubble, "failure"), L.turnLadderRollsAgain(bubble, "fumble"), L.turnLadderRollsAgain(bubble, null)],
    [["success", true, false, "success"], ["success", false, false, "partial"], ["fumble", true, true, "fumble"], true, false, false, true]);
  const blossom = L.normaliseTurnLadder({ kind: "turnLadder", save: "fortitude", on: "targetTurnStart",
    degrees: { critical: { endsSpell: true }, success: { dice: "1d12", rows: [] }, failure: { dice: "2d12", rows: [{ kind: "condition", condition: "immobilised" }] }, fumble: { dice: "4d12", rows: [{ kind: "condition", condition: "petrified" }] } } });
  const b = (prev, rolled) => { const x = L.turnLadderStep(blossom, prev, rolled); return [x.at, x.apply, x.replaceOld, x.endsSpell, x.rung?.dice ?? ""]; };
  equal("H3b Flesh to Blossom (Q156): each later save replaces the last — Success 1d12 and the immobilised goes, Failure 2d12 + immobilised, a Critical ends the spell, a Partial reads at Failure (m42); it always rolls again",
    [b("failure", "success"), b("success", "failure"), b("failure", "critical"), b(null, "partial"), L.turnLadderRollsAgain(blossom, "fumble")],
    [["success", true, true, false, "1d12"], ["failure", true, true, false, "2d12"], ["critical", true, true, true, ""], ["failure", true, false, false, "2d12"], true]);
  equal("H3c refused: an unknown save or moment, bad dice, no rungs; `atCast` only for an area",
    [L.normaliseTurnLadder({ kind: "turnLadder", save: "luck", on: "casterTurnStart", degrees: { failure: {} } }), L.normaliseTurnLadder({ kind: "turnLadder", save: "will", on: "whenever", degrees: { failure: {} } }),
      L.normaliseTurnLadder({ kind: "turnLadder", save: "will", on: "targetTurnStart", degrees: { failure: { dice: "lots" } } }), L.normaliseTurnLadder({ kind: "turnLadder", save: "will", on: "targetTurnStart", degrees: {} }),
      L.normaliseTurnLadder({ kind: "turnLadder", save: "will", on: "targetTurnStart", atCast: true, degrees: { failure: {} } })?.atCast],
    [null, null, null, null, false]);
  const myc = E.normaliseEntryCheck({ kind: "entryCheck", save: "reflex", atTurnStart: true, degrees: { failure: { rows: [] } } });
  const web = E.normaliseEntryCheck({ kind: "entryCheck", skills: ["athletics"], degrees: { failure: { rows: [] } } });
  equal("H3d Arcane Mycelium: an entry check may also be asked at the start of a turn inside; one that does not say so (Web) is asked only on movement",
    [myc.atTurnStart, web.atTurnStart ?? null], [true, null]);
  ok("H3e the turn-start pass asks both, beside the recurring ladder; the entry roll is one function for both moments, and at a turn's start nothing is pushed back or barred",
    /const \{ applyTurnStartEntryChecks \} = await import\("\.\.\/magic\/entry-check-workflow\.mjs"\);\n\s+await applyTurnStartEntryChecks\(actor, combatant\.token\?\.object \?\? null\);\n\s+const \{ applyTurnLadders \} = await import\("\.\.\/magic\/turn-ladder-workflow\.mjs"\);/.test(src.cb)
    && /await rollEntryCheckFor\(\{ tokenDocument, mover, region, spec, raw, points, entered, inside, centre, now, bars, turnKey \}\);/.test(read("module", "magic", "entry-check-workflow.mjs"))
    && /if \(outcome\.pushBack && !atTurnStart\) \{/.test(read("module", "magic", "entry-check-workflow.mjs"))
    && /const bar = atTurnStart \? null : entryBarFor/.test(read("module", "magic", "entry-check-workflow.mjs")));
  ok("H3f the cast records an area's ladder on its Region (rolled at the cast for those caught), a target's on each creature its row reaches with its first degree; the Region is claimed",
    /if \(row\?\.kind !== "turnLadder" \|\| String\(row\?\.on \?\? ""\) !== "casterTurnStart" \|\| !placedArea\?\.regionId\) continue;/.test(src.cw)
    && /caught: Array\.isArray\(areaTargets\) \? areaTargets : \[\]/.test(src.cw)
    && /case "turnLadder": \{\n\s+if \(String\(effect\.on \?\? ""\) !== "targetTurnStart"\) break;/.test(src.se)
    && /const first = \(Array\.isArray\(saveResults\) \? saveResults : \[\]\)\.find\(\(r\) => r\?\.target === target\)\?\.degree \?\? null;/.test(src.se)
    && /"turnLadder"\n\]\);/.test(read("module", "magic", "area-region-life.mjs")));
  const ARL = await imp("magic/area-region-life.mjs");
  equal("H3f2 the Region outlives the cast for a turn ladder (and not for a spell without one)",
    [ARL.areaRegionIsClaimed({ effects: [{ kind: "turnLadder", on: "casterTurnStart" }] }), ARL.areaRegionIsClaimed({ effects: [{ kind: "note" }] })], [true, false]);
  const tlw = read("module", "magic", "turn-ladder-workflow.mjs");
  ok("H3g a new result removes the effects the cast left on that creature (not the marker), lands its rows with the cast's id, and an ending rung ends the cast; a target's ladder stops when its cast is no longer running",
    /if \(step\.replaceOld && castId\) \{\n\s+const old = castEffectsOn\(creature, castId\)/.test(tlw)
    && /!e\?\.flags\?\.\[SYSTEM_ID\]\?\.\[TURN_LADDER_FLAG\]/.test(tlw)
    && /await applySpellEffects\(caster \?\? creature, spell, \{ targets: \[creature\], effects: rung\.rows, lines: applied, saveDC: dc, castId \}\);/.test(tlw)
    && /ended = Boolean\(await endActiveSpell\(caster, castId, \{ dismissed: false \}\)\);/.test(tlw)
    && /if \(!getActiveSpells\(caster\)\.some\(\(e\) => e\.id === record\.castId\)\) \{\n\s+await marker\.delete\(\)/.test(tlw));
}

// ── H4 ────────────────────────────────────────────────────────────────────
{
  const G = await imp("combat/granted-speeds.mjs");
  const keys = ["land", "fly", "climb", "swim"];
  const wings = G.normaliseGrantedSpeed({ key: "fly", landPlus: 10 }, keys);
  equal("H4 Dragon Wings: a fly Speed of land + 10 (25 → 35; 40 → 50), read against the land Speed as it is; a Fly grant (land or 20) and a half-share grant read as before",
    [wings, G.grantedSpeedBase(wings, 25), G.grantedSpeedBase(wings, 40), G.grantedSpeedBase(G.normaliseGrantedSpeed({ key: "fly", feet: 20, orLand: true }, keys), 15),
      G.grantedSpeedBase(G.normaliseGrantedSpeed({ key: "climb", orLand: true, landFraction: 0.5 }, keys), 25), G.normaliseGrantedSpeed({ key: "fly", landPlus: 0 }, keys)],
    [{ key: "fly", feet: 0, orLand: true, landPlus: 10 }, 35, 50, 20, 10, null]);
  ok("H4b the bonus warp grows the feet above land (\"+10 ft, max +50\"), not a base that is not there",
    /\.\.\.\(landPlus \? \{ landPlus: warpedBonusValue\(Number\(effect\.landPlus\), warpBonus, warpBonusMax\) \} : \{\}\)/.test(src.se)
    && /const grantFeet = landPlus \? 0 : warpedBonusValue\(/.test(src.se));
}

// ── H5 ────────────────────────────────────────────────────────────────────
{
  const S = await imp("magic/cast-reaction-shape.mjs");
  const API = await imp("module-api.mjs");
  const RW = await imp("reactions/reactions-workflow.mjs");
  const SW = await imp("magic/cast-reaction-shape-workflow.mjs");
  equal("H5 the answers fold: exclusions join (no repeats), the first turnBack holds and a second is ignored; a turnBack with neither number is none; one before 3.685.0 reads as it did",
    [S.castReactionShape([{ exclude: ["A"] }, { exclude: ["A", "B"] }, { turnBack: { checkTotal: 27, saveDC: 24 } }, { turnBack: { saveDC: 30 } }]),
      S.castReactionShape([{ turnBack: { target: "x" } }]).turnBack, S.castReactionShape([{ scale: 2 }])],
    [{ scale: 1, saveBias: "", retargetCaster: false, exclude: ["A", "B"], turnBack: { checkTotal: 27, saveDC: 24, target: "" }, ignored: 1 }, null,
      { scale: 2, saveBias: "", retargetCaster: false, exclude: [], turnBack: null, ignored: 0 }]);
  equal("H5b the area spares only the excluded", S.withoutExcluded([{ uuid: "A" }, { uuid: "B" }, { uuid: "C" }], ["B"]).map((a) => a.uuid), ["A", "C"]);
  const seen = [];
  API.registerCastReaction("b7-aegis", (ctx) => { seen.push(ctx.saveDC); return { exclude: ["Actor.ward"], line: "Spectral Aegis" }; });
  API.registerCastReaction("b7-argent", () => ({ turnBack: { checkTotal: 31, saveDC: 26, target: "" } }));
  const caster = { name: "Mage", uuid: "Actor.mage", getActiveTokens: () => [] };
  const reacted = await RW.castReactionsFor({ actor: caster, spell: { name: "Bolt" }, saveDC: 23 });
  equal("H5c the real collector: the reaction's ctx carries the Save DC; the answers come back folded", [seen, reacted.exclude, reacted.turnBack, reacted.stop],
    [[23], ["Actor.ward"], { checkTotal: 31, saveDC: 26, target: "" }, false]);
  const casterTok = { id: "tc", name: "Mage", actor: caster }, wardTok = { id: "tw", name: "Ward", actor: { uuid: "Actor.ward" } }, foeTok = { id: "tf", name: "Foe", actor: { uuid: "Actor.foe" } };
  caster.getActiveTokens = () => [casterTok];
  tokens.push(casterTok, wardTok, foeTok);
  userTargets = new Set([wardTok, foeTok]);
  const warpA = {};
  await SW.applyCastReactionShape({ actor: caster, spell: { name: "Bolt" }, spellData: {}, warpMods: warpA, isArea: false, reacted: { exclude: ["Actor.ward"] } });
  const afterExclude = [...userTargets].map((t) => t.id);
  const warpB = {};
  await SW.applyCastReactionShape({ actor: caster, spell: { name: "Bolt" }, spellData: {}, warpMods: warpB, isArea: false, reacted: { turnBack: { checkTotal: 31, saveDC: 26, target: "" } } });
  equal("H5d the real shaping: an excluded creature leaves the targets and is remembered for an area; a turnBack makes the source its sole target and carries the reactor's numbers",
    [afterExclude, warpA.excludeUuids, [...userTargets].map((t) => t.id), warpB.turnBack], [["tf"], ["Actor.ward"], ["tc"], { checkTotal: 31, saveDC: 26 }]);
  ok("H5e the cast asks its reactions with the Save DC from the one assembly it reads itself; the attack reads a turned-back check; the area drops the excluded; the DC is the reactor's",
    /saveDC: \(await assembleCastSaveDC\(\{\n\s+clSaveDC: applyCasterLevelMods\(spellData\.casterLevelMods, casterLevel\)\.saveDC,/.test(src.cw)
    && /await assembleCastSaveDC\(\{\n\s+clSaveDC: clMods\.saveDC, harderStep: harderSaveDCStep, consume: true\n\s+\}\);/.test(src.cw)
    && /if \(consume && harmonyRecord && actor\.unsetFlag\)/.test(src.cw)
    && /\? \{ \.\.\.assembled, total: Math\.trunc\(Number\(turned\)\) \}/.test(src.cw)
    && /areaTargets = withoutExcluded\(areaTargets, warpMods\.excludeUuids\);/.test(src.cw)
    && /if \(Number\(warpMods\?\.turnBack\?\.saveDC\) > 0\) nominalSaveDC = Number\(warpMods\.turnBack\.saveDC\);/.test(src.cw)
    && /reacted\.retargetCaster \|\| reacted\.turnBack \|\| reacted\.exclude\?\.length\) \{/.test(src.cw));
}

// ── H6 ────────────────────────────────────────────────────────────────────
{
  const RR = await imp("reactions/reactions.mjs");
  const API = await imp("module-api.mjs");
  const RW = await imp("reactions/reactions-workflow.mjs");
  equal("H6 a hit made a miss: no hit, no critical; a miss stays a miss",
    [RR.missedByReaction({ resolved: true, hits: true, critical: { severity: "serious" } }), RR.missedByReaction({ resolved: true, hits: false, critical: null })],
    [{ resolved: true, hits: false, critical: null, forgiven: false, glancing: false, autoHit: false, missedByReaction: true }, { resolved: true, hits: false, critical: null }]);
  equal("H6a (review) nothing only a hit carries survives it: a forgiven, glancing or automatic hit made a miss is none of them",
    [RR.missedByReaction({ resolved: true, hits: true, forgiven: true, glancing: true, autoHit: true, critical: null })].map((o) => [o.hits, o.forgiven, o.glancing, o.autoHit]), [[false, false, false, false]]);
  API.registerCheckReaction("b7-mirror", { after: (ctx) => (ctx.type === "attack" && ctx.succeeded ? { miss: true, label: "Mirror Reprise" } : null) });
  const check = (deg) => ({ actor: { name: "Orc", getActiveTokens: () => [] }, outcome: { degree: { key: deg }, total: 20 }, dice: {}, modifiers: [] });
  const hit = await RW.checkReactionsAfter(check("success"), { type: "attack", succeeded: true, failed: false });
  const miss = await RW.checkReactionsAfter(check("failure"), { type: "attack", succeeded: false, failed: true });
  equal("H6b the real collector: `miss` on a hit comes back as missed (and nothing is rerolled); on a miss it is not asked to matter",
    [hit.missed, hit.missedBy, hit.rerolled, Boolean(miss.missed)], [true, "Mirror Reprise", false, false]);
  ok("H6c both attack paths read it: the Strike's outcome and a spell attack's ray become a miss",
    /if \(answered\.missed\) \{\n\s+const \{ missedByReaction \} = await import\("\.\.\/reactions\/reactions\.mjs"\);\n\s+outcome = missedByReaction\(outcome\);\n\s+reactionDetailLines\.push/.test(src.aw)
    && /if \(answered\.missed\) \{\n\s+const \{ missedByReaction \} = await import\("\.\.\/reactions\/reactions\.mjs"\);\n\s+outcome = missedByReaction\(outcome\);\n\s+lines\.push/.test(src.cw));
}

// ── H7 ────────────────────────────────────────────────────────────────────
{
  const CS = await imp("combat/critical-severity.mjs");
  const API = await imp("module-api.mjs");
  const RW = await imp("reactions/reactions-workflow.mjs");
  const p = { drawn: [3, 8], tens: 8, unit: 3, value: 83 };
  const r = (bias, n, sev) => { const x = CS.loweredCriticalReading(p, bias, n, sev); return x.none ? "none" : [x.bias, x.severity, x.value]; };
  equal("H7 the same two dice (3 and 8), one severity lower: Deadly 83 → Serious as rolled 38 → Minor 38; below Minor no injury; three steps from Deadly is none (\"max 3\")",
    [r("advantage", -1, "deadly"), r("normal", -1, "serious"), r("advantage", -2, "deadly"), r("disadvantage", -1, "minor"), r("advantage", -3, "deadly"), r("normal", 0, "serious")],
    [["normal", "serious", 38], ["disadvantage", "minor", 38], ["disadvantage", "minor", 38], "none", "none", ["normal", "serious", 83]]);
  const before = API.registeredCriticalReactions().length;
  API.registerCriticalReaction("b7-bastion", { after: (ctx) => (/dying/i.test(ctx.row?.effect ?? "") ? { severitySteps: -1, line: "Arcane Bastion shatters" } : null) });
  API.registerCriticalReaction("b7-old", () => null);
  const asked = await RW.criticalAfterReactionsFor({ target: { name: "Mage" }, row: { effect: "Target is Dying" } });
  const notAsked = await RW.criticalAfterReactionsFor({ target: { name: "Mage" }, row: { effect: "A scratch" } });
  equal("H7b the real collector: an `after` answer lowers (and says why); a function registration is still a `before` offer, an `after`-only one is not",
    [asked.steps, asked.lines, notAsked.steps, API.registeredCriticalReactions().length - before, API.registeredCriticalAfterReactions().length >= 1], [-1, ["Arcane Bastion shatters"], 0, 1, true]);
  ok("H7c the injury roll asks after the row is read, re-reads location, armour and row at the lower reading, and a reading below Minor is no injury",
    /const lowered = await criticalAfterReactionsFor\(\{/.test(src.aw)
    && /hitLocation = hitLocationFromUnitDie\(percentile\.unit\);\n\s+seenItems = itemsSeenByCritical/.test(src.aw)
    && /row = lookupTableRow\(table, result\);\n\s+const alternateLow = criticalRowRiders\(row\)\.alternateResult;/.test(src.aw)
    && /lowered below Minor: no critical injury/.test(src.aw));
}

// ── H8 ────────────────────────────────────────────────────────────────────
{
  const GT = await imp("magic/spell-check-gates.mjs");
  const API = await imp("module-api.mjs");
  const Z = await imp("magic/casting-zone.mjs");
  equal("H8 a gate's answer may say disadvantage and innateCheck; one that says neither reads as before",
    [GT.normaliseGateAnswer({ disadvantage: true, innateCheck: true, lines: ["Zone"] }), GT.normaliseGateAnswer({ modifiers: [{ label: "x", value: -1 }] }).disadvantage, GT.normaliseGateAnswer(null)],
    [{ modifiers: [], lines: ["Zone"], disadvantage: true, innateCheck: true }, false, { modifiers: [], lines: [], disadvantage: false, innateCheck: false }]);
  API.registerSpellCheckGate("b7-zone", (ctx) => (ctx.inZone ? { disadvantage: true, innateCheck: ctx.innate === true } : null));
  equal("H8b the real gates: any answer's disadvantage or innate check holds for the cast",
    [await GT.runSpellCheckGates({ inZone: true, innate: true }), await GT.runSpellCheckGates({ inZone: false })].map((g) => [g.disadvantage, g.innateCheck]), [[true, true], [false, false]]);
  equal("H8c the innate check (Q154): 10 + ⌊1.5 × PP⌋ against innate ability + level — PP 6 → DC 19, PP 7 → DC 20, PP 0 → DC 10",
    [GT.innateZoneCheck({ pp: 6, ability: 3, level: 5 }), GT.innateZoneCheck({ pp: 7, ability: 2, level: 0 }), GT.innateZoneCheck({})], [{ dc: 19, modifier: 8 }, { dc: 20, modifier: 2 }, { dc: 10, modifier: 0 }]);
  equal("H8d the Concentration rise: +2 inside a zone, the larger of two (not both), none for a creature it exempts (a Critical on entering)",
    [Z.zoneConcentrationDC([{ concentrationDC: 2, label: "Zone Disruption" }], "A"), Z.zoneConcentrationDC([{ concentrationDC: 2 }, { concentrationDC: 3, label: "Other" }], "A").value,
      Z.zoneConcentrationDC([{ concentrationDC: 2, exempt: ["A"] }], "A").value, Z.zoneConcentrationDC([], "A").value], [{ value: 2, label: "Zone Disruption" }, 3, 0, 0]);
  ok("H8e the cast joins the gate's disadvantage to its bias; an innate cast a gate makes roll takes that check's degree (a fumble rolls the fumble table); a Spell Concentration check adds the zone's rise",
    /if \(gated\.disadvantage && !noCheckCantrip\) \{\n\s+const \{ joinedBias \} = await import\("\.\/module-metamagic\.mjs"\);\n\s+castContext\.bias = joinedBias\(castContext\.bias, "disadvantage"\)/.test(src.cw)
    && /if \(isInnate && !isItemCast && !ritual && !threaded && gated\.innateCheck\) \{/.test(src.cw)
    && /degree = zoneCheck\?\.outcome\?\.degree\?\.key \?\? "failure";/.test(src.cw)
    && /const dc = Number\(result\.dc \|\| 0\) \+ zoneRise\.value;/.test(src.cw));
}

// ── H9 ────────────────────────────────────────────────────────────────────
{
  const LM = await imp("magic/lent-metamagic.mjs");
  const API = await imp("module-api.mjs");
  const MW = await imp("magic/module-metamagic-workflow.mjs");
  const off = (pp, f) => LM.lentMetamagicDiscount({ coreOptions: [{ id: "o", ppCost: pp, max: 1, lent: { costFactor: f, label: "L", effectId: "" } }], form: { "mm-o": true } }).pp;
  equal("H9 what the bearer pays (Q163), as what is taken off: ×1 nothing off, half rounded down (3 → pays 1, 2 off; 1 → pays 0), none (5 off); an unknown factor is ×1",
    [off(4, 1), off(3, 0.5), off(1, 0.5), off(5, 0), LM.lentMetamagicOf([{ id: "x", flags: { "trg-prime": { lentMetamagic: { key: "Empower Spell", costFactor: 0.25 } } } }], "")[0]],
    [0, 2, 1, 5, { key: "empower spell", costFactor: 1, label: "Lent metamagic", from: "", effectId: "x", used: false }]);
  const effect = { id: "lend", flags: { "trg-prime": { lentMetamagic: { key: "empower spell", costFactor: 0.5, label: "Metamagic Resonance" }, lentMetamagicUsed: "c1:2" } } };
  equal("H9b once a round: spent in round 2, free again in round 3, never spent out of combat",
    [LM.lentMetamagicOf([effect], "c1:2")[0].used, LM.lentMetamagicOf([effect], "c1:3")[0].used, LM.lentMetamagicOf([effect], "")[0].used], [true, false, false]);
  const core = [{ id: "empower", ppCost: 3, max: 1, lent: { costFactor: 0.5, label: "Metamagic Resonance", effectId: "lend" } }, { id: "extend", ppCost: 2, max: 2 }];
  equal("H9c the discount is what the lent option does not cost (Empower 3 PP at half: 2 off); an option the bearer owns costs as it does",
    LM.lentMetamagicDiscount({ coreOptions: core, form: { "mm-empower": true, "mm-extend": 2 } }), { pp: 2, label: "Metamagic Resonance", effectIds: ["lend"] });
  API.registerMetamagic("b7-lent-test", { label: "Test Spell", feat: "Test Spell Feat", ppCost: 4 });
  const offers = await MW.offeredModuleMetamagic({ items: [], effects: [], appliedEffects: [] }, { scopeKind: "learned", basePP: 2, lent: [{ key: "b7-lent-test", costFactor: 0, label: "Metamagic Resonance", effectId: "lend", used: false }] });
  const mine = offers.find((o) => o.key === "b7-lent-test");
  equal("H9d the real module offers: a module option lent to a creature without its feat is offered (\"no requirements but the caster's\"), marked with its lender; its discount is the whole 4 PP at no extra cost",
    [mine?.hidden, mine?.lent, LM.lentMetamagicDiscount({ offers, taken: [{ key: "b7-lent-test", times: 1 }] }).pp], [false, { costFactor: 0, label: "Metamagic Resonance", effectId: "lend" }, 4]);
  ok("H9e the cast offers a lent core feat's options, discounts payment only (the DC, cap and Save DC read the PP as cast), and spends the lend for the round once cast",
    /const wider = buildMetamagicOptions\(\{ \.\.\.mmBuildArgs, featNames: \[\.\.\.mmBuildArgs\.featNames, lent\.key\] \}\)/.test(src.cw)
    && /if \(lentCut\.pp > 0\) mmx\.discounts = \[\.\.\.\(mmx\.discounts \?\? \[\]\), \{ pp: lentCut\.pp, floor: 0,/.test(src.cw)
    && /if \(lentCut\.effectIds\.length && lentRoundKey && outcome\.cast && !castRefunded\) \{/.test(src.cw)
    && /lent: lentHere\n\s+\};/.test(src.cw)
    && /for \(const l of lent\) if \(!granted\.includes\(l\.key\)\) granted\.push\(l\.key\);/.test(src.mmw));
  ok("H9f Q162: a free warp that says raisesSaveDC still counts for the Save DC (and nowhere else); Healer's Grace and Powerful Illusion, which do not say so, are unchanged",
    /const savePP = heightenedSavePP\(totalPP \+ freeWarpSaveDCPP, cap,/.test(src.cw)
    && /\.filter\(\(\{ scoped \}\) => scoped\?\.raisesSaveDC === true\)/.test(src.cw)
    && /freeWarpSaveDCPP = Math\.min\(free\.waived, raising\);/.test(src.cw)
    && /\.\.\.\(effect\.raisesSaveDC === true \? \{ raisesSaveDC: true \} : \{\}\)/.test(src.se)
    && /warpFreeSchool: \{ \.\.\.POWERFUL_ILLUSION, label: "Powerful Illusion" \} \}/.test(read("module", "feats-workflow.mjs"))
    && !/raisesSaveDC/.test(read("module", "feats-workflow.mjs")));
}

// ── H10 ───────────────────────────────────────────────────────────────────
{
  const SR = await imp("magic/strike-riders.mjs");
  const SRW = await imp("magic/strike-riders-workflow.mjs");
  const arrow = SR.normaliseStrikeRider({ dice: "6d6", damageType: "piercing", scope: "ranged", label: "Spirit Arrow", replacesDamage: true });
  const bow = { attackMode: "missile", category: "", name: "Longbow" }, sword = { attackMode: "melee", category: "", name: "Sword" };
  equal("H10 Spirit Arrow: a ranged rider in place of the weapon's damage — the bow's Strike takes 6d6 piercing as its damage, a sword's does not; it is no secondary packet; a rider without dice cannot replace",
    [arrow.replacesDamage, SR.damageReplacement([arrow], bow), SR.damageReplacement([arrow], sword), SR.riderPacketsFor([arrow], bow).length,
      SR.normaliseStrikeRider({ weaponDie: true, scope: "any", replacesDamage: true })?.replacesDamage ?? null],
    [true, { dice: "6d6", damageType: "piercing", label: "Spirit Arrow", id: "" }, null, 0, null]);
  const plain = SR.normaliseStrikeRider({ dice: "1d6", damageType: "fire", scope: "any", label: "Flame" });
  equal("H10b an ordinary rider adds as it did, and replaces nothing", [plain.replacesDamage ?? null, SR.riderPacketsFor([plain], sword).length, SR.damageReplacement([plain], sword)], [null, 1, null]);
  const archer = { items: [], getFlag: () => ({}), appliedEffects: [{ id: "fx", flags: { "trg-prime": { strikeRider: { dice: "6d6", damageType: "piercing", scope: "ranged", label: "Spirit Arrow", replacesDamage: true } } } }] };
  equal("H10c the real workflow reads it off the archer's effect", SRW.strikeDamageReplacement(archer, { system: { attackMode: "missile" }, name: "Longbow", type: "weapon" })?.dice, "6d6");
  ok("H10d the Strike's damage takes it as its base dice and type (so a critical doubles it), unless the caller chose an override",
    /const replacing = strikeDamageReplacement\(actor, weapon, \{\n\s+targetTypes: creatureTypesOf\(replaceTarget\?\.system \?\? \{\}\),/.test(src.aw)
    && /if \(replacing && damageOverride\) discardedReplacement = replacing\.id;\n\s+else if \(replacing\) \{\n\s+damageOverride = replacing\.dice;\n\s+damageTypeOverride = replacing\.damageType;/.test(src.aw)
    && /\.\.\.\(discardedReplacement \? \{ keepRiderIds: \[discardedReplacement\] \} : \{\}\)/.test(src.aw));
  // REVIEW (3.685.0): the Strike's facts reach a gated replacing rider, and one an override beat is kept.
  const critArrow = { id: "fxc", flags: { "trg-prime": { strikeRider: { dice: "6d6", damageType: "piercing", scope: "ranged", label: "Critical Arrow", replacesDamage: true, onCritical: true } } } };
  const bowItem = { system: { attackMode: "missile" }, name: "Longbow", type: "weapon" };
  const gated = { items: [], getFlag: () => ({}), appliedEffects: [critArrow] };
  equal("H10e (review) a gated replacing rider passes only when the Strike's facts hold (here: on a critical)",
    [SRW.strikeDamageReplacement(gated, bowItem, { critical: true })?.dice ?? null, SRW.strikeDamageReplacement(gated, bowItem, { critical: false })?.dice ?? null], ["6d6", null]);
  const deleted = [];
  const fx = { id: "fx", flags: archer.appliedEffects[0].flags, delete: async () => { deleted.push("fx"); } };
  const spender = { items: [], getFlag: () => ({}), appliedEffects: [fx], effects: { get: (id) => (id === "fx" ? fx : null) } };
  await SRW.spendStrikeRiders(spender, bowItem, { ctx: { keepRiderIds: ["fx"] } });
  const kept = deleted.length;
  await SRW.spendStrikeRiders(spender, bowItem, { ctx: {} });
  equal("H10f (review) the real spend: a replacing rider an override beat is kept; one the Strike used is spent", [kept, deleted], [0, ["fx"]]);

  // GRAHAM ON SPIRIT ARROW (7 Nov, 07:53): "Flat 6d6". `flat: true` on a
  // replacing rider: exactly its dice and type, a critical still doubles it.
  const A = await imp("combat/attack.mjs");
  const flatArrow = SR.normaliseStrikeRider({ dice: "6d6", damageType: "piercing", scope: "ranged", label: "Spirit Arrow", replacesDamage: true, flat: true });
  equal("H10g a replacing rider may be flat: its dice stay dice (not the flat amount), it reads back the same, its replacement says flat; without `flat` it says nothing; a non-replacing flat rider is still a flat amount",
    [flatArrow?.replacesDamage, flatArrow?.flat, flatArrow?.dice, SR.normaliseStrikeRider(flatArrow)?.flat, SR.damageReplacement([flatArrow], bow)?.flat,
      "flat" in SR.damageReplacement([arrow], bow), SR.normaliseStrikeRider({ dice: "3", damageType: "fire", scope: "any", flat: true })?.flat ?? null,
      SR.normaliseStrikeRider({ dice: "6d6", damageType: "fire", scope: "any", flat: true }) ?? null],
    [true, true, "6d6", true, true, false, true, null]);
  equal("H10h (executed) the flat formula drops every addition — no BAB dice, quality, Mighty — and a serious critical still doubles the 6d6 as weapon damage",
    [A.flatReplacementFormula("6d6"), A.flatReplacementFormula("6d6", { critical: "serious" }), A.flatReplacementFormula("6d6", { critical: "serious", criticalDice: 0 }),
      A.buildWeaponDamageFormula("6d6", { bab: 20, quality: "superior", mightyBonus: 4, critical: "serious" }) !== A.flatReplacementFormula("6d6", { critical: "serious" })],
    ["6d6", "8d6", "6d6", true]);
  ok("H10i the Strike rolls the flat formula in place of everything added, with no packet, no BAB line and no line naming a dropped addition",
    /replacingFlat = replacing\.flat === true;/.test(src.aw)
    && /if \(replacingFlat\) formula = flatReplacementFormula\(damageOverride, \{ critical, criticalDice: \(drainDice \|\| guardDice\) \? 0 : critDiceKept \}\);\n\s+const roll = await sharedRoll\(sharedDamage, "strike", formula\);/.test(src.aw)
    && /const displayBonusDice = replacingFlat \? 0 : bonusDamageDice\(/.test(src.aw)
    && /for \(const rune of replacingFlat \? \[\] : \[/.test(src.aw)
    && /if \(sneak && !replacingFlat\) \{/.test(src.aw) && /for \(const said of replacingFlat \? \[\] : Array\.isArray\(declaredBonusLines\)/.test(src.aw));
}

// ── H11 ───────────────────────────────────────────────────────────────────
{
  const H = await imp("magic/heal-ends.mjs");
  const fx = [{ id: "snap", flags: { "trg-prime": { endsOnHeal: true } } }, { id: "other", flags: { "trg-prime": {} } }];
  equal("H11 Primal Snap (Q160: \"until it regains any HP\"): a rise of 1 ends it; no change, a loss, or an unknown before ends nothing; only flagged effects",
    [H.effectsEndedByHealing(fx, 10, 11), H.effectsEndedByHealing(fx, 10, 10), H.effectsEndedByHealing(fx, 10, 4), H.effectsEndedByHealing(fx, NaN, 20)], [["snap"], [], [], []]);
  equal("H11b a row asks for it; one that does not is left alone",
    [H.withEndsOnHeal({ "trg-prime": { spellBuff: true } }, { endsOnHeal: true }), H.withEndsOnHeal({ a: 1 }, {})], [{ "trg-prime": { spellBuff: true, endsOnHeal: true } }, { a: 1 }]);
  ok("H11c every HP write is watched; a spell's bonus rows carry the flag",
    /const ended = effectsEndedByHealing\(actor\.effects \?\? \[\], before, next\);\n\s+if \(ended\.length\) await actor\.deleteEmbeddedDocuments\("ActiveEffect", ended\)/.test(src.ce)
    // 3.685.1: five — the bonus group's one effect (verify-fixes-3685-1 B) carries it too.
    && (src.se.match(/\.flags = withEndsOnHeal\((data\w*)\.flags, effect\);/g) ?? []).length === 5);
}

// ── K: the §7 checks ─────────────────────────────────────────────────────
{
  const API = await imp("module-api.mjs");
  const DM = await imp("combat/dispel-modifiers.mjs");
  API.registerDispelModifier("b7-eaog", { offer: () => ({ label: "Eaog Balls", bias: "disadvantage" }) });
  const offered = await DM.offeredDispelModifiers({ actor: {}, target: null });
  const eaog = offered.find((o) => o.key === "b7-eaog");
  equal("K1 (seam) Eaog Balls' \"dispel … with disadvantage\": a dispel modifier's bias is kept, joined with the others; an unknown word is none",
    [eaog?.bias, DM.combinedDispelModifiers([eaog, { key: "x", bias: "advantage" }, { key: "y", bias: "" }]).biases], ["disadvantage", ["disadvantage", "advantage"]]);
  ok("K1b the Dispel check's bias reads them", /\.\.\.\(action\.key === "dispel" && Array\.isArray\(dispelSetup\?\.biases\) \? dispelSetup\.biases : \[\]\)/.test(src.acw));
  const GD = await imp("combat/granted-defences.mjs");
  const CT = await imp("creature-traits.mjs");
  GD.resetGrantedDefences();
  const sys = { combat: { weaknesses: "", resistances: "", immunities: "" }, parent: { uuid: "Actor.named" } };
  GD.grantDefence(sys.parent, { weak: ["sonic"], label: "Invoke True Name" });
  const d = CT.actorDefences(sys);
  equal("K2 (seam) Invoke True Name's weakness: a damage reaction's `weak` is a weakness on the next blow, beside the creature's own; \"all\" is not one this grants",
    [d.weaknesses.has("sonic"), GD.grantDefence(sys.parent, { weak: "all" }), CT.actorDefences({ combat: {}, parent: null }).weaknesses.has("sonic")], [true, false, false]);
  ok("K2b the damage reaction hands it on", /resist: out\.resist \?\? null, immune: out\.immune \?\? null, weak: out\.weak \?\? null,/.test(read("module", "reactions", "reactions-workflow.mjs")));
  const FD = await imp("focus-declarations.mjs");
  const DC = await imp("declaration-carriers.mjs");
  equal("K3 (holds) Bouncy Body's fallReduction on a spell's effect is read: an applied effect is a carrier",
    FD.declaredFallReduction(DC.declarationCarriers({ appliedEffects: [{ name: "Bouncy Body", flags: { "trg-prime": { fallReduction: { value: 20, label: "Bouncy Body" } } } }], items: [] })).feet, 20);
}

// ── REVIEW (3.685.0): the behaviour the independent review found wrong ──
{
  const CS = await imp("combat/critical-severity.mjs");
  const p = { value: 38, tens: 3, unit: 8, drawn: [3, 8] };
  const r = (bias, n, sev) => { const x = CS.loweredCriticalReading(p, bias, n, sev); return x.none ? "none" : [x.severity, x.bias]; };
  equal("V1 H7: \"no injury\" is a question of severity — a Serious rolled at disadvantage (Eternity Resilience), lowered 1, is a Minor; a Deadly cancelled to normal, lowered 2, is a Minor; a Minor lowered 1 is none; the reading stops at disadvantage",
    [r("disadvantage", -1, "serious"), r("normal", -2, "deadly"), r("normal", -1, "minor"), r("advantage", -2, "deadly")],
    [["minor", "disadvantage"], ["minor", "disadvantage"], "none", ["minor", "disadvantage"]]);
  const T = await imp("magic/thorns.mjs");
  const at = (damage, cl, max) => T.normaliseThorns(T.spellThorns(T.normaliseThorns({ damage, damageType: "force", casterLevelBonus: { max } }), { casterLevel: cl }))?.damage;
  equal("V2 H1: the caster-level bonus joins a flat term already there (1d6+1 at CL 10, max 10 → 1d6+11), a negative one, or a flat damage",
    [at("1d6+1", 10, 10), at("1d6-3", 10, 10), at("3", 4, 15), at("1d6", 10, 10)], ["1d6+11", "1d6+7", "7", "1d6+10"]);
  const S = await imp("magic/cast-reaction-shape.mjs");
  equal("V3 H5: an area spares a creature named by its token's uuid, as a targeted spell does",
    S.withoutExcluded([{ uuid: "Scene.s.Token.t.Actor.a", token: { uuid: "Scene.s.Token.t" } }, { uuid: "Actor.b" }], ["Scene.s.Token.t"]).map((a) => a.uuid), ["Actor.b"]);
  ok("V4 H9b: the Save line names a free warp's PP by its source, and says Heighten only when Heighten moved it",
    /savePP !== totalPP \+ freeWarpSaveDCPP \? ` \(Heighten Spell — as \$\{savePP\} PP\)` : ""/.test(src.cw)
    && /\(\+\$\{freeWarpSaveDCPP\} free warp PP, \$\{freeWarpSaveDCLabel \|\| "a free warp"\} — as \$\{savePP\} PP\)/.test(src.cw));
}
{
  // H3a's filters, driven: the real turn-start sweep, the real roll.
  const E = await imp("magic/entry-check-workflow.mjs");
  globalThis.Roll = class { constructor(f) { this.formula = f; this.terms = [{ results: [{ result: 15 }] }]; this.dice = [{ results: [{ result: 15 }], faces: 20 }]; } async evaluate() { this.total = 15; return this; } async render() { return ""; } };
  globalThis.renderTemplate = async () => "";
  globalThis.CONFIG.Dice = { rolls: [] };
  globalThis.ChatMessage.getWhisperRecipients = () => []; globalThis.ChatMessage.applyMode = () => {};
  const savedCombat = game.combat;
  game.combat = { started: true, id: "c1", round: 2, turn: 0 };
  const raw = (extra) => ({ kind: "entryCheck", save: "reflex", atTurnStart: true, degrees: { failure: { rows: [] } }, dc: 15, label: "Mycelium", casterUuid: "Actor.caster", ...extra });
  const region = (r) => ({ id: "rg", getFlag: () => r, testPoint: () => true });
  const mover = () => { const f = {}; return { name: "M", uuid: "Actor.m", system: { combat: { saves: {} } }, items: [], effects: [], appliedEffects: [], getFlag: (_s, k) => f[k], setFlag: async (_s, k, v) => { f[k] = v; }, _f: f }; };
  const tok = (disposition) => ({ x: 0, y: 0, document: { elevation: 0, disposition } });
  docs.set("Actor.caster", { getActiveTokens: () => [{ document: { disposition: 1 } }] });
  const run = async (r, m, d = -1) => { globalThis.canvas.scene.regions = [region(r)]; return E.applyTurnStartEntryChecks(m, tok(d)); };
  const plain = await run(raw(), mover());
  const friend = await run(raw({ hostileOnly: true }), mover(), 1);
  const foe = await run(raw({ hostileOnly: true }), mover(), -1);
  const once = mover();
  const first = await run(raw({ oncePerRound: true }), once);
  const second = await run(raw({ oncePerRound: true }), once);
  const cleared = mover(); cleared._f.entryCheckCleared = { region: "rg", turn: "c1:2:0" };
  const afterCritical = await run(raw(), cleared);
  game.combat = savedCombat; globalThis.canvas.scene.regions = [];
  equal("V5 H3a: the start of a turn asks the movement path's filters — a hostile-only zone spares the caster's side, \"once a round\" rolls once, a Critical's \"no further checks this turn\" holds",
    [plain, friend, foe, first, second, afterCritical], [1, 0, 1, 1, 0, 0]);
}

// ── The contracts are written down ──────────────────────────────────────
ok("M the module API documents the new answers (cast reaction exclude/turnBack/saveDC, critical after, gate disadvantage/innateCheck, damage reaction weak, dispel bias)",
  /`exclude: \[uuid\]`/.test(src.api) && /`turnBack: \{ checkTotal, saveDC, target \}`/.test(src.api) && /severitySteps: -n/.test(src.api)
  && /`disadvantage: true`/.test(src.api) && /`innateCheck: true`/.test(src.api) && /`weak`/.test(src.api) && /`bias: "advantage" \| "disadvantage"`/.test(src.api) && /`\{ miss: true, line \}`/.test(src.api));

if (failures.length) {
  process.stdout.write(`verify-ea-block7-core: FAILED — ${failures.length} of ${checks}\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-ea-block7-core: OK — ${checks} checks.\n`);
