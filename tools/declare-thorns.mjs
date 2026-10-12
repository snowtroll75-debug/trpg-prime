#!/usr/bin/env node
/** One-shot: Vibrant Thorns. 3.440.0 — group 4 of the PP 1 work plan. */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
let from = null;
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && value?.name === "Vibrant Thorns") from = value.system.effects ?? [];
}
await db.close();
if (from === null) throw new Error("Vibrant Thorns not found");

const to = [
  {
    kind: "thorns", target: "self", label: "Vibrant Thorns",
    damage: "1", intensified: "1d6", damageType: "piercing", reachFeet: 5
  },
  {
    kind: "note",
    text: "+4 PP: the damage increases by 1, or to 1d6 after you cast a positive spell — warped by hand."
  }
];

const reason =
  'Silent. "Whenever a creature adjacent to you or a creature that hits you with an unarmed attack '
  + 'lands a melee blow, they suffer 1 piercing damage" is a rider on being HIT — the mirror of the '
  + 'strike riders built at 3.437.0, landing in the same function a few lines from the Vicious rune, '
  + 'which is the only other thing there that damages the person who swung. Rolled as its own packet '
  + "and resolved against the ATTACKER's own defences, so a creature immune to piercing walks "
  + 'through a briar patch unharmed. `reachFeet: 5` is what "adjacent" means: a reach weapon '
  + 'striking from ten feet does not touch the thorns, which is the whole point of the word being in '
  + 'the spell, and the unarmed clause is implemented as its own route so a long-armed creature '
  + 'still sets them off. The intensified 1d6 is a ROUND STAMP on the same effect, opened by casting '
  + 'an Essence spell and closed by the caster\'s own turn-start beside Luminance — "until the '
  + 'beginning of your next turn" is the turn clock\'s question and nothing else can answer it. '
  + 'NOTE A DISCREPANCY IN THE BOOK: the body says the thorns intensify after an ESSENCE spell and '
  + 'the +4 PP warp says a POSITIVE spell. Essence is a real trait carried by real spells in this '
  + 'pack; "positive" is not a trait at all, so the body\'s word is the one implemented and the warp '
  + 'stays a note rather than being quietly reconciled.';

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
const id = "thorns-vibrant-thorns";
let added = 0;
if (!file.fixes.some((f) => f.id === id)) {
  file.fixes.push({
    id, pack: "spells", name: "Vibrant Thorns", path: "system.effects",
    from, to, declaredAt: "2026-08-29", systemVersion: "3.440.0", reason
  });
  added = 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-thorns: ${added} declared, ${file.fixes.length} total.\n`);
