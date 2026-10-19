#!/usr/bin/env node
/**
 * verify-restricted-ap — 3.648.0. Bonus AP and what it may buy.
 *
 * Graham, 15 October 2026: Fast Attack raised the AP maximum but nothing
 * granted the point; Quickened's point was granted and then clamped away by
 * the sheet's maximum, so Haste gave nothing; and Haste's "Strike and Stride
 * only" was a note. Ruling: a separate strike-only AP, spent first by a
 * Strike. Core rulebook, Quickened: "The individual effect that renders you
 * quickened will outline the specific actions that this bonus AP can be used
 * for."
 *
 *   P1–P13  the pure rules (combat/restricted-ap.mjs, turn-economy.mjs)
 *   S1–S10  where they are wired in
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const R = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "combat", "restricted-ap.mjs")).href);
const T = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "combat", "turn-economy.mjs")).href);
const P = await import(pathToFileURL(path.join(SYSTEM_ROOT, "module", "data", "pack-repairs.mjs")).href);

const Q = (actions) => ({ key: "quickened", label: "Quickened", actions, value: 1 });
const FA = { key: "fastAttack", label: "Fast Attack", actions: ["strike"], value: 1 };

// P1–P4 the grant
equal("P1 Haste's Quickened: one bonus AP, for Strike or Stride",
  R.turnGrant({ quickened: true, quickenedSources: [["strike", "stride"]] }), { bonus: 1, entries: [Q(["strike", "stride"])] });
equal("P2 a Quickened with no source to read is unrestricted",
  R.turnGrant({ quickened: true, quickenedSources: [null] }), { bonus: 1, entries: [] });
equal("P3 two sources: one AP for anything either allows; an unrestricted source frees it",
  [R.turnGrant({ quickened: true, quickenedSources: [["strike", "stride"], ["move", "strike"]] }).entries,
    R.turnGrant({ quickened: true, quickenedSources: [["strike", "stride"], null] }).entries],
  [[Q(["strike", "stride", "move"])], []]);
equal("P4 Fast Attack beside Haste: two bonus AP, one strike-only",
  R.turnGrant({ quickened: true, quickenedSources: [["strike", "stride"]], fastAttack: true }),
  { bonus: 2, entries: [Q(["strike", "stride"]), FA] });
// P5 losses
equal("P5 AP lost at the grant comes out of the narrowest restricted point first",
  [R.loseFromRestricted([Q(["strike", "stride"]), FA], 1), R.loseFromRestricted([Q(["strike", "stride"])], 2)],
  [[Q(["strike", "stride"])], []]);
// P6–P10 spending
equal("P6 a spell may not draw on Haste's point; a Stride may",
  [R.availableFor(4, [Q(["strike", "stride"])], []), R.availableFor(4, [Q(["strike", "stride"])], ["stride", "move"])], [3, 4]);
equal("P7 a Strike spends Fast Attack's point first, keeping Haste's wider one",
  R.spendPlan(5, [Q(["strike", "stride"]), FA], 1, ["strike"]), { newValue: 4, entries: [Q(["strike", "stride"])], fromRestricted: 1 });
equal("P8 a 3 AP spell from 4 leaves Haste's point standing",
  R.spendPlan(4, [Q(["strike", "stride"])], 3, []), { newValue: 1, entries: [Q(["strike", "stride"])], fromRestricted: 0 });
equal("P9 a spend that overruns the general points takes the restricted too",
  R.spendPlan(4, [Q(["strike", "stride"])], 4, []), { newValue: 0, entries: [], fromRestricted: 0 });
equal("P10 a restricted point is never more than the pool holds",
  [R.cappedEntries([Q(["strike"])], 1), R.cappedEntries([Q(["strike"])], 0), R.cappedEntries([Q(["strike", "stride"]), FA], 1)],
  [[Q(["strike"])], [], [Q(["strike", "stride"])]]);
// P11–P12 naming
equal("P11 what an action counts as",
  [R.useKindsOf("Longsword — Strike"), R.useKindsOf("Stride"), R.useKindsOf("Step"), R.useKindsOf("Climb", { traits: "Move" }),
    R.useKindsOf("Fireball"), R.useKindsOf("Charge", { use: "move" })],
  [["strike"], ["stride", "move"], ["step", "move"], ["move"], [], ["move"]]);
equal("P12 the printed sources and their limits",
  ["Haste", "Speed", "Swift Sonata", "Channel The Aspect", "Temporal Distortion"].map(R.quickenedActionsFor),
  [["strike", "stride"], ["strike", "stride"], ["strike", "stride", "step"], ["move", "strike"], null]);
// P13 the regain
equal("P13 Fast Attack's point is regained, and Stunned meets it",
  [T.computeAPRegain({ quickened: true, extra: 1 }).ap, T.computeAPRegain({ quickened: true, extra: 1, stunned: 1 }).ap, T.computeAPRegain({ extra: 1 }).extraBonus],
  [5, 4, 1]);

const src = {
  apw: read("module", "combat", "action-points-workflow.mjs"),
  act: read("module", "documents", "actor.mjs"),
  cmb: read("module", "documents", "combat.mjs"),
  atk: read("module", "combat", "attack-workflow.mjs"),
  mov: read("module", "combat", "movement-workflow.mjs"),
  spe: read("module", "magic", "spell-effects.mjs"),
  eff: read("module", "combat", "effect-application-workflow.mjs"),
  fw: read("module", "feats-workflow.mjs"),
  rel: read("module", "combat", "reload-workflow.mjs"),
  pc: read("module", "magic", "pending-cast-workflow.mjs"),
  to: read("module", "magic", "turn-options-workflow.mjs"),
  cci: read("module", "dice", "check-card-interactions.mjs"),
  aw: read("module", "combat", "action-workflow.mjs"),
  hbs: read("templates", "actor", "actor-sheet.hbs")
};
ok("S1 the AP gate counts only what this action may draw on",
  /const kinds = useKindsOf\(actionName, \{ use, traits \}\);\n  const currentAP = apAvailable\(actor, kinds\);/.test(src.apw));
ok("S2 the spender takes restricted points by the plan and writes what is left",
  /const plan = spendPlan\(currentAP, grant\.entries, cost, useKindsOf\(actionName, \{ use, traits \}\)\);\n    grantUpdate\[`flags\.\$\{SYSTEM_ID\}\.\$\{AP_GRANT_FLAG\}\.entries`\] = plan\.entries;/.test(src.apw)
  && /\.\.\.grantUpdate\n  \}\);/.test(src.apw)
  && /return spendActionPoints\(actor, apCost, actionName, \{ use, traits \}\);/.test(src.apw));
ok("S3 the sheet no longer clamps away the turn's bonus AP",
  /\+ \(Number\(this\.flags\?\.\["trg-prime"\]\?\.apGrant\?\.bonus\) \|\| 0\)/.test(src.act));
ok("S4 Phase 1 grants Fast Attack's point and records the turn's restricted points",
  /extra: fastAttack \? 1 : 0/.test(src.cmb)
  && /const grant = turnGrant\(\{ quickened, quickenedSources, fastAttack \}\);/.test(src.cmb)
  && /loseFromRestricted\(grant\.entries, Math\.max\(0, grossPool - finalAP\)\)/.test(src.cmb)
  && /\[`flags\.\$\{SYSTEM_ID\}\.\$\{AP_GRANT_FLAG\}`\]: \{ combatId: this\.id, bonus: acting\.canAct \? grant\.bonus : 0, entries: grantEntries \}/.test(src.cmb));
ok("S5 a Strike and a Stride say what they are, and movement measures what it may draw on",
  /await spendActionPoints\(actor, "1", `\$\{weapon\.name\} — Strike`, \{ use: "strike" \}\);/.test(src.atk)
  && /await spendActionPoints\(actor, String\(due\.apDue\), "Stride", \{ use: "stride" \}\);/.test(src.mov)
  && /apAvailable\(actor, moveKinds\) - tally\.pendingSpend/.test(src.mov));
ok("S6 a spell's Quickened carries its source's limit, and two sources widen it",
  /apFor: Array\.isArray\(effect\.apFor\) \? effect\.apFor : \(quickenedActionsFor\(spell\?\.name\) \?\? "any"\)/.test(src.spe)
  && /else next = \[\.\.\.new Set\(\[\.\.\.existing, \.\.\.incoming\]\)\];/.test(src.eff)
  && /updates\[`flags\.\$\{SYSTEM_ID\}\.quickenedFor`\] = next;/.test(src.eff));
ok("S7 Phase 1 reads each Quickened's limit",
  /const f = e\.getFlag\?\.\(SYSTEM_ID, "quickenedFor"\); return Array\.isArray\(f\) \? f : null;/.test(src.cmb));
equal("S8 the feat actions gate on general AP and write the pool, not the general count",
  [(src.fw.match(/const ap = generalAP\(actor\);/g) ?? []).length, (src.fw.match(/"system\.resources\.ap\.value": ap - /g) ?? []).length], [12, 0]);
ok("S9 reloads, extra casting time, turn options and AP-priced saves cannot spend the restricted point",
  (src.rel.match(/generalAP\(actor\)/g) ?? []).length === 3
  && /const available = generalAP\(actor\);/.test(src.pc)
  && /const ap = generalAP\(actor\);/.test(src.to)
  && /if \(generalAP\(actor\) < Number\(raw\.ap\)\) \{/.test(src.cci)
  && (src.aw.match(/ensureActionPoints\(actor, [a-zA-Z.]+, action\.name, \{ traits: action\.traits \}\)/g) ?? []).length === 5);
{
  const rep = P.PACK_REPAIRS.find((r) => r.id === "channel-the-aspect-apoptions-3648");
  const limbs = rep?.to?.find((o) => /^Limbs/.test(o.label));
  ok("S10 Channel The Aspect's Limbs is Quickened for Move or Strike, and the sheet shows the restricted AP",
    JSON.stringify(limbs?.effects) === JSON.stringify([{ kind: "condition", target: "self", condition: "quickened", apFor: ["move", "strike"] }])
    && /\(\{\{system\.resources\.ap\.restricted\}\}★\)/.test(src.hbs));
}

const EXPECTED = 24;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-restricted-ap: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-restricted-ap: ${checks} checks — all green.`);
