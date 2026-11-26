/**
 * Metamagic feats (Chapter 5) as cast-time warping options.
 *
 * The spell's OWN warping options live on `spell.system.warps` and ride
 * buildWarpChooser; metamagic feats are CHARACTER-owned options, so they
 * are built here from the actor's feats, offered in the same dialog (a
 * "Metamagic Feats" section under the spell's warps), and aggregated into
 * one object the cast workflow folds into cost, DC, AP, components,
 * duration, save DC and damage.
 *
 * Pure logic throughout: buildMetamagicOptions takes plain values, so the
 * node harness exercises applicability gating and aggregation without a
 * live Actor. Post-roll feats (Variable Success, Conductive Healing) are
 * wired directly in the cast workflow — they aren't cast-time choices.
 */

import { addDice } from "./caster-level-mods.mjs";
import { lingeringPerformanceLimits, lingeringRounds } from "../combat/grant-feats.mjs";
import { metamagicRodApplies } from "../rod-powers.mjs";
import { castOnSelfOnly } from "./self-rows.mjs";

/*
 * GRAHAM'S RULINGS OF 26 NOVEMBER 2026 (the spell-matrix audit, U1-U12), the
 * ones this file carries:
 *
 *   U1  Temporal Extension's ladder is Rounds -> Minutes -> 10 minutes ->
 *       Hours -> 12 hours, a step per category, half the base PP (rounded up)
 *       a step. 1 round: one step 1 minute, two 10 minutes, three 1 hour,
 *       four 12 hours. The step must reach the effect's clock, not the card.
 *   U2  Distant Spell: only spells that affect the caster.
 *   U3  Heighten Spell: every spell — it also makes dispel and counteract
 *       harder, so a spell with no save still takes it.
 *   U4  Widen Spell: a radius counts.
 *   U5  Extend and Temporal do not touch a SUSTAINED duration: it continues
 *       regardless.
 *   U7  Reach Spell: offered only for a numeric range.
 *   U8  A metamagic beside the spell's own warp of the same kind is REFUSED
 *       ("specific warping options always override the generic").
 *   U10 Component Mastery and Lingering Performance are automated.
 * Plus the audit's plain faults: Extend offered on unlimited durations (RC5),
 * Split offered on a non-attack spell (RC6), and Selective/Split held to 6/4
 * purchases the feats never print (RC7) — the cast cap is their ceiling.
 */

/** The categories Temporal Extension steps through (U1), with their length. */
const TEMPORAL_LADDER = Object.freeze([
  { unit: "round", seconds: 6 },
  { unit: "minute", seconds: 60 },
  { unit: "10-minute", seconds: 600 },
  { unit: "hour", seconds: 3600 },
  { unit: "12-hour", seconds: 43200 }
]);

/** Is this duration sustained (U5)? The flag or the printed word. */
export function isSustainedDuration(spellData = {}) {
  return Boolean(spellData?.sustained) || /sustain/i.test(String(spellData?.duration ?? ""));
}

/**
 * Where a printed duration sits on Temporal Extension's ladder, and how many
 * of that category it is: "3 rounds" {rung 0, count 3}; "10 minutes" is ONE
 * 10-minute interval {rung 2, count 1} (Graham's Shield of Faith: 10 minutes
 * steps to 1 hour); "5 minutes" {rung 1, count 5}; "24 hours" two 12-hour
 * intervals {rung 4, count 2}. Null for anything off the ladder: instantaneous,
 * sustained, a day, "until …", varies, a rolled duration.
 */
export function temporalRung(duration, { sustained = false } = {}) {
  const t = String(duration ?? "").trim().toLowerCase();
  if (!t || sustained || /sustain|\d+\s*d\s*\d+|until|varies|see text|permanent|unlimited|instant/.test(t)) return null;
  const m = t.match(/(\d+)\s*(rounds?|minutes?|mins?|hours?|hrs?)\b/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!(n > 0)) return null;
  if (/^r/.test(m[2])) return { rung: 0, count: n };
  if (/^m/.test(m[2])) return n % 10 === 0 ? { rung: 2, count: n / 10 } : { rung: 1, count: n };
  return n % 12 === 0 ? { rung: 4, count: n / 12 } : { rung: 3, count: n };
}

