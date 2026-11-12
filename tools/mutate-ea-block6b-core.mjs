#!/usr/bin/env node
/** mutate-ea-block6b-core — the mutation half of verify-ea-block6b-core. NEW at 3.684.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const FRM = m("magic", "fumble-resonance-modifiers.mjs"), CW = m("magic", "cast-workflow.mjs"), CIR = m("charged-item-rules.mjs"),
  CIW = m("charged-items-workflow.mjs"), CI = m("charged-items.mjs"), CUW = m("consumable-use-workflow.mjs"), MIW = m("magic-items-workflow.mjs"),
  SS = m("magic", "spell-storing.mjs"), SSW = m("magic", "spell-storing-workflow.mjs"), SEF = m("magic", "spell-effects.mjs"),
  CRS = m("magic", "cast-reaction-shape.mjs"), CRSW = m("magic", "cast-reaction-shape-workflow.mjs"), RW = m("reactions", "reactions-workflow.mjs"),
  PCS = m("magic", "pending-cast-steps.mjs"), PCW = m("magic", "pending-cast-workflow.mjs"), DYW = m("combat", "dying-workflow.mjs"),
  API = m("module-api.mjs"), SA = m("magic", "spell-availability.mjs"), SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs"),
  FRMX = FRM;
const MUTATIONS = [
  // F — G5, the fumble and Resonance rolls
  { name: "advantage and disadvantage do not cancel", file: FRM, from: "  if (adv && dis) return \"normal\";\n", to: "", breaks: "F1/F3" },
  { name: "a disadvantage keeps the lower percentile", file: FRM, from: "  if (bias === \"disadvantage\") return Math.max(a, b);", to: "  if (bias === \"disadvantage\") return Math.min(a, b);", breaks: "F2" },
  { name: "THE RULING (Q147): High Magic Resonance's single roll lifts nothing", file: FRM, from: "    highMagic && !single ? \"disadvantage\" : \"\",", to: "    highMagic ? \"disadvantage\" : \"\",", breaks: "F3" },
  { name: "a throwing fumble modifier stops the roll", file: FRM, from: "      console.error(`TRG Prime | a module's fumble modifier \"${key}\" failed`, err);", to: "      throw err;", breaks: "F4" },
  { name: "a cast's own fumbleBias is ignored", file: FRM, from: "  const biases = [cleanBias(ctx?.cast?.fumbleBias)];", to: "  const biases = [];", breaks: "F4/F4d" },
  { name: "a forced Resonance answered `true` is dropped", file: FRM, from: "      if (answer === true) out.push({ key, reason: key, line: \"\" });\n", to: "", breaks: "F6" },
  { name: "the module's fumble modifier is not added", file: CW, from: "    + featureFumbleMod + highMagicMod + moduleFumble.modifier;", to: "    + featureFumbleMod + highMagicMod;", breaks: "F9b" },
  { name: "THE CONTRACT (G1 ↔ G5): the rolls are not told the metamagic taken", file: CW, from: "      spell, metamagic: castMetamagic.keys, castOptions: castOptionsApplied.keys,", to: "      spell, metamagic: [], castOptions: castOptionsApplied.keys,", breaks: "F11" },
  { name: "a forced Resonance is never rolled", file: CW, from: "    for (const event of forced) {", to: "    for (const event of []) {", breaks: "F12" },
  { name: "a release's fumble does not say which check", file: CIW, from: "      check: { type: option.skill ? \"skill\" : \"spellcraft\", skill: option.skill ?? \"\" },\n", to: "", breaks: "F13" },
  { name: "an empty Resonance modifier is accepted", file: API, from: "  if (!k || (!roll && !force)) {", to: "  if (!k) {", breaks: "F7" },
  // C — G6, the charged items
  { name: "Resonant Conduit's free activation is charged", file: CIR, from: "  if (list.some((a) => a.free === true)) return { pp: 0, due: owed, free: true, cut: owed, labels };\n", to: "", breaks: "C2" },
  { name: "a minimum above the price is a surcharge", file: CIR, from: "  const floor = Math.min(owed, Math.max(0, ...list.map((a) => Math.max(0, int(a.minimum)))));", to: "  const floor = Math.max(0, ...list.map((a) => Math.max(0, int(a.minimum))));", breaks: "C2" },
  { name: "THE RULING (Q131): depletion's disadvantage keeps the higher d100", file: CIR, from: "  if (bias === \"disadvantage\") return Math.min(a, b);", to: "  if (bias === \"disadvantage\") return Math.max(a, b);", breaks: "C5" },
  { name: "THE RULING (Q130): the item's metamagic ceiling is not doubled", file: CIR, from: "  const ceiling = given.length ? Math.max(...given) : 2 * Math.max(0, int(releasePP));", to: "  const ceiling = given.length ? Math.max(...given) : Math.max(0, int(releasePP));", breaks: "C4" },
  { name: "the wield limit can fall below one", file: CIR, from: "  return Math.max(1, ...(Array.isArray(answers) ? answers : []).map(int));", to: "  return Math.max(0, ...(Array.isArray(answers) ? answers : []).map(int));", breaks: "C1" },
  { name: "the spend path asks no onRelease", file: CIW, from: "  lines.push(...(await chargedItemReleased(actor, item, { kind, reason, degree, ppSpent: cost.pp, paidBy: \"item\" })));\n", to: "", breaks: "C9" },
  { name: "the rules' cut is not paid", file: CIW, from: "  const after = before - cost.pp;", to: "  const after = before - due;", breaks: "C9" },
  { name: "THE CONTRACT (G6 → G1): the item's cast is not told itemMetamagic", file: CIW, from: "      ...(itemMetamagic.allowed ? { itemMetamagic: true, itemMetamagicCeiling: itemMetamagic.ceiling } : {})", to: "      ...({})", breaks: "C12" },
  { name: "releaseItemSpell drops itemMetamagic", file: CUW, from: "    ...(itemMetamagic === true ? { itemMetamagic: true, itemMetamagicCeiling:", to: "    ...(false ? { itemMetamagic: true, itemMetamagicCeiling:", breaks: "C12" },
  { name: "Weave Infusion's depletion is rolled without its disadvantage", file: CIW, from: "await rollItemDepletion(actor, item, { bias: ownPayment.depletionBias });", to: "await rollItemDepletion(actor, item);", breaks: "C11" },
  { name: "depletion keeps the first d100 whatever the bias", file: MIW, from: "  const kept = second ? depletionKept(roll.total, second.total, bias) : roll.total;", to: "  const kept = roll.total;", breaks: "C15" },
  { name: "the warning ignores the wield limit", file: CI, from: "  if (held.length <= most) return [];", to: "  if (held.length <= 1) return [];", breaks: "C8" },
  { name: "the sheet's warning ignores the rules", file: CIW, from: "    chargedWieldLimitFor(actor)\n", to: "    1\n", breaks: "C16" },
  // S — G16, the spell store
  { name: "any host name is believed", file: SS, from: "  return SPELL_STORE_HOSTS.includes(v) ? v : \"arcaneBond\";", to: "  return v || \"arcaneBond\";", breaks: "S1" },
  { name: "THE FIX REVERTED: a spell cannot host its own store", file: SS, from: "  if (kind === \"spell\") return text(spellId) ? (list.find((i) => i?.id === text(spellId)) ?? null) : null;\n", to: "", breaks: "S2/S3" },
  { name: "an open window's host is ignored", file: SS, from: "  if (text(hostId)) return list.find((i) => i?.id === text(hostId)) ?? null;\n", to: "", breaks: "S2" },
  { name: "an absorbed spell's copy outlives its store", file: SSW, from: "  if (copy?.getFlag?.(SYSTEM_ID, STORED_FOREIGN_FLAG)) await copy.delete().catch(() => {});", to: "", breaks: "S8/S8b" },
  { name: "storeSpell ignores the host", file: SSW, from: "  const item = host ?? bondedItemFor(actor);\n  if (!item) return null;\n  const displaced", to: "  const item = bondedItemFor(actor);\n  if (!item) return null;\n  const displaced", breaks: "S7" },
  { name: "readStored looks only in the bond", file: SSW, from: "    if (held) return { item: other, record: held };\n", to: "", breaks: "S7" },
  { name: "THE FIX REVERTED: Storing Rune asks only the Arcane Bond", file: SEF, from: "          const bond = byBond ? bondedItemFor(target) : spellStoreHostFor(target, { host: spec.host, spellId: spell.id });", to: "          const bond = bondedItemFor(target);", breaks: "S9" },
  { name: "an absorbed spell settles the storer's PP", file: CW, from: "    if (settle.owed !== 0 && !stored.foreign) {", to: "    if (settle.owed !== 0) {", breaks: "S11" },
  { name: "the settled hook does not mark a stored release", file: CW, from: "    stored: Boolean(stored), storedForeign: Boolean(stored?.foreign),\n    refunded:", to: "    refunded:", breaks: "S12" },
  // S (review, 3.684.0) — the stores kept apart; an absorbed copy cleaned
  { name: "REVIEW FIX REVERTED: Spell Storing's bond branch reads the fallback", file: SEF, from: "          const already = readStoredIn(bond);", to: "          const already = byBond ? (await import(\"./spell-storing-workflow.mjs\")).readStored(target) : readStoredIn(bond);", breaks: "S15b" },
  { name: "the store list skips the rune", file: SSW, from: "    if (other === bond) continue;", to: "    if (other === bond || true) continue;", breaks: "S16" },
  { name: "Release ignores its host", file: SSW, from: "  const held = named ? readStoredIn(actor?.items?.get?.(named) ?? null) : readStored(actor);", to: "  const held = readStored(actor);", breaks: "S16b" },
  { name: "the sheet's Release names no host", file: SHEET, from: "    await releaseStoredSpell(this.actor, { hostId: target?.dataset?.hostId ?? \"\" });", to: "    await releaseStoredSpell(this.actor);", breaks: "S16c" },
  { name: "REVIEW FIX REVERTED: the absorbed copy keeps its caster's flags", file: SS, from: "  for (const key of FOREIGN_COPY_STRIPPED_FLAGS) delete ours[key];", to: "", breaks: "S17" },
  { name: "the absorbed copy stays innate", file: SS, from: "    if (key in data.system) data.system[key] = false;", to: "", breaks: "S17" },
  { name: "an absorbed copy can be refused after its record is cleared", file: SA, from: "  if (flag(item, \"storedForeign\")) return null;\n", to: "", breaks: "S17b" },
  { name: "storeForeignSpell copies as-is", file: SSW, from: "  const raw = foreignSpellCopyData(", to: "  const raw = ((x) => x)(", breaks: "S17c" },
  // F (review) — a stored release, told to the fumble and the force
  { name: "the cast's facts never say an absorbed release", file: FRMX, from: "    storedForeign: Boolean(stored) && Boolean(storedForeign)", to: "    storedForeign: false", breaks: "F15" },
  { name: "the force ctx is not told a stored release", file: CW, from: "      stored: Boolean(stored), storedForeign: Boolean(stored?.foreign),\n      metamagic: resonanceContext.cast?.metamagic", to: "      metamagic: resonanceContext.cast?.metamagic", breaks: "F15b" },
  { name: "the fumble ctx is not told a stored release", file: CW, from: "    stored: Boolean(castOf?.stored), storedForeign: Boolean(castOf?.storedForeign),\n", to: "", breaks: "F15b" },
  // R — G17, a cast reaction that shapes the cast
  { name: "the dice count can fall to 0", file: CRS, from: "    return `${Math.max(1, Math.floor(n * f))}d${faces}`;", to: "    return `${Math.floor(n * f)}d${faces}`;", breaks: "R2" },
  { name: "THE RULING (Q118): the area is not rounded down to 5 ft", file: CRS, from: "  const to = Math.max(5, Math.floor((from * f) / 5) * 5);", to: "  const to = Math.max(5, Math.floor(from * f));", breaks: "R3" },
  { name: "a half minute is not counted in rounds", file: CRS, from: "  while (!Number.isInteger(scaled) && at > 0) {", to: "  while (false) {", breaks: "R4" },
  { name: "the last scale answered holds, not the first", file: CRS, from: "    if (s !== 1) { if (scale === 1) scale = s; else ignored += 1; }", to: "    if (s !== 1) { scale = s; }", breaks: "R1" },
  { name: "castReactionsFor does not return the shape", file: RW, from: "  return { stop: false, lines, scale: shape.scale, saveBias: shape.saveBias, retargetCaster: shape.retargetCaster, exclude: shape.exclude, turnBack: shape.turnBack };", to: "  return { stop: false, lines, ...none };", breaks: "R6" },
  { name: "the saves' bias is applied though a variable was scaled", file: CRSW, from: "  if (reacted.saveBias && !(scale !== 1 && variables.any)) {", to: "  if (reacted.saveBias) {", breaks: "R7" },
  { name: "the halved targets are not cut", file: CRSW, from: "        setUserTargets(kept);\n", to: "", breaks: "R7" },
  { name: "the spell save ignores the reaction's bias", file: CW, from: "      ...([\"advantage\", \"disadvantage\"].includes(warpMods?.saveBias) ? { bias: warpMods.saveBias } : {}),\n", to: "", breaks: "R11" },
  { name: "the cast never applies a shape", file: CW, from: "    else if ((reacted.scale ?? 1) !== 1 || reacted.saveBias || reacted.retargetCaster || reacted.turnBack || reacted.exclude?.length) {", to: "    else if (false) {", breaks: "R10" },
  // P — G26, a step before an interruption settles
  { name: "a stale damage source is believed", file: PCS, from: "  if (!note || (Number(now) || 0) - note.at > within) return", to: "  if (!note) return", breaks: "P1" },
  { name: "a step's lines are lost", file: PCS, from: "        if (typeof text === \"string\" && text.trim()) lines.push(text.trim());", to: "", breaks: "P2" },
  { name: "the steps are not awaited before the window settles", file: PCW, from: "    stepLines = await pendingCastStepsBefore({", to: "    stepLines = [] && ({", breaks: "P4" },
  { name: "the damage primitive notes no source", file: DYW, from: "    noteDamageSource(actor, { sourceUuid, sourceName, context });\n", to: "", breaks: "P5" },
  { name: "a step that is not a function is accepted", file: API, from: "  if (!k || typeof step !== \"function\") { problem(`registerPendingCastStep:", to: "  if (!k) { problem(`registerPendingCastStep:", breaks: "P3" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block6b-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block6b-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-ea-block6b-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block6b-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
