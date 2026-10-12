#!/usr/bin/env node
/**
 * verify-defence-vocabulary — the bestiary's words, and the rules behind them.
 *
 * NEW at 3.548.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT WAS MEASURED, 10 September 2026.
 *
 * 3.547.1 closed the template framework's vocabulary and I reported nine
 * words still unresolved in the creature records. THAT COUNT WAS WRONG
 * IN BOTH DIRECTIONS: I had listed six, and the real figure was fourteen.
 * The miss came from scanning `system.combat.*` on the actor documents,
 * which are un-templated; the words live in the `inherited traits`
 * ActiveEffects, whose `changes` write those very fields at runtime. The
 * same lesson as the framework itself — the pack is not the source of
 * truth — applied one level further in and I had not followed it.
 *
 * Measured properly, across 1,240 defence-writing ActiveEffect changes:
 *
 *   death effects        17     mental effects                    4
 *   critical hits        10     necromancy                        2
 *   reactions provoked                                            2
 *     by movement        10     all damage except essence or force
 *   area damage          10     nonlethal                         2
 *   critical              8     physical 5                        1
 *   precision damage      8     fire 5                            1
 *   targeted              6
 *   divine                5
 *
 * ─────────────────────────────────────────────────────────────────────
 * AND THE WORDS WERE NEVER THE REAL DEFECT.
 *
 * Every creature carrying the four Swarm words also declares the `swarm`
 * trait, so the typed entries duplicate the trait's printed note. The
 * trait pushes tokens into the immunity set through
 * `codexTraitImmunities`, under a comment stating its defences "are
 * enforced the moment this ships, by the same code that already enforces
 * an Ooze's critical immunity".
 *
 * THREE OF THE FIVE TOKENS WERE READ BY NOTHING.
 *
 *   critical            enforced (attack-workflow)
 *   mental              enforced (a real damage type)
 *   precision           read by no one — Sneak Attack landed in full
 *   non-magical         read by no one — an ordinary blade hurt a ghost
 *   movement-reaction   read by no one — swarms provoked as normal
 *
 * A fourth wiring gap sat beside them, and it was mine, one release old:
 * `resistanceBypassMaterials` was computed in creature-traits, consumed
 * in damage.mjs, and passed by neither damage path — so 3.547.1's
 * "mundane (silver)" rule never fired. A fifth was a year older: NO
 * SPELL IN THE SYSTEM has ever set `magical`, so mundane resistance
 * halved a fireball exactly as it halves a thrown rock.
 *
 * W1-W3 are the checks that catch that class. They read the SOURCE of
 * every damage call site rather than any one rule, because a rule with
 * both ends built and no middle passes every test written about its two
 * ends.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULINGS, 10 September 2026.
 *
 *   DEATH EFFECTS  "any spell or effect that kills a target outright" —
 *                  isolated, so text only.
 *   CRITICAL HITS  the target takes the HP damage and the injury ROLL is
 *                  bypassed.
 *   AREA DAMAGE    damage from a spell or effect with an area, rather
 *                  than a targeted effect.
 *   REACTIONS PROVOKED BY MOVEMENT — a text note.
 *   DIVINE         any damage resulting from a divinity spell.
 *   TARGETED       any attack requiring an attack roll (weapon or spell).
 *   NECROMANCY     not one of TRG's EIGHT SCHOOLS; correct the data to
 *                  `soul`, whose entry reads "manipulating life and
 *                  death energies, and sometimes healing or reanimating
 *                  the deceased" — necromancy by another name.
 *   ALL DAMAGE EXCEPT X — support the longhand.
 *   A NUMBER ON AN ENTRY — strip it, and report that it did nothing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A CORRECTION I OWE THIS FILE, 10 September 2026.
 *
 * When I put the necromancy question to Graham I wrote that "TRG has no
 * schools of magic at all". IT HAS EIGHT — Alteration, Enchantment,
 * Insight, Invocation, Shadow, Soul, Translocation, Warding — they are
 * Chapter 9, they are `SPELL_SCHOOLS` in data/spell-tables.mjs, and all
 * 692 spells in the pack carry exactly one of them on `system.traits`.
 * The list sits in APPENDIX_SUB_TRAITS, under a comment naming "the
 * eight schools under SCHOOL", and I quoted that very list to him while
 * calling it something else.
 *
 * HOW: I grepped ONE file — config.mjs — found no schools in it, and
 * generalised to the system. A confident claim from an insufficient
 * measurement, which is the defect class this repository keeps naming,
 * committed inside the question that shaped a ruling.
 *
 * The ruling survives it, for a better reason than I gave. SC1-SC4 below
 * exist so the claim is measured rather than asserted next time.
 */

