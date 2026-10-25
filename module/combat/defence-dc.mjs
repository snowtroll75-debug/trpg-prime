/**
 * Bonuses a DEFENDER carries that raise the DC an attacker rolls against.
 *
 * THE GAP THIS FILLS, found in the Chapter 2 Dwarf audit on 3.318.1. The
 * Storgar heritage grants "a +2 racial bonus to all checks to resist being
 * shoved or moved involuntarily" — and there is no such check. Shove Attack
 * resolves against the defender's STATIC Fortitude DC (`against:
 * "fortitudeDC"` in basic-actions.mjs); the defender rolls nothing at all.
 * So the bonus had been authored as a conditional on a roll that never
 * happens: it could not auto-apply, and it could not even be offered as a
 * tick, because no dialog belonging to the defender ever opens.
 *
 * GRAHAM'S RULING, 16 August 2026: "The Storgar shove bonus should increase
 * their Fortitude DC to resist being shoved." So the bonus belongs on the
 * DC side, and this is the channel for it.
 *
 * WHY THIS IS NOT `conditionals.mjs`. That engine decorates a CHECK — it
 * answers "what modifies the roll I am about to make", and every axis it
 * scopes by (check type, subject, action, trait, tradition) is a fact about
 * the roller's own action. This answers a different question: "what does the
 * person I am rolling AGAINST bring to their own defence". The two look
 * similar and compose differently, and merging them would mean every
 * conditional has to declare which side of the roll it lives on. Kept apart
 * for the same reason `creatureTypesOf` and `isOfKind` are kept apart.
 *
 * SCOPING REUSES THE SAME VOCABULARY, deliberately — an entry names the
 * `actions` it defends against, so an author who has written a conditional
 * already knows how to write one of these.
 */

const SYSTEM_ID = "trg-prime";

import { activeStanceEffects, inAnyStance, stanceGatedRows } from "../stance-declarations.mjs";

/** The DCs a defender can raise. Matches ACTION_TARGETS' own names. */
export const DEFENCE_DC_KEYS = Object.freeze([
  "fortitudeDC", "reflexDC", "willDC", "attackDC", "defence"
]);

/*
 * AND A SKILL DC, AS OF 3.506.0 — Graham's ruling of 6 Sep 2026.
 *
 * "Any modifiers to Disguise should benefit the disguised character so
 * the DC required to pierce the disguise should be increased."
 *
 * SELF MIRAGE IS THE SAME SHAPE AS THE STORGAR SHOVE BONUS this file was
 * built for. It prints "+4 status bonus to Deception checks to prevent
 * others from seeing through your disguise" — and the disguised
 * character makes no such check. Pierce Disguise is the OBSERVER's Sense
 * Motive roll, declared `against: "skillDC:deception"`, so the number
 * that matters is a DC on the defender's sheet and nothing on the
 * defender's side ever rolls.
 *
 * It had been authored as a conditional scoped to the `disguise` action,
 * which is one of only two declared actions that is not a check at all —
 * so it was inert twice over: no roll to attach to, and the wrong side of
 * the roll besides.
 *
 * `resolveOneTarget` already parses `skillDC:<key>` and `defenceDCBonus`
 * already compares `entry.dc` against the action's own `against` string,
 * so accepting the same spelling here is the whole change: an entry
 * declaring `dc: "skillDC:deception"` meets `against: "skillDC:deception"`
 * with no new comparison anywhere.
 */
const SKILL_DC = /^skillDC:[A-Za-z][A-Za-z0-9]*$/;

/** Is this a DC a defender may raise? */
export function isDefendableDC(dc) {
  const key = String(dc ?? "").trim();
  return DEFENCE_DC_KEYS.includes(key) || SKILL_DC.test(key);
}

/**
 * A spell's `defenceDC` effect row, turned into an entry this file
 * accepts — or the sentence the card should print instead.
 *
 * NEW at 3.506.0, AND PURE ON PURPOSE. The applier's own version of this
 * was three `if` statements inside `spell-effects.mjs`, and the check
 * covering them asserted that their text appeared in the source file.
 * That is not a check: a mutation that changed `if (!dcActions.length)`
 * to `if (false)` left the sentence in place and survived. A guard whose
 * only witness is a grep for its own error message cannot be caught
 * being neutered — this system has now recorded that three times.
 *
 * So the decision lives here, where it can be run.
 *
 * @param {object} effect the authored spell effect row
 * @param {string} spellName for the refusal sentence
 * @param {number} extra warp bonus to fold into the value
 * @returns {{row: object|null, error: string|null}}
 */
