#!/usr/bin/env node
/**
 * verify-chapter10-251-260 — the Grimoire, Anticipate Attack to Conjure
 * Eternal.
 *
 * NEW at 3.586.0. Graham's R1-R10 of 23 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS BLOCK'S LESSON IS ABOUT THE AUDIT, NOT THE CODE.
 *
 * R1 reported "seventeen spells print a degree ladder, and not one is
 * modelled as one", and recommended building a mechanism for condition
 * ladders because none existed. Both halves were wrong. `onSave` had
 * existed since 3.352.0, nineteen spells used it, fifty-nine rows
 * depended on it, `verify-spell-degrees` asserted the count of them in
 * this very directory — and TWO of the seventeen, Bane and Colour Spray,
 * were already laddered with it correctly.
 *
 * I got as far as extending `save-ladder.mjs` with a parallel
 * `conditions` map before opening a pack entry and finding `onSave` on
 * it. The extension was reverted rather than shipped, because two ways
 * of saying "this happens on a Fumble" is two things to keep in step on
 * exactly the spells where a mismatch is invisible.
 *
 * SECTION E IS THE GUARD AGAINST THAT SPECIFIC ERROR: it asserts, per
 * spell, the rungs the PAGE prints — so a future ladder authored with a
 * second mechanism would leave these rows empty and be caught here
 * rather than believed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND ONE DEFECT OF MINE FROM LAST WEEK, found while building R8.
 *
 * `verify-chapter9-241-250` Q3 asserts of Acid Arrow that "its Sustain
 * choice sits where the cast reads it — cast-workflow reads
 * spellData.sustainChoices". That sentence is TRUE and the check was
 * worthless: cast-workflow reads the field only inside the branch that
 * records an EMANATION, Acid Arrow has no area, and the picker that
 * would have offered the choice builds its rows from Luminance's state
 * and ignores the declared list entirely. The Sustain I shipped could
 * not be taken.
 *
 * The check asked whether a name appeared somewhere a reader existed. It
 * never asked whether THIS spell could reach THAT reader. Section B asks
 * the second question, which is the only one that was ever worth asking.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { parseSpellDuration, unreadableEffectDurations } from "../module/magic/effect-duration.mjs";
import {
  declaredSustainChoices, offersPlainSustainChoice, sustainChoiceByKey, sustainChoiceLine
} from "../module/magic/sustain-choice.mjs";
import {
  ANTIMAGIC_FLAG, antimagicLine, antimagicLiftedLine, normaliseAntimagic,
  suppressedEffectIds, suppressibleEffectIds
} from "../module/magic/antimagic.mjs";
import { LIVE_EMANATION_EFFECT_KINDS, emanationIsLive } from "../module/magic/emanation.mjs";
import { declaredDegrees, effectiveSaveDegree } from "../module/magic/spell-degrees.mjs";
import { normaliseSaveLadder, saveLadderOutcome } from "../module/magic/save-ladder.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { castTimeAP, warpedCastTime } from "../module/magic/cast-time.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const code = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

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
ok("A0 the spells pack could be read", spells !== null);
const rowsOf = (name) => spells?.get(name)?.system?.effects ?? [];
const sysOf = (name) => spells?.get(name)?.system ?? null;

/* ================================================================== *
 * A. "PERMANENT" IS A DURATION, NOT A PARSE FAILURE
 *
 * Blindness's Fumble rung is "blinded permanently", and until this
 * release that was indistinguishable from the typo the whole
 * unreadable-duration check exists to catch. Both parsed to null; null
 * means no timing; no timing means it never comes off. The check was
 * right to refuse — given only `null` there is no way to tell "never
 * expires" from "nobody proofread this".
 * ================================================================== */

ok("A1 permanent parses, rather than failing to",
  parseSpellDuration("permanent") !== null);
ok("A2 and it carries no timing, which is what permanent means",
  parseSpellDuration("permanent")?.rounds === null
  && parseSpellDuration("permanent")?.seconds === null,
  JSON.stringify(parseSpellDuration("permanent")));
ok("A3 it says so rather than leaving it to be inferred",
  parseSpellDuration("permanent")?.permanent === true,
  "a caller that wants to know must be able to ask");
ok("A4 it is not sustained, which is the other numberless duration",
  parseSpellDuration("permanent")?.sustained === false);
ok("A5 'permanently' reads the same as 'permanent'",
  parseSpellDuration("permanently")?.permanent === true,
  "the page's adverb and the pack's adjective");
// THE GUARD THE CHANGE MUST NOT HAVE LOOSENED. If any string with no
// number now parses, the check has been neutered rather than taught.
ok("A6 a typo is still unreadable",
  parseSpellDuration("1 rnd") === null && parseSpellDuration("permanant") === null,
  "the misspelling must not slip through the new branch");
ok("A7 and the sweep accepts the real word while refusing the typo",
  unreadableEffectDurations([{ duration: "permanent" }]).length === 0
  && unreadableEffectDurations([{ duration: "1 rnd" }]).length === 1);
ok("A8 a number still wins over the word",
  parseSpellDuration("1 minute")?.rounds === 10,
  "the permanence branch must not shadow the numeric one");

/* ================================================================== *
 * B. A SUSTAIN THAT BUYS SOMETHING OTHER THAN TIME
 *
 * See the header. The question every check here asks is whether THIS
 * spell can reach the reader, not whether a reader exists somewhere.
 * ================================================================== */

