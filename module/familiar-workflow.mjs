/**
 * Creating and maintaining a familiar — the Foundry half.
 *
 * The pure decisions live in familiar.mjs and familiar-derive.mjs. What
 * lives here is everything that needs a live world: reading the pack,
 * creating the actor, pushing the mirror across, and the two rolls the
 * book asks for (losing a familiar, and obtaining a new one).
 *
 * THE MIRROR IS PUSHED, NOT PULLED, for the reason companion.mjs
 * records for its level. What is different here is HOW OFTEN: a
 * companion's level moves when its master levels, and nothing else; a
 * familiar's mirror moves when its master levels, spends a skill point,
 * gains hit points, changes class, or takes a feat that touches any of
 * those. There is no small set of paths to watch, so the gate is not on
 * the diff at all — it is on whether this actor HAS a familiar, answered
 * in constant time by a flag, and the mirror is then rebuilt and
 * compared. Rebuilding it is one object; the scan of `game.actors` it
 * replaces is not.
 */

const { DialogV2 } = foundry.applications.api;

import {
  FAMILIAR_PACK,
  familiarActorData,
  familiarComponentCost,
  familiarLossOutcome,
  familiarMasterId,
  familiarMirrorFrom,
  familiarSyncState,
  isFamiliar,
  isFamiliarOf
} from "./familiar.mjs";
import { contentPack } from "./content-packs.mjs";

const SYSTEM_ID = "trg-prime";

/** The flag on a MASTER that says "this actor has a familiar". */
export const HAS_FAMILIAR_FLAG = "hasFamiliar";

/** Every familiar in the world bound to this master. */
export function familiarsOf(masterActor) {
  const id = masterActor?.id;
  if (!id) return [];
  return Array.from(game.actors ?? []).filter((a) => isFamiliarOf(a, id));
}

/** The master a familiar is bound to, or null. */
export function masterOfFamiliar(familiarActor) {
  const id = familiarMasterId(familiarActor);
  return id ? (game.actors?.get(id) ?? null) : null;
}

/**
 * The cheap gate for the updateActor hook.
 *
 * A flag rather than a scan, because this is asked on every actor update
 * in the world. Set when a familiar is created, cleared when the last
 * one goes, and repaired by `syncFamiliars` itself — so a flag that has
 * somehow gone stale costs one wrong answer, not a permanent one.
 */
export function mayHaveFamiliar(actor) {
  return Boolean(actor?.getFlag?.(SYSTEM_ID, HAS_FAMILIAR_FLAG));
}

/**
 * Push a master's numbers onto every familiar bound to it.
 *
 * Rebuilds the mirror from the master's CURRENT derived data and writes
 * it only when something actually changed — this runs on every update to
 * a master with a familiar, including HP ticks, so a no-op has to cost
 * nothing but a comparison.
 *
 * @param {Actor} masterActor
 * @param {object} [options]
 * @param {boolean} [options.announce] Post a card when something moved.
 * @returns {Promise<string[]>} report lines.
 */
export async function syncFamiliars(masterActor, { announce = false } = {}) {
  const lines = [];
  const familiars = familiarsOf(masterActor);

  // Keep the gate honest in both directions: a master who has one and is
  // not flagged starts being watched, and one whose familiar has been
  // deleted stops. Both are cheap and both are only reached from a path
  // that has already scanned.
  const flagged = mayHaveFamiliar(masterActor);
  if (familiars.length && !flagged) {
    await masterActor.setFlag(SYSTEM_ID, HAS_FAMILIAR_FLAG, true);
  } else if (!familiars.length && flagged) {
    await masterActor.unsetFlag(SYSTEM_ID, HAS_FAMILIAR_FLAG);
  }
  if (!familiars.length) return lines;

  const current = familiarMirrorFrom(masterActor.system, masterActor.name);
  for (const familiar of familiars) {
    const stored = familiar.system?.familiar?.mirror ?? null;
    const state = familiarSyncState({ stored, current, hasMaster: true });
    if (state.inSync) continue;
    if (!familiar.isOwner) {
      lines.push(
        `${familiar.name} is out of step with you — you do not have permission to edit it. ` +
        "Ask your GM to open it, or press Daily Preparation on a character who owns it."
      );
      continue;
    }
    await familiar.update({
      "system.identity.level": current.level,
      "system.familiar.syncedAtLevel": current.level,
      "system.familiar.masterName": masterActor.name,
      "system.familiar.mirror": current
    });
    lines.push(
      `${familiar.name} caught up with you (${state.drifted.join(", ")}).`
    );
  }

  if (announce && lines.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: masterActor }),
      content: `<div class="trg-prime"><h3>Familiar</h3>` +
        lines.map((text) => `<p>${text}</p>`).join("") + `</div>`
    });
  }
  return lines;
}

