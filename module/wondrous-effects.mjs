/**
 * Wondrous items, wired (Chapter 11).
 *
 * Shaped deliberately like `rune-effects.mjs`, because the question is
 * the same one: this item is on the character — what does it change?
 * Returning `{bonuses, summary, reported, hp, problems}` lets the actor
 * pool the bonuses and the sheet print the rest, the same division the
 * runes already use.
 *
 * INVESTED, NOT EQUIPPED. Every wondrous item in the chapter carries the
 * Invested trait and says "when you invest" — so the gate is investment,
 * not the equipped flag a weapon uses. A wondrous item sitting in your
 * pack, or worn but not invested, contributes nothing.
 */

import { WONDROUS_ABILITIES } from "./wondrous-data.mjs";
import { drMultiplier } from "./combat/damage.mjs";

const SYSTEM_ID = "trg-prime";

/** The authored abilities of one item, or an empty list. */
export function wondrousAbilitiesOf(item) {
  const wondrous = item?.flags?.[SYSTEM_ID]?.wondrous;
  if (!wondrous) return [];
  // A BUILT ITEM CARRIES ITS OWN ABILITIES. The shipped twenty-seven are
  // keyed by name in wondrous-data.mjs, which cannot work for something
  // a player invented five minutes ago — and an item that did nothing
  // would be the exact state this whole feature exists to end. The flag
  // wins where there is one; the table is the fallback.
  if (Array.isArray(wondrous.abilities) && wondrous.abilities.length) return wondrous.abilities;
  return WONDROUS_ABILITIES[item.name] ?? [];
}

/** Is this a wondrous item the system has abilities for? */
export function isWondrous(item) {
  return Boolean(item?.flags?.[SYSTEM_ID]?.wondrous);
}

/**
 * Does this character meet an ability's own restriction?
 *
 * Faith's Eye works for "any cleric or crusader"; a Wizardry Ring's
 * Arcana bonus applies "if the wearer is an arcane spell caster". Both
 * are printed conditions on the ability rather than on the item, so they
 * are checked per ability — the ring is still a Spell Adder for anyone.
 */
export function abilityApplies(ability, { className = "", tradition = "", traits = "", featNames = [] } = {}) {
  if (ability?.requiresClass?.length) {
    const have = String(className ?? "").trim().toLowerCase();
    if (!ability.requiresClass.includes(have)) return false;
  }
  if (ability?.requiresArcaneCaster) {
    if (!/\barcane\b/i.test(String(tradition ?? ""))) return false;
  }
  // A CREATURE TRAIT OR A FEAT (3.626.0): "Requirement You possess the
  // Unliving trait" (Shroud of Borrowed Warmth); "Requirements You possess
  // Recite from the Text" (the Concordance's Perfect Reference).
  if (ability?.requiresTrait) {
    const want = String(ability.requiresTrait).trim().toLowerCase();
    const have = String(traits ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean);
    if (!have.includes(want)) return false;
  }
  if (ability?.requiresFeat) {
    const want = String(ability.requiresFeat).trim().toLowerCase();
    if (!(featNames ?? []).some((n) => String(n).trim().toLowerCase() === want)) return false;
  }
  return true;
}

/**
 * What one wondrous item contributes.
 *
 * @param {Item} item
 * @param {{className?: string, tradition?: string}} [context]
 * @returns {{bonuses: Array<{target: string, entry: object}>,
 *   hp: number, summary: string[], reported: string[], spells: object[],
 *   problems: string[]}}
 */
