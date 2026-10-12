/**
 * SPELL-GRANTED RUNES, THE FOUNDRY HALF (3.523.0).
 *
 * The rules live in `spell-rune.mjs` and are pure. This file does the two
 * things that need a world: ask which item, and take the rune back.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE HOOK, NOT THREE CALL SITES.
 *
 * A spell ends by more routes than it looks: the world clock, combat
 * rounds, the End Spell button, a sustained spell lapsing, Daily
 * Preparation, and a GM deleting the effect off the Effects tab by hand.
 * `removeSpellItemsByCastId` is called from three of those and its own
 * header records that the list "had been wrong for twenty releases" —
 * a comment naming its callers went stale the moment somebody added one.
 *
 * So the restore hangs off `deleteActiveEffect`, which fires for EVERY
 * route an effect can leave an actor. That is the arrangement
 * `registerTemporaryConvictionCleanup` and `registerGrantedItemCleanup`
 * already use, and it is chosen here for their reason rather than a new
 * one: the rule is stated once and cannot be missed by a route nobody
 * thought of.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LOAN IS RECORDED ON THE ITEM AND ON THE EFFECT, and both are load
 * bearing:
 *
 *   the ITEM carries `previousRunes` so the restore is a write-back and
 *   never a subtraction — a rune the player etched WHILE the spell ran
 *   survives, and ours cannot strip theirs;
 *
 *   the EFFECT carries the item's id and the cast's id, so the hook can
 *   find the item from the effect that is being deleted, and so a second
 *   cast onto the same item cannot make the first one's expiry write back
 *   a field that already contains the second one's rune.
 */

const SYSTEM_ID = "trg-prime";

import {
  eligibleRuneItems, spellPotencyTier, spellRuneField, spellRuneOutcome,
  spellRuneLine, runeLoanChangesItem, restoredRuneField, loanBelongsTo,
  itemPotencyCeiling, runeKindOf, landedTier, ceilingLine,
  SPELL_POTENCY_BASE
} from "./spell-rune.mjs";
import { createEffectsOn, relaySpellRune } from "../combat/target-relay-workflow.mjs";
import { shouldHandleAsGM } from "../combat/target-relay.mjs";

const LOAN_FLAG = "spellRuneLoan";

/**
 * Ask which item the rune lands on.
 *
 * A SINGLE CANDIDATE IS STILL ASKED ABOUT. It would be tempting to skip
 * the dialog when a character owns exactly one weapon, and Blade Ally
 * does not skip it either: the question is also the player's last chance
 * to cancel a cast that is about to spend PP on the wrong thing.
 */
async function chooseItem(title, label, options) {
  const { DialogV2 } = foundry.applications.api;
  const rows = options.map(([id, name]) =>
    `<option value="${id}">${foundry.utils.escapeHTML(name)}</option>`).join("");
  return DialogV2.prompt({
    window: { title },
    content: `<p>${foundry.utils.escapeHTML(label)}</p>`
      + `<select name="choice" style="width:100%">${rows}</select>`,
    ok: {
      label: "Choose",
      callback: (_event, button) => button.form.elements.choice.value
    },
    rejectClose: false
  }).catch(() => null);
}

/**
 * Land a `runeGrant` effect row on one target.
 *
 * @param {Actor} target the creature whose item is being imbued
 * @param {object} spec the normalised effect row
 * @param {object} context `{spellName, castId, warpMods, durationFlags}`
 * @returns {Promise<{line: string, itemId: string}|null>}
 */
