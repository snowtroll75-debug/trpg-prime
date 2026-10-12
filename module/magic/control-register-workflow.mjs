/**
 * The control register in a world — page 242's DC 20 Will release.
 *
 * NEW at 3.585.0. See magic/control-register.mjs for the rule and for
 * why the cap could not previously be exceeded by anything.
 */

import { actorHandle, resolveActorHandle } from "../actor-handle.mjs";
import { TRGCheck } from "../dice/check.mjs";
import {
  CONTROL_RELEASE_DC, CONTROL_SOURCES, addControlled, controlOverflow,
  controlledLevels, entryLevel, overflowLine, releasesItself, removeControlled
} from "./control-register.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "controlled";

/** The creatures this caster is holding. */
export function controlledOf(actor) {
  return Array.from(actor?.getFlag?.(SYSTEM_ID, FLAG) ?? []);
}

/** Total creature levels this caster is holding. */
export function controlledLevelsOf(actor) {
  return controlledLevels(controlledOf(actor));
}

/**
 * Record a creature as controlled.
 *
 * A HANDLE, NOT AN ACTOR ID (`verify-actor-handle`). An unlinked token's
 * synthetic actor carries the BASE actor's id, so storing `actor.id`
 * here would mean the release save later rolled against the sheet in the
 * sidebar while the creature on the map went on serving its master.
 * Most NPCs — and nearly all summons — are unlinked.
 *
 * @param {Actor} actor the controller
 * @param {object} options
 * @param {Actor|null} [options.target] the controlled creature, if known
 * @param {Token|null} [options.token] its token, if known
 * @param {number} options.level the creature's level
 * @param {string} [options.name] used when no creature document is known
 * @param {string} [options.source] a key of CONTROL_SOURCES
 * @returns {Promise<object>} the entry
 */
export async function recordControlled(actor, { target = null, token = null, level = 0, name = "", source = "other" } = {}) {
  const handle = target ? actorHandle(target, token) : null;
  const entry = {
    id: foundry.utils.randomID(),
    handle,
    name: target?.name ?? String(name || "Controlled creature"),
    level: Math.max(0, Math.floor(Number(level) || 0)),
    source: CONTROL_SOURCES[source] ? source : "other"
  };
  await actor.setFlag(SYSTEM_ID, FLAG, addControlled(controlledOf(actor), entry));
  return entry;
}

/** Let one creature go. */
export async function releaseControlled(actor, id) {
  const before = controlledOf(actor);
  const gone = before.find((e) => String(e?.id) === String(id)) ?? null;
  await actor.setFlag(SYSTEM_ID, FLAG, removeControlled(before, id));
  return gone;
}

/**
 * The per-round pull, run at the start of the controller's turn.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE SAVE PER ROUND, NOT A LOOP TO SAFETY.
 *
 * "the highest-level creature ... can make a DC 20 Will saving throw
 * every round to release itself. This process will continue until you
 * have less than equal to your control levels under your control."
 *
 * The continuation is across ROUNDS — one creature, one save, each
 * round — not a while-loop that frees creatures until the caster is
 * back under. Reading it as a loop would empty an over-committed
 * caster's whole retinue in a single turn on a run of good rolls, which
 * is a far harsher rule than the page's steady pressure.
 *
 * A LEVEL-ONLY ENTRY CANNOT ROLL, so it is reported instead. The GM
 * placed that creature themselves and is the only one who knows which
 * token it is; the card names it and offers the release, rather than
 * this inventing a save for a creature it cannot find.
 *
 * @param {Actor} actor
 * @returns {Promise<object|null>} what happened, or null when under the cap
 */
