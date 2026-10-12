/**
 * GROUND THAT COSTS MORE TO CROSS.
 *
 * NEW at 3.501.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO SPELLS THAT DID NOTHING AT ALL.
 *
 *   VERDANT SNARE   PP 1, 1 AP, 30 feet, 10-ft radius, Alteration
 *     "Roots and vines lash out, creating natural difficult terrain
 *      until the start of your next turn."
 *      +2 PP: increase the radius by 10 feet (max 50)
 *      +3 PP: duration becomes 1 minute
 *
 *   WARPED TERRAIN  PP 1, 1 AP+, 60 feet, 5-foot radius or more,
 *                   1 minute, Shadow / Visual
 *     "You conjure illusory hazards that cover the ground … causing any
 *      creature that traverses them to perceive the area as difficult
 *      terrain. However, a creature can attempt to disbelieve the
 *      illusion by using a Search action … By investing additional
 *      actions while casting the spell, you can expand the radius …"
 *      +6 PP: the illusion appears in the air rather than on a surface,
 *             functioning as difficult terrain for flying creatures
 *
 * Both carried `effects: []`. Verdant Snare carried no duration either —
 * its clock is in the prose.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BEHAVIOUR ALREADY EXISTED AND IS NOT REBUILT HERE.
 *
 * `creature-aura-workflow.mjs` has built Foundry `modifyMovementCost`
 * behaviours since the creature auras went in, complete with the
 * schema-guard note recording what happened when an unknown key was
 * silently dropped and every difficulty defaulted to 1. This file
 * produces the same AURA-SHAPED descriptor that `terrainBehaviours`
 * already eats, rather than a second builder that agrees with it until
 * somebody edits one.
 *
 * DOUBLE IS THE MULTIPLIER, and it is the system's own word: "difficult
 * terrain, in this system, costs double" (combat/fly.mjs).
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE AIR WARP CHANGES WHICH MOVEMENTS ARE CHARGED, NOT HOW MUCH.
 *
 * "Appear in the air rather than on a surface, causing it to function as
 * difficult terrain for FLYING creatures" — so the +6 PP version charges
 * `fly` and leaves walking alone, and the printed version charges the
 * ground movements and leaves flying alone. `terrainBehaviours` grew an
 * optional `movementTypes` for this; omitting it charges all four
 * exactly as the creature auras always have.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DISBELIEF IS NAMED, NOT AUTOMATED. Graham's ruling, 5 September 2026.
 *
 * "A creature can attempt to disbelieve the illusion by using a Search
 * action … If successful, the creature sees through the deception and
 * can move through the area unaffected for the remaining duration."
 *
 * Foundry's movement-cost behaviour is a property of the REGION, not of
 * a creature in it: it charges everyone inside and has no per-token
 * exemption. That is the identical limit `terrainBehaviours` already
 * records for a creature aura's `exemptTrait` — "the page exempts
 * creatures with a trait, which this behaviour cannot express, so every
 * movement type is charged and the exemption is named on the Region for
 * whoever is running the creature."
 *
 * So the clause rides on the REGION'S OWN NAME, where a GM moving a
 * token sees it, and on the cast card. THE TWO ALTERNATIVES WERE WORSE:
 * tracking who has disbelieved would record the fact and still charge
 * them, which is a list that lies; and suppressing the Region once
 * anyone sees through it would free the whole battlefield because one
 * creature made a Search check.
 */

const int = (v) => Math.trunc(Number(v) || 0);
const text = (v) => String(v ?? "").trim();

/** "Difficult terrain, in this system, costs double" — combat/fly.mjs. */
export const DIFFICULT_MULTIPLIER = 2;

/**
 * Page 196's other kind: "Moving through these areas costs x3."
 *
 * NEW at 3.579.0 (the block-19 audit's D16, Graham's R16 of 21 September
 * 2026). The multiplier was recognised wherever terrain was MET — Wild
 * Stride reads it, and eases it one step — but nothing in the system
 * could MAKE a patch of it: a row declaring multiplier 3 was clamped to
 * the number it asked for and then called "difficult terrain" on the
 * Region and on the card, which is the wrong name for ×3 ground.
 */
export const FORMIDABLE_MULTIPLIER = 3;

/**
 * What ground at this multiplier is called (page 196).
 *
 * @param {number} multiplier
 * @returns {string}
 */
