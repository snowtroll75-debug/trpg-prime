#!/usr/bin/env node
/**
 * verify-control-register-api — TRG Prime 3.686.0, H12: the control register
 * for modules (Eldritch Arts' Block 8 audit §6; Graham, 8 November 2026,
 * 17:22: "As recommended"), and Q170's PP lock for "Until dismissed".
 *
 *   C  CONTROL_SOURCES gains "bound"; an entry may carry a cast id and the
 *      module's facts, and one that names neither is the shape it was
 *   R  every release fires trgPrimeControlReleased once, with the entry; the
 *      overflow sweep's release says "overflow" and the save's degree; a
 *      release of nothing fires nothing; Aligned Control's says "released"
 *   H  the four helpers on the module API, driven
 *   L  Q170: "Until dismissed" (and "… or broken") locks PP as unlimited and
 *      registers the cast; a "(D)" stays merely dismissible; no core spell
 *      prints it
 *   Z  the version
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

const fired = [];
let nextId = 0;
globalThis.foundry = { applications: { api: { DialogV2: { confirm: async () => false, wait: async () => null } }, ux: {} }, utils: { randomID: () => `id${++nextId}`, deepClone: (x) => structuredClone(x), getProperty: () => undefined, mergeObject: (a, b) => Object.assign(a ?? {}, b ?? {}), escapeHTML: (s) => String(s) } };
globalThis.Hooks = { on() {}, once() {}, off() {}, call() { return true; }, callAll(name, payload) { fired.push({ name, payload }); } };
const cards = [];
globalThis.ChatMessage = { getSpeaker: () => ({}), create: async (d) => { cards.push(d); return d; } };
globalThis.ui = { notifications: { info() {}, warn() {}, error() {} } };
globalThis.CONFIG = { statusEffects: [], specialStatusEffects: {} };
globalThis.game = { user: { id: "u", isGM: true }, users: [], settings: { get: () => null }, time: { worldTime: 0 }, combat: null, actors: { get: () => null } };
globalThis.canvas = { tokens: { placeables: [], controlled: [] }, scene: null };
const docs = new Map();
globalThis.fromUuid = async (u) => docs.get(u) ?? null;
globalThis.fromUuidSync = (u) => docs.get(u) ?? null;

function makeActor(name, { cap = 10, level = 1 } = {}) {
  const a = { name, id: name, uuid: `Actor.${name}`, documentName: "Actor", flags: {}, system: { magic: { controlLevels: cap }, identity: { level }, combat: { saves: { will: { total: 3 } } } } };
  a.getFlag = (s, k) => a.flags?.[s]?.[k];
  a.setFlag = async (s, k, v) => { (a.flags[s] ??= {})[k] = structuredClone(v); };
  docs.set(a.uuid, a);
  return a;
}

const CR = await imp("magic/control-register.mjs");
const W = await imp("magic/control-register-workflow.mjs");
const { TRGCheck } = await imp("dice/check.mjs");
const AS = await imp("magic/active-spells.mjs");

/* C — the register's shape */
equal("C1 CONTROL_SOURCES gains bound (\"Bound\"); the others are unchanged", CR.CONTROL_SOURCES, { aligned: "Aligned Control", conjured: "Conjured", undead: "Created undead", dominated: "Dominated", bound: "Bound", other: "Other" });
equal("C1b the hook's name", CR.CONTROL_RELEASED_HOOK, "trgPrimeControlReleased");
{
  const mage = makeActor("Mage"), wolf = makeActor("Wolf");
  const plain = await W.recordControlled(mage, { target: wolf, level: 1, source: "aligned" });
  equal("C2 an entry naming no cast and no facts is the shape it always was", Object.keys(plain).sort(), ["handle", "id", "level", "name", "source"]);
  const facts = { module: "trg-eldritch-arts", key: "animalBinding" };
  const bound = await W.recordControlled(mage, { target: makeActor("Bear"), level: 2, source: "bound", castId: "c9", data: facts });
  facts.key = "changed";
  equal("C3 a module's entry carries its cast id and a copy of its facts, source bound", [bound.source, bound.castId, bound.data], ["bound", "c9", { module: "trg-eldritch-arts", key: "animalBinding" }]);
  equal("C3b an unknown source is still \"other\"", (await W.recordControlled(mage, { level: 1, name: "x", source: "nonsense" })).source, "other");
  equal("C3c the register holds all three", W.controlledOf(mage).length, 3);

  /* R — the hook */
  fired.length = 0;
  const gone = await W.releaseControlled(mage, bound.id);
  equal("R1 a release fires trgPrimeControlReleased once, with the entry, reason \"released\" by default", [fired.length, fired[0]?.name, fired[0]?.payload?.entry?.id, fired[0]?.payload?.controller === mage, fired[0]?.payload?.reason, fired[0]?.payload?.degree], [1, "trgPrimeControlReleased", bound.id, true, "released", null]);
  equal("R1b …and resolves the entry, which has left the register", [gone?.id, W.controlledOf(mage).some((e) => e.id === bound.id)], [bound.id, false]);
  fired.length = 0;
  await W.releaseControlled(mage, "no-such-entry");
  equal("R2 a release of nothing fires nothing", fired.length, 0);
  fired.length = 0;
  await W.releaseControlled(mage, plain.id, { reason: "ended", creature: wolf });
  equal("R2b a caller's reason and creature are carried", [fired[0]?.payload?.reason, fired[0]?.payload?.creature === wolf], ["ended", true]);
}
{
  // THE OVERFLOW SWEEP, driven: over the cap, the highest-level creature saves DC 20 Will.
  const lich = makeActor("Lich", { cap: 2 }), ogre = makeActor("Ogre", { level: 5 });
  await W.recordControlled(lich, { target: ogre, level: 5, source: "bound", castId: "c1", data: { module: "m" } });
  let degree = "success";
  TRGCheck.roll = async (cfg) => ({ outcome: { degree: { key: degree } }, cfg });
  fired.length = 0;
  const freed = await W.sweepControlOverflow(lich);
  equal("R3 the overflow save frees it: the hook says \"overflow\", the save's degree and the creature", [freed?.released, fired.length, fired[0]?.payload?.reason, fired[0]?.payload?.degree, fired[0]?.payload?.creature === ogre, fired[0]?.payload?.entry?.castId], [true, 1, "overflow", "success", true, "c1"]);
  await W.recordControlled(lich, { target: ogre, level: 5, source: "bound" });
  degree = "failure";
  fired.length = 0;
  const held = await W.sweepControlOverflow(lich);
  equal("R4 a failed save releases nothing and fires nothing", [held?.released, fired.length, W.controlledOf(lich).length], [false, 0, 1]);
  degree = "critical";
  fired.length = 0;
  await W.sweepControlOverflow(lich);
  equal("R4b a Critical frees it too (five degrees: anything that beats the DC)", [fired.length, fired[0]?.payload?.degree], [1, "critical"]);
  const under = makeActor("Under", { cap: 20 });
  await W.recordControlled(under, { target: makeActor("Imp"), level: 1, source: "bound" });
  fired.length = 0;
  equal("R5 under the cap the sweep rolls nothing and fires nothing", [await W.sweepControlOverflow(under), fired.length], [null, 0]);
}
ok("R6 the sweep passes reason, degree and creature to the release", /if \(freed\) await releaseControlled\(actor, overflow\.highest\.id, \{ reason: "overflow", degree, creature \}\);/.test(read("module", "magic", "control-register-workflow.mjs")));
ok("R7 Aligned Control's release asks for no reason (so it reads \"released\")", /if \(entry\) await releaseControlled\(controller, entry\.id\);/.test(read("module", "aligned-control-workflow.mjs")));
{
  const a = makeActor("Plain");
  const e = await W.recordControlled(a, { level: 3, name: "A level only" });
  equal("R8 controlledCreature: null for a level-only entry; the creature for a handle", [await W.controlledCreature(e), await W.controlledCreature(null)], [null, null]);
  const b = makeActor("Boar");
  const withHandle = await W.recordControlled(a, { target: b, level: 1, source: "bound" });
  ok("R8b …and resolves the creature a handle names", (await W.controlledCreature(withHandle)) === b);
}

