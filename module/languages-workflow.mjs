import {
  LANGUAGES,
  allLanguageNames,
  LANGUAGE_GROUPS,
  LANGUAGE_GROUP_LABELS,
  canonicalLanguage,
  languageAllowance,
  languageRarity,
  languageState,
  languagesInGroup,
  parseLanguageList,
  resolveAllowedLanguages
} from "./languages.mjs";
import { FOUNDATION_ITEM_TYPES } from "./config.mjs";

/**
 * The foundations whose language slots are FREE picks rather than 1st-
 * level racial ones (Graham's ruling, 3 August, for backgrounds; extended
 * to origins at 3.250.0 on the same reasoning).
 */
const FREE_LANGUAGE_TYPES = new Set(["background", "origin"]);

/**
 * The Foundry side of languages: reading a character's state off the
 * actor, and the Manage dialog that edits it.
 *
 * Storage is deliberately split. CORE languages are never written to the
 * actor at all — they are derived from the race (and, from 3.194.0, the
 * heritage) every time they're needed, so they cost nothing, can't be
 * edited away by accident, and leave with the item that granted them,
 * exactly like a granted ability. Only the languages the player CHOSE
 * live in `system.identity.languages`, as the comma-separated string
 * every other list-of-names field in this system uses.
 */

const SYSTEM_ID = "trg-prime";
const { DialogV2 } = foundry.applications.api;

/** The GM's campaign regional languages, from the world setting. */
export function regionalLanguages() {
  try {
    return parseLanguageList(game.settings.get(SYSTEM_ID, "regionalLanguages"));
  } catch {
    return [];
  }
}

/**
 * Everything about an actor's languages: core, chosen, allowance and
 * counts, ready for the sheet or the dialog.
 */
