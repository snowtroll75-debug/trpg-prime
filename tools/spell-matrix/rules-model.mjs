/**
 * THE SPELL-MATRIX RULES MODEL — what the BOOK says a cast should cost and
 * which options it may take, written from the rulebook and the feat text,
 * NOT from the engine.
 *
 * This file must never import from module/. The point of it is to be a
 * second, independent spelling of the rules, so that when it and the engine
 * disagree one of them is wrong and a person has to look. A model written by
 * reading the engine would agree with the engine's mistakes.
 *
 * Graham's rulings of 26 Nov 2026 (U1-U12, TRG_PRIME_SPELL_UNRESOLVED.md)
 * are applied here as the book: each is cited "U<n>".
 *
 * Every rule cites its source. "Core 3.7" line numbers are in
 * tools/source/rulebook-core-3.7.txt. Where the book is silent or ambiguous
 * the answer is UNRESOLVED, never a guess; the reports list those.
 */

/* ── Casting limits ──────────────────────────────────────────────────── */

/** Core 3.7 l.19808: "maximum amount of PP per Cast a Spell action equal to
 *  their caster level +1". */
export const castCap = (casterLevel) => Math.max(0, Math.floor(casterLevel)) + 1;

/** Core 3.7 Chapter 10 (Specialist Spells; worked example Nyphari): a
 *  specialist spell's maximum is the CHARACTER level. */
export const specialistCap = (characterLevel) => Math.max(0, Math.floor(characterLevel));

/** Core 3.7 l.19856: "Cast a Spell DC = 10 + (Spell PP cost) x1.5";
 *  Graham's ruling of 10 Sep 2026: round DOWN. */
export const castDC = (pp) => 10 + Math.floor(pp * 1.5);

/** Core 3.7 l.19811: a cantrip "cannot be warped using Metamagic or warping
 *  options" and costs 0 PP. */
export const isCantrip = (spell) => Number(spell.ppCost) === 0 && !spell.innate;

/* ── Unique warping options ──────────────────────────────────────────── */

/**
 * Core 3.7 l.20036 / l.21061: "Each unique Warping Option may be selected
 * multiple times, unless the Spell description specifically prohibits doing
 * so." So the BOOK's answer is "unlimited" unless the option's text caps it.
 * Returns { max, why } where max is a number or Infinity.
 */