import fs from "node:fs";
import path from "node:path";
import {
  classifyDefence, resolveDefenceField, resolveDamageTypeField,
  IMMUNITY_TOKENS, DEFENCE_TOKENS, DEFENCE_SOURCES, PRINTED_DEFENCES, ALL_DAMAGE
} from "../module/defences.mjs";
import { actorDefences } from "../module/creature-traits.mjs";
import { resolveDamagePacket } from "../module/combat/damage.mjs";
import { attackOutcome } from "../module/combat/attack.mjs";
import { moveActionProvokes } from "../module/combat/opportunity-rules.mjs";
import { spellDamageSource, spellHasArea, spellSourceTraits } from "../module/magic/spell-source.mjs";
import { SPELL_SCHOOLS } from "../module/data/spell-tables.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

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
const json = (v) => JSON.stringify(v instanceof Set ? [...v] : v);

/* ── A: THE ALIASES ───────────────────────────────────────────────── */

equal("A1 critical hits IS THE critical TOKEN",
  json(classifyDefence("critical hits").tokens), json([IMMUNITY_TOKENS.critical]),
  "ten swarms write it longhand; the token was spelled \"critical\" and the two never met");

equal("A2 precision damage IS precision",
  json(classifyDefence("precision damage").traits), json(["precision"]),
  "eight creatures; `precision` became a defence trait at 3.547.1 and the longhand did not");

equal("A3 mental effects IS mental",
  json(classifyDefence("mental effects").damageTypes), json(["mental"]),
  "mental is a damage type AND an Appendix 3 trait — the word carried both meanings already");

equal("A4 nonlethal IS subdual",
  json(classifyDefence("nonlethal").damageTypes), json(["subdual"]),
  "subdual is the only type config.mjs flags nonlethal, so the two words name one thing");

equal("A5 divine IS divinity",
  json(classifyDefence("divine").traits), json(["divinity"]),
  "Graham: \"any damage that results from a divinity spell\" — divinity was in the "
  + "vocabulary all along as an Appendix 3 sub-trait and one of the four traditions");

equal("A6 area damage IS the area SOURCE",
  json(classifyDefence("area damage").sources), json(["area"]));
equal("A7 targeted IS the targeted SOURCE",
  json(classifyDefence("targeted").sources), json(["targeted"]));

equal("A8 reactions provoked by movement IS the movement-reaction TOKEN",
  json(classifyDefence("reactions provoked by movement").tokens),
  json([IMMUNITY_TOKENS.movementReaction]));

/* WITHOUT THESE, EVERY ALIAS CHECK ABOVE PASSES ON A CLASSIFIER THAT
 * MATCHES EVERYTHING. The empty-match failure this harness has recorded
 * more than once, in its own negative form. */
ok("A9 AND NONSENSE STILL MATCHES NOTHING",
  !classifyDefence("bananas").matched && !classifyDefence("necromancy").matched,
  "necromancy is the ONE word left unresolved in the records, and it must stay that way "
  + "until the data is corrected to `soul` — a vocabulary that swallowed it would hide "
  + "the very entry Graham ruled is wrong. It is not a TRG school; the eight real ones "
  + "are pinned by SC1 below");

ok("A10 AND A NEAR-MISS IS NOT A MATCH",
  !classifyDefence("criticalish").matched && !classifyDefence("area").matched === false,
  "\"area\" itself is a source; \"criticalish\" is not a word");

/* ── N: A NUMBER ON AN ENTRY ──────────────────────────────────────── */

