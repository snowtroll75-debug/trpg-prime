/**
 * The runes that fire on something else happening (Chapter 11, group 3).
 *
 * Ten runes with no button and no bonus: they wait for an event this
 * system already produces and change what it does. Seven from Chapter
 * 11, three from the Creature Codex's Chapter 3.
 *
 *   Deathless        a Dying Check becomes a Critical Result   (1/day)
 *   Life Stealing    a critical drains the target and heals you
 *   Indestructible   a critical the armour would reduce is negated
 *   Benevolent       Aid Defensive also gives the shield's bonus
 *   Reflecting       a spell targeting you is turned back       (x/day)
 *   Returning        a thrown weapon comes back
 *   Ghost Touch      the weapon works on the incorporeal
 *   Savage Jaw       an enemy's fumble opens a counterattack    (Codex)
 *   Skyfeather       a fall becomes a Feather Fall              (Codex)
 *   Submersible      underwater is no different from dry land   (Codex)
 *
 * EACH IS A QUESTION ASKED AT ITS OWN EVENT, which is why they live
 * together: the shape is always "does any equipped item carry this rune,
 * and if so what does it change". The predicates are pure and the
 * workflows that call them are in the files that own those events —
 * combat.mjs for the dying check, attack-workflow.mjs for criticals —
 * rather than being reimplemented here.
 *
 * THREE OF THEM ARE REPORTED RATHER THAN APPLIED, and they are the
 * three where this system has nothing to apply them to. Returning needs
 * to know whether your hands are full at the moment the weapon comes
 * back; Submersible lifts an underwater penalty this system does not
 * yet impose. Ghost Touch was the third until 3.274.0 gave Incorporeal
 * real mechanics — its line is still printed rather than applied,
 * because what it changes is whether an attack FORM connects, and that
 * question is asked of the incoming attack rather than of the weapon.
 * All three print what happens; none pretends to resolve it.
 */

import { runeKindOf } from "./rune-bearing.mjs";
import { fieldToRunes } from "./rune-catalogue.mjs";
import { roman } from "./runes.mjs";
import { CODEX_ARMOUR_RUNES, CODEX_WEAPON_RUNES } from "./codex-rune-data.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * ONE COPY OF ANY FIGURE THAT MUST AGREE WITH ITSELF. Savage Jaw's dice
 * are typed once, in `codex-rune-data.mjs`, where they are checked
 * against the printed page — not written again here.
 */
const codexRune = (key) => [...CODEX_ARMOUR_RUNES, ...CODEX_WEAPON_RUNES]
  .find((rune) => rune.key === key);

