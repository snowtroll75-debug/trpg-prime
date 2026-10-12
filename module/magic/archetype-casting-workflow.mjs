/**
 * The Foundry side of the four caster archetypes (see
 * archetype-casting.mjs for the rules and why they needed a module).
 *
 * Three actions, all on the Magic tab, one card per source:
 *
 *   Pick permanent — the Arcanist's spellbook of four, and the Gleeman's
 *                    two known cantrips. Permanent, removed with the feat.
 *   Prepare        — the Animist's and Priest's two for today, chosen from
 *                    the whole tradition list; and the Arcanist's two,
 *                    chosen from their own book.
 *   Clear prepared — put today's picks back so a different two can be
 *                    prepared. Offered because the whole point of the
 *                    Animist's and Priest's sentence is that the choice
 *                    changes each morning.
 *
 * PROVENANCE POINTS AT THE FEAT, not at a class item, so deleting the
 * feat takes its cantrips with it through the ordinary grant-cleanup
 * chain — no new mechanism, and nothing left casting arcane cantrips
 * after the Arcanist has gone.
 *
 * `system.prepared` MEANS "PREPARED TODAY", and since 3.348.0 it means
 * only that. It is set on everything created here EXCEPT an Arcanist's
 * book entries, which arrive unprepared because the feat grants four and
 * allows two a day. Nothing else reads the field: castability is decided
 * from the spell's provenance in `spell-availability.mjs`.
 */

import { pickFromPack } from "../picker-workflow.mjs";
import { packItemData } from "../items.mjs";
import {
  ARCHETYPE_CANTRIP_FLAG,
  archetypeCantripEligible,
  archetypeCantripState,
  archetypeCantrips,
  archetypeCasterLevelNote,
  archetypeCastingByName,
  archetypeCastingSources,
  archetypeTraditionLabel
} from "./archetype-casting.mjs";
import { KNIGHT_CASTING } from "./feat-casting.mjs";
import { alreadyKnownSpell, knownSpellKeys } from "./repertoire.mjs";
import { contentPack } from "../content-packs.mjs";

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

/** The feat item backing one source, or null if it has gone. */
function featFor(actor, sourceKey) {
  return Array.from(actor?.items ?? []).find(
    (i) => i.type === "feat" && String(i.name ?? "").trim().toLowerCase() === sourceKey
  ) ?? null;
}

/* ------------------------------------------------------------------ */
/* What the sheet shows                                                */
/* ------------------------------------------------------------------ */

/**
 * One card per source the character holds, or an empty array.
 *
 * SEPARATE CARDS, NOT A COMBINED POOL (Graham's ruling, 20 August 2026).
 * A Cleric who takes Arcanist keeps their divinity memorisation card and
 * gains an arcane one beside it. Nothing is added together, so nothing
 * can double-count, and it stays obvious which cantrip came from where.
 */
export function archetypeCastingContext(actor) {
  const sources = archetypeCastingSources(Array.from(actor?.items ?? []));
  if (!sources.length) return [];
  const items = Array.from(actor?.items ?? []);
  return sources.map((source) => {
    const held = archetypeCantrips(items, source.key);
    const state = archetypeCantripState(source, held);
    return {
      key: source.key,
      label: source.label,
      tradition: source.tradition,
      traditionLabel: archetypeTraditionLabel(source),
      style: source.style,
      printed: source.printed,
      ...state,
      // WHY THE CASTER LEVEL READS ZERO (3.385.0). Empty for a holder
      // who has earned one some other way, so the panel says nothing
      // when there is nothing to say.
      casterLevelNote: archetypeCasterLevelNote(source, {
        casterLevelSource: actor?.system?.magic?.casterLevelSource,
        knightTable: KNIGHT_CASTING
      }),
      permanent: held.permanent.map((i) => ({ id: i.id, name: i.name })),
      daily: held.daily.map((i) => ({ id: i.id, name: i.name })),
      // The Arcanist cannot prepare from an empty book, and saying so on
      // the card beats a picker that opens onto nothing.
      blockedOnBook: state.preparesFromBook && !state.permanentPicked
    };
  });
}

/* ------------------------------------------------------------------ */
/* Creating one                                                        */
/* ------------------------------------------------------------------ */

