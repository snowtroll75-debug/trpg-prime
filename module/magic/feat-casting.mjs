/**
 * FEAT-GRANTED SPELL SLOTS — the Knight feats and the caster-tier feats.
 *
 * Sits beside `archetype-casting.mjs`, which does the same job for the
 * four caster archetypes' CANTRIPS. This file is the levelled half:
 * spells that cost PP, granted by a feat rather than by a class.
 *
 * Graham, 20 August 2026, on driving 3.344.1: *"have a look at the other
 * caster feats that bolt onto these archetypes"*.
 *
 * WHAT DRIVING THEM FOUND. All four Knight feats — Arcane Knight, Divine
 * Knight, Noble Warrior, Primal Defender — set no tradition at all, so:
 *
 *   - the casting ability fell back to the SCHEMA DEFAULT of
 *     Intelligence. A Divine Knight with Wisdom +4 and Intelligence −1
 *     rolled Spellcraft at −1 rather than +4, five points out, silently,
 *     on every check. Arcane Knight escaped only because the default
 *     happens to be its own ability.
 *   - caster level fell back to CHARACTER level. All four print "a
 *     caster level equal to half your level (round up)", and a 10th
 *     level Arcane Knight resolved to 10, five levels above what the
 *     feat grants. Their own notes admitted it — "set this yourself" —
 *     and nothing stopped a player who did not.
 *   - the PP 2 spell each one grants was "add it by hand; nothing grants
 *     it", and the caster-tier feats' slots existed in the data with no
 *     card to reach them, because every memorisation pool in the system
 *     reads off the CLASS item.
 *
 * A SLOT IS A THING, NOT A NUMBER. The obvious model is one counter per
 * tradition, but the feats do not grant interchangeable slots: a Knight
 * grants exactly one at PP 2, while a caster-tier feat grants several
 * capped by caster level instead ("You still cannot cast spells above
 * your caster level"). Summing them into one number and picking a single
 * cap would either forbid a legal spell or permit an illegal one, and
 * neither shows on screen. So each slot is an entry that remembers which
 * feat granted it and what that feat's ceiling is — which is also how
 * the book puts it: *"Each time you are granted a new spell slot."*
 *
 * CASTER LEVEL IS A FLOOR (Graham's ruling, 20 August 2026), matching
 * the BSB ruling he gave for the archetypes an hour earlier — the two
 * sentences are printed side by side in the same paragraph.
 *
 * NO FOUNDRY, so the harness can drive every rule here.
 */

import { TRADITIONS } from "../config.mjs";
import { maxPPPerCast } from "./casting.mjs";
import { CASTER_TIER_FEATS, casterTierSlots, tierSlots } from "./caster-tier-feats.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * The four Knight feats.
 *
 * One shape, four traditions, and each prints the same three clauses: a
 * caster level of half your level (round up), low PP at 1 per level (a
 * stored-delta grant that already worked), and one PP 2 spell of the
 * feat's tradition.
 *
 * The PP 2 ceiling is printed, not derived — "You may now memorise and
 * cast a PP 2 arcane spell" — so it is written here rather than computed
 * from caster level, which would drift upward as the character levelled.
 */
export const KNIGHT_CASTING = Object.freeze({
  "arcane knight": Object.freeze({
    key: "arcane knight", label: "Arcane Knight", tradition: "arcane", slots: 1, maxPP: 2
  }),
  "divine knight": Object.freeze({
    key: "divine knight", label: "Divine Knight", tradition: "divinity", slots: 1, maxPP: 2
  }),
  "noble warrior": Object.freeze({
    key: "noble warrior", label: "Noble Warrior", tradition: "ethereal", slots: 1, maxPP: 2
  }),
  "primal defender": Object.freeze({
    key: "primal defender", label: "Primal Defender", tradition: "verdant", slots: 1, maxPP: 2
  })
});

