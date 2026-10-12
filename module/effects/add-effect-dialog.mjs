/**
 * Adding an effect from the Effects tab.
 *
 * The button used to create a blank ActiveEffect called "New Effect" and
 * open Foundry's own configuration window on it. That is the only thing
 * it could do — there was no way to add one of the thirty-six conditions
 * this system already defines without going out to the token HUD, and a
 * player who pressed it was handed a form about attribute keys and change
 * modes rather than anything to do with the game.
 *
 * So: pick a condition by name, or choose a custom effect and get the
 * technical form. Valued conditions ask for their value on the way
 * through, using the same prompt the HUD uses.
 */
import { CONDITIONS, CONDITION_IDS } from "../conditions/registry.mjs";
import { promptConditionValue } from "../conditions/manager.mjs";

const { DialogV2 } = foundry.applications.api;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

/**
 * The conditions worth offering, in alphabetical order by the name a
 * player would actually say.
 *
 * Conditions already on the actor are still listed — re-picking a valued
 * one is a legitimate way to change its value — but marked, so it is
 * obvious what is already in play.
 */
export function addableConditions(actor) {
  return CONDITION_IDS.map((id) => ({
    id,
    label: CONDITIONS[id].label,
    icon: CONDITIONS[id].icon,
    valued: Boolean(CONDITIONS[id].valued),
    active: Boolean(actor?.hasCondition?.(id)),
    immune: Boolean(actor?.isImmuneToCondition?.(id))
  })).sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Ask what to add.
 *
 * @param {Actor} actor
 * @returns {Promise<{kind: "condition", conditionId: string, options: object}
 *                  |{kind: "custom", name: string, img: string}
 *                  |null>}
 */
export async function promptAddEffect(actor) {
  const conditions = addableConditions(actor);

  const options = conditions
    .map((entry) => {
      const notes = [];
      if (entry.active) notes.push("already active");
      if (entry.immune) notes.push("immune");
      if (entry.valued) notes.push("has a value");
      const suffix = notes.length ? ` — ${notes.join(", ")}` : "";
      return `<option value="${entry.id}"${entry.immune ? " disabled" : ""}>${escapeHTML(
        entry.label
      )}${escapeHTML(suffix)}</option>`;
    })
    .join("");

  const choice = await DialogV2.wait({
    window: { title: "Add an Effect", icon: "fa-solid fa-sparkles" },
    classes: ["trg-prime", "trg-add-effect"],
    position: { width: 460 },
    content: `
      <div class="trg-prime trg-add-effect-body">
        <p class="hint">
          Pick one of the game's conditions, or build a custom effect of your own.
        </p>
        <div class="form-group">
          <label for="trg-add-effect-condition">Condition</label>
          <select id="trg-add-effect-condition" name="conditionId">
            <option value="">— choose a condition —</option>
            ${options}
          </select>
        </div>
        <div class="trg-add-effect-divider"><span>or</span></div>
        <div class="form-group">
          <label for="trg-add-effect-name">Custom effect name</label>
          <input id="trg-add-effect-name" type="text" name="customName" placeholder="Blessing of the Dawn">
        </div>
        <p class="hint">
          A custom effect opens its own sheet so you can describe what it does.
        </p>
      </div>`,
    buttons: [
      {
        action: "add",
        label: "Add",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          return {
            conditionId: form.querySelector('[name="conditionId"]').value,
            customName: form.querySelector('[name="customName"]').value.trim()
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!choice || choice === "cancel") return null;

  // A named custom effect wins if both are filled in — typing a name is a
  // more deliberate act than leaving a dropdown where it was.
  if (choice.customName) {
    return { kind: "custom", name: choice.customName, img: "icons/svg/aura.svg" };
  }

  if (!choice.conditionId) return null;

  const definition = CONDITIONS[choice.conditionId];
  if (!definition?.valued) {
    return { kind: "condition", conditionId: choice.conditionId, options: { active: true } };
  }

  const valued = await promptConditionValue(choice.conditionId, null, {});
  if (!valued || valued.action === "remove") return null;

  return {
    kind: "condition",
    conditionId: choice.conditionId,
    options: { value: valued.value, damageType: valued.damageType ?? null }
  };
}
