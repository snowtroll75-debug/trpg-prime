/**
 * THE SPAWN TRAIT, APPLIED (3.632.0; Fiends & Fables 3.0 block 2, ruling 8).
 *
 * "Upon first becoming a Spawn, the creature gains the Injured 2 condition.
 * The Spawn can remove the Injured condition by feeding upon (or otherwise
 * siphoning the essence of) a living creature with an Effective Level (EL)
 * at least half that of the Spawn. … If the Spawn does not do so within 72
 * hours, it remains Injured 2 for another 72 hours. This cycle continues
 * until the Spawn feeds successfully."
 *
 * The rules have been data since the Codex V1.5 traits (codex-trait-rules
 * `codexTraitNotes`); nothing applied them. Now:
 *
 *   - the trait arriving on an actor (created with it, or given it) applies
 *     Injured 2 once and records when (`flags.trg-prime.spawn.since`);
 *   - its card carries a FED button: target the creature fed upon — living,
 *     at least half the Spawn's level — and the Injured comes off;
 *   - the Undead Spawn kill hook (codex-hooks-workflow) records the killer
 *     on the victim as `flags.trg-prime.spawnCreator`, which Aligned Control
 *     reads for the Control Vulnerability.
 *
 * "In a manner appropriate to the Spawn's nature" stays the GM's: the
 * button asks only what the page measures.
 */
import { isActingGM } from "./acting-gm.mjs";
import { isSpawn, SPAWN_INJURED, spawnFeedingLevel } from "./codex-trait-rules.mjs";

const SYSTEM_ID = "trg-prime";
const SPAWN_FLAG = "spawn";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const levelOf = (a) => Math.max(0, Math.floor(Number(a?.system?.identity?.level ?? 0) || 0));

/** Apply the trait's Injured 2 the first time the actor is a Spawn. */
async function settleSpawn(actor) {
  if (!actor || !isSpawn(actor.system)) return false;
  if (actor.getFlag?.(SYSTEM_ID, SPAWN_FLAG)?.since !== undefined) return false;
  const since = Number(game.time?.worldTime ?? 0);
  await actor.setFlag(SYSTEM_ID, SPAWN_FLAG, { since, fed: false });
  const current = Number(actor.getConditionValue?.("injured") ?? 0);
  if (current < SPAWN_INJURED) await actor.toggleStatusEffect("injured", { active: true, value: SPAWN_INJURED });
  const creator = actor.getFlag?.(SYSTEM_ID, "spawnCreator");
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>Spawn</h3></div></header>`
      + line(`${actor.name} becomes a Spawn${creator?.name ? ` of <strong>${creator.name}</strong>` : ""}: <strong>Injured ${SPAWN_INJURED}</strong>.`)
      + line(`It lifts when ${actor.name} feeds on a living creature of level <strong>${spawnFeedingLevel(levelOf(actor))}</strong> or more (half its own). Unfed, it stays Injured ${SPAWN_INJURED}, 72 hours at a time.`)
      + line(`<em>Saves against control from its creator are one degree worse.</em>`)
      + `<p><button type="button" data-trg-spawn-fed="${actor.uuid}">Fed — target the creature it fed upon</button></p></div>`
  });
  return true;
}

/** The Fed button: the targeted creature is the meal. */
async function pressFed(spawnUuid) {
  const spawn = await fromUuid(spawnUuid);
  if (!spawn) return;
  const meal = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  if (!meal) { ui.notifications?.warn("Spawn: target the creature it fed upon."); return; }
  const { isLivingCreature } = await import("./kind-targeting.mjs");
  const needed = spawnFeedingLevel(levelOf(spawn));
  if (!isLivingCreature(meal.system ?? {})) { ui.notifications?.warn(`Spawn: ${meal.name} is not a living creature.`); return; }
  if (levelOf(meal) < needed) { ui.notifications?.warn(`Spawn: ${meal.name} is level ${levelOf(meal)}; ${spawn.name} needs a meal of level ${needed} or more.`); return; }
  await spawn.toggleStatusEffect("injured", { active: false });
  await spawn.setFlag(SYSTEM_ID, SPAWN_FLAG, { ...(spawn.getFlag(SYSTEM_ID, SPAWN_FLAG) ?? {}), fed: true, fedAt: Number(game.time?.worldTime ?? 0), fedOn: meal.name });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: spawn }),
    content: `<div class="trg-prime trg-check-card">${line(`${spawn.name} feeds on <strong>${meal.name}</strong> (level ${levelOf(meal)}, at least ${needed}): the Spawn's <strong>Injured</strong> is removed.`)}</div>`
  });
}

function touchesTraits(changed) {
  if (!changed || typeof changed !== "object") return false;
  if (Object.keys(changed).some((k) => k.startsWith("system.details"))) return true;
  const d = changed?.system?.details;
  return Boolean(d && ("traits" in d || "grantedTraits" in d || "creatureType" in d));
}

export function registerSpawnHooks() {
  Hooks.on("createActor", (actor) => { if (isActingGM()) settleSpawn(actor).catch((e) => console.error(`${SYSTEM_ID} | Spawn`, e)); });
  Hooks.on("updateActor", (actor, changed) => {
    if (isActingGM() && touchesTraits(changed)) settleSpawn(actor).catch((e) => console.error(`${SYSTEM_ID} | Spawn`, e));
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll?.("[data-trg-spawn-fed]") ?? []) {
      if (button.dataset.bound) continue;
      button.dataset.bound = "1";
      button.addEventListener("click", (event) => {
        event.preventDefault();
        pressFed(button.dataset.trgSpawnFed).catch((e) => console.error(`${SYSTEM_ID} | Spawn fed`, e));
      });
    }
  });
}
