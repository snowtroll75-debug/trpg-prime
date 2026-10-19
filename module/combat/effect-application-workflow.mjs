/**
 * Applies condition tags extracted from critical/fumble/spell-fumble/
 * resonance table text (see ../effect-parser.mjs) to an actor, with
 * optional round-based auto-expiry for the persistence codes that
 * genuinely support it (see computePersistenceRounds in ./attack.mjs).
 *
 * Deliberately transparent rather than silent: every application
 * reports what it did (and, on request, is easy for a GM to reverse
 * by hand — the same toggleStatusEffect a person would use) rather
 * than mutating the target with no visible trail.
 */
import { combinedConditionValue } from "../conditions/condition-rules.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
// Only the effect's *name*, from the pure rage module — deliberately not
// rage-workflow.mjs, which imports this file and would make a cycle.
import { RAGE_EFFECT_NAME } from "./rage.mjs";
import { expiryToWrite } from "./condition-timing.mjs";
import { frozenByStasis, stasisEffectOf } from "../magic/stasis.mjs";
import {
  RESPITE_FLAG, normaliseDelayedRespite, respiteReleasedLine
} from "../magic/delayed-respite.mjs";

const SYSTEM_ID = "trg-prime";
const EXPIRY_FLAG = "conditionExpiresRound";
// Marks an ActiveEffect as a spell-applied ongoing effect the system manages:
// it shows on the actor's Effects table and is removed automatically when the
// spell ends (its round-based expiry in combat, or its world-time end otherwise).
const SPELL_EFFECT_FLAG = "spellEffect";
const SPELL_END_FLAG = "spellEffectEnd";
// Links an ActiveEffect to the specific cast that created it, so ending an
// active spell (sustained lapse, Dismiss) can remove exactly its own effects.
const CAST_ID_FLAG = "castId";
// A condition whose life is another condition's life: "Bleeding 3 & Injured 1
// until the bleeding stops" (24 critical rows). Holds the condition key to
// wait for; combat/linked-conditions-workflow.mjs sweeps on its ending.
export const ENDS_WITH_FLAG = "conditionEndsWith";
// A world-time deadline for a condition that is not a spell effect:
// "Unconscious for 1d4 hours". Seconds, on the same clock expireSpellEffects
// reads, and swept beside it.
export const END_TIME_FLAG = "conditionExpiresTime";
// Conditions queued to arrive when THIS effect ends: "Controlled… and then
// Injured 1 when the control ends" (3 rows).
export const FOLLOW_ON_FLAG = "conditionFollowOn";

// THE TRAITS OF WHATEVER INFLICTED A CONDITION (3.613.0, R14 of block 35).
// Soothing Words counteracts "one emotion effect"; Soothing Ballad "fear
// effects". A frightened condition knows nothing of the spell behind it
// unless the applier says so here.
export const SOURCE_TRAITS_FLAG = "sourceTraits";

// WHOSE CLOCK IS IT (3.433.0). See combat/condition-timing.mjs: a new
// application may set the timing it created, EXTEND a timing already
// there, and must never impose one on a condition another rule placed
// untimed. Graham, 29 August 2026: "flat-footed vanished from a PC after
// they were hit (before they acted)."

/**
 * Assemble the timing-flag / duration update to stamp onto a freshly applied
 * effect so it counts down on the sheet and gets swept when the spell ends.
 */
function buildTimingUpdates({
  expiresRound = null, duration = null, spellEffect = false, spellEffectEnd = null, castId = null,
  endsWith = null, expiresTime = null, followOn = null
} = {}) {
  const updates = {};
  if (expiresRound !== null) updates[`flags.${SYSTEM_ID}.${EXPIRY_FLAG}`] = expiresRound;
  // THE OTHER TWO CLOCKS AND THE QUEUE (3.581.0; the pages 211-220
  // audit's D1, D2 and D10). See combat/linked-conditions-workflow.mjs
  // for what reads them: a condition can now end when ANOTHER condition
  // ends ("Injured 1 until the bleeding stops", 24 rows), at a world
  // time rather than a round ("Unconscious for 1d4 hours"), and can
  // leave a successor behind it ("and then Injured 1 when the control
  // ends").
  if (endsWith) updates[`flags.${SYSTEM_ID}.${ENDS_WITH_FLAG}`] = endsWith;
  if (expiresTime !== null) updates[`flags.${SYSTEM_ID}.${END_TIME_FLAG}`] = expiresTime;
  if (followOn) updates[`flags.${SYSTEM_ID}.${FOLLOW_ON_FLAG}`] = followOn;
  if (spellEffect) updates[`flags.${SYSTEM_ID}.${SPELL_EFFECT_FLAG}`] = true;
  if (spellEffectEnd !== null) updates[`flags.${SYSTEM_ID}.${SPELL_END_FLAG}`] = spellEffectEnd;
  if (castId) updates[`flags.${SYSTEM_ID}.${CAST_ID_FLAG}`] = castId;
  if (duration) updates.duration = { ...duration, startTime: Number(game.time?.worldTime ?? 0) };
  return updates;
}

