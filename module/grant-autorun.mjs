/**
 * Grants that run themselves (3.317.0, from the Chapter 2 automation audit).
 *
 * TWO GAPS, ONE CAUSE — nothing was watching. `grant-cleanup.mjs` already
 * takes grants DOWN when a foundation item is deleted; there was no matching
 * watcher for a foundation item ARRIVING, or for the character levelling
 * afterwards. Both were reported the same way: "the feature isn't working."
 *
 * FIRST: A RACE THAT LANDED AND DID NOTHING. Adding the Ascendan applied its
 * ability modifiers and speed — those ride on Active Effects and transfer
 * themselves — and left the +1 Power Point, the two specialist skills and all
 * four racial abilities behind a gift icon on the Description tab. Live on
 * 15 Aug 2026: a character built by dragging the race onto the sheet had
 * `Racial Abilities: none` and 0 PP, and nothing anywhere said so. The button
 * was doing real work; nobody was told it needed pressing.
 *
 * SECOND: A PER-LEVEL GRANT THAT NEVER TRUED UP. The Urloch's "+1 Power Point
 * per level" is a stored delta whose `due` scales with `identity.level`, and
 * the table's own comment said it was "trued up on level change". No hook
 * existed. Live: a character taken from level 1 to level 20 kept a pool of 2
 * until Apply Grants was pressed by hand, then jumped to 21. The arithmetic
 * was right the whole time; the trigger was missing. Same mechanism carries
 * Gul-Fyr, the Fey human and Stout-Fyr's per-level HP, so all four were
 * affected and all four are fixed together.
 *
 * WHY BOTH LIVE HERE. They are the same sentence — "reconcile what this actor
 * is owed, when something changes what they are owed" — and splitting them
 * across two files is how one of them ends up with a guard the other lacks.
 *
 * IDEMPOTENCE IS THE WHOLE SAFETY ARGUMENT. `applyAllGrants` skips anything
 * already granted (it matches on the granted item's recorded source id) and
 * `reconcilePPGrant` compares a recorded flag against what is due and writes
 * only the difference. So running them again is a no-op, which is what makes
 * it safe to run them on a hook rather than on a deliberate press.
 */

import { FOUNDATION_ITEM_TYPES } from "./config.mjs";
import { declaresSpecialistSkills } from "./specialist-grants.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The item types whose arrival should apply their own grants.
 *
 * A DEIFIC ASPECT AND A WIZARD SCHOOL BELONG HERE (Graham's ruling,
 * 17 Aug 2026). They were the only foundations a character picks that did
 * not apply themselves: dropping a deity gave a Cleric no Shield, no
 * Athletics class skill and no specialist-spell prompt until they found the
 * Apply Grants button, while dropping a race or a class just worked. Both
 * already have `GRANT_FIELDS` entries and both are levelled, so nothing new
 * had to be taught — only the list they were missing from.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A FEAT AND A CREATURE TYPE BELONG HERE TOO (3.421.0), and the sentence
 * above was already the argument for it — it was simply never re-read
 * against the rest of the table.
 *
 * Graham, 27 August 2026: "the Archetype feat Blessed by Gods is not
 * applying the Lay on Hands Specialist Spell."
 *
 * `GRANT_FIELDS` has carried a `feat` entry — grantedSpells,
 * grantedAbilities, grantedFeats — for as long as it has existed, and
 * twelve feats in the pack grant a spell. None of it ever ran on its
 * own. A feat's grants applied ONLY when the feat was bought through the
 * item picker, which calls `applyAllGrants` itself; every other way a
 * feat can arrive — the Cleric's Priestly Path chooser, the Fighter's
 * Martial Training, the Rogue's Archetypal Path, a drag from the
 * compendium, a class or race granting it — left them unapplied.
 *
 * `grant-cleanup` has always known better. Its own header describes the
 * relationship it takes down as "race → abilities/feats, FEAT → SPELLS"
 * — the removal side was built for a grant the application side never
 * made.
 *
 * THE CHECK THAT KEEPS THIS SHUT: verify-feat-grants asserts every type
 * in `GRANT_FIELDS` appears here. A grant type that nothing applies is
 * not a smaller feature, it is an absent one.
 */
