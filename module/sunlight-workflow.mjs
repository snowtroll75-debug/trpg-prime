/**
 * Sunlight, the Foundry half (3.627.0). See sunlight.mjs.
 *
 *   sunlightStateOfToken     the GM's word for one token
 *   applySunlightAtTurnStart Sunlight Weakness (and Vulnerability's damage) on a token whose turn begins in sun
 *   liftSunlight             restore what it replaced, when the creature is out of the sun
 *   registerSunlightHooks    the scene and token config fields, and the lift on a change of either
 */
import { SUNLIGHT_CONDITIONS, SUNLIGHT_FLAG, SUNLIGHT_STATE_FLAG, sunlightRestore, sunlightState } from "./sunlight.mjs";
import { isActingGM } from "./acting-gm.mjs";

const SYSTEM_ID = "trg-prime";
const line = (html) => `<p style="margin:2px 0">${html}</p>`;

/** "sun", "shade" or "unknown" for a token document (or placeable). */
export function sunlightStateOfToken(token) {
  const doc = token?.document ?? token;
  return sunlightState({
    sceneFlag: doc?.parent?.getFlag?.(SYSTEM_ID, SUNLIGHT_FLAG) ?? "",
    tokenFlag: doc?.getFlag?.(SYSTEM_ID, SUNLIGHT_FLAG) ?? ""
  });
}