/** The steps Temporal Extension can still take from this duration (0 off the ladder). */
function temporalStepsLeft(duration, opts = {}) {
  const at = temporalRung(duration, opts);
  return at ? TEMPORAL_LADDER.length - 1 - at.rung : 0;
}

/**
 * Imposing Will (Chapter 5, table supplied by Graham 2 Aug 2026): the PP
 * cost to warp a mental-trait spell to affect a creature type normally
 * immune to it. Race types follow "shortly" — extend here when they land.
 */
export const IMPOSING_WILL_COSTS = Object.freeze({
  aberration: 4,
  animal: 2,
  beast: 3,
  construct: 8,
  elemental: 3,
  eternal: 4,
  fey: 2,
  ooze: 6,
  plant: 6,
  undead: 8,
  wyrm: 4
});

/** The first dice term of a formula: "15d6 + 4" -> {n: 15, faces: 6}. */
export function firstDiceTerm(formula) {
  const m = String(formula ?? "").match(/(\d+)d(\d+)/);
  return m ? { n: Number(m[1]), faces: Number(m[2]) } : null;
}

/**
 * Build the metamagic options this caster can apply to this spell.
 *
 * @param {object} input
 * @param {string[]} input.featNames Lower-cased owned feat names.
 * @param {string[]} [input.elementalTypes] Energy types recorded by
 *   Elemental Spell copies (acid/cold/electricity/fire).
 * @param {object} input.spellData The spell's system data.
 * @param {number} input.basePP
 * @param {number} input.casterLevel
 * @param {string} [input.tradition]
 * @param {Array} [input.rods] Held metamagic rods (rod-powers.mjs,
 *   `metamagicRodsOf`), 3.616.0.
 * @returns {Array<{id, label, ppCost, max, note, apply}>}
 */
