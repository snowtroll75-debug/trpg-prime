/**
 * Deleting a key from a document's data.
 *
 * THE DEFECT THIS MODULE EXISTS FOR
 *
 * Removing a key is not the same as setting it to null — a null leaves
 * the key there holding null, and a sheet that iterates the object still
 * shows a row for it. Foundry 14 provides an operator for this:
 *
 *     actor.update({ "system.specialistSkills.orcLore": <deletion> })
 *
 * Fifteen call sites across ten modules wrote that `<deletion>` as
 * `foundry.data.operators.ForcedDeletion` — **the class itself**.
 *
 * IT IS A CLASS, NOT A SENTINEL VALUE. Measured in the live world on
 * 13 Aug 2026, Foundry 14.363:
 *
 *     class ForcedDeletion extends DataFieldOperator { … }
 *
 * Foundry does not recognise a constructor as an operator, so it dropped
 * the entry from the diff and THE KEY SURVIVED. Nothing threw. Three
 * candidates were tried against a scratch actor:
 *
 *     the class itself as the value   → the key SURVIVED   ← what shipped
 *     new ForcedDeletion()            → deleted
 *     "-=key": null                   → deleted
 *
 * and the working form was then re-checked in every shape this system
 * uses: a flag sub-key, a whole flag key, an item's flag, and a payload
 * mixing a deletion with a creation in one update.
 *
 * WHY IT WENT UNNOTICED. Every deletion in the system was a no-op at
 * once, silently: stale per-turn combat markers, orphaned grant records,
 * migration leftovers, and — the two Graham reported — specialist skills
 * that could be removed neither by deleting the race that granted them
 * nor by the GM's own delete button. It was the SECOND symptom that
 * identified it, because those two paths share nothing else.
 *
 * THE `-=` PREFIX ALSO WORKS and is not implemented here. One measured
 * mechanism, in one place, is the point; a second spelling nothing calls
 * would be a line nobody checks.
 */

/**
 * The value that deletes the key it is assigned to.
 *
 * Constructed fresh per call: an operator instance is a value in an
 * update payload, not a constant to be shared between them.
 *
 * @example
 *   await actor.update({ [`system.specialistSkills.${key}`]: deletionValue() });
 *   update[`flags.${SYSTEM_ID}.${flag}`] = deletionValue();
 *
 * @returns {object|undefined} A ForcedDeletion instance, or undefined on
 *   a Foundry that has no such operator — see deletionOperatorAvailable.
 */
export function deletionValue() {
  const ForcedDeletion = globalThis.foundry?.data?.operators?.ForcedDeletion;
  return typeof ForcedDeletion === "function" ? new ForcedDeletion() : undefined;
}

/**
 * Whether this Foundry offers the operator at all.
 *
 * Checked once at startup so a future Foundry that renames or moves it
 * says so loudly, instead of every deletion in the system quietly
 * becoming a no-op again for however long it takes somebody to notice
 * that a skill will not delete.
 *
 * @returns {boolean}
 */
export function deletionOperatorAvailable() {
  return typeof globalThis.foundry?.data?.operators?.ForcedDeletion === "function";
}
