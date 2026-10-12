#!/usr/bin/env node
/**
 * verify-sourcebooks — 3.628.0, Graham's request of 7 October 2026: every
 * picker a character takes something from filters by sourcebook, opening on
 * Core Rulebook, with Fiends & Fables and Pillars of Faith beside it and any
 * later book joining by declaring itself.
 *
 *   A  naming a book
 *   B  the menu
 *   C  Fiends & Fables joins the pickers, after the books that declare themselves
 *   D  a name two books print resolves to the granting item's own book
 *   E  the wiring
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (p) => import(new URL(`../module/${p}`, import.meta.url));

const sb = await imp("sourcebooks.mjs");

/* A — naming a book */
equal("A1 the system's own content is the Core Rulebook, and so is an entry with no package", [sb.sourcebookTitle("trg-prime"), sb.sourcebookTitle("")], ["Core Rulebook", "Core Rulebook"]);
equal("A2 a registered title wins, then the manifest flag, then the known table, then the module title",
  [sb.sourcebookTitle("x", { registered: "Reg", manifestFlag: "Flag", moduleTitle: "Title" }),
    sb.sourcebookTitle("x", { manifestFlag: "Flag", moduleTitle: "Title" }),
    sb.sourcebookTitle("fiends-and-fables-prime", { moduleTitle: "Fiends & Fables Prime" }),
    sb.sourcebookTitle("blood-lords", { moduleTitle: "TRG Prime: Blood Lords" })],
  ["Reg", "Flag", "Fiends & Fables", "Blood Lords"]);
equal("A3 Pillars of Faith is named even without its flag, and an untitled unknown module by its id", [sb.sourcebookTitle("trg-pillars-of-faith", { moduleTitle: "TRG Prime: Pillars of Faith" }), sb.sourcebookTitle("mystery")], ["Pillars of Faith", "mystery"]);
const api = await imp("module-api.mjs");
api.resetModuleRegistry();
equal("A4 a module can register its book; the system's cannot be renamed", [api.registerSourcebook("eldritch-arts", "Eldritch Arts"), api.registeredSourcebook("eldritch-arts"), api.registerSourcebook("trg-prime", "Other"), api.registeredSourcebook("trg-prime")], [true, "Eldritch Arts", false, ""]);

/* B — the menu */
const resolve = (pkg) => sb.sourcebookTitle(pkg, { moduleTitle: pkg === "trg-pillars-of-faith" ? "TRG Prime: Pillars of Faith" : "" });
const facet = sb.withSourcebookFacet([], resolve)[0];
equal("B1 the menu opens on Core Rulebook and reads the entry's package", [facet.key, facet.label, facet.defaultValue, facet.read({ name: "Power Attack" }), facet.read({ packageName: "trg-pillars-of-faith" }), facet.read({ packageName: "fiends-and-fables-prime" })],
  ["sourcebook", "Sourcebook", "Core Rulebook", "Core Rulebook", "Pillars of Faith", "Fiends & Fables"]);
const withIt = sb.withSourcebookFacet([{ key: "category" }], resolve);
equal("B2 every picker gains it once, after its own menus", [withIt.map((f) => f.key), sb.withSourcebookFacet(withIt, resolve).length, sb.withSourcebookFacet(undefined, resolve).map((f) => f.key)], [["category", "sourcebook"], 2, ["sourcebook"]]);
const pf = await imp("picker-filters.mjs");
ok("B3 it opens on Core Rulebook when Core is on offer", /<option value="Core Rulebook" selected>/.test(pf.facetOptionsHtml(facet, ["Core Rulebook", "Pillars of Faith"])));
ok("B4 and on All when it is not, rather than on an empty list", !/value="[^"]+" selected/.test(pf.facetOptionsHtml(facet, ["Fiends & Fables", "Pillars of Faith"])) && /value="" selected/.test(pf.facetOptionsHtml(facet, ["Fiends & Fables", "Pillars of Faith"])));

/* C — Fiends & Fables joins */
equal("C1 the known table puts F&F's four character packs onto the core's", sb.knownExtenderPacks("fiends-and-fables-prime"), [
  { collectionId: "fiends-and-fables-prime.races", logical: "races" }, { collectionId: "fiends-and-fables-prime.heritages", logical: "heritages" },
  { collectionId: "fiends-and-fables-prime.abilities", logical: "abilities" }, { collectionId: "fiends-and-fables-prime.feats", logical: "feats" }]);
equal("C2 and nothing for a module that declares its own", sb.knownExtenderPacks("trg-pillars-of-faith"), []);
const cp = await imp("content-packs.mjs");
api.resetModuleRegistry();
api.registerPack("fiends-and-fables-prime.abilities", "abilities");
const fake = (collection, packageName, name, extendsName) => ({ collection, metadata: { packageName, name, type: "Item", flags: extendsName ? { "trg-prime": { extends: extendsName } } : {} } });
const packs = [fake("fiends-and-fables-prime.abilities", "fiends-and-fables-prime", "abilities"), fake("trg-prime.abilities", "trg-prime", "abilities"), fake("trg-pillars-of-faith.pof-abilities", "trg-pillars-of-faith", "pof-abilities", "abilities")];
equal("C3 the system first, then a book that declares itself, then one registered on the system's say-so", cp.contentPacksFor("abilities", packs).map((p) => p.collection), ["trg-prime.abilities", "trg-pillars-of-faith.pof-abilities", "fiends-and-fables-prime.abilities"]);
api.resetModuleRegistry();
equal("C4 unregistered, F&F's pack stays out", cp.contentPacksFor("abilities", packs).map((p) => p.collection), ["trg-prime.abilities", "trg-pillars-of-faith.pof-abilities"]);

