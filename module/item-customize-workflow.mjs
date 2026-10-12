/**
 * The customisation dialog for weapons, armour, and shields (Chapter
 * 6's Item Quality, Special Materials, and Superior Traits) — used
 * both before an item is added/bought (picker) and after, on an
 * already-owned item (item sheet). One dialog, two call sites.
 */
import { runeUsageAllows } from "./weapon-rune-usage.mjs";
import {
  DRAGONHIDE_DRAGONS,
  QUALITY_TIERS,
  SUPERIOR_TRAITS,
  applicableMaterials,
  computeFullCustomisation
} from "./item-quality.mjs";
import { fieldToRunes, runesFor, runesToField } from "./rune-catalogue.mjs";
import { roman } from "./runes.mjs";
import { FREQUENCIES, formatSpellEffect, parseSpellEffect } from "./rune-spell-effect.mjs";

const { DialogV2 } = foundry.applications.api;

const QUALITY_OPTIONS = [
  ["standard", "Standard"],
  ["inferior", "Inferior"],
  ["expert", "Expert"],
  ["master", "Master"],
  ["legendary", "Legendary"]
];

/**
 * Prompts for a full quality/material/superior-traits customisation
 * of a weapon, armour, or shield, with a live price/level preview that
 * recalculates as the player changes any selection.
 *
 * @param {"weapon"|"armour"|"shield"} itemType
 * @param {{level: number, price: number, hp: number, category?: string}} baseData
 *   The item's own unmodified level/price/HP (and, for armour, its
 *   category — needed to filter Dragonhide correctly).
 * @param {object} [options]
 * @param {string} [options.title]
 * @param {string} [options.quality] Pre-selected quality (for
 *   re-customising an item that already has one).
 * @param {string} [options.material] Pre-selected material.
 * @param {string[]} [options.traitKeys] Pre-selected traits.
 * @param {string} [options.runes] The item's current runes field.
 * @returns {Promise<{quality: string, material: string, traitKeys: string[],
 *   runes: string}|null>}
 */
