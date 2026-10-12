#!/usr/bin/env node
/**
 * mutate-relay-actions — can verify-relay-actions fail?
 *
 * NEW at 3.396.1. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE DRIFT THIS FILE EXISTS FOR: an action declared in the
 * registry with no case in the switch. It errors nowhere, ships
 * cleanly, and surfaces as a player being told "unknown relay action"
 * after their spell has already applied half of itself.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SRC = path.join(SYSTEM_ROOT, "module", "combat", "target-relay.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-relay-actions.mjs");

const MUTATIONS = [
  /* ── E: ending a cast on somebody else's sheet (3.527.0) ───────── */
  {
    file: SRC,
    name: "E1 THE END-CAST HANDLER LOSES ITS ACTION",
    from: '  END_CAST: "target.endCast",',
    to: '  END_CAST: "target.spellRune",',
    breaks: "A (registry/switch agreement) and E1 — two actions sharing a name means one handler answers for both"
  },
  {
    file: SRC,
    name: "E2 THE CAST ID IS DROPPED ON THE WAY THROUGH",
    from: '      const removed = await deps.endCast(target, String(payload.castId ?? ""),',
    to: '      const removed = await deps.endCast(target, "",',
    breaks: "E2 — the GM would be asked to end a cast with no id, which matches no effect and removes nothing"
  },
  {
    file: SRC,
    name: "E4 WHETHER A PERSON CHOSE IT IS LOST",
    from: "        Boolean(payload.dismissed));",
    to: "        true);",
    breaks: "E6 — every expiry would announce itself as a dismissal, and a Delayed Respite would say \"released early\" when its clock simply ran out"
  },
  {
    file: SRC,
    name: "E5 THE COUNT IS NOT RETURNED",
    from: "      return { ok: true, result: removed };",
    to: "      return { ok: true };",
    breaks: "E5 — the caller would read \"nothing was there\" for a spell that ended three effects"
  },
  {
    file: SRC,
    name: "E7 THE RELAY IS NEVER NEEDED — the defect itself put back",
    from: "  return !direct && needsRelay(target);",
    to: "  return false;",
    breaks: "E7 — a player ending a spell on an ally goes back to a bare delete and a permission error, leaving the buff on the ally for good"
  },
  {
    file: SRC,
    name: "E8 THE GM ASKS ITSELF AGAIN — the relay recurses",
    from: "  return !direct && needsRelay(target);",
    to: "  return needsRelay(target);",
    breaks: "E8 — the GM's client would relay to itself on every removal it performs for a player"
  },

  {
    name: "THE DRIFT: a declared action loses its handler case",
    file: SRC,
    from: "    case RELAY_ACTIONS.TOKEN_LIGHT: {",
    to: "    case \"target.neverSent\": {",
    breaks: "A2 — the action is declared, routed, and falls through to 'unknown'"
  },
  {
    name: "an action drops its namespace prefix",
    file: SRC,
    from: '  TOKEN_LIGHT: "target.tokenLight",',
    to: '  TOKEN_LIGHT: "tokenLight",',
    breaks: "A5 — handleRelayMessage routes on `target.` and would ignore it entirely"
  },
  {
    name: "two actions collide on one value",
    file: SRC,
    from: '  TOKEN_LIGHT: "target.tokenLight",',
    to: '  TOKEN_LIGHT: "target.medicine",',
    breaks: "A4 — one operation silently performs another"
  },
  {
    name: "the GM takes the target from the asker instead of the uuid",
    file: SRC,
    from: "      const result = cleared\n        ? await deps.clearTokenLight(target)\n        : await deps.setTokenLight(target, key);",
    to: "      const t2 = payload.target ?? target;\n      const result = cleared\n        ? await deps.clearTokenLight(t2)\n        : await deps.setTokenLight(t2, key);",
    breaks: "B3 — a forged payload could reach a token the asker never targeted"
  },
  {
    name: "the light config is taken from the payload rather than the key",
    file: SRC,
    from: "      const key = String(payload.source ?? \"\");",
    to: "      const key = payload.config ?? String(payload.source ?? \"\");",
    breaks: "B2/B8 — a forged request could invent a radius the book never prints"
  },
  {
    name: "set and clear are confused",
    file: SRC,
    from: "      const cleared = payload.clear === true;",
    to: "      const cleared = payload.clear !== true;",
    breaks: "B2/B7 — lighting a token puts it out and vice versa"
  },
  {
    name: "an unknown action is performed instead of refused",
    file: SRC,
    from: "      return { ok: false, reason: `unknown relay action: ${action}` };",
    to: "      return { ok: true, result: null };",
    breaks: "C1/C2 — a typo'd action reports success and does nothing"
  },
  {
    name: "a reply is treated as a request",
    file: SRC,
    from: '  if (action === RELAY_ACTIONS.RESULT) return { handled: false, reason: "a reply, not a request" };',
    to: "  if (false) return { handled: false };",
    breaks: "C5 — every answer bounces back around the socket"
  },
  {
    name: "another module's messages are answered",
    file: SRC,
    from: '  if (!action.startsWith("target.")) return { handled: false, reason: "not a target relay message" };',
    to: "  if (false) return { handled: false };",
    breaks: "C3/C4 — the shared channel fills with replies to the party relay"
  },
  {
    name: "an owned document is relayed anyway",
    file: SRC,
    from: "  return !document.isOwner;",
    to: "  return true;",
    breaks: "D1 — every write waits on the GM, including the ones a client may do itself"
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

const guard = guardFiles([SRC, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-relay-actions: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-relay-actions: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-relay-actions: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
