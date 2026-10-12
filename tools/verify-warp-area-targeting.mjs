#!/usr/bin/env node
/**
 * verify-warp-area-targeting — a warp that widens a spell, and one that
 * changes whose side it lands on.
 *
 * NEW at 3.530.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MECHANISM WAS FINISHED; SEVEN WARPS HAD NEVER BEEN GIVEN TO IT.
 *
 * `areaOverride` has been complete for releases — `warpedAreaText` returns
 * it outright, and twelve warps already used it, ten of them on spells
 * whose own printed area is empty, which is the exact shape of these
 * seven. Nothing needed building. What these warps had was the sentence
 * and not the mod:
 *
 *   "+4 PP: the spell effects all creatures in a 20 feet radius"
 *
 * byte-identical on six Word Of ___ spells, offered in the chooser,
 * charged, and dropped. Word Of Death sold you a 20-foot radius and killed
 * one creature.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SO WHY IS THERE ANY NEW CODE AT ALL? BECAUSE OF THE SEVENTH.
 *
 * Aid's warp does not say "all creatures". It says:
 *
 *   "+3 PP: effect all allies in a 10-foot radius"
 *
 * `areaTargeting` is a SPELL-level field — "all", "allies" or "enemies" —
 * read in cast-workflow at two places, and until now nothing could change
 * it. Aid is "all". The six-word data fix that would otherwise have
 * shipped would have handed Aid's temporary HP and its +1 to attack to
 * every ENEMY standing within ten feet of the target. A warp that buffs
 * the people you are fighting is worse than a warp that does nothing,
 * which is the whole reason `warpedAreaTargeting` exists.
 *
 * Section T is that rule. Section D is the pack. Section S is the second
 * thing measured before declaring anything: an area draws a template and
 * hands it a set of tokens, so an effect row targeting `self` would
 * produce a circle that grants nothing to anyone inside it. Section X
 * records the four spells that failed exactly that test and were left
 * alone on purpose.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { warpedAreaTargeting, warpedAreaText } from "../module/magic/warp-area.mjs";
import { emptyWarp, aggregateWarpSelection, warpMaxTimes } from "../module/magic/spell-warp.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

/* ================================================================== *
 * T. THE RULE
 * ================================================================== */

equal("T1 NO WARP LEAVES THE SPELL'S OWN SIDE ALONE",
  warpedAreaTargeting("all", {}), "all");
equal("T1b including when the spell already picks a side",
  warpedAreaTargeting("allies", {}), "allies");
equal("T1c and the other side",
  warpedAreaTargeting("enemies", {}), "enemies");

equal("T2 AN OVERRIDE CHANGES WHOSE SIDE THE AREA LANDS ON",
  warpedAreaTargeting("all", { areaTargetingOverride: "allies" }), "allies",
  "Aid's \"effect all allies in a 10-foot radius\"");
equal("T2b and can narrow to enemies just as well",
  warpedAreaTargeting("all", { areaTargetingOverride: "enemies" }), "enemies");
equal("T2c and can widen back to everyone",
  warpedAreaTargeting("allies", { areaTargetingOverride: "all" }), "all");

equal("T3 A MISSING FIELD IS NOT AN ANSWER — the spell's own stands",
  warpedAreaTargeting("allies", { areaTargetingOverride: null }), "allies");
equal("T3b NOR IS A TYPO, and this is the one that matters",
  warpedAreaTargeting("allies", { areaTargetingOverride: "freinds" }), "allies",
  "a mistyped fix must not quietly widen an allies-only spell to everyone in the circle");
equal("T3c nor an empty string",
  warpedAreaTargeting("enemies", { areaTargetingOverride: "" }), "enemies");

equal("T4 AND AN UNREADABLE SPELL FIELD FALLS BACK TO EVERYONE",
  warpedAreaTargeting(undefined, {}), "all",
  "which is what both call sites did with `|| \"all\"` before this rule existed");
equal("T4b case and spacing are not a different answer",
  warpedAreaTargeting("  ALLIES ", {}), "allies");

/* ── T5: AN OVERRIDE IS NOT MULTIPLIED BY ITS PURCHASES ──────────── */

const aidWarp = { ppCost: 3, text: "effect all allies in a 10-foot radius",
  mods: { areaOverride: "10-foot radius", areaTargetingOverride: "allies" } };