export function terrainKindLabel(multiplier) {
  return int(multiplier) >= FORMIDABLE_MULTIPLIER ? "formidable terrain" : "difficult terrain";
}

/**
 * Every movement a printed patch of ground charges.
 *
 * NOT EXPORTED. `verify-rules-have-callers` named both of these the moment
 * they were: nothing outside this file asks which movements a patch
 * charges, only `terrainMovements` does, and an exported constant nobody
 * calls is a well-tested opinion rather than automation.
 */
const GROUND_MOVEMENTS = Object.freeze(["walk", "swim", "burrow"]);

/** What the air warp charges instead. See above on why neither is exported. */
const AIR_MOVEMENTS = Object.freeze(["fly"]);

/**
 * A difficult-terrain row, or null when it is malformed.
 *
 * @param {object} raw the pack row
 * @param {object} warpMods the aggregated warp mods
 */
export function normaliseDifficultTerrain(raw, warpMods = {}) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.kind !== undefined && text(raw.kind) !== "difficultTerrain") return null;
  const multiplier = Math.max(2, int(raw.multiplier ?? DIFFICULT_MULTIPLIER));
  return {
    label: text(raw.label) || "Difficult terrain",
    multiplier,
    // THE WARP DECIDES WHICH MOVEMENTS, and it is a declared mod rather
    // than a match on the warp's printed text — the phantom-key defect
    // 3.499.1 paid for on two spells at once.
    air: Boolean(warpMods?.terrainInAir),
    // The clause the system does not enforce, carried so the Region and
    // the card can both name it.
    illusory: Boolean(raw.illusory)
  };
}

/** Which movement types this patch charges. */
export function terrainMovements(spec) {
  return spec?.air ? [...AIR_MOVEMENTS] : [...GROUND_MOVEMENTS];
}

/**
 * The descriptor `terrainBehaviours` eats.
 *
 * AURA-SHAPED ON PURPOSE. That function is the one place in the system
 * that knows how a `modifyMovementCost` behaviour is spelled, and it
 * learned that the hard way; handing it the shape it already takes is
 * cheaper than being right about the schema twice.
 */
export function terrainAuraShape(spec, spellName = "") {
  if (!spec) return null;
  return {
    kind: "terrain",
    name: terrainRegionName(spec, spellName),
    movementCostMultiplier: spec.multiplier,
    movementTypes: terrainMovements(spec),
    // NOT AN `exemptTrait`. That field names a trait the behaviour cannot
    // express; disbelief is not a trait, and putting it there would make
    // the Region read "except disbelieved", which is a rule no trait
    // check could ever confirm.
    exemptTrait: null
  };
}

/**
 * What the Region is called on the canvas.
 *
 * THE CLAUSE IS IN THE NAME because that is where a GM dragging a token
 * across it will see it. A Region called "Warped Terrain" tells them
 * nothing about the Search action that turns it off.
 */
export function terrainRegionName(spec, spellName = "") {
  const base = text(spellName) || text(spec?.label) || "Difficult terrain";
  const kind = terrainKindLabel(spec?.multiplier);
  const parts = [spec?.air ? `${kind}, flying only` : kind];
  if (spec?.illusory) parts.push("disbelief by Search — run by hand");
  return `${base} (${parts.join("; ")})`;
}

/** What the cast card says when the ground is laid. */
export function terrainPlacedLine(spec, areaText = "") {
  const who = spec?.air ? "Flying creatures" : "Creatures";
  const where = text(areaText) ? ` in the ${areaText}` : " in the area";
  return `${who}${where} treat it as <strong>${terrainKindLabel(spec?.multiplier)}</strong> — `
    + `every 5 feet costs ${spec?.multiplier === 2 ? "10" : `${spec.multiplier * 5}`} feet of movement.`;
}

/**
 * The clause the system hands back to the table.
 *
 * SAID ONLY WHEN IT APPLIES. A caster who did not take the air warp is
 * owed nothing about flying; a spell that is not an illusion is owed
 * nothing about disbelief. A card that recites every clause a spell
 * might have had is one nobody reads by the third cast.
 */
export function terrainRemainderLine(spec) {
  if (!spec?.illusory) return null;
  return "<em>The illusion can be disbelieved with a Search action, and a creature that "
    + "sees through it moves freely for the rest of the duration. Foundry charges every "
    + "creature in the area, so the GM should waive the cost for anyone who has "
    + "disbelieved — the Region is named to say so.</em>";
}
