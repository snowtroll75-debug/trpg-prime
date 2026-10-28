/**
 * Creating and maintaining an animal companion — the Foundry half.
 *
 * The pure decisions live in `companion.mjs` (what the actor's payload
 * looks like, what its name is, whether it is bound, whether its level
 * has drifted). What lives here is everything that needs a live world:
 * reading the compendium, creating the actor, applying its grants, and
 * pushing the master's level across.
 *
 * WHY THE COMPANION IS A REAL ACTOR AND NOT AN ITEM. See companion.mjs.
 * The consequence for this file is that creating one is a multi-document
 * operation — an Actor, three items on it, then the grants those items
 * fire — and every step of it has to be idempotent enough to survive a
 * player pressing the button twice.
 *
 * WHY LEVEL IS PUSHED. `prepareDerivedData` runs against one document
 * and Foundry gives no re-render when a DIFFERENT actor changes, so a
 * companion cannot safely read its master's level during its own
 * derivation — a master levelling up would leave it showing confident
 * wrong numbers. The level is stored and pushed here instead, and
 * `companionSyncState` is what tells the sheet the two have drifted.
 */

const { DialogV2 } = foundry.applications.api;

import {
  ANIMAL_KIND,
  COMPANION_PACK,
  companionActorData,
  companionKindOf,
  companionKindSpec,
  expectedCompanionLevel,
  isBoundTo,
  masterIdOf
} from "./companion.mjs";
import { contentPack } from "./content-packs.mjs";

const SYSTEM_ID = "trg-prime";

function normalise(name) {
  return String(name ?? "").trim().toLowerCase();
}

/**
 * Every companion actor in the world bound to this master, or only those of
 * one kind (3.674.0, C1: "animal", "dragon", …).
 */
export function companionsOf(masterActor, kind = null) {
  const id = masterActor?.id;
  if (!id) return [];
  const want = kind === null || kind === undefined ? null : (String(kind).trim().toLowerCase() || ANIMAL_KIND);
  return Array.from(game.actors ?? []).filter((a) => isBoundTo(a, id) && (want === null || companionKindOf(a) === want));
}

/** The master actor a companion is bound to, or null. */
export function masterOf(companionActor) {
  const id = masterIdOf(companionActor);
  return id ? (game.actors?.get(id) ?? null) : null;
}

/**
 * Push a master's level onto every companion bound to it.
 *
 * WHEN THIS RUNS. Three places, and it needs all three:
 *
 *   1. The `updateActor` hook, gated by `changeTouchesLevel` — the
 *      moment the master's level actually moves.
 *   2. The master's Daily Preparation, as the catch-up for anything the
 *      hook could not see (a level changed while the owner was offline,
 *      or by a script that bypassed the hook).
 *   3. Companion creation, implicitly, since the level is stored then.
 *
 * The first of those is new at 3.233.3 and is the one that mattered.
 * This function shipped at 3.233.2 with NO caller at all: it was correct,
 * tested, exported and never once invoked, so a master levelling from 6th
 * to 8th left its Wolf sitting at 6th with confident wrong numbers on
 * every line of its sheet. Found by driving it live rather than by any
 * harness, which could only ever have proved the function works — and it
 * did work. An earlier draft of this comment argued AGAINST an update
 * hook on the grounds that one firing on every HP tick is a cost paid
 * constantly for a rare benefit. That reasoning was right about the cost
 * and wrong about the conclusion: the answer is a hook with a cheap
 * enough gate, not no hook.
 *
 * PERMISSION. A player who levels their own character may not own the
 * companion actor (a GM may have kept it), and calling `update` on a
 * document you cannot edit throws rather than failing quietly. Those are
 * reported as lines rather than skipped in silence — a companion that
 * did not follow its master should say so.
 *
 * @param {Actor} masterActor
 * @param {object} [options]
 * @param {boolean} [options.announce] Post the report as a chat card.
 *   Daily preparation folds the lines into its own card instead, so it
 *   leaves this off.
 * @returns {Promise<string[]>} report lines, for whatever card called it.
 */
export async function syncCompanionLevels(masterActor, { announce = false } = {}) {
  const lines = [];
  for (const companion of companionsOf(masterActor)) {
    // ITS KIND'S LEVEL (3.674.0, C2): a dragon is its base level plus the
    // master's levels gained since hatching; an animal companion the master's.
    const level = expectedCompanionLevel(masterActor, companion);
    const own = Number(companion.system?.identity?.level ?? 0);
    if (own === level) continue;
    if (!companion.isOwner) {
      lines.push(
        `${companion.name} is still level <strong>${own}</strong> — you do not have permission ` +
        "to edit it. Ask your GM to open it, or press Daily Preparation on a character who owns it."
      );
      continue;
    }
    await companion.update({
      "system.identity.level": level,
      [`system.companion.syncedAtLevel`]: level,
      // The master may have been renamed since; keep the stored copy
      // honest so the companion sheet's own line doesn't go stale.
      "system.companion.masterName": masterActor.name
    });
    lines.push(`${companion.name} is now level <strong>${level}</strong> (was ${own}).`);
  }
  if (announce && lines.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: masterActor }),
      content: `<div class="trg-prime"><h3>${companionsOf(masterActor).length > 1 ? "Companions" : (companionKindSpec(companionKindOf(companionsOf(masterActor)[0]))?.label ?? "Companion")}</h3>` +
        lines.map((text) => `<p>${text}</p>`).join("") +
        `</div>`
    });
  }
  return lines;
}