const once = aggregateWarpSelection([aidWarp], { "warp-0": 1 }).mods;
const twice = aggregateWarpSelection([aidWarp], { "warp-0": 2 }).mods;
equal("T5 BUYING IT TWICE SAYS THE SAME THING",
  JSON.stringify(once.areaTargetingOverride), JSON.stringify(twice.areaTargetingOverride),
  "\"all allies\" is true or it is not; an override is not multiplied");
equal("T5b so the chooser draws it as a checkbox, not a count",
  warpMaxTimes(aidWarp, ""), 1);
ok("T5c AND THE AGGREGATOR ACTUALLY CARRIES IT",
  once.areaTargetingOverride === "allies",
  `${JSON.stringify(once.areaTargetingOverride)} — a mod absent from emptyWarpMods() is `
  + "offered, charged, and silently dropped, which is the defect this whole release repairs");
ok("T5d and an unwarped selection carries nothing",
  emptyWarp().mods.areaTargetingOverride === null);

/* ── T6: THE TWO OVERRIDES ARE INDEPENDENT ───────────────────────── */

equal("T6 A SIDE OVERRIDE DOES NOT INVENT AN AREA",
  warpedAreaText("", { areaTargetingOverride: "allies" }), "",
  "a spell with no area and no areaOverride draws no template");
equal("T6b AND AN AREA OVERRIDE DOES NOT CHANGE THE SIDE",
  warpedAreaTargeting("all", { areaOverride: "20-foot radius" }), "all",
  "the six Word Of ___ warps say \"all creatures\" and must stay that way");

/* ================================================================== *
 * D. THE PACK
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) if (v?.name) spells.push(v);
await db.close();

const spell = (name) => spells.find((s) => s.name === name);

// + Word Of Stunning at 3.611.0: its base is built now (block 34, A2).
const WORDS = ["Word Of Blinding", "Word Of Deafening", "Word Of Distraction",
  "Word Of Fatigue", "Word Of Death", "Word Of Biting", "Word Of Stunning"];

for (const name of WORDS) {
  const s = spell(name);
  const w = (s?.system?.warps ?? []).find((x) => /all creatures in a 20 feet radius/i.test(x?.text ?? ""));
  equal(`D1 ${name} NOW DRAWS THE RADIUS IT SELLS`,
    w?.mods?.areaOverride, "20-foot radius",
    "the sentence was in the pack all along; the mod was not");
  equal(`D1b ${name} STILL CATCHES EVERYONE, because its warp says "all creatures"`,
    warpedAreaTargeting(s?.system?.areaTargeting, w?.mods ?? {}), "all");
}

const aid = spell("Aid");
const aidW = (aid?.system?.warps ?? []).find((x) => /all allies in a 10-foot radius/i.test(x?.text ?? ""));
equal("D2 AID DRAWS ITS TEN FEET", aidW?.mods?.areaOverride, "10-foot radius");
equal("D2b AND CATCHES ALLIES ONLY",
  warpedAreaTargeting(aid?.system?.areaTargeting, aidW?.mods ?? {}), "allies",
  "its rows hand out temporary HP and +1 to attack; without the side override "
  + "this warp would have buffed every enemy within ten feet");
equal("D2c which is a CHANGE — the spell itself targets everyone",
  aid?.system?.areaTargeting, "all",
  "pinned so that a later edit to the spell field cannot make D2b pass for the wrong reason");

/* ── D3: THE COUPLING, AND THE RESIDUE ──────────────────────────── */

const NAMES_A_SIDE = /\b(all|every)\s+(allies|allied|enemies|foes|opponents)\b/i;
const NAMES_A_DISTANCE = /\b\d+[- ]?(foot|feet)\b/i;

const uncoupled = [];
const inertSideWarps = [];
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    const t = String(w?.text ?? "");
    if (!NAMES_A_SIDE.test(t) || !NAMES_A_DISTANCE.test(t)) continue;
    if (!w?.mods?.areaOverride) { inertSideWarps.push(s.name); continue; }
    if (!w?.mods?.areaTargetingOverride) uncoupled.push(`${s.name}: ${t}`);
  }
}

ok("D3 A WARP THAT DRAWS AN AREA AND NAMES A SIDE CARRIES THE SIDE OVERRIDE",
  uncoupled.length === 0,
  `${JSON.stringify(uncoupled)} — this is the Aid defect exactly: the circle gets `
  + "drawn, the side does not get set, and the spell's own `all` hands an allies-only "
  + "buff to every enemy inside it. Drawing without setting is the one combination "
  + "that is worse than the warp staying inert");

