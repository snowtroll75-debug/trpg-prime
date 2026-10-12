#!/usr/bin/env node
/**
 * survey-inert-warps — how many warping options still do nothing, and
 * which of those could be built with the vocabulary that already exists?
 *
 * NEW at 3.536.1, and it exists because of a mistake I made.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS IS A TOOL AND NOT A PARAGRAPH IN A REPORT.
 *
 * I spent several releases telling Graham the warp backlog stood at "57
 * inert warps over 44 spells, no channels left", and used that figure to
 * argue for moving off spells onto other work. When he asked me to
 * justify the move I went to check, and there was nothing to check
 * against: no file recorded it, and I could not reproduce the filter that
 * produced it. The real figure is 333.
 *
 * A number nobody can re-derive is not a measurement, it is a memory. So
 * the survey is a script, it is in the repo, and anyone can run it and
 * get the same answer.
 *
 * ─────────────────────────────────────────────────────────────────────
 * HOW A WARP IS JUDGED, AND WHY PRECEDENT RATHER THAN MY READING.
 *
 * An inert warp is one whose `mods` object is empty: the option is
 * offered on the chooser, the PP is charged, and nothing happens.
 *
 * The tempting way to sort them is to read each sentence and decide
 * whether it looks buildable. That is exactly the prose-parser this
 * repository keeps refusing to write — its mistakes would look identical
 * to the findings, and I have already been wrong twice today reading
 * sentences (the armourless classes, the tower shield).
 *
 * So the primary evidence is PRECEDENT. 369 warps in the pack are built.
 * If an inert warp's sentence closely matches a built one, then the
 * system demonstrably can express that sentence — a fact about the data,
 * not an opinion about the English. Those are reported as BUILDABLE with
 * the precedent named, so every row can be checked.
 *
 * Only where no precedent exists does the survey fall back to keyword
 * evidence, and those rows are reported separately and honestly as
 * CANDIDATE — a guess to be confirmed, never a promise.
 *
 * A row with neither is UNMAPPED. That is not "impossible": Vital
 * Beacon's "restores an additional die of HP" is plainly buildable and
 * simply has no twin yet. It means nothing in this file supports a claim
 * about it, which is the honest thing to say.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { emptyWarp } from "../module/magic/spell-warp.mjs";
import { targetCapFor } from "../module/magic/target-count.mjs";
import { warpedAreaText } from "../module/magic/warp-area.mjs";

const VOCABULARY = Object.keys(emptyWarp().mods);

/* Words that carry no signal about what a warp DOES. Stripped before
 * comparison so "the duration increases to 10 minutes" and "the duration
 * increases to 1 hour" are recognised as the same sentence. */
const NOISE = new Set(["the", "a", "an", "of", "to", "by", "is", "are", "you", "your",
  "this", "that", "it", "its", "and", "or", "for", "with", "at", "in", "on", "as", "may",
  "can", "be", "each", "per", "one", "two", "three", "up", "if", "when", "which", "has",
  "have", "from", "into", "additional", "extra", "instead", "also", "option", "spell"]);

const shape = (text) => String(text ?? "").toLowerCase()
  .replace(/\d+/g, "#")
  .replace(/[^a-z#\s]/g, " ")
  .split(/\s+/)
  .filter((w) => w && !NOISE.has(w));

function similarity(a, b) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hits = a.filter((w) => setB.has(w)).length;
  return (2 * hits) / (a.length + b.length);
}

async function readSpells() {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, v] of db.iterator()) if (v?.name && v.type === "spell") out.push(v);
  await db.close();
  return out;
}

const spells = await readSpells();
const built = [];
const inert = [];
for (const s of spells) {
  for (const w of s.system?.warps ?? []) {
    const row = { spell: s.name, text: String(w.text ?? ""), mods: w.mods ?? {}, pp: w.ppCost,
      kinds: (s.system?.effects ?? []).map((e) => String(e?.kind ?? "")).filter(Boolean),
      targets: String(s.system?.targets ?? ""),
      area: String(s.system?.area ?? "") };
    if (Object.keys(row.mods).length) built.push(row); else inert.push(row);
  }
}

const builtShapes = built.map((b) => ({ ...b, shape: shape(b.text) }));

/* Keyword fallback. Deliberately listed here rather than buried, because
 * every row it decides is a guess and the reader should see the rule. */
