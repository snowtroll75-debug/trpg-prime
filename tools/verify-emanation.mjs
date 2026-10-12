#!/usr/bin/env node
/**
 * verify-emanation — an emanation follows its caster, and its bonus
 * applies while you are standing in it.
 *
 * NEW at 3.426.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT.
 *
 * Graham, 27 August 2026, on Bless: "I have an issue with the way the
 * emanation works. This should move with the caster."
 *
 * `placeSpellTemplate` drops a Region on the caster's square and never
 * moves it, and the effects are stamped onto whoever was caught at that
 * instant. The cleric walks away and the circle stays; the blessed
 * fighter walks out and keeps the bonus.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE PRICE LIST HAD SAID SO TWICE.
 *
 * Bless: "+1 status bonus to attack rolls WHILE WITHIN THE EMANATION",
 * and then "+2 PP: ... after which the targets may move out of the
 * area". Bane sells the same thing in its own words. Two spells charging
 * Power Points for membership to stop mattering only makes sense if
 * membership normally matters — and both warps carried `mods: {}`, so
 * the option was inert by construction. The default and the upgrade were
 * the wrong way round.
 *
 * Section E is therefore the one that would have caught this from the
 * pack alone: a warp that sells a behaviour must carry a mod that buys
 * it.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  LIVE_EMANATION_EFFECT_KINDS, emanationDelta, emanationIsLive, emanationMembers,
  emanationFloors, emanationSave, effectsForDegree, flooredValue, hasEmanationFloor,
  keepByMode, liveEmanationEffects, membershipFrozen, untestedMembers, withinFeet
} from "../module/magic/emanation.mjs";
import { effectiveSaveDegree } from "../module/magic/spell-degrees.mjs";
import { keepByDisposition } from "../module/magic/spell-template.mjs";
import { castWillRegister } from "../module/magic/active-spells.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const flow = read("module", "magic", "emanation-workflow.mjs");
const effects = read("module", "magic", "emanation-effects.mjs");
const cast = read("module", "magic", "cast-workflow.mjs");
const boot = read("scripts", "trg-prime.mjs");

const BLESS = {
  area: "30-foot emanation", defence: "", areaTargeting: "allies",
  effects: [{ kind: "bonus", slot: "attack", bonusType: "status", value: 1 }]
};

/* ================================================================== *
 * A. WHICH EMANATIONS ARE LIVE
 * ================================================================== */

ok("A1 Bless is a live emanation", emanationIsLive(BLESS) === true);
ok("A2 a spell with no emanation is not",
  emanationIsLive({ ...BLESS, area: "30-foot burst" }) === false);
// A SAVE NO LONGER DISQUALIFIES A SPELL (3.428.0). It did at 3.426.0,
// on the reading that re-deciding membership would re-roll a save the
// book rolls once — and Bane's own outcome text settled it the other
// way: "as long as they remain within 30 feet of you". What was missing
// was never permission, it was somewhere to record what each creature
// rolled. See section H.
ok("A3 an emanation with a saving throw is live too",
  emanationIsLive({ ...BLESS, defence: "Will" }) === true,
  "Bane's penalty is printed as lasting while you remain within 30 feet");
ok("A3b and it declares the save it demands",
  emanationSave({ defence: "Will" }) === "will" && emanationSave({ defence: "" }) === null);
ok("A4 an emanation carrying no bonus is not live",
  emanationIsLive({ ...BLESS, effects: [{ kind: "note" }] }) === false);
ok("A5 a condition does not travel with the area",
  emanationIsLive({ ...BLESS, effects: [{ kind: "condition", condition: "frightened" }] }) === false,
  "Song Of Despair — whether walking back in re-frightens is undecided");
// WIDENED DELIBERATELY AT 3.435.1, which is what this assertion is for.
// `perTurn` is the first member that is not a continuous state: nothing
// is true of you while you stand in Luminance's light, but the area must
// still exist, follow its caster and know who is inside, because a
// per-turn event asks precisely that at the start of every turn. With it
// missing the spell recorded no emanation at all and healed nobody.
// `antimagic` JOINED AT 3.586.0 and is the second member that is not a
// continuous state. Nothing is TRUE of you inside an Antimagic Field;
// the spells already on you stop working and start again when you leave,
// which is a fact about crossing the boundary in both directions — and
// the boundary is the one thing this list exists to keep live.
// AND A ZONE (3.608.0, block 32's R7): Solid Fog's "all creatures within
// the mist become concealed" is a membership, true while you stand in it,
// placed on entry and lifted on exit by the same sweep.
// AND A SAVE AT THE START OF A TURN (3.609.0, block 33's R3): Turn Undead's
// circle has to be recorded and followed, and the turn clock reads it.
// AND A HELD BONUS (3.612.0, block 34's R8): Inspire Heroics' once-a-round
// advantage is held by whoever stands in the composition, on the membership
// effect, and comes off with it when they walk out.
// A RESISTANCE JOINED AT 3.613.0 (R3 of block 35, Protector's Sphere), AND A
// HEAL ON DAMAGE AT 3.614.0 (R9, Wellspring Of Valour).
ok("A6 a bonus, a per-turn event, an antimagic field, a zone, a turn save, a held bonus, a resistance and a heal on damage are the live kinds",
  LIVE_EMANATION_EFFECT_KINDS.length === 8
  && LIVE_EMANATION_EFFECT_KINDS.includes("damageHeal")
  && LIVE_EMANATION_EFFECT_KINDS.includes("defence")
  && LIVE_EMANATION_EFFECT_KINDS.includes("heldBonus")
  && LIVE_EMANATION_EFFECT_KINDS.includes("turnSave")
  && LIVE_EMANATION_EFFECT_KINDS.includes("bonus")
  && LIVE_EMANATION_EFFECT_KINDS.includes("perTurn")
  && LIVE_EMANATION_EFFECT_KINDS.includes("antimagic")
  && LIVE_EMANATION_EFFECT_KINDS.includes("zone"),
  LIVE_EMANATION_EFFECT_KINDS.join(", "));

