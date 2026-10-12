#!/usr/bin/env node
/**
 * parse-degree-ladders — propose `onSave` gating for spells whose
 * printed outcomes are unambiguous, and REFUSE the rest with reasons.
 *
 * NEW at 3.405.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS REFUSES MORE THAN IT PROPOSES.
 *
 * 68 spells print a per-degree ladder and carry one flattened row. The
 * obvious move is a parser that turns each ladder into effects, and it
 * would be wrong: the ladders are not one shape, they are at least six,
 * and only one of them is expressible today.
 *
 *   CLEAN     "The creature is sickened 1." — a condition, optionally
 *             with an integer, optionally two joined by "and".
 *
 *   DURATION  "dazzled for 1 round" / "for 1 minute" / "for 1 hour"
 *             (Luminous Flare). The gate carries no per-effect duration,
 *             so wiring these would apply the right condition for the
 *             WRONG length — three different lengths flattened again,
 *             one layer down.
 *
 *   FORMULA   "stunned 1 round per 2 failure" (Holy Shout). Scaled by
 *             the margin, which nothing expresses.
 *
 *   DAMAGE    "takes 2d10 bludgeoning damage and gains the grabbed
 *             condition" (Disturbing Tentacles). Degree-gated damage is
 *             plausible but untested, and a wrong damage row is worse
 *             than none.
 *
 *   PROSE     "can't use reactions" (Ramirez Rhythm), "movement against
 *             the wind is classed as difficult terrain" (Gust). Real
 *             rules with no condition behind them.
 *
 *   MULTI     Disturbing Tentacles prints TWO ladders — one for entering
 *             the area and one for ending a turn in it. A parser that
 *             splits on degree words merges them into nonsense.
 *
 * THIS PROJECT HAS ALREADY PAID FOR A PARSER THAT DID NOT KNOW WHERE AN
 * ENTRY STOPPED: three wrong values written into Neutralise Poison,
 * absorbed from Nexus Of Elemental Energy. So this one proposes only
 * where every degree of a spell is CLEAN, and prints the reason for
 * every spell it will not touch.
 *
 * USAGE:  node tools/parse-degree-ladders.mjs          # report only
 *         node tools/parse-degree-ladders.mjs --write  # emit proposals
 *
 * It never edits the pack. `--write` emits JSON for review and for
 * tools/data-fixes.json, which is still the only thing that changes data.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { CONDITIONS } from "../module/conditions/registry.mjs";
import { isDegreeGated } from "../module/magic/spell-degrees.mjs";

const DEGREE_WORDS = ["Heroic", "Critical", "Success", "Partial", "Failure", "Fumble", "Blunder"];
const DEGREE_RE = new RegExp(`\\b(${DEGREE_WORDS.join("|")})\\b`, "g");

/** condition label (lower-case) → registry key. */
const BY_LABEL = new Map();
for (const [key, def] of Object.entries(CONDITIONS)) {
  BY_LABEL.set(String(def.label ?? key).trim().toLowerCase(), key);
  BY_LABEL.set(key.toLowerCase(), key);
}

const strip = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/** The part of a description before any warping / caster-level section. */
function baseText(description) {
  const full = strip(description);
  return full.split(/warping options|caster level modifications/i)[0];
}

/**
 * Split a description into `{degree: text}`.
 *
 * RETURNS NULL WHEN A DEGREE REPEATS — that is a spell with more than one
 * ladder, and merging them is exactly the mistake the Nexus parser made.
 */
function ladderOf(description) {
  const base = baseText(description);
  const parts = base.split(DEGREE_RE);
  if (parts.length < 3) return null;
  const out = {};
  for (let i = 1; i < parts.length; i += 2) {
    const key = parts[i].toLowerCase();
    if (out[key] !== undefined) return null;      // two ladders — refuse
    out[key] = String(parts[i + 1] ?? "").trim();
  }
  return Object.keys(out).length >= 2 ? out : null;
}

/**
 * Phrases meaning the ladder's save is NOT the one rolled at cast time.
 *
 * THE MOST DANGEROUS REFUSAL, AND IT WAS FOUND BY CHECKING THE OUTPUT
 * RATHER THAN TRUSTING IT. The parser's first run proposed five spells
 * and TWO of them were wrong in a way no sentence-level check could see:
 *
 *   SPEED          "When the spell ends, the target must make a Will
 *                   Saving Throw. Critical fatigued 1 …" — the spell's
 *                   own effect is `quickened`; the ladder is the price
 *                   paid LATER. Gating it on the cast's save would
 *                   fatigue the target the moment it was hasted.
 *   DULLING CLOUD  "Each breathing creature that STARTS ITS TURN in the
 *                   spell's area must make a saving throw." A recurring
 *                   save, once per turn, for as long as the cloud lasts.
 *
 * Every degree sentence in both reads perfectly cleanly — "The target is
 * stunned 1." The context that makes them wrong sits in the paragraph
 * ABOVE the ladder, which is exactly where a sentence parser does not
 * look.
 */
