/**
 * The kind gate at the point of casting (Chapter 5).
 *
 * `kind-targeting.mjs` answers the question — may this spell reach that
 * creature — and is deliberately a pure reader of plain objects, so it can be
 * driven by a harness with no world. THIS file is the half that needs a live
 * Foundry: it reads `game.user.targets`, warns, and prunes. Same split as
 * `component-gate.mjs` beside it.
 *
 * WHY IT IS A SEPARATE FILE AND NOT FOUR LINES INLINE. 3.315.0 put the gate
 * inline in `cast-workflow.mjs`, above `promptTargetSelection`, and read only
 * `targets[0]`. Both halves of that were wrong, and both were invisible to a
 * harness that could only assert the gate appeared *somewhere* before the roll.
 * A named function is a thing checks can be written against.
 *
 * THE TWO RULINGS THIS ENCODES (Graham, 15 Aug 2026, after the live pass):
 *
 *   1. A MIXED TARGET SET IS PRUNED, NOT REFUSED. "Fire at the wolf, skip the
 *      goblin, say so." Charm Animal aimed at a wolf and a goblin charms the
 *      wolf; the goblin is untargeted before anything resolves and is named on
 *      the card. Graham's own note on choosing this: the player might not read
 *      the note and think the goblin got charmed — which is why the skipped
 *      names go on the RESULT card rather than only into a notification that
 *      scrolls away.
 *   2. NOTHING ELIGIBLE IS A REFUSAL. Pruning has no meaning when every target
 *      is ineligible, so that case refuses outright and spends nothing — the
 *      behaviour 3.315.0 already had for its single target, preserved.
 *
 * PRUNING IS DONE BY UNTARGETING, not by threading a filtered list through the
 * workflow. `cast-workflow.mjs` reads `game.user.targets` in five separate
 * places downstream (effect application, save resolution, attack resolution,
 * the affected-UUID list); a filtered list handed to one of them would leave
 * the other four reading the unfiltered set, which is the same class of
 * half-applied rule this gate exists to close. Untargeting fixes all five at
 * once and the player SEES it happen — the reticle leaves the goblin.
 */

import { kindGateResult } from "../kind-targeting.mjs";
import { alignmentChannelNote } from "./alignment-channel.mjs";

/** Every feat name on an actor, for the rules that can widen a gate. */
export function featNamesOf(actor) {
  return Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);
}

/**
 * Is this spell one whose AREA decides its targets?
 *
 * THE GAP THIS CLOSES (3.352.0). `applyKindGate` runs before any PP is
 * spent, which is right — a refusal must cost nothing. But an area
 * spell's targets are not known until its template is placed, a
 * thousand lines later, so at gate time `game.user.targets` is empty,
 * and the gate's "aimed at nothing" branch refused the cast outright.
 *
 * Nothing had noticed, because every kind-gated spell in the pack was a
 * single-target one. Turn Undead is the first area spell to carry a gate
 * — a 30-foot emanation whose own note reads "Undead only" — and adding
 * that gate without this would have made the spell uncastable, which is
 * a worse bug than the one it fixes.
 *
 * An area spell is gated by `filterAreaByKind` instead, against the
 * targets its template actually caught.
 */
export function isAreaSpell(spellData) {
  return Boolean(String(spellData?.area ?? "").trim());
}

/**
 * Drop from an area's catch anything the spell's kind gate does not reach.
 *
 * Pure but for the actor it reads feats off: takes the actors a template
 * caught and returns the ones the spell may affect, plus who was dropped
 * and why — the same shape `applyKindGate` returns, so the card wording
 * is written once.
 *
 * @param {Actor} actor
 * @param {object} spellData
 * @param {Array<Actor>} caught
 * @returns {{kept: Array, skipped: Array<{name: string, reason: string}>, widened: string[]}}
 */
