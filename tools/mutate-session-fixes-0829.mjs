#!/usr/bin/env node
/**
 * mutate-session-fixes-0829 — can verify-session-fixes-0829 fail?
 *
 * NEW at 3.433.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1, #6, #10 and #14 are the four shipped defects restored exactly.
 * The rest are the ways each fix could be done wrongly — and the ones
 * that matter most are the two that TAKE something away: reclaiming
 * temporary HP from a rage that is still running, and repairing a field
 * downwards onto a player's own typed value.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TIMING = path.join(SYSTEM_ROOT, "module", "combat", "condition-timing.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const RAGE = path.join(SYSTEM_ROOT, "module", "combat", "rage-workflow.mjs");
const FEATS = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const MIGRATION = path.join(SYSTEM_ROOT, "module", "migration.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-session-fixes-0829.mjs");

const MUTATIONS = [
  /* --- 2. FLAT-FOOTED ------------------------------------------- */
  {
    file: TIMING,
    name: "THE SHIPPED DEFECT 2: a hit stamps its clock on somebody else's condition",
    from: "  if (held === null || Number.isNaN(held)) return null;",
    to: "  if (held === null || Number.isNaN(held)) return wants;",
    breaks: "A2 — Step 4's untimed Flat-Footed acquires the attack's countdown"
  },
  {
    file: TIMING,
    name: "a second application can cut an existing timer short",
    from: "  return Math.max(held, wants);",
    to: "  return wants;",
    breaks: "A4 — bleeding for 3 more rounds replaces bleeding for 7"
  },
  {
    file: TIMING,
    name: "round zero is treated as no expiry at all",
    from: "  if (wants === null || Number.isNaN(wants)) return null;",
    to: "  if (!wants) return null;",
    breaks: "A6 — a falsy test drops a real expiry of 0"
  },
  {
    file: EFFECTS,
    name: "the raw request is stamped instead of the rule's answer",
    // UPDATED AT 3.581.1: a tag may now bring its own clock, and the
    // timing object grew three fields, so the boolean branch's text
    // moved. The rule is unchanged — the RULE'S ANSWER is stamped, not
    // the raw request — and the context is still the `value: null` tail,
    // which is the only thing telling the two branches apart.
    // RE-ANCHORED 3.613.0: R14's source-traits stamp sits before the update.
    from: "      const updates = buildTimingUpdates({\n        expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId,\n        ...(wasAlreadyPresent ? {} : {\n          endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn\n        })\n      });\n      if (!wasAlreadyPresent && Array.isArray(sourceTraits) && sourceTraits.length) {\n        updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;\n      }\n      if (effect?.update && Object.keys(updates).length) {\n        await effect.update(updates);\n      }\n      applied.push({ key: tag.key, label: tag.label, value: null, wasAlreadyPresent });",
    to: "      const updates = buildTimingUpdates({\n        expiresRound: timing.expiresRound, duration, spellEffect, spellEffectEnd, castId,\n        ...(wasAlreadyPresent ? {} : {\n          endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn\n        })\n      });\n      if (!wasAlreadyPresent && Array.isArray(sourceTraits) && sourceTraits.length) {\n        updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;\n      }\n      if (effect?.update && Object.keys(updates).length) {\n        await effect.update(updates);\n      }\n      applied.push({ key: tag.key, label: tag.label, value: null, wasAlreadyPresent });",
    to_note: "non-valued branch only",
    breaks: "A7/A9 — one of the two branches goes back to the defect"
  },
  {
    file: EFFECTS,
    name: "the rule is told we always placed the effect",
    from: "        weApplied: !wasAlreadyPresent,\n        existing: effect?.getFlag?.(SYSTEM_ID, EXPIRY_FLAG) ?? null,\n        incoming: timing.expiresRound\n      });\n      const updates = buildTimingUpdates({\n        expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId,\n        ...(wasAlreadyPresent ? {} : {\n          endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn\n        })\n      });\n      if (!wasAlreadyPresent && Array.isArray(sourceTraits) && sourceTraits.length) {\n        updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;\n      }\n      if (effect?.update && Object.keys(updates).length) {\n        await effect.update(updates);\n      }\n      applied.push({ key: tag.key, label: tag.label, value: null, wasAlreadyPresent });",
    to: "        weApplied: true,\n        existing: effect?.getFlag?.(SYSTEM_ID, EXPIRY_FLAG) ?? null,\n        incoming: timing.expiresRound\n      });\n      const updates = buildTimingUpdates({\n        expiresRound: allowed, duration, spellEffect, spellEffectEnd, castId,\n        ...(wasAlreadyPresent ? {} : {\n          endsWith: timing.endsWith, expiresTime: timing.expiresTime, followOn: timing.followOn\n        })\n      });\n      if (!wasAlreadyPresent && Array.isArray(sourceTraits) && sourceTraits.length) {\n        updates[`flags.${SYSTEM_ID}.${SOURCE_TRAITS_FLAG}`] = sourceTraits;\n      }\n      if (effect?.update && Object.keys(updates).length) {\n        await effect.update(updates);\n      }\n      applied.push({ key: tag.key, label: tag.label, value: null, wasAlreadyPresent });",
    breaks: "A8 — every application claims ownership and the guard is bypassed"
  },

  /* --- 3. RAGE --------------------------------------------------- */
  {
    file: RAGE,
    name: "THE SHIPPED DEFECT 3: the debt is recorded only on the effect",
    from: "    await actor.setFlag(SYSTEM_ID, RAGE_TEMP_HP_FLAG, temporaryHP);",
    to: "    void RAGE_TEMP_HP_FLAG;",
    breaks: "B1 — deleting the effect erases the only record of the temporary HP"
  },
  {
    file: RAGE,
    name: "endRage reads the effect's record first",
    from: "    actor?.getFlag?.(SYSTEM_ID, RAGE_TEMP_HP_FLAG)\n      ?? effect?.getFlag?.(SYSTEM_ID, RAGE_FLAG)?.temporaryHP",
    to: "    effect?.getFlag?.(SYSTEM_ID, RAGE_FLAG)?.temporaryHP\n      ?? actor?.getFlag?.(SYSTEM_ID, RAGE_TEMP_HP_FLAG)",
    breaks: "B2 — an absent effect means an absent amount again"
  },
  {
    file: RAGE,
    name: "THE ONE THAT TAKES SOMETHING: a live rage is reclaimed from",
    from: "  if (rageEffect(actor)) return 0;",
    to: "  if (false) return 0;",
    breaks: "B4 — a raging character is stripped of the pool they are fighting with"
  },
  {
    file: RAGE,
    name: "the reclaim takes more than is actually there",
    from: "  const reclaimed = Math.min(currentTemp, granted);",
    to: "  const reclaimed = granted;",
    breaks: "B5 — temporary HP goes negative when damage already ate some"
  },
  {
    file: COMBAT,
    name: "orphans are never reclaimed on the combat clock",
    from: "    const reclaimed = await reclaimOrphanedRageTemporaryHP(actor);",
    to: "    const reclaimed = 0;",
    breaks: "B8 — Throngar keeps his 28 points"
  },

  /* --- 1. STORED-DELTA SHORTFALL --------------------------------- */
  {
    file: FEATS,
    name: "THE SHIPPED DEFECT 1: a lost grant is undetectable",
    from: "    out.push({ path, recorded, field, short: recorded - field });",
    to: "",
    breaks: "C1 — the shortfall is computed and thrown away"
  },
  {
    file: FEATS,
    name: "THE ONE THAT TAKES SOMETHING: a field above its record is dragged down",
    from: "    if (field >= recorded) continue;",
    to: "    if (field === recorded) continue;",
    breaks: "C2 — a player's own typed base is taken off them"
  },
  {
    file: FEATS,
    name: "a net-negative record is read as a shortfall",
    from: "    if (recorded <= 0) continue;",
    to: "    if (recorded === 0) continue;",
    breaks: "C3 — an Orc's -1 per level 'repairs' into free power points"
  },
  {
    file: MIGRATION,
    name: "the repair writes the flag instead of the field",
    from: "      update[row.path] = row.recorded;",
    to: "      update[`flags.trg-prime.bogus`] = row.field;",
    breaks: "C5 — the record was right; rewriting it hides the loss instead of undoing it"
  },
  {
    file: MIGRATION,
    name: "the repair happens silently",
    from: "Grants restored",
    to: "Migration notes",
    breaks: "C7 — a migration that moves a player's maximum PP with no card"
  },

  /* --- 4. EXPIRY SWEEP ------------------------------------------- */
  {
    file: COMBAT,
    name: "THE SHIPPED DEFECT 4: only the current combatant is swept",
    // RE-ANCHORED 3.614.0: stasis's turn start sweeps the others with the same loop.
    from: "    const swept = new Set();\n    for (const other of this.combatants ?? []) {",
    to: "    const swept = new Set();\n    for (const other of [this.combatant].filter(Boolean)) {",
    breaks: "D1 — a condition on anybody else waits for their own turn, or for ever"
  },
  {
    file: COMBAT,
    name: "an actor on two combatants is swept twice",
    from: "      if (!subject || swept.has(subject.id)) continue;",
    to: "      if (!subject) continue;",
    breaks: "D2 — the same expiry is announced once per combatant sharing the actor"
  },
  {
    file: EFFECTS,
    name: "the sweep stops refusing what is not yet due",
    from: "    if (Number(currentRound) < Number(expiresRound)) continue;",
    to: "    if (false) continue;",
    breaks: "D4 — sweeping everybody now deletes every timed condition immediately"
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

const guard = guardFiles([TIMING, EFFECTS, RAGE, FEATS, MIGRATION, COMBAT, BOOT, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-session-fixes-0829: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-session-fixes-0829: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-session-fixes-0829: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