const DEFERRED_SAVE = [
  /when the spell ends/i,
  /starts? its turn/i,
  /ends? its turn/i,
  /at the (start|beginning|end) of (each|its|their)/i,
  /each round/i,
  /once per round/i
];

/**
 * Commentary that may follow an outcome without changing it.
 */
const COMMENTARY = /^(be aware|note[:.]|this spell|the spell inflicts)/i;

/**
 * Lift a "for N units" span off a clause.
 *
 * PER CLAUSE, NOT PER SENTENCE, AND THE DIFFERENCE IS THE WHOLE BUG THIS
 * FUNCTION EXISTS TO AVOID. The first version of this parser found the
 * first span in the sentence and gave it to every condition in it. Run
 * against the pack it produced, as its very first proposal:
 *
 *   LUMINOUS FLARE, failure
 *     printed  "blinded for 1 round and dazzled for 1 minute"
 *     proposed  blinded 1 round, dazzled 1 ROUND
 *
 *   COLOUR SPRAY, failure
 *     printed  "stunned 1, blinded for 1 round, and dazzled for 1 minute"
 *     proposed  stunned 1 round, blinded 1 round, dazzled 1 ROUND
 *
 * Three conditions, two real spans and one deliberately absent, all
 * flattened to the first — the identical mistake to the one 3.404.0
 * removed from the recipient layer and 3.405.0 removes from the length
 * layer, reintroduced by the tool meant to fix it, one layer further
 * down again. A parser that "mostly works" writes wrong data into
 * twelve spells and each looks plausible on the card.
 */
function liftSpan(clause) {
  const m = clause.match(/\bfor\s+(\d+\s*(?:rounds?|minutes?|hours?|days?))\b/i);
  if (!m) return { text: clause, span: null };
  const text = `${clause.slice(0, m.index)}${clause.slice(m.index + m[0].length)}`.trim();
  return { text, span: m[1].replace(/\s+/g, " ").trim() };
}

/** Strip the subject so "The creature is dazzled" and "dazzled" read alike. */
function stripSubject(clause) {
  return clause
    .replace(/^(the\s+)?(target|creature|subject|it)\s+/i, "")
    .replace(/^(is|becomes|are)\s+/i, "")
    .replace(/^gains?\s+the\s+/i, "")
    .replace(/\s+condition$/i, "")
    .trim();
}

/**
 * Read one degree's text as a list of `{condition, value?, duration?}`,
 * or say why it cannot be read.
 *
 * ONLY THE FIRST SENTENCE IS THE OUTCOME. Everything after it is either
 * commentary, which is ignored, or another rule — and another rule is a
 * REFUSAL, not something to drop quietly. Hold Kind's fumble ends "At
 * the end of each of its turns, it can attempt a new Will save to reduce
 * the remaining duration"; Ghoul Touch's carries an entire secondary
 * area effect. Wiring the first sentence and discarding the second would
 * report those spells as finished while silently losing a rule apiece,
 * which is worse than leaving them flattened where they can still be
 * seen.
 */
function readOutcome(text) {
  const whole = String(text ?? "").trim();
  if (!whole) return { kind: "EMPTY" };

  const sentences = whole.split(/(?<=\.)\s+/).map((x) => x.trim()).filter(Boolean);
  const first = sentences[0] ?? "";
  const rest = sentences.slice(1).join(" ").trim();
  if (rest && !COMMENTARY.test(rest)) {
    return { kind: "REMAINDER", detail: rest.slice(0, 58) };
  }

  if (/\bunaffected\b/i.test(first) || /^no (adverse )?effects?\b/i.test(first)) {
    return { kind: "CLEAN", effects: [] };
  }
  if (/\b(\d+d\d+|damage)\b/i.test(first)) return { kind: "DAMAGE" };
  if (/\bper\b\s+\d+\s+(failure|success)/i.test(first)) return { kind: "FORMULA" };
  if (/\buntil\b/i.test(first)) return { kind: "DURATION" };

  // "stunned 1, blinded for 1 round, and dazzled for 1 minute" → three.
  const body = first.replace(/\.$/, "");
  const clauses = body.split(/\s*,\s*(?:and\s+)?|\s+and\s+/i).map((c) => c.trim()).filter(Boolean);
  const found = [];
  for (const clause of clauses) {
    const { text: withoutSpan, span } = liftSpan(clause);
    const label = stripSubject(withoutSpan);
    const m = label.match(/^([a-z'’ -]+?)\s*(\d+)?$/i);
    if (!m) return { kind: "PROSE", detail: label.slice(0, 58) };
    const key = BY_LABEL.get(m[1].trim().toLowerCase());
    if (!key) return { kind: "PROSE", detail: m[1].trim().slice(0, 58) };
    const entry = { condition: key };
    if (m[2] !== undefined) entry.value = Number(m[2]);
    if (span) entry.duration = span;
    found.push(entry);
  }
  if (!found.length) return { kind: "PROSE", detail: first.slice(0, 58) };
  return { kind: "CLEAN", effects: found };
}

async function spellsPack() {
  const dir = path.join(SYSTEM_ROOT, "packs", "spells");
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(dir, { valueEncoding: "json" });
  await db.open();
  const out = [];
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value?.type !== "spell") continue;
      out.push(value);
    }
  } finally {
    await db.close();
  }
  return out;
}

