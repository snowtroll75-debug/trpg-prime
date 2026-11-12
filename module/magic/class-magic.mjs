/**
 * A CLASS'S OWN MAGIC, DECLARED (3.680.0; Eldritch Arts Block 3a, D4).
 *
 * The core's casting classes each name one tradition and one ability, keep a
 * book that grows by two a level or a repertoire on one schedule, and know
 * their cantrips from their own tradition. Eldritch Arts' three High Magic
 * classes print otherwise:
 *
 *   - THE ARCHMAGE: "you do not develop spells from a specific tradition and
 *     instead treat all traditions as high magic"; "Each time you gain a
 *     level you automatically add one new high magic spell to your spell
 *     book"; "You also begin play with 6 high magic cantrips in your spell
 *     book. Each day when you prepare your spells you may memorise any three
 *     of these cantrips".
 *   - THE SORCERER: "At 1st level you are granted access to one spell which
 *     may be selected from any tradition … At 3rd level and then every two
 *     levels thereafter, you may select an additional spell from any
 *     tradition", and "at 2nd level and every two levels, thereafter, you may
 *     select a new spell from the tradition of magic granted by your
 *     Birthright"; "One of these cantrips must be selected from the tradition
 *     granted by your birthright, the other can be selected from any
 *     tradition"; "Your magical ability score is determined by your
 *     birthright".
 *   - THE WITCH: "treat the Ethereal and Verdant traditions as high magic".
 *
 * Declared in `flags.trg-prime.classMagic`, on the class item and on a live
 * class ability (a subclass the class's `abilityChoices` granted). Every field
 * is optional; a class that declares nothing reads exactly as before.
 *
 *   On the CLASS:
 *     traditions   "any" | ["ethereal", "verdant"]  the traditions it learns
 *                  from (book, repertoire, cantrips, memorisation)
 *     bookPerLevel 1                                 spell-book slots a level
 *     cantripBook  true      its known cantrips go in the book, and its
 *                            `cantripsPerDay` are memorised from them
 *     memorisedPerDay "L+1"  the daily leveled budget (3.682.0), else
 *                            the core's "2+2L"
 *     tracks       [{key, label, firstPicks, firstPickExact, pickFrom,
 *                   pickStep, traditions}]   repertoire schedules besides the
 *                  class's own; `traditions` may be "track" to take the
 *                  subclass's answer for this key
 *     cantrips     [{label, traditions | track}]   one filter per known
 *                  cantrip, most restrictive first
 *
 *   On a SUBCLASS ability:
 *     ability      "charisma"   the magical ability score
 *     tradition    "arcane"     the home tradition (or "" for none)
 *     tracks       {birthright: "arcane" | "any"}   a track's traditions
 *
 * Pure.
 */
import { memorisedPerDayRule } from "./memorisation.mjs";
const SYSTEM_ID = "trg-prime";

/** The four the pack ships, and the book's spelling of one of them. */
const CLASS_MAGIC_TRADITIONS = Object.freeze(["arcane", "divinity", "ethereal", "verdant"]);
const SYNONYMS = Object.freeze({ divine: "divinity" });

/** The six ability scores a magical ability may be. */
const MAGICAL_ABILITIES = Object.freeze(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]);

const str = (v) => String(v ?? "").trim().toLowerCase();
const whole = (v, min = 0) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= min ? n : null;
};

/** One tradition name, normalised, or "". */
export function traditionKey(value) {
  const key = SYNONYMS[str(value)] ?? str(value);
  return CLASS_MAGIC_TRADITIONS.includes(key) ? key : "";
}

/**
 * A traditions rule: "any", a list of known traditions, or null.
 * `true` reads as "any"; a comma string as a list; unknown names drop out,
 * and a list left empty is null rather than "nothing", so a typo cannot
 * close every pick.
 */
export function traditionRule(value) {
  if (value === true || str(value) === "any") return "any";
  const raw = Array.isArray(value) ? value : (typeof value === "string" ? value.split(",") : []);
  const list = [...new Set(raw.map(traditionKey).filter(Boolean))];
  return list.length ? list : null;
}

/** A spell's printed traditions, normalised. */
function printedTraditions(value) {
  return String(value ?? "").split(/[,;]/).map(traditionKey).filter(Boolean);
}

/**
 * Does a spell's tradition satisfy a rule?
 *
 * "any" admits every spell. A list admits a spell that names any of them,
 * and a spell that names none (universal), as `spellShapeMatches` does for a
 * single tradition.
 */
