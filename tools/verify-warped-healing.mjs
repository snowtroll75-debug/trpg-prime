#!/usr/bin/env node
/**
 * verify-warped-healing — raising what a spell heals, and three warps
 * whose mod already existed.
 *
 * NEW at 3.531.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HEAL ROW WAS ALREADY WARPABLE — FOR ONE SHAPE OF SPELL.
 *
 * It has consumed `damageDice` since the bleed channel, and Cure is why
 * that looked fine: on Cure the healing IS the spell's one number, so a
 * die aimed at "damage" lands on the only thing there is. Soothing
 * Ballad is that same shape, and needed no code at all.
 *
 * WASH AWAY SIN IS THE ONE THAT BROKE IT. It heals `1d8` and burns
 * `1d6`, from a single warp reading:
 *
 *   "+2 PP: increase both the healing and damage by 1 die"
 *
 * One `damageDice` string cannot be two die sizes. Set it to "1d8" and
 * the damage becomes `1d6 + 1d8`; set it to "1d6" and the healing becomes
 * `1d8 + 1d6`. `addDice` refuses to merge different dice — correctly, and
 * that refusal is exactly what would have carried the mistake to the
 * table looking deliberate. So `healDice` names the healing side only.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND WASH AWAY SIN WAS REVERTED AT 3.531.1. The rule below is right and
 * stays; the SPELL was the wrong place to prove it. Live, its cone caught
 * an ally, dealt them the doubled damage, and healed nobody. See section
 * D3 — the mod was correct arithmetic aimed at a number that should never
 * have reached that creature. `healDice` keeps its fallback and its tests
 * on their own merits, and waits for a spell whose damage side is built.
 *
 * MAKE WHOLE BROKE IT A SECOND WAY. Its row prints a bare `20` and its
 * warp adds five. `warpedRowExtra` multiplies a formula's TRAILING
 * constant — "1d8 + 8" becomes "1d8 + 16" — and cannot see a bare one.
 * Growing an extra that exists and adding one that does not are different
 * verbs, so `healBonus` is a separate mod rather than a surprise inside
 * an existing one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION C IS THE POINT OF THE WHOLE DESIGN. `healDice` falls back to
 * `damageDice`, so every spell that worked before must be byte-identical
 * after. Cure is pinned there against its real authored mods.
 *
 * SECTION F is three warps that needed NO new code — `areaGrowth`,
 * `extraTargets` and `rangeOverride` have all been live for releases and
 * had simply never been authored onto these rows.
 *
 * SHIELD OF FAITH NEEDED A RULING AND GOT ONE. Its range and targets
 * fields are both BLANK where every other `rangeOverride` sits on a
 * written base range. Graham, 8 September 2026: "Spells that have no range
 * or area affect the caster. So if a warping option increases that to a
 * range (such as touch) then it gains that range with the warping option."
 *
 * LIVE TESTING THEN SHOWED THE RUNNING SYSTEM DOES NOT DO THAT YET, and
 * F4 records both halves. Unwarped, Shield Of Faith reached an ally 7.1 ft
 * away; warped to touch (5 ft), it reached them anyway. A blank range is
 * currently UNRESTRICTED, and `rangeOverride` on a blank-range spell is
 * printed on the card and not enforced — where Make Whole, which prints a
 * real `touch`, gates correctly at 5 ft.
 *
 * The data is kept because it is right and becomes live for free once the
 * gate learns the rule. What it is NOT is evidence that the warp works
 * today, and F4c says so out loud rather than letting a green check imply
 * it.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { warpedHealFormula, addDice, warpedRowExtra } from "../module/magic/caster-level-mods.mjs";
import { emptyWarp, aggregateWarpSelection, warpMaxTimes, WARP_UNLIMITED }
  from "../module/magic/spell-warp.mjs";
import { warpedAreaText } from "../module/magic/warp-area.mjs";

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
 * H. THE RULE
 * ================================================================== */

equal("H1 AN UNWARPED HEAL IS ITS OWN FORMULA", warpedHealFormula("8d8", {}), "8d8");
equal("H1b and an empty formula stays empty", warpedHealFormula("", {}), "");

equal("H2 A HEAL DIE MERGES WITH A MATCHING ROW",
  warpedHealFormula("8d8", { healDice: "1d8" }), "9d8");
equal("H2b and accumulates across purchases",
  warpedHealFormula("8d8", { healDice: "3d8" }), "11d8");
equal("H2c a different die is added, never merged",
  warpedHealFormula("1d8", { healDice: "1d6" }), "1d8 + 1d6",
  "this refusal is what makes a wrong die visible instead of plausible");

