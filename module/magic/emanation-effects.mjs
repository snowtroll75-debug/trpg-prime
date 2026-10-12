/**
 * Placing and lifting one emanation's bonus as creatures cross its edge.
 *
 * NEW at 3.426.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY NOT `applySpellEffects`.
 *
 * That is the whole cast pipeline: it rolls saves, deals damage, posts
 * cards, applies conditions and grants spells. Running it again every
 * time somebody steps over a line would re-roll saves nobody cast for
 * and post a card per footstep.
 *
 * What crosses the boundary is only ever a `bonus` — see
 * magic/emanation.mjs for why a condition and a note do not — so this
 * file does exactly that one thing, in the shape `applyBonusEffect`
 * already established: an ActiveEffect whose change writes into the
 * bonus pool at `<path>.<bonusType>`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * STAMPED WITH THE CAST ID, which is what makes removal exact.
 *
 * `castId` is already the flag the active-spell registry uses to tear a
 * spell's effects down when it ends, so an emanation's effects are
 * removable by the machinery that already exists — and two castings of
 * Bless in one room remain two separate memberships rather than one
 * shared blur.
 *
 * NO DURATION IS SET ON THESE. A spell's own effects expire on the
 * spell's clock; an emanation's are lifted by walking out, and the whole
 * emanation is torn down by `endActiveSpell` when the spell finishes.
 * Giving them a duration as well would mean two things could remove
 * them, and the one that fired first would win.
 */

import { DEFENCE_FIELDS, bonusTargetFor } from "./spell-effects.mjs";
import { OPPOSED_AURA_FLAG, opposedAuraRecordsFor } from "./opposed-aura.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";
import { effectsForDegree, liveEmanationEffects } from "./emanation.mjs";
import { effectiveSaveDegree } from "./spell-degrees.mjs";
import { HELD_BONUS_FLAG, normaliseHeldBonus } from "./held-bonus.mjs";
import { DAMAGE_HEAL_FLAG, normaliseDamageHeal } from "./damage-heal.mjs";
import { OBSCURING_ZONE_FLAG, zoneEffectParts } from "./obscuring-zone.mjs";
import {
  ANTIMAGIC_FLAG, antimagicLiftedLine, antimagicLine, normaliseAntimagic,
  suppressedEffectIds, suppressibleEffectIds
} from "./antimagic.mjs";

const SYSTEM_ID = "trg-prime";
const DEFAULT_SPELL_IMG = "icons/magic/symbols/runes-star-blue.webp";

/**
 * The ActiveEffect data for one creature standing in one emanation.
 *
 * A REFUSED SLOT PLACES NOTHING rather than an effect with an empty
 * changes array — the lesson `applyBonusEffect` records at 3.411.1: an
 * effect that exists and does nothing looks applied on the Effects tab
 * and is not.
 */
