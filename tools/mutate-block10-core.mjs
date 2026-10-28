#!/usr/bin/env node
/** mutate-block10-core — the mutation half of verify-block10-core. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), COMP = m("companion.mjs"), CW = m("companion-workflow.mjs"), CF = m("companion-feats.mjs"),
  ACT = m("documents", "actor.mjs"), ITEM = m("documents", "item.mjs"), SHEET = m("sheets", "actor-sheet.mjs"), PF = m("picker-filters.mjs"),
  AREA = m("creature-area.mjs"), CAW = m("creature-activation-workflow.mjs"), SOUL = m("conditions", "soul-drain.mjs"), DY = m("combat", "dying-workflow.mjs"),
  SOULA = m("magic", "animal-soul.mjs"), AW = m("combat", "attack-workflow.mjs"), REP = m("magic", "repertoire.mjs"), REPW = m("magic", "repertoire-workflow.mjs"),
  HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"), BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"),
  TPL = path.join(SYSTEM_ROOT, "template.json"), SJ = path.join(SYSTEM_ROOT, "system.json");

const MUTATIONS = [
  { name: "THE GAP: an \"animal\" key is accepted as a module kind", file: API, from: "if (!key || key === \"animal\" || !className || !pack) return null;", to: "if (!key || !className || !pack) return null;", breaks: "C1" },
  { name: "a kind without a pack is accepted", file: API, from: "if (!key || key === \"animal\" || !className || !pack) return null;", to: "if (!key || key === \"animal\" || !className) return null;", breaks: "C1" },
  { name: "the level rule is dropped at registration", file: API, from: "levelFrom: typeof raw?.levelFrom === \"function\" ? raw.levelFrom : null,", to: "levelFrom: null,", breaks: "C1/C2" },
  { name: "sizeAbilityMods: false is not kept", file: API, from: "sizeAbilityMods: raw?.sizeAbilityMods !== false,", to: "sizeAbilityMods: true,", breaks: "C1" },
  { name: "the key is not lower-cased", file: API, from: "const key = String(raw?.key ?? \"\").trim().toLowerCase();", to: "const key = String(raw?.key ?? \"\").trim();", breaks: "C1" },
  { name: "a blank kind is not an animal", file: COMP, from: "return String(actor?.system?.companion?.kind ?? \"\").trim().toLowerCase() || ANIMAL_KIND;", to: "return String(actor?.system?.companion?.kind ?? \"\").trim().toLowerCase();", breaks: "C1" },
  { name: "an unknown kind reads as an animal", file: COMP, from: "  return registeredCompanionKind(want);\n}", to: "  return registeredCompanionKind(want) ?? ANIMAL_KIND_SPEC;\n}", breaks: "C1" },
  { name: "THE GAP: every companion takes its master's level", file: COMP, from: "if (typeof spec?.levelFrom !== \"function\") return masterLevel;", to: "return masterLevel;", breaks: "C2" },
  { name: "a level rule below 1 is kept", file: COMP, from: "return Number.isFinite(level) && level >= 1 ? level : masterLevel;", to: "return Number.isFinite(level) ? level : masterLevel;", breaks: "C2" },
  { name: "in step is still the master's level", file: COMP, from: "return { bound: true, inSync: expected === own, masterLevel: master, companionLevel: own, expectedLevel: expected };", to: "return { bound: true, inSync: master === own, masterLevel: master, companionLevel: own, expectedLevel: expected };", breaks: "C2" },
  { name: "the kind is not recorded", file: COMP, from: "kind: String(kind ?? \"\").trim().toLowerCase() === ANIMAL_KIND ? \"\" : String(kind ?? \"\").trim().toLowerCase(),", to: "kind: \"\",", breaks: "C1" },
  { name: "the template has no kind", file: TPL, from: "\"kind\": \"\",\n        \"grownSize\": \"\"", to: "\"grownSize\": \"\"", breaks: "C1/C3" },
  { name: "THE GAP: one companion of any kind", file: CW, from: "isBoundTo(a, id) && (want === null || companionKindOf(a) === want)", to: "isBoundTo(a, id)", breaks: "C1" },
  { name: "a second of the same kind is not refused", file: CW, from: "const existing = companionsOf(masterActor, spec.key);", to: "const existing = [];", breaks: "C1" },
  { name: "a kind's base creatures come from the animal companions' pack", file: CW, from: "  return game.packs?.get(spec.pack) ?? null;", to: "  return contentPack(COMPANION_PACK);", breaks: "C1" },
  { name: "the kind's class is not looked for", file: CW, from: "normalise(d.name) === normalise(spec.className)", to: "normalise(d.name) === normalise(\"Animal Companion\")", breaks: "C1" },
  { name: "the sync pushes the master's level", file: CW, from: "const level = expectedCompanionLevel(masterActor, companion);", to: "const level = Math.max(1, Math.floor(Number(masterActor?.system?.identity?.level ?? 1)));", breaks: "C2" },
  { name: "created at the master's level", file: CW, from: "const level = expectedCompanionLevel(masterActor, preview);", to: "const level = Math.max(1, Math.floor(Number(masterActor.system?.identity?.level ?? 1)));", breaks: "C2" },
  { name: "the sheet says Animal Companion for every kind", file: HBS, from: "{{else if isCompanion}}{{companionSummary.kindLabel}}{{else if isFamiliar}}", to: "{{else if isCompanion}}Animal Companion{{else if isFamiliar}}", breaks: "C1" },
  { name: "the sheet measures drift against the master", file: SHEET, from: "expectedLevel: master ? expectedCompanionLevel(master, actor) : null", to: "expectedLevel: null", breaks: "C1" },
  { name: "the API does not register kinds", file: APIW, from: "registerCompanionKind: (kind, moduleId) => registerCompanionKind(kind, moduleId),", to: "", breaks: "C1" },
  { name: "THE GAP: the grown size is ignored", file: CF, from: "  if (grownIndex < 0) return picked;", to: "  return picked;", breaks: "C3" },
  { name: "the smaller of the two governs", file: CF, from: "return SIZE_STEPS.indexOf(picked) >= grownIndex ? picked : grown;", to: "return SIZE_STEPS.indexOf(picked) <= grownIndex ? picked : grown;", breaks: "C3" },
  { name: "the actor's size ignores growth", file: ACT, from: "        grownSize: system.companion?.grownSize\n", to: "", breaks: "C3" },
  { name: "the natural attacks do not grow", file: ITEM, from: "      grownSize: companion?.grownSize,\n", to: "", breaks: "C3" },
  { name: "the tokens are not resized", file: BOOT, from: "if (actor?.type === \"companion\" && foundry.utils.hasProperty(changed ?? {}, \"system.companion.grownSize\")) {", to: "if (false) {", breaks: "C3" },
  { name: "the next token keeps its old size", file: CW, from: "await companion.update({ \"prototypeToken.width\": side, \"prototypeToken.height\": side });", to: "", breaks: "C3" },
  { name: "THE GAP: a dragon's feat is offered to every companion", file: PF, from: "if (featKind) return isCompanion && (String(companionKind || \"animal\").toLowerCase() === featKind);", to: "if (featKind) return isCompanion;", breaks: "C4" },
  { name: "companion feats are offered to characters", file: PF, from: "if (featKind) return isCompanion && (String(companionKind || \"animal\").toLowerCase() === featKind);", to: "if (featKind) return true;", breaks: "C4" },
  { name: "a Companion-trait feat names no kind", file: PF, from: "  return hasCompanionTrait(entry) ? \"animal\" : \"\";", to: "  return \"\";", breaks: "C4" },
  { name: "the kind is not asked of the pack", file: PF, from: ", \"flags.trg-prime.companionKind\"],", to: "],", breaks: "C4" },
  { name: "the sheet does not say its kind", file: SHEET, from: "      companionKind: companionKindOf(this.actor),\n", to: "", breaks: "C4" },
  { name: "THE GAP: dice by level are never resolved", file: AREA, from: "  const area = declared?.damage?.perLevel ? { ...declared, damage: perLevelDamage(declared.damage, level) } : declared;", to: "  const area = declared;", breaks: "C5" },
  { name: "one die whatever the level", file: AREA, from: "return { ...rest, formula: `${n}d${die[1]}` };", to: "return { ...rest, formula: `1d${die[1]}` };", breaks: "C5" },
  { name: "a level of 0 still rolls", file: AREA, from: "if (!die || !(n >= 1)) return rest;", to: "if (!die) return rest;", breaks: "C5" },
  { name: "a borrowed breath is read without its level", file: AREA, from: "const dmgOf = (i) => perLevelDamage(areaOf(i)?.damage, level);", to: "const dmgOf = (i) => areaOf(i)?.damage;", breaks: "C5" },
  { name: "the Use does not pass the level", file: CAW, from: "declaredAreaUse(item, { worldTime: Number(game.time?.worldTime ?? 0), level: Number(actor?.system?.identity?.level ?? 0) })", to: "declaredAreaUse(item, { worldTime: Number(game.time?.worldTime ?? 0) })", breaks: "C5" },
  { name: "THE GAP: a dragon's size still changes its Str and Dex", file: ACT, from: "if (sizeEntry && sizeCountsForAbilities) {", to: "if (sizeEntry) {", breaks: "C6" },
  { name: "the banner is always shown", file: HBS, from: "{{#unless isVehicle}}{{#unless hideAbilityPoints}}", to: "{{#unless isVehicle}}{{#unless false}}", breaks: "C7" },
  { name: "the sheet never hides the pool", file: SHEET, from: "context.hideAbilityPoints = isCompanion(actor) && companionKindSpec(companionKindOf(actor))?.abilityPoints === false;", to: "context.hideAbilityPoints = false;", breaks: "C7" },
  { name: "THE GAP: held Soul Drain heals like any other", file: ACT, from: "if (statusId === \"soulDrain\" && options.force !== true) {", to: "if (false) {", breaks: "C8" },
  { name: "a removal is not held", file: ACT, from: "const requested = options.active === false ? 0 : options.value;", to: "const requested = options.value;", breaks: "C8" },
  { name: "a player can type it away", file: ACT, from: "const heldFloor = statusId === \"soulDrain\" && !game.user?.isGM ? heldSoulDrain(this) : 0;", to: "const heldFloor = 0;", breaks: "C8" },
  { name: "only the first source is counted", file: SOUL, from: "return Object.values(held).reduce((sum, n) => sum + Math.max(0, Math.floor(Number(n) || 0)), 0);", to: "return Math.max(0, Math.floor(Number(Object.values(held)[0]) || 0));", breaks: "C8" },
  { name: "the request is not raised to the hold", file: SOUL, from: "  return Math.max(want, floor);", to: "  return want;", breaks: "C8" },
  { name: "the hold is not written", file: DY, from: "  await actor.update({ [`flags.trg-prime.${SOUL_DRAIN_HOLD_FLAG}.${key}`]: had + n });\n", to: "", breaks: "C8" },
  { name: "a release with heal heals nothing", file: DY, from: "  if (heal && target !== current) await setSoulDrain(actor, target);\n", to: "", breaks: "C8" },
  { name: "a healed release heals nothing in the sum", file: SOUL, from: "  const target = Math.max(0, now - n);", to: "  const target = now;", breaks: "C8" },
  { name: "the hold outlasts the GM's heal", file: SOUL, from: "  return { n, left: Math.min(h - n, target), target };", to: "  return { n, left: h - n, target };", breaks: "C8" },
  { name: "a release gives up more than is held", file: SOUL, from: ": Math.min(h, Math.max(0, Math.floor(Number(amount) || 0)));", to: ": Math.max(0, Math.floor(Number(amount) || 0));", breaks: "C8" },
  { name: "the card shows the value asked, not the value held", file: DY, from: "  const newDrain = soulDrainWithHold(value, heldSoulDrain(actor));", to: "  const newDrain = Math.max(0, Math.floor(Number(value) || 0));", breaks: "C8" },
  { name: "the rest counts what it asked to heal", file: path.join(SYSTEM_ROOT, "module", "rest", "rest-workflow.mjs"), from: "soulDrainHealed = Math.max(0, soulDrainBefore - Number(set?.soulDrain ?? after));", to: "soulDrainHealed = soulDrainBefore - after;", breaks: "C8" },
  { name: "the API does not hold Soul Drain", file: APIW, from: "    holdSoulDrain: async (actor, source, amount) => (await import(\"./combat/dying-workflow.mjs\")).holdSoulDrain(actor, source, amount),\n", to: "", breaks: "C8" },
  { name: "Animal Soul looks under the old flag", file: SOULA, from: "String(a?.system?.companion?.masterId ?? \"\").trim() === actor.id", to: "a?.getFlag?.(\"trg-prime\", \"companionMaster\") === actor.id", breaks: "C9" },
  { name: "the first bound companion is taken, beside the target or not", file: AW, from: "return bound && Boolean(sideFlags(ally, squares));", to: "return bound;", breaks: "F" },
  { name: "THE GAP: the owner's schedule is not read", file: REP, from: "const raw = { ...(classItem?.flags?.[SYSTEM_ID]?.repertoire ?? {}), ...(actor?.flags?.[SYSTEM_ID]?.repertoire ?? {}) };", to: "const raw = { ...(classItem?.flags?.[SYSTEM_ID]?.repertoire ?? {}) };", breaks: "C10" },
  { name: "first picks are always two", file: REP, from: "  if (Number.isFinite(first) && first >= 0) out.firstPicks = first;\n", to: "", breaks: "C10" },
  { name: "first picks are always PP 2", file: REP, from: "  if (raw?.firstPickExact === false) out.firstPickExact = false;\n", to: "", breaks: "C10" },
  { name: "the workflow reads the class's schedule only", file: REPW, from: "schedule: repertoireSchedule(classItem, actor)", to: "schedule: repertoireSchedule(classItem)", breaks: "C10" },
  { name: "THE GAP: a rung with no weapon rolls nothing", file: AREA, from: "        ?? fallbackWeapon(row.fallback, size);\n", to: ";\n", breaks: "C11" },
  { name: "the fallback is not resized", file: AREA, from: "const resized = at && fallback.size ? resizedNaturalDamage(String(fallback.damage), String(fallback.size), at) : null;", to: "const resized = null;", breaks: "C11" },
  { name: "the fallback beats the creature's own Wings", file: AREA, from: "      const weapon = Array.from(items ?? []).find((i) => i?.type === \"weapon\" && re.test(String(i.name ?? \"\")))\n        ?? fallbackWeapon(row.fallback, size);", to: "      const weapon = fallbackWeapon(row.fallback, size)\n        ?? Array.from(items ?? []).find((i) => i?.type === \"weapon\" && re.test(String(i.name ?? \"\")));", breaks: "C11" },
  { name: "a fallback with no damage is still used", file: AREA, from: "if (!fallback || typeof fallback !== \"object\" || !fallback.damage) return null;", to: "if (!fallback || typeof fallback !== \"object\") return null;", breaks: "C11" },
  { name: "the Use does not pass the size", file: CAW, from: "      size: String(actor.system?.identity?.size ?? \"\")\n", to: "", breaks: "C11" },
  { name: "the module helpers have no death question", file: APIW, from: "      isDead: async (actor) => (await import(\"./combat/death-state.mjs\")).isDead(actor),\n", to: "", breaks: "C12" },
  { name: "THE LIVE FAULT: a player's companion is created directly", file: CW, from: "  const companion = await relayCreateCompanion(masterActor, data, () => Actor.create(data));", to: "  const companion = await Actor.create(data);", breaks: "L1" },
  { name: "a companion bound to another character is made", file: m("combat", "target-relay.mjs"), from: "  if (!master?.id || String(data.system?.companion?.masterId ?? \"\") !== master.id) return \"not bound to that character\";\n", to: "", breaks: "L1" },
  { name: "any actor may be made through the relay", file: m("combat", "target-relay.mjs"), from: "  if (!data || typeof data !== \"object\" || data.type !== \"companion\") return \"not a companion\";", to: "  if (!data || typeof data !== \"object\") return \"not a companion\";", breaks: "L1" },
  { name: "a player who does not own the master may ask", file: m("combat", "target-relay.mjs"), from: "  if (!askerOwnsMaster) return \"the asker does not own that character\";\n", to: "", breaks: "L1" },
  { name: "every player asks the GM, even one who may create", file: m("combat", "target-relay.mjs"), from: "  return typeof user.can === \"function\" ? !user.can(\"ACTOR_CREATE\") : true;", to: "  return true;", breaks: "L1" },
  { name: "the GM's client answers no companion", file: m("combat", "target-relay.mjs"), from: "      const created = await deps.createCompanion(payload.data);", to: "      const created = null;", breaks: "L1" },
  { name: "THE LIVE FAULT: the companion keeps the template's HP", file: CW, from: "    await companion.update({ \"system.resources.hp.value\": hpMax });\n", to: "", breaks: "L2" },
  { name: "THE LIVE FAULT: the compendium source is dropped", file: CW, from: "  if (uuid.startsWith(\"Compendium.\")) data._stats = { ...(data._stats ?? {}), compendiumSource: uuid };\n", to: "", breaks: "L3" },
  { name: "the old note is dropped, not amended", file: m("magic", "spell-damage-ability.mjs"), from: "    ? { ...e, text: String(e.text).replace(RE, ADDED_FOR_YOU) }", to: "    ? null", breaks: "L6" },
  { name: "the old note is amended even when nothing is added", file: m("magic", "spell-damage-ability.mjs"), from: "  if (!Array.isArray(effects) || !damageAbility(damageRow, printedText)) return effects;\n  const RE", to: "  if (!Array.isArray(effects)) return effects;\n  const RE", breaks: "L6" },
  { name: "the cast does not amend the note", file: m("magic", "cast-workflow.mjs"), from: "    effEffects = withAmendedAddByHandNotes(effEffects, spellData.damage, String(spellData.description ?? \"\"));", to: "    void withAmendedAddByHandNotes;", breaks: "L6" },
  { name: "the patch version is not raised", file: SJ, from: "\"version\": \"3.674.1\"", to: "\"version\": \"3.674.0\"", breaks: "Z1" },
  { name: "the kind's setting-up is never awaited", file: CW, from: "  if (typeof beforeCard === \"function\") await beforeCard(companion);\n", to: "", breaks: "L4" },
  { name: "the version is not raised", file: SJ, from: "\"version\": \"3.674.1\"", to: "\"version\": \"3.673.3\"", breaks: "Z0" },
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block10-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block10-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-block10-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block10-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
