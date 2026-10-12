#!/usr/bin/env node
/**
 * build-afflictions — the three afflictions page 232 prints.
 *
 * NEW at 3.583.0. Graham's R7 of the pages 231-240 audit: "Yes".
 *
 * The page prints Filth Fever, Lycanthropy and Blinding Sickness "to get
 * you started", and a raw scan of every compendium found ZERO affliction
 * items of any kind — poisons reached the system only as alchemical
 * items converted at the point of use, and the diseases and the curse
 * did not exist at all.
 *
 * THE SOURCE IS tools/afflictions.json, and nothing here is typed twice.
 * Each stage carries the book's own effect STRING and, beside it, the
 * same sentence in the form the system applies; `verify-afflictions`
 * holds the two against each other, so a stage whose conditions drift
 * from its text is a failed check rather than a card that reads one way
 * and plays another — which is the defect this whole block is about.
 *
 * DETERMINISTIC. Ids are hashed from the name, so a rebuild writes the
 * same documents and a world that imported Filth Fever keeps its link.
 *
 * Usage: node tools/build-afflictions.mjs [--dry-run]
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SOURCE = path.join(SYSTEM_ROOT, "tools", "afflictions.json");
const PACK_DIR = path.join(SYSTEM_ROOT, "packs", "afflictions");
const dryRun = process.argv.includes("--dry-run");

/** A stable 16-character id from the affliction's name. */
function idFor(name) {
  return crypto.createHash("sha1").update(`trg-affliction:${name}`).digest("base64")
    .replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
}

export function afflictionDocument(source) {
  const stages = source.stages.map((s) => ({
    effect: s.effect ?? "",
    interval: s.interval ?? "",
    conditions: s.conditions ?? [],
    conditionDuration: s.conditionDuration ?? "",
    damage: s.damage ?? "",
    criticalOnFailure: Boolean(s.criticalOnFailure),
    criticalDamageType: s.criticalDamageType ?? "poison"
  }));
  return {
    _id: idFor(source.name),
    name: source.name,
    type: "affliction",
    img: "icons/svg/biohazard.svg",
    system: {
      afflictionType: source.afflictionType ?? "poison",
      traits: source.traits ?? "",
      level: Number(source.level ?? 0),
      savingThrow: source.savingThrow ?? "fortitude",
      rarity: /uncommon/i.test(source.traits ?? "") ? "uncommon" : "common",
      rarityModifier: 0,
      incubation: source.incubation ?? "",
      duration: source.duration ?? "",
      maxStage: stages.length,
      stages,
      incubating: true,
      currentStage: 0,
      description: source.description ?? "",
      quantity: 1,
      weight: 0,
      price: 0
    },
    effects: [],
    folder: null,
    sort: 0,
    ownership: { default: 0 },
    flags: {},
    _stats: {
      systemId: "trg-prime", systemVersion: null, coreVersion: null,
      createdTime: null, modifiedTime: null, lastModifiedBy: null,
      compendiumSource: null, duplicateSource: null
    }
  };
}

async function main() {
  const source = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const docs = source.afflictions.map(afflictionDocument);
  if (dryRun) {
    for (const d of docs) process.stdout.write(`${d._id}  ${d.name}  (${d.system.maxStage} stages)\n`);
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
    for (const d of docs) await db.put(`!items!${d._id}`, d);
  } finally {
    await db.close();
  }
  process.stdout.write(`build-afflictions: ${docs.length} afflictions written to packs/afflictions.\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
