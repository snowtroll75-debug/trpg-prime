#!/usr/bin/env node
/**
 * verify-turn-end-clock — core 3.707.2: "until the end of your next turn"
 * ends as the CASTER's next turn ends.
 *
 * Graham, 21 November 2026, asked whether "until the end of your next turn"
 * should be tied to the caster's own turn as the start of it was (3.707.1):
 * "Yes is the answer to your one question, please implement that before
 * testing."
 *
 *   P  the parser marks the phrase ("your" only)
 *   C  the clock: the caster and the turn of the cast, no round clock, a
 *      three-round backstop
 *   S  the turn-end sweep, driven with fake creatures: the cast's own turn
 *      is passed over, the next one ends it, nobody else's turn does
 *   W  every writer that copies the turn-start stamp copies this one
 *   R  conditions carry it, through the GM's relay, as two strings only
 *   K  the pack's spells with that duration
 *   F  Flat-Footed's end-of-turn removal leaves one with its own turn clock
 *      (3.713.0; Graham, 24 November 2026: "the core should apply unless a
 *      local rule overrides it")
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const D = await mod("magic", "effect-duration.mjs");
const CASTER = "Scene.s.Token.wiz.Actor.w";
const OTHER = "Scene.s.Token.orc.Actor.o";

/* P */
{
  const p = D.parseSpellDuration("until the end of your next turn");
  ok("P1 'until the end of your next turn' is marked, and still two rounds for the clock out of combat", p?.untilTurnEnd === true && p.rounds === 2 && p.seconds === 12);
  ok("P2 'its' or 'their' next turn, or the target's, is not the caster's, and is not marked",
    !D.parseSpellDuration("until the end of its next turn")?.untilTurnEnd && !D.parseSpellDuration("until the end of their next turn")?.untilTurnEnd
    && D.parseSpellDuration("until the end of its next turn")?.rounds === 2
    && !D.parseSpellDuration("until the end of the target's next turn")?.untilTurnEnd);
  ok("P3 nor 'the end of your turn' (this one), nor the start of the next", !D.parseSpellDuration("until the end of your turn")?.untilTurnEnd
    && !D.parseSpellDuration("until the start of your next turn")?.untilTurnEnd);
}

