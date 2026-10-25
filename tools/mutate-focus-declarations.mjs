#!/usr/bin/env node
/**
 * mutate-focus-declarations — the mutation half of verify-focus-declarations.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const FD = m("focus-declarations.mjs"), UW = m("uses-workflow.mjs"), RW = m("combat", "refocus-workflow.mjs");
const FW = m("combat", "falling-workflow.mjs"), ST = m("stowage.mjs");
const AC = m("documents", "actor.mjs"), GW = m("grants-workflow.mjs"), GC = m("grant-cleanup.mjs");
const AW = m("combat", "action-workflow.mjs"), CW = m("magic", "cast-workflow.mjs"), SH = m("sheets", "actor-sheet.mjs");
const MUTATIONS = [
  { name: "extra uses reach items without Focus", file: FD, from: "  if (!carriesFocus(item?.system?.traits)) return [];\n  const itemTraits", to: "  const itemTraits", breaks: "A2" },
  { name: "the trait filter is ignored", file: FD, from: "      if (filtered && !byTrait && !byName) continue;", to: "      if (filtered && !byName) continue;", breaks: "A1" },
  { name: "the name filter is ignored", file: FD, from: "      const byName = wantNames.includes(itemName);", to: "      const byName = false;", breaks: "A3" },
  { name: "an unfiltered row reaches nothing", file: FD, from: "      const filtered = wantTraits.length || wantNames.length;", to: "      const filtered = true;", breaks: "A4" },
  { name: "a zero row counts", file: FD, from: "      if (value <= 0) continue;", to: "      if (value < 0) continue;", breaks: "B5" },
  { name: "Focus matches inside a word", file: FD, from: "const carriesFocus = (traits) => hasFocusTrait(traits);", to: "const carriesFocus = (traits) => /focus/i.test(String(traits ?? \"\"));", breaks: "A5" },
  { name: "a single-object flag is ignored", file: FD, from: "  return raw && typeof raw === \"object\" ? [raw] : [];", to: "  return [];", breaks: "A3" },
  { name: "restores-all hands back one", file: FD, from: "  return restoresAll ? cap : Math.min(cap, cur + 1);", to: "  return Math.min(cap, cur + 1);", breaks: "B2" },
  { name: "the one-use path is uncapped", file: FD, from: "  return restoresAll ? cap : Math.min(cap, cur + 1);", to: "  return restoresAll ? cap : cur + 1;", breaks: "B1" },
  { name: "rows default to not restoring all", file: FD, from: "restoresAll: row.restoresAll !== false,", to: "restoresAll: row.restoresAll === true,", breaks: "B4" },
  { name: "the option applies to every action", file: FD, from: "      if (norm(row.action) !== action) continue;", to: "", breaks: "C3" },
  { name: "a lower ability is used too", file: FD, from: "      if (!Number.isFinite(score) || score <= base) continue;", to: "      if (!Number.isFinite(score)) continue;", breaks: "C3" },
  { name: "the first option wins, not the best", file: FD, from: "      if (!best || score > best.score) {", to: "      if (!best) {", breaks: "C4" },
  { name: "the full score is added, not the difference", file: FD, from: "    value: best.score - base,", to: "    value: best.score,", breaks: "C1" },
  { name: "the spell's own ability is ignored", file: FD, from: "  if (override && Object.hasOwn(attributes ?? {}, override)) return override;", to: "", breaks: "D1" },
  { name: "any override word is taken", file: FD, from: "  if (override && Object.hasOwn(attributes ?? {}, override)) return override;", to: "  if (override) return override;", breaks: "D2" },
  { name: "creatures are gated too", file: FD, from: "  if (!INNATE_GATED_ACTOR_TYPES.includes(String(actorType ?? \"\"))) return null;", to: "", breaks: "E4" },
  { name: "companions are not gated", file: FD, from: "const INNATE_GATED_ACTOR_TYPES = Object.freeze([\"character\", \"companion\"]);", to: "const INNATE_GATED_ACTOR_TYPES = Object.freeze([\"character\"]);", breaks: "E3" },
  { name: "at-level spells are refused", file: FD, from: "  if (pp <= level + extra) return null;", to: "  if (pp < level + extra) return null;", breaks: "E2" },
  { name: "item casts are gated", file: FD, from: "  if (isItemCast) return null;\n  if (!INNATE", to: "  if (!INNATE", breaks: "E4" },
  { name: "the wondrous flag is not cleared", file: FD, from: "    if (flags.wondrousFocusExpended) update[\"flags.trg-prime.-=wondrousFocusExpended\"] = null;", to: "", breaks: "F1" },
  { name: "empty updates are emitted", file: FD, from: "    if (Object.keys(update).length) updates.push(", to: "    updates.push(", breaks: "F1" },
  { name: "the daily maximum ignores declarations", file: UW, from: "    + focusExtraUses(owner, owner.actor ? declarationCarriers(owner.actor) : []);", to: ";", breaks: "G1" },
  { name: "daily preparation leaves Focus flags", file: UW, from: "  if (focusFlagUpdates.length) await actor.updateEmbeddedDocuments(\"Item\", focusFlagUpdates);", to: "", breaks: "G2" },
  { name: "Refocus always restores one", file: RW, from: "  const all = item.actor ? refocusRestoresAll(item, declarationCarriers(item.actor)) : false;", to: "  const all = false;", breaks: "G3" },
  { name: "the action roll drops the option rows", file: AW, from: "      ...actionAbilityRows(\n        declarationCarriers(actor),", to: "      ...[].concat(\n        declarationCarriers(actor),", breaks: "G4" },
  { name: "castSpell never refuses above level", file: CW, from: "    if (refusal) {\n      ui.notifications.warn(`${spell.name}: ${refusal}.`);\n      return null;\n    }", to: "", breaks: "G5" },
  { name: "the innate attack reads the actor's ability", file: CW, from: "    system.attributes?.[innateAbilityAttr]?.total ??", to: "    system.attributes?.[system.magic?.castingAbility]?.total ??", breaks: "G6" },
  { name: "the sheet ignores the spell's ability", file: SH, from: "          const ownAbilityKey = innateAbilityKey(item, this.actor.system?.magic?.castingAbility, this.actor.system?.attributes ?? {});", to: "          const ownAbilityKey = this.actor.system?.magic?.castingAbility;", breaks: "G8" },
  { name: "an inactive ability still raises the pool", file: FD, from: "    if (item?.type === \"ability\" && item?.system?.active === false) continue;\n    total += Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.convictionPool)", to: "    total += Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.convictionPool)", breaks: "H1" },
  { name: "the point is given twice", file: FD, from: "  if (!n || item?.flags?.[FLAG_SCOPE]?.convictionGiven) return null;", to: "  if (!n) return null;", breaks: "H2" },
  { name: "the point is taken back below zero", file: FD, from: "  return Math.max(0, Math.floor(Number(current) || 0) - n);", to: "  return Math.floor(Number(current) || 0) - n;", breaks: "H3" },
  { name: "a point never given is taken back", file: FD, from: "  if (!n || !item?.flags?.[FLAG_SCOPE]?.convictionGiven) return null;", to: "  if (!n) return null;", breaks: "H3" },
  { name: "the pool ignores declarations", file: AC, from: "        declaredConvictionBonus(this.items ?? []);", to: "        0;", breaks: "H4" },
  { name: "the grant forgets to record the point", file: GW, from: "      await sourceItem.setFlag(\"trg-prime\", \"convictionGiven\", true);\n      lines.push(line(`<strong>${sourceItem.name}:</strong> conviction pool", to: "      lines.push(line(`<strong>${sourceItem.name}:</strong> conviction pool", breaks: "H5" },
  { name: "removal keeps the point", file: GC, from: "      if (back !== null && back !== current) {\n        await actor.update({ \"system.resources.conviction.value\": back });", to: "      if (back !== null && back !== current) {\n        void back;", breaks: "H6" },
  { name: "a zero fall row is counted", file: FD, from: "      if (!value) continue;\n      feet += value;", to: "      feet += value;", breaks: "I2" },
  { name: "only the first fall reduction counts", file: FD, from: "      feet += value;", to: "      feet = Math.max(feet, value);", breaks: "I1" },
  { name: "an inactive ability adds carrying strength", file: FD, from: "    if (item?.type === \"ability\" && item?.system?.active === false) continue;\n    total += Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.carryStrength) || 0));", to: "    total += Math.max(0, Math.floor(Number(item?.flags?.[FLAG_SCOPE]?.carryStrength) || 0));", breaks: "I3" },
  { name: "a fall can go negative", file: FW, from: "  const distance = Math.max(0, entered - fallCut.feet);", to: "  const distance = entered - fallCut.feet;", breaks: "I4" },
  { name: "the card hides the reduction", file: FW, from: "  if (fallCut.feet > 0 && entered > 0) {", to: "  if (false) {", breaks: "I5" },
  { name: "carrying strength ignores declarations", file: ST, from: "  return hauler + fromItems + declaredCarryStrength(items);", to: "  return hauler + fromItems;", breaks: "I6" },
  { name: "a single granted ability word is ignored", file: FD, from: "  if (typeof raw === \"string\") key = norm(raw);", to: "", breaks: "J1" },
  { name: "the grant table matches every spell", file: FD, from: "      if (norm(name) === wanted) { key = norm(ability); break; }", to: "      key = norm(ability); break;", breaks: "J2" },
  { name: "any granted ability word is taken", file: FD, from: "  return key && GRANT_ABILITY_KEYS.includes(key) ? key : null;", to: "  return key || null;", breaks: "J3" },
  { name: "any chosen ability word is taken", file: FD, from: "  return key && GRANT_ABILITY_KEYS.includes(key) ? { castingAbilityOverride: key } : null;", to: "  return key ? { castingAbilityOverride: key } : null;", breaks: "J4" },
  { name: "the grant does not stamp the ability", file: GW, from: "      if (ownAbility) foundry.utils.setProperty(data, \"flags.trg-prime.castingAbilityOverride\", ownAbility);", to: "", breaks: "J6" },
  { name: "the chooser drops the ability", file: m("feats-workflow.mjs"), from: "    extraFlags: spellChoiceExtraFlags(spec),\n", to: "", breaks: "J7" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-focus-declarations.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-focus-declarations: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-focus-declarations: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-focus-declarations: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
