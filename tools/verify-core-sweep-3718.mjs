#!/usr/bin/env node
/**
 * verify-core-sweep-3718 — the defects the player-seat sweep of every core
 * spell found (3.718.0, 27 November 2026).
 *
 * THE SWEEP. Every one of the 692 core spells cast from the PLAYER's seat
 * (PC Tester) with a second, GM session connected, against fixture actors
 * the player does not own. A GM can write to anything, so every defect here
 * was invisible from the GM's seat.
 *
 * A. CHARMS. Alluring Caress and Charm Undead stopped at "User PC Tester
 *    lacks permission to update Actor": the attitude is a flag on the
 *    TARGET. Now RELAY_ACTIONS.ATTITUDE, and the asker must own the caster.
 * C–E. EVERY OTHER WRITE ON A TARGET the sweep caught: Doubt's owed -2, False
 *    Arrogance's immunity, the Prison spells' cage (SPELL_FLAG); Fly and
 *    Earth Glide's granted Speed (SPELL_ITEMS); Entangle, False Mire and Ice
 *    Slick's difficult ground (REGION_BEHAVIOURS). One helper module,
 *    combat/relayed-writes.mjs, wraps each primitive.
 * B. CONJURED ITEMS. Bless Water touched to a flask the player does not hold
 *    was refused, and the card said "Holy Water is not in the compendium".
 *    Now RELAY_ACTIONS.CONJURE_ITEM, and a refusal says it was one.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { RELAY_ACTIONS, SPELL_RELAY_FLAGS, EFFECT_STAMP_FLAGS, FORCED_MOVE_MAX_FEET, relayableWallSegments, handleRelayMessage, buildRelayRequest } from "../module/combat/target-relay.mjs";
import { setTargetFlag, createTargetSpellItems } from "../module/combat/relayed-writes.mjs";
import { conjuredItemRefusedLine, conjuredItemMissingLine } from "../module/magic/conjured-item.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (p) => fs.readFileSync(path.join(SYSTEM_ROOT, p), "utf8");

const GM = { id: "gm1", isGM: true };

/** Run one request through the real router with recording stubs. */
async function relay(action, payload, { owns = true, made = { id: "i1", name: "Holy Water" }, placed = true } = {}) {
  const rec = { calls: [] };
  const target = { name: "Foe", uuid: "Actor.foe" };
  const caster = { name: "Wizard", uuid: "Actor.wiz" };
  const effect = { id: "e1", flags: { "trg-prime": { spellEffect: true } } };
  const plainEffect = { id: "e2", flags: {} };
  const deps = {
    // "Actor.wizAlias" resolves to the caster too, as a token's synthetic
    // actor uuid can: the GM must key the attitude to the uuid it read.
    fromUuid: async (u) => (u === "Actor.foe" ? target : (u === "Actor.wiz" || u === "Actor.wizAlias") ? caster : null),
    userOwns: (actor, userId) => owns && actor === caster && userId === "player1",
    charmAttitude: async (...a) => { rec.calls.push(["charm", ...a]); return { from: "indifferent", to: "friendly", moved: true }; },
    charmAttitudeByStep: async (...a) => { rec.calls.push(["step", ...a]); return { from: "unfriendly", to: "indifferent", moved: true }; },
    conjureItem: async (...a) => { rec.calls.push(["conjure", ...a]); return made; },
    setSpellFlag: async (...a) => { rec.calls.push(["flag", ...a]); },
    createSpellItems: async (t, items) => { rec.calls.push(["items", t, items]); return items.map((x, i) => ({ id: `m${i}`, name: x.name })); },
    userPlacedRegion: (region, userId) => placed && userId === "player1",
    updateRegion: async (r, d) => { rec.calls.push(["rename", r, d]); },
    effectOf: (t, id) => (id === "e1" ? effect : id === "e2" ? plainEffect : null),
    isSpellEffect: (e) => e === effect,
    deleteEffect: async (e) => { rec.calls.push(["delete", e]); },
    stampEffect: async (e, f) => { rec.calls.push(["stamp", e, f]); },
    createSpellWalls: async (r, segs, castId) => { rec.calls.push(["walls", r, segs, castId]); return segs; },
    forceMoveAway: async (src, t, feet) => { rec.calls.push(["move", src, t, feet]); return { ok: true, text: "moved" }; },
    createRegionBehaviours: async (r, b) => { rec.calls.push(["behaviours", r, b]); return b.map((x, i) => ({ id: `b${i}` })); },
    reply: (m) => { rec.reply = m; },
    acknowledge: () => {}
  };
  await handleRelayMessage(buildRelayRequest({ action, uuid: "Actor.foe", userId: "player1", requestId: "r1", payload }),
    { user: GM, activeGM: GM, deps });
  return { rec, target, caster, effect, plainEffect };
}

