#!/usr/bin/env node
/**
 * mutate-emanation-growth — can verify-emanation-growth fail?
 *
 * NEW at 3.430.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 THROUGH #4 ARE THE SHIPPED DEFECT, one per disabled part of the
 * spell — the area word, the sustainable flag, the prose growth and the
 * five-times warp. Each is restored on its own, because that is how they
 * were found: no single symptom led to all four.
 *
 * #5 ONWARD ARE THE HAZARDS THE NEW MACHINERY CREATES, and the two worth
 * naming here are the ones that would have shipped quietly: a clock
 * stamped on Bless (which would end a properly sustained spell at round
 * ten) and a refusal that fires on a "duration" sustain (which would end
 * one immediately).
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ENDS = path.join(SYSTEM_ROOT, "module", "magic", "spell-ends.mjs");
const GROWTH = path.join(SYSTEM_ROOT, "module", "magic", "emanation-growth.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "emanation-workflow.mjs");
const SUSTAIN = path.join(SYSTEM_ROOT, "module", "magic", "sustain-workflow.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const REGISTRY = path.join(SYSTEM_ROOT, "module", "magic", "active-spells.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-emanation-growth.mjs");

// SOME ANCHORS RE-INDENTED AT 3.462.0, when the emanation recording was
// lifted out of the lock/sustained guard in cast-workflow and its block
// lost a level. The mutations are unchanged in substance; only the
// whitespace they match moved.
const MUTATIONS = [
  {
    // SHIPPED 1: the growth is prose again, so a Sustain widens nothing.
    file: GROWTH,
    name: "THE SHIPPED DEFECT 1: nothing declares a growth",
    from: "  if (!step || !max) return null;",
    to: "  return null;",
    breaks: "A1/D8 — the sentence is on the spell and wired to nothing"
  },
  {
    // SHIPPED 2: the step is ignored, so the ward never widens.
    file: GROWTH,
    name: "THE SHIPPED DEFECT 2: a sustain buys no feet",
    from: "  const next = Math.max(current, Math.min(current + step, max));",
    to: "  const next = current;",
    breaks: "A4/A5 — the aura stays ten feet however often it is sustained"
  },
  {
    // SHIPPED 3: the area word that decides whether anything follows.
    file: GROWTH,
    name: "the cast stops stamping the growth onto the record",
    from: "function spellGrowth(spellData) {",
    to: "function spellGrowth(spellData) {\n  if (spellData) return null;",
    breaks: "A1/D8 — a spell that declares growth is read as declaring none"
  },
  {
    // THE ONE THAT WAS LIVE. The pack's +5/max+25 is restored by making
    // the check's own reading of the cap wrong in the same direction.
    file: GROWTH,
    name: "THE LIVE DEFECT: the cap is ignored",
    from: "  const max = Math.max(0, Number(growth.maxFeet) || 0);",
    to: "  const max = Number.POSITIVE_INFINITY;",
    breaks: "A6/A9/A10 — the ward grows past thirty feet for ever"
  },

  /* ---------------------------------------------------------------- *
   * THE CLAMP THAT REPORTS ITSELF HONESTLY.
   * ---------------------------------------------------------------- */
  {
    file: GROWTH,
    name: "the card is told the step rather than the feet gained",
    from: "    grewBy: next - current,",
    to: "    grewBy: Math.max(0, step),",
    breaks: "A8/A9 — 'widens by 5 ft, to 30 ft' over a ward that gained two"
  },
  {
    file: GROWTH,
    name: "a sustain can shrink a ward wider than its cap",
    from: "  const next = Math.max(current, Math.min(current + step, max));",
    to: "  const next = Math.min(current + step, max);",
    breaks: "A7 — the action that grows the spell cuts it back instead"
  },

  /* ---------------------------------------------------------------- *
   * THE REFUSAL, AND WHAT IT MUST NEVER REFUSE.
   * ---------------------------------------------------------------- */
  {
    file: GROWTH,
    name: "THE REPORTED SHAPE: a ward at its cap is charged an AP for nothing",
    from: "  if (!atMax) return null;",
    to: "  return null;",
    breaks: "B1/B2 — 'deducts an AP, creates an entry on the chat card but does nothing else'"
  },
  {
    file: GROWTH,
    name: "THE DANGEROUS DIRECTION: the refusal fires on a duration sustain",
    from: '  if (entry?.sustainType !== GROWTH_SUSTAIN_TYPE) return null;',
    to: '  if (entry?.sustainType === "neverMatchesAnything") return null;',
    breaks: "B4/B5/B7 — Bless is refused its sustain and lapses two rounds later"
  },
  {
    file: SUSTAIN,
    name: "the refusal is asked after the AP has already gone",
    // RE-ANCHORED at 3.435.0: Luminance's Sustain picker now sits between
    // the refusal and the spend, so the two are no longer adjacent. The
    // mutation is unchanged in intent — remove the refusal and a Sustain
    // that buys nothing still costs an action point.
    from: "  const nothingToBuy = growthRefusal(entry, actor.name);\n  if (nothingToBuy) {\n    ui.notifications.warn(nothingToBuy);\n    return null;\n  }",
    to: "  const nothingToBuy = null;",
    breaks: "E6 — a refused sustain costs an action point"
  },

  /* ---------------------------------------------------------------- *
   * THE CLOCK — including the mutation that would change Bless.
   * ---------------------------------------------------------------- */
  {
    file: GROWTH,
    // TURNED ROUND AT 3.496.0 with the rule it guards. The old guard is
    // now the regression: restoring it puts eight emanations back to
    // running until dismissed, which outside an encounter is forever.
    name: "THE OLD GUARD COMES BACK: a capped sustained spell is stamped with nothing",
    from: "  if (!duration) return null;",
    to: "  if (!duration || duration.sustained) return null;",
    breaks: "C2 — Bless cast in a corridor would run until it was dismissed"
  },
  {
    // THE OTHER DIRECTION, and it matters more since 3.496.0: with the
    // sustained guard gone, this test is the ONLY thing keeping the ten
    // uncapped sustained emanations — "Ghost Sound, sustained" and its
    // kind — from carrying a stamp of two nulls.
    file: GROWTH,
    name: "an uncapped duration is stamped with a pair of nulls",
    from: "  if (!hasSeconds && !hasRounds) return null;",
    to: "",
    breaks: "C2b/D19 — a spell with no minute would carry a clock that says nothing"
  },
  {
    file: GROWTH,
    name: "nothing is ever stamped, so the ward never ends",
    from: "  if (!hasSeconds && !hasRounds) return null;",
    to: "  return null;",
    breaks: "C1/C4 — the aura follows its caster for the rest of the session"
  },
  {
    // THE ARITHMETIC MOVED at 3.494.0 to magic/spell-ends.mjs, where an
    // active-spell entry asks it too. This runner said so by reporting
    // the anchor missing rather than quietly passing.
    file: ENDS,
    name: "only the world clock is read, so a ward never ends in a fight",
    from: "  const byRound = (ends.endsOnRound ?? null) !== null\n    && round !== null && Number(round) >= Number(ends.endsOnRound);",
    to: "  const byRound = false;",
    breaks: "C6 — combat rounds pass and the world clock does not move"
  },
  {
    file: ENDS,
    name: "only the round clock is read, so a ward never ends in a corridor",
    from: "  const byTime = (ends.endsAtWorldTime ?? null) !== null\n    && worldTime !== null && Number(worldTime) >= Number(ends.endsAtWorldTime);",
    to: "  const byTime = false;",
    breaks: "C5 — outside an encounter there are no rounds to count"
  },
  {
    file: ENDS,
    name: "an unstamped emanation is expired anyway",
    from: "  if (!ends) return false;",
    to: "  ends = ends ?? { endsOnRound: 0 };",
    breaks: "C8 — Bless ends on the round it is cast"
  },
  {
    file: CAST,
    name: "the cast stops recording the clock",
    from: "        ends: emanationExpiry({",
    to: "          ends: null && emanationExpiry({",
    breaks: "E2 — the descriptor carries no expiry, so nothing can end it"
  },
  {
    file: COMBAT,
    name: "the turn sweep stops asking",
    from: "    const faded = await sweepActiveSpellExpiry(actor, {",
    to: "    const faded = [] || await sweepActiveSpellExpiry(actor, {",
    breaks: "E9 — the minute runs out and the ward does not notice"
  },
  {
    file: BOOT,
    name: "the world clock stops asking",
    from: "        const faded = await sweepActiveSpellExpiry(actor, { worldTime, round: game.combat?.round ?? null });",
    to: "        const faded = [];",
    breaks: "E10 — a ward cast out of combat never ends"
  },

  /* ---------------------------------------------------------------- *
   * THE RECONCILIATION, and the latecomers.
   * ---------------------------------------------------------------- */
  {
    file: FLOW,
    name: "the ward widens on paper and catches nobody new",
    from: "  const record = runningEmanations().find((r) => r.entry.id === castId);\n  if (record) await refreshEmanation(record);",
    to: "  const record = null;",
    breaks: "E7 — a bigger circle drawn over an unchanged membership"
  },
  {
    file: FLOW,
    name: "the reconcile runs before the new radius is written",
    from: "  emanation.radiusFeet = grown.radiusFeet;\n  await setActiveSpells(actor, entries);\n",
    to: "",
    breaks: "E8 — the old circle is redrawn at its old size"
  },
  {
    file: REGISTRY,
    name: "THE LATENT DEFECT: ending a spell leaves the latecomers holding it",
    from: "  if (entry.emanation) {",
    to: "  if (false && entry.emanation) {",
    breaks: "E11 — a creature that walked in is blessed for the rest of the session"
  },
  {
    file: FLOW,
    name: "the ended emanation's circle stays on the scene",
    from: '    await canvas.scene.deleteEmbeddedDocuments("Region", [regionId]);',
    to: "    return cleared;",
    breaks: "E13 — a ring following a caster whose spell has ended"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([GROWTH, ENDS, FLOW, SUSTAIN, CAST, REGISTRY, COMBAT, BOOT, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-emanation-growth: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-emanation-growth: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-emanation-growth: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
