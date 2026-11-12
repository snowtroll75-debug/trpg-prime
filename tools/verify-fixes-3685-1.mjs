#!/usr/bin/env node
/**
 * verify-fixes-3685-1 — TRG Prime 3.685.1: the core half of the findings from
 * Eldritch Arts 0.10.0's live test (docs/LIVE_TESTING_REPORT_0.10.0.md in the
 * module, 7 November 2026). Every seam is default-off: a spell, row or effect
 * that does not use it reads as it did.
 *
 *   T  A teleport later than its cast (finding 1): `registerDeferredTeleport`;
 *      no "Teleported — Spatial Awareness" card or `teleportedTurn` record at
 *      the cast of a deferred spell; `helpers.teleportationArrives` and
 *      `helpers.teleportationFails` for the module to call when it moves.
 *   R  A rider in place of the weapon's damage, carded as such (finding 2):
 *      "your next ranged Strike deals 6d6 piercing in place of its damage,
 *      with nothing added", not "+6d6 piercing on your next ranged Strike".
 *   O  A spell aimed at an object, not a creature (finding 3):
 *      `flags.trg-prime.targetsObject` — no creature picker, count, range or
 *      trait-immunity gate.
 *   N  An unknown recurring type named in the effect's name (finding 4):
 *      "Recurring Damage 16 (Coldfire)".
 *   B  One effect for several bonus slots (finding 6): a `bonus` row's
 *      `slots`, `name` and `refresh` — one "Distracted", a re-application
 *      replacing the first.
 *
 * Executed where it can be: the real API object, the real registry, the real
 * teleport rule on a stub combat, the real rider line, the real target rule,
 * the real condition name, and the real spell engine (`applySpellEffects`)
 * laying the group and the rider on stub creatures. The wiring inside
 * `castSpell` and the GM relay is read.
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

const DialogV2 = { wait: async () => null, confirm: async () => false, prompt: async () => null };
globalThis.foundry = { applications: { api: { DialogV2, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c }, ux: {} },
  utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false, setProperty() {},
    mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), deepClone: (x) => structuredClone(x), escapeHTML: (s) => String(s), randomID: () => "r1", isNewerVersion: () => false } };
globalThis.Hooks = { on() {}, once() {}, off() {}, callAll() {}, call() { return true; } };
const cards = [];
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => { cards.push(d); return d; } };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };
globalThis.CONFIG = { statusEffects: [], specialStatusEffects: {} };
globalThis.CONST = {};
globalThis.game = { settings: { get: () => null }, user: { id: "u", isGM: true, targets: new Set() }, users: [], combat: null, time: { worldTime: 0 }, modules: new Map(), i18n: { localize: (s) => s } };
globalThis.canvas = { tokens: { placeables: [] }, scene: { regions: [] } };
globalThis.fromUuid = async () => null;

/** A creature the client owns: flags, effects and the two embedded writes. */
function creature(name, { skills = ["athletics", "stealth", "arcana"] } = {}) {
  const flags = {};
  const effects = [];
  const log = [];
  let n = 0;
  const self = {
    name, id: name, uuid: `Actor.${name}`, isOwner: true, effects, items: [], flags, log, failCreate: false,
    system: { skills: Object.fromEntries(skills.map((k) => [k, {}])), combat: { movement: { land: { base: 30 } } } },
    getFlag(scope, key) { return flags[scope]?.[key] ?? null; },
    async setFlag(scope, key, value) { (flags[scope] ??= {})[key] = value; },
    getActiveTokens: () => [],
    async createEmbeddedDocuments(type, data) { log.push("create"); if (self.failCreate) throw new Error("refused"); const made = data.map((d) => ({ ...structuredClone(d), id: `${name}-e${++n}` })); effects.push(...made); return made; },
    async deleteEmbeddedDocuments(type, ids) { log.push("delete"); for (const id of ids) { const i = effects.findIndex((e) => e.id === id); if (i >= 0) effects.splice(i, 1); } return ids; }
  };
  return self;
}

