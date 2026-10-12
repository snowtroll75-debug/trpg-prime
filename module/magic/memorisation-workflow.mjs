/**
 * The Foundry side of the learned caster's daily memorisation cycle
 * (see memorisation.mjs for the rule and its provenance). Lives on the
 * Magic tab's Memorisation card, and offered again — as an explicit
 * choice, not a forced reset — from Daily Preparation (uses-workflow.mjs).
 *
 * Two selections, both counted against the day's allowance and both
 * refusing cleanly once it's spent:
 *
 *   Memorise Spell   — a leveled (PP > 0) pick. "list"-style casters
 *                       (Druid, Cleric) pick from the whole pack,
 *                       filtered to their tradition and castable cap.
 *                       "book"-style casters (the Wizard) pick from
 *                       their OWNED Spell Book only — a spell not in
 *                       the book yet isn't offered at all.
 *   Memorise Cantrip — pack-wide for every learned caster regardless
 *                       of style (the Wizard's own text: cantrips
 *                       "do not need to be written into a spell book").
 *
 * Both open the SAME kind of dialog: a bulk checklist of every eligible
 * spell, today's already-memorised picks pre-checked and highlighted,
 * capped at the day's allowance, with a PP filter to narrow a long list
 * (Graham, 3.230.6 — matching a provided mockup, "keep original css").
 * Confirming applies only the DIFFERENCE between what was checked and
 * what was already memorised — a "list"-style leveled pick and every
 * cantrip pick are CREATED fresh (flag dailyMemorised) for a newly
 * checked entry and DELETED for an unchecked one that was memorised;
 * a "book"-style leveled pick simply toggles `prepared` on an existing
 * Spell Book item, in either direction.
 *
 * What this deliberately does NOT do any more: force a blank slate.
 * Through 3.230.5, Daily Preparation unconditionally deleted every
 * dailyMemorised item and unprepared the whole Spell Book
 * (sweepDailyMemorisation, since removed) before the player could
 * memorise anything for the new day. Graham: "I would rather this not
 * happen... provide a prompt asking the character if they wish to
 * change any of their memorised spells... rather than a full reset
 * every day." Now nothing is swept automatically at all — yesterday's
 * picks simply persist onto today unless the player explicitly opens
 * one of these dialogs and changes something, at which point only the
 * entries they actually toggled are touched. `promptDailyMemorisationChange`
 * below is the prompt Daily Preparation now asks instead of sweeping.
 */

import { classItemOf } from "../class-progression.mjs";
import { classTradition, grantedTraditions } from "./caster-tier-feats.mjs";
import { maxPPPerCast } from "./casting.mjs";
import { magicalDiscoveryBonus } from "./magical-discovery.mjs";
import {
  cantripPoolEligible,
  dailyMemorisedCantrips,
  dailyMemorisedLeveled,
  memorisationPoolEligible,
  memorisationState
} from "./memorisation.mjs";
import { sourceEntryId, spellBookSpells } from "./spellbook.mjs";
import { spellListFilterOptions, wireSpellListFilters } from "../sheets/list-filters.mjs";
import { packItemData } from "../items.mjs";
import { contentPack } from "../content-packs.mjs";

const { DialogV2 } = foundry.applications.api;
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

/** The card's own view of where today's memorisation stands. Null for
 * anyone whose class isn't a learned caster. */
/**
 * Does this spell belong to the named tradition?
 *
 * A spell's `tradition` field can list several ("divinity, ethereal,
 * verdant" on Guidance), so this is a membership test rather than an
 * equality one — the reason a first draft counted zero granted picks
 * against a perfectly good Guidance.
 */
