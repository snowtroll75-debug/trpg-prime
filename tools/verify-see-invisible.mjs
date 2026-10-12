#!/usr/bin/env node
/**
 * verify-see-invisible — R12: the condition nothing read, and the spell
 * whose whole job was to counter it.
 *
 * NEW at 3.597.0. Graham's R12, 27 September 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE HOLE. `conditions/registry.mjs` has carried `invisible` with a HUD
 * toggle since the condition pass, and `missChanceAvoidance` asked only
 * about `hidden` and `concealed`. A GM could tick Invisible on a token and
 * the creature was exactly as easy to hit — the ninth vocabulary entry this
 * project has found with no driver, and the one that made a PP 4 spell
 * unauthorable.
 *
 * SECTION S IS THE CHECK THAT WOULD HAVE CAUGHT IT: every sight this system
 * offers must have its flag read on the avoidance path.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { MISS_CHANCE_DC, invisibleAvoidanceDC, missChanceDC } from "../module/combat/attack.mjs";
import {
  SEE_INVISIBLE, SEE_INVISIBLE_FLAG, isSeeInvisibleLevel, seeInvisibleLevel, seeInvisibleNote
} from "../module/combat/invisibility.mjs";
import {
  AVOIDANCE_SIGHTS, avoidanceSightLine, isAvoidanceSightKey, normaliseAvoidanceSight
} from "../module/magic/avoidance-sight.mjs";
import { HANDLED_EFFECT_KINDS } from "../module/magic/effect-kinds.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";

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
const targeting = strip(read("module", "combat", "targeting.mjs"));
const applier = strip(read("module", "magic", "spell-effects.mjs"));

/* ================================================================== *
 * C. THE CONDITION EXISTS AND IS NOW READ
 * ================================================================== */

ok("C1 the invisible condition is in the registry", Boolean(CONDITIONS.invisible),
  "it has been there, with a HUD toggle, since the condition pass");
ok("C2 AND THE AVOIDANCE RULE NOW READS IT",
  /const invisible = Boolean\(targetActor\.hasCondition\("invisible"\)\);/.test(targeting),
  "this is the hole R12 exists to close: a GM could tick it and nothing changed");
ok("C2b the read is passed to the DC rule rather than handled beside it",
  /missChanceDC\(\{ hidden, concealed, invisible, seeInvisible \}\)/.test(targeting),
  "a rule hand-rolled at its call site is this project's most common defect");

/* ================================================================== *
 * L. THE DC LADDER, MEASURED RATHER THAN ASSERTED IN PROSE
 * ================================================================== */

/*
 * THE DEFENDER ROLLS THIS CHECK, so a HIGHER DC protects them LESS. Every
 * statement below is a comparison rather than a claim, because the whole
 * rule is easy to get backwards and a comment cannot be wrong loudly.
 */
eq("L1 INVISIBLE IS THE HIDDEN DC, which is printed and not adjudicated",
  invisibleAvoidanceDC(SEE_INVISIBLE.NONE), MISS_CHANCE_DC.hidden,
  "the Appendix: undetected is targeted \"like a hidden creature (requiring a DC 10 flat check)\"");
eq("L1b and that number is 10", MISS_CHANCE_DC.invisible, 10);
eq("L2 SEE INVISIBLE READS IT AS CONCEALED",
  invisibleAvoidanceDC(SEE_INVISIBLE.CONCEALED), MISS_CHANCE_DC.concealed,
  "\"each now having the concealed condition to you\"");
eq("L2b and the +4 PP option takes the check away entirely",
  invisibleAvoidanceDC(SEE_INVISIBLE.CLEAR), null,
  "\"invisible creatures can be seen clearly and are not concealed\"");
ok("L3 SO THE SPELL MAKES THE DEFENDER WORSE OFF AT EVERY TIER, in that order",
  invisibleAvoidanceDC(SEE_INVISIBLE.NONE) < invisibleAvoidanceDC(SEE_INVISIBLE.CONCEALED)
  && invisibleAvoidanceDC(SEE_INVISIBLE.CLEAR) === null,
  "a spell you paid for must help you; the defender rolls, so higher is worse for them");