/**
 * The creatures a STEED must be chosen from.
 *
 * Divine Ally (Crusader, 4th): "You gain a young animal companion as a
 * mount — ordinarily one with the mount special ability, such as a
 * horse." Nothing in the companions pack declares a mount ability, so
 * the two ridable species are NAMED rather than derived — and
 * `verify-steed-ally` checks this list against the pack, so a new
 * mountable creature is a harness failure rather than a silent omission.
 *
 * Named here beside the chooser it filters, not in crusader.mjs: it is a
 * fact about the companions pack, and the Crusader is only one caller.
 */
export const MOUNT_CREATURES = Object.freeze(["Horse", "Pony"]);

/** The pack a kind's class and base creatures live in. */
function kindPack(spec) {
  if (!spec || spec.key === ANIMAL_KIND) return contentPack(COMPANION_PACK);
  return game.packs?.get(spec.pack) ?? null;
}

/** The base creatures available to pick, from the kind's pack (its own only). */
async function baseCreatureChoices(only = null, spec = companionKindSpec(ANIMAL_KIND)) {
  const pack = kindPack(spec);
  if (!pack) return [];
  const docs = await pack.getDocuments();
  const wanted = Array.isArray(only)
    ? new Set(only.map((n) => normalise(n)))
    : null;
  return docs
    .filter((d) => d.type === "race")
    .filter((d) => !wanted || wanted.has(normalise(d.name)))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * The Animal Companion feat's Use button: pick a species, get a
 * companion.
 *
 * Refuses rather than making a second one if this master already has a
 * companion — the printed rules give a character one at a time
 * ("If your animal companion dies or must be replaced..."), and silently
 * creating duplicates is the kind of thing nobody notices until there
 * are four wolves in the sidebar.
 */
export async function createCompanionFor(masterActor, featItem, {
  kind = ANIMAL_KIND,
  only = null,
  title = null,
  intro = "",
  flags = null
} = {}) {
  // ONE OF EACH KIND (3.674.0, C1; Graham's B10-12). A Ranger who becomes a
  // Dragon Tamer keeps the wolf; a second wolf, or a second dragon, is refused.
  const spec = companionKindSpec(kind);
  if (!spec) {
    ui.notifications.warn(`No companion kind "${kind}" is registered — is its module active?`);
    return null;
  }
  const heading = title ?? spec.label;
  const existing = companionsOf(masterActor, spec.key);
  if (existing.length) {
    ui.notifications.warn(
      `${masterActor.name} already has a ${spec.label.toLowerCase()} (${existing.map((c) => c.name).join(", ")}). ` +
      (spec.key === ANIMAL_KIND
        ? "Replacing one is a week of downtime and a Nature check — delete the old actor first if that has happened."
        : "Delete the old actor first if it is gone.")
    );
    return null;
  }

  const creatures = await baseCreatureChoices(only, spec);
  if (!creatures.length) {
    ui.notifications.warn(`${heading}: no base creatures found in its compendium.`);
    return null;
  }

  const chosenName = creatures.length === 1 && Array.isArray(only)
    ? creatures[0].name
    : await chooseCreature(creatures, { title: heading, intro, label: spec.label });
  if (!chosenName) return null;
  const creature = creatures.find((c) => c.name === chosenName);
  if (!creature) return null;

  const pack = kindPack(spec);
  const classDoc = (await pack.getDocuments())
    .find((d) => d.type === "class" && normalise(d.name) === normalise(spec.className));
  const typePack = contentPack("creature-types");
  const typeDoc = typePack && spec.creatureType
    ? (await typePack.getDocuments()).find((d) => normalise(d.name) === normalise(spec.creatureType))
    : null;
  if (!classDoc) {
    ui.notifications.warn(`${spec.label}: the "${spec.className}" class is missing from the compendium.`);
    return null;
  }

  // THE KIND'S LEVEL (C2), asked of a stand-in carrying the flags the
  // companion will have, so a dragon starts at its base level.
  const preview = { system: { companion: { kind: spec.key === ANIMAL_KIND ? "" : spec.key, baseCreature: creature.name } }, flags: flags ?? {}, getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
  const level = expectedCompanionLevel(masterActor, preview);
  const data = companionActorData({
    masterId: masterActor.id,
    masterName: masterActor.name,
    creatureName: creature.name,
    startingSize: sizeFromCreature(creature),
    maximumSize: String(creature.system?.maximumSize ?? ""),
    level,
    ownership: masterActor.ownership,
    img: creature.img,
    kind: spec.key
  });
  if (flags && typeof flags === "object") data.flags = foundry.utils.mergeObject(data.flags ?? {}, flags, { inplace: false });
  const companion = await Actor.create(data);
  if (!companion) return null;

  const items = [classDoc.toObject(), creature.toObject()];
  if (typeDoc) items.push(typeDoc.toObject());
  await companion.createEmbeddedDocuments("Item", items);

  // The base creature's natural attacks, senses and specials, and the
  // class's own levelled grants, arrive through the ordinary grant path
  // rather than being reproduced here (lesson 13).
  //
  // THROUGH THE SERIALISED QUEUE (3.329.1). This used to loop
  // `applyAllGrants` directly, which raced the `createItem` hook that the
  // line above had just fired three times — and both sides read "already
  // granted?" before either wrote, so a new companion arrived with
  // duplicates of whichever grants happened to land inside the window.
  //
  // One pass over the whole sheet rather than one per item, awaited here so
  // that this function still means "the companion is finished" when it
  // returns.
  const { queueGrantPass } = await import("./grant-autorun.mjs");
  await queueGrantPass(companion);

  // Provenance, so the feat's removal can find what it created and the
  // companion knows which feat made it.
  await companion.setFlag(SYSTEM_ID, "grantedBy", {
    sourceId: featItem?.id ?? "", sourceName: featItem?.name ?? spec.label, actorId: masterActor.id
  });

  await postCreationCard(masterActor, companion, creature, level, spec);
  return companion;
}

/**
 * The creation card.
 *
 * Says what the companion IS, not merely that one was made — a player
 * who has never seen the rules should not have to open three sheets to
 * find out what they just gained.
 */
async function postCreationCard(masterActor, companion, creature, level, spec = companionKindSpec(ANIMAL_KIND)) {
  const s = companion.system;
  const attacks = companion.items.filter((i) => i.type === "weapon").map((i) => i.name);
  const lines = [
    `<p><strong>${companion.name}</strong> — a ${creature.name} ${spec.key === ANIMAL_KIND ? "companion" : spec.label.toLowerCase()}, level ${level}.</p>`,
    `<p>DB ${s.combat?.defence?.total ?? "?"}, DR ${s.combat?.naturalArmour?.dr ?? 0}, HP ${s.resources?.hp?.max ?? "?"}; ` +
    `Fort +${s.combat?.saves?.fortitude?.total ?? 0}, Ref +${s.combat?.saves?.reflex?.total ?? 0}, Will +${s.combat?.saves?.will?.total ?? 0}.</p>`,
    attacks.length ? `<p>Attacks: ${attacks.join(", ")}.</p>` : "",
    spec.command ? `<p><em>${spec.command}</em></p>` : ""
  ].filter(Boolean);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: masterActor }),
    content: `<div class="trg-prime"><h3>${spec.label}</h3>${lines.join("")}</div>`
  });
}

