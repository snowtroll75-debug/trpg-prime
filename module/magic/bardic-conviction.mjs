/**
 * Bardic Performance's temporary conviction point (Bard, 1st).
 *
 * > Each time you cast a spell that has the composition trait, you may assign
 * > a temporary conviction point to any one of the spells targets (excluding
 * > yourself). This conviction point remains for the duration of the spell or
 * > until it is expended, whichever comes first.
 *
 * WHY THIS WAS DEFERRED, AND WHAT CHANGED. It carried a written note for
 * several releases saying it was not automated, with the reason stated: "a
 * resource granted onto a DIFFERENT actor than the one spending the ability's
 * use, tracked against a spell's own duration and separately against being
 * spent" — no precedent existed. Two now do. Granted items (3.307.0) put a
 * thing on an actor for a spell's duration and remove it by every route the
 * spell can end, and the expiry machinery it hangs off is shared. The only
 * genuinely new question was how to tell a point that EXPIRED from one that
 * was SPENT, and `temporaryConvictionExpiry` answers that with a high-water
 * mark rather than by trying to follow one interchangeable point around.
 *
 * DELIBERATELY ABOVE THE POOL MAXIMUM. `awardConviction` caps at the actor's
 * own maximum, which is right for earned points. This one is temporary and
 * belongs to somebody else's ability, and capping it would silently do nothing
 * for the common case of a target already at full conviction — the moment a
 * bard is most likely to be handing one out is not a moment to quietly drop
 * it. Written straight to the resource for that reason.
 */
import { convictionRecipients, temporaryConvictionExpiry } from "../bard.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";
import { createEffectsOn } from "../combat/target-relay-workflow.mjs";
import { parseSpellDuration } from "./spell-effects.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The conviction pool as STORED, not as prepared.
 *
 * `prepareResourcePercentages` clamps every resource to its maximum on each
 * preparation pass, so prepared data can never show a point that is sitting
 * above the cap — and on the way OUT, when the effect carrying the extra
 * maximum has just been deleted, the prepared value is already clamped down
 * while the stored one still holds the granted point. Both ends of this
 * feature have to reason about the number actually written to the actor.
 */
function storedConviction(actor) {
  return Number(actor?._source?.system?.resources?.conviction?.value
    ?? actor?.system?.resources?.conviction?.value ?? 0);
}

/** Prompt for which of the reached targets receives the point. */
async function chooseRecipient(candidates) {
  if (candidates.length === 1) return candidates[0];
  const { DialogV2 } = foundry.applications.api;
  const rows = candidates
    .map((a, i) => `<label style="display:block;margin:3px 0"><input type="radio" name="who" value="${i}"${i === 0 ? " checked" : ""}> ${a.name}</label>`)
    .join("");
  const picked = await DialogV2.prompt({
    window: { title: "Bardic Performance — Temporary Conviction" },
    classes: ["trg-prime", "trg-check-dialog"],
    content: `<div class="trg-prime trg-check-dialog"><p class="hint">Assign the temporary conviction point to:</p>${rows}</div>`,
    ok: {
      label: "Assign",
      callback: (event, button) => {
        const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        return new FDE(button.form).object?.who ?? "0";
      }
    },
    rejectClose: false
  });
  if (picked === null || picked === undefined) return null;
  return candidates[Number(picked)] ?? null;
}

/**
 * Assign the point, spend the use, and hang it off an effect that expires
 * with the spell.
 *
 * @param {Actor} caster
 * @param {Item} spell
 * @param {object} options
 * @param {string[]} options.targetUuids Actors the spell actually reached.
 * @param {string} options.durationText The spell's duration, warps included.
 * @param {string} [options.castId] THE ID OF THIS CAST. Stamped onto the
 *   effect so that DISMISSING the spell reclaims the point (3.324.0).
 * @returns {Promise<{note: string, recipientUuid: string}|null>} A line for
 *   the cast card and who received it, or null if the chooser was cancelled.
 */
