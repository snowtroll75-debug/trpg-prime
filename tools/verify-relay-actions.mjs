#!/usr/bin/env node
/**
 * verify-relay-actions — every relay action is implemented, every
 * implementation is declared, and an unknown one is refused.
 *
 * NEW at 3.396.1.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE RELAY HAD NO HARNESS AT ALL. Eight actions, and nothing checked
 * any of them — found while adding a ninth on 25 August.
 *
 * That matters more here than in most modules, because the relay IS the
 * trust boundary. It is how a player's client asks the GM's client to
 * write to a document the player may not touch: damage, conditions,
 * status effects, whole ActiveEffect documents, item HP, and now an
 * attached light. `target-relay.mjs` reasons carefully about that
 * boundary in prose — which payloads are named fields and which carry
 * asker-built documents — and none of that reasoning was checked.
 *
 * THIS FILE DOES NOT CLOSE THAT GAP. It checks one invariant, the one
 * that protects the action added at 3.396.1 and would protect the next:
 * the registry and the switch cannot drift apart. A `RELAY_ACTIONS`
 * entry with no `case` is an operation that silently reports "unknown
 * relay action" to a player whose spell has half-landed; a `case` with
 * no registry entry is unreachable code that reads as live.
 *
 * The other seven actions still deserve behavioural checks of their own,
 * and A6 below names that rather than leaving it implied.
 */

import * as walk from "acorn-walk";
import { parseAll, rel, reportParseFailures } from "./lib/sources.mjs";
import { RELAY_ACTIONS, handleRelayMessage, needsRelay, removalNeedsRelay, buildRelayRequest }
  from "../module/combat/target-relay.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}

/* ================================================================== *
 * A. The registry and the switch agree, in both directions
 * ================================================================== */

const { parsed, failed } = parseAll();
if (reportParseFailures(failed, "verify-relay-actions")) process.exit(1);

const relayFile = parsed.find((f) => rel(f.file) === "module/combat/target-relay.mjs");
ok("A0 target-relay.mjs was parsed", Boolean(relayFile));

// THE CASES ARE FOUND BY WALKING THE AST, not by grepping for the word.
// A grep would match the registry declaration, the comments that name
// each action, and this file's own text — the vocabulary-not-behaviour
// mistake that four checks made on 24 August.
const handled = new Set();
if (relayFile) {
  walk.simple(relayFile.ast, {
    SwitchCase(node) {
      const t = node.test;
      if (t?.type !== "MemberExpression") return;
      if (t.object?.name !== "RELAY_ACTIONS") return;
      const name = t.property?.name;
      if (name && Object.hasOwn(RELAY_ACTIONS, name)) handled.add(name);
    }
  });
}

// RESULT IS A REPLY, NOT A REQUEST. It is the one registry entry that
// must NOT have a handler case — `handleRelayMessage` turns it away
// before the switch. Declared here so its absence is deliberate rather
// than the first thing this check would otherwise flag.
// WORKING (3.673.0) is the other: the GM's "I have it", sent before the
// request is carried out, so the asker waits for an owner's answer.
const NOT_A_REQUEST = new Set(["RESULT", "WORKING"]);

for (const name of Object.keys(RELAY_ACTIONS)) {
  if (NOT_A_REQUEST.has(name)) {
    ok(`A1 ${name} is a reply and correctly has no handler case`, !handled.has(name),
      "a case for RESULT would try to perform a reply as if it were a request");
    continue;
  }
  ok(`A2 ${name} has a handler case`, handled.has(name),
    "an action nobody implements answers 'unknown relay action' to a player "
      + "whose spell has already half-landed");
}

for (const name of handled) {
  ok(`A3 the case for ${name} names a declared action`, Object.hasOwn(RELAY_ACTIONS, name));
}

// A4. THE VALUES ARE DISTINCT AND NAMESPACED. `handleRelayMessage`
// routes on the `target.` prefix and the channel is shared with the
// party relay, so an action that dropped the prefix would be silently
// ignored by every client.
{
  const values = Object.values(RELAY_ACTIONS);
  ok("A4 every action value is unique", new Set(values).size === values.length);
  for (const [name, value] of Object.entries(RELAY_ACTIONS)) {
    ok(`A5 ${name} is namespaced under target.`, String(value).startsWith("target."),
      `"${value}" would be ignored by the router`);
  }
}

// A6. AND THE GAP IS NAMED. This is the anti-silence rule turned on the
// harness itself: seven of the nine actions have no behavioural check
// anywhere, and a green run of this file must not read as "the relay is
// tested". If a behavioural verify is written later, shrink this list.
const NO_BEHAVIOURAL_CHECK = Object.freeze([
  "DAMAGE", "CONDITIONS", "STATUS", "ITEM_HP", "HP_ZERO", "EFFECTS", "MEDICINE"
]);
ok("A6 the untested actions are still the ones this file says they are",
  NO_BEHAVIOURAL_CHECK.every((n) => Object.hasOwn(RELAY_ACTIONS, n)),
  "an action was renamed or removed without updating the declared gap");

