#!/usr/bin/env node
/**
 * verify-held-bonus — a bonus granted now and spent later.
 *
 * NEW at 3.411.0. Guidance was built at 3.400.0 as a bespoke marker with
 * its own card button; four PP 1 spells then turned out to share its
 * shape exactly. Five copies of one idea is the "two places deciding one
 * question" defect multiplied, so Guidance MOVED onto this and markers
 * went back to the one spell they were built for.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  HELD_BONUS_FLAG, normaliseHeldBonus, heldBonusMatches, heldBonusModifier,
  heldBonusButtonLabel, heldBonusResult, HELD_KINDS, isHeldDie,
  heldAdvantageOutcome, heldDieModifier, heldBonusCastLine
} from "../module/magic/held-bonus.mjs";

let checks = 0;
const failures = [];
const ok = (l, c, d = "") => { checks += 1; if (!c) failures.push(`${l}${d ? ` — ${d}` : ""}`); };

const GUIDANCE = { label: "Guidance", value: 1, bonusType: "status",
  checkTypes: ["attack", "save", "skill"], immunitySeconds: 3600 };

/* A. Validation */
ok("A1 a well-formed spec survives", Boolean(normaliseHeldBonus(GUIDANCE)));
ok("A2 an unscoped one is refused", normaliseHeldBonus({ value: 1 }) === null,
  "one that matched every card would be offered on damage rolls and flat checks");
ok("A3 a zero bonus is refused", normaliseHeldBonus({ value: 0, checkTypes: ["attack"] }) === null,
  "a button that changes nothing");
ok("A4 a check type the cards never report is refused",
  normaliseHeldBonus({ value: 1, checkTypes: ["vibes"] }) === null,
  "a scope that can never match is a spell that silently does nothing");
ok("A5 nonsense is refused", normaliseHeldBonus(null) === null && normaliseHeldBonus("x") === null);
ok("A6 the pool defaults to status", normaliseHeldBonus({ value: 1, checkTypes: ["attack"] }).bonusType === "status");
ok("A6b the declared immunity survives normalisation",
  normaliseHeldBonus(GUIDANCE).immunitySeconds === 3600,
  "dropped here, Guidance would be re-castable the instant it was spent");
ok("A6c and a spell that declares none gets none",
  normaliseHeldBonus({ value: 1, checkTypes: ["attack"] }).immunitySeconds === 0);
ok("A7 case and padding are tolerated",
  normaliseHeldBonus({ value: 1, checkTypes: [" Attack "] }).checkTypes[0] === "attack");

/* B. Scope */
{
  const g = normaliseHeldBonus(GUIDANCE);
  ok("B1 it reaches every type it names",
    heldBonusMatches(g, { type: "attack" }) && heldBonusMatches(g, { type: "save", subject: "will" })
    && heldBonusMatches(g, { type: "skill", subject: "stealth" }));
  ok("B2 and none it does not", !heldBonusMatches(g, { type: "damage" })
    && !heldBonusMatches(g, { type: "flat" }));

  const boost = normaliseHeldBonus({ label: "Physical Boost", value: 1, checkTypes: ["attribute"],
    subjects: ["strength", "dexterity", "constitution"] });
  ok("B3 a subject narrows it", heldBonusMatches(boost, { type: "attribute", subject: "strength" })
    && !heldBonusMatches(boost, { type: "attribute", subject: "intelligence" }));
  ok("B4 and the type still has to match",
    !heldBonusMatches(boost, { type: "skill", subject: "strength" }));

  const scoped = normaliseHeldBonus({ value: 1, checkTypes: ["skill"], actions: ["recallKnowledge"] });
  ok("B5 an action narrows it too",
    heldBonusMatches(scoped, { type: "skill", subject: "arcana", actionKey: "recallKnowledge" })
    && !heldBonusMatches(scoped, { type: "skill", subject: "arcana", actionKey: "subsist" }));
  ok("B6 an undeclared axis is ignored, not required",
    heldBonusMatches(g, { type: "skill" }), "Guidance names no subject and reaches every skill");
  ok("B7 a missing spec matches nothing", heldBonusMatches(null, { type: "attack" }) === false);
}

/* C. What it adds, and what it says */
ok("C1 the modifier carries value and pool",
  JSON.stringify(heldBonusModifier(normaliseHeldBonus(GUIDANCE)))
    === JSON.stringify({ label: "Guidance", value: 1, type: "status" }));
ok("C2 the button names it and its worth",
  heldBonusButtonLabel(normaliseHeldBonus(GUIDANCE)) === "Guidance — +1 (free)");