export function wondrousBonusesFor(item, context = {}) {
  const out = {
    bonuses: [], hp: 0, summary: [], reported: [], spells: [], problems: [],
    spellAdders: [], baseDR: []
  };
  const abilities = wondrousAbilitiesOf(item);
  if (!abilities.length) {
    // A wondrous item with no authored abilities is a gap worth saying
    // out loud rather than an item that quietly does nothing — which is
    // precisely the state every one of them was in before 3.247.0.
    if (isWondrous(item)) {
      out.problems.push(`${item.name}: no abilities are recorded for this item yet.`);
    }
    return out;
  }

  for (const ability of abilities) {
    // SPELL ADDERS ARE NOW RATED, not merely reported (3.332.0). Every
    // carrier of this ability printed a note and did nothing; the
    // mechanic is defined in the familiars pack ("a +1 Spell Adder
    // allowing you to cast any one spell from your repertoire each day
    // with no power point cost") and now lives in magic/spell-adder.mjs.
    // The note is still pushed, because the sheet's item card is where a
    // player reads what a ring does.
    if (ability.kind === "spellAdder") {
      const value = Math.floor(Number(ability.value) || 0);
      if (value > 0 && abilityApplies(ability, context)) {
        out.spellAdders.push({ label: ability.label ?? item.name, value });
      }
      out.reported.push(ability.note ?? describe(ability));
      continue;
    }
    // BASE DR IS ARMOUR (3.617.0, Graham's R17 of block 37). Not a bonus to
    // the DR pool: it is collected here and the damage paths take the
    // higher of it and worn armour's DR. The old reported twin of this row
    // is gone, so a stored copy of it is skipped rather than counted twice.
    if (ability.kind === "baseDR") {
      if (ability.reported) continue;
      const value = Math.max(0, Math.floor(Number(ability.value) || 0));
      const armourHP = Number(ability.armourHP) || bracersArmourHP(value);
      out.baseDR.push({
        itemId: item.id ?? item._id ?? "",
        itemName: item.name ?? ability.label ?? "",
        value,
        armourHP,
        stored: item?.flags?.[SYSTEM_ID]?.[BRACERS_FLAG] ?? null
      });
      out.summary.push(`${describe(ability)} (armour, ${armourHP} HP)`);
      continue;
    }
    if (ability.reported) {
      out.reported.push(ability.note ?? "");
      continue;
    }
    if (ability.kind === "spell") {
      out.spells.push({
        spell: ability.spell, frequency: ability.frequency, note: ability.note ?? "",
        ...(ability.duration ? { duration: ability.duration } : {}),
        // A PRINTED ACTIVATION (3.626.1): the Lantern of the Veil's "Engage
        // (1 AP)" is not the spell's own 2 AP — the same `castAP` a specific
        // item's `activationAP` already carries into the grant.
        ...(Number(ability.castAP) > 0 ? { castAP: Math.trunc(Number(ability.castAP)) } : {})
      });
      out.summary.push(`${ability.spell}${ability.note ? ` (${ability.note})` : ""}`);
      continue;
    }
    if (!abilityApplies(ability, context)) {
      out.reported.push(
        `${ability.label}: ${describe(ability)} — not applied, this ability is restricted.`);
      continue;
    }
    if (ability.hp) {
      out.hp += Number(ability.value) || 0;
      out.summary.push(describe(ability));
      continue;
    }
    if (!ability.target) {
      out.reported.push(ability.note ?? describe(ability));
      continue;
    }
    // ALL SAVES (3.617.0, B17 of block 37): one ability, three pools.
    if (ability.kind === "saveBonus" && ability.save === "all") {
      for (const save of ["fortitude", "reflex", "will"]) {
        out.bonuses.push({
          target: `system.combat.saves.${save}`,
          entry: {
            label: ability.label,
            value: Number(ability.value) || 0,
            type: ability.bonusType ?? "resistance",
            source: `wondrous:${item.id ?? item._id ?? ability.label}`
          }
        });
      }
      out.summary.push(describe(ability));
      continue;
    }
    out.bonuses.push({
      target: ability.target,
      entry: {
        label: ability.label,
        value: Number(ability.value) || 0,
        type: ability.bonusType ?? "item",
        source: `wondrous:${item.id ?? item._id ?? ability.label}`
      }
    });
    out.summary.push(describe(ability));
  }
  return out;
}

/** One ability, as a player would read it on the sheet. */
export function describe(ability) {
  const sign = (Number(ability?.value) || 0) >= 0 ? "+" : "";
  const amount = `${sign}${Number(ability?.value) || 0}`;
  const type = ability?.bonusType ? `${ability.bonusType} ` : "";
  switch (ability?.kind) {
    case "stat": return `${amount} ${type}to ${capitalise(ability.stat)}`;
    case "saveBonus": return `${amount} ${type}to ${capitalise(ability.save)} saves`;
    case "skillBonus": return `${amount} ${type}to ${capitalise(ability.skill)}`;
    case "drBonus": return `${amount} ${type}to DR`;
    case "baseDR": return `DR ${Number(ability.value) || 0}`;
    case "dbBonus": return `${amount} ${type}to DB`;
    case "hp": return `${amount} ${type}to hit points`;
    case "spellAdder": return `Spell Adder ${amount}`;
    // A USE A MODULE RUNS (3.626.0) read "+0" on the sheet (3.626.1; found
    // live on 0.8.0): said as the activation it is.
    case "use": {
      const freq = String(ability.frequency ?? "").trim();
      const when = freq === "daily" ? "1/day" : freq === "focus" ? "Focus" : freq === "atWill" ? "at will" : freq;
      const parts = [ability.activation, when].filter(Boolean);
      return `${ability.label ?? "Use"}${parts.length ? ` (${parts.join(", ")})` : ""}`;
    }
    case "note": return String(ability.note ?? ability.label ?? "");
    default: return `${amount} ${type}`.trim();
  }
}

