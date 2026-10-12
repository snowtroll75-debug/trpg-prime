#!/usr/bin/env node
/**
 * verify-area-region-life — the Region a template drew, and a refunded cast.
 *
 * NEW at 3.480.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * TWO FINDINGS FROM DRIVING 3.479.1, 3 September 2026.
 *
 *   THE LITTER. Three casts of Missile Storm left three Regions named
 *   "Missile Storm Area" on the Charnel House, permanently. Deletion
 *   existed only for emanations and creature auras, so 113 of the pack's
 *   152 area spells littered the scene on every cast — silently, with
 *   nothing wrong on the card.
 *
 *   THE CANCEL. Cancelling the target picker fell through to hitting
 *   everyone, the caster included: he took 60 force from his own storm.
 *   GRAHAM'S RULING: "A cancel should refund."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE THREE CHECKS THAT CARRY THE DESIGN.
 *
 *   K3  A CLAIMANT KEEPS ITS REGION. The hazard, the nexus and the area
 *       rider ARE the Region — releasing one would delete the mechanism
 *       out from under the spell that just placed it. This is the
 *       expensive direction to get wrong, so every claiming kind is
 *       asserted by name.
 *
 *   R4  A REFUNDED CAST CLAIMS NOTHING, whatever the spell declares. A
 *       cast called off must not leave a live hazard on the floor, and
 *       that overrides the claim rather than sitting beside it.
 *
 *   P2  BOTH RESOURCES COME BACK. The picker opens after the PP is
 *       written AND after `spendActionCost` has run, so a refund of PP
 *       alone silently costs the player their turn — at three AP, the
 *       more expensive half.
 *
 * W4 IS THE ORDERING, and it is the one that would be caught last: the
 * release must run AFTER every claimant has recorded onto the Region.
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  REGION_CLAIMING_KINDS, areaRegionIsClaimed, castRefundedLine, refundedPool, rowClaimsForRecurringLadder, shouldClearAreaRegion
} from "../module/magic/area-region-life.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const blast = { effects: [{ kind: "missileStorm" }] };

/* ── K. WHO CLAIMS THE REGION ────────────────────────────────────── */
ok("K1 an instantaneous blast claims nothing", areaRegionIsClaimed(blast) === false);
ok("K2 a spell with no effects at all claims nothing",
  areaRegionIsClaimed({}) === false && areaRegionIsClaimed(null) === false);
/*
 * K3 — EVERY CLAIMING KIND BY NAME. Releasing one of these deletes the
 * mechanism out from under the spell: a hazard nobody can walk into, a
 * nexus that sweeps an empty scene.
 */
for (const kind of ["hazard", "elementalNexus", "areaRider"]) {
  ok(`K3 a ${kind} KEEPS its region`,
    areaRegionIsClaimed({ effects: [{ kind }] }) === true,
    "the Region IS the mechanism");
}
ok("K4 a live emanation keeps its region",
  areaRegionIsClaimed(blast, true) === true,
  "emanation-workflow deletes it when the spell ends");
ok("K5 one claiming row among several is enough",
  areaRegionIsClaimed({ effects: [{ kind: "missileStorm" }, { kind: "hazard" }] }) === true);
// K6 GREW BY ONE AT 3.501.0, and the count is deliberately exact rather
// than a minimum: a kind added to this set keeps a Region alive, so a
// silent fifth arrival is a silent new way to litter the scene. This is
// the check that made the terrain pair declare itself.
// SIX AT 3.610.0: the wall and the storm, whose Regions carry their riders.
// SEVEN AT 3.630.1: the entry check, whose threshold spells had no other row.
ok("K6 the claiming set is exactly the seven region-reading kinds",
  REGION_CLAIMING_KINDS.length === 7
  && ["hazard", "elementalNexus", "areaRider", "difficultTerrain", "wall", "storm", "entryCheck"]
    .every((k) => REGION_CLAIMING_KINDS.includes(k)));
// K7 THE NEWEST CLAIMANT IS THE MOST LITERAL ONE. For the other three the
// Region is where a mechanism is recorded; for this one the Region IS the
// mechanism — Foundry's own movement code reads the behaviour on it — so
// releasing it is the spell not happening.
ok("K7 difficult terrain claims its region",
  areaRegionIsClaimed({ effects: [{ kind: "difficultTerrain" }] }) === true);

/* ── R. WHAT IS RELEASED ─────────────────────────────────────────── */
ok("R1 a blast's region is released", shouldClearAreaRegion("r1", blast) === true);
ok("R2 a claimant's region is kept", shouldClearAreaRegion("r1", { effects: [{ kind: "hazard" }] }) === false);
ok("R3 an emanation's region is kept", shouldClearAreaRegion("r1", blast, true) === false);
/*
 * R4 — A REFUND OVERRIDES THE CLAIM. A cast called off before it resolved
 * must not leave a live hazard behind for the rest of the session.
 */
ok("R4 A REFUNDED CAST RELEASES EVEN A CLAIMED REGION",
  shouldClearAreaRegion("r1", { effects: [{ kind: "hazard" }] }, false, true) === true
  && shouldClearAreaRegion("r1", blast, true, true) === true,
  "a cast that was called off claims nothing");
