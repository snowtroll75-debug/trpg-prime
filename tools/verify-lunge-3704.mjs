#!/usr/bin/env node
/**
 * verify-lunge-3704 — core 3.704.0, Lunge (and Lunging Stance's half of it).
 *
 * The book (Chapter 5): "LUNGE · MARTIAL ROGUE. You can strike foes that
 * would normally be out of reach. Prerequisites BAB +2. Requirements You are
 * wielding a melee weapon. Using your melee weapon, you may take an action
 * with the attack trait. This action gains the reach trait for that Strike.
 * This strike is subject to a -1-circumstance penalty."
 * LUNGING STANCE: "... any penalties associated with performing standard
 * Lunge strikes are completely negated."
 * The Reach trait (Chapter 6): +5 ft of reach in this system, "subject to a
 * -2 penalty to AB" at the extended distance.
 *
 * Graham, 20 November 2026: "the Lunge feat does not work correctly." Until
 * 3.704.0 its Use queued a -1 tick-box and nothing else: no Strike had Reach,
 * so a foe 10 ft away was refused as beyond the sword's reach (R below).
 *
 *   R  the reported failure, reproduced against the reach gate
 *   A  a trait granted for one Strike (`traitsWithGranted`)
 *   B  the reach gate with Lunge's Reach: +5 ft, -2 in the band, still bounded
 *   C  which weapons can lunge (`lungeWeapons`)
 *   D  whether Lunging Stance is up (`lungingStanceActive`)
 *   E  the Strike's terms (`lungeStrikeTerms`): -1 and Reach's range, never
 *      Reach's -2 (3.704.1, Graham: "-1 only for lunge"); the stance's negation
 *   F  the table entry and its requirement
 *   G  the wiring: attack workflow, strikePlan, runActionFeat, the handlers
 *   H  the note effects: pack data, the owned-copy repair, the migration
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const at = await import(new URL("../module/combat/attack.mjs", import.meta.url));
const af = await import(new URL("../module/combat/action-feats.mjs", import.meta.url));
const pr = await import(new URL("../module/data/pack-repairs.mjs", import.meta.url));

function block(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? "" : src.slice(i, j);
}

const SWORD = { traits: "Sweep, Versatile P", reachFeet: 0 };
const MEDIUM_REACH = 5;

/* R — the reported failure ---------------------------------------------- */
{
  // What 3.703.1 rolled: the sword's own traits, so no Reach, at 10 ft.
  const ext = at.weaponReachExtension(SWORD);
  const before = at.reachPenalty(ext > 0, MEDIUM_REACH, 10, { extension: ext });
  ok("R1 without the grant, a foe at 10 ft is out of a sword's reach (the defect)", before.outOfReach === true);
  const lunged = { ...SWORD, traits: at.traitsWithGranted(SWORD.traits, af.lungeStrikeTerms().grantTraits) };
  const lext = at.weaponReachExtension(lunged);
  const after = at.reachPenalty(lext > 0, MEDIUM_REACH, 10, { extension: lext });
  ok("R2 with Lunge's terms, the same foe is in reach", after.outOfReach === false);
}

/* A — a trait granted for one Strike ----------------------------------- */
{
  equal("A1 Reach is added to the line", at.traitsWithGranted("Sweep, Versatile P", ["Reach"]), "Sweep, Versatile P, Reach");
  equal("A2 an empty line gains it alone", at.traitsWithGranted("", ["Reach"]), "Reach");
  equal("A3 an undefined line gains it alone", at.traitsWithGranted(undefined, ["Reach"]), "Reach");
  const line = "Reach, Versatile P";
  ok("A4 a trait already there is not added again (same string back)", at.traitsWithGranted(line, ["reach"]) === line);
  const none = "Agile";
  ok("A5 no grants: the same string back", at.traitsWithGranted(none, []) === none && at.traitsWithGranted(none) === none);
  equal("A6 a grant is not duplicated within itself", at.traitsWithGranted("Agile", ["Reach", "REACH"]), "Agile, Reach");
  equal("A7 a word containing the name is not the trait (Overreach)", at.traitsWithGranted("Overreach", ["Reach"]), "Overreach, Reach");
}