export function buildMetamagicOptions({
  rods = [],
  featNames = [],
  elementalTypes = [],
  spellData = {},
  basePP = 0,
  casterLevel = 0,
  tradition = "",
  charisma = 0
} = {}) {
  const has = (name) => featNames.includes(name);
  const options = [];
  const damageFormula = String(spellData.damage?.formula ?? "").trim();
  /*
   * THE BASE DAMAGE ENTRY, AND WHY IT IS A SEPARATE FIELD (3.585.0).
   *
   * Page 247: "Each damage inflicting spell will have a Base Damage
   * Value which is used to determine additional damage when warping the
   * spell and inflicting criticals. Be aware that if a spell does not
   * have a base damage entry, it's damage is not increased by factors
   * which increase base damage."
   *
   * Empower and Intensified are exactly those factors — their own
   * printed labels say "base damage" — and both read
   * `damage.formula` until now. MEASURED against the live pack:
   *
   *   99 spells carry both fields. All 99 share a die FACE, so
   *   Intensified happened to be right. But 81 OF THE 99 DIFFER IN DIE
   *   COUNT — Acid Arrow prints "Base Damage 1d8" and deals 3d8 — so
   *   Empower has been adding the whole damage where the book says to
   *   add the base. On Acid Arrow that is +3d8 instead of +1d8.
   *
   *   20 more spells deal damage and print NO base damage entry. Those
   *   are the ones the page's second sentence is about; neither option
   *   may be offered for them at all.
   *
   * A SPELL'S OWN PRINTED WARPS ARE UNTOUCHED BY THIS. Acid Cloud has
   * no base damage entry and still prints "+4 PP: increase the acid
   * damage by 1d6" — specific overrides generic (page 241), and the
   * first draft of this change gated `warp.damageDice` too, which would
   * have silently killed that option and every one like it. Caught by
   * measuring the pack before writing the gate rather than after.
   */
  const baseDamage = String(spellData.baseDamage ?? "").trim();
  const duration = String(spellData.duration ?? "").trim();
  const range = String(spellData.range ?? "").trim();
  const area = String(spellData.area ?? "").trim();
  const components = spellData.components ?? {};
  const traits = String(spellData.traits ?? "");
  const isEthereal = /ethereal/i.test(String(tradition ?? ""));

  if (has("aligned spell") && /divinity/i.test(String(tradition ?? ""))) {
    options.push({
      id: "aligned", label: "Aligned Spell — affects only chosen alignment trait(s)",
      ppCost: 1, max: 2,
      note: (times) => `affects only targets with ${times > 1 ? "two chosen alignment traits" : "one chosen alignment trait"} (chaos/evil/good/order)`
    });
  }
  /*
   * COMPONENT MASTERY, AUTOMATED (U10): "you may Warp the spell to change a
   * component type." A choice of FROM (one the spell has) and TO (one it has
   * not), +2 PP. The cast's component gate is then judged on the changed set,
   * after this dialog — Graham: a material spell blocked for want of a pouch
   * "cannot be ruled at the table as the system would block the spell".
   */
  if (has("component mastery") && Object.values(components).some(Boolean)) {
    const KINDS = ["verbal", "somatic", "material"];
    const from = Object.keys(components).filter((k) => components[k] && KINDS.includes(k));
    const choices = [];
    for (const f of from) for (const t of KINDS) {
      if (t === f || components[t]) continue;
      choices.push({ value: `${f}>${t}`, ppCost: 2, label: `${f[0].toUpperCase()}${f.slice(1)} becomes ${t} (+2 PP)` });
    }
    if (choices.length) {
      options.push({
        id: "componentMastery", label: "Component Mastery — change one component type",
        ppCost: 0, max: 1, kind: "select", select: "componentSwap", choices,
        note: (times, value) => { const [f, t] = String(value).split(">"); return `the ${f} component becomes ${t} for this cast (Component Mastery)`; }
      });
    }
  }
  // DISTANT SPELL: "a spell that only affects you" (U2) — the pack's self
  // spells print no Range, no Targets and no Area (`castOnSelfOnly`). Until
  // 26 Nov 2026 this asked for a range of "self", which no spell prints, so
  // the feat was never offered. It moves the self rows onto the touched
  // creature exactly as Invisibility's own touch warp does.
  if (has("distant spell") && castOnSelfOnly(spellData)) {
    options.push({
      id: "distant", label: `Distant Spell — self-only becomes touch${isEthereal ? " (+6 PP, Ethereal)" : ""}`,
      ppCost: isEthereal ? 6 : 4, max: 1, kind: "distant",
      note: () => "range becomes touch: the spell affects the creature you touch (Distant)"
    });
  }
  if (has("economic spell") && basePP > 1) {
    options.push({
      id: "economic", label: "Economic Spell — lower the PP cost (+1 AP, Casting DC +2 per PP)",
      ppCost: 0, max: Math.max(1, Math.min(casterLevel, basePP - 1)),
      kind: "economic",
      note: (times) => `PP cost lowered by ${times} (+1 AP, Casting DC +${2 * times})`
    });
  }
  for (const type of elementalTypes) {
    if (has("elemental spell") && damageFormula) {
      options.push({
        id: `elemental-${type}`, label: `Elemental Spell — damage becomes ${type} (or half ${type}, half normal)`,
        ppCost: 2, max: 1,
        kind: "elemental", elementalType: type,
        note: () => `damage type becomes ${type} (or split half/half — say which)`
      });
    }
  }
  if (has("empower spell") && baseDamage) {
    options.push({
      id: "empower", label: "Empower Spell — additional damage equal to base damage",
      ppCost: 1, max: 1,
      kind: "empower",
      note: () => `+${baseDamage} damage (Empowered)`
    });
  }
  if (has("imposing will") && /\bmental\b/i.test(traits)) {
    options.push({
      id: "imposingWill",
      label: "Imposing Will — affect a creature type normally immune to mental effects",
      ppCost: 0, max: 1,
      kind: "select",
      choices: Object.entries(IMPOSING_WILL_COSTS).map(([type, pp]) => ({
        value: type,
        ppCost: pp,
        label: `${type.charAt(0).toUpperCase() + type.slice(1)} (+${pp} PP)`
      })),
      note: (times, value) => {
        const cost = IMPOSING_WILL_COSTS[value] ?? 0;
        return `affects ${value.charAt(0).toUpperCase() + value.slice(1)}-type creatures normally immune to mental effects (+${cost} PP, Imposing Will)`;
      }
    });
  }
  if (has("intensified spell") && firstDiceTerm(baseDamage)) {
    const term = firstDiceTerm(baseDamage);
    options.push({
      id: "intensify", label: `Intensified Spell — base damage +1d${term.faces}`,
      ppCost: 4, max: 1,
      kind: "intensify",
      note: () => `+1d${term.faces} damage (Intensified)`
    });
  }
  // "A spell must have a limited duration": not an unlimited or permanent one
  // (RC5), and not a sustained one, which continues regardless (U5).
  if (has("extend spell") && duration && !/unlimited|permanent/i.test(duration) && !isSustainedDuration(spellData)) {
    options.push({
      id: "extend", label: "Extend Spell — duration doubled",
      ppCost: 2, max: 1,
      kind: "extend",
      note: () => "duration doubled (Extended)"
    });
  }
  // EVERY SPELL (U3): "more difficult to dispel (and potentially resist)".
  // With a save, the Save DC reads the maximum PP; with or without one, a
  // counteract against the cast's effects does (`cast-power.mjs`).
  if (has("heighten spell")) {
    options.push({
      id: "heighten", label: spellData.defence
        ? "Heighten Spell — Save DC, dispel and counteract as if cast at your maximum PP"
        : "Heighten Spell — dispel and counteract as if cast at your maximum PP",
      ppCost: 2, max: 1,
      kind: "heighten",
      note: () => spellData.defence
        ? "Save DC, dispel and counteract treated as your maximum castable PP (Heightened)"
        : "dispel and counteract treated as your maximum castable PP (Heightened)"
    });
  }
  if (has("lingering performance") && /composition/i.test(traits)) {
    // ECHOING PERFORMANCE (Chapter 5, 3.358.0): "your lingering performance
    // now lasts an ADDITIONAL ROUND, and you may have TWO lingering
    // performances running at any one time."
    //
    // WHAT THIS FEAT CAN HONESTLY DO IS SAY THE NUMBER. Lingering
    // Performance itself is a note — nothing in this system tracks a
    // composition still ringing after the bard stops — so its extension is
    // a note too, and pretending otherwise would be the dishonest kind of
    // automation `verify-feat-note-honesty` exists to catch. What changes
    // is that the note now COMPUTES the round count from this character's
    // Charisma and their feats, rather than telling the table to work out
    // "Cha rounds" and remember a caveat.
    const limits = lingeringPerformanceLimits(featNames);
    const rounds = lingeringRounds(charisma, featNames);
    options.push({
      id: "lingering",
      label: `Lingering Performance — lingers ${rounds} round${rounds === 1 ? "" : "s"} after you stop`,
      ppCost: 2, max: 1,
      // AUTOMATED (U10): the cast is registered to linger rather than end
      // when it lapses or another composition replaces it (active-spells.mjs).
      kind: "lingering", lingerRounds: rounds, lingerConcurrent: limits.concurrent,
      note: () => `lingers for ${rounds} rounds after you cease performing`
        + (limits.extraRounds ? ` (Cha ${Math.max(0, Math.floor(Number(charisma) || 0))} +${limits.extraRounds} Echoing Performance)` : " (your Charisma)")
        + `; you may have ${limits.concurrent === 1 ? "one lingering performance" : `${limits.concurrent} lingering performances`} running at a time`
    });
  }
  if (has("quicken spell") && typeof spellData.castAP === "number" && spellData.castAP > 1) {
    options.push({
      id: "quicken", label: "Quicken Spell — casting costs 1 less AP",
      ppCost: 8, max: 1,
      kind: "quicken",
      note: () => "cast AP reduced by 1 (Quickened)"
    });
  }
  // ONLY A NUMERIC RANGE (U7). The cast doubles it before its range check.
  if (has("reach spell") && /\d/.test(range) && !/^(self|touch)$/i.test(range)) {
    options.push({
      id: "reach", label: `Reach Spell — range doubled (${range} ×2)`,
      ppCost: 2, max: 1, kind: "reach",
      note: () => `range doubled (${range} ×2, Reach)`
    });
  }
  if (has("selective spell") && area) {
    options.push({
      id: "selective", label: "Selective Spell — exclude chosen targets (+1 PP each)",
      // "+1 PP per target", no printed ceiling: the cast cap is the ceiling (RC7).
      ppCost: 1, max: Math.max(1, Math.floor(Number(casterLevel) || 0) + 1),
      note: (times) => `${times} chosen creature${times > 1 ? "s are" : " is"} excluded from the effect (you must be aware of them)`
    });
  }
  if (has("silent spell") && components.verbal) {
    options.push({
      id: "silent", label: "Silent Spell — no verbal component",
      ppCost: 2, max: 1,
      kind: "componentOff", component: "verbal",
      note: () => "cast without the verbal component (Silent)"
    });
  }
  // Split Spell applies to ATTACK spells ("your attack spell … Spell Attack
  // check"): the category, not "damage and no save", which offered it on
  // Shatter (RC6). No printed ceiling: the cast cap is the ceiling (RC7).
  if (has("split spell") && damageFormula && String(spellData.category ?? "") === "attack") {
    options.push({
      id: "split", label: "Split Spell — extra targets, damage die stepped down each (+4 PP each)",
      ppCost: 4, max: Math.max(1, Math.floor((Math.floor(Number(casterLevel) || 0) + 1) / 4)),
      note: (times) => `attack compared against ${times + 1} targets; damage die stepped down ${times} step${times > 1 ? "s" : ""}; one attack for MAP`
    });
  }
  if (has("still spell") && components.somatic) {
    options.push({
      id: "still", label: "Still Spell — no somatic component",
      ppCost: 2, max: 1,
      kind: "componentOff", component: "somatic",
      note: () => "cast without the somatic component (Stilled)"
    });
  }
  // ON THE LADDER, AND ONLY AS FAR AS IT GOES (U1): from Hours one step is
  // left, from 12 hours none, and a day, an "until" or a sustained duration
  // (U5) is not on it at all. It used to offer four steps from anywhere.
  const temporalLeft = temporalStepsLeft(duration, { sustained: isSustainedDuration(spellData) });
  if (has("temporal extension") && temporalLeft > 0) {
    options.push({
      id: "temporal", label: `Temporal Extension — duration category up (+${Math.ceil(basePP / 2)} PP per step, up to ${temporalLeft})`,
      ppCost: Math.ceil(basePP / 2), max: temporalLeft,
      kind: "temporal",
      note: (times) => `duration stepped up ${times} categor${times > 1 ? "ies" : "y"} to ${temporalDurationText(duration, times)?.split(" (")[0] ?? "?"} (Rounds → Minutes → 10 minutes → Hours → 12 hours)`
    });
  }
  // A RADIUS COUNTS (U4). The cast grows the area by its first distance.
  if (has("widen spell") && /burst|emanation|spread|radius/i.test(area)) {
    options.push({
      id: "widen", label: "Widen Spell — area measurements +100%",
      ppCost: 4, max: 1, kind: "widen",
      note: () => `area measurements doubled (${area} ×2, Widened)`
    });
  }
  /*
   * THE METAMAGIC RODS (3.616.0, Graham's R12 of block 36). The rod pays,
   * from its own PP: "This does not increase the casting DC of the spell or
   * cost you any PP." So the option costs 0 PP — and therefore adds nothing
   * to the cost the Casting DC is read from — and carries the rod's spend,
   * which the cast deducts from the rod. Offered whether or not the caster
   * owns the feat. See rod-powers.mjs for the gates.
   */
  for (const rod of rods ?? []) {
    if (!metamagicRodApplies(rod, { basePP, duration, castAP: spellData.castAP })) continue;
    const word = rod.kind === "extend" ? "Extend" : "Quicken";
    options.push({
      id: `rod-${rod.itemId}`,
      label: `${rod.name} — ${word} Spell from the rod (${rod.cost} of its ${rod.uses} PP; no PP or casting DC to you)`,
      ppCost: 0, max: 1,
      kind: rod.kind,
      rodItemId: rod.itemId,
      rodName: rod.name,
      rodCost: rod.cost,
      note: () => rod.kind === "extend"
        ? `duration doubled (Extended by ${rod.name}, ${rod.cost} rod PP)`
        : `cast AP reduced by 1 (Quickened by ${rod.name}, ${rod.cost} rod PP)`
    });
  }
  return options;
}

