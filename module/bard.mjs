/**
 * The Bard's derived abilities (Chapter 3).
 *
 * Song & Dance is arithmetic on data already on the sheet, so it lives
 * here as a pure function the harness can run without a Foundry actor —
 * the same split the Crusader and the divine aspects use.
 *
 * Bardic Performance (1st) is three player-driven options a day, spent
 * from one shared Cha+1 pool:
 *
 *   1. Assign a temporary conviction point to a spell target when
 *      casting a composition-trait spell. Automated in 3.309.0 — offered
 *      in the pre-cast dialog beside option 2, and reclaimed when the
 *      spell ends unless it was spent. See temporaryConvictionExpiry.
 *   2. Roll Perform in place of Spellcraft when casting a
 *      composition-trait spell — wired into
 *      module/magic/cast-workflow.mjs's pre-cast dialog.
 *   3. Roll Perform in place of one of six named social actions
 *      (Aggravate, Create a Diversion, Feint, Encourage, Make an
 *      Impression, Demoralise) — wired into the Perform skill panel via
 *      bardicPerformanceActions below, the same "extra action from this
 *      skill" mechanism SKILL_SUBSTITUTION_FEATS already uses for
 *      Impressive Performance and kin, except this one is USE-GATED
 *      (spends 1 of the day's Cha+1 uses) rather than always free, so it
 *      is kept as its own small registry rather than folded into that
 *      one — module/sheets/actor-sheet.mjs spends the use before calling
 *      resolveAction, mirroring Crusader's Mercy's spend-before-roll.
 *
 * Book of Notations (1st) is a daily-preparation choice that scales
 * every five levels — bookOfNotationsSlots below is the pure half; the
 * chooser and the daily-prep reminder live in feats-workflow.mjs and
 * uses-workflow.mjs, the same split Hunter's Method and Blade Ally use.
 */

/**
 * Bardic Performance's temporary-conviction-grant branch — "you may
 * assign a temporary conviction point to any one of the spell's
 * targets (excluding yourself). This conviction point remains for the
 * duration of the spell or until it is expended, whichever comes
 * first." Genuinely novel plumbing (a resource granted onto a
 * DIFFERENT actor than the one spending the ability's use, tracked
 * against a spell's own duration and separately against being spent) —
 * left unautomated this release rather than half-built against a
 * mechanism this pack doesn't yet have a precedent for. Flagged here,
 * not silently dropped; see release notes for the full reasoning.
 */
/**
 * The temporary conviction point Bardic Performance can assign.
 *
 * "Each time you cast a spell that has the composition trait, you may assign a
 * temporary conviction point to any one of the spells targets (excluding
 * yourself). This conviction point remains for the duration of the spell or
 * until it is expended, whichever comes first."
 *
 * This was flagged as NOT AUTOMATED for several releases, with a stated
 * reason: "a resource granted onto a DIFFERENT actor than the one spending the
 * ability's use, tracked against a spell's own duration and separately against
 * being spent" — no precedent existed for it. There is one now. Granted items
 * (3.307.0) already put a thing on an actor for a spell's duration and take it
 * away by every route the spell can end, and the only new question was how to
 * tell a point that expired from one that was spent.
 *
 * THE ANSWER IS A HIGH-WATER MARK. Record the pool immediately after the point
 * lands. On expiry, if the pool is still at least that high the point is
 * untouched and comes off; if it has fallen the point was spent and there is
 * nothing to reclaim. That reads correctly through any number of unrelated
 * gains and spends in between, because it asks about the level rather than
 * trying to track the identity of one interchangeable point.
 *
 * @param {number} pool The target's conviction now.
 * @param {number} granted The pool recorded when the point was assigned.
 * @returns {{reclaim: boolean, newValue: number}}
 */