ok("C2b a penalty reads as one",
  heldBonusButtonLabel(normaliseHeldBonus({ label: "Curse", value: -2, checkTypes: ["attack"] }))
    === "Curse — -2 (free)");

// C3: A BONUS THAT MOVES NOTHING MUST SAY SO. Appendix 1 pools status
// bonuses highest-wins, so a second +1 changes no total.
ok("C3 a bonus that does not move the total is reported honestly",
  heldBonusResult({ total: 20, dc: 18, gain: 0 }).applied === false);
ok("C3b one that does is too", heldBonusResult({ total: 20, dc: 18, gain: 1 }).applied === true);
ok("C4 and a turned check is named",
  heldBonusResult({ total: 17, dc: 18, gain: 1 }).turnedAside === true);
ok("C4b but not when it already succeeded",
  heldBonusResult({ total: 19, dc: 18, gain: 1 }).turnedAside === false);
ok("C5 a check with no DC has none to turn",
  heldBonusResult({ total: 12, dc: null, gain: 1 }).turnedAside === false);

/* D. The pack */
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const spells = new Map();
  try {
    for await (const [key, value] of db.iterator()) {
      if (key.startsWith("!items!") && value?.type === "spell") {
        spells.set(String(value.name).trim().toLowerCase(), value);
      }
    }
  } finally { await db.close(); }

  let wired = 0;
  for (const spell of spells.values()) {
    for (const effect of spell.system?.effects ?? []) {
      if (effect.kind !== "heldBonus") continue;
      wired += 1;
      ok(`D1 "${spell.name}" declares a valid held bonus`,
        Boolean(normaliseHeldBonus(effect)), JSON.stringify(effect));
    }
  }
  // A COUNT THAT MAY ONLY GROW, and only when this line is edited on
  // purpose. Five at 3.411.0 (Guidance migrated, plus Learned Council,
  // Weapon Surge, Wizard Strike, Physical Boost); nine at 3.413.0, the
  // four added being Loremasters Edge, Revelation Divine, Moment Of
  // Fortune and Inspiration. It caught this release's own pack change,
  // which is the entire point of writing the number down.
  //
  // TWELVE AT 3.504.0: Prescience, Divine Grace and Spirit Lore, all
  // three of which print "your next <check>" and had been carrying
  // `effects: []`. D1 caught them the same day, because the rows I first
  // wrote named their scope in a `scope` STRING this file has never read
  // — they normalised to null and would have applied and then offered no
  // button, exactly the 3.413.0 defect this check was written for.
  // THIRTEEN AT 3.612.0 (block 34's R8): Inspire Heroics — an advantage held
  // on the composition's membership and spent once each round (`perRound`).
  ok("D2 the wired count is the declared one", wired === 13,
    `${wired} wired, expected 13 — if this grew, say which spells and raise it here`);

  // AND THE THREE PAYLOADS ARE ALL REPRESENTED IN THE PACK. A kind the
  // code implements and no spell uses is a mechanism nobody is testing.
  const kinds = new Set();
  for (const spell of spells.values()) {
    for (const effect of spell.system?.effects ?? []) {
      if (effect.kind !== "heldBonus") continue;
      kinds.add(normaliseHeldBonus(effect)?.kind);
    }
  }
  ok("D2b every held kind the code implements is used by a spell",
    HELD_KINDS.every((k) => kinds.has(k)),
    `pack uses: ${[...kinds].join(", ")}`);

  // D3: GUIDANCE KEEPS ITS PRINTED HOUR. The migration must not have
  // quietly dropped the one field that made it a marker in the first place.
  const guidance = (spells.get("guidance")?.system?.effects ?? []).find((e) => e.kind === "heldBonus");
  ok("D3 Guidance still stamps an hour's immunity", guidance?.immunitySeconds === 3600);
  ok("D3b and still says so when spent", /1 hour/i.test(String(guidance?.spentNote ?? "")));

  // D4: NO SPELL STILL USES THE OLD MARKER. Two mechanisms for one idea
  // is what this migration removed.
  let stragglers = 0;
  for (const spell of spells.values()) {
    for (const effect of spell.system?.effects ?? []) {
      if (effect.kind === "marker" && effect.marker === "guidance") stragglers += 1;
    }
  }
  ok("D4 no spell still applies a guidance marker", stragglers === 0);
}

