import { blankSpecialistSkill, slugifyKey, uniqueKey } from "./config.mjs";
import { deletionValue } from "./deletion.mjs";

/**
 * Specialist skills a race or heritage hands out.
 *
 * "You gain Dwarven Lore and Stone Lore specialist skills." Every one of
 * the eight races opens with a line like that, and several heritages add
 * to it — and until now the only way to honour it was to read the race's
 * description, click Add Specialist Skill twice, and type the names by
 * hand, correctly, on every character.
 *
 * These are not skill SPECIALTIES (the sub-focus within Artistry,
 * Crafting or Perform — module/skill-specialties.mjs). They are whole
 * player-defined skills living in `system.specialistSkills`, keyed by a
 * slug derived from their label.
 *
 * That slug is why this needed its own module rather than riding along
 * with the compendium grants in grants.mjs. A granted feat or ability is
 * an ITEM: it can carry a `grantedBy` flag, and the cleanup hook can find
 * and delete it when the race is removed. A specialist skill is a plain
 * object inside the actor's system data, and `normaliseSpecialistSkills`
 * rebuilds every entry from `blankSpecialistSkill` on each load — so any
 * provenance marker written onto the entry itself is stripped on the next
 * cycle. Provenance therefore lives in an actor flag instead, which is
 * what lets a removed race take its own lore skills with it and leave a
 * player's hand-made ones alone.
 */

const SYSTEM_ID = "trg-prime";
const FLAG = "grantedSpecialistSkills";

