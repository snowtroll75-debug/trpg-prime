#!/usr/bin/env node
/** mutate-ea-block4-core — the mutation half of verify-ea-block4-core. NEW at 3.682.0. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const MEM = m("magic", "memorisation.mjs"), CM = m("magic", "class-magic.mjs"), MW = m("magic", "memorisation-workflow.mjs"),
  AB = m("combat", "attack-base.mjs"), CW = m("magic", "cast-workflow.mjs"), ILB = m("magic", "innate-level-bonus.mjs"),
  API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), INF = m("infused-runes.mjs"), ITEM = m("documents", "item.mjs"),
  AW = m("combat", "attack-workflow.mjs"), ATK = m("combat", "attack.mjs"), SE = m("magic", "strike-edge.mjs"),
  AFF = m("combat", "affliction-workflow.mjs"), HK = m("magic", "cast-hooks.mjs"), SR = m("magic", "spell-range.mjs"), CODEX = m("codex-runes.mjs"),
  RD = m("rune-damage.mjs"), SEF = m("magic", "spell-effects.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  // M
  { name: "the Spellblade's budget is the default's", file: MEM, from: "\"L+1\": (level) => level + 1", to: "\"L+1\": (level) => 2 + 2 * level", breaks: "M2/M4" },
  { name: "an unknown rule is taken as given", file: MEM, from: "? key : \"2+2L\";", to: "? key : key;", breaks: "M3" },
  { name: "the class's rule is not read", file: CM, from: "memorisedPerDay: memorisedPerDayRule(cls.memorisedPerDay),", to: "memorisedPerDay: \"2+2L\",", breaks: "M6" },
  { name: "the dialog ignores the class's rule", file: MW, from: "memorisedPerDay: actor.system?.progression?.classMagic?.memorisedPerDay ?? \"2+2L\"", to: "memorisedPerDay: \"2+2L\"", breaks: "M8" },
  // B
  { name: "BAB replaces BSB even when lower", file: AB, from: "  if (bab <= bsb) return null;\n  return { label: `BAB", to: "  return { label: `BAB", breaks: "B2" },
  { name: "a disabled source still declares it", file: AB, from: "    !s?.disabled && s?.system?.active !== false && String(", to: "    s?.system?.active !== false && String(", breaks: "B4" },
  { name: "the spell attack never takes the row", file: CW, from: "if (!spell?.system?.innate && !check?.fromStrike)", to: "if (false)", breaks: "B5" },
  { name: "a maneuver spell's check never takes Battle Mage (Q53)", file: SEF, from: "            if (baseRow) modifiers.push(baseRow);\n", to: "", breaks: "B8" },
  { name: "a maneuver spell's Battle Mage asks for the Attack trait (Q53)", file: SEF, from: "...Array.from(caster.appliedEffects ?? [])], caster.system);", to: "...Array.from(caster.appliedEffects ?? [])], caster.system, spell.system);", breaks: "B8" },
  { name: "THE RULING: a maneuver spell ignores the multiple attack penalty", file: SEF, from: "            if (map) modifiers.push({ label: \"Multiple attack penalty\", value: map, type: \"untyped\" });\n", to: "", breaks: "B9" },
  { name: "a maneuver spell never counts toward the next attack", file: SEF, from: "            await setAttackCount(caster, maneuverMapBefore + maneuverChecks);\n", to: "", breaks: "B11" },
  { name: "Monstrous Grab's exemption is ignored on a maneuver spell", file: SEF, from: "const map = exempt ? 0 : mapPenalty(maneuverMapBefore);", to: "const map = mapPenalty(maneuverMapBefore);", breaks: "B9/B10" },
  { name: "each target of one cast climbs the ladder", file: SEF, from: "            if (maneuverMapBefore === null) maneuverMapBefore = attackCountOf(caster);", to: "            maneuverMapBefore = attackCountOf(caster);", breaks: "B12" },
  { name: "the penalty is laid on an action without the Attack trait", file: SEF, from: "const maneuverCounts = countsTowardMAP(actionData?.traits);", to: "const maneuverCounts = true;", breaks: "B9" },
  { name: "each recipient freezes its own count (review)", file: SEF, from: "    for (const target of recipients) {\n", to: "    for (const target of recipients) {\n      let maneuverMapBefore = null;\n      let maneuverChecks = 0;\n", breaks: "B12" },
  { name: "Battle Mage lays BAB on the Strike's roll again (review)", file: CW, from: "  if (check && strikeCheck?.dice) check.fromStrike = true;\n", to: "", breaks: "B5" },
  { name: "any spell attack takes BAB, Attack trait or not (review)", file: AB, from: "  if (spellData && String(spellData.category", to: "  if (false && String(spellData.category", breaks: "B6" },
  { name: "THE LIVE DEFECT: an attack spell's category is not its Attack trait", file: AB, from: "  if (spellData && String(spellData.category ?? \"\").trim().toLowerCase() !== \"attack\"\n    && !String", to: "  if (spellData && !String", breaks: "B6b" },
  { name: "a switched-off ability still declares it (review)", file: AB, from: "!s?.disabled && s?.system?.active !== false && ", to: "!s?.disabled && ", breaks: "B7" },
  // I
  { name: "the school is not a trait for the souls", file: ILB, from: "traits: [...new Set([...words(data.traits), ...words(data.school)])],", to: "traits: [...new Set([...words(data.traits)])],", breaks: "I1/I5" },
  { name: "a negative answer subtracts", file: ILB, from: "      if (n > 0) total += n;", to: "      total += n;", breaks: "I3" },
  { name: "a throwing bonus breaks the cast", file: ILB, from: "    } catch (error) {\n      console.error(`TRG Prime | innate level bonus", to: "    } catch (error) {\n      throw error;\n      console.error(`TRG Prime | innate level bonus", breaks: "I3" },
  { name: "a non-function is accepted", file: API, from: "if (!k || typeof bonus !== \"function\") { problem(`registerInnateLevelBonus", to: "if (!k) { problem(`registerInnateLevelBonus", breaks: "I2" },
  { name: "the PP limit ignores the souls", file: CW, from: "const gateLevel = gateAt.level + (gateAt.itemName ? 0 : await innateLevelBonusFor(actor, spell));", to: "const gateLevel = gateAt.level;", breaks: "I6" },
  { name: "an item's cast takes the souls' levels (review)", file: CW, from: "isInnate && !innateAt.itemName && !isItemCast ? await", to: "isInnate && !innateAt.itemName ? await", breaks: "I7" },
  { name: "the innate attack and DC ignore the souls", file: CW, from: "  const innateLevel = innateAt.level + innateBonusLevels;", to: "  const innateLevel = innateAt.level;", breaks: "I7" },
  { name: "the API forgets the registration", file: APIW, from: "    registerInnateLevelBonus: (key, bonus, moduleId) => registerInnateLevelBonus(key, bonus, moduleId),\n", to: "", breaks: "I8" },
  // R
  { name: "the infusion is every weapon's", file: INF, from: "  if (!id || String(flag.weaponId ?? \"\") !== String(id)) return null;", to: "  if (!id) return null;", breaks: "R2" },
  { name: "an infusion is never magical", file: INF, from: "    magical: flag.magical !== false", to: "    magical: false", breaks: "R1" },
  { name: "the union drops the weapon's own", file: INF, from: "return [String(own ?? \"\").trim(), String(infused ?? \"\").trim()]", to: "return [String(infused ?? \"\").trim()]", breaks: "R4" },
  { name: "a reader ignores the union", file: INF, from: "  return typeof effective === \"string\" ? effective : String(item?.system?.runes ?? \"\");", to: "  return String(item?.system?.runes ?? \"\");", breaks: "R5" },
  { name: "the infused runes count against the allowance", file: ITEM, from: "exempt: [...(onLoan ? [onLoan] : []), ...infusedLabels],", to: "exempt: [...(onLoan ? [onLoan] : [])],", breaks: "R6" },
  { name: "a cleared infusion lingers", file: ITEM, from: "      this.system.effectiveRunes = infusion ? mergedRuneField(this.system.runes, infusion.runes) : undefined;", to: "      if (infusion) this.system.effectiveRunes = mergedRuneField(this.system.runes, infusion.runes);", breaks: "R6b" },
  { name: "an infused weapon is not magical", file: AW, from: "      || Boolean(weapon?.system?.infused)\n", to: "\n", breaks: "R7" },
  { name: "a rune reader reads the weapon's own field", file: RD, from: "runeFieldOf(", to: "String((", breaks: "R8" },
  { name: "Vorpal ignores an infused rune", file: CODEX, from: "fieldToRunes(kind, runeFieldOf(weapon))", to: "fieldToRunes(kind, weapon?.system?.runes ?? \"\")", breaks: "R9" },
  // S
  { name: "castSpell is not on the API", file: APIW, from: "      castSpell: async (actor, spell, options = {}) => (await import(\"./magic/cast-workflow.mjs\")).castSpell(actor, spell, options ?? {}),\n", to: "", breaks: "S1" },
  { name: "the Strike gets a second Conviction", file: CW, from: "...gated.modifiers],\n      allowConviction: false", to: "...gated.modifiers],\n      allowConviction: true", breaks: "S3" },
  { name: "the casting's gate rows miss the Strike's check (review)", file: CW, from: "presetModifiers: [...Array.from(strikeCheck.modifiers ?? []), ...gated.modifiers],", to: "presetModifiers: Array.from(strikeCheck.modifiers ?? []),", breaks: "S3" },
  { name: "the casting rolls its own die", file: CW, from: "      presetDice: strikeCheck.dice,\n", to: "", breaks: "S3" },
  { name: "the spell's reach includes everything past it", file: ATK, from: "Number.isFinite(d) && d <= reach;", to: "Number.isFinite(d);", breaks: "S5" },
  { name: "a reach of 0 counts", file: ATK, from: "Number.isFinite(reach) && reach > 0 && ", to: "Number.isFinite(reach) && ", breaks: "S6" },
  { name: "the override is not consulted", file: AW, from: "(reachAlreadyEstablished || withinReachOverride(distanceToTarget, reachOverrideFeet)) ? null : distanceToTarget", to: "reachAlreadyEstablished ? null : distanceToTarget", breaks: "S7" },
  { name: "the rune's hours are not Learn a Spell's", file: APIW, from: "hours: Number(learnSpellHours(pp) ?? 0) };", to: "hours: 1 };", breaks: "S9" },
  { name: "the check's degree is not given its meaning", file: APIW, from: "      learnSpellOutcome: async (degreeKey) =>", to: "      learnSpellOutcomeX: async (degreeKey) =>", breaks: "S9" },
  { name: "a second recurring source just overwrites", file: APIW, from: "        return layRecurring(target, Math.max(0,", to: "        return layRecurring(null, Math.max(0,", breaks: "S10" },
  { name: "the rune list is not on the API", file: APIW, from: "      runesFor: async (kind) => (await import(\"./rune-catalogue.mjs\")).runesFor(kind),\n", to: "", breaks: "S11" },
  // C
  { name: "the smallest step wins", file: SE, from: "reduceCover: Math.max(Math.trunc(Number(edge.reduceCover) || 0), best?.reduceCover ?? 0),", to: "reduceCover: Math.trunc(Number(edge.reduceCover) || 0),", breaks: "C4" },
  { name: "a step goes two degrees", file: SE, from: "  const to = Math.max(0, at - n);", to: "  const to = Math.max(0, at - n - 1);", breaks: "C2" },
  { name: "the DB keeps the cover", file: AW, from: " - pierce.amount - takenCoverLoss", to: " - pierce.amount", breaks: "C6" },
  { name: "a switched-off Take Cover is stepped (review)", file: AW, from: "const taken = coverEffect && !coverEffect.disabled ? takeCoverLevelOf(targetActor) : \"\";", to: "const taken = takeCoverLevelOf(targetActor);", breaks: "C6" },
  { name: "the table's difference, stacking or not (review)", file: AW, from: "const sheetLoss = coverLossInDefence(sheetEntries, step.lost, coverSource);", to: "const sheetLoss = step.lost;", breaks: "C6" },
  { name: "another circumstance bonus is ignored (review)", file: SE, from: "  const after = Math.max(0, Number(slot.value) - take, ...others);", to: "  const after = Math.max(0, Number(slot.value) - take);", breaks: "C6b" },
  { name: "a slot without cover still loses (review)", file: SE, from: "  if (!slot || !take) return 0;", to: "  if (!take) return 0;", breaks: "C6b" },
  { name: "a throwable weapon is thrown inside the spell's reach (review)", file: AW, from: "    !withinReachOverride(distanceToTarget, reachOverrideFeet);\n  const thrownAttack", to: "    true;\n  const thrownAttack", breaks: "C6c" },
  { name: "firing into melee's cover is never stepped", file: AW, from: "    } else if (coverBonus) {\n      coverStep = coverSteppedDown(\"standard\", strikeEdge.reduceCover);", to: "    } else if (false) {\n      coverStep = coverSteppedDown(\"standard\", strikeEdge.reduceCover);", breaks: "C6" },
  // A
  { name: "THE GAP: a disease's damage carries no disease trait", file: AFF, from: "if ((kind === \"poison\" || kind === \"disease\") && !traits.includes(kind)) traits.push(kind);", to: "if (kind === \"poison\" && !traits.includes(kind)) traits.push(kind);", breaks: "A1" },
  { name: "a curse is treated as a disease", file: AFF, from: "if ((kind === \"poison\" || kind === \"disease\") && !traits.includes(kind))", to: "if (kind && !traits.includes(kind))", breaks: "A3" },
  { name: "the stage damage passes the old traits", file: AFF, from: "traits: stageDamageTraits(item, type) });", to: "traits: type === \"poison\" ? [\"poison\"] : [] });", breaks: "A4" },
  // T
  { name: "THE RULING: a natural 1 can land", file: SR, from: "  if (face === 1) return { landed: false, by: av - db, natural: \"1\" };\n", to: "", breaks: "T1" },
  { name: "THE RULING: a natural 20 can miss", file: SR, from: "  if (face === 20) return { landed: true, by: av - db, natural: \"20\" };\n", to: "", breaks: "T2" },
  { name: "the touch is not told its face", file: CW, from: "defence, { natural: Number(touch?.dice?.unmodified ?? 0) })", to: "defence)", breaks: "T5" },
  // P
  { name: "a prelude is asked for a Strike's cast too", file: CW, from: "&& !o.carried && !o.strikeCheck && !o.thread", to: "&& !o.carried && !o.thread", breaks: "P1" }, // re-anchored at 3.684.0 (Block 6 options follow it)
  { name: "a prelude is asked for an item's cast", file: CW, from: "return !o.itemCheck && !o.stored", to: "return !o.stored", breaks: "P1" },
  { name: "a prelude meets itself again (review)", file: CW, from: "if (castPreludeOwed(options) && !PRELUDES_RUNNING.has(preludeKey)) {", to: "if (castPreludeOwed(options)) {", breaks: "P6" },
  { name: "the cast goes on after a prelude took it", file: CW, from: "    if (taken?.handled) return taken.result ?? null;\n", to: "", breaks: "P6" },
  { name: "a throwing prelude stops the cast", file: HK, from: "      console.error(`TRG Prime | a module's cast prelude \"${key}\" failed`, err);", to: "      throw err;", breaks: "P3" },
  { name: "a half answer is taken", file: HK, from: "if (out && out.handled === true) return", to: "if (out && out.handled) return", breaks: "P5" },
  { name: "a non-function prelude is accepted", file: API, from: "if (!k || typeof prelude !== \"function\") { problem(`registerCastPrelude", to: "if (!k) { problem(`registerCastPrelude", breaks: "P2" },
  { name: "the API forgets the prelude", file: APIW, from: "    registerCastPrelude: (key, prelude, moduleId) => registerCastPrelude(key, prelude, moduleId),\n", to: "", breaks: "P7" },
  // H
  { name: "a critical is not said", file: CW, from: "({ target: r.targetActor, critical: Boolean(r.critical) })", to: "({ target: r.targetActor, critical: false })", breaks: "H2" },
  { name: "a volley gives its first ray only", file: CW, from: "const rays = Array.isArray(spellAttack.rays) ? spellAttack.rays : [spellAttack];", to: "const rays = [spellAttack];", breaks: "H3" },
  { name: "the settled hook leaves them out", file: CW, from: "    spellHits: spellHitsOf(spellAttack),\n", to: "", breaks: "H4" },
  // G
  { name: "an HP grant goes to PP", file: m("feats-workflow.mjs"), from: "      path: hp ? \"system.resources.hp.other\" : \"system.resources.pp.base\",", to: "      path: \"system.resources.pp.base\",", breaks: "G1" },
  { name: "the registry forgets the stat", file: API, from: "  const stat = String(spec?.stat ?? \"pp\").trim().toLowerCase() === \"hp\" ? \"hp\" : \"pp\";", to: "  const stat = \"pp\";", breaks: "G1" },
  // Z
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.681.2\"", breaks: "Z1" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block4-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block4-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    const replaceAll = mu.file === RD;
    if (n !== 1 && !(replaceAll && n > 0)) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, replaceAll ? original.split(mu.from).join(mu.to) : original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-ea-block4-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block4-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