/** The seven, and what each one waits for. */
export const EVENT_RUNES = Object.freeze({
  deathless: {
    label: "Deathless",
    on: ["armour"],
    event: "dyingCheck",
    usesPerDay: () => 1,
    describe: () => "Your Dying Check is treated as a Critical Result."
  },
  lifeStealing: {
    label: "Life Stealing",
    on: ["weapon"],
    event: "criticalHit",
    usesPerDay: () => Infinity,
    // "the target must make a Fortitude saving throw to avoid taking
    // 1d6 Soul Drain. This Soul Drain immediately heals the wielder."
    drain: "1d6",
    describe: () =>
      "On a critical hit the target makes a Fortitude save or takes 1d6 Soul Drain, which immediately heals you. Bleed from this weapon becomes recurring essence damage."
  },
  indestructible: {
    label: "Indestructible",
    on: ["armour"],
    event: "criticalAmendment",
    usesPerDay: () => Infinity,
    describe: () =>
      "A critical injury result that this armour would normally reduce is negated completely."
  },
  benevolent: {
    label: "Benevolent",
    on: ["shield"],
    event: "aidDefensive",
    usesPerDay: () => Infinity,
    describe: () =>
      "When you Aid an ally's defence, they also gain this shield's own bonus to DB."
  },
  reflecting: {
    label: "Reflecting",
    on: ["shield"],
    event: "spellTargeted",
    // "1/day to reflect a spell of up to PP 14" at I; at II, "1/day to
    // reflect a spell of up to PP 18 and 3/day to reflect a spell of up
    // to PP 14" — two allowances at once, which no other rune has.
    usesPerDay: (tier) => (tier >= 2 ? 4 : 1),
    allowances: (tier) => (tier >= 2
      ? [{ uses: 1, maxPP: 18 }, { uses: 3, maxPP: 14 }]
      : [{ uses: 1, maxPP: 14 }]),
    describe: (tier) => tier >= 2
      ? "Reflect a spell back at its caster: once a day up to PP 18, and three times a day up to PP 14."
      : "Reflect a spell back at its caster once a day, up to PP 14."
  },
  returning: {
    label: "Returning",
    on: ["weapon"],
    event: "thrownStrike",
    usesPerDay: () => Infinity,
    describe: () =>
      "After a thrown Strike the weapon flies back to your hand. If your hands are full it falls to the ground in your space."
  },
  ghostTouch: {
    label: "Ghost Touch",
    on: ["weapon"],
    event: "always",
    usesPerDay: () => Infinity,
    describe: () =>
      "The weapon affects incorporeal creatures normally, and may be wielded by them."
  },

  // THREE FROM THE CREATURE CODEX (Chapter 3), and they are the same
  // shape as the seven above: something happens, and a rune on an
  // equipped item changes what it means. They join this registry rather
  // than arriving with a mechanism of their own, which is the whole
  // point of there being a registry.
  savageJaw: {
    label: "Savage Jaw",
    // ONE COPY of which items it goes on, as with its dice. The
    // catalogue gates this list already, so a second copy here would be
    // a copy nothing could contradict — the quietest kind.
    on: codexRune("savageJaw").on,
    // The one event in this table that fires on someone ELSE's roll.
    // Every other event rune here waits for something its own bearer
    // does; this one waits for an enemy to fumble at them, which is why
    // the attack workflow reads the TARGET's shields for it rather than
    // the attacker's weapon.
    event: "enemyFumble",
    usesPerDay: () => Infinity,
    damage: codexRune("savageJaw").damage,
    damageType: codexRune("savageJaw").damageType,
    describe: () =>
      `Your Reaction: an Attack Check against the foe who fumbled, at your usual melee attack bonus, dealing ${
        codexRune("savageJaw").damage} ${codexRune("savageJaw").damageType
      } damage plus your ability modifier on a hit.`
  },
  skyfeather: {
    label: "Skyfeather",
    on: codexRune("skyfeather").on,
    event: "falling",
    // "Frequency Constant" — the rune is not spent, so there is nothing
    // to count. Infinity is what a constant frequency is.
    usesPerDay: () => Infinity,
    describe: () =>
      "The armour catches you as a Feather Fall spell: your descent slows to 60 feet per round and you take no damage on landing."
  },
  submersible: {
    label: "Submersible",
    on: codexRune("submersible").on,
    event: "always",
    usesPerDay: () => Infinity,
    // APPLIED since 3.632.0 (Fiends & Fables 3.0 block 2, ruling 6): the
    // attack path reads the rune and lifts page 201's melee −2 and the fire
    // failure (combat/underwater.mjs `underwaterStrikeExemption`). The line
    // on the card says why the water cost the strike nothing.
    describe: () =>
      "Underwater it strikes as it does on dry land — the usual underwater attack penalties and limitations do not apply to it, and its flames keep burning submerged."
  }
});

