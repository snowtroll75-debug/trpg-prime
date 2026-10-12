#!/usr/bin/env node
/**
 * THE RULEBOOK, READABLE.
 *
 * NEW at 3.451.0, and it should have existed from the first day.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS.
 *
 * Graham, 1 September 2026, having answered five questions I had put to
 * him as open rules problems:
 *
 *   "The moral here is that you should probably at some point look at
 *    the rulebook that I attached to this thread, it would kind of help!"
 *
 * All five were answered by the spells' own printed descriptions. I had
 * been reading the pack's STRUCTURED FIELDS — `damage.formula`, the
 * parsed `spell-book-fields.json` — and treating a field's absence as a
 * gap in the rules. The prose those fields were extracted from was
 * attached to the thread the whole time.
 *
 * WHAT I GOT WRONG, PRECISELY, because the shape of it matters more than
 * the five spells:
 *
 *   - I read `Base Damage 1d6` on Vampiric Touch as "damage stranded in
 *     a field nothing rolls". It is nothing of the kind: Base Damage is
 *     the PER-DIE BASE that Empower Spell and the warping options
 *     multiply, and the spell's actual "6d6 points of essence damage"
 *     is in the sentence underneath. Graham: "It has Base Damage so that
 *     Metamagics such as Empower Spell can be used with it!!!!!"
 *   - I called Forceful Strike a contradiction "in the book itself". It
 *     is not. 1d6 is the metamagic base, 2d6 is what the strike adds,
 *     and the spell ALSO pushes the target using the Spellcraft result
 *     as a Shove — a third mechanic I never mentioned because I never
 *     read the entry.
 *   - I reported Shock Bolt as "prose says basic Reflex, pack names no
 *     save". The save is real and belongs to a case I had not read: on a
 *     critical injury, ADJACENT creatures in metal armour take half
 *     damage (basic Reflex). The 2d12 attack rolls no save because it is
 *     an attack.
 *
 * THE RULE THIS ENFORCES: read the spell's own entry before reporting
 * anything about it as missing, contradictory or unbuildable. A stat
 * block field is an extract, and an extract that omits something is not
 * the rules omitting it.
 *
 * ─────────────────────────────────────────────────────────────────────
 * USAGE
 *
 *   node tools/rulebook.mjs "vampiric touch"     one entry, in full
 *   node tools/rulebook.mjs --grep "metal armour"  every entry matching
 *   node tools/rulebook.mjs --damage             printed vs pack dice
 *
 * The source is `tools/source/rulebook-core-3.7.html`, Graham's own
 * interactive Core 3.7, kept in the tree so this is never again a thing
 * the harness cannot see.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const TEXT = path.join(SYSTEM_ROOT, "tools", "source", "rulebook-core-3.7.txt");
const JSONF = path.join(SYSTEM_ROOT, "tools", "source", "rulebook-spells.json");

/** Every spell entry the rulebook prints, by name. */
export function spellEntries() {
  return JSON.parse(fs.readFileSync(JSONF, "utf8"));
}

/** The whole book as plain text, for questions that are not about a spell. */
export function rulebookText() {
  return fs.readFileSync(TEXT, "utf8");
}

/**
 * One spell's printed entry, matched loosely on the name.
 *
 * APOSTROPHES ARE NORMALISED, because the book uses U+2019 and everyone
 * types the other one — the same trap that made me report Seer's Vision
 * as missing from the pack on 31 August.
 */
export function spellEntry(name) {
  const want = String(name ?? "").toUpperCase().replace(/[’']/g, "'").trim();
  const all = spellEntries();
  for (const [k, v] of Object.entries(all)) {
    if (k.toUpperCase().replace(/[’']/g, "'") === want) return { name: k, ...v };
  }
  for (const [k, v] of Object.entries(all)) {
    if (k.toUpperCase().replace(/[’']/g, "'").includes(want)) return { name: k, ...v };
  }
  return null;
}

/** Every dice expression the entry's PROSE names, ignoring the Base Damage line. */
export function proseDice(entryText) {
  const body = String(entryText ?? "").replace(/^Base Damage.*$/gm, "");
  return [...body.matchAll(/\b(\d+)d(\d+)\b/g)].map((m) => `${m[1]}d${m[2]}`);
}

if (process.argv[1] && process.argv[1].endsWith("rulebook.mjs")) {
  const args = process.argv.slice(2);
  if (args[0] === "--grep") {
    const needle = args.slice(1).join(" ").toLowerCase();
    let n = 0;
    for (const [name, e] of Object.entries(spellEntries())) {
      if (e.text.toLowerCase().includes(needle)) {
        n += 1;
        process.stdout.write(`\n=== ${name} (PP ${e.pp})\n${e.text.slice(0, 700)}\n`);
      }
    }
    process.stdout.write(`\n${n} entries matched.\n`);
  } else if (args.length) {
    const e = spellEntry(args.join(" "));
    process.stdout.write(e ? `=== ${e.name} (PP ${e.pp})\n${e.text}\n` : "No such entry.\n");
  } else {
    process.stdout.write(`${Object.keys(spellEntries()).length} spell entries. Usage in the header.\n`);
  }
}