/*
 * `KNIGHT_CASTING_KEYS` stood here until 3.384.0, and went for the
 * reason its twin in archetype-casting.mjs went: the keys of the table
 * above, exported, and read by nothing. `knightCastingSources` matches
 * against the table itself.
 */

/** Look one up by feat name, however cased. */
export function knightCastingByName(name) {
  return KNIGHT_CASTING[String(name ?? "").trim().toLowerCase()] ?? null;
}

/**
 * The Knight feats this character holds.
 *
 * TYPE-CHECKED like the archetypes': "Divine Knight" is a plausible name
 * for an NPC ability or a class, and either matching would hand a
 * character a divinity spell slot out of nowhere.
 */
export function knightCastingSources(items) {
  const out = [];
  const seen = new Set();
  for (const item of items ?? []) {
    if (item?.type !== "feat") continue;
    const entry = knightCastingByName(item?.name);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push({ ...entry, itemId: item.id ?? null });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Caster level                                                        */
/* ------------------------------------------------------------------ */

/** "a caster level equal to half your level (round up)". */
export function knightCasterLevel(level) {
  return Math.ceil(Math.max(0, Number(level) || 0) / 2);
}

/**
 * The caster level a character should actually resolve to.
 *
 * A CASTER LEVEL IS EARNED, NOT ASSUMED (Graham's ruling, 24 August
 * 2026: *"Fighters and Rogues have no caster level"*). Three ways to
 * earn one — a casting class's table, a Knight feat, or a GM's manual
 * override — and everybody else has none.
 *
 *   A CLASS CASTER who takes a Knight feat keeps their class caster
 *   level when it is higher: the feat is a floor, not a replacement, so
 *   taking it can never cost a Cleric caster levels.
 *
 *   A NON-CASTER who takes one casts at half their level.
 *
 *   EVERYBODY ELSE IS ZERO, and 3.385.0 changed that. It used to be
 *   CHARACTER LEVEL.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT THE OLD FALLBACK COST
 *
 * The archetype casting feats — Arcanist, Animist, Gleeman, Priest —
 * grant cantrips and a BSB, NOT a caster level; the linked Class feat
 * (Arcane Knight and its three siblings) is what grants one. Nothing
 * here consulted them, so an Arcanist fell through to the fallback and a
 * 10th-level one cast their cantrips at CASTER LEVEL 10 — every
 * caster-level modification on the cantrip scaling as though a full
 * 10th-level caster had cast it.
 *
 * Driven live at 3.384.0, an Arcanist and a plain Fighter of the same
 * level resolved IDENTICALLY, which is the tell: the archetype was never
 * being read at all. I reported that row as correct in the live-testing
 * report and Graham caught it.
 *
 * MYSTICAL CONDUIT WAS THE SAME BUG WEARING A DIFFERENT HAT.
 * `spell-effects.mjs` heals the recipient *"an additional amount of Hit
 * Points equal to half your caster level"* and its own comment says *"a
 * non-caster gains nothing"* — while the fallback handed a 10th-level
 * Fighter half of 10. The comment described this rule before the code
 * did.
 *
 * AND THE FALLBACK WAS ALREADY REDUNDANT FOR THE CASE IT PROTECTED. It
 * was kept *"rather than pinning a Fighter to caster level 0"*, the
 * worry being innate spell-likes — a Fighter's item, a monster's ability,
 * a Druid's Wild Shape spell. Every one of those takes CHARACTER level
 * explicitly and always did: `cast-workflow.mjs` branches
 * `isInnate ? characterLevel` before reading this at all, and
 * `innateWarpBudget` takes the character's level by name. The fallback
 * was guarding a door that has its own lock.
 *
 * THE ESCAPE HATCH IS THE MANUAL OVERRIDE, unchanged: `magic.casterLevel`
 * still wins over everything, so a GM with a case the book does not
 * cover types a number in and it sticks.
 *
 * AND A CLASS THAT PRINTS A CASTER LEVEL IS NOT THE SAME AS A CLASS THAT
 * CASTS (3.558.0). Until the 3.8 rulebook revision the Fighter's and the
 * Rogue's tables printed "-" in that column, stored as null, and "is the
 * cell filled in" was a perfectly good stand-in for "does this class
 * cast". The revision prints 0 in all forty of those cells, and Graham's
 * ruling R1 made them real zeroes — so the stand-in is gone and the real
 * question has to be asked. `classCasts` is that question, and it is
 * asked HERE rather than by the caller passing a null it decided on,
 * because this is the one function that answers "what is this
 * character's caster level" and a caller making its own exception would
 * be a second place deciding it.
 *
 * `source: "none"` therefore still means what it has always meant — the
 * character has not earned a caster level — which is what keeps the
 * archetype note ("grants cantrips and a BSB, not a caster level") and
 * the sheet's manual override box on a Fighter.
 *
 * @param {object} args
 * @param {number} args.level character level
 * @param {number|null} args.classCasterLevel the class table's, or null
 * @param {boolean} [args.classCasts] whether the class casts at all —
 *   false for the Fighter and the Rogue, whose tables now print 0
 * @param {boolean} args.hasKnightFeat
 * @returns {{value: number, source: "class"|"feat"|"none"}} `source` is
 *   "none" when the character has not earned one — distinct from a
 *   casting class's table that genuinely prints 0, so the sheet can tell
 *   them apart.
 */
export function resolvedCasterLevel({
  level = 0, classCasterLevel = null, classCasts = true, hasKnightFeat = false
} = {}) {
  const characterLevel = Math.max(0, Math.floor(Number(level) || 0));
  const floor = hasKnightFeat ? knightCasterLevel(characterLevel) : 0;
  if (classCasts && classCasterLevel !== null && classCasterLevel !== undefined) {
    const fromClass = Math.max(0, Math.floor(Number(classCasterLevel) || 0));
    return floor > fromClass
      ? { value: floor, source: "feat" }
      : { value: fromClass, source: "class" };
  }
  if (hasKnightFeat) return { value: floor, source: "feat" };
  return { value: 0, source: "none" };
}

/* ------------------------------------------------------------------ */
/* The slots themselves                                               */
/* ------------------------------------------------------------------ */

/** The flag a spell item carries to say which slot it fills. */
export const FEAT_SLOT_FLAG = "featSpellSlot";

/** Read the marker off a spell item, or null. */
export function featSlotMark(item) {
  const mark = item?.flags?.[SYSTEM_ID]?.[FEAT_SLOT_FLAG];
  if (!mark) return null;
  const slotId = String(mark.slotId ?? "").trim();
  const tradition = String(mark.tradition ?? "").trim().toLowerCase();
  if (!slotId || !TRADITIONS[tradition]) return null;
  return { slotId, tradition };
}

/**
 * Every feat-granted levelled slot this character has, in a stable order.
 *
 * STABLE, because a slot's id is what a filled spell remembers. Ordering
 * by tradition and then by the granting feat means a slot keeps its id
 * as the character levels and more slots appear beside it — if ids
 * shuffled, a spell would silently change which slot it occupied and
 * which ceiling applied to it.
 *
 * TAKES ITEMS, NOT NAMES, so a Knight slot can record which feat item
 * granted it — that provenance is what makes deleting the feat take its
 * spell down with it through the ordinary grant-cleanup chain.
 *
 * @param {object} args
 * @param {Array<{type: string, name: string, id?: string}>} args.items
 * @param {number} args.level
 * @param {number} args.casterLevel the RESOLVED caster level
 * @param {string} args.ownTradition so caster-tier feats exclude it
 * @returns {Array<{id, tradition, label, grantedBy, featItemId, maxPP}>}
 */
export function featSpellSlots({ items = [], level = 0, casterLevel = 0, ownTradition = "" } = {}) {
  const slots = [];
  const featNames = (items ?? []).filter((i) => i?.type === "feat").map((i) => i.name);

  // The Knight feats: one slot each, at the PP 2 the page prints.
  for (const source of knightCastingSources(items)) {
    for (let i = 0; i < source.slots; i += 1) {
      slots.push({
        id: `${source.key}:${i}`,
        tradition: source.tradition,
        label: TRADITIONS[source.tradition]?.label ?? source.tradition,
        grantedBy: source.label,
        featItemId: source.itemId ?? null,
        maxPP: source.maxPP
      });
    }
  }

  // The caster-tier feats: several slots, capped by CASTER LEVEL rather
  // than a printed number — "You still cannot cast spells above your
  // caster level" is the sentence that governs them, and it is printed
  // once under Minor Verdant Caster for the whole family.
  const tierCap = maxPPPerCast(casterLevel);
  const own = String(ownTradition ?? "").trim().toLowerCase();
  const byTradition = casterTierSlots(featNames, level);
  for (const tradition of Object.keys(byTradition).sort()) {
    // A caster-tier feat naming the character's OWN tradition grants
    // nothing — the printed note is explicit that these are a DIFFERENT
    // tradition. `grantedTraditions` already applies that rule; it is
    // applied here too because this list is built from the raw counts.
    if (tradition === own) continue;
    for (let i = 0; i < byTradition[tradition]; i += 1) {
      slots.push({
        id: `tier:${tradition}:${i}`,
        tradition,
        label: TRADITIONS[tradition]?.label ?? tradition,
        grantedBy: "Caster feats",
        maxPP: tierCap
      });
    }
  }

  return slots;
}

/**
 * Caster-tier feats that granted NOTHING because they name the
 * character's own class tradition.
 *
 * SILENCE IS THE DEFECT THIS CLOSES. The exclusion is correct — the
 * printed note is explicit that these grant a different tradition — but
 * a Wizard who takes Minor Arcane Caster gets a feat that does nothing,
 * with nothing on screen to say why. That silence is exactly how the
 * archetype-tradition version of this bug survived a whole release:
 * twelve feats granting zero slots, and no card anywhere.
 *
 * @param {Array<{type: string, name: string}>} items
 * @param {number} level
 * @param {string} ownTradition the CLASS's
 * @returns {Array<{name: string, tradition: string, slots: number}>}
 */
export function suppressedTierFeats(items, level, ownTradition) {
  const own = String(ownTradition ?? "").trim().toLowerCase();
  if (!own) return [];
  const featNames = (items ?? []).filter((i) => i?.type === "feat").map((i) => i.name);
  const byTradition = casterTierSlots(featNames, level);
  if (!byTradition[own]) return [];
  const out = [];
  for (const raw of featNames) {
    const entry = CASTER_TIER_FEATS[String(raw ?? "").trim().toLowerCase()];
    if (!entry || entry.tradition !== own) continue;
    const slots = tierSlots(entry.tier, level);
    if (slots > 0) out.push({ name: raw, tradition: own, slots });
  }
  return out;
}

/**
 * The slots, each paired with whatever is sitting in it.
 *
 * A spell whose slot no longer exists — the feat was removed, or a level
 * was lost — comes back as `orphaned` rather than being silently
 * dropped, so the card can say so instead of the spell quietly ceasing
 * to be castable with nothing on screen to explain it.
 *
 * @returns {{slots: Array, orphaned: Array}}
 */
export function featSlotState(slots, items) {
  const byId = new Map();
  const orphaned = [];
  for (const item of items ?? []) {
    if (item?.type !== "spell") continue;
    const mark = featSlotMark(item);
    if (!mark) continue;
    if (!slots.some((s) => s.id === mark.slotId)) {
      orphaned.push(item);
      continue;
    }
    // Two spells claiming one slot cannot both be right. The first wins
    // and the second is orphaned, so the count on the card can never
    // exceed the allowance the feats actually grant.
    if (byId.has(mark.slotId)) {
      orphaned.push(item);
      continue;
    }
    byId.set(mark.slotId, item);
  }
  return {
    slots: slots.map((s) => ({ ...s, filled: byId.get(s.id) ?? null })),
    orphaned
  };
}

/**
 * Attach the two notices — orphaned spells and suppressed feats — to the
 * card groups, making a group for them if there is none.
 *
 * PURE, AND SEPARATE FROM THE WORKFLOW, because the bug it fixes could
 * not be reached by a structural check. Driven live on 3.346.0: a
 * Cleric/Arcanist holding Magic Missile in a feat slot had Minor Arcane
 * Caster removed. The slot went, the spell stayed, and the card context
 * came back EMPTY — no card, no daily-preparation line, nothing. The
 * orphan report was guarded on there already being a group, so it fired
 * in every case except the one where the spell is most stranded.
 *
 * Both notices share one path so neither can grow that guard again, and
 * this lives here so the harness can drive it without Foundry.
 *
 * @param {Array<object>} groups the tradition groups, possibly empty
 * @param {Array<{id?: string, name: string, tradition?: string}>} orphaned
 * @param {Array<{name: string, tradition: string}>} suppressed
 * @returns {Array<object>} the same array, with notices attached
 */
export function attachSlotNotices(groups, orphaned = [], suppressed = []) {
  const out = Array.isArray(groups) ? groups : [];
  const noticeGroup = (tradition) => {
    if (out.length) return out[0];
    const made = {
      tradition: tradition ?? "",
      label: TRADITIONS[tradition]?.label ?? tradition ?? "",
      slots: [], total: 0, filled: 0, empty: 0
    };
    out.push(made);
    return made;
  };
  if (orphaned.length) {
    noticeGroup(orphaned[0]?.tradition).orphaned =
      orphaned.map((i) => ({ id: i.id ?? null, name: i.name }));
  }
  if (suppressed.length) {
    noticeGroup(suppressed[0].tradition).suppressed = suppressed;
  }
  return out;
}

/**
 * May this pack spell go in this slot?
 *
 * PP 1 UPWARDS — a cantrip is PP 0 and belongs to the archetype pools,
 * not here. A slot that accepted one would let a Knight spend their only
 * levelled slot on something the Gleeman beside them gets for free.
 */
export function featSlotEligible(spell, slot) {
  const pp = Number(spell?.ppCost ?? -1);
  if (!Number.isFinite(pp) || pp < 1) return false;
  if (pp > Math.max(0, Number(slot?.maxPP) || 0)) return false;
  if (spell?.specialist) return false;
  const wanted = String(slot?.tradition ?? "").trim().toLowerCase();
  if (!wanted) return false;
  const printed = String(spell?.tradition ?? "")
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return printed.includes(wanted);
}

/**
 * Which ability a feat-slot spell is cast off.
 *
 * The slot's own tradition, exactly as an archetype cantrip uses its
 * archetype's. A Divine Knight casts their divinity spell off Wisdom
 * whatever the rest of their sheet says — which is the whole reason
 * this file exists.
 */
export function featSlotSpellcraftAbility(item, ownCastingAbility) {
  const mark = featSlotMark(item);
  if (!mark) return null;
  const ability = TRADITIONS[mark.tradition]?.ability ?? null;
  if (!ability) return null;
  return ability === String(ownCastingAbility ?? "").trim().toLowerCase() ? null : ability;
}

/**
 * The tradition and ability a sheet with no caster class should show.
 *
 * ONE TRADITION ACROSS EVERY FEAT SOURCE, archetypes and Knights
 * together. The sheet has a single Spellcraft line and a single casting
 * ability, so it can be honest for a Fighter/Gleeman or a
 * Fighter/Divine Knight — and cannot be for a character holding two
 * feat traditions at once. Two means nothing is derived, their own field
 * stands, and the per-spell swap does the real work at cast time.
 *
 * Counted by TRADITION rather than by source, so a Priest who also takes
 * Divine Knight — both divinity — still gets an honest sheet. That pair
 * is the obvious build, and refusing it because it is "two sources"
 * would be an accident of the implementation rather than a rule.
 *
 * Returns null whenever a class supplies either, so a Cleric who takes
 * Arcanist stays a divinity caster on Wisdom.
 *
 * @param {Array<object>} archetypeSources from `archetypeCastingSources`
 * @param {Array<object>} knightSources from `knightCastingSources`
 * @param {{tradition?: string, magicalAbility?: string}} progression
 * @returns {{tradition: string, ability: string}|null}
 */
export function featSheetTradition(archetypeSources, knightSources, progression = {}) {
  if (progression?.tradition || progression?.magicalAbility) return null;
  const traditions = new Set();
  for (const s of [...(archetypeSources ?? []), ...(knightSources ?? [])]) {
    if (s?.tradition) traditions.add(String(s.tradition).trim().toLowerCase());
  }
  if (traditions.size !== 1) return null;
  const [tradition] = Array.from(traditions);
  const ability = TRADITIONS[tradition]?.ability ?? null;
  if (!ability) return null;
  return { tradition, ability };
}

/**
 * The item data for a spell going into a feat slot.
 *
 * PURE, AND HERE RATHER THAN IN THE WORKFLOW, because every decision in
 * it is a rule: the slot's id and tradition are what make the spell
 * findable again, `prepared` is what lets a learned caster cast it, and
 * the provenance is what makes deleting the feat take the spell with it.
 * While it lived beside `game.packs` the harness could only assert that
 * the text was present — see `verify-driven-coverage.mjs` for why that
 * is not the same as testing it.
 *
 * @param {object} data the pack item's own data, already stamped
 * @param {object} slot the slot it is going into
 * @param {string} requested the pack entry's name, for the record
 */
export function featSlotSpellData(data, slot, requested) {
  return {
    ...data,
    // PREPARED, for the same reason every granted spell is: a learned
    // caster's cast gate refuses an unprepared spell, and a Cleric may
    // hold a Knight feat. The slot IS the memorisation here — there is
    // one of them and it holds one spell.
    system: { ...data?.system, prepared: true },
    flags: {
      ...data?.flags,
      [SYSTEM_ID]: {
        ...data?.flags?.[SYSTEM_ID],
        [FEAT_SLOT_FLAG]: { slotId: slot?.id, tradition: slot?.tradition },
        grantedBy: {
          sourceId: slot?.featItemId ?? null,
          sourceName: slot?.grantedBy,
          requested
        }
      }
    }
  };
}

/**
 * What daily preparation should say about the feat slots.
 *
 * Reported, not imposed — the same rule the class memorisation and the
 * archetype cantrips follow, because wiping a player's picks and making
 * them re-enter the same spell every session is a chore, not a rule.
 *
 * Pure, so the harness can drive the wording without an actor.
 */
export function featSlotPreparationLines(groups) {
  const lines = [];
  for (const g of groups ?? []) {
    for (const f of g?.suppressed ?? []) {
      lines.push(
        `<strong>${f.name}:</strong> grants nothing — caster feats grant a tradition ` +
        `DIFFERENT from your class's, and ${f.tradition} is already yours.`
      );
    }
    if (g?.orphaned?.length) {
      lines.push(
        `<strong style="color:#8a1c1c">${g.label} slots:</strong> ${g.orphaned.map((o) => o.name).join(", ")} ` +
        `no longer has a slot — the feat granting it was removed, so it cannot be cast.`
      );
    }
    if (!g?.total) continue;
    lines.push(g.empty
      ? `<strong>${g.label} spell slots:</strong> ${g.filled} of ${g.total} filled — ${g.empty} still to memorise on the Magic tab.`
      : `<strong>${g.label} spell slots:</strong> ${g.slots.map((s) => s.filledName).join(", ")}.`);
  }
  return lines;
}