/* B — the reach gate with Lunge's Reach -------------------------------- */
{
  const lunged = { traits: at.traitsWithGranted("Agile, Finesse", ["Reach"]) };
  const ext = at.weaponReachExtension(lunged);
  equal("B1 a granted Reach extends by 5 ft", ext, 5);
  equal("B2 adjacent (5 ft): in reach, no Reach penalty", at.reachPenalty(true, 5, 5, { extension: ext }), { penalty: 0, outOfReach: false });
  equal("B3 10 ft: in reach, the Reach trait's -2", at.reachPenalty(true, 5, 10, { extension: ext }), { penalty: -2, outOfReach: false });
  equal("B4 15 ft: still out of reach — Lunge is 5 ft, not unlimited", at.reachPenalty(true, 5, 15, { extension: ext }), { penalty: 0, outOfReach: true });
  equal("B5 a Large lunger (reach 10) reaches 15 ft", at.reachPenalty(true, 10, 15, { extension: ext }), { penalty: -2, outOfReach: false });
  equal("B6 ...and not 20 ft", at.reachPenalty(true, 10, 20, { extension: ext }).outOfReach, true);
}

/* C — which weapons can lunge ----------------------------------------- */
{
  const w = (name, system) => ({ type: "weapon", name, id: name, system });
  const items = [
    w("Longsword", { equipped: true, attackMode: "melee", traits: "Versatile P" }),
    w("Dagger", { equipped: true, attackMode: "melee", traits: "Agile, Finesse, Thrown 10 ft" }),
    w("Glaive", { equipped: true, attackMode: "melee", traits: "Deadly, Forceful, Reach" }),
    w("Rapier (sheathed)", { equipped: false, attackMode: "melee", traits: "Finesse" }),
    w("Unarmed Strike", { equipped: true, natural: true, attackMode: "melee", traits: "Agile" }),
    w("Longbow", { equipped: true, attackMode: "missile", traits: "Deadly" }),
    { type: "feat", name: "Lunge", id: "f", system: { equipped: true } }
  ];
  const r = af.lungeWeapons(items);
  equal("C1 held melee weapons without Reach are eligible (a Thrown dagger included)", r.eligible.map((i) => i.name), ["Longsword", "Dagger"]);
  equal("C2 a held Reach weapon is reported, not eligible", r.reachAlready.map((i) => i.name), ["Glaive"]);
  ok("C3 a sheathed weapon is not wielded", !r.eligible.some((i) => i.name.startsWith("Rapier")));
  ok("C4 a natural attack (the Unarmed Strike) is not a wielded weapon", !r.eligible.some((i) => i.name === "Unarmed Strike"));
  ok("C5 a missile weapon is not a melee weapon", !r.eligible.some((i) => i.name === "Longbow"));
  equal("C6 no attack mode reads as melee", af.lungeWeapons([w("Club", { equipped: true, traits: "" })]).eligible.length, 1);
  equal("C7 nothing in hand: nothing", af.lungeWeapons([]), { eligible: [], reachAlready: [] });
}

/* D — Lunging Stance -------------------------------------------------- */
{
  const stance = { name: "Lunging Stance", disabled: false, flags: { "trg-prime": { featStance: true } } };
  ok("D1 the stance's own effect (entered from its Use) is the stance", af.lungingStanceActive([stance]) === true);
  ok("D2 the 3.704.0 declaration alone is enough", af.lungingStanceActive([{ name: "Renamed", flags: { "trg-prime": { lungePenaltiesNegated: true } } }]) === true);
  ok("D3 a disabled stance is not up", af.lungingStanceActive([{ ...stance, disabled: true }]) === false);
  ok("D4 the feat's always-on note effect of the same name is NOT the stance",
    af.lungingStanceActive([{ name: "Lunging Stance", disabled: false, flags: { "trg-prime": { featNote: true } } }]) === false);
  ok("D5 another stance is not it", af.lungingStanceActive([{ name: "Duelling Parry", flags: { "trg-prime": { featStance: true } } }]) === false);
  ok("D6 no effects: not up", af.lungingStanceActive([]) === false && af.lungingStanceActive() === false);
}

/* E — the Strike's terms ---------------------------------------------- */
{
  const plain = af.lungeStrikeTerms();
  equal("E1 the Strike gains Reach", plain.grantTraits, ["Reach"]);
  equal("E2 Lunge's -1 circumstance, as one row", plain.extraModifiers, [{ label: "Lunge (-1)", value: -1, type: "circumstance" }]);
  // 3.704.1 (Graham, 20 Nov 2026: "-1 only for lunge"): never the Reach -2.
  ok("E3 the Reach -2 is waived on every Lunge, not only in the stance", plain.waiveReachPenalty === true);
  const st = af.lungeStrikeTerms({ lungingStance: true });
  equal("E4 in Lunging Stance: no -1", st.extraModifiers, []);
  ok("E5 ...and the Reach -2 still waived", st.waiveReachPenalty === true);
  equal("E6 ...and the Strike still has Reach", st.grantTraits, ["Reach"]);
}

