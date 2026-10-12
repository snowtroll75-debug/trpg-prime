#!/usr/bin/env node
/**
 * verify-pp1-batch — Reaper's Resonance and Bless Water.
 *
 * NEW at 3.487.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BACK ON THE TIER, AND WHY THAT IS AN ENTRY IN A CHECK FILE.
 *
 * Graham, 4 September 2026: *"we seem to have moved away from the
 * original spell plan, which was working through spells in ascending PP
 * order."* The second time he has had to say it — the first produced
 * `claude/pp1-work-plan-2026-08-26.md`, whose own opening line is the
 * same sentence.
 *
 * The cause was measured rather than guessed: the printed-damage ratchet
 * (3.452.0) and the flat-damage ratchet (3.482.0) became the work QUEUE.
 * They order by "prints damage the pack cannot roll", which is a defect
 * ordering and not a tier ordering, so the releases ran 4, 4, 6, 6, 6, 6,
 * 7, 7, 7, 8, 10, 10, 12, 12, 14, 16, 18, 20, 20. Each was justified; what
 * nobody noticed was that one ordering had silently replaced the other.
 *
 * A ratchet says what is WRONG. It does not say what to do NEXT.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE TWO CHECKS THAT CARRY THE DESIGN.
 *
 *   R1  THE SPELL IS A REACTION, SO THERE IS NO HOOK. My first design
 *       was a hook inside `reapDead` — every death path passes through
 *       it, `death-watch-workflow.mjs` exists for exactly that shape,
 *       and it looked like a fifteen-line change. The stat line says
 *       `castAP: "Reaction"`. A reaction spell is CAST in response to
 *       something; the player casting it IS the trigger (Graham's ruling
 *       of 28 August 2026, on Counter Perform). R1 asserts that nothing
 *       in this batch reaches into the death machinery, because the
 *       cheaper wrong design would have fired a spell nobody cast.
 *
 *   C1  BLESS WATER COPIES THE REAL ITEM. Holy Water is a genuine
 *       alchemical pack entry carrying the Splash trait that the 3.482.0
 *       splash mechanism reads. A hand-built imitation would have been a
 *       second Holy Water differing in exactly the fields nobody checks.
 *       C1 opens the pack and asserts the named item is really there.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  RESONANCE_RADIUS_FEET, RESONANCE_BONUS, RESONANCE_PER_BLEED,
  resonanceHeal, resonanceBleedReduction, resonanceReason,
  resonanceLine, resonanceBleedLine, resonanceNoBleedLine
} from "../module/magic/death-resonance.mjs";
import {
  CONJURABLE_PACKS, normaliseConjuredItem, conjuredItemName,
  conjuredItemLine, conjuredItemMissingLine, conjuredItemNobodyNamedLine, conjuredItemRecipients
} from "../module/magic/conjured-item.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const strip = (s) => String(s).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* ══ R. REAPER'S RESONANCE — THE ARITHMETIC ═══════════════════════════ */

ok("R-A1 the printed radius is 20 feet", RESONANCE_RADIUS_FEET === 20);
ok("R-A2 the printed addition is 5", RESONANCE_BONUS === 5);
ok("R-A3 a level 3 creature is worth 8", resonanceHeal({ level: 3 }) === 8);
ok("R-A4 AND AN UNDEAD ONE IS WORTH 16 — the amount doubles, not the level",
  resonanceHeal({ level: 3, undead: true }) === 16,
  "\"the amount healed is doubled\" names the amount, which is level + 5");
ok("R-A5 a level 0 creature is still worth the flat 5",
  resonanceHeal({ level: 0 }) === 5 && resonanceHeal({}) === 5);
ok("R-A6 and a missing or nonsense level does not go negative",
  resonanceHeal({ level: -20 }) === 0 && resonanceHeal({ level: "x" }) === 5);

/*
 * R-B IS THE WARP, AND THE DIVISOR IS THE HEAL RATHER THAN THE DEBT.
 * "For every 5 HP healed (round down)" names the heal. A caster two hit
 * points from full does not clear four points of bleed on the strength
 * of a heal that mostly went nowhere.
 */
