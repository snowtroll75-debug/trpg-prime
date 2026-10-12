#!/usr/bin/env node
/**
 * mutate-drive-3622 — can verify-drive-3622 fail?
 *
 * NEW at 3.622.1. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const STI = at("module", "magic", "spell-trait-immunity.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const TR = at("module", "trait-rules.mjs");
const ACTION = at("module", "combat", "action-workflow.mjs");
const CARD = at("module", "dice", "check-card-interactions.mjs");
const TREC = at("module", "combat", "turn-records.mjs");
const TW = at("module", "traits-workflow.mjs");
const COMBAT = at("module", "documents", "combat.mjs");
const MIGRATION = at("module", "migration.mjs");
const MAIN = at("scripts", "trg-prime.mjs");
const SPLASH = at("module", "magic", "splash.mjs");
const BOMB = at("module", "alchemical-workflow.mjs");
const EFFECTS = at("module", "magic", "spell-effects.mjs");
const EVENTS = at("module", "conditions", "condition-events-workflow.mjs");
const CR = at("module", "conditions", "condition-rules.mjs");
const CHECK = at("module", "dice", "check.mjs");
const VERIFY = at("tools", "verify-drive-3622.mjs");

const MUTATIONS = [
  // A — R1
  { file: STI, name: "F1 — THE OLD DEFECT: nobody is immune to a spell", from: "    if (trait) skipped.push(", to: "    if (false) skipped.push(", breaks: "A1" },
  { file: STI, name: "immunity ignores implied traits", from: "  const verdict = immuneToEffect(String(spellTraits ?? \"\"), targetSystem ?? null, creatureTypeSystem);", to: "  const verdict = String(spellTraits ?? \"\").match(/mental/i) ? immuneToEffect(\"Mental\", targetSystem ?? null, creatureTypeSystem) : null;", breaks: "A1/A3" },
  { file: CAST, name: "a targeted spell is never pruned", from: "        if (!immunity.kept.includes(token.actor)) token.setTarget(false, { releaseOthers: false, groupSelection: true });\n", to: "", breaks: "A4" },
  { file: CAST, name: "a cast at only the immune goes ahead", from: "          for (const miss of immunity.skipped) ui.notifications.warn(`${spell.name}: ${miss.reason}.`);\n          return null;", to: "          for (const miss of immunity.skipped) ui.notifications.warn(`${spell.name}: ${miss.reason}.`);", breaks: "A4" },
  { file: CAST, name: "the immune are not named on the card", from: "        kindSkipped = [...kindSkipped, ...immunity.skipped];\n", to: "", breaks: "A4" },
  { file: CAST, name: "an area ignores immunity", from: "        areaTargets = areaImmunity.kept;\n", to: "", breaks: "A6" },
  { file: CAST, name: "an area's immune are not named", from: "kindSkippedText([...kindFiltered.skipped, ...areaImmunity.skipped])", to: "kindSkippedText(kindFiltered.skipped)", breaks: "A6" },
  // B — R2, G3
  { file: TR, name: "F2 — THE OLD DEFECT: a late DC is not raised", from: "  return { dc: Number(entered) + n, note:", to: "  return { dc: Number(entered), note:", breaks: "B1" },
  { file: TR, name: "an Uncommon raise reads Rare", from: "is ${n >= 5 ? \"Rare\" : \"Uncommon\"})`;", to: "is Rare)`;", breaks: "B2" },
  { file: ACTION, name: "the roll never stores the raise", from: "  if (lateRarityRaise) pendingOutcome.rarityRaise = { value: lateRarityRaise, name: targetActor.name };\n", to: "", breaks: "B3" },
  { file: ACTION, name: "a settled DC stores a second raise", from: "  const lateRarityRaise = targetActor && (finalDC === null || finalDC === undefined)\n", to: "  const lateRarityRaise = targetActor\n", breaks: "B3" },
  { file: CARD, name: "Set DC ignores the stored raise", from: "  raw.baseDC = late.dc;", to: "  raw.baseDC = parsed;", breaks: "B4" },
  { file: CARD, name: "a corrected DC stacks a second note", from: "    raw.subtitleBeforeDC = raw.subtitleBeforeDC ?? raw.subtitle ?? \"\";\n", to: "    raw.subtitleBeforeDC = raw.subtitle ?? \"\";\n", breaks: "B4" },
  { file: ACTION, name: "G3 — THE OLD DEFECT: \"No target DC\" beside the GM's DC", from: "      ? `DC ${finalDC}` : (resolved.label ?? \"DC\");", to: "      ? (resolved.label ?? \"DC\") : (resolved.label ?? \"DC\");", breaks: "B5" },
  // C — R3
  { file: CAST, name: "F3 — THE OLD DEFECT: the Light step is not registered", from: "    emanationLive: emanationIsLive(spellData)\n      || Boolean(outcome.cast && (await import(\"../trait-rules.mjs\")).lightTraitDefaultRow(spellData, spell.name)),", to: "    emanationLive: emanationIsLive(spellData),", breaks: "C3" },
  // D — R4
  { file: TREC, name: "F4 — THE OLD DEFECT: an inherited record is only deleted", from: "  if (!isClear(actor.getFlag(SYSTEM_ID, key))) await actor.setFlag(SYSTEM_ID, key, empty);\n", to: "", breaks: "D2" },
  { file: TREC, name: "a clear record is written anyway", from: "  if (isClear(actor.getFlag(SYSTEM_ID, key))) return;\n", to: "", breaks: "D3" },
  { file: TREC, name: "a Word penalty alone counts as clear", from: "  return Object.entries(record).every(([, v]) => !v);", to: "  return Object.entries(record).every(([, v]) => !v || v === true);", breaks: "D1" },
  { file: TW, name: "the turn start deletes as before", from: "  const { clearTraitUsageRecord } = await import(\"./combat/turn-records.mjs\");\n  await clearTraitUsageRecord(actor);", to: "  if (actor?.getFlag?.(SYSTEM_ID, USAGE_FLAG) === undefined) return;\n  await actor.unsetFlag(SYSTEM_ID, USAGE_FLAG);", breaks: "D4" },
  { file: COMBAT, name: "the attack count is deleted as before", from: "      const { clearAttackCount } = await import(\"../combat/turn-records.mjs\");\n      await clearAttackCount(actor);", to: "      await actor.unsetFlag(SYSTEM_ID, \"attackCount\");", breaks: "D4" },
  { file: MIGRATION, name: "the schema is not raised (the pass is unreachable)", from: "export const TRG_SCHEMA_VERSION = \"3.627.1\";", to: "export const TRG_SCHEMA_VERSION = \"3.618.0\";", breaks: "D5" },
  { file: MIGRATION, name: "the repair clears a running fight's records", from: "    if (!actor || fighting.has(actor.uuid)) continue;", to: "    if (!actor) continue;", breaks: "D6" },
  { file: MIGRATION, name: "the repair clears nothing", from: "    if (!stale) continue;", to: "    if (true) continue;", breaks: "D6" },
  // E — R6
  { file: TREC, name: "F6 — THE OLD DEFECT: the end of a combat clears nothing", from: "        await clearAttackCount(actor);\n        await clearTraitUsageRecord(actor);", to: "        await clearTraitUsageRecord(actor);", breaks: "E2" },
  { file: TREC, name: "every client clears", from: "    if (!game.user?.isGM) return;\n", to: "", breaks: "E2" },
  { file: MAIN, name: "the hook is never registered", from: "  registerTurnRecordHooks();\n", to: "", breaks: "E3" },
  // F — R5
  { file: SPLASH, name: "F5 — THE OLD DEFECT: dice splash is not recognised", from: "  return /^\\s*\\d*\\s*d\\s*\\d+(\\s*[+-]\\s*\\d+)?\\s*$/i.test(String(value ?? \"\"));", to: "  return false;", breaks: "F1" },
  { file: BOMB, name: "the dice splash is never rolled", from: "    splash = Math.max(0, Math.trunc(Number(rolledSplash.total) || 0));\n", to: "", breaks: "F3" },
  { file: BOMB, name: "the target's share reads the printed field", from: "      const splashOnTarget = splashOnHit(splashAmount(splash), critical?.severity ?? null);", to: "      const splashOnTarget = splashOnHit(splashAmount(profile.splash), critical?.severity ?? null);", breaks: "F4" },
  { file: BOMB, name: "the scatter reads the printed field", from: "  } else if (hasSplash(splash) && distance !== null) {", to: "  } else if (hasSplash(profile.splash) && distance !== null) {", breaks: "F4" },
  { file: BOMB, name: "a flask with no splash claims one", from: "    lines.push(line(`<em>A miss — the flask breaks off target. ${item.name} has no splash.</em>`));", to: "    lines.push(line(\"<em>A miss — the flask still breaks, and the splash still lands.</em>\"));", breaks: "F5" },
  // G — cosmetic
  { file: EFFECTS, name: "G1 — THE OLD DEFECT: natural armour by its key", from: "  if (effect.slot === \"naturalArmourFlat\" || effect.slot === \"naturalArmourBase\") {", to: "  if (false) {", breaks: "G1" },
  { file: EVENTS, name: "G2 — \"a Auditory\"", from: "flat check for ${/^[aeiou]/i.test(String(spec.trait)) ? \"an\" : \"a\"} ${spec.trait} action.", to: "flat check for a ${spec.trait} action.", breaks: "G2" },
  { file: CR, name: "G4 — THE OLD DEFECT: a sense fumble keeps its margin", from: "  return autoFailedOutcome(outcome, { by: SENSE_FUMBLE_BY, condition });", to: "  return { ...outcome, degree: { key: \"fumble\" }, autoFailed: { condition } };", breaks: "G4" },
  { file: CHECK, name: "the check ignores the rewrite", from: "      return senseFumbleOutcome(outcome, this.senseFumble);", to: "      return { ...outcome, autoFailed: { condition: this.senseFumble } };", breaks: "G4" },
  { file: CAST, name: "G5 — THE OLD DEFECT: a Secret result is public", from: "    await postCard(actor, `${spell.name} — Result`, lines, cardRolls, { whisper: gms });", to: "    await postCard(actor, `${spell.name} — Result`, lines, cardRolls);", breaks: "G5" },
  { file: CAST, name: "R7 — the electricity card says nothing of applying it", from: "          + `<p style=\"margin:2px 0\"><em>Apply by hand: the spell below resolves as it was aimed. Move its effect to `", to: "          + `<p style=\"margin:2px 0\"><em>Move its effect to `", breaks: "G6" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-drive-3622: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-drive-3622: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-drive-3622: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
