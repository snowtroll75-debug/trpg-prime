/**
 * The Add Specialist Skill picker — the Foundry side of
 * specialist-skill-table.mjs.
 *
 * The chapter says specialist skills are granted "through unique
 * circumstances rather than through regular skill development" and that
 * its own list is "by far from comprehensive". So this dialog opens on
 * CUSTOM, not on the first printed row: the book's position is that the
 * table is a starting point, and a picker that defaults to Animal Lore
 * would quietly assert the opposite every time somebody pressed Add.
 *
 * What the printed rows are actually for is the ABILITY. Fifteen of the
 * thirty-three are not Intelligence, which is what a blank row defaults
 * to, so the row a GM picks is mostly buying them the correct governing
 * ability without a trip to the book.
 */
import {
  SPECIALIST_CUSTOM_KEY,
  SPECIALIST_SKILL_TABLE,
  specialistSkillRow
} from "./specialist-skill-table.mjs";
import { ATTRIBUTE_LABELS } from "./config.mjs";

/**
 * Ask which specialist skill to add.
 *
 * @returns {Promise<{label:string|null, ability:string|null, custom:boolean}|null>}
 *   The chosen row, `{custom: true}` for a free-form one, or null if the
 *   dialog was cancelled.
 */
export async function promptSpecialistSkill() {
  const { DialogV2 } = foundry.applications.api;

  const options = SPECIALIST_SKILL_TABLE.map((row) => {
    const ability = ATTRIBUTE_LABELS[row.ability] ?? row.ability;
    return (
      `<option value="${row.label}" data-ability="${row.ability}">` +
      `${row.label} (${ability})</option>`
    );
  }).join("");

  const result = await DialogV2.wait({
    window: { title: "Add Specialist Skill", icon: "fa-solid fa-star" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Specialist skills are granted by a race, a background, a feat or a story event &mdash; they are not chosen like ordinary skills.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">
        <input type="radio" name="specialistSource" value="${SPECIALIST_CUSTOM_KEY}" checked style="margin:0">
        <span>Something else &mdash; name it yourself</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">
        <input type="radio" name="specialistSource" value="table" style="margin:0">
        <span>From the Specialist Skill Table</span>
      </label>
      <select name="specialistRow" style="width:100%;margin:4px 0 0">${options}</select>
      <p class="hint" style="font-size:.82em;margin:6px 0 0">The table's list is not exhaustive &mdash; the book invites you to invent your own. Picking a row only fills in the name and its printed ability; everything stays editable afterwards.</p>
    </div>`,
    buttons: [
      {
        action: "add",
        label: "Add",
        icon: "fa-solid fa-plus",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          const source = root?.querySelector?.(
            'input[name="specialistSource"]:checked'
          )?.value;
          if (source !== "table") return { custom: true };
          const label = root?.querySelector?.('select[name="specialistRow"]')?.value ?? "";
          return { custom: false, label };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  if (result.custom) return { label: null, ability: null, custom: true };

  // The label is resolved back through the table rather than trusted from
  // the select, so the ability can never disagree with the name.
  const row = specialistSkillRow(result.label);
  if (!row) return { label: null, ability: null, custom: true };
  return { label: row.label, ability: row.ability, custom: false };
}
