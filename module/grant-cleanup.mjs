/**
 * Grant cleanup (3.192.0, from Graham's live testing): "When a race is
 * removed from the sheet, it leaves all of its associated material
 * behind."
 *
 * Everything a source item delivered is tagged when it lands:
 *   - granted embedded items carry `flags.trg-prime.grantedBy.sourceId`
 *     (grants-workflow), and
 *   - feat choice-effects carry `flags.trg-prime.featSource` (the
 *     replaceFeatEffect helper).
 *
 * So removal is the mirror image: when an embedded item is deleted, take
 * down what it granted. Deleting those granted items re-fires this hook,
 * so a CHAIN cleans itself — race → granted feat → the ability that feat
 * granted. Stored-delta grants (War Priest's HP, class-skill bonuses...)
 * are reversed immediately via reconcileAllGrants rather than waiting
 * for the next daily preparation.
 */

import { reconcileAllGrants } from "./feats-workflow.mjs";
import { removeSpecialistSkillGrants, declaresSpecialistSkills } from "./specialist-grants.mjs";
import { FOUNDATION_ITEM_TYPES } from "./config.mjs";
import { deletionValue } from "./deletion.mjs";

const SYSTEM_ID = "trg-prime";

export function registerGrantCleanup() {
  Hooks.on("deleteItem", async (item, options, userId) => {
    // One client only (the deleting user), embedded items only, and never
    // during a cascade batch we started ourselves twice.
    if (game.user?.id !== userId) return;
    const actor = item?.parent;
    if (!actor || actor.documentName !== "Actor") return;

    // 1. Granted embedded items (race → abilities/feats, feat → spells...).
    const grantedIds = actor.items
      .filter((i) => i.flags?.[SYSTEM_ID]?.grantedBy?.sourceId === item.id)
      .map((i) => i.id);
    if (grantedIds.length) {
      const names = actor.items
        .filter((i) => grantedIds.includes(i.id))
        .map((i) => i.name);
      await actor.deleteEmbeddedDocuments("Item", grantedIds);
      ui.notifications.info(
        `${item.name} removed — its grants went with it: ${names.join(", ")}.`
      );
    }

    // 2. Choice-effects created by the item's Use automation.
    const effectIds = Array.from(actor.effects ?? [])
      .filter((e) => e.getFlag?.(SYSTEM_ID, "featSource") === item.id)
      .map((e) => e.id);
    if (effectIds.length) {
      await actor.deleteEmbeddedDocuments("ActiveEffect", effectIds);
    }

    // 3. Feature-scoped actor flags that gate sheet behaviour. A flag
    // outliving its item is worse than a leftover effect: the Use handler
    // reads the flag, finds it already set, and skips the branch that
    // would have re-created the effect — so the feature ends up recorded
    // but invisible, with no way to change the recorded choice.
    const SCOPED_FLAGS = [
      { type: "feat", name: "adoptive race", flag: "adoptiveRace" },
      { type: "heritage", name: "furini", flag: "furiniSchool" },
      { type: "feat", name: "ascendan magic", flag: "ascendanMagicSchool" },
      // Charismatic Caster records its switch as a choice rather than
      // writing the field (casting ability is derived from 3.206.0).
      // Without this the flag outlived the feat: the character went on
      // casting off Charisma with nothing on the sheet saying why, and
      // re-adding the feat hit its own "already Charisma" guard, so there
      // was no way back through the interface at all.
      { type: "feat", name: "charismatic caster", flag: "castingAbilityChoice" },
      // The Ranger's prey designation and favoured-terrain toggle
      // (3.224.0): actor flags gating attack bonuses and check-dialog
      // tickboxes — with the ability gone, a lingering flag would keep
      // offering (and applying) bonuses the character no longer has.
      // The once-per-round precisionHunterUsed marker resets at turn
      // start and is harmless either way, but it leaves here too rather
      // than waiting for a combat to clean it.
      { type: "ability", name: "hunt prey", flag: "huntedPrey" },
      { type: "ability", name: "hunt prey", flag: "precisionHunterUsed" },
      { type: "ability", name: "terrain mastery", flag: "terrainMasteryActive" }
    ];
    // Divine Resolve's (and Warrior's Resolve's) one-off conviction point
    // is recorded ON THE CLASS ITEM, so it leaves with the class — but
    // the point itself has to be taken back, or dragging a Crusader (or
    // Fighter) on and off is a free point per cycle. The maximum is
    // derived and drops on its own.
    for (const resolve of [
      { flag: "divineResolveGiven", label: "Divine Resolve" },
      { flag: "warriorsResolveGiven", label: "Warrior's Resolve" },
      { flag: "scoundrelsLuckGiven", label: "Scoundrel's Luck" }
    ]) {
      if (item.type !== "class" || !item.flags?.[SYSTEM_ID]?.[resolve.flag]) continue;
      const current = Number(actor._source?.system?.resources?.conviction?.value ?? 0);
      if (current > 0) {
        await actor.update({ "system.resources.conviction.value": current - 1 });
        ui.notifications.info(`${item.name} removed — ${resolve.label}'s conviction point went with it.`);
      }
    }
    for (const scoped of SCOPED_FLAGS) {
      if (item.type !== scoped.type) continue;
      if (String(item.name).trim().toLowerCase() !== scoped.name) continue;
      if (actor.getFlag(SYSTEM_ID, scoped.flag) === undefined) continue;
      await actor.unsetFlag(SYSTEM_ID, scoped.flag);
    }

    // 3b. The same thing, for flags whose KEY carries the item's own id —
    // the per-copy choices Weapon Focus and Favoured Terrain record. Their
    // shape can't be expressed in the table above, and they were left
    // behind for ever: harmless in behaviour (a re-grant gets a fresh
    // key) but one dead key per add-and-remove cycle, in every actor
    // update payload thereafter.
    const ID_SUFFIXED_FLAGS = [
      "weaponFocus", "favouredTerrain", "skillFocus", "elementalSpell",
      // A Crusader's recorded reaction-feat choice, per aspect. "Once
      // selected it cannot be changed" is about the aspect you have, not
      // about the character for ever — removing the aspect removes the
      // choice along with the feat it granted, and a different aspect
      // asks again.
      "alignmentFeat",
      // A Fighter's Martial Training archetype choice (and the Rogue's
      // Archetypal Path): the feat itself carries grantedBy provenance
      // and comes down with the ability; the recorded choice must come
      // down too, or a re-granted ability refuses to ask again.
      "martialTraining", "archetypalPath",
      "magicalDiscoverySpell", "professionalSpecialist"
    ];
    for (const prefix of ID_SUFFIXED_FLAGS) {
      if (actor.getFlag(SYSTEM_ID, `${prefix}-${item.id}`) === undefined) continue;
      await actor.unsetFlag(SYSTEM_ID, `${prefix}-${item.id}`);
    }

    // 4. Specialist skills the source wrote into the actor's system data.
    // These aren't items, so step 1 can't see them; provenance is kept in
    // an actor flag instead (see specialist-grants.mjs).
    if (FOUNDATION_ITEM_TYPES.includes(item.type) || declaresSpecialistSkills(item)) {
      const removedSkills = await removeSpecialistSkillGrants(actor, item.id);
      if (removedSkills.length) {
        ui.notifications.info(
          `${item.name} removed — specialist skills gone with it: ${removedSkills.join(", ")}.`
        );
      }
      // Skill SPECIALTIES are a different thing again — the sub-focus
      // within Artistry/Crafting/Perform, in their own flag. The Cook
      // hands Cooking over; it goes back when the Cook does.
      const { removeSpecialtySelectionGrants } = await import("./skill-specialties-workflow.mjs");
      const droppedSpecialties = await removeSpecialtySelectionGrants(actor, item.id);
      if (droppedSpecialties.length) {
        ui.notifications.info(
          `${item.name} removed — specialties gone with it: ${droppedSpecialties.join(", ")}.`
        );
      }

      // A chooser background remembers WHICH key was the player's answer,
      // so a second press replaces just that one rather than sweeping the
      // literal grants beside it. `setFlag` merges recursively, so the
      // record needs a genuine deletion to actually forget a deleted
      // background — without it the map grows by a dead entry per
      // background ever tried and never shrinks.
      if (actor.getFlag(SYSTEM_ID, "backgroundChoiceKeys")?.[item.id] !== undefined) {
        await actor.update({
          [`flags.${SYSTEM_ID}.backgroundChoiceKeys.${item.id}`]: deletionValue()
        });
      }
    }

    // 4b. Abilities a heritage TOOK AWAY come back when the heritage
    // goes. Urloch deletes three Ascendan abilities; without this, a
    // player who tries the heritage and changes their mind is quietly
    // three abilities short for ever, because nothing on the sheet
    // records that they were ever removed. Restored from the race that
    // grants them rather than re-created blind, so provenance and the
    // compendium version are both correct.
    // Gated on the DECLARATION, not on the record: in the common ordering
    // (heritage on the sheet before Apply Grants) the abilities are
    // suppressed rather than deleted, so nothing is ever recorded and a
    // record-only gate never fired. restoreRemovedAbilities resolves both.
    if (item.type === "heritage" &&
      (item.system?.removedAbilities || item.flags?.[SYSTEM_ID]?.abilitiesRemoved?.length)) {
      try {
        const { restoreRemovedAbilities } = await import("./grants-workflow.mjs");
        const names = await restoreRemovedAbilities(actor, item);
        if (names.length) {
          ui.notifications.info(
            `${item.name} removed — abilities it took away are back: ${names.join(", ")}.`
          );
        }
      } catch (err) {
        console.warn("TRG Prime | restoring removed racial abilities failed", err);
      }
    }

    // 4c. The sheet fields a class TOOK OVER come back when the class
    // goes — BAB Base, the save Class columns, BSB, HP per Level. Apply
    // Grants zeroes them because the class table supplies them and the
    // two would otherwise add; without this, adding a Fighter to compare
    // and dragging it off again left the character on zeros with the only
    // record in a chat card. Same shape as Urloch's abilities above.
    if (item.type === "class" && item.flags?.[SYSTEM_ID]?.clearedFields) {
      try {
        const { restoreClassOwnedFields } = await import("./grants-workflow.mjs");
        const restored = await restoreClassOwnedFields(actor, item);
        if (restored.length) {
          ui.notifications.info(
            `${item.name} removed — the fields it took over are back: ${restored.join(", ")}.`
          );
        }
      } catch (err) {
        console.warn("TRG Prime | restoring class-owned sheet fields failed", err);
      }
    }

    // 5. Stored-delta grants reverse now, not at the next dawn. Heritage
    // joined this list with the Chapter 2 batch: several heritages carry
    // per-level grants (Gul-Fyr's PP, Stout-Fyr's HP) that reconcile the
    // same way a feat's does.
    // Background joined this list with the Lay Healer's Power Point line.
    if (["feat", "ability", "class", ...FOUNDATION_ITEM_TYPES].includes(item.type)) {
      try {
        await reconcileAllGrants(actor);
      } catch (err) {
        console.warn("TRG Prime | grant reconcile after deletion failed", err);
      }
    }
  });
}
