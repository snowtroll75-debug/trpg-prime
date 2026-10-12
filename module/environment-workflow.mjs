/**
 * THE ENVIRONMENT, IN FOUNDRY — the half of environment.mjs that rolls,
 * damages and draws (3.620.0, block 38; Chapter 12, Graham's R13, R15, R16).
 *
 *   applyEnvironment         a row of the damage table, applied to an actor
 *                            for a degree (the Exhaustion check's) or a
 *                            column the GM chose outright
 *   promptEnvironmentalDamage the GM's tool: a hazard, the selected tokens,
 *                            an Exhaustion check each or a column
 *   registerWeatherConfig    the Weather fields on a scene's and a region's
 *                            config sheets
 */

import {
  ENVIRONMENTAL_DAMAGE, WEATHER_KINDS, environmentSuffocates, environmentalDamageFor
} from "./environment.mjs";

const SYSTEM_ID = "trg-prime";
const { DialogV2 } = foundry.applications.api;

const line = (text) => `<p style="margin:2px 0">${text}</p>`;

/**
 * Apply an environment's consequence for a degree: the table's damage
 * (typed, through the creature's defences) or Quicksand's suffocation.
 *
 * @param {Actor} actor
 * @param {string} key an ENVIRONMENTAL_DAMAGE key
 * @param {string} degree the check's degree, or "failure"/"fumble" chosen
 * @returns {Promise<string[]>} card lines
 */
export async function applyEnvironment(actor, key, degree) {
  const row = ENVIRONMENTAL_DAMAGE[key];
  if (!actor || !row) return [];
  if (environmentSuffocates(key, degree)) {
    const { startHoldingBreath } = await import("./drowning-workflow.mjs");
    await startHoldingBreath(actor, { nonlethal: true, source: row.label });
    return [line(`<strong>${row.label}</strong> — caught: the suffocation rules apply (Chapter 7) until ${actor.name} escapes, and the damage is nonlethal.`)];
  }
  const damage = environmentalDamageFor(key, degree);
  if (!damage) return row.suffocation ? [] : [line(`<strong>${row.label}</strong> — no damage.`)];
  const roll = await new Roll(damage.formula).evaluate();
  const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
  const dealt = await applyTypedDamage(actor, { amount: roll.total, type: damage.type });
  return [
    line(`<strong>${row.label}</strong> — the ${damage.column} column: ${damage.formula} = <strong>${roll.total} ${damage.type}</strong>.`),
    line(describeDamage(dealt.packet, actor.name))
  ];
}

/**
 * THE GM'S TOOL (R15). A hazard, applied to every selected token: an
 * Exhaustion check each at the DC the GM sets (the row's damage on a
 * failure or fumble, on top of the check's Fatigue), or a column applied
 * outright — lava a character fell into is no check at all.
 */
