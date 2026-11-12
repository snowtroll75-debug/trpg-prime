#!/usr/bin/env node
/**
 * verify-ea-block3b-core — TRG Prime 3.681.0: the reaction seams Eldritch
 * Arts' Block 3b needs (Missed Chance, Second Chance, Prophetic Warning, Phase
 * Familiar, Resist Magic, Disrupting Magic, Eternity Resilience), from the
 * Block 3b audit (docs/ELDRITCH_ARTS_BLOCK3B_AUDIT.md in the module), answered
 * by Graham on 2 November 2026 ("Go with your proposals": Q26–Q35).
 *
 *   R   the five registries: their contracts and their refusals
 *   P   the readings: a degree's success and failure (Q26), which checks a
 *       reaction meets, the critical's disadvantage, the reroll's dice (Q27)
 *   C   check reactions run: advantage before, the reroll after, the lock
 *   G   the granted defences: one blow, one cast, read by actorDefences and
 *       met by the damage pipeline (resistance, immunity, precision)
 *   D   damage reactions run: asked once a cast, granted, cleared
 *   K   cast reactions and critical reactions run
 *   A   the ask across the table: the answerer, the timeouts, the protocol
 *   W   the wiring, in the files that call them
 *   Z   the version
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
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
globalThis.Hooks = globalThis.Hooks ?? { on() {}, callAll() {} };

const api = await imp("module-api.mjs");
const rx = await imp("reactions/reactions.mjs");
const rw = await imp("reactions/reactions-workflow.mjs");
const gd = await imp("combat/granted-defences.mjs");
const ct = await imp("creature-traits.mjs");
const dw = await imp("combat/damage-workflow.mjs");
const sys = JSON.parse(read("system.json"));
const src = {
  check: read("module", "dice", "check.mjs"),
  card: read("module", "dice", "check-card-interactions.mjs"),
  attack: read("module", "combat", "attack-workflow.mjs"),
  reroll: read("module", "combat", "attack-reroll-workflow.mjs"),
  cast: read("module", "magic", "cast-workflow.mjs"),
  effects: read("module", "magic", "spell-effects.mjs"),
  damage: read("module", "combat", "damage-workflow.mjs"),
  dying: read("module", "combat", "dying-workflow.mjs"),
  traits: read("module", "creature-traits.mjs"),
  pipeline: read("module", "combat", "damage.mjs"),
  action: read("module", "combat", "action-workflow.mjs"),
  apiw: read("module", "module-api-workflow.mjs"),
  ask: read("module", "reactions", "reaction-ask-workflow.mjs"),
  boot: read("scripts", "trg-prime.mjs"),
  saveSpells: read("module", "magic", "save-reaction-spells-workflow.mjs"),
  storm: read("module", "magic", "missile-storm-workflow.mjs"),
  actorDoc: read("module", "documents", "actor.mjs"),
  sites: Object.fromEntries(["magic/storm-workflow.mjs", "magic/flat-ladder-workflow.mjs", "magic/spiritual-weapon-workflow.mjs", "magic/directed-strike-workflow.mjs",
    "magic/recurring-ladder-workflow.mjs", "magic/elemental-nexus-workflow.mjs", "magic/luminance-workflow.mjs", "magic/area-save-workflow.mjs",
    "magic/hazard-terrain-workflow.mjs", "magic/thorns-workflow.mjs", "combat/sanctuary-gate.mjs", "dice/check-card-interactions.mjs"].map((f) => [f, read("module", ...f.split("/"))]))
};
const between = (text, from, to) => { const i = text.indexOf(from); const j = i < 0 ? -1 : text.indexOf(to, i + from.length); return i < 0 || j < 0 ? "" : text.slice(i, j); };
const order = (text, ...needles) => { let at = -1; for (const n of needles) { const i = text.indexOf(n, at + 1); if (i < 0 || i <= at) return false; at = i; } return true; };

/* ----------------------------------------------------------------- */
/* R — the registries                                                  */
/* ----------------------------------------------------------------- */
api.resetModuleRegistry();
ok("R1 a check reaction needs a before or an after", api.registerCheckReaction("x", {}) === false && api.registerCheckReaction("", { before: () => null }) === false);
ok("R2 …and either one alone is enough", api.registerCheckReaction("Before Only", { before: () => null }) && api.registerCheckReaction("After Only", { after: () => null }));
equal("R3 registered under their keys, each with what it gave", api.registeredCheckReactions().map((s) => [s.key, Boolean(s.before), Boolean(s.after)]), [["before only", true, false], ["after only", false, true]]);
ok("R4 damage, cast and critical reactions need a key and a function",
  [api.registerDamageReaction("d", null), api.registerCastReaction("", () => null), api.registerCriticalReaction("c", "x"), api.registerReactionStep("s", 1)].every((v) => v === false));
ok("R5 …and are kept when given them",
  api.registerDamageReaction("D", () => null) && api.registerCastReaction("K", () => null) && api.registerCriticalReaction("C", () => null) && api.registerReactionStep("Step One", () => 1)
  && api.registeredDamageReactions().length === 1 && api.registeredCastReactions().length === 1 && api.registeredCriticalReactions().length === 1);
ok("R6 a step is found by its name, whatever its case", typeof api.registeredReactionStep("STEP ONE") === "function" && api.registeredReactionStep("nope") === null);
ok("R7 the refusals are reported as problems, each naming its registry", ["registerCheckReaction", "registerDamageReaction", "registerCastReaction", "registerCriticalReaction", "registerReactionStep"].every((n) => api.registrationProblems().some((p) => String(p).includes(n))));
api.resetModuleRegistry();