function traditionMatches(spell, tradition) {
  return String(spell?.system?.tradition ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .includes(String(tradition ?? "").trim().toLowerCase());
}

export function memorisationContext(actor) {
  const classItem = classItemOf(actor);
  // READ THE DERIVED STYLE, NOT THE CLASS ITEM (fixed 3.547.0). Enigma
  // makes a Wizard an instinctive caster who "does not have to memorise
  // your spells during daily preparation"; asking the class directly
  // walked straight past that and kept offering the spellbook.
  const style = String(actor?.system?.magic?.memorisationStyle ?? "").trim().toLowerCase();
  if (!classItem || !["list", "book"].includes(style)) return null;
  const bonus = magicalDiscoveryBonus(actor, "learned");
  const level = Number(actor.system?.identity?.level ?? 0);
  const tradition = String(actor.system?.magic?.tradition ?? "");

  // THE CASTER-TIER FEATS GRANT A DIFFERENT TRADITION, so their slots get
  // their own counters rather than swelling the pool above. A wizard with
  // Minor Divinity Caster may memorise three divinity spells and not one
  // more arcane one; folding them into `bonusLeveled` would have granted
  // exactly the wrong three. (Graham's ruling, 20 Aug 2026.)
  //
  // MEASURED AGAINST THE CLASS'S TRADITION (Graham, 20 Aug 2026), not
  // the resolved one an archetype may have written. See `classTradition`.
  const grantedSlots = grantedTraditions(
    Array.from(actor.items ?? []).filter((i) => i.type === "feat").map((i) => i.name),
    level,
    classTradition(actor.system?.progression)
  );

  // EVERY MEMORISED SPELL BELONGS TO EXACTLY ONE BUCKET. Driven live at
  // 3.341.0 and found wrong: a wizard memorising a granted Bless read
  // "Divinity 1 / 3" AND "Leveled 1 / 18", so the feat quietly cost them
  // one of their own arcane memorisations for every divinity spell it
  // granted. The printed word is "an ADDITIONAL divinity spell".
  //
  // Assigning rather than counting twice also settles the other half of
  // the same problem: a spell whose tradition field lists several — and a
  // caster granted more than one of them — fills ONE slot, not one per
  // tradition it happens to name.
  const grantedCounts = new Map(grantedSlots.map((g) => [g.tradition, 0]));
  let ownLeveled = 0;
  for (const spell of dailyMemorisedLeveled(actor)) {
    const bucket = grantedSlots.find((g) => traditionMatches(spell, g.tradition));
    if (bucket) grantedCounts.set(bucket.tradition, grantedCounts.get(bucket.tradition) + 1);
    else ownLeveled += 1;
  }

  const state = memorisationState({
    level,
    leveledMemorised: ownLeveled +
      (style === "book" ? spellBookSpells(actor).filter((s) => s.system?.prepared).length : 0),
    cantripsMemorised: dailyMemorisedCantrips(actor).length,
    cantripAllowance: classItem.system?.cantripsPerDay,
    bonusLeveled: bonus
  });

  const granted = grantedSlots.map((entry) => {
    const picked = grantedCounts.get(entry.tradition) ?? 0;
    return { ...entry, picked, remaining: Math.max(0, entry.slots - picked) };
  });

  return {
    ...state,
    bonus,
    granted,
    hasGranted: granted.length > 0,
    style,
    // Precomputed rather than left for the template to branch on with a
    // helper this codebase doesn't otherwise register — same reasoning
    // as everywhere else a card reads a plain context field instead of
    // doing its own comparison.
    isBookStyle: style === "book",
    tradition,
    poolLabel: style === "book" ? "Spell Book" : `${tradition} (whole list)`
  };
}

/**
 * Shared bulk-select dialog: a multi-checkbox list with a PP filter and
 * a live "Selected: X / target" counter. Reuses the item picker's own
 * row/list CSS (trg-picker-row/trg-picker-list, picker-workflow.mjs)
 * rather than inventing new classes (Graham: "keep original css"), and
 * `wireSpellListFilters` for the PP filter itself (list-filters.mjs) —
 * the identical mechanism the Spell Book and Spells table filters
 * already use, not a second copy of the same row-hiding logic.
 *
 * Checking beyond `target` is refused outright — once the count reaches
 * the cap, every still-unchecked box disables until something is
 * unchecked again — rather than silently allowed and left for the
 * caller to reject after the fact.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.icon
 * @param {string} options.introHtml Prose above the toolbar.
 * @param {Array<{id:string,name:string,ppCost:number,category:string,prepared:boolean}>} options.entries
 * @param {number} options.target
 * @returns {Promise<string[]|null>} Checked entry ids, or null if
 *   cancelled.
 */
async function promptSpellChecklist({ title, icon, introHtml, entries, target }) {
  const { pps } = spellListFilterOptions(entries.map((e) => ({ tradition: "", ppCost: e.ppCost })));
  const ppOptions = pps.map((pp) => `<option value="${pp}">${pp}</option>`).join("");
  const rows = entries
    .map((entry) => `
      <label class="trg-picker-row trg-prepare-row${entry.prepared ? " trg-prepare-row-prepared" : ""}" data-pp="${entry.ppCost}">
        <input type="checkbox" name="picked" value="${entry.id}" ${entry.prepared ? "checked" : ""}>
        <span><strong>${entry.name}</strong> <small>PP ${entry.ppCost}${entry.category ? ` — ${entry.category}` : ""}</small></span>
        ${entry.prepared ? '<span class="trg-prepare-prev">prev.</span>' : ""}
      </label>`)
    .join("");

  const dialogPromise = DialogV2.wait({
    window: { title, icon },
    classes: ["trg-prime", "trg-item-picker", "trg-prepare-dialog"],
    position: { width: 460, height: 620 },
    content: `
      <div class="trg-prime trg-item-picker-body trg-prepare-body">
        ${introHtml}
        <div class="trg-prepare-toolbar">
          <label class="trg-prepare-filter">
            <span>Filter by PP</span>
            <select class="trg-prepare-filter-pp">
              <option value="">All PP</option>
              ${ppOptions}
            </select>
          </label>
          <output class="trg-prepare-count">Selected: <span class="trg-prepare-count-value">0</span> / ${target}</output>
        </div>
        <div class="trg-picker-list trg-prepare-list">${rows || '<p class="empty-state">Nothing eligible right now.</p>'}</div>
      </div>`,
    buttons: [
      {
        action: "confirm", label: "Confirm", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          return Array.from(form?.querySelectorAll('input[name="picked"]:checked') ?? []).map((el) => el.value);
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  // Foundry's own convention for post-render behaviour on any
  // Application, DialogV2 included — same pattern picker-workflow.mjs's
  // pickFromPack already relies on for its own live search.
  Hooks.once("renderDialogV2", (dialogApp) => {
    const root = dialogApp.element;
    const list = root.querySelector(".trg-prepare-list");
    if (!list) return;

    wireSpellListFilters(root, {
      rowSelector: ".trg-prepare-row",
      filters: [{ select: ".trg-prepare-filter-pp", data: "pp" }]
    });

    const boxes = Array.from(list.querySelectorAll('input[name="picked"]'));
    const countValue = root.querySelector(".trg-prepare-count-value");
    const countOutput = root.querySelector(".trg-prepare-count");

    function refreshCount() {
      const count = boxes.filter((b) => b.checked).length;
      if (countValue) countValue.textContent = String(count);
      countOutput?.classList.toggle("trg-prepare-count-matched", count === target);
      boxes.forEach((b) => {
        if (!b.checked) b.disabled = count >= target;
      });
    }

    boxes.forEach((box) => box.addEventListener("change", refreshCount));
    refreshCount();
  });

  const result = await dialogPromise;
  if (!result || result === "cancel") return null;
  return result;
}

/**
 * A "book"-style leveled pick — every candidate is already an owned
 * Spell Book item, so "changing" means toggling `system.prepared` in
 * whichever direction the new selection needs, never creating or
 * deleting anything (growing the book itself is a separate, permanent
 * action on the book item's own sheet).
 */
async function promptBookMemorisation(actor, { pool, title, icon, introHtml, target }) {
  const entries = pool
    .map((s) => ({
      id: s.id,
      name: s.name,
      ppCost: Number(s.system?.ppCost ?? 0),
      category: s.system?.category ?? "",
      prepared: Boolean(s.system?.prepared)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedIds = await promptSpellChecklist({ title, icon, introHtml, entries, target });
  if (!selectedIds) return null;

  const selected = new Set(selectedIds);
  const toPrepare = pool.filter((s) => selected.has(s.id) && !s.system?.prepared);
  const toUnprepare = pool.filter((s) => !selected.has(s.id) && s.system?.prepared);
  const updates = [
    ...toPrepare.map((s) => ({ _id: s.id, "system.prepared": true })),
    ...toUnprepare.map((s) => ({ _id: s.id, "system.prepared": false }))
  ];
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  return { added: toPrepare.length, removed: toUnprepare.length };
}

/**
 * A pack-wide pick — the "list"-style leveled schedule and every
 * cantrip pick share this exact lifecycle (lesson 13: one mechanism,
 * not two copies): owned copies are matched back to the pack by their
 * recorded `_stats.compendiumSource`, a newly-checked entry is CREATED
 * (flag dailyMemorised, same as before), and an unchecked-but-previously-
 * memorised entry is DELETED. An entry left exactly as it was (checked
 * and already memorised, or unchecked and never memorised) is untouched.
 */
async function promptPackMemorisation(actor, classItem, { poolEntries, existingItems, title, icon, introHtml, target }) {
  const pack = contentPack("spells");
  if (!pack) {
    ui.notifications.warn(`Compendium pack "spells" not found.`);
    return null;
  }
  const byId = new Map(
    existingItems
      .map((item) => [sourceEntryId(item._stats?.compendiumSource), item])
      .filter(([id]) => id)
  );
  const entries = poolEntries
    .map((entry) => ({
      id: entry._id,
      name: entry.name,
      ppCost: Number(entry.system?.ppCost ?? 0),
      category: entry.system?.category ?? "",
      prepared: byId.has(entry._id)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const selectedIds = await promptSpellChecklist({ title, icon, introHtml, entries, target });
  if (!selectedIds) return null;

  const selected = new Set(selectedIds);
  let added = 0;
  let removed = 0;
  for (const entry of entries) {
    const nowSelected = selected.has(entry.id);
    if (nowSelected && !entry.prepared) {
      const created = await createDailyMemorisedSpell(actor, classItem, entry.id);
      if (created) added += 1;
    } else if (!nowSelected && entry.prepared) {
      const owned = byId.get(entry.id);
      if (owned) {
        await actor.deleteEmbeddedDocuments("Item", [owned.id]);
        removed += 1;
      }
    }
  }
  return { added, removed };
}

/**
 * Memorise Spell — the leveled half. "book" style offers every owned
 * Spell Book entry within the castable cap; "list" style offers the
 * whole pack, tradition- and cap-filtered. Both are bulk checklists,
 * pre-checked with whatever's already memorised, capped at the day's
 * allowance.
 */
export async function openMemoriseSpell(actor) {
  const classItem = classItemOf(actor);
  const context = memorisationContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Memorisation: this character's class doesn't need it.");
    return null;
  }

  const tradition = String(actor.system?.magic?.tradition ?? "");
  const casterLevel = Number(actor.system?.magic?.casterLevelValue ?? 0);
  const cap = maxPPPerCast(casterLevel);
  const title = `${actor.name} — Prepare Spells`;
  const icon = "fa-solid fa-book-medical";

  let result;
  if (context.style === "book") {
    const pool = spellBookSpells(actor).filter((s) => Number(s.system?.ppCost ?? 0) <= cap);
    if (!pool.length) {
      ui.notifications.warn("Memorisation: your Spell Book has no spells within your castable PP yet — add some to the book first.");
      return null;
    }
    const introHtml = `<p class="hint">Select up to <strong>${context.leveledAllowed}</strong> ${tradition || "Arcane"} spell(s) from your Spellbook. Previously prepared spells are highlighted and pre-checked. Only spells with PP ≤ your Max PP (${cap}) are shown.</p>`;
    result = await promptBookMemorisation(actor, { pool, title, icon, introHtml, target: context.leveledAllowed });
  } else {
    const pack = contentPack("spells");
    if (!pack) {
      ui.notifications.warn(`Compendium pack "spells" not found.`);
      return null;
    }
    const index = Array.from((await pack.getIndex({
      fields: ["system.tradition", "system.ppCost", "system.specialist", "system.category"]
    })).values());
    const pool = index.filter((entry) =>
      memorisationPoolEligible(
        { tradition: entry.system?.tradition, ppCost: entry.system?.ppCost, specialist: entry.system?.specialist },
        { tradition, casterLevel }
      )
    );
    if (!pool.length) {
      ui.notifications.warn("Memorisation: no spells in the pack match today's restrictions.");
      return null;
    }
    const introHtml = `<p class="hint">Select up to <strong>${context.leveledAllowed}</strong> ${tradition || "tradition"} spell(s) from the full spell list. Previously memorised spells are highlighted and pre-checked. Only spells with PP ≤ your Max PP (${cap}) are shown.</p>`;
    result = await promptPackMemorisation(actor, classItem, {
      poolEntries: pool,
      existingItems: dailyMemorisedLeveled(actor),
      title, icon, introHtml, target: context.leveledAllowed
    });
  }
  if (!result) return null;

  const after = memorisationContext(actor);
  await postCard(actor, "Memorisation", [
    line(
      result.added || result.removed
        ? `<strong>${after.leveledPicked}</strong> of ${after.leveledAllowed} leveled spells memorised — ${result.added} added, ${result.removed} removed.`
        : `<strong>${after.leveledPicked}</strong> of ${after.leveledAllowed} leveled spells memorised — no change.`
    )
  ]);
  return result;
}

/**
 * Memorise Cantrip — pack-wide for every learned caster, regardless of
 * memorisationStyle. Same bulk-checklist shape as the leveled pick.
 */
export async function openMemoriseCantrip(actor) {
  const classItem = classItemOf(actor);
  const context = memorisationContext(actor);
  if (!classItem || !context) {
    ui.notifications.warn("Memorisation: this character's class doesn't need it.");
    return null;
  }

  const tradition = String(actor.system?.magic?.tradition ?? "");
  const pack = contentPack("spells");
  if (!pack) {
    ui.notifications.warn(`Compendium pack "spells" not found.`);
    return null;
  }
  const index = Array.from((await pack.getIndex({
    fields: ["system.tradition", "system.ppCost", "system.specialist", "system.category"]
  })).values());
  const pool = index.filter((entry) =>
    cantripPoolEligible(
      { tradition: entry.system?.tradition, ppCost: entry.system?.ppCost, specialist: entry.system?.specialist },
      { tradition }
    )
  );
  if (!pool.length) {
    ui.notifications.warn("Memorisation: no cantrips in the pack match your tradition.");
    return null;
  }

  const result = await promptPackMemorisation(actor, classItem, {
    poolEntries: pool,
    existingItems: dailyMemorisedCantrips(actor),
    title: `${actor.name} — Prepare Cantrips`,
    icon: "fa-solid fa-wand-magic-sparkles",
    introHtml: `<p class="hint">Select up to <strong>${context.cantripsAllowed}</strong> ${tradition || "tradition"} cantrip(s) — pack-wide regardless of memorisation style. Previously memorised cantrips are highlighted and pre-checked.</p>`,
    target: context.cantripsAllowed
  });
  if (!result) return null;

  const after = memorisationContext(actor);
  await postCard(actor, "Memorisation", [
    line(
      result.added || result.removed
        ? `<strong>${after.cantripsPicked}</strong> of ${after.cantripsAllowed} cantrips memorised — ${result.added} added, ${result.removed} removed.`
        : `<strong>${after.cantripsPicked}</strong> of ${after.cantripsAllowed} cantrips memorised — no change.`
    )
  ]);
  return result;
}

/**
 * Daily Preparation's own memorisation step (uses-workflow.mjs) — a
 * prompt, not a sweep. Returns null for anyone whose class isn't a
 * learned caster (nothing to ask); otherwise asks whether to change
 * today's picks and, only on a yes, opens the same bulk checklists the
 * Magic tab's own buttons use — pre-checked with whatever's already
 * memorised, so "changing" edits a starting point rather than rebuilding
 * from nothing.
 *
 * @returns {Promise<{changed: boolean}|null>}
 */
export async function promptDailyMemorisationChange(actor) {
  const context = memorisationContext(actor);
  if (!context) return null;
  const change = await DialogV2.confirm({
    window: { title: "Daily Preparation — Memorisation" },
    content: "<p>Change your memorised spells for today?</p><p class=\"hint\">Choosing No keeps yesterday's picks exactly as they are — nothing is reset automatically.</p>",
    rejectClose: false
  });
  if (!change) return { changed: false };
  await openMemoriseSpell(actor);
  await openMemoriseCantrip(actor);
  return { changed: true };
}

/** Create the chosen pack spell as today's memorised pick — prepared
 * from the moment it lands, since it only exists because it was
 * chosen for today. */
async function createDailyMemorisedSpell(actor, classItem, itemId) {
  const pack = contentPack("spells");
  const document = await pack?.getDocument(itemId);
  if (!document) return null;
  const data = packItemData(document);
  data.system.prepared = true;
  data.flags = {
    ...data.flags,
    [SYSTEM_ID]: {
      ...data.flags?.[SYSTEM_ID],
      dailyMemorised: true,
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