export async function promptCustomiseItem(itemType, baseData, options = {}) {
  const {
    title = "Customise Item",
    quality: initialQuality = "standard",
    material: initialMaterial = "",
    traitKeys: initialTraitKeys = [],
    runes: initialRunes = "",
    dragonType: initialDragonType = "",
    // WHAT THE WEAPON IS, for the runes' usage lines (3.618.0, B10): a rune it
    // cannot take is not offered. `{ammunition: true}` for a batch of rounds.
    usage = null
  } = options;

  // `metal` is passed for shields so Dragonhide — "metal shields" only —
  // is not offered for a wooden one. Undefined for anything else, which
  // `applicableMaterials` reads as "not known" and does not refuse on.
  const materials = applicableMaterials(itemType, baseData.category, {
    metal: typeof baseData.metal === "boolean" ? baseData.metal : null
  });

  // THE DRAGON (3.574.0). Dragonhide's two effects are "against the
  // energy type of the dragon the scales were harvested from", so the
  // dragon is part of the material rather than a note beside it. Shown
  // only while Dragonhide is the chosen material; the value is discarded
  // on Apply for any other material, so a suit re-made in Mithril does
  // not quietly keep a dragon it no longer has.
  const dragonOptions = Object.entries(DRAGONHIDE_DRAGONS)
    .map(([key, dragon]) =>
      `<option value="${key}"${key === initialDragonType ? " selected" : ""}>${dragon.label} — ${dragon.energy.join(" and ")}</option>`)
    .join("");
  const traitDefs = SUPERIOR_TRAITS[itemType] ?? {};

  // THE SPELL LIST, for the Spell Effect rune. Fetched once here rather
  // than inside the pricing, so everything below the dialog stays a pure
  // function the harnesses can run outside Foundry — the same division
  // every other picker in this system uses.
  const spells = await spellIndex();

  const materialOptions = materials
    .map(
      (m) =>
        `<option value="${m.key}"${m.key === initialMaterial ? " selected" : ""}>${m.label}</option>`
    )
    .join("");

  // THE RUNES (Chapter 11), as a chooser rather than a text field.
  // Until 3.241.0 these were typed by hand into the item sheet and
  // priced by nobody, which is what Graham objected to — quite rightly,
  // since a catalogue you cannot pick from is a list.
  const catalogue = runesFor(itemType);
  const chosenRunes = fieldToRunes(itemType, initialRunes);
  const chosenOf = (key) => chosenRunes.find((r) => r.key === key) ?? null;
  const runeRows = catalogue.map((rune) => {
    const chosen = chosenOf(rune.key);
    // NOT OFFERED where it cannot work (B10) — unless it is already there,
    // which the dialog keeps rather than silently striking off on Apply.
    const allowed = usage && itemType === "weapon" ? runeUsageAllows(rune.key, usage) : { ok: true, reason: "" };
    const refused = !allowed.ok && !chosen;
    const tierOptions = rune.tiers.map((tier) =>
      `<option value="${tier.numeral}"${chosen?.tier === tier.numeral ? " selected" : ""}>${
        rune.tiers.length > 1 ? roman(tier.numeral) : "yes"}${
        rune.spell ? "" : ` — ${tier.price} gp`}</option>`).join("");
    // SPELL EFFECT NEEDS TWO CONTROLS, not one: the spell and how often
    // it may be cast, because the frequency is part of the price and the
    // level rather than a note beside them.
    // ONE TICK PER TYPE where the tier is a count of types (3.615.0, A3 of
    // block 36: Energy Resistance II–IV name two to four).
    const ticked = rune.parameter?.perTier
      ? new Set(String(chosen?.parameter ?? "").split(",").map((w) => w.trim().toLowerCase()).filter(Boolean))
      : null;
    const parameterField = rune.parameter?.spell
      ? spellEffectControls(rune, chosen, spells)
      : rune.parameter?.perTier
        ? `<span class="trg-rune-parameter-ticks" data-rune="${rune.key}" data-tooltip="One per tier">${
          rune.parameter.choices.map((c) =>
            `<label style="white-space:nowrap"><input type="checkbox" class="trg-rune-parameter-tick" data-rune="${rune.key}" value="${c}"${ticked.has(c) ? " checked" : ""}> ${c}</label>`).join(" ")}</span>`
      : rune.parameter
        ? (rune.parameter.choices.length
          ? `<select class="trg-rune-parameter" data-rune="${rune.key}"><option value="">${rune.parameter.label}…</option>${
            rune.parameter.choices.map((c) =>
              `<option value="${c}"${chosen?.parameter === c ? " selected" : ""}>${c}</option>`).join("")}</select>`
          : `<input type="text" class="trg-rune-parameter" data-rune="${rune.key}" value="${chosen?.parameter ?? ""}" placeholder="${rune.parameter.label}">`)
        : "";
    const usageNote = allowed.ok ? "" : ` — ${rune.name} ${allowed.reason}`;
    return `<div class="trg-rune-row${rune.spell ? " trg-rune-row-spell" : ""}${allowed.ok ? "" : " trg-rune-suppressed"}">
      <label class="trg-rune-name" data-tooltip="${(String(rune.effect ?? "") + usageNote).replace(/"/g, "&quot;")}">${rune.name}${allowed.ok ? "" : " <i class=\"fa-solid fa-ban\"></i>"}</label>
      <select class="trg-rune-tier" data-rune="${rune.key}"${refused ? " disabled" : ""}>
        <option value="0">—</option>${tierOptions}
      </select>
      ${parameterField}
    </div>`;
  }).join("");

  // "THIS TRAIT MAY BE APPLIED MULTIPLE TIMES" (3.575.0): a repeatable
  // trait is a COUNT, not a tick. The engine has always applied a key as
  // many times as it appears; the dialog could only ever send it once.
  const traitRows = Object.entries(traitDefs)
    .map(
      ([key, trait]) => trait.repeatable
        ? `
        <label class="trg-customise-trait">
          <input type="number" class="trg-customise-trait-count" data-trait="${key}" min="0" max="3" step="1"
            value="${initialTraitKeys.filter((k) => k === key).length}" style="width:3.5em">
          ${trait.label} <span class="hint">(may be taken more than once)</span>
        </label>`
        : `
        <label class="trg-customise-trait">
          <input type="checkbox" class="trg-customise-trait-check" value="${key}"${
            initialTraitKeys.includes(key) ? " checked" : ""
          }>
          ${trait.label}
        </label>`
    )
    .join("");

  const dialogPromise = DialogV2.wait({
    classes: ["trg-prime", "trg-customise-item"],
    // Taller and resizable: the rune list added seventeen rows to what
    // used to be a three-field dialog, and at 560 the Apply button left
    // the bottom of the screen.
    position: { width: 460, height: 620 },
    window: { title, icon: "fa-solid fa-gem", resizable: true },
    content: `
      <div class="trg-prime trg-customise-body">
        <div class="form-group">
          <label>Quality</label>
          <select class="trg-customise-quality">
            ${QUALITY_OPTIONS.map(
              ([key, label]) =>
                `<option value="${key}"${key === initialQuality ? " selected" : ""}>${label}</option>`
            ).join("")}
          </select>
        </div>
        <div class="form-group">
          <label>Material</label>
          <select class="trg-customise-material">
            <option value=""${initialMaterial === "" ? " selected" : ""}>None</option>
            ${materialOptions}
          </select>
        </div>
        <div class="form-group trg-customise-dragon-group"${initialMaterial === "dragonhide" ? "" : " hidden"}>
          <label>Dragon</label>
          <select class="trg-customise-dragon">
            <option value=""${initialDragonType === "" ? " selected" : ""}>Choose the dragon…</option>
            ${dragonOptions}
          </select>
        </div>
        <div class="trg-customise-traits-group">
          <label>Superior Traits (up to <span class="trg-customise-max-traits">0</span>)</label>
          <div class="trg-customise-traits">${traitRows || "<em>No superior traits defined for this item type.</em>"}</div>
        </div>
        <div class="trg-customise-traits-group">
          <label>Runes <span class="trg-rune-allowance"></span></label>
          <div class="trg-customise-runes">${runeRows || "<em>No runes go on this kind of item.</em>"}</div>
        </div>
        <div class="trg-customise-summary">
          <div><span>Level</span> <strong class="trg-customise-level">0</strong></div>
          <div><span>Price</span> <strong class="trg-customise-price">0 gp</strong></div>
        </div>
        <div class="trg-rune-problems"></div>
      </div>`,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          return {
            quality: form.querySelector(".trg-customise-quality").value,
            material: form.querySelector(".trg-customise-material").value,
            dragonType: form.querySelector(".trg-customise-material").value === "dragonhide"
              ? (form.querySelector(".trg-customise-dragon")?.value ?? "")
              : "",
            traitKeys: chosenTraitKeys(form),
            runes: runesToField(itemType, readRuneSelection(form))
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  /** Every chosen trait key, a repeated trait once per time it was taken. */
  function chosenTraitKeys(root) {
    return [
      ...Array.from(root.querySelectorAll(".trg-customise-trait-check:checked")).map((el) => el.value),
      ...Array.from(root.querySelectorAll(".trg-customise-trait-count"))
        .flatMap((el) => Array(Math.max(0, Math.floor(Number(el.value) || 0))).fill(el.dataset.trait))
    ];
  }

  /** The chosen runes, read off the dialog's own controls. */
  function readRuneSelection(root) {
    return Array.from(root.querySelectorAll(".trg-rune-tier"))
      .filter((select) => Number(select.value) > 0)
      .map((select) => ({
        key: select.dataset.rune,
        tier: Number(select.value),
        parameter: readRuneParameter(root, select.dataset.rune)
      }));
  }

  /**
   * One rune's parameter. Spell Effect's is two controls joined back
   * into the one string the field holds, so nothing downstream has to
   * know the dialog rendered it as a pair.
   */
  function readRuneParameter(root, key) {
    const spellSelect = root.querySelector(`.trg-rune-spell[data-rune="${key}"]`);
    if (spellSelect) {
      return formatSpellEffect({
        spell: spellSelect.value,
        frequency: root.querySelector(`.trg-rune-frequency[data-rune="${key}"]`)?.value ?? ""
      });
    }
    const ticks = root.querySelectorAll(`.trg-rune-parameter-tick[data-rune="${key}"]`);
    if (ticks.length) return Array.from(ticks).filter((t) => t.checked).map((t) => t.value).join(", ");
    return root.querySelector(`.trg-rune-parameter[data-rune="${key}"]`)?.value ?? "";
  }

  Hooks.once("renderDialogV2", (dialogApp) => {
    const root = dialogApp.element;
    const qualitySelect = root.querySelector(".trg-customise-quality");
    const materialSelect = root.querySelector(".trg-customise-material");
    const traitChecks = root.querySelectorAll(".trg-customise-trait-check");
    const traitCounts = root.querySelectorAll(".trg-customise-trait-count");
    const maxTraitsLabel = root.querySelector(".trg-customise-max-traits");
    const levelLabel = root.querySelector(".trg-customise-level");
    const priceLabel = root.querySelector(".trg-customise-price");
    if (!qualitySelect) return;

    function recalculate() {
      const quality = qualitySelect.value;
      const material = materialSelect.value;
      const dragonGroup = root.querySelector(".trg-customise-dragon-group");
      if (dragonGroup) dragonGroup.hidden = material !== "dragonhide";
      const maxTraits = QUALITY_TIERS[quality]?.maxTraits ?? 0;

      let checkedTraits = Array.from(traitChecks).filter((el) => el.checked);
      // If the newly-selected quality allows fewer traits than are
      // currently checked, uncheck the excess (the last ones checked,
      // matching DOM order) rather than silently ignoring them.
      if (checkedTraits.length > maxTraits) {
        checkedTraits.slice(maxTraits).forEach((el) => (el.checked = false));
        checkedTraits = Array.from(traitChecks).filter((el) => el.checked);
      }
      // A REPEATED TRAIT SPENDS ONE ALLOWANCE PER TIME TAKEN (3.575.0):
      // "each trait increases the total level ... by 1", and the tier's
      // limit is on traits, so Balanced twice is two. Counts are trimmed
      // from the last field back when they overrun what is left.
      let room = Math.max(0, maxTraits - checkedTraits.length);
      traitCounts.forEach((el) => {
        const wanted = Math.max(0, Math.floor(Number(el.value) || 0));
        const kept = Math.min(wanted, room);
        if (kept !== wanted) el.value = String(kept);
        room -= kept;
      });
      traitCounts.forEach((el) => {
        el.max = String(Math.max(0, Math.floor(Number(el.value) || 0)) + room);
      });
      traitChecks.forEach((el) => {
        if (!el.checked) el.disabled = room <= 0;
      });

      maxTraitsLabel.textContent = String(maxTraits);

      const runes = runesToField(itemType, readRuneSelection(root));
      const result = computeFullCustomisation(itemType, baseData, {
        quality,
        material,
        traitKeys: chosenTraitKeys(root),
        runes,
        spells
      });
      levelLabel.textContent = String(result.effectiveLevel);
      // An extrapolated price is marked as one wherever it is shown. The
      // book's tables stop at level 21 and this number is past them.
      priceLabel.textContent = `${result.price} gp${result.runeExtrapolated ? "*" : ""}`;

      // The chapter's limits, shown live as you choose. REPORTED, not
      // enforced: refusing a click is a worse way to say "that will not
      // fit on a standard axe" than saying it.
      if (allowanceLabel) {
        allowanceLabel.textContent = result.runeLimits
          ? `(Potency ${roman(result.runeLimits.maxPotency)} max, ${result.runeLimits.additionalRunes} other${result.runeLimits.additionalRunes === 1 ? "" : "s"})`
          : "";
      }
      if (problemsBox) {
        problemsBox.innerHTML = (result.runeProblems ?? [])
          .map((problem) => `<p class="hint"><i class="fa-solid fa-triangle-exclamation"></i> ${problem}</p>`)
          .join("");
      }
    }

    const runeControls = root.querySelectorAll(
      ".trg-rune-tier, .trg-rune-parameter, .trg-rune-parameter-tick, .trg-rune-spell, .trg-rune-frequency");
    const allowanceLabel = root.querySelector(".trg-rune-allowance");
    const problemsBox = root.querySelector(".trg-rune-problems");

    qualitySelect.addEventListener("change", recalculate);
    materialSelect.addEventListener("change", recalculate);
    traitChecks.forEach((el) => el.addEventListener("change", recalculate));
    traitCounts.forEach((el) => el.addEventListener("change", recalculate));
    runeControls.forEach((el) => el.addEventListener("change", recalculate));
    runeControls.forEach((el) => el.addEventListener("input", recalculate));
    recalculate();
  });

  const result = await dialogPromise;
  if (!result || result === "cancel") return null;
  return result;
}

/**
 * Every spell in the compendium, with its PP cost — the list the Spell
 * Effect rune is chosen from and priced against.
 *
 * EVERY SPELL, not a filtered subset: the chapter puts no tradition
 * restriction on the rune ("this rune has a unique formula for each
 * spell"), and the price and level do the limiting instead — a PP 18
 * spell on a sword is a level-19 rune costing 300,000 gp, which is its
 * own answer to whether a first-level fighter may have one.
 *
 * Returns an empty list outside Foundry, so the dialog degrades to
 * "no spell chosen" rather than throwing.
 */
export async function spellIndex() {
  const pack = globalThis.game?.packs?.get?.("trg-prime.spells");
  if (!pack) return [];
  const index = await pack.getIndex({ fields: ["system.ppCost"] });
  return Array.from(index.values())
    .map((entry) => ({
      id: entry._id,
      name: entry.name,
      ppCost: Number(entry.system?.ppCost ?? 0)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The Spell Effect rune's pair of controls: which spell, and how often.
 *
 * The spell's PP is printed beside its name, because that is the number
 * the whole price comes from and hiding it would make the price look
 * arbitrary.
 */
export function spellEffectControls(rune, chosen, spells = []) {
  const current = parseSpellEffect(chosen?.parameter ?? "");
  const spellOptions = (spells ?? []).map((spell) =>
    `<option value="${spell.name}"${
      spell.name.toLowerCase() === current.spell.toLowerCase() ? " selected" : ""
    }>${spell.name} (PP ${spell.ppCost})</option>`).join("");
  const frequencyOptions = FREQUENCIES.map((frequency) =>
    `<option value="${frequency.key}"${
      frequency.key === current.frequency ? " selected" : ""
    }>${frequency.label}${frequency.levels ? ` (+${frequency.levels} level${frequency.levels === 1 ? "" : "s"})` : ""}</option>`).join("");
  return `<select class="trg-rune-spell" data-rune="${rune.key}">
      <option value="">Spell…</option>${spellOptions}
    </select>
    <select class="trg-rune-frequency" data-rune="${rune.key}">${frequencyOptions}</select>`;
}
