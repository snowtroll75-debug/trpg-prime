/**
 * Using a consumable (Chapter 11, Consumable Items).
 *
 * "A consumable has a level equal to the PP of the spell it creates."
 * That sentence is the whole of a potion's mechanics: it IS a spell,
 * fixed at a PP, packaged so that using the item produces the spell.
 *
 * UNTIL 3.310.0 NOTHING IN THIS SYSTEM COULD USE ONE. The builder
 * (magic-item-builder-workflow) collected the spell, priced the item
 * from its PP — and then wrote the spell's name into a description
 * string and threw the reference away. Every shipped potion named its
 * spell only in prose. The Inventory row offered Equip, Edit and
 * Delete. Reported by Graham on 14 Aug 2026: "Potions and Scrolls have
 * no way to be used. I can build them on the sheet but cannot utilise
 * their effect in any way."
 *
 * So this file is the rule, and consumable-use-workflow.mjs is the
 * Foundry side. The split is the one every other pair here keeps: what
 * follows runs in plain node, takes plain values, and is what the
 * harness drives.
 *
 * THE SPELL REFERENCE lives at `flags.trg-prime.consumable.spell` and
 * is deliberately the SAME SHAPE as a charged item's
 * `flags.trg-prime.chargedItem.spells[]` entry — `{name, uuid, pp}` —
 * because they answer the same question ("which spell, at what cost")
 * and a second shape would be a second thing to keep in step.
 */

import { levelDC } from "./dice/resolution.mjs";
import { TRADITION_SKILLS, traditionsOf } from "./charged-items.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * WHICH KINDS NEED A CHECK TO USE.
 *
 * A potion was brewed to be drunk: "the effect is released by the act
 * of consuming it", so anybody can drink one and no check is rolled.
 * A scroll is written spellcraft — reading one back is the same
 * problem as releasing a spell from a wand, and takes the same ladder
 * of options (Spellcraft if the spell is of your tradition and within
 * your caster level, the tradition's own skill with Use Magic Device
 * otherwise). That ladder already exists as `castFromItemOptions` in
 * charged-items.mjs and is reused rather than restated (lesson 13).
 *
 * `unguent` and `other` follow the potion: they are the same column of
 * the consumable cost table and the chapter never separates them from
 * it for use.
 */
export const CONSUMABLE_USE_RULES = Object.freeze({
  // `drunk` (3.617.0, Graham's R1 of block 37): it reaches the drinker, or
  // the one creature it is fed to, whatever its spell's own targeting.
  potion: { verb: "Drink", needsCheck: false, past: "drunk", drunk: true },
  unguent: { verb: "Apply", needsCheck: false, past: "applied" },
  other: { verb: "Use", needsCheck: false, past: "used" },
  scroll: { verb: "Read", needsCheck: true, past: "read" }
});

/** The use rule for a consumable kind, defaulting to the potion's. */
export function consumableUseRule(kind) {
  const key = String(kind ?? "").trim().toLowerCase();
  return CONSUMABLE_USE_RULES[key] ?? CONSUMABLE_USE_RULES.other;
}

/**
 * The spell a consumable carries, or null.
 *
 * Tolerates the two shapes that exist in the wild: the flag written
 * from 3.310.0 on, and a bare string (a name) for anything hand-edited
 * before the item sheet grew a picker. A `pp` of 0 is real — a cantrip
 * potion is the first row of the cost table, not a free one — so it is
 * only the missing NAME/UUID that makes this null.
 */
export function consumableSpellRef(item) {
  const stored = item?.flags?.[SYSTEM_ID]?.consumable?.spell ?? null;
  if (!stored) return null;
  if (typeof stored === "string") {
    return stored.trim() ? { name: stored.trim(), uuid: "", pp: 0, warp: null } : null;
  }
  const name = String(stored.name ?? "").trim();
  const uuid = String(stored.uuid ?? "").trim();
  if (!name && !uuid) return null;
  return {
    name,
    uuid,
    pp: Math.max(0, Math.floor(Number(stored.pp) || 0)),
    warp: stored.warp ?? null
  };
}