/*
 * R5 — NO REGION, NOTHING TO DO. A single-target spell places no
 * template, and asking Foundry to delete `undefined` throws.
 */
ok("R5 no region id means no deletion",
  shouldClearAreaRegion(null, blast) === false
  && shouldClearAreaRegion("", blast) === false
  && shouldClearAreaRegion(undefined, blast, false, true) === false,
  "deleting an undefined id would throw inside the cast");

/* ── P. THE REFUND ARITHMETIC ────────────────────────────────────── */
ok("P1 what was spent comes back", refundedPool(70, 20, 90) === 90);
/*
 * P2 — CLAMPED TO THE POOL. A refund restores a known previous value, so
 * it can never lift a pool above its own ceiling; unclamped, a cancelled
 * cast would be a way of banking resource.
 */
ok("P2 AND NEVER ABOVE THE MAXIMUM",
  refundedPool(85, 20, 90) === 90 && refundedPool(90, 20, 90) === 90,
  "an unclamped refund is a way of banking resource");
ok("P3 nothing spent gives nothing back", refundedPool(70, 0, 90) === 70);
ok("P4 a negative or missing pool is treated as empty",
  refundedPool(-5, 10, 90) === 10 && refundedPool(undefined, 10, 90) === 10);
ok("P5 a zero maximum can never be exceeded", refundedPool(0, 10, 0) === 0);

/* ── L. THE LINE ─────────────────────────────────────────────────── */
ok("L1 the card names both resources",
  /20 PP<\/strong> and <strong>3 AP/.test(castRefundedLine("Missile Storm", 20, 3)));
ok("L2 and says the cast was called off",
  /called off/.test(castRefundedLine("Missile Storm", 20, 3))
  && /no targets were chosen/.test(castRefundedLine("Missile Storm", 20, 3)));
/*
 * L3 — OUT OF COMBAT NO AP WAS TAKEN, so none is claimed back. A card
 * promising an AP refund that `refundActionCost` correctly declined to
 * make would be the card lying about the mechanism.
 */
ok("L3 AP IS NOT CLAIMED WHEN NONE WAS SPENT",
  !/AP/.test(castRefundedLine("Missile Storm", 20, 0))
  && /20 PP/.test(castRefundedLine("Missile Storm", 20, 0)),
  "out of combat no AP is taken, so none may be promised");
ok("L4 a free cast still says it was called off",
  /called off/.test(castRefundedLine("Missile Storm", 0, 0))
  && !/refunded/.test(castRefundedLine("Missile Storm", 0, 0)));

/* ── W. AND IT IS REACHED ────────────────────────────────────────── */
const cast = strip(read("module", "magic", "cast-workflow.mjs"));
const ap = strip(read("module", "combat", "action-points-workflow.mjs"));
ok("W1 a cancelled picker refunds rather than proceeding",
  cast.includes("if (chosen === null) {") && cast.includes("castRefunded = true;"),
  "3.479.0 fell through to hitting everyone");
/*
 * W2 ASSERTS THE GUARDED LINE, NOT THE CALL. The first draft matched the
 * call alone, and a mutation replacing its condition with `false` walked
 * through it — the text was still there and the refund was dead. This is
 * the third time in two releases that a check has asserted a call rather
 * than the branch that reaches it; match the whole statement.
 */
ok("W2 both resources are given back",
  // 3.616.0: the caster's share, since a rod may have paid the rest (R13).
  cast.includes("refundedPool(ppPoolNow, casterPPSpent, ppMax)")
  && cast.includes("if (totalCastAP > 0) await refundActionCost(actor, totalCastAP);"),
  "a dead branch still contains the call");
/*
 * W3 — AND NOBODY IS HIT. Refunding while leaving the caught list intact
 * would charge nothing and still damage the whole area.
 */
ok("W3 A REFUNDED CAST TARGETS NOBODY",
  cast.includes("areaTargets = [];"),
  "a refund that still damaged the area would be the worst of both");
/*
 * W4 — THE RELEASE RUNS AFTER EVERY CLAIMANT. The hazard, nexus and rider
 * record onto this Region hundreds of lines above; releasing first would
 * delete the mechanism out from under the spell. Both anchors must exist
 * before their positions are compared.
 */
ok("W4 THE REGION IS RELEASED AFTER EVERY CLAIMANT HAS RECORDED", (() => {
  const claim = cast.lastIndexOf("await recordHazard(region, {");
  const release = cast.indexOf("shouldClearAreaRegion(placedArea?.regionId");
  return claim > -1 && release > -1 && claim < release;
})(), "releasing first would delete a hazard the spell just placed");
ok("W5 and the emanation's own liveness is asked, not assumed",
  // Re-anchored 3.609.2: the claim reads the chosen mode's rows (G3).
  cast.includes("shouldClearAreaRegion(placedArea?.regionId, { effects: effEffects }, emanationIsLive(spellData), castRefunded)"));