equal("N1 physical 5 RESOLVES AS physical",
  json(classifyDefence("physical 5").damageTypes),
  json(["bludgeoning", "piercing", "slashing", "subdual"]),
  "the sheet's own placeholder reads \"Fire 5, physical 2\", so the field has invited a "
  + "number since it was added and the parser never took one");

equal("N1b AND THE NUMBER IS REPORTED, NOT SWALLOWED",
  classifyDefence("fire 5").ignoredValue, 5,
  "Chapter 7 resistance HALVES; a GM who types a value must be told it did nothing");

equal("N1c WHILE AN ENTRY WITH NO NUMBER REPORTS NONE",
  classifyDefence("fire").ignoredValue, null,
  "WITHOUT THIS, N1b passes on a parser that reports a phantom value for every entry");

equal("N1d AND THE FIELD COLLECTS THEM",
  json(resolveDefenceField("fire 5, cold").ignoredValues.map((v) => v.entry)),
  json(["fire 5"]));

/* ── E: all damage except X ───────────────────────────────────────── */

const ghost = classifyDefence("all damage except essence or force");
equal("E1 THE BLANKET RESISTANCE STILL APPLIES",
  json(ghost.categories), json([ALL_DAMAGE]));
equal("E1b AND NAMES ITS OWN EXCEPTIONS",
  json(ghost.except.sort()), json(["essence", "force"]),
  "the Human Ghost's wording; the Incorporeal codex trait excepts force alone, and "
  + "Graham ruled the record may name its own rather than being corrected to match");

ok("E1c AN EXCEPTION LIST THAT NAMES NOTHING IS A MISTAKE",
  !classifyDefence("all damage except wibble").matched,
  "a silently-empty exception list would widen the resistance back to everything, which "
  + "is the opposite of what the record says");

/* ── P: PRINTED, NOT ENFORCED ─────────────────────────────────────── */

const death = classifyDefence("death effects");
ok("P1 death effects RESOLVES", death.matched,
  "seventeen entries; leaving it unresolved means a GM re-checking a spelling that was "
  + "right, and reporting it as a typo when it is a real immunity");
ok("P1b AND CARRIES NO MECHANISM",
  !death.damageTypes.length && !death.conditions.length && !death.tokens.length
  && !death.categories.length && !death.sources.length,
  `it must apply nothing: ${json(death)}`);
equal("P1c AND IT PRINTS",
  json(resolveDefenceField("death effects").printed.length), json(1),
  "the sentence is what stops an unimplemented rule looking like a working one — the "
  + "position Runemage's room-to-draw line takes");

equal("P1d THE PRINTED LIST IS EXACTLY THE ONE WORD",
  json(Object.keys(PRINTED_DEFENCES)), json(["death effects"]),
  "WITHOUT THIS, P1 passes on a table that quietly prints instead of enforcing");

/* ── U: WHAT REACHES THE DEFENCES ─────────────────────────────────── */

const swarm = actorDefences({
  combat: {
    immunities: "critical hits, precision damage, mental effects, reactions provoked by movement, death effects",
    resistances: "targeted",
    weaknesses: "area damage"
  }
});

ok("U1 THE SWARM'S FOUR IMMUNITIES ALL ARRIVE",
  swarm.immunities.has(IMMUNITY_TOKENS.critical)
  && swarm.immunities.has("mental")
  && swarm.immuneTraits.has("precision")
  && swarm.immunities.has(IMMUNITY_TOKENS.movementReaction),
  `immunities ${json(swarm.immunities)} traits ${json(swarm.immuneTraits)}`);

equal("U2 AND ITS RESISTANCE IS A SOURCE",
  json(swarm.resistanceSources), json(["targeted"]));
equal("U2b AND ITS WEAKNESS IS ONE TOO",
  json(swarm.weaknessSources), json(["area"]));

equal("U3 NOTHING IS LEFT UNRESOLVED",
  json(swarm.unresolved), json([]),
  "all six of these words were reported as typos before this release");

equal("U3b AND THE PRINTED IMMUNITY IS CARRIED",
  swarm.printedDefences.length, 1);

const undead = actorDefences({ combat: { weaknesses: "divine" } });
equal("U4 A divine WEAKNESS BECOMES A TRAIT WEAKNESS",
  json(undead.weaknessTraits), json(["divinity"]));