/**
 * Delete every effect on the actor that belongs to a given cast (matched by the
 * castId flag). Used to tear down a sustained spell's ongoing effects when it
 * lapses or is dismissed.
 *
 * @param {Actor} actor
 * @param {string} castId
 * @returns {Promise<number>} how many effects were removed
 */

/**
 * Items a spell CREATED and must take away again.
 *
 * NEW at 3.493.0 for Wild Morph, whose attack form exists for a minute
 * and must not outlive it.
 *
 * DECLARED BY THE ITEM, NOT INFERRED FROM THE STAMP. A castId alone is
 * not enough to delete something: Bless Water's Holy Water is created by
 * a spell and is meant to survive it — it is a real flask, and the caster
 * keeps it. So an item is removed only if it says it ends with the spell,
 * and anything that does not say so stays.
 *
 * THE COMMENT HERE SAID "BOTH ROUTES" AND THERE ARE THREE (3.514.0).
 *
 * It named the world clock (`expireSpellEffects`) and dismissal
 * (`removeEffectsByCastId`) and missed `expireTimedConditions`, the ROUND
 * clock — which deleted the effect and left everything the spell had
 * built standing.
 *
 * FOUND LIVE on 7 September 2026, and it was reachable every time. In a
 * combat `spellExpiryTiming` stamps BOTH clocks on one effect, and rounds
 * pass without the world clock moving at all: Magic Stone cast at round 1
 * printed "Magic Stone expires." at round 11, the effect went, and three
 * +1 pebbles stayed in the inventory for good. Wild Morph has carried the
 * same hole since 3.493.0, where it is worse — a grown claw that outlives
 * its minute is a permanent extra attack.
 *
 * All three routes call this now. The lesson is the comment's own: a list
 * of callers written into prose goes stale the moment somebody adds one,
 * and this one had been wrong for twenty releases.
 */
async function removeSpellItemsByCastId(actor, castId) {
  if (!castId || !actor?.deleteEmbeddedDocuments) return 0;
  const ids = Array.from(actor.items ?? [])
    .filter((i) => i.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) === castId
      && i.getFlag?.(SYSTEM_ID, "endsWithSpell") === true)
    .map((i) => i.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("Item", ids);
  return ids.length;
}


/**
 * Fire a Delayed Respite's stored blow, if it caught one.
 *
 * ONE FUNCTION, TWO ENDINGS. The world clock and a dismissal are both
 * "the spell ends", and Graham ruled on 4 September 2026 that dismissal
 * FIRES the packet rather than discarding it — which makes dismissing the
 * spell a weapon rather than a mercy. Two routes calling one function is
 * what stops them disagreeing about that.
 *
 * IT LANDS EVEN ON A CORPSE. The target may have died in the meantime
 * from something else; the ruling is that the delayed blow arrives
 * anyway. A delay, not an escape.
 *
 * THE PACKET IS CLEARED BEFORE IT IS APPLIED, so a release that somehow
 * runs twice cannot deal the damage twice — the same shape the reaper's
 * serialisation takes for the same reason.
 *
 * AND THE SPELL ENDS BEFORE THE BLOW LANDS, which is the book's own order
 * — "once the spell ends, the results of the attack manifest instantly" —
 * and load-bearing rather than stylistic. FOUND LIVE at 3.493.0: the card
 * read "the delayed blow lands — 17 (critical) damage" and Toben's hit
 * points did not move. `applyDamageAndCheckDying` crosses the very gate
 * this effect sits on, and the line above had just emptied its packet —
 * which is exactly the state `respiteCatches` looks for. The Respite
 * caught its own released blow, and then was deleted holding it.
 *
 * The reentrancy is why the effect is DELETED here rather than merely
 * disabled or marked: a document that still exists is a document some
 * other route can bring back into the gate, and this bug was not caught
 * by checks that asserted the release CALLED the damage path — it did.
 */
