/**
 * TICK-BOXES ON A ROLL THAT OPENS NO DIALOG (3.667.3).
 *
 * Graham, 23 October 2026, after the live test of Inner Tempest 0.4.1:
 * "Please build the proposed fix".
 *
 * A conditional its author did not mark `auto` is a question: "does this
 * apply here?" ("+1 against a creature possessing another — tick if the
 * target is one"). Until now only the check dialog asked it, and the dialog
 * opens for a check rolled from the sheet and for a skill action, nothing
 * else. A weapon attack, a Spellcraft check and a save forced by a spell or
 * an ability never open it, so a tick-box written for those rolls was never
 * offered, and never applied: Inner Tempest's Spirit Stance (its possession
 * clause) and Echoes Beyond, and Pillars of Faith's five Spellcraft rows
 * (Hedge Witch, Mend the Spirit, Cleansing Hands, Break the Working,
 * Forbidden Research).
 *
 * Now such a roll asks first, in one small prompt, before the dice: the
 * matching tick-boxes, all unticked, and Roll. Nothing is shown when none
 * match, so most rolls are unchanged.
 *
 * WEAPON ATTACKS AND SPELLCRAFT ONLY (Graham's ruling, 23 October 2026). A
 * forced save stays as it was: 62 save tick-boxes (15 core, 44 Pillars of
 * Faith, 3 Inner Tempest) are written as "tick if this save is against X",
 * and asking them on every forced save, X or not, would be noise. Observe
 * Technique and Root the Body are offered on a save rolled from the sheet. Holding Shift still skips the
 * questions, as it skips the dialog (`offerConditionals: false`). The
 * client that rolls asks, when its user owns the character or is the GM;
 * anyone else is not asked, as before.
 *
 * Pure section first.
 */

const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));

/* ------------------------------------------------------------------ */
/* Pure                                                                 */
/* ------------------------------------------------------------------ */

/**
 * The rows to ask about: those that match this roll and are not `auto`
 * (the `auto` ones are applied already, unasked).
 *
 * @param {object[]} rows from conditionalRows
 * @returns {object[]}
 */
export function offeredRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && !row.auto);
}

/** The rolls that ask: a weapon attack and a Spellcraft check (Graham, 23 Oct 2026). */
const OFFERED_CHECK_TYPES = Object.freeze(["attack", "spellcraft"]);

/**
 * Should this roll ask at all? Only a weapon attack or a Spellcraft check;
 * not on a flat check, not when the dialog has already answered
 * (`resolved`), not when the roller skipped the questions (`offer` false:
 * Shift), and only when a row matches.
 *
 * @param {{checkType?: string, offer?: boolean, resolved?: boolean, flat?: boolean, count?: number}} args
 */
export function shouldOffer({ checkType = "", offer = true, resolved = false, flat = false, count = 0 } = {}) {
  return OFFERED_CHECK_TYPES.includes(String(checkType)) && Boolean(offer) && !resolved && !flat && Number(count) > 0;
}

/**
 * Is an answer given elsewhere applied? (3.669.2; Graham's ruling of 24
 * October 2026.) A roll that asked its own ticks — Aid Another, in its own
 * dialog — passes the answer as `conditionalChoices`, and it is applied on
 * any check type: the 23 October limit is on where the small prompt ASKS,
 * not on honouring an answer. Not on a flat check, not when the check
 * dialog answered already, and only when a row matches.
 *
 * @param {{resolved?: boolean, flat?: boolean, count?: number}} args
 */
function appliesAnswer({ resolved = false, flat = false, count = 0 } = {}) {
  return !resolved && !flat && Number(count) > 0;
}

/** May this screen ask for this character? Its owner, or the GM. */
export function mayAskFor({ isGM = false, isOwner = false } = {}) {
  return Boolean(isGM || isOwner);
}

/**
 * The prompt's body: who rolls what, and each row unticked.
 *
 * @param {{actorName: string, label: string, rows: object[]}} args
 * @returns {string} HTML
 */
