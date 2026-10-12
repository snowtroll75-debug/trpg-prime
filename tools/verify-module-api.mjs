#!/usr/bin/env node
/**
 * verify-module-api — the companion-module registry and pack federation.
 *
 * NEW at 3.560.0, shipped with the first Pillars of Faith build. Two
 * things are DRIVEN here, both pure:
 *
 *   A  content-packs.mjs — a fake `game.packs` of three collections (one
 *      system, one extender by manifest flag, one extender by runtime
 *      registration, one unrelated) is federated and read through every
 *      member a call site uses: getIndex, index, getDocument,
 *      getDocuments, iteration, find.
 *   B  module-api.mjs — every register* function, its normalisation, its
 *      refusal of bad input, and the read-side helpers the consumer files
 *      call (racial PP, class proficiency, archetype grants, traits,
 *      languages, skill actions).
 *
 * What is STRUCTURAL rather than driven — and is marked so — is the
 * wiring: that the entry script builds the API, fires the hook from init
 * and flushes at ready, and that each consumer file actually consults
 * the registry. A structural check cannot see a hook fire; the module
 * itself was driven live against the world before shipping.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected) {
  ok(label, actual === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
const read = (rel) => fs.readFileSync(path.join(SYSTEM_ROOT, rel), "utf8");

const api = await import(new URL("../module/module-api.mjs", import.meta.url));
const packs = await import(new URL("../module/content-packs.mjs", import.meta.url));
const racialPP = await import(new URL("../module/racial-pp.mjs", import.meta.url));
const languages = await import(new URL("../module/languages.mjs", import.meta.url));
const skillActions = await import(new URL("../module/data/skill-actions.mjs", import.meta.url));
const feats = await import(new URL("../module/feats.mjs", import.meta.url));
const config = await import(new URL("../module/config.mjs", import.meta.url));

api.resetModuleRegistry();

/* ------------------------------------------------------------------ *
 * A. Pack federation
 * ------------------------------------------------------------------ */

function fakePack(packageName, name, entries, flags = {}) {
  const index = new Map(entries.map((e) => [e._id, { ...e }]));
  index[Symbol.iterator] = function* () { yield* this.values(); };
  return {
    collection: `${packageName}.${name}`,
    metadata: { packageName, name, type: "Item", flags },
    index,
    async getIndex() { return index; },
    async getDocument(id) { return index.has(id) ? { id, name: index.get(id).name, from: this.collection } : null; },
    async getDocuments(query) {
      return Array.from(index.values())
        .filter((e) => !query?.name || e.name === query.name)
        .map((e) => ({ id: e._id, name: e.name, from: this.collection }));
    }
  };
}

const sys = fakePack("trg-prime", "feats", [{ _id: "aaaaaaaaaaaaaaaa", name: "Alertness" }, { _id: "bbbbbbbbbbbbbbbb", name: "Toughness" }]);
const flagged = fakePack("trg-pillars-of-faith", "pof-feats", [{ _id: "cccccccccccccccc", name: "Grave Vigil" }], { "trg-prime": { extends: "feats" } });
const runtime = fakePack("other-book", "more-feats", [{ _id: "dddddddddddddddd", name: "Elsewhere" }]);
const unrelated = fakePack("other-book", "spells", [{ _id: "eeeeeeeeeeeeeeee", name: "Fireball" }]);
const fakeGame = new Map([sys, flagged, runtime, unrelated].map((p) => [p.collection, p]));

equal("A1 the system pack alone answers before anything registers, plus the flagged extender",
  packs.contentPacksFor("feats", fakeGame).map((p) => p.collection).join("|"),
  "trg-prime.feats|trg-pillars-of-faith.pof-feats");
ok("A2 a runtime registration joins the federation",
  api.registerPack("other-book.more-feats", "feats", "other-book")
    && packs.contentPacksFor("feats", fakeGame).map((p) => p.collection).join("|")
      === "trg-prime.feats|trg-pillars-of-faith.pof-feats|other-book.more-feats");
equal("A3 an unrelated module pack is never swept in",
  packs.contentPacksFor("feats", fakeGame).some((p) => p === unrelated), false);
equal("A4 a logical pack nobody provides is null, as game.packs.get was",
  packs.contentPack("nothing", fakeGame), null);
