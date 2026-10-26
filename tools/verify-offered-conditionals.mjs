#!/usr/bin/env node
/**
 * verify-offered-conditionals — 3.667.3: a roll that opens no dialog asks its
 * matching tick-boxes in one small prompt before the dice. Graham, 23 October
 * 2026: "Please build the proposed fix".
 *
 * FOUND IN THE LIVE TEST OF INNER TEMPEST 0.4.1. A tick-box (a conditional
 * not marked `auto`) was offered only in the check dialog, which a weapon
 * attack, a Spellcraft check and a forced save never open — so Spirit
 * Stance's possession clause and Echoes Beyond, and Pillars of Faith's five
 * Spellcraft rows, were never offered. Graham's scope: weapon attacks and
 * Spellcraft ask; a forced save stays as it was.
 *
 *   A  the pure rules: which rows are asked, when, by whom, and the prompt
 *   B  the behaviour, against a stub dialog: ticked rows apply and unticked
 *      ones do not; nothing is asked when nothing matches, when Shift skipped
 *      the questions, when the dialog answered, or on another's screen; a
 *      roll made again keeps the first answer; a one-shot is spent
 *   C  wiring: the check asks beside its automatic conditionals, with the same
 *      context; Shift skips it on the sheet, on a skill action and on an
 *      attack; Alter the Thread's reroll keeps the answer
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const oc = await import(new URL("../module/dice/offered-conditionals.mjs", import.meta.url));
const cd = await import(new URL("../module/conditionals.mjs", import.meta.url));

/* A — the pure rules */
equal("A1 only the rows not marked auto are asked", oc.offeredRows([{ id: "a", auto: true }, { id: "b", auto: false }, null]).map((r) => r.id), ["b"]);
equal("A2 asked only when a row matches, the dialog has not answered, the roll is not flat, and Shift did not skip it",
  [oc.shouldOffer({ checkType: "attack", count: 1 }), oc.shouldOffer({ checkType: "attack", count: 0 }), oc.shouldOffer({ checkType: "attack", count: 1, resolved: true }), oc.shouldOffer({ checkType: "attack", count: 1, flat: true }), oc.shouldOffer({ checkType: "attack", count: 1, offer: false })],
  [true, false, false, false, false]);
// GRAHAM'S SCOPE (23 October 2026): weapon attacks and Spellcraft; a forced
// save, an initiative roll and anything else stay as they were.
equal("A2b only a weapon attack or a Spellcraft check asks", ["attack", "spellcraft", "save", "skill", "initiative", ""].map((checkType) => oc.shouldOffer({ checkType, count: 1 })), [true, true, false, false, false, false]);
equal("A3 the owner or the GM is asked, nobody else", [oc.mayAskFor({ isGM: true }), oc.mayAskFor({ isOwner: true }), oc.mayAskFor({})], [true, true, false]);
const html = oc.offeredContent({ actorName: "Kai", label: "Longsword — Attack", rows: [{ id: "r1", detail: "+1 circumstance", summary: "Spirit Stance — Attacks against a creature possessing another" }] });
ok("A4 the prompt lists each row, unticked", /<input type="checkbox" name="offered" value="r1">/.test(html) && !/checked/.test(html) && /Spirit Stance — Attacks against a creature possessing another/.test(html));
// FOUND LIVE ON 3.667.3: inside a form-group the rows were squeezed into one
// narrow grid column. Fixed in 3.667.4.
ok("A4b the rows sit in a plain block, not the form-group grid", /<div class="trg-conditional-modifiers">/.test(html) && !/form-group/.test(html));
ok("A5 …says whose roll it is, and that Shift skips it", /Kai/.test(html) && /Longsword — Attack/.test(html) && /Shift skips this question/.test(html));
ok("A6 names are escaped", !/<script>/.test(oc.offeredContent({ actorName: "<script>x</script>", rows: [] })));
equal("A7 an answer is kept to the rows offered", oc.chosenIds(["r1", "zz"], [{ id: "r1" }]), ["r1"]);

/* B — the behaviour, against a stub dialog */
const BIAS = { ADVANTAGE: "advantage", DISADVANTAGE: "disadvantage", NORMAL: "normal" };
const entry = (raw, id, kind = "item") => cd.normaliseConditional(raw, { id, name: raw.label, kind }, 0);
const SPIRIT = entry({ kind: "modifier", value: 1, type: "circumstance", label: "Spirit Stance", scope: "Against a creature possessing another — tick if the target is one", auto: false, when: { checkTypes: ["attack"] } }, "spirit");
const FLAME = entry({ kind: "modifier", value: 2, type: "circumstance", label: "Flame Within", scope: "attacks", auto: true, when: { checkTypes: ["attack"] } }, "flame");
const ECHO = entry({ kind: "advantage", label: "Echoes Beyond", scope: "A Focus check — tick it on that check", auto: false, oneShot: true, when: { checkTypes: ["attack", "spellcraft"] } }, "echo", "effect");
const STEEL = entry({ kind: "modifier", value: 2, type: "status", label: "Saves only", auto: false, when: { checkTypes: ["save"] } }, "steel");
const ENTRIES = [SPIRIT, FLAME, ECHO, STEEL];
const CONTEXT = { checkType: "attack", attackMode: "melee" };
let asked = 0; let answer = [];
let deleted = [];
globalThis.foundry = { applications: { api: { DialogV2: { wait: async () => { asked += 1; return answer; } } } } };
globalThis.game = { user: { isGM: true } };
const mkCheck = (over = {}) => ({
  label: "Unarmed Strike — Attack", type: "attack", flat: false, conditionalsResolved: false, offerConditionals: true, conditionalChoices: null,
  bias: "normal", modifiers: [],
  actor: { name: "Kai", isOwner: false, effects: { get: (id) => ({ delete: async () => { deleted.push(id); } }) } },
  ...over
});
const roll = async (check, entries = ENTRIES, context = CONTEXT) => { await oc.offerConditionalsOnRoll(check, entries, context, BIAS); return check; };

