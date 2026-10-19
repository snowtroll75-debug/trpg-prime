#!/usr/bin/env node
/**
 * mutate-defence-vocabulary — can verify-defence-vocabulary fail?
 *
 * NEW at 3.548.0, beside the verify.
 *
 * THE PAIRS ARE THE POINT, and this release needed them badly: every
 * rule it repaired had a passing test at each end and nothing in the
 * middle. So the mutations come in opposing sets.
 *
 * D1 AND D1b pull against each other — an area effect must trigger an
 * area weakness and a targeted blow must not. "Every packet is weak"
 * satisfies the first; the shipped behaviour, where the word never
 * resolved and nothing was ever weak, satisfies the second.
 *
 * C1 AND C1d do the same for the critical: keeping the severity must not
 * become "critical on everything".
 *
 * W1 IS DIFFERENT IN KIND. It reads source rather than behaviour, so its
 * mutation deletes a call-site argument rather than a rule. That is the
 * only shape of check that could have caught what actually shipped —
 * a producer and a consumer with no wire between them.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const F = path.join(SYSTEM_ROOT, "module", "defences.mjs");
const D = path.join(SYSTEM_ROOT, "module", "combat", "damage.mjs");
const A = path.join(SYSTEM_ROOT, "module", "combat", "attack.mjs");
const AW = path.join(SYSTEM_ROOT, "module", "combat", "attack-workflow.mjs");
const O = path.join(SYSTEM_ROOT, "module", "combat", "opportunity-rules.mjs");
const S = path.join(SYSTEM_ROOT, "module", "magic", "spell-source.mjs");
const CW = path.join(SYSTEM_ROOT, "module", "magic", "cast-workflow.mjs");
const V = path.join(SYSTEM_ROOT, "tools", "verify-defence-vocabulary.mjs");

const MUTATIONS = [
  {
    file: AW,
    name: "W4b THE IMMUNITY LINE CLAIMS NO CRITICAL AGAIN — what shipped until 3.576.0",
    from: "— a critical still adds its bonus damage dice, but no critical injury is rolled.</em>",
    to: "— no critical can be scored.</em>",
    breaks: "W4b — the card contradicts itself two lines apart, as it did on the 3.575.0 live test"
  },
  {
    file: F,
    name: "A1 THE BESTIARY LONGHAND LOSES ITS ALIAS — what shipped",
    from: '  "critical hits": IMMUNITY_TOKENS.critical,',
    to: '  "critical hitsX": IMMUNITY_TOKENS.critical,',
    breaks: "A1/U1/U3 — ten swarms go back to declaring an immunity that resolves to "
      + "nothing while the identical trait-granted one works"
  },
  {
    file: F,
    name: "A2 divine STOPS MEANING divinity",
    from: "  divine: \"divinity\",",
    to: "  divineX: \"divinity\",",
    breaks: "A5/U4 — five undead go back to a weakness no divinity spell can trigger"
  },
  {
    file: F,
    name: "A3 EVERY UNKNOWN WORD BECOMES A TOKEN",
    from: "  if (DEFENCE_TOKENS.includes(lower)) tokens.push(lower);",
    to: "  if (lower) tokens.push(lower);",
    breaks: "A9 — \"bananas\" and \"necromancy\" would resolve, and the one entry Graham "
      + "ruled is wrong would stop being reported"
  },
  {
    file: F,
    name: "N1 THE TRAILING NUMBER IS NOT STRIPPED — what shipped",
    from: "  const valued = TRAILING_VALUE.exec(rawInput);",
    to: "  const valued = null;",
    breaks: "N1/N1b — \"physical 5\" goes back to resolving to nothing, and the sheet's "
      + "own placeholder goes on inviting it"
  },
  {
    file: F,
    name: "N1c EVERY ENTRY REPORTS A PHANTOM VALUE",
    from: "  const ignoredValue = valued ? Number(valued[2]) : null;",
    to: "  const ignoredValue = valued ? Number(valued[2]) : 0;",
    breaks: "N1c — \"fire\" would report an ignored value of 0, so the sheet would warn "
      + "about a number nobody typed; N1b alone would call that a pass"
  },
  {
    file: F,
    name: "E1 AN EMPTY EXCEPTION LIST STILL MATCHES",
    from: "      matched: except.length > 0",
    to: "      matched: true",
    breaks: "E1c — \"all damage except wibble\" would resist everything, silently widening "
      + "the resistance to the opposite of what the record says"
  },
  {
    file: F,
    name: "P1 death effects QUIETLY GAINS A MECHANISM",
    from: "  if (PRINTED_DEFENCES[lower]) printed.push(lower);",
    to: "  if (PRINTED_DEFENCES[lower]) damageTypes.push(lower);",
    breaks: "P1b — it would look like a fifteenth damage type to every consumer, which is "
      + "exactly the mistake \"mundane\" made before 3.547.0"
  },
  {
    file: F,
    name: "T3 A TYPED TOKEN NO LONGER JOINS THE INHERITED SET — what shipped",
    from: "  for (const token of resolved.tokens ?? []) resolved.damageTypes.add(token);",
    to: "",
    breaks: "U1 — the Ooze whose critical immunity is TYPED and the Swarm whose is "
      + "INHERITED would behave differently while reading identically"
  },
  {
    file: D,
    name: "D1 AN AREA WEAKNESS NEVER APPLIES — what shipped",
    from: "  const sourceWeak = (area && has(weaknessSources, \"area\"))\n    || (targeted && has(weaknessSources, \"targeted\"));",
    to: "  const sourceWeak = false;",
    breaks: "D1 — the Swarm's printed Weakness goes back to being prose"
  },
  {
    file: D,
    name: "D1b THE SOURCE WEAKNESS IGNORES THE SOURCE",
    from: "  const sourceWeak = (area && has(weaknessSources, \"area\"))\n    || (targeted && has(weaknessSources, \"targeted\"));",
    to: "  const sourceWeak = weaknessSources.length > 0;",
    breaks: "D1b/D2c — a swarm would be weak to the blade as well as the fireball; D1 "
      + "alone would call that a pass"
  },
  {
    file: D,
    name: "D2 A TARGETED RESISTANCE NEVER APPLIES",
    from: "  const sourceResisted = !bypassed && (\n    (area && has(resistanceSources, \"area\"))\n    || (targeted && has(resistanceSources, \"targeted\")));",
    to: "  const sourceResisted = false;",
    breaks: "D2 — six creatures go back to a resistance that halves nothing"
  },
  {
    file: D,
    name: "D3 THE TRAIT WEAKNESS IGNORES THE SOURCE'S TRAITS",
    from: "  const traitWeak = traitMatch(weaknessTraits, sourceTraits);",
    to: "  const traitWeak = weaknessTraits.length ? \"divinity\" : null;",
    breaks: "D3b — an arcane fireball would trigger a divine weakness; D3 alone would "
      + "call that a pass"
  },
  {
    file: D,
    name: "D4 THE EXCEPTION LIST IS IGNORED",
    from: "  const excepted = has(resistanceExcept, type);",
    to: "  const excepted = false;",
    breaks: "D4 — the Human Ghost's force exception vanishes and force is halved like "
      + "everything else"
  },
  {
    file: D,
    name: "D4b THE EXCEPTION CANCELS THE WHOLE RESISTANCE",
    from: "  const excepted = has(resistanceExcept, type);",
    to: "  const excepted = resistanceExcept.length > 0;",
    breaks: "D4b — naming one exception would except every type; D4 alone would call "
      + "that a pass"
  },
  {
    file: D,
    name: "D5 NON-MAGICAL IMMUNITY NEVER FIRES — what shipped",
    from: '  const nonMagicalImmune = has(immunities, "non-magical") && !magical && !incorporealTouch;',
    to: "  const nonMagicalImmune = false;",
    breaks: "D5 — every Incorporeal creature goes back to taking full damage from an "
      + "ordinary blade, which is the one thing the trait exists to prevent"
  },
  {
    file: D,
    name: "D5b NON-MAGICAL IMMUNITY IGNORES THE SOURCE",
    from: '  const nonMagicalImmune = has(immunities, "non-magical") && !magical && !incorporealTouch;',
    to: '  const nonMagicalImmune = has(immunities, "non-magical") && !incorporealTouch;',
    breaks: "D5b — a ghost would be immune to a fireball too; D5 alone would call that "
      + "a pass"
  },
  {
    file: A,
    name: "C1 CRITICAL IMMUNITY ERASES THE CRITICAL AGAIN — what shipped",
    from: "  const critical = criticalRolled\n    ? { ...criticalRolled, injuryImmune: Boolean(criticalImmune) }\n    : null;",
    to: "  const critical = criticalImmune ? null : criticalRolled;",
    breaks: "C1/C1b/C1c — a Deadly critical against a Swarm loses its 3 bonus dice as "
      + "well as its injury, against Graham's ruling that the HP damage still lands"
  },
  {
    file: A,
    name: "C1c THE INJURY FLAG IS NEVER SET",
    from: "    ? { ...criticalRolled, injuryImmune: Boolean(criticalImmune) }",
    to: "    ? { ...criticalRolled, injuryImmune: false }",
    breaks: "C1c — the injury table would be rolled against a creature immune to it, "
      + "instant-kill results included; C1 alone would call that a pass"
  },
  {
    file: AW,
    name: "C2 THE INJURY ROLL IS NO LONGER GATED",
    // 3.650.0: the gate also stands down for a critical replacement.
    from: "  if (strikeLands && outcome.critical && !outcome.critical.injuryImmune && !injuryReplaced) {",
    to: "  if (strikeLands && outcome.critical && !injuryReplaced) {",
    breaks: "the workflow half of C1c — the flag would be set and ignored, which is this "
      + "release's own defect wearing a new coat"
  },
  {
    file: AW,
    name: "P2 PRECISION DICE IGNORE THE IMMUNITY — what shipped",
    from: "  const precisionImmune = Boolean(\n    damageTargetDefences?.immunities?.has?.(IMMUNITY_TOKENS.precision));",
    to: "  const precisionImmune = false;",
    breaks: "W-class — Sneak Attack and Precision Hunter go back to landing in full on "
      + "swarms and ghosts, the two creatures the immunity exists for"
  },
  {
    file: AW,
    name: "W2 THE BYPASS MATERIALS STOP BEING PASSED — what shipped at 3.547.1",
    from: "      resistanceBypassMaterials: targetDefences.resistanceBypassMaterials,",
    to: "",
    breaks: "W2 — \"mundane (silver)\" goes back to halving a silver weapon, a rule with "
      + "a producer and a consumer and no wire between them"
  },
  {
    file: AW,
    name: "W3 A STRIKE STOPS DECLARING ITSELF TARGETED",
    from: "      targeted: true,",
    to: "      targeted: false,",
    breaks: "W3/D2 — a swarm's resistance to targeted attacks would never meet a targeted "
      + "attack, because the one path that makes an attack roll would not say so"
  },
  {
    file: O,
    name: "M1 THE MOVEMENT IMMUNITY IS IGNORED — what shipped",
    from: "  if (moverImmune) return false;",
    to: "",
    breaks: "M1 — ten swarms go back to provoking an Attack of Opportunity for leaving a "
      + "threatened square, which is the fourth of the four immunities their trait grants"
  },
  {
    file: O,
    name: "M1b NOTHING PROVOKES AT ALL",
    from: "  if (moverImmune) return false;",
    to: "  return false;",
    breaks: "M1b/M1c — every move in the game would stop provoking; M1 alone would call "
      + "that a pass"
  },
  {
    file: S,
    name: "S1 A SPELL STOPS BEING A MAGICAL SOURCE — what shipped",
    from: "    magical: true,",
    to: "    magical: false,",
    breaks: "S1 — mundane resistance goes back to halving a fireball exactly as it halves "
      + "a thrown rock, on twenty creatures"
  },
  {
    file: S,
    name: "S2 EVERY SPELL BECOMES AN AREA",
    from: "  return Boolean(String(spell?.system?.area ?? \"\").trim());",
    to: "  return true;",
    breaks: "S2b — a single-target spell would trigger a swarm's area weakness; S2 alone "
      + "would call that a pass"
  },
  {
    file: path.join(SYSTEM_ROOT, "module", "combat", "damage-workflow.mjs"),
    name: "S5 THE WORKFLOW DROPS THE DESCRIPTOR'S TRAITS AGAIN — what 3.548.1 shipped",
    from: "    sourceTraits: sourceTraits ?? traits,",
    to: "    sourceTraits: traits,",
    breaks: "S5c — the exact live defect: spellDamageSource emits `sourceTraits`, the "
      + "workflow reads `traits`, and every spell's tradition and school fall between "
      + "the two layers. A Shadow weak to divine takes 10 from a divinity spell, not 15"
  },
  {
    file: path.join(SYSTEM_ROOT, "module", "combat", "damage-workflow.mjs"),
    name: "S5b THE WORKFLOW STOPS ACCEPTING THE CANONICAL NAME",
    from: "  sourceTraits = null,",
    to: "",
    breaks: "S5 — the descriptor would emit a key the signature does not destructure, "
      + "which is the shape mismatch itself rather than its symptom"
  },
  {
    file: S,
    name: "SC3 THE SPELL'S OWN TRAITS STOP TRAVELLING — the school with them",
    from: "    ...words(spell?.system?.traits),",
    to: "",
    breaks: "SC3/S3b — a school-scoped weakness could never match, because all eight "
      + "schools ride on `system.traits` and that is the field that would stop making "
      + "the trip"
  },
  {
    file: S,
    name: "S3 THE TRADITION STOPS TRAVELLING WITH THE DAMAGE",
    from: "    ...words(spell?.system?.tradition)",
    to: "",
    breaks: "S3 — a divine weakness could never match, because `divinity` lives on the "
      + "tradition field and the traits field is the only one that would make the trip"
  },
  {
    file: CW,
    name: "W1 THE SPELL ATTACK PATH STOPS DECLARING ITSELF",
    /*
     * RE-ANCHORED AT 3.595.0, NOT WEAKENED. The vs-trait damage packet
     * (Searing Ray's holy half) declares its source the same way, so the
     * old one-line anchor matched twice and the mutation refused to run.
     * Anchored by what FOLLOWS the main packet — `let newHP = null;` — so
     * the mutation still removes `targeted: true` from the spell attack's
     * own packet and nothing else. A weaker mutation that changed some other
     * line would have reported itself caught while testing nothing.
     */
    // AND AT 3.617.0: the Bracers' drain now sits between the packet and
    // `let newHP` (R17 of block 37), so it is the anchor's tail instead.
    from: "    ...spellDamageSource(spell, { targeted: true })\n  });\n  // Bracers of Armour absorb what their DR stopped (3.617.0, R17).\n  const bracersLine = await drainBracers(targetActor, packet);",
    to: "    magical: true\n  });\n  // Bracers of Armour absorb what their DR stopped (3.617.0, R17).\n  const bracersLine = await drainBracers(targetActor, packet);",
    breaks: "W3-class/S4 — the spell attack would be magical but not targeted, so a "
      + "swarm's resistance to targeted attacks would miss every spell attack in the game"
  }
];

function run() {
  try { execFileSync(process.execPath, [V], { stdio: "pipe" }); return true; }
  catch { return false; }
}

const guard = guardFiles([F, D, A, AW, O, S, CW, V]);
const results = [];
try {
  if (!run()) {
    process.stderr.write("mutate-defence-vocabulary: verify already fails on an unmodified tree.\n");
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
  process.stdout.write(`  ${r.state === "caught" ? "✓" : "✗"} ${r.state.padEnd(14)} ${r.name}\n`);
  if (r.state === "SURVIVED") process.stdout.write(`      would break: ${r.breaks}\n`);
}
if (bad.length) {
  process.stdout.write(`mutate-defence-vocabulary: FAILED — ${bad.length} of ${results.length}\n`);
  process.exit(1);
}
process.stdout.write(`mutate-defence-vocabulary: OK — ${results.length} mutations, all caught.\n`);
