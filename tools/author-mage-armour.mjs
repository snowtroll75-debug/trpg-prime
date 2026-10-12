#!/usr/bin/env node
/**
 * author-mage-armour — 3.617.2. Mage Armour rebuilt as armour.
 *
 * Graham, 4 October 2026: "it needs to be done this way otherwise the spell
 * is not automated!" — and MA1–MA4, "your recommendation". The row's shape
 * is magic/spell-armour.mjs's; the owned-copy side is the
 * `mage-armour-effects-3617` entry in module/data/pack-repairs.mjs, whose
 * `to` must equal MAGE_ARMOUR_EFFECTS exactly.
 *
 * IDEMPOTENT: the effects are set to this value on every run.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

export const MAGE_ARMOUR_EFFECTS = [
  {
    // ON THE CASTER (3.617.3): without `target` the row aimed at the cast's
    // targets, and a self spell has none — "finds nobody to affect", found
    // driving 3.617.2. See magic/self-rows.mjs.
    kind: "spellArmour", target: "self", label: "Mage Armour",
    // "grants you Armour DR 1 with 20 HP"
    baseDR: 1, hp: 20,
    // "CL 4+: The armour HP increase by 20." / "CL 6+: Armour DR multiplier
    // increases by 1." / "CL 8+: The armour also grants CR 1" / "CL 10: the
    // armour is considered to be rigid for injury purposes."
    hpStep: { every: 4, value: 20 },
    multiplierStep: { every: 6, value: 1 },
    crStep: { every: 8, value: 1 },
    rigidAt: 10,
    // "If the armour is reduced to 0 Hits, it is destroyed and the spell
    // cannot be cast again for 1 hour."
    lockoutMinutes: 60
  }
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  let done = 0;
  try {
    for await (const [key, value] of db.iterator()) {
      if (!key.startsWith("!items!") || value.name !== "Mage Armour") continue;
      value.system.effects = JSON.parse(JSON.stringify(MAGE_ARMOUR_EFFECTS));
      await db.put(key, value);
      done += 1;
    }
  } finally {
    await db.close();
  }
  if (done !== 1) { process.stderr.write(`author-mage-armour: expected one Mage Armour, wrote ${done}\n`); process.exit(1); }
  process.stdout.write("author-mage-armour: Mage Armour's effects written.\n");
}
