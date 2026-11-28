#!/usr/bin/env node
/**
 * verify-fixes-3719-0 — what the companion-module spell sweep found.
 *
 * NEW at 3.719.0. Every module spell (Eldritch Arts 130, Pillars of Faith
 * 75, Inner Tempest 25) cast from the player's seat, 28 November 2026,
 * then the beneficial ones again on an ally that player does not own:
 *
 *   Writ of Restraint (Pillars of Faith) on the Judged Subject
 *       "User PC Tester lacks permission to update ActiveEffect" — the
 *       slowed landed, its "cannot use Reactions" stamp did not.
 *   Restoration (core; and Pillars of Faith's Nine-Herb Restorative, Soul
 *   Rebinding, Share Burden, which use the same row) on another player's
 *   character
 *       "lacks permission to update Actor" — the condition came down, the
 *       once-a-day record threw, and the cast posted no Result card.
 *
 * The narration half (HTML descriptions) is verify-spell-narration's B9–B18.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { RELAY_ACTIONS, SPELL_RELAY_FLAGS, EFFECT_STAMP_FLAGS, handleRelayMessage, buildRelayRequest } from "../module/combat/target-relay.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (p) => fs.readFileSync(path.join(SYSTEM_ROOT, p), "utf8");
const GM = { id: "gm1", isGM: true };

async function relay(action, payload) {
  const rec = { calls: [] };
  const target = { name: "Ally", uuid: "Actor.ally" };
  const effect = { id: "e1", flags: { "trg-prime": { spellEffect: true } } };
  const deps = {
    fromUuid: async (u) => (u === "Actor.ally" ? target : null),
    userOwns: () => true,
    setSpellFlag: async (...a) => { rec.calls.push(["flag", ...a]); },
    effectOf: (t, id) => (id === "e1" ? effect : null),
    isSpellEffect: (e) => e === effect,
    deleteEffect: async (e) => { rec.calls.push(["delete", e]); },
    stampEffect: async (e, f) => { rec.calls.push(["stamp", e, f]); },
    reply: (m) => { rec.reply = m; },
    acknowledge: () => {}
  };
  await handleRelayMessage(buildRelayRequest({ action, uuid: "Actor.ally", userId: "player1", requestId: "r1", payload }),
    { user: GM, activeGM: GM, deps });
  return { rec, target, effect };
}

/* A. Writ of Restraint's no-Reactions stamp -------------------------- */
ok("A1 fumbleNoReactions is a stamp the GM may set", EFFECT_STAMP_FLAGS.includes("fumbleNoReactions"));
{
  const { rec, effect } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", flags: { fumbleNoReactions: true } });
  ok("A2 and the GM's client stamps it on the named effect",
    rec.reply?.ok === true && rec.calls[0]?.[0] === "stamp" && rec.calls[0]?.[1] === effect && rec.calls[0]?.[2]?.fumbleNoReactions === true,
    JSON.stringify(rec));
}
{
  const { rec } = await relay(RELAY_ACTIONS.EFFECT_STAMP, { effectId: "e1", flags: { fumbleNoReactions: true, changes: [] } });
  ok("A3 a stray key beside it is still refused", rec.reply?.ok === false && rec.calls.length === 0);
}
const effects = read("module/magic/spell-effects.mjs");
const noR = effects.slice(effects.indexOf("          if (effect.noReactions) {"), effects.indexOf("          if (effect.noReactions) {") + 900);
ok("A4 the cast stamps it through setEffectFlags", /await setEffectFlags\(e, \{ fumbleNoReactions: true \}\)/.test(noR), noR.slice(0, 200));
ok("A5 and no longer writes the effect directly", !/e\.setFlag\(SYSTEM_ID, "fumbleNoReactions"/.test(effects));
const linked = read("module/combat/linked-conditions-workflow.mjs");
ok("A6 the follow-on carry (Slowed 2 → Slowed 1) goes the same way",
  /await setEffectFlags\(effect, \{ \[flag\]: value \}\)/.test(linked) && !/effect\.setFlag\("trg-prime", flag, value\)/.test(linked));

/* B. Restoration's once-a-day record -------------------------------- */
ok("B1 reliefUsedToday is a record the GM may write", SPELL_RELAY_FLAGS.includes("reliefUsedToday"));
{
  const value = { restoration: true };
  const { rec, target } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "reliefUsedToday", value });
  ok("B2 and the GM's client writes it on the fetched target",
    rec.reply?.ok === true && rec.calls[0]?.[1] === target && rec.calls[0]?.[2] === "reliefUsedToday" && rec.calls[0]?.[3] === value,
    JSON.stringify(rec));
}
{
  const { rec } = await relay(RELAY_ACTIONS.SPELL_FLAG, { key: "reliefUsedToday", value: "yes" });
  ok("B3 a record that is not an object is refused", rec.reply?.ok === false && rec.calls.length === 0);
}
const relief = effects.slice(effects.indexOf('case "conditionRelief": {'), effects.indexOf('case "conditionRelief": {') + 12000);
ok("B4 the relief row writes it through setTargetFlag",
  /await setTargetFlag\(target, RELIEF_FLAG,\s*markRelievedToday\(reliefRecord, reliefSpec\.oncePerDay\)\)/.test(relief));
ok("B5 and no longer writes the target directly", !/await target\.setFlag\(SYSTEM_ID, RELIEF_FLAG/.test(effects));

/* C. The release -------------------------------------------------------- */
const sys = JSON.parse(read("system.json"));
ok("C1 the system is 3.719.0 or later (now 3.719.1)", sys.version === "3.719.1", sys.version);

if (failures.length) {
  process.stderr.write(`verify-fixes-3719-0: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3719-0: OK — ${checks} checks.\n`);