/* ================================================================== *
 * B. The new action, run
 * ================================================================== */

function stubDeps(record) {
  return {
    fromUuid: async () => record.target,
    setTokenLight: async (t, key) => { record.set = { t, key }; return 1; },
    clearTokenLight: async (t) => { record.cleared = { t }; return 1; },
    reply: (m) => { record.reply = m; }
  };
}

const GM = { id: "gm1", isGM: true };

async function runTokenLight(payload) {
  const record = { target: { name: "Ally" } };
  const result = await handleRelayMessage(
    buildRelayRequest({
      action: RELAY_ACTIONS.TOKEN_LIGHT,
      uuid: "Actor.abc", userId: "player1", requestId: "r1", payload
    }),
    { user: GM, activeGM: GM, deps: stubDeps(record) }
  );
  return { result, record };
}

{
  const { result, record } = await runTokenLight({ source: "torch" });
  ok("B1 a token-light request is handled", result.handled === true, JSON.stringify(result));
  ok("B2 it reaches setTokenLight with the source key", record.set?.key === "torch",
    JSON.stringify(record.set));
  ok("B3 it resolves the target itself rather than trusting the payload",
    record.set?.t === record.target,
    "the GM's client must look the target up from the uuid, never take it from the asker");
  ok("B4 it replies", record.reply?.action === RELAY_ACTIONS.RESULT);
  ok("B5 the reply is addressed to the asker",
    record.reply?.userId === "player1" && record.reply?.requestId === "r1");
  ok("B6 the reply reports success", record.reply?.ok === true);
}
{
  const { record } = await runTokenLight({ clear: true });
  ok("B7 a clear request restores instead of setting",
    Boolean(record.cleared) && !record.set, JSON.stringify(record));
}
{
  // A SOURCE KEY, NOT A LIGHT CONFIG. The whole reason this payload is a
  // key is that a forged request must not be able to invent a radius.
  const { record } = await runTokenLight({ source: "torch", dim: 9999, bright: 9999 });
  ok("B8 extra payload fields are ignored",
    record.set?.key === "torch" && Object.keys(record.set).length === 2,
    JSON.stringify(record.set));
}

/* ------------------------------------------------------------------ *
 * B9-B11. THE HOSTILE PAYLOADS.
 *
 * B1-B8 all send WELL-FORMED requests, and mutate-relay-actions proved
 * that is not enough: two mutations that broke the trust boundary
 * survived every one of them. `payload.target ?? target` and
 * `payload.config ?? source` are both invisible to a payload that
 * carries neither field — the defect only exists for an asker who sends
 * something the honest client never would, which is precisely the asker
 * this boundary is for.
 *
 * So these three send the attack. A boundary tested only with polite
 * input is not tested.
 * ------------------------------------------------------------------ */

{
  const { record } = await runTokenLight({
    source: "torch",
    target: { name: "SOMEBODY ELSE ENTIRELY" }
  });
  ok("B9 a target named in the payload is ignored",
    record.set?.t === record.target,
    `acted on ${JSON.stringify(record.set?.t)} — the GM must resolve the target from the uuid alone`);
}
{
  const { record } = await runTokenLight({
    source: "torch",
    config: { dim: 9999, bright: 9999, color: "#ffffff" }
  });
  ok("B10 a light config in the payload is ignored",
    record.set?.key === "torch",
    `used ${JSON.stringify(record.set?.key)} — the key is looked up on the GM's client, never sent`);
}
{
  // AND THE KEY IS COERCED TO A STRING, so an object smuggled through
  // `source` cannot arrive as a config by another name.
  const { record } = await runTokenLight({ source: { dim: 9999 } });
  ok("B11 a non-string source arrives as a string",
    typeof record.set?.key === "string",
    `got ${typeof record.set?.key}`);
}

/* ================================================================== *
 * C. Refusals
 * ================================================================== */

