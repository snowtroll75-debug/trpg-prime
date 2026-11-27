#!/usr/bin/env node
/**
 * verify-spell-metamagic-rulings — Graham's spell-matrix rulings of 26
 * November 2026 (U1-U12) and the audit's plain faults (RC1-RC8), as built in
 * 3.716.0. NEW at 3.716.0.
 *
 * The matrix (tools/spell-matrix) found them on 3.715.1; three were confirmed
 * live from a GM and a Player client at once: Temporal Extension changed no
 * clock (RC1), Reach Spell did not double the range (RC2), Distant Spell was
 * never offered (RC3). This file drives the repaired rules through the real
 * functions (R, L, C, P) and checks the cast workflow wires each one where it
 * must (W): a refusal before anything is spent, a range written before the
 * range check, a component gate judged after the dialog, a save rolled on the
 * GM's client.
 *
 * Paired with mutate-spell-metamagic-rulings.
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

globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: { wait: async () => null } }, ux: {} }, utils: { getProperty: (o, p) => p.split(".").reduce((a, k) => a?.[k], o), hasProperty: () => false, escapeHTML: (s) => String(s), randomID: () => "r1" } };
globalThis.game = globalThis.game ?? { settings: { get: () => null } };
const hooks = [];
globalThis.Hooks = { on(name, fn) { hooks.push([name, fn]); }, once() {}, off() {}, callAll() {}, call() { return true; } };
globalThis.ui = { notifications: { warn() {}, info() {}, error() {} } };

const MM = await imp("magic/metamagic.mjs");
const { parseSpellDuration } = await imp("magic/effect-duration.mjs");
const MX = await imp("magic/module-metamagic.mjs");
const CP = await imp("magic/cast-power.mjs");
const AS = await imp("magic/active-spells.mjs");
const SW = await imp("magic/spell-warp.mjs");
const WA = await imp("magic/warp-area.mjs");
const TR = await imp("combat/target-relay.mjs");

const ALL = ["temporal extension", "extend spell", "heighten spell", "distant spell", "reach spell", "widen spell",
  "split spell", "selective spell", "component mastery", "lingering performance", "echoing performance"];
const opts = (spellData, more = {}) => MM.buildMetamagicOptions({ featNames: ALL, spellData, basePP: Number(spellData.ppCost ?? 2), casterLevel: 10, tradition: "arcane", charisma: 3, ...more });
const opt = (spellData, id, more) => opts(spellData, more).find((o) => o.id === id);

/* ================================================================== */
/* R1 — Temporal Extension's ladder (U1)                               */
/* ================================================================== */
equal("R1a Graham's example: 1 round steps to 1 minute, 10 minutes, 1 hour, 12 hours",
  [1, 2, 3, 4].map((n) => MM.temporalDurationText("1 round", n)?.split(" (")[0]), ["1 minute", "10 minutes", "1 hour", "12 hours"]);
equal("R1b Shield of Faith's 10 minutes is one 10-minute interval: one step is 1 hour",
  MM.temporalDurationText("10 minutes", 1)?.split(" (")[0], "1 hour");
// THROUGH THE DOOR: the steps left are what the option sells (its `max`).
const stepsSold = (d, more = {}) => opt({ duration: d, ...more }, "temporal")?.max ?? 0;
equal("R1c steps left: round 4, minute 3, 10 minutes 2, hour 1, 12 hours 0",
  ["1 round", "1 minute", "10 minutes", "1 hour", "12 hours"].map((d) => stepsSold(d)), [4, 3, 2, 1, 0]);
equal("R1d off the ladder: a day, an until, a rolled duration, instantaneous",
  ["1 day", "until your next daily preparations", "1d4 minutes", ""].map((d) => stepsSold(d)), [0, 0, 0, 0]);