/** HTML for the metamagic section, appended below the spell's own warps. */
export function buildMetamagicChooser(options) {
  if (!options.length) return "";
  const rows = options.map((o) => {
    if (o.kind === "select") {
      const choiceRows = (o.choices ?? [])
        .map((c) => `<option value="${c.value}">${c.label}</option>`)
        .join("");
      return `<div class="form-group warp-option"><label><span>${o.label}</span>
        <select name="mm-${o.id}"><option value="">—</option>${choiceRows}</select></label></div>`;
    }
    if (o.max > 1) {
      return `<div class="form-group warp-option"><label><input type="number" name="mm-${o.id}" value="0" min="0" max="${o.max}" style="width:3.2em;flex:0 0 3.2em"><span>× ${o.ppCost ? `<strong>+${o.ppCost} PP each</strong> — ` : ""}${o.label}</span></label></div>`;
    }
    return `<div class="form-group warp-option"><label><input type="checkbox" name="mm-${o.id}" value="1"><span>${o.ppCost ? `<strong>+${o.ppCost} PP</strong> — ` : ""}${o.label}</span></label></div>`;
  }).join("");
  return `<hr><p class="hint"><strong>Metamagic Feats</strong> — options your feats open on this spell.</p>${rows}`;
}

/**
 * Aggregate the metamagic form selections.
 * @returns {{ppSpent, ppDelta, dcDelta, apDelta, componentsOff, extend,
 *   temporalSteps, heightenSave, elementalType, extraDamageDice, notes}}
 */
