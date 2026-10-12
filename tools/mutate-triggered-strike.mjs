#!/usr/bin/env node
/**
 * mutate-triggered-strike — can verify-triggered-strike fail?
 * NEW at 3.467.0.
 *
 * T4 IS THE ONE THAT MATTERS. `lastCriticalInjury` is not cleared between
 * rounds — Ambush reads the same flag — so an implementation that only
 * asked "is there a record" would let a cleric answer a critical from
 * four rounds ago, at any time, for ever. That mutation is below and it
 * is the cheap mistake this mechanism invites.
 *
 * E3 IS THE OTHER. The recipient of the effect is the ALLY, so an
 * applier that damaged its recipient would hurt the wrong creature and
 * would read as entirely reasonable in the source.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const T = path.join(SYSTEM_ROOT, "module", "magic", "triggered-strike.mjs");
const A = T;
const K = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-triggered-strike.mjs");

const MUTATIONS = [
  {
    // THE SHIPPED DEFECT OF 3.467.0: the sidebar sheet takes the damage
    // and the creature on the map does not, while the card names the
    // right creature either way.
    file: E,
    name: "E3b THE SHIPPED DEFECT: the victim is resolved by id, not uuid",
    from: "            const victim = (verdict.targetActorUuid\n              ? (await fromUuid(verdict.targetActorUuid).catch(() => null))\n              : null) ?? game.actors?.get?.(verdict.targetActorId) ?? null;",
    to: "            const victim = game.actors?.get?.(verdict.targetActorId) ?? null;",
    breaks: "E3b — an unlinked token's damage would land on its sidebar sheet"
  },
  {
    file: A,
    name: "U4 an old record claims to be precise",
    from: "  return Boolean(verdict?.ok && verdict.targetActorUuid);",
    to: "  return Boolean(verdict?.ok);",
    breaks: "U4 — a pre-3.468.0 record would silently damage the sidebar with no warning"
  },
  {
    file: A,
    name: "U1 the verdict stops carrying the uuid",
    from: '    targetActorUuid: String(record.targetActorUuid ?? "") || null',
    to: "    targetActorUuid: null",
    breaks: "U1/U2 — the applier would always fall back to the id"
  },
  {
    file: K,
    name: "R4b the record stops carrying the uuid",
    from: "      targetActorUuid: targetActor?.uuid ?? null,",
    to: "      targetActorUuid: null,",
    breaks: "R4b — nothing could tell an unlinked token from its sidebar sheet"
  },

  {
    file: T,
    name: "A3 a malformed die is accepted",
    from: "const DICE = /^([1-9]\\d*)d([1-9]\\d*)$/i;",
    to: "const DICE = /d/i;",
    breaks: "A3 — \"1d6+1\" would throw at cast time or roll something nobody checked"
  },
  {
    file: T,
    name: "A4 a row with no damage type is accepted",
    from: "  if (!damageType) return null;",
    to: "  if (false) return null;",
    breaks: "A4 — an empty type means \"the weapon's own\" elsewhere in this system"
  },
  {
    file: T,
    name: "A5 an unknown weapon kind is accepted",
    from: '  if (weapon !== "any" && weapon !== "melee" && weapon !== "ranged") return null;',
    to: "  if (false) return null;",
    breaks: "A5 — a row could name a weapon kind the trigger check does not understand"
  },
  {
    file: T,
    name: "A6 the weapon kind stops defaulting to any",
    from: '  const weapon = text(raw.weapon).toLowerCase() || "any";',
    to: '  const weapon = text(raw.weapon).toLowerCase() || "melee";',
    breaks: "A6 — a second spell would silently inherit War Cry's own restriction"
  },
  {
    file: T,
    name: "A7 the free attack stops being the default",
    from: "    freeAttack: raw.freeAttack !== false",
    to: "    freeAttack: raw.freeAttack === true",
    breaks: "A7/L3 — a row that simply did not mention it would offer nothing"
  },
  {
    file: T,
    name: "T3 a reaction with no critical behind it is allowed",
    from: '  if (!record) return no("they have not landed a critical");',
    to: "  if (false) return no(\"x\");",
    breaks: "T3 — the spell could be cast hopefully, whenever a player liked"
  },
  {
    // THE CHEAP MISTAKE THIS MECHANISM INVITES.
    file: T,
    name: "T4 THE STALE RECORD: any round's critical will do",
    from: "  if ((record.round ?? null) !== (round ?? null)) {",
    to: "  if (false) {",
    breaks: "T4 — the flag is not cleared between rounds, so a four-round-old crit would answer"
  },
  {
    file: T,
    name: "T5 a ranged critical answers a melee trigger",
    from: '  if (spec.weapon === "melee" && record.weaponIsRanged === true) {',
    to: "  if (false) {",
    breaks: "T5/T6 — \"with a melee weapon\" is in the printed trigger"
  },
  {
    file: T,
    name: "T8 a record naming no creature is accepted",
    from: '  if (String(record.targetActorId ?? "") === "") return no("that critical recorded no target");',
    to: "  if (false) return no(\"x\");",
    breaks: "T8 — there would be nobody to apply the die to"
  },
  {
    file: T,
    name: "T10 a refusal stops saying why",
    from: "  const no = (why) => ({ ok: false, why, targetActorId: null });",
    to: "  const no = () => ({ ok: false, why: \"\", targetActorId: null });",
    breaks: "T10 — a silent refusal is a player wondering whether the spell is broken"
  },
  {
    file: T,
    name: "L2 the line stops admitting defences ate some",
    from: '  const reduced = Number(taken) !== Number(rolled) ? ", reduced by their defences" : "";',
    to: '  const reduced = "";',
    breaks: "L2 — a creature resistant to sonic would be described as taking the full die"
  },
  {
    // THE WRONG CREATURE, AND IT WOULD LOOK REASONABLE.
    file: E,
    name: "E3 THE WRONG CREATURE: the die lands on the ally",
    from: "            if (packet.taken > 0) await applyDamageAndCheckDying(victim, packet.taken);",
    to: "            if (packet.taken > 0) await applyDamageAndCheckDying(ally, packet.taken);",
    breaks: "E3 — the recipient is the triggering ally, so this would hurt the caster's friend"
  },
  {
    file: E,
    name: "E2 the applier stops checking the trigger",
    from: "            const verdict = triggeredStrikeQualifies(spec, record, game.combat?.round ?? null);",
    to: "            const verdict = { ok: true, why: \"\", targetActorId: String(record?.targetActorId ?? \"\") };",
    breaks: "E2 — the printed trigger would be decoration"
  },
  {
    file: E,
    name: "E5 a refusal is swallowed instead of printed",
    from: "              lines.push(line(triggeredStrikeRefusal(spell.name, ally.name, verdict.why)));",
    to: "              void 0;",
    breaks: "E5 — the reaction would do nothing and say nothing"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([T, E, K, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-triggered-strike: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-triggered-strike: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-triggered-strike: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