export function defenceDCRowFrom(effect, spellName = "This spell", extra = 0) {
  const dc = String(effect?.dc ?? "").trim();
  if (!isDefendableDC(dc)) {
    return { row: null, error: `${spellName} names an unknown defended DC "${dc}".` };
  }
  const actions = (Array.isArray(effect?.actions) ? effect.actions : [])
    .map((a) => String(a ?? "").trim()).filter(Boolean);
  // A DC BONUS THAT NAMES NOTHING would raise that DC against every
  // action resolved against it, silently. Stone Shield's lesson, on the
  // other side of the roll.
  if (!actions.length) {
    return { row: null, error: `${spellName} raises a DC without naming what against — nothing applied.` };
  }
  const row = {
    dc,
    value: Math.trunc(Number(effect?.value ?? 0)) + Math.trunc(Number(extra) || 0),
    label: effect?.label || spellName,
    scope: String(effect?.scope ?? ""),
    when: { actions }
  };
  if (!normaliseDefenceDC(row, { id: "spell", name: spellName })) {
    return { row: null, error: `${spellName} declares a malformed DC bonus.` };
  }
  return { row, error: null };
}

/**
 * Validate and normalise one authored entry.
 *
 * Returns null rather than throwing for anything malformed, the same way
 * `normaliseConditional` does: a typo in one heritage's JSON should cost
 * that entry, not every action resolved against that character.
 *
 * @param {object} raw
 * @param {object} source {id, name}
 * @returns {object|null}
 */
