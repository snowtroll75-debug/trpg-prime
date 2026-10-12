/**
 * Oils (Chapter 6, page 182) — the rules, pure.
 *
 * NEW at 3.578.0, for the block-18 audit's D8 and Graham's rulings R8
 * and R9 (20 September 2026). The Foundry side is oil-workflow.mjs.
 *
 * WHAT WAS WRONG. Five oils, and using one spent it and posted its
 * description. A blanched sword was steel to every creature weak to cold
 * iron; Armourguard added nothing to anything; Nulladir's vapours never
 * asked for a save.
 *
 * WHAT IT DOES NOW:
 *
 *   - Adamantine Blanch, Cold Iron Blanch and Silversheen coat one melee
 *     or thrown weapon, which counts as that material for the damage it
 *     deals — the blanches for 1 minute, Silversheen for 1 hour — or ten
 *     pieces of ammunition, split from the stack into a stack of their
 *     own that carries the material (R8);
 *   - Armourguard gives a metal item +5 item HP for 24 hours, a shield +1
 *     item DB and armour +1 item DR, each rising every 4 levels (R9, as
 *     Graham amended the text);
 *   - Nulladir's vapours ask the Fortitude DC 16 the page prints, or
 *     sickened 1 for 3 rounds.
 *
 * WHAT AN OIL DOES IS DATA, on the pack item at
 * `flags.trg-prime.consumable.oil` — see `oilOf` — and what it leaves on
 * the thing it was put on is the `oilCoat` flag on that item.
 */

const SYSTEM_ID = "trg-prime";

/** The flag an oiled item carries. */
export const OIL_COAT_FLAG = "oilCoat";

/** "10 pieces of ammunition" (page 182). */
const AMMO_PER_VIAL = 10;

/** The three things an oil can be. */
const OIL_KINDS = Object.freeze(["material", "armourguard", "vapour", "rider"]);

/*
 * THE UNGUENTS OF CHAPTER 11 (3.617.0, C1 of block 37; Graham's R3 and R4).
 * A fourth kind of oil, `rider`: a coat that adds something to the blows of
 * the weapon it is on, for a while.
 *
 *   Combustion Unguent   "1d6 secondary fire damage upon your next 5
 *                        successful strikes which must be made within an
 *                        hour of application" — `secondary` and `strikes`
 *   Unguent of Sharpness "one slashing or piercing weapon or up to 5 pieces
 *                        of slashing or piercing ammunition … a +1-item
 *                        bonus to attack and damage for 1 hour" — `attack`,
 *                        `damage`, `damageTypes`, `ammoCount`
 *
 * R4: a "successful strike" is a hit, and a critical is one hit; the fire is
 * secondary damage, so a critical does not multiply it. R3: the +1 is an
 * item bonus — it stacks with no other item bonus to the same roll, the
 * higher standing.
 */

/**
 * The oil a consumable carries, normalised, or null.
 *
 * @param {object} item
 * @returns {object|null}
 */