equal("H3 A FLAT BONUS REACHES A BARE CONSTANT",
  warpedHealFormula("20", { healBonus: 5 }), "20 + 5",
  "Make Whole — the case warpedRowExtra cannot see");
equal("H3b and a die row too", warpedHealFormula("1d8", { healBonus: 5 }), "1d8 + 5");
equal("H3c a bonus with no row is still a heal",
  warpedHealFormula("", { healBonus: 5 }), "5");

equal("H4 A NEGATIVE BONUS IS IGNORED, NOT SUBTRACTED",
  warpedHealFormula("20", { healBonus: -5 }), "20",
  "a fix that printed one must not quietly turn healing into harm");
equal("H4b nor does a non-numeric one corrupt the formula",
  warpedHealFormula("20", { healBonus: "lots" }), "20");

equal("H5 THE TWO COMPOSE, ROW EXTRA FIRST THEN DICE THEN FLAT",
  warpedHealFormula("1d8 + 8", { rowExtra: 1, healDice: "1d8", healBonus: 5 }),
  "1d8 + 16 + 1d8 + 5",
  "the row's own extra grows before anything is added to it");

/* ================================================================== *
 * C. WHAT MUST NOT HAVE MOVED
 * ================================================================== *
 *
 * `healDice` falls back to `damageDice`. Every spell that healed
 * correctly before this release must heal identically after it, and the
 * only way to know that is to run the OLD expression beside the new one.
 */

const oldWay = (formula, mods) => addDice(warpedRowExtra(formula, mods), mods?.damageDice || "");

for (const [label, formula, mods] of [
  ["Cure, die and extra", "1d8 + 8", { damageDice: "1d8", rowExtra: 1 }],
  ["Cure, die only", "1d8", { damageDice: "1d8" }],
  ["a plain row, no warp", "2d6", {}],
  ["a bare constant, no warp", "20", {}],
  ["an extra with no die", "1d8 + 8", { rowExtra: 2 }]
]) {
  equal(`C1 ${label} IS UNCHANGED BY THIS RELEASE`,
    warpedHealFormula(formula, mods), oldWay(formula, mods),
    "healDice falls back to damageDice precisely so this stays true");
}

equal("C2 AND healDice WINS WHEN BOTH ARE PRESENT",
  warpedHealFormula("1d8", { healDice: "1d8", damageDice: "1d6" }), "2d8",
  "the shape healDice exists for: a spell whose healing and damage print different "
  + "dice. No spell in the pack carries it today — Wash Away Sin was reverted at "
  + "3.531.1 — so this is the rule proved on its own terms, not a pack claim");

/* ── C3: THE VOCABULARY IS DECLARED AND AGGREGATED ───────────────── */

const washWarp = { ppCost: 2, text: "increase both the healing and damage by 1 die",
  mods: { healDice: "1d8", damageDice: "1d6" } };
const once = aggregateWarpSelection([washWarp], { "warp-0": 1 }).mods;
const twice = aggregateWarpSelection([washWarp], { "warp-0": 2 }).mods;
equal("C3 healDice IS CARRIED BY THE AGGREGATOR", once.healDice, "1d8",
  "a mod absent from emptyWarpMods() is offered, charged, and silently dropped");
equal("C3b AND SCALES WITH THE PURCHASES", twice.healDice, "2d8");
equal("C3c the damage side scales beside it, separately", twice.damageDice, "2d6",
  "two dice of two sizes, which is the whole reason this mod exists");
ok("C3d an unwarped selection carries neither",
  emptyWarp().mods.healDice === "" && emptyWarp().mods.healBonus === 0);

const mwWarp = { ppCost: 2, text: "increase the amount healed by 5", mods: { healBonus: 5 } };
equal("C3e healBonus scales too",
  aggregateWarpSelection([mwWarp], { "warp-0": 3 }).mods.healBonus, 15);
equal("C3f so an uncapped bump is a count box, not a checkbox",
  warpMaxTimes(mwWarp, ""), WARP_UNLIMITED,
  "\"increase the amount healed by 5\" prints no ceiling, so PP is the only limit");

/* ================================================================== *
 * D. THE PACK — the healing side
 * ================================================================== */

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) if (v?.name) spells.push(v);
await db.close();

const spell = (n) => spells.find((s) => s.name === n);
const healRow = (s) => (s?.system?.effects ?? []).find((e) => e?.kind === "heal");
const warpOf = (s, i) => s?.system?.warps?.[i];

