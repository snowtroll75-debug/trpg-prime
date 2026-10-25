import { buildOutcome, DEGREE_BY_KEY, DIFFICULTY_BY_KEY, parseEnteredDC } from "./resolution.mjs";
import { buildOutcomeDisplay } from "./check.mjs";
import {
  CONVICTION_SPENDS,
  getConvictionState,
  markConvictionSpent
} from "../conviction.mjs";
import {
  UNBREAKABLE_TRIGGER_DEGREES,
  unbreakableResolvePartialToSuccess
} from "../fighter.mjs";
import { DEVOTION_PP_COST, devotionSkillTrigger } from "../crusader.mjs";
import { resolveActorHandle, handleIsPrecise, IMPRECISE_HANDLE_NOTE } from "../actor-handle.mjs";
import {
  PRISON_FLAG, normalisePrison, prisonDegree, prisonOutcome,
  prisonAttemptLine, prisonEscapeLine, prisonRefusal
} from "../magic/prison.mjs";
import {
  BEACON_FLAG, normaliseBeacon, beaconAvailable, beaconFormula, beaconAfterUse,
  beaconExhausted, beaconBleedStopped, beaconLine, beaconEndsLine, beaconRefusal
} from "../magic/vital-beacon.mjs";

/**
 * Attaches a click listener to an element at most once, no matter how
 * many times this is called for it — guards against the class of bug
 * fixed here (see registerCheckCardListeners): `renderChatMessageHTML`
 * fires on every re-render of a message, including the ones these
 * very handlers trigger via message.update(), and if the same DOM
 * button element persists across those re-renders, attaching a fresh
 * listener each time stacks duplicates on it rather than replacing
 * anything.
 *
 * @param {HTMLElement|null|undefined} element
 * @param {string} eventName
 * @param {(event: Event) => void} handler
 * @returns {boolean} Whether a listener was actually attached (false
 *   if the element was missing or already bound).
 */
export function bindOnce(element, eventName, handler) {
  if (!element || element.dataset.trgListenerBound) return false;
  element.dataset.trgListenerBound = "true";
  element.addEventListener(eventName, handler);
  return true;
}

/**
 * Chat-card interactivity for the two conviction/DC decisions that live on
 * the posted card rather than a blocking pre-roll dialog:
 *
 * - Spend Conviction (+1d6): "after rolling the d20 but before the outcome
 *   is revealed, you may roll a d6 and add its result to your check."
 *   Rather than withhold the outcome until this decision is made (which
 *   would add friction to every eligible roll, including the common case
 *   of a player with no interest in spending), the outcome shows
 *   immediately as always, and this button — present only while a point
 *   is available and unspent on this card — recomputes and updates the
 *   degree in place if clicked.
 * - The GM setting a DC after the fact, for checks that were rolled with
 *   no DC known at all (the existing "Awaiting Difficulty" case). Visible
 *   to everyone as a message; the input itself is hidden from non-GMs
 *   client-side, since the underlying stored HTML is identical for every
 *   viewer.
 *
 * Neither control has anything to do with the TRGCheck instance that
 * rolled the check — that object is long gone by the time either is
 * clicked — so both work from the raw recompute inputs stored on the
 * message's own flags (see check.mjs's toMessage).
 */

const SYSTEM_ID = "trg-prime";
const CARD_TEMPLATE = "systems/trg-prime/templates/chat/check-card.hbs";

function renderTemplateCompat(path, data) {
  const handlebars = foundry.applications?.handlebars;
  if (handlebars?.renderTemplate) return handlebars.renderTemplate(path, data);
  return renderTemplate(path, data);
}

function computeDC(raw) {
  if (raw.baseDC === null || raw.baseDC === undefined) return null;
  const difficulty = DIFFICULTY_BY_KEY[raw.difficulty];
  return Number(raw.baseDC) + Number(difficulty?.modifier ?? 0);
}

/** Recompute the outcome from the raw state and update the message in place. */
/**
 * The creature a check card was rolled for (3.612.1, H1 of the 3.612.0 drive).
 * Token, then uuid, then the bare id — the id alone names an unlinked token's
 * world actor, which is the defect this replaces. A card from before 3.612.1
 * carries only the id and resolves as it always did.
 */
async function cardActor(raw) {
  return resolveActorHandle({ tokenId: raw?.tokenId, actorUuid: raw?.actorUuid, actorId: raw?.actorId });
}

/** Dice So Nice 5 and later animate the rolls a message update adds. */
function diceSoNiceAnimatesUpdates() {
  const version = game.modules?.get?.("dice-so-nice")?.version ?? "";
  const major = Number(String(version).split(".")[0]);
  return Number.isFinite(major) && major >= 5;
}

async function recomputeAndUpdate(message, raw, { extraRoll = null } = {}) {
  // A FATEFUL TEMPTATION SHIFT IS MOVED AGAIN (3.612.0, R4). A Conviction die
  // or a late DC rebuilds the outcome from the stored inputs, and without the
  // stored shift a fumble the spell made would come back a failure.
  const { applyDegreeShift } = await import("./degree-shift.mjs");
  const shifted = applyDegreeShift(buildOutcome({
    dieTotal: raw.dieTotal,
    modifiers: raw.modifiers,
    dc: computeDC(raw),
    chaos: raw.chaosArg,
    auto: raw.autoArg
  }), raw.degreeShift ?? "");
  // A DEGREE DECLARED WITHOUT THE ROLL (3.669.2, found in review): a day's
  // first declared `exact` whose DC the GM set after the roll is declared
  // here, as TRGCheck.roll declares it when the DC is known.
  const { declaredAt } = await import("../magic/save-convert.mjs");
  const outcome = raw.declaredDegree ? declaredAt(shifted, raw.declaredDegree) : shifted;

  // Scoundrel's Luck (Rogue, 1st), for the card whose DC arrived AFTER
  // the roll: the refund in TRGCheck.roll never fired because there was
  // no degree to read. When the GM's DC resolves this card to a failure
  // and a conviction point went on advantage for it, the refund happens
  // here — once, recorded on the card's own state.
  if (!raw.scoundrelRefunded &&
    raw.modifiers.some((m) => m.label === "Conviction: Advantage")) {
    const rogue = await cardActor(raw);
    const { roguishSkillPicks, scoundrelsLuckBonus, scoundrelsLuckRefund } =
      await import("../rogue.mjs");
    if (rogue && scoundrelsLuckRefund({
      hasAbility: scoundrelsLuckBonus(rogue) > 0,
      advantageSpent: true,
      checkType: raw.type,
      subject: raw.subject ?? "",
      picks: roguishSkillPicks(rogue),
      degree: outcome.degree?.key ?? ""
    })) {
      const { awardConviction } = await import("../conviction.mjs");
      await awardConviction(rogue, 1);
      await rogue.unsetFlag(SYSTEM_ID, "convictionSpent");
      raw.scoundrelRefunded = true;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: rogue }),
        content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${rogue.name}</span><h3>Scoundrel's Luck</h3></div></header><p style="margin:2px 0">The check failed — the conviction point spent on advantage is refunded, and does not count as this round's spend.</p></div>`
      });
    }
  }

  // A DECLARED REFUND ON A GOOD RESULT (3.669.0; Inner Tempest's Adaptive
  // Mind), for the card whose DC arrived after the roll or whose Conviction
  // die lifted it to a success. Once per card. See conviction-refund.mjs.
  if (!raw.convictionRefunded && !raw.scoundrelRefunded &&
    raw.modifiers.some((m) => m.label === "Conviction: Advantage")) {
    const owner = await cardActor(raw);
    const { convictionRefundRow, convictionRefundLine } = await import("../conviction-refund.mjs");
    const refund = owner ? convictionRefundRow(owner.items, { checkType: raw.type, subject: raw.subject ?? "", degree: outcome.degree?.key ?? "" }) : null;
    if (refund) {
      const { awardConviction } = await import("../conviction.mjs");
      await awardConviction(owner, 1);
      await owner.unsetFlag(SYSTEM_ID, "convictionSpent");
      raw.convictionRefunded = true;
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: owner }),
        content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${owner.name}</span><h3>${refund.label}</h3></div></header><p style="margin:2px 0">${convictionRefundLine(refund.label)}</p></div>`
      });
    }
  }

  const actor = await cardActor(raw);
  const conviction = actor ? getConvictionState(actor) : null;
  const bonusEligible =
    !raw.flat &&
    !raw.bonusUsed &&
    // LUCK OR CONVICTION, NOT BOTH (3.624.0, block 40's R12).
    !raw.luckUsed &&
    // NOR ON A DEGREE DECLARED WITHOUT THE ROLL (3.669.2).
    !raw.declaredDegree &&
    CONVICTION_SPENDS.bonus.checkTypes.includes(raw.type) &&
    Boolean(conviction?.ok);

  const difficulty = DIFFICULTY_BY_KEY[raw.difficulty];

  const cardData = {
    actorName: raw.actorName,
    label: raw.label,
    subtitle: raw.subtitle,
    type: raw.type,
    flat: raw.flat,
    ...raw.diceDisplay,
    difficulty:
      difficulty && raw.difficulty !== "medium" ? difficulty.label : null,
    ...buildOutcomeDisplay(outcome, {
      suppressDegree: raw.suppressDegree,
      bonusCheck: raw.bonusCheck,
      // RE-RENDERED FROM THE FLAG (3.508.0). A card rebuilt after a held
      // bonus or a late DC must name the same banner it named before, so
      // the declared list is read back rather than looked up again.
      declaredOutcomes: raw.declaredOutcomes
    }),
    showDCInput: !raw.suppressDegree && outcome.dc === null,
    bonusEligible,
    bonusPointsRemaining: conviction?.value ?? 0,
    bonusUsed: raw.bonusUsed
  };

  const content = await renderTemplateCompat(CARD_TEMPLATE, cardData);

  // A Roll added after the message was first created (the Bonus d6).
  // Dice So Nice 4 hooked only message creation, so the die had to be shown
  // by hand. Dice So Nice 5 also animates rolls an UPDATE adds — shown by
  // hand as well, the die rolled twice on screen (3.645.0, F1 of Graham's
  // 14 October session). Shown here only when the module will not.
  if (extraRoll && game.dice3d && !diceSoNiceAnimatesUpdates()) {
    await game.dice3d.showForRoll(extraRoll, game.user, true);
  }

  await message.update({
    content,
    rolls: extraRoll ? [...message.rolls, extraRoll] : message.rolls,
    [`flags.${SYSTEM_ID}.checkCard`]: raw,
    [`flags.${SYSTEM_ID}.check.degree`]: outcome.degree?.key ?? null,
    [`flags.${SYSTEM_ID}.check.total`]: outcome.total,
    [`flags.${SYSTEM_ID}.check.dc`]: outcome.dc,
    [`flags.${SYSTEM_ID}.check.margin`]: outcome.margin,
    [`flags.${SYSTEM_ID}.check.bonusCheck`]: outcome.bonusCheck
  });
}

