/**
 * Client-side row filters for a sheet's spell tables — the Wizard's
 * Spellbook item's own contents list (item-sheet.mjs) and the Magic
 * tab's Spells table (actor-sheet.mjs), both added at Graham's request
 * once the Spell Book's contents list (3.230.4) made a long,
 * un-filterable table a real problem rather than a hypothetical one.
 *
 * Rows are hidden with `style.display`, the same technique the item
 * picker's own live search box already uses (picker-workflow.mjs) —
 * nothing is removed from the DOM, so Foundry's own row bindings
 * (openBookSpell, castSpell, and so on) are untouched.
 *
 * Pure DOM wiring, not sheet state: a re-render always starts from "show
 * everything" and re-reads whatever the `<select>` elements currently
 * hold, which is correct here since Foundry re-renders a sheet's markup
 * wholesale on any data change anyway — there is nothing to preserve
 * that the DOM itself doesn't already hold moment to moment.
 */

/**
 * @param {HTMLElement} root The sheet's rendered element.
 * @param {object} config
 * @param {string} config.rowSelector CSS selector for each filterable row.
 * @param {Array<{select: string, data: string, mode?: "exact"|"list"}>} config.filters
 *   Each entry pairs a `<select>`'s own CSS selector with the row's
 *   matching `data-*` attribute name (without the `data-` prefix). An
 *   empty selected value always matches (the "All ..." option). `mode:
 *   "list"` treats the row's attribute as a comma/whitespace-separated
 *   list and matches if the wanted value is any one of its entries — a
 *   spell's own tradition field is itself a comma list ("arcane,
 *   verdant") when it belongs to more than one tradition, so an exact
 *   string comparison would never match either one. Plain `"exact"` (the
 *   default) is a straight string comparison, right for a single value
 *   like a PP cost.
 */
export function wireSpellListFilters(root, { rowSelector, filters }) {
  if (!root) return;
  const rows = Array.from(root.querySelectorAll(rowSelector));
  if (!rows.length) return;

  const active = filters
    .map((entry) => ({ ...entry, el: root.querySelector(entry.select) }))
    .filter((entry) => entry.el);
  if (!active.length) return;

  const rowMatches = (row, entry) => {
    const wanted = entry.el.value;
    if (!wanted) return true;
    const raw = String(row.dataset[entry.data] ?? "");
    if (entry.mode === "list") {
      return raw
        .split(/[,\s]+/)
        .map((token) => token.trim().toLowerCase())
        .filter(Boolean)
        .includes(wanted.toLowerCase());
    }
    return raw === wanted;
  };

  const apply = () => {
    rows.forEach((row) => {
      row.style.display = active.every((entry) => rowMatches(row, entry)) ? "" : "none";
    });
  };

  active.forEach((entry) => entry.el.addEventListener("change", apply));
  apply();
}

/**
 * The Tradition/PP `<option>` lists for a spell table's filter row,
 * derived from whatever rows the table is actually showing rather than
 * a fixed list — a Spell Book only ever offers the traditions and PP
 * costs actually present in it. A row's own tradition field may itself
 * be a comma list ("arcane, verdant"); each token is offered as its own
 * option, matching wireSpellListFilters' `mode: "list"` membership test.
 *
 * @param {Array<{tradition: string, ppCost: number}>} rows
 * @param {object} traditionLabels TRADITIONS (config.mjs) — used to turn
 *   a known key into its printed label; an unrecognised token (a spell's
 *   free-text tradition, if one ever has one) falls back to itself,
 *   capitalised.
 * @returns {{traditions: Array<{value: string, label: string}>,
 *   pps: number[]}}
 */
export function spellListFilterOptions(rows, traditionLabels = {}) {
  const traditionSet = new Set();
  const ppSet = new Set();
  for (const row of rows ?? []) {
    String(row?.tradition ?? "")
      .split(/[,\s]+/)
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean)
      .forEach((token) => traditionSet.add(token));
    const pp = Number(row?.ppCost);
    if (Number.isFinite(pp)) ppSet.add(pp);
  }
  const traditions = Array.from(traditionSet)
    .sort()
    .map((value) => ({
      value,
      label: traditionLabels[value]?.label ?? (value.charAt(0).toUpperCase() + value.slice(1))
    }));
  const pps = Array.from(ppSet).sort((a, b) => a - b);
  return { traditions, pps };
}


// REMOVED AT 3.248.0: `wireItemListFilters` and `listFilterOptions`.
//
// They filtered the sheet's own tables — the list of what you already
// own — and Graham's correction was that the filter belongs on the list
// you are CHOOSING FROM. The picker has its own facet filtering, over
// its own markup, so these had no caller left.
//
// Deleted rather than kept "in case": a module with no caller is the
// single most repeated defect in this project's history, and leaving two
// exported functions here to be tested by a harness and used by nothing
// is how that starts.