export function temporaryConvictionExpiry(pool, granted) {
  const current = Math.max(0, Math.floor(Number(pool) || 0));
  const mark = Math.max(0, Math.floor(Number(granted) || 0));
  // Spent (or otherwise drained below the mark): nothing of ours is left.
  if (current < mark) return { reclaim: false, newValue: current };
  return { reclaim: true, newValue: Math.max(0, current - 1) };
}

/**
 * Who may receive it: "any one of the spells targets (excluding yourself)".
 *
 * @param {Actor[]} targets
 * @param {Actor} caster
 * @returns {Actor[]}
 */
export function convictionRecipients(targets = [], caster = null) {
  return Array.from(targets).filter((t) => t && t.id !== caster?.id);
}

/** Does this actor carry the named class ability (item type "ability")? */
export function hasClassAbility(actor, name) {
  const wanted = String(name).trim().toLowerCase();
  return Array.from(actor?.items ?? []).some(
    (item) => item.type === "ability" &&
      String(item.name).trim().toLowerCase() === wanted
  );
}

/** The Bardic Performance ability item itself, or null. */
export function bardicPerformanceItem(actor) {
  return Array.from(actor?.items ?? []).find(
    (item) => item.type === "ability" &&
      String(item.name).trim().toLowerCase() === "bardic performance"
  ) ?? null;
}

/**
 * "Each time you cast a spell that has the composition trait" — the
 * gate both Bardic Performance sub-options under casting share.
 */
export function hasCompositionTrait(spell) {
  return /\bcomposition\b/i.test(String(spell?.system?.traits ?? ""));
}

/**
 * The Perform-for-Spellcraft substitution's replacement modifier list:
 * the same shape cast-workflow.mjs already builds for the Spellcraft
 * total, but sourced from Perform instead. Pure, so the harness can
 * assert the swap without a live check roll.
 */
export function bardicPerformSpellcraftModifiers(performTotal) {
  return [{ label: "Perform (Bardic Performance)", value: Number(performTotal) || 0, type: "untyped" }];
}

/**
 * The six named social actions Bardic Performance may substitute
 * Perform for (registry keys, not display names — see
 * module/data/skill-actions.mjs).
 */
export const BARDIC_PERFORMANCE_ACTIONS = Object.freeze([
  "aggravate", "createADiversion", "feint", "encourage", "makeAnImpression", "demoralise"
]);

/**
 * The extra actions Bardic Performance opens from the Perform skill
 * panel — the same "extra action from this skill" idea
 * SKILL_SUBSTITUTION_FEATS/substituteSkillActions already offers for
 * Impressive Performance (feats.mjs), kept separate because this one is
 * USE-GATED rather than always free: module/sheets/actor-sheet.mjs
 * spends a Bardic Performance use before resolving whichever of these
 * gets picked, and refuses if none remain.
 *
 * @param {string} skillKey The skill panel being viewed.
 * @param {string[]} abilityNames The actor's ability item names.
 * @param {object[]} registry The full skill-action registry.
 */
export function bardicPerformanceActions(skillKey, abilityNames = [], registry = []) {
  if (skillKey !== "perform") return [];
  const has = abilityNames.some((n) => String(n).trim().toLowerCase() === "bardic performance");
  if (!has) return [];
  return BARDIC_PERFORMANCE_ACTIONS
    .map((key) => registry.find((a) => a.key === key))
    .filter(Boolean)
    .map((action) => ({ ...action, bardicPerformance: true }));
}

/**
 * Book of Notations (1st): "select any one spell... At 5th level and
 * then every 5 levels thereafter, you may select an additional spell."
 * 1 at 1st, +1 at 5th/10th/15th/20th — the same "flat count, +1 every N
 * levels" shape Wild Shape's uses ladder uses, just against a slot count
 * rather than a daily-uses maximum.
 */
export function bookOfNotationsSlots(level) {
  const value = Math.max(0, Math.floor(Number(level) || 0));
  return 1 + Math.floor(value / 5);
}

