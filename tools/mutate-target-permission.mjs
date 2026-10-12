#!/usr/bin/env node
/**
 * mutate-target-permission — can verify-target-permission fail?
 * NEW at 3.474.0.
 *
 * R1 IS THE RATCHET AND THE POINT. Putting ANY direct effect creation
 * back into the spell pipeline must fail, because the defect that broke
 * a live session was one more case written the old way among eight
 * written correctly.
 *
 * H5 IS THE ONE THAT WOULD HANG A TABLE. Without the `direct` flag the
 * GM's own re-entry asks the relay again, and the request bounces until
 * it times out — a heal that never lands and never says why.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const R = path.join(SYSTEM_ROOT, "module", "combat", "target-relay.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "target-relay-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-target-permission.mjs");

const MUTATIONS = [
  {
    // THE DEFECT THAT BROKE A LIVE SESSION.
    file: E,
    name: "R1 THE LIVE DEFECT: a spell effect is written directly again",
    from: "await createEffectsOn(target, [thornData]);",
    to: 'await target.createEmbeddedDocuments("ActiveEffect", [thornData]);',
    breaks: "R1 — a player casting on another player's character is refused by Foundry"
  },
  {
    file: E,
    name: "R2 the relayed creations are stripped back",
    from: "await createEffectsOn(target, [heldData]);",
    to: 'await target.createEmbeddedDocuments("ActiveEffect", [heldData]);',
    breaks: "R1/R2 — Guidance on another player's character was exactly this"
  },
  {
    file: E,
    name: "H4 healActor stops asking the relay",
    // RE-ANCHORED 2 Oct 2026 (3.611.0): Death's Defiance's option rides along.
    from: "    if (needsRelay(actor)) return relayHeal(actor, amount, { magical, noDyingFatigue, dyingHalf }, null);",
    to: "    if (false) return relayHeal(actor, amount, { magical, noDyingFatigue, dyingHalf }, null);",
    breaks: "H4 — Cure on another player's character would be refused again"
  },
  {
    // THE ONE THAT WOULD HANG A TABLE.
    file: E,
    name: "H5 THE INFINITE BOUNCE: the GM's re-entry asks the relay again",
    from: "  if (!direct) {",
    to: "  if (true) {",
    breaks: "H5 — the GM would relay to itself until the request timed out"
  },
  {
    file: W,
    name: "H6 the handler stops marking its re-entry direct",
    from: "      return healActor(target, amount, { ...options, direct: true });",
    to: "      return healActor(target, amount, { ...options });",
    breaks: "H6 — same bounce, from the other end"
  },
  {
    file: R,
    name: "H1 the relay loses its healing action",
    from: '  HEAL: "target.heal",',
    to: '  HEAL: "target.damage",',
    breaks: "H1 — healing would be indistinguishable from damage on the wire"
  },
  {
    file: R,
    name: "H3 healing forgets whether it was magical",
    from: "        magical: payload.magical !== false",
    to: "        magical: false",
    breaks: "H3 — the Dying step depends on it"
  },
  {
    file: R,
    name: "N1 everything is written directly, owned or not",
    from: "  return !document.isOwner;",
    to: "  return false;",
    breaks: "N1 — every relayed write would be attempted by a client that cannot make it"
  },
  {
    file: R,
    name: "N2 everything is relayed, even our own character",
    from: "  return !document.isOwner;",
    to: "  return true;",
    breaks: "N2 — a self-buff would need a GM connected to raise your own shield"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([R, W, E, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-target-permission: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-target-permission: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-target-permission: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
