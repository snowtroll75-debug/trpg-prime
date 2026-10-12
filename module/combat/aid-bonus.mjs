/**
 * Aid Defensive/Offensive (Chapter 4): "You grant the indicated bonus
 * to your ally..." — a bonus granted to a *third party*, not the
 * acting actor and not the attack's own target, consumed against a
 * specific matchup ("against the target's next attack" / "against
 * the target") and expiring "at the beginning of your [the granting
 * actor's] next turn if not used."
 *
 * This system has no way to scope a bonus to a specific opponent
 * matchup automatically (no other mechanic in this codebase does
 * that either), so the granted bonus is applied as a general
 * Defence/Attack bonus, clearly labelled with which specific
 * matchup it's meant for — a GM-adjudicated usage rule, same as
 * this system already leaves plenty of other narrow conditions to
 * the table. What *is* automated: the roll, the bonus tier from the
 * Bonus Check Table, applying it to a chosen ally, and clearing it
 * at the start of the granting actor's own next turn even though the
 * effect lives on a different actor's document entirely.
 */

const { DialogV2 } = foundry.applications.api;
import { createEffectsOn } from "./target-relay-workflow.mjs";
import { activeToken } from "./geometry.mjs";

const SYSTEM_ID = "trg-prime";
const GRANTED_BY_FLAG = "aidBonusGrantedBy";

/**
 * Where the matchup this bonus was granted for is recorded.
 *
 * WHY THE BONUS IS NO LONGER AN ACTIVE EFFECT CHANGE (3.336.0). It used
 * to push its value onto `system.combat.defence.circumstance` — the
 * shared pool every other circumstance modifier writes to — which meant
 * the +2 applied against EVERYBODY. The effect's own description said
 * "only against that target's next attack" and "Remove once used", and
 * neither sentence was true: the label was doing work the mechanism was
 * not, which is precisely the kind of gap this audit keeps finding.
 *
 * A shared pool cannot express "only against this one creature", so the
 * value is carried here instead and read by the attack workflow, which
 * is the one place that knows BOTH sides of the exchange. The effect
 * still exists, still shows on the sheet, and still says what it is for
 * — it simply no longer lies about when it applies.
 */
const AID_FLAG = "aidBonus";

/**
 * Whether these two tokens are on the same side.
 *
 * DISPOSITION IS THE TEST, AND THE TOKEN IS WHAT CARRIES IT (Graham,
 * 18 Aug 2026). The 18 August audit found this prompt — headed "Which
 * ally receives the bonus?" — offering a hostile creature, because the
 * list excluded only yourself and the current target and nothing else.
 * An actor has no side; a token placed on a scene does, so the token is
 * what gets asked.
 *
 * SECRET is never volunteered as an ally, in either direction. A GM who
 * has hidden a token's allegiance has said it is not common knowledge,
 * and answering on their behalf is the one kind of help nobody asked
 * for. They can still grant it by hand.
 *
 * Pure, so the rule is testable without a canvas.
 *
 * @param {number} mine The granting token's disposition.
 * @param {number} theirs The candidate's disposition.
 * @returns {boolean}
 */
export function sameSide(mine, theirs) {
  const a = Number(mine);
  const b = Number(theirs);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const SECRET = -2;
  if (a === SECRET || b === SECRET) return false;
  return a === b;
}

/**
 * Every token on the current scene that could receive this bonus: not
 * the acting actor's own token, not the attack's target, and on the
 * same side as the actor.
 */
function allyCandidates(actorToken, targetTokenId) {
  try {
    const mine = actorToken?.document?.disposition ?? actorToken?.disposition;
    return canvas.tokens.placeables.filter((other) => {
      if (other.id === actorToken?.id || other.id === targetTokenId) return false;
      const theirs = other?.document?.disposition ?? other?.disposition;
      return sameSide(mine, theirs);
    });
  } catch {
    return [];
  }
}

/**
 * Prompts for which ally receives the granted bonus.
 *
 * @param {Actor} actor The granting actor.
 * @param {string|null} targetTokenId The attack's own target token id,
 *   excluded from the candidate list.
 * @returns {Promise<Actor|null>} The chosen ally's actor, or null if
 *   cancelled or nothing to choose from.
 */
