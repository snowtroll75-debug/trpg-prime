#!/usr/bin/env node
/**
 * verify-effect-grouping — the Effects tab shows what is acting on you.
 *
 * NEW at 3.383.0.
 *
 * THE BRIEF WAS BASED ON A PREMISE THAT MEASUREMENT INVERTED. Graham
 * asked for permanent race/class/heritage effects to be moved out of the
 * effects table into a hidden second one. They were never in it: the
 * table read `actor.effects`, and the permanent ones live on their parent
 * items and arrive by `transfer: true`. Rendering Borin Slatevein's sheet
 * showed THREE rows against SEVENTEEN effects applied.
 *
 * So the fix is the opposite of the request — show more, grouped — and
 * the collapsed group he wanted is NEW content rather than moved content.
 *
 * WHAT THIS FILE GUARDS is the grouping rule, and specifically the three
 * signals it must NOT use, each of which is the obvious choice and each
 * of which is wrong:
 *
 *   WHERE THE DOCUMENT LIVES  six effects sit on the ACTOR and come from
 *                             a feat; location alone misfiles them.
 *   DURATION                  every one of 140 effects in the world
 *                             reported as timed, Dwarf ability modifiers
 *                             included.
 *   featNote / featPassive    read by NO code anywhere, and already
 *                             disagreeing with reality on 3 of 132.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { effectDeletion, effectGroup, isMechanical } from "../module/effect-grouping.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const eff = (flags = {}, changes = []) => ({ flags: { "trg-prime": flags }, changes });
const item = (type, name = type) => ({ type, name, id: `${type}-1` });

/* ================================================================== *
 * A. The three groups
 * ================================================================== */

equal("A1 a condition is a Condition", effectGroup(eff({ condition: "stunned" })), "condition");
// …wherever it came from. A condition applied by an item is still a
// condition, not a permanent feature of the character.
equal("A2 even when it lives on an item",
  effectGroup(eff({ condition: "stunned" }), item("feat")), "condition");

for (const type of ["race", "heritage", "background", "class", "creature-type", "ability", "feat"]) {
  equal(`A3 an effect on a ${type} item is Permanent`, effectGroup(eff({}, [{ key: "x" }]), item(type)), "permanent");
}
// An effect on gear is NOT permanent — a magic sword's bonus goes away
// when you put the sword down, and belongs where a player can see it.
for (const type of ["weapon", "armour", "consumable", "spell", "wondrous"]) {
  equal(`A4 an effect on a ${type} item is Temporary`, effectGroup(eff({}, [{ key: "x" }]), item(type)), "temporary");
}

equal("A5 a spell buff on the actor is Temporary", effectGroup(eff({ spellBuff: true, castId: "c1" })), "temporary");
equal("A6 a daily-prep expiry is Temporary", effectGroup(eff({ expiresOnDailyPrep: true })), "temporary");
equal("A7 a round expiry is Temporary", effectGroup(eff({ conditionExpiresRound: 3 })), "temporary");

// THE SIX THAT WOULD OTHERWISE MISFILE. Grant workflows create these on
// the actor rather than relying on transfer, so location alone is not
// enough — this is the case the whole rule exists to get right.
equal("A8 a featSource effect on the ACTOR is Permanent", effectGroup(eff({ featSource: "Fleet Footed" })), "permanent");

// THE FALLBACK IS THE SAFE ONE. Something nobody anticipated should land
// where a player can see and undo it, not be hidden away.
equal("A9 an unrecognised effect falls back to Temporary", effectGroup(eff({}, [{ key: "x" }])), "temporary");
equal("A10 and so does a bare one", effectGroup(eff()), "temporary");
equal("A11 rubbish input does not throw", effectGroup(null), "temporary");

/* ================================================================== *
 * B. Mechanical, or merely printed
 * ================================================================== */

ok("B1 an effect with changes is mechanical", isMechanical(eff({}, [{ key: "system.x" }])));
ok("B2 an effect with none and no flags is not", !isMechanical(eff()));
// THE FOURTH ROUTE, found by chasing three effects that claimed to be
// passive and appeared inert. Dengar carries no changes and is not
// inert: `specialtyGrant` raises a specialty cap that
// `specialtyGrantCount` reads.
ok("B3 a specialtyGrant with no changes IS mechanical",
  isMechanical(eff({ specialtyGrant: { skill: "crafting", count: 1 } })),
  "this is the route that would have been reported as 'applies nothing'");