ok("R-B1 five healed clears one bleed", resonanceBleedReduction(5) === 1);
ok("R-B2 nine healed still clears one — it rounds down", resonanceBleedReduction(9) === 1);
ok("R-B3 twenty healed clears four", resonanceBleedReduction(20) === 4);
ok("R-B4 four healed clears none", resonanceBleedReduction(4) === 0);
ok("R-B5 and nothing healed clears nothing",
  resonanceBleedReduction(0) === 0 && resonanceBleedReduction(-3) === 0);
ok("R-B6 the divisor is the printed five", RESONANCE_PER_BLEED === 5);

/* ══ R-C. THE PICKER ANNOTATES; IT DOES NOT REFUSE ════════════════════ */

ok("R-C1 a dead creature ten feet away draws no objection",
  resonanceReason({ isDead: true, feet: 10 }) === null);
ok("R-C2 exactly twenty feet is inside — the radius includes its own edge",
  resonanceReason({ isDead: true, feet: 20 }) === null);
ok("R-C3 twenty-one feet says how far",
  /21 ft away/.test(resonanceReason({ isDead: true, feet: 21 }) ?? ""));
ok("R-C4 a living creature says it is not dead",
  resonanceReason({ isDead: false, feet: 5 }) === "is not dead");
ok("R-C5 THE CASTER IS THE MORE FUNDAMENTAL OBJECTION, so it wins the row",
  /is you/.test(resonanceReason({ isSelf: true, isDead: false, feet: 900 }) ?? ""),
  "one row carries one sentence, and the deepest reason is the useful one");
/*
 * R-C6 — AN UNMEASURED DISTANCE IS NOT AN OBJECTION. Off a canvas there
 * is no answer, and "unknown distance" beside every row is noise. Same
 * rule Vibrant Thorns settled: a distance nobody measured decides
 * nothing.
 */
ok("R-C6 a distance nobody measured does not object",
  resonanceReason({ isDead: true, feet: null }) === null);

/* ══ R-D. THE CARD ════════════════════════════════════════════════════ */

ok("R-D1 the line names both creatures and the number",
  /Borin/.test(resonanceLine({ casterName: "Borin", sourceName: "Ghoul", owed: 8, healed: 8 }))
  && /Ghoul/.test(resonanceLine({ casterName: "Borin", sourceName: "Ghoul", owed: 8, healed: 8 }))
  && /8/.test(resonanceLine({ casterName: "Borin", sourceName: "Ghoul", owed: 8, healed: 8 })));
/*
 * R-D2 — THE CARD REPORTS WHAT HAPPENED, NOT WHAT WAS OWED. Song Of
 * Despair's lesson of 28 August, and Luminance's the day after: a card
 * that announces a number the actor did not receive is the interface
 * form of a check that proves the wrong thing.
 */
ok("R-D2 a heal cut short by full health SAYS what was owed",
  /of 16 owed/.test(resonanceLine({ casterName: "B", sourceName: "G", owed: 16, healed: 3 })));
ok("R-D3 a caster already at full is told so plainly",
  /already at full health/.test(
    resonanceLine({ casterName: "B", sourceName: "G", owed: 16, healed: 0 })));
ok("R-D4 the doubling is named when it applied",
  /undead/i.test(resonanceLine({ casterName: "B", sourceName: "G", owed: 16, healed: 16, undead: true }))
  && !/undead/i.test(resonanceLine({ casterName: "B", sourceName: "G", owed: 8, healed: 8, undead: false })));
ok("R-D5 the bleed line prints the move, not the request",
  /3\D+1/.test(resonanceBleedLine("B", 2, 3, 1)));
ok("R-D6 a bleed line for nothing is empty rather than a sentence saying nothing",
  resonanceBleedLine("B", 0, 0, 0) === "");
ok("R-D7 and a warp that found no bleed says so", /not bleeding/.test(resonanceNoBleedLine("B")));

/* ══ R-E. THE WIRING ══════════════════════════════════════════════════ */

const effects = strip(read("module", "magic", "spell-effects.mjs"));
ok("R-E1 the applier has a case for the kind", effects.includes('case "deathResonance": {'));
ok("R-E2 it ASKS which death, rather than guessing the nearest corpse",
  effects.includes("const source = await promptResonanceSource(caster, spell.name);"),
  "several creatures can fall in a round and the spell names one");
