#!/usr/bin/env node
/**
 * verify-per-turn — an emanation that does something every turn.
 *
 * NEW at 3.461.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE KIND EXISTED; ONLY ONE SPELL COULD USE IT.
 *
 * `perTurn` has been a live emanation kind since 3.435.1, but
 * `applyPerTurnEmanations` computed its effect with `luminanceTurnEffect`
 * — which reads Luminance's own Sustain state and ignores the row
 * completely. The `formula` and `mode` the pack entry carried were read
 * by nothing, and a second spell declaring the kind would have inherited
 * Luminance's growing dice and its undead inversion.
 *
 * GRAHAM'S RULING, 1 September 2026, on Aura of Vitality: "at the
 * beginning of your turn, EACH ALLY within the radius is healed" — the
 * whole circle in one moment, not each creature on its own turn. So a row
 * now declares whose turn fires it, defaulting to `self` so Luminance is
 * untouched.
 *
 * SECTION R IS THE ONE THAT MATTERS: the caster-turn shape has to be
 * REACHED, and it has to leave the self path alone.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  normalisePerTurn, perTurnFires, perTurnReaches, perTurnHealLine, PER_TURN_TRIGGERS
} from "../module/magic/per-turn.mjs";
import { LIVE_EMANATION_EFFECT_KINDS, emanationIsLive, emanationMembers } from "../module/magic/emanation.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => String(s)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
function before(hay, a, b) {
  const i = hay.indexOf(a); const j = hay.indexOf(b);
  return i !== -1 && j !== -1 && i < j;
}

/* ================================================================== *
 * N. WHAT A ROW IS
 * ================================================================== */

const lum = normalisePerTurn({ kind: "perTurn", formula: "1d8", mode: "heal" });
const aura = normalisePerTurn({ kind: "perTurn", formula: "2d8", mode: "heal", bleedRemoved: 1, on: "caster" });
ok("N1 a per-turn row normalises", lum?.formula === "1d8" && aura?.formula === "2d8");
// DEFAULTING TO `self` IS WHAT KEEPS LUMINANCE UNCHANGED.
ok("N2 AN UNDECLARED ROW FIRES ON THE CREATURE'S OWN TURN",
  lum?.on === "self",
  "the only row that existed before 3.461.0 means exactly this");
ok("N3 and a declared caster row says so", aura?.on === "caster");
ok("N4 only the two known triggers are accepted",
  normalisePerTurn({ kind: "perTurn", formula: "1d8", on: "everyone" }) === null
  && PER_TURN_TRIGGERS.join(",") === "self,caster");
ok("N5 a row of another kind is not one of these",
  normalisePerTurn({ kind: "bonus", formula: "1d8" }) === null);
ok("N6 a malformed formula is refused",
  normalisePerTurn({ kind: "perTurn", formula: "lots" }) === null
  && normalisePerTurn({ kind: "perTurn" }) === null);
ok("N7 and an unknown mode is refused",
  normalisePerTurn({ kind: "perTurn", formula: "1d8", mode: "burn" }) === null);
// A DAMAGE ROW MUST NAME ITS TYPE, for the reason every other row here must.
ok("N8 A DAMAGE ROW WITHOUT A TYPE IS REFUSED",
  normalisePerTurn({ kind: "perTurn", formula: "1d8", mode: "damage" }) === null,
  "an empty type means \"the weapon's own\" elsewhere in this system");
ok("N8b but a typed one is fine",
  normalisePerTurn({ kind: "perTurn", formula: "1d8", mode: "damage", damageType: "essence" })?.damageType === "essence");
ok("N9 the bleed clause is declared per row",
  aura?.bleedRemoved === 1 && lum?.bleedRemoved === 0,
  "a per-turn row that only heals HP is an ordinary thing to want");

/* ================================================================== *
 * T. WHOSE TURN
 * ================================================================== */

ok("T1 a self row fires for a member", perTurnFires(lum, { isMember: true }) === true);
ok("T2 and not for a creature outside the circle", perTurnFires(lum, { isMember: false }) === false);
ok("T3 A CASTER ROW FIRES ONLY ON THE CASTER'S TURN",
  perTurnFires(aura, { isCaster: true }) === true
  && perTurnFires(aura, { isCaster: false, isMember: true }) === false,
  "an ally standing in it must not open the round for everyone");
// THE CIRCLE IS CENTRED ON THE CASTER, so they are normally inside it —
// but a caster moved out by something else must still open the round.
ok("T3b even if the caster is somehow outside their own circle",
  perTurnFires(aura, { isCaster: true, isMember: false }) === true);
