/**
 * Extraplanar death, the Foundry half (3.633.0; F&F 3.0 R14). See
 * extraplanar.mjs for the rule.
 */
import { isActingGM } from "./acting-gm.mjs";
import { extraplanarDestructionLine, extraplanarMookDiesAtZero } from "./extraplanar.mjs";

const SYSTEM_ID = "trg-prime";
const enabled = () => {
  try { return game.settings.get(SYSTEM_ID, "extraplanarDestruction") !== false; } catch (_e) { return true; }
};

/** Called by reapDead once a creature is dead: the card, once. */
export async function announceExtraplanarDestruction(actor) {
  const said = extraplanarDestructionLine(actor, { enabled: enabled() });
  if (!said || actor.getFlag?.(SYSTEM_ID, "extraplanarDestroyed")) return false;
  await actor.setFlag?.(SYSTEM_ID, "extraplanarDestroyed", { at: Number(game.time?.worldTime ?? 0) });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Extraplanar</h3></div></header>`
      + `<p style="margin:2px 0">${said}</p><p style="margin:2px 0"><em>What happens beyond this is the GM's (Fiends &amp; Fables, page 7).</em></p></div>`
  });
  return true;
}

async function dieAtZero(actor) {
  const { actorDeathState, reapDead } = await import("./combat/death-state.mjs");
  const fatal = Math.max(0, Math.floor(Number(actorDeathState(actor)) || 0)) + 1;
  await actor.toggleStatusEffect("dying", { active: true, value: fatal });
  return reapDead(actor);
}

export function registerExtraplanarHooks() {
  // WADE THROUGH THE MOOKS: an Extraplanar mook dies at 0 HP.
  Hooks.on("updateActor", (actor, changed) => {
    if (!isActingGM()) return;
    const hp = changed?.system?.resources?.hp?.value ?? changed?.["system.resources.hp.value"];
    if (hp === undefined || Number(hp) > 0) return;
    if (actor.statuses?.has?.("dead")) return;
    if (!extraplanarMookDiesAtZero(actor, { enabled: enabled() })) return;
    // DEAD, NOT DYING (3.633.1, found live: reapDead declines a creature
    // that is not yet dead, so 3.633.0's hook did nothing). Dying is set one
    // past the creature's Death State — the system's one shape for death —
    // and the reap then lays the skull and posts the destruction card.
    dieAtZero(actor).catch((e) => console.error(`${SYSTEM_ID} | extraplanar`, e));
  });
}