/* ----------------------------------------------------------------- */
/* P — the readings                                                     */
/* ----------------------------------------------------------------- */
equal("P1 Q26: succeeds is Success or better; fails is Failure or worse; a Partial is neither",
  ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder", ""].map((d) => { const v = rx.degreeVerdict(d); return v.succeeded ? "S" : v.failed ? "F" : "-"; }),
  ["S", "S", "S", "-", "F", "F", "F", "-"]);
equal("P2 the checks a reaction meets: an attack, a save, a skill check; a spell attack's casting check is its attack",
  [{ type: "attack" }, { type: "save" }, { type: "skill" }, { type: "spellcraft" }, { type: "spellcraft", reactionAs: "attack" }, { type: "luck" }, { type: "initiative" }].map((c) => rx.reactionCheckType(c)),
  ["attack", "save", "skill", "", "attack", "", ""]);
equal("P3 a critical's disadvantage: a deadly critical's advantage cancels to normal; serious and minor roll at disadvantage",
  ["advantage", "normal", "disadvantage"].map(rx.biasWithDisadvantage), ["normal", "disadvantage", "disadvantage"]);
equal("P4 Q27: the reroll keeps every modifier but the first roll's Conviction die (a shared roll's too)",
  rx.withoutConvictionDie([{ label: "Spellcraft", value: 6 }, { label: "Conviction (+1d6)", value: 4 }, { label: "Conviction (+1d6, the shared roll's)", value: 3 }, { label: "Conviction: Advantage", value: 0 }]).map((m) => m.label),
  ["Spellcraft", "Conviction: Advantage"]);
equal("P5 an exploded d20 is read off the chosen chain", [rx.diceExploded({ chosen: { exploded: true } }), rx.diceExploded({ chosen: { exploded: false } }), rx.diceExploded(null)], [true, false, false]);

/* ----------------------------------------------------------------- */
/* C — check reactions, run                                             */
/* ----------------------------------------------------------------- */
const BIAS = { NORMAL: "normal", ADVANTAGE: "advantage", DISADVANTAGE: "disadvantage" };
function fakeCheck({ type = "save", degree = "success", total = 15, modifiers = [], exploded = false, ...rest } = {}) {
  const c = {
    actor: { name: "Roller", uuid: "Actor.roller" }, type, subject: "will", label: "Will Save", dc: 14, bias: "normal", flat: false,
    modifiers: modifiers.map((m) => ({ ...m })), dice: { chosen: { exploded } }, outcome: { degree: { key: degree, label: degree }, total }, ...rest,
    rerolls: 0,
    async reroll() { this.rerolls += 1; this.rerolledWith = this.modifiers.map((m) => m.label); this.outcome = { degree: { key: "failure", label: "Failure" }, total: 9 }; return this; }
  };
  return c;
}
{
  api.resetModuleRegistry();
  const seen = [];
  api.registerCheckReaction("Prophetic", { before: async (ctx) => { seen.push(ctx.type); return ctx.type === "save" ? { advantage: true, label: "Prophetic Warning", line: "Prophetic Warning: advantage." } : null; } });
  const c = fakeCheck({ type: "save" });
  const said = await rw.checkReactionsBefore(c, BIAS);
  equal("C1 before: advantage joins the bias, named as a row, and the line is said", [c.bias, c.modifiers.map((m) => m.label), said], ["advantage", ["Prophetic Warning: advantage"], ["Prophetic Warning: advantage."]]);
  const d = fakeCheck({ type: "save", bias: "disadvantage" });
  await rw.checkReactionsBefore(d, BIAS);
  equal("C2 …and cancels a disadvantage, as every other advantage does", d.bias, "normal");
  await rw.checkReactionsBefore(c, BIAS);
  equal("C3 asked once a check", seen.length, 2);
  for (const extra of [{ type: "spellcraft" }, { flat: true }, { presetDice: [1] }, { checkReactionsBeforeAsked: true }, { actor: null }]) await rw.checkReactionsBefore(fakeCheck(extra), BIAS);
  equal("C4 not for a casting check, a flat check, preset dice, a reroll already asked, or no actor", seen.length, 2);
  await rw.checkReactionsBefore(fakeCheck({ type: "spellcraft", reactionAs: "attack" }), BIAS);
  equal("C5 a spell attack's casting check is asked as an attack", seen.at(-1), "attack");
  equal("C5b the advantage given is recorded on the check", c.reactionAdvantages, ["Prophetic Warning"]);
  const re = fakeCheck({ type: "save", checkReactionsBeforeAsked: true, reactionAdvantages: ["Prophetic Warning"] });
  const reSaid = await rw.checkReactionsBefore(re, BIAS);
  equal("C5c (found in review) a reroll of that check keeps the advantage paid for, unasked", [re.bias, re.modifiers.map((m) => m.label), reSaid, seen.length], ["advantage", ["Prophetic Warning: advantage"], [], 3]);
  const plain = fakeCheck({ type: "save", checkReactionsBeforeAsked: true });
  await rw.checkReactionsBefore(plain, BIAS);
  equal("C5d …and a reroll with nothing given gains nothing", [plain.bias, plain.modifiers.length], ["normal", 0]);
}
{
  api.resetModuleRegistry();
  const asked = [];
  api.registerCheckReaction("Missed", { after: async (ctx) => { asked.push([ctx.degree, ctx.succeeded, ctx.failed, ctx.exploded]); return ctx.succeeded && !ctx.exploded ? { reroll: true, label: "Missed Chance", line: "Missed Chance is cast." } : null; } });
  api.registerCheckReaction("Second", { after: async () => { asked.push("second"); return { reroll: true }; } });
  const c = fakeCheck({ degree: "success", modifiers: [{ label: "Will", value: 5 }, { label: "Conviction (+1d6)", value: 4 }] });
  const out = await rw.checkReactionsAfter(c);
  equal("C6 after: a success is offered; the reroll drops the Conviction die and runs once", [out.rerolled, c.rerolls, c.rerolledWith], [true, 1, ["Will"]]);
  ok("C7 …the second result is locked against every later effect", c.locked === "missed" && c.luckUsed === true && Boolean(c.chanceUsed) && c.convictionDecided === true && c.saveReactionResolved === true && c.fumbleRerolled === true);
  ok("C8 …the first reroll ends the asking: one reroll a check", !asked.includes("second"));
  ok("C9 …and the card says the second result stands", /Missed Chance: rerolled \(15 → 9\); the second result stands and cannot be modified or rerolled/.test((c.extraDetailLines ?? []).join(" ")));
  const again = await rw.checkReactionsAfter(c);
  ok("C10 a locked result is not offered again", !again.rerolled && c.rerolls === 1);
  asked.length = 0;
  await rw.checkReactionsAfter(fakeCheck({ degree: "partial" }));
  equal("C11 Q26: a Partial is offered to nobody", asked, []);
  await rw.checkReactionsAfter(fakeCheck({ degree: "success", exploded: true }));
  equal("C12 the exploded die travels to the offer (Missed Chance refuses it; Q29)", asked.slice(0, 1), [["success", true, false, true]]);
  asked.length = 0;
  const atk = fakeCheck({ type: "attack", degree: "" });
  let swapped = 0;
  const hit = await rw.checkReactionsAfter(atk, { type: "attack", succeeded: true, failed: false, target: { name: "T" }, reroll: async (x) => { swapped += 1; return { ...x, outcome: { total: 3 } }; } });
  ok("C13 an attack's verdict is the caller's; its own reroll replaces the in-place one, and the result is locked", hit.rerolled && swapped === 1 && atk.rerolls === 0 && hit.check.locked === "missed" && hit.check.outcome.total === 3);
  asked.length = 0;
  for (const extra of [{ flat: true }, { presetDice: [1] }, { type: "spellcraft" }]) await rw.checkReactionsAfter(fakeCheck({ degree: "success", ...extra }));
  equal("C14 not for a flat check, preset dice, or a casting check", asked, []);
  api.resetModuleRegistry();
  api.registerCheckReaction("Throws", { after: async () => { throw new Error("boom"); } });
  api.registerCheckReaction("Answers", { after: async () => ({ reroll: true }) });
  const t = fakeCheck({ degree: "failure" });
  const thrown = await quiet(() => rw.checkReactionsAfter(t));
  ok("C15 a failing offer is passed over and the next is still asked", thrown.rerolled && t.rerolls === 1);
}