async function createArchetypeCantrip(actor, feat, sourceKey, kind, itemId) {
  const pack = contentPack("spells");
  const document = await pack?.getDocument(itemId);
  if (!document) return null;
  const data = packItemData(document);
  // A BOOK ENTRY ARRIVES UNPREPARED — that is the Arcanist's whole
  // second sentence, and `prepared` is the field that carries it. The
  // Animist's and the Priest's are created only at the moment they are
  // prepared, and the Gleeman's are cast at will, so both arrive true.
  data.system = { ...data.system, prepared: kind !== "book" };
  data.flags = {
    ...data.flags,
    [SYSTEM_ID]: {
      ...data.flags?.[SYSTEM_ID],
      [ARCHETYPE_CANTRIP_FLAG]: { source: sourceKey, kind },
      // NOT `cantripPick` and NOT `repertoirePick`. Those two flags are
      // counted by the CLASS's own allowances, so borrowing either would
      // make a caster archetype's cantrip eat a Bard's known slot or a repertoire
      // slot — picks the class would never get back.
      grantedBy: {
        sourceId: feat.id,
        sourceName: feat.name,
        requested: document.name
      }
    }
  };
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

/**
 * Prepare one of the Arcanist's book cantrips for today.
 *
 * A FLAG FLIPPED, NOT A SECOND ITEM. The first build copied the book
 * entry so the book would still read four — and would have put Light on
 * the sheet twice, which is exactly the complaint Graham raised about
 * racial abilities the same morning. `system.prepared` is what the field
 * means, the book stays four items whatever is prepared, and a learned
 * caster's own cast gate then enforces it for free.
 */
async function prepareFromBook(actor, bookItem) {
  await bookItem.update({ "system.prepared": true });
  return bookItem;
}

/* ------------------------------------------------------------------ */
/* Pick a permanent cantrip — Arcanist's book, Gleeman's two            */
/* ------------------------------------------------------------------ */

export async function openArchetypePermanentPick(actor, sourceKey) {
  const source = archetypeCastingByName(sourceKey);
  const feat = source ? featFor(actor, source.key) : null;
  if (!source || !feat) {
    ui.notifications.warn("This character does not have that archetype.");
    return null;
  }
  const state = archetypeCantripState(source, archetypeCantrips(Array.from(actor.items), source.key));
  if (!state.permanentAllowed) {
    ui.notifications.info(`${source.label}: this archetype has no permanent cantrips — its two are prepared each day.`);
    return null;
  }
  if (!state.permanentRemaining) {
    ui.notifications.info(`${source.label}: all ${state.permanentAllowed} are already chosen.`);
    return null;
  }
  const traditionLabel = archetypeTraditionLabel(source);
  // Cantrips the character already holds — from any source — are not
  // offered again. Spending one of two Gleeman picks on a second copy of
  // Mage Hand is not a choice anyone means to make, and the same lesson
  // was learned on the Bard's pool at 3.328.0.
  const known = knownSpellKeys(actor.items ?? []);
  const picked = await pickFromPack("spells", {
    title: `${source.label} — ${source.style === "book" ? "spellbook" : "known"} cantrip ` +
      `${state.permanentPicked + 1} of ${state.permanentAllowed} (${traditionLabel}, PP 0)`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: (entry) => !alreadyKnownSpell(known, entry) && archetypeCantripEligible(
      {
        tradition: entry.system?.tradition,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      source
    ),
    emptyMessage: `No ${traditionLabel.toLowerCase()} cantrips left in the pack — ones you already have are not listed.`
  });
  if (!picked) return null;
  const kind = source.style === "book" ? "book" : "known";
  const created = await createArchetypeCantrip(actor, feat, source.key, kind, picked.itemId);
  if (!created) return null;
  const after = archetypeCantripState(source, archetypeCantrips(Array.from(actor.items), source.key));
  await postCard(actor, source.label, [
    line(`<strong>${created.name}</strong> — ${traditionLabel.toLowerCase()} cantrip, PP 0.`),
    line(after.permanentRemaining
      ? `<em>${after.permanentRemaining} more to choose.</em>`
      : (source.style === "book"
        ? `<em>Spellbook complete (${after.permanentAllowed}). Prepare ${after.dailyAllowed} of them each day.</em>`
        : `<em>Both known. They may be cast at any time and need no preparation.</em>`))
  ]);
  return created;
}

/* ------------------------------------------------------------------ */
/* Prepare today's cantrips                                            */
/* ------------------------------------------------------------------ */

export async function openArchetypePrepare(actor, sourceKey) {
  const source = archetypeCastingByName(sourceKey);
  const feat = source ? featFor(actor, source.key) : null;
  if (!source || !feat) {
    ui.notifications.warn("This character does not have that archetype.");
    return null;
  }
  const held = archetypeCantrips(Array.from(actor.items), source.key);
  const state = archetypeCantripState(source, held);
  if (!state.prepares) {
    ui.notifications.info(`${source.label}: these cantrips are cast at will — there is nothing to prepare.`);
    return null;
  }
  if (!state.dailyRemaining) {
    ui.notifications.info(
      `${source.label}: both of today's cantrips are prepared. Clear them to choose differently.`
    );
    return null;
  }
  const traditionLabel = archetypeTraditionLabel(source);

  // THE ARCANIST PREPARES FROM THEIR OWN BOOK — "two of THESE cantrips".
  if (state.preparesFromBook) {
    if (!held.permanent.length) {
      ui.notifications.warn(`${source.label}: fill the spellbook first — there is nothing to prepare from.`);
      return null;
    }
    // Only the ones NOT already prepared, matched by identity rather than
    // by name: two pack spells can share a name at different costs, and
    // the book is the player's own list either way.
    const alreadyPrepared = new Set(held.daily.map((i) => i.id));
    const options = held.permanent
      .filter((i) => !alreadyPrepared.has(i.id))
      .map((i) => [i.id, i.name]);
    if (!options.length) {
      ui.notifications.info(`${source.label}: every cantrip in the book is already prepared.`);
      return null;
    }
    const choice = await chooseFromList(
      `${source.label} — prepare ${state.dailyPicked + 1} of ${state.dailyAllowed}`,
      "From your spellbook",
      options
    );
    if (!choice) return null;
    const bookItem = held.permanent.find((i) => i.id === choice);
    if (!bookItem) return null;
    const created = await prepareFromBook(actor, bookItem);
    if (!created) return null;
    const after = archetypeCantripState(source, archetypeCantrips(Array.from(actor.items), source.key));
    await postCard(actor, source.label, [
      line(`<strong>${created.name}</strong> prepared for today.`),
      line(after.dailyRemaining
        ? `<em>${after.dailyRemaining} more may be prepared from the spellbook.</em>`
        : `<em>Both of today's cantrips are prepared.</em>`)
    ]);
    return created;
  }

  // THE ANIMIST AND THE PRIEST PREPARE FROM THE WHOLE LIST — "any two
  // cantrips from the verdant spell list", chosen fresh each morning.
  const takenNames = new Set(held.daily.map((i) => String(i.name).trim().toLowerCase()));
  const picked = await pickFromPack("spells", {
    title: `${source.label} — prepare ${state.dailyPicked + 1} of ${state.dailyAllowed} (${traditionLabel}, PP 0)`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: (entry) => !takenNames.has(String(entry.name).trim().toLowerCase()) &&
      archetypeCantripEligible(
        {
          tradition: entry.system?.tradition,
          ppCost: entry.system?.ppCost,
          specialist: entry.system?.specialist
        },
        source
      ),
    emptyMessage: `No ${traditionLabel.toLowerCase()} cantrips in the pack.`
  });
  if (!picked) return null;
  const created = await createArchetypeCantrip(actor, feat, source.key, "daily", picked.itemId);
  if (!created) return null;
  const after = archetypeCantripState(source, archetypeCantrips(Array.from(actor.items), source.key));
  await postCard(actor, source.label, [
    line(`<strong>${created.name}</strong> prepared for today (${traditionLabel.toLowerCase()} cantrip, PP 0).`),
    line(after.dailyRemaining
      ? `<em>${after.dailyRemaining} more may be prepared.</em>`
      : `<em>Both of today's cantrips are prepared — clear them at your next daily preparation to choose differently.</em>`)
  ]);
  return created;
}

/* ------------------------------------------------------------------ */
/* Clear today's picks                                                 */
/* ------------------------------------------------------------------ */

/**
 * Put today's prepared cantrips back.
 *
 * TWO DIFFERENT UNDOS, because the two mechanics store today's picks
 * differently. The Arcanist's are book entries with `prepared` set, so
 * clearing un-prepares them and the spellbook stays four — DELETING them
 * would burn the permanent picks the feat grants once. The Animist's and
 * the Priest's exist only because they were prepared, so clearing
 * removes them.
 *
 * The Gleeman is untouched either way: they never prepare.
 */
export async function clearArchetypePrepared(actor, sourceKey, { report = true } = {}) {
  const source = archetypeCastingByName(sourceKey);
  if (!source) return 0;
  const held = archetypeCantrips(Array.from(actor?.items ?? []), source.key);
  if (!held.daily.length) {
    if (report) ui.notifications.info(`${source.label}: nothing is prepared.`);
    return 0;
  }
  const names = held.daily.map((i) => i.name);
  if (source.style === "book") {
    await actor.updateEmbeddedDocuments(
      "Item",
      held.daily.map((i) => ({ _id: i.id, "system.prepared": false }))
    );
  } else {
    await actor.deleteEmbeddedDocuments("Item", held.daily.map((i) => i.id));
  }
  if (report) {
    await postCard(actor, source.label, [
      line(`<strong>Cleared:</strong> ${names.join(", ")}.`),
      line(`<em>Prepare ${source.dailyCantrips} again from the Magic tab.</em>`)
    ]);
  }
  return names.length;
}

/* ------------------------------------------------------------------ */
/* Daily preparation                                                   */
/* ------------------------------------------------------------------ */

/**
 * What daily preparation should say about the archetypes, if anything.
 *
 * IT DOES NOT CLEAR THEM. `sweepDailyMemorisation` was removed from the
 * class memorisation at Graham's request precisely because wiping a
 * player's picks and making them re-enter the same two every session is
 * a chore, not a rule. The same reasoning applies here, so preparation
 * REPORTS what is prepared and offers the change; it does not impose it.
 *
 * Pure, so the harness can drive the wording without an actor.
 *
 * @param {Array<object>} contexts from `archetypeCastingContext`
 * @returns {string[]} lines, empty when there is nothing to say
 */
export function archetypeDailyPreparationLines(contexts) {
  const lines = [];
  for (const c of contexts ?? []) {
    if (!c?.prepares) continue;
    if (c.blockedOnBook) {
      lines.push(
        `<strong>${c.label}:</strong> the spellbook is empty — choose ${c.permanentAllowed} ${String(c.traditionLabel).toLowerCase()} cantrips before you can prepare any.`
      );
      continue;
    }
    if (c.dailyRemaining) {
      lines.push(
        `<strong>${c.label}:</strong> ${c.dailyPicked} of ${c.dailyAllowed} cantrips prepared — ${c.dailyRemaining} still to choose on the Magic tab.`
      );
    } else {
      lines.push(
        `<strong>${c.label}:</strong> ${c.daily.map((d) => d.name).join(" and ")} prepared. Clear them on the Magic tab to choose differently today.`
      );
    }
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* The feat's own Use button                                           */
/* ------------------------------------------------------------------ */

/**
 * Fill whatever this source still owes, one pick at a time.
 *
 * LOOPED RATHER THAN ONE-SHOT because the allowances are two and four,
 * and a Use button that hands over one of four and says "press me again"
 * three more times is the ritual this project keeps removing. Stops the
 * moment a picker is cancelled, so the player is never trapped in it.
 *
 * PERMANENT BEFORE PREPARED. An Arcanist who has not filled their
 * spellbook cannot prepare from it, so the book is offered first and the
 * preparation step follows in the same press.
 */
export async function runArchetypeCastingStep(actor, sourceKey) {
  const source = archetypeCastingByName(sourceKey);
  if (!source) return 0;
  let made = 0;

  const owed = () => archetypeCantripState(
    source,
    archetypeCantrips(Array.from(actor?.items ?? []), source.key)
  );

  while (owed().permanentRemaining > 0) {
    const created = await openArchetypePermanentPick(actor, source.key);
    if (!created) return made;
    made += 1;
  }
  while (owed().dailyRemaining > 0) {
    const created = await openArchetypePrepare(actor, source.key);
    if (!created) return made;
    made += 1;
  }

  if (!made) {
    const state = owed();
    ui.notifications.info(
      state.prepares
        ? `${source.label}: all ${state.dailyAllowed} cantrips are prepared — clear them on the Magic tab to choose differently.`
        : `${source.label}: both cantrips are known and may be cast at any time.`
    );
  }
  return made;
}

/* ------------------------------------------------------------------ */

/** A minimal single-choice dialog, matching the one feats-workflow uses. */
async function chooseFromList(title, label, options) {
  const { DialogV2 } = foundry.applications.api;
  const rows = options
    .map(([value, text]) => `<option value="${value}">${text}</option>`)
    .join("");
  const content = `<p>${label}</p><select name="choice" style="width:100%">${rows}</select>`;
  return DialogV2.prompt({
    window: { title },
    content,
    ok: {
      label: "Choose",
      callback: (event, button) => button.form.elements.choice.value
    },
    rejectClose: false
  });
}