{
  const record = { target: {} };
  const result = await handleRelayMessage(
    { action: "target.invented", uuid: "Actor.abc", userId: "p", requestId: "r", payload: {} },
    { user: GM, activeGM: GM, deps: stubDeps(record) }
  );
  ok("C1 an unknown target action is refused, not performed", result.outcome?.ok === false,
    JSON.stringify(result));
  ok("C2 and the asker is told why", /unknown relay action/.test(record.reply?.reason ?? ""),
    record.reply?.reason);
}
{
  const record = { target: {} };
  const result = await handleRelayMessage(
    { action: "party.something" },
    { user: GM, activeGM: GM, deps: stubDeps(record) }
  );
  ok("C3 another module's message is left alone", result.handled === false);
  ok("C4 and nothing is replied to it", record.reply === undefined,
    "the channel is shared; answering somebody else's message is noise at best");
}
{
  const record = { target: {} };
  const result = await handleRelayMessage(
    buildRelayRequest({ action: RELAY_ACTIONS.RESULT, uuid: "", userId: "p", requestId: "r" }),
    { user: GM, activeGM: GM, deps: stubDeps(record) }
  );
  ok("C5 a reply is not treated as a request", result.handled === false);
}

/* ================================================================== *
 * D. needsRelay — who has to ask
 * ================================================================== */

ok("D1 an owned document is written directly", needsRelay({ isOwner: true }) === false);
ok("D2 an unowned document needs the GM", needsRelay({ isOwner: false }) === true);
ok("D3 a missing document needs nothing", needsRelay(null) === false);

/* ================================================================== *
 * E. ENDING A CAST ON SOMEBODY ELSE'S SHEET (3.527.0)
 *
 * FOUND LIVE, 8 September 2026, as a player. A player cannot delete an
 * ActiveEffect on an actor they do not own, and `endActiveSpell` walks
 * the caster PLUS every target and calls `removeEffectsByCastId` on each.
 * That ended in a bare `deleteEmbeddedDocuments`, so a player who buffed
 * an ally and pressed End Spell removed it from themselves and left it on
 * the ally — for every spell with a target.
 *
 * THE ASYMMETRY IS WHAT HID IT: `createEffectsOn` has been relayed since
 * this file existed and its counterpart never was.
 * ================================================================== */

function endCastDeps(record) {
  return {
    fromUuid: async () => record.target,
    endCast: async (t, castId, dismissed) => {
      record.call = { t, castId, dismissed };
      return 3;
    },
    reply: (m) => { record.reply = m; }
  };
}

async function runEndCast(payload) {
  const record = { target: { name: "Ally" } };
  const result = await handleRelayMessage(
    buildRelayRequest({
      action: RELAY_ACTIONS.END_CAST,
      uuid: "Actor.abc", userId: "player1", requestId: "r9", payload
    }),
    { user: GM, activeGM: GM, deps: endCastDeps(record) }
  );
  return { result, record };
}

{
  const { result, record } = await runEndCast({ castId: "cast-7", dismissed: true });
  ok("E1 an end-cast request is handled", result.handled === true, JSON.stringify(result));
  ok("E2 IT REACHES endCast WITH THE CAST BEING ENDED", record.call?.castId === "cast-7",
    JSON.stringify(record.call));
  ok("E3 IT RESOLVES THE TARGET ITSELF", record.call?.t === record.target,
    "the GM's client looks the target up from the uuid, never takes it from the asker");
  ok("E4 WHETHER A PERSON CHOSE IT TRAVELS", record.call?.dismissed === true,
    "a Delayed Respite reads \"released early\" off this, and the sweeps pass false — "
    + "dropping it would make every expiry sound like somebody had done it on purpose");
  ok("E5 AND THE COUNT COMES BACK", result.outcome?.ok === true && result.outcome.result === 3,
    "the caller reports how many effects went; a relay that answered ok with nothing "
    + "would read as \"there was nothing there\"");
}

{
  const { record } = await runEndCast({ castId: "cast-8", dismissed: false });
  ok("E6 and a sweep's ending is not reported as a dismissal",
    record.call?.dismissed === false);
}

/* ── who has to ask, and who must not ask twice ─────────────────── */

ok("E7 A PLAYER ENDING A SPELL ON AN ALLY RELAYS",
  removalNeedsRelay({ isOwner: false }, false) === true,
  "the defect itself: this was a bare delete and threw a permission error");
ok("E8 THE GM DOING THE WORK AFTERWARDS DOES NOT ASK AGAIN",
  removalNeedsRelay({ isOwner: false }, true) === false,
  "`direct` is what stops the relay recursing — the same flag applyHealing uses");
ok("E9 AND AN OWNER NEVER ASKS AT ALL",
  removalNeedsRelay({ isOwner: true }, false) === false,
  "bouncing a message off yourself makes a GM's own dismissals depend on a socket");

/* ================================================================== */

process.stdout.write(`verify-relay-actions: ${checks} checks\n`);
if (failures.length) {
  process.stderr.write(`\n${failures.length} FAILED:\n`);
  for (const f of failures) process.stderr.write(`  ${f}\n`);
  process.exit(1);
}
process.stdout.write("  all pass\n");