/**
 * A consumable whose effect is its OWN, not a spell's.
 *
 * NOT EVERY POTION IS A SPELL IN A BOTTLE, and assuming so would have
 * left the most-used item in the pack inert. The five Potions of Cure
 * print their own healing — "Potion of Cure II. You are cured of 2d6+6
 * HP" — which is not what the Cure spell does at any warp; the Pearl of
 * Force throws its own 3d8 burst. So a consumable may carry structured
 * `effects` in exactly the shape a spell's `system.effects` takes,
 * resolved by the same `applySpellEffects` the spell path uses. One
 * resolver, two ways of saying what to resolve.
 *
 * @returns {{label:string, pp:number, effects:Array, duration:string}|null}
 */
export function consumableEffectRef(item) {
  const stored = item?.flags?.[SYSTEM_ID]?.consumable?.effect ?? null;
  // A CHOICE OF EFFECTS (3.626.0): `choose: [{ label, effects }]` — Pillars
  // of Faith's Vial of Sanctified Dew, "Choose one: reduce Soul Drain by 5;
  // reduce Dazed by 1; reduce Weakened by 1; or grant a +4-status bonus to
  // the next saving throw against possession". The rows chosen join the
  // fixed ones when the item is used.
  const choose = Array.isArray(stored?.choose)
    ? stored.choose.filter((c) => c && typeof c === "object" && Array.isArray(c.effects) && c.effects.length)
      .map((c) => ({ label: String(c.label ?? "").trim(), effects: c.effects }))
    : [];
  const fixed = Array.isArray(stored?.effects) ? stored.effects : [];
  if (!stored || (!fixed.length && !choose.length)) return null;
  return {
    label: String(stored.label ?? item?.name ?? "").trim(),
    pp: Math.max(0, Math.floor(Number(stored.pp) || 0)),
    effects: fixed,
    choose,
    duration: String(stored.duration ?? ""),
    // "The target must possess the Unliving trait" (Embalmer's Black Resin).
    requiresTrait: String(stored.requiresTrait ?? "").trim().toLowerCase()
  };
}

/** The effect's rows once a choice is made: the fixed rows plus the chosen set's. */
export function chosenConsumableEffects(effect, choiceIndex = -1) {
  const picked = Number.isInteger(choiceIndex) && choiceIndex >= 0 ? effect?.choose?.[choiceIndex] : null;
  return [...(effect?.effects ?? []), ...(picked?.effects ?? [])];
}

