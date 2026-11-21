#!/usr/bin/env node
/**
 * verify-live-findings-3707-2 — core 3.707.3: what the live test of 3.707.2
 * found (Testing Dude, the "Test" world, 21 November 2026).
 *
 *   A  Stone Shield could not be cast against a foe, as a reaction or from the
 *      sheet: "ZZ Orc is 5 ft away — beyond Stone Shield's range of self." The
 *      spell prints no range; the range gate measured the named foe against
 *      "self". A ward on the caster, in a spell printing neither range nor
 *      area, no longer has its foe measured. Anticipations (30 ft) still does.
 *   B  Seer's Vision's glimpse never lapsed: its record had no clock, so
 *      "until the end of your next turn" was never enforced. It now carries
 *      the turn-end stamp and the turn-end sweep drops it.
 *   C  A blow on the shield's damage card read "5 Bludgeoning — no target".
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* A */
{
  const { targetOnlyNamesWardFoe } = await mod("magic", "ward.mjs");
  const stone = { range: "", area: "", effects: [{ kind: "ward", target: "self" }] };
  equal("A1 Stone Shield's foe is not measured; Anticipations' is; Forbidding Ward's ally ward is; a spell with no ward is",
    [targetOnlyNamesWardFoe(stone),
      targetOnlyNamesWardFoe({ ...stone, range: "30 feet" }),
      targetOnlyNamesWardFoe({ range: "", area: "", effects: [{ kind: "ward", target: "allies" }] }),
      targetOnlyNamesWardFoe({ range: "", area: "", effects: [{ kind: "note" }] }),
      targetOnlyNamesWardFoe({ ...stone, effects: [{ kind: "ward", target: "self" }, { kind: "damage" }] })],
    [true, false, false, false, false]);
  ok("A2 a warp that gives it a range or an area brings the gate back", !targetOnlyNamesWardFoe(stone, { range: "touch" }) && !targetOnlyNamesWardFoe(stone, { area: "10-foot emanation" }));
  const CW = read("module", "magic", "cast-workflow.mjs");
  ok("A3 the range gate asks it, with the warped range and area",
    /const wardFoeOnly = \(await import\("\.\/ward\.mjs"\)\)\.targetOnlyNamesWardFoe\(spellData, \{\n\s+range: warpedRange\(effRange, warpMods\), area: warpedAreaText\(effArea, warpMods\)\n\s+\}\);\n\s+if \(!storingNow && !spellTargetsObject\(spell\) && !wardFoeOnly && \(game\.user\?\.targets\?\.size \?\? 0\)\) \{/.test(CW));
}

/* B */
{
  const { seersVisionRecord } = await mod("magic", "seers-vision.mjs");
  const stamp = { of: "Actor.w", castTurn: "3:c" };
  equal("B1 the record carries the stamp, two strings only", seersVisionRecord({ value: 15, endsAtTurnEndOf: { ...stamp, extra: 1 } }).endsAtTurnEndOf, stamp);
  ok("B2 and none when there is none (out of an encounter), or when it is not one", !("endsAtTurnEndOf" in seersVisionRecord({ value: 15 })) && !("endsAtTurnEndOf" in seersVisionRecord({ value: 15, endsAtTurnEndOf: { of: 5 } })));
  const SE = read("module", "magic", "spell-effects.mjs");
  ok("B3 the cast hands it the spell's own turn-end stamp", /endsAtTurnEndOf: spellExpiryTiming\(parsedDuration\)\.turnEndOf \?\? null\n\s+\}\);/.test(SE));
  ok("B4 and the workflow passes it on", /const record = seersVisionRecord\(\{ value, casterName, label, round, types, source, endsAtTurnEndOf \}\);/.test(read("module", "magic", "seers-vision-workflow.mjs")));
  const E = await mod("combat", "effect-application-workflow.mjs");
  let flag = [{ value: 15, label: "Seer’s Vision", source: "Seer’s Vision", endsAtTurnEndOf: stamp }, { value: 9, label: "Embrace Destiny", source: "Embrace Destiny" }];
  const ally = { effects: [], getFlag: () => flag, setFlag: async (s, k, v) => { flag = v; }, unsetFlag: async () => { flag = null; } };
  const castTurn = await E.expireAtTurnEnd(ally, { turnOf: { uuid: "Actor.w" }, round: 3, combatantId: "c" });
  const otherTurn = await E.expireAtTurnEnd(ally, { turnOf: { uuid: "Actor.o" }, round: 3, combatantId: "o" });
  const keptAfter = flag.length;
  const nextTurn = await E.expireAtTurnEnd(ally, { turnOf: { uuid: "Actor.w" }, round: 4, combatantId: "c" });
  ok("B5 driven: the glimpse outlasts the cast's turn and the orc's, lapses as the caster's next turn ends, and another spell's record is kept",
    castTurn.length === 0 && otherTurn.length === 0 && keptAfter === 2 && nextTurn[0] === "Seer’s Vision" && JSON.stringify(flag) === JSON.stringify([{ value: 9, label: "Embrace Destiny", source: "Embrace Destiny" }]),
    JSON.stringify({ castTurn, otherTurn, nextTurn, flag }));
  let only = [{ value: 15, label: "Seer’s Vision", endsAtTurnEndOf: stamp }];
  let unset = false;
  await E.expireAtTurnEnd({ effects: [], getFlag: () => only, setFlag: async (s, k, v) => { only = v; }, unsetFlag: async () => { unset = true; } }, { turnOf: { uuid: "Actor.w" }, round: 4, combatantId: "c" });
  ok("B6 the last record lapsing clears the flag", unset);
}

/* C */
{
  const AW = read("module", "combat", "attack-workflow.mjs");
  ok("C1 a blow on a shield names it on its card's summary",
    /compactSummary: struckObject\n\s+\? `\$\{total\} \$\{typeLabel\} to \$\{String\(struckObject\)\.replace\(\/\[<>&"\]\/g, ""\)\} \(before its Hardness\)`\n\s+: damageCompactSummary\(\)/.test(AW));
}

const EXPECTED = 11;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-live-findings-3707-2: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-live-findings-3707-2: OK — ${checks} checks`);
