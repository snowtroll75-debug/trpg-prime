#!/usr/bin/env node
/**
 * verify-spell-degrees — outcomes that depend on the target's save.
 *
 * NEW at 3.404.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GAP: 115 spells print a different outcome per degree and the
 * engine flattened every one to a single row applied to whoever failed.
 *
 * FEAR WAS WRONG IN BOTH DIRECTIONS. The book gives it five outcomes;
 * the pack carried `frightened 3`. A target that SUCCEEDED took nothing,
 * where the book says frightened 1. A target that FUMBLED took 3 rather
 * than 4 and never fled. One flattened row, rewarding a good roll too
 * much and a bad one too little.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION E IS THE HALF THAT KEEPS THIS HONEST. Two spells are wired.
 * A hundred-odd more print a ladder and still carry a flattened row, and
 * a green run of this file must not read as "per-degree outcomes are
 * handled". E counts them from the PACK rather than from a list I typed,
 * so the number cannot quietly go stale.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  SAVE_DEGREE_KEYS, isDegreeKey, declaredDegrees, unknownDegrees,
  effectAppliesOnDegree, isDegreeGated, recipientsForEffect, gatedDegrees,
  effectiveSaveDegree, isBasicSave
} from "../module/magic/spell-degrees.mjs";
import { DEGREES, DEGREE_BY_KEY } from "../module/dice/resolution.mjs";
import { prisonDegree } from "../module/magic/prison.mjs";
import {
  declaresOwnDuration, effectDurationText, parseSpellDuration,
  unreadableEffectDurations, declaredDurations
} from "../module/magic/effect-duration.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The gate itself
 * ================================================================== */

// A1. AN UNGATED EFFECT IS UNTOUCHED. Around a hundred spells depend on
// this, and it is the reason the change is safe to ship.
ok("A1 an effect with no onSave applies on any degree",
  DEGREES.every((d) => effectAppliesOnDegree({ kind: "condition" }, d.key)),
  "ungated effects must behave exactly as before");
ok("A1b and is not treated as gated", isDegreeGated({ kind: "condition" }) === false);
ok("A1c its recipients are the ones the caller passed",
  recipientsForEffect({ kind: "condition" }, [], ["A", "B"]).join() === "A,B");

// A2. A GATED EFFECT APPLIES ONLY ON WHAT IT NAMES.
const gated = { kind: "condition", onSave: ["success", "partial"] };
ok("A2 it applies on a named degree", effectAppliesOnDegree(gated, "success") === true);
ok("A2b and on the other named one", effectAppliesOnDegree(gated, "partial") === true);
ok("A2c and not on an unnamed one", effectAppliesOnDegree(gated, "failure") === false);
ok("A2d nor on a critical", effectAppliesOnDegree(gated, "critical") === false);
ok("A2e and it reads as gated", isDegreeGated(gated) === true);

ok("A3 a single string is accepted as well as an array",
  effectAppliesOnDegree({ onSave: "fumble" }, "fumble") === true);
ok("A4 degree names are normalised",
  effectAppliesOnDegree({ onSave: [" FUMBLE "] }, "fumble") === true);
ok("A5 the degree asked about is normalised too",
  effectAppliesOnDegree({ onSave: ["fumble"] }, " Fumble ") === true);

// A6. NULL AND EMPTY ARE DIFFERENT. No onSave means ungated; an onSave
// present but empty is an author who gated an effect and named nothing,
// which can only be a mistake — and E5 refuses to let one ship.
ok("A6 no onSave declares nothing", declaredDegrees({ kind: "x" }) === null);
ok("A6b an empty onSave declares an empty list",
  Array.isArray(declaredDegrees({ onSave: [] })) && declaredDegrees({ onSave: [] }).length === 0);
ok("A6c an empty onSave applies on nothing",
  DEGREES.every((d) => effectAppliesOnDegree({ onSave: [] }, d.key) === false),
  "which is why it must never ship — the effect would do nothing, silently");

/* ================================================================== *
 * B. Picking recipients from the save results
 * ================================================================== */

// THE FIXTURE CARRIES `saved`, AND A MUTATION IS WHY. The first version
// of this list held only `{target, degree}` — and the single most
// important mutation, restoring the bug by filtering recipients down to
// the failures, SURVIVED every check. `!r.saved` is true for every row
// when no row has the field, so the filter passed everything and the
// defect was invisible.
//
// `resolveSpellSave` really builds `{target, degree, label, total,
// margin, saved}`. A fixture that does not look like the real data is a
// fixture that cannot catch what the real data would.
//
// `saved` is derived from the degree table rather than typed, so it
// cannot disagree with what the engine would compute.
const results = ["critical", "success", "partial", "failure", "fumble"].map((key) => ({
  target: key.slice(0, 4),
  degree: key,
  saved: Boolean(DEGREES.find((d) => d.key === key)?.success)
}));

ok("B1 a gated effect draws from the full result set",
  recipientsForEffect({ onSave: ["success"] }, results, ["fail"]).join() === "succ",
  "NOT from the fallback — the whole point is that a SUCCESS can be affected");
ok("B2 several degrees collect several targets",
  recipientsForEffect({ onSave: ["failure", "fumble"] }, results, []).join() === "fail,fumb");
ok("B3 a degree nobody rolled collects nobody",
  recipientsForEffect({ onSave: ["heroic"] }, results, []).length === 0);
