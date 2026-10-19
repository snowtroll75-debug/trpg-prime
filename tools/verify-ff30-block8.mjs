#!/usr/bin/env node
/**
 * verify-ff30-block8 — 3.638.0, Fiends & Fables 3.0 block 8 (Kothorn to
 * Lynxara), ruling R5: a compound action may offer several strikes but let
 * only some be made (`choose: n`) — the Cheetah's Sprint, one Bite or Claw.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const ca = await import(new URL("../module/combat/compound-action.mjs", import.meta.url));
const wf = read("module", "combat", "compound-action-workflow.mjs");

equal("C1 the limit: none, one, two; nonsense is no limit", [ca.compoundChooseLimit({}), ca.compoundChooseLimit({ choose: 1 }), ca.compoundChooseLimit({ choose: "2" }), ca.compoundChooseLimit({ choose: 0 }), ca.compoundChooseLimit({ choose: "x" }), ca.compoundChooseLimit({ choose: -1 }), ca.compoundChooseLimit(null)], [0, 1, 2, 0, 0, 0, 0]);
equal("C2 with choose 1 the first strike is allowed and the second is not; with no limit both are", [ca.compoundStrikeAllowed(1, {}), ca.compoundStrikeAllowed(1, { "0:0": true }), ca.compoundStrikeAllowed(2, { "0:0": true }), ca.compoundStrikeAllowed(0, { "0:0": true, "1:0": true })], [true, false, true, true]);
equal("C3 Sprint's strikes resolve to both natural weapons", ca.compoundStrikes({ strikes: [{ weapon: "^bite$", bonus: { value: 4, type: "circumstance", label: "Charge" } }, { weapon: "^claw$", bonus: { value: 4, type: "circumstance", label: "Charge" } }] }, [{ type: "weapon", id: "b", name: "Bite" }, { type: "weapon", id: "c", name: "Claw" }]).strikes.map((s) => [s.weaponName, s.bonus.value]), [["Bite", 4], ["Claw", 4]]);
ok("W1 the card carries the limit", /compoundAction: \{ actorUuid: actor\.uuid, itemId: item\.id, strikes, mapRule, choose, label: item\.name, used: \{\} \}/.test(wf) && /const choose = compoundChooseLimit\(spec\);/.test(wf));
ok("W2 a press past the limit is refused", /if \(!compoundStrikeAllowed\(raw\.choose, raw\.used\)\) \{ ui\.notifications\?\.warn/.test(wf));
ok("W3 the rendered card disables the remaining buttons", /if \(!compoundStrikeAllowed\(raw\.choose, raw\.used\) \|\| !compoundPickAllowed\(raw\.strikes, Number\(button\.dataset\.strike\), raw\.used\)\) \{ button\.disabled = true; continue; \}/.test(wf));

// 3.638.1, found live: "Any attacks made against the creature when it takes
// this action suffer a -4 circumstance penalty" is a +4 to its own DB; the
// declaration had -4, which lowered the Bulette's DB from 25 to 21.
const { CODEX_DECLARATIONS } = await import(new URL("./ff30-codex-declarations.mjs", import.meta.url));
equal("P1 Pouncing Assault raises the creature's own DB by 4", CODEX_DECLARATIONS["Pouncing Assault"].flags.creatureAbility.compound.selfEffect.defenceCircumstance, 4);
ok("P2 every compound self-effect is a bonus to the creature's DB, never a penalty", Object.values(CODEX_DECLARATIONS).every((d) => { const se = d?.flags?.creatureAbility?.compound?.selfEffect; return !se || Number(se.defenceCircumstance) > 0; }));

const EXPECTED = 9;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-ff30-block8: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-ff30-block8: ${checks} checks — all green.`);
