/**
 * The Foundry side of feat-granted spell slots (see feat-casting.mjs for
 * the rules and what driving them found).
 *
 * ONE CARD, TWO HALVES. The caster archetypes already had a card for
 * their cantrips; the Knight feats and the caster-tier feats add
 * LEVELLED slots to the same Magic tab, grouped by tradition. Graham's
 * ruling, 20 August 2026: *"extend the archetype card to hold them"* —
 * one mechanism for every feat-granted spell, whether or not the
 * character has a class.
 *
 * A SLOT IS FILLED, NOT COUNTED. Each slot remembers which feat granted
 * it and what that feat's PP ceiling is, and a spell put in one records
 * the slot's id. That is what lets a Knight's single PP 2 slot and a
 * Minor Caster's caster-level-capped slots sit side by side in one
 * tradition without either ceiling leaking onto the other.
 */

import { pickFromPack } from "../picker-workflow.mjs";
import { packItemData } from "../items.mjs";
import { classTradition } from "./caster-tier-feats.mjs";
import {
  attachSlotNotices,
  featSlotEligible,
  featSlotSpellData,
  featSlotMark,
  featSlotState,
  actorFeatSpellSlots,
  knightCastingSources,
  suppressedTierFeats
} from "./feat-casting.mjs";
import { contentPack } from "../content-packs.mjs";
import {
  archetypeBookMark,
  bookArchetype,
  bookSlotEligible,
  bookSpells,
  bookTraditionLabel,
  slotIsBookBound
} from "./arcanist-book.mjs";

const SYSTEM_ID = "trg-prime";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">${title}</h3>${lines.join("")}</div>`
  });
}

/** Every feat-granted levelled slot this actor has, with its contents. */
export function featSlotsFor(actor) {
  const items = Array.from(actor?.items ?? []);
  // DIFFERENT FROM THE CLASS'S TRADITION (Graham, 20 Aug 2026), read from
  // the class rather than the resolved sheet value — inside
  // `actorFeatSpellSlots`, which the cast gate shares (3.676.0).
  const slots = actorFeatSpellSlots(actor);
  return featSlotState(slots, items);
}

/**
 * The card's view: slots grouped by tradition, or an empty array.
 */
export function featSlotContext(actor) {
  const { slots, orphaned } = featSlotsFor(actor);
  // A CASTER FEAT THAT GRANTED NOTHING STILL GETS A LINE. The exclusion
  // is right, but a feat that silently does nothing is how this whole
  // family stayed broken through a release — so it is reported even when
  // there are no slots at all to report it beside.
  const suppressed = suppressedTierFeats(
    Array.from(actor?.items ?? []),
    Number(actor?.system?.identity?.level ?? 0),
    classTradition(actor?.system?.progression)
  );
  if (!slots.length && !orphaned.length && !suppressed.length) return [];
  const groups = new Map();
  const book = bookArchetype(Array.from(actor?.items ?? []));
  for (const slot of slots) {
    if (!groups.has(slot.tradition)) {
      groups.set(slot.tradition, { tradition: slot.tradition, label: slot.label, slots: [] });
    }
    groups.get(slot.tradition).slots.push({
      id: slot.id,
      grantedBy: slot.grantedBy,
      maxPP: slot.maxPP,
      filledName: slot.filled?.name ?? null,
      filledId: slot.filled?.id ?? null,
      // FILLED FROM THE SPELLBOOK (3.676.0) — Graham's ruling of 29
      // October: an Arcanist's slots, Arcane Knight's included, take a
      // spell already in the book rather than any arcane spell.
      fromBook: slotIsBookBound(slot, book)
    });
    groups.get(slot.tradition).fromBook ||= slotIsBookBound(slot, book);
  }
  const out = Array.from(groups.values()).map((g) => ({
    ...g,
    total: g.slots.length,
    filled: g.slots.filter((s) => s.filledName).length,
    empty: g.slots.filter((s) => !s.filledName).length
  }));
  // The two notices — orphaned spells and suppressed feats — attach
  // through one pure helper, which makes a group for them when there is
  // none. See `attachSlotNotices` for the live defect that shape fixes.
  return attachSlotNotices(
    out,
    orphaned.map((i) => ({ id: i.id, name: i.name, tradition: featSlotMark(i)?.tradition })),
    suppressed
  );
}