/* ----------------------------------------------------------------- */
/* G — the granted defences                                             */
/* ----------------------------------------------------------------- */
{
  gd.resetGrantedDefences();
  const fam = { uuid: "Actor.fam", name: "Owl" };
  const system = { parent: fam, combat: { resistances: "", immunities: "", weaknesses: "" } };
  const base = ct.actorDefences(system);
  ok("G1 nothing granted, nothing added", !base.resistanceCategories.has("all damage") && !base.immunities.has("precision"));
  ok("G2 a grant needs a creature and something to grant", gd.grantDefence(null, { resist: "all" }) === false && gd.grantDefence(fam, {}) === false);
  gd.grantDefence(fam, { resist: "all", immune: ["precision"], scope: "instance", label: "Phase Familiar" });
  const phased = ct.actorDefences(system);
  ok("G3 Phase Familiar: resistance to all damage and immunity to precision, read by actorDefences", phased.resistanceCategories.has("all damage") && phased.immunities.has("precision"));
  const packet = dw.resolveAgainstDefences(system, { amount: 13, type: "slashing", applyDR: false });
  equal("G4 …and the damage pipeline halves the blow", packet.taken, 6);
  ok("G5 the creature's own fields are never written", system.combat.resistances === "" && !ct.actorDefences({ combat: system.combat }).resistanceCategories.has("all damage"));
  gd.clearInstanceGrants(fam);
  equal("G6 the blow applied, the one-blow grant ends", dw.resolveAgainstDefences(system, { amount: 13, type: "slashing", applyDR: false }).taken, 13);
  gd.grantDefence(fam, { immune: "all", scope: "instance" });
  const immune = dw.resolveAgainstDefences(system, { amount: 13, type: "fire", applyDR: false });
  ok("G7 warped, immunity to all damage: nothing taken", immune.taken === 0 && immune.immune === true);
  gd.clearInstanceGrants(fam);
  gd.grantDefence(fam, { resist: ["fire"], scope: "instance", now: Date.now() - 61000 });
  equal("G8 a one-blow grant that never met its blow lapses after a minute", dw.resolveAgainstDefences(system, { amount: 10, type: "fire", applyDR: false }).taken, 10);
  // The cast scope.
  const sorc = { uuid: "Actor.sorc" };
  const ss = { parent: sorc, combat: {} };
  const outer = gd.beginCastScope();
  gd.grantDefence(sorc, { resist: ["fire", "cold"], scope: "cast" });
  const inner = gd.beginCastScope();
  gd.clearInstanceGrants(sorc);
  ok("G9 Resist Magic: the spell's types resisted, and a one-blow clear does not end it", dw.resolveAgainstDefences(ss, { amount: 10, type: "fire", applyDR: false }).taken === 5
    && dw.resolveAgainstDefences(ss, { amount: 10, type: "cold", applyDR: false }).taken === 5 && dw.resolveAgainstDefences(ss, { amount: 10, type: "acid", applyDR: false }).taken === 10);
  gd.endCastScope(inner);
  ok("G10 a reaction's own cast settling inside it does not end the outer cast's grant", dw.resolveAgainstDefences(ss, { amount: 10, type: "fire", applyDR: false }).taken === 5);
  const late = { uuid: "Actor.late" };
  gd.grantDefence(late, { resist: ["fire"], scope: "cast" });
  gd.endCastScope(outer);
  equal("G11 the spell resolved, the resistance ends", dw.resolveAgainstDefences(ss, { amount: 10, type: "fire", applyDR: false }).taken, 10);
  equal("G11b …and a grant made after the inner cast ended was the outer cast's, and ends with it", dw.resolveAgainstDefences({ parent: late, combat: {} }, { amount: 10, type: "fire", applyDR: false }).taken, 10);
  gd.grantDefence(sorc, { resist: ["fire"], scope: "cast" });
  gd.clearInstanceGrants(sorc);
  equal("G12 a cast grant outside any cast is held as one blow's", dw.resolveAgainstDefences(ss, { amount: 10, type: "fire", applyDR: false }).taken, 10);
  const k = gd.beginCastScope();
  equal("G13 asked once a creature a cast", [gd.askOnceThisCast(sorc), gd.askOnceThisCast(sorc), gd.askOnceThisCast(fam)], [false, true, false]);
  gd.endCastScope(k);
  const k2 = gd.beginCastScope();
  equal("G14 …and asked afresh in the next cast", gd.askOnceThisCast(sorc), false);
  gd.endCastScope(k2);
  equal("G15 outside a cast every blow is its own question", [gd.askOnceThisCast(sorc), gd.askOnceThisCast(sorc)], [false, false]);
  // THE SCOPE A QUESTION BELONGS TO (found in review): read where it began.
  gd.resetGrantedDefences();
  const fireball = gd.beginCastScope();
  const strike = gd.beginCastScope();
  const carol = { uuid: "Actor.carol" };
  const cs = { parent: carol, combat: {} };
  gd.grantDefence(carol, { resist: "all", scope: "cast", castKey: fireball });
  equal("G17 …and is asked once in that scope, wherever the stack's top is", [gd.askOnceThisCast(carol, fireball), gd.askOnceThisCast(carol, fireball), gd.askOnceThisCast(carol)], [false, true, false]);
  gd.endCastScope(strike);
  equal("G16 a grant tied to the scope its question began in survives another flow's scope ending", dw.resolveAgainstDefences(cs, { amount: 10, type: "fire", applyDR: false }).taken, 5);
  gd.endCastScope(fireball);
  equal("G18 …and ends with it", dw.resolveAgainstDefences(cs, { amount: 10, type: "fire", applyDR: false }).taken, 10);
  const gone = gd.beginCastScope();
  gd.endCastScope(gone);
  gd.grantDefence(carol, { resist: ["fire"], scope: "cast", castKey: gone });
  equal("G19 a scope that closed while the question waited holds nothing: the grant is that one blow's", dw.resolveAgainstDefences(cs, { amount: 10, type: "fire", applyDR: false }).taken, 5);
  gd.clearInstanceGrants(carol);
  // A QUESTION ANSWERED WHILE ANOTHER FLOW OPENED A SCOPE (found in review).
  api.resetModuleRegistry();
  let opened = null;
  api.registerDamageReaction("Interleaved", async () => { opened = gd.beginCastScope(); return { resist: "all", scope: "cast", line: "resists" }; });
  const cast1 = gd.beginCastScope();
  const dave = { uuid: "Actor.dave" };
  await rw.damageReactionsBefore(dave, { kind: "spell", types: ["fire"] });
  gd.endCastScope(opened);
  equal("G21 the answer belongs to the cast the question was asked in, not to a scope opened while it waited", dw.resolveAgainstDefences({ parent: dave, combat: {} }, { amount: 10, type: "fire", applyDR: false }).taken, 5);
  gd.endCastScope(cast1);
  api.resetModuleRegistry();
  // The live shape (found in review): no data model, so the system data
  // points back to its actor through a property nothing enumerates.
  const live = { uuid: "Actor.live" };
  const liveSystem = { combat: {} };
  Object.defineProperty(liveSystem, "parent", { value: live, enumerable: false, configurable: true, writable: true });
  gd.grantDefence(live, { resist: "all", scope: "instance" });
  ok("G20 a system that points back through a hidden parent is read, and the parent is in no copy of it", dw.resolveAgainstDefences(liveSystem, { amount: 10, type: "fire", applyDR: false }).taken === 5
    && !Object.keys(liveSystem).includes("parent") && JSON.stringify(liveSystem) === '{"combat":{}}');
  gd.resetGrantedDefences();
}

