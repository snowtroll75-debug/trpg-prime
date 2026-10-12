#!/usr/bin/env node
/**
 * verify-runemage — does the Symbol component exist?
 *
 * NEW at 3.546.0, beside the rule.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS WRONG.
 *
 * Graham, 10 Sep 2026: "Runemage — this feat is not working properly.
 * All non-somatic components should be bypassed."
 *
 * Only the ARITHMETIC was ever built. The -1 casting DC, the +1 save DC
 * and the +2 defensive clause all worked and were covered. The sentence
 * those three bullets hang off — "you replace all non-somatic components
 * with a new component called Symbol" — was implemented nowhere.
 *
 * MEASURED BEFORE THE REPAIR: `componentGate` returned the identical
 * answer for a Runemage and for a caster with no feats at all, on every
 * combination of components. 647 of the 692 spells in the pack carry at
 * least one non-somatic component.
 *
 * G1 IS THAT MEASUREMENT TURNED INTO A CHECK, and like the archetype
 * populations it compares whole answers rather than one case: the two
 * casters must now DISAGREE, and a gate that stopped gating for
 * everybody would fail it just as a gate that never started would.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  isRunemage, symbolComponents, needsFreeHandFor, focusSatisfiesHand,
  symbolRoomLine, componentWords, SYMBOL_COMPONENT, REPLACED_COMPONENTS
} from "../module/magic/runemage.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
function equal(label, actual, expected, why = "") {
  ok(label, actual === expected,
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${why ? ` (${why})` : ""}`);
}

/* THE GATE NEEDS A `ui`. Imported after the stub is in place, because the
 * module reaches for `ui.notifications.warn` when it refuses. */
const warned = [];
globalThis.ui = { notifications: { warn: (m) => warned.push(String(m)), error: () => {} } };
const { componentGate } = await import("../module/magic/component-gate.mjs");

async function readPack(name) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", name), { valueEncoding: "json" });
  await db.open();
  const out = [];
  for await (const [, v] of db.iterator()) if (v?.name) out.push(v);
  await db.close();
  return out;
}

/** A two-handed weapon leaves no hand free; anything else does. */
const GREATSWORD = { type: "weapon", name: "Greatsword",
  system: { equipped: true, size: "medium", traits: "Two-handed" } };

const caster = (featNames, held = [], magic = {}) => ({
  system: { identity: { size: "medium" }, magic },
  items: [...featNames.map((n) => ({ type: "feat", name: n })), ...held],
  effects: [],
  getFlag: () => null
});
const gate = (actor, components, opts) => {
  warned.length = 0;
  return componentGate(actor, { components }, "Test Spell", opts);
};

/* ── D: THE DETECTOR ──────────────────────────────────────────────── */

ok("D1 THE FEAT IS RECOGNISED BY NAME", isRunemage(["Runemage"]));
ok("D1b whatever its case and spacing", isRunemage(["  runemage "]));
/* D2 FIRST NAMED "Runemaster", AND THE MUTATION SURVIVED.
 *
 * "Runemaster" does not contain "runemage" — runema-STER against
 * runema-GE — so a substring matcher agreed with the real one and the
 * check proved nothing. The second time in three releases a
 * whole-word test has been asserted with a fixture that could not tell
 * the two apart; the Heritage trait needed "Heritageborn" for exactly
 * this reason. A name that CONTAINS the word is the only fixture that
 * separates them. */
ok("D2 AND NOTHING ELSE IS",
  !isRunemage(["Greater Runemage", "Runemagery", "Anti-Runemage", "Rune Magic", "Spell Adept"]),
  "matched whole and lower-cased, not by substring — a feat merely CONTAINING the word "
  + "must not switch the archetype on");
ok("D2b nor an empty sheet", !isRunemage([]) && !isRunemage(null));

/* ── R: THE REPLACEMENT ───────────────────────────────────────────── */

equal("R1 EVERY NON-SOMATIC COMPONENT BECOMES SYMBOL",
  JSON.stringify(symbolComponents({ verbal: true, material: true, focus: true }, true)),
  JSON.stringify({ verbal: false, material: false, focus: false, [SYMBOL_COMPONENT]: true }),
  "\"you replace ALL non-somatic components\" — verbal, material and focus are the three "
  + "the pack uses");

ok("R2 SOMATIC IS NOT REPLACED",
  symbolComponents({ somatic: true, verbal: true }, true).somatic === true,
  "the feat's own word is NON-somatic; the gestures stay");

ok("R3 A NON-RUNEMAGE IS UNTOUCHED",
  JSON.stringify(symbolComponents({ verbal: true, material: true }, false))
  === JSON.stringify({ verbal: true, material: true }),
  "without this, R1 passes on a function that rewrites everybody's spells");

ok("R4 A COMPONENTLESS SPELL GAINS NO SYMBOL",
  !symbolComponents({}, true)[SYMBOL_COMPONENT]
  && !symbolComponents({ somatic: true }, true)[SYMBOL_COMPONENT],
  "there is nothing to replace, so there is no rune to draw — an innate effect must not "
  + "be dragged into a free-hand requirement it never had");

equal("R5 THE REPLACED LIST IS THE THREE, AND SOMATIC IS NOT IN IT",
  JSON.stringify([...REPLACED_COMPONENTS].sort()),
  JSON.stringify(["focus", "material", "verbal"]));

/* ── G: THE GATE — THE DEFECT ITSELF ──────────────────────────────── */

const RUNEMAGE = caster(["Runemage"]);
const ORDINARY = caster([]);
const COMBOS = [
  { verbal: true }, { material: true }, { focus: true },
  { verbal: true, material: true }, { somatic: true }, {}
];

