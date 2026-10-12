/**
 * The magic item builders, as dialogs (Chapter 11).
 *
 * Four constructions, one shape: choose what the item does, watch its
 * level and price settle as you choose, name it, and it lands on the
 * character — with the option of saving it into a world compendium so
 * it can be handed out again.
 *
 * WHY A LIVE PREVIEW AND NOT A FORM YOU SUBMIT. Every one of these
 * rules is a chain — a wondrous ability's adjustments change its level,
 * which changes its price, which changes the item's level. A builder
 * that only tells you the answer after you commit is a calculator you
 * cannot use to make a decision, and deciding is the whole activity.
 *
 * The arithmetic lives in magic-item-builder.mjs and is not repeated
 * here; this file is dialogs, the compendium write, and the card.
 */

import {
  AMMUNITION_BATCH, BUILDER_KINDS, CONSUMABLE_KINDS, buildAmmunition,
  CUSTOM_PACK_LABEL, buildCharged, buildConsumable, buildWondrous, builtItemData,
  baseRoundProperties, findCustomPack, toWondrousAbilities
} from "./magic-item-builder.mjs";
import { SKILLS } from "./config.mjs";
import { WONDROUS_ADJUSTMENTS, WONDROUS_MODIFIERS } from "./wondrous.mjs";
import { promptCustomiseItem } from "./item-customize-workflow.mjs";
// The same chooser the cast dialog offers, so a spell's warping options read
// identically at the workbench and at the table (3.310.0).
import { aggregateWarpSelection, buildWarpChooser } from "./magic/spell-warp.mjs";
import { contentPack } from "./content-packs.mjs";
import { SPELL_SCHOOLS } from "./data/spell-tables.mjs";

// This system has no shared chat module — every workflow that posts a
// card carries this pair. Copied rather than invented: importing from a
// "./chat.mjs" that does not exist is what shipped in 3.248.0, and the
// whole builder failed to load because of it.
function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

const { DialogV2 } = foundry.applications.api;
const SYSTEM_ID = "trg-prime";

/**
 * The world compendium built items are offered a home in.
 *
 * FOUND BY ITS LABEL, NOT BY AN ASSUMED ID. Foundry derives a world
 * pack's id from the label it is created with — "Custom Magic Items"
 * becomes `world.custom-magic-items`, not the `world.trg-...` this file
 * first guessed. The guess meant the pack was never found on the second
 * save, so the code tried to create it again and THREW: "The Compendium
 * pack custom-magic-items already exists in the World and cannot be
 * created." Found by live testing at 3.248.1, on the second item saved.
 */


/** A readable label for each ability kind the cost table prices. */
const ABILITY_LABELS = Object.freeze({
  spell: "Spell (by PP)",
  baseDR: "Base DR",
  drBonus: "DR bonus",
  dbBonus: "DB bonus",
  energyResistance: "Energy resistance",
  physicalResistance: "Physical resistance",
  saveBonus: "Saving throw bonus",
  skillBonus: "Skill bonus",
  spellAdder: "Spell Adder",
  stat: "Ability score bonus"
});

/**
 * What each ability kind needs naming: WHICH ability score, WHICH skill,
 * WHICH save. The cost table prices "a skill bonus" and a sheet needs to
 * know which skill, or the built item is priced correctly and does
 * nothing.
 */
const ABILITY_SUBJECTS = Object.freeze({
  stat: ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"],
  skillBonus: Object.keys(SKILLS),
  // "all" (3.617.0, B17 of block 37): one bonus to every save.
  saveBonus: ["fortitude", "reflex", "will", "all"],
  energyResistance: ["acid", "cold", "electricity", "fire", "sonic"],
  physicalResistance: ["bludgeoning", "piercing", "slashing"]
});

