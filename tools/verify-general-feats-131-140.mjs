/**
 * verify-general-feats-131-140 — the two General feats the pages 131-140
 * audit found note-only and Graham ruled on, and the blind spot in
 * feat-evidence that would have hidden one of them for ever.
 *
 * FEATHER STEP (page 133): "You can Step into difficult terrain as if it
 * was normal terrain." Graham ruled SCOPED on 18 September 2026 — the
 * blanket `ignoresDifficultTerrain` flag Wild Stride uses would have
 * eased a Stride through the same mud, which the feat does not say.
 *
 * QUESTIONABLE SOURCE (page 133): "you always gain a piece of information
 * about the target of your check that is true (although not necessarily
 * useful)." Graham ruled that ALWAYS INCLUDES A FUMBLE, same date.
 *
 * WHAT IS ACTUALLY WORTH CHECKING HERE. Not that the flag exists — that
 * was true of Feather Step's note too, and the note did nothing. The
 * three things that can silently break are:
 *   - the scope being ignored, so Feather Step becomes Wild Stride;
 *   - the scope being read but the ARMED KEY never reaching it, so
 *     Feather Step does nothing at all;
 *   - the Step's refusal being a separate rule somewhere, so easing the
 *     cost leaves the move still blocked.
 * The last is why K4 exists: the prohibition is EMERGENT — a Step is
 * capped at 5 feet of COST and difficult ground doubles the cost — and
 * that is a load-bearing coincidence nothing else states out loud.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  ignoresDifficultTerrain, wildStrideCost, terrainReliefName, TERRAIN_RELIEF_SCOPE_FLAG
} from "../module/combat/passive-feats.mjs";
import { validateArmedMove, ARMED_MOVEMENT_ACTIONS } from "../module/combat/movement.mjs";
import {
  QUESTIONABLE_SOURCE_NAME,
  QUESTIONABLE_SOURCE_ACTION,
  hasQuestionableSource,
  questionableSourceNote
} from "../module/questionable-source.mjs";
import { DEGREE_BY_KEY } from "../module/dice/resolution.mjs";
import { SKILL_ACTIONS } from "../module/data/skill-actions.mjs";

let failures = 0;
let checks = 0;
function ok(label, condition, why = "") {
  checks++;
  if (condition) return;
  failures++;
  console.error(`  FAIL ${label}${why ? ` — ${why}` : ""}`);
}
function eq(label, actual, expected, why = "") {
  ok(label, JSON.stringify(actual) === JSON.stringify(expected),
    `${why}${why ? " — " : ""}got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
const read = (...parts) => fs.readFileSync(path.join(SYSTEM_ROOT, ...parts), "utf8");

async function packItems(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, value] of db.iterator()) out.push(value);
  await db.close();
  return out;
}

/* ------------------------------------------------------------------ */
/* FEATHER STEP                                                        */
/* ------------------------------------------------------------------ */

const feats = await packItems("feats");
const featherStep = feats.find((f) => f.name === "Feather Step");
const wildStride = feats.find((f) => f.name === "Wild Stride");

ok("K1 Feather Step is in the feats pack", Boolean(featherStep));
eq("K2 and it carries the SCOPED terrain flag, naming Step and only Step",
  featherStep?.flags?.["trg-prime"]?.[TERRAIN_RELIEF_SCOPE_FLAG], ["step"]);

/* THE FLAG THE DATA ROW WRITES MUST BE THE FLAG THE CODE READS. The
 * declared fix authors `flags.trg-prime.ignoresDifficultTerrainOn` and
 * passive-feats.mjs reads TERRAIN_RELIEF_SCOPE_FLAG; spelled differently
 * at either end, the feat is silent and nothing anywhere complains. This
 * is the Wild Stride lesson exactly — a finished mechanism gated on a
 * string that named nothing. Asserted through the constant rather than
 * against a literal, so the two cannot be edited apart. */
const declaredFixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
const featherRow = declaredFixes.find((f) => f.id === "feather-step-terrain-scope");
ok("K2b the declared fix for Feather Step is on the record", Boolean(featherRow));
eq("K2c and it writes the exact flag the terrain rule reads",
  featherRow?.path, `flags.trg-prime.${TERRAIN_RELIEF_SCOPE_FLAG}`,
  "a flag spelled differently at either end is a feat that silently does nothing");
ok("K3 and NOT the blanket flag Wild Stride uses",
  featherStep?.flags?.["trg-prime"]?.ignoresDifficultTerrain === undefined,
  "the blanket flag would ease a Stride through the same ground, which the feat does not grant");

