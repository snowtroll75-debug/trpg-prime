/**
 * One way to deal typed damage to a creature.
 *
 * The damage pipeline — DR, immunity, weakness, resistance — existed and
 * was correct, but only one caller in the whole system ever reached it:
 * a weapon hit against a selected target token. Every other source of
 * damage went straight to the HP writer:
 *
 *   - all spell damage
 *   - Bleeding and Recurring Damage in the combat tracker's Phase 3,
 *     the latter carrying an explicit damage type that was never checked
 *   - the sheet's manual Apply Damage dialog
 *   - a critical's instant-kill result
 *   - the Mook Quick Crit's extra damage
 *   - fumble and spell-fumble self damage
 *
 * So a fire elemental took full damage from a fireball, and a creature
 * immune to fire still burned from Recurring fire damage. Same failure
 * shape as the temp-HP and nonlethal ones before it: a value computed
 * carefully in one place and never carried to the others.
 *
 * This is the single door. It resolves the target's defences, runs the
 * packet, applies what survives, and reports what happened in a form the
 * caller can put on a chat card.
 */
import { resolveDamagePacket, effectiveDR } from "./damage.mjs";
import { drAfterPenalty } from "./dr-penalty.mjs";
import { actorDefences } from "../creature-traits.mjs";
import { swarmReducedDR } from "../codex-trait-rules.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { applyDamageAndCheckDying } from "./dying-workflow.mjs";
import { healsFromDamage } from "../creature-ability-rules.mjs";

/**
 * THE RESISTANCE A CAST IGNORES (3.630.0). Blackfire Ivy: the spell it is
 * spent on "negates each target's fire resistance". Set by `castSpell` for
 * the length of the cast and cleared when it returns; also bounded by a
 * clock, so a cast that ends by an unusual route cannot leave it standing.
 * Every spell damage path resolves through this file, so one switch reaches
 * all of them without threading a flag through ten call sites.
 */
let resistanceBypass = { types: [], until: 0 };

export function setResistanceBypass(types = [], seconds = 120) {
  resistanceBypass = {
    types: (Array.isArray(types) ? types : []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean),
    until: Date.now() + Math.max(1, Number(seconds) || 120) * 1000
  };
}

export function clearResistanceBypass() {
  resistanceBypass = { types: [], until: 0 };
}

function activeResistanceBypass() {
  return resistanceBypass.types.length && Date.now() < resistanceBypass.until ? resistanceBypass.types : [];
}

/**
 * Resolve damage against a target's defences without applying it.
 *
 * Separated so a caller can show the working before writing anything,
 * and so the pure part stays testable without a live Actor.
 *
 * @param {object} targetSystem
 * @param {object} options
 * @param {number} options.amount
 * @param {string} options.type Damage type key.
 * @param {string[]} [options.traits] Traits carried by the source.
 * @param {number} [options.dr]
 * @param {boolean} [options.drBypassed]
 * @param {number} [options.naturalArmourDr]
 * @param {object|null} [options.creatureTypeSystem] The `system` data of
 *   the target's owned "creature-type" item, if the caller has a live
 *   Actor to pull one from — extracted by the caller (ownedCreatureTypeSystem
 *   in creature-type-rules.mjs) rather than taken as a live Actor here,
 *   keeping this function testable without one, per its own design above.
 */
