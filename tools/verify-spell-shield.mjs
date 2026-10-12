#!/usr/bin/env node
/**
 * verify-spell-shield — can a spell give you something to block with?
 *
 * NEW at 3.542.0, beside the rule it checks.
 *
 * THE DEFECT THIS EXISTS FOR was not a wrong number, it was a sentence
 * that was never wired. Shield's `note` row said "Enables the Shield
 * Block reaction (base DR 1 + BSB)" and `shieldBlockEligibility` asked
 * for an equipped ITEM, so the answer for a caster running Shield was
 * "no shield is equipped". Measured before the repair; E1 below is that
 * measurement turned into a check that fails if it comes back.
 *
 * WHAT MAKES THIS CHECKABLE AT ALL is that the rule is pure and takes
 * numbers — a base, a BSB, the warp mods — so every combination runs
 * here without a world.
 */

import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { shieldBlockEligibility } from "../module/combat/shield-block.mjs";
import {
  spellShieldDR, spellShieldSources, normaliseSpellShield, casterBSB
} from "../module/magic/spell-shield.mjs";

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

const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
for await (const [, v] of db.iterator()) if (v?.type === "spell") spells.push(v);
await db.close();

const STEEL = { type: "shield", name: "Heavy Steel Shield",
  system: { equipped: true, dr: 2, quality: "standard", material: "", hp: { value: 10, max: 10 } } };
const ROW = { kind: "spellShield", label: "Shield", baseDR: 1, lockoutMinutes: 10 };
const src = (bsb, warpMods = {}) => spellShieldSources([{ effect: ROW, warpMods, castId: "c1" }], bsb);

/* ── E: THE DEFECT ITSELF ─────────────────────────────────────────── */

ok("E1 A CASTER WITH A SPELL SHIELD AND NO ITEM CAN SHIELD BLOCK",
  shieldBlockEligibility([], src(4)).able === true,
  "this is the whole bug: the answer used to be \"no shield is equipped\", which was true "
  + "about the inventory and false about whether they could block");

equal("E1b AND A CASTER WITH NEITHER STILL CANNOT",
  shieldBlockEligibility([], []).able, false,
  "without this, E1 would pass just as well on a rule that let everybody block");

/* A ZERO-DR SPELL SHIELD IS HANDED STRAIGHT TO THE RULE, because
 * `spellShieldSources` already drops those and the eligibility guard
 * would never see one through that path — the mutation runner proved it
 * by deleting the guard and watching everything still pass. A rule that
 * is only ever fed clean input is a rule nothing is checking. */
equal("E1d A SPELL SHIELD WORTH NOTHING IS NOT A SHIELD BLOCK",
  shieldBlockEligibility([], [{ label: "Faded Ward", dr: 0, fromSpell: true }]).able, false,
  "\"a shield with no DR is not a worse Shield Block, it is no Shield Block\" — the rule's "
  + "own header, and it has to hold for the spell-made kind too");

equal("E1c AND THE REFUSAL STILL SAYS WHY",
  shieldBlockEligibility([], []).why, "no shield is equipped",
  "the message was correct all along for the case it was written for");

/* ── D: THE ARITHMETIC ────────────────────────────────────────────── */

equal("D1 BASE PLUS BSB", spellShieldDR({ baseDR: 1, bsb: 4 }), 5,
  "\"base DR 1 + BSB\" — the sentence the note used to make and nothing kept");
equal("D1b AND A BSB OF NOTHING LEAVES THE BASE",
  spellShieldDR({ baseDR: 1, bsb: 0 }), 1,
  "a level-one caster still has a shield, just a thin one");

equal("D2 THE WARP RAISES THE BASE, THEN BSB IS ADDED",
  spellShieldDR({ baseDR: 1, bsb: 4, warpMods: { bonusValue: 2, bonusMax: 5 } }), 7,
  "base 1 + 2 bought = 3, plus BSB 4. Raising the TOTAL instead would make one purchase "
  + "worth less to a low-BSB caster than a high one, which is not what a flat +1 reads as");