/* ----------------------------------------------------------------- */
/* D — damage reactions, run                                            */
/* ----------------------------------------------------------------- */
{
  api.resetModuleRegistry();
  gd.resetGrantedDefences();
  const asked = [];
  api.registerDamageReaction("Phase", async (ctx) => { asked.push([ctx.target.name, ctx.kind, ctx.types, ctx.magical, ctx.spellName]); return ctx.target.name === "Owl" ? { resist: "all", immune: ["precision"], scope: ctx.kind === "spell" ? "cast" : "instance", line: "Phase Familiar." } : null; });
  const owl = { uuid: "Actor.owl", name: "Owl" };
  const said = await rw.damageReactionsBefore(owl, { kind: "weapon", types: ["Slashing"], magical: false });
  equal("D1 the offer is told the creature, the kind, the types (lower case) and whether it is magical", asked[0], ["Owl", "weapon", ["slashing"], false, ""]);
  ok("D2 its answer is granted and its line said", said[0] === "Phase Familiar." && ct.actorDefences({ parent: owl, combat: {} }).resistanceCategories.has("all damage"));
  await rw.damageReactionsBefore(owl, { kind: "weapon" });
  ok("D3 the next blow clears the last one's grant before it asks", asked.length === 2);
  const cast = gd.beginCastScope();
  await rw.damageReactionsBefore(owl, { kind: "spell", types: ["fire"], magical: true, spellName: "Fire Bolt" });
  await rw.damageReactionsBefore(owl, { kind: "spell", types: ["fire"], magical: true, spellName: "Fire Bolt" });
  ok("D4 within one cast, a creature is asked once, and its grant keeps for the cast's other packets", asked.length === 3 && ct.actorDefences({ parent: owl, combat: {} }).resistanceCategories.has("all damage"));
  gd.endCastScope(cast);
  ok("D5 the cast settled, its grant ends", !ct.actorDefences({ parent: owl, combat: {} }).resistanceCategories.has("all damage"));
  equal("D6 nothing registered, nothing asked", (api.resetModuleRegistry(), await rw.damageReactionsBefore(owl, { kind: "weapon" })), []);
  gd.resetGrantedDefences();
}

