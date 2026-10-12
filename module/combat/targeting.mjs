/**
 * Target selection prompt (Chapter 7, Combat). Foundry's own targeting
 * (click a token, press T) works continuously and silently — nothing
 * stops an attack from being declared and rolled against whatever was
 * last targeted, or nothing at all. This prompts explicitly before the
 * roll, showing every other token on the current scene with anything
 * already targeted pre-checked, and applies the confirmed selection to
 * game.user.targets before the workflow reads it.
 */

import { senseMissChance } from "../conditions/condition-rules.mjs";
import { activeToken } from "./geometry.mjs";
import {
  targetPromptText, targetRowNote, warnsOnEmptySelection, selectedTargetIds,
  EMPTY_SELECTION_WARNING
} from "./target-prompt.mjs";

const { DialogV2 } = foundry.applications.api;

/**
 * Every token on the current scene, THE ACTOR'S OWN INCLUDED.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT EXCLUDED THE ACTOR UNTIL 3.418.0, AND A CLERIC COULD NOT HEAL
 * HIMSELF.
 *
 * Graham, 27 August 2026: "My Cleric cast a Cure Spell and it did not
 * allow him to target himself... A character with healing spells that
 * cannot target themselves is in real trouble."
 *
 * Cure reads `targets: "1 willing creature"` and heals whoever is
 * targeted. The caster was filtered out of his own picker, so the one
 * creature he could never heal was the one holding the holy symbol.
 *
 * GRAHAM'S RULING: any spell with a range may be aimed at the caster.
 * The picker OFFERS; it does not adjudicate. Whether pointing a Fire
 * Bolt at yourself is wise is the player's business and the spell's own
 * effects'; a picker that silently removes a legal choice is worse than
 * one that allows a strange one, because a player can see a bad idea and
 * decline it but cannot see an option that is not there.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND IT REPAIRS A BUG THE EXCLUSION ITSELF CAUSED.
 *
 * The fallback sweep below carries a note explaining that it must walk
 * every token rather than the candidates, because the candidate list
 * could not reach the actor's own token to UNtarget it — the 3.286.0
 * playtest where a Fighter confirmed an empty dialog and swung at
 * himself. That hazard was a consequence of this filter. With the actor
 * in the list there is nothing the sweep cannot reach.
 */
function candidateTokens() {
  try {
    return canvas.tokens.placeables;
  } catch {
    return [];
  }
}

/**
 * "Prompt with a warning before allowing to continue" — Graham, 1
 * September 2026. See `warnsOnEmptySelection` for why this warns rather
 * than refuses.
 *
 * THREE ANSWERS, NOT TWO. "Go back" reopens the picker, because the
 * overwhelmingly likely reason for an empty selection is a box the player
 * meant to tick — sending them back to the action they were taking would
 * make the warning a punishment rather than a help. It is the default,
 * so the safe answer is the one a stray Enter gives.
 *
 * @returns {Promise<"continue"|"back">}
 */
