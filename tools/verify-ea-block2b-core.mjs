#!/usr/bin/env node
/**
 * verify-ea-block2b-core — TRG Prime 3.679.0: the seams Eldritch Arts'
 * Block 2b (Chapter 7's mundane rituals, summoning circles and true names;
 * Chapter 4's Spell Trickery and Borrow Spell) needs, from the Block 2 audit
 * (docs/ELDRITCH_ARTS_BLOCK2_AUDIT.md in the module) and Graham's rulings
 * (M30; Q5, Q8; Q9–Q14 as proposed on 2 November 2026).
 *
 *   R   a ritual's rules from a sourcebook: its other ways to pay, its
 *       fields, its DC rows, check rows and seats, its cap lifted
 *   RW  the ritual, refused like a casting, its check moved by the gates
 *       and High Magic, and a variant's PP substituted, not drawn
 *   O   a casting option a module offers: offered, ticked or required,
 *       applied to the casting DC, the Save DC and the card
 *   H   the helpers: a purse, the DC to learn a spell, a book caster
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

const api = await imp("module-api.mjs");
const rr = await imp("magic/ritual-rules.mjs");
const co = await imp("magic/cast-options.mjs");
const cdc = await imp("magic/casting-dc.mjs");
const sys = JSON.parse(read("system.json"));
const cw = read("module", "magic", "cast-workflow.mjs");
const apw = read("module", "module-api-workflow.mjs");
const quiet = (fn) => async (...a) => { const e = console.error; console.error = () => {}; try { return await fn(...a); } finally { console.error = e; } };

/* R — a ritual's rules */
{
  api.resetModuleRegistry();
  ok("R a rules spec with no function is refused", api.registerRitualRules("x", {}) === false);
  ok("R …nor one with a field that is not a function", api.registerRitualRules("x", { variants: () => [], prepare: 3 }) === false);
  ok("R …nor one with no key", api.registerRitualRules("", { liftsCap: () => true }) === false);
  equal("R nothing registered: no variants, no fields, nothing prepared, the cap stands",
    [await rr.ritualVariantsFor({}), await rr.ritualFieldsFor({}), await rr.prepareRitual({ variant: "" }), await rr.ritualCapLifted({})],
    [[], "", { variant: "", dc: null, skill: null, dcRows: [], modifiers: [], seats: 0, lines: [], refused: "" }, false]);

  api.registerRitualRules("EA", {
    variants: ({ actor }) => (actor?.trained ? [{ key: "vital", label: "Vital sacrifice", hint: "1d8 essence per PP" }, { key: "", label: "nameless" }, { key: "material", label: "" }] : []),
    fields: () => "<p>EA</p>",
    prepare: ({ variant, form }) => ({
      ...(variant ? { dc: { value: 24, label: "Level DC, Very Hard" }, skill: { key: "arcana", label: "Arcana" } } : {}),
      dcRows: [{ label: "Ritual Censor", value: -1 }, { label: "nothing", value: 0 }, { label: "", value: 3 }],
      modifiers: [{ label: "Runestone Chalkboard", value: 1, type: "item" }],
      seats: form?.experts ?? 0,
      lines: ["EA's line", "  "],
      ...(form?.refuse ? { refused: "the purse is short" } : {})
    }),
    liftsCap: ({ spell }) => spell?.ritualTrait === true
  }, "trg-eldritch-arts");
  api.registerRitualRules("other", { prepare: ({ variant }) => ({ dc: { value: 99, label: "theirs" }, skill: { key: "x" }, dcRows: [{ label: "Other", value: 2 }], variant }) });
  api.registerRitualRules("boom", { variants: () => { throw new Error("x"); }, fields: () => { throw new Error("x"); }, liftsCap: () => { throw new Error("x"); } });

  equal("R a module's variants are offered, keyed by its own name; a nameless or unlabelled one is not; a failing module costs only its own",
    await quiet(rr.ritualVariantsFor)({ actor: { trained: true } }), [{ key: "ea:vital", label: "Vital sacrifice", hint: "1d8 essence per PP" }]);
  equal("R …and none for an untrained primary", await quiet(rr.ritualVariantsFor)({ actor: {} }), []);
  equal("R fields are joined", await quiet(rr.ritualFieldsFor)({}), "<p>EA</p>");

  const plain = await rr.prepareRitual({ variant: "", form: {} });
  equal("R paying PP: every module's rows, no DC or skill of its own (another module's DC is not taken)",
    plain, { variant: "", dc: null, skill: null, dcRows: [{ label: "Ritual Censor", value: -1 }, { label: "Other", value: 2 }], modifiers: [{ label: "Runestone Chalkboard", value: 1, type: "item" }], seats: 0, lines: ["EA's line"], refused: "" });
  const vital = await rr.prepareRitual({ variant: "ea:vital", form: { experts: 2 } });
  equal("R the chosen variant's own rules set the DC and the skill; the seats are counted",
    [vital.variant, vital.dc, vital.skill, vital.seats], ["ea:vital", { value: 24, label: "Level DC, Very Hard" }, { key: "arcana", label: "Arcana" }, 2]);
  equal("R a refusal is said", (await rr.prepareRitual({ variant: "", form: { refuse: true } })).refused, "the purse is short");
  equal("R a variant nobody owns any more is refused, not paid for free", (await rr.prepareRitual({ variant: "gone:vital" })).refused, "the way of paying chosen (gone:vital) is no longer offered");
  api.resetModuleRegistry();
  api.registerRitualRules("half", { variants: () => [{ key: "v", label: "Half" }], prepare: () => ({ dc: { value: 20 } }) });
  equal("R a variant that gives no skill is refused", (await rr.prepareRitual({ variant: "half:v" })).refused, "the ritual variant gave no check to roll");
  api.resetModuleRegistry();
  api.registerRitualRules("owner", { prepare: () => { throw new Error("x"); } });
  api.registerRitualRules("bystander", { prepare: () => { throw new Error("x"); } });
  const failed = await quiet(rr.prepareRitual)({ variant: "owner:v" });
  equal("R a failing owner refuses the ritual; a failing bystander only says so",
    [failed.refused, failed.lines.length], ["the ritual's rules failed (see the console)", 2]);
  api.resetModuleRegistry();
  api.registerRitualRules("boom", { liftsCap: () => { throw new Error("x"); } });
  api.registerRitualRules("vague", { liftsCap: () => "yes" });
  api.registerRitualRules("EA", { liftsCap: ({ spell }) => spell?.ritualTrait === true });
  equal("R M30: the cap is lifted only when a module says so (true, not truthy); a failing module does not lift it",
    [await quiet(rr.ritualCapLifted)({ spell: { ritualTrait: true } }), await quiet(rr.ritualCapLifted)({ spell: {} })], [true, false]);
  equal("R a ritual casts on Success, and on better only when the cap allowed it", ["heroic", "critical", "success", "partial", "failure"].map(rr.ritualCasts), [true, true, true, false, false]);
  api.resetModuleRegistry();
}