export function bookWarpMax(warp) {
  const t = String(warp.text ?? "");
  // U12: Shape Of The Wyrm's extra natural attack, once.
  if (/gain an additional natural attack \(available to your type\)/i.test(t)) return { max: 1, why: "U12: once" };
  if (/(only|cannot)\b[^.]*\b(once|more than once)|may (only )?be (taken|selected|applied) once|not be (taken|selected) more than once/i.test(t))
    return { max: 1, why: "text prohibits repeats" };
  const cap = t.match(/\(max(?:imum)?(?: of)? ([+]?\d+)/i);
  const per = t.match(/(?:by|gain|grant|\+)\s*([+]?\d+)(?!d)/i);
  if (cap && per && Number(per[1]) > 0) return { max: Math.max(1, Math.ceil(Number(cap[1]) / Number(per[1]))), why: `printed max ${cap[1]}` };
  if (/\bincreases? (?:the [a-z ]+ )?to\b|\bbecomes?\b|\binstead\b|\breplace/i.test(t))
    return { max: 1, why: "a destination/replacement (a repeat buys nothing)" };
  return { max: Infinity, why: "book default: repeatable" };
}

/**
 * The damage a warp's TEXT promises, read from the text alone, so that the
 * authored `mods.damageDice` can be checked against the page.
 * "increase the fire damage by 1d6" -> "1d6".
 */
export function textDamageDice(warp) {
  const t = String(warp.text ?? "");
  const m = t.match(/(?:increase|add|deal|inflict)[^.;]*?\bdamage\b[^.;]*?\bby (?:an additional )?(\d+d\d+)/i)
    ?? t.match(/(?:\+|additional )(\d+d\d+)[^.;]*\bdamage/i)
    ?? t.match(/(?:increase|add)[^.;]*?(\d+d\d+)[^.;]*?damage/i);
  return m ? m[1] : null;
}

/** Words that mean a warp changes the mechanics rather than the narrative. */
const MECHANICAL = /\b(damage|DC|difficulty|AP\b|bonus|penalty|hit points?|HP\b|heal|condition|frightened|prone|stunned|slowed|immobil|save|saving throw|duration|range|area|radius|target|attack|speed|resistance|immun|critical|persistent|temporary)\b/i;

/**
 * What a warp needs to be executed, from the text: "narrative" (the GM rules
 * it at the table), or "mechanical". An empty `mods` on a mechanical warp is
 * charged but may not be applied — the live test must look.
 */
export function warpNature(warp) {
  return MECHANICAL.test(String(warp.text ?? "")) ? "mechanical" : "narrative";
}

/* ── Metamagic feats, from their text (feats pack, Core 3.7 Chapter 5) ── */

const has = (s, re) => re.test(String(s ?? ""));
const sustainedSpell = (s) => Boolean(s.sustained) || /sustain/i.test(String(s.duration ?? ""));
const limitedDuration = (d, sustained = false) => {
  const t = String(d ?? "").trim().toLowerCase();
  if (!t) return "no";                                     // instantaneous
  if (/unlimited|permanent/.test(t)) return "no";
  if (sustained || /sustain/.test(t)) return "no";         // U5: continues regardless
  if (/varies|see (below|text)|until|sustained|discharged|tribute|or more/.test(t)) return "unresolved";
  return "yes";
};
/**
 * "A spell that only affects you". The pack prints no "Range: self": a spell
 * with no Range, no Targets and no Area is the book's self spell (Shield,
 * Mage Armour, See Invisible).
 */
export const selfOnly = (s) => {
  const r = String(s.range ?? "").trim().toLowerCase(), t = String(s.targets ?? "").trim().toLowerCase();
  return (!r || r === "self" || r === "personal") && (!t || /^(you|self|yourself)$/.test(t)) && !String(s.area ?? "").trim();
};
/**
 * Temporal Extension's ladder (U1): Rounds -> Minutes -> 10 minutes -> Hours ->
 * 12 hours. "10 minutes" is the 10-minute rung (Shield of Faith: one step is 1
 * hour); a multiple of 12 hours is the top rung. Sustained (U5), days,
 * "until", rolled: off the ladder.
 */
export function temporalRung(duration, sustained = false) {
  const t = String(duration ?? "").trim().toLowerCase();
  if (!t || sustained || /sustain|until|varies|\dd\d|\d+\s*d\s*\d/.test(t)) return null;
  const m = t.match(/(\d+)\s*(round|minute|min|hour|hr)s?\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (m[2] === "round") return 0;
  if (m[2].startsWith("min")) return n % 10 === 0 ? 2 : 1;
  return n % 12 === 0 ? 4 : 3;
}

/**
 * Each core Metamagic feat: eligibility from its printed text.
 * eligible(spell, caster) -> "eligible" | "ineligible" | "conditional" | "unresolved"
 * cost(spell, times, choice) -> PP; max(spell, caster) -> purchases.
 * `castTime` marks options chosen in the Warp dialog; the others act during
 * or after the roll and are tested live only.
 */
export const METAMAGIC = {
  "aligned spell": { id: "aligned", castTime: true, cost: (s, n) => n, max: () => 2,
    // "Requirement Divine Caster only"
    eligible: (s, c) => (/divinity/i.test(c.tradition) ? "eligible" : "ineligible") },
  // "change a component type" (U10: automated): FROM one the spell has TO one
  // it has not; the generator takes the first such change.
  "component mastery": { id: "componentMastery", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    select: (s) => {
      const K = ["verbal", "somatic", "material"], c = s.components ?? {};
      for (const f of K) for (const t of K) if (c[f] && !c[t]) return `${f}>${t}`;
      return null;
    },
    eligible: (s) => {
      const K = ["verbal", "somatic", "material"], c = s.components ?? {};
      return K.some((f) => c[f]) && K.some((t) => !c[t]) ? "eligible" : "ineligible";
    } },
  "distant spell": { id: "distant", castTime: true, cost: (s, n, c) => (/ethereal/i.test(c.tradition) ? 6 : 4) * n, max: () => 1,
    // "Change a spell that only affects you to a range of touch"
    eligible: (s) => (selfOnly(s) ? "eligible" : "ineligible") },
  "economic spell": { id: "economic", castTime: true, cost: () => 0, max: (s, c) => Math.min(c.casterLevel, Math.max(0, s.ppCost - 1)),
    // "lower the PP cost of a spell by up to your caster level (min 1 PP)"
    eligible: (s) => (s.ppCost > 1 ? "eligible" : "ineligible") },
  "elemental spell": { id: "elemental-fire", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    eligible: (s) => (String(s.damage?.formula ?? "").trim() ? "eligible" : "ineligible") },
  "empower spell": { id: "empower", castTime: true, cost: (s, n) => n, max: () => 1,
    // Core 3.7 l.21054: no base damage entry -> not increased by such factors
    eligible: (s) => (String(s.baseDamage ?? "").trim() ? "eligible" : "ineligible") },
  "extend spell": { id: "extend", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    // "A spell must have a limited duration"
    eligible: (s) => ({ yes: "eligible", no: "ineligible", unresolved: "unresolved" })[limitedDuration(s.duration, sustainedSpell(s))] },
  "heighten spell": { id: "heighten", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    // U3: every spell — "it should also affect dispel and counteract".
    eligible: () => "eligible" },
  "imposing will": { id: "imposingWill", castTime: true, cost: () => 2, max: () => 1, select: "animal",
    eligible: (s) => (has(s.traits, /\bmental\b/i) ? "eligible" : "ineligible") },
  "intensified spell": { id: "intensify", castTime: true, cost: (s, n) => 4 * n, max: () => 1,
    eligible: (s) => (/\d+d\d+/.test(String(s.baseDamage ?? "")) ? "eligible" : "ineligible") },
  "lingering performance": { id: "lingering", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    eligible: (s) => (has(s.traits, /composition/i) ? "eligible" : "ineligible") },
  "quicken spell": { id: "quicken", castTime: true, cost: (s, n) => 8 * n, max: () => 1,
    // "reduce the AP cost ... by 1 (minimum 1)"
    eligible: (s) => (typeof s.castAP === "number" ? (s.castAP > 1 ? "eligible" : "ineligible") : "unresolved") },
  "reach spell": { id: "reach", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    eligible: (s) => {
      const r = String(s.range ?? "").trim().toLowerCase();
      if (!r || /^(self|touch)$/.test(r)) return "ineligible";
      return /\d/.test(r) ? "eligible" : "ineligible";       // U7: only a numeric range
    } },
  "selective spell": { id: "selective", castTime: true, cost: (s, n) => n, max: () => Infinity,
    // "+1 PP per target", no printed ceiling: the cast cap is the ceiling
    eligible: (s) => (String(s.area ?? "").trim() ? "eligible" : "ineligible") },
  "silent spell": { id: "silent", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    eligible: (s) => (s.components?.verbal ? "eligible" : "ineligible") },
  "split spell": { id: "split", castTime: true, cost: (s, n) => 4 * n, max: () => Infinity,
    // "your attack spell ... Spell Attack check": an ATTACK spell; die steps down per target
    eligible: (s) => (s.category === "attack" && String(s.damage?.formula ?? "").trim() ? "eligible" : "ineligible") },
  "still spell": { id: "still", castTime: true, cost: (s, n) => 2 * n, max: () => 1,
    eligible: (s) => (s.components?.somatic ? "eligible" : "ineligible") },
  "temporal extension": { id: "temporal", castTime: true, cost: (s, n) => Math.ceil(s.ppCost / 2) * n,
    max: (s) => { const r = temporalRung(s.duration, sustainedSpell(s)); return r === null ? 0 : 4 - r; },
    // U1/U5: on the ladder, with a step left; anything off it is not stepped.
    eligible: (s) => {
      const r = temporalRung(s.duration, sustainedSpell(s));
      return r !== null && r < 4 ? "eligible" : "ineligible";
    } },
  "widen spell": { id: "widen", castTime: true, cost: (s, n) => 4 * n, max: () => 1,
    // "a burst, emanation, or spread-shaped spell"; "radius" is not named
    // U4: a radius counts.
    eligible: (s) => (/burst|emanation|spread|radius|\(b\)/i.test(String(s.area ?? "")) ? "eligible" : "ineligible") },
  // Acting during or after the roll, or outside the cast: live tests only.
  "component savant": { id: "componentSavant", castTime: false },
  "conductive healing": { id: "conductiveHealing", castTime: false },
  "echoing performance": { id: "echoingPerformance", castTime: false },
  "effortless spell": { id: "effortless", castTime: false },
  "variable success": { id: "variableSuccess", castTime: false },
  "warp manipulation": { id: "warpManipulation", castTime: false }
};

/**
 * Pairs the BOOK forbids or leaves open.
 *  - Temporal Extension "does not stack with other duration modifiers":
 *    illegal beside Extend Spell or a warp that sets the duration.
 *  - "specific warping options ... always override the generic warping options
 *    provided by Metamagic feats" (l.20042): a metamagic beside a spell warp
 *    of the SAME dimension is unresolved (override, or both?).
 */
export function pairRuling(a, b) {
  const ids = [a.id, b.id];
  const isDur = (o) => o.kind === "warp" && o.dimension === "duration";
  if (ids.includes("temporal") && (ids.includes("extend") || isDur(a) || isDur(b)))
    return { legal: false, why: "Temporal Extension does not stack with other duration modifiers" };
  // U8: refused, for the dimensions Graham's question named (duration, range,
  // area). Damage (Empower/Intensified beside a "+1d6 damage" warp) was not
  // asked and stays open.
  const dimOf = { extend: "duration", temporal: "duration", reach: "range", distant: "range", widen: "area", empower: "damage", intensify: "damage" };
  const [w, m] = a.kind === "warp" ? [a, b] : [b, a];
  if (w.kind === "warp" && m.kind === "mm" && dimOf[m.id] && dimOf[m.id] === w.dimension) {
    if (w.dimension === "damage") return { legal: "unresolved", why: "a damage warp beside Empower/Intensified: U8 asked about duration, range and area only" };
    return { legal: false, why: `U8: the spell's own ${w.dimension} warp overrides ${m.feat} (refused)` };
  }
  return { legal: true };
}

/** A warp's dimension, from its text, for the override rule above. */
export function warpDimension(warp, spell = {}) {
  // ONLY A WARP THAT CHANGES THE DIMENSION (26 Nov 2026): "fast healing 5 for
  // duration" or "targets within range" name the word and change nothing.
  const t = String(warp.text ?? "").toLowerCase();
  if (/(increase|extend|change)s? (the )?duration|duration (becomes|increases|changes|is|lasts)|lasts? (for|until|up to)|(has|have) a duration of|unlimited duration|duration to /.test(t)) return "duration";
  if (!/attacks gain a range/.test(t) && /range (becomes|increases|changes|is|to)|range of the spell increases|(increase|change)s? the range|(gains?|has) a range|range of touch|range to touch/.test(t)) return "range";
  // A SELF-ONLY SPELL'S "target an ally within 30 feet" gives it a range;
  // "affects all allies within 30 feet" gives it an area.
  if (selfOnly(spell) && /target (an?|one|another)\b[^.]*within \d+\s*(feet|ft)/.test(t)) return "range";
  if (/(increase|change)s? the (area|radius|size of the area)|(area|radius) (becomes|increases|changes)|an area of/.test(t)) return "area";
  if (/\bdamage\b/.test(t)) return "damage";
  return "other";
}

/**
 * The PP a configuration costs, the cap it must fit, and its Casting DC.
 * Economic Spell: "lower the PP cost ... by up to your caster level (min 1
 * PP). The DC to cast the spell increases by 2 for every PP you lower by"
 * (Graham, 5 Nov 2026: the DC is read from the unlowered PP, then +2 each).
 */
export function expectedCost(spell, caster, picks) {
  const warpPP = picks.filter((p) => p.kind === "warp").reduce((t, p) => t + p.ppCost * p.times, 0);
  const mmPP = picks.filter((p) => p.kind === "mm").reduce((t, p) => t + p.ppCost, 0);
  const econ = picks.find((p) => p.id === "economic")?.times ?? 0;
  const raw = spell.ppCost + warpPP + mmPP;
  const total = Math.max(1, raw - econ);
  const lowered = Math.max(0, raw - total);
  if (isCantrip(spell)) return { warpPP, mmPP, raw, total: 0, cap: spell.specialist ? specialistCap(caster.level) : castCap(caster.casterLevel), fitsCap: true, castingDC: null };
  const cap = spell.specialist ? specialistCap(caster.level) : castCap(caster.casterLevel);
  return { warpPP, mmPP, raw, total, cap, fitsCap: total <= cap, castingDC: castDC(raw) + 2 * lowered };
}
