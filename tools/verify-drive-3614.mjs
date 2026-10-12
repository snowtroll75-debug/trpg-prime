#!/usr/bin/env node
/**
 * verify-drive-3614 — the four findings of the 3.614.0 drive (3.614.1).
 *
 * NEW at 3.614.1. The drive is claude/live-testing-report-3.614.0.md.
 *
 *   A  F1  a stasis lets its creature's clocks go BEFORE it is deleted, by
 *          every route the system ends one, and only once
 *   B  F2  Nature's Bounty's fruit stamp is not a Power Crystal
 *   C  F3  an item's printed activation is what using it costs
 *   D  F4  a spell attack that deals no damage prints no damage line
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { activationCastTime } from "../module/elixirs.mjs";
import { castTimeAP, castTimeIsCombatLegal } from "../module/magic/cast-time.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const STASISF = strip(read("module", "magic", "stasis-workflow.mjs"));
const APPLY = strip(read("module", "combat", "effect-application-workflow.mjs"));
const COMBAT = strip(read("module", "documents", "combat.mjs"));
const FX = strip(read("module", "magic", "spell-effects.mjs"));
const USE = strip(read("module", "consumable-use-workflow.mjs"));
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const body = (src, head) => {
  const at = src.indexOf(head);
  return at === -1 ? "" : src.slice(at, src.indexOf("\n}", at));
};

/* ================================================================== *
 * A. F1 — the stasis release
 * ================================================================== */
{
  // A STUB WORLD, just enough for `releaseStasis` to run against.
  const calls = [];
  globalThis.game = { combat: { started: true, round: 5 }, time: { worldTime: 130 } };
  const makeActor = () => {
    const effects = new Map();
    const actor = {
      uuid: "Actor.x",
      effects: {
        get: (id) => effects.get(id),
        [Symbol.iterator]: () => effects.values()
      },
      async updateEmbeddedDocuments(type, updates) {
        calls.push(["update", updates.map((u) => ({ ...u }))]);
        await new Promise((r) => setTimeout(r, 5));
        for (const u of updates) {
          const e = effects.get(u._id);
          for (const [k, v] of Object.entries(u)) if (k !== "_id") e.flags["trg-prime"][k.replace("flags.trg-prime.", "")] = v;
        }
      }
    };
    const add = (id, flags) => {
      const e = {
        id, uuid: `Actor.x.ActiveEffect.${id}`, parent: actor, flags: { "trg-prime": flags },
        async delete(options) { calls.push(["delete", id, options]); effects.delete(id); }
      };
      effects.set(id, e);
      return e;
    };
    return { actor, add };
  };
  const { releaseStasis } = await import("../module/magic/stasis-workflow.mjs");

  const { add } = makeActor();
  const stasis = add("s", { stasis: { rounds: 3, startRound: 3, startTime: 118 }, conditionExpiresRound: 5, spellEffectEnd: 136 });
  add("f", { conditionExpiresRound: 4, spellEffectEnd: 124 });
  add("p", {});
  const released = await releaseStasis(stasis);
  ok("A1 the stasis is released", released === true);
  ok("A2 the clocks are written BEFORE the stasis is deleted",
    calls.length === 2 && calls[0][0] === "update" && calls[1][0] === "delete", JSON.stringify(calls));
  const upd = calls[0]?.[1] ?? [];
  ok("A3 only the frozen effect's clocks move, and by the time the stasis lasted",
    upd.length === 1 && upd[0]._id === "f"
    && upd[0]["flags.trg-prime.conditionExpiresRound"] === 6 && upd[0]["flags.trg-prime.spellEffectEnd"] === 136,
    JSON.stringify(upd));
  ok("A4 the delete tells the hook the clocks already moved", calls[1]?.[2]?.trgStasisResumed === 1, JSON.stringify(calls[1]));

  // TWO SWEEPS AT ONCE: one release.
  calls.length = 0;
  const two = makeActor();
  const s2 = two.add("s2", { stasis: { rounds: 1, startRound: 4, startTime: 124 } });
  two.add("g", { conditionExpiresRound: 5 });
  const both = await Promise.all([releaseStasis(s2), releaseStasis(s2)]);
  ok("A5 two sweeps reaching one stasis release it once",
    both.filter(Boolean).length === 1 && calls.filter((c) => c[0] === "update").length === 1
    && calls.filter((c) => c[0] === "delete").length === 1, JSON.stringify({ both, calls }));
  ok("A6 a stasis already gone is not released again", (await releaseStasis(s2)) === false);
  delete globalThis.game;

  // EVERY ROUTE GOES THROUGH IT.
  const endEffect = body(APPLY, "async function endEffect(effect");
  ok("A7 the expiry sweeps end a stasis through releaseStasis",
    /if \(effect\?\.flags\?\.\[SYSTEM_ID\]\?\.stasis\) \{[\s\S]*await releaseStasis\(effect\);\s*return;/.test(endEffect)
    && body(APPLY, "export async function expireTimedConditions").includes("await endEffect(effect, actor);")
    && body(APPLY, "export async function expireSpellEffects").includes("if (actor.effects.get(effect.id)) await endEffect(effect, actor);"));
  ok("A8 the turn start lets a due stasis go through it",
    COMBAT.includes("if (held && Number.isFinite(ends) && this.round >= ends) await releaseStasis(held);"));
  const turnEnd = body(STASISF, "export async function stasisTurnEnd");
  ok("A9 the Fumble's save ends or shortens it through it, never a bare delete",
    (turnEnd.match(/await releaseStasis\(effect\);/g) ?? []).length === 2 && !turnEnd.includes("effect.delete("));
  const hook = STASISF.slice(STASISF.indexOf('globalThis.Hooks.on("deleteActiveEffect"'));
  ok("A10 the hook moves the clocks only for a stasis deleted by hand",
    /const already = options\?\.\[RESUMED_OPTION\];/.test(hook)
    && /already !== undefined && already !== null\s*\?\s*Number\(already\) \|\| 0\s*:\s*await resumeFrozenClocks\(actor, record, effect\.id\)/.test(hook));
  ok("A11 the release card's grammar: one effect resumes where it stood",
    STASISF.includes('resumed === 1 ? " resumes where it" : "s resume where they"'));
}

/* ================================================================== *
 * B. F2 — the fruit is not a crystal
 * ================================================================== */
{
  ok("B1 the crystal line is asked only of a stamp that is a crystal",
    FX.includes("if (crystalStamp?.powerCrystal) {")
    && !/if \(crystalStamp\) \{/.test(FX));
  const from = FX.indexOf("if (effect.healOnUse) {");
  const to = FX.indexOf("if (crystalStamp?.powerCrystal) {");
  ok("B2 the fruit's stamp still carries the consumable and no crystal",
    from !== -1 && to > from && FX.slice(from, to).includes("crystalStamp = { ...(crystalStamp ?? {}), consumable };"));
}

/* ================================================================== *
 * C. F3 — the item's activation
 * ================================================================== */
{
  const build = body(USE, "function buildItemSpell(");
  ok("C1 an item cast takes the item's printed activation as its cast time",
    build.includes('const printedTime = consumableKind(item) === "scroll" ? null : activationCastTime(item?.system?.activation);')
    && build.includes("if (printedTime) data.system.castAP = printedTime;"));
  ok("C2 the activation reads as the AP the book prints",
    activationCastTime("Interact (1 AP)") === "1 AP" && castTimeAP(activationCastTime("Interact (1 AP)")) === 1
    && castTimeAP(activationCastTime("Interact (2 AP)")) === 2 && activationCastTime("") === null);

  // THE PACK: every consumable that releases a spell or carries an effect,
  // and prints an AP activation, is usable in an encounter at that cost.
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "consumables"), { valueEncoding: "json" });
  await db.open({ readOnly: true });
  const rows = [];
  for await (const [k, v] of db.iterator()) {
    if (!k.startsWith("!items!")) continue;
    const c = v.flags?.["trg-prime"]?.consumable;
    if (!c?.effect && !c?.spell) continue;
    rows.push({ name: v.name, activation: v.system?.activation ?? "", kind: c.kind });
  }
  await db.close();
  const fruit = rows.find((r) => r.name === "Bountiful Fruit");
  const berry = rows.find((r) => r.name === "Goodberry");
  const water = rows.find((r) => r.name === "Potion of Water Breathing");
  ok("C3 the Fruit and the Goodberry cost 1 AP",
    [fruit, berry].every((r) => r && castTimeAP(activationCastTime(r.activation)) === 1));
  ok("C4 a Potion of Water Breathing can be drunk in an encounter",
    water && castTimeIsCombatLegal(activationCastTime(water.activation)));
  const apRows = rows.filter((r) => /\(\d+ AP\)\s*$/.test(r.activation));
  ok("C5 every AP-activated spell or effect consumable in the pack is combat-legal",
    apRows.length >= 10 && apRows.every((r) => castTimeIsCombatLegal(activationCastTime(r.activation))),
    `${apRows.length} rows`);
}

/* ================================================================== *
 * D. F4 — no damage, no damage line
 * ================================================================== */
{
  const at = CAST.indexOf("const splashNote = splashFormulaNote(splashSpec, splashDealt);");
  ok("D1 the attack path prints its damage line only when there is damage",
    at !== -1 && CAST.slice(at, at + 400).includes("if (damageFormula || packet.taken > 0) lines.push("));
}

if (failures.length) {
  console.log(`verify-drive-3614: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-3614: OK — ${checks} checks. The stasis release, the fruit's stamp, the item's activation and the damage-free attack.`);
