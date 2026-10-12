#!/usr/bin/env node
/**
 * mutate-spell-storing — can verify-spell-storing fail?
 *
 * NEW at 3.495.0.
 *
 * G1 IS THE SHIPPED DEFECT: the spell carried nothing at all, and both
 * warps carried `mods: {}`.
 *
 * S3 IS THE ONE A PLAYER WOULD FEEL. A Partial casts nothing and costs
 * nothing — so a stored spell that partialled and kept the caster's six
 * PP would be a tax the book never mentions, on the one spell whose
 * entire point is timing.
 *
 * B2 IS THE ONE THAT TAKES PAYMENT FOR NOTHING: refusing a wizard with
 * no bonded item AFTER the PP has left the pool.
 *
 * B4 IS THE DOUBLE RELEASE. The release runs dialogs; a record still in
 * the staff while its spell resolves can be released twice, which is the
 * shape Delayed Respite's packet clear was written against.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const P = path.join(SYSTEM_ROOT, "module", "magic", "spell-storing.mjs");
const FLOW = path.join(SYSTEM_ROOT, "module", "magic", "spell-storing-workflow.mjs");
const CAST = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const SE = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const WARP = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const SHEET = path.join(SYSTEM_ROOT, "module", "sheets", "actor-sheet.mjs");
const HBS = path.join(SYSTEM_ROOT, "templates", "actor", "actor-sheet.hbs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-spell-storing.mjs");

const MUTATIONS = [
  /* ── A: the action the release costs ───────────────────────────── */
  {
    file: P,
    name: "A1 REACTION BEATS FREE, so the dearer warp buys the worse action",
    from: '  if (m.storedReleaseFree) return "free";\n  if (m.storedReleaseReaction) return "reaction";',
    to: '  if (m.storedReleaseReaction) return "reaction";\n  if (m.storedReleaseFree) return "free";',
    breaks: "A4 — 8 PP would buy less than 4 PP did"
  },
  {
    file: P,
    name: "A2 the warps buy nothing again",
    from: '  const m = mods?.mods ?? mods ?? {};',
    to: '  const m = {};',
    breaks: "A2/A3 — the inert-warp shape this release exists to remove"
  },
  {
    file: WARP,
    name: "A3 the mod keys are dropped from the aggregate",
    from: "    storedReleaseReaction: false,\n    storedReleaseFree: false",
    to: "    storedReleaseUnused: false",
    breaks: "A6 — an undeclared mod is dropped between the chooser and the cast"
  },

  /* ── W: the one-round window ───────────────────────────────────── */
  {
    file: P,
    name: "W1 THE WINDOW NEVER CLOSES",
    from: "    return int(round) - int(armed.round) <= ARM_WINDOW_ROUNDS;",
    to: "    return true;",
    breaks: "W3 — every spell the caster ever casts would be stored"
  },
  {
    file: P,
    name: "W2 the window is widened past the printed one",
    from: "const ARM_WINDOW_ROUNDS = 1;",
    to: "const ARM_WINDOW_ROUNDS = 3;",
    breaks: "W1 — \"within one round\" is the spell's own sentence"
  },
  {
    file: P,
    name: "W3 the world clock stops measuring it out of combat",
    from: "  if (armed.worldTime != null && worldTime != null) {\n    return int(worldTime) - int(armed.worldTime) <= ARM_WINDOW_ROUNDS * ROUND_SECONDS;\n  }",
    to: "",
    breaks: "W4b — outside an encounter the window would never close"
  },

  /* ── R: the record ─────────────────────────────────────────────── */
  {
    file: P,
    name: "R1 THE WARP DOES NOT TRAVEL: a released spell loses what was paid for",
    from: "    mods: mods && typeof mods === \"object\" ? { ...mods } : {},",
    to: "    mods: {},",
    breaks: "R3 — the caster paid for warps that then did nothing"
  },
  {
    file: P,
    name: "R2 a nonsense release cost is trusted",
    from: '    releaseCost: ["1", "reaction", "free"].includes(text(releaseCost)) ? text(releaseCost) : "1",',
    to: '    releaseCost: text(releaseCost),',
    breaks: "R4b"
  },
  {
    file: P,
    name: "R3 what storage took is not recorded",
    from: "    ppPaid: Math.max(0, int(ppPaid)),",
    to: "    ppPaid: 0,",
    breaks: "R2 — nothing could be settled at release"
  },

  /* ── S: the settlement ─────────────────────────────────────────── */
  {
    file: P,
    name: "S1 THE PARTIAL TAX: the settlement never hands anything back",
    from: "  return { owed, refund: owed < 0 ? -owed : 0, extra: owed > 0 ? owed : 0 };",
    to: "  return { owed, refund: 0, extra: owed > 0 ? owed : 0 };",
    breaks: "S2/S3 — a spell that cast nothing would keep the caster's PP"
  },
  {
    file: P,
    name: "S2 the settlement runs backwards",
    from: "  const owed = Math.max(0, int(due)) - Math.max(0, int(paid));",
    to: "  const owed = Math.max(0, int(paid)) - Math.max(0, int(due));",
    breaks: "S2 — a Heroic would be charged the difference instead of refunded it"
  },
  {
    file: P,
    name: "S3 it can no longer take, only give",
    from: "  return { owed, refund: owed < 0 ? -owed : 0, extra: owed > 0 ? owed : 0 };",
    to: "  return { owed, refund: owed < 0 ? -owed : 0, extra: 0 };",
    breaks: "S7 — Variable Success adds PP after the degree"
  },

  /* ── G: the intercept ──────────────────────────────────────────── */
  {
    file: CAST,
    name: "G1 THE SHIPPED DEFECT: nothing is ever stored",
    from: "  const storingNow = !stored && !isStoringSpell && Boolean(readArmed(actor));",
    to: "  const storingNow = false;",
    breaks: "G1 — the spell does nothing at all"
  },
  {
    file: CAST,
    name: "G2 Spell Storing stores itself",
    from: '  const isStoringSpell = (spellData?.effects ?? []).some((e) => e?.kind === "spellStoring");',
    to: "  const isStoringSpell = false;",
    breaks: "G2 — the window would swallow the spell that opened it"
  },
  {
    file: CAST,
    name: "G3 TARGETS ARE PICKED AT STORAGE, a round before they are needed",
    // RE-ANCHORED 3.612.0: the line also skips a reaction cast's preset target.
    from: "  if (spellNeedsTarget(spellData) && !storingNow && !reaction?.presetTargets && !presetTargets) {",
    to: "  if (spellNeedsTarget(spellData) && !reaction?.presetTargets && !presetTargets) {",
    breaks: "G3 — a target chosen now has had a round to move"
  },
  {
    file: CAST,
    name: "G4 THE WARP CHOOSER IS OFFERED AGAIN AT RELEASE",
    from: "  if (!isCantrip && !isItemCast && !stored && (!isInnate || innateBudget > 0)) {",
    to: "  if (!isCantrip && !isItemCast && (!isInnate || innateBudget > 0)) {",
    breaks: "G4 — a 1 PP spell could be released as a 20 PP one, for free"
  },
  {
    file: CAST,
    name: "G5 the stored warp is ignored",
    from: "  if (stored?.mods) {",
    to: "  if (false) {",
    breaks: "G4b — what the caster paid for at storage would not arrive"
  },
  {
    file: CAST,
    name: "G6 storage stops charging",
    from: '      await actor.update({ "system.resources.pp.value": Math.max(0, ppPool - totalPP) });',
    to: "",
    breaks: "G5d — the ruling is that the cast pays when it is cast"
  },
  {
    file: CAST,
    name: "G7 storing costs no action",
    from: "    await spendActionCost(actor, castTimeApCost(warpedCastAP), spell.name);",
    to: "",
    breaks: "G5e — the spell really was cast"
  },
  {
    file: CAST,
    name: "G8 THE RELEASE PAYS AGAIN INSTEAD OF SETTLING",
    from: "  if (stored) {\n    const settle = storedSettlement(stored.ppPaid, ppSpent);",
    to: "  if (false) {\n    const settle = storedSettlement(stored?.ppPaid, ppSpent);",
    breaks: "G6 — the spell would be paid for twice"
  },
  {
    file: CAST,
    name: "G9 the refund reads a stale pool",
    from: "      const poolNow = Number(actor.system?.resources?.pp?.value ?? 0);",
    to: "      const poolNow = ppPool;",
    breaks: "G6b — a refund computed from a pool a round out of date invents points"
  },
  {
    file: CAST,
    name: "G10 an ordinary cast stops paying at all",
    from: "  } else if (casterPPSpent) {",
    to: "  } else if (false) {",
    breaks: "G6d — the settle must not become the only path"
  },

  /* ── B: the staff ──────────────────────────────────────────────── */
  {
    file: FLOW,
    name: "B1 the store follows the ability rather than the designation",
    from: "    if (item?.flags?.[SYSTEM_ID]?.arcaneBond) return item;",
    to: '    if (item?.type === "ability") return item;',
    breaks: "B1 — the ability is not the staff"
  },
  {
    file: CAST,
    name: "B2 PAYMENT FIRST, REFUSAL AFTER: a wizard with no staff pays anyway",
    from: "    if (!bond) {",
    to: "    if (false) {",
    breaks: "B2 — PP taken for a store that never happened"
  },
  {
    file: FLOW,
    name: "B3 THE DOUBLE RELEASE: the staff is emptied after the spell resolves",
    from: "  await item.unsetFlag(SYSTEM_ID, STORED_SPELL_FLAG);\n  const { castSpell } = await import(\"./cast-workflow.mjs\");",
    to: "  const { castSpell } = await import(\"./cast-workflow.mjs\");",
    breaks: "B4 — a record still in the staff while its spell resolves"
  },
  {
    file: FLOW,
    name: "B4 a free release is charged an action after all",
    from: '  if (record.releaseCost !== "free") {',
    to: "  if (true) {",
    breaks: "B5 — the 8 PP warp's whole purchase"
  },
  {
    file: FLOW,
    name: "B5 a record pointing at a deleted spell jams the staff",
    from: "  if (!spell) {",
    to: "  if (false) {",
    breaks: "B6 — it would refuse forever and block the next storage"
  },

  /* ── E: the effect case ────────────────────────────────────────── */
  {
    file: SE,
    name: "E1 the effect kind stops being handled",
    from: '        case "spellStoring": {',
    to: '        case "spellStoringDisabled": {',
    breaks: "E1 — the spell falls through to the unhandled-kind branch"
  },
  {
    file: SE,
    name: "E2 the release cost stops being read off the warp",
    from: "            releaseCost: releaseActionCost(warpMods)",
    to: '            releaseCost: "1"',
    breaks: "E2 — both warps would buy nothing again"
  },
  {
    file: SE,
    name: "E3 casting it again silently overwrites what was held",
    from: "          if (already?.record?.spellName) {",
    to: "          if (false) {",
    breaks: "E3 — a stored spell vanishing without a line, its PP already gone"
  },
  {
    file: SE,
    name: "E4 no staff applies silently",
    from: "          if (!bond) {",
    to: "          if (false) {",
    breaks: "E4"
  },
  {
    // FOUND LIVE, 5 September 2026. One sentence served both refusals and
    // ended "no PP was spent" — printed directly above the spell's own
    // "1 PP locked" line, on the very first cast.
    file: SE,
    name: "E5 THE CARD CONTRADICTS ITSELF: the cast promises nothing was spent",
    from: "            lines.push(line(noBondCastLine(spell.name)));",
    to: "            lines.push(line(noBondLine(spell.name)));",
    breaks: "E5b — \"no PP was spent\" two lines above \"1 PP locked\""
  },
  {
    file: P,
    name: "E6 and the intercept's refusal stops promising it",
    from: "    + \"today. Use Arcane Bond first — nothing was stored and no PP was spent.</em>\";",
    to: "    + \"today. Use Arcane Bond first.</em>\";",
    breaks: "E5 — the one place the promise is true is the one place it is useful"
  },

  /* ── R: the card and the panel ─────────────────────────────────── */
  {
    file: P,
    name: "R4 a displaced spell's PP is quietly promised back",
    from: "  return `<em>${oldName} was already stored and is dismissed — its PP is not returned.</em>`;",
    to: "  return `<em>${oldName} was already stored and is dismissed.</em>`;",
    breaks: "R6c"
  },
  {
    file: P,
    name: "R5 the settlement line reads the same in both directions",
    from: "      + `<strong>${s.extra}</strong> PP more taken.</em>`;",
    to: "      + `<strong>${s.extra}</strong> PP returned.</em>`;",
    breaks: "R7b — a charge announced as a refund"
  },
  {
    file: P,
    name: "R6 the one-round window stops being printed",
    from: '  return "<em>The window lasts one round: the next spell you cast in it is stored instead of "',
    to: '  return "<em>The window: the next spell you cast in it is stored instead of "',
    breaks: "R8 — the half a player loses silently"
  },
  {
    file: HBS,
    name: "R7 the release button disappears",
    from: 'data-action="releaseStoredSpell"',
    to: 'data-action="noSuchAction"',
    breaks: "R9 — a stored spell with no way to release it"
  },
  {
    file: SHEET,
    name: "R8 the sheet stops reading the staff",
    from: "    const heldSpell = readStored(actor);",
    to: "    const heldSpell = null;",
    breaks: "R9b"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([P, FLOW, CAST, SE, WARP, SHEET, HBS, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-spell-storing: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-spell-storing: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-spell-storing: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