/* C */
{
  const parsed = { ...D.parseSpellDuration("until the end of your next turn"), turnEndOf: CASTER };
  equal("C1 in an encounter: the caster, the turn of the cast, and three rounds of world time",
    D.turnEndClock(parsed, { inCombat: true, worldTime: 600, round: 2, combatantId: "cWiz" }), { turnEndOf: { of: CASTER, castTurn: "2:cWiz" }, backstopEnd: 618 });
  ok("C2 out of an encounter, or with no caster: nothing — twelve seconds stand",
    D.turnEndClock(parsed, { inCombat: false }) === null && D.turnEndClock({ ...parsed, turnEndOf: "" }, { inCombat: true }) === null);
  ok("C3 the backstop lies past the second round boundary", D.turnEndClock(parsed, { inCombat: true, worldTime: 0, round: 1, combatantId: "x" }).backstopEnd > 12);
  const SE = read("module", "magic", "spell-effects.mjs");
  ok("C4 the cast stamps its caster", /if \(parsedDuration\?\.untilTurnEnd && caster\?\.uuid\) parsedDuration\.turnEndOf = caster\.uuid;/.test(SE));
  ok("C5 the timing drops the round clock, and names the turn in progress",
    /if \(atTurnEnd\) \{\n\s+out\.spellEffect = true;\n\s+out\.expiresRound = null;\n\s+out\.spellEffectEnd = atTurnEnd\.backstopEnd;\n\s+out\.turnEndOf = atTurnEnd\.turnEndOf;/.test(SE)
    && /round: Number\(game\.combat\?\.round \?\? 0\), combatantId: String\(game\.combat\?\.combatant\?\.id \?\? ""\)/.test(SE));
  const { spellEffectDurationLabel } = await mod("magic", "spell-effects.mjs");
  equal("C6 the sheet says how it ends", spellEffectDurationLabel({ flags: { "trg-prime": { endsAtTurnEndOf: { of: CASTER, castTurn: "1:c" }, spellEffectEnd: 618 } } }, 600), "Until the end of the caster's next turn");
}

/* S — driven */
{
  equal("S1 the rule: the cast's own turn passed over, the next one due, another creature's never",
    [D.dueAtTurnEnd({ of: CASTER, castTurn: "2:cWiz" }, { turnOfUuid: CASTER, endingTurn: "2:cWiz" }),
      D.dueAtTurnEnd({ of: CASTER, castTurn: "2:cWiz" }, { turnOfUuid: CASTER, endingTurn: "3:cWiz" }),
      D.dueAtTurnEnd({ of: CASTER, castTurn: "2:cOrc" }, { turnOfUuid: CASTER, endingTurn: "2:cWiz" }),
      D.dueAtTurnEnd({ of: CASTER, castTurn: "2:cWiz" }, { turnOfUuid: OTHER, endingTurn: "3:cOrc" }),
      D.dueAtTurnEnd(null, { turnOfUuid: CASTER, endingTurn: "3:cWiz" })],
    [false, true, true, false, false]);
  const E = await mod("combat", "effect-application-workflow.mjs");
  const bearer = (name, stamp) => {
    const gone = [];
    const effects = [{
      id: "e1", uuid: `Actor.${name}.ActiveEffect.e1`, name: "Shifting Step", disabled: false, statuses: new Set(),
      flags: { "trg-prime": stamp }, getFlag: (s, k) => stamp[k],
      delete: async () => { gone.push("e1"); effects.length = 0; }
    }];
    return { actor: { name, uuid: `Actor.${name}`, effects: { [Symbol.iterator]: () => effects[Symbol.iterator](), get: (id) => effects.find((e) => e.id === id) ?? null, find: (f) => effects.find(f) } }, gone };
  };
  const ally = bearer("ally", { endsAtTurnEndOf: { of: CASTER, castTurn: "2:cWiz" }, spellEffect: true });
  const castTurn = await E.expireAtTurnEnd(ally.actor, { turnOf: { uuid: CASTER }, round: 2, combatantId: "cWiz" });
  const orcTurn = await E.expireAtTurnEnd(ally.actor, { turnOf: { uuid: OTHER }, round: 3, combatantId: "cOrc" });
  const nextTurn = await E.expireAtTurnEnd(ally.actor, { turnOf: { uuid: CASTER }, round: 3, combatantId: "cWiz" });
  ok("S2 cast in the wizard's own turn: it outlasts that turn's end and the orc's, and ends as the wizard's next turn ends",
    castTurn.length === 0 && orcTurn.length === 0 && nextTurn.length === 1 && ally.gone.length === 1, JSON.stringify({ castTurn, orcTurn, nextTurn }));
  const reacted = bearer("wiz", { endsAtTurnEndOf: { of: CASTER, castTurn: "2:cOrc" } });
  const firstOwn = await E.expireAtTurnEnd(reacted.actor, { turnOf: { uuid: CASTER }, round: 2, combatantId: "cWiz" });
  ok("S3 cast as a reaction on the orc's turn: it ends as the wizard's coming turn ends", firstOwn.length === 1 && reacted.gone.length === 1);
  const CB = read("module", "documents", "combat.mjs");
  const end = CB.slice(CB.indexOf("  async _onEndTurn(combatant, context) {"));
  ok("S4 the turn-end sweep runs for every combatant, with the ending turn's own round",
    /for \(const label of await expireAtTurnEnd\(subject, \{ turnOf: actor, round: context\?\.round \?\? this\.round, combatantId: combatant\.id \}\)\)/.test(end)
    && end.indexOf("expireAtTurnEnd(subject") < end.indexOf("if (actor.hasCondition?.(\"flatFooted\"))"));
  ok("S5 after stasis: no turn passes for a creature in stasis", end.indexOf("stasisTurnEnd(actor)") < end.indexOf("expireAtTurnEnd(subject"));
}

/* W */
{
  const SE = read("module", "magic", "spell-effects.mjs");
  const lines = SE.split("\n");
  const starts = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*if \((\w+)\.turnStartOf\) [\w.]+(?:\[SYSTEM_ID\])?\.endsAtTurnStartOf = \1\.turnStartOf;$/.test(l));
  const paired = starts.filter(([l, i]) => {
    const t = /if \((\w+)\.turnStartOf/.exec(l)[1];
    const f = /\) ([\w.]+(?:\[SYSTEM_ID\])?)\.endsAtTurnStartOf/.exec(l)[1];
    return lines[i + 1]?.trim() === `if (${t}.turnEndOf) ${f}.endsAtTurnEndOf = ${t}.turnEndOf;`;
  });
  ok("W1 every writer of the turn-start stamp writes the turn-end one beside it", starts.length >= 60 && paired.length === starts.length, `${paired.length} of ${starts.length}`);
  ok("W2 and a spell's condition, and a tether's, pass it", /endsAtTurnEndOf: timing\.turnEndOf \?\? null,/.test(SE) && /endsAtTurnEndOf: tetherTiming\.turnEndOf \?\? null,/.test(SE));
}

