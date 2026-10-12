/**
 * The Foundry side of NATURAL DEFENCE (see natural-defence.mjs for the
 * rules).
 *
 *   Trigger  you make a saving throw
 *
 * Modelled on cutting-words-workflow.mjs, which solved the same problem
 * first: a spell whose trigger is a roll and whose effect modifies that
 * roll belongs on the triggering check's own card, where the recompute
 * machinery can move the number in place.
 *
 * THE SIMPLER HALF OF THE TWO. Cutting Words is cast at somebody else's
 * roll, so it needs a target, a range, and a save rolled against the
 * caster's DC. Natural Defence answers the caster's OWN save, so there
 * is no target to set, no distance to measure and no save to roll — the
 * cast either happens or it does not.
 *
 * THE CAST IS A REAL CAST, for the same reason it is there: `castSpell`
 * spends the reaction, gates the somatic component, applies the traits
 * and posts the card. Applying the bonus by hand here would be a second
 * casting path.
 */

import {
  NATURAL_DEFENCE_NAME,
  naturalDefenceSaveBonus,
  naturalDefenceEligibility
} from "./natural-defence.mjs";

/** This actor's Natural Defence spell, if they have one. */
function naturalDefenceSpellOf(actor) {
  return Array.from(actor?.items ?? []).find(
    (i) => i.type === "spell" && String(i.name).trim().toLowerCase() === NATURAL_DEFENCE_NAME
  ) ?? null;
}

/**
 * The caster-level threshold at which the bonus steps up, read from the
 * SPELL'S OWN `casterLevelMods`.
 *
 * NOT A CONSTANT IN THIS FILE. The compendium already records
 * `{threshold: 10, text: "The bonus increases to +2"}`, and a copy here
 * would be a second place to edit that nothing would notice had drifted.
 *
 * A spell carrying no threshold returns 0, which `naturalDefenceSaveBonus`
 * reads as "no upgrade" rather than "upgrade for everybody".
 */
function naturalDefenceThreshold(spell) {
  const mods = spell?.system?.casterLevelMods;
  if (!Array.isArray(mods)) return 0;
  const thresholds = mods
    .map((m) => Math.floor(Number(m?.threshold) || 0))
    .filter((n) => n > 0);
  return thresholds.length ? Math.min(...thresholds) : 0;
}

/**
 * The state `naturalDefenceEligibility` asks about, read off a live actor.
 *
 * NOT `casterState`, which cutting-words-workflow.mjs already exports
 * with a different signature. Two same-named exports meaning different
 * shapes is how a future reader imports the wrong one.
 */
function naturalDefenceState(caster, rollerActor) {
  return {
    hasSpell: Boolean(naturalDefenceSpellOf(caster)),
    reactions: Number(caster?.system?.resources?.reactions?.value ?? 0),
    inCombat: Boolean(caster?.inCombat),
    isSelf: Boolean(caster?.id && rollerActor?.id && caster.id === rollerActor.id)
  };
}

/**
 * Whether the roller may answer their own save, and why not if not.
 *
 * ONLY THE ROLLER IS CONSIDERED, because the trigger is their own save.
 * Cutting Words has to sweep every actor the user controls; this does
 * not, and pretending otherwise would offer a Bard the chance to cast
 * Natural Defence on somebody else's Fortitude save.
 */
export function naturalDefenceOffer(rollerActor) {
  if (!rollerActor) return { eligible: false, reason: "no actor" };
  const decision = naturalDefenceEligibility(naturalDefenceState(rollerActor, rollerActor));
  if (!decision.eligible) return decision;
  const spell = naturalDefenceSpellOf(rollerActor);
  return {
    eligible: true,
    reason: "",
    spell,
    bonus: naturalDefenceSaveBonus(
      Number(rollerActor.system?.magic?.casterLevelValue ?? 0),
      naturalDefenceThreshold(spell)
    )
  };
}

/**
 * Cast it. Returns what the card needs, or null if the cast did not happen.
 *
 * THE BONUS IS COMPUTED AFTER THE CAST, not before, because
 * `castSpell` can change the things it depends on — and because a cast
 * that was refused (no free hand for the somatic component, a trait
 * gate, Rage) must not leave the card holding a bonus nobody paid for.
 */
export async function resolveNaturalDefence(caster) {
  const spell = naturalDefenceSpellOf(caster);
  if (!spell) return null;

  const { castSpell } = await import("./cast-workflow.mjs");
  const result = await castSpell(caster, spell);
  if (!result?.cast) return null;

  return {
    cast: true,
    bonus: naturalDefenceSaveBonus(
      Number(caster.system?.magic?.casterLevelValue ?? 0),
      naturalDefenceThreshold(spell)
    )
  };
}
