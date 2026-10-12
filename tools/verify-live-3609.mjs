#!/usr/bin/env node
/**
 * verify-live-3609 — the nine findings of the 3.609.0 live drive.
 *
 * NEW at 3.609.1. `claude/live-testing-report-3.609.0.md` has the drive;
 * Graham ruled the one open question on 1 October 2026 — "a burst with a
 * range is aimed at a point within range; one with no range centres on the
 * caster" ("Yes go with your recommendation").
 *
 *   A  F1  a recurring save's critical lands on the creature in the area
 *   B  F2  Turn Undead's circle asks no entry save
 *   C  F3  an entry save does not hang its own emanation
 *   D  F4  Vision Of Havoc's stun is held for its minute
 *   E  F5  one save memory per creature, not per NPC sheet
 *   F  F6  Twisted Fate's universal disadvantage survives being read back
 *   G  F7  a ranged burst is aimed
 *   H  F8  a chosen mode's save and rows are the ones the cast reads
 *   I  F9  Time Stop's actions are kept past the ceiling, rolled blind
 *
 * Where the behaviour is Foundry's (a turn boundary, a template click) the
 * check reads the source in the shape that carries it — with a behaviour
 * test beside it wherever the rule is pure.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { applyAreaChoice, areaChoiceRows } from "../module/magic/area-choice.mjs";
import { collectConditionals, matchesCheck, normaliseConditional } from "../module/conditionals.mjs";
import { conditionalLine } from "../module/magic/spell-conditional.mjs";
import { parseSpellArea } from "../module/magic/spell-template.mjs";
import { emanationIsLive } from "../module/magic/emanation.mjs";
import { zoneIsPlaced } from "../module/magic/obscuring-zone.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const count = (text, needle) => text.split(needle).length - 1;

const ladder = read("module", "magic", "recurring-ladder-workflow.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");
const flow = read("module", "magic", "emanation-workflow.mjs");
const effects = read("module", "magic", "spell-effects.mjs");
const combat = read("module", "documents", "combat.mjs");
const actor = read("module", "documents", "actor.mjs");
const gate = read("module", "combat", "sanctuary-gate.mjs");
const template = read("module", "magic", "spell-template.mjs");

/* ================================================================== *
 * A. F1 — the critical of a recurring save
 * ================================================================== */
{
  const call = ladder.match(/await rollCriticalInjury\(([\s\S]{0,240}?)\}\);/);
  ok("A1 the recurring ladder's critical names the creature as its target",
    Boolean(call) && /targetActor: actor,/.test(call[1]),
    "without it the critical is rolled and printed and lands on nobody — Incendiary Cloud's Fatal one included");
  ok("A2 and the creature is not the one rolling it when a caster is recorded",
    Boolean(call) && /^caster \?\? actor, \{/.test(call[1].trim()));
  ok("A3 the caster is read from the Region's record",
    /for \(const \{ region, spec, name, saveDC, casterUuid \} of zones\)/.test(ladder)
    && /await fromUuid\(casterUuid\)/.test(ladder));
}

/* ================================================================== *
 * B. F2 — no entry save for a save owed at the turn
 * ================================================================== */
ok("B1 the emanation record carries no save when the spell saves at the start of a turn",
  /save: spellSavesOnTurnStart\(spellData\.effects\) \? null : emanationSave\(spellData\),/.test(cast),
  "Turn Undead asked every creature in the circle — its caster too — on the way in");

/* ================================================================== *
 * C. F3 — the write-back inside a refresh
 * ================================================================== */
ok("C1 recordEmanation can be asked not to reconcile",
  /export async function recordEmanation\(actor, castId, descriptor, \{ reconcile = true \} = \{\}\)/.test(flow));