async function releaseDelayedRespite(actor, effect, { dismissed = false } = {}) {
  const raw = effect?.getFlag?.(SYSTEM_ID, RESPITE_FLAG);
  const record = normaliseDelayedRespite(raw);
  const packet = record?.packet;
  if (!packet || !Number(packet.damage)) return null;

  await effect.setFlag(SYSTEM_ID, RESPITE_FLAG, { ...raw, packet: null });
  // THE SPELL ENDS FIRST. See the header: leave the effect in place and
  // the blow it is releasing walks straight back into its own gate.
  // Callers delete afterwards too, and both tolerate this having gone.
  if (actor?.effects?.get?.(effect.id)) await effect.delete();
  const { applyDamageAndCheckDying } = await import("./dying-workflow.mjs");
  await applyDamageAndCheckDying(actor, packet.damage, {
    isCritical: Boolean(packet.isCritical),
    nonlethal: Boolean(packet.nonlethal)
  });

  // SAID OUT LOUD, HERE, BECAUSE BOTH ENDINGS COME THROUGH THIS ONE
  // FUNCTION. The world clock's sweep discards what it returns and the
  // dismissal path posts its own card; a blow that arrives silently a
  // round after it was struck looks to the table like hit points
  // draining on their own, which is the worst reading this spell has.
  const said = respiteReleasedLine(actor?.name ?? "The target", packet, dismissed);
  await ChatMessage.create({
    content: `<div class="trg-prime trg-card"><header class="trg-card-header">`
      + `<h3>${record.label}</h3></header><p>${said}</p></div>`,
    speaker: ChatMessage.getSpeaker({ actor })
  }).catch((error) => console.error("TRG Prime | A delayed blow could not be announced", error));
  return said;
}

/**
 * Every Respite on this actor, released. Returns the card lines.
 *
 * MODULE-LOCAL, ON PURPOSE. It was exported for a moment on the reasoning
 * that a rule with one caller inside its own file cannot be shown to be
 * used from outside — and `verify-rules-have-callers` answered that
 * straight away: an exported rule nobody calls is not automation, it is a
 * well-tested opinion. The dismissal path below is its one caller, and
 * exporting it against a caller that does not exist yet is how a backlog
 * of them starts.
 */
async function releaseRespitesByCastId(actor, castId, { dismissed = true } = {}) {
  const lines = [];
  for (const effect of Array.from(actor?.effects ?? [])) {
    if (castId && effect.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) !== castId) continue;
    const said = await releaseDelayedRespite(actor, effect, { dismissed });
    if (said) lines.push(said);
  }
  return lines;
}

export async function removeEffectsByCastId(actor, castId, { dismissed = true, direct = false } = {}) {
  if (!castId) return 0;
  /*
   * THROUGH THE GM WHEN THIS CLIENT MAY NOT WRITE (3.527.0).
   *
   * FOUND LIVE, 8 September 2026, as a player. `endActiveSpell` walks the
   * caster PLUS every target it recorded and calls this on each — and a
   * player cannot delete an ActiveEffect on an actor they do not own. So
   * a player who buffed an ally and pressed End Spell took it off
   * themselves and left it on the ally, for EVERY spell with a target.
   *
   * THE ASYMMETRY IS WHAT MADE IT INVISIBLE: `createEffectsOn` has been
   * relayed since the relay existed and this, its exact counterpart, never
   * was. Applying went through the GM and removing did not.
   *
   * IT SITS HERE RATHER THAN AT THE CALL SITE because there are four
   * callers — the Dismiss action, a sustained spell lapsing, Daily
   * Preparation, and the two expiry sweeps — and `removeSpellItemsByCastId`
   * a comment away from here records what happens when a list of callers
   * is written into prose: it "had been wrong for twenty releases". One
   * place cannot be missed by a caller nobody thought of.
   *
   * THE SWEEPS NEVER REACH IT. Both run under the designated-GM guard in
   * `trg-prime.mjs`, so they own everything they touch and `needsRelay`
   * answers false for them — this costs them nothing.
   */
  {
    const { removalNeedsRelay } = await import("./target-relay.mjs");
    if (removalNeedsRelay(actor, direct)) {
      const { relayEndCast } = await import("./target-relay-workflow.mjs");
      const reply = await relayEndCast(actor, castId, dismissed);
      // A REFUSAL IS NOT A SILENT ZERO. The caller counts what was
      // removed; saying "none" when the GM never answered would read as
      // "there was nothing there", which is the lie this whole module
      // exists to abolish.
      if (!reply.ok) {
        console.warn(`TRG Prime | ${actor?.name ?? "a target"} could not be cleaned up: `
          + `${reply.reason ?? "the GM did not answer"}`);
        return 0;
      }
      return Number(reply.result) || 0;
    }
  }
  // THE BLOW LANDS BEFORE THE SPELL IS TAKEN AWAY. Dismissal is an
  // ending, and "once the spell ends, the results manifest instantly".
  //
  // WHETHER IT WAS A PERSON'S DECISION TRAVELS (3.494.0). This is called
  // by the Dismiss action AND by the expiry sweeps, and the only
  // difference the card can see is the words "released early".
  await releaseRespitesByCastId(actor, castId, { dismissed });
  const ids = Array.from(actor?.effects ?? [])
    .filter((e) => e.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) === castId)
    .map((e) => e.id);
  if (ids.length) await actor.deleteEmbeddedDocuments("ActiveEffect", ids);
  // AND ANYTHING THE SPELL BUILT. See removeSpellItemsByCastId.
  await removeSpellItemsByCastId(actor, castId);
  // AND THE SHIELD IT MADE (3.575.0). A spell shield is a flag row, not an
  // effect, so the sweep above never reached it: Shield ran out and the
  // caster could go on Shield Blocking with it indefinitely.
  {
    const { SPELL_SHIELD_FLAG, spellShieldsWithout } = await import("../magic/spell-shield.mjs");
    const rows = actor?.getFlag?.(SYSTEM_ID, SPELL_SHIELD_FLAG);
    if (Array.isArray(rows) && rows.some((row) => row?.castId === castId)) {
      await actor.setFlag(SYSTEM_ID, SPELL_SHIELD_FLAG, spellShieldsWithout(rows, castId));
    }
  }
  return ids.length;
}

