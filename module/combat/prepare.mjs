/**
 * Prepare (Chapter 4, Basic Actions).
 *
 * "Requirements: You can use reactions. You prepare to use a reaction
 * that will occur outside your turn. Choose a single Reaction that you
 * are able to use. You may use this reaction once as a free action until
 * the beginning of your next turn."
 *
 * THE 18 AUGUST AUDIT FOUND THIS ACTION EMPTY. It spent its 1 AP, printed
 * "choose a single reaction you're able to use", and did nothing else —
 * nothing was chosen, nothing was stored, and no reaction ever became
 * free. Of the thirty Basic Actions it was the only one with no mechanism
 * at all behind a rule that plainly describes one.
 *
 * WHAT "AS A FREE ACTION" IS TAKEN TO MEAN, and what it deliberately is
 * not. Preparing makes the reaction cost nothing from the reaction pool.
 * It does not turn the reaction into something other than a reaction:
 * its trigger still has to happen, and the states that forbid reacting at
 * all — Flat-Footed, Confused, Full Defence — still forbid it. The
 * sentence buys you the resource, not the permission. Anything more than
 * that would be inventing a rule the chapter does not print.
 *
 * ONE PREPARATION AT A TIME, and it does not survive your next turn
 * beginning ("until the beginning of your next turn"), so it is cleared
 * in the same turn-start sweep that expires the stances and the Aid
 * bonuses.
 *
 * The dialog and the flag live here; the pure part — which actions can be
 * prepared, and whether a given use matches — is exported separately so
 * it can be tested without a live actor.
 */

const SYSTEM_ID = "trg-prime";
export const PREPARED_REACTION_FLAG = "preparedReaction";

/**
 * Whether an action's cost makes it a Reaction.
 *
 * @param {object} action
 * @returns {boolean}
 */
export function isReactionCost(action) {
  return String(action?.apCost ?? "").trim().toLowerCase() === "reaction";
}

/**
 * The Reactions this actor could prepare, from the action registries.
 *
 * SHIELD BLOCK IS IN AND SO IS ATTACK OF OPPORTUNITY — both are ordinary
 * Reaction-cost entries and the chapter puts no limit on which reaction
 * may be chosen beyond "one that you are able to use".
 *
 * Reactions granted by a feat, an ability or an item are NOT offered
 * here: they are not in these registries, and inventing entries for them
 * would produce a list that disagrees with the sheet. Recorded rather
 * than guessed.
 *
 * @param {Array} basicActions
 * @param {Array} skillActions
 * @returns {Array<{key: string, name: string}>}
 */
export function preparableReactions(basicActions = [], skillActions = []) {
  const seen = new Set();
  const out = [];
  for (const action of [...basicActions, ...skillActions]) {
    if (!isReactionCost(action)) continue;
    const key = String(action?.key ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name: String(action?.name ?? key) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Whether a stored preparation covers this action.
 *
 * @param {object|null} stored
 * @param {string} actionKey
 * @returns {boolean}
 */
export function preparationCovers(stored, actionKey) {
  if (!stored || stored.used === true) return false;
  return String(stored.key ?? "") === String(actionKey ?? "");
}

/** The actor's current preparation record, or null. */
export function preparedReaction(actor) {
  return actor?.getFlag?.(SYSTEM_ID, PREPARED_REACTION_FLAG) ?? null;
}

/** Stores a preparation, replacing any earlier one. */
export async function storePreparedReaction(actor, { key, name }) {
  await actor.setFlag(SYSTEM_ID, PREPARED_REACTION_FLAG, {
    key: String(key),
    name: String(name),
    used: false
  });
}

/**
 * Spends the preparation, if it covers this action.
 *
 * Marked used rather than deleted, so the card can still say which
 * reaction was prepared for the rest of the turn, and so a second
 * trigger cannot quietly ride the same preparation ("once").
 *
 * @param {Actor} actor
 * @param {string} actionKey
 * @returns {Promise<boolean>} Whether the preparation paid for it.
 */
export async function consumePreparedReaction(actor, actionKey) {
  const stored = preparedReaction(actor);
  if (!preparationCovers(stored, actionKey)) return false;
  await actor.setFlag(SYSTEM_ID, PREPARED_REACTION_FLAG, { ...stored, used: true });
  return true;
}

/** Clears any preparation. Called from the turn-start sweep. */
export async function clearPreparedReaction(actor) {
  if (actor?.getFlag?.(SYSTEM_ID, PREPARED_REACTION_FLAG) === undefined) return;
  await actor.unsetFlag(SYSTEM_ID, PREPARED_REACTION_FLAG);
}

/**
 * Asks which Reaction to prepare.
 *
 * @param {Array<{key: string, name: string}>} choices
 * @returns {Promise<{key: string, name: string}|null>}
 */
export async function promptPreparedReaction(choices) {
  if (!choices.length) return null;
  const { DialogV2 } = foundry.applications.api;
  const rows = choices
    .map(
      (entry, index) =>
        `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
          <input type="radio" name="reaction" value="${entry.key}" ${index === 0 ? "checked" : ""}>
          <span>${entry.name}</span>
        </label>`
    )
    .join("");

  const result = await DialogV2.wait({
    window: { title: "Prepare which Reaction?", icon: "fa-solid fa-bolt" },
    classes: ["trg-prime"],
    position: { width: 360 },
    content:
      `<div class="trg-prime trg-check-dialog">${rows}` +
      `<p class="hint">You may use it once as a free action before your next turn — it costs no reaction from your pool. Its trigger still has to happen.</p></div>`,
    buttons: [
      {
        action: "confirm",
        label: "Prepare",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE =
            foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.reaction;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return choices.find((entry) => entry.key === result) ?? null;
}
