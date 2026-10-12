#!/usr/bin/env node
/**
 * build-vehicles — the Vehicles compendium, from the printed stat blocks.
 *
 * NEW at 3.577.0. Graham's R11 of the block-17 audit (20 September 2026):
 * "a Vehicles compendium: NPC-type actors with the printed DB, Fort,
 * Hardness, HP, immunities, weakness, speed, crew, passengers, load, and
 * the skill and DC to pilot."
 *
 * THE SOURCE IS tools/vehicles.json, and nothing here is typed twice.
 * Every number in packs/vehicles comes from that file; this script only
 * turns a printed stat block into the fields an NPC derives from.
 *
 * THE ARITHMETIC IS THE DERIVATION'S, RUN BACKWARDS. An NPC's figures are
 * derived (documents/actor.mjs), so the printed DB, Fort and HP are
 * reached by the one slot each keeps for the GM — `other` — after what the
 * derivation adds on its own:
 *
 *   DB    10 + Dexterity + other, and Dexterity is the size's modifier
 *         (SIZE_TABLE.dexMod) on a creature with no ability scores — plus
 *         the Creature Codex's own NPC scaling, "half their level" untyped
 *         and "class bonus − 2" status (creature-bonuses.mjs), which every
 *         NPC gets from 2nd level. Found by building a Galley in the live
 *         world before release: DB 32 where the book prints 24.
 *   Fort  Constitution (0) + other
 *   HP    the size's base HP + other (no Constitution, no HP per level)
 *
 * `vehicleSystemFor` is exported so verify-vehicles can hold the pack to
 * the source and to this arithmetic without a second copy of either.
 *
 * DETERMINISTIC. Ids are hashed from the vehicle's name, so a rebuild
 * writes the same documents — a world that imported a Cart keeps its
 * compendium link.
 *
 * Usage: node tools/build-vehicles.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { SIZE_TABLE, classBonusForLevel } from "../module/config.mjs";
import { creatureLevelBonuses } from "../module/creature-bonuses.mjs";
import { levelDC } from "../module/dice/resolution.mjs";

const SOURCE = path.join(SYSTEM_ROOT, "tools", "vehicles.json");
const PACK_DIR = path.join(SYSTEM_ROOT, "packs", "vehicles");
const SYSTEM_ID = "trg-prime";
const dryRun = process.argv.includes("--dry-run");

/** Deterministic 16-character id — the same hash apply-data-fixes uses. */
export function stableId(seed) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 + seed.charCodeAt(i) + 0x9e3779b9, 0x85ebca6b) >>> 0;
  }
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  let n = BigInt(h1) * 0x100000000n + BigInt(h2);
  while (out.length < 16) {
    out += alphabet[Number(n % BigInt(alphabet.length))];
    n = n / BigInt(alphabet.length) + 7n;
  }
  return out;
}

/** The pilot's DC: the level's DC, moved by the printed Easy / Hard. */
export function vehiclePilotDC(v) {
  return levelDC(Number(v.level) || 0) + (Number(v.dcMod) || 0);
}

/** Token footprint in grid squares, from the printed length and width. */
function footprint(feet) {
  return Math.max(1, Math.round((Number(feet) || 5) / 5));
}

/**
 * The NPC system data that derives to the printed stat block.
 *
 * @param {object} v a row of tools/vehicles.json
 * @returns {object}
 */
