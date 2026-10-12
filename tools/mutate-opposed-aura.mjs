#!/usr/bin/env node
/**
 * mutate-opposed-aura — can verify-opposed-aura fail? NEW at 3.446.0.
 *
 * R1 IS THE RULING. Balance opposing nobody is not an accident of the
 * pairs table; it is Graham's ruling of 31 August 2026, and a mutation
 * that hands Balance an opposite must fail loudly rather than quietly
 * granting a bonus to three of the ten divine aspects.
 *
 * G1 IS THE OTHER RULING, and the one with the widest blast radius: a
 * conditional bonus written into the sheet total raises the number
 * against EVERY opponent, which is the Stone Shield defect exactly —
 * "cover from one chosen enemy" as an unconditional +4.
 *
 * E1/E2 ARE THE "IS IT REACHED?" PAIR. Both channels can be granted
 * perfectly and consulted by nobody, which is this project's most
 * repeated failure: Cutting Words' inert gate, freezeMembership, and the
 * area warp that charged for nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const O = path.join(SYSTEM_ROOT, "module", "magic", "opposed-aura.mjs");
const D = path.join(SYSTEM_ROOT, "module", "divine-aspect.mjs");
const A = path.join(SYSTEM_ROOT, "module", "documents", "actor.mjs");
const E = path.join(SYSTEM_ROOT, "module", "magic", "emanation-effects.mjs");
const F = path.join(SYSTEM_ROOT, "module", "combat", "defence-dc.mjs");
const W = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const C = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const SW = path.join(SYSTEM_ROOT, "module", "magic", "spell-warp.mjs");
const E2 = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-opposed-aura.mjs");

// SOME ANCHORS RE-INDENTED AT 3.462.0, when the emanation recording was
// lifted out of the lock/sustained guard in cast-workflow and its block
// lost a level. The mutations are unchanged in substance; only the
// whitespace they match moved.
const MUTATIONS = [
  /* ── R: the rulings ────────────────────────────────────────────── */
  {
    file: O,
    name: "R1 THE RULING: Balance is given an opposite",
    from: "    if (opposite && !out.includes(opposite)) out.push(opposite);",
    to: '    out.push(opposite ?? "balance");',
    breaks: "A4/D9 — three of the ten aspects silently gain a bonus Graham ruled they do not get"
  },
  {
    file: O,
    name: "R2 a creature's own alignment is returned instead of its opposite",
    from: "    const opposite = ALIGNMENT_OPPOSITES[String(trait ?? \"\").trim().toLowerCase()];",
    to: '    const opposite = String(trait ?? "").trim().toLowerCase();',
    breaks: "A1/A2 — the aura helps against creatures aligned the SAME way"
  },
  {
    file: O,
    name: "R3 the card stops naming the condition",
    from: '    return "you carry no opposing aura — this bonus has nothing to apply against";',
    to: '    return "";',
    breaks: "C3 — the Stone Shield defect: a bonus that can never fire, printed as though it can"
  },

  /* ── B: the aspect grant ───────────────────────────────────────── */
  {
    file: D,
    name: "B1 an aspect's whole trait line is granted",
    from: "      if (!ALIGNED_TRAITS.includes(trait)) continue;",
    to: "      ;",
    breaks: "B5 — a rule about alignment hands over whatever else an author writes there"
  },
  {
    file: A,
    name: "B2 THE GRANT IS NEVER REACHED: the aspect's traits are dropped",
    from: "    ...new Set([...effectGrantedTraits(actor), ...fromAspects, ...fromAbilities])",
    to: "    ...new Set([...effectGrantedTraits(actor), ...fromAbilities])",
    breaks: "B7 — a Cleric of Dawn is not Good, and every aura keyed to it fires at nobody"
  },

  /* ── G: how the bonus is granted ───────────────────────────────── */
  {
    file: E,
    name: "G1 THE STONE SHIELD DEFECT: a conditional bonus becomes a sheet change",
    from: "    if (effect.opposedAura) {",
    to: "    if (false) {",
    breaks: "D1 — the number rises against every opponent in the scene"
  },
  {
    file: E,
    name: "G2 the caster's opposites never reach the record",
    from: "  const opposedTo = Array.isArray(emanation?.opposedTo) ? emanation.opposedTo : [];",
    to: "  const opposedTo = [];",
    breaks: "D2/D3 — every aura is granted as a Balance caster's and fires at nobody"
  },
  // G3 IS GONE, NOT RE-ANCHORED. It mutated the slot ternary that used to
  // live in emanation-effects.mjs; at 3.446.2 that routing moved into
  // `opposedAuraRecordsFor` so the cast-time path could ask the same
  // question, and P5 now makes exactly this claim against the one place
  // it lives. Re-anchoring would have been a second mutation of one rule.
  {
    file: E,
    name: "G4 a conditional-only aura places nothing at all",
    // RE-ANCHORED AT 3.586.0: the guard grew a fourth clause when an
    // antimagic field became the third kind of aura that places a
    // marker rather than a number. The claim is unchanged.
    // RE-ANCHORED 3.612.0: and a fifth, a held bonus (Inspire Heroics).
    from: "  if (!changes.length && !defenceDC.length && !opposedAttack.length && !antimagic && !held && !damageHeal) return null;",
    to: "  if (!changes.length) return null;",
    breaks: "D1b — the player pays for an aura that never appears on anyone"
  },
  {
    file: E,
    name: "G5 an ordinary emanation grows vestigial keys",
    from: "        ...(defenceDC.length ? { defenceDC } : {}),",
    to: "        defenceDC,",
    breaks: "D4b — Bless carries an empty conditional channel it never uses"
  },
  {
    file: C,
    name: "G6 the cast stops resolving the caster's opposites",
    from: "        opposedTo: opposingTraitsOf(system),",
    to: "          opposedTo: [],",
    breaks: "C5-adjacent — every aura in the game is cast as though by a Balance caster"
  },
  {
    file: C,
    name: "G7 the card stops saying what the bonus is keyed to",
    from: "      lines.push(line(`<em>${spell.name} — ${opposedAuraLine(opposingTraitsOf(system))}.</em>`));",
    to: "        ;",
    breaks: "C5 — a Balance caster is left to wonder whether the spell is broken"
  },

  /* ── P: the OTHER path that places these (3.446.2) ─────────────── */
  {
    // THE DEFECT ITSELF. The cast-time applier falls back to the ordinary
    // bonus case and writes a flat sheet change — an unconditional +1 DB
    // against everybody, which is what shipped at 3.446.0/.1.
    file: E2,
    name: "P1 THE DEFECT: the cast places a conditional bonus as a sheet change",
    from: "  if (effect.opposedAura) {",
    to: "  if (false) {",
    breaks: "D2e — Radiant Aegis raises every ally's DB against every attacker"
  },
  {
    file: E2,
    name: "P2 the conditional effect grows a sheet change anyway",
    from: "      changes: [],\n      flags: conditional",
    to: '      changes: [{ key: "system.combat.defence.status", type: CHANGE_TYPE.CUSTOM, value: "1" }],\n      flags: conditional',
    breaks: "D2f — the change row is exactly what made it unconditional"
  },
  {
    file: E2,
    name: "P3 the cast stops resolving whose aura it is",
    from: "  const casterOpposes = opposingTraitsOf(caster?.system ?? {});",
    to: "  const casterOpposes = [];",
    breaks: "D2g — every cast behaves as a Balance caster's and fires at nobody"
  },
  {
    file: E,
    name: "P4 the boundary path grows its own routing again",
    from: "      const records = opposedAuraRecordsFor({ ...effect, value }, opposedTo, emanation.name);",
    to: '      const records = { defenceDC: [{ dc: "defence", value, label: emanation.name, when: { sourceAlignments: opposedTo } }], attack: [] };',
    breaks: "D2h — two routings, and this pair already drifted once"
  },
  {
    file: O,
    name: "P5 the routing sends every row to the defence channel",
    from: '  if (String(effect?.slot ?? "").trim().toLowerCase() === "attack") {',
    to: "  if (false) {",
    breaks: "D2b — Wellspring raises the ally's DB instead of their attack"
  },

  /* ── S: the defence axis ───────────────────────────────────────── */
  {
    file: F,
    name: "S1 the alignment axis is never read from an entry",
    from: "  const sourceAlignments = list(raw.when?.sourceAlignments);",
    to: "  const sourceAlignments = [];",
    breaks: "D10b/D11b — the axis is authored and silently dropped"
  },
  {
    file: F,
    name: "S2 an alignment-scoped entry applies to everyone",
    from: "    if (entry.sourceAlignments.length && !entry.sourceAlignments.some((a) => alignments.includes(a))) return false;",
    to: "    ;",
    breaks: "D13 — Radiant Aegis raises DB against every attacker alive"
  },
  {
    file: F,
    name: "S3 an unscoped entry becomes legal",
    from: "  if (!actions.length && !sourceTypes.length && !sourceUuids.length && !sourceAlignments.length) return null;",
    to: "  if (false) return null;",
    breaks: "D11 — the guard this file's header calls a much larger claim"
  },

  /* ── E: is it REACHED? ─────────────────────────────────────────── */
  {
    file: W,
    name: "E1 the defence channel stops being told who is attacking",
    from: 'defenceDCBonus(targetActor, "defence", "", attackerTypes, actor?.uuid ?? "", attackerAlignments)',
    to: 'defenceDCBonus(targetActor, "defence", "", attackerTypes, actor?.uuid ?? "")',
    breaks: "E1 — the axis exists, the entry exists, and nothing ever matches"
  },
  {
    file: W,
    name: "E2 the attack bonus is computed and thrown away",
    from: "  if (auraAttack) modifiers.push(auraAttack);",
    to: "  ;",
    breaks: "E2b — Cutting Words' original failure: a modifier that goes nowhere"
  },
  {
    file: W,
    name: "E3 the alignments are read off the defender instead of the attacker",
    from: "  const attackerAlignments = alignedTraitsOf(actor.system ?? {});",
    to: "  const attackerAlignments = alignedTraitsOf(targetActor?.system ?? {});",
    breaks: "E1b — the wrong side of the exchange decides whether the bonus applies"
  },
  {
    file: W,
    name: "E4 disabled aura effects still grant their bonus",
    from: "        .filter((e) => !e.disabled)",
    to: "        .filter(() => true)",
    breaks: "E3 — an aura that ended keeps helping"
  },

  /* ── V: the warp that charged for nothing (3.446.1) ────────────── */
  {
    // THE DEFECT. The emanation record carries the raw pack rows again,
    // so seven live emanations take the PP and place the printed value.
    file: C,
    name: "V1 THE DEFECT: a live emanation ignores the bonus warp again",
    // THE FIRST VERSION OF THIS MUTATION SURVIVED, and the check was at
    // fault: it matched the arithmetic inline in the cast's argument
    // list, which the mutation left visible in the untaken branch. The
    // rule became a named function; this now removes the call.
    from: "        effects: warpedEmanationEffects(liveEmanationEffects(spellData), warpMods),",
    to: "        effects: liveEmanationEffects(spellData).map((e) => ({ ...e })),",
    breaks: "F6g — Bless, Bane and five others charge to raise a bonus that never moves"
  },
  {
    file: SW,
    name: "V2 a penalty is warped towards zero instead of away",
    from: "  let value = from + sign * added;",
    to: "  let value = from + added;",
    breaks: "F5d — Bane's -1 becomes 0 when the caster pays to deepen it"
  },
  {
    file: SW,
    name: "V3 the cap clamps the raw value rather than its magnitude",
    from: "    value = sign * Math.min(Math.abs(value), Math.abs(Number(warpBonusMax) || 0));",
    to: "    value = Math.min(value, Number(warpBonusMax) || 0);",
    breaks: "F5e — Bane's \"max -4\" becomes a floor and hands the target a bonus"
  },
  {
    file: SW,
    name: "V4 an uncapped warp is capped at zero",
    from: "  if (warpBonusMax !== null && warpBonusMax !== undefined) {",
    to: "  if (true) {",
    breaks: "F5f — Inspire Courage's uncapped +1 collapses"
  },
  {
    file: E2,
    name: "V5 the ordinary applier grows its own copy of the arithmetic",
    from: "          const value = warpedBonusValue(Number(effect.value) || 0, warpBonus, warpBonusMax);",
    to: "          const value = (Number(effect.value) || 0) + warpBonus;",
    breaks: "F6b — two places doing one sum, and the sign rule is what drifts"
  },

  {
    file: SW,
    name: "V6 the warped rows are the pack's own objects",
    from: "    if (effect?.kind !== \"bonus\") return { ...effect };",
    to: "    if (effect?.kind !== \"bonus\") return effect;",
    breaks: "F6e — the emanation record outlives the cast and would write a warp into pack data"
  },
  {
    file: SW,
    name: "V7 every row is treated as a bonus",
    from: "    if (effect?.kind !== \"bonus\") return { ...effect };",
    to: "    if (false) return { ...effect };",
    breaks: "F6c — Luminance's perTurn heal grows a `value` it never had"
  },

  /* ── N: the number ─────────────────────────────────────────────── */
  {
    file: O,
    name: "N1 two auras stack instead of the larger winning",
    from: "    if (!best || value > best.value) {",
    to: "    if (true) {",
    breaks: "D8 — a status bonus that stacks is not a status bonus"
  },
  {
    file: O,
    name: "N2 a zero or negative record still grants something",
    from: "    if (value <= 0) continue;",
    to: "    ;",
    breaks: "D5/D6 — an empty aura printed as a bonus"
  },
  {
    file: O,
    name: "N3 the bonus stops being status typed",
    from: '        type: String(record?.type ?? "status")',
    to: '        type: "untyped"',
    breaks: "D7 — Appendix 1 stops governing two auras over one fighter"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([O, D, A, E, F, W, C, SW, E2, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-opposed-aura: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-opposed-aura: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-opposed-aura: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
