#!/usr/bin/env node
/**
 * verify-fixes-3719-1 — an Effective Level of 0 can be stored.
 *
 * Asked for by Graham on 28 November 2026, after the Fiends & Fables balance
 * audit: 21 level-1 creatures have a Codex Effective Level of 0
 * (`floor(1 × 0.9)`), and the GM tab's box read every 0 as "blank, use the
 * level", so each was budgeted as EL 1. `gm.challengeZero` now marks a 0 that
 * is meant.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import * as R from "../module/rewards.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const el = (gm, level = 1) => R.effectiveLevelOf({ gm, identity: { level } });

ok("A1 the marker with the box at 0 is Effective Level 0", el({ challenge: 0, challengeZero: true }) === 0);
ok("A2 a 0 without the marker is still blank: the level", el({ challenge: 0 }, 3) === 3 && el({ challenge: 0, challengeZero: false }, 3) === 3);
ok("A3 a number above 0 wins over the marker", el({ challenge: 5, challengeZero: true }, 1) === 5);
ok("A4 an actor saved before the field existed reads as it always did", el({ challenge: 7 }, 3) === 7 && el({}, 4) === 4 && R.effectiveLevelOf({ identity: { level: 2 } }) === 2);
ok("A5 only a real true is the marker", el({ challenge: 0, challengeZero: "false" }, 3) === 3 && el({ challenge: 0, challengeZero: 1 }, 3) === 3 && el({ challenge: 0, challengeZero: null }, 3) === 3);
ok("A6 the marker holds on a creature of any level", el({ challenge: 0, challengeZero: true }, 6) === 0);
ok("A7 EL 0 against a level-1 party is one below: 300 XP", R.creatureXP(0, 1).xp === 300 && R.creatureXP(0, 1).difference === -1 && R.creatureXP(0, 1).beyond === null);
ok("A8 …and off the table against a level-10 party", R.creatureXP(0, 10).xp === 0 && R.creatureXP(0, 10).beyond === "below");
const four = R.encounterSummary({ creatures: [{ el: el({ challenge: 0, challengeZero: true }), count: 4 }], apl: 1, threat: "medium", members: 4 });
const fourAtOne = R.encounterSummary({ creatures: [{ el: el({ challenge: 0 }), count: 4 }], apl: 1, threat: "medium", members: 4 });
ok("A9 four EL 0 creatures cost a level-1 party 1,200 XP, where four budgeted at level 1 cost 1,600", four.total === 1200 && fourAtOne.total === 1600, `${four.total} / ${fourAtOne.total}`);

const template = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "template.json"), "utf8"));
const gmBlocks = [];
(function walk(node) { if (!node || typeof node !== "object") return; if (node.gm && typeof node.gm === "object" && "challenge" in node.gm) gmBlocks.push(node.gm); for (const v of Object.values(node)) walk(v); })(template);
ok("B1 the template declares the marker, off by default, beside the box", gmBlocks.length >= 1 && gmBlocks.every((gm) => gm.challengeZero === false && gm.challenge === 0), `${gmBlocks.length} gm blocks`);
const sheet = fs.readFileSync(path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"), "utf8");
ok("B2 the GM tab has the tick box", /<input type="checkbox" name="system\.gm\.challengeZero" \{\{checked system\.gm\.challengeZero\}\}>/.test(sheet));
ok("B3 …labelled, and the box still there", /<span>Effective Level 0<\/span>/.test(sheet) && /name="system\.gm\.challenge" value="\{\{system\.gm\.challenge\}\}"/.test(sheet));
const system = JSON.parse(fs.readFileSync(path.join(SYSTEM_ROOT, "system.json"), "utf8"));
const numeric = (v) => String(v).split(".").map(Number);
const atLeast = (v, min) => { const a = numeric(v), b = numeric(min); for (let i = 0; i < 3; i += 1) { if (a[i] !== b[i]) return a[i] > b[i]; } return true; };
ok("Z the version is 3.719.1 or later", atLeast(system.version, "3.719.1"), system.version);

if (failures.length) {
  process.stderr.write(`verify-fixes-3719-1: FAILED ${failures.length} of ${checks}\n  ${failures.join("\n  ")}\n`);
  process.exit(1);
}
process.stdout.write(`verify-fixes-3719-1: OK — ${checks} checks.\n`);