export async function promptAllySelection(actor, targetTokenId) {
  // ITS OWN TOKEN (3.622.3; the 3.622.2 drive's F1, Graham's R1): by actor id,
  // a second unlinked copy of the same actor found the first copy's token.
  const actorToken = activeToken(actor);
  const candidates = allyCandidates(actorToken, targetTokenId);
  if (!candidates.length) return null;

  const rows = candidates
    .map(
      (token, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="ally" value="${token.id}" ${index === 0 ? "checked" : ""}>
          <span>${token.name}</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Which ally receives the bonus?", icon: "fa-solid fa-hand-holding-heart" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">${rows}</div>`,
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
          return new FDE(form).object.ally;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;

  const token = candidates.find((candidate) => candidate.id === result);
  return token?.actor ?? null;
}

/**
 * Applies the granted bonus to the chosen ally, flagged with which
 * actor granted it so it can be cleared at the start of that actor's
 * own next turn regardless of whose document the effect lives on.
 *
 * @param {Actor} grantingActor
 * @param {Actor} ally
 * @param {"defensive"|"offensive"} kind
 * @param {number} amount
 * @param {string} targetName For the effect's own label, since the
 *   matchup this bonus is meant for can't be enforced mechanically.
 * @returns {Promise<void>}
 */
export async function applyAidBonus(grantingActor, ally, kind, amount, targetName, targetActorId = null) {
  const isDefensive = kind === "defensive";

  // BENEVOLENT (Chapter 11): "when the wielder of the shield uses the
  // aid defensive action to give an ally a bonus to DB ... they also add
  // the benevolent shield's bonus to the ally's DB." Defensive only —
  // the rune says so, and an offensive Aid gets nothing from a shield.
  let benevolent = 0;
  if (isDefensive) {
    const { equippedEventRune } = await import("../rune-events.mjs");
    const found = equippedEventRune(Array.from(grantingActor.items ?? []), "benevolent");
    // The shield's WHOLE bonus, its potency included (3.615.0, R2 of block 36).
    const { shieldDefenceWithPotency } = await import("../runes.mjs");
    if (found) benevolent = shieldDefenceWithPotency(found.item.system);
  }
  amount = Number(amount ?? 0) + benevolent;
  const name = isDefensive
    ? `Aid Defensive (vs ${targetName}, from ${grantingActor.name})`
    : `Aid Offensive (vs ${targetName}, from ${grantingActor.name})`;

  await createEffectsOn(ally, [
    {
      name,
      img: isDefensive
        ? "icons/magic/defensive/shield-repeating-blue.webp"
        : "icons/skills/melee/strike-flail-blue.webp",
      // NO `changes`. See AID_FLAG: a change writes to a pool that
      // applies against everybody, and this bonus applies against one
      // creature once. The attack workflow reads the flag instead.
      description: isDefensive
        ? `+${amount} circumstance to Defence, only against ${targetName}'s next attack${benevolent ? ` (including +${benevolent} from a Benevolent shield)` : ""}. Removed once used.`
        : `+${amount} circumstance to your next attack against ${targetName}. Removed once used.`,
      flags: {
        [SYSTEM_ID]: {
          [GRANTED_BY_FLAG]: grantingActor.id,
          [AID_FLAG]: {
            kind: isDefensive ? "defensive" : "offensive",
            // The MATCHUP. Held as an actor id rather than a name,
            // because two goblins called Goblin are two creatures.
            against: targetActorId ?? null,
            amount
          }
        }
      }
    }
  ]);
}

/**
 * The Aid bonus this actor holds for this exact matchup, or null.
 *
 * @param {Actor} actor The creature that was aided.
 * @param {object} args
 * @param {"defensive"|"offensive"} args.kind
 * @param {string} args.against The actor id on the other side of the exchange.
 * @returns {{effect: object, amount: number, label: string}|null}
 */
export function aidBonusAgainst(actor, { kind, against } = {}) {
  if (!actor || !against) return null;
  for (const effect of Array.from(actor.effects ?? [])) {
    if (effect.disabled) continue;
    const stored = effect.getFlag?.(SYSTEM_ID, AID_FLAG);
    if (!stored) continue;
    if (stored.kind !== kind) continue;
    // A bonus granted against a creature the system could not identify
    // is not silently applied to everybody — it applies to nobody, and
    // the GM has the card that says what it was for.
    if (!stored.against || stored.against !== against) continue;
    const amount = Number(stored.amount) || 0;
    if (!amount) continue;
    return { effect, amount, label: effect.name };
  }
  return null;
}

/**
 * "Remove once used."
 *
 * @param {Actor} actor
 * @param {object} effect
 * @returns {Promise<boolean>}
 */
export async function consumeAidBonus(actor, effect) {
  if (!actor || !effect?.id) return false;
  await actor.deleteEmbeddedDocuments("ActiveEffect", [effect.id]);
  return true;
}

/**
 * Removes every Aid Defensive/Offensive bonus granted by this actor,
 * wherever it currently lives — called when the granting actor's own
 * turn starts, per "expire at the beginning of your next turn if
 * they are not used." Scans every actor with a token in the current
 * combat, not just the granting actor's own document, since that's
 * specifically where these effects end up.
 *
 * @param {Actor} grantingActor
 * @param {Combat} combat
 * @returns {Promise<void>}
 */
export async function clearExpiredAidBonuses(grantingActor, combat) {
  const actors = new Set(
    (combat?.combatants ?? [])
      .map((combatant) => combatant.actor)
      .filter(Boolean)
  );

  for (const actor of actors) {
    const expired = actor.effects.filter(
      (effect) => effect.getFlag(SYSTEM_ID, GRANTED_BY_FLAG) === grantingActor.id
    );
    if (!expired.length) continue;
    await actor.deleteEmbeddedDocuments(
      "ActiveEffect",
      expired.map((effect) => effect.id)
    );
  }
}
