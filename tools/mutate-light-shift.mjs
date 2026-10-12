#!/usr/bin/env node
/**
 * mutate-light-shift — can verify-light-shift fail?
 *
 * NEW at 3.490.0.
 *
 * A3 IS THE EDGE NOBODY WOULD HAVE TESTED. "To a minimum of 2" read as a
 * clamp in both directions BRIGHTENS Abyssal Darkness — a darkness spell
 * that makes a room lighter. It only shows on scenes already darker than
 * the floor, which is exactly where a darkness spell gets cast.
 *
 * N1 IS THE ONE-OPERATOR DEFECT. `??` in place of `=== undefined`
 * collapses "no anchor" into "the caster", so every dropped cloak snaps
 * back to the person who dropped it on the next refresh. Silent, and
 * only visible in play.
 *
 * O3 IS THE ORDERING, WHICH IS THE SPELL. Applied before light sources
 * instead of after, a lantern carried into the shadow lights it back up
 * and Umbral Veil buys nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const L = path.join(SYSTEM_ROOT, "module", "light.mjs");
const LW = path.join(SYSTEM_ROOT, "module", "light-workflow.mjs");
const EM = path.join(SYSTEM_ROOT, "module", "magic", "emanation-workflow.mjs");
const S = path.join(SYSTEM_ROOT, "module", "magic", "light-shift.mjs");
const WF = path.join(SYSTEM_ROOT, "module", "magic", "light-shift-workflow.mjs");
const SE = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-light-shift.mjs");

const MUTATIONS = [
  /* ── A: the arithmetic ─────────────────────────────────────────── */
  {
    file: L,
    name: "A1 THE EDGE: the floor clamps upward as well as down",
    from: "  if (clamped <= limit) return clamped;",
    to: "",
    breaks: "A3 — a darkness spell would BRIGHTEN Abyssal Darkness to its own minimum"
  },
  {
    file: L,
    name: "A2 the floor is ignored entirely",
    from: "  return Math.max(limit, clamped + Math.ceil(n));",
    to: "  return Math.max(1, clamped + Math.ceil(n));",
    breaks: "A2 — Umbral Veil would drag Dim Light to Abyssal Darkness"
  },
  {
    file: L,
    name: "A3 a raise is given the floor as a ceiling",
    // RE-ANCHORED AT 3.622.0: a raise now stops at its own cap (block 39's R9).
    from: "    const top = Math.min(10, Math.max(1, Math.floor(Number(cap) || 10)));",
    to: "    const top = Math.min(10, Math.max(1, Math.floor(Number(floor) || 1)));",
    breaks: "A5c — a spell that raises has no printed maximum"
  },
  {
    file: L,
    name: "A4 the shift borrows the special-sense cap",
    from: "    const top = Math.min(10, Math.max(1, Math.floor(Number(cap) || 10)));",
    to: "    const top = SPECIAL_SENSE_LIGHT_CAP;",
    breaks: "A7b — that cap belongs to darkvision, not to a spell"
  },

  /* ── D: the declared row ───────────────────────────────────────── */
  {
    file: S,
    name: "D1 a shift of zero is accepted",
    from: "  if (steps === 0) return null;",
    to: "  if (steps === null) return null;",
    breaks: "D2 — a circle that changes nothing looks like a broken one"
  },
  {
    file: S,
    name: "D2 dropping becomes the default rather than opt-in",
    from: "    droppable: raw.droppable === true",
    to: "    droppable: raw.droppable !== false",
    breaks: "D5b — only Umbral Veil prints a decoy"
  },
  {
    file: S,
    name: "D3 the floor defaults to Umbral Veil's number instead of the scale's",
    from: "    floor: Math.min(10, Math.max(1, int(raw.floor) || 1)),",
    to: "    floor: Math.min(10, Math.max(1, int(raw.floor) || 2)),",
    breaks: "D5 — one spell's printed minimum is not the general case"
  },

  /* ── O: the ordering ───────────────────────────────────────────── */
  {
    file: LW,
    name: "O1 THE ORDERING: the shift is applied before light sources",
    from: "  const withSources = resolveLightLevelWithSources(ambient, tokenDocument, scene);",
    to: "  const withSources = resolveLightLevelWithSources(\n    shiftLightLevel(ambient, regionLightShifts(tokenDocument?.regions)[0]?.steps ?? 0,\n      regionLightShifts(tokenDocument?.regions)[0]?.floor ?? 1),\n    tokenDocument, scene);",
    breaks: "O3 — a lantern carried into the shadow would light it back up"
  },
  {
    file: LW,
    name: "O2 only the first overlapping circle counts",
    from: "  for (const shift of shifts) level = shiftLightLevel(level, shift.steps, shift.floor, shift.cap);",
    to: "  level = shiftLightLevel(level, shifts[0].steps, shifts[0].floor, shifts[0].cap);",
    breaks: "O2 — the second globe of Darkness would be free"
  },
  {
    file: LW,
    name: "O3 the shift reads the absolute level flag instead of its own",
    from: '    .map((r) => r?.getFlag?.(SYSTEM_ID, "lightShift"))',
    to: '    .map((r) => r?.getFlag?.(SYSTEM_ID, "lightLevel"))',
    breaks: "O1 — a shift is not an absolute level"
  },

  /* ── N: the anchor ─────────────────────────────────────────────── */
  {
    file: EM,
    name: "N1 THE ONE-OPERATOR DEFECT: `??` collapses null into the caster",
    from: "  const anchorToken = emanation.anchorTokenId === undefined\n    ? token\n    : emanation.anchorTokenId === null\n      ? null\n      : (canvas?.tokens?.get(emanation.anchorTokenId) ?? null);",
    to: "  const anchorToken = emanation.anchorTokenId\n    ? (canvas?.tokens?.get(emanation.anchorTokenId) ?? null)\n    : token;",
    breaks: "N1 — every dropped cloak snaps back to the caster on the next refresh"
  },
  {
    file: EM,
    name: "N2 the circle is drawn on the caster whatever its anchor says",
    from: "  if (region && anchorToken) {\n    const centre = tokenCentre(anchorToken.document);",
    to: "  if (region) {\n    const centre = tokenCentre(token.document);",
    breaks: "N1b — a dropped cloak would follow the caster around the map"
  },
  {
    file: EM,
    name: "N3 membership is measured from the caster, not the anchor",
    from: "  const centreFeet = anchorToken\n    ? tokenCentreFeet(anchorToken.document)\n    : regionCentreFeet(region);",
    to: "  const centreFeet = tokenCentreFeet(token.document);",
    breaks: "N2 — the circle would affect one set of creatures and draw another"
  },
  {
    file: EM,
    name: "N4 a vanished circle falls back to catching everyone near the caster",
    from: "  const inside = centreFeet ? emanationMembers({",
    to: "  const inside = true ? emanationMembers({",
    breaks: "N2c — a circle that is not there catches nobody"
  },

  /* ── W: is it reached ──────────────────────────────────────────── */
  {
    file: SE,
    name: "W1 the effect kind stops being handled",
    from: '        case "lightShift": {',
    to: '        case "lightShiftDisabled": {',
    breaks: "W1 — the spell falls through to the unhandled-kind branch"
  },
  {
    file: SE,
    name: "W2 a circle that could not be drawn fails silently",
    from: '            lines.push(line(`<em>${spell.name} could not draw its circle on this scene — `\n              + "a GM may need to place it by hand.</em>"));',
    to: "",
    breaks: "W2 — this spell's entire effect is the circle"
  },
  {
    file: WF,
    name: "W3 the region is anchored to the caster instead of the target",
    from: "          [LIGHT_SHIFT_ANCHOR_FLAG]: spec.follows ? (token?.id ?? null) : null,",
    to: "          [LIGHT_SHIFT_ANCHOR_FLAG]: undefined,",
    breaks: "W4 — Umbral Veil would follow the caster, not the willing creature"
  },
  {
    file: WF,
    name: "W4 a creature-centred circle is drawn with no creature",
    from: "    if (spec.follows && !token) return null;",
    to: "    if (false) return null;",
    breaks: "W5 — it would dim an empty corner of the scene and look like it worked"
  },

  /* ── R: the drop ───────────────────────────────────────────────── */
  {
    file: WF,
    name: "R1 dropping the cloak ends the spell",
    from: "  for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);",
    to: "  for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);\n  await canvas.scene.deleteEmbeddedDocuments(\"Region\", held.map((r) => r.id));",
    breaks: "W6b — the book says it keeps dimming for the remaining duration"
  },
  {
    name: "R2 any circle can be dropped, decoy or not",
    file: S,
    from: "      && flags[LIGHT_SHIFT_DROPPABLE_FLAG] === true && Boolean(flags[LIGHT_SHIFT_ANCHOR_FLAG]);",
    to: "      && Boolean(flags[LIGHT_SHIFT_ANCHOR_FLAG]);",
    breaks: "W6c — Bless does not print a decoy"
  },
  {
    name: "R3 a circle already on the floor is dropped again",
    file: S,
    from: "      && flags[LIGHT_SHIFT_DROPPABLE_FLAG] === true && Boolean(flags[LIGHT_SHIFT_ANCHOR_FLAG]);",
    to: "      && flags[LIGHT_SHIFT_DROPPABLE_FLAG] === true;",
    breaks: "W6d — a second card for a thing that did not happen"
  },

  /* ── B: the button ─────────────────────────────────────────────── */
  {
    file: path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs"),
    name: "B1 the drop button is wired to Dismiss instead",
    from: "    const { dropLightShift } = await import(\"../magic/light-shift-workflow.mjs\");\n    const said = await dropLightShift(this.actor, target?.dataset?.spellId);",
    to: "    const { dismissSpellAction } = await import(\"../magic/dismiss-workflow.mjs\");\n    const said = await dismissSpellAction(this.actor, { spellId: target?.dataset?.spellId });",
    breaks: "B1b/B2 — the discarded cloak keeps dimming for the remaining duration"
  },
  {
    file: path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs"),
    name: "B2 canDrop ignores whether it has already been dropped",
    from: "      canDrop: lightShiftCanDrop(entry.id),",
    to: "      canDrop: true,",
    breaks: "B3b — a cloak already on the floor would still offer the button"
  },
  {
    file: path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs"),
    name: "B3 the button is offered for every running spell",
    from: "{{#if spell.canDrop}}<button type=\"button\" data-action=\"dropSpell\"",
    to: "{{#if spell.id}}<button type=\"button\" data-action=\"dropSpell\"",
    breaks: "B3 — Bless would offer to be put down"
  },
  /* ── G: the registration gate, found by driving it ─────────────── */
  {
    file: path.join(SYSTEM_ROOT, "module", "magic", "emanation.mjs"),
    name: "G1 THE SHIPPED DEFECT: the gate goes back to reading only the printed area",
    from: "  if (effects.some((e) => SELF_DRAWN_EMANATION_KINDS.includes(String(e?.kind ?? \"\")))) return true;",
    to: "",
    breaks: "G1/G3 — Umbral Veil is never registered, so its circle never follows anybody"
  },
  {
    file: path.join(SYSTEM_ROOT, "module", "magic", "emanation.mjs"),
    name: "G2 the widening swallows every spell",
    from: "const SELF_DRAWN_EMANATION_KINDS = Object.freeze([\"lightShift\"]);",
    to: "const SELF_DRAWN_EMANATION_KINDS = Object.freeze([\"lightShift\", \"condition\"]);",
    breaks: "G1c — a condition row would make every save spell a live emanation"
  },
  {
    file: path.join(SYSTEM_ROOT, "module", "magic", "emanation-workflow.mjs"),
    name: "G3 recordEmanation goes back to failing silently",
    from: "  if (!entry) {\n    console.error(",
    to: "  if (!entry) { return null; }\n  if (false) {\n    console.error(",
    breaks: "G4 — the line that hid this defect for Aura Of Vitality and again for Umbral Veil"
  },

  /* ── C: the card ───────────────────────────────────────────────── */
  {
    file: WF,
    name: "C3 THE NAMING BUG: the drop reports the caster again",
    from: "  return lightShiftDroppedLine(name || \"The shadows\", wearer ?? actor.name);",
    to: "  return lightShiftDroppedLine(name || \"The shadows\", actor.name);",
    breaks: "C4 — the book gives the action to the TARGET, who wears the cloak"
  },
  {
    file: WF,
    name: "C4 the wearer is read after the anchor is cleared",
    from: "  const anchor = held[0].getFlag?.(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG) ?? null;\n  const wearer = anchor ? (canvas?.tokens?.get(anchor)?.name ?? null) : null;\n\n  // IT DOES NOT END THE SPELL: one field changes, and the Region, its clock\n  // and the registry entry all carry on.\n  for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);",
    to: "  for (const region of held) await region.setFlag(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG, null);\n  const anchor = held[0].getFlag?.(SYSTEM_ID, LIGHT_SHIFT_ANCHOR_FLAG) ?? null;\n  const wearer = anchor ? (canvas?.tokens?.get(anchor)?.name ?? null) : null;",
    breaks: "C4b — always null by then, so it silently falls back to the caster"
  },
  {
    file: S,
    name: "C1 the card stops naming the floor",
    from: '  const limit = spec.steps < 0 ? ` (to a minimum of ${spec.floor})` : "";',
    to: '  const limit = "";',
    breaks: "C1 — the minimum is why the shadow stops where it does"
  },
  {
    file: S,
    name: "C2 the decoy is never offered",
    from: "  if (!spec.droppable) return null;",
    to: "  if (spec.droppable) return null;",
    breaks: "C2 — the target cannot spend AP on an option nobody told them about"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const AS = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const HB = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "emanation.mjs");
const guard = guardFiles([L, LW, EM, S, WF, SE, AS, HB, E, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-light-shift: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-light-shift: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-light-shift: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
