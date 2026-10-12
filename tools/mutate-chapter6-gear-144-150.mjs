#!/usr/bin/env node
/**
 * mutate-chapter6-gear-144-150 — can the Chapter 6 gear checks fail?
 *
 * NEW at 3.573.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED DEFECT: the ACP reduction added back to a stored
 * negative penalty, which inverted on every piece of armour that had no
 * penalty to begin with. Thirteen of twenty-six pieces got the wrong
 * figure and seven were made strictly worse by the material meant to
 * help them, for as long as the feature had existed, with nothing
 * complaining. If the new checks cannot catch it being put back they are
 * not guarding the rule.
 *
 * #2 AND #3 ARE THE TWO ROUNDINGS, collapsed back into one. Page 146
 * prints "or part thereof" on the Dexterity penalty and not on the Speed
 * penalty; making either match the other is a one-word edit that throws
 * nothing and quietly changes every overloaded character in the game.
 *
 * THE REST ARE THE QUIET ONES: a rule that is computed and discarded
 * (Keen, silver, Eaog), a condition registered and never applied, a
 * broken item that goes on working, and a multiplier no caller reaches.
 * Every one of them leaves the system looking entirely healthy.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const ENCUMBRANCE = path.join(SYSTEM_ROOT, "module", "encumbrance.mjs");
const WORKFLOW = path.join(SYSTEM_ROOT, "module", "encumbrance-workflow.mjs");
const FEATS = path.join(SYSTEM_ROOT, "module", "feats-workflow.mjs");
const QUALITY = path.join(SYSTEM_ROOT, "module", "item-quality.mjs");
const ITEMS = path.join(SYSTEM_ROOT, "module", "items.mjs");
const ATTACK = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const EFFECT = path.join(SYSTEM_ROOT, "module", "documents", "active-effect.mjs");
const MODIFIER = path.join(SYSTEM_ROOT, "module", "modifier", "app.mjs");
const DONNING = path.join(SYSTEM_ROOT, "module", "donning.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "item-sheet.mjs");
const DAMAGE = path.join(SYSTEM_ROOT, "module", "combat", "damage.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const ACTOR = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const DIALOG = path.join(SYSTEM_ROOT, "module", "item-customize-workflow.mjs");
const TEMPLATE = path.join(SYSTEM_ROOT, "templates", "item", "item-sheet.hbs");
const RUNES = path.join(SYSTEM_ROOT, "module", "codex-runes.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter6-gear-144-150.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT, exactly as it stood.
    file: ENCUMBRANCE,
    name: "THE SHIPPED DEFECT: an ACP reduction can invert into a penalty",
    from: "  return -Math.max(0, magnitude - reduction);",
    to: "  return -(magnitude - reduction);",
    breaks: "B1/B8/B9/B10 — Padded and Leather acquire an ACP of 2 for being well made"
  },
  {
    file: ENCUMBRANCE,
    name: "THE DEX ROUNDING FLATTENED: 'or part thereof' is dropped",
    from: "  return Math.ceil(excess / 20);",
    to: "  return Math.floor(excess / 20);",
    breaks: "A2/A4 — a character 19 lb over takes no penalty at all"
  },
  {
    file: ENCUMBRANCE,
    name: "THE SPEED ROUNDING FLATTENED: a part step costs Speed",
    from: "  return Math.floor(excess / 20);",
    to: "  return Math.ceil(excess / 20);",
    breaks: "A3/A4 — the Speed clause prints no 'part thereof'"
  },
  {
    // ENCUMBERED BACK TO A THRESHOLD, which is where Nimble Dodge's
    // requirement went wrong in the first place.
    file: ENCUMBRANCE,
    name: "Encumbered needs a full 20 lb step again",
    from: "  return (Number(carriedWeight || 0) - Number(allowance || 0)) > 0;",
    to: "  return (Number(carriedWeight || 0) - Number(allowance || 0)) >= 20;",
    breaks: "A5 — page 146 gives no threshold"
  },
  {
    // THE CONDITION STOPS BEING APPLIED — the state it shipped in.
    file: WORKFLOW,
    name: "THE SHIPPED GAP: the Encumbered condition is never applied",
    from: '      conditionId: "encumbered",',
    to: '      conditionId: "",',
    breaks: "A9 — registered and applied to nobody, as before"
  },
  {
    file: FEATS,
    name: "Nimble Dodge goes back to gating on the step count",
    from: "        || Boolean(actor._trgEncumbered)\n        || Boolean(actor.hasCondition?.(\"encumbered\"))) {",
    to: "        || Number(actor._trgEncumbranceSteps ?? 0) > 0) {",
    breaks: "A12 — a character 19 lb over qualifies for a feat that says otherwise"
  },
  {
    // A COMPUTED RULE DISCARDED AGAIN — the shape this whole block of
    // defects took.
    file: ATTACK,
    name: "the material's Keen is computed and discarded once more",
    from: "    materialGrantedWeaponTraits(weaponData).includes(\"keen\") ||",
    to: "",
    breaks: "D9 — a Mithril longsword loses its Keen critical"
  },
  {
    file: QUALITY,
    name: "Mithril and Alchemical Silver stop counting as silver",
    from: "  if (material.overcomesResistance) {\n    return String(material.overcomesResistance).trim().toLowerCase();\n  }\n  if (material.weaponCountsAsSilver) return \"silver\";",
    to: "",
    breaks: "D2/D3/D5 — neither weapon bypasses a silver resistance"
  },
  {
    file: QUALITY,
    name: "Eaog's saving-throw bonus is pooled instead of offered",
    from: "    auto: false,",
    to: "    auto: true,",
    breaks: "D19 — +2 against a pit trap and a falling rock"
  },
  {
    file: QUALITY,
    // RE-ANCHORED at 3.574.0 onto the shared worn-and-standing gate,
    // which now carries this check for Eaog and Dragonhide both.
    name: "a worn material's effects apply to armour merely carried",
    from: "  if (!item?.system?.equipped) return false;",
    to: "  if (false) return false;",
    breaks: "D14 — armour in the backpack raises your casting DCs"
  },
  {
    // A BROKEN ITEM GOES BACK TO WORKING.
    file: ATTACK,
    name: "THE SHIPPED GAP: a broken weapon attacks again",
    from: "  if (weaponCondition === \"broken\" || weaponCondition === \"destroyed\") {",
    to: "  if (false) {",
    breaks: "E12 — 'a broken object can't be used for its normal function'"
  },
  {
    file: EFFECT,
    name: "a broken item grants its bonuses again",
    from: "    return itemStatus(hp.value, hp.max) !== \"intact\"\n      && itemStatus(hp.value, hp.max) !== \"untracked\";",
    to: "    return false;",
    breaks: "E14 — 'nor does it grant bonuses'"
  },
  {
    // THE BLAST RADIUS. Suppressing untracked items would disable every
    // ordinary piece of gear in every world at once.
    file: EFFECT,
    name: "untracked items are suppressed too",
    from: "    return itemStatus(hp.value, hp.max) !== \"intact\"\n      && itemStatus(hp.value, hp.max) !== \"untracked\";",
    to: "    return itemStatus(hp.value, hp.max) !== \"intact\";",
    breaks: "E15 — every ordinary item in the game stops granting anything"
  },
  {
    file: ITEMS,
    name: "the destroyed threshold rounds the wrong way",
    from: "  const destroyedThreshold = -Math.ceil(maxHP / 2);",
    to: "  const destroyedThreshold = -Math.floor(maxHP / 2);",
    breaks: "E5 — 'reduced to a negative value equal to half its HP (round up)'"
  },
  {
    file: ITEMS,
    name: "breaking an item heals one already below zero",
    from: "  return Math.min(0, Math.floor(Number(currentValue) || 0));",
    to: "  return 0;",
    breaks: "E10 — 'if the item had more Hit Points than that'"
  },
  {
    file: MODIFIER,
    name: "the GM tool goes back to the always-zero hardness",
    from: "        Number(item.system?.dr ?? 0) || 0,",
    to: "",
    breaks: "E17 — every point of damage applied in full, disagreeing with the item sheet"
  },
  {
    file: MODIFIER,
    name: "a destroyed item can be repaired again",
    from: '      if (itemStatus(before, max) === "destroyed") {',
    to: "      if (false) {",
    breaks: "E16 — 'a destroyed item can't be Repaired'"
  },
  // ---- DRAGONHIDE (3.574.0) ----
  {
    // THE SHAPE A TWO-ENERGY DRAGON WOULD BREAK IN: a reader that takes
    // the first entry. Shade's fire half would vanish without a sound.
    file: QUALITY,
    name: "a two-energy dragon keeps only its first energy",
    from: "  return dragon ? [...dragon.energy] : [];",
    to: "  return dragon ? dragon.energy.slice(0, 1) : [];",
    breaks: "G2.shade/G5/G17 — Shade armour stops resisting fire"
  },
  {
    file: QUALITY,
    name: "one of Graham's dragons carries the wrong energy",
    from: '  forest: Object.freeze({ label: "Forest", energy: Object.freeze(["poison"]) }),',
    to: '  forest: Object.freeze({ label: "Forest", energy: Object.freeze(["acid"]) }),',
    breaks: "G2.forest — checked against the ruling as typed, not against the module"
  },
  {
    // THE STATE IT SHIPPED IN: computed, and written nowhere.
    file: ACTOR,
    name: "THE SHIPPED GAP: Dragonhide resistance is computed and not written",
    from: "        String(system.combat.resistances ?? \"\"), ...runeEffects.resistances, ...materialResistances",
    to: "        String(system.combat.resistances ?? \"\"), ...runeEffects.resistances",
    breaks: "G24 — the suit resists nothing, as before"
  },
  {
    file: QUALITY,
    name: "a Dragonhide shield grants resistance as well",
    from: '    if (item?.type !== "armour" || !wornAndStanding(item)) continue;',
    to: "    if (!wornAndStanding(item)) continue;",
    breaks: "G7 — the page gives shields the DB and armour the resistance"
  },
  {
    // DESTROYED ARMOUR GOES BACK TO PROTECTING.
    file: QUALITY,
    name: "destroyed armour's material goes on working",
    from: "  return Math.floor(Number(hp?.value) || 0) > -Math.ceil(max / 2);",
    to: "  return true;",
    breaks: "G13/G14 — a destroyed suit still resists, and destroyed Eaog still wards"
  },
  {
    file: QUALITY,
    name: "the shield's bonus stops asking whether the energy matches",
    from: "    if (!energies.some((energy) => types.includes(energy))) continue;",
    to: "    if (!energies.length) continue;",
    breaks: "G16 — +2 DB against a sword because the scales came from a Fire dragon"
  },
  {
    // THE SITE THAT MATTERS: spells are where energy meets DB.
    file: CAST,
    name: "THE SHIPPED GAP: a spell attack never meets the Dragonhide shield",
    from: "  const dragonhideDB = dragonhideShieldDB(Array.from(targetActor.items ?? []), [dealtType]);",
    to: "  const dragonhideDB = 0;",
    breaks: "G25 — the shield does nothing against the attacks it was made for"
  },
  {
    file: CAST,
    name: "the spell card prints the DB before the shield",
    from: "attack ${total} vs DB ${defendedDB}${outcome.autoMiss",
    to: "attack ${total} vs DB ${baseDB}${outcome.autoMiss",
    breaks: "G26 — 'attack 17 vs DB 16 — Miss'"
  },
  {
    file: ATTACK,
    name: "a weapon strike stops adding the shield's bonus",
    from: "+ arrowCatchingDB + dragonhideDB + shieldedStrideDB",
    to: "+ arrowCatchingDB + shieldedStrideDB",
    breaks: "G27 — computed, printed on the card, and not added"
  },
  {
    file: DIALOG,
    name: "a suit re-made in another material keeps its old dragon",
    from: '            dragonType: form.querySelector(".trg-customise-material").value === "dragonhide"',
    to: "            dragonType: true",
    breaks: "G29 — a Mithril suit quietly still carrying a dragon"
  },
  {
    file: QUALITY,
    name: "Dragonhide is offered for a wooden shield again",
    from: "      return metal !== false;",
    to: "      return true;",
    breaks: "G32 — 'metal shields' only"
  },
  // ---- FOUND IN LIVE TESTING OF 3.574.0 ----
  {
    file: WORKFLOW,
    name: "LIVE: the condition is named with its raw id again",
    from: "      : (registered?.label ?? conditionId);",
    to: "      : conditionId;",
    breaks: "H1 — an effect called 'encumbered' on every overloaded sheet"
  },
  {
    file: WORKFLOW,
    name: "LIVE: an actor created already overloaded is not synced",
    from: '  Hooks.on("createActor", (actor) => sync(actor));',
    to: "",
    breaks: "H4 — an imported or duplicated character carries the load and none of the condition"
  },
  {
    file: WORKFLOW,
    name: "LIVE: the world-open sweep is dropped",
    from: "      void syncEncumbranceImmobilised(actor, { quiet: true });",
    to: "      void actor;",
    breaks: "H5 — every existing overloaded character stays unconditioned until they move something"
  },
  {
    file: WORKFLOW,
    name: "the world-open sweep announces every overloaded character",
    from: "      notice: encumbered && !quiet",
    to: "      notice: encumbered",
    breaks: "H6 — a banner per character on opening a world"
  },
  {
    file: TEMPLATE,
    name: "LIVE: the donning sentence stops saying whether the figure is already doubled",
    from: "            {{#if donning.doubled}}",
    to: "            {{#if false}}",
    breaks: "H9 — '20 minutes … doubled for a full suit' read as an instruction to double again"
  },
  {
    file: RUNES,
    name: "a Fleetguard time is claimed as doubled when it is shown as printed",
    from: "    doubled: false,",
    to: "    doubled: Boolean(fullSuit),",
    breaks: "H11 — the sheet would say 'already doubled' under a rune's undoubled time"
  },
  {
    // THE DOUBLING BACK TO DEAD CODE.
    file: SHEET,
    name: "THE SHIPPED GAP: the full-suit doubling stops being asked for",
    // Six spaces since 3.577.0: the rune panel moved into `_runeContext`.
    from: "      ? donningTimeFor(this.item, { fullSuit: isFullSuit(this.item) })",
    to: "      ? donningTimeFor(this.item)",
    breaks: "F13 — Full Platemail shows 10 minutes where the book says 20"
  },
  {
    file: DONNING,
    name: "a suit is decided by one location instead of three",
    from: "  return Boolean(system.coversTorso && system.coversArms && system.coversLegs);",
    to: "  return Boolean(system.coversTorso);",
    breaks: "F9 — a breastplate becomes a full suit"
  },
  {
    file: DAMAGE,
    name: "a DR multiplier band shifts by one",
    from: "  if (value >= 6) return 2;",
    to: "  if (value >= 7) return 2;",
    breaks: "F1 — the printed table starts x2 at BDB 6"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch { return false; }
}

const guard = guardFiles([
  ENCUMBRANCE, WORKFLOW, FEATS, QUALITY, ITEMS, ATTACK, EFFECT, MODIFIER, DONNING, SHEET, DAMAGE,
  CAST, ACTOR, DIALOG, TEMPLATE, RUNES, CHECK
]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-chapter6-gear-144-150: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-chapter6-gear-144-150: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-chapter6-gear-144-150: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
