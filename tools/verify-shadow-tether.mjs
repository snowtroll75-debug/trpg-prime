#!/usr/bin/env node
/**
 * verify-shadow-tether — R8: the one rule this block INVENTED.
 *
 * NEW at 3.599.0. Graham's R8 of block 31.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EVERY OTHER DEFECT THIS PROJECT HAS FOUND IN THE GRIMOIRE IS A RULE
 * MISSING. This one was a rule invented: Shadow Tether's authored row was a
 * bare `condition: "immobilised"` with no trigger, so a failed save pinned
 * the target WHERE IT STOOD, and a `note` beside it explained the rule the
 * row did not implement. A 6 PP spell that immobilises outright is a much
 * better spell than the printed one, which merely stops a creature running
 * away.
 *
 * SECTION D IS THAT DEFECT, refused by name.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  TRIGGER_ORIGINS, distanceTriggerArmedLine, distanceTriggerFiredLine,
  distanceTriggerFires, distanceTriggerImmediateLine, normaliseDistanceTrigger
} from "../module/magic/distance-trigger.mjs";
import { TETHER_FLAG, checkTethers, tethersOn } from "../module/magic/distance-trigger-workflow.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => {
  checks += 1;
  if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
};
const eq = (label, got, want, detail = "") =>
  ok(label, String(got) === String(want), `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}${detail ? ` — ${detail}` : ""}`);

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
const applier = strip(read("module", "magic", "spell-effects.mjs"));
const watcher = strip(read("module", "magic", "distance-trigger-workflow.mjs"));
const boot = strip(read("scripts", "trg-prime.mjs"));

/* ================================================================== *
 * B. THE BOUNDARY, WHICH IS THE WHOLE RULE
 * ================================================================== */

const spec = normaliseDistanceTrigger({
  kind: "distanceTrigger", condition: "immobilised", feet: 30, from: "caster", label: "Shadow Tether"
});
ok("B0 a well-formed row normalises", Boolean(spec));
eq("B1 AT EXACTLY 30 FEET THE TETHER IS SLACK", distanceTriggerFires(spec, 30), false,
  "\"more than 30 feet\" is not \"30 feet or more\"");
eq("B1b at 31 it is taut", distanceTriggerFires(spec, 31), true);
eq("B1c and at 29 it is not", distanceTriggerFires(spec, 29), false);
eq("B2 touching is not taut", distanceTriggerFires(spec, 0), false);
eq("B3 AN UNMEASURABLE DISTANCE DOES NOT FIRE", distanceTriggerFires(spec, NaN), false,
  "a canvas that cannot answer must not immobilise somebody");
eq("B3b nor does a missing one", distanceTriggerFires(spec, null), false);
eq("B3c nor a string that is not a number", distanceTriggerFires(spec, "far"), false);
eq("B4 a malformed spec never fires", distanceTriggerFires(null, 500), false);

/* ================================================================== *
 * R. THE REFUSALS
 * ================================================================== */

eq("R1 A ROW WITH NO CONDITION IS REFUSED",
  normaliseDistanceTrigger({ kind: "distanceTrigger", feet: 30 }), null,
  "it would arm, fire, and apply nothing");
eq("R2 A THRESHOLD OF ZERO IS REFUSED",
  normaliseDistanceTrigger({ kind: "distanceTrigger", condition: "immobilised", feet: 0 }), null,
  "a tether of no length fires on the first step, which is the defect this file removes");
eq("R2b and so is a negative one",
  normaliseDistanceTrigger({ kind: "distanceTrigger", condition: "immobilised", feet: -30 }), null);
eq("R2c and a missing one",
  normaliseDistanceTrigger({ kind: "distanceTrigger", condition: "immobilised" }), null);
eq("R3 an origin nothing can resolve is refused",
  normaliseDistanceTrigger({ kind: "distanceTrigger", condition: "immobilised", feet: 30, from: "moon" }), null);
