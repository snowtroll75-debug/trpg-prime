import { classBonusForLevel, ETHICS, levelForXP, xpForLevel } from "./config.mjs";
import { PACK_REPAIRS, EFFECT_REPAIRS, effectRepairUpdate } from "./data/pack-repairs.mjs";
import { classifyRepairs, repairUpdate, repairsForName } from "./pack-repair.mjs";
import { deletionValue } from "./deletion.mjs";
import { grantedInnateTakesFocus, withFocusTrait } from "./combat/refocus.mjs";
import { SPEED_KEYS, pooledSpeedValue } from "./combat/speed-pool.mjs";
import { contentPack } from "./content-packs.mjs";
const SYSTEM_ID = "trg-prime";
const WORLD_SCHEMA_SETTING = "worldSchemaVersion";

/**
 * The last system version at which *stored* data changed shape.
 *
 * This deliberately trails the system version. Bumping it when only derived
 * logic changed would prompt every GM to run a migration that does nothing.
 * Raise it only when template.json or the stored data layout actually changes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND RAISING IT IS NOT OPTIONAL, which 3.412.0 proved. That release
 * pooled the movement speeds in template.json and added a `runIf("3.412.0",
 * "pooled movement", …)` pass to move every stored number into `.base` —
 * and left this constant at 3.312.0. `checkWorldMigration` asks
 * `isNewerVersion(TRG_SCHEMA_VERSION, worldSchemaVersion)`, which was
 * 3.312.0 against 3.312.0, which is false, so it returned before offering
 * anything. The migration was correct, tested, and unreachable.
 *
 * A pass gated ABOVE this constant can never run. `verify-speed-pool`
 * now reads every `runIf` version out of this file and fails if any of
 * them is newer than this line, so the next release cannot repeat it.
 */
/*
 * RAISED TO 3.431.0 so the stale-owned-copy pass is actually offered.
 *
 * THIS CONSTANT IS THE TRIGGER, and forgetting it is a silent failure:
 * a pass registered above it is dead code that reads as shipped. Graham's
 * world stores 3.412.0, so without this the pack-copy repair would have
 * been written, checked, released and never run.
 *
 * Raising it re-arms the migration prompt, which is exactly what happened
 * on 26 August 2026 — see claude/incident-2026-08-26. The historical-pass
 * guard is what makes that safe now: `runIf` only runs a pass whose
 * version the world PREDATES, so a world at 3.412.0 runs the 3.431.0 pass
 * and nothing else.
 */
/*
 * RAISED TO 3.552.1 so the starting-wealth backfill is actually offered.
 *
 * Caught by verify-pack-repairs F7 before this shipped, which is the
 * check the 3.312.0 incident bought: a pass registered above this line
 * is dead code that reads as shipped.
 */
/*
 * THE STAMP EQUALS THE NEWEST PASS, NOT THE RELEASE.
 *
 * Set to 3.601.0 for an hour at 3.601.0 and `verify-speed-pool` F4 refused
 * it: "schema 3.601.0 exceeds the newest pass 3.600.0 — GMs would be
 * prompted to run a migration that does nothing." The newest pass is the
 * pack-copy refresh, gated at 3.600.0 to match the newest manifest entry,
 * so this is 3.600.0 too. A world stamped below it runs that pass and is
 * then stamped past it; a stamp ahead of every pass is a prompt with
 * nothing behind it.
 */
/*
 * RAISED TO 3.622.1 for the stale per-turn records pass (the 3.622.0 drive's
 * F4, Graham's R4). The stamp equals the newest pass, as above.
 */
/*
 * RAISED TO 3.627.1 for the declared effect repairs (the Undead creature
 * type's disease immunity). The stamp equals the newest pass, as above.
 */
export const TRG_SCHEMA_VERSION = "3.627.1";

/**
 * Register the hidden world setting used to determine whether a migration is
 * required. This must run during init so the setting is available at ready.
 */
