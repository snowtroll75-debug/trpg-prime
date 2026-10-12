/**
 * WHAT A PERIL DOES WHEN IT GOES OFF (3.629.0; Pillars of Faith, Chapter 8,
 * Graham's design of 8 October 2026: "roll and apply").
 *
 * A haunt's Effect, and each action of a complex haunt's Routine, is a save
 * against its Level DC with a ladder of outcomes: "Every creature within 30
 * feet attempts a Will save against DC 18 … Partial Frightened 2. Failure
 * Frightened 3." This reads that text — the stat block's own, as printed —
 * into a declaration the Trigger button can roll and apply:
 *
 *   save, basic, dc       the save; the printed DC, else the peril's Level DC
 *   damage                "3d6 cold damage" — halved and doubled by a basic save
 *   radiusFeet, scope     "within 30 feet" of every creature → an area round
 *                         the peril's token; anything else → the GM's targets
 *   livingOnly            "all living creatures"
 *   immuneIf              "A deaf creature is immune" → Deafened
 *   conditions / outcomes per degree: the conditions to apply, with their
 *                         clocks, and the line to print
 *   overflow              "whose Frightened condition would exceed 4 instead
 *                         becomes Dazed 1 … for each additional point"
 *   initiative            "Roll Initiative"
 *
 * WHAT IT LEAVES AS TEXT. Everything that is not a condition, a save or
 * damage — "cannot willingly approach the bed", "convinced for 1 minute that
 * it committed one plausible wrongdoing", "pushed 10 feet" — is printed on
 * the card for the GM. Inventing a mechanism for each would be the
 * automation that is really a guess.
 *
 * A declaration given as an object (a module's haunt) is used as it is,
 * after the same normalising; the text is the GM's route.
 *
 * Pure. No Foundry.
 */

import { CONDITIONS } from "./conditions/registry.mjs";
import { extractDurationRounds } from "./magic/effect-duration.mjs";
import { declaredConditionTag } from "./combat/declared-after-strikes.mjs";

const LADDER = Object.freeze(["heroic", "critical", "success", "partial", "failure", "fumble", "blunder"]);
const DEGREE_WORD = "Heroic|Critical|Success|Partial|Failure|Fumble|Blunder";
const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
/** A degree the ladder leaves blank reads its neighbour — the core's reading. */
const FALLBACK = Object.freeze({ heroic: "critical", partial: "failure", blunder: "fumble" });

/** Condition labels as the book capitalises them, longest first. */
const CONDITION_NAMES = Object.freeze(Object.entries(CONDITIONS)
  .flatMap(([key, def]) => {
    const label = String(def?.label ?? "");
    const names = [label];
    if (key === "immobilised") names.push("Immobilized");
    if (key === "paralyzed") names.push("Paralysed");
    return names.filter(Boolean).map((name) => [name, key, Boolean(def?.valued)]);
  })
  .filter(([, key]) => !["dead", "dying", "broken", "hidden", "undetected", "unnoticed", "invisible", "concealed", "encumbered"].includes(key))
  .sort((a, b) => b[0].length - a[0].length));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The clock a sentence gives its conditions: `{rounds}` or `{minutes}`, or nothing. */