function capitalise(text) {
  const value = String(text ?? "");
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * INVESTED AND WORN (3.617.0, Graham's R16 of block 37: keep investment for
 * items with the Invested trait, "and require them to be worn (equipped)
 * too"). Investment alone used to be the gate, so two invested Belts of Vital
 * Stamina in a backpack gave +10 HP. A carried container — the Never-Ending
 * Stash Sack, "held", not worn — needs only its investment.
 */
export function wondrousActive(item) {
  if (!item?.system?.invested) return false;
  const abilities = wondrousAbilitiesOf(item);
  const carriedOnly = abilities.length > 0 && abilities.every((a) => a?.kind === "container");
  return carriedOnly || Boolean(item?.system?.equipped);
}

/**
 * Every INVESTED wondrous item's contribution, gathered.
 *
 * Investment is the gate, and it is the whole difference between this
 * and the rune version: "when you invest the sash, you gain..."
 */
export function wondrousBonusesForActor(items = [], context = {}) {
  const all = {
    bonuses: [], hp: 0, summary: [], reported: [], spells: [], problems: [],
    spellAdders: [], baseDR: []
  };
  for (const item of items ?? []) {
    if (!isWondrous(item)) continue;
    if (!wondrousActive(item)) continue;
    const result = wondrousBonusesFor(item, context);
    all.bonuses.push(...result.bonuses);
    all.hp += result.hp;
    all.summary.push(...result.summary);
    all.reported.push(...result.reported.filter(Boolean));
    all.spells.push(...result.spells.map((s) => ({ ...s, itemId: item.id, itemName: item.name })));
    all.spellAdders.push(...result.spellAdders);
    all.baseDR.push(...result.baseDR);
    all.problems.push(...result.problems);
  }
  return all;
}

/* ───────────────────────── Bracers of Armour (R17) ───────────────────────── */

/** The item flag holding a pair of bracers' magical-armour HP. */
export const BRACERS_FLAG = "bracersArmour";

/** "At 0 the bracers go inert for 1 hour." */
export const BRACERS_INERT_SECONDS = 3600;

/** The chapter's pool for each Base DR: 20, 30, 40, 60, 80. */
const BRACERS_HP = Object.freeze({ 1: 20, 2: 30, 3: 40, 4: 60, 5: 80 });

/** The magical armour's HP for a Base DR (a built pair has no printed figure). */
export function bracersArmourHP(dr) {
  return BRACERS_HP[Math.floor(Number(dr) || 0)] ?? 0;
}

/**
 * One pair's state now: its HP, whether it is inert, and the DR it gives.
 * An hour after going inert it returns "at full HP" — read, not written, so
 * no clock has to wake anything up.
 */
export function bracersState(entry, now = 0) {
  const max = Math.max(0, Number(entry?.armourHP) || bracersArmourHP(entry?.value));
  const value = Math.max(0, Math.floor(Number(entry?.value) || 0));
  const stored = entry?.stored ?? {};
  const inertUntil = Number(stored?.inertUntil) || 0;
  if (inertUntil && Number(now) < inertUntil) {
    return { dr: 0, hp: 0, max, inert: true, inertUntil };
  }
  const raw = Number(stored?.hp);
  const hp = inertUntil || !Number.isFinite(raw) ? max : Math.min(max, Math.max(0, raw));
  return { dr: hp > 0 ? value : 0, hp, max, inert: false, inertUntil: 0 };
}

/**
 * "You may only benefit from the highest Base DR that you gain": of every
 * pair worn, the one giving the most DR now. Its id is what the damage
 * paths drain.
 *
 * `effective` IS THE DR A BLOW MEETS (3.617.1, Graham's answers to the
 * 3.617.0 drive):
 *   Q1 — the Base DR scales like armour, but by the wearer's BSB, as Mage
 *        Armour's does, not by BDB: Base DR × the multiplier for the BSB.
 *   Q2 — never more than the pool has left: the bracers "stop only what
 *        they have left", so a pair on 1 HP stops 1.
 */
export function bracersBaseDR(entries = [], now = 0, bsb = 0) {
  let best = { dr: 0, effective: 0, hp: 0, max: 0, inert: false, inertUntil: 0, itemId: "", itemName: "",
    source: "item", effectId: "", castId: null, lockoutMinutes: 0 };
  for (const entry of entries ?? []) {
    const state = {
      ...bracersState(entry, now),
      itemId: entry.itemId ?? "",
      itemName: entry.itemName,
      // A SPELL'S ARMOUR IS ONE MORE ENTRY (3.617.2, Mage Armour; MA2: only
      // the highest Base DR counts). It carries the caster's BSB from the
      // cast and the CL 6 multiplier step; see magic/spell-armour.mjs.
      source: entry.source === "effect" ? "effect" : "item",
      effectId: entry.effectId ?? "",
      castId: entry.castId ?? null,
      lockoutMinutes: Number(entry.lockoutMinutes) || 0
    };
    const ownBsb = entry.bsb === undefined || entry.bsb === null ? bsb : entry.bsb;
    const multiplier = drMultiplier(ownBsb) + Math.max(0, Math.trunc(Number(entry.multiplierBonus) || 0));
    state.effective = Math.min(Math.max(0, Math.floor(Number(state.dr) || 0)) * multiplier, state.hp);
    if (state.effective > best.effective || (!best.itemId && !best.effectId && state.inert)) best = state;
  }
  return best;
}

/**
 * The pool after the bracers' DR stopped `stopped` damage. At 0 they go
 * inert for an hour.
 */
export function bracersAfterDrain(state, stopped, now = 0) {
  const hp = Math.max(0, (Number(state?.hp) || 0) - Math.max(0, Math.floor(Number(stopped) || 0)));
  return hp > 0
    ? { hp, inertUntil: 0, inert: false }
    : { hp: 0, inertUntil: Number(now) + BRACERS_INERT_SECONDS, inert: true };
}