eq("L4 an invisible creature alone rolls the invisible DC",
  missChanceDC({ invisible: true }), 10);
eq("L4b against a caster of See Invisible it rolls the concealed DC",
  missChanceDC({ invisible: true, seeInvisible: SEE_INVISIBLE.CONCEALED }), 17);
eq("L4c and against the warped spell it rolls nothing at all",
  missChanceDC({ invisible: true, seeInvisible: SEE_INVISIBLE.CLEAR }), null);
eq("L4d a creature with no condition still rolls nothing", missChanceDC({}), null);
/*
 * L5 IS THE RULE MY FIRST DRAFT BROKE. I took the LOWEST DC, reasoning that
 * more concealment should never protect you less. `verify-chapter4` E4
 * refused it and was right: page 64 says "If more than one flat check would
 * ever cause or prevent the same thing, just roll once using the highest
 * DC." Widening this function must not quietly reverse that.
 */
eq("L5 TWO CONDITIONS ROLL ONCE AT THE HIGHEST DC (page 64), invisible included",
  missChanceDC({ invisible: true, concealed: true }), 17);
eq("L5b and hidden plus invisible is still one check",
  missChanceDC({ invisible: true, hidden: true }), 10);
eq("L5c See Invisible does not lower a DC the light set",
  missChanceDC({ invisible: true, concealed: true, seeInvisible: SEE_INVISIBLE.CLEAR }), 17,
  "seeing through the invisibility does not reveal a creature standing in the dark");
eq("L5d nor one the target's Stealth set",
  missChanceDC({ invisible: true, hidden: true, seeInvisible: SEE_INVISIBLE.CLEAR }), 10,
  "See Invisible does not find a creature hiding behind a barrel");

/* ================================================================== *
 * R. READING THE CASTER'S LEVEL OFF THE ATTACKER
 * ================================================================== */

const eff = (level, extra = {}) => ({ flags: { "trg-prime": { [SEE_INVISIBLE_FLAG]: level } }, ...extra });
eq("R1 no effects means no sight", seeInvisibleLevel([]), SEE_INVISIBLE.NONE);
eq("R1b a bad argument means no sight", seeInvisibleLevel(null), SEE_INVISIBLE.NONE);
eq("R2 an effect carrying the level is read",
  seeInvisibleLevel([eff(SEE_INVISIBLE.CONCEALED)]), SEE_INVISIBLE.CONCEALED);
eq("R3 A DISABLED EFFECT IS NOT A SPELL YOU HAVE",
  seeInvisibleLevel([eff(SEE_INVISIBLE.CONCEALED, { disabled: true })]), SEE_INVISIBLE.NONE);
eq("R4 THE STRONGER LEVEL WINS whichever order the array lists them",
  [seeInvisibleLevel([eff("concealed"), eff("clear")]),
   seeInvisibleLevel([eff("clear"), eff("concealed")])].join("/"), "clear/clear",
  "a caster who paid the +4 PP must not be handed the cheaper effect by array order");
eq("R5 A HAND-EDITED FLAG IS NOT A LEVEL", seeInvisibleLevel([eff("yes")]), SEE_INVISIBLE.NONE,
  "an unknown value must not read as the base level");
eq("R5b and nor is true", seeInvisibleLevel([eff(true)]), SEE_INVISIBLE.NONE);
ok("R6 the levels this rule knows are exactly the two printed ones",
  isSeeInvisibleLevel("concealed") && isSeeInvisibleLevel("clear")
  && !isSeeInvisibleLevel("hidden") && !isSeeInvisibleLevel(null));
ok("R7 THE LEVEL IS READ OFF THE ATTACKER, not the target",
  /seeInvisibleLevel\(Array\.from\(attackerActor\?\.appliedEffects \?\? attackerActor\?\.effects \?\? \[\]\)\)/
    .test(targeting),
  "\"the concealed condition TO YOU\" — the same side Blind Fight is read from");
ok("R7b and only when the target is invisible at all",
  /const seeInvisible = invisible\s*\?/.test(targeting));
ok("R8 the card names what the spell did",
  /reads as concealed to you/.test(seeInvisibleNote("concealed", true))
  && /no help against you/.test(seeInvisibleNote("clear", true)));