export function aggregateMetamagicSelection(options, form, { damageFormula = "", baseDamage = "" } = {}) {
  // THE BASE DAMAGE IS WHAT EMPOWER AND INTENSIFIED ADD (3.585.0), for
  // the reason set out in buildMetamagicOptions above. `damageFormula`
  // stays a parameter because the elemental and split options still
  // speak about the damage actually dealt; it is only these two that
  // the page ties to the base damage entry.
  const base = String(baseDamage ?? "").trim();
  const agg = {
    ppSpent: 0, ppDelta: 0, dcDelta: 0, apDelta: 0,
    componentsOff: [], extend: false, temporalSteps: 0,
    heightenSave: false, elementalType: null, extraDamageDice: "",
    // THE OPTIONS THAT CHANGE WHAT THE CAST REACHES (26 Nov 2026): Reach's
    // and Widen's ×2, Distant's touch, Component Mastery's change, and
    // Lingering Performance's rounds. The cast reads each (cast-workflow).
    rangeFactor: 1, areaFactor: 1, distant: false, componentSwap: null, linger: null,
    notes: [],
    // WHAT THE RODS PAY (3.616.0, R12), deducted from each rod after the
    // cast. A rod Extend beside the feat's is one Extend: the duration
    // doubles once, and both are still paid for, as chosen.
    rodSpends: []
  };
  const count = (name) => {
    const v = form?.[name];
    if (v === true) return 1;
    if (v === false || v == null) return 0;
    return Math.max(0, Math.floor(Number(v) || 0));
  };
  for (const o of options) {
    // A select option (Imposing Will's creature type) contributes its
    // chosen entry's own PP cost and note.
    if (o.kind === "select") {
      const value = String(form?.[`mm-${o.id}`] ?? "").trim();
      const chosen = (o.choices ?? []).find((c) => c.value === value);
      if (!chosen) continue;
      agg.ppSpent += chosen.ppCost;
      if (o.select === "componentSwap") {
        const [from, to] = value.split(">");
        agg.componentSwap = { from, to };
      }
      agg.notes.push(`+${chosen.ppCost} PP: ${o.note(1, value)}`);
      continue;
    }
    const times = Math.min(count(`mm-${o.id}`), o.max);
    if (!times) continue;
    agg.ppSpent += o.ppCost * times;
    switch (o.kind) {
      case "economic":
        agg.ppDelta -= times;
        agg.dcDelta += 2 * times;
        agg.apDelta += 1;
        break;
      case "quicken":
        // ONE QUICKEN, whether the feat's or a rod's or both.
        if (!agg.quickened) agg.apDelta -= 1;
        agg.quickened = true;
        break;
      case "componentOff":
        agg.componentsOff.push(o.component);
        break;
      case "extend":
        agg.extend = true;
        break;
      case "temporal":
        agg.temporalSteps += times;
        break;
      case "heighten":
        agg.heightenSave = true;
        break;
      case "reach":
        agg.rangeFactor = 2;
        break;
      case "widen":
        agg.areaFactor = 2;
        break;
      case "distant":
        agg.distant = true;
        break;
      case "lingering":
        agg.linger = { rounds: Math.max(0, Math.trunc(Number(o.lingerRounds) || 0)), concurrent: Math.max(1, Math.trunc(Number(o.lingerConcurrent) || 1)) };
        break;
      case "elemental":
        agg.elementalType = o.elementalType;
        break;
      case "empower":
        agg.extraDamageDice = addDice(agg.extraDamageDice, base);
        break;
      case "intensify": {
        const term = firstDiceTerm(base);
        if (term) agg.extraDamageDice = addDice(agg.extraDamageDice, `1d${term.faces}`);
        break;
      }
      default:
        break;
    }
    if (o.rodItemId) {
      agg.rodSpends.push({ itemId: o.rodItemId, name: o.rodName ?? "", pp: Number(o.rodCost) || 0 });
      agg.notes.push(`Rod: ${o.note(times)}`);
      continue;
    }
    agg.notes.push(`+${o.ppCost * times} PP: ${o.note(times)}`);
  }
  return agg;
}

