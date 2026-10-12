import { weaponUsage } from "./weapon-rune-usage.mjs";
import { applyAllGrants, GRANT_FIELDS } from "./grants-workflow.mjs";
import { deductCurrency, packItemData} from "./items.mjs";
import { promptCustomiseItem } from "./item-customize-workflow.mjs";
import { computeFullCustomisation, pickerDisplayPrice } from "./item-quality.mjs";
import { escapeAttribute, facetOptionsHtml } from "./picker-filters.mjs";
import { prerequisiteNameKey } from "./prerequisites.mjs";
import { contentPack } from "./content-packs.mjs";
import { withSourcebookFacet } from "./sourcebooks.mjs";

const { DialogV2 } = foundry.applications.api;

// pickerDisplayPrice lives in item-quality.mjs — pure price logic, no
// Foundry dependency, alongside computeItemPrice (which it's built on).
// Re-exported here so nothing importing it from this file needs to change.
export { pickerDisplayPrice };

/**
 * Every feat and ability name that exists, normalised for comparison.
 *
 * WHY IT IS NEEDED. A prerequisite clause that names a feat is only
 * safely distinguishable from prose by checking it against the names
 * that actually exist. "Shield Block" is a feat and a real gate;
 * "Underworld" is what a comma split left behind from a longer sentence.
 * Nothing about their SHAPE separates them — only this set does. See
 * module/prerequisites.mjs.
 *
 * ABILITIES AS WELL AS FEATS, because the printed text does not
 * distinguish them: six feats require "Wild Shape" and one requires
 * "Divine Ally", both of which this system stores as ability items.
 * Whether a requirement is a feat or an ability is an implementation
 * detail of this system, not something Chapter 5 knows about.
 *
 * MEMOISED for the session. A pack index is cached by Foundry after the
 * first read, but the Set is rebuilt from it each time otherwise, and
 * this runs on every picker open. Cleared by a compendium refresh, which
 * is the only thing that can change the answer mid-session.
 *
 * @returns {Promise<Set<string>>}
 */
let knownPrerequisiteNameCache = null;
export function clearKnownPrerequisiteNames() {
  knownPrerequisiteNameCache = null;
}
export async function knownPrerequisiteNames() {
  if (knownPrerequisiteNameCache) return knownPrerequisiteNameCache;
  const names = new Set();
  for (const packName of ["feats", "abilities"]) {
    const pack = contentPack(packName);
    if (!pack) continue;
    const index = await pack.getIndex();
    for (const entry of index) names.add(prerequisiteNameKey(entry.name));
  }
  // An empty set means "no opinion" to the gate, which passes everything
  // open — so a world whose packs failed to load behaves exactly as it
  // did before this existed rather than hiding every gated feat.
  knownPrerequisiteNameCache = names;
  return names;
}

/**
 * The full index of a compendium pack, or an empty array if the pack
 * doesn't exist — matches how grants-workflow.mjs treats a missing
 * pack (a warning, not a thrown error). Foundry's default index only
 * carries _id/name/img/type/sort; any field a filter needs to inspect
 * (system.category, system.sourceRace, ...) must be requested
 * explicitly via `fields`, or it's silently undefined on every entry.
 */
async function packIndex(packNames, fields) {
  const names = Array.isArray(packNames) ? packNames : [packNames];
  const out = [];
  for (const packName of names) {
    const pack = contentPack(packName);
    if (!pack) {
      ui.notifications.warn(`Compendium pack "${packName}" not found.`);
      continue;
    }
    const index = await pack.getIndex(fields?.length ? { fields } : undefined);
    // Which pack an entry came from is a fact the picker needs twice:
    // to fetch the document afterwards, and — for the class slot — as
    // the thing the PC/creature filter reads. Two packs can hold two
    // different entries with the same id, so the id alone is not enough
    // to fetch by once a slot spans more than one.
    for (const entry of index) out.push({ ...entry, _pack: packName });
  }
  return out;
}

