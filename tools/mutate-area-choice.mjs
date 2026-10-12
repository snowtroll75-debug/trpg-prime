#!/usr/bin/env node
/**
 * mutate-area-choice — can verify-area-choice fail?
 * NEW at 3.479.0.
 *
 * D2 IS THE RULING. The caster is listed and not ticked — two separate
 * things, and a mutation attacks each half, because dropping them from
 * the list entirely also stops them being hit and would pass a check
 * that only asked whether they were unticked.
 *
 * C3 IS THE ONE THAT WOULD NEVER BE REPORTED. A cancel that spared
 * everybody makes the spell quietly do nothing while the card still
 * reads as a successful cast — nobody at a table reports a spell that
 * failed to hurt their own party.
 *
 * W4 IS THE ORDERING. A choice applied after the storm has already read
 * the list spares nobody at all, and the card would print the sparing
 * line beside the damage it did not prevent.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const A = path.join(SYSTEM_ROOT, "module", "magic", "area-choice.mjs");
const F = path.join(SYSTEM_ROOT, "module", "magic", "area-choice-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-area-choice.mjs");

const MUTATIONS = [
  {
    file: A,
    name: "D2 THE RULING BROKEN: the caster arrives pre-ticked",
    // Re-anchored 3.609.1: rows are keyed per creature (F5 of the 3.609.0 drive).
    from: "      return { id: creatureKey(a), name: text(a.name), ticked: !isCaster, isCaster };",
    to: "      return { id: creatureKey(a), name: text(a.name), ticked: true, isCaster };",
    breaks: "D2 — pressing Continue without reading costs the caster ~50 force"
  },
  {
    file: A,
    name: "D2 the other half: the caster is dropped from the list entirely",
    from: "  return (caught ?? [])\n    .filter(Boolean)",
    to: "  return (caught ?? [])\n    .filter(Boolean)\n    .filter((a) => text(a.id) !== self)",
    breaks: "D2 — the caster could never opt into their own area"
  },
  {
    file: A,
    name: "D3 nobody is ticked, so every cast is five clicks",
    // Re-anchored 3.609.1 (F5).
    from: "      return { id: creatureKey(a), name: text(a.name), ticked: !isCaster, isCaster };",
    to: "      return { id: creatureKey(a), name: text(a.name), ticked: false, isCaster };",
    breaks: "D3 — the printed default is \"each character in the area\""
  },
  {
    file: A,
    name: "C3 A CANCEL SPARES EVERYBODY",
    from: "  if (chosenIds === null || chosenIds === undefined) return list;",
    to: "  if (chosenIds === undefined) return list;",
    breaks: "C3 — a dismissed dialog would silently make the spell do nothing"
  },
  {
    file: A,
    name: "C4 an explicit empty choice is treated as no choice",
    from: "  const wanted = new Set([...chosenIds].map(text).filter(Boolean));",
    to: "  const wanted = new Set([...chosenIds].map(text).filter(Boolean));\n  if (!wanted.size) return list;",
    breaks: "C4 — \"you MAY target\" permits targeting no-one"
  },
  {
    file: A,
    name: "C5 the dialog can widen what the template caught",
    // Re-anchored 3.609.1 (F5).
    from: "  return list.filter((a) => wanted.has(creatureKey(a)));",
    to: "  return [...wanted].map((id) => list.find((a) => creatureKey(a) === id) ?? { id, name: id });",
    breaks: "C5 — a stale row could add a creature the area never caught"
  },
  {
    file: A,
    name: "F4 a truthy string switches the dialog on",
    from: "  return spellData?.[AREA_CHOICE_FIELD] === true;",
    to: "  return Boolean(spellData?.[AREA_CHOICE_FIELD]);",
    breaks: "F4 — transcription noise in the pack would open a picker"
  },
  {
    file: A,
    name: "L3 an empty spared list still prints a line",
    from: "  if (!names.length) return \"\";",
    to: "  if (names.length < 0) return \"\";",
    breaks: "L3 — \"spares\" with no names on every ordinary cast"
  },
  {
    file: A,
    name: "L4 choosing nobody is left silent",
    from: "  return `<em>${text(spellName)} is cast, and the caster targets no-one in the area.</em>`;",
    to: "  return \"\";",
    breaks: "L4 — a cast that hit nobody reads as a broken spell"
  },
  {
    file: C,
    name: "W3 the choice is offered BEFORE the kind gate prunes",
    from: "        const kindFiltered = filterAreaByKind(actor, spellData, caught);\n        areaTargets = kindFiltered.kept;",
    to: "        areaTargets = caught;\n        const kindFiltered = filterAreaByKind(actor, spellData, caught);",
    breaks: "W3 — rows for creatures the gate already refused"
  },
  {
    file: C,
    name: "W2 the answer is collected and thrown away",
    from: "          areaTargets = applyAreaChoice(before, chosen);",
    to: "          applyAreaChoice(before, chosen);",
    breaks: "W2 — the picker would ask and change nothing"
  },
  {
    file: C,
    name: "W5 the spared are not named on the card",
    from: "          if (sparedText) lines.push(line(sparedText));",
    to: "          if (false) lines.push(line(sparedText));",
    breaks: "W5 — Graham's pruning ruling: the names go on the result card"
  },
  {
    file: C,
    name: "W1 the cast stops offering the choice at all",
    from: "        if (areaIsChosen(spellData) && areaTargets.length) {",
    to: "        if (false && areaIsChosen(spellData) && areaTargets.length) {",
    breaks: "W1 — the caster is caught in their own storm again"
  },
  {
    file: F,
    name: "W6 a dismissed dialog never resolves",
    from: "      close: () => resolve(null)",
    to: "      close: () => {}",
    breaks: "W6 — the cast would hang for ever on a closed dialog"
  },
  {
    file: F,
    name: "W7 the caster's row is indistinguishable from the rest",
    from: "          r.isCaster ? \" <em>(you — the caster)</em>\" : \"\"",
    to: "          \"\"",
    breaks: "W7 — an unticked row with nothing to explain why"
  }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
guardFiles(files);

const survivors = [];
let applied = 0;
const verifyPasses = () => {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
};

if (!verifyPasses()) {
  console.error("mutate-area-choice: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    if (!source.includes(m.from)) {
      console.error(`mutate-area-choice: anchor missing for "${m.name}"`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-area-choice: "${m.name}" changes nothing`);
      process.exit(1);
    }
    applied += 1;
    fs.writeFileSync(m.file, source.replace(m.from, m.to));
    if (verifyPasses()) survivors.push(`${m.name} (should break ${m.breaks})`);
    fs.writeFileSync(m.file, source);
  }
} finally {
  for (const [f, s] of originals) fs.writeFileSync(f, s);
}

if (survivors.length) {
  console.error(`mutate-area-choice: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-area-choice: all ${applied} mutations were caught`);
