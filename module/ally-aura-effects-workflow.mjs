/**
 * Ally-aura effects, the Foundry half (3.634.0; F&F 3.0 block 4 R1). See
 * ally-aura-effects.mjs. The acting GM keeps every token's ally-aura
 * effects in step with where the tokens stand: after a move, a token
 * arriving or leaving, an aura source changing, and on the canvas loading.
 */
import { isActingGM } from "./acting-gm.mjs";
import { ALLY_GRANT_FLAG, allyGrantDelta, allyGrantEffectData, wantedAllyGrants } from "./ally-aura-effects.mjs";

const SYSTEM_ID = "trg-prime";
let pending = null;

async function syncNow() {
  const { auraEmitters, tokenCentreFeet, tokenWidthFeet } = await import("./creature-aura-workflow.mjs");
  const tokens = Array.from(canvas?.tokens?.placeables ?? []).filter((t) => t.actor);
  const emitters = auraEmitters().filter((e) => (e.auras ?? []).some((a) => a.kind === "ally" && (a.allyEffect || a.enemyEffect)));
  const subjects = tokens.map((t) => ({ id: t.id, centreFeet: tokenCentreFeet(t.document), widthFeet: tokenWidthFeet(t.document), disposition: t.document.disposition }));
  const wanted = wantedAllyGrants({ subjects, emitters });
  for (const token of tokens) {
    const actor = token.actor;
    const existing = Array.from(actor.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, ALLY_GRANT_FLAG));
    const delta = allyGrantDelta(existing.map((e) => e.getFlag(SYSTEM_ID, ALLY_GRANT_FLAG)), wanted.get(token.id) ?? []);
    const lift = existing.filter((e) => delta.remove.includes(e.getFlag(SYSTEM_ID, ALLY_GRANT_FLAG))).map((e) => e.id);
    if (lift.length) await actor.deleteEmbeddedDocuments("ActiveEffect", lift);
    if (delta.add.length) await actor.createEmbeddedDocuments("ActiveEffect", delta.add.map((g) => allyGrantEffectData(g)));
  }
}

/** Debounced: a move fires several hooks; one pass answers them all. */
function syncAllyAuraEffects() {
  if (!isActingGM() || !canvas?.ready) return;
  clearTimeout(pending);
  pending = setTimeout(() => { syncNow().catch((e) => console.error(`${SYSTEM_ID} | ally auras`, e)); }, 150);
}

export function registerAllyAuraEffectHooks() {
  Hooks.on("canvasReady", () => syncAllyAuraEffects());
  Hooks.on("updateToken", (doc, changed) => { if ("x" in changed || "y" in changed || "disposition" in changed || "width" in changed) syncAllyAuraEffects(); });
  Hooks.on("createToken", () => syncAllyAuraEffects());
  Hooks.on("deleteToken", () => syncAllyAuraEffects());
  for (const hook of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(hook, (item) => { if (item?.parent?.documentName === "Actor") syncAllyAuraEffects(); });
  }
  // AN AURA SWITCHED ON OR OFF (3.669.0): the effect that carries the switch
  // arriving or leaving changes who is inside it.
  for (const hook of ["createActiveEffect", "deleteActiveEffect"]) {
    Hooks.on(hook, (effect) => { if (effect?.getFlag?.(SYSTEM_ID, "auraSwitch")) syncAllyAuraEffects(); });
  }
}
