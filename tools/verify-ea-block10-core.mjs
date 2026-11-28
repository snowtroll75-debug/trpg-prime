#!/usr/bin/env node
/**
 * verify-ea-block10-core — TRG Prime 3.693.0 and 3.694.0: Eldritch Arts Block 10's seams (H27, H28; H29 in 3.694.0),
 * approved by Graham on 15 November 2026 ("Go with your recommendations").
 *   H27. An item's investment cost (a relic's tier, a sentient item's two), a
 *        module's step before Invest Item, and a module's refusal.
 *   H28. A damage reaction that heals by a fraction of the amount it ignored
 *        (the Veilshroud: "you ignore it and instead regain HP equal to half").
 *
 *   node tools/verify-ea-block10-core.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* H27 ---------------------------------------------------------------- */
const MI = await mod("magic-items.mjs");
const relic = { name: "Relic", system: { invested: true }, tier: 3 };
const plain = { name: "Ring", system: { invested: true } };
const off = { name: "Cloak", system: { invested: false }, tier: 5 };
const fns = [(i) => (i.tier ? i.tier : null)];
equal("H27 an item's cost: the first answer, else one slot; a throwing or bad answer is no answer",
  [MI.itemInvestCost(relic, null, fns), MI.itemInvestCost(plain, null, fns), MI.itemInvestCost(plain, null, [() => { throw new Error("x"); }]), MI.itemInvestCost(plain, null, [() => "x", () => 2]), MI.itemInvestCost(plain, null, [() => 0])],
  [3, 1, 1, 2, 0]);
equal("H27 the invested slots are summed by cost; an uninvested item counts nothing; `except` is left out",
  [MI.investedSlotsUsed([relic, plain, off], null, fns), MI.investedSlotsUsed([relic, plain], null, fns, { except: relic }), MI.investedSlotsUsed([relic, plain], null, [])],
  [4, 1, 2]);

const API = await mod("module-api.mjs");
ok("H27 the three registries", typeof API.registerInvestCost === "function" && typeof API.registerInvestPrepare === "function" && typeof API.registerInvestRefusal === "function");
API.registerInvestCost("zzCost", (i) => (i.tier ?? null));
API.registerInvestRefusal("zzRefuse", (i) => (i.bonded ? "bonded to another" : ""));
API.registerInvestPrepare("zzPrep", async () => null);
equal("H27 …registered and read back", [API.registeredInvestCosts().length >= 1, API.registeredInvestRefusals().length >= 1, API.registeredInvestPrepares().length >= 1, API.registerInvestCost("", () => 1), API.registerInvestRefusal("x", null)], [true, true, true, false, false]);

const miw = strip(read("module", "magic-items-workflow.mjs"));
ok("H27 investRefusal: a module's refusal, then the slots by cost",
  /const mine = await moduleInvestRefusal\(actor, item\);\n\s*if \(mine\) return mine;/.test(miw)
  && /const used = await investedSlotsOf\(actor\);\n\s*const cost = itemInvestCost\(item, actor, await investCostFns\(\)\);[\s\S]{0,120}if \(used \+ cost > slots\)/.test(miw));