/**
 * Song & Dance (1st): "you always use one of your perform specialties
 * and this allows you to add your class bonus to all Spellcraft checks
 * and DC's."
 *
 * Typed `class`, which is what the book calls it, and contributed to
 * the POOL rather than written into the spellcraft `class` slot — the
 * slot is where flat class-typed bonuses from elsewhere land, and an
 * assignment there would eat them. Same reasoning as the class-skill
 * bonuses.
 *
 * The DC follows for free: the actor computes it as 10 + the resolved
 * total, so a bonus that reaches the total reaches the DC.
 *
 * NOT applied to Bardic Performance, which the ability's own last
 * sentence excludes. THE FIRST DRAFT OF THIS COMMENT SAID "that is a
 * different roll entirely, so nothing here has to exclude it" — true of
 * the roll and false of everything the bonus reaches. See
 * `withoutSongAndDance` below, and the correction at 3.443.3.
 */
export function songAndDanceModifier(actor, classBonus) {
  if (!hasClassAbility(actor, "song & dance")) return null;
  const value = Number(classBonus) || 0;
  if (!value) return null;
  return {
    label: "Song & Dance",
    value,
    type: "class",
    source: SONG_AND_DANCE_SOURCE
  };
}

/**
 * How Song & Dance's contribution is recognised in a bonus pool.
 *
 * A NAMED CONSTANT because two files now depend on the same word, and a
 * string typed twice is a rule that can be half-renamed.
 */
export const SONG_AND_DANCE_SOURCE = "songAndDance";

/**
 * The Spellcraft bonus pool as a BARDIC PERFORMANCE cast sees it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * "THE CLASS BONUS DOES NOT APPLY" — AND THAT IS NOT ONLY THE ROLL.
 *
 * Graham, quoting the book on 31 August 2026:
 *
 *   "SONG & DANCE ... you always use one of your perform specialties and
 *    this allows you to add your class bonus to all Spellcraft checks AND
 *    DC'S. ... Be aware that this only applies when casting spells using
 *    Spellcraft. If you are using Bardic Performance the Class bonus does
 *    not apply."
 *
 * Until 3.443.3 only the CHECK lost it, because a Bardic Performance cast
 * swaps the whole modifier list for one Perform entry and Song & Dance is
 * simply not in that list. Every number DERIVED from the Spellcraft bonus
 * kept it — and for a Specialist Spell the Save DC is
 * `max(10 + ability + level, 10 + spellcraft)`, so it kept it visibly.
 *
 * MEASURED, not reasoned about. Grokash Hervik (level 3, Cha +4,
 * Spellcraft 8 including Song & Dance +2) cast Cutting Words with Bardic
 * Performance in Graham's world. The check read "Perform (Bardic
 * Performance) Untyped +9" and nothing else — correct — and the card set
 * a Will save at **DC 18**. Without the class bonus the same formula
 * gives max(17, 16) = **17**.
 *
 * ONE VALUE RATHER THAN A LIST OF PLACES. "The class bonus does not
 * apply" is most honestly read as the bonus being absent from the
 * Spellcraft bonus for that cast, so the Save DC, the Disbelieve DC and
 * the specialist attack uplift all follow without each remembering to
 * subtract. The attack uplift is the one place that goes beyond the
 * printed words — an attack is neither a check nor a DC — and it is
 * noted here, in one place, so it is a one-line change if Graham reads
 * it the other way.
 *
 * FILTERING THE POOL RATHER THAN SUBTRACTING A NUMBER — and NOT because
 * subtraction is broken. The first draft of this comment claimed Song &
 * Dance was suppressible under highest-wins and that subtracting its
 * value could therefore take away a bonus that never applied. Appendix
 * 1's own table says `class` STACKS, and the check failed on that claim
 * before it shipped. The two methods agree today.
 *
 * The filter is chosen because it does not DEPEND on that agreement. It
 * asks the same resolver the same question with one entry gone, so it
 * stays right if `class` ever becomes a competing type — at which point
 * a subtraction would silently start removing the wrong amount. That is
 * driven in verify-song-and-dance §C through a type that does compete,
 * and the stacking rule itself is pinned there so the day it changes is
 * a failing check rather than a Bard's DC quietly moving.
 *
 * @param {object[]} pool the Spellcraft bonus pool
 * @returns {object[]} the same pool without Song & Dance's contribution
 */