export function registerMigrationSettings() {
  game.settings.register(SYSTEM_ID, WORLD_SCHEMA_SETTING, {
    name: "TRG Prime World Schema Version",
    hint: "The last TRG Prime data schema successfully applied to this world.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });
}

/**
 * Check the stored world schema and offer migration to the active GM.
 */
export async function checkWorldMigration() {
  if (!game.user?.isGM) return;

  const activeGM = game.users?.activeGM;
  if (activeGM && activeGM.id !== game.user.id) return;

  const currentVersion = String(
    game.settings.get(SYSTEM_ID, WORLD_SCHEMA_SETTING) ?? ""
  ).trim();

  if (
    currentVersion &&
    !foundry.utils.isNewerVersion(TRG_SCHEMA_VERSION, currentVersion)
  ) {
    return;
  }

  // A genuinely empty new world has no legacy data to migrate. Initialising
  // its schema silently prevents a misleading migration prompt on first use.
  if (!currentVersion && !hasMigratableWorldData()) {
    await game.settings.set(
      SYSTEM_ID,
      WORLD_SCHEMA_SETTING,
      TRG_SCHEMA_VERSION
    );
    console.info(
      `TRG Prime | Initialised empty world schema ${TRG_SCHEMA_VERSION}`
    );
    return;
  }

  const sourceLabel = currentVersion || "an unversioned TRG Prime world";
  const approved = await foundry.applications.api.DialogV2.confirm({
    window: {
      title: "TRG Prime World Migration"
    },
    classes: ["trg-prime"],
    content: `
      <div class="trg-prime migration-prompt">
        <p>
          This world uses ${escapeHTML(sourceLabel)} and must be migrated to
          schema <strong>${TRG_SCHEMA_VERSION}</strong>.
        </p>
        <p>
          The migration will update TRG Prime Actors, their embedded Items, and
          world Items. Skills and Specialist Skills are converted from their
          legacy list format to keyed entries so that feats, items and Active
          Effects can target them reliably.
        </p>
        <p>
          Player characters' Level is now derived from XP (10,000 per level).
          Anyone whose typed Level doesn't already match their XP has their XP
          backfilled to match the Level they have now, so no character changes
          level as a result of this migration.
        </p>
        <p>
          Alignment is Ethics now (Chapter 8) — a fixed list of fifteen
          rather than free text. A typed Alignment that already names one
          of the fifteen (Justice, Harmony, and so on) carries straight
          across; anything else is left blank for the player to choose,
          rather than guessed at, and reported either way.
        </p>
        <p>
          A sheet bug could store a character's Land/Fly/Swim/Climb speed
          as a pair of values instead of one, if it was ever edited from
          both the Summary and Combat tabs. Any affected field is
          restored to a single number.
        </p>
        <p>
          A bug (fixed 3.230.7) left specialist and bonus spells — Physical
          Boost, a Cleric's Specialist Spell, a heritage's granted cantrip,
          and others like them — unmemorised forever for a learned caster,
          even though they were never meant to need memorising at all. Any
          spell like this is set castable now. Separately, "Add to Book"
          could offer (and add) a spell already in a Wizard's spell book;
          any duplicate found is removed, keeping whichever copy is
          currently memorised if one is.
        </p>
        <p>
          Only the changes your world has not already had are applied —
          each one is recorded against the version that introduced it,
          and a world already past that version skips it. Nothing here
          can lower a character's XP, Level or Hit Points.
        </p>
        <p><strong>Please back up this world before continuing.</strong></p>
      </div>
    `,
    yes: {
      icon: "fa-solid fa-wand-magic-sparkles",
      label: "Migrate World"
    },
    no: {
      icon: "fa-solid fa-xmark",
      label: "Not Now"
    },
    modal: true,
    rejectClose: false
  });

  if (!approved) {
    ui.notifications.warn(
      "TRG Prime world migration postponed. The prompt will return next time the world loads."
    );
    return;
  }

  ui.notifications.info(
    `TRG Prime | Migrating world data to schema ${TRG_SCHEMA_VERSION}…`
  );

  try {
    const result = await migrateWorldData(currentVersion);
    await game.settings.set(
      SYSTEM_ID,
      WORLD_SCHEMA_SETTING,
      TRG_SCHEMA_VERSION
    );

    console.info(
      `TRG Prime | World migration complete: ${sourceLabel} → ${TRG_SCHEMA_VERSION}`,
      result
    );
    /*
     * WHAT IT ACTUALLY DID, INCLUDING THE PASSES THAT WRITE EMBEDDED
     * DOCUMENTS (3.595.3).
     *
     * The counts above are the BULK document writes — `buildUpdates` on
     * actors, their items and world items. A pass that updates embedded
     * ActiveEffects appears in none of them, so on 26 September 2026 the
     * movement-effect-key pass rewrote nothing and the notice was
     * indistinguishable from the run where it rewrote twenty-one keys.
     * Graham could not tell whether the migration he had just approved had
     * done anything at all, and neither could I without counting by hand.
     *
     * AND A MIGRATION THAT CHANGED NOTHING SAYS SO. That is the case worth
     * a warning rather than a cheerful total: it is either a world already
     * at this schema, or a pass that did not run.
     */
    const alsoDid = [];
    if (result.movementEffectKeys?.length) {
      alsoDid.push(`${result.movementEffectKeys.length} movement effect key(s) moved onto the pool's base`);
    }
    if (result.staleTurnRecords?.length) {
      alsoDid.push(`${result.staleTurnRecords.length} stale per-turn record(s) cleared (${result.staleTurnRecords.join(", ")})`);
    }
    if (result.npcLuck?.length) {
      alsoDid.push(`${result.npcLuck.length} NPC(s) given luck 0 instead of the player's 15 (${result.npcLuck.join(", ")})`);
    }
    if (!result.actors && !result.items && !alsoDid.length) {
      ui.notifications.warn(
        "TRG Prime migration complete — nothing needed changing. If you expected changes, "
        + "this world was already at the current schema."
      );
    } else {
      ui.notifications.info(
        `TRG Prime migration complete: ${result.actors} Actors and ${result.items} Items updated`
        + `${alsoDid.length ? `, ${alsoDid.join(", ")}` : ""}.`
      );
    }

    // The class-skill conversion gets its own card, naming every
    // character and skill. It reinterprets a number a player typed, and
    // a migration that quietly rewrites the Skills tab and says nothing
    // is one nobody can check.
    if (result.powerPointReport?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Power points moved to a base</h3>` +
          `<p style="margin:2px 0">Maximum PP is worked out now — your own base, plus your class's PP column, plus your magical ability score. What each character had is now their base, so nothing changed on the sheet:</p>` +
          result.powerPointReport
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: base ${entry.base}</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }

    // STALE OWNED COPIES get a card of their own, and it names the
    // copies it REFUSED to touch as loudly as the ones it repaired.
    //
    // Graham's ruling, 28 August 2026, was a declared repair that states
    // what it changes. A GM who has house-ruled a spell needs to hear
    // that their version was noticed and kept, not discover months later
    // that a migration either did or did not respect it — and after the
    // 26 August pass that blanked every player sheet in this world, a
    // silent write is the wrong shape whatever it writes.
    // GRANTS THAT LOST THEIR POINTS get their own card, because this one
    // changes a NUMBER ON A CHARACTER SHEET rather than a spell's wiring,
    // and a migration that quietly moves a player's maximum PP is one
    // nobody can check.
    if (result.ppShortfalls?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Grants restored</h3>` +
          `<p style="margin:2px 0">These characters' records said a feature had granted them points that the sheet no longer held — the grant fired correctly and the value was lost afterwards. The sheet now agrees with the record again:</p>` +
          result.ppShortfalls
            .map((e) => `<p style="margin:2px 0"><strong>${escapeHTML(e.owner)}</strong>: ${escapeHTML(e.path.split(".").pop())} ${e.was} &rarr; <strong>${e.now}</strong></p>`)
            .join("") +
          `<p style="margin:6px 0 2px"><em>Nothing was lowered. A sheet holding more than its records claim is your own value and was left alone.</em></p>` +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }

    // STARTING WEALTH gets its own card for the reason the two above do:
    // it writes a value onto a character's background and class, and that
    // value decides how much coin they start with. A pass that changed
    // fifteen characters and said nothing is one nobody can check — which
    // is exactly what this one did on its first live run (15 Sep 2026),
    // and the omission was mine.
    if (result.wealthBackfill?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Starting wealth values filled in</h3>` +
          `<p style="margin:2px 0">Chapter 6's Background Wealth and Class Wealth tables arrived at 3.552.0, after these characters were built — their backgrounds and classes are copies taken before the values existed, so they were reading as 0. Filled from the compendium, by name:</p>` +
          result.wealthBackfill
            .map((e) => `<p style="margin:2px 0"><strong>${escapeHTML(e.actor)}</strong> — ${escapeHTML(e.item)}: <strong>${escapeHTML(String(e.wealth))}</strong>${
              e.rolled === null || e.rolled === undefined ? "" : ` (rolled <strong>${e.rolled}</strong>, recorded once)`}</p>`)
            .join("") +
          `<p style="margin:6px 0 2px"><em>Only empty values were filled. Anything you had edited yourself was left exactly as it was.</em></p>` +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }

    if (result.packCopies?.repaired?.length || result.packCopies?.kept?.length) {
      const line = (e) =>
        `<p style="margin:2px 0"><strong>${escapeHTML(e.owner)}</strong> — ${escapeHTML(e.item)}: <code>${escapeHTML(e.field)}</code></p>`;
      const fixed = (result.packCopies.repaired ?? []).map(line).join("");
      const left = (result.packCopies.kept ?? []).map(line).join("");
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Spells and items brought up to date</h3>` +
          `<p style="margin:2px 0">A spell on a character is a copy, so fixing one in the compendium never reached anybody already carrying it. These copies still held the exact value from before the fix and have been updated to match:</p>` +
          (fixed || `<p style="margin:2px 0"><em>Nothing needed updating.</em></p>`) +
          (left
            ? `<p style="margin:6px 0 2px"><strong>Left alone</strong> — these differ from both the old value and the new one, so they are somebody's own version and have not been touched:</p>${left}`
            : "") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }

    if (result.classSkillReport?.length || result.classSkillLeft?.length) {
      const row = (entry) =>
        `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: ${escapeHTML(entry.skills.join(", "))}</p>`;
      const rows = (result.classSkillReport ?? []).map(row).join("");
      const leftRows = (result.classSkillLeft ?? []).map(row).join("");
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Class skills converted</h3>` +
          `<p style="margin:2px 0">The Skills tab's Class column is a tickbox now, and the bonus is worked out from your class bonus. Everything that had a number in it has been ticked and the number cleared — otherwise it would have counted twice.</p>` +
          `${rows}` +
          (leftRows
            ? `<p style="margin:6px 0 2px"><strong>Left alone</strong> — these did not match the character's class bonus, so they say something other than "class skill". Have a look and tick them yourself if they should be:</p>${leftRows}`
            : "") +
          `<p style="margin:2px 0"><em>A flat class bonus from a feat — Favoured Terrain's +2, say — is not affected: it lives in the feat's own effect, not in this column.</em></p>` +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }

    // Level is derived from XP now. A character whose XP disagreed with
    // their typed Level had their XP moved to match the Level they
    // already had, so nobody's level changed the moment this shipped —
    // named here because it reinterprets a number a player typed, same
    // as the class-skill conversion above.
    if (result.levelXPReport?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">XP backfilled to match Level</h3>` +
          // "nobody's level changed" IS WHAT THIS CARD USED TO PROMISE,
          // and it was the last thing six characters saw before losing
          // their XP. The pass can now only ever RAISE a figure, so the
          // card states the movement instead of reassuring about it —
          // both numbers, every time, so a GM can see at a glance that
          // nothing went down.
          `<p style="margin:2px 0">Level is worked out from XP now — 10,000 per level. These characters had a Level typed on their sheet that their XP did not yet reach, so their XP has been raised to match it. Nothing here can lower an XP total:</p>` +
          result.levelXPReport
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: Level ${entry.level} — XP ${entry.from ?? "?"} → ${entry.xp}</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }

    // Alignment reinterpreted as Ethics — same treatment: named per
    // character, both the ones that carried straight across and the
    // ones that didn't, so nobody's old answer just disappears with
    // nothing on screen to explain where it went.
    if (result.ethicsMatched?.length || result.ethicsUnmatched?.length) {
      const matchedRows = (result.ethicsMatched ?? [])
        .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: Ethics set to ${escapeHTML(entry.ethic)}</p>`)
        .join("");
      const unmatchedRows = (result.ethicsUnmatched ?? [])
        .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: had "${escapeHTML(entry.value)}" — not one of the fifteen, left blank</p>`)
        .join("");
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Alignment converted to Ethics</h3>` +
          `<p style="margin:2px 0">The Alignment field is Ethics now (Chapter 8) — a fixed list of fifteen rather than free text.</p>` +
          (matchedRows ? `${matchedRows}` : "") +
          (unmatchedRows
            ? `<p style="margin:6px 0 2px"><strong>Left blank</strong> — these didn't already name one of the fifteen. Have a look and pick one on the sheet if they should carry an Ethic:</p>${unmatchedRows}`
            : "") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
    // Movement fields repaired from the duplicate-name corruption —
    // reported the same way the other stored-shape repairs above are,
    // so nobody finds their Fly speed silently changed with nothing on
    // screen to explain why.
    if (result.movementRepaired?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Movement fields repaired</h3>` +
          `<p style="margin:2px 0">A sheet bug (fixed this release) could store Land/Fly/Swim/Climb as a pair of values instead of one, if either was ever edited from both the Summary and Combat tabs. These characters had one or more fields in that shape — restored to a single number:</p>` +
          result.movementRepaired
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: ${escapeHTML(entry.fields.join(", "))}</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
    // A specialist/bonus spell grant that never got prepared — reported by
    // spell, per actor, so a player who could never cast Physical Boost (or
    // whichever spell) can see exactly why it works now.
    if (result.grantedSpellsPrepared?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Specialist and bonus spells made castable</h3>` +
          `<p style="margin:2px 0">A bug (fixed this release) left a specialist or bonus spell — granted by a wizard school, a deific aspect, a heritage, a background or a feat — permanently unmemorised for a learned caster, even though it was never meant to need memorising at all. These are set castable now:</p>` +
          result.grantedSpellsPrepared
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: ${escapeHTML(entry.spells.join(", "))}</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
    // A duplicate Spell Book entry from the "Add to Book" bug — reported
    // by spell, per actor, matching the movement/class-skill reports'
    // own "don't silently touch a character's items" convention.
    if (result.duplicateSpellBookEntries?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Duplicate spell book entries removed</h3>` +
          `<p style="margin:2px 0">A bug (fixed this release) let "Add to Book" add a spell already in the book. These characters had one or more duplicates — the memorised copy was kept where there was one, and the extra copy removed:</p>` +
          result.duplicateSpellBookEntries
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.actor)}</strong>: ${escapeHTML(entry.spells.join(", "))}</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
    // Granted innate spells that predate the Focus rule. Named per spell,
    // because the trait decides whether Refocus can restore it and a GM
    // may disagree about a particular one.
    if (result.grantedFocus?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Focus trait added to granted innate spells</h3>` +
          `<p style="margin:2px 0">A granted innate spell takes the Focus trait unless it says it is at will, constant, or usable so many times per day — which is what lets a successful Refocus restore one. These were granted before that rule existed:</p>` +
          result.grantedFocus
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.owner)}</strong>: ${escapeHTML(entry.spell)} — now <em>${escapeHTML(entry.traits)}</em></p>`)
            .join("") +
          `<p style="margin:6px 0 0" class="hint">Remove the trait on any spell where that is not right; nothing will add it back.</p>` +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
    // Consumables that were already in someone's pack when the Use button
    // arrived. Worth a line each: the difference between a potion that
    // heals and one that reads its label out is not visible on the row.
    if (result.consumableEffects?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Consumables can be used now</h3>` +
          `<p style="margin:2px 0">These were carried before consumables knew what they release, so pressing Use would only have read their description out. Matched against the compendium by name and now live:</p>` +
          result.consumableEffects
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.owner)}</strong>: ${escapeHTML(entry.item)} — ${escapeHTML(entry.releases)}</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
    // Ammunition that never had a batch size, so a quiver weighed twenty
    // quivers. Reported by item, because the repair is a guess from the
    // item's own name and a GM should be able to check it.
    if (result.ammunitionBatches?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Ammunition batch sizes restored</h3>` +
          `<p style="margin:2px 0">Ammunition is sold and weighed in bundles — 3 lb for <em>all twenty</em> arrows, not 3 lb each. These items predate the Batch Size field, so their weight was being multiplied by the whole bundle. The size was read from each item's own name and can be corrected on the item sheet:</p>` +
          result.ammunitionBatches
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.owner)}</strong>: ${escapeHTML(entry.item)} — batch of ${entry.batchSize}</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
    // A built consumable whose Uses were stored in the charged item's
    // shape. Reported for the same reason the passes above are: an item
    // whose fields silently changed is worth a line, and this one is the
    // difference between a potion that can be drunk and one that cannot.
    if (result.consumableUses?.length) {
      await ChatMessage.create({
        content: `<div class="trg-prime trg-check-card">` +
          `<h3 style="margin:0 0 4px 0">Consumable Uses repaired</h3>` +
          `<p style="margin:2px 0">The magic item builder wrote a consumable's Uses as a single number instead of a value-and-maximum pair, which left the field blank on the sheet and gave the new Use button nothing to count down. Repaired:</p>` +
          result.consumableUses
            .map((entry) => `<p style="margin:2px 0"><strong>${escapeHTML(entry.owner)}</strong>: ${escapeHTML(entry.item)} (${entry.uses} use${entry.uses === 1 ? "" : "s"})</p>`)
            .join("") +
          `</div>`,
        whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id)
      });
    }
  } catch (error) {
    console.error("TRG Prime | World migration failed", error);
    ui.notifications.error(
      "TRG Prime migration failed. No completion version was recorded; check the console for details.",
      { permanent: true }
    );
  }
}

/**
 * Safely obtain migrated system data from a document.
 *
 * Guards against a document class that does not implement `migrateSystemData`.
 * A missing implementation previously threw for every document, which the
 * surrounding try/catch swallowed, so the schema version was never recorded and
 * the migration prompt reappeared on every world load.
 *
 * @param {Document} document The Actor or Item being migrated.
 * @returns {object|null} The migrated system data, or null if unavailable.
 */
function getMigratedSystemData(document) {
  if (typeof document?.migrateSystemData !== "function") {
    console.warn(
      `TRG Prime | ${document?.documentName ?? "Document"} "${document?.name ?? document?.id}" does not implement migrateSystemData(); skipping.`
    );
    return null;
  }

  try {
    return document.migrateSystemData();
  } catch (error) {
    console.error(
      `TRG Prime | Failed to migrate ${document.documentName} "${document.name}"`,
      error
    );
    return null;
  }
}

/**
 * Build the update payload for a collection of documents, omitting any that
 * could not be migrated.
 *
 * @param {Document[]} documents
 * @returns {object[]}
 */