asked = 0; answer = [SPIRIT.id];
let c = await roll(mkCheck());
equal("B1 a weapon attack asks once, and the ticked row applies", [asked, c.modifiers.map((m) => [m.label, m.value, m.type])], [1, [["Spirit Stance", 1, "circumstance"]]]);
ok("B2 …the automatic row was not asked about, and the save's row was not offered", !c.modifiers.some((m) => m.label === "Flame Within" || m.label === "Saves only"));
equal("B3 the answer is kept on the check", c.conditionalChoices, [SPIRIT.id]);
asked = 0; answer = [];
c = await roll(mkCheck());
equal("B4 nothing ticked: nothing applies", [asked, c.modifiers.length, c.bias], [1, 0, "normal"]);
asked = 0; deleted = []; answer = [ECHO.id];
c = await roll(mkCheck());
equal("B5 an advantage tick-box gives advantage, and a one-shot on an effect is spent", [c.bias, deleted], ["advantage", [ECHO.sourceId]]);
asked = 0;
await roll(mkCheck(), [FLAME]);
equal("B6 nothing is asked when no tick-box matches", asked, 0);
asked = 0; c = await roll(mkCheck({ offerConditionals: false }));
equal("B7 Shift: not asked, nothing applied", [asked, c.modifiers.length], [0, 0]);
asked = 0; c = await roll(mkCheck({ conditionalsResolved: true }));
equal("B8 the dialog answered: not asked again", [asked, c.modifiers.length], [0, 0]);
asked = 0; c = await roll(mkCheck({ flat: true }));
equal("B9 a flat check: not asked", asked, 0);
globalThis.game = { user: { isGM: false } };
asked = 0; c = await roll(mkCheck());
equal("B10 another player's screen: not asked, nothing applied", [asked, c.modifiers.length], [0, 0]);
asked = 0; c = await roll(mkCheck({ actor: { ...mkCheck().actor, isOwner: true } }));
equal("B11 the owner's screen is asked", asked, 1);
globalThis.game = { user: { isGM: true } };
asked = 0; c = await roll(mkCheck({ conditionalChoices: [SPIRIT.id, "gone"] }));
equal("B12 a roll made again keeps the first answer, unasked", [asked, c.modifiers.map((m) => m.label)], [0, ["Spirit Stance"]]);
asked = 0; c = await roll(mkCheck({ type: "save" }), ENTRIES, { checkType: "save", subject: "will" });
equal("B13 a forced save is not asked, though a tick-box matches it (Graham's scope)", [asked, c.modifiers.length], [0, 0]);
asked = 0; answer = [ECHO.id]; c = await roll(mkCheck({ type: "spellcraft" }), ENTRIES, { checkType: "spellcraft" });
equal("B14 a Spellcraft check is asked, and its tick applies", [asked, c.bias], [1, "advantage"]);

/* C — wiring */
const ck = read("module", "dice", "check.mjs");
ok("C1 the check asks beside its automatic conditionals, with the same context",
  /const applied = automaticSelections\(entries, conditionalContext\);/.test(ck)
  && /const \{ offerConditionalsOnRoll \} = await import\("\.\/offered-conditionals\.mjs"\);\s*if \(!check\.previewOnly\) await offerConditionalsOnRoll\(check, entries, conditionalContext, BIAS\);/.test(ck));
// 3.672.0: not on a preview (Foretell Failure's), which asks nothing.
ok("C2 the check carries whether to ask, and an earlier answer",
  /this\.offerConditionals = config\.offerConditionals !== false;/.test(ck)
  && /this\.conditionalChoices = Array\.isArray\(config\.conditionalChoices\) \? \[\.\.\.config\.conditionalChoices\] : null;/.test(ck));
const aw = read("module", "combat", "attack-workflow.mjs");
const config = aw.slice(aw.indexOf("  const attackCheckConfig = {"), aw.indexOf("  let check = await TRGCheck.roll(attackCheckConfig);"));
ok("C3 a weapon attack asks, unless Shift", /\n    offerConditionals: !skipDialog\(event\),\n/.test(config));
ok("C4 Alter the Thread's reroll keeps the answer", /check = await TRGCheck\.roll\(\{ \.\.\.attackCheckConfig, allowConviction: false, conditionalChoices: check\.conditionalChoices \?\? \[\] \}\);/.test(aw));
ok("C5 a sheet roll skipped with Shift is not asked", /conditionalsResolved: Boolean\(situational\?\.conditionalsResolved\),\s*\/\/[^\n]*\n\s*\/\/[^\n]*\n\s*offerConditionals: !skipDialog\(event\),/.test(read("module", "sheets", "actor-sheet.mjs")));
ok("C6 …nor a skill action", /conditionalsResolved: Boolean\(situational\?\.conditionalsResolved\),\s*\/\/[^\n]*\n\s*offerConditionals: !skipDialog\(event\),/.test(read("module", "combat", "action-workflow.mjs")));

const EXPECTED = 30;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-offered-conditionals: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-offered-conditionals: ${checks} checks — all green.`);