const HINTS = [
  [/\bdamage\b|\bdice\b|\bd\d/i, "damageDice / rowExtra"],
  [/\bduration\b|\bminute|\bhour|\bround\b|\bday\b|\bunlimited\b|\bpermanent\b/i, "durationText"],
  [/\brange\b|\bfeet\b|\bfoot\b|\btouch\b/i, "rangeOverride"],
  [/\bradius\b|\bcone\b|\bburst\b|\bemanation\b|\bline\b/i, "areaOverride / areaGrowth"],
  [/\btarget|\bcreature|\ballies\b|\benem/i, "extraTargets / targetCap"],
  [/\bbonus\b|\bincreases by\b|\+\s*\d/i, "bonusValue / bonusMax"],
  [/\bheal|\brestore|\bhp\b|\bhit points\b/i, "healDice / healBonus"],
  [/\bbleed/i, "bleedPoints / reduceBleed"],
  [/\bcondition|\bblinded|\bstunned|\bfrightened|\bdisease|\bpoison|\bcursed?\b/i,
    "reliefConditions / suppressConditions"],
  [/\bpotency\b|\brune\b/i, "potencyStep / potencyMax"],
  [/\bsave\b|\bdc\b/i, "saveDC"],
  [/\baction|\bAP\b/i, "castApSet / castApDelta"]
];

/* THE THRESHOLD ALONE WAS NOT ENOUGH, AND THE SPOT-CHECK IS WHY.
 *
 * At 0.62 similarity this reported 75 BUILDABLE, and reading the first
 * twenty showed roughly two thirds were wrong: "increase the length of
 * the WALL by 10 feet" matched "increase the RANGE to 30 feet"; four
 * summoning spells' "increase the LEVEL of the creature" matched
 * "target 1 creature PER LEVEL"; "Hardness +2 (max 14)" matched "target
 * an additional creature (max 5)". Shared tokens, opposite meanings.
 *
 * So a precedent must now ALSO agree on the subject: the content nouns
 * one sentence uses and the other does not are checked against a list of
 * words that change what a warp is about. A wall is not a range, a
 * creature's level is not a count of creatures, and hardness is not a
 * target.
 *
 * This is still a heuristic and it is still checked by hand. What it is
 * not any more is a number that falls apart the first time somebody
 * reads it. */
/* ── A MATCHING SENTENCE IS NOT A BUILDABLE WARP ──────────────────
 *
 * The mod also has to be REACHABLE on that spell, and twice now I have
 * proposed a batch that was not.
 *
 * 3.538.2: the four "gain an additional natural attack" warps, against
 * Wild Morph's `morphForms`. Nearly identical sentences, real precedent —
 * but `morphForms` is read only inside the `wildMorph` effect row, which
 * grows forms from a Studied Target. The Shape spells have no rows.
 *
 * 3.539.0: the condition-relief batch — Animal Healing, Renewal's Touch,
 * Indomitable, Delay Pain. `reliefConditions` needs a `conditionRelief`
 * row. Restoration has one, which is why ITS warps work. These four have
 * `heal` and `note` rows, with the relief written as ENGLISH INSIDE THE
 * NOTE: "Also reduces the animal's bleed by 1 (warpable to reduce
 * dazed/weakened/injured)". Prose is not a mechanism. Same shape as the
 * Wash Away Sin defect, where the damage side was a note.
 *
 * SO THE TEST IS ROW KIND, NOT ROW COUNT — "has a row this mod can be
 * read from", not "has any rows at all". My first version checked the
 * count and would have passed all four relief spells.
 *
 * DERIVED AT RUNTIME, NOT LISTED. The map below is computed by reading
 * which `case "<kind>":` branch of spell-effects.mjs reads which mod,
 * following one hop through the `warped*` helpers. A list I maintained by
 * hand would be another memory to go stale — which is the mistake this
 * whole tool exists to correct. */

const MODULE_ROOT = path.join(SYSTEM_ROOT, "module");

function walkMjs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walkMjs(path.join(dir, e.name))
      : (e.name.endsWith(".mjs") ? [path.join(dir, e.name)] : []));
}