ok("G1 A RUNEMAGE AND AN ORDINARY CASTER NO LONGER ANSWER ALIKE",
  COMBOS.some((c) => gate(RUNEMAGE, c) !== gate(ORDINARY, c)),
  "measured before the repair: identical on all six. A feat whose headline clause changes "
  + "nothing is indistinguishable from a feat that is not implemented");

ok("G2 THE MATERIAL COMPONENT NO LONGER NEEDS A POUCH",
  gate(RUNEMAGE, { material: true }) === true,
  "118 spells in the pack carry one, and a Runemage provides none of them");

ok("G2b WHILE AN ORDINARY CASTER STILL NEEDS ONE",
  gate(ORDINARY, { material: true }) === false,
  "WITHOUT THIS, G2 passes on a gate that has stopped checking pouches for everyone");

ok("G3 A RUNEMAGE WITH BOTH HANDS FULL CASTS NOTHING",
  gate(caster(["Runemage"], [GREATSWORD]), { verbal: true }) === false,
  "Graham's ruling: Symbol needs a free hand on EVERY spell, because the rune has to be "
  + "drawn. Before the repair a verbal-only spell went through with both hands occupied");

ok("G3b AND THE CARD SAYS IT IS THE SYMBOL, NOT A SOMATIC COMPONENT",
  /Symbol component/.test(warned[0] ?? ""),
  `warned: ${JSON.stringify(warned[0] ?? null)} — a verbal-only spell refused for "a `
  + "somatic component\" would read as a bug");

ok("G3c BUT AN ORDINARY CASTER STILL CASTS A VERBAL SPELL ONE-HANDED",
  gate(caster([], [GREATSWORD]), { verbal: true }) === true,
  "the free-hand rule must not leak onto everybody else");

ok("G3d AND A RUNEMAGE WITH A HAND FREE IS FINE",
  gate(RUNEMAGE, { verbal: true }) === true,
  "without this, G3 passes on a gate that refuses every Runemage cast");

ok("G3e A COMPONENTLESS SPELL NEEDS NO HAND EVEN FOR A RUNEMAGE",
  gate(caster(["Runemage"], [GREATSWORD]), {}) === true,
  "R4's consequence at the gate");

/* ── F: THE FOCUS, WHICH IS THE STRICT PART ───────────────────────── */

const HELD_FOCUS = { focusCasting: true, focusReady: true };

ok("F1 A CASTING FOCUS DOES NOT SATISFY THE SYMBOL",
  gate(caster(["Runemage"], [GREATSWORD], HELD_FOCUS), { verbal: true }) === false,
  "Graham's ruling, chosen deliberately over the reading where it does: the focus stands "
  + "in for gestures, not for drawing a rune. This is the one place Symbol is STRICTER "
  + "than the component it replaces");

ok("F1b WHILE IT STILL SATISFIES AN ORDINARY SOMATIC COMPONENT",
  gate(caster([], [GREATSWORD], HELD_FOCUS), { somatic: true }) === true,
  "WITHOUT THIS, F1 passes on a focus rule that has stopped working entirely — which "
  + "would be a silent nerf to every focus caster in the game");

ok("F2 THE PREDICATE SAYS SO DIRECTLY",
  !focusSatisfiesHand({ [SYMBOL_COMPONENT]: true })
  && focusSatisfiesHand({ somatic: true }));

ok("F3 AND THE HAND TEST READS BOTH COMPONENTS",
  needsFreeHandFor({ somatic: true }) && needsFreeHandFor({ [SYMBOL_COMPONENT]: true })
  && !needsFreeHandFor({ verbal: true }) && !needsFreeHandFor({}));

/* ── C: WHAT THE CARD SAYS ────────────────────────────────────────── */

equal("C1 THE CARD NAMES THE SYMBOL",
  componentWords(symbolComponents({ verbal: true, somatic: true, material: true }, true)).join(", "),
  "Somatic, Symbol",
  "a card still reading \"Verbal, Material\" is indistinguishable from the feat being "
  + "broken, which it was");

equal("C1b AND LEAVES AN ORDINARY CASTER'S ALONE",
  componentWords({ verbal: true, somatic: true, material: true }).join(", "),
  "Verbal, Somatic, Material");

ok("C2 THE ROOM-TO-DRAW LINE IS PRINTED, NOT ENFORCED",
  /room to draw the rune/i.test(symbolRoomLine({ [SYMBOL_COMPONENT]: true }) ?? ""),
  "nothing here knows whether the caster is in a grapple or a coffin; saying it out loud "
  + "is what stops an unimplemented rule looking like a working one");

equal("C2b AND ONLY WHEN THERE IS A SYMBOL", symbolRoomLine({ verbal: true }), null);

/* ── P: THE PACK THIS ALL ACTS ON ─────────────────────────────────── */

const spells = (await readPack("spells")).filter((s) => s.type === "spell");
const nonSomatic = spells.filter((s) => {
  const c = s.system?.components ?? {};
  return Object.entries(c).some(([k, v]) => v && k !== "somatic");
});
ok("P1 MOST SPELLS CARRY A NON-SOMATIC COMPONENT",
  nonSomatic.length > 500 && spells.length > 600,
  `${nonSomatic.length} of ${spells.length} — the size of what the feat's headline clause `
  + "was failing to touch. A collapse here would make the checks above vacuous");

const feat = (await readPack("feats")).find((f) => f.name === "Runemage");
ok("P2 THE FEAT IS STILL NAMED WHAT THE DETECTOR LOOKS FOR",
  isRunemage([feat?.name]),
  "the detector matches a literal; a rename in the pack would silently switch the feat off");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-runemage: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-runemage: OK — ${checks} checks. Non-somatic components become a `
  + `Symbol, the Symbol needs a hand, and a focus does not draw a rune.\n`);
