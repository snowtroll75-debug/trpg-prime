/**
 * The Foundry side of CUTTING WORDS (see cutting-words.mjs for the rules
 * and for Graham's ruling that replaced the previous design).
 *
 *   Trigger  target makes an attack or skill check
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THIS REPLACED, AND WHY — because the old design read well and did
 * not work.
 *
 * Until 3.432.0 the offer was a BUTTON drawn on the triggering check's
 * own card, so the penalty could be applied to the roll it belonged to
 * and everyone watched the number move. That reasoning is sound and the
 * machinery worked. Two things killed it:
 *
 *   - IT COULD NOT SEE A MONSTER. Finding the roller's token went through
 *     `activeToken`, which asked `getActiveTokens(true)` — Foundry's
 *     `linked` parameter, not "on the canvas" as its own doc comment
 *     said. An unlinked token answers zero, and every monster in a normal
 *     game is unlinked. The button therefore appeared on a LINKED actor's
 *     card and nowhere else, which is why the only place Graham ever saw
 *     Cutting Words was a friendly player's roll.
 *   - AND IT WAS THE WRONG DESIGN ANYWAY. Graham, 28 August 2026: "It
 *     should be triggered only by the caster of the spell. After an
 *     attack or skill check has been announced (nothing mechanical here
 *     just talk at the table), the player with the spell would cast the
 *     spell and select an eligible target."
 *
 * So there is no hook on anybody else's card now. The Bard casts from
 * their own sheet like any other spell — which already spends the
 * Reaction, spends the PP, gates the verbal component and rolls the
 * target's real Will save against a real Save DC — and what this file
 * adds is the only part that was ever missing: the penalty going
 * somewhere.
 *
 * IT WAITS ON THE TARGET. Under Graham's sequence the announced action
 * has not been rolled when the spell resolves, so there is no card to
 * modify. The penalty is recorded here and consumed by the target's next
 * attack roll or skill check in `dice/check.mjs` — the one place every
 * check in this system passes through.
 */

import {
  CUTTING_WORDS_FLAG, CUTTING_WORDS_RANGE, cuttingWordsRecord, cuttingWordsTargetEligibility
} from "./cutting-words.mjs";
import { activeToken, distanceBetween } from "../combat/geometry.mjs";
import { parseRangeFeet } from "./spell-template.mjs";
import { sameSide } from "../combat/aid-bonus.mjs";

const SYSTEM_ID = "trg-prime";

/*
 * NO `cuttingWordsSpellOf` ANY MORE. It existed to find the spell on a
 * would-be reactor while sweeping every actor a user controlled, which is
 * the design Graham replaced: the Bard now casts from their own sheet, so
 * the spell is the one they clicked and nothing has to go looking for it.
 */

/**
 * Why a cast at an enemy may not go ahead, or null.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ENEMIES ONLY, DECLARED ON THE SPELL (3.434.0).
 *
 * Graham's ruling, 28 August 2026, and Cutting Words' own sentence: "you
 * sow confusion and doubt in the mind of your ENEMIES". The Targets line
 * says "1 creature", which is what let the old design offer it on every
 * ally's card.
 *
 * KEYED ON THE SPELL'S OWN DECLARATION, NOT ON ITS NAME. 3.432.0 shipped
 * this matching `spell.name === "cutting words"`, recorded at the time as
 * "the weak part of this" — every other per-spell behaviour in the system
 * is declared on the pack entry, and a name match is a rule only its
 * author can find.
 *
 * `areaTargeting: "enemies"` IS THAT DECLARATION, and it is reused rather
 * than invented. The field already means "which side is this aimed at",
 * `keepByMode` and `beneficialTraditionSave` already read it, and it
 * lives in `system` — so the repair manifest that reaches copies
 * characters already own covers it without needing to learn about flags.
 * Its two existing readers are both safe here: one sits inside an
 * area-only branch, and the other reacts only to "allies".
 *
 * NO AREA IS PART OF THE TEST. An area spell already filters by
 * disposition when its template is placed; this is the gate for a
 * TARGETED spell, where the player picks and nothing else checks.
 * Across the whole pack, exactly one spell now declares this pair.
 *
 * THE RANGE COMES FROM THE SPELL TOO, not from a constant — so the next
 * spell to declare it is gated at its own printed reach.
 *
 * @param {Actor} caster
 * @param {Item} spell        the spell being cast
 * @param {Token[]} targets   the tokens currently targeted
 * @returns {string|null}
 */
export function dispositionRefusal(caster, spell, targets = []) {
  const ask = dispositionReasonFor(caster, spell);
  if (!ask) return null;

  const chosen = Array.from(targets ?? []);
  if (!chosen.length) return `${caster?.name ?? "The caster"} must target one creature.`;

  for (const token of chosen) {
    const reason = ask(token);
    if (reason) return `${token?.name ?? "That target"} ${reason}.`;
  }
  return null;
}

