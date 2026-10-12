#!/usr/bin/env node
/**
 * One-shot: declare the two transcription typos found at 3.405.0.
 *
 * Both surfaced the same way — `parse-degree-ladders` refused the spell
 * as unreadable PROSE, and reading the text to find out why showed the
 * fault was in the transcription rather than in the parser. A parser
 * that refuses loudly is worth more than one that guesses; these are the
 * first two data errors it has found.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const dir = path.join(SYSTEM_ROOT, "packs", "spells");
const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(dir, { valueEncoding: "json" });
await db.open();
const current = {};
for await (const [key, value] of db.iterator()) {
  if (key.startsWith("!items!") && ["Word Of Deafening", "Brain Lock"].includes(value?.name)) {
    current[value.name] = value.system.description;
  }
}
await db.close();

const WORD_OF_DEAFENING_REASON =
  'Transcription typo. All three timed rungs read "The target is deafened OR 1 round / '
  + '1 minute / 10 minutes" where the book means "FOR". The line immediately above them says '
  + '"The duration of the spell depends upon the targets saving throw", so those rungs ARE '
  + 'durations and "or" is a keystroke slip repeated three times. Corrected on all three; the '
  + 'fumble rung ("deafened permanently") is left exactly as it stands. Found at 3.405.0 by '
  + 'tools/parse-degree-ladders.mjs, which refused the spell as unreadable prose — the refusal '
  + 'is what made anyone read the sentence.';

const BRAIN_LOCK_REASON =
  'Transcription typo. The success rung reads "The creature stunned 1." with the verb missing; '
  + 'every other rung in the same ladder reads "The creature is ...". Found at 3.405.0 by '
  + 'tools/parse-degree-ladders.mjs, which refused the clause for having no readable verb. '
  + 'NOTE: this does not by itself make the spell wireable — its fumble rung says "As failure '
  + 'except the target is also paralyzed", a cross-reference to another rung that nothing can '
  + 'yet express, and it carries a Sustain clause besides.';

const additions = [
  {
    id: "word-of-deafening-or-for",
    name: "Word Of Deafening",
    to: current["Word Of Deafening"]?.replace(/is deafened or /g, "is deafened for "),
    reason: WORD_OF_DEAFENING_REASON
  },
  {
    id: "brain-lock-missing-is",
    name: "Brain Lock",
    to: current["Brain Lock"]?.replace("The creature stunned 1.", "The creature is stunned 1."),
    reason: BRAIN_LOCK_REASON
  }
];

const filePath = path.join(SYSTEM_ROOT, "tools", "data-fixes.json");
const file = JSON.parse(fs.readFileSync(filePath, "utf8"));
let added = 0;
for (const entry of additions) {
  if (file.fixes.some((f) => f.id === entry.id)) continue;
  const from = current[entry.name];
  if (!from) throw new Error(`could not read ${entry.name} from the pack`);
  if (from === entry.to) throw new Error(`${entry.name}: the replacement changed nothing — anchor wrong`);
  file.fixes.push({
    id: entry.id,
    pack: "spells",
    name: entry.name,
    path: "system.description",
    from,
    to: entry.to,
    declaredAt: "2026-08-25",
    systemVersion: "3.405.1",
    reason: entry.reason
  });
  added += 1;
}
fs.writeFileSync(filePath, `${JSON.stringify(file, null, 2)}\n`);
process.stdout.write(`declare-wording-fixes: ${added} declared, ${file.fixes.length} total.\n`);