export function vehicleSystemFor(v) {
  const size = SIZE_TABLE[v.size] ?? SIZE_TABLE.medium;
  const dex = Number(size.dexMod) || 0;
  const codex = creatureLevelBonuses({
    actorType: "npc", level: Number(v.level), classBonus: classBonusForLevel(Number(v.level))
  });
  const qualities = (v.qualities ?? []).map(([name, text]) => `<p><strong>${name}</strong> ${text}</p>`).join("");
  const notes = [
    `<p>${v.description}</p>`,
    `<p><strong>Level</strong> ${v.level}${v.dcLabel ? ` (${v.dcLabel} DC ${v.dcMod > 0 ? "+" : ""}${v.dcMod})` : ""}; `
      + `<strong>Check</strong> ${v.checkText}${v.check.length ? "" : " — the pilot chooses the skill"}; `
      + `<strong>Pilot DC</strong> ${vehiclePilotDC(v)}</p>`,
    `<p><strong>Length</strong> ${v.length} feet; <strong>Width</strong> ${v.width} feet; <strong>Height</strong> ${v.height} feet</p>`,
    `<p><strong>DB</strong> ${v.db}; <strong>Fort</strong> +${v.fort}; <strong>Hardness</strong> ${v.hardness} (applied as natural DR), `
      + `<strong>HP</strong> ${v.hp}; <strong>Immunities</strong> critical hits, object immunities, precision damage`
      + `${v.weakness ? `; <strong>Weakness</strong> ${v.weakness}` : ""}</p>`,
    qualities,
    `<p><strong>Speed</strong> ${v.speedText}</p>`,
    `<p><strong>Crew</strong> ${v.crew}${v.crewNote ? ` (${v.crewNote})` : ""}; `
      + `${v.passengers ? `<strong>Passengers</strong> ${v.passengers}; ` : ""}<strong>Load</strong> ${v.load}</p>`,
    `<p><em>Mounts &amp; Vehicles table: ${v.cost}, size ${v.tableSize}, ${v.rarity}, level ${v.tableLevel} — ${v.details}.</em></p>`
  ].join("");
  const movement = {};
  for (const mode of ["land", "fly", "swim", "climb", "burrow"]) {
    const feet = Number(v.speed?.[mode] ?? 0);
    movement[mode] = { base: feet, item: 0, status: 0, circumstance: 0, other: 0, total: feet };
  }
  return {
    identity: { level: Number(v.level), size: v.size },
    attributes: Object.fromEntries(["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]
      .map((key) => [key, { base: 0 }])),
    resources: { hp: { value: Number(v.hp), max: Number(v.hp), temp: 0, hpPerLevel: 0, other: Number(v.hp) - Number(size.baseHP) } },
    combat: {
      defence: { base: 10, other: Number(v.db) - 10 - dex - codex.defenceOther - codex.defenceStatus },
      saves: { fortitude: { other: Number(v.fort) } },
      naturalArmourFlat: { natural: Number(v.hardness) },
      movement,
      immunities: "critical hits, precision damage",
      weaknesses: v.weakness ?? ""
    },
    details: { traits: "Object, Vehicle", notes }
  };
}

/** The whole actor document. */
export function vehicleDocument(v) {
  const id = stableId(`vehicle:${v.name}`);
  // A BOAT OR A CART. Core Foundry icons, so the pack depends on nothing.
  const img = Number(v.speed?.swim ?? 0) > 0 ? "icons/svg/anchor.svg" : "icons/svg/wing.svg";
  return {
    _id: id,
    name: v.name,
    type: "npc",
    img,
    system: vehicleSystemFor(v),
    items: [],
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {
      [SYSTEM_ID]: {
        vehicle: {
          level: Number(v.level),
          dcModifier: Number(v.dcMod) || 0,
          pilotDC: vehiclePilotDC(v),
          checks: [...(v.check ?? [])],
          checkText: v.checkText,
          crew: v.crew,
          passengers: v.passengers,
          load: v.load,
          cost: v.cost,
          tableLevel: v.tableLevel
        }
      }
    },
    prototypeToken: {
      name: v.name,
      actorLink: false,
      disposition: 0,
      width: footprint(v.width),
      height: footprint(v.length),
      texture: { src: img }
    },
    _stats: {
      coreVersion: "14",
      systemId: SYSTEM_ID,
      systemVersion: "3.577.0",
      createdTime: 1789862400000,
      modifiedTime: 1789862400000,
      lastModifiedBy: null,
      compendiumSource: null,
      duplicateSource: null
    }
  };
}

async function main() {
  const source = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const docs = source.vehicles.map(vehicleDocument);
  if (dryRun) {
    for (const d of docs) process.stdout.write(`${d._id}  ${d.name}\n`);
    return;
  }
  const { ClassicLevel } = await import("classic-level");
  fs.mkdirSync(PACK_DIR, { recursive: true });
  const db = new ClassicLevel(PACK_DIR, { valueEncoding: "json" });
  await db.open();
  try {
    // REPLACED WHOLE, because this file is the only author of the pack.
    const stale = [];
    for await (const key of db.keys()) stale.push(key);
    for (const key of stale) await db.del(key);
    for (const d of docs) await db.put(`!actors!${d._id}`, d);
  } finally {
    await db.close();
  }
  process.stdout.write(`build-vehicles: ${docs.length} vehicles written to packs/vehicles.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
