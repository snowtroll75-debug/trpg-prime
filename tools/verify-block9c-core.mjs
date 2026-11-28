#!/usr/bin/env node
/**
 * verify-block9c-core — TRG Prime 3.690.0: the seams Eldritch Arts' Block 9c
 * (the five orbs, nine rods and five staves, and the Spellhold rune's store)
 * needs, from its audit (ELDRITCH_ARTS_BLOCK9_AUDIT.md §6) as Graham answered
 * it on 13 November 2026 ("Go with your recommendation for all questions and
 * proceed": Q185–Q210; H19–H25 approved) and on 14 November 2026 (Spellhold:
 * "Yes build it").
 *
 *   H23 a kind of charged item a module registers (the Orb): warped as a
 *       staff, no natural recharge, its own release ladder (with DC parts),
 *       Recharge Item at its own PP, and its own Charge Depletion row; a
 *       charged item's wondrous abilities and conditionals that stop with its
 *       charge (`minItemPP`), a wondrous resistance, and a Spell Adder scoped
 *       to spells with a trait
 *   H24 a casting option's Save DC for every target with a creature trait
 *       (the Rod of Soul's Echo), several rows at once; a rod's power paid
 *       through the one spend path (helpers)
 *   H25 one invested item per trait a module names (ORB)
 *   H26 held spells (Spellhold): a hold window whose cast is rolled and paid
 *       at storing and kept on a Success or better; released with the check
 *       it was stored with, its targets chosen then, its Save DC as stored
 *
 *   node tools/verify-block9c-core.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

// The workflows read `foundry.applications.api.DialogV2` as they load.
globalThis.foundry = globalThis.foundry ?? { applications: { api: { DialogV2: {} } } };

const api = await imp("module-api.mjs");
const ciw = await imp("charged-items-workflow.mjs");
const we = await imp("wondrous-effects.mjs");
const sa = await imp("magic/spell-adder.mjs");
const cond = await imp("conditionals.mjs");
const co = await imp("magic/cast-options.mjs");
const tr = await imp("trait-rules.mjs");
const miw = await imp("magic-items-workflow.mjs");
const ss = await imp("magic/spell-storing.mjs");

const ciwSrc = strip(read("module", "charged-items-workflow.mjs"));
const miwSrc = strip(read("module", "magic-items-workflow.mjs"));
const awSrc = strip(read("module", "combat", "action-workflow.mjs"));
const gsoSrc = strip(read("module", "general-skill-options-workflow.mjs"));
const actSrc = strip(read("module", "documents", "actor.mjs"));
const cw = strip(read("module", "magic", "cast-workflow.mjs"));
const ssw = strip(read("module", "magic", "spell-storing-workflow.mjs"));
const apiw = strip(read("module", "module-api-workflow.mjs"));

/* ================================================================== H23 */
api.resetModuleRegistry();
equal("H23 a core kind cannot be registered over", ["staff", "rod", "wand", "scroll", "other"].map((k) => api.registerChargedKind(k, { label: "x" })), [false, false, false, false, false]);
ok("H23 a module kind registers", api.registerChargedKind("orb", {
  label: "Orb", warp: "staff", naturalRecharge: false, rechargeItemPP: 4,
  releaseOptions: (ctx) => [
    { key: "spellcraft", label: "Spellcraft", skill: "spellcraft", difficulty: "hard", available: true, dcParts: ctx.spellTraits.includes("Highmagic") ? [{ label: "High Magic", value: 2 }] : [] },
    { key: "", label: "no key" },
    { key: "bad", label: "Bad difficulty", difficulty: "absurd", dcParts: [{ label: "", value: 0 }, { value: "3" }] }
  ],
  depletion: () => ({ replaces: true, lines: ["flare"] })
}));
const orb = api.registeredChargedKind("ORB");
equal("H23 …read back by any case: warped as a staff, no natural recharge, Recharge Item at 4 PP",
  [orb?.key, orb?.label, orb?.warp, orb?.naturalRecharge, orb?.rechargeItemPP, typeof orb?.releaseOptions, typeof orb?.depletion],
  ["orb", "Orb", "staff", false, 4, "function", "function"]);
