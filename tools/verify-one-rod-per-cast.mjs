#!/usr/bin/env node
/**
 * verify-one-rod-per-cast — TRG Prime 3.691.0: "You can only gain the
 * benefits of one magical item with this trait each round" (the Rod trait),
 * within one cast (Graham, 14 November 2026). Every rod a cast takes was
 * offered before any paid, so each passed the round's stamp: a metamagic
 * rod's power, a Rod of the Magi's draw and a Rod of Accuracy's bonus could
 * all land on one cast. Found in Eldritch Arts Block 9c's review.
 *
 *   node tools/verify-one-rod-per-cast.mjs
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

// A — the rule, pure
const TR = await import(new URL("../module/trait-rules.mjs", import.meta.url));
equal("A one rod, or one rod's two powers, is one Rod", [TR.castRodsRefusal([]), TR.castRodsRefusal([{ itemId: "a", name: "Rod A" }]), TR.castRodsRefusal([{ itemId: "a", name: "Rod A" }, { itemId: "a", name: "Rod A" }])], ["", "", ""]);
equal("A two different rods are refused, by name",
  TR.castRodsRefusal([{ itemId: "a", name: "Rod of Extend" }, { itemId: "b", name: "Rod of the Magi" }]),
  "only one Rod may be used each round — Rod of Extend and Rod of the Magi were both taken for this cast");
equal("A an entry with no item is not a rod; an unnamed rod still counts", [TR.castRodsRefusal([{ name: "x" }, { itemId: "a" }]), TR.castRodsRefusal([{ itemId: "a" }, { itemId: "b" }])],
  ["", "only one Rod may be used each round — a Rod and a Rod were both taken for this cast"]);
equal("A another rod than this one", [TR.otherCastRod([{ itemId: "a" }], "a"), TR.otherCastRod([{ itemId: "a" }], "b")?.itemId, TR.otherCastRod([], "b")], [null, "a", null]);

// B — the cast
const cw = strip(read("module", "magic", "cast-workflow.mjs"));
const at = (s) => cw.indexOf(s);
ok("B the cast's rods start from its metamagic rods, and two are refused before anything is spent",
  /const castRods = \(mm\.rodSpends \?\? \[\]\)\.map\(\(s\) => \(\{ itemId: s\.itemId, name: s\.name \}\)\);\n\s*\{\n\s*const refusedRods = castRodsRefusal\(castRods\);\n\s*if \(refusedRods\) \{\n\s*ui\.notifications\.warn\(`\$\{spell\.name\}: \$\{refusedRods\}\.`\);\n\s*return null;/.test(cw));
ok("B the Rod of the Magi's draw is not offered after a rod this round, or beside another this cast",
  /const rodSource = rodCandidate && !rodRefusedNow\(actor, \{ fromItemCast: isItemCast \}\) && !otherCastRod\(castRods, rodCandidate\.itemId\)\n\s*\? rodCandidate : null;/.test(cw)
  && /if \(rodDraw > 0\) castRods\.push\(\{ itemId: rodSource\.itemId, name: rodSource\.name \}\);/.test(cw));
ok("B the module PP sources are told the rods taken, and a source's rod joins them, refused if a second",
  /metamagic: castMetamagic\.keys,\n\s*rodsThisCast: castRods\.map\(\(r\) => \(\{ \.\.\.r \}\)\)\n\s*\}\);\n\s*if \(ppSources === null\) return null;\n\s*for \(const d of ppSources\.draws\) if \(d\.rodItemId && d\.drawn > 0\) castRods\.push\(\{ itemId: d\.rodItemId, name: d\.rodName \|\| d\.label \}\);\n\s*\{\n\s*const refusedRods = castRodsRefusal\(castRods\);/.test(cw));
ok("B the casting options are told the rods taken, and an option's rod joins them, refused if a second",
  /holding: holdingNow,\n\s*rodsThisCast: castRods\.map\(\(r\) => \(\{ \.\.\.r \}\)\)\n\s*\};/.test(cw)
  && /const castOptionsApplied = await appliedCastOptions\(castOptionContext, conditions\.castOptions \?\? \[\]\);\n\s*castRods\.push\(\.\.\.castOptionsApplied\.rods\);\n\s*\{\n\s*const refusedRods = castRodsRefusal\(castRods\);/.test(cw));
ok("B the Rod of Accuracy is not offered beside another rod this cast, and joins them when taken",
  /const accuracyRod = accuracyCandidate && !otherCastRod\(castRods, accuracyCandidate\.itemId\) \? accuracyCandidate : null;/.test(cw)
  && /await stampRodUse\(actor, actor\.items\?\.get\?\.\(accuracyRod\.itemId\) \?\? null\);\n\s*castRods\.push\(\{ itemId: accuracyRod\.itemId, name: accuracyRod\.name \}\);/.test(cw));
const iMeta = at("const castRods = (mm.rodSpends"), iDraw = at("const rodSource = rodCandidate"), iSources = at("rodsThisCast: castRods.map((r) => ({ ...r }))\n    });"),
  iOptions = at("castRods.push(...castOptionsApplied.rods);"), iAccuracy = at("const accuracyRod = accuracyCandidate"), iSpend = at("const castReceipt = apPaid ? null : await spendActionCost(");
ok("B in the order they are chosen, all before the cast's AP and PP are spent",
  [iMeta, iDraw, iSources, iOptions, iAccuracy].every((v, i, a) => v > 0 && (i === 0 || v > a[i - 1])) && iSpend > iAccuracy,
  JSON.stringify({ iMeta, iDraw, iSources, iOptions, iAccuracy, iSpend }));
ok("B the rule is imported from trait-rules", /const \{ castRodsRefusal, otherCastRod \} = await import\("\.\.\/trait-rules\.mjs"\);/.test(cw));

// D — the review's points (3.691.0)
ok("D a metamagic rod is a rod: none offered after a Rod this round, or on an item's spell",
  /const mmRodsAllowed = !mmRodRefused\(actor, \{ fromItemCast: isItemCast \}\);/.test(cw) && /rods: mmRodsAllowed \? metamagicRodsOf\(Array\.from\(actor\.items \?\? \[\]\)\) : \[\],/.test(cw));
ok("D …nor a module's rod-paid metamagic",
  /const rods = rodUseRefusal\(actor, \{ fromItemCast: Boolean\(base\.itemCast\) \}\) \? \[\] : moduleMetamagicRodsOf\(/.test(strip(read("module", "magic", "module-metamagic-workflow.mjs"))));
ok("D no Rod of the Magi draw while storing a spell (its whole cost is taken from the pool); a held spell may draw",
  /const rodCandidate = \(isCantrip \|\| isInnate \|\| isItemCast \|\| stored \|\| \(storingNow && !holdingNow\) \|\| totalPP <= 0 \|\| ritualSubstitutes\)/.test(cw));
ok("D a cast refused at the casting options gives its Spell Adder use back",
  /castRods\.push\(\.\.\.castOptionsApplied\.rods\);\n\s*\{\n\s*const refusedRods = castRodsRefusal\(castRods\);\n\s*if \(refusedRods\) \{\n\s*ui\.notifications\.warn\([^\n]*\n\s*if \(spellAdderUsed\) \{\n\s*const spentNow = Number\(actor\.getFlag\?\.\(SYSTEM_ID, SPELL_ADDER_USED_FLAG\)\) \|\| 0;\n\s*await actor\.setFlag\(SYSTEM_ID, SPELL_ADDER_USED_FLAG, Math\.max\(0, spentNow - 1\)\);\n\s*\}\n\s*return null;/.test(cw));

// C — the module channels
const mmw = strip(read("module", "magic", "module-metamagic-workflow.mjs"));
ok("C a PP source may name its rod", /out\.draws\.push\(\{ key: source\.key, label, drawn, source, rodItemId: text\(offer\.rodItemId\), rodName: text\(offer\.rodName\) \}\);/.test(mmw));
const CO = await import(new URL("../module/magic/cast-options.mjs", import.meta.url));
const co = strip(read("module", "magic", "cast-options.mjs"));
ok("C a casting option may name its rod", /const out = \{ keys: \[\][^\n]*rods: \[\] \};/.test(co)
  && /if \(str\(got\?\.rodItemId\)\) out\.rods\.push\(\{ itemId: str\(got\.rodItemId\), name: str\(got\?\.rodName\) \|\| label \}\);/.test(co));
ok("C cast-options still loads", typeof CO.appliedCastOptions === "function");

// Z
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.691.0, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.718.1/")], ["3.718.1", "3.718.1", true]);

if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`verify-one-rod-per-cast: ${failures.length} failure(s) of ${checks}`);
  process.exit(1);
}
console.log(`verify-one-rod-per-cast: ${checks} checks, 0 failure(s).`);