export function oilOf(item) {
  const raw = item?.flags?.[SYSTEM_ID]?.consumable?.oil ?? null;
  if (!raw || typeof raw !== "object" || !OIL_KINDS.includes(raw.kind)) return null;
  if (raw.kind === "material") {
    const material = String(raw.material ?? "").trim();
    if (!material) return null;
    return {
      kind: "material",
      material,
      weaponDuration: String(raw.weaponDuration ?? "1 minute"),
      ammoDuration: String(raw.ammoDuration ?? ""),
      ammoCount: Math.max(1, Math.floor(Number(raw.ammoCount) || AMMO_PER_VIAL))
    };
  }
  if (raw.kind === "armourguard") {
    return {
      kind: "armourguard",
      hp: Math.max(0, Number(raw.hp) || 0),
      dr: Math.max(0, Number(raw.dr) || 0),
      db: Math.max(0, Number(raw.db) || 0),
      duration: String(raw.duration ?? "24 hours"),
      perLevels: Math.max(0, Math.floor(Number(raw.perLevels) || 0)),
      hpStep: Math.max(0, Number(raw.hpStep) || 0),
      drStep: Math.max(0, Number(raw.drStep) || 0),
      dbStep: Math.max(0, Number(raw.dbStep) || 0)
    };
  }
  if (raw.kind === "rider") {
    const sec = raw.secondary && typeof raw.secondary === "object" ? raw.secondary : null;
    return {
      kind: "rider",
      attack: Math.max(0, Math.floor(Number(raw.attack) || 0)),
      damage: Math.max(0, Math.floor(Number(raw.damage) || 0)),
      secondary: sec?.dice ? { dice: String(sec.dice), type: String(sec.type ?? "") } : null,
      strikes: Math.max(0, Math.floor(Number(raw.strikes) || 0)),
      meleeOnly: Boolean(raw.meleeOnly),
      damageTypes: Array.isArray(raw.damageTypes) ? raw.damageTypes.map((t) => String(t).toLowerCase()) : [],
      weaponDuration: String(raw.weaponDuration ?? "1 hour"),
      ammoDuration: String(raw.ammoDuration ?? raw.weaponDuration ?? "1 hour"),
      ammoCount: Math.max(0, Math.floor(Number(raw.ammoCount) || 0))
    };
  }
  return {
    kind: "vapour",
    save: ["fortitude", "reflex", "will"].includes(raw.save) ? raw.save : "fortitude",
    dc: Math.max(0, Math.floor(Number(raw.dc) || 0)),
    conditions: Array.isArray(raw.conditions) ? raw.conditions : [],
    duration: String(raw.duration ?? "")
  };
}

/**
 * A duration phrase in seconds — "1 minute", "1 hour", "24 hours",
 * "3 rounds" — or null when it is not one (a blanch on ammunition lasts
 * until the piece is fired, and prints no time at all).
 *
 * @param {string} text
 * @returns {number|null}
 */
export function oilSeconds(text) {
  const m = /^\s*(\d+)\s*(round|minute|hour|day)s?\s*$/i.exec(String(text ?? ""));
  if (!m) return null;
  const unit = { round: 6, minute: 60, hour: 3600, day: 86400 }[m[2].toLowerCase()];
  return Number(m[1]) * unit;
}

/**
 * What an oil can go on, and whether this item is one of them.
 *
 * THE BLANCHES AND SILVERSHEEN: "one melee weapon, one thrown weapon, or
 * 10 pieces of ammunition". A bow is none of those — its arrows are.
 * ARMOURGUARD: "metal armour, shields or any other metal item". What an
 * item is made of is not something this system records in general, so
 * armour, shields and weapons are offered and "metal" is the table's.
 *
 * @param {object} oil from `oilOf`
 * @param {object} target an item
 * @returns {{ok: boolean, as: string|null, reason: string}}
 */
export function oilTarget(oil, target) {
  const type = target?.type ?? "";
  if (!oil) return { ok: false, as: null, reason: "not an oil" };
  if (oil.kind === "material") {
    if (type === "ammunition") return { ok: true, as: "ammunition", reason: "" };
    if (type !== "weapon") return { ok: false, as: null, reason: "only a weapon or ammunition" };
    const mode = String(target.system?.attackMode ?? "melee");
    const thrown = mode === "thrown" || /\bthrown\b/i.test(String(target.system?.traits ?? ""));
    if (mode === "missile" && !thrown) {
      return { ok: false, as: null, reason: "only a melee or thrown weapon — coat the ammunition instead" };
    }
    return { ok: true, as: "weapon", reason: "" };
  }
  if (oil.kind === "rider") {
    const wanted = oil.damageTypes;
    const typeOk = (word) => !wanted.length || wanted.includes(damageWord(word));
    if (type === "ammunition") {
      if (!oil.ammoCount) return { ok: false, as: null, reason: "only a weapon" };
      // Arrows, bolts and bullets that print no type are piercing, as fired.
      if (!typeOk(target.system?.damageType || "piercing")) return { ok: false, as: null, reason: `only ${wanted.join(" or ")} ammunition` };
      return { ok: true, as: "ammunition", reason: "" };
    }
    if (type !== "weapon") return { ok: false, as: null, reason: oil.ammoCount ? "only a weapon or ammunition" : "only a weapon" };
    if (oil.meleeOnly && String(target.system?.attackMode ?? "melee") !== "melee") {
      return { ok: false, as: null, reason: "only a melee weapon" };
    }
    if (!typeOk(target.system?.damageType)) return { ok: false, as: null, reason: `only a ${wanted.join(" or ")} weapon` };
    return { ok: true, as: "weapon", reason: "" };
  }
  if (oil.kind === "armourguard") {
    if (["armour", "shield", "weapon"].includes(type)) return { ok: true, as: type, reason: "" };
    return { ok: false, as: null, reason: "only armour, a shield or another metal item" };
  }
  return { ok: false, as: null, reason: "not applied to an item" };
}

