#!/usr/bin/env node
/**
 * verify-fixes-3690-1 — TRG Prime 3.690.1: three card fixes from Eldritch
 * Arts Block 9c's live test (14 November 2026), approved by Graham.
 *   A. Recharge Item's requirements print the item's own PP cost (an Orb's 4)
 *      where they printed the action's 2 above the 4 it spent.
 *   B. The settle card is titled by what it carries: "PP Sources" when only a
 *      source (Rod of Ley Resonance) paid, not "Metamagic".
 *   C. A spell being held says "The spell is held.", not "takes effect".
 *
 *   node tools/verify-fixes-3690-1.mjs
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

const aw = strip(read("module", "combat", "action-workflow.mjs"));
const cw = strip(read("module", "magic", "cast-workflow.mjs"));

// A
const { rechargeRequirementsFor } = await import(new URL("../module/charged-items.mjs", import.meta.url));
const printed = "Adept. You have the spells contained within the item on your spell list. PP Cost 2.";
equal("A an Orb's Recharge Item prints its own cost", rechargeRequirementsFor(printed, { label: "Orb", rechargeItemPP: 4 }),
  "Adept. You have the spells contained within the item on your spell list. PP Cost 4 (Orb).");
equal("A an item with no cost of its own keeps the printed line", [rechargeRequirementsFor(printed, null), rechargeRequirementsFor(printed, { label: "Wand" }), rechargeRequirementsFor(printed, { rechargeItemPP: 0 })], [printed, printed, printed]);
equal("A an unnamed kind still reads", rechargeRequirementsFor("PP Cost 2.", { rechargeItemPP: 3 }), "PP Cost 3 (this item).");
ok("A the outcome card's header reads the item's kind, for Recharge Item only",
  /let headerAction = action;\n\s*if \(action\.key === "rechargeItem" && rechargeSetup\) \{[\s\S]{0,500}?if \(kindSpec\?\.rechargeItemPP\) headerAction = \{ \.\.\.action, requirements: rechargeRequirementsFor\(action\.requirements, kindSpec\) \};\n\s*\}\n\s*const lines = headerLines\(headerAction, effectiveApCost\);/.test(aw));
ok("A the cost spent is the kind's still (3.690.0)", /if \(kindSpec\?\.rechargeItemPP\) \{\n\s*ppCost = kindSpec\.rechargeItemPP;/.test(aw));

// B
const RL = await import(new URL("../module/magic/cast-result-line.mjs", import.meta.url));
equal("B the settle card's title says what it carries", [RL.settledCardTitle(1, 0), RL.settledCardTitle(0, 1), RL.settledCardTitle(2, 1), RL.settledCardTitle(0, 0)],
  ["Metamagic", "PP Sources", "Metamagic and PP Sources", "Metamagic"]);
ok("B both settle cards (the cast's own, and a held spell's) use it",
  (cw.match(/await postCard\(actor, `\$\{spell\.name\} — \$\{settledCardTitle\(mmx\.taken\.length, ppSources\.draws\.length\)\}`, settledLines\.map/g) ?? []).length === 2
  && !cw.includes("`${spell.name} — Metamagic`"));
ok("B imported", /import \{ castResultHeadline, settledCardTitle \} from "\.\/cast-result-line\.mjs";/.test(cw));

// C
const h = (o) => RL.castResultHeadline({ cast: true, ppSpent: 2, degree: "success", ...o });
equal("C a held spell is held; a cast spell takes effect",
  [h({ held: true }), h({}), h({ held: true, degree: "critical", ppSpent: 1 }), h({ held: true, isInnate: true })],
  ["<strong>The spell is held.</strong> 2 PP spent.", "<strong>The spell takes effect.</strong> 2 PP spent.", "<strong>The spell is held.</strong> 1 PP spent (Critical: base halved).", "<strong>The spell is held.</strong>"]);
equal("C a failed or called-off hold is still told so", [RL.castResultHeadline({ cast: false, held: true, ppSpent: 1, degree: "failure" }), RL.castResultHeadline({ cast: true, held: true, refunded: true })],
  ["<strong>The spell fails.</strong> 1 PP lost (half, rounded down).", "<strong>The spell is called off.</strong> Nothing was spent."]);
ok("C the cast tells the headline it is held only when the hold succeeds",
  /const headlineFacts = \{ cast: outcome\.cast, isInnate, ppSpent, degree, rodPaid, rodName: rodSource\?\.name \?\? "", held: Boolean\(holdingNow && outcome\.cast\) \};/.test(cw));

// Z
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.690.1, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.697.0/")], ["3.697.0", "3.697.0", true]);

if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  console.log(`verify-fixes-3690-1: ${failures.length} failure(s) of ${checks}`);
  process.exit(1);
}
console.log(`verify-fixes-3690-1: ${checks} checks, 0 failure(s).`);
