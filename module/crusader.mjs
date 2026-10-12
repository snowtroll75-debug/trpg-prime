/**
 * The Crusader's derived abilities (Chapter 3).
 *
 * Three of its six abilities are pure arithmetic on data already on the
 * sheet, so they live here as pure functions the harness can run without
 * a Foundry actor — the same split the class-skill and divine-aspect
 * work uses, and for the same reason: a derivation checked with a regex
 * is not checked.
 *
 * The remaining three are player-driven actions rather than passive
 * numbers, but each still boils down to pure arithmetic once the
 * triggering moment is known: Devotion spends 2 PP on a reaction to a
 * fumble, Crusader's Mercy is an innate heal that scales every two
 * levels, and Divine Ally is a permanent choice of three. The pure
 * math lives here; the reaction prompts, the dice roll and the daily
 * chooser live in check-card-interactions.mjs, attack-workflow.mjs
 * and feats-workflow.mjs respectively.
 */

import { normaliseRune, parseRunes, roman } from "./runes.mjs";

const SYSTEM_ID = "trg-prime";

/** Does this actor have the named class ability on their sheet? */
export function hasClassAbility(actor, name) {
  const wanted = String(name).trim().toLowerCase();
  return Array.from(actor?.items ?? []).some(
    (item) => item.type === "ability" &&
      String(item.name).trim().toLowerCase() === wanted
  );
}

/**
 * Divine Grace (2nd): "you may add half your Charisma bonus to all of
 * your saving throws."
 *
 * HALF A BONUS, NOT HALF A MODIFIER. A character with Charisma -3 has no
 * Charisma bonus to halve, so this adds nothing rather than -1. The book
 * says "bonus", and every other half-an-ability rule in this system —
 * hand-and-a-half, propulsive — reads it the same way: a penalty is not
 * a bonus, and an ability the book describes as a blessing should not
 * make a Crusader's saves worse than a Fighter's.
 *
 * Rounded down, which is this system's default everywhere.
 *
 * Typed `untyped` deliberately. It is not a class bonus — the class
 * table's base save is already the class's contribution to a save, and
 * typing this `class` too would put the two in the same stacking group
 * and let one suppress the other.
 */
export function divineGraceBonus(charismaTotal) {
  const charisma = Math.floor(Number(charismaTotal) || 0);
  if (charisma <= 0) return 0;
  return Math.floor(charisma / 2);
}

/** The save modifier Divine Grace contributes, or null when it does not. */
export function divineGraceModifier(actor, charismaTotal) {
  if (!hasClassAbility(actor, "Divine Grace")) return null;
  const value = divineGraceBonus(charismaTotal);
  if (!value) return null;
  return {
    label: "Divine Grace",
    value,
    type: "untyped",
    source: "divineGrace"
  };
}

/**
 * Divine Resolve (1st): "you may increase your conviction pool and
 * conviction points by 1."
 *
 * The MAXIMUM, applied in base data so an Active Effect can still stack
 * on top.
 *
 * The rule has two halves — "increase your conviction pool AND
 * conviction points by 1" — and the second half is a one-off: the
 * points you currently hold go up once, when the ability arrives. That
 * cannot live in a derive, because a derive runs on every prepare and
 * would refill a spent point every time the sheet re-rendered. It is
 * `divineResolveTopUp` below, called from the grant path.
 *
 * The comment here used to claim the top-up already happened. It did
 * not: nothing anywhere raised the current value, and
 * prepareResourcePercentages only ever clamps it DOWN to the maximum.
 * A 1st-level Crusader sat at 1 of 2 for ever.
 */
export function divineResolveBonus(actor) {
  return hasClassAbility(actor, "Divine Resolve") ? 1 : 0;
}

/**
 * The one-off half: the point Divine Resolve puts in your pool when it
 * arrives.
 *
 * Recorded on the class item, so it happens exactly once however many
 * times Apply Grants is pressed, and so removing the class can take it
 * back. Returns the update to apply, or null when there is nothing to
 * do.
 *
 * @param {number} current The stored conviction value (from _source —
 *   never prepared data, or a spent point reads as unspent).
 * @param {boolean} alreadyGiven Whether the class item already records it.
 */
export function divineResolveTopUp(actor, current, alreadyGiven) {
  if (alreadyGiven) return null;
  if (!divineResolveBonus(actor)) return null;
  return Math.max(0, Math.floor(Number(current) || 0)) + 1;
}