async function confirmEmptySelection(title) {
  const answer = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-triangle-exclamation" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>No target selected.</strong></p>
      <p class="hint">${EMPTY_SELECTION_WARNING}</p>
    </div>`,
    buttons: [
      { action: "back", label: "Go back", icon: "fa-solid fa-rotate-left", default: true },
      { action: "continue", label: "Continue anyway", icon: "fa-solid fa-triangle-exclamation" }
    ],
    // DISMISSED IS "GO BACK". Closing a warning is not agreeing with it.
    rejectClose: false
  });
  return answer === "continue" ? "continue" : "back";
}

/**
 * @param {Actor} actor The acting actor — used to find its own token(s)
 *   on the current scene, so they're excluded from the candidate list.
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {string} [options.prompt] What the dialog SAYS. Defaults to a
 *   neutral sentence rather than the attack wording this hardcoded until
 *   3.407.2 — see combat/target-prompt.mjs for the cantrip that was
 *   asked which creature to attack.
 * @param {(token: Token) => (string|null)} [options.note] An optional
 *   per-row annotation — see the block below. Returning null means the
 *   row is ordinary.
 * @returns {Promise<boolean>} true if the player confirmed a selection
 *   (even an empty one — "no target" is itself a valid, explicit
 *   choice), false if the prompt was cancelled and the action should
 *   not proceed.
 */
export async function promptTargetSelection(
  actor, { title = "Select Target", prompt = targetPromptText(), note = null } = {}
) {
  // ITS OWN TOKEN (3.622.3; the 3.622.2 drive's F1, Graham's R1): by actor id,
  // a second unlinked copy of the same actor found the first copy's token.
  const actorToken = activeToken(actor);
  const candidates = candidateTokens();

  if (!candidates.length) {
    // Nothing to target on this scene — nothing to prompt for either.
    return true;
  }

  const currentlyTargeted = new Set(
    Array.from(game.user.targets ?? []).map((t) => t.id)
  );

  // THE CASTER FIRST, AND SAID SO. A healer reaching for this dialog is
  // usually reaching for themselves, and a row that reads exactly like
  // the six around it is one a player has to hunt for. It is never
  // pre-checked: appearing in the list is the fix, being chosen by
  // default would be a different and worse bug.
  const isSelf = (token) => Boolean(actorToken) && token.id === actorToken.id;
  const ordered = [...candidates].sort((a, b) => (isSelf(b) ? 1 : 0) - (isSelf(a) ? 1 : 0));

  // SAID, NOT REMOVED (3.443.2). Some spells declare a side — Cutting
  // Words names enemies, Counter Perform allies — and a target on the
  // wrong side is refused after this dialog closes. Driving Counter
  // Perform on 31 August 2026 showed the cost of that silence: the picker
  // listed a hostile token as a plain row and the player learned it was
  // ineligible only after choosing it.
  //
  // The row STAYS. Graham's ruling above governs this dialog — "a picker
  // that silently removes a legal choice is worse than one that allows a
  // strange one" — and while an ineligible target is not a legal choice,
  // a row that vanishes teaches a player nothing about why. So the
  // caller's own gate is asked for its sentence and that sentence is
  // printed beside the name, in the gate's words rather than in this
  // file's: `note` is a closure over the same eligibility function the
  // refusal uses, so the dialog cannot disagree with the gate that
  // follows it.
  //
  // THE BOX IS NOT DISABLED. An annotation a player can still tick is a
  // warning; a box they cannot is the removal the ruling forbids, wearing
  // a label. The gate downstream is what refuses, and it costs nothing.
  //
  // THE SENTENCE IS BUILT IN `target-prompt.mjs`, not here, for the reason
  // this dialog's own prompt text moved there at 3.407.2: this file cannot
  // be imported outside Foundry, and a rule that lives here can only ever
  // be checked by reading its source.
  const rows = ordered
    .map(
      (token) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="checkbox" name="target" value="${token.id}" ${currentlyTargeted.has(token.id) ? "checked" : ""}>
          <span>${token.name}${isSelf(token) ? " <em>(yourself)</em>" : ""}${targetRowNote(token, note)}</span>
        </label>`
    )
    .join("");

  // REOPENED WHEN AN EMPTY SELECTION IS SENT BACK. The pre-checked state
  // is read from `game.user.targets`, which is not written until a
  // selection is confirmed below, so a second pass shows the same dialog
  // the player first saw rather than a blanked one.
  let result;
  for (;;) {
    result = await DialogV2.wait({
      window: { title, icon: "fa-solid fa-crosshairs" },
      classes: ["trg-prime"],
      position: { width: 360 },
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">${prompt}</p>${rows}</div>`,
      buttons: [
        {
          action: "confirm",
          label: "Continue",
          icon: "fa-solid fa-check",
          default: true,
          callback: (event, button) => {
            const form = button.form ?? button.closest?.("form");
            const FDE =
              foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
            // THE TICKED ONES ONLY. FormDataExtended answers with one
            // entry per checkbox and `null` for every unticked row, so
            // the bare array's length is the row count — see
            // `selectedTargetIds`, where that is measured and explained.
            return selectedTargetIds(new FDE(form).object.target);
          }
        },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });

    if (result === null || result === undefined || result === "cancel") return false;
    if (!warnsOnEmptySelection(result.length, ordered.length)) break;
    if (await confirmEmptySelection(title) === "continue") break;
  }

  const selectedIds = new Set(result);
  if (game.user.updateTokenTargets) {
    game.user.updateTokenTargets([...selectedIds]);
  } else {
    // Fallback for older Foundry versions without the bulk helper.
    //
    // OVER EVERY TOKEN, NOT JUST THE CANDIDATES. The candidate list
    // excludes the acting token — you cannot pick yourself — so a sweep
    // over candidates alone can never UNtarget the actor's own token if
    // it happens to be targeted already. The 3.286.0 playtest found the
    // consequence: a Fighter whose own token was the last thing targeted
    // confirmed this dialog with nothing checked and swung at himself.
    // An empty confirmation means no target, and it has to be able to
    // clear every one of them to mean it.
    for (const token of canvas.tokens?.placeables ?? []) {
      token.setTarget(selectedIds.has(token.id), { user: game.user, releaseOthers: false });
    }
  }

  return true;
}

