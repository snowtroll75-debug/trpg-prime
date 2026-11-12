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
  knownCantripAllowance,
  knownCantripState,
  knownCantrips
} from "./known-cantrips.mjs";
import { packItemData } from "../items.mjs";
import { contentPack } from "../content-packs.mjs";

const { DialogV2 } = foundry.applications.api;
import { castingDerives } from "../creature-ability-rules.mjs";
import { actorPickRule, learnTraditionsRule, nextCantripSlot, pickAllowed, trackNextPickLevel, trackPickCount, traditionAllowed, traditionRuleLabel } from "./class-magic.mjs";
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
/** A pick's track key, or "" for the class's own schedule. */
const trackOf = (spell) => String(spell?.flags?.[SYSTEM_ID]?.repertoireTrack ?? "").trim().toLowerCase();

/**
 * The class's further tracks, each with its picks and allowance (3.680.0;
 * Eldritch Arts D4d): the Sorcerer's "at 2nd level and every two levels,
 * thereafter, you may select a new spell from the tradition of magic granted
 * by your Birthright", beside its own "any tradition" schedule.
 */
export function repertoireTracks(actor) {
  const tracks = actor.system?.progression?.classMagic?.tracks ?? [];
  if (!tracks.length) return [];
  const level = Number(actor.system?.identity?.level ?? 0);
  const spells = repertoireSpells(actor);
  return tracks.map((track) => {
    const picked = spells.filter((s) => trackOf(s) === track.key).length;
    const allowed = trackPickCount(track, level);
    return {
      ...track,
      picked,
      allowed,
      remaining: Math.max(0, allowed - picked),
      firstPicksOutstanding: track.firstPickExact && picked < Math.min(track.firstPicks, allowed),
      nextPickLevel: trackNextPickLevel(track, level),
      restriction: track.traditions === "any" ? "any tradition" : (Array.isArray(track.traditions) ? traditionRuleLabel(track.traditions) : "choose your subclass first")
    };
  });
}

