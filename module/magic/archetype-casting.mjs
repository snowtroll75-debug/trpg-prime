/**
 * THE FOUR CASTER ARCHETYPES — Animist, Arcanist, Gleeman and Priest.
 *
 * Chapter 5. Four feats that hand a non-caster a little magic: a class
 * skill, a BSB, access to another class's feat list, and — the half that
 * had never been built — CANTRIPS.
 *
 * Graham, 20 August 2026: *"They apply the skill grant, the BSB and the
 * feat access but not the cantrips."*
 *
 * WHY THIS NEEDED A MODULE RATHER THAN FOUR MORE `grantChosenSpell`
 * CALLS. The obvious fix is to hand each feat its cantrips once and be
 * done. It is wrong for three of the four, because the book gives them
 * three different mechanics and only one of them is a fixed pick:
 *
 *   ANIMIST  "Each day during your daily preparation you may prepare and
 *            cast ANY TWO cantrips from the verdant spell list."
 *   PRIEST   "You can prepare and cast two cantrips from the divinity
 *            spell list each day."
 *            → a free re-pick from the whole tradition every morning.
 *              Freezing the choice at the moment the feat is taken would
 *              be a different, smaller feat.
 *
 *   ARCANIST "You gain a SPELLBOOK containing four arcane cantrips. You
 *            can prepare and cast TWO OF THESE cantrips each day."
 *            → two tiers. Four permanent, two of those four prepared.
 *
 *   GLEEMAN  "You have become an INSTINCTIVE ethereal caster and may
 *            select and cast any two cantrips from the ethereal spell
 *            list."
 *            → two permanent picks, cast at will, no preparation at all.
 *
 * Those are, precisely, the three mechanics the system already models for
 * classes: list-memorisation (Cleric, Druid), book-memorisation (Wizard)
 * and known cantrips (Bard). So this file describes the four archetypes
 * in the same vocabulary rather than inventing a fourth.
 *
 * THE BLOCKER THAT MADE IT LOOK UNBUILDABLE. Every cantrip allowance in
 * the system is read off the CLASS item — `cantripsPerDay` and
 * `cantripsKnown` — and so is the tradition and the caster style. A
 * Fighter who takes Gleeman has no class item to read, so
 * `memorisationContext` returned null, the Memorisation card never
 * rendered, and the four feats could only ever post prose telling the
 * player to add spells by hand. A caster archetype is not a class; it is a
 * SECOND SOURCE, and this file is what a second source looks like.
 *
 * SEPARATE POOLS PER SOURCE (Graham's ruling, 20 August 2026). A Cleric
 * may take Arcanist — the prerequisite is only Non-Wizard — and then
 * holds divinity magic from the class and arcane cantrips from the feat.
 * The two never merge: each source counts its own picks, against its own
 * allowance, in its own tradition. Nothing can double-count because
 * nothing is ever added together.
 *
 * NO IMPORTS BEYOND CONFIG, deliberately, so the harness can drive every
 * rule in this file without Foundry.
 */

import { TRADITIONS } from "../config.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The four, in the vocabulary the system already uses for classes.
 *
 * `style` picks the mechanic:
 *   "list"        — prepare N each day from the whole tradition list.
 *   "book"        — `bookCantrips` permanent, `dailyCantrips` of those
 *                   prepared each day.
 *   "instinctive" — `knownCantrips` permanent, cast at will.
 *
 * THE ABILITY COMES FROM THE TRADITION (Graham's ruling, 20 August
 * 2026). Each feat's printed prerequisite names its own tradition's
 * ability, and all four line up exactly — Animist wants Con +3 and
 * verdant runs on Constitution; Arcanist Int +3, arcane on Intelligence;
 * Gleeman Cha +3, ethereal on Charisma; Priest Wis +3, divinity on
 * Wisdom. Far too precise to be coincidence, so a caster archetype casts
 * off that score exactly as every other caster does. It is READ from
 * `config.mjs` rather than written out again here, so it cannot drift
 * from the tradition it belongs to.
 */