export function actorLanguageState(actor) {
  const items = Array.from(actor?.items ?? []);
  const sources = items.filter((i) => FOUNDATION_ITEM_TYPES.includes(i.type));

  const coreGrants = sources.map((item) => ({
    label: item.name,
    languages: item.system?.coreLanguages ?? ""
  }));
  const choiceGrants = sources
    .filter((item) => item.system?.languageChoices)
    .map((item) => ({
      label: item.name,
      spec: item.system.languageChoices,
      // A background's slots are FREE picks, not 1st-level racial ones
      // (Graham's ruling, 3 August) — so they never count against the
      // racial list and are never flagged as off-list. An ORIGIN's are
      // treated the same: that ruling was about a slot the PLAYER chose
      // rather than about the word "background". Flagged in the 3.250.0
      // notes for confirmation.
      scope: FREE_LANGUAGE_TYPES.has(item.type) ? "free" : "racial",
      // ...and genuinely UNRESTRICTED, not merely "every group". The two
      // are not the same: a campaign language the GM hasn't added to the
      // world setting belongs to no group at all, so a Diplomat typing
      // one into the manager's own free-text box was flagged off-list
      // while holding an unspent free slot — against both the item's
      // description and the field's tooltip.
      unrestricted: FREE_LANGUAGE_TYPES.has(item.type)
    }));

  // Every source's additional-language spec, pooled: a heritage that
  // widens the list adds to the race's rather than replacing it — but the
  // RACE's and heritage's lists only. A background's own
  // additionalLanguages widens what may be PICKED, never what counts as a
  // 1st-level racial choice — the same distinction its choice slots
  // already observe, and pooling them here would have quietly stopped the
  // Intelligence slots being policed.
  const specs = sources
    .filter((item) => !FREE_LANGUAGE_TYPES.has(item.type))
    .map((item) => item.system?.additionalLanguages ?? "")
    .filter(Boolean)
    .join(", ");
  const backgroundSpecs = sources
    .filter((item) => FREE_LANGUAGE_TYPES.has(item.type))
    .map((item) => item.system?.additionalLanguages ?? "")
    .filter(Boolean)
    .join(", ");
  const regional = regionalLanguages();
  // The RACE's own list — what a 1st-level pick must come from. Kept
  // apart from the full allowed set, because later picks aren't held to
  // it (Graham's ruling, 2 August).
  const { names: racialNames } = resolveAllowedLanguages(specs, regional);
  const allowedNames = new Set(racialNames);
  for (const name of resolveAllowedLanguages(backgroundSpecs, regional).names) {
    allowedNames.add(name);
  }

  // A race/heritage choice slot may permit groups the race's normal list
  // does not (the Human's regional language), so fold those in too.
  //
  // A BACKGROUND's slot widens what may be PICKED but must not widen the
  // racial list: those are two different questions, and conflating them
  // would have let a Diplomat's two free picks quietly make every
  // language a legal 1st-level racial choice as well.
  for (const grant of choiceGrants) {
    const spec = String(grant.spec ?? "").replace(/^\d+\s+/, "").replace(/\|/g, ", ");
    for (const name of resolveAllowedLanguages(spec, regional).names) {
      allowedNames.add(name);
      if (grant.scope !== "free") racialNames.add(name);
    }
  }

  const featureNames = items
    .filter((i) => ["feat", "ability"].includes(i.type))
    .map((i) => i.name);

  // "…and if you take the Linguist feat, you gain another new language"
  // (Lys-Fod, Chapter 2). Carried on an effect flag rather than matched by
  // name, so any later feature with the same clause works unchanged.
  const linguistBonuses = Array.from(actor?.appliedEffects ?? actor?.effects ?? [])
    .filter((e) => !e.disabled)
    .map((e) => ({
      label: e.parent?.documentName === "Item" ? e.parent.name : e.name,
      count: Number(e.getFlag?.(SYSTEM_ID, "linguistLanguageBonus")) || 0
    }))
    .filter((entry) => entry.count > 0);

  const allowance = languageAllowance({
    intelligence: Number(actor?.system?.attributes?.intelligence?.total ?? 0),
    linguisticsRanks: Number(actor?.system?.skills?.linguistics?.ranks ?? 0),
    featureNames,
    choiceGrants,
    linguistBonuses
  });

  // A source that names its OWN range widens what may be picked. Polyglot
  // Savant's two come "from common languages and uncommon languages",
  // and Language Master's two name no restriction at all — so a Gnome
  // holding either can legitimately take languages its race would never
  // allow. Without this the allowance granted the picks and then the
  // panel flagged every one of them as off-list.
  for (const source of allowance.sources) {
    if (!source.from?.length) {
      // No stated restriction: the grant is unrestricted by its own
      // terms, so every named language is on the table for it.
      if (source.unrestricted) for (const name of allLanguageNames()) allowedNames.add(name);
      continue;
    }
    for (const name of resolveAllowedLanguages(source.from.join(", "), regional).names) {
      allowedNames.add(name);
    }
  }

  const state = languageState({
    coreGrants,
    chosen: actor?.system?.identity?.languages ?? "",
    allowance,
    allowedNames,
    racialNames,
    resolveRange: (groups) => resolveAllowedLanguages(groups.join(", "), regional).names
  });

  // The set every consumer must share. The dialog used to rebuild its
  // own from the race specs alone, which meant the panel and the picker
  // disagreed about the very same language: with Language Master a Dwarf
  // could legitimately take Abyssal, the panel said so, and the picker
  // still tagged it off-list. One computation, handed out.
  state.allowedNames = allowedNames;
  state.racialNames = racialNames;

  // Languages held only until the next daily preparation (Ageless
  // Language). Fluency for a day is not a language learned, so these
  // cost no pick and are listed apart from both core and chosen.
  const known = new Set(state.known.map((n) => n.toLowerCase()));
  state.temporary = [];
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect?.disabled) continue;
    const language = effect?.flags?.[SYSTEM_ID]?.temporaryLanguage;
    if (!language) continue;
    const name = canonicalLanguage(language);
    if (!name || known.has(name.toLowerCase())) continue;
    known.add(name.toLowerCase());
    state.temporary.push({ name, rarity: languageRarity(name), source: effect.name });
  }

  return state;
}

