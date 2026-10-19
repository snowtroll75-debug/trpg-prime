#!/usr/bin/env node
/**
 * mutate-ff30-block4 — the mutation half of verify-ff30-block4 (3.634.0).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RG = m("regeneration-rules.mjs"), SEC = m("combat", "creature-secondary.mjs"), AE = m("ally-aura-effects.mjs"), CA = m("creature-auras.mjs");
const VD = m("magic", "versus-damage.mjs"), AREA = m("creature-area.mjs"), HZ = m("harmonize.mjs"), DYING = m("combat", "dying-workflow.mjs");
const TURN = m("creature-turn-start-workflow.mjs"), ATTACK = m("combat", "attack-workflow.mjs"), SYNC = m("ally-aura-effects-workflow.mjs");
const VDW = m("magic", "versus-damage-workflow.mjs"), ACT = m("creature-activation-workflow.mjs"), CODEX = m("codex-actions-workflow.mjs"), CAST = m("magic", "cast-workflow.mjs");
const INIT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");

const MUTATIONS = [
  { name: "the name's bracket is not read", file: RG, from: "  return m ? m[1].split(/[,/]| or /).map(lower).filter(Boolean) : [];", to: "  return [];", breaks: "A1" },
  { name: "the negating type never negates", file: RG, from: "    if (negatedByTypes(negatedBy, [...(blowTypes ?? []), ...(sinceTypes ?? [])])) continue;", to: "", breaks: "A2" },
  { name: "switched-off regeneration still holds", file: RG, from: "    if (item?.type === \"ability\" && item?.system?.active === false) continue;", to: "", breaks: "A2" },
  { name: "the types since its turn are not lower-cased", file: RG, from: "  for (const t of types ?? []) if (lower(t)) set.add(lower(t));", to: "  for (const t of types ?? []) if (t) set.add(t);", breaks: "A3" },
  { name: "an aligned packet carries no traits", file: SEC, from: "  return ALIGNED_TRAITS.includes(word) ? [word] : [];", to: "  return [];", breaks: "A4" },
  { name: "an ally aura loses its effect", file: CA, from: "    allyEffect: kind === \"ally\" ? allyEffectOf(raw.allyEffect) : null,", to: "    allyEffect: null,", breaks: "A5" },
  { name: "a bad change key is kept", file: AE, from: "c && typeof c.key === \"string\" && c.key.startsWith(\"system.\") && c.value !== undefined", to: "c && typeof c.key === \"string\" && c.value !== undefined", breaks: "A5" },
  { name: "the emitter aids itself", file: AE, from: "        if (self && !aura.includeSelf) continue;", to: "", breaks: "A6" },
  { name: "a foe is aided", file: AE, from: "const effect = opposed ? aura.enemyEffect : aura.allyEffect;", to: "const effect = aura.allyEffect;", breaks: "A6" },
  { name: "a large ally is reached only by its centre", file: AE, from: "        const reach = auraReachFeet(aura.radius, emitter.widthFeet) + Math.max(0, (Number(subject.widthFeet) || 5) - 5) / 2;", to: "        const reach = auraReachFeet(aura.radius, emitter.widthFeet);", breaks: "A6" },
  { name: "the healing warp is not laid", file: AE, from: "  if (fx.warpFreeSchool) flags.warpFreeSchool = { label: aura.name, ...fx.warpFreeSchool };", to: "", breaks: "A7" },
  { name: "a departed aura's effect is never lifted", file: AE, from: "    remove: [...have].filter((k) => !want.has(k))", to: "    remove: []", breaks: "A8" },
  { name: "versus damage ignores alignment", file: VD, from: " || (r.vsAlignments ?? []).some((a) => alignments.has(a))", to: "", breaks: "A9" },
  { name: "any picked type is applied", file: AREA, from: "  if (!choices.includes(pick)) return spec;", to: "", breaks: "A10" },
  { name: "Harmonize is uncapped", file: HZ, from: "  return Math.max(-CAP, Math.min(CAP, value));", to: "  return value;", breaks: "A11" },
  { name: "a Virtue's second aid stacks", file: HZ, from: "(record?.from ?? []).filter((f) => f.by !== by)", to: "(record?.from ?? [])", breaks: "A11" },
  { name: "the harmony never lapses", file: HZ, from: "  if (!record || !sameMoment(record.when, when)) return 0;", to: "  if (!record) return 0;", breaks: "A11" },
  { name: "damage types are not recorded", file: DYING, from: "      await actor.setFlag(\"trg-prime\", \"damageTypesSinceTurn\", withDamageTypes(actor.getFlag?.(\"trg-prime\", \"damageTypesSinceTurn\"), damageTypes));", to: "", breaks: "B1" },
  { name: "regeneration does not hold at 0 HP", file: DYING, from: "      return { case: \"regeneration-holds\", guard: regenHeld.label, newHP: 0 };", to: "", breaks: "B1" },
  { name: "the negating type does not stop the heal", file: TURN, from: "      if (!locked && !negated && a.amount > 0) {", to: "      if (!locked && a.amount > 0) {", breaks: "B2" },
  { name: "the healed creature stays unconscious", file: TURN, from: "          await clearUnconsciousIfConscious(actor);", to: "", breaks: "B2" },
  { name: "aligned packets meet no alignment defence", file: ATTACK, from: "        sourceTraits: alignedPacketTraits(rune)", to: "        sourceTraits: []", breaks: "B3" },
  { name: "a move does not resync the auras", file: SYNC, from: "if (\"x\" in changed || \"y\" in changed || \"disposition\" in changed || \"width\" in changed) syncAllyAuraEffects();", to: "if (\"disposition\" in changed) syncAllyAuraEffects();", breaks: "B4" },
  { name: "the ally-aura hooks are not registered", file: INIT, from: "  registerAllyAuraEffectHooks();\n", to: "", breaks: "B4" },
  { name: "versus damage asks no alignment", file: VDW, from: ", alignedTraitsOf(targetActor.system ?? {}));", to: ", []);", breaks: "B5" },
  { name: "the picked type is thrown away", file: ACT, from: "      use.spec = withChosenDamageType(use.spec, picked);", to: "", breaks: "B6" },
  { name: "Harmonize is not a codex action", file: CODEX, from: "draconicShifting, harmonize, changeShape, lunaFrenzy, heldAdvantage,", to: "draconicShifting, changeShape, lunaFrenzy, heldAdvantage,", breaks: "B7" },
  { name: "the harmony never reaches the DC", file: CAST, from: "      + harmonyHere;", to: ";", breaks: "B7" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-ff30-block4.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-ff30-block4: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
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
process.stdout.write(bad.length ? `\nmutate-ff30-block4: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-ff30-block4: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
