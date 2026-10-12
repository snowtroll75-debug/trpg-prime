#!/usr/bin/env node
/**
 * verify-feat-hooks-3625 — four small 3.625.0 openings for a module's feats:
 *   A. an action's own declared variants (Guide the Last Road);
 *   B. conditional scaling by ability, and by a difference of two figures
 *      (Scholarly Exegesis: Intelligence in place of Wisdom);
 *   C. the Aid boost (Practical Counsel: +1, to a maximum of +4);
 *   D. the initiative hook a module listens to (Battle Remembered).
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }

const { applyActionVariant } = await import(new URL("../module/feats.mjs", import.meta.url));
const { normaliseConditional, scalingFor } = await import(new URL("../module/conditionals.mjs", import.meta.url));
const { aidGrant, aidBoosts } = await import(new URL("../module/skill-aid.mjs", import.meta.url));

const rites = { key: "performLastRites", apCost: "10 minutes", outcomes: { critical: "7 days", success: "24 hours", partial: "none", failure: "nothing" }, variants: [{ feat: "Guide the Last Road", apCost: "1 minute", outcomes: { critical: "1 month", success: "7 days", partial: "24 hours" }, note: "in 1 minute, one step longer" }] };
equal("A1 without the feat the action is untouched (same object)", applyActionVariant(rites, ["Other"]) === rites, true);
const guided = applyActionVariant(rites, ["guide the last road"]);
equal("A2 with the feat (case-blind): the cost and the named rows replaced, the rest kept, the variant named", [guided.apCost, guided.outcomes, guided.variantApplied, guided.variantNote], ["1 minute", { critical: "1 month", success: "7 days", partial: "24 hours", failure: "nothing" }, "Guide the Last Road", "in 1 minute, one step longer"]);
ok("A3 the entry is not mutated", rites.apCost === "10 minutes" && rites.outcomes.critical === "7 days" && !("variantApplied" in rites));
equal("A4 an action with no variants is untouched", applyActionVariant({ key: "x", apCost: "1" }, ["Guide the Last Road"]).apCost, "1");

const actor = { system: { identity: { level: 6, classBonus: 2 }, attributes: { intelligence: { total: 4 }, wisdom: { total: 1 }, strength: { total: -1 } } } };
const scaling = scalingFor(actor);
equal("B1 the scaling carries the six abilities beside level and class bonus", [scaling.level, scaling.halfLevel, scaling.classBonus, scaling.intelligence, scaling.wisdom, scaling.strength, scaling.charisma], [6, 3, 2, 4, 1, -1, 0]);
const row = (valueFrom, extra = {}) => normaliseConditional({ kind: "modifier", valueFrom, type: "untyped", label: "Scholarly Exegesis", scope: "academic Religion checks", when: { checkTypes: ["skill"], subjects: ["religion"] }, ...extra }, { id: "f", name: "F", kind: "item" }, 0, scaling);
equal("B2 valueFrom 'intelligence-wisdom' is the difference (+3)", row("intelligence-wisdom")?.value, 3);
equal("B3 a single ability still works; a negative difference is kept; sign -1 flips it", [row("intelligence")?.value, row("wisdom-intelligence")?.value, row("intelligence-wisdom", { sign: -1 })?.value], [4, -3, -3]);
equal("B4 an unknown key or half drops the row; a zero difference drops it too", [row("intelligence-luck"), row("luck"), normaliseConditional({ kind: "modifier", valueFrom: "wisdom-wisdom", type: "untyped", label: "x", scope: "y", when: { checkTypes: ["skill"] } }, {}, 0, scaling)], [null, null, null]);
equal("B5 the old keys are unchanged", [row("classBonus")?.value, row("halfLevel")?.value], [2, 3]);

const counsel = aidBoosts([{ id: "pc", name: "Practical Counsel", flags: { "trg-prime": { aidBoost: { value: 1, max: 4 } } } }]);
equal("C1 the boost reads with its cap", counsel, { label: "Practical Counsel", value: 1, max: 4 });
equal("C2 a Success's +2 becomes +3, a Critical's +3 becomes +4, a Heroic's +4 stays at the cap; a Partial (+1) is below a Success and a fumble's penalty is untouched", [aidGrant({ degree: "success", skillLabel: "Nature", boost: counsel })?.value, aidGrant({ degree: "critical", skillLabel: "Nature", boost: counsel })?.value, aidGrant({ degree: "heroic", skillLabel: "Nature", boost: counsel })?.value, aidGrant({ degree: "partial", skillLabel: "Nature", boost: counsel })?.value, aidGrant({ degree: "fumble", skillLabel: "Nature", boost: counsel })?.value], [3, 4, 4, 1, -1]);
equal("C3 no boost: the table's own numbers", [aidGrant({ degree: "success", skillLabel: "Nature" })?.value, aidGrant({ degree: "heroic", skillLabel: "Nature" })?.value], [2, 4]);
equal("C4 the larger of two boosts wins; a disabled one is skipped", aidBoosts([{ id: "a", flags: { "trg-prime": { aidBoost: { value: 1, max: 4 } } } }, { id: "b", flags: { "trg-prime": { aidBoost: { value: 2, max: 5 } } } }, { id: "c", disabled: true, flags: { "trg-prime": { aidBoost: { value: 3, max: 9 } } } }])?.value, 2);

const combat = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs"), "utf8");
ok("D1 STRUCTURAL: the combat fires trgPrimeInitiativeRolled per combatant after the system's own offers", /await offerReactiveStance\(actor\);[\s\S]{0,900}Hooks\.callAll\("trgPrimeInitiativeRolled", \{ actor, combatant: this\.combatants\.get\(id\), combat: this \}\);/.test(combat));
const aw = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs"), "utf8");
ok("D2 STRUCTURAL: resolveAction applies the variant beside the other feat adjustments and the card names it", /action = applyActionVariant\(action, actorFeatNames\);/.test(aw) && /if \(action\.variantApplied\) \{/.test(aw));
const sk = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "skills.mjs"), "utf8");
ok("D3 STRUCTURAL: the Aid hands the aider's boost to aidGrant", /boost: aidBoosts\(Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\)\)/.test(sk));

const EXPECTED = 17;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-feat-hooks-3625: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-feat-hooks-3625: ${checks} checks — all green.`);