export function offeredContent({ actorName = "", label = "Check", rows = [] } = {}) {
  const lines = rows.map((row) => `<div class="trg-inline">`
    + `<input type="checkbox" name="offered" value="${esc(row.id)}">`
    + ` <span><strong>${esc(row.detail)}</strong> — ${esc(row.summary)}</span></div>`).join("");
  return `<div class="trg-prime trg-check-dialog">`
    + `<p><strong>${esc(actorName)}</strong> — ${esc(label)}. Does any of these apply to this roll? Tick those that do.</p>`
    // A PLAIN BLOCK, NOT A FORM-GROUP (3.667.4; found live on 3.667.3): the
    // form-group's grid squeezed each row into one narrow column.
    + `<div class="trg-conditional-modifiers">${lines}</div>`
    + `<p class="hint">Unticked ones do not apply. Shift skips this question.</p></div>`;
}

/**
 * The answer, kept to the rows that were offered.
 *
 * @param {string[]} ids what was ticked (or carried over from an earlier roll)
 * @param {object[]} rows the offered rows
 */
export function chosenIds(ids = [], rows = []) {
  const offered = new Set(rows.map((row) => row.id));
  return (Array.isArray(ids) ? ids : []).filter((id) => offered.has(id));
}

/* ------------------------------------------------------------------ */
/* Foundry                                                              */
/* ------------------------------------------------------------------ */

/**
 * Ask, and wait. Closing the prompt applies none.
 *
 * @param {TRGCheck} check
 * @param {object[]} rows the offered rows
 * @returns {Promise<string[]>} the ticked ids
 */
async function askOfferedConditionals(check, rows) {
  const DialogV2 = globalThis.foundry?.applications?.api?.DialogV2;
  if (!DialogV2 || !rows.length) return [];
  const answer = await DialogV2.wait({
    window: { title: `${check.label ?? "Check"} — before the roll` },
    classes: ["trg-prime"],
    content: offeredContent({ actorName: check.actor?.name ?? "", label: check.label ?? "Check", rows }),
    buttons: [{
      action: "roll",
      label: "Roll",
      default: true,
      callback: (event, button) => Array.from(button.form?.querySelectorAll?.('input[name="offered"]:checked') ?? []).map((input) => input.value)
    }],
    rejectClose: false
  });
  return Array.isArray(answer) ? answer : [];
}

/**
 * The tick-boxes this roll matches, asked and applied. Called by
 * `TRGCheck.roll` beside the automatic ones, with the same entries and the
 * same context.
 *
 * A roll made again (Alter the Thread) passes `conditionalChoices`: the
 * first roll's answer stands and nothing is asked twice.
 *
 * @param {TRGCheck} check
 * @param {object[]} entries from collectConditionals
 * @param {object} context the check's conditional context
 * @param {object} bias the BIAS enum
 */
export async function offerConditionalsOnRoll(check, entries, context, bias) {
  const { applyConditionalSelections, conditionalRows, resolveBias } = await import("../conditionals.mjs");
  const rows = offeredRows(conditionalRows(entries, context));
  // AN ANSWER ALREADY GIVEN (3.669.2) is applied on any check: Aid Another's
  // own dialog asks its ticks and hands the answer over. Only the asking
  // here stays with a weapon attack or a Spellcraft check.
  const answered = Array.isArray(check.conditionalChoices);
  if (answered
    ? !appliesAnswer({ resolved: check.conditionalsResolved, flat: check.flat, count: rows.length })
    : !shouldOffer({ checkType: check.type, offer: check.offerConditionals, resolved: check.conditionalsResolved, flat: check.flat, count: rows.length })) return;
  let ids;
  if (Array.isArray(check.conditionalChoices)) ids = chosenIds(check.conditionalChoices, rows);
  else if (mayAskFor({ isGM: globalThis.game?.user?.isGM, isOwner: Boolean(check.actor?.isOwner) })) ids = chosenIds(await askOfferedConditionals(check, rows), rows);
  else return;
  check.conditionalChoices = ids;
  if (!ids.length) return;
  const taken = applyConditionalSelections(rows, ids);
  check.modifiers.push(...taken.modifiers);
  if (taken.kinds.length) check.bias = resolveBias(check.bias, taken.kinds, bias);
  // A one-shot spent when used, exactly as the dialog and the automatic
  // path spend theirs.
  for (const { sourceId, label } of taken.spent ?? []) {
    const effect = check.actor?.effects?.get?.(sourceId);
    if (effect?.delete) await effect.delete();
    else globalThis.ui?.notifications?.warn?.(`${label || "A one-shot bonus"} was used but could not be cleared — remove it by hand.`);
  }
}
