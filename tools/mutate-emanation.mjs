#!/usr/bin/env node
/**
 * mutate-emanation — can verify-emanation fail?
 *
 * NEW at 3.426.0. SURVIVED and an unmatched anchor are both failures.
 *
 * #1 AND #2 ARE THE SHIPPED DEFECT, in its two halves: the circle that
 * stayed where it was cast, and the membership list drawn up once.
 * #3 RESTORES THE INERT WARP — 2 PP for a behaviour that was already
 * free, which is how the rule came to be backwards in the first place.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const RULE = path.join(SYSTEM_ROOT, "module", "magic", "emanation.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "emanation-workflow.mjs");
const EFFECTS = path.join(SYSTEM_ROOT, "module", "magic", "emanation-effects.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const BOOT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const AS = path.join(SYSTEM_ROOT, "module", "magic", "active-spells.mjs");
const SAVEFLOW = path.join(SYSTEM_ROOT, "module", "magic", "emanation-save-workflow.mjs");
const CONDITIONS = path.join(SYSTEM_ROOT, "module", "combat", "conditions-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-emanation.mjs");

const MUTATIONS = [
  {
    file: path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"),
    name: "E2d THE SECOND HALF: a live emanation is not registered as an active spell",
    // THE LIMB MOVED (3.528.0) into `castWillRegister`, where the effect
    // stamp and the registration now read one answer. Same clause, new
    // home; the anchor still carries no part of a growing list's end.
    file: AS,
    from: "    || Boolean(emanationLive)",
    to: "",
    breaks: "E2b/E2d — recordEmanation writes onto a registry entry and returns null without one"
  },

  {
    file: path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs"),
    name: "E2c THE LATENT DEFECT: the emanation record goes back inside the lock guard",
    from: "      if (warpedSustained) lines.push(line(`<em>Sustained — active in your Spellcasting panel; Sustain it each turn to maintain it.</em>`));",
    to: "      if (warpedSustained) lines.push(line(`<em>Sustained — active in your Spellcasting panel; Sustain it each turn to maintain it.</em>`));\n      if (false) { await recordEmanation(actor, castId, {}); }",
    breaks: "E2c — a non-sustained live emanation would record nothing"
  },

  {
    // SHIPPED HALF ONE: the circle stays where it was cast.
    file: FLOW,
    name: "THE SHIPPED DEFECT 1: the Region stops following the caster",
    from: "  const region = canvas.scene?.regions?.get(emanation.regionId) ?? null;",
    to: "  const region = null;",
    breaks: "F1 — the cleric walks away and the circle stays behind"
  },
  {
    // SHIPPED HALF TWO: membership drawn up once.
    file: FLOW,
    name: "THE SHIPPED DEFECT 2: nothing is swept when a token moves",
    from: "    await refreshAllEmanations();\n  });\n\n  // A token arriving or leaving changes the same question.",
    to: "    return;\n  });\n\n  // A token arriving or leaving changes the same question.",
    breaks: "F4 — the blessed fighter walks out and keeps the bonus"
  },
  {
    // THE DEFECT DRIVING 3.426.1 FOUND: the aggregator drops any mod key
    // it does not name, so the warp was offered, charged for, and inert.
    file: WARP,
    name: "THE LIVE DEFECT: the aggregator drops the freeze mod key",
    from: "    if (m.freezeMembership) mods.freezeMembership = true;",
    to: "",
    breaks: "E2b/E2c — 2 PP buys a card line and nothing else"
  },
  {
    // THE INERT WARP, restored: 2 PP for what everyone had for free.
    file: RULE,
    name: "THE INERT WARP: freezing costs 2 PP and changes nothing",
    from: "  return Boolean(warpMods?.freezeMembership);",
    to: "  return true;",
    breaks: "D1/D2 — every emanation frozen, so the warp buys what you already had"
  },
  {
    file: RULE,
    name: "the frozen warp is never honoured",
    from: "  return Boolean(warpMods?.freezeMembership);",
    to: "  return false;",
    breaks: "D2 — a caster pays 2 PP and their targets still lose it on walking out"
  },
  {
    file: RULE,
    name: "a condition travels with the area",
    // RE-ANCHORED at 3.435.1 when `perTurn` joined the list, and again
    // at 3.586.0 when `antimagic` did. The mutation is unchanged in
    // intent both times: adding `condition` is still the edit that would
    // make walking back into Song Of Despair re-frighten you.
    // RE-ANCHORED AT 3.608.0, when `zone` joined for Solid Fog.
    // RE-ANCHORED 3.609.0: the list gained "turnSave" (Turn Undead).
    // RE-ANCHORED 3.612.0: the list gained "heldBonus" (Inspire Heroics).
    // RE-ANCHORED 3.613.0: the list gained "defence" (Protector's Sphere).
    from: 'Object.freeze(["bonus", "perTurn", "antimagic", "zone", "turnSave", "heldBonus", "defence", "damageHeal"]);',
    to: 'Object.freeze(["bonus", "perTurn", "antimagic", "zone", "turnSave", "heldBonus", "defence", "damageHeal", "condition"]);',
    breaks: "A5/A6/E3 — walking back into Song Of Despair re-frightens you"
  },
  {
    file: RULE,
    name: "the caster is excluded from their own emanation",
    from: "  return (Array.isArray(subjects) ? subjects : [])\n    .filter((s) => s?.centreFeet && withinFeet(centreFeet, s.centreFeet, reach))",
    to: "  return (Array.isArray(subjects) ? subjects : [])\n    .filter((s) => s.id !== \"caster\")\n    .filter((s) => s?.centreFeet && withinFeet(centreFeet, s.centreFeet, reach))",
    breaks: "B4 — Bless reads 'You and your allies'"
  },
  {
    file: RULE,
    name: "the boundary becomes exclusive",
    from: "  return Math.hypot(dx, dy) <= Number(reachFeet) + 1e-6;",
    to: "  return Math.hypot(dx, dy) < Number(reachFeet) - 1e-6;",
    breaks: "B5 — 'within 30 feet' stops including thirty"
  },
  {
    file: RULE,
    name: "distance is measured per-axis rather than diagonally",
    from: "  return Math.hypot(dx, dy) <= Number(reachFeet) + 1e-6;",
    to: "  return Math.max(Math.abs(dx), Math.abs(dy)) <= Number(reachFeet) + 1e-6;",
    breaks: "B7 — a creature 35 feet away corner-to-corner is caught by a 30-foot circle"
  },
  {
    file: RULE,
    name: "the disposition filter is dropped",
    from: "    .filter((s) => keepByMode(s.disposition, casterDisposition, mode))",
    to: "",
    breaks: "B3 — an allies-only emanation blesses the enemy"
  },
  {
    file: RULE,
    name: "the duplicated disposition rule drifts from the original",
    from: '  if (mode === "allies") return t === c;',
    to: "  if (mode === \"allies\") return t >= c;",
    breaks: "B9 — the copy and the original stop agreeing"
  },
  {
    // RE-ENTRY. Remembering who left is what would break Graham's ruling.
    file: RULE,
    name: "leaving is remembered, so re-entry earns nothing",
    from: "    add: [...now].filter((id) => !has.has(id)),",
    to: "    add: [],",
    breaks: "C1/C4 — the bonus never resumes, and never applies at all"
  },
  {
    file: RULE,
    name: "walking out no longer lifts the bonus",
    from: "    remove: [...has].filter((id) => !now.has(id))",
    to: "    remove: []",
    breaks: "C2 — the whole of Graham's report, restored"
  },
  {
    file: FLOW,
    name: "a frozen emanation is swept anyway",
    from: "      if (!em || em.frozen) continue;",
    to: "      if (!em) continue;",
    breaks: "D3 — the caster paid for the list to stand and it does not"
  },
  {
    file: FLOW,
    name: "the region is moved from the animating position",
    // RE-ANCHORED AT 3.490.0, when the circle gained an anchor. The
    // mutation is unchanged in substance — read the raw x/y instead of
    // the committed centre — only the variable it reads them from moved.
    from: "    const centre = tokenCentre(anchorToken.document);",
    to: "    const centre = { x: anchorToken.document.x, y: anchorToken.document.y };",
    breaks: "F2 — mid-animation that reports where the token WAS"
  },
  {
    file: FLOW,
    name: "the circle is drawn on the caster rather than on its anchor",
    from: "    const centre = tokenCentre(anchorToken.document);",
    to: "    const centre = tokenCentre(token.document);",
    breaks: "F2b — Umbral Veil would follow its caster, not the willing creature"
  },
  {
    file: FLOW,
    name: "the refresh stops being serialised",
    from: "  return serialiseByKey(`emanation:${record?.entry?.id}`, () => refreshEmanationNow(record));",
    to: "  return refreshEmanationNow(record);",
    breaks: "F3 — two moves together each read the old scene"
  },
  {
    file: FLOW,
    name: "the hooks guard on isGM rather than the acting GM",
    from: "    if (!isActingGM()) return;\n    if (changed?.x === undefined",
    to: "    if (!game.user?.isGM) return;\n    if (changed?.x === undefined",
    breaks: "F5 — two GMs reconcile twice and race each other"
  },
  {
    file: BOOT,
    name: "the hooks are never registered",
    from: "  registerEmanations();",
    to: "",
    breaks: "F6 — every piece exists and nothing runs"
  },
  {
    file: CAST,
    name: "the cast stops recording the emanation",
    from: "    if (emanationIsLive(spellData) && placedArea?.regionId) {",
    to: "      if (false) {",
    breaks: "F7 — nothing to follow, because nothing was written down"
  },
  {
    file: CAST,
    name: "the frozen warp is not recorded on the cast",
    from: "        frozen: membershipFrozen(warpMods)",
    to: "          frozen: false",
    breaks: "F8 — the 2 PP is spent and the record does not know"
  },
  {
    file: EFFECTS,
    name: "a second copy of the bonus is stacked on every move",
    // RE-ANCHORED AT 3.586.0. The early return became
    // `{ effect: null, line: "" }` when an antimagic field gave this
    // function something to SAY as well as something to place, and one
    // return shape for every path was safer than two. The claim is
    // unchanged: the guard is what stops a second copy.
    from: '  if (held) return { effect: null, line: "" };',
    to: '  if (false) return { effect: null, line: "" };',
    breaks: "G7 — standing still doubles your bonus once per footstep"
  },
  {
    file: EFFECTS,
    name: "removal takes every effect of the cast, not just the emanation's",
    from: '    .filter((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId\n      && e.getFlag?.(SYSTEM_ID, "emanation"))',
    to: '    .filter((e) => e.getFlag?.(SYSTEM_ID, "castId") === castId)',
    breaks: "G8 — walking out strips effects the spell placed for its duration"
  },
  {
    // THE DEFECT DRIVING 3.426.0 FOUND: the creatures caught at the cast
    // were held by an owner that could never let go.
    file: FLOW,
    name: "THE LIVE DEFECT: the cast's own effects are never adopted",
    from: "    const { adoptCastEffects } = await import(\"./emanation-effects.mjs\");\n    await adoptCastEffects(castId);",
    to: "",
    breaks: "G11 — walking out does nothing for anyone blessed at the cast"
  },
  {
    file: EFFECTS,
    name: "adoption re-creates the effect instead of stamping it",
    from: "    await actor.updateEmbeddedDocuments(\"ActiveEffect\", mine.map((e) => ({\n      _id: e.id, [`flags.${SYSTEM_ID}.emanation`]: true\n    })));",
    to: "    await actor.deleteEmbeddedDocuments(\"ActiveEffect\", mine.map((e) => e.id));",
    breaks: "G9/G10 — the bonus flashes off and on, and anything else on it is lost"
  },
  {
    file: FLOW,
    name: "a frozen emanation adopts the cast's effects anyway",
    // Re-anchored 3.609.1: the guard also reads `reconcile` (F3).
    from: "  if (!descriptor?.frozen && reconcile) {",
    to: "  if (reconcile) {",
    breaks: "G11 — the caster paid for the list to stand and it is swept regardless"
  },
  /* ---------------- THE SAVE-GATED HALF (3.428.0) ---------------- */
  {
    // THE STATE 3.426.0 SHIPPED IN: a save disqualified a spell outright,
    // so Bane's printed "as long as they remain within 30 feet" was
    // implemented as "for the duration, wherever you go".
    file: RULE,
    name: "THE OLD LINE: a saving throw disqualifies an emanation again",
    from: '  if (!/emanation/i.test(String(spellData?.area ?? ""))) return false;',
    to: '  if (!/emanation/i.test(String(spellData?.area ?? ""))) return false;\n'
      + '  if (String(spellData?.defence ?? "").trim()) return false;',
    breaks: "A3/E3 — Bane stops being live and its own outcome text goes unimplemented"
  },
  {
    // THE RE-ENTRY RULING, undone: everyone owes a save on every step.
    file: RULE,
    name: "a creature is asked to save again every time it is inside",
    from: "  return (Array.isArray(inside) ? inside : []).filter((id) => !(id in seen));",
    to: "  return Array.isArray(inside) ? inside : [];",
    breaks: "H2/H3 — one step out and back in re-rolls a save the book rolls once"
  },
  {
    file: RULE,
    name: "a creature that passed is asked again",
    from: "  const seen = tested ?? {};",
    to: "  const seen = Object.fromEntries(Object.entries(tested ?? {})\n"
      + "    .filter(([, d]) => d !== \"success\"));",
    breaks: "H3 — passing the save buys one step of relief and another roll"
  },
  {
    file: RULE,
    name: "an untested creature is penalised anyway",
    from: "  if (!degree) return [];",
    to: "  if (!degree) return gated;",
    breaks: "H9 — a gated effect with no recorded degree defaults to applying"
  },
  {
    file: RULE,
    name: "the degree ladder is ignored and the first row always applies",
    from: "  return gated.filter((e) => e.onSave.map(String).includes(String(at)));",
    to: "  return gated.slice(0, 1);",
    breaks: "H6/H8/E5 — a fumble takes -1 and a success takes -1 as well"
  },
  {
    file: RULE,
    name: "an ungated list is filtered as though it were gated",
    from: "  if (!gated.length) return rows;",
    to: "  if (!gated.length) return [];",
    breaks: "H10/A1 — Bless stops applying to anybody"
  },
  {
    file: SAVEFLOW,
    name: "an unrecorded DC quietly passes everyone",
    from: '  const degree = check.outcome?.degree?.key ?? "failure";',
    to: '  const degree = check.outcome?.degree?.key ?? "success";',
    breaks: "H13 — a missing DC becomes a silent protection"
  },
  {
    file: SAVEFLOW,
    name: "the save is rolled against a freshly computed DC",
    from: "  const dc = Number(emanation?.saveDC);",
    to: "  const dc = Number(emanation?.dc);",
    breaks: "H12 — a caster since weakened makes their standing Bane easier to resist"
  },
  {
    file: FLOW,
    name: "the rolled degree is never written back",
    // Re-anchored 3.609.1 (F3).
    from: "      await recordEmanation(actor, entry.id, { ...emanation, tested }, { reconcile: false });",
    to: "",
    breaks: "H15 — the save is rolled again on the creature's next step, for ever"
  },
  {
    file: FLOW,
    name: "the recorded degree does not reach the effect",
    from: "        t.actor, entry.id, emanation, actor, emanation.tested?.[id] ?? null);",
    to: "        t.actor, entry.id, emanation, actor, null);",
    breaks: "H16 — a creature that failed carries nothing on the way back in"
  },
  {
    file: FLOW,
    name: "the tested record is dropped on a re-record",
    from: "  entry.emanation = { tested: entry.emanation?.tested ?? {}, ...descriptor };",
    to: "  entry.emanation = descriptor;",
    breaks: "H17 — every creature owes a fresh save on its next step"
  },
  {
    // THE DEFECT DRIVING 3.428.0 FOUND: the map was written only by the
    // entry save, so the creatures the cast landed on had no record.
    file: CAST,
    name: "THE LIVE DEFECT: the cast does not seed the tested record",
    from: "        tested: castSaveDegrees(spellSave),",
    to: "",
    breaks: "H19 — everyone caught at the cast re-rolls on their first step"
  },
  {
    file: CAST,
    name: "the tested record is keyed by actor rather than token",
    from: "    const token = (canvas?.tokens?.placeables ?? []).find((t) => t.actor === result.target);\n    if (token && result.degree) out[token.id] = result.degree;",
    to: "    if (result.degree) out[result.target?.id] = result.degree;",
    breaks: "H20 — membership is keyed by token, so no entry ever matches"
  },
  {
    file: CAST,
    name: "a creature that saved is left out of the record",
    from: "  for (const result of spellSave?.results ?? []) {",
    to: "  for (const result of spellSave?.results ?? []) {\n    if (result.saved) continue;",
    breaks: "H21 — passing the save buys one step of relief and another roll"
  },
  /* ---------------- THE FLOOR (3.429.0) ---------------- */
  {
    // THE HALF THAT MAKES "CANNOT REDUCE" TRUE. Applying it on movement
    // alone is decorative: a creature standing still could recover past
    // it and stay there until the next footstep.
    file: CONDITIONS,
    name: "THE DECORATIVE HALF: recovery stops asking for the floor",
    from: '  const floor = conditionFloorFor(actor, "frightened");',
    to: "  const floor = 0;",
    breaks: "I10 — a creature standing still recovers past a floor the spell forbids"
  },
  {
    file: CONDITIONS,
    name: "the recovery result is not clamped to the floor",
    from: "  const next = Math.max(0, Math.max(current + delta, floor));",
    to: "  const next = Math.max(0, current + delta);",
    breaks: "I11 — the floor is read and then ignored"
  },
  {
    file: CONDITIONS,
    name: "a recovery held by the floor says nothing",
    from: "  if (floor && next === floor && current + delta < floor) {",
    to: "  if (false) {",
    breaks: "I12 — a save that succeeds and changes nothing reads as a broken system"
  },
  {
    // RAISES, NEVER LOWERS. The inversion CURES fear by walking into it.
    file: RULE,
    name: "the floor lowers a higher value instead of raising a lower one",
    from: "  return Math.max(Math.trunc(Number(proposed) || 0), Math.max(0, Math.trunc(Number(floor) || 0)));",
    to: "  return Math.max(0, Math.trunc(Number(floor) || 0));",
    breaks: "I8 — a creature frightened 3 is CURED to 1 by walking into the cause"
  },
  {
    file: RULE,
    name: "every condition effect becomes a floor",
    from: "    if (!effect.floor) continue;",
    to: "    if (false) continue;",
    breaks: "I2 — every conditioning spell in the pack silently gains a minimum"
  },
  {
    file: RULE,
    name: "a spell carrying only a floor stops counting as live",
    from: "  if (Object.keys(emanationFloors(effects)).length) return true;",
    to: "",
    breaks: "I4/E3 — Song Of Despair excluded again, for the wrong reason a second time"
  },
  {
    file: FLOW,
    name: "entering no longer raises the condition to the floor",
    from: "  for (const [condition, floor] of Object.entries(emanation.floors ?? {})) {",
    to: "  for (const [condition, floor] of Object.entries({})) {",
    breaks: "I14 — walking in does nothing at all"
  },
  {
    file: CAST,
    name: "the cast does not record the floors",
    from: "        floors: emanationFloors(spellData.effects),",
    to: "",
    breaks: "I16 — nothing to enforce, because nothing was written down"
  },
  {
    // THE PRE-EXISTING WORDING DEFECT the floor made visible.
    file: CONDITIONS,
    name: "the card reports the offered reduction rather than the real one",
    from: "  const moved = next - current;",
    to: "  const moved = delta;",
    breaks: "I12b — \"Held at 1\" followed by \"reduces by 3, to 1\" on one card"
  },
  {
    file: EFFECTS,
    // RE-ANCHORED AT 3.446.0. The guard grew two more clauses when
    // conditional auras arrived — an aura that grants ONLY a conditional
    // bonus has no `changes` and must still be placed — so the old
    // three-word anchor went ANCHOR MISSING and stopped running. The
    // claim is unchanged: nothing placeable still places nothing.
    name: "an emanation with nothing placeable still creates an effect",
    // RE-ANCHORED AT 3.446.0 and again at 3.586.0: the guard grew a
    // fourth clause when an antimagic field became the third kind of
    // aura that places a marker rather than a number. The claim is
    // unchanged: nothing placeable still places nothing.
    // RE-ANCHORED 3.612.0: and a fifth, a held bonus (Inspire Heroics).
    from: "  if (!changes.length && !defenceDC.length && !opposedAttack.length && !antimagic && !held && !damageHeal) return null;",
    to: "  if (false) return null;",
    breaks: "G6 — an empty changes array looks applied and does nothing"
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

const guard = guardFiles([RULE, FLOW, EFFECTS, CAST, BOOT, WARP, SAVEFLOW, CONDITIONS, CHECK, AS]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-emanation: verify already fails on an unmodified tree.\n");
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
    ? `\nmutate-emanation: FAILED — ${bad.length} of ${results.length} not caught.\n`
    : `\nmutate-emanation: OK — all ${results.length} mutations caught, tree restored.\n`
);
process.exit(bad.length ? 1 : 0);
