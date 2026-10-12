/**
 * The Foundry side of Learn a Spell (see learn-spell.mjs for the rule and
 * its provenance) — a General Skill Action, invoked from the tradition
 * skill (Arcana/Religion/Occultism/Nature) exactly like Create and Earn
 * Income, and wired through the same resolveAction pipeline
 * (combat/action-workflow.mjs): this module only supplies the pre-roll
 * setup dialog and the post-roll application of the rolled degree.
 *
 * Gated to book-style casters only (today, the Wizard) — a list-style
 * learned caster already has "blanket access to the whole tradition"
 * (spellbook.mjs's own docstring) with nothing to individually learn, and
 * an instinctive caster grows their repertoire through its own printed
 * schedule, not this action. The Wizard's own class text cross-references
 * this exact action: "you may add additional spells to your spell book by
 * following the rules for learning spells."
 */

import { rarityDCIncrease } from "../traits.mjs";
import { classItemOf } from "../class-progression.mjs";
import { deductCurrency, packItemData } from "../items.mjs";
import { pickFromPack } from "../picker-workflow.mjs";
import {
  LEARN_SPELL_SOURCES,
  learnSpellCost,
  learnSpellHours,
  learnSpellOutcome,
  learnSpellSourceModifier
} from "./learn-spell.mjs";
import { alreadyKnownSpell } from "./repertoire.mjs";
import { ownedEntryIds, spellBookContext } from "./spellbook-workflow.mjs";
import { spellBookPickEligible } from "./spellbook.mjs";
import { contentPack } from "../content-packs.mjs";

const { DialogV2 } = foundry.applications.api;
import { castingDerives } from "../creature-ability-rules.mjs";
const SYSTEM_ID = "trg-prime";

/** Is this pack spell within the character's castable maximum right now?
 * No firstPick PP-2 restriction here — unlike the free ladder's opening
 * batch, Learn a Spell can target any spell the character could actually
 * cast, per "Have the minimum casting level required for the casting of
 * the spell." */
/**
 * Exported so the harness can RUN it. Already-held book spells are
 * excluded (3.328.0): Learn a Spell adds to the SAME book the free
 * ladder fills, and the picker used to offer a spell already in it —
 * which meant paying the gold and the hours, rolling the check, and
 * receiving a second identical entry.
 */