export const AUTOGRANT_ITEM_TYPES = Object.freeze([
  ...FOUNDATION_ITEM_TYPES, "class", "divine-aspect", "wizard-school",
  "feat", "creature-type",
  // A class ability's own grants (3.563.0) — see GRANT_FIELDS.ability.
  "ability"
]);

/**
 * One grant pass at a time, per actor.
 *
 * `applyAllGrants` decides "already granted?" by reading the actor and then
 * writes. Two passes that overlap therefore both read "not yet" and both
 * create — and a GM awarding several levels of XP in quick succession fires
 * `updateActor` faster than a create round-trip completes.
 *
 * Deliberately a plain module-local chain rather than a shared utility: the
 * one thing this must not do is reach into feats-workflow for its queue,
 * which is the import cycle that wedged 3.327.1.
 */
// 3.343.1: THE REAL LOCK MOVED TO THE DOOR. `applyAllGrants` now
// serialises itself per actor (grant-queue.mjs), because this queue only
// ever covered THIS file's passes — and the picker calls `applyAllGrants`
// directly, beside the createItem watcher below, on the same create.
// Two unqueued passes both read "not yet granted" and both wrote, which
// is how selecting a race added every racial ability twice.
//
// This queue is kept because it serialises the whole SWEEP over an
// actor's foundation items as one unit, which the per-call lock does not.
// It cannot deadlock against the door: it never holds the door's lock
// while waiting for it.
const GRANT_PASS_QUEUES = new Map();

export async function queueGrantPass(actor) {
  if (!actor?.id) return;
  const previous = GRANT_PASS_QUEUES.get(actor.id) ?? Promise.resolve();
  const run = previous.catch(() => {}).then(async () => {
    const { applyAllGrants, GRANT_FIELDS } = await import("./grants-workflow.mjs");
    const { declaresGrants } = await import("./grants.mjs");
    for (const item of Array.from(actor.items ?? [])) {
      if (!AUTOGRANT_ITEM_TYPES.includes(String(item?.type ?? ""))) continue;
      // A GRANTED ITEM'S OWN GRANTS BELONG TO NOBODY, which is why they
      // were never applied. This line used to read "belong to whatever
      // granted it" and skip — but nothing applied them on that item's
      // behalf, so a Priestly Path feat's own spell was simply lost.
      // See declaresGrants in grants.mjs.
      //
      // Narrow on purpose: a granted item still needs grants OF ITS OWN
      // to earn a pass, so the 411 feats that declare none are skipped
      // exactly as before and produce no extra pass and no extra card.
      if (item.flags?.[SYSTEM_ID]?.grantedBy
        && !declaresGrants(item.system, GRANT_FIELDS[item.type])
        && !declaresSpecialistSkills(item)) continue;
      await applyAllGrants(actor, item, { quietIfNothingNew: true });
    }
  });
  // The stored handle swallows failures so one error cannot wedge every
  // later pass — the lesson 3.327.1 taught the hard way.
  const settled = run.catch(() => {});
  GRANT_PASS_QUEUES.set(actor.id, settled);
  settled.then(() => {
    if (GRANT_PASS_QUEUES.get(actor.id) === settled) GRANT_PASS_QUEUES.delete(actor.id);
  });
  return run;
}

/**
 * Whether an actor update changed the character's level.
 *
 * Kept pure and exported so the harness can assert it without a world — the
 * same reason `companion.mjs` keeps its own hook gate separate.
 *
 * LEVEL IS DERIVED FROM XP (`config.mjs`: `identity.level = levelForXP(...)`),
 * so the update that crosses a threshold reports the XP, not the level. Both
 * are accepted: a GM who edits the level field directly, and the far more
 * common case of XP being awarded.
 *
 * @param {object} changed The `changed` argument of the updateActor hook.
 * @returns {boolean}
 */