const esc = (text) => String(text ?? "")
  .replace(/&/g, "&amp;").replace(/"/g, "&quot;")
  .replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Which builder? Asked first, because the four have nothing in common
 * beyond producing an item.
 */
export async function chooseBuilder() {
  const buttons = Object.entries(BUILDER_KINDS).map(([key, kind]) => ({
    action: key, label: kind.label, icon: kind.icon
  }));
  buttons.push({ action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" });
  const chosen = await DialogV2.wait({
    window: { title: "Build a Magic Item", icon: "fa-solid fa-hammer" },
    classes: ["trg-prime", "trg-builder-choice"],
    content: `<div class="trg-prime trg-builder-body">
      <p class="hint">Chapter 11's construction rules. Choose what you are making.</p>
      ${Object.values(BUILDER_KINDS)
    .map((kind) => `<p class="hint"><strong>${kind.label}</strong> — ${kind.hint}</p>`)
    .join("")}
    </div>`,
    buttons,
    rejectClose: false
  });
  return !chosen || chosen === "cancel" ? null : chosen;
}

/** The entry point the sheet's button calls. */
export async function buildMagicItem(actor) {
  const kind = await chooseBuilder();
  if (!kind) return null;

  const built = kind === "wondrous" ? await buildWondrousDialog()
    : kind === "charged" ? await buildChargedDialog()
      : kind === "consumable" ? await buildConsumableDialog()
        : await buildAmmunitionDialog();
  if (!built) return null;

  const data = builtItemData(kind, built.name, built.result, built.extra);
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  if (!created) return null;

  await postCard(actor, `${created.name} — Built`, [
    line(`<strong>${BUILDER_KINDS[kind].label}</strong>, level <strong>${built.result.level}</strong>, <strong>${built.result.price} gp</strong>.`),
    ...built.lines.map((text) => line(text)),
    ...(built.result.problems ?? []).map((problem) =>
      line(`<em><i class="fa-solid fa-triangle-exclamation"></i> ${esc(problem)}</em>`))
  ]);

  await offerToSave(created);
  return created;
}

/**
 * Offer to keep it.
 *
 * Graham's ruling: onto the character, and offer to save. A built item
 * that only exists on one sheet cannot be handed to the rest of the
 * party, and re-building it from memory is the thing this whole feature
 * exists to stop.
 */
export async function offerToSave(item) {
  const save = await DialogV2.confirm({
    window: { title: `${item.name} — Save to Compendium?` },
    content: `<p>Save <strong>${esc(item.name)}</strong> to the <em>${CUSTOM_PACK_LABEL}</em> compendium, so it can be given to someone else later?</p>`,
    rejectClose: false
  });
  if (!save) return null;
  const pack = await customPack();
  if (!pack) return null;
  const data = item.toObject();
  delete data._id;
  try {
    const saved = await Item.create(data, { pack: pack.collection });
    if (saved) ui.notifications.info(`${item.name} saved to ${CUSTOM_PACK_LABEL}.`);
    return saved;
  } catch (error) {
    // Reported, not thrown: the item is already on the character, and
    // losing that to a failed compendium write would be a poor trade.
    console.warn("TRG Prime | could not save the built item", error);
    ui.notifications.warn(`${item.name} could not be saved: ${error.message}`);
    return null;
  }
}

/** The world compendium, created on first use rather than up front. */
async function customPack() {
  const existing = findCustomPack(game.packs);
  if (existing) {
    if (existing.locked) await existing.configure({ locked: false });
    return existing;
  }
  if (!game.user.isGM) {
    ui.notifications.warn(
      `Only a GM can create the ${CUSTOM_PACK_LABEL} compendium. Ask your GM to build one item first.`);
    return null;
  }
  try {
    return await foundry.documents.collections.CompendiumCollection.createCompendium({
      label: CUSTOM_PACK_LABEL,
      type: "Item",
      packageType: "world"
    });
  } catch (error) {
    // Creating a pack that already exists throws rather than returning
    // it, so a race — or a pack this search somehow missed — must not
    // take the whole save down with it.
    console.warn("TRG Prime | could not create the custom item compendium", error);
    ui.notifications.warn(
      `Could not create the ${CUSTOM_PACK_LABEL} compendium: ${error.message}`);
    return findCustomPack(game.packs);
  }
}


/**
 * The live preview every builder shares.
 *
 * Reads the dialog, runs the real construction rule, and writes the
 * level, price and problems back — so what you are looking at is the
 * item you would get, not an estimate of it. Bound to `input` as well as
 * `change` so a typed number updates as it is typed.
 */
function wireBuilderPreview(compute) {
  Hooks.once("renderDialogV2", (dialogApp) => {
    const root = dialogApp.element;
    const levelLabel = root.querySelector(".trg-builder-level");
    if (!levelLabel) return;
    const priceLabel = root.querySelector(".trg-builder-price");
    const ppLabel = root.querySelector(".trg-builder-pp");
    const problemsBox = root.querySelector(".trg-builder-problems");

    const refresh = () => {
      const preview = compute(root);
      if (!preview) return;
      levelLabel.textContent = String(preview.level ?? 0);
      if (priceLabel) priceLabel.textContent = `${preview.price ?? 0} gp`;
      if (ppLabel) ppLabel.textContent = String(preview.maximumPP ?? 0);
      if (problemsBox) {
        problemsBox.innerHTML = (preview.problems ?? [])
          .map((problem) => `<p class="hint"><i class="fa-solid fa-triangle-exclamation"></i> ${esc(problem)}</p>`)
          .join("");
      }
      // Each wondrous ability shows its own price, because the whole
      // skill of building one is seeing which ability is expensive.
      for (const row of root.querySelectorAll(".trg-builder-ability")) {
        const cell = row.querySelector(".trg-ability-price");
        if (!cell) continue;
        const index = Number(row.dataset.index);
        const priced = (preview.abilities ?? [])[index];
        cell.textContent = row.querySelector(".trg-ability-kind").value && priced
          ? `L${priced.level} · ${priced.price} gp`
          : "—";
      }
    };

    // A subject menu shows only what its row's kind can take — offering
    // "stealth" for a Base DR is a menu that teaches the wrong rule.
    for (const row of root.querySelectorAll(".trg-builder-ability")) {
      const kindSelect = row.querySelector(".trg-ability-kind");
      const subjectSelect = row.querySelector(".trg-ability-subject");
      if (!kindSelect || !subjectSelect) continue;
      const narrow = () => {
        const kind = kindSelect.value;
        let usable = 0;
        for (const option of subjectSelect.options) {
          if (!option.value) continue;
          const fits = option.dataset.kind === kind;
          option.hidden = !fits;
          option.disabled = !fits;
          if (fits) usable += 1;
        }
        if (subjectSelect.selectedOptions[0]?.disabled) subjectSelect.value = "";
        subjectSelect.disabled = usable === 0;
        // The frequency is a spell's alone (3.617.0, B17).
        const frequency = row.querySelector(".trg-ability-frequency");
        if (frequency) {
          frequency.disabled = kind !== "spell";
          frequency.hidden = kind !== "spell";
        }
      };
      kindSelect.addEventListener("change", narrow);
      narrow();
    }

    root.querySelectorAll("input, select").forEach((control) => {
      control.addEventListener("change", refresh);
      control.addEventListener("input", refresh);
    });
    refresh();
  });
}

/* ------------------------------------------------------------------ */
/* WONDROUS                                                            */
/* ------------------------------------------------------------------ */

async function buildWondrousDialog() {
  // One row per ability, added and removed live. Five is a generous
  // ceiling for anything in the chapter and keeps the dialog readable.
  const MAX_ABILITIES = 5;
  const kindOptions = Object.keys(WONDROUS_MODIFIERS)
    .map((key) => `<option value="${key}">${ABILITY_LABELS[key] ?? key}</option>`).join("");
  // A SPELL IS PICKED, NOT TYPED (3.617.0, B17 of block 37; Graham's R18):
  // its PP sets the row's value and its frequency the surcharge, and the
  // built item grants it as the book's spell items do.
  const spellOptions = (await spellChoices())
    .map((spell) => `<option value="${esc(spell.name)}" data-kind="spell" data-pp="${spell.pp}">${esc(spell.name)} (PP ${spell.pp})</option>`)
    .join("");
  const frequencyOptions = [["daily", "1/day"], ["thrice", "3/day (+1)"], ["atWill", "At will (+2)"], ["constant", "Constant (+4)"]]
    .map(([key, label]) => `<option value="${key}">${label}</option>`).join("");

  const rows = Array.from({ length: MAX_ABILITIES }, (unused, index) => `
    <div class="trg-builder-ability" data-index="${index}">
      <select class="trg-ability-kind"><option value="">—</option>${kindOptions}</select>
      <input type="number" class="trg-ability-value" value="1" min="0" step="1">
      <select class="trg-ability-subject"><option value="">—</option>${
  Object.entries(ABILITY_SUBJECTS).flatMap(([kind, subjects]) =>
    subjects.map((subject) =>
      `<option value="${subject}" data-kind="${kind}">${subject}</option>`)).join("")}${spellOptions}</select>
      <select class="trg-ability-frequency" title="How often the spell may be cast">${frequencyOptions}</select>
      <select class="trg-ability-adjustments" multiple size="3">
        ${WONDROUS_ADJUSTMENTS.map((adjustment) =>
    `<option value="${adjustment.key}" data-kinds="${(adjustment.kinds ?? []).join(",")}" title="${esc(adjustment.text)}">${
      adjustment.key} (${adjustment.levels > 0 ? "+" : ""}${adjustment.levels})</option>`).join("")}
      </select>
      <span class="trg-ability-price">—</span>
    </div>`).join("");

  wireBuilderPreview((root) => {
    // Indexed by ROW, not by chosen ability, so the price shown beside
    // row three is row three's — filtering first shifts every price up
    // by however many rows above it are empty.
    const rows = Array.from(root.querySelectorAll(".trg-builder-ability"));
    const chosen = readAbilityRows(root);
    const built = buildWondrous(chosen);
    const byRow = [];
    let taken = 0;
    for (const row of rows) {
      byRow.push(row.querySelector(".trg-ability-kind").value ? built.abilities[taken++] : null);
    }
    return { ...built, abilities: byRow };
  });

  const result = await DialogV2.wait({
    window: { title: "Build a Wondrous Item", icon: "fa-solid fa-gem", resizable: true },
    classes: ["trg-prime", "trg-builder"],
    position: { width: 620, height: 620 },
    content: `<div class="trg-prime trg-builder-body">
      <div class="form-group"><label>Name</label>
        <input type="text" class="trg-builder-name" value="Wondrous Item"></div>
      <div class="form-group"><label>Slot</label>
        <input type="text" class="trg-builder-slot" placeholder="waist, neck, ring…"></div>
      <p class="hint">Add up what it does. Each ability is priced from the cost table, and its adjustments move its level before it is priced.</p>
      <div class="trg-builder-abilities">${rows}</div>
      <div class="trg-customise-summary">
        <div><span>Level</span> <strong class="trg-builder-level">0</strong></div>
        <div><span>Price</span> <strong class="trg-builder-price">0 gp</strong></div>
      </div>
      <div class="trg-builder-problems"></div>
    </div>`,
    buttons: [
      { action: "build", label: "Build", icon: "fa-solid fa-hammer", default: true,
        callback: (event, button) => readWondrous(button.form ?? button.closest("form")) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel" || !result.abilities.length) return null;

  const name = result.name || "Wondrous Item";
  const built = buildWondrous(result.abilities);
  // The PRICED abilities are what the chapter's table produced; the
  // STORED ones carry a target as well, so the item actually does
  // something once it is invested.
  built.abilities = toWondrousAbilities(result.abilities, name);
  return {
    name,
    result: built,
    extra: { slot: result.slot, traits: "Invested" },
    lines: result.abilities.map((ability, index) => {
      const priced = buildWondrous(result.abilities).abilities[index];
      return `${ABILITY_LABELS[ability.kind] ?? ability.kind}${
        ability.subject ? ` (${ability.subject})` : ""} ${ability.value} — level ${priced?.level ?? 0}, ${priced?.price ?? 0} gp`;
    })
  };
}

function readWondrous(root) {
  return {
    name: root.querySelector(".trg-builder-name")?.value?.trim() ?? "",
    slot: root.querySelector(".trg-builder-slot")?.value?.trim() ?? "",
    abilities: readAbilityRows(root)
  };
}

function readAbilityRows(root) {
  return Array.from(root.querySelectorAll(".trg-builder-ability"))
    .map((row) => {
      const kind = row.querySelector(".trg-ability-kind").value;
      const subjectSelect = row.querySelector(".trg-ability-subject");
      const picked = subjectSelect?.selectedOptions?.[0] ?? null;
      const read = {
        kind,
        value: Number(row.querySelector(".trg-ability-value").value) || 0,
        subject: subjectSelect?.value ?? "",
        adjustments: Array.from(row.querySelector(".trg-ability-adjustments").selectedOptions)
          .map((option) => option.value)
      };
      // A picked spell's PP IS the row's value; its frequency is priced (R18).
      if (kind === "spell") {
        if (picked?.dataset?.pp !== undefined && read.subject) read.value = Number(picked.dataset.pp) || 0;
        read.frequency = row.querySelector(".trg-ability-frequency")?.value || "daily";
      }
      return read;
    })
    .filter((ability) => ability.kind);
}

/* ------------------------------------------------------------------ */
/* CHARGED                                                             */
/* ------------------------------------------------------------------ */

async function buildChargedDialog() {
  const spells = await spellChoices();
  const spellOptions = spells
    .map((spell) => `<option value="${esc(spell.name)}" data-pp="${spell.pp}" data-id="${esc(spell.id)}" data-uuid="${esc(spell.uuid)}" data-school="${esc(spell.school)}">${esc(spell.name)} (PP ${spell.pp})</option>`)
    .join("");

  wireBuilderPreview((root) => {
    const read = readCharged(root);
    return buildCharged(read.kind, { spells: read.spells, flexible: read.flexible });
  });
  wireChargedWarps();

  const result = await DialogV2.wait({
    window: { title: "Build a Charged Item", icon: "fa-solid fa-wand-sparkles", resizable: true },
    classes: ["trg-prime", "trg-builder"],
    position: { width: 620, height: 720 },
    content: `<div class="trg-prime trg-builder-body">
      <div class="form-group"><label>Name</label>
        <input type="text" class="trg-builder-name" value="Wand"></div>
      <div class="form-group"><label>Kind</label>
        <select class="trg-builder-charged-kind">
          <option value="wand">Wand — one spell, PP + 1</option>
          <option value="staff">Staff — two levels above its highest spell</option>
          <option value="rod">Rod — the total PP of what it does</option>
          <option value="other">Other — each spell twice at base cost; its highest spell's PP + 1</option>
        </select></div>
      <label class="trg-builder-check"><input type="checkbox" class="trg-builder-flexible"> Flexible (a wand's spell may be cast at any warp) — one level dearer</label>
      <div class="form-group stacked trg-builder-spell-field">
        <label>Spells <span class="hint">(ctrl-click for several)</span></label>
        <input type="search" class="trg-builder-spell-filter" placeholder="Filter by name or school…" autocomplete="off">
        <select class="trg-builder-spells" multiple size="14">${spellOptions}</select>
      </div>
      <div class="trg-builder-warps">
        <p class="hint trg-builder-warps-empty">Choose a spell to set the warp it is built with.</p>
      </div>
      <div class="trg-customise-summary">
        <div><span>Level</span> <strong class="trg-builder-level">0</strong></div>
        <div><span>PP</span> <strong class="trg-builder-pp">0</strong></div>
        <div><span>Price</span> <strong class="trg-builder-price">0 gp</strong></div>
      </div>
      <div class="trg-builder-problems"></div>
    </div>`,
    buttons: [
      { action: "build", label: "Build", icon: "fa-solid fa-hammer", default: true,
        callback: (event, button) => readCharged(button.form ?? button.closest("form")) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel" || !result.spells.length) return null;

  const built = buildCharged(result.kind, { spells: result.spells, flexible: result.flexible });
  return {
    name: result.name || BUILDER_KINDS.charged.label,
    result: built,
    extra: {
      chargedKind: result.kind,
      flexible: result.flexible,
      // `pp` IS THE WARPED COST, and that is the whole point of storing
      // `basePP` beside it. "When first created the spell in a wand must be
      // warped to the amount of PP that it will be cast with and this
      // amount of PP can never change" — so the cost the item is built,
      // priced, powered and cast at is the warped one, and the printed
      // cost is kept only so a card can say what it was warped FROM.
      spells: result.spells.map((spell) => ({
        name: spell.name,
        uuid: spell.uuid,
        pp: spell.pp,
        basePP: spell.basePP,
        warp: spell.warp
      })),
      traits: "Invested",
      // ONE HAND, STAFF INCLUDED (3.616.0, O1): "Usage held in 1 hand" is
      // printed for rods, staves and wands alike, and Graham ruled it so.
      heldHands: 1
    },
    lines: [
      `Holds <strong>${built.maximumPP} PP</strong>, regaining ${built.recharge}/day while invested.`,
      `Spells: ${result.spells.map((spell) => spell.warp
        ? `${spell.name} (${spell.basePP} warped to ${spell.pp})`
        : `${spell.name} (${spell.pp})`).join(", ")}`
    ]
  };
}

/**
 * The warp panel: one row per chosen spell, and a chooser behind each.
 *
 * WHY THIS EXISTS. Graham, 14 Aug 2026: "there is no way to warp the
 * spell that is being placed in it (so a wand of cure could be built to
 * cast cure as a 4 PP spell for example)." The rule was already written
 * down in charged-items.mjs and had been for two versions — "the spell in
 * a wand must be warped to the amount of PP that it will be cast with and
 * this amount of PP can never change" — and the builder gave no way to
 * express it, so a wand of a 2 PP spell warped to 6 was unbuildable.
 *
 * It reuses `buildWarpChooser`/`aggregateWarpSelection` rather than
 * restating the options, so a spell's warps read the same at the
 * workbench as at the table, and a spell that gains an option gains it in
 * both places at once. The chooser emits its own `.trg-check-dialog`
 * wrapper, which is what styles it — the builder's classes do not reach
 * it.
 *
 * THE STATE LIVES IN THE DOM, in a hidden input per row, because
 * `readCharged` is handed nothing but the form element and every other
 * field in this dialog is read the same way.
 */
function wireChargedWarps() {
  Hooks.once("renderDialogV2", (dialogApp) => {
    const root = dialogApp.element;
    const select = root.querySelector(".trg-builder-spells");
    const panel = root.querySelector(".trg-builder-warps");
    if (!select || !panel) return;

    const filter = root.querySelector(".trg-builder-spell-filter");
    if (filter) {
      // Hiding an option does NOT deselect it, so a filtered-away spell
      // stays part of the item — which is what someone who ticked it and
      // then searched for a second one means.
      filter.addEventListener("input", () => {
        const needle = filter.value.trim().toLowerCase();
        for (const option of select.options) {
          option.hidden = needle
            ? !`${option.value} ${option.dataset.school ?? ""}`.toLowerCase().includes(needle)
            : false;
        }
      });
    }

    const render = () => {
      const chosen = Array.from(select.selectedOptions);
      // What is already set, kept across a re-render so choosing a second
      // spell does not wipe the first one's warp.
      const existing = new Map(
        Array.from(panel.querySelectorAll(".trg-builder-warp-row"))
          .map((row) => [row.dataset.spell, row.querySelector(".trg-warp-data")?.value ?? ""])
      );
      if (!chosen.length) {
        panel.innerHTML = '<p class="hint trg-builder-warps-empty">Choose a spell to set the warp it is built with.</p>';
        return;
      }
      panel.innerHTML = `<p class="hint">Built-in warping. A wand's cost is fixed here and can never change at the table; a staff may still warp from its own pool on top.</p>` +
        chosen.map((option) => {
          const stored = existing.get(option.value) ?? "";
          let warp = null;
          try { warp = stored ? JSON.parse(stored) : null; } catch (_e) { warp = null; }
          const basePP = Number(option.dataset.pp) || 0;
          const total = basePP + (warp?.ppSpent ?? 0);
          return `<div class="trg-builder-warp-row" data-spell="${esc(option.value)}" data-id="${esc(option.dataset.id ?? "")}" data-pp="${basePP}">
            <span class="trg-warp-name">${esc(option.value)}</span>
            <span class="trg-warp-cost">${warp?.ppSpent ? `${basePP} → <strong>${total} PP</strong>` : `<strong>${basePP} PP</strong>`}</span>
            <button type="button" class="trg-warp-edit"><i class="fa-solid fa-wand-magic-sparkles"></i> ${warp?.ppSpent ? "Change" : "Warp"}…</button>
            <input type="hidden" class="trg-warp-data" value="${esc(stored)}">
            <small class="trg-warp-notes">${warp?.notes?.length ? esc(warp.notes.join("; ")) : "—"}</small>
          </div>`;
        }).join("");
    };

    panel.addEventListener("click", async (event) => {
      const button = event.target.closest(".trg-warp-edit");
      if (!button) return;
      event.preventDefault();
      const row = button.closest(".trg-builder-warp-row");
      const warps = await spellWarpOptions(row.dataset.id);
      const basePP = Number(row.dataset.pp) || 0;
      const form = await DialogV2.prompt({
        window: { title: `${row.dataset.spell} — Warp it into the item` },
        classes: ["trg-prime", "trg-check-dialog"],
        position: { width: 480 },
        content: buildWarpChooser({ name: row.dataset.spell, system: { warps } }, basePP),
        ok: {
          label: "Set",
          callback: (e, okButton) =>
            new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
              okButton.form
            ).object
        },
        rejectClose: false
      });
      if (form === null || form === undefined) return;
      const aggregate = aggregateWarpSelection(warps, form);
      const field = row.querySelector(".trg-warp-data");
      // The FORM is stored, not just the aggregate: `aggregateWarpSelection`
      // re-derives the mods from it at cast time, so a spell whose warp text
      // is corrected later corrects itself in every item already built
      // around it.
      field.value = aggregate.ppSpent
        ? JSON.stringify({ form, ppSpent: aggregate.ppSpent, notes: aggregate.notes })
        : "";
      render();
      // The summary is wired to the controls, not to this panel, so the
      // price and level are refreshed by telling the control it changed.
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    select.addEventListener("change", render);
    render();
  });
}

function readCharged(root) {
  const chosen = Array.from(root.querySelector(".trg-builder-spells").selectedOptions);
  const warps = new Map(
    Array.from(root.querySelectorAll(".trg-builder-warp-row")).map((row) => {
      let parsed = null;
      try {
        const raw = row.querySelector(".trg-warp-data")?.value ?? "";
        parsed = raw ? JSON.parse(raw) : null;
      } catch (_e) {
        parsed = null;
      }
      return [row.dataset.spell, parsed];
    })
  );
  return {
    name: root.querySelector(".trg-builder-name")?.value?.trim() ?? "",
    kind: root.querySelector(".trg-builder-charged-kind").value,
    flexible: root.querySelector(".trg-builder-flexible").checked,
    spells: chosen.map((option) => {
      const basePP = Number(option.dataset.pp) || 0;
      const warp = warps.get(option.value) ?? null;
      return {
        name: option.value,
        uuid: option.dataset.uuid ?? "",
        // The item is built, priced and powered from the WARPED cost.
        pp: basePP + (warp?.ppSpent ?? 0),
        basePP,
        warp,
        school: option.dataset.school ?? ""
      };
    })
  };
}

/* ------------------------------------------------------------------ */
/* CONSUMABLE                                                          */
/* ------------------------------------------------------------------ */

async function buildConsumableDialog() {
  const spells = await spellChoices();
  const spellOptions = spells
    .map((spell) => `<option value="${esc(spell.name)}" data-pp="${spell.pp}" data-uuid="${esc(spell.uuid)}">${esc(spell.name)} (PP ${spell.pp})</option>`)
    .join("");

  wireBuilderPreview((root) => {
    const read = readConsumable(root);
    return buildConsumable(read.kind, { spell: read.spell });
  });

  const result = await DialogV2.wait({
    window: { title: "Build a Consumable", icon: "fa-solid fa-flask", resizable: true },
    classes: ["trg-prime", "trg-builder"],
    position: { width: 520, height: 460 },
    content: `<div class="trg-prime trg-builder-body">
      <div class="form-group"><label>Name</label>
        <input type="text" class="trg-builder-name" value="Potion"></div>
      <div class="form-group"><label>Kind</label>
        <select class="trg-builder-consumable-kind">
          ${Object.entries(CONSUMABLE_KINDS)
    .map(([key, entry]) => `<option value="${key}"${key === "potion" ? " selected" : ""}>${entry.label}</option>`)
    .join("")}
        </select></div>
      <div class="form-group"><label>Spell</label>
        <select class="trg-builder-spell"><option value="">—</option>${spellOptions}</select></div>
      <p class="hint">"A consumable has a level equal to the PP of the spell it creates." Scrolls are priced from their own, cheaper column.</p>
      <div class="trg-customise-summary">
        <div><span>Level</span> <strong class="trg-builder-level">0</strong></div>
        <div><span>Price</span> <strong class="trg-builder-price">0 gp</strong></div>
      </div>
      <div class="trg-builder-problems"></div>
    </div>`,
    buttons: [
      { action: "build", label: "Build", icon: "fa-solid fa-hammer", default: true,
        callback: (event, button) => readConsumable(button.form ?? button.closest("form")) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel" || !result.spell) return null;

  const built = buildConsumable(result.kind, { spell: result.spell });
  return {
    name: result.name || CONSUMABLE_KINDS[result.kind].label,
    result: built,
    extra: {
      consumableKind: result.kind,
      traits: "Consumable, Magical",
      // THE KIND'S OWN ACTIVATION (3.617.0, A2) — see CONSUMABLE_KINDS.
      activation: CONSUMABLE_KINDS[result.kind]?.activation ?? "Interact (2 AP)",
      heldHands: CONSUMABLE_KINDS[result.kind]?.hands ?? 1,
      description: `Creates the effect of ${result.spell.name} (PP ${result.spell.pp}).`,
      consumableSpell: {
        name: result.spell.name,
        uuid: result.spell.uuid ?? "",
        pp: result.spell.pp
      }
    },
    lines: [
      `Carries <strong>${result.spell.name}</strong> at PP ${result.spell.pp}.`,
      `${CONSUMABLE_KINDS[result.kind]?.label ?? "It"} — use it from the Inventory tab; ${result.kind === "scroll" ? "reading it takes a check" : "no check is needed"}.`
    ]
  };
}

function readConsumable(root) {
  const option = root.querySelector(".trg-builder-spell").selectedOptions[0];
  return {
    name: root.querySelector(".trg-builder-name")?.value?.trim() ?? "",
    kind: root.querySelector(".trg-builder-consumable-kind").value,
    // The UUID rides along from 3.310.0: the finished item keeps a
    // reference to its spell, not a sentence describing it, so that using
    // the thing can find the spell again.
    spell: option?.value
      ? {
        name: option.value,
        pp: Number(option.dataset.pp) || 0,
        uuid: option.dataset.uuid ?? ""
      }
      : null
  };
}

/* ------------------------------------------------------------------ */
/* AMMUNITION                                                          */
/* ------------------------------------------------------------------ */

async function buildAmmunitionDialog() {
  const pack = contentPack("ammunition");
  // `weight` and `batchSize` join the index from 3.311.0. Without them a
  // built batch was created weighing NOTHING — `builtItemData` reads
  // `extra.weight ?? 0` and nothing ever passed one — and with no
  // `batchSize` it fell back to the schema default of 1, so any weight it
  // did have would have been multiplied by the batch as well.
  // `quantity` joins them at 3.552.7 for the same reason: the option row
  // prints "— 2 gp for ${quantity}" and falls back to it when an entry has
  // no batchSize, and an undeclared index field is `undefined`, so every
  // ammunition read as a batch of ONE however many the pack ships.
  const index = pack ? await pack.getIndex({ fields: ["system.price", "system.weight", "system.batchSize", "system.compatibleWeaponGroup", "system.damage", "system.quantity"] }) : [];
  const base = Array.from(index.values ? index.values() : index)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!base.length) {
    ui.notifications.warn("No ammunition in the compendium to enchant.");
    return null;
  }

  const chosenBase = await DialogV2.wait({
    window: { title: "Magical Ammunition — Base", icon: "fa-solid fa-bullseye" },
    classes: ["trg-prime", "trg-builder"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-builder-body">
      <p class="hint">Weapon runes are applied to a batch of <strong>${AMMUNITION_BATCH}</strong>. Choose the ammunition first, then its runes.</p>
      <div class="form-group"><label>Ammunition</label>
        <select class="trg-builder-ammo">${base.map((entry) =>
    `<option value="${entry._id}" data-price="${entry.system?.price ?? 0}" data-quantity="${
  entry.system?.quantity ?? 1}" data-weight="${entry.system?.weight ?? 0}" data-batch="${
  entry.system?.batchSize ?? entry.system?.quantity ?? 1}">${esc(entry.name)} — ${entry.system?.price ?? 0} gp for ${
  entry.system?.quantity ?? 1}</option>`).join("")}</select></div>
    </div>`,
    buttons: [
      { action: "next", label: "Choose Runes", icon: "fa-solid fa-arrow-right", default: true,
        callback: (event, button) => {
          const select = (button.form ?? button.closest("form")).querySelector(".trg-builder-ammo");
          const option = select.selectedOptions[0];
          return {
            id: select.value,
            name: option.textContent.split(" — ")[0],
            price: Number(option.dataset.price) || 0,
            quantity: Number(option.dataset.quantity) || 1,
            weight: Number(option.dataset.weight) || 0,
            // The bundle the printed weight and price cover. Falls back to
            // the entry's own quantity rather than to 1: an ammunition
            // entry that predates `batchSize` is still a bundle, and 1
            // would silently multiply its weight by twenty.
            batchSize: Number(option.dataset.batch) || Number(option.dataset.quantity) || 1
          };
        } },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!chosenBase || chosenBase === "cancel") return null;

  // THE RUNE CHOOSER ITSELF, not a second one. Ammunition takes weapon
  // runes, so it gets the weapon rune dialog — the same list, the same
  // prices, the same restrictions.
  const choice = await promptCustomiseItem("weapon",
    { level: 0, price: chosenBase.price * AMMUNITION_BATCH, hp: 0 },
    // ONLY WHAT A MISSILE WEAPON TAKES (3.618.0, B10): "any rune which can be
    // applied to a missile weapon may also be applied to ammunition".
    { title: `${chosenBase.name} x${AMMUNITION_BATCH} — Runes`, usage: { ammunition: true } });
  if (!choice) return null;

  const built = buildAmmunition({
    basePrice: chosenBase.price,
    baseQuantity: chosenBase.quantity,
    runes: choice.runes,
    quality: choice.quality
  });
  // THE WHOLE BASE ROUND (3.618.0, B1): a runed Penetrating Arrow is still a
  // Penetrating Arrow. Only the index's few fields were read, so the round's
  // own armour rending, damage type, range and the rest were dropped.
  const source = await pack.getDocument(chosenBase.id) ?? base.find((entry) => entry._id === chosenBase.id);
  // The base entry's name already carries its own bundle size —
  // "Arrows (20)" — so appending another count made
  // "Arrows (20) (Potency I) x10", which reads as gibberish. The bundle
  // count comes off and the batch is stated once.
  const bare = chosenBase.name.replace(/\s*\(\d+\)\s*$/, "").trim();
  return {
    name: `${bare}, ${choice.runes || "magical"} (batch of ${AMMUNITION_BATCH})`,
    result: built,
    extra: {
      runes: choice.runes,
      compatibleWeaponGroup: source?.system?.compatibleWeaponGroup ?? "",
      damage: source?.system?.damage ?? "",
      base: baseRoundProperties(source?.system),
      // THE BASE BUNDLE'S OWN FIGURES, carried through unchanged. The
      // built item holds AMMUNITION_BATCH pieces of a bundle the pack
      // prices and weighs in twenties, so `carriedWeightOf` does the
      // proportion: a batch of 10 built from "Arrows (20)" at 3 lb weighs
      // 1.5, not 3 and not 30 and not — as it did until 3.311.0 — nothing.
      weight: chosenBase.weight,
      batchSize: chosenBase.batchSize,
      traits: "Magical"
    },
    lines: [
      `A batch of <strong>${AMMUNITION_BATCH}</strong>, carrying <strong>${choice.runes || "no runes"}</strong>.`,
      `Runes cost ${built.runePrice} gp for the batch; the ${AMMUNITION_BATCH} pieces themselves are ${
  Math.round(built.piecePrice * AMMUNITION_BATCH * 100) / 100} gp.`
    ]
  };
}

/* ------------------------------------------------------------------ */

/**
 * Every spell, with its PP and school, for the two spell-driven builders.
 *
 * THE UUID IS CARRIED FROM 3.310.0 because a built item now keeps a
 * reference to its spell rather than a sentence about it, and a name
 * alone cannot survive two spells sharing one. It is read off the index
 * entry where Foundry supplies it and composed from the pack id and the
 * entry's `_id` where it does not — the same composition Foundry itself
 * uses, and stable across worlds.
 */
/** The school among a spell's traits, lower-cased, or "". */
function schoolOf(traits) {
  return String(traits ?? "").split(",").map((t) => t.trim().toLowerCase())
    .find((t) => SPELL_SCHOOLS.some((school) => school.toLowerCase() === t)) ?? "";
}

export async function spellChoices() {
  const pack = contentPack("spells");
  if (!pack) return [];
  const index = await pack.getIndex({ fields: ["system.ppCost", "system.traits"] });
  return Array.from(index.values())
    .map((entry) => ({
      name: entry.name,
      pp: Number(entry.system?.ppCost ?? 0),
      uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`,
      id: entry._id,
      // A SPELL'S SCHOOL IS THE TRAIT THAT NAMES ONE OF THE EIGHT (3.615.0,
      // A14 of block 36) — not its first trait, which is often an element
      // or "Cantrip": Shocking Grasp is "Electricity, … Invocation". The
      // staff's "spells from more than one school" rule needs it.
      school: schoolOf(entry.system?.traits)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * A spell's warping options, fetched on demand.
 *
 * NOT FROM THE INDEX. `system.warps` is an array of objects; a compendium
 * index is a flat summary and cannot be relied on to carry one whole. The
 * builder needs the real thing only for the spell somebody has actually
 * picked, so it is fetched then — one document, once, cached for the life
 * of the dialog.
 */
const warpCache = new Map();

export async function spellWarpOptions(spellId) {
  if (!spellId) return [];
  if (warpCache.has(spellId)) return warpCache.get(spellId);
  const pack = contentPack("spells");
  if (!pack) return [];
  let warps = [];
  try {
    const doc = await pack.getDocument(spellId);
    warps = Array.isArray(doc?.system?.warps) ? doc.system.warps : [];
  } catch (_e) {
    warps = [];
  }
  warpCache.set(spellId, warps);
  return warps;
}
