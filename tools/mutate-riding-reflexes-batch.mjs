#!/usr/bin/env node
/**
 * mutate-riding-reflexes-batch — can verify-riding-reflexes-batch fail?
 *
 * NEW at 3.378.0. SURVIVED and an unmatched anchor are both failures.
 *
 * EVERY ONE OF THESE REMOVES A LIMIT rather than breaking a bonus, because
 * that is how these three feats will actually go wrong. A feat that stops
 * working gets reported at the next session; a feat that quietly stops
 * checking its own cap does not, because it now feels good.
 *
 * ONE MUTATION WAS WRITTEN AND REMOVED, recorded here rather than left
 * out silently. It replaced `FLAT_FOOTED_BLOCK` with the identical string
 * literal in `reactions.mjs`. Nothing catches it and nothing should: the
 * behaviour is byte-for-byte the same, and the constant exists to stop a
 * FUTURE reword from silently unhooking the waiver, not to change what
 * happens today. A mutation no check can distinguish is not a gap in the
 * checks — testing around it would have meant inventing an assertion
 * about source style and calling it a rule.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const FEATS = path.join(SYSTEM_ROOT, "module", "feats.mjs");
const MOVE = path.join(SYSTEM_ROOT, "module", "combat", "movement.mjs");
const MOVEW = path.join(SYSTEM_ROOT, "module", "combat", "movement-workflow.mjs");
const OPPR = path.join(SYSTEM_ROOT, "module", "combat", "opportunity-rules.mjs");
const OPP = path.join(SYSTEM_ROOT, "module", "combat", "opportunity.mjs");
const REACT = path.join(SYSTEM_ROOT, "module", "combat", "reactions.mjs");
const CDOC = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const AWORK = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");

const MUTATIONS = [
  /* ---- Skitter ---- */
  {
    name: "THE FLOOR GOES: a slow crawler crawls less far than everyone else",
    file: MOVE,
    from: "      return Math.max(\n        Number.isFinite(floor) ? floor : 0,\n        Math.floor((Number(speed) || 0) * fraction)\n      ) + Math.max(0, Number(limitBonus) || 0);",
    to: "      return Math.floor((Number(speed) || 0) * fraction) + Math.max(0, Number(limitBonus) || 0);",
    breaks: "A5-A7 — a 10 ft Speed would crawl 5 without the feat and 5... no, 5 -> 2 with it"
  },
  {
    name: "the fraction rounds UP instead of down",
    file: MOVE,
    from: "        Math.floor((Number(speed) || 0) * fraction)",
    to: "        Math.ceil((Number(speed) || 0) * fraction)",
    breaks: "A3 — a 25 ft Speed would crawl 13 rather than 12"
  },
  {
    name: "Skitter applies to every movement action",
    file: FEATS,
    from: "    if (entry && entry.action === actionKey) {",
    to: "    if (entry) {",
    breaks: "A8 — Step, Stride and the rest would all become half-Speed"
  },
  {
    name: "the fraction becomes a full Speed",
    file: FEATS,
    from: "  skitter: Object.freeze({ action: \"crawl\", fraction: 0.5, minDistance: 5 })",
    to: "  skitter: Object.freeze({ action: \"crawl\", fraction: 1, minDistance: 5 })",
    breaks: "A2/A4 — 'half your Speed' would be all of it"
  },
  {
    name: "the arming UI stops knowing about the feat",
    file: MOVEW,
    from: "    limit: armedMoveLimit(armed, speed, featMovementBonus(actor, armed), featMovementFraction(actor, armed)),",
    to: "    limit: armedMoveLimit(armed, speed, featMovementBonus(actor, armed)),",
    breaks: "D2 — a player would be shown 5 ft and allowed 15, or the reverse"
  },
  {
    name: "the validator stops knowing about the feat",
    file: MOVEW,
    from: "        limitBonus: featMovementBonus(actor, state.armed),\n        fractionOverride: featMovementFraction(actor, state.armed)",
    to: "        limitBonus: featMovementBonus(actor, state.armed)",
    breaks: "D1 — the feat would display and never apply"
  },

  /* ---- Improved Combat Reflexes ---- */
  {
    name: "a NEGATIVE Dex shrinks the reaction pool",
    file: OPPR,
    from: "  const bonus = Math.max(0, Math.floor(Number(dexterity) || 0));",
    to: "  const bonus = Math.floor(Number(dexterity) || 0);",
    breaks: "B5 — a clumsy character would be worse off WITH the feat"
  },
  {
    name: "a lost turn still grants the bonus reactions",
    file: OPPR,
    from: "  if (reactionLost) return { value: 0, bonus: 0 };",
    to: "  void reactionLost;",
    breaks: "B8 — the feat would undo whatever took the turn away"
  },
  {
    name: "the Flat-Footed allowance stops being once a round",
    file: OPPR,
    from: "  return hasImprovedCombatReflexes(featNames) && !usedThisRound;",
    to: "  return hasImprovedCombatReflexes(featNames);",
    breaks: "B11 — every provoke would be answerable while Flat-Footed"
  },
  {
    name: "the feat gate stops being checked",
    file: OPPR,
    from: "  if (!hasImprovedCombatReflexes(featNames)) return { value: base, bonus: 0 };",
    to: "  void featNames;",
    breaks: "B1 — everyone would gain reactions equal to their Dex"
  },
  {
    name: "THE WAIVER WIDENS: Confused and Full Defence are waived too",
    file: OPP,
    from: "  if (raw !== FLAT_FOOTED_BLOCK) return raw;",
    to: "  if (!raw) return raw;",
    breaks: "D6 — the feat names Flat-Footed and nothing else"
  },
  {
    name: "the waiver is applied to the offer but not the explanation",
    file: OPP,
    /*
     * THE TRAILING `});` IS RESTORED AND IS NOT SCENERY (3.502.0).
     *
     * The anchor-trimming pass removed it on the rule that a delimiter
     * carried unchanged into the replacement is decoration. Here it was
     * DISAMBIGUATION: `opportunity.mjs` holds two identical
     * `reactorEligibility({...})` blocks, and the first ends its
     * `hasMeleeStrike: true` with a trailing comment. Without the closing
     * line the anchor matched both and the mutation reported ANCHOR x2 —
     * caught by the sweep, which is where a collision belongs.
     *
     * Declared in `verify-mutation-anchors`'s KEEP list with this reason.
     */
    from: "  const elig = reactorEligibility({\n    inCombat: Boolean(game.combat?.started && actor.inCombat),\n    reactions: Number(actor.system?.resources?.reactions?.value ?? 0),\n    blockReason: effectiveReactionBlock(actor),\n    hasMeleeStrike: true\n  });",
    to: "  const elig = reactorEligibility({\n    inCombat: Boolean(game.combat?.started && actor.inCombat),\n    reactions: Number(actor.system?.resources?.reactions?.value ?? 0),\n    blockReason: actorReactionBlock(actor),\n    hasMeleeStrike: true\n  });",
    breaks: "D5 — the card would offer an attack and the explanation deny it"
  },
  {
    name: "the Flat-Footed allowance is never given back",
    file: OPP,
    from: "    if (wasFlatFooted) await reactor.unsetFlag(SYSTEM_ID, \"flatFootedOpportunityUsed\");",
    to: "    void wasFlatFooted;",
    breaks: "D8 — a cancelled prompt would cost the round's only chance"
  },
  {
    name: "the Dex SCORE is read instead of the modifier",
    file: CDOC,
    from: "      dexterity: Number(actor.system?.attributes?.dexterity?.total ?? 0),",
    to: "      dexterity: Number(actor.system?.attributes?.dexterity?.base ?? 0),",
    breaks: "D4 — roughly four times too many reactions"
  },

  {
    // THE 3.378.1 BUG, restored. The feat is filed as "Combat Reflexes,
    // Improved"; 3.378.0 matched the PROSE ordering, which nothing in the
    // data is called, so the feat did nothing at all. The harness agreed
    // with the code because both used the invented name — only granting
    // the real pack item to a real actor showed it.
    name: "THE SHIPPED BUG: the feat is matched by a name the pack does not use",
    file: OPPR,
    from: "const IMPROVED_COMBAT_REFLEXES = Object.freeze([\n  \"combat reflexes, improved\",\n  \"improved combat reflexes\"\n]);",
    to: "const IMPROVED_COMBAT_REFLEXES = Object.freeze([\"improved combat reflexes\"]);",
    breaks: "F2/F3 — the feat would grant nothing, silently"
  },
  {
    name: "the match loosens so the BASE feat picks up the Improved clauses",
    file: OPPR,
    from: "    .some((n) => IMPROVED_COMBAT_REFLEXES.includes(String(n ?? \"\").trim().toLowerCase()));",
    to: "    .some((n) => IMPROVED_COMBAT_REFLEXES.some((k) => k.includes(String(n ?? \"\").trim().toLowerCase())));",
    breaks: "F4 — 'Combat Reflexes' is a substring of the Improved name"
  },

  /* ---- Born to Ride ---- */
  {
    name: "AN ALREADY-FREE ACTION BURNS THE ROUND'S ONE USE",
    file: FEATS,
    from: "    const alreadyFree = cost === \"free\" || cost === \"0\";",
    to: "    const alreadyFree = false;",
    breaks: "C4/C5 — guiding with knees would silently spend the discount"
  },
  {
    name: "the feat covers every action, not the three named",
    file: FEATS,
    from: "    if (!actions?.includes(key)) continue;",
    to: "    if (!actions) continue;",
    breaks: "C6 — every action in the game would be free once a round"
  },
  {
    name: "the once-per-round flag is never set",
    file: AWORK,
    from: "    await actor.setFlag(SYSTEM_ID, \"bornToRideUsed\", true);",
    to: "    void actor;",
    breaks: "D10 — the feat would apply to every riding action, every round"
  },
  {
    name: "the flag is set when the cost is worked out, not on commitment",
    file: AWORK,
    from: "  const bornToRide = oncePerRoundFreeAction(action.key, effectiveApCost, actorFeatNames);\n  let bornToRideSpent = false;\n  if (bornToRide.applies && bornToRide.changes\n    && !actor.getFlag?.(SYSTEM_ID, \"bornToRideUsed\")) {\n    effectiveApCost = \"0\";\n    bornToRideSpent = true;",
    to: "  const bornToRide = oncePerRoundFreeAction(action.key, effectiveApCost, actorFeatNames);\n  let bornToRideSpent = false;\n  if (bornToRide.applies && bornToRide.changes\n    && !actor.getFlag?.(SYSTEM_ID, \"bornToRideUsed\")) {\n    effectiveApCost = \"0\";\n    bornToRideSpent = true;\n    await actor.setFlag(SYSTEM_ID, \"bornToRideUsed\", true);",
    breaks: "D10 — a cancelled action would burn the round's use"
  },
  {
    name: "the free action says nothing on the card",
    file: AWORK,
    from: "  if (bornToRideSpent) {\n    lines.push(line(",
    to: "  if (false && bornToRideSpent) {\n    lines.push(line(",
    breaks: "D11 — an action that suddenly costs nothing would look like a bug"
  },

  /* ---- The round boundary ---- */
  {
    name: "the Flat-Footed marker never resets",
    file: CDOC,
    from: "      [`flags.${SYSTEM_ID}.flatFootedOpportunityUsed`]: deletionValue(),",
    to: "",
    breaks: "D12 — the feat's second clause would work once per campaign"
  },
  {
    name: "Born to Ride's marker never resets",
    file: CDOC,
    from: "      [`flags.${SYSTEM_ID}.bornToRideUsed`]: deletionValue()",
    to: "      [`flags.${SYSTEM_ID}.bornToRideUnused`]: deletionValue()",
    breaks: "D12 — one free riding action per campaign"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-riding-reflexes-batch.mjs")], {
      stdio: ["ignore", "pipe", "pipe"]
    });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([FEATS, MOVE, MOVEW, OPPR, OPP, REACT, CDOC, AWORK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-riding-reflexes-batch: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-riding-reflexes-batch: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-riding-reflexes-batch: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
