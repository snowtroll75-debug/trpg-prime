/**
 * A SPELL WHOSE DAMAGE ADDS ONE OF THE CASTER'S ABILITIES.
 *
 * NEW at 3.611.0, block 34 (R10, Graham's ruling of 2 October 2026: "Your
 * recommendation"). Pure; no Foundry.
 *
 *   GUIDING STONE (PP 1): "the stone inflicts bludgeoning damage equal to
 *   2d6 plus your melee damage modifier."
 *
 * "Melee damage modifier" is a defined term, page 199: "A melee or thrown
 * attack gains a damage modifier equal to your Strength ability score."
 * So the damage row says `addAbility: "strength"` and the attack spell's
 * roll adds the caster's Strength total, the number a sword would add.
 * No spell formula read an actor value before this; the stone rolled 2d6.
 */

/*
 * AND "YOUR MAGICAL ABILITY SCORE" (3.666.1). Graham, 22 October 2026: "The
 * spell Hurling is not adding magical ability score to its damage."
 *
 *   HURLING (cantrip): "it inflicts 1d6 + magical ability score bludgeoning
 *   damage."
 *
 * The pack carried a note saying the bonus was added by hand. The magical
 * ability is not one fixed ability: it is whichever the CAST rolled its
 * Spellcraft off (a granted tradition's own, an archetype's cantrip's own,
 * an innate spell's own), so the row says `addAbility: "casting"` and the
 * cast hands in the key it used.
 */
const ABILITIES = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);

/** The row's word for "the ability this cast was made with". */
const CASTING = "casting";

/*
 * AND A COPY THAT NEVER HAD THE ROW (3.674.0). Graham, 28 October 2026: "The
 * spell Hurling should add the casters magical ability score to total damage
 * inflicted, this is not currently working."
 *
 * The world's own casters were repaired at 3.666.1, but every copy the repair
 * never reached still rolls a bare 1d6: the Fiends & Fables creatures (Balor,
 * the Dao, the Human Ghost …), a caster kept in a compendium, and any of them
 * brought into a world later (the world pass does not run again, and their
 * rows carry `persistentOn`, so it would not match them anyway). Each of those
 * copies still carries the printed sentence. So a row that declares nothing
 * reads it: the two sentences the spells pack prints, and no other.
 */
const PRINTED = Object.freeze([
  // Hurling: "it inflicts 1d6 + magical ability score bludgeoning damage."
  { re: /\binflicts\s+\d*d\d+\s*\+\s*(?:your\s+)?magical ability score\b/i, ability: CASTING },
  // Guiding Stone: "bludgeoning damage equal to 2d6 plus your melee damage modifier."
  { re: /\bequal to\s+\d*d\d+\s+plus your melee damage modifier\b/i, ability: "strength" }
]);

/** The ability a spell's printed text adds to its damage, or "". */
function printedDamageAbility(text) {
  const plain = String(text ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return PRINTED.find((p) => p.re.test(plain))?.ability ?? "";
}

/**
 * The ability a damage row adds: a named ability, "casting", or "". A row
 * that declares `addAbility` is followed as it says (a GM's "" included);
 * one that declares nothing reads the spell's printed text, when given.
 */
export function damageAbility(damageRow, printedText = "") {
  if (damageRow && Object.hasOwn(damageRow, "addAbility")) {
    const a = String(damageRow.addAbility ?? "").trim().toLowerCase();
    return ABILITIES.includes(a) || a === CASTING ? a : "";
  }
  return printedDamageAbility(printedText);
}

/**
 * The formula with the caster's ability added.
 *
 * @param {string} formula the warped formula
 * @param {object} damageRow the spell's damage row
 * @param {object} casterSystem the caster's `system`
 * @param {string} [castingAbilityKey] the ability this cast used, for a row
 *   that says "casting"; the sheet's own casting ability when not handed in
 * @param {string} [printedText] the spell's description, read when the row
 *   declares nothing (a copy older than its row, 3.674.0)
 * @returns {{formula: string, added: number, ability: string}}
 */
export function withDamageAbility(formula, damageRow, casterSystem, castingAbilityKey = "", printedText = "") {
  const named = damageAbility(damageRow, printedText);
  const ability = named === CASTING
    ? [castingAbilityKey, casterSystem?.magic?.castingAbility]
      .map((k) => String(k ?? "").trim().toLowerCase())
      .find((k) => ABILITIES.includes(k)) ?? ""
    : named;
  if (!ability || !formula) return { formula, added: 0, ability: "" };
  const added = Math.trunc(Number(casterSystem?.attributes?.[ability]?.total ?? 0)) || 0;
  if (!added) return { formula, added: 0, ability };
  return { formula: `${formula} ${added < 0 ? "-" : "+"} ${Math.abs(added)}`, added, ability };
}

/**
 * THE OLD "ADD IT BY HAND" NOTE (3.674.0, found live on 28 October 2026;
 * amended at 3.674.1, Graham: "amend text"). The copies the 3.666.1 repair
 * never reached carry the note it retired: "Damage is 1d6 + your magical
 * ability score modifier (the flat ability bonus is added by hand)". Now
 * that the damage adds the ability, the note says so instead, whenever the
 * spell's damage adds an ability, and only then.
 */
const ADDED_FOR_YOU = "(added to the damage roll for you)";

/**
 * @param {object[]} effects the spell's effect rows
 * @param {object} damageRow its damage row
 * @param {string} [printedText] its description
 * @returns {object[]}
 */
export function withAmendedAddByHandNotes(effects, damageRow, printedText = "") {
  if (!Array.isArray(effects) || !damageAbility(damageRow, printedText)) return effects;
  const RE = /\(\s*the flat ability (?:bonus|score) is added by hand\s*\)/i;
  return effects.map((e) => (e?.kind === "note" && RE.test(String(e?.text ?? ""))
    ? { ...e, text: String(e.text).replace(RE, ADDED_FOR_YOU) }
    : e));
}