/**
 * The reaction feat a Crusader's deific aspect hands over.
 *
 * "Your deific aspect also grants you either the Strike of Retribution
 * (good) or Self Preservation (evil) reaction feat. If your deific
 * aspect has neither the good nor evil trait then you may select one of
 * the feats, but once selected, it cannot be changed."
 *
 * FIVE of the ten have neither trait: Death, Magic and Nature are
 * Balance, Time is Balance and Order, and War is Order alone. So "you
 * may select one" is half the aspects — not the corner case it reads
 * like, and not the six a first count of it produced.
 *
 * @param {string} traits The aspect's printed alignment, e.g. "Good, Order".
 * @param {{good: string, evil: string}} feats The two names, off the
 *   ability rather than typed here a second time.
 * @returns {{feat: string, chosen: false}|{feat: null, chosen: true, options: string[]}}
 */
export function alignmentFeat(traits, feats) {
  const printed = String(traits ?? "").toLowerCase();
  const good = /\bgood\b/.test(printed);
  const evil = /\bevil\b/.test(printed);
  // Both would be a contradiction the book does not print; treated as
  // neither rather than silently preferring one.
  if (good && !evil) return { feat: feats.good, chosen: false };
  if (evil && !good) return { feat: feats.evil, chosen: false };
  return { feat: null, chosen: true, options: [feats.good, feats.evil] };
}

/**
 * The two reaction-feat names this character's CLASS declares, or null.
 *
 * Read off the class item, not off the Deific Aspect ability.
 *
 * The ability was the obvious place — it is where the book prints the
 * clause — but an ability item only exists after Apply Grants has been
 * pressed on the class. A player who dragged on their aspect and
 * pressed Apply Grants there first found nothing, was granted nothing,
 * and got a card that did not mention a reaction feat at all. Order of
 * play is not fixed, and the class item is on the sheet from the moment
 * it is dragged on. The builder hoists the names from the ability that
 * declares them, so there is still only one copy in the book's own
 * words.
 */
export function alignmentFeatNames(actor) {
  for (const item of actor?.items ?? []) {
    if (item.type !== "class") continue;
    const names = item.flags?.[SYSTEM_ID]?.alignmentFeats;
    if (names?.good && names?.evil) return names;
  }
  // THE CHAMPION ARCHETYPE, which is not a Crusader and whose class item
  // therefore carries nothing. "You ... gain the Crusader deity trait
  // (including the bonus feat granted)" — the archetype's Use button
  // grants the Crusader's own Deific Aspect ABILITY, and that item
  // carries the two names in the book's own words. So a second sweep,
  // over everything else on the sheet, rather than a second copy of the
  // names anywhere.
  //
  // Classes are still swept FIRST, which keeps the reason the class was
  // chosen in the first place: a Crusader has the names from the moment
  // the class item is dragged on, before Apply Grants has created any
  // ability at all.
  for (const item of actor?.items ?? []) {
    if (item.type === "class") continue;
    const names = item.flags?.[SYSTEM_ID]?.alignmentFeats;
    if (names?.good && names?.evil) return names;
  }
  return null;
}

/** The divine aspects on a sheet. */
export function aspectItems(actor) {
  return Array.from(actor?.items ?? []).filter((item) => item.type === "divine-aspect");
}

/* ---------------------------------------------------------------------- */
/*  Devotion (1st)                                                        */
/* ---------------------------------------------------------------------- */

/**
 * Devotion (1st): "Action Reaction: Trigger You fumble a check with
 * either a class skill or favoured weapon attack. Using your reserve
 * and devotion to your cause you may expend 2 PP treat the check as a
 * failure."
 *
 * "Fumble" here is the book's own word for the two worst named degrees
 * on the Chapter 8 resolution table — Fumble and Blunder — not
 * Unbreakable Resolve's broader "fail" (fighter.mjs's
 * UNBREAKABLE_TRIGGER_DEGREES, which also covers a plain Failure).
 * Devotion's printed trigger says fumble, not fail, so it stays
 * narrower than that precedent rather than matching it by default.
 */
export const DEVOTION_PP_COST = 2;

/** The two degrees that count as "fumble" for Devotion's trigger. */
export const DEVOTION_TRIGGER_DEGREES = Object.freeze(["fumble", "blunder"]);

/**
 * The skill-check half of the trigger: a fumbled/blundered check on a
 * class skill. Weapon-attack fumbles are the other half — see
 * devotionAttackTrigger below — because attacks resolve through an
 * entirely different fumble mechanism in this system (rollFumbleCheck,
 * a flat DC check against a d100 table, not the Chapter 8 degrees
 * table this function reads) and never reach this one.
 *
 * @param {object} args
 * @param {Actor} args.actor
 * @param {string} args.checkType The card's own `type` ("skill", "save", ...).
 * @param {string|null} args.degree The resolved degree key.
 * @param {boolean} args.isClassSkill Whether the rolled skill is a class skill —
 *   read off actor.system.skills[key].isClassSkill by the caller, which
 *   already derives it during actor prepare().
 */
