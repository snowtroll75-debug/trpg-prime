/**
 * The Cleric's derived abilities (Chapter 3).
 *
 * Three named abilities. Two need new code here and in the workflows;
 * the third — Deific Aspect — needed none at all.
 *
 * Channels (1st) is a shared Cha+1 pool spent to cast one of four named
 * spells (Cure, Inflict, Lifekeeping, Restoration) as an innate spell.
 * The pool lives on the ability item itself (`usesPerDay: "Charisma +1"`,
 * already authored); the four names are `spellChoices` on the same item
 * (already authored — see tools/class-data.mjs's comment, written when
 * this field was added at 3.224.0/3.225.0 specifically for this
 * chooser). No pure arithmetic to extract: the chooser in
 * feats-workflow.mjs does the whole thing, mirroring Crusader's Mercy's
 * "spend a use, then act" shape rather than Wild Shape's "configure once,
 * cast normally forever after" shape, because Channels' pool is shared
 * across four different spells rather than belonging to one.
 *
 * Priestly Path (1st) is the third of Chapter 3's three "choose an
 * archetype feat, prerequisites waived" pickers — after the Fighter's
 * Martial Training and the Rogue's Archetypal Path — so it is wired the
 * same way, in feats-workflow.mjs, off the ability's own `archetypeChoices`
 * flag. Prerequisites waived for the same reason as those two: one of
 * the seven options (Loremaster, "10 ranks total" across seven skills)
 * is unreachable at 1st level otherwise.
 *
 * Deific Aspect (1st) needed nothing new. It is the SAME divine-aspect
 * item type the Crusader's own Deific Aspect uses, and every piece of it
 * — the specialist-spell chooser (feats-workflow.mjs's useDivineAspect),
 * the levelled bonus spells (grants-workflow.mjs's GRANT_FIELDS), the
 * Deific Skill (class-skills.mjs's `aspects` source), the favoured
 * weapon's proficiency and +1 (proficiency-rules.mjs,
 * combat/attack-workflow.mjs) — was already wired generically off the
 * item, not the class, when the Crusader's copy shipped at 3.213.0/
 * 3.228.0. The Cleric's own Deific Aspect entry carries no
 * `alignmentFeats` (only the Crusader's does), so the reaction-feat half
 * of that generic wiring simply never fires for a Cleric — exactly as
 * intended, per the divine-aspect.mjs header note.
 */

import { channelSpellOptions } from "./channel-feats.mjs";

/** Does this actor carry the named class ability (item type "ability")? */
export function hasClassAbility(actor, name) {
  const wanted = String(name).trim().toLowerCase();
  return Array.from(actor?.items ?? []).some(
    (item) => item.type === "ability" &&
      String(item.name).trim().toLowerCase() === wanted
  );
}

/**
 * The four spells Channels may cast, read off the ability item's own
 * `spellChoices` flag (tools/class-data.mjs), with the printed list as a
 * fallback for a hand-made copy that predates the flag.
 */
export function channelsSpellChoices(item, featNames = []) {
  // WIDENED BY TWO FEATS (3.352.0). Turn Undead and Versatile Channels
  // both add to this list and both spend the same use, so the widening
  // lives in one table — see module/channel-feats.mjs — rather than in
  // two handlers that each have to remember the deduction.
  return channelSpellOptions({
    base: item?.flags?.["trg-prime"]?.spellChoices ?? null,
    featNames
  });
}
