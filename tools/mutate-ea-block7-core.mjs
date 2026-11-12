#!/usr/bin/env node
/** mutate-ea-block7-core — the mutation half of verify-ea-block7-core. NEW at 3.685.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const TH = m("magic", "thorns.mjs"), TW = m("magic", "thorns-workflow.mjs"), SE = m("magic", "spell-effects.mjs"), CL = m("magic", "caster-level-mods.mjs"),
  CW = m("magic", "cast-workflow.mjs"), TL = m("magic", "turn-ladder.mjs"), TLW = m("magic", "turn-ladder-workflow.mjs"), EC = m("magic", "entry-check.mjs"),
  ECW = m("magic", "entry-check-workflow.mjs"), CB = m("documents", "combat.mjs"), GS = m("combat", "granted-speeds.mjs"), RS = m("magic", "cast-reaction-shape.mjs"),
  RSW = m("magic", "cast-reaction-shape-workflow.mjs"), RW = m("reactions", "reactions-workflow.mjs"), RR = m("reactions", "reactions.mjs"),
  AW = m("combat", "attack-workflow.mjs"), CS = m("combat", "critical-severity.mjs"), API = m("module-api.mjs"), GT = m("magic", "spell-check-gates.mjs"),
  CZ = m("magic", "casting-zone.mjs"), LM = m("magic", "lent-metamagic.mjs"), MMW = m("magic", "module-metamagic-workflow.mjs"), SR = m("magic", "strike-riders.mjs"),
  HE = m("magic", "heal-ends.mjs"), CE = m("conditions", "condition-events-workflow.mjs"), DM = m("combat", "dispel-modifiers.mjs"),
  GD = m("combat", "granted-defences.mjs"), CT = m("creature-traits.mjs"), ARL = m("magic", "area-region-life.mjs"), ACW = m("combat", "action-workflow.mjs");
const MUTATIONS = [
  // H1
  { name: "H1 a spell's thorns never take the cast's DC", file: TH, from: "  if (out.saveRoll?.dcFrom === \"spell\" && Number(saveDC) > 0) out.saveRoll.dc = Math.trunc(Number(saveDC));", to: "", breaks: "H1" },
  { name: "H1 the caster-level bonus has no maximum", file: TH, from: "    const add = Math.min(Math.max(0, Math.trunc(Number(casterLevel) || 0)), out.casterLevelBonus.max);", to: "    const add = Math.max(0, Math.trunc(Number(casterLevel) || 0));", breaks: "H1" },
  { name: "H1 the bonus is stamped every time it is read", file: TH, from: "    out.casterLevelStamped = true;\n  }", to: "  }", breaks: "H1" },
  { name: "H1 a missing rung is unaffected (not m42)", file: TH, from: "  const at = ladderDegree(spec.ladder, degree);", to: "  const at = Object.prototype.hasOwnProperty.call(spec.ladder, degree) ? degree : null;", breaks: "H1b" },
  { name: "H1 a ladder without a save is accepted", file: TH, from: "  if (ladder && !rolledSave) return null;", to: "", breaks: "H1b" },
  { name: "H1 THE ROUND TRIP: a normalised save is lost on reading", file: TH, from: "    : raw.saveRoll && typeof raw.saveRoll === \"object\" ? raw.saveRoll : null;", to: "    : null;", breaks: "H1/H1c" },
  { name: "H1 the cast stamps nothing", file: SE, from: "            saveDC: Number(saveDC ?? rollData?.saveDC ?? 0) || 0,\n            casterLevel:", to: "            saveDC: 0,\n            casterLevel:", breaks: "H1d" },
  { name: "H1 a ladder is rolled as damage", file: TW, from: "    if (spec.ladder && !spec.damage) {", to: "    if (false) {", breaks: "H1d" },
  // H2
  { name: "H2 a step adds once, not per step", file: CL, from: "        if (dice) add[field] = `${Number(dice[1]) * steps}d${dice[2]}`;", to: "        if (dice) add[field] = `${Number(dice[1])}d${dice[2]}`;", breaks: "H2" },
  { name: "H2 a row is written in place", file: CL, from: "      next = next === row ? { ...row } : next;", to: "      next = row;", breaks: "H2" },
  { name: "H2 a negative value shrinks", file: CL, from: "        if (typeof by === \"number\") next[field] = (Number(next[field]) || 0) + (Number(next[field]) < 0 ? -by : by);", to: "        if (typeof by === \"number\") next[field] = (Number(next[field]) || 0) + by;", breaks: "H2b" },
  { name: "H2 a match ignores the label", file: CL, from: "  if (match.label !== undefined && low(row.label) !== low(match.label)) return false;", to: "", breaks: "H2b" },
  { name: "H2 the duration does not grow", file: CL, from: "  const n = Number(m[1]) + Number(duration.amount);", to: "  const n = Number(m[1]);", breaks: "H2c" },
  { name: "H2 the cast passes the printed rows", file: CW, from: "        .filter((r) => !(selfShapeBlocked && r?.target === \"self\")), clMods),", to: "        .filter((r) => !(selfShapeBlocked && r?.target === \"self\")), null),", breaks: "H2e" },
  // H3
  { name: "H3 m100: a better result replaces a worse", file: TL, from: "  const apply = spec?.replace === \"worse\" ? worse : true;", to: "  const apply = true;", breaks: "H3" },
  { name: "H3 m100: a failed creature saves again", file: TL, from: "  return !(lower(previous) === spec.stopAt || degreeWorse(previous, spec.stopAt));", to: "  return true;", breaks: "H3" },
  { name: "H3 Q156: a new result does not replace the old", file: TL, from: "    replaceOld: apply && Boolean(previous),", to: "    replaceOld: false,", breaks: "H3/H3b" },
  { name: "H3 a Critical does not end the spell", file: TL, from: "    endsSpell: apply && Boolean(rung?.endsSpell),", to: "    endsSpell: false,", breaks: "H3b" },
  { name: "H3 entry checks forget atTurnStart", file: EC, from: "  if (raw.atTurnStart === true) out.atTurnStart = true;", to: "", breaks: "H3d" },
  { name: "H3 a turn's start pushes back", file: ECW, from: "  if (outcome.pushBack && !atTurnStart) {", to: "  if (outcome.pushBack) {", breaks: "H3e" },
  { name: "H3 the turn-start pass skips the ladders", file: CB, from: "      await applyTurnStartEntryChecks(actor, combatant.token?.object ?? null);\n", to: "", breaks: "H3e" },
  { name: "H3 the replace deletes the marker too", file: TLW, from: "e?.flags?.[SYSTEM_ID]?.castId === castId && !e?.flags?.[SYSTEM_ID]?.[TURN_LADDER_FLAG]);", to: "e?.flags?.[SYSTEM_ID]?.castId === castId);", breaks: "H3g" },
  { name: "H3 the Region is not claimed", file: ARL, from: "  \"turnLadder\"\n]);", to: "]);", breaks: "H3f/H3f2" },
  // H4
  { name: "H4 land + N reads N alone", file: GS, from: "  if (Number(grant.landPlus) > 0) return land + Math.trunc(Number(grant.landPlus));", to: "  if (Number(grant.landPlus) > 0) return Math.trunc(Number(grant.landPlus));", breaks: "H4" },
  { name: "H4 landPlus is dropped", file: GS, from: "  if (plus > 0 && !landFraction) return { key, feet: 0, orLand: true, landPlus: plus };", to: "", breaks: "H4" },
  // H5
  { name: "H5 a second turnBack overrides the first", file: RS, from: "    if (t) { if (!turnBack) turnBack = t; else ignored += 1; }", to: "    if (t) { turnBack = t; }", breaks: "H5" },
  { name: "H5 exclusions repeat", file: RS, from: "      if (u && !exclude.includes(u)) exclude.push(u);", to: "      if (u) exclude.push(u);", breaks: "H5" },
  { name: "H5 the collector drops exclusions", file: RW, from: "retargetCaster: shape.retargetCaster, exclude: shape.exclude, turnBack: shape.turnBack };", to: "retargetCaster: shape.retargetCaster, exclude: [], turnBack: shape.turnBack };", breaks: "H5c" },
  { name: "H5 an excluded creature stays targeted", file: RSW, from: "    if (kept.length !== before.length) setUserTargets(kept);", to: "", breaks: "H5d" },
  { name: "H5 a turnBack keeps the old targets", file: RSW, from: "      setUserTargets([token]);\n      lines.push(`<strong>${name} is turned back on ${token.name}", to: "      lines.push(`<strong>${name} is turned back on ${token.name}", breaks: "H5d" },
  { name: "H5 the reactions are told no Save DC", file: CW, from: "      saveDC: (await assembleCastSaveDC({", to: "      saveDCPreview: (await assembleCastSaveDC({", breaks: "H5e" },
  { name: "H5 the preview spends Harmonize", file: CW, from: "    if (consume && harmonyRecord && actor.unsetFlag)", to: "    if (harmonyRecord && actor.unsetFlag)", breaks: "H5e" },
  { name: "H5 the attack ignores a turned-back check", file: CW, from: "      ? { ...assembled, total: Math.trunc(Number(turned)) }", to: "      ? assembled", breaks: "H5e" },
  // H6
  { name: "H6 a missed hit keeps its critical", file: RR, from: "  return { ...outcome, hits: false, critical: null, forgiven", to: "  return { ...outcome, hits: false, forgiven", breaks: "H6" },
  { name: "H6 a miss answer is ignored", file: RW, from: "    if (out?.miss === true && type === \"attack\" && succeeded) {", to: "    if (false) {", breaks: "H6b" },
  { name: "H6 the Strike ignores it", file: AW, from: "      outcome = missedByReaction(outcome);\n      reactionDetailLines.push", to: "      reactionDetailLines.push", breaks: "H6c" },
  // H7
  { name: "H7 lowering reads the dice as rolled every time", file: CS, from: "  if (READINGS[at] === \"advantage\") { tens = Math.max(first, second); unit = Math.min(first, second); }", to: "", breaks: "H7" },
  { name: "H7 below Minor is still an injury", file: CS, from: "  if (sevFrom >= 0 ? sevFrom + n >= SEVERITIES.length : (from < 0 ? 1 : from) + n >= READINGS.length) return { none: true, steps: n };", to: "", breaks: "H7/V1" },
  { name: "H7 an after-only registration is refused", file: API, from: "  const after = typeof offer === \"object\" && typeof offer?.after === \"function\" ? offer.after : null;", to: "  const after = null;", breaks: "H7b" },
  { name: "H7 the injury roll asks no one after", file: AW, from: "    const lowered = await criticalAfterReactionsFor({", to: "    const lowered = { steps: 0, lines: [] } || ({", breaks: "H7c" },
  // H8
  { name: "H8 a gate's disadvantage is dropped", file: GT, from: "  return { modifiers, lines, disadvantage: out.disadvantage === true, innateCheck: out.innateCheck === true };", to: "  return { modifiers, lines, disadvantage: false, innateCheck: out.innateCheck === true };", breaks: "H8" },
  { name: "H8 the innate DC rounds up", file: GT, from: "  return { dc: 10 + Math.floor(p * 1.5),", to: "  return { dc: 10 + Math.ceil(p * 1.5),", breaks: "H8c" },
  { name: "H8 two zones add", file: CZ, from: "    if (zone.concentrationDC > best.value) best = { value: zone.concentrationDC, label: zone.label };", to: "    best = { value: best.value + zone.concentrationDC, label: zone.label };", breaks: "H8d" },
  { name: "H8 the zone exempts no one", file: CZ, from: "    if (!zone || zone.exempt.includes(String(actorUuid ?? \"\"))) continue;", to: "    if (!zone) continue;", breaks: "H8d" },
  { name: "H8 an innate cast ignores the gate", file: CW, from: "  if (isInnate && !isItemCast && !ritual && !threaded && gated.innateCheck) {", to: "  if (false) {", breaks: "H8e" },
  // H9
  { name: "H9 half rounds up", file: LM, from: "  if (factor === 0.5) return Math.max(0, Math.floor(n / 2));", to: "  if (factor === 0.5) return Math.ceil(n / 2);", breaks: "H9/H9c" },
  { name: "H9 once a round is never spent", file: LM, from: "      out.push({ ...spec, effectId: String(effect.id ?? \"\"), used: Boolean(roundKey) && usedAt === roundKey });", to: "      out.push({ ...spec, effectId: String(effect.id ?? \"\"), used: false });", breaks: "H9b" },
  { name: "H9 a lent module option is not opened", file: MMW, from: "  for (const l of lent) if (!granted.includes(l.key)) granted.push(l.key);", to: "", breaks: "H9d/H9e" },
  { name: "H9 Q162: the free PP never reach the Save DC", file: CW, from: "    const savePP = heightenedSavePP(totalPP + freeWarpSaveDCPP, cap,", to: "    const savePP = heightenedSavePP(totalPP, cap,", breaks: "H9f" },
  // H10
  { name: "H10 a replacing rider is also a packet", file: SR, from: "    .filter((spec) => !spec?.replacesDamage)\n", to: "", breaks: "H10" },
  { name: "H10 the replacement ignores the rider's scope", file: SR, from: "    if (!spec?.replacesDamage || !riderAppliesTo(spec, weapon)) continue;", to: "    if (!spec?.replacesDamage) continue;", breaks: "H10" },
  { name: "H10 the Strike keeps the weapon's damage", file: AW, from: "      damageOverride = replacing.dice;\n", to: "", breaks: "H10d" },
  // H11
  { name: "H11 any change ends it", file: HE, from: "  if (!Number.isFinite(was) || !Number.isFinite(now) || !(now > was)) return [];", to: "  if (!Number.isFinite(was) || !Number.isFinite(now) || now === was) return [];", breaks: "H11" },
  { name: "H11 the HP hook is not wired", file: CE, from: "          if (ended.length) await actor.deleteEmbeddedDocuments(\"ActiveEffect\", ended).catch(() => {});", to: "", breaks: "H11c" },
  // REVIEW (3.685.0)
  { name: "V1 THE REVIEW'S DEFECT: an over-shifted reading is no injury", file: CS, from: "  if (sevFrom >= 0 ? sevFrom + n >= SEVERITIES.length : (from < 0 ? 1 : from) + n >= READINGS.length) return { none: true, steps: n };", to: "  if ((from < 0 ? 1 : from) + n >= READINGS.length || (sevFrom >= 0 && sevFrom + n >= SEVERITIES.length)) return { none: true, steps: n };", breaks: "V1" },
  { name: "V1 the reading runs off the end", file: CS, from: "  const at = Math.min(READINGS.length - 1, (from < 0 ? 1 : from) + n);", to: "  const at = (from < 0 ? 1 : from) + n;", breaks: "V1" },
  { name: "V2 THE REVIEW'S DEFECT: a flat term swallows the bonus", file: TH, from: "        const sum = (flat[2] === \"-\" ? -Number(flat[3]) : Number(flat[3])) + add;", to: "        const sum = (flat[2] === \"-\" ? -Number(flat[3]) : Number(flat[3]));", breaks: "V2" },
  { name: "V2 a flat damage takes no bonus", file: TH, from: "      if (/^\\d+$/.test(out.damage)) out.damage = String(Number(out.damage) + add);", to: "      if (/^\\d+$/.test(out.damage)) out.damage = String(Number(out.damage));", breaks: "V2" },
  { name: "V3 an area names creatures by actor uuid alone", file: RS, from: "    : (a) => [a?.uuid, a?.token?.uuid, a?.parent?.uuid, ", to: "    : (a) => [a?.uuid, ", breaks: "V3" },
  { name: "V4 the Save line credits Heighten again", file: CW, from: "savePP !== totalPP + freeWarpSaveDCPP ? ` (Heighten Spell", to: "savePP !== totalPP ? ` (Heighten Spell", breaks: "V4" },
  { name: "V5 a turn's start spares no one hostile-only", file: ECW, from: "      if (spec.hostileOnly && !(await entryHostileHolds(raw, tokenDocument))) continue;\n      if (spec.oncePerRound && roundKey && !(await entryFirstThisRound(mover, region, roundKey))) continue;\n      await rollEntryCheckFor({ tokenDocument, mover, region, spec, raw, now: Number(game.time?.worldTime ?? 0), turnKey, atTurnStart: true });", to: "      if (spec.oncePerRound && roundKey && !(await entryFirstThisRound(mover, region, roundKey))) continue;\n      await rollEntryCheckFor({ tokenDocument, mover, region, spec, raw, now: Number(game.time?.worldTime ?? 0), turnKey, atTurnStart: true });", breaks: "V5" },
  { name: "V5 a turn's start rolls every time in a round", file: ECW, from: "      if (spec.oncePerRound && roundKey && !(await entryFirstThisRound(mover, region, roundKey))) continue;\n      await rollEntryCheckFor({ tokenDocument, mover, region, spec, raw, now: Number(game.time?.worldTime ?? 0), turnKey, atTurnStart: true });", to: "      await rollEntryCheckFor({ tokenDocument, mover, region, spec, raw, now: Number(game.time?.worldTime ?? 0), turnKey, atTurnStart: true });", breaks: "V5" },
  { name: "V5 a turn's start forgets a Critical", file: ECW, from: "      // THE SAME FILTERS AS ON MOVEMENT (3.685.0, review).\n      if (entryClearedThisTurn(mover, region, turnKey)) continue;\n", to: "      // THE SAME FILTERS AS ON MOVEMENT (3.685.0, review).\n", breaks: "V5" },
  { name: "H6a a reaction-made miss keeps Weapon Supremacy", file: RR, from: "critical: null, forgiven: false, glancing: false, autoHit: false, missedByReaction: true };", to: "critical: null, missedByReaction: true };", breaks: "H6/H6a" },
  { name: "H10e the replacement is asked with no facts", file: m("magic", "strike-riders-workflow.mjs"), from: "    { ...ctx, used: actor?.getFlag?.(SYSTEM_ID, STRIKE_RIDERS_USED_FLAG) ?? {} });\n}\n\nexport function strikeRiderPackets", to: "    { used: actor?.getFlag?.(SYSTEM_ID, STRIKE_RIDERS_USED_FLAG) ?? {} });\n}\n\nexport function strikeRiderPackets", breaks: "H10e" },
  { name: "H10f THE REVIEW'S DEFECT: a rider the override beat is spent", file: m("magic", "strike-riders-workflow.mjs"), from: "    if (Array.isArray(ctx?.keepRiderIds) && ctx.keepRiderIds.includes(String(effectId))) continue;\n", to: "", breaks: "H10f" },
  { name: "H10d the Strike forgets the discarded rider", file: AW, from: "      ...(discardedReplacement ? { keepRiderIds: [discardedReplacement] } : {})\n", to: "", breaks: "H10d" },
  // H10 flat (Graham, Spirit Arrow: "Flat 6d6")
  { name: "H10g a flat replacing rider is read as a flat amount", file: SR, from: "  const replaceFlat = raw.replacesDamage === true && raw.flat === true && !weaponDie;", to: "  const replaceFlat = false;", breaks: "H10g" },
  { name: "H10g the replacement forgets it is flat", file: SR, from: "    if (replaceFlat) out.flat = true;", to: "", breaks: "H10g" },
  { name: "H10g the replacement drops the flat mark", file: SR, from: "...(spec.flat ? { flat: true } : {})", to: "", breaks: "H10g" },
  { name: "H10h the flat formula keeps no critical", file: m("combat", "attack.mjs"), from: "  return buildWeaponDamageFormula(dice, { critical, criticalDice });", to: "  return buildWeaponDamageFormula(dice, {});", breaks: "H10h" },
  { name: "H10h the flat formula takes BAB dice", file: m("combat", "attack.mjs"), from: "  return buildWeaponDamageFormula(dice, { critical, criticalDice });", to: "  return buildWeaponDamageFormula(dice, { bab: 20, critical, criticalDice });", breaks: "H10h" },
  { name: "H10i the Strike keeps every addition", file: AW, from: "  if (replacingFlat) formula = flatReplacementFormula(", to: "  if (false) formula = flatReplacementFormula(", breaks: "H10i" },
  { name: "H10i the Strike never learns the rider is flat", file: AW, from: "      replacingFlat = replacing.flat === true;\n", to: "", breaks: "H10i" },
  { name: "H10i a flat Strike still carries packets", file: AW, from: "    for (const rune of replacingFlat ? [] : [", to: "    for (const rune of [", breaks: "H10i" },
  { name: "H10i a flat Strike still says its BAB dice", file: AW, from: "  const displayBonusDice = replacingFlat ? 0 : bonusDamageDice(", to: "  const displayBonusDice = bonusDamageDice(", breaks: "H10i" },
  { name: "H10i a flat Strike still names Sneak Attack", file: AW, from: "  if (sneak && !replacingFlat) {", to: "  if (sneak) {", breaks: "H10i" },
  { name: "H10i a flat Strike still names a declared bonus", file: AW, from: "  for (const said of replacingFlat ? [] : Array.isArray(declaredBonusLines)", to: "  for (const said of Array.isArray(declaredBonusLines)", breaks: "H10i" },
  // K
  { name: "K1 a dispel bias is dropped", file: DM, from: "    biases: list.map((o) => o.bias).filter(Boolean)", to: "    biases: []", breaks: "K1" },
  { name: "K1 the Dispel check never reads it", file: ACW, from: "      ...(action.key === \"dispel\" && Array.isArray(dispelSetup?.biases) ? dispelSetup.biases : [])", to: "", breaks: "K1b" },
  { name: "K2 a granted weakness is not held", file: GD, from: "    out.weaknesses.push(...(g.weak ?? []));", to: "", breaks: "K2" },
  { name: "K2 the creature's defences never read it", file: CT, from: "  for (const type of granted.weaknesses ?? []) weaknesses.add(type);", to: "", breaks: "K2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block7-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block7-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block7-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block7-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
