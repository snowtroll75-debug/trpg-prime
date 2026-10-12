/**
 * VEHICLES — the Foundry side (3.577.0). The rules are in vehicles.mjs.
 *
 * WHO PILOTS. The vehicle's own sheet is open; the pilot is the character
 * the user is driving it with — their controlled token's actor, or their
 * assigned character — never the vehicle itself.
 */

import { TRGCheck } from "./dice/check.mjs";
import { vehicleOf, vehiclePilotView } from "./vehicles.mjs";

/**
 * Roll the pilot's check against the vehicle's DC.
 *
 * @param {Actor} vehicle
 * @returns {Promise<object|null>}
 */
export async function pilotVehicle(vehicle) {
  const view = vehiclePilotView(vehicleOf(vehicle));
  if (!view) return null;
  const pilot = Array.from(canvas?.tokens?.controlled ?? [])
    .map((t) => t.actor).find((a) => a && a.id !== vehicle.id) ?? game.user?.character ?? null;
  if (!pilot || pilot.id === vehicle.id) {
    ui.notifications.warn(`Select the token of the character piloting ${vehicle.name} first.`);
    return null;
  }
  const skills = pilot.system?.skills ?? {};
  let key = view.skills.length === 1 ? view.skills[0] : "";
  if (!key) {
    const { DialogV2 } = foundry.applications.api;
    const keys = (view.skills.length ? view.skills : Object.keys(skills)).filter((k) => skills[k]);
    const options = keys.map((k) => `<option value="${k}">${skills[k]?.label ?? k}</option>`).join("");
    key = await DialogV2.wait({
      window: { title: `Pilot ${vehicle.name}`, icon: "fa-solid fa-ship" },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">Check: ${view.skillText}. DC ${view.dc}.</p>`
        + `<label>Skill <select name="skill">${options}</select></label></div>`,
      buttons: [
        { action: "roll", label: "Roll", icon: "fa-solid fa-dice-d20", default: true,
          callback: (event, button) => button.form?.elements?.skill?.value ?? "" },
        { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    if (!key || key === "cancel") return null;
  }
  const skill = skills[key];
  if (!skill) {
    ui.notifications.warn(`${pilot.name} has no ${key} skill to pilot with.`);
    return null;
  }
  return TRGCheck.roll({
    actor: pilot,
    label: `Pilot ${vehicle.name}`,
    subtitle: `${skill.label ?? key} — the vehicle's level DC`,
    type: "skill",
    subject: key,
    dc: view.dc,
    modifiers: skill.checkModifiers ?? [{ label: skill.label ?? key, value: Number(skill.total ?? 0), type: "untyped" }]
  });
}
