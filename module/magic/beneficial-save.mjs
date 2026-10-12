import { spellDefersItsSave } from "./sanctuary.mjs";
/**
 * The Will save a cut-off creature makes against magic meant to help it
 * (Chapter 2, the Ascendan's Forbidden Magic, third clause).
 *
 *   "…and must also make a Will saving throw against beneficial spells of
 *    these traditions when cast upon you with a success allowing the spell
 *    to affect you normally."
 *
 * A SAVE YOU WANT TO PASS, which is the opposite of every other save in the
 * system and the thing most likely to be misread on the card. Success means
 * the help lands. Failure means your body rejects it — per Graham's ruling
 * of 15 Aug 2026, the spell simply has no effect on you. The caster still
 * spends what they spent; this happens at the target, after the cast has
 * already resolved.
 *
 * WHAT COUNTS AS BENEFICIAL, per the same ruling: a spell aimed at allies,
 * read from what the spells already carry rather than from a new field
 * tagged across 692 entries. Two signals, either of which is enough:
 *
 *   - `areaTargeting: "allies"` — the spell's own declaration of who it is
 *     for. Bless is the shape.
 *   - a structured effect that HELPS — a heal, temp HP, or a bonus — with
 *     no damage formula and no condition being inflicted.
 *
 * And one hard exclusion that outranks both: a spell carrying a save the
 * target would want to FAIL is not beneficial however it is targeted, or a
 * Charm aimed at you would provoke two contradictory saves.
 *
 * WHY THIS IS NOT A CONDITIONAL. The -2 penalty is a modifier on a roll the
 * target was making anyway, which is exactly what the conditional engine is
 * for. This is a roll that would not otherwise happen at all, whose outcome
 * removes the spell's effect from one target and leaves it on the others.
 * That is workflow, not arithmetic.
 */

import { TRGCheck } from "../dice/check.mjs";
import { traditionList, beneficialSaveTraditionsOf } from "./tradition-gate.mjs";

/**
 * Would this spell, cast on you, be doing you a favour?
 *
 * Deliberately conservative: when the answer is unclear the spell is NOT
 * beneficial, so the save does not fire and nothing is taken away from a
 * player by a guess. A rule that occasionally fails to trigger is a
 * smaller problem than one that silently cancels a heal.
 *
 * @param {object} spellData The spell's `system`.
 * @returns {boolean}
 */
export function isBeneficialSpell(spellData) {
  /*
   * A spell that makes its target roll to resist is aimed AT them, whatever
   * else it does. Checked first so it cannot be overridden by the two
   * positive signals below.
   *
   * UNLESS THE SAVE IS SOMEBODY ELSE'S (3.598.0). Sanctuary prints "Saving
   * Throw Will" and nobody it is cast on ever rolls it — each OPPONENT does,
   * at the moment they attack. Read without this clause, the one field that
   * decides "aimed at them" said a 2 PP ward on a friend was an attack, and
   * an unwilling creature it was cast on lost the tradition save it should
   * have had. See magic/sanctuary.mjs for the same field misleading the cast
   * workflow's save branch in the other direction.
   */
  if (String(spellData?.defence ?? "").trim() && !spellDefersItsSave(spellData?.effects)) return false;
  if (String(spellData?.category ?? "").trim().toLowerCase() === "attack") return false;
  if (String(spellData?.damage?.formula ?? "").trim()) return false;

  if (String(spellData?.areaTargeting ?? "").trim().toLowerCase() === "allies") return true;

  const effects = Array.isArray(spellData?.effects) ? spellData.effects : [];
  const helpful = effects.filter((effect) => {
    const kind = String(effect?.kind ?? "").trim().toLowerCase();
    // `sanctuary` JOINED THE LIST at 3.598.0: a ward that makes opponents
    // save before they can attack you is unambiguously a favour, and it is
    // the first helpful row that is neither a heal, temp HP nor a bonus.
    return kind === "heal" || kind === "temphp" || kind === "bonus" || kind === "sanctuary";
  });
  if (!helpful.length) return false;

  // A spell that heals AND inflicts is not unambiguously a favour, so it
  // falls through to "not beneficial" rather than being judged here.
  const harmful = effects.some((effect) => {
    const kind = String(effect?.kind ?? "").trim().toLowerCase();
    return kind === "condition" || kind === "damage" || kind === "penalty";
  });
  return !harmful;
}