{
  const s = spell("Soothing Ballad"), w = warpOf(s, 0);
  equal("D1 SOOTHING BALLAD RAISES ITS HEALING", w?.mods?.damageDice, "1d8",
    "the shape Cure already proved — the healing is the spell's only number");
  equal("D1b and the row grows by exactly one die",
    warpedHealFormula(healRow(s)?.formula, aggregateWarpSelection([w], { "warp-0": 1 }).mods),
    "9d8", "8d8 printed, one more bought");
  ok("D1c it carries NO healDice, because it does not need one",
    !w?.mods?.healDice,
    "a spell with nothing else for a die to land on is a data fix, not a code change");
}

{
  const s = spell("Make Whole"), w = warpOf(s, 0);
  equal("D2 MAKE WHOLE ADDS A FLAT FIVE", w?.mods?.healBonus, 5);
  equal("D2b to a row printing a bare constant", healRow(s)?.formula, "20",
    "pinned because healBonus exists precisely for the formula warpedRowExtra cannot read");
  equal("D2c so one purchase heals twenty-five",
    warpedHealFormula(healRow(s)?.formula, aggregateWarpSelection([w], { "warp-0": 1 }).mods),
    "20 + 5");
}

/* ── D3: THE WARP IS STILL INERT, AND THE REASON HAS CHANGED ────── */

{
  const s = spell("Wash Away Sin"), w = warpOf(s, 0);
  // RE-ARMED AT 3.613.0 (block 35's B5) — see the history below. ONE KEY,
  // `damageDice`, because `warpedHealFormula` falls back to it for the heal:
  // a second `healDice` would grow the heal twice.
  ok("D3 WASH AWAY SIN'S WARP GROWS BOTH SIDES BY ONE d8",
    JSON.stringify(w?.mods) === JSON.stringify({ damageDice: "1d8" }),
    `${JSON.stringify(w?.mods)} — this warp WAS given {healDice, damageDice} at `
    + "3.531.0, was reverted at 3.531.1 after live testing, and is re-armed at "
    + "3.613.0 now the opposed-aura targeting has been driven at a table");

  /* THE HISTORY, because the arithmetic was never the problem.
   *
   * 3.531.0 gave the warp {healDice, damageDice} and it worked: the card
   * read "Spell damage: 9 essence (2d6)". But the spell was
   * `areaTargeting: "allies"`, so its cone caught ALLIES ONLY, and the
   * 1d6 it prints is for "creatures with an opposed aura" — a condition
   * that lived in a NOTE and was tested nowhere. The damage landed on
   * the people the spell exists to heal, and the warp doubled it.
   * 3.531.1 reverted the mods and pinned the reverted state here.
   *
   * 15 SEP 2026: Graham ruled the dice to d8 on both sides, and applying
   * that to the warp made this check go red — correctly, because the
   * targeting had not changed. Asked directly, he then chose to build
   * the missing half ("Needs to be option 1"): the cone now catches
   * everyone and the damage declares an opposed-aura scope that
   * magic/damage-scope.mjs implements.
   *
   * SO THE OLD REASON IS GONE AND THE MODS STAY EMPTY ANYWAY — because
   * the new targeting has not yet been driven at a table, and re-arming
   * a warp on the same day its foundation changed is how 3.531.0
   * happened. The two facts below are what D3b and D3c now pin, and when
   * a live test says the damage finds the right creatures, this is the
   * comment to come back to.
   *
   * CAME BACK TO AT 3.613.0. The live cast of 15 September found the damage
   * on the one opposed creature, and 3.552.6 put the heal on the ally; the
   * block 35 audit (B5) re-arms the warp with `damageDice` alone, and the
   * 3.613.0 drive casts it warped. */
  equal("D3b ITS CONE NOW CATCHES EVERYONE, so the damage has somebody to find",
    s?.system?.areaTargeting, "all",
    "was 'allies' until 3.552.4, which is why its damage could only ever hit allies");
  equal("D3c AND THE OPPOSED-AURA CONDITION IS DECLARED, not prose in a note",
    s?.system?.damageScope, "opposedAura",
    "the note stays as flavour; what the rule reads is the field");
  equal("D3d while the heal row is narrowed to allies, so a wider cone heals no enemies",
    (s?.system?.effects ?? []).find((e) => e?.kind === "heal")?.target, "allies");
}

/* ================================================================== *
 * F. THREE WARPS WHOSE MOD ALREADY EXISTED
 * ================================================================== */

