/**
 * metamagic-targets — the four metamagic feats that decide WHO a cast affects.
 *
 * NEW at 3.717.0 (O4; Graham, 27 November 2026: "Should be automated").
 * Until now Selective Spell, Split Spell, Aligned Spell and Imposing Will
 * charged their PP and printed a note for the table. These are the pure
 * rules; cast-workflow.mjs applies them at the points where the cast already
 * prunes its targets (the kind gate, trait immunity, the area's catch), and
 * selective-spell-workflow.mjs opens Selective's dialog.
 *
 *   ALIGNED SPELL  "only affect targets with either the chaos, evil, good, or
 *                  order alignment traits chosen at the time of casting." A
 *                  creature carrying none of the chosen traits is passed by
 *                  and named, as the kind gate does.
 *   IMPOSING WILL  "warp the spell to affect creatures that would normally be
 *                  immune, at a PP cost by creature type." A creature of the
 *                  chosen type that the mental family (mental, emotion, fear)
 *                  would have shielded is let through.
 *   SELECTIVE      "choose several targets in the area equal to the
 *                  additional PP expended. These targets are excluded."
 *   SPLIT          "Your Spell Attack check is compared to the DB of multiple
 *                  targets … The damage die … is reduced by one step per
 *                  additional target (d8 becomes d6 for one additional target
 *                  or d4 two additional targets etc). This counts as one
 *                  attack for your multiple attack penalty."
 */

import { stepDownDieSize } from "../item-quality.mjs";

/** The traits whose immunity Imposing Will can overcome: Mental, and the two that bring it. */
const IMPOSING_WILL_TRAITS = Object.freeze(["mental", "emotion", "fear"]);

/**
 * Aligned Spell: who among these carries at least one of the chosen traits.
 *
 * @param {object[]} actors
 * @param {string[]} traits the chosen traits ("evil", …); empty → everyone kept
 * @param {(actor:object)=>string[]} alignedOf the aligned traits an actor carries
 * @returns {{kept:object[], skipped:{name:string, reason:string}[]}}
 */
export function alignedPartition(actors = [], traits = [], alignedOf = () => []) {
  const wanted = (traits ?? []).map((t) => String(t).toLowerCase()).filter(Boolean);
  const list = (actors ?? []).filter(Boolean);
  if (!wanted.length) return { kept: list, skipped: [] };
  const kept = [];
  const skipped = [];
  for (const actor of list) {
    const carried = new Set((alignedOf(actor) ?? []).map((t) => String(t).toLowerCase()));
    if (wanted.some((t) => carried.has(t))) kept.push(actor);
    else skipped.push({ name: actor.name, reason: `${actor.name} has no ${wanted.join(" or ")} trait (Aligned Spell)` });
  }
  return { kept, skipped };
}

/**
 * Imposing Will: does it let this immune creature through? Only for an
 * immunity of the mental family, and only for the type the caster paid for.
 *
 * @param {string|null} trait the trait the creature was found immune to
 * @param {boolean} ofType whether the creature is of the chosen type
 */
export function imposingWillOvercomes(trait, ofType) {
  return Boolean(ofType) && IMPOSING_WILL_TRAITS.includes(String(trait ?? "").toLowerCase());
}

/**
 * Split Spell: every die in the formula stepped down `steps` times, on the
 * 4/6/8/10/12 ladder `stepDownDieSize` already holds for the book's own
 * example. A d4 stays a d4: the book names no step below it.
 * "2d8 + 3" stepped 1 → "2d6 + 3".
 */
function stepDownDamageFormula(formula, steps = 0) {
  const n = Math.max(0, Math.trunc(Number(steps) || 0));
  const text = String(formula ?? "");
  if (!n) return text;
  return text.replace(/(\d*)d(\d+)/gi, (_m, count, faces) => `${count}d${stepDownDieSize(Number(faces), n)}`);
}

/** Split Spell: the damage row with its formula stepped down; other fields kept. */
export function splitDamageRow(row, steps = 0) {
  if (!row || !String(row.formula ?? "").trim() || !(Number(steps) > 0)) return row ?? null;
  return { ...row, formula: stepDownDamageFormula(row.formula, steps) };
}

/** Split Spell: a numeric target cap raised by the extra targets bought; an open cap stays open. */
export function splitTargetCap(cap, extra = 0) {
  const add = Math.max(0, Math.trunc(Number(extra) || 0));
  if (cap == null || !Number.isFinite(Number(cap))) return cap;
  return Number(cap) + add;
}

/**
 * Selective Spell: the caught creatures with the chosen ones excluded.
 * More chosen than paid for is refused, not trimmed (the target cap's rule:
 * trimming would decide for the caster which of their choices to drop).
 *
 * @param {object[]} caught
 * @param {string[]} excludedIds actor ids the caster ticked
 * @param {number} max how many exclusions were bought
 * @returns {{kept:object[], excluded:object[], over:boolean}}
 */
export function selectiveExclusion(caught = [], excludedIds = [], max = 0) {
  const ids = new Set((excludedIds ?? []).map(String));
  const list = (caught ?? []).filter(Boolean);
  const excluded = list.filter((a) => ids.has(String(a.id)));
  if (excluded.length > Math.max(0, Math.trunc(Number(max) || 0))) return { kept: list, excluded: [], over: true };
  return { kept: list.filter((a) => !ids.has(String(a.id))), excluded, over: false };
}

/** The card's line for what Selective excluded. */
export function selectiveLine(spellName, excluded = [], bought = 0) {
  if (!excluded.length) return `<em>${spellName}: Selective Spell — nobody was excluded (${bought} bought).</em>`;
  return `<em>${spellName}: Selective Spell excluded ${excluded.map((a) => a.name).join(", ")}.</em>`;
}

/** The card's line for Split's targets. */
export function splitLine(spellName, extraNames = [], bought = 0, formula = "") {
  const unused = Math.max(0, bought - extraNames.length);
  return `<em>${spellName}: Split Spell — the same attack roll is compared with ${extraNames.length ? extraNames.join(", ") : "no other target"}`
    + `${formula ? `; damage ${formula} (die stepped down ${bought})` : ""}; one attack for the multiple attack penalty`
    + `${unused ? `; ${unused} extra target${unused > 1 ? "s" : ""} paid for and not targeted` : ""}.</em>`;
}

/**
 * Imposing Will: could this cast buy it? The feat owned, and the spell
 * mental (the same test the warp dialog's option uses, metamagic.mjs).
 * When it could, the cast asks the targeted trait-immunity gate after the
 * warp dialog instead of before it.
 */
export function mayImposeWill(actor, spellData) {
  const owns = Array.from(actor?.items ?? []).some((i) => String(i?.name ?? "").trim().toLowerCase() === "imposing will");
  return owns && /\bmental\b/i.test(String(spellData?.traits ?? ""));
}

/** The card's line for who Imposing Will let through. */
export function imposingWillLine(imposed = []) {
  const names = imposed.map((x) => x.name).join(", ");
  return `Imposing Will: ${names} ${imposed.length > 1 ? "are" : "is"} affected despite ${imposed.length > 1 ? "their" : "its"} immunity to the ${imposed[0]?.trait ?? "mental"} trait.`;
}
