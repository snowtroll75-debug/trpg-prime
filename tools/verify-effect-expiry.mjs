#!/usr/bin/env node
/**
 * verify-effect-expiry — the two clocks, doing the same job.
 *
 * NEW at 3.514.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION R IS THE DEFECT, AND IT WAS FOUND LIVE.
 *
 * A spell effect can end on either clock — `expireTimedConditions` counts
 * ROUNDS, `expireSpellEffects` reads WORLD TIME — and in a combat
 * `spellExpiryTiming` stamps BOTH on the same effect. Which one ends it
 * is a matter of which is moving, and rounds pass without the world clock
 * moving at all.
 *
 * They were not doing the same job:
 *
 *   THE ROUND CLOCK announced the expiry and left behind everything the
 *   spell had built.
 *   THE WORLD CLOCK removed what the spell had built and said nothing.
 *
 * Driven on 7 September 2026: Magic Stone cast at round 1 printed "Magic
 * Stone expires." at round 11, the effect went, and three +1 pebbles
 * stayed in the caster's inventory for good. WILD MORPH HAS CARRIED THE
 * SAME HOLE SINCE 3.493.0, where it is worse — a grown claw that outlives
 * its minute is a permanent extra attack.
 *
 * ─────────────────────────────────────────────────────────────────────
 * BOTH SWEEPS ARE RUN HERE, AGAINST A STAND-IN ACTOR.
 *
 * They are Foundry-coupled, but only shallowly: between them they touch
 * `actor.effects`, `actor.items`, `getFlag`, `effect.delete` and
 * `actor.deleteEmbeddedDocuments`. That is a small enough surface to
 * stand in for, and standing in is the whole point — the alternative is a
 * check that greps the source for `removeSpellItemsByCastId` and passes
 * whether or not it is reached. This project has recorded that mistake
 * three times, and the comment which said "both routes an effect can end
 * by" while there were three is what it looks like from the inside.
 */

import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { effectExpiredLine } from "../module/combat/effect-expiry.mjs";

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

/* ================================================================== *
 * THE STAND-IN
 * ================================================================== */

const SYS = "trg-prime";

function makeActor({ effectFlags = {}, effectName = "Magic Stone", items = [] } = {}) {
  const state = { effects: [], items: [], name: "Stand-in" };
  const effect = {
    id: "eff-1",
    name: effectName,
    statuses: undefined,
    flags: { [SYS]: { ...effectFlags } },
    getFlag(_s, k) { return this.flags[SYS][k]; },
    async setFlag(_s, k, v) { this.flags[SYS][k] = v; },
    async delete() { state.effects = state.effects.filter((e) => e.id !== "eff-1"); }
  };
  state.effects = [effect];
  state.items = items.map((raw, n) => ({
    id: `item-${n}`,
    name: raw.name ?? "Thing",
    flags: { [SYS]: { ...raw.flags } },
    getFlag(_s, k) { return this.flags[SYS][k]; }
  }));

  const actor = {
    name: "Stand-in",
    get effects() {
      const list = state.effects;
      list.get = (id) => list.find((e) => e.id === id);
      return list;
    },
    get items() { return state.items; },
    async deleteEmbeddedDocuments(type, ids) {
      if (type === "Item") state.items = state.items.filter((i) => !ids.includes(i.id));
      if (type === "ActiveEffect") state.effects = state.effects.filter((e) => !ids.includes(e.id));
      return ids;
    }
  };
  return { actor, state, effect };
}