ok("C2 and reconciling is what that switches off",
  /if \(!descriptor\?\.frozen && reconcile\) \{/.test(flow));
ok("C3 the entry save's write-back inside a refresh does not reconcile",
  flow.includes("await recordEmanation(actor, entry.id, { ...emanation, tested }, { reconcile: false });"),
  "a refresh that queues a refresh behind itself waits for ever — Bane's first latecomer never got the penalty");
ok("C4 and it is the only call that turns it off",
  count(flow, "reconcile: false") === 1 && count(cast, "reconcile: false") === 0);

/* ================================================================== *
 * D. F4 — Vision Of Havoc's held stun
 * ================================================================== */
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let havoc = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (k.startsWith("!items!") && v?.name === "Vision Of Havoc") havoc = v.system;
    }
  } finally { await db.close(); }
  const follow = (havoc?.effects ?? []).find((e) => e?.kind === "followUpSave");
  const stuns = ["failure", "fumble"].map((r) => follow?.rungs?.[r]?.find((x) => x?.condition === "stunned"));
  ok("D1 both of Vision Of Havoc's stun rows hold", stuns.every((x) => x?.hold === true && x?.value === 1));
  ok("D2 and keep the save that ends them", stuns.every((x) => x?.conditionSave?.onSuccess === "end"));
}
ok("D3 a held condition is stamped on the effect it put there",
  /if \(effect\.hold\) \{[\s\S]{0,400}setFlag\(SYSTEM_ID, "conditionHold", holdAt\)/.test(effects));
ok("D4 the turn tracker reads the hold off the stun",
  /getFlag\?\.\(SYSTEM_ID, "conditionHold"\)/.test(combat));
ok("D5 and a held stun is not reduced or ended by the turn",
  /if \(stunned && acting\.canAct && stunHold > 0 && regain\.stunnedRemaining < stunHold\) \{[\s\S]{0,500}\} else if \(stunned && acting\.canAct\) \{/.test(combat));

/* ================================================================== *
 * E. F5 — per creature
 * ================================================================== */
{
  const twins = [
    { id: "goblin", uuid: "Scene.s.Token.a.Actor.goblin", name: "Goblin A" },
    { id: "goblin", uuid: "Scene.s.Token.b.Actor.goblin", name: "Goblin B" },
    { id: "wiz", uuid: "Actor.wiz", name: "Wizard" }
  ];
  const rows = areaChoiceRows(twins, "Actor.wiz");
  ok("E1 two tokens of one NPC are two rows", new Set(rows.map((r) => r.id)).size === 3);
  ok("E2 the caster is recognised by uuid", rows.find((r) => r.name === "Wizard")?.isCaster === true);
  ok("E3 choosing one twin keeps only that twin",
    applyAreaChoice(twins, ["Scene.s.Token.b.Actor.goblin"]).map((a) => a.name).join() === "Goblin B");
  ok("E4 a plain object with no uuid still keys by id",
    applyAreaChoice([{ id: "x", name: "X" }], ["x"]).length === 1);
}
ok("E5 the wards remember an unlinked opponent by its token",
  /function opponentKey\(attacker\) \{[\s\S]{0,200}`token-\$\{tokenId\}`/.test(gate));
ok("E6 and no ward reads the bare actor id any more", !/attacker\.id\b/.test(gate));
ok("E7 every verdict and record goes through the key",
  count(gate, "opponentKey(attacker)") >= 5);

/* ================================================================== *
 * F. F6 — the universal grant, read back
 * ================================================================== */
{
  const authored = { kind: "disadvantage", label: "Twisted Fate", scope: "all checks for the duration",
    when: { always: true }, auto: true };
  const first = normaliseConditional(authored, { id: "spell", name: "Twisted Fate", kind: "effect" }, 0);
  ok("F1 an authored universal grant normalises", first?.always === true);
  const again = normaliseConditional(first, { id: "fx", name: "Twisted Fate", kind: "effect" }, 0);
  ok("F2 and survives being normalised again, as it is when read off the effect",
    again?.always === true && again?.kind === "disadvantage",
    "the effect stores the normalised form; reading it back dropped it as scopeless");
  const found = collectConditionals([], [{ id: "fx", name: "Twisted Fate", flags: { "trg-prime": { conditionals: [first] } } }]);
  ok("F3 the collector finds it on the effect", found.length === 1 && found[0].auto === true);
  ok("F4 and it reaches a save", matchesCheck(found[0], { checkType: "save", subject: "fortitude" }));
  ok("F5 a scopeless entry with no `always` anywhere is still refused",
    normaliseConditional({ kind: "advantage", label: "x", when: {} }) === null);
  ok("F6 the card says disadvantage", /disadvantage on all checks/.test(conditionalLine("Goblin", [first])));
  ok("F7 and advantage stays advantage",
    /advantage on Search/.test(conditionalLine("Elf", [{ kind: "advantage", scope: "Search" }]))
    && !/disadvantage/.test(conditionalLine("Elf", [{ kind: "advantage", scope: "Search" }])));
}

/* ================================================================== *
 * G. F7 — a burst with a range is aimed
 * ================================================================== */
ok("G1 a burst is its own shape", parseSpellArea("40-foot burst")?.shape === "burst");
ok("G2 an emanation is still an emanation", parseSpellArea("30-foot emanation")?.shape === "emanation");
ok("G3 and a radius a radius", parseSpellArea("20-foot radius")?.shape === "radius");
ok("G4 a burst centres on the caster only without a range",
  /\|\| \(config\.shape === "burst" && !\(Number\(rangeFeet\) > 0\)\)\);/.test(template)
  && /const centredOnCaster = !isDirectional && \(rangeFeet == null \|\| config\.shape === "emanation"/.test(template));
ok("G5 Tangling Creepers' burst is placed, and not a following emanation",
  zoneIsPlaced({ area: "40-foot burst", effects: [{ kind: "zone", label: "Tangling Creepers", speedPenalty: -10 }] }));
ok("G6 a burst is never a live emanation by its area text alone",
  !emanationIsLive({ area: "40-foot burst", effects: [{ kind: "bonus", target: "targets" }] }));

/* ================================================================== *
 * H. F8 — the chosen mode
 * ================================================================== */
ok("H1 the Save DC is set by the mode's defence when it names one",
  /const castDefence = effDefence \?\? spellData\.defence;\n\s*if \(castDefence\) \{\n\s*saveDC = nominalSaveDC;/.test(cast),
  "Mud to Rock printed its Reflex on the mode and rolled nothing");
ok("H2 and the card names that defence", /`Save: <strong>\$\{castDefence\}<\/strong> against DC/.test(cast));
ok("H3 the area's row loops read the mode's rows",
  // 7 -> 9 at 3.610.0: the wall's and the storm's loops read the same rows.
  // 9 -> 10 at 3.612.0: Web's entry check (block 34's R6) reads them too.
  count(cast, "for (const row of (effEffects ?? [])) {") === 10,
  "Rock to Mud's difficult terrain is on its mode");
ok("H4 and none of them reads the spell's rows past a chosen mode",
  !/for \(const row of \(spellData\.effects \?\? \[\]\)\) \{\n\s*if \(row\?\.kind !== "difficultTerrain"/.test(cast));

/* ================================================================== *
 * I. F9 — Time Stop
 * ================================================================== */
ok("I1 the AP ceiling is lifted by the allowance",
  /const max = Number\(resource\.max \?\? 0\) \+ \(key === "ap" \? Math\.max\(0, Number\(apAllowance\) \|\| 0\) : 0\);/.test(actor));
ok("I2 the allowance is the actor's apOverflow flag",
  /prepareResourcePercentages\(system, \{ apAllowance: Number\(this\.flags\?\.\["trg-prime"\]\?\.apOverflow\) \|\| 0 \}\);/.test(actor));
ok("I3 Time Stop writes the allowance with the actions",
  /"system\.resources\.ap\.value": before \+ extra,\n\s*\[`flags\.\$\{SYSTEM_ID\}\.apOverflow`\]: overflow \+ extra/.test(effects));
ok("I4 from the stored value, not the clamped one",
  /const before = Number\(target\._source\?\.system\?\.resources\?\.ap\?\.value/.test(effects));
ok("I5 the next turn's regain clears it",
  /\[`flags\.\$\{SYSTEM_ID\}\.apOverflow`\]: deletionValue\(\),/.test(combat));
ok("I6 the roll is blind by roll mode",
  /\{ rollMode: CONST\.DICE_ROLL_MODES\?\.BLIND \?\? "blindroll" \}/.test(effects),
  "whisper and blind in the message data were overwritten by the public roll mode");

/* ================================================================== *
 * J. 3.609.2 — the three things the 3.609.1 drive found
 * ================================================================== */
{
  const attack = read("module", "combat", "attack-workflow.mjs");
  ok("J1 G1 — a Strike's modifiers are read off the actor after the ward gate",
    /\.\.\.\(actor\.system\.combat\?\.attack\?\.checkModifiers \?\? \[/.test(attack)
    && attack.indexOf("sanctuary = await sanctuaryCheck(actor, targetActor") < attack.indexOf("...(actor.system.combat?.attack?.checkModifiers ?? ["),
    "Visage's Failure made the attacker frightened 2 and the attack it gated rolled without the −2");
  ok("J2 G2 — the save path is handed the chosen mode's rows",
    /defence: effDefence,[\s\S]{0,400}effects: effEffects,/.test(cast),
    "Mud to Rock's card said to apply by hand a grab already applied");
  ok("J3 G3 — what claims the Region is read off the chosen mode's rows",
    cast.includes("shouldClearAreaRegion(placedArea?.regionId, { effects: effEffects }, emanationIsLive(spellData), castRefunded)"),
    "Rock to Mud's difficult terrain was deleted the moment it was laid");
}

if (failures.length) {
  console.log(`verify-live-3609: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-live-3609: OK — ${checks} checks. Nine things the 3.609.0 drive found and three the 3.609.1 drive found, each fixed where it happened.`);
