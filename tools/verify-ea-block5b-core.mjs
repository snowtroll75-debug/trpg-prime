#!/usr/bin/env node
/**
 * verify-ea-block5b-core — TRG Prime 3.683.0, group b of the seams Eldritch
 * Arts' Block 5 (racial and general feats) needs, from the Block 5 audit
 * (docs/ELDRITCH_ARTS_BLOCK5_AUDIT.md in the module), answered by Graham on
 * 3 November 2026 ("as proposed", Q61 and Q72 among them).
 *
 *   L   C4   the light where the roller stands: the conditionals'
 *             `lightLevels` axis, both paths, and `helpers.lightLevelAt`
 *   U   C5   `helpers.isUnderwater` and `helpers.rollFalling` (no dialog
 *             when the distance is given)
 *   T   C16  `ignoresDifficultTerrain: "magical"`, honoured only on ground
 *             a spell made
 *   M   C17  `helpers.movementThisTurn`: the measured feet and the AP spent
 *             on movement this turn
 *   P   C18  an incorporeal mover passes through occupied squares and may
 *             not end there
 *   S   C19  `helpers.enterShadowStance`, and Shadow Stance's effect is a
 *             stance (the fix)
 *
 * Behavioural where Foundry is not needed: the pure functions are run, and
 * the workflows are driven with stub actors. Structural only for the call
 * sites a live canvas reaches.
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
const quiet = async (fn) => { const e = console.error; const w = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = e; console.warn = w; } };

const dialogCalls = [];
globalThis.foundry = globalThis.foundry ?? {
  applications: { api: { DialogV2: { wait: async () => { dialogCalls.push(1); return null; } }, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } },
  utils: {
    getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o),
    setProperty: (o, p, v) => { const ks = p.split("."); let c = o; for (const k of ks.slice(0, -1)) { c[k] ??= {}; c = c[k]; } c[ks.at(-1)] = v; },
    escapeHTML: (s) => String(s), randomID: () => "r1", deepClone: (o) => JSON.parse(JSON.stringify(o ?? {}))
  }
};
globalThis.game = globalThis.game ?? { settings: { get: () => null }, combat: null, user: { isGM: true, targets: new Set() }, time: { worldTime: 0 }, modules: new Map() };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, callAll() {}, once() {} };
const warnings = [];
globalThis.ui = globalThis.ui ?? { notifications: { warn: (m) => warnings.push(m), info() {}, error() {} } };
const cards = [];
globalThis.ChatMessage = globalThis.ChatMessage ?? { create: async (d) => { cards.push(d); return d; }, getSpeaker: () => ({}) };
globalThis.CONST = globalThis.CONST ?? {};

/** A stub actor: flags, effects, AP, embedded documents. */
function stubActor({ id = "a1", items = [], inCombat = false, token = null } = {}) {
  const flags = {};
  const effects = [];
  let n = 0;
  const actor = {
    id, uuid: `Actor.${id}`, name: "Korg", type: "character", inCombat, token,
    system: { resources: { ap: { value: 3, max: 3 } }, identity: { level: 5, size: "medium" }, combat: { saves: {} } },
    items, effects, appliedEffects: effects,
    getFlag: (s, k) => flags[k], setFlag: async (s, k, v) => { flags[k] = v; }, unsetFlag: async (s, k) => { delete flags[k]; },
    getActiveTokens: () => (token ? [token] : []),
    update: async (u) => {
      actor.updates.push(u);
      for (const [k, v] of Object.entries(u)) {
        if (k === "system.resources.ap.value") actor.system.resources.ap.value = v;
        else if (k.startsWith("flags.trg-prime.")) flags[k.slice("flags.trg-prime.".length)] = v;
      }
    },
    updates: [],
    createEmbeddedDocuments: async (t, docs) => docs.map((d) => {
      const e = { id: `e${++n}`, ...d, disabled: false, getFlag: (s, k) => d.flags?.[s]?.[k] };
      effects.push(e);
      return e;
    }),
    deleteEmbeddedDocuments: async (t, ids) => { for (const i of ids) { const at = effects.findIndex((e) => e.id === i); if (at >= 0) effects.splice(at, 1); } },
    toggleStatusEffect: async () => true,
    hasCondition: () => false
  };
  actor.flagStore = flags;
  return actor;
}