function buildUpdates(documents) {
  const updates = [];

  for (const document of documents) {
    const system = getMigratedSystemData(document);
    if (!system) continue;

    updates.push({
      _id: document.id,
      system,
      [`flags.${SYSTEM_ID}.schemaVersion`]: TRG_SCHEMA_VERSION
    });
  }

  return updates;
}

/**
 * Migrate world Actors and Items by restoring any missing fields from the
 * current template and stamping the schema version on each document.
 */
export async function migrateWorldData(fromVersion = "") {
  const result = {
    actors: 0,
    items: 0,
    classSkills: 0
  };

  /**
   * A HISTORICAL PASS ONLY RUNS ON A WORLD THAT PREDATES IT.
   *
   * Until 3.311.2 every pass in this function ran on every migration,
   * however new the world was, and each was expected to be individually
   * idempotent. That is a lot to ask of every pass forever, and one of
   * them stopped being idempotent without anybody touching it:
   * `migrateLevelXP` was written when Level was typed and XP derived,
   * and quietly reversed meaning when 3.218.0 made Level the derived
   * one. It then destroyed a character's XP every time the button was
   * pressed — see its own note.
   *
   * Idempotence is still required of every pass; this is the second
   * line, and it is the one that would have contained that defect to
   * the worlds it was actually written for. A pass that has already run
   * cannot run again to be wrong twice.
   *
   * An UNVERSIONED world runs everything, which is the point of the
   * unversioned case: it genuinely predates all of it.
   */
  const from = String(fromVersion ?? "").trim();
  const predates = (version) =>
    !from || foundry.utils.isNewerVersion(version, from);
  result.migratedFrom = from || "(unversioned)";
  result.passesRun = [];
  const runIf = async (version, label, task) => {
    if (!predates(version)) return null;
    result.passesRun.push(`${version} ${label}`);
    return task();
  };

  const actors = Array.from(game.actors ?? []);

  // 3.204.0 — the Class column becomes a tickbox.
  //
  // That column used to hold a NUMBER meaning "this skill gets my class
  // bonus", typed in by hand. The bonus is derived now, so a leftover
  // number would be counted twice: once from the tick and once from the
  // slot it is still sitting in. Every non-zero value becomes a tick and
  // the number is cleared, and everything touched is reported.
  // Unlinked tokens carry their own overrides. A token whose delta holds
  // a typed Class column keeps it while its base actor gets the tick, so
  // that token would count the bonus twice with nothing on any sheet to
  // show it.
  const tokenActors = [];
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink) continue;
      if (token.actor) tokenActors.push(token.actor);
    }
  }
  // 3.218.0 — a player character's Level is derived from XP.
  //
  // Everyone's Level used to be typed in by hand; a character migrated
  // straight off whatever XP their sheet happened to hold — the
  // template default of 10,000 (1st), for most — would otherwise DROP
  // to whatever that XP derives to the moment this ships. Run first,
  // before anything else here reads a character's level.
  const levelXPMoved = (await runIf("3.218.0", "level from XP",
    () => migrateLevelXP([...actors, ...tokenActors]))) ?? [];
  result.levelXP = levelXPMoved.length;
  result.levelXPReport = levelXPMoved;

  // 3.220.0 — Alignment becomes Ethics, a closed fifteen-entry list
  // instead of free text. Run early alongside the identity-block passes
  // above; independent of level/XP/skills/PP, so order relative to them
  // does not matter, but it belongs beside them rather than after.
  const ethicsMoved = (await runIf("3.220.0", "alignment to ethics",
    () => migrateAlignmentToEthics([...actors, ...tokenActors]))) ?? { matched: [], unmatched: [] };
  result.ethicsMatched = ethicsMoved.matched;
  result.ethicsUnmatched = ethicsMoved.unmatched;

  // 3.206.0 — maximum PP splits into a stored base and a derived maximum.
  //
  // Everything a character had typed or been granted lived in `max`;
  // `max` is computed now, so that value has to move into `base` or it is
  // lost the first time the sheet prepares. Run before the class-skill
  // pass so both land in one migration, and idempotent by the same test
  // every other pass here uses: a base that already holds something is
  // left alone.
  const ppMoved = (await runIf("3.206.0", "power point base",
    () => migratePowerPointBase([...actors, ...tokenActors]))) ?? [];
  result.powerPoints = ppMoved.length;
  result.powerPointReport = ppMoved;

  const converted = (await runIf("3.204.0", "class skill column",
    () => migrateClassSkillColumn([...actors, ...tokenActors]))) ?? { converted: [], left: [] };
  result.classSkills = converted.converted.length;
  result.classSkillReport = converted.converted;
  result.classSkillLeft = converted.left;

  // 3.223.3 — repair movement fields corrupted into arrays by a
  // duplicate-name sheet bug (see migrateMovementArrays' own doc).
  // Independent of everything else here; order doesn't matter.
  const movementRepaired = (await runIf("3.223.3", "movement arrays",
    () => migrateMovementArrays([...actors, ...tokenActors]))) ?? [];
  result.movementRepaired = movementRepaired;

  // 3.412.0 — movement speeds become bonus pools. MUST run after the
  // array repair above: that pass flattens a corrupted [0,0] back to a
  // number, and this one then wraps the number in a pool. The other order
  // would pool the corruption.
  const movementPooled = (await runIf("3.412.0", "pooled movement",
    () => migratePooledMovement([...actors, ...tokenActors]))) ?? [];
  result.movementPooled = movementPooled;

  // 3.230.7 — a specialist/bonus spell grant left `prepared: false`
  // forever (see migrateGrantedSpellsPrepared's own doc). Independent of
  // the dedupe pass below — they touch disjoint spells (this excludes
  // spellBookPick outright) — so order between the two doesn't matter.
  const grantedSpellsPrepared = (await runIf("3.230.7", "granted spells prepared",
    () => migrateGrantedSpellsPrepared([...actors, ...tokenActors]))) ?? [];
  result.grantedSpellsPrepared = grantedSpellsPrepared;

  // 3.230.7 — "Add to Book" could add a spell already in the book (see
  // migrateDuplicateSpellBookEntries' own doc).
  const duplicateSpellBookEntries = (await runIf("3.230.7", "duplicate spell book entries",
    () => migrateDuplicateSpellBookEntries([...actors, ...tokenActors]))) ?? [];
  result.duplicateSpellBookEntries = duplicateSpellBookEntries;

  // 3.310.0 — a built consumable stored `uses` as a scalar (see
  // migrateConsumableUses' own doc). World items too, not just carried
  // ones: a potion saved into the Custom Magic Items pack has the same
  // wrong shape and will be dragged onto a sheet later.
  const consumableUses = (await runIf("3.310.0", "consumable uses pair",
    () => migrateConsumableUses([...actors, ...tokenActors], Array.from(game.items ?? [])))) ?? [];
  result.consumableUses = consumableUses;

  // 3.311.0 — ammunition that predates `batchSize` (see
  // migrateAmmunitionBatchSize's own doc). Independent of the pass above;
  // they touch different item types.
  const ammunitionBatches = (await runIf("3.311.0", "ammunition batch size",
    () => migrateAmmunitionBatchSize([...actors, ...tokenActors], Array.from(game.items ?? [])))) ?? [];
  result.ammunitionBatches = ammunitionBatches;

  // 3.311.1 — consumables already on a sheet know nothing about what they
  // release (see migrateConsumableEffects' own doc). Runs after the Uses
  // repair above, which is about the same items' other field.
  const consumableEffects = (await runIf("3.311.1", "consumable effects backfill",
    () => migrateConsumableEffects([...actors, ...tokenActors], Array.from(game.items ?? [])))) ?? [];
  result.consumableEffects = consumableEffects;

  // 3.311.4 — granted innate spells already on a sheet predate the Focus
  // rule (see migrateGrantedInnateFocus' own doc).
  const grantedFocus = (await runIf("3.311.4", "granted innate Focus trait",
    () => migrateGrantedInnateFocus([...actors, ...tokenActors]))) ?? [];
  result.grantedFocus = grantedFocus;

  // 3.312.0 — Potion of Stoneskin shipped a level short of its own spell
  // (see migrateStoneskinPotionLevel's own doc).
  const stoneskinPotions = (await runIf("3.312.0", "Potion of Stoneskin level",
    () => migrateStoneskinPotionLevel([...actors, ...tokenActors], Array.from(game.items ?? [])))) ?? [];
  result.stoneskinPotions = stoneskinPotions;

  // 3.431.0 — STALE OWNED COPIES of items this project has fixed in the
  // pack. Not a historical pass in the usual sense: every earlier entry
  // repairs a shape the system itself once wrote, while this repairs the
  // fact that a compendium edit never reaches a character who already
  // owns the item. See migrateStalePackCopies.
  //
  // RUNS ON EVERY WORLD THAT PREDATES 3.431.0, which is all of them —
  // and it is safe to keep running, because old-value matching makes it
  // idempotent by construction rather than by an argument.
  // RE-VERSIONED WHENEVER THE MANIFEST GROWS (3.434.0, was 3.431.0).
  //
  // A world already past the old version skips the pass — so the Cutting
  // Words entry added at 3.434.0 would have been written, checked,
  // shipped and never applied to a single owned copy. `verify-speed-pool`
  // F4 caught this: the schema version was ahead of every pass, which is
  // the same silent-failure shape the schema check was written for at
  // 3.431.0, arriving from the other direction.
  //
  // SAFE TO RE-RUN BY CONSTRUCTION. Old-value matching means an
  // already-repaired copy reads as `current` and is skipped, so bumping
  // this each time the manifest grows costs a pass over the items and
  // nothing else.
  // RE-VERSIONED TO 3.600.0 (3.601.0). The gate had sat at 3.435.0 while ten
  // entries were added for the Grimoire authoring of 26-28 September, so every
  // world already past 3.435.0 — which is all of them — would have skipped
  // them. `verify-pack-repairs` F1b caught it the moment the entries landed,
  // which is the whole reason that check exists.
  const packCopies = (await runIf("3.618.0", "stale owned copies of repaired pack items",
    () => migrateStalePackCopies([...actors, ...tokenActors], Array.from(game.items ?? []))))
    ?? { repaired: [], kept: [] };
  result.packCopies = packCopies;

  // 3.433.0 — STORED-DELTA GRANTS whose field no longer holds what their
  // flag says was applied. See migrateStoredDeltaShortfall.
  const ppShortfalls = (await runIf("3.433.0", "grants whose field lost what the record claims",
    () => migrateStoredDeltaShortfall([...actors, ...tokenActors]))) ?? [];
  result.ppShortfalls = ppShortfalls;

  // 3.552.1 — STARTING WEALTH on characters built before it existed.
  //
  // The Background Wealth and Class Wealth tables landed in the packs at
  // 3.552.0, but an actor's background and class are COPIES taken when
  // they were added. Every existing character therefore carries a
  // background printing no wealth at all, which reads as 0 — and 0 is a
  // legitimate value in that table, so nothing looked wrong. Merrick
  // Thorne's Field Medic scored 0 where the book prints 1.
  //
  // See migrateStartingWealthValues.
  const wealthBackfill = (await runIf("3.552.1", "starting wealth on owned backgrounds and classes",
    () => migrateStartingWealthValues([...actors, ...tokenActors]))) ?? [];
  result.wealthBackfill = wealthBackfill;

  // 3.595.2 — EFFECT CHANGES that still write a speed as a bare number.
  //
  // `migratePooledMovement` (3.412.1) fixed the stored fields and left the
  // effects alone; twenty-two survived on race items in Graham's world,
  // discarding every typed Speed bonus on those actors and standing ready
  // to abort the sheet the next time anything else wrote into the same
  // node. See migrateMovementEffectKeys.
  const movementKeys = (await runIf("3.595.2", "movement effect keys onto the pool's base",
    () => migrateMovementEffectKeys([...actors, ...tokenActors], Array.from(game.items ?? [])))) ?? [];
  result.movementEffectKeys = movementKeys;

  // 3.622.1 — STALE PER-TURN RECORDS (the 3.622.0 drive's F4, Graham's R4).
  // Before 3.622.0 the trait record was written out of combat too, and the
  // attack counter outlived every fight; an unlinked token cannot delete what
  // its base actor holds. See migrateStaleTurnRecords.
  const staleTurnRecords = (await runIf("3.622.1", "stale per-turn trait records and attack counts",
    () => migrateStaleTurnRecords(actors, tokenActors))) ?? [];
  result.staleTurnRecords = staleTurnRecords;

  // 3.624.0 — AN NPC'S LUCK (block 40's R16). Every NPC, companion and
  // familiar carried the player's 15 from the template. See migrateNpcLuck.
  const npcLuck = (await runIf("3.624.0", "the player's starting luck off NPCs, companions and familiars",
    () => migrateNpcLuck(actors, tokenActors))) ?? [];
  result.npcLuck = npcLuck;

  // 3.627.1 — OWNED EFFECTS of items whose pack effect was corrected: the
  // Undead creature type's missing disease immunity (Graham, 7 Oct 2026).
  // See EFFECT_REPAIRS in data/pack-repairs.mjs and migrateOwnedEffectRepairs.
  const effectRepairs = (await runIf("3.627.1", "declared effect repairs on owned items (Undead disease immunity)",
    () => migrateOwnedEffectRepairs(actors, tokenActors, Array.from(game.items ?? [])))) ?? [];
  result.effectRepairs = effectRepairs;

  const actorUpdates = buildUpdates(actors);

  for (const updates of chunk(actorUpdates, 50)) {
    await Actor.implementation.updateDocuments(updates, { diff: false });
    result.actors += updates.length;
  }

  for (const actor of actors) {
    const itemUpdates = buildUpdates(Array.from(actor.items ?? []));

    for (const updates of chunk(itemUpdates, 50)) {
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
      result.items += updates.length;
    }
  }

  const worldItemUpdates = buildUpdates(Array.from(game.items ?? []));

  for (const updates of chunk(worldItemUpdates, 50)) {
    await Item.implementation.updateDocuments(updates, { diff: false });
    result.items += updates.length;
  }

  return result;
}