ok("T4 and nothing fires for a missing row", perTurnFires(null, { isCaster: true }) === false);
ok("T5 the reach differs with the trigger",
  perTurnReaches(lum) === "one" && perTurnReaches(aura) === "all");

/* ================================================================== *
 * C. THE CARD
 * ================================================================== */

ok("C1 a heal says what landed and what was rolled",
  /healed <strong>6<\/strong> HP \(2d8 rolled 9\)/.test(perTurnHealLine("Aura", "Nella", 6, "2d8", 9)));
// WHAT ACTUALLY HAPPENED, not what was rolled. "healed 6" over an
// unchanged HP bar is the card lying.
ok("C2 AND A CREATURE AT FULL HEALTH IS NOT SAID TO BE HEALED",
  /already at full health/.test(perTurnHealLine("Aura", "Nella", 0, "2d8", 9)),
  "Song Of Despair's recovery line taught this on 28 August 2026");
ok("C3 the bleed note rides along",
  /Bleeding/.test(perTurnHealLine("Aura", "Nella", 6, "2d8", 9, " Bleeding <strong>2</strong> &rarr; <strong>1</strong>.")));

/* ================================================================== *
 * R. IS IT REACHED?
 * ================================================================== */

const flow = strip(read("module", "magic", "luminance-workflow.mjs"));
ok("R1 the kind is still a live emanation", LIVE_EMANATION_EFFECT_KINDS.includes("perTurn"));
ok("R2 the turn loop asks the general rule",
  flow.includes("const general = normalisePerTurn(rule);"));
ok("R3 A CASTER ROW TAKES THE WHOLE-CIRCLE PATH",
  flow.includes('if (general && perTurnReaches(general) === "all") {')
  && flow.includes("applyCasterTurnEmanation(record, general, actor, token)"),
  "folding a circle sweep into a function shaped around one creature would be two rules in one loop");
// AND LEAVES LUMINANCE ALONE. The self path must be reached only by rows
// that mean what it does.
ok("R4 and the self path is skipped for it",
  before(flow, "applyCasterTurnEmanation(record, general, actor, token)", "const state = luminanceState("),
  "Luminance's growing dice must not reach a plain row");
ok("R5 the caster-turn applier asks the rule rather than re-deriving it",
  flow.includes("if (!perTurnFires(spec, { isCaster })) return lines;"));
ok("R6 it reaches every member, through the same function the self path uses",
  flow.includes("const inside = emanationMembers({") && flow.includes("const subjects = (canvas?.tokens?.placeables ?? []).map"),
  "the emanation's own mode decides whether that means allies");
// ONE ROLL PER CREATURE. A shared roll would print one number for the
// whole circle and hide the variance the dice exist for.
// ONE ROLL STATEMENT, AND IT IS INSIDE THE LOOP. Ordering alone was not
// enough: a mutation that HOISTED a shared roll above the loop, leaving
// the inner one in place, satisfied a `before` check and survived.
// Counting the occurrences is what makes a hoisted duplicate visible.
const casterApplier = (() => {
  const at = flow.indexOf("async function applyCasterTurnEmanation(");
  if (at === -1) return "";
  let depth = 0;
  for (let i = flow.indexOf("{", flow.indexOf(")", at)); i < flow.length; i += 1) {
    if (flow[i] === "{") depth += 1;
    else if (flow[i] === "}") { depth -= 1; if (depth === 0) return flow.slice(at, i + 1); }
  }
  return "";
})();
ok("R7 the caster applier's body was found", casterApplier.length > 0);
ok("R7b A DIE IS ROLLED FOR EACH CREATURE, AND ONLY THERE",
  (casterApplier.match(/new Roll\(spec\.formula\)/g) ?? []).length === 1
  && before(casterApplier, "for (const memberId of inside) {", "new Roll(spec.formula)"),
  "a shared roll would heal every ally the same number");
ok("R8 and the healing is written, not just printed",
  flow.includes('await target.update({ "system.resources.hp.value": beforeHP + healed });'));

/* ================================================================== *
 * A. AURA OF VITALITY
 * ================================================================== */

const { ClassicLevel } = await import("classic-level");
const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
await db.open();
const spells = [];
try {
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!") && v?.type === "spell") spells.push(v);
  }
} finally { await db.close(); }
ok("A0 the pack was read", spells.length > 600, `${spells.length}`);

const rows = [];
for (const s of spells) {
  for (const r of s.system?.effects ?? []) if (r?.kind === "perTurn") rows.push({ spell: s.name, row: r });
}
ok("A1 two spells declare a per-turn row",
  rows.length === 2 && rows.map((r) => r.spell).sort().join(", ") === "Aura Of Vitality, Luminance",
  rows.map((r) => r.spell).join(", "));
