/**
 * What the target picker should SAY.
 *
 * NEW at 3.407.2. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND IN LIVE PLAY, 25 August 2026, testing Healing Earth.
 *
 * The picker greeted a caster transforming a handful of mud with:
 *
 *     "Choose the target(s) for this attack."
 *
 * Healing Earth is a cantrip whose printed target is "a handful of dirt
 * or mud". It has no attack roll, no save, and no hostile target of any
 * kind — and the prompt asked which creature to attack.
 *
 * The sentence was hardcoded in `promptTargetSelection`, which serves
 * weapon attacks, alchemical items and every targeted spell alike. For an
 * attack it was right; for the other two it had been wrong the whole time
 * and nobody had said so, because a wrong word costs nothing until
 * somebody reads it.
 *
 * WHY THIS IS NOT MERELY COSMETIC. Graham's own standard on this project
 * is that a card must describe the outcome it actually has — the Grapple
 * lesson at §5.9, where the table was corrected and the card went on
 * describing the behaviour it used to have. A prompt that calls a healing
 * cantrip an attack is the same defect at the other end of the workflow:
 * the interface asserting something about the rules that is not true.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SPELL'S OWN WORDS ARE BETTER THAN ANY WORDING I CHOOSE.
 *
 * Every spell in the pack carries a printed `targets` line — "1 creature",
 * "1 ally and 1 enemy", "a handful of dirt or mud". Showing it turns the
 * prompt from a generic question into the book's own instruction, and
 * costs nothing to maintain, because the text is already there.
 */

/** What the picker says when nothing more specific is known. */
export const DEFAULT_TARGET_PROMPT = "Choose the target(s).";

/** What an attack says — the original wording, kept where it is correct. */
export const ATTACK_TARGET_PROMPT = "Choose the target(s) for this attack.";

/**
 * The prompt for one target selection.
 *
 * @param {object} [options]
 * @param {boolean} [options.isAttack] true for a weapon or spell attack
 * @param {string} [options.targets] the printed `targets` line, if any
 * @returns {string}
 */
export function targetPromptText({ isAttack = false, targets = "" } = {}) {
  const printed = String(targets ?? "").trim();

  // THE PRINTED LINE WINS, EVEN FOR AN ATTACK. "Targets 1 living
  // creature" is more use to a player than "for this attack", and an
  // attack spell that names its targets has said something the generic
  // sentence cannot.
  if (printed) return `Targets: ${printed}`;

  return isAttack ? ATTACK_TARGET_PROMPT : DEFAULT_TARGET_PROMPT;
}

/**
 * What ONE ROW of the picker says beyond the creature's name.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NEW at 3.443.2, and it exists because a row said nothing.
 *
 * Some spells declare a side — Cutting Words names enemies, Counter
 * Perform allies — and the gate in `cutting-words-workflow.mjs` refuses a
 * target on the wrong one. Driving Counter Perform on 31 August 2026
 * showed that gate working and showed the picker one step above it still
 * listing a hostile token as an ordinary row: the player ticked it,
 * pressed Continue, and only then learned the spell could not reach it.
 * Nothing was spent, but nothing was said either.
 *
 * THE ROW IS NOT REMOVED, and that is Graham's ruling of 27 August 2026
 * rather than a preference of mine: "a picker that silently removes a
 * legal choice is worse than one that allows a strange one, because a
 * player can see a bad idea and decline it but cannot see an option that
 * is not there." An annotation is the shape that obeys it — everything
 * still offered, and the reason printed where the choice is made.
 *
 * IT SWALLOWS A THROWING NOTE. This is decoration on a dialog a player is
 * waiting at, and the gate downstream refuses regardless; a `note` that
 * throws must cost the annotation and nothing else.
 *
 * PURE, so the harness can DRIVE it. The dialog around it cannot be
 * imported outside Foundry, and a claim about this behaviour that only
 * matched source text would repeat the mistake 3.443.1 was written to
 * stop repeating.
 *
 * @param {object} token the row's token
 * @param {((token: object) => (string|null))|null} note the caller's gate
 * @returns {string} markup to append to the row, or "" for an ordinary row
 */
export function targetRowNote(token, note) {
  if (typeof note !== "function") return "";
  let reason = null;
  try {
    reason = note(token);
  } catch {
    return "";
  }
  const text = String(reason ?? "").trim();
  if (!text) return "";
  return ` <em class="trg-target-note">— ${text}</em>`;
}