/**
 * Backfill XP so a player character's Level doesn't change the moment
 * "Level from XP" ships (3.218.0, 10,000 XP per level).
 *
 * Level is derived from XP now. A character built before this feature
 * has whatever XP their sheet happened to hold — the template default
 * (10,000, 1st) for most, since nothing read it before — while their
 * stored Level is whatever they had actually reached. Left alone, the
 * very first prepare after this ships would derive Level straight back
 * from that stale XP and drop every levelled character to 1st. This
 * pass runs the other direction: it trusts the LEVEL already on the
 * sheet and moves XP to match it, so nobody's level changes.
 *
 * Reads `_source`: prepared `system.identity.level` would already BE
 * the derived value by the time a live actor is read, which is exactly
 * the number this pass exists to detect disagreement with, not trust.
 *
 * Idempotent, by the same test every other pass here uses: a character
 * whose stored XP already implies the stored Level is left alone, so
 * re-running this migration touches nothing.
 *
 * NPCs are skipped — their Level was never derived from XP (see
 * documents/actor.mjs's prepareIdentity) and stays exactly what the GM
 * typed.
 *
 * @returns {Promise<Array<{actor: string, level: number, xp: number}>>}
 */
export async function migrateLevelXP(actors = []) {
  const report = [];
  for (const actor of actors) {
    if (actor?.type !== "character") continue;

    const identity = actor?._source?.system?.identity;
    if (!identity) continue;

    const level = Math.max(1, Math.round(Number(identity.level) || 1));
    const currentXP = Number(identity.xp?.value ?? 0);
    if (levelForXP(currentXP) === level) continue;

    // ================================================================
    // TWO GUARDS, AND THEY ARE NOT THE SAME RULE.
    //
    // WHAT WENT WRONG (Graham, 14 Aug 2026): "Every time I click the
    // migrate world button after a system change, it resets all PC
    // levels to 1. I suspect that this has something to do with the XP
    // value setting level rather than an NPC who has level set
    // manually and is unaffected." Exactly right, in every part.
    //
    // THE AUTHORITY FLIPPED UNDER THIS FUNCTION. In 3.218.0 a
    // character's Level was typed on the sheet and XP was the stale
    // field, so backfilling XP FROM the level was the safe direction —
    // it is what this whole pass is named after. But that same release
    // made Level an `<output>` derived from XP (see resolveIdentityLevel
    // in config.mjs, and the character sheet, where the input became a
    // read-only field). NOTHING HAS WRITTEN `identity.level` FOR A
    // PLAYER CHARACTER SINCE. It sits at the template default of 1
    // forever, and this pass read that dead 1, decided a level 3
    // character's 30,000 XP "disagreed", and wrote 10,000 over it.
    //
    // Six player characters in Graham's world lost their XP that way,
    // twice, because a schema bump fires the prompt and I bumped it
    // twice in one afternoon.
    //
    const backfilled = xpForLevel(level);

    // ONE GUARD, AND IT IS THE ONLY STATEMENT OF THE RULE.
    //
    // A BACKFILL MAY ONLY ADD. It fills a gap; it does not demote
    // anybody. That single line is what stops a stale `identity.level`
    // of 1 from writing 10,000 over a level 3 character's 30,000 XP, and
    // it would equally stop any FUTURE field that goes stale the same
    // way — which is the real lesson here, because nobody edited this
    // function to break it.
    //
    // THERE WAS A SECOND GUARD HERE and it has been removed, because it
    // could not fire. It read `if (level <= 1) continue;` — "a stored
    // level of 1 is not evidence" — which is true and is why this
    // happened, but is not reachable: `levelForXP` clamps to a minimum
    // of 1, so a stored level of 1 either equals `levelForXP(currentXP)`
    // and is skipped by the equality check above, or does not, in which
    // case the XP already implies a HIGHER level and the line below
    // skips it. Every path was covered twice.
    //
    // The mutation runner is what proved it: deleting that guard changed
    // no behaviour any check could see. Two statements of one rule mask
    // each other — mutate either and the other still covers it, so
    // neither is ever actually under test. The same trap the innate-PP
    // exemption fell into (see the `totalPP` note in cast-workflow). The
    // reasoning is kept; the dead line is not.
    if (backfilled <= currentXP) continue;

    try {
      await actor.update({ "system.identity.xp.value": backfilled });
      report.push({ actor: actor.name, level, xp: backfilled, from: currentXP });
    } catch (error) {
      console.error(`TRG Prime | Level/XP migration failed for "${actor.name}"`, error);
    }
  }
  return report;
}

/**
 * Move a character's free-text Alignment into the new Ethics field
 * (3.220.0, Chapter 8's Ethics Alignment System).
 *
 * The old field was free text — whatever a player typed. The new one is
 * a closed list of fifteen (config.mjs's ETHICS). A stored value that
 * already NAMES one of the fifteen — matched case- and
 * whitespace-insensitively against the book's own labels — carries
 * straight across. Anything else (blank, "Neutral", "Lawful Good", a
 * homebrew line the old free-text field happily accepted) is NOT
 * force-fitted to the nearest guess: that would be inventing a choice
 * the player never made. It is left blank for them to actually pick,
 * and reported either way, matching the class-skill conversion's own
 * rule for reinterpreting a typed value.
 *
 * The stray `alignment` key is deleted from every actor that still
 * carries it, whether or not it matched anything — the template no
 * longer declares the field at all, so nothing should still be reading
 * or writing it after this runs once.
 *
 * Reads `_source`: template.json no longer declares `alignment`, so a
 * PREPARED read would already be missing it by the time this could ask.
 *
 * Idempotent: an actor whose `_source` no longer carries the `alignment`
 * key at all — this pass having already run — is skipped outright, the
 * same test every other pass in this file uses.
 *
 * @returns {Promise<{matched: Array<{actor:string, ethic:string}>, unmatched: Array<{actor:string, value:string}>}>}
 */
export async function migrateAlignmentToEthics(actors = []) {
  const byLabel = new Map(
    Object.entries(ETHICS).map(([key, entry]) => [entry.label.toLowerCase(), key])
  );
  const matched = [];
  const unmatched = [];

  for (const actor of actors) {
    const identity = actor?._source?.system?.identity;
    if (!identity || !Object.hasOwn(identity, "alignment")) continue;

    const typed = String(identity.alignment ?? "").trim();
    const key = typed ? byLabel.get(typed.toLowerCase()) : null;

    // Foundry 14 deprecated the `-=key: null` deletion syntax — a bare
    // key now takes the ForcedDeletion sentinel as its value instead of
    // being prefixed. Same effect (the field is genuinely removed, not
    // blanked), new spelling.
    const update = { "system.identity.alignment": deletionValue() };
    if (key) update["system.identity.ethics"] = key;

    try {
      await actor.update(update);
      if (key) matched.push({ actor: actor.name, ethic: ETHICS[key].label });
      else if (typed) unmatched.push({ actor: actor.name, value: typed });
    } catch (error) {
      console.error(`TRG Prime | Alignment/Ethics migration failed for "${actor.name}"`, error);
    }
  }

  return { matched, unmatched };
}

/**
 * Turn every typed Class column into a class-skill tick.
 *
 * Reads `_source`, never prepared data: several feats write ADD-mode
 * effects into skill class slots (Favoured Terrain's "+2 class to Nature,
 * Perception, Stealth and Survival" is the live one), and effects are
 * applied before derived data — so a prepared read would tick a skill
 * because of a feat, and worse, would carry the feat's number into the
 * migration's own report.
 *
 * A flat class bonus like that is NOT a class skill and must survive as a
 * bonus. It does: it lives in the effect, not in the stored value, and
 * this only ever clears what was stored.
 *
 * @returns {Promise<Array<{actor: string, skills: string[]}>>}
 */
/**
 * Move each character's stored maximum PP into the new base field.
 *
 * `pp.max` is derived from 3.206.0 — base + the class table's PP column +
 * your magical ability score — so whatever was in it (a GM's typed
 * figure, a racial grant, Aura of Power, a Knight feat) has to become the
 * base. Left where it was, it would simply vanish, and every stored-delta
 * grant would then find its own recorded amount missing and never
 * re-apply it.
 *
 * Reads `_source`: `max` is already derived by the time an actor is
 * prepared, so a prepared read here would fold the class table and the
 * ability bonus into the base and count both twice for ever.
 *
 * @returns {Promise<Array<{actor: string, base: number}>>}
 */
export async function migratePowerPointBase(actors = []) {
  const moved = [];
  for (const actor of actors) {
    const pp = actor?._source?.system?.resources?.pp;
    if (!pp || typeof pp !== "object") continue;
    // Already migrated — a base holding something is this pass having
    // already run, and re-running would add the maximum on top of itself.
    if (Number(pp.base ?? 0) !== 0) continue;
    const stored = Number(pp.max ?? 0);
    if (!Number.isFinite(stored) || stored === 0) continue;
    try {
      // The legacy `max` is zeroed in the same update. Left behind, it is
      // preserved by the template restore (stored wins), so a player who
      // later zeroes their base — entirely rational once a class supplies
      // the pool — would have it silently reset from the stale value at
      // the NEXT schema bump.
      await actor.update({ "system.resources.pp.base": stored, "system.resources.pp.max": 0 });
      moved.push({ actor: actor.name, base: stored });
    } catch (error) {
      console.error(`TRG Prime | power-point migration failed for "${actor.name}"`, error);
    }
  }
  return moved;
}

