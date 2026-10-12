#!/usr/bin/env node
/**
 * author-self-rows — 3.617.3. Two self spells whose rows reached nobody.
 *
 * Invisibility and Shield Of Faith print no range and no target, so they are
 * cast on the caster; their rows were aimed at "targets", which is empty for
 * such a cast. The rows become "self", and the touch warp moves them onto the
 * touched creature (`retargetSelfRows`), as Feather Step's and others' do.
 * The owned-copy side is in module/data/pack-repairs.mjs (the *-3617
 * entries); their `to` values must equal SELF_ROW_FIXES.
 *
 * IDEMPOTENT: the fields are set to these values on every run.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

export const SELF_ROW_FIXES = {
  Invisibility: {
    effects: [
      { kind: "condition", target: "self", condition: "invisible" },
      { kind: "note", text: "Target is undetected (creatures can Search to make it hidden). The spell ends after the target takes a hostile action." }
    ],
    warps: [
      { ppCost: 1, text: "the spells range becomes touch, and you may target another creature", mods: { rangeOverride: "touch", retargetSelfRows: true } },
      { ppCost: 4, text: "if you make a hostile action, the spell ends until the beginning of your next turn", mods: {} },
      { ppCost: 10, text: "you remain invisible even if you make a hostile action", mods: {} }
    ]
  },
  "Shield Of Faith": {
    effects: [
      { kind: "bonus", target: "self", slot: "defence", bonusType: "status", value: 1 }
    ],
    warps: [
      { ppCost: 2, text: "increase the range to touch", mods: { rangeOverride: "touch", retargetSelfRows: true } },
      { ppCost: 6, text: "increase the bonus by +1 (max +3)", mods: { bonusValue: 1, bonusMax: 3 } }
    ]
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  await db.open();
  const seen = new Set();
  try {
    for await (const [key, value] of db.iterator()) {
      const plan = key.startsWith("!items!") ? SELF_ROW_FIXES[value.name] : null;
      if (!plan) continue;
      for (const [field, to] of Object.entries(plan)) value.system[field] = JSON.parse(JSON.stringify(to));
      await db.put(key, value);
      seen.add(value.name);
    }
  } finally {
    await db.close();
  }
  const missing = Object.keys(SELF_ROW_FIXES).filter((n) => !seen.has(n));
  if (missing.length) { process.stderr.write(`author-self-rows: not found: ${missing.join(", ")}\n`); process.exit(1); }
  process.stdout.write(`author-self-rows: ${[...seen].join(", ")} written.\n`);
}
