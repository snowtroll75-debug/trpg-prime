#!/usr/bin/env node
/**
 * verify-target-permission — writing to somebody else's character.
 *
 * NEW at 3.474.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND IN A LIVE SESSION, 2 September 2026.
 *
 * Graham was mid-game. A player cast Cure on another player's character
 * and Foundry refused:
 *
 *     "User lacks permission to create ActiveEffect"
 *
 * Guidance did the same. A player owns their own actor and NOBODY
 * ELSE'S, so any write to another character — an effect, an HP update, a
 * status toggle — is refused on the caster's client.
 *
 * THE RELAY ALREADY EXISTED AND WAS ONLY PARTLY USED. `target-relay`
 * carries damage, conditions, statuses, item HP and effects through the
 * GM, and `spell-effects.mjs` used it in EIGHT places and bypassed it in
 * SEVEN — heldBonus (Guidance), strikeRider, suppress, elementalShield,
 * thorns, ward and hinder all called `createEmbeddedDocuments` directly.
 * HEALING had no relay action at all, which is why Cure failed too.
 *
 * WHY NOTHING CAUGHT IT: every check in this project drives the rules,
 * and every rule was right. Permission is not a rule — it is a fact
 * about WHO IS ASKING, and the harness has no players. Only a real table
 * with two characters could have shown it, and one did.
 *
 * SO THIS FILE IS A RATCHET, not a rule test: it asserts that nothing in
 * the spell pipeline writes to a target directly, because a check that
 * only tested the seven known cases would pass the eighth.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { RELAY_ACTIONS, needsRelay } from "../module/combat/target-relay.mjs";

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

/* ── N. WHEN A RELAY IS NEEDED ───────────────────────────────────── */
ok("N1 a document we do not own needs the relay", needsRelay({ isOwner: false }) === true);
// OUR OWN CHARACTER IS WRITTEN DIRECTLY. Relaying everything would put
// every self-buff through the GM and break a table with no GM connected.
ok("N2 and one we own does not", needsRelay({ isOwner: true }) === false);
ok("N3 nothing at all needs nothing", needsRelay(null) === false);

/* ── H. HEALING SOMEBODY ELSE ────────────────────────────────────── */
ok("H1 the relay carries healing", RELAY_ACTIONS.HEAL === "target.heal");
const relay = strip(read("module", "combat", "target-relay.mjs"));
ok("H2 and the GM handles it", relay.includes("case RELAY_ACTIONS.HEAL: {")
  && relay.includes("await deps.applyHealing(target, amount, {"));
/*
 * H3 — HEALING IS ITS OWN ACTION, NOT NEGATIVE DAMAGE. It is capped at
 * max HP and it steps Dying back by a rule that depends on whether the
 * healing was magical. Sending a negative amount through DAMAGE would
 * have skipped every bit of that.
 */
ok("H3 AND IT CARRIES WHETHER IT WAS MAGICAL",
  relay.includes("magical: payload.magical !== false"),
  "the Dying step depends on it, so negative damage would not have done");

const effects = strip(read("module", "magic", "spell-effects.mjs"));
ok("H4 healActor asks the relay when the target is not ours",
  // Death's Defiance's no-fatigue recovery rides along since 3.611.0.
  effects.includes("if (needsRelay(actor)) return relayHeal(actor, amount, { magical, noDyingFatigue, dyingHalf }, null);"));
/*
 * H5 IS THE LOOP-STOPPER. The relay handler calls `healActor` again on
 * the GM's client. Without a flag saying so it would ask the relay a
 * second time and the request would bounce for ever.
 */
ok("H5 AND THE GM'S RE-ENTRY DOES NOT ASK AGAIN",
  effects.includes("export async function healActor(actor, amount, { magical = true, direct = false, noDyingFatigue = false, dyingHalf = false } = {}) {")
  && effects.includes("if (!direct) {"),
  "the handler re-enters healActor on the GM's client");
const flow = strip(read("module", "combat", "target-relay-workflow.mjs"));
ok("H6 and the handler passes that flag",
  flow.includes("return healActor(target, amount, { ...options, direct: true });"));
ok("H7 there is a relayHeal to call", flow.includes("export async function relayHeal(target, amount, options, applyDirect) {"));

/* ── R. THE RATCHET ──────────────────────────────────────────────── */
/*
 * NOTHING IN THE SPELL PIPELINE WRITES TO A TARGET DIRECTLY.
 *
 * Asserted as an absence rather than as seven named cases, because the
 * defect was the EIGHTH case being written the old way — and a check
 * listing the seven would have passed it.
 */
const DIRECT = /createEmbeddedDocuments\("ActiveEffect"/;
ok("R1 NO SPELL EFFECT CREATES AN ACTIVE EFFECT DIRECTLY",
  !DIRECT.test(effects),
  "a player casting on another player's character is refused by Foundry");
ok("R2 they go through the relay instead",
  (effects.match(/createEffectsOn\(/g) ?? []).length >= 14,
  "eight already did; the seven that did not are what broke a live session");

/*
 * R3 IS THE HONEST BOUNDARY. Files that only ever touch the actor whose
 * sheet or turn it is — a stance, a rage, aim, exhaustion — write
 * directly and are RIGHT to: relaying a self-buff would need a GM
 * connected to raise your own shield. They are listed so the absence
 * above is understood as scoped rather than universal.
 */
const SELF_ONLY = Object.freeze([
  "module/combat/basic-action-stances.mjs",
  "module/combat/exhaustion-workflow.mjs",
  "module/combat/rage-workflow.mjs",
  "module/combat/aim.mjs",
  "module/magic/wildshape-riders.mjs",
  "module/rune-spell-workflow.mjs",
  "module/modifier/transactions.mjs",
  "module/encumbrance-workflow.mjs",
  "module/magic/emanation-effects.mjs",
  "module/combat/target-relay-workflow.mjs"
]);
for (const file of SELF_ONLY) {
  ok(`R3 ${file} is still in the tree`, fs.existsSync(path.join(SYSTEM_ROOT, file)),
    "a declared exception must name something that exists");
}

if (failures.length) {
  process.stderr.write(`verify-target-permission: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-target-permission: OK — ${checks} checks. Nothing in the spell pipeline writes to a target it may not own.\n`);