async function onAddBonus(message, raw) {
  if (raw.bonusUsed) return;
  // Dice nobody reads take no +1d6 (3.669.2).
  if (raw.declaredDegree) return;
  if (raw.luckUsed) {
    ui.notifications.warn("Luck already affects this check — only one of Luck and Conviction may (Appendix 5).");
    return;
  }

  const actor = await cardActor(raw);
  if (!actor) return;

  if (!(game.user.isGM || actor.isOwner)) {
    ui.notifications.warn(
      "Only this character's owner or the GM can spend their conviction."
    );
    return;
  }

  const state = getConvictionState(actor);
  if (!state.ok) {
    ui.notifications.warn(state.reason || "No conviction point available.");
    return;
  }

  // Defense in depth against the duplicate-listener class of bug
  // fixed in registerCheckCardListeners: re-reads the message's own
  // current, live flag state immediately before rolling, rather than
  // trusting only the cloned snapshot passed in — that snapshot was
  // taken at click time and could still be stale in a genuine race.
  if (message.getFlag(SYSTEM_ID, "checkCard")?.bonusUsed) return;

  const roll = await new Roll("1d6").evaluate();
  raw.modifiers = [
    ...raw.modifiers,
    { label: "Conviction (+1d6)", value: roll.total, type: "untyped" }
  ];
  raw.bonusUsed = true;

  await markConvictionSpent(actor);
  await recomputeAndUpdate(message, raw, { extraRoll: roll });
  // LUCK OF HEROES (3.619.0, R8): the Bonus is one of its two spends.
  const { luckOfHeroes } = await import("../conviction.mjs");
  await luckOfHeroes(actor, "bonus");
}

async function onSetDC(message, raw, dcValue) {
  if (!game.user.isGM) {
    ui.notifications.warn("Only the GM can set a DC after the fact.");
    return;
  }

  const parsed = parseEnteredDC(dcValue);
  if (parsed === null) {
    ui.notifications.warn("Enter a numeric DC first.");
    return;
  }

  // A RARE OR UNCOMMON TARGET RAISES THE GM'S LATE DC TOO (3.622.1; the
  // 3.622.0 drive's F2, Graham's R2). The raise was stored with the pending
  // outcome at the roll, and the subtitle says so. The base subtitle is kept
  // so that a corrected DC does not stack a second note.
  const { lateSetDC } = await import("../trait-rules.mjs");
  const late = lateSetDC(parsed, raw.pendingOutcome?.rarityRaise ?? null);
  raw.baseDC = late.dc;
  if (late.note) {
    raw.subtitleBeforeDC = raw.subtitleBeforeDC ?? raw.subtitle ?? "";
    raw.subtitle = `${raw.subtitleBeforeDC} — DC ${parsed} ${late.note}`;
  }

  // THE DEGREE IS ONLY HALF OF IT (3.423.0).
  //
  // Until now this set the DC, recomputed the degree, re-rendered, and
  // stopped — so the card could end up reading "Heroic — exceeds DC by
  // 21" over an action that had applied nothing whatever. Graham found
  // it through Study Target on 3.421.0: a studied target could never be
  // recorded, because the only code that records one runs at the moment
  // of the roll, and at that moment there was no degree.
  //
  // The precedent was already here. Scoundrel's Luck's refund (see
  // recomputeAndUpdate above) exists for exactly this case — "the card
  // whose DC arrived AFTER the roll" — and was solved once, for one
  // feature. This is the general form.
  //
  // ORDER MATTERS: the outcome runs BEFORE the re-render, so that a
  // branch which writes to the actor has done so by the time the player
  // sees the degree that caused it. And it runs ONCE — the flag is
  // stamped `applied` either way, so a GM correcting a DC they mistyped
  // does not hand out a second studied target.
  const pending = raw.pendingOutcome;
  if (pending && !pending.applied) {
    const outcome = buildOutcome({
      dieTotal: raw.dieTotal,
      modifiers: raw.modifiers,
      dc: computeDC(raw),
      chaos: raw.chaosArg,
      auto: raw.autoArg
    });
    const { resumeActionOutcome } = await import("../combat/action-workflow.mjs");
    // …and the held-over outcome reads the declared degree (3.669.2).
    const { declaredAt } = await import("../magic/save-convert.mjs");
    const read = raw.declaredDegree ? declaredAt(outcome, raw.declaredDegree) : outcome;
    await resumeActionOutcome(
      pending, read.degree?.key ?? null, read.margin ?? null
    );
    raw.pendingOutcome = { ...pending, applied: true };
  }

  await recomputeAndUpdate(message, raw);
}

/*
 * VITAL BEACON — a use of a pool that wears out.
 *
 * THE BUTTON EXISTS BECAUSE THE SPELL IS USED, NOT CAST. "Once per
 * round, either you or an ally can use an Interact action to touch you
 * and regain HP" — the casting is a minute long and happens once, and
 * every heal after that is somebody walking up to the caster. A beacon
 * with no way to touch it would be a spell that did nothing, which is
 * what it did before 3.470.0.
 *
 * THE STATE LIVES ON THE CASTER, not on the card. "You can have only one
 * vital beacon active at a time" is a fact about the caster, and a
 * second cast must replace the first rather than give them two pools —
 * which is exactly what per-card state would have done.
 */
/*
 * AN ESCAPE ATTEMPT — Flame Prison and Force Prison.
 *
 * PRESSED, NOT PROMPTED. Graham's ruling of 2 September 2026: escaping
 * is a choice, and a prompt every turn spends the prisoner's attention
 * whether or not they meant to make it. A Fumble leaves them caged and
 * the button stays live, so the next attempt is another press.
 *
 * THE CAGE IS READ FROM THE PRISONER, not from the card, and it carries
 * the ladder and DC AS THEY WERE AT CAST TIME — see the applier.
 */