const cond = await imp("conditionals.mjs");
const lw = await imp("light-workflow.mjs");
const pf = await imp("combat/passive-feats.mjs");
const dt = await imp("magic/difficult-terrain.mjs");
const caw = await imp("creature-aura-workflow.mjs");
const mv = await imp("combat/movement.mjs");
const mw = await imp("combat/movement-workflow.mjs");
const apw = await imp("combat/action-points-workflow.mjs");
const space = await imp("combat/space.mjs");
const stance = await imp("stance-declarations.mjs");
const fw = await imp("feats-workflow.mjs");
const mapi = await imp("module-api-workflow.mjs");
const api = await quiet(() => mapi.buildModuleApi());
const helpers = api?.helpers ?? api?.modules?.helpers ?? {};
const src = {
  check: read("module", "dice", "check.mjs"),
  dialog: read("module", "apps", "check-dialog.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  falling: read("module", "combat", "falling-workflow.mjs"),
  fly: read("module", "combat", "fly-workflow.mjs"),
  movement: read("module", "combat", "movement-workflow.mjs"),
  storm: read("module", "magic", "storm-workflow.mjs"),
  feats: read("module", "feats-workflow.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs")
};

// ── L: the light where the roller stands (C4) ───────────────────────────
ok("L1 the axis is on the list, with its context key", cond.SCOPE_AXES.includes("lightLevels") && cond.AXIS_CONTEXT_KEYS.lightLevels === "lightLevel");
const levelsOf = (lightLevels) => cond.normaliseConditional({ kind: "advantage", when: { lightLevels } }, { id: "l", name: "l" })?.when?.lightLevels ?? null;
equal("L2 \"5 or less\" is 1 to 5", levelsOf({ max: 5 }), ["1", "2", "3", "4", "5"]);
equal("L3 Moonlight Precision's \"levels 5 & 6\", as a list or a range", [levelsOf([5, 6]), levelsOf({ min: 5, max: 6 })], [["5", "6"], ["5", "6"]]);
equal("L4 off the ladder is dropped, an empty range is nothing (the entry with it)", [levelsOf([0, 11, "x"]), levelsOf({ min: 7, max: 3 }), levelsOf(null)], [null, null, null]);
const veil = cond.normaliseConditional({ kind: "modifier", value: 2, type: "racial", label: "Veil of Silence", auto: true, when: { checkTypes: ["skill"], subjects: ["stealth"], lightLevels: { max: 5 } } }, { id: "v", name: "Veil of Silence" });
equal("L5 an entry keeps its range as levels", veil?.when?.lightLevels, ["1", "2", "3", "4", "5"]);
equal("L6 it holds at Dim Light and below, not at Twilight", [5, 3, 6, 8].map((lightLevel) => cond.matchesCheck(veil, { checkType: "skill", subject: "stealth", lightLevel })), [true, true, false, false]);
equal("L7 and with no light known it holds nowhere (no token, no scene)", ["", undefined, null].map((lightLevel) => cond.matchesCheck(veil, { checkType: "skill", subject: "stealth", lightLevel })), [false, false, false]);
const moon = cond.normaliseConditional({ kind: "modifier", value: 1, type: "racial", auto: true, when: { attackModes: ["ranged"], lightLevels: [5, 6] } }, { id: "m", name: "Moonlight Precision" });
equal("L8 Moonlight Precision: 5 and 6 only", [4, 5, 6, 7].map((lightLevel) => cond.matchesCheck(moon, { checkType: "attack", attackMode: "ranged", lightLevel })), [false, true, true, false]);
const fallback = cond.normaliseConditional({ kind: "modifier", value: 2, label: "In the dark? (manual)", when: { checkTypes: ["skill"], not: { lightLevels: ["*"] } } }, { id: "f", name: "x" });
equal("L9 `not: {lightLevels: [\"*\"]}` stands down once the light is known", [cond.matchesCheck(fallback, { checkType: "skill", lightLevel: 5 }), cond.matchesCheck(fallback, { checkType: "skill", lightLevel: "" })], [false, true]);
ok("L10 an entry scoped by light alone is a scope, not a malformed row", Boolean(cond.normaliseConditional({ kind: "advantage", when: { lightLevels: { max: 5 } } }, { id: "g", name: "g" })));
equal("L11 the automatic path applies it at the roller's level", cond.automaticSelections([veil], { checkType: "skill", subject: "stealth", lightLevel: 4 }).modifiers.map((m) => m.value), [2]);
// The ambient level, read off a stub scene: the roller's own Nightvision raises nothing (Q61).
const scene = { getFlag: (s, k) => (k === "lightLevel" ? 5 : null), environment: { darknessLevel: 0 }, tokens: [], grid: { size: 100, distance: 5 } };
const nightElf = stubActor({ id: "elf", items: [{ type: "ability", name: "Nightvision", system: {} }, { type: "ability", name: "Darkvision", system: {} }] });
const tokenDoc = { id: "t1", parent: scene, regions: new Set(), x: 0, y: 0, actor: nightElf };
scene.tokens = [tokenDoc];
nightElf.token = tokenDoc;
equal("L12 the ambient level at a token (a Token or its document)", await quiet(async () => [lw.ambientLightLevelAt(tokenDoc), lw.ambientLightLevelAt({ document: tokenDoc })]), [5, 5]);
equal("L13 at an actor's own token, not raised by its Nightvision or Darkvision", await quiet(async () => lw.ambientLightLevelOf(nightElf)), 5);
equal("L14 nothing with no token", await quiet(async () => [lw.ambientLightLevelOf(stubActor({ id: "x" })), lw.ambientLightLevelAt(null)]), [null, null]);
equal("L15 helpers.lightLevelAt answers the same", await quiet(() => helpers.lightLevelAt?.(tokenDoc)), 5);
ok("L16 the automatic path reads the roller's token only when an entry asks, and carries it",
  /const wantsLight = entries\.some\(\(e\) => e\?\.when\?\.lightLevels \|\| e\?\.not\?\.lightLevels\);/.test(src.check)
  && /: wantsLight \? \(\(await import\("\.\.\/light-workflow\.mjs"\)\)\.ambientLightLevelOf\(check\.actor\) \?\? ""\) : "";/.test(src.check)
  && /\n\s*lightLevel: rollerLight,\n/.test(src.check));
ok("L17 the dialog reads it off the roller's token too", /lightLevel: String\(lightLevel \?\? ""\)\.trim\(\) !== "" \? lightLevel : \(ambientLightLevelOf\(actor\) \?\? ""\),/.test(src.dialog));

// ── U: underwater and falling (C5) ──────────────────────────────────────
ok("U1 helpers.isUnderwater is the core's own test", /isUnderwater: async \(token\) => \(await import\("\.\/combat\/underwater-workflow\.mjs"\)\)\.tokenIsUnderwater\(token\),/.test(src.apiw));
equal("U2 a token on no scene is in no water", await helpers.isUnderwater?.(null), false);
ok("U3 a given distance skips the dialog; every core caller still asks",
  /const result = ask === false\s*\? \{ distance: startingDistance \}\s*: await DialogV2\.wait\(\{/.test(src.falling)
  && /ask = true \} = \{\}\) \{/.test(src.falling)
  && /await rollFalling\(actor, \{ distance: verdict\.distance \}\);/.test(src.fly));
const faller = stubActor({ id: "fall" });
dialogCalls.length = 0;
const fell = await quiet(() => helpers.rollFalling?.(faller, { distance: 0 }));
equal("U4 helpers.rollFalling with a distance rolls with no dialog", [dialogCalls.length, fell?.damage, fell?.check], [0, 0, null]);
await quiet(() => helpers.rollFalling?.(faller, {}));
equal("U5 and without one it asks, as the sheet's button does", dialogCalls.length, 1);
ok("U6 the helper lands on nobody unless told", /rollFalling: async \(actor, \{ distance = null, onto = null, note = "" \} = \{\}\) => \{/.test(src.apiw)
  && /ask: !given \}\);/.test(src.apiw));

// ── T: magical difficult terrain (C16) ──────────────────────────────────
const drift = { name: "Astral Drift", flags: { "trg-prime": { ignoresDifficultTerrain: "magical" } } };
const wild = { name: "Wild Stride", flags: { "trg-prime": { ignoresDifficultTerrain: true } } };
const drifter = { items: [drift], effects: [] };
equal("T1 the magical kind eases nothing on its own (no path told)", [pf.terrainReliefName(drifter, null), pf.ignoresDifficultTerrain(drifter, null)], [null, false]);
equal("T2 it eases a path whose ground a spell made", pf.terrainReliefName(drifter, null, { magicalTerrain: true }), "Astral Drift");
equal("T3 and not one that is not", pf.terrainReliefName(drifter, "step", { magicalTerrain: false }), null);
let asked = 0;
equal("T4 the blanket kind is unchanged, and the path is not scanned for it", [pf.terrainReliefName({ items: [wild], effects: [] }, null, { magicalTerrain: () => { asked += 1; return false; } }), asked], ["Wild Stride", 0]);
equal("T5 the scan is asked once however many carriers ask it, and only when one is met", [pf.terrainReliefName({ items: [drift, { name: "x", flags: {} }], effects: [drift] }, null, { magicalTerrain: () => { asked += 1; return false; } }), asked], [null, 1]);
equal("T6 only magical ground: none, all, a mix", [pf.onlyMagicalTerrain([]), pf.onlyMagicalTerrain([{ magical: true }, { magical: true }]), pf.onlyMagicalTerrain([{ magical: true }, { magical: false }])], [false, true, false]);
const spellGround = caw.terrainBehaviours(dt.terrainAuraShape(dt.normaliseDifficultTerrain({ kind: "difficultTerrain" }), "Verdant Snare"))[0];
equal("T7 a spell's ground is marked magical", spellGround?.flags?.["trg-prime"]?.[dt.MAGICAL_TERRAIN_FLAG], true);
const auraGround = caw.terrainBehaviours({ kind: "terrain", name: "Mire", movementCostMultiplier: 2 })[0];
equal("T8 a creature's aura is not", auraGround?.flags, undefined);
equal("T9 the mark is the flag the movement workflow reads", [dt.MAGICAL_TERRAIN_FLAG, /import \{ MAGICAL_TERRAIN_FLAG \} from "\.\.\/magic\/difficult-terrain\.mjs";/.test(src.movement)], ["magicalTerrain", true]);
ok("T10 the storm's rain keeps the mark beside its own", /\[SYSTEM_ID\]: \{ \.\.\.\(b\.flags\?\.\[SYSTEM_ID\] \?\? \{\}\), \[STORM_TERRAIN_FLAG\]: true \}/.test(src.storm));
ok("T11 the movement workflow tells the relief whether the path's ground is all magical",
  /const easedBy = terrainReliefName\(actor, armedKey, \{\s*magicalTerrain: \(\) => onlyMagicalTerrain\(costingTerrainOnPath\(movement\)\)\s*\}\);/.test(src.movement)
  && /out\.push\(\{ magical: costing\.every\(\(b\) => Boolean\(b\.getFlag\?\.\(SYSTEM_ID, MAGICAL_TERRAIN_FLAG\)/.test(src.movement)
  && /return !Number\.isFinite\(d\) \|\| d > 1;/.test(src.movement));

// ── M: movement this turn (C17) ─────────────────────────────────────────
equal("M1 a Movement-trait action counts; the drag's own spend does not", [
  mv.countsAsMovementAp({ traits: "Movement" }), mv.countsAsMovementAp({ traits: ["Move"] }),
  mv.countsAsMovementAp({ use: "stride", traits: "Movement" }), mv.countsAsMovementAp({ traits: "Attack, Flourish" })], [true, true, false, false]);
const turn = { combatId: "c1", round: 2, turn: 0 };
equal("M2 the record adds within a turn and starts again on another", [
  mv.nextMovementTraitRecord({ ...turn, ap: 1 }, 2, turn).ap, mv.nextMovementTraitRecord({ ...turn, round: 1, ap: 3 }, 1, turn).ap], [3, 1]);
const pools = { "stride:land": { movedCost: 40, apCharged: 2, movedFeet: 20 }, "action:step": { movedCost: 5, apCharged: 1, movedFeet: 5 } };
equal("M3 feet are the ruler's, not the terrain's price; AP is every pool's plus the turn's actions", mv.movementThisTurnFrom(pools, { ...turn, ap: 1 }, turn), { feet: 25, apOnMovement: 4 });
equal("M4 another turn's actions are not this turn's", mv.movementThisTurnFrom(pools, { ...turn, turn: 3, ap: 1 }, turn), { feet: 25, apOnMovement: 3 });
const mover = stubActor({ id: "mover", inCombat: true });
await mover.setFlag("trg-prime", "movementPools", pools);
await mover.setFlag("trg-prime", mv.MOVEMENT_TRAIT_AP_FLAG, { ...turn, ap: 1 });
game.combat = { started: true, id: "c1", round: 2, turn: 0, combatant: { actor: mover }, combatants: [] };
equal("M5 helpers.movementThisTurn reads the actor's pools and record", await helpers.movementThisTurn?.(mover), { feet: 25, apOnMovement: 4 });
const stander = stubActor({ id: "stander", inCombat: true });
game.combat.combatant = { actor: stander };
await quiet(() => apw.spendActionPoints(stander, 1, "Stand", { traits: "Movement" }));
await quiet(() => apw.spendActionPoints(stander, 1, "Stride", { use: "stride" }));
await quiet(() => apw.spendActionPoints(stander, 1, "Feint", { traits: "Attack" }));
equal("M6 a Movement-trait action's AP is recorded where it is spent; a Stride's and a Feint's are not", stander.flagStore[mv.MOVEMENT_TRAIT_AP_FLAG], { combatId: "c1", round: 2, turn: 0, ap: 1 });
game.combat = null;
equal("M7 zero outside a running combat", await helpers.movementThisTurn?.(mover), { feet: 0, apOnMovement: 0 });
ok("M8 both kinds of move record the measured distance; a teleport returns before either",
  /armedPool\.movedFeet = \(Number\(armedPool\.movedFeet\) \|\| 0\) \+ proposedDistance\(movement\);/.test(src.movement)
  && /stridePool\.movedFeet = \(Number\(stridePool\.movedFeet\) \|\| 0\) \+ proposedDistance\(movement\);/.test(src.movement)
  && src.movement.indexOf("if (!speedKey) {") > 0 && src.movement.indexOf("if (!speedKey) {") < src.movement.indexOf("armedPool.movedFeet"));

// ── P: incorporeal passage (C18) ────────────────────────────────────────
const enemy = { moverSize: "medium", occupantSize: "medium", ally: false };
equal("P1 an incorporeal mover passes an enemy's square, no Tumble, no extra cost", (({ allowed, needsTumble, multiplier }) => ({ allowed, needsTumble, multiplier }))(space.passageThrough({ ...enemy, incorporeal: true })), { allowed: true, needsTumble: false, multiplier: 1 });
equal("P2 anyone else is refused as before", space.passageThrough(enemy).allowed, false);
equal("P3 and it still may not end there", space.mayEndInSquare({ moverSize: "medium", occupants: [{ size: "medium" }] }).allowed, false);
const ethereal = { flags: { "trg-prime": { grantedTraits: ["incorporeal"] } } };
equal("P4 incorporeal by an effect: a list, a string, not disabled, not suppressed, not another trait", [
  space.grantsIncorporealPassage([ethereal]), space.grantsIncorporealPassage([{ flags: { "trg-prime": { grantedTraits: "Beast, Incorporeal" } } }]),
  space.grantsIncorporealPassage([{ ...ethereal, disabled: true }]), space.grantsIncorporealPassage([{ ...ethereal, isSuppressed: true }]),
  space.grantsIncorporealPassage([{ flags: { "trg-prime": { grantedTraits: ["beast"] } } }])], [true, true, false, false, false]);
ok("P5 the space rules ask it of the mover's effects and pass it on",
  /const incorporeal = grantsIncorporealPassage\(Array\.from\(mover\.appliedEffects \?\? mover\.effects \?\? \[\]\)\);/.test(src.movement)
  && /swarm: moverIsSwarm \|\| isSwarm\(other\.actor\?\.system\),\n\s*incorporeal\n\s*\}\);/.test(src.movement));

// ── S: Shadow Stance (C19) ──────────────────────────────────────────────
const shadowItem = () => ({ id: "ss", type: "ability", name: "Shadow Stance", img: "x", uuid: "Item.ss", system: { traits: "Open, Stance" } });
const korg = stubActor({ id: "korg", items: [shadowItem()] });
const entered = await quiet(() => helpers.enterShadowStance?.(korg));
const shadow = korg.effects.find((e) => e.name === "Shadow Stance");
equal("S1 helpers.enterShadowStance enters it", [entered, Boolean(shadow)], [true, true]);
ok("S2 THE FIX: its effect is a stance, so \"any stance\" sees it", shadow?.flags?.["trg-prime"]?.featStance === true && stance.inAnyStance(korg.effects));
equal("S3 and it keeps its name, which the attack workflow reads", shadow?.name, "Shadow Stance");
// In combat: the reaction's terms.
const fighter = stubActor({ id: "kf", items: [shadowItem()], inCombat: true });
fighter.effects.push({ id: "old", name: "Crane Stance", disabled: false, flags: { "trg-prime": { featStance: true, featSource: "other" } }, getFlag: (s, k) => ({ featStance: true, featSource: "other" })[k] });
// An Attack already made this turn: Open refuses the stance …
game.combat = { started: true, id: "c9", round: 3, turn: 1, combatant: { actor: stubActor({ id: "someone" }) }, combatants: [] };
await fighter.setFlag("trg-prime", "traitUsage", { attack: 1 });
warnings.length = 0;
const opened = await quiet(() => helpers.enterShadowStance?.(fighter, { apCost: 0 }));
equal("S4a Open refuses it after an Attack", [opened, warnings.length > 0, fighter.effects.length], [false, true, 1]);
// … and `ignoreOpen` does not ask it.
const reacted = await quiet(() => helpers.enterShadowStance?.(fighter, { apCost: 0, ignoreOpen: true }));
equal("S4 as a reaction: 0 AP, Open not asked", [reacted, fighter.system.resources.ap.value], [true, 3]);
equal("S5 and the stance before it ends", fighter.effects.map((e) => e.name), ["Shadow Stance"]);
const second = stubActor({ id: "k2", items: [shadowItem()], inCombat: true });
game.combat.combatant = { actor: second };
const paid = await quiet(() => helpers.enterShadowStance?.(second));
equal("S6 at the printed cost: 1 AP", [paid, second.system.resources.ap.value], [true, 2]);
warnings.length = 0;
const again = await quiet(() => helpers.enterShadowStance?.(second, { apCost: 0, ignoreOpen: true }));
equal("S7 the Stance trait's one-round wait still holds", [again, warnings.some((w) => /wait at least one round/i.test(w))], [false, true]);
game.combat = null;
equal("S8 an actor with no Shadow Stance is told so", await quiet(() => helpers.enterShadowStance?.(stubActor({ id: "none" }))), false);
ok("S9 the Kornargon's button runs the same body", /"shadow stance": \{[\s\S]{0,400}await enterShadowStanceFor\(actor, item\);/.test(src.feats));
ok("S10 a later feat stance ends it, as any stance (enterFeatStance deletes every featStance effect)", /const existing = Array\.from\(actor\.effects \?\? \[\]\)\s*\.filter\(\(e\) => e\.getFlag\?\.\(SYSTEM_ID, FEAT_STANCE_FLAG\)\);/.test(src.feats));
ok("S11 the attack workflow still finds it by name", /String\(e\.name \?\? ""\)\.trim\(\)\.toLowerCase\(\) === stance\)\) return true;/.test(src.attack));

const label = "verify-ea-block5b-core";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${label}: OK — ${checks} checks.`);