export function traditionAllowed(rule, spellTradition) {
  if (rule === "any") return true;
  if (!Array.isArray(rule) || !rule.length) return false;
  const printed = printedTraditions(spellTradition);
  if (!printed.length) return true;
  return printed.some((t) => rule.includes(t));
}

/** A rule as words, for a picker's title. */
export function traditionRuleLabel(rule, fallback = "") {
  if (rule === "any") return "any tradition";
  if (Array.isArray(rule) && rule.length) return rule.join(" or ");
  return fallback;
}

function liveSubclassItems(items) {
  return Array.from(items ?? []).filter((item) =>
    (item?.type === "ability" || item?.type === "feat") &&
    !(item.type === "ability" && item.system?.active === false) &&
    item.flags?.[SYSTEM_ID]?.classMagic && typeof item.flags[SYSTEM_ID].classMagic === "object");
}

function normaliseTrack(raw, index) {
  const key = str(raw?.key) || `track${index + 1}`;
  const out = {
    key,
    label: String(raw?.label ?? "").trim() || key,
    pickFrom: whole(raw?.pickFrom, 1) ?? 2,
    pickStep: whole(raw?.pickStep, 1) ?? 2,
    firstPicks: whole(raw?.firstPicks, 0) ?? 0,
    firstPickExact: raw?.firstPickExact === true,
    // "track" defers to the subclass; anything else is a rule now.
    traditions: str(raw?.traditions) === "track" ? "track" : traditionRule(raw?.traditions)
  };
  return out;
}

/**
 * The class's magic, with its subclass's answers folded in.
 *
 * @param {object|null} classItem
 * @param {Iterable<object>} items the actor's items
 * @returns {{declared: boolean, traditions: "any"|string[]|null, ability: string,
 *   tradition: string|null, bookPerLevel: number|null, cantripBook: boolean,
 *   tracks: object[], cantrips: object[], subclass: string}}
 */
export function classMagicOf(classItem, items = []) {
  const own = classItem?.flags?.[SYSTEM_ID]?.classMagic;
  const cls = own && typeof own === "object" ? own : {};
  const out = {
    declared: Boolean(own && typeof own === "object"),
    traditions: traditionRule(cls.traditions),
    ability: "",
    // null: the subclass says nothing about the home tradition, so the
    // class's own stands. "" is an answer — "none".
    tradition: null,
    bookPerLevel: whole(cls.bookPerLevel, 0),
    cantripBook: cls.cantripBook === true,
    // THE DAILY BUDGET (3.682.0): "2+2L" (the default) or "L+1".
    memorisedPerDay: memorisedPerDayRule(cls.memorisedPerDay),
    tracks: (Array.isArray(cls.tracks) ? cls.tracks : []).map(normaliseTrack),
    cantrips: (Array.isArray(cls.cantrips) ? cls.cantrips : []).map((raw, i) => ({
      label: String(raw?.label ?? "").trim() || `cantrip ${i + 1}`,
      track: str(raw?.track),
      traditions: traditionRule(raw?.traditions)
    })),
    subclass: ""
  };
  const trackAnswers = {};
  for (const item of liveSubclassItems(items)) {
    const sub = item.flags[SYSTEM_ID].classMagic;
    out.declared = true;
    if (!out.subclass) out.subclass = String(item.name ?? "");
    const ability = str(sub.ability);
    if (MAGICAL_ABILITIES.includes(ability) && !out.ability) out.ability = ability;
    if (out.tradition === null && Object.prototype.hasOwnProperty.call(sub, "tradition")) {
      out.tradition = traditionKey(sub.tradition);
    }
    for (const [key, value] of Object.entries(sub.tracks ?? {})) {
      const k = str(key);
      if (k && !(k in trackAnswers)) trackAnswers[k] = traditionRule(value);
    }
  }
  // A track deferring to the subclass takes its answer, or none: with no
  // subclass yet it offers nothing rather than everything.
  for (const track of out.tracks) {
    if (track.traditions === "track") track.traditions = trackAnswers[track.key] ?? null;
  }
  for (const slot of out.cantrips) {
    if (slot.track) slot.traditions = trackAnswers[slot.track] ?? null;
  }
  return out;
}

/**
 * Fold the declarations into a resolved class progression (in place).
 *
 * The magical ability and the home tradition are written over the class's
 * own, so caster level (`classCasts`), Spellcraft, PP and every tradition
 * reader see the subclass's answer through the field they already read.
 * `learnTraditions` and `classMagic` ride along for the pickers.
 */