function buildRowKindMap() {
  const reads = (body) => VOCABULARY.filter((k) =>
    new RegExp("(warpMods|mods)\\s*\\??\\.\\s*" + k + "\\b").test(body));

  /* Which exported helper reads which mods — the hop that matters,
   * because a case branch usually calls warpedSuppression(effect,
   * warpMods) rather than touching the mod itself. */
  const helper = {};
  for (const file of walkMjs(MODULE_ROOT)) {
    const src = fs.readFileSync(file, "utf8");
    /* `export ASYNC function` too. Missing it made this map silently
     * under-detect, which over-reports BUILDABLE — Eldritch Weapon's
     * potency warp was rated buildable because `applyRuneGrant` is async
     * and the regex skipped it, so nothing knew potencyStep needs a
     * `runeGrant` row. Third time this tool has over-claimed; the first
     * two were the matcher, this one was mine. */
    const re = /export\s+(?:async\s+)?function\s+([a-zA-Z]+)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const end = src.indexOf("\n}", m.index);
      const hit = reads(src.slice(m.index, end === -1 ? src.length : end));
      if (hit.length) helper[m[1]] = hit;
    }
  }

  const src = fs.readFileSync(path.join(MODULE_ROOT, "magic", "spell-effects.mjs"), "utf8");
  const marks = [...src.matchAll(/case\s+"([a-zA-Z]+)":/g)].map((m) => ({ kind: m[1], at: m.index }));
  const map = {};
  for (let i = 0; i < marks.length; i += 1) {
    const body = src.slice(marks[i].at, marks[i + 1]?.at ?? src.length);
    const found = new Set(reads(body));
    for (const [fn, mods] of Object.entries(helper)) {
      if (new RegExp("\\b" + fn + "\\s*\\(").test(body)) for (const k of mods) found.add(k);
    }
    for (const k of found) (map[k] ??= new Set()).add(marks[i].kind);
  }
  return map;
}

const ROW_KINDS_FOR = buildRowKindMap();

const SIMILAR_ENOUGH = 0.62;

/* Nouns that decide what a sentence is ABOUT. If one text has one and
 * the other does not, they are not the same sentence however many words
 * they share. */
const SUBJECTS = ["wall", "length", "height", "hardness", "hp", "level", "rune",
  "potency", "bleeding", "bleed", "range", "area", "radius", "cone", "emanation",
  "duration", "target", "creature", "attack", "damage", "heal", "healed", "bonus",
  "condition", "save", "dc", "action", "reduce", "temporary"];

function sameSubject(a, b) {
  const A = new Set(a.filter((w) => SUBJECTS.includes(w)));
  const B = new Set(b.filter((w) => SUBJECTS.includes(w)));
  if (!A.size || !B.size) return false;
  for (const w of A) if (!B.has(w)) return false;
  for (const w of B) if (!A.has(w)) return false;
  return true;
}