/**
 * The one question, asked of ONE token — or null when this spell declares
 * no side and the question does not arise.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EXTRACTED AT 3.443.2 SO THE PICKER CAN ASK IT TOO.
 *
 * Driving 3.443.1 at the table showed the gate refusing an enemy
 * correctly — and showed the picker still listing that enemy as a plain
 * row, so the refusal arrived only after the player had chosen and
 * pressed Continue. Nothing was spent, but the player was offered a name
 * the spell can never reach.
 *
 * Graham's ruling of 27 August 2026 governs what may be done about that,
 * and it forbids the obvious fix: *"The picker OFFERS; it does not
 * adjudicate... a picker that silently removes a legal choice is worse
 * than one that allows a strange one, because a player can see a bad idea
 * and decline it but cannot see an option that is not there."* So no row
 * is removed. The row is ANNOTATED with this function's own answer, which
 * is the same sentence the gate would print, arriving one step earlier.
 *
 * RETURNING A CLOSURE rather than a per-token export is what keeps the
 * caster's token, the range and the side resolved ONCE for a whole
 * dialog. It is also why `dispositionRefusal` is written in terms of this
 * rather than beside it: two functions answering "may this spell reach
 * that creature" would be exactly the second place this project keeps
 * paying to remove.
 *
 * @param {Actor} caster
 * @param {Item} spell
 * @returns {((token: Token) => string|null)|null}
 */
export function dispositionReasonFor(caster, spell) {
  const system = spell?.system ?? {};
  if (String(system.area ?? "").trim()) return null;
  // RENAMED AND WIDENED AT 3.443.1. It was `enemiesOnlyRefusal` and it
  // answered only to the word "enemies", so Counter Perform's
  // `areaTargeting: "allies"` was inert and a Bard could shield a foe —
  // found by driving the spell, not by the harness, which had asserted
  // only that the pack carried the word. One gate now answers the side
  // question for both spells, because two gates would be two places
  // deciding it.
  const side = String(system.areaTargeting ?? "").trim().toLowerCase();
  if (side !== "enemies" && side !== "allies") return null;

  const casterToken = activeToken(caster);
  const rangeFeet = parseRangeFeet(String(system.range ?? "")) ?? CUTTING_WORDS_RANGE;

  return (token) => {
    const verdict = cuttingWordsTargetEligibility({
      // DISPOSITIONS, NOT TOKENS. `sameSide` takes two NUMBERS — 3.432.0
      // handed it the token objects, so `Number(token)` was NaN, the
      // function answered false for every pair, and `!false` made every
      // ally read as an enemy. The gate was inert from the day it
      // shipped: it refused nothing, and Graham's original complaint
      // would still have been live through this door. Found by driving
      // it on 29 August 2026, not by the harness, which only asserted
      // that `sameSide` was imported rather than that it was called
      // correctly.
      isEnemy: casterToken && token
        ? !sameSide(casterToken.document?.disposition, token.document?.disposition)
        : false,
      distance: casterToken && token ? distanceBetween(casterToken, token) : null,
      isSelf: Boolean(casterToken) && token?.id === casterToken.id,
      rangeFeet,
      side
    });
    return verdict.eligible ? null : verdict.reason;
  };
}

/**
 * Leave the penalty waiting on the creature the spell landed on.
 *
 * WRITTEN TO THE TOKEN'S OWN ACTOR, which is what the caller hands over.
 * An unlinked token has its own actor document, and writing to the base
 * actor instead would penalise every goblin sharing that stat block — the
 * same class of mistake as reading tokens through `activeToken`.
 *
 * A CRITICAL SAVE WRITES NOTHING. `cuttingWordsRecord` returns null and
 * this returns null with it, so a creature that shrugged the words off
 * carries no flag at all rather than a zero pretending to be an effect.
 *
 * @param {Actor} target the actor behind the targeted token
 * @param {object} options
 * @param {string} options.degree     the target's Will-save degree
 * @param {string} options.casterName for the line the consuming card prints
 * @param {number|null} options.round
 * @returns {Promise<object|null>} what is now waiting, or null
 */
export async function recordCuttingWords(target, { degree = "", casterName = "", round = null } = {}) {
  if (!target) return null;
  const record = cuttingWordsRecord({ degree, casterName, round });
  if (!record) return null;
  // A SECOND CAST REPLACES THE FIRST ONLY IF IT IS WORSE, rather than
  // stacking. The penalty is circumstance-typed, so Appendix 1's
  // highest-wins rule governs two of them wherever they land; keeping the
  // larger here means the flag says what the pool would have said.
  const held = target.getFlag(SYSTEM_ID, CUTTING_WORDS_FLAG) ?? null;
  if (held && Number(held.penalty) <= record.penalty) return held;
  await target.setFlag(SYSTEM_ID, CUTTING_WORDS_FLAG, record);
  return record;
}

/** What this creature is carrying, or null. */
export function pendingCuttingWords(actor) {
  return actor?.getFlag?.(SYSTEM_ID, CUTTING_WORDS_FLAG) ?? null;
}

/**
 * Take the spent penalty off the creature.
 *
 * CLEARED WHETHER OR NOT IT CHANGED THE OUTCOME. The spell was cast at
 * one announced action and that action has now happened; a penalty that
 * lost to a larger circumstance modifier was still spent on that roll.
 *
 * SWALLOWS ITS OWN FAILURE, deliberately. This runs inside a roll that
 * has already happened, and throwing here would lose the roll to clean up
 * a flag — leaving the player with no card at all rather than a card with
 * a stale flag behind it.
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function consumeCuttingWords(actor) {
  if (!actor?.unsetFlag) return;
  try {
    await actor.unsetFlag(SYSTEM_ID, CUTTING_WORDS_FLAG);
  } catch (error) {
    console.error("TRG Prime | Could not clear a spent Cutting Words penalty", error);
  }
}