/**
 * Armourguard at its level (R9): "+5 … HP … a shield gains a +1-item
 * bonus to DB and armour gains a +1-item bonus to DR. … For every
 * additional 4 levels of the elixir, the HP bonus increases by +5, DR by
 * +1 and DB by +1."
 *
 * @param {object} oil from `oilOf`
 * @param {number} itemLevel the vial's level
 * @param {number} baseLevel the level printed on the page
 * @returns {{hp: number, dr: number, db: number, steps: number}}
 */
export function armourguardAt(oil, itemLevel, baseLevel) {
  const per = Math.max(0, Number(oil?.perLevels) || 0);
  const above = Math.max(0, Math.floor(Number(itemLevel) || 0) - Math.floor(Number(baseLevel) || 0));
  const steps = per ? Math.floor(above / per) : 0;
  return {
    hp: Number(oil?.hp ?? 0) + steps * Number(oil?.hpStep ?? 0),
    dr: Number(oil?.dr ?? 0) + steps * Number(oil?.drStep ?? 0),
    db: Number(oil?.db ?? 0) + steps * Number(oil?.dbStep ?? 0),
    steps
  };
}

/**
 * The coat an oiled item carries, before any clock is asked.
 *
 * @param {object} item
 * @returns {object|null}
 */
export function oilCoatOf(item) {
  const coat = item?.flags?.[SYSTEM_ID]?.[OIL_COAT_FLAG] ?? null;
  return coat && typeof coat === "object" ? coat : null;
}

/**
 * Is a coat still on? World time first; and, as a poison's coat does, the
 * rounds of the combat it was put on in, whichever the table is keeping.
 * A coat with no end (a blanch on ammunition) lasts until it is fired.
 *
 * @param {object|null} coat
 * @param {{worldTime?: number, combatId?: string|null, round?: number|null}} now
 * @returns {boolean}
 */
export function oilCoatLive(coat, { worldTime = 0, combatId = null, round = null } = {}) {
  if (!coat || typeof coat !== "object") return false;
  const endsAt = coat.endsAt;
  if (endsAt !== null && endsAt !== undefined && Number.isFinite(Number(endsAt))
    && Number(worldTime) >= Number(endsAt)) return false;
  const rounds = Number(coat.rounds);
  if (coat.combatId && combatId && coat.combatId === combatId && Number.isFinite(rounds) && rounds > 0
    && Number.isFinite(Number(coat.round)) && Number.isFinite(Number(round))
    && Number(round) - Number(coat.round) >= rounds) return false;
  return true;
}

/**
 * The material a blow is struck with (R8): the ammunition's coat when a
 * coated piece is fired, else the weapon's coat, else what the weapon is
 * made of. "Counts as … instead of its normal material for any physical
 * damage it deals" — the material a creature's weakness or resistance
 * reads, and nothing else about the weapon.
 *
 * @param {object} state
 * @param {string} [state.weaponMaterial]
 * @param {object|null} [state.weaponCoat]
 * @param {object|null} [state.ammoCoat]
 * @param {object} [state.now] for `oilCoatLive`
 * @returns {{material: string, coated: boolean, source: string}}
 */
export function struckMaterial({ weaponMaterial = "", weaponCoat = null, ammoCoat = null, now = {} } = {}) {
  for (const coat of [ammoCoat, weaponCoat]) {
    if (coat?.kind === "material" && coat.material && oilCoatLive(coat, now)) {
      return { material: String(coat.material), coated: true, source: String(coat.name ?? "") };
    }
  }
  return { material: String(weaponMaterial ?? ""), coated: false, source: "" };
}