async function onAttemptPrisonEscape(prisonerUuid) {
  const prisoner = await fromUuid(String(prisonerUuid ?? "")).catch(() => null);
  if (!prisoner) return;

  const cage = prisoner.getFlag(SYSTEM_ID, PRISON_FLAG) ?? null;
  const spec = normalisePrison(cage?.spec ? { kind: "prison", ...cage.spec } : null);
  if (!spec) {
    await ChatMessage.create({
      content: `<div class="trg-prime trg-card"><p>${prisonRefusal("they are not caged")}</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor: prisoner })
    });
    return;
  }

  const saveDC = Number(cage.saveDC) || 0;
  // IMPORTED HERE rather than at the top, matching the other workflow
  // imports in this file — check.mjs is already a static import for
  // buildOutcomeDisplay, and this keeps the roller beside its one use.
  const { TRGCheck } = await import("./check.mjs");
  const check = await TRGCheck.roll({
    actor: prisoner,
    label: `${prisoner.name} — ${spec.save} Save`,
    subtitle: `to escape ${cage.spellName ?? spec.label} — DC ${saveDC}`,
    type: "save",
    save: spec.save.toLowerCase(),
    dc: saveDC
  });
  const rolled = check?.outcome?.degree?.key ?? "failure";
  const degree = prisonDegree(rolled);
  const outcome = prisonOutcome(spec, degree);
  if (!outcome) return;

  const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
  const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
  const roll = await new Roll(outcome.dice).evaluate();
  const packet = resolveAgainstDefences(prisoner.system ?? {}, {
    amount: roll.total,
    type: spec.damageType,
    creatureTypeSystem: ownedCreatureTypeSystem(prisoner)
  });
  if (packet.taken > 0) await applyDamageAndCheckDying(prisoner, packet.taken);

  const lines = [prisonAttemptLine(
    spec, prisoner.name, rolled, packet.taken, roll.total, outcome)];

  // THE CRITICAL IS ROLLED ON THE SPELL'S OWN DAMAGE TYPE — "a Minor
  // Fire critical" — through the same door every other critical in the
  // system goes through.
  if (outcome.severity) {
    const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
    await rollCriticalInjury(prisoner, {
      damageType: spec.damageType,
      severity: outcome.severity,
      attackBonus: 0
    });
  }

  // OUT, OR STILL IN. Only the marker's removal ends the cage; the
  // damage above is charged either way.
  if (outcome.escapes) await prisoner.unsetFlag(SYSTEM_ID, PRISON_FLAG);
  lines.push(prisonEscapeLine(spec, prisoner.name, outcome.escapes));

  await ChatMessage.create({
    content: `<div class="trg-prime trg-card">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`,
    speaker: ChatMessage.getSpeaker({ actor: prisoner })
  });
}

async function onTouchVitalBeacon(casterUuid) {
  // RESOLVED BY UUID, which for a synthetic actor names the token and
  // not the sheet behind it — see module/actor-handle.mjs and the defect
  // that file exists for.
  const caster = await fromUuid(String(casterUuid ?? "")).catch(() => null);
  if (!caster) return;

  const round = game.combat?.started ? game.combat.round : null;
  const state = normaliseBeacon(caster.getFlag(SYSTEM_ID, BEACON_FLAG));
  const available = beaconAvailable(state, round);
  if (!available.ok) {
    await ChatMessage.create({
      content: `<div class="trg-prime trg-card"><p>${beaconRefusal(available.why)}</p></div>`,
      speaker: ChatMessage.getSpeaker({ actor: caster })
    });
    return;
  }

  // WHO IS TOUCHING IT. The targeted token if there is one, else the
  // caster — "either you or an ally", and the ally is named by the
  // ordinary targeting the rest of the system uses.
  const patientToken = game.user.targets?.first?.() ?? null;
  const patient = patientToken?.actor ?? caster;

  const formula = beaconFormula(state);
  const roll = await new Roll(formula).evaluate();
  const hp = patient.system?.resources?.hp ?? {};
  const before = Number(hp.value) || 0;
  const max = Number(hp.max) || 0;
  const healed = Math.min(Math.max(0, roll.total), Math.max(0, max - before));
  if (healed > 0) await patient.update({ "system.resources.hp.value": before + healed });

  let bleedNote = "";
  // THE +4 PP OPTION IS READ FROM THE BEACON ITSELF, since the state is
  // what the cast wrote and the button knows only who cast it.
  const stopped = beaconBleedStopped(state, Boolean(caster.getFlag(SYSTEM_ID, BEACON_FLAG)?.stopsBleeding));
  if (stopped > 0) {
    const current = Number(patient.getConditionValue?.("bleeding") ?? 0);
    if (current > 0) {
      const next = Math.max(0, current - stopped);
      await patient.toggleStatusEffect("bleeding", { active: next > 0, value: next || undefined });
      bleedNote = ` Bleeding <strong>${current}</strong> &rarr; <strong>${next}</strong>.`;
    }
  }

  const after = beaconAfterUse(state, round);
  await caster.setFlag(SYSTEM_ID, BEACON_FLAG, after);

  const lines = [beaconLine(patient.name, healed, formula, roll.total, bleedNote)];
  // "AFTER HEALING 4d4, THE SPELL ENDS" — the last die IS rolled and IS
  // applied, and the spell ends afterwards. Five uses, not four.
  /*
   * THE SPENT BEACON IS KEPT, NOT REMOVED (fixed 3.471.0).
   *
   * 3.470.0 called `unsetFlag` here, and driving it in Graham's world
   * showed what that means: the sixth touch healed 4d12 again. Absence of
   * the flag is indistinguishable from a FRESH beacon —
   * `normaliseBeacon(null)` returns `{dice: 4, used: 0}`, which is
   * exactly right for a spell just cast and exactly wrong for one just
   * spent. The beacon was infinite, and the card said "its last light is
   * spent" immediately before proving otherwise.
   *
   * SO THE SPENT STATE STAYS and keeps refusing. A new cast overwrites it
   * with `used: 0`, which is what ends it properly — the spell ending is
   * a fact about this beacon, not about whether a flag exists.
   */
  if (beaconExhausted(after)) lines.push(beaconEndsLine());
  await ChatMessage.create({
    content: `<div class="trg-prime trg-card">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`,
    speaker: ChatMessage.getSpeaker({ actor: caster })
  });
}

async function onApplyMedicineEffect(message, raw) {
  if (raw.applied) return;

  // THE HANDLE FIRST, THE BARE ID ONLY AS A FALLBACK (3.469.0).
  //
  // `game.actors.get(raw.targetActorId)` returns the SIDEBAR SHEET for an
  // unlinked token, so a Treat Wounds heal landed there while the wounded
  // token kept its wound — and the card named the right creature
  // throughout. Cards written before this version carry no handle and
  // still resolve by id, which is the old behaviour and is said out loud
  // rather than silently trusted. See module/actor-handle.mjs.
  const target = (await resolveActorHandle(raw.handle))
    ?? (raw.targetActorId ? game.actors.get(raw.targetActorId) : null);
  if (!target) return;

  // THE REFUSAL THAT BROKE TREAT WOUNDS. This gate was written before
  // the GM relay existed, and it is the reason a healer could not heal
  // anybody but themselves: a player pressing "Heal 8 HP" on an ally
  // they do not own got a warning and nothing else. Graham reported it
  // from a live session on 19 August 2026.
  //
  // The permission fact is unchanged — a player still cannot write to
  // that actor. What changes is what happens next: the write is asked of
  // the GM's client instead of refused outright, exactly as damage is.
  if (!(game.user.isGM || target.isOwner)) {
    const { relayMedicine } = await import("../combat/target-relay-workflow.mjs");
    const relayed = await relayMedicine(target, raw, () => applyMedicineOutcome(target, raw));
    if (relayed) await message.setFlag(SYSTEM_ID, "healCard", { ...raw, applied: true });
    return;
  }

  await applyMedicineOutcome(target, raw);
  await applyExtraHealTargets(raw);
  await message.setFlag(SYSTEM_ID, "healCard", { ...raw, applied: true });
}

/**
 * Treat Wounds' bought additional targets (page 87), healed through the
 * same rules as the first.
 *
 * NEW at 3.559.0 with the trade-off itself. "For every 5 that you
 * increase the DC you may heal an additional target" was printed in the
 * action's own description and reachable nowhere.
 *
 * THE SAME `applyMedicineOutcome` AND THE SAME RELAY, per target. The
 * alternative was a second healing path, which would have been a second
 * copy of the Dying recovery and the unconscious clear — the shape this
 * file's own comment warns about two functions above.
 *
 * ONE FAILURE DOES NOT STOP THE REST: a target whose token has since been
 * deleted is skipped, because the other patients were paid for too.
 */
async function applyExtraHealTargets(raw) {
  for (const entry of raw?.alsoHeal ?? []) {
    const extra = (await resolveActorHandle(entry.handle))
      ?? (entry.targetActorId ? game.actors.get(entry.targetActorId) : null);
    if (!extra) continue;
    // The same permission question, asked per creature: a healer may own
    // one patient and not the next.
    if (!(game.user.isGM || extra.isOwner)) {
      const { relayMedicine } = await import("../combat/target-relay-workflow.mjs");
      await relayMedicine(extra, raw, () => applyMedicineOutcome(extra, raw));
      continue;
    }
    await applyMedicineOutcome(extra, raw);
  }
}

/**
 * The healing itself, once the permission question is settled.
 *
 * Split out so the GM's client can run the SAME rules when it carries a
 * relayed request — the alternative was a second copy of the Dying and
 * Unconscious handling living in the relay, which is exactly how two
 * versions of a rule start to disagree.
 */
export async function applyMedicineOutcome(target, raw) {
  const { applyDyingRecovery, clearUnconsciousIfConscious, healingWhileDying } =
    await import("../combat/death-state.mjs");

  if (raw.kind === "reduceCondition") {
    const current = target.getConditionValue?.(raw.conditionKey) ?? 0;
    const { conditionFloorFor } = await import("../magic/emanation-workflow.mjs");
    const floor = conditionFloorFor(target, raw.conditionKey);
    const newValue = Math.max(0, Math.max(current - Number(raw.amount ?? 0), floor));
    if (newValue > 0) {
      await target.toggleStatusEffect(raw.conditionKey, { value: newValue });
    } else if (raw.conditionKey === "dying") {
      // Dying reduced to 0 is a RECOVERY, not merely the condition being
      // switched off — Graham, 13 Aug 2026: the character remains at 0 HP
      // and Unconscious, and gains a point of Fatigue. This is the path
      // Resuscitation (Medicine) takes, and it used to leave the target in
      // the same stateless limbo the turn-start recovery did.
      await applyDyingRecovery(target);
    } else {
      await target.toggleStatusEffect(raw.conditionKey, { active: false });
    }
  } else if (raw.kind === "increaseCondition") {
    // A FAILED STABILISATION (3.549.0). Resuscitation's Fumble and
    // Blunder raise the patient's Dying, and Chapter 1's Death State
    // entry names that as one of the four moments the threshold is
    // tested: "they die immediately if their Dying value ever becomes
    // greater than their Death State".
    //
    // ROUTED THROUGH `applyDyingChange`, not through a bare toggle, so
    // the threshold is applied by the same function every other Dying
    // path uses. Doomed reduces the effective Death State here exactly
    // as it does on the turn-start check — a bare toggle would have
    // been a third place that decides when somebody dies.
    const current = Number(target.getConditionValue?.(raw.conditionKey) ?? 0);
    const amount = Math.max(0, Math.trunc(Number(raw.amount ?? 0)));
    if (raw.conditionKey !== "dying") {
      await target.toggleStatusEffect(raw.conditionKey, { value: current + amount });
      return true;
    }
    const { applyDyingChange, effectiveDeathState } =
      await import("../combat/turn-economy.mjs");
    const { reapDead } = await import("../combat/death-state.mjs");
    const deathState = effectiveDeathState(
      target.system?.combat?.deathState ?? 5,
      target.getConditionValue?.("doomed") ?? 0
    );
    const result = applyDyingChange({ dying: current, delta: amount, deathState });
    await target.toggleStatusEffect("dying", { value: result.dying });
    if (result.dead) {
      // Skull on, out of the initiative order — the same reaping every
      // other death path performs, so this one cannot be the exception
      // that leaves a corpse taking turns.
      await reapDead(target);
      ui.notifications.warn(
        `${target.name} dies — Dying ${result.dying} exceeds a Death State of ${deathState}.`
      );
    }
  } else {
    const hp = target.system?.resources?.hp;
    if (!hp) return;
    // Treat Wounds, First Aid, Battle Medic — the Medicine skill, which is
    // NON-MAGICAL healing and so "has no effect on you" while the target is
    // Dying. Resuscitation is the named exception, and it does not come
    // through here: it is a reduceCondition card, handled above.
    const rule = healingWhileDying({
      dying: Boolean(target.hasCondition?.("dying")),
      magical: false
    });
    if (!rule.healsHP) {
      ui.notifications.info(
        `${target.name} is Dying — non-magical healing has no effect. Use the Resuscitation (Medicine) action.`
      );
      return;
    }
    const before = Number(hp.value ?? 0);
    const newValue = Math.min(Number(hp.max ?? 0), before + Number(raw.amount ?? 0));
    await target.update({ "system.resources.hp.value": newValue });
    if (newValue > 0 && before <= 0) await clearUnconsciousIfConscious(target);
  }
  return true;
}

/**
 * Unbreakable Resolve (Fighter, 9th): "Once per day, when you fail a
 * Fortitude, Reflex, or Will saving throw, you may reroll the saving
 * throw. You must use the second result."
 *
 * The button lives on the FAILED SAVE'S OWN CARD — the moment the rule
 * fires is the moment the player is looking at the failure — and is
 * INJECTED at render time rather than baked into the template, because
 * whether it should exist depends on live state the stored HTML cannot
 * know: does this viewer own the actor, does the actor hold the ability,
 * do uses remain today, has this card already been rerolled. A save
 * rolled with no DC grows the button the moment the GM sets one and the
 * degree resolves to a failure, for free, because setting the DC
 * re-renders the card.
 *
 * The reroll itself is a fresh TRGCheck from the card's stored inputs —
 * the same modifiers and DC the original rolled, minus a spent
 * Conviction d6 (that point bought the FIRST roll's die, not this one)
 * — with conditionals marked resolved so automatic entries are not
 * applied a second time on top of themselves.
 */
/**
 * A NATURAL 20 REGAINS 1 LUCK — "whilst in a situation that the GM deems
 * strenuous" (3.624.0, block 40's R15). The GM's call, so the button is
 * the GM's: shown to the GM only, on a check whose chosen die shows an
 * unmodified 20, once.
 */
async function maybeAddLuckAward(message, html) {
  if (!game.user?.isGM) return;
  const raw = message.getFlag(SYSTEM_ID, "checkCard");
  if (!raw) return;
  const { naturalTwentyOffersLuck } = await import("../luck.mjs");
  const chosen = (raw.diceDisplay?.chains ?? []).find((c) => c.chosen) ?? raw.diceDisplay?.chains?.[0];
  const enabled = Boolean(game.settings.get(SYSTEM_ID, "enableLuck"));
  if (!naturalTwentyOffersLuck({
    enabled, checkType: raw.type, flat: raw.flat, unmodified: chosen?.faces?.[0]?.face,
    awarded: Boolean(message.getFlag(SYSTEM_ID, "luckAwarded"))
  })) return;
  const actor = await cardActor(raw);
  if (!actor || actor.type !== "character") return;
  const card = html.querySelector?.(".trg-check-card");
  if (!card) return;
  let button = card.querySelector('[data-action="awardLuck"]');
  if (!button) {
    const container = document.createElement("div");
    container.className = "conviction-bonus-control";
    container.innerHTML =
      `<button type="button" data-action="awardLuck" class="gold-button small-button">` +
      `<i class="fa-solid fa-clover"></i> Natural 20 — award 1 luck (GM: if strenuous)</button>`;
    card.appendChild(container);
    button = container.querySelector("button");
  }
  bindOnce(button, "click", async (event) => {
    event.preventDefault();
    if (message.getFlag(SYSTEM_ID, "luckAwarded")) return;
    button.disabled = true;
    await message.setFlag(SYSTEM_ID, "luckAwarded", true);
    const { awardLuck } = await import("../luck-workflow.mjs");
    await awardLuck(actor, "A natural 20 in a strenuous situation");
  });
}

async function maybeAddUnbreakableReroll(message, html) {
  const raw = message.getFlag(SYSTEM_ID, "checkCard");
  if (!raw || raw.type !== "save") return;
  // A CHECK LUCK HAS CHANGED IS NOT REROLLED (3.624.0, R12): "you may only
  // apply a fortune effect to a check once".
  if (raw.luckUsed) return;
  const degree = message.getFlag(SYSTEM_ID, "check")?.degree;
  if (!UNBREAKABLE_TRIGGER_DEGREES.includes(degree)) return;
  if (message.getFlag(SYSTEM_ID, "unbreakableRerolled")) return;

  const actor = await cardActor(raw);
  if (!actor) return;
  if (!(game.user.isGM || actor.isOwner)) return;

  const ability = Array.from(actor.items ?? []).find(
    (i) => i.type === "ability" &&
      String(i.name).trim().toLowerCase() === "unbreakable resolve"
  );
  if (!ability) return;

  const { itemUsesRemaining } = await import("../uses-workflow.mjs");
  const remaining = itemUsesRemaining(ability);
  if (!(remaining > 0)) return;

  const card = html.querySelector?.(".trg-check-card");
  if (!card) return;
  let button = card.querySelector('[data-action="unbreakableReroll"]');
  if (!button) {
    const container = document.createElement("div");
    container.className = "conviction-bonus-control";
    container.innerHTML =
      `<button type="button" data-action="unbreakableReroll" class="gold-button small-button">` +
      `<i class="fa-solid fa-rotate-right"></i> Unbreakable Resolve &mdash; reroll (${remaining} left today)</button>`;
    card.appendChild(container);
    button = container.querySelector("button");
  }

  bindOnce(button, "click", async (event) => {
    event.preventDefault();
    if (message.getFlag(SYSTEM_ID, "unbreakableRerolled")) return;
    const uses = itemUsesRemaining(ability);
    if (!(uses > 0)) {
      ui.notifications.warn("Unbreakable Resolve: no uses remain today.");
      return;
    }
    button.disabled = true;
    try {
      await ability.update({ "system.usesValue": uses - 1 });
      // Mark BEFORE rolling — a second click racing the roll must lose.
      await message.setFlag(SYSTEM_ID, "unbreakableRerolled", true);

      const { TRGCheck } = await import("./check.mjs");
      const check = await TRGCheck.roll({
        actor,
        label: raw.label,
        subtitle: "Unbreakable Resolve — reroll",
        type: "save",
        dc: raw.baseDC,
        difficulty: raw.difficulty,
        suppressDegree: raw.suppressDegree,
        modifiers: raw.modifiers.filter((m) => m.label !== "Conviction (+1d6)"),
        conditionalsResolved: true,
        // ONE TRIGGER, ONE ANSWER. This is the SAME save thrown again, not a
        // new one, so the save-advantage family must not be offered a second
        // time — the reaction was already spent (or declined) on the first
        // throw, and its modifier rides along in `raw.modifiers` so the
        // reroll keeps whatever the original bought.
        subject: raw.subject ?? "",
        saveReactionResolved: true,
        toMessage: false
      });

      // "At 19th level, if the second result is a Partial, you may
      // treat it as a Success."
      const level = Number(actor.system?.identity?.level ?? 0);
      const lines = ["You must use this second result, even if worse."];
      if (check.outcome?.degree?.key === "partial" &&
        unbreakableResolvePartialToSuccess(level)) {
        check.outcome.degree = DEGREE_BY_KEY.success;
        lines.push("Unbreakable Resolve (19th): the rerolled Partial is treated as a Success.");
      }
      check.extraDetailLines = [...(check.extraDetailLines ?? []), ...lines];
      await check.toMessage();
    } catch (err) {
      button.disabled = false;
      throw err;
    }
  });
}

/**
 * Devotion (Crusader, 1st): "Trigger: You fumble a check with either a
 * class skill or favoured weapon attack. ...you may expend 2 PP treat
 * the check as a failure."
 *
 * This function is the SKILL-CHECK half only — a fumbled/blundered
 * class-skill check's own card grows the button, mirroring
 * maybeAddUnbreakableReroll's shape exactly (injected at render time,
 * since whether it belongs depends on live state: ownership, whether
 * the actor holds Devotion, whether 2 PP remain, whether this card
 * already spent it). The favoured-weapon-attack half is a different
 * fumble mechanism entirely (rollFumbleCheck's flat DC check, not this
 * degrees-table card) and is wired separately in attack-workflow.mjs.
 *
 * Spending downgrades Fumble/Blunder to a plain Failure in place, via
 * the same recomputeAndUpdate + buildOutcome `auto` override the
 * Bonus-die and GM-DC controls already use — "treat the check as a
 * failure" is exactly what `auto: "failure"` does.
 */
async function maybeAddDevotionDowngrade(message, html) {
  const raw = message.getFlag(SYSTEM_ID, "checkCard");
  if (!raw || raw.type !== "skill") return;
  const degree = message.getFlag(SYSTEM_ID, "check")?.degree;
  if (message.getFlag(SYSTEM_ID, "devotionSpent")) return;

  const actor = await cardActor(raw);
  if (!actor) return;
  if (!(game.user.isGM || actor.isOwner)) return;

  const isClassSkill = Boolean(actor.system?.skills?.[raw.subject]?.isClassSkill);
  if (!devotionSkillTrigger({ actor, checkType: raw.type, degree, isClassSkill })) return;

  const ppRemaining = Number(actor.system?.resources?.pp?.value ?? 0);
  if (!(ppRemaining >= DEVOTION_PP_COST)) return;

  const card = html.querySelector?.(".trg-check-card");
  if (!card) return;
  let button = card.querySelector('[data-action="devotionDowngrade"]');
  if (!button) {
    const container = document.createElement("div");
    container.className = "conviction-bonus-control";
    container.innerHTML =
      `<button type="button" data-action="devotionDowngrade" class="gold-button small-button">` +
      `<i class="fa-solid fa-hand-holding-heart"></i> Devotion &mdash; spend ${DEVOTION_PP_COST} PP, treat as a failure</button>`;
    card.appendChild(container);
    button = container.querySelector("button");
  }

  bindOnce(button, "click", async (event) => {
    event.preventDefault();
    if (message.getFlag(SYSTEM_ID, "devotionSpent")) return;
    const pp = actor.system?.resources?.pp;
    const remaining = Number(pp?.value ?? 0);
    if (!(remaining >= DEVOTION_PP_COST)) {
      ui.notifications.warn("Devotion: not enough PP remaining.");
      return;
    }
    button.disabled = true;
    try {
      // Mark BEFORE spending — a second click racing the update must lose.
      await message.setFlag(SYSTEM_ID, "devotionSpent", true);
      await actor.update({ "system.resources.pp.value": remaining - DEVOTION_PP_COST });

      const updated = foundry.utils.deepClone(raw);
      updated.autoArg = "failure";
      await recomputeAndUpdate(message, updated);
    } catch (err) {
      button.disabled = false;
      throw err;
    }
  });
}

/*
 * NO CUTTING WORDS BUTTON HERE ANY MORE (3.432.0).
 *
 * It used to be drawn on the triggering check's own card, so the penalty
 * landed on the roll it belonged to. Graham replaced that design on
 * 28 August 2026: "It should be triggered only by the caster of the
 * spell. After an attack or skill check has been announced (nothing
 * mechanical here just talk at the table), the player with the spell
 * would cast the spell and select an eligible target."
 *
 * It was also broken in a way worth recording. The button needed the
 * roller's TOKEN, found through `activeToken` — which asked Foundry for
 * LINKED tokens only, so it answered nothing for every monster in the
 * game and the offer appeared solely on player cards. That is the whole
 * of the report: "it just seems to leave a log on the chat card for a
 * friendly player."
 *
 * The spell now waits on its target and is spent by their next attack or
 * skill check; see magic/cutting-words-workflow.mjs and the consumption
 * point in dice/check.mjs.
 */

/**
 * Natural Defence — offered on the caster's own save card.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SAME DESIGN AS CUTTING WORDS ABOVE, and simpler in every way that
 * matters: the trigger is the roller's OWN saving throw, so there is no
 * target to set, no distance to measure, and only one actor who could
 * ever press the button.
 *
 * GRAHAM'S RULING, 25 August 2026, on why it is here and not at the
 * pre-roll save-reaction seam: Evasion, Juggernaut and Resolve all say
 * "you attempt a save, BEFORE YOU ROLL", and Natural Defence says only
 * "you make saving throw". The clause that forces the others into a
 * blind spend is the clause this spell omits.
 *
 * ELIGIBILITY IS CHECKED TWICE, exactly as Cutting Words does — once to
 * decide whether the button appears at all, and again inside the click,
 * because the reaction it costs can be spent between the card being
 * drawn and the button being pressed.
 */
async function maybeAddNaturalDefence(message, html) {
  const raw = message.getFlag(SYSTEM_ID, "checkCard");
  if (!raw) return;

  const { naturalDefenceTriggers } = await import("../magic/natural-defence.mjs");
  if (!naturalDefenceTriggers(raw.type)) return;

  const roller = await cardActor(raw);
  if (!roller?.isOwner) return;

  const { naturalDefenceOffer, resolveNaturalDefence } =
    await import("../magic/natural-defence-workflow.mjs");
  const offer = naturalDefenceOffer(roller);
  if (!offer.eligible) return;

  const card = html.querySelector?.(".trg-check-card");
  if (!card) return;

  const selector = `[data-action="naturalDefence"]`;
  let button = card.querySelector(selector);
  if (!button) {
    const container = document.createElement("div");
    container.className = "conviction-bonus-control";
    container.innerHTML =
      `<button type="button" data-action="naturalDefence" class="gold-button small-button">`
      + `<i class="fa-solid fa-leaf"></i> Natural Defence &mdash; +${offer.bonus} (Reaction)</button>`;
    card.appendChild(container);
    button = container.querySelector("button");
  }

  bindOnce(button, "click", async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      const result = await resolveNaturalDefence(roller);
      if (!result?.cast) {
        // The cast was refused — no free hand for the somatic component,
        // a trait gate, Rage. `castSpell` has already said why; the
        // button comes back so the player can try again once it is fixed.
        button.disabled = false;
        return;
      }

      const { naturalDefenceModifier, naturalDefenceResult } =
        await import("../magic/natural-defence.mjs");
      const current = message.getFlag(SYSTEM_ID, "checkCard");
      // READ EITHER SIDE OF THE RECOMPUTE. This is a RESISTANCE bonus and
      // Appendix 1 takes the best of a type rather than summing, so a
      // character already carrying a larger resistance bonus gains
      // nothing — and a card that reported the printed +1 as though it
      // had landed would be lying. Cutting Words learned this first, for
      // circumstance penalties.
      const before = message.getFlag(SYSTEM_ID, "check");
      const updated = foundry.utils.deepClone(current ?? raw);
      updated.modifiers = [...(updated.modifiers ?? []), naturalDefenceModifier(result.bonus)];
      await recomputeAndUpdate(message, updated);
      const after = message.getFlag(SYSTEM_ID, "check");

      const moved = naturalDefenceResult({
        total: Number(before?.total ?? 0),
        dc: before?.dc ?? null,
        gain: Number(after?.total ?? 0) - Number(before?.total ?? 0)
      });
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: roller }),
        content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${roller.name}</span><h3>Natural Defence</h3></div></header>`
          + `<p style="margin:2px 0">The spirits of long dead animals and fey grant a <strong>+${result.bonus}</strong> resistance bonus to the save`
          + (moved.applied
            ? ".</p>"
            : " &mdash; <em>a larger resistance bonus already applies, so the total does not move</em>.</p>")
          + (moved.dc === null
            ? `<p style="margin:2px 0">The save is now <strong>${moved.after}</strong>.</p>`
            : `<p style="margin:2px 0"><strong>${moved.before}</strong> becomes <strong>${moved.after}</strong> against DC ${moved.dc}`
              + (moved.turnedAside ? " &mdash; <strong>it now succeeds</strong>." : ".") + "</p>")
          + "</div>"
      });
    } catch (err) {
      button.disabled = false;
      throw err;
    }
  });
}