/**
 * A searchable picker dialog listing every entry in a compendium pack
 * (optionally pre-filtered). Live text search happens client-side
 * against the already-fetched index — no extra pack queries as the
 * player types.
 *
 * @param {string} packName e.g. "feats".
 * @param {object} [options]
 * @param {(entry: object) => boolean} [options.filter] Applied before
 *   display — e.g. only heritages whose sourceRace matches the
 *   actor's current race.
 * @param {string[]} [options.fields] Extra index fields the filter
 *   needs beyond the default _id/name/img/type (e.g.
 *   "system.sourceRace").
 * @param {string} [options.title]
 * @param {string} [options.emptyMessage] Shown when filter excludes
 *   everything, distinct from the pack being empty outright.
 * @param {boolean} [options.purchasable] Shows each entry's price and
 *   offers a Buy button alongside Add, for packs whose items carry a
 *   real cost (weapons, armour, gear, and so on).
 * @param {Array<{key: string, label: string, read: (entry: object) => string}>}
 *   [options.facets] Drop-down filters shown beside the search box.
 *
 *   FILTERS BELONG HERE, on the list you are CHOOSING FROM, not on the
 *   list of what you already own — 3.247.0 put them on the sheet's own
 *   tables and Graham's correction was exact: "I do not want to filter
 *   the gear that is already selected. I want the filters to apply to
 *   the add boxes so that a character can filter what they are picking
 *   from the lists." A character carries six weapons and picks from
 *   seventy-six.
 *
 *   Each facet's options are derived from the entries actually on offer,
 *   so a pack with one category shows no menu for it rather than a menu
 *   with one choice.
 * @returns {Promise<{itemId: string, action: "add"|"buy"}|null>}
 */
/** Quotes and angle brackets, so a facet value cannot break the markup. */
/** "creature-classes|abc123" -> { packName, itemId }. */
function splitPicked(value) {
  const raw = String(value ?? "");
  const bar = raw.indexOf("|");
  return bar < 0
    ? { packName: null, itemId: raw }
    : { packName: raw.slice(0, bar), itemId: raw.slice(bar + 1) };
}