export function emanationEffectData(emanation, castId, casterName = "", degree = null) {
  const changes = [];
  // WHAT THIS CREATURE ROLLED DECIDES WHAT IT CARRIES (3.428.0). Bane
  // prints -1 on a Failure and -2 on a Fumble; Bless prints one row for
  // everybody. `effectsForDegree` serves both — an ungated list ignores
  // the degree entirely.
  const rows = effectsForDegree(
    liveEmanationEffects({ effects: emanation?.effects }), degree, effectiveSaveDegree);
  // A CONDITIONAL BONUS IS NOT A CHANGE (3.446.0). Radiant Aegis and
  // Wellspring Of Valour grant bonuses that apply only against creatures
  // with an aura opposing the CASTER's, so they cannot be written into
  // the sheet total the way Bless's is — a `changes` row would raise the
  // number against everybody. They ride the two channels that already
  // answer "against THIS opponent": the defence-DC entry the defender
  // carries, and the attack record the attacker carries.
  //
  // `opposedTo` IS RESOLVED AT THE CAST and travels on the emanation, so
  // the caster's own aura is what a later attack is measured against.
  const opposedTo = Array.isArray(emanation?.opposedTo) ? emanation.opposedTo : [];
  const defenceDC = [];
  const opposedAttack = [];
  for (const effect of rows) {
    const value = Number(effect.value) || 0;
    // A ZONE IS NOT A NUMBER (3.608.0) — it is read below, whole.
    if (effect.kind === "zone") continue;
    // A TURN SAVE IS NOT A NUMBER EITHER (3.609.0): the turn clock reads it.
    if (effect.kind === "turnSave") continue;
    // NOR A HELD BONUS (3.612.0, R8): it rides the membership effect's flags.
    if (effect.kind === "heldBonus") continue;
    // NOR A HEAL THAT ANSWERS DAMAGE (3.614.0, R9): it rides the flags too.
    if (effect.kind === "damageHeal") continue;
    // A RESISTANCE IS A LIST ENTRY, NOT A NUMBER (3.613.0, R3 — Protector's
    // Sphere). Written the way the cast's own defence row writes it, so the
    // creatures caught at the cast and those who walk in later carry the
    // same thing.
    if (effect.kind === "defence") {
      const field = DEFENCE_FIELDS[String(effect.field ?? "")];
      const values = (Array.isArray(effect.values) ? effect.values : [effect.value])
        .map((v) => String(v ?? "").trim()).filter(Boolean);
      if (field) for (const v of values) changes.push({ key: field.path, type: CHANGE_TYPE.ADD, value: `, ${v}` });
      continue;
    }
    if (effect.opposedAura) {
      // A BALANCE OR UNALIGNED CASTER STILL PLACES THE EFFECT, carrying an
      // empty `opposedTo` that can never match. Graham confirmed on 31
      // August 2026 that gaining nothing is deliberate — and an effect
      // that is visibly present and never fires is more honest than one
      // silently withheld, because the player can see what they bought.
      // ROUTED BY THE SHARED RULE (3.446.2), because the cast-time
      // applier has to reach the same answer — it did not, and shipped
      // Radiant Aegis as an unconditional +1 to Defence.
      const records = opposedAuraRecordsFor({ ...effect, value }, opposedTo, emanation.name);
      defenceDC.push(...records.defenceDC);
      opposedAttack.push(...records.attack);
      continue;
    }
    const placed = bonusTargetFor(effect.slot);
    if (!placed) continue;
    changes.push({
      key: `${placed}.${effect.bonusType || "status"}`,
      type: CHANGE_TYPE.CUSTOM,
      value: String(value)
    });
  }
  /*
   * AN ANTIMAGIC FIELD PLACES A MARKER AND NO CHANGES (3.586.0).
   *
   * It is the third kind of aura that is not a number on a sheet, after
   * the two conditional channels above, and for a related reason: what
   * it does to a creature is done to that creature's OTHER effects, not
   * to its totals. The marker is what `applyEmanationEffectsTo` hangs
   * the suppression off and what `removeEmanationEffectsFrom` reads to
   * put it back. See magic/antimagic.mjs.
   *
   * READ FROM THE ROWS, not from `liveEmanationEffects` above, because
   * that list is filtered to the kinds that produce bonuses and an
   * antimagic row produces none.
   */
  const antimagic = (Array.isArray(emanation?.effects) ? emanation.effects : [])
    .map(normaliseAntimagic).find(Boolean) ?? null;
  // NOTHING AT ALL IS STILL NOTHING, but a conditional-only aura is not
  // nothing — it places an effect with no `changes` and two flags, which
  // is the one case where an empty changes array is correct.
  /*
   * AN OBSCURING ZONE PLACES A CONDITION (3.608.0, R7) — Solid Fog's
   * "all creatures within the mist become concealed". As a STATUS on the
   * membership effect, so the condition comes and goes with the effect the
   * sweep already adds on entry and lifts on exit; and a flag, read by the
   * avoidance check for the other half ("creatures outside the mist become
   * concealed to creatures within it"). See magic/obscuring-zone.mjs.
   */
  const zone = zoneEffectParts(rows, castId);
  // A ZONE AND NOTHING ELSE is Solid Fog: no number, no marker, only the
  // condition and the flag. Its own return, ahead of the line below, so
  // that line still says exactly what it said for every other aura.
  if (zone && !changes.length && !defenceDC.length && !opposedAttack.length && !antimagic) {
    return {
      name: casterName ? `${emanation.name} (${casterName})` : emanation.name,
      img: emanation.img || DEFAULT_SPELL_IMG,
      changes: [],
      statuses: zone.statuses,
      flags: { [SYSTEM_ID]: { spellBuff: true, castId, emanation: true, [OBSCURING_ZONE_FLAG]: zone.flag } }
    };
  }
  // A HELD BONUS THE MEMBERSHIP CARRIES (3.612.0, R8) — Inspire Heroics. The
  // card's held-bonus button reads it off whichever effect holds the flag.
  const heldRow = rows.find((e) => e?.kind === "heldBonus") ?? null;
  const held = heldRow ? normaliseHeldBonus(heldRow) : null;
  // WELLSPRING OF VALOUR'S HEAL (3.614.0, R9) rides the membership as a flag;
  // `applyDamageAndCheckDying` reads it. See magic/damage-heal.mjs.
  const healRow = rows.find((e) => e?.kind === "damageHeal") ?? null;
  const damageHeal = healRow ? normaliseDamageHeal(healRow, healRow.extraDice) : null;
  if (!changes.length && !defenceDC.length && !opposedAttack.length && !antimagic && !held && !damageHeal) return null;
  return {
    name: casterName ? `${emanation.name} (${casterName})` : emanation.name,
    img: emanation.img || DEFAULT_SPELL_IMG,
    changes,
    ...(zone ? { statuses: zone.statuses } : {}),
    flags: {
      [SYSTEM_ID]: {
        spellBuff: true,
        castId,
        // EMPTY UNTIL SOMEBODY IS INSIDE IT. The ids go in when the
        // effect is created on a creature, because they are a fact about
        // THAT creature — `emanationEffectData` is shared by everyone in
        // the circle and knows nothing about any of them.
        ...(antimagic ? { [ANTIMAGIC_FLAG]: { label: antimagic.label, suppressed: [] } } : {}),
        ...(zone ? { [OBSCURING_ZONE_FLAG]: zone.flag } : {}),
        // MARKED AS AN EMANATION'S, so a sweep can tell the effects that
        // are lifted by walking out from the ones a spell placed on you
        // for its duration wherever you go.
        emanation: true,
        // The two conditional channels, read by combat/defence-dc.mjs and
        // combat/attack-workflow.mjs respectively. Omitted entirely when
        // empty rather than written as [], so an ordinary Bless effect
        // carries no vestigial keys.
        ...(defenceDC.length ? { defenceDC } : {}),
        ...(opposedAttack.length ? { [OPPOSED_AURA_FLAG]: opposedAttack } : {}),
        ...(held ? { [HELD_BONUS_FLAG]: held } : {}),
        ...(damageHeal ? { [DAMAGE_HEAL_FLAG]: damageHeal } : {})
      }
    }
  };
}