/** The empty aggregate (cantrips, or no options offered). */
export function emptyMetamagic() {
  return aggregateMetamagicSelection([], {});
}

/**
 * Step a duration up N categories (Temporal Extension, U1), WRITTEN SO THE
 * EFFECT CLOCK READS IT: the stepped duration comes first, because
 * `parseSpellDuration` reads the first number and unit. Until 26 Nov 2026
 * this returned "1 hour — stepped up 1 category to half-day intervals", the
 * clock read "1 hour", and Mage Armour still ended after an hour.
 * "1 round" +3 -> "1 hour (1 round, stepped up 3 categories — Temporal Extension)".
 * Null when the duration is off the ladder or the steps run past its top.
 */
export function temporalDurationText(duration, steps, opts = {}) {
  const n = Math.max(0, Math.trunc(Number(steps) || 0));
  if (!n) return null;
  const at = temporalRung(duration, opts);
  if (!at || at.rung + n > TEMPORAL_LADDER.length - 1) return null;
  const rung = at.rung + n;
  const words = [
    (c) => `${c} round${c === 1 ? "" : "s"}`,
    (c) => `${c} minute${c === 1 ? "" : "s"}`,
    (c) => `${c * 10} minutes`,
    (c) => `${c} hour${c === 1 ? "" : "s"}`,
    (c) => `${c * 12} hours`
  ];
  return `${words[rung](at.count)} (${String(duration).trim()}, stepped up ${n} categor${n > 1 ? "ies" : "y"} — Temporal Extension)`;
}

