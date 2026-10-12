/**
 * THE SWARM'S ATTACK, WHEN IT MOVES IN (3.632.0; Fiends & Fables 3.0 block 2,
 * ruling 9).
 *
 * Chapter 3: "Swarms do not make attacks in the same manner as most
 * creatures. … When a swarm moves into or occupies an area occupied by
 * another creature, that creature must attempt the saving throw listed in
 * the swarm's attack entry."
 *
 * So the attack is ASKED, not chosen, at the two moments the page names: the
 * swarm's token moving onto creatures (only the creatures it newly covers),
 * and the start of the swarm's turn (every creature in its space — it
 * occupies their area). No AP is spent; the module's "Action 1 AP" Use
 * button stays for a GM who runs the swarm by hand. Rolled through the area
 * rail with scope "sharedSpace" (creature-area.mjs `moduleSwarmArea`).
 */
import { isActingGM } from "./acting-gm.mjs";
import { isSwarm } from "./codex-trait-rules.mjs";
import { declaredArea, declaredAreaUse } from "./creature-area.mjs";
import { tokenSquares } from "./combat/geometry.mjs";

const SYSTEM_ID = "trg-prime";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;

function swarmAttackOf(actor) {
  if (!actor || !isSwarm(actor.system)) return null;
  return Array.from(actor.items ?? []).find((i) => declaredArea(i)?.scope === "sharedSpace") ?? null;
}

/** The actors whose squares a token covers (enemies only when the attack says so). */
function coveredActors(tokenDocument, enemiesOnly) {
  const object = tokenDocument?.object;
  if (!object) return [];
  const mine = new Set(tokenSquares(object).map((q) => `${q.col}:${q.row}`));
  const out = [];
  for (const t of tokenDocument.parent?.tokens ?? []) {
    if (t.id === tokenDocument.id || !t.actor || !t.object) continue;
    if (enemiesOnly && t.disposition === tokenDocument.disposition) continue;
    if (tokenSquares(t.object).some((q) => mine.has(`${q.col}:${q.row}`))) out.push(t.actor);
  }
  return out;
}

/** Roll the swarm's attack against these creatures — no AP, the page's own trigger. */
async function runSwarmAttack(actor, item, targets, reason) {
  if (!targets.length) return null;
  const use = declaredAreaUse(item, { worldTime: Number(game.time?.worldTime ?? 0) });
  if (!use.spec) return null;
  const { perilEffectSpec } = await import("./peril-effect.mjs");
  const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
  const spec = perilEffectSpec(use.spec, "");
  const rolled = await runDeclaredAreaEffect(actor, spec, { title: item.name, targets });
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${item.name}</h3></div></header>`
      + line(`<em>${reason} — the Swarm trait asks the save; no AP is spent.</em>`)
      + rolled.join("") + `</div>`
  });
}

async function onSwarmMoved(tokenDocument, before) {
  const actor = tokenDocument?.actor;
  const item = swarmAttackOf(actor);
  if (!item) return;
  const enemiesOnly = declaredArea(item)?.enemiesOnly === true;
  const now = coveredActors(tokenDocument, enemiesOnly);
  // Only the creatures it has newly moved onto: a swarm shuffling within the
  // same space does not bite twice for one occupation.
  const fresh = now.filter((a) => !before.has(a.id));
  await runSwarmAttack(actor, item, fresh, `${actor.name} moves into their space`);
}

async function onTurnStart(combat, changed) {
  if (!("turn" in changed) && !("round" in changed)) return;
  const tokenDocument = combat?.combatant?.token;
  const actor = tokenDocument?.actor;
  const item = swarmAttackOf(actor);
  if (!item) return;
  const targets = coveredActors(tokenDocument, declaredArea(item)?.enemiesOnly === true);
  await runSwarmAttack(actor, item, targets, `${actor.name} begins its turn occupying their space`);
}

export function registerSwarmHooks() {
  // Who it covered BEFORE the move, read in preUpdate while the old
  // position is still the placeable's.
  const covering = new Map();
  Hooks.on("preUpdateToken", (tokenDocument, changed) => {
    if (!("x" in changed) && !("y" in changed)) return;
    if (!swarmAttackOf(tokenDocument?.actor)) return;
    covering.set(tokenDocument.id, new Set(coveredActors(tokenDocument, false).map((a) => a.id)));
  });
  Hooks.on("updateToken", (tokenDocument, changed) => {
    if (!isActingGM() || (!("x" in changed) && !("y" in changed))) return;
    const before = covering.get(tokenDocument.id) ?? new Set();
    covering.delete(tokenDocument.id);
    // After the placeable has caught up with the document.
    setTimeout(() => { onSwarmMoved(tokenDocument, before).catch((e) => console.error(`${SYSTEM_ID} | Swarm`, e)); }, 0);
  });
  Hooks.on("updateCombat", (combat, changed) => {
    if (isActingGM()) onTurnStart(combat, changed).catch((e) => console.error(`${SYSTEM_ID} | Swarm turn`, e));
  });
}