/* F — the table entry -------------------------------------------------- */
{
  const e = af.ACTION_FEATS.lunge;
  ok("F1 Lunge is an action feat", Boolean(e));
  equal("F2 the Strike's 1 AP, one ordinary Strike for the penalty ladder", [e?.apCost, e?.map], ["1", af.MAP_RULES.single]);
  ok("F3 the Strike pays its own AP (refusal before cost)", e?.strikePays === true);
  ok("F4 not triggered, so it gets a Use button", !e?.triggered);
  equal("F5 requires a wielded melee weapon", e?.requires, [af.REQUIREMENTS.meleeWeapon]);
  ok("F6 -1 not declared as a fixed strikePenalty (the stance negates it)", e?.strikePenalty === undefined);
  ok("F7 the requirement is met by a melee weapon", af.meetsRequirement(af.REQUIREMENTS.meleeWeapon, { meleeWeapon: true }) === true);
  ok("F8 ...and not without one", af.meetsRequirement(af.REQUIREMENTS.meleeWeapon, {}) === false);
  const s = af.actionFeatState("Lunge", { meleeWeapon: false });
  ok("F9 the state refuses with the printed requirement", s.known && s.usable === false && /wielding a melee weapon/.test(s.reason));
  ok("F10 ...and allows with one", af.actionFeatState("lunge", { meleeWeapon: true }).usable === true);
}