/* A. A charm's attitude, through the GM ------------------------------ */
ok("A0 ATTITUDE is a declared relay action", RELAY_ACTIONS.ATTITUDE === "target.attitude");
{
  const { rec, target, caster } = await relay(RELAY_ACTIONS.ATTITUDE,
    { mode: "charm", observerUuid: "Actor.wiz", floor: "friendly", seconds: 3600 });
  const c = rec.calls[0];
  ok("A1 a charm request reaches charmAttitude", c?.[0] === "charm", JSON.stringify(rec.calls));
  ok("A2 on the target the GM fetched", c?.[1] === target);
  ok("A3 toward the caster's own uuid, read from the fetched caster", c?.[2] === caster.uuid);
  ok("A4 with the floor and the duration", c?.[3] === "friendly" && c?.[4] === 3600, JSON.stringify(c));
  ok("A5 and answers what happened", rec.reply?.ok === true && rec.reply?.result?.to === "friendly", JSON.stringify(rec.reply));
}
{
  const { rec, caster } = await relay(RELAY_ACTIONS.ATTITUDE,
    { mode: "charm", observerUuid: "Actor.wizAlias", floor: "friendly", seconds: 60 });
  ok("A3b an aliased caster uuid is keyed to the caster the GM resolved", rec.calls[0]?.[2] === caster.uuid, JSON.stringify(rec.calls[0]));
}
{
  const { rec } = await relay(RELAY_ACTIONS.ATTITUDE,
    { mode: "step", observerUuid: "Actor.wiz", steps: 1, seconds: null });
  ok("A6 a step request reaches charmAttitudeByStep with its steps and a null span",
    rec.calls[0]?.[0] === "step" && rec.calls[0]?.[3] === 1 && rec.calls[0]?.[4] === null, JSON.stringify(rec.calls));
}
{
  const { rec } = await relay(RELAY_ACTIONS.ATTITUDE,
    { mode: "charm", observerUuid: "Actor.wiz", floor: "helpful", seconds: 60 }, { owns: false });
  ok("A7 an asker who does not own the caster is refused", rec.reply?.ok === false && rec.calls.length === 0, JSON.stringify(rec));
}
{
  const { rec } = await relay(RELAY_ACTIONS.ATTITUDE, { mode: "permanent", observerUuid: "Actor.wiz", floor: "helpful" });
  ok("A8 an unknown operation is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.ATTITUDE, { mode: "charm", observerUuid: "Actor.nobody", floor: "helpful" });
  ok("A9 a caster who does not exist is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.ATTITUDE, { mode: "charm", observerUuid: "Actor.wiz", floor: "helpful", seconds: "forever" });
  ok("A10 a duration that is not a number is refused", rec.reply?.ok === false && rec.calls.length === 0);
}

const effects = read("module/magic/spell-effects.mjs");
const attitudeCase = effects.slice(effects.indexOf('case "attitude": {'), effects.indexOf('case "healingEarth": {'));
ok("A11 the attitude row goes through relayAttitude", /await relayAttitude\(target,/.test(attitudeCase));
ok("A12 and no longer writes the target directly outside the direct branch",
  !/const moved = floor\s*\?\s*await charmAttitude/.test(attitudeCase));
ok("A13 a refusal is said rather than read as 'unchanged'", /if \(!moved\) \{/.test(attitudeCase));

const live = read("module/combat/target-relay-workflow.mjs");
ok("A14 the GM's client checks the floor is a real attitude", /isAttitude\(floor\)\) return null/.test(live));
ok("A15 the asker-side wrapper exists and relays only when it must",
  /export async function relayAttitude\(target, request, applyDirect\) \{\s*if \(!needsRelay\(target\)\) return applyDirect\(\);/.test(live));

/* B. A conjured item, through the GM --------------------------------- */
ok("B0 CONJURE_ITEM is a declared relay action", RELAY_ACTIONS.CONJURE_ITEM === "target.conjureItem");
{
  const { rec, target } = await relay(RELAY_ACTIONS.CONJURE_ITEM,
    { spec: { pack: "alchemical", itemName: "Holy Water", quantity: 1 }, castId: "c1", expires: false, stamp: null });
  const c = rec.calls[0];
  ok("B1 a conjure request reaches conjureItem on the fetched target", c?.[0] === "conjure" && c?.[1] === target, JSON.stringify(rec.calls));
  ok("B2 with the named entry", c?.[2]?.itemName === "Holy Water" && c?.[2]?.pack === "alchemical");
  ok("B3 and its clock options", c?.[3]?.castId === "c1" && c?.[3]?.expires === false && c?.[3]?.stamp === null, JSON.stringify(c?.[3]));
  ok("B4 answers the made item", rec.reply?.ok === true && rec.reply?.result?.name === "Holy Water");
}
{
  const { rec } = await relay(RELAY_ACTIONS.CONJURE_ITEM, { castId: "c1" });
  ok("B5 a request naming no item is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.CONJURE_ITEM, { spec: { pack: "alchemical", itemName: "Nope" } }, { made: null });
  ok("B6 an item that could not be made is a refusal, not a success", rec.reply?.ok === false);
}
ok("B7 the GM's client normalises the spec itself (pack allow-list)",
  /conjureItem: async \(target, spec, opts\) => \{[\s\S]{0,200}normaliseConjuredItem\(\{ kind: "conjureItem", \.\.\.spec \}\);\s*if \(!clean\) return null;/.test(live));
const conjureCase = effects.slice(effects.indexOf('case "conjureItem": {'), effects.indexOf('case "conjureItem": {') + 9000);
ok("B8 the conjure row goes through relayConjureItem", /await relayConjureItem\(target, spec, conjureOpts,/.test(conjureCase));
ok("B9 a refusal is said as a refusal", /conjured\.reason\s*\?\s*conjuredItemRefusedLine/.test(conjureCase));
{
  const spec = { itemName: "Holy Water", pack: "alchemical" };
  const refused = conjuredItemRefusedLine(spec, "Bless Water", "Ally", "lacks permission");
  ok("B10 the refusal line names the holder and the reason, and not the compendium",
    /Ally/.test(refused) && /lacks permission/.test(refused) && !/compendium/.test(refused), refused);
  ok("B11 the missing line still blames the data", /compendium/.test(conjuredItemMissingLine(spec, "Bless Water")));
}

/* C. A spell's record on a target ------------------------------------ */
ok("C0 the records a spell may write across the relay are exactly these",
  JSON.stringify(SPELL_RELAY_FLAGS) === JSON.stringify(["pendingModifiers", "temporaryImmunity", "imprisoned", "cuttingWords", "spellDrain", "flatLadderCurse"]), JSON.stringify(SPELL_RELAY_FLAGS));
{
  const value = [{ id: "x", kind: "modifier", value: -2 }];
  const { rec, target } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "pendingModifiers", value });
  ok("C1 a named record is written on the fetched target", rec.calls[0]?.[0] === "flag" && rec.calls[0]?.[1] === target
    && rec.calls[0]?.[2] === "pendingModifiers" && rec.calls[0]?.[3] === value, JSON.stringify(rec.calls));
  ok("C2 and answers success", rec.reply?.ok === true);
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "attitude", value: {} });
  ok("C3 any other flag is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "imprisoned", value: "caged" });
  ok("C4 a record that is not an object is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "imprisoned" });
  ok("C5 no value is an unset (null)", rec.calls[0]?.[3] === null, JSON.stringify(rec.calls));
}
{
  // A plain document with no ownership to ask is written directly — the
  // harness mocks of every other verify rely on it.
  const doc = { flags: {}, setFlag: async (s2, k, v) => { doc.flags[k] = v; return doc; }, unsetFlag: async (s2, k) => { delete doc.flags[k]; return doc; } };
  await setTargetFlag(doc, "pendingModifiers", [1]);
  ok("C6 a document with no isOwner is written directly", JSON.stringify(doc.flags.pendingModifiers) === "[1]");
  await setTargetFlag(doc, "pendingModifiers", null);
  ok("C7 and a null unsets it", !("pendingModifiers" in doc.flags));
  const owned = { isOwner: true, created: null, createEmbeddedDocuments: async (t, d) => { owned.created = [t, d]; return d; } };
  await createTargetSpellItems(owned, [{ name: "Fly" }]);
  ok("C8 an owned target's items are created directly", owned.created?.[0] === "Item");
}
const relayed = read("module/combat/relayed-writes.mjs");
ok("C9 only a document that is exactly not owned is relayed",
  /function mustRelay\(doc\) \{\s*return doc\?\.isOwner === false && typeof game !== "undefined" && game\?\.user\?\.isGM !== true;/.test(relayed));
const pending = read("module/pending-modifiers.mjs");
ok("C10 addPendingModifier writes through setTargetFlag", /await setTargetFlag\(actor, FLAG, \[\.\.\.existing, record\]\)/.test(pending));
ok("C11 the temporary-immunity row writes through setTargetFlag",
  /await setTargetFlag\(target, IMMUNITY_FLAG,\s*withImmunity\(prunedImmunities\(record, now\), key, spec\.seconds, now\)\)\) === false\) break;/.test(effects));
ok("C12 the prison row writes through setTargetFlag", /if \(\(await setTargetFlag\(prisoner, PRISON_FLAG, \{/.test(effects));
ok("C13 no prison row writes the prisoner directly", !/await prisoner\.setFlag\(SYSTEM_ID, PRISON_FLAG/.test(effects));
for (const [file, re, label] of [
  ["module/alchemical-workflow.mjs", /await setTargetFlag\(targetActor, IMMUNITY_FLAG,/, "an alchemical item's immunity"],
  ["module/magic/flat-ladder-workflow.mjs", /await setTargetFlag\(target, IMMUNITY_FLAG,/, "a flat ladder's immunity"],
  ["module/module-api-workflow.mjs", /await setTargetFlag\(target, t\.IMMUNITY_FLAG,/, "the module API's immunity"]
]) ok(`C14 ${label} writes through setTargetFlag`, re.test(read(file)));

/* D. A spell's granted ability on a target ---------------------------- */
{
  const items = [{ name: "Fly", type: "ability", flags: { "trg-prime": { spellItem: true } } }];
  const { rec, target } = await relay(RELAY_ACTIONS.SPELL_ITEMS, { items });
  ok("D1 a spell's ability is created on the fetched target", rec.calls[0]?.[0] === "items" && rec.calls[0]?.[1] === target);
  ok("D2 and answers its id and name", rec.reply?.result?.[0]?.id === "m0" && rec.reply?.result?.[0]?.name === "Fly", JSON.stringify(rec.reply));
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_ITEMS, { items: [{ name: "Sword", type: "weapon", flags: { "trg-prime": { spellItem: true } } }] });
  ok("D3 an item that is not an ability is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_ITEMS, { items: [{ name: "Smuggled", type: "ability", flags: {} }] });
  ok("D4 an ability no spell stamped is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_ITEMS, { items: [] });
  ok("D5 an empty list is refused", rec.reply?.ok === false);
}
ok("D6 the speed grant goes through createTargetSpellItems", /const \[madeSpeed\] = await createTargetSpellItems\(target, \[\{/.test(effects));
ok("D7 the ability grant goes through createTargetSpellItems", /const \[madeAbility\] = await createTargetSpellItems\(target, \[payload\]\)/.test(effects));

/* E. Difficult ground on a player's Region ----------------------------- */
{
  const behaviours = [{ type: "modifyMovementCost", name: "Entangle", system: { difficulties: {} } }];
  const { rec, target } = await relay(RELAY_ACTIONS.REGION_BEHAVIOURS, { behaviours, name: "Entangle (difficult)" });
  ok("E1 the region is renamed", rec.calls[0]?.[0] === "rename" && rec.calls[0]?.[2]?.name === "Entangle (difficult)", JSON.stringify(rec.calls));
  ok("E2 and its behaviours created on the fetched region", rec.calls[1]?.[0] === "behaviours" && rec.calls[1]?.[1] === target);
}
{
  const { rec } = await relay(RELAY_ACTIONS.REGION_BEHAVIOURS, { behaviours: [{ type: "executeScript", system: { source: "x" } }] });
  ok("E3 a script behaviour is refused — the GM's client never runs a player's code", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.REGION_BEHAVIOURS, { behaviours: [{ type: "modifyMovementCost" }] }, { placed: false });
  ok("E4 a region the asker did not place is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
const cast = read("module/magic/cast-workflow.mjs");
ok("E5 the cast's difficult ground goes through createSpellRegionBehaviours",
  /if \(!\(await createSpellRegionBehaviours\(region, behaviours, terrainRegionName\(spec, spell\.name\)\)\)\) \{/.test(cast));
ok("E6 a refusal is said on the card", /the GM's client did not make the ground difficult/.test(cast));
ok("E7 the storm's ground goes through it too", /await createSpellRegionBehaviours\(region, behaviours\);/.test(read("module/magic/storm-workflow.mjs")));
ok("E8 the helper asks whether the USER may create behaviours, not whether the region is owned",
  /BehaviorClass\?\.canUserCreate\?\.\(game\.user\) === true/.test(relayed));

/* F. A stamp on a condition a spell laid -------------------------------- */
ok("F0 the stamps are exactly these", JSON.stringify(EFFECT_STAMP_FLAGS) === JSON.stringify(["conditionHold", "conditionSave", "endSave", "escapeDC", "escapeFrom"]));
{
  const { rec, effect } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", flags: { escapeDC: 24, escapeFrom: "Volcanic Inferno" } });
  ok("F1 a named stamp is set on the target's own effect", rec.calls[0]?.[0] === "stamp" && rec.calls[0]?.[1] === effect
    && rec.calls[0]?.[2]?.escapeDC === 24, JSON.stringify(rec.calls));
}
{
  const { rec } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", flags: { escapeDC: 1, changes: [] } });
  ok("F2 any other flag in the stamp refuses the whole request", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "nope", flags: { escapeDC: 1 } });
  ok("F3 an effect not on the target is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", flags: {} });
  ok("F4 an empty stamp is refused", rec.reply?.ok === false);
}
{
  const { rec, effect } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", remove: true });
  ok("F5 a spell's own effect may be removed", rec.calls[0]?.[0] === "delete" && rec.calls[0]?.[1] === effect);
}
{
  const { rec } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e2", remove: true });
  ok("F6 an effect no spell made may not be removed", rec.reply?.ok === false && rec.calls.length === 0);
}
for (const [file, re, label] of [
  ["module/magic/condition-save-workflow.mjs", /await setEffectFlags\(effect, \{ \[CONDITION_SAVE_FLAG\]: descriptor \}\)/, "the escape save"],
  ["module/magic/end-save-workflow.mjs", /await setEffectFlags\(effect, \{ \[END_SAVE_FLAG\]: descriptor \}\)/, "the end save"],
  ["module/magic/spell-effects.mjs", /await setEffectFlags\(e, \{ conditionHold: holdAt \}\)/, "a held condition"],
  ["module/magic/spell-effects.mjs", /await setEffectFlags\(doc, \{\s*\[ESCAPE_DC_FLAG\]/, "an Escape's DC"]
]) ok(`F7 ${label} is stamped through setEffectFlags`, re.test(read(file)));

/* G. A spell's forced movement ------------------------------------------- */
{
  const { rec, caster, target } = await relay(RELAY_ACTIONS.FORCED_MOVE, { sourceUuid: "Actor.wiz", feet: 5 });
  ok("G1 the GM plans the move itself, from the caster, for the distance", rec.calls[0]?.[0] === "move" && rec.calls[0]?.[1] === caster
    && rec.calls[0]?.[2] === target && rec.calls[0]?.[3] === 5, JSON.stringify(rec.calls));
}
{
  const { rec } = await relay(RELAY_ACTIONS.FORCED_MOVE, { sourceUuid: "Actor.wiz", feet: 5 }, { owns: false });
  ok("G2 an asker who does not own the source is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.FORCED_MOVE, { sourceUuid: "Actor.wiz", feet: FORCED_MOVE_MAX_FEET + 5 });
  ok("G3 a distance past the bound is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.FORCED_MOVE, { sourceUuid: "Actor.wiz", feet: -10 });
  ok("G4 a negative distance is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
const forced = read("module/combat/forced-movement-workflow.mjs");
ok("G5 forceMoveAway relays a token this client does not own",
  /if \(!direct && targetToken\?\.isOwner === false && game\?\.user\?\.isGM !== true\) \{\s*const \{ relayForcedMove \}/.test(forced));
ok("G6 and the GM's own pass is direct", /forceMoveAway\(source, target, feet, \{ direct: true \}\)/.test(live));

/* H. The records and the stasis --------------------------------------------- */
ok("H1 Cutting Words writes through setTargetFlag", /await setTargetFlag\(target, CUTTING_WORDS_FLAG, record\)/.test(read("module/magic/cutting-words-workflow.mjs")));
ok("H2 Spell Drain writes through setTargetFlag", /await setTargetFlag\(target, SPELL_DRAIN_FLAG, record\)/.test(read("module/magic/spell-drain-workflow.mjs")));
ok("H3 a flat ladder's curse writes through setTargetFlag", /await setCurse\(target, CURSE_FLAG, \{/.test(read("module/magic/flat-ladder-workflow.mjs")));
const stasis = read("module/magic/stasis-workflow.mjs");
ok("H4 Stasis creates its effect through createEffectsOn", /await createEffectsOn\(target, \[\{\s*name: spec\.label,/.test(stasis)
  && !/target\.createEmbeddedDocuments\("ActiveEffect"/.test(stasis));
ok("H5 and replaces an older one through removeSpellEffect", /if \(existing\) await removeSpellEffect\(existing\);/.test(stasis));

/* I. A wall spell's segments ------------------------------------------- */
{
  const walls = [{ c: [0, 0, 100, 0], move: 20, sight: 20, light: 20, sound: 0 }];
  const { rec, target } = await relay(RELAY_ACTIONS.SPELL_WALLS, { walls, castId: "c9" });
  ok("I1 the segments are made on the fetched region with the cast's id", rec.calls[0]?.[0] === "walls" && rec.calls[0]?.[1] === target
    && rec.calls[0]?.[3] === "c9" && rec.calls[0]?.[2]?.[0]?.c?.[2] === 100, JSON.stringify(rec.calls));
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_WALLS, { walls: [{ c: [0, 0, 1, 1] }] }, { placed: false });
  ok("I2 a region the asker did not place is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_WALLS, { walls: [{ c: [0, 0, "x", 1] }] });
  ok("I3 a segment that is not four numbers is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
{
  const seg = relayableWallSegments([{ c: [1, 2, 3, 4], move: 20, door: 1, ds: 2, dir: 1, flags: { x: 1 } }]);
  ok("I4 only coordinates and the four senses survive", JSON.stringify(seg) === JSON.stringify([{ c: [1, 2, 3, 4], move: 20, sight: 0, light: 0, sound: 0 }]), JSON.stringify(seg));
  ok("I5 too many segments are refused", relayableWallSegments(Array.from({ length: 65 }, () => ({ c: [0, 0, 1, 1] }))) === null);
}
const wallWf = read("module/magic/wall-spell-workflow.mjs");
ok("I6 a player's wall goes through relaySpellWalls", /await relaySpellWalls\(region, docs\.map\(/.test(wallWf));
ok("I7 and only a user who may create walls makes them directly", /WallDocument\?\.canUserCreate\?\.\(game\.user\) === true/.test(wallWf));

/* J. The two data defects ------------------------------------------------ */
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  try { fs.rmSync(path.join(tmp, "LOCK")); } catch { /* none */ }
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const byName = {};
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!")) byName[v.name] = v.system;
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const { normaliseGrantedAbility } = await import("../module/magic/granted-ability.mjs");
  const nv = byName.Nightvision;
  ok("J1 Nightvision's grant is well-formed", Boolean(normaliseGrantedAbility(nv?.effects?.[0])), JSON.stringify(nv?.effects));
  ok("J2 and names the pack's Nightvision", nv?.effects?.[0]?.uuid === "Compendium.trg-prime.abilities.Item.Dkq2b7EZDdPKGzxy");
  ok("J3 its touch warp targets one creature", nv?.warps?.[0]?.mods?.targetCap === 1);
  // EVERY grantAbility row in the pack, not just the one that was caught.
  const bad = Object.entries(byName).flatMap(([n, sys]) => (sys.effects ?? [])
    .filter((e) => e?.kind === "grantAbility" && !normaliseGrantedAbility(e)).map(() => n));
  ok("J4 no spell's ability grant is malformed", bad.length === 0, bad.join(", "));
  const cs = byName["Conjuration Shield"];
  ok("J5 Conjuration Shield rolls nothing at casting", cs?.category === "utility" && !cs?.defence, JSON.stringify([cs?.category, cs?.defence]));
  ok("J6 and says the conjurer's Will save on its card", /Will save against this spell from the conjuring caster/.test(cs?.effects?.[0]?.text ?? ""));
}

if (failures.length) {
  process.stderr.write(`verify-core-sweep-3718: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-core-sweep-3718: OK — ${checks} checks.\n`);