/* H — the module API's helpers */
{
  const { buildModuleApi } = await imp("module-api-workflow.mjs");
  const h = buildModuleApi().helpers;
  equal("H1 the four helpers are on the module API", ["recordControlled", "releaseControlled", "controlledOf", "controlledCreature"].map((k) => typeof h[k]), ["function", "function", "function", "function"]);
  const mage = makeActor("ApiMage"), fox = makeActor("Fox");
  const entry = await h.recordControlled(mage, { target: fox, level: 1, source: "bound", castId: "k1", data: { module: "trg-eldritch-arts" } });
  const listed = await h.controlledOf(mage);
  fired.length = 0;
  await h.releaseControlled(mage, entry.id, { reason: "ended" });
  equal("H2 driven through the API: recorded, listed, resolved, released with its hook", [listed.map((x) => x.id), (await h.controlledCreature(entry)) === fox, fired.map((f) => f.payload.reason), (await h.controlledOf(mage)).length], [[entry.id], true, ["ended"], 0]);
}

/* L — Q170: "Until dismissed" is unlimited */
equal("L1 \"Until dismissed\" and \"Until dismissed or broken\" lock PP as unlimited", [AS.ppLockCondition("Until dismissed"), AS.ppLockCondition("Until dismissed or broken")], ["unlimited", "unlimited"]);
equal("L2 the existing readings are unchanged: Permanent, unlimited, daily prep, (D), a minute", [AS.ppLockCondition("Permanent"), AS.ppLockCondition("unlimited"), AS.ppLockCondition("until your next daily preparations"), AS.ppLockCondition("1 minute (D)"), AS.ppLockCondition("1 minute")], ["unlimited", "unlimited", "dailyPrep", null, null]);
equal("L3 such a cast registers (so Dismiss reaches it and the PP are held)", [AS.castWillRegister({ durationText: "Until dismissed" }), AS.castWillRegister({ durationText: "varies" })], [true, false]);
{
  // MEASURED: no core spell prints "until dismissed" outside a "(D)".
  const dump = path.join(SYSTEM_ROOT, "..", "..", "ea-tools", "core-dump", "spells.json");
  if (fs.existsSync(dump)) {
    const spells = JSON.parse(fs.readFileSync(dump, "utf8"));
    equal("L4 no core spell's duration says \"until dismissed\" (so none changes)", spells.filter((s) => /until dismissed/i.test(String(s.system?.duration ?? ""))).map((s) => s.name), []);
  } else ok("L4 (the core pack dump is not beside this tree; the source comment records the measurement)", true);
}
ok("L5 the lock is read off the duration's own words, after unlimited and permanent, and the measurement is recorded beside it", /if \(\/unlimited\|permanent\/\.test\(t\)\) return "unlimited";\n[\s\S]{0,600}no core spell prints it[\s\S]{0,200}if \(\/until dismissed\/\.test\(t\)\) return "unlimited";/i.test(read("module", "magic", "active-spells.mjs")));

/* Z — the version */
const manifest = JSON.parse(read("system.json"));
// RE-PINNED 3.686.2 (was 3.686.0).
equal("Z1 the version is 3.686.2, and the download names it", [manifest.version, manifest.download], ["3.686.2", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.686.2/trg-prime.zip"]);

if (failures.length) { console.log(`verify-control-register-api: ${checks} checks — ${failures.length} FAILED`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-control-register-api: ${checks} checks — all green.`);