/* THE PROHIBITION IS THE COST. Nothing declares "a Step may not enter
 * difficult terrain" as a rule of its own: the Step is capped at 5 feet
 * of COST, and Foundry prices difficult ground by multiplying cost, so
 * the cap refuses the move by arithmetic. Relieve the cost and the SAME
 * cap permits it. If someone ever adds a separate prohibition, K4 keeps
 * passing while the feat silently stops working — so K4 asserts the
 * refusal exists first, then that relief lifts it. */
const stepInto = (eases) => {
  const priced = wildStrideCost({ cost: 10, distance: 5, eases });
  return validateArmedMove("step", { moveCost: priced.cost, speed: 30 });
};
ok("K4 a 5-foot Step into difficult ground is refused WITHOUT the feat",
  stepInto(false).allowed === false,
  "if this ever passes, the cost cap is no longer what forbids the move and K5 proves nothing");
ok("K5 and permitted WITH the relief applied",
  stepInto(true).allowed === true,
  "the whole feat is the cost multiplier coming off; if this fails the Step is blocked elsewhere");
eq("K6 the Step's cap is still 5 feet — relief changes the cost, not the limit",
  ARMED_MOVEMENT_ACTIONS.step.maxDistance, 5);

/* The scope, driven through the real function. */
const scoped = { flags: { "trg-prime": { ignoresDifficultTerrainOn: ["step"] } } };
const blanket = { flags: { "trg-prime": { ignoresDifficultTerrain: true } } };
const carrying = (doc) => ({ items: [doc], effects: [] });

ok("K7 the scoped flag eases a Step",
  ignoresDifficultTerrain(carrying(scoped), "step"));
ok("K8 and eases NOTHING else — this is the whole ruling",
  ["crawl", "charge", "reposition"].every((key) => !ignoresDifficultTerrain(carrying(scoped), key)),
  "a scoped carrier easing another armed action is Feather Step turning into Wild Stride");
ok("K9 and eases nothing when the action was not identified",
  !ignoresDifficultTerrain(carrying(scoped), null),
  "defaulting the other way would let one forgotten argument grant the blanket rule");
ok("K10 while a BLANKET carrier still eases every move, keyed or not",
  ignoresDifficultTerrain(carrying(blanket), null)
    && ignoresDifficultTerrain(carrying(blanket), "step")
    && ignoresDifficultTerrain(carrying(blanket), "charge"),
  "Wild Stride, Silvarni and Terrain Mastery must not be narrowed by this change");
ok("K11 a scoped carrier works as an EFFECT as well as an item",
  ignoresDifficultTerrain({ items: [], effects: [scoped] }, "step"));
ok("K12 and a disabled effect carries nothing",
  !ignoresDifficultTerrain({ items: [], effects: [{ ...scoped, disabled: true }] }, "step"));
ok("K13 an empty scope array grants nothing",
  !ignoresDifficultTerrain(carrying({ flags: { "trg-prime": { ignoresDifficultTerrainOn: [] } } }), "step"));
ok("K14 the scope is matched case-insensitively",
  ignoresDifficultTerrain(carrying({ flags: { "trg-prime": { ignoresDifficultTerrainOn: ["STEP"] } } }), "step"));
ok("K15 Wild Stride still carries the blanket flag",
  wildStride?.flags?.["trg-prime"]?.ignoresDifficultTerrain === true,
  "the scoped mechanism must not have displaced the blanket one");

const movementSource = read("module", "combat", "movement-workflow.mjs");

/* THE ARMED KEY MUST REACH THE PRICER. Read off the source because the
 * hook needs a live Foundry to run, and a scoped flag that is never
 * handed an action key is a feat that does nothing. */
ok("K16 the movement workflow passes the armed key into the terrain relief",
  /const easedBy = terrainReliefName\(actor, armedKey\);/.test(movementSource)
    && /eases: Boolean\(easedBy\)/.test(movementSource),
  "without the key every scoped carrier is inert");
