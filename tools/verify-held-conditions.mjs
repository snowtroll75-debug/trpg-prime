#!/usr/bin/env node
/**
 * verify-held-conditions — TRG Prime 3.686.0, H17: conditions held by a curse,
 * and core Remove Curse counteracting effects from Curse-trait spells
 * (Eldritch Arts' Block 8 audit §6; Graham, 8 November 2026, 17:22: "As
 * recommended", Q183, H17's Remove Curse half approved for every world).
 *
 *   P  the pure rule: a hold's record, which conditions it holds, what its end
 *      takes off (never below another hold's share), the counteract's level/DC
 *   D  driven: the reduceCondition helper, the condition floor (every reducer
 *      that asks it), the injury rest clock, fatigue's hourly save, the hold's
 *      end on deletion (one client), and a creature with no hold unchanged
 *   W  the wiring the drive cannot reach: condition relief refuses out loud;
 *      a night's rest (Soul Drain, Doomed, fatigue); Fast Healing; a creature
 *      ability's healing; a counteract by name skips a held condition and is
 *      prefilled from `counteractAs`; the hook is registered at init
 *   X  Remove Curse: the declared row, in the pack, read by the core's own
 *      counteract reader against a curse's effect
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

const hooks = new Map();
globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => false, wait: async () => null } }, ux: {} }, utils: { randomID: () => "r1", deepClone: (x) => structuredClone(x), getProperty: () => undefined, mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), escapeHTML: (s) => String(s) } };
globalThis.Hooks = { on(n, fn) { if (!hooks.has(n)) hooks.set(n, []); hooks.get(n).push(fn); }, once() {}, off() {}, call() { return true; }, callAll() {} };
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => d };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONFIG = { statusEffects: [], specialStatusEffects: {} };
globalThis.game = { user: { id: "gm", isGM: true }, users: Object.assign([], { activeGM: null }), settings: { get: () => null }, time: { worldTime: 0 }, combat: null };
game.users.activeGM = game.user;
globalThis.canvas = { tokens: { placeables: [] }, scene: null };

function makeActor(name, values = {}) {
  const a = { name, documentName: "Actor", uuid: `Actor.${name}`, flags: {}, effects: [], system: { identity: { level: 3 }, combat: { saves: { fortitude: { total: 2 } } } } };
  const raw = new Map(Object.entries(values));
  a.conditions = { rawValues: raw };
  a.getConditionValue = (k) => raw.get(k) ?? 0;
  a.hasCondition = (k) => (raw.get(k) ?? 0) > 0;
  a.toggleStatusEffect = async (k, o = {}) => { if (o.active === false) raw.delete(k); else raw.set(k, Number(o.value ?? 1)); };
  a.getFlag = (s, k) => a.flags?.[s]?.[k];
  a.setFlag = async (s, k, v) => { (a.flags[s] ??= {})[k] = v; };
  a.unsetFlag = async (s, k) => { delete a.flags?.[s]?.[k]; };
  a.getActiveTokens = () => [];
  a.testUserPermission = () => true;
  return a;
}
const hold = (id, keys, values = {}, extra = {}) => ({ id, name: extra.name ?? "Symbol of Pain (curse)", disabled: false, flags: { "trg-prime": { heldConditions: { keys, values, endWith: true, label: extra.label ?? "Symbol of Pain" }, ...(extra.flags ?? {}) } } });

const HC = await imp("conditions/held-conditions.mjs");

/* P — the pure rule */
equal("P1 a hold's record: keys kept as declared, values only the positive", HC.normaliseHeld({ keys: ["injured", "soulDrain", "injured", ""], values: { injured: 2, soulDrain: 0 }, endWith: true, label: "X" }), { keys: ["injured", "soulDrain"], values: { injured: 2 }, endWith: true, label: "X" });
equal("P1b no keys holds nothing; endWith is false unless said", [HC.normaliseHeld({ keys: [] }), HC.normaliseHeld({ keys: ["weakened"] })?.endWith], [null, false]);
{
  const fx = [hold("h1", ["injured"], { injured: 2 }), { id: "x", flags: {} }, { ...hold("h2", ["weakened"]), disabled: true }];
  equal("P2 which conditions are held: injured by the hold, weakened not (its hold is disabled), nothing else", [HC.actorConditionHeld({ effects: fx }, "injured"), HC.actorConditionHeld({ effects: fx }, "weakened"), HC.holdsOn(fx, "fatigued").length, HC.holdsOn(fx, "injured")[0]?.label], [true, false, 0, "Symbol of Pain"]);
}
{
  const ending = HC.normaliseHeld({ keys: ["injured"], values: { injured: 2 }, endWith: true });
  equal("P3 the end takes off what the hold added", HC.heldEndings(ending, () => 3), [{ key: "injured", from: 3, to: 1 }]);
  equal("P3b never below 0", HC.heldEndings(ending, () => 1), [{ key: "injured", from: 1, to: 0 }]);
  equal("P3c never below another standing hold's share", HC.heldEndings(ending, () => 6, [HC.normaliseHeld({ keys: ["injured"], values: { injured: 5 } })]), [{ key: "injured", from: 6, to: 5 }]);
  equal("P3d a hold that does not say endWith takes nothing off", HC.heldEndings(HC.normaliseHeld({ keys: ["injured"], values: { injured: 2 } }), () => 3), []);
}
equal("P4 counteractAs: the symbol's PP and DC, or null", [HC.counteractAsOf({ flags: { "trg-prime": { counteractAs: { pp: 12, dc: 24 } } } }), HC.counteractAsOf({ flags: { "trg-prime": { counteractAs: { pp: 12 } } } }), HC.counteractAsOf({ flags: {} })], [{ targetLevel: 12, dc: 24 }, { targetLevel: 12, dc: null }, null]);
ok("P5 the refusal names the curse and Remove Curse", /held by Symbol of Pain — only Remove Curse can end it/.test(HC.heldRefusedLine("Orc", "Injured", "Symbol of Pain")));