export function resolveAgainstDefences(targetSystem, {
  amount,
  type,
  /*
   * THE TRAITS OF WHATEVER DEALT THE DAMAGE.
   *
   * `sourceTraits` IS THE NAME (3.548.2) — it is what `resolveDamagePacket`
   * below has always called this, and `traits` is kept only because a
   * dozen existing callers spell it that way.
   *
   * FOUND LIVE, 10 Sep 2026, in the first drive of 3.548.1. A Shadow
   * declares `weaknesses: divine` and took 10 from a divinity spell
   * instead of 15. `spellDamageSource` returns `sourceTraits`, matching
   * the packet; this function destructured `traits`; so spreading the
   * descriptor here set a key nothing read and the spell's traits — its
   * TRADITION and its SCHOOL with them — were dropped on the floor
   * between the two layers.
   *
   * That is precisely the defect this release was written to remove, one
   * layer above where the checks were looking: SC3 passed because it
   * called `resolveDamagePacket` directly, where the name matches. A
   * value produced under one name and consumed under another is a wire
   * that was never connected. See S5 in verify-defence-vocabulary.
   */
  traits = [],
  sourceTraits = null,
  dr = null,
  drBypassed = false,
  naturalArmourDr = null,
  applyDR = true,
  creatureTypeSystem = null,
  // SWARM (Creature Codex): "treats the target's DR as half its normal
  // value" — a property of the ATTACKER, which is why it arrives as a flag
  // rather than being read off the target like everything else here.
  //
  // WIRED AT 3.366.0, AND IT HAD NEVER APPLIED. `swarmReducedDR` was
  // written, tested and called by nothing, so a Swarm's attacks met full
  // DR — the one defence the trait exists to get around. Found by
  // tools/verify-rules-have-callers.mjs.
  attackerIsSwarm = false,
  // WHAT THE DAMAGE CAME FROM (3.547.0). Defaults keep every existing
  // caller working unchanged: an unspecified source is non-magical and
  // carries no special material, which is what an ordinary hit is.
  magical = false,
  material = "",
  // THE SHAPE OF THE EFFECT (3.548.0) — area vs targeted, per Graham's
  // rulings of 10 Sep 2026. Same defaulting as above: an unspecified
  // source is neither, so a defence keyed on one does not fire.
  area = false,
  targeted = false,
  /*
   * DAMAGE THAT GOES THROUGH AN IMMUNITY (3.608.0). Sonic Rupture: "5d8
   * sonic damage instead due to the vibrations (even those usually immune
   * to such damage)". Names ONE type; that type alone is struck from the
   * immunity list and from the immune traits, and every other immunity the
   * creature has still stands.
   */
  ignoreImmunityTo = "",
  // GHOST TOUCH against the incorporeal (3.618.0) — see damage.mjs.
  incorporealTouch = false,
  // THE TARGET'S OWN ABILITIES (3.631.0): Fire Healing reads them.
  targetItems = []
} = {}) {
  // FIRE HEALING (Creature Codex; 3.631.0): "fire damage heals the creature
  // of an amount of HP damage equal to half that taken … based upon the
  // fire damage a creature would have taken before immunity and
  // resistance but not DR" — so the question is asked HERE, before the
  // defences zero it, and the packet says heal rather than take. The
  // caller that writes HP heals instead (applyHealsInstead).
  const healing = healsFromDamage(targetItems, type);
  if (healing) {
    const raw = Math.max(0, Math.floor(Number(amount) || 0));
    const heal = Math.floor(raw * healing.fraction);
    return { taken: 0, immune: false, healsInstead: heal, healsFromType: type, drApplied: 0, steps: [`${raw} ${type} heals it instead (${heal})`] };
  }
  const defences = actorDefences(targetSystem, creatureTypeSystem);
  const ignored = String(ignoreImmunityTo ?? "").trim().toLowerCase();
  // A RESISTANCE THIS CAST IGNORES (3.630.0) — Blackfire Ivy's "negates each
  // target's fire resistance", for the spell it is spent on. See
  // `setResistanceBypass`.
  const bypassed = activeResistanceBypass();
  const withoutBypassed = (list) => {
    if (!bypassed.length) return list;
    const kept = Array.from(list ?? []).filter((k) => !bypassed.includes(String(k).trim().toLowerCase()));
    return list instanceof Set ? new Set(kept) : kept;
  };
  const withoutIgnored = (list) => {
    if (!ignored) return list;
    const kept = Array.from(list ?? []).filter((k) => String(k).trim().toLowerCase() !== ignored);
    return list instanceof Set ? new Set(kept) : kept;
  };

  // DR by damage type (Chapter 7, confirmed by Graham 2 Aug 2026): every
  // damage path faces the target's DR — resolveDamagePacket then applies
  // the per-type rule (physical: full; acid/cold/electricity/fire/sonic:
  // half; essence/force/aligned/mental/poison: none). Callers may still
  // supply explicit values (the weapon path pre-applies Armour Rending and
  // Penetrating); when they don't, DR is derived from the target here.
  // applyDR: false is for recurring damage and Bleeding — DR never reduces
  // those ("if you catch fire, what good is armour").
  // BRACERS OF ARMOUR (3.617.0, Graham's R17 of block 37): their Base DR
  // is armour — the higher of it and the worn armour's DR, never both.
  // Compared as the DR a blow meets (3.617.1): worn armour's after BDB,
  // the bracers' after BSB and capped at their pool (Graham's Q1, Q2).
  const wornDr = effectiveDR(
    Number(targetSystem?.combat?.armour?.dr ?? 0),
    Number(targetSystem?.combat?.bdb?.total ?? 0)
  );
  const bracersDr = Number(targetSystem?.combat?.bracers?.effective ?? 0);
  const derivedDr = !applyDR ? 0
    : dr !== null && dr !== undefined ? dr
    : Math.max(wornDr, bracersDr);
  // Whether the bracers were the armour this damage met — so the caller
  // that APPLIES it can drain their pool (bracers-workflow.mjs).
  const bracersSource = applyDR && (dr === null || dr === undefined) && !drBypassed
    && Boolean(targetSystem?.combat?.bracers?.itemId || targetSystem?.combat?.bracers?.effectId) && bracersDr > Math.max(0, wornDr);
  const derivedNatural = !applyDR ? 0
    : naturalArmourDr !== null && naturalArmourDr !== undefined ? naturalArmourDr
    : Number(targetSystem?.combat?.naturalArmour?.dr ?? 0) +
      Math.max(0, Number(targetSystem?.combat?.dr?.total ?? 0));

  // BOTH POOLS, because the Codex says "the target's DR" and this system
  // keeps that in two places — equipped armour and natural armour. Halving
  // only one of them would spare a creature whose protection happens to be
  // its hide, which is most of what a Swarm attacks.
  /*
   * A DR POOL BELOW ZERO TAKES DR AWAY (3.611.0, block 34). Devastating
   * Might: "All creatures within the spell's radius, including yourself,
   * have their DR reduced by 3." It is a `dr` bonus row of −3, and the
   * line above clamps the pool at zero — right for adding it to natural
   * armour, wrong for a penalty, which then reduced nothing at all. So a
   * negative pool is spent here instead: natural armour's DR first, then
   * the armour's, never below zero. Only when the DR is derived here; a
   * caller that hands in its own `dr` has already decided.
   */
  const penalised = applyDR && (dr === null || dr === undefined)
    ? drAfterPenalty(derivedDr, derivedNatural, targetSystem?.combat?.dr?.total)
    : { armourDr: derivedDr, naturalDr: derivedNatural };
  const penalisedDr = penalised.armourDr;
  const penalisedNatural = penalised.naturalDr;
  const swarmDr = attackerIsSwarm ? swarmReducedDR(penalisedDr) : penalisedDr;
  const swarmNatural = attackerIsSwarm ? swarmReducedDR(penalisedNatural) : penalisedNatural;

  const packet = resolveDamagePacket({
    amount,
    type,
    dr: swarmDr,
    drBypassed,
    naturalArmourDr: swarmNatural,
    resistances: withoutBypassed(defences.resistances),
    immunities: withoutIgnored(defences.immunities),
    weaknesses: defences.weaknesses,
    immuneTraits: withoutIgnored(defences.immuneTraits),
    sourceTraits: sourceTraits ?? traits,
    // CATEGORIES AND MATERIALS REACH EVERY DAMAGE PATH (3.547.0), not
    // only the weapon one — a spell counts as a magical source against
    // `mundane` resistance, and this is the route spells, Bleeding,
    // Recurring Damage and the manual Apply Damage dialog all take.
    resistanceCategories: defences.resistanceCategories,
    weaknessMaterials: defences.weaknessMaterials,
    /*
     * THE BYPASS REACHED NOBODY UNTIL 3.548.0.
     *
     * `resistanceBypassMaterials` was added at 3.547.1 with a rule in
     * `damage.mjs` to consume it and a computation in
     * `creature-traits.mjs` to produce it — and neither damage path
     * passed it between them, so "mundane (silver)" halved a silver
     * weapon's damage exactly as it had before. A rule with both ends
     * built and no middle, which is the same defect the material
     * weakness had one release earlier, shipped one release later.
     */
    resistanceBypassMaterials: defences.resistanceBypassMaterials,
    resistanceSources: defences.resistanceSources,
    incorporealTouch,
    weaknessSources: defences.weaknessSources,
    // THE TRAIT-KEYED COPY TOO (3.630.1): "fire" in a resistance field is
    // read both as a type and as a trait, so a fire spell met it twice and
    // the bypass that lifted the first left the second halving (F6).
    resistanceTraits: withoutBypassed(defences.resistanceTraits),
    weaknessTraits: defences.weaknessTraits,
    resistanceExcept: defences.resistanceExcept,
    magical,
    material,
    area,
    targeted
  });
  packet.bracersSource = bracersSource;
  return packet;
}