/**
 * Does this target have to roll before this spell may help them?
 *
 * @param {Actor} target
 * @param {object} spellData
 * @returns {{required: boolean, traditions: string[], source: string}}
 */
export function beneficialSaveRequired(target, spellData) {
  if (!isBeneficialSpell(spellData)) return { required: false, traditions: [], source: "" };

  // ASKED OF THE CLAUSE'S OWN FLAG (3.552.0), not of the cast gate —
  // see beneficialSaveTraditionsOf for the Nerini defect that cost.
  const forbidden = beneficialSaveTraditionsOf(target);
  // No `if (!forbidden.length) return …` guard. It was here, and it was a
  // DUPLICATE: with nothing forbidden, `forbiddenNames` is empty, `overlap`
  // is empty, and the check below already answers "no save". Two copies of
  // one guarantee mask each other — removing either changes nothing and
  // tells you nothing — which is what `isOfKind` found at 3.315.0 and
  // `thrown-weapons` before it. The mutation runner is what made it
  // visible: deleting the guard survived. E9 tests the real reason.
  const forbiddenNames = new Set(forbidden.map((f) => f.tradition));
  const overlap = traditionList(spellData?.tradition).filter((t) => forbiddenNames.has(t));
  if (!overlap.length) return { required: false, traditions: [], source: "" };

  // THE SAME "ANY OPEN ROUTE" READING the cast gate uses. A spell the
  // target has any connection to is not foreign magic being forced on
  // them, so a four-tradition spell reaches an Ascendan unchallenged.
  const spellTraditions = traditionList(spellData?.tradition);
  if (spellTraditions.some((t) => !forbiddenNames.has(t))) {
    return { required: false, traditions: [], source: "" };
  }

  return {
    required: true,
    traditions: overlap,
    source: forbidden.find((f) => overlap.includes(f.tradition))?.source ?? "A feature"
  };
}

/**
 * Roll it, and report.
 *
 * Called once per prospective target BEFORE the spell's effects are
 * applied, and returns the targets the spell is still allowed to help.
 *
 * @param {Actor} caster
 * @param {Item} spell
 * @param {object} options
 * @param {Actor[]} options.targets
 * @param {number} options.saveDC The DC the target rolls against.
 * @param {Array} options.lines The card's line list, appended to.
 * @returns {Promise<Actor[]>} The targets that may still be affected.
 */
export async function beneficialTraditionSave(caster, spell, { targets = [], saveDC = 10, lines = [] } = {}) {
  const spellData = spell?.system ?? {};
  const allowed = [];

  for (const target of targets) {
    const need = beneficialSaveRequired(target, spellData);
    if (!need.required) {
      allowed.push(target);
      continue;
    }

    const save = target.system?.combat?.saves?.will;
    const check = await TRGCheck.roll({
      actor: target,
      label: `${target.name} — Will Save`,
      // The card has to say which way this one runs, because it is the
      // only save in the system whose success is what the target wants.
      subtitle: `to accept ${spell.name} — DC ${saveDC} — success lets it affect you`,
      type: "save",
      traits: spellData.traits ?? "",
      // NOT the spell's tradition. The -2 penalty is "to saving throws
      // AGAINST these traditions" — this save is not against the spell,
      // it is an attempt to accept it, and handing the tradition in here
      // would auto-apply a penalty to the one roll the rule wants the
      // target to pass. The two clauses of Forbidden Magic pull opposite
      // ways and this is where that is decided.
      traditions: "",
      subject: "will",
      dc: saveDC,
      modifiers: save?.checkModifiers ?? [
        { label: "Will save", value: Number(save?.total ?? 0), type: "untyped" }
      ]
    });

    const passed = Boolean(check.outcome?.degree?.success);
    const total = check.outcome?.total ?? 0;
    if (passed) {
      allowed.push(target);
      lines.push(
        `<p>${target.name}: <strong>accepts ${spell.name}</strong> (Will ${total} vs ${saveDC}) — ${
          need.source} allows no connection with this magic, but it takes hold normally.</p>`
      );
    } else {
      lines.push(
        `<p>${target.name}: <strong>rejects ${spell.name}</strong> (Will ${total} vs ${saveDC}) — ${
          need.source} leaves them no connection with it, and the spell has no effect on them.</p>`
      );
    }
  }

  return allowed;
}