/* D — driven */
{
  const { MODULE_HELPERS } = await imp("feats-workflow.mjs");
  const held = makeActor("Held", { injured: 2 });
  held.effects.push(hold("h1", ["injured"], { injured: 2 }));
  const free = makeActor("Free", { injured: 2 });
  equal("D1 reduceCondition leaves a held condition alone, and says so", [await MODULE_HELPERS.reduceCondition(held, "injured", 1), held.getConditionValue("injured")], [{ from: 2, to: 2, floor: 2, held: true }, 2]);
  equal("D1b …and lowers an unheld one as before", [(await MODULE_HELPERS.reduceCondition(free, "injured", 1)).to, free.getConditionValue("injured")], [1, 1]);
}
{
  const { conditionFloorFor } = await imp("magic/emanation-workflow.mjs");
  const held = makeActor("Floor", { weakened: 4 });
  held.effects.push(hold("h1", ["weakened"], { weakened: 4 }));
  equal("D2 the condition floor is the held value (every reducer that asks it leaves it alone); unheld: 0", [conditionFloorFor(held, "weakened"), conditionFloorFor(held, "injured"), conditionFloorFor(makeActor("NoHold", { weakened: 4 }), "weakened")], [4, 0, 0]);
}
{
  const { advanceInjuryRest } = await imp("injury-workflow.mjs");
  const held = makeActor("Rester", { injured: 2 });
  held.effects.push(hold("h1", ["injured"], { injured: 2 }));
  const free = makeActor("Rester2", { injured: 2 });
  await advanceInjuryRest(held, { hours: 24 * 60 });
  await advanceInjuryRest(free, { hours: 24 * 60 });
  equal("D3 the injury rest clock does not run on a held injury; an unheld one steps down", [held.getConditionValue("injured"), held.flags?.["trg-prime"]?.injuryTreatment ?? null, free.getConditionValue("injured") < 2], [2, null, true]);
}
{
  const { TRGCheck } = await imp("dice/check.mjs");
  TRGCheck.roll = async () => ({ outcome: { degree: { key: "critical" } } });
  const { rollFatigueRecovery } = await imp("combat/exhaustion-workflow.mjs");
  const held = makeActor("Tired", { fatigued: 3 });
  held.effects.push(hold("h1", ["fatigued"], { fatigued: 3 }));
  const free = makeActor("Tired2", { fatigued: 3 });
  await rollFatigueRecovery(held, { postCard: false });
  await rollFatigueRecovery(free, { postCard: false });
  equal("D4 fatigue's hourly save lowers nothing held; an unheld Critical takes 2 off", [held.getConditionValue("fatigued"), free.getConditionValue("fatigued")], [3, 1]);
  const posted = []; const create = ChatMessage.create; ChatMessage.create = async (d) => { posted.push(d.content); return d; };
  const said = await rollFatigueRecovery(held, { postCard: true });
  ChatMessage.create = create;
  equal("D4c …the card says the hold and the value it stays at, not a reduction; the result is the unchanged value", [said.next, said.delta, said.held, /held by Symbol of Pain/.test(posted[0] ?? ""), /stays at <strong>3<\/strong>/.test(posted[0] ?? ""), /reduces by/.test(posted[0] ?? "")], [3, 0, true, true, true, false]);
  TRGCheck.roll = async () => ({ outcome: { degree: { key: "fumble" } } });
  await rollFatigueRecovery(held, { postCard: false });
  equal("D4b …but a Fumble's rise still lands on a held one", held.getConditionValue("fatigued"), 4);
}
{
  const W = await imp("conditions/held-conditions-workflow.mjs");
  W.registerHeldConditionHooks();
  const fn = (hooks.get("deleteActiveEffect") ?? []).at(-1);
  const settle = async (fx) => { fn(fx); await new Promise((r) => setTimeout(r, 5)); };
  const a = makeActor("Cursed", { injured: 3 });
  await settle({ ...hold("h1", ["injured"], { injured: 2 }), parent: a });
  equal("D5 a hold's end lowers what it added (3 → 1)", a.getConditionValue("injured"), 1);
  const b = makeActor("Cursed2", { weakened: 6 });
  b.effects.push(hold("h2", ["weakened"], { weakened: 4 }));
  await settle({ ...hold("h3", ["weakened"], { weakened: 6 }), parent: b });
  equal("D5b …never below the share of a hold still standing", b.getConditionValue("weakened"), 4);
  const c = makeActor("Cursed3", { injured: 2 });
  const fxC = { ...hold("h4", ["injured"], { injured: 2 }), parent: c };
  game.users.activeGM = { id: "other-gm" };
  fn(fxC);
  await new Promise((r) => setTimeout(r, 5));
  const notActing = c.getConditionValue("injured");
  game.users.activeGM = game.user;
  fn(fxC);
  await new Promise((r) => setTimeout(r, 5));
  equal("D6 the deletion hook lowers it on the acting client only (another GM's client does nothing)", [notActing, c.getConditionValue("injured")], [2, 0]);
  const d = makeActor("Plain", { injured: 2 });
  fn({ id: "plain", flags: {}, parent: d });
  await new Promise((r) => setTimeout(r, 5));
  equal("D7 an effect with no hold changes nothing when deleted", d.getConditionValue("injured"), 2);
}

