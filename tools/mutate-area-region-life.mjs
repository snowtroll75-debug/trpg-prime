#!/usr/bin/env node
/**
 * mutate-area-region-life — can verify-area-region-life fail?
 * NEW at 3.480.0.
 *
 * K3 IS THE EXPENSIVE DIRECTION. Releasing a claimed Region deletes the
 * mechanism out from under the spell that just placed it — a hazard
 * nobody can walk into, on a card that says the hazard is there.
 *
 * R4 IS THE ONE THAT WOULD BE FOUND MONTHS LATER: a refunded cast that
 * still leaves its hazard on the floor, charging nothing and biting the
 * party for the rest of the session.
 *
 * W6 IS THE GUARD. An AP refund without `actorInCombat` hands out AP
 * that was never spent, and nobody reports a resource going UP.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const L = path.join(SYSTEM_ROOT, "module", "magic", "area-region-life.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "action-points-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-area-region-life.mjs");

const MUTATIONS = [
  {
    file: L,
    name: "R THE DELETED REGION: a recurring ladder stops claiming (the 3.587.0 defect)",
    from: "    || rowClaimsForRecurringLadder(row));",
    to: "  );",
    breaks: "R1 — the ladder is stamped onto a Region the cast then deletes"
  },
  {
    file: L,
    name: "R: EVERY saveLadder claims, so six plain ones litter a Region per cast",
    from: '  return String(row?.kind ?? "").toLowerCase() === "saveladder" && Boolean(row?.recurring);',
    to: '  return String(row?.kind ?? "").toLowerCase() === "saveladder";',
    breaks: "R2 — the 3.480.0 littering, reintroduced by its own fix"
  },
  {
    file: L,
    name: "R: the helper answers for any kind that carries a recurring field",
    from: '  return String(row?.kind ?? "").toLowerCase() === "saveladder" && Boolean(row?.recurring);',
    to: "  return Boolean(row?.recurring);",
    breaks: "R3c"
  },
  {
    file: L,
    name: "K3 THE EXPENSIVE ONE: a hazard's region is released too",
    from: '  return rows.some((row) => REGION_CLAIMING_KINDS.includes(String(row?.kind ?? ""))\n    || rowClaimsForRecurringLadder(row));',
    to: "  return false;",
    breaks: "K3 — the hazard is deleted out from under the spell that placed it"
  },
  {
    file: L,
    name: "K4 a live emanation stops claiming its circle",
    from: "  if (isLiveEmanation) return true;",
    to: "  if (false) return true;",
    breaks: "K4 — a sustained emanation would lose its region at cast"
  },
  {
    file: L,
    name: "K6 the nexus is dropped from the claiming set",
    from: '  "hazard", "elementalNexus", "areaRider"',
    to: '  "hazard", "areaRider"',
    breaks: "K6/K3 — every nexus would be deleted the moment it was cast"
  },
  {
    file: L,
    name: "R1 nothing is ever released, so the litter returns",
    from: "  return !areaRegionIsClaimed(spellData, isLiveEmanation);",
    to: "  return false;",
    breaks: "R1 — 113 area spells litter the scene again"
  },
  {
    file: L,
    name: "R4 A REFUNDED CAST LEAVES ITS HAZARD BEHIND",
    from: "  if (refunded) return true;",
    to: "  if (false) return true;",
    breaks: "R4 — a cast nobody paid for still bites the party"
  },
  {
    file: L,
    name: "R5 a missing region id is still deleted",
    from: "  if (!regionId) return false;",
    to: "  if (regionId === undefined) return false;",
    breaks: "R5 — deleting a null id throws inside the cast"
  },
  {
    file: L,
    name: "P2 the refund is not clamped to the pool",
    from: "  return Math.min(cap, now + back);",
    to: "  return now + back;",
    breaks: "P2 — a cancelled cast becomes a way of banking resource"
  },
  {
    file: L,
    name: "L3 the card promises AP that was never taken",
    from: "  if (Number(ap) > 0) parts.push(`<strong>${Number(ap)} AP</strong>`);",
    to: "  parts.push(`<strong>${Number(ap)} AP</strong>`);",
    breaks: "L3 — out of combat no AP is spent, so none may be promised"
  },
  {
    file: C,
    name: "W1 a cancel falls through to hitting everyone, as 3.479.0 did",
    from: "          if (chosen === null) {",
    to: "          if (false) {",
    breaks: "W1 — the caster takes 60 force from his own storm"
  },
  {
    file: C,
    name: "W2 only the PP is refunded, and the turn is lost",
    from: "            if (totalCastAP > 0) await refundActionCost(actor, totalCastAP);",
    to: "            if (false) await refundActionCost(actor, totalCastAP);",
    breaks: "W2 — at three AP the unrefunded half is the expensive one"
  },
  {
    file: C,
    name: "W3 the refund still damages the whole area",
    from: "            areaTargets = [];",
    to: "            areaTargets = areaTargets;",
    breaks: "W3 — refunded AND damaging is the worst of both"
  },
  {
    file: C,
    name: "W5 the emanation's liveness is assumed rather than asked",
    // Re-anchored 3.609.2: the claim is read off the chosen mode's rows (G3).
    from: "  if (shouldClearAreaRegion(placedArea?.regionId, { effects: effEffects }, emanationIsLive(spellData), castRefunded)) {",
    to: "  if (shouldClearAreaRegion(placedArea?.regionId, { effects: effEffects }, false, castRefunded)) {",
    breaks: "W5 — every emanation would lose its circle at cast"
  },
  {
    file: C,
    name: "W8 a failed deletion throws away the cast's result",
    from: '      console.warn("TRG Prime | the spell area region could not be released", error);',
    to: "      throw error;",
    breaks: "W8 — damage already applied would be lost to a cleanup failure"
  },
  {
    file: A,
    name: "W6 THE GUARD REMOVED: AP is refunded out of combat",
    from: "async function refundActionCost(actor, apCost) {\n  if (!actorInCombat(actor)) return;",
    to: "async function refundActionCost(actor, apCost) {",
    breaks: "W6 — hands out AP that was never spent"
  },
  {
    file: A,
    name: "W7 the AP refund is unclamped",
    from: "  const restored = Math.min(Math.max(0, max), Math.max(0, current) + cost);",
    to: "  const restored = Math.max(0, current) + cost;",
    breaks: "W7 — a cancelled 3 AP spell banks AP across turns"
  }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
guardFiles(files);

const survivors = [];
let applied = 0;
const verifyPasses = () => {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!verifyPasses()) {
  console.error("mutate-area-region-life: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-area-region-life: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-area-region-life: "${m.name}" changes nothing`);
      process.exit(1);
    }
    applied += 1;
    fs.writeFileSync(m.file, source.replace(m.from, m.to));
    if (verifyPasses()) survivors.push(`${m.name} (should break ${m.breaks})`);
    fs.writeFileSync(m.file, source);
  }
} finally {
  for (const [f, s] of originals) fs.writeFileSync(f, s);
}

if (survivors.length) {
  console.error(`mutate-area-region-life: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-area-region-life: all ${applied} mutations were caught`);