/* E. The wiring */
{
  const fx = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs"), "utf8");
  ok("E1 the applier handles the kind", /case "heldBonus": \{/.test(fx));
  // E2 MUST NAME THE GUARD, NOT THE MESSAGE. It first read
  // `/malformed held bonus/` and a mutation gutting the `if (!spec)`
  // around it survived, because the STRING was still in the file. That
  // is the second time this session a check has been satisfied by
  // spelling rather than behaviour.
  ok("E2 and refuses a malformed one loudly",
    // `authored` since 3.611.0: the normalised row, warped into `spec` below.
    /const authored = normaliseHeldBonus\(effect\);\s*\n\s*if \(!authored\) \{[\s\S]{0,160}malformed held bonus/.test(fx),
    "silence would be a spell that grants nothing");

  const ix = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs"), "utf8");
  ok("E3 the card offers them", /maybeAddHeldBonuses/.test(ix));
  ok("E4 scoped by the card it is on", /heldBonusMatches\(spec, raw\)/.test(ix));
  ok("E5 one button per held bonus, keyed by effect",
    /held-bonus-\$\{effect\.id\}/.test(ix),
    "a character holding two must choose, not have the engine pick");
  // E6: SPENT BY SPENDING, not by asking first. The effect can be
  // consumed on another card between this one drawing and the click.
  ok("E6 it spends rather than checking then spending",
    /const spent = await spendHeldBonus\(roller, effect\.id\)/.test(ix));

  const check = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "dice", "check.mjs"), "utf8");
  ok("E7 the card carries the action it was rolled from",
    /actionKey: this\.actionKey/.test(check),
    "without it an action-scoped held bonus silently never matches");
}

/* ================================================================== *
 * F. THREE PAYLOADS (3.413.0) — modifier, advantage, die
 * ================================================================== */

const spec = (extra) => normaliseHeldBonus({
  kind: "heldBonus", label: "T", checkTypes: ["skill"], ...extra
});

// F1 IS THE ONE THAT NEARLY SHIPPED BROKEN. This function is handed the
// WHOLE pack effect row, whose own `kind` is already "heldBonus" — the
// word that routed it here. Reading `kind` for the payload would refuse
// every existing entry at once: Guidance, Learned Council, Physical
// Boost, Weapon Surge, Wizard Strike. The payload is `heldKind`.
ok("F1 a row whose kind is heldBonus still normalises",
  spec({ value: 1 })?.kind === "modifier",
  "reading raw.kind here would silently break all five shipped entries");
ok("F2 an entry with no heldKind is a modifier, unchanged",
  spec({ value: 2 })?.value === 2);
ok("F3 the three kinds are declared", HELD_KINDS.length === 3
  && ["modifier", "advantage", "die"].every((k) => HELD_KINDS.includes(k)));
ok("F4 an unknown heldKind is refused", spec({ heldKind: "wish", value: 1 }) === null,
  "a button whose click does nothing is worse than a spell that refuses to load");

// ADVANTAGE NEEDS NO VALUE, and demanding one would be inference.
ok("F5 advantage normalises without a value",
  spec({ heldKind: "advantage" })?.kind === "advantage");
ok("F6 a modifier with no value is still refused", spec({}) === null);
ok("F7 a modifier of zero is still refused", spec({ value: 0 }) === null);

// A DIE NEEDS A FORMULA THIS SYSTEM WILL ROLL.
ok("F8 a die normalises with a formula", spec({ heldKind: "die", die: "1d6" })?.die === "1d6");
ok("F9 a die with no formula is refused", spec({ heldKind: "die" }) === null);
ok("F10 a formula the roller would choke on is refused",
  spec({ heldKind: "die", die: "1d6+1" }) === null,
  "better to refuse at build time than roll something nobody checked");
ok("F11 the die test accepts plain formulas and rejects the rest",
  isHeldDie("1d6") && isHeldDie("2d10") && !isHeldDie("d6") && !isHeldDie("") && !isHeldDie("1d6+1"));

// THE BUTTON MUST SAY WHAT IT DOES — the three read very differently to
// a player deciding whether to spend.
ok("F12 a modifier button names its number",
  heldBonusButtonLabel(spec({ value: 1 })).includes("+1"));
ok("F13 an advantage button does not claim a number",
  !/\+0/.test(heldBonusButtonLabel(spec({ heldKind: "advantage" }))),
  "'+0 (free)' is a card describing behaviour it does not have");
ok("F14 an advantage button says it rerolls",
  /roll again/i.test(heldBonusButtonLabel(spec({ heldKind: "advantage" }))));
ok("F15 a die button names its die",
  heldBonusButtonLabel(spec({ heldKind: "die", die: "1d6" })).includes("1d6"));