/** The reason a recipient is refused an effect that requires a trait, or "". */
export function consumableTraitRefusal(effect, recipientTraits = "", recipientName = "The target") {
  const want = String(effect?.requiresTrait ?? "").trim().toLowerCase();
  if (!want) return "";
  const have = String(recipientTraits ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  return have.includes(want) ? "" : `${recipientName} does not possess the ${want.charAt(0).toUpperCase() + want.slice(1)} trait — it has no effect.`;
}

/**
 * What happens when this is used.
 *
 *   "spell"       release the spell it carries
 *   "effect"      resolve its own printed effect
 *   "description" neither is recorded: post what it says and spend it
 *
 * The third is not a failure state. Six of the shipped consumables —
 * Assisting Gloves, the Combustion Unguent, the Mystical Bandage, the
 * Unguent of Sharpness and the rest — are activated items whose effect
 * is a paragraph for the GM to apply ("+1 item bonus to attack and
 * damage for 1 hour"). Reading that onto the table and counting the item
 * down is the whole of what a sheet can honestly do for them, and it is
 * strictly more than the nothing they did before.
 */
export function consumableMode(item) {
  if (consumableSpellRef(item)) return "spell";
  if (consumableEffectRef(item)) return "effect";
  return "description";
}

/** The kind ("potion", "scroll"...) recorded on a consumable. */
export function consumableKind(item) {
  return String(item?.flags?.[SYSTEM_ID]?.consumable?.kind ?? "").trim().toLowerCase();
}

/**
 * The DC of a skill, as a static number to be beaten: 10 + the skill's
 * total. The system has no named constant for this because nothing had
 * needed one — every skill DC until now was a level DC instead. Named
 * here so the untrained-scroll rule below has one place to point at.
 */
export const SKILL_DC_BASE = 10;

/**
 * How far short of a real casting the untrained reading falls.
 * Graham, 14 Aug 2026: "Tradition skill DC -2".
 */
export const UNTRAINED_SCROLL_DC_PENALTY = 2;

/**
 * The best tradition skill this reader can bring to this spell.
 *
 * "It is based on the tradition skill of the spell. If the spell has
 * more than one tradition, the character would use their highest skill.
 * So a Rogue with Nature +4 (DC 14) and Arcane +3 (DC 13) using a Scroll
 * of Burning Hands would use his Nature skill as it is higher" — Graham,
 * 14 Aug 2026.
 *
 * Note this reads skill TOTALS, not ranks. `castFromItemOptions` asks
 * about ranks because ranks are what gate the attempt ("your Nature ranks
 * are below the spell's 6 PP"); this asks about the total because the
 * total is the bonus, and the bonus is what the DC is built from. Two
 * different questions about the same skill, and conflating them would
 * give a trained-but-unskilled reader the same DC as a gifted one.
 *
 * @returns {{skill:string, tradition:string, total:number}|null}
 */
export function highestTraditionSkill({ spellTradition = "", skillTotals = {} } = {}) {
  let best = null;
  for (const tradition of traditionsOf(spellTradition)) {
    const skill = TRADITION_SKILLS[tradition] ?? "";
    if (!skill) continue;
    const total = Math.floor(Number(skillTotals?.[skill]) || 0);
    if (!best || total > best.total) best = { skill, tradition, total };
  }
  return best;
}

/**
 * The Save DC of a spell released from a consumable — or `null`, meaning
 * "nothing to override; let the ordinary formula stand".
 *
 * THIS REPLACED AN INFERENCE OF MINE THAT WAS WRONG IN BOTH DIRECTIONS.
 * Until 3.312.0 this was `10 + PP` for everything, reasoning that an item
 * has no caster so the ability term is absent. Graham, 14 Aug 2026, took
 * it apart from the other end:
 *
 *   "Okay, so a scroll would have a Save DC based upon the caster that is
 *   using it. A Potion only ever effects a willing target so why would it
 *   need a Save DC?"
 *
 * Both halves matter. A potion needs no DC at all — every one of the
 * eleven potions and two unguents that ship affects the drinker or the
 * user's own gear, and all six spell-mode potions point at spells with
 * `defence: ""`. And a scroll is not a bottle: somebody is reading it, so
 * the reading is what sets the DC.
 *
 * So the rule is four questions in order:
 *
 *   1. Does the spell declare a defence at all? If not there is no save,
 *      and no DC is needed. This is where every shipped potion lands, and
 *      it lands there because of what the spell says rather than because
 *      of a list of kinds that would have to be maintained.
 *   2. A scroll read by a caster: `null`. Not "compute their DC here" —
 *      the ordinary path in cast-workflow already computes exactly
 *      `10 + PP + casting ability`, so the correct implementation of "the
 *      caster that is using it" is to stop overriding it. Two statements
 *      of one rule mask each other (lesson 13); this is one.
 *   3. A scroll read by somebody with no casting ability of their own —
 *      the rogue with Use Magic Device: the DC of their best relevant
 *      tradition skill, less 2.
 *   4. Anything else that needs a DC and hasn't got one: the default
 *      level DC. Graham: "Any item that needs a DC and does not have one
 *      should use the default level DC (level +14) which is why that rule
 *      is there." This is what reaches the alchemical pack's poisons and
 *      bombs — and it reproduces their printed numbers exactly, which is
 *      the evidence the rule is right: Pearl of Force is item level 8 and
 *      prints "Basic Reflex DC 22". 8 + 14 = 22.
 *
 * @returns {{dc:number|null, source:string}}
 */
export function consumableSaveDC({
  kind = "",
  itemLevel = 0,
  spellDefence = "",
  isCaster = false,
  spellTradition = "",
  skillTotals = {}
} = {}) {
  if (!String(spellDefence ?? "").trim()) {
    return { dc: null, source: "no save — nothing resists this" };
  }
  const level = Math.max(0, Math.floor(Number(itemLevel) || 0));

  if (String(kind ?? "").trim().toLowerCase() === "scroll") {
    if (isCaster) return { dc: null, source: "the reader's own Save DC" };
    const best = highestTraditionSkill({ spellTradition, skillTotals });
    // No tradition skill to lean on at all: the reading brought nothing,
    // so the page's own level carries it — question 4, not a zero DC.
    if (best) {
      return {
        dc: SKILL_DC_BASE + best.total - UNTRAINED_SCROLL_DC_PENALTY,
        source: `${best.skill} DC ${SKILL_DC_BASE + best.total} less ${UNTRAINED_SCROLL_DC_PENALTY} — read, not cast`
      };
    }
  }

  return { dc: levelDC(level), source: `level ${level} DC — the item's own` };
}

/**
 * Spending one use of a consumable.
 *
 * TWO COUNTERS, AND THEY ARE NOT THE SAME QUESTION. `quantity` is how
 * many of the thing you have; `uses` is how much is left in the one you
 * opened. Almost every consumable in this pack is 1/1, where the
 * distinction never shows — but a two-dose unguent is a real item, and
 * decrementing the wrong counter there either doubles the item or
 * destroys it half-full.
 *
 * So: spend a use; when the last use of a unit goes, that unit is gone
 * and the next one is full; when the last unit goes, the item is
 * destroyed.
 *
 * @returns {{uses:number, quantity:number, destroy:boolean, spent:boolean}}
 */
export function consumeOneUse({ uses = null, max = 1, quantity = 1 } = {}) {
  const cap = Math.max(1, Math.floor(Number(max) || 1));
  const held = Math.max(0, Math.floor(Number(quantity) || 0));
  // AN UNINITIALISED `uses` MEANS A FRESH UNIT, NOT AN EMPTY ONE — the
  // same reading `itemUsesRemaining` takes for a feat that has never been
  // spent. `null` and `undefined` both arrive here (a hand-made item, an
  // import, a compendium entry written before the pair existed), and both
  // must land on `cap` rather than on 0: reading them as empty would
  // destroy a full bottle on its first use. Note the default is `null` and
  // not `1` — a default of 1 would silently swallow the `undefined` this
  // is written to catch, and a two-dose unguent would lose a dose.
  const parsed = Number(uses);
  const left = uses === null || uses === undefined || !Number.isFinite(parsed)
    ? cap
    : Math.max(0, Math.min(cap, Math.floor(parsed)));

  if (held <= 0) return { uses: left, quantity: 0, destroy: true, spent: false };

  if (left > 1) return { uses: left - 1, quantity: held, destroy: false, spent: true };

  // The unit is finished. One fewer of them, and the next is full.
  const remaining = held - 1;
  return {
    uses: remaining > 0 ? cap : 0,
    quantity: remaining,
    destroy: remaining <= 0,
    spent: true
  };
}

/**
 * Can this consumable be used at all?
 *
 * ONLY THE COUNT CAN REFUSE. A consumable with nothing recorded is not
 * unusable — it falls to the description path (see `consumableMode`) and
 * still gets read out and counted down. Refusing it would put the sheet
 * back where it started for six of the shipped items.
 *
 * @returns {{usable:boolean, reason:string}}
 */
export function consumableUsable(item) {
  const quantity = Math.max(0, Math.floor(Number(item?.system?.quantity ?? 0)));
  if (quantity <= 0) return { usable: false, reason: "none are left" };
  return { usable: true, reason: "" };
}

/**
 * A POTION REACHES ITS DRINKER (3.617.0, Graham's R1 of block 37: "the
 * drinker, or the one creature it is fed to (within reach, willing or
 * helpless); the feeder spends the AP — for area and touch spells too").
 *
 * The spell inside keeps its own effect and its own duration; what it loses
 * is its aim. A Potion of Invisibility drunk with nothing targeted used to
 * make nobody invisible and still be spent; a Potion of Cure could not be
 * poured into a dying ally; a Potion of Water Breathing asked the drinker to
 * place a five-foot area. So the spell is recast as "touch, 1 creature" —
 * the one creature being the drinker — and every area goes.
 *
 * A spell aimed at nobody (range self, no targets, no area) is left as it is:
 * it already lands on the one casting it, and the potion is cast by the
 * creature that drinks it.
 *
 * @param {object} system the spell's system data
 * @returns {object} the fields to overwrite
 */
export function drunkSpellTargeting(system = {}) {
  const range = String(system.range ?? "").trim();
  const targets = String(system.targets ?? "").trim();
  const area = String(system.area ?? "").trim();
  if (!targets && !area && (!range || /^self$/i.test(range))) return {};
  return { range: "touch", targets: "1 creature", area: "", areaTargeting: "all" };
}