export function applyClassMagic(progression, magic) {
  if (!progression || !magic?.declared) return progression;
  if (magic.ability) progression.magicalAbility = magic.ability;
  if (magic.tradition !== null && magic.tradition !== undefined) progression.tradition = magic.tradition;
  progression.learnTraditions = magic.traditions;
  progression.classMagic = magic;
  return progression;
}

/**
 * The traditions this actor may learn from, besides its own: a class's
 * declaration and a creature's derives (Arcadian Caster, True Caster), merged.
 * "any" wins; two lists join.
 */
export function learnTraditionsRule(progressionRule, derivesRule) {
  const a = traditionRule(progressionRule);
  const b = traditionRule(derivesRule);
  if (a === "any" || b === "any") return "any";
  const joined = [...new Set([...(a ?? []), ...(b ?? [])])];
  return joined.length ? joined : null;
}

/**
 * The rule a pick is filtered by: the widened one when there is one, plus the
 * actor's own tradition, or the own tradition alone.
 */
export function pickTraditionRule(ownTradition, widened) {
  if (widened === "any") return "any";
  const own = traditionKey(ownTradition);
  const list = [...new Set([...(Array.isArray(widened) ? widened : []), ...(own ? [own] : [])])];
  return list.length ? list : null;
}

/** Book slots: the opening batch, then `perLevel` (default 2) a level after. */
export function bookSlotsPerLevel(magic) {
  const n = whole(magic?.bookPerLevel, 0);
  return n === null ? 2 : n;
}

/** How many picks a track has granted by a level. */
export function trackPickCount(track, level) {
  const value = Math.floor(Number(level) || 0);
  if (value < 1 || !track) return 0;
  const steps = value < track.pickFrom ? 0 : 1 + Math.floor((value - track.pickFrom) / track.pickStep);
  return track.firstPicks + steps;
}

/** The next level a track grants a pick at, or null past 20. */
export function trackNextPickLevel(track, level) {
  const value = Math.floor(Number(level) || 0);
  const next = value < track.pickFrom ? track.pickFrom : track.pickFrom + (Math.floor((value - track.pickFrom) / track.pickStep) + 1) * track.pickStep;
  return next > 20 ? null : next;
}

/**
 * Which cantrip slot the next known cantrip fills: the first whose filter no
 * known cantrip already fills, assigning the known ones most-restrictive
 * first. Returns its index, or -1 when every slot is filled.
 *
 * @param {object[]} slots `classMagic.cantrips`
 * @param {Array<string>} knownTraditions each known cantrip's printed tradition
 */
export function nextCantripSlot(slots = [], knownTraditions = []) {
  const filled = new Set();
  const order = slots.map((slot, index) => ({ slot, index }))
    .sort((a, b) => restrictiveness(a.slot) - restrictiveness(b.slot));
  for (const tradition of knownTraditions) {
    const hit = order.find(({ slot, index }) => !filled.has(index) && traditionAllowed(slot.traditions, tradition));
    if (hit) filled.add(hit.index);
  }
  const open = order.find(({ index }) => !filled.has(index));
  return open ? open.index : -1;
}

function restrictiveness(slot) {
  if (slot?.traditions === "any") return 99;
  return Array.isArray(slot?.traditions) ? slot.traditions.length : 0;
}

/**
 * Is High Magic declared for this spell by this item's `highMagicCaster`?
 * `true` and "any": every spell. A list: a spell of one of those traditions,
 * or one that names none and so takes the caster's (a specialist spell, a
 * hex — "a magical tradition is not provided as this will always be based
 * upon your primary tradition").
 */
export function highMagicDeclaredFor(declared, spellTradition, casterTradition) {
  if (declared === true || str(declared) === "any") return true;
  const rule = traditionRule(declared);
  if (!Array.isArray(rule)) return false;
  const printed = printedTraditions(spellTradition);
  const own = printed.length ? printed : printedTraditions(casterTradition);
  return own.some((t) => rule.includes(t));
}

/**
 * The rule an actor's book, repertoire and Learn a Spell picks are filtered
 * by: its own tradition, widened by its class (`learnTraditions`) and by a
 * creature's derives. Null when it has neither — every tradition, as an empty
 * tradition always meant to `spellShapeMatches`.
 */
export function actorPickRule(actor, derivesRule = null) {
  return pickTraditionRule(
    actor?.system?.magic?.tradition ?? "",
    learnTraditionsRule(actor?.system?.progression?.learnTraditions ?? null, derivesRule)
  );
}

/** Does a spell's tradition pass an actor's pick rule (null: always)? */
export function pickAllowed(rule, spellTradition) {
  return rule === null ? true : traditionAllowed(rule, spellTradition);
}