/* K — a counteract on a creature this client does not own (3.686.0; the Block 8a review, finding 1) */
{
  const RW = await imp("combat/target-relay-workflow.mjs");
  const TR = await imp("combat/target-relay.mjs");
  const fx = (a, id, traits) => { const e = { id, name: id, disabled: false, flags: { "trg-prime": { sourceTraits: traits } }, parent: a, deleted: false }; e.delete = async () => { e.deleted = true; a.effects.splice(a.effects.indexOf(e), 1); }; a.effects.push(e); return e; };
  const withGet = (a) => { a.effects.get = (id) => a.effects.find((e) => e.id === id); return a; };
  const mine = withGet(makeActor("Mine")); mine.isOwner = true;
  const c1 = fx(mine, "curse1", ["curse", "rune"]);
  equal("K1 an owned creature: the counteracted effect is deleted here", [await RW.counteractEffectOn(mine, "curse1", ["curse"]), c1.deleted], [true, true]);
  const npc = withGet(makeActor("NPC")); npc.isOwner = false;
  const c2 = fx(npc, "curse2", ["curse"]);
  const sent = []; let listener = null;
  game.socket = { on: (ch, fn) => { listener = fn; }, emit: (ch, req) => { sent.push(req); if (String(req.action).startsWith("target.") && req.action !== TR.RELAY_ACTIONS.RESULT) queueMicrotask(() => listener?.({ action: TR.RELAY_ACTIONS.RESULT, requestId: req.requestId, userId: req.userId, ok: true, result: true })); } };
  RW.registerTargetRelay();
  const said = await RW.counteractEffectOn(npc, "curse2", ["curse"]);
  equal("K2 the GM's NPC: not deleted on the caster's client, but asked of the GM by the COUNTERACT relay, with the effect and the row's traits", [c2.deleted, sent[0]?.action, sent[0]?.payload, said], [false, "target.counteract", { effectId: "curse2", traits: ["curse"] }, true]);
  const gmNpc = withGet(makeActor("GMSide")); gmNpc.isOwner = true;
  const c3 = fx(gmNpc, "curse3", ["curse"]); const f3 = fx(gmNpc, "fear3", ["emotion", "fear"]);
  const CRW = await imp("magic/counteract-relay-workflow.mjs");
  const deps = { fromUuid: async () => gmNpc, counteractEffect: (t, id, traits) => CRW.counteractEffectAsGM(t, id, traits) };
  const okReply = await TR.performRelay({ action: TR.RELAY_ACTIONS.COUNTERACT, uuid: "x", payload: { effectId: "curse3", traits: ["curse"] } }, deps);
  const noReply = await TR.performRelay({ action: TR.RELAY_ACTIONS.COUNTERACT, uuid: "x", payload: { effectId: "fear3", traits: ["curse"] } }, deps);
  const noTraits = await TR.performRelay({ action: TR.RELAY_ACTIONS.COUNTERACT, uuid: "x", payload: { effectId: "fear3", traits: [] } }, deps);
  equal("K3 the GM's client re-reads the effect's own traits: a curse goes; a fear named by id is refused; a row with no traits reaches no effect", [okReply.ok, c3.deleted, noReply.ok, noTraits.ok, f3.deleted], [true, true, false, false, false]);
  equal("K4 the rule: a row's traits reach an effect carrying one of them, and nothing else", [(await imp("magic/counteract-row.mjs")).counteractReachesEffect(["curse"], { id: "a", sourceTraits: "Curse, Rune" }), (await imp("magic/counteract-row.mjs")).counteractReachesEffect(["curse"], { id: "b", sourceTraits: "Fear" }), (await imp("magic/counteract-row.mjs")).counteractReachesEffect([], { id: "c", sourceTraits: "Curse" })], [true, false, false]);
  delete game.socket;
}
ok("K5 every counteract row's effect delete goes by counteractEffectOn; a condition's toggle crosses by itself (Actor#toggleStatusEffect relays an unowned removal, 3.666.1)",
  /const \{ counteractEffectOn \} = await import\("\.\.\/combat\/target-relay-workflow\.mjs"\);\n\s+if \(!await counteractEffectOn\(target, candidate\.key, spec\.traits\)\)/.test(read("module", "magic", "spell-effects.mjs"))
  && !/if \(candidate\.kind === "effect"\) await target\.effects\?\.get\?\.\(candidate\.key\)\?\.delete\?\.\(\);/.test(read("module", "magic", "spell-effects.mjs"))
  && /if \(statusRelayNeeded\(this, game\.user\)\) \{/.test(read("module", "documents", "actor.mjs")));

ok("K6 the relay's GM side is that check (liveDeps), not a bare delete", /counteractEffect: async \(target, effectId, traits\) => \{\n\s+const \{ counteractEffectAsGM \} = await import\("\.\.\/magic\/counteract-relay-workflow\.mjs"\);\n\s+return counteractEffectAsGM\(target, effectId, traits\);/.test(read("module", "combat", "target-relay-workflow.mjs")));

/* H — the three other reliefs (finding 4) */
{
  const SEm = await imp("magic/spell-effects.mjs");
  const held = makeActor("Sunned", { injured: 2, blinded: 1 });
  held.effects.push(hold("h1", ["injured"], { injured: 2 }));
  const lines = [];
  await SEm.applySpellEffects(makeActor("Priest"), { name: "Sunveil", uuid: "Item.sunveil", system: { duration: "", effects: [] } }, {
    targets: [held], lines, effects: [{ kind: "conditionRemove", target: "targets", conditions: ["injured", "blinded"] }]
  });
  const text = lines.join(" ");
  equal("H1 a conditionRemove row leaves a held condition and says so; an unheld one is removed", [held.getConditionValue("injured"), held.getConditionValue("blinded"), /held by Symbol of Pain — only Remove Curse can end it/.test(text), /Blinded<\/strong> removed/.test(text) || /blinded<\/strong> removed/i.test(text)], [2, 0, true, true]);
  const onlyHeld = makeActor("Sunned2", { injured: 2 });
  onlyHeld.effects.push(hold("h2", ["injured"], { injured: 2 }));
  const l2 = [];
  await SEm.applySpellEffects(makeActor("Priest2"), { name: "Sunveil", uuid: "Item.sunveil2", system: { duration: "", effects: [] } }, { targets: [onlyHeld], lines: l2, effects: [{ kind: "conditionRemove", target: "targets", conditions: ["injured"] }] });
  ok("H1b …and with only a held one, the card says the hold, not \"had no injured\"", /only Remove Curse/.test(l2.join(" ")) && !/had no/.test(l2.join(" ")));
  // NO DOUBLE SUBTRACTION: the relief refused, the hold's end takes its own share once.
  const W = await imp("conditions/held-conditions-workflow.mjs");
  W.registerHeldConditionHooks();
  const fn = (hooks.get("deleteActiveEffect") ?? []).at(-1);
  const both = makeActor("Both", { injured: 3 });
  both.effects.push(hold("h3", ["injured"], { injured: 2 }));
  await SEm.applySpellEffects(makeActor("Priest3"), { name: "Sunveil", uuid: "Item.sunveil3", system: { duration: "", effects: [] } }, { targets: [both], lines: [], effects: [{ kind: "conditionRemove", target: "targets", conditions: ["injured"] }] });
  const h3 = both.effects.pop();
  fn({ ...h3, parent: both });
  await new Promise((r) => setTimeout(r, 5));
  equal("H2 a refused relief, then the hold's end: its 2 come off once (3 → 1), not twice", both.getConditionValue("injured"), 1);
}
{
  const TO = read("module", "magic", "turn-options-workflow.mjs");
  ok("H3 Renewal's Touch refuses a held condition out loud, before the reduction", /const refused = await heldRefusal\(actor, option\);\n\s+if \(refused\) return refused;\n\s+\/\/ RECURRING/.test(TO)
    && /return actorConditionHeld\(actor, condition\) \? heldRefusedLine\(actor\.name, condition, holdsOn\(actor\.effects, condition\)\[0\]\?\.label\) : "";/.test(TO));
  ok("H3b …and before the AP are spent", /const refused = await heldRefusal\(actor, btn\.dataset\.option\);\n\s+if \(refused\) \{[\s\S]{0,200}return;\n\s+\}\n\s+const \{ spendActionPoints \}/.test(TO));
  const IH = read("module", "magic", "item-healing-workflow.mjs");
  ok("H4 the healing rune offers no held condition, says the hold, and spends no use on it", /for \(const c of standing\.filter\(\(x\) => actorConditionHeld\(target, x\)\)\) \{\n\s+lines\.push\(heldRefusedLine\(target\.name, RELIEVABLE\[c\]\?\.label \?\? c, holdsOn\(target\.effects, c\)\[0\]\?\.label\)\);\n\s+\}\n\s+const held = standing\.filter\(\(c\) => !actorConditionHeld\(target, c\)\);\n\s+if \(!held\.length\) continue;/.test(IH));
}

/* W — the wiring */
const SE = read("module", "magic", "spell-effects.mjs");
ok("W1 condition relief refuses a held condition out loud, after the seal", /const holds = holdsOn\(target\.effects \?\? \[\], relief\.condition\);\n\s+if \(holds\.length\) \{\n\s+lines\.push\(line\(heldRefusedLine\(target\.name, relief\.label, holds\[0\]\.label\)\)\);\n\s+break;/.test(SE));
const REST = read("module", "rest", "rest-workflow.mjs");
ok("W2 a night's rest lowers no held Soul Drain, Doomed or fatigue", /FULL_NIGHT_HOURS && !actorConditionHeld\(actor, "soulDrain"\)\)/.test(REST) && /FULL_NIGHT_HOURS && !actorConditionHeld\(actor, "doomed"\)\)/.test(REST) && /ate && drank && !actorConditionHeld\(actor, "fatigued"\)\)/.test(REST));
ok("W3 Fast Healing and Regeneration leave a held injury alone", /if \(actorConditionHeld\(actor, "injured"\)\) return 0;/.test(read("module", "injury-workflow.mjs")));
ok("W4 a creature ability's healing leaves a held injury or bleed alone", /if \(actorConditionHeld\(actor, key\)\) \{\n\s+lines\.push/.test(read("module", "codex-actions-workflow.mjs")));
ok("W5 a counteract by name skips a held condition", /counteractCandidates\(spec, \(c\) => Boolean\(target\.hasCondition\?\.\(c\)\) && !actorConditionHeld\(target, c\), traitedRows\)/.test(SE));
ok("W6 the counteract check is prefilled from the effect's counteractAs", /const knownAs = candidate\.kind === "effect" \? counteractAsOf\(target\.effects\?\.get\?\.\(candidate\.key\)\) : null;\n\s+const result = await rollCounteractCheck\(caster, knownAs \? \{ targetLevel: knownAs\.targetLevel, dc: knownAs\.dc \} : \{\}\);/.test(SE));
ok("W7 the hook is registered at init", /registerHeldConditionHooks\(\);/.test(read("scripts", "trg-prime.mjs")));
ok("W8 the hook asks isActingClientFor", /if \(!isActingClientFor\(actor\)\) return;/.test(read("module", "conditions", "held-conditions-workflow.mjs")));
ok("W9 the helper for modules", /conditionHeld: async \(actor, key\) => \(await import\("\.\/conditions\/held-conditions\.mjs"\)\)\.actorConditionHeld\(actor, key\)/.test(read("module", "module-api-workflow.mjs")));

/* X — Remove Curse */
{
  const { BLOCK8A_CORE_FIXES } = await import(new URL("./ea-block8a-core-fixes.mjs", import.meta.url));
  const row = BLOCK8A_CORE_FIXES.find((f) => f.id === "ea8a-remove-curse-counteract");
  equal("X1 the declared row: Remove Curse's effects [] → one counteract against Curse-trait effects, one a casting", [row?.name, row?.path, row?.from, row?.to], ["Remove Curse", "system.effects", [], [{ kind: "counteract", target: "targets", traits: ["curse"], limit: 1, label: "Remove Curse" }]]);
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  ok("X2 …declared in tools/data-fixes.json as written", JSON.stringify(fixes.find((f) => f.id === row.id)?.to) === JSON.stringify(row.to));
  const CR = await imp("magic/counteract-row.mjs");
  const spec = CR.normaliseCounteract(row.to[0]);
  const target = [{ id: "curse", name: "Symbol of Pain (curse)", statuses: [], sourceTraits: "Curse, Essence, Rune, Save, Soul" }, { id: "fear", name: "Frightened", statuses: ["frightened"], sourceTraits: "Emotion, Fear" }];
  equal("X3 the core's reader takes the row: a curse's effect is a candidate, a fear is not", CR.counteractCandidates(spec, () => false, target).map((c) => c.key), ["curse"]);
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  let rc = null;
  try {
    await db.open();
    for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && !key.slice(7).includes("!") && value?.name === "Remove Curse") rc = value;
  } catch (err) { ok("X4 the spells pack opens", false, String(err?.message ?? err)); } finally { await db.close().catch(() => {}); }
  equal("X4 the shipped pack carries it (tools/declare-ea-block8a-core.mjs)", rc?.system?.effects, row.to);
}

if (failures.length) { console.log(`verify-held-conditions: ${checks} checks — ${failures.length} FAILED`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-held-conditions: ${checks} checks — all green.`);