/**
 * Armourguard's bonus on this item right now, or nothing.
 *
 * @param {object} item
 * @param {object} [now] for `oilCoatLive`; defaults to the world clock
 * @returns {{hp: number, dr: number, db: number, name: string}}
 */
export function armourguardBonus(item, now = null) {
  const coat = oilCoatOf(item);
  const none = { hp: 0, dr: 0, db: 0, name: "" };
  if (coat?.kind !== "armourguard") return none;
  const clock = now ?? { worldTime: Number(globalThis.game?.time?.worldTime ?? 0) };
  if (!oilCoatLive(coat, clock)) return none;
  return {
    hp: Number(coat.hp) || 0,
    dr: Number(coat.dr) || 0,
    db: Number(coat.db) || 0,
    name: String(coat.name ?? "Armourguard")
  };
}

/**
 * The ten pieces a vial coats (R8), split from the stack.
 *
 * @param {number} quantity the stack's size
 * @param {number} [count]
 * @returns {{coated: number, left: number, split: boolean}}
 */
export function ammoSplit(quantity, count = AMMO_PER_VIAL) {
  const held = Math.max(0, Math.floor(Number(quantity) || 0));
  const coated = Math.min(held, Math.max(1, Math.floor(Number(count) || AMMO_PER_VIAL)));
  return { coated, left: held - coated, split: held > coated };
}

/**
 * An item's HP when Armourguard comes off: the bonus leaves the maximum,
 * and the item keeps what it has up to the new maximum — the bonus
 * absorbed the damage first, as temporary hit points do.
 *
 * @param {{value: number, max: number}} hp
 * @param {number} bonus
 * @returns {{value: number, max: number}}
 */
export function hpAfterArmourguard(hp, bonus) {
  const max = Math.max(0, Math.floor(Number(hp?.max) || 0) - Math.max(0, Math.floor(Number(bonus) || 0)));
  const value = Math.min(Math.floor(Number(hp?.value) || 0), max);
  return { value, max };
}

/** "B", "bludgeoning" → "bludgeoning"; the pack writes both. */
function damageWord(value) {
  const t = String(value ?? "").trim().toLowerCase();
  return { b: "bludgeoning", p: "piercing", s: "slashing" }[t] ?? t;
}

/** A live rider coat, or null. */
function liveRider(coat, now) {
  return coat?.kind === "rider" && oilCoatLive(coat, now) ? coat : null;
}

/**
 * An unguent's item bonus to the attack (Sharpness), as a modifier row of
 * type `item`, so the attack's own stacking keeps the higher of it and the
 * weapon's (R3).
 * @returns {object|null}
 */
export function riderAttackRow(coat, now = {}) {
  const live = liveRider(coat, now);
  if (!live || !(Number(live.attack) > 0)) return null;
  return { label: String(live.name ?? "Unguent"), value: Number(live.attack), type: "item" };
}

/** An unguent's item bonus to damage (Sharpness), before stacking. */
export function riderDamageBonus(coat, now = {}) {
  const live = liveRider(coat, now);
  return live ? Math.max(0, Number(live.damage) || 0) : 0;
}

/**
 * An unguent's secondary damage (Combustion), in the shape of a rune's packet
 * — the attack's secondary-damage loop resolves it against the target's
 * defences like a Flaming rune's. Nothing once its strikes are spent.
 * @returns {Array<{label, dice, type, secondaryCritical: null}>}
 */
export function riderPackets(coat, now = {}) {
  const live = liveRider(coat, now);
  if (!live?.secondary?.dice) return [];
  if (live.strikesLeft !== undefined && live.strikesLeft !== null && Number(live.strikesLeft) <= 0) return [];
  return [{ label: String(live.name ?? "Unguent"), dice: live.secondary.dice, type: live.secondary.type, secondaryCritical: null }];
}

/**
 * A hit spends one of a counted coat's strikes (R4: hits only, a critical
 * is one).
 * @returns {{strikesLeft: number, gone: boolean}|null} null when nothing counts
 */
export function riderAfterHit(coat, now = {}) {
  const live = liveRider(coat, now);
  if (!live || live.strikesLeft === undefined || live.strikesLeft === null) return null;
  const left = Math.max(0, Number(live.strikesLeft) - 1);
  return { strikesLeft: left, gone: left <= 0 };
}