ok("B4 a condition with no changes is mechanical", isMechanical(eff({ condition: "prone" })));
ok("B5 a non-empty conditionals list is mechanical", isMechanical(eff({ conditionals: [{ value: 1 }] })));
ok("B6 an EMPTY conditionals list is not", !isMechanical(eff({ conditionals: [] })),
  "an empty list is the absence of a rule, not a rule");

// featNote and featPassive must NOT be consulted: no code reads them,
// and they already disagree with reality on three effects in the world.
ok("B7 featNote alone does not make an effect mechanical", !isMechanical(eff({ featNote: true })));
ok("B8 featPassive alone does not either", !isMechanical(eff({ featPassive: true })),
  "Dengar is flagged featPassive and changes nothing — the flag is not the fact");
ok("B9 but featPassive alongside a real route still counts",
  isMechanical(eff({ featPassive: true, specialtyGrant: { skill: "crafting", count: 1 } })));

/* ================================================================== *
 * C. What a player may delete
 * ================================================================== */

const fromItem = effectDeletion(eff({}, [{ key: "x" }]), item("race", "Dwarf"));
ok("C1 an effect from an item is NOT deletable here", fromItem.deletable === false,
  "every item-borne effect in the world is transfer:true — the actor cannot delete it");
ok("C2 and the row names the item to open instead", /Dwarf/.test(fromItem.reason));
ok("C3 with no warning, because there is nothing to warn about", fromItem.warn === false);

const granted = effectDeletion(eff({ grantedBy: { sourceName: "Familiar" } }));
ok("C4 a granted effect on the actor IS deletable", granted.deletable);
ok("C5 but warns first", granted.warn === true,
  "whether re-running grants restores it is not obvious to whoever clicks");
ok("C6 and the warning says why", /may not come back/.test(granted.reason));
// NAMING THE SOURCE (3.383.2). Watching a real row showed the warning
// saying "something you hold" while the something — Borin's Alteration
// wizard school — sat on the same sheet. A warning a player cannot act
// on is only half a warning.
const namedWarn = effectDeletion(eff({ featSource: "abc" }), null, "Alteration");
ok("C6b the warning names the source when one is known",
  /granted by Alteration/.test(namedWarn.reason));
ok("C6c and falls back gracefully when it is not",
  /something you hold/.test(effectDeletion(eff({ featSource: "abc" }), null, null).reason));
ok("C6d a blank name is treated as no name, not printed",
  !/granted by \./.test(effectDeletion(eff({ featSource: "abc" }), null, "   ").reason));
ok("C7 a featSource effect warns too", effectDeletion(eff({ featSource: "Fleet" })).warn === true);

const plain = effectDeletion(eff({}, [{ key: "x" }]));
ok("C8 an ordinary actor effect deletes without ceremony", plain.deletable && !plain.warn);
ok("C9 and offers no reason, because none is needed", plain.reason === null);

/* ================================================================== *
 * D. The wiring
 * ================================================================== */

const sheetSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "module/sheets/actor-sheet.mjs"), "utf8");
const tplSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "templates/actor/actor-sheet.hbs"), "utf8");
const rowSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "templates/actor/effect-row.hbs"), "utf8");
const bootSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "scripts/trg-prime.mjs"), "utf8");
const cssSrc = fs.readFileSync(path.join(SYSTEM_ROOT, "styles/trg-prime.css"), "utf8");