/**
 * Should the picker warn before letting an empty selection through?
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 1 September 2026: "If nothing ticked, best route would
 * be to prompt with a warning before allowing to continue."
 *
 * FOUND BY DRIVING 3.449.0. Pressing Continue with no box ticked cast
 * Seer's Vision, spent the PP, and printed `seersVision effect — no
 * target to apply to`. The card told the truth — that is this project's
 * standard and it held — but the player had already paid for a spell that
 * reached nobody.
 *
 * A WARNING, NOT A REFUSAL, and the distinction is the ruling itself.
 * An empty confirmation is sometimes exactly what a player means: the
 * 3.286.0 playtest found a Fighter swinging at himself because a stale
 * target survived an empty dialog, and clearing every target is how that
 * is now undone. A picker that refused would break that, and would be the
 * silent removal Graham's ruling of 27 August 2026 forbids wearing a
 * different hat. So the player is told what is about to happen and may
 * still say yes.
 *
 * ONLY WHEN SOMETHING WAS OFFERED. An empty scene already returns early
 * without a dialog; warning that nobody was ticked when nobody could be
 * would be a sentence about the system rather than about the choice.
 *
 * EVERY CALLER OF THIS PICKER WANTS A TARGET, which is what makes one
 * unconditional rule safe here. Area spells never reach it —
 * `spellNeedsTarget` keeps them out, "their template decides who is
 * caught" — and the other two callers are a weapon attack and a thrown
 * alchemical item.
 *
 * @param {number} selectedCount how many boxes were ticked
 * @param {number} offeredCount how many rows the dialog showed
 * @returns {boolean}
 */
export function warnsOnEmptySelection(selectedCount, offeredCount) {
  const picked = Number(selectedCount);
  const offered = Number(offeredCount);
  if (!Number.isFinite(picked) || !Number.isFinite(offered)) return false;
  if (offered < 1) return false;
  return picked < 1;
}

/**
 * What that warning says.
 *
 * IT NAMES NO SPECIFIC COST. This dialog serves spells, weapon attacks
 * and thrown items, and the three do not spend the same things — a
 * sentence promising "the PP" would be false two callers out of three,
 * which is the Grapple defect in miniature.
 */
export const EMPTY_SELECTION_WARNING =
  "Nothing is ticked. This will still be resolved and its cost spent, "
  + "but no creature will be affected.";

/**
 * The ids actually ticked, out of what the form hands back.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS EXISTS BECAUSE 3.450.0's WARNING COULD NEVER FIRE, and the reason
 * is a fact about Foundry nobody had measured.
 *
 * `FormDataExtended` returns ONE ENTRY PER CHECKBOX, not one per ticked
 * box, with `null` in every unticked slot. Measured live in Graham's
 * world on 1 September 2026, four rows:
 *
 *   nothing ticked  ->  [null, null, null, null]
 *   "bbb" ticked    ->  [null, "bbb", null, null]
 *   two ticked      ->  [null, "bbb", "ccc", null]
 *
 * So the array's LENGTH is the number of rows the dialog drew and never
 * the number of creatures chosen. 3.450.0 asked
 * `warnsOnEmptySelection(result.length, ordered.length)`, which was
 * always `(4, 4)` — a rule that was correct, imported, called, and handed
 * a number that could not mean what it was being asked to mean.
 *
 * THE OLD CODE SURVIVED THIS BY ACCIDENT. `new Set(result)` then
 * `selectedIds.has(token.id)` simply never matched `null` against a token
 * id, so the nulls were harmless where they landed and nobody had reason
 * to look at them.
 *
 * PURE, AND THAT IS THE POINT. The interpretation of a Foundry-shaped
 * value used to live inside a dialog callback the harness cannot run, so
 * no check could see it was wrong — `verify-empty-target` asserted the
 * call existed and the rule was right, and both were. A claim about an
 * ARGUMENT has to be able to drive that argument.
 *
 * @param {unknown} raw whatever `FormDataExtended` produced for the field
 * @returns {string[]} the ticked ids, in row order
 */
export function selectedTargetIds(raw) {
  if (raw === null || raw === undefined) return [];
  // A SINGLE CHECKBOX CAN COME BACK BARE, not wrapped in an array.
  const rows = Array.isArray(raw) ? raw : [raw];
  return rows.filter((id) => typeof id === "string" && id.trim() !== "");
}
