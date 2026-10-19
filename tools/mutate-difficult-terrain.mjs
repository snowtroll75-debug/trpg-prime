#!/usr/bin/env node
/**
 * mutate-difficult-terrain — can verify-difficult-terrain fail?
 *
 * NEW at 3.501.0.
 *
 * B1 IS THE ONE THAT WOULD BREAK SOMETHING ELSE. The behaviour builder is
 * shared with every creature aura, and a widening that changed what a
 * BARE aura charges would silently rewrite the whirlwind.
 *
 * B7 IS THE DEFECT THIS RELEASE ACTUALLY SHIPPED AND CAUGHT. The first
 * draft used `Array.isArray(x) && x.length`, which is falsy for `[]`, so
 * an explicitly empty movement list fell through to charging ALL FOUR —
 * the exact opposite of what it asked for.
 *
 * D1 IS THE HONESTY. Foundry charges every creature in the Region and
 * cannot exempt one, so the Region's NAME is the only place a GM finds
 * out that a Search action turns it off.
 *
 * P6 IS THE ONE A CASTER WOULD FEEL. "1 AP+" means they may spend one and
 * stop; a prompt that forced an extra action would be a cost the book
 * never printed.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "difficult-terrain.mjs");
const AP = path.join(SYSTEM_ROOT, "module", "magic", "ap-scale.mjs");
const AURA = path.join(SYSTEM_ROOT, "module", "creature-aura-workflow.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const LIFE = path.join(SYSTEM_ROOT, "module", "magic", "area-region-life.mjs");
const TIME = path.join(SYSTEM_ROOT, "module", "magic", "cast-time.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-difficult-terrain.mjs");

const MUTATIONS = [
  /* ── N: the row ────────────────────────────────────────────────── */
  {
    file: P,
    name: "N1 TERRAIN STOPS COSTING DOUBLE",
    from: "const DIFFICULT_MULTIPLIER = 2;",
    to: "const DIFFICULT_MULTIPLIER = 3;",
    breaks: "N3 — the system's own word is double"
  },
  {
    file: P,
    name: "N2 a multiplier below double is accepted",
    from: "  const multiplier = Math.max(2, int(raw.multiplier ?? DIFFICULT_MULTIPLIER));",
    to: "  const multiplier = int(raw.multiplier ?? DIFFICULT_MULTIPLIER);",
    breaks: "N4 — terrain that costs normal movement is not terrain"
  },
  {
    file: P,
    name: "N3 a malformed row becomes a patch of ground",
    from: "  if (raw.kind !== undefined && text(raw.kind) !== \"difficultTerrain\") return null;",
    to: "",
    breaks: "N2 — every effect row would lay terrain"
  },

  /* ── A: the air warp ───────────────────────────────────────────── */
  {
    file: P,
    name: "A1 THE AIR WARP BUYS NOTHING",
    from: "    air: Boolean(warpMods?.terrainInAir),",
    to: "    air: false,",
    breaks: "A1/A4/B4 — the 6 PP option, inert again"
  },
  {
    file: P,
    name: "A2 THE GROUND VERSION SLOWS BIRDS TOO",
    // RE-ANCHORED: both lists lost their `export` when
    // `verify-rules-have-callers` named them as opinions nobody calls.
    from: "const GROUND_MOVEMENTS = Object.freeze([\"walk\", \"swim\", \"burrow\"]);",
    to: "const GROUND_MOVEMENTS = Object.freeze([\"walk\", \"swim\", \"burrow\", \"fly\"]);",
    breaks: "A3/B3 — a printed patch of vines does not slow a bird"
  },
  {
    file: P,
    name: "A3 the air version grounds people as well",
    from: "const AIR_MOVEMENTS = Object.freeze([\"fly\"]);",
    to: "const AIR_MOVEMENTS = Object.freeze([\"fly\", \"walk\"]);",
    breaks: "A4/B5 — the printed spell with a 6 PP surcharge"
  },
  {
    file: WARP,
    name: "A4 the mod is dropped from the aggregate",
    from: "    if (m.terrainInAir) mods.terrainInAir = true;",
    to: "",
    breaks: "A6 — offered, charged for, and silently dropped"
  },
  {
    file: WARP,
    name: "A5 the key is never declared",
    from: "    terrainInAir: false",
    to: "    terrainInAirUnused: false",
    breaks: "A5 — an undeclared mod does not survive the chooser"
  },

  /* ── B: the shared builder ─────────────────────────────────────── */
  {
    file: AURA,
    name: "B1 A BARE AURA STOPS CHARGING EVERYTHING",
    from: "  const wanted = listed === null\n    ? [...DEFAULT_AURA_MOVEMENTS]\n    : listed.filter((m) => ALL_MOVEMENTS.includes(String(m)));",
    to: "  const wanted = (listed ?? []).filter((m) => ALL_MOVEMENTS.includes(String(m)));",
    breaks: "B1 — every creature aura in the system, silently rewritten"
  },
  {
    file: AURA,
    name: "B2 AN EMPTY LIST CHARGES ALL FOUR — the defect this release shipped",
    from: "  const listed = Array.isArray(aura.movementTypes) ? aura.movementTypes : null;",
    to: "  const listed = Array.isArray(aura.movementTypes) && aura.movementTypes.length\n    ? aura.movementTypes : null;",
    breaks: "B7 — the exact opposite of what an empty list asks for"
  },
  {
    file: AURA,
    name: "B3 an unlisted movement is charged anyway",
    from: "  for (const move of ALL_MOVEMENTS) difficulties[move] = wanted.includes(move) ? cost : 1;",
    to: "  for (const move of ALL_MOVEMENTS) difficulties[move] = cost;",
    breaks: "B3/B5 — every patch would charge every movement"
  },
  {
    file: AURA,
    name: "B4 a behaviour that charges nothing is still built",
    from: "  if (!wanted.length) return [];",
    to: "",
    breaks: "B7/B8 — a Region that exists, renders, and does not one thing"
  },
  {
    file: P,
    name: "B5 DISBELIEF IS SMUGGLED INTO exemptTrait",
    from: "    exemptTrait: null",
    to: "    exemptTrait: spec.illusory ? \"disbelieved\" : null",
    breaks: "B11 — a rule no trait check could ever confirm"
  },

  /* ── D: the clause ─────────────────────────────────────────────── */
  {
    file: P,
    name: "D1 THE REGION STOPS NAMING THE DISBELIEF CLAUSE",
    from: "  if (spec?.illusory) parts.push(\"disbelief by Search — run by hand\");",
    to: "",
    breaks: "D1/D2 — a GM dragging a token sees the name, and nothing else"
  },
  {
    file: P,
    name: "D2 it is named even for the vines",
    from: "  if (spec?.illusory) parts.push(\"disbelief by Search — run by hand\");",
    to: "  parts.push(\"disbelief by Search — run by hand\");",
    breaks: "D4 — a clause recited for a spell that has none"
  },
  {
    file: P,
    name: "D3 the card stops naming it",
    from: "  if (!spec?.illusory) return null;",
    to: "  return null; // eslint-disable-line",
    breaks: "D5 — the warp is sold and the table never told"
  },
  {
    file: P,
    name: "D4 the flying-only version does not say so",
    from: "  const parts = [spec?.air ? `${kind}, flying only` : kind];",
    to: "  const parts = [kind];",
    breaks: "D3 — a Region charging flight alone, named as though it charged everything"
  },
  {
    file: P,
    name: "D5 the placed line stops naming who is slowed",
    from: "  const who = spec?.air ? \"Flying creatures\" : \"Creatures\";",
    to: "  const who = \"Creatures\";",
    breaks: "D7 — the 6 PP the caster spent, unmentioned"
  },

  /* ── P: the AP scale ───────────────────────────────────────────── */
  {
    file: AP,
    name: "P1 THE PRINTED SPELL STOPS BEING AN OPTION",
    from: "  for (let extra = 0; extra <= spec.maxExtra; extra += 1) {",
    to: "  for (let extra = 1; extra <= spec.maxExtra; extra += 1) {",
    breaks: "P5/P6 — a forced extra action is a cost the book never printed"
  },
  {
    file: AP,
    name: "P2 the cap is ignored in the arithmetic",
    from: "  const extra = Math.min(Math.max(0, int(extraAP)), spec.maxExtra);",
    to: "  const extra = Math.max(0, int(extraAP));",
    breaks: "P10 — a returned dialog index is data from outside this file"
  },
  {
    file: AP,
    name: "P3 and in what it costs",
    from: "  return Math.min(Math.max(0, int(extraAP)), spec.maxExtra);",
    to: "  return Math.max(0, int(extraAP));",
    breaks: "P11 — a caster charged for actions the cap refused"
  },
  {
    file: AP,
    name: "P4 A STEP OF NOTHING IS STILL AN OFFER",
    from: "  if (step <= 0 || maxExtra <= 0) return null;",
    to: "",
    breaks: "P2/P3 — a prompt whose every choice is the same choice"
  },
  {
    file: AP,
    name: "P5 an unreadable cast time is guessed at",
    from: "  return m ? int(m[1]) : null;",
    to: "  return m ? int(m[1]) : 1;",
    breaks: "P16 — \"Reaction\" would be offered an upgrade to 2 AP"
  },
  {
    file: AP,
    name: "P6 every cast time becomes scalable",
    from: "  return /\\+/.test(String(castAP ?? \"\"));",
    to: "  return true;",
    breaks: "P14 — a prompt on all 692 spells"
  },
  {
    file: AP,
    name: "P7 the growth lands in a channel nothing reads",
    from: "  const per = text(raw.per) || \"areaGrowth\";",
    to: "  const per = \"apRadius\";",
    breaks: "P8/G5 — warp-area.mjs reads areaGrowth and nothing else"
  },

  /* ── W: where it is wired ──────────────────────────────────────── */
  {
    file: CAST,
    name: "W1 THE HANDLER IS NEVER REACHED",
    from: "        if (row?.kind !== \"difficultTerrain\" || !placedArea?.regionId) continue;",
    to: "        continue;",
    breaks: "W2 — both spells would go back to doing nothing"
  },
  {
    file: CAST,
    name: "W2 the warp never reaches the row",
    from: "        const spec = normaliseDifficultTerrain(row, warpMods);",
    to: "        const spec = normaliseDifficultTerrain(row, {});",
    breaks: "W5 — every casting would be a ground one"
  },
  {
    file: CAST,
    name: "W3 the Region keeps its plain name",
    from: "        await region.update({ name: terrainRegionName(spec, spell.name) });",
    to: "",
    breaks: "W4 — the clause would exist only on a card that scrolls away"
  },
  {
    // MOVED FILE AT 3.518.0. This arithmetic used to be three lines in
    // the middle of `castSpell`, and the check covering it matched that
    // source text — so it broke when the rule MOVED without changing,
    // and would have passed had it been neutered in place. Both the rule
    // and its mutation now live where they can be run.
    file: TIME,
    name: "W4 THE EXTRA ACTIONS ARE NEVER SPENT",
    from: "  return (castTimeAP(castAP) ?? 0) + extra;",
    to: "  return castTimeAP(castAP) ?? 0;",
    breaks: "W7 — a bigger spell for free"
  },
  {
    file: CAST,
    name: "W5 THE AP GROWTH OVERWRITES AN AREA WARP",
    from: "    warpMods[key] = (Number(warpMods[key]) || 0) + Number(value);",
    to: "    warpMods[key] = Number(value);",
    breaks: "W8 — a spell with both would lose one of them"
  },
  {
    file: CAST,
    name: "W6 the pool is checked against the printed minimum",
    from: "  } else if (!apPaid && !(await ensureActionPoints(actor, castTimeApCost(effCastAPWithScale), `${spell.name} — Cast a Spell`))) {",
    to: "  } else if (!apPaid && !(await ensureActionPoints(actor, castTimeApCost(effCastAP), `${spell.name} — Cast a Spell`))) {",
    breaks: "W6 — a caster picking 3 AP with two in the pool, clamped at the end"
  },
  {
    file: LIFE,
    name: "W7 THE TERRAIN STOPS CLAIMING ITS REGION",
    // RE-ANCHORED AT 3.520.0: this named the list's last entry PLUS its
    // closing delimiter, which is the A3 shape — it dies the day an entry
    // is appended after it. It now names only the line it removes.
    from: "  \"difficultTerrain\"",
    to: "  \"notAKind\"",
    breaks: "W1 — the movement cost lives ON the Region, so it would be deleted on cast"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, AP, AURA, CAST, WARP, LIFE, TIME, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-difficult-terrain: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-difficult-terrain: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-difficult-terrain: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
