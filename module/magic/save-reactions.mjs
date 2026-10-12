/**
 * Reactions a character may spend to improve a save they are about to roll.
 *
 * THE GAP THIS FILLS, found in the Chapter 2 Gnome audit on 3.319.2. Gnome
 * Resistance reads "You may use a reaction when targeted by a spell to
 * gain advantage to the saving throw. Be aware that this ability does not
 * apply to area effect spells."
 *
 * It shipped as a Use action that checked the reaction, SPENT it, and then
 * posted: "take Advantage on the saving throw against the spell targeting
 * you (select it in the roll dialog)". There is no roll dialog to select
 * it in — a spell's save is rolled by the cast workflow and never opens
 * one. Verified live: the Gnome spent its reaction, then took a Will save
 * against Sleepwalker that rolled a single die at Modifiers +0.
 *
 * That made it worse than an unautomated rule. An unautomated rule does
 * nothing; this one took a resource and then did nothing.
 *
 * WHY IT LIVES HERE rather than in `conditionals.mjs`. The conditional
 * engine answers "what modifies this roll", and every axis it scopes by is
 * a fact — a trait, a tradition, an action. This is not a fact; it is a
 * DECISION, made by the defender, costing a resource, and it has to be
 * asked before the dice are thrown. `defence-dc.mjs` was separated from
 * the engine for the mirror reason.
 *
 * DECLARED BY FLAG, not by name. `saveReaction` on the ability names what
 * it costs and what it grants, so a later feature with the same clause
 * works unchanged — the same reasoning as Lys-Fod's language bonus and
 * Detect Magic's untrained actions.
 *
 * IT IS NO LONGER ONLY ABOUT SPELLS (3.356.0). Evasion, Juggernaut and
 * Resolve trigger on "you attempt a [reflex/fortitude/will] save, before
 * you roll" — full stop — so the offer moved to the one seam where any save
 * is about to be thrown, `TRGCheck.roll`. Breath weapons, traps, falls and
 * afflictions all reach it now, which is what makes Evasion's own blurb
 * ("area spell attacks and breath weapons") true: a breath weapon is not a
 * spell save. The file keeps its path because moving it would churn a dozen
 * harness anchors for no behaviour, but nothing here is magic-specific any
 * more.
 *
 * TWO THINGS GREW ON THE FLAG:
 *
 *   save      "reflex" | "fortitude" | "will" — which save it answers.
 *             ABSENT MEANS ANY, so Gnome Resistance, written as "when
 *             targeted by a spell" with no save named, is unchanged.
 *   freeWith  the feat that upgrades it from a Reaction to a Free (0 AP)
 *             action. Present and held: no reaction is spent, and no
 *             question is asked — there is nothing left to decide.
 *
 * The rules themselves live in ../combat/save-advantage.mjs, which is
 * where the family table and the decision are, driven by the harness.
 */

import { saveAdvantageDecision } from "../combat/save-advantage.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Every save-reaction the actor carries, from items and live effects.
 *
 * @param {Actor} actor
 * @returns {object[]} [{label, source, areaExempt}]
 */
export function saveReactionsOf(actor) {
  const found = [];
  const consider = (document) => {
    const declared = document?.flags?.[SYSTEM_ID]?.saveReaction;
    if (!declared || typeof declared !== "object") return;
    found.push({
      label: String(declared.label ?? document.name ?? "Reaction"),
      source: String(document.name ?? "A feature"),
      // "does not apply to area effect spells" — default TRUE, because
      // every rule of this shape in the chapter carries that limit and an
      // author who forgets the key should get the narrower reading.
      //
      // EVASION IS THE DELIBERATE FALSE. Its own text is "your ability to
      // evade area spell attacks and breath weapons", so the narrow default
      // would switch it off in precisely the case it exists for.
      areaExempt: declared.areaExempt !== false,
      // Which save it answers, and what makes it free. See save-advantage.mjs.
      save: String(declared.save ?? ""),
      freeWith: String(declared.freeWith ?? "")
    });
  };
  for (const item of Array.from(actor?.items ?? [])) consider(item);
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect?.disabled) continue;
    consider(effect);
  }
  return found;
}

/**
 * Whether this character could answer this particular save, and with what.
 *
 * Separated from the prompt so the decision is testable without a dialog,
 * which is the part that actually went wrong last time. The decision itself
 * lives in save-advantage.mjs; this is the part that reads a live actor.
 *
 * @param {Actor} target
 * @param {object} options
 * @param {boolean} options.isArea Whether the source is an area effect.
 * @param {string} options.save    "reflex" | "fortitude" | "will", or "" for
 *   a save whose type this system does not scope — see SAVE_SCOPE_EXEMPTIONS.
 * @returns {{eligible: boolean, reason: string, entry: object|null,
 *   cost: string, held: Array}}
 */
