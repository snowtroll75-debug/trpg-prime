/**
 * The Spell Effect rune, wired (Chapter 11, group 4).
 *
 * The rune "allows the wearer to cast an innate spell", and this system
 * already has innate spells: a spell item with `system.innate` true and
 * a `usesPerDay` field, cast for 0 PP at the maximum warp, refreshed by
 * Daily Preparation, recovered by Refocus. So the rune grants ONE OF
 * THOSE rather than growing a second casting path beside it — the same
 * decision every other spell-granting feature in this system has made.
 *
 * WHEN THE SPELL APPEARS AND WHEN IT GOES. The rune is Invested and the
 * item must be worn or wielded to work, so the grant follows EQUIPPED:
 * take the sword off and its spell leaves your sheet with it. The
 * granted spell carries `grantedBy.sourceId`, which is the provenance
 * flag grant-cleanup already reads, so deleting the sword takes the
 * spell down without this file being involved at all.
 *
 * CONSTANT IS THE AWKWARD ONE. "Constant" is not a frequency of casting,
 * it is a spell that is simply running — and nothing else in this system
 * models an always-on spell. So it gets both halves: the innate spell,
 * for anything that needs re-rolling, AND a standing Active Effect on
 * the wearer carrying whatever bonuses the spell has authored, so the
 * sheet shows the spell is up and the numbers are actually applied.
 */

import { spellEffectFor, spellEffectRunesOf } from "./rune-spell-effect.mjs";
import { wondrousBonusesForActor } from "./wondrous-effects.mjs";
import { CHANGE_TYPE } from "./effect-change-types.mjs";
import { packItemData } from "./items.mjs";
import { runesCountFor } from "./rune-bearing.mjs";

const SYSTEM_ID = "trg-prime";
const CONSTANT_FLAG = "spellEffectConstant";
const GRANT_FLAG = "spellEffectRune";

/**
 * Every innate spell the actor's equipped items ought to be granting.
 *
 * EQUIPPED ONLY, because the rune is Invested — a runed greatsword in
 * your pack grants nothing. Pure, so the harness can run it.
 *
 * @param {Array} items
 * @returns {Array<{itemId, itemName, kind, spell, frequency, level, price, usesPerDay, constant}>}
 */
export function spellEffectGrants(items = []) {
  const out = [];
  for (const item of items ?? []) {
    if (!item?.system?.equipped) continue;
    // RUNED CLOTHING ONLY WITH NO ARMOUR OVER IT (3.577.0, R9) — the rule
    // every other rune on it already follows.
    if (!runesCountFor(item, items)) continue;
    // A SPECIFIC ITEM MAY PRINT ITS OWN ACTIVATION (3.615.0, R10 of block
    // 36): Quick Plate's Haste is "Command (1 AP)", not the spell's 2 AP.
    const activationAP = Number(item.flags?.[SYSTEM_ID]?.specificItem?.activationAP ?? 0) || 0;
    for (const rune of spellEffectRunesOf(item)) {
      const priced = spellEffectFor(rune.kind, { ppCost: null, frequency: rune.frequency });
      out.push({
        itemId: item.id ?? item._id ?? "",
        itemName: item.name ?? "",
        kind: rune.kind,
        spell: rune.spell,
        frequency: rune.frequency,
        usesPerDay: priced.usesPerDay,
        constant: priced.constant,
        ...(activationAP > 0 ? { castAP: activationAP } : {})
      });
    }
  }

  // WONDROUS ITEMS GRANT THEIR SPELLS THE SAME WAY (Chapter 11): the
  // Ring of Animal Friendship "casts the Charm Animal spell as an innate
  // spell", which is word for word what the Spell Effect rune does. One
  // mechanism, not a second one beside it — so a wondrous spell arrives
  // through the same grant, gets the same uses-per-day handling, and is
  // taken down by the same reconciliation.
  //
  // INVESTED rather than equipped, which is the wondrous items' own gate.
  for (const grant of wondrousBonusesForActor(items).spells) {
    const priced = spellEffectFor("armour", { ppCost: null, frequency: grant.frequency });
    out.push({
      itemId: grant.itemId ?? "",
      itemName: grant.itemName ?? "",
      kind: "wondrous",
      spell: grant.spell,
      frequency: grant.frequency,
      usesPerDay: priced.usesPerDay,
      constant: priced.constant,
      // A PRINTED DURATION IS FIXED (3.617.0, B16): Sash of Soaring's Fly.
      ...(grant.duration ? { duration: grant.duration } : {}),
      // AND A PRINTED ACTIVATION (3.626.1), as a specific item's is above.
      ...(Number(grant.castAP) > 0 ? { castAP: Number(grant.castAP) } : {})
    });
  }
  return out;
}

