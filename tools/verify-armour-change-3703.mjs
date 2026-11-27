#!/usr/bin/env node
/**
 * verify-armour-change-3703 — core 3.703.0, donning and removing armour.
 *
 * Chapter 6: "Donning light armour takes 5 rounds, medium armour takes 4
 * minutes, and heavy armour takes 10 minutes; these times are doubled when
 * donning a full suit of armour." Graham, 19 November 2026: "As for armour,
 * please implement the rules correctly", and his rulings R1 to R5 (see
 * module/combat/armour-change.mjs).
 *
 *   A  what kind of change (suit or piece) and when it is an action
 *   B  the times: the chapter's, removal the same (R1), Quick Donning (R5)
 *   C  a task paid over the turns (R2)
 *   D  the workflow: piece as Interact, suit at once out of combat (R3), a
 *      task in combat, continue and abandon, the GM's "just set it"
 *   E  resolveAction applies it only once the action is taken and paid
 *   F  both sheets route through it; the Continue button; Quick Donning
 *      sets the result on you or an ally, through the GM when it must
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));
const between = (src, a, b) => { const i = src.indexOf(a); const j = src.indexOf(b, i + a.length); return i < 0 || j < 0 ? "" : src.slice(i, j); };

const ac = await mod("combat", "armour-change.mjs");
const { donningTime } = await mod("donning.mjs");

/* A — kind and when ------------------------------------------------------ */
{
  const chain = { type: "armour", name: "Chain", system: { category: "Medium", coversTorso: true } };
  const helm = { type: "armour", name: "Metal Helmet", system: { category: "Other", isHelmet: true } };
  equal("A1 light, medium, heavy: a suit", ["Light", "Medium", "Heavy"].map((c) => ac.armourChangeKind({ type: "armour", system: { category: c } })), ["suit", "suit", "suit"]);
  equal("A2 Other (helmet, bracers, greaves): a piece", ac.armourChangeKind(helm), "piece");
  equal("A3 armour with no category: a piece", ac.armourChangeKind({ type: "armour", system: {} }), "piece");
  equal("A4 not armour: nothing", ac.armourChangeKind({ type: "weapon", system: {} }), null);
  const fight = { combatStarted: true, actorInCombat: true };
  ok("A5 in combat: an action", ac.armourChangeInCombat({ ...fight, item: chain }) === true);
  ok("A6 out of combat: not", ac.armourChangeInCombat({ ...fight, combatStarted: false, item: chain }) === false);
  ok("A7 a combat this actor is not in: not", ac.armourChangeInCombat({ ...fight, actorInCombat: false, item: chain }) === false);
  ok("A8 a weapon is never this", ac.armourChangeInCombat({ ...fight, item: { type: "weapon", system: {} } }) === false);
}