/* RW — the ritual, wired */
{
  const ritualFn = cw.slice(cw.indexOf("export async function rollMagicRitual("));
  ok("RW the ritual is refused like a casting, before its dialog",
    /const ritualRefused = await castRefusalFrom\(\{ actor, spell, spellData, innate: false, itemCast: false, ritual: true \}\);\n\s*if \(ritualRefused\) \{\n\s*ui\.notifications\.warn\(ritualRefused\);\n\s*return null;/.test(ritualFn)
    && ritualFn.indexOf("const ritualRefused") < ritualFn.indexOf("DialogV2.wait("));
  ok("RW the dialog offers the variants and the fields",
    /\$\{ritualVariants\.length \? `<hr><div class="form-group">/.test(ritualFn) && /<select id="trg-ritual-variant" name="ritualVariant">/.test(ritualFn) && /\$\{ritualFields\}/.test(ritualFn));
  ok("RW the plan is made before the seats are counted, and a refusal stops it",
    /const ritualPlan = await prepareRitual\(\{\n\s*\.\.\.ritualContext, form: result, variant: String\(result\.ritualVariant \?\? ""\),/.test(ritualFn)
    && /if \(ritualPlan\.refused\) \{\n\s*ui\.notifications\.warn\(`\$\{spell\.name\}: \$\{ritualPlan\.refused\}`\);\n\s*return null;/.test(ritualFn)
    && /const secondaryCount = degrees\.length \+ ritualPlan\.seats;\n\s*const overcastLimit = magicRitualOvercastLimit\(secondaryCount\);/.test(ritualFn)
    && ritualFn.indexOf("const ritualPlan = ") < ritualFn.indexOf("if (!secondaryCount) {"));
  ok("RW the DC: the variant's base or the casting DC, the core's modifiers (Q5), High Magic's Hard (Q14) and the rows",
    /const ritualBase = ritualPlan\.dc \? ritualPlan\.dc\.value : castingDC\(basePP\);/.test(ritualFn)
    && /\.\.\.\(highMagicCastingDCStep\(hmCast\) \? \[\{ label: "High Magic, Hard", value: highMagicCastingDCStep\(hmCast\) \}\] : \[\]\),\n\s*\.\.\.ritualPlan\.dcRows/.test(ritualFn)
    && /const dc = ritualBase \+ dcModifiers \+ ritualDCRows\.reduce\(\(sum, row\) => sum \+ row\.value, 0\);/.test(ritualFn));
  ok("RW the variant's tradition skill is rolled in place of Spellcraft",
    /const modifiers = ritualPlan\.skill\n\s*\? \[\.\.\.\(ritualSkill\?\.checkModifiers/.test(ritualFn)
    && /\.\.\.\(ritualPlan\.skill \? \{ type: "skill", subject: ritualPlan\.skill\.key \} : \{ type: "spellcraft" \}\),/.test(ritualFn)
    && /modifiers\.push\(\.\.\.ritualPlan\.modifiers\);/.test(ritualFn));
  ok("RW the casting's gates reach the ritual check, once (suppression's −level, 0.3.0's gap)",
    /const ritualGated = await runSpellCheckGates\(\{\n\s*actor, spell, spellData, innate: false, itemCast: false, attack: false,\n\s*highMagic: hmCast\.highMagic, ritual: true, rollsCheck: true\n\s*\}\);\n\s*modifiers\.push\(\.\.\.ritualGated\.modifiers\);/.test(ritualFn)
    && /rollsCheck: !noCheckCantrip && !ritual\?\.check &&/.test(cw));
  ok("RW M30: a lifted cap keeps the degree, and better than Success casts",
    /const degree = capLifted \? rawDegree : capRitualDegree\(rawDegree\);\n\s*const cast = ritualCasts\(degree\);/.test(ritualFn));
  ok("RW the cast is told the variant", /ritual: \{ degree, ppOver, secondaryCount, check, variant: ritualPlan\.variant, gated: /.test(ritualFn));
  ok("RW the card carries the modules' and the gates' lines", /const lines = \[\.\.\.ritualPlan\.lines\.map\(\(text\) => line\(text\)\), \.\.\.ritualGated\.lines\.map\(\(text\) => line\(text\)\)\];/.test(ritualFn));
  ok("RW castSpell: a variant's PP are substituted; a non-caster primary is not asked to have prepared (Q10)",
    /const ritualSubstitutes = Boolean\(ritual\?\.variant\);\n\s*const ritualNonCaster = ritualSubstitutes && Number\(system\?\.magic\?\.casterLevelValue \?\? 0\) <= 0;/.test(cw)
    && /const castBlocked = ritualNonCaster \? "" : spellCastBlocked\(spell\);/.test(cw));
  ok("RW …the pool is not tested for them, nor drawn (Q11), and the cap per cast stands (Q9)",
    /if \(\(ritualSubstitutes \? 0 : totalPP\) \+ surcharge\.pp > ppPool \+ rodDraw\) \{/.test(cw)
    // RE-POINTED AT 3.684.0 (G2, G4): the pool-paid branch pays the discounted
    // outcome and may draw a module's PP source; the caster pays less the sources'.
    // RE-POINTED AT 3.684.3 (Graham, 5 November 2026): a ritual variant's
    // substituted price is lowered by Economic and Signature (`paidOutcome`).
    && /: ritualSubstitutes \? paidOutcome\.ppSpent \+ variableSuccessPP\n\s*: Math\.min\(paidOutcome\.ppSpent \+ variableSuccessPP, ppPool \+ rodDraw \+ ppSources\.total\);/.test(cw)
    && /const casterPPSpent = ritualSubstitutes \? 0 : ppSpent - rodPaid - sourcesPaid;/.test(cw)
    && /const cap = \(isSpecialist \? specialistMaxPP\(characterLevel\) : maxPPPerCast\(casterLevel\)\) \+ ritualHeadroom;/.test(cw)
    && !/ritualSubstitutes[^\n]*cap/.test(cw));
  ok("RW the settled hook says the variant and the PP the module must take",
    /ritualVariant: ritualSubstitutes \? String\(ritual\.variant\) : "", ppSubstituted: ritualSubstitutes && !castRefunded \? ppSpent : 0,/.test(cw));
  // THE REVIEW'S FIXES (2 November 2026).
  ok("RW review: a held rod is not drawn for a variant (it would pay twice)",
    /const rodSource = \(isCantrip \|\| isInnate \|\| isItemCast \|\| stored \|\| totalPP <= 0 \|\| ritualSubstitutes\)/.test(cw));
  ok("RW review: a ritual's casting is never stored", /const storingNow = !stored && !isStoringSpell && !ritual && Boolean\(readArmed\(actor\)\);/.test(cw));
  ok("RW review: the gates are asked once — the ritual's answer is handed to the cast, its lines on the ritual's card",
    /const gated = ritual\?\.gated \?\? await runSpellCheckGates\(\{/.test(cw)
    && /variant: ritualPlan\.variant, gated: \{ modifiers: ritualGated\.modifiers, lines: \[\] \} \}/.test(ritualFn)
    && /if \(check && castingOnlyTotal && !isItemCast && !isInnate\) check\.castingOnlyTotal = castingOnlyTotal;/.test(cw));
  ok("RW review: a failed ritual's cast asks nothing that could be cancelled away",
    /const ritualFailed = Boolean\(ritual\) && !\["success", "critical", "heroic"\]\.includes\(String\(ritual\.degree\)\);/.test(cw)
    && /const conditions = \(isItemCast \|\| isInnate \|\| noCheckCantrip \|\| ritualFailed\)/.test(cw));
  ok("RW review: a variant is checked before its roll — a caster's preparation (Q10), the cap and headroom (Q9)",
    /if \(ritualPlan\.variant\) \{\n\s*const leaderCL = casterLevelOf\(actor\.system \?\? \{\}\);\n\s*if \(leaderCL > 0\) \{\n\s*const blocked = spellCastBlocked\(spell\);/.test(ritualFn)
    && /const capNow = \(spellData\.specialist \? specialistMaxPP\(Number\(actor\.system\?\.identity\?\.level \?\? 0\)\) : maxPPPerCast\(leaderCL\)\) \+ ppOver;\n\s*if \(basePP > capNow\) \{/.test(ritualFn)
    && ritualFn.indexOf("const capNow") < ritualFn.indexOf("const check = await TRGCheck.roll("));
  ok("RW review: a failed ritual's cast stopped short is said",
    /if \(castResult === null && consequences\) \{\n\s*await postCard\(/.test(ritualFn));
}

/* O — casting options */
{
  api.resetModuleRegistry();
  ok("O an option needs offer and apply", api.registerCastOption("x", { offer: () => null }) === false && api.registerCastOption("", { offer: () => null, apply: () => ({}) }) === false);
  api.registerCastOption("Spell Trickery", { offer: ({ ritual }) => (ritual ? null : { label: "Spell Trickery", hint: "+2 casting DC" }), apply: () => ({ castingDC: 2, label: "Spell Trickery", lines: ["Trickery!"] }) });
  api.registerCastOption("trueName", { offer: ({ spellData }) => (/summons/i.test(spellData?.traits ?? "") ? { label: "True name" } : null), apply: () => ({ saveDC: 4, lines: ["Named."] }) });
  api.registerCastOption("circle", { offer: ({ actor }) => (actor?.circle ? { label: "Summoning circle (Critical)", required: true } : null), apply: () => ({ saveDC: 2, castingDC: 0 }) });
  api.registerCastOption("boom", { offer: () => { throw new Error("x"); }, apply: () => { throw new Error("x"); } });
  api.registerCastOption("blank", { offer: () => ({ label: " " }), apply: () => ({}) });
  const offers = await quiet(co.offeredCastOptions)({ actor: { circle: true }, spellData: { traits: "Conjuration, Summons" }, ritual: false });
  equal("O the options offered, in order; a failing or unlabelled one is not",
    offers, [{ key: "spell trickery", label: "Spell Trickery", hint: "+2 casting DC", required: false }, { key: "truename", label: "True name", hint: "", required: false }, { key: "circle", label: "Summoning circle (Critical)", hint: "", required: true }]);
  equal("O the field name is safe", co.castOptionField("spell trickery"), "castOption-spell_trickery");
  equal("O taken: the required, and the ticked", co.takenCastOptions(offers, { "castOption-truename": true }), ["truename", "circle"]);
  const applied = await quiet(co.appliedCastOptions)({}, ["spell trickery", "truename", "circle", "boom", "unknown"]);
  equal("O applied: a DC part per option, the Save DC summed, the lines; a failing apply is said; an unknown key is ignored",
    // 3.683.0 (Eldritch Arts Block 5, C14): an option's AP rides beside them,
    // none here; verify-ea-block5d-core checks one that costs some.
    // 3.684.0 (Block 6, G14): and an option's attack-only rows and one target's DC, none here.
    applied, { keys: ["spell trickery", "truename", "circle"], castingDC: [{ label: "Spell Trickery", value: 2 }], saveDC: 6, ap: 0, apParts: [], lines: ["Trickery!", "Named.", "<em>A module's casting option failed — see the console.</em>"], attackRows: [], saveDCTargets: [] });
  const dcA = cdc.assembledCastingDC({ totalPP: 4, casterLevel: 4, moduleParts: applied.castingDC });
  equal("O the casting DC names the option's part", [dcA.dc - dcA.base, dcA.parts], [2, [{ label: "Spell Trickery", value: 2 }]]);
  equal("O no parts: as before", cdc.assembledCastingDC({ totalPP: 4, casterLevel: 4 }).parts, []);
  api.resetModuleRegistry();

  ok("O the prompt offers them, a required one said and not asked",
    /const optionField = castOptions\.length/.test(cw) && /<em>\(applies\)<\/em><\/p>`/.test(cw)
    && /: check\(castOptionField\(o\.key\), /.test(cw) && /castOptions: takenCastOptions\(castOptions, form\)/.test(cw));
  ok("O only a cast that has the prompt is offered them",
    /const castOptionOffers = \(isItemCast \|\| isInnate \|\| noCheckCantrip \|\| ritualFailed\) \? \[\] : await offeredCastOptions\(castOptionContext\);/.test(cw)
    && /reagents: reagentChoices, castOptions: castOptionOffers \}\)/.test(cw));
  ok("O the Save DC joins the warp's channel; the casting DC its parts; the lines the card",
    /if \(castOptionsApplied\.saveDC\) warpMods\.saveDC = \(Number\(warpMods\.saveDC\) \|\| 0\) \+ castOptionsApplied\.saveDC;/.test(cw)
    && /moduleParts: castOptionsApplied\.castingDC/.test(cw)
    && /const lines = \[\.\.\.reagentLines, \.\.\.gateLines, \.\.\.degreeRemapLines\.map\(\(text\) => line\(text\)\), \.\.\.castOptionLines,/.test(cw));
  ok("O both hooks say the options taken; the settled one each target's save (a true name's hostility)",
    (cw.match(/castOptions: castOptionsApplied\.keys, ritualVariant: ritualSubstitutes \? String\(ritual\.variant\) : ""/g) ?? []).length === 2
    && /saveResults: \(spellSave\?\.results \?\? \[\]\)\.map\(\(r\) => \(\{ target: r\.target, degree: r\.degree, saved: Boolean\(r\.saved\) \}\)\),/.test(cw));
}

/* H — the API and the helpers */
{
  ok("H the API offers registerRitualRules and registerCastOption",
    /registerRitualRules: \(key, spec, moduleId\) => registerRitualRules\(key, spec, moduleId\),/.test(apw)
    && /registerCastOption: \(key, spec, moduleId\) => registerCastOption\(key, spec, moduleId\),/.test(apw));
  ok("H deductGold takes the purse as Learn a Spell does, and says a shortfall",
    /const out = deductCurrency\(actor\?\.system\?\.currency, gp\);\n\s*if \(out\.success\) await actor\.update\(\{ "system\.currency": out\.purse \}\);\n\s*return \{ paid: Boolean\(out\.success\), shortfallGP: Number\(out\.shortfallGP \?\? 0\) \};/.test(apw));
  ok("H learnSpellDC is the learning table's DC with the rarity raise",
    /return learnSpellCost\(spell\?\.system\?\.ppCost\)\.dc \+ rarityDCIncrease\(spell\?\.system \?\? \{\}\);/.test(apw));
  ok("H goldOf is the purse in gold, as the core counts it", /goldOf: async \(actor\) => \(await import\("\.\/items\.mjs"\)\)\.coinValueInGP\(actor\?\.system\?\.currency\),/.test(apw));
  ok("H keepsSpellbook is Learn a Spell's own test", /keepsSpellbook: async \(actor\) => \(await import\("\.\/magic\/learn-spell-workflow\.mjs"\)\)\.learnSpellEligible\(actor\),/.test(apw));
  const asw = read("module", "magic", "area-save-workflow.mjs");
  ok("H a basic save's damage may bypass every defence (vital sacrifice), the save still deciding how much",
    /export async function basicSaveHit\(\{ caster = null, target, save, dc, label, formula = "", amount = null, type, baseDamage = "", ignoreDefences = false \}\) \{/.test(asw)
    && /const packet = ignoreDefences \? \{ taken: dealt, immune: false \} : resolveAgainstDefences\(target\.system \?\? \{\}, \{/.test(asw)
    && /let dealt = Math\.floor\(base \* bs\.damageMultiplier\);/.test(asw));
  const learn = await imp("magic/learn-spell.mjs");
  equal("H the learning table the helper reads", [learn.learnSpellCost(2).dc, learn.learnSpellCost(5).dc, learn.learnSpellCost(22).dc], [20, 24, 42]);
}

/* Z — the release */
{
  const [za, zb] = String(sys.version).split(".").map(Number);
  ok("Z the system is 3.679.0 or later", za > 3 || (za === 3 && zb >= 679));
}

if (failures.length) {
  console.log(`verify-ea-block2b-core: ${checks} checks — ${failures.length} FAILED\n`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else {
  console.log(`verify-ea-block2b-core: ${checks} checks — all green.`);
}
