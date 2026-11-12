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
 * A SECOND SOURCE OF THE SAME SAVE (3.677.0; Eldritch Arts' Null Aura,
 * Graham's C1 of 1 November 2026): "Your aura also disrupts beneficial
 * spells cast upon you by other casters, and you must make a successful Will
 * saving throw against the caster's Spell Save DC to benefit from them." Not
 * a tradition at all, so it is declared on the creature's own ability:
 *
 *   flags.trg-prime.beneficialSpellSave: { label: "Null Aura", otherCastersOnly: true }
 *
 * The same roll, against the same DC (the caster's spell save DC), for the
 * same spells (`isBeneficialSpell`); `otherCastersOnly` spares the
 * creature's own spells on itself. A creature with both a forbidden
 * tradition and such an ability rolls once.
 *
 * WHY THIS IS NOT A CONDITIONAL. The -2 penalty is a modifier on a roll the
 * target was making anyway, which is exactly what the conditional engine is
 * for. This is a roll that would not otherwise happen at all, whose outcome
 * removes the spell's effect from one target and leaves it on the others.
 * That is workflow, not arithmetic.
 */

import { TRGCheck } from "../dice/check.mjs";
import { traditionList, beneficialSaveTraditionsOf } from "./tradition-gate.mjs";
import { highMagicCast, forbiddenSparesHighMagic } from "./high-magic.mjs";

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
 * The beneficial-spell saves a creature's own abilities and feats declare
 * (3.677.0): `flags.trg-prime.beneficialSpellSave`. An ability switched off
 * declares nothing.
 *
 * @param {Actor|{items: object[]}} target
 * @returns {Array<{label: string, otherCastersOnly: boolean}>}
 */
export function declaredBeneficialSaves(target) {
  const out = [];
  for (const item of Array.from(target?.items ?? [])) {
    if (!item || !["ability", "feat", "race", "heritage"].includes(item.type)) continue;
    if (item.type === "ability" && item.system?.active === false) continue;
    const raw = item.flags?.["trg-prime"]?.beneficialSpellSave;
    if (!raw || typeof raw !== "object") continue;
    out.push({ label: String(raw.label ?? item.name ?? "").trim() || "A feature", otherCastersOnly: raw.otherCastersOnly === true });
  }
  return out;
}

/**
 * Does this target have to roll before this spell may help them?
 *
 * A HIGH MAGIC CAST IS EVERY TRADITION (3.683.0; Eldritch Arts Block 5,
 * Graham's Q58): "Ascendan suffer penalties for High Magic (as it combines
 * all magic)", so a beneficial High Magic cast asks the Will save of every
 * creature whose Forbidden Magic names any tradition — the "any open route"
 * reading below is for a spell learnable several ways, not for one that is
 * all of them at once. Unless the creature is spared (Q59, Unbound:
 * `forbiddenSparesHighMagic`), when its Forbidden Magic does not apply to that
 * cast at all. A declared save (Null Aura) is not Forbidden Magic and is
 * unchanged. Whether the cast is High Magic is `highMagicCast(caster,
 * spellData)` unless the caller says (`options.highMagic`).
 *
 * @param {Actor} target
 * @param {object} spellData
 * @param {Actor|null} [caster] who cast it (3.677.0), for `otherCastersOnly`
 * @param {{highMagic?: boolean}} [options]
 * @returns {{required: boolean, traditions: string[], source: string, kind?: string}}
 */
export function beneficialSaveRequired(target, spellData, caster = null, { highMagic } = {}) {
  if (!isBeneficialSpell(spellData)) return { required: false, traditions: [], source: "" };
  const castIsHighMagic = typeof highMagic === "boolean" ? highMagic : highMagicCast(caster, spellData).highMagic;
  const byTradition = traditionSaveRequired(target, spellData, castIsHighMagic);
  if (byTradition.required) return byTradition;
  // THE DECLARED SAVE (3.677.0): Null Aura. "By other casters": a creature's
  // own spell on itself is not disrupted.
  const own = Boolean(caster && target && (caster === target || (caster.uuid && caster.uuid === target.uuid)));
  const declared = declaredBeneficialSaves(target).find((d) => !(d.otherCastersOnly && own));
  if (declared) return { required: true, traditions: [], source: declared.label, kind: "declared" };
  return byTradition;
}

/** The Ascendan's clause on its own: a spell of a forbidden tradition. */
function traditionSaveRequired(target, spellData, highMagic = false) {
  // ASKED OF THE CLAUSE'S OWN FLAG (3.552.0), not of the cast gate —
  // see beneficialSaveTraditionsOf for the Nerini defect that cost.
  const forbidden = beneficialSaveTraditionsOf(target);
  // A HIGH MAGIC CAST (3.683.0, Q58/Q59): every tradition at once, so every
  // forbidden one overlaps and no route is open — unless High Magic spares
  // this creature's Forbidden Magic (Unbound). The guard on `forbidden` is
  // needed here, unlike below: with nothing forbidden there is no clause.
  if (highMagic) {
    if (!forbidden.length || forbiddenSparesHighMagic(target)) return { required: false, traditions: [], source: "" };
    return { required: true, traditions: forbidden.map((f) => f.tradition), source: forbidden[0].source };
  }
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
export async function beneficialTraditionSave(caster, spell, { targets = [], saveDC = 10, lines = [], outcomes = null } = {}) {
  const spellData = spell?.system ?? {};
  const allowed = [];

  for (const target of targets) {
    // WHETHER THE CAST IS HIGH MAGIC (3.683.0, Q58) is read inside, off the
    // caster and the spell, as the cast itself reads it (`highMagicCast`) —
    // so a live emanation's latecomer is asked exactly as the cast asked.
    const need = beneficialSaveRequired(target, spellData, caster);
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
    // WHAT EACH TARGET ROLLED (3.677.1), for a caller that must remember it:
    // a live emanation, whose circle would otherwise hand its help to the
    // creature this roll just refused it to.
    if (outcomes instanceof Map) outcomes.set(target, passed);
    // THE CARD SAYS WHICH RULE ASKED (3.677.0): a forbidden tradition, or an
    // ability that disrupts beneficial magic (Null Aura).
    const declared = need.kind === "declared";
    if (passed) {
      allowed.push(target);
      lines.push(declared
        ? `<p>${target.name}: <strong>accepts ${spell.name}</strong> (Will ${total} vs ${saveDC}) — ${need.source} disrupts beneficial magic, but this takes hold normally.</p>`
        : `<p>${target.name}: <strong>accepts ${spell.name}</strong> (Will ${total} vs ${saveDC}) — ${
          need.source} allows no connection with this magic, but it takes hold normally.</p>`
      );
    } else {
      lines.push(declared
        ? `<p>${target.name}: <strong>rejects ${spell.name}</strong> (Will ${total} vs ${saveDC}) — ${need.source} disrupts it, and the spell has no effect on them.</p>`
        : `<p>${target.name}: <strong>rejects ${spell.name}</strong> (Will ${total} vs ${saveDC}) — ${
          need.source} leaves them no connection with it, and the spell has no effect on them.</p>`
      );
    }
  }

  return allowed;
}

/*
 * ── A BENEFICIAL EMANATION (3.677.1) ──────────────────────────────────
 *
 * Found live on 3.677.0: a Nyrinn inside Protective Ward rolled Null Aura's
 * save at the cast, failed, and the card said "the spell has no effect on
 * them" — and the emanation's own membership sweep handed them its +1 DB a
 * moment later, because it adds its effect to everyone standing in the
 * circle and had never heard of this save. The Ascendan had the same hole
 * against a forbidden-tradition Bless.
 *
 * Graham, 1 November 2026: the save applies after the cast too. A creature
 * that walks in later rolls it once, as Bane's latecomers roll theirs (his
 * ruling of 28 August 2026), and what it rolled is remembered: a creature
 * that refused the help never gets it from this circle, and one that
 * accepted it is not asked again.
 *
 * So the emanation carries a `benefit` record:
 *   { spell: <what isBeneficialSpell and the tradition clause read>,
 *     saveDC, accepted: { [tokenId]: true | false } }
 * written at the cast from what the cast rolled, and kept by the sweep.
 */

/**
 * The parts of a spell's data the beneficial-spell save reads, or null when
 * the spell is not beneficial (and so asks nobody anything).
 *
 * @param {object} spellData
 * @returns {object|null}
 */
export function benefitSpellSnapshot(spellData) {
  if (!isBeneficialSpell(spellData)) return null;
  const effects = Array.isArray(spellData?.effects) ? spellData.effects : [];
  return {
    tradition: spellData?.tradition ?? "",
    traits: spellData?.traits ?? "",
    areaTargeting: spellData?.areaTargeting ?? "",
    category: spellData?.category ?? "",
    defence: spellData?.defence ?? "",
    damage: { formula: String(spellData?.damage?.formula ?? "") },
    effects: effects.map((e) => ({ kind: e?.kind ?? "" }))
  };
}

/**
 * The emanation's `benefit` record, from what the cast's save rolled.
 *
 * @param {object} spellData
 * @param {number|null} saveDC the caster's spell save DC
 * @param {Map<object, boolean>} outcomes target → passed, from beneficialTraditionSave
 * @param {(target: object) => string|null} tokenIdOf
 * @returns {object|null}
 */
export function benefitRecord(spellData, saveDC, outcomes, tokenIdOf) {
  const spell = benefitSpellSnapshot(spellData);
  if (!spell) return null;
  const accepted = {};
  for (const [target, passed] of outcomes ?? []) {
    const id = tokenIdOf(target);
    if (id) accepted[id] = Boolean(passed);
  }
  return { spell, saveDC: Number.isFinite(Number(saveDC)) ? Number(saveDC) : null, accepted };
}

/** The creatures inside a beneficial circle that refused it: left out of it. */
export function benefitMembers(inside = [], accepted = {}) {
  return inside.filter((id) => accepted?.[id] !== false);
}

/** The creatures inside it that have not yet been asked. */
export function benefitUnasked(inside = [], accepted = {}) {
  return inside.filter((id) => !Object.prototype.hasOwnProperty.call(accepted ?? {}, id));
}