export function changeTouchesLevel(changed) {
  const identity = changed?.system?.identity;
  if (!identity) return false;
  if (identity.level !== undefined) return true;
  // `xp` is an object ({value}) on a character and has been a bare number in
  // older data, so both shapes are asked.
  const xp = identity.xp;
  if (xp === undefined) return false;
  if (typeof xp === "object") return xp.value !== undefined;
  return true;
}

/**
 * Register both watchers. Called once from the system's ready hook.
 */
export function registerGrantAutorun() {
  // ---------------------------------------------------------------
  // A foundation item arriving applies its own grants.
  // ---------------------------------------------------------------
  Hooks.on("createItem", async (item, options, userId) => {
    // ONE CLIENT ONLY. Every connected client sees this hook; without the
    // user gate, eight players at the table would each run the grants and
    // race each other to create the same ability items. Same guard
    // `grant-cleanup` uses on the way down.
    if (game.user?.id !== userId) return;
    if (!AUTOGRANT_ITEM_TYPES.includes(String(item?.type ?? ""))) return;

    const actor = item?.parent;
    if (!actor || actor.documentName !== "Actor") return;

    // NOT WHEN THE ITEM IS ITSELF A GRANT *AND HAS NOTHING TO GRANT*.
    //
    // This used to return on the stamp alone, reasoning that "a chain
    // would run its own grants a SECOND time". There was no first time:
    // nothing anywhere applied a granted item's grants, so the chain
    // stopped dead at step two and Blessed By the Gods never handed over
    // Lay On Hands (Graham, 27 August 2026).
    //
    // The card-noise concern the old comment raised is real and is
    // handled where it belongs — `queueGrantPass` passes
    // `quietIfNothingNew`, and `applyAllGrants` is idempotent, so a
    // second pass over an already-granted chain says nothing.
    if (item.flags?.[SYSTEM_ID]?.grantedBy) {
      const { GRANT_FIELDS } = await import("./grants-workflow.mjs");
      const { declaresGrants } = await import("./grants.mjs");
      // A literal specialist-skill grant (3.563.0 — a discipline's lore
      // skill) is a grant too, though it lives in a flag, not a field.
      if (!declaresGrants(item.system, GRANT_FIELDS[item.type]) && !declaresSpecialistSkills(item)) return;
    }

    // NOT DURING A COMPENDIUM IMPORT. `keepId` is what an import passes and
    // an ordinary add does not.
    //
    // `renderSheet === false` WAS ALSO TESTED HERE, AND IT WAS THE BUG. It
    // reads like an import signal and is nothing of the kind: Foundry passes
    // `renderSheet: false` on EVERY embedded item creation, so the guard
    // refused every ordinary add and the whole feature was inert. Confirmed
    // live on 3.317.0 by probing the hook's own options — dropping the
    // Ascendan on a blank sheet produced `race:Ascendan` and nothing else.
    // The harness asserted that this guard existed, which is to say it
    // asserted the thing that broke it.
    if (options?.keepId) return;

    // ALREADY DONE IS A FACT ABOUT THE ACTOR, not about the call. An actor
    // duplicated or imported whole arrives carrying both the source item and
    // everything it granted, and asking the sheet is a surer test than
    // guessing from the options which of Foundry's many creation paths this
    // was. `applyAllGrants` is idempotent, so the cost of being wrong here is
    // a duplicate chat card rather than duplicate items — but the card is
    // what makes it look like the system is doing the work twice.
    const alreadyGranted = actor.items.some(
      (other) => other.flags?.[SYSTEM_ID]?.grantedBy?.sourceId === item.id
    );
    if (alreadyGranted) return;

    // THROUGH THE QUEUE, NOT AROUND IT (3.329.1).
    //
    // This hook used to call `applyAllGrants` directly, and that was the
    // 3.327.0 duplicate-grant race still open on a path nobody had driven.
    // Foundry does not await hook callbacks, so creating three items in one
    // `createEmbeddedDocuments` call fires three of these concurrently —
    // and `applyAllGrants` reads "already granted?" off the actor and then
    // writes, so every one of them reads "not yet".
    //
    // Found live on 18 Aug 2026 the moment Steed Ally gave the companion
    // creator a second caller: a freshly made Horse arrived carrying two
    // Evasions, two Share Spells and two Hoof attacks. Run again it
    // duplicated a DIFFERENT subset — Mount, Nightvision, Scent, Gallop —
    // which is the signature of a race rather than a wrong list.
    //
    // 3.327.2 built exactly the right lock for this and wired it only into
    // the level hook. The pass is per-ACTOR rather than per-item, which is
    // also why the queue is the right shape: three items arriving together
    // need one pass over the sheet, not three.
    await queueGrantPass(actor);
  });

  // ---------------------------------------------------------------
  // Levelling trues up every per-level grant.
  // ---------------------------------------------------------------
  Hooks.on("updateActor", async (actor, changed, options, userId) => {
    if (game.user?.id !== userId) return;
    if (!changeTouchesLevel(changed)) return;

    // `reconcileAllGrants` is already serialised per actor and writes only
    // differences, so a level change that owes nothing costs one pass over
    // the grant table and no document writes at all.
    const { reconcileAllGrants } = await import("./feats-workflow.mjs");
    const lines = await reconcileAllGrants(actor);

    // AND THE LEVELLED ITEM GRANTS, SERIALISED (3.327.2).
    //
    // `reconcileAllGrants` trues up every per-level NUMBER and has never
    // applied a per-level ITEM — so before 3.327.0 a Rogue reaching 2nd
    // gained neither Pattern Disruption nor Evasion, and a Cleric of War
    // reaching 2nd did not gain True Strike.
    //
    // TWO THINGS WENT WRONG GETTING HERE, both worth the space:
    //
    //   3.327.0 ran this loop straight off the hook. `applyAllGrants` reads
    //   "already granted?" and then writes, so passes that overlap all read
    //   "not yet" and all create. Sweeping a Crusader 1 → 20 left them with
    //   THREE copies of Divine Grace at 1st level.
    //
    //   3.327.1 moved it inside `reconcileAllGrants`, which is serialised
    //   per actor — and introduced a CIRCULAR DYNAMIC IMPORT, because that
    //   function lives in feats-workflow and this module is what
    //   feats-workflow's caller imports. The queue wedged: no error, no
    //   grants, and `reconcileAllGrants` never resolving again for that
    //   actor. Strictly worse than the bug it fixed, and silent with it.
    //
    // So the lock lives HERE, where the work does. One promise chain per
    // actor id, exactly the shape `RECONCILE_QUEUES` uses, and no import
    // that reaches back into the module that called us.
    await queueGrantPass(actor);

    // AND A LEVEL DROP TAKES BACK AN ASPECT'S BONUS SPELLS ABOVE IT
    // (3.623.0, block 40, Graham's R7). Each is "learnt by a cleric at the
    // level indicated"; the grant only ever added, so a Cleric of Dawn
    // dropped from 8th to 5th kept Wall of Fire and Fireball.
    const { pruneAspectBonusSpells } = await import("./aspect-workflow.mjs");
    const pruned = await pruneAspectBonusSpells(actor);
    if (pruned.length) ui.notifications.info(`${actor.name} — ${pruned.join(" ")}`);

    // Reported, not silent. A pool that changes by itself is alarming when
    // nothing says why — and this is the moment the player is looking at
    // their sheet.
    if (lines?.length) {
      ui.notifications.info(`${actor.name} — levelled: ${lines.join(" ")}`);
    }
  });
}