export function normaliseDefenceDC(raw, source = {}, { stanceGated = false, fromStance = false } = {}) {
  if (!raw || typeof raw !== "object") return null;

  /*
   * A ROW THAT GIVES THE ATTACKER DISADVANTAGE (3.665.0; Graham's ruling of
   * 21 October 2026 on Inner Tempest's Tsuchi). "Advantage on checks to
   * avoid being knocked prone or moved against your will" has the Storgar
   * problem — the defender rolls nothing against a Shove or a Trip — and
   * the ruling puts it on the other side: "grant the check disadvantage".
   *
   * It moves no DC, so it may name `dc: "any"` (a Trip is rolled against
   * the higher of two DCs, and the ruling is about the check, not about
   * which DC it meets). It still has to be scoped, exactly as a value row.
   */
  const disadvantage = String(raw.kind ?? "").trim().toLowerCase() === "disadvantage";
  const dc = String(raw.dc ?? (disadvantage ? "any" : "")).trim();
  if (!(isDefendableDC(dc) || (disadvantage && dc === "any"))) return null;

  const value = disadvantage ? 0 : Math.trunc(Number(raw.value));
  // Zero is a no-op that would still print a line on the card.
  if (!disadvantage && (!Number.isFinite(value) || value === 0)) return null;

  const list = (value) => (Array.isArray(value) ? value : [])
    .map((a) => String(a ?? "").trim().toLowerCase())
    .filter(Boolean);
  const actions = list(raw.when?.actions);
  // WHO IS ATTACKING (3.321.0). Thengar's "+1 to your DB against the
  // attacks of creatures of the Undead Type" scopes by the ATTACKER
  // rather than by the action — it applies to every attack an undead
  // makes and to none that anybody else does. Same vocabulary as the
  // conditional engine's `sourceTypes` axis, added in the same release
  // for the save half of the same sentence.
  const sourceTypes = list(raw.when?.sourceTypes);
  // ONE NAMED ATTACKER (3.406.0). The other half of the same sentence
  // `conditionals.mjs` grew `sourceUuids` for: Forbidding Ward's "+1
  // status bonus to DB AND saving throws against the target enemy's
  // attacks". The saves live on the conditional side, DB lives here, and
  // the axis has to exist in both or the spell is half-implemented.
  //
  // NOT lower-cased — `list()` folds case and a Foundry uuid is
  // case-sensitive, so this reads the raw values. Folding it would make
  // the ward match nobody, silently.
  const sourceUuids = (Array.isArray(raw.when?.sourceUuids) ? raw.when.sourceUuids : [])
    .map((u) => String(u ?? "").trim())
    .filter(Boolean);
  // WHAT THE ATTACKER IS ALIGNED TO (3.446.0). Radiant Aegis grants
  // "+1 status bonus to DB against attacks made by creatures with an
  // opposing aura type to your own", and Graham's ruling of 31 August
  // 2026 settled that an aura type IS the Aligned trait.
  //
  // A THIRD AXIS RATHER THAN A NEW CHANNEL, because it is the same
  // question the other two ask — "what does this defender bring against
  // THIS attacker" — scoped by one more fact about the attacker. The
  // alternative was a parallel path for aura bonuses, and this file's own
  // header explains why that is the wrong shape: two places composing
  // differently for one question.
  //
  // THE TRAITS ARE THE CASTER'S OPPOSITES, RESOLVED AT THE CAST. The
  // spell says "opposing to YOUR OWN", so whose aura it is measured
  // against belongs to the moment of casting, not to a caster who may
  // since have died, left the scene, or changed form.
  const sourceAlignments = list(raw.when?.sourceAlignments);
  // WHAT THE ATTACKER IS, BY TRAIT (3.664.0). Spirit Stance's "+1 to DB
  // against spirits, incorporeal creatures…": spirit and incorporeal are
  // traits, so `sourceTypes` cannot name them.
  const sourceTraits = list(raw.when?.sourceTraits);
  // EVERYONE BUT ONE (3.668.0; Inner Tempest's Challenge): "a -2
  // circumstance penalty to DB against attacks made by all creatures other
  // than your challenged target". The named creature is excluded; every
  // other attacker, a nameless one included, meets the row. Case-sensitive,
  // as `sourceUuids` is.
  const notSourceUuids = (Array.isArray(raw.not?.sourceUuids) ? raw.not.sourceUuids : [])
    .map((u) => String(u ?? "").trim())
    .filter(Boolean);

  // NO UNSCOPED ENTRIES. An entry scoped by nothing would raise the DC
  // against everything that reads it, which is a different and much
  // larger claim than any rule in this chapter makes. `conditionals.mjs`
  // takes the same position and makes breadth opt in through `always`.
  //
  // EITHER axis satisfies it: Storgar names an action and no attacker,
  // Thengar names an attacker and no action, and both are properly
  // narrow. What is refused is an entry naming neither.
  //
  // A STANCE-GATED ROW (3.664.0) IS SCOPED BY ITS STANCE: Martial
  // Affinity's "+1 racial bonus to DB when in any combat stance" is read
  // only while a stance is up, which is the narrowing the rule asks for.
  if (!stanceGated && !actions.length && !sourceTypes.length && !sourceUuids.length && !sourceAlignments.length && !sourceTraits.length && !notSourceUuids.length) return null;

  return {
    dc,
    value,
    kind: disadvantage ? "disadvantage" : "modifier",
    actions,
    sourceTypes,
    sourceUuids,
    sourceAlignments,
    sourceTraits,
    notSourceUuids,
    // WHAT A STANCE GIVES (3.668.0): a row read only in a stance, or carried
    // by the stance's own effect. Formless Cut "ignores the target's active
    // stance or form bonuses".
    fromStance: Boolean(stanceGated || fromStance),
    label: String(raw.label ?? source.name ?? "Feature"),
    scope: String(raw.scope ?? ""),
    source: String(source.name ?? "")
  };
}

/**
 * Every defence-DC entry an actor carries.
 *
 * Read from items AND their transferred effects — the two homes
 * `collectConditionals` reads — so a temporary effect can grant one.
 *
 * @param {Actor} actor
 * @returns {object[]}
 */
export function collectDefenceDC(actor) {
  const found = [];
  const effects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);
  // WHILE IN A STANCE (3.664.0) — see stance-declarations.mjs.
  const stanced = inAnyStance(effects);
  const stanceEffects = new Set(activeStanceEffects(effects));
  const consider = (document) => {
    const declared = document?.flags?.[SYSTEM_ID]?.defenceDC;
    if (Array.isArray(declared)) {
      for (const raw of declared) {
        const entry = normaliseDefenceDC(raw, { id: document.id, name: document.name }, { fromStance: stanceEffects.has(document) });
        if (entry) found.push(entry);
      }
    }
    if (!stanced) return;
    for (const raw of stanceGatedRows(document, "stanceDefenceDC")) {
      const entry = normaliseDefenceDC(raw, { id: document.id, name: document.name }, { stanceGated: true });
      if (entry) found.push(entry);
    }
  };
  for (const item of Array.from(actor?.items ?? [])) consider(item);
  for (const effect of effects) {
    if (effect?.disabled) continue;
    consider(effect);
  }
  return found;
}

