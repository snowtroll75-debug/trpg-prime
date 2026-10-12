/**
 * Sustain a Spell — the Foundry half, and the ONE place a sustain happens.
 *
 * NEW at 3.424.0.
 *
 * Both doors call this: the Actions tab's "Sustain a Spell" button (via
 * `resolveAction`, which routes the key here before its generic
 * checkType:"none" path can spend the AP a second time) and the Magic
 * tab's per-spell sustain button. Whatever a Sustain is, it is what this
 * function does — the defect Graham reported on 27 August 2026 was
 * exactly that the two doors each did a different half of it.
 *
 * See magic/sustain.mjs for the decisions and the history.
 */

import { SUSTAIN_AP_COST, SUSTAIN_TRAITS, resolveSustainTarget, sustainRefusal } from "./sustain.mjs";
import { endActiveSpell, getActiveSpells, recordSustainDues, sustainActiveSpell } from "./active-spells.mjs";
import { duesLine, heldLabel, roundsHeld, sustainDues } from "./sustain-clock.mjs";
import { hitPointsLost } from "./pending-cast.mjs";
import { growthRefusal } from "./emanation-growth.mjs";
import { growEmanation } from "./emanation-workflow.mjs";
import {
  declaredSustainChoices, offersPlainSustainChoice, sustainChoiceByKey, sustainChoiceLine
} from "./sustain-choice.mjs";
import { ensureActionPoints, spendActionCost } from "../combat/action-points-workflow.mjs";


