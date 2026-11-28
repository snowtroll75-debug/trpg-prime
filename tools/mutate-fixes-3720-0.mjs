#!/usr/bin/env node
/**
 * mutate-fixes-3720-0 — can verify-fixes-3720-0 fail? NEW at 3.720.0.
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
const GE = M("module", "combat", "geometry.mjs");
const CW = M("module", "companion-workflow.mjs");
const MAIN = M("scripts", "trg-prime.mjs");
const SJ = M("system.json");
const CHECK = M("tools", "verify-fixes-3720-0.mjs");

const MUTATIONS = [
  { file: TS, name: "Small is drawn a full square", from: "  small: 0.8,", to: "  small: 1,", breaks: "A1/B6" },
  { file: TS, name: "Tiny and Diminutive are swapped", from: "  diminutive: 0.4,\n  tiny: 0.6,", to: "  diminutive: 0.6,\n  tiny: 0.4,", breaks: "A1" },
  { file: TS, name: "Large is one square", from: "  large: 2,", to: "  large: 1,", breaks: "A1/B1" },
  { file: TS, name: "Colossal is drawn as Gargantuan", from: "  colossal: 5\n", to: "  colossal: 4\n", breaks: "A1" },
  { file: TS, name: "an unknown Size is made Medium", from: "return Object.hasOwn(TOKEN_SIZE_SIDE, key) ? TOKEN_SIZE_SIDE[key] : null;", to: "return Object.hasOwn(TOKEN_SIZE_SIDE, key) ? TOKEN_SIZE_SIDE[key] : 1;", breaks: "A4/B5" },
  { file: TS, name: "the Size is read case-sensitively", from: "const key = String(size ?? \"\").trim().toLowerCase();\n  return Object.hasOwn", to: "const key = String(size ?? \"\");\n  return Object.hasOwn", breaks: "A3" },
  { file: TS, name: "an inherited key is a Size", from: "return Object.hasOwn(TOKEN_SIZE_SIDE, key) ? TOKEN_SIZE_SIDE[key] : null;", to: "return key in TOKEN_SIZE_SIDE ? TOKEN_SIZE_SIDE[key] : null;", breaks: "A4" },
  { file: TS, name: "depth is not written", from: "for (const key of [\"width\", \"height\", \"depth\"]) {", to: "for (const key of [\"width\", \"height\"]) {", breaks: "B1/B3/B4" },
  { file: TS, name: "every dimension is always written", from: "    if (!same(current?.[key], side)) patch[key] = side;", to: "    patch[key] = side;", breaks: "B2/B3" },
  { file: TS, name: "a party follows a Size", from: "return [\"character\", \"npc\", \"companion\", \"familiar\"].includes(String(actor.type ?? \"\"));", to: "return true;", breaks: "C2" },
  { file: TS, name: "a vehicle follows its Size", from: "if (!actor || vehicle || peril) return false;", to: "if (!actor || peril) return false;", breaks: "C2" },
  { file: TS, name: "a peril follows its Size", from: "if (!actor || vehicle || peril) return false;", to: "if (!actor || vehicle) return false;", breaks: "C2" },
  { file: TS, name: "familiars are left out", from: "[\"character\", \"npc\", \"companion\", \"familiar\"].includes", to: "[\"character\", \"npc\", \"companion\"].includes", breaks: "C1" },
  { file: TS, name: "a small token's square is its rounded edge", from: "  if (s >= 1) return Math.round(at / g);\n", to: "  if (s > 0) return Math.round(at / g);\n", breaks: "D3" },
  { file: TS, name: "a small token's square is its floored edge", from: "return Math.floor((at + (s * g) / 2) / g + 1e-9);", to: "return Math.floor(at / g + 1e-9);", breaks: "D4" },
  { file: TS, name: "a full-square token is floored", from: "  if (s >= 1) return Math.round(at / g);", to: "  if (s >= 1) return Math.floor(at / g);", breaks: "D1" },
  { file: TS, name: "a grown token stays at its quarter square", from: "  return same(x, token.x) && same(y, token.y) ? null : { x, y };", to: "  return null;", breaks: "E1/E2" },
  { file: TS, name: "a token becoming Tiny is moved", from: "if (!g || !(Number(side) >= 0.8)) return null;", to: "if (!g) return null;", breaks: "E5" },
  { file: TS, name: "a full-square token is re-placed", from: "  if (w >= 1 && h >= 1) return null;\n", to: "", breaks: "E4" },
  { file: WF, name: "a new token keeps its prototype's size", from: "      if (patch) tokenDocument.updateSource(patch);", to: "", breaks: "F1" },
  { file: WF, name: "an actor update is not looked at", from: "  Hooks.on(\"updateActor\", (actor) => queueTokenSizeSync(actor));\n", to: "", breaks: "F2" },
  { file: WF, name: "effects do not queue a look", from: "for (const kind of [\"ActiveEffect\", \"Item\"]) {", to: "for (const kind of [\"Item\"]) {", breaks: "F3" },
  { file: WF, name: "an effect ending does not queue a look", from: "for (const verb of [\"create\", \"update\", \"delete\"]) {", to: "for (const verb of [\"create\", \"update\"]) {", breaks: "F3" },
  { file: WF, name: "the look is not coalesced", from: "  clearTimeout(queued.get(actor.uuid));\n", to: "", breaks: "F4" },
  { file: WF, name: "every GM writes", from: "async function syncActorTokenSize(actor) {\n  if (!actor || !isActingGM()) return;", to: "async function syncActorTokenSize(actor) {\n  if (!actor) return;", breaks: "F5" },
  { file: WF, name: "the stored Size is read, before effects", from: "  const size = actor.system?.identity?.size;", to: "  const size = actor._source?.system?.identity?.size;", breaks: "F6" },
  { file: WF, name: "the resize is a walk", from: "width: side, height: side, depth: side, action: \"displace\" }", to: "width: side, height: side, depth: side }", breaks: "F7" },
  { file: WF, name: "the resize is not marked", from: "  await asTokenResize(tokenDocument, () => tokenDocument.update(", to: "  await ((_d, f) => f())(tokenDocument, () => tokenDocument.update(", breaks: "F7" },
  { file: WF, name: "only the tokens on screen", from: "(actor.getDependentTokens?.() ?? [])", to: "(actor.getActiveTokens?.(false, true) ?? [])", breaks: "F8" },
  { file: WF, name: "a token never created is written", from: "if (doc?.id && doc.parent?.tokens?.get(doc.id) === doc) await syncTokenSize(doc);", to: "if (doc) await syncTokenSize(doc);", breaks: "F8b" },
  { file: WF, name: "a compendium actor is written", from: "if (!actor || actor.isToken || actor.pack || !actor.update) return false;", to: "if (!actor || actor.isToken || !actor.update) return false;", breaks: "F9" },
  { file: WF, name: "the animating size is compared", from: "  const source = doc?._source ?? doc ?? {};", to: "  const source = doc ?? {};", breaks: "F10" },
  { file: WF, name: "a scene is not looked at as it opens", from: "  Hooks.on(\"canvasReady\", async () => {\n    if (!isActingGM()) return;", to: "  Hooks.on(\"canvasReadyNever\", async () => {\n    if (!isActingGM()) return;", breaks: "F11" },
  { file: WF, name: "vehicles are not asked about", from: "{ vehicle: isVehicleActor(actor), peril: isPeril(actor) }", to: "{ peril: isPeril(actor) }", breaks: "F12" },
  { file: MV, name: "the mark is never set", from: "  RESIZING.add(id);\n", to: "", breaks: "G1" },
  { file: MAIN, name: "the hooks are not registered", from: "\n  registerTokenSizeHooks();\n", to: "\n", breaks: "G2" },
  { file: GE, name: "distance rounds a small token's edge", from: "    const col = tokenOriginSquare(token.document.x, token.document.width, grid);", to: "    const col = Math.round(token.document.x / grid);", breaks: "G3" },
  { file: CW, name: "a Small companion is given a full square", from: "  const side = tokenSideForSize(companion?.system?.identity?.size);", to: "  const side = Math.max(1, tokenSideForSize(companion?.system?.identity?.size));", breaks: "G4" },
  { file: SJ, name: "the version is not raised", from: "\"version\": \"3.720.0\"", to: "\"version\": \"3.719.1\"", breaks: "Z" }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([TS, WF, MV, GE, CW, MAIN, SJ, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-fixes-3720-0: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-fixes-3720-0: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-fixes-3720-0: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
