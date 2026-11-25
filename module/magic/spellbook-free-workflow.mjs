/**
 * Free Spell — the Spellbook's second way in (3.714.0).
 *
 * Graham, 25 November 2026: "I would like an additional button [on] the
 * spellbook that allows a PC (with GM approval) to add a spell for free.
 * These free spells would be tallied separately to the slots filled box."
 *
 *   1. The owner picks a spell. The browser offers what the book could
 *      take in a later slot: the owner's tradition rule (all traditions
 *      for an Archmage), PP no higher than they can cast, not a specialist
 *      spell, and nothing already on the sheet. That is the same filter
 *      Add to Book uses once the opening batch is filled
 *      (`eligibilityFor(actor, { firstPick: false })`).
 *   2. The GM is asked. A player's press goes to the acting GM through
 *      the core's GM-authorisation socket and waits for the yes (no GM
 *      connected, or no answer in two minutes: refused, and it says so).
 *      A GM's own press is confirmed on the GM's own screen, as an
 *      off-turn strike's is.
 *   3. On a yes, the spell is added with `spellBookPick` (so it lists and
 *      memorises like any book spell) and `freeBookSpell` (so it stays
 *      off the ladder and is counted under "Free spells" instead; see
 *      spellbook.mjs). No slot, no time, no gold, no check.
 *
 * Its provenance is the class item, as Add to Book's is, so removing the
 * class takes the book's free spells with it through the ordinary
 * grant-cleanup chain.
 */

import { classItemOf } from "../class-progression.mjs";
import { contentPack } from "../content-packs.mjs";
import { packItemData } from "../items.mjs";
import { pickFromPack } from "../picker-workflow.mjs";
import { requestGMAuthorisation } from "../combat/gm-authorisation.mjs";
import { eligibilityFor, spellBookContext } from "./spellbook-workflow.mjs";

const SYSTEM_ID = "trg-prime";
export const FREE_SPELL_SOURCE_NAME = "Free spell (GM approved)";

function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
}

/** The flags a free book spell carries. Pure, so the harness can read it. */
export function freeSpellFlags(existing = {}, { classItem = null, spellName = "", approvedBy = "" } = {}) {
  return {
    ...existing,
    spellBookPick: true,
    freeBookSpell: true,
    freeApprovedBy: approvedBy,
    grantedBy: {
      sourceId: classItem?.id ?? null,
      sourceName: FREE_SPELL_SOURCE_NAME,
      requested: spellName
    }
  };
}

/** The question the GM sees. Plain text; gm-authorisation escapes it. */
export function freeSpellQuestion(spell) {
  const pp = Number(spell?.system?.ppCost ?? 0);
  const tradition = String(spell?.system?.tradition ?? "").trim();
  return `asks to add ${spell?.name ?? "a spell"} (PP ${pp}${tradition ? `, ${tradition}` : ""}) to their Spellbook `
    + "for free. It takes no slot, time, gold or check, and is counted under Free spells.";
}

/**
 * The Free Spell button. Returns the created spell, or null when nothing
 * was added (no book, cancelled, refused, or no GM to ask).
 */
export async function openFreeSpellPick(actor) {
  const classItem = classItemOf(actor);
  const context = spellBookContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Spell book: this character's class doesn't keep one.");
    return null;
  }
  const cap = Number(actor.system?.magic?.casterLevelValue ?? 0) + 1;
  const picked = await pickFromPack("spells", {
    title: `Free spell for ${actor.name}'s Spellbook (needs the GM's approval): PP ${cap} or less, not already known`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: eligibilityFor(actor, { firstPick: false }),
    emptyMessage: "No spells in the pack can go in this book: spells already on the sheet are not listed."
  });
  if (!picked) return null;

  const document = await contentPack("spells")?.getDocument(picked.itemId);
  if (!document) return null;

  const approved = await requestGMAuthorisation(actor, `a free ${document.name}`, {
    title: "Free Spell — GM Approval",
    question: freeSpellQuestion(document),
    label: `free spell (${document.name})`
  });
  if (!approved) return null;

  const data = packItemData(document);
  data.flags = {
    ...data.flags,
    [SYSTEM_ID]: freeSpellFlags(data.flags?.[SYSTEM_ID], {
      classItem,
      spellName: document.name,
      approvedBy: game.user?.isGM ? game.user.name : "the GM"
    })
  };
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  if (!created) return null;

  const after = spellBookContext(actor);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">Spell Book — Free Spell</h3>`
      + `<p style="margin:2px 0"><strong>${esc(created.name)}</strong> added to the Spellbook for free, with the GM's approval.</p>`
      + `<p style="margin:2px 0"><em>Free spells: ${after?.free ?? 0}. Slots filled is unchanged (${after?.owned ?? 0} / ${after?.allowed ?? 0}).</em></p>`
      + `<p style="margin:2px 0"><em>Being in the book isn't the same as knowing it today — memorise it at daily preparation before you can cast it.</em></p></div>`
  });
  return created;
}