export function devotionSkillTrigger({ actor, checkType, degree, isClassSkill } = {}) {
  if (!hasClassAbility(actor, "Devotion")) return false;
  if (checkType !== "skill") return false;
  if (!isClassSkill) return false;
  return DEVOTION_TRIGGER_DEGREES.includes(degree);
}

/**
 * The attack half: "...or favoured weapon attack." Only fires for the
 * weapon your deific aspect actually favours — favouredWeaponMatches /
 * favouredWeaponSources (divine-aspect.mjs) already answer that
 * question for Deific Aspect's own attack bonus, so the caller passes
 * the already-computed answer through rather than this function
 * re-deriving it.
 */
export function devotionAttackTrigger({ actor, isFavouredWeapon } = {}) {
  if (!hasClassAbility(actor, "Devotion")) return false;
  return Boolean(isFavouredWeapon);
}

/* ---------------------------------------------------------------------- */
/*  Crusader's Mercy (1st)                                                */
/* ---------------------------------------------------------------------- */

/**
 * Crusader's Mercy (1st): "You may target yourself with a word of
 * divine power which heals you of 1d8+4 hit points of damage. At 3rd
 * level and then every 2 levels thereafter the amount healed increases
 * by 1d8+4."
 *
 * Each step is a whole extra 1d8+4 BLOCK — the die count and the flat
 * bonus climb together, never one without the other — so a single
 * "number of blocks" count drives both halves of the formula. 1st-2nd:
 * one block. 3rd-4th: two. 5th-6th: three. And so on, uncapped, the
 * same open-ended shape as Wild Shape's uses ladder.
 */
export function crusadersMercyDiceCount(level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 1) return 0;
  return 1 + Math.floor((value - 1) / 2);
}

/** The full damage-roll formula for the current level, or null below 1st. */
export function crusadersMercyFormula(level) {
  const dice = crusadersMercyDiceCount(level);
  if (dice <= 0) return null;
  return `${dice}d8+${dice * 4}`;
}

/* ---------------------------------------------------------------------- */
/*  Divine Ally (4th)                                                     */
/* ---------------------------------------------------------------------- */

/**
 * "At 4th level, your devotion attracts a spirit of your deity's
 * alignment. Once you choose an ally, your choice can't be changed."
 * The three options, in the book's own order — already pre-authored
 * as the ability item's own allyChoices flag (see
 * packs-source/abilities/crusader-divine-ally.json), repeated here as
 * the canonical list the pure functions below validate against.
 */
export const DIVINE_ALLIES = Object.freeze(["Blade Ally", "Shield Ally", "Steed Ally"]);

/**
 * Blade Ally's six named property runes: "You may choose called,
 * courageous, disrupting, ghost touch, returning, or shifting."
 *
 * THESE ARE CHAPTER 11 WEAPON RUNES, and this file used to deny it.
 *
 * The comment that stood here said their mechanical effects were "not
 * defined anywhere in the source text this pack was built from" and that
 * "no property rune system exists elsewhere in this codebase to extend".
 * Both halves were false, and had been for a long time. `WEAPON_RUNES`
 * holds all eighteen of Chapter 11's weapon runes including these six;
 * weapons carry a real `system.runes` field; `parseRunes` reads it, and
 * every one of the six already has an implementation waiting on the
 * other side of it:
 *
 *   Disrupting   rune-damage.mjs, rolled as its own positive-damage
 *                packet by attack-workflow.mjs (with the undoubled tier
 *                ladder that makes it not an energy rune)
 *   Courageous   rune-effects.mjs NUMERIC_RUNES.courageous — fear saves,
 *                valued off the weapon's own potency rune, minimum +1
 *   Called       RUNE_ACTIONS, with an interactive workflow
 *   Shifting     RUNE_ACTIONS, likewise
 *   Ghost Touch  reported on the attack card by equippedEventRune
 *   Returning    likewise
 *
 * So the gap was never a missing rune system. It was that Blade Ally
 * recorded its choice in a FLAG on the ability item and never wrote the
 * weapon's `system.runes` field, so none of the above could fire — and
 * the card said so out loud, teaching the player a limitation that did
 * not exist. Found by Graham on 18 August 2026, reading the Chapter 3
 * audit note that repeated this comment instead of checking it.
 *
 * VALIDATED AGAINST THE CATALOGUE rather than typed twice. A name here
 * that no longer matches a real rune is a wiring error, and it should
 * fail loudly in the harness rather than quietly offer a rune that puts
 * an unreadable string in a weapon's field.
 */
export const BLADE_ALLY_RUNES = Object.freeze([
  "Called", "Courageous", "Disrupting", "Ghost Touch", "Returning", "Shifting"
]);