/** What identifies one grant, so a changed spell or frequency is a new one. */
export function grantSignature(grant) {
  // The fixed duration is part of it (3.617.0), so a Fly granted before the
  // Sash's ten minutes were fixed is replaced; a grant with none signs as
  // it always did.
  const fixed = grant?.duration ? `|${String(grant.duration).toLowerCase()}` : "";
  return `${grant?.itemId ?? ""}|${String(grant?.spell ?? "").toLowerCase()}|${grant?.frequency ?? ""}${fixed}`;
}

/**
 * A spell's warps without the ones that lengthen it — for a grant whose
 * duration is printed and fixed.
 */
export function warpsWithoutDuration(warps = []) {
  return (Array.isArray(warps) ? warps : []).filter((warp) => {
    const mods = warp?.mods ?? {};
    if (mods.durationText || mods.durationMultiplier || mods.duration) return false;
    return !/\bduration\b/i.test(String(warp?.text ?? ""));
  });
}

/**
 * What to create and what to take away, comparing what the items say to
 * what is already on the sheet.
 *
 * MATCHED BY SIGNATURE, NOT BY NAME (lesson 33): two swords may carry
 * the same spell at different frequencies, and the sheet must end up
 * with both rather than with one of them silently standing in for the
 * other.
 *
 * @param {Array} desired From `spellEffectGrants`.
 * @param {Array<{id, signature}>} existing The spells already granted.
 * @returns {{create: Array, remove: string[]}}
 */
export function reconcileSpellGrants(desired = [], existing = []) {
  const wanted = new Map((desired ?? []).map((g) => [grantSignature(g), g]));
  const have = new Set();
  const remove = [];
  for (const entry of existing ?? []) {
    if (wanted.has(entry.signature) && !have.has(entry.signature)) {
      have.add(entry.signature);
      continue;
    }
    // Either the item is gone, unequipped, or the rune now names a
    // different spell — and a duplicate of a grant we already kept is
    // itself stale, since one rune grants one spell.
    remove.push(entry.id);
  }
  return {
    create: Array.from(wanted.entries())
      .filter(([signature]) => !have.has(signature))
      .map(([, grant]) => grant),
    remove
  };
}

/**
 * A Constant spell's standing bonuses, as Active Effect changes.
 *
 * Only the `bonus`-kind effects a spell has authored, and only the ones
 * aimed at the caster: a Constant spell is running on the wearer, and a
 * spell whose effect is aimed at "targets" has no targets while it
 * simply runs. A spell with nothing authored yields no changes and the
 * effect is a marker — which is honest, and better than inventing a
 * number for it.
 */
export function constantEffectChanges(spell, bonusTargetFor) {
  const effects = Array.isArray(spell?.system?.effects) ? spell.system.effects : [];
  return effects
    .filter((effect) => effect?.kind === "bonus" && (effect.target ?? "self") === "self")
    .map((effect) => ({
      key: `${bonusTargetFor(effect.slot)}.${effect.bonusType || "status"}`,
      // Foundry's own CUSTOM mode, read off the global where there is
      // one so this stays a pure function the harness can run.
      type: CHANGE_TYPE.CUSTOM,
      value: String(Number(effect.value) || 0)
    }));
}

/** The spells on this actor that a Spell Effect rune put there. */
function grantedSpellsOf(actor) {
  return Array.from(actor?.items ?? [])
    .filter((item) => item.type === "spell" && item.flags?.[SYSTEM_ID]?.[GRANT_FLAG])
    .map((item) => ({
      id: item.id,
      signature: grantSignature(item.flags[SYSTEM_ID][GRANT_FLAG]),
      item
    }));
}

const inFlight = new Set();

/**
 * Bring the actor's granted innate spells in line with what its equipped
 * items' runes say.
 *
 * @param {Actor} actor
 * @returns {Promise<{created: string[], removed: number}>}
 */