/* B — the times ---------------------------------------------------------------- */
{
  const t = (cat, { full = false, removing = false, quick = null } = {}) =>
    ac.armourChangeTime({ usual: donningTime(cat, { fullSuit: full }), category: cat, removing, quick })?.ap;
  equal("B1 light 5 rounds = 15 AP", t("light"), 15);
  equal("B2 medium 4 minutes = 120 AP", t("medium"), 120);
  equal("B3 heavy 10 minutes = 300 AP", t("heavy"), 300);
  equal("B4 a full heavy suit, doubled = 600 AP", t("heavy", { full: true }), 600);
  equal("B5 R1: removing takes the same", [t("light", { removing: true }), t("heavy", { full: true, removing: true })], [15, 600]);
  const q = (degree) => ({ degree, by: "Squire" });
  equal("B6 Critical: light 2 rounds, medium 1 minute, heavy 1 minute", [t("light", { quick: q("critical") }), t("medium", { quick: q("critical") }), t("heavy", { quick: q("critical") })], [6, 30, 30]);
  equal("B7 Critical: remove any in 2 rounds", [t("light", { removing: true, quick: q("critical") }), t("heavy", { removing: true, quick: q("critical") })], [6, 6]);
  equal("B8 Heroic as Critical", t("heavy", { quick: q("heroic") }), 30);
  equal("B9 Success: light 5 rounds, medium/heavy 2 minutes, remove 5 rounds", [t("light", { quick: q("success") }), t("medium", { quick: q("success") }), t("heavy", { removing: true, quick: q("success") })], [15, 60, 15]);
  equal("B10 Q2: a full suit is not doubled on a Quick Donning time", t("heavy", { full: true, quick: q("success") }), 60);
  equal("B11 Failure: the usual time", [t("medium", { quick: q("failure") }), t("medium", { quick: q("partial") })], [120, 120]);
  equal("B12 Fumble: twice the usual, full suit included", [t("medium", { quick: q("fumble") }), t("heavy", { full: true, quick: q("blunder") }), t("light", { removing: true, quick: q("fumble") })], [240, 1200, 30]);
  const rune = ac.armourChangeTime({ usual: { ap: 3 }, category: "heavy", quick: q("critical") });
  equal("B13 Q3: a rune's shorter time stands against Quick Donning", rune.ap, 3);
  ok("B14 and the card says so", /shorter and stands/.test(rune.why));
  const fumbleRune = ac.armourChangeTime({ usual: { ap: 3 }, category: "heavy", quick: q("fumble") });
  equal("B15 a Fumble doubles a rune's time too", fumbleRune.ap, 6);
  equal("B16 the result is named", ac.armourChangeTime({ usual: { ap: 120 }, category: "medium", quick: q("success") }).quick, "success");
  ok("B17 no time, no answer", ac.armourChangeTime({ usual: null, category: "medium" }) === null);
  equal("B18 a category the chapter does not time gets no Quick Donning time", ac.armourChangeTime({ usual: { ap: 9 }, category: "Other", quick: q("critical") }).ap, 9);
  equal("B19 the degree list is the check's", ac.QUICK_DONNING_DEGREES, ["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
}

/* C — a task over the turns --------------------------------------------------- */
{
  const task = ac.newArmourTask({ item: { id: "i1", name: "Chain" }, removing: false, time: { ap: 15 }, quick: "" });
  equal("C1 a new task", task, { itemId: "i1", itemName: "Chain", removing: false, total: 15, paid: 0, quick: "" });
  equal("C2 a turn pays every AP it has", ac.armourPayment(task, 3), 3);
  equal("C3 never more than is owed", ac.armourPayment({ ...task, paid: 14 }, 3), 1);
  equal("C4 at 0 AP it asks for 1, so the prompt asks", ac.armourPayment(task, 0), 1);
  equal("C5 nothing owed, nothing paid", ac.armourPayment({ ...task, paid: 15 }, 3), 0);
  const after = ac.armourTaskAfter(task, 3);
  equal("C6 progress is kept", [after.task.paid, after.done], [3, false]);
  const last = ac.armourTaskAfter({ ...task, paid: 12 }, 3);
  equal("C7 the last AP finishes it", [last.task.paid, last.done], [15, true]);
  equal("C8 an overpayment is capped", ac.armourTaskAfter({ ...task, paid: 14 }, 3).task.paid, 15);
  ok("C9 the progress line", /3 of 15 AP paid, 12 AP to go/.test(ac.armourProgressLine(after.task)));
  ok("C10 and the finished lines", /is on, and worn/.test(ac.armourProgressLine(last.task)) && /is off/.test(ac.armourProgressLine({ ...last.task, removing: true })));
}

/* D — the workflow ------------------------------------------------------------------ */
const wf = read("module", "combat", "armour-change-workflow.mjs");
{
  const onSheet = between(wf, "export async function armourChangeOnSheet(", "async function abandonArmourChange(");
  ok("D1 not armour: handed back", /if \(!kind\) return \{ handled: false, changed: false \};/.test(onSheet));
  const piece = between(onSheet, 'if (kind === "piece") {', "/* A suit.");
  ok("D2 R4: a piece out of combat is free", /if \(!inCombat\) return \{ handled: false, changed: false \};/.test(piece));
  ok("D3 R4: in combat it is the Interact action", /await resolveAction\(actor, interact, \{ armourChange: \{ item, piece: true, equip \} \}\);/.test(piece));
  ok("D4 a GM may just set a piece", /if \(how === "set"\) return \{ handled: false, changed: false \};/.test(piece));
  const outside = between(onSheet, "/* R3:", "/* R2:");
  ok("D5 R3: out of combat it is done at once", /await item\.update\(\{ "system\.equipped": Boolean\(equip\) \}\);/.test(outside));
  ok("D6 R3: with the time on a card", /armourTimeLine\(esc\(item\.name\), removing, time\)/.test(outside));
  ok("D7 R3: the world clock is not advanced", /The world clock is not advanced/.test(outside) && !/advanceTime|worldTime/.test(wf));
  ok("D8 R5: the Quick Donning result is used out of combat too", /await spendQuickDonning\(actor, time\);/.test(outside));
  const spend = between(wf, "async function spendQuickDonning(actor, time) {", "\n}\n");
  ok("D8b R5: and once used it is gone", /if \(time\?\.quick && actor\?\.getFlag\?\.\(SYSTEM_ID, QUICK_DONNING_FLAG\)\) await actor\.unsetFlag\(SYSTEM_ID, QUICK_DONNING_FLAG\);/.test(spend));
  const inside = between(onSheet, "/* R2:", "\n}\n");
  ok("D9 R2: a GM may just set a suit", /if \(how === "set"\) return \{ handled: false, changed: false \};/.test(inside));
  ok("D10 R2: a task is started, and its first payment made",
    /await actor\.setFlag\(SYSTEM_ID, ARMOUR_TASK_FLAG, newArmourTask\(\{ item, removing, time, quick: time\.quick \}\)\);\n\s*await spendQuickDonning\(actor, time\);\n\s*await continueArmourChange\(actor, \{ starting: time \}\);/.test(inside));
  ok("D11 R2: in combat the box itself changes nothing", !/system\.equipped/.test(inside.replace(/if \(time\.ap <= 0\) \{[\s\S]*?return \{ handled: true, changed: true \};\n  \}/, "")));
  ok("D12 another task is abandoned only when asked", /if \(other !== "switch"\) return \{ handled: true, changed: false \};\n\s*await abandonArmourChange\(actor, "abandoned"\);/.test(inside));
  const under = between(onSheet, "if (task && task.itemId === item.id) {", "const time = await armourTimeFor(");
  ok("D13 R2: the box on a task under way: continue", /if \(choice === "continue"\) \{\n\s*await continueArmourChange\(actor\);/.test(under));
  ok("D14 R2: or abandon", /if \(choice === "abandon"\) await abandonArmourChange\(actor, "abandoned"\);/.test(under));
  const abandon = between(wf, "async function abandonArmourChange(", "async function continueArmourChange(");
  ok("D15 abandoning loses the progress", /await actor\.unsetFlag\(SYSTEM_ID, ARMOUR_TASK_FLAG\);/.test(abandon) && /The progress is lost/.test(abandon));
  const cont = between(wf, "async function continueArmourChange(", "export async function applyArmourChange(");
  ok("D16 a payment is a Manipulate action of the AP paid", /key: "armourChange",[\s\S]*traits: "Manipulate",\n\s*apCost: String\(pay\),/.test(cont));
  ok("D17 through resolveAction", /return resolveAction\(actor, action, \{ armourChange: \{ item, pay \} \}\);/.test(cont));
  ok("D18 paid from what the creature has", /armourPayment\(task, actor\.system\?\.resources\?\.ap\?\.value \?\? 0\)/.test(cont));
  ok("D19 a fight that ended part-way finishes at once", /if \(!actorInCombat\(actor\)\) \{[\s\S]*?await item\.update\(\{ "system\.equipped": !task\.removing \}\);/.test(cont));
  ok("D20 the time uses the runes' figure", /donningTimeFor\(item, \{ fullSuit: isFullSuit\(item\) \}\)/.test(wf));
  const apply = between(wf, "export async function applyArmourChange(", "export async function setQuickDonning(");
  ok("D21 a piece is put on when the Interact is taken", /if \(change\.piece\) \{\n\s*await item\.update\(\{ "system\.equipped": Boolean\(change\.equip\) \}\);/.test(apply));
  ok("D22 a paid-off task changes the armour", /if \(done\) \{\n\s*await item\.update\(\{ "system\.equipped": !task\.removing \}\);\n\s*await actor\.unsetFlag\(SYSTEM_ID, ARMOUR_TASK_FLAG\);/.test(apply));
  ok("D23 progress is saved, with a Continue button", /await actor\.setFlag\(SYSTEM_ID, ARMOUR_TASK_FLAG, next\);\n\s*return \[armourProgressLine\(next\), continueButton\(actor, next\)\];/.test(apply));
  ok("D24 a payment for another item pays nothing", /if \(!task \|\| task\.itemId !== item\.id\) return/.test(apply));
}

/* E — resolveAction ---------------------------------------------------------------- */
const AW = read("module", "combat", "action-workflow.mjs");
{
  ok("E1 the option is declared", /\n  armourChange = null,\n/.test(AW));
  const generic = between(AW, "    if (!(await ensureActionPoints(actor, action.apCost, action.name, { traits: action.traits }))) return null;\n    if (preparedPaysFor) {", "// WHERE THIS IS BEING DONE");
  const commit = generic.indexOf("await commitActionCost(");
  const gate = generic.indexOf("if (!(await conditionCommitGate(actor, action))) return null;");
  const applied = generic.indexOf("const { applyArmourChange } = await import(\"./armour-change-workflow.mjs\");");
  ok("E2 applied in the generic path, and nowhere else", applied > 0 && (AW.match(/await import\("\.\/armour-change-workflow\.mjs"\)/g) ?? []).length === 1);
  ok("E3 only once taken and paid for", commit > 0 && applied > commit);
  ok("E4 and only past Grabbed and the rest", gate > 0 && applied > gate);
  ok("E5 its lines reach the card", /for \(const said of await applyArmourChange\(actor, armourChange\)\) lines\.push\(line\(said\)\);/.test(generic));
}

/* F — sheets, button, Quick Donning, the relay ------------------------------------------ */
{
  const AS = read("module", "sheets", "actor-sheet.mjs");
  const toggle = between(AS, "static async toggleItemEquipped(", "static async itemDelete(");
  ok("F1 the Worn box routes armour", /if \(item\.type === "armour"\) \{\n\s*const \{ armourChangeOnSheet \} = await import\("\.\.\/combat\/armour-change-workflow\.mjs"\);\n\s*const worn = await armourChangeOnSheet\(this\.actor, item, \{ equip: willBeEquipped \}\);\n\s*if \(worn\.handled\) return;/.test(toggle));
  ok("F2 before the free update", toggle.indexOf("armourChangeOnSheet") > 0 && toggle.indexOf("armourChangeOnSheet") < toggle.indexOf("await item.update(changes);"));
  const IS = read("module", "sheets", "item-sheet.mjs");
  const submit = between(IS, "async _processSubmitData(", "static DEFAULT_OPTIONS");
  ok("F3 the item sheet's box: a suit always, a piece in combat",
    /const routes = armourChangeKind\(item\) === "suit" \|\| armourChangeInCombat\(/.test(submit));
  ok("F4 the box is held back from the save", /if \(routes\) \{\n\s*if \(flat\) delete submitData\["system\.equipped"\];/.test(submit));
  ok("F5 and routed", /const worn = await armourChangeOnSheet\(actor, item, \{ equip: wanted \}\);\n\s*if \(!worn\.handled\) await item\.update\(\{ "system\.equipped": wanted \}\);/.test(submit));
  const MAIN = read("scripts", "trg-prime.mjs");
  ok("F6 the button's hook is registered", /import \{ registerArmourChangeHooks \} from "\.\.\/module\/combat\/armour-change-workflow\.mjs";/.test(MAIN) && /\n  registerArmourChangeHooks\(\);\n/.test(MAIN));
  const hook = between(wf, "export function registerArmourChangeHooks()", "\n}\n");
  ok("F7 the button continues the task", /data-action="armourContinue"/.test(hook) && /await continueArmourChange\(actor\);/.test(hook));
  ok("F8 only the creature's owner may press it", /if \(!actor\?\.isOwner\)/.test(hook));
  const FW = read("module", "feats-workflow.mjs");
  const qd = between(FW, '"quick donning": {', '/* ---------------- General feats: M+N batch');
  ok("F9 Quick Donning: you or a targeted ally", /\[actor\.uuid, `\$\{actor\.name\} \(yourself\)`\], \.\.\.allies\.map/.test(qd));
  ok("F10 the result is set on that creature", /await setQuickDonning\(creature, \{ degree, by: actor\.name \}\);/.test(qd));
  ok("F11 and the card says so", /next donning or removal/.test(qd));
  ok("F12 through the GM when this client may not write it", /relayQuickDonning\(target, record,/.test(wf));
  ok("F12b only a degree the check reports is set", /if \(!QUICK_DONNING_DEGREES\.includes\(String\(record\?\.degree \?\? ""\)\)\) return false;/.test(wf));
  const relay = await mod("combat", "target-relay.mjs");
  ok("F13 the relay action exists", relay.RELAY_ACTIONS.QUICK_DONNING === "target.quickDonning");
  const set = [];
  const deps = { fromUuid: async () => ({ name: "Ally" }), setQuickDonning: async (t, r) => { set.push(r); } };
  const good = await relay.performRelay({ action: relay.RELAY_ACTIONS.QUICK_DONNING, uuid: "Actor.a", payload: { degree: "Success", by: "Squire" } }, deps);
  ok("F14 the GM's client sets it", good.ok === true && JSON.stringify(set[0]) === JSON.stringify({ degree: "success", by: "Squire" }));
  const bad = await relay.performRelay({ action: relay.RELAY_ACTIONS.QUICK_DONNING, uuid: "Actor.a", payload: { degree: "anything" } }, deps);
  ok("F15 and refuses anything but a degree", bad.ok === false && set.length === 1);
  const relaySrc = read("module", "combat", "target-relay.mjs");
  const listed = JSON.parse(relaySrc.match(/QUICK_DONNING_RELAY_DEGREES = Object\.freeze\((\[[^\]]*\])\)/)?.[1] ?? "null");
  equal("F16 the relay's degrees are armour-change's", listed, ac.QUICK_DONNING_DEGREES);
}

/* H — the time printed with its AP once (3.703.1) ------------------------------------ */
{
  equal("H1 rounds already name the AP", ac.armourTimeWithAP({ label: "5 rounds (15 AP)", ap: 15 }), "5 rounds (15 AP)");
  equal("H2 minutes get it added", ac.armourTimeWithAP({ label: "2 minutes", ap: 60 }), "2 minutes (60 AP)");
  ok("H3 the GM's dialog uses it", /takes \$\{esc\(armourTimeWithAP\(time\)\)\}, paid over/.test(wf) && !/\(\$\{time\.ap\} AP\)/.test(wf));
}

/* G — the version ----------------------------------------------------------------------- */
{
  const sys = JSON.parse(read("system.json"));
  equal("G1 the version and the download name 3.707.3", [sys.version, sys.download, JSON.parse(read("package.json")).version],
    ["3.717.1", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.717.1/trg-prime.zip", "3.717.1"]);
}

console.log(`verify-armour-change-3703: ${checks - failures.length}/${checks} checks passed`);
if (failures.length) { for (const f of failures) console.log(`  FAIL ${f}`); process.exit(1); }