equal("R1e a sustained duration is not stepped (U5)", stepsSold("sustained (1 minute)"), 0);
equal("R1f nor one flagged sustained", stepsSold("1 minute", { sustained: true }), 0);
ok("R1g past the top is refused, not clamped", MM.temporalDurationText("1 hour", 2) === null);
// THE CLOCK READS IT: the stepped duration is what parseSpellDuration sees first.
equal("R1h the effect clock reads the stepped duration (Mage Armour: 1 hour -> 12 hours)",
  parseSpellDuration(MM.temporalDurationText("1 hour", 1))?.seconds, 43200);
equal("R1i …and 1 round +3 -> 1 hour", parseSpellDuration(MM.temporalDurationText("1 round", 3))?.seconds, 3600);
const t = opt({ duration: "1 hour", ppCost: 3 }, "temporal");
equal("R1j the option sells only the steps left, at half the base PP rounded up", [t?.max, t?.ppCost], [1, 2]);
ok("R1k no option from 12 hours", !opt({ duration: "12 hours" }, "temporal"));
ok("R1l no option on a sustained spell", !opt({ duration: "sustained (1 minute)", sustained: true }, "temporal"));

/* ================================================================== */
/* R2 — eligibility                                                    */
/* ================================================================== */
ok("R2a Extend not on an unlimited duration (RC5)", !opt({ duration: "unlimited" }, "extend"));
ok("R2b …nor a permanent one", !opt({ duration: "permanent" }, "extend"));
ok("R2c …nor a sustained one (U5)", !opt({ duration: "sustained (1 minute)", sustained: true }, "extend"));
ok("R2d …but on a limited one", Boolean(opt({ duration: "1 minute" }, "extend")));
ok("R2e Heighten on a spell with no save (U3)", Boolean(opt({ duration: "1 hour", defence: "" }, "heighten")));
ok("R2f Distant on a self-only spell (U2)", Boolean(opt({ range: "", targets: "", area: "" }, "distant")));
ok("R2g …not on a ranged one", !opt({ range: "30 feet", targets: "1 creature" }, "distant"));
ok("R2h …not on a self-centred area", !opt({ range: "", targets: "", area: "10-foot emanation" }, "distant"));
ok("R2i Reach on a numeric range", Boolean(opt({ range: "30 feet" }, "reach")));
ok("R2j …not on planetary or unlimited (U7)", !opt({ range: "planetary" }, "reach") && !opt({ range: "unlimited" }, "reach"));
ok("R2k Widen on a radius (U4)", Boolean(opt({ area: "20-foot radius" }, "widen")));
ok("R2l Split on an attack spell", Boolean(opt({ category: "attack", damage: { formula: "2d6" } }, "split")));
ok("R2m …not on Shatter, a utility spell with damage and no save (RC6)", !opt({ category: "utility", damage: { formula: "2d10" }, defence: "" }, "split"));
equal("R2n Selective's ceiling is the cast cap, not 6 (RC7)", opt({ area: "20-foot radius" }, "selective")?.max, 11);
equal("R2o Split's is the cast cap's worth of +4s, not 4 (RC7)", opt({ category: "attack", damage: { formula: "2d6" } }, "split", { casterLevel: 20 })?.max, 5);
const cm = opt({ components: { verbal: true, somatic: true, material: true } }, "componentMastery");
ok("R2p Component Mastery is a choice of from -> to, none to a component the spell has",
  cm?.kind === "select" && cm.choices.length === 0 ? false : !cm || cm.choices.every((c) => !["verbal", "somatic", "material"].includes(c.value.split(">")[1])));
const cm2 = opt({ components: { verbal: true, somatic: true, material: true }, }, "componentMastery");
ok("R2q a spell with all three has nothing to change into: not offered", !cm2);
const cm3 = opt({ components: { somatic: true, material: true } }, "componentMastery");
equal("R2r …a material and somatic spell may change either into verbal", cm3?.choices.map((c) => c.value), ["somatic>verbal", "material>verbal"]);
const lp = opt({ traits: "Composition", duration: "sustained (1 minute)" }, "lingering");
equal("R2s Lingering Performance carries its rounds (Cha 3 + Echoing 1) and two at a time", [lp?.kind, lp?.lingerRounds, lp?.lingerConcurrent], ["lingering", 4, 2]);

