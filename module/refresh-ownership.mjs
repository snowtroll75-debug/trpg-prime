/**
 * WHO OWNS A FIELD — the rulebook, or this copy of the item?
 *
 * NEW at 3.406.1. Pure; no Foundry. Extracted from
 * `compendium-refresh.mjs`, which cannot be imported outside Foundry
 * because it touches the `foundry` global at load.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS MOVED, AND WHAT IT COST TO FIND OUT.
 *
 * `compendium-refresh.mjs` opens by naming its own hard part exactly:
 *
 *   "The hard part is not copying the numbers across. It is knowing which
 *    fields are the item's *statistics* (which the rulebook owns) and
 *    which are the *state of this particular copy* (which the player
 *    owns). Getting that wrong un-equips armour mid-combat, heals a
 *    shield that was nearly broken, or silently deletes an expert Mithril
 *    customisation."
 *
 * That list of hazards was written from experience and it was still one
 * short. `prepared` — which spells a caster has prepared TODAY — was not
 * in the preserved list, so a refresh proposed setting every prepared
 * spell in the world back to `false`, because the compendium's generic
 * copy of a spell is naturally unprepared.
 *
 * FOUND ON 25 AUGUST 2026 while live-testing 3.406.0, at the worst
 * possible moment to find it: the Stone Shield correction only reaches a
 * character who already owns the spell IF the GM runs Refresh Items, so
 * the fix for one defect was about to be delivered by the tool carrying
 * another. The refresh's preview showed both changes side by side —
 *
 *     effects   [{kind:"bonus"…}]  →  [{kind:"ward"…}]     ← the fix
 *     prepared  true               →  false                ← the damage
 *
 * A GM confirming that dialog gets a corrected spell and an un-prepared
 * spell list, and only notices the second one in the next fight.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE DECISION LIVES HERE NOW.
 *
 * The rule "which fields belong to the player" is pure — a list and a
 * leaf-name test, no documents, no globals — and it sat inside a module
 * no harness could import. That is the same shape that hid the light
 * level returning a bare number, the sheet deciding a glow independently
 * of the shedding rule, and the cone persisting onto a torch: a decision
 * made where nothing can call it.
 *
 * There was no harness for `compendium-refresh.mjs` at all, for a module
 * whose entire job is not to destroy player state. Now the decision is
 * importable, `verify-refresh-ownership` checks it, and
 * `mutate-refresh-ownership` proves those checks can fail.
 */

/**
 * Leaf field names that belong to THIS COPY of an item rather than to the
 * item as the rulebook defines it. A refresh never overwrites one.
 *
 * `hp.value` and `uses.value` are deliberately absent: they are handled
 * by the consumed-pair rule, where the MAXIMUM belongs to the rulebook
 * and the amount already spent belongs to the player.
 */
export const PRESERVED_FIELDS = Object.freeze([
  // Physical state
  "equipped",
  "invested",
  "quantity",
  // Derived, not stored. Comparing prepared data rather than stored data
  // put this in the diff, and copying a compendium item's total weight
  // over a stack of 19 arrows would have reported the weight of 20.
  "totalWeight",
  // Customisation choices — these drive the modifiers, and re-deriving
  // them from the compendium would wipe every expert Mithril breastplate
  // in the world back to standard steel.
  "quality",
  "material",
  "superiorTraits",
  // Per-encounter and per-turn combat state
  "attackedThisTurn",
  "loaded",
  "reloadProgress",
  "usedQuickLoadThisRound",
  // Expended uses. Feats and abilities spell this flat; gear and
  // consumables use a uses: {value, max} pair, whose current value is
  // handled by the consumed-pair rule rather than here — the leaf name
  // "value" is far too common to blanket-preserve.
  "usesValue",
  "bonusUses",

  // ─── SPELL PREPARATION (3.406.1) ────────────────────────────────────
  // WHICH SPELLS ARE PREPARED TODAY is the most player-owned fact on a
  // spell there is: it is chosen at dawn, it changes daily, and the
  // compendium cannot possibly know it — every pack spell is `prepared:
  // false`, so refreshing this field does not copy information across,
  // it only ever destroys some. See the header for how this was found.
  "prepared",
  // INNATE is the same shape one step further out. A spell is innate to
  // THIS creature — a dragon's breath, a monster's spell-like — never to
  // the rulebook's generic entry, which is always false. Preserving it
  // costs nothing (there is no true value in any pack to propagate) and
  // stops a refresh quietly turning a monster's spell-likes into spells
  // it has to prepare.
  "innate"
]);

/**
 * Does this leaf field belong to the player's copy?
 *
 * @param {string} leaf the last segment of a dotted path
 * @returns {boolean} true when a refresh must leave it alone
 */
export function fieldIsPlayerOwned(leaf) {
  return PRESERVED_FIELDS.includes(String(leaf ?? ""));
}

/**
 * The last segment of a dotted path.
 *
 * `system.uses.value` → `value`. Kept beside the list it feeds so the
 * two cannot drift: a preserved name written as a full path would match
 * nothing, silently, which is the failure this whole file guards.
 */
export function leafName(path) {
  const text = String(path ?? "");
  const cut = text.lastIndexOf(".");
  return cut === -1 ? text : text.slice(cut + 1);
}

/**
 * Would a refresh overwrite a player-owned field on this path?
 *
 * @param {string} path a dotted path within `system`
 */
export function pathIsPlayerOwned(path) {
  return fieldIsPlayerOwned(leafName(path));
}

/**
 * Carry a spent amount across a change of maximum: what was used stays
 * used, and an item whose maximum was never initialised comes back full.
 *
 * MOVED HERE UNCHANGED at 3.406.1 so the whole ownership rule — the
 * fields the player keeps AND the amounts they have already spent — is
 * answerable in one importable place.
 *
 * The rule is that the amount SPENT survives, not the amount remaining:
 * copying the remaining value across a raised maximum silently refills a
 * half-used set of healer's tools, which is exactly what the first live
 * run of this migration proposed to do.
 */
export function preserveSpent(oldValue, oldMax, newMax) {
  const max = Math.max(0, Number(newMax) || 0);
  const previousMax = Math.max(0, Number(oldMax) || 0);
  if (previousMax <= 0) return max;
  const spent = Math.max(0, previousMax - (Number(oldValue) || 0));
  return Math.min(max, Math.max(0, max - spent));
}
