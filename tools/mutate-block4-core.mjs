#!/usr/bin/env node
/** mutate-block4-core — the mutation half of verify-block4-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CD = m("conditionals.mjs"), SR = m("stat-rows.mjs"), ACT = m("documents", "actor.mjs"), AT = m("combat", "attack.mjs"),
  AW = m("combat", "attack-workflow.mjs"), CK = m("dice", "check.mjs"), DCW = m("combat", "damage-conditionals-workflow.mjs"),
  DD = m("combat", "defence-dc.mjs"), REND = m("combat", "declared-rending.mjs"), AMB = m("combat", "ambush-dice.mjs"),
  SO = m("combat", "strike-options.mjs"), ACW = m("combat", "action-workflow.mjs"), API = m("module-api-workflow.mjs");
const FW = m("feats-workflow.mjs"), RID = m("magic", "strike-riders.mjs");
const MUTATIONS = [
  // A
  { name: "division rounds up", file: CD, from: "    return n === 0 ? null : Math.floor(a / n);", to: "    return n === 0 ? null : Math.ceil(a / n);", breaks: "A1" },
  { name: "the arithmetic forms are not read", file: CD, from: "  const arith = /^([a-zA-Z]+)\\s*([-+*/])\\s*(\\d+)$/.exec(text);", to: "  const arith = null;", breaks: "A1" },
  { name: "no minimum", file: CD, from: "      const floored = Number.isFinite(Number(raw.valueMin)) ? Math.max(scaled, Math.trunc(Number(raw.valueMin))) : scaled;", to: "      const floored = scaled;", breaks: "A4" },
  { name: "stat rows ignore a scaled figure", file: SR, from: "  if (row?.valueFrom) {", to: "  if (false) {", breaks: "A5" },
  { name: "the actor forgets the class bonus", file: ACT, from: "    classBonus: Number(actor.system?.identity?.classBonus ?? 0),\n    wearingArmour", to: "    wearingArmour", breaks: "A6" },
  // B
  { name: "the group scope is never tested", file: CD, from: "  if (wantedAttackGroups && !wantedAttackGroups.some((t) => attackGroups.includes(t))) return false;\n", to: "", breaks: "B2" },
  { name: "the group is read case-sensitively", file: CD, from: "  const attackGroups = [String(context.attackGroup ?? \"\").trim().toLowerCase()].filter(Boolean);", to: "  const attackGroups = [String(context.attackGroup ?? \"\").trim()].filter(Boolean);", breaks: "B2" },
  { name: "reach counts as adjacent", file: AT, from: "  if (!isRanged) return feet > 5 ? \"reach\" : \"adjacent\";", to: "  if (!isRanged) return \"adjacent\";", breaks: "B3" },
  { name: "the attack forgets its group", file: AW, from: "    attackGroup: String(weaponData.group ?? \"\").trim().toLowerCase(),\n    // HOW FAR", to: "    // HOW FAR", breaks: "B4" },
  { name: "the check drops the band", file: CK, from: "    this.rangeBand = config.rangeBand ?? \"\";", to: "    this.rangeBand = \"\";", breaks: "B5" },
  { name: "the damage's bonuses see only the traits", file: DCW, from: "  const rows = damageConditionalRows(entries, { ...context, traits: String(weapon?.system?.traits ?? \"\") });", to: "  const rows = damageConditionalRows(entries, { traits: String(weapon?.system?.traits ?? \"\") });", breaks: "B6" },
  // C
  { name: "an exclusion alone is not scope", file: DD, from: " && !sourceTraits.length && !notSourceUuids.length) return null;", to: " && !sourceTraits.length) return null;", breaks: "C1" },
  { name: "the challenged creature meets the penalty too", file: DD, from: "    if ((entry.notSourceUuids ?? []).length && entry.notSourceUuids.includes(uuid)) return false;\n", to: "", breaks: "C2" },
  // D
  { name: "an unscoped rending row is accepted", file: REND, from: "      if (entry && entry.value > 0) out.push(entry);", to: "      if (entry && entry.value > 0) out.push(entry);\n      else if (row.value > 0) out.push({ id: \"x\", label: String(row.label ?? carrier.name), value: Number(row.value), when: {}, not: {} });", breaks: "D1" },
  { name: "rending ignores the target", file: REND, from: "  const matched = (rows ?? []).filter((row) => matchesCheck(row, { ...context, checkType: \"damage\" }));", to: "  const matched = rows ?? [];", breaks: "D3" },
  { name: "a one-shot is never spent", file: REND, from: "    .filter((row) => row.oneShot && row.sourceKind === \"effect\" && row.sourceId)", to: "    .filter(() => false)", breaks: "D2" },
  { name: "THE DECLARED AR IS LOST", file: AW, from: "    ) + Math.max(0, Number(declaredRending) || 0);", to: "    );", breaks: "D4" },
  // E
  { name: "the dice do not grow", file: AMB, from: "  return declared ? byLevel(declared.byLevel, level, \"count\") : 0;", to: "  return declared ? 1 : 0;", breaks: "E1" },
  { name: "any melee weapon qualifies", file: AMB, from: "  return /\\b(agile|finesse)\\b/i.test(String(traits ?? \"\"));", to: "  return true;", breaks: "E2" },
  { name: "any ranged distance qualifies", file: AMB, from: "  if (isRanged) return norm(rangeBand) === \"first\";", to: "  if (isRanged) return true;", breaks: "E2" },
  { name: "B4-3 BROKEN: another cause applies unasked", file: AMB, from: "  if (targetFlatFooted || otherwiseFlatFooted) return \"ask\";", to: "  if (targetFlatFooted || otherwiseFlatFooted) return \"auto\";", breaks: "E3" },
  { name: "your own Feint is asked about", file: AMB, from: "  if (targetFlatFooted && fromOwnAbility) return \"auto\";\n", to: "", breaks: "E3" },
  { name: "Ambusher's Patience twice on one creature", file: AMB, from: "      if (row.oncePerCreature && alreadyAmbushed) continue;\n", to: "", breaks: "E4" },
  { name: "once per round is forgotten", file: AW, from: "    const usedThisRound = ambushDeclared.oncePerRound && roundKey && actor.getFlag?.(SYSTEM_ID, \"ambushRound\") === roundKey;", to: "    const usedThisRound = false;", breaks: "E5" },
  { name: "the dice never reach the damage", file: AW, from: "      precisionDice: precisionDice + compoundPrecision + ambushDice,", to: "      precisionDice: precisionDice + compoundPrecision,", breaks: "E6" },
  { name: "Vanishing Retreat is never told", file: AW, from: "      Hooks.callAll(\"trgPrimeAmbushDealt\", { actor, target: targetActor, weapon, dice: ambushDice, label: ambush.declared.label });", to: "", breaks: "E6" },
  { name: "Shift still asks", file: AW, from: "      if (!take && !skipDialog(event) && DialogV2) {\n        take = Boolean(", to: "      if (!take && DialogV2) {\n        take = Boolean(", breaks: "E7" },
  { name: "a Feint records nothing", file: ACW, from: "        await targetActor.setFlag(SYSTEM_ID, \"flatFootedFrom\", { uuid: actor.uuid,", to: "        await targetActor.setFlag(SYSTEM_ID, \"flatFootedFromX\", { uuid: actor.uuid,", breaks: "E8" },
  // F
  { name: "considered flanked stacks on a real flank", file: SO, from: "  if (alreadyFlanking || cannotBeFlanked) return null;", to: "  if (cannotBeFlanked) return null;", breaks: "F1" },
  { name: "flat-footed loses only Dexterity", file: SO, from: "  return dex + dodge;", to: "  return dex;", breaks: "F2" },
  { name: "every DB bonus is ignored, not the stance's", file: SO, from: "    if (!uuids.has(from)) continue;", to: "", breaks: "F3" },
  { name: "a suppressed bonus is ignored too", file: SO, from: "    if (!entry?.applied) continue;\n    const from", to: "    const from", breaks: "F3" },
  { name: "the group trait ignores the grip", file: SO, from: "      if (row.oneHanded && !oneHanded) continue;\n", to: "", breaks: "F4" },
  { name: "a disabled effect still punishes reactions", file: SO, from: "    if (!carrier || carrier.disabled) continue;\n    const raw = carrier.flags?.[\"trg-prime\"]?.reactionAttackPenalty;", to: "    if (!carrier) continue;\n    const raw = carrier.flags?.[\"trg-prime\"]?.reactionAttackPenalty;", breaks: "F5" },
  { name: "the Strike ignores ignoreTargetStance", file: AW, from: "  if (ignoreTargetStance && targetActor) {", to: "  if (false) {", breaks: "F6" },
  { name: "treated as flat-footed does not count for Sneak Attack", file: AW, from: " || Boolean(conditionTerms?.flatFootedBy) || Boolean(treatAsFlatFooted),", to: " || Boolean(conditionTerms?.flatFootedBy),", breaks: "F7" },
  // H
  { name: "a blow is due on anyone's turn", file: m("combat", "held-strike.mjs"), from: "  return record.targetUuid === actorUuid;", to: "  return true;", breaks: "H2" },
  { name: "THE HELD BLOW LANDS AT ONCE", file: AW, from: "  if (outcome.hits && strikeLands && !held) {", to: "  if (outcome.hits && strikeLands) {", breaks: "H3" },
  { name: "the held critical rolls now", file: AW, from: "  if (!held) {\n    if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && targetActor && !noReactions) {", to: "  if (true) {\n    if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && targetActor && !noReactions) {", breaks: "H3" },
  { name: "landing forgets the critical", file: m("combat", "held-strike.mjs"), from: "  if (record.critical) {\n    const injury", to: "  if (false) {\n    const injury", breaks: "H4" },
  { name: "landing asks the damage dialog", file: AW, from: "  const result = preset ? {", to: "  const result = false ? {", breaks: "H4" },
  { name: "a landed blow stays held", file: m("combat", "held-strike.mjs"), from: "  await actor.unsetFlag(SYSTEM_ID, \"heldStrike\");", to: "", breaks: "H5" },
  // I
  { name: "a lone target is not isolated", file: SO, from: "  if (targetAlliesAdjacent === false) out.push(\"isolated\");", to: "", breaks: "I2" },
  { name: "the state scope is never tested", file: CD, from: "  if (wantedTargetStates && !wantedTargetStates.some((t) => targetStates.includes(t))) return false;\n", to: "", breaks: "I3" },
  { name: "the damage never hears the state", file: AW, from: "        rangeBand: attackCheckConfig.rangeBand,\n        targetStates: attackCheckConfig.targetStates\n      }\n    });", to: "        rangeBand: attackCheckConfig.rangeBand\n      }\n    });", breaks: "I4" },
  { name: "the preset cannot halve", file: AW, from: "    glancing: Boolean(preset.glancing),", to: "    glancing: false,", breaks: "I5" },
  // J
  { name: "a miss is announced as a hit", file: AW, from: "      hits: Boolean(outcome?.hits) && strikeLands, critical:", to: "      hits: true, critical:", breaks: "J1" },
  // G
  { name: "the helper is missing", file: API, from: "      mapPenalty: async (actor, weapon, index) => {", to: "      mapPenaltyX: async (actor, weapon, index) => {", breaks: "G1" },
  // K
  { name: "no damage roll for modules", file: API, from: "      rollWeaponDamage: async (actor, weapon, options = {}) =>", to: "      rollStrikeDamage: async (actor, weapon, options = {}) =>", breaks: "K1" },
  { name: "no quiet trait check for modules", file: API, from: "      traitCheck: async (...args) => (await import(\"./traits-workflow.mjs\")).traitCheck(...args),\n", to: "", breaks: "K2" },
  { name: "the wait cannot be waived", file: FW, from: "  if (!waiveWait && round !== null && lastStance !== null && round <= lastStance) {", to: "  if (round !== null && lastStance !== null && round <= lastStance) {", breaks: "K3" },
  { name: "a waived wait leaves no stamp", file: FW, from: "  if (round !== null) await actor.setFlag(SYSTEM_ID, \"lastStanceRound\", stanceStamp());", to: "  if (round !== null && !waiveWait) await actor.setFlag(SYSTEM_ID, \"lastStanceRound\", stanceStamp());", breaks: "K3" },
  { name: "a flat rider is refused", file: RID, from: "  const flat = raw.flat === true && !weaponDie;", to: "  const flat = false;", breaks: "K4" },
  { name: "a flat rider forgets it is flat on the round trip", file: RID, from: "  if (flat) out.flat = true;\n", to: "", breaks: "K4" },
  { name: "any number is a flat rider", file: RID, from: "const FLAT_PATTERN = /^[1-9]\\d*$/;", to: "const FLAT_PATTERN = /^\\d+$/;", breaks: "K5" },
  { name: "a bare number is a die", file: RID, from: "const DICE_PATTERN = /^([1-9]\\d*)d([1-9]\\d*)$/i;", to: "const DICE_PATTERN = /^([1-9]\\d*)(d([1-9]\\d*))?$/i;", breaks: "K5" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block4-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block4-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block4-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block4-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
