#!/usr/bin/env node
/** mutate-session-fixes-1022 — the mutation half of verify-session-fixes-1022. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const TR = m("combat", "target-relay.mjs"), TRW = m("combat", "target-relay-workflow.mjs"), AC = m("documents", "actor.mjs");
const DS = m("combat", "death-state.mjs"), DY = m("combat", "dying-workflow.mjs"), CW = m("magic", "cast-workflow.mjs");
const SDA = m("magic", "spell-damage-ability.mjs"), PR = m("data", "pack-repairs.mjs"), MG = m("migration.mjs");
const DO = m("combat", "defence-offer.mjs"), DOW = m("combat", "defence-offer-workflow.mjs"), AW = m("combat", "attack-workflow.mjs");
const AL = m("alchemical-workflow.mjs"), SW = m("magic", "spiritual-weapon-workflow.mjs"), API = m("module-api-workflow.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");

const MUTATIONS = [
  // A
  { name: "THE ORB OF FIRE COMPLAINT: the Actor's toggle writes directly again", file: AC, from: "    if (statusRelayNeeded(this, game.user)) {\n", to: "    if (false) {\n", breaks: "A5" },
  { name: "a player relays even on its own character", file: TR, from: "  if (!actor || !user || user.isGM) return false;\n  return needsRelay(actor);", to: "  if (!actor || !user || user.isGM) return false;\n  return true;", breaks: "A1" },
  { name: "the GM relays to itself", file: TR, from: "  if (!actor || !user || user.isGM) return false;", to: "  if (!actor || !user) return false;", breaks: "A2" },
  { name: "the immunity override crosses the relay", file: TR, from: "const RELAYABLE_STATUS_OPTIONS = Object.freeze([\"active\", \"value\", \"damageType\", \"overlay\"]);", to: "const RELAYABLE_STATUS_OPTIONS = Object.freeze([\"active\", \"value\", \"damageType\", \"overlay\", \"force\"]);", breaks: "A4" },
  { name: "a value is sent as a string", file: TR, from: "    if (key === \"value\") { if (Number.isFinite(Number(value))) out.value = Number(value); continue; }", to: "    if (key === \"value\") { out.value = value; continue; }", breaks: "A3" },
  { name: "a failed relay is silent", file: AC, from: "      if (!ok) {\n        ui.notifications?.warn?.(`${condition?.label ?? statusId} could not be applied", to: "      if (false) {\n        ui.notifications?.warn?.(`${condition?.label ?? statusId} could not be applied", breaks: "A6" },
  { name: "the value dialog is sent to the GM's screen", file: AC, from: "      if (condition?.valued && options.value === undefined && options.active !== false) {", to: "      if (false) {", breaks: "A7" },
  // B
  { name: "a player's client reaps the GM's creature", file: DS, from: "  if (!user || user.isGM) return true;\n  return actor?.isOwner !== false;", to: "  return true;", breaks: "B1" },
  { name: "reapDead stops asking", file: DS, from: "  if (!reapsHere(actor, globalThis.game?.user ?? null)) return out;\n", to: "", breaks: "B2" },
  { name: "a drop below zero writes the GM's creature directly", file: DY, from: "  if (!actor.isOwner) {\n    const { relayDyingAt }", to: "  if (false) {\n    const { relayDyingAt }", breaks: "B3" },
  { name: "the GM's client ignores the critical", file: TR, from: "{ isCritical: payload.isCritical === true }", to: "{ isCritical: false }", breaks: "B4" },
  { name: "a request with no number drops the creature to zero", file: TR, from: "      if (!Number.isFinite(finalHP)) return { ok: false, reason: \"no hit points named\" };\n", to: "", breaks: "B5" },
  { name: "Soul Destruction's mark is refused", file: TR, from: "\"ppDrain\", \"apWatch\", \"soulDestroyed\"]", to: "\"ppDrain\", \"apWatch\"]", breaks: "B6" },
  // C
  { name: "THE HURLING COMPLAINT: the cast's key never reaches the damage", file: CW, from: "dmg, actor.system ?? {}, castingAbilityKey,\n", to: "dmg, actor.system ?? {}, \"\",\n", breaks: "C5" },
  { name: "THE 28 OCTOBER COMPLAINT: a copy with no row ignores its printed sentence", file: CW, from: "    String(spellData.description ?? \"\")).formula;", to: "    \"\").formula;", breaks: "C13" },
  { name: "the printed text is never read", file: SDA, from: "  return printedDamageAbility(printedText);", to: "  return \"\";", breaks: "C11" },
  { name: "the printed text overrides a declared row", file: SDA, from: "  if (damageRow && Object.hasOwn(damageRow, \"addAbility\")) {", to: "  if (damageRow?.addAbility) {", breaks: "C12" },
  { name: "any \"magical ability score\" in the text adds it", file: SDA, from: "  { re: /\\binflicts\\s+\\d*d\\d+\\s*\\+\\s*(?:your\\s+)?magical ability score\\b/i, ability: CASTING },", to: "  { re: /magical ability score/i, ability: CASTING },", breaks: "C11" },
  { name: "Guiding Stone's sentence is not read", file: SDA, from: "  { re: /\\bequal to\\s+\\d*d\\d+\\s+plus your melee damage modifier\\b/i, ability: \"strength\" }\n", to: "", breaks: "C11" },
  { name: "\"casting\" is not a word a row may say", file: SDA, from: "  return ABILITIES.includes(a) || a === CASTING ? a : \"\";", to: "  return ABILITIES.includes(a) ? a : \"\";", breaks: "C1" },
  { name: "the sheet's ability wins over the cast's", file: SDA, from: "    ? [castingAbilityKey, casterSystem?.magic?.castingAbility]", to: "    ? [casterSystem?.magic?.castingAbility, castingAbilityKey]", breaks: "C2" },
  { name: "the Spellcraft swap is ignored", file: CW, from: "(isInnate ? innateAbilityAttr : (swapAbility ?? system.magic?.castingAbility))", to: "(isInnate ? innateAbilityAttr : system.magic?.castingAbility)", breaks: "C6" },
  { name: "owned copies keep the bare 1d6", file: PR, from: "    field: \"damage\", since: \"3.666.1\",", to: "    field: \"damage\", since: \"3.666.0\",", breaks: "C7" },
  { name: "the migration gate stays where it was", file: MG, from: "runIf(\"3.666.1\", \"stale owned copies of repaired pack items\"", to: "runIf(\"3.648.0\", \"stale owned copies of repaired pack items\"", breaks: "C8" },
  // D
  { name: "THE NIMBLE DODGE COMPLAINT: a Strike asks nobody", file: AW, from: "    await offerDefences(actor, targetActor, { kind: \"weapon\", what: weapon.name });\n", to: "", breaks: "D10" },
  { name: "a spell attack asks nobody", file: CW, from: "      await offerDefences(actor, defender, { kind: \"spell\", what: spell.name });\n", to: "", breaks: "D11" },
  { name: "a bomb asks nobody", file: AL, from: "    await offerDefences(actor, targetActor, { kind: \"bomb\", what: item.name });\n", to: "", breaks: "D12" },
  { name: "a defender with no reaction left is still offered one", file: DO, from: "      : inCombat && !(Number(reactions) > 0)\n      ? \"no reaction left this round\"", to: "      : false\n      ? \"no reaction left this round\"", breaks: "D2" },
  { name: "a flat-footed defender is offered a reaction", file: DO, from: "    const reason = blockReason\n      ? String(blockReason)\n      :", to: "    const reason = false\n      ? String(blockReason)\n      :", breaks: "D3" },
  { name: "a reaction already up is offered again", file: DO, from: "    if (!c?.has || c.alreadyUp) continue;", to: "    if (!c?.has) continue;", breaks: "D4" },
  { name: "a weapon-only reaction is offered against a spell", file: DO, from: "  return oneAttackUsedBy(oneAttackSpec(against === \"weapon\" ? { against: \"weapon\" } : true), {", to: "  return oneAttackUsedBy(oneAttackSpec(true), {", breaks: "D5" },
  { name: "the GM is asked while the defender's player sits there", file: DO, from: "  const own = players.find((u) => actorId && u.characterId === actorId);\n  if (own) return own.id;\n  if (players.length) return players[0].id;\n", to: "", breaks: "D6" },
  { name: "an answer may take what was never offered", file: DO, from: "  return Array.from(taken ?? []).map(norm).filter((k) => allowed.has(k));", to: "  return Array.from(taken ?? []).map(norm);", breaks: "D7" },
  { name: "Nimble Dodge is offered in armour", file: DO, from: "    ? \"not while subject to an ACP or encumbered\"", to: "    ? null", breaks: "D8" },
  { name: "the answering client acts on a stale offer", file: DOW, from: "      const stillOpen = offered.filter((o) => asked.includes(o.key));", to: "      const stillOpen = (data.offered ?? []);", breaks: "D13" },
  { name: "the attack waits for ever", file: DOW, from: "  if (taken === null) {\n    ui.notifications?.warn?.", to: "  if (taken === undefined) {\n    ui.notifications?.warn?.", breaks: "D14" },
  { name: "every client answers", file: DOW, from: "  if (data?.action !== ASK || data.answererId !== game.user?.id) return;", to: "  if (data?.action !== ASK) return;", breaks: "D15" },
  { name: "the listener is never registered", file: BOOT, from: "  registerDefenceOffers();\n", to: "", breaks: "D16" },
  { name: "modules cannot register a reaction", file: API, from: "    registerDefenceOffer: (name, spec, moduleId) => registerDefenceOffer(name, spec, moduleId),\n", to: "", breaks: "D16" },
  { name: "a spiritual weapon asks nobody", file: SW, from: "    await offerDefences(caster, targetActor, { kind: \"spiritualWeapon\", what: record.label });\n", to: "", breaks: "D12" },
  { name: "the GM's client never runs enterDyingAt", file: TRW, from: "      return enterDyingAt(target, finalHP, options);", to: "      return null;", breaks: "B8" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-session-fixes-1022.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-session-fixes-1022: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-session-fixes-1022: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-session-fixes-1022: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
