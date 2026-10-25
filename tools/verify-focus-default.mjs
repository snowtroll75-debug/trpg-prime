#!/usr/bin/env node
/**
 * verify-focus-default — 3.665.0: a Focus feat or ability with no printed
 * count is one use (Inner Tempest's D1, approved by Graham on 21 October
 * 2026). See focusDefaultUses in module/uses.mjs.
 *
 *   A  the rule, pure
 *   B  priming the stored count, pure
 *   C  the wiring: itemUsesMax, item creation, actor creation
 *   D  the migration, driven against fake actors, and its gate
 *   E  the core feats it was written for, read from the shipped pack
 *   F  the Use button gates and spends a defaulted use (3.665.1)
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const uses = await import(new URL("../module/uses.mjs", import.meta.url));
const migration = await import(new URL("../module/migration.mjs", import.meta.url));
const f = uses.focusDefaultUses;

equal("A1 a Focus feat or ability with no count is one use", [f({ traits: "Focus", usesPerDay: "" }, "feat"), f({ traits: "Attack, Flourish, Focus" }, "ability")], [1, 1]);
equal("A2 a printed count wins, and no Focus means no default", [f({ traits: "Focus", usesPerDay: "2" }, "feat"), f({ traits: "Focus", usesPerDay: "unlimited" }, "ability"), f({ traits: "Flourish", usesPerDay: "" }, "feat")], [null, null, null]);
equal("A3 spells keep the innate rule exactly", [f({ traits: "Focus", innate: true }, "spell"), f({ traits: "Focus", innate: false }, "spell"), f({ traits: "Focus", innate: true }, "spell") === uses.focusInnateDefaultUses({ traits: "Focus", innate: true }, "spell")], [1, null, true]);
equal("A4 other item types are untouched", [f({ traits: "Focus" }, "weapon"), f({ traits: "Focus" }, "equipment"), f({ traits: "Focus" }, undefined)], [null, null, null]);
equal("A5 the word, not a substring", f({ traits: "Refocusing" }, "feat"), null);

const prime = uses.focusDefaultPrime;
equal("B1 a stored 0 or no stored count is primed to the one use", [prime({ type: "feat", system: { traits: "Focus", usesValue: 0 } }), prime({ type: "ability", system: { traits: "Focus" } })], [1, 1]);
equal("B2 a full count, a counted item and a plain item are left alone", [prime({ type: "feat", system: { traits: "Focus", usesValue: 1 } }), prime({ type: "feat", system: { traits: "Focus", usesPerDay: "3", usesValue: 0 } }), prime({ type: "feat", system: { traits: "Move" } })], [null, null, null]);

const uw = read("module", "uses-workflow.mjs");
ok("C1 itemUsesMax reads the wider default before the formula", /const focusDefault = focusDefaultUses\(owner\.system, owner\.type\);\s*if \(focusDefault !== null\) return focusDefault \+ Math\.max\(0, Math\.floor\(bonus\)\);/.test(uw));
// Re-anchored at 3.667.1: the use and any declared extra uses (Deep Focus).
ok("C2 an item dropped on a sheet arrives with its use", /const focusUses = focusDefaultUses\(\{ \.\.\.this\.system, traits: traits \?\? this\.system\?\.traits \}, this\.type\);\s*if \(focusUses !== null\) \{[\s\S]{0,700}const full = focusUses \+ extra;\s*if \(Number\(this\.system\?\.usesValue \?\? 0\) < full\) this\.updateSource\(\{ "system\.usesValue": full \}\);/.test(read("module", "documents", "item.mjs")));
const actorSrc = read("module", "documents", "actor.mjs");
ok("C3 an actor created with its items primes them", /const value = focusDefaultPrime\(itemSource\);\s*if \(value === null\) return itemSource;\s*primed = true;\s*return \{ \.\.\.itemSource, system: \{ \.\.\.\(itemSource\.system \?\? \{\}\), usesValue: value \} \};/.test(actorSrc) && /if \(primed\) update\.items = items;\s*this\.updateSource\(update\);/.test(actorSrc));

function fakeActor(name, items) {
  const updates = [];
  return {
    name, updates,
    items: items.map(([id, type, system]) => ({ id, name: id, type, system, _source: { system } })),
    updateEmbeddedDocuments: async (kind, list) => { updates.push(...list); }
  };
}
const pc = fakeActor("Hero", [
  ["Void Step", "feat", { traits: "Focus, Teleportation", usesPerDay: "", usesValue: 0 }],
  ["Ghost Sound", "spell", { traits: "Focus", innate: true, usesPerDay: "", usesValue: 0 }],
  ["Channel", "ability", { traits: "Focus", usesPerDay: "Charisma", usesValue: 0 }],
  ["Already", "ability", { traits: "Focus", usesPerDay: "", usesValue: 1 }]
]);
const token = fakeActor("Earth Drake (token)", [["Earth Drake Breath", "ability", { traits: "Focus, Earth" }]]);
const report = await migration.migrateFocusDefaultUses([pc], [token]);
equal("D1 the migration gives the untracked Focus feat and ability their use, on actors and tokens", [pc.updates, token.updates], [[{ _id: "Void Step", "system.usesValue": 1 }], [{ _id: "Earth Drake Breath", "system.usesValue": 1 }]]);
equal("D2 …leaves an innate spell's 0 (it may be a real spend) and every counted item alone, and reports", report, [{ owner: "Hero", item: "Void Step" }, { owner: "Earth Drake (token)", item: "Earth Drake Breath" }]);
const migSrc = read("module", "migration.mjs");
// THE STAMP MAY MOVE ON PAST THE PASS (3.666.1 raised it for Hurling's pack
// repair); what matters is that it still reaches it.
const stamp = /export const TRG_SCHEMA_VERSION = "([\d.]+)";/.exec(migSrc)?.[1] ?? "0";
const reaches = (v, s) => { const a = v.split(".").map(Number), b = s.split(".").map(Number); for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0); } return true; };
ok("D3 the pass is gated at 3.665.0 and the schema stamp reaches it", /runIf\("3\.665\.0", "one use for Focus feats and abilities with no count",\s*\(\) => migrateFocusDefaultUses\(actors, tokenActors\)\)\)/.test(migSrc) && reaches("3.665.0", stamp));

// Read from the shipped pack itself. Copied first, so a pack Foundry holds
// open is never locked by this read.
const { ClassicLevel } = await import("classic-level");
const os = await import("node:os");
const copy = fs.mkdtempSync(path.join(os.tmpdir(), "focus-default-"));
fs.cpSync(path.join(SYSTEM_ROOT, "packs", "feats"), copy, { recursive: true });
fs.rmSync(path.join(copy, "LOCK"), { force: true });
const db = new ClassicLevel(copy, { valueEncoding: "json" });
const wanted = ["Ebon Bind", "Ferocious Charge", "Injury Relief", "Primal Shape", "Void Step"];
const found = {};
for await (const [, doc] of db.iterator({ gte: "!items!", lt: "!items!~" })) if (wanted.includes(doc?.name)) found[doc.name] = f(doc.system ?? {}, doc.type);
await db.close();
fs.rmSync(copy, { recursive: true, force: true });
equal("E1 the five core feats D1 names now count one use", wanted.map((n) => found[n] ?? "missing"), [1, 1, 1, 1, 1]);

// F. SPENT AT THE USE BUTTON (3.665.1). The live test of 3.665.0 found the
// count arriving and Refocus offering it, but Void Step and Abyssal Healing
// ran again and again: their handlers predate the count and never spend it.
const spend = uses.focusDefaultSpend;
equal("F1 a defaulted use that the handler acted on and left unspent is spent", spend({ max: 1, before: 1, after: 1, acted: true }), true);
equal("F2 not when the handler spent it itself, posted nothing, or reported failure", [spend({ max: 1, before: 1, after: 0, acted: true }), spend({ max: 1, before: 1, after: 1, acted: false }), spend({ max: 1, before: 1, after: 1, acted: true, result: false }), spend({ max: 1, before: 1, after: 1, acted: true, result: null })], [false, false, false, false]);
equal("F3 not for an item whose count is printed, nor with nothing left to spend", [spend({ max: null, before: 1, after: 1, acted: true }), spend({ max: 1, before: 0, after: 0, acted: true })], [false, false]);
const fwSrc = read("module", "feats-workflow.mjs");
ok("F4 every Use passes the gate (the table, the Codex activation, the ability choice)", /export async function useFeat\(actor, item\) \{\s*return withFocusDefault\(actor, item, \(\) => useFeatNow\(actor, item\)\);\s*\}/.test(fwSrc) && /async function useFeatNow\(actor, item\) \{/.test(fwSrc));
ok("F5 a spent defaulted use is refused before the handler runs", /const max = focusDefaultUses\(item\?\.system, item\?\.type\);\s*if \(max === null\) return run\(\);[\s\S]{0,700}if \(!\(itemUsesRemaining\(item\) > 0\)\) \{\s*ui\.notifications\.warn\(`\$\{item\.name\}: its Focus use is spent — Refocus restores it\.`\);\s*return null;/.test(fwSrc));
ok("F6 …and spent after it, judged by a card this actor posted during the Use", /const acted = Array\.from\(game\.messages \?\? \[\]\)\.some\(\(m\) =>\s*!known\.has\(m\.id\) && m\.speaker\?\.actor === actor\?\.id\);/.test(fwSrc) && /if \(focusDefaultSpend\(\{ max, before, after: Number\(current\.system\?\.usesValue\), acted, result \}\)\) \{\s*await current\.update\(\{ "system\.usesValue": Math\.max\(0, before - 1\) \}\);/.test(fwSrc));

const EXPECTED = 21;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-focus-default: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-focus-default: ${checks} checks — all green.`);
