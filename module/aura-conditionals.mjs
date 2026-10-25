/**
 * Ally auras — the third kind, and the one that gives rather than takes.
 *
 * "Allies within the aura gain advantage to saves against fear and charm
 * effects." (Aura of Tranquility, Creature Codex.)
 *
 * WHY THIS IS NOT A NEW MECHANISM. A bonus that is real but scoped, that
 * a creature simply has while a condition holds, already has a home:
 * module/conditionals.mjs, whose whole subject is "permanent but scoped"
 * — the Dwarf's +2 against poison, Lead Boots' -4 to swim. An ally aura
 * is the same shape with one extra clause: it holds while you are
 * standing inside a circle. So this produces CONDITIONALS, run-time
 * ones, and hands them in through the same door the runes already use
 * (`collectConditionals`'s third argument, for entries that are derived
 * rather than authored). Nothing new renders, nothing new stacks, and
 * "advantage" keeps meaning exactly one thing in this system.
 *
 * TWO ENTRIES PER AURA, NOT ONE, and that is the crux. The grant is
 * scoped to "saves against fear and charm effects", and this system
 * knows the traits of a save's PROVOKER — an affliction's Poison, a
 * spell's Fear — but only when something provoked it. A Will save the GM
 * simply calls for carries no traits at all, and that is the commonest
 * case at a table. One entry scoped to the traits would therefore be
 * silent on precisely the roll people make most.
 *
 * So each aura yields:
 *
 *   the EXACT one   — save + fear/charm traits, `auto`, pre-ticked,
 *                     because the spell that forced the save has already
 *                     said it is a fear effect and there is nothing left
 *                     to judge;
 *   the JUDGEMENT one — any other save, offered unticked with the page's
 *                     own wording, because "is this fear" is a reading
 *                     of the fiction and nothing on the roll can settle
 *                     it.
 *
 * The second excludes the first's traits (`not`), so the two can never
 * both appear and the advantage cannot be taken twice. That is the Lead
 * Boots shape, which module/conditionals.mjs describes and which this
 * reuses rather than reinventing.
 *
 * Pure and Foundry-free: it takes geometry in feet and plain objects,
 * exactly as module/creature-auras.mjs does.
 */

import { auraReachFeet, withinAura } from "./creature-auras.mjs";

/**
 * Foundry's token dispositions, named so the rule below reads.
 * SECRET (-2) is deliberately absent: a token whose disposition is
 * hidden tells us nothing, and "nothing" must not become "enemy".
 */
export const DISPOSITION = Object.freeze({ HOSTILE: -1, NEUTRAL: 0, FRIENDLY: 1 });

/**
 * Do we have POSITIVE EVIDENCE that these two are enemies?
 *
 * "Ally" is a fact about the fiction, and this system has no ally
 * relation — only Foundry's token disposition, which is a proxy and a
 * poor one. The temptation is to require a match: offer the aura only to
 * creatures sharing the emitter's disposition. That is wrong in the
 * quiet direction. A friendly NPC left on Neutral, a summon nobody
 * re-coloured, a party token the GM never touched — every one of them
 * would silently lose a bonus the page grants them, and nobody would
 * ever know, because a row that does not appear asks no questions.
 *
 * So the rule is the weaker and safer one: **suppress only on positive
 * evidence of enmity.** Friendly against hostile, or hostile against
 * friendly, and nothing else. Absence of evidence leaves the row
 * offered, unticked, with the word "Allies" in it — and the person
 * reading it decides, which is what they were going to do anyway.
 */
export function plainlyOpposed(emitterDisposition, subjectDisposition) {
  const a = Number(emitterDisposition);
  const b = Number(subjectDisposition);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (a === DISPOSITION.FRIENDLY && b === DISPOSITION.HOSTILE) return true;
  if (a === DISPOSITION.HOSTILE && b === DISPOSITION.FRIENDLY) return true;
  return false;
}

/**
 * The conditional entries one ally aura grants, as `normaliseConditional`
 * expects them.
 *
 * Returns [] for anything that is not an ally aura with a grant, so a
 * malformed entry costs its own aura and nothing else — the same
 * forgiveness normaliseAura extends, for the same reason.
 */