export async function migrateClassSkillColumn(actors = []) {
  const report = [];
  const left = [];

  for (const actor of actors) {
    const stored = actor?._source?.system?.skills;
    if (!stored || typeof stored !== "object") continue;
    // The pre-3.2.0 ARRAY shape is also `typeof "object"`. Walking it
    // with Object.entries gives keys "0", "1", … and the update would be
    // `system.skills.0.classSkill` — which merges an object into an
    // array, and Foundry replaces rather than recursing, so the whole
    // skill collection would be rebuilt blank and every rank lost.
    // Those actors are normalised by the pass that runs after this one;
    // there is nothing here worth risking that for.
    if (Array.isArray(stored)) continue;

    const classBonus = classBonusForLevel(actor?.system?.identity?.level ?? 0);
    const update = {};
    const touched = [];
    const skipped = [];
    for (const [key, skill] of Object.entries(stored)) {
      const value = Number(skill?.class ?? 0);
      if (!Number.isFinite(value) || value === 0) continue;
      const label = actor.system?.skills?.[key]?.label ?? key;
      // ONLY a value that matches the character's class bonus is read as
      // "this is a class skill". Anything else is a different statement
      // and reinterpreting it would invent a bonus: a stale +2 left in
      // the column by Medic's effect would become a full class skill
      // worth +4 at 10th, on top of Medic's own +2; an NPC with 8 typed
      // in would silently drop to 3. Those are reported and left alone.
      if (value !== classBonus || classBonus === 0) {
        skipped.push(`${label} (${value})`);
        continue;
      }
      update[`system.skills.${key}.classSkill`] = true;
      update[`system.skills.${key}.class`] = 0;
      touched.push(label);
    }
    if (skipped.length) left.push({ actor: actor.name, skills: skipped });
    if (!touched.length) continue;

    try {
      await actor.update(update);
      report.push({ actor: actor.name, skills: touched });
    } catch (error) {
      console.error(`TRG Prime | class-skill migration failed for "${actor.name}"`, error);
    }
  }

  return { converted: report, left };
}

/**
 * Repair movement fields corrupted into two-element arrays (3.223.3).
 *
 * The Combat tab's "Defences & Movement" card duplicated Land/Fly/Swim/
 * Climb inputs that were already editable on the Summary tab's own
 * Movement & Load card — the same `name="system.combat.movement.*"`
 * on two inputs present in the DOM at once (tabs hide the inactive
 * panel, they don't remove it). Any edit submitted both same-named
 * inputs together, and Foundry's form-data collection turned the
 * duplicate into a two-element array (`[0, 0]`, `[null, null]`)
 * instead of a single number — silently, with no error, the first
 * time anyone touched movement on either tab. Handlebars then rendered
 * that array back into the number inputs' own `value` attribute via
 * its default `Array#join(",")` stringification, which for an
 * all-null/all-empty pair is the literal string "," — the exact
 * console warning ("The specified value "," cannot be parsed") that
 * led to this being found, live, on Graham's own test PC.
 *
 * This pass collapses any such array back to a single number — the
 * first finite value found in it, since both duplicate inputs were
 * always meant to hold the same figure, or 0 if neither element is
 * usable. Reads `_source`: the corrupted shape lives in stored data,
 * not anywhere derived data would still show it as an array (derived
 * preparation coerces through `Number(...)` at every read site, so the
 * corruption was invisible to actual gameplay math — this was a
 * display/storage bug, not a combat-math one).
 *
 * Idempotent: a field that isn't an Array is left alone, so a
 * character already repaired (or never corrupted) is untouched by a
 * second run.
 *
 * @returns {Promise<Array<{actor: string, fields: string[]}>>}
 */
/**
 * Movement speeds become BONUS POOLS (3.412.0).
 *
 * Until now each speed was a bare number, and every typed bonus aimed at
 * one silently vanished — `applyBonusEffect` and the Universal Modifier
 * both write to `<path>.<bonusType>`, so `movement.land.status` was a
 * property set on the number 30. Graham's ruling was to pool them.
 *
 * Every stored actor therefore holds the OLD shape and needs the number
 * moved into `.base`. Anything else would read the pool's `total` as
 * undefined and every character in the world would have a Speed of 0.
 *
 * IDEMPOTENT, and that matters more than usual here: a speed already a
 * pool is left exactly alone, so a second run — or a world half-migrated
 * when someone closed the tab — cannot flatten a pool back down or wrap
 * a pool inside another pool.
 *
 * THE VALUE IS PRESERVED, NOT RECOMPUTED. Whatever the character had is
 * what they keep; derivation applies armour, encumbrance and rounding on
 * top exactly as before.
 */
/**
 * What one stored speed should become.
 *
 * MOVED TO combat/speed-pool.mjs AT 3.412.1 and re-exported here so this
 * module's importers are undisturbed.
 *
 * THE COMMENT THAT USED TO SIT HERE said the rule was extracted because
 * "a rule decided inside an `actor.update` loop is one no check can call
 * — the shape this project has paid for seven times." That was right, and
 * it was half the job. The migration's copy of the shape got a name and a
 * harness; DERIVATION's copy stayed inside `prepareDerivedData`, where
 * nothing can call it either, and that copy is the one that crashed every
 * actor in the world. Two places deciding one question, with the second
 * place invisible. There is now one definition and every reader takes it.
 */
export { pooledSpeedValue } from "./combat/speed-pool.mjs";

export async function migratePooledMovement(actors = []) {
  const FIELDS = SPEED_KEYS;
  const report = [];

  for (const actor of actors) {
    const movement = actor?._source?.system?.combat?.movement;
    if (!movement || typeof movement !== "object") continue;

    const update = {};
    const touched = [];
    for (const field of FIELDS) {
      const pooled = pooledSpeedValue(movement[field]);
      if (!pooled) continue;
      update[`system.combat.movement.${field}`] = pooled;
      touched.push(`${field} → base ${pooled.base}`);
    }
    if (!touched.length) continue;

    try {
      // ─────────────────────────────────────────────────────────────
      // NO `recursive: false`. THAT FLAG DESTROYED PLAYER DATA.
      //
      // It shipped as `{ diff: false, recursive: false }` and ran once,
      // in Graham's live world, on 26 August 2026 — the first migration
      // fired since 3.312.0, because 3.412.1 raised the schema version.
      //
      // `recursive: false` tells Foundry NOT to merge the update into
      // the existing document. The dotted keys expand to
      // `{system: {combat: {movement: {…}}}}`, and `system` is then
      // REPLACED by that object rather than merged into it. Every field
      // the update did not name — which is nearly all of them — fell
      // back to the template default.
      //
      // What it cost, on every player character in the world:
      //
      //   identity    level, race, heritage, background, class, ethics,
      //               deity and every descriptive field: blank
      //   xp          30,000 → 10,000 (the template default), which is
      //               why six level-3 characters read as level 1
      //   attributes  all six bases → 0
      //   skills      all ranks → 0
      //
      // The ITEMS survived, so the characters were not lost — but every
      // number their players had typed was.
      //
      // THE FLAG WAS NEVER NEEDED. This pass replaces one node per
      // speed, and a recursive merge of a dotted key does exactly that
      // and touches nothing else. `diff: false` is kept, because the
      // value must be written even where a shallow compare would call it
      // unchanged; that flag is safe on its own.
      //
      // `verify-migration-safety` now refuses `recursive: false` anywhere
      // in this file: no pass has ever wanted it, and the cost of one
      // that does is the entire sheet.
      await actor.update(update, { diff: false });
      report.push({ actor: actor.name, fields: touched });
    } catch (err) {
      console.error(`${SYSTEM_ID} | could not pool movement for ${actor.name}`, err);
    }
  }
  return report;
}

/**
 * ActiveEffect changes that still write a movement speed as a bare number.
 *
 * NEW at 3.595.2, and a live cast is what found it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE SPELLING COSTS.
 *
 * Before 3.412.0 each speed was a bare number, so an effect that set a
 * species' Speed wrote `system.combat.movement.land = 30`. The pooling
 * kept reading those — `normaliseMovement` coerces a number into a pool —
 * so nothing ever looked wrong, and `migratePooledMovement` fixed the
 * STORED fields while leaving effect CHANGES alone. Twenty-two of them
 * were still in Graham's world on 26 September 2026, on race items.
 *
 * Two things they do, both invisible:
 *
 *   • THE POOL IS REPLACED, not filled. An OVERRIDE of the whole node
 *     discards `item`, `status`, `circumstance` and `other` every
 *     preparation — so a +10 status bonus to Speed on such an actor is
 *     thrown away, which is the exact defect the pooling was introduced
 *     to remove.
 *   • ANY OTHER WRITE INTO THE SAME NODE CAN ABORT THE SHEET. Shape Of
 *     The Wyrm's land Speed was an override of `…land.base` for one
 *     release; applied after the race's bare-number change it threw
 *     *"Cannot create property 'base' on number '30'"*, and an exception
 *     inside effect application takes the whole of `prepareDerivedData`
 *     with it. That spell no longer writes an effect change (see
 *     magic/speed-set.mjs), but the next feature that does should not
 *     have to know this history.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE KEY MOVES; THE MODE AND VALUE DO NOT.
 *
 * `…movement.land` becomes `…movement.land.base`, and that is all. An
 * OVERRIDE of the base is what a species Speed means, and an ADD to the
 * base is what a +5 racial Speed means — both are correct on `.base` and
 * neither is this pass's business to reinterpret.
 *
 * IDEMPOTENT BY CONSTRUCTION: a key already ending in a pool field does
 * not match, so a second run finds nothing.
 *
 * @param {Array<Actor>} actors
 * @param {Array<Item>} worldItems
 * @returns {Promise<Array<{document: string, effect: string, keys: string[]}>>}
 */
export async function migrateMovementEffectKeys(actors = [], worldItems = []) {
  const BARE = new RegExp(`^system\\.combat\\.movement\\.(${SPEED_KEYS.join("|")})$`);
  const report = [];

  const fixEffects = async (doc, label) => {
    const updates = [];
    for (const effect of doc?.effects ?? []) {
      const changes = effect._source?.changes ?? effect.changes ?? [];
      if (!changes.some((c) => BARE.test(String(c?.key ?? "")))) continue;
      const moved = [];
      const next = changes.map((c) => {
        const key = String(c?.key ?? "");
        if (!BARE.test(key)) return c;
        moved.push(`${key} → ${key}.base`);
        return { ...c, key: `${key}.base` };
      });
      updates.push({ _id: effect.id, changes: next });
      report.push({ document: label, effect: effect.name, keys: moved });
    }
    if (!updates.length) return;
    try {
      await doc.updateEmbeddedDocuments("ActiveEffect", updates, { diff: false });
    } catch (err) {
      console.error(`${SYSTEM_ID} | could not move movement effect keys on ${label}`, err);
    }
  };

  for (const actor of actors) {
    await fixEffects(actor, actor.name);
    for (const item of actor.items ?? []) await fixEffects(item, `${actor.name} / ${item.name}`);
  }
  for (const item of worldItems) await fixEffects(item, item.name);
  return report;
}