/*
 * R8c IS A LIVE-DRIVE FINDING (3.597.0). A target that was invisible AND
 * concealed printed "Concealed (See Invisible — seen clearly) — DC 17",
 * which invites the reading that the CONCEALMENT was seen through. Page 64
 * gave that check to the dim light; the spell only neutralised the
 * invisibility. The note is now about the invisibility alone.
 */
ok("R8c AND THE NOTE IS ABOUT THE INVISIBILITY, not about the check the label names",
  seeInvisibleNote("clear", true).includes("its invisibility")
  && seeInvisibleNote("concealed", true).includes("its invisibility")
  && !/seen clearly/.test(seeInvisibleNote("clear", true)),
  "beside a \"Concealed\" label, a bare \"seen clearly\" reads as a claim about the concealment");
eq("R8b and says nothing when the target is not invisible", seeInvisibleNote("clear", false), "");
ok("R9 THE CARD NAMES THE CONDITION THAT SET THE DC, not a fixed order",
  /const condition = invisibleDC === baseDC && invisibleDC !== null\s*\?\s*"Invisible"/.test(targeting),
  "with page 64's highest-DC rule a creature can hold two at once");

/* ================================================================== *
 * S. THE CHECK THAT WOULD HAVE CAUGHT THE UNREAD CONDITION
 * ================================================================== */

/*
 * EVERY SIGHT'S FLAG MUST BE READ ON THE AVOIDANCE PATH. This is §5.1 —
 * a rule with no caller is not a rule — aimed at the exact shape that let
 * `invisible` sit in the registry unread: a vocabulary entry whose only
 * evidence of working is that it is spelled correctly.
 */
const avoidanceSources = ["module/combat/targeting.mjs", "module/combat/invisibility.mjs",
  "module/combat/attack.mjs"].map((f) => strip(read(...f.split("/")))).join("\n");
for (const [key, spec] of Object.entries(AVOIDANCE_SIGHTS)) {
  ok(`S1 the ${key} sight's flag is read on the avoidance path`,
    avoidanceSources.includes(spec.flag),
    "a sight nothing reads is a spell that does nothing and looks like it worked");
  ok(`S1b and its default level is one the rule knows`, spec.valid(spec.default));
}
ok("S2 the sight key is validated", isAvoidanceSightKey("seeInvisible") && !isAvoidanceSightKey("xray"));

/* ================================================================== *
 * N. THE ROW, AND THE RAIL IT IS DELIBERATELY NOT ON
 * ================================================================== */

eq("N1 a well-formed row normalises",
  JSON.stringify(normaliseAvoidanceSight({ kind: "avoidanceSight", sight: "seeInvisible" })),
  JSON.stringify({ sight: "seeInvisible", flag: "seeInvisible", label: "See Invisible", level: "concealed" }));
eq("N2 A SIGHT NOTHING READS IS REFUSED",
  normaliseAvoidanceSight({ kind: "avoidanceSight", sight: "xray" }), null);
eq("N2b a row naming no sight is refused",
  normaliseAvoidanceSight({ kind: "avoidanceSight" }), null);
eq("N2c a level the sight does not define is refused",
  normaliseAvoidanceSight({ kind: "avoidanceSight", sight: "seeInvisible", level: "yes" }), null);
eq("N2d and another kind wearing the fields is refused",
  normaliseAvoidanceSight({ kind: "sense", sight: "seeInvisible" }), null,
  "the `sense` kind is a DIFFERENT rail — see avoidance-sight.mjs's header");
/*
 * N3 CARRIES A LEVEL OF ITS OWN, which is the whole point: a row with no
 * level cannot tell replacement from fallback, and the authored row HAS
 * one. The first version of this check omitted it and a mutation that
 * reversed the precedence survived.
 */
eq("N3 THE WARP REPLACES THE ROW'S OWN LEVEL rather than deferring to it",
  normaliseAvoidanceSight(
    { kind: "avoidanceSight", sight: "seeInvisible", level: "concealed" },
    { sightLevel: "clear" })?.level,
  "clear");
eq("N3c and with no warp the row's level stands",
  normaliseAvoidanceSight(
    { kind: "avoidanceSight", sight: "seeInvisible", level: "concealed" }, {})?.level,
  "concealed");
