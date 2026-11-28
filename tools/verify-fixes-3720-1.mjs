#!/usr/bin/env node
/**
 * verify-fixes-3720-1 — a token can be kept at its own size.
 *
 * Asked for by Graham on 28 November 2026, after 3.720.0 linked a token's
 * size to its creature's Size: a tick box, on the token and on the
 * prototype token, that holds a token at the size it was given.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import * as T from "../module/token-size.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const flagged = (value) => ({ flags: { "trg-prime": { keepTokenSize: value } } });

ok("A1 a ticked token is kept", T.keepsOwnSize(flagged(true)) === true);
ok("A2 an unticked one, and one never asked, are not", T.keepsOwnSize(flagged(false)) === false && T.keepsOwnSize({ flags: {} }) === false && T.keepsOwnSize({}) === false && T.keepsOwnSize(null) === false);
ok("A3 only a real true is the tick", T.keepsOwnSize(flagged("true")) === false && T.keepsOwnSize(flagged(1)) === false && T.keepsOwnSize(flagged("false")) === false);
ok("A4 another module's flag of the same name is not ours", T.keepsOwnSize({ flags: { other: { keepTokenSize: true } } }) === false);
ok("A5 the flag's name", T.KEEP_TOKEN_SIZE_FLAG === "keepTokenSize");

const on = T.keepSizeFieldHTML(true);
const off = T.keepSizeFieldHTML(false);
ok("B1 the box writes the token's own flag", /<input type="checkbox" name="flags\.trg-prime\.keepTokenSize"/.test(on) && /<input type="checkbox" name="flags\.trg-prime\.keepTokenSize">/.test(off));
ok("B2 it is ticked when the token is kept, and only then", /keepTokenSize" checked>/.test(on) && !/checked/.test(off) && !/checked/.test(T.keepSizeFieldHTML("true")) && !/checked/.test(T.keepSizeFieldHTML(undefined)));
ok("B3 it is labelled and explained", /<label>Keep this size<\/label>/.test(on) && /<p class="hint">Ticked, this token is not resized when its creature's Size changes\. Unticked, it follows the creature's Size\.<\/p>/.test(on));
ok("B4 it is a form group the sheet can lay out, and can be found again", /^<div class="form-group trg-keep-token-size">/.test(on) && /<div class="form-fields">/.test(on) && /<\/div>$/.test(on));

const wf = read("module", "token-size-workflow.mjs");
ok("C1 the Size link leaves a kept token alone", /if \(!size \|\| !tokenDocument\?\.update\) return false;\n  \/\/[^\n]*\n  if \(keepsOwnSize\(tokenDocument\)\) return false;/.test(wf));
ok("C2 …and a kept prototype", /if \(!size \|\| keepsOwnSize\(actor\.prototypeToken\)\) return false;/.test(wf));
ok("C3 a token dragged from a kept prototype is not resized at birth", /const size = keepsOwnSize\(tokenDocument\) \? null : linkedSize\(tokenDocument\?\.actor\);/.test(wf));
ok("C4 the box is put under the Size row, once", /const row = root\?\.querySelector\?\.\('\[name="width"\]'\)\?\.closest\("\.form-group"\);\n      if \(!row \|\| root\.querySelector\("\.trg-keep-token-size"\)\) return;\n      row\.insertAdjacentHTML\("afterend", keepSizeFieldHTML\(keepsOwnSize\(token\)\)\);/.test(wf));
ok("C5 …on the token's sheet and the prototype's", /Hooks\.on\("renderTokenConfig", addKeepBox\);\n  Hooks\.on\("renderPrototypeTokenConfig", addKeepBox\);/.test(wf));
ok("C6 …and only for an actor whose tokens follow its Size", /if \(!token \|\| linkedSize\(app\?\.actor \?\? token\.actor\) === null\) return;/.test(wf));
ok("C7 unticking resizes the token at once, by the acting GM", /Hooks\.on\("updateToken", \(tokenDocument, changed\) => \{\n    if \(!isActingGM\(\) \|\| !foundry\.utils\.hasProperty\(changed \?\? \{\}, `flags\.\$\{SYSTEM_ID\}\.\$\{KEEP_TOKEN_SIZE_FLAG\}`\)\) return;\n    setTimeout\(\(\) => \{ syncTokenSize\(tokenDocument\)/.test(wf));

const mv = read("module", "combat", "movement-workflow.mjs");
ok("D1 a form and a companion's growth leave a kept token alone", /export async function resizeTokenInPlace\(tokenDocument, side\) \{\n  if \(!tokenDocument\?\.update \|\| !\(Number\(side\) > 0\)\) return;\n(  \/\/[^\n]*\n)+  if \(keepsOwnSize\(tokenDocument\)\) return;\n  RESIZING\.add\(tokenDocument\.id\);/.test(mv));
const cw = read("module", "companion-workflow.mjs");
ok("D2 a companion's growth leaves a kept prototype alone", /if \(proto && !keepsOwnSize\(proto\) && companion\.isOwner && /.test(cw));

const system = JSON.parse(read("system.json"));
const numeric = (v) => String(v).split(".").map(Number);
const atLeast = (v, min) => { const a = numeric(v), b = numeric(min); for (let i = 0; i < 3; i += 1) { if (a[i] !== b[i]) return a[i] > b[i]; } return true; };
ok("Z the version is 3.720.1 or later", atLeast(system.version, "3.720.1"), system.version);

if (failures.length) {
  process.stderr.write(`verify-fixes-3720-1: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3720-1: OK — ${checks} checks.\n`);