export async function assignTemporaryConviction(caster, spell, { targetUuids = [], durationText = "", castId = null } = {}) {
  const { bardicPerformanceItem } = await import("../bard.mjs");
  const { itemUsesRemaining } = await import("../uses-workflow.mjs");

  const performItem = bardicPerformanceItem(caster);
  const remaining = performItem ? (itemUsesRemaining(performItem) ?? 0) : 0;
  if (!performItem || remaining <= 0) {
    return { note: "<em>Bardic Performance — no uses remain, so no conviction point was assigned.</em>", recipientUuid: "" };
  }

  // A spell with no duration has nothing for the point to ride, and a point
  // with no end is the failure this whole area of the system exists to stop.
  // The tickbox is not offered for those spells; this is the second half, for
  // any caller that reaches here without passing that gate.
  const parsed = parseSpellDuration(durationText);
  if (!parsed) {
    return { note: "<em>Bardic Performance — this spell has no duration for a temporary "
      + "conviction point to last for, so none was assigned.</em>", recipientUuid: "" };
  }

  const actors = [];
  for (const uuid of targetUuids) {
    try {
      const doc = await fromUuid(uuid);
      const actor = doc?.actor ?? doc;
      if (actor?.id && !actors.some((a) => a.id === actor.id)) actors.push(actor);
    } catch (_e) { /* a target that has gone is simply not a candidate */ }
  }
  // "excluding yourself" — and a spell that reached nobody else has nobody to
  // give it to, which is a thing to SAY rather than a use to quietly spend.
  const candidates = convictionRecipients(actors, caster);
  if (!candidates.length) {
    return { note: "<em>Bardic Performance — the spell reached no one but you, so no conviction point was assigned.</em>", recipientUuid: "" };
  }

  const recipient = await chooseRecipient(candidates);
  if (!recipient) return null;

  // The STORED value, not the prepared one. Every resource is clamped to its
  // maximum during data preparation, so prepared data cannot show a pool above
  // its own cap and reading it would lose a point already granted.
  const pool = storedConviction(recipient);
  const granted = pool + 1;
  await performItem.update({ "system.usesValue": remaining - 1 });

  // The owning effect, created BEFORE the point is written.
  //
  // FOUND LIVE AT 3.309.0. Writing the value straight to the resource — the
  // deliberate "above their own maximum" — lasted exactly until the next data
  // preparation, which clamps every resource to its max: the card announced
  // "Nick gains a temporary conviction point (now 2)" and Nick's sheet read
  // 1/1. The point has to bring its own room with it, so the effect carries an
  // ADD change on the MAXIMUM and the value is written after that has landed.
  // The pool then reads 2/2 while it lasts, which is also what a player would
  // expect to see.
  //
  // `parsed` is the one from the guard at the top — one copy, so the duration
  // the refusal tests and the duration the effect expires on cannot disagree.
  //
  // THE CAST'S OWN ID, and the reason this line exists (3.324.0). Every other
  // effect a spell creates carries `castId`, because that is what
  // `removeEffectsByCastId` matches on when a spell is DISMISSED — the End
  // Spell button, a sustained spell lapsing, and Daily Preparation all funnel
  // through it. This effect carried the two CLOCK flags and not that one, so
  // it expired when its duration elapsed and survived every early ending.
  //
  // Found live on 17 Aug 2026: Inspire Courage cast, End Spell pressed, the
  // spell's own buff gone from the recipient and the conviction point still
  // sitting there at 2/2. Inspire Courage is SUSTAINED, so being dropped early
  // is the normal way it ends — and at a table where world time does not
  // advance between scenes, "until the clock catches up" means "for ever".
  //
  // The reclaim hook itself was never wrong: it fires on `deleteActiveEffect`,
  // which covers every route an effect can leave. The effect simply could not
  // be found by the dismissal route.
  const flags = { [SYSTEM_ID]: { spellBuff: true, temporaryConviction: { granted } } };
  if (castId) flags[SYSTEM_ID].castId = castId;
  if (parsed?.seconds != null) {
    flags[SYSTEM_ID].spellEffect = true;
    flags[SYSTEM_ID].spellEffectEnd = Number(game.time?.worldTime ?? 0) + Number(parsed.seconds);
  }
  if (parsed?.rounds != null && game.combat?.started) {
    flags[SYSTEM_ID].spellEffect = true;
    flags[SYSTEM_ID].conditionExpiresRound = Number(game.combat.round ?? 0) + Number(parsed.rounds);
  }

  await createEffectsOn(recipient, [{
    name: `${spell.name} — Temporary Conviction`,
    img: spell.img ?? "icons/magic/light/explosion-star-glow-silhouette.webp",
    origin: spell.uuid,
    changes: [{
      key: "system.resources.conviction.max",
      type: CHANGE_TYPE.ADD,
      value: "1",
      priority: 20
    }],
    flags
  }]);
  await recipient.update({ "system.resources.conviction.value": granted });

  return {
    note: `<strong>${recipient.name}</strong> gains a temporary conviction point `
      + `(now ${granted}) for the spell's duration, or until spent.`,
    // WHO GOT IT, returned so the caller can make sure they are among the
    // actors the active-spell registry will visit when the spell ends. A
    // composition spell that grants no other effect reaches here with an empty
    // `affectedUuids`, so without this the recipient would be tagged with a
    // castId nobody ever goes looking for.
    recipientUuid: String(recipient.uuid ?? "")
  };
}

/**
 * Reclaims an unspent temporary conviction point when its effect ends.
 *
 * Hooked on `deleteActiveEffect` for the same reason granted items are: it
 * fires for every route an effect can leave — both clocks, dismissal, and a GM
 * removing it by hand — so the rule is stated once.
 */
export function registerTemporaryConvictionCleanup() {
  Hooks.on("deleteActiveEffect", (effect) => {
    try {
      const record = effect?.getFlag?.(SYSTEM_ID, "temporaryConviction");
      if (!record) return;
      const actor = effect.parent;
      if (!actor?.update) return;
      // STORED, for the reason given on `storedConviction`: by the time this
      // hook runs the effect that carried the extra maximum is gone, so the
      // prepared value already reads one lower and an unspent point would look
      // spent — the reclaim would silently never happen, and the stored point
      // would resurface the next time anything raised the cap.
      const { reclaim, newValue } = temporaryConvictionExpiry(
        storedConviction(actor),
        record.granted
      );
      if (!reclaim) return;
      void actor.update({ "system.resources.conviction.value": newValue });
    } catch (_e) {
      /* best-effort: never let cleanup break effect deletion */
    }
  });
}