ok("K16g the relief is asked ONCE and its answer reused for both the cost and the card",
  (movementSource.match(/terrainReliefName\(/g) ?? []).length === 1,
  "exactly one call site; a second scan could disagree with the one that priced the move");
/* THE CARD MUST NAME THE CARRIER THAT ACTUALLY EASED THE GROUND.
 *
 * Found in live testing of 3.570.0: a character with Feather Step and no
 * Wild Stride at all was told "Wild Stride eased the terrain." The
 * sentence was hard-coded when Wild Stride was the only carrier, and by
 * 3.570.0 it was wrong for three of the four. A message naming the wrong
 * rule is worse than none, because a player checking their sheet for the
 * feat it names will not find it.
 *
 * Asserted by RUNNING the naming, and by refusing the hard-coded string
 * in the source — either alone would pass while the other rotted. */
eq("K16a the relief names Feather Step when Feather Step is what eased it",
  terrainReliefName(carrying({ ...scoped, name: "Feather Step" }), "step"), "Feather Step");
eq("K16b and names Wild Stride when Wild Stride did",
  terrainReliefName(carrying({ ...blanket, name: "Wild Stride" }), null), "Wild Stride");
eq("K16c and nothing at all when nothing eased it",
  terrainReliefName(carrying(scoped), "charge"), null);
ok("K16d a nameless carrier still yields a printable label, never an empty sentence",
  String(terrainReliefName(carrying(blanket), null) ?? "").trim().length > 0);
ok("K16e the movement notice no longer hard-codes a feat name",
  !/Wild Stride eased the terrain/.test(movementSource),
  "this exact string named the wrong feat for three of the four carriers");
ok("K16f and prints the carrier it was handed",
  /\$\{easedBy \?\? "Your terrain training"\} eased the terrain\./.test(movementSource));

ok("K17 and reads the armed flag BEFORE it prices the path",
  movementSource.indexOf("const armedNow = actor?.getFlag?.(SYSTEM_ID, ARMED_FLAG)")
    < movementSource.indexOf("pathCost(movement, actor, armedNow)")
    && movementSource.includes("pathCost(movement, actor, armedNow)"),
  "reading it after the cost is worked out would hand pathCost an undefined key");

/* ------------------------------------------------------------------ */
/* QUESTIONABLE SOURCE                                                 */
/* ------------------------------------------------------------------ */

const questionable = feats.find((f) => f.name === QUESTIONABLE_SOURCE_NAME);
ok("K18 Questionable Source is in the feats pack", Boolean(questionable));

const recall = SKILL_ACTIONS.find((a) => a.key === QUESTIONABLE_SOURCE_ACTION);
ok("K19 the action it rides exists", Boolean(recall));
eq("K20 and it is Recall Knowledge", recall?.name, "Recall Knowledge");

ok("K21 the feat is detected on an actor carrying it",
  hasQuestionableSource({ items: [{ type: "feat", name: QUESTIONABLE_SOURCE_NAME }] }));
ok("K22 and not on one that is not",
  !hasQuestionableSource({ items: [{ type: "feat", name: "Wheeler Dealer" }] }));
ok("K23 and not from a non-feat item of the same name",
  !hasQuestionableSource({ items: [{ type: "ability", name: QUESTIONABLE_SOURCE_NAME }] }),
  "an ability sharing the name must not grant the feat");

/* THE RULING, STATED AS A TEST. "Always" includes a Fumble: that is the
 * answer Graham gave and the only reason this feat is worth carrying. */
ok("K24 a FUMBLE still yields the true fact — Graham's ruling of 18 September 2026",
  Boolean(questionableSourceNote("fumble")),
  "this single assertion IS the ruling; if it ever goes quiet the feat has been silently weakened");
ok("K25 and so does a failure",
  Boolean(questionableSourceNote("failure")));
ok("K26 every non-success degree speaks",
  Object.keys(DEGREE_BY_KEY)
    .filter((key) => !DEGREE_BY_KEY[key].success)
    .every((key) => Boolean(questionableSourceNote(key))),
  "driven from the degree ladder, so a new degree cannot fall through the gap");
ok("K27 and no success degree does — the feat is a floor, not a bonus",
  Object.keys(DEGREE_BY_KEY)
    .filter((key) => DEGREE_BY_KEY[key].success)
    .every((key) => questionableSourceNote(key) === null),
  "Recall Knowledge already hands over accurate knowledge on a success");
ok("K28 an unknown degree is answered with silence, not a guarantee",
  questionableSourceNote("nonsense") === null && questionableSourceNote("") === null
    && questionableSourceNote(undefined) === null);
ok("K29 the note says the information is true",
  /\btrue\b/.test(String(questionableSourceNote("fumble"))));
ok("K30 and repeats the printed caveat that it need not be useful",
  /not necessarily useful/.test(String(questionableSourceNote("fumble"))),
  "the parenthesis is the balance of the feat and belongs on the card");
ok("K31 and does not pretend the bad information went away",
  /stands as rolled/.test(String(questionableSourceNote("fumble"))),
  "a Fumble still recalls something false; the feat adds a truth beside it, it does not cancel it");

/* The wiring into the card. */
const actionSource = read("module", "combat", "action-workflow.mjs");
ok("K32 the action workflow gates the note on the feat being carried",
  /hasQuestionableSource\(actor\)/.test(actionSource),
  "ungated, every character would get the feat");
ok("K33 and on the action being Recall Knowledge",
  /action\.key === QUESTIONABLE_SOURCE_ACTION/.test(actionSource),
  "compared against the exported key, so the action cannot be renamed out from under it");
ok("K34 and pushes the line only when there is one",
  /if \(note\) lines\.push\(line\(note\)\);/.test(actionSource),
  "pushing unconditionally would print 'null' on every success");

/* ------------------------------------------------------------------ */
/* FEAT-EVIDENCE'S BLIND SPOT                                          */
/* ------------------------------------------------------------------ */

/* Feat-evidence counted mechanical flags on EFFECTS and not on ITEMS.
 * Wild Stride carries `ignoresDifficultTerrain` on the item and escaped
 * "note-only" only because its name also appears in code; Feather Step,
 * carrying the same kind of flag under a name nothing spells out, would
 * have been reported as unimplemented for ever. Same shape as the
 * composed-names miss fixed at 3.569.0: a real automation route the tool
 * did not look down, reported for releases as an absence. */
const evidenceSource = read("tools", "feat-evidence.mjs");
ok("K35 feat-evidence reads mechanical flags off the ITEM, not only off effects",
  /const itemFlags = item\?\.flags\?\.\["trg-prime"\] \?\? \{\};/.test(evidenceSource)
    && /for \(const key of Object\.keys\(itemFlags\)\) \{[\s\S]{0,200}?mechFlags\.add\(key\);/.test(evidenceSource),
  "an item-level flag is a real automation route and was invisible to the tool");
ok("K36 and still excludes `conditionals`, which earns its own tier",
  /if \(key === "conditionals" \|\| MARKER_FLAGS\.has\(key\)\) continue;/.test(evidenceSource),
  "folding conditionals into `data` would hide the conditional tier");

const { analyseFeats } = await import("./feat-evidence.mjs");
const { rows } = await analyseFeats();
const tierOf = (name) => rows.find((r) => r.name === name)?.tier;

/* ASSERTED AS THE TIER IT SHOULD BE, not merely "not unimplemented".
 * The weaker form passed a mutation that closed the item-flag route
 * entirely: Feather Step fell to `unknown` rather than `note-only`,
 * because this file's own doc comment happens to name it, and "not
 * unimplemented" was satisfied by a tier that means "I cannot tell".
 * Caught by mutate-general-feats-131-140 at 3.570.0 — a check passing
 * for a reason unrelated to the thing it is guarding. */
eq("K37 Feather Step reads as DATA — the tier its item flag earns",
  tierOf("Feather Step"), "data",
  "`unknown` would mean the tool cannot see the flag and is guessing from a comment");
ok("K38 Questionable Source reads as built, by name in code",
  tierOf("Questionable Source") === "code",
  `reads as ${tierOf("Questionable Source")}`);

/* UNDERWATER MARAUDER, BUILT (3.632.0). This tripwire waited for the
 * underwater subsystem; page 201 shipped at 3.580.0 and Fiends & Fables
 * 3.0's Aquatic and Submersible (block 2, ruling 6) gave it its exemption
 * rail, which fired K39. The feat now lifts the melee −2 and the
 * flat-footed, on that rail. */
const underwaterSrc = read("module", "combat", "underwater.mjs");
ok("K39 Underwater Marauder lifts the underwater attack penalty",
  /meleePenalty: Boolean\(aquaticAttacker \|\| submersibleWeapon \|\| marauder\)/.test(underwaterSrc)
    && /marauder: ownsCodexFeat\(actor\.items, UNDERWATER_MARAUDER\)/.test(read("module", "combat", "attack-workflow.mjs")),
  "the feat's 'ignore attack penalties when fighting' is not read");
ok("K40 and is never flat-footed in the water",
  /const flatFooted = !marauder && underwaterFlatFooted\(/.test(read("module", "combat", "underwater-workflow.mjs")),
  `the feat's 'not flat-footed whilst in water' is not read (tier ${tierOf("Underwater Marauder")})`);

console.log(
  failures
    ? `verify-general-feats-131-140: ${failures} FAILED of ${checks}`
    : `verify-general-feats-131-140: ${checks} checks passed`
);
process.exit(failures ? 1 : 0);
