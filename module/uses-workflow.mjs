import { usesMax, focusDefaultUses } from "./uses.mjs";
import { extraUsesBonus } from "./extra-uses.mjs";
import { focusExtraUses, dailyFocusFlagClears } from "./focus-declarations.mjs";
import { DAILY_FIRSTS_FLAG } from "./daily-firsts.mjs";
import { declarationCarriers } from "./declaration-carriers.mjs";
import { WILD_SHAPE_ABILITY, usesPoolNameFor } from "./magic/wildshape-feats.mjs";
import { hasClassAbility } from "./crusader.mjs";
import { releaseDailyPrepAndSustained } from "./magic/active-spells.mjs";
import { memorisationContext, promptDailyMemorisationChange } from "./magic/memorisation-workflow.mjs";
import {
  archetypeCastingContext,
  archetypeDailyPreparationLines
} from "./magic/archetype-casting-workflow.mjs";
import { featSlotContext } from "./magic/feat-casting-workflow.mjs";
import { featSlotPreparationLines } from "./magic/feat-casting.mjs";
import { deletionValue } from "./deletion.mjs";

const SYSTEM_ID = "trg-prime";


function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/** The actor's six ability totals, keyed for resolveUsesPerDay/usesMax. */
function attributeTotals(actor) {
  // OPTIONAL, because `itemUsesMax` is asked about items that are not on an
  // actor at all — a compendium entry, an item built in memory, anything a
  // harness drives. Every other read on this path already tolerated that
  // (`featNamesOf`, `owner.actor?.system`); this one threw, which made the
  // whole function undriveable and would have crashed on a loose item.
  const attributes = actor?.system?.attributes ?? {};
  return Object.fromEntries(
    Object.entries(attributes).map(([key, entry]) => [key, entry?.total ?? 0])
  );
}

/** Every feat name on this actor, duplicates included. */
function featNamesOf(actor) {
  return Array.from(actor?.items ?? [])
    .filter((i) => i.type === "feat")
    .map((i) => i.name);
}

/**
 * The item whose daily counter governs this one.
 *
 * SHARED POOLS ARE A POINTER (3.351.0). Graham's ruling on the four Wild
 * Shape form feats is that they spend the Druid's existing allowance
 * rather than each granting one of their own — *"use your Wild Shape
 * ability to take the form of…"*. So Shape Of The Humanoid and its three
 * siblings own no counter at all: they read and spend Shape Of The
 * Animal's.
 *
 * Returns the item itself whenever it owns its own count, which is every
 * item in the system bar those four — so every caller can ask
 * unconditionally and none of them needs to know a pool exists.
 *
 * @param {object} item
 * @returns {object} the pool owner, or `item`
 */
export function usesPoolItem(item) {
  const poolName = usesPoolNameFor(item?.name);
  if (!poolName) return item;
  const wanted = String(poolName).trim().toLowerCase();
  const owner = Array.from(item?.actor?.items ?? []).find(
    (i) => String(i.name).trim().toLowerCase() === wanted
  );
  // NO OWNER MEANS NO POOL. A Druid who has Plant Shape but has never
  // pressed Wild Shape has no Shape Of The Animal to spend from; falling
  // back to the item itself makes that an untracked spell rather than a
  // crash, and the feat's own button says what to press.
  return owner ?? item;
}

/**
 * The daily maximum for a feat/ability item, or null if it doesn't track
 * uses at all (an empty Uses Per Day field).
 *
 * THE ONLY PLACE THAT ANSWERS THIS. The daily-preparation top-up loop
 * below used to recompute the same sum inline, which meant Extra
 * Channels could raise the sheet's number and not the number a night's
 * rest restored to. See extra-uses.mjs.
 */
export function itemUsesMax(item) {
  const owner = usesPoolItem(item);
  if (!owner?.system || !Object.hasOwn(owner.system, "usesPerDay")) return null;
  const bonus = Number(owner.system.bonusUses ?? 0)
    + extraUsesBonus(featNamesOf(owner.actor), owner.name)
    // DECLARED EXTRA FOCUS USES (3.664.0; Inner Tempest's Deep Focus and
    // Ghost Art Mastery): derived here from the carriers, never written onto
    // the item, so losing the feature takes the use with it.
    + focusExtraUses(owner, owner.actor ? declarationCarriers(owner.actor) : []);
  // A granted Focus innate spell with no printed count is one use (3.562.0),
  // and so is a Focus feat or ability (3.665.0, D1).
  const focusDefault = focusDefaultUses(owner.system, owner.type);
  if (focusDefault !== null) return focusDefault + Math.max(0, Math.floor(bonus));
  return usesMax(
    owner.system.usesPerDay,
    attributeTotals(owner.actor),
    bonus,
    owner.actor?.system?.identity?.level ?? null
  );
}