ok("B4 an ungated effect ignores the results entirely",
  recipientsForEffect({ kind: "x" }, results, ["only-this"]).join() === "only-this");
ok("B5 a missing result set is survivable",
  recipientsForEffect({ onSave: ["success"] }, undefined, []).length === 0);
ok("B6 results with no target are skipped",
  recipientsForEffect({ onSave: ["success"] }, [{ degree: "success", saved: true }], []).length === 0);

// B7. THE BUG, STATED AS A CHECK. Before this, a target who saved was
// never in the list at all.
ok("B7 a target who SUCCEEDED can be a recipient",
  recipientsForEffect({ onSave: ["success"] }, results, []).includes("succ"),
  "Fear's success is 'frightened 1' and it used to apply nothing");

/* ================================================================== *
 * C. Degree keys are real
 * ================================================================== */

for (const d of DEGREES) {
  ok(`C1 ${d.key} is a known degree`, isDegreeKey(d.key) === true);
}
ok("C2 the key list matches the resolution table",
  SAVE_DEGREE_KEYS.join() === DEGREES.map((x) => x.key).join(),
  "a second copy of the degree list is how two tables drift apart");
ok("C3 an invented degree is refused", isDegreeKey("nearlySuccess") === false);
ok("C4 unknownDegrees names the bad ones",
  unknownDegrees({ onSave: ["success", "nonsense"] }).join() === "nonsense");
ok("C5 an ungated effect has no unknown degrees",
  unknownDegrees({ kind: "x" }).length === 0);