const BLINK_ENTRY = {
  name: "Blink",
  sustainChoices: [{ key: "blink", label: "Vanish and reappear 10 feet away", note: "vanishes and reappears 10 feet away in a random direction" }]
};

ok("B1 a choice on the ENTRY is found",
  declaredSustainChoices(BLINK_ENTRY).length === 1,
  "Blink has no area, so the emanation record it used to be stored on never exists");
ok("B2 a choice on the EMANATION is still found",
  declaredSustainChoices({ emanation: { sustainChoices: [{ key: "heal" }] } }).length === 1,
  "Luminance's list lives there and must keep working");
ok("B3 an entry declaring none offers none",
  declaredSustainChoices({ name: "Bless" }).length === 0);
// A ROW WITHOUT A KEY CANNOT BE CHOSEN BACK, so it is dropped rather
// than offered and then not found.
ok("B4 a keyless row is dropped",
  declaredSustainChoices({ sustainChoices: [{ label: "no key" }, { key: "k", label: "L" }] })
    .map((c) => c.key).join() === "k");
ok("B5 a duplicate key is dropped",
  declaredSustainChoices({ sustainChoices: [{ key: "k", label: "A" }, { key: "k", label: "B" }] })
    .length === 1,
  "two rows answering to one key is a picker that cannot say which was chosen");
ok("B6 a row with no label falls back to its key rather than rendering blank",
  declaredSustainChoices({ sustainChoices: [{ key: "blink" }] })[0].label === "blink");

// THE TWO PICKERS ARE KEPT APART BY ONE QUESTION, asked in one place.
ok("B7 a plain entry wants the plain picker",
  offersPlainSustainChoice(BLINK_ENTRY) === true);
ok("B8 Luminance keeps its own",
  offersPlainSustainChoice({ luminance: { healingDice: 2 }, emanation: { sustainChoices: [{ key: "heal" }] } }) === false,
  "its options are a function of state, which no pack row can express");
ok("B9 and an entry declaring nothing wants neither",
  offersPlainSustainChoice({ name: "Bless" }) === false);

ok("B10 a declared key resolves to its row",
  sustainChoiceByKey(BLINK_ENTRY, "blink")?.key === "blink");
// NULL RATHER THAN THE FIRST ROW: substituting quietly would spend an
// action on something the caster did not pick.
ok("B11 an undeclared key resolves to nothing",
  sustainChoiceByKey(BLINK_ENTRY, "teleport") === null);
ok("B12 and so does a blank one", sustainChoiceByKey(BLINK_ENTRY, "") === null);

ok("B13 the card says the spell's own words",
  sustainChoiceLine(declaredSustainChoices(BLINK_ENTRY)[0])
    === "vanishes and reappears 10 feet away in a random direction",
  "the note, not the button label");
ok("B14 it falls back to the label when there is no note",
  sustainChoiceLine({ key: "k", label: "Do the thing", note: "" }) === "Do the thing");
ok("B15 and punctuates nothing, because the caller does",
  !sustainChoiceLine({ key: "k", label: "Do the thing." }).endsWith("."));