const STONE = { name: "Magic Stone", flags: { castId: "cast-1", endsWithSpell: true } };
const FLASK = { name: "Holy Water", flags: { castId: "cast-1" } };
const OTHER = { name: "Arrows", flags: {} };
/*
 * A SECOND CASTING'S TEMPORARY ITEM, and the fixture exists because the
 * mutation runner said the others could not catch its loss.
 *
 * `K2 ANOTHER CASTING'S ITEMS ARE TAKEN TOO` — dropping the castId test
 * from the filter — SURVIVED against Arrows and the flask: neither
 * declares `endsWithSpell`, so the second half of the test excluded them
 * anyway and the count never moved. Only an item that says it ends with a
 * spell AND belongs to a DIFFERENT spell can tell the two halves apart.
 *
 * It is also the real case: a caster running Wild Morph and Magic Stone
 * at once, one of them ending. Fifth time this project has recorded a
 * check that could not catch its own assertion being neutered.
 */
const CLAW = { name: "Wild Morph Claw", flags: { castId: "cast-2", endsWithSpell: true } };

const { expireSpellEffects, expireTimedConditions } =
  await import(path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs"));

/* ================================================================== *
 * R. THE ROUND CLOCK — the route that was missing
 * ================================================================== */

{
  const { actor, state } = makeActor({
    effectFlags: { spellEffect: true, castId: "cast-1", conditionExpiresRound: 11 },
    items: [STONE, FLASK, OTHER, CLAW]
  });
  const said = await expireTimedConditions(actor, 11);

  equal("R1 the round clock ends the effect", state.effects.length, 0);
  equal("R1b and names it", said.join(), "Magic Stone");
  // R2 IS THE DEFECT ITSELF.
  ok("R2 THE ROUND CLOCK TAKES AWAY WHAT THE SPELL BUILT",
    !state.items.some((i) => i.name === "Magic Stone"),
    "found live: the effect expired at round 11 and three +1 pebbles stayed for good");
  ok("R2b BUT KEEPS A FLASK THAT DOES NOT SAY IT ENDS",
    state.items.some((i) => i.name === "Holy Water"),
    "Bless Water's Holy Water is made by a spell and the caster keeps it");
  ok("R2c and keeps what was never the spell's", state.items.some((i) => i.name === "Arrows"));
  // R2d IS THE ONE THE MUTATION RUNNER ASKED FOR. See CLAW above: only an
  // item that ends with A DIFFERENT spell can tell the castId test apart
  // from the `endsWithSpell` test beside it.
  ok("R2d AND KEEPS ANOTHER CASTING'S TEMPORARY ITEM",
    state.items.some((i) => i.name === "Wild Morph Claw"),
    "one spell ending must not strip every temporary item on the sheet");
}

{
  // R3 A ROUND SHORT AND NOTHING HAPPENS — the guard that decides when.
  const { actor, state } = makeActor({
    effectFlags: { spellEffect: true, castId: "cast-1", conditionExpiresRound: 11 },
    items: [STONE]
  });
  const said = await expireTimedConditions(actor, 10);
  equal("R3 A ROUND EARLY, NOTHING ENDS", said.length, 0);
  equal("R3b and the pebbles are untouched", state.items.length, 1);
  equal("R3c and so is the effect", state.effects.length, 1);
}

{
  // R4 AN EFFECT WITH NO ROUND STAMP is not the round clock's business.
  const { actor, state } = makeActor({
    effectFlags: { spellEffect: true, castId: "cast-1" }, items: [STONE]
  });
  equal("R4 an unstamped effect never expires by round",
    (await expireTimedConditions(actor, 9999)).length, 0);
  equal("R4b and its items stay", state.items.length, 1);
}

/* ================================================================== *
 * W. THE WORLD CLOCK — the half that already worked
 * ================================================================== */

{
  const { actor, state } = makeActor({
    effectFlags: { spellEffect: true, castId: "cast-1", spellEffectEnd: 500 },
    items: [STONE, FLASK, CLAW]
  });
  const said = await expireSpellEffects(actor, 500);
  equal("W1 the world clock ends the effect", state.effects.length, 0);
  equal("W1b and names it", said.join(), "Magic Stone");
  ok("W1c and takes away what the spell built",
    !state.items.some((i) => i.name === "Magic Stone"));
  ok("W1d keeping the flask", state.items.some((i) => i.name === "Holy Water"));
  ok("W1e and another casting's claw",
    state.items.some((i) => i.name === "Wild Morph Claw"));
}

{
  const { actor, state } = makeActor({
    effectFlags: { spellEffect: true, castId: "cast-1", spellEffectEnd: 500 }, items: [STONE]
  });
  equal("W2 A SECOND EARLY, NOTHING ENDS", (await expireSpellEffects(actor, 499)).length, 0);
  equal("W2b and the pebbles are untouched", state.items.length, 1);
}

{
  // W3 AN EFFECT THAT IS NOT A SPELL'S is nobody's to sweep.
  const { actor, state } = makeActor({
    effectFlags: { spellEffectEnd: 500, castId: "cast-1" }, items: [STONE]
  });
  equal("W3 a GM's own effect is never swept", (await expireSpellEffects(actor, 9999)).length, 0,
    "manual effects are not removed — the flag is what makes it ours");
  equal("W3b and its items stay", state.items.length, 1);
}

/* ================================================================== *
 * A. THE TWO CLOCKS AGREE
 * ================================================================== */

// A1 IS THE POINT OF THE RELEASE, asserted by running both against the
// same starting state rather than by reading the two functions.
{
  const round = makeActor({
    effectFlags: { spellEffect: true, castId: "cast-1", conditionExpiresRound: 11, spellEffectEnd: 500 },
    items: [STONE, FLASK, OTHER, CLAW]
  });
  const world = makeActor({
    effectFlags: { spellEffect: true, castId: "cast-1", conditionExpiresRound: 11, spellEffectEnd: 500 },
    items: [STONE, FLASK, OTHER, CLAW]
  });
  const roundSaid = await expireTimedConditions(round.actor, 11);
  const worldSaid = await expireSpellEffects(world.actor, 500);

  equal("A1 BOTH CLOCKS LEAVE THE SAME ITEMS BEHIND",
    JSON.stringify(round.state.items.map((i) => i.name)),
    JSON.stringify(world.state.items.map((i) => i.name)),
    "in a combat both stamps are set, so which clock ends it is an accident of which is moving");
  equal("A1b and both leave no effect",
    round.state.effects.length, world.state.effects.length);
  equal("A1c and both name what ended", roundSaid.join(), worldSaid.join());
  ok("A1d and neither keeps the pebbles",
    !round.state.items.some((i) => i.name === "Magic Stone")
    && !world.state.items.some((i) => i.name === "Magic Stone"));
}

/* ================================================================== *
 * S. THE SENTENCE
 * ================================================================== */

equal("S1 THE WORDING IS THE ROUND CLOCK'S, UNCHANGED",
  effectExpiredLine("Bless"), "<strong>Bless</strong> expires.",
  "players have read this since long before the release that fixed the other half");
equal("S2 and it can name whose it was",
  effectExpiredLine("Bless", "Toben"), "<strong>Bless</strong> expires on Toben.",
  "the round clock sweeps every combatant on one turn and has to say which");
equal("S2b while an empty name adds nothing",
  effectExpiredLine("Bless", ""), "<strong>Bless</strong> expires.");
equal("S2c and so does a blank one",
  effectExpiredLine("Bless", "   "), "<strong>Bless</strong> expires.");
equal("S3 AN UNNAMED EFFECT SAYS NOTHING AT ALL", effectExpiredLine(""), null,
  "a line that says something ended and refuses to say what is worse than silence");
equal("S3b nor does nothing", effectExpiredLine(null), null);
equal("S3c nor whitespace", effectExpiredLine("  "), null);

/* ================================================================== */

if (failures.length) {
  process.stdout.write(`verify-effect-expiry: FAILED — ${failures.length} of ${checks}\n`);
  for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
  process.exit(1);
}
process.stdout.write(`verify-effect-expiry: OK — ${checks} checks.\n`);