/**
 * Which item to write, and what value, when one innate use is spent.
 *
 * EXTRACTED SO IT CAN BE DRIVEN (3.351.0). These four lines lived inside
 * `castSpell`, a function no harness can call without most of Foundry —
 * so a mutation that spent the FORM SPELL's own untouched field instead
 * of the pool's survived every check written about it. Nothing was
 * wrong with the code; everything was wrong with only being able to read
 * it. The Druid would have had four shapeshifts of every form, and every
 * card would have counted down honestly from its own private four.
 *
 * @param {object} item     the spell being cast
 * @param {number} stored   the spell's own recorded value (may be NaN)
 * @param {number} max      the daily maximum already resolved
 * @returns {{item: object, value: number, shared: boolean}}
 */
export function innateSpendUpdate(item, stored, max) {
  const owner = usesPoolItem(item);
  const shared = owner !== item;
  // THE OWNER'S VALUE, NOT THE MEMBER'S. A member's `usesValue` is never
  // written and sits at whatever it was created with, so reading it here
  // is what turns a shared pool back into four private ones.
  const current = shared ? owner?.system?.usesValue : stored;
  const from = Number.isFinite(current) ? current : max;
  return { item: owner, value: Math.max(0, from - 1), shared };
}

/**
 * What a night's rest restores every tracked item to.
 *
 * EXTRACTED SO IT CAN BE DRIVEN (3.351.0). This was an inline loop
 * inside `dailyPreparation`, which cannot be called without most of
 * Foundry — so the only thing a harness could do was assert that the
 * source CONTAINED a call to `itemUsesMax`. That is a tautological
 * catch: it proves the text was not edited, not that the number agrees
 * with the one the sheet shows. The instrument that measures driven vs
 * structural catches (tools/verify-driven-coverage.mjs) flagged exactly
 * that, and this is the fix it prescribes — pull the decidable part into
 * something importable and call it.
 *
 * ASKS `itemUsesMax`, never its own arithmetic. A bonus the sheet knows
 * about and this loop does not means the sheet says 7 and a night's rest
 * sets it to 5, with nothing anywhere to say so.
 *
 * @param {Iterable} items
 * @returns {Array<object>} embedded-document updates, possibly empty
 */
export function dailyUsesRestoreUpdates(items) {
  const updates = [];
  for (const item of items ?? []) {
    if (!Object.hasOwn(item.system ?? {}, "usesPerDay")) continue;
    // A POOL MEMBER OWNS NOTHING TO RESTORE. Shape Of The Humanoid reads
    // Shape Of The Animal's count; writing that number onto its own
    // `usesValue` too would create the second copy the pool exists to
    // prevent — and the morning after a Druid spent three of four
    // shapeshifts, the member's stale copy would be the one a later
    // reader believed.
    if (usesPoolItem(item) !== item) continue;
    const max = itemUsesMax(item);
    if (max === null || max === Infinity) continue;
    if (item.system.usesValue !== max) {
      updates.push({ _id: item.id, "system.usesValue": max });
    }
  }
  return updates;
}

/**
 * Recompute Shape Of The Animal's `usesPerDay` from the level table, the
 * Wildform rune and Extra Wildshape.
 *
 * Only touches a Druid who actually has the Wild Shape ability and the
 * spell configured as innate by its button — a Shape Of The Animal cast
 * from a scroll, or memorised the ordinary way, is nobody's daily
 * allowance and is left exactly as it is.
 *
 * @returns {number|null} the new count, or null if there was nothing to do.
 */
export async function trueUpWildShapeUses(actor) {
  // THIS WAS `hasClassAbility` OPEN-CODED — the same items scan, the same
  // normalisation, against a hand-written "wild shape". Found at 3.384.0
  // while chasing the constant, not by the triage that went looking for
  // duplications: the triage grepped for the literal `"Wild Shape"` and
  // this copy was lowercased, so it matched nothing and was never
  // counted. A search for a name only finds the spellings you thought of.
  if (!hasClassAbility(actor, WILD_SHAPE_ABILITY)) return null;
  const spell = Array.from(actor.items ?? []).find(
    (i) => i.type === "spell" && String(i.name).trim().toLowerCase() === "shape of the animal"
  );
  if (!spell?.system?.innate) return null;

  const { wildShapeDailyUses } = await import("./druid.mjs");
  const { wildformWildshapeBonus } = await import("./codex-runes.mjs");
  const items = Array.from(actor.items ?? []);
  const uses = wildShapeDailyUses({
    level: Number(actor.system?.identity?.level ?? 0),
    featNames: items.filter((i) => i.type === "feat").map((i) => i.name),
    runeUses: wildformWildshapeBonus(items, { hasWildshape: true })
  });
  if (String(spell.system.usesPerDay ?? "") !== String(uses)) {
    await spell.update({ "system.usesPerDay": String(uses) });
  }
  return uses;
}