/**
 * What this defender adds to the given DC against the given action.
 *
 * @param {Actor} targetActor The DEFENDER.
 * @param {string} against The DC being resolved ("fortitudeDC", …).
 * @param {string} actionKey The action being resolved against them.
 * @returns {{total: number, entries: object[]}}
 */
export function defenceDCBonus(targetActor, against, actionKey, attackerTypes = [], attackerUuid = "", attackerAlignments = [], attackerTraits = []) {
  const key = String(actionKey ?? "").trim().toLowerCase();
  const types = (Array.isArray(attackerTypes) ? attackerTypes : String(attackerTypes ?? "").split(/[,;]/))
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);

  // An entry applies when EVERY axis it declares matches. An axis it does
  // not declare is not a wildcard for the others: Storgar's shove entry
  // names no attacker type and applies to any shover, but it still has to
  // be a shove.
  const uuid = String(attackerUuid ?? "").trim();
  const alignments = (Array.isArray(attackerAlignments) ? attackerAlignments : [])
    .map((a) => String(a ?? "").trim().toLowerCase())
    .filter(Boolean);
  const traits = (Array.isArray(attackerTraits) ? attackerTraits : String(attackerTraits ?? "").split(/[,;]/))
    .map((t) => String(t ?? "").trim().toLowerCase())
    .filter(Boolean);

  // A LIST OF DCS (3.666.0): a Trip is rolled against the higher of your
  // Acrobatics and Fortitude DCs, and a row raising either belongs to it —
  // once, however many of the list it names. Until now a list matched no
  // row at all, so nothing could ever raise a DC against a Trip.
  const againsts = (Array.isArray(against) ? against : [against]).map((dc) => String(dc ?? ""));
  const matched = collectDefenceDC(targetActor).filter((entry) => {
    if (entry.dc !== "any" && !againsts.includes(entry.dc)) return false;
    if (entry.actions.length && !entry.actions.includes(key)) return false;
    if (entry.sourceTypes.length && !entry.sourceTypes.some((t) => types.includes(t))) return false;
    // A WARD AGAINST A NAMED CREATURE RAISES NOTHING AGAINST ANYONE ELSE
    // — including against an attacker the caller could not name. A blank
    // uuid matches no entry, which is the whole correction: Stone Shield
    // shipped as an unconditional +4 to DB with the words "cover from one
    // chosen enemy" in a note beside it, so a caster got +4 against every
    // attacker in the scene for a round. The note was a reminder wearing
    // automation's clothes.
    if (entry.sourceUuids.length && !entry.sourceUuids.includes(uuid)) return false;
    // AN ATTACKER CARRYING NO ALIGNED TRAIT MATCHES NO ALIGNMENT ENTRY,
    // which is the Balance case and the unaligned case both: the bonus
    // exists, and there is nothing for it to apply against. Graham
    // confirmed on 31 August 2026 that this is deliberate.
    if (entry.sourceAlignments.length && !entry.sourceAlignments.some((a) => alignments.includes(a))) return false;
    // AN ATTACKER WHOSE TRAITS ARE UNKNOWN MATCHES NO TRAIT ENTRY (3.664.0).
    if ((entry.sourceTraits ?? []).length && !entry.sourceTraits.some((t) => traits.includes(t))) return false;
    // EVERYONE BUT ONE (3.668.0): the excluded creature meets nothing.
    if ((entry.notSourceUuids ?? []).length && entry.notSourceUuids.includes(uuid)) return false;
    return true;
  });

  // THE DC ROWS AND THE DISADVANTAGE ROWS ARE RETURNED APART (3.665.0), so
  // every caller that sums or lists `entries` reads exactly what it read
  // before, and only the action workflow, which rolls the check, reads the
  // other list.
  const entries = matched.filter((e) => e.kind !== "disadvantage");
  const disadvantages = matched.filter((e) => e.kind === "disadvantage");
  return { total: entries.reduce((sum, e) => sum + e.value, 0), entries, disadvantages };
}