/**
 * Deal typed damage to an actor, through the full pipeline.
 *
 * @param {Actor} targetActor
 * @param {object} options As resolveAgainstDefences, plus:
 * @param {boolean} [options.isCritical]
 * @param {boolean} [options.ignoreDefences] Deal the amount as written.
 *   For damage that is not of a type a creature can resist — the raw
 *   number a GM types into Apply Damage with no type chosen.
 * @returns {Promise<{packet: object, applied: number, result: object|null}>}
 */
export async function applyTypedDamage(targetActor, {
  amount,
  type,
  traits = [],
  dr = 0,
  drBypassed = false,
  naturalArmourDr = 0,
  isCritical = false,
  ignoreDefences = false,
  // Who dealt it, for a death guard's opposed save (3.627.0). Optional.
  sourceLevel = null,
  sourceName = "",
  // A RESISTANCE FOR THIS BLOW ONLY (3.632.0): Scaly Resilience's "grants
  // you Resistance against the breath weapon" — the type joins the target's
  // resistances for this one resolution, so it meets DR and immunity in
  // the order every other resistance does.
  extraResistance = "",
  // THE SHAPE AND THE SOURCE (3.632.0): an area effect meets a Swarm's
  // Weakness to area effects, and a Swarm's own attack halves the target's
  // DR — the declared-area rail (peril-workflow) says which it is.
  area = false,
  attackerIsSwarm = false
} = {}) {
  if (!targetActor) return { packet: null, applied: 0, result: null };

  if (ignoreDefences || !type) {
    const raw = Math.max(0, Math.floor(Number(amount) || 0));
    const result = raw > 0
      ? await applyDamageAndCheckDying(targetActor, raw, { isCritical })
      : null;
    return {
      packet: { taken: raw, immune: false, steps: [`${raw} untyped`] },
      applied: raw,
      result
    };
  }

  const extra = String(extraResistance ?? "").trim();
  const defenderSystem = extra
    ? { ...targetActor.system, combat: { ...(targetActor.system?.combat ?? {}),
      resistances: [targetActor.system?.combat?.resistances, extra].filter((v) => String(v ?? "").trim()).join(", ") } }
    : targetActor.system;
  const packet = resolveAgainstDefences(defenderSystem, {
    amount, type, traits, dr, drBypassed, naturalArmourDr, area: Boolean(area), attackerIsSwarm: Boolean(attackerIsSwarm),
    creatureTypeSystem: ownedCreatureTypeSystem(targetActor),
    targetItems: Array.from(targetActor.items ?? [])
  });
  if (packet.healsInstead !== undefined) {
    packet.steps.push(await applyHealsInstead(targetActor, packet));
    return { packet, applied: 0, result: null };
  }
  const { drainBracers } = await import("../bracers-workflow.mjs");
  packet.bracersLine = await drainBracers(targetActor, packet, packet.bracersSource);

  // Nothing to write when the target is immune. Deliberately not a call
  // with 0: applyDamageAndCheckDying runs the Massive Damage and Dying
  // machinery, and none of that should fire for damage that never landed.
  if (packet.taken <= 0) return { packet, applied: 0, result: null };

  const result = await applyDamageAndCheckDying(targetActor, packet.taken, {
    isCritical,
    nonlethal: Boolean(packet.nonlethal),
    damageTypes: [String(type ?? "").trim().toLowerCase()].filter(Boolean),
    sourceLevel,
    sourceName
  });

  return { packet, applied: packet.taken, result };
}