const rows = inert.map((row) => {
  const sh = shape(row.text);
  /* THE BEST MATCH THAT ALSO AGREES ON SUBJECT — not the best match,
   * then tested. Scoring first and filtering second threw away rows
   * whose closest neighbour was a false friend while a real twin sat
   * one place below it. */
  let best = null;
  let bestAny = null;
  for (const b of builtShapes) {
    const score = similarity(sh, b.shape);
    if (!bestAny || score > bestAny.score) bestAny = { score, ...b };
    if (!sameSubject(sh, b.shape)) continue;
    if (!best || score > best.score) best = { score, ...b };
  }
  if (best && best.score >= SIMILAR_ENOUGH) {
    /* A CAST-LEVEL MOD CAN BE UNREACHABLE TOO — the third blocking
     * reason, and it has now caught three separate batches.
     *
     * These mods pass the row-kind test because they are read at cast
     * level, but each one RAISES A PRINTED FIELD, and does nothing at all
     * when that field is blank. Measured, not assumed:
     *
     *   targetCapFor("", {targetCap: 2})        -> null
     *   warpedAreaText("", {areaGrowth: 5})     -> ""
     *   targetCapFor("1 creature", {targetCap: 2}) -> 2      (the control)
     *   warpedAreaText("20-foot radius", {areaGrowth: 10}) -> "30-foot radius"
     *
     * WHO THIS CAUGHT: True Seeing and Invisibility print an empty target
     * line — they have no range and no area, so they affect the caster and
     * never needed a target count. Wall Of Fire and Wall Of Ice print no
     * AREA, so "increase the radius of the ring by 5 feet" has no radius
     * to increase; their own areas live in prose, which is the same
     * missing-base problem in a different field. */
    const NEEDS_PRINTED = [
      { mods: ["targetCap", "extraTargets", "targetCapPerLevel"], field: "targets",
        blank: (r) => targetCapFor(r.targets, { targetCap: 2, extraTargets: 1 }, 12) === null },
      { mods: ["areaGrowth", "areaMax"], field: "area",
        blank: (r) => !String(warpedAreaText(r.area, { areaGrowth: 10 })).trim() }
    ];
    for (const rule of NEEDS_PRINTED) {
      if (!Object.keys(best.mods).some((k) => rule.mods.includes(k))) continue;
      if (!rule.blank(row)) continue;
      return { ...row, verdict: "BLOCKED", evidence:
        `precedent "${best.text}" on ${best.spell} raises the printed ${rule.field}, and this `
        + `spell prints none (${JSON.stringify(rule.field === "area" ? row.area : row.targets)}) `
        + "— the mod is read but has nothing to act on", score: best.score };
    }

    const missing = Object.keys(best.mods)
      .map((k) => ({ mod: k, kinds: ROW_KINDS_FOR[k] }))
      .filter(({ kinds }) => kinds && ![...kinds].some((kind) => row.kinds.includes(kind)));
    if (missing.length) {
      const { mod, kinds } = missing[0];
      return { ...row, verdict: "BLOCKED", evidence:
        `precedent "${best.text}" on ${best.spell} uses ${mod}, which is read only from a `
        + `${[...kinds].join(" / ")} row — and this spell has `
        + (row.kinds.length ? `only ${row.kinds.join(", ")} rows` : "no effect rows"),
        score: best.score };
    }
    return { ...row, verdict: "BUILDABLE", evidence:
      `precedent: "${best.text}" on ${best.spell} → ${JSON.stringify(best.mods)}`,
      score: best.score };
  }
  const hint = HINTS.find(([re]) => re.test(row.text));
  if (hint) return { ...row, verdict: "CANDIDATE", evidence: `keyword → ${hint[1]}`, score: bestAny?.score ?? 0 };
  return { ...row, verdict: "UNMAPPED", evidence: "no precedent and no keyword", score: bestAny?.score ?? 0 };
});

const by = (v) => rows.filter((r) => r.verdict === v);
const spellsOf = (list) => new Set(list.map((r) => r.spell)).size;

if (process.argv.includes("--list")) {
  const want = (process.argv.find((a) => /^--(buildable|blocked|candidate|unmapped)$/.test(a)) ?? "").slice(2).toUpperCase();
  for (const r of rows.filter((r) => !want || r.verdict === want)) {
    process.stdout.write(`${r.verdict.padEnd(9)} ${r.spell} (${r.pp} PP)\n    "${r.text}"\n    ${r.evidence}\n`);
  }
}

process.stdout.write(`
survey-inert-warps — ${spells.length} spells, ${built.length + inert.length} warping options

  built and working      ${String(built.length).padStart(4)}
  INERT (mods: {})       ${String(inert.length).padStart(4)}  over ${spellsOf(rows)} spells

  of the inert:
    BLOCKED              ${String(by("BLOCKED").length).padStart(4)}  over ${spellsOf(by("BLOCKED"))} spells — the sentence matches a built
                                warp, but its mod cannot reach this spell — no effect row of
                                the kind that reads it, or no printed field for it to
                                raise. The base has to be built first.
    BUILDABLE            ${String(by("BUILDABLE").length).padStart(4)}  over ${spellsOf(by("BUILDABLE"))} spells — a near-identical
                                sentence is ALREADY BUILT on another spell, so the
                                system demonstrably expresses it. Named per row.
    CANDIDATE            ${String(by("CANDIDATE").length).padStart(4)}  over ${spellsOf(by("CANDIDATE"))} spells — no precedent, but the
                                text names something in the vocabulary. A guess to
                                confirm one at a time, not a promise.
    UNMAPPED             ${String(by("UNMAPPED").length).padStart(4)}  over ${spellsOf(by("UNMAPPED"))} spells — nothing here supports
                                a claim either way. Some are plainly buildable and
                                simply have no twin; some are narrative.

  vocabulary: ${VOCABULARY.length} declared mod keys
  --list [--buildable|--blocked|--candidate|--unmapped] prints every row with its evidence
`);