equal("A5 a system pack cannot be re-registered",
  api.registerPack("trg-prime.feats", "spells"), false);
ok("A6 …and says so", api.registrationProblems().some((p) => p.includes("trg-prime.feats")));
equal("A7 isFederated is true only with an extender",
  `${packs.isFederated("feats", fakeGame)}|${packs.isFederated("spells", fakeGame)}`, "true|false");

const fed = packs.contentPack("feats", fakeGame);
const index = await fed.getIndex();
equal("A8 getIndex merges every member", index.size, 4);
equal("A9 iteration yields VALUES, as a Foundry Collection does",
  Array.from(fed.index).map((e) => e.name).join(","), "Alertness,Toughness,Grave Vigil,Elsewhere");
equal("A10 find works on the merged index", index.find((e) => e.name === "Grave Vigil")?._id, "cccccccccccccccc");
equal("A11 Array.from(index.values()) works", Array.from(index.values()).length, 4);
equal("A12 an entry knows its pack", index.get("cccccccccccccccc").packId, "trg-pillars-of-faith.pof-feats");
equal("A13 a system entry is stamped with the system", index.get("aaaaaaaaaaaaaaaa").packageName, "trg-prime");
equal("A14 getDocument reaches into the holder", (await fed.getDocument("cccccccccccccccc"))?.from, "trg-pillars-of-faith.pof-feats");
equal("A15 getDocument of a stranger is null", await fed.getDocument("zzzzzzzzzzzzzzzz"), null);
equal("A16 getDocuments({name}) searches every member", (await fed.getDocuments({ name: "Elsewhere" })).length, 1);
equal("A17 getDocuments() returns all", (await fed.getDocuments()).length, 4);
equal("A18 the facade's collection id is the system's", fed.collection, "trg-prime.feats");
equal("A19 the facade's metadata is the primary's", fed.metadata.packageName, "trg-prime");
ok("A20 FederatedIndex helpers: filter/map/some/every/contents",
  index.filter((e) => e.name.startsWith("T")).length === 1
    && index.map((e) => e._id).length === 4
    && index.some((e) => e.name === "Elsewhere")
    && index.every((e) => typeof e.name === "string")
    && index.contents.length === 4);
ok("A21 packExtendsSystem: flagged yes, registered yes, unrelated no, system no",
  packs.packExtendsSystem(flagged) && packs.packExtendsSystem(runtime)
    && !packs.packExtendsSystem(unrelated) && !packs.packExtendsSystem(sys));
ok("A22 a module-only logical pack (no system member) still federates",
  packs.contentPack("pof-feats", new Map([[flagged.collection, { ...flagged, metadata: { ...flagged.metadata, flags: {} } }]])) === null
    && packs.contentPacksFor("feats", new Map([[flagged.collection, flagged]]))[0] === flagged);

/* ------------------------------------------------------------------ *
 * B. The registry
 * ------------------------------------------------------------------ */

equal("B1 keys are trimmed and lowercased on the way in", (api.registerTraits(["  Haunt "]), api.registeredTraits()[0]), "haunt");
api.resetModuleRegistry();

equal("B2 racial PP: unregistered stays 0", racialPP.racialPPDue("Eshari", 5), 0);
ok("B3 racial PP registers", api.registerRacialPP("Eshari", 1, "test"));
equal("B4 …and racialPPDue reads it through the core tables", racialPP.racialPPDue("eshari", 5), 5);
equal("B5 a core race is not shadowed", racialPP.racialPPDue("Elf", 3), 3);
equal("B6 a non-number is refused", api.registerRacialPP("Bad", "lots"), false);

ok("B7 language registers with rarity and speakers", api.registerLanguage("Vesperic", { rarity: "uncommon", speakers: "Eshari" }));
equal("B8 a bad rarity is refused", api.registerLanguage("Nope", { rarity: "mythic" }), false);
equal("B9 addLanguage puts it in the live catalogue", languages.addLanguage("Vesperic", api.registeredLanguages().Vesperic), true);
equal("B10 …in its group", languages.languagesInGroup("uncommon").includes("Vesperic"), true);
equal("B11 …with canonical spelling", languages.canonicalLanguage("vesperic"), "Vesperic");
equal("B12 a core language is never overwritten", languages.addLanguage("Aelvish", { rarity: "rare" }), false);
equal("B13 …and keeps its rarity", languages.languageRarity("Aelvish"), "common");