export const ARCHETYPE_CASTING = Object.freeze({
  animist: Object.freeze({
    key: "animist",
    label: "Animist",
    tradition: "verdant",
    style: "list",
    dailyCantrips: 2,
    printed: "Each day during your daily preparation you may prepare and cast any two cantrips from the verdant spell list."
  }),
  arcanist: Object.freeze({
    key: "arcanist",
    label: "Arcanist",
    tradition: "arcane",
    style: "book",
    bookCantrips: 4,
    dailyCantrips: 2,
    printed: "You gain a spellbook containing four arcane cantrips. You can prepare and cast two of these cantrips each day."
  }),
  gleeman: Object.freeze({
    key: "gleeman",
    label: "Gleeman",
    tradition: "ethereal",
    style: "instinctive",
    knownCantrips: 2,
    printed: "You have become an instinctive ethereal caster and may select and cast any two cantrips from the ethereal spell list."
  }),
  priest: Object.freeze({
    key: "priest",
    label: "Priest",
    tradition: "divinity",
    style: "list",
    dailyCantrips: 2,
    printed: "You can prepare and cast two cantrips from the divinity spell list each day."
  })
});

/*
 * THERE IS NO `ARCHETYPE_CASTING_KEYS` HERE, and 3.384.0 removed it.
 * It was `Object.freeze(Object.keys(ARCHETYPE_CASTING))` exported, and
 * in the whole system nothing ever read it — everything that wants the
 * archetypes walks `ARCHETYPE_CASTING` itself, which is also where the
 * labels and traditions they need alongside the key live. A derived
 * export nobody derives anything from is a second name for a fact, and
 * §5.1's "a rule with no caller is not automation" applies to
 * vocabulary as much as to rules.
 */

/**
 * Why an archetype caster's caster level reads zero, or "" when it does
 * not read zero.
 *
 * NEW at 3.385.0, and it exists because the fix that release makes is
 * one a player will otherwise report as a bug. An Arcanist opens their
 * sheet, sees **Caster Level 0** beside a list of cantrips they can
 * demonstrably cast, and has no way to tell a deliberate rule from a
 * broken derivation. That is the anti-silence rule exactly: the system
 * knows why the number is zero and should say so.
 *
 * THE LINKED FEAT IS LOOKED UP, NOT LISTED. Which Class feat grants the
 * caster level depends on the archetype's tradition, and both halves of
 * that pairing already exist — `ARCHETYPE_CASTING` here and
 * `KNIGHT_CASTING` in feat-casting.mjs. The caller passes the knight
 * table in rather than this module importing it, because
 * feat-casting.mjs is the larger, more-depended-on file and a new edge
 * from here to there buys nothing a parameter does not.
 *
 * @param {object} archetype One entry of `ARCHETYPE_CASTING`.
 * @param {object} options
 * @param {string} [options.casterLevelSource] `magic.casterLevelSource`.
 * @param {object} [options.knightTable] `KNIGHT_CASTING`, for naming the
 *   feat that would grant one.
 * @returns {string} A sentence, or "" when there is nothing to explain.
 */
export function archetypeCasterLevelNote(archetype, { casterLevelSource = "", knightTable = {} } = {}) {
  // ONLY "none" EARNS A NOTE. A source of "class", "feat" or "override"
  // means the character HAS a caster level, and explaining an absence
  // that is not there would be worse than silence.
  if (String(casterLevelSource ?? "").trim().toLowerCase() !== "none") return "";
  const tradition = String(archetype?.tradition ?? "").trim().toLowerCase();
  if (!tradition) return "";
  const linked = Object.values(knightTable ?? {})
    .find((entry) => String(entry?.tradition ?? "").trim().toLowerCase() === tradition);
  const label = archetype?.label ?? "This archetype";
  return linked?.label
    ? `${label} grants cantrips and a BSB, not a caster level — take ${linked.label} for that.`
    : `${label} grants cantrips and a BSB, not a caster level.`;
}