ok("A2 and every one of them normalises",
  rows.every(({ row }) => normalisePerTurn(row) !== null),
  rows.filter(({ row }) => !normalisePerTurn(row)).map((r) => r.spell).join(", "));

const av = spells.find((s) => s.name === "Aura Of Vitality");
const avRow = normalisePerTurn((av?.system?.effects ?? []).find((r) => r?.kind === "perTurn"));
ok("A3 Aura Of Vitality heals 2d8 on the caster's turn",
  avRow?.formula === "2d8" && avRow?.mode === "heal" && avRow?.on === "caster");
ok("A4 and removes a point of bleed", avRow?.bleedRemoved === 1);
ok("A5 it is aimed at allies", String(av?.system?.areaTargeting ?? "") === "allies",
  "\"each ally\" is the entry's own word");
// THE WORD IS LOAD-BEARING. `emanationIsLive` tests the area string, so
// "20' radius (B)" could never have run this at all.
ok("A6 AND IT IS A LIVE EMANATION",
  emanationIsLive(av?.system) === true && /emanation/i.test(String(av?.system?.area ?? "")),
  "with \"radius\" the per-turn heal would never run");

/*
 * ─────────────────────────────────────────────────────────────────────
 * SECTION M — WHAT `emanationMembers` HANDS BACK.
 *
 * THE DEFECT THIS SECTION EXISTS FOR, found by driving 3.463.0.
 *
 * The circle registered, the members resolved, every pure rule in this
 * file passed — and Aura Of Vitality healed NOBODY. 3.461.0 wrote
 * `for (const member of inside)` and then `member.id`, reading the shape
 * it had PASSED IN (subjects, `{id, centreFeet, disposition}`) instead of
 * the shape it got back (bare id strings). `member.id` was undefined for
 * all five, so every creature hit `if (!target) continue`.
 *
 * IT FAILED SILENTLY IN BOTH DIRECTIONS. No error was thrown, and an
 * empty return is indistinguishable from an emanation that legitimately
 * caught nobody — which is exactly what I assumed for two releases while
 * reporting the mechanism "proven by the harness".
 *
 * SO THE CONTRACT IS ASSERTED AGAINST THE REAL FUNCTION, not described.
 * `emanationMembers` is pure and importable, so the harness can simply
 * ASK it what it returns rather than trust either reader's belief. That
 * is the only kind of check that could have caught this: the two source
 * greps in section R both passed throughout, because the call WAS
 * present and the call WAS reached. Present, reached, and wrong.
 */
{
  const members = emanationMembers({
    centreFeet: { x: 0, y: 0 },
    radiusFeet: 20,
    subjects: [
      { id: "aaa", centreFeet: { x: 0, y: 0 }, disposition: 1 },
      { id: "bbb", centreFeet: { x: 5, y: 0 }, disposition: 1 },
      { id: "ccc", centreFeet: { x: 500, y: 0 }, disposition: 1 }
    ],
    casterDisposition: 1,
    mode: "allies"
  });
  ok("M1 emanationMembers returns the members inside the circle",
    members.length === 2,
    "the far subject must be excluded");
  ok("M2 AND IT RETURNS IDS, NOT SUBJECT OBJECTS",
    members.every((m) => typeof m === "string"),
    "reading `.id` off one of these yields undefined and skips the creature");
  ok("M3 which are the ids that went in",
    members.includes("aaa") && members.includes("bbb"),
    "the caller looks its tokens up by these");

  // AND THE CONSUMER MUST INDEX THEM AS IDS. M2 states the contract; this
  // states that the whole-circle path OBEYS it. Without this pair the
  // contract could be right and the reader still wrong, which is the
  // defect exactly.
  ok("M4 and the caster-turn path looks tokens up BY THE ID ITSELF",
    flow.includes("canvas.tokens.placeables.find((t) => t.id === memberId)")
    && !flow.includes("t.id === member.id"),
    "`member.id` is undefined for every member and silently skips them all");
}

const lumSpell = spells.find((s) => s.name === "Luminance");
ok("A7 Luminance still fires on each creature's own turn",
  normalisePerTurn((lumSpell?.system?.effects ?? []).find((r) => r?.kind === "perTurn"))?.on === "self",
  "its printed sentence is \"all creatures that begin their turn in the radius\"");

if (failures.length) {
  process.stderr.write(`verify-per-turn: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-per-turn: OK — ${checks} checks. Luminance on each creature's turn, Aura Of Vitality on the caster's.\n`);