export function allyAuraConditionals(aura, emitter = {}) {
  if (!aura || aura.kind !== "ally") return [];
  const grant = aura.grants;
  if (!grant || typeof grant !== "object") return [];

  const kind = String(grant.kind ?? "").trim().toLowerCase();
  if (!kind) return [];

  const traits = (Array.isArray(grant.traits) ? grant.traits : [])
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);

  // The check type the grant reaches. The page says "saves"; anything
  // else would have to be written on the aura, not guessed here.
  const checkTypes = (Array.isArray(grant.checkTypes) && grant.checkTypes.length
    ? grant.checkTypes
    : ["save"]).map((t) => String(t).trim().toLowerCase()).filter(Boolean);

  const emitterName = String(emitter?.name ?? "").trim();
  const label = emitterName ? `${aura.name} (${emitterName})` : aura.name;
  const scope = String(grant.scope ?? "").trim();
  // KEYED BY EMITTER as well as by aura. Two clerics both running Aura
  // of Tranquility are two grants, and an id shared between them would
  // have the dialog's tickbox for one silently stand for the other.
  const key = `aura-grant:${emitter?.id ?? "emitter"}:${aura.id}`;
  // A MODIFIER aura carries its number and type (3.571.0): Pillars of
  // Faith's Keeper at the Threshold gives allies "+1 status to saving
  // throws against possession" — the same two rows an advantage aura
  // yields, each with a value. An advantage aura carries neither.
  const figure = kind === "modifier"
    ? { value: Math.trunc(Number(grant.value)), type: String(grant.type ?? "circumstance").trim().toLowerCase() || "circumstance" }
    : {};
  if (kind === "modifier" && (!Number.isFinite(figure.value) || figure.value === 0)) return [];
  // An aura may also name the ACTIONS it reaches (Lantern of the Bloom:
  // "+1 status to Sense Direction"); read like the traits, optional.
  const actions = (Array.isArray(grant.actions) ? grant.actions : []).map((a) => String(a ?? "").trim()).filter(Boolean);
  const reach = actions.length ? { checkTypes, actions } : { checkTypes };

  // Without traits there is nothing to be exact ABOUT, so the aura
  // yields the judgement row alone rather than two identical ones.
  if (!traits.length) {
    return [{
      id: key,
      kind, label, scope, ...figure,
      when: reach,
      auto: false
    }];
  }

  return [
    {
      id: `${key}:exact`,
      kind, label, scope, ...figure,
      when: { checkTypes, traits },
      // The provoking spell or affliction already said it is a fear
      // effect. Nothing is left for a person to decide, so nothing is
      // asked — and this is what makes the aura reach a save rolled
      // without a dialog at all.
      auto: true
    },
    {
      id: `${key}:judged`,
      kind, label, scope, ...figure,
      // …but NOT when the traits already settled it, or the same
      // advantage would be offered twice on one roll.
      //
      // THE EXCLUSION LIVES INSIDE `when`. normaliseConditional reads it
      // from `when.not`, and an entry that puts it at the top level has
      // no exclusion at all — it is simply dropped, silently, and both
      // rows appear on a fear save. Written at the top level first, and
      // caught by check C4 below rather than at a table.
      when: { checkTypes, not: { traits } },
      auto: false
    }
  ];
}

/**
 * Every ally-aura conditional in force for one creature, right now.
 *
 * Position is the whole point, so this takes the same geometry
 * `aurasCatching` does — centres in FEET, never pixels — and applies the
 * same two exclusions the save auras already record:
 *
 *   - A CREATURE IS NOT ITS OWN ALLY. `aurasCatching` excludes the
 *     emitter from its own aura on the reading that "a thing does not
 *     emanate onto itself", and the page's own word here is "Allies",
 *     which a creature is not to itself. Both readings agree, so the
 *     emitter is excluded — but it is a RULING, and it is the one to
 *     revisit if Graham reads it the other way.
 *   - reach is measured from the emitter's space, not its centre point,
 *     via auraReachFeet — the same reading the size table's reach column
 *     uses.
 *
 * @param {object} args
 * @param {{id, centreFeet, disposition}} args.subject
 * @param {Array<{id, centreFeet, widthFeet, disposition, name, auras}>} args.emitters
 * @returns {object[]} Raw conditionals, for collectConditionals.
 */
export function allyConditionalsInForce({ subject, emitters = [] } = {}) {
  if (!subject) return [];
  const found = [];
  for (const emitter of emitters) {
    if (emitter.id === subject.id) continue;
    if (plainlyOpposed(emitter.disposition, subject.disposition)) continue;
    for (const aura of emitter.auras ?? []) {
      // NO `kind` GUARD HERE. allyAuraConditionals already refuses
      // anything that is not an ally aura, and a second copy of that
      // rule would mean no mutation of either could be caught — the
      // same shape as the duplicated Abyssal-Darkness guard collapsed in
      // module/light.mjs. One rule, one place.
      // ONLY WHILE SWITCHED ON (3.669.0), as ally-aura-effects.mjs.
      if (aura.emitterState && !(emitter.states ?? []).includes(aura.emitterState)) continue;
      const reach = auraReachFeet(aura.radius, emitter.widthFeet);
      if (!withinAura(emitter.centreFeet, subject.centreFeet, reach)) continue;
      found.push(...allyAuraConditionals(aura, emitter));
    }
  }
  return found;
}
