/**
 * Which sheet slots an Active Effect is currently writing.
 *
 * The sheet renders DERIVED values into editable inputs. That is fine
 * for a slot nobody but the player writes, and quietly corrosive for one
 * an effect writes: Foundry shows `base + effect` in the box, the box is
 * named, so any sheet submit posts that combined number back into the
 * stored data — and the effect then adds its share on top of the new,
 * larger stored value. Save again and it grows again. Nothing warns,
 * because nothing is wrong from the form's point of view; the number in
 * the box is exactly the number that was submitted.
 *
 * It was survivable while the only offenders were a handful of feats a
 * character might never take. A race is different: every character has
 * one, permanently, from level 1, and the Dwarf writes five attribute
 * slots at once. So the slots an effect owns are now locked — rendered
 * disabled, which is what actually keeps them out of the submitted form
 * data (readonly would still post the value) — and labelled with what
 * owns them.
 *
 * A locked slot is not a lost slot: the Universal Modifier reaches every
 * one of these targets and is the supported way to adjust them, which
 * has the side benefit that a GM's adjustment is then a visible, named,
 * removable thing rather than an anonymous number typed into a box.
 *
 * CUSTOM-mode changes are deliberately NOT locked. They never touch a
 * slot at all — they go straight into the typed bonus pool — so the box
 * still holds only what a person put there and remains safe to edit.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE LOCK STOPPED WORKING FOR SPEEDS AT 3.412.0, AND NOBODY NOTICED
 * BECAUSE IT FAILS BY DOING NOTHING.
 *
 * This module locks by EXACT PATH: a change's `key` is matched against
 * an input's `name`. Pooling the speeds renamed those inputs from
 * `system.combat.movement.land` to `system.combat.movement.land.base`,
 * while every race, companion, familiar and speed feat goes on writing
 * the node — twenty-eight changes across four packs. The two strings
 * stopped being equal, the lock quietly matched nothing, and the field
 * went back to being editable and holding the derived value.
 *
 * PROVEN LIVE on 26 August 2026 (Borin Slatevein, world trg-v14): stored
 * base 30, Dwarf override to 20, box showing 20 — then one sheet submit
 * that changed nothing, and the stored base went 30 → 20. Silent, and
 * invisible afterwards, because the override makes the derived answer 20
 * either way. It is the exact corrosion described at the top of this
 * file, reintroduced by a rename, against the very slot these comments
 * use as their worked example.
 *
 * So a change now governs every INPUT PATH it controls rather than one
 * literal string, and `SPEED_KEYS` is imported rather than respelt so
 * this file cannot disagree with the rest of the system about what a
 * speed is. That disagreement is the whole 3.412.x episode.
 */

import { SPEED_KEYS } from "./combat/speed-pool.mjs";

/** The pooled node paths whose editable box is one level deeper. */
const POOLED_NODE_PATHS = Object.freeze(
  SPEED_KEYS.map((key) => `system.combat.movement.${key}`)
);

/**
 * Every sheet input one change key governs.
 *
 * A change to a POOLED node governs the `.base` box, because that is the
 * box the form posts and the one the effect's value lands on top of.
 * BOTH SPELLINGS ARE RETURNED: pack data written before 3.412.0 names
 * the node, anything written after may name `.base`, and an owned copy
 * on a character can be either until a Refresh Items — so matching one
 * and not the other is precisely how this broke.
 *
 * @param {string} key a change's target path
 * @returns {string[]} the input names it locks
 */
export function lockedInputPaths(key) {
  const path = String(key ?? "").trim();
  if (!path) return [];
  if (POOLED_NODE_PATHS.includes(path)) return [`${path}.base`, path];
  const node = path.replace(/\.base$/, "");
  if (path !== node && POOLED_NODE_PATHS.includes(node)) return [path, node];
  return [path];
}

/**
 * The stored value sitting under a locked slot, for its tooltip.
 *
 * A pooled speed's stored value is the POOL, and showing a player an
 * object is worse than showing nothing. Reads `.base` — the number the
 * box would have held.
 */
export function storedSlotValue(stored, key) {
  const read = (dotted) => String(dotted ?? "").split(".")
    .reduce((o, k) => (o == null ? undefined : o[k]), stored);
  const direct = read(key);
  if (direct !== null && typeof direct === "object") return Number(direct.base ?? 0) || 0;
  return direct;
}

/**
 * Foundry 14's string `type` on a live change, mapped back to the legacy
 * numeric `ACTIVE_EFFECT_MODES` this module's own contract still speaks
 * (see actorEffectChanges below for why that contract wasn't rewired
 * wholesale). An unrecognised or missing type falls back to 0 (CUSTOM) —
 * the safer default, since a CUSTOM-mode change is excluded from locking
 * rather than wrongly locking a slot nobody actually claimed.
 */
const CHANGE_TYPE_TO_MODE = Object.freeze({
  custom: 0,
  multiply: 1,
  add: 2,
  downgrade: 3,
  upgrade: 4,
  override: 5
});

/**
 * Every slot an effect writes, keyed by the full change path.
 *
 * @param {Array<{key: string, mode: number}>} changes Flattened from
 *   every transferred effect, each tagged with its effect's name.
 * @param {number} customMode The legacy CUSTOM mode number (0) — a plain
 *   literal at the call site now, not CONST.ACTIVE_EFFECT_MODES.CUSTOM;
 *   Foundry 14 deprecated accessing that enum at all. Still injected
 *   rather than hard-coded here, so this module stays free of the
 *   Foundry globals and can be checked without a browser.
 * @returns {Object<string, {sources: string[]}>}
 */
