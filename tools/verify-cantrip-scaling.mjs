#!/usr/bin/env node
/**
 * verify-cantrip-scaling — every damaging cantrip climbs, and climbs right.
 *
 * NEW at 3.483.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM, 3 September 2026:
 *
 *   "CL 4 for orb of acid should be 2d6 plus 2 splash, CL8 3d6 plus 3
 *    splash etc, the other damaging cantrips (PP 0) should scale in the
 *    same way."
 *
 * TEN OF THE ELEVEN ALREADY DID. Measuring before building is what kept
 * this to two data fixes instead of eleven, and it found the two that
 * nobody would ever have reported:
 *
 *   DAZE carried `damageDice: ""` — an EMPTY STRING — beside a real Save
 *   DC ladder. So its DC climbed every four caster levels and its damage
 *   never moved, on a spell whose own printed text says "increase the
 *   damage by 1d4". A 20th-level Daze did 1d4.
 *
 *   ORB OF FIRE prints "and the persistent by 1" and nothing read it:
 *   `system.damage.persistent` was a stored field adjusted only by
 *   warping. A 12th-level caster dealt 4d6 and the same single point of
 *   recurring damage they dealt at 1st.
 *
 * NEITHER IS THE KIND OF THING A PLAYER REPORTS. A rider one point light
 * looks exactly like a rider; a cantrip that never grows looks like a
 * cantrip. Both were found by asking the same question of all eleven.
 */
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import fs from "node:fs";
import { applyCasterLevelMods, describeCasterLevelMods } from "../module/magic/caster-level-mods.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const cantrips = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (!k.startsWith("!items!") || v?.type !== "spell") continue;
    const s = v.system ?? {};
    if (Number(s.ppCost) !== 0) continue;
    if (!String(s.damage?.formula ?? "").trim()) continue;
    cantrips.push(v);
  }
} finally { await db.close(); }

ok("C0 the pack still has damaging cantrips to reason about", cantrips.length >= 10,
  `${cantrips.length} found`);

/*
 * L1 — EVERY ONE OF THEM CLIMBS, AND RECURRINGLY. Graham's "etc" is the
 * load-bearing word: CL 4 is one step and CL 8 is two, so a one-shot
 * ladder would be right at 4 and wrong at every level above it.
 */
for (const v of cantrips) {
  const mods = v.system.casterLevelMods ?? [];
  const at = (cl) => applyCasterLevelMods(mods, cl);
  ok(`L1 ${v.name} has a recurring caster-level ladder`,
    mods.some((m) => m.recurring && Number(m.threshold) === 4),
    "CL 4, CL 8, CL 12 — a one-shot ladder stops after the first step");
  /*
   * L2 IS THE DAZE CHECK. A ladder that declares a threshold and no dice
   * is the shape that let a Save DC climb while the damage stood still.
   */
  ok(`L2 ${v.name} actually gains dice at CL 4`,
    at(4).damageDice !== "",
    "Daze carried damageDice: \"\" beside a real Save DC ladder");
  ok(`L3 ${v.name} gains twice as much at CL 8`,
    at(8).steps === 2 * at(4).steps && at(4).steps === 1,
    "steps must be floor(CL / 4)");
}

/*
 * P — THE PRINTED SENTENCE IS THE AUTHORITY. A ladder that raises
 * something the entry never promised is as wrong as one that misses
 * something it did, and this is the direction that gets missed: nobody
 * reports a spell being too good.
 */
const printed = (v) => String(v.system.description ?? "")
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
for (const v of cantrips) {
  const mods = v.system.casterLevelMods ?? [];
  const saysPersist = /persistent|recurring/i.test(
    (printed(v).match(/C(?:aster|ASTER) L(?:evel|EVEL) M[^]*/i) || [""])[0]);
  const carriesPersist = mods.some((m) => Number(m.persistent) > 0);
  ok(`P1 ${v.name}: a persistent ladder is carried only if it is printed`,
    saysPersist === carriesPersist,
    saysPersist
      ? "its text raises the persistent and the pack does not"
      : "the pack raises a persistent its text never mentions");
}

/*
 * P2 — AND THE ENGINE ACTUALLY RESOLVES IT. P1 above asks the PACK
 * whether a ladder is declared; three mutations survived the first
 * harness because that is a different question from whether
 * `applyCasterLevelMods` multiplies it and whether the cast reads the
 * result. Declared, resolved, and reaching the card are three things,
 * and this project keeps discovering they are three.
 */
{
  const mods = [{ threshold: 4, recurring: true, damageDice: "1d6", persistent: 1 }];
  const at = (cl) => applyCasterLevelMods(mods, cl);
  ok("P2 the engine resolves a persistent ladder at all",
    at(4).persistent === 1,
    "declared in the pack is not the same as read by the engine");
  ok("P3 AND MULTIPLIES IT BY THE STEP COUNT",
    at(8).persistent === 2 && at(12).persistent === 3,
    "a 12th-level Orb Of Fire gains 3 recurring, not 1");
  ok("P4 and a ladder with no persistent resolves none",
    applyCasterLevelMods([{ threshold: 4, recurring: true, damageDice: "1d6" }], 12).persistent === 0);
  ok("P5 it is summarised for the card",
    /\+3 recurring/.test(describeCasterLevelMods(at(12))),
    "a ladder that resolves and is never shown is half a feature");
}
/*
 * P6 — AND THE CAST ADDS IT. The last link: a resolved ladder that the
 * damage line never reads is the same defect one layer along.
 */
{
  const cast = fs.readFileSync(path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
  ok("P6 THE CAST ADDS THE RESOLVED PERSISTENT TO THE PRINTED RIDER",
    cast.includes("const persistExtra = warpPersistent + Number(clMods?.persistent ?? 0);"),
    "resolved and never read is the same bug one layer along");
}

/*
 * S — SPLASH RIDES THE SAME STEPS. Graham's own worked example: CL 4 is
 * 2d6 plus 2 splash, CL 8 is 3d6 plus 3.
 */
const orb = cantrips.find((v) => /^orb of acid$/i.test(v.name));
const splash = (orb?.system?.effects ?? []).find((e) => e?.kind === "splash");
ok("S1 Orb Of Acid carries a splash that climbs", Number(splash?.perStep) === 1);
ok("S2 AND GRAHAM'S WORKED EXAMPLE HOLDS", (() => {
  const mods = orb?.system?.casterLevelMods ?? [];
  const dice = (cl) => applyCasterLevelMods(mods, cl).damageDice;
  const spl = (cl) => Number(splash.amount) + Number(splash.perStep) * applyCasterLevelMods(mods, cl).steps;
  // base 1d6 + the ladder's extra: CL 4 → 1d6+1d6 = 2d6, splash 2
  return dice(4) === "1d6" && spl(4) === 2 && dice(8) === "2d6" && spl(8) === 3;
})(), "CL 4 = 2d6 plus 2 splash; CL 8 = 3d6 plus 3 splash");

if (failures.length) {
  console.error(`verify-cantrip-scaling: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-cantrip-scaling: ${checks} checks passed over ${cantrips.length} damaging cantrips`);
