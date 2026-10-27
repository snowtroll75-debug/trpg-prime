#!/usr/bin/env node
/** mutate-block7-core — the mutation half of verify-block7-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const AP = m("archetype-progression.mjs"), PF = m("picker-filters.mjs"), MA = m("module-api.mjs"), FT = m("feats.mjs"),
  AS = m("sheets", "actor-sheet.mjs"), CS = m("class-skills.mjs"), CD = m("class-derive.mjs"), PR = m("proficiency-rules.mjs"),
  UP = m("combat", "unarmed-profile.mjs"), AW = m("combat", "attack-workflow.mjs"), SRW = m("magic", "strike-riders-workflow.mjs"),
  SH = m("combat", "sheathed.mjs"), CO = m("conditionals.mjs"), CK = m("dice", "check.mjs"), RE = m("combat", "reactions.mjs"),
  APW = m("combat", "action-points-workflow.mjs"), API = m("module-api-workflow.mjs"), ACW = m("combat", "action-workflow.mjs"),
  SB = m("magic", "spell-own-bonus.mjs"), CW = m("magic", "cast-workflow.mjs"), RS = m("dice", "resolution.mjs"), SR = m("stat-rows.mjs"),
  BR = m("bonuses", "registry.mjs"), PQ = m("prerequisites.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json");
const MUTATIONS = [
  // C1
  { name: "THE GAP: a full stop fails the line open", file: AP, from: ".trim().replace(/\\.$/, \"\").replace(", to: ".trim().replace(", breaks: "C1" },
  { name: "\"&\" is not read as \"and\"", file: AP, from: ".replace(/\\s*&\\s*/g, \" and \")", to: "", breaks: "C1" },
  { name: "the plural \"skills\" is not stripped", file: AP, from: ".replace(/\\s+skills?$/i, \"\");", to: ".replace(/\\s+skill$/i, \"\");", breaks: "C1" },
  { name: "\"Level +N\" is unread", file: AP, from: "  if (levelPlus) return { type: \"level\", min: Number(levelPlus[1]) };", to: "  if (levelPlus) return null;", breaks: "C1" },
  { name: "\"Gained class skill\" is unread", file: AP, from: "  if (gained) return { type: \"grantedClassSkill\", min: Number(gained[1]) };", to: "  if (gained) return null;", breaks: "C1" },
  { name: "an unchosen grant passes", file: AP, from: "      if (!context.grantedSkill) return false;", to: "      if (!context.grantedSkill) return true;", breaks: "C1" },
  { name: "an archetype with no grant blocks", file: AP, from: "      if (!context.hasGrant) return true;", to: "      if (!context.hasGrant) return false;", breaks: "C1" },
  { name: "any skill at the figure passes", file: AP, from: "      return Number(actorStats.skillRanks?.[context.grantedSkill] ?? 0) >= parsed.min;", to: "      return Object.values(actorStats.skillRanks ?? {}).some((r) => Number(r) >= parsed.min);", breaks: "C1" },
  { name: "the picker passes no context", file: PF, from: "stats, archetypeGrantContext(actor, feat))", to: "stats)", breaks: "C1" },
  { name: "the grant's record is looked up by name", file: PF, from: "  const record = actor?.flags?.[\"trg-prime\"]?.[grant.flag];", to: "  const record = actor?.flags?.[\"trg-prime\"]?.[grant.name];", breaks: "C1" },
  // C2
  { name: "THE GAP: \"archetype\" is refused as a kind", file: MA, from: "if (![\"race\", \"class\", \"archetype\"].includes(k)", to: "if (![\"race\", \"class\"].includes(k)", breaks: "C2" },
  { name: "the archetype slot never reads it", file: PF, from: "        if (hasRegisteredFeatAccess(\"archetype\", className, entry.name)) return true;", to: "", breaks: "C2" },
  { name: "the archetype slot reads the class-feat lists instead", file: PF, from: "        if (hasRegisteredFeatAccess(\"archetype\", className, entry.name)) return true;", to: "        if (hasRegisteredFeatAccess(\"class\", className, entry.name)) return true;", breaks: "C2" },
  // C3
  { name: "THE GAP: countsAs is dropped", file: MA, from: "    countsAs: Array.isArray(spec.countsAs) ? spec.countsAs.map((a) => String(a).trim()).filter(Boolean) : []", to: "    countsAs: []", breaks: "C3" },
  { name: "the aliases are never added", file: FT, from: "    for (const alias of registeredArchetype(featName)?.countsAs ?? []) push(alias);", to: "", breaks: "C3" },
  { name: "the sheet reads only owned archetypes", file: AS, from: "      archetypes: effectiveArchetypes(archetypeFeats),", to: "      archetypes: archetypeFeats.join(\", \"),", breaks: "C3" },
  // C4
  { name: "THE GAP: declared class skills are ignored", file: CS, from: "      add(skillKeyFromName(name, skills), `feat:${entry.id}`, entry.label);", to: "      void name;", breaks: "C4" },
  { name: "the derive passes none", file: CD, from: "    declared: declaredClassSkills(actor?.items ?? [])", to: "    declared: []", breaks: "C4" },
  { name: "any item declares one", file: CD, from: "    .filter((item) => item?.type === \"feat\" || item?.type === \"ability\")\n    .map((item) => {\n      const raw = item?.flags?.[\"trg-prime\"]?.classSkills;", to: "    .filter((item) => Boolean(item))\n    .map((item) => {\n      const raw = item?.flags?.[\"trg-prime\"]?.classSkills;", breaks: "C4" },
  { name: "a single skill as a string is not read", file: CD, from: "(Array.isArray(raw) ? raw : (raw ? [raw] : []))", to: "(Array.isArray(raw) ? raw : [])", breaks: "C4" },
  // C5
  { name: "THE GAP: a list of names is not read", file: PR, from: "for (const named of Array.isArray(namedRaw) ? namedRaw : namedRaw ? [namedRaw] : []) {", to: "for (const named of namedRaw && !Array.isArray(namedRaw) ? [namedRaw] : []) {", breaks: "C5" },
  { name: "a declared category is never recorded", file: PR, from: "        if (name) profile.weaponCategoryAs.set(nameKey(name), String(categoryAs.category));", to: "        void name;", breaks: "C5" },
  { name: "a declared category changes a non-exotic weapon", file: PR, from: "  if (declared && norm(category) === \"exotic\") {", to: "  if (declared) {", breaks: "C5" },
  // C6
  { name: "a disabled effect still declares", file: UP, from: "    if (carrier?.disabled) continue;\n    const spec = carrier?.flags?.[\"trg-prime\"]?.unarmedAbilityWeapons;", to: "    const spec = carrier?.flags?.[\"trg-prime\"]?.unarmedAbilityWeapons;", breaks: "C6" },
  { name: "names reach every weapon of a named group (the crossbow)", file: UP, from: "    if (name && list(spec.names).some((n) => n.toLowerCase() === name)) return true;", to: "    if (group && list(spec.names).length) return true;", breaks: "C6" },
  { name: "THE GAP: the bonded weapon's id is not read", file: UP, from: "    if (id && list(spec.itemIds).includes(id)) return true;", to: "", breaks: "C6" },
  { name: "the view changes the weapon itself", file: UP, from: "  return { ...weaponSystem, unarmed: true };", to: "  weaponSystem.unarmed = true;\n  return weaponSystem;", breaks: "C6" },
  { name: "Death Mark reads the weapon, not the abilities' view", file: AW, from: "      unarmed: isUnarmedAttack(abilityData),", to: "      unarmed: isUnarmedAttack(weaponData),", breaks: "C6" },
  { name: "the conditionals' attack form reads the weapon", file: AW, from: "    attackForm: attackFormOf(abilityData),", to: "    attackForm: attackFormOf(weaponData),", breaks: "C6" },
  { name: "B7-6 BROKEN: the fists' damage profile sees the bonded weapon as unarmed", file: AW, from: "  const unarmed = unarmedProfileFor(actor, weaponData);", to: "  const unarmed = unarmedProfileFor(actor, abilityStrikeView(weaponData, declaresUnarmedAbilities(unarmedAbilityCarriers(actor), weapon)));", breaks: "C6" },
  { name: "an unarmed-scoped rider never reaches it", file: SRW, from: "    unarmed: weapon?.system?.unarmed === true || abilityUnarmed,", to: "    unarmed: weapon?.system?.unarmed === true,", breaks: "C6" },
  { name: "Savage Strikes never reaches it", file: AW, from: "\n    // A weapon the holder's unarmed abilities reach (3.671.0, B7-6).\n    || declaresUnarmedAbilities(unarmedAbilityCarriers(actor), weapon);", to: ";", breaks: "C6" },
  // C7
  { name: "THE GAP: every weapon scales", file: UP, from: "      if (!row || typeof row !== \"object\" || String(row.itemId ?? \"\") !== id) continue;", to: "      if (!row || typeof row !== \"object\") continue;", breaks: "C7" },
  { name: "a threshold is met one BAB early", file: UP, from: "        if (reached < Math.max(0, Number(at) || 0)) continue;", to: "        if (reached + 1 < Math.max(0, Number(at) || 0)) continue;", breaks: "C7" },
  { name: "the flat is never added at damage", file: AW, from: "  if (bondedFlat) formula += ` + ${bondedFlat}`;", to: "", breaks: "C7" },
  { name: "its magic is not read", file: AW, from: "      || Boolean(bonded?.magical);", to: "      ;", breaks: "C7" },
  { name: "its materials are not read", file: AW, from: ", ...(bonded?.materials ?? [])]", to: "]", breaks: "C7" },
  // C8
  { name: "a wielded sword is sheathed", file: SH, from: "    && !item.system?.equipped\n", to: "", breaks: "C8" },
  { name: "a packed-away sword is sheathed", file: SH, from: "    && !item.system?.stowed\n", to: "", breaks: "C8" },
  { name: "THE GAP: the axis is never matched", file: CO, from: "  if (wantedSheathedGroups && !wantedSheathedGroups.some((t) => sheathedGroups.includes(t))) return false;\n", to: "", breaks: "C8" },
  { name: "a check never fills it", file: CK, from: "          sheathedGroups: check.sheathedGroups || sheathedGroups(check.actor?.items ?? []),", to: "          sheathedGroups: check.sheathedGroups,", breaks: "C8" },
  // C9
  { name: "a disabled effect still takes reactions", file: RE, from: "    (e) => !e.disabled && e.getFlag?.(\"trg-prime\", \"noReactions\") === true", to: "    (e) => e.getFlag?.(\"trg-prime\", \"noReactions\") === true", breaks: "C9" },
  { name: "THE GAP: the actor's block ignores the declaration", file: RE, from: "  }) ?? (declaredReactionBlock(actor) || null);", to: "  }) ?? null;", breaks: "C9" },
  { name: "a module's reaction is not refused by a block", file: APW, from: "  if (blocked) return `${actor.name}: ${blocked}.`;", to: "  void blocked;", breaks: "C9" },
  { name: "the target is still offered a defence", file: AW, from: "  if (targetActor && !noReactions) {\n    const { offerDefences }", to: "  if (targetActor) {\n    const { offerDefences }", breaks: "C9" },
  { name: "the target is still offered a miss reaction", file: AW, from: "  if (outcome.resolved && !outcome.hits && targetActor && !noReactions) {", to: "  if (outcome.resolved && !outcome.hits && targetActor) {", breaks: "C9" },
  { name: "the hook never says so", file: AW, from: "      noReactions: Boolean(noReactions)\n    });", to: "      noReactions: false\n    });", breaks: "C9" },
  { name: "the conviction reroll is refused too (it is not a reaction)", file: AW, from: "  if (targetActor && !presetDice) {\n    const { offerAttackReroll", to: "  if (targetActor && !presetDice && !noReactions) {\n    const { offerAttackReroll", breaks: "C9" },
  // C10–C12
  { name: "THE GAP: an immunity never refuses", file: API, from: "        if (!t.isTemporarilyImmune(record, key, now)) return \"\";", to: "        return \"\";", breaks: "C10" },
  { name: "SYSTEM_ID is never imported (a ReferenceError)", file: API, from: "import { SYSTEM_ID, contentPack, contentPacksFor, isFederated } from \"./content-packs.mjs\";", to: "import { contentPack, contentPacksFor, isFederated } from \"./content-packs.mjs\";", breaks: "C10" },
  { name: "the save on demand deals the interval's damage", file: API, from: "rollAfflictionStageSave(actor, affliction, { withDamage: false }),", to: "rollAfflictionStageSave(actor, affliction, { withDamage: true }),", breaks: "C11" },
  { name: "the once-cast copy keeps a daily count", file: API, from: "        delete data.system.usesPerDay;\n", to: "", breaks: "C12" },
  { name: "the once-cast copy is not innate", file: API, from: "        data.system = { ...(data.system ?? {}), innate: true };", to: "        data.system = { ...(data.system ?? {}) };", breaks: "C12" },
  // C13
  { name: "THE GAP: the restores axis is never matched", file: CO, from: "  if (wantedRestores && !wantedRestores.some((t) => restores.includes(t))) return false;\n", to: "", breaks: "C13" },
  { name: "the Refocus never names its item", file: ACW, from: "    ...(refocusTarget ? { restores:", to: "    ...(false ? { restores:", breaks: "C13" },
  { name: "the check never passes it on", file: CK, from: "          restores: check.restores\n        };", to: "          restores: \"\"\n        };", breaks: "C13" },
  // C14
  { name: "a zero bonus is still a bonus", file: SB, from: "  if (!attack && !dc) return null;\n", to: "", breaks: "C14" },
  { name: "THE GAP: the attack never adds it", file: CW, from: "            ...(ownBonus?.attack && !isItemCast ? [{ label: ownBonus.label, value: ownBonus.attack, type: ownBonus.type }] : [])", to: "            ...[]", breaks: "C14" },
  { name: "an item's cast takes it", file: CW, from: "        ...(spellOwnBonus(spell)?.dc && !isItemCast ? [", to: "        ...(spellOwnBonus(spell)?.dc ? [", breaks: "C14" },
  // C15
  { name: "THE GAP: a stack group is never read", file: RS, from: "    if (group.length < 2) continue;\n", to: "    continue;\n", breaks: "C15" },
  { name: "a penalty is grouped too", file: RS, from: "    if (!entry.stackGroup || !entry.applied || entry.value <= 0) continue;", to: "    if (!entry.stackGroup || !entry.applied) continue;", breaks: "C15" },
  { name: "the least is kept, not the greatest", file: RS, from: "    const best = group.reduce((a, b) => (b.value > a.value ? b : a));\n    for (const entry of group) {", to: "    const best = group.reduce((a, b) => (b.value < a.value ? b : a));\n    for (const entry of group) {", breaks: "C15" },
  { name: "a conditional drops its group", file: CO, from: "      modifiers.push({ label: row.label, value: row.value, type: row.type, ...(row.stackGroup ? { stackGroup: row.stackGroup } : {}) });", to: "      modifiers.push({ label: row.label, value: row.value, type: row.type });", breaks: "C15" },
  { name: "a stat row drops its group", file: SR, from: ", ...(String(row.stackGroup ?? \"\").trim() ? { stackGroup: String(row.stackGroup).trim() } : {})", to: "", breaks: "C15" },
  { name: "the pool drops its group", file: BR, from: "      ...(entry.stackGroup ? { stackGroup: String(entry.stackGroup) } : {})\n", to: "", breaks: "C15" },
  // C16
  { name: "THE GAP: \"Learned Caster\" is unread", file: PQ, from: "  if (m) return { type: \"casterStyle\", style: m[1].toLowerCase() };", to: "  if (m) return null;", breaks: "C16" },
  { name: "any caster meets it", file: PQ, from: "        if (actorStats.casterStyle !== undefined && actorStats.casterStyle !== parsed.style) return false;", to: "        if (actorStats.casterStyle !== undefined && !actorStats.casterStyle) return false;", breaks: "C16" },
  { name: "the picker never says how the class casts", file: PF, from: "    casterStyle: String(resolveCasterStyle(Array.from(actor?.items ?? []).find((i) => i?.type === \"class\")?.system?.casterStyle ?? \"\", Array.from(actor?.items ?? [])) ?? \"\").trim().toLowerCase()", to: "    casterStyle: undefined", breaks: "C16" },
  { name: "the picker reads the class's style, not the resolved one (review)", file: PF, from: "    casterStyle: String(resolveCasterStyle(Array.from(actor?.items ?? []).find((i) => i?.type === \"class\")?.system?.casterStyle ?? \"\", Array.from(actor?.items ?? [])) ?? \"\").trim().toLowerCase()", to: "    casterStyle: String(Array.from(actor?.items ?? []).find((i) => i?.type === \"class\")?.system?.casterStyle ?? \"\").trim().toLowerCase()", breaks: "C16" },
  // R — found in review
  { name: "an opened trait never passes the source gate (review)", file: PF, from: "        if (!matchesSource(entry.system?.sourceClass, [className, ...openedByTrait].join(\", \"))) return false;", to: "        if (!matchesSource(entry.system?.sourceClass, className)) return false;", breaks: "R" },
  { name: "every opened class passes the source gate, trait or not (review)", file: PF, from: "        const openedByTrait = parseNames(traitClasses).filter((c) => ownTraits.includes(c));", to: "        const openedByTrait = parseNames(traitClasses);", breaks: "R" },
  { name: "the dialog is not told what a Refocus restores (review)", file: ACW, from: "      restores: refocusTarget ? [refocusTarget.system?.category, refocusTarget.name].map((v) => String(v ?? \"\").trim()).filter(Boolean) : [],\n", to: "", breaks: "R" },
  { name: "the dialog drops the restores and sheathed axes (review)", file: m("apps", "check-dialog.mjs"), from: "            sheathedGroups: sheathedGroups || sheathedGroupsOf(actor?.items ?? []), restores\n", to: "\n", breaks: "R" },
  // version
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.673.1\"", to: "\"version\": \"3.670.1\"", breaks: "Z0" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block7-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block7-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block7-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block7-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
