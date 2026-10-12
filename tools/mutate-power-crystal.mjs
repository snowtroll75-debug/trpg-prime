#!/usr/bin/env node
/**
 * mutate-power-crystal — can the crystal checks fail?
 *
 * NEW at 3.594.0, rewritten at 3.594.1 around the model the live drive
 * corrected. SURVIVED and an unmatched anchor are both failures.
 *
 * THE FIRST TWO ARE THE DESIGN: take the crystals out of the derived
 * maximum and the spell becomes a decorative rock.
 *
 * THE THIRD IS THE DEFECT ITSELF, restored: measure the resting position
 * instead of the spend and a crystal dissolves in the hand of any caster
 * who is not at full pool, which is nearly all of them.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const RULE = at("module", "magic", "power-crystal.mjs");
const WF = at("module", "magic", "power-crystal-workflow.mjs");
const ACTOR = at("module", "documents", "actor.mjs");
const APPLIER = at("module", "magic", "spell-effects.mjs");
const CONJ = at("module", "magic", "conjured-item-workflow.mjs");
const WARP = at("module", "magic", "spell-warp.mjs");
const BOOT = at("scripts", "trg-prime.mjs");
const VERIFY = at("tools", "verify-power-crystal.mjs");

const MUTATIONS = [
  { file: ACTOR, name: "THE DESIGN: the crystals leave the derived maximum",
    from: `      pp.max += pp.crystals;`, to: `      ;`, breaks: "C1" },
  { file: ACTOR, name: "the maximum is read off one sheet instead of the items",
    from: `      pp.crystals = crystalTotal(actor?.items ?? []);`,
    to: `      pp.crystals = Number(this.getFlag?.("trg-prime", "crystals") ?? 0);`, breaks: "C1b" },
  { file: RULE, name: "a malformed flag counts as a crystal",
    from: `  return Math.max(0, int(held?.pp));`, to: `  return Math.max(0, int(held));`,
    breaks: "A1c" },
  { file: RULE, name: "negative points are points",
    from: `  return Math.max(0, int(held?.pp));`, to: `  return int(held?.pp);`, breaks: "A1d" },
  { file: RULE, name: "THE DEFECT RESTORED: the resting position instead of the spend",
    from: `  const spent = int(before) - int(after);`,
    to: `  const spent = int(after) - Math.max(0, int(after) - held);`, breaks: "B1" },
  { file: RULE, name: "a spend larger than the crystals charges them for all of it",
    from: `  return Math.min(held, spent);`, to: `  return spent;`, breaks: "B2" },
  { file: RULE, name: "A REST REFILLS THE CRYSTAL, and a refund pays it back",
    from: `  if (spent <= 0) return 0;`, to: `  if (spent === 0) return 0;`, breaks: "B3" },
  { file: RULE, name: "a crystal nobody is carrying is still drawn on",
    from: `  const held = Math.max(0, int(total));`, to: `  const held = 99;`, breaks: "B3d" },
  { file: RULE, name: "BIGGEST FIRST, chipping every crystal instead of emptying one",
    from: `    .sort((a, b) => a.pp - b.pp || a.id.localeCompare(b.id));`,
    to: `    .sort((a, b) => b.pp - a.pp || a.id.localeCompare(b.id));`, breaks: "B4" },
  { file: RULE, name: "an empty crystal is drawn from",
    from: `    .filter((c) => c.id && c.pp > 0)`, to: `    .filter((c) => c.id)`, breaks: "B4c" },
  { file: RULE, name: "the card stops saying the crystal is spent first",
    from: `usable as part of their own reserve, and spent first. `,
    to: `usable as part of their own reserve. `, breaks: "E4" },
  { file: RULE, name: "one point reads as several",
    from: 'its ${points === 1 ? "point is" : `${points} points are`} spent.',
    to: "its ${points} points are spent.", breaks: "E4c" },
  { file: WF, name: "SETTLED AFTER THE UPDATE, which cannot see what the spend was",
    from: `  Hooks.on("preUpdateActor", (actor, changed) => {`,
    to: `  Hooks.on("updateActor", (actor, changed) => {`, breaks: "D1" },
  { file: WF, name: "the spend is measured against itself",
    from: `    const before = Number(actor.system?.resources?.pp?.value ?? 0);`,
    to: `    const before = Number(changed?.system?.resources?.pp?.value ?? 0);`, breaks: "D1" },
  { file: WF, name: "every actor update settles crystals, pool or not",
    from: `    if (after === undefined) return;`, to: `    ;`, breaks: "D1b" },
  { file: WF, name: "an emptied crystal is left on the sheet",
    from: `    await actor.deleteEmbeddedDocuments("Item", emptied.map((d) => d.id)).catch(() => {});`,
    to: `    ;`, breaks: "D2" },
  { file: WF, name: "a part-spent crystal keeps its original points",
    from: `    await actor.items.get(d.id)?.setFlag(SYSTEM_ID, CRYSTAL_FLAG, { pp: d.to }).catch(() => {});`,
    to: `    ;`, breaks: "D2b" },
  { file: WF, name: "THE DOUBLE CHARGE: emptying a crystal also takes the points again",
    from: `    await actor.deleteEmbeddedDocuments("Item", emptied.map((d) => d.id)).catch(() => {});`,
    to: `    await actor.update({ "system.resources.pp.value": 0 });
    await actor.deleteEmbeddedDocuments("Item", emptied.map((d) => d.id)).catch(() => {});`,
    breaks: "D2c" },
  { file: WF, name: "THE RACE: every client settles, and they fight over one crystal",
    from: `  Hooks.on("preUpdateActor", (actor, changed) => {
    if (!game.user?.isGM) return;`,
    to: `  Hooks.on("preUpdateActor", (actor, changed) => {`, breaks: "D4" },
  { file: BOOT, name: "THE HOOKS ARE NEVER REGISTERED",
    from: `  registerPowerCrystalHooks();`, to: `  ;`, breaks: "D5" },
  { file: APPLIER, name: "the crystal is conjured carrying nothing",
    from: `castId, expires: conjureExpires, stamp: crystalStamp`,
    to: `castId, expires: conjureExpires, stamp: null`, breaks: "E1b" },
  { file: APPLIER, name: "the warp's points never reach the crystal",
    from: `            ? { powerCrystal: { pp: crystalBase + Math.max(0, Number(warpMods?.crystalPP ?? 0)) } }`,
    to: `            ? { powerCrystal: { pp: crystalBase } }`, breaks: "E1" },
  { file: APPLIER, name: "EVERY conjured item is stamped a crystal, Holy Water included",
    // RE-ANCHORED 3.614.0: a `let`, since Nature's Bounty stamps its warped heal there too.
    from: `          let crystalStamp = crystalBase > 0`, to: `          let crystalStamp = true`,
    breaks: "E2" },
  { file: CONJ, name: "the stamp replaces the conjured and expiry flags instead of joining them",
    from: `      data.flags[SYSTEM_ID] = { ...data.flags[SYSTEM_ID], ...stamp };`,
    to: `      data.flags[SYSTEM_ID] = { ...stamp };`, breaks: "E1c" },
  { file: RULE, name: "THE CEILING WITHOUT THE POINTS: arriving changes nothing",
    from: `  return Math.min(int(max), int(value) + Math.max(0, int(points)));`,
    to: `  return int(value);`, breaks: "B5" },
  { file: RULE, name: "two crystals double-count one ceiling",
    from: `  return Math.min(int(max), int(value) + Math.max(0, int(points)));`,
    to: `  return int(value) + Math.max(0, int(points));`, breaks: "B5c" },
  { file: RULE, name: "THE MINT: leaving takes nothing back, so a hand-over makes points",
    from: `  return Math.max(0, int(value) - Math.max(0, int(points)));`,
    to: `  return int(value);`, breaks: "B6" },
  { file: RULE, name: "a departure can take the pool below nothing",
    from: `  return Math.max(0, int(value) - Math.max(0, int(points)));`,
    to: `  return int(value) - Math.max(0, int(points));`, breaks: "B7" },
  { file: WF, name: "THE ARRIVAL IS NEVER WATCHED",
    from: `  Hooks.on("createItem", (item) => {`, to: `  Hooks.on("createItemNever", (item) => {`,
    breaks: "D3f" },
  { file: WF, name: "every item a character picks up settles as a crystal",
    from: `    const points = crystalPoints(item);
    if (points <= 0) return;
    const actor = item.parent;
    if (!actor?.system?.resources?.pp) return;
    // Next tick, so the derived maximum already counts the crystal the`,
    to: `    const points = crystalPoints(item);
    const actor = item.parent;
    if (!actor?.system?.resources?.pp) return;
    // Next tick, so the derived maximum already counts the crystal the`,
    breaks: "D3f" },
  { file: WF, name: "the arrival hook runs on every client, and they race",
    from: `  Hooks.on("createItem", (item) => {
    if (!game.user?.isGM) return;`, to: `  Hooks.on("createItem", (item) => {`, breaks: "D4" },
  { file: WF, name: "THE DOUBLE CHARGE: an emptied crystal dissolves with its old points on it",
    from: `    for (const d of emptied) {
      await actor.items.get(d.id)?.setFlag(SYSTEM_ID, CRYSTAL_FLAG, { pp: 0 }).catch(() => {});
    }`, to: `    ;`, breaks: "D3e" },
  { file: WF, name: "a leaving crystal takes nothing with it",
    from: `  const left = crystalDeparture(value, points);`,
    to: `  const left = crystalDeparture(value, 0);`, breaks: "D3" },
  { file: WF, name: "the departure writes the pool even when it would not move",
    from: `  if (left === value) return null;`, to: `  if (false) return null;`, breaks: "D3b" },
  { file: APPLIER, name: "THE HAND-ROLLED RULE RETURNS: the applier writes the pool itself",
    from: `            const { crystalLine } = await import("./power-crystal.mjs");`,
    to: `            await target.update({ "system.resources.pp.value":
              Number(target.system?.resources?.pp?.value ?? 0) + crystalStamp.powerCrystal.pp });
            const { crystalLine } = await import("./power-crystal.mjs");`, breaks: "E5b" },
  { file: APPLIER, name: "the clock stops naming the item it times",
    from: `{ spellBuff: true, conjuredItemId: made.id }`, to: `{ spellBuff: true }`, breaks: "E6" },
  { file: CONJ, name: "THE PHANTOM ROW RETURNS: an item leaving early keeps its clock",
    from: `    actor.deleteEmbeddedDocuments("ActiveEffect", clocks).catch(() => {});`, to: `    ;`,
    breaks: "E6b" },
  { file: CONJ, name: "the clock is matched by NAME, so a second casting's crystal is taken too",
    from: `      .filter((e) => e.getFlag?.(SYSTEM_ID, "conjuredItemId") === item.id)`,
    to: `      .filter((e) => e.name === item.name)`, breaks: "E6b" },
  { file: CONJ, name: "every client deletes the clock, and they race",
    from: `  Hooks.on("deleteItem", (item) => {
    if (!game.user?.isGM) return;`, to: `  Hooks.on("deleteItem", (item) => {`, breaks: "E6c" },
  { file: BOOT, name: "THE CLOCK CLEANUP IS NEVER REGISTERED",
    from: `  registerConjuredItemHooks();`, to: `  ;`, breaks: "E6d" },
  { file: WARP, name: "the aggregator forgets crystalPP",
    from: `    if (m.crystalPP) mods.crystalPP += Number(m.crystalPP) * times;`, to: `    ;`,
    breaks: "E3" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
const run = () => {
  try { execFileSync(process.execPath, [VERIFY], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!run()) {
  console.error("verify-power-crystal does not pass on the unmutated tree — nothing to measure.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
try {
  for (const m of MUTATIONS) {
    const original = originals.get(m.file);
    const n = original.split(m.from).length - 1;
    if (n !== 1) {
      console.error(`  ${n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}`}  ${m.name}`);
      unmatched++;
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const stillPasses = run();
    fs.writeFileSync(m.file, original);
    if (stillPasses) {
      console.error(`  SURVIVED  ${m.name} (expected ${m.breaks} to fail)`);
      survived++;
    } else {
      console.log(`  caught    ${m.name}`);
    }
  }
} finally {
  for (const [file, original] of originals) fs.writeFileSync(file, original);
}

process.stdout.write(survived + unmatched
  ? `\nmutate-power-crystal: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-power-crystal: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