/* ================================================================== *
 * D. The two wired spells match their printed ladders
 * ================================================================== */

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  if (!fs.existsSync(dir)) return null;
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.set(String(value.name).trim().toLowerCase(), value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await spellsPack();
ok("D0 the spells pack could be read", spells !== null);

/** What each wired spell must apply, by degree. Read off the printed text. */
const LADDERS = Object.freeze({
  fear: {
    critical: [],
    success: ["frightened 1"],
    partial: ["frightened 2"],
    failure: ["frightened 3"],
    fumble: ["frightened 4", "fleeing"]
  },
  "sudden sickening": {
    critical: [],
    success: ["sickened 1"],
    failure: ["sickened 2"],
    fumble: ["sickened 3"]
  }
});

// NAMED SPECIFICALLY, NOT `describe`. A local const called `describe`
// made verify-rules-have-callers report wondrous-effects.mjs#describe as
// having acquired a caller — it matches names across files, and a
// generic name in a harness file is enough to trip it. The same
// false positive that surfaced the naturalDefenceBonus collision.
const describeConditionEffect = (e) =>
  `${e.condition}${e.value === undefined ? "" : ` ${e.value}`}`;

for (const [name, ladder] of Object.entries(LADDERS)) {
  const spell = spells?.get(name);
  ok(`D1 "${name}" is in the pack`, Boolean(spell));
  if (!spell) continue;
  const effects = spell.system?.effects ?? [];

  for (const [degree, expected] of Object.entries(ladder)) {
    const applied = effects
      .filter((e) => effectAppliesOnDegree(e, degree))
      .map(describeConditionEffect)
      .sort();
    ok(`D2 "${name}" on a ${degree}: ${expected.join(", ") || "nothing"}`,
      applied.join() === [...expected].sort().join(),
      `applies ${applied.join(", ") || "nothing"}`);
  }

  // D3. A CRITICAL SAVE IS "UNAFFECTED", and the absence of an entry is
  // the rule rather than an omission — so it is asserted, not assumed.
  ok(`D3 "${name}" applies nothing on a critical save`,
    effects.filter((e) => effectAppliesOnDegree(e, "critical")).length === 0,
    "the book says the target is unaffected");

  // D4. THE LADDER NEVER GETS KINDER AS THE ROLL GETS WORSE. This is the
  // "rolling worse must not do less" invariant, the mirror of the Heroic
  // fix at 3.403.0 — and it is why blunder rides with fumble even though
  // neither spell's text names a blunder.
  const rank = Object.fromEntries(DEGREES.map((d) => [d.key, d.rank]));
  const failing = DEGREES.filter((d) => !d.success).map((d) => d.key);
  for (let i = 1; i < failing.length; i += 1) {
    const worse = failing[i];
    const better = failing[i - 1];
    const nWorse = effects.filter((e) => effectAppliesOnDegree(e, worse)).length;
    const nBetter = effects.filter((e) => effectAppliesOnDegree(e, better)).length;
    ok(`D4 "${name}": a ${worse} is not gentler than a ${better}`,
      nWorse >= nBetter,
      `${worse} applies ${nWorse}, ${better} applies ${nBetter} (ranks ${rank[worse]} vs ${rank[better]})`);
  }

  // D5. EVERY DEGREE THE SPELL GATES ON IS A REAL ONE.
  for (const bad of effects.flatMap((e) => unknownDegrees(e))) {
    ok(`D5 "${name}" gates on the real degree "${bad}"`, false,
      "an unknown degree means an effect that never applies, silently");
  }
  ok(`D6 "${name}" gates on at least one degree`, gatedDegrees(effects).length > 0);
}

/* ================================================================== *
 * E. What is wired, and what is still flattened
 * ================================================================== */

// EVERY GATED EFFECT IN THE WHOLE PACK NAMES REAL DEGREES, and none is
// gated on nothing. Swept across all 690-odd spells rather than the two
// wired here, so a third spell wired later is checked the day it lands.
let gatedSpells = 0;
if (spells) {
  for (const spell of spells.values()) {
    for (const effect of spell.system?.effects ?? []) {
      if (!isDegreeGated(effect)) continue;
      const bad = unknownDegrees(effect);
      ok(`E1 "${spell.name}" gates only on real degrees`, bad.length === 0,
        `unknown: ${bad.join(", ")}`);
      ok(`E2 "${spell.name}" has no effect gated on nothing`,
        declaredDegrees(effect).length > 0,
        "an empty onSave is an effect that can never apply");
    }
    if ((spell.system?.effects ?? []).some(isDegreeGated)) gatedSpells += 1;
  }
}

// A COUNT THAT MAY ONLY GROW, and only when this line is edited on
// purpose. 12 through 3.413.x; 14 at 3.414.0 (Luminous Flare, Touch Of
// Obedience); 15 at 3.415.0 (Enchanting Utterance); 16 at 3.428.0
// (BANE). It has now caught four consecutive releases' own pack changes,
// which is why the number is written down rather than derived.
//
// BANE WAS FOUND BY READING RATHER THAN BY A CHECK. Its outcome table
// prints -1 on a Failure and -2 on a Fumble, and its pack entry carried
// ONE ungated -1 row — so a fumbling creature took the failure's
// penalty. Noticed while reading the text that settled whether a
// save-gated emanation could be live at all; the two rows are gated now.
// 17 at 3.439.0 (SURGE OF THE TEMPEST). Its fumble line — "the target is
// not only struck with the damaging electricity but also becomes
// temporarily dazzled for 1 round" — is a condition row gated on
// `fumble` now, where it had been prose inside a note. The fifth
// consecutive release this line has caught, which is the argument for
// writing the number down rather than deriving it.
// 18 at 3.488.0 (FOOLS RICHES). Its printed ladder is Critical /
// Success / Failure, and the Critical rung is "the creature disbelieves
// the illusion and is unaffected" — correctly carrying no row at all, so
// the gate is the only thing distinguishing the other two. Just those
// three degrees are declared, leaving `effectiveSaveDegree` to map the
// unnamed ones onto them. Written here first as "partial → failure",
// which is WRONG and was caught by driving Silent Binding: the rule
// takes the nearest declared degree that is NO WORSE for the target, so
// a Partial reads at SUCCESS. The SIXTH consecutive release this line
// has caught.
// 19 at 3.491.0 (SILENT BINDING). The first spell whose ladder gates
// nothing but the DURATION — Success 1 round, Failure 1 minute, Fumble
// 10 minutes, all publishing the same Perception DC at the same reach.
// It needed no new degree machinery at all: per-effect durations have
// existed since 3.414.0 and `onSave` gating since 3.352.0, so three rows
// of the same kind with three durations was the whole ladder. Its
// Critical rung is "unaffected" and carries no row.
// 32 at 3.586.0 (PAGES 251-260). Thirteen at once, and the block that
// nearly built a second mechanism instead: the audit reported seventeen
// printed ladders and "not one modelled as one", a `saveLadder`
// extension carrying conditions was written to fix it, and then Colour
// Spray turned out to be sitting right there already laddered with
// `onSave`. The count above is the reason that is embarrassing rather
// than unknowable — nineteen spells were declared here, in this file,
// and the audit counted them as zero.
// 40 at 3.587.0 (PAGES 261-270). Eight more ladders: Conjuring Control,
// Control Undead, Crushing Despair, Dance Macabre, Deafness, Deific
// Presence, Disorient and Disturbing Tentacles. Authoring, not building
// — both mechanisms existed and were driven, which is the difference
// between this block and the last one.
// 54 at 3.589.0 (PAGES 271-280).
// 71 at 3.590.0, and SEVENTEEN of them is the largest jump this ratchet
// has taken. Twelve came from the PACK-WIDE CLOCK SWEEP rather than from
// this block's pages: Hold Animal, Hold Kind, Ghoul Touch, Glitterdust,
// Sleep, Warp Mind, Word Of Blinding, Word Of Deafening, Shout, Sound
// Burst, Magnificent Dawn and Petrification, each of which had a flat
// ungated condition row beside a note describing the ladder in prose.
// The rest are block 28's own: Forget, Jolts, Haze Of Dreams, Holy Shout
// and Gust.
// 71 at 3.590.0 (PAGES 281-290 plus the pack-wide clock sweep).
// 77 at 3.591.0 (PAGES 291-300). Six more: Massacre (which did nothing at
// all before \u2014 a non-basic save with no rows), Nightmare (the seventh
// flat ungated condition row, fatiguing a target that had critically
// succeeded), and four whose rungs are PRINTED rather than applied
// because their outcomes are memory, information, a labyrinth and a
// borrowed spell pool: Lullaby, Maze, Memory Lapse, Mind Reading, Mana
// Drain. A printed rung still gates, which is the point: the card shows
// the outcome that happened instead of all four.
// 77 → 83 AT 3.594.0 (PAGES 301-310). Six more: Phantasmal Killer,
// Portal Maelstrom and Ramirez Rhythm, whose condition rows had been
// firing on a Critical Success their pages call unaffected — the
// Nightmare defect three more times in one block; Qualm, whose -1/-2/-4
// was one sentence of prose; and Orb Of The Void, whose soul drain was
// authored nowhere at all.
// 83 → 85 AT 3.596.0 (PAGES 311-320, SECOND HALF). Two more: Scrying,
// whose two better degrees now buy temporary immunity and whose worse two
// buy nothing — the page says the spell SUCCEEDS there, so a gate on those
// would be the Nightmare defect again; and Scintillating Pattern, whose
// 1d4-round confusion and 1d4-round stun were printed and unrolled.
// 85 → 91 AT 3.606.0 (PAGES 321-330, BLOCK 32's R1). Six more: Soul
// Destruction, whose Soul Drain is three gated `resource` rows and whose
// Fumble is a gated note that exists to stop the slain from also taking
// the Failure's 10d10; Startle's forced Step; Snagging Pit's stun and two
// falls; Suggestion's and Speak With Dead's four rungs; and Sunburst's
// permanent blindness on a Fumble. Sound Burst was already gated. Slay
// The Soul and Speed are NOT counted and should not be: one carries its
// whole ladder on a `saveLadder` row and the other on an `endSave`, and
// neither shape is an `onSave` gate.
// 91 → 92 AT 3.608.0 (BLOCK 32's R6): Spell Drain's three rungs, each a
// gated `spellDrain` row left waiting on the drained caster.
// 92 → 98 AT 3.609.0 (BLOCK 33): Volcanic Inferno, Telepathic Demand, Twisted
// Fate, Unwelcome Halo, Unprepared Combatant and Vision Of Havoc gained their
// first gated rows.
// 98 → 103 AT 3.611.0 (BLOCK 34): Woeful Dread, Word Of Stunning, Waves Of
// Fatigue, Cloud Mind and Coercive Retribution gained their first gated rows.
// 103 → 104 AT 3.612.0 (BLOCK 34, PART TWO): False Arrogance's four durations
// and its immunity, by degree.
// 104 → 105 AT 3.613.0 (BLOCK 35): Stasis's Success rung and its two
// table notes. Sickly Ray's rows are gated on the ATTACK (`onAttack`), not
// on a save, and are not counted here.
ok("E3 the gated-spell count is the declared one", gatedSpells === 105,
  `${gatedSpells} spells carry a degree gate — update this file when more are wired`);

/**
 * Spells whose printed text gives a per-degree ladder and whose pack
 * entry is still FLATTENED to one row.
 *
 * MEASURED FROM THE PACK, not from a list I typed, because a hard-coded
 * number would go stale the first time somebody wired one and would then
 * read as "all done". The rulebook prints 115 such spells; this counts
 * how many still carry the old shape, and fails if that count grows.
 */
{
  const DEGREE_WORDS = /\b(Critical|Success|Failure|Fumble)\b[^.]{3,140}/g;
  let flattened = 0;
  if (spells) {
    for (const spell of spells.values()) {
      const text = String(spell.system?.description ?? "")
        .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      const base = text.split(/warping options|caster level modifications/i)[0];
      const named = (base.match(DEGREE_WORDS) ?? []).length;
      if (named < 2) continue;
      const effects = spell.system?.effects ?? [];
      if (effects.some(isDegreeGated)) continue;
      /*
       * A ROW CARRYING ITS OWN COMPLETE LADDER IS NOT FLATTENED (3.477.0).
       *
       * `isDegreeGated` asks for `onSave`, which is how most spells gate a
       * row on a degree. The prisons and the elemental nexus do something
       * richer: ONE row naming what every degree costs, because their
       * ladders are not one number scaled by degree — Flame Prison doubles
       * from Critical to Success and Force Prison does not, and Nexus's
       * Critical deals nothing at all.
       *
       * Counting those as "still flattened" would have this ratchet
       * demanding they be rewritten into a shape that cannot express them.
       */
      //
      // AND THE SAME IS TRUE UNDER THREE OTHER NAMES (3.606.0). A skill
      // ladder's `degrees` (Shape Stone, Shroud), a movement bind's `rungs`
      // (Spirit Trap) and an end-of-spell save's `values` (Speed) each name
      // every degree's outcome on one row. This count only knew the word
      // `ladder`, so Shape Stone had been read as "flattened" since 3.605.0
      // — found when Spirit Trap and Shroud pushed the number UP by one for
      // being wired, which is the opposite of what a wired spell should do.
      const ownsLadder = (e) => ["ladder", "degrees", "rungs"].some((k) => e?.[k] && typeof e[k] === "object")
        || (e?.endSave?.values && typeof e.endSave.values === "object");
      if (effects.some(ownsLadder)) continue;
      if (effects.length === 0) continue;   // unwired entirely, a different gap
      flattened += 1;
    }
  }
  // E4 IS A RATCHET, NOT A TARGET. It may only shrink. If it grows,
  // somebody has added a flattened spell where the ladder was known.
  // 60 through 3.427.x; 59 at 3.428.0, Bane having been wired.
  // 57 at 3.477.0 — the two prisons were never flattened, they carry a
  // `ladder` row this count had no way to recognise until now.
  ok("E4 the flattened backlog has not grown", flattened <= 57,
    `${flattened} spells print a degree ladder and still carry one flat row — `
      + "wire one and lower this number; never raise it");
  process.stdout.write(`  (still flattened: ${flattened})\n`);
}

/* ================================================================== *
 * H. Per-effect duration (NEW 3.405.0)
 * ================================================================== *
 *
 * The largest single reason parse-degree-ladders refused a spell was
 * that its degrees printed different LENGTHS — nineteen of them. See
 * module/magic/effect-duration.mjs.
 */

ok("H1 an effect with no duration takes the spell's",
  effectDurationText({ kind: "condition" }, "1 minute") === "1 minute");

ok("H2 an effect's own duration wins",
  effectDurationText({ kind: "condition", duration: "1 round" }, "1 minute") === "1 round");

// A BLANK IS NOT A DECLARATION. Reading "" as an override would give the
// effect no duration at all — permanent, until a GM noticed by hand.
ok("H3 a blank duration is not an override",
  effectDurationText({ duration: "   " }, "1 hour") === "1 hour");
ok("H3b a blank duration does not read as declared",
  declaresOwnDuration({ duration: "" }) === false
  && declaresOwnDuration({ duration: "1 round" }) === true);

// H4 IS THE SHIP BLOCKER. "1 rnd" parses to null, null means no timing,
// and no timing means the condition never comes off.
ok("H4 an unreadable duration is reported",
  unreadableEffectDurations([{ duration: "1 rnd" }, { duration: "1 round" }])
    .map((x) => x.index).join() === "0");
ok("H4b a readable one is not",
  unreadableEffectDurations([{ duration: "1 minute" }, { duration: "sustained" }]).length === 0);

// SWEPT ACROSS THE WHOLE PACK. A duration this system cannot read is a
// condition that stays on a character sheet for ever, silently.
if (spells) {
  for (const spell of spells.values()) {
    const bad = unreadableEffectDurations(spell.system?.effects ?? []);
    ok(`H5 "${spell.name}" declares no unreadable duration`, bad.length === 0,
      bad.map((b) => `#${b.index} "${b.duration}"`).join(", "));
  }
}

// H6 IS THE FLATTENING-ONE-LAYER-DOWN CHECK, and it is the reason the
// parser was rewritten. Colour Spray's failure prints THREE conditions
// with two different spans; the first parser gave all three the first
// span it found. A spell whose text prints several lengths must carry
// several.
if (spells) {
  const spray = spells.get("colour spray");
  const spans = spray ? declaredDurations(spray.system.effects) : [];
  ok("H6 Colour Spray carries both printed lengths, not one",
    spans.includes("1 round") && spans.includes("1 minute"),
    `declared: ${spans.join(", ") || "none"}`);
  const fumble = (spray?.system?.effects ?? []).filter((e) => (e.onSave ?? []).includes("fumble"));
  ok("H6b its fumble keeps 1 round on stunned and 1 minute on blinded",
    fumble.find((e) => e.condition === "stunned")?.duration === "1 round"
    && fumble.find((e) => e.condition === "blinded")?.duration === "1 minute",
    JSON.stringify(fumble));
}

// H7: a per-effect duration must actually reach the timing layer, which
// means parsing to the same thing the spell-level path would.
ok("H7 a per-effect duration parses like a spell-level one",
  JSON.stringify(parseSpellDuration(effectDurationText({ duration: "1 minute" }, "1 hour")))
    === JSON.stringify(parseSpellDuration("1 minute")));

/* ---- H8: TURN-RELATIVE WORDING (3.414.0) --------------------------
 *
 * "Until the end of your current turn" and "until the end of your next
 * turn" are the two commonest duration phrases in the rulebook, and
 * `parseSpellDuration` could not read either — while `extractDurationRounds`,
 * two directories away in outcome-effects.mjs, had read them correctly
 * the whole time. Two modules answering one question, with the better
 * answer in the one that had not claimed the job.
 *
 * It blocked Touch Of Obedience outright: both phrases parsed to null,
 * null means no timing, and H4/H5 rightly refuse to ship that.
 */
ok("H8 the end of the current turn is one round",
  parseSpellDuration("until the end of your current turn")?.rounds === 1);
ok("H8b the end of the NEXT turn is two",
  parseSpellDuration("until the end of your next turn")?.rounds === 2,
  "two round boundaries away, not one");
ok("H8c it reads the other pronouns the book uses",
  parseSpellDuration("until the end of its next turn")?.rounds === 2
  && parseSpellDuration("until the end of their turn")?.rounds === 1);
ok("H8d the start of the next turn is one",
  parseSpellDuration("until the start of your next turn")?.rounds === 1);
ok("H8e seconds follow the rounds at six apiece",
  parseSpellDuration("until the end of your next turn")?.seconds === 12);
// AND THESE ARE NOW SHIPPABLE, which is the whole point.
ok("H8f a turn-relative duration is no longer unreadable",
  unreadableEffectDurations([
    { duration: "until the end of your current turn" },
    { duration: "until the end of your next turn" }
  ]).length === 0);

// NOTHING THAT ALREADY PARSED MAY CHANGE. The turn-relative branch is
// reached only where the numeric one returned null, so this is a
// property of the ORDER, and worth pinning: `extractDurationRounds`
// reads "for N rounds" too, and running it first would quietly re-route
// existing entries through a second answer to a settled question.
for (const [text, rounds, seconds] of [
  ["1 round", 1, 6], ["1 minute", 10, 60], ["10 minutes", 100, 600],
  ["1 hour", 600, 3600], ["for 3 rounds", 3, 18]
]) {
  const parsed = parseSpellDuration(text);
  ok(`H9 "${text}" still parses exactly as before`,
    parsed?.rounds === rounds && parsed?.seconds === seconds,
    JSON.stringify(parsed));
}
ok("H9b wording nobody can count is still refused",
  parseSpellDuration("until you achieve a Critical against them") === null
  && parseSpellDuration("varies") === null,
  "inventing a number for these is worse than leaving them to the text");

// ONE OWNER. outcome-effects.mjs must re-export rather than keep a
// second copy — the drift that caused this in the first place.
{
  const oe = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "outcome-effects.mjs"), "utf8");
  ok("H10 outcome-effects re-exports rather than redefining it",
    /export \{ extractDurationRounds \} from "\.\/magic\/effect-duration\.mjs"/.test(oe)
    && !/export function extractDurationRounds/.test(oe),
    "two copies is how the two answers diverged");
}