/* THE RESIDUE IS NOT A FAILURE — it is the list of side-naming warps that
 * draw no area at all, and every one of them is inert for a reason
 * recorded in section X. It is pinned by NAME so that a spell joining
 * this list arrives as a decision to make rather than a silent third
 * state between "built" and "excluded". */
ok("D3b AND THE WARPS THAT NAME A SIDE BUT DRAW NOTHING ARE THE PINNED ONES",
  JSON.stringify([...new Set(inertSideWarps)].sort())
    === JSON.stringify(["Deathless"]),
  `${JSON.stringify([...new Set(inertSideWarps)].sort())} — each is excluded in `
  + "three at 3.530.0, one now: Hunter's Veil and Prescience left this list at "
  + "3.534.0 when their warps gained areaOverride AND areaTargetingOverride, so they "
  + "draw a circle and narrow it to allies. Deathless remains, still for its original "
  + "reason — it has no effect rows at all. A new name needs a ruling, not a default");

/* ================================================================== *
 * C. THE WIRING
 * ================================================================== *
 *
 * A RULE NOBODY CALLS IS A RULE THAT DOES NOTHING, and this project has
 * shipped that twice — a mod declared and never aggregated, a check that
 * grepped a guard's text instead of running it. Section T proves the rule
 * is right. This proves the game asks it.
 *
 * It is deliberately NOT a search for the rule's name in the source,
 * which is the shape that has lied here before: it counts the RAW READS
 * instead. `spellData.areaTargeting` reached at all, outside the one
 * import line, means some path decided a side without asking about
 * warps — and the two consumers that exist (the friend/foe filter that
 * builds the affected token list, and the emanation record that keeps a
 * standing circle deciding it for hours afterwards) must never disagree
 * with each other, which is the actual reason the rule was extracted
 * rather than inlined twice.
 */

const workflow = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");

const rawReads = [...workflow.matchAll(/spellData\.areaTargeting/g)].length;
equal("C1 NOTHING READS THE SPELL'S SIDE WITHOUT ASKING ABOUT WARPS",
  rawReads, 2,
  "both remaining reads are the arguments handed TO warpedAreaTargeting; a third, "
  + "or either one used bare, is a path that ignores Aid's warp entirely");

const throughRule = [...workflow.matchAll(/warpedAreaTargeting\(spellData\.areaTargeting, warpMods\)/g)].length;
equal("C1b AND BOTH CONSUMERS ASK IT THE SAME WAY",
  throughRule, 2,
  "the friend/foe filter at cast time and the emanation record that outlives it — "
  + "a standing circle that disagreed with the cast that made it would flip sides "
  + "the moment somebody walked into it");

ok("C2 THE RULE IS IMPORTED RATHER THAN REDECLARED",
  /import \{[^}]*warpedAreaTargeting[^}]*\} from "\.\/warp-area\.mjs"/.test(workflow),
  "a second copy of this arithmetic is how the two call sites drift apart");

/* ================================================================== *
 * S. THE TEST THAT DECIDED WHO WAS IN THE LIST
 * ================================================================== */

/*
 * WHICH ROW TARGETS READ THE CIRCLE.
 *
 * "allies" JOINED THEM AT 3.552.4, and it belongs here rather than being
 * an exception: spell-effects.mjs resolves an allies row as the
 * AREA-CAUGHT LIST filtered by disposition
 * (`targets.filter((t) => !hostileUuids.includes(t.uuid))`), so such a
 * row uses the template exactly as a `targets` row does — it just
 * declines to help the people trying to kill you.
 *
 * Found by this check going red on Wash Away Sin, whose heal row was
 * narrowed to allies on 15 Sep 2026 when its cone was widened to catch
 * everyone. The check was right to ask and wrong about the answer: the
 * circle is not mute, it is one-sided.
 */
const AREA_TARGETS = new Set(["targets", "target", "allies"]);
const declared = [];
for (const s of spells) {
  for (const w of (s.system?.warps ?? [])) {
    if (!w?.mods?.areaOverride) continue;
    declared.push(s);
    break;
  }
}
ok("S0 THE PRECEDENT IS STILL THERE AND HAS GROWN AGAIN",
  declared.length === 24,
  `${declared.length} spells carry an areaOverride — twelve before 3.530.0, seven `
  + "declared there, Luminous Flare at 3.531.0, the four self-row spells at 3.534.0, "
  + "and Word Of Stunning at 3.539.0, which was matching its own twin all along");

