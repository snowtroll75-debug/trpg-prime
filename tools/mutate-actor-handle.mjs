#!/usr/bin/env node
/**
 * mutate-actor-handle — can verify-actor-handle fail?
 * NEW at 3.469.0.
 *
 * O3/O6 ARE THE ONES THAT MATTER. The ORDER is the entire fix: token,
 * then uuid, then the bare id. A resolver that asked the id first would
 * be the original defect wearing three fields, and it would satisfy every
 * other check in that file — the handle would still be recorded, still be
 * complete, still be precise. Only the order says which document is
 * touched.
 *
 * S3 IS THE RATCHET. Undeclaring a converted file must fail, or the list
 * stops being a list.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const H = path.join(SYSTEM_ROOT, "module", "actor-handle.mjs");
const R = path.join(SYSTEM_ROOT, "module", "combat", "reaction-feats-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "dice", "check-card-interactions.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-actor-handle.mjs");

const MUTATIONS = [
  {
    // THE DEFECT WITH THREE FIELDS.
    file: H,
    name: "O6 THE ORDER INVERTED: the bare id is asked first",
    from: "    const tokenId = text(handle?.tokenId);",
    to: "    const actorIdFirst = text(handle?.actorId);\n    if (actorIdFirst) return game?.actors?.get?.(actorIdFirst) ?? null;\n    const tokenId = text(handle?.tokenId);",
    breaks: "O6 — every handle would resolve to the sidebar sheet, exactly as before"
  },
  {
    file: H,
    name: "O5 the declared order no longer matches the resolver",
    from: 'export const HANDLE_KEYS = Object.freeze(["tokenId", "actorUuid", "actorId"]);',
    to: 'export const HANDLE_KEYS = Object.freeze(["actorId", "tokenId", "actorUuid"]);',
    breaks: "O1/O3/O5 — the documented preference would contradict the code"
  },
  {
    file: H,
    name: "H5 an id-only handle claims to be precise",
    from: "  return Boolean(text(handle?.tokenId) || text(handle?.actorUuid));",
    to: "  return Boolean(text(handle?.tokenId) || text(handle?.actorUuid) || text(handle?.actorId));",
    breaks: "H5 — a handle naming only a species would be trusted as naming a creature"
  },
  {
    file: H,
    name: "H1 the handle stops recording the token",
    from: "    tokenId: text(token?.id) || null,",
    to: "    tokenId: null,",
    breaks: "H1/O1 — the creature would be named by species again"
  },
  {
    file: H,
    name: "H1b the handle stops recording the uuid",
    from: "    actorUuid: text(actor?.uuid) || null",
    to: "    actorUuid: null",
    breaks: "H1/H2 — nothing would be exact across scenes"
  },
  {
    file: R,
    name: "C3 THE DISCARDED TOKEN: reaction rows drop the candidate's token again",
    from: "  for (const { actor, token } of candidates) {",
    to: "  for (const { actor } of candidates) {\n    const token = null;",
    breaks: "C3 — an unlinked NPC's reaction pool would never empty"
  },
  {
    file: R,
    name: "C4 a reaction resolves by bare id again",
    from: "  const reactor = (await resolveActorHandle(row?.handle))\n    ?? game.actors.get(reactorActorId);",
    to: "  const reactor = game.actors.get(reactorActorId);",
    breaks: "C4 — the reaction would be spent on the sidebar sheet"
  },
  {
    file: C,
    name: "C2 the heal resolves by bare id again",
    from: "  const target = (await resolveActorHandle(raw.handle))\n    ?? (raw.targetActorId ? game.actors.get(raw.targetActorId) : null);",
    to: "  const target = raw.targetActorId ? game.actors.get(raw.targetActorId) : null;",
    breaks: "C2 — an unlinked patient keeps its wound and the sheet gains the HP"
  },
  {
    file: C,
    name: "C6 the critical re-roll resolves its target by bare id again",
    from: "        const targetActor = (await resolveActorHandle(raw.targetHandle))\n          ?? (raw.targetActorId ? game.actors?.get(raw.targetActorId) : null);",
    to: "        const targetActor = raw.targetActorId ? game.actors?.get(raw.targetActorId) : null;",
    breaks: "C6 — dying and bleed would land on the sidebar sheet"
  },
  {
    file: A,
    name: "C1 the heal card stops recording a handle",
    // RE-ANCHORED AT 3.559.0: the heal card's flag grew a line — Treat
    // Wounds' bought additional targets — so the one-line literal this
    // pointed at is now a block. The rule it tests is unchanged.
    from: "            handle: healHandle,\n            amount: healAmount,",
    to: "            amount: healAmount,",
    breaks: "C1 — there would be nothing for the resolver to prefer"
  },
  {
    // THE RATCHET ITSELF.
    file: V,
    name: "S3 a converted file is quietly dropped from the cleared list",
    from: '  "module/combat/reaction-feats-workflow.mjs",\n  "module/dice/check-card-interactions.mjs",',
    to: '  "module/dice/check-card-interactions.mjs",',
    breaks: "S3 — an undeclared site must be a failure, or the list is decoration"
  },
  {
    // A BACKLOG ENTRY MUST NAME SOMETHING THAT EXISTS, or it is a line
    // nobody can act on — the half verify-printed-damage's B2 learned.
    file: V,
    name: "S2 a backlog entry names a file that is not in the tree",
    from: '  ["module/skills.mjs",',
    to: '  ["module/skills-renamed-away.mjs",',
    breaks: "S2 — the entry would outlive the file and nobody could work it"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([H, R, C, A, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-actor-handle: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-actor-handle: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-actor-handle: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