equal("B14 traits register lowercased", api.registerTraits(["Haunt", " Spirit "]), 2);
ok("B15 …and read back", api.registeredTraits().includes("haunt") && api.registeredTraits().includes("spirit"));

ok("B16 a class registers", api.registerClass("Healer", { needsDivineAspect: true, proficiency: { armour: ["Light"] }, wealth: 100 }));
equal("B17 classNeedsDivineAspect consults it", config.classNeedsDivineAspect("Healer"), true);
equal("B18 …and still says no for a stranger", config.classNeedsDivineAspect("Plumber"), false);
equal("B19 Cleric is unchanged", config.classNeedsDivineAspect("Cleric"), true);
equal("B20 registeredClassNames is lowercase", api.registeredClassNames().join(","), "healer");

ok("B21 an archetype registers", api.registerArchetype("Bone Binder", { classGrants: ["Healer"], tierGrants: ["Adept"] }));
equal("B22 effectiveClasses opens the class through it", feats.effectiveClasses("Fighter", ["Bone Binder"]), "Fighter, Healer");
equal("B23 effectiveTiers adds the tier", feats.effectiveTiers("Martial", ["Bone Binder"]), "Martial, Adept");
equal("B24 a core archetype is unchanged", feats.effectiveClasses("Fighter", ["Priest"]), "Fighter, Cleric");
ok("B24b a skill substitution registers and substituteSkillActions offers it",
  api.registerSkillSubstitution("Rite of Passing", { action: "performLastRites", skill: "perform" })
    && feats.substituteSkillActions("perform", ["Rite of Passing"], [{ key: "performLastRites", name: "Perform Last Rites" }]).length === 1
    && feats.substituteSkillActions("religion", ["Rite of Passing"], [{ key: "performLastRites" }]).length === 0);
equal("B24c a core substitution is unchanged", feats.substituteSkillActions("perform", ["Impressive Performance"], [{ key: "makeAnImpression" }]).length, 1);
const skillFeats = await import(new URL("../module/skill-feats.mjs", import.meta.url));
ok("B24d a degree upgrade registers and the degree resolver honours it",
  api.registerDegreeUpgrades("Keeper of Records", [{ actionKey: "compareTestaments", from: "partial", to: "success" }])
    && skillFeats.shadowbornAgilityDegree("compareTestaments", "partial", ["Keeper of Records"]).degree === "success"
    && skillFeats.shadowbornAgilityDegree("compareTestaments", "partial", ["Keeper of Records"]).feat === "Keeper of Records"
    && skillFeats.shadowbornAgilityDegree("compareTestaments", "failure", ["Keeper of Records"]).upgraded === false
    && skillFeats.shadowbornAgilityDegree("compareTestaments", "partial", []).upgraded === false);
equal("B24e a bad degree name is refused", api.registerDegreeUpgrades("X", [{ actionKey: "a", from: "meh", to: "success" }]), false);
equal("B24f Shadowborn Agility is unchanged", skillFeats.shadowbornAgilityDegree("escape", "success", ["Shadowborn Agility"]).degree, "critical");
ok("B25 heritage race grant registers", api.registerHeritageRaceGrant("Eternal Blood", ["Eternal"]));
equal("B26 effectiveRaces reads it", feats.effectiveRaces("Human", ["Eternal Blood"]), "Human, Eternal Blood, Eternal");

const before = skillActions.SKILL_ACTIONS.length;
equal("B27 a skill action missing its shape is refused",
  api.registerSkillActions?.([{ key: "x" }]) ?? api.queueSkillActions([{ key: "x" }]), 0);
equal("B28 a complete one queues", api.queueSkillActions([{
  key: "performLastRites", name: "Perform Last Rites", skills: ["religion"], checkType: "skill", against: "fixed", fixedDC: 15, trained: true
}]), 1);
const added = skillActions.addSkillActions(api.queuedSkillActions());
equal("B29 addSkillActions appends it", skillActions.SKILL_ACTIONS.length, before + 1);
equal("B30 …stamping trained as proficiency", skillActions.SKILL_ACTIONS.at(-1).proficiency, "trained");
equal("B31 …and a second add of the same key is skipped, not duplicated",
  skillActions.addSkillActions(api.queuedSkillActions()).skipped.join(","), "performLastRites");
