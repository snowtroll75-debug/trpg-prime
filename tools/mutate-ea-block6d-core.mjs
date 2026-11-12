#!/usr/bin/env node
/** mutate-ea-block6d-core — the mutation half of verify-ea-block6d-core. NEW at 3.684.0; D8+ at 3.684.1; D12-D16 from its review. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const CPP = m("magic", "cast-pp.mjs"), CDR = m("magic", "caster-damage-riders.mjs"), HR = m("magic", "healing-riders.mjs"), SDB = m("magic", "spell-damage-bonus.mjs"),
  CO = m("magic", "cast-options.mjs"), SCG = m("magic", "spell-check-gates.mjs"), GW = m("magic", "granted-warps.mjs"), SW = m("magic", "spell-warp.mjs"),
  API = m("module-api.mjs"), APIW = m("module-api-workflow.mjs"), RDB = m("combat", "rune-damage-bypass.mjs"), DW = m("combat", "damage-workflow.mjs"),
  DDC = m("combat", "defence-dc.mjs"), CG = m("magic", "component-gate.mjs"), AS = m("magic", "active-spells.mjs"), SUS = m("magic", "sustain-workflow.mjs"),
  ISD = m("magic", "innate-save-dc.mjs"), RW = m("reactions", "reactions-workflow.mjs"), CHK = m("dice", "check.mjs"), KC = m("magic", "known-cantrips.mjs"),
  MEM = m("magic", "memorisation.mjs"), MA = m("combat", "melee-ability.mjs"), ATK = m("combat", "attack-workflow.mjs"), SR = m("magic", "strike-riders.mjs"),
  RM = m("magic", "runemage.mjs"), CDC = m("magic", "casting-dc.mjs"), CW = m("magic", "cast-workflow.mjs"), SEF = m("magic", "spell-effects.mjs"),
  ASW = m("magic", "area-save-workflow.mjs"), SO = m("combat", "strike-options.mjs"), ACTOR = m("documents", "actor.mjs"), ALCH = m("alchemical-workflow.mjs"), SE = m("magic", "strike-edge.mjs");
const MUTATIONS = [
  { name: "the cast reaction is not told the PP as cast", file: CW, from: "      castPP: isCantrip ? 0 : Number(castPP ?? 0) + Number(manipulationPP ?? 0),\n", to: "", breaks: "V2" },
  { name: "the cast reaction's castPP is the paid total", file: CW, from: "      castPP: isCantrip ? 0 : Number(castPP ?? 0) + Number(manipulationPP ?? 0),", to: "      castPP: isCantrip ? 0 : Number(totalPP ?? 0) + Number(manipulationPP ?? 0),", breaks: "V2" },
  // Review fixes (3.684.0)
  { name: "REVIEW FIX REVERTED (Q101): an item cast's rider PP drop its metamagic", file: CPP, from: "  if (itemCast) return whole(itemPP ?? spellPP) + whole(warpPP) + whole(metamagicPP);", to: "  if (itemCast) return whole(itemPP ?? spellPP) + whole(warpPP);", breaks: "P2c" },
  { name: "REVIEW FIX REVERTED (G20): the Strike names no attack kind", file: ATK, from: "creatureTraits(actor.system ?? {}), { attackKind: \"weapon\" })\n    : { total: 0, entries: [] };", to: "creatureTraits(actor.system ?? {}))\n    : { total: 0, entries: [] };", breaks: "D6b" },
  { name: "the bomb names no attack kind", file: m("alchemical-workflow.mjs"), from: "      creatureTraits(actor.system ?? {}), { attackKind: \"bomb\" }\n", to: "      creatureTraits(actor.system ?? {})\n", breaks: "D6b" },
  { name: "the action names no attack kind", file: m("combat", "action-workflow.mjs"), from: "creatureTraits(actor?.system ?? {}), { attackKind: \"action\" });", to: "creatureTraits(actor?.system ?? {}));", breaks: "D6b" },
  { name: "a row naming no attack kind meets only an unnamed one", file: DDC, from: "    if ((entry.attackKinds ?? []).length && !entry.attackKinds.includes(kind)) return false;", to: "    if ((entry.attackKinds ?? []).length ? !entry.attackKinds.includes(kind) : kind !== \"\") return false;", breaks: "D6" },
  { name: "REVIEW FIX REVERTED (G20, Medium): the spell attack spends its wards before reading them", file: CW, from: "  // (A DEFENCE THAT LASTED ONE ATTACK is spent below, once the DB rows have\n  // been read — 3.684.0, G20 review.)\n", to: "  {\n    const { consumeOneAttackEffects } = await import(\"../combat/target-relay-workflow.mjs\");\n    await consumeOneAttackEffects(targetActor, { kind: \"spell\", attackerUuid: actor?.uuid ?? \"\" });\n  }\n", breaks: "D7" },
  { name: "REVIEW FIX REVERTED (G24): the HP hook walks the world for anyone", file: SUS, from: "  if (!knownSustainers().has(uuid)) return [];\n", to: "", breaks: "S7" },
  { name: "the index is never forgotten", file: SUS, from: "  Hooks.on(\"updateActor\", (_actor, changed) => { if (touchesActiveSpells(changed)) invalidateSustainerIndex(); });", to: "  Hooks.on(\"updateActor\", () => {});", breaks: "S7b" },
  { name: "every actor update forgets the index", file: SUS, from: "  if (ours && (\"activeSpells\" in ours || \"-=activeSpells\" in ours)) return true;", to: "  return true;", breaks: "S7c" },
  { name: "the settled hook carries no Save DC", file: CW, from: "    saveDC: nominalSaveDC ?? null,\n", to: "", breaks: "V1" },
  { name: "the settled hook's innate DC is never set", file: CW, from: "    if (innateSaveHere) innateSaveDCBase = Number(innateSaveHere.value ?? 0) || null;\n", to: "", breaks: "V1" },
  // P — G12, the PP a spell is cast at (Q101); Dangerous Sorcery (Q146)
  { name: "an innate cast counts only what it paid (nothing, for a Warlock)", file: CPP, from: "  if (innate) return whole(spellPP) + whole(warpPP) + whole(metamagicPP);", to: "  if (innate) return whole(totalPP);", breaks: "P2" },
  { name: "a cantrip counts its warps", file: CPP, from: "  if (cantrip) return 0;\n", to: "", breaks: "P2" },
  { name: "a rider's perPP is not read", file: CDR, from: "    const perPP = DICE.test(dice) ? 0 : Math.max(0, Math.trunc(Number(raw.perPP) || 0));", to: "    const perPP = 0;", breaks: "P3" },
  { name: "a per-PP rider rides a cantrip", file: CDR, from: "    if (r.perPP && !(Math.trunc(Number(castPP) || 0) > 0)) return false;\n", to: "", breaks: "P4" },
  { name: "a per-PP rider rolls its rate, not rate × PP", file: CDR, from: "  if (rider?.perPP) return String(Math.max(0, Math.trunc(Number(rider.perPP) || 0)) * Math.max(0, Math.trunc(Number(castPP) || 0)));", to: "  if (rider?.perPP) return String(rider.perPP);", breaks: "P5" },
  { name: "the Angelic Pact heals on any spell, Healing or not", file: HR, from: "    if (r.perPP && pp > 0 && (!r.traits?.length || r.traits.some((t) => spellTraits.includes(t)))) {", to: "    if (r.perPP && pp > 0) {", breaks: "P7" },
  { name: "Dangerous Sorcery adds to a spell with a duration", file: SDB, from: "      if (row.instantOnly === true && noDuration !== true) continue;\n", to: "", breaks: "P9" },
  { name: "valueFrom spellPP is worth nothing", file: SDB, from: "      const value = from === \"spellpp\"\n        ? Math.max(0, Math.trunc(Number(spellPP) || 0))", to: "      const value = from === \"spellpp\"\n        ? 0", breaks: "P8" },
  { name: "the attack path's riders are not told the cast's PP", file: CW, from: "    // AN ATTACK, AT THE CAST'S PP (3.684.0, G12 and G25).\n    castPP, attack: true", to: "    attack: true", breaks: "P11" },
  { name: "the effects (the heal) are not told the cast's PP", file: CW, from: "      // THE PP THE SPELL IS CAST AT (3.684.0, G12): a heal's per-PP rider (the Angelic Pact).\n      castPP,\n", to: "", breaks: "P11" },
  { name: "the attack path's damage bonus is told nothing of the spell", file: CW, from: "{ traits: spellData.traits ?? \"\", attributes: actor.system?.attributes ?? {}, spellPP: printedSpellPP(spellData), noDuration: spellHasNoDuration(spellData) }", to: "{ traits: spellData.traits ?? \"\", attributes: actor.system?.attributes ?? {} }", breaks: "P12" },
  { name: "the heal row tells the riders no PP", file: SEF, from: "            castPP,\n            traits: String(spell?.system?.traits ?? \"\")\n", to: "", breaks: "P13" },
  // O — G14, attack-only rows and one target's DC
  { name: "a cast option's attack answer is dropped", file: CO, from: "    if (attack) out.attackRows.push({ label, value: attack, type: str(got?.attackType) || \"untyped\" });", to: "", breaks: "O1" },
  { name: "one target's DC moves every target", file: CO, from: "  const mine = (targets ?? []).filter((t) => t?.uuid === id);", to: "  const mine = (targets ?? []);", breaks: "O2" },
  { name: "a gate row's attackOnly is dropped", file: SCG, from: ", ...(attackOnly ? { attackOnly: true } : {}) });", to: " });", breaks: "O3" },
  { name: "an attack-only row reaches the check", file: SCG, from: "  return { check: rows.filter((m) => !m?.attackOnly), attackOnly:", to: "  return { check: rows, attackOnly:", breaks: "O4" },
  { name: "THE GAP: the cast puts every gate row on the check", file: CW, from: "  modifiers.push(...gateSplit.check);", to: "  modifiers.push(...gated.modifiers);", breaks: "O5" },
  { name: "the spell attack's pool takes no option row", file: CW, from: "...(castOptionsApplied.attackRows ?? []), ...gateAttackOnlyRows],\n      // \"+ MAGICAL", to: "...gateAttackOnlyRows],\n      // \"+ MAGICAL", breaks: "O5" },
  { name: "every target saves against the cast's DC", file: CW, from: "    const saveDC = castSaveDC + targetShift.value;", to: "    const saveDC = castSaveDC;", breaks: "O6" },
  // T — G15, a warp that changes the type (Q106)
  { name: "anyTraits is ignored (Force Bolt offered the dragon's warp)", file: GW, from: "      if (m.anyTraits?.length && !m.anyTraits.some((t) => traits.includes(t))) continue;\n", to: "", breaks: "T2" },
  { name: "a spell that deals no damage is offered it", file: GW, from: "      if (m.damaging === true && !spellDealsDamage(spell?.system ?? {})) continue;\n", to: "", breaks: "T2" },
  { name: "when(actor) is ignored (every dragon offered every type)", file: GW, from: "        if (!offered) continue;\n", to: "", breaks: "T2" },
  { name: "the registry drops when", file: API, from: "    ...(typeof e.when === \"function\" ? { when: e.when } : {}),\n", to: "", breaks: "T1" },
  { name: "the aggregate drops the type", file: SW, from: "    if (m.damageType) mods.damageType = String(m.damageType).trim().toLowerCase();\n", to: "", breaks: "T3" },
  { name: "a warped row keeps its own type", file: GW, from: "  return { ...row, type };", to: "  return row;", breaks: "T4" },
  { name: "the attack's second pool keeps its own type", file: CW, from: "    const second = warpedDamageRow(normaliseSecondaryDamage(spellData), warpMods);", to: "    const second = normaliseSecondaryDamage(spellData);", breaks: "T6" },
  // B — G19, rune damage past resistance
  { name: "every rune is bypassed, named or not", file: RDB, from: "    if (!runes.includes(\"*\") && !runes.includes(key)) continue;\n", to: "", breaks: "B1" },
  { name: "the resistance is not lifted", file: RDB, from: "  let res = ignoreResistance ? strip(resistances) : Array.from(resistances ?? []);", to: "  let res = Array.from(resistances ?? []);", breaks: "B2/B3" },
  { name: "an immunity stays an immunity", file: RDB, from: "    imm = strip(immunities);\n", to: "", breaks: "B2/B3" },
  { name: "the packet resolution ignores the bypass", file: DW, from: "  const defences = (ignoreResistance || immunityAsResistance)", to: "  const defences = false", breaks: "B2" },
  { name: "the Strike's rune packet asks nothing", file: ATK, from: "        ...(runeBypass ? { ignoreResistance: true, immunityAsResistance: runeBypass.immunityAsResistance } : {}),\n", to: "", breaks: "B4" },
  // D — G20, DB rows against a spell attack (the ward FIX)
  { name: "a spell-only row meets a Strike", file: DDC, from: "    if ((entry.attackKinds ?? []).length && !entry.attackKinds.includes(kind)) return false;\n", to: "", breaks: "D1" },
  { name: "a light-gated row meets any light", file: DDC, from: "    if (entry.lightLevels && (light === null || !entry.lightLevels.includes(light))) return false;\n", to: "", breaks: "D1" },
  { name: "a light-gated row is refused as unscoped", file: DDC, from: " && !notSourceUuids.length && !lightLevels) return null;", to: " && !notSourceUuids.length) return null;", breaks: "D3" },
  { name: "THE GAP: a spell attack's DB reads no defender rows (wards hold only against swords)", file: CW, from: "baseDB + dragonhideDB + resilienceDB + Number(typedDefence.total ?? 0) : NaN;", to: "baseDB + dragonhideDB + resilienceDB : NaN;", breaks: "D5" },
  { name: "the spell attack does not say it is a spell", file: CW, from: "{ attackKind: \"spell\", lightLevel });", to: "{ lightLevel });", breaks: "D5" },
  // D8+ — 3.684.1, status bonuses to DB do not stack (Graham, 4 Nov 2026)
  { name: "THE DEFECT: the rows are summed untyped again", file: DDC, from: "  return { total: stacked.total, entries, disadvantages, notCounted: stacked.notCounted };", to: "  return { total: entries.reduce((sum, e) => sum + e.value, 0), entries, disadvantages, notCounted: stacked.notCounted };", breaks: "D8" },
  { name: "the rows stack against nothing on the DB", file: DDC, from: "    ? defenceStackBase(targetActor)\n", to: "    ? []\n", breaks: "D9" },
  { name: "the DB's breakdown is read for every DC", file: DDC, from: "  const base = againsts.length === 1 && againsts[0] === \"defence\"\n", to: "  const base = true\n", breaks: "D9" },
  { name: "the rows' contribution is the stacked total of both, the DB counted twice", file: DDC, from: "  return { total: together.total - alone, notCounted, together: together.total, alone };", to: "  return { total: together.total, notCounted, together: together.total, alone };", breaks: "D9" },
  { name: "every row is untyped", file: DDC, from: "  const own = list.map((r) => ({ label: r.label, value: Number(r.value), type: r.type ?? \"untyped\", source: \"defenceDC\" }));", to: "  const own = list.map((r) => ({ label: r.label, value: Number(r.value), type: \"untyped\", source: \"defenceDC\" }));", breaks: "D8" },
  { name: "a lost row is not named", file: DDC, from: "    if (m && m.applied === false) notCounted.push(", to: "    if (false) notCounted.push(", breaks: "D8" },
  { name: "a row's declared type is dropped", file: DDC, from: "  const type = declaredRowType(raw.type || raw.bonusType);", to: "  const type = \"untyped\";", breaks: "D8" },
  { name: "a row's bonusType is not read (a ward's)", file: DDC, from: "declaredRowType(raw.type || raw.bonusType)", to: "declaredRowType(raw.type)", breaks: "D11" },
  { name: "the ward's DB half carries no type", file: m("magic", "ward.mjs"), from: "      // 2026 is that status bonuses to DB do not. See defence-dc.mjs.\n      type,\n", to: "", breaks: "D11" },
  { name: "the aura's DB row carries no type", file: m("magic", "opposed-aura.mjs"), from: "    defenceDC: [{ dc: \"defence\", value, type, label: name,", to: "    defenceDC: [{ dc: \"defence\", value, label: name,", breaks: "D11" },
  { name: "a spell's defenceDC row drops its type", file: DDC, from: "    ...(effect?.bonusType || effect?.type ? { type: String(effect.bonusType || effect.type) } : {}),\n", to: "", breaks: "D11" },
  { name: "the action card does not say a row did not count", file: m("combat", "action-workflow.mjs"), from: "${lost ? ` (not counted: ${lost.reason.toLowerCase()})` : \"\"}", to: "", breaks: "D12" },
  { name: "the spell card does not say a row did not count", file: CW, from: "${lost ? ` — not counted: ${esc(lost.reason.toLowerCase())}` : \"\"}", to: "", breaks: "D12" },
  // D12-D16 — 3.684.1 review fixes
  { name: "the Strike card does not list the defender's rows", file: ATK, from: "  for (const entry of typedDefence.entries ?? []) {\n    const lost = notCountedOf(entry);\n", to: "  for (const entry of []) {\n    const lost = notCountedOf(entry);\n", breaks: "D12" },
  { name: "the Strike card does not say a row did not count", file: ATK, from: "${lost ? ` — not counted: ${escRow(lost.reason.toLowerCase())}` : \"\"}.</em>`));\n  }\n  if (fearfulRow) {", to: "\"\"}.</em>`));\n  }\n  if (fearfulRow) {", breaks: "D12" },
  { name: "the Strike card names the rows' own losers, not Fearful Power's stacking", file: ATK, from: "  const notCountedOf = (entry) => (defenceStack.notCounted ?? []).find((n) => n.entry === entry);", to: "  const notCountedOf = (entry) => (typedDefence.notCounted ?? []).find((n) => n.entry === entry);", breaks: "D12" },
  { name: "the bomb card does not say a row did not count", file: ALCH, from: "${lost ? ` — not counted: ${esc(lost.reason.toLowerCase())}` : \"\"}.</em>`));\n  }\n", to: "\"\"}.</em>`));\n  }\n", breaks: "D12" },
  { name: "the bomb card lists no rows", file: ALCH, from: "    typedRows = { ...typed, entries: [...(typed?.entries ?? []), ...coverRows], notCounted: stacked.notCounted };\n", to: "", breaks: "D12" },
  { name: "REVIEW FIX REVERTED: Formless Cut pays back the stance at face value", file: SO, from: "  return { total: Math.max(0, withStance - without), labels };", to: "  return { total: [...base.filter(stanceBase), ...rows.filter(stanceRow)].reduce((t, e) => t + Number(e.value), 0), labels };", breaks: "D13" },
  { name: "Formless Cut leaves the stance's own DB entries in the DB without it", file: SO, from: "base.filter((e) => !stanceBase(e))).together;", to: "base).together;", breaks: "D13" },
  { name: "Formless Cut leaves the stance's rows in the DB without it", file: SO, from: "  const without = stackDefenceRows(rows.filter((e) => !stanceRow(e)),", to: "  const without = stackDefenceRows(rows,", breaks: "D13" },
  { name: "Formless Cut pays back a stance penalty", file: SO, from: "  const stanceRow = (entry) => Boolean(entry.fromStance) && (Number(entry.value) || 0) > 0;", to: "  const stanceRow = (entry) => Boolean(entry.fromStance);", breaks: "D13" },
  { name: "the Strike pays back against the whole breakdown", file: ATK, from: "      breakdown: defenceBase,\n", to: "      breakdown: targetActor.system?.combat?.defence?.breakdown?.entries ?? [],\n", breaks: "D13b" },
  { name: "the Strike's payback leaves Fearful Power out of the stacking", file: ATK, from: "      dcEntries: [...rowsMet, ...(fearfulRow ? [fearfulRow] : [])]\n", to: "      dcEntries: rowsMet\n", breaks: "D13b" },
  { name: "REVIEW FIX REVERTED: Fearful Power is weighed against the DB alone", file: DDC, from: "  return { row, fearfulDB: stack.total - alone.total, stack };", to: "  return { row, fearfulDB: stackDefenceRows([row], baseEntries).total, stack };", breaks: "D14" },
  { name: "Fearful Power is untyped", file: DDC, from: "  const row = { label: \"Fearful Power\", value, type: \"status\" };", to: "  const row = { label: \"Fearful Power\", value, type: \"untyped\" };", breaks: "D14" },
  { name: "the Strike weighs Fearful Power apart from the rows", file: ATK, from: "    const fearful = stackFearfulPower(rowsMet, defenceBase, fearfulBonus);", to: "    const fearful = stackFearfulPower([], defenceBase, fearfulBonus);", breaks: "D14b" },
  { name: "REVIEW FIX REVERTED: a restricted DB's rows stack against the whole breakdown", file: DDC, from: "  if (defence.restricted) return Array.isArray(defence.restrictedEntries) ? defence.restrictedEntries : [];\n", to: "", breaks: "D15" },
  { name: "an unrecorded restriction keeps the whole breakdown", file: DDC, from: "Array.isArray(defence.restrictedEntries) ? defence.restrictedEntries : [];", to: "Array.isArray(defence.restrictedEntries) ? defence.restrictedEntries : (defence.breakdown?.entries ?? []);", breaks: "D15" },
  { name: "the actor does not record what Paralyzed kept", file: ACTOR, from: "      combat.defence.restrictedEntries = keptEntries;\n", to: "", breaks: "D15b" },
  { name: "the actor does not record that Petrified keeps nothing", file: ACTOR, from: "      combat.defence.restrictedEntries = [];\n", to: "", breaks: "D15b" },
  { name: "REVIEW FIX REVERTED: a row's type is case-sensitive", file: DDC, from: ".trim().toLowerCase().replace(/[\\s_-]+/g, \"\");", to: ".trim().replace(/[\\s_-]+/g, \"\");", breaks: "D16" },
  // D17+ — 3.684.3, the Strike's other DB bonuses stack by type (Graham, 5 November 2026)
  { name: "THE OLD DEFAULT RESTORED: cover is untyped", file: DDC, from: "    { key: \"cover\", label: \"Standard cover (firing into melee)\", value: n(cover), type: \"circumstance\" },", to: "    { key: \"cover\", label: \"Standard cover (firing into melee)\", value: n(cover), type: \"untyped\" },", breaks: "D17/D17b" },
  { name: "Warden Hunter is untyped", file: DDC, from: "    { key: \"warden\", label: \"Warden Hunter\", value: n(warden), type: \"circumstance\" },", to: "    { key: \"warden\", label: \"Warden Hunter\", value: n(warden), type: \"untyped\" },", breaks: "D17/D17b" },
  { name: "Aid Defensive gives no row", file: DDC, from: "    { key: \"aid\", label: String(aid?.label || \"Aid Defensive\"), value: n(aid?.amount), type: \"circumstance\" },\n", to: "", breaks: "D17/D17b" },
  { name: "Trap Finder is untyped", file: DDC, from: "    { key: \"trapFinder\", label: \"Trap Finder\", value: n(trapFinder), type: \"circumstance\" },", to: "    { key: \"trapFinder\", label: \"Trap Finder\", value: n(trapFinder), type: \"untyped\" },", breaks: "D17/D17b" },
  { name: "Shielded Stride typed shield (loses to the bonus it raises)", file: DDC, from: "value: n(shieldedStride), type: \"untyped\" },", to: "value: n(shieldedStride), type: \"shield\" },", breaks: "D17/D17b" },
  { name: "a zero bonus gives a row", file: DDC, from: "  ].filter((row) => row.value !== 0);", to: "  ];", breaks: "D17" },
  { name: "THE DEFECT RESTORED: the Strike adds its other DB bonuses flat", file: ATK, from: "    ? baseDB + defenceStack.total - pierce.amount", to: "    ? baseDB + defenceStack.total + coverBonus + wardenDB + trapFinderDB + (aidDefence?.amount ?? 0) - pierce.amount", breaks: "D17c" },
  { name: "the Strike's rows leave its other DB bonuses out", file: ATK, from: "  const rowsMet = [...(typedDefence.entries ?? []), ...strikeRows];", to: "  const rowsMet = [...(typedDefence.entries ?? [])];", breaks: "D17c" },
  { name: "the Strike card does not say a bonus did not count", file: ATK, from: "    return lost ? ` — not counted: ${String(lost.reason).toLowerCase()}` : \"\";", to: "    return \"\";", breaks: "D17d" },
  { name: "the Strike card says nothing of Aid Defensive", file: ATK, from: "  if (aidDefence) {\n    lines.push(line(", to: "  if (false) {\n    lines.push(line(", breaks: "D17d" },
  { name: "THE DEFECT RESTORED: the bomb adds its cover flat", file: ALCH, from: "    db = Number.isFinite(base) ? base + stacked.total : null;", to: "    db = Number.isFinite(base) ? base + coverBonus + Number(typed?.total ?? 0) : null;", breaks: "D18" },
  { name: "a stepped-down firing-into-melee cover loses the table's difference", file: ATK, from: "      coverStep = { ...coverStep, lost: Math.max(0, unstepped.stack.total - defenceStack.total) };\n", to: "", breaks: "D19" },
  { name: "a taken cover's step is not subtracted", file: ATK, from: "      coverStep = { ...step, taken: true, lost:", to: "      coverStep = { ...step, lost:", breaks: "D19" },
  { name: "a taken cover's step is made on the full cover (review)", file: ATK, from: "    ? coverStep.steppedCoverEntries(unsteppedBase, coverStep.tableLost, coverStep.coverSource)\n", to: "    ? unsteppedBase\n", breaks: "D19" },
  { name: "a taken cover's card loss is the sheet's, not the DB's (review)", file: ATK, from: "      coverStep = { ...coverStep, lost: Math.max(0, coverStep.sheetLoss + unstepped.stack.total - defenceStack.total) };\n", to: "", breaks: "D19" },
  { name: "a taken cover the rows give back is not subtracted (review)", file: ATK, from: "  const takenCoverLoss = coverStep?.taken ? Number(coverStep.sheetLoss ?? 0) : 0;", to: "  const takenCoverLoss = coverStep?.taken && coverStep.lost ? Number(coverStep.sheetLoss ?? 0) : 0;", breaks: "D19" },
  { name: "a restricted DB's taken cover is stepped from the full sheet (review)", file: ATK, from: "    const sheetEntries = taken ? (await import(\"./defence-dc.mjs\")).defenceStackBase(targetActor) : [];\n", to: "    const sheetEntries = taken ? targetActor.system?.combat?.defence?.breakdown?.entries ?? [] : [];\n", breaks: "D19" },
  { name: "LIVE TEST F1 REVERTED: the cover is looked for in the sheet slot only", file: SE, from: "  if (bySource) return bySource;\n", to: "", breaks: "D19d" },
  { name: "Take Cover's entry is not found by its name", file: SE, from: "    if (byName) return byName;\n", to: "", breaks: "D19d" },
  { name: "the Strike passes no Take Cover effect", file: ATK, from: "      const sheetLoss = coverLossInDefence(sheetEntries, step.lost, coverSource);", to: "      const sheetLoss = coverLossInDefence(sheetEntries, step.lost);", breaks: "D19" },
  { name: "the stepped entries are not told the Take Cover effect", file: ATK, from: "    ? coverStep.steppedCoverEntries(unsteppedBase, coverStep.tableLost, coverStep.coverSource)", to: "    ? coverStep.steppedCoverEntries(unsteppedBase, coverStep.tableLost)", breaks: "D19" },
  // 3.684.5 — the higher of the two covers is stepped (Graham, 5 November 2026)
  { name: "GRAHAM'S RULING REVERTED: the Take Cover is always the one stepped", file: SE, from: "  if (t > m) return { step: \"taken\", both, tie: false };", to: "  if (t > 0) return { step: \"taken\", both, tie: false };", breaks: "D19g/D19h" },
  { name: "the lower cover is stepped", file: SE, from: "  if (t > m) return { step: \"taken\", both, tie: false };", to: "  if (t < m) return { step: \"taken\", both, tie: false };", breaks: "D19g/D19h" },
  { name: "a tie steps the Take Cover", file: SE, from: "  if (t > m) return { step: \"taken\", both, tie: false };", to: "  if (t >= m) return { step: \"taken\", both, tie: false };", breaks: "D19g" },
  { name: "one cover alone counts as both", file: SE, from: "  const both = t > 0 && m > 0;", to: "  const both = t > 0 || m > 0;", breaks: "D19g" },
  { name: "a tie is never flagged", file: SE, from: "  return { step: \"intoMelee\", both, tie: both && t === m };", to: "  return { step: \"intoMelee\", both, tie: false };", breaks: "D19g" },
  { name: "the Strike steps the Take Cover whenever there is one (3.684.4)", file: ATK, from: "    if (taken && coverPick.step !== \"intoMelee\") {", to: "    if (taken) {", breaks: "D19j" },
  { name: "a Take Cover the DB does not hold is weighed", file: ATK, from: "const takenValue = taken && coverEntryIn(sheetEntries, coverSource) ? ", to: "const takenValue = taken ? ", breaks: "D19j" },
  { name: "the pick is not told the firing-into-melee cover", file: ATK, from: "coverToStep({ taken: takenValue, intoMelee: coverBonus })", to: "coverToStep({ taken: takenValue, intoMelee: 0 })", breaks: "D19j" },
  { name: "the step forgets which cover and the tie", file: ATK, from: "    if (coverStep) coverStep = { ...coverStep, both: coverPick.both, tie: coverPick.tie };\n", to: "", breaks: "D19j" },
  { name: "the card leaves out the tie", file: ATK, from: "    if (coverTieNote) lines.push(line(`<em>${coverTieNote}</em>`));\n", to: "", breaks: "D19j" },
  { name: "the Edge line does not say which cover", file: ATK, from: "'s ${coverStep.from} cover${whichCover} is ${coverStep.to", to: "'s ${coverStep.from} cover is ${coverStep.to", breaks: "D19j" },
  { name: "the card's melee cover line prints the table's +4 again", file: ATK, from: "is engaged in melee: +${coverBonus - intoMeleeStep} DB", to: "is engaged in melee: +${coverBonus} DB", breaks: "D19f" },
  { name: "steppedCoverEntries steps nothing (review)", file: SE, from: "  return list.map((e) => (e === slot ? { ...e, value: Math.max(0, Number(e.value) - take) } : e));", to: "  return list;", breaks: "D19c" },
  { name: "the lower-cased table keeps its camelCase keys", file: DDC, from: "  Object.entries(SLOT_TYPE_ALIASES).map(([k, v]) => [k.toLowerCase(), v])));", to: "  Object.entries(SLOT_TYPE_ALIASES).map(([k, v]) => [k, v])));", breaks: "D16" },
  { name: "REVIEW FIX REVERTED: a blank type does not fall back to bonusType", file: DDC, from: "declaredRowType(raw.type || raw.bonusType)", to: "declaredRowType(raw.type ?? raw.bonusType)", breaks: "D16" },
  { name: "Object's own keys are read as types", file: DDC, from: "  return Object.hasOwn(ROW_TYPE_ALIASES, key) ? ROW_TYPE_ALIASES[key] : \"untyped\";", to: "  return ROW_TYPE_ALIASES[key] ?? \"untyped\";", breaks: "D16" },
  // F — G22, Ferromancer's shards (Q112)
  { name: "a non-arcane Sorcerer's casts count as arcane", file: CG, from: "    if (own.length && !own.some((t) => d.traditions.includes(t))) continue;\n", to: "", breaks: "F1" },
  { name: "the shards free no hand", file: CG, from: "    ...(shards ? { somatic: false } : {})\n", to: "", breaks: "F3" },
  { name: "the shards need no pouch", file: CG, from: "  if (shards?.needsPouch && !hasComponentPouch(actor)) {", to: "  if (false) {", breaks: "F3" },
  { name: "a scoped object flag is the blanket override", file: CG, from: "  if (flag && typeof flag === \"object\") return false;\n", to: "", breaks: "F2" },
  { name: "the shards spend no pouch use", file: CG, from: "  return Boolean(components?.material) || Boolean(waiver?.needsPouch);", to: "  return Boolean(components?.material);", breaks: "F4" },
  { name: "the cast spends the pouch for material only", file: CW, from: "castSpendsPouch(effectiveComponents, shardsHere)", to: "effectiveComponents.material", breaks: "F5" },
  // N — G23, spell damage names its caster
  { name: "applyTypedDamage names nobody on its typed write", file: DW, from: "    sourceName,\n    ...told\n  });", to: "    sourceName\n  });", breaks: "N1" },
  { name: "an area save's damage names nobody", file: ASW, from: "        ...(caster?.uuid ? { sourceUuid: caster.uuid, context: { kind: \"areaSave\"", to: "        ...(false ? { sourceUuid: caster.uuid, context: { kind: \"areaSave\"", breaks: "N2" },
  { name: "a damage row's missiles name nobody", file: SEF, from: "caster?.uuid ? { sourceUuid: caster.uuid, context: { kind: \"spell\", spellName: String(spellName ?? \"\") } } : {}", to: "{}", breaks: "N2" },
  { name: "the vs-trait half names nobody", file: CW, from: "vsPacket.taken, { sourceUuid: actor?.uuid ?? \"\", context: { kind: \"spell\", spellName: spell?.name ?? \"\" } });", to: "vsPacket.taken, {});", breaks: "N3" },
  // S — G24, another token's range; another creature's sustain (Q137)
  { name: "a cast from another token is offered the prelude", file: CW, from: " && !o.preparedSymbol && !o.rangeFrom;", to: ";", breaks: "S1" },
  { name: "the range is measured from the caster regardless", file: CW, from: "rangeOrigin?.token ?? actor.getActiveTokens", to: "actor.getActiveTokens", breaks: "S2" },
  { name: "a held spell lapses without the caster's Sustain", file: AS, from: "  if (sustainerOf(entry)) return false;\n", to: "", breaks: "S3" },
  { name: "a held spell still blocks PP recovery", file: AS, from: "  return entries.some((e) => e?.sustained && !sustainerOf(e));", to: "  return entries.some((e) => e?.sustained);", breaks: "S3" },
  { name: "a fallen familiar keeps holding it", file: AS, from: "  if (Number.isFinite(hp) && hp <= 0) return true;\n", to: "", breaks: "S4" },
  { name: "a creature holds two spells at once", file: AS, from: "    for (const other of entries) if (other !== entry && sustainerOf(other)?.uuid === uuid) delete other.sustainedBy;\n", to: "", breaks: "S5" },
  { name: "the caster's hurt interrupts a spell the familiar holds", file: SUS, from: "getActiveSpells(actor).filter((entry) => entry?.sustained && !sustainerOf(entry))", to: "getActiveSpells(actor).filter((entry) => entry?.sustained)", breaks: "S6" },
  // H — G25
  { name: "the innate DC ignores the soul's +1", file: ISD, from: "  const bonus = at?.itemName ? 0 : await innateLevelBonusFor(actor, spell);", to: "  const bonus = 0;", breaks: "H1" },
  { name: "the reaction ctx is not told the weapon", file: RW, from: "    weaponUuid: String(check.weaponUuid ?? \"\"), twoHanded: check.twoHanded === true", to: "    weaponUuid: \"\", twoHanded: false", breaks: "H2" },
  { name: "the check does not carry the weapon", file: CHK, from: "    this.weaponUuid = String(config.weaponUuid ?? \"\");", to: "    this.weaponUuid = \"\";", breaks: "H2b" },
  { name: "a bonus cantrip is read off any item", file: KC, from: "    if (item?.type !== \"feat\") continue;\n    total +=", to: "    total +=", breaks: "H3" },
  { name: "a known-cantrip pool is invented for a class with none", file: KC, from: "  return own ? own + declaredCantripBonus(items) : 0;", to: "  return own + declaredCantripBonus(items);", breaks: "H3" },
  { name: "the memorised allowance ignores the bonus", file: MEM, from: " + Math.max(0, Math.floor(Number(bonusCantrips) || 0));", to: ";", breaks: "H3" },
  { name: "a worse declared ability is still taken", file: MA, from: "  return delta > 0 ? { ...best, delta } : null;", to: "  return { ...best, delta };", breaks: "H4" },
  { name: "Clever Strike stacks with Finesse", file: ATK, from: "Number(system.combat?.attack?.ability ?? 0) + finesseBonus)", to: "Number(system.combat?.attack?.ability ?? 0))", breaks: "H4b" },
  { name: "a strike rider meets every creature", file: SR, from: "  if (spec.targetUuids?.length && !spec.targetUuids.includes(String(ctx.targetUuid ?? \"\").trim())) return false;\n", to: "", breaks: "H5" },
  { name: "a spell rider meets every creature", file: CDR, from: "    if (r.targetUuids?.length && !r.targetUuids.includes(uuid)) return false;\n", to: "", breaks: "H6" },
  { name: "an attacks-only spell rider rides a save", file: CDR, from: "    if (r.attackOnly && !attack) return false;\n", to: "", breaks: "H6" },
  { name: "warpFreeSchool '*' matches nothing", file: GW, from: "  return school === \"*\" || ", to: "  return ", breaks: "H7" },
  { name: "a sigil's Symbol still needs a hand", file: CG, from: "    ...(symbolPrepared ? { symbol: false } : {}),\n", to: "", breaks: "H8" },
  { name: "a sigil frees the somatic hand too (Q123)", file: CG, from: "    ...(symbolPrepared ? { symbol: false } : {}),\n", to: "    ...(symbolPrepared ? { symbol: false, somatic: false } : {}),\n", breaks: "H8" },
  { name: "a sigil's card asks for room to draw", file: RM, from: "  if (prepared) {", to: "  if (false) {", breaks: "H9" },
  { name: "a sigil's cast costs its full AP", file: CW, from: "  const sigilAP = sigil ? -1 : 0;", to: "  const sigilAP = 0;", breaks: "H10" },
  { name: "Combat Inscription's increase is ignored by the DC", file: CDC, from: "-1 + (defensive ? increase : 0));", to: "-1 + (defensive ? 2 : 0));", breaks: "H12" },
  { name: "a declared increase is never read", file: RM, from: "    if (Number.isFinite(inc) && Math.trunc(inc) >= 0 && Math.trunc(inc) < defensiveIncrease) {", to: "    if (false) {", breaks: "H11" },
  { name: "spellCastable answers yes to everything", file: APIW, from: "        return spellCastBlocked(spell) === null;", to: "        return true;", breaks: "H13" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ea-block6d-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ea-block6d-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ea-block6d-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ea-block6d-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