function sizeFromCreature(creature) {
  for (const effect of creature.effects ?? []) {
    for (const change of effect.changes ?? []) {
      if (change.key === "system.identity.size") return String(change.value ?? "");
    }
  }
  return "";
}

async function chooseCreature(creatures, { title = "Animal Companion", intro = "", label = "Animal Companion" } = {}) {
  const options = creatures
    .map((c) => `<option value="${c.name}">${c.name}</option>`)
    .join("");
  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-paw" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p>${intro || `Choose your companion's base creature. Its size, ability scores, speeds, senses,
      natural attacks and specials all come from the species; everything else comes from
      the ${label} table and your own level.`}</p>
      <div class="form-group"><label>Base creature</label>
      <select name="choice">${options}</select></div></div>`,
    buttons: [
      {
        action: "ok", label: "Create", icon: "fa-solid fa-check", default: true,
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
  return result.choice;
}

/**
 * A COMPANION THAT GREW (3.674.0, C3): every token of it on the canvas to
 * its derived size's side (Large 2 squares, Huge 3, …), not as a move. Small
 * and smaller keep one square.
 */
export async function resizeCompanionTokens(companion) {
  const { SIZE_TABLE } = await import("./config.mjs");
  const size = String(companion?.system?.identity?.size ?? "").toLowerCase();
  const space = Number(SIZE_TABLE[size]?.space);
  if (!(space > 0)) return;
  const side = Math.max(1, Math.round(space / 5));
  const { resizeTokenInPlace } = await import("./combat/movement-workflow.mjs");
  for (const doc of companion.getActiveTokens?.(false, true) ?? []) {
    if (doc?.update && (Number(doc.width) !== side || Number(doc.height) !== side)) await resizeTokenInPlace(doc, side);
  }
  // …and the next one dragged out.
  const proto = companion.prototypeToken;
  if (proto && companion.isOwner && (Number(proto.width) !== side || Number(proto.height) !== side)) {
    await companion.update({ "prototypeToken.width": side, "prototypeToken.height": side });
  }
}