/* ================================================================== */
/* R3 — the aggregate                                                  */
/* ================================================================== */
const spell = { range: "30 feet", area: "20-foot radius", duration: "1 minute", components: { somatic: true, material: true }, traits: "Composition" };
const os = opts(spell);
const agg = MM.aggregateMetamagicSelection(os, { "mm-reach": 1, "mm-widen": 1, "mm-componentMastery": "material>verbal", "mm-lingering": 1 });
equal("R3a Reach x2, Widen x2, the change, the linger", [agg.rangeFactor, agg.areaFactor, agg.componentSwap, agg.linger],
  [2, 2, { from: "material", to: "verbal" }, { rounds: 4, concurrent: 2 }]);
equal("R3b Component Mastery's +2 PP is charged", agg.ppSpent, 2 + 4 + 2 + 2);
const self = MM.aggregateMetamagicSelection(opts({ range: "", targets: "", area: "" }), { "mm-distant": 1 });
equal("R3c Distant", [self.distant, self.ppSpent], [true, 4]);

/* ================================================================== */
/* R4 — U8: refused beside the spell's own warp of the same kind       */
/* ================================================================== */
equal("R4a nothing to refuse", MM.metamagicWarpConflicts({ extend: true }, {}), []);
ok("R4b Extend + Temporal", MM.metamagicWarpConflicts({ extend: true, temporalSteps: 1 }, {}).length === 1);
ok("R4c Extend + a duration warp", MM.metamagicWarpConflicts({ extend: true }, { durationText: "8 hours" }).length === 1);
ok("R4d Temporal + a duration warp", MM.metamagicWarpConflicts({ temporalSteps: 1 }, { durationText: "8 hours" }).length === 1);
ok("R4e Reach + a range warp", MM.metamagicWarpConflicts({ rangeFactor: 2 }, { rangeOverride: "60 feet" }).length === 1);
ok("R4f Distant + a range warp (Invisibility's own touch warp)", MM.metamagicWarpConflicts({ distant: true }, { rangeOverride: "touch" }).length === 1);
ok("R4g Widen + an area growth", MM.metamagicWarpConflicts({ areaFactor: 2 }, { areaGrowth: 10 }).length === 1);
ok("R4h Widen + an area override", MM.metamagicWarpConflicts({ areaFactor: 2 }, { areaOverride: "30-foot radius" }).length === 1);
equal("R4i a damage warp beside Empower is not refused (not ruled)", MM.metamagicWarpConflicts({ extraDamageDice: "1d6" }, { damageDice: "1d6" }), []);

/* ================================================================== */
/* R5 — the ×2s, through the module fold's own arithmetic              */
/* ================================================================== */
equal("R5a Reach: 30 feet -> 60 feet", MX.scaledRangeText("30 feet", 2), "60 feet");
equal("R5b Widen: a 20-foot radius grows by 20", MX.scaledAreaGrowth("20-foot radius", 2), 20);
ok("R5c touch is not a distance", MX.scaledRangeText("touch", 2) === null);

/* ================================================================== */
/* C — the counteract PP (U3)                                          */
/* ================================================================== */
equal("C1 heightened: the maximum", CP.castCounteractPP({ totalPP: 4, cap: 11, heightened: true }), 11);
equal("C2 a cantrip: the maximum (page 236)", CP.castCounteractPP({ totalPP: 0, cap: 11, cantrip: true }), 11);
equal("C3 otherwise the PP cast", CP.castCounteractPP({ totalPP: 4, cap: 11 }), 4);
CP.noteCastPower("castA", 11);
const effectA = { flags: { "trg-prime": { castId: "castA" } } };
CP.stampCastPower([effectA]);
equal("C4 an effect of the cast is stamped", effectA.flags["trg-prime"].counteractAs, { pp: 11 });
const symbol = { flags: { "trg-prime": { castId: "castA", counteractAs: { pp: 12, dc: 24 } } } };
CP.stampCastPower([symbol]);
equal("C5 a stamp already there (a symbol's) is kept", symbol.flags["trg-prime"].counteractAs, { pp: 12, dc: 24 });
const other = { flags: { "trg-prime": { castId: "castB" } } };
CP.stampCastPower([other]);
ok("C6 an effect of a cast never noted is not stamped", other.flags["trg-prime"].counteractAs === undefined);
CP.registerCastPowerHooks();
ok("C7 the hook is registered on preCreateActiveEffect", hooks.some(([n]) => n === "preCreateActiveEffect"));