/* THE WIRING, PINNED. Each of these is a place the field was NOT read
 * before this release, which is precisely why Acid Arrow's choice went
 * nowhere. */
{
  const active = code("module", "magic", "active-spells.mjs");
  const cast = code("module", "magic", "cast-workflow.mjs");
  const flow = code("module", "magic", "sustain-workflow.mjs");
  ok("B16 registerActiveSpell accepts the choices",
    /registerActiveSpell\(actor, \{[^)]*sustainChoices = \[\]/.test(active));
  ok("B17 and writes them onto the entry",
    /sustainChoices: Array\.from\(sustainChoices \?\? \[\]\)\.map\(\(c\) => \(\{ \.\.\.c \}\)\)/.test(active),
    "copied, not aliased — the pack row must not be mutable through the entry");
  ok("B18 the cast passes them at registration, OUTSIDE the emanation branch",
    /sustainChoices: Array\.isArray\(spellData\.sustainChoices\) \? spellData\.sustainChoices : \[\],/
      .test(cast),
    "the one thing Q3 of last block's file failed to ask");
  ok("B19 the sustain action offers the plain picker",
    /if \(offersPlainSustainChoice\(entry\)\) \{/.test(flow));
  ok("B20 and a cancelled picker spends nothing",
    /plainChoice = await promptDeclaredSustain\(entry, declaredSustainChoices\(entry\)\);\s*\n\s*if \(!plainChoice\) return null;/
      .test(flow),
    "asked before ensureActionPoints, like every other refusal in that function");
  ok("B21 the picker is asked BEFORE the AP is taken",
    flow.indexOf("offersPlainSustainChoice(entry)") < flow.indexOf("ensureActionPoints(actor, SUSTAIN_AP_COST"),
    "order, not presence");
  ok("B22 and what it bought reaches the card",
    /if \(plainChoice\) choiceNote = sustainChoiceLine\(plainChoice\);/.test(flow));
}

/* ================================================================== *
 * C. ANTIMAGIC — SUPPRESSED, NOT ENDED
 *
 * The page's closing sentence is the whole spell: "at the end of the
 * spell's duration, all magic continues to function as before".
 * ================================================================== */

const SYS = "trg-prime";
const eff = (id, flags = {}, disabled = false) => ({ id, disabled, flags: { [SYS]: flags } });

ok("C1 an antimagic row normalises", normaliseAntimagic({ kind: "antimagic" })?.label === "Antimagic Field");
ok("C2 and carries an authored label when given one",
  normaliseAntimagic({ kind: "antimagic", label: "Null Field" })?.label === "Null Field");
ok("C3 anything else does not", normaliseAntimagic({ kind: "bonus" }) === null
  && normaliseAntimagic(null) === null);

{
  const world = [
    eff("bless", { spellBuff: true }),
    eff("bane", { spellBuff: true }),
    eff("marker", { spellBuff: true, castId: "mine", [ANTIMAGIC_FLAG]: { suppressed: [] } }),
    eff("other-field", { spellBuff: true, castId: "theirs", [ANTIMAGIC_FLAG]: { suppressed: [] } }),
    eff("byHand", { spellBuff: true }, true),
    eff("poison", {})
  ];
  const ids = suppressibleEffectIds(world, "mine", SYS);
  ok("C4 ordinary spell effects are suppressed", ids.includes("bless") && ids.includes("bane"));
  ok("C5 the field's own marker is not", !ids.includes("marker"),
    "a field that suppressed itself would be off the instant it came on");
  ok("C6 another field's marker is not either", !ids.includes("other-field"),
    "two overlapping fields would switch each other off and neither would work");
  ok("C7 a non-spell effect is not", !ids.includes("poison"),
    "this suppresses spells, and says so on the card rather than claiming all magic");
  // THE ONE WITH TEETH: this list is also the RESTORE list.
  ok("C8 an effect already switched off by hand is not touched", !ids.includes("byHand"),
    "it would be switched back ON when the field dropped — the field restores what it suppressed, and nothing else");
  ok("C9 exactly two are taken", ids.length === 2, ids.join(", "));
}

ok("C10 the restore list is read back from the marker, not recomputed",
  suppressedEffectIds({ flags: { [SYS]: { [ANTIMAGIC_FLAG]: { suppressed: ["a", "b"] } } } }, SYS)
    .join() === "a,b");
ok("C11 a marker with nothing recorded restores nothing",
  suppressedEffectIds({ flags: { [SYS]: { [ANTIMAGIC_FLAG]: {} } } }, SYS).length === 0);
ok("C12 and a non-marker restores nothing rather than throwing",
  suppressedEffectIds({}, SYS).length === 0 && suppressedEffectIds(null, SYS).length === 0);
// WHY C10 MATTERS, stated as its own check so the reasoning cannot be
// lost with the comment: after suppression every id is `disabled`, so
// asking "what is suppressible" a second time returns nothing at all.
{
  const after = [eff("bless", { spellBuff: true }, true), eff("marker", { spellBuff: true, castId: "mine" })];
  ok("C13 recomputing at removal time would restore nothing",
    suppressibleEffectIds(after, "mine", SYS).length === 0,
    "which is why the ids are written onto the marker at suppression time");
}

ok("C14 the card says suppressed, and says not ended",
  /suppressed/.test(antimagicLine("Keldran", 3)) && /not ended/.test(antimagicLine("Keldran", 3)));
ok("C15 nothing to suppress still says something",
  /No magical effects/.test(antimagicLine("Keldran", 0)),
  "a silent card is how a player learns nothing happened only by guessing");
ok("C16 one effect reads as one", /1 magical effect is/.test(antimagicLine("K", 1)));
ok("C17 the lifted line promises what the page promises",
  /function as before/.test(antimagicLiftedLine("Keldran", 2)));
ok("C18 and one effect reads as one there too",
  /1 magical effect functions as before/.test(antimagicLiftedLine("K", 1)));

ok("C19 antimagic is a live emanation kind",
  LIVE_EMANATION_EFFECT_KINDS.includes("antimagic"),
  "the circle must follow its caster and know who is inside it");
ok("C20 and the handled-kinds list knows it",
  HANDLED_EFFECT_KINDS.includes("antimagic"),
  "an unlisted kind prints `Unhandled effect kind` on a card for a working spell");
ok("C21 the spell applier breaks rather than falling through",
  /case "antimagic":\s*\n\s*break;/.test(code("module", "magic", "spell-effects.mjs")),
  "the emanation sweep owns it, exactly as it owns perTurn and saveLadder");

{
  const ef = code("module", "magic", "emanation-effects.mjs");
  // RE-ANCHORED 3.612.0: the guard gained a held bonus after it (Inspire Heroics).
  ok("C22 a field with no bonus rows still places its marker",
    // RE-ANCHORED 3.614.0: Wellspring's heal on damage (R9) is a fourth kind.
    /&& !antimagic(?: && !held)?(?: && !damageHeal)?\) return null;/.test(ef),
    "an antimagic aura is the third kind that is not a number on a sheet");
  ok("C23 the marker starts empty",
    /\[ANTIMAGIC_FLAG\]: \{ label: antimagic\.label, suppressed: \[\] \}/.test(ef),
    "who is inside is a fact about a creature; this data is shared by everyone in the circle");
  ok("C24 suppression happens AFTER the marker exists",
    ef.indexOf("createEmbeddedDocuments(\"ActiveEffect\", [data])")
      < ef.indexOf("const ids = suppressibleEffectIds("),
    "order, so the exclusion is by castId rather than by sequence");
  // ANCHORED ON THE STATEMENT, NOT THE CALL. The first draft matched
  // `await created.setFlag(...)` anywhere in the file, and
  // `mutate-chapter10-251-260` walked straight through it by writing
  // `if (false) await created.setFlag(...)` — the text was still there
  // and the call never ran. Presence is not reachability, inside a check
  // as much as inside a rule; this project has now recorded that shape
  // in `verify-effect-kinds-handled`, in last block's Q3, and here.
  ok("C25 the ids are written onto the marker",
    /\n\s*await created\.setFlag\(SYSTEM_ID, ANTIMAGIC_FLAG, \{/.test(ef),
    "and it must be the whole statement, not a call hidden behind a guard");
  ok("C26 removal restores BEFORE it deletes",
    ef.indexOf("disabled: false") < ef.lastIndexOf("deleteEmbeddedDocuments(\"ActiveEffect\", ids)"),
    "delete first and the list of what to restore is gone, silently");
  ok("C27 and only restores effects that are still there",
    /const present = suppressed\.filter\(\(id\) => actor\.effects\?\.get\?\.\(id\)\);/.test(ef),
    "one that expired inside the field is gone, and updating a deleted id throws");
  ok("C28 applyEmanationEffectsTo returns one shape on every path",
    (ef.match(/return \{ effect: null, line: "" \};/g) ?? []).length === 3
    && /return \{ effect: created \?\? null, line: "" \};/.test(ef),
    "a caller holding one of two shapes is a caller that gets it wrong");
  ok("C29 and the sweep posts the line it hands back",
    /if \(applied\?\.line\) \{/.test(code("module", "magic", "emanation-workflow.mjs")),
    "switching other effects off is invisible unless the card says so");

  /*
   * C30 IS THE DEFECT THE LIVE DRIVE FOUND, and it is the one thing in
   * this section no source reading would have caught.
   *
   * Driving Antimagic Field in Graham's world: the field went up, the
   * card named both creatures standing in it, and their magic went on
   * working — a +1 Brawn still reading +1 — until somebody MOVED and the
   * movement sweep ran. The card said a thing had happened and nothing
   * had, which is the silent-nothing shape, in the release that added
   * two checks against it.
   *
   * Every live emanation before this applied a BONUS, which the cast
   * places and `adoptCastEffects` then takes ownership of, so the sweep
   * had nothing left to do on the first frame; `perTurn` fires on a turn
   * boundary and needs nothing at the cast either. An antimagic field is
   * the first whose effect is owed to whoever is standing there the
   * moment it appears — and the only code that knows who those are is
   * the sweep.
   */
  const emwf = code("module", "magic", "emanation-workflow.mjs");
  /*
   * ANCHORED TO `adoptCastEffects`, AND THAT TOOK TWO GOES.
   *
   * The first version matched the two lines anywhere in the file — and
   * `growEmanation` has contained the same two lines, character for
   * character, since Protective Ward was built. So the mutation deleted
   * the copy in `recordEmanation`, the check matched the OTHER one, and
   * it passed on a file with the defect back in it.
   *
   * That is the same "a name appears somewhere" shape this file's own
   * header criticises in last block's Q3, written fresh into the check
   * meant to guard against it. Tying the assertion to
   * `adoptCastEffects` — which appears once, in the function that owns
   * this rule — is what makes it about the right occurrence.
   */
  ok("C30 the cast reconciles the new emanation once, before anybody moves",
    /await adoptCastEffects\(castId\);[\s\S]{0,2000}?const record = runningEmanations\(\)\.find\(\(r\) => r\.entry\.id === castId\);\s*\n\s*if \(record\) await refreshEmanation\(record\);/.test(emwf),
    "a field that suppresses nothing until somebody takes a step is a card describing an event that did not happen");
  ok("C30b and it does so AFTER the cast's own effects are adopted",
    emwf.includes("await adoptCastEffects(castId);")
    && emwf.indexOf("await adoptCastEffects(castId);") < emwf.indexOf("if (record) await refreshEmanation(record);"),
    "order, so the reconcile is a no-op for the ten emanations that place their bonus at the cast");
}

/* ================================================================== *
 * D. THE PACK — R1's THIRTEEN CONDITION LADDERS
 *
 * The rungs are read off the PRINTED page, not off the pack, which is
 * the point: a ladder authored through some other mechanism would leave
 * these empty.
 * ================================================================== */

/** spell -> the degrees its page prints outcomes for. */
const PRINTED = Object.freeze({
  blindness: ["success", "failure", "fumble"],
  "brain lock": ["critical", "success", "failure", "fumble"],
  confusion: ["success", "failure", "fumble"],
  "cognitive collapse": ["success", "failure", "fumble"],
  calm: ["success", "failure", "fumble"],
  "calm animal": ["success", "failure", "fumble"],
  // NO CRITICAL LINE ON THE PAGE. Its ladder starts at Success, and a
  // Critical saved and is not named, so nothing applies — which is rule
  // 2 of the authoring script doing its job rather than an omission.
  "charm animal": ["failure", "fumble"],
  "charm kind": ["critical", "success", "failure", "fumble"],
  "cloak of greying": ["success", "failure", "fumble"],
  command: ["failure", "fumble"],
  banishment: ["critical", "failure", "fumble"],
  // FOUR FAILING RUNGS, AND THE FOURTH IS NOT A BIGGER PENALTY. "Blunder:
  // the target fails the action" has to be declared or the remapping
  // reads it at Fumble and applies -4 to an action the page simply fails.
  bungle: ["failure", "fumble", "blunder"]
});

/*
 * AND THE THREE WHOSE CRITICAL RUNG SAYS MORE THAN "UNAFFECTED", which
 * therefore name `heroic` beside it. See the authoring script: a save
 * the spell does not name applies NOTHING, which is right when the
 * Critical is simply "unaffected" and wrong when it ends the spell,
 * stuns the caster, or leaves the target knowing it was attacked.
 *
 * LISTED RATHER THAN DERIVED. "Does this rung say more than unaffected"
 * is a reading of English, and a check that tried to infer it would be
 * agreeing with its own guess rather than with the page.
 */
const HEROIC_TOO = new Set(["brain lock", "charm kind", "banishment"]);

for (const [name, printed] of Object.entries(PRINTED)) {
  const rows = rowsOf(name);
  const declared = new Set();
  for (const row of rows) for (const d of declaredDegrees(row) ?? []) declared.add(d);
  const expected = HEROIC_TOO.has(name) ? [...printed, "heroic"] : printed;
  ok(`D:${name} declares exactly the rungs its page prints`,
    [...declared].sort().join() === [...expected].sort().join(),
    `declared ${[...declared].sort().join() || "none"}, expected ${[...expected].sort().join()}`);
  // THE OTHER HALF OF THE SAME RULE: `heroic` is meaningless without a
  // `critical` beside it, since it exists to say "at least what a
  // Critical gets".
  ok(`D:${name} names heroic only alongside critical`,
    !declared.has("heroic") || declared.has("critical"));
}

// AND THE ROWS THEMSELVES, where the page names a mechanical outcome.
ok("D1 Blindness blinds for one round, one minute, then permanently",
  rowsOf("blindness").filter((r) => r.condition === "blinded")
    .map((r) => r.duration).join() === "1 round,1 minute,permanent");
ok("D2 Brain Lock's stunned 3 is declared on the FUMBLE as well as the failure",
  rowsOf("brain lock").some((r) => r.condition === "stunned" && r.value === 3
    && (r.onSave ?? []).includes("failure") && (r.onSave ?? []).includes("fumble")),
  "the page's fumble is 'as failure except…', and gating does not inherit");
ok("D3 and its fumble also paralyzes",
  rowsOf("brain lock").some((r) => r.condition === "paralyzed" && (r.onSave ?? []).join() === "fumble"));
// MEASURED, NOT BELIEVED: the registry key is the American spelling and
// `paralysed` is not a key at all. A condition the registry does not
// know prints "Unknown condition" on the card.
ok("D4 it is spelled the way the condition registry spells it",
  rowsOf("brain lock").every((r) => r.condition !== "paralysed"));
ok("D5 Confusion stuns on a success and confuses on the two failures",
  rowsOf("confusion").some((r) => r.condition === "stunned" && r.value === 1)
  && rowsOf("confusion").some((r) => r.condition === "confused"
    && (r.onSave ?? []).join() === "failure,fumble"));
ok("D6 Cognitive Collapse dazes 2 then 4",
  rowsOf("cognitive collapse").filter((r) => r.condition === "dazed")
    .map((r) => r.value).join() === "2,4");
ok("D7 Calm and Calm Animal both carry the -1 status on a SUCCESS",
  [rowsOf("calm"), rowsOf("calm animal")].every((rows) => rows.some(
    (r) => r.kind === "bonus" && r.slot === "attack" && r.bonusType === "status"
      && r.value === -1 && (r.onSave ?? []).join() === "success")),
  "a penalty for saving is the shape the degree machinery exists to allow");
ok("D8 the charms move attitude to friendly then helpful",
  [rowsOf("charm animal"), rowsOf("charm kind")].every((rows) =>
    rows.some((r) => r.kind === "attitude" && r.to === "friendly" && (r.onSave ?? []).join() === "failure")
    && rows.some((r) => r.kind === "attitude" && r.to === "helpful" && (r.onSave ?? []).join() === "fumble")));
ok("D9 Bungle's two penalties are -2 then -4, and circumstance",
  rowsOf("bungle").filter((r) => r.kind === "bonus")
    .map((r) => `${r.bonusType}${r.value}`).join() === "circumstance-2,circumstance-4");
ok("D10 and its Blunder is an outcome rather than a third number",
  rowsOf("bungle").some((r) => r.kind === "note" && (r.onSave ?? []).join() === "blunder")
  && !rowsOf("bungle").some((r) => r.kind === "bonus" && (r.onSave ?? []).includes("blunder")));

// CLONE IS THE EXCEPTION AND IT IS DELIBERATE. Its ladder hangs off the
// CASTING CHECK made months later, and `onSave` rows are matched against
// saving-throw results — a gated row on a spell with no save matches
// nothing and prints nothing.
ok("D11 Clone's ladder is ungated, because it is not a saving throw",
  rowsOf("clone").length > 0
  && rowsOf("clone").every((r) => r.kind === "note" && r.onSave === undefined),
  "gated rows on a spell with defence:'' would be the silent-nothing shape");
ok("D12 and the card carries all four of its printed outcomes",
  ["Critical", "Success", "Failure", "Fumble"].every(
    (d) => rowsOf("clone").some((r) => String(r.text).includes(d))),
  "somebody reads this in 1d6+1 months");
ok("D13 Clone really does print no saving throw",
  String(sysOf("clone")?.defence ?? "") === "");

/* ================================================================== *
 * E. R1's TWO DAMAGE LADDERS
 * ================================================================== */

for (const name of ["apocalypse", "blight cloud"]) {
  const row = rowsOf(name).find((r) => r.kind === "saveLadder");
  ok(`E:${name} carries a saveLadder`, Boolean(row));
  ok(`E:${name} normalises`, normaliseSaveLadder(row) !== null,
    "an unparseable rung returns null and the spell falls back to flat damage");
}
{
  const apoc = normaliseSaveLadder(rowsOf("apocalypse").find((r) => r.kind === "saveLadder"));
  ok("E1 Apocalypse is 2d6 up to a Partial and 4d6 below it",
    ["critical", "success", "partial"].every((d) => saveLadderOutcome(apoc, d).dice === "2d6")
    && ["failure", "fumble"].every((d) => saveLadderOutcome(apoc, d).dice === "4d6"));
  ok("E2 its criticals are minor, serious, deadly",
    saveLadderOutcome(apoc, "partial").severity === "minor"
    && saveLadderOutcome(apoc, "failure").severity === "serious"
    && saveLadderOutcome(apoc, "fumble").severity === "deadly");
  // A BLUNDER MUST NOT BE SAFER THAN A FUMBLE — the defect
  // `effectiveSaveDegree` and `ladderDegree` both exist to prevent, asked
  // of this spell rather than of the rule in the abstract.
  ok("E3 and a Blunder takes the Fumble rung",
    saveLadderOutcome(apoc, "blunder").dice === "4d6"
    && saveLadderOutcome(apoc, "blunder").severity === "deadly");
  /*
   * THE TWO MECHANISMS DISAGREE ABOUT `heroic` ON PURPOSE, and this is
   * the check that keeps the disagreement from becoming a contradiction
   * inside one spell.
   *
   * A ladder WALKS DOWN to the nearest printed rung, so a Heroic takes
   * the Critical's 2d6 — Apocalypse prints no harmless outcome at all,
   * and inventing one here would be kinder than the page.
   * `effectiveSaveDegree` instead applies NOTHING to an unnamed saving
   * degree, so the Critical's "immune to this casting" would not have
   * printed for the one roll that most deserves it. The row now names
   * `heroic` beside `critical`; without it the card contradicted its own
   * damage.
   */
  ok("E4 a Heroic takes the Critical rung, because the page prints no harmless outcome",
    saveLadderOutcome(apoc, "heroic").dice === "2d6",
    "a ladder walks down to the nearest printed rung; it does not invent a better one");
  ok("E4b and the immunity sentence prints on that roll too",
    effectiveSaveDegree(rowsOf("apocalypse"), "heroic") === "heroic"
    && rowsOf("apocalypse").some((r) => (r.onSave ?? []).includes("heroic")
      && /immune to this casting/.test(r.text)),
    "or a perfect save takes 4d6-worth of card and no word about immunity");
  ok("E5 Apocalypse's damage type is mental", apoc.damageType === "mental");

  const blight = normaliseSaveLadder(rowsOf("blight cloud").find((r) => r.kind === "saveLadder"));
  ok("E6 Blight Cloud's critical is unaffected",
    saveLadderOutcome(blight, "critical").harmless === true,
    "an empty rung is legal and means exactly that");
  ok("E7 its rungs climb 2d6 / 3d6 / 3d6 / 4d6",
    ["success", "partial", "failure", "fumble"]
      .map((d) => saveLadderOutcome(blight, d).dice).join() === "2d6,3d6,3d6,4d6");
  ok("E8 with criticals only on the two worst rungs",
    saveLadderOutcome(blight, "partial").severity === null
    && saveLadderOutcome(blight, "failure").severity === "minor"
    && saveLadderOutcome(blight, "fumble").severity === "serious");
  ok("E9 and it is aligned damage, from the caster's deity",
    blight.damageType === "aligned");
  ok("E10 Blight Cloud now says what its fog does",
    rowsOf("blight cloud").some((r) => r.kind === "note" && /concealed/.test(r.text)),
    "Acid Cloud, its twin on these pages, has carried that sentence since 3.585.0");
}

/* ================================================================== *
 * F. R5 — THE BONUSES THAT HAD NO ROW
 * ================================================================== */

ok("F1 Brawn offers the three physical abilities as modes",
  (sysOf("brawn")?.apOptions ?? []).map((o) => o.effects[0].slot).join()
    === "strength,dexterity,constitution");
ok("F2 each grants +1 status to the ability it names",
  (sysOf("brawn")?.apOptions ?? []).every(
    (o) => o.effects[0].value === 1 && o.effects[0].bonusType === "status"));
ok("F3 Channel The Aspect offers its four aspects",
  (sysOf("channel the aspect")?.apOptions ?? []).length === 4);
ok("F4 three of them grant +4 status and the fourth grants an action",
  (sysOf("channel the aspect")?.apOptions ?? [])
    .filter((o) => o.effects.some((e) => e.kind === "bonus" && e.value === 4)).length === 3,
  "Limbs is quickened, and 'only for a Move or a Strike' is a restriction nothing can enforce");
ok("F5 Limbs grants no bonus row at all",
  (sysOf("channel the aspect")?.apOptions ?? [])
    .find((o) => /Limbs/.test(o.label))?.effects.every((e) => e.kind === "note"),
  "a row granting the action without the restriction would be a wrong rule, not a partial one");
// THE `??` TRAP, and it had been live on Barkskin since it was authored.
ok("F6 no mode blanks its spell's printed range",
  ["brawn", "channel the aspect", "barkskin"].every(
    (n) => (sysOf(n)?.apOptions ?? []).every((o) => !Object.hasOwn(o, "range"))),
  "`effRange = apMode?.range ?? range` — an empty string REPLACES 'touch' rather than falling through");
/*
 * `note` NAMES A SCOPE, NOT THE SPELL. `effectName` builds
 * "<spell> <note>", so a note repeating the spell's own name puts
 * "Brawn Brawn" on the sheet — which is what casting it showed, and what
 * Barkskin has read since it was authored. Zealous Conviction's
 * "(vs mental effects)" is the shape the field is for.
 */
for (const n of ["brawn", "channel the aspect", "barkskin"]) {
  const notes = (sysOf(n)?.apOptions ?? []).flatMap((o) => (o.effects ?? []).map((e) => e.note)).filter(Boolean);
  const spell = spells?.get(n)?.name ?? "";
  ok(`F6b:${n} no effect note repeats its spell's name`,
    notes.every((note) => !String(note).toLowerCase().includes(spell.toLowerCase())),
    `notes: ${notes.join(" | ")}`);
}
ok("F7 Barkskin's bonus was already automated, on the slot the sheet pools",
  (sysOf("barkskin")?.apOptions ?? [])[0]?.effects
    ?.some((e) => e.slot === "naturalArmourFlat" && e.value === 1),
  "R5 listed it as missing; it had been there all along");

ok("F8 Breeze grants a conditional rather than a flat bonus",
  rowsOf("breeze").some((r) => r.kind === "conditional" && r.grants?.[0]?.value === 2));
ok("F9 and it is offered rather than auto-applied",
  rowsOf("breeze").find((r) => r.kind === "conditional")?.grants?.[0]?.auto !== true,
  "'against severe heat' is not something the dice can see");
ok("F10 Conceal Thoughts grants both of its numbers",
  rowsOf("conceal thoughts").find((r) => r.kind === "conditional")?.grants
    ?.map((g) => g.value).join() === "2,4");
ok("F11 scoped to Deception and to saves respectively",
  rowsOf("conceal thoughts").find((r) => r.kind === "conditional")?.grants
    ?.map((g) => (g.when.subjects ?? g.when.checkTypes).join()).join("|") === "deception|save");
ok("F12 Clarity grants advantage, not a modifier",
  rowsOf("clarity").find((r) => r.kind === "conditional")?.grants?.[0]?.kind === "advantage");
ok("F13 and IS auto, because a Mental trait is something the save knows",
  rowsOf("clarity").find((r) => r.kind === "conditional")?.grants?.[0]?.auto === true);
ok("F14 Blink's resistance is a real row in a form the parser reads",
  rowsOf("blink").some((r) => r.kind === "defence" && r.field === "resistance"
    && r.value === "all damage except force"),
  "ALL_DAMAGE_EXCEPT in defences.mjs matches exactly this wording");

// THE THREE THAT ARE HONESTLY UNAUTOMATED. A note that NAMES the gap,
// rather than one that describes the spell vaguely and leaves a GM to
// work out that nothing happened.
for (const [name, needle] of [
  ["beast of burden", /tracks no carrying capacity/],
  ["breeze strike", /nothing can yet waive them/],
  ["anticipate casting", /nothing yet carries a discount/]
]) {
  ok(`F:${name} says plainly what the system does not do`,
    rowsOf(name).some((r) => r.kind === "note" && needle.test(r.text)),
    "a gap named is a gap somebody can close");
}

/* ================================================================== *
 * G. R6, R7, R8 AND THE TWO WARPS WITH A KEY BEHIND THEM
 * ================================================================== */

ok("G1 Antimagic Field carries an antimagic row",
  rowsOf("antimagic field").some((r) => r.kind === "antimagic"));
ok("G2 and is therefore a live emanation",
  emanationIsLive(sysOf("antimagic field")) === true,
  "its 5-foot circle moves with the caster, so membership changes as people walk");
// MEASURED IN THE WORLD, NOT ASSUMED: `applyConditionTags` sets no
// `spellBuff`, so a spell-inflicted blindness is not switched off by a
// field — which is also the right reading, since a condition is a state
// the creature is in rather than magic sustained on it. The card has to
// say all three or a table finds the boundary mid-fight.
ok("G3 its card names all three things it does NOT suppress",
  rowsOf("antimagic field").some((r) => r.kind === "note"
    && /CONDITION a spell already inflicted/.test(r.text)
    && /innate magical abilities/.test(r.text)
    && /item's enchantment/.test(r.text)),
  "conditions, innate abilities and item enchantments all survive the field");
ok("G4 and says suppressed rather than ended",
  rowsOf("antimagic field").some((r) => r.kind === "note" && /SUPPRESSED, not ended/.test(r.text)));

ok("G5 Blink is sustained, and of the kind whose Sustain buys a thing",
  sysOf("blink")?.sustained === true && sysOf("blink")?.sustainType === "round",
  "a 'duration' sustain is what keeps its spell alive; Blink's minute runs regardless");
ok("G6 and it declares the blink as its Sustain's purchase",
  (sysOf("blink")?.sustainChoices ?? []).length === 1);

/*
 * A TOTAL, NOT AN INCREMENT, AND THE PAGE SETTLES IT IN ONE WORD:
 * "create an additional ball which must have a different target, you may
 * direct BOTH balls each turn." Both. Two.
 *
 * Authored as `extraTargets: 1` first, which is multiplied by `times` —
 * so the chooser would have drawn a count box a caster could keep
 * feeding, four balls and six balls as far as the PP held out.
 * `verify-warp-repeats` caught it by the option moving out of the
 * one-shot bucket, which is the entire reason that ratchet exists.
 */
ok("G7 Ball Lightning's second ball is a TOTAL of two, not a repeatable increment",
  (sysOf("ball lightning")?.warps ?? []).some((w) => w.mods?.targetCap === 2),
  "the page says BOTH balls, so the option is bought once");
// AND THE KEY IT REPLACED IS GONE. It was not, for two runs: the
// authoring script spread the old mods over the new ones, so a key
// written by an earlier run of itself survived being replaced. The
// source read correctly the whole time.
ok("G7b and the increment it replaced was actually removed",
  (sysOf("ball lightning")?.warps ?? []).every((w) => w.mods?.extraTargets === undefined),
  "block 24's stale `sizeSteps`, repeated in the file whose header cites it");
/*
 * G8 MOVED AT 3.588.0, AND ITS OLD CLAIM IS THE POINT.
 *
 * It read "the card says how to direct it, SINCE THE TURN CLOCK CANNOT"
 * — true when it was written, and a sentence that should have been a
 * standing embarrassment rather than a passing check. The note it was
 * testing told the player to cast the spell again by hand every round.
 *
 * Graham ruled the three open readings on 24 September 2026 and the
 * clock now does it: the ball is aimed at the start of each of the
 * caster's turns, a free action redirects it, and spending none strikes
 * the current target again. See verify-ball-lightning.
 *
 * The card still has to SAY the rule — automation that happens silently
 * is its own defect — so the check survives with its claim corrected,
 * and the half that is now false is asserted false.
 */
ok("G8 the card still states the free-action rule",
  rowsOf("ball lightning").some((r) => r.kind === "note" && /free action/i.test(r.text)));
ok("G8b and no longer tells the player to fire it by hand",
  !rowsOf("ball lightning").some((r) => r.kind === "note"
    && /cast the strike again|turn clock does not/i.test(r.text ?? "")),
  "an instruction printed by a system that could do the work is not automation");
ok("G8c because the turn clock now offers it",
  rowsOf("ball lightning").some((r) => r.kind === "directedStrike"),
  "the sentence this check used to end with was \"since the turn clock cannot\"");

ok("G9 Call Item's free-action warp sets a cast time outside the AP economy",
  (sysOf("call item")?.warps ?? []).some((w) => w.mods?.castApSet === "Free"));
ok("G10 and that is what 'free action' means to the cast-time rule",
  castTimeAP(warpedCastTime(1, { castApSet: "Free" })) === null,
  "null is castable in a fight and costs nothing; 0 would be a number measured against the pool");

/* ================================================================== *
 * H. R3 AND R4 — AURA OF VITALITY
 * ================================================================== */

ok("H1 its area carries the breach mark the page prints",
  /\(B\)/.test(String(sysOf("aura of vitality")?.area ?? "")),
  "functional since 3.585.0, so the spell has been failing to breach");
ok("H2 and still says emanation, which is what the machinery keys on",
  /emanation/i.test(String(sysOf("aura of vitality")?.area ?? "")),
  "the page's word is 'radius'; swapping it would fix a sentence and break the spell");
ok("H3 it is still a live emanation after the edit",
  emanationIsLive(sysOf("aura of vitality")) === true);
{
  const s = sysOf("aura of vitality") ?? {};
  const everywhere = [s.description, ...(s.effects ?? []).map((e) => e.text),
    ...(s.warps ?? []).map((w) => w.text)].join(" ");
  ok("H4 and nothing on it still says the pre-3.7 word",
    !/persistent/i.test(everywhere), "Core 3.7 renamed it to recurring");
  ok("H5 while the new word is actually there",
    /recurring/i.test(everywhere), "the negative check above passes on an empty string too");
}

/* ================================================================== *
 * N. WHAT THE LIVE DRIVE TAUGHT, so a belief cannot come back
 * ================================================================== */

ok("N1 an unnamed FAILING degree reads at the nearest rung no better",
  effectiveSaveDegree(rowsOf("blindness"), "partial") === "failure",
  "Blindness prints no Partial; a Partial is not a save and must not read at one");
ok("N2 an unnamed SAVING degree applies nothing at all",
  effectiveSaveDegree(rowsOf("blindness"), "critical") === "critical",
  "which matches no row — and that is how 'Critical: unaffected' is written");
ok("N3 a Blunder falls to the bottom printed rung",
  effectiveSaveDegree(rowsOf("blindness"), "blunder") === "fumble",
  "rolling worse than the worst printed outcome must not make you safer");
ok("N4 but not past a Blunder that IS printed",
  effectiveSaveDegree(rowsOf("bungle"), "blunder") === "blunder",
  "Bungle names it, so it keeps its own outcome rather than taking the Fumble's -4");
ok("N5 a Partial on Bungle reads at its Failure",
  effectiveSaveDegree(rowsOf("bungle"), "partial") === "failure");

{
  const src = code("tools", "author-block25-spells.mjs");
  ok("N6 the authoring script replaces the fields it owns",
    /y\.effects = \[/.test(src) && !/y\.effects\.push\(/.test(src),
    "block 24 left a stale `sizeSteps` in the pack by being idempotent in one direction only");
  ok("N7 no ladder was authored with the mechanism I nearly built",
    !/conditions:\s*\{/.test(src) && !/notes:\s*\{/.test(src),
    "the reverted saveLadder extension — two ways of saying 'on a Fumble' is two things to keep in step");
  ok("N8 and no rung is declared that its page does not print",
    !/onSave: \["partial"\]/.test(src),
    "these ladders print four rungs; effectiveSaveDegree maps the other three, and authoring one overrides it with a guess");
}

/* ================================================================== */

process.stdout.write(failures.length
  ? `\nverify-chapter10-251-260: FAILED — ${failures.length} of ${checks}:\n  ${failures.join("\n  ")}\n`
  : `\nverify-chapter10-251-260: OK — ${checks} checks. Pages 251-260: the Grimoire, Anticipate Attack to Conjure Eternal.\n`);
process.exit(failures.length ? 1 : 0);