/**
 * A one-line account of a resolved packet, for chat cards.
 *
 * @param {object} packet
 * @param {string} targetName
 */
export function describeDamage(packet, targetName) {
  if (!packet) return "";
  if (packet.immune) {
    return packet.immuneTrait
      ? `${targetName} is immune to the ${packet.immuneTrait} trait — no damage.`
      : `${targetName} is immune — no damage.`;
  }
  return `${targetName}: ${packet.steps.join(" → ")} = ${packet.taken} taken.`;
}

/**
 * A packet that heals instead of harming (Fire Healing): the heal written,
 * or at full HP the page's alternative — Bleeding -2, else a condition of
 * its choice -1 — and the line that says which.
 */
export async function applyHealsInstead(targetActor, packet) {
  const heal = Math.max(0, Number(packet?.healsInstead) || 0);
  const hp = targetActor?.system?.resources?.hp ?? {};
  if (Number(hp.value) >= Number(hp.max) && Number(hp.max) > 0) {
    const bleeding = Number(targetActor.getConditionValue?.("bleeding") ?? 0);
    if (bleeding > 0) {
      await targetActor.toggleStatusEffect("bleeding", { active: bleeding - 2 > 0, value: Math.max(0, bleeding - 2) });
      return `at full HP: Bleeding ${bleeding} → ${Math.max(0, bleeding - 2)}`;
    }
    return "at full HP: it may reduce one other condition by 1 instead";
  }
  if (heal <= 0) return "nothing to heal";
  const { healActor } = await import("../magic/spell-effects.mjs");
  const healed = await healActor(targetActor, heal, { magical: false });
  return `healed ${Number(healed) || 0} HP`;
}