/* ================================================================== *
 * I. Degrees the book never prints (NEW 3.405.0)
 * ================================================================== *
 *
 * The table has SEVEN degrees; no printed ladder names more than five.
 * Before the cascade, a target who BLUNDERED a Fear save matched no
 * effect and took nothing — safer than the target who merely fumbled.
 */

const FEAR_LADDER = [
  { onSave: ["success"] }, { onSave: ["partial"] },
  { onSave: ["failure"] }, { onSave: ["fumble"] }
];

ok("I1 a blunder takes the bottom rung rather than nothing",
  effectiveSaveDegree(FEAR_LADDER, "blunder") === "fumble");

// I2: HEROIC IS THE OPPOSITE CASE AND MUST NOT CASCADE. Beating the best
// printed outcome means taking nothing, not taking the mildest rung.
ok("I2 a heroic save is not dragged down to the top rung",
  effectiveSaveDegree(FEAR_LADDER, "heroic") === "heroic");

// I3: A GAP IN THE MIDDLE inherits from the FAILING side — REVERSED at
// 3.493.0 by Graham's ruling of 4 September 2026.
//
// This check asserted the opposite, and its comment read "a ladder that
// skips a rung is not an invitation to punish". That was a defensible
// reading right up until Silent Binding was driven live: a Partial (14 vs
// 16) printed "is affected" and fired the SUCCESS rung. The degree table
// had already settled it — `partial` is `success: false` — so a Partial
// is not a save and must not read at a save's rung.
//
// Kept here, reversed, rather than deleted: this is the same ladder Word
// Of Fatigue prints, and it is the case the old rule was written for.
ok("I3 a middle gap inherits the harsher neighbour",
  effectiveSaveDegree(
    [{ onSave: ["critical"] }, { onSave: ["success"] }, { onSave: ["failure"] }, { onSave: ["fumble"] }],
    "partial"
  ) === "failure",
  "Word Of Fatigue prints no partial; a partial takes failure's outcome");