/* ================================================================== */
/* L — Lingering Performance (U10), through lingerOnEnd                */
/* ================================================================== */
{
  // A caster whose active-spell list lives in a flag, as on a real actor.
  const caster = (entries) => {
    const store = { list: entries };
    return { uuid: "Actor.bard", getFlag: () => store.list, setFlag: async (_s, _k, v) => { store.list = v; }, list: () => store.list };
  };
  const sung = { id: "s1", name: "Inspire Courage", sustained: true, linger: { rounds: 3, concurrent: 1 } };
  const a = caster([{ ...sung, emanation: undefined }]);
  ok("L0 a performance that took the feat lingers", await AS.lingerOnEnd(a, "s1", { worldTime: 100, round: 5 }) === true);
  const lingered = a.list()[0];
  equal("L1 it stops being sustained, lingers, and ends Cha rounds on (time and round)",
    [lingered?.sustained, lingered?.lingering, lingered?.ends], [false, true, { endsAtWorldTime: 118, endsOnRound: 8 }]);
  const withCircle = caster([{ ...sung, emanation: { radius: 60 } }]);
  await AS.lingerOnEnd(withCircle, "s1", { worldTime: 100, round: 5 });
  equal("L2 the emanation keeps going to the same end", withCircle.list()[0]?.emanation?.ends, { endsAtWorldTime: 118, endsOnRound: 8 });
  const plain = caster([{ ...sung, linger: null }]);
  ok("L3 without the feat it does not linger (the caller ends it)", await AS.lingerOnEnd(plain, "s1", { worldTime: 1 }) === false && plain.list()[0].sustained === true);
  ok("L4 nor twice", await AS.lingerOnEnd(a, "s1", { worldTime: 1 }) === false);
  const two = caster([{ id: "old", name: "Inspire Defence", lingering: true }, { ...sung, id: "new" }]);
  await AS.lingerOnEnd(two, "new", { worldTime: 10, round: 1 });
  equal("L5 one at a time: the older lingering performance ends", two.list().map((e) => e.id), ["new"]);
  const echo = caster([{ id: "old", name: "Inspire Defence", lingering: true }, { ...sung, id: "new", linger: { rounds: 4, concurrent: 2 } }]);
  await AS.lingerOnEnd(echo, "new", { worldTime: 10, round: 1 });
  equal("L6 two with Echoing Performance", echo.list().map((e) => e.id), ["old", "new"]);
}