/**
 * Hidden/Concealed avoidance (Appendix 2, Graham's ruling 1 Aug 2026):
 * "If you are struck by a creature that you are concealed from with a
 * targeted spell or effect, you may make a DC 17 Flat Check. If the check
 * succeeds, the attack, spell, or effect doesn't affect you." (Hidden: DC 10.)
 *
 * THE DEFENDER rolls the flat check — this deliberately differs from other
 * d20 games where the attacker rolls a miss chance, and the success/failure
 * mapping differs with it: a Concealed defender avoids only on 17+.
 * Lowering the DC therefore HELPS the defender (Darkened Veil's one-shot
 * `missCheckDCReduction` flag, consumed here). Area effects are exempt —
 * callers must not invoke this for template/area resolution.
 *
 * @param {Actor} targetActor The creature being targeted (rolls the check).
 * @param {object} [options]
 * @param {string} [options.attackerName]
 * @param {string} [options.sourceName] e.g. the weapon or spell name.
 * @returns {Promise<{avoided: boolean, dc: number|null, condition: string|null}>}
 */
export async function missChanceAvoidance(targetActor, { attackerName = "", sourceName = "the attack", attackerActor = null, ignoreConcealed = false } = {}) {
  if (!targetActor?.hasCondition) return { avoided: false, dc: null, condition: null };
  // WHAT THE SENSES ADD (3.621.0; block 39's A9 and R7). Undetected and
  // Unnoticed: a guessed attack "works like targeting a hidden creature
  // (requiring a DC 10 flat check)" — read by nothing until now, so a
  // creature that had Sneaked was easier to hit than one that had Hidden.
  // And from the
  // attacker's side: Blinded, "all creatures are hidden to you"; Dazzled,
  // "all creatures and objects become concealed to you".
  const senses = senseMissChance({
    targetConds: targetActor.conditions?.effective ?? null,
    attackerConds: attackerActor?.conditions?.effective ?? null
  });
  const hidden = Boolean(targetActor.hasCondition("hidden")) || senses.hidden;

  // SHADOWY (Creature Codex): "always concealed if the light level is 6
  // (Twilight) or lower" — a fact about where the creature is standing,
  // not a condition somebody ticked. Read here, at the moment of the
  // attack, so it follows the creature between a lit room and a dark one.
  //
  // WIRED AT 3.366.0. The pack entry has carried its threshold since the
  // ability landed and nothing ever read it, so a Shadowy creature was
  // concealed only when a GM remembered to toggle the condition by hand.
  const { lightConcealment } = await import("../light-check.mjs");
  const { lightLevelForToken } = await import("../light-workflow.mjs");
  const token = targetActor.getActiveTokens?.(true, true)?.[0]
    ?? targetActor.getActiveTokens?.()?.[0]?.document
    ?? null;
  // DESTRUCTURED, like `lightRows` in check-dialog.mjs does: the resolver
  // returns {level, source} and the rule wants the number. 3.366.0 passed
  // the whole object and Shadowy silently never fired.
  const byLight = token
    ? lightConcealment(Array.from(targetActor.items ?? []), lightLevelForToken(token).level)
    : { concealed: false, threshold: null };

  /*
   * SEEN FROM INSIDE A CLOUD (3.608.0, R7). Solid Fog: "all creatures
   * outside the mist become concealed to creatures within it" — a fact
   * about the ATTACKER's position, so it is read off the attacker's own fog
   * effect, beside Blind Fight and Osp-Iar below. See magic/obscuring-zone.mjs.
   */
  const { obscuredFromInside, zoneFlagsOf } = await import("../magic/obscuring-zone.mjs");
  const fogged = attackerActor
    ? obscuredFromInside(zoneFlagsOf(attackerActor.effects), zoneFlagsOf(targetActor.effects))
    : null;
  /*
   * SEEN THROUGH A WALL OF FIRE, OR A STORM'S RAIN (3.610.0). "Everything
   * on each side of the wall is concealed from creatures on the opposite
   * side"; Rain and Wind makes "everything seen within or through the area
   * concealed". A fact about the line between the two, asked of the Regions
   * it crosses. See magic/wall-spell-workflow.mjs.
   */
  const { screenedBetween } = await import("../magic/wall-spell-workflow.mjs");
  const screened = attackerActor ? screenedBetween(attackerActor, targetActor) : null;
  // `ignoreConcealed` (3.616.0): a ranged attack on an active Arrow
  // Catching wearer ignores the concealed condition, whatever produced it.
  const concealed = !ignoreConcealed && (Boolean(targetActor.hasCondition("concealed")) || byLight.concealed || Boolean(fogged)
    || Boolean(screened) || senses.concealed);

  /*
   * INVISIBLE, READ AT LAST (3.597.0, Graham's R12).
   *
   * The condition has been in the registry with a HUD toggle since the
   * condition pass and NOTHING read it, so a GM could tick it and the
   * creature was exactly as easy to hit. See combat/invisibility.mjs for
   * what the Appendix actually says and why the answer is the hidden DC.
   *
   * SEE INVISIBLE LIVES ON THE ATTACKER, because the spell says "concealed
   * condition TO YOU" — the same side Blind Fight and Osp-Iar are read from
   * a few lines below.
   */
  const invisible = Boolean(targetActor.hasCondition("invisible"));
  const { SEE_INVISIBLE, seeInvisibleLevel, seeInvisibleNote } = await import("./invisibility.mjs");
  const seeInvisible = invisible
    ? seeInvisibleLevel(Array.from(attackerActor?.appliedEffects ?? attackerActor?.effects ?? []))
    : SEE_INVISIBLE.NONE;

  const { missChanceDC, invisibleAvoidanceDC } = await import("./attack.mjs");
  let baseDC = missChanceDC({ hidden, concealed, invisible, seeInvisible });
  if (baseDC === null) return { avoided: false, dc: null, condition: null };

  // Blind Fight (Class, Chapter 5), on the ATTACKER: "the flat check for
  // a creature to avoid your attack when hidden is 15 rather than 10" —
  // a HARDER avoidance for the hidden defender. The concealed half
  // ("ignore the concealed condition... within range of a non-visual
  // sense") depends on senses this system doesn't model, so it stays a
  // card note the GM applies by skipping the check.
  const blindFight = Boolean(attackerActor && Array.from(attackerActor.items ?? []).some(
    (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "blind fight"
  ));
  if (blindFight && !concealed && hidden && baseDC === 10) baseDC = 15;

  // Osp-Iar (Chapter 2), on the ATTACKER: "you increase the target's flat
  // check to avoid being hit when concealed or hidden by 2" — a HARDER
  // avoidance for the defender, the mirror of Blind Fight's hidden
  // clause above, and applying to both conditions rather than one.
  const attackerIncrease = Array.from(attackerActor?.appliedEffects ?? attackerActor?.effects ?? [])
    .filter((e) => !e.disabled)
    .reduce((total, e) => total + Math.max(0, Number(e.getFlag?.("trg-prime", "missCheckDCIncrease") ?? 0)), 0);

  // Darkened Veil (Chapter 5): queued one-shot DC reduction for the defender.
  const reduction = Math.max(0, Number(targetActor.getFlag?.("trg-prime", "missCheckDCReduction") ?? 0));
  const dc = Math.max(1, baseDC + attackerIncrease - reduction);
  if (reduction) await targetActor.unsetFlag("trg-prime", "missCheckDCReduction");

  const { TRGCheck } = await import("../dice/check.mjs");
  const { OPEN_ENDED } = await import("../dice/open-ended.mjs");
  /*
   * NAMED BY WHAT PRODUCED THE DC, not by a fixed order. With page 64's
   * highest-DC rule a creature can hold two of these at once, and a card
   * that says "Concealed" for a check the invisibility set tells the table
   * the wrong thing about why the attack might miss.
   */
  const invisibleDC = invisible ? invisibleAvoidanceDC(seeInvisible) : null;
  const condition = invisibleDC === baseDC && invisibleDC !== null
    ? "Invisible"
    : concealed && baseDC === 17 ? "Concealed" : "Hidden";
  // NAMED WHEN IT IS THE LIGHT rather than the condition, so the table can
  // see why a creature nobody marked concealed is suddenly harder to hit.
  const bySource = byLight.concealed && !targetActor.hasCondition("concealed")
    ? " (the light it stands in)"
    : screened && !targetActor.hasCondition("concealed") ? ` (through ${screened})`
    : senses.reasons.length && !targetActor.hasCondition("hidden") && !targetActor.hasCondition("concealed")
      ? ` (${senses.reasons.join("; ")})` : "";
  const check = await TRGCheck.roll({
    actor: targetActor,
    label: `${targetActor.name} — Avoidance Flat Check`,
    subtitle: `${condition}${bySource}${seeInvisibleNote(seeInvisible, invisible)}${attackerName ? ` from ${attackerName}` : ""} — DC ${dc} Flat Check${attackerIncrease ? ` (+${attackerIncrease} from ${attackerName || "the attacker"})` : ""}${reduction ? ` (Darkened Veil −${reduction})` : ""}${blindFight && hidden && !concealed ? " (Blind Fight — DC 15)" : ""}${blindFight && concealed ? " (Blind Fight: skip this check if the attacker senses you non-visually)" : ""} to avoid ${sourceName}`,
    type: "generic",
    openEnded: OPEN_ENDED.NONE,
    dc
  });
  return { avoided: Boolean(check.outcome?.degree?.success), dc, condition };
}