// A SPELL MAY CARRY BOTH. Inspire Courage has a bonus AND a note; only
// the bonus follows anybody around.
ok("A7 only the bonus rows travel",
  liveEmanationEffects({ effects: [{ kind: "bonus", slot: "attack" }, { kind: "note" }] }).length === 1);

/* ================================================================== *
 * B. WHO IS INSIDE
 * ================================================================== */

const at = (x, y, disposition = 1, id = `${x},${y}`) => ({ id, centreFeet: { x, y }, disposition });

{
  const subjects = [at(0, 0, 1, "caster"), at(20, 0, 1, "near"), at(60, 0, 1, "far"), at(20, 0, -1, "foe")];
  const inside = emanationMembers({
    centreFeet: { x: 0, y: 0 }, radiusFeet: 30, subjects,
    casterDisposition: 1, mode: "allies"
  });
  ok("B1 an ally inside is caught", inside.includes("near"));
  ok("B2 an ally outside is not", !inside.includes("far"));
  ok("B3 a foe inside is not, for an allies-only area", !inside.includes("foe"));
  // "You and your allies" — the caster stands at the centre of their own
  // emanation, deliberately unlike creature ally-auras.
  ok("B4 the caster is inside their own emanation", inside.includes("caster"),
    "Bless reads 'You and your allies'");
}
ok("B5 the boundary is inclusive",
  withinFeet({ x: 0, y: 0 }, { x: 30, y: 0 }, 30) === true,
  "'within 30 feet' includes thirty");
ok("B6 and a foot beyond is out", withinFeet({ x: 0, y: 0 }, { x: 31, y: 0 }, 30) === false);
ok("B7 distance is measured diagonally, not per-axis",
  withinFeet({ x: 0, y: 0 }, { x: 25, y: 25 }, 30) === false,
  "35.4 feet away");
ok("B8 a missing centre catches nobody",
  emanationMembers({ centreFeet: null, radiusFeet: 30, subjects: [at(0, 0)] }).length === 0);

// THE DISPOSITION RULE IS DUPLICATED FROM spell-template.mjs, which
// cannot be imported without a canvas. So the two are held equal here
// rather than trusted to stay so.
{
  const disagreements = [];
  for (const mode of ["all", "allies", "enemies"]) {
    for (const t of [-1, 0, 1]) {
      for (const c of [-1, 0, 1]) {
        if (keepByMode(t, c, mode) !== keepByDisposition(t, c, mode)) {
          disagreements.push(`${mode} t${t} c${c}`);
        }
      }
    }
  }
  ok("B9 the duplicated disposition rule agrees with the original everywhere",
    disagreements.length === 0, disagreements.join(", "));
}

/* ================================================================== *
 * C. CROSSING THE EDGE
 * ================================================================== */

ok("C1 walking in earns the bonus",
  emanationDelta([], ["a"]).add.join() === "a");
ok("C2 walking out loses it",
  emanationDelta(["a"], []).remove.join() === "a");
ok("C3 standing still changes nothing",
  emanationDelta(["a"], ["a"]).add.length === 0 && emanationDelta(["a"], ["a"]).remove.length === 0,
  "a sweep runs on every move; it must be quiet when nothing crossed");
// GRAHAM'S RULING: the bonus resumes on re-entry. Expressed as the
// ABSENCE of any memory — walking out is a remove, walking back in is an
// add, and nothing records that it ever happened.
ok("C4 walking back in earns it again",
  emanationDelta([], ["a"]).add.join() === "a",
  "no memory of having left is kept, which is what makes re-entry work");
ok("C5 several can cross at once",
  emanationDelta(["a", "b"], ["b", "c"]).add.join() === "c"
  && emanationDelta(["a", "b"], ["b", "c"]).remove.join() === "a");

/* ================================================================== *
 * D. THE FROZEN WARP
 * ================================================================== */

ok("D1 unpaid membership is live", membershipFrozen(null) === false
  && membershipFrozen({}) === false);
ok("D2 the warp freezes it", membershipFrozen({ freezeMembership: true }) === true);
ok("D3 a frozen emanation is skipped by the sweep",
  /if \(!em \|\| em\.frozen\) continue;/.test(flow),
  "the caster paid for the list to stand");

/* ================================================================== *
 * E. THE WARP MUST BUY SOMETHING
 *
 * The section that would have caught this from the pack alone.
 * ================================================================== */