/* ── S1: THE INVARIANT THIS SECTION WAS BUILT ON, CORRECTED ────────
 *
 * At 3.530.0 this asserted that NOTHING with an area override may have
 * only `self` rows, because an area draws a template and hands it the
 * tokens inside, so such a row would produce a circle granting nothing to
 * anyone standing in it. That was true, and it is why Confounded Imagery,
 * Hunter's Veil, Prescience and Concealing Terrain were excluded here for
 * four releases.
 *
 * 3.534.0 FIXED THE REASON RATHER THAN WORKING AROUND IT. `shareSelfRows`
 * makes a `self` row apply to the caster AND everyone the circle caught,
 * so those four now carry an area override legitimately — and the old
 * assertion, left as it was, would have refused the repair.
 *
 * SO THE RULE IS NARROWED, NOT DELETED. A self-rowed spell with an area
 * override must SAY what its row does with the circle; silence is still
 * the defect, it is just no longer the only possible state.
 */

const selfRowedMute = [];
for (const s of declared) {
  const rows = (s.system?.effects ?? []).filter((e) => e?.kind !== "note");
  if (!rows.length) continue;            // damage rides system.damage — Dark Tendrils
  if (rows.every((e) => AREA_TARGETS.has(String(e?.target ?? "")))) continue;
  const w = (s.system?.warps ?? []).find((x) => x?.mods?.areaOverride);
  if (w?.mods?.shareSelfRows || w?.mods?.retargetSelfRows) continue;
  selfRowedMute.push(`${s.name}: ${rows.map((e) => `${e.kind}:${e.target}`).join(", ")}`);
}
ok("S1 A SELF-ROWED SPELL WITH AN AREA SAYS WHAT THE CIRCLE DOES",
  selfRowedMute.length === 0,
  `${JSON.stringify(selfRowedMute)} — an area over rows that do not target the area `
  + "grants nothing to anyone standing in it unless the warp carries shareSelfRows or "
  + "retargetSelfRows. This is the 3.530.0 exclusion narrowed at 3.534.0: the four "
  + "spells it excluded now carry the flag that makes their circles mean something");

/* ================================================================== *
 * X. LEFT INERT ON PURPOSE
 * ================================================================== */

/* THE FOUR THIS SECTION USED TO EXCLUDE ARE BUILT NOW (3.534.0).
 *
 * They were pinned here as "has a self row, so its area warp stays inert"
 * — a decision recorded so a later release would read it rather than
 * rediscover it. That worked exactly as intended: the later release read
 * it, and repaired the reason instead of the symptom. What stays here is
 * the fact that they are no longer excluded, so this paragraph cannot be
 * mistaken for current. Their coverage lives in verify-self-row-reach. */
for (const name of ["Confounded Imagery", "Prescience", "Hunter\u2019s Veil", "Concealing Terrain"]) {
  const s = spell(name);
  const w = (s?.system?.warps ?? []).find((x) => x?.mods?.areaOverride);
  ok(`X1 ${name} IS NO LONGER EXCLUDED — its self row now shares the circle`,
    Boolean(w?.mods?.shareSelfRows),
    `${JSON.stringify(w?.mods)} — excluded here from 3.530.0 to 3.533.0 because an area `
    + "over a self row granted nothing to anyone inside it; shareSelfRows is that reason "
    + "repaired rather than worked around");
}

const deathless = spell("Deathless");
ok("X1b DEATHLESS HAS NO EFFECT ROWS AT ALL, SO ITS AREA WARP STAYS INERT",
  (deathless?.system?.effects ?? []).length === 0
  && !(deathless?.system?.damage?.formula),
  `${JSON.stringify(deathless?.system?.effects)} — "preventing death when exceeding `
  + "Death State\" is not built, so widening the spell to a 15-foot radius of allies "
  + "would spread nothing across more people. Its warp also moves the RANGE from "
  + "touch to 30 feet, which areaOverride does not do — a second reason it is not a "
  + "data fix");

const stun = spell("Word Of Stunning");
// BUILT AT 3.611.0 (block 34, A2): its four stun rungs are rows, so its
// 20-foot radius now spreads something. It joined WORDS above.
ok("X2 WORD OF STUNNING'S BASE IS BUILT, SO ITS AREA WARP SPREADS IT",
  !(stun?.system?.effects ?? []).some((e) => e?.kind === "note")
  && (stun?.system?.effects ?? []).filter((e) => e?.kind === "condition").length === 4,
  "warping an unbuilt base is the trap this project has walked into three times");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-warp-area-targeting: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-warp-area-targeting: OK — ${checks} checks. `
  + "Seven warps draw the area they sell, and Aid's lands on allies alone.\n");