export function eligibilityFor(actor) {
  const tradition = String(actor.system?.magic?.tradition ?? "");
  // ARCADIAN CASTER / TRUE CASTER (Creature Codex; 3.631.0): the creature
  // may learn from more traditions than its own — "any" (True Caster), or
  // arcane and ethereal (Arcadian) — and casts them as its own. The
  // eligibility test is widened; the spell's tradition is left as printed.
  const learnTraditions = castingDerives(Array.from(actor.items ?? [])).traditions;
  const casterLevel = Number(actor.system?.magic?.casterLevelValue ?? 0);
  const owned = ownedEntryIds(actor);
  return (entry) =>
    !alreadyKnownSpell(owned, entry) &&
    spellBookPickEligible(
      {
        tradition: entry.system?.tradition,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      { tradition: learnTraditions === "any" || (Array.isArray(learnTraditions) && learnTraditions.includes(String(entry.system?.tradition ?? "").split(",")[0].trim().toLowerCase())) ? "" : tradition, firstPick: false, casterLevel }
    );
}

/** Only a book-style caster keeps a Spell Library to add to — null for
 * anyone else, same gate the Spell Book card itself already uses. */
export function learnSpellEligible(actor) {
  return Boolean(spellBookContext(actor));
}

async function promptSource() {
  const options = Object.values(LEARN_SPELL_SOURCES)
    .map((source) => `<option value="${source.key}">${source.label}</option>`)
    .join("");
  const result = await DialogV2.wait({
    window: { title: "Learn a Spell — source", icon: "fa-solid fa-feather" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">
      <label>Where are you learning it from?</label>
      <select name="sourceKey">${options}</select>
      <p class="hint" style="margin:4px 0 0">A spellbook grants a +2 item bonus, but the worst you can roll is a Failure. A scroll's materials survive a Critical untouched. Either way, materials are only spent on a Success, a halved amount on a Critical, and the full amount on a Fumble.</p>
    </div></div>`,
    buttons: [
      {
        action: "ok",
        label: "Continue",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel" || !result.sourceKey) return null;
  return result.sourceKey;
}

/**
 * Pre-roll setup: pick a castable spell from the pack, then where it's
 * being learned from. Returns everything the pre-roll DC/modifier
 * override and the post-roll application both need, or null if either
 * step was cancelled.
 *
 * @param {Actor} actor
 * @returns {Promise<{spellId: string, spellName: string, ppCost: number,
 *   sourceKey: string, cost: {gp: number, dc: number},
 *   hours: number}|null>}
 */
export async function promptLearnSpellSetup(actor) {
  const tradition = String(actor.system?.magic?.tradition ?? "");
  const casterLevel = Number(actor.system?.magic?.casterLevelValue ?? 0);
  const picked = await pickFromPack("spells", {
    title: `Learn a Spell — any ${tradition || "tradition"} spell of PP ${casterLevel + 1} or less (your castable maximum)`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: eligibilityFor(actor),
    emptyMessage: "No spells in the pack are within your castable maximum — spells already in your book are not listed."
  });
  if (!picked) return null;

  const pack = contentPack("spells");
  const document = await pack?.getDocument(picked.itemId);
  if (!document) return null;

  const sourceKey = await promptSource();
  if (!sourceKey) return null;

  const ppCost = Number(document.system?.ppCost ?? 0);
  // A RARE OR UNCOMMON SPELL IS HARDER TO LEARN (3.622.0; block 39's A19,
  // Graham's R10): "All checks in relation to the entity with this trait
  // have their DC increased by +5" (Rare), +2 (Uncommon).
  const rarityRaise = rarityDCIncrease(document.system ?? {});
  const cost = learnSpellCost(ppCost);
  return {
    spellId: picked.itemId,
    spellName: document.name,
    ppCost,
    sourceKey,
    rarityRaise,
    cost: { ...cost, dc: cost.dc + rarityRaise },
    hours: learnSpellHours(ppCost)
  };
}

/** The situational check modifier the chosen source contributes (a
 * spellbook's +2 item bonus), or null for a source with none. */
export function learnSpellSetupModifier(setup) {
  return setup ? learnSpellSourceModifier(setup.sourceKey) : null;
}

/**
 * Post-roll: resolve the degree into the table's own outcome and, on a
 * Critical or Success, actually add the spell to the book — flagged
 * spellBookPick (so it reads, displays and memorises exactly like a
 * free-ladder pick) and learnedExtra (so it does NOT count against the
 * free ladder's own owed/remaining tally — see spellbook.mjs).
 *
 * @param {Actor} actor
 * @param {object} setup The object promptLearnSpellSetup returned.
 * @param {string} degreeKey The rolled check's degree.
 * @returns {Promise<{bucket: string, learned: boolean,
 *   materialsConsumed: string, canRetry: boolean, retryModifier: number,
 *   spellName: string, cost: {gp: number, dc: number}, created: Item|null}>}
 */
export async function applyLearnSpellOutcome(actor, setup, degreeKey) {
  const outcome = learnSpellOutcome(degreeKey, { sourceKey: setup.sourceKey });
  let created = null;

  // THE MATERIALS ARE PAID FOR HERE.
  //
  // `learnSpellCost` has always computed the gp, and the card has always
  // printed it — and nothing ever took it out of the purse. Reported by
  // Graham, 12 Aug 2026: "Learn a Spell does not deduct the gold."
  //
  // How much depends on the outcome, which `learnSpellOutcome` already
  // decided: "full" on a success, "half" on a critical (the spare
  // materials survive), and "none" on a partial or a failure — you keep
  // your reagents and may try again. So the fraction is read off the
  // outcome rather than re-derived, and a source that waives materials
  // (a scroll on a critical) pays nothing by the same route.
  //
  // A SHORT PURSE DOES NOT BLOCK THE LEARNING. The check has already
  // been rolled and the spell has already been learned by the time this
  // runs; refusing here would mean a player who mis-typed their gold
  // loses the roll as well. The shortfall is reported instead and the GM
  // settles it — the same way an over-spend on any other purchase is a
  // table matter, not a rules engine one.
  const fraction = { full: 1, half: 0.5, none: 0 }[outcome.materialsConsumed] ?? 0;
  const owedGP = Math.round((Number(setup.cost?.gp) || 0) * fraction * 100) / 100;
  let paid = { gp: 0, shortfallGP: 0 };
  if (owedGP > 0) {
    const deduction = deductCurrency(actor.system?.currency, owedGP);
    if (deduction.success) {
      await actor.update({ "system.currency": deduction.purse });
      paid = { gp: owedGP, shortfallGP: 0 };
    } else {
      paid = { gp: owedGP, shortfallGP: deduction.shortfallGP };
      ui.notifications?.warn(
        `Learn a Spell: ${setup.spellName} costs ${owedGP} gp in materials — ` +
        `short by ${deduction.shortfallGP} gp. Nothing was deducted.`
      );
    }
  }

  if (outcome.learned) {
    const classItem = classItemOf(actor);
    const pack = contentPack("spells");
    const document = await pack?.getDocument(setup.spellId);
    if (document) {
      const data = packItemData(document);
      data.flags = {
        ...data.flags,
        [SYSTEM_ID]: {
          ...data.flags?.[SYSTEM_ID],
          spellBookPick: true,
          // Bought, not granted free at level-up — kept out of the
          // ladder's own owed/remaining tally. See spellbook.mjs.
          learnedExtra: true,
          grantedBy: {
            sourceId: classItem?.id ?? null,
            sourceName: "Learn a Spell",
            requested: document.name
          }
        }
      };
      const [item] = await actor.createEmbeddedDocuments("Item", [data]);
      created = item ?? null;
    }
  }

  return { ...outcome, spellName: setup.spellName, cost: setup.cost, created, paid };
}