// THE WHOLE POINT: the tab must walk the ITEMS, not just the actor.
ok("D1 the sheet reads effects off owned items too",
  /for \(const item of actor\.items \?\? \[\]\) \{\s*\n\s*for \(const effect of item\.effects \?\? \[\]\) \{/.test(sheetSrc),
  "reading actor.effects alone is the defect — three rows against seventeen effects");
ok("D2 and groups them through the shared rule",
  /groups\[effectGroup\(effect, item\)\]/.test(sheetSrc) && /groups\[effectGroup\(effect, null\)\]/.test(sheetSrc),
  "two grouping decisions would drift; there is one function");
ok("D3 notes are split from mechanics",
  /mechanical: rows\.filter\(\(r\) => r\.mechanical\)/.test(sheetSrc),
  "74 of 132 item effects change nothing — listing them beside modifiers helps nobody");
// BOTH HALVES, because either alone is a string that survives the other
// being deleted. A mutation that removed only the WRITE left the READ in
// place and walked through the first version of this check.
ok("D4 the permanent group's open state survives a re-render", (() => {
  const written = /this\._permanentEffectsExpanded = expanded;/.test(sheetSrc);
  const read = /context\.permanentEffectsExpanded = this\._permanentEffectsExpanded/.test(sheetSrc);
  return written && read;
})(), "submitOnChange re-renders on every edit; without both halves the panel snaps shut");

// ONE ROW MARKUP, THREE PLACES. Duplicating ~66 lines three times is how
// the three tables drift apart.
// Matched loosely enough to survive the hash arguments the invocation
// now carries — the earlier pattern demanded `}}` immediately after the
// path and went red the moment `effect=this` was added, which is a check
// failing on the fix rather than on a fault.
const partialUses = (tplSrc.match(/\{\{> "systems\/trg-prime\/templates\/actor\/effect-row\.hbs"[^}]*\}\}/g) ?? []).length;
ok("D5 the row markup is a partial, used in every group", partialUses >= 4, `used ${partialUses} times`);
// AND EACH GROUP ITERATES A COLLECTION THE SHEET ACTUALLY BUILDS. Counting
// partial uses proves the markup is shared, not that any of it is fed —
// a mutation that pointed a loop at `effectGroups.permanent.nothing`
// rendered an empty table and kept the count identical.
for (const collection of [
  "effectGroups.conditions.mechanical",
  "effectGroups.temporary.mechanical",
  "effectGroups.temporary.notes",
  "effectGroups.permanent.mechanical",
  "effectGroups.permanent.notes"
]) {
  ok(`D5b the template iterates ${collection}`,
    tplSrc.includes(`{{#each ${collection} as |effect|}}`),
    "a loop over a collection the sheet never builds renders nothing, silently");
  const leaf = collection.split(".").slice(-2).join(".");
  ok(`D5c and the sheet builds ${leaf}`,
    /context\.effectGroups = \{/.test(sheetSrc) && /conditions: split\(groups\.condition\)/.test(sheetSrc));
}
ok("D6 and the partial is preloaded", /templates\/actor\/effect-row\.hbs/.test(bootSrc),
  "an unregistered partial renders as nothing at all");
// THE PARTIAL'S CONTEXT, and the defect this check exists because of.
// A partial invoked bare receives the CURRENT context — inside
// `{{#each … as |effect|}}` that is the effect itself, so every
// `{{effect.name}}` inside the partial resolved to nothing and every
// `{{#if effect.deletable}}` was false. Sixteen blank rows, all showing
// the wrong control, with the whole harness green: source checks cannot
// see a render. Caught by opening the sheet.
//
// So: if the partial addresses its fields through an `effect.` prefix,
// every invocation must PASS one.
const usesPrefix = /\{\{effect\.[a-zA-Z]/.test(rowSrc);
const invocations = tplSrc.match(/\{\{> "systems\/trg-prime\/templates\/actor\/effect-row\.hbs"[^}]*\}\}/g) ?? [];
ok("D6b the partial's context matches how it is invoked",
  !usesPrefix || invocations.every((i) => /effect=/.test(i)),
  `partial uses an effect. prefix; ${invocations.filter((i) => !/effect=/.test(i)).length} invocation(s) pass no effect=`);
ok("D6c and every invocation was found", invocations.length >= 4, `found ${invocations.length}`);
ok("D7 the partial reaches editable through @root",
  /@root\.editable/.test(rowSrc),
  "../editable resolves to the wrong context inside a partial");

ok("D8 a non-deletable row offers its item instead of a bin",
  /data-action="effectGoToItem"/.test(rowSrc));
ok("D9 and the sheet can act on that",
  /static effectGoToItem\(event, target\)/.test(sheetSrc));
ok("D10 a warned deletion carries its reason to the dialog",
  /const warning = target\.dataset\.warn/.test(sheetSrc));
ok("D10b and the sheet resolves the granting item so it can be named",
  /const sourceId = flags\.featSource \?\? flags\.grantedBy\?\.sourceId \?\? null;/.test(sheetSrc)
  && /actor\.items\.get\(sourceId\)\?\.name/.test(sheetSrc),
  "the warning is only useful if it names something the player can find");

ok("D11 the permanent group collapses by CSS, like the attributes panel",
  /\.permanent-effects \.permanent-effects-body \{\s*\n\s*display: none;/.test(cssSrc)
  && /\.permanent-effects\.expanded \.permanent-effects-body \{\s*\n\s*display: block;/.test(cssSrc),
  "without the CSS the 'collapsed' group is simply always open");
ok("D12 and the toggle copies the existing idiom rather than inventing one",
  /togglePermanentEffects\(event, target\)/.test(sheetSrc)
  && /card\.classList\.toggle\("expanded", expanded\)/.test(sheetSrc));

/* ------------------------------------------------------------------ */

if (failures.length) {
  process.stderr.write(`\nverify-effect-grouping: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-effect-grouping: OK — ${checks} checks.\n`);
