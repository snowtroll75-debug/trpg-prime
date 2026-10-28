/**
 * The Foundry side of the instinctive repertoire (see repertoire.mjs
 * for the rule and its provenance). Two sheet actions, both living on
 * the Magic tab's Repertoire card:
 *
 *   Pick — fill an owed slot from the spells pack, filtered to the
 *          class's tradition and category restriction, PP 2 while the
 *          two 1st-level slots are open and the castable cap after.
 *   Swap — trade one recorded pick for a new spell, against the banked
 *          swap allowance.
 *
 * Every spell created here carries repertoirePick (so the schedule
 * counts it) and grantedBy pointing at the CLASS item (so removing the
 * class takes the repertoire with it, via the ordinary grant-cleanup
 * chain — no new mechanism).
 */

import { classItemOf } from "../class-progression.mjs";
import { pickFromPack } from "../picker-workflow.mjs";
import { magicalDiscoveryBonus } from "./magical-discovery.mjs";
import {
  alreadyKnownSpell,
  knownSpellKeys,
  repertoirePickEligible,
  repertoireSpells,
  repertoireState,
  repertoireSwapCount,
  repertoireSchedule
} from "./repertoire.mjs";
import {
  cantripPickEligible,
  knownCantripCount,
  knownCantripState,
  knownCantrips
} from "./known-cantrips.mjs";
import { packItemData } from "../items.mjs";
import { contentPack } from "../content-packs.mjs";

const { DialogV2 } = foundry.applications.api;
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

/** The card's own view of where the schedule stands. */
export function repertoireContext(actor) {
  const classItem = classItemOf(actor);
  if (!classItem) return null;
  const bonus = magicalDiscoveryBonus(actor, "instinctive");
  const state = repertoireState({
    level: Number(actor.system?.identity?.level ?? 0),
    picked: repertoireSpells(actor).length,
    swapsUsed: Number(classItem.flags?.[SYSTEM_ID]?.repertoireSwapsUsed ?? 0),
    bonus,
    schedule: repertoireSchedule(classItem, actor)
  });
  return {
    ...state,
    bonus,
    category: String(classItem.system?.repertoireCategory ?? "").trim().toLowerCase(),
    tradition: String(actor.system?.magic?.tradition ?? "")
  };
}

/**
 * The filter both actions share, differing only in the firstPick gate.
 *
 * ALREADY-HELD SPELLS ARE EXCLUDED (3.328.0). A repertoire pick is a
 * NEW spell — see knownSpellKeys in repertoire.mjs for the two keys and
 * why one of them is not enough. This also does the swap's other half
 * for free: the outgoing spell is still on the sheet when the
 * replacement is chosen (it is deleted afterwards), so "swap Bless for
 * Bless" can no longer spend a banked swap on nothing.
 *
 * Exported so the harness can RUN this exact filter rather than
 * restate it.
 */