{
  const s = spell("Luminous Flare"), w = warpOf(s, 0);
  equal("F1 LUMINOUS FLARE GROWS ITS CONE", JSON.stringify(w?.mods),
    JSON.stringify({ areaGrowth: 15, areaMax: 60 }));
  equal("F1b one purchase is thirty feet",
    warpedAreaText(s.system.area, aggregateWarpSelection([w], { "warp-0": 1 }).mods), "30-foot cone");
  equal("F1c three reaches the printed ceiling",
    warpedAreaText(s.system.area, aggregateWarpSelection([w], { "warp-0": 3 }).mods), "60-foot cone");
  equal("F1d and the ceiling is a ceiling",
    warpedAreaText(s.system.area, aggregateWarpSelection([w], { "warp-0": 9 }).mods), "60-foot cone");
  equal("F1e so the chooser offers exactly three", warpMaxTimes(w, s.system.area), 3,
    "from a 15-foot cone to a 60-foot one, which is arithmetic the warp alone cannot do");
}

{
  const s = spell("Swift Sonata"), w = warpOf(s, 0);
  equal("F2 SWIFT SONATA REACHES ONE MORE ALLY", w?.mods?.extraTargets, 1);
  equal("F2b and repeats without a ceiling", warpMaxTimes(w, ""), WARP_UNLIMITED,
    "\"affect an additional ally\" prints no cap");
  equal("F2c its base is one ally", s?.system?.targets, "1 ally");
}

{
  const s = spell("Shield Of Faith"), w = warpOf(s, 0);
  equal("F3 SHIELD OF FAITH GAINS A REACH", w?.mods?.rangeOverride, "touch");
  equal("F3b an override is not multiplied", warpMaxTimes(w, ""), 1);

  /* ── F4: THE RULING THIS RELEASE RESTED ON ────────────────────────
   * Every other rangeOverride in the pack sits on a spell with a WRITTEN
   * base range. This one does not, and that difference is the whole
   * question: is a blank range missing data (the note-only-base trap) or
   * a statement?
   *
   * GRAHAM, 8 September 2026: "Spells that have no range or area affect
   * the caster. So if a warping option increases that to a range (such as
   * touch) then it gains that range with the warping option."
   *
   * So blank means SELF. This is pinned rather than remembered, because
   * the next blank-range warp will look like an oversight otherwise.  */
  equal("F4 ITS BASE RANGE IS BLANK, WHICH THE RULING MAKES 'SELF'",
    String(s?.system?.range ?? ""), "",
    "a blank range is a statement, not a gap — Graham's ruling of 8 September 2026");
  // CORRECTED AT 3.617.3. A `targets` row did NOT resolve to the caster
  // while the range was blank: cast with nothing targeted, Shield Of Faith
  // shielded nobody (verify-self-rows). The row is the caster's, and the
  // touch warp moves it.
  equal("F4b ITS ROW IS THE CASTER'S, AND THE TOUCH WARP MOVES IT",
    `${(s?.system?.effects ?? []).find((e) => e?.kind === "bonus")?.target}/${(s?.system?.warps ?? []).find((w) => w?.mods?.rangeOverride === "touch")?.mods?.retargetSelfRows}`,
    "self/true",
    "a `targets` row on a self spell reaches nobody when nothing is targeted — the 3.617.2 drive");

  /* ── F4c: AND AT 3.532.0 THE GATE CAUGHT UP ───────────────────────
   * This block used to record that the warp was cosmetic — measured
   * live on 8 September 2026, when unwarped Shield Of Faith reached an
   * ally 7.1 ft away and warping it to "touch" changed nothing.
   *
   * `effectiveRangeText` fixed that: no range and no area now reads as
   * "self", so the unwarped spell reaches the caster alone and the warp
   * is what buys the five feet. See verify-spell-range section S.
   *
   * The count below stays, because it is still worth knowing if a
   * SECOND blank-base override appears — that spell would now be
   * genuinely restricted until somebody checks it should be. */
  const blankRangeOverrides = spells.filter((sp) =>
    !String(sp?.system?.range ?? "").trim()
    && (sp?.system?.warps ?? []).some((x) => x?.mods?.rangeOverride)).map((sp) => sp.name);
  // 5 → 7 AT 3.587.0, and both were checked rather than waved through.
  // DIMENSION DOOR prints no Range line and its warp says "the range
  // increases to 1 mile"; the spell moves the caster, so self-bound is
  // right and the warp is what buys the mile. DARKVISION prints no
  // Range either and grants the caster a sense; its warp buys touch AND
  // carries `retargetSelfRows`, without which the caster would keep the
  // Darkvision they had paid a point to give away.
  // 7 → 8 AT 3.591.0: NIGHTVISION, Darkvision's twin, wired in the same
  // shape one release later. Its warp buys touch and carries
  // `retargetSelfRows`, without which the caster would keep the
  // Nightvision they had paid a point to give away — word for word the
  // sentence written about Darkvision above, which is the point: the
  // survey found one of a pair at 3.587.0 and nobody asked after the
  // other until this block authored its row.
  ok("F4c AND THE BLANK-BASE OVERRIDES ARE THE EIGHT THE RULING FINISHED",
    JSON.stringify(blankRangeOverrides.slice().sort())
      === JSON.stringify(["Darkvision", "Dimension Door", "Ethereal Jaunt",
        "Invisibility", "Jump", "Loremasters Edge", "Nightvision", "Shield Of Faith"]),
    `${JSON.stringify(blankRangeOverrides)} — 1 → 3 at 3.533.0 and 3 → 5 at 3.534.0, `
    + "and this check firing each time is how those were noticed rather than assumed. "
    + "Shield Of Faith (3.531.0) was first; Invisibility's row already targets `targets`; "
    + "Ethereal Jaunt was a gate repair; Jump and Loremasters Edge move a `self` row onto "
    + "the creature their warps name. A SIXTH name here is a spell somebody should check "
    + "before it surprises them at the table");
}