/**
 * Applies a set of extracted condition tags to an actor. Valued
 * conditions take the higher of the existing value and the newly
 * extracted one — an automated application should never silently
 * reduce a condition a player already has, even though the manual
 * toggle UI overwrites outright.
 *
 * @param {Actor} actor The target actor.
 * @param {Array<{key: string, label: string, value: number|null}>} tags
 * @param {object} [options]
 * @param {number|null} [options.expiresRound] If set, the round number
 *   (game.combat.round) at which these specific applications should be
 *   removed. Only meaningful during an active combat encounter.
 * @returns {Promise<Array<{key: string, label: string, value: number|null, wasAlreadyPresent: boolean}>>}
 *   What was actually applied, for reporting in a chat card.
 */
/**
 * Renders what applyConditionTags actually did, for a chat card.
 *
 * Shared rather than repeated at each call site because entries can now
 * come back *not* applied — an immunity records itself in the same list
 * so the GM can see it fired, and every caller would otherwise have to
 * remember to special-case it (and would read "Stunned" as applied when
 * the opposite happened).
 *
 * @param {Array<object>} applied As returned by applyConditionTags.
 * @returns {string}
 */
export function formatAppliedTags(applied = []) {
  return applied
    .map((tag) => {
      if (tag.immune) return `${tag.label} (immune)`;
      if (tag.warded) return `${tag.label} (turned aside by ${tag.warded})`;
      const partly = tag.wardedPartly ? ` (reduced by ${tag.wardedPartly})` : "";
      return tag.value !== null && tag.value !== undefined
        ? `${tag.label} ${tag.value}${partly}`
        : `${tag.label}${partly}`;
    })
    .join(", ");
}

/**
 * The effect that applies a condition DIRECTLY, or null — a condition only
 * granted by another has none.
 */
function directConditionEffect(actor, key) {
  return Array.from(actor?.effects ?? []).find(
    (e) => !e?.disabled && e?.statuses?.has?.(key)
  ) ?? null;
}

