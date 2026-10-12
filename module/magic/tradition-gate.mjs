/**
 * Traditions a character has no connection with (Chapter 2).
 *
 * THE RULE THIS EXISTS FOR — the Ascendan's Forbidden Magic:
 *
 *   "You have absolutely no connection with either divine or verdant magic
 *    and cannot cast spells from these traditions. You have a -2 penalty to
 *    all saving throws against these traditions of magic and must also make
 *    a Will saving throw against beneficial spells of these traditions when
 *    cast upon you with a success allowing the spell to affect you normally."
 *
 * Three clauses, three mechanisms, and only the first lives here:
 *
 *   1. CANNOT CAST — this file. A gate beside the component and kind gates,
 *      before any PP or AP is committed.
 *   2. -2 TO SAVES — a conditional on the ability, scoped by the
 *      `traditions` axis added to `conditionals.mjs`. Not code.
 *   3. WILL SAVE VS BENEFICIAL SPELLS — `beneficial-save.mjs`, at the
 *      target rather than the caster.
 *
 * Live on 15 August 2026, on 3.315.1, an Ascendan carrying Forbidden Magic
 * cast Bless (tradition `divinity`) end to end: no warning, no refusal, PP
 * 50 -> 49, "The spell takes effect." The ability shipped an Active Effect
 * carrying `featNote: true` and no changes — printed on the sheet and read
 * by nothing.
 *
 * GENERAL, NOT ASCENDAN-SPECIFIC, per Graham's ruling of 15 Aug 2026. Any
 * item may declare `flags["trg-prime"].forbiddenTraditions`; this reads
 * whatever it finds. A future curse, race or cursed item gets the rule with
 * no code change, which is the same reasoning that put the kind gate behind
 * a `kindGate` field rather than a list of five spell names.
 *
 * THE NAMING TRAP, recorded because it cost a reading of the audit. The
 * rulebook says "divine"; the spell pack says **`divinity`**. A gate written
 * against the book's word matches nothing and looks like it works —
 * every cast is allowed and no error is ever raised. `TRADITION_SYNONYMS`
 * is the one place that is reconciled, and `verify-forbidden-traditions`
 * asserts the pack's four spellings are all reachable.
 */

const SYSTEM_ID = "trg-prime";

/**
 * What the book calls a tradition, mapped to what the pack calls it.
 *
 * Only where the two genuinely differ. Anything absent passes through
 * unchanged, so authoring `verdant` needs no entry and gains nothing from
 * having one.
 */
export const TRADITION_SYNONYMS = Object.freeze({
  divine: "divinity",
  divinity: "divinity"
});

/** The four the pack ships. Asserted against the pack by the harness. */
export const TRADITIONS = Object.freeze(["arcane", "divinity", "ethereal", "verdant"]);

/**
 * Split a tradition field into normalised names.
 *
 * A spell's `system.tradition` is a comma-separated string and is
 * routinely plural — "arcane, divinity, ethereal, verdant" is a real
 * entry (Alarm). Every name is normalised through the synonym table, so a
 * forbidden list authored with the book's word still matches the pack's.
 *
 * @param {string|string[]} value
 * @returns {string[]}
 */
export function traditionList(value) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(/[,;]/);
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    const name = String(part ?? "").trim().toLowerCase();
    if (!name) continue;
    const canonical = TRADITION_SYNONYMS[name] ?? name;
    if (seen.has(canonical)) continue;
    seen.add(canonical);
    out.push(canonical);
  }
  return out;
}

/**
 * Every tradition this actor is cut off from, and what says so.
 *
 * Read from items AND their transferred effects, so a forbidden tradition
 * can be granted temporarily by a spell or a curse without needing an item
 * of its own — the same two homes `collectConditionals` reads.
 *
 * @param {Actor} actor
 * @returns {Array<{tradition: string, source: string}>}
 */