export async function pickFromPack(
  packName,
  { filter, fields, title = "Select", emptyMessage, purchasable = false, facets: slotFacets = [] } = {}
) {
  // THE SOURCEBOOK MENU ON EVERY PICKER (3.628.0; Graham, 7 Oct 2026): added
  // here, where every list a character picks from passes, rather than at
  // each call site. It opens on Core Rulebook and, like any facet, is not
  // shown when everything on offer comes from one book.
  const { sourcebookResolver } = await import("./module-api-workflow.mjs");
  const facets = withSourcebookFacet(slotFacets, sourcebookResolver());
  const facetFields = facets.flatMap((facet) => facet.fields ?? []);
  const indexFields = [
    ...(fields ?? []),
    ...facetFields,
    ...(purchasable ? ["system.price", "system.itemLevel"] : [])
  ];
  const fullIndex = await packIndex(packName, indexFields);
  const entries = (filter ? fullIndex.filter(filter) : fullIndex).sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  if (!entries.length) {
    ui.notifications.warn(
      emptyMessage ?? `No entries available in "${packName}"${filter ? " matching the current filter" : ""}.`
    );
    return null;
  }

  const rows = entries
    .map((entry) => {
      const price = purchasable ? pickerDisplayPrice(entry) : null;
      const priceLabel = purchasable ? `<span class="trg-picker-price">${price} gp</span>` : "";
      const facetData = facets
        .map((facet) => ` data-facet-${facet.key}="${escapeAttribute(facet.read(entry))}"`)
        .join("");
      return `
        <label class="trg-picker-row" data-name="${entry.name.toLowerCase()}" data-price="${price ?? 0}"${facetData}>
          <input type="radio" name="picked" value="${entry._pack}|${entry._id}">
          <img src="${entry.img}" alt="" width="24" height="24">
          <span>${entry.name}</span>
          ${priceLabel}
        </label>`;
    })
    .join("");

  // A facet with nothing to choose between is not offered: a pack whose
  // entries all share one category needs no category menu.
  const facetControls = facets
    .map((facet) => {
      // THE SOURCEBOOK MENU READS THE WHOLE LIST (3.628.2). Graham, 8 Oct:
      // "no filters are appearing on archetype or class feats" — a 1st-level
      // character with no class was offered four core class feats, every
      // book's own feats being gated away, so a menu built from what was on
      // offer had one value and hid itself. A facet that declares
      // `valuesFrom: "all"` takes its values from the pack before the gates:
      // the menu is there whenever the list spans books, and choosing one
      // with nothing for this character says "0 of 4 shown".
      const source = facet.valuesFrom === "all" ? fullIndex : entries;
      const values = Array.from(new Set(
        source.map((entry) => String(facet.read(entry) ?? "").trim()).filter(Boolean)
      )).sort((a, b) => a.localeCompare(b));
      if (values.length < 2) return "";
      // A facet may open on one of its own values rather than on "All".
      // The class slot uses this: an NPC's picker opens on creature
      // classes and a character's on PC classes, with the other set one
      // menu-click away rather than hidden. A default naming a value
      // that is not on offer is ignored rather than showing an empty
      // list — which is what would happen if a pack were missing.
      return `<label class="trg-picker-facet">${facet.label}
        <select class="trg-picker-filter" data-facet="${facet.key}">
          ${facetOptionsHtml(facet, values)}
        </select></label>`;
    })
    .filter(Boolean)
    .join("");

  const buttons = [
    {
      action: "add",
      label: purchasable ? "Add (Free)" : "Add",
      icon: "fa-solid fa-check",
      default: !purchasable,
      callback: (event, button) => {
        const form = button.form ?? button.closest?.("form");
        const checked = form?.querySelector('input[name="picked"]:checked');
        return checked ? { ...splitPicked(checked.value), action: "add" } : null;
      }
    }
  ];
  if (purchasable) {
    buttons.push({
      action: "buy",
      label: "Buy",
      icon: "fa-solid fa-coins",
      default: true,
      callback: (event, button) => {
        const form = button.form ?? button.closest?.("form");
        const checked = form?.querySelector('input[name="picked"]:checked');
        return checked ? { ...splitPicked(checked.value), action: "buy" } : null;
      }
    });
  }
  buttons.push({ action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" });

  const dialogPromise = DialogV2.wait({
    window: { title, icon: "fa-solid fa-magnifying-glass" },
    classes: ["trg-prime", "trg-item-picker"],
    position: { width: purchasable ? 460 : 420, height: 520 },
    content: `
      <div class="trg-prime trg-item-picker-body">
        <input type="text" class="trg-picker-search" placeholder="Search…" autofocus>
        ${facetControls ? `<div class="trg-picker-facets">${facetControls}</div>` : ""}
        <div class="trg-picker-list">${rows}</div>
        <p class="hint trg-picker-count"></p>
      </div>`,
    buttons,
    rejectClose: false
  });

  // Foundry's own convention for post-render behaviour on any
  // Application, DialogV2 included — used here instead of relying on a
  // render callback in the .wait() config, since that surface isn't
  // something to assume without being able to verify it directly.
  Hooks.once("renderDialogV2", (dialogApp) => {
    const root = dialogApp.element;
    const search = root.querySelector(".trg-picker-search");
    const rowEls = root.querySelectorAll(".trg-picker-row");
    if (!search) return;

    // ONE filter, not two. The search box and the facet menus narrow the
    // same list together, so typing "sword" with Simple selected shows
    // the simple swords rather than whichever ran last.
    const facetSelects = Array.from(root.querySelectorAll(".trg-picker-filter"));
    const countLabel = root.querySelector(".trg-picker-count");
    const apply = () => {
      const query = search.value.trim().toLowerCase();
      let shown = 0;
      rowEls.forEach((row) => {
        const matches = row.dataset.name.includes(query)
          && facetSelects.every((select) => {
            const wanted = select.value;
            if (!wanted) return true;
            return String(row.dataset[`facet${
              select.dataset.facet.charAt(0).toUpperCase()}${select.dataset.facet.slice(1)}`] ?? "")
              === wanted;
          });
        row.style.display = matches ? "" : "none";
        if (matches) shown += 1;
      });
      // A filter that hides everything should say so, rather than
      // showing an empty box that reads as a broken dialog.
      if (countLabel) {
        countLabel.textContent = shown === rowEls.length
          ? `${shown} item${shown === 1 ? "" : "s"}`
          : `${shown} of ${rowEls.length} shown`;
      }
      return shown;
    };

    search.addEventListener("input", apply);
    facetSelects.forEach((select) => select.addEventListener("change", apply));
    // NEVER OPEN ON AN EMPTY LIST (3.628.1). Each menu's default is sensible
    // alone, but two together can show nothing: a character's ability
    // picker opens on Kind "Racial", and the Core Rulebook's racial
    // abilities arrive through races, not this list — so Core + Racial was
    // "0 of 300 shown", found live. The Sourcebook menu steps back to All.
    if (apply() === 0) {
      const books = facetSelects.find((select) => select.dataset.facet === "sourcebook");
      if (books?.value) { books.value = ""; apply(); }
    }

    rowEls.forEach((row) => {
      row.addEventListener("dblclick", () => {
        row.querySelector("input").checked = true;
        const defaultAction = purchasable ? "buy" : "add";
        root.querySelector(`[data-action="${defaultAction}"]`)?.click();
      });
    });
  });

  const result = await dialogPromise;
  if (!result || result === "cancel") return null;
  return result;
}

/**
 * The full "Add" action: opens the picker, embeds the chosen item on
 * the actor, and — per how this system's grant resolution already
 * works — immediately applies whatever it grants in the same action,
 * rather than leaving that as a second, separate step. When the
 * player chooses Buy instead of Add, deducts the item's price from
 * the actor's currency first — the item is only created if the
 * purchase actually succeeds.
 *
 * For weapon/armour/shield, a customisation step (Quality/Material/
 * Superior Traits) runs before the item is finalised — cancelling it
 * cancels the whole Add/Buy, and Buy deducts the customised price,
 * not the item's base price.
 *
 * @param {Actor} actor
 * @param {string} packName
 * @param {object} [options] Passed through to pickFromPack, plus:
 * @param {boolean} [options.applyGrants=true]
 * @param {boolean} [options.customisable=false]
 */
export async function addItemFromPicker(actor, packName, options = {}) {
  const { applyGrants = true, customisable = false, ...pickerOptions } = options;
  const picked = await pickFromPack(packName, pickerOptions);
  if (!picked) return null;

  // The entry may have come from any of the packs this slot spans, so
  // the pack to fetch from is the one the picker recorded — not the
  // first one named by the slot.
  const sourcePack = picked.packName ?? (Array.isArray(packName) ? packName[0] : packName);
  const pack = contentPack(sourcePack);
  const document = await pack?.getDocument(picked.itemId);
  if (!document) return null;

  let customisation = null;
  let customisationBase = null;
  if (customisable && ["weapon", "armour", "shield"].includes(document.type)) {
    const baseData = {
      level: document.system?.itemLevel ?? 0,
      price: document.system?.price ?? 0,
      hp: document.system?.hp?.max ?? 0,
      weight: document.system?.weight ?? 0,
      // A shield's size is its category; see computeFullCustomisation.
      category: document.system?.category ?? "",
      // A shield's `metal`, so Dragonhide is refused for a wooden one.
      metal: document.type === "shield" ? Boolean(document.system?.metal) : undefined
    };
    const choice = await promptCustomiseItem(document.type, baseData, {
      title: `Customise ${document.name}`,
      quality: document.system?.quality || "standard",
      material: document.system?.material || "",
      dragonType: document.system?.dragonType || "",
      runes: document.system?.runes || "",
      usage: document.type === "weapon" ? weaponUsage(document.system) : null
    });
    if (!choice) return null;
    customisation = computeFullCustomisation(document.type, baseData, choice);
    customisation.choice = choice;
    customisationBase = {
      level: baseData.level,
      price: baseData.price,
      hp: baseData.hp,
      weight: baseData.weight
    };
  }

  const finalPrice = customisation?.price ?? Number(document.system?.price ?? 0);

  if (picked.action === "buy") {
    const result = deductCurrency(actor.system?.currency, finalPrice);
    if (!result.success) {
      ui.notifications.warn(
        `Not enough currency to buy ${document.name} — short by ${result.shortfallGP} gp.`
      );
      return null;
    }
    await actor.update({ "system.currency": result.purse });
  }

  const data = packItemData(document);
  data.flags = {
    ...data.flags,
    "trg-prime": { ...data.flags?.["trg-prime"], addedFrom: sourcePack }
  };
  // Record where this copy came from. Foundry stamps this itself when an
  // item is dragged out of a compendium, but not when one is built from
  // toObject() like this — so items added through the picker had no link
  // back to their source, and the compendium refresh could only find them
  // by name. A renamed item was then invisible to it.

  if (customisation) {
    data.system.quality = customisation.choice.quality;
    data.system.material = customisation.choice.material;
    data.system.dragonType = customisation.choice.dragonType ?? "";
    data.system.superiorTraits = customisation.choice.traitKeys.join(",");
    // The runes chosen before the item was added — the whole point of
    // asking BEFORE it lands on the sheet, and the half that was missing
    // until 3.241.0.
    data.system.runes = customisation.choice.runes ?? "";
    data.system.itemLevel = customisation.effectiveLevel;
    data.system.price = customisation.price;
    data.system.weight = customisation.weight;
    if (data.system.hp) {
      data.system.hp.max = customisation.hpMax;
      data.system.hp.value = customisation.hpMax;
    }
    // Record what the item was before customisation. The item sheet's own
    // Customise action has always written this; the picker never did, so an
    // item bought pre-customised would treat its already-modified level,
    // price, HP and weight as the base the next time it was customised, and
    // compound them.
    data.flags["trg-prime"].baseCustomisation = customisationBase;
  }

  const [created] = await actor.createEmbeddedDocuments("Item", [data]);

  if (applyGrants && GRANT_FIELDS[created.type]) {
    // QUIET IF THE WATCHER GOT THERE FIRST. `grant-autorun`'s `createItem`
    // hook runs a pass on this same item, so exactly one of the two does
    // the work and the other finds everything already granted. Whichever
    // one grants posts the card; the loser must not post a second one
    // reading "Darkvision already granted by Ascendan — skipped" four
    // times over, which is a card a player learns to dismiss unread.
    //
    // 3.343.1 made this visible rather than causing it: before the door
    // was locked BOTH passes granted, so the player got two cards that
    // both said "Granted:" and a sheet with two of everything.
    await applyAllGrants(actor, created, { quietIfNothingNew: true });
  }

  return created;
}