/* ── D: THE PACKET ────────────────────────────────────────────────── */

const base = {
  amount: 10, type: "fire", dr: 0,
  resistances: [], immunities: [], weaknesses: []
};

equal("D1 AN AREA WEAKNESS ADDS 50%",
  resolveDamagePacket({ ...base, weaknessSources: ["area"], area: true }).taken, 15,
  "the Swarm's printed Weakness, carried as prose by codex-trait-rules since it was written");

equal("D1b AND A TARGETED BLOW DOES NOT TRIGGER IT",
  resolveDamagePacket({ ...base, weaknessSources: ["area"], targeted: true }).taken, 10,
  "WITHOUT THIS, D1 passes on a weakness that fires on every packet");

equal("D2 A TARGETED RESISTANCE HALVES",
  resolveDamagePacket({ ...base, resistanceSources: ["targeted"], targeted: true }).taken, 5);

equal("D2b AND AN AREA EFFECT IS NOT RESISTED BY IT",
  resolveDamagePacket({ ...base, resistanceSources: ["targeted"], area: true }).taken, 10,
  "a swarm resists the blade and is hurt worse by the fireball; a rule that could not "
  + "tell them apart would give it both or neither");

equal("D2c AND AN UNSPECIFIED SOURCE FIRES NEITHER",
  resolveDamagePacket({ ...base, resistanceSources: ["targeted"], weaknessSources: ["area"] }).taken,
  10,
  "a defence keyed on a fact nobody supplied must not fire — the defaulting `magical` "
  + "took at 3.547.0");

equal("D3 A divinity WEAKNESS READS THE SOURCE'S TRAITS",
  resolveDamagePacket({ ...base, weaknessTraits: ["divinity"], sourceTraits: ["divinity", "fire"] }).taken,
  15,
  "Graham: divine is \"any damage that results from a divinity spell\"");

equal("D3b AND AN ARCANE SPELL DOES NOT TRIGGER IT",
  resolveDamagePacket({ ...base, weaknessTraits: ["divinity"], sourceTraits: ["arcane", "fire"] }).taken,
  10,
  "WITHOUT THIS, D3 passes on a weakness every spell sets off");

const ghostPacket = (type) => resolveDamagePacket({
  ...base, type, resistanceCategories: [ALL_DAMAGE], resistanceExcept: ["essence", "force"]
});
equal("D4 all damage EXCEPT force LEAVES FORCE WHOLE",
  ghostPacket("force").taken, 10);
equal("D4b AND STILL HALVES EVERYTHING ELSE",
  ghostPacket("fire").taken, 5,
  "WITHOUT THIS, D4 passes on an exception list that cancels the resistance entirely");

equal("D5 IMMUNE TO NON-MAGICAL ATTACK FORMS",
  resolveDamagePacket({ ...base, immunities: [IMMUNITY_TOKENS.nonMagical], magical: false }).taken,
  0,
  "Incorporeal's first clause — the token was pushed into every ghost's immunity set and "
  + "read by nothing at all");
equal("D5b AND A SPELL STILL HURTS",
  resolveDamagePacket({ ...base, immunities: [IMMUNITY_TOKENS.nonMagical], magical: true }).taken,
  10,
  "WITHOUT THIS, D5 passes on a blanket immunity to everything");

/* ── C: THE CRITICAL ──────────────────────────────────────────────── */

const critArgs = { unmodified: 15, total: 40, db: 10, criticalResistance: 0 };
const critNormal = attackOutcome({ ...critArgs });
const critImmune = attackOutcome({ ...critArgs, criticalImmune: true });

ok("C1 A CRITICAL AGAINST AN IMMUNE TARGET STILL HAS ITS SEVERITY",
  Boolean(critImmune.critical) && critImmune.critical.severity === critNormal.critical?.severity,
  `immune: ${json(critImmune.critical)} vs normal: ${json(critNormal.critical)} — Graham: `
  + "the target \"takes HP damage from a critical injury\"; before 3.548.0 this was null "
  + "and the bonus dice went with it");