eq("R3b and the default origin is the caster",
  normaliseDistanceTrigger({ kind: "distanceTrigger", condition: "immobilised", feet: 30 })?.from, "caster");
eq("R4 another kind wearing the fields is refused",
  normaliseDistanceTrigger({ kind: "condition", condition: "immobilised", feet: 30 }), null);
eq("R5 the origins this rule knows", JSON.stringify(TRIGGER_ORIGINS), JSON.stringify(["caster"]));
eq("R6 the condition is lower-cased so one spelling reaches the registry",
  normaliseDistanceTrigger({ kind: "distanceTrigger", condition: "Immobilised", feet: 30 })?.condition,
  "immobilised");

/* ================================================================== *
 * A. THE APPLIER
 * ================================================================== */

ok("A1 the kind is handled and declared",
  HANDLED_EFFECT_KINDS.includes("distanceTrigger") && /case "distanceTrigger": \{/.test(applier));
ok("A2 THE TETHER RECORDS WHAT IT MEASURES FROM",
  /tetherAnchor: casterToken\?\.uuid \?\? ""/.test(applier),
  "without the anchor the watcher has nothing to measure to");
ok("A2b and the spec itself, so the watcher needs no second copy of the rule",
  /\[TETHER_FLAG\]: \{ kind: "distanceTrigger", \.\.\.tetherSpec \}/.test(applier));
/*
 * A2c IS THE DEFECT THE 3.599.0 DRIVE FOUND, and the only check here with real
 * teeth about the flag.
 *
 * The applier stored the NORMALISED spec, and `normaliseDistanceTrigger`
 * refuses a row whose `kind` is not "distanceTrigger" — which a normalised
 * spec does not carry. The watcher re-normalised the flag, got null, and
 * skipped the tether: THE SPELL COULD NEVER FIRE. Armed for ever, at any
 * distance, with nothing on any card to say so.
 *
 * A2 and A2b both passed throughout. They checked that the flag was WRITTEN
 * and that the reader MENTIONED the normaliser. Neither asked the only
 * question that mattered: does a stored spec survive being read back? This is
 * the same round-trip trap `flat-ladder.mjs` records from 3.485.0 — and it
 * caught this project twice because the check was about spelling both times.
 */
{
  const spec0 = normaliseDistanceTrigger({
    kind: "distanceTrigger", condition: "immobilised", feet: 30, from: "caster", label: "Shadow Tether"
  });
  const stored = { kind: "distanceTrigger", ...spec0 };
  eq("A2c A STORED SPEC SURVIVES BEING READ BACK",
    JSON.stringify(normaliseDistanceTrigger(stored)), JSON.stringify(spec0),
    "the watcher re-normalises the flag; a spec that does not round-trip is a spell that never fires");
  eq("A2d and the bare normalised spec does NOT, which is why the kind travels with it",
    normaliseDistanceTrigger(spec0), null,
    "this is the trap: a normalised spec carries no kind, and the kind guard is strict on purpose");
}
ok("A3 IT IS TESTED AT THE CAST TOO, because the spell reaches twice the tether's length",
  /tautNow = distanceTriggerFires\(tetherSpec, feetNow\);/.test(applier)
  && /if \(tautNow\) \{/.test(applier));
ok("A3b and a taut cast applies the condition instead of arming a trigger that would never fire",
  /distanceTriggerImmediateLine\(target\.name, tetherSpec, feetNow\)/.test(applier));
ok("A3c with no canvas it simply arms rather than measuring nothing",
  /if \(casterToken && targetToken\) \{/.test(applier),
  "distanceBetween with no tokens would answer 0 and the tether would never fire");
ok("A4 the effect carries the spell's clock and no changes",
  /changes: \[\],\s+flags: tetherFlags/.test(applier)
  && /tetherTiming\.spellEffectEnd/.test(applier));
ok("A5 a malformed row is said out loud rather than doing nothing",
  /declares a malformed tether/.test(applier));

/* ================================================================== *
 * W. THE WATCHER
 * ================================================================== */

ok("W1 it is wired at the system's ready pass",
  /registerDistanceTriggers\(\);/.test(boot) && /distance-trigger-workflow\.mjs/.test(boot),
  "a watcher nobody registers is a rule with no caller");
ok("W2 `updateToken`, because where the creature ENDED UP is the question",
  /Hooks\.on\("updateToken"/.test(watcher) && !/preMoveToken/.test(watcher.replace(/[^]*?export function registerDistanceTriggers/, "")),
  "preMoveToken would measure the distance it is escaping from");
ok("W2b and only on a move",
  /if \(!\("x" in changed\) && !\("y" in changed\)\) return;/.test(watcher),
  "a token renamed or re-imaged has not walked");
/*
 * W3 READS THE ASSIGNMENT, not the name. `/tethersOn\(actor\)/` was satisfied
 * by the function's OWN parameter list — `export function tethersOn(actor)` —
 * so a mutation that stopped calling it survived. A check satisfied by an
 * unrelated occurrence, the fifth defect shape, in the check itself.
 */
/*
 * W0 DRIVES THE TWO READERS. The uncalled-export ratchet caught the first
 * version: `tethersOn` and `checkTethers` were exported and this file only
 * asserted regexes ABOUT them, which is not a caller. Running them is both a
 * caller and a better test — and `checkTethers` on a creature with no tether
 * returns before it touches Foundry at all, which is worth knowing.
 */
{
  const eff = (flags, extra = {}) => ({
    disabled: false, flags, getFlag: (_s, k) => flags?.["trg-prime"]?.[k], ...extra
  });
  const armed = eff({ "trg-prime": { [TETHER_FLAG]: { condition: "immobilised", feet: 30 } } });
  const other = eff({ "trg-prime": { spellBuff: true } });
  const off = eff({ "trg-prime": { [TETHER_FLAG]: { condition: "immobilised", feet: 30 } } },
    { disabled: true });
  eq("W0 an armed tether is found", tethersOn({ effects: [armed] }).length, 1);
  eq("W0a another spell's effect is not", tethersOn({ effects: [other] }).length, 0);
  eq("W0b A SUPPRESSED TETHER DOES NOT MEASURE", tethersOn({ effects: [off] }).length, 0);
  eq("W0c appliedEffects is preferred over effects",
    tethersOn({ appliedEffects: [armed], effects: [armed, armed] }).length, 1);
  eq("W0d and an actor with nothing on it is safe to ask", tethersOn(null).length, 0);
  const idle = await checkTethers({ actor: { effects: [] } });
  eq("W0e A CREATURE WITH NO TETHER COSTS NOTHING TO CHECK",
    JSON.stringify(idle), JSON.stringify({ fired: [], measured: null }),
    "this runs on every token move in the world, so the common case must return at once");
  const noActor = await checkTethers(null);
  eq("W0f and neither does a token with no actor", JSON.stringify(noActor),
    JSON.stringify({ fired: [], measured: null }));
}
ok("W3 ONLY THE TETHERED CREATURE'S OWN MOVEMENT ARMS IT",
  /checkTethers\(tokenDocument\)/.test(watcher)
  && /const tethers = tethersOn\(actor\);/.test(watcher),
  "\"if THEY move\" — a caster cannot immobilise somebody by retreating");
ok("W4 THE TETHER FIRES ONCE and is then spent",
  /await tether\.delete\(\);\s*fired\.push/.test(watcher),
  "otherwise every later step re-applies a condition the creature already has");
ok("W5 the condition inherits the SPELL's clock, not a fresh one",
  /spellEffectEnd: tether\.getFlag\(SYSTEM_ID, "spellEffectEnd"\)/.test(watcher),
  "\"immobilised for the duration\" is the spell's duration");
ok("W6 AN ANCHOR THAT HAS GONE REMOVES THE TETHER, out loud",
  /if \(!anchor\) \{/.test(watcher) && /nothing left to measure from/.test(watcher),
  "a silent disarm is a spell that stops working with no symptom");
ok("W7 the measurement is the system's own, not a second distance function",
  /distanceBetween/.test(watcher) && !/Math\.hypot|Math\.sqrt/.test(watcher));
eq("W8 the flag names are distinct", TETHER_FLAG, "distanceTether");

/* ================================================================== *
 * C. THE CARD
 * ================================================================== */

ok("C1 the armed line names the threshold",
  /more than 30 feet from you/.test(distanceTriggerArmedLine("X", spec, " (1 minute)")));
ok("C2 the immediate line says why it landed at once",
  /already 45 feet away/.test(distanceTriggerImmediateLine("X", spec, 45))
  && /taut/.test(distanceTriggerImmediateLine("X", spec, 45)));
ok("C3 and the fired line names the distance that did it",
  /moves 40 feet from you/.test(distanceTriggerFiredLine("X", spec, 40)));
ok("C3b all three name the condition",
  [distanceTriggerArmedLine("X", spec, ""), distanceTriggerImmediateLine("X", spec, 40),
    distanceTriggerFiredLine("X", spec, 40)].every((l) => /immobilised/.test(l)));

/* ================================================================== *
 * D. THE PACK, AND THE RULE THAT WAS INVENTED
 * ================================================================== */

{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let sys = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() === "shadow tether") { sys = v.system; break; }
    }
  } finally { await db.close(); }
  ok("D0 Shadow Tether is in the pack", Boolean(sys));
  const rows = sys?.effects ?? [];
  const row = normaliseDistanceTrigger(rows.find((r) => r.kind === "distanceTrigger"));
  ok("D1 THE IMMOBILISATION NOW WAITS FOR THE TETHER", Boolean(row));
  eq("D1b at the printed 30 feet", row?.feet, 30);
  eq("D1c measured from the caster", row?.from, "caster");
  eq("D1d and it is the printed condition", row?.condition, "immobilised");
  /*
   * D2 IS THE DEFECT, REFUSED BY NAME. A bare `condition` row on this spell
   * pins the target where it stands — which is what shipped, and is a rule
   * the page does not contain.
   */
  ok("D2 AND NO BARE CONDITION ROW REMAINS",
    !rows.some((r) => r.kind === "condition"),
    "a condition row with no trigger immobilises on a failed save, at any distance");
  eq("D3 the damage is untouched — it is dealt regardless",
    `${sys?.damage?.formula}/${sys?.damage?.type}`, "2d8/essence");
  eq("D3b and the save is still a Basic Reflex", sys?.defence, "Basic Reflex");
  eq("D3c and the duration is the minute the condition inherits", sys?.duration, "1 minute");
  eq("D4 the extra-target warp still has something to apply",
    JSON.stringify(sys?.warps?.map((w) => w.mods)), JSON.stringify([{ extraTargets: 1 }]));
  const notes = rows.filter((r) => r.kind === "note").map((r) => String(r.text ?? "")).join(" ");
  ok("D5 the card says the damage does not wait",
    /THE DAMAGE IS DEALT REGARDLESS/.test(notes));
  ok("D5b and whose movement is measured",
    /a caster cannot immobilise somebody by retreating/.test(notes));
  ok("D5c and the already-beyond-30 reading, which is a decision",
    /IF THE TARGET IS ALREADY BEYOND 30 FEET/.test(notes) && /at exactly 30 feet the tether is slack/.test(notes));
  ok("D5d and that it fires once", /IT FIRES ONCE/.test(notes));
  ok("D6 THE OLD NOTE THAT DESCRIBED THE GAP IS GONE",
    !/only triggers if the target moves more than 30 ft from you/.test(notes),
    "it explained a rule the row did not implement; the row implements it now");
}

if (failures.length) {
  process.stderr.write(`verify-shadow-tether: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-shadow-tether: OK — ${checks} checks. The immobilisation waits for the `
  + `tether, and at exactly thirty feet it is slack.\n`);
