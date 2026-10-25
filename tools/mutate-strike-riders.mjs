#!/usr/bin/env node
/**
 * mutate-strike-riders — can verify-strike-riders fail? NEW at 3.437.0.
 *
 * THE REACHABILITY MUTATIONS ARE THE POINT (R1–R5). 3.435.0 shipped a
 * Luminance that healed nobody with every check green, because nothing
 * asked whether the mechanism was reached. R1 deletes the call outright
 * and R2 reverses the read/spend order — the two shapes that would
 * produce three PP 1 spells that apply cleanly and deal nothing.
 *
 * AND R1 IS AIMED AT THIS FILE'S OWN READER AS MUCH AS AT THE CODE. The
 * name `strikeRiderPackets` survives R1 in the import line at the top of
 * attack-workflow.mjs. A check anchored on the bare name, or scoped to
 * the whole file, would still pass — which is the import-position trap
 * that has now been met seven times, twice inside checks written knowing
 * about it. If R1 ever reports SURVIVED, that trap has been walked into
 * for the eighth.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const SR = path.join(SYSTEM_ROOT, "module", "magic", "strike-riders.mjs");
const WF = path.join(SYSTEM_ROOT, "module", "magic", "strike-riders-workflow.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const FX = path.join(SYSTEM_ROOT, "module", "magic", "spell-effects.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-strike-riders.mjs");

const MUTATIONS = [
  /* ── R: is it REACHED? ─────────────────────────────────────────── */
  {
    file: AW,
    name: "R1 the damage loop stops asking for rider packets",
    // RE-ANCHORED AT 3.465.0: the loop grew a third source (area riders),
    // so the mutation removes the rider term from the new spelling.
    from: "...strikeRunes.filter((r) => !r.addsToStrike), ...strikeRiderPackets(actor, weapon, riderCtx), ...areaPackets",
    to: "...strikeRunes.filter((r) => !r.addsToStrike), ...areaPackets",
    breaks: "F1/F2 — 3.435.0 exactly: three spells apply cleanly and deal nothing, and the "
      + "name still appears in the import at the top of the file"
  },
  {
    file: AW,
    name: "R2 the spend happens before the loop reads",
    from: "    for (const riderLine of await applyRiderConditions(actor, weapon, targetActor, riderCtx)) {",
    to: "    for (const spentLine of await spendStrikeRiders(actor, weapon, { ctx: riderCtx })) { lines.push(line(spentLine)); }\n"
      + "    for (const riderLine of await applyRiderConditions(actor, weapon, targetActor, riderCtx)) {",
    breaks: "F5/F6 — the effect is deleted before the packets that describe it are rolled"
  },
  {
    file: AW,
    name: "R3 a miss stops spending the arrow",
    from: "  const spentOnMiss = await spendStrikeRiders(actor, weapon, { hit: false });",
    to: "  const spentOnMiss = [];",
    breaks: "F7 — a player misses all day on one PP"
  },
  {
    file: AW,
    name: "R4 the rider's condition stops landing",
    from: "    for (const riderLine of await applyRiderConditions(actor, weapon, targetActor, riderCtx)) {",
    to: "    for (const riderLine of []) {",
    breaks: "F3 — Spoil The Profane's weakened 1 is never applied"
  },
  {
    file: AW,
    name: "R5 the miss-path spend moves ahead of the damage step",
    from: "  const spentOnMiss = await spendStrikeRiders(actor, weapon, { hit: false });",
    to: "  ;",
    breaks: "F7"
  },

  /* ── N: what a rider IS ────────────────────────────────────────── */
  {
    file: SR,
    name: "N1 a formula nobody checked reaches the roller",
    // RE-ANCHORED 3.613.0: a weapon-die rider (Weapon Surge) is exempt.
    // RE-ANCHORED 3.630.0: a condition-only rider (Rose of Thorns) is exempt too.
    // RE-ANCHORED 3.668.0: a declared flat rider (Ember Reaver) has its own pattern.
    from: "  if (!weaponDie && !conditionOnly && !(flat ? FLAT_PATTERN.test(dice) : isRiderDice(dice))) return null;",
    to: "  if (false) return null;",
    breaks: "B3/B4 — '1d6+1' throws at strike time or rolls something else"
  },
  {
    file: SR,
    name: "N2 an empty damage type is accepted",
    // RE-ANCHORED 3.613.0: a weapon-die rider (Weapon Surge) is exempt.
    from: "  if (!weaponDie && !conditionOnly && !damageType) return null;",
    to: "  if (false) return null;",
    breaks: "B5 — the rune meaning of an empty type is 'the weapon's own', inherited silently"
  },
  {
    file: SR,
    name: "N3 an unknown scope is accepted",
    from: "  if (!RIDER_SCOPES.includes(scope)) return null;",
    to: "  if (false) return null;",
    breaks: "B6 — a scope that can never match, silently"
  },
  {
    file: SR,
    name: "N4 a conditional rider need not say what against",
    from: "  if (conditional && !against) return null;",
    to: "  if (false) return null;",
    breaks: "B8 — the card prints 'extra damage against .' and names nothing"
  },
  {
    file: SR,
    name: "N5 the round trip breaks — a stored spec no longer reads back",
    from: "    once: oncePerRound ? false : raw.once !== false,",
    to: "    once: oncePerRound ? false : raw.once === true,",
    breaks: "B10/B12 — held-bonus.mjs shipped this defect; Talon Strike would become a one-shot "
      + "the second time its own flag was read"
  },
  {
    file: SR,
    name: "N6 a condition value appears where no condition was named",
    from: "  const conditionValue = condition\n    ? Math.max(1, Math.trunc(Number(raw.conditionValue ?? 1)) || 1)\n    : 0;",
    to: "  const conditionValue = Math.max(1, Math.trunc(Number(raw.conditionValue ?? 1)) || 1);",
    breaks: "B11 — inferred rather than declared"
  },

  /* ── S: what a rider REACHES ───────────────────────────────────── */
  {
    file: SR,
    name: "S1 a ranged rider reaches melee weapons",
    from: '  if (spec.scope === "ranged" && !ranged) return false;',
    to: "  if (false) return false;",
    breaks: "C2 — Arrow Of The Wild Hunt fires off a sword"
  },
  {
    file: SR,
    name: "S2 a melee rider reaches missile weapons",
    from: '  if (spec.scope === "melee" && ranged) return false;',
    to: "  if (false) return false;",
    breaks: "C3"
  },
  {
    file: SR,
    name: "S3 a weapon-scoped rider stops being scoped to its weapon",
    from: '    if (spec.weaponId !== String(weapon.weaponId ?? "")) return false;',
    to: "    if (false) return false;",
    breaks: "C6 — Talon Strike arms every weapon the character owns"
  },
  {
    file: SR,
    name: "S4 an unbound weapon-scoped rider arms everything",
    from: "    if (!spec.weaponId) return false;",
    to: "    if (false) return false;",
    breaks: "C7 — a cancelled weapon prompt enchants the whole armoury for a minute"
  },
  {
    file: SR,
    name: "S5 'missile' stops meaning ranged",
    from: '  const ranged = String(weapon.attackMode ?? "melee") === "missile";',
    to: '  const ranged = String(weapon.attackMode ?? "melee") === "ranged";',
    breaks: "C1/C2 — the books say ranged, the weapon says missile, and only one of them is data"
  },

  /* ── P: the packet's shape ─────────────────────────────────────── */
  {
    file: SR,
    name: "P1 the packet loses a field the rune loop reads",
    from: "    secondaryCritical: null,",
    to: "",
    breaks: "D1/D3 — the loop reads undefined off a rider"
  },
  {
    file: SR,
    name: "P2 a rider is granted a secondary critical",
    from: "    secondaryCritical: null,",
    to: "    secondaryCritical: -40,",
    breaks: "D3 — a critical the book never gave these spells"
  },
  {
    file: SR,
    name: "P3 the conditional flag stops flowing to the packet",
    from: "    conditional: spec.conditional,",
    to: "    conditional: false,",
    breaks: "D6/D7 — Spoil's 1d6 is applied to every target, aura or no aura"
  },
  {
    file: SR,
    name: "P4 the packet forgets what it is conditional against",
    from: "    against: spec.against,",
    to: '    against: "",',
    breaks: "D7 — the card names nothing the table can act on"
  },
  {
    file: SR,
    name: "P5 the die is dropped from the packet",
    // RE-ANCHORED 3.613.0: the weapon's own die is chosen first.
    from: "    dice: own ? own.dice : spec.dice,",
    to: '    dice: own ? own.dice : "",',
    breaks: "D2/D9"
  },

  /* ── E: spending ───────────────────────────────────────────────── */
  {
    file: SR,
    name: "E1 a duration rider is spent by one Strike",
    from: "    .filter((spec) => spec?.once && riderAppliesTo(spec, weapon))",
    to: "    .filter((spec) => riderAppliesTo(spec, weapon))",
    breaks: "E3 — Talon Strike ends after one blow instead of one minute"
  },
  {
    file: SR,
    name: "E2 a rider is spent by a Strike it did not reach",
    from: "    .filter((spec) => spec?.once && riderAppliesTo(spec, weapon))",
    to: "    .filter((spec) => spec?.once)",
    breaks: "E2 — drawing a sword burns the enchanted arrow"
  },
  {
    file: WF,
    name: "E3 a disabled effect still carries its rider",
    from: "    if (effect.disabled) continue;",
    to: "    if (false) continue;",
    breaks: "H1 — a GM switches it off and it keeps happening"
  },
  {
    file: WF,
    name: "E4 a failed delete swallows the report",
    from: "    lines.push(`<em>${spec.label} is spent.</em>`);",
    to: "",
    breaks: "H4 — the card says nothing about a rider it just spent"
  },

  /* ── A: the applier ────────────────────────────────────────────── */
  {
    file: FX,
    name: "A1 the applier accepts a malformed rider",
    // RE-ANCHORED 3.613.0: the call spans lines (the condition warp, R12's die).
    from: "              : {})\n          });\n          if (!spec) {",
    to: "              : {})\n          }) ?? effect;\n          if (false) {",
    breaks: "G1 — a spell grants an unusable rider and says nothing"
  },
  {
    file: FX,
    name: "A2 warping stops reaching the die",
    // RE-ANCHORED 3.613.0: a weapon-die rider takes no dice; the rest still add.
    // RE-ANCHORED 3.630.0: a condition-only rider has no dice for a warp to grow.
    from: "            dice: effect.weaponDie || !effect.dice ? \"\" : addDice(effect.dice, warpDice),",
    to: "            dice: effect.weaponDie || !effect.dice ? \"\" : effect.dice,",
    breaks: "G2 — Spoil The Profane's +2 PP buys nothing"
  },
  {
    file: FX,
    name: "A3 a weapon-scoped rider is applied with no weapon",
    from: "            if (!spec.weaponId) {",
    to: "            if (false) {",
    breaks: "G4 — a cancelled prompt silently arms nothing and says it armed something"
  },
  {
    file: FX,
    name: "A4 the weapon prompt is never asked",
    from: "            spec.weaponId = (await promptRiderWeapon(target, spell.name)) ?? \"\";",
    to: '            spec.weaponId = "";',
    breaks: "G3"
  },
  {
    file: FX,
    name: "A5 the effect is written under a flag nothing reads",
    from: "          const riderFlags = { [SYSTEM_ID]: { [STRIKE_RIDER_FLAG]: spec } };",
    to: '          const riderFlags = { [SYSTEM_ID]: { strikeRiderSpec: spec } };',
    breaks: "G6 — the applier and the strike path stop agreeing on where the rider lives"
  },

  /* ── G: the pre-cast gate (3.438.0) ────────────────────────────── */
  {
    file: CW,
    name: "G1 the cast stops asking the weapon gate",
    from: "  if (!weaponRiderGate(actor, spellData, spell.name)) return null;",
    to: "  ;",
    breaks: "K7 — and the name survives in the import at the top of cast-workflow.mjs, "
      + "which is what a whole-file check would have been satisfied by"
  },
  {
    // THE 3.437.0 DEFECT ITSELF, and the mutation that found a hole in
    // this file's first draft. The gate is still called, still warns, and
    // the cast carries on to charge for it — which K7 ("the call is
    // there") and K8b ("it is above the debit") BOTH survive. K8 was
    // written because this survived.
    file: CW,
    name: "G2 the gate warns but no longer aborts the cast",
    from: "  if (!weaponRiderGate(actor, spellData, spell.name)) return null;",
    to: "  weaponRiderGate(actor, spellData, spell.name);",
    breaks: "K8 — the refusal fires and the PP is gone, which is exactly what the live pass saw"
  },
  {
    // A SELF-TEST OF THE ORDERING CLAIM rather than a plausible edit: it
    // puts the debit's own token above the gate so K8b's `before` goes
    // false. Kept because an ordering claim nobody has seen fail is an
    // ordering claim nobody has tested — §"a mutation runner must prove
    // its harness green before it breaks anything", applied to the
    // assertion instead of the tree.
    file: CW,
    name: "G2b the ordering claim itself can go red",
    from: "  if (!weaponRiderGate(actor, spellData, spell.name)) return null;",
    to: "  void (ppPool - casterPPSpent);\n  if (!weaponRiderGate(actor, spellData, spell.name)) return null;",
    breaks: "K8b — proof the 'before the debit' claim is live and not vacuous"
  },
  {
    file: SR,
    name: "G3 the gate starts speaking for riders aimed at other people",
    from: '    if (String(row?.target ?? "") !== "self") continue;',
    to: "    if (false) continue;",
    breaks: "K3 — it becomes a second copy of the applier's refusal, and neither ends up tested"
  },
  {
    file: SR,
    name: "G4 a malformed row is gated as though it were a missing weapon",
    from: "    const spec = normaliseStrikeRider(row);\n    if (spec?.weaponScoped) return spec;",
    to: "    if (row?.weaponScoped) return row;",
    breaks: "K4 — the cast is refused for the wrong fault"
  },
  {
    file: SR,
    name: "G5 every rider gates the cast, weapon-scoped or not",
    from: "    if (spec?.weaponScoped) return spec;",
    to: "    if (spec) return spec;",
    breaks: "K2 — Arrow Of The Wild Hunt is refused for lacking a weapon it never needed"
  },
  {
    file: FX,
    name: "G6 the applier goes back to restating the gate's claim",
    from: "                `<em>No weapon was chosen for ${spell.name} to enchant on ${target.name} — nothing applied.</em>`));",
    to: "                `<em>${target.name} is wielding no weapon for ${spell.name} to enchant — nothing applied.</em>`));",
    breaks: "K10 — two copies of one rule, and cast-workflow.mjs records what that costs"
  },

  /* ── C: what the cast card says ────────────────────────────────── */
  {
    file: SR,
    name: "C1 a conditional rider is announced as applied damage",
    from: "  const rider = spec.conditional\n    ? `<strong>${spec.dice} ${spec.damageType}</strong> on ${when}`\n      + ` <em>against ${spec.against}</em> — printed on the strike card for you to apply`\n    : `<strong>+${spec.dice} ${spec.damageType}</strong> on ${when}`;",
    to: "  const rider = `<strong>+${spec.dice} ${spec.damageType}</strong> on ${when}`;",
    breaks: "J1 — the card promises automation the spell does not have"
  },
  {
    file: SR,
    name: "C2 the condition drops off a conditional rider's cast line",
    from: "  if (!spec.condition) return rider;",
    to: "  if (spec.conditional || !spec.condition) return rider;",
    breaks: "J2 — Spoil applies weakened and never says so (the defect this file found)"
  },
  {
    file: SR,
    name: "C3 a duration rider is announced as a one-shot",
    from: "  const when = spec.once ? `your next ${where}` : `every ${where} with it`;",
    to: "  const when = `your next ${where}`;",
    breaks: "J3 — Talon Strike reads as spent after one blow"
  }
];

function run() {
  try { execFileSync(process.execPath, [CHECK], { stdio: ["ignore", "pipe", "pipe"] }); return true; }
  catch { return false; }
}

const guard = guardFiles([SR, WF, AW, FX, CW, CHECK]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-strike-riders: verify already fails on an unmodified tree.\n");
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
  ? `\nmutate-strike-riders: FAILED — ${bad.length} of ${results.length} not caught.\n`
  : `\nmutate-strike-riders: OK — all ${results.length} mutations caught, tree restored.\n`);
process.exit(bad.length ? 1 : 0);