export async function migrateMovementArrays(actors = []) {
  const FIELDS = ["land", "fly", "swim", "climb", "burrow"];
  const report = [];

  for (const actor of actors) {
    const movement = actor?._source?.system?.combat?.movement;
    if (!movement || typeof movement !== "object") continue;

    const update = {};
    const touched = [];
    for (const field of FIELDS) {
      const raw = movement[field];
      if (!Array.isArray(raw)) continue;

      // entry !== null/undefined/"" excluded explicitly, not just left to
      // Number.isFinite: Number(null) is 0, which IS finite, so a bare
      // Number.isFinite(Number(entry)) test would treat a leading null as
      // "found" and stop the search there — [null, 12] would wrongly
      // collapse to 0 and lose the 12 sitting right after it.
      const usable = raw.find((entry) =>
        entry !== null && entry !== undefined && entry !== "" && Number.isFinite(Number(entry)));
      const flattened = usable !== undefined ? Number(usable) : 0;
      update[`system.combat.movement.${field}`] = flattened;
      touched.push(`${field} → ${flattened}`);
    }
    if (!touched.length) continue;

    try {
      await actor.update(update);
      report.push({ actor: actor.name, fields: touched });
    } catch (error) {
      console.error(`TRG Prime | movement-field migration failed for "${actor.name}"`, error);
    }
  }

  return report;
}

/**
 * Set `prepared: true` on a specialist or bonus spell a grant left
 * unprepared forever (3.230.7).
 *
 * `grantChosenSpell` (feats-workflow.mjs) and the GRANT_FIELDS spells
 * grants (grants-workflow.mjs — a divine aspect's bonusSpells, a wizard
 * school's specialistSpells, a race/heritage/background/feat's own
 * grantedSpells) are both fixed this release to stamp `prepared: true` the
 * moment they create the spell — these are all "always available, no
 * memorisation" grants by design, the same promise a Deific Aspect's
 * bonusSpells already kept correctly since 3.225.0. Before this release
 * every OTHER one of these paths left the spell exactly as the compendium
 * shipped it (`prepared: false`), so Chapter 9's cast gate — "a learned
 * caster's non-innate spell must be memorised to cast it" — refused every
 * one of them forever, since nothing else in this system ever offers them
 * a way to become prepared. Graham hit this live on Physical Boost
 * (Alteration's own specialist spell) and Orb Of Lightning (a heritage's
 * granted cantrip).
 *
 * Only the fix's own reach is retroactive: a spell created by the ordinary
 * daily cycle (`dailyMemorised`) or living in the Wizard's Spell Book
 * (`spellBookPick`) is deliberately left alone — those are SUPPOSED to
 * start unprepared and be toggled on by memorising, and touching them here
 * would silently hand out spells nobody actually memorised today. Every
 * OTHER unprepared spell an actor owns is, by construction, one of these
 * always-available grants — nothing else in this system creates an
 * unflagged spell item.
 *
 * Idempotent: an already-prepared spell is left untouched, so re-running
 * this (or migrating a character created after this release, whose
 * grants already arrive prepared) touches nothing.
 *
 * @returns {Promise<Array<{actor: string, spells: string[]}>>}
 */
export async function migrateGrantedSpellsPrepared(actors = []) {
  const report = [];
  for (const actor of actors) {
    const spells = Array.from(actor.items ?? []).filter((item) => {
      if (item.type !== "spell") return false;
      if (item.system?.prepared) return false;
      const flags = item.flags?.[SYSTEM_ID] ?? {};
      return !flags.dailyMemorised && !flags.spellBookPick;
    });
    if (!spells.length) continue;

    try {
      await actor.updateEmbeddedDocuments(
        "Item",
        spells.map((item) => ({ _id: item.id, "system.prepared": true }))
      );
      report.push({ actor: actor.name, spells: spells.map((item) => item.name) });
    } catch (error) {
      console.error(`TRG Prime | granted-spell prepared migration failed for "${actor.name}"`, error);
    }
  }
  return report;
}

/**
 * Remove a Wizard's spell book's duplicate entries (3.230.7).
 *
 * "Add to Book" (spellbook-workflow.mjs) used to offer the whole pack
 * unfiltered, including whatever the book already held — picking the same
 * spell for a second slot created a second, fully independent owned item
 * with no link back to the first beyond sharing a name. Now fixed to
 * exclude the book's own contents from the browser, matched by the owned
 * item's own recorded source id (`sourceEntryId`, spellbook.mjs) — never
 * by name, since the shipped pack genuinely ships duplicate names ("Sleep"
 * at two different PP costs) a name match couldn't tell apart, the exact
 * ambiguity Graham hit live with two "Sleep" entries in one book.
 *
 * Grouped by that same source id: any group of more than one is a
 * duplicate. The PREPARED copy survives when one exists, so a spell the
 * player already has memorised today stays memorised; otherwise the first
 * by item order survives. Every other copy in the group is deleted
 * outright — a duplicate spell-book entry carries no state beyond
 * `prepared` worth keeping, and that's exactly what the "prefer prepared"
 * rule preserves.
 *
 * Idempotent: a book with no duplicate source ids is left untouched.
 *
 * @returns {Promise<Array<{actor: string, spells: string[]}>>}
 */
export async function migrateDuplicateSpellBookEntries(actors = []) {
  const report = [];
  for (const actor of actors) {
    const bookSpells = Array.from(actor.items ?? []).filter(
      (item) => item.type === "spell" && Boolean(item.flags?.[SYSTEM_ID]?.spellBookPick)
    );
    if (!bookSpells.length) continue;

    const bySource = new Map();
    for (const item of bookSpells) {
      const raw = String(item._stats?.compendiumSource ?? "").split(".");
      const key = (raw.length ? raw[raw.length - 1] : "") || item.id;
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key).push(item);
    }

    const toDelete = [];
    const names = [];
    for (const group of bySource.values()) {
      if (group.length < 2) continue;
      const keep = group.find((item) => item.system?.prepared) ?? group[0];
      for (const item of group) {
        if (item.id === keep.id) continue;
        toDelete.push(item.id);
        names.push(item.name);
      }
    }
    if (!toDelete.length) continue;

    try {
      await actor.deleteEmbeddedDocuments("Item", toDelete);
      report.push({ actor: actor.name, spells: names });
    } catch (error) {
      console.error(`TRG Prime | duplicate spell book migration failed for "${actor.name}"`, error);
    }
  }
  return report;
}

function hasMigratableWorldData() {
  if ((game.actors?.size ?? 0) > 0) return true;
  if ((game.items?.size ?? 0) > 0) return true;

  return Array.from(game.scenes ?? []).some((scene) => {
    return (scene.tokens?.size ?? scene.tokens?.length ?? 0) > 0;
  });
}