/** Give one creature this emanation's bonus. */
export async function applyEmanationEffectsTo(actor, castId, emanation, caster = null, degree = null) {
  if (!actor) return { effect: null, line: "" };
  const data = emanationEffectData(emanation, castId, caster?.name ?? "", degree);
  if (!data) return { effect: null, line: "" };
  /*
   * A ZONE'S SPEED PENALTY LANDS ON THE SPEEDS THIS CREATURE HAS (3.609.0,
   * Tangling Creepers) — resolved here because the shared data cannot know
   * whose legs it is slowing, the reason `allSpeeds` is resolved against
   * the target everywhere else. A creature immune to environmental Speed
   * penalties (Untamed Journey) carries the membership without the penalty.
   */
  {
    const { OBSCURING_ZONE_FLAG: ZF, ENVIRONMENT_SPEED_IMMUNE_FLAG } = await import("./obscuring-zone.mjs");
    const penalty = Number(data.flags?.[SYSTEM_ID]?.[ZF]?.speedPenalty ?? 0);
    const immune = Array.from(actor.effects ?? []).some((e) => !e.disabled && e.getFlag?.(SYSTEM_ID, ENVIRONMENT_SPEED_IMMUNE_FLAG));
    if (penalty < 0 && !immune) {
      const { speedsPresentOn, bonusTargetFor } = await import("./spell-effects.mjs");
      const { CHANGE_TYPE: CT } = await import("../effect-change-types.mjs");
      data.changes = [...(data.changes ?? []), ...speedsPresentOn(actor.system).map((key) => ({
        key: `${bonusTargetFor(key)}.circumstance`, type: CT.CUSTOM, value: String(penalty)
      }))];
    }
  }
  // ALREADY HOLDING IT IS NOT AN ERROR, it is the ordinary case of a
  // sweep running twice, and creating a second copy would double the
  // bonus every time anybody moved.
  const held = Array.from(actor.effects ?? []).some(
    (e) => e.getFlag?.(SYSTEM_ID, "castId") === castId);
  if (held) return { effect: null, line: "" };
  const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [data]);

  /*
   * THE FIELD CLOSES OVER THEM (3.586.0).
   *
   * AFTER the marker exists, and that order is load-bearing: the marker
   * is itself a `spellBuff`, so computing the list first and creating it
   * second would be computing the list against a world the marker has
   * not entered yet — harmless today, and exactly the kind of ordering a
   * later change breaks silently. `suppressibleEffectIds` excludes it by
   * castId, so asking afterwards gets the same answer for a reason that
   * is written down rather than for a reason of sequence.
   *
   * WRITTEN ONTO THE MARKER, because removal must restore what was
   * suppressed rather than what is suppressible — see antimagic.mjs.
   */
  if (created && data.flags?.[SYSTEM_ID]?.[ANTIMAGIC_FLAG]) {
    const ids = suppressibleEffectIds(
      Array.from(actor.effects ?? []).map((e) => ({
        id: e.id, disabled: e.disabled, flags: { [SYSTEM_ID]: e.flags?.[SYSTEM_ID] ?? {} }
      })),
      castId, SYSTEM_ID);
    if (ids.length) {
      await actor.updateEmbeddedDocuments("ActiveEffect",
        ids.map((id) => ({ _id: id, disabled: true })));
    }
    await created.setFlag(SYSTEM_ID, ANTIMAGIC_FLAG, {
      label: data.flags[SYSTEM_ID][ANTIMAGIC_FLAG].label,
      suppressed: ids
    });
    return { effect: created, line: antimagicLine(actor.name, ids.length) };
  }
  // ONE SHAPE, ALWAYS. This returned the bare document or null, and
  // nothing has ever read it — which is why the antimagic branch could
  // have returned whatever it liked and nobody would have noticed for a
  // release. A caller that has to know which of two shapes it is holding
  // is a caller that will one day get it wrong.
  return { effect: created ?? null, line: "" };
}

