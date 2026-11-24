#!/usr/bin/env node
/**
 * verify-stone-shield — core 3.707.0: Stone Shield, fully implemented.
 *
 * Graham, 21 November 2026: "Can you please fully implement this". Since
 * 3.406.0 the +4 DB against the chosen foe was a ward (verify-ward); the
 * rest of the spell was a note nothing read. Now:
 *
 *   A  the rule (magic/barrier.mjs): Hardness 8 and 15 Hits, a miss by 1-4
 *      from THAT foe strikes the shield, damage through Hardness, destroyed
 *      at 0; the cast's earth-or-stone question; the reaction's refusals.
 *   B  the pack row, the owned-copy repair and the declared fix agree.
 *   C  the applier writes the shield on the ward's own effect, with the
 *      ward's own scope.
 *   D  every attack that reaches a defender asks the shield: the Strike
 *      (before the stray shot), the spell attack, the bomb, Spiritual
 *      Weapon — which also now reads the defender's DB rows.
 *   E  the shield is damaged through the GM when the rolling client does not
 *      own the caster; destroying it ends the spell.
 *   F  the cast asks "Are you adjacent to … earth or stone?" and refuses on
 *      No before anything is spent; the reaction offer states it instead.
 *   G  the reaction offer, beside Nimble Dodge, with the attacker in hand.
 *
 * Graham's rulings the same day: +4 DB only, as printed; area damage by the
 * GM's "Damage the shield" button; ask about earth or stone and refuse on
 * No; offered as a reaction like Nimble Dodge.
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

const B = await mod("magic", "barrier.mjs");
const W = await mod("magic", "barrier-workflow.mjs");

const FOE = "Scene.s.Token.ogre1.Actor.a";
const OTHER = "Scene.s.Token.ogre2.Actor.a";
const SPEC = { hardness: 8, hits: 15, missWithin: 4 };

/* A — the rule ---------------------------------------------------------- */
{
  equal("A1 the printed shield", B.normaliseBarrier({ hardness: 8, hits: 15, missWithin: 4 }), SPEC);
  ok("A2 a shield with no Hits, or that catches no miss, is refused",
    B.normaliseBarrier({ hardness: 8, hits: 0, missWithin: 4 }) === null
    && B.normaliseBarrier({ hardness: 8, hits: 15, missWithin: 0 }) === null
    && B.normaliseBarrier(null) === null);
  const raised = B.barrierAtCast(SPEC, { label: "Stone Shield", sourceUuids: [FOE], spellName: "Stone Shield", castId: "c1" });
  equal("A3 raised with the ward's scope and its full Hits", raised,
    { label: "Stone Shield", spellName: "Stone Shield", hardness: 8, hits: 15, max: 15, missWithin: 4, sourceUuids: [FOE], castId: "c1" });
  ok("A4 a shield against nobody is not raised", B.barrierAtCast(SPEC, { label: "Stone Shield", sourceUuids: [] }) === null);

  const catches = (missBy, who = FOE, hits = false, barrier = raised) => B.barrierCatches(barrier, { attackerUuid: who, missBy, hits });
  equal("A5 that foe's misses by 1, 2, 3 and 4 strike the shield", [1, 2, 3, 4].map((m) => catches(m)), [true, true, true, true]);
  ok("A6 a hit (miss by 0 or less), a miss by 5, and no margin do not", !catches(0) && !catches(-3) && !catches(5) && !catches(null));
  ok("A7 another creature's near miss does not — the shield is between you and ONE foe", !catches(2, OTHER));
  ok("A8 nor a blow that hit, nor a shield already at 0 Hits", !catches(2, FOE, true) && !catches(2, FOE, false, { ...raised, hits: 0 }));
  equal("A9 the margin is the DB less the total", [B.missMargin(16, 20), B.missMargin(20, 20), B.missMargin(null, 20), B.missMargin(16, NaN)], [4, 0, null, null]);

  equal("A10 Hardness 8 first: 10 damage takes 2", B.barrierAfterDamage(raised, 10),
    { rolled: 10, stopped: 8, taken: 2, before: 15, after: 13, max: 15, destroyed: false });
  equal("A11 7 damage is stopped outright", B.barrierAfterDamage(raised, 7).taken, 0);
  equal("A12 23 damage destroys it exactly", B.barrierAfterDamage(raised, 23), { rolled: 23, stopped: 8, taken: 15, before: 15, after: 0, max: 15, destroyed: true });
  ok("A13 and more than that is destroyed too, never below 0", B.barrierAfterDamage(raised, 40).after === 0 && B.barrierAfterDamage(raised, 40).destroyed);
  ok("A14 the card says the spell ends", /destroyed.*the spell ends/.test(B.barrierDamageLine(raised, B.barrierAfterDamage(raised, 30))));
  ok("A15 and what is left otherwise", /13\/15 Hits/.test(B.barrierDamageLine(raised, B.barrierAfterDamage(raised, 10))));

  const effects = [
    { id: "e1", disabled: false, flags: { "trg-prime": { barrier: raised } } },
    { id: "e2", disabled: true, flags: { "trg-prime": { barrier: { ...raised, sourceUuids: [OTHER] } } } },
    { id: "e3", disabled: false, flags: { "trg-prime": { barrier: { ...raised, hits: 0, sourceUuids: [OTHER] } } } }
  ];
  equal("A16 the shield against this attacker is found", B.barrierAgainst(effects, FOE)?.effectId, "e1");
  ok("A17 a disabled one, or one at 0 Hits, is not up", B.barrierAgainst(effects, OTHER) === null);
  equal("A18 every standing shield, for the GM", B.barriersOn(effects).map((s) => s.effectId), ["e1"]);

  const q = "Are you adjacent to a large area of earth or stone, such as the ground or a wall?";
  equal("A19 a spell's questions, once each", B.castQuestionsOf({ effects: [{ castQuestion: q }, { castQuestion: q }, { kind: "note" }] }), [q]);
  equal("A20 the refusal says what is needed",
    B.castQuestionRefusal("Stone Shield", q),
    "Stone Shield cannot be cast — you must be adjacent to a large area of earth or stone, such as the ground or a wall.");

  // A21 is asked through the registered offer, in G4b below.
  ok("A21 (see G4b)", true);
}