/* G — the wiring --------------------------------------------------------- */
const AW = read("module", "combat", "attack-workflow.mjs");
const AFW = read("module", "combat", "action-feats-workflow.mjs");
const FW = read("module", "feats-workflow.mjs");
{
  ok("G1 rollWeaponAttack takes grantTraits and waiveReachPenalty", /\n  grantTraits = \[\],\n/.test(AW) && /\n  waiveReachPenalty = false,\n/.test(AW));
  ok("G2 the grant is applied to weaponData itself, before anything reads it",
    /const grantedTraits = traitsWithGranted\(grouped\.traits, grantTraits\);\n  const weaponData = grantedTraits === grouped\.traits \? grouped : \{ \.\.\.grouped, traits: grantedTraits \};/.test(AW));
  ok("G3 the reach extension is read from that weaponData", /const reachExtension = weaponReachExtension\(weaponData\);/.test(AW)
    && AW.indexOf("const grantedTraits = traitsWithGranted(") < AW.indexOf("const reachExtension = weaponReachExtension(weaponData);"));
  ok("G4 the Reach -2 row is skipped only when waived", /if \(measuresReach && reach\.penalty && !waiveReachPenalty\) \{/.test(AW));
  ok("G5 strikePlan passes the grant, the waiver, and lets the Strike pay",
    /apPaid: !entry\?\.strikePays,/.test(AFW) && /\n\s+grantTraits,\s+\/\/ Lunge/.test(AFW) && /\n\s+waiveReachPenalty,\s+\/\/ Lunge: never the Reach trait's -2/.test(AFW)
    && /keepsStep = false, grantTraits = \[\], waiveReachPenalty = false \} = \{\}\) \{/.test(AFW));
  ok("G6 runActionFeat asks Lunge's weapon before anything, and spends nothing itself",
    /const chosen = entry\.lunge \? await chooseLungeWeapon\(actor, entry\.label\)/.test(AFW)
    && /if \(entry\.apCost !== "0" && !entry\.strikePays\) \{/.test(AFW));
  const chooser = block(AFW, "async function chooseLungeWeapon(actor, label) {", "\n}\n");
  ok("G7 the chooser uses lungeWeapons and refuses a Reach-only hand with the reason",
    /lungeWeapons\(Array\.from\(actor\?\.items \?\? \[\]\)\)/.test(chooser) && /already \$\{[^}]+\} the Reach trait, so Lunge adds nothing/.test(chooser));
  const run = block(AFW, "  async lunge(actor, item, entry, chosen = null) {", "\n  },\n");
  ok("G8 the handler reads the stance and rolls the Strike with Lunge's terms",
    /lungingStanceActive\(/.test(run) && /const terms = lungeStrikeTerms\(\{ lungingStance \}\);/.test(run) && /await strikePlan\(actor, weapon, "lunge", terms\)/.test(run));
  ok("G9 the old tick-box handler is gone", !/"lunge": \{\n\s+hint: "Queue a Lunge/.test(FW) && !/label: "Lunge \(reach\)"/.test(FW));
  ok("G10 the action-feat table is still spread into the feat handlers",
    /Object\.entries\(ACTION_FEATS\)\n\s+\.filter\(\(\[, entry\]\) => !entry\.triggered\)/.test(FW));
  const ls = block(FW, '  "lunging stance": {', '\n  },\n');
  ok("G11 Lunging Stance stamps its declaration on its effect", /flags: \{ lungePenaltiesNegated: true \},/.test(ls));
  ok("G12 ...and no longer tells the player to skip a queued -1 by hand", !/skip its queued -1|don't queue it/.test(ls));
  ok("G13 the stance flag Lunge reads is the one enterFeatStance writes", /const FEAT_STANCE_FLAG = "featStance";/.test(FW));
}

/* H — the note effects ------------------------------------------------- */
{
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  const lf = fixes.find((f) => f.id === "lunge-note");
  const sf = fixes.find((f) => f.id === "lunging-stance-note");
  const lf1 = fixes.find((f) => f.id === "lunge-note-3704-1");
  const sf1 = fixes.find((f) => f.id === "lunging-stance-note-3704-1");
  ok("H1 the pack fixes are declared, and 3.704.1's continue from 3.704.0's",
    [lf, sf, lf1, sf1].every((f) => f?.op === "editEffect" && f?.pack === "feats") && lf1?.from === lf?.to && sf1?.from === sf?.to);
  ok("H1c the 3.704.0 rows are retired to their heirs, and the fix tool honours that for an effect edit",
    lf?.supersededBy === "lunge-note-3704-1" && sf?.supersededBy === "lunging-stance-note-3704-1"
    && /if \(fix\.op === "editEffect"\) \{[\s\S]{0,600}if \(fix\.supersededBy\) \{/.test(read("tools", "apply-data-fixes.mjs")));
  ok("H1b the final notes name no Reach -2 (3.704.1)", !/-2/.test(lf1?.to ?? "-2") && !/-2/.test(sf1?.to ?? "-2") && /-1/.test(lf1?.to ?? "") && /-1/.test(sf1?.to ?? ""));
  const lr = pr.EFFECT_REPAIRS.find((r) => r.id === "lunge-note");
  const sr = pr.EFFECT_REPAIRS.find((r) => r.id === "lunging-stance-note");
  const lr1 = pr.EFFECT_REPAIRS.find((r) => r.id === "lunge-note-3704-1");
  const sr1 = pr.EFFECT_REPAIRS.find((r) => r.id === "lunging-stance-note-3704-1");
  ok("H2 a 3.703.1 owned copy goes straight to the final note", lr?.from.description === lf?.from && lr?.to.description === lf1?.to
    && sr?.from.description === sf?.from && sr?.to.description === sf1?.to && lr?.itemType === "feat" && sr?.itemType === "feat");
  ok("H2b a 3.704.0 owned copy goes to the final note", lr1?.from.description === lf1?.from && lr1?.to.description === lf1?.to
    && sr1?.from.description === sf1?.from && sr1?.to.description === sf1?.to && lr1?.itemType === "feat" && sr1?.itemType === "feat");
  equal("H3 a 3.703.1 owned Lunge note is repaired", pr.effectRepairUpdate(lr, { name: "Lunge", description: lf.from }), { description: lf1.to });
  equal("H3b a 3.704.0 owned Lunge note is repaired", pr.effectRepairUpdate(lr1, { name: "Lunge", description: lf1.from }), { description: lf1.to });
  equal("H4 a GM's own edit is left alone", pr.effectRepairUpdate(lr, { name: "Lunge", description: "House rule." }), null);
  equal("H5 a repaired copy is left alone (idempotent)", [pr.effectRepairUpdate(lr, { name: "Lunge", description: lf1.to }), pr.effectRepairUpdate(lr1, { name: "Lunge", description: lf1.to })], [null, null]);
  const MIG = read("module", "migration.mjs");
  ok("H6 the owned-effect migration runs again at 3.704.1", /const effectRepairs = \(await runIf\("3\.704\.1", /.test(MIG));
  // The compiled pack carries the new notes (read from a copy: never the live folder).
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lunge-pack-"));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", "feats"), tmp, { recursive: true });
  fs.rmSync(path.join(tmp, "LOCK"), { force: true });
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const notes = {};
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!items.effects!") && (value?.name === "Lunge" || value?.name === "Lunging Stance")) notes[value.name] = value.description;
  }
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  equal("H7 the pack's Lunge note is the final one", notes.Lunge, lf1.to);
  equal("H8 the pack's Lunging Stance note is the final one", notes["Lunging Stance"], sf1.to);
}

const EXPECTED = 70;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-lunge-3704: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-lunge-3704: OK — ${checks} checks`);