export function forbiddenTraditionsOf(actor) {
  const found = [];
  const seen = new Set();
  const consider = (document) => {
    const declared = document?.flags?.[SYSTEM_ID]?.forbiddenTraditions;
    if (!declared) return;
    for (const tradition of traditionList(declared)) {
      if (seen.has(tradition)) continue;
      seen.add(tradition);
      found.push({ tradition, source: String(document.name ?? "A feature") });
    }
  };
  for (const item of Array.from(actor?.items ?? [])) consider(item);
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect?.disabled) continue;
    consider(effect);
  }
  return found;
}

/**
 * Traditions whose BENEFICIAL spells this creature must save against.
 *
 * A SEPARATE FLAG FROM `forbiddenTraditions`, AND THAT IS THE WHOLE POINT
 * (3.552.0).
 *
 * The Ascendan's Forbidden Magic prints three clauses, and only the third
 * is this one: "must also make a Will saving throw against beneficial
 * spells of these traditions when cast upon you with a success allowing
 * the spell to affect you normally."
 *
 * It used to be inferred from `forbiddenTraditions` instead — the flag
 * that means "cannot cast" — with no test of which feature declared it.
 * The pages 18-30 audit found what that costs: the Nerini gnome heritage
 * carries the same flag for its own quite different rule, "you can never
 * be an ethereal or verdant spell caster", which says nothing about
 * receiving anything. So a Nerini healed by a verdant ally had to roll a
 * Will save for the healing to be allowed to work, under a rule they do
 * not have. Two rules sharing one flag, and the narrower one inheriting
 * the wider one's consequences.
 *
 * Declared, therefore, rather than inferred: a feature that imposes the
 * save says so.
 *
 * @param {Actor} actor
 * @returns {Array<{tradition: string, source: string}>}
 */
export function beneficialSaveTraditionsOf(actor) {
  const found = [];
  const seen = new Set();
  const consider = (document) => {
    const declared = document?.flags?.[SYSTEM_ID]?.beneficialTraditionSave;
    if (!declared) return;
    for (const tradition of traditionList(declared)) {
      if (seen.has(tradition)) continue;
      seen.add(tradition);
      found.push({ tradition, source: String(document.name ?? "A feature") });
    }
  };
  for (const item of Array.from(actor?.items ?? [])) consider(item);
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect?.disabled) continue;
    consider(effect);
  }
  return found;
}

/**
 * Which of a spell's traditions this caster is cut off from.
 *
 * A SPELL OF SEVERAL TRADITIONS IS CASTABLE IF ANY ONE OF THEM IS OPEN TO
 * YOU, and that is a reading rather than an oversight. Alarm is "arcane,
 * divinity, ethereal, verdant" — one spell learnable four ways, not a
 * spell that is four things at once. An Ascendan cut off from divinity and
 * verdant casts it as an arcane spell, which is what "no connection with
 * divine magic" costs them: the divine ROUTE, not the spell.
 *
 * So this returns the blocked names for reporting, and `allowed` is false
 * only when EVERY route is closed.
 *
 * @param {Actor} actor
 * @param {object} spellData The spell's `system`.
 * @returns {{allowed: boolean, blocked: string[], open: string[], sources: string[]}}
 */
export function traditionAccess(actor, spellData) {
  const spellTraditions = traditionList(spellData?.tradition);
  const forbidden = forbiddenTraditionsOf(actor);

  // A spell with no tradition recorded is not a spell anybody is cut off
  // from — it is a spell whose data is thin, and refusing it would turn a
  // gap in the compendium into a rule nobody wrote.
  if (!spellTraditions.length || !forbidden.length) {
    return { allowed: true, blocked: [], open: spellTraditions, sources: [] };
  }

  const forbiddenNames = new Set(forbidden.map((f) => f.tradition));
  const blocked = spellTraditions.filter((t) => forbiddenNames.has(t));
  const open = spellTraditions.filter((t) => !forbiddenNames.has(t));

  return {
    allowed: open.length > 0,
    blocked,
    open,
    sources: [...new Set(forbidden.filter((f) => blocked.includes(f.tradition)).map((f) => f.source))]
  };
}