equal("B32 a core key can never be replaced", skillActions.addSkillActions([{ key: "tumble", name: "Nope", skills: ["acrobatics"], checkType: "skill", against: "fixed" }]).added.length, 0);
ok("B33 the appended entry is frozen like its neighbours", Object.isFrozen(skillActions.SKILL_ACTIONS.at(-1)) && added.added.length === 1);

equal("B34 feat automation needs a use()", api.queueFeatAutomation("Thing", { hint: "x" }), false);
ok("B35 …and queues with one", api.queueFeatAutomation("Past-Life Echo", { hint: "h", use: async () => {} }));
equal("B36 …keyed lowercased", api.queuedFeatAutomation().has("past-life echo"), true);
ok("B37 passive automation queues", api.queuePassiveAutomation("Soul Warden", "Works automatically."));
equal("B38 class-skill grant needs name and flag", api.queueClassSkillGrant({ name: "x" }), false);
ok("B39 contributors are recorded", api.registryContributors().includes("test"));
api.resetModuleRegistry();
equal("B40 reset empties it", api.registeredTraits().length, 0);

/* ------------------------------------------------------------------ *
 * C. Structural — the wiring (weaker; see header)
 * ------------------------------------------------------------------ */

const entry = read("scripts/trg-prime.mjs");
ok("C1 the entry script builds the API onto game.trgPrime.modules", /modules:\s*buildModuleApi\(\)/.test(entry));
ok("C2 …fires the registration hook from init (as live code, not a comment)", /^\s*fireRegistrationHook\(game\.trgPrime\.modules\);/m.test(entry));
ok("C3 …and flushes at ready", /^\s*reportModuleRegistrations\(flushModuleRegistrations\(\)\);/m.test(entry));
const workflow = read("module/module-api-workflow.mjs");
ok("C4 the hook has the documented name", workflow.includes('"trgPrime.registerContent"'));
ok("C5 no call site reads a system pack by literal id any more",
  !/game\.packs\??\.get\??\.?\((`trg-prime\.|"trg-prime\.|`\$\{SYSTEM_ID\}\.)/.test(
    fs.readdirSync(path.join(SYSTEM_ROOT, "module"), { recursive: true })
      .filter((f) => f.endsWith(".mjs") && !/^(content-packs|module-api)\.mjs$/.test(f))
      .map((f) => read(path.join("module", f)))
      .join("\n")));
ok("C6 the compendium refresh indexes extenders", read("module/compendium-refresh.mjs").includes("packExtendsSystem(pack)"));
ok("C7 the picker's prerequisite name set is federated", read("module/picker-workflow.mjs").includes('contentPack(packName)'));
ok("C8 the grant path is federated", read("module/grants-workflow.mjs").includes("contentPack(packName)"));
for (const [file, needle] of [
  ["module/racial-pp.mjs", "registeredRacialPP("],
  ["module/proficiency-rules.mjs", "registeredClass("],
  ["module/starting-wealth.mjs", "registeredClass("],
  ["module/config.mjs", "registeredClass("],
  ["module/picker-filters.mjs", "registeredClassNames()"],
  ["module/feats.mjs", "registeredArchetype("],
  ["module/feats.mjs", "registeredSkillSubstitution("],
  ["module/skill-feats.mjs", "registeredDegreeUpgrades("],
  ["module/defences.mjs", "registeredTraits()"],
  ["module/feats-workflow.mjs", "queuedPassiveAutomation()"]
]) ok(`C9 ${file} consults the registry`, read(file).includes(needle), `missing ${needle}`);

/* ------------------------------------------------------------------ *
 * Z. The pinned total
 * ------------------------------------------------------------------ */
const EXPECTED_CHECKS = 86;
equal("Z1 the suite ran every check it is meant to", checks + 1, EXPECTED_CHECKS);

if (failures.length) {
  console.log(`verify-module-api: ${checks} checks — ${failures.length} FAILED\n`);
  for (const failure of failures) console.log(`  ✗ ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`verify-module-api: ${checks} checks — all green.`);
}