/**
 * Take ownership of the effects the CAST placed.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS FIXES, found by driving 3.426.0.
 *
 * `applySpellEffects` places a live emanation's bonus at the moment of
 * the cast, stamped with the castId but knowing nothing about
 * emanations. The sweep then saw those creatures as holders (it asks
 * only about the castId) while removal ignored them (it also requires
 * the emanation marker) — so the very creatures caught at the cast were
 * the ones the bonus could never be lifted from. Walking out did
 * nothing, which is exactly the defect this release exists to fix,
 * surviving in the one case that matters most.
 *
 * ADOPTED RATHER THAN DELETED AND REPLACED. The effect is already
 * correct; only its ownership was unrecorded. Re-creating it would flash
 * the bonus off and on for every viewer and lose anything else the cast
 * had written onto it.
 */
export async function adoptCastEffects(castId) {
  let adopted = 0;
  for (const token of canvas?.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor) continue;
    const mine = Array.from(actor.effects ?? []).filter(
      (e) => e.getFlag?.(SYSTEM_ID, "castId") === castId
        && !e.getFlag?.(SYSTEM_ID, "emanation"));
    if (!mine.length) continue;
    await actor.updateEmbeddedDocuments("ActiveEffect", mine.map((e) => ({
      _id: e.id, [`flags.${SYSTEM_ID}.emanation`]: true
    })));
    adopted += mine.length;
  }
  return adopted;
}

/** Lift this emanation's bonus from one creature. */
export async function removeEmanationEffectsFrom(actor, castId) {
  if (!actor) return 0;
  const mine = Array.from(actor.effects ?? [])
    .filter((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId
      && e.getFlag?.(SYSTEM_ID, "emanation"));
  const ids = mine.map((e) => e.id);
  if (!ids.length) return 0;

  /*
   * "ALL MAGIC CONTINUES TO FUNCTION AS BEFORE" (3.586.0).
   *
   * BEFORE THE MARKER IS DELETED, because the marker is where the list
   * of what to restore lives. Deleting first and restoring second would
   * be restoring from a flag that no longer exists — and would do it
   * silently, leaving a character permanently carrying a sheet full of
   * switched-off spells with nothing to say why.
   *
   * RESTORED FROM THE RECORD, not recomputed. Everything this field
   * switched off is `disabled` right now, so asking "what is
   * suppressible" would answer nothing at all. See antimagic.mjs.
   */
  let lifted = 0;
  for (const marker of mine) {
    const suppressed = suppressedEffectIds(
      { flags: { [SYSTEM_ID]: marker.flags?.[SYSTEM_ID] ?? {} } }, SYSTEM_ID);
    if (!suppressed.length) continue;
    // ONLY THE ONES STILL THERE. An effect that expired while its owner
    // stood in the field is gone, and updating a deleted id throws.
    const present = suppressed.filter((id) => actor.effects?.get?.(id));
    if (present.length) {
      await actor.updateEmbeddedDocuments("ActiveEffect",
        present.map((id) => ({ _id: id, disabled: false })));
    }
    lifted += present.length;
  }

  await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  if (lifted) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime"><p>${antimagicLiftedLine(actor.name, lifted)}</p></div>`
    });
  }
  return ids.length;
}