/* R */
{
  const EA = read("module", "combat", "effect-application-workflow.mjs");
  ok("R1 the condition writer stamps it, only on a condition it laid",
    /if \(endsAtTurnEndOf\?\.of\) updates\[`flags\.\$\{SYSTEM_ID\}\.\$\{TURN_END_FLAG\}`\] = \{ of: String\(endsAtTurnEndOf\.of\), castTurn: String\(endsAtTurnEndOf\.castTurn \?\? ""\) \};/.test(EA)
    && (EA.match(/followOn: timing\.followOn,\n\s+endsAtTurnStartOf, endsAtTurnEndOf\n/g) ?? []).length === 2);
  ok("R2 and sends it to the GM's client", /sourceTraits, endsAtTurnStartOf, endsAtTurnEndOf \},/.test(EA)
    && /"endsAtTurnStartOf", "endsAtTurnEndOf"\]\) \{/.test(read("module", "combat", "target-relay-workflow.mjs")));
  const R = await mod("combat", "target-relay.mjs");
  const seen = [];
  const deps = { fromUuid: async () => ({ uuid: "Actor.a" }), applyConditionTags: async (t, tags, o) => { seen.push(o.endsAtTurnEndOf); return []; } };
  await R.performRelay({ action: R.RELAY_ACTIONS.CONDITIONS, uuid: "Actor.a", payload: { tags: [], options: { endsAtTurnEndOf: { of: CASTER, castTurn: "2:c", extra: "x" } } } }, deps);
  await R.performRelay({ action: R.RELAY_ACTIONS.CONDITIONS, uuid: "Actor.a", payload: { tags: [], options: { endsAtTurnEndOf: { of: 5 } } } }, deps);
  equal("R3 the GM's client lays two strings and nothing else", seen, [{ of: CASTER, castTurn: "2:c" }, null]);
}

