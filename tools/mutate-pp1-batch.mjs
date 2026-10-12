#!/usr/bin/env node
/**
 * mutate-pp1-batch — can verify-pp1-batch fail?
 * NEW at 3.487.0.
 *
 * R-F1 IS THE ONE THIS BATCH EXISTS FOR. The wrong design was a hook
 * inside the death machinery — cheaper, plausible, and it would have
 * fired a Reaction spell nobody cast. The mutation adds it back.
 *
 * C-P2 IS THE DATA CLAIM. A Holy Water without its Splash trait is
 * exactly what a hand-built imitation would have been, and the whole
 * copy-the-real-item argument rests on that trait being there.
 *
 * R-A4 IS THE ARITHMETIC NOBODY WOULD REPORT. Doubling the LEVEL rather
 * than the amount is off by exactly 5 on an undead, which reads as a
 * rounding quibble and is a misread sentence.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const D = path.join(SYSTEM_ROOT, "module", "magic", "death-resonance.mjs");
const DW = path.join(SYSTEM_ROOT, "module", "magic", "death-resonance-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "conjured-item.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "conjured-item-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-pp1-batch.mjs");

const MUTATIONS = [
  {
    file: D,
    name: "R-A4 THE SENTENCE MISREAD: the LEVEL doubles rather than the amount",
    from: "  const base = Math.max(0, int(level) + RESONANCE_BONUS);\n  return undead ? base * 2 : base;",
    to: "  const lvl = undead ? int(level) * 2 : int(level);\n  return Math.max(0, lvl + RESONANCE_BONUS);",
    breaks: "R-A4 — an undead of level 3 would be worth 11 rather than 16"
  },
  {
    file: D,
    name: "R-A4b an undead is worth no more than anything else",
    from: "  return undead ? base * 2 : base;",
    to: "  return base;",
    breaks: "R-A4 — the printed doubling would do nothing"
  },
  {
    file: D,
    name: "R-B1 the warp measures against what was OWED, not what was healed",
    from: "function resonanceBleedReduction(healed) {",
    to: "function resonanceBleedReduction(healed) {\n  healed = Math.max(Number(healed) || 0, 20);",
    breaks: "R-B4/R-B5 — a heal that went nowhere would still clear four bleed"
  },
  {
    file: D,
    name: "R-B2 the bleed divisor rounds up",
    from: "  return Math.max(0, Math.floor(Math.max(0, int(healed)) / RESONANCE_PER_BLEED));",
    to: "  return Math.max(0, Math.ceil(Math.max(0, int(healed)) / RESONANCE_PER_BLEED));",
    breaks: "R-B2/R-B4 — \"round down\" is printed"
  },
  {
    file: D,
    name: "R-C2 THE RADIUS EXCLUDES ITS OWN EDGE",
    from: "  return int(feet) > r ? `is ${int(feet)} ft away — beyond ${r} ft` : null;",
    to: "  return int(feet) >= r ? `is ${int(feet)} ft away — beyond ${r} ft` : null;",
    breaks: "R-C2 — a corpse at exactly 20 ft would be flagged as too far"
  },
  {
    file: D,
    name: "R-C6 an unmeasured distance becomes an objection",
    from: "  if (feet === null) return null;",
    to: "  if (feet === null) return \"is nowhere the system can measure\";",
    breaks: "R-C6 — every row off a canvas would carry a false reason"
  },
  {
    file: D,
    name: "R-C5 the ordering flips, so being the caster is buried under the distance",
    from: "  if (isSelf) return \"is you — the spell feeds on another's death\";\n  if (!isDead) return \"is not dead\";",
    to: "  if (!isDead) return \"is not dead\";\n  if (isSelf) return \"is you — the spell feeds on another's death\";",
    breaks: "R-C5 — a living caster would be told only that they are not dead"
  },
  {
    file: D,
    name: "R-D2 the card claims the amount owed rather than the amount healed",
    from: "  const short = healed < owed\n    ? ` <em>(of ${owed} owed — ${casterName} had no more to restore)</em>`\n    : \"\";",
    to: "  const short = \"\";",
    breaks: "R-D2 — the interface form of a check that proves the wrong thing"
  },
  {
    file: DW,
    name: "R-F6 THE CORPSE IS HEALED INSTEAD OF THE CASTER",
    from: "  const healed = await healActor(caster, owed);",
    to: "  const healed = await healActor(source, owed);",
    breaks: "R-F6 — the dice would still roll and the card would still print a line"
  },
  {
    file: DW,
    name: "R-F5 the heal bypasses the cap and writes hit points directly",
    from: "  const healed = await healActor(caster, owed);",
    to: "  const hp0 = Number(caster.system?.resources?.hp?.value) || 0;\n  await caster.update({ \"system.resources.hp.value\": hp0 + owed });\n  const healed = owed;",
    breaks: "R-F5 — overhealing past the maximum, silently"
  },
  {
    file: DW,
    /*
     * THE WRONG DESIGN, RESTORED. This is the fifteen-line change that
     * looked right until the stat line was read.
     */
    name: "R-F1 THE HOOK COMES BACK: the spell fires itself on any death",
    from: "function resonanceCandidates(caster) {",
    to: "function registerResonanceHooks() {\n  Hooks.on(\"createActiveEffect\", async (e) => {\n    const { reapDead } = await import(\"../combat/death-state.mjs\");\n    void reapDead;\n  });\n}\n\nfunction resonanceCandidates(caster) {",
    breaks: "R-F1/R-F2 — a Reaction spell that fires without being cast"
  },
  {
    file: DW,
    name: "R-F4 undead is re-decided here instead of asked of the shared rule",
    from: "  const undead = Boolean(isUndead(source.system ?? {}));",
    to: "  const undead = /undead/i.test(String(source.system?.details?.creatureType ?? \"\"));",
    breaks: "R-F4 — a creature could be undead for this spell and not for Turn Undead"
  },
  {
    file: DW,
    name: "R-F3 the dead are found by name rather than by the reaper's own status",
    from: "          isDead: Boolean(actor.statuses?.has?.(\"dead\")),",
    to: "          isDead: /corpse|dead/i.test(String(actor.name ?? \"\")),",
    breaks: "R-F3 — two answers to \"is this creature dead\""
  },
  {
    file: DW,
    name: "R-F7 the distance is measured by hand rather than by geometry.mjs",
    from: "        ? Math.round(Number(distanceBetween(casterToken, token)))",
    to: "        ? Math.round(Math.hypot(token.x - casterToken.x, token.y - casterToken.y) / 20)",
    breaks: "R-F7 — the animated position and a hand-rolled ruler, both already paid for"
  },
  {
    file: E,
    name: "R-E2 the prompt is skipped and the targeted creature assumed",
    from: "          const source = await promptResonanceSource(caster, spell.name);",
    to: "          const source = target;",
    breaks: "R-E2 — several creatures can fall in a round and the spell names one"
  },
  {
    file: C,
    name: "C-R4 ANY PACK IS CONJURABLE, so a typo reaches whatever answers",
    from: "  const pack = text(raw.pack).toLowerCase();\n  if (!CONJURABLE_PACKS.includes(pack)) return null;",
    to: "  const pack = text(raw.pack).toLowerCase() || \"alchemical\";",
    breaks: "C-R4 — a same-named item in the wrong pack is worse than none"
  },
  {
    file: C,
    name: "C-R3 a row naming no item is accepted",
    from: "  const itemName = text(raw.itemName);\n  if (!itemName) return null;",
    to: "  const itemName = text(raw.itemName) || \"Holy Water\";",
    breaks: "C-R3 — every malformed row would silently make holy water"
  },
  {
    file: C,
    name: "C-R5 a quantity of zero is honoured",
    from: "    quantity: Math.max(1, Math.trunc(Number(raw.quantity) || 1)),",
    to: "    quantity: Math.trunc(Number(raw.quantity) || 1),",
    breaks: "C-R5 — a spell that creates nothing and says it created something"
  },
  {
    file: C,
    name: "C-R8 the conjured flask is renamed, so it stacks apart from a bought one",
    from: "  return spec?.itemName ?? \"\";",
    to: "  return `${spec?.itemName ?? \"\"} (conjured)`;",
    breaks: "C-R8/C-P4 — two objects with one name, differing where nobody looks"
  },
  {
    file: C,
    name: "C-D4 a missing pack item is swallowed",
    from: "  return `<em>${spellName} names \"${spec.itemName}\" in the ${spec.pack} compendium and it is not there `\n    + `&mdash; nothing was created. This is a gap in the data, not a rule.</em>`;",
    to: "  return \"\";",
    breaks: "C-D4 — a compendium rename would make the spell silently do nothing"
  },
  {
    file: CW,
    name: "C-E3 THE ITEM IS REBUILT BY HAND rather than copied",
    from: "    const doc = await pack.getDocument(entry._id);\n    if (!doc) return null;\n\n    const data = doc.toObject();",
    to: "    const data = { name: entry.name, type: \"consumable\", system: { quantity: 1 } };",
    breaks: "C-E3 — a Holy Water with no Splash trait and no reagent clause"
  },
  {
    file: C,
    name: "C-D5 THE SILENT NOTHING RETURNS: nobody named means nobody holds it",
    from: "  return caster ? [caster] : [];",
    to: "  return [];",
    breaks: "C-D5 — the PP is spent and no object exists, which is what the drive measured"
  },
  {
    file: C,
    name: "C-D7 a degree-gated row hands the caster a flask its degree never earned",
    from: "  if (gated) return [];",
    to: "  ;",
    breaks: "C-D7 — a save succeeded, so the row should be silent"
  },
  {
    file: C,
    name: "C-D6 the fallback overrides the creature the caster actually targeted",
    from: "  if (named.length) return named;",
    to: "  ;",
    breaks: "C-D6 — the object goes to the caster however carefully you aimed"
  },
  {
    file: E,
    name: "C-E1c EVERY kind falls back to the caster, not just a conjuration",
    from: '    if (effect.kind === "conjureItem") {\n      const held = conjuredItemRecipients(recipients, caster, { gated: isDegreeGated(effect) });',
    to: '    if (true) {\n      const held = conjuredItemRecipients(recipients, caster, { gated: isDegreeGated(effect) });',
    breaks: "C-E1c — a damage row with no targets would hit the caster"
  },
  {
    file: E,
    name: "C-E1d the card claims the fallback fired every time",
    from: "      conjureFellBack = held.length > 0 && recipients.length === 0;",
    to: "      conjureFellBack = held.length > 0;",
    breaks: "C-E1d — a carefully targeted ally is told nobody was targeted"
  },
  {
    file: CW,
    name: "C-E5 the conjured flask is renamed on the way in",
    from: "    data.flags[SYSTEM_ID] = { ...(data.flags[SYSTEM_ID] ?? {}), conjured: true };",
    to: "    data.name = `${data.name} (conjured)`;",
    breaks: "C-E5 — the stack splits and every later reader is misled"
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
  console.error("mutate-pp1-batch: the verifier does not pass BEFORE any mutation");
  process.exit(1);
}

try {
  for (const m of MUTATIONS) {
    const source = originals.get(m.file);
    const occurrences = source.split(m.from).length - 1;
    if (occurrences !== 1) {
      console.error(`mutate-pp1-batch: anchor for "${m.name}" appears ${occurrences} times`);
      process.exit(1);
    }
    if (m.from === m.to) {
      console.error(`mutate-pp1-batch: "${m.name}" changes nothing`);
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
  console.error(`mutate-pp1-batch: ${survivors.length} of ${applied} mutations SURVIVED`);
  for (const s of survivors) console.error(`  ✗ ${s}`);
  process.exit(1);
}
console.log(`mutate-pp1-batch: all ${applied} mutations were caught`);
