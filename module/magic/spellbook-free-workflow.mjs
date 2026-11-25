/**
 * Free Spell — the Spellbook's second way in (3.714.0).
 *
 * Graham, 25 November 2026: "I would like an additional button [on] the
 * spellbook that allows a PC (with GM approval) to add a spell for free.
 * These free spells would be tallied separately to the slots filled box."
 *
 *   1. The owner picks one spell or several (3.715.0), with School and PP
 *      menus. The browser offers the owner's tradition
 *      rule (all traditions for an Archmage), no specialist spell, and
 *      nothing already on the sheet — at ANY PP (3.714.1; Graham: "Keep
 *      tradition rules but allow higher PP spells"), since the GM approves
 *      each one. Add to Book's own filter with its PP cap lifted
 *      (`eligibilityFor(actor, { firstPick: false, anyPP: true })`).
 *   2. The GM is asked. A player's press goes to the acting GM through
 *      the core's GM-authorisation socket and waits for the yes (no GM
 *      connected, or no answer in two minutes: refused, and it says so).
 *      A GM's own press is confirmed on the GM's own screen, as an
 *      off-turn strike's is.
 *   3. On a yes (one answer for the whole selection), each spell is added with `spellBookPick` (so it lists and
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
import { PICKER_FACETS } from "../picker-filters.mjs";
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

/** One spell as the GM's question names it: "Fly (PP 6, arcane, verdant)". */
function spellLabel(spell) {
  const pp = Number(spell?.system?.ppCost ?? 0);
  const tradition = String(spell?.system?.tradition ?? "").trim();
  return `${spell?.name ?? "a spell"} (PP ${pp}${tradition ? `, ${tradition}` : ""})`;
}

/**
 * The question the GM sees. Plain text; gm-authorisation escapes it.
 * Takes one spell or a list (3.715.0, several at once): the GM answers for
 * the whole selection in one go — yes adds them all, no adds none.
 */
export function freeSpellQuestion(spells) {
  const list = (Array.isArray(spells) ? spells : [spells]).filter(Boolean);
  const named = list.map(spellLabel).join(", ");
  const several = list.length > 1;
  return `asks to add ${several ? `${list.length} spells — ${named} —` : named} to their Spellbook `
    + `for free. ${several ? "They take" : "It takes"} no slot, time, gold or check, and ${several ? "are" : "is"} counted under Free spells.`;
}

/**
 * The Free Spell button. Returns the created spells, or null when nothing
 * was added (no book, cancelled, refused, or no GM to ask).
 */
export async function openFreeSpellPick(actor) {
  const classItem = classItemOf(actor);
  const context = spellBookContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Spell book: this character's class doesn't keep one.");
    return null;
  }
  // SEVERAL AT ONCE, WITH SCHOOL AND PP MENUS (3.715.0; Graham, 25 November
  // 2026). No cap on how many: each selection goes to the GM as one ask.
  const picked = await pickFromPack("spells", {
    title: `Free spells for ${actor.name}'s Spellbook (needs the GM's approval): any PP, not already known`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: eligibilityFor(actor, { firstPick: false, anyPP: true }),
    facets: PICKER_FACETS.spellbook,
    multiple: true,
    emptyMessage: "No spells in the pack can go in this book: spells already on the sheet are not listed."
  });
  if (!picked?.picks?.length) return null;

  const pack = contentPack("spells");
  const documents = [];
  for (const { itemId } of picked.picks) {
    const document = await pack?.getDocument(itemId);
    if (document) documents.push(document);
  }
  if (!documents.length) return null;
  const names = documents.map((d) => d.name);

  const approved = await requestGMAuthorisation(actor, `free ${names.join(", ")}`, {
    title: "Free Spell — GM Approval",
    question: freeSpellQuestion(documents),
    label: documents.length > 1 ? `free spells (${names.join(", ")})` : `free spell (${names[0]})`
  });
  if (!approved) return null;

  const approvedBy = game.user?.isGM ? game.user.name : "the GM";
  const datas = documents.map((document) => {
    const data = packItemData(document);
    data.flags = {
      ...data.flags,
      [SYSTEM_ID]: freeSpellFlags(data.flags?.[SYSTEM_ID], { classItem, spellName: document.name, approvedBy })
    };
    return data;
  });
  const created = await actor.createEmbeddedDocuments("Item", datas);
  if (!created?.length) return null;

  const after = spellBookContext(actor);
  const list = created.map((item) => `<strong>${esc(item.name)}</strong>`).join(", ");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">Spell Book — Free Spell${created.length > 1 ? "s" : ""}</h3>`
      + `<p style="margin:2px 0">${list} added to the Spellbook for free, with the GM's approval.</p>`
      + `<p style="margin:2px 0"><em>Free spells: ${after?.free ?? 0}. Slots filled is unchanged (${after?.owned ?? 0} / ${after?.allowed ?? 0}).</em></p>`
      + `<p style="margin:2px 0"><em>Being in the book isn't the same as knowing it today — memorise it at daily preparation before you can cast it.</em></p></div>`
  });
  return created;
}