equal("H23 …and a core kind is never registered", [api.registeredChargedKind("staff"), api.registeredChargedKind("")], [null, null]);
api.registerChargedKind("plain", {});
equal("H23 a kind with nothing said warps not at all and recharges as any item", [api.registeredChargedKind("plain").warp, api.registeredChargedKind("plain").naturalRecharge, api.registeredChargedKind("plain").rechargeItemPP], ["none", true, null]);

{
  const actor = { items: [{ type: "spell", name: "Leyline Burst", system: { traits: "Highmagic, Evocation" } }, { type: "spell", name: "Gust", system: { traits: "Air" } }] };
  const hm = await ciw.chargedKindReleaseOptions("orb", { actor, spellName: "Leyline Burst", spellPPCost: 4 });
  equal("H23 the kind's ladder: cleaned (no key dropped; an unknown difficulty is medium; zero parts dropped), the spell's traits handed in",
    hm.map((o) => [o.key, o.difficulty, o.dcParts]),
    [["spellcraft", "hard", [{ label: "High Magic", value: 2 }]], ["bad", "medium", [{ label: "Orb", value: 3 }]]]);
  const plain = await ciw.chargedKindReleaseOptions("orb", { actor, spellName: "Gust", spellPPCost: 2 });
  equal("H23 …a spell without the trait gets no High Magic part", plain[0].dcParts, []);
  equal("H23 …and a core kind, or none, answers nothing (the core's ladder stands)", [(await ciw.chargedKindReleaseOptions("staff", { actor, spellName: "Gust" })).length, (await ciw.chargedKindReleaseOptions("", { actor, spellName: "Gust" })).length], [0, 0]);
  api.registerChargedKind("boom", { releaseOptions: () => { throw new Error("boom"); } });
  const err = console.error; console.error = () => {};
  equal("H23 …a kind whose ladder throws costs only itself", (await ciw.chargedKindReleaseOptions("boom", { actor, spellName: "Gust" })).length, 0);
  console.error = err;
}
ok("H23 the release roll takes the kind's ladder in place of the core's",
  /const kindOptions = await chargedKindReleaseOptions\(chargedKind, \{\n\s*actor, item, spellName, spellPPCost: cost, spellTradition, highMagicCaster, \.\.\.context\n\s*\}\);\n\s*const options = kindOptions\.length \? kindOptions : \[/.test(ciwSrc));
ok("H23 …its DC parts join the release's DC, and are said",
  /const partsTotal = dcParts\.reduce\(\(sum, p\) => sum \+ p\.value, 0\);/.test(ciwSrc) && /dc: castingDC\(cost\) \+ partsTotal,/.test(ciwSrc));
ok("H23 Cast from Item hands the item's kind and the item to the release",
  /pp: choice\.pp,\n\s*chargedKind: charged\.kind \?\? "",\n\s*item,/.test(ciwSrc));
ok("H23 a kind that warps as a staff is warped as one (Q210)",
  /const kindSpec = registeredChargedKind\(charged\.kind\);\n\s*const warp = warpCeiling\(\{\n\s*kind: kindSpec\?\.warp === "staff" \? "staff" : charged\.kind,/.test(ciwSrc));
ok("H23 a kind that does not recharge naturally regains nothing at daily preparation, and says so",
  /if \(kindSpec && !kindSpec\.naturalRecharge\) \{\n\s*if \(current < max\) lines\.push\(/.test(ciwSrc)
  && ciwSrc.indexOf("!kindSpec.naturalRecharge") < ciwSrc.indexOf("const gain = itemRecharge(charged"));
ok("H23 Charge Depletion asks the kind, and a replacing answer stops the core's row (no break, refill, blast or dust)",
  /if \(answer\?\.replaces === true\) \{[\s\S]{0,400}?await postCard\(actor, `\$\{item\.name\} — Charge Depletion`, lines\);\n\s*return \{ roll: kept, row, replaced: true/.test(miwSrc)
  && miwSrc.indexOf("answer?.replaces === true") < miwSrc.indexOf("const hp = item?.system?.hp;"));
ok("H23 Recharge Item charges the kind's PP for its item",
  /if \(action\.key === "rechargeItem" && rechargeSetup\) \{[\s\S]{0,300}?if \(kindSpec\?\.rechargeItemPP\) \{\n\s*ppCost = kindSpec\.rechargeItemPP;/.test(awSrc));
ok("H23 …and its picker shows that price on the item's row", /kindPP: registeredChargedKind\(chargedItemData\(item\)\?\.kind\)\?\.rechargeItemPP \?\? null/.test(gsoSrc) && /\$\{r\.kindPP \? ` — costs \$\{r\.kindPP\} PP` : ""\}/.test(gsoSrc));

// Wondrous abilities that stop with the charge; a resistance; a scoped adder.
{
  const orbItem = (uses) => ({
    id: "o1", name: "Orb of Emberlight", type: "gear", system: { uses, invested: true, equipped: true },
    flags: { "trg-prime": { wondrous: { abilities: [
      { kind: "resistance", damageType: "fire", minItemPP: 3, label: "Emberlight" },
      { kind: "spellAdder", value: 1, spellTraits: ["Fire"], minItemPP: 3, label: "Emberlight" },
      { kind: "skillBonus", skill: "acrobatics", target: "system.skills.acrobatics.bonus", value: 1, bonusType: "item", label: "Ley", minItemPP: 0 }
    ] } } }
  });
  const full = we.wondrousBonusesForActor([orbItem(3)]);
  equal("H23 a charged item at 3 PP: its resistance and its scoped adder count", [full.resistances, full.spellAdders], [["fire"], [{ label: "Emberlight", value: 1, spellTraits: ["fire"] }]]);
  const low = we.wondrousBonusesForActor([orbItem(2)]);
  equal("H23 …at 2 PP they stop, and say why; an ability with no floor goes on", [low.resistances, low.spellAdders, low.bonuses.length, low.reported.filter((r) => /fewer than 3 PP/.test(r)).length], [[], [], 1, 2]);
  const rated = sa.withWondrousAdders({ sources: [{ label: "Ring", value: 1 }], total: 1, unstructured: [] }, full.spellAdders);
  equal("H23 a scoped adder keeps its scope through the pool", rated.sources.map((s) => s.spellTraits ?? null), [null, ["fire"]]);
  equal("H23 …and pays only for a spell with one of its traits",
    [sa.spellAdderFor(rated, "Fire, Evocation").total, sa.spellAdderFor(rated, "Cold").total, sa.spellAdderFor(rated, ["fire"]).total],
    [2, 1, 2]);
  equal("H23 the sheet says what a resistance and a scoped adder are", [we.describe({ kind: "resistance", damageType: "Fire" }), we.describe({ kind: "spellAdder", value: 1, spellTraits: ["fire"] })], ["Resistance to fire", "Spell Adder +1 (fire spells)"]);
}
{
  const hm = await imp("magic/high-magic.mjs");
  const adder = { kind: "spellAdder", value: 4, requiresArcaneOrHighMagicCaster: true, label: "Tesra" };
  equal("H23 an adder for an arcane or a High Magic caster: arcane, High Magic of another tradition, neither",
    [we.abilityApplies(adder, { tradition: "arcane" }), we.abilityApplies(adder, { tradition: "ethereal", highMagicCaster: true }), we.abilityApplies(adder, { tradition: "verdant" })], [true, true, false]);
  const withFlag = (flag) => ({ items: [{ type: "class", flags: { "trg-prime": { highMagicCaster: flag } } }] });
  equal("H23 a High Magic caster of every tradition or of some is one; none is not",
    [hm.isHighMagicCasterAtAll(withFlag(true)), hm.isHighMagicCasterAtAll(withFlag(["ethereal", "verdant"])), hm.isHighMagicCasterAtAll(withFlag([])), hm.isHighMagicCasterAtAll(withFlag(undefined))], [true, true, false, false]);
  ok("H23 the actor and the cast both say whether the caster is one",
    /highMagicCaster: isHighMagicCasterAtAll\(actor\)\n\s*\}\);/.test(actSrc) && /highMagicCaster: isHighMagicCasterAtAll\(actor\)\n\s*\}\)\.spellAdders/.test(cw));
}
ok("H23 the actor joins a wondrous resistance to its own",
  /if \(wondrousEffects\.resistances\?\.length && system\.combat\) \{\n\s*system\.combat\.resistances = \[String\(system\.combat\.resistances \?\? ""\), \.\.\.wondrousEffects\.resistances\]\.filter\(Boolean\)\.join\(", "\);/.test(actSrc));
ok("H23 the cast offers only the adders that pay for its spell",
  /const rated = spellAdderFor\(withWondrousAdders\(withWondrousAdders\(spellAdderSources\(actor\), wondrous\), battery\), spellData\.traits \?\? ""\);/.test(cw));
{
  const item = (uses) => ({ id: "o1", name: "Orb", type: "gear", system: { uses, equipped: true }, flags: { "trg-prime": { conditionals: [
    { kind: "modifier", value: 1, type: "item", label: "Ley lines", when: { actions: ["eaTapLeyLine"] } },
    { kind: "modifier", value: 1, type: "item", label: "Acrobatics", minItemPP: 3, when: { subjects: ["acrobatics"] } }
  ] } } });
  equal("H23 an item's conditional with a PP floor is read only at that charge; its neighbour always, ids unmoved",
    [cond.collectConditionals([item(3)]).map((e) => e.id), cond.collectConditionals([item(2)]).map((e) => e.id)],
    [["o1-0", "o1-1"], ["o1-0"]]);
}

/* ================================================================== H24 */
{
  const rows = co.castOptionTargetDCs([{ traits: ["Undead"], value: 2 }, { uuid: "Actor.a", value: 1 }, { value: 3 }, { traits: [], value: 1 }], "Soul's Echo");
  equal("H24 a Save DC row may name creature traits; a row with neither a creature nor a trait is dropped",
    rows, [{ traits: ["undead"], value: 2, label: "Soul's Echo" }, { uuid: "Actor.a", value: 1, label: "Soul's Echo" }]);
  const undead = { uuid: "Actor.z", system: { details: { creatureType: "Undead" } } };
  const living = { uuid: "Actor.a", system: { details: { creatureType: "Humanoid" } } };
  equal("H24 …matched against each target as it saves: by trait, by creature, or not at all",
    [co.castOptionDCFor(rows, undead).value, co.castOptionDCFor(rows, living).value, co.castOptionDCFor(rows, { uuid: "Actor.q", system: {} }).value, co.castOptionDCFor(rows, "Actor.a").value],
    [2, 1, 0, 1]);
  equal("H24 …one row still answers as one (Sanguine Channel's)", co.castOptionTargetDCs({ uuid: "Actor.b", value: 1 }, "Sanguine").length, 1);
}
ok("H24 the save hands the target itself to the option rows", /const targetShift = castOptionDCFor\(saveDCTargets, target \?\? ""\);/.test(cw));
ok("H24 the options' rows are taken one or several", /out\.saveDCTargets\.push\(\.\.\.castOptionTargetDCs\(got\?\.saveDCTarget, label\)\);/.test(strip(read("module", "magic", "cast-options.mjs"))));
ok("H24 a rod's power is paid through the one spend path, and a Rod's round is asked (helpers)",
  /spendFromRod: async \(actor, item, pp, opts = \{\}\) => \(await import\("\.\/charged-items-workflow\.mjs"\)\)\.spendFromRod\(actor, item, pp, opts \?\? \{\}\),/.test(apiw)
  && /rodUseRefusal: async \(actor\) => \(await import\("\.\/trait-rules-workflow\.mjs"\)\)\.rodUseRefusal\(actor\),/.test(apiw));

/* ================================================================== H25 */
api.resetModuleRegistry();
ok("H25 a trait is named", api.registerOneInvestedTraits(["Orb"]) && !api.registerOneInvestedTraits([]));
equal("H25 …read back lower-case", api.registeredOneInvestedTraits(), ["orb"]);
{
  const a = { id: "a", name: "Orb A", system: { traits: "Invested, Magical, Orb", invested: true } };
  const b = { id: "b", name: "Orb B", system: { traits: "Invested, Orb", invested: false } };
  const s = { id: "s", name: "Staff", system: { traits: "Invested, Staff", invested: true } };
  equal("H25 a second item with the trait is refused while one is invested; another trait, or none invested, is not",
    [tr.oneInvestedRefusal(b, [a, b], ["orb"]).includes("Orb A already is"), tr.oneInvestedRefusal(s, [a, s], ["orb"]), tr.oneInvestedRefusal(b, [b], ["orb"]), tr.oneInvestedRefusal(b, [a, b], [])],
    [true, "", "", ""]);
  const actor = { name: "Ava", items: [a, b], system: { magic: { investmentSlots: 3 } } };
  ok("H25 Invest Item's refusal applies it", (await miw.investRefusal(actor, b)).includes("Orb trait"));
}
// 3.693.0 (H27): a module's own refusal follows, on the next line.
ok("H25 …and Invest Item itself", /const refused = staffInvestRefusal\(item, Array\.from\(actor\.items \?\? \[\]\)\) \|\| await oneInvestedTraitRefusal\(actor, item\)\n\s*\|\| await moduleInvestRefusal\(actor, item\);/.test(miwSrc));

/* ================================================================== H26 */
{
  const r = ss.heldSpellRecord({ spellId: "s1", spellName: "Fire Bolt", pp: 4, degree: "critical", degreeLabel: "Critical", total: 23, margin: 6, natural: 17, castingOnlyTotal: 1, saveDC: 0, mods: { damageDice: 1 }, notes: ["+1d6"], attack: true });
  equal("H26 a held record keeps what the release reads",
    [r.spellId, r.pp, r.degree, r.total, r.natural, r.castingOnlyTotal, r.attack, r.mods, r.notes, typeof r.id], ["s1", 4, "critical", 23, 17, 1, true, { damageDice: 1 }, ["+1d6"], "string"]);
  {
    const k = ss.heldSpellRecord({ castOptions: ["eaSoulsEcho", ""], saveDCTargets: [{ label: "Rod", value: 2, traits: ["Undead"] }, { label: "x", value: 0, traits: ["a"] }, { label: "y", value: 1 }], attackRows: [{ label: "Channel", value: 1 }, { value: 0 }] });
    equal("H26 (review) a record keeps its options' keys and target rows, cleaned", [k.castOptions, k.saveDCTargets, k.attackRows],
      [["eaSoulsEcho"], [{ label: "Rod", value: 2, traits: ["undead"] }], [{ label: "Channel", value: 1, type: "untyped" }]]);
  }
  equal("H26 its PP add up", ss.heldUsedPP([r, ss.heldSpellRecord({ pp: 6 })]), 10);
  equal("H26 a spell must fit the store's room and the cast cap",
    [ss.holdRefusal({ capacityPP: 12, used: 4, pp: 8, cap: 9 }), /room for 8 more PP/.test(ss.holdRefusal({ capacityPP: 12, used: 4, pp: 9, cap: 9 })), /exceed the most PP/.test(ss.holdRefusal({ capacityPP: 40, used: 0, pp: 10, cap: 9 }))],
    ["", true, true]);
  const c = ss.heldCheck(r);
  equal("H26 the check it is released with: its total, degree, margin and die; no chaos; nothing rerolls it",
    [c.outcome.total, c.outcome.degree.key, c.outcome.degree.success, c.outcome.margin, c.dice.unmodified, c.dice.chaos, c.rerolledFrom, c.castingOnlyTotal],
    [23, "critical", true, 6, 17, false, "held", 1]);
}
ok("H26 castSpell takes `held`, and a held release rides the threaded path",
  /thread = null, held = null, preparedSymbol = null/.test(cw)
  && /const heldRelease = Boolean\(held\?\.degree\) && !thread\?\.degree;\n\s*if \(heldRelease\) thread = \{ degree: String\(held\.degree\), check: held\.check \?\? null, warp: held\.warp \?\? null \};\n\s*const threaded = Boolean\(thread\?\.degree\);/.test(cw));
ok("H26 …but its targets are chosen now (only a woven spell's are preset)", /const woven = threaded && !heldRelease;[\s\S]{0,200}?const presetTargets = presetTargetsGiven \|\| woven;/.test(cw));
ok("H26 …its die stands, its Save DC is the one it was stored with",
  /unmodified: heldRelease \? Math\.trunc\(Number\(thread\.check\.dice\?\.unmodified \?\? 0\)\) \|\| 0 : 0/.test(cw)
  && /const fixed = Number\(spellData\.fixedSaveDC \?\? 0\) \|\| \(heldRelease \? Math\.max\(0, Math\.trunc\(Number\(held\?\.saveDC\) \|\| 0\)\) : 0\);/.test(cw));
ok("H26 …and the hooks tell a held release from a woven one",
  (cw.match(/threaded: woven,\s*held: heldRelease,/g) ?? []).length === 4 && !/\n\s*threaded,\n/.test(cw) && !/[[{,]\s*threaded,\s+held: heldRelease/.test(cw));
ok("H26 a release is never stored again, and a hold window is read off the store's own",
  /const storingNow = !stored && !isStoringSpell && !ritual && !heldRelease && storesThisCast && Boolean\(readArmed\(actor\)\);/.test(cw)
  && /const holdArmed = storingNow \? readArmed\(actor\) : null;\n\s*const holdWindow = holdArmed\?\.hold \?\? null;\n\s*const holdingNow = Boolean\(holdWindow\);/.test(cw));
ok("H26 (review) a cast from an item, or of a spell not on the sheet, falls into no store's window",
  /const castsOwnSpell = !itemCheck && Boolean\(spell\?\.id && actor\?\.items\?\.has\?\.\(spell\.id\)\);/.test(cw));
ok("H26 a spell that does not fit is refused before anything is spent; a held cast does not take Spell Storing's exit",
  /if \(holdingNow\) \{[\s\S]{0,700}?holdRefusal\(\{ capacityPP: holdWindow\.capacityPP, used: heldUsedPP\(heldSpellsIn\(host\)\), pp: totalPP, cap,[\s\S]{0,200}?return null;/.test(cw)
  && /if \(storingNow && !holdingNow\) \{/.test(cw)
  && cw.indexOf("holdRefusal({") < cw.indexOf("await actor.update({ \"system.resources.pp.value\": Math.max(0, ppPool - totalPP) });"));
ok("H26 a held cast stops after its check, its PP and its Save DC, and before its targets resolve; kept only on a cast",
  /if \(holdingNow\) \{\n\s*const \{ disarmStoring, addHeldSpell, heldSpellsIn \} = await import\("\.\/spell-storing-workflow\.mjs"\);\n\s*const host = holdHost;\n\s*await disarmStoring\(actor\);\n\s*if \(outcome\.cast && host\) \{/.test(cw)
  && cw.indexOf("addHeldSpell(host, {") > cw.indexOf("nominalSaveDC = saveDCResult.dc;")
  && cw.indexOf("addHeldSpell(host, {") < cw.indexOf("let areaTargets = null;"));
ok("H26 (review) the host is found once, before the cast is paid for, and the spell is held there",
  /let holdHost = null;\n\s*if \(holdingNow\) \{[\s\S]{0,300}?const host = storeHostFor\(actor, holdArmed\);\n\s*holdHost = host;/.test(cw)
  && (cw.match(/storeHostFor\(/g) ?? []).length === 2);
ok("H26 (review) its options' keys and target rows are kept, and handed back at release",
  /castOptions: castOptionsApplied\.keys,\n\s*saveDCTargets: castOptionsApplied\.saveDCTargets \?\? \[\],\n\s*attackRows: castOptionsApplied\.attackRows \?\? \[\]\n\s*\}\);/.test(cw)
  && /if \(heldRelease\) \{\n\s*castOptionsApplied\.saveDCTargets\.push\(\.\.\.\(Array\.isArray\(held\?\.saveDCTargets\) \? held\.saveDCTargets : \[\]\)\);\n\s*castOptionsApplied\.attackRows\.push\(\.\.\.\(Array\.isArray\(held\?\.attackRows\) \? held\.attackRows : \[\]\)\);/.test(cw)
  && /saveDCTargets: record\.saveDCTargets,\n\s*attackRows: record\.attackRows/.test(ssw)
  && /Hooks\.callAll\("trgPrimeSpellHeld", \{ actor, spell, host, record, castOptions: \[\.\.\.castOptionsApplied\.keys\] \}\);/.test(cw));
ok("H26 (review) the cast hook of a spell being held names no targets and says `holding`",
  /targets: holdingNow && outcome\?\.cast \? \[\] : Array\.from\(game\.user\?\.targets \?\? \[\]\)/.test(cw) && /holding: Boolean\(holdingNow && outcome\?\.cast\),/.test(cw)
  && cw.indexOf("const outcome = castingOutcome(degree, {") < cw.indexOf("holding: Boolean(holdingNow && outcome?.cast),"));
ok("H26 (review) a woven or held release is offered no casting options",
  /const castOptionOffers = \(isItemCast \|\| isInnate \|\| noCheckCantrip \|\| ritualFailed \|\| threaded\) \? \[\] : await offeredCastOptions\(castOptionContext\);/.test(cw));
ok("H26 (review) Spellhold does not overwrite an open Spell Storing window",
  /const open = readArmed\(actor\);\n\s*if \(open && !open\.hold\) \{[\s\S]{0,250}?return null;/.test(ssw));
ok("H26 (review) one release of a record at a time, freed however it ends",
  /if \(RELEASING\.has\(key\)\) \{[\s\S]{0,120}?return null;\n\s*\}\n\s*RELEASING\.add\(key\);\n\s*try \{\n\s*return await releaseHeldSpellNow\([\s\S]{0,60}?\} finally \{\n\s*RELEASING\.delete\(key\);/.test(ssw));
{
  const exitAt = cw.indexOf('Hooks.callAll("trgPrimeSpellHeld"');
  const exit = cw.slice(exitAt, cw.indexOf("return { cast: false, held: true, record, ppSpent, degree };", exitAt));
  ok("H26 (ruling, 14 Nov) a held spell's cuts and PP sources apply; Spell Storing's still do not",
    /const storingUnpaid = storingNow && !holdingNow;\n\s*const costCut = \(isItemCast \|\| stored \|\| storingUnpaid \|\| threaded \|\| ritualSubstitutes\)/.test(cw)
    && /const ppSources = \(isCantrip \|\| isInnate \|\| isItemCast \|\| stored \|\| storingUnpaid \|\| threaded/.test(cw));
  ok("H26 (re-review) a lent option's round is spent when it paid for a held spell",
    /if \(lentCut\.effectIds\.length && lentRoundKey\) \{\n\s*for \(const id of lentCut\.effectIds\) \{[\s\S]{0,200}?LENT_USED_FLAG, lentRoundKey\)/.test(exit));
  ok("H26 (ruling) …settled at the hold, told `holding`", /if \(mmx\.taken\.length \|\| ppSources\.draws\.length\) \{\n\s*const settledLines = await mmxWorkflow\.settleModuleMetamagic\(actor, mmx, ppSources\.draws, \{[\s\S]{0,400}?holding: true,/.test(exit));
  ok("H26 (ruling) its Resonance is rolled at storing: chaos, a named natural, a forced one",
    /if \(chaos\) await rollResonanceEvent\(actor, \{ reason: "Chaos on the casting check", modifiers: resonanceContext \}\);/.test(exit)
    && /resonanceFace > 0 && Number\(check\?\.dice\?\.unmodified \?\? 0\) === resonanceFace/.test(exit)
    && /const forced = await forcedResonancesFrom\(\{[\s\S]{0,400}?holding: true,/.test(exit) && /for \(const event of forced\)/.test(exit));
  ok("H26 (ruling) …its context declared before the hold exit, and the release rolls no named natural",
    cw.indexOf("const resonanceContext = {") > 0 && cw.indexOf("const resonanceContext = {") < exitAt
    && (cw.match(/const resonanceContext = \{/g) ?? []).length === 1
    && /if \(resonanceFace > 0 && !heldRelease && Number\(check\?\.dice\?\.unmodified \?\? 0\) === resonanceFace\) \{/.test(cw));
}
ok("H26 …recording the check, the Save DC and the warp", /saveDC: Number\(nominalSaveDC \?\? 0\) \|\| 0,\n\s*mods: warp\.mods, notes: warp\.notes, attack: Boolean\(isAttack\),/.test(cw)
  && /total: Number\(check\?\.outcome\?\.total \?\? 0\), margin: Number\(check\?\.outcome\?\.margin \?\? 0\),/.test(cw));
ok("H26 the release asks its AP first, keeps the spell if called off, and pays the AP only once it is cast",
  /if \(!\(await ensureActionPoints\(actor, String\(ap\), what\)\)\) return null;/.test(ssw)
  && /if \(!result \|\| result\.refunded\) return null;\n(?:\s*\/\/[^\n]*\n)*\s*const left = heldSpellsIn\(host\)[^\n]*\n\s*await \(left\.length \? host\.setFlag\(SYSTEM_ID, HELD_SPELLS_FLAG, left\) : host\.unsetFlag\(SYSTEM_ID, HELD_SPELLS_FLAG\)\);\n\s*if \(String\(ap\) !== "free"\) await spendActionCost\(/.test(ssw)); // RE-ANCHORED (re-review)
{
  const body = ssw.slice(ssw.indexOf("export async function releaseHeldSpell"));
  ok("H26 …and nothing is paid before the release is known to have cast",
    (body.match(/spendActionCost\(/g) ?? []).length === 1 && body.indexOf("spendActionCost(") > body.indexOf("if (!result || result.refunded) return null;"));
}
ok("H26 (re-review) a release reads what the staff holds again once its spell is cast",
  /const left = heldSpellsIn\(host\)\.filter\(\(r\) => r\.id !== record\.id\);\n\s*await \(left\.length \? host\.setFlag\(SYSTEM_ID, HELD_SPELLS_FLAG, left\)/.test(ssw));
ok("H26 a hold window is Spell Storing's own flag, marked `hold`", /hold: \{ capacityPP: Math\.max\(0, Math\.trunc\(Number\(capacityPP\) \|\| 0\)\), label: String\(label \?\? ""\)\.trim\(\) \},/.test(ssw));
ok("H26 the helpers reach it", ["armHold", "heldSpellsIn", "releaseHeldSpell", "clearHeldSpells"].every((k) => new RegExp(`${k}: async \\(`).test(apiw)));

/* ================================================================== Z */
const sys = JSON.parse(read("system.json"));
equal("Z1 the version is 3.690.0, and the download names it", [sys.version, sys.download], ["3.720.1", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.720.1/trg-prime.zip"]);
equal("Z2 package.json agrees", JSON.parse(read("package.json")).version, "3.720.1");

if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); console.log(`verify-block9c-core: ${failures.length} failure(s) of ${checks}`); process.exit(1); }
console.log(`verify-block9c-core: all ${checks} checks pass`);