{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  const spells = [];
  for await (const [key, value] of db.iterator()) {
    if (key.startsWith("!") && value?.type === "spell") spells.push(value);
  }
  await db.close();

  const sellsFreedom = spells.filter((s) => (s.system?.warps ?? []).some(
    (w) => /may move out of the area|still affected for the duration if they leave/i.test(String(w.text ?? ""))));
  ok("E1 the two spells selling free movement are still there",
    sellsFreedom.length === 2, sellsFreedom.map((s) => s.name).join(", "));
  const inert = sellsFreedom.filter((s) => !(s.system?.warps ?? []).some(
    (w) => /may move out of the area|still affected for the duration if they leave/i.test(String(w.text ?? ""))
      && w.mods?.freezeMembership));
  ok("E2 and each one's warp now buys the behaviour it sells",
    inert.length === 0,
    `${inert.map((s) => s.name).join(", ")} charge PP for nothing`);

  /* ---------------------------------------------------------------- *
   * A WARP MOD KEY NOBODY HANDLES BUYS NOTHING.
   *
   * `aggregateWarpSelection` builds its `mods` from a fixed list, and a
   * key outside that list is SILENTLY DROPPED: the option is offered,
   * the PP is charged, the card says "Warped", and nothing happens.
   *
   * Found by driving 3.426.0: `freezeMembership` was authored onto
   * Bless and Bane and thrown away by the aggregator, so the cast card
   * read "Warped — +2 PP: the targets may move out of the area" over an
   * emanation that was not frozen. The same defect the emanation work
   * was fixing, reproduced one layer down while fixing it.
   *
   * So the pack is cross-checked against the function rather than
   * trusted to agree with it.
   * ---------------------------------------------------------------- */
  const warpSrc = read("module", "magic", "spell-warp.mjs");
  const authored = new Set();
  for (const spell of spells) {
    for (const warp of spell.system?.warps ?? []) {
      for (const key of Object.keys(warp.mods ?? {})) authored.add(key);
    }
  }
  const aggregate = warpSrc.slice(warpSrc.indexOf("export function aggregateWarpSelection"));
  const unhandled = [...authored].filter((key) => !new RegExp(`m\\.${key}\\b`).test(aggregate));
  ok("E2b every warp mod key the pack authors is read by the aggregator",
    unhandled.length === 0,
    `${unhandled.join(", ")} — offered, charged for, and silently dropped`);
  ok("E2c freezeMembership among them",
    /m\.freezeMembership/.test(aggregate) && authored.has("freezeMembership"));

  // THE BOUNDARY, held as a list. A further spell joining the live set
  // should be a deliberate edit rather than a side effect of authoring.
  const live = spells.filter((s) => emanationIsLive(s.system)).map((s) => s.name).sort();
  // RADIANT AEGIS JOINED AT 3.446.1, on the same reading as Wellspring
  // one release earlier: a Sustained emanation granting allies a bonus
  // while they stand inside it is Bless's shape, and the condition on the
  // ATTACKER is a question for the attack roll rather than for membership.
  // Twice in two releases this check refused a spell that had become live
  // as a side effect of authoring, which is exactly what it is for.
  //
  // WELLSPRING OF VALOUR JOINED AT 3.446.0, and this check is why the
  // join is a deliberate edit rather than a side effect. Authoring its
  // conditional attack bonus made it live automatically; E3 refused, and
  // the spell was read against the boundary before being added:
  // "grants ALLIES a +1 status bonus to attack rolls" over an emanation
  // with a Sustained duration is Bless's own shape — "while within the
  // emanation" is the whole rule — so it belongs here. What is new about
  // it is only that the bonus is CONDITIONAL on the target's aura, and
  // that is a question for the attack roll, not for membership.
  // AURA OF VITALITY JOINED AT 3.461.0, and like Wellspring it was read
  // against the boundary before being added rather than waved through.
  // It is Luminance's own shape — a per-turn heal over a circle centred
  // on the caster — and it became live for TWO deliberate reasons at
  // once: its `perTurn` row was authored, and its area was corrected
  // from "20' radius (B)" to "20-foot emanation" on Graham's ruling of 1
  // September 2026. `emanationIsLive` tests that word, so before the
  // correction the row could never have run at all. What is new about it
  // is only WHOSE turn fires it — the caster's, not each creature's —
  // and that is a question for the turn loop, not for membership.
  /*
   * E2b IS THE DEFECT AURA OF VITALITY FOUND, and it had been latent for
   * three months.
   *
   * `recordEmanation` sat inside `if (lock || spellData.sustained)` in
   * cast-workflow, and was correct there by luck: all ten live emanations
   * were Sustained, so the guard never once excluded one. Aura Of Vitality
   * is the FIRST that is neither sustained nor PP-locked — "1 minute (D)"
   * locks nothing — and it fell straight through. The spell landed, the
   * template placed, the card said "takes effect", and
   * `runningEmanations()` came back EMPTY.
   *
   * Locking PP is about what the caster owes for the duration; whether a
   * circle exists on the map is about the spell. This asserts they are no
   * longer the same question.
   */
  const castSrc = fs.readFileSync(
    path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"), "utf8");
  const lockBlock = (() => {
    /*
     * THE GUARD GREW A THIRD TERM AT 3.463.0, so this locator matches the
     * guard rather than one spelling of it — AND IT MATCHES CODE, NOT
     * PROSE.
     *
     * The first attempt was `indexOf("if (lock || spellData.sustained")`,
     * which found a COMMENT 258 lines above the guard: two of this file's
     * own notes quote the guard while explaining what moved out of it.
     * `lockBlock` was then scanned from inside a comment, the E2c mutation
     * landed outside whatever that produced, and the mutation SURVIVED —
     * a check reading a sentence about the code instead of the code, which
     * is the same defect as an import standing in for a call.
     *
     * The anchoring is what separates them: a statement starts at a line
     * beginning and ends in `) {`; a quotation of one sits mid-sentence.
     */
    // THE GUARD'S FIVE LIMBS MOVED BEHIND A NAMED RULE at 3.528.0, so the
    // block now opens `if (registersCast) {`. This still anchors on a
    // STATEMENT rather than a quotation of one, which is what separates
    // it from a check reading a sentence about the code — see above.
    const guard = /^\s*if \(registersCast\) \{$/m.exec(castSrc);
    const at = guard ? guard.index : -1;
    if (at === -1) return "";
    let depth = 0;
    for (let i = castSrc.indexOf("{", at); i < castSrc.length; i += 1) {
      if (castSrc[i] === "{") depth += 1;
      else if (castSrc[i] === "}") { depth -= 1; if (depth === 0) return castSrc.slice(at, i + 1); }
    }
    return "";
  })();
  ok("E2b the lock/sustained guard was found", lockBlock.length > 0);
  ok("E2c A LIVE EMANATION IS RECORDED WHETHER OR NOT IT IS SUSTAINED",
    castSrc.includes("await recordEmanation(actor, castId, {")
    && !lockBlock.includes("recordEmanation("),
    "Aura Of Vitality is neither sustained nor PP-locked and recorded nothing");
  /*
   * E2d IS THE HALF E2c MISSED, and driving 3.462.0 is what exposed it.
   *
   * Lifting `recordEmanation` out of the guard was NECESSARY AND NOT
   * SUFFICIENT: that function looks the cast up in the active spell
   * registry — `entries.find((e) => e.id === castId)` — and returns null
   * when there is no entry. Aura Of Vitality was never registered, so
   * there was nothing for the emanation to be written onto, and the
   * spell recorded nothing for a SECOND release running.
   *
   * Moving a call out of a guard cannot help when the thing it writes to
   * is what the guard creates. E2c asserted the placement and was
   * satisfied by it; only the table showed that the record was still
   * empty.
   */
  ok("E2d AND IT IS REGISTERED AS AN ACTIVE SPELL, which is what carries it",
    // ANCHORED ON THE PREDICATE, NOT THE WHOLE LINE (3.494.0). The gate
    // grew a fourth question in that release — `|| dismissible` — and
    // this check failed on the punctuation rather than on anything it
    // cares about. What it asserts is that the gate ASKS about a live
    // emanation; a mutation that removes the question still breaks it.
    // RUN, NOT READ (3.528.0). This asserted the gate's text and had
    // already been narrowed once when the gate gained a fourth limb; at
    // 3.528.0 the five limbs moved behind `castWillRegister`, and the
    // check failed again on punctuation rather than on the rule. What it
    // asserts is the ANSWER: a live emanation gets a registry entry.
    castWillRegister({ durationText: "1 minute", emanationLive: true }) === true,
    "recordEmanation writes onto the registry entry and returns null without one");

  // UMBRAL VEIL JOINED AT 3.492.0, and it is the first entry here whose
  // stat line carries NO AREA AT ALL — its circle is declared on an
  // effect row, because the book puts it in the description. That is why
  // `emanationIsLive` now consults the rows before it looks at the area
  // text: driving the spell showed Borin walking sixty feet out of his
  // own shadow while it stayed behind on two other characters, because
  // the registration gate this list guards had never seen it.
  // INNER SANCTUM JOINED AT 3.590.0 (pages 281-290), and it is the second
  // entry whose circle is declared on an effect row rather than in the
  // stat line -- its `lightShift` carries the radius, exactly as Umbral
  // Veil's does. It is also the FIRST with `follows: false`: a sanctum is
  // a placed area, so `anchorTokenId` is null and the circle stays where
  // it was drawn while the caster walks out of it. That is the property
  // the list is really guarding -- a live emanation gets a registry
  // entry, and without one the spell writes its circle onto nothing.
  // DEVASTATING MIGHT AND HAUNTING MIASMA JOINED AT 3.611.0 (pages 341-350).
  // Both print an emanation centred on the caster and both were empty or a
  // note until now: Devastating Might's DR -3 is a bonus that travels with
  // the circle ("all creatures within the spell's radius, including
  // yourself"), and Haunting Miasma's "incapable of diminishing" is Song Of
  // Despair's floor, which only a running emanation can hold.
  // INSPIRE HEROICS JOINED AT 3.612.0 (block 34's R8): its held advantage
  // belongs to whoever is inside the 60-foot composition, so the circle has
  // to be recorded and followed like Inspire Courage's.
  // PROTECTOR'S SPHERE JOINED AT 3.613.0, by Graham's R3 of 2 October 2026:
  // "a shielding aura radiates from you" — a resistance held while inside.
  ok("E3 exactly the ruled spells are live",
    live.join(" | ") === "Antimagic Field | Aura Of Vitality | Bane | Bless "
      + "| Devastating Might | Ember Of Devotion | Haunting Miasma | Inner Sanctum | Inspire Courage | Inspire Defence "
      + "| Inspire Heroics | Luminance | Protective Ward | Protector’s Sphere | Radiant Aegis | Solid Fog | Song Of Despair "
      + "| Tangling Creepers | Turn Undead | Umbral Veil | Wellspring Of Valour",
    live.join(" | "));
  // THE PARAGRAPH THAT USED TO SIT HERE WAS STALE FOR A RELEASE, and it
  // is recorded rather than quietly replaced. It read "TURN UNDEAD AND
  // SONG OF DESPAIR STAY OUT ... whether walking back in re-frightens a
  // creature that has shaken it off is a question Graham has not been
  // asked" — while the assertion directly above it already listed Song Of
  // Despair among the live spells, and the question had been asked and
  // answered on 28 August 2026.
  //
  // That is the second stale comment found in the emanation files in two
  // days, both written by the person who had spent those days naming the
  // defect. The check was right; the prose explaining it was a confident
  // sentence nobody re-read. Worth noticing that no harness can catch
  // this class — a comment asserts nothing — which is why the habit of
  // reading them aloud against the code is the only instrument there is.
  //
  // TURN UNDEAD IS IN AT LAST (3.609.0, block 33's R3). It was out because
  // "its only effect is a note; there is nothing to follow". It has a save
  // owed at the start of each undead's turn in the circle now, and the
  // circle has to follow its caster for that to be asked of the right
  // ground. Tangling Creepers joined beside it, a placed zone like Solid Fog.
  ok("E3b Turn Undead is in, because it now has something to follow",
    live.includes("Turn Undead"),
    "its turn save is read from the circle the registry follows");

  // WHO AN AREA IS AIMED AT, against what its own first line says.
  // Bane read `all` and caught its own caster — found by driving it, and
  // visible the moment its neighbours are put side by side.
  for (const [name, expected, phrase] of [
    ["Bless", "allies", "You and your allies"],
    ["Bane", "enemies", "Adversaries in the area"],
    ["Song Of Despair", "enemies", "Foes within the area"],
    ["Protective Ward", "allies", "envelops you and your allies"]
  ]) {
    const spell = spells.find((s) => s.name === name);
    ok(`E7 ${name} is aimed at ${expected}, as its text says`,
      spell?.system?.areaTargeting === expected,
      `reads "${phrase}" and targets ${spell?.system?.areaTargeting}`);
  }

  // BANE'S PRINTED LADDER. Its outcome table reads -1 on a Failure and
  // -2 on a Fumble; the pack carried ONE ungated -1 row, so a fumbling
  // creature took the failure's penalty. Found while reading the text
  // that settled A3.
  const bane = spells.find((s) => s.name === "Bane");
  ok("E4 Bane gates its penalty on the degree rolled",
    (bane.system.effects ?? []).every((e) => Array.isArray(e.onSave) && e.onSave.length),
    "one ungated row applied the same penalty to every failing degree");
  ok("E5 a Failure is -1 and a Fumble is -2",
    effectsForDegree(bane.system.effects, "failure", effectiveSaveDegree)[0]?.value === -1
    && effectsForDegree(bane.system.effects, "fumble", effectiveSaveDegree)[0]?.value === -2,
    "as printed");
  ok("E6 and a Success takes nothing",
    effectsForDegree(bane.system.effects, "success", effectiveSaveDegree).length === 0);
}

/* ================================================================== *
 * F. WIRED — the circle follows, and the sweep runs
 * ================================================================== */

// ANCHORED ON THE LOOKUP AS WELL AS THE UPDATE. The first draft asked
// only that a `region.update({type:"circle", x: centre.x ...})` appeared
// — and a mutation replacing the LOOKUP with `null` left that block
// intact and merely unreachable, so the most important check in this
// file passed against a Region that never moved. The lookup is the half
// that makes the update reach anything.
ok("F1 the Region is found from the emanation's own record",
  /const region = canvas\.scene\?\.regions\?\.get\(emanation\.regionId\)/.test(flow),
  "without the lookup the update below is unreachable");
ok("F1b and moved to the caster",
  /region\.update\(\{[\s\S]{0,200}type: "circle", x: centre\.x, y: centre\.y/.test(flow));
// F2 THE RULE IS THE DOCUMENT, NOT THE VARIABLE NAME. This read
// `tokenCentre(token.document)` until 3.490.0, when the circle gained an
// ANCHOR so Umbral Veil could centre on its target rather than its
// caster. What must not change is that the centre comes from a token
// DOCUMENT — Foundry V14 animates a placeable's x and y across a move,
// so reading the placeable would drag the Region along the tween and
// leave it wherever the animation happened to be.
ok("F2 from the committed token centre, not the animating one",
  /tokenCentre\((?:anchorToken|token)\.document\)/.test(flow)
  && !/tokenCentre\((?:anchorToken|token)\)[^.]/.test(flow)
  && /from "\.\.\/creature-aura-workflow\.mjs"/.test(flow),
  "Foundry V14 animates a token document's x and y across a move");
// F2b AND IT IS THE ANCHOR'S. Added with the anchor so that F1b and F2
// cannot both pass against a circle drawn on the caster while its own
// record names somebody else — see verify-light-shift, section N.
ok("F2b and the shape is drawn from the anchor",
  /const centre = tokenCentre\(anchorToken\.document\);/.test(flow),
  "a circle drawn on the caster while its record names the target");
ok("F3 the refresh is serialised per cast",
  /serialiseByKey\(`emanation:/.test(flow),
  "a read-modify-write against the scene races itself otherwise");
// SCOPED TO THE updateToken HOOK ITSELF. The first draft searched 400
// characters after `Hooks.on("updateToken"` for a call to
// refreshAllEmanations — and the createToken hook below is well within
// 400 characters, so gutting the move hook changed nothing the check
// could see. The blessed fighter walked out and kept the bonus, and this
// passed.
const moveHook = (() => {
  const at = flow.indexOf('Hooks.on("updateToken"');
  if (at < 0) return "";
  const end = flow.indexOf('Hooks.on("createToken"', at);
  return flow.slice(at, end < 0 ? flow.length : end);
})();
ok("F4a the move hook was located", moveHook.length > 100,
  "an empty region satisfies the claim below");
ok("F4 every emanation is swept when any token moves",
  /await refreshAllEmanations\(\)/.test(moveHook),
  "the caster moving takes the circle; anyone else moving crosses its edge");
ok("F5 the hooks are guarded by the acting GM, not by isGM",
  (flow.match(/isActingGM\(\)/g) ?? []).length >= 3,
  "a hook fires on every client; two GMs would reconcile twice");
ok("F6 the hooks are registered at boot",
  /registerEmanations\(\)/.test(boot) && /emanation-workflow\.mjs/.test(boot));
ok("F7 the cast records a live emanation",
  /emanationIsLive\(spellData\) && placedArea\?\.regionId/.test(cast));
ok("F8 and records whether the caster froze it",
  /frozen: membershipFrozen\(warpMods\)/.test(cast));

/* ================================================================== *
 * G. THE EFFECT PLACED AND LIFTED
 * ================================================================== */

{
  const data = (await import("../module/magic/emanation-effects.mjs"))
    .emanationEffectData({ name: "Bless", effects: BLESS.effects }, "cast-1", "Vex");
  ok("G1 the change writes into the bonus pool",
    data.changes[0].key === "system.combat.attack.status",
    data.changes[0].key);
  ok("G2 carrying the spell's value", data.changes[0].value === "1");
  ok("G3 stamped with the cast id, so removal is exact",
    data.flags["trg-prime"].castId === "cast-1");
  ok("G4 and marked as an emanation's",
    data.flags["trg-prime"].emanation === true,
    "so a sweep can tell it from an effect that follows you wherever you go");
  ok("G5 the caster is named on it", /Vex/.test(data.name));
  // NOTHING TO PLACE PLACES NOTHING rather than an empty effect — the
  // lesson `applyBonusEffect` records at 3.411.1: an effect with an
  // empty changes array looks applied on the Effects tab and does
  // nothing.
  //
  // AN UNKNOWN SLOT IS NOT THAT CASE, and the first draft of this check
  // assumed it was. `bonusTargetFor` refuses only the all-speeds slot;
  // for anything else it INVENTS `system.combat.<slot>`, so a typo in a
  // pack entry writes to a path that does not exist and no one is told.
  // That is a pre-existing weakness in the shared helper rather than
  // something this file introduced, and asserting a refusal that does
  // not happen would be a check that proves the wrong thing.
  const mod = await import("../module/magic/emanation-effects.mjs");
  ok("G6 an emanation with no bonus rows yields no effect at all",
    mod.emanationEffectData({ name: "X", effects: [{ kind: "note" }] }, "c", "") === null);
  ok("G6b and the all-speeds slot, which the shared helper does refuse",
    mod.emanationEffectData({ name: "X", effects: [{ kind: "bonus", slot: "allSpeeds", value: 1 }] }, "c", "") === null,
    "bonusTargetFor returns null for that one and a path for every other");
}
// RE-ANCHORED AT 3.586.0. The early return became `{ effect: null,
// line: "" }` when antimagic gave this function something to SAY as well
// as something to place, and one shape for both answers was safer than
// two. The check is the same check — it still pins the guard and its
// return to the one line that stops a second copy — and it is anchored
// on `held` rather than on the returned literal so the next change to
// the shape does not silently pass.
ok("G7 a creature already holding it is not given a second copy",
  /const held = Array\.from\(actor\.effects[\s\S]{0,200}if \(held\) return \{ effect: null, line: "" \};/.test(effects),
  "the sweep runs on every move; a second copy would double the bonus");
// ADOPTION — the defect driving 3.426.0 found. The cast places the
// bonus knowing nothing about emanations, so the creatures caught AT THE
// CAST were held by an owner that could never let go: `holdersOf` asks
// only about the castId, while removal also requires the marker. Walking
// out did nothing, in the one case that matters most.
ok("G9 the cast's own effects are adopted by the emanation",
  /export async function adoptCastEffects\(castId\)/.test(effects)
  && /flags\.\$\{SYSTEM_ID\}\.emanation`\]: true/.test(effects),
  "otherwise the creatures blessed at the cast can never be unblessed");
ok("G10 adoption stamps rather than re-creates",
  /updateEmbeddedDocuments\("ActiveEffect"/.test(effects)
  && !/deleteEmbeddedDocuments[\s\S]{0,200}adoptCastEffects/.test(effects),
  "re-creating would flash the bonus off and on for every viewer");
ok("G11 recording an emanation adopts what the cast placed",
  // 3.609.1: the guard also reads `reconcile`, false only for the save
  // write-back inside a refresh (F3 of the 3.609.0 live test).
  /if \(!descriptor\?\.frozen && reconcile\) \{[\s\S]{0,200}adoptCastEffects\(castId\)/.test(flow),
  "and a frozen one keeps its cast-placed effects, unowned and permanent");

// THE CONJUNCTION, not two strings near each other. The first draft
// looked for `castId` and then "emanation" within 120 characters, and
// after adoption was added the word appeared in the neighbouring
// function — so dropping the second clause entirely left the check
// matching text from somewhere else.
ok("G8 removal takes only this emanation's effects",
  /=== castId\s*\n\s*&& e\.getFlag\?\.\(SYSTEM_ID, "emanation"\)\)/.test(effects),
  "not the spell's other effects, and not another casting's");

/* ================================================================== *
 * H. A SAVE-GATED EMANATION
 *
 * Graham's two rulings, 28 August 2026:
 *   - a creature walking IN after the cast makes the save then;
 *   - a creature that already failed and walks back in is penalised
 *     again WITHOUT a new save.
 *
 * The second is the one with teeth: it means the save is rolled at most
 * once per creature per casting, so the degree has to be REMEMBERED.
 * Bless needed the opposite — no memory at all — and the same two
 * functions serve both, which is why they are checked together.
 * ================================================================== */

ok("H1 a creature that has not rolled owes a save",
  untestedMembers({}, ["a", "b"]).join() === "a,b");
ok("H2 one that has rolled never owes another",
  untestedMembers({ a: "failure" }, ["a", "b"]).join() === "b",
  "Graham's re-entry ruling: it failed once, and being inside is the condition");
ok("H3 a creature that SUCCEEDED is remembered too",
  untestedMembers({ a: "success" }, ["a"]).length === 0,
  "otherwise passing the save would buy one step of relief and another roll");
ok("H4 an empty record and a missing one behave alike",
  untestedMembers(undefined, ["a"]).join() === "a");

// THE DEGREE DECIDES WHAT IS CARRIED, and the same function must leave
// an ungated list alone.
const GATED = [
  { kind: "bonus", slot: "attack", value: -1, onSave: ["failure"] },
  { kind: "bonus", slot: "attack", value: -2, onSave: ["fumble"] }
];
ok("H5 a failure carries the failure row",
  effectsForDegree(GATED, "failure", effectiveSaveDegree)[0].value === -1);
ok("H6 a fumble carries the worse one",
  effectsForDegree(GATED, "fumble", effectiveSaveDegree)[0].value === -2);
ok("H7 a blunder reads at the fumble rung",
  effectsForDegree(GATED, "blunder", effectiveSaveDegree)[0].value === -2,
  "no spell prints a blunder row; effectiveSaveDegree decides which it reads at");
ok("H8 a success carries nothing",
  effectsForDegree(GATED, "success", effectiveSaveDegree).length === 0);
ok("H9 an untested creature carries nothing",
  effectsForDegree(GATED, null, effectiveSaveDegree).length === 0,
  "a gated effect with no recorded degree must not default to applying");
// BLESS UNCHANGED. An ungated list ignores the degree entirely.
ok("H10 an ungated list applies whatever the degree",
  effectsForDegree([{ kind: "bonus", value: 1 }], null, effectiveSaveDegree).length === 1
  && effectsForDegree([{ kind: "bonus", value: 1 }], "success", effectiveSaveDegree).length === 1);

const saveFlow = read("module", "magic", "emanation-save-workflow.mjs");
ok("H11 the entry save is rolled, not merely announced",
  /TRGCheck\.roll\(\{/.test(saveFlow),
  "the cast rolls its area saves; one spell must not answer that two ways");
ok("H12 against the DC recorded at the cast",
  /Number\(emanation\?\.saveDC\)/.test(saveFlow),
  "a caster since weakened does not make their standing Bane easier to resist");
ok("H13 an unrecorded DC fails rather than passes",
  /degree = check\.outcome\?\.degree\?\.key \?\? "failure"/.test(saveFlow),
  "a silent pass would let a missing DC protect everyone who walked in");
ok("H14 the refresh rolls only for those who owe one",
  /untestedMembers\(emanation\.tested, inside\)/.test(flow));
// BOTH PRESENT, THEN ORDERED. `indexOf` answers -1 for a string that is
// not there, and -1 is less than every real index — so removing the
// write-back entirely made this ordering claim MORE true. It survived
// its own mutation on the first run. The same `-1 <` trap has now been
// found three times in this harness; it is written out here so the next
// ordering claim is built from a shape that cannot fall into it.
{
  // 3.609.1: written back with `{ reconcile: false }` (F3).
  const wrote = flow.indexOf("recordEmanation(actor, entry.id, { ...emanation, tested }, { reconcile: false })");
  const applied = flow.indexOf("applyEmanationEffectsTo(");
  ok("H15 and writes the result back before applying anything",
    wrote >= 0 && applied >= 0 && wrote < applied,
    `write-back@${wrote} apply@${applied} — a result rolled and not stored is a save `
    + "the creature makes again on its next step");
}
ok("H16 the recorded degree reaches the effect",
  /emanation\.tested\?\.\[id\] \?\? null/.test(flow));
ok("H17 the tested record survives a re-record",
  /tested: entry\.emanation\?\.tested \?\? \{\}/.test(flow),
  "the refresh writes back through recordEmanation; a rebuilt descriptor would drop it");
// THE CAST'S OWN SAVES SEED THE RECORD (3.428.1). Driving 3.428.0 found
// `tested` empty after a cast: the map was written only by the ENTRY
// save, so the creatures the spell actually landed on were the ones with
// no memory of having rolled — and the first step out and back in
// re-rolled a save the book rolls once.
ok("H19 the cast seeds the record with what it rolled",
  /tested: castSaveDegrees\(spellSave\)/.test(cast));
ok("H20 keyed by token, because membership is",
  /\(canvas\?\.tokens\?\.placeables \?\? \[\]\)\.find\(\(t\) => t\.actor === result\.target\)/.test(cast),
  "an unlinked token has its own actor, and two tokens of one actor stand apart");
// NO FILTER ON `saved` AT ALL, in either polarity. The first draft
// looked for `if (!result.saved)` and a mutation adding `if
// (result.saved) continue;` walked straight past it — a check that
// forbids one spelling of a mistake and permits its mirror.
{
  const at = cast.indexOf("function castSaveDegrees");
  const body = at < 0 ? "" : cast.slice(at, at + 700);
  ok("H21a the helper was located", body.length > 200);
  ok("H21 a creature that SAVED is recorded too",
    !/result\.saved/.test(body),
    "the record answers 'has it rolled?'; omitting passers asks them again next step");
}

ok("H18 the cast records the save and its DC",
  // 3.609.1: not for a save owed at the start of a turn (F2, Turn Undead).
  /save: spellSavesOnTurnStart\(spellData\.effects\) \? null : emanationSave\(spellData\)/.test(cast) && /saveDC: saveDC \?\? null/.test(cast));

/* ================================================================== *
 * I. A FLOOR, WHICH IS NEITHER A BONUS NOR A SAVE
 *
 * Song Of Despair: "They become frightened 1 and CANNOT REDUCE their
 * frightened condition below 1 as long as they remain within the area."
 *
 * A third shape. Not Bless's bonus, which walking out lifts; not Bane's
 * save-gated penalty, since the spell has no save at all. A minimum —
 * raised on arrival, released on departure, and curing nothing.
 * ================================================================== */

const DESPAIR = [
  { kind: "condition", condition: "frightened", value: 1, floor: true },
  { kind: "note", text: "..." }
];

ok("I1 a floored condition is read off the effect row",
  emanationFloors(DESPAIR).frightened === 1);
ok("I2 a plain condition imposes no floor",
  Object.keys(emanationFloors([{ kind: "condition", condition: "frightened", value: 1 }])).length === 0,
  "declared, not inferred — every other condition effect is unchanged");
ok("I3 a bonus row imposes none either",
  Object.keys(emanationFloors([{ kind: "bonus", slot: "attack", value: 1 }])).length === 0);
ok("I4 a spell carrying only a floor still counts as live",
  emanationIsLive({ area: "30-foot emanation", effects: DESPAIR }) === true,
  "Song Of Despair has no bonus at all; qualifying on one would exclude it again");
ok("I5 and the floor is detectable on its own", hasEmanationFloor({ effects: DESPAIR }) === true
  && hasEmanationFloor({ effects: [{ kind: "bonus" }] }) === false);
ok("I6 a zero floor is not a floor",
  Object.keys(emanationFloors([{ kind: "condition", condition: "x", value: 0, floor: true }])).length === 0);

// RAISES, NEVER LOWERS — the half that would otherwise CURE fear.
ok("I7 the floor raises a value below it", flooredValue(0, 1) === 1);
ok("I8 and leaves a higher one alone", flooredValue(3, 1) === 3,
  "reading it as 'becomes 1' would cure two points by walking into the cause");
ok("I9 with no floor it changes nothing", flooredValue(2, 0) === 2 && flooredValue(0, 0) === 0);

const conditions = read("module", "combat", "conditions-workflow.mjs");
ok("I10 the recovery check asks for the floor before it writes",
  /conditionFloorFor\(actor, "frightened"\)/.test(conditions),
  "applying it only on movement is decorative — a creature standing still could recover past it");
ok("I11 and clamps the result to it",
  /Math\.max\(0, Math\.max\(current \+ delta, floor\)\)/.test(conditions));
// THE GUARD AND THE MESSAGE TOGETHER. Asking only for the sentence is a
// claim that a string exists, not that anything can reach it — a
// mutation making the branch `if (false)` left the text sitting in dead
// code and this passed. That is the fifth time in two days the harness
// has asserted presence where reachability was the point.
ok("I12 a recovery held by the floor says so",
  /if \(floor && next === floor && current \+ delta < floor\) \{[\s\S]{0,300}an area effect prevents Frightened/
    .test(conditions),
  "a save that succeeds and changes nothing reads as the system being broken");
// WHAT ACTUALLY CHANGED. The card printed the raw delta, so a creature
// frightened 1 rolling a Heroic recovery read "reduces by 3, to 0" — it
// had one point to lose. Pre-existing and hidden by the clamp at zero;
// the floor made it self-contradictory on one card ("Held at 1" then
// "reduces by 3, to 1"), which is how it was noticed.
ok("I12b the card reports the change that happened, not the one offered",
  /const moved = next - current;/.test(conditions)
  && /Frightened reduces by <strong>\$\{-moved\}/.test(conditions),
  "a clamped recovery announced a reduction it did not make");

ok("I13 the floor is read from where the creature is standing",
  /export function conditionFloorFor\(actor, condition\)/.test(flow)
  && /runningEmanations\(\)/.test(flow),
  "so stepping outside first is exactly what the spell asks");

// LEAVING CURES NOTHING — there must be no counterpart in the remove loop.
ok("I14 entering raises the condition to the floor",
  /for \(const \[condition, floor\] of Object\.entries\(emanation\.floors \?\? \{\}\)\)/.test(flow));
ok("I15 and leaving does not lower it",
  !/floors[\s\S]{0,400}for \(const id of remove\)/.test(flow),
  "the text forbids reducing below 1 while inside and says nothing about the fear ending");
ok("I16 the cast records the floors",
  /floors: emanationFloors\(spellData\.effects\)/.test(cast));

/* ================================================================== */

const label = "verify-emanation";
if (failures.length) {
  console.error(`${label}: ${failures.length} of ${checks} checks FAILED`);
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}
console.log(`${label}: ${checks} checks passed`);