/** Current uses remaining, treating an uninitialised item as freshly full. */
export function itemUsesRemaining(item) {
  const max = itemUsesMax(item);
  if (max === null) return null;
  if (max === Infinity) return Infinity;
  // READ FROM THE POOL OWNER, like the maximum above. A member reading
  // the maximum from one item and the spent count from another would
  // report a full allowance to a Druid who had spent it all.
  const stored = usesPoolItem(item)?.system?.usesValue;
  return Number.isFinite(stored) ? Math.max(0, Math.min(max, stored)) : max;
}

/** Spend one use of a tracked feat/ability, refusing if none remain. */
export async function useItemCharge(actor, item) {
  const max = itemUsesMax(item);
  if (max === null) {
    return postCard(actor, item.name, [line(item.system.description || "Used.")]);
  }

  if (max === Infinity) {
    return postCard(actor, item.name, [
      line("Unlimited uses per day."),
      ...(item.system.description ? [line(item.system.description)] : [])
    ]);
  }

  const remaining = itemUsesRemaining(item);
  if (remaining <= 0) {
    ui.notifications.warn(`${item.name}: no uses remain today.`);
    return null;
  }

  await item.update({ "system.usesValue": remaining - 1 });
  return postCard(actor, item.name, [
    line(`${remaining - 1} of ${max} uses remaining today.`),
    ...(item.system.description ? [line(item.system.description)] : [])
  ]);
}

/**
 * Daily Preparation: reset every tracked feat/ability on the actor to its
 * daily maximum, release the day's spell locks, true up companions and
 * familiars, and recharge invested charged items.
 *
 * Charged-item PP was on this comment's deferred list until 3.235.5 —
 * the rule needed content to act on, and once the rods, staves and wands
 * existed the recharge was wired here.
 */