function chunk(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/**
 * Delete leftover Items of a type that is no longer valid in the current
 * schema (here: "action", removed in 3.16.0 when the action framework was
 * rearchitected from items to static system data — see the README).
 *
 * A document whose stored `type` isn't in the current schema fails
 * validation during Foundry's own startup and is never constructed as a
 * normal member of its collection, so it will never appear in a plain
 * `Array.from(collection)` the way migrateWorldData() above assumes for
 * ordinary field-level migrations. Foundry still tracks its ID in
 * `collection.invalidDocumentIds` precisely so it can be found and cleaned
 * up afterwards; `collection.get(id, { invalid: true })` returns a
 * reference to it that still supports deletion even though it never fully
 * validated. This runs unconditionally on every `ready`, independent of
 * the schema-version-gated migration above — it isn't converting data to
 * a new shape, just removing definitively orphaned data with no valid
 * interpretation left (a stray world-level "action" item can't be
 * repaired into anything; the whole item type no longer exists).
 *
 * @param {string} invalidType
 */
export async function purgeOrphanedItemsOfType(invalidType) {
  const purgeFrom = async (collection, deleteMany, label) => {
    if (!collection?.invalidDocumentIds?.size) return 0;

    const ids = [];
    for (const id of collection.invalidDocumentIds) {
      let doc;
      try {
        doc = collection.get(id, { invalid: true });
      } catch {
        continue;
      }
      if (doc?._source?.type === invalidType || doc?.type === invalidType) {
        ids.push(id);
      }
    }
    if (!ids.length) return 0;

    try {
      await deleteMany(ids);
      console.info(
        `TRG Prime | Removed ${ids.length} orphaned "${invalidType}" ${label}(s) left over from a removed item type.`
      );
      return ids.length;
    } catch (error) {
      console.error(
        `TRG Prime | Failed to remove orphaned "${invalidType}" ${label}(s)`,
        error
      );
      return 0;
    }
  };

  let removed = 0;

  removed += await purgeFrom(
    game.items,
    (ids) => Item.implementation.deleteDocuments(ids),
    "world item"
  );

  for (const actor of game.actors ?? []) {
    removed += await purgeFrom(
      actor.items,
      (ids) => actor.deleteEmbeddedDocuments("Item", ids),
      `item embedded on ${actor.name}`
    );
  }

  return removed;
}

function escapeHTML(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

/**
 * Repair a built consumable's `uses` (3.310.0).
 *
 * `builtItemData` wrote `system.uses = 1` for a consumable — the shape a
 * CHARGED item uses, where the field is a PP pool and a scalar is right.
 * On a consumable it is a `{value, max}` pair: the template says so, the
 * item sheet binds `system.uses.value` and `system.uses.max`, and every
 * shipped potion stores the pair. The wrong shape rendered the Uses fields
 * blank and left nothing for the new Use button to count down.
 *
 * A scalar becomes `{value: n, max: n}` — n rather than 1, because a
 * hand-edited two-dose item is exactly the case where assuming 1 would
 * quietly halve it. Anything already a pair is left alone, which is what
 * makes this idempotent.
 *
 * Charged and wondrous items are NOT touched: they are `gear`, their
 * `system.uses` is a PP pool, and a scalar there is correct. The filter is
 * on `type === "consumable"` for that reason and not on the flag.
 *
 * @returns {Promise<Array<{owner: string, item: string, uses: number}>>}
 */
export async function migrateConsumableUses(actors = [], worldItems = []) {
  const report = [];

  const needsRepair = (item) =>
    item.type === "consumable" &&
    item.system?.uses !== null &&
    item.system?.uses !== undefined &&
    typeof item.system.uses !== "object";

  const pairFor = (item) => {
    const n = Math.max(1, Math.floor(Number(item.system.uses) || 1));
    return { "system.uses": { value: n, max: n } };
  };

  for (const actor of actors) {
    const broken = Array.from(actor.items ?? []).filter(needsRepair);
    if (!broken.length) continue;
    try {
      await actor.updateEmbeddedDocuments(
        "Item",
        broken.map((item) => ({ _id: item.id, ...pairFor(item) })),
        { diff: false }
      );
      for (const item of broken) {
        report.push({ owner: actor.name, item: item.name, uses: Number(item.system.uses) || 1 });
      }
    } catch (error) {
      console.error(`TRG Prime | consumable uses migration failed for "${actor.name}"`, error);
    }
  }

  const brokenWorld = worldItems.filter(needsRepair);
  if (brokenWorld.length) {
    try {
      await Item.implementation.updateDocuments(
        brokenWorld.map((item) => ({ _id: item.id, ...pairFor(item) })),
        { diff: false }
      );
      for (const item of brokenWorld) {
        report.push({ owner: "World", item: item.name, uses: Number(item.system.uses) || 1 });
      }
    } catch (error) {
      console.error("TRG Prime | consumable uses migration failed for world items", error);
    }
  }

  return report;
}

/**
 * Restore a bundle's batch size (3.311.0).
 *
 * Ammunition is priced and weighed as a BUNDLE — "Arrows (20) | 1 gp | 3
 * lb" is one gold piece and three pounds for all twenty — and
 * `carriedWeightOf` divides by `system.batchSize` to say so. The field
 * arrived on 12 Aug 2026 and the shipped pack declares it, but an
 * ammunition item dragged onto a sheet BEFORE that date has no such field,
 * and the schema default of 1 makes it per-piece again: a full quiver
 * weighs 60 lb, most of a character's whole allowance.
 *
 * THE NAME IS THE ONLY SIGNAL A LEGACY ITEM HAS. `items.mjs` says the size
 * belongs in the pack "rather than having it parsed out of '(20)' in their
 * name, because a name is a label and a quantity is a number" — and that
 * is right about AUTHORING. This is repair, where the label is the only
 * surviving record of what the number was, so it is read once, here, and
 * every item touched is reported by name and by the size guessed so a GM
 * can check it.
 *
 * Conservative on both sides. Only `ammunition` items are considered; only
 * ones whose name ends in a parenthesised count; and only where the stored
 * `batchSize` is absent or 1, so a GM who has already set one is never
 * overruled. A count that does not parse to a positive integer is left
 * alone rather than guessed at.
 *
 * Idempotent: a second run finds every one of them already carrying a
 * batch size above 1 and touches nothing.
 *
 * @returns {Promise<Array<{owner: string, item: string, batchSize: number}>>}
 */
export async function migrateAmmunitionBatchSize(actors = [], worldItems = []) {
  const report = [];

  const batchFromName = (item) => {
    if (item.type !== "ammunition") return null;
    const stored = Number(item.system?.batchSize ?? 1);
    if (Number.isFinite(stored) && stored > 1) return null;
    const match = /\((\d+)\)\s*$/.exec(String(item.name ?? ""));
    if (!match) return null;
    const size = Number(match[1]);
    return Number.isInteger(size) && size > 1 ? size : null;
  };

  for (const actor of actors) {
    const updates = [];
    for (const item of Array.from(actor.items ?? [])) {
      const size = batchFromName(item);
      if (!size) continue;
      updates.push({ _id: item.id, "system.batchSize": size });
      report.push({ owner: actor.name, item: item.name, batchSize: size });
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | ammunition batch migration failed for "${actor.name}"`, error);
    }
  }

  const worldUpdates = [];
  for (const item of worldItems) {
    const size = batchFromName(item);
    if (!size) continue;
    worldUpdates.push({ _id: item.id, "system.batchSize": size });
    report.push({ owner: "World", item: item.name, batchSize: size });
  }
  if (worldUpdates.length) {
    try {
      await Item.implementation.updateDocuments(worldUpdates, { diff: false });
    } catch (error) {
      console.error("TRG Prime | ammunition batch migration failed for world items", error);
    }
  }

  return report;
}

/**
 * Teach a carried consumable what it releases (3.311.1).
 *
 * FOUND BY LIVE TESTING, in Graham's world, minutes after 3.311.0 went in.
 * The compendium was backfilled correctly — eleven of the seventeen shipped
 * consumables carry a spell or an effect — but a potion that was ALREADY in
 * a character's pack was copied onto that sheet before the backfill and
 * carries none of it. Three characters were holding Potions of Cure I, and
 * every one of them read as `mode: "description"`: pressing Use would have
 * printed the label and thrown the bottle away without healing anybody.
 *
 * Exactly the shape of defect this release is about — a fix that is correct
 * everywhere it was applied and was not applied everywhere it is needed.
 *
 * MATCHED BY NAME, and only where there is nothing to overwrite. A world
 * that has house-ruled its own Potion of Cure keeps it: an item that
 * already declares a spell or an effect is never touched, so this is
 * idempotent and safe to re-run. An item whose name is not in the
 * compendium is left alone rather than guessed at — it takes the
 * description path, which still works.
 *
 * @returns {Promise<Array<{owner: string, item: string, releases: string}>>}
 */
export async function migrateConsumableEffects(actors = [], worldItems = []) {
  const report = [];
  const pack = contentPack("consumables");
  if (!pack) return report;

  const index = await pack.getIndex({ fields: [`flags.${SYSTEM_ID}.consumable`] });
  const byName = new Map();
  for (const entry of index) {
    const flag = entry.flags?.[SYSTEM_ID]?.consumable;
    if (flag?.spell || flag?.effect) byName.set(String(entry.name).trim().toLowerCase(), flag);
  }
  if (!byName.size) return report;

  const repairFor = (item) => {
    if (item.type !== "consumable") return null;
    const own = item.flags?.[SYSTEM_ID]?.consumable ?? {};
    // Never overwrite a world's own answer.
    if (own.spell || own.effect) return null;
    const source = byName.get(String(item.name).trim().toLowerCase());
    if (!source) return null;
    const changes = {};
    if (source.spell) changes[`flags.${SYSTEM_ID}.consumable.spell`] = source.spell;
    if (source.effect) changes[`flags.${SYSTEM_ID}.consumable.effect`] = source.effect;
    // The kind decides Drink vs Read and whether a check is rolled, so it
    // travels with them when the item has none of its own.
    if (!own.kind && source.kind) changes[`flags.${SYSTEM_ID}.consumable.kind`] = source.kind;
    return {
      changes,
      releases: source.spell?.name ?? source.effect?.label ?? "its own effect"
    };
  };

  for (const actor of actors) {
    const updates = [];
    for (const item of Array.from(actor.items ?? [])) {
      const repair = repairFor(item);
      if (!repair) continue;
      updates.push({ _id: item.id, ...repair.changes });
      report.push({ owner: actor.name, item: item.name, releases: repair.releases });
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | consumable effect migration failed for "${actor.name}"`, error);
    }
  }

  const worldUpdates = [];
  for (const item of worldItems) {
    const repair = repairFor(item);
    if (!repair) continue;
    worldUpdates.push({ _id: item.id, ...repair.changes });
    report.push({ owner: "World", item: item.name, releases: repair.releases });
  }
  if (worldUpdates.length) {
    try {
      await Item.implementation.updateDocuments(worldUpdates, { diff: false });
    } catch (error) {
      console.error("TRG Prime | consumable effect migration failed for world items", error);
    }
  }

  return report;
}

/**
 * Give a granted innate spell the Focus trait it was created before
 * (3.311.4).
 *
 * The rule arrived in 3.311.3 and is applied by `TRGItem._preCreate` /
 * `_preUpdate`, so it catches every spell granted FROM then on and none of
 * the ones already sitting on sheets. Graham asked for the backfill after
 * live testing confirmed the rule itself works.
 *
 * Graham's rule, unchanged: "unless a granted innate spell states
 * specifically that it can be used at will, constant or so many times per
 * day it should have the focus trait." `grantedInnateTakesFocus`
 * (refocus.mjs) is that rule, and this pass asks IT rather than restating
 * it — a second copy is how the two would drift.
 *
 * ONLY ADDS, never removes. A world that has deliberately taken the trait
 * off a spell gets it back once here, which is the one direction this can
 * be wrong in, and the card names every spell touched so it can be undone.
 * It cannot un-grant, un-innate, or change a spell's uses.
 *
 * Idempotent: `grantedInnateTakesFocus` returns false for anything that
 * already carries it, so a second run finds nothing.
 *
 * @returns {Promise<Array<{owner: string, spell: string, traits: string}>>}
 */
export async function migrateGrantedInnateFocus(actors = []) {
  const report = [];

  for (const actor of actors) {
    const updates = [];
    for (const item of Array.from(actor.items ?? [])) {
      if (item.type !== "spell") continue;
      if (!item.system?.innate) continue;
      if (!item.flags?.[SYSTEM_ID]?.grantedBy) continue;
      if (!grantedInnateTakesFocus(item.system)) continue;
      const traits = withFocusTrait(item.system.traits);
      updates.push({ _id: item.id, "system.traits": traits });
      report.push({ owner: actor.name, spell: item.name, traits });
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | granted-innate Focus migration failed for "${actor.name}"`, error);
    }
  }

  return report;
}

/**
 * Potion of Stoneskin: item level 8 against a 10 PP spell.
 *
 * "A consumable has a level equal to the PP of the spell it creates" —
 * which `buildConsumable` implements as `level: pp`, and which the other
 * five spell-mode potions all obey. This one shipped at level 8 with a
 * cached `spell.pp` of 8 while Stoneskin itself costs 10, so the item was
 * a level short, its Save DC two short with it, and priced from the wrong
 * row of the cost table. Graham, 14 Aug 2026: "Potion of Stoneskin should
 * be level 10." Corrected in the pack; this repairs the copies already
 * bought, brewed or dragged onto a sheet.
 *
 * MATCHED BY NAME, NOT BY ID, deliberately. A potion that was dragged from
 * the compendium keeps its own id, and one built at a workbench never had
 * the compendium's. The name is what every copy shares.
 *
 * ONLY THE ONES STILL AT THE OLD FIGURES ARE TOUCHED. A world that has
 * already house-ruled its Stoneskin potion to level 12 keeps it — the
 * guard is `itemLevel === 8`, so this can only ever perform the one
 * correction it was written for, and running it twice does nothing.
 */
export async function migrateStoneskinPotionLevel(actors = [], worldItems = []) {
  const report = [];
  const CORRECT_LEVEL = 10;
  const CORRECT_PRICE = 1800;
  const OLD_LEVEL = 8;

  const wanted = (item) =>
    item?.type === "consumable" &&
    String(item.name ?? "").trim().toLowerCase() === "potion of stoneskin" &&
    Math.floor(Number(item.system?.itemLevel ?? 0)) === OLD_LEVEL;

  const changesFor = (item) => {
    const update = {
      "system.itemLevel": CORRECT_LEVEL,
      // The price only moves if it is still the level-8 row. A world that
      // has repriced its own copy is left alone.
      ...(Math.floor(Number(item.system?.price ?? 0)) === 900
        ? { "system.price": CORRECT_PRICE }
        : {})
    };
    const cached = item.flags?.[SYSTEM_ID]?.consumable?.spell;
    if (cached && Math.floor(Number(cached.pp ?? 0)) === OLD_LEVEL) {
      update[`flags.${SYSTEM_ID}.consumable.spell.pp`] = CORRECT_LEVEL;
    }
    return update;
  };

  for (const item of worldItems) {
    if (!wanted(item)) continue;
    try {
      await item.update(changesFor(item));
      report.push({ owner: "(world)", item: item.name });
    } catch (error) {
      console.error(`TRG Prime | Stoneskin level migration failed for world item "${item.name}"`, error);
    }
  }

  for (const actor of actors) {
    const updates = [];
    for (const item of Array.from(actor.items ?? [])) {
      if (!wanted(item)) continue;
      updates.push({ _id: item.id, ...changesFor(item) });
      report.push({ owner: actor.name, item: item.name });
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | Stoneskin level migration failed for "${actor.name}"`, error);
    }
  }

  return report;
}

/**
 * Bring stale OWNED copies of repaired pack items up to date.
 *
 * NEW at 3.431.0. The manifest is data/pack-repairs.mjs; the rule that
 * decides what may be touched is pack-repair.mjs; both carry the story.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GAP THIS CLOSES, and it had been open for weeks.
 *
 * A spell on a character is a COPY. Editing the compendium does not
 * reach anybody who already owns the spell — so every pack fix this
 * project shipped reached the compendium and stopped there. A sweep of
 * Graham's world on 28 August 2026 found one stale copy per fix shipped
 * that week, including a Bless still selling a 2 PP warp that bought
 * nothing and a Song Of Despair with no recovery floor at all. Three
 * defects recorded as FIXED were still live on the characters who owned
 * those spells.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT MAKES THIS SAFE TO RUN AT ALL.
 *
 *   - OLD-VALUE MATCHED. A field is written only where the owned value
 *     still deep-equals the recorded pre-fix value. A house-ruled copy
 *     matches neither side and is left alone; an already-current copy
 *     matches `to` and is skipped, so the pass is idempotent by
 *     construction.
 *   - DOTTED KEYS ONLY, per `verify-migration-safety`. The pass that
 *     blanked every player sheet in this world on 26 August 2026 wrote a
 *     whole nested object; `repairUpdate` cannot.
 *   - IT REPORTS WHAT IT DID, naming every owner, item and field, and
 *     naming separately the copies it deliberately refused to touch.
 *     Graham's ruling, 28 August 2026, was a declared repair that states
 *     what it will change — the silent version is what makes a migration
 *     frightening.
 *
 * @param {Actor[]} actors
 * @param {Item[]} worldItems
 * @returns {Promise<{repaired: Array, kept: Array}>}
 */
