/**
 * Turn-start abilities: the Foundry half.
 *
 * The rules live in creature-turn-start.mjs and are pure. This file does
 * three things and nothing else: notices a turn starting, asks that
 * module what to announce, and posts the cards.
 *
 * It rides the SAME signal the aura work found — `updateCombat` with a
 * changed turn or round is the only moment Foundry announces a turn
 * beginning — and the same acting-GM guard, so two connected GMs produce
 * one card rather than two. That was a real defect in 3.255.2 and there
 * is no reason to learn it twice.
 */
import { isActingGM } from "./acting-gm.mjs";
import { turnStartAnnouncements } from "./creature-turn-start.mjs";
import { regenerationIsAutomatic, regenerationLockedOut } from "./creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";
const line = (html) => `<p>${html}</p>`;

/**
 * Post one card per turn-start ability the creature has.
 *
 * Exported so a harness can drive it with a fake token, and so the
 * hook below is one line rather than a closure full of rules.
 */
export async function announceTurnStart(tokenDocument) {
  const actor = tokenDocument?.actor;
  if (!actor) return 0;

  const announcements = turnStartAnnouncements(
    Array.from(actor.items ?? []),
    actor.system?.identity?.level ?? 0
  );

  // REGENERATION THAT APPLIES ITSELF (3.631.0; Fiends & Fables 3.0 block 1,
  // Graham: "all automated"): the heal written at the start of the turn
  // unless the creature took its regeneration's worth of damage since its
  // last turn, in which case it is disabled for this one. The Injured
  // reduction every 10 minutes stays the rest rail's. The damage record is
  // cleared either way, so the next turn asks its own question.
  const damageSince = Number(actor.getFlag?.(SYSTEM_ID, "damageSinceTurn") ?? 0) || 0;
  if (actor.getFlag?.(SYSTEM_ID, "damageSinceTurn") !== undefined) await actor.unsetFlag(SYSTEM_ID, "damageSinceTurn");
  const autoRegen = regenerationIsAutomatic(Array.from(actor.items ?? []));

  for (const a of announcements) {
    if (a.kind === "regeneration" && autoRegen) {
      const locked = regenerationLockedOut(damageSince, a.amount);
      let healed = 0;
      if (!locked && a.amount > 0) {
        const { healActor } = await import("./magic/spell-effects.mjs");
        healed = Number(await healActor(actor, a.amount, { magical: false })) || 0;
      }
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime trg-check-card"><header class="check-header">`
          + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
          + `<h3>${a.ability}</h3></div></header>`
          + (locked
            ? line(`<strong>Disabled this turn</strong> — it took ${damageSince} damage since its last turn, at least its regeneration of ${a.amount}.`)
            : line(`Regains <strong>${healed} HP</strong> (regeneration ${a.amount}).`))
          + line("<em>Injured is reduced by its value every 10 minutes (the rest rail); a negating damage type is the GM's call.</em>")
          + `</div>`
      });
      continue;
    }
    // SUNLIGHT, WHEN THE GM HAS SAID (3.627.0): applied in the sun, lifted
    // in the shade, and the old card only where the scene says nothing.
    // See sunlight.mjs.
    if (a.kind === "sunlight") {
      const { sunlightStateOfToken, applySunlightAtTurnStart, liftSunlight } = await import("./sunlight-workflow.mjs");
      const state = sunlightStateOfToken(tokenDocument);
      if (state === "sun") { await applySunlightAtTurnStart(tokenDocument, a); continue; }
      if (state === "shade") { await liftSunlight(actor, "begins its turn out of the sun"); continue; }
    }
    const body = [
      a.condition ? line(`<em>${a.condition}</em>`) : "",
      ...a.lines.map((l) => line(l))
    ].join("");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header">`
        + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
        + `<h3>${a.ability}</h3></div></header>${body}`
        + line("<em>Applied by the GM — see the ability's own wording.</em>")
        + `</div>`
    });
  }
  return announcements.length;
}

/** Wire the hook. Called once, from the system's init pass. */
export function registerTurnStartHooks() {
  Hooks.on("updateCombat", async (combat, changed) => {
    if (!isActingGM()) return;
    if (!("turn" in changed) && !("round" in changed)) return;
    const tokenDocument = combat.combatant?.token;
    if (!tokenDocument) return;
    await announceTurnStart(tokenDocument);
  });
}
