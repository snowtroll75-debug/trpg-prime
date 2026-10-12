/**
 * ONE CASTING AT A TIME.
 *
 * NEW at 3.512.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SIX SPELLS PRINT THIS RULE AND NONE OF IT WAS BUILT.
 *
 *   Vital Beacon      "You can have only one vital beacon active at a time."
 *   Light             "If you cast this spell again on a second object, the
 *                      light spell on the first object ends."
 *   Contingency       "If you cast contingency again, the newer casting
 *                      supersedes the older."
 *   Veiled Secret     "…any previous Veiled Secret spell you had cast will
 *                      be nullified, and its effects will cease."
 *   Breeze            "You can only have one breeze active at any one time.
 *                      …the previous casting is dispelled."
 *   Pass Without Trace "…you can benefit from the effects of only one
 *                      casting of this spell at a time."
 *
 * Measured across the 692-spell pack before this was written: six declare
 * it, and TWO DECLARE THE OPPOSITE — Fatigue and Waves Of Fatigue both say
 * "multiple uses of this spell stack". Those two are the reason this is a
 * DECLARED FIELD rather than a rule inferred from a spell being buffish or
 * from its duration: the pack contains an explicit counter-example, and a
 * heuristic that caught it would silently stop somebody's second Fatigue
 * from landing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * CASTER-SCOPED. Graham's ruling, 7 September 2026.
 *
 * Five of the six are plainly about the caster — "if YOU cast this again".
 * Pass Without Trace words its half about the beneficiary instead ("you can
 * BENEFIT from only one casting"), which would mean a new casting reaching
 * onto another caster's sheet to end their spell and release their PP.
 * Ruled the same as the other five: your recast ends your own earlier
 * casting, and two different casters covering one creature is the GM's.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE REGISTRY IS WHERE THIS LIVES.
 *
 * Only TWO of the six registered an active-spell entry before this release
 * — Vital Beacon and Light, and only because "until your next daily
 * preparations" locks PP. The other four registered nothing at all, so
 * there was no record of which casting was the live one and nothing for a
 * recast to end. `singleCasting` is therefore a FIFTH REGISTRATION REASON
 * beside lock, sustained, live emanation and (D), for the same reason (D)
 * became the fourth at 3.494.0: a rule about ending a spell needs the spell
 * to be something the system is holding.
 */

/** Does this spell print the one-at-a-time rule? */
export function declaresSingleCasting(spellData) {
  return spellData?.singleCasting === true;
}

/**
 * The caster's earlier castings of this spell, which this cast ends.
 *
 * MATCHED BY NAME, which is the only handle the registry keeps that
 * survives the spell document being re-imported, edited or duplicated
 * between two castings. The name is what `registerActiveSpell` stores and
 * what the panel prints, so two rows the caster reads as "Breeze" are
 * exactly the two rows this ends.
 *
 * TAKES THE SPELL DATA, NOT A BOOLEAN. The whole decision — does this
 * spell declare the rule, and if so which rows go — is answered here where
 * a check can run it, rather than as an `if` in the cast workflow where
 * the mutation harness cannot reach it. Two workflow mutations survived
 * this session for exactly that reason.
 *
 * NO GUARD AGAINST ENDING THIS CAST'S OWN ENTRY, deliberately. It is
 * called before `registerActiveSpell`, so the new entry is not on the list
 * yet; a guard against it would be the sixth dead guard this project has
 * had to delete.
 *
 * @param {object[]} entries the caster's active-spell registry
 * @param {object} spellData the spell's system data
 * @param {string} spellName the spell being cast
 * @returns {object[]} the entries to end, in registry order
 */
export function supersededEntries(entries, spellData, spellName) {
  if (!declaresSingleCasting(spellData)) return [];
  const name = String(spellName ?? "").trim().toLowerCase();
  // A NAMELESS SPELL ENDS NOTHING. An entry stored without a name would
  // otherwise match every nameless entry on the list, which is every entry
  // a future bug forgets to name.
  if (!name) return [];
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => String(entry?.name ?? "").trim().toLowerCase() === name);
}

/**
 * What the card says when a recast ended the one before it.
 *
 * SAID OUT LOUD, because the alternative is a spell quietly vanishing from
 * the panel at the moment another one appears — and the caster who cast
 * Breeze on a second ally has every reason to think both are running. The
 * position every sweep and every refusal in this system takes.
 *
 * @param {string} spellName
 * @param {number} count how many earlier castings ended
 * @returns {string|null} null when nothing was superseded
 */
export function singleCastingLine(spellName, count = 0) {
  const n = Math.trunc(Number(count) || 0);
  if (n < 1) return null;
  const earlier = n === 1 ? "casting" : "castings";
  return `<em>Your earlier ${earlier} of ${spellName} ${n === 1 ? "ends" : "end"}`
    + ` — only one can be active at a time.</em>`;
}
