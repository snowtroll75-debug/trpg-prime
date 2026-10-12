/**
 * Escape (Core 3.1, Chapter 4 — Basic Actions). Pure logic; the chooser
 * lives in escape-workflow.mjs.
 *
 * "Once you've chosen the target of your escape attempt, attempt an
 * **Acrobatics, Athletics or Unarmed Attack** check against the effect's
 * DC."
 *
 * Three routes, and until 3.336.0 the action offered one. It surfaced
 * under Acrobatics because that is where Chapter 4's skill table files
 * it, and the other two were description text — so a grappled fighter
 * with no Acrobatics rolled the wrong skill or rolled nothing.
 *
 * THE THIRD ROUTE IS NOT A SKILL, which is why this is a chooser rather
 * than a longer `skills` array. Acrobatics and Athletics are skills and
 * change only which bonus the check draws on; an Unarmed Attack is an
 * attack check and changes the KIND of check being made. A `skills` list
 * cannot express that, and a character strong enough to wrench free
 * barehanded is exactly the case the third route exists for.
 */

/**
 * The three routes, in the order the entry prints them.
 *
 * `skill` names the skill to invoke, or null for the route that is not a
 * skill at all. `checkType` overrides the action's own only where it
 * differs, so the two skill routes leave it alone.
 */
export const ESCAPE_CHECK_OPTIONS = Object.freeze([
  Object.freeze({ key: "acrobatics", label: "Acrobatics", skill: "acrobatics", checkType: null }),
  Object.freeze({ key: "athletics", label: "Athletics", skill: "athletics", checkType: null }),
  Object.freeze({
    key: "unarmed",
    label: "Unarmed Attack",
    skill: null,
    checkType: "unarmed"
  })
]);

/**
 * The route the chooser opens on.
 *
 * Acrobatics, because that is where Chapter 4's own skill table files
 * Escape and therefore what the action has always rolled. Changing the
 * default as well as adding the choice would silently move every
 * existing character's check.
 */
export const ESCAPE_DEFAULT = "acrobatics";

/**
 * @param {string} key
 * @returns {object|null}
 */
export function escapeOption(key) {
  return ESCAPE_CHECK_OPTIONS.find((option) => option.key === key) ?? null;
}

/**
 * The action as this route makes it, and the skill it should be invoked
 * through.
 *
 * Returns a COPY rather than mutating, because the action objects are
 * frozen static data shared by every character in the world — writing a
 * check type onto one would change it for everybody.
 *
 * @param {object} action
 * @param {string} key
 * @returns {{action: object, invokedSkillKey: string|null}}
 */
export function applyEscapeRoute(action, key) {
  const option = escapeOption(key) ?? escapeOption(ESCAPE_DEFAULT);
  const next = option.checkType ? { ...action, checkType: option.checkType } : action;
  return { action: next, invokedSkillKey: option.skill };
}