// THE CAST LINE, same rule.
ok("F16 the cast line does not announce +0 for advantage",
  !/\+0/.test(heldBonusCastLine(spec({ heldKind: "advantage" })))
  && /advantage/i.test(heldBonusCastLine(spec({ heldKind: "advantage" }))));
ok("F17 the cast line names the die", /1d6/.test(heldBonusCastLine(spec({ heldKind: "die", die: "1d6" }))));
ok("F18 the cast line still reports a modifier",
  /\+1/.test(heldBonusCastLine(spec({ value: 1 }))));

/*
 * F19 THE CAST LINE NAMED ONLY THE CHECK TYPE. Found live at 3.505.0 on
 * Spirit Lore's own card: "+4 status to one skill check", for a spell
 * that raises exactly ONE action. Loremasters Edge, Revelation Divine and
 * Physical Boost had printed the same too-wide sentence since 3.413.0 —
 * three spells, and nothing said so, because F16-F18 asked only about the
 * NUMBER and the payload kind.
 *
 * The axes had to keep their declared case to be nameable at all: they
 * were lower-cased on the way in, so `recallKnowledge` arrived here as
 * `recallknowledge` with no word boundary left to find.
 */
const rk = spec({ value: 4, bonusType: "status", checkTypes: ["skill"], actions: ["recallKnowledge"] });
ok("F19 A NARROWED CAST LINE NAMES WHAT NARROWS IT",
  /Recall Knowledge/.test(heldBonusCastLine(rk)), heldBonusCastLine(rk));
const cha = spec({ value: 3, checkTypes: ["skill"], subjects: ["deception", "diplomacy", "intimidate", "perform"] });
ok("F19b and reads as a list when there are several",
  /Deception, Diplomacy, Intimidate or Perform/.test(heldBonusCastLine(cha)), heldBonusCastLine(cha));
ok("F19c an unnarrowed one gains no empty brackets",
  !/\(\)/.test(heldBonusCastLine(spec({ value: 2, checkTypes: ["attack", "save"] }))),
  heldBonusCastLine(spec({ value: 2, checkTypes: ["attack", "save"] })));
// F19d THE AXES ARE STILL MATCHED WITHOUT REGARD TO CASE, which is the
// half of this change that could have broken four live spells in silence.
ok("F19d the declared case does not break matching",
  heldBonusMatches(rk, { type: "skill", actionKey: "recallknowledge" })
  && heldBonusMatches(rk, { type: "skill", actionKey: "recallKnowledge" })
  && heldBonusMatches(rk, { type: "skill" }) === false);
ok("F19e and the stored axis is still what the row declared",
  JSON.stringify(rk.actions) === JSON.stringify(["recallKnowledge"]),
  JSON.stringify(rk.actions));

/* ---- IDEMPOTENCE: the flag stores this function's own output ---- */

// THE DEFECT LIVE TESTING FOUND. `applySpellEffects` stores the
// NORMALISED spec on the effect flag, and the card normalises it again
// on the way back out. So this function is fed its own output at least
// as often as it is fed a pack row — and the first version read only
// `heldKind`, which a normalised spec does not carry. Inspiration and
// the three advantage spells applied cleanly and then offered no button.
// Every check above fed it an authored row, so every one of them passed.
for (const authored of [
  { value: 1 },
  { heldKind: "advantage" },
  { heldKind: "die", die: "1d6", bonusType: "untyped" },
  { heldKind: "modifier", value: -2, bonusType: "circumstance" }
]) {
  const once = spec(authored);
  const twice = normaliseHeldBonus(once);
  ok(`F19 normalising ${once?.kind} twice survives the round trip`,
    Boolean(twice), "the stored flag is this function's own output");
  ok(`F20 and is unchanged by the second pass (${once?.kind})`,
    JSON.stringify(twice) === JSON.stringify(once),
    `${JSON.stringify(once)} became ${JSON.stringify(twice)}`);
}
// AND THE ROUTING WORD IS STILL NOT A PAYLOAD. Accepting `kind` on the
// way back must not make "heldBonus" itself readable as a kind.
ok("F21 the routing word is still not mistaken for a payload",
  normaliseHeldBonus({ kind: "heldBonus", label: "T", checkTypes: ["skill"], value: 1 })?.kind === "modifier");
ok("F22 an invalid payload in `kind` does not sneak through",
  normaliseHeldBonus({ kind: "wish", label: "T", checkTypes: ["skill"], value: 1 })?.kind === "modifier",
  "an unrecognised routing word falls back, it does not become a kind");

/* ---- advantage: two CHAIN totals, better wins ---- */