/** Which of several running spells to sustain. */
async function promptSustainChoice(actor, candidates) {
  const { DialogV2 } = foundry.applications.api;
  const rows = candidates
    .map(
      (entry, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="spell" value="${entry.id}" ${index === 0 ? "checked" : ""}>
          <span>${entry.name}${entry.sustainType ? ` <em style="opacity:.7">(${entry.sustainType})</em>` : ""}</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Sustain a Spell", icon: "fa-solid fa-rotate-right" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Which spell do you sustain? It continues until the end of your next turn.</p>
      ${rows}
    </div>`,
    buttons: [
      {
        action: "confirm",
        label: "Sustain",
        icon: "fa-solid fa-rotate-right",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.spell;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return candidates.find((e) => e.id === result) ?? null;
}

/**
 * What this Sustain buys, for a spell that declared its own choices.
 *
 * THE ROWS ARE THE SPELL'S, not this function's. Luminance's picker
 * builds its two options from live state and has to grey one out once
 * the dice are capped; these are a fixed list the pack wrote down, so
 * there is nothing to compute and nothing to disable. That difference is
 * the whole reason there are two pickers rather than one with a flag —
 * see magic/sustain-choice.mjs.
 *
 * ONE CHOICE STILL ASKS. It looks like a dialog worth skipping, and is
 * not: Blink's single option is a decision ("do I blink this round?"),
 * and a Sustain that silently took it would move a token nobody chose to
 * move. The caster may still cancel, which costs them nothing.
 *
 * @param {object} entry the active-spell entry
 * @param {Array<{key:string,label:string,note:string}>} choices
 * @returns {Promise<object|null>} the chosen row, or null if cancelled
 */
async function promptDeclaredSustain(entry, choices) {
  const { DialogV2 } = foundry.applications.api;
  const rows = choices
    .map((choice, index) =>
      `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
        <input type="radio" name="choice" value="${choice.key}" ${index === 0 ? "checked" : ""}>
        <span>${choice.label}</span>
      </label>`)
    .join("");

  const picked = await DialogV2.wait({
    window: { title: `Sustain ${entry.name}`, icon: "fa-solid fa-rotate-right" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">What does this Sustain buy?</p>${rows}</div>`,
    buttons: [
      {
        action: "confirm",
        label: "Sustain",
        icon: "fa-solid fa-rotate-right",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.choice;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!picked || picked === "cancel") return null;
  // MATCHED THROUGH THE RULE, not found here. A key the entry does not
  // declare means the dialog and the record have drifted apart, and
  // `sustainChoiceByKey` answers null rather than substituting a row the
  // caster did not pick.
  return sustainChoiceByKey(entry, picked);
}

/**
 * Sustain one running spell: check the requirements, choose the spell,
 * spend the action, extend the duration, and say so once.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE AP IS SPENT HERE, and nowhere else.
 *
 * The Actions-tab door reaches this through an early branch in
 * `resolveAction`, placed beside Double Slice's and Shield Block's, so
 * it returns before the generic `checkType: "none"` path spends the cost
 * itself. That is the whole reason the branch is early rather than in
 * the outcome section: two spends for one action would be a worse bug
 * than the one being fixed.
 *
 * REQUIREMENTS ARE CHECKED BEFORE THE SPEND, so a refused sustain costs
 * nothing — the same order Repair's kit check and Study Target's time
 * prompt use.
 *
 * @param {Actor} actor
 * @param {object} [options]
 * @param {string|null} [options.spellId] Known when the Magic tab's own
 *   row supplied it; null from the Actions tab, which names no spell.
 * @returns {Promise<object|null>} The sustained entry, or null.
 */
export async function sustainSpellAction(actor, { spellId = null } = {}) {
  if (!actor) return null;

  const entries = getActiveSpells(actor);
  const refusal = sustainRefusal({
    entries,
    fatigued: actor.getConditionValue?.("fatigued") ?? 0,
    name: actor.name
  });
  if (refusal) {
    ui.notifications.warn(refusal);
    return null;
  }

  const target = resolveSustainTarget(entries, spellId);
  if (!target) {
    ui.notifications.warn(`${actor.name} has no such spell running to sustain.`);
    return null;
  }

  let entry = target.entry ?? null;
  if (!entry && target.ask) {
    entry = await promptSustainChoice(actor, target.ask);
    if (!entry) return null;
  }

  // NOTHING LEFT TO BUY IS A REFUSAL, NOT A SPEND (3.430.0).
  //
  // Asked here, after the spell is known and before the AP is taken,
  // because the question is about THIS spell: a ward already at its
  // thirty-foot cap has a Sustain that grows nothing and a clock that
  // stops for nobody. Charging for it would reproduce word for word the
  // report this file exists to answer — "deducts an AP, creates an entry
  // on the chat card but does nothing else".
  const nothingToBuy = growthRefusal(entry, actor.name);
  if (nothingToBuy) {
    ui.notifications.warn(nothingToBuy);
    return null;
  }

  // A SPELL THAT OFFERS A CHOICE ASKS BEFORE IT CHARGES (3.435.0).
  // Luminance's Sustain buys either a healing die or a point of bleed
  // removal, and a player who cancels that picker has spent nothing —
  // the same order the target picker above follows.
  const { luminanceRefusal, promptLuminanceChoice } = await import("./luminance-workflow.mjs");
  const choice = await promptLuminanceChoice(actor, entry);
  const offersChoice = Array.isArray(entry?.emanation?.sustainChoices)
    && entry.emanation.sustainChoices.length > 0;
  if (offersChoice && !choice) return null;

  /*
   * AND THE PLAIN PICKER, FOR A SPELL THAT IS NOT LUMINANCE (3.586.0).
   *
   * ASKED BEFORE THE AP IS TAKEN, beside the picker above and for the
   * same reason: a player who cancels has spent nothing.
   *
   * `offersPlainSustainChoice` is what keeps the two pickers apart —
   * Luminance's options are a function of how many dice this casting has
   * already grown, which no pack row can express, so it keeps its own.
   * Everything else is offered exactly what the spell wrote down. See
   * magic/sustain-choice.mjs for why the field it reads was unreachable
   * until now, and which spell of mine that broke.
   */
  let plainChoice = null;
  if (offersPlainSustainChoice(entry)) {
    plainChoice = await promptDeclaredSustain(entry, declaredSustainChoices(entry));
    if (!plainChoice) return null;
  }

  // AND A CHOICE THAT BUYS NOTHING IS REFUSED, not charged for (3.436.0).
  // The picker disables the capped option, so this is only reachable by
  // forcing a disabled control — but the disabled control is UI and this
  // is the rule, and the two should not be able to disagree.
  const buysNothing = luminanceRefusal(entry, choice, entry.name);
  if (buysNothing) {
    ui.notifications.warn(buysNothing);
    return null;
  }

  // ASKED, THEN PAID. Cancelling the picker above costs nothing.
  if (!(await ensureActionPoints(actor, SUSTAIN_AP_COST, "Sustain a Spell"))) return null;
  await spendActionCost(actor, SUSTAIN_AP_COST, "Sustain a Spell", { traits: SUSTAIN_TRAITS });

  const sustained = await sustainActiveSpell(actor, entry.id, game.combat?.round ?? 0);
  if (!sustained) return null;

  // ─────────────────────────────────────────────────────────────────
  // WHAT THE CLOCK NOW OWES (3.585.0, page 241).
  //
  // AFTER the AP is spent and the spell extended, because both costs
  // are consequences of having sustained rather than a price of the
  // attempt: a caster who cannot pay the ten-minute PP still sustained
  // this round, and the spell ends at the END of that round rather
  // than the action being refused. The refusals above are all about
  // whether the action can happen; this is about what it did.
  const dues = sustainDues({
    rounds: roundsHeld(sustained),
    charged: sustained.sustainCharged,
    exhausted: sustained.sustainExhausted
  });
  const duesNote = duesLine(dues, sustained.pp);
  let ranOut = false;

  if (dues.ppCharges > 0) {
    const cost = dues.ppCharges * (Number(sustained.pp) || 0);
    const pool = Number(actor.system?.resources?.pp?.value ?? 0);
    if (pool >= cost) {
      await actor.update({ "system.resources.pp.value": pool - cost });
      await recordSustainDues(actor, sustained.id, {
        charged: (Number(sustained.sustainCharged) || 0) + dues.ppCharges
      });
    } else {
      // NOT ENOUGH TO PAY IS THE END OF THE SPELL, which is the only
      // thing "you must expend the Power Points for the spell again"
      // can mean for a caster who has not got them.
      ranOut = true;
      await endActiveSpell(actor, sustained.id, { dismissed: false });
    }
  }

  if (dues.exhaustionCheck) {
    await recordSustainDues(actor, sustained.id, { exhausted: true });
    const { rollExhaustionCheck } = await import("../combat/exhaustion-workflow.mjs");
    await rollExhaustionCheck(actor, {
      activity: `Sustaining ${sustained.name} for ${heldLabel(roundsHeld(sustained))}`
    });
  }

  // WHAT THIS PARTICULAR SUSTAIN BOUGHT.
  //
  // A "duration" sustain buys more time, and the sentence below has said
  // so since 3.424.0. Protective Ward's buys five feet of radius on a
  // spell whose minute runs regardless — telling a player it "continues
  // until the end of their next turn" would be a card describing a
  // different spell, and the kind of confident wrong sentence this
  // project keeps finding in comments.
  //
  // `grewBy`, NOT THE STEP. A ward two feet from its cap grows by two.
  // WHAT THIS SUSTAIN BOUGHT, for a spell that grows dice rather than
  // feet. Answered before the radius growth so one Sustain can only ever
  // buy one thing.
  let choiceNote = "";
  if (choice) {
    const { sustainLuminance } = await import("./luminance-workflow.mjs");
    const result = await sustainLuminance(actor, entry.id, choice);
    if (result) choiceNote = result.note;
  }
  // A PLAIN CHOICE CHANGES NO STATE, so there is nothing to record and
  // only something to say. Blink's blink moves a token, Acid Arrow's
  // arrow is an Attack action the caster then takes — the spell's own
  // words are what the card owes them, and the words are on the row.
  if (plainChoice) choiceNote = sustainChoiceLine(plainChoice);

  const grown = await growEmanation(actor, entry.id);
  // A WEAPON THAT STRIKES WHEN SUSTAINED (3.608.0, R8) — Spiritual Weapon:
  // "Each time you Sustain the Spell, you can move the weapon to a new
  // target within range (if needed) and Strike with it." After the AP is
  // paid and the spell extended; [] for every other sustained spell.
  const { strikeOnSustain } = await import("./spiritual-weapon-workflow.mjs");
  const strikeLines = ranOut ? [] : await strikeOnSustain(actor, entry.id);
  // THE STORM STRIKES AGAIN (3.610.0): "the first time each round you
  // Sustain the Spell, you can choose one of the following storm effects".
  if (!ranOut) {
    const { stormOnSustain } = await import("./storm-workflow.mjs");
    strikeLines.push(...await stormOnSustain(actor, entry.id));
  }
  const atCap = grown && grown.radiusFeet >= Number(entry.emanation?.growth?.maxFeet ?? 0);
  const bought = choiceNote
    ? `${choiceNote}.`
    : grown?.grewBy
      ? `its aura widens by <strong>${grown.grewBy} ft</strong> to a radius of `
        + `<strong>${grown.radiusFeet} ft</strong>${atCap ? " — its maximum" : ""}.`
      : "it continues until the end of their next turn.";

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content:
      `<div class="trg-prime"><p><strong>${actor.name}</strong> sustains ` +
      `<strong>${sustained.name}</strong> — ${bought}</p>` +
      // HOW LONG, AND WHAT THAT COST. Silent on a spell held a round or
      // two; the moment the clock charges for something the card is
      // where the player finds out, rather than a PP pool that quietly
      // dropped.
      (duesNote
        ? `<p style="margin:2px 0"><strong>Held ${heldLabel(roundsHeld(sustained))}</strong> — ${duesNote}</p>`
        : "") +
      (ranOut
        ? `<p style="margin:2px 0"><strong>${sustained.name} ends</strong> — not enough Power Points to expend again.</p>`
        : "") +
      strikeLines.join("") +
      `<p style="opacity:.75;margin:2px 0 0"><em>1 AP (Concentrate). You cannot recover Power Points while sustaining a spell.</em></p></div>`
  });

  return sustained;
}

/**
 * A sustained spell whose caster has just been hurt.
 *
 * ─────────────────────────────────────────────────────────────────────
 * PAGE 241: "If your Sustain a Spell action is interrupted (by damage or
 * some other variable), the spell immediately ends unless you make a
 * Spell Concentration check."
 *
 * NOTHING WAS WATCHING. `rollSpellConcentration`'s own dialog has said
 * "you're interrupted while casting or sustaining a spell" since it was
 * written — the reaction was built, wired to a sheet button, and had no
 * trigger. A player whose wizard was shot mid-Bless had to know the rule,
 * notice it applied, and go and press the button.
 *
 * THE HIT-POINT PATH IS THE ONE R9 MEASURED, not the one its first draft
 * believed. Creature hit points are `system.resources.hp.value`;
 * `system.hp` is a vestigial `{value: null}` that nothing writes, and
 * watching it made R9's automatic interruption dead on arrival. The
 * guard is `hitPointsLost` IMPORTED from magic/pending-cast.mjs rather
 * than a second copy — the ratchet caught exactly that duplication when
 * R9 wrote the rule and then hand-rolled it in the hook.
 */
export function registerSustainInterruptHooks() {
  Hooks.on("preUpdateActor", (actor, changed) => {
    const after = changed?.system?.resources?.hp?.value;
    if (after === undefined) return;
    if (!hitPointsLost(actor.system?.resources?.hp?.value, after)) return;
    const threatened = getActiveSpells(actor).filter((entry) => entry?.sustained);
    if (!threatened.length) return;
    // AFTER THE UPDATE LANDS, like R9's: this is a `preUpdate` hook, and
    // prompting from inside it would open a dialog against hit points
    // that have not been written yet.
    globalThis.setTimeout(() => { interruptSustained(actor, threatened); }, 0);
  });
}

/**
 * Offer the Spell Concentration check for each interrupted spell, and
 * end the ones that do not survive it.
 *
 * ONE CHECK PER SPELL, because each is separately sustained and the page
 * makes the check the price of keeping *the* spell. A caster holding
 * three is asked three times, which is the honest answer even though it
 * is the tedious one; casters holding more than one sustained spell are
 * rare enough that batching them would be optimising for a case that
 * mostly does not happen.
 *
 * DECLINING IS LETTING IT GO. "The spell immediately ends unless you
 * make a Spell Concentration check" — cancelling the dialog is not
 * making the check, so the spell ends. The prompt says so.
 *
 * @param {Actor} actor
 * @param {object[]} entries the sustained entries to test
 * @returns {Promise<string[]>} the names of the spells that ended
 */
async function interruptSustained(actor, entries) {
  const { rollSpellConcentration } = await import("./cast-workflow.mjs");
  const ended = [];
  for (const entry of entries ?? []) {
    ui.notifications.info(
      `${actor.name} is interrupted — ${entry.name} ends unless a Spell Concentration check is made.`
    );
    const result = await rollSpellConcentration(actor, { dc: Number(entry.castingDC) || 0 });
    if (result?.outcome?.maintains) continue;
    await endActiveSpell(actor, entry.id, { dismissed: false });
    ended.push(entry.name);
  }
  if (ended.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime"><p><strong>${ended.join(", ")}</strong> `
        + `end${ended.length === 1 ? "s" : ""} — ${actor.name}'s concentration was broken.</p></div>`
    });
  }
  return ended;
}

/*
 * NO `canSustain` HELPER. One was written here for a sheet to grey its
 * button with, and `verify-rules-have-callers` refused it: no sheet
 * greys anything, so it was a well-tested opinion rather than
 * automation (lesson 5.1). `sustainRefusal` is exported from
 * magic/sustain.mjs the day something actually wants to ask.
 */