equal("C1b AND THE SAME BONUS DICE",
  critImmune.critical?.bonusDice, critNormal.critical?.bonusDice);

ok("C1c AND IS MARKED SO THE INJURY IS SKIPPED",
  critImmune.critical?.injuryImmune === true && critNormal.critical?.injuryImmune === false,
  "\"the critical injury roll would be bypassed\" — one flag, read by the one caller that "
  + "rolls on the table, so every other consumer goes on working");

ok("C1d AND A MISS IS STILL NOT A CRITICAL",
  attackOutcome({ unmodified: 5, total: 5, db: 30, criticalImmune: true }).critical === null,
  "WITHOUT THIS, C1 passes on a rule that criticals on everything");

/* ── M: THE MOVEMENT REACTION ─────────────────────────────────────── */

ok("M1 AN IMMUNE MOVER PROVOKES NOTHING",
  moveActionProvokes(null, true, false, true) === false,
  "the Swarm's fourth immunity; ten swarms declared it and every one still provoked");
ok("M1b WHILE ANYONE ELSE STILL PROVOKES",
  moveActionProvokes(null, true, false, false) === true,
  "WITHOUT THIS, M1 passes on a rule where nothing ever provokes");
ok("M1c AND Step STILL DOES NOT",
  moveActionProvokes("step", false, false, false) === false,
  "the existing rule must survive the new argument");

/* ── S: THE SPELL AS A SOURCE ─────────────────────────────────────── */

const fireball = { system: { area: "20-foot burst", traits: "fire, evocation", tradition: "arcane" } };
const bless = { system: { area: "", traits: "healing", tradition: "divinity" } };

ok("S1 A SPELL IS ALWAYS A MAGICAL SOURCE",
  spellDamageSource(fireball).magical === true && spellDamageSource(bless).magical === true,
  "no spell in the system has ever set this, so mundane resistance halved every one of "
  + "them — twenty creatures declare that resistance");

ok("S2 AN AREA SPELL IS AN AREA", spellHasArea(fireball));
ok("S2b AND A TARGETED ONE IS NOT", !spellHasArea(bless),
  "WITHOUT THIS, S2 passes on a function that answers true for every spell");

ok("S3 THE TRADITION TRAVELS WITH THE DAMAGE",
  spellSourceTraits(bless).includes("divinity"),
  "tradition lives on `system.tradition` and traits on `system.traits` — a divine "
  + "weakness could never match if only one field made the trip");

ok("S3b AND THE SPELL'S OWN TRAITS DO TOO",
  spellSourceTraits(fireball).includes("fire") && spellSourceTraits(fireball).includes("arcane"));

ok("S4 targeted IS THE PATH'S ANSWER, NOT THE SPELL'S",
  spellDamageSource(fireball, { targeted: true }).targeted === true
  && spellDamageSource(fireball).targeted === false,
  "the same spell resolves as an attack on one path and a save on another");

/* ── W: THE WIRING — WHAT ACTUALLY SHIPPED BROKEN ─────────────────── */

/*
 * THESE THREE READ SOURCE, and that is deliberate.
 *
 * Every rule this release repaired had a passing test at each end and no
 * middle. `resistanceBypassMaterials` was produced and consumed and
 * never passed; `magical` was consumed and documented and never set. No
 * test of `resolveDamagePacket` can see either, because the packet is
 * given the values directly. The only thing that can is a check on the
 * call sites.
 */
/*
 * COMMENTS ARE STRIPPED BEFORE ANY SOURCE SCAN, and the mutation runner
 * is why. W5's first draft looked for `IMMUNITY_TOKENS.precision` in
 * attack-workflow — and the mutation that disabled the precision check
 * SURVIVED, because the words were still sitting in the comment I had
 * written above the code explaining what it did. A check that reads a
 * comment is a check that passes on a file describing a rule it no
 * longer has, which is the exact failure this whole release is about,
 * committed inside the harness written to catch it.
 */