export async function applyConditionTags(
  actor,
  tags,
  { expiresRound = null, duration = null, spellEffect = false, spellEffectEnd = null, castId = null,
    sourceTraits = null, direct = false } = {}
) {
  /*
   * A CREATURE THIS CLIENT DOES NOT OWN IS THE GM'S TO WRITE (3.646.0).
   *
   * FOUND LIVE, 15 October 2026, testing 3.645.0 as a player: Song Of
   * Despair still threw "lacks permission to create ActiveEffect" on the
   * Boars it caught. Every spell's conditions reach their targets through
   * this helper, straight from `applySpellEffects`, and only the weapon
   * paths had wrapped it in `relayConditionTags` — so a player's Sleep,
   * Fear or Song Of Despair on the GM's creature unwound at the first
   * condition, before the Result card, the register or the Sustain.
   *
   * RELAYED HERE, AT THE BOTTOM, as the damage relay is, so every caller is
   * carried across with every option. `direct` is the GM's own re-entry and
   * stops it asking again.
   */
  if (!direct && actor && actor.isOwner === false) {
    const { relayConditionTags } = await import("./target-relay-workflow.mjs");
    return relayConditionTags(actor, tags,
      { expiresRound, duration, spellEffect, spellEffectEnd, castId, sourceTraits },
      () => applyConditionTags(actor, tags, { expiresRound, duration, spellEffect, spellEffectEnd, castId, sourceTraits, direct: true }));
  }
  const applied = [];

  /*
   * A TAG MAY BRING ITS OWN CLOCK (3.581.0; the pages 211-220 audit's
   * D1, D2 and D10, Graham's R1, R2 and R10).
   *
   * Every caller before this had one duration for the whole call, which
   * was true of everything the system applied until a critical row was
   * read properly. Bludgeoning 39 is the counter-example the tables are
   * full of: "Target is Stunned 1. They are also Flat-Footed until the
   * end of their next turn." — two conditions from one row, and only one
   * of them on a clock.
   *
   * SO THE CALL-LEVEL OPTION IS A DEFAULT, NOT AN OVERRIDE. A tag that
   * says nothing about timing behaves exactly as it always has, which is
   * what keeps the forty other callers of this function unchanged.
   *
   * `!== undefined && !== null` RATHER THAN A TRUTHINESS TEST, because
   * round 0 is a real round and `Number(null)` is 0 — the shape of the
   * defect that deleted the critical from every damage roll at 3.580.0
   * before a live test caught it.
   */
  const timingFor = (tag) => ({
    expiresRound: tag?.expiresRound !== undefined && tag?.expiresRound !== null
      ? tag.expiresRound
      : expiresRound,
    endsWith: tag?.endsWith ?? null,
    expiresTime: tag?.expiresTime !== undefined && tag?.expiresTime !== null ? tag.expiresTime : null,
    followOn: tag?.followOn ?? null
  });

  // Rage (Chapter 4): "You are immune to stun." This was the only
  // condition immunity in the system and it was matched by the *display
  // name* of an active effect, in this helper — which most of the forty
  // or so places that apply conditions never call. Conviction and the
  // combat tracker both stun directly, so a Raging character was not
  // actually immune to either. The general check now lives on the Actor,
  // guarding the toggle itself; this stays only so the chat card can say
  // "(immune)" rather than quietly omitting the condition.
  const raging = Boolean(
    actor?.effects?.some((effect) => effect.name === RAGE_EFFECT_NAME)
  );

  // FEARFUL POWER (3.659.0; F&F 3.0 block 28 R9): frightened gained within
  // 30 feet of a Tenebrax is one higher.
  if (tags.some((t) => t?.key === "frightened")) {
    const { fearfulPowersReaching } = await import("../fearful-power-workflow.mjs");
    const { boostedFrightenedTag } = await import("../fearful-power.mjs");
    const powers = fearfulPowersReaching(actor);
    if (powers.length) tags = tags.map((t) => boostedFrightenedTag(t, powers));
  }

  for (const tag of tags) {
    const def = CONDITIONS[tag.key];
    if (!def) continue;

    /*
     * "EVEN IF SUCH CREATURES ARE NORMALLY IMMUNE" (3.609.0, block 33's R3).
     * Turn Undead's Success stuns an undead whose stat block lists stunned
     * among its immunities. A tag may say so, and is then applied past the
     * immunity with the actor's own `force` — the override the toggle has
     * offered since it was written and nothing used.
     */
    const immune = !tag.ignoreImmunity && (
      (raging && tag.key === "stunned") ||
      Boolean(actor?.isImmuneToCondition?.(tag.key)));

    if (immune) {
      applied.push({
        key: tag.key,
        label: tag.label,
        value: null,
        wasAlreadyPresent: false,
        immune: true
      });
      continue;
    }

    /*
     * PRESENT MEANS APPLIED, NOT MERELY IN EFFECT (3.608.0).
     *
     * This read `actor.hasCondition`, which answers from the EFFECTIVE set
     * — a condition applied directly or GRANTED by another (Unconscious
     * grants Blinded and Prone; Blinded grants Flat-Footed). So a condition
     * a creature had only by implication was treated as already there, and
     * nothing was written. Found live on 3.606.0: a Sunburst Fumble that
     * dropped its target to Dying printed "Blinded (permanent)" and applied
     * nothing, and the blindness went the moment the creature woke.
     *
     * A granted condition lives exactly as long as the one that grants it.
     * One laid on by a rule must outlive that, so only an effect carrying
     * the status counts as "already present".
     */
    const wasAlreadyPresent = directConditionEffect(actor, tag.key) !== null;

    if (def.valued) {
      const existingValue = wasAlreadyPresent ? Number(actor.getConditionValue?.(tag.key) ?? 0) : 0;
      // VALUED CONDITIONS ADD (Graham, 19 Aug 2026). This was
      // `Math.max(existing, incoming)`, so a second critical that
      // inflicted Bleeding 2 on a target already Bleeding 2 left it at
      // 2 — while the card cheerfully said "Bleeding 2 applied". Two
      // wounds bleed more than one.
      //
      // The registry corroborates it: the Appendix 2 bleeding bands run
      // Light 1–4, Moderate 5–8, Severe 9–12, Dire 13+. A value that
      // only ever came from one application of 2–4 could never reach
      // the third band, let alone the fourth.
      //
      // …BUT ONLY THOSE THE PAGE SAYS ADD (3.621.0; Graham's R5 of block
      // 39). "Some conditions accumulate, others replace": Bleeding and
      // Injured are cumulative, Recurring Damage is separate wounds, and
      // Fatigue and Soul Drain are amounts gained. Slowed ("do not stack,
      // only apply the most severe"), Stunned, Frightened and the rest keep
      // the higher value. See `combinedConditionValue`.
      // SOUL WARD (3.626.0): a registered armour rune reduces the Soul
      // Drain GAINED — never what the wearer already carries — once a minute.
      let incomingValue = Number(tag.value ?? 1);
      let wardedBy = "";
      if (tag.key === "soulDrain" && incomingValue > 0) {
        const { soulDrainWard, runeMarkersOf, runeUseUpdates } = await import("../rune-declarations.mjs");
        const now = Number(game.time?.worldTime ?? 0);
        const ward = soulDrainWard(Array.from(actor.items ?? []), now);
        if (ward) {
          const kept = Math.max(0, incomingValue - ward.reduce);
          const updates = runeUseUpdates(runeMarkersOf(ward.item), ward.key, ward.frequency, now);
          for (const [flag, value] of Object.entries(updates)) await ward.item.setFlag?.(SYSTEM_ID, flag, value);
          ui.notifications?.info?.(`${ward.label}: Soul Drain ${incomingValue} reduced to ${kept}.`);
          // SAID ON THE CARD WHEN PART GOT THROUGH TOO (3.626.1; found live
          // on 0.8.0: a 12 reduced to 2 read "Soul Drain 12 → 14" with no
          // word of the ward that took the ten).
          wardedBy = `${ward.label}, ${incomingValue} → ${kept}`;
          incomingValue = kept;
          if (!incomingValue) {
            applied.push({ key: tag.key, label: tag.label, value: 0, wasAlreadyPresent, warded: ward.label });
            continue;
          }
        }
      }
      const newValue = combinedConditionValue(tag.key, existingValue, incomingValue);
      /*
       * A TAG MAY BRING ITS OWN DAMAGE TYPE (3.589.0).
       *
       * Recurring Damage always has one — that is a ruling, and
       * `#applyValuedCondition` enforces it by defaulting a missing one
       * to FIRE. `toggleStatusEffect` has accepted `options.damageType`
       * since the condition manager was written; this helper never
       * passed it, so every one of its forty-odd callers could only ever
       * inflict recurring FIRE.
       *
       * Found while building Enervation, whose line is essence. It would
       * have applied, ticked every turn, and burned the target with the
       * wrong element for the whole encounter — a number arriving
       * correctly under the wrong name.
       */
      const effect = await actor.toggleStatusEffect(tag.key, {
        active: true, value: newValue,
        ...(tag.damageType ? { damageType: String(tag.damageType) } : {}),
        ...(tag.ignoreImmunity ? { force: true } : {})
      });
      const timing = timingFor(tag);
      const allowed = expiryToWrite({
        weApplied: !wasAlreadyPresent,
        existing: effect?.getFlag?.(SYSTEM_ID, EXPIRY_FLAG) ?? null,
        incoming: timing.expiresRound
      });
      const updates = buildTimingUpdates({
        expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId,
        // WHOSE CLOCK IS IT applies to all three (combat/condition-timing.mjs):
        // a link, a world-time deadline and a successor are deadlines too, and
        // a rule that did not create the condition does not get to set them.
        ...(wasAlreadyPresent ? {} : {
          endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn
        })
      });
      // WHAT PUT IT THERE (3.613.0, R14): the traits of the spell that
      // inflicted it, so "counteract one emotion effect" can find it. Only
      // on a condition this call created — one already standing came from
      // something else.
      if (!wasAlreadyPresent && Array.isArray(sourceTraits) && sourceTraits.length) {
        updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;
      }
      if (effect?.update && Object.keys(updates).length) {
        await effect.update(updates);
      }
      applied.push({ key: tag.key, label: tag.label, value: newValue, wasAlreadyPresent, ...(wardedBy ? { wardedPartly: wardedBy } : {}) });
    } else {
      if (!wasAlreadyPresent) {
        await actor.toggleStatusEffect(tag.key, { active: true, ...(tag.ignoreImmunity ? { force: true } : {}) });
      }
      const effect = actor.effects?.find?.(
        (e) => !e.disabled && e.statuses?.has?.(tag.key)
      );
      const timing = timingFor(tag);
      const allowed = expiryToWrite({
        weApplied: !wasAlreadyPresent,
        existing: effect?.getFlag?.(SYSTEM_ID, EXPIRY_FLAG) ?? null,
        incoming: timing.expiresRound
      });
      const updates = buildTimingUpdates({
        expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId,
        ...(wasAlreadyPresent ? {} : {
          endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn
        })
      });
      if (!wasAlreadyPresent && Array.isArray(sourceTraits) && sourceTraits.length) {
        updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;
      }
      /*
       * WHAT QUICKENED'S POINT MAY BUY (3.648.0; combat/restricted-ap.mjs).
       * One Quickened from two sources is still one AP, spendable on "any
       * single action permitted by any of the effects" — so a second source
       * widens the list, and a source that names nothing frees it entirely.
       * Written here, on the client that writes the effect, so it travels
       * through the GM relay with the tag.
       */
      if (tag.key === "quickened" && tag.apFor !== undefined) {
        const incoming = Array.isArray(tag.apFor) ? tag.apFor : null;
        const existing = wasAlreadyPresent ? effect?.getFlag?.(SYSTEM_ID, "quickenedFor") : undefined;
        let next;
        if (!wasAlreadyPresent) next = incoming ?? "any";
        else if (!Array.isArray(existing) || !incoming) next = "any";
        else next = [...new Set([...existing, ...incoming])];
        updates[`flags.${SYSTEM_ID}.quickenedFor`] = next;
      }
      if (effect?.update && Object.keys(updates).length) {
        await effect.update(updates);
      }
      applied.push({ key: tag.key, label: tag.label, value: null, wasAlreadyPresent });
    }
  }

  /*
   * AN ESCAPE SAVE A TAG CARRIES (3.627.0). "Paralyzed for 1 minute and may
   * attempt a new Fortitude save at the end of each of its turns" (Ghoulish
   * Venom). Stamped here — on whichever client applies the condition, the
   * GM's when it came through the relay — rather than by the caller after the
   * fact, which needs write access to a creature a player does not own. See
   * magic/condition-save.mjs for the descriptor.
   */
  for (const tag of tags) {
    if (!tag?.conditionSave || !applied.some((a) => a.key === tag.key && !a.immune)) continue;
    const { recordConditionSave } = await import("../magic/condition-save-workflow.mjs");
    await recordConditionSave(actor, { ...tag.conditionSave, condition: tag.key });
  }

  return applied;
}