/*
 * NOT EXPORTED. Every earlier pass here is, and each is in the ratchet's
 * grandfathered backlog; a NEW export nothing outside this file calls is
 * refused, and rightly. The pass needs Foundry documents, so no harness
 * could import it anyway — `verify-pack-repairs` tests the pure rule it
 * delegates to and reads this file's wiring as source.
 */
async function migrateStalePackCopies(actors = [], worldItems = []) {
  const repaired = [];
  const kept = [];

  const inspect = (item, ownerName) => {
    const entries = repairsForName(PACK_REPAIRS, item?.name);
    if (!entries.length) return null;
    const classified = classifyRepairs(item.system ?? {}, entries);
    for (const row of classified) {
      if (row.state === "custom") {
        kept.push({ owner: ownerName, item: item.name, field: row.field, id: row.id });
      }
    }
    const update = repairUpdate(classified);
    if (!update) return null;
    for (const row of classified) {
      if (row.state === "stale") {
        repaired.push({ owner: ownerName, item: item.name, field: row.field, id: row.id, since: row.since });
      }
    }
    return update;
  };

  for (const item of worldItems) {
    const update = inspect(item, "(world)");
    if (!update) continue;
    try {
      await item.update(update, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | Pack-copy repair failed for world item "${item.name}"`, error);
    }
  }

  for (const actor of actors) {
    const updates = [];
    for (const item of Array.from(actor.items ?? [])) {
      const update = inspect(item, actor.name);
      if (update) updates.push({ _id: item.id, ...update });
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | Pack-copy repair failed for "${actor.name}"`, error);
    }
  }

  return { repaired, kept };
}


/**
 * Give back the stored-delta grants whose field lost them.
 *
 * NEW at 3.433.0. See `storedDeltaShortfall` for the defect and for what
 * is inferred: only a SHORTFALL against the positive record is repaired,
 * because a player's own contribution to the field cannot be negative.
 * A field at or above the record is left completely alone.
 *
 * Graham's ruling, 29 August 2026: repair where the field is short of
 * the flags, and report every change.
 *
 * WRITES THE FIELD, NOT THE FLAG. The record was right all along — it is
 * the field that lost the points — so the repair restores the field to
 * agree with the record and touches no flag. That also makes it
 * idempotent: a repaired field is no longer short, so a second run finds
 * nothing.
 *
 * @param {Actor[]} actors
 * @returns {Promise<Array<{owner: string, path: string, was: number, now: number}>>}
 */
async function migrateStoredDeltaShortfall(actors = []) {
  const report = [];
  // DYNAMICALLY IMPORTED, and it has to be. `feats-workflow.mjs` reaches
  // `foundry.applications` at module load through its own import chain, so
  // a STATIC import here makes migration.mjs unloadable in Node — which
  // silently broke `verify-bonus-slots` the moment it was added, because
  // that harness imports this file. The harness caught it; the point is
  // that a static import at the top of a widely-imported module is a
  // dependency every one of its readers inherits.
  const { storedDeltaShortfall } = await import("./feats-workflow.mjs");
  for (const actor of actors) {
    const shortfalls = storedDeltaShortfall(actor);
    if (!shortfalls.length) continue;
    const update = {};
    for (const row of shortfalls) {
      update[row.path] = row.recorded;
      report.push({ owner: actor.name, path: row.path, was: row.field, now: row.recorded });
    }
    try {
      await actor.update(update, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | Stored-delta repair failed for "${actor.name}"`, error);
    }
  }
  return report;
}

/**
 * Backfill `system.wealth` onto backgrounds and classes already on a
 * character (3.552.1).
 *
 * WHY A MIGRATION AND NOT A DERIVATION. The value could have been looked
 * up from the compendium every time the score was read, and that would
 * have been wrong in the one case that matters: a GM who edits a
 * background's wealth on a character, or a home-brew background with no
 * compendium twin, would have their answer overwritten on every prepare.
 * The item is the record. This pass makes existing items carry what the
 * table says, once, and then leaves them alone.
 *
 * MATCHED BY NAME, like the Stoneskin pass and for the same reasons: a
 * dragged copy keeps its own id and a hand-built one never had the
 * compendium's.
 *
 * ONLY EMPTY FIELDS ARE FILLED. An item that already carries a value —
 * including one a GM has house-ruled — is left exactly as it is, which
 * is what makes this safe to re-run.
 *
 * THE GAMBLER'S FORMULA IS ROLLED HERE TOO, once, and recorded, because
 * a background that arrives carrying "1d4-2" and no roll would otherwise
 * read as pending for ever: the roll normally happens in _preCreate, and
 * these items were created years of releases ago.
 *
 * @returns {Promise<Array<{actor: string, item: string, wealth: string, rolled: number|null}>>}
 */
export async function migrateStartingWealthValues(actors = []) {
  const report = [];

  const packFor = { background: "backgrounds", class: "classes" };
  const printed = { background: new Map(), class: new Map() };

  for (const [type, packId] of Object.entries(packFor)) {
    const pack = contentPack(packId);
    if (!pack) continue;
    try {
      const index = await pack.getIndex({ fields: ["system.wealth"] });
      for (const entry of index) {
        const value = String(entry.system?.wealth ?? "").trim();
        if (value) printed[type].set(String(entry.name).trim().toLowerCase(), value);
      }
    } catch (error) {
      console.error(`TRG Prime | starting-wealth migration could not read ${packId}`, error);
    }
  }

  for (const actor of actors) {
    const updates = [];
    for (const item of Array.from(actor.items ?? [])) {
      if (!["background", "class"].includes(item.type)) continue;
      if (String(item.system?.wealth ?? "").trim()) continue;

      const value = printed[item.type].get(String(item.name ?? "").trim().toLowerCase());
      if (!value) continue;

      const update = { _id: item.id, "system.wealth": value };
      let rolled = null;
      if (!Number.isFinite(Number(value))) {
        try {
          const roll = await new Roll(value).evaluate();
          rolled = Math.trunc(Number(roll.total) || 0);
          update[`flags.${SYSTEM_ID}.wealthRoll`] = rolled;
        } catch (error) {
          console.warn(`TRG Prime | could not roll "${value}" for ${actor.name}'s ${item.name}`, error);
        }
      }
      updates.push(update);
      report.push({ actor: actor.name, item: item.name, wealth: value, rolled });
    }
    if (!updates.length) continue;
    try {
      await actor.updateEmbeddedDocuments("Item", updates, { diff: false });
    } catch (error) {
      console.error(`TRG Prime | starting-wealth migration failed for "${actor.name}"`, error);
    }
  }

  return report;
}

/**
 * Clear the per-turn trait record and the attack counter left on actors
 * outside a running fight (3.622.1; the 3.622.0 drive's F4, Graham's R4).
 *
 * BASE ACTORS FIRST, then the unlinked tokens: once a base is clear, a
 * token's own deletion leaves nothing behind it. A creature in a combat that
 * has started is left alone — its records are this turn's, not stale ones.
 * Idempotent: a clear record costs no write. Returns the names cleared.
 */
export async function migrateStaleTurnRecords(actors = [], tokenActors = []) {
  const { attackCountIsClear, clearAttackCount, clearTraitUsageRecord, traitUsageIsClear } =
    await import("./combat/turn-records.mjs");
  const fighting = new Set();
  for (const combat of game.combats ?? []) {
    if (!combat?.started) continue;
    for (const combatant of combat.combatants ?? []) if (combatant?.actor) fighting.add(combatant.actor.uuid);
  }
  const cleared = [];
  for (const actor of [...actors, ...tokenActors]) {
    if (!actor || fighting.has(actor.uuid)) continue;
    const stale = !traitUsageIsClear(actor.getFlag?.(SYSTEM_ID, "traitUsage"))
      || !attackCountIsClear(actor.getFlag?.(SYSTEM_ID, "attackCount"));
    if (!stale) continue;
    try {
      await clearTraitUsageRecord(actor);
      await clearAttackCount(actor);
      cleared.push(actor.name);
    } catch (error) {
      console.error(`TRG Prime | stale turn records could not be cleared for "${actor.name}"`, error);
    }
  }
  return cleared;
}

/**
 * Reset the luck of every NPC, companion and familiar still holding the
 * player's starting 15 (3.624.0; block 40's R16: "Each player (not
 * character) begins … with a luck score of 15").
 *
 * Exactly 15 only: a score the GM changed is the GM's. Unlinked tokens
 * after their base actors, as the stale-records pass does. Idempotent: a 0
 * costs no write. Returns the names reset.
 */
async function migrateNpcLuck(actors = [], tokenActors = []) {
  const { luckOnCreate } = await import("./luck.mjs");
  const reset = [];
  for (const actor of [...actors, ...tokenActors]) {
    if (!actor) continue;
    const value = luckOnCreate(actor.type, actor._source?.system?.resources?.luck?.value ?? actor.system?.resources?.luck?.value);
    if (value === null) continue;
    try {
      await actor.update({ "system.resources.luck.value": value });
      reset.push(actor.name);
    } catch (error) {
      console.error(`TRG Prime | luck could not be reset for "${actor.name}"`, error);
    }
  }
  return reset;
}

/**
 * Apply the declared EFFECT_REPAIRS to owned copies (3.627.1).
 *
 * An NPC that took the Undead creature type before 3.627.1 holds a copy of
 * its immunities effect without disease. Old-value matched, field by field
 * (`effectRepairUpdate`), so a GM's own edit to that effect is kept and a
 * second run writes nothing. World items and unlinked tokens too.
 *
 * @returns {Promise<Array<{document: string, effect: string, fields: string[]}>>}
 */
async function migrateOwnedEffectRepairs(actors = [], tokenActors = [], worldItems = []) {
  const report = [];
  const lower = (v) => String(v ?? "").trim().toLowerCase();
  const fixItem = async (item, label) => {
    for (const repair of EFFECT_REPAIRS) {
      if (item?.type !== repair.itemType || lower(item?.name) !== lower(repair.name)) continue;
      const updates = [];
      for (const effect of item.effects ?? []) {
        const update = effectRepairUpdate(repair, effect._source ?? effect);
        if (!update) continue;
        updates.push({ _id: effect.id, ...update });
        report.push({ document: label, effect: effect.name, fields: Object.keys(update) });
      }
      if (!updates.length) continue;
      try {
        await item.updateEmbeddedDocuments("ActiveEffect", updates, { diff: false });
      } catch (err) {
        console.error(`${SYSTEM_ID} | could not repair ${repair.effect} on ${label}`, err);
      }
    }
  };
  for (const actor of [...actors, ...tokenActors]) {
    for (const item of actor?.items ?? []) await fixItem(item, `${actor.name} / ${item.name}`);
  }
  for (const item of worldItems) await fixItem(item, item.name);
  return report;
}
