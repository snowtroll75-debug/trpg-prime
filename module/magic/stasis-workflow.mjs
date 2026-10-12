/**
 * Stasis against real documents — the Foundry half of stasis.mjs (3.614.0,
 * Graham's R2 of block 35). The rules and the reasons are there.
 */

import {
  STASIS_FLAG, normaliseStasis, stasisEffectOf, stasisSaveOutcome, stasisElapsed,
  resumedClockUpdates, shortenedStasisUpdates, stasisLine, stasisTurnLine
} from "./stasis.mjs";

const SYSTEM_ID = "trg-prime";
const ROUND_SECONDS = 6;

const now = () => ({
  round: game.combat?.started ? Number(game.combat.round ?? 0) : null,
  worldTime: Number(game.time?.worldTime ?? 0)
});

/** The stasis effect on this actor, or null. */
export function stasisOn(actor) {
  return stasisEffectOf(Array.from(actor?.effects ?? []));
}

/**
 * Put a creature in stasis. Called by the effect engine's `stasis` row.
 * @returns {Promise<string>} the card line
 */
export async function applyStasis(target, spell, raw, { castId = null, saveDC = null, img = null } = {}) {
  const spec = normaliseStasis(raw);
  if (!spec || !target) return `<em>${spell?.name ?? "The spell"} declares a malformed stasis.</em>`;
  // ONE STASIS AT A TIME: a second casting replaces the first rather than
  // stacking two clocks that would each freeze the other.
  const existing = stasisOn(target);
  if (existing) await existing.delete();
  const t = now();
  const flags = {
    [SYSTEM_ID]: {
      [STASIS_FLAG]: { ...spec, dc: Number(saveDC) || null, startRound: t.round, startTime: t.worldTime },
      spellBuff: true,
      spellEffect: true,
      spellEffectEnd: t.worldTime + spec.rounds * ROUND_SECONDS,
      ...(t.round !== null ? { conditionExpiresRound: t.round + spec.rounds } : {}),
      ...(castId ? { castId } : {})
    }
  };
  await target.createEmbeddedDocuments("ActiveEffect", [{
    name: spec.label,
    img: img || "icons/magic/time/hourglass-tilted-gray.webp",
    origin: spell?.uuid ?? null,
    changes: [],
    flags
  }]);
  return stasisLine(target.name, spec);
}

/*
 * THE CLOCKS MOVE ON BEFORE THE STASIS GOES (3.614.1, F1 of the 3.614.0 drive).
 *
 * 3.614.0 moved them in the `deleteActiveEffect` hook, AFTER the delete. The
 * drive showed what that costs: a round's change moves the world clock and
 * starts the next turn together, so the world-time sweep let a Fumble's
 * stasis go while the turn's own sweep was already running — and that sweep,
 * seeing no stasis and Fleeing's old clock, expired the Fleeing the stasis had
 * been holding. "Resume where they stood" lost the race it was written for.
 *
 * Every route the system ends a stasis by now comes through here: the clocks
 * are written first, so any sweep that no longer sees the stasis already sees
 * them moved, and the delete then tells the hook it has nothing left to do.
 * Two sweeps reaching the same stasis at once release it once.
 */
const RESUMED_OPTION = "trgStasisResumed";
const releasing = new Set();

/** Move the creature's other effects' clocks on by the time the stasis lasted. */
async function resumeFrozenClocks(actor, record, stasisId) {
  const elapsed = stasisElapsed(record, now());
  const updates = [];
  for (const other of actor.effects ?? []) {
    if (other.id === stasisId || other.flags?.[SYSTEM_ID]?.[STASIS_FLAG]) continue;
    const u = resumedClockUpdates(other.flags?.[SYSTEM_ID], elapsed);
    if (Object.keys(u).length) updates.push({ _id: other.id, ...u });
  }
  if (updates.length) await actor.updateEmbeddedDocuments("ActiveEffect", updates);
  return updates.length;
}

/**
 * End a stasis: its creature's clocks first, then the stasis itself.
 * @param {ActiveEffect} effect the stasis effect
 * @returns {Promise<boolean>} whether this call released it
 */
export async function releaseStasis(effect) {
  const record = effect?.flags?.[SYSTEM_ID]?.[STASIS_FLAG];
  const actor = effect?.parent;
  if (!record || !actor?.effects?.get?.(effect.id)) return false;
  const key = effect.uuid ?? `${actor.uuid}.${effect.id}`;
  if (releasing.has(key)) return false;
  releasing.add(key);
  try {
    const resumed = await resumeFrozenClocks(actor, record, effect.id);
    if (!actor.effects.get(effect.id)) return false;
    await effect.delete({ [RESUMED_OPTION]: resumed });
    return true;
  } finally {
    releasing.delete(key);
  }
}

/** The release card's sentence. */
function releasedLine(name, resumed) {
  return `<strong>${name}</strong> is released from stasis`
    + (resumed ? ` — ${resumed} effect${resumed === 1 ? " resumes where it" : "s resume where they"} stood.` : ".");
}