/**
 * Offer every HELD BONUS whose scope reaches this card.
 *
 * GENERALISED AT 3.411.0 from the Guidance-only version this replaced.
 * Guidance was built first, with its own button, its own hardcoded +1 and
 * its own hardcoded label; four PP 1 spells then turned out to share its
 * shape exactly, and four more buttons would have been five copies of one
 * idea. Guidance is now simply the first held bonus.
 *
 * SO THERE IS NO CAST HERE, and that is not the `castInnateSpell`
 * shortcut this project warns about. The cast already happened when the
 * spell was spoken; this is the holder spending what they were given,
 * which costs no action and no resource.
 *
 * ONE BUTTON PER HELD BONUS, keyed by the effect's id, so a character
 * holding two can choose which to spend rather than the engine picking.
 */
async function maybeAddHeldBonuses(message, html) {
  const raw = message.getFlag(SYSTEM_ID, "checkCard");
  if (!raw) return;

  const roller = await cardActor(raw);
  if (!roller?.isOwner) return;

  const card = html.querySelector?.(".trg-check-card");
  if (!card) return;

  const { HELD_BONUS_FLAG, HELD_SPENT_ROUND_FLAG, normaliseHeldBonus, heldBonusMatches, heldBonusButtonLabel,
    heldRoundKey, heldOffersThisRound } = await import("../magic/held-bonus.mjs");
  const combatNow = game.combat?.started ? game.combat : null;
  const roundNow = heldRoundKey({ combatId: combatNow?.id ?? null, round: combatNow?.round ?? null, worldTime: game.time?.worldTime ?? 0 });

  const candidates = [];
  for (const effect of roller.effects ?? []) {
    if (effect?.disabled) continue;
    const spec = normaliseHeldBonus(effect.flags?.[SYSTEM_ID]?.[HELD_BONUS_FLAG]);
    if (!spec) continue;
    if (!heldBonusMatches(spec, raw)) continue;
    candidates.push({ effect, spec, spentKey: effect.flags?.[SYSTEM_ID]?.[HELD_SPENT_ROUND_FLAG] ?? null });
  }
  // ALREADY USED THIS ROUND (3.612.0, R8) — Inspire Heroics' one a round —
  // AND ONE A ROUND HOWEVER MANY CASTINGS HOLD IT (3.613.0, R4).
  const held = heldOffersThisRound(candidates, roundNow);
  if (!held.length) return;

  for (const { effect, spec } of held) {
    const action = `held-bonus-${effect.id}`;
    let button = card.querySelector(`[data-action="${action}"]`);
    if (!button) {
      const container = document.createElement("div");
      container.className = "conviction-bonus-control";
      container.innerHTML =
        `<button type="button" data-action="${action}" class="gold-button small-button">`
        + `<i class="fa-solid fa-hand-sparkles"></i> ${heldBonusButtonLabel(spec)}</button>`;
      card.appendChild(container);
      button = container.querySelector("button");
    }

    bindOnce(button, "click", async (event) => {
      event.preventDefault();
      button.disabled = true;
      try {
        const { spendHeldBonus } = await import("../magic/held-bonus-workflow.mjs");
        // CHECKED BY SPENDING, not by asking first and then spending —
        // the effect can be consumed on another card between this one
        // being drawn and the button being pressed, and a check that
        // races is worse than no check.
        const spent = await spendHeldBonus(roller, effect.id);
        if (!spent) {
          button.remove();
          return;
        }

        const heldBonus = await import("../magic/held-bonus.mjs");
        const { heldBonusModifier, heldBonusResult, heldAdvantageOutcome, heldDieModifier } = heldBonus;
        const current = message.getFlag(SYSTEM_ID, "checkCard");
        const before = message.getFlag(SYSTEM_ID, "check");
        const updated = foundry.utils.deepClone(current ?? raw);
        let body = "";

        if (spec.kind === "advantage") {
          // A SECOND CHAIN, under the ORIGINAL roll's open-ended rule —
          // see held-bonus.mjs on why this compares chain totals rather
          // than bare faces.
          const { rollChain, CHAIN_PROFILES, OPEN_ENDED } = await import("./open-ended.mjs");
          // THE CARD'S OWN DIE (3.549.0), not a hard-coded d20. The
          // challenger must be the same die the original was rolled with
          // or the comparison is meaningless — see check.mjs's `die`
          // flag. A card posted before this version carries no `die`, and
          // d20 is both the old behaviour and what all but the initiative
          // card actually used, so that is the fallback.
          const die = updated.die === "d100" ? "d100" : "d20";
          const draw = async () => {
            const roll = await new Roll(`1${die}`).evaluate();
            return roll.total;
          };
          // A CARD POSTED BEFORE 3.413.0 CARRIES NO `openEnded`, so fall
          // back to BOTH — the system default and what `rollChain` would
          // have used anyway. Guessing NONE would quietly hand the
          // challenger a die that cannot explode against an original that
          // could.
          const challenger = await rollChain({
            draw,
            profile: CHAIN_PROFILES[die],
            openEnded: updated.openEnded ?? OPEN_ENDED.BOTH
          });
          const outcome = heldAdvantageOutcome({
            dieTotal: Number(updated.dieTotal ?? 0),
            rerollTotal: Number(challenger.total ?? 0),
            checkTotal: Number(before?.total ?? 0),
            dc: before?.dc ?? null
          });
          updated.dieTotal = outcome.kept;
          await recomputeAndUpdate(message, updated);
          body = `<p style="margin:2px 0">Rolled again &mdash; <strong>${outcome.rerolled}</strong> against the original <strong>${outcome.original}</strong>`
            + (outcome.improved
              ? `, and the better one stands.</p>`
              : ` &mdash; <em>the second roll was no better, so the first stands</em>.</p>`)
            + (outcome.dc === null
              ? `<p style="margin:2px 0">The check is now <strong>${outcome.after}</strong>.</p>`
              : `<p style="margin:2px 0"><strong>${outcome.before}</strong> becomes <strong>${outcome.after}</strong> against DC ${outcome.dc}`
                + (outcome.turnedAside ? " &mdash; <strong>it now succeeds</strong>." : ".") + "</p>");
        } else if (spec.kind === "die") {
          const roll = await new Roll(spec.die).evaluate();
          const modifier = heldDieModifier(spec, roll.total);
          updated.modifiers = [...(updated.modifiers ?? []), modifier];
          await recomputeAndUpdate(message, updated);
          const after = message.getFlag(SYSTEM_ID, "check");
          const moved = heldBonusResult({
            total: Number(before?.total ?? 0),
            dc: before?.dc ?? null,
            gain: Number(after?.total ?? 0) - Number(before?.total ?? 0)
          });
          body = `<p style="margin:2px 0">Rolled <strong>${spec.die}</strong> &mdash; <strong>${modifier.value}</strong>`
            + (moved.applied
              ? ", added to the check.</p>"
              : ` &mdash; <em>a larger ${spec.bonusType} bonus already applies, so the total does not move</em>.</p>`)
            + (moved.dc === null
              ? `<p style="margin:2px 0">The check is now <strong>${moved.after}</strong>.</p>`
              : `<p style="margin:2px 0"><strong>${moved.before}</strong> becomes <strong>${moved.after}</strong> against DC ${moved.dc}`
                + (moved.turnedAside ? " &mdash; <strong>it now succeeds</strong>." : ".") + "</p>");
        } else {
          updated.modifiers = [...(updated.modifiers ?? []), heldBonusModifier(spec)];
          await recomputeAndUpdate(message, updated);
          const after = message.getFlag(SYSTEM_ID, "check");
          const moved = heldBonusResult({
            total: Number(before?.total ?? 0),
            dc: before?.dc ?? null,
            gain: Number(after?.total ?? 0) - Number(before?.total ?? 0)
          });
          const sign = spec.value >= 0 ? "+" : "";
          body = `<p style="margin:2px 0">Spent &mdash; a <strong>${sign}${spec.value}</strong> ${spec.bonusType} bonus`
            + (moved.applied
              ? ".</p>"
              : ` &mdash; <em>a larger ${spec.bonusType} bonus already applies, so the total does not move</em>.</p>`)
            + (moved.dc === null
              ? `<p style="margin:2px 0">The check is now <strong>${moved.after}</strong>.</p>`
              : `<p style="margin:2px 0"><strong>${moved.before}</strong> becomes <strong>${moved.after}</strong> against DC ${moved.dc}`
                + (moved.turnedAside ? " &mdash; <strong>it now succeeds</strong>." : ".") + "</p>");
        }

        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: roller }),
          content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${roller.name}</span><h3>${spec.label}</h3></div></header>`
            + body
            + (spec.spentNote ? `<p class="hint" style="margin:2px 0">${spec.spentNote}</p>` : "")
            + "</div>"
        });
      } catch (err) {
        button.disabled = false;
        throw err;
      }
    });
  }
}

/** Register the click listeners. Call once, at system init. */
export function registerCheckCardListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    // The GM DC control is only meaningful for the GM — hide it from
    // everyone else client-side, since the stored HTML is otherwise
    // identical for every viewer.
    if (!game.user.isGM) {
      html.querySelectorAll?.(".gm-only-control").forEach((el) => {
        el.style.display = "none";
      });
    }

    // This hook fires every time a message's HTML is (re-)rendered —
    // not just on initial post, but on every subsequent
    // message.update() too, including the very updates these three
    // handlers themselves trigger. If the same button element
    // persists across those re-renders, attaching a fresh listener
    // each time stacks duplicates on it: a single click then
    // synchronously fires every stacked listener in turn, each
    // independently rolling its own dice, before any of them reaches
    // its first `await` — so the per-click `disabled = true` guard
    // inside one listener can't stop a second, already-dispatched
    // listener on the same click. This was the real cause of a
    // reported bug where a single Conviction Bonus click rolled its
    // d6 twice. bindOnce's "already bound" marker ensures at most one
    // listener per physical node regardless of how many times this
    // hook fires for it.
    // The compact card's full breakdown is shown in Foundry's global #tooltip.
    // It was previously an in-card, absolutely-positioned popup (top:100%) which
    // the chat message's overflow:hidden clipped away for the most recent
    // message — so the breakdown "could not be seen". The tooltip renders at the
    // document root, above every chat overflow, so it is never clipped; hover
    // shows it, click pins/reshows it (touch), and moving away hides it.
    const detailsIcon = html.querySelector?.(".check-details-icon");
    const detailsBody = html.querySelector?.(".check-details");
    if (detailsIcon && detailsBody) {
      const showBreakdown = () =>
        game.tooltip?.activate?.(detailsIcon, {
          html: detailsBody.innerHTML,
          direction: "UP",
          cssClass: "trg-prime trg-check-card trg-breakdown-tooltip"
        });
      bindOnce(detailsIcon, "mouseenter", showBreakdown);
      bindOnce(detailsIcon, "mouseleave", () => game.tooltip?.deactivate?.());
      bindOnce(detailsIcon, "click", (event) => {
        event.preventDefault();
        showBreakdown();
      });
    }

    const bonusButton = html.querySelector?.('[data-action="checkAddBonus"]');
    bindOnce(bonusButton, "click", async (event) => {
      event.preventDefault();
      const raw = message.getFlag(SYSTEM_ID, "checkCard");
      if (!raw || raw.bonusUsed) return;
      bonusButton.disabled = true;
      try {
        await onAddBonus(message, foundry.utils.deepClone(raw));
      } finally {
        bonusButton.disabled = false;
      }
    });

    const dcButton = html.querySelector?.('[data-action="checkSetDC"]');
    bindOnce(dcButton, "click", async (event) => {
      event.preventDefault();
      const raw = message.getFlag(SYSTEM_ID, "checkCard");
      if (!raw) return;
      const input = html.querySelector?.('[name="checkDCInput"]');
      const value = input?.value;
      dcButton.disabled = true;
      try {
        await onSetDC(message, foundry.utils.deepClone(raw), value);
      } finally {
        dcButton.disabled = false;
      }
    });

    // Ambush and Sniping: shifting a critical injury roll to a reachable
    // row. Re-reads the table at the new number through the same code
    // path that produced the original card, so persistence, conditions,
    // saves and armour damage all resolve exactly as they would have.
    //
    // Once a modification has been applied, keep the whole set visibly
    // spent on every re-render. This hook fires again on the very
    // setFlag update below, which rebuilds the card from its stored HTML
    // — HTML that still holds live-looking buttons. The applied guard
    // already makes a second click a no-op, but nothing showed that;
    // found on a live card, where the buttons re-enabled after use. So
    // the visible state is reapplied here from the persistent flag, not
    // left to the one-time DOM edits in the click handler.
    const applied = message.getFlag(SYSTEM_ID, "criticalAdjust");
    if (applied?.applied) {
      for (const button of html.querySelectorAll?.('[data-action="adjustCritical"]') ?? []) {
        button.disabled = true;
        if (Number(button.dataset.roll) === Number(applied.appliedRoll)) {
          button.innerHTML = `<span style="display:block;font-weight:bold">✓ Modified to ${applied.appliedRoll}</span>`;
        } else {
          button.style.opacity = "0.45";
        }
      }
    }

    for (const button of html.querySelectorAll?.('[data-action="adjustCritical"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "criticalAdjust");
        if (!raw || raw.applied) return;

        // HANDLES FIRST, BARE IDS ONLY FOR A CARD FROM BEFORE 3.469.0.
        const actor = (await resolveActorHandle(raw.actorHandle))
          ?? game.actors?.get(raw.actorId);
        if (!actor) return;
        const targetActor = (await resolveActorHandle(raw.targetHandle))
          ?? (raw.targetActorId ? game.actors?.get(raw.targetActorId) : null);
        const roll = Number(button.dataset.roll);

        button.disabled = true;
        try {
          const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
          await rollCriticalInjury(actor, {
            targetActor,
            damageType: raw.record.damageType,
            severity: raw.record.severity,
            attackBonus: raw.record.attackBonus,
            hasSerrated: raw.record.hasSerrated,
            forcedResult: roll
          });
          // appliedRoll lets the re-render above annotate the chosen row
          // and dim the rest, so the spent state survives every rebuild.
          await message.setFlag(SYSTEM_ID, "criticalAdjust", {
            ...raw,
            applied: true,
            appliedRoll: roll
          });
        } catch (err) {
          button.disabled = false;
          throw err;
        }
      });
    }

    // DR STOPPED A CRITICAL (3.579.0; page 192, Graham's R5 of the
    // block-19 audit). The damage card offers this when DR reduced a
    // critical hit's damage to zero: the SAME injury result, re-read on
    // the Subdual table. `forcedResult` is what makes it a re-read
    // rather than a second critical — the same mechanism Ambush and
    // Sniping use to shift a roll they already made.
    for (const button of html.querySelectorAll?.('[data-action="subdualCritical"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "subdualCritical");
        if (!raw || raw.applied) return;
        const actor = await resolveActorHandle(raw.actorHandle);
        if (!actor) return;
        const targetActor = await resolveActorHandle(raw.targetHandle);

        button.disabled = true;
        try {
          const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
          await rollCriticalInjury(actor, {
            targetActor,
            damageType: "subdual",
            severity: raw.record.severity,
            attackBonus: raw.record.attackBonus,
            hasSerrated: raw.record.hasSerrated,
            forcedResult: raw.record.result
          });
          await message.setFlag(SYSTEM_ID, "subdualCritical", { ...raw, applied: true });
        } catch (err) {
          button.disabled = false;
          throw err;
        }
      });
    }

    // A FATAL INJURY HEALED BY MAGIC (page 194; Graham's R8). The GM
    // decides what counts; this is the button that carries the decision
    // out, and it clears every Fatal mark the creature carries.
    for (const button of html.querySelectorAll?.('[data-action="clearFatalInjury"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "clearFatalInjury");
        if (!raw || raw.applied) return;
        const target = await resolveActorHandle(raw.targetHandle);
        if (!target) return;
        button.disabled = true;
        try {
          const { clearFatalInjury } = await import("../injury-workflow.mjs");
          await clearFatalInjury(target);
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: target }),
            content: '<div class="trg-prime trg-check-card">'
              + `<p style="margin:2px 0"><strong>${target.name}'s Fatal injury is healed.</strong> `
              + "It may lose the Dying condition and be brought above 0 HP again.</p></div>"
          });
          await message.setFlag(SYSTEM_ID, "clearFatalInjury", { ...raw, applied: true });
        } catch (err) {
          button.disabled = false;
          throw err;
        }
      });
    }

    /*
     * A SAVE THE CRITICAL ROW ASKED FOR (pages 206-219; Graham's R15).
     *
     * "Target must make a Reflex save to avoid dropping item" (Acid
     * 31-32) and "All adjacent characters must make a Fortitude save or
     * be Sickened 1" (Acid 67-68). Neither prints a DC, so both use the
     * Injury DC page 203 already gives for exactly this — "some effects
     * of a critical may require the target to make a Saving Throw to
     * avoid a more serious effect".
     *
     * ROLLED, NOT RESOLVED. What a failure costs is written in the row's
     * own words and often is not a condition at all ("dropping item"),
     * so the roll is made and reported and the consequence is left where
     * the book leaves it.
     */
    for (const button of html.querySelectorAll?.('[data-action="criticalRowSave"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "criticalRowSave");
        if (!raw || raw.applied) return;
        button.disabled = true;
        try {
          const { TRGCheck } = await import("./check.mjs");
          const label = raw.save === "will" ? "Will" : raw.save === "reflex" ? "Reflex" : "Fortitude";
          const rollFor = async (actor) => {
            const save = actor.system?.combat?.saves?.[raw.save];
            /*
             * THE SAVE CAN COST ACTION POINTS (3.581.0; D8, R8). Cold
             * 51: "must make a Fortitude Save (1 AP) to break the ice."
             * The parenthesis was swept into the description of what
             * the save avoided — the card read "to avoid (1 AP) to
             * break the ice" — and nothing charged it. Charged BEFORE
             * the roll, because the AP buys the attempt, not the
             * result.
             */
            if (Number(raw.ap) > 0) {
              const pool = Number(actor.system?.resources?.ap?.value ?? 0);
              const { generalAP } = await import("../combat/restricted-ap.mjs");
              if (generalAP(actor) < Number(raw.ap)) {
                ui.notifications.warn(
                  `${actor.name} has ${pool} AP and the save costs ${raw.ap}.`);
                return { name: actor.name, passed: false, unpaid: true };
              }
              await actor.update({ "system.resources.ap.value": pool - Number(raw.ap) });
            }
            const check = await TRGCheck.roll({
              actor,
              label: `Critical — ${label} save`,
              subtitle: raw.avoids ? `to avoid ${raw.avoids}`
                : raw.achieves ? `to ${raw.achieves}` : `DC ${raw.dc}`,
              type: "save",
              dc: raw.dc,
              modifiers: [{ label, value: Number(save?.total ?? 0), type: "untyped" }]
            });
            return { name: actor.name, passed: Number(check?.outcome?.total ?? 0) >= Number(raw.dc) };
          };

          const rolled = [];
          if (raw.scope === "adjacent") {
            const target = await resolveActorHandle(raw.targetHandle);
            const token = target?.getActiveTokens?.()?.[0] ?? target?.token ?? null;
            const neighbours = token
              ? (canvas?.tokens?.placeables ?? []).filter((t) =>
                t.actor && t.id !== token.id
                && canvas.grid.measurePath?.([token.center, t.center])?.distance <= 5)
              : [];
            for (const neighbour of neighbours) rolled.push(await rollFor(neighbour.actor));
          } else {
            const target = await resolveActorHandle(raw.targetHandle);
            if (target) rolled.push(await rollFor(target));
          }

          await ChatMessage.create({
            content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
              + (rolled.length
                ? rolled.map((r) => `<strong>${r.name}</strong>: `
                    + (r.unpaid ? "could not pay the cost" : r.passed ? "saved" : "failed")).join("; ")
                  + `. ${raw.avoids ? `A failure means ${raw.avoids}.`
                    : raw.achieves ? `A success means they ${raw.achieves}.` : ""}`
                : "Nobody adjacent to save.")
              + "</p></div>"
          });
          await message.setFlag(SYSTEM_ID, "criticalRowSave", { ...raw, applied: true });
        } catch (err) {
          button.disabled = false;
          throw err;
        }
      });
    }

    /*
     * "ARMOURED: 2 AP TO REMOVE HELM AND AVOID INJURED" (Acid 70; R15).
     * A way out at a price, so the price is charged and the condition is
     * never applied — rather than applied and then taken off, which would
     * leave a creature that had briefly been Injured for anything else
     * reading the state.
     */
    for (const button of html.querySelectorAll?.('[data-action="criticalRowEscape"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "criticalRowEscape");
        if (!raw || raw.applied) return;
        const target = await resolveActorHandle(raw.targetHandle);
        if (!target) return;
        button.disabled = true;
        try {
          const current = Number(target.system?.resources?.ap?.value ?? 0);
          if (current < raw.ap) {
            ui.notifications.warn(
              `${target.name} has ${current} AP and needs ${raw.ap} to ${raw.action}.`);
            button.disabled = false;
            return;
          }
          await target.update({ "system.resources.ap.value": current - raw.ap });
          if (target.hasCondition?.(raw.avoids)) {
            await target.toggleStatusEffect(raw.avoids, { active: false });
          }
          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: target }),
            content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
              + `<strong>${target.name} spends ${raw.ap} AP to ${raw.action}</strong> — `
              + `the ${raw.avoids} is avoided.</p></div>`
          });
          await message.setFlag(SYSTEM_ID, "criticalRowEscape", { ...raw, applied: true });
        } catch (err) {
          button.disabled = false;
          throw err;
        }
      });
    }

    /*
     * "MAY SPEND 3 AP EACH ROUND TRYING TO REMOVE THE ICE. THIS IS A DC
     * 15 FLAT CHECK." (Cold 90; the pages 211-220 audit's D7, Graham's
     * R7 of 21 September 2026.)
     *
     * NOT SPENT ONCE. The row says EACH ROUND, and the target it is
     * offered to is suffocating on page 202's ladder — so the button
     * stays live after a failure and only retires when the ice is off.
     * The Acid 70 escape beside it is a single moment and retires on
     * use; this one is a struggle.
     *
     * THE AP IS CHARGED WHETHER OR NOT THE CHECK PASSES, because the
     * action points buy the attempt. A version that refunded a failure
     * would make trying free, and the whole weight of this row is that
     * trying is expensive while you cannot breathe.
     */
    for (const button of html.querySelectorAll?.('[data-action="criticalRowBreakFree"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "criticalRowBreakFree");
        if (!raw || raw.applied) return;
        const target = await resolveActorHandle(raw.targetHandle);
        if (!target) return;
        button.disabled = true;
        try {
          const pool = Number(target.system?.resources?.ap?.value ?? 0);
          if (pool < raw.ap) {
            ui.notifications.warn(
              `${target.name} has ${pool} AP and needs ${raw.ap} to ${raw.action}.`);
            button.disabled = false;
            return;
          }
          await target.update({ "system.resources.ap.value": pool - raw.ap });

          const { TRGCheck } = await import("./check.mjs");
          const check = await TRGCheck.roll({
            actor: target,
            label: "Critical — Break Free",
            subtitle: `${raw.action} · ${raw.ap} AP`,
            type: "flat",
            flat: true,
            dc: raw.dc
          });

          const freed = Boolean(check?.outcome?.degree?.success);
          if (freed) {
            // THE SUFFOCATION IS WHAT THE ICE WAS DOING, so removing the
            // ice removes it — and page 202's `restoreAir` is what knows
            // how to end it properly, including waking a creature that
            // went under from it.
            const { restoreAir } = await import("../drowning-workflow.mjs");
            await restoreAir(target);
            await message.setFlag(SYSTEM_ID, "criticalRowBreakFree", { ...raw, applied: true });
          } else {
            button.disabled = false;
          }

          await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor: target }),
            content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
              + `<strong>${target.name} spends ${raw.ap} AP</strong> to ${raw.action} — `
              + (freed ? "and breaks free. They can breathe again."
                : `the DC ${raw.dc} flat check fails. They may try again next round.`)
              + "</p></div>"
          });
        } catch (err) {
          button.disabled = false;
          throw err;
        }
      });
    }

    // ONE MORE ROUND OF AIR (page 202; R3): the critical failure on a
    // save against a damaging effect, which has no single place in the
    // system to fire from. See the comment beside the button.
    for (const button of html.querySelectorAll?.('[data-action="spendAirRound"]') ?? []) {
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "spendAirRound");
        if (!raw) return;
        const actor = await fromUuid(raw.actorUuid).catch(() => null);
        if (!actor) return;
        button.disabled = true;
        const { loseAirToEvent } = await import("../drowning-workflow.mjs");
        await loseAirToEvent(actor, { criticalSaveFailure: true });
      });
    }

    const escapeButton = html.querySelector?.('[data-action="attemptPrisonEscape"]');
    bindOnce(escapeButton, "click", async (event) => {
      event.preventDefault();
      const prisonerUuid = escapeButton.dataset?.prisonerUuid ?? "";
      if (!prisonerUuid) return;
      escapeButton.disabled = true;
      try {
        await onAttemptPrisonEscape(prisonerUuid);
      } finally {
        // RE-ENABLED, like the beacon's: a Fumble leaves the prisoner in
        // the cage and the next attempt comes from this same card.
        escapeButton.disabled = false;
      }
    });

    // TANGLING CREEPERS' VINE (3.609.0): pressed once a round from the cast
    // card, so re-enabled like the beacon's. See magic/vine-lash-workflow.mjs.
    const lashButton = html.querySelector?.('[data-action="vineLash"]');
    bindOnce(lashButton, "click", async (event) => {
      event.preventDefault();
      const casterUuid = lashButton.dataset?.casterUuid ?? "";
      if (!casterUuid) return;
      lashButton.disabled = true;
      try {
        const { onVineLash } = await import("../magic/vine-lash-workflow.mjs");
        await onVineLash(casterUuid, lashButton.dataset?.spellName || "Tangling Creepers");
      } finally {
        lashButton.disabled = false;
      }
    });

    const beaconButton = html.querySelector?.('[data-action="touchVitalBeacon"]');
    bindOnce(beaconButton, "click", async (event) => {
      event.preventDefault();
      const casterUuid = beaconButton.dataset?.casterUuid ?? "";
      if (!casterUuid) return;
      beaconButton.disabled = true;
      try {
        await onTouchVitalBeacon(casterUuid);
      } finally {
        // RE-ENABLED, unlike the heal button. A beacon is used many
        // times from the SAME card — once per round until it is spent —
        // so disabling it for good would take four of the five uses away.
        beaconButton.disabled = false;
      }
    });

    const healButton = html.querySelector?.('[data-action="applyMedicineEffect"]');
    bindOnce(healButton, "click", async (event) => {
      event.preventDefault();
      const raw = message.getFlag(SYSTEM_ID, "healCard");
      if (!raw || raw.applied) return;
      healButton.disabled = true;
      try {
        await onApplyMedicineEffect(message, foundry.utils.deepClone(raw));
        if (message.getFlag(SYSTEM_ID, "healCard")?.applied) {
          healButton.textContent = "Applied";
        } else {
          healButton.disabled = false;
        }
      } catch (err) {
        healButton.disabled = false;
        throw err;
      }
    });

    // FORCED MOVEMENT (3.376.0). Shove's push, and the fourteen critical
    // table rows that say "Target is pushed back 5'/10'".
    //
    // The spent state is reapplied FROM THE FLAG on every render, not left
    // to the DOM edit made at click time. This hook fires again on the very
    // setFlag the handler performs, rebuilding the card from stored HTML
    // that still holds live-looking buttons — the exact way the
    // critical-adjust buttons above were found re-enabling after use.
    const pushState = message.getFlag(SYSTEM_ID, "forcedMovement");
    for (const button of html.querySelectorAll?.('[data-action="applyForcedPush"]') ?? []) {
      if (pushState?.applied) {
        button.disabled = true;
        if (Number(button.dataset.feet) === Number(pushState.requestedFeet)) {
          button.textContent = pushState.appliedFeet
            ? `✓ Pushed ${pushState.appliedFeet} ft`
            : "✓ Blocked";
        } else {
          button.style.opacity = "0.45";
        }
        continue;
      }
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        const raw = message.getFlag(SYSTEM_ID, "forcedMovement");
        if (!raw || raw.applied) return;
        button.disabled = true;
        try {
          const { applyForcedPush } = await import("../combat/forced-movement-workflow.mjs");
          await applyForcedPush(message, foundry.utils.deepClone(raw), Number(button.dataset.feet));
        } catch (err) {
          button.disabled = false;
          throw err;
        }
      });
    }

    // Study Target: open the manager (used/available, forget targets) for
    // the studying actor. Dynamic import to match the adjust-critical
    // handler and keep this card module free of workflow-side imports.
    const manageButton = html.querySelector?.('[data-action="manageStudiedTargets"]');
    bindOnce(manageButton, "click", async (event) => {
      event.preventDefault();
      const raw = message.getFlag(SYSTEM_ID, "studyTarget");
      const actor = raw?.actorId ? game.actors?.get(raw.actorId) : null;
      if (!actor) return;
      const { openStudiedTargetManager } = await import("../study-target-workflow.mjs");
      await openStudiedTargetManager(actor);
    });

    // Earn Income: open the task manager (work another day / finish).
    const earnButton = html.querySelector?.('[data-action="manageEarnIncome"]');
    bindOnce(earnButton, "click", async (event) => {
      event.preventDefault();
      const raw = message.getFlag(SYSTEM_ID, "earnIncome");
      const actor = raw?.actorId ? game.actors?.get(raw.actorId) : null;
      if (!actor) return;
      const { openEarnIncomeManager } = await import("../earn-income-workflow.mjs");
      await openEarnIncomeManager(actor);
    });

    // THE TANGLEFOOT BAG'S TWO WAYS OUT (3.578.0, Graham's R7 of the
    // block-18 audit): Escape against the bag's level DC, or three
    // Interact actions from anyone. Both live in alchemical-workflow.mjs,
    // imported on the click so this card module stays free of workflow
    // imports, as the buttons around it do.
    const tangleEscape = html.querySelector?.('[data-action="tanglefootEscape"]');
    bindOnce(tangleEscape, "click", async (event) => {
      event.preventDefault();
      const { tanglefootEscape } = await import("../alchemical-workflow.mjs");
      await tanglefootEscape(message);
    });
    const tangleScrape = html.querySelector?.('[data-action="tanglefootScrape"]');
    bindOnce(tangleScrape, "click", async (event) => {
      event.preventDefault();
      const { tanglefootScrape } = await import("../alchemical-workflow.mjs");
      await tanglefootScrape(message);
    });

    // Create: open the crafting project manager.
    const createButton = html.querySelector?.('[data-action="manageCreateProject"]');
    bindOnce(createButton, "click", async (event) => {
      event.preventDefault();
      const raw = message.getFlag(SYSTEM_ID, "createProject");
      const actor = raw?.actorId ? game.actors?.get(raw.actorId) : null;
      if (!actor) return;
      const { openCreateManager } = await import("../create-crafting-workflow.mjs");
      await openCreateManager(actor);
    });

    // Unbreakable Resolve: the reroll button on a failed save's card.
    // Async (it reads the ability's remaining uses), so fire-and-forget
    // from this synchronous hook.
    maybeAddUnbreakableReroll(message, html).catch((err) =>
      console.error("TRG Prime | Unbreakable Resolve button", err)
    );

    // Luck: the GM's "Award luck" button on a natural 20 (3.624.0, R15).
    maybeAddLuckAward(message, html).catch((err) =>
      console.error("TRG Prime | Luck award button", err)
    );

    // Devotion: the "treat as a failure" button on a fumbled/blundered
    // class-skill check's own card.
    maybeAddDevotionDowngrade(message, html).catch((err) =>
      console.error("TRG Prime | Devotion button", err)
    );

    // Natural Defence: the same shape, on the roller's OWN save. Its
    // trigger is "you make saving throw", so unlike Cutting Words there
    // is nobody else to offer it to.
    maybeAddNaturalDefence(message, html).catch((err) =>
      console.error("TRG Prime | Natural Defence button", err)
    );

    // Guidance: the target spending a bonus somebody else gave them, on
    // whichever of their next attack, save or skill check they choose.
    maybeAddHeldBonuses(message, html).catch((err) =>
      console.error("TRG Prime | Guidance button", err)
    );

    // ENDEAVOUR (3.619.0; Chapter 12, page 392, Graham's R12): the GM's
    // award buttons, by the card's degree, once per check.
    import("../endeavour-award.mjs")
      .then(({ maybeAddEndeavourAward }) => maybeAddEndeavourAward(message, html, cardActor))
      .catch((err) => console.error("TRG Prime | Endeavour award", err));
  });
}
