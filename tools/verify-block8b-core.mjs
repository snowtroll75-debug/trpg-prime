#!/usr/bin/env node
/**
 * verify-block8b-core — TRG Prime 3.687.0: the seams Eldritch Arts' Block 8b
 * (the rituals and Chapter 7's High Magic spells) needs, from its audit
 * (ELDRITCH_ARTS_BLOCK8_AUDIT.md §6) as Graham answered it on 8 November 2026
 * ("As recommended": Q171, Q172, Q182; H13–H16 approved).
 *
 *   H13 a Ritual spell's Partial casts: `registerRitualRules`' partialCasts;
 *       the ritual calls `castSpell` with it, which casts, spends no PP and
 *       rolls no fumble; a Magic Suppression remap still makes it a failure
 *   H14 a ritual by its primary alone: `minSecondaries` → 0; no overcasting
 *       room when alone; every other ritual still needs a secondary
 *   H15 rest rates from an effect: `flags.trg-prime.restRate { hp, pp }`,
 *       multiplied, rounded down, on the summary card
 *   H16 a storm whose strike is rolled, at its caster's turn start, that may
 *       follow its caster; `helpers.placeStorm` for a module's storm with its
 *       own clock
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
const quiet = (fn) => async (...a) => { const e = console.error; console.error = () => {}; try { return await fn(...a); } finally { console.error = e; } };

const api = await imp("module-api.mjs");
const rr = await imp("magic/ritual-rules.mjs");
const cw = read("module", "magic", "cast-workflow.mjs");
const apw = read("module", "module-api-workflow.mjs");
const rw = read("module", "rest", "rest-workflow.mjs");
const sw = read("module", "magic", "storm-workflow.mjs");
const cb = read("module", "documents", "combat.mjs");
const entry = read("scripts", "trg-prime.mjs");
const sys = JSON.parse(read("system.json"));
const ritualFn = cw.slice(cw.indexOf("export async function rollMagicRitual("), cw.indexOf("export async function rollMagicRitual(") + 40000);

/* ================================================================== H13 */
{
  api.resetModuleRegistry();
  ok("H13 a rules spec may give partialCasts and minSecondaries alone",
    api.registerRitualRules("p", { partialCasts: () => true }) === true && api.registerRitualRules("m", { minSecondaries: () => 0 }) === true);
  ok("H13 …but not as something other than a function",
    api.registerRitualRules("x", { partialCasts: true }) === false && api.registerRitualRules("y", { liftsCap: () => true, minSecondaries: 0 }) === false);

  api.resetModuleRegistry();
  equal("H13 with no rules a Partial does not cast", await rr.ritualPartialCasts({ spell: { name: "Clone" } }), false);
  api.registerRitualRules("boom", { partialCasts: () => { throw new Error("x"); } });
  api.registerRitualRules("vague", { partialCasts: () => "yes" });
  api.registerRitualRules("EA", { partialCasts: ({ spell }) => spell?.ea === true });
  equal("H13 only a strict true casts it; a throw costs its own answer",
    [await quiet(rr.ritualPartialCasts)({ spell: { ea: true } }), await quiet(rr.ritualPartialCasts)({ spell: { ea: false } })], [true, false]);
  equal("H13 the degrees a ritual casts on: a Partial only when said",
    ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"].map((d) => [rr.ritualCasts(d), rr.ritualCasts(d, { partial: true })]),
    [[true, true], [true, true], [true, true], [false, true], [false, false], [false, false], [false, false]]);

  ok("H13 the ritual asks partialCasts only of a Partial, and casts on it",
    /const partialCasts = degree === "partial" && await ritualPartialCasts\(\{ \.\.\.ritualContext, degree \}\);\n\s*const cast = ritualCasts\(degree, \{ partial: partialCasts \}\);/.test(ritualFn));
  ok("H13 its card says the Partial is applied with no PP lost, leaving what it does to the spell (not \"the spell fails\")",
    /if \(partialCasts\) \{\n(\s*\/\/[^\n]*\n)*\s*lines\.push\(line\("<strong>Partial: the ritual's partial result is applied\.<\/strong> No PP is lost; what the result does is the spell's own, on its card\."\)\);\n\s*\} else if \(cast\) \{/.test(ritualFn));
  ok("H13 castSpell is told it (and that the ritual was alone)",
    /ritual: \{ degree, ppOver, secondaryCount, check, variant: ritualPlan\.variant, partialCasts, alone, gated:/.test(ritualFn)
    && /if \(cast \|\| consequences\) \{\n\s*const castResult = await castSpell\(actor, spell, \{/.test(ritualFn));
  const { castingOutcome } = await imp("magic/casting.mjs");
  equal("H13 castingOutcome: a Partial cast for no PP and no fumble only when told; nothing else moves",
    [castingOutcome("partial", { basePP: 6, warpPP: 2 }), castingOutcome("partial", { basePP: 6, warpPP: 2, castsPartial: true }),
      castingOutcome("failure", { basePP: 6, warpPP: 2, castsPartial: true }), castingOutcome("success", { basePP: 6, castsPartial: true }).ppSpent],
    [{ cast: false, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 }, { cast: true, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 },
      { cast: false, ppSpent: 4, fumbleRoll: false, fumbleModifier: 0 }, 6]);
  ok("H13 castSpell: such a Partial is told to both the price and what is paid",
    /const ritualPartial = ritual\?\.partialCasts === true && degree === "partial";\n\s*const outcome = castingOutcome\(degree, \{\n\s*castsPartial: ritualPartial,\n\s*basePP: basePP \+ mmx\.basePPAdd,/.test(cw)
    && /\.\.\.discountedParts\(basePP \+ mmx\.basePPAdd, warpPP \+ metamagicPP \+ manipulationPP, paidReduction\),\n\s*castsPartial: ritualPartial,/.test(cw));
  ok("H13 …asked after the degree's remaps (a Magic Suppression area still makes it a failure)",
    cw.indexOf("const remapped = await remapCastDegree({") > 0 && cw.indexOf("const remapped = await remapCastDegree({") < cw.indexOf("const ritualPartial = ritual?.partialCasts === true"));
  ok("H13 it is not a failed ritual: casting options and conditions are asked of it",
    /const ritualFailed = Boolean\(ritual\) && !\["success", "critical", "heroic"\]\.includes\(String\(ritual\.degree\)\)\n\s*&& !\(ritual\.partialCasts === true && String\(ritual\.degree\) === "partial"\);/.test(cw));
  ok("H13 Variable Success is not offered on a ritual's Partial (the ritual decided it)",
    /if \(degree === "partial" && !isCantrip && !threaded && !ritual &&/.test(cw));
  ok("H13 the module API documents both", /partialCasts\(ctx\) → true when this spell's ritual Partial takes effect/.test(read("module", "module-api.mjs"))
    && /minSecondaries\(ctx\) → 0 when this ritual may be performed by its primary/.test(read("module", "module-api.mjs")));
}

/* ================================================================== H14 */
{
  api.resetModuleRegistry();
  equal("H14 with no rules a ritual is never alone", await rr.ritualAloneAllowed({}), false);
  api.registerRitualRules("one", { minSecondaries: () => 1 });
  api.registerRitualRules("none", { minSecondaries: () => undefined });
  api.registerRitualRules("blank", { minSecondaries: () => "" });
  api.registerRitualRules("null", { minSecondaries: () => null });
  api.registerRitualRules("boom", { minSecondaries: () => { throw new Error("x"); } });
  equal("H14 1, nothing, blank, null and a throw do not allow it", await quiet(rr.ritualAloneAllowed)({}), false);
  api.registerRitualRules("EA", { minSecondaries: ({ spell }) => (spell?.alone ? 0 : 1) });
  equal("H14 an answer of 0 allows it, for that spell only",
    [await quiet(rr.ritualAloneAllowed)({ spell: { alone: true } }), await quiet(rr.ritualAloneAllowed)({ spell: { alone: false } })], [true, false]);
  api.resetModuleRegistry();

  ok("H14 the refusal asks it, only when no secondary is seated",
    /const alone = !secondaryCount && await ritualAloneAllowed\(ritualContext\);\n\s*if \(!secondaryCount && !alone\) \{\n\s*ui\.notifications\.warn\("A magic ritual needs at least one secondary caster\."\);\n\s*return null;/.test(ritualFn));
  ok("H14 the overcasting room is still the secondaries' (none when alone), checked after",
    ritualFn.indexOf("const overcastLimit = magicRitualOvercastLimit(secondaryCount);") > 0
    && ritualFn.indexOf("if (ppOver > overcastLimit) {") > ritualFn.indexOf("if (!secondaryCount && !alone) {"));
  ok("H14 the card says it was performed alone", /if \(alone\) lines\.push\(line\("<em>Performed by the primary caster alone, as this ritual allows: no secondary casters, so no PP over the maximum\.<\/em>"\)\);/.test(ritualFn));
}

/* ================================================================== H15 */
{
  const rate = await imp("rest/rest-rate.mjs");
  const eff = (r, extra = {}) => ({ ...extra, flags: { "trg-prime": { restRate: r } } });
  equal("H15 a rate of 2 or ½; 1, absent, zero, negative and absurd are nothing",
    [rate.normaliseRestRate({ hp: 2, pp: 2, label: "Eternal Invocation" }), rate.normaliseRestRate({ hp: 0.5 }), rate.normaliseRestRate({ hp: 1, pp: 1 }),
      rate.normaliseRestRate({ hp: 0 }), rate.normaliseRestRate({ pp: -2 }), rate.normaliseRestRate({ hp: 100 }), rate.normaliseRestRate(null)],
    [{ hp: 2, pp: 2, label: "Eternal Invocation" }, { hp: 0.5, pp: 1, label: "Rest rate" }, null, null, null, null, null]);
  equal("H15 rates multiply; a disabled or suppressed effect gives none",
    rate.restRatesOf([eff({ hp: 2, pp: 2, label: "A" }), eff({ hp: 0.5, label: "B" }), eff({ pp: 2 }, { disabled: true }), eff({ pp: 2 }, { isSuppressed: true }), { flags: {} }]),
    { hp: 1, pp: 2, labels: ["A", "B"] });
  equal("H15 the totals at those rates, rounded down (m128)",
    [rate.applyRestRates({ hp: 7, pp: 5 }, { hp: 2, pp: 0.5 }), rate.applyRestRates({ hp: 5, pp: 7 }, { hp: 0.5, pp: 0.5 }), rate.applyRestRates({ hp: 7, pp: 5 }, { hp: 1, pp: 1 }), rate.applyRestRates({ hp: -3, pp: 0 }, { hp: 2, pp: 2 })],
    [{ hp: 14, pp: 2 }, { hp: 2, pp: 3 }, { hp: 7, pp: 5 }, { hp: 0, pp: 0 }]);
  equal("H15 the card's line",
    [rate.restRateLine({ hp: 2, pp: 2, labels: ["Eternal Invocation", "Eternal Invocation"] }), rate.restRateLine({ hp: 0.5, pp: 1, labels: [] }), rate.restRateLine({ hp: 1, pp: 1, labels: [] })],
    ["Natural Healing doubled, PP recovery doubled (Eternal Invocation).", "Natural Healing halved.", ""]);
  ok("H15 the rest applies them after the hours are counted and before the HP and PP are written",
    /const restRates = restRatesOf\(Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\);\n\s*\(\{ hp: hpHealed, pp: ppRecovered \} = applyRestRates\(\{ hp: hpHealed, pp: ppRecovered \}, restRates\)\);/.test(rw)
    && rw.indexOf("applyRestRates({ hp: hpHealed") > rw.indexOf("ppRecovered += sleepingPPRecovery(maxPP, wholeHours);")
    && rw.indexOf("applyRestRates({ hp: hpHealed") < rw.indexOf("const newHPValue = dyingBlocksHealing"));
  ok("H15 the standalone Power Point Recovery dialog applies the PP rate too (the review)",
    /const rates = restRatesOf\(Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\);\n\s*if \(rates\.pp !== 1\) \{\n\s*gained = applyRestRates\(\{ hp: 0, pp: gained \}, rates\)\.pp;/.test(cw)
    && cw.indexOf("gained = applyRestRates({ hp: 0, pp: gained }, rates).pp;") < cw.indexOf("const newValue = Math.min(Number(pp.max ?? 0), Number(pp.value ?? 0) + gained);"));
  ok("H15 the summary carries them and the card says so", /dreamLichen,\n\s*restRates\n\s*\};/.test(rw) && /const said = restRateLine\(summary\.restRates\);\n\s*if \(said\) lines\.push\(summaryLine\(`<em>\$\{said\}<\/em>`\)\);/.test(rw));
}

/* ================================================================== H16 */
{
  const st = await imp("magic/storm.mjs");
  const mode = (key, extra = {}) => ({ key, label: key, formula: "2d6", type: "fire", save: "reflex", basic: true, ...extra });
  const vengeance = st.normaliseStorm({ kind: "storm", label: "Storm Of Vengeance", modes: [mode("a"), mode("b"), mode("c")] });
  equal("H16 an old row reads as before: chosen, on a Sustain, not following",
    [vengeance.pick, vengeance.strikes, vengeance.follow], ["choose", "sustain", false]);
  const UNMAKING = { kind: "storm", label: "Storm of Unmaking", pick: "roll", strikes: "turnStart",
    modes: [mode("fire", { formula: "20d6" }), mode("electricity", { formula: "10d12", type: "electricity" }), mode("cold", { formula: "30d4", type: "cold" }),
      mode("acid", { formula: "15d8", type: "acid" }), mode("bludgeoning", { formula: "20d8", type: "bludgeoning", save: "fortitude" }), mode("force", { formula: "12d10", type: "force", save: "fortitude" })] };
  const unmaking = st.normaliseStorm(UNMAKING);
  equal("H16 Storm of Unmaking's row: rolled, at the turn start", [unmaking.pick, unmaking.strikes, unmaking.follow, unmaking.modes.length], ["roll", "turnStart", false, 6]);
  equal("H16 …and a fumble's, following", st.normaliseStorm({ ...UNMAKING, follow: true }).follow, true);
  equal("H16 an unknown pick or strikes is the old reading", [st.normaliseStorm({ ...UNMAKING, pick: "random", strikes: "always" }).pick, st.normaliseStorm({ ...UNMAKING, pick: "random", strikes: "always" }).strikes], ["choose", "sustain"]);
  equal("H16 a rolled storm may repeat its last mode; a chosen one may not",
    [st.stormModesOffered(unmaking, "fire").length, st.stormModesOffered(vengeance, "a").map((m) => m.key)], [6, ["b", "c"]]);
  equal("H16 the die is one face a mode, and a face names a mode in printed order",
    [st.stormDie(unmaking), st.stormModeForFace(unmaking, 1)?.key, st.stormModeForFace(unmaking, 6)?.key, st.stormModeForFace(unmaking, 0), st.stormModeForFace(unmaking, 7), st.stormDie({ modes: [1] })],
    ["1d6", "fire", "force", null, null, ""]);
  equal("H16 only a storm with its own clock expires, and only once its time is up",
    [st.stormExpired({ ownExpiry: true, until: 100 }, 99), st.stormExpired({ ownExpiry: true, until: 100 }, 100), st.stormExpired({ until: 100 }, 500), st.stormExpired({ ownExpiry: true }, 500)],
    [false, true, false, false]);

  ok("H16 a strike's mode is chosen, or rolled on the storm's die with the face said",
    /async function strikeMode\(spec, last, label\) \{\n\s*if \(spec\.pick !== "roll"\) return \{ mode: await promptStormMode\(spec, last, label\), lines: \[\] \};\n\s*const die = stormDie\(spec\);\n\s*const roll = await new Roll\(die\)\.evaluate\(\);\n\s*const mode = stormModeForFace\(spec, roll\.total\);/.test(sw));
  ok("H16 the cast strikes once, through it", /const \{ mode, lines \} = await strikeMode\(spec, "", spellName\);/.test(sw));
  ok("H16 a turn-start storm strikes nothing on a Sustain",
    /if \(spec\.strikes === "turnStart"\) return \[\];\n\s*\/\/ "THE FIRST TIME EACH ROUND you Sustain/.test(sw));
  ok("H16 the turn start strikes the caster's turn-start storms, ends one past its own clock, and skips one whose cast has ended",
    /if \(spec\.strikes !== "turnStart" \|\| String\(record\.casterUuid \?\? ""\) !== String\(actor\.uuid \?\? ""\)\) continue;\n\s*if \(stormExpired\(record, now\)\) \{\n\s*await region\.delete\(\)/.test(sw)
    && /if \(!\(await stormCastRunning\(actor, record\)\)\) continue;/.test(sw)
    && /async function stormCastRunning\(caster, record\) \{\n\s*if \(record\.ownExpiry === true\) return true;\n\s*if \(!record\.castId\) return true;/.test(sw));
  ok("H16 …called at the start of each turn, beside the turn ladders",
    /const \{ applyStormTurnStarts \} = await import\("\.\.\/magic\/storm-workflow\.mjs"\);\n\s*for \(const said of await applyStormTurnStarts\(actor\)\) lines\.push\(TRGCombat\.#chatLine\(said\)\);/.test(cb)
    && cb.indexOf("applyStormTurnStarts(actor)") > cb.indexOf("applyTurnLadders(actor, combatant.token?.object ?? null)"));
  ok("H16 the follower and the clock run on the acting GM, registered at start-up",
    /export async function followStorms\(tokenDocument, changed = \{\}\) \{\n\s*if \(!isActingGM\(\)\) return 0;/.test(sw)
    && /export async function expireStorms\(worldTime = Number\(game\.time\?\.worldTime \?\? 0\)\) \{\n\s*if \(!isActingGM\(\)\) return 0;/.test(sw)
    && /registerEmanations\(\);\n[^\n]*\n\s*registerStorms\(\);/.test(entry));
  ok("H16 the cast gives a turn-start storm its own clock, the duration as cast (found live)",
    /const stormSeconds = normaliseStorm\(row\)\?\.strikes === "turnStart"\n\s*\? Number\(parseSpellDuration\(warpedDurationText\(spellData\.duration, warpMods\)\)\?\.seconds \?\? 0\)\n\s*: 0;\n\s*const stormUntil = stormSeconds > 0 \? Number\(game\.time\?\.worldTime \?\? 0\) \+ stormSeconds : null;/.test(cw)
    && /baseDamage: spellData\.baseDamage \?\? "", until: stormUntil\n/.test(cw));
  ok("H16 a module raises one through helpers.placeStorm", /placeStorm: async \(\.\.\.args\) => \(await import\("\.\/magic\/storm-workflow\.mjs"\)\)\.placeStorm\(\.\.\.args\),/.test(apw));

  // ON THE BOARD: a fake scene, a caster, a creature; the rolled mode, the
  // turn-start strike, the follower and the clock.
  const flagsOf = (doc) => doc.flags["trg-prime"] ?? (doc.flags["trg-prime"] = {});
  let regionSeq = 0;
  const makeRegion = (scene, data) => {
    const region = {
      id: `r${++regionSeq}`, name: data.name, shapes: data.shapes.map((s) => ({ ...s })), flags: {}, behaviors: [], parent: scene,
      getFlag(scope, key) { return this.flags[scope]?.[key]; },
      async setFlag(scope, key, value) { (this.flags[scope] ??= {})[key] = JSON.parse(JSON.stringify(value)); },
      async update(change) { if (change.shapes) this.shapes = change.shapes.map((s) => ({ ...s })); },
      async delete() { scene.regions.splice(scene.regions.indexOf(this), 1); },
      async deleteEmbeddedDocuments() {}, async createEmbeddedDocuments() {}
    };
    scene.regions.push(region);
    return region;
  };
  const scene = { id: "s1", grid: { size: 100, distance: 5 }, regions: [],
    async createEmbeddedDocuments(type, list) { return list.map((d) => makeRegion(scene, d)); },
    async deleteEmbeddedDocuments(type, ids) { for (const id of ids) { const i = scene.regions.findIndex((r) => r.id === id); if (i >= 0) scene.regions.splice(i, 1); } } };
  const casterTokenDoc = { id: "tc", x: 0, y: 0, width: 1, height: 1, parent: scene };
  const struck = [];
  const caster = { uuid: "Actor.c", name: "Caster", flags: {}, getActiveTokens: () => [{ center: { x: 50, y: 50 }, document: casterTokenDoc }] };
  const foeActor = { uuid: "Actor.f", name: "Foe", system: {}, getFlag: () => null };
  const foeToken = { actor: foeActor, document: { x: 0, y: 0 } };
  let rolled = [];
  globalThis.Roll = class { constructor(f) { this.f = f; } async evaluate() { const t = rolled.length ? rolled.shift() : 1; this.total = t; return this; } };
  globalThis.CONST = { REGION_VISIBILITY: { ALWAYS: 2 } };
  globalThis.game = { user: { id: "gm", isGM: true, color: "#000" }, users: { activeGM: { id: "gm" } }, time: { worldTime: 1000 }, scenes: [scene], combat: null };
  globalThis.canvas = { scene, dimensions: { size: 100, distance: 5 }, grid: { size: 100 } };
  const asw = await import(new URL("../module/magic/area-save-workflow.mjs", import.meta.url));
  const sww = await imp("magic/storm-workflow.mjs");
  // The strike's own machinery is Storm of Vengeance's, verified in verify-walls-storm; here only that it was called with the rolled mode.
  const realTokens = asw.tokensInRegion;
  ok("H16 (board) the area helpers load", typeof realTokens === "function");
  globalThis.__stormStruck = struck;

  rolled = [4];
  const raised = await quiet(sww.placeStorm)(caster, { ...UNMAKING }, { radiusFeet: 60, follow: true, dc: 30, castId: "fumbled", seconds: 60, spellName: "Storm of Unmaking" });
  const region = scene.regions.find((r) => r.id === raised.regionId);
  const rec = region?.getFlag("trg-prime", "storm");
  equal("H16 (board) placeStorm: a 60-ft circle on the caster, following its token, with its own minute",
    [region?.shapes?.[0]?.type, region?.shapes?.[0]?.x, region?.shapes?.[0]?.radius, rec?.followTokenId, rec?.ownExpiry, rec?.until, rec?.dc, rec?.castId],
    ["circle", 50, 1200, "tc", true, 1060, 30, "fumbled"]);
  ok("H16 (board) …and it struck at once with the rolled face (4, acid)", raised.lines.some((l) => /the storm's 1d6 — <strong>4<\/strong>, acid/.test(l)) && rec?.last === "acid", JSON.stringify(raised.lines));

  await sww.followStorms(casterTokenDoc, { x: 300, y: 200 });
  equal("H16 (board) the caster moves and the storm follows, read from the change", [region.shapes[0].x, region.shapes[0].y], [350, 250]);
  await sww.followStorms({ id: "other", parent: scene, width: 1, height: 1 }, { x: 900 });
  equal("H16 (board) another token's move leaves it", [region.shapes[0].x, region.shapes[0].y], [350, 250]);
  globalThis.game.users.activeGM = { id: "someone-else" };
  await sww.followStorms(casterTokenDoc, { x: 0, y: 0 });
  equal("H16 (board) only the acting GM moves it", [region.shapes[0].x, region.shapes[0].y], [350, 250]);
  globalThis.game.users.activeGM = { id: "gm" };

  rolled = [6];
  let said = await quiet(sww.applyStormTurnStarts)(caster);
  ok("H16 (board) the caster's turn start rolls and strikes again (6, force)", said.some((l) => /<strong>6<\/strong>, force/.test(l)) && region.getFlag("trg-prime", "storm").last === "force", JSON.stringify(said));
  rolled = [6];
  said = await quiet(sww.applyStormTurnStarts)(foeActor);
  ok("H16 (board) another creature's turn start does not", !said.length && scene.regions.includes(region));

  const cast = makeRegion(scene, { name: "cast", shapes: [{ type: "circle", x: 0, y: 0, radius: 1200 }] });
  await cast.setFlag("trg-prime", "storm", { castId: "gone", casterUuid: caster.uuid, label: "Storm of Unmaking", dc: 30, spec: UNMAKING, last: "" });
  caster.flags = { "trg-prime": { activeSpells: [] } };
  caster.getFlag = (s, k) => caster.flags[s]?.[k];
  rolled = [1, 1];
  said = await quiet(sww.applyStormTurnStarts)(caster);
  ok("H16 (board) a cast's storm whose spell has ended strikes nothing", !said.some((l) => /cast/.test(l)) && cast.getFlag("trg-prime", "storm").last === "");

  // FOUND LIVE (12 November): a CAST's turn-start storm has no active entry (Storm
  // of Unmaking's "1 minute" registers none), so it keeps its own clock.
  const castOwn = makeRegion(scene, { name: "cast-own", shapes: [{ type: "circle", x: 0, y: 0, radius: 1200 }] });
  rolled = [2];
  await quiet(sww.castStorm)(castOwn, { ...UNMAKING }, { caster, castId: "unregistered", dc: 30, spellName: "Storm of Unmaking", until: 1060 });
  rolled = [3];
  said = await quiet(sww.applyStormTurnStarts)(caster);
  equal("H16 (board) a cast's turn-start storm with its own clock strikes at the turn start though no active entry holds its cast (found live)",
    [castOwn.getFlag("trg-prime", "storm").ownExpiry, castOwn.getFlag("trg-prime", "storm").until, said.filter((l) => /the storm's 1d6/.test(l)).length], [true, 1060, 2]);

  globalThis.game.time.worldTime = 1060;
  said = await quiet(sww.applyStormTurnStarts)(caster);
  ok("H16 (board) …and passes at its time, at the turn start", !scene.regions.includes(castOwn));
  ok("H16 (board) a module's storm past its own clock passes at the turn start", !scene.regions.includes(region) && said.some((l) => /the storm passes/.test(l)), JSON.stringify(said));
  const second = await quiet(sww.placeStorm)(caster, { ...UNMAKING }, { radiusFeet: 60, seconds: 60, spellName: "Storm of Unmaking" });
  globalThis.game.time.worldTime = 5000;
  equal("H16 (board) …or on the world clock, on every scene, leaving a cast's storm alone",
    [await sww.expireStorms(5000), scene.regions.some((r) => r.id === second.regionId), scene.regions.includes(cast)], [1, false, true]);
  // THE HOOKS registerStorms puts down: the world clock ends a module's storm.
  const hooks = {};
  globalThis.Hooks = { on: (name, fn) => { (hooks[name] ??= []).push(fn); } };
  sww.registerStorms();
  const third = await quiet(sww.placeStorm)(caster, { ...UNMAKING }, { radiusFeet: 60, seconds: 6, spellName: "Storm of Unmaking" });
  for (const fn of hooks.updateWorldTime ?? []) fn(globalThis.game.time.worldTime + 10);
  await new Promise((r) => setTimeout(r, 20));
  equal("H16 (board) registered: the world clock's hook ends it, and the token hook is there",
    [scene.regions.some((r) => r.id === third.regionId), (hooks.updateToken ?? []).length], [false, 1]);
  equal("H16 (board) a module's storm with no radius is not raised",
    (await quiet(sww.placeStorm)(caster, { ...UNMAKING }, { radiusFeet: 0 })).regionId, null);
  equal("H16 (board) a malformed row is said, not raised", (await quiet(sww.placeStorm)(caster, { kind: "storm", modes: [] }, { radiusFeet: 60 })).regionId, null);
}

/* ================================================================== Z */
{
  equal("Z1 the version is 3.687.1, and the download names it", [sys.version, sys.download],
    ["3.687.1", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.687.1/trg-prime.zip"]);
  equal("Z2 package.json agrees", JSON.parse(read("package.json")).version, "3.687.1");
}

const EXPECTED = 60;
if (checks !== EXPECTED) failures.push(`expected ${EXPECTED} checks, ran ${checks}`);
if (failures.length) {
  console.error(`verify-block8b-core: ${failures.length} failure(s) of ${checks}`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-block8b-core: all ${checks} checks pass`);