/* B — the pack, the owned-copy repair, the declared fix ------------------ */
const WANT = [{
  kind: "ward", target: "self", slots: ["defence"], bonusType: "circumstance", value: 4, label: "Stone Shield",
  barrier: { hardness: 8, hits: 15, missWithin: 4 },
  castQuestion: "Are you adjacent to a large area of earth or stone, such as the ground or a wall?",
  foes: 1
}];
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  let stone = null;
  try { for await (const [k, v] of db.iterator()) if (k.startsWith("!items!") && v?.name === "Stone Shield") stone = v; } finally { await db.close(); }
  equal("B1 the pack's Stone Shield is the ward with its shield and its question, and no note", stone?.system?.effects, WANT);
  ok("B2 still a reaction, 2 PP, as printed", stone?.system?.castAP === "Reaction" && Number(stone?.system?.ppCost) === 2);

  const { PACK_REPAIRS } = await mod("data", "pack-repairs.mjs");
  const repair = PACK_REPAIRS.find((r) => r.id === "stone-shield-barrier-3707");
  equal("B3 an owned copy is brought to the same row", repair?.to, WANT);
  const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes;
  const fix = fixes.find((f) => f.id === "stone-shield-one-foe-3707-1");
  const mid = fixes.find((f) => f.id === "stone-shield-barrier-3707");
  const older = fixes.find((f) => f.id === "stone-shield-ward-scope");
  ok("B4 the declared fixes agree with the repair, each retiring the one before",
    JSON.stringify(fix?.to) === JSON.stringify(WANT) && JSON.stringify(mid?.from) === JSON.stringify(repair?.from)
    && JSON.stringify(fix?.from) === JSON.stringify(mid?.to)
    && older?.supersededBy === "stone-shield-barrier-3707" && mid?.supersededBy === "stone-shield-one-foe-3707-1");
  ok("B5 a pre-3.406.0 owned copy (+4 against everyone) and a 3.707.0 one are recognised as stale too",
    JSON.stringify(repair?.alsoFrom?.[0]) === JSON.stringify(older?.from) && JSON.stringify(repair?.alsoFrom?.[1]) === JSON.stringify(mid?.to));
  const { classifyRepairs } = await import(new URL("../module/pack-repair.mjs", import.meta.url));
  equal("B6 the migration's own rule: the three old rows stale, the new row current",
    [classifyRepairs({ effects: repair.from }, [repair])[0].state, classifyRepairs({ effects: older.from }, [repair])[0].state, classifyRepairs({ effects: mid.to }, [repair])[0].state, classifyRepairs({ effects: WANT }, [repair])[0].state],
    ["stale", "stale", "stale", "current"]);
  const MIG = read("module", "migration.mjs");
  ok("B7 the pack-copy pass is re-gated so a world is offered it", /const packCopies = \(await runIf\("3\.707\.1", "stale owned copies/.test(MIG)
    // The stamp at 3.707.1 OR LATER (3.712.3 raised it for the Spellbook
    // rename): a later stamp still offers this pass to a world before it.
    && (() => {
      const stamp = MIG.match(/export const TRG_SCHEMA_VERSION = "(\d+)\.(\d+)\.(\d+)";/)?.slice(1).map(Number);
      if (!stamp) return false;
      const want = [3, 707, 1];
      for (let i = 0; i < 3; i++) if (stamp[i] !== want[i]) return stamp[i] > want[i];
      return true;
    })());
}

/* C — the applier -------------------------------------------------------- */
{
  const SE = read("module", "magic", "spell-effects.mjs");
  const ward = SE.slice(SE.indexOf('        case "ward": {'), SE.indexOf('        case "defenceDC": {'));
  ok("C1 the shield is built from the row with the WARD'S scope", /barrierAtCast\(normaliseBarrier\(effect\.barrier\), \{\n\s+label: effect\.label \|\| spell\.name, sourceUuids: hostileUuids,/.test(ward));
  ok("C2 and written on the ward's own effect", /if \(barrier\) effectFlags\[SYSTEM_ID\]\[BARRIER_FLAG\] = barrier;/.test(ward)
    && ward.indexOf("effectFlags[SYSTEM_ID][BARRIER_FLAG]") < ward.indexOf("await createEffectsOn(target, [data]);"));
  ok("C3 a malformed shield is said, not silent", /declares a malformed barrier/.test(ward));
  ok("C4 the cast card names it and carries the GM's button", /barrierRaisedLine\(barrier, wardedNames\)/.test(ward) && /barrierButton\(target, written\.effectId\)/.test(ward));
}

/* D — every attack asks the shield --------------------------------------- */
{
  const AWK = read("module", "combat", "attack-workflow.mjs");
  const at = (s) => AWK.indexOf(s);
  ok("D1 the Strike asks before the stray shot, and a shield's catch is not also a stray shot",
    at("barrierStruck = barrierInTheWay(targetActor, actor, { missBy, hits: outcome.hits });") > 0
    && at("barrierStruck = barrierInTheWay(") < at("if (!barrierStruck && isRanged && strayCandidates.length"));
  ok("D2 its damage is rolled with no creature under it, and dealt to the shield",
    /\} else if \(barrierStruck\) \{[\s\S]{0,1200}struckObject: barrierStruck\.barrier\?\.label \|\| "the shield"[\s\S]{0,200}await strikeBarrierWith\(targetActor, barrierStruck, Number\(struck\?\.total \?\? 0\)/.test(AWK));
  ok("D3 a struck object really has no target in the damage step",
    /const targetTokenHere = struckObject \? null : \(targetTokenOverride \?\? firstTargetToken\(\) \?\? null\);/.test(AWK)
    && /const replaceToken = struckObject \? null :/.test(AWK));
  ok("D4 no critical and no precision on it", /\} else if \(barrierStruck\) \{[\s\S]{0,500}critical: null,[\s\S]{0,400}powerAttack: false,/.test(AWK)
    && !/\} else if \(barrierStruck\) \{[\s\S]{0,900}sneakDice/.test(AWK));

  const CW = read("module", "magic", "cast-workflow.mjs");
  const miss = CW.slice(CW.indexOf("  if (!outcome.hits) {\n    lines.push(\n      line(\n        `<strong>Miss</strong> vs ${targetActor.name} — attack ${total} vs DB ${defendedDB}"));
  ok("D5 a spell attack's miss by the warded foe strikes the shield with the spell's damage",
    /const missBy = missMargin\(total, defendedDB\);[\s\S]{0,200}barrierInTheWay\(targetActor, actor, \{ missBy, hits: false \}\)[\s\S]{0,400}new Roll\(damageFormula\)[\s\S]{0,300}strikeBarrierWith\(targetActor, inTheWay, shieldRoll\.total/.test(miss.slice(0, 2000)));

  const AL = read("module", "alchemical-workflow.mjs");
  ok("D6 a bomb's near miss breaks on the shield and does not scatter",
    /shieldInTheWay = barrierInTheWay\(targetActor, actor, \{ missBy: -Number\(result\.av\), hits: false \}\);/.test(AL)
    && AL.indexOf("} else if (shieldInTheWay) {") > 0 && AL.indexOf("} else if (shieldInTheWay) {") < AL.indexOf("} else if (hasSplash(splash) && distance !== null) {"));

  const SW = read("module", "magic", "spiritual-weapon-workflow.mjs");
  ok("D7 Spiritual Weapon now reads the defender's DB rows (a ward's +4 among them)",
    /dbRows = defenceDCBonus\(targetActor, "defence", "", creatureTypesOf\(caster\.system \?\? \{\}\), caster\?\.uuid \?\? "",/.test(SW)
    && /const db = Number\.isFinite\(sheetDB\) \? sheetDB \+ Number\(dbRows\.total \?\? 0\) : NaN;/.test(SW));
  ok("D8 and its near miss strikes the shield", /barrierInTheWay\(targetActor, caster, \{ missBy, hits: false \}\)[\s\S]{0,500}strikeBarrierWith\(targetActor, inTheWay, shieldRoll\.total/.test(SW));
}

/* E — damage through the GM; the spell ends ------------------------------- */
{
  const R = await mod("combat", "target-relay.mjs");
  ok("E1 a named relay operation", R.RELAY_ACTIONS.BARRIER_DAMAGE === "target.barrierDamage");
  const seen = [];
  const target = { uuid: "Actor.caster" };
  const reply = await R.performRelay({ action: R.RELAY_ACTIONS.BARRIER_DAMAGE, uuid: target.uuid, payload: { effectId: "e1", damage: "12.7", hardness: 0 } }, {
    fromUuid: async () => target,
    damageBarrier: async (t, id, dmg) => { seen.push([t.uuid, id, dmg]); return { ok: true, result: { taken: 4 } }; }
  });
  equal("E2 the GM's client damages the named effect on the fetched creature, with the damage only", [seen, reply], [[["Actor.caster", "e1", 12]], { ok: true, result: { ok: true, result: { taken: 4 } } }]);
  const RW = read("module", "combat", "target-relay-workflow.mjs");
  ok("E3 the GM's client does it directly", /damageBarrier: async \(target, effectId, damage\) => \{\n\s+const \{ damageBarrierDirect \} = await import\("\.\.\/magic\/barrier-workflow\.mjs"\);/.test(RW));

  // A fake caster and its effect: Hits written, then destroyed and deleted.
  const fake = (hits) => {
    const state = { flag: { ...B.barrierAtCast(SPEC, { label: "Stone Shield", sourceUuids: [FOE], castId: null }), hits }, deleted: false };
    const effect = {
      id: "e1",
      getFlag: (s, k) => (k === "barrier" ? state.flag : null),
      setFlag: async (s, k, v) => { state.flag = v; },
      delete: async () => { state.deleted = true; }
    };
    const actor = { effects: { get: (id) => (id === "e1" && !state.deleted ? effect : null) } };
    return { actor, state };
  };
  {
    const { actor, state } = fake(15);
    const answer = await W.damageBarrierDirect(actor, "e1", 10);
    ok("E4 10 damage leaves 13 Hits on the effect", answer.ok && state.flag.hits === 13 && !state.deleted);
  }
  {
    const { actor, state } = fake(5);
    const answer = await W.damageBarrierDirect(actor, "e1", 13);
    ok("E5 at 0 Hits the shield's effect is gone", answer.ok && answer.result.destroyed && state.deleted);
  }
  {
    const BW = read("module", "magic", "barrier-workflow.mjs");
    ok("E6 destroying it ends the cast where it is registered", /if \(castId\) \{\n\s+const \{ endActiveSpell \} = await import\("\.\/active-spells\.mjs"\);\n\s+await endActiveSpell\(defender, castId, \{ dismissed: false \}\);/.test(BW));
    ok("E7 a client that does not own the caster asks the GM", /if \(!needsRelay\(defender\)\) return damageBarrierDirect\(defender, effectId, damage\);\n[\s\S]{0,120}return relayBarrierDamage\(defender, effectId, damage\);/.test(BW));
    ok("E8 the GM's button is the GM's alone", /if \(!game\.user\?\.isGM\) \{\n\s+ui\.notifications\?\.warn\?\.\("Only the GM can damage the shield from here\."\);/.test(BW)
      && /if \(!game\.user\?\.isGM\) \{ button\.style\.display = "none"; continue; \}/.test(BW));
  }
}

/* F — the earth-or-stone question ----------------------------------------- */
{
  const CW = read("module", "magic", "cast-workflow.mjs");
  const gate = CW.indexOf("if (!(await castQuestionGate(actor, spellData, spell.name, { answered: reaction?.castQuestionsAnswered === true }))) return null;");
  ok("F1 the cast asks, and returns on No", gate > 0);
  ok("F2 before the PP or the action is spent", gate > 0 && gate < CW.indexOf("const castReceipt = apPaid ? null : await spendActionCost(actor, totalCastAP, spell.name);"));
  const BW = read("module", "magic", "barrier-workflow.mjs");
  ok("F3 a No is refused out loud", /if \(!yes\) \{\n\s+ui\.notifications\?\.warn\?\.\(castQuestionRefusal\(spellName, question\)\);\n\s+return false;/.test(BW));
  ok("F4 a cast with no question, or one the offer already asked, is not stopped", /if \(!questions\.length \|\| answered\) return true;/.test(BW));
  const SR = read("module", "magic", "save-reaction-spells-workflow.mjs");
  ok("F5 the reaction cast carries the answer into the cast", /castSpell\(caster, spell, \{ reaction: \{ presetTargets: preset, \.\.\.\(castQuestionsAnswered \? \{ castQuestionsAnswered: true \} : \{\}\) \} \}\)/.test(SR));
}

/* G — the reaction offer ------------------------------------------------- */
{
  W.registerStoneShieldOffer();
  const { registeredDefenceOffers, defenceOffersFor } = await mod("combat", "defence-offer.mjs");
  const spec = registeredDefenceOffers().find((s) => s.key === "stone shield");
  ok("G1 registered beside Nimble Dodge, against any attack", Boolean(spec) && spec.against === "attack"
    && registeredDefenceOffers().some((s) => s.key === "nimble dodge"));
  ok("G2 the prompt states the earth-or-stone requirement", /adjacent to a large area of earth or stone/.test(spec?.summary ?? ""));
  const actor = { system: { resources: { pp: { value: 6 } } }, items: [{ type: "spell", name: "Stone Shield", system: { ppCost: 2 } }],
    effects: [{ id: "e1", disabled: false, flags: { "trg-prime": { barrier: { ...B.barrierAtCast(SPEC, { label: "Stone Shield", sourceUuids: [FOE] }) } } } }] };
  ok("G3 it finds the caster's spell", spec?.find(actor) === actor.items[0]);
  equal("G4 not offered against the foe a shield already stands against; offered against another",
    [spec?.requires(actor, actor.items[0], { kind: "weapon", attackerUuid: FOE }), spec?.requires(actor, actor.items[0], { kind: "weapon", attackerUuid: OTHER })],
    ["a stone shield already stands against this attacker", null]);
  const blockedActor = { ...actor, system: { resources: { pp: { value: 1 } } } };
  equal("G4b refused on too little PP", spec?.requires(blockedActor, actor.items[0], { kind: "weapon", attackerUuid: OTHER }), "needs 2 PP");
  const BWS = read("module", "magic", "barrier-workflow.mjs");
  ok("G4c and on the spell's own cast refusal (not prepared today), before PP or a shield already up",
    /blocked: spellCastBlocked\(item\) \|\| "",/.test(BWS)
    && /if \(blocked\) return String\(blocked\);\n\s+if \(alreadyAgainst\) return "a stone shield already stands against this attacker";\n\s+if \(Number\(pp\) < Number\(ppCost\)\) return `needs \$\{Number\(ppCost\)\} PP`;/.test(BWS));
  equal("G5 offered against a Strike, a spell, a bomb",
    ["weapon", "spell", "bomb"].map((kind) => defenceOffersFor({ candidates: [{ key: "stone shield", label: "Stone Shield", summary: "", against: "attack", has: true }], event: { kind }, inCombat: true, reactions: 1 }).offered.length),
    [1, 1, 1]);
  const DOW = read("module", "combat", "defence-offer-workflow.mjs");
  ok("G6 the attacker reaches the requirement, on both clients",
    /requiresReason = spec\.requires\(defender, item, event\)/.test(DOW)
    && /const event = \{ kind: String\(attack\.kind \?\? "weapon"\), attackerUuid: attacker\?\.uuid \?\? "" \};/.test(DOW)
    && /\{ kind: String\(data\.kind \?\? "weapon"\), attackerUuid: String\(data\.attackerUuid \?\? ""\) \}/.test(DOW));
  const BW = read("module", "magic", "barrier-workflow.mjs");
  ok("G7 taking it casts the spell at the attacker's token, the question answered",
    /castAsReaction\(caster, spell, \[token\.id\], \{ castQuestionsAnswered: true \}\)/.test(BW));
  const MAIN = read("scripts", "trg-prime.mjs");
  ok("G8 registered at ready, and the GM's button bound", /\n  registerStoneShieldOffer\(\);\n\s+registerBarrierHooks\(\);/.test(MAIN));
}

const EXPECTED = 64;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-stone-shield: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-stone-shield: OK — ${checks} checks`);
