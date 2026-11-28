#!/usr/bin/env node
/**
 * mutate-fixes-3720-1 — can verify-fixes-3720-1 fail? NEW at 3.720.1.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, ...p);
const TS = M("module", "token-size.mjs");
const WF = M("module", "token-size-workflow.mjs");
const MV = M("module", "combat", "movement-workflow.mjs");
const CW = M("module", "companion-workflow.mjs");
const SJ = M("system.json");
const CHECK = M("tools", "verify-fixes-3720-1.mjs");

const MUTATIONS = [
  { file: TS, name: "anything truthy is the tick", from: "?.[KEEP_TOKEN_SIZE_FLAG] === true;", to: "?.[KEEP_TOKEN_SIZE_FLAG];", breaks: "A2/A3" },
  { file: TS, name: "every token is kept", from: "?.[KEEP_TOKEN_SIZE_FLAG] === true;", to: "?.[KEEP_TOKEN_SIZE_FLAG] !== false;", breaks: "A2" },
  { file: TS, name: "no token is kept", from: "?.[KEEP_TOKEN_SIZE_FLAG] === true;", to: "?.[KEEP_TOKEN_SIZE_FLAG] === null;", breaks: "A1" },
  { file: TS, name: "any scope's flag counts", from: "return tokenLike?.flags?.[FLAG_SCOPE]?.[KEEP_TOKEN_SIZE_FLAG] === true;", to: "return Object.values(tokenLike?.flags ?? {}).some((f) => f?.[KEEP_TOKEN_SIZE_FLAG] === true);", breaks: "A4" },
  { file: TS, name: "the flag is renamed", from: "export const KEEP_TOKEN_SIZE_FLAG = \"keepTokenSize\";", to: "export const KEEP_TOKEN_SIZE_FLAG = \"keepSize\";", breaks: "A1/A5/B1" },
  { file: TS, name: "the box writes the system's root flag", from: "const name = `flags.${FLAG_SCOPE}.${KEEP_TOKEN_SIZE_FLAG}`;", to: "const name = `flags.${KEEP_TOKEN_SIZE_FLAG}`;", breaks: "B1" },
  { file: TS, name: "the box is always ticked", from: "${checked === true ? \" checked\" : \"\"}", to: " checked", breaks: "B2" },
  { file: TS, name: "the box is ticked for anything truthy", from: "${checked === true ? \" checked\" : \"\"}", to: "${checked ? \" checked\" : \"\"}", breaks: "B2" },
  { file: TS, name: "the box has no label", from: "\"<label>Keep this size</label>\"", to: "\"<label></label>\"", breaks: "B3" },
  { file: TS, name: "the box cannot be found again", from: "'<div class=\"form-group trg-keep-token-size\">'", to: "'<div class=\"form-group\">'", breaks: "B4" },
  { file: WF, name: "the link resizes a kept token", from: "  if (keepsOwnSize(tokenDocument)) return false;\n", to: "", breaks: "C1" },
  { file: WF, name: "the link resizes a kept prototype", from: "if (!size || keepsOwnSize(actor.prototypeToken)) return false;", to: "if (!size) return false;", breaks: "C2" },
  { file: WF, name: "a kept prototype's token is resized at birth", from: "const size = keepsOwnSize(tokenDocument) ? null : linkedSize(tokenDocument?.actor);", to: "const size = linkedSize(tokenDocument?.actor);", breaks: "C3" },
  { file: WF, name: "the box is added on every render", from: "if (!row || root.querySelector(\".trg-keep-token-size\")) return;", to: "if (!row) return;", breaks: "C4" },
  { file: WF, name: "the box shows unticked", from: "keepSizeFieldHTML(keepsOwnSize(token))", to: "keepSizeFieldHTML(false)", breaks: "C4" },
  { file: WF, name: "the prototype sheet has no box", from: "  Hooks.on(\"renderPrototypeTokenConfig\", addKeepBox);\n", to: "", breaks: "C5" },
  { file: WF, name: "the token sheet has no box", from: "  Hooks.on(\"renderTokenConfig\", addKeepBox);\n", to: "", breaks: "C5" },
  { file: WF, name: "a vehicle's token has the box", from: "if (!token || linkedSize(app?.actor ?? token.actor) === null) return;", to: "if (!token) return;", breaks: "C6" },
  { file: WF, name: "unticking waits for the next change", from: "    setTimeout(() => { syncTokenSize(tokenDocument)", to: "    setTimeout(() => { Promise.resolve(tokenDocument)", breaks: "C7" },
  { file: WF, name: "every GM resizes on unticking", from: "    if (!isActingGM() || !foundry.utils.hasProperty(changed ?? {}, `flags.", to: "    if (!foundry.utils.hasProperty(changed ?? {}, `flags.", breaks: "C7" },
  { file: MV, name: "a form resizes a kept token", from: "  if (keepsOwnSize(tokenDocument)) return;\n", to: "", breaks: "D1" },
  { file: CW, name: "a companion's growth resizes a kept prototype", from: "if (proto && !keepsOwnSize(proto) && companion.isOwner && ", to: "if (proto && companion.isOwner && ", breaks: "D2" },
  { file: SJ, name: "the version is not raised", from: "\"version\": \"3.720.1\"", to: "\"version\": \"3.720.0\"", breaks: "Z" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([TS, WF, MV, CW, SJ, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3720-1: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-fixes-3720-1: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-fixes-3720-1: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