/** The stat-block race item every familiar carries. */
async function familiarStatBlock() {
  const pack = contentPack(FAMILIAR_PACK);
  if (!pack) return null;
  const docs = await pack.getDocuments();
  return docs.find((d) => d.type === "race" && d.name === "Familiar") ?? null;
}

/** The abilities available to pick, from the familiars pack. */
export async function familiarAbilityChoices() {
  const pack = contentPack(FAMILIAR_PACK);
  if (!pack) return [];
  const docs = await pack.getDocuments();
  return docs
    .filter((d) => d.type === "ability")
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The Familiar feat's Use button.
 *
 * Refuses rather than making a second one, for the same reason the
 * animal companion does: the book describes obtaining one, losing one
 * and replacing one, never having two.
 *
 * "To obtain a familiar you must spend an hour in quiet meditation
 * immediately after daily preparation. At the end of this time, you must
 * expend 100 gp per level in magical components." The cost is REPORTED
 * rather than deducted — this system does not automatically spend a
 * character's money anywhere else, and a button that quietly emptied a
 * purse would be the first.
 */
export async function createFamiliarFor(masterActor, featItem) {
  const existing = familiarsOf(masterActor);
  if (existing.length) {
    ui.notifications.warn(
      `${masterActor.name} already has a familiar (${existing.map((f) => f.name).join(", ")}). ` +
      "Delete the old actor first if it has died or been dismissed."
    );
    return null;
  }

  const statBlock = await familiarStatBlock();
  if (!statBlock) {
    ui.notifications.warn("Familiar: the Familiar stat block is missing from the compendium.");
    return null;
  }

  const form = await askFamiliarForm();
  if (form === null) return null;

  const level = Math.max(1, Math.floor(Number(masterActor.system?.identity?.level ?? 1)));
  const mirror = familiarMirrorFrom(masterActor.system, masterActor.name);
  const familiar = await Actor.create(familiarActorData({
    masterId: masterActor.id,
    masterName: masterActor.name,
    form,
    level,
    ownership: masterActor.ownership,
    img: statBlock.img,
    mirror
  }));
  if (!familiar) return null;

  await familiar.createEmbeddedDocuments("Item", [statBlock.toObject()]);
  // The stat block's granted senses and its Bite arrive through the
  // ordinary grant path rather than being reproduced here (lesson 13).
  const { applyAllGrants } = await import("./grants-workflow.mjs");
  for (const owned of familiar.items.filter((i) => i.type === "race")) {
    await applyAllGrants(familiar, owned);
  }
  // Empathic Link is not a choice — "a familiar begins at 1st level with
  // 2 abilities AND the Empathic Link ability" — so it is placed rather
  // than offered, and costs none of the allowance.
  const abilities = await familiarAbilityChoices();
  const link = abilities.find((a) => a.name === "Empathic Link");
  if (link) await familiar.createEmbeddedDocuments("Item", [link.toObject()]);

  await familiar.setFlag(SYSTEM_ID, "grantedBy", {
    sourceId: featItem?.id ?? "", sourceName: featItem?.name ?? "Familiar", actorId: masterActor.id
  });
  await masterActor.setFlag(SYSTEM_ID, HAS_FAMILIAR_FLAG, true);

  await postFamiliarCard(masterActor, familiar, level);
  return familiar;
}

/** "You must choose the form of a tiny animal." */
async function askFamiliarForm() {
  const result = await DialogV2.wait({
    window: { title: "Familiar", icon: "fa-solid fa-crow" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p>Choose the form of a tiny animal. The form is appearance only — an owl
      familiar gains no flight and a cat no claws. Every familiar has the same
      statistics, and what it can actually do comes from the abilities you pick
      for it.</p>
      <div class="form-group"><label>Form</label>
      <input type="text" name="form" placeholder="Owl" autofocus></div></div>`,
    buttons: [
      {
        action: "ok", label: "Summon", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return String(result.form ?? "").trim();
}

async function postFamiliarCard(masterActor, familiar, level) {
  const s = familiar.system;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: masterActor }),
    content: `<div class="trg-prime"><h3>Familiar</h3>` +
      `<p><strong>${familiar.name}</strong> — level ${level}, with your saving throws, ` +
      `attack and defence bonuses, and every skill rank you have.</p>` +
      `<p>DB ${s.combat?.defence?.total ?? "?"}, DR ${s.combat?.naturalArmour?.dr ?? 0}, ` +
      `HP ${s.resources?.hp?.max ?? "?"}; Fort +${s.combat?.saves?.fortitude?.total ?? 0}, ` +
      `Ref +${s.combat?.saves?.reflex?.total ?? 0}, Will +${s.combat?.saves?.will?.total ?? 0}.</p>` +
      `<p>Pick <strong>2 abilities</strong> on its sheet; Empathic Link is already there and costs nothing. ` +
      `One more at 4th level and every 4 levels after.</p>` +
      `<p><em>The summoning costs <strong>${familiarComponentCost(level)} gp</strong> in magical components ` +
      `and an hour of meditation after your daily preparation — deduct the coin yourself.</em></p>` +
      `</div>`
  });
}

/**
 * "If a familiar dies or is dismissed, you must attempt a Fortitude Save
 * (level based)."
 *
 * A level-based DC, which this system already has a check type for, so
 * the roll goes through the ordinary machinery and only the outcome
 * table is ours. Fatigue is APPLIED on a failure rather than described —
 * it is a condition with a value, which this system tracks.
 */
export async function rollFamiliarLoss(masterActor) {
  const { TRGCheck } = await import("./dice/check.mjs");
  const { levelDC } = await import("./dice/resolution.mjs");
  const level = Math.max(1, Math.floor(Number(masterActor?.system?.identity?.level ?? 1)));
  const dc = levelDC(level);
  const fortitude = masterActor.system?.combat?.saves?.fortitude;
  const modifiers = fortitude?.checkModifiers ?? [
    { label: "Fortitude", value: Number(fortitude?.total ?? 0), type: "untyped" }
  ];
  const check = await TRGCheck.roll({
    actor: masterActor,
    label: "Loss of a Familiar",
    subtitle: `Fortitude Saving Throw, DC ${dc} (level based)`,
    type: "save",
    subject: "fortitude",
    dc,
    modifiers: [...modifiers]
  });
  if (!check) return null;

  const degree = check.outcome?.degree?.key ?? "failure";
  const outcome = familiarLossOutcome(degree);
  if (!outcome) return null;

  // Fatigue is APPLIED rather than described. It is a valued condition
  // this system already tracks, and "suffer fatigue 2" is not advice.
  if (outcome.fatigue > 0) {
    const current = Number(masterActor.getConditionValue?.("fatigued") ?? 0);
    await masterActor.toggleStatusEffect("fatigued", { value: current + outcome.fatigue });
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: masterActor }),
    content: `<div class="trg-prime"><h3>Loss of a Familiar</h3>` +
      `<p>${outcome.summary}</p>` +
      (outcome.fatigue ? `<p><strong>Fatigue ${outcome.fatigue}</strong> applied — only a night's rest clears it.</p>` : "") +
      (outcome.waitDays ? `<p><em>No new familiar for ${outcome.waitDays} days.</em></p>` : "") +
      `<p><em>These rules also apply if YOU die and are brought back.</em></p>` +
      `</div>`
  });
  return outcome;
}

/** Every familiar ability currently on an actor. */
export function familiarAbilityNames(familiarActor) {
  return Array.from(familiarActor?.items ?? [])
    .filter((i) => i.type === "ability")
    .map((i) => i.name);
}

/** Is this actor a familiar? Re-exported so callers need one import. */
export { isFamiliar };