export function saveReactionAvailable(target, { isArea = false, isSpell = true, save = "" } = {}) {
  const entries = saveReactionsOf(target);
  if (!entries.length) {
    return { eligible: false, reason: "no such feature", entry: null, cost: "", held: [] };
  }

  const featNames = Array.from(target?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);

  const decision = saveAdvantageDecision({
    entries,
    save,
    isArea,
    isSpell,
    reactions: Number(target?.system?.resources?.reactions?.value ?? 0),
    featNames
  });

  if (!decision.chosen) {
    // THE REASON IS THE FIRST ONE HELD, not a generic refusal: "area
    // effect" and "no reaction left" are different problems and the old
    // shape reported whichever the caller guessed. Kept as bare strings
    // because verify-chapter2-fixes reads them.
    const held = decision.held[0]?.reason ?? "no such feature";
    const reason = /area/.test(held) ? "area effect"
      : /reaction/.test(held) ? "no reaction left"
      : held;
    return { eligible: false, reason, entry: null, cost: "", held: decision.held };
  }
  return { eligible: true, reason: "", entry: decision.chosen, cost: decision.cost, held: decision.held };
}

/**
 * How the prompt names what is forcing this save.
 *
 * "AGAINST" NEEDS SOMETHING TO BE AGAINST. A spell has a name and reads
 * naturally — "a reflex save against Surge Of The Tempest". A fall does
 * not: the only label those rolls carry is written from the roller's own
 * side, and "a fortitude save against Falling — Injury Save" is what that
 * produced live on 21 Aug 2026. Named in parentheses instead when nobody
 * has told us what the source is.
 *
 * @returns {string} plain sentence, ready for the prompt
 */
export function describeTrigger(name, saveName, spellName, sourceLabel) {
  const who = `<strong>${name}</strong>`;
  const roll = `a ${saveName} save`;
  if (spellName) return `${who} must attempt ${roll} against <strong>${spellName}</strong>.`;
  if (sourceLabel) return `${who} must attempt ${roll} — <strong>${sourceLabel}</strong>.`;
  return `${who} must attempt ${roll}.`;
}

/**
 * Offer the answer, and spend the reaction if one is owed.
 *
 * Returns whether the save should be rolled with Advantage. Asks nothing and
 * spends nothing when the character has no answer, so the ordinary case
 * costs one array scan and no interruption.
 *
 * A FREE ANSWER IS NOT ASKED ABOUT. Graham's ruling, 21 August 2026: once
 * the Superior upgrade makes it "a Free (0 AP) action and not a Reaction"
 * there is no resource to weigh and no decision left, so it simply applies
 * and the card names the feat that granted it. A prompt with one sensible
 * answer is a prompt worth removing — and it would otherwise fire on every
 * Reflex save for the rest of that character's career.
 *
 * @param {Actor} target
 * @param {object} options
 * @param {string} options.spellName  what forces the save, for the prompt —
 *   blank when the caller does not know, in which case `sourceLabel` names
 *   the roll instead
 * @param {boolean} options.isArea
 * @param {string} options.saveName   how to name the save in the prompt
 * @param {string} options.save       the save key, for scoping
 * @returns {Promise<{advantage: boolean, label: string, cost: string}>}
 */
export async function offerSaveReaction(
  target,
  { spellName = "", sourceLabel = "", isArea = false, saveName = "save", save = "" } = {}
) {
  // A SPELL IS WHAT SET `saveSource`. cast-workflow is the only writer of
  // it (`saveSource: spell.name`), so a non-empty name here is exactly
  // "a spell forced this save" — which is the trigger Gnome Resistance
  // prints and every other save path does not satisfy.
  const isSpell = Boolean(String(spellName ?? "").trim());
  const { eligible, entry, cost } = saveReactionAvailable(target, { isArea, isSpell, save });
  if (!eligible) return { advantage: false, label: "", cost: "" };

  if (cost === "free") {
    return { advantage: true, label: entry.label, cost: "free" };
  }

  const { DialogV2 } = foundry.applications.api;
  const taken = await DialogV2.confirm({
    window: { title: `${entry.label} — ${target.name}`, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p>${describeTrigger(target.name, saveName, spellName, sourceLabel)}</p>
      <p>Spend a reaction on <strong>${entry.label}</strong> for <strong>Advantage</strong> on that save?</p>
      <p class="hint">Reactions remaining: ${Number(target?.system?.resources?.reactions?.value ?? 0)}.</p>
    </div>`,
    yes: { icon: "fa-solid fa-shield-halved", label: `Spend — ${entry.label}` },
    no: { icon: "fa-solid fa-xmark", label: "Save normally", default: true },
    rejectClose: false
  });
  if (!taken) return { advantage: false, label: "", cost: "" };

  // Spent only once the answer is yes. The old implementation spent first
  // and delivered nothing, which is the specific failure this replaces.
  const reactions = Number(target?.system?.resources?.reactions?.value ?? 0);
  await target.update({ "system.resources.reactions.value": Math.max(0, reactions - 1) });
  return { advantage: true, label: entry.label, cost: "reaction" };
}