export function withoutSongAndDance(pool = []) {
  return Array.from(pool ?? []).filter(
    (bonus) => String(bonus?.source ?? "") !== SONG_AND_DANCE_SOURCE
  );
}

/**
 * The spells a Bard may take into their Book of Notations, in the two
 * places the rule names them (3.326.0).
 *
 * > Each day during your daily preparation, you may select any one spell
 * > from your repertoire, OR ANY ONE ETHEREAL SPELL THAT YOU HAVE A
 * > SCROLL FOR, and cast it as a Specialist Spell until the following day.
 *
 * The second half sat unautomated for several releases behind a written
 * reason — "needs a scroll item and a scroll-to-spell resolution this pack
 * has nowhere at all (grep the whole of module/ for 'scroll' — nothing)".
 * THAT WAS WRONG WHEN IT WAS WRITTEN, and it was repeated to Graham on
 * 17 Aug 2026 as a finding without being checked. Scrolls were already
 * carried, priced, read, burned and learned from; `consumableSpellRef` has
 * resolved a scroll to its spell since 3.310.0. A stale comment became a
 * "missing subsystem" purely because nobody re-ran the grep.
 *
 * ETHEREAL ONLY, and read from the SPELL rather than the scroll. A scroll
 * is a sheet of parchment with a spell on it; the tradition belongs to the
 * spell. A spell on several lists (Alarm is on all four) counts as ethereal
 * because one of its traditions is — the rule asks for "an ethereal spell",
 * not "a spell that is only ethereal".
 *
 * THE SCROLL IS NOT SPENT. The rule says "that you have a scroll for": the
 * scroll is the reference you copy from during a morning's preparation, not
 * something cast. Nothing in Chapter 11's scroll text is triggered by
 * reading one for study — it is destroyed when the spell IS CAST from it,
 * which this is not. Flagged as an interpretation rather than a quotation,
 * in one place, so it is a one-line change if Graham rules otherwise.
 *
 * @param {object[]} items The actor's items.
 * @param {(item: object) => object|null} spellRefOf `consumableSpellRef`,
 *   injected so this stays a pure function a harness can drive.
 * @returns {{name: string, uuid: string, pp: number, scrollName: string}[]}
 */
export function scrollSpellCandidates(items = [], spellRefOf = () => null) {
  const seen = new Set();
  const out = [];
  for (const item of Array.from(items ?? [])) {
    if (item?.type !== "consumable") continue;
    const kind = String(item?.flags?.["trg-prime"]?.consumable?.kind ?? "").trim().toLowerCase();
    if (kind !== "scroll") continue;
    const ref = spellRefOf(item);
    if (!ref) continue;
    // ONE GUARD, NOT TWO. This used to read `if (!ref?.name) continue;` as
    // well, and that made a mutation of it EQUIVALENT: `!key` below already
    // rejects an empty name, so breaking the first test could not change a
    // single outcome. A duplicated rule is a rule that cannot be tested —
    // the same shape verify-forbidden-traditions found in its own early
    // return. The duplicate went; `!key` is the check that carries it.
    const key = String(ref.name ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({
      name: ref.name,
      uuid: ref.uuid ?? "",
      pp: Number(ref.pp) || 0,
      scrollName: item.name ?? ""
    });
  }
  return out;
}

/** Is this spell on the ethereal list at all? */
export function isEtherealSpell(spellData) {
  return String(spellData?.tradition ?? "")
    .split(/[,;]/)
    .map((t) => t.trim().toLowerCase())
    .includes("ethereal");
}