eq("N3b and a warp naming a level the sight rejects is refused",
  normaliseAvoidanceSight({ kind: "avoidanceSight", sight: "seeInvisible" }, { sightLevel: "yes" }), null);
ok("N4 the kind is handled and declared",
  HANDLED_EFFECT_KINDS.includes("avoidanceSight") && /case "avoidanceSight": \{/.test(applier));
ok("N4b THE EFFECT CARRIES THE FLAG AND NO CHANGES",
  /\[senseSpec\.flag\]: senseSpec\.level/.test(applier) && /changes: \[\],\s*flags: senseFlags/.test(applier));
ok("N4c and it carries the spell's own duration",
  /const senseTiming = spellExpiryTiming\(parsedDuration\);/.test(applier)
  && /senseData\.duration = \{ \.\.\.senseTiming\.foundryDuration/.test(applier));
ok("N4d a malformed row is said out loud rather than doing nothing",
  /declares a sight this system does not read/.test(applier));
ok("N5 the line says which tier landed",
  /concealed condition to you/.test(avoidanceSightLine("X", { label: "See Invisible", level: "concealed" }, " (10 minutes)"))
  && /seen clearly/.test(avoidanceSightLine("X", { label: "See Invisible", level: "clear" }, "")));
/*
 * N5b IS A LIVE-DRIVE FINDING (3.597.0). The applier builds `durationText`
 * ALREADY BRACKETED and every other line in that file interpolates it bare;
 * this one wrapped it again and the card read "( (10 minutes))". N5 compared
 * the sentence and not the punctuation, so only reading the card caught it.
 */
eq("N5b AND THE DURATION IS NOT BRACKETED TWICE",
  avoidanceSightLine("X", { label: "See Invisible", level: "concealed" }, " (10 minutes)"),
  "<strong>X</strong>: See Invisible &mdash; invisible creatures have the concealed "
  + "condition to you (10 minutes).");
eq("N5c and a spell with no duration text ends cleanly",
  avoidanceSightLine("X", { label: "See Invisible", level: "clear" }, "").endsWith("concealed to you."), true);

/* ================================================================== *
 * P. THE PACK
 * ================================================================== */

{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let sys = null;
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).trim().toLowerCase() === "see invisible") { sys = v.system; break; }
    }
  } finally { await db.close(); }
  ok("P0 See Invisible is in the pack", Boolean(sys));
  const rows = sys?.effects ?? [];
  const row = rows.find((r) => r.kind === "avoidanceSight");
  ok("P1 SEE INVISIBLE DOES SOMETHING AT LAST", Boolean(row),
    "a PP 4 spell whose whole job is to counter a condition nothing read, carrying `effects: []`");
  eq("P1b on the caster", row?.target, "self");
  eq("P1c at the printed tier", normaliseAvoidanceSight(row)?.level, "concealed");
  ok("P2 IT IS NOT AUTHORED ON THE `sense` RAIL",
    !rows.some((r) => r.kind === "sense"),
    "`sense`'s `finds` field is read only by the sheet — it would have printed and changed nothing");
  const clear = sys?.warps?.find((w) => /seen clearly/i.test(String(w.text ?? "")));
  eq("P3 THE +4 PP WARP IS NO LONGER INERT", JSON.stringify(clear?.mods),
    JSON.stringify({ sightLevel: "clear" }));
  const dur = sys?.warps?.find((w) => /8 hours/i.test(String(w.text ?? "")));
  eq("P3b and the duration warp is left as it was", dur?.mods?.durationText, "8 hours");
  const notes = rows.filter((r) => r.kind === "note").map((r) => String(r.text ?? "")).join(" ");
  ok("P4 the ethereal half and the what-it-does-not-do half are printed",
    /ETHEREAL BEINGS GET THE SAME TREATMENT/.test(notes) && /IT DOES NOT FIND ANYBODY/.test(notes));
}

if (failures.length) {
  process.stderr.write(`verify-see-invisible: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-see-invisible: OK — ${checks} checks. The invisible condition is read `
  + `at attack time, and the spell that counters it has three printed tiers.\n`);