/* D — the same name in two books */
equal("D1 the granting item's own book wins; else the core's; else a tie stays a tie", [
  sb.preferredBySourcebook([{ packageName: "fiends-and-fables-prime", id: 1 }, { packageName: "trg-pillars-of-faith", id: 2 }], "trg-pillars-of-faith")?.id,
  sb.preferredBySourcebook([{ packageName: "fiends-and-fables-prime", id: 1 }, { id: 3 }], "")?.id,
  sb.preferredBySourcebook([{ packageName: "fiends-and-fables-prime", id: 1 }, { packageName: "trg-pillars-of-faith", id: 2 }], "")], [2, 3, null]);
equal("D2 an owned item's book is read from where it was copied", [sb.sourcePackageOf({ _stats: { compendiumSource: "Compendium.trg-pillars-of-faith.pof-feats.Item.abc" } }), sb.sourcePackageOf({ flags: { core: { sourceId: "Compendium.trg-prime.feats.Item.x" } } }), sb.sourcePackageOf({})], ["trg-pillars-of-faith", "trg-prime", ""]);
const grants = await imp("grants.mjs");
const idx = [{ name: "Fast Healing", packageName: "trg-pillars-of-faith" }, { name: "Fast Healing", packageName: "fiends-and-fables-prime" }, { name: "Constrict", packageName: "trg-prime" }, { name: "Constrict", packageName: "fiends-and-fables-prime" }];
const m = grants.matchGrants(["Fast Healing", "Constrict"], idx, { preferPackage: "trg-pillars-of-faith" });
equal("D3 Pillars of Faith's Unliving Vampire gets its own Fast Healing; Constrict is the core's", m.resolved.map((r) => `${r.requested}:${r.entry.packageName}`), ["Fast Healing:trg-pillars-of-faith", "Constrict:trg-prime"]);
equal("D4 the Rogue/Ranger rule is untouched: two core Trap Finders with no class are still a reported tie", grants.matchGrants(["Trap Finder"], [{ name: "Trap Finder", system: { sourceClass: "Rogue" } }, { name: "Trap Finder", system: { sourceClass: "Ranger" } }]).unresolved, ["Trap Finder"]);

/* E — the wiring */
const pw = read("module", "picker-workflow.mjs");
ok("E1 every picker passes through pickFromPack, which adds the menu", /const \{ sourcebookResolver \} = await import\("\.\/module-api-workflow\.mjs"\);\s*const facets = withSourcebookFacet\(slotFacets, sourcebookResolver\(\)\);/.test(pw));
const aw = read("module", "module-api-workflow.mjs");
ok("E2 F&F's packs are registered before any module's own registrations", /export function fireRegistrationHook\(api\) \{\s*registerKnownSourcebookPacks\(\);/.test(aw) && /if \(!entry \|\| entry\.flags\?\.\["trg-prime"\]\?\.extends\) continue;\s*registerPack\(collectionId, logical, moduleId\);/.test(aw));
ok("E6 the packs are read from the module's manifest, which exists at init — game.packs does not (3.628.1)", /const declared = new Map\(Array\.from\(mod\.packs \?\? \[\]\)\.map\(\(p\) => \[`\$\{moduleId\}\.\$\{p\.name\}`, p\]\)\);/.test(aw) && !/game\?\.packs\?\.get\?\.\(collectionId\)/.test(aw));
ok("E3 the names come from the registry, the manifest flag and the module's title", /registered: registeredSourcebook\(id\),\s*manifestFlag: mod\?\.flags\?\.\["trg-prime"\]\?\.sourcebook,\s*moduleTitle: mod\?\.title/.test(aw));
ok("E4 the API offers registerSourcebook", /registerSourcebook: \(packageName, title, moduleId\) => registerSourcebook\(packageName, title, moduleId\)/.test(aw));
ok("E5 a grant prefers its own book", /preferPackage: sourcePackageOf\(sourceItem\)/.test(read("module", "grants-workflow.mjs")));

ok("E7 a picker whose defaults together show nothing opens the Sourcebook menu on All instead (3.628.1)", /if \(apply\(\) === 0\) \{\s*const books = facetSelects\.find\(\(select\) => select\.dataset\.facet === "sourcebook"\);\s*if \(books\?\.value\) \{ books\.value = ""; apply\(\); \}/.test(pw) && /return shown;\s*\};/.test(pw));

equal("B5 the menu takes its books from the whole pack, so the gates cannot hide it (3.628.2)", facet.valuesFrom, "all");
ok("E8 the picker builds a valuesFrom-all facet's options from the full index, its rows from the gated entries", /const source = facet\.valuesFrom === "all" \? fullIndex : entries;\s*const values = Array\.from\(new Set\(\s*source\.map\(/.test(pw));

const EXPECTED = 26;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-sourcebooks: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-sourcebooks: ${checks} checks — all green.`);