/* ----------------------------------------------------------------- */
/* K — cast and critical reactions, run                                 */
/* ----------------------------------------------------------------- */
{
  api.resetModuleRegistry();
  const seen = [];
  api.registerCastReaction("Disrupt", async (ctx) => { seen.push([ctx.spell?.name, ctx.pp, ctx.degree, Boolean(ctx.token)]); return { stop: true, line: "Disrupted." }; });
  api.registerCastReaction("Later", async () => { seen.push("later"); return { stop: true }; });
  const out = await rw.castReactionsFor({ actor: { name: "Caster" }, token: { id: "t" }, spell: { name: "Fireball" }, pp: 6, degree: "success" });
  ok("K1 a cast reaction is told the spell, its PP and degree, and may stop it; the first stop ends the asking", out.stop && out.lines[0] === "Disrupted." && seen.length === 1 && JSON.stringify(seen[0]) === JSON.stringify(["Fireball", 6, "success", true]));
  api.resetModuleRegistry();
  api.registerCriticalReaction("Eternity", async (ctx) => ({ disadvantage: ctx.target.name === "Sorc", line: `bias was ${ctx.bias}` }));
  const deadly = await rw.criticalReactionsFor({ attacker: { name: "Orc" }, target: { name: "Sorc" }, bias: "advantage", severity: "deadly" });
  const serious = await rw.criticalReactionsFor({ attacker: { name: "Orc" }, target: { name: "Sorc" }, bias: "normal", severity: "serious" });
  const other = await rw.criticalReactionsFor({ attacker: { name: "Orc" }, target: { name: "Elf" }, bias: "normal" });
  equal("K2 Eternity Resilience: a deadly critical's advantage cancels; a serious one rolls at disadvantage; nobody else's changes", [deadly.bias, serious.bias, other.bias, deadly.lines[0]], ["normal", "disadvantage", "normal", "bias was advantage"]);
  equal("K3 no struck creature, nothing asked", (await rw.criticalReactionsFor({ attacker: {}, bias: "normal" })).bias, "normal");
  api.resetModuleRegistry();
}

