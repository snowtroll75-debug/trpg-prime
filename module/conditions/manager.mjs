import { DAMAGE_TYPES } from "../config.mjs";
import {
  CONDITIONS,
  CONDITION_IDS,
  RECURRING_FLAT_CHECK_DC,
  bleedingSeverity
} from "./registry.mjs";

const SYSTEM_ID = "trg-prime";
const { DialogV2 } = foundry.applications.api;

/**
 * Replace Foundry's default status effects with the TRG Prime conditions.
 * Broken and Encumbered are excluded from the HUD: one affects objects, the
 * other is derived from carried weight rather than toggled.
 */
export function registerConditions() {
  CONFIG.statusEffects = CONDITION_IDS.filter((id) => CONDITIONS[id].hud).map(
    (id) => ({
      id,
      name: CONDITIONS[id].label,
      img: CONDITIONS[id].icon
    })
  );

  // Keep Foundry's special status mappings pointing at TRG conditions.
  CONFIG.specialStatusEffects.BLIND = "blinded";
  CONFIG.specialStatusEffects.INVISIBLE = "invisible";
  CONFIG.specialStatusEffects.DEFEATED = "dying";
}

/**
 * Prompt for a condition's value (design decision: explicit dialog on every
 * application, rather than increment-on-click).
 *
 * @param {string} id Condition id.
 * @param {number|null} current Current value if the condition is active.
 * @returns {Promise<{action: "apply"|"remove", value?: number}|null>}
 */
export async function promptConditionValue(
  id,
  current = null,
  { damageType = null, reduction = 0 } = {}
) {
  const condition = CONDITIONS[id];
  const isUpdate = current !== null;

  let hint = "";
  if (id === "bleeding") {
    hint = `<p class="hint">Value is HP lost each round. Light 1&ndash;4, Moderate 5&ndash;8, Severe 9&ndash;12, Dire 13+.</p>`;
  } else if (id === "recurring") {
    hint = `<p class="hint">Damage applies in Phase 3, then a DC ${RECURRING_FLAT_CHECK_DC} flat check to end it.</p>`;
  }

  // THE GM'S LEVER, AS A FIELD (page 193; the block-19 audit's D18,
  // Graham's R18 of 21 September 2026). "The GM may rule that an action
  // taken against it ends it automatically or lowers the flat check DC."
  // Bleeding has carried a readable reduction since Sharuk-Dur; recurring
  // damage had only the sentence above, which is advice and not a lever.
  // Offered on both, since they are the same rule and the same check.
  const reductionRow = ["bleeding", "recurring"].includes(id)
    ? `<div class="form-group">
        <label for="trg-condition-reduction">Flat check easier by (an action taken against it)</label>
        <input id="trg-condition-reduction" type="number" name="flatCheckReduction"
          value="${Math.max(0, Number(reduction) || 0)}" min="0" step="1">
      </div>`
    : "";

  // Recurring damage always has a damage type (ruled), so no untyped option.
  const selectedType = damageType ?? "fire";
  const typeRow =
    id === "recurring"
      ? `<div class="form-group">
          <label for="trg-condition-type">Damage type</label>
          <select id="trg-condition-type" name="damageType">
            ${Object.entries(DAMAGE_TYPES)
              .map(
                ([key, entry]) =>
                  `<option value="${key}"${key === selectedType ? " selected" : ""}>${entry.label}</option>`
              )
              .join("")}
          </select>
        </div>`
      : "";

  const content = `
    <div class="trg-prime trg-check-dialog">
      <div class="form-group">
        <label for="trg-condition-value">${condition.label} value</label>
        <input
          id="trg-condition-value"
          type="number"
          name="value"
          value="${current ?? 1}"
          min="1"
          step="1"
          autofocus
        >
      </div>
      ${typeRow}
      ${reductionRow}
      ${hint}
    </div>`;

  const buttons = [
    {
      action: "apply",
      label: isUpdate ? "Update" : "Apply",
      icon: "fa-solid fa-check",
      default: true,
      callback: (event, button) => {
        const form = button.form ?? button.closest?.("form");
        const input = form?.querySelector('[name="value"]');
        const type = form?.querySelector('[name="damageType"]');
        const easier = form?.querySelector('[name="flatCheckReduction"]');
        return {
          action: "apply",
          value: Number(input?.value ?? 1),
          damageType: type?.value || null,
          flatCheckReduction: easier ? Math.max(0, Number(easier.value) || 0) : 0
        };
      }
    }
  ];

  if (isUpdate) {
    buttons.push({
      action: "remove",
      label: "Remove",
      icon: "fa-solid fa-trash",
      callback: () => ({ action: "remove" })
    });
  }

  buttons.push({
    action: "cancel",
    label: "Cancel",
    icon: "fa-solid fa-xmark",
    callback: () => null
  });

  const result = await DialogV2.wait({
    window: {
      title: isUpdate
        ? `${condition.label} ${current}`
        : `Apply ${condition.label}`,
      icon: "fa-solid fa-heart-crack"
    },
    classes: ["trg-prime"],
    position: { width: 340 },
    content,
    buttons,
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  if (result.action === "apply") {
    const value = Math.max(1, Math.round(Number(result.value) || 1));
    return {
      action: "apply",
      value,
      damageType: result.damageType ?? null,
      flatCheckReduction: Math.max(0, Math.round(Number(result.flatCheckReduction) || 0))
    };
  }
  return result;
}

/**
 * Compose the display name for a condition effect: "Frightened 2",
 * "Bleeding 6 (Moderate)".
 */
export function conditionEffectName(id, value = null, damageType = null) {
  const condition = CONDITIONS[id];
  if (!condition.valued || value === null) return condition.label;

  if (id === "bleeding") {
    const band = bleedingSeverity(value);
    return band
      ? `${condition.label} ${value} (${band.label})`
      : `${condition.label} ${value}`;
  }

  if (id === "recurring" && damageType && DAMAGE_TYPES[damageType]) {
    return `${condition.label} ${value} (${DAMAGE_TYPES[damageType].label})`;
  }

  return `${condition.label} ${value}`;
}

/**
 * Build the ActiveEffect creation data for a condition.
 *
 * `flatCheckReduction` is page 193's GM lever (R18): the flag the end
 * phase reads to lower the DC of the check that ends Bleeding or
 * Recurring Damage. Written under the names those two checks already
 * read — `bleedFlatCheckReduction` has been readable since Sharuk-Dur,
 * and `recurringFlatCheckReduction` is its twin, added at 3.579.0.
 */
export function conditionEffectData(id, value = null, damageType = null, flatCheckReduction = 0) {
  const condition = CONDITIONS[id];
  const easier = Math.max(0, Math.round(Number(flatCheckReduction) || 0));
  const leverKey = { bleeding: "bleedFlatCheckReduction", recurring: "recurringFlatCheckReduction" }[id];

  return {
    name: conditionEffectName(id, condition.valued ? value : null, damageType),
    img: condition.icon,
    statuses: [id],
    flags: {
      [SYSTEM_ID]: {
        condition: id,
        value: condition.valued ? value : null,
        damageType: id === "recurring" ? damageType : null,
        ...(leverKey ? { [leverKey]: easier } : {})
      }
    }
  };
}
