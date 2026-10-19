#!/usr/bin/env node
/**
 * verify-session-decisions-1015 — 3.646.0, Graham's decisions of 15 October
 * 2026 on the 3.645.0 fixes:
 *   D1  a readied action, triggered, spends a reaction (and needs one)
 *   D2  any other off-turn swing is free of AP but asks the GM first
 *   D3  an ally aura may include its own source (Aura of Ashes)
 * and what the live test of 3.645.0 found:
 *   D4  a spell's conditions on a creature the caster does not own go
 *       through the GM (Song Of Despair from a player, still failing)
 *   D5  the AoO offer reaches the reactor's own player
 *   D6  Ready charges its 2 AP
 *   D7  the Strike's chooser offers the held weapon first
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const src = {
  aw: read("module", "combat", "action-workflow.mjs"),
  at: read("module", "combat", "attack-workflow.mjs"),
  gm: read("module", "combat", "gm-authorisation.mjs"),
  eff: read("module", "combat", "effect-application-workflow.mjs"),
  rw: read("module", "combat", "target-relay-workflow.mjs"),
  rl: read("module", "combat", "target-relay.mjs"),
  opp: read("module", "combat", "opportunity.mjs"),
  css: read("styles", "trg-prime.css"),
  boot: read("scripts", "trg-prime.mjs")
};

// D1
ok("D1a the trigger asks for a reaction before anything else, and keeps the readied action without one",
  /if \(blocked \|\| left < 1\) \{\n            ui\.notifications\.warn\(`Ready: \$\{actor\.name\} cannot react right now/.test(src.aw)
  && /const left = Number\(actor\.system\?\.resources\?\.reactions\?\.value \?\? 0\);/.test(src.aw));
ok("D1b a readied action that happened spends the reaction",
  /if \(done\) \{\n          await consumeReadiedAction\(actor\);\n          await spendActionCost\(actor, "reaction", "Ready"/.test(src.aw));
ok("D1c ...and so does a readied cast",
  /if \(cast\) \{\n            await consumeReadiedAction\(actor\);\n            await spendActionCost\(actor, "reaction", "Ready"/.test(src.aw));

// D2
ok("D2a an off-turn swing that is neither a reaction nor paid for asks the GM, and stops on a no",
  /const offTurnFree = offTurn && !isReaction && !apPaid;\n  if \(offTurnFree\) \{[\s\S]{0,300}if \(!\(await requestGMAuthorisation\(actor, what\)\)\) return null;/.test(src.at));
ok("D2b ...and costs no AP", /\} else if \(!isReaction && !apPaid && !offTurnFree\) \{\n    await spendActionPoints\(actor, "1"/.test(src.at)
  && /\) && !isReaction && !apPaid && !offTurnFree;/.test(src.at));
ok("D2c a player's ask waits for the GM's answer; none connected is a no",
  /if \(game\.user\?\.isGM\) return askHere\(\{ who, what \}\);/.test(src.gm) && /if \(!game\.users\?\.activeGM\) \{/.test(src.gm)
  && /return allowed === true;/.test(src.gm));
ok("D2d only the acting GM answers, and only the asker hears", /if \(data\?\.action !== ASK \|\| !isActingGM\(\)\) return;/.test(src.gm) && /if \(data\.userId !== game\.user\?\.id\) return;/.test(src.gm));
ok("D2e the listener is registered at boot", /registerGMAuthorisation\(\);/.test(src.boot) && /from "\.\.\/module\/combat\/gm-authorisation\.mjs"/.test(src.boot));

// D3
const CA = await import(new URL("../module/creature-auras.mjs", import.meta.url));
const AL = await import(new URL("../module/ally-aura-effects.mjs", import.meta.url));
const ashes = CA.normaliseAura({ id: "c", name: "Aura of Ashes", kind: "ally", radius: 20, includeSelf: true, allyEffect: { statuses: ["concealed"] }, enemyEffect: { statuses: ["concealed"] } }, { id: "y", name: "Aura of Ashes" });
const command = CA.normaliseAura({ id: "m", name: "Aura of Command", kind: "ally", radius: 30, allyEffect: { changes: [{ key: "system.combat.attack.circumstance", value: "1" }] } }, { id: "x", name: "Aura of Command" });
equal("D3a includeSelf is read on an ally aura only, and only when declared", [ashes.includeSelf, command.includeSelf], [true, false]);
const at = (x) => ({ x, y: 0 });
const grants = (aura) => AL.wantedAllyGrants({
  subjects: [{ id: "E", centreFeet: at(0), widthFeet: 5, disposition: -1 }, { id: "F", centreFeet: at(10), widthFeet: 5, disposition: 1 }],
  emitters: [{ id: "E", name: "Yulussil", centreFeet: at(0), widthFeet: 5, disposition: -1, auras: [aura] }]
});
const g1 = grants(ashes), g2 = grants(command);
equal("D3b the Yulussil conceals itself, its own effect not the enemies' mirror; a foe nearby too; Command still skips its source",
  [(g1.get("E") ?? []).map((g) => g.enemy), (g1.get("F") ?? []).map((g) => g.enemy), (g2.get("E") ?? []).length],
  [[false], [true], 0]);

// D4
ok("D4a an unowned creature's conditions are relayed, the GM's re-entry is direct",
  /if \(!direct && actor && actor\.isOwner === false\) \{\n    const \{ relayConditionTags \}/.test(src.eff)
  && /applyConditionTags\(target, tags, \{ \.\.\.options, direct: true \}\)/.test(src.rw));
ok("D4b the spell's clock, cast id and traits travel with them", /for \(const key of \["duration", "spellEffect", "spellEffectEnd", "castId", "sourceTraits"\]\)/.test(src.rw)
  && /castId: carried\.castId \?\? null,/.test(src.rl) && /duration: carried\.duration \?\? null,/.test(src.rl));
{
  const RL = await import(new URL("../module/combat/target-relay.mjs", import.meta.url));
  let seen = null;
  const target = { uuid: "Actor.b" };
  await RL.performRelay({ action: RL.RELAY_ACTIONS.CONDITIONS, uuid: "Actor.b", userId: "u", requestId: "r",
    payload: { tags: [{ key: "frightened", value: 1 }], expiresRound: 3, options: { castId: "c1", spellEffect: true, duration: { seconds: 60 } } } },
  { fromUuid: async () => target, applyConditionTags: async (t, tags, o) => { seen = o; return []; }, reply: () => {} });
  equal("D4c the GM's side lays the condition with the caster's options", [seen?.castId, seen?.spellEffect, seen?.duration, seen?.expiresRound], ["c1", true, { seconds: 60 }, 3]);
}
// D5
ok("D5 the offer is whispered to each reactor's non-GM owner too", /\.filter\(\(u\) => !u\.isGM && reactors\.some\(\(\{ actor \}\) => actor\?\.testUserPermission\?\.\(u, "OWNER"\)\)\)/.test(src.opp)
  && /whisper: \[\.\.\.new Set\(\[\.\.\.ChatMessage\.getWhisperRecipients\("GM"\)\.map\(\(u\) => u\.id\), \.\.\.reactorOwners\]\)\]/.test(src.opp));
// D6
ok("D6 Ready asks for and spends its own AP before ending the turn", /if \(!\(await ensureActionPoints\(actor, action\.apCost, action\.name, \{ traits: action\.traits \}\)\)\) return null;\n      await spendActionCost\(actor, action\.apCost, action\.name, \{ traits: action\.traits \}\);\n      await readyActionAndEndTurn/.test(src.aw));
// D7
ok("D7 the Strike's chooser sorts the fist last", /\.sort\(\(a, b\) => Number\(Boolean\(a\.system\?\.natural\)\) - Number\(Boolean\(b\.system\?\.natural\)\)\);/.test(src.aw));

// D8 (3.646.1): the Endeavour buttons stack full width and grow to fit.
ok("D8 the Endeavour row is a column and its buttons are not held to 28px",
  /\.endeavour-award\.conviction-bonus-control \{\n  flex-direction: column;\n  align-items: stretch;/.test(src.css)
  && /\.endeavour-award\.conviction-bonus-control \.small-button \{\n  height: auto;[\s\S]{0,120}white-space: normal;/.test(src.css));

const EXPECTED = 18;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-session-decisions-1015: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-session-decisions-1015: ${checks} checks — all green.`);