/*
 * W6 — THE AP REFUND CARRIES THE SAME COMBAT GUARD AS THE SPEND. AP is
 * only ever taken in combat; refunding without the guard invents a
 * resource the caster never paid.
 */
ok("W6 THE AP REFUND IS GUARDED BY actorInCombat, AS THE SPEND IS", (() => {
  const fn = ap.slice(ap.indexOf("export async function refundActionCost"));
  const body = fn.slice(0, fn.indexOf("\n}"));
  return body.includes("if (!actorInCombat(actor)) return;");
})(), "an unguarded refund hands out AP that was never spent");
ok("W7 and it is clamped to the maximum",
  ap.includes("const restored = Math.min(Math.max(0, max), Math.max(0, current) + cost);"));
ok("W8 a failed deletion does not lose the cast's result",
  cast.includes("console.warn(\"TRG Prime | the spell area region could not be released\", error);"),
  "a throw here would discard damage already applied");

/* ── P. THE PACK — the measurement the fix rests on ──────────────── */
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let areaSpells = 0, wouldLitter = 0, claimed = 0;
try {
  for await (const [k, v] of db.iterator()) {
    if (!k.startsWith("!items!") || v?.type !== "spell") continue;
    const s = v.system ?? {};
    if (!String(s.area ?? "").trim()) continue;
    areaSpells += 1;
    const live = /emanation/i.test(String(s.area ?? "")) || Boolean(s.sustained);
    if (areaRegionIsClaimed(s, live)) claimed += 1; else wouldLitter += 1;
  }
} finally { await db.close(); }
ok("Q1 the pack still has area spells to reason about", areaSpells > 100,
  `${areaSpells} found`);
/*
 * Q2 — THE LITTER IS REAL AND IT IS THE MAJORITY. Recorded as a measured
 * number rather than an impression: if a later change made every area
 * spell a claimant, this fix would be dead code and nobody would notice.
 */
ok("Q2 AND MOST OF THEM ARE THE ONES THAT USED TO LITTER",
  wouldLitter > claimed && wouldLitter > 50,
  `${wouldLitter} released, ${claimed} claimed, of ${areaSpells}`);

/* ── report ──────────────────────────────────────────────────────── */
/* ================================================================== *
 * R. A RECURRING LADDER KEEPS THE REGION IT IS WRITTEN ON (3.590.1)
 * ================================================================== */

/*
 * THE DEFECT THIS FILE'S OWN HEADER PREDICTED, arriving three releases
 * later: "a NEW region-reading mechanism that forgets to claim loses its
 * region immediately and loudly on the first live cast". The recurring
 * save ladder shipped at 3.587.0 and forgot. It was not loud, because
 * `recordRecurringLadder` SUCCEEDS \u2014 it stamps the flag onto a Region
 * that the clean-up deletes moments later.
 *
 * So Disturbing Tentacles' "whenever a creature ends its turn in the
 * area" Will save was never rolled once, in any release. Found on 25
 * September 2026 by casting INCENDIARY CLOUD in Graham's world: "20 ft
 * radius template placed \u2014 caught 3", and no Region on the scene
 * afterwards.
 */
{
  const recurring = { effects: [{ kind: "saveLadder", recurring: { save: "will", on: "endOfTurn" } }] };
  const plain = { effects: [{ kind: "saveLadder", ladder: { success: "4d6" } }] };
  ok("R1 A RECURRING LADDER CLAIMS THE REGION", areaRegionIsClaimed(recurring),
    "the ladder lives on the Region; deleting it is the second save never happening");
  ok("R2 A PLAIN CAST-TIME LADDER DOES NOT", !areaRegionIsClaimed(plain),
    "six spells carry one, and it has resolved by the time the card prints \u2014 claiming "
    + "for them puts a Region on the scene per cast, which is the 3.480.0 littering back again");
  ok("R3a a saveLadder WITH a recurring half claims",
    rowClaimsForRecurringLadder({ kind: "saveLadder", recurring: {} }));
  ok("R3b a saveLadder WITHOUT one does not",
    !rowClaimsForRecurringLadder({ kind: "saveLadder" }));
  ok("R3c and this helper is about saveLadder alone",
    !rowClaimsForRecurringLadder({ kind: "hazard", recurring: {} }),
    "a hazard claims through REGION_CLAIMING_KINDS; this is the second, narrower route");
  ok("R4 so the cast keeps it", !shouldClearAreaRegion("r1", recurring));
  ok("R5 and releases the plain one", shouldClearAreaRegion("r1", plain));
  ok("R6 A REFUNDED CAST STILL RELEASES IT", shouldClearAreaRegion("r1", recurring, false, true),
    "a cast called off claims nothing, whatever the spell declares");
  ok("R7 an unspecified row claims nothing", !rowClaimsForRecurringLadder(null)
    && !rowClaimsForRecurringLadder({}) && !rowClaimsForRecurringLadder({ kind: "note" }));
}

if (failures.length) {
  console.error(`verify-area-region-life: ${failures.length} of ${checks} FAILED`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-area-region-life: ${checks} checks passed`);