/** "divinity" -> "divine magic", for a sentence a player reads. */
function phrase(traditions) {
  const words = traditions.map((t) => (t === "divinity" ? "divine" : t));
  if (words.length === 1) return `${words[0]} magic`;
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]} magic`;
}

/**
 * Which tradition a cast actually happens in.
 *
 * NEW at 3.388.0, and it is a rule the rulebook states outright. Chapter
 * 10, opening the Specialist Spells section:
 *
 *   "Specialist spells are granted by your race, character class and
 *   archetype feats. Their descriptions follow the same format as normal
 *   spells … with the exception that a magical tradition is not provided
 *   as this will always be based upon your PRIMARY TRADITION."
 *
 * So a specialist spell's blank tradition is not missing data. It is a
 * deferred one, and the caster supplies it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BUG THIS FIXES WAS ONE OPERATOR, AND THE INTENT WAS ALREADY THERE.
 *
 * `cast-workflow.mjs` read:
 *
 *     const tradition = spellData.tradition ?? system.magic?.tradition ?? "";
 *
 * Somebody wrote that fallback meaning exactly the printed rule. `??` is
 * NULLISH coalescing, and the pack stores a specialist spell's tradition
 * as `""` — an empty string is not nullish, so the fallback could never
 * be reached. Every one of the game's 106 specialist spells cast with
 * `tradition === ""`.
 *
 * SIX RULES READ THAT VALUE, and all six went quiet:
 *
 *   armourCastingPenalty   `isArmourProhibited("")` is false for every
 *                          piece, so an ARCANE caster in full plate paid
 *                          NOTHING to cast a specialist spell where an
 *                          ordinary arcane spell cost them +16.
 *   Favoured Terrain       `/verdant/.test("")` — a Druid or Ranger never
 *                          got their -1.
 *   Blessed By the Gods /  gated on `/divinity/`, so a Cleric's +1 (or +2
 *   Cloistered Priest      with both) never reached their own specialist
 *                          spells.
 *   fumbleModifierFor      returns 0 on a falsy tradition.
 *   resonance              `etherealMagic` never true.
 *   the card               printed no tradition at all.
 *
 * None of it errored. Every one is a number that quietly failed to
 * appear, which is the shape this whole audit exists to find.
 *
 * WHY A FUNCTION AND NOT `||`. The one-character fix works and would have
 * been invisible: the next reader sees an operator, not a rule. This is
 * the rulebook speaking, it has a citation, and a harness can drive it.
 *
 * @param {string} spellTradition The spell's own `system.tradition`.
 * @param {string} casterTradition The caster's `system.magic.tradition`.
 * @returns {string} The spell's own when it has one; otherwise the
 *   caster's; otherwise "" — a caster with no tradition casting a spell
 *   with none has nothing to inherit, and inventing one would be worse
 *   than the blank.
 */
export function effectiveSpellTradition(spellTradition, casterTradition) {
  const own = String(spellTradition ?? "").trim();
  if (own) return own;
  return String(casterTradition ?? "").trim();
}

/**
 * The gate. False (and warns) to abort the cast; true to proceed.
 *
 * Same shape and same placement as `componentGate` — before any PP or AP
 * is committed, because a spell you cannot cast should cost you nothing —
 * and the refusal names the tradition and the feature responsible, for the
 * reason every refusal in this project does: a gate that only says "no"
 * gets reported as the feature not working.
 *
 * @param {Actor} actor
 * @param {object} spellData The spell's `system`.
 * @param {string} [spellName]
 * @returns {boolean}
 */
export function traditionGate(actor, spellData, spellName = "This spell") {
  const access = traditionAccess(actor, spellData);
  if (access.allowed) return true;
  const source = access.sources[0] ?? "A feature";
  ui.notifications.warn(
    `${spellName} is ${phrase(access.blocked)}, and ${source} leaves you no connection with it — you cannot cast it.`
  );
  return false;
}
