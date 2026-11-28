#!/usr/bin/env node
/**
 * verify-fixes-3720-0 — a token is the size its creature is.
 *
 * Reported by Graham, 28 November 2026: no link between an actor's Size and
 * its token's size, at creation or when an effect (Size Alteration) changes
 * it. His table: Diminutive 0.4, Tiny 0.6, Small 0.8, Medium 1, Large 2,
 * Huge 3, Gargantuan 4, Colossal 5 — for width, height and depth.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import * as T from "../module/token-size.mjs";
import { SIZE_TABLE } from "../module/config.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const GRAHAM = { diminutive: 0.4, tiny: 0.6, small: 0.8, medium: 1, large: 2, huge: 3, gargantuan: 4, colossal: 5 };
for (const [size, side] of Object.entries(GRAHAM)) {
  ok(`A1 ${size} is drawn at ${side}`, T.tokenSideForSize(size) === side, String(T.tokenSideForSize(size)));
}
ok("A2 the table has every Size the system has, and they are the eight", Object.keys(SIZE_TABLE).every((size) => T.tokenSideForSize(size) > 0) && JSON.stringify(Object.keys(SIZE_TABLE).sort()) === JSON.stringify(Object.keys(GRAHAM).sort()));
ok("A3 a Size is read whatever its case or spacing", T.tokenSideForSize(" Large ") === 2 && T.tokenSideForSize("TINY") === 0.6);
ok("A4 a Size the table does not have is left alone, not made Medium", T.tokenSideForSize("") === null && T.tokenSideForSize(undefined) === null && T.tokenSideForSize("enormous") === null && T.tokenSideForSize("constructor") === null);

const patch = (cur, size) => JSON.stringify(T.tokenSizePatch(cur, size));
ok("B1 width, height and depth are all written", patch({ width: 1, height: 1, depth: 1 }, "large") === JSON.stringify({ width: 2, height: 2, depth: 2 }));
ok("B2 a token already its Size is not written", T.tokenSizePatch({ width: 0.8, height: 0.8, depth: 0.8 }, "small") === null && T.tokenSizePatch({ width: 1, height: 1, depth: 1 }, "medium") === null);
ok("B3 only what differs is written", patch({ width: 2, height: 2, depth: 1 }, "large") === JSON.stringify({ depth: 2 }) && patch({ width: 3, height: 2, depth: 2 }, "large") === JSON.stringify({ width: 2 }));
ok("B4 a missing dimension is written", patch({ width: 1, height: 1 }, "medium") === JSON.stringify({ depth: 1 }));
ok("B5 an unknown Size writes nothing", T.tokenSizePatch({ width: 3, height: 3, depth: 3 }, "") === null);
ok("B6 a Small creature on a one-square token is shrunk", patch({ width: 1, height: 1, depth: 1 }, "small") === JSON.stringify({ width: 0.8, height: 0.8, depth: 0.8 }));

ok("C1 creatures follow their Size", ["character", "npc", "companion", "familiar"].every((type) => T.tokenFollowsSize({ type })));
ok("C2 a party, a vehicle and a peril do not", !T.tokenFollowsSize({ type: "party" }) && !T.tokenFollowsSize({ type: "npc" }, { vehicle: true }) && !T.tokenFollowsSize({ type: "npc" }, { peril: true }) && !T.tokenFollowsSize(null));

ok("D1 a token a square or more across stands where its edge rounds to", T.tokenOriginSquare(300, 1, 100) === 3 && T.tokenOriginSquare(300, 2, 100) === 3 && T.tokenOriginSquare(298, 1, 100) === 3);
ok("D2 a Small token at its square's corner stands in that square", T.tokenOriginSquare(300, 0.8, 100) === 3);
ok("D3 a Tiny token half-way across a square is still in it", T.tokenOriginSquare(350, 0.4, 100) === 3 && T.tokenOriginSquare(325, 0.6, 100) === 3 && T.tokenOriginSquare(350, 0.6, 100) === 3, `${T.tokenOriginSquare(350, 0.4, 100)}`);
ok("D4 …and one in the last quarter is in the square its centre is in", T.tokenOriginSquare(375, 0.6, 100) === 4 && T.tokenOriginSquare(375, 0.4, 100) === 3);
ok("D5 squares left of and above the origin", T.tokenOriginSquare(-100, 1, 100) === -1 && T.tokenOriginSquare(-75, 0.4, 100) === -1);

const grown = (t, side) => JSON.stringify(T.regrownPosition(t, side, 100));
ok("E1 a Tiny token at a quarter square takes its square when it grows", grown({ x: 350, y: 225, width: 0.6, height: 0.6 }, 1) === JSON.stringify({ x: 300, y: 200 }));
ok("E2 …to Small as well, which sits at the corner", grown({ x: 350, y: 225, width: 0.6, height: 0.6 }, 0.8) === JSON.stringify({ x: 300, y: 200 }));
ok("E3 a token already on the grid lines does not move", T.regrownPosition({ x: 300, y: 200, width: 0.8, height: 0.8 }, 1, 100) === null);
ok("E4 a token a square or more across does not move", T.regrownPosition({ x: 350, y: 225, width: 1, height: 1 }, 2, 100) === null);
ok("E5 a token still under Small keeps its quarter square", T.regrownPosition({ x: 350, y: 225, width: 0.4, height: 0.4 }, 0.6, 100) === null);
ok("E6 no grid, no move", T.regrownPosition({ x: 350, y: 225, width: 0.6, height: 0.6 }, 1, 0) === null);

const wf = read("module", "token-size-workflow.mjs");
ok("F1 a new token is given its Size before it exists", /Hooks\.on\("preCreateToken", \(tokenDocument\) => \{[\s\S]{0,260}tokenSizePatch\(tokenDocument\._source \?\? tokenDocument, size\)[\s\S]{0,80}tokenDocument\.updateSource\(patch\)/.test(wf));
ok("F2 an actor change queues a look", /Hooks\.on\("createActor", \(actor\) => queueTokenSizeSync\(actor\)\);\n  Hooks\.on\("updateActor", \(actor\) => queueTokenSizeSync\(actor\)\);/.test(wf));
ok("F3 …and so does an effect or an item coming, changing or going", /for \(const kind of \["ActiveEffect", "Item"\]\) \{\n    for \(const verb of \["create", "update", "delete"\]\) \{\n      Hooks\.on\(`\$\{verb\}\$\{kind\}`, \(document\) => queueTokenSizeSync\(actorOf\(document\)\)\);/.test(wf));
ok("F4 the look is deferred and coalesced, one an actor", /clearTimeout\(queued\.get\(actor\.uuid\)\);\n  queued\.set\(actor\.uuid, setTimeout\(\(\) => \{\n    queued\.delete\(actor\.uuid\);\n    void syncActorTokenSize\(actor\);\n  \}, SETTLE_MS\)\);/.test(wf));
ok("F5 one client writes: the acting GM", /async function syncActorTokenSize\(actor\) \{\n  if \(!actor \|\| !isActingGM\(\)\) return;/.test(wf) && /if \(!actor\?\.uuid \|\| actor\.documentName !== "Actor" \|\| !isActingGM\(\)\) return;/.test(wf));
ok("F6 the Size read is the prepared one, effects applied", /const size = actor\.system\?\.identity\?\.size;/.test(wf) && !/_source\?\.system\?\.identity\?\.size/.test(wf));
ok("F7 the resize is not a move, and carries depth", /await asTokenResize\(tokenDocument, \(\) => tokenDocument\.update\(\{ \.\.\.patch, \.\.\.\(place \?\? \{\}\) \}, \{\n    movement: \{ \[tokenDocument\.id\]: \{ method: "api", waypoints: \[\{ \.\.\.at, width: side, height: side, depth: side, action: "displace" \}\] \} \}/.test(wf));
ok("F8 every token of a linked actor on every scene, or the one token of an unlinked one", /const tokens = actor\.isToken \? \[actor\.token\] : \(actor\.getDependentTokens\?\.\(\) \?\? \[\]\);/.test(wf));
ok("F8b …and only a token that is on its scene", /for \(const doc of tokens\) if \(doc\?\.id && doc\.parent\?\.tokens\?\.get\(doc\.id\) === doc\) await syncTokenSize\(doc\);/.test(wf));
ok("F9 the prototype follows, for a world actor only", /if \(!actor \|\| actor\.isToken \|\| actor\.pack \|\| !actor\.update\) return false;/.test(wf) && /\[`prototypeToken\.\$\{k\}`, v\]/.test(wf));
ok("F10 the stored size is compared, not one read mid-animation", /const source = doc\?\._source \?\? doc \?\? \{\};/.test(wf));
ok("F11 a scene's tokens are looked at as it opens, and the prototypes at start", /Hooks\.on\("canvasReady", async \(\) => \{\n    if \(!isActingGM\(\)\) return;/.test(wf) && /Hooks\.once\("ready", async \(\) => \{\n    if \(!isActingGM\(\)\) return;\n    for \(const actor of Array\.from\(globalThis\.game\?\.actors \?\? \[\]\)\)/.test(wf));
ok("F12 vehicles and perils are asked about", /tokenFollowsSize\(actor, \{ vehicle: isVehicleActor\(actor\), peril: isPeril\(actor\) \}\)/.test(wf));

const mv = read("module", "combat", "movement-workflow.mjs");
ok("G1 the resize mark is set for the length of the write", /export async function asTokenResize\(tokenDocument, write\) \{\n  const id = tokenDocument\?\.id;\n  if \(!id \|\| typeof write !== "function"\) return undefined;\n  RESIZING\.add\(id\);\n  try \{\n    return await write\(\);\n  \} finally \{\n    RESIZING\.delete\(id\);/.test(mv));
const main = read("scripts", "trg-prime.mjs");
ok("G2 the hooks are registered", /import \{ registerTokenSizeHooks \} from "\.\.\/module\/token-size-workflow\.mjs";/.test(main) && /\n  registerTokenSizeHooks\(\);\n/.test(main));
const geo = read("module", "combat", "geometry.mjs");
ok("G3 distance reads a small token's square from its centre", (geo.match(/tokenOriginSquare\(token\.document\.x, token\.document\.width, grid\)/g) ?? []).length === 2 && (geo.match(/tokenOriginSquare\(token\.document\.y, token\.document\.height, grid\)/g) ?? []).length === 2 && !/Math\.round\(token\.document\.[xy] \/ grid\)/.test(geo));
const cw = read("module", "companion-workflow.mjs");
ok("G4 a companion's growth uses the same table", /const side = tokenSideForSize\(companion\?\.system\?\.identity\?\.size\);\n  if \(!\(side > 0\)\) return;/.test(cw) && !/Math\.max\(1, Math\.round\(space \/ 5\)\)/.test(cw));

const system = JSON.parse(read("system.json"));
const numeric = (v) => String(v).split(".").map(Number);
const atLeast = (v, min) => { const a = numeric(v), b = numeric(min); for (let i = 0; i < 3; i += 1) { if (a[i] !== b[i]) return a[i] > b[i]; } return true; };
ok("Z the version is 3.720.0 or later", atLeast(system.version, "3.720.0"), system.version);

if (failures.length) {
  process.stderr.write(`verify-fixes-3720-0: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3720-0: OK — ${checks} checks.\n`);