export function repertoireContext(actor) {
  const classItem = classItemOf(actor);
  if (!classItem) return null;
  const bonus = magicalDiscoveryBonus(actor, "instinctive");
  const tracks = repertoireTracks(actor);
  const state = repertoireState({
    level: Number(actor.system?.identity?.level ?? 0),
    // THE CLASS'S OWN SCHEDULE COUNTS ITS OWN PICKS (3.680.0, D4d): a further
    // track's are counted against that track.
    picked: tracks.length ? repertoireSpells(actor).filter((s) => !trackOf(s)).length : repertoireSpells(actor).length,
    swapsUsed: Number(classItem.flags?.[SYSTEM_ID]?.repertoireSwapsUsed ?? 0),
    bonus,
    schedule: repertoireSchedule(classItem, actor)
  });
  const ownRule = actor.system?.progression?.learnTraditions ? actorPickRule(actor) : null;
  const ownWords = ownRule === "any" ? "any tradition" : (ownRule ? traditionRuleLabel(ownRule) : String(actor.system?.magic?.tradition ?? ""));
  if (!tracks.length) {
    return {
      ...state,
      bonus,
      category: String(classItem.system?.repertoireCategory ?? "").trim().toLowerCase(),
      tradition: ownWords
    };
  }
  // The card shows one set of numbers: the schedules summed, the next level
  // that grows any of them, and each one's restriction.
  const nexts = [state.nextPickLevel, ...tracks.map((t) => t.nextPickLevel)].filter((n) => Number.isFinite(n));
  return {
    ...state,
    ownAllowed: state.allowed,
    ownPicked: state.picked,
    ownRemaining: state.remaining,
    allowed: state.allowed + tracks.reduce((n, t) => n + t.allowed, 0),
    picked: state.picked + tracks.reduce((n, t) => n + t.picked, 0),
    remaining: state.remaining + tracks.reduce((n, t) => n + t.remaining, 0),
    nextPickLevel: nexts.length ? Math.min(...nexts) : null,
    tracks,
    bonus,
    category: String(classItem.system?.repertoireCategory ?? "").trim().toLowerCase(),
    tradition: [ownWords, ...tracks.map((t) => `${t.label}: ${t.restriction}`)].filter(Boolean).join("; ")
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
  // …AND A CLASS'S OWN (3.680.0; Eldritch Arts D4): the Archmage's "all
  // traditions", the Witch's Ethereal and Verdant. Every tradition a spell
  // names is tried, not only its first (an "arcane, verdant" spell is a
  // verdant spell to a Witch). See magic/class-magic.mjs.
  const pickRule = actorPickRule(actor, castingDerives(Array.from(actor.items ?? [])).traditions);
  const category = String(classItem.system?.repertoireCategory ?? "");
  const casterLevel = Number(actor.system?.magic?.casterLevelValue ?? 0);
  const known = knownSpellKeys(actor.items ?? []);
  return (entry) =>
    !alreadyKnownSpell(known, entry) &&
    pickAllowed(pickRule, entry.system?.tradition) &&
    repertoirePickEligible(
      {
        tradition: entry.system?.tradition,
        category: entry.system?.category,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      { tradition: "", category, firstPick, casterLevel }
    );
}

function describeFilter(actor, classItem, { firstPick }) {
  // A widened rule in words (3.680.0, D4a): "any spell of any tradition", "any
  // ethereal or verdant spell".
  const rule = actor.system?.progression?.learnTraditions ? actorPickRule(actor) : null;
  const tradition = rule ? (rule === "any" ? "" : traditionRuleLabel(rule)) : String(actor.system?.magic?.tradition ?? "spell");
  const category = String(classItem.system?.repertoireCategory ?? "").trim();
  const cap = Number(actor.system?.magic?.casterLevelValue ?? 0) + 1;
  const kind = [tradition, category].filter(Boolean).join(" ");
  const spell = `${kind ? `${kind} ` : ""}spell${rule === "any" ? " of any tradition" : ""}`;
  return firstPick
    ? `any PP 2 ${spell} (1st-level pick)`
    : `any ${spell} of PP ${cap} or less (your castable maximum)`;
}

/**
 * The schedule a pick is made on: "" (an object-less false) for the class's
 * own, a track, or null when the player cancelled. Only schedules that owe a
 * pick are offered; one alone is taken without asking.
 */
async function chooseOwedTrack(actor, context) {
  const tracks = (context.tracks ?? []).filter((t) => t.remaining > 0);
  const ownOwes = (context.tracks ? context.ownRemaining : context.remaining) > 0;
  const options = [...(ownOwes ? [{ key: "", label: `Class pick (${context.tracks ? context.tradition.split(";")[0] : context.tradition || "your tradition"})` }] : []),
    ...tracks.map((t) => ({ key: t.key, label: `${t.label} (${t.restriction})` }))];
  if (options.length <= 1) return options[0]?.key ? tracks.find((t) => t.key === options[0].key) : "";
  const chosen = await DialogV2.wait({
    window: { title: "Repertoire Pick", icon: "fa-solid fa-book-medical" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked"><label>Which pick?</label>
      <select name="track">${options.map((o) => `<option value="${o.key}">${o.label}</option>`).join("")}</select></div></div>`,
    buttons: [
      {
        action: "ok", label: "Choose", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(button.form ?? button.closest("form")).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!chosen || chosen === "cancel") return null;
  const key = String(chosen.track ?? "");
  return key ? (tracks.find((t) => t.key === key) ?? null) : "";
}

/** A track's own filter: its traditions, the class's category, the PP bands. */
export function trackEligibilityFor(actor, classItem, track, { firstPick }) {
  const category = String(classItem.system?.repertoireCategory ?? "");
  const casterLevel = Number(actor.system?.magic?.casterLevelValue ?? 0);
  const known = knownSpellKeys(actor.items ?? []);
  return (entry) =>
    !alreadyKnownSpell(known, entry) &&
    traditionAllowed(track.traditions, entry.system?.tradition) &&
    repertoirePickEligible(
      {
        tradition: entry.system?.tradition,
        category: entry.system?.category,
        ppCost: entry.system?.ppCost,
        specialist: entry.system?.specialist
      },
      { tradition: "", category, firstPick, casterLevel }
    );
}

function describeTrackFilter(actor, classItem, track, { firstPick }) {
  const cap = Number(actor.system?.magic?.casterLevelValue ?? 0) + 1;
  const kind = track.traditions === "any" ? "spell of any tradition" : `${traditionRuleLabel(track.traditions)} spell`;
  return firstPick
    ? `${track.label}: any PP 2 ${kind}`
    : `${track.label}: any ${kind} of PP ${cap} or less (your castable maximum)`;
}

/** Create the chosen pack spell on the actor as a recorded pick. */
async function createRepertoireSpell(actor, classItem, itemId, trackKey = "") {
  const pack = contentPack("spells");
  const document = await pack?.getDocument(itemId);
  if (!document) return null;
  const data = packItemData(document);
  data.flags = {
    ...data.flags,
    [SYSTEM_ID]: {
      ...data.flags?.[SYSTEM_ID],
      repertoirePick: true,
      ...(trackKey ? { repertoireTrack: trackKey } : {}),
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
  // WHICH SCHEDULE (3.680.0, D4d): with further tracks, the pick is made on a
  // schedule that owes one — asked when more than one does.
  const track = await chooseOwedTrack(actor, context);
  if (track === null) return null;
  if (track && !Array.isArray(track.traditions) && track.traditions !== "any") {
    ui.notifications.warn(`Spell repertoire: the ${track.label} pick's tradition comes from your subclass — choose that first.`);
    return null;
  }
  const firstPick = track ? track.firstPicksOutstanding : context.firstPicksOutstanding;
  const words = track ? describeTrackFilter(actor, classItem, track, { firstPick }) : describeFilter(actor, classItem, { firstPick });
  const picked = await pickFromPack("spells", {
    title: `Repertoire pick ${context.picked + 1} of ${context.allowed} — ${words}`,
    fields: ["system.tradition", "system.category", "system.ppCost", "system.specialist"],
    filter: track ? trackEligibilityFor(actor, classItem, track, { firstPick }) : eligibilityFor(actor, classItem, { firstPick }),
    emptyMessage: "No spells in the pack match this pick's restrictions — spells already on your sheet are not listed."
  });
  if (!picked) return null;
  const created = await createRepertoireSpell(actor, classItem, picked.itemId, track?.key ?? "");
  if (!created) return null;
  const after = repertoireContext(actor);
  await postCard(actor, "Spell Repertoire", [
    line(`<strong>${created.name}</strong> added to the repertoire (${words}).`),
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

  // A TRACK'S PICK IS SWAPPED WITHIN ITS TRACK (3.680.0, D4d).
  const outgoingTrack = (context.tracks ?? []).find((t) => t.key === trackOf(outgoing)) ?? null;
  const picked = await pickFromPack("spells", {
    title: `Swap ${outgoing.name} for — ${outgoingTrack ? describeTrackFilter(actor, classItem, outgoingTrack, { firstPick: false }) : describeFilter(actor, classItem, { firstPick: false })}`,
    fields: ["system.tradition", "system.category", "system.ppCost", "system.specialist"],
    filter: outgoingTrack ? trackEligibilityFor(actor, classItem, outgoingTrack, { firstPick: false }) : eligibilityFor(actor, classItem, { firstPick: false }),
    emptyMessage: "No spells in the pack match the repertoire's restrictions — spells already on your sheet are not listed."
  });
  if (!picked) return null;

  const outgoingName = outgoing.name;
  await outgoing.delete();
  const created = await createRepertoireSpell(actor, classItem, picked.itemId, outgoingTrack?.key ?? "");
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
  // AND A FEAT'S DECLARED BONUS (3.684.0; Extra Cantrip), on a class that has the pool.
  const allowed = knownCantripAllowance(classItem, Array.from(actor.items ?? []));
  if (!allowed) return null;
  const known = knownCantrips(actor);
  const rule = cantripRuleFor(actor, known);
  const magic = actor.system?.progression?.classMagic ?? null;
  return {
    ...knownCantripState({ allowed, picked: known.length }),
    tradition: String(actor.system?.magic?.tradition ?? ""),
    // A CLASS'S OWN CANTRIP RULES (3.680.0; Eldritch Arts D4c, D4d). `rule` is
    // what the next pick may be, or null for the core's own-tradition test;
    // `fromBook` says the cantrips go in the spell book and are memorised.
    rule: rule?.rule ?? null,
    slotLabel: rule?.label ?? "",
    restriction: rule ? cantripRuleWords(rule.rule) : String(actor.system?.magic?.tradition ?? ""),
    fromBook: Boolean(magic?.cantripBook)
  };
}

/**
 * What the next known cantrip may be (3.680.0; Eldritch Arts D4d).
 *
 * - The class's own slots, filled most restrictive first: the Sorcerer's "One
 *   of these cantrips must be selected from the tradition granted by your
 *   birthright, the other can be selected from any tradition".
 * - Otherwise the widened pick rule (the Witch's Ethereal or Verdant; the
 *   Archmage's any), when the class or a creature widens it.
 * - Otherwise null: the core's own-tradition test, exactly as before.
 *
 * `rule` null inside an answer means a slot waits on a subclass not chosen.
 */
export function cantripRuleFor(actor, known = knownCantrips(actor)) {
  const magic = actor.system?.progression?.classMagic ?? null;
  const slots = magic?.cantrips ?? [];
  if (slots.length) {
    const index = nextCantripSlot(slots, known.map((c) => c.system?.tradition ?? ""));
    if (index < 0) return null;
    return { rule: slots[index].traditions ?? null, label: slots[index].label, slot: index };
  }
  const widened = learnTraditionsRule(actor.system?.progression?.learnTraditions ?? null, castingDerives(Array.from(actor.items ?? [])).traditions);
  if (!widened) return null;
  return { rule: actorPickRule(actor, castingDerives(Array.from(actor.items ?? [])).traditions), label: "", slot: -1 };
}

function cantripRuleWords(rule) {
  if (rule === "any") return "any tradition";
  if (Array.isArray(rule)) return traditionRuleLabel(rule);
  return "your birthright's tradition (choose it first)";
}

/** Create the chosen pack spell as a recorded cantrip pick. */
async function createKnownCantrip(actor, classItem, itemId, { fromBook = false } = {}) {
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
      // INTO THE BOOK (3.680.0, D4c): the Archmage's cantrips are book
      // entries, castable once memorised, not at will.
      ...(fromBook ? { spellBookPick: true, cantripBook: true } : {}),
      grantedBy: {
        sourceId: classItem.id,
        sourceName: classItem.name,
        requested: document.name
      }
    }
  };
  if (fromBook) data.system = { ...(data.system ?? {}), prepared: false };
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
  // A SLOT WAITING ON A SUBCLASS (3.680.0, D4d): the Sorcerer's birthright
  // cantrip cannot be chosen before the birthright is.
  const declared = cantripRuleFor(actor);
  if (declared && declared.rule === null) {
    ui.notifications.warn(`Cantrips: the next cantrip must come from ${declared.label || "your subclass's tradition"} — choose that first.`);
    return null;
  }
  const tradition = declared ? (declared.rule === "any" ? "" : traditionRuleLabel(declared.rule)) : (context.tradition || "spell");
  // Already-known cantrips excluded, for the same reason repertoire
  // picks are (3.328.0) — the Bard's pool is two, and spending one of
  // them on a second copy of Mage Hand is not a choice anyone means to
  // make. Live on 17 Aug 2026 the picker offered both cantrips the
  // Bard already knew.
  const known = knownSpellKeys(actor.items ?? []);
  const picked = await pickFromPack("spells", {
    title: `Cantrip ${context.picked + 1} of ${context.allowed} — any ${tradition ? `${tradition} ` : ""}cantrip${declared?.rule === "any" ? " of any tradition" : ""} (PP 0)${declared?.label ? ` — ${declared.label}` : ""}`,
    fields: ["system.tradition", "system.ppCost", "system.specialist"],
    filter: (entry) => !alreadyKnownSpell(known, entry) && (declared
      ? Number(entry.system?.ppCost ?? -1) === 0 && !entry.system?.specialist && traditionAllowed(declared.rule, entry.system?.tradition)
      : cantripPickEligible(
        {
          tradition: entry.system?.tradition,
          ppCost: entry.system?.ppCost,
          specialist: entry.system?.specialist
        },
        { tradition: context.tradition }
      )),
    emptyMessage: "No cantrips in the pack match this class's tradition — cantrips you already know are not listed."
  });
  if (!picked) return null;
  const created = await createKnownCantrip(actor, classItem, picked.itemId, { fromBook: context.fromBook });
  if (!created) return null;
  const after = cantripContext(actor);
  await postCard(actor, "Cantrips", [
    line(`<strong>${created.name}</strong> ${context.fromBook ? "added to your spell book" : "learned"} (${tradition ? `${tradition} ` : ""}cantrip, PP 0).`),
    line(
      after.remaining
        ? `<em>${after.remaining} cantrip${after.remaining === 1 ? "" : "s"} still to choose — pick again from the Magic tab.</em>`
        : context.fromBook
          ? `<em>All ${after.allowed} cantrips are in your spell book. Memorise today's at daily preparation before you can cast them.</em>`
          : `<em>All ${after.allowed} cantrips known. They may be cast at any time and need no memorisation.</em>`
    )
  ]);
  return created;
}