/* ================================================================== */
/* E — one ending at a time (3.716.1, found live on 3.716.0)           */
/* ================================================================== */
{
  // Both clocks sweep `ends` at a round change. The flag write yields, as
  // a real one does, so a second caller that is not refused reads the
  // entry the first has not yet removed.
  let writes = 0;
  const store = { list: [{ id: "e1", name: "Inspire Courage", targets: [] }] };
  const actor = {
    uuid: "Actor.bard", isOwner: true, effects: [], items: [],
    getFlag: () => store.list,
    setFlag: async (_s, _k, v) => { writes += 1; await new Promise((r) => setTimeout(r, 5)); store.list = v; },
    deleteEmbeddedDocuments: async () => []
  };
  const [first, second] = await Promise.all([
    AS.endActiveSpell(actor, "e1", { dismissed: false }),
    AS.endActiveSpell(actor, "e1", { dismissed: false })
  ]);
  ok("E1 two clocks ending one entry at once end it once", writes === 1 && first?.id === "e1" && second === null);
  ok("E2a a later call finds nothing to end", (await AS.endActiveSpell(actor, "e1")) === null && writes === 1);
  store.list = [{ id: "e1", name: "Inspire Courage", targets: [] }];
  ok("E2 and the claim is let go: the same id registered again ends again", (await AS.endActiveSpell(actor, "e1"))?.id === "e1");
  store.list = [{ id: "e2", name: "Bless", targets: [] }, { id: "e3", name: "Heroism", targets: [] }];
  const both = await Promise.all([AS.endActiveSpell(actor, "e2"), AS.endActiveSpell(actor, "e3")]);
  equal("E3 a different entry is not held up by the first", both.map((e) => e?.id ?? null), ["e2", "e3"]);

  // The sweep reports only what IT ended.
  const swept = { list: [{ id: "s1", name: "Inspire Courage", targets: [], ends: { endsAtWorldTime: 10, endsOnRound: null } }] };
  const sweeper = { ...actor, getFlag: () => swept.list, setFlag: async (_s, _k, v) => { await new Promise((r) => setTimeout(r, 5)); swept.list = v; } };
  const [turn, clock] = await Promise.all([
    AS.sweepActiveSpellExpiry(sweeper, { worldTime: 12 }),
    AS.sweepActiveSpellExpiry(sweeper, { worldTime: 12 })
  ]);
  equal("E4 the turn clock and the world clock say \"fades\" once between them", [...turn, ...clock], ["Inspire Courage"]);
}

/* ================================================================== */
/* N — a lingering performance is not reported as a lapse (3.716.1)    */
/* ================================================================== */
{
  const store = { list: [
    { id: "p1", name: "Inspire Courage", sustained: true, sustainType: "duration", castRound: 1, targets: [], linger: { rounds: 3, concurrent: 1 } },
    { id: "p2", name: "Bless", sustained: true, sustainType: "duration", castRound: 1, targets: [] }
  ] };
  const actor = { uuid: "Actor.bard2", isOwner: true, effects: [], items: [],
    getFlag: () => store.list, setFlag: async (_s, _k, v) => { store.list = v; }, deleteEmbeddedDocuments: async () => [] };
  const out = await AS.sweepSustainedLapses(actor, 3);
  equal("N1 the spell that ended is named as lapsed; the performance is not", [...out], ["Bless"]);
  equal("N2 it rides along as lingering, with its rounds", out.lingered, [{ name: "Inspire Courage", rounds: 3 }]);
}
const combatSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs"), "utf8");
ok("N3 the turn card says it lingers", /for \(const \{ name, rounds \} of lapsed\.lingered \?\? \[\]\)/.test(combatSrc)
  && /lingers — the performance has stopped/.test(combatSrc));

