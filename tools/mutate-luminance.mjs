#!/usr/bin/env node
/**
 * mutate-luminance — can verify-luminance fail?
 *
 * NEW at 3.435.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 IS THE SHIPPED STATE: the pack entry was empty in five places and
 * the spell did nothing at all. #6 is the one that would hurt a table
 * most quietly — the undead inversion turned into a negative heal, which
 * bypasses every resistance and immunity on the way past.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULES = path.join(SYSTEM_ROOT, "module", "magic", "luminance.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "luminance-workflow.mjs");
const COMBAT = path.join(SYSTEM_ROOT, "module", "documents", "combat.mjs");
const SUSTAIN = path.join(SYSTEM_ROOT, "module", "magic", "sustain-workflow.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const EMANATION = path.join(SYSTEM_ROOT, "module", "magic", "emanation.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-luminance.mjs");

// SOME ANCHORS RE-INDENTED AT 3.462.0, when the emanation recording was
// lifted out of the lock/sustained guard in cast-workflow and its block
// lost a level. The mutations are unchanged in substance; only the
// whitespace they match moved.
const MUTATIONS = [
  {
    file: COMBAT,
    name: "THE SHIPPED STATE: nothing fires at the start of a turn",
    from: "    for (const heal of await applyPerTurnEmanations(actor, combatant.token?.object ?? null)) {",
    to: "    for (const heal of []) {",
    breaks: "F1 — the spell heals nobody, exactly as its empty effects array did"
  },
  {
    file: FLOW,
    name: "the radius is not consulted, so it heals the whole scene",
    from: "    if (!inside.length) continue;",
    to: "    if (false) continue;",
    breaks: "F3 — 'in the radius of the spell' becomes 'anywhere'"
  },
  {
    file: FLOW,
    name: "an undead is identified by something other than its creature type",
    from: "    const undead = isUndead(actor.system);",
    to: "    const undead = /undead|skeleton|zombie/i.test(actor.name ?? \"\");",
    breaks: "F2 — Graham's ruling was the creature type, not a guess at a name"
  },
  {
    file: RULES,
    name: "the undead are healed along with everyone else",
    from: "    mode: undead ? \"damage\" : \"heal\",",
    to: "    mode: \"heal\",",
    breaks: "C2 — positive energy stops burning the undead"
  },
  {
    file: RULES,
    name: "bleed is cleared from the undead too",
    from: "    bleedRemoved: undead ? 0 : Math.max(0, Math.trunc(Number(state?.bleedRemoved) || 0))",
    to: "    bleedRemoved: Math.max(0, Math.trunc(Number(state?.bleedRemoved) || 0))",
    breaks: "C5 — a creature the spell is searing is not being tended"
  },
  {
    file: FLOW,
    name: "THE QUIET ONE: the undead take a negative heal instead of damage",
    // NARROWED AT 3.548.0, for the reason above: the option object grew
    // `magical` and `area`, and an anchor quoting the whole call broke.
    from: "      if (packet.taken > 0) await applyDamageAndCheckDying(actor, packet.taken);",
    to: "      await actor.update({ \"system.resources.hp.value\": Math.max(0, (Number(actor.system?.resources?.hp?.value) || 0) - amount) });",
    breaks: "F4 — every essence resistance and immunity in the game is skipped"
  },
  {
    file: FLOW,
    name: "healing overshoots the maximum",
    from: "    const healed = Math.min(amount, Math.max(0, max - before));",
    to: "    const healed = amount;",
    breaks: "F5 — a creature at full health is healed past its own maximum"
  },
  {
    file: FLOW,
    name: "a creature at full health is told it was healed",
    from: "        : `already at full health — no healing (${effect.formula} rolled ${amount}).`)",
    to: "        : `healed <strong>${amount}</strong> HP (${effect.formula}).`)",
    breaks: "F6 — the card says 'healed 6' over an unchanged HP bar"
  },
  {
    file: FLOW,
    name: "the sear line hides the roll behind the result",
    from: '        + `(${effect.formula} rolled ${amount}${packet.taken < amount ? " — reduced by its defences" : ""}).`);',
    to: "        + `(${effect.formula}).`);",
    breaks: "F6b — an immune creature's 0 is indistinguishable from a bad die"
  },
  {
    file: RULES,
    name: "a Sustain at the cap announces a die it did not add",
    from: "  if (state.healingDice >= state.maxDice) {",
    to: "  if (false) {",
    breaks: "B5/B6 — Song Of Despair's defect, in a new spell"
  },
  {
    file: RULES,
    name: "one Sustain buys both things",
    from: "    next.bleedRemoved = state.bleedRemoved + 1;",
    to: "    next.bleedRemoved = state.bleedRemoved + 1;\n    next.healingDice = Math.min(state.maxDice, state.healingDice + 1);",
    breaks: "B4 — the printed 'or' becomes 'and'"
  },
  {
    file: RULES,
    name: "a hand-edited flag out-heals the printed maximum",
    from: "    healingDice: Math.min(cap, Number.isFinite(dice) && dice > 0 ? dice : LUMINANCE_BASE_DICE),",
    to: "    healingDice: Number.isFinite(dice) && dice > 0 ? dice : LUMINANCE_BASE_DICE,",
    breaks: "A4 — the cap stops being a cap"
  },
  {
    file: RULES,
    name: "the warp raises the starting dice but not the cap",
    from: "    maxDice: LUMINANCE_MAX_DICE + extra",
    to: "    maxDice: LUMINANCE_MAX_DICE",
    breaks: "D2/D3 — a caster pays to lift a ceiling that does not move"
  },
  {
    file: SUSTAIN,
    name: "the choice is asked after the AP is spent",
    // RE-ANCHORED at 3.436.0, when luminanceRefusal joined the same import.
    from: "  const choice = await promptLuminanceChoice(actor, entry);",
    to: "  const choice = null;",
    breaks: "F7/F8 — a cancelled picker costs an action point"
  },
  /* ------------------------------------------------------------------ *
   * THE REFUSAL (3.436.0), and the direction that must never fire.
   * ------------------------------------------------------------------ */
  {
    file: RULES,
    name: "a choice that buys nothing is charged for anyway",
    from: "  if (luminanceSustain(state, choice).changed) return null;",
    to: "  return null;",
    breaks: "H1 — an AP for a die the spell did not gain"
  },
  {
    file: RULES,
    name: "THE DANGEROUS DIRECTION: bleed removal is refused too",
    from: "  if (luminanceSustain(state, choice).changed) return null;",
    to: "  if (state.healingDice < state.maxDice) return null;",
    breaks: "H2 — the option with no printed ceiling becomes unbuyable at 5d8"
  },
  {
    file: SUSTAIN,
    name: "the refusal is asked after the AP has gone",
    from: "  const buysNothing = luminanceRefusal(entry, choice, entry.name);\n  if (buysNothing) {\n    ui.notifications.warn(buysNothing);\n    return null;\n  }",
    to: "  const buysNothing = null;",
    breaks: "H6 — a refused Sustain still costs an action point"
  },
  {
    file: FLOW,
    name: "the refusal escapes onto spells that declare no choices",
    // ANCHORED ON THE REFUSAL'S OWN GUARD. The identical line also opens
    // `promptLuminanceChoice`, and an anchor matching both would report
    // "ANCHOR x2" rather than mutate — the ambiguity the harness catches
    // instead of guessing which one was meant.
    from: "  if (!choices.length) return null;\n  return luminanceChoiceRefusal(",
    to: "  return luminanceChoiceRefusal(",
    breaks: "H7 — Bless and Protective Ward answer a question about Luminance"
  },
  /* ------------------------------------------------------------------ *
   * THE GATE. #15 IS THE STATE THAT SHIPPED AT 3.435.0 and was found by
   * driving the spell, not by any check: 42 green checks, 14 mutations
   * caught, and a spell that healed nobody because the cast never
   * recorded an emanation for the turn pass to find.
   * ------------------------------------------------------------------ */
  {
    file: EMANATION,
    name: "THE STATE THAT SHIPPED AT 3.435.0: a per-turn effect does not make an emanation live",
    // RE-ANCHORED AT 3.586.0, when `antimagic` joined the list. The
    // mutation is unchanged: taking `perTurn` back out is still the
    // exact state that shipped at 3.435.0 and healed nobody.
    // RE-ANCHORED 3.609.0: the list gained "turnSave" (Turn Undead).
    // RE-ANCHORED 3.612.0: the list gained "heldBonus" (Inspire Heroics).
    // RE-ANCHORED 3.613.0: the list gained "defence" (Protector's Sphere).
    from: 'export const LIVE_EMANATION_EFFECT_KINDS = Object.freeze(["bonus", "perTurn", "antimagic", "zone", "turnSave", "heldBonus", "defence", "damageHeal"]);',
    to: 'export const LIVE_EMANATION_EFFECT_KINDS = Object.freeze(["bonus", "antimagic", "zone", "turnSave", "heldBonus", "defence", "damageHeal"]);',
    breaks: "G1 — no emanation record, so the whole mechanism iterates an empty list"
  },
  {
    file: EMANATION,
    name: "the gate is opened to everything",
    from: "  if (Object.keys(emanationFloors(effects)).length) return true;",
    to: "  return true;",
    breaks: "G3/G4 — a note-only spell, and one with no emanation area, become live"
  },
  {
    file: EFFECTS,
    name: "the card calls a handled effect broken",
    from: '        case "perTurn":\n          break;\n',
    to: "",
    breaks: 'G5 — \'Unhandled effect kind "perTurn"\' once per creature caught'
  },
  {
    file: CAST,
    name: "the declared choices are never recorded",
    // WIDENED AT 3.586.0, because the anchor went AMBIGUOUS rather than
    // missing. A second `sustainChoices: Array.isArray(...)` now sits in
    // the same file — the one on the ACTIVE-SPELL ENTRY, which is what
    // makes a Sustain choice reachable for a spell with no area. This
    // mutation is about the EMANATION copy, so it takes the following
    // line too, where the two differ.
    from: `        sustainChoices: Array.isArray(spellData.sustainChoices)
          ? spellData.sustainChoices.map((c) => ({ ...c })) : [],`,
    to: `        sustainChoices: false && Array.isArray(spellData.sustainChoices)
          ? spellData.sustainChoices.map((c) => ({ ...c })) : [],`,
    breaks: "F10 — the Sustain has nothing to offer and silently grows nothing"
  }
];

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] });
    return true;
  } catch {
    return false;
  }
}

const guard = guardFiles([RULES, FLOW, COMBAT, SUSTAIN, CAST, EMANATION, EFFECTS, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-luminance: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-luminance: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-luminance: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