/**
 * What a metamagic cannot be taken beside (U8, and Temporal's "does not stack
 * with other duration modifiers"). `spellWarpMods` are the SPELL's own warps
 * only, as `aggregateWarpSelection` built them, before any metamagic or a
 * caster-level step is folded in. Returns the reasons; empty means allowed.
 */
export function metamagicWarpConflicts(agg = {}, spellWarpMods = {}) {
  const out = [];
  const duration = Boolean(agg.extend) || Number(agg.temporalSteps) > 0;
  if (agg.extend && Number(agg.temporalSteps) > 0)
    out.push("Extend Spell and Temporal Extension do not stack (Temporal Extension \"does not stack with other duration modifiers\")");
  if (duration && String(spellWarpMods?.durationText ?? "").trim())
    out.push(`${agg.extend ? "Extend Spell" : "Temporal Extension"} cannot be taken with the spell's own duration warp — the specific option overrides the generic`);
  if (Number(agg.rangeFactor) > 1 && String(spellWarpMods?.rangeOverride ?? "").trim())
    out.push("Reach Spell cannot be taken with the spell's own range warp — the specific option overrides the generic");
  if (agg.distant && String(spellWarpMods?.rangeOverride ?? "").trim())
    out.push("Distant Spell cannot be taken with the spell's own range warp — the specific option overrides the generic");
  if (Number(agg.areaFactor) > 1 && (Number(spellWarpMods?.areaGrowth) > 0 || String(spellWarpMods?.areaOverride ?? "").trim()))
    out.push("Widen Spell cannot be taken with the spell's own area warp — the specific option overrides the generic");
  return out;
}