export function lockedSlotsFromChanges(changes = [], customMode = 0) {
  const locked = {};
  for (const change of changes) {
    const key = String(change?.key ?? "").trim();
    if (!key) continue;
    // Pool-only changes write nothing a form could post back.
    if (Number(change?.mode) === customMode) continue;
    // String fields (resistances, immunities, traits) are appended to,
    // not summed, and re-submitting the joined string is idempotent —
    // so they carry none of the doubling risk and stay editable.
    if (/\.(resistances|immunities|weaknesses|traits)$/.test(key)) continue;

    const source = String(change?.sourceName ?? "").trim() || "an effect";
    locked[key] ??= { sources: [], additive: false, overridden: false };
    if (!locked[key].sources.includes(source)) locked[key].sources.push(source);
    // ADD, MULTIPLY, UPGRADE and DOWNGRADE all build ON the stored value,
    // so a value hiding underneath is still being counted. OVERRIDE
    // replaces it outright, so a stored value beneath one is inert, and
    // warning about it would simply be untrue — every race sets its land
    // speed by override on top of the template's stored 30.
    //
    // An override WINS this question outright, whatever else writes the
    // key. A Dwarf's speed override plus Swift Stride's +5 is 20 then
    // +5; the stored 30 is discarded either way, so a single ADD must
    // not be able to flip the key back to "additive" and resurrect the
    // false warning.
    if (Number(change?.mode) === 5) locked[key].overridden = true;
    else locked[key].additive = true;
  }
  for (const entry of Object.values(locked)) {
    if (entry.overridden) entry.additive = false;
    delete entry.overridden;
  }
  return locked;
}

/**
 * Collects the changes of every transferred effect on an actor.
 *
 * Always read through `appliedEffects` first: V12+ keeps a transferred
 * effect on the ITEM, not the actor, so `actor.effects` alone misses
 * everything a race, feat or ability delivers — the exact mistake that
 * cost a release during the archetype batch.
 */
export function actorEffectChanges(actor) {
  const effects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);
  const changes = [];
  for (const effect of effects) {
    if (effect?.disabled) continue;
    for (const change of effect?.changes ?? []) {
      // Read each field EXPLICITLY. This looked like a job for
      // `{...change}` and isn't: in Foundry V14 a change's own keys are
      // key/type/value/phase/priority/effect, and `mode` is a
      // COMPATIBILITY GETTER on the prototype, mapping the new
      // type/phase model back onto the legacy numeric mode. A spread
      // copies own enumerable properties only, so `mode` came out
      // undefined — silently, with `key` and `value` present and correct
      // either side of it.
      //
      // The damage was subtle enough to survive the harness, which feeds
      // plain objects: `Number(undefined) === CUSTOM` is false, so
      // CUSTOM-mode pool changes stopped being exempt from locking, and
      // `mode !== 5` was true for everything, so every override was
      // treated as additive and told the player a stored value was
      // "also being counted" when an override had replaced it. Found in
      // live testing on Graham's world at 3.193.0.
      //
      // That `mode` getter is now ITSELF deprecated — reading it warns.
      // `type` (the string it used to be derived from) is read instead
      // and translated back to the legacy number here, at this one spot,
      // rather than rewiring lockedSlotsFromChanges to a string contract:
      // that function and its numeric `mode` are exercised by a couple
      // of dozen assertions across the races and backgrounds harnesses
      // already, and every one of them keeps working unchanged.
      changes.push({
        key: change.key,
        mode: CHANGE_TYPE_TO_MODE[change.type] ?? 0,
        value: change.value,
        priority: change.priority,
        // The ITEM's name where the effect is transferred from one, so
        // the override tooltip says "change it on the Gnome item" rather
        // than naming the effect ("Gnome: size and speed"), which is not
        // a thing the player can go and find.
        //
        // Guarded on the parent actually being an Item: an effect the
        // system creates on the actor (Rage, Aim, Exhaustion, a spell
        // effect, a Universal Modifier adjustment) has the ACTOR as its
        // parent, and taking that name would label every such lock with
        // the character's own name.
        sourceName:
          effect.parent?.documentName === "Item" ? effect.parent.name : effect.name
      });
    }
  }
  return changes;
}

/**
 * The tooltip for a locked slot, including the warning case.
 *
 * If a stored value survives underneath the lock, it was almost
 * certainly baked in by a sheet save before the slot was locked, and it
 * is still being counted. Saying so is the whole point: the failure this
 * module exists to prevent is a silent one, and a lock that hid its own
 * history would just be a quieter version of the same problem.
 *
 * @param {string[]} sources Names of the effects writing this slot.
 * @param {number} stored The value in the actor's _source for this slot.
 * @returns {string}
 */
export function lockedSlotTooltip(sources = [], stored = 0, additive = true) {
  const names = sources.length ? sources.join(", ") : "an effect";
  if (!additive) {
    // An override OWNS the field: the Universal Modifier writes the
    // stored value, which the override then replaces on the next
    // preparation, so pointing a GM at it would send them somewhere
    // that cannot work. Say what actually changes it instead.
    return `Set by ${names}, which replaces this field entirely. Change it on the ${names} item itself, or remove that item.`;
  }
  const base = `Set by ${names}. Locked so a sheet save can't double-count it — use the Universal Modifier to adjust.`;
  const value = Number(stored) || 0;
  if (!value) return base;
  return `${base} NOTE: a stored ${value > 0 ? "+" : ""}${value} is also being counted here from before this slot was locked; a GM can clear it with the Universal Modifier.`;
}