/**
 * Sheet rows: the panel needs chips, a headline count and a tooltip that
 * explains where the allowance came from.
 */
export function languagePanel(actor) {
  const state = actorLanguageState(actor);
  const known = state.core.length + state.chosen.length + (state.temporary?.length ?? 0);
  const breakdown = state.allowance.sources.length
    ? state.allowance.sources.map((s) => `${s.label}: +${s.count}`).join("\n")
    : "No additional languages yet — a positive Intelligence or 5 ranks of Linguistics is the usual first source.";

  const split = state.racialSlots
    ? `${state.racialSlots} from your race's list, ${state.freeSlots} free choice`
    : `${state.freeSlots} free choice`;

  return {
    core: state.core,
    chosen: state.chosen,
    temporary: state.temporary ?? [],
    racialSlots: state.racialSlots,
    freeSlots: state.freeSlots,
    split,
    known,
    spent: state.spent,
    total: state.allowance.total,
    remaining: state.remaining,
    over: state.over,
    unknown: state.unknown,
    // "5 / 7 · 2 left", or "· 1 over" when the GM has been generous.
    headline: `${state.spent} / ${state.allowance.total}`,
    status: state.over
      ? `${state.over} over`
      : state.remaining
        ? `${state.remaining} left to pick`
        : "all picked",
    tooltip:
      `Languages known: ${known}\n\nAllowance (${split}):\n${breakdown}\n\n` +
      "Only the racial slots must come from your race's list — anything earned after 1st level is free choice.",
    hasSurplus: state.remaining > 0
  };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function groupRows(state, regional, racial) {
  const coreNames = new Set(state.core.map((c) => c.name.toLowerCase()));
  const chosenNames = new Set(state.chosen.map((c) => c.name.toLowerCase()));

  return LANGUAGE_GROUPS.map((group) => {
    const names =
      group === "regional"
        ? [
            // The GM's list, plus anything already chosen that isn't in
            // the catalogue — a one-off typed language must still show up
            // as ticked rather than silently vanishing from the dialog.
            ...regional.map(canonicalLanguage),
            ...state.chosen.filter((c) => c.rarity === "regional").map((c) => c.name)
          ].filter((n, i, all) => all.indexOf(n) === i)
        : languagesInGroup(group);

    const rows = names.map((name) => ({
      name,
      speakers: LANGUAGES[name]?.speakers ?? "Regional",
      core: coreNames.has(name.toLowerCase()),
      chosen: chosenNames.has(name.toLowerCase()),
      // Whether the RACE grants it. Shown as a helpful marker, not a
      // prohibition: only 1st-level picks are held to this list.
      racial: racial.has(name)
    }));

    return { group, label: LANGUAGE_GROUP_LABELS[group], rows };
  }).filter((section) => section.rows.length);
}

/**
 * The Manage dialog: every language grouped by rarity, core ones fixed
 * and ticked, the rest selectable.
 *
 * Selections outside the character's allowed set are marked rather than
 * disabled, and going over the allowance warns rather than blocks —
 * Chapter 2 says in as many words that "your GM may allow you to select
 * different languages based upon the campaign", and a picker that made
 * that impossible would be enforcing a rule the book doesn't have.
 */
export async function openLanguageManager(actor) {
  const regional = regionalLanguages();
  const state = actorLanguageState(actor);
  // The same set the panel used — see actorLanguageState. Recomputing it
  // here is what let the two drift apart.
  const sections = groupRows(state, regional, state.racialNames);
  const sectionHTML = sections
    .map(
      (section) => `
      <fieldset class="trg-language-group">
        <legend>${section.label}</legend>
        ${section.rows
          .map((row, index) => {
            // Scoped by group AND index: a GM whose regional list happens
            // to name a catalogue language would otherwise generate the
            // same id twice, and the second label would drive the first
            // checkbox.
            const id = `lang-${section.group}-${index}`;
            const tag = row.core
              ? `<em class="trg-language-tag">core</em>`
              : row.racial
                ? `<em class="trg-language-tag racial">race</em>`
                : "";
            return `
          <div class="trg-inline trg-language-row${row.core ? " is-core" : ""}">
            <input type="checkbox" id="${id}" name="language" value="${escapeHTML(row.name)}"
              ${row.core || row.chosen ? "checked" : ""} ${row.core ? "disabled" : ""}>
            <label for="${id}"><strong>${escapeHTML(row.name)}</strong> <span class="hint">${escapeHTML(row.speakers)}</span> ${tag}</label>
          </div>`;
          })
          .join("")}
      </fieldset>`
    )
    .join("");

  const breakdown = state.allowance.sources
    .map((s) => `<li>${escapeHTML(s.label)} — +${s.count}</li>`)
    .join("");

  const content = `
    <div class="trg-prime trg-language-manager">
      <p class="hint">
        Core languages come from your race and are always known — they cost nothing and can't be unticked.
        Rows marked <em>race</em> are on your race's list.
        Only your 1st-level picks have to come from it; anything earned later is free choice.
      </p>
      <div class="trg-language-summary">
        <strong>${state.spent} / ${state.allowance.total}</strong> picked
        <span class="hint">${state.racialSlots ? `${state.racialSlots} from your race's list, ` : ""}${state.freeSlots} free choice</span>
        ${state.allowance.total ? `<ul>${breakdown}</ul>` : "<p class=\"hint\">No allowance yet.</p>"}
      </div>
      ${sectionHTML}
      <div class="form-group">
        <label for="trg-lang-custom">Add a regional or campaign language</label>
        <input id="trg-lang-custom" type="text" name="custom" placeholder="e.g. Selechian">
        <p class="hint">Anything your GM has allowed that isn't in the tables above.</p>
      </div>
    </div>`;

  const result = await DialogV2.wait({
    window: { title: `${actor.name} — Languages`, icon: "fa-solid fa-comments" },
    classes: ["trg-prime"],
    position: { width: 520, height: 620 },
    content,
    buttons: [
      {
        action: "save",
        label: "Save",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  // A single checkbox posts a string, several post an array; disabled
  // core rows post nothing at all, which is exactly what we want since
  // core languages are never stored.
  const ticked = result.language === undefined ? [] : [result.language].flat().filter(Boolean).map(String);
  const custom = parseLanguageList(result.custom ?? "");
  const coreNames = new Set(state.core.map((c) => c.name.toLowerCase()));

  // Dedupe case-INSENSITIVELY: a catalogue name normalises to one
  // spelling, but a typed regional one doesn't, so "Selechian" and
  // "selechian" would both survive and be stored as two languages.
  const seen = new Set();
  const chosen = [];
  for (const raw of [...ticked, ...custom]) {
    const name = canonicalLanguage(raw);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key) || coreNames.has(key)) continue;
    seen.add(key);
    chosen.push(name);
  }

  await actor.update({ "system.identity.languages": chosen.join(", ") });

  const after = actorLanguageState(actor);
  if (after.over) {
    ui.notifications.warn(
      `${actor.name}: ${after.spent} languages picked against an allowance of ${after.allowance.total} — ${after.over} over. Left as chosen; Chapter 2 allows the GM to grant extras.`
    );
  }
  if (after.unknown.length) {
    ui.notifications.info(
      `${after.unknown.join(", ")} — off your race's list with no free slot left to cover it. Kept; only 1st-level picks are held to the racial list, and a GM may allow others by campaign.`
    );
  }
  return chosen;
}
