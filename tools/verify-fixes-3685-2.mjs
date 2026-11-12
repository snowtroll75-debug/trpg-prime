#!/usr/bin/env node
/**
 * verify-fixes-3685-2 — TRG Prime 3.685.2, a patch on 3.685.1 (Graham's
 * approval, 7 November 2026). The pack ids are verify-pack-ids.mjs's; this
 * file holds the other two.
 *
 *   G  The end of a combat is cleared ONCE (turn-records.mjs). Its
 *      `deleteCombat` hook was guarded by `game.user.isGM`, so with two GMs
 *      connected both cleared the attack count and the trait record, and both
 *      deleted the same opening Flat-Footed effects. Now `isActingGM()`, as
 *      ammunition-workflow.mjs's `deleteCombat` hook already was. Driven:
 *      the real hook, on two GM clients with one active GM, on a player, and
 *      on a lone GM with no active GM designated.
 *   S  The schema snapshot records the build it is known true on. The live
 *      comparison on Foundry 14.367 found no drift (gone [], grew []), so
 *      `foundry` reads "14.367" and the field lists are 3.685.1's, unchanged.
 *   Z  The version.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

/* ------------------------------------------------------------ G. one client clears */
const TRec = await imp("combat/turn-records.mjs");
const handlers = {};
globalThis.Hooks = { on: (name, fn) => { (handlers[name] ??= []).push(fn); } };
TRec.registerTurnRecordHooks();
const hook = handlers.deleteCombat?.[0];

/*
 * One creature, the same world document on every client. A write lands a
 * moment later (the server's round trip), so clients that run the hook
 * together all read the creature as it was when the combat ended, as they do
 * in Foundry. Writes are counted.
 */
const later = () => new Promise((resolve) => setTimeout(resolve, 5));
function creature(name) {
  const flags = { attackCount: 2, traitUsage: { actions: 3, wordPenalty: true } };
  const effects = [{ id: "openFF000000000a", flags: { "trg-prime": { initialFlatFooted: true } } }, { id: "spellFF00000000b", flags: { "trg-prime": {} } }];
  const log = { unsets: 0, deletes: [] };
  const actor = {
    uuid: `Actor.${name}`, name, log,
    get effects() { return effects; },
    getFlag: (_s, k) => flags[k],
    unsetFlag: async (_s, k) => { log.unsets += 1; await later(); delete flags[k]; },
    setFlag: async (_s, k, v) => { await later(); flags[k] = v; },
    deleteEmbeddedDocuments: async (_t, ids) => {
      log.deletes.push([...ids]);
      await later();
      // The world's own answer to a second delete of the same id.
      for (const id of ids) { const i = effects.findIndex((e) => e.id === id); if (i < 0) throw new Error(`ActiveEffect ${id} does not exist`); effects.splice(i, 1); }
    }
  };
  return actor;
}
const gmA = { id: "gmA0000000000000", isGM: true }, gmB = { id: "gmB0000000000000", isGM: true }, player = { id: "player0000000000", isGM: false };
/**
 * Every connected client runs the hook together, as Foundry fires it on each.
 * `game.user` is read before the hook's first await, so each call is set up
 * as its own client.
 */
async function endCombatOn(clients, combat, activeGM) {
  const errors = [];
  const error = console.error; console.error = (...a) => errors.push(a.map(String).join(" "));
  try {
    const runs = [];
    for (const user of clients) {
      globalThis.game = { user, users: { activeGM } };
      runs.push(hook?.(combat));
    }
    await Promise.all(runs);
  } finally { console.error = error; }
  return errors;
}

{
  const w = creature("W");
  const errors = await endCombatOn([gmB, gmA, player], { combatants: [{ actor: w }, { actor: w }] }, gmA);
  equal("G1 THE DEFECT, cured: with two GMs connected the opening Flat-Footed is deleted once, by the active GM", w.log.deletes, [["openFF000000000a"]]);
  ok("G2 and the attack count and trait record are cleared once each, with no 'does not exist' error from a second client",
    w.log.unsets === 2 && TRec.attackCountIsClear(w.getFlag("trg-prime", "attackCount")) && TRec.traitUsageIsClear(w.getFlag("trg-prime", "traitUsage")) && errors.length === 0,
    JSON.stringify({ unsets: w.log.unsets, errors }));
}
{
  const w = creature("W");
  await endCombatOn([gmB], { combatants: [{ actor: w }] }, gmA);
  ok("G3 the GM who is not the active GM changes nothing", w.log.unsets === 0 && w.log.deletes.length === 0 && w.getFlag("trg-prime", "attackCount") === 2);
  await endCombatOn([player], { combatants: [{ actor: w }] }, gmA);
  ok("G4 nor does a player", w.log.unsets === 0 && w.log.deletes.length === 0);
}
{
  const w = creature("W");
  await endCombatOn([gmA], { combatants: [{ actor: w }] }, null);
  ok("G5 a lone GM with no active GM designated still clears (acting-gm's fallback)", w.log.deletes.length === 1 && w.log.unsets === 2);
  const p = creature("P");
  await endCombatOn([player], { combatants: [{ actor: p }] }, null);
  ok("G6 and a player with no active GM designated does not", p.log.deletes.length === 0 && p.log.unsets === 0);
}
{
  const src = read("module", "combat", "turn-records.mjs");
  ok("G7 the hook asks isActingGM, imported from acting-gm.mjs, and no isGM guard is left in the file",
    /import \{ isActingGM \} from "\.\.\/acting-gm\.mjs";/.test(src)
    && /Hooks\.on\("deleteCombat", async \(combat\) => \{\s*if \(!isActingGM\(\)\) return;/.test(src)
    && !/\.isGM\b/.test(src));
}

/* ------------------------------------------------------------ S. the snapshot's build */
const { FOUNDRY_SCHEMA_SNAPSHOT } = await imp("foundry-schemas.mjs");
const manifest = JSON.parse(read("system.json"));
equal("S1 the snapshot records 14.367, the build system.json is verified on", [FOUNDRY_SCHEMA_SNAPSHOT.foundry, manifest.compatibility?.verified], ["14.367", "14.367"]);
equal("S2 and its field lists are the ones recorded on 14.363, unchanged (no drift on 14.367)", [
  Object.keys(FOUNDRY_SCHEMA_SNAPSHOT.schemas).length,
  crypto.createHash("sha256").update(JSON.stringify(FOUNDRY_SCHEMA_SNAPSHOT.schemas)).digest("hex")
], [12, "70ad57dbd3f74b1bfe258c857ef5084a9ffff24a6fba64b361a9afc2c45d4b5d"]);

/* ------------------------------------------------------------ Z. the version */
const v = String(manifest.version).split(".").map(Number);
ok("Z1 the version is 3.685.2 or later", v[0] > 3 || (v[0] === 3 && (v[1] > 685 || (v[1] === 685 && v[2] >= 2))), manifest.version);
ok("Z2 and the download names it", manifest.download === `https://github.com/snowtroll75-debug/trpg-prime/releases/download/v${manifest.version}/trg-prime.zip`, manifest.download);

const EXPECTED = 12;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-fixes-3685-2: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-fixes-3685-2: ${checks} checks — all green.`);