const src = {
  cw: read("module", "magic", "cast-workflow.mjs"),
  apiw: read("module", "module-api-workflow.mjs"), trw: read("module", "combat", "target-relay-workflow.mjs")
};

// ── T: a teleport later than its cast ──────────────────────────────────────
{
  const mapi = await imp("module-api-workflow.mjs");
  const api = await quiet(() => mapi.buildModuleApi());
  const TRW = await imp("trait-rules-workflow.mjs");
  equal("T1 nothing registered: no Teleportation spell is deferred (default-off)", await TRW.teleportDeferred({ spell: { name: "Panic Transposition" } }), false);
  ok("T2 registerDeferredTeleport refuses a key with no test, and takes a function", api.registerDeferredTeleport("x", null) === false
    && api.registerDeferredTeleport("panic", (ctx) => ctx.spell?.flags?.mod?.key === "panic", "mod") === true);
  await quiet(() => api.registerDeferredTeleport("thrower", () => { throw new Error("broken"); }, "mod"));
  equal("T3 the registered test decides; another spell is not deferred; a test that throws is no deferral",
    [await quiet(() => TRW.teleportDeferred({ spell: { flags: { mod: { key: "panic" } } } })), await quiet(() => TRW.teleportDeferred({ spell: { name: "Dimension Door", flags: {} } }))], [true, false]);

  // The rule the module calls when the teleport happens: the real one, on a running combat.
  const bearer = creature("Bearer");
  const spell = { name: "Panic Transposition", system: { traits: "Teleportation, Translocation, Utility" } };
  game.combat = null;
  cards.length = 0;
  equal("T4 out of combat nothing is carded or recorded, and nothing fails", [await api.helpers.teleportationArrives(bearer, spell, [bearer]), cards.length, bearer.getFlag("trg-prime", "teleportedTurn"), await api.helpers.teleportationFails(bearer)], [[], 0, null, false]);
  game.combat = { started: true, id: "c1", round: 2, turn: 3 };
  const before = await api.helpers.teleportationFails(bearer);
  const first = await api.helpers.teleportationArrives(bearer, spell, [bearer]);
  equal("T5 helpers.teleportationArrives, called when the teleport happens: the card posted and the turn stamped; teleportationFails false before it, true after",
    [before, first, cards.length, /Teleported — Spatial Awareness/.test(cards[0]?.content ?? ""), /trg-spatial-awareness/.test(cards[0]?.content ?? ""), bearer.getFlag("trg-prime", "teleportedTurn"), await api.helpers.teleportationFails(bearer)],
    [false, [], 1, true, true, { combatId: "c1", round: 2, turn: 3 }, true]);
  const second = await api.helpers.teleportationArrives(bearer, spell, [bearer]);
  equal("T6 a second in the same turn fails (its line returned, no second card); the next turn it does not", [second.length, /automatically fails/.test(second[0] ?? ""), cards.length, (game.combat = { started: true, id: "c1", round: 2, turn: 4 }) && await api.helpers.teleportationFails(bearer)], [1, true, 1, false]);
  game.combat = null;
  ok("T7 castSpell asks for a deferral (Teleportation spells only) before carding the teleport at the cast, and cards it otherwise",
    /const deferred = spellHasTrait\(spell\?\.system\?\.traits \?\? "", "teleportation"\) && await teleportDeferred\(\{ actor, spell, spellData \}\);\n\s+if \(!deferred\) \{\n\s+const moved = Array\.from\(game\.user\?\.targets \?\? \[\]\)\.map\(\(t\) => t\?\.actor\)\.filter\(Boolean\);\n\s+for \(const said of await teleportationArrives\(actor, spell, moved\)\) lines\.push\(line\(said\)\);/.test(src.cw)
    && (src.cw.match(/teleportationArrives\(/g) ?? []).length === 1);
  ok("T8 the API: registerDeferredTeleport wired to the registry, and the two helpers to trait-rules-workflow's own functions",
    typeof api.registerDeferredTeleport === "function" && typeof api.helpers.teleportationArrives === "function" && typeof api.helpers.teleportationFails === "function"
    && /teleportationArrives: async \(\.\.\.args\) => \(await import\("\.\/trait-rules-workflow\.mjs"\)\)\.teleportationArrives\(\.\.\.args\)/.test(src.apiw));
}

// ── R: the rider's cast line ───────────────────────────────────────────────
{
  const SR = await imp("magic/strike-riders.mjs");
  const spirit = SR.normaliseStrikeRider({ label: "Spirit Arrow", dice: "6d6", damageType: "piercing", scope: "ranged", once: true, replacesDamage: true, flat: true });
  equal("R1 Spirit Arrow (replacesDamage + flat): \"your next ranged Strike deals 6d6 piercing in place of its damage, with nothing added\"",
    SR.riderCastLine(spirit), "your next ranged Strike deals <strong>6d6 piercing</strong> in place of its damage, with nothing added");
  equal("R2 a replacing rider without flat keeps the Strike's other additions, and says so; one not once is every Strike's",
    [SR.riderCastLine(SR.normaliseStrikeRider({ label: "x", dice: "2d8", damageType: "fire", scope: "melee", once: true, replacesDamage: true })),
      SR.riderCastLine(SR.normaliseStrikeRider({ label: "x", dice: "2d8", damageType: "fire", scope: "any", once: false, replacesDamage: true, flat: true }))],
    ["your next melee Strike deals <strong>2d8 fire</strong> in place of its damage (its other additions still apply)",
      "every Strike with it deals <strong>2d8 fire</strong> in place of its damage, with nothing added"]);
  equal("R3 an ordinary rider, a conditional one and a rider with a condition read as before (default-off)",
    [SR.riderCastLine(SR.normaliseStrikeRider({ label: "x", dice: "1d6", damageType: "fire", scope: "melee", once: true })),
      SR.riderCastLine(SR.normaliseStrikeRider({ label: "x", dice: "1d6", damageType: "good", scope: "any", once: false, conditional: true, against: "fiends" })),
      SR.riderCastLine(SR.normaliseStrikeRider({ label: "x", dice: "1d4", damageType: "cold", scope: "melee", once: true, condition: "slowed", conditionValue: 1 }))],
    ["<strong>+1d6 fire</strong> on your next melee Strike",
      "<strong>1d6 good</strong> on every Strike with it <em>against fiends</em> — printed on the strike card for you to apply",
      "<strong>+1d4 cold</strong> on your next melee Strike, and <strong>slowed 1</strong> on a hit"]);
}

// ── O: an object, not a creature ───────────────────────────────────────────
{
  const C = await imp("magic/casting.mjs");
  const sys = { targets: "one arrow or bolt", category: "utility", area: "" };
  equal("O1 a spell naming a target asks for one; marked targetsObject it does not; an attack spell marked so does not; an area spell never did",
    [C.spellNeedsTarget(sys), C.spellNeedsTarget(sys, { flags: {} }), C.spellNeedsTarget(sys, { flags: { "trg-prime": { targetsObject: true } } }),
      C.spellNeedsTarget({ targets: "", category: "attack" }, { flags: { "trg-prime": { targetsObject: true } } }), C.spellNeedsTarget({ targets: "1 creature", area: "10-foot radius" })],
    [true, true, false, false, false]);
  equal("O2 only `true` is the mark (no reading of the printed word \"object\")",
    [C.spellTargetsObject({ flags: { "trg-prime": { targetsObject: "yes" } } }), C.spellTargetsObject({ system: { targets: "1 creature or object" } }), C.spellTargetsObject(null)], [false, false, false]);
  ok("O3 castSpell passes the spell to every target question (picker, trait immunity, the count), none asks without it, and the range gate skips an object's spell",
    (src.cw.match(/spellNeedsTarget\(spellData, spell\)/g) ?? []).length === 3 && !/spellNeedsTarget\(spellData\)/.test(src.cw)
    && /if \(!storingNow && !spellTargetsObject\(spell\) && \(game\.user\?\.targets\?\.size \?\? 0\)\) \{\n\s+\/\/ FROM ANOTHER TOKEN/.test(src.cw)
    && /if \(spellNeedsTarget\(spellData, spell\) && !storingNow && !reaction\?\.presetTargets && !presetTargets\) \{[\s\S]{0,900}promptTargetSelection\(actor,/.test(src.cw));
}

// ── O4: a marked spell's cast sees no creature target (review) ──────────────
{
  const CT = await imp("magic/cast-targets.mjs");
  const user = { targets: new Set() };
  const layer = new Map();
  const tokensLayer = { get: (id) => layer.get(id) };
  const token = (id) => { const t = { id, destroyed: false, setTarget(on) { if (on) user.targets.add(this); else user.targets.delete(this); } }; layer.set(id, t); return t; };
  const foe = token("foe"), ally = token("ally");
  user.targets.add(foe); user.targets.add(ally);
  let during = null;
  const out = await CT.withTargetsReleased(async () => { during = [...user.targets].map((t) => t.id); return "cast"; }, user, tokensLayer);
  equal("O4 for the length of the cast the user targets nobody (the row fallback, Bardic Conviction, the side gate, the final-failure stamp, metamagic and trgPrimeSpellCast all read an empty list); afterwards the same tokens again",
    [during, out, [...user.targets].map((t) => t.id).sort()], [[], "cast", ["ally", "foe"]]);
  await CT.withTargetsReleased(async () => { throw new Error("refused"); }, user, tokensLayer).catch(() => {});
  equal("O5 …restored when the cast throws, and a token the cast itself targeted is left as it is", [[...user.targets].map((t) => t.id).sort(),
    (await CT.withTargetsReleased(async () => { user.targets.add(foe); return [...user.targets].length; }, user, tokensLayer)), [...user.targets].map((t) => t.id).sort()], [["ally", "foe"], 1, ["ally", "foe"]]);
  // RE-REVIEW: restored by id from the canvas as it is; a token destroyed, deleted or on another scene is skipped.
  const gone = token("gone"), dead = token("dead"), redrawn = token("redrawn");
  user.targets = new Set([gone, dead, redrawn]);
  const fresh = { id: "redrawn", destroyed: false, setTarget(on) { if (on) user.targets.add(this); else user.targets.delete(this); } };
  let threw = false;
  try {
    await CT.withTargetsReleased(async () => { layer.delete("gone"); dead.destroyed = true; layer.set("redrawn", fresh); }, user, tokensLayer);
  } catch { threw = true; }
  equal("O7 restored by token id through canvas.tokens.get: a deleted or destroyed token is skipped (nothing throws), and a token redrawn during the cast is targeted as it now is",
    [threw, [...user.targets].map((t) => t.id), [...user.targets][0] === fresh], [false, ["redrawn"], true]);
  ok("O7b …the default layer is the canvas's", /export async function withTargetsReleased\(run, user = globalThis\.game\?\.user, tokens = globalThis\.canvas\?\.tokens\)/.test(read("module", "magic", "cast-targets.mjs")));
  ok("O6 castSpell runs a marked spell's whole cast inside it, and every other spell as before",
    /if \(spellTargetsObject\(spell\)\) \{\n\s+const \{ withTargetsReleased \} = await import\("\.\/cast-targets\.mjs"\);\n\s+return await withTargetsReleased\(\(\) => castSpellResolved\(actor, spell, options \?\? \{\}\)\);\n\s+\}\n\s+return await castSpellResolved\(actor, spell, options \?\? \{\}\);/.test(src.cw));
}

// ── N: an unknown recurring type in the effect's name ──────────────────────
{
  const M = await quiet(() => imp("conditions/manager.mjs"));
  equal("N1 \"Recurring Damage 16 (Coldfire)\" for an unknown type, as the end-phase card names it; a known type and no type read as before",
    [M.conditionEffectName("recurring", 16, "coldfire"), M.conditionEffectName("recurring", 24, "force"), M.conditionEffectName("recurring", 3, "fire"), M.conditionEffectName("recurring", 5, null), M.conditionEffectName("recurring", 5, "  ")],
    ["Recurring Damage 16 (Coldfire)", "Recurring Damage 24 (Force)", "Recurring Damage 3 (Fire)", "Recurring Damage 5", "Recurring Damage 5"]);
}

// ── B: one effect for several slots ────────────────────────────────────────
{
  const BG = await imp("magic/bonus-group.mjs");
  const SE = await quiet(() => imp("magic/spell-effects.mjs"));
  const SLOTS = ["attack", "allSkills", "fortitude", "reflex", "will", "spellcraft"];
  const row = { kind: "bonus", target: "targets", slots: SLOTS, bonusType: "status", value: -1, name: "Distracted", refresh: true };
  equal("B1 a row with slots is a group (its key from the name when refreshing); a single-slot row, an empty list and another kind are not",
    [BG.normaliseBonusGroup(row), BG.normaliseBonusGroup({ kind: "bonus", slot: "attack", value: 1 }), BG.normaliseBonusGroup({ kind: "bonus", slots: [" "] }), BG.normaliseBonusGroup({ kind: "condition", slots: ["attack"] }), BG.normaliseBonusGroup({ kind: "bonus", slots: ["will", "will"] })],
    [{ slots: SLOTS, name: "Distracted", refreshKey: "distracted" }, null, null, null, { slots: ["will"], name: "", refreshKey: "" }]);
  equal("B2 the keys: each slot's pool (the real bonusTargetFor), every skill the creature has, no repeats; a slot with nowhere to land refused",
    BG.bonusGroupKeys({ slots: [...SLOTS, "stealth", "nowhere"] }, { targetFor: SE.bonusTargetFor, skillKeys: ["athletics", "stealth"], bonusType: "status" }),
    { keys: ["system.combat.attack.status", "system.skills.athletics.status", "system.skills.stealth.status", "system.combat.saves.fortitude.status", "system.combat.saves.reflex.status", "system.combat.saves.will.status", "system.magic.spellcraft.status"], refused: ["nowhere"] });
  equal("B3 a refresh removes only an earlier effect of the same key; effects with no key refresh nothing",
    [BG.refreshedEffectIds([{ id: "a", flags: { "trg-prime": { refreshKey: "distracted" } } }, { id: "b", flags: { "trg-prime": { castId: "c" } } }, { id: "c", flags: { "trg-prime": { refreshKey: "other" } } }], [{ flags: { "trg-prime": { refreshKey: "Distracted" } } }]),
      BG.refreshedEffectIds([{ id: "a", flags: { "trg-prime": { refreshKey: "distracted" } } }], [{ flags: {} }])], [["a"], []]);
  equal("B4 the card's words", [BG.bonusGroupWords(["attack", "will"], { attack: "to attacks", will: "to Will saves" }), BG.bonusGroupWords(["dr"], {})], ["attacks and Will saves", "dr"]);

  // THE REAL SPELL ENGINE: one effect, the cast's id and timing, a second application replacing the first.
  const caster = creature("Caster");
  const foe = creature("Foe");
  const spell = { name: "Animate Moustache", img: "", uuid: "Item.am", system: { duration: "1 minute", effects: [] } };
  const lines = [];
  await quiet(() => SE.applySpellEffects(caster, spell, { targets: [foe], effects: [row], lines, castId: "cast1" }));
  const fx = foe.effects[0];
  equal("B5 applySpellEffects lays ONE \"Distracted\" effect with every −1 change (3 skills here), the cast's id, the spell's timing and the refresh key",
    [foe.effects.length, fx?.name, fx?.changes?.length, [...new Set(fx?.changes?.map((c) => c.value))], fx?.flags?.["trg-prime"]?.castId, fx?.flags?.["trg-prime"]?.spellEffect, fx?.flags?.["trg-prime"]?.refreshKey,
      fx?.changes?.map((c) => c.key).filter((k) => /saves|spellcraft|attack/.test(k))],
    [1, "Distracted", 8, ["-1"], "cast1", true, "distracted@animate moustache@Actor.Caster", ["system.combat.attack.status", "system.combat.saves.fortitude.status", "system.combat.saves.reflex.status", "system.combat.saves.will.status", "system.magic.spellcraft.status"]]);
  ok("B6 …and one card line naming it", lines.length === 1 && /Foe: <strong>Distracted<\/strong>, -1 status penalty to attacks, every skill check, Fortitude saves, Reflex saves, Will saves and Spellcraft/.test(lines[0] ?? ""), lines.join(" | "));
  await quiet(() => SE.applySpellEffects(caster, spell, { targets: [foe], effects: [row], lines: [], castId: "cast2" }));
  equal("B7 a second application from the same spell refreshes: one Distracted, the newest cast's; the new one created BEFORE the elder is removed",
    [foe.effects.length, foe.effects.map((e) => e.flags["trg-prime"].castId), foe.log.slice(-2)], [1, ["cast2"], ["create", "delete"]]);
  // REVIEW (3.685.1): ANOTHER SPELL'S DISTRACTED IS ITS OWN. Bubble Buffet's turn must not cut Animate Moustache's minute short.
  const buffet = { name: "Bubble Buffet", img: "", uuid: "Item.bb", system: { duration: "1 minute", effects: [] } };
  await quiet(() => SE.applySpellEffects(caster, buffet, { targets: [foe], effects: [{ ...row, duration: "until the end of its next turn" }], lines: [], castId: "castB" }));
  equal("B7b a Distracted from another spell stands beside it: one per spell, each its own key and cast", [foe.effects.length, foe.effects.map((e) => [e.name, e.flags["trg-prime"].castId, e.flags["trg-prime"].refreshKey])],
    [2, [["Distracted", "cast2", "distracted@animate moustache@Actor.Caster"], ["Distracted", "castB", "distracted@bubble buffet@Actor.Caster"]]]);
  await quiet(() => SE.applySpellEffects(caster, buffet, { targets: [foe], effects: [row], lines: [], castId: "castB2" }));
  equal("B7c …and Bubble Buffet again replaces only its own", foe.effects.map((e) => e.flags["trg-prime"].castId), ["cast2", "castB2"]);
  foe.failCreate = true;
  await quiet(async () => { try { await SE.applySpellEffects(caster, spell, { targets: [foe], effects: [row], lines: [], castId: "cast-fail" }); } catch { /* the refusal */ } });
  foe.failCreate = false;
  equal("B7d a create that fails loses nothing: the elder stays and nothing was deleted", [foe.effects.map((e) => e.flags["trg-prime"].castId), foe.log.at(-1)], [["cast2", "castB2"], "create"]);
  foe.effects.splice(1);
  // RE-REVIEW: ANOTHER CASTER'S IS ITS OWN. B's Animate Moustache must not replace A's, nor B's dismissal strip A's minute.
  const other = creature("Other");
  await quiet(() => SE.applySpellEffects(other, spell, { targets: [foe], effects: [row], lines: [], castId: "castO" }));
  equal("B7e another caster's Animate Moustache stands beside it: one per caster and spell", foe.effects.map((e) => [e.flags["trg-prime"].castId, e.flags["trg-prime"].refreshKey]),
    [["cast2", "distracted@animate moustache@Actor.Caster"], ["castO", "distracted@animate moustache@Actor.Other"]]);
  await quiet(() => SE.applySpellEffects(other, spell, { targets: [foe], effects: [row], lines: [], castId: "castO2" }));
  equal("B7f …and that caster casting it again refreshes only their own", foe.effects.map((e) => e.flags["trg-prime"].castId), ["cast2", "castO2"]);
  foe.effects.splice(1);
  await quiet(() => SE.applySpellEffects(caster, spell, { targets: [foe], effects: [{ ...row, refresh: false, name: "Hindered" }], lines: [], castId: "cast3" }));
  equal("B8 without refresh a group stands beside it", [foe.effects.length, foe.effects.map((e) => e.name)], [2, ["Distracted", "Hindered"]]);
  const ally = creature("Ally");
  await quiet(() => SE.applySpellEffects(caster, { ...spell, name: "Bless" }, { targets: [ally], effects: [{ kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: 1 }], lines: [], castId: "cast4" }));
  equal("B9 a single-slot row is the effect it was (default-off): named \"Spell\", one change, no refresh key",
    [ally.effects.length, ally.effects[0]?.name, ally.effects[0]?.changes, ally.effects[0]?.flags?.["trg-prime"]?.refreshKey], [1, "Bless", [{ key: "system.combat.attack.status", type: "custom", value: "1" }], undefined]);
  ok("B10 the GM's relay refreshes too, through the same create-first path as the direct one",
    /createEffects: \(target, effects\) => createRefreshing\(target, effects\),/.test(src.trw)
    && /if \(applyDirect\) return applyDirect\(\);\n\s+return createRefreshing\(target, data\);/.test(src.trw));
  equal("B11 the key: the group's name, the spell's and the caster's; none without refresh", [BG.bonusGroupRefreshKey({ refreshKey: "distracted" }, " Animate Moustache ", "Actor.a"), BG.bonusGroupRefreshKey({ refreshKey: "" }, "X", "Actor.a"), BG.bonusGroupRefreshKey({ refreshKey: "distracted" }, "", ""), BG.bonusGroupRefreshKey({ refreshKey: "distracted" }, "Animate Moustache")],
    ["distracted@animate moustache@Actor.a", "", "distracted", "distracted@animate moustache"]);
  // TWO SPELLS' DISTRACTED NEVER MAKE −2 (the review's question): the real stacking rule, with no override for any pool Distracted touches.
  const RES = await imp("dice/resolution.mjs");
  const REG = await imp("bonuses/registry.mjs");
  const two = RES.applyStacking([{ label: "Distracted", value: -1, type: "status" }, { label: "Distracted", value: -1, type: "status" }, { label: "Bless", value: 1, type: "status" }]);
  equal("B12 two status −1s are one −1 (highest-wins applies to penalties, Appendix 1), beside a status +1; no pool Distracted reaches overrides it",
    [two.total, two.modifiers.filter((m) => !m.applied).length, ["attack", "save", "skill", "spellcraft"].map((k) => REG.STACKING_OVERRIDES[k]?.status ?? "default"), RES.BONUS_TYPES.status.stacking],
    [0, 1, ["default", "default", "default", "default"], "highest"]);

  // THE RIDER'S CARD, through the same engine (finding 2 end to end).
  const archer = creature("Archer");
  const arrowLines = [];
  await quiet(() => SE.applySpellEffects(archer, { name: "Spirit Arrow", img: "", uuid: "Item.sa", system: { duration: "1 minute", effects: [] } },
    { targets: [archer], effects: [{ kind: "strikeRider", target: "self", label: "Spirit Arrow", dice: "6d6", damageType: "piercing", scope: "ranged", once: true, replacesDamage: true, flat: true }], lines: arrowLines, castId: "cast5" }));
  ok("R4 Spirit Arrow's cast card, from the spell engine: the arrow's damage in place of the Strike's, nothing added — no \"+6d6\"",
    arrowLines.some((l) => /Archer: your next ranged Strike deals <strong>6d6 piercing<\/strong> in place of its damage, with nothing added/.test(l)) && !arrowLines.some((l) => /\+6d6/.test(l)), arrowLines.join(" | "));
}

if (failures.length) {
  process.stdout.write(failures.map((f) => `  ✗ ${f}`).join("\n") + "\n");
  process.stdout.write(`verify-fixes-3685-1: ${checks} checks, ${failures.length} failure(s).\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`verify-fixes-3685-1: ${checks} checks, 0 failure(s).\n`);
}