equal("D3 AND THE PRINTED CEILING CAPS THE BASE",
  spellShieldDR({ baseDR: 1, bsb: 4, warpMods: { bonusValue: 9, bonusMax: 5 } }), 9,
  "base capped at 5, plus BSB 4 — the cap counts the printed base, which is the same "
  + "arithmetic bonusMax already means everywhere else");

ok("D3b AND THE CAP ACTUALLY BINDS",
  spellShieldDR({ baseDR: 1, bsb: 0, warpMods: { bonusValue: 9, bonusMax: 5 } })
  < spellShieldDR({ baseDR: 1, bsb: 0, warpMods: { bonusValue: 9 } }),
  "uncapped must exceed capped, or D3 is passing on a cap that does nothing");

/* ── C: CHOOSING BETWEEN A CARRIED SHIELD AND A SPELL ─────────────── */

const tie = shieldBlockEligibility([STEEL], src(1));
ok("C1 A TIE GOES TO THE CARRIED SHIELD",
  tie.able && tie.dr === 2 && tie.shield && !tie.spellShield,
  "blocking with the spell ends it, so when both stop the same the one that survives is "
  + "the better answer — and it is the one nobody paid PP for");

const spellWins = shieldBlockEligibility([STEEL], src(6));
ok("C2 BUT A BETTER SPELL SHIELD WINS",
  spellWins.able && spellWins.dr === 7 && spellWins.spellShield && !spellWins.shield,
  "one shield does the blocking and it is the one that blocks most — the same rule that "
  + "already chose between two carried shields");

ok("C3 AND THEY ARE NEVER ADDED TOGETHER",
  shieldBlockEligibility([STEEL], src(6)).dr === 7,
  "2 + 7 would be 9; multiple shield bonuses do not stack");

/* ── N: THE ROW IS REFUSED WHEN IT IS MALFORMED ───────────────────── */

equal("N1 A ROW WITH NO BASE IS REFUSED",
  normaliseSpellShield({ kind: "spellShield" }), null,
  "defaulting it would make an authoring mistake invisible");
equal("N1b AND SO IS A ROW OF THE WRONG KIND",
  normaliseSpellShield({ kind: "note", baseDR: 1 }), null);
ok("N1c BUT A GOOD ROW SURVIVES",
  normaliseSpellShield(ROW)?.baseDR === 1);

equal("N2 BSB IS READ FROM BOTH FIELDS",
  casterBSB({ system: { magic: { bsb: 2 }, progression: { bsb: 3 } } }), 5,
  "the two halves the sheet keeps apart, which actor.mjs already sums this way");

/* ── P: THE PACK ──────────────────────────────────────────────────── */

const shield = spells.find((s) => s.name === "Shield");
const rows = (shield?.system?.effects ?? []);
ok("P1 SHIELD CARRIES A REAL spellShield ROW",
  rows.some((r) => r?.kind === "spellShield"),
  "the row this release exists to add");

ok("P1b AND NO LONGER DESCRIBES IT IN A NOTE AS WELL",
  !rows.some((r) => r?.kind === "note" && /Shield Block/i.test(String(r?.text ?? ""))),
  "prose beside mechanism, saying the same thing, is free to drift — which is how the "
  + "damage side of Wash Away Sin came to be wrong");

equal("P2 AND ITS WARP IS BUILT",
  JSON.stringify(shield?.system?.warps?.[0]?.mods ?? {}),
  JSON.stringify({ bonusValue: 1, bonusMax: 5 }),
  "\"increase shield bonus & base DR by +1 (max +5)\" — one mod, read by both rows, "
  + "because the spell's own sentence binds them together");

const pack = spells.flatMap((s) => (s.system?.effects ?? [])
  .filter((r) => r?.kind === "spellShield").map((r) => ({ spell: s.name, r })));
equal("P3 EVERY spellShield ROW IN THE PACK IS WELL FORMED",
  JSON.stringify(pack.filter(({ r }) => !normaliseSpellShield(r)).map((x) => x.spell)),
  JSON.stringify([]),
  "a malformed row prints a refusal on the card instead of a shield");

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-spell-shield: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-spell-shield: OK — ${checks} checks. A spell can make a shield, `
  + "it scales with BSB, and it never stacks with the one on your arm.\n");
