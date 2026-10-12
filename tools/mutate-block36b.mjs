#!/usr/bin/env node
/**
 * mutate-block36b — can verify-block36b fail?
 *
 * NEW at 3.616.0. Each mutation puts back a defect the 3.615.0 drive found,
 * or breaks one of the channels built for Graham's R6, R7 and R11–R16 of
 * block 36. SURVIVED and an unmatched anchor are both failures.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...p) => path.join(SYSTEM_ROOT, ...p);
const EXPIRY = at("module", "combat", "effect-application-workflow.mjs");
const CHARGEDF = at("module", "charged-items-workflow.mjs");
const ATTACK = at("module", "combat", "attack-workflow.mjs");
const TARGETING = at("module", "combat", "targeting.mjs");
const CATCH = at("module", "arrow-catching.mjs");
const EVENTS = at("module", "rune-events.mjs");
const RAW = at("module", "rune-actions-workflow.mjs");
const TURNING = at("module", "magic", "spell-turning-workflow.mjs");
const CAST = at("module", "magic", "cast-workflow.mjs");
const TIMERS = at("module", "rune-timers.mjs");
const RODS = at("module", "rod-powers.mjs");
const META = at("module", "magic", "metamagic.mjs");
const CHECK = at("module", "dice", "check.mjs");
const FORMS = at("module", "charged-weapon-forms.mjs");
const HELD = at("module", "held-items.mjs");
const CUSTOMADD = at("module", "customise-on-add.mjs");
const ITEMS = at("module", "magic-items.mjs");
const DEPLETE = at("module", "magic-items-workflow.mjs");
const CASTING = at("module", "magic", "casting.mjs");
const BUILDER = at("module", "magic-item-builder.mjs");
const BUILDERF = at("module", "magic-item-builder-workflow.mjs");
const REPAIRS = at("module", "data", "pack-repairs.mjs");
const VERIFY = at("tools", "verify-block36b.mjs");

const MUTATIONS = [
  /* A — the drive */
  { file: EXPIRY, name: "F1 — the sweeps stop claiming an effect (the shipped double delete)",
    from: "  if (expiring.has(key) || !stillOn(effect, owner)) return null;", to: "  if (false) return null;", breaks: "A1" },
  { file: EXPIRY, name: "F1 — a lost race is an error again",
    from: "    if (!/does not exist/i.test(String(err?.message ?? err))) throw err;", to: "    throw err;", breaks: "A1d" },
  { file: CHARGEDF, name: "F2 — the item keeps what it was paid for nothing (the shipped defect)",
    from: '      await item.update({ "system.uses": remaining });\n', to: "", breaks: "A2" },
  { file: CHARGEDF, name: "F2 — depletion rolls before the spell is out",
    from: "  if (after < 0 && !releaseHeld) await rollItemDepletion(actor, item);", to: "  if (after < 0) await rollItemDepletion(actor, item);", breaks: "A2b" },
  { file: ATTACK, name: "G1 — the Indestructible card says the armour takes damage again",
    from: '+ (armourClause.kind === "unarmoured" || indestructiblePiece ? "" :', to: '+ (armourClause.kind === "unarmoured" ? "" :', breaks: "A3b" },
  { file: BUILDERF, name: "O1 — the builder's staff takes two hands",
    from: "      heldHands: 1\n", to: '      heldHands: result.kind === "staff" ? 2 : 1\n', breaks: "A4c" },
  { file: REPAIRS, name: "O1 — owned copies at 0 are left at 0",
    from: '    field: "heldHands", since: "3.616.0",\n    from: 0,', to: '    field: "heldHands", since: "3.616.0",\n    from: 2,', breaks: "A4d" },

  /* B — Arrow Catching */
  { file: CATCH, name: "R6 — greater cover no longer protects the wearer",
    from: '    if (String(c.cover ?? "") === "greater") continue;\n', to: "", breaks: "B2d" },
  { file: CATCH, name: "R6 — the attacker may catch their own arrow",
    from: "    if (!c.id || c.id === attackerId || c.id === targetId) continue;", to: "    if (!c.id) continue;", breaks: "B2f" },
  { file: CATCH, name: "R6 — any distance diverts",
    from: "    if (feet > ARROW_CATCHING_FEET) continue;\n", to: "", breaks: "B2b" },
  { file: ATTACK, name: "R6 — the diversion is worked out and thrown away",
    from: "      targetToken = catcher.token;\n      targetActor = catcher.token.actor;\n", to: "", breaks: "B4b" },
  { file: TARGETING, name: "B3 — concealment counts against the wearer's missiles again",
    from: "  const concealed = !ignoreConcealed && (", to: "  const concealed = (", breaks: "B5" },

  /* C — Reflecting */
  { file: EVENTS, name: "R7 — the sheet's count never moves (the shipped defect)",
    from: "    reflecting: Number(spent?.reflecting ?? 0) + 1\n", to: "", breaks: "C1" },
  { file: RAW, name: "R7 — the sheet button does nothing (the shipped defect)",
    from: '  if (key === "reflecting") return useReflecting(actor, item, { key, label: "Reflecting" });\n', to: "", breaks: "C2" },
  { file: TURNING, name: "R7 — a reflection costs no reaction",
    from: "    await spendReaction(holder, rune.label);\n", to: "", breaks: "C3" },
  { file: TURNING, name: "R7 — the reflection leaves the wielder targeted",
    from: "    token.setTarget?.(false, { releaseOthers: false, groupSelection: true });\n    casterToken?.setTarget?.(true, { releaseOthers: false, groupSelection: true });\n    lines.push(`<strong>${rune.label}</strong>",
    to: "    lines.push(`<strong>${rune.label}</strong>", breaks: "C3c" },

  /* D — Air Drake */
  { file: TIMERS, name: "R11 — the rest forgets the minute it flies",
    from: "  return Number(worldTime ?? 0) + Number(spec?.effectSeconds ?? 0) + Number(spec?.cooldownSeconds ?? 0);",
    to: "  return Number(worldTime ?? 0) + Number(spec?.cooldownSeconds ?? 0);", breaks: "D1b" },
  { file: CAST, name: "R11 — the Fly is never refused while it rests",
    from: "    if (left > 0) {\n      ui.notifications.warn(`${grantSource.name}: ${spell.name} cannot be activated again",
    to: "    if (false) {\n      ui.notifications.warn(`${grantSource.name}: ${spell.name} cannot be activated again", breaks: "D3" },

  /* E — the rods */
  { file: RODS, name: "R12 — Quickening reaches a 1 AP spell (against the ruling)",
    from: '  if (rod.kind === "quicken") return Number(castAP) === 2;', to: '  if (rod.kind === "quicken") return Number(castAP) >= 1;', breaks: "E1c" },
  { file: RODS, name: "R12 — Extension ignores the spell's PP",
    from: "  if (Number(basePP) > Number(rod.maxPP)) return false;\n", to: "", breaks: "E1b" },
  { file: META, name: "R12 — the rod charges the caster PP",
    from: "      ppCost: 0, max: 1,\n      kind: rod.kind,", to: "      ppCost: rod.cost, max: 1,\n      kind: rod.kind,", breaks: "E2" },
  { file: META, name: "R12 — a feat and a rod quicken twice",
    from: "        if (!agg.quickened) agg.apDelta -= 1;", to: "        agg.apDelta -= 1;", breaks: "E2c" },
  { file: META, name: "R12 — nothing is taken from the rod",
    from: "      agg.rodSpends.push({ itemId: o.rodItemId, name: o.rodName ?? \"\", pp: Number(o.rodCost) || 0 });\n", to: "", breaks: "E2b" },
  { file: CAST, name: "R13 — the draw is offered and the pool test ignores it",
    from: "  if (totalPP > ppPool + rodDraw) {", to: "  if (totalPP > ppPool) {", breaks: "E3c" },
  { file: CAST, name: "R13 — the caster pays the whole cost anyway",
    from: '      "system.resources.pp.value": Math.max(0, ppPool - casterPPSpent)', to: '      "system.resources.pp.value": Math.max(0, ppPool - ppSpent)', breaks: "E3d" },
  { file: RODS, name: "R13 — a split that charges the rod more than was drawn",
    from: "  const rod = Math.min(spent, Math.max(0, Math.floor(Number(rodDraw) || 0)));", to: "  const rod = spent;", breaks: "E3b" },
  { file: RODS, name: "R14 — Accuracy past +2",
    from: "  const n = Math.max(0, Math.min(Number(rod?.maxPP ?? 0), Math.floor(Number(pp) || 0)));", to: "  const n = Math.max(0, Math.floor(Number(pp) || 0));", breaks: "E4" },
  { file: CAST, name: "R14 — Accuracy's row never reaches the attack",
    from: "      .concat(Array.isArray(extraAttackRows) ? extraAttackRows : []), {});", to: ", {});", breaks: "E4b" },
  { file: RODS, name: "R14 — Alertness on any skill",
    from: "    const matches = (key && subjects.includes(key)) || (action && actions.includes(action)) || (types.length && types.includes(String(checkType ?? \"\")));\n    if (!matches) continue;\n    return { ...rodRow(item), cost: Math.max(0, Math.floor(Number(spec.cost ?? 2) || 0)) };", to: "    return { ...rodRow(item), cost: Math.max(0, Math.floor(Number(spec.cost ?? 2) || 0)) };", breaks: "E5" },
  { file: RODS, name: "R16 — a broken rod still works",
    from: "item?.system?.equipped && chargedOf(item) && !broken(item));", to: "item?.system?.equipped && chargedOf(item));", breaks: "E6" },

  /* F — weapon forms */
  { file: FORMS, name: "R15 — a staff in a pack is still a weapon",
    from: "    if (!item?.system?.equipped) continue;\n    const form", to: "    const form", breaks: "F1" },
  { file: HELD, name: "R15 — the form takes a second hand",
    from: '  if (item.type === "weapon" && item.flags?.["trg-prime"]?.weaponFormOf) return 0;\n', to: "", breaks: "F3" },
  { file: CUSTOMADD, name: "R15 — the form opens a Customise dialog",
    from: "  if (item?.flags?.[SYSTEM_ID]?.weaponFormOf) return false;\n", to: "", breaks: "F3b" },

  /* G — depletion */
  { file: ITEMS, name: "R16 — the explosion's radius is 10 ft whatever the level",
    from: "  return { radiusFeet: 10 * lvl,", to: "  return { radiusFeet: 10,", breaks: "G2" },
  { file: DEPLETE, name: "R16 — a crumbled item stays",
    from: "  if (crumbles || explosion) await item.delete();\n", to: "", breaks: "G3" },
  { file: DEPLETE, name: "R16 — an untracked item does not break (the shipped defect)",
    from: '    await item.update({ "system.hp.max": UNTRACKED_BROKEN_HP.max, "system.hp.value": UNTRACKED_BROKEN_HP.value });', to: "    void 0;", breaks: "G4" },
  { file: CHARGEDF, name: "R16 — a broken item casts",
    from: "  if (chargedItemBroken(item)) {\n    ui.notifications.warn", to: "  if (false) {\n    ui.notifications.warn", breaks: "G4b" },
  { file: CASTING, name: "R16 — the Resonance Event loses its +20",
    from: "  let total = Math.floor(Number(extra) || 0);", to: "  let total = 0;", breaks: "G5" },
  { file: ITEMS, name: "R16 — 100 refills but holds no more",
    from: '  if (kind === "rechargePlus") return { uses: max + 1, maximumPP: max + 1 };', to: '  if (kind === "rechargePlus") return { uses: max, maximumPP: max };', breaks: "G6" },

  /* H — Other Charged Items */
  { file: BUILDER, name: "B13 — each spell once, not twice",
    from: "    maximumPP: list.reduce((sum, c) => sum + 2 * c, 0)", to: "    maximumPP: list.reduce((sum, c) => sum + c, 0)", breaks: "H1" },
  { file: BUILDER, name: "B13 — the builder ignores the kind",
    from: '  } else if (kind === "other") {\n    ({ level, maximumPP } = otherChargedFigures(costs));\n', to: "", breaks: "H1" }
];

function run() {
  try { execFileSync(process.execPath, [VERIFY], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const files = [...new Set(MUTATIONS.map((m) => m.file)), VERIFY];
const guard = guardFiles(files);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-block36b: verify already fails on an unmodified tree.\n");
    guard.release(); process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const n = original.split(m.from).length - 1;
    if (n !== 1) { results.push({ name: m.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR x${n}` }); continue; }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally { guard.restore(); guard.release(); }

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(bad.length
  ? `\nmutate-block36b: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-block36b: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