export async function performDailyPreparation(actor) {
  /*
   * THE PAGE'S OWN PRECONDITION (3.582.0; the pages 221-230 audit's D9,
   * Graham's R13 of 22 September 2026): "To use daily preparation you
   * must have fully rested (typically 8 hours)."
   *
   * Nothing asked, so this button refilled every per-day resource on
   * demand, as often as it was pressed. The rest now stamps its own
   * length (`rest-workflow.mjs`), and "typically 8" is asked of
   * `fullRestHours`, which already knows which races and effects shorten
   * a night.
   *
   * REFUSED, NOT WARNED. A preparation that half-happens is worse than
   * one that did not: the loop below restores dozens of resources, and a
   * partial run would leave a sheet nobody can reason about.
   */
  // Lines the gate wants on the card, collected before the preparation
  // runs and printed with the rest of its report at the end.
  const preparationNotes = [];
  {
    const { dailyPreparationAllowed } = await import("./rest/daily-preparation-gate.mjs");
    const { fullRestHours } = await import("./rest/recovery.mjs");
    const lastRest = actor.getFlag?.(SYSTEM_ID, "lastRest") ?? null;
    /*
     * `?? null`, NOT `?? 0`. This read `Number(lastRest?.hours ?? 0)`,
     * which turned "this character has never rested through the rest
     * workflow" into "this character rested for zero hours" — and locked
     * every character that existed before 3.582.0 out of daily
     * preparation on the morning that release landed. Reported from a
     * live table on 24 September 2026. See the gate's own header.
     */
    const gate = dailyPreparationAllowed({
      hoursRested: lastRest?.hours ?? null,
      requiredHours: fullRestHours(actor)
    });
    if (!gate.allowed) {
      return postCard(actor, "Daily Preparation", [
        line(
          `<strong>${actor.name} has not fully rested.</strong> Daily preparation needs `
          + `${gate.requiredHours} hours; the last rest was ${Number(lastRest?.hours ?? 0)}`
          + `${gate.short ? ` — ${gate.short} short` : ""}. Page 229.`
        )
      ]);
    }
    /*
     * AND AN UNRECORDED REST SAYS SO RATHER THAN PASSING IN SILENCE.
     * A gate that quietly lets everything through is how this one came
     * to be needed; the preparation goes ahead, and the card says which
     * rule did not get to run.
     */
    if (gate.unrecorded) {
      preparationNotes.push(
        `<em>No rest has been recorded for ${actor.name} yet, so page 229's `
        + `${gate.requiredHours}-hour precondition could not be checked — preparing anyway. `
        + `It applies normally from the next rest taken through the Rest action.</em>`
      );
    }
  }

  // Book of Notations (Bard, 1st): "cast it as a Specialist Spell UNTIL
  // THE FOLLOWING DAY" — this pick genuinely IS swept unconditionally
  // every day (unlike learned-caster memorisation below, which no longer
  // is), so yesterday's pick doesn't silently survive into a day the
  // player never re-chose it for. The reminder to re-pick is printed
  // below, alongside Hunter's Method's and Blade Ally's own daily-prep
  // notes.
  /*
   * THE TIME EACH TRADITION PAYS (3.583.0; page 235, Graham's R12).
   *
   * Thirty minutes with a Spell Library, an hour of prayer, an hour of
   * communion — and, for a learned caster who does not pay it, cantrips
   * only today. That consequence used to be a printed line reading
   * "Reminder (GM judgement, not tracked)", beside four other lines this
   * card had already automated.
   *
   * ASKED, NOT ASSUMED. Whether the hour was available is a fact about
   * the fiction — a party woken by an ambush did not get it — and only
   * the table knows. What the system can do is charge the consequence
   * once the answer is given, which is the half that was missing.
   */
  const { dailyStudyRequired, dailyStudyLine } = await import("./magic/daily-study.mjs");
  const studyRequired = dailyStudyRequired({
    tradition: actor.system?.magic?.tradition ?? "",
    style: memorisationContext(actor)?.style ?? ""
  });
  let studied = true;
  if (studyRequired.owed) {
    studied = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Daily Preparation — Study" },
      content: `<p>Did ${actor.name} spend <strong>${studyRequired.minutes} minutes ${studyRequired.doing}</strong>?</p>`
        + '<p class="hint">Page 235. Answering No limits them to cantrips today.</p>',
      rejectClose: false
    }) ?? false;
  }
  await actor.setFlag(SYSTEM_ID, "dailyStudy", {
    studied, at: Number(globalThis.game?.time?.worldTime ?? 0), minutes: studyRequired.minutes
  });
  const studyLine = dailyStudyLine(studyRequired, studied);

  const bookOfNotationsSwept = Array.from(actor.items ?? []).filter(
    (i) => i.type === "spell" && Boolean(i.flags?.[SYSTEM_ID]?.bookOfNotationsPick)
  );
  // A BORROWED SPELL IS DELETED, NOT UNFLAGGED (3.326.0). The second half of
  // the rule — "or any one ethereal spell that you have a scroll for" — has
  // no item on the sheet to flag, so the pick CREATES one. Unflagging that
  // copy the next morning would leave the Bard permanently holding a spell
  // they only borrowed for a day, and it would accumulate one per scroll per
  // day. A repertoire pick is the opposite: the spell is genuinely theirs and
  // only the flag is the day's business.
  const borrowed = bookOfNotationsSwept.filter(
    (i) => Boolean(i.flags?.[SYSTEM_ID]?.bookOfNotationsScroll)
  );
  const owned = bookOfNotationsSwept.filter(
    (i) => !i.flags?.[SYSTEM_ID]?.bookOfNotationsScroll
  );
  if (owned.length) {
    await actor.updateEmbeddedDocuments("Item", owned.map((i) => ({
      _id: i.id,
      [`flags.${SYSTEM_ID}.bookOfNotationsPick`]: deletionValue()
    })));
  }
  if (borrowed.length) {
    await actor.deleteEmbeddedDocuments("Item", borrowed.map((i) => i.id));
  }

  // WILD SHAPE'S COUNT TRUES UP BEFORE THE LOOP READS IT (3.351.0).
  //
  // The Druid's daily uses live on the Shape Of The Animal SPELL's own
  // `usesPerDay`, written there by the Wild Shape button — so until now
  // the only thing that refreshed it was pressing that button again,
  // and the hint said so out loud ("re-use this button after
  // levelling"). Extra Wildshape would have inherited that wart: take
  // the feat, and nothing changes until you remember to re-press an
  // unrelated ability.
  //
  // A stamp everyone must remember is a stamp somebody will forget —
  // the same lesson as `system.prepared`. Daily preparation recomputes
  // it from `wildShapeDailyUses`, which is the same function the button
  // calls, so there is still exactly one answer; then the generic loop
  // below restores the value to it.
  await trueUpWildShapeUses(actor);

  // Refocus (Chapter 6): "cannot use it again until your next daily
  // preparation" — this is that moment, so every block lifts and every
  // pending restore is dropped. Cleared BEFORE the loop below sets each
  // ability back to its maximum, so a `restoreAt` left over from last night
  // cannot come due later and hand out a use on top of a full pool.
  // Dynamic import: refocus-workflow reads this module's use maths, so a
  // static import here would close the cycle.
  const { clearRefocusState } = await import("./combat/refocus-workflow.mjs");
  await clearRefocusState(actor);

  const updates = dailyUsesRestoreUpdates(actor.items);

  // RUNE AND WONDROUS FOCUS RETURN TOO (3.664.0). "Daily preparation
  // restores all expended Focus abilities" — but a Focus rune or wondrous
  // item records its expended state as a flag, not a use count, and only
  // Refocus ever cleared it. Lifted here with the rest.
  const focusFlagUpdates = dailyFocusFlagClears(actor.items);
  if (focusFlagUpdates.length) await actor.updateEmbeddedDocuments("Item", focusFlagUpdates);
  // A NEW DAY'S FIRSTS (3.664.0): Centred Recovery's first Refocus and
  // first Power Recovery come round again. See daily-firsts.mjs.
  if (actor.getFlag?.("trg-prime", DAILY_FIRSTS_FLAG)) await actor.unsetFlag("trg-prime", DAILY_FIRSTS_FLAG);

  if (updates.length) {
    await actor.updateEmbeddedDocuments("Item", updates);
  }

  // Chapter 9: daily preparation releases "until daily preparations" PP locks
  // and ends any sustained spell (a fresh day breaks concentration).
  const releasedSpells = await releaseDailyPrepAndSustained(actor);

  // Chapter 5: daily-preparation feat choices (Ageless Knowledge and kin)
  // expire now, and level-scaled grants (Aura of Power) true up. Dynamic
  // import avoids a static cycle (feats-workflow needs nothing from here).
  const { sweepFeatDailyPrep } = await import("./feats-workflow.mjs");
  const featLines = await sweepFeatDailyPrep(actor);
  // ALIGNED CONTROL'S CRITICAL ENDS HERE (3.632.0): "cannot be controlled by
  // this creature again until after their next daily preparation".
  if (actor.getFlag?.(SYSTEM_ID, "alignedControlImmune")) await actor.unsetFlag(SYSTEM_ID, "alignedControlImmune");

  // "An animal companion has a level equal to your level." The
  // updateActor hook (scripts/trg-prime.mjs) pushes this the moment the
  // master's level moves; this is the catch-up for what that hook cannot
  // see — a level changed while nobody who owns the companion was logged
  // in, a world edited by a script or a module, or a companion created
  // before 3.233.3 wired the hook at all. Costs one array scan a day,
  // and makes "press Daily Preparation" the answer to any companion that
  // has somehow drifted.
  const { syncCompanionLevels } = await import("./companion-workflow.mjs");
  featLines.push(...await syncCompanionLevels(actor));

  // The familiar's equivalent, and its catch-up for the same cases —
  // plus one the companion does not have: a familiar created before its
  // master had a flag, whose scan here repairs the gate the hook relies
  // on.
  const { syncFamiliars } = await import("./familiar-workflow.mjs");
  featLines.push(...await syncFamiliars(actor));

  // Chapter 11: "during daily preparation, an invested, charged item
  // will regain 1 PP for every 10 PP (or part thereof) it has at maximum
  // charge each day." This was on the deferred list above until 3.235.4
  // built the rods, staves and wands — and then stayed deferred for a
  // release because the arithmetic shipped with nobody calling it.
  // RECHARGE ITEM'S LOCKOUT CLEARS FIRST (Chapter 4, page 91): "the
  // charged item becomes temporarily immune until your next daily
  // preparation", and "you may only make one successful recharge check
  // per item per day".
  //
  // CLEARED BEFORE the natural recharge below, not after, so that the
  // card reads in the order the morning happens. The 24-hour block a
  // Fumble applies is NOT cleared here — it is a timestamp and expires
  // on its own; see the comment on it in charged-items-workflow.mjs.
  const rechargeLocked = Array.from(actor.items ?? []).filter(
    (i) => i.flags?.[SYSTEM_ID]?.rechargeImmuneUntilPrep
  );
  if (rechargeLocked.length) {
    await actor.updateEmbeddedDocuments("Item", rechargeLocked.map((i) => ({
      _id: i.id,
      [`flags.${SYSTEM_ID}.rechargeImmuneUntilPrep`]: deletionValue()
    })));
    featLines.push(
      `${rechargeLocked.map((i) => i.name).join(", ")} may be recharged again with Recharge Item.`
    );
  }

  const { rechargeChargedItems } = await import("./charged-items-workflow.mjs");
  featLines.push(...await rechargeChargedItems(actor));

  // Chapter 11: the activated runes with a per-day limit — Animated is
  // 3/day at tier I — are ready again. Unlimited ones never counted, so
  // they have nothing to restore.
  const { resetRuneUses } = await import("./rune-actions-workflow.mjs");
  featLines.push(...await resetRuneUses(actor));

  // Hunter's Method (Ranger, Chapter 3): "You select your Hunter's
  // Method during daily preparation." The choice PERSISTS rather than
  // expiring — clearing it every morning would nag a Ranger who is
  // happy with their method — so daily preparation is where the current
  // selection is surfaced, with the change routed through the ability's
  // own Use button.
  const methodItem = Array.from(actor.items ?? []).find(
    (i) => i.type === "ability" && String(i.name).trim().toLowerCase() === "hunter's method"
  );
  if (methodItem) {
    const { HUNTER_METHODS, selectedHunterMethod } = await import("./ranger.mjs");
    const key = selectedHunterMethod(actor);
    const label = HUNTER_METHODS.find((m) => m.key === key)?.label ?? null;
    featLines.push(
      label
        ? `<strong>Hunter's Method:</strong> ${label} stays selected — press Use on Hunter's Method to change it for the day.`
        : `<strong>Hunter's Method:</strong> none selected — press Use on Hunter's Method to choose one for the day.`
    );
  }

  // Divine Ally (Crusader, 4th) — Blade Ally only: "Select one weapon
  // when you make your daily preparations." The ALLY is permanent once
  // chosen, but which weapon carries it is a fresh pick every day —
  // same surface-don't-reprompt shape as Hunter's Method just above,
  // with the change routed through Divine Ally's own Use button rather
  // than asked here.
  const allyItem = Array.from(actor.items ?? []).find(
    (i) => i.type === "ability" && String(i.name).trim().toLowerCase() === "divine ally"
  );
  if (allyItem) {
    const { divineAllyChoice } = await import("./crusader.mjs");
    if (divineAllyChoice(actor) === "Blade Ally") {
      // THE IMBUEMENT LAPSES WITH THE DAY (3.330.0). Since the rune is
      // now written onto the weapon's own `runes` field rather than only
      // recorded in a flag, leaving it there would make a daily choice
      // permanent — every weapon the Crusader ever imbued would keep its
      // divine rune, and by 10th level the character would be carrying an
      // armoury of them. `releaseBladeAlly` restores the field the weapon
      // had before the ally landed, and the line below asks for today's
      // pick rather than reporting yesterday's as current.
      const blade = allyItem.flags?.[SYSTEM_ID]?.bladeAlly;
      const { releaseBladeAlly } = await import("./feats-workflow.mjs");
      const released = await releaseBladeAlly(actor, allyItem);
      featLines.push(
        blade?.weaponName
          ? `<strong>Blade Ally:</strong> yesterday's imbuement of ${blade.weaponName} (${blade.rune}) has lapsed${released ? " and the rune has left the weapon" : ""} — press Use on Divine Ally to imbue today's weapon.`
          : `<strong>Blade Ally:</strong> no weapon imbued yet today — press Use on Divine Ally to choose one.`
      );
    }
  }

  // Book of Notations (Bard, 1st): swept above; reminded here in the
  // same "press Use to choose" shape as Hunter's Method and Blade Ally,
  // rather than re-picking automatically — the printed rule frames it as
  // something the player DOES during preparation, not a default the
  // engine should guess at.
  const notationsItem = Array.from(actor.items ?? []).find(
    (i) => i.type === "ability" && String(i.name).trim().toLowerCase() === "book of notations"
  );
  if (notationsItem) {
    const { bookOfNotationsSlots } = await import("./bard.mjs");
    const slots = bookOfNotationsSlots(actor.system?.identity?.level ?? 0);
    featLines.push(
      `<strong>Book of Notations:</strong> press Use to choose today's ${slots} repertoire spell${slots === 1 ? "" : "s"} to cast as Specialist Spells.`
    );
  }

  // Arcane Bond (Wizard, 1st): "designate a single item you own as your
  // bonded item" during daily preparation. The choice PERSISTS rather
  // than expiring — the same surface-don't-reprompt shape Hunter's
  // Method, Blade Ally and Book of Notations above all use, with the
  // change routed through Arcane Bond's own Use button.
  // SPELL ADDERS REFRESH WITH THE DAY (3.332.0) — "cast any one spell
  // from your repertoire EACH DAY with no power point cost". The counter
  // is cleared rather than set to a max, because the rating is derived
  // from whatever the character is currently carrying and can change
  // between one day and the next.
  {
    const { SPELL_ADDER_USED_FLAG, spellAdderSources, withWondrousAdders } =
      await import("./magic/spell-adder.mjs");
    const { wondrousBonusesForActor } = await import("./wondrous-effects.mjs");
    const spent = Number(actor.getFlag?.(SYSTEM_ID, SPELL_ADDER_USED_FLAG)) || 0;
    const rated = withWondrousAdders(
      spellAdderSources(actor),
      wondrousBonusesForActor(Array.from(actor.items ?? []), {
        className: Array.from(actor.items ?? []).find((i) => i.type === "class")?.name ?? "",
        tradition: actor.system?.magic?.tradition ?? ""
      }).spellAdders ?? []
    );
    if (spent) await actor.unsetFlag(SYSTEM_ID, SPELL_ADDER_USED_FLAG);
    // SPONTANEOUS SCHOLAR (3.382.0) is "per day" and resets on the same
    // boundary, for the same reason: a counter that never clears is a
    // feat that works once per campaign.
    if (Number(actor.getFlag?.(SYSTEM_ID, "spontaneousScholarUsed")) || 0) {
      await actor.unsetFlag(SYSTEM_ID, "spontaneousScholarUsed");
    }
    /*
     * AND WHICH RELIEF SPELLS THIS CREATURE HAS HAD (3.517.0).
     * Restoration: "a creature may only benefit from one restoration
     * spell each day", and Graham ruled on 7 September 2026 that it is
     * tracked on the BENEFICIARY. So it clears when THEY prepare rather
     * than when the caster does — a cleric who rests while the patient
     * does not has not renewed the patient's day.
     *
     * Same boundary and same reason as the two above: a record that never
     * clears is a rule that applies once per campaign.
     */
    if (actor.getFlag?.(SYSTEM_ID, "reliefUsedToday")) {
      await actor.unsetFlag(SYSTEM_ID, "reliefUsedToday");
    }
    // A DECLARED ONCE-A-DAY (3.627.0) — Gaseous Escape's death guard, Drink
    // Blood's and the like — renews on the same boundary.
    if (actor.getFlag?.(SYSTEM_ID, "declaredUsedToday")) {
      await actor.unsetFlag(SYSTEM_ID, "declaredUsedToday");
    }
    // A WONDROUS ITEM'S 1/DAY USE (3.617.0, C8 of block 37) — the Gloves of
    // Vitality's heal — renews on the same boundary.
    {
      const { WONDROUS_USED_FLAG } = await import("./wondrous-use.mjs");
      // AND A REGISTERED RUNE'S (3.626.0) — Last Vigil, Intercession, a
      // consumable talisman's reroll — on the same boundary.
      const { RUNE_USED_TODAY_FLAG } = await import("./rune-declarations.mjs");
      for (const owned of Array.from(actor.items ?? [])) {
        if (owned.getFlag?.(SYSTEM_ID, WONDROUS_USED_FLAG)) await owned.unsetFlag(SYSTEM_ID, WONDROUS_USED_FLAG);
        if (owned.getFlag?.(SYSTEM_ID, RUNE_USED_TODAY_FLAG)) await owned.unsetFlag(SYSTEM_ID, RUNE_USED_TODAY_FLAG);
      }
    }
    if (rated.total > 0) {
      featLines.push(
        `<strong>Spell Adder:</strong> ${rated.total} free cast${rated.total === 1 ? "" : "s"} today `
        + `(${rated.sources.map((x) => `${x.label} +${x.value}`).join(", ")}) — offered when you cast.`
      );
    }
  }

  const arcaneBondItem = Array.from(actor.items ?? []).find(
    (i) => i.type === "ability" && String(i.name).trim().toLowerCase() === "arcane bond"
  );
  if (arcaneBondItem) {
    const bond = arcaneBondItem.flags?.[SYSTEM_ID]?.arcaneBond;
    featLines.push(
      bond?.itemName
        ? `<strong>Arcane Bond:</strong> ${bond.itemName} stays your bonded item (+${bond.bonus} Spell Adder) — press Use on Arcane Bond to change it for the day.`
        : `<strong>Arcane Bond:</strong> no item bonded yet — press Use on Arcane Bond to choose one for the day.`
    );
  }

  // Wizard School — Alteration's Enhancement and Warding's Resistance are
  // the school's own daily-changeable choices ("you may change this
  // during your daily preparation"); surfaced the same way, routed
  // through the school item's own Use button (TYPE_AUTOMATION
  // "wizard-school", feats-workflow.mjs).
  const alterationItem = Array.from(actor.items ?? []).find(
    (i) => i.type === "wizard-school" && String(i.name).trim().toLowerCase() === "alteration"
  );
  if (alterationItem) {
    const choice = alterationItem.flags?.[SYSTEM_ID]?.alterationChoice;
    const labels = { strength: "Strength", constitution: "Constitution", dexterity: "Dexterity" };
    featLines.push(
      choice
        ? `<strong>Enhancement:</strong> +1-status to ${labels[choice] ?? choice} stays selected — press Use on Alteration to change it for the day.`
        : `<strong>Enhancement:</strong> no ability score selected yet — press Use on Alteration to choose one for the day.`
    );
  }
  const wardingItem = Array.from(actor.items ?? []).find(
    (i) => i.type === "wizard-school" && String(i.name).trim().toLowerCase() === "warding"
  );
  if (wardingItem) {
    const choice = wardingItem.flags?.[SYSTEM_ID]?.wardingChoice;
    const labels = { acid: "Acid", cold: "Cold", electricity: "Electricity", fire: "Fire", sonic: "Sonic" };
    featLines.push(
      choice
        ? `<strong>Resistance:</strong> ${labels[choice] ?? choice} stays selected — press Use on Warding to change it for the day.`
        : `<strong>Resistance:</strong> no energy type selected yet — press Use on Warding to choose one for the day.`
    );
  }

  // Chapter 9 (3.230.6): memorised spells now PERSIST from day to day —
  // ask whether the player wants to change today's picks, rather than
  // silently forcing a reset the way this used to (Graham: "I would
  // rather this not happen... provide a prompt asking the character if
  // they wish to change any of their memorised spells... rather than a
  // full reset every day"). `promptDailyMemorisationChange` returns null
  // outright for a non-learned-caster class — nothing is asked or said.
  const memorisationChange = await promptDailyMemorisationChange(actor);
  const memorisation = memorisationChange ? memorisationContext(actor) : null;

  /*
   * THE 24-HOUR SPELLS, ENDED. Read from each effect's own recorded
   * duration rather than from what is left of it: the rule is about how
   * long the spell WAS, so an hour-long spell cast five minutes ago ends
   * too. An effect with no duration recorded is a permanent one and is
   * left alone — see `spellEndsAtPreparation`.
   */
  const endedSpells = [];
  const { spellEndsAtPreparation, endedSpellsLine } = await import("./rest/daily-preparation-gate.mjs");
  for (const effect of Array.from(actor.effects ?? [])) {
    if (!spellEndsAtPreparation(effect, SYSTEM_ID)) continue;
    endedSpells.push(effect.name);
    await effect.delete();
  }
  const endedSpellsSaid = endedSpellsLine(endedSpells);

  await postCard(actor, "Daily Preparation", [
    ...preparationNotes.map((text) => line(text)),
    line(
      updates.length
        ? `<strong>${updates.length}</strong> feat/ability use${updates.length === 1 ? "" : "s"} reset to full.`
        : "No tracked uses needed resetting."
    ),
    ...(releasedSpells.length
      ? [line(`<strong>${releasedSpells.length}</strong> active spell${releasedSpells.length === 1 ? "" : "s"} ended, releasing locked PP: ${releasedSpells.map((e) => e.name).join(", ")}.`)]
      : []),
    ...featLines.map((text) => line(text)),
    ...(memorisation
      ? [
          line(
            memorisationChange.changed
              ? `<strong>Memorisation:</strong> updated — ${memorisation.leveledPicked} of ${memorisation.leveledAllowed} leveled spell${memorisation.leveledAllowed === 1 ? "" : "s"} and ${memorisation.cantripsPicked} of ${memorisation.cantripsAllowed} cantrip${memorisation.cantripsAllowed === 1 ? "" : "s"} memorised.`
              : `<strong>Memorisation:</strong> kept as-is — ${memorisation.leveledPicked} of ${memorisation.leveledAllowed} leveled spell${memorisation.leveledAllowed === 1 ? "" : "s"} and ${memorisation.cantripsPicked} of ${memorisation.cantripsAllowed} cantrip${memorisation.cantripsAllowed === 1 ? "" : "s"} memorised. Use the Magic tab's own buttons any time you want to change them.`
          ),
          line(studyLine)
        ]
      : []),
    // THE CASTER ARCHETYPES report here too, because "each day during
    // your daily preparation" is where their sentence points. REPORTED,
    // NOT IMPOSED: this card stopped wiping the class's memorised spells
    // at Graham's request, and making a player re-enter the same two
    // verdant cantrips every session would be that same chore under a
    // different name. The Magic tab's Clear Prepared button is how a
    // change is made, and this line says so.
    ...archetypeDailyPreparationLines(archetypeCastingContext(actor)).map((text) => line(text)),
    // …and the levelled slots beside them, for the same reason.
    ...featSlotPreparationLines(featSlotContext(actor)).map((text) => line(text)),
    // Charged-item PP used to be on this list. It is automated now
    // (rechargeChargedItems, above), and a card that recharges a staff
    // two lines earlier and then tells you to do it by hand is worse
    // than one that never mentioned it.
    // "SPELLS WITH A DURATION OF 24 HOURS OR LESS END" (page 229). Done
    // rather than reminded about, which is what the four lines above it
    // had already earned.
    line(endedSpellsSaid)
  ]);
  // A NEW DAY, FOR A MODULE (3.666.0): anything a module bars "until your
  // next daily preparation" (Inner Tempest's Elemental Ward on a Fumble)
  // lifts here. Fired after the card, once the day has fully turned over.
  Hooks.callAll("trgPrimeDailyPreparation", { actor });
}