/**
 * The start of a creature's turn in stasis: it cannot act.
 * @returns {Promise<string|null>} the card line, or null when not in stasis
 */
export async function stasisTurnStart(actor) {
  if (!stasisOn(actor)) return null;
  const ap = actor.system?.resources?.ap;
  if (ap && Number(ap.value) !== 0) await actor.update({ "system.resources.ap.value": 0 });
  return stasisTurnLine(actor.name);
}

/**
 * The end of a creature's turn in stasis: the Fumble's save, if it owes one.
 * @returns {Promise<string[]|null>} the card lines, or null when not in stasis
 */
export async function stasisTurnEnd(actor) {
  const effect = stasisOn(actor);
  if (!effect) return null;
  const record = effect.flags?.[SYSTEM_ID]?.[STASIS_FLAG] ?? {};
  // NOTHING OWED: the turn-start card already said it is held. An empty list
  // still tells the caller the rest of the turn's end does not run.
  if (!record.saveEachTurn) return [];
  if (!record.dc) return [`<em>${actor.name} may save against the stasis, but no DC was recorded — roll it by hand.</em>`];
  const { TRGCheck } = await import("../dice/check.mjs");
  const key = record.save || "will";
  const name = key.charAt(0).toUpperCase() + key.slice(1);
  const save = actor.system?.combat?.saves?.[key];
  const check = await TRGCheck.roll({
    actor,
    label: `${actor.name} — ${name} Save`,
    subtitle: `Stasis — DC ${record.dc}`,
    type: "save",
    subject: key,
    dc: record.dc,
    saveSource: record.label || "Stasis",
    modifiers: save?.checkModifiers ?? [{ label: `${name} save`, value: Number(save?.total ?? 0), type: "untyped" }]
  });
  const outcome = stasisSaveOutcome(check?.outcome?.degree ?? null);
  if (outcome === "end") {
    await releaseStasis(effect);
    return [`<strong>${actor.name}</strong> breaks free of the stasis (${check?.outcome?.degree?.label ?? "Critical"}).`];
  }
  if (outcome === "shorten") {
    const updates = shortenedStasisUpdates(effect.flags?.[SYSTEM_ID]);
    const left = Number(updates["flags.trg-prime.conditionExpiresRound"] ?? NaN);
    const t = now();
    // A ROUND TAKEN OFF THE LAST ROUND ENDS IT.
    if (Number.isFinite(left) && t.round !== null && left <= t.round) {
      await releaseStasis(effect);
      return [`<strong>${actor.name}</strong>'s stasis ends a round early — the last round is taken off.`];
    }
    await effect.update(updates);
    return [`<strong>${actor.name}</strong> takes a round off its stasis (${check?.outcome?.degree?.label ?? "Success"}).`];
  }
  return [`<em>${actor.name} stays in stasis.</em>`];
}

/** Register the hooks. Called once, at init. */
export function registerStasis() {
  // CANNOT BE TARGETED — WARNED, NOT BLOCKED (Graham's R2: "Warn").
  globalThis.Hooks.on("targetToken", (user, token, targeted) => {
    try {
      if (!targeted || user?.id !== game.user?.id) return;
      if (stasisOn(token?.actor)) {
        ui.notifications.warn(`${token.name} is in stasis and cannot be targeted by anything.`);
      }
    } catch (err) {
      console.warn(`${SYSTEM_ID} | stasis target warning failed`, err);
    }
  });
  // IMMOVABLE — a move is refused, by anyone. The GM ends the stasis to move it.
  globalThis.Hooks.on("preUpdateToken", (doc, change) => {
    if (!("x" in (change ?? {}) || "y" in (change ?? {}))) return true;
    if (!stasisOn(doc?.actor)) return true;
    ui.notifications.warn(`${doc.name} is in stasis and cannot be moved.`);
    return false;
  });
  // NO TIME PASSED FOR IT: when the stasis goes, its other effects' clocks move
  // on by the time it lasted. The active GM writes.
  // A STASIS THE GM DELETES BY HAND still moves the clocks here; one the
  // system ended through `releaseStasis` has already moved them.
  globalThis.Hooks.on("deleteActiveEffect", async (effect, options) => {
    try {
      const record = effect?.flags?.[SYSTEM_ID]?.[STASIS_FLAG];
      if (!record) return;
      if (game.users?.activeGM && game.users.activeGM.id !== game.user?.id) return;
      const actor = effect.parent;
      if (!actor?.effects) return;
      const already = options?.[RESUMED_OPTION];
      const resumed = already !== undefined && already !== null
        ? Number(already) || 0
        : await resumeFrozenClocks(actor, record, effect.id);
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<div class="trg-prime"><p>${releasedLine(actor.name, resumed)}</p></div>`
      });
    } catch (err) {
      console.warn(`${SYSTEM_ID} | stasis release failed`, err);
    }
  });
}
