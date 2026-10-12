#!/usr/bin/env node
/**
 * One-shot: aligning the packs with Core 3.7. 3.441.0.
 *
 * Graham supplied a revised rulebook on 29 August 2026 which "amends
 * positive to essence and also corrects references to persistent damage
 * which should be recurring". Re-deriving `spell-book-fields.json` from
 * it and diffing against the 3.5 transcription found THIRTEEN field
 * changes in 692 spells. This script applies the ones the pack has to
 * follow.
 *
 * THE TRAIT RENAME IS NOT COSMETIC, and nothing would have caught it.
 * `verify-spell-book-fields` does not compare trait lines at all, so
 * POSITIVE → ESSENCE on three spells was invisible to the ratchet; it
 * was found by re-deriving the reference and diffing, which is the
 * argument for doing that whenever a new book arrives rather than
 * trusting the old transcription. And it has a live consequence:
 * `intensifiesThorns` reads the trait line, so under 3.7 these three
 * spells sharpen a druid's Vibrant Thorns and, with the old word, would
 * not have.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const current = {};
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && value?.type === "spell") current[value.name] = value.system;
}
await db.close();

const TRAIT_RENAME =
  'Core 3.7 renames the POSITIVE trait to ESSENCE. Not cosmetic: `intensifiesThorns` reads the '
  + 'trait line, so under 3.7 this spell sharpens a druid\'s Vibrant Thorns and under the old word '
  + 'it would not have. `verify-spell-book-fields` does not compare traits, so nothing in the '
  + 'harness would ever have reported this — it was found by re-deriving the book reference from '
  + 'the new file and diffing against the 3.5 transcription.';

const FIXES = [
  { name: "Magnificent Dawn", path: "system.traits", to: "Invocation, Light, Essence", reason: TRAIT_RENAME },
  { name: "Metabolism", path: "system.traits", to: "Healing, Essence, Soul", reason: TRAIT_RENAME },
  { name: "Reincarnated Embrace", path: "system.traits", to: "Healing, Essence, Soul", reason: TRAIT_RENAME },
  {
    name: "Passwall", path: "system.area",
    to: "5-foot-wide, 10-foot-tall, 10-foot-deep section of wooden, plaster, or stone wall",
    reason: "Core 3.7 hyphenates \"10-foot-deep\". Cosmetic, but the pack-vs-book ratchet compares these strings exactly, and a difference left standing is a difference nobody looks at."
  },
  {
    name: "Snagging Pit", path: "system.area", to: "5-foot square, 10-foot pit",
    reason: "Core 3.7 hyphenates \"10-foot\". Same reason."
  },
  {
    name: "Volcanic Inferno", path: "system.area", to: "5-foot radius, 80-foot-tall cylinder",
    reason: "Core 3.7 hyphenates \"80-foot-tall\". Same reason."
  },
  {
    name: "Tame", path: "system.targets", to: "1 non-hostile, domesticated animal",
    reason: "Core 3.7 adds the comma. Same reason."
  },
  {
    name: "Protective Ward", path: "system.area", to: "10-foot-emanation",
    reason:
      'Core 3.7 hyphenates it. THE DECLARED EXCEPTION FOR THIS SPELL IS NOW RETIRED: the 3.5 '
      + 'transcription read "10-foot-radius centred on you" and Graham ruled on 28 August that the '
      + 'printed entry says emanation; 3.7 prints exactly that, so the pack and the book agree at '
      + 'last and the declaration comes out. `emanationIsLive` asks /emanation/i of this string and '
      + 'is unaffected by the hyphen.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  const slug = fix.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const id = `core37-${slug}-${fix.path.split(".").pop()}`;
  if (file.fixes.some((f) => f.id === id)) continue;
  const held = current[fix.name];
  if (!held) throw new Error(`${fix.name} not found`);
  const from = fix.path.split(".").reduce((o, k) => o?.[k], { system: held });
  file.fixes.push({
    id, pack: "spells", name: fix.name, path: fix.path,
    from, to: fix.to, declaredAt: "2026-08-29", systemVersion: "3.441.0", reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-core-3-7: ${added} declared, ${file.fixes.length} total.\n`);