export async function promptEnvironmentalDamage() {
  if (!game.user?.isGM) return null;
  const actors = (canvas?.tokens?.controlled ?? []).map((token) => token.actor).filter(Boolean);
  if (!actors.length) {
    ui.notifications?.warn("Environmental Damage: select the tokens it reaches first.");
    return null;
  }
  const options = Object.entries(ENVIRONMENTAL_DAMAGE)
    .map(([key, row]) => `<option value="${key}">${row.label} — ${row.type || "nonlethal"}${row.failure ? ` ${row.failure}/${row.fumble}` : ""}, ${row.frequency}</option>`)
    .join("");
  const choice = await DialogV2.wait({
    window: { title: "Environmental Damage", icon: "fa-solid fa-volcano" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint">Chapter 12's table, applied to ${actors.length} selected token${actors.length === 1 ? "" : "s"}: ${actors.map((a) => a.name).join(", ")}.</p>
      <div class="form-group"><label>Hazard</label><select name="hazard">${options}</select></div>
      <div class="form-group"><label>Resolve by</label><select name="mode">
        <option value="check" selected>An Exhaustion check each (damage on a failure or fumble)</option>
        <option value="failure">The Failure column, no check</option>
        <option value="fumble">The Fumble column, no check</option>
      </select></div>
      <div class="form-group"><label>GM DC <span class="hint">(blank: Easy, by each one's level)</span></label><input type="number" name="dc" min="1" placeholder="Easy"></div>
    </div>`,
    buttons: [
      { action: "apply", label: "Apply", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => ({
          hazard: button.form.elements.hazard.value,
          mode: button.form.elements.mode.value,
          dc: Number(button.form.elements.dc.value) || null
        }) },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!choice || choice === "cancel") return null;

  for (const actor of actors) {
    if (choice.mode === "check") {
      const { rollExhaustionCheck } = await import("./combat/exhaustion-workflow.mjs");
      await rollExhaustionCheck(actor, { dc: choice.dc, environment: choice.hazard,
        activity: ENVIRONMENTAL_DAMAGE[choice.hazard]?.label ?? "" });
      continue;
    }
    const lines = await applyEnvironment(actor, choice.hazard, choice.mode);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Environmental Damage</h3></div></header>${lines.join("")}</div>`
    });
  }
  return actors.length;
}

/**
 * WEATHER (R16): "Visibility … can be reduced by up to four steps" in a
 * blizzard, a sandstorm or fog. A Weather choice and a step count on the
 * scene's and the region's config sheets, stored as
 * `flags.trg-prime.weather = {kind, steps}` and read where the light level
 * is (light-workflow.mjs).
 */
export function registerWeatherConfig() {
  const fields = (doc) => {
    const weather = doc?.getFlag?.(SYSTEM_ID, "weather") ?? {};
    const options = [`<option value="">None</option>`]
      .concat(Object.entries(WEATHER_KINDS).map(([key, label]) =>
        `<option value="${key}" ${weather.kind === key ? "selected" : ""}>${label}</option>`))
      .join("");
    const wrap = document.createElement("fieldset");
    wrap.className = "trg-weather";
    wrap.innerHTML = `<legend>Weather (TRG Prime)</legend>
      <div class="form-group"><label>Weather</label><div class="form-fields"><select name="flags.${SYSTEM_ID}.weather.kind">${options}</select></div></div>
      <div class="form-group"><label>Visibility steps lost</label><div class="form-fields"><input type="number" name="flags.${SYSTEM_ID}.weather.steps" min="0" max="4" step="1" value="${Number(weather.steps) || 0}"></div>
      <p class="hint">Chapter 12: a blizzard, a sandstorm or fog reduces visibility by up to four steps, by its density — light-level steps on Chapter 8's scale.</p></div>
      <div class="form-group"><label>Vacuum</label><div class="form-fields"><input type="checkbox" name="flags.${SYSTEM_ID}.weather.vacuum" ${weather.vacuum ? "checked" : ""}></div>
      <p class="hint">Appendix 3: a Sonic effect cannot be used in a vacuum (3.622.0).</p></div>`;
    return wrap;
  };
  const inject = (app, html, tabs) => {
    const root = typeof html?.querySelector === "function" ? html : html?.[0];
    if (!root || root.querySelector(".trg-weather")) return;
    const doc = app.document ?? app.object;
    const host = tabs.map((tab) => root.querySelector(`.tab[data-tab="${tab}"]`)).find(Boolean)
      ?? root.querySelector("form .window-content, form") ?? root;
    const footer = host.querySelector?.(":scope > footer");
    if (footer) host.insertBefore(fields(doc), footer);
    else host.appendChild(fields(doc));
  };
  Hooks.on("renderSceneConfig", (app, html) => inject(app, html, ["ambience", "lighting", "environment", "basics"]));
  // "appearance" FIRST (3.621.0; G1 of the 3.620.0 drive): Foundry v14's
  // region sheet names its first tab so, and with no panel matched the
  // fields fell to the end of the form and showed under every tab.
  Hooks.on("renderRegionConfig", (app, html) => inject(app, html, ["appearance", "identity", "basics"]));
}