/** Look one up by the feat's name, however it is cased or spaced. */
export function archetypeCastingByName(name) {
  const key = String(name ?? "").trim().toLowerCase();
  return ARCHETYPE_CASTING[key] ?? null;
}

/* ------------------------------------------------------------------ */
/* Which sources a character actually has                              */
/* ------------------------------------------------------------------ */

/**
 * The caster-archetype sources this character holds, as feats.
 *
 * TYPE-CHECKED, not name-checked alone. "Priest" is a plausible name for
 * an NPC's ability, a background or a class, and any of those matching
 * would give a Cleric a second divinity cantrip pool out of nowhere.
 *
 * @param {Array<{type: string, name: string, id?: string}>} items
 * @returns {Array<object>} entries from ARCHETYPE_CASTING, plus `itemId`
 */
export function archetypeCastingSources(items) {
  const out = [];
  const seen = new Set();
  for (const item of items ?? []) {
    if (item?.type !== "feat") continue;
    const entry = archetypeCastingByName(item?.name);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push({ ...entry, itemId: item.id ?? null });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* The pools                                                           */
/* ------------------------------------------------------------------ */

/**
 * The flag a spell item carries to say which pool it belongs to.
 *
 * One flag with two fields rather than four booleans: a cantrip can only
 * ever be in one pool of one source, and a shape that cannot express
 * "in two pools at once" is a shape that cannot drift into it.
 *
 * `kind` is "book" (an Arcanist's permanent four), "known" (a Gleeman's
 * permanent two) or "daily" (prepared this morning, discarded on the
 * next re-pick).
 */
export const ARCHETYPE_CANTRIP_FLAG = "archetypeCantrip";

/** Read the marker off a spell item, or null. */
export function archetypeCantripMark(item) {
  const mark = item?.flags?.[SYSTEM_ID]?.[ARCHETYPE_CANTRIP_FLAG];
  if (!mark) return null;
  const source = String(mark.source ?? "").trim().toLowerCase();
  const kind = String(mark.kind ?? "").trim().toLowerCase();
  if (!ARCHETYPE_CASTING[source]) return null;
  if (!["book", "known", "daily"].includes(kind)) return null;
  return { source, kind };
}

/**
 * The cantrips one source currently holds — permanent, and today's.
 *
 * THE ARCANIST'S TWO TIERS ARE ONE LIST OF ITEMS, not two.
 *
 * The first build gave the spellbook four items and then COPIED two of
 * them to represent today's prepared pair. It failed the pack-copy
 * harness, and it deserved to: an Arcanist who prepared Light would have
 * had Light on their sheet twice, which is precisely the complaint
 * Graham raised about racial abilities the same morning.
 *
 * So preparation flips `system.prepared` on the book entry itself. That
 * is not a convenience — it is what the field MEANS. A learned caster's
 * cast gate already refuses an unprepared spell, so a Cleric who takes
 * Arcanist gets the rule enforced for free, and a book entry that is not
 * prepared reads correctly everywhere else on the sheet.
 *
 * The Animist and the Priest have no permanent tier at all, so their two
 * are created fresh each time and simply deleted when cleared.
 *
 * @param {Array<object>} items the actor's items
 * @param {string} sourceKey
 * @returns {{permanent: object[], daily: object[]}}
 */
export function archetypeCantrips(items, sourceKey) {
  const wanted = String(sourceKey ?? "").trim().toLowerCase();
  const permanent = [];
  const daily = [];
  for (const item of items ?? []) {
    if (item?.type !== "spell") continue;
    const mark = archetypeCantripMark(item);
    if (!mark || mark.source !== wanted) continue;
    if (mark.kind === "daily") {
      daily.push(item);
      continue;
    }
    permanent.push(item);
    // A "book" entry is also today's if it has been prepared. A "known"
    // entry — the Gleeman's — never is: they cast at will, and counting
    // one as prepared would put a Prepare button on a card that must
    // not have one.
    if (mark.kind === "book" && item?.system?.prepared) daily.push(item);
  }
  return { permanent, daily };
}

/**
 * What one source owes and what it has — the numbers the card shows.
 *
 * The permanent pool and the daily pool are reported separately because
 * they are separately spendable: an Arcanist with four in the book and
 * none prepared has nothing to cast today, which a single "4/4" would
 * hide completely.
 *
 * @param {object} source an ARCHETYPE_CASTING entry
 * @param {{book?: object[], known?: object[], daily?: object[]}} held
 */
export function archetypeCantripState(source, held = {}) {
  const count = (list) => (Array.isArray(list) ? list.length : 0);
  const permanentAllowed = Math.max(
    0,
    Math.floor(Number(source?.bookCantrips ?? source?.knownCantrips ?? 0) || 0)
  );
  const permanentPicked = count(held.permanent);
  const dailyAllowed = Math.max(0, Math.floor(Number(source?.dailyCantrips ?? 0) || 0));
  const dailyPicked = count(held.daily);
  return {
    permanentAllowed,
    permanentPicked,
    permanentRemaining: Math.max(0, permanentAllowed - permanentPicked),
    dailyAllowed,
    dailyPicked,
    dailyRemaining: Math.max(0, dailyAllowed - dailyPicked),
    // A Gleeman never prepares, so their card must not offer to.
    prepares: dailyAllowed > 0,
    // An Animist picks from the whole list; an Arcanist picks from a book
    // they must fill first.
    preparesFromBook: source?.style === "book"
  };
}

/* ------------------------------------------------------------------ */
/* Eligibility                                                         */
/* ------------------------------------------------------------------ */

/**
 * May this pack spell be taken by this source?
 *
 * PP 0 IS THE DEFINITION OF A CANTRIP here, and `?? -1` rather than
 * `?? 0` so a spell with no cost recorded is never mistaken for one.
 *
 * A SPELL'S TRADITION IS A LIST. Guidance ships as "divinity, ethereal,
 * verdant"; comparing the whole string would make every multi-tradition
 * cantrip invisible to every source, which reads as a thin compendium
 * rather than as a bug.
 *
 * AN EMPTY TRADITION BELONGS TO NOBODY. 106 spells in the pack carry
 * one, and the temptation is to read "no tradition printed" as "any
 * tradition" — which would offer all 106 to all four archetypes. The
 * list is emptied by `filter(Boolean)` and an empty list contains
 * nothing, so the refusal falls out of the membership test rather than
 * needing a guard of its own. (`repertoire.mjs`'s `spellShapeMatches`
 * takes the OTHER reading deliberately, for leveled spells; the two are
 * not in conflict, but they are not interchangeable either.)
 *
 * SPECIALIST SPELLS ARE EXCLUDED, as they are from the repertoire and
 * the known-cantrip pool: a free pick must not take what a class,
 * heritage or school is meant to grant.
 */
export function archetypeCantripEligible(spell, source) {
  if (Number(spell?.ppCost ?? -1) !== 0) return false;
  if (spell?.specialist) return false;
  const wanted = String(source?.tradition ?? "").trim().toLowerCase();
  if (!wanted) return false;
  const printed = String(spell?.tradition ?? "")
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return printed.includes(wanted);
}

/*
 * `archetypeCantripCastBlocked` LIVED HERE UNTIL 3.348.0. It existed only
 * because `canCastSpell` waved non-learned casters through, so a Fighter
 * who took Arcanist could cast all four spellbook cantrips when the page
 * grants two a day. Both were the same question asked about different
 * pools; `spell-availability.mjs` asks it once.
 */

/** The label to show for a source's tradition, e.g. "Verdant". */
export function archetypeTraditionLabel(source) {
  const key = String(source?.tradition ?? "").trim().toLowerCase();
  return TRADITIONS[key]?.label ?? key;
}

/** The ability a source's tradition runs on, from config. */
export function archetypeAbility(source) {
  const key = String(source?.tradition ?? "").trim().toLowerCase();
  return TRADITIONS[key]?.ability ?? null;
}

/**
 * Which ability THIS archetype cantrip should be cast off.
 *
 * Graham's ruling, 20 August 2026: the tradition's own ability. Returns
 * null when nothing should change — an ordinary spell, or an archetype
 * whose tradition happens to run on the ability the character already
 * casts with — so a caller can tell "no swap" from "swap to the ability
 * that happens to match", which is the distinction
 * `spellcraftAbilityFor` records for granted traditions.
 *
 * PER SPELL, not per character, for the same reason that one is: a
 * Cleric who takes Arcanist casts their divinity spells off Wisdom and
 * their arcane cantrips off Intelligence, and a single field on the
 * sheet cannot hold both.
 *
 * @param {object} item a spell item
 * @param {string} ownCastingAbility the character's usual one
 * @returns {string|null} an attribute key, or null
 */
export function archetypeSpellcraftAbility(item, ownCastingAbility) {
  const mark = archetypeCantripMark(item);
  if (!mark) return null;
  const ability = archetypeAbility(ARCHETYPE_CASTING[mark.source]);
  if (!ability) return null;
  return ability === String(ownCastingAbility ?? "").trim().toLowerCase() ? null : ability;
}

/*
 * `archetypeSheetTradition` stood here for several releases with no
 * caller — it derived the tradition to SHOW on the sheet for a character
 * with no caster class. Deleted at 3.369.0; the cast-time behaviour it
 * was meant to complement is wired and stays (`archetypeSpellcraftAbility`
 * in cast-workflow).
 *
 * ITS ONE DECISION IS KEPT HERE, because it would otherwise have to be
 * made again: a character holding TWO of the four casting archetypes has
 * two traditions and two abilities, and the sheet has one line for each.
 * Picking one would quietly make half their cantrips wrong. So nothing is
 * derived for that case — their own field stands. Any future sheet work
 * has to answer this before it can display anything.
 */
/* ------------------------------------------------------------------ */
/* The BSB, as a floor rather than an addition                         */
/* ------------------------------------------------------------------ */

/**
 * How much BSB this archetype still owes.
 *
 * THE RULING, Graham, 20 August 2026: *"the BSB modifier should only be
 * applied if the character does not already have a higher BSB."*
 *
 * So "you gain a BSB equal to half your level" is a FLOOR, not a
 * stacking bonus. A 10th-level Fighter taking Priest goes from 0 to 5. A
 * 10th-level Cleric taking Arcanist, whose class table already gives
 * more than 5, gains nothing at all — and if their class BSB later
 * overtakes the floor, reconciliation takes the archetype's contribution
 * back off rather than leaving it stacked underneath.
 *
 * WHAT COUNTS AS "ALREADY HAVE". The sheet's BSB is the class table's
 * `progression.bsb` plus the player's own `magic.bsb` field, and both are
 * the character's BSB — so both count. THIS grant's own past
 * contribution is subtracted out first, or the floor would read its own
 * work as somebody else's and immediately give it all back.
 *
 * @param {object} args
 * @param {number} args.level character level
 * @param {number} args.classBSB `system.progression.bsb`
 * @param {number} args.ownFieldBSB the STORED `system.magic.bsb`
 * @param {number} args.alreadyGranted what this grant has recorded
 * @returns {number} the amount this grant should be contributing now
 */
export function archetypeBSBDue({
  level = 0,
  classBSB = 0,
  ownFieldBSB = 0,
  alreadyGranted = 0
} = {}) {
  const half = Math.floor(Math.max(0, Number(level) || 0) / 2);
  const withoutThisGrant =
    (Number(classBSB) || 0) + ((Number(ownFieldBSB) || 0) - (Number(alreadyGranted) || 0));
  return Math.max(0, half - withoutThisGrant);
}