export async function syncSpellEffectGrants(actor) {
  if (!actor?.id || actor.documentName !== "Actor") return { created: [], removed: 0 };
  // Creating and deleting embedded items re-fires the hooks that call
  // this, so a second pass must not start while the first is running.
  if (inFlight.has(actor.id)) return { created: [], removed: 0 };
  inFlight.add(actor.id);
  try {
    const desired = spellEffectGrants(Array.from(actor.items ?? []));
    const existing = grantedSpellsOf(actor);
    const { create, remove } = reconcileSpellGrants(desired, existing);
    if (!create.length && !remove.length) return { created: [], removed: 0 };

    if (remove.length) {
      const constantOf = new Set(remove);
      const staleEffects = Array.from(actor.effects ?? [])
        .filter((effect) => constantOf.has(effect.getFlag?.(SYSTEM_ID, CONSTANT_FLAG)))
        .map((effect) => effect.id);
      if (staleEffects.length) {
        await actor.deleteEmbeddedDocuments("ActiveEffect", staleEffects);
      }
      await actor.deleteEmbeddedDocuments("Item", remove);
    }

    const created = [];
    for (const grant of create) {
      const made = await createGrantedSpell(actor, grant);
      if (made) created.push(made.name);
    }
    return { created, removed: remove.length };
  } finally {
    inFlight.delete(actor.id);
  }
}

/** Build and embed one granted innate spell (and its Constant effect). */
async function createGrantedSpell(actor, grant) {
  // THE SYSTEM'S SPELLS AND EVERY MODULE'S (3.626.0): a Pillars of Faith
  // bell grants Last Rite, a cord Oathseal — spells its own pack ships.
  const { contentPacksFor } = await import("./content-packs.mjs");
  const packs = contentPacksFor("spells");
  let pack = null;
  let entry = null;
  for (const candidate of packs) {
    const index = await candidate.getIndex();
    const found = Array.from(index.values()).find((c) => c.name.toLowerCase() === grant.spell.toLowerCase());
    if (found) { pack = candidate; entry = found; break; }
  }
  if (!entry) {
    ui.notifications.warn(
      `${grant.itemName}: its Spell Effect rune names "${grant.spell}", which is not in the spells compendium.`);
    return null;
  }

  const source = await pack.getDocument(entry._id);
  const data = packItemData(source);
  data.system.innate = true;
  // Prepared, for the same reason every other granted spell is: chapter
  // 9's cast gate reads `prepared` for a learned caster, and a spell
  // that arrived outside the memorisation cycle never gets prepared by
  // it. Without this the rune grants a spell that cannot be cast.
  data.system.prepared = true;
  data.system.usesPerDay = grant.usesPerDay;
  // A FOCUS GRANT (3.626.0) carries the trait Refocus looks for.
  if (String(grant.frequency ?? "").toLowerCase() === "focus" && !/\bfocus\b/i.test(String(data.system.traits ?? ""))) {
    data.system.traits = [String(data.system.traits ?? "").trim(), "Focus"].filter(Boolean).join(", ");
  }
  // The item's printed activation, where it has one (3.615.0, R10).
  if (Number(grant.castAP) > 0) data.system.castAP = Number(grant.castAP);
  data.system.usesValue = grant.usesPerDay === "unlimited"
    ? 0
    : Math.max(0, Math.floor(Number(grant.usesPerDay) || 0));
  if (grant.duration) {
    data.system.duration = grant.duration;
    data.system.warps = warpsWithoutDuration(data.system.warps);
  }
  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.${GRANT_FLAG}`, {
    itemId: grant.itemId,
    spell: grant.spell,
    frequency: grant.frequency,
    ...(grant.duration ? { duration: grant.duration } : {})
  });
  // The provenance flag grant-cleanup already reads, so deleting the
  // item takes its spell with it without this file being asked.
  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.grantedBy`, {
    sourceId: grant.itemId,
    sourceName: grant.itemName,
    requested: grant.spell
  });

  const [created] = await actor.createEmbeddedDocuments("Item", [data]);

  if (grant.constant && created) {
    const { bonusTargetFor } = await import("./magic/spell-effects.mjs");
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: `${created.name} (Constant — ${grant.itemName})`,
      img: created.img,
      origin: created.uuid,
      changes: constantEffectChanges(created, bonusTargetFor),
      description: `${grant.itemName}'s Spell Effect rune keeps this spell running constantly.`,
      flags: { [SYSTEM_ID]: { [CONSTANT_FLAG]: created.id } }
    }]);
  }

  return created;
}

/**
 * Watch equipping, un-equipping, re-runing and deleting.
 *
 * On the acting client only, since every one of these fires on all of
 * them and three clients racing to create the same spell is three
 * copies of it.
 */
export function registerSpellEffectHooks() {
  const sync = (actor, userId) => {
    if (userId !== undefined && game.user?.id !== userId) return;
    if (actor?.documentName === "Actor") void syncSpellEffectGrants(actor);
  };
  Hooks.on("createItem", (item, options, userId) => sync(item?.parent, userId));
  Hooks.on("updateItem", (item, changes, options, userId) => sync(item?.parent, userId));
  Hooks.on("deleteItem", (item, options, userId) => sync(item?.parent, userId));
}