/** Comma-separated names → trimmed list, matching parseGrantList. */
export function parseSpecialistList(text) {
  return String(text ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/**
 * The key of an existing specialist skill with this label, or null.
 *
 * EXTRACTED AT 3.546.0 from `planSpecialistSkills`, which had matched by
 * label since it was written while every other caller reinvented the
 * question. Stone Wise reinvented it wrongly and made a second Stone
 * Lore for every Dwarf who pressed the button.
 *
 * @param {object} existing the actor's system.specialistSkills
 * @param {string} label
 * @returns {string|null}
 */
export function findSpecialistSkillByLabel(existing = {}, label = "") {
  const wanted = String(label ?? "").trim().toLowerCase();
  if (!wanted) return null;
  for (const [key, skill] of Object.entries(existing ?? {})) {
    if (String(skill?.label ?? "").trim().toLowerCase() === wanted) return key;
  }
  return null;
}

/**
 * What granting these names would actually do, given what the character
 * already has.
 *
 * Matching is by LABEL, case-insensitively, not by slug: a player who
 * typed "Stone Lore" by hand before picking the race should not end up
 * with a second one called stoneLore2. Pure, so the harness can assert
 * the dedupe without an actor.
 *
 * @param {string[]} names Requested skill names.
 * @param {object} existing The actor's current system.specialistSkills.
 * @returns {{create: Array<{key: string, label: string}>, skipped: string[]}}
 */
export function planSpecialistSkills(names = [], existing = {}) {
  const taken = { ...existing };
  const byLabel = new Set(
    Object.values(existing ?? {}).map((skill) =>
      String(skill?.label ?? "").trim().toLowerCase()
    )
  );

  const create = [];
  const skipped = [];

  for (const name of names) {
    const label = String(name ?? "").trim();
    if (!label) continue;
    if (byLabel.has(label.toLowerCase())) {
      skipped.push(label);
      continue;
    }
    const key = uniqueKey(slugifyKey(label) || "specialistSkill", taken);
    taken[key] = true;
    byLabel.add(label.toLowerCase());
    create.push({ key, label });
  }

  return { create, skipped };
}

/**
 * Creates a source item's specialist skills on its actor, recording
 * which slugs it created so removing the source can undo exactly those.
 *
 * @param {Actor} actor
 * @param {Item} sourceItem A race, heritage or background.
 * @returns {Promise<{created: string[], skipped: string[]}>}
 */
/**
 * The specialist-skill names a source item confers.
 *
 * Races and heritages carry a plural `specialistSkills` list. Backgrounds
 * carry a singular `specialistSkill` — a field that shipped with the
 * Soldier entry long before anything read it, and is on live sheets — so
 * both are accepted rather than renaming a field out from under existing
 * worlds.
 *
 * A background's printed line may also name a CHOICE ("One Ancient
 * Civilisation Lore"), which is an instruction rather than a skill:
 * creating a sheet entry called that is precisely the failure to avoid.
 * So when the item declares `flags.trg-prime.grantedSpecialistSkills`,
 * that literal list wins over the printed one and the choice is left to
 * the background's Use button.
 */
export function specialistNamesFor(sourceItem) {
  const literal = sourceItem?.flags?.["trg-prime"]?.grantedSpecialistSkills;
  if (typeof literal === "string") return parseSpecialistList(literal);
  return parseSpecialistList(
    sourceItem?.system?.specialistSkills ?? sourceItem?.system?.specialistSkill
  );
}

/**
 * Does this NON-foundation item carry a literal specialist-skill grant of
 * its own? True only for the explicit flag — the printed field is read
 * for foundations alone, because a feat's `specialistSkill` text has
 * never been a grant and reading it as one now would change forty feats.
 */
export function declaresSpecialistSkills(sourceItem) {
  const flags = sourceItem?.flags?.[SYSTEM_ID] ?? {};
  // A CHOOSER declares one too: an ability carrying `specialistChoice`
  // (the Shaman's Land Spirit — "select one appropriate Terrain Lore")
  // writes its answer through the same provenance record, and the
  // cleanup that reads this must take that answer away with the item.
  if (flags.specialistChoice && typeof flags.specialistChoice === "object") return true;
  const literal = flags.grantedSpecialistSkills;
  return typeof literal === "string" && parseSpecialistList(literal).length > 0;
}

/**
 * WHICH OF THIS ITEM'S SPECIALIST SKILLS ANOTHER ITEM ALREADY CONFERS, when
 * the item declares that it then grants an alternative (3.665.0).
 *
 * Graham's ruling of 21 October 2026, on Inner Tempest's Spirit Warrior: a
 * Miraku gets Spirit Lore from the race, and the background printing Spirit
 * Lore as well gave them nothing — so the background "offers an alternative
 * Lore". Declared on the item as `flags.trg-prime.specialistAlternative`
 * ({label, prompt, placeholder, suffix}); an item without it is unchanged,
 * which is every core background.
 *
 * Pure: the item and the actor's OTHER items in, the duplicated labels out
 * (empty when no alternative is owed).
 *
 * @param {object} item
 * @param {object[]} otherItems
 * @returns {string[]}
 */
export function specialistAlternativeOwed(item, otherItems = []) {
  const alternative = item?.flags?.[SYSTEM_ID]?.specialistAlternative;
  if (!alternative || typeof alternative !== "object") return [];
  const mine = specialistNamesFor(item);
  if (!mine.length) return [];
  const elsewhere = new Set();
  for (const other of otherItems ?? []) {
    if (!other || other === item || (item?.id && other.id === item.id)) continue;
    for (const name of specialistNamesFor(other)) elsewhere.add(String(name).trim().toLowerCase());
  }
  return mine.filter((name) => elsewhere.has(String(name).trim().toLowerCase()));
}

export async function applySpecialistSkillGrants(actor, sourceItem) {
  const names = specialistNamesFor(sourceItem);
  if (!names.length) return { created: [], skipped: [] };

  const existing = actor.system?.specialistSkills ?? {};
  const { create, skipped } = planSpecialistSkills(names, existing);

  // A SKILL THIS SOURCE NAMES THAT IS ALREADY ON THE SHEET IS STILL THIS
  // SOURCE'S SKILL.
  //
  // This function used to `return` when `create` was empty — before it
  // reached its own provenance write below. So a source whose skill was
  // already present was never recorded as an owner of it, and
  // `removeSpecialistSkillGrants`, which reads exactly that record, could
  // never take it away again. Reported by Graham, 12 Aug 2026: deleting a
  // race left its lore behind on the sheet.
  //
  // The skill can already be there for perfectly ordinary reasons — the
  // player typed it by hand before picking the race, two sources confer
  // it, or the character predates the provenance flag altogether — and in
  // every one of those the honest record is that this source confers it
  // too.
  //
  // Recording an extra owner cannot over-delete: removal already refuses
  // to take a skill any OTHER item still confers (`stillConferred`) and
  // hands the record on to that item instead. What it buys is a REPAIR
  // PATH — pressing Apply Grants on a race that is already applied now
  // establishes the provenance an older sheet never had, so the skill can
  // finally leave when the race does.
  const wanted = new Set(names.map((n) => String(n).trim().toLowerCase()));
  const alreadyMine = Object.entries(existing)
    .filter(([, skill]) => wanted.has(String(skill?.label ?? "").trim().toLowerCase()))
    .map(([key]) => key);

  if (!create.length && !alreadyMine.length) return { created: [], skipped };

  if (create.length) {
    const update = {};
    for (const { key, label } of create) {
      // Lore is an Intelligence skill and every race-granted specialist
      // skill in Chapter 2 is a lore, so Intelligence is the right default
      // — and it is a default, not a lock: the ability dropdown on the
      // sheet stays free for the ones that aren't.
      const skill = blankSpecialistSkill("intelligence");
      skill.label = label;
      update[`system.specialistSkills.${key}`] = skill;
    }
    await actor.update(update);
  }

  // Provenance, keyed by the granting item's id so two sources granting
  // the same-named skill can't stand on each other, and so removing one
  // race never touches a skill the player made themselves.
  const record = { ...(actor.getFlag(SYSTEM_ID, FLAG) ?? {}) };
  record[sourceItem.id] = [
    ...new Set([
      ...(record[sourceItem.id] ?? []),
      ...create.map((entry) => entry.key),
      ...alreadyMine
    ])
  ];
  await actor.setFlag(SYSTEM_ID, FLAG, record);

  return { created: create.map((entry) => entry.label), skipped };
}

/**
 * Removes the specialist skills a given source created, and forgets it.
 *
 * Called from the delete-item cleanup, so dragging a race off a
 * character takes its lore skills with it — the same contract granted
 * feats and abilities already had.
 *
 * @returns {Promise<string[]>} Labels of the skills removed.
 */
/**
 * Per-actor serialisation, for the same reason reconcileAllGrants has it:
 * Foundry does NOT await hook callbacks, so two `deleteItem` handlers run
 * concurrently and this function is a read-modify-write on one flag.
 *
 * Concretely, with Barbarian and Hunter both conferring Hunting: dragging
 * one off and then the other fast enough meant the second handler read the
 * provenance record BEFORE the first's hand-over write landed, found
 * nothing recorded, and returned having done nothing — leaving Hunting on
 * a sheet with no background at all and a provenance entry pointing at a
 * deleted item, which no later removal could ever clean up. Four labels
 * are co-owned as of the G & H wave, so this stopped being theoretical.
 */
const REMOVAL_QUEUES = new Map();

export async function removeSpecialistSkillGrants(actor, sourceId) {
  if (!actor?.id) return removeSpecialistSkillGrantsNow(actor, sourceId);
  const previous = REMOVAL_QUEUES.get(actor.id) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(() => removeSpecialistSkillGrantsNow(actor, sourceId));
  // The queued handle swallows failures so one error can't wedge every
  // later removal; the caller still gets the real promise and rejection.
  const settled = run.catch(() => {});
  REMOVAL_QUEUES.set(actor.id, settled);
  settled.then(() => {
    if (REMOVAL_QUEUES.get(actor.id) === settled) REMOVAL_QUEUES.delete(actor.id);
  });
  return run;
}

async function removeSpecialistSkillGrantsNow(actor, sourceId) {
  const keys = (actor.getFlag(SYSTEM_ID, FLAG) ?? {})[sourceId] ?? [];
  if (!keys.length) return [];

  const skills = actor.system?.specialistSkills ?? {};

  // Labels some OTHER item still on the sheet also confers.
  //
  // Two sources can name the same specialist skill — Soldier and Field
  // Medic both grant Warfare — and the dedupe means only the FIRST one to
  // be applied records it. Without this check, removing that first source
  // deleted a skill the second still confers, and the character was left
  // missing something their background prints, with the feats that look
  // it up by label quietly failing to find it.
  const stillConferred = new Set();
  for (const item of actor.items ?? []) {
    if (item.id === sourceId) continue;
    for (const name of specialistNamesFor(item)) {
      stillConferred.add(String(name).trim().toLowerCase());
    }
  }

  const removed = [];
  const kept = [];
  const update = {};
  for (const key of keys) {
    if (!skills[key]) continue;
    const label = String(skills[key].label ?? key);
    if (stillConferred.has(label.trim().toLowerCase())) {
      kept.push(label);
      continue;
    }
    removed.push(label);
    // The ForcedDeletion sentinel deletes a key rather than blanking it
    // (Foundry 14; replaces the old `-=` prefix).
    update[`system.specialistSkills.${key}`] = deletionValue();
  }

  // A co-owned skill stays, and its provenance moves to whoever still
  // confers it — otherwise the record is lost and the NEXT removal has
  // nothing to check.
  if (kept.length) {
    // Re-read, not the snapshot taken at the top: even serialised, the
    // flag may have moved under us between entry and here.
    const record = { ...(actor.getFlag(SYSTEM_ID, FLAG) ?? {}) };
    const keptKeys = keys.filter((key) => kept.includes(String(skills[key]?.label ?? key)));
    for (const item of actor.items ?? []) {
      if (item.id === sourceId) continue;
      const names = specialistNamesFor(item).map((n) => String(n).trim().toLowerCase());
      const mine = keptKeys.filter((key) =>
        names.includes(String(skills[key]?.label ?? key).trim().toLowerCase()));
      if (!mine.length) continue;
      record[item.id] = [...new Set([...(record[item.id] ?? []), ...mine])];
    }
    await actor.setFlag(SYSTEM_ID, FLAG, record);
  }

  // `setFlag` merges recursively, so writing back an object with the key
  // omitted would silently RETAIN it — the record would grow by one dead
  // entry per race ever removed and never shrink. The ForcedDeletion
  // sentinel is the only thing that actually deletes a key.
  if (Object.keys(update).length) await actor.update(update);
  await actor.update({
    [`flags.${SYSTEM_ID}.${FLAG}.${sourceId}`]: deletionValue()
  });

  return removed;
}
