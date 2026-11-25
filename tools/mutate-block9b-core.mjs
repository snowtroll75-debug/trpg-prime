#!/usr/bin/env node
/** mutate-block9b-core — the mutation half of verify-block9b-core (3.689.0: H21 rune declarations, H22 the strike's die and fumble). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const M = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RD = M("rune-declarations.mjs"), RE = M("rune-effects.mjs"), ACT = M("documents", "actor.mjs"), SA = M("magic", "spell-adder.mjs"),
  CR = M("codex-runes.mjs"), CW = M("magic", "cast-workflow.mjs"), AW = M("combat", "attack-workflow.mjs"), DD = M("combat", "defence-dc.mjs"),
  CRW = M("magic", "control-register-workflow.mjs"), IW = M("items-workflow.mjs"), CT = M("creature-traits.mjs"), CIS = M("magic", "cast-items.mjs"), APW = M("module-api-workflow.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json");
const MUTATIONS = [
  { name: "a tier list read from the first tier always", file: RD, from: "    const at = Math.min(Math.max(1, Math.floor(Number(tier) || 1)), value.length) - 1;\n    return Number(value[at]) || 0;", to: "    return Number(value[0]) || 0;" },
  { name: "a rune not worn still declares", file: RD, from: "  const entries = counted ? activeDeclaredRunesOn(item, items) : declaredRunesOn(item);", to: "  const entries = declaredRunesOn(item);" },
  { name: "the control levels a rune adds are not added", file: ACT, from: "    ) + runeControlLevelBonus(Array.from(actor.items ?? []));", to: "    );" },
  { name: "the rune's Spell Adder is not a source", file: SA, from: "  for (const rune of runeSpellAdders(items)) sources.push(rune);", to: "" },
  { name: "a declared resistance is not gathered", file: RE, from: "      if (!all.resistances.includes(type)) all.resistances.push(type);", to: "" },
  { name: "a resistance gathered twice", file: RE, from: "      if (!all.resistances.includes(type)) all.resistances.push(type);", to: "      all.resistances.push(type, type);" },
  { name: "Comfort's Max Dex not added", file: ACT, from: "      if (comfort) maxDexBonus += comfort;", to: "" },
  { name: "Comfort's Max Dex skipped on a specific item", file: ACT, from: "    if (item.type === \"armour\" && maxDexBonus !== -1) {\n      const comfort", to: "    if (item.type === \"armour\" && maxDexBonus !== -1 && !printedFinal) {\n      const comfort" },
  { name: "a full suit's +1 dropped", file: RD, from: "    const extra = fullSuit ? Math.max(0, Math.trunc(Number(spec.fullExtra) || 0)) : 0;", to: "    const extra = 0;" },
  { name: "the rune's donning time not read on the sheet", file: CR, from: "    const declared = runeDonningAP(item, category, { fullSuit });", to: "    const declared = null;" },
  { name: "Transcendent's piece still penalises", file: CW, from: "    .filter((item) => !runeWaivesArmourCastingPenalty(item, Array.from(actor.items ?? [])));", to: ";" },
  { name: "Astral Echoes on a 66", file: RD, from: "    if (except.includes(Math.trunc(Number(face) || 0))) continue;", to: "" },
  { name: "Astral Echoes not applied", file: AW, from: "      result = Math.max(1, result + echo.value);", to: "      result = Math.max(1, result);" },
  { name: "Astral Echoes below 1", file: AW, from: "      result = Math.max(1, result + echo.value);", to: "      result = result + echo.value;" },
  { name: "Aegisflow's share always whole", file: AW, from: "      const dr = uncoveredShare.has(item) ? Math.floor(full * uncoveredShare.get(item)) : full;", to: "      const dr = full;" },
  { name: "Aegisflow's piece left out", file: AW, from: "      if (share > 0) uncoveredShare.set(item, share);\n      return share > 0;", to: "      return false;" },
  { name: "Aegisflow's share is the lowest tier's", file: RD, from: "    share = Math.max(share, Math.min(1, Math.max(0, tierNumber(spec.share, d.entry.tier))));", to: "    share = Math.max(share, Math.min(1, Math.max(0, tierNumber(spec.share, 1))));" },
  { name: "Aegisflow adds its share where a helmet covers the head", file: AW, from: "      if (locationCovered || item.type !== \"armour\"", to: "      if (item.type !== \"armour\"" },
  { name: "the rune's defence rows not read", file: DD, from: "    for (const raw of runeDefenceRows(item, owned)) {", to: "    for (const raw of []) {" },
  { name: "a rune's attack kind alone is no scope", file: DD, from: "{ fromStance: false, kindIsScope: true });", to: "{ fromStance: false });" },
  { name: "any row's attack kind is scope", file: DD, from: "const kindScoped = kindIsScope && attackKinds.length > 0;", to: "const kindScoped = attackKinds.length > 0;" },
  { name: "a rune row's empty kind list is scope", file: DD, from: "const kindScoped = kindIsScope && attackKinds.length > 0;", to: "const kindScoped = kindIsScope;" },
  { name: "every row is a scope", file: DD, from: "  if (!stanceGated && !actions.length && !sourceTypes.length", to: "  if (false && !stanceGated && !actions.length && !sourceTypes.length" },
  { name: "a rune's kind-scoped row is marked a stance's", file: DD, from: "    fromStance: Boolean(stanceRow || fromStance),", to: "    fromStance: Boolean(stanceGated || fromStance)," },
  { name: "the summoned attacker is not named on a Strike", file: AW, from: "[...creatureTraits(actor.system ?? {}), ...summonedTraitsOf(actor)], { attackKind: \"weapon\" }", to: "creatureTraits(actor.system ?? {}), { attackKind: \"weapon\" }" },
  { name: "the summoned attacker is not named on a spell attack", file: CW, from: "[...creatureTraits(actor.system ?? {}), ...(await import(\"./control-register-workflow.mjs\")).summonedTraitsOf(actor)], { attackKind: \"spell\", lightLevel }", to: "creatureTraits(actor.system ?? {}), { attackKind: \"spell\", lightLevel }" },
  { name: "every register entry is a summons", file: CRW, from: "      if (![\"bound\", \"conjured\"].includes(entry?.source)) continue;", to: "" },
  { name: "Binding Sigils not on the save", file: CRW, from: "      ...(sigils ? [{ label: `${actor.name}'s binding runes`, value: sigils, type: \"untyped\" }] : [])", to: "" },
  { name: "Comfort's advantage not rolled", file: IW, from: "    ...(comfort ? { bias: \"advantage\" } : {}),\n", to: "" },
  { name: "Aetherfang's bypass not on the Strike's packet", file: AW, from: "      resistances: unstoppable ? new Set() : keptResistances(targetDefences.resistances),", to: "      resistances: unstoppable ? new Set() : targetDefences.resistances," },
  { name: "Aetherfang bypasses every resistance", file: AW, from: "      const kept = Array.from(list ?? []).filter((k) => !runeIgnores.types.includes(String(k).trim().toLowerCase()));", to: "      const kept = [];" },
  { name: "a `when` that says no still adds the die", file: RD, from: "    if (!applies && typeof d.spec?.when === \"function\") {", to: "    if (!applies && typeof d.spec?.when === \"function\") { applies = true; } if (false) {" },
  { name: "Leybound's die not added to the Strike", file: AW, from: "extraBaseDice + (brace?.extraDice ?? 0) + runeBaseDice.dice)", to: "extraBaseDice + (brace?.extraDice ?? 0))" },
  { name: "Gravitas's FDC not read", file: AW, from: " + runeFumbleDCModifier(weapon));", to: ");" },
  { name: "a suppressed resistance still counts", file: CT, from: "  for (const type of suppressedResistancesOf(actorSystem?.parent ?? null)) resistances.delete(type);", to: "" },
  { name: "a disabled effect still suppresses", file: CT, from: "    if (!effect || effect.disabled) continue;\n    const list = effect.flags?.[\"trg-prime\"]?.suppressedResistances;", to: "    if (!effect) continue;\n    const list = effect.flags?.[\"trg-prime\"]?.suppressedResistances;" },
  { name: "a second slot of one item dropped", file: CIS, from: "    const seenKey = slot ? `${itemId}#${slot}` : itemId;", to: "    const seenKey = itemId;" },
  { name: "the slot not kept on the offer", file: CIS, from: "consume, ...(slot ? { slot } : {}) });", to: "consume });" },
  { name: "the prompt's value forgets the slot", file: CIS, from: "  return slot ? `${text(offer?.itemId)}#${slot}` : text(offer?.itemId);", to: "  return text(offer?.itemId);" },
  { name: "no Exhaustion helper", file: APW, from: "      rollExhaustionCheck: async (actor, opts = {}) =>", to: "      rollExhaustionCheckX: async (actor, opts = {}) =>" },
  { name: "the natural die not on the strike", file: AW, from: "      natural: Number(check?.dice?.unmodified ?? 0) || 0,\n      fumble: Boolean(confirmedFumble)", to: "      fumble: Boolean(confirmedFumble)" },
  { name: "the fumble not on the strike", file: AW, from: "      natural: Number(check?.dice?.unmodified ?? 0) || 0,\n      fumble: Boolean(confirmedFumble)", to: "      natural: Number(check?.dice?.unmodified ?? 0) || 0" },
  { name: "the weapon fumble not announced", file: AW, from: "      Hooks.callAll(\"trgPrimeWeaponFumble\", {", to: "      (() => ({" },
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.714.0\"", to: "\"version\": \"3.688.4\"" },
  { name: "Z the download names the last release", file: SJ, from: "releases/download/v3.714.0/trg-prime.zip", to: "releases/download/v3.688.4/trg-prime.zip" },
  { name: "Z package.json is left behind", file: PJ, from: "\"version\": \"3.714.0\"", to: "\"version\": \"3.688.4\"" }
];

const verify = path.join(SYSTEM_ROOT, "tools", "verify-block9b-core.mjs");
const run = () => { try { execFileSync(process.execPath, [verify], { stdio: "pipe" }); return true; } catch { return false; } };
if (!run()) { console.log("mutate-block9b-core: verify-block9b-core already fails on the unmutated tree."); process.exit(1); }
const guard = guardFiles([...new Set(MUTATIONS.map((m) => m.file))]);
const results = [];
try {
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught" });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
process.stdout.write(bad.length ? `\nmutate-block9b-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block9b-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
