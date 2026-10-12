#!/usr/bin/env node
/**
 * One-shot: declare the three ward spells at 3.406.0.
 *
 * Stone Shield is the interesting one and it is a CORRECTION, not a
 * wiring — see its reason. The other two were never wired at all.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();
const current = {};
const WANT = ["Stone Shield", "Anticipations", "Forbidding Ward"];
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && WANT.includes(value?.name)) current[value.name] = value.system.effects ?? [];
}
await db.close();

const FIXES = [
  {
    id: "stone-shield-ward-scope",
    name: "Stone Shield",
    to: [{
      kind: "ward",
      target: "self",
      slots: ["defence"],
      bonusType: "circumstance",
      value: 4,
      label: "Stone Shield"
    }, {
      kind: "note",
      text: "If the opponent's attack misses you by 4 or less it strikes the shield instead. "
        + "Hardness 8, Hits 15."
    }],
    reason:
      'A CORRECTION, NOT A WIRING. The row read {kind:"bonus", slot:"defence", value:4} with the '
      + 'scope that makes it correct sitting in a NOTE beside it: "(cover from one chosen enemy '
      + 'until the start of your next turn)". So the spell granted an unconditional +4 to DB '
      + 'against every attacker in the scene, where the book grants cover from ONE opponent. That '
      + 'is the difference between a modest 1-PP spell and the best defensive spell in the game, '
      + 'and it was live. Re-authored as a ward scoped to the chosen enemy by uuid; the parts of '
      + 'the note that really are GM-facing (the miss-by-4 rule, the shield\'s Hardness and Hits) '
      + 'are kept as a note, because those genuinely have no engine.'
  },
  {
    id: "anticipations-ward",
    name: "Anticipations",
    to: [{
      kind: "ward",
      target: "self",
      slots: ["defence"],
      bonusType: "status",
      value: 4,
      label: "Anticipations"
    }],
    reason:
      'Unwired. Printed: "For the duration of the spell you gain a +4 status bonus to DB against '
      + 'attacks made by the target." The caster benefits and the target is what the bonus is '
      + 'scoped against, so the effect targets self and the ward names the hostile target. DB '
      + 'only — the sentence says nothing about saves, so no save slots are declared.'
  },
  {
    id: "forbidding-ward-ward",
    name: "Forbidding Ward",
    to: [{
      kind: "ward",
      target: "allies",
      slots: ["defence", "fortitude", "reflex", "will"],
      bonusType: "status",
      value: 1,
      label: "Forbidding Ward"
    }],
    reason:
      'Unwired — one of the last two PP 0 spells. Printed: "The target ally gains a +1-status '
      + 'bonus to DB and saving throws against the target enemy\'s attacks, spells, and other '
      + 'effects." Targets "1 ally and 1 enemy", so the effect targets the ALLY (target: '
      + '"allies", split by disposition) and is scoped against the hostile target. All four slots '
      + 'because the sentence names DB and saving throws without qualifying which. The CL 10 '
      + 'increase to +2 is NOT wired here — caster-level modifications are a separate channel and '
      + 'inventing one inside a data fix would hide it.'
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const fix of FIXES) {
  if (file.fixes.some((f) => f.id === fix.id)) continue;
  const from = current[fix.name];
  if (from === undefined) throw new Error(`could not read ${fix.name} from the pack`);
  file.fixes.push({
    id: fix.id,
    pack: "spells",
    name: fix.name,
    path: "system.effects",
    from,
    to: fix.to,
    declaredAt: "2026-08-25",
    systemVersion: "3.406.0",
    reason: fix.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-ward-fixes: ${added} declared, ${file.fixes.length} total.\n`);