/**
 * The tier Blade Ally grants: I, always (Graham's ruling, 18 Aug 2026).
 *
 * Four of the six have a tier II in the chapter, bought with gold at a
 * much higher level. The ally is a 4th-level class feature that re-picks
 * daily and costs nothing, so it grants the entry-level rune and does not
 * scale.
 */
export const BLADE_ALLY_TIER = 1;

/**
 * Add Blade Ally's rune to a weapon's `runes` field for the day.
 *
 * PURE, and it takes the FIELD rather than the item so the harness can
 * run it on strings — the same arrangement `runes.mjs` itself uses.
 *
 * WHAT IT MUST NOT DO IS CLOBBER. A Crusader's blade may already carry
 * runes the player paid for, and one of them matters directly: Courageous
 * reads its value off the weapon's OWN potency rune, so a fix that
 * replaced the field would have handed a +1 to a character wielding a
 * Potency III sword. The existing field is preserved verbatim and the
 * divine rune appended.
 *
 * ALREADY PRESENT IS LEFT ALONE. A weapon that carries Disrupting II of
 * its own is not reduced to I by having the ally land on it — `parseRunes`
 * takes the higher of two entries naming one rune, so appending would be
 * harmless, but writing a worse duplicate into stored data is not.
 *
 * @param {string} field the weapon's current `system.runes`
 * @param {string} runeLabel one of BLADE_ALLY_RUNES
 * @returns {string} the field to store
 */
export function bladeAllyRuneField(field, runeLabel) {
  // RADIANT BLADE OFFERS "Aligned (Good)" so the player cannot pick the
  // wrong alignment, but the WEAPON's rune field takes the rune's own
  // name — `parseRunes` knows "Aligned", not "Aligned (Good)". The
  // parenthetical is display, and it is stripped here rather than at the
  // call site so every caller gets the same treatment.
  const label = String(runeLabel ?? "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (!label) return String(field ?? "");
  const current = String(field ?? "").trim();
  const held = parseRunes(current).some((r) => r.key === normaliseRune(label));
  if (held) return current;
  const addition = `${label} ${roman(BLADE_ALLY_TIER)}`;
  return current ? `${current}, ${addition}` : addition;
}

/**
 * The permanent choice, once made — read off the Divine Ally ability
 * item's own flag rather than re-derived, since "can't be changed"
 * means this is written once (by the Use button) and only ever read
 * afterwards.
 */
export function divineAllyChoice(actor) {
  return divineAllyChoices(actor)[0] ?? null;
}

/**
 * EVERY ally this Crusader holds, because Second Ally means there can be
 * two (Chapter 5: "you may select an additional Divine Ally from those
 * available to you").
 *
 * STORED AS ONE FIELD, READ AS A LIST. `allyChosen` held a single string
 * for as long as one ally was all anybody could have, and a sheet written
 * before Second Ally existed still holds one — so a bare string is read as
 * a list of one rather than migrated. `divineAllyChoice` above keeps
 * answering "the first", which is what every caller written before this
 * meant by it.
 */
export function divineAllyChoices(actor) {
  const ability = Array.from(actor?.items ?? []).find(
    (item) => item.type === "ability" &&
      String(item.name).trim().toLowerCase() === "divine ally"
  );
  const stored = ability?.flags?.[SYSTEM_ID]?.allyChosen ?? null;
  if (!stored) return [];
  return Array.isArray(stored) ? stored.filter(Boolean) : [stored];
}

/**
 * The alignment a Radiant Blade's Aligned rune must match: "any aligned
 * trait that you select must match that of your deific aspect or deity."
 *
 * Read off the aspect's own printed traits, which is where the good/evil
 * word already lives — the same field `alignmentFeat` reads to decide
 * which reaction feat the aspect grants. Nothing new is stored.
 */
export function deificAlignment(actor) {
  for (const aspect of aspectItems(actor)) {
    const printed = String(aspect.system?.traits ?? "").toLowerCase();
    const good = /\bgood\b/.test(printed);
    const evil = /\bevil\b/.test(printed);
    if (good && !evil) return "Good";
    if (evil && !good) return "Evil";
  }
  return "";
}

/**
 * Shield Ally: "In your hands, the shield's bonus increases by +1."
 * Word-for-word the same shape as Shield Focus (Class feat), which
 * documents/actor.mjs already adds onto each equipped shield's own
 * defenceBonus before taking the max across pieces — this is a second,
 * separately-stacking source added the same way, not a replacement.
 */
export function shieldAllyBonus(actor) {
  // ASKS THE LIST, not the first pick: a Crusader with Second Ally may
  // hold Shield Ally second, and reading only the first would have made
  // the feat grant nothing at all in that order.
  return divineAllyChoices(actor).includes("Shield Ally") ? 1 : 0;
}