function codeOf(relative) {
  return fs.readFileSync(path.join(SYSTEM_ROOT, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function callSitesIn(relative) {
  const src = codeOf(relative);
  const sites = [];
  const re = /resolveAgainstDefences\(/g;
  let m;
  while ((m = re.exec(src))) {
    // The option object runs to the closing "});" of the call.
    const end = src.indexOf("});", m.index);
    sites.push({ file: relative, body: src.slice(m.index, end === -1 ? m.index + 400 : end) });
  }
  return sites;
}

const MAGIC_FILES = fs.readdirSync(path.join(SYSTEM_ROOT, "module", "magic"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => path.join("module", "magic", f));

const spellSites = MAGIC_FILES.flatMap(callSitesIn)
  .filter((s) => !s.body.includes("import("));
// `spellDamageSource` SETS magical: true AND IS THE PREFERRED SPELLING —
// it answers area and the traits at the same time. A site either spreads
// it or says `magical` outright; anything else defaults to non-magical.
const spellSilent = spellSites
  .filter((s) => !/\bmagical\b/.test(s.body) && !/spellDamageSource\(/.test(s.body))
  .map((s) => s.file);

ok("W1 EVERY SPELL DAMAGE PATH DECLARES ITSELF MAGICAL",
  spellSilent.length === 0,
  `these still default to non-magical, so mundane resistance halves them: `
  + `${json([...new Set(spellSilent)])}`);

ok("W1b AND THERE ARE SPELL DAMAGE PATHS TO CHECK",
  spellSites.length >= 8,
  `found ${spellSites.length} — WITHOUT THIS, W1 passes by finding nothing, which is `
  + "how this check would rot the day the call is renamed");

const damagePaths = ["module/combat/attack-workflow.mjs", "module/combat/damage-workflow.mjs"];
const bypassMissing = damagePaths.filter((f) => !codeOf(f).includes("resistanceBypassMaterials"));

ok("W2 BOTH DAMAGE PATHS PASS THE BYPASS MATERIALS",
  bypassMissing.length === 0,
  `${json(bypassMissing)} — added at 3.547.1 with a producer and a consumer and nothing `
  + "between them, so \"mundane (silver)\" halved a silver weapon for a whole release");

const attackSrc = codeOf("module/combat/attack-workflow.mjs");
ok("W3 A WEAPON STRIKE DECLARES ITSELF TARGETED",
  /targeted:\s*true/.test(attackSrc),
  "Graham: targeted is \"any attack that requires an attack roll\", and this is the path "
  + "every attack roll in the system takes");

/*
 * W4-W6 EXIST BECAUSE THE MUTATION RUNNER ASKED FOR THEM.
 *
 * Three mutations SURVIVED the first draft of this file — deleting the
 * injury gate, disabling the precision check, and stripping `targeted`
 * off the spell attack path — and every one survived for the same
 * reason: the rule was checked and the CALL SITE was not. That is this
 * release's own defect reappearing inside the harness written to catch
 * it, which is worth recording rather than quietly fixing.
 */
ok("W4 THE INJURY ROLL IS GATED ON THE IMMUNITY",
  /outcome\.critical\s*&&\s*!outcome\.critical\.injuryImmune/.test(attackSrc),
  "C1c proves attackOutcome sets the flag; without this, nothing proves the workflow "
  + "reads it, and a flag nobody reads is the whole subject of this release");

// W4b (3.576.0). The card's own immunity line said "no critical can be
// scored" for two releases after the ruling that keeps the bonus dice,
// directly above a line printing the critical and its dice. Graham asked
// for the wording to say what happens.
ok("W4b THE IMMUNITY LINE SAYS THE DICE STAY AND THE INJURY GOES",
  /is immune to \$\{critImmunity\} — a critical still adds its bonus damage dice, but no critical injury is rolled\./.test(attackSrc)
    && !/no critical can be scored/.test(attackSrc),
  "Graham, 10 Sep 2026: the creature takes the critical's HP damage; only the injury roll is bypassed");

ok("W5 PRECISION DICE ARE GATED ON THE IMMUNITY",
  (attackSrc.match(/precisionImmune\s*\?\s*0\s*:/g) ?? []).length === 2
  && /immunities\?\.has\?\.\(IMMUNITY_TOKENS\.precision\)/.test(attackSrc),
  "Sneak Attack and Precision Hunter both, or the immunity works against one Rogue "
  + "feature and not the other");

const castSrc = codeOf("module/magic/cast-workflow.mjs");
/*
 * W6 IS ANCHORED TO THE MAIN PACKET AT 3.595.0, and the reason is this
 * project's defect shape (e) — a check satisfied by an unrelated
 * occurrence.
 *
 * Searing Ray's vs-trait damage (3.595.0) declares itself the same way, so
 * the moment that second packet existed, deleting `targeted: true` from the
 * SPELL ATTACK's own packet left W6 passing on the other one. Its mutation
 * survived, which is how this was found and which is what mutation packs
 * are for.
 *
 * So the anchor is the main packet's own site: the `amount: dealt` it
 * resolves and the `let newHP` that follows it. A second packet resolving
 * `amount: vsRoll.total` cannot answer for it.
 */
ok("W6 THE SPELL ATTACK PATH DECLARES ITSELF TARGETED",
  // 3.617.0: the Bracers' drain sits between the packet and `let newHP`.
  /amount: dealt,[\s\S]{0,600}?spellDamageSource\(spell,\s*\{\s*targeted:\s*true\s*\}\)[\s\S]{0,200}?drainBracers\(targetActor, packet\);\s*let newHP/
    .test(castSrc),
  "a spell attack roll is targeted by Graham's definition; declaring it magical alone "
  + "would leave a swarm's resistance to targeted attacks blind to every spell");
ok("W6c AND SO DOES THE SECOND PACKET BESIDE IT",
  /amount: vsRoll\.total,[\s\S]{0,200}?spellDamageSource\(spell, \{ targeted: true \}\)/.test(castSrc),
  "the holy half of a Searing Ray is the same blow, made by the same attack roll");

ok("W6b AND THE SAVE PATH DOES NOT",
  /spellDamageSource\(spell\)/.test(castSrc),
  "WITHOUT THIS, W6 passes on a system where every spell claims an attack roll it "
  + "never made");

/*
 * S5 IS THE CHECK THE FIRST LIVE DRIVE DEMANDED.
 *
 * 3.548.1 went into Graham's world and a Shadow — `weaknesses: divine` —
 * took 10 from a divinity spell instead of 15. `spellDamageSource`
 * returns `sourceTraits`, matching `resolveDamagePacket`;
 * `resolveAgainstDefences` destructured `traits`; so spreading the
 * descriptor through the workflow set a key nothing read, and every
 * spell's tradition AND school were dropped between the two layers.
 *
 * SC3 passed the whole time, because it calls the packet directly, where
 * the names agree. A value produced under one name and consumed under
 * another is a wire that was never connected — this release's own
 * subject, one layer above where its checks were pointed.
 *
 * So this asserts the SHAPE MATCHES rather than any one behaviour: every
 * key the descriptor emits must be a parameter the workflow destructures.
 */
const workflowSrc = codeOf("module/combat/damage-workflow.mjs");
const workflowParams = (() => {
  const start = workflowSrc.indexOf("export function resolveAgainstDefences");
  const body = workflowSrc.slice(start, workflowSrc.indexOf("} = {}) {", start));
  return new Set([...body.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\s*=/gm)].map((m) => m[1]));
})();
const descriptorKeys = Object.keys(spellDamageSource({ system: {} }));
const unread = descriptorKeys.filter((k) => !workflowParams.has(k));

ok("S5 EVERY KEY spellDamageSource EMITS IS ONE THE WORKFLOW ACCEPTS",
  unread.length === 0,
  `these are set and never read: ${json(unread)} — workflow takes ${json([...workflowParams])}`);

ok("S5b AND THE PARAMETER SCAN FOUND A REAL SIGNATURE",
  workflowParams.size >= 8 && workflowParams.has("magical"),
  `found ${workflowParams.size} params — WITHOUT THIS, S5 passes by parsing nothing, `
  + "which is how a source check rots the day a signature is reformatted");

ok("S5c AND THE SPELL'S TRAITS SURVIVE THE WORKFLOW LAYER",
  (() => {
    const dw = workflowSrc;
    return /sourceTraits:\s*sourceTraits\s*\?\?\s*traits/.test(dw);
  })(),
  "the packet must receive the descriptor's traits, not only the legacy `traits` spelling");

/* ── SC: THE EIGHT SCHOOLS ────────────────────────────────────────── */

/*
 * THESE EXIST BECAUSE I GOT IT WRONG IN PROSE, and the mechanism turned
 * out to be right by accident: a school is carried on `system.traits`,
 * and `spellSourceTraits` reads that field, so a school-scoped
 * resistance or weakness has worked since 3.548.0 shipped without anyone
 * — me included — knowing it did. An accident that works is one edit
 * from an accident that does not.
 */
equal("SC1 THERE ARE EIGHT SCHOOLS AND THESE ARE THEY",
  json([...SPELL_SCHOOLS].map((s) => s.toLowerCase())),
  json(["alteration", "enchantment", "insight", "invocation",
    "shadow", "soul", "translocation", "warding"]),
  "Chapter 9. Every spell has the trait corresponding to its school");

ok("SC2 AND EVERY ONE IS A DEFENCE-FIELD TRAIT",
  SPELL_SCHOOLS.every((s) => classifyDefence(s).traits.includes(s.toLowerCase())),
  `these do not classify: ${json(SPELL_SCHOOLS.filter((s) => !classifyDefence(s).matched))}`);

ok("SC3 A SCHOOL WEAKNESS READS THE SPELL'S SCHOOL",
  resolveDamagePacket({
    ...base, type: "essence",
    weaknessTraits: actorDefences({ combat: { weaknesses: "soul" } }).weaknessTraits,
    sourceTraits: spellSourceTraits({ system: { traits: "soul, healing" } })
  }).taken === 15,
  "a creature weak to Soul, hit by a Soul spell");

ok("SC3b AND ANOTHER SCHOOL DOES NOT TRIGGER IT",
  resolveDamagePacket({
    ...base, type: "essence",
    weaknessTraits: actorDefences({ combat: { weaknesses: "soul" } }).weaknessTraits,
    sourceTraits: spellSourceTraits({ system: { traits: "invocation, fire" } })
  }).taken === 10,
  "WITHOUT THIS, SC3 passes on a weakness every spell in the game sets off");

ok("SC4 AND necromancy IS NOT AMONG THEM",
  !SPELL_SCHOOLS.some((s) => s.toLowerCase() === "necromancy"),
  "the reason the Animus Statue's entry is wrong — not that TRG lacks schools, which "
  + "is what I told Graham, but that this is not one of its eight");

/* ── T: THE TOKEN VOCABULARY IS ONE LIST ──────────────────────────── */

equal("T1 THE TOKENS ARE THE FOUR",
  json([...DEFENCE_TOKENS].sort()),
  json(["critical", "movement-reaction", "non-magical", "precision"]));
equal("T2 AND THE SOURCES THE TWO",
  json([...DEFENCE_SOURCES]), json(["area", "targeted"]));

const { IMMUNITY_TOKENS: codexTokens } = await import("../module/codex-trait-rules.mjs");
ok("T3 codex-trait-rules USES THE SAME LIST",
  codexTokens === IMMUNITY_TOKENS,
  "two copies is how the trait pushed \"critical\" while the field wrote \"critical hits\" "
  + "and neither knew about the other");

/* ── R: THE RECORDS ───────────────────────────────────────────────── */

/* Conditions are still the one kind reported as a mistake in a damage
 * field, because halving a condition is not a thing. The line moved at
 * 3.548.0 — tokens, sources and traits became applicable — and it has to
 * have moved rather than vanished. */
equal("R1 A CONDITION IN A RESISTANCE FIELD IS STILL A MISTAKE",
  json(resolveDamageTypeField("stunned").unresolved), json(["stunned"]));
equal("R1b WHILE A SOURCE IN ONE IS NOT",
  json(resolveDamageTypeField("targeted").unresolved), json([]));

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-defence-vocabulary: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-defence-vocabulary: OK — ${checks} checks. Fourteen bestiary words `
  + `resolve, five inert immunities now fire, and every spell is a magical source.\n`);