export async function sweepControlOverflow(actor) {
  const entries = controlledOf(actor);
  if (!entries.length) return null;

  const overflow = controlOverflow(entries, Number(actor.system?.magic?.controlLevels ?? 0));
  if (overflow.over <= 0 || !overflow.highest) return null;

  const creature = overflow.highest.handle ? await resolveActorHandle(overflow.highest.handle) : null;

  if (!creature) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header">`
        + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
        + `<h3>Control Levels — over the cap</h3></div></header>`
        + `<p style="margin:2px 0">${overflowLine(overflow)}</p>`
        + `<p style="margin:2px 0"><em>No token is linked to this entry — roll its Will save, `
        + `and release it from the Magic tab if it succeeds.</em></p></div>`
    });
    return { overflow, rolled: false, released: false };
  }

  const will = creature.system?.combat?.saves?.will;
  const check = await TRGCheck.roll({
    actor: creature,
    label: "Break Control",
    subject: "will",
    subtitle: `DC ${CONTROL_RELEASE_DC} — ${actor.name} is ${overflow.over} control level${overflow.over === 1 ? "" : "s"} over`,
    type: "save",
    dc: CONTROL_RELEASE_DC,
    modifiers: [...(will?.checkModifiers ?? [{ label: "Will", value: Number(will?.total ?? 0), type: "untyped" }])]
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const freed = releasesItself(degree);
  if (freed) await releaseControlled(actor, overflow.highest.id);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
      + `<h3>Control Levels — over the cap</h3></div></header>`
      + `<p style="margin:2px 0">${overflowLine(overflow)}</p>`
      + `<p style="margin:2px 0">${freed
        ? `<strong>${creature.name} breaks free.</strong> ${controlledLevelsOf(actor)} of ${overflow.cap} control levels now held.`
        : `<strong>${creature.name} remains under control</strong> — it tries again next round.`}</p></div>`
  });

  return { overflow, rolled: true, released: freed, degree };
}

/**
 * Offer to record what a cast just conjured.
 *
 * WHY THIS ASKS RATHER THAN ASSUMES. `conjuredCreatureNote` reports a
 * LEVEL and the GM places whatever creature they like — the system
 * creates no token — so there is nothing here to read. If a token is
 * selected when the prompt appears it is taken as the creature, which
 * makes the common case ("place it, then answer yes") one click and
 * gives the entry a handle that can roll its own save.
 *
 * @param {Actor} actor the caster
 * @param {number} level the conjured creature's level
 * @param {string} spellName
 * @returns {Promise<object|null>} the entry, or null if declined
 */
export async function offerConjuredControl(actor, level, spellName) {
  const { DialogV2 } = foundry.applications.api;
  const held = controlledLevelsOf(actor);
  const cap = Number(actor.system?.magic?.controlLevels ?? 0);
  const selected = globalThis.canvas?.tokens?.controlled?.[0] ?? null;

  const take = await DialogV2.confirm({
    window: { title: "Control Levels" },
    content: `<p><strong>${spellName}</strong> conjures a level ${level} creature.</p>`
      + `<p>${actor.name} holds <strong>${held} of ${cap}</strong> control levels; this would make it `
      + `<strong>${held + level}</strong>${held + level > cap ? " — over the cap, so it will pull to break free each round" : ""}.</p>`
      + (selected
        ? `<p>The selected token <strong>${selected.name}</strong> will be recorded as the creature.</p>`
        : `<p><em>No token selected — the level will be recorded without one, and its Will save rolled by hand.</em></p>`)
      + `<p>Record it against ${actor.name}'s control levels?</p>`,
    rejectClose: false
  });
  if (!take) return null;

  return recordControlled(actor, {
    target: selected?.actor ?? null,
    token: selected,
    level,
    name: `${spellName} (level ${level})`,
    source: "conjured"
  });
}

/*
 * The "Record as controlled" card button (until 3.632.0). Aligned Control now
 * records the creature itself when the save lands it; the listener below stays
 * for the buttons on cards already in a world's chat log.
 */

/** Wire the card button. */
export function registerControlRegisterCardListeners() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    for (const button of html.querySelectorAll?.('[data-action="recordControlled"]') ?? []) {
      button.addEventListener("click", async () => {
        let payload = null;
        try {
          payload = JSON.parse(button.dataset.payload || "{}");
        } catch {
          return;
        }
        const controller = await resolveActorHandle(payload.controller ?? {});
        const target = await resolveActorHandle(payload.target ?? {});
        if (!controller) return;
        await recordControlled(controller, {
          target,
          level: payload.level,
          name: payload.name,
          source: "aligned"
        });
        const summary = controlSummary(controller);
        ui.notifications.info(
          `${payload.name} recorded — ${controller.name} holds ${summary.held} of ${summary.cap} control levels`
          + `${summary.over > 0 ? `, ${summary.over} over` : ""}.`
        );
      });
    }
  });
}

/** The Magic tab's list of what is held, and how close to the cap. */
export function controlSummary(actor) {
  const entries = controlledOf(actor);
  const cap = Number(actor?.system?.magic?.controlLevels ?? 0);
  return {
    entries: entries.map((e) => ({ ...e, level: entryLevel(e), sourceLabel: CONTROL_SOURCES[e.source] ?? CONTROL_SOURCES.other })),
    held: controlledLevels(entries),
    cap,
    over: Math.max(0, controlledLevels(entries) - cap)
  };
}