/*
 * `hasFeatCasting(actor)` stood here until 3.384.0 — *"does this actor
 * have any feat-granted casting at all?"*, answered as archetype OR
 * knight.
 *
 * IT WAS FIRST TRIAGED AS A DUPLICATION AND THAT WAS WRONG, which is
 * worth recording because the wrong reading is the tempting one.
 * `documents/actor.mjs:1347` computes `knightCastingSources(...).length
 * > 0` and it LOOKS like half of this function open-coded. It is not:
 * that call site names its parameter `hasKnightFeat` and feeds
 * `resolvedCasterLevel`, where a knight feat sets a caster-level floor.
 * Archetype casting does no such thing. Wiring this function in there —
 * the "fix" — would have handed every archetype caster a floor the book
 * gives only to knights, from a change whose whole justification was
 * that it removed a duplication.
 *
 * So the two are not one question asked twice. They are two questions,
 * and the broader one has no asker: every caller in the system wants
 * the archetype sources or the knight sources, separately and by name,
 * because it goes on to use what is IN them. Deleted rather than kept
 * against a future caller — the thing to write then is the question
 * that caller actually has.
 */

/* ------------------------------------------------------------------ */

async function createSlotSpell(actor, slot, itemId) {
  const pack = contentPack("spells");
  const document = await pack?.getDocument(itemId);
  if (!document) return null;
  const data = featSlotSpellData(packItemData(document), slot, document.name);
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

/**
 * Fill one empty slot from the pack.
 *
 * `slotId` comes off the button, because a character can hold several
 * slots with different ceilings and traditions at once and a handler
 * that guessed would put a PP 4 spell in a Knight's PP 2 slot.
 */
export async function openFeatSlotPick(actor, slotId) {
  const { slots } = featSlotsFor(actor);
  const slot = slots.find((s) => s.id === slotId);
  if (!slot) {
    ui.notifications.warn("That spell slot no longer exists — the feat granting it may have been removed.");
    return null;
  }
  if (slot.filled) {
    ui.notifications.info(`${slot.grantedBy}: that slot already holds ${slot.filled.name}. Clear it first.`);
    return null;
  }
  // FROM THE SPELLBOOK (3.676.0). "You can memorise and cast one
  // additional arcane spell FROM YOUR SPELLBOOK" — and, by Graham's
  // ruling R2, Arcane Knight's PP 2 slot the same way.
  const book = bookArchetype(Array.from(actor.items ?? []));
  if (slotIsBookBound(slot, book)) return memoriseFromBook(actor, slot, book, slots);
  const picked = await pickFromPack("spells", {
    title: `${slot.grantedBy} — ${slot.label} spell, PP ${slot.maxPP} or less`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: (entry) => featSlotEligible(
      {
        tradition: entry.system?.tradition,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      slot
    ),
    emptyMessage: `No ${slot.label.toLowerCase()} spells of PP ${slot.maxPP} or less in the pack.`
  });
  if (!picked) return null;
  const created = await createSlotSpell(actor, slot, picked.itemId);
  if (!created) return null;
  await postCard(actor, slot.grantedBy, [
    line(`<strong>${created.name}</strong> memorised in your ${slot.label.toLowerCase()} slot (PP ${slot.maxPP} or less).`),
    line(`<em>Spellcraft for it uses the ${slot.label.toLowerCase()} tradition's own ability.</em>`)
  ]);
  return created;
}

/**
 * Memorise a spell from the Arcanist's book into one slot.
 *
 * THE BOOK ENTRY IS MARKED, NOT COPIED — see arcanist-book.mjs. The
 * picker lists only what the book holds; an empty answer says which of
 * the three reasons it is, because "nothing to choose" reads as a broken
 * button unless it says why.
 */
async function memoriseFromBook(actor, slot, book, slots) {
  const items = Array.from(actor.items ?? []);
  const inBook = bookSpells(items, book.key);
  const live = new Map(slots.map((s) => [s.id, s.maxPP]));
  const options = inBook
    .filter((i) => bookSlotEligible(i, slot, live))
    .sort((a, b) => Number(a.system?.ppCost ?? 0) - Number(b.system?.ppCost ?? 0) || a.name.localeCompare(b.name))
    .map((i) => [i.id, `${i.name} (PP ${Number(i.system?.ppCost ?? 0)})`]);
  const label = bookTraditionLabel(book).toLowerCase();
  if (!options.length) {
    const why = !inBook.length
      ? `your spellbook holds no levelled ${label} spells yet`
      : `no spell in your spellbook fits — PP ${slot.maxPP} or less, and not already memorised in another slot`;
    ui.notifications.warn(`${slot.grantedBy}: ${why}. Add one with the ${book.label} card's free additions, or Learn a Spell (Arcana).`);
    return null;
  }
  const choice = await chooseBookSpell(`${slot.grantedBy} — ${slot.label} spell, PP ${slot.maxPP} or less`, options);
  if (!choice) return null;
  const item = actor.items.get(choice);
  if (!item) return null;
  await item.update({ [`flags.${SYSTEM_ID}.featSpellSlot`]: { slotId: slot.id, tradition: slot.tradition } });
  await postCard(actor, slot.grantedBy, [
    line(`<strong>${item.name}</strong> memorised from your spellbook in your ${slot.label.toLowerCase()} slot (PP ${slot.maxPP} or less).`),
    line(`<em>Spellcraft for it uses the ${slot.label.toLowerCase()} tradition's own ability.</em>`)
  ]);
  return item;
}

async function chooseBookSpell(title, options) {
  const { DialogV2 } = foundry.applications.api;
  const rows = options.map(([value, text]) => `<option value="${value}">${text}</option>`).join("");
  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-book" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">
      <label>From your spellbook</label>
      <select name="choice" style="width:100%">${rows}</select></div></div>`,
    buttons: [
      {
        action: "ok", label: "Memorise", icon: "fa-solid fa-wand-sparkles", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(button.form ?? button.closest("form")).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return String(result.choice ?? "") || null;
}

/** Empty one slot, so a different spell can be memorised in it. */
export async function clearFeatSlot(actor, slotId) {
  const { slots } = featSlotsFor(actor);
  const slot = slots.find((s) => s.id === slotId);
  if (!slot?.filled) {
    ui.notifications.info("That slot is already empty.");
    return 0;
  }
  const name = slot.filled.name;
  // A BOOK SPELL GOES BACK INTO THE BOOK (3.676.0). Deleting it — what a
  // slot's own copy has always had done to it — would tear the page out
  // of the spellbook the player paid to write it into.
  if (archetypeBookMark(slot.filled)) {
    await slot.filled.update({ [`flags.${SYSTEM_ID}.-=featSpellSlot`]: null });
    await postCard(actor, slot.grantedBy, [
      line(`<strong>Cleared:</strong> ${name} — still in your spellbook.`),
      line(`<em>Memorise another ${slot.label.toLowerCase()} spell of PP ${slot.maxPP} or less from the Magic tab.</em>`)
    ]);
    return 1;
  }
  await actor.deleteEmbeddedDocuments("Item", [slot.filled.id]);
  await postCard(actor, slot.grantedBy, [
    line(`<strong>Cleared:</strong> ${name}.`),
    line(`<em>Memorise another ${slot.label.toLowerCase()} spell of PP ${slot.maxPP} or less from the Magic tab.</em>`)
  ]);
  return 1;
}