ok("H27 investItem: the refusals, the module's step with the slots free, then the cost it settled",
  /\|\| await moduleInvestRefusal\(actor, item\);/.test(miw)
  && /const usedBefore = await investedSlotsOf\(actor, \{ except: item \}\);[\s\S]{0,300}for \(const fn of registeredInvestPrepares\(\)\) \{[\s\S]{0,200}answer = await fn\(item, actor, \{ free: Math\.max\(0, slots - usedBefore\), slots \}\);[\s\S]{0,200}if \(answer\?\.refused\) \{[\s\S]{0,200}return null;/.test(miw)
  && /const cost = itemInvestCost\(item, actor, await investCostFns\(\)\);\n\s*if \(usedBefore \+ cost > slots\) \{/.test(miw)
  && miw.indexOf("for (const fn of registeredInvestPrepares())") < miw.indexOf("if (usedBefore + cost > slots) {"));
ok("H27 the sheet's badge counts by cost", /const investedCount = investedSlotsUsed\(Array\.from\(actor\.items \?\? \[\]\), actor, registeredInvestCosts\(\)\);/.test(strip(read("module", "sheets", "actor-sheet.mjs"))));
ok("H27 the module helpers register them", ["registerInvestCost", "registerInvestPrepare", "registerInvestRefusal"].every((n) => new RegExp(`${n}: \\(key, fn, moduleId\\) => ${n}\\(key, fn, moduleId\\),`).test(read("module", "module-api-workflow.mjs"))));

/* H28 ---------------------------------------------------------------- */
const RW = await mod("reactions", "reactions-workflow.mjs");
equal("H28 the HP given back: ⌊amount × heal⌋; unknown amount is null; no heal is 0",
  [RW.damageHealedBack(13, 0.5), RW.damageHealedBack(0, 0.5), RW.damageHealedBack(null, 0.5), RW.damageHealedBack(10, 0), RW.damageHealedBack(10, -1), RW.damageHealedBack(7, 1)],
  [6, 0, null, 0, 0, 7]);
const rw = strip(read("module", "reactions", "reactions-workflow.mjs"));
ok("H28 the reaction's context carries the amount where the site knows it", /amount: Number\.isFinite\(Number\(event\.amount\)\) && event\.amount !== null && event\.amount !== undefined \? Math\.max\(0, Math\.floor\(Number\(event\.amount\)\)\) : null/.test(rw));
ok("H28 a `heal` answer heals the target by it, or says it is by hand",
  /const back = damageHealedBack\(ctx\.amount, grant\.heal\);\n\s*if \(back === null\) return \[[\s\S]{0,200}is by hand here\.<\/em>`\];\n\s*if \(back <= 0\) return \[\];[\s\S]{0,200}await healActor\(target, back, \{ magical: true \}\);/.test(rw)
  && /if \(out\.scope === "cast"\) rememberHeal\(scopeKey, target, grant\);\n\s*lines\.push\(\.\.\.await healPacket\(target, ctx, grant\)\);/.test(rw));
ok("H28 the sites that know their amount pass it: a typed packet, a spell's damage, a missile, thorns",
  /spellName, sourceName,\n\s*amount: Math\.max\(0, Math\.floor\(Number\(amount\) \|\| 0\)\)/.test(strip(read("module", "combat", "damage-workflow.mjs")))
  && (read("module", "magic", "cast-workflow.mjs").match(/await spellDamageReactions\([^)]*\], [^)]+\)\)/g) ?? []).length >= 5
  && /damageReactionsBefore\(target, \{ kind: "spell", types: \[type\], magical: true, amount \}\)/.test(read("module", "magic", "spell-effects.mjs"))
  && /spellDamageReactionsFor\(attacker, damageType, \{ spellName: spec\?\.label \?\? "", source: defender, amount: roll\.total \}\)/.test(read("module", "magic", "thorns-workflow.mjs")));

/* H28, found in review -------------------------------------------------- */
equal("H28r what a healing answer covers: the first type's amount; a later type by hand; else none",
  [RW.healCoverage(["essence"], ["essence"]), RW.healCoverage(["fire", "essence"], ["essence"]), RW.healCoverage(["fire"], ["essence"]), RW.healCoverage(["fire"], ["all"]), RW.healCoverage([], ["essence"])],
  ["amount", "byHand", "none", "amount", "none"]);
{
  const GD = await mod("combat", "granted-defences.mjs");
  API.registerDamageReaction("zzDrink", (ctx) => ({ immune: ["essence"], heal: 0.5, scope: ctx.kind === "spell" ? "cast" : "instance", line: ctx.types.includes("essence") ? "drinks" : "" }));
  const vex = { uuid: "Actor.vex", id: "vex", name: "Vex", system: {} }; // no HP track: healActor answers 0 and writes nothing
  const scope = GD.beginCastScope();
  const first = await RW.damageReactionsBefore(vex, { kind: "spell", types: ["fire"], amount: 20 });
  const second = await RW.damageReactionsBefore(vex, { kind: "spell", types: ["essence"], amount: 10 });
  const third = await RW.damageReactionsBefore(vex, { kind: "spell", types: ["fire", "essence"], amount: 8 });
  const fourth = await RW.damageReactionsBefore(vex, { kind: "spell", types: ["essence"] });
  GD.endCastScope(scope);
  equal("H28r a cast's first packet (fire) heals nothing; its later essence packet, not asked again, heals by its own amount",
    [first, second], [[], ["Vex regains <strong>5</strong> HP (half of 10)."]]);
  ok("H28r …a mixed packet's essence part is by hand; an unknown amount is by hand", /the healing \(half the essence part\) is by hand here/.test(third.join(" ")) && /the healing \(half the amount\) is by hand here/.test(fourth.join(" ")));
  const outside = await RW.damageReactionsBefore(vex, { kind: "weapon", types: ["essence"], amount: 7 });
  equal("H28r outside a cast, each blow is asked and healed", outside, ["drinks", "Vex regains <strong>3</strong> HP (half of 7)."]);
}
ok("H28r the area save passes its amount and shows the reactions' lines", /reactionLines = await spellDamageReactionsFor\(target, type, \{ spellName: "", source: null, amount: dealt \}\);/.test(read("module", "magic", "area-save-workflow.mjs")) && /bracersLine \+ \(reactionLines\.length \? ` \$\{reactionLines\.join\(" "\)\}` : ""\)/.test(read("module", "magic", "area-save-workflow.mjs")));
ok("H28r hazardous terrain rolls its squares first, passes their sum and shows the lines", /reactionLines = await spellDamageReactionsFor\(mover, spec\.damageType, \{ spellName: spec\?\.label \?\? "", source: null, amount: rolls\.reduce\(\(a, b\) => a \+ b, 0\) \}\);/.test(read("module", "magic", "hazard-terrain-workflow.mjs")) && /\+ reactionLines\.map\(\(l\) => `<p>\$\{l\}<\/p>`\)\.join\(""\)/.test(read("module", "magic", "hazard-terrain-workflow.mjs")));
ok("H28r the cage rolls first, passes it and shows the lines", /reactionLines = await spellDamageReactionsFor\(prisoner, spec\.damageType, \{ spellName: cage\.spellName \?\? spec\.label \?\? "", source: null, amount: roll\.total \}\);/.test(read("module", "dice", "check-card-interactions.mjs")) && /outcome\), \.\.\.reactionLines\];/.test(read("module", "dice", "check-card-interactions.mjs")));

/* H29 (3.694.0): a spell cast at the level of the item that granted it, by the module's say ---- */
{
  const IL = await mod("item-innate-level.mjs");
  const shield = { id: "dawn", name: "Dawnshield", system: { itemLevel: 15 } };
  const optIn = { flags: { "trg-prime": { grantedBy: { sourceId: "dawn", atItemLevel: true } } } };
  const plain = { flags: { "trg-prime": { grantedBy: { sourceId: "dawn" } } } };
  const levelless = { id: "relic", name: "Aegis", system: { itemLevel: 0 } };
  equal("H29 an opted-in grant is cast at its item's level; a plain grant, and a level-less item, at the character's",
    [IL.innateCastLevel(optIn, [shield], 12), IL.innateCastLevel(plain, [shield], 12), IL.innateCastLevel({ flags: { "trg-prime": { grantedBy: { sourceId: "relic", atItemLevel: true } } } }, [levelless], 12)],
    [{ level: 15, itemName: "Dawnshield" }, { level: 12, itemName: null }, { level: 12, itemName: null }]);
  equal("H29 a Spell Effect rune's record still comes first", IL.grantingItemOf({ flags: { "trg-prime": { spellEffectRune: { itemId: "dawn" }, grantedBy: { sourceId: "other", atItemLevel: true } } } }, [shield, { id: "other" }])?.id, "dawn");
}

/* Z ------------------------------------------------------------------ */
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.694.0, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.720.1/")], ["3.720.1", "3.720.1", true]);

if (failures.length) {
  console.log(`verify-ea-block10-core: ${checks} checks, ${failures.length} failure(s).`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else console.log(`verify-ea-block10-core: OK — ${checks} checks.`);