const adv = (o) => heldAdvantageOutcome(o);
ok("G1 a better reroll is kept",
  adv({ dieTotal: 7, rerollTotal: 15, checkTotal: 12 }).kept === 15);
ok("G2 the check total moves by the difference",
  adv({ dieTotal: 7, rerollTotal: 15, checkTotal: 12 }).after === 20);
ok("G3 a worse reroll leaves the original standing",
  adv({ dieTotal: 15, rerollTotal: 3, checkTotal: 20 }).kept === 15);
ok("G4 and the total does not move",
  adv({ dieTotal: 15, rerollTotal: 3, checkTotal: 20 }).after === 20);
// REPORTED EITHER WAY. A player who spent a spell is owed the outcome.
ok("G5 a losing reroll is reported, not hidden",
  adv({ dieTotal: 15, rerollTotal: 3, checkTotal: 20 }).improved === false
  && adv({ dieTotal: 15, rerollTotal: 3, checkTotal: 20 }).rerolled === 3);
ok("G6 a tie is not an improvement",
  adv({ dieTotal: 9, rerollTotal: 9, checkTotal: 14 }).improved === false);
ok("G7 turning a failure into a success is reported",
  adv({ dieTotal: 4, rerollTotal: 14, checkTotal: 11, dc: 18 }).turnedAside === true);
ok("G8 a check that already succeeded is not called turned",
  adv({ dieTotal: 4, rerollTotal: 14, checkTotal: 19, dc: 18 }).turnedAside === false);
// CHAINS, NOT FACES. An open-ended chain can total past 20, and
// comparing capped faces would let a worse roll win.
ok("G9 a chain total above 20 is handled",
  adv({ dieTotal: 12, rerollTotal: 34, checkTotal: 15 }).kept === 34);
ok("G10 a negative chain total is handled",
  adv({ dieTotal: -6, rerollTotal: 11, checkTotal: 2 }).kept === 11);

/* ---- die: the rolled value becomes the modifier ---- */

ok("H1 the rolled value is the modifier",
  heldDieModifier(spec({ heldKind: "die", die: "1d6" }), 4).value === 4);
ok("H2 the modifier names the die it came from",
  heldDieModifier(spec({ heldKind: "die", die: "1d6" }), 4).label.includes("1d6"));
ok("H3 a rolled 1 is still applied, not swallowed",
  heldDieModifier(spec({ heldKind: "die", die: "1d6" }), 1).value === 1);
ok("H4 the bonus type carries through",
  heldDieModifier(spec({ heldKind: "die", die: "1d6", bonusType: "untyped" }), 3).type === "untyped");

/* ---- the reroll must use the original roll's open-ended rule ---- */

{
  const check = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "dice", "check.mjs"), "utf8");
  // ANCHORED TO THE CARD FLAG, not to the phrase. `openEnded:
  // this.openEnded` also appears in the three rollChain calls, so the
  // obvious regex stayed green with the flag field deleted — the
  // mutation reported SURVIVED and was right. Matched here between the
  // two fields it sits between.
  ok("H5 the card records the open-ended rule it was rolled under",
    /dieTotal: this\.dice\.total,[\s\S]{0,600}?openEnded: this\.openEnded,[\s\S]{0,1200}?die: this\.die,[\s\S]{0,80}?modifiers: this\.modifiers/.test(check),
    "otherwise the challenger may be unable to explode when the original could");
  // THE DIE ITSELF JOINED THE FLAG AT 3.549.0, and is pinned in the same
  // breath above rather than separately: the challenger was hard-coded
  // to `1d20`, so a held advantage spent on the one d100 card in the
  // game — initiative — would have compared two numbers that are not on
  // the same scale. Same class of defect as H5's own, one field along.
  ok("H5b the reroll uses the card's own die",
    /CHAIN_PROFILES\[die\]/.test(fs.readFileSync(
      path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs"), "utf8")),
    "a d20 challenger against a d100 original loses 19 times in 20");
  const ix = fs.readFileSync(
    path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs"), "utf8");
  ok("H6 the reroll reads it back", /openEnded: updated\.openEnded/.test(ix));
  ok("H7 the reroll rolls a CHAIN, not a bare die", /rollChain\(\{/.test(ix));
  ok("H8 spending advantage replaces the die total",
    /updated\.dieTotal = outcome\.kept/.test(ix),
    "a modifier row would not be advantage");
}

process.stdout.write(`verify-held-bonus: ${checks} checks\n`);
if (failures.length) {
  process.stdout.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stdout.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