ok("R-E3 and a cancelled prompt draws nothing",
  /if \(!source\) \{[\s\S]{0,180}break;/.test(effects));
ok("R-E4 the resonance is applied through its own workflow",
  effects.includes("await applyDeathResonance(caster, source, bleedWarp)"));

/*
 * R-F IS THE CHECK THIS BATCH EXISTS FOR.
 *
 * The wrong design was a hook inside the death machinery. It is cheaper,
 * it is plausible, and it would have fired a reaction spell nobody cast.
 * Asserted as an ABSENCE across both new files, because the tempting
 * mistake is to add it later "so it also works automatically".
 */
{
  /*
   * SCANNED: THE WORKFLOW ONLY, and that is a correction.
   *
   * The first draft scanned the pure module too, and
   * `verify-checks-read-source` immediately reported the pair as
   * VACUOUS — rightly. R-F1 and R-F2 are claims about an ABSENCE, and an
   * absence is more true of an empty file, so blanking
   * `death-resonance.mjs` broke nothing here.
   *
   * The scan bought nothing in the first place: a pure module has no
   * Foundry to reach, so it could not hook the death machinery if it
   * tried. The workflow is where the temptation actually lives.
   */
  const drw = strip(read("module", "magic", "death-resonance-workflow.mjs"));
  ok("R-F1 NOTHING HERE HOOKS THE DEATH MACHINERY — the spell is a Reaction",
    !/reapDead|registerDeathWatchHooks|needsReaping/.test(drw),
    "castAP is Reaction: the player casting it IS the trigger");
  ok("R-F2 and nothing registers a Foundry hook of its own",
    !/Hooks\.(on|once)\(/.test(drw));
  ok("R-F3 the dead are read from the status the reaper sets",
    /statuses\?\.has\?\.\("dead"\)/.test(drw),
    "one answer to 'is this creature dead', shared with needsReaping");
  ok("R-F4 undead is asked of the shared rule, not re-decided",
    /await import\("\.\.\/aligned\.mjs"\)/.test(drw) && /isUndead\(source\.system/.test(drw),
    "a creature cannot be undead for one spell and not for another");
  ok("R-F5 the heal goes through healActor, which caps at the missing HP",
    /const healed = await healActor\(caster, owed\);/.test(drw));
  ok("R-F6 THE CASTER IS HEALED, not the creature that died",
    /healActor\(caster,/.test(drw) && !/healActor\(source,/.test(drw),
    "\"the essence of the departed creature heals YOUR wounds\"");
  ok("R-F7 the distance is measured by the one thing that measures it",
    /from "\.\.\/combat\/geometry\.mjs"/.test(drw) && /distanceBetween\(casterToken, token\)/.test(drw),
    "geometry.mjs records the three attempts it took to ask this correctly");
}

/* ══ C. BLESS WATER — THE ROW ═════════════════════════════════════════ */

const BW = {
  kind: "conjureItem", label: "Bless Water", target: "targets",
  pack: "alchemical", itemName: "Holy Water", quantity: 1, costGp: 15
};
const bw = normaliseConjuredItem(BW);
ok("C-R1 the row normalises", bw !== null);
ok("C-R2 a row of another kind is not one",
  normaliseConjuredItem({ ...BW, kind: "heal" }) === null);
ok("C-R3 a row naming no item is refused", normaliseConjuredItem({ ...BW, itemName: "" }) === null);
/*
 * C-R4 — A PACK THIS SYSTEM DOES NOT SHIP IS REFUSED. Without it a typo
 * would send the lookup at whatever compendium happened to answer, and
 * a same-named item in the wrong pack is worse than none.
 */
ok("C-R4 AND A PACK OFF THE DECLARED LIST IS REFUSED",
  normaliseConjuredItem({ ...BW, pack: "spells" }) === null
  && normaliseConjuredItem({ ...BW, pack: "" }) === null);
ok("C-R5 quantity defaults to one and never to zero",
  normaliseConjuredItem({ ...BW, quantity: 0 })?.quantity === 1
  && normaliseConjuredItem({ ...BW, quantity: -4 })?.quantity === 1
  && normaliseConjuredItem({ ...BW, quantity: 3 })?.quantity === 3);
ok("C-R6 the cost is carried and never negative",
  bw.costGp === 15 && normaliseConjuredItem({ ...BW, costGp: -9 })?.costGp === 0);
ok("C-R7 the declared packs are the three item packs",
  CONJURABLE_PACKS.includes("alchemical") && !CONJURABLE_PACKS.includes("spells"));

/*
 * C-R8 — THE CONJURED ITEM KEEPS THE PACK'S OWN NAME. A flask reading
 * "Holy Water (conjured)" would sort apart from a bought one, stack
 * separately, and tell every later reader the two are different things.
 */
ok("C-R8 the name is the pack's, unchanged", conjuredItemName(bw) === "Holy Water");

ok("C-D1 the card names the item and says the ingredients went",
  /Holy Water/.test(conjuredItemLine(bw, "Borin", "Holy Water"))
  && /15 gp/.test(conjuredItemLine(bw, "Borin", "Holy Water")));
ok("C-D2 a quantity of one prints no multiplier",
  !/&times;/.test(conjuredItemLine(bw, "Borin", "Holy Water")));
ok("C-D3 and more than one does",
  /&times;3/.test(conjuredItemLine({ ...bw, quantity: 3 }, "Borin", "Holy Water")));
ok("C-D4 a missing pack item is reported, not swallowed",
  /not there/.test(conjuredItemMissingLine(bw, "Bless Water")));

/*
 * C-D5..C-D9 — NOBODY NAMED, SO THE CASTER IS HOLDING IT.
 *
 * GRAHAM'S RULING, 26 September 2026: "Yes go with your idea on Power
 * Crystal." Measured on the 3.594.1 live drive: Power Crystal cast with
 * nothing targeted printed "finds nobody to affect", spent two PP and made
 * no crystal. Nothing was broken — the row targets `targets` — but a spell
 * whose entire output is an object you hold should not make nothing because
 * its eventual owner was not clicked first.
 *
 * GENERAL, NOT PER-SPELL: Bless Water's flask and Goodberry's berries fall
 * the same way, which is why this sits beside the other conjuring rules
 * rather than in the block-30 file.
 */
ok("C-D5 a conjuration with nobody named goes to the caster",
  JSON.stringify(conjuredItemRecipients([], { id: "c" })) === JSON.stringify([{ id: "c" }]),
  "you can hand the thing over afterwards; you cannot get the PP back");
ok("C-D6 a row that named somebody keeps them",
  JSON.stringify(conjuredItemRecipients([{ id: "t" }], { id: "c" })) === JSON.stringify([{ id: "t" }]));
ok("C-D7 A DEGREE-GATED ROW STAYS SILENT",
  JSON.stringify(conjuredItemRecipients([], { id: "c" }, { gated: true })) === "[]",
  "its degree did not come up; handing the caster a flask because a save succeeded would be "
  + "a new bug of exactly the shape this fixes");
ok("C-D8 and no caster means nobody",
  JSON.stringify(conjuredItemRecipients([], null)) === "[]");
ok("C-D9 the card says where it went and how to give it away",
  /Nobody was targeted/.test(conjuredItemNobodyNamedLine("Vaelin"))
  && /target a creature/.test(conjuredItemNobodyNamedLine("Vaelin")));

/* ══ C-E. THE WIRING, AND THE PACK ════════════════════════════════════ */

ok("C-E1 the applier has a case for the kind", effects.includes('case "conjureItem": {'));
ok("C-E1b THE FALLBACK IS ASKED BEFORE THE 'NOBODY TO AFFECT' LINE, not after",
  effects.indexOf("conjuredItemRecipients(recipients, caster, { gated: isDegreeGated(effect) })") > 0
  && effects.indexOf("conjuredItemRecipients(recipients, caster, { gated: isDegreeGated(effect) })")
    < effects.indexOf("effectNoTargetLine(effect, spell?.name)"),
  "asked afterwards it could never fire — the loop has already skipped the switch");
ok("C-E1c and only a conjuration falls back",
  /if \(effect\.kind === "conjureItem"\) \{\s*const held = conjuredItemRecipients/.test(effects),
  "every other kind with no recipients still says so");
ok("C-E1d the card tells the caster only when the fallback actually fired",
  /conjureFellBack = held\.length > 0 && recipients\.length === 0;/.test(effects)
  && /if \(conjureFellBack\) lines\.push\(line\(conjuredItemNobodyNamedLine\(target\.name\)\)\);/.test(effects));
ok("C-E2 a missing item prints the diagnostic rather than a success line",
  /if \(!made\) \{[\s\S]{0,140}conjuredItemMissingLine\(spec, spell\.name\)/.test(effects));
{
  const cw = strip(read("module", "magic", "conjured-item-workflow.mjs"));
  ok("C-E3 THE REAL DOCUMENT IS COPIED, not rebuilt",
    /const doc = await pack\.getDocument\(entry\._id\);/.test(cw)
    && /const data = doc\.toObject\(\);/.test(cw),
    "a hand-built Holy Water would lack the Splash trait the 3.482.0 mechanism reads");
  ok("C-E4 and it is matched by name, case-insensitively, against the index",
    /String\(e\.name\)\.trim\(\)\.toLowerCase\(\) === wanted/.test(cw));
  ok("C-E5 a conjured item is stamped as conjured without changing its NAME",
    /conjured: true/.test(cw) && !/\(conjured\)/.test(cw));
}

/*
 * C-P IS THE ONE THAT OPENS THE PACK.
 *
 * Every claim in this file about Holy Water is a claim about DATA, and
 * this project has been caught twice asserting an absence in the packs
 * from a search of the code. A claim about a pack belongs in a check
 * that opens the pack.
 */
{
  const alch = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "alchemical"), { valueEncoding: "json" });
  await alch.open();
  let holy = null;
  try {
    for await (const [k, v] of alch.iterator()) {
      if (k.startsWith("!items!") && String(v?.name).toLowerCase() === "holy water") holy = v;
    }
  } finally { await alch.close(); }
  ok("C-P1 HOLY WATER IS REALLY IN THE ALCHEMICAL PACK", holy !== null,
    "the whole design rests on copying it rather than describing it");
  ok("C-P2 and it carries the Splash trait the splash mechanism reads",
    /\bsplash\b/i.test(String(holy?.system?.traits ?? "")),
    "this is the field a hand-built imitation would have lost");

  const spells = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await spells.open();
  let bless = null, reaper = null;
  try {
    for await (const [k, v] of spells.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (String(v.name).toLowerCase() === "bless water") bless = v;
      if (/^reaper.s resonance$/i.test(String(v.name))) reaper = v;
    }
  } finally { await spells.close(); }

  ok("C-P3 Bless Water carries the conjure row", Boolean(
    (bless?.system?.effects ?? []).find((e) => e?.kind === "conjureItem")));
  const row = (bless?.system?.effects ?? []).find((e) => e?.kind === "conjureItem");
  ok("C-P4 AND THE ITEM IT NAMES RESOLVES IN THE PACK IT NAMES",
    Boolean(normaliseConjuredItem(row)) && row?.itemName === holy?.name,
    "a renamed pack item must fail HERE rather than at somebody's table");
  ok("C-P5 the printed 15 gp is carried", row?.costGp === 15);

  ok("R-P1 Reaper's Resonance carries the resonance row", Boolean(
    (reaper?.system?.effects ?? []).find((e) => e?.kind === "deathResonance")));
  ok("R-P2 and no longer carries only a note", !(reaper?.system?.effects ?? []).every(
    (e) => e?.kind === "note"));
  ok("R-P3 it is still a Reaction — the whole design depends on it",
    /reaction/i.test(String(reaper?.system?.castAP ?? "")),
    "if this ever becomes an action, the no-hook argument needs revisiting");
  ok("R-P4 and it still sells the bleed warp the applier looks for",
    (reaper?.system?.warps ?? []).some((w) => /bleed/i.test(String(w?.text ?? ""))),
    "the applier detects the warp by that word");
}

/* ══ T. THE TIER ══════════════════════════════════════════════════════ */

/*
 * T1 IS A RATCHET ON THE PLAN ITSELF.
 *
 * Both spells are PP 1. That is the point of the release, and it is the
 * one fact no code check would otherwise hold: a later batch that
 * "fixes" a PP 14 spell in this file would pass every check above.
 */
{
  const spells = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await spells.open();
  const pp = new Map();
  try {
    for await (const [k, v] of spells.iterator()) {
      if (k.startsWith("!items!") && v?.type === "spell") pp.set(String(v.name).toLowerCase(), Number(v.system?.ppCost ?? -1));
    }
  } finally { await spells.close(); }
  ok("T1 BOTH SPELLS IN THIS BATCH ARE PP 1",
    pp.get("bless water") === 1 && pp.get("reaper’s resonance") === 1,
    "the tier is the plan; a ratchet that ordered this work is not the same thing");
}

if (failures.length) {
  console.error(`verify-pp1-batch: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-pp1-batch: ${checks} checks passed`);