async function card(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * The turn began in sunlight: apply the weakness (once — a creature already
 * under it is not re-applied), and a Vulnerability's damage every turn.
 * @param {TokenDocument} tokenDocument
 * @param {{name: string, severity: string, amount: number}} announcement from turnStartAnnouncements
 */
export async function applySunlightAtTurnStart(tokenDocument, announcement) {
  const actor = tokenDocument?.actor;
  if (!actor) return;
  const lines = [line("<em>Begins its turn in sunlight (the scene or token is marked so).</em>")];
  if (!actor.getFlag?.(SYSTEM_ID, SUNLIGHT_STATE_FLAG)?.active) {
    const before = Object.fromEntries(SUNLIGHT_CONDITIONS.map(({ key }) => [key, Number(actor.getConditionValue?.(key) ?? 0)]));
    const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
    const { conditionLabel } = await import("./conditions/condition-rules.mjs");
    const applied = await applyConditionTags(actor, SUNLIGHT_CONDITIONS.map((c) => ({ ...c, label: conditionLabel(c.key) })), {});
    await actor.setFlag(SYSTEM_ID, SUNLIGHT_STATE_FLAG, { active: true, before, source: announcement.ability });
    lines.push(line(`${formatAppliedTags(applied)} — for as long as it remains in the sunlight.`));
  } else {
    lines.push(line("<em>Still in sunlight — injured 2 and slowed 2 remain.</em>"));
  }
  if (announcement.severity === "vulnerability" && announcement.amount > 0) {
    const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
    const dealt = await applyTypedDamage(actor, { amount: announcement.amount, type: "essence" });
    lines.push(line(`Sunlight Vulnerability: <strong>${announcement.amount} essence</strong> (2 per level). ${describeDamage(dealt.packet, actor.name)}`));
  }
  await card(actor, announcement.ability, lines);
}

/** Out of the sun: put back what the sunlight replaced. */
export async function liftSunlight(actor, reason = "") {
  const state = actor?.getFlag?.(SYSTEM_ID, SUNLIGHT_STATE_FLAG);
  if (!state?.active) return false;
  const current = Object.fromEntries(SUNLIGHT_CONDITIONS.map(({ key }) => [key, Number(actor.getConditionValue?.(key) ?? 0)]));
  const restore = sunlightRestore(state.before ?? {}, current);
  for (const [key, value] of Object.entries(restore)) {
    if (value > 0) await actor.toggleStatusEffect(key, { value, force: true });
    else await actor.toggleStatusEffect(key, { active: false });
  }
  await actor.unsetFlag(SYSTEM_ID, SUNLIGHT_STATE_FLAG);
  await card(actor, state.source || "Sunlight Weakness", [line(`Out of the sunlight${reason ? ` (${reason})` : ""} — the injured and slowed it imposed are lifted.`)]);
  return true;
}

/** Every token on a scene whose creature is under the sunlight, checked again. */
async function recheckScene(scene, reason) {
  for (const tokenDocument of Array.from(scene?.tokens ?? [])) {
    const actor = tokenDocument.actor;
    if (!actor?.getFlag?.(SYSTEM_ID, SUNLIGHT_STATE_FLAG)?.active) continue;
    if (sunlightStateOfToken(tokenDocument) !== "sun") await liftSunlight(actor, reason);
  }
}

/** The config fields and the hooks that lift the weakness when the GM's word changes. */
export function registerSunlightHooks() {
  const select = (name, value, options) => `<select name="${name}">${options
    .map(([v, label]) => `<option value="${v}" ${value === v ? "selected" : ""}>${label}</option>`).join("")}</select>`;
  const field = (doc, options, hint) => {
    const wrap = document.createElement("fieldset");
    wrap.className = "trg-sunlight";
    wrap.innerHTML = `<legend>Sunlight (TRG Prime)</legend>
      <div class="form-group"><label>Sunlight</label><div class="form-fields">${select(`flags.${SYSTEM_ID}.${SUNLIGHT_FLAG}`, String(doc?.getFlag?.(SYSTEM_ID, SUNLIGHT_FLAG) ?? ""), options)}</div>
      <p class="hint">${hint}</p></div>`;
    return wrap;
  };
  const inject = (app, html, tabs, options, hint) => {
    const root = typeof html?.querySelector === "function" ? html : html?.[0];
    if (!root || root.querySelector(".trg-sunlight")) return;
    const doc = app.document ?? app.object;
    const host = tabs.map((tab) => root.querySelector(`.tab[data-tab="${tab}"]`)).find(Boolean)
      ?? root.querySelector("form .window-content, form") ?? root;
    const footer = host.querySelector?.(":scope > footer");
    if (footer) host.insertBefore(field(doc, options, hint), footer);
    else host.appendChild(field(doc, options, hint));
  };
  Hooks.on("renderSceneConfig", (app, html) => inject(app, html, ["ambience", "lighting", "environment", "basics"],
    [["", "Not set — a card asks the GM"], ["sunlit", "Sunlit"], ["dark", "Not sunlit"]],
    "Sunlight Weakness and Vulnerability apply by themselves at the start of a creature's turn on a Sunlit scene. A token can override its scene."));
  Hooks.on("renderTokenConfig", (app, html) => inject(app, html, ["identity", "appearance", "basics"],
    [["", "As the scene"], ["sun", "In sunlight"], ["shade", "In shade"]],
    "Overrides the scene's Sunlight for this token — a shaft of light, or an awning."));

  // OUT OF THE SUN THE MOMENT THE GM SAYS SO: "for as long as it remains in the sunlight".
  Hooks.on("updateScene", (scene, changed) => {
    if (!isActingGM() || changed?.flags?.[SYSTEM_ID]?.[SUNLIGHT_FLAG] === undefined) return;
    recheckScene(scene, "the scene is no longer sunlit").catch((err) => console.warn(`${SYSTEM_ID} | sunlight recheck failed`, err));
  });
  Hooks.on("updateToken", (tokenDocument, changed) => {
    if (!isActingGM() || changed?.flags?.[SYSTEM_ID]?.[SUNLIGHT_FLAG] === undefined) return;
    if (sunlightStateOfToken(tokenDocument) === "sun") return;
    liftSunlight(tokenDocument.actor, "moved into shade").catch((err) => console.warn(`${SYSTEM_ID} | sunlight lift failed`, err));
  });
}