/* ================================================================== */
/* P — the warp ceilings (RC8, U9, U12)                                */
/* ================================================================== */
equal("P1 an uncapped area growth is repeatable (Forbiddance, U9)", WA.areaGrowthMaxTimes({ areaGrowth: 10 }, "20-foot radius"), Infinity);
equal("P2 a capped one is unchanged", WA.areaGrowthMaxTimes({ areaGrowth: 10, areaMax: 50 }, "10-foot emanation"), 4);
equal("P3 fast healing to its total: 5 -> 10 is five", SW.warpMaxTimes({ mods: { healingRateBump: 1, healingRateMax: 10, healingRateFrom: 5 } }), 5);
equal("P4 …1 -> 5 is four", SW.warpMaxTimes({ mods: { healingRateBump: 1, healingRateMax: 5, healingRateFrom: 1 } }), 4);
{
  const { ClassicLevel } = await import("classic-level");
  const os2 = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os2.tmpdir(), "vsmr-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "spells"), tmp, { recursive: true });
  try { fs.rmSync(path.join(tmp, "LOCK")); } catch { /* none */ }
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const byName = {};
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!")) byName[v.name] = v.system;
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  const max = (n, i) => SW.warpMaxTimes(byName[n].warps[i], byName[n].area ?? "", 20);
  equal("P5 the pack: Wyrm's attack once (U12), Gravity Weapon once, Magic Stone once, Unliving 5, Rapid Repair 4",
    [max("Shape Of The Wyrm", 2), max("Gravity Weapon", 1), max("Magic Stone", 0), max("Unliving Vitality", 0), max("Rapid Repair", 0)], [1, 1, 1, 5, 4]);
  equal("P6 True Seeing's and Unshakable's touch warps carry Invisibility's mods",
    [byName["True Seeing"].warps[0].mods, byName.Unshakable.warps[1].mods].map((m) => [m.rangeOverride, m.retargetSelfRows]), [["touch", true], ["touch", true]]);
  equal("P7 Forbiddance's warp is now repeatable", max("Forbiddance", 0), Infinity);
}
const repairs = read("module", "data", "pack-repairs.mjs");
ok("P8 the owned copies are repaired (6 entries since 3.716.0, and Unliving Vitality's 3.613.0 entry amended)",
  (repairs.match(/since: "3\.716\.0"/g) ?? []).length === 6
  && /alsoFrom: \[\[\{"ppCost":1,"text":"The fast healing increases by 1 \(max 10\)","mods":\{"healingRateBump":1,"healingRateMax":10\}\}\]\],\s*to: \[\{"ppCost":1,"text":"The fast healing increases by 1 \(max 10\)","mods":\{"healingRateBump":1,"healingRateMax":10,"healingRateFrom":5\}\}\]/.test(repairs));