/* ================================================================== *
 * X. LEFT INERT ON PURPOSE
 * ================================================================== */

{
  const s = spell("Heal"), w = warpOf(s, 0);
  ok("X1 HEAL'S WARP IS STILL INERT, AND THAT IS A DECISION",
    Object.keys(w?.mods ?? {}).length === 0 && /soul drain/i.test(String(w?.text ?? "")),
    `${JSON.stringify(w?.mods)} — "heal an additional 10 HP OR 5 soul drain" is the `
    + "same either/or shape as the bleed alternative Graham ruled on 7 September "
    + "(\"each target gets whichever applies\"), but soul drain has no relief path in "
    + "the heal case at all. A healBonus alone would sell the soul-drain half and "
    + "deliver the HP half, which is worse than the warp doing nothing");
}

{
  const s = spell("Vital Beacon");
  const kinds = (s?.system?.effects ?? []).map((e) => e.kind);
  ok("X2 VITAL BEACON IS A DIFFERENT MECHANISM, NOT A HEAL ROW",
    kinds.includes("vitalBeacon") && !kinds.includes("heal"),
    `${JSON.stringify(kinds)} — "the beacon restores an additional die of HP" is a `
    + "warp on the beacon's own per-use die, which warpedHealFormula never sees");
}

{
  const s = spell("Animal Healing");
  const kinds = (s?.system?.effects ?? []).map((e) => e.kind);
  // BUILT AT 3.611.0 (block 34). The base was the trap: the bleed was a
  // note. Now the heal stops bleed itself, and each condition warp unlocks
  // its own relief row.
  ok("X3 ANIMAL HEALING'S CONDITION WARPS UNLOCK THEIR OWN RELIEF ROWS",
    !kinds.includes("note") && (s?.system?.effects ?? []).filter((e) => e.kind === "conditionRelief" && e.unlockedBy).length === 2
    && (s?.system?.effects ?? []).some((e) => e.kind === "heal" && e.bleedAndHeal === true),
    `${JSON.stringify(kinds)} — a warp onto an unbuilt base is the trap this project has walked into three times`);
}

/* ================================================================== *
 * W. THE WIRING
 * ================================================================== *
 *
 * A rule nobody calls is a rule that does nothing. This counts the RAW
 * expression rather than searching for the rule's name, because a search
 * for a name is the shape that has lied in this harness nine times.
 */

const effectsSrc = fs.readFileSync(
  path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");

equal("W1 THE HEAL ROW ASKS THE RULE",
  [...effectsSrc.matchAll(/warpedHealFormula\(effect\.formula, warpMods\)/g)].length, 1,
  "exactly one heal row builds a formula, and it must be this one");
equal("W1b AND NO LONGER BUILDS ONE ITSELF",
  [...effectsSrc.matchAll(/addDice\(warpedRowExtra\(/g)].length, 0,
  "the old expression left in place would be a second, drifting copy of the arithmetic");
ok("W2 THE RULE IS IMPORTED RATHER THAN REDECLARED",
  /import \{[^}]*warpedHealFormula[^}]*\} from "\.\/caster-level-mods\.mjs"/.test(effectsSrc));

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-warped-healing: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-warped-healing: OK — ${checks} checks. `
  + "Healing raises on its own side, Cure is unchanged, and three warps got the mod "
  + "they always had.\n");