/**
 * Removes any effect on the actor whose conditionExpiresRound flag has
 * been reached, called from TRGCombat._onStartTurn alongside the
 * existing per-turn condition maintenance (Stunned reduction, and so
 * on) — the same place, same pattern, this project already uses for
 * everything else that changes at the start of a turn.
 *
 * @param {Actor} actor
 * @param {number} currentRound
 * @returns {Promise<string[]>} Labels of whatever expired, for the turn card.
 */
/**
 * Delete one expired effect — a stasis through `releaseStasis`, so the clocks
 * it held move on before any other sweep can see it gone (3.614.1, F1).
 */
async function endEffect(effect, owner = effect?.parent) {
  if (effect?.flags?.[SYSTEM_ID]?.stasis) {
    const { releaseStasis } = await import("../magic/stasis-workflow.mjs");
    await releaseStasis(effect);
    return;
  }
  // GONE ALREADY IS NOT AN ERROR (3.616.0, F1 of the 3.615.0 drive): see
  // `claimExpiry`. A delete that loses the race to another client is told
  // the effect "does not exist", and the effect has ended either way.
  if (!stillOn(effect, owner)) return;
  try {
    await effect.delete();
  } catch (err) {
    if (!/does not exist/i.test(String(err?.message ?? err))) throw err;
  }
}