/** The event runes on one item. */
export function eventRunesFor(item) {
  const kind = runeKindOf(item);
  if (!kind) return [];
  const catalogueKind = kind === "shield" ? "shield" : kind;
  const out = [];
  for (const chosen of fieldToRunes(catalogueKind, item?.system?.runes ?? "")) {
    const rune = EVENT_RUNES[chosen.key];
    if (!rune || !rune.on.includes(kind)) continue;
    const tier = Math.max(1, Math.floor(Number(chosen.tier) || 1));
    out.push({
      key: chosen.key,
      label: `${rune.label}${tier > 1 ? ` ${roman(tier)}` : ""}`,
      tier,
      event: rune.event,
      usesPerDay: rune.usesPerDay(tier),
      allowances: rune.allowances ? rune.allowances(tier) : null,
      drain: rune.drain ?? "",
      // Savage Jaw's counterattack. Carried out here for the same reason
      // `drain` is: the caller rolls it, and a die expression the caller
      // has to know by heart is a die expression that will drift.
      damage: rune.damage ?? "",
      damageType: rune.damageType ?? "",
      description: rune.describe(tier)
    });
  }
  return out;
}

/**
 * The first equipped item carrying a given event rune, with the rune.
 *
 * EQUIPPED, always: a Deathless breastplate in your pack does not save
 * you. Returns null rather than a falsy object so a caller reads as
 * "if there is one" rather than "if the count is above zero".
 */
export function equippedEventRune(items = [], key) {
  for (const item of items ?? []) {
    if (!item?.system?.equipped) continue;
    const rune = eventRunesFor(item).find((entry) => entry.key === key);
    if (rune) return { item, rune };
  }
  return null;
}

/** How many uses of an event rune remain today. */
export function eventUsesRemaining(item, rune) {
  if (rune.usesPerDay === Infinity) return Infinity;
  const spent = Number(item?.flags?.[SYSTEM_ID]?.runeState?.spent?.[rune.key] ?? 0);
  return Math.max(0, rune.usesPerDay - spent);
}

/**
 * DEATHLESS: what a Dying Check becomes.
 *
 * "Your Dying Check is treated as a Critical Result" — and a critical
 * result on that check is a delta of -2, so the rune is worth two steps
 * of Dying whatever was actually rolled. Returns the degree to use, so
 * the caller keeps the roll and only the reading changes.
 */
export const DEATHLESS_DEGREE = "critical";

/**
 * REFLECTING: may this rune turn back a spell of this cost today?
 *
 * Tier II has TWO allowances at once — one big and three small — so the
 * question is not "have you any uses left" but "have you a use left that
 * reaches this spell". Spends the tightest allowance that fits, leaving
 * the generous one for a spell that needs it.
 */
export function reflectionAvailable(rune, spellPP, spent = {}) {
  const cost = Math.max(0, Math.floor(Number(spellPP) || 0));
  const allowances = (rune?.allowances ?? [])
    .filter((allowance) => cost <= allowance.maxPP)
    .sort((a, b) => a.maxPP - b.maxPP);
  for (const allowance of allowances) {
    const used = Number(spent?.[`pp${allowance.maxPP}`] ?? 0);
    if (used < allowance.uses) {
      return { available: true, maxPP: allowance.maxPP, remaining: allowance.uses - used };
    }
  }
  const highest = Math.max(0, ...(rune?.allowances ?? []).map((a) => a.maxPP));
  return {
    available: false,
    maxPP: 0,
    remaining: 0,
    reason: cost > highest
      ? `${rune?.label ?? "The rune"} reaches PP ${highest}; that spell is PP ${cost}.`
      : `${rune?.label ?? "The rune"} has no uses left today for a spell of PP ${cost}.`
  };
}

/**
 * WHAT A REFLECTION SPENDS (3.616.0, Graham's R7 of block 36): the
 * allowance it used, and the rune's own count. The sheet's "N left today"
 * reads `spent.reflecting` through `eventUsesRemaining`, and the allowance
 * reads `spent.pp14` / `spent.pp18`; the sheet button used to write only the
 * second, so the count on the sheet never moved.
 * @returns {Record<string, number>} the `spent` keys to write
 */
export function reflectionSpendUpdates(spent = {}, maxPP) {
  const key = `pp${Math.floor(Number(maxPP) || 0)}`;
  return {
    [key]: Number(spent?.[key] ?? 0) + 1,
    reflecting: Number(spent?.reflecting ?? 0) + 1
  };
}