export function filterAreaByKind(actor, spellData, caught) {
  const gate = spellData?.kindGate;
  const list = Array.isArray(caught) ? caught : [];
  if (!gate) return { kept: list, skipped: [], widened: [] };

  const featNames = featNamesOf(actor);
  const beneficial = Boolean(spellData?.beneficial);
  const kept = [];
  const skipped = [];
  const widened = [];
  for (const target of list) {
    if (!target) continue;
    const verdict = kindGateResult(
      actor?.system, target.system, gate, target.name, { featNames, beneficial }
    );
    if (verdict.allowed) {
      kept.push(target);
      if (verdict.widenedBy) widened.push(target.name);
    } else {
      skipped.push({ name: target.name, reason: verdict.reason });
    }
  }
  return { kept, skipped, widened };
}

/** The card line naming who Alignment Channel let through, or "". */
export function areaWidenedText(widened) {
  return alignmentChannelNote(widened);
}

/**
 * Judge, prune, and report.
 *
 * @param {Actor} actor The caster.
 * @param {Item} spell The spell being cast (for its name).
 * @param {object} spellData The spell's `system` — `kindGate` is read from it.
 * @returns {{allowed: boolean, skipped: Array<{name: string, reason: string}>}}
 *   `allowed: false` means the caller must abort having spent nothing. `skipped`
 *   lists the targets removed from the set, for the card.
 */
export function applyKindGate(actor, spell, spellData) {
  const gate = spellData?.kindGate;
  const spellName = spell?.name ?? "This spell";
  if (!gate) return { allowed: true, skipped: [], widened: [] };

  const targeted = Array.from(game.user?.targets ?? []);

  // AIMED AT NOTHING. Unchanged from 3.315.0, and it stays a refusal rather
  // than becoming a prune: there is no target to keep.
  if (!targeted.length) {
    ui.notifications.warn(`${spellName} must be aimed at a creature — target one first.`);
    return { allowed: false, skipped: [], widened: [] };
  }

  const featNames = featNamesOf(actor);
  const beneficial = Boolean(spellData?.beneficial);
  const eligible = [];
  const skipped = [];
  const widened = [];
  for (const token of targeted) {
    const targetActor = token?.actor ?? null;
    if (!targetActor) continue;
    const verdict = kindGateResult(
      actor.system, targetActor.system, gate, targetActor.name, { featNames, beneficial }
    );
    if (verdict.allowed) {
      eligible.push(token);
      // ALIGNMENT CHANNEL SAYS SO OUT LOUD. A demon caught by a spell
      // whose gate reads "undead" looks like a bug unless the card
      // names the feat that allowed it.
      if (verdict.widenedBy) widened.push(targetActor.name);
    } else {
      skipped.push({ name: targetActor.name, reason: verdict.reason });
    }
  }

  // EVERY TARGET INELIGIBLE. Refuse, and say why for each — one reason per
  // creature rather than a single summary, because "Charm Kind: you have no
  // creature type recorded" and "the wolf is not a humanoid" are different
  // problems with different fixes and a merged message would hide that.
  if (!eligible.length) {
    for (const miss of skipped) ui.notifications.warn(`${spellName}: ${miss.reason}`);
    return { allowed: false, skipped, widened };
  }

  // SOME ELIGIBLE. Prune the rest out of the target set before any of the five
  // downstream readers see it, and tell the player now as well as on the card.
  if (skipped.length) {
    for (const token of targeted) {
      if (eligible.includes(token)) continue;
      token.setTarget(false, { releaseOthers: false, groupSelection: true });
    }
    ui.notifications.info(
      `${spellName}: ${skipped.map((s) => s.name).join(", ")} skipped — ${skipped[0].reason}`
    );
  }

  return { allowed: true, skipped, widened };
}

/**
 * The card line naming who was dropped, or "" when nobody was.
 *
 * Kept here beside the rule rather than in the workflow so that the wording and
 * the pruning cannot drift apart.
 *
 * @param {Array<{name: string, reason: string}>} skipped
 * @returns {string}
 */
export function kindSkippedText(skipped) {
  const list = Array.isArray(skipped) ? skipped : [];
  if (!list.length) return "";
  const names = list.map((s) => s.name).join(", ");
  return list.length === 1
    ? `Not affected — ${names}: ${list[0].reason}`
    : `Not affected — ${names}. ${list.map((s) => s.reason).join(" ")}`;
}
