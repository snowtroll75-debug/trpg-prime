/**
 * The Foundry side of the Wizard's Spell Book (see spellbook.mjs for
 * the rule and its provenance). One sheet action, on the Magic tab's
 * Spell Book card:
 *
 *   Add to Book — fill an owed slot from the spells pack, filtered to
 *                 the class's tradition, PP 2 while the opening batch
 *                 is open and the castable cap after.
 *
 * Every spell created here carries spellBookPick (permanent — never
 * swept by daily preparation) and grantedBy pointing at the CLASS item,
 * the same provenance shape the repertoire uses, so removing the class
 * takes the book with it via the ordinary grant-cleanup chain.
 *
 * Growing the book does not make a spell castable — that is
 * memorisation-workflow.mjs's job, toggling `prepared` on a subset of
 * these each day.
 *
 * A slot's own browser (3.230.7) excludes whatever the book already
 * holds, matched by pack id — Graham hit two "Sleep" entries in his own
 * book after the picker offered it back to him a second time with
 * nothing to say he already had it.
 */

import { classItemOf } from "../class-progression.mjs";
import { pickFromPack } from "../picker-workflow.mjs";
import { alreadyKnownSpell, knownSpellKeys } from "./repertoire.mjs";
import {
  spellBookLadderSpells,
  spellBookPickEligible,
  spellBookState
} from "./spellbook.mjs";
import { packItemData } from "../items.mjs";
import { contentPack } from "../content-packs.mjs";
import { availabilityWarning } from "./repertoire.mjs";

import { castingDerives } from "../creature-ability-rules.mjs";
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

/** The card's own view of where the book stands. Null for anyone whose
 * class isn't book-style — the Wizard, currently. */
export function spellBookContext(actor) {
  const classItem = classItemOf(actor);
  if (!classItem) return null;
  // THE DERIVED STYLE, for the reason memorisation-workflow gives: an
  // Enigma Wizard has no spellbook to prepare from (fixed 3.547.0).
  if (String(actor?.system?.magic?.memorisationStyle ?? "").trim().toLowerCase() !== "book") return null;
  const firstPicks = Number(classItem.system?.spellBookFirstPicks ?? 0);
  const state = spellBookState({
    level: Number(actor.system?.identity?.level ?? 0),
    firstPicks,
    // Only the free, level-based ladder's own picks count here — a spell
    // bought through Learn a Spell (flagged learnedExtra) is additional
    // and must not eat into this schedule's owed/remaining count. See
    // spellBookLadderSpells's own comment in spellbook.mjs.
    owned: spellBookLadderSpells(actor).length
  });
  return {
    ...state,
    firstPicks,
    tradition: String(actor.system?.magic?.tradition ?? "")
  };
}

/**
 * EVERY SPELL ON THE SHEET, not just the ones in the book.
 *
 * This started life as the book's own entries keyed by the pack id they
 * were picked from — id and not name, because the pack could ship two
 * "Sleep" entries at different PP costs and a name check would let one
 * hide the other (sourceEntryId / lesson 13, matching
 * memorisation-workflow.mjs's own id-based matching). That reasoning
 * still holds and is why `knownSpellKeys` prefers the id; what changed
 * is the SCOPE it is asked about.
 *
 * 3.328.0 fixed the pickers that offered a spell already held, and left
 * this one scoped to the book — which meant the four choosers disagreed
 * with each other. Found live: a Wizard with the Shadowy Guise feat
 * holds Self Mirage (arcane, PP 2, not a specialist spell), and the
 * book picker still offered it. Taking it spends one of the level
 * ladder's free slots on a second copy of a spell already on the sheet.
 * Twelve pack entries grant a non-specialist spell that way, so this
 * was reachable content, not a hypothetical.
 *
 * 3.328.1, Graham's ruling: the book excludes everything on the sheet,
 * like the repertoire and the cantrip pool do. One rule across all four
 * choosers.
 *
 * `spellBookSpells` is still the right set for the LADDER — how many
 * slots are owed is a question about the book, not about the sheet —
 * and spellBookState is untouched. This is only about what may be
 * chosen.
 */
// Exported (not just used internally) so the harness can RUN this exact
// filter directly rather than only proving it by source inspection.
export function ownedEntryIds(actor) {
  return knownSpellKeys(actor?.items ?? []);
}

export function eligibilityFor(actor, { firstPick }) {
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
      { tradition: learnTraditions === "any" || (Array.isArray(learnTraditions) && learnTraditions.includes(String(entry.system?.tradition ?? "").split(",")[0].trim().toLowerCase())) ? "" : tradition, firstPick, casterLevel }
    );
}

function describeFilter(actor, { firstPick }) {
  const tradition = String(actor.system?.magic?.tradition ?? "spell");
  const cap = Number(actor.system?.magic?.casterLevelValue ?? 0) + 1;
  return firstPick
    ? `any PP 2 ${tradition} spell (opening batch)`
    : `any ${tradition} spell of PP ${cap} or less (your castable maximum)`;
}

/**
 * Add to Book — the Spell Book card's button. Refuses cleanly when the
 * schedule owes nothing; otherwise opens the filtered pack browser.
 */
export async function openSpellBookPick(actor) {
  const classItem = classItemOf(actor);
  const context = spellBookContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Spell book: this character's class doesn't keep one.");
    return null;
  }
  if (!context.remaining) {
    ui.notifications.info(`Spell book: all ${context.allowed} slots are filled — the next arrives at your next level.`);
    return null;
  }
  const firstPick = context.firstPicksOutstanding;
  const picked = await pickFromPack("spells", {
    title: `Spell book slot ${context.owned + 1} of ${context.allowed} — ${describeFilter(actor, { firstPick })}`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: eligibilityFor(actor, { firstPick }),
    emptyMessage: "No spells in the pack match this slot's restrictions — spells already in your book are not listed."
  });
  if (!picked) return null;

  const pack = contentPack("spells");
  const document = await pack?.getDocument(picked.itemId);
  if (!document) return null;
  const data = packItemData(document);
  data.flags = {
    ...data.flags,
    [SYSTEM_ID]: {
      ...data.flags?.[SYSTEM_ID],
      spellBookPick: true,
      grantedBy: {
        sourceId: classItem.id,
        sourceName: classItem.name,
        requested: document.name
      }
    }
  };
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  if (!created) return null;

  /*
   * SPELL AVAILABILITY (3.583.0; page 235, Graham's R11: "Warning").
   *
   * "Casters cannot select these spells using automatic spell picks upon
   * levelling unless the GM rules otherwise." A WARNING rather than a
   * refusal on Graham's ruling, and the page gives the reason twice: its
   * own escape clause, and its closing line that a GM "may adjust
   * availability as appropriate for their world".
   *
   * Every Core spell is Common by default, so nothing in the shipped
   * pack says anything; only a supplement that marks its spells speaks.
   */
  const availability = availabilityWarning(created);
  const after = spellBookContext(actor);
  await postCard(actor, "Spell Book", [
    line(`<strong>${created.name}</strong> added to your spell book (${describeFilter(actor, { firstPick })}).`),
    ...(availability.warn ? [line(`<strong>Check with your GM:</strong> ${availability.said}`)] : []),
    line("<em>Being in the book isn't the same as knowing it today — memorise it at daily preparation before you can cast it.</em>"),
    line(
      after.remaining
        ? `<em>${after.remaining} slot${after.remaining === 1 ? "" : "s"} still open — add again from the Magic tab.</em>`
        : `<em>All ${after.allowed} slots filled — two more arrive at your next level.</em>`
    )
  ]);
  return created;
}
