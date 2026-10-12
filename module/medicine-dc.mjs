/**
 * The three Medicine DCs the book computes and the system did not.
 *
 * NEW at 3.559.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS.
 *
 * Auditing pages 81–90, First Aid, Treat Disease and Treat Toxin all
 * declared `against: "none"` — no DC reached the roll — while the book
 * gives each of them a DC derived from something the system already
 * tracks on the patient.
 *
 * This is a weaker version of block 7's jump DCs and, for that reason, a
 * worse defect. A jump's distance is the player's private declaration, so
 * the system has to ask. **These three ask nobody.** The bleeding value
 * is a condition this system applies, sums and displays; the affliction's
 * save DC is one this system already computes in order to roll the save
 * against it. Both numbers are on the patient's sheet at the moment the
 * check is configured.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE BANDS ALREADY EXISTED, WITH NO DCs ON THEM.
 *
 * `conditions/registry.mjs` has carried BLEEDING_BANDS — light 1–4,
 * moderate 5–8, severe 9–12, dire 13+ — since long before this, because
 * Appendix 2 uses the same four bands to decide whether a character can
 * staunch their own bleeding. Page 86 prints those four bands again with
 * a DC beside each. The table was half-present and the half that was
 * missing is the half First Aid needed.
 *
 * So the bands are IMPORTED rather than restated. Two copies of a
 * four-row table is two places for a boundary to move.
 */

import { bleedingSeverity } from "./conditions/registry.mjs";
import { afflictionSaveDC } from "./afflictions.mjs";

/**
 * First Aid (page 86), the printed table:
 *
 *   Light (1–4 Hits)    20
 *   Moderate (5–8)      25
 *   Severe (9–12)       30
 *   Dire (13+)          40
 *
 * Keyed by the band rather than by a range, so the ranges live in exactly
 * one place — `BLEEDING_BANDS` — and this table cannot disagree with it
 * about where Moderate starts.
 *
 * NOT EXPORTED: callers want a DC, and `firstAidDC` is how they get one.
 * An exported table nobody reads is a well-tested opinion (lesson 5.1).
 */
const FIRST_AID_DC_BY_BAND = Object.freeze({
  light: 20,
  moderate: 25,
  severe: 30,
  dire: 40
});

/**
 * The DC of a First Aid check on a creature bleeding this much.
 *
 * NULL WHEN THERE IS NOTHING TO TREAT, which is not the same as a DC of
 * zero: a creature that is not bleeding is not a harder or easier
 * patient, it is not a patient. The action's own requirement — "an
 * adjacent creature that is bleeding" — is the thing that has failed, and
 * the caller says so rather than rolling against an invented number.
 *
 * @param {*} bleedingValue The target's Bleeding condition value.
 * @returns {{dc:number, band:string, label:string, value:number}|null}
 */
export function firstAidDC(bleedingValue) {
  const value = Math.floor(Number(bleedingValue) || 0);
  const band = bleedingSeverity(value);
  if (!band) return null;
  const dc = FIRST_AID_DC_BY_BAND[band.key];
  if (!Number.isFinite(dc)) return null;
  return { dc, band: band.key, value, label: `${band.label} bleeding (${value})` };
}

/**
 * Treat Disease and Treat Toxin (pages 86–87): "make an opposed Medicine
 * check against the disease's save DC" / "against the poison's save DC".
 *
 * THE SAME DC THE SAVE ITSELF USES. `afflictionSaveDC` is what
 * `affliction-workflow.mjs` rolls the patient's own save against, so
 * treating and resisting are measured against one number rather than two
 * that drift.
 *
 * THE WORST ONE, when a creature carries more than one. Nothing in the
 * chapter says which to treat, and a patient with two poisons in them is
 * in more trouble than a patient with one — picking the easier would let
 * a Medicine check report success over the affliction still killing them.
 * The caller is told which one was chosen so the card can name it.
 *
 * @param {Array<object>} afflictions Affliction item `system` blocks.
 * @param {string} kind "disease" or "poison".
 * @returns {{dc:number, name:string}|null}
 */
export function treatAfflictionDC(afflictions = [], kind = "poison") {
  const want = String(kind ?? "").trim().toLowerCase();
  const candidates = (Array.isArray(afflictions) ? afflictions : [])
    .filter((entry) => String(entry?.system?.afflictionType ?? "").trim().toLowerCase() === want)
    .map((entry) => ({
      dc: afflictionSaveDC(entry?.system?.level, entry?.system ?? 0),
      name: String(entry?.name ?? "").trim() || (want === "disease" ? "the disease" : "the poison")
    }))
    .filter((entry) => Number.isFinite(entry.dc));
  if (!candidates.length) return null;
  return candidates.reduce((worst, entry) => (entry.dc > worst.dc ? entry : worst));
}

/** Which affliction type each action treats. */
export const TREAT_AFFLICTION_KIND = Object.freeze({
  treatDisease: "disease",
  treatToxin: "poison"
});