ok("I4 a declared degree is returned unchanged",
  effectiveSaveDegree(FEAR_LADDER, "failure") === "failure");

// I5: AN UNGATED SPELL NEVER REACHES THE CASCADE. The hundred-odd spells
// with no onSave anywhere must behave exactly as they did.
ok("I5 an ungated list is untouched",
  effectiveSaveDegree([{ kind: "condition", condition: "prone" }], "blunder") === "blunder");

ok("I6 an unknown degree is not invented into a real one",
  effectiveSaveDegree(FEAR_LADDER, "wobbly") === "wobbly");

// I7 SWEEPS THE PACK: every gated spell must now cover a blunder, which
// after the cascade is automatic — so this checks the cascade is really
// what makes it true, spell by spell, rather than the data happening to
// list it.
if (spells) {
  for (const spell of spells.values()) {
    const effects = spell.system?.effects ?? [];
    if (!effects.some(isDegreeGated)) continue;
    const landed = effectiveSaveDegree(effects, "blunder");
    ok(`I7 "${spell.name}" gives a blunder something to match`,
      gatedDegrees(effects).includes(landed),
      `blunder resolved to "${landed}", which nothing gates on`);
  }
}

/* ================================================================== *
 * G. A gate that matches nobody is not an error
 * ================================================================== *
 *
 * FOUND BY THE LIVE PASS ON 3.404.0. Fear carries five entries and at
 * most two apply to any one target, so a perfectly correct cast printed
 * FOUR copies of "condition effect — no target to apply to" on the card.
 * Four lines that read as four errors, on a spell that worked.
 *
 * The notice still fires for an UNGATED effect, where it means what it
 * always meant: the spell tried to do something to somebody and there
 * was nobody there.
 */
{
  const effectsFile = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
  // COMMENTS STRIPPED BEFORE MATCHING. The gate and its call are two
  // lines apart in CODE and seven apart in the file, because the reason
  // for the wording change is written between them. A locator that has
  // to reach across a comment is one a later edit silently breaks — the
  // trap this project's `strip()` helper exists for.
  const raw = fs.existsSync(effectsFile) ? fs.readFileSync(effectsFile, "utf8") : "";
  const text = raw
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  /*
   * RE-ANCHORED AT 3.481.0. The notice's WORDING moved into
   * `cast-result-line.mjs#effectNoTargetLine` when it stopped printing
   * `effect.kind` — an internal identifier — onto a player's card. The
   * claim these two checks make is unchanged and still worth making: the
   * notice is gated, and it still exists. Only the string it matches has
   * moved, so they match the call rather than the sentence.
   */
  /*
   * WIDENED AT 3.484.0. The gate gained a second clause —
   * `&& !reportsItsOwnAbsence(effect)`, so a missed attack no longer
   * prints "finds nobody" beneath its own "Miss vs …" — and this
   * locator pinned the exact `))` of the one-clause version. The claim
   * is unchanged: the degree gate is still what guards the notice. It
   * now allows further guards beside it rather than forbidding them.
   */
  ok("G1 the no-target notice is gated on the effect not being degree-gated",
    /!isDegreeGated\(effect\)[\s\S]{0,200}effectNoTargetLine\(/.test(text),
    "a gated effect matching nobody is the mechanism working, not a fault");
  ok("G2 the notice still exists for ungated effects",
    /effectNoTargetLine\(effect, spell\?\.name\)/.test(text),
    "removing it entirely would lose a real diagnostic");
}

/* ================================================================== *
 * F. The engine asks the gate
 * ================================================================== */

// A GATE NOTHING CONSULTS IS NOT AUTOMATION. Checked rather than trusted
// — the lesson this project keeps relearning.
{
  const effectsFile = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
  /*
   * COMMENTS STRIPPED AT 3.552.7, for the reason section G already gives
   * eighty lines above: F1b anchors across a whole assignment, and at
   * 3.552.6 the allies branch gained twenty lines of comment explaining
   * why it draws from the area rather than the save. The CODE was three
   * lines longer; the file was twenty-three, and the locator's window
   * was measured in characters of file. It went red over a comment.
   * Stripping first measures the distance the claim is actually about.
   */
  const text = (fs.existsSync(effectsFile) ? fs.readFileSync(effectsFile, "utf8") : "")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ")
    // The blank line a stripped comment leaves behind is still distance.
    .split("\n").filter((line) => line.trim()).join("\n");
  ok("F1 the effect engine imports the gate", /recipientsForEffect/.test(text));
  /*
   * WIDENED AT 3.486.0, for the same reason G1 was widened at 3.484.0.
   *
   * The recipient assignment gained a branch above the fallback — a
   * LADDER applies to everyone who rolled rather than to the failures,
   * because it names an outcome for every degree — and that pushed
   * `recipientsForEffect` past the 200-character window.
   *
   * The claim is unchanged and is now anchored to the END of the same
   * assignment rather than to a distance: the gate is what decides
   * recipients for every effect that is not self-targeted,
   * ally-targeted, or a ladder.
   */
  ok("F1b and uses it to choose recipients",
    // WIDENED AT 3.594.0: the chain gained an `enemies` branch for
    // Prayer, which pushed the tail past a 400-character window. The
    // check is about the chain ENDING at recipientsForEffect, not about
    // how long it is — a fixed width was always the wrong measure.
    /let recipients\s*=[\s\S]{0,1200}: recipientsForEffect\(effect, ladderResults, targets\);/.test(text),
    "the gate must decide the recipients, not merely be imported");
  ok("F1c and accepts the save results", /saveResults/.test(text));

  const cast = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
  const castText = fs.existsSync(cast) ? fs.readFileSync(cast, "utf8") : "";
  // F3/F4 ARE THE 3.405.0 WIRING. Both mechanisms are pure and fully
  // checked above — and a pure function the applier never calls is a
  // rule the game does not have. This is the same reason F1b exists.
  ok("F3 the engine maps rolled degrees onto the printed ladder",
    /ladderResults[\s\S]{0,120}effectiveSaveDegree/.test(text)
    && /recipientsForEffect\(effect,\s*ladderResults/.test(text),
    "a blunder must reach the bottom rung, not match nothing");
  ok("F4 the engine reads the duration PER EFFECT, inside the loop",
    /for \(const effect of effects\)[\s\S]{0,600}effectDurationText\(effect/.test(text),
    "read once per cast, a ladder printing three lengths gets one");

  ok("F2 the cast workflow passes the per-target degrees",
    /saveResults:\s*spellSave/.test(castText),
    "resolveSpellSave has always built them; this is the call that stopped discarding them");
}


/* ================================================================== *
 * P. THE PARTIAL RULING — Graham, 4 September 2026
 *
 * An unnamed degree reads at the nearest rung that is NO BETTER for the
 * target. Found by driving Silent Binding: a Partial (14 vs 16) printed
 * "is affected" and fired the SUCCESS rung. The degree table already
 * settled it — `partial` is `success: false`.
 * ================================================================== */

const LADDER = [{ onSave: ["success"] }, { onSave: ["failure"] }, { onSave: ["fumble"] }];

// P1 THE RULING ITSELF.
ok("P1 a PARTIAL reads at the failure rung",
  effectiveSaveDegree(LADDER, "partial") === "failure",
  "it read at `success` until 3.493.0 — one round of Silent Binding instead of one minute");

// P2 THE SAVING SIDE IS UNCHANGED, and it is how "unaffected" is written:
// as the absence of a row.
ok("P2 an unnamed CRITICAL still applies nothing",
  effectiveSaveDegree(LADDER, "critical") === "critical",
  "Silent Binding prints \"Critical: the target is unaffected\" and declares no critical row");
ok("P2b and so does an unnamed HEROIC",
  effectiveSaveDegree(LADDER, "heroic") === "heroic",
  "beating the best printed outcome should beat it");
ok("P2c a named SUCCESS is still its own rung",
  effectiveSaveDegree(LADDER, "success") === "success");

// P3 A FAILING DEGREE ALWAYS LANDS SOMEWHERE.
ok("P3 a BLUNDER still clamps to the bottom rung",
  effectiveSaveDegree(LADDER, "blunder") === "fumble",
  "the worst roll in the game must not be safer than the second worst");
ok("P3b a roll below every rung takes the worst declared",
  effectiveSaveDegree([{ onSave: ["success"] }, { onSave: ["failure"] }], "fumble") === "failure",
  "Fools Riches prints no fumble, so a fumble takes its failure rung");
ok("P3c and a PARTIAL lands even when every rung is below it",
  effectiveSaveDegree([{ onSave: ["failure"] }, { onSave: ["fumble"] }], "partial") === "failure",
  "Bane declares only failure and fumble, and matched NOTHING on a partial before this");

// P4 THE FOUR THAT DID NOTHING. Named, because a green run of this file
// must not read as "partials were always handled".
for (const [name, declared] of [
  ["Bane", [{ onSave: ["failure"] }, { onSave: ["fumble"] }]],
  ["Charm Undead", [{ onSave: ["failure", "fumble", "blunder"] }]],
  ["Alluring Caress", [{ onSave: ["failure"] }, { onSave: ["fumble", "blunder"] }]]
]) {
  ok(`P4 ${name} now resolves a partial`,
    effectiveSaveDegree(declared, "partial") === "failure",
    "a creature that partly failed took nothing at all");
}

/* ================================================================== *
 * R. A RIDER IS NOT A LADDER
 *
 * Surge Of The Tempest hangs its dazzle off "in the event of a fumble"
 * — an addition on one named degree. Its save is BASIC, which is what
 * tells the two apart without a flag anyone has to remember.
 * ================================================================== */

const RIDER = [{ onSave: ["fumble"] }];

ok("R1 a basic save is recognised",
  isBasicSave("Basic Reflex") === true && isBasicSave("basic fortitude") === true);
ok("R1b and a plain one is not",
  isBasicSave("Will") === false && isBasicSave("") === false && isBasicSave(null) === false);

ok("R2 A RIDER IS NOT FILLED FROM ABOVE",
  effectiveSaveDegree(RIDER, "failure", { basicSave: true }) === "failure",
  "a Failure is not a Fumble, and the book dazzles only on a fumble");
ok("R2b nor from two rungs above",
  effectiveSaveDegree(RIDER, "partial", { basicSave: true }) === "partial");
ok("R3 BUT IT IS STILL CLAMPED FROM BELOW",
  effectiveSaveDegree(RIDER, "blunder", { basicSave: true }) === "fumble",
  "a Blunder is a worse Fumble; letting it fall off the bottom is the defect the clamp exists for");
ok("R3b and the named degree is itself",
  effectiveSaveDegree(RIDER, "fumble", { basicSave: true }) === "fumble");

// R4 THE SAME LADDER, READ THE TWO WAYS, MUST DIFFER. If these ever
// agree the parameter has stopped doing anything.
ok("R4 rider and ladder disagree on a failure",
  effectiveSaveDegree(RIDER, "failure", { basicSave: true })
    !== effectiveSaveDegree(RIDER, "failure"),
  "the ladder reading fills the hole downward; the rider reading must not");

/* ================================================================== *
 * X. THE TWO MAPPERS AGREE ON WHAT THEY BOTH ANSWER
 * ================================================================== */

const PRISON_LADDER = ["critical", "success", "failure", "fumble"].map((d) => ({ onSave: [d] }));
for (const rolled of ["partial", "blunder"]) {
  ok(`X1 prison and effectiveSaveDegree agree on ${rolled}`,
    prisonDegree(rolled) === effectiveSaveDegree(PRISON_LADDER, rolled),
    `prison says ${prisonDegree(rolled)}, the ladder says ${effectiveSaveDegree(PRISON_LADDER, rolled)}`);
}
// X2 AND WHERE THEY DIFFER, DELIBERATELY. A prison ladder must name all
// four printed degrees and clamps a heroic to `critical`; this mapper may
// be asked about a ladder with gaps and answers "nothing applies", which
// is how an unaffected rung is written. Asserted so the difference cannot
// drift into an accident.
// THEY AGREE NOW (3.609.0). Graham, 1 October 2026: a Heroic save reads at a
// printed Critical rung on every spell — which is what the prison always did.
// Where a spell prints NO Critical, a Heroic still escapes; that is the half
// of the old difference that remains, and it is asserted instead.
ok("X2 they agree on heroic where a Critical is printed, and a spell without one lets it escape",
  prisonDegree("heroic") === "critical"
  && effectiveSaveDegree(PRISON_LADDER, "heroic") === "critical"
  && effectiveSaveDegree([{ onSave: ["failure"] }], "heroic") === "heroic",
  "a prison names every rung; a spell ladder may leave the best one unwritten");

/* ================================================================== *
 * G. A NOTE MAY BELONG TO ONE RUNG
 * ================================================================== */

const effectsSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
ok("G1 a gated note is held to its rung",
  effectsSrc.includes("const rungHit = ladderResults.some((r) => effectAppliesOnDegree(effect, r?.degree));"),
  "Enchanting Utterance's Failure outcome is a rung, not prose about one");
ok("G1b and an ungated note still always prints",
  /if \(isDegreeGated\(effect\)\) \{[\s\S]{0,200}?\}\s*\n\s*lines\.push\(line\(`<em>\$\{effect\.text/.test(effectsSrc),
  "a hundred-odd notes describe the whole spell and must be untouched");
ok("G2 the cast decides rider-or-ladder from the printed save",
  effectsSrc.includes("const basicSave = isBasicSave(spell?.system?.defence);")
  && effectsSrc.includes("effectiveSaveDegree(effects, result?.degree, { basicSave })"),
  "derived from the spell, not from a flag an author has to remember");

/* ================================================================== */

process.stdout.write(`verify-spell-degrees: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
