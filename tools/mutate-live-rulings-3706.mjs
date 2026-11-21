#!/usr/bin/env node
/** mutate-live-rulings-3706 — the mutation half of verify-live-rulings-3706 (Graham's answers of 21 November 2026, 3.706.0). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AT = M("combat", "attack.mjs");
const AW = M("combat", "action-workflow.mjs");
const AWK = M("combat", "attack-workflow.mjs");
const AF = M("combat", "action-feats.mjs");
const AFW = M("combat", "action-feats-workflow.mjs");
const BAC = M("combat", "basic-action-conditions.mjs");
const REL = M("combat", "target-relay.mjs");
const OPP = M("combat", "opportunity.mjs");
const OC = M("combat", "offer-card.mjs");
const RD = M("combat", "reactive-disarm-workflow.mjs");
const MUTATIONS = [
  { name: "A the Whip used adjacent again", file: AT, from: "      !(adjacent && item.system?.noAdjacent === true)", to: "      true" },
  { name: "A the check not told the target is adjacent", file: AW, from: "maneuverWeapon(Array.from(actor.items ?? []), maneuverTrait, { adjacent });", to: "maneuverWeapon(Array.from(actor.items ?? []), maneuverTrait);" },
  { name: "A adjacency at 10 ft", file: AW, from: "  return feet !== null && feet !== undefined && Number(feet) <= 5;", to: "  return feet !== null && feet !== undefined && Number(feet) <= 10;" },
  { name: "B Combat Grapple's grab has no clock", file: AF, from: "  return { grab: true, expiresRound: inCombat ? (Number(round) || 0) + 1 : null };", to: "  return { grab: true, expiresRound: null };" },
  { name: "B the grab is said, not laid", file: AFW, from: "      await applyBasicActionConditionEffects([{ target: \"target\", conditionKey: \"grabbed\", active: true }], actor, target,\n        { expiresRound: grab.expiresRound });", to: "" },
  { name: "B the Strike forgets whom it was against", file: AWK, from: "  if (check && typeof check === \"object\") check.strikeTarget = targetActor ?? null;\n", to: "" },
  { name: "C a player's clock written directly again", file: BAC, from: "  return statusRelayNeeded(targetActor, user);", to: "  return false;" },
  { name: "C the relayed conditions laid here as well", file: BAC, from: "    if (relayed && effect.target === \"target\") continue;\n", to: "" },
  { name: "C the actor's own conditions relayed too", file: REL, from: "    .filter((e) => e && e.target === \"target\" && typeof e.conditionKey === \"string\" && e.conditionKey.trim())", to: "    .filter((e) => e && typeof e.conditionKey === \"string\" && e.conditionKey.trim())" },
  { name: "C anyone's creature may lay them", file: REL, from: "      if (deps.userOwns?.(actor, String(request?.userId ?? \"\")) !== true) return { ok: false, reason: \"the asker does not own the acting creature\" };\n      const effects = relayableConditionEffects(payload.effects);", to: "      const effects = relayableConditionEffects(payload.effects);" },
  { name: "C a record without its condition", file: REL, from: "      if (!target.hasCondition?.(INFLICTED_BY_KINDS[kind])) return", to: "      if (false) return" },
  { name: "C recorded whatever stands", file: BAC, from: "  if (!target || !actor || !condition || !target.hasCondition?.(condition)) return false;", to: "  if (!target || !actor || !condition) return false;" },
  { name: "C the Feint records nobody", file: AW, from: "        await recordInflictedBy(targetActor, actor, \"flatFootedFrom\", { action: action.key });\n", to: "" },
  { name: "D no feat pays at its Strike", file: AFW, from: "  return Boolean(entry) && PAYS_AT_STRIKE.has(key) && entry.apCost !== \"0\" && !entry.strikePays;", to: "  return false;" },
  { name: "D the chosen-weapon feats pay up front again", file: AFW, from: "    // A STRIKE FEAT PAYS WHEN ITS STRIKE IS MADE (3.706.0) — see `paysAtStrike`.\n    if (!paysAtStrike(state.key)) await spendActionCost(", to: "    // A STRIKE FEAT PAYS WHEN ITS STRIKE IS MADE (3.706.0) — see `paysAtStrike`.\n    await spendActionCost(" },
  { name: "D every Strike pays the feat again", file: AFW, from: "    if (paid) return;\n", to: "" },
  { name: "D the Strike never pays it", file: AWK, from: "  if (typeof commitCost === \"function\") await commitCost();\n", to: "" },
  { name: "D the card never says nothing was spent", file: AFW, from: "  const unpaid = checks?.unpaid ? \" No AP was spent.\" : \"\";", to: "  const unpaid = \"\";" },
  { name: "D a quick-drawn weapon goes back unstowed", file: AF, from: "    \"system.stowed\": Boolean(system?.stowed),", to: "    \"system.stowed\": false," },
  { name: "E the stance threatens no further", file: AF, from: "  return stance && wieldingMelee ? Math.max(extension, LUNGE_REACH_FEET) : extension;", to: "  return extension;" },
  { name: "E the stance without a melee weapon", file: AF, from: "  return stance && wieldingMelee ? Math.max(extension, LUNGE_REACH_FEET) : extension;", to: "  return stance ? Math.max(extension, LUNGE_REACH_FEET) : extension;" },
  { name: "E a move provokes at the plain reach", file: OPP, from: "    const reach = opportunityReachOf(enemy);", to: "    const reach = reachOf(enemy);" },
  { name: "F every player reads it", file: OC, from: "    .filter((u) => u?.isGM || (reactors ?? []).some((a) => a?.testUserPermission?.(u, \"OWNER\")))", to: "    .filter((u) => Boolean(u))" },
  { name: "F created by whoever raised it", file: OC, from: "  return Boolean(user.isGM) || recipients.includes(user.id);", to: "  return true;" },
  { name: "F an offer to nobody created", file: REL, from: "  if (!whisper.length || typeof payload?.content !== \"string\") return null;", to: "  if (typeof payload?.content !== \"string\") return null;" },
  { name: "F always created here", file: OC, from: "  if (offerCreatedHere(globalThis.game?.user, whisper)) return ChatMessage.create({ ...data, whisper });", to: "  return ChatMessage.create({ ...data, whisper });" },
  { name: "F Reactive Disarm to the GM only", file: RD, from: "  }, { reactors: [defender] });", to: "  }, {});" },
  { name: "F Savage Jaw public again", file: AWK, from: "        await postOfferCard({\n          speaker: ChatMessage.getSpeaker({ actor: targetActor }),", to: "        await ChatMessage.create({\n          speaker: ChatMessage.getSpeaker({ actor: targetActor })," },
  { name: "F an AoO card's flag dropped by the GM's client", file: REL, from: "  \"reactionFeatCard\", \"aooCard\", ", to: "  \"reactionFeatCard\", " }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-live-rulings-3706.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-live-rulings-3706: verify-live-rulings-3706 already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-live-rulings-3706: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-live-rulings-3706: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
