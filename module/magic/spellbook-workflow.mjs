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
import { PICKER_FACETS } from "../picker-filters.mjs";
import { alreadyKnownSpell, knownSpellKeys } from "./repertoire.mjs";
import {
  spellBookFreeSpells,
  spellBookLearnedSpells,
  spellBookLadderSpells,
  spellBookPickEligible,
  spellBookState
} from "./spellbook.mjs";
import { packItemData } from "../items.mjs";
import { contentPack } from "../content-packs.mjs";
import { availabilityWarning } from "./repertoire.mjs";

import { castingDerives } from "../creature-ability-rules.mjs";
import { actorPickRule, bookSlotsPerLevel, pickAllowed, traditionRuleLabel } from "./class-magic.mjs";
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
    owned: spellBookLadderSpells(actor).length,
    // THE CLASS'S OWN LADDER (3.680.0, D4b): the Archmage's one a level.
    perLevel: bookSlotsPerLevel(actor.system?.progression?.classMagic)
  });
  return {
    ...state,
    firstPicks,
    // The GM-approved free spells (3.714.0), tallied apart from the slots.
    free: spellBookFreeSpells(actor).length,
    // Learn a Spell's additions (3.714.1; Graham: "a box of their own").
    learned: spellBookLearnedSpells(actor).length,
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

/*
 * NO PP CAP (3.714.1; Graham, 25 November 2026, for the Free Spell: "Keep
 * tradition rules but allow higher PP spells"). `anyPP` drops only the
 * castable-maximum test; the tradition rule, the specialist exclusion and
 * "nothing already on the sheet" all still apply.
 */
export function eligibilityFor(actor, { firstPick, anyPP = false }) {
  const tradition = String(actor.system?.magic?.tradition ?? "");
  // ARCADIAN CASTER / TRUE CASTER (Creature Codex; 3.631.0): the creature
  // may learn from more traditions than its own — "any" (True Caster), or
  // arcane and ethereal (Arcadian) — and casts them as its own. The
  // eligibility test is widened; the spell's tradition is left as printed.
  // …AND A CLASS'S OWN (3.680.0; Eldritch Arts D4): the Archmage's "all
  // traditions", the Witch's Ethereal and Verdant. Every tradition a spell
  // names is tried, not only its first (an "arcane, verdant" spell is a
  // verdant spell to a Witch). See magic/class-magic.mjs.
  const pickRule = actorPickRule(actor, castingDerives(Array.from(actor.items ?? [])).traditions);
  const casterLevel = Number(actor.system?.magic?.casterLevelValue ?? 0);
  const owned = ownedEntryIds(actor);
  return (entry) =>
    !alreadyKnownSpell(owned, entry) &&
    pickAllowed(pickRule, entry.system?.tradition) &&
    spellBookPickEligible(
      {
        tradition: entry.system?.tradition,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      { tradition: "", firstPick: firstPick && !anyPP, casterLevel: anyPP ? Number.MAX_SAFE_INTEGER - 1 : casterLevel }
    );
}

function describeFilter(actor, { firstPick }) {
  // "any PP 2 spell of any tradition" for an Archmage (3.680.0, D4a).
  const widened = actor.system?.progression?.learnTraditions;
  const rule = widened ? actorPickRule(actor) : null;
  const tradition = rule ? (rule === "any" ? "" : traditionRuleLabel(rule)) : String(actor.system?.magic?.tradition ?? "spell");
  const kind = `${tradition ? `${tradition} ` : ""}spell${rule === "any" ? " of any tradition" : ""}`;
  const cap = Number(actor.system?.magic?.casterLevelValue ?? 0) + 1;
  return firstPick
    ? `any PP 2 ${kind} (opening batch)`
    : `any ${kind} of PP ${cap} or less (your castable maximum)`;
}

/**
 * How many spells one Add to Book may take (3.715.0): every slot owed, or,
 * while the opening batch is open, what is left of that batch — its picks
 * are held to PP 2, so the later slots wait for the next press. Never
 * below 1 while anything is owed; 0 when nothing is.
 */
export function spellBookPickLimit({ remaining = 0, firstPicksOutstanding = false, firstPicks = 0, owned = 0 } = {}) {
  const owed = Math.max(0, Math.floor(Number(remaining) || 0));
  if (!owed) return 0;
  if (!firstPicksOutstanding) return owed;
  const batchLeft = Math.floor(Number(firstPicks) || 0) - Math.floor(Number(owned) || 0);
  return Math.max(1, Math.min(owed, batchLeft));
}

/** "two more arrive", or the class's own number (3.680.0, D4b). */
function perLevelWords(actor) {
  const n = bookSlotsPerLevel(actor.system?.progression?.classMagic);
  return n === 1 ? "one more arrives" : n === 0 ? "no more arrive" : `${n === 2 ? "two" : n} more arrive`;
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
  // SEVERAL AT ONCE (3.715.0; Graham: "select more than one spell at a
  // time"), up to the slots owed. While the opening batch is open the cap is
  // what is left of THAT batch: its picks are PP 2 only, so a 3rd-level
  // Wizard owed six opening picks and four later ones picks the six here,
  // then opens the browser again for the four at the castable maximum.
  const maxPicks = spellBookPickLimit(context);
  const picked = await pickFromPack("spells", {
    title: `Spell book: ${maxPicks === 1 ? "slot" : `up to ${maxPicks} slots`} (${context.owned} of ${context.allowed} filled) — ${describeFilter(actor, { firstPick })}`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: eligibilityFor(actor, { firstPick }),
    // School and PP menus (3.715.0; Graham: "a filter by school option and
    // filter by PP"), beside the Sourcebook menu every picker has.
    facets: PICKER_FACETS.spellbook,
    multiple: true,
    maxPicks,
    emptyMessage: "No spells in the pack match this slot's restrictions — spells already in your book are not listed."
  });
  if (!picked?.picks?.length) return null;

  const pack = contentPack("spells");
  const datas = [];
  for (const { itemId } of picked.picks.slice(0, maxPicks)) {
    const document = await pack?.getDocument(itemId);
    if (!document) continue;
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
    datas.push(data);
  }
  if (!datas.length) return null;
  const createdAll = await actor.createEmbeddedDocuments("Item", datas);
  if (!createdAll?.length) return null;

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
  const warnings = createdAll
    .map((created) => ({ created, availability: availabilityWarning(created) }))
    .filter((row) => row.availability.warn);
  const after = spellBookContext(actor);
  const names = createdAll.map((created) => `<strong>${created.name}</strong>`).join(", ");
  await postCard(actor, "Spell Book", [
    line(`${names} added to your spell book (${describeFilter(actor, { firstPick })}).`),
    ...warnings.map((row) => line(`<strong>Check with your GM about ${row.created.name}:</strong> ${row.availability.said}`)),
    line("<em>Being in the book isn't the same as knowing it today — memorise it at daily preparation before you can cast it.</em>"),
    line(
      after.remaining
        ? `<em>${after.remaining} slot${after.remaining === 1 ? "" : "s"} still open — add again from the Spellbook.</em>`
        : `<em>All ${after.allowed} slots filled — ${perLevelWords(actor)} at your next level.</em>`
    )
  ]);
  return createdAll;
}