function clockOf(sentence) {
  // "until the end of the creature's next turn" is the book's "its".
  const rounds = extractDurationRounds(String(sentence ?? "").replace(/\bthe (?:creature|target)'s\b/gi, "its"));
  if (rounds) return { rounds };
  const minutes = /\bfor\s+(\d+|one|a)\s+minutes?\b/i.exec(sentence);
  if (minutes) return { minutes: Number(minutes[1]) || 1 };
  const hours = /\bfor\s+(\d+|one|an)\s+hours?\b/i.exec(sentence);
  if (hours) return { minutes: (Number(hours[1]) || 1) * 60 };
  return {};
}

/** Where a sentence's clock phrase starts, and the clock, or null. */
function clockMatch(sentence) {
  const m = /\b(until the (?:end|start|beginning) of [^.,;]*?turn|for\s+(?:\d+|one|a|an)\s+(?:rounds?|minutes?|hours?))\b/i.exec(String(sentence ?? ""));
  if (!m) return null;
  const clock = clockOf(m[1]);
  return clock.rounds || clock.minutes ? { index: m.index, clock } : null;
}

/**
 * The conditions one stretch of ladder text applies, each with its clock.
 *
 * WHICH CONDITIONS A CLOCK BELONGS TO. The phrase follows what it times,
 * and binds to the run of conditions straight before it ("Weakened 2 and
 * Slowed 1 for 1 minute": both). Prose between them takes the clock for
 * itself ("Frightened 2 and unable to move through the gate until the end
 * of its next turn": the gate, not the fear). And in a run of several,
 * Frightened keeps its own way out — the recovery save — rather than the
 * clock ("Frightened 3 and Dazed 1 until the end of the creature's next
 * turn": the daze); alone, it takes it ("Frightened 1 until the end of the
 * creature's next turn").
 *
 * @returns {Array<{key: string, value: number|null, rounds?: number, minutes?: number, increase?: number}>}
 */
function conditionsInText(text) {
  const rows = [];
  for (const sentence of String(text ?? "").split(/(?<=\.)\s+/)) {
    const found = [];
    // "increase Frightened by 1": relative, not a value.
    for (const m of sentence.matchAll(/\bincrease\s+([A-Z][A-Za-z-]+)\s+by\s+(\d+)/g)) {
      const hit = CONDITION_NAMES.find(([name]) => name === m[1]);
      if (hit) found.push({ at: m.index, end: m.index + m[0].length, row: { key: hit[1], value: null, increase: Number(m[2]) } });
    }
    for (const [name, key, valued] of CONDITION_NAMES) {
      const re = new RegExp(`\\b${escapeRe(name)}\\b(?:\\s+(\\d+))?`, "g");
      for (const m of sentence.matchAll(re)) {
        if (found.some((f) => m.index >= f.at && m.index < f.end)) continue;
        found.push({ at: m.index, end: m.index + m[0].length, row: { key, value: valued ? Number(m[1] ?? 1) : null } });
      }
    }
    found.sort((a, b) => a.at - b.at);
    const clock = clockMatch(sentence);
    if (clock) {
      const before = found.filter((f) => f.end <= clock.index);
      const last = before[before.length - 1];
      if (last && !sentence.slice(last.end, clock.index).trim()) {
        const chain = [last];
        for (let i = before.length - 2; i >= 0; i -= 1) {
          if (/^\s*(?:,|and|,\s*and)\s*$/i.test(sentence.slice(before[i].end, chain[0].at))) chain.unshift(before[i]); else break;
        }
        const timed = chain.length > 1 ? chain.filter((f) => f.row.key !== "frightened") : chain;
        for (const f of timed) Object.assign(f.row, clock.clock);
      }
    }
    rows.push(...found.map((f) => f.row));
  }
  return rows;
}

/**
 * Read a peril's Effect text (or one Routine action's text).
 *
 * @param {string} text the Effect line and its ladder, one degree a line
 * @returns {object} the declaration (see the file comment)
 */
function parsePerilEffect(text) {
  const lines = String(text ?? "").split(/\n+/).map((l) => l.trim()).filter(Boolean)
    .map((l, i) => (i === 0 ? l.replace(/^Effect\s+/, "") : l));
  const intro = [];
  const notes = [];
  const ladder = {};
  const ladderRe = new RegExp(`^((?:${DEGREE_WORD})(?:\\s*\\/\\s*(?:${DEGREE_WORD}))*)\\s+(.+)$`);
  let inLadder = false;
  for (const lineText of lines) {
    const m = ladderRe.exec(lineText);
    if (m) {
      inLadder = true;
      for (const word of m[1].split("/")) ladder[word.trim().toLowerCase()] = m[2].trim();
    } else if (inLadder) {
      notes.push(lineText);
    } else {
      intro.push(lineText);
    }
  }
  const introText = intro.join(" ");
  const all = lines.join(" ");

  const saveM = /\b(basic\s+)?(fortitude|reflex|will)\s+sav(?:e|ing throw)(?:\s+against\s+DC\s*(\d+))?/i.exec(introText);
  const damageM = /(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-z]+)\s+damage/i.exec(introText);
  const radiusM = /\bwithin\s+(\d+)\s+(?:feet|ft)/i.exec(introText);
  const everyone = /\b(every|all|each)\b/i.test(introText) && !/\bone creature\b/i.test(introText);
  const spec = {
    save: saveM ? saveM[2].toLowerCase() : "",
    basic: Boolean(saveM?.[1]),
    dc: saveM?.[3] ? Number(saveM[3]) : null,
    damage: damageM ? { formula: damageM[1].replace(/\s+/g, ""), type: damageM[2].toLowerCase() } : null,
    radiusFeet: radiusM && everyone ? Number(radiusM[1]) : 0,
    scope: radiusM && everyone ? "area" : "targets",
    livingOnly: /\bliving creatures?\b/i.test(introText),
    immuneIf: /\bdeaf creature is immune\b/i.test(all) ? ["deafened"] : [],
    initiative: /\broll(?:s)?\s+initiative\b/i.test(introText),
    intro: introText,
    notes,
    outcomes: {},
    conditions: {},
    overflow: null
  };

  // "On a Failure or worse, the creature becomes Frightened 2." — the inline
  // ladder of a stat block that prints no ladder lines.
  for (const m of introText.matchAll(new RegExp(`\\bOn an? (${DEGREE_WORD})( or (worse|better))?,?\\s+([^.]+\\.)`, "g"))) {
    const at = LADDER.indexOf(m[1].toLowerCase());
    const span = m[3] === "worse" ? LADDER.slice(at) : m[3] === "better" ? LADDER.slice(0, at + 1) : [LADDER[at]];
    for (const d of span) if (!ladder[d]) ladder[d] = m[4].trim();
  }
  const inlineOnly = Object.keys(ladder).length && !lines.some((l) => ladderRe.test(l));
  if (inlineOnly) {
    // "On a Failure, …" and "On a Fumble, …": a Blunder is at least a
    // Fumble; every rung the text does not reach is unaffected.
    if (!ladder.blunder && ladder.fumble) ladder.blunder = ladder.fumble;
    for (const d of LADDER) if (!ladder[d]) ladder[d] = "";
  }

  // Each rung: its own conditions, after any "As Fumble" it inherits.
  const rowsFor = {};
  const resolveRung = (d, seen = new Set()) => {
    if (rowsFor[d]) return rowsFor[d];
    const textHere = ladder[d];
    if (textHere === undefined) return [];
    let rows = [];
    let rest = textHere;
    const as = new RegExp(`^As\\s+(${DEGREE_WORD})\\b[,.]?\\s*(?:but\\s+|and\\s+)?`, "i").exec(textHere);
    if (as && !seen.has(d)) {
      seen.add(d);
      rows = resolveRung(as[1].toLowerCase(), seen).map((r) => ({ ...r }));
      rest = textHere.slice(as[0].length);
      // "As Failure for 1 minute" — a clock for the inherited rows. Only
      // when the clock comes straight after: "As Fumble, and the creature is
      // unable to cross the threshold for 24 hours" times the threshold.
      const clock = /^\s*(?:for|until)\b/i.test(rest) ? clockOf(rest.split(/(?<=\.)\s+/)[0] ?? "") : {};
      if (clock.rounds || clock.minutes) rows = rows.map((r) => ({ ...r, ...clock, ...(clock.rounds ? { minutes: undefined } : { rounds: undefined }) }));
    }
    if (/\bunaffected\b|\bno mechanical effect\b/i.test(rest) && !conditionsInText(rest).length) {
      rowsFor[d] = rows;
      return rows;
    }
    for (const row of conditionsInText(rest)) {
      const same = rows.findIndex((r) => r.key === row.key);
      if (same >= 0) rows[same] = row; else rows.push(row);
    }
    rowsFor[d] = rows;
    return rows;
  };
  for (const d of LADDER) {
    if (ladder[d] === undefined) continue;
    spec.outcomes[d] = ladder[d];
    spec.conditions[d] = resolveRung(d).map(cleanRow);
  }

  const over = /whose\s+([A-Z][A-Za-z-]+)\s+condition\s+would\s+exceed\s+(\d+)\s+instead\s+becomes\s+([A-Z][A-Za-z-]+)\s+(\d+)([^.]*)/.exec(all);
  if (over) {
    const from = CONDITION_NAMES.find(([name]) => name === over[1]);
    const into = CONDITION_NAMES.find(([name]) => name === over[3]);
    if (from && into) spec.overflow = { key: from[1], cap: Number(over[2]), into: into[1], per: Number(over[4]) || 1, ...clockOf(over[5]) };
  }
  return spec;
}

function cleanRow(row) {
  const out = { key: row.key, value: row.value ?? null };
  if (row.increase) out.increase = row.increase;
  if (row.rounds) out.rounds = row.rounds;
  if (row.minutes) out.minutes = row.minutes;
  return out;
}

/**
 * A declaration made whole: an object as given (a module's), or the text
 * read. Null when there is nothing to roll or apply.
 *
 * @param {object|string|null} effect
 * @param {string} [fallbackText]
 */
/** Declared further damage packets, each `{formula, type}`; [] when none. */
function normaliseExtraDamage(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map((p) => ({ formula: String(p?.formula ?? p?.dice ?? "").replace(/\s+/g, ""), type: String(p?.type ?? "").trim().toLowerCase() }))
    .filter((p) => /^\d+d\d+([+-]\d+)?$/i.test(p.formula) && /^[a-z]+$/.test(p.type));
}

export function perilEffectSpec(effect, fallbackText = "") {
  let spec = null;
  if (effect && typeof effect === "object") {
    const parsed = effect.text ? parsePerilEffect(effect.text) : parsePerilEffect("");
    spec = { ...parsed, ...effect };
    spec.outcomes = { ...parsed.outcomes, ...(effect.outcomes ?? {}) };
    spec.conditions = { ...parsed.conditions, ...(effect.conditions ?? {}) };
  } else {
    const text = typeof effect === "string" && effect.trim() ? effect : fallbackText;
    if (!String(text ?? "").trim()) return null;
    spec = parsePerilEffect(text);
  }
  spec.save = SAVES.includes(String(spec.save ?? "").toLowerCase()) ? String(spec.save).toLowerCase() : "";
  spec.immuneIf = Array.isArray(spec.immuneIf) ? spec.immuneIf : [];
  spec.radiusFeet = Math.max(0, Math.trunc(Number(spec.radiusFeet) || 0));
  // "sharedSpace" (3.632.0): a swarm's attack — every creature whose space
  // overlaps the user's. See peril-workflow `effectTargets`.
  spec.scope = spec.scope === "area" && spec.radiusFeet > 0 ? "area" : spec.scope === "sharedSpace" ? "sharedSpace" : "targets";
  // FURTHER PACKETS (3.633.0, F&F 3.0 R10): "1d6 slashing plus 1d6 cold".
  spec.extraDamage = normaliseExtraDamage(spec.extraDamage);
  return spec;
}

/**
 * What one creature's save degree brings: the line and the condition tags,
 * each on its own clock. A blank rung reads its neighbour.
 *
 * @returns {{text: string, rows: object[], tags: object[]}}
 */
export function perilEffectOutcome(spec, degree, { combatRound = null, worldTime = 0 } = {}) {
  let key = String(degree ?? "").toLowerCase();
  if (!LADDER.includes(key)) key = "failure";
  const pick = (table) => {
    if (!table) return undefined;
    if (table[key] !== undefined) return table[key];
    const alt = FALLBACK[key];
    return alt !== undefined ? table[alt] : undefined;
  };
  let text = String(pick(spec?.outcomes) ?? "");
  // "AS FUMBLE, BUT …" (3.629.1): the card says what the Fumble was, so the
  // line reads whole — "As Fumble (Frightened 2 and cannot willingly approach
  // the bed for 1 minute.), but the target …". One step only.
  const as = new RegExp(`^As\\s+(${DEGREE_WORD})\\b`, "i").exec(text);
  const inherited = as ? String(spec?.outcomes?.[as[1].toLowerCase()] ?? "").trim() : "";
  if (as && inherited && !/^As\s/i.test(inherited)) text = `${as[0]} (${inherited})${text.slice(as[0].length)}`;
  // A RUNG THAT PRINTS ITS OWN LINE APPLIES ITS OWN CONDITIONS (3.631.1,
  // found live): Wing Buffet's Partial is "pushed 5 feet" and nothing else,
  // its Failure "pushed 10 feet and falls prone". The fallback exists for
  // an inline "On a Failure or worse" ladder, where the Partial prints
  // nothing of its own — a Partial with its own printed outcome never
  // borrows the Failure's conditions.
  const ownLine = spec?.outcomes?.[key] !== undefined;
  const rows = ((ownLine ? spec?.conditions?.[key] : pick(spec?.conditions)) ?? []).filter((r) => r && r.key && CONDITIONS[r.key]);
  const tags = rows.filter((r) => !r.increase).map((r) => declaredConditionTag(r, { combatRound, worldTime }));
  return { text, rows, tags };
}

/**
 * "Increase Frightened by 1", and the overflow beyond a cap: the values to
 * write, from what the creature holds now.
 *
 * @returns {Array<{key: string, value: number, rounds?: number, minutes?: number}>}
 */
export function perilIncreaseRows(rows = [], held = () => 0, overflow = null) {
  const out = [];
  for (const row of rows.filter((r) => r?.increase)) {
    let next = Number(held(row.key) || 0) + Number(row.increase);
    if (overflow && overflow.key === row.key && next > overflow.cap) {
      const excess = next - overflow.cap;
      next = overflow.cap;
      out.push({ key: overflow.into, value: excess * (overflow.per || 1), ...(overflow.rounds ? { rounds: overflow.rounds } : {}), ...(overflow.minutes ? { minutes: overflow.minutes } : {}) });
    }
    out.push({ key: row.key, value: next, ...(row.rounds ? { rounds: row.rounds } : {}), ...(row.minutes ? { minutes: row.minutes } : {}) });
  }
  return out;
}

/** "Unaffected"/"no effect" when a rung applies nothing and prints nothing. */
export function perilEffectSummary(spec, { dc = null } = {}) {
  if (!spec) return "";
  const bits = [];
  if (spec.save) bits.push(`${spec.basic ? "Basic " : ""}${spec.save[0].toUpperCase()}${spec.save.slice(1)} DC ${dc ?? spec.dc ?? "?"}`);
  if (spec.damage) bits.push(`${spec.damage.formula} ${spec.damage.type}`);
  bits.push(spec.scope === "area" ? `everyone within ${spec.radiusFeet} ft${spec.livingOnly ? " (living)" : ""}` : `the GM's targets${spec.livingOnly ? " (living)" : ""}`);
  if (spec.immuneIf.length) bits.push(`immune if ${spec.immuneIf.join(", ")}`);
  const rungs = LADDER.filter((d) => spec.conditions?.[d]?.length)
    .map((d) => `${d[0].toUpperCase()}${d.slice(1)}: ${spec.conditions[d].map((r) => `${CONDITIONS[r.key]?.label ?? r.key}${r.increase ? ` +${r.increase}` : r.value ? ` ${r.value}` : ""}${r.rounds ? ` (${r.rounds} rd)` : r.minutes ? ` (${r.minutes} min)` : ""}`).join(", ")}`);
  return [bits.join(" · "), ...rungs].join("; ");
}