ok("P9 the pack-copy pass is re-gated to 3.716.0 or later", /runIf\("3\.(71[6-9]|7[2-9]\d)\.\d+", "stale owned copies of repaired pack items"/.test(read("module", "migration.mjs")));

/* ================================================================== */
/* S — the save relay (U11)                                            */
/* ================================================================== */
{
  const seen = [];
  const reply = await TR.performRelay({ action: TR.RELAY_ACTIONS.SAVE, uuid: "Actor.npc", payload: { params: { actor: "Actor.evil", type: "attack", dc: 14, subject: "fortitude" } } },
    { fromUuid: async () => ({ id: "npc" }), rollSave: async (target, params) => { seen.push([target.id, params]); return { outcome: { total: 15, margin: 1, degree: { key: "success", label: "Success", success: true } } }; } });
  equal("S1 the GM's client rolls it as the target, as a save, with the asker's actor dropped",
    seen[0], ["npc", { type: "save", dc: 14, subject: "fortitude" }]);
  equal("S2 and answers the outcome", reply.result?.outcome?.degree?.key, "success");
}

/* ================================================================== */
/* W — the wiring                                                      */
/* ================================================================== */
const cw = read("module", "magic", "cast-workflow.mjs");
const at = (s) => cw.indexOf(s);
ok("W1 the U8 refusal reads the spell's own warps, right after they are aggregated",
  at("...metamagicWarpConflicts(mm, warpMods),") > at("const warpMods = warp.mods;")
  && at("...metamagicWarpConflicts(mm, warpMods),") < at("apScaleMods(spellData?.apScale, apScaleExtra)"));
ok("W2 …and returns before anything is spent", /if \(conflicts\.length\) \{[\s\S]{0,700}?return null;\s*\}/.test(cw));
ok("W3 Reach writes the doubled range", /const to = scaledRangeText\(effRange, mm\.rangeFactor\);\s*if \(to\) warpMods\.rangeOverride = to;/.test(cw));
ok("W4 …before the range check reads it", at("scaledRangeText(effRange, mm.rangeFactor)") < at("warpedRange(effRange, warpMods),\n      warpedAreaText(effArea, warpMods)"));
ok("W5 Widen grows the area", /const grow = scaledAreaGrowth\(effArea, mm\.areaFactor\);\s*if \(grow\) warpMods\.areaGrowth = /.test(cw));
ok("W6 Distant: touch, and the self rows move", /if \(mm\.distant\) \{\s*warpMods\.rangeOverride = "touch";\s*warpMods\.retargetSelfRows = true;/.test(cw));
ok("W7 Temporal's stepped duration is what the cast records", /const stepped = temporalDurationText\(spellData\.duration, mm\.temporalSteps, \{ sustained: isSustainedDuration\(spellData\) \}\);\s*if \(stepped\) warpMods\.durationText = stepped;/.test(cw));
ok("W8 the early component gate is quiet when a metamagic could change it",
  cw.includes("componentGate(actor, spellData, spell.name, { symbolPrepared: Boolean(sigil), quiet: componentGateCanWait })")
  && cw.includes("if (!componentsOK && !componentGateDeferred) return null;"));
ok("W9 …and judged again on the cast's own components, after the dialog",
  at("if (componentGateDeferred) {") > at("const warpMods = warp.mods;")
  && /castComponents = \{ \.\.\.castComponents, \[mm\.componentSwap\.from\]: false, \[mm\.componentSwap\.to\]: true \};/.test(cw)
  && /if \(!componentGate\(actor, \{ \.\.\.spellData, components: castComponents \}/.test(cw));
ok("W10 the pouch spending reads Component Mastery's change", /if \(mm\.componentSwap\?\.from && effectiveComponents\[mm\.componentSwap\.from\]\)/.test(cw));
ok("W11 the counteract PP is noted once the cast has its id", at("noteCastPower(castId, castCounteractPP({") > at("const castId = foundry.utils.randomID();"));
ok("W12 Lingering Performance reaches the registered entry", /linger: mm\.linger \?\? null,/.test(cw));
ok("W13 the spell's save goes through rollSaveFor", /const check = await rollSaveFor\(target, \{/.test(cw) && !/const check = await TRGCheck\.roll\(\{\s*actor: target,\s*label: altBetter/.test(cw));
const relayW = read("module", "combat", "target-relay-workflow.mjs");
ok("W14 rollSaveFor relays when the creature is not owned, and rolls here when it is",
  /if \(!target \|\| !needsRelay\(target\) \|\| game\.user\?\.isGM\) return rollSaveHere\(target, params\);/.test(relayW)
  && /if \(!game\.users\?\.activeGM\) return rollSaveHere\(target, params\);/.test(relayW)
  && /ask\(RELAY_ACTIONS\.SAVE, target, \{ params: plain \}\)/.test(relayW));
ok("W15 the GM end rolls through deps.rollSave", /rollSave: async \(target, params\) => saveOutcomeOf\(await rollSaveHere\(target, params\)\)/.test(relayW));
ok("W16 effects are stamped before a relay", /stampCastPower\(data\);\s*if \(!needsRelay\(target\)\)/.test(relayW));
ok("W17 the hook is registered at init", /registerCastPowerHooks\(\);/.test(read("scripts", "trg-prime.mjs")));
const asSrc = read("module", "magic", "active-spells.mjs");
ok("W18 a lapsing composition lingers instead of ending", /if \(await lingerOnEnd\(actor, entry\.id, \{[^}]*\}\)\) continue;\s*await endActiveSpell\(actor, entry\.id\);/.test(asSrc));
const trw = read("module", "trait-rules-workflow.mjs");
ok("W19 a new composition leaves a lingering one alone and lets the old one linger",
  /isComposition, newCastId\)/.test(trw) && /&& !e\.lingering\)/.test(trw) && /if \(await lingerOnEnd\(caster, id, /.test(trw));
ok("W20 the gate's warnings are silenced only when asked", /const warn = \(message\) => \{ if \(!quiet\) ui\.notifications\.warn\(message\); \};/.test(read("module", "magic", "component-gate.mjs")));

if (failures.length) {
  process.stdout.write(`verify-spell-metamagic-rulings: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exitCode = 1;
} else process.stdout.write(`verify-spell-metamagic-rulings: OK — ${checks} checks\n`);