export async function applyRuneGrant(target, spec, context = {}) {
  const { spellName = "The spell", castId = null, warpMods = {}, durationFlags = {} } = context;
  const kinds = Array.isArray(spec?.itemKinds) ? spec.itemKinds : [];
  // WHAT THE TARGET LINE NAMES BEYOND A KIND (3.576.0): Shillelagh's
  // "1 club or staff you hold" is declared on its row as `itemNames` and
  // `heldOnly`, rather than recognised by the spell's name here.
  const names = Array.isArray(spec?.itemNames) ? spec.itemNames : [];
  const heldOnly = spec?.heldOnly === true;
  const candidates = eligibleRuneItems(
    Array.from(target?.items ?? []), kinds, Boolean(spec?.unarmedOnly), { names, heldOnly }
  );

  if (!candidates.length) {
    // SAID PLAINLY AND NAMING WHAT WAS LOOKED FOR. "Magic Vestment finds
    // nothing to imbue" leaves a player guessing whether the spell is
    // broken or their cleric is unarmoured.
    const named = names.length ? `${names.join(" or ").toLowerCase()}${heldOnly ? " held in hand" : ""}` : "";
    const wanted = spec?.unarmedOnly ? "unarmed attack" : named || kinds.join(" or ");
    return { line: `<strong>${target?.name ?? "The target"}</strong> carries no `
      + `${wanted} for <strong>${spellName}</strong> to imbue.`, itemId: "" };
  }

  const chosenId = candidates.length === 1
    ? candidates[0].id
    : await chooseItem(spellName, "Item to imbue", candidates.map((i) => [i.id, i.name]));
  if (!chosenId) return null;
  const item = candidates.find((i) => i.id === chosenId);
  if (!item) return null;

  const bought = spellPotencyTier(warpMods, warpMods?.potencyMax ?? null,
    Number(spec?.tier) || SPELL_POTENCY_BASE);

  // THE ITEM HAS THE LAST WORD (Graham's ruling, 8 Sep 2026). The warp is
  // bought before the item is chosen, so a player can pay for three steps
  // and hand them to a standard axe that takes one. 3.523.0 wrote the
  // bought tier regardless; the rune chapter then read it down to I and
  // flagged the weapon as carrying an invalid configuration. Clamped here,
  // and the shortfall is said out loud below.
  const ceiling = itemPotencyCeiling(runeKindOf(item), item.system?.quality);
  const tier = landedTier(bought, ceiling);

  const previousRunes = String(item.system?.runes ?? "");
  const outcome = spellRuneOutcome(previousRunes, tier);
  const shortfall = ceilingLine(item.name, item.system?.quality, bought, ceiling);
  const withShortfall = (line) => (shortfall ? `${line} ${shortfall}` : line);

  // A CAST THAT CHANGES NOTHING RECORDS NOTHING. Writing a loan for a
  // sword that already carries a better rune would leave the expiry with
  // a `previousRunes` to write back — harmless today, and exactly the
  // shape that becomes a bug the moment the player etches a rune while
  // the spell is running.
  if (!runeLoanChangesItem(previousRunes, tier)) {
    return { line: withShortfall(spellRuneLine(item.name, outcome)), itemId: "" };
  }

  // THROUGH THE GM WHEN THIS CLIENT MAY NOT WRITE (3.525.0).
  //
  // FOUND LIVE testing as a player rather than as the GM. Magic Weapon
  // says the weapon may be "wielded by you or a willing ally", and a
  // player casting it on an ally's sword hit "User PC Tester lacks
  // permission to update Item". The throw aborted the effects loop, so
  // the Cast card posted, 8 PP was spent, and no result card appeared at
  // all. A GM cannot see this defect, because a GM can write to anything.
  //
  // AND THE FAILURE IS SAID OUT LOUD rather than swallowed — a spell that
  // charges for a rune it could not apply must not also be silent about
  // it. `relaySpellRune` reports whether the write landed.
  const update = {
    "system.runes": spellRuneField(previousRunes, tier),
    [`flags.${SYSTEM_ID}.${LOAN_FLAG}`]: { castId, previousRunes, tier }
  };
  const written = await relaySpellRune(target, item.id, update, () => item.update(update));
  if (!written.ok) {
    return {
      line: `<strong>${spellName}</strong> could not imbue <strong>${item.name}</strong>`
        + `${written.reason ? ` — ${written.reason}` : ""}. `
        + "<em>The rune was not applied.</em>",
      itemId: ""
    };
  }

  const flags = { [SYSTEM_ID]: { spellBuff: true, [LOAN_FLAG]: { itemId: item.id, castId, tier } } };
  if (castId) flags[SYSTEM_ID].castId = castId;
  Object.assign(flags[SYSTEM_ID], durationFlags ?? {});

  await createEffectsOn(target, [{
    name: `${spellName} — ${outcome.outcome === "raised" ? "Potency Raised" : "Potency Rune"}`,
    img: "icons/magic/symbols/rune-sigil-rough-white.webp",
    changes: [],
    flags
  }]);

  return { line: withShortfall(spellRuneLine(item.name, outcome)), itemId: item.id };
}

/**
 * Give the rune back, by every route the spell can end.
 *
 * THE WRITE-BACK IS GUARDED BY THE CAST ID, not merely by the flag's
 * presence. Cast Magic Weapon on a sword, then cast it again before the
 * first expires: the second store captured a field that already held the
 * first spell's rune. When the FIRST one expires it must not write that
 * back — doing so would leave a Potency rune on the sword permanently,
 * which is the failure Wild Morph had with its claws.
 */
export function registerSpellRuneCleanup() {
  Hooks.on("deleteActiveEffect", (effect) => {
    try {
      const record = effect?.getFlag?.(SYSTEM_ID, LOAN_FLAG);
      if (!record?.itemId) return;
      const actor = effect.parent;
      const item = actor?.items?.get?.(record.itemId);
      if (!item) return;
      const loan = item.getFlag?.(SYSTEM_ID, LOAN_FLAG);
      // A LOAN THAT BELONGS TO A LATER CAST IS LEFT ALONE — the later
      // cast's own effect will restore it when that one ends.
      if (!loanBelongsTo(loan, record.castId)) return;
      // ONE CLIENT WRITES (3.525.0). This hook fires on EVERY connected
      // client, so before this the player's client and the GM's client
      // both attempted the restore: the owner's succeeded and every other
      // one threw a permission error into the console. It happened to
      // work whenever an owner was online, which is exactly the kind of
      // accident that stops working at the worst moment.
      //
      // The rule is `shouldHandleAsGM`'s, for its reason: with two GMs
      // connected, "am I able to?" would write twice. A client that
      // cannot write defers to the designated GM rather than trying and
      // failing.
      const activeGM = game.users?.activeGM ?? null;
      const mine = activeGM ? shouldHandleAsGM(game.user, activeGM) : item.isOwner;
      if (!mine) return;
      item.update({
        "system.runes": restoredRuneField(loan.previousRunes),
        [`flags.${SYSTEM_ID}.-=${LOAN_FLAG}`]: null
      }).catch((error) =>
        console.error("TRG Prime | A spell-granted rune could not be taken back", error));
    } catch (error) {
      console.error("TRG Prime | Spell rune cleanup failed", error);
    }
  });
}