/* F — driven (3.713.0) */
{
  equal("F1 a turn clock is a local rule; a round clock, a bare flag or nothing is not",
    [D.keepsOwnTurnClock({ endsAtTurnEndOf: { of: OTHER, castTurn: "2:cOrc" } }), D.keepsOwnTurnClock({ endsAtTurnStartOf: CASTER }),
      D.keepsOwnTurnClock({ conditionExpiresRound: 3 }), D.keepsOwnTurnClock({ endsAtTurnEndOf: { of: "" } }), D.keepsOwnTurnClock({ endsAtTurnStartOf: "" }),
      D.keepsOwnTurnClock(null), D.keepsOwnTurnClock({ initialFlatFooted: true })],
    [true, true, false, false, false, false, false]);
  const E = await mod("combat", "effect-application-workflow.mjs");
  const orc = (...stamps) => {
    const log = { toggled: 0, deleted: [] };
    const effects = stamps.map((stamp, i) => ({
      id: `f${i}`, uuid: `Actor.orc.ActiveEffect.f${i}`, name: "Flat-Footed", disabled: false, statuses: new Set(["flatFooted"]),
      flags: { "trg-prime": stamp }, getFlag: (sys, k) => stamp[k],
      delete: async () => { log.deleted.push(`f${i}`); effects.splice(effects.findIndex((e) => e.id === `f${i}`), 1); }
    }));
    const actor = {
      name: "orc", uuid: OTHER, effects: { [Symbol.iterator]: () => effects[Symbol.iterator](), get: (id) => effects.find((e) => e.id === id) ?? null, find: (f) => effects.find(f) },
      toggleStatusEffect: async (id, { active }) => { if (id === "flatFooted" && active === false) { log.toggled += 1; effects.length = 0; } }
    };
    return { actor, log, effects };
  };
  const plain = orc({});
  const keptPlain = await E.shedFlatFootedAtTurnEnd(plain.actor);
  ok("F2 an untimed Flat-Footed (a critical hit's) goes at its owner's turn end, by the toggle, as always", keptPlain === 0 && plain.log.toggled === 1 && plain.effects.length === 0);
  const stamp = { endsAtTurnEndOf: { of: OTHER, castTurn: "2:cOrc" } };
  const timed = orc(stamp);
  const keptTimed = await E.shedFlatFootedAtTurnEnd(timed.actor);
  ok("F3 one with its own turn clock stays: no toggle, nothing deleted", keptTimed === 1 && timed.log.toggled === 0 && timed.effects.length === 1);
  const both = orc({}, stamp);
  await E.shedFlatFootedAtTurnEnd(both.actor);
  equal("F4 with both: the untimed one is deleted, the clocked one kept", { deleted: both.log.deleted, left: both.effects.map((e) => e.id), toggled: both.log.toggled }, { deleted: ["f0"], left: ["f1"], toggled: 0 });
  const redirected = orc(stamp);
  const sameTurn = await E.expireAtTurnEnd(redirected.actor, { turnOf: { uuid: OTHER }, round: 2, combatantId: "cOrc" });
  await E.shedFlatFootedAtTurnEnd(redirected.actor);
  const nextTurn = await E.expireAtTurnEnd(redirected.actor, { turnOf: { uuid: OTHER }, round: 3, combatantId: "cOrc" });
  ok("F5 laid on the orc's own turn 'until the end of its next turn': it outlasts that turn and ends as the next one ends",
    sameTurn.length === 0 && nextTurn.length === 1 && redirected.effects.length === 0, JSON.stringify({ sameTurn, nextTurn }));
  const CB = read("module", "documents", "combat.mjs");
  const end = CB.slice(CB.indexOf("  async _onEndTurn(combatant, context) {"));
  ok("F6 _onEndTurn sheds Flat-Footed through the helper, after the turn-end sweep, and toggles it nowhere else there",
    /if \(actor\.hasCondition\?\.\("flatFooted"\)\) await shedFlatFootedAtTurnEnd\(actor\);/.test(end)
    && end.indexOf("expireAtTurnEnd(subject") < end.indexOf("await shedFlatFootedAtTurnEnd(actor)")
    && !/toggleStatusEffect\("flatFooted", \{ active: false \}\)/.test(end.slice(0, end.indexOf("\n  async ", 10))));
}

/* K */
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  const marked = [];
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (D.parseSpellDuration(v.system?.duration)?.untilTurnEnd) marked.push(v.name);
    }
  } finally { await db.close(); }
  equal("K1 the three spells with this duration all read it", marked.sort(), ["Enchanting Utterance", "Seer’s Vision", "Shifting Step"]);
}

const EXPECTED = 27;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-turn-end-clock: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-turn-end-clock: OK — ${checks} checks`);
