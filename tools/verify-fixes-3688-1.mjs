#!/usr/bin/env node
/**
 * verify-fixes-3688-1 — TRG Prime 3.688.1: found live by Graham, 13 November
 * 2026. "When an arcane caster casts from an item such as a wand and staff it
 * does not allow them to add their spellcraft mod (as they never have the
 * tradition)."
 *
 * The 106 specialist spells record no tradition: Chapter 10 has a specialist
 * spell inherit its caster's, and the cast from memory reads it so
 * (`effectiveSpellTradition`). The release from a wand, staff or scroll looked
 * the tradition up by name (`spellTraditionFor`) without it, so Staff of
 * Undeath's Charm Undead, a Wizard specialist spell, told an arcane caster
 * "the spell is not from your tradition" and offered no Spellcraft path.
 *
 *   node tools/verify-fixes-3688-1.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

// The workflow's Foundry reads happen at call time; these are enough to load it and look up a pack.
const PACK = [
  { _id: "s1", name: "Charm Undead", system: { tradition: "" } },
  { _id: "s2", name: "Burning Hands", system: { tradition: "arcane, verdant" } },
  { _id: "s3", name: "Cure", system: { tradition: "divinity, verdant" } }
];
globalThis.foundry = { applications: { api: { DialogV2: {} }, ux: {} }, utils: {} };
globalThis.ui = { notifications: { warn() {}, info() {} } };
const spellsPack = { metadata: { packageName: "trg-prime", name: "spells", type: "Item" }, getIndex: async () => PACK, index: PACK };
globalThis.game = { packs: [spellsPack], system: { id: "trg-prime" }, settings: { get: () => null }, modules: new Map() };

const ciw = await imp("charged-items-workflow.mjs");
const ci = await imp("charged-items.mjs");
const src = read("module", "charged-items-workflow.mjs");

const wizard = { system: { magic: { tradition: "arcane" } }, items: [] };
const fighter = { system: { magic: { tradition: "" } }, items: [] };
const cleric = { system: { magic: { tradition: "divinity" } }, items: [{ type: "spell", name: "Charm Undead", system: { tradition: "" } }] };

equal("A a specialist spell (no tradition recorded) inherits the caster's: an arcane caster's is arcane",
  await ciw.spellTraditionFor(wizard, "Charm Undead"), "arcane");
equal("A the caster's own copy of it reads the same way (a divinity caster's is divinity)",
  await ciw.spellTraditionFor(cleric, "Charm Undead"), "divinity");
equal("A a spell with a tradition keeps its own", [await ciw.spellTraditionFor(wizard, "Burning Hands"), await ciw.spellTraditionFor(wizard, "Cure")], ["arcane, verdant", "divinity, verdant"]);
equal("A a non-caster inherits nothing, and a spell not found has none", [await ciw.spellTraditionFor(fighter, "Charm Undead"), await ciw.spellTraditionFor(wizard, "No Such Spell")], ["", ""]);

const release = async (actor, name, pp) => ci.castFromItemOptions({ spellPPCost: pp, spellTradition: await ciw.spellTraditionFor(actor, name), casterLevel: 8, casterTradition: actor.system.magic.tradition, skillRanks: {}, hasUseMagicDevice: false })[0];
const sc = await release(wizard, "Charm Undead", 1);
equal("B so the Spellcraft path is open to the arcane caster releasing Charm Undead from Staff of Undeath", [sc.key, sc.available, sc.reason], ["spellcraft", true, ""]);
const cure = await release(wizard, "Cure", 2);
equal("B and still closed for a spell of another tradition (Cure: divinity, verdant), as Chapter 11 has it", [cure.available, cure.reason], [false, "the spell is not from your tradition"]);

// A HIGH MAGIC CASTER (Graham, 13 November 2026: "I meant High Magic caster not Arcane").
const opt = (o) => ci.castFromItemOptions({ spellPPCost: 2, casterLevel: 8, casterTradition: "arcane", skillRanks: {}, hasUseMagicDevice: false, ...o })[0];
equal("D a High Magic caster (the Archmage) releasing a spell of another tradition: Spellcraft is open (Wand of Cure)",
  [opt({ spellTradition: "divinity, verdant", highMagicCaster: true }).available, opt({ spellTradition: "divinity, verdant" }).available], [true, false]);
equal("D …but not a spell with no tradition at all, and the caster level still caps it",
  [opt({ spellTradition: "", highMagicCaster: true, casterTradition: "" }).available, opt({ spellTradition: "divinity", highMagicCaster: true, spellPPCost: 12 }).reason], [false, "your caster level (8) casts at most 9 PP, below the spell's 12"]);
const hm = await imp("magic/high-magic.mjs");
const archmage = { system: { magic: { tradition: "arcane" } }, items: [{ type: "class", name: "Archmage", flags: { "trg-prime": { highMagicCaster: true } } }] };
const witch = { system: { magic: { tradition: "ethereal" } }, items: [{ type: "class", name: "Witch", flags: { "trg-prime": { highMagicCaster: ["ethereal", "verdant"] } } }] };
const isHM = (a, t) => hm.highMagicCast(a, { tradition: t, traits: "" }).source === "caster";
equal("D who counts, as the release asks it: the Archmage for any tradition; the Witch for hers (Ethereal, Verdant), not Divinity; a Wizard never",
  [isHM(archmage, "divinity, verdant"), isHM(witch, "verdant"), isHM(witch, "divinity"), isHM(wizard, "divinity")], [true, true, false, false]);
ok("D the release asks it of the caster and hands it to the options",
  /const highMagicCaster = highMagicCast\(actor, \{ tradition: spellTradition, traits: "" \}\)\.source === "caster";/.test(src)
  && /\.\.\.castFromItemOptions\(\{ spellPPCost: cost, spellTradition, highMagicCaster, \.\.\.context \}\),/.test(src));

ok("C the lookup reads the cast's own rule (Chapter 10), not a copy of it",
  /import \{ effectiveSpellTradition \} from "\.\/magic\/tradition-gate\.mjs";/.test(src)
  && /const inherit = \(own\) => effectiveSpellTradition\(own, actor\?\.system\?\.magic\?\.tradition\);/.test(src)
  && /if \(owned\) return inherit\(owned\.system\?\.tradition \?\? ""\);/.test(src)
  && /return hit \? inherit\(hit\.system\?\.tradition \?\? ""\) : "";/.test(src));
ok("C the release check and its fumble both use the lookup", (src.match(/await spellTraditionFor\(actor, spellName\)/g) ?? []).length === 2);

const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.691.0", [sys.version, JSON.parse(read("package.json")).version], ["3.707.2", "3.707.2"]);

if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); console.log(`verify-fixes-3688-1: ${failures.length} failure(s) of ${checks}`); process.exit(1); }
console.log(`verify-fixes-3688-1: all ${checks} checks pass`);