/*
 * ONE SWEEP PER EFFECT (3.616.0, F1 of the 3.615.0 drive). A round's change
 * moves the world clock and starts the next turn together, so an effect due
 * on BOTH clocks — a spell's end round and its world-time end — was found by
 * the world-time sweep and the turn's sweep at once. Both reported it, both
 * deleted it, and the second delete raised "ActiveEffect … does not exist!"
 * in red at the GM. The first sweep to reach an effect now claims it; the
 * other passes over it.
 */
const expiring = new Set();

/** Whether the effect is still on its owner. An owner that can't say counts as yes. */
function stillOn(effect, owner) {
  const effects = owner?.effects;
  if (typeof effects?.get !== "function") return true;
  return Boolean(effects.get(effect?.id));
}

/** Claim an effect for this sweep; null when another sweep already has it. */
function claimExpiry(effect, owner = effect?.parent) {
  const key = effect?.uuid ?? `${owner?.uuid ?? owner?.id ?? ""}.${effect?.id ?? ""}`;
  if (expiring.has(key) || !stillOn(effect, owner)) return null;
  expiring.add(key);
  return key;
}

export async function expireTimedConditions(actor, currentRound) {
  const expired = [];
  const effects = Array.from(actor.effects ?? []);
  // NO ROUNDS PASS FOR A CREATURE IN STASIS (3.614.0, R2) — but the stasis's
  // own clock does. See magic/stasis.mjs.
  const stasis = stasisEffectOf(effects);

  for (const effect of effects) {
    if (frozenByStasis(effect, stasis)) continue;
    const expiresRound = effect.getFlag?.(SYSTEM_ID, EXPIRY_FLAG);
    if (expiresRound === undefined || expiresRound === null) continue;
    if (Number(currentRound) < Number(expiresRound)) continue;
    const claim = claimExpiry(effect, actor);
    if (!claim) continue;
    try {
      const statusId = effect.statuses?.values?.().next?.()?.value ?? null;
      const label = statusId ? (CONDITIONS[statusId]?.label ?? effect.name) : effect.name;
      expired.push(label);
      // THE CAST IS READ BEFORE THE EFFECT IS DELETED, because afterwards
      // there is nothing left to ask which cast it belonged to. Same order
      // as `expireSpellEffects`, for the same reason.
      const castId = effect.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) ?? null;
      // A STASIS LETS ITS CREATURE'S CLOCKS GO FIRST (3.614.1, F1) — see
      // `releaseStasis`.
      await endEffect(effect, actor);
      // AND ANYTHING THE SPELL BUILT (3.514.0) — the third route, and the
      // one that was missing. See removeSpellItemsByCastId's header.
      await removeSpellItemsByCastId(actor, castId);
    } finally {
      expiring.delete(claim);
    }
  }

  return expired;
}