export function eligibilityFor(actor, classItem, { firstPick }) {
  const tradition = String(actor.system?.magic?.tradition ?? "");
  // ARCADIAN CASTER / TRUE CASTER (Creature Codex; 3.631.0): the creature
  // may learn from more traditions than its own — "any" (True Caster), or
  // arcane and ethereal (Arcadian) — and casts them as its own. The
  // eligibility test is widened; the spell's tradition is left as printed.
  const learnTraditions = castingDerives(Array.from(actor.items ?? [])).traditions;
  const category = String(classItem.system?.repertoireCategory ?? "");
  const casterLevel = Number(actor.system?.magic?.casterLevelValue ?? 0);
  const known = knownSpellKeys(actor.items ?? []);
  return (entry) =>
    !alreadyKnownSpell(known, entry) &&
    repertoirePickEligible(
      {
        tradition: entry.system?.tradition,
        category: entry.system?.category,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      { tradition: learnTraditions === "any" || (Array.isArray(learnTraditions) && learnTraditions.includes(String(entry.system?.tradition ?? "").split(",")[0].trim().toLowerCase())) ? "" : tradition, category, firstPick, casterLevel }
    );
}

function describeFilter(actor, classItem, { firstPick }) {
  const tradition = String(actor.system?.magic?.tradition ?? "spell");
  const category = String(classItem.system?.repertoireCategory ?? "").trim();
  const cap = Number(actor.system?.magic?.casterLevelValue ?? 0) + 1;
  const kind = `${tradition}${category ? ` ${category}` : ""}`;
  return firstPick
    ? `any PP 2 ${kind} spell (1st-level pick)`
    : `any ${kind} spell of PP ${cap} or less (your castable maximum)`;
}

/** Create the chosen pack spell on the actor as a recorded pick. */
async function createRepertoireSpell(actor, classItem, itemId) {
  const pack = contentPack("spells");
  const document = await pack?.getDocument(itemId);
  if (!document) return null;
  const data = packItemData(document);
  data.flags = {
    ...data.flags,
    [SYSTEM_ID]: {
      ...data.flags?.[SYSTEM_ID],
      repertoirePick: true,
      grantedBy: {
        sourceId: classItem.id,
        sourceName: classItem.name,
        requested: document.name
      }
    }
  };
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

/**
 * Pick — the Repertoire card's main button. Refuses cleanly when the
 * schedule owes nothing; otherwise opens the filtered pack browser.
 */
export async function openRepertoirePick(actor) {
  const classItem = classItemOf(actor);
  const context = repertoireContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Spell repertoire: this character has no class item.");
    return null;
  }
  if (!context.remaining) {
    ui.notifications.info(
      `Spell repertoire: all ${context.allowed} picks are made.` +
        (context.nextPickLevel ? ` The next arrives at level ${context.nextPickLevel}.` : "")
    );
    return null;
  }
  const firstPick = context.firstPicksOutstanding;
  const picked = await pickFromPack("spells", {
    title: `Repertoire pick ${context.picked + 1} of ${context.allowed} — ${describeFilter(actor, classItem, { firstPick })}`,
    fields: ["system.tradition", "system.category", "system.ppCost", "system.specialist"],
    filter: eligibilityFor(actor, classItem, { firstPick }),
    emptyMessage: "No spells in the pack match this pick's restrictions — spells already on your sheet are not listed."
  });
  if (!picked) return null;
  const created = await createRepertoireSpell(actor, classItem, picked.itemId);
  if (!created) return null;
  const after = repertoireContext(actor);
  await postCard(actor, "Spell Repertoire", [
    line(`<strong>${created.name}</strong> added to the repertoire (${describeFilter(actor, classItem, { firstPick })}).`),
    line(
      after.remaining
        ? `<em>${after.remaining} pick${after.remaining === 1 ? "" : "s"} still owed — pick again from the Magic tab.</em>`
        : `<em>All ${after.allowed} picks made.${after.nextPickLevel ? ` The next arrives at level ${after.nextPickLevel}.` : ""}</em>`
    )
  ]);
  return created;
}

/**
 * Swap — "you may swap any one spell from your repertoire for a new
 * spell", against the banked allowance. The outgoing spell must be a
 * recorded pick; the incoming one follows the ordinary later-pick
 * rules (castable cap), never the PP 2 first-pick restriction — the
 * book's swap clause names no cost limit of its own.
 */
export async function openRepertoireSwap(actor) {
  const classItem = classItemOf(actor);
  const context = repertoireContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Spell repertoire: this character has no class item.");
    return null;
  }
  if (!context.swapsLeft) {
    ui.notifications.info(
      context.swapsAllowed
        ? `Spell repertoire: all ${context.swapsAllowed} swaps are spent.` +
          (context.nextSwapLevel ? ` The next arrives at level ${context.nextSwapLevel}.` : "")
        : "Spell repertoire: swaps arrive at 5th level."
    );
    return null;
  }
  const owned = repertoireSpells(actor);
  if (!owned.length) {
    ui.notifications.warn("Spell repertoire: no recorded picks to swap out.");
    return null;
  }
  const options = owned
    .map((spell) => `<option value="${spell.id}">${spell.name} (PP ${spell.system?.ppCost ?? "?"})</option>`)
    .join("");
  const chosen = await DialogV2.wait({
    window: { title: "Swap Repertoire Spell", icon: "fa-solid fa-right-left" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">
      <label>Spell to swap OUT (${context.swapsLeft} of ${context.swapsAllowed} swap${context.swapsAllowed === 1 ? "" : "s"} left)</label>
      <select name="spellId">${options}</select></div></div>`,
    buttons: [
      {
        action: "ok", label: "Choose replacement", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!chosen || chosen === "cancel" || !chosen.spellId) return null;
  const outgoing = actor.items.get(chosen.spellId);
  if (!outgoing) return null;

  const picked = await pickFromPack("spells", {
    title: `Swap ${outgoing.name} for — ${describeFilter(actor, classItem, { firstPick: false })}`,
    fields: ["system.tradition", "system.category", "system.ppCost", "system.specialist"],
    filter: eligibilityFor(actor, classItem, { firstPick: false }),
    emptyMessage: "No spells in the pack match the repertoire's restrictions — spells already on your sheet are not listed."
  });
  if (!picked) return null;

  const outgoingName = outgoing.name;
  await outgoing.delete();
  const created = await createRepertoireSpell(actor, classItem, picked.itemId);
  if (!created) return null;
  const spent = Number(classItem.flags?.[SYSTEM_ID]?.repertoireSwapsUsed ?? 0) + 1;
  await classItem.setFlag(SYSTEM_ID, "repertoireSwapsUsed", spent);
  const swapsLeft = Math.max(
    0,
    repertoireSwapCount(Number(actor.system?.identity?.level ?? 0), repertoireSchedule(classItem, actor)) - spent
  );
  await postCard(actor, "Spell Repertoire", [
    line(`<strong>${outgoingName}</strong> swapped out for <strong>${created.name}</strong>.`),
    line(`<em>${swapsLeft} swap${swapsLeft === 1 ? "" : "s"} remaining in the bank.</em>`)
  ]);
  return created;
}


/* ------------------------------------------------------------------ */
/* KNOWN CANTRIPS — the Bard's second, smaller pool                    */
/* ------------------------------------------------------------------ */
/*
 * The same three moving parts as the repertoire above (context, filter,
 * create-as-recorded-pick) against a different allowance, because the
 * Bard's cantrips behave like the repertoire and not like the learned
 * casters' daily four. See known-cantrips.mjs for why that distinction
 * is the whole point.
 *
 * NO SWAP ACTION, deliberately. "You may swap any one spell from your
 * repertoire for a new spell" is a sentence about the REPERTOIRE; the
 * cantrip sentence grants two at 1st level and says nothing further. A
 * swap here would be a rule nobody wrote.
 */

/** Allowance and picks for the sheet's Cantrips card, or null. */
export function cantripContext(actor) {
  const classItem = classItemOf(actor);
  if (!classItem) return null;
  const allowed = knownCantripCount(classItem);
  if (!allowed) return null;
  return {
    ...knownCantripState({ allowed, picked: knownCantrips(actor).length }),
    tradition: String(actor.system?.magic?.tradition ?? "")
  };
}

/** Create the chosen pack spell as a recorded cantrip pick. */
async function createKnownCantrip(actor, classItem, itemId) {
  const pack = contentPack("spells");
  const document = await pack?.getDocument(itemId);
  if (!document) return null;
  const data = packItemData(document);
  data.flags = {
    ...data.flags,
    [SYSTEM_ID]: {
      ...data.flags?.[SYSTEM_ID],
      // NOT `repertoirePick`. The repertoire schedule counts that flag,
      // so reusing it would make each cantrip eat a repertoire slot —
      // two picks the Bard would never get back.
      cantripPick: true,
      grantedBy: {
        sourceId: classItem.id,
        sourceName: classItem.name,
        requested: document.name
      }
    }
  };
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

/** Pick — the Cantrips card's button. */
export async function openCantripPick(actor) {
  const classItem = classItemOf(actor);
  const context = cantripContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Cantrips: this class does not learn cantrips permanently.");
    return null;
  }
  if (!context.remaining) {
    ui.notifications.info(`Cantrips: all ${context.allowed} are known.`);
    return null;
  }
  const tradition = context.tradition || "spell";
  // Already-known cantrips excluded, for the same reason repertoire
  // picks are (3.328.0) — the Bard's pool is two, and spending one of
  // them on a second copy of Mage Hand is not a choice anyone means to
  // make. Live on 17 Aug 2026 the picker offered both cantrips the
  // Bard already knew.
  const known = knownSpellKeys(actor.items ?? []);
  const picked = await pickFromPack("spells", {
    title: `Cantrip ${context.picked + 1} of ${context.allowed} — any ${tradition} cantrip (PP 0)`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: (entry) => !alreadyKnownSpell(known, entry) && cantripPickEligible(
      {
        tradition: entry.system?.tradition,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      { tradition: context.tradition }
    ),
    emptyMessage: "No cantrips in the pack match this class's tradition — cantrips you already know are not listed."
  });
  if (!picked) return null;
  const created = await createKnownCantrip(actor, classItem, picked.itemId);
  if (!created) return null;
  const after = cantripContext(actor);
  await postCard(actor, "Cantrips", [
    line(`<strong>${created.name}</strong> learned (${tradition} cantrip, PP 0).`),
    line(
      after.remaining
        ? `<em>${after.remaining} cantrip${after.remaining === 1 ? "" : "s"} still to choose — pick again from the Magic tab.</em>`
        : `<em>All ${after.allowed} cantrips known. They may be cast at any time and need no memorisation.</em>`
    )
  ]);
  return created;
}