/* ----------------------------------------------------------------- */
/* A — the ask across the table                                         */
/* ----------------------------------------------------------------- */
ok("A1 the answerer is the defence offers' rule: the reactor's player, else the GM", /defenceAnswerer\(\{ actorId: actor\?\.id \?\? "", users, activeGMId/.test(src.ask));
ok("A2 Q34: a question waits 30 seconds; an accepted reaction may take five minutes", /const ANSWER_WAIT_MS = 30000;/.test(src.ask) && /const STEP_WAIT_MS = 300000;/.test(src.ask));
ok("A3 a yes is acknowledged before the step runs, so the asker waits for the work and not the 30 seconds",
  order(between(src.ask, "export function registerReactionAsk", "\n}\n"), "if (!declined(answer)) {", "action: ACCEPTED", "result = await runStep(data.step, actor, answer, data.data ?? {});", "action: ANSWER"));
ok("A4 the asker hears an acceptance by moving its wait to the step's", /if \(data\?\.action === ACCEPTED\) \{[\s\S]{0,400}clearTimeout\(entry\.timer\);[\s\S]{0,400}STEP_WAIT_MS\);/.test(src.ask));
ok("A5 a no, a closed dialog or the time running out runs no step", /const declined = \(answer\) => !answer \|\| answer === "no";/.test(src.ask) && /if \(declined\(answer\)\) return \{ answer, result: null \};/.test(src.ask));
ok("A6 asked here when this client is the answerer, with no socket", order(between(src.ask, "export async function askReactor", "\n}\n"), "if (answerer === globalThis.game?.user?.id) {", "await askHere(", "game.socket.emit("));
ok("A7 registered at ready, beside the defence offers", order(src.boot, "registerDefenceOffers();", "registerReactionAsk();"));
ok("A8 (found in review) an answerer who disconnects answers no at once, rather than holding the roll",
  /globalThis\.Hooks\?\.on\?\.\("userConnected", \(user, connected\) => \{\s*if \(connected\) return;\s*for \(const \[requestId, entry\] of Array\.from\(waiting\)\) \{\s*if \(entry\.answererId !== user\?\.id\) continue;\s*clearTimeout\(entry\.timer\);\s*waiting\.delete\(requestId\);\s*entry\.resolve\(\{ answer: null, result: null, left: true \}\);/.test(src.ask)
  && /out\.left \? `\$\{answererName\} left the game — no reaction\.`/.test(src.ask)
  && /const entry = \{ resolve, timer: null, answererId: answerer \};/.test(src.ask));

/* ----------------------------------------------------------------- */
/* W — the wiring                                                       */
/* ----------------------------------------------------------------- */
const roll = between(src.check, "  static async roll(config", "\n  }\n}\n");
ok("W1 before the dice: asked after the rods and before Conviction's advantage and the dice",
  order(roll, "const { advantageRodFor, bonusRodFor }", "checkReactionsBefore(check, BIAS)", "if (check.convictionAdvantage && check.actor && !check.declaredDegree)", "await check.evaluate();"));
ok("W2 …not for preset dice or modifiers", /if \(check\.actor && !check\.flat && !check\.presetDice && !check\.presetModifiers\) \{\s*const \{ checkReactionsBefore \}/.test(roll));
ok("W3 after the result: a save or a skill check, after the Conviction card, Lucky Break and the fumble reroll, before the degree is announced",
  order(roll, "await offerConvictionBonusNow(check);", "offerLuckyBreak", "offerFumbleReroll", "checkReactionsAfter(check)", "trgPrimeCheckResolved"));
ok("W4 …and only for a save or a skill check with a degree", /check\.outcome\?\.degree\?\.key && \["save", "skill"\]\.includes\(check\.type\)\) \{\s*const \{ checkReactionsAfter \}/.test(roll));
ok("W5 a check carries what a reaction calls it, whether it is locked, and whether it was asked", /this\.reactionAs = String\(config\.reactionAs \?\? ""\);/.test(src.check) && /this\.locked = config\.locked \?\? false;/.test(src.check) && /this\.checkReactionsBeforeAsked = Boolean\(config\.checkReactionsBeforeAsked\);/.test(src.check));
ok("W6 the card carries the lock, and its held bonuses, Devotion and Natural Defence refuse a locked result",
  /locked: Boolean\(this\.locked\),/.test(src.check)
  && ["maybeAddHeldBonuses", "maybeAddDevotionDowngrade", "maybeAddNaturalDefence"].every((fn) => /if \(raw\.locked\) return;/.test(between(src.card, `async function ${fn}`, "\n}\n"))));
ok("W7 a weapon attack: asked once the hit is known, and the outcome read again after a reroll",
  order(src.attack, "let outcome = outcomeOf(check);", "checkReactionsAfter(check, { type: \"attack\", succeeded: outcome.hits, failed: !outcome.hits, target: targetActor })", "outcome = outcomeOf(check);", "const criticalDowngraded"));
ok("W8 …not for a shared strike's later creatures", /if \(targetActor && !presetDice && outcome\.resolved\) \{\s*const \{ checkReactionsAfter \}/.test(src.attack));
ok("W9 the attack's own rerolls are not offered Prophetic Warning again",
  (src.attack.match(/checkReactionsBeforeAsked: true/g) ?? []).length === 2 && /allowConviction: false,\s*\/\/[^\n]*\n\s*checkReactionsBeforeAsked: true/.test(src.reroll));
ok("W10 a spell attack: asked once the hit is known; its reroll swaps the dice, drops the Conviction die, and the total and outcome are read again",
  order(src.cast, "let outcome = spellOutcomeOf(check, total);", "checkReactionsAfter(check, {", "rerolledSpellCheck(actor, c)", "total = attackTotalOf(check).total;", "outcome = spellOutcomeOf(check, total);"));
ok("W11 a spell attack's casting check is its attack check", /castContext\.reactionAs = "attack";/.test(src.cast));
const castBody = between(src.cast, "async function castSpellResolved(", "\nasync function ");
ok("W12 a cast reaction: after the late warps and before the degree decides the PP; every landing degree; a stop is a failure",
  order(castBody, "const offer = warpManipulationOffer({", "castReactionsFor({", "if (reacted.stop) { degree = \"failure\"; castDisrupted = true; }", "const outcome = castingOutcome(degree, {")
  && /if \(\["heroic", "critical", "success"\]\.includes\(degree\)\) \{\s*const \{ castReactionsFor \}/.test(castBody));
ok("W13 …told the PP the cast meets (with Warp Manipulation's) and asked for innate and no-check casts too",
  /pp: Number\(totalPP \?\? 0\) \+ Number\(manipulationPP \?\? 0\),/.test(castBody) && !/if \(!isInnate && !noCheckCantrip\) \{\s*const \{ castReactionsFor \}/.test(castBody));
// RE-ANCHORED AT 3.682.0: a module's prelude is asked first (and is no cast of its own).
ok("W14 every cast is a scope: begun before it and ended however it returns",
  /export async function castSpell\(actor, spell, options = \{\}\) \{[\s\S]{0,1200}const scope = beginCastScope\(\);\s*try \{[\s\S]{0,600}?return await castSpellResolved\(actor, spell, options \?\? \{\}\);\s*\} finally \{\s*endCastScope\(scope\);/.test(src.cast));   // 3.685.1: an object's spell's branch (withTargetsReleased) sits inside the scope too
ok("W15 a critical: the struck creature asked after Harmony Edge, before the roll, not for a forced result",
  order(src.attack, "const edge = await offerCriticalAdvantage(actor, weapon, bias);", "criticalReactionsFor({ attacker: actor, target: targetActor", "await rollPercentile({")
  && /if \(targetActor && targetActor !== actor && \(forcedResult === null \|\| forcedResult === undefined\)\) \{\s*const \{ criticalReactionsFor \}/.test(src.attack));
ok("W16 damage, a weapon's: asked before the precision gate reads the defences",
  /const damageReactionLines = targetActor\n    \? await \(await import\("\.\.\/reactions\/reactions-workflow\.mjs"\)\)\.damageReactionsBefore\(targetActor, \{/.test(src.attack) && order(src.attack, "const targetActor = targetTokenHere?.actor ?? null;", "damageReactionsBefore(targetActor, {", "const damageTargetDefences = targetActor", "const precisionImmune = Boolean(") && /for \(const said of damageReactionLines\) lines\.push\(line\(said\)\);/.test(src.attack));
ok("W17 damage, a spell's: asked before the attack's packet, each save branch's, and the area's heat",
  (src.cast.match(/for \(const said of await spellDamageReactions\(/g) ?? []).length === 5
  && order(src.cast, "await spellDamageReactions(targetActor, spell, actor, [damageType])", "const packet = resolveAgainstDefences(targetSystem, {")
  && /kind: "spell", types: types\.filter\(Boolean\), magical: true, spellName: spell\?\.name \?\? ""/.test(src.cast));
ok("W18 damage, a spell effect row's (missiles): asked before each packet", order(src.effects, "damageReactionsBefore(target, { kind: \"spell\", types: [type], magical: true })", "const packet = resolveAgainstDefences(target.system ?? {}, {"));
const typed = between(src.damage, "export async function applyTypedDamage", "\n}\n");
ok("W19 damage, typed: asked before the defences (not for damage that ignores them); `magical` told and forwarded; the grant cleared once met",
  order(typed, "if (!ignoreDefences && type) {", "damageReactionsBefore(targetActor, {", "let packet = resolveAgainstDefences(defenderSystem, {", "magical: Boolean(magical) || Boolean(spellName),", "clearInstanceGrants(targetActor);"));
ok("W20 …and a copied system keeps its creature", (typed.match(/parent: targetActor,/g) ?? []).length === 2);
ok("W21 the HP write ends a one-blow grant", order(between(src.dying, "export async function applyDamageAndCheckDying", "\n}\n"), "await applyDamageAndCheckDyingInner(", "clearInstanceGrants(actor);", "trgPrimeDamageApplied"));
ok("W22 actorDefences reads the grants into new sets", /const granted = grantedDefencesOf\(actorSystem\?\.parent \?\? null\);/.test(src.traits)
  && /const immunities = new Set\(\[\.\.\.\(immune\.damageTypes \?\? \[\]\), \.\.\.granted\.immunities, \.\.\.\(granted\.immuneAll \? \[ALL_DAMAGE\] : \[\]\)\]\);/.test(src.traits));
ok("W23 the pipeline knows immunity to all damage", /const allImmune = has\(immunities, ALL_DAMAGE\);\s*if \(has\(immunities, type\) \|\| allImmune \|\|/.test(src.pipeline));
ok("W24 a Dispel aimed at a spell being cast opens the Dispel dialog on its PP and DC", /presetDispel = null\s*\} = \{\}\) \{/.test(src.action)
  && /presetDispel\s*\? \{ level: Math\.max\(0, Math\.trunc\(Number\(presetDispel\.effectValue\) \|\| 0\)\), dc: Math\.max\(0, Math\.trunc\(Number\(presetDispel\.dc\) \|\| 0\)\) \}\s*: perilDispelDefaults\(firstTargetActor\(\)\) \?\? \{\}/.test(src.action));
ok("W25 the API: the five registries and the helpers a reaction needs",
  ["registerCheckReaction: (key, spec, moduleId)", "registerDamageReaction: (key, offer, moduleId)", "registerCastReaction: (key, offer, moduleId)", "registerCriticalReaction: (key, offer, moduleId)", "registerReactionStep: (name, run, moduleId)",
    "askReactor: async (...args)", "castAsReaction: async (...args)", "convictionState: async (actor)", "spendConviction: async (actor)"].every((t) => src.apiw.includes(t)));
ok("W26 …spending Conviction by the core's rule (one point a round)", /spendConviction: async \(actor\) => \{\s*const \{ getConvictionState, markConvictionSpent \} = await import\("\.\/conviction\.mjs"\);\s*if \(!getConvictionState\(actor\)\.ok\) return false;\s*await markConvictionSpent\(actor\);\s*return true;/.test(src.apiw));
ok("W28 (found in review) a weapon attack's rerolls carry the advantage a reaction gave",
  (src.attack.match(/checkReactionsBeforeAsked: true, reactionAdvantages: check\.reactionAdvantages \?\? \[\](?:, reactionModifiers: check\.reactionModifiers \?\? \[\])? \}\);/g) ?? []).length === 2
  && /this\.reactionAdvantages = Array\.isArray\(config\.reactionAdvantages\) \? config\.reactionAdvantages\.map\(String\) : \[\];/.test(src.check));
ok("W29 (found in review) the weapon card keeps the reaction's lines and its reroll line, which the card's own lines used to overwrite",
  order(src.attack, "const reactionBeforeLines = [...(check.reactionBeforeLines ?? [])];", "const reactionDetailLines = [...reactionBeforeLines];", "reactionDetailLines.push(...answered.lines);", "reactionDetailLines.push(...(check.extraDetailLines ?? []).slice(-1));", "check.extraDetailLines = [...reactionDetailLines.map((said) => line(said)), ...lines];"));
ok("W30 (found in review) a rerolled attack's fumble is checked afresh", /reactionDetailLines\.push\(\.\.\.\(check\.extraDetailLines \?\? \[\]\)\.slice\(-1\)\);[\s\S]{0,200}fumbleConfirmedEarly = null;/.test(src.attack));
ok("W31 (found in review) a strike is a scope, like a cast: a grant for the strike reaches its runes and riders, and ends with it",
  /async function resolveWeaponDamage\(actor, weapon, options = \{\}\) \{[\s\S]{0,900}const scope = beginCastScope\(\);\s*try \{\s*return await resolveWeaponDamageInScope\(actor, weapon, options \?\? \{\}\);\s*\} finally \{\s*endCastScope\(scope\);/.test(src.attack)
  && /async function resolveWeaponDamageInScope\(\n  actor,\n  weapon,\n  \{ critical = null,/.test(src.attack));
ok("W32 (found in review) the missile storm and a triggered strike ask before their packets, as every spell-damage site does",
  order(src.storm, "const reacted = await damageReactionsBefore(target, {", "lines.push(...reacted);", "const packet = resolveAgainstDefences(target.system ?? {}, {")
  && /applyMissileStorm\(\s*\{ \.\.\.row, label: row\.label \|\| spell\.name \},\s*areaTargets \?\? \[\],\s*\{ spell, caster: actor \}\s*\);/.test(src.cast)
  && order(src.effects, "for (const said of await damageReactionsBefore(victim, {", "const roll = await new Roll(spec.dice).evaluate();", "const packet = resolveAgainstDefences(victim.system ?? {}, {"));
ok("W33 (found in review) a stopped cast is told apart as disrupted, on the cast and the settled hooks",
  (castBody.match(/disrupted: castDisrupted,/g) ?? []).length === 2 && /let castDisrupted = false;/.test(castBody));
ok("W34 (found in review) whether a cast would be refused, asked quietly: Rage, a module's refusal, a critical's",
  order(between(src.cast, "export async function castRefusalReason(actor, spell) {", "\n}\n"), "if (rageBarsCasting(actor))", "castRefusalFrom({", "castingRefusal(actor, spell?.system ?? {}, Boolean(spell?.system?.innate));")
  && src.apiw.includes('castRefusal: async (...args) => (await import("./magic/cast-workflow.mjs")).castRefusalReason(...args),'));
ok("W35 a cast hands back the warp it paid for (warp and Warp Manipulation), on the outcome the return spreads",
  order(castBody, "outcome.warpPP = Number(warpPP ?? 0) + Number(manipulationPP ?? 0);", "return { ...outcome, ppSpent, check, spellSave, refunded: castRefunded, warpMods };"));
ok("W36 (found in review) live system data points back to its actor: set each preparation, not enumerable, a data model's own parent left alone",
  /prepareBaseData\(\) \{\s*super\.prepareBaseData\(\);[\s\S]{0,1200}if \(this\.system && typeof this\.system === "object" && !\("parent" in this\.system\)\) \{\s*Object\.defineProperty\(this\.system, "parent", \{ value: this, enumerable: false, configurable: true, writable: true \}\);/.test(src.actorDoc));
ok("W37 (found in review) every other spell-damage site asks before its packet",
  Object.entries(src.sites).every(([, text]) => /const \{ spellDamageReactionsFor \} = await import\("\.\.\/reactions\/reactions-workflow\.mjs"\);\s*(?:lines\.push\(\.\.\.await |for \(const said of await |await )spellDamageReactionsFor\(/.test(text)
    && text.indexOf("spellDamageReactionsFor(") < text.lastIndexOf("resolveAgainstDefences(")),
  Object.entries(src.sites).filter(([, text]) => !/spellDamageReactionsFor\(/.test(text)).map(([f]) => f).join(", "));
ok("W38 (found in review) a Dispel aimed at a spell being cast is not aimed at the reactor's own target", /const targetActor = presetDispel \? null : firstTargetActor\(\);/.test(src.action));
ok("W39 the before-window's lines are kept apart for a card that writes its own", /check\.reactionBeforeLines = said;/.test(src.check));
ok("W27 castAsReaction is the core's own, exported", /export async function castAsReaction\(caster, spell, targetTokenIds = \[\]\) \{/.test(src.saveSpells));

{
  api.resetModuleRegistry();
  gd.resetGrantedDefences();
  const seenCtx = [];
  api.registerDamageReaction("Watch", async (ctx) => { seenCtx.push([ctx.kind, ctx.types, ctx.magical, ctx.spellName]); return null; });
  await rw.spellDamageReactionsFor({ uuid: "Actor.x", name: "X" }, " Fire ", { spellName: "Call Lightning" });
  equal("W40 a spell-damage site's question: a spell's, its type, magical, named", seenCtx, [["spell", ["fire"], true, "Call Lightning"]]);
  api.resetModuleRegistry();
}

/* ----------------------------------------------------------------- */
/* Z — the version                                                      */
/* ----------------------------------------------------------------- */
// 3.681.0 OR LATER (3.681.1): the seams stand in the releases after it.
const [zMaj, zMin, zPat] = String(sys.version).split(".").map(Number);
equal("Z the version is 3.681.0 or later, and its download names it", [zMaj > 3 || (zMaj === 3 && (zMin > 681 || (zMin === 681 && zPat >= 0))), (sys.download ?? "").includes(`/v${sys.version}/`)], [true, true]);

if (failures.length) {
  console.error(`verify-ea-block3b-core: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-ea-block3b-core: all ${checks} checks pass`);
