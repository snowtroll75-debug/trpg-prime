#!/usr/bin/env node
/**
 * mutate-chapter6-gear-151-160 — can the pages 151-160 checks fail?
 *
 * NEW at 3.575.0. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back exactly as it stood: Double
 * read as Agile, the Shield spell's block reading a shield that is not
 * there, the racial clause doing nothing, Volley untyped, reach gated on
 * flanking. Then the ones that shipped as "computed and read by nobody" —
 * Boss, Spikes, Balanced, the helm penalty, the Other table's -1 — which
 * are the kind that leave the system looking entirely healthy.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const HELD = path.join(SYSTEM_ROOT, "module", "held-items.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const DOUBLE = path.join(SYSTEM_ROOT, "module", "combat", "double-slice.mjs");
const PROF = path.join(SYSTEM_ROOT, "module", "proficiency-rules.mjs");
const AMMO = path.join(SYSTEM_ROOT, "module", "combat", "ammunition.mjs");
const BLOCKWF = path.join(SYSTEM_ROOT, "module", "combat", "shield-block-workflow.mjs");
const BLOCK = path.join(SYSTEM_ROOT, "module", "combat", "shield-block.mjs");
const ITEMS = path.join(SYSTEM_ROOT, "module", "items.mjs");
const SHIELDSPELL = path.join(SYSTEM_ROOT, "module", "magic", "spell-shield.mjs");
const EFFECTAPP = path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs");
const BASH = path.join(SYSTEM_ROOT, "module", "combat", "shield-bash.mjs");
const ACTOR = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const STANCES = path.join(SYSTEM_ROOT, "module", "combat", "basic-action-stances.mjs");
const ATTACKRULES = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const DIALOG = path.join(SYSTEM_ROOT, "module", "item-customize-workflow.mjs");
const RELOAD = path.join(SYSTEM_ROOT, "module", "combat", "reload.mjs");
const ACTIONWF = path.join(SYSTEM_ROOT, "module", "combat", "action-workflow.mjs");
const STEALTH = path.join(SYSTEM_ROOT, "module", "stealth.mjs");
const ARMOURDESC = path.join(SYSTEM_ROOT, "module", "armour-descriptions.mjs");
const ENCUMBRANCE = path.join(SYSTEM_ROOT, "module", "encumbrance.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter6-gear-151-160.mjs");

const MUTATIONS = [
  {
    file: HELD,
    name: "Hand & a Half's two-handed grip takes one hand again (D2 as shipped)",
    from: "if (hands === 1 && heldInTwoHandGrip(item)) return 2;",
    to: "if (false && heldInTwoHandGrip(item)) return 2;",
    breaks: "B4 — a two-handed bastard sword and a heavy shield fit in two hands"
  },
  {
    file: HELD,
    name: "one-size-larger weapons lose the x1.5 (D1 as shipped)",
    from: "if (itemStep !== null && itemStep - actorStep === 1) return true;",
    to: "if (false) return true;",
    breaks: "B1 — seventeen Large weapons add plain Strength"
  },
  {
    file: HELD,
    name: "a light shield's hand carries nothing",
    from: "return Math.max(0, sum - Math.min(carriers, riders));",
    to: "return Math.max(0, sum);",
    breaks: "F10 — sword, light shield and torch is three hands"
  },
  {
    file: HELD,
    name: "the madu's hand is not bound",
    from: "return !item?.system?.handBound;",
    to: "return true;",
    breaks: "F10 — the madu carries a torch"
  },
  {
    file: ATTACK,
    name: "the attack path's x1.5 is Hand & a Half only again",
    from: "const usedTwoHanded = !isRanged &&",
    to: "const usedTwoHanded = Boolean(weaponData.twoHandedGrip) && !isRanged &&",
    breaks: "B6"
  },
  {
    file: ATTACK,
    name: "THE SHIPPED DEFECT: Double is read as Agile for the MAP",
    from: "const agile = /\\bagile\\b/i.test(String(weaponData.traits ?? \"\"));",
    to: "const agile = /\\b(agile|double)\\b/i.test(String(weaponData.traits ?? \"\"));",
    breaks: "C1 — a staff's third swing at -8"
  },
  {
    file: DOUBLE,
    name: "a lone double weapon cannot Double Slice (D3 as shipped)",
    from: "if (weapons.length < 2 && !weapons.some((w) => doubleWeaponInBothHands(w, actorSize))) {",
    to: "if (weapons.length < 2) {",
    breaks: "C3"
  },
  {
    file: DOUBLE,
    name: "a double weapon in one hand counts as both",
    from: "return isDoubleWeapon(weapon) && itemRequiredHands(weapon, actorSize) === 2;",
    to: "return isDoubleWeapon(weapon) && itemRequiredHands(weapon, actorSize) >= 1;",
    breaks: "C3 — a one-handed staff swung from both ends"
  },
  {
    file: DOUBLE,
    name: "the double weapon's second end is not agile",
    from: "if (sameDoubleWeapon && isDoubleWeapon(weapon)) return null;",
    to: "if (false) return null;",
    breaks: "C5"
  },
  {
    file: DOUBLE,
    name: "the same double weapon may not strike twice",
    from: "if (doubleWeaponInBothHands(first, actorSize)) return { ok: true, reason: \"\" };",
    to: "if (false) return { ok: true, reason: \"\" };",
    breaks: "C4"
  },
  {
    file: PROF,
    name: "a racial trait matched as a substring",
    from: ".some((entry) => entry === wanted);",
    to: ".some((entry) => entry.includes(wanted));",
    breaks: "D1 — Elf matches Elfbane"
  },
  {
    file: PROF,
    name: "THE SHIPPED DEFECT: the racial clause does nothing",
    from: "    return \"Martial\";",
    to: "    return category;",
    breaks: "D2 — a dwarf untrained with a zokarrin"
  },
  {
    file: PROF,
    name: "the profile forgets the race",
    from: "items.find((item) => item.type === \"race\")?.name",
    to: "items.find((item) => item.type === \"no-such-type\")?.name",
    breaks: "D2"
  },
  {
    file: PROF,
    name: "the parrying scabbard falls outside every proficiency",
    from: "Object.freeze({ scabbard: \"light\" });",
    to: "Object.freeze({});",
    breaks: "D4"
  },
  {
    file: AMMO,
    name: "ammunition matched on group alone again",
    from: "return declared || String(weaponSystem?.group ?? \"\").trim().toLowerCase();",
    to: "return String(weaponSystem?.group ?? \"\").trim().toLowerCase();",
    breaks: "E1/E2 — a Bow-group crossbow takes arrows"
  },
  {
    file: BLOCKWF,
    name: "THE SHIPPED DEFECT: the blocker's name read off a shield that is not there",
    from: "const blockerName = carried?.name ?? spell?.label ?? \"Shield\";",
    to: "const blockerName = eligibility.shield.name;",
    breaks: "F1 — the Shield spell's block throws"
  },
  {
    file: BLOCKWF,
    name: "a spell block does not end the spell",
    from: "lines.push(...await endSpellShieldOnBlock(actor, spell));",
    to: "void endSpellShieldOnBlock;",
    breaks: "F1"
  },
  {
    file: BLOCK,
    name: "shields weighed at their base against a spell's final figure",
    from: "const dr = effectiveDR(effectiveShieldDR(shield), bdb);",
    to: "const dr = effectiveShieldDR(shield);",
    breaks: "F2 — a x3 heavy shield loses to a DR-2 spell"
  },
  {
    file: ITEMS,
    name: "shield DR summed again (D10 as shipped)",
    from: "return (items ?? []).reduce((best, item) => Math.max(best, effectiveShieldDR(item)), 0);",
    to: "return (items ?? []).reduce((best, item) => best + effectiveShieldDR(item), 0);",
    breaks: "F3"
  },
  {
    file: SHIELDSPELL,
    name: "a spell's rows are kept after it ends",
    from: "return list.filter((row) => row?.castId !== castId);",
    to: "return list;",
    breaks: "F4"
  },
  {
    file: EFFECTAPP,
    name: "ending a cast leaves its spell shield",
    from: "await actor.setFlag(SYSTEM_ID, SPELL_SHIELD_FLAG, spellShieldsWithout(rows, castId));",
    to: "void rows;",
    breaks: "F4 — Shield blocks forever"
  },
  {
    file: BASH,
    name: "Boss does nothing (D6 as shipped)",
    from: "const boss = Math.max(0, Number(mods.bashDieStepUp) || 0);",
    to: "const boss = 0;",
    breaks: "F5"
  },
  {
    file: BASH,
    name: "Spikes does nothing (D6 as shipped)",
    from: "const types = spikes && own !== \"piercing\" ? [own, \"piercing\"] : [own];",
    to: "const types = [own];",
    breaks: "F5"
  },
  {
    file: BASH,
    name: "R8 undone: the bash takes the shield's quality as a weapon's",
    from: "buildWeaponDamageFormula(profile.damage, { bab, critical });",
    to: "buildWeaponDamageFormula(profile.damage, { bab, critical, quality: shield.system?.quality || \"standard\" });",
    breaks: "F5"
  },
  {
    file: ACTOR,
    name: "a destroyed shield keeps its DB (D8 as shipped)",
    from: "itemStatus(item.system?.hp?.value, item.system?.hp?.max) !== \"destroyed\"",
    to: "itemStatus(item.system?.hp?.value, item.system?.hp?.max) !== \"no-such-status\"",
    breaks: "F6"
  },
  {
    file: ACTOR,
    name: "a busy buckler stays in the shield pieces",
    from: ".filter((piece) => !(bucklerArmBusy && piece.buckler))",
    to: ".filter(() => true)",
    breaks: "F7"
  },
  {
    file: ATTACK,
    name: "Shielded Stride finds a buckler by name again",
    from: "(i) => i.system?.equipped && isBuckler(i)",
    to: "(i) => i.system?.equipped && /\\bbuckler\\b/i.test(String(i.name ?? \"\"))",
    breaks: "F8"
  },
  {
    file: STANCES,
    name: "the madu eases nothing",
    from: "if (declared < 0 && (eased === null || declared > eased)) eased = declared;",
    to: "if (false) eased = declared;",
    breaks: "F9"
  },
  {
    file: ATTACK,
    name: "Balanced read by nobody (D7 as shipped)",
    from: "floored: masteryReduction + balancedReduction",
    to: "floored: masteryReduction",
    breaks: "G3"
  },
  {
    file: ATTACKRULES,
    name: "the fumble floor raises a DC already under 4",
    from: "return Math.max(0, Math.max(Math.min(4, raw), raw - cut));",
    to: "return Math.max(0, Math.max(4, raw - cut));",
    breaks: "G2"
  },
  {
    file: DIALOG,
    name: "a repeatable trait is a tick again",
    from: ".flatMap((el) => Array(Math.max(0, Math.floor(Number(el.value) || 0))).fill(el.dataset.trait))",
    to: ".flatMap((el) => (Number(el.value) > 0 ? [el.dataset.trait] : []))",
    breaks: "G4"
  },
  {
    file: ATTACK,
    name: "THE SHIPPED DEFECT: Volley untyped",
    from: "modifiers.push({ label: \"Volley (within 20 ft)\", value: -2, type: \"circumstance\" });",
    to: "modifiers.push({ label: \"Volley (within 20 ft)\", value: -2, type: \"untyped\" });",
    breaks: "G5"
  },
  {
    file: ATTACK,
    name: "THE SHIPPED DEFECT: reach is a flanking question",
    from: "  const measuresReach = positional && !isRanged;",
    to: "  const measuresReach = positional && !isRanged && !targetCannotBeFlanked;",
    breaks: "G6"
  },
  {
    file: RELOAD,
    name: "Spin uncapped (D13 as shipped)",
    from: "return Math.min(SPIN_MAX_BONUS, Math.max(0, Math.floor(Number(apSpentSpinning) || 0)));",
    to: "return Math.max(0, Math.floor(Number(apSpentSpinning) || 0));",
    breaks: "G7"
  },
  {
    file: ATTACK,
    name: "a missed shot keeps its spin",
    from: "if (spinCarried) await weapon.update({ \"system.spinBonus\": 0 });",
    to: "void spinCarried;",
    breaks: "G7"
  },
  {
    file: ACTIONWF,
    name: "Shove/Trip back to the item field alone (D14 as shipped)",
    from: "if (weapon) modifiers.push(...weaponManeuverModifiers(actor, weapon));",
    to: "if (weapon) modifiers.push({ label: \"Weapon\", value: Number(weapon.system?.attackBonus ?? 0), type: \"item\" });",
    breaks: "G8"
  },
  {
    file: STEALTH,
    name: "Concealable matched on the wrong word",
    from: "/\\bconcealable\\b/i.test(String(item?.system?.traits ?? \"\"))",
    to: "/\\bconceal\\b/i.test(String(item?.system?.traits ?? \"\"))",
    breaks: "G9"
  },
  {
    file: ARMOURDESC,
    name: "a Helm suit has no perception penalty",
    from: "if (/\\bhelm\\b/i.test(traits)) return HELM_PERCEPTION_PENALTY;",
    to: "if (false) return HELM_PERCEPTION_PENALTY;",
    breaks: "H1"
  },
  {
    file: ARMOURDESC,
    name: "the mildest helm penalty wins",
    from: "if (value < 0 && (!worst || value < worst.value)) worst = { value, source: item.name };",
    to: "if (value < 0 && (!worst || value > worst.value)) worst = { value, source: item.name };",
    breaks: "H2"
  },
  {
    file: ACTOR,
    name: "the helm penalty is never applied (D16 as shipped)",
    from: "prepareHelmPerception(system, this);",
    to: "void prepareHelmPerception;",
    breaks: "H2"
  },
  {
    file: ARMOURDESC,
    name: "metal bracers are just bracers",
    from: "return { data: { ...data, ...GAUNTLET_PROFILE }, source: bracers };",
    to: "return { data, source: bracers };",
    breaks: "H3"
  },
  {
    file: ARMOURDESC,
    name: "furs warm you from the pack",
    from: "if (item?.type !== \"armour\" || !wornAndStanding(item)) continue;",
    to: "if (item?.type !== \"armour\") continue;",
    breaks: "H4"
  },
  {
    file: ENCUMBRANCE,
    name: "the Other table's -1 ignored (open since 3.215.0)",
    from: "return Math.max(0, Number(cap) + change);",
    to: "return Math.max(0, Number(cap));",
    breaks: "H5"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([
  HELD, ATTACK, DOUBLE, PROF, AMMO, BLOCKWF, BLOCK, ITEMS, SHIELDSPELL, EFFECTAPP, BASH, ACTOR, STANCES, ATTACKRULES, DIALOG, RELOAD, ACTIONWF, STEALTH, ARMOURDESC, ENCUMBRANCE, CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter6-gear-151-160: verify already fails on an unmodified tree.\n");
    guard.release();
    process.exit(2);
  }
  for (const m of MUTATIONS) {
    const original = fs.readFileSync(m.file, "utf8");
    const occurrences = original.split(m.from).length - 1;
    if (occurrences !== 1) {
      results.push({ name: m.name, state: occurrences === 0 ? "ANCHOR MISSING" : `ANCHOR x${occurrences}` });
      continue;
    }
    fs.writeFileSync(m.file, original.replace(m.from, m.to));
    const survived = run();
    fs.writeFileSync(m.file, original);
    results.push({ name: m.name, state: survived ? "SURVIVED" : "caught", breaks: m.breaks });
  }
} finally {
  guard.restore();
  guard.release();
}

const bad = results.filter((r) => r.state !== "caught");
for (const r of results) {
  process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`);
}
process.stdout.write(
  bad.length
    ? `\nmutate-chapter6-gear-151-160: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter6-gear-151-160: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