const spells = await spellsPack();
const proposals = [];
const refused = [];

for (const spell of spells) {
  const effects = spell.system?.effects ?? [];
  if (effects.some(isDegreeGated)) continue;
  if (!effects.some((e) => e.kind === "condition")) continue;

  const ladder = ladderOf(spell.system?.description);
  if (!ladder) { refused.push({ name: spell.name, why: "MULTI or no readable ladder" }); continue; }

  // THE SAVE MUST BE THE CAST'S OWN. Checked against the text BEFORE the
  // first degree word, which is where the spell says when the save
  // happens — see DEFERRED_SAVE.
  const preamble = baseText(spell.system?.description).split(DEGREE_RE)[0];
  const deferred = DEFERRED_SAVE.find((re) => re.test(preamble));
  if (deferred) {
    refused.push({ name: spell.name, why: `DEFERRED save (${deferred.source.slice(0, 28)})` });
    continue;
  }

  const read = {};
  let blocked = null;
  for (const [degree, text] of Object.entries(ladder)) {
    const outcome = readOutcome(text);
    if (outcome.kind !== "CLEAN") {
      blocked = `${outcome.kind} on ${degree}${outcome.detail ? ` ("${outcome.detail}")` : ""}`;
      break;
    }
    read[degree] = outcome.effects;
  }
  if (blocked) { refused.push({ name: spell.name, why: blocked }); continue; }

  // THE TARGET AND ANY NON-CONDITION EFFECTS ARE PRESERVED. Only the
  // condition rows are replaced; a note beside them stays untouched.
  const template = effects.find((e) => e.kind === "condition");
  const kept = effects.filter((e) => e.kind !== "condition");
  const built = [];
  for (const [degree, list] of Object.entries(read)) {
    for (const entry of list) {
      const row = { kind: "condition", target: template.target ?? "targets",
        condition: entry.condition, onSave: [degree] };
      if (entry.value !== undefined) row.value = entry.value;
      // THE PER-DEGREE SPAN. Absent means "the spell's own duration",
      // which is what every effect meant before 3.405.0.
      if (entry.duration) row.duration = entry.duration;
      built.push(row);
    }
  }
  if (!built.length) { refused.push({ name: spell.name, why: "every degree unaffected" }); continue; }

  proposals.push({ name: spell.name, from: effects, to: [...built, ...kept], ladder });
}

process.stdout.write(`parse-degree-ladders: ${proposals.length} proposed, ${refused.length} refused\n\n`);
process.stdout.write("PROPOSED\n");
for (const p of proposals) {
  process.stdout.write(`  ${p.name}\n`);
  for (const [deg, text] of Object.entries(p.ladder)) {
    process.stdout.write(`      ${deg.padEnd(9)} ${text.slice(0, 62)}\n`);
  }
}
process.stdout.write("\nREFUSED\n");
const byReason = {};
for (const r of refused) {
  const head = r.why.split(" ")[0];
  (byReason[head] ??= []).push(`${r.name} — ${r.why}`);
}
for (const [reason, list] of Object.entries(byReason)) {
  process.stdout.write(`  ${reason} (${list.length})\n`);
  for (const l of list) process.stdout.write(`      ${l}\n`);
}

if (process.argv.includes("--write")) {
  const dest = path.join(SYSTEM_ROOT, "tools", "degree-ladder-proposals.json");
  fs.writeFileSync(dest, `${JSON.stringify(proposals, null, 2)}\n`);
  process.stdout.write(`\nwritten: tools/degree-ladder-proposals.json\n`);
}