/**
 * Remove spell-applied effects whose world-time end has passed. This is the
 * out-of-combat counterpart to {@link expireTimedConditions}: driven by the
 * world clock (the `updateWorldTime` hook) rather than combat turns, so a
 * buff or condition from a spell drops off the target's Effects table once the
 * spell's duration elapses even when no combat is running. Only touches effects
 * flagged as spell effects — manual GM effects are never removed.
 *
 * @param {Actor} actor
 * @param {number} worldTime  the current `game.time.worldTime`, in seconds
 * @returns {Promise<string[]>} Labels of whatever expired.
 */
export async function expireSpellEffects(actor, worldTime) {
  const expired = [];
  // AND NO TIME, ON THE WORLD CLOCK EITHER (3.614.0, R2).
  const stasis = stasisEffectOf(Array.from(actor.effects ?? []));
  for (const effect of Array.from(actor.effects ?? [])) {
    if (frozenByStasis(effect, stasis)) continue;
    if (!effect.getFlag?.(SYSTEM_ID, SPELL_EFFECT_FLAG)) continue;
    const end = effect.getFlag(SYSTEM_ID, SPELL_END_FLAG);
    if (end === undefined || end === null) continue;
    if (Number(worldTime) < Number(end)) continue;
    // ONE SWEEP PER EFFECT (3.616.0, F1) — see `claimExpiry`.
    const claim = claimExpiry(effect, actor);
    if (!claim) continue;
    try {
      const statusId = effect.statuses?.values?.().next?.()?.value ?? null;
      expired.push(statusId ? (CONDITIONS[statusId]?.label ?? effect.name) : effect.name);
      // THE CAST IS READ BEFORE THE EFFECT IS DELETED, because afterwards
      // there is nothing left to ask which cast it belonged to.
      const castId = effect.getFlag?.(SYSTEM_ID, CAST_ID_FLAG) ?? null;
      // AND A HELD BLOW ARRIVES AS THE SPELL RUNS OUT, which is the
      // ordinary way a Delayed Respite ends.
      await releaseDelayedRespite(actor, effect, { dismissed: false });
      // A RELEASED RESPITE HAS ALREADY DELETED ITSELF — see the header
      // there for why it must. Everything else the sweep finds is still
      // here and still ours to remove.
      if (actor.effects.get(effect.id)) await endEffect(effect, actor);
      await removeSpellItemsByCastId(actor, castId);
    } finally {
      expiring.delete(claim);
    }
  }
  return expired;
}

/**
 * Applies whatever extractSelfDamage (see ../effect-parser.mjs) found
 * in a fumble or spell-fumble row's text to the actor themselves —
 * shared by rollFumbleCheck and rollSpellFumble rather than
 * duplicated, since both need the exact same three-way handling
 * (flat/bleed/dice) for what is, in both tables, self-inflicted
 * damage from the caster or attacker's own mistake.
 *
 * @param {Actor} actor
 * @param {{type: "flat", amount: number}|{type: "bleed"|"diceDamage", formula: string}|null} selfDamage
 * @param {Function} applyDamageAndCheckDying Injected to avoid a
 *   combat/attack-workflow.mjs <-> combat/dying-workflow.mjs import
 *   cycle risk; both callers already import it directly.
 * @returns {Promise<{line: string|null, roll: Roll|null}>}
 */
export async function applySelfDamage(actor, selfDamage, applyDamageAndCheckDying, serratedBonus = 0) {
  if (!selfDamage) return { line: null, roll: null };

  if (selfDamage.type === "flat") {
    await applyDamageAndCheckDying(actor, selfDamage.amount);
    return { line: `<strong>${actor.name} takes ${selfDamage.amount} damage.</strong>`, roll: null };
  }

  if (selfDamage.type === "bleed") {
    const roll = await new Roll(selfDamage.formula).evaluate();
    const value = roll.total + Number(serratedBonus || 0);
    await applyConditionTags(actor, [{ key: "bleeding", label: "Bleeding", value }]);
    return {
      line: `<strong>${actor.name} gains Bleeding ${value}</strong> (${selfDamage.formula}${serratedBonus ? ` +${serratedBonus} Serrated` : ""}).`,
      roll
    };
  }

  if (selfDamage.type === "diceDamage") {
    const roll = await new Roll(selfDamage.formula).evaluate();
    await applyDamageAndCheckDying(actor, roll.total);
    return { line: `<strong>${actor.name} takes ${roll.total} damage</strong> (${selfDamage.formula}).`, roll };
  }

  return { line: null, roll: null };
}
