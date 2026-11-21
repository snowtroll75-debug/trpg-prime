#!/usr/bin/env node
/**
 * verify-turn-start-clock — core 3.707.1: Graham's two answers of
 * 21 November 2026 to the 3.707.0 questions.
 *
 *   1. "Any spell that has a duration of 'until the start of your next turn'
 *      should end at the beginning of the characters turn, so yes change it
 *      and other spells that have the same issue."
 *   2. A Stone Shield cast from the sheet with several enemies targeted:
 *      limited to one — "Yes it should".
 *
 *   P  the parser marks the phrase ("your" only)
 *   C  the clock: the caster stamped, no round clock, a two-round backstop
 *   S  the sweep ends it at that caster's turn start, on every creature
 *      carrying it, and not at anybody else's (driven, with fake creatures)
 *   W  every spell-effect writer that copies the round clock copies the stamp
 *   R  conditions carry it, through the GM's relay too
 *   K  the pack's six spells with that duration
 *   F  one foe for a ward that declares it, refused before anything is spent
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

/* P — the parser ----------------------------------------------------------- */
{
  ok("P1 'until the start of your next turn' is marked", D.parseSpellDuration("until the start of your next turn")?.untilTurnStart === true);
  ok("P2 'beginning' too, any case", D.parseSpellDuration("Until the Beginning of your next turn")?.untilTurnStart === true);
  ok("P3 still one round and six seconds, for the clocks out of an encounter",
    D.parseSpellDuration("until the start of your next turn")?.rounds === 1 && D.parseSpellDuration("until the start of your next turn")?.seconds === 6);
  ok("P4 'its' or 'their' next turn is not the caster's, and is not marked",
    !D.parseSpellDuration("until the start of its next turn")?.untilTurnStart && !D.parseSpellDuration("until the start of their next turn")?.untilTurnStart);
  ok("P5 '1 round' and 'until the end of your next turn' are unchanged",
    !D.parseSpellDuration("1 round")?.untilTurnStart && D.parseSpellDuration("until the end of your next turn")?.rounds === 2
    && !D.parseSpellDuration("until the end of your next turn")?.untilTurnStart);
}

/* C — the clock ------------------------------------------------------------ */
{
  const parsed = { ...D.parseSpellDuration("until the start of your next turn"), turnStartOf: CASTER };
  equal("C1 in an encounter: the caster, and a backstop two rounds of world time on", D.turnStartClock(parsed, { inCombat: true, worldTime: 600 }), { turnStartOf: CASTER, backstopEnd: 612 });
  ok("C2 out of an encounter: no turn to wait for, the six seconds stand", D.turnStartClock(parsed, { inCombat: false, worldTime: 600 }) === null);
  ok("C3 no caster named, or a phrase that is not marked: nothing", D.turnStartClock({ ...parsed, turnStartOf: "" }, { inCombat: true }) === null
    && D.turnStartClock({ ...D.parseSpellDuration("1 round"), turnStartOf: CASTER }, { inCombat: true }) === null);
  const ED = read("module", "magic", "effect-duration.mjs");
  ok("C4 the backstop lies past the next round boundary, so it cannot end it first", /const TURN_START_BACKSTOP_SECONDS = 12;/.test(ED)
    && D.turnStartClock(parsed, { inCombat: true, worldTime: 0 }).backstopEnd > 6);
  const SE = read("module", "magic", "spell-effects.mjs");
  const timing = SE.slice(SE.indexOf("function spellExpiryTiming(parsed) {"), SE.indexOf("if (out.spellEffect) out.foundryDuration = undefined;"));
  ok("C5 the cast's timing drops the round clock for it and keeps the backstop",
    /if \(atTurnStart\) \{\n\s+out\.spellEffect = true;\n\s+out\.expiresRound = null;\n\s+out\.spellEffectEnd = atTurnStart\.backstopEnd;\n\s+out\.turnStartOf = atTurnStart\.turnStartOf;/.test(timing)
    && /inCombat: Boolean\(game\.combat\?\.started\)/.test(timing));
  ok("C6 the cast stamps its CASTER on each effect's own duration",
    /const parsedDuration = parseSpellDuration\(durationSource\);\n[\s\S]{0,200}if \(parsedDuration\?\.untilTurnStart && caster\?\.uuid\) parsedDuration\.turnStartOf = caster\.uuid;/.test(SE));
  const { spellEffectDurationLabel } = await mod("magic", "spell-effects.mjs");
  ok("C7 the sheet says how it ends, not the backstop's seconds",
    /if \(effect\?\.flags\?\.\[SYSTEM_ID\]\?\.endsAtTurnStartOf\) return "Until the start of the caster's next turn";/.test(SE)
    && (spellEffectDurationLabel({ flags: { "trg-prime": { endsAtTurnStartOf: CASTER, spellEffectEnd: 612 } } }, 600) === "Until the start of the caster's next turn"));
}

/* S — the sweep, driven ------------------------------------------------------ */
{
  const E = await mod("combat", "effect-application-workflow.mjs");
  const bearer = (name, stamp) => {
    const gone = [];
    const effects = [{
      id: "e1", uuid: `Actor.${name}.ActiveEffect.e1`, name: "Stone Shield", disabled: false, statuses: new Set(),
      flags: { "trg-prime": stamp },
      getFlag: (s, k) => stamp[k],
      delete: async () => { gone.push("e1"); effects.length = 0; }
    }];
    return { actor: { name, uuid: `Actor.${name}`, effects: { [Symbol.iterator]: () => effects[Symbol.iterator](), get: (id) => effects.find((e) => e.id === id) ?? null, find: (f) => effects.find(f) } }, gone };
  };
  {
    const ally = bearer("ally", { endsAtTurnStartOf: CASTER, spellEffect: true, spellEffectEnd: 612 });
    const atOrc = await E.expireTimedConditions(ally.actor, 2, { turnOf: { uuid: OTHER } });
    const atWiz = await E.expireTimedConditions(ally.actor, 2, { turnOf: { uuid: CASTER } });
    ok("S2 an ally's effect outlasts the orc's turn and ends at the caster's", atOrc.length === 0 && ally.gone.length === 1 && atWiz.length === 1, JSON.stringify({ atOrc, atWiz, gone: ally.gone }));
  }
  {
    const timed = bearer("orc", { conditionExpiresRound: 3 });
    const early = await E.expireTimedConditions(timed.actor, 2, { turnOf: { uuid: OTHER } });
    const due = await E.expireTimedConditions(timed.actor, 3, { turnOf: { uuid: OTHER } });
    ok("S1 a round clock still ends as before, at its round and not sooner", early.length === 0 && due.length === 1 && timed.gone.length === 1);
  }
  {
    const other = bearer("ally2", { endsAtTurnStartOf: OTHER });
    const atWiz = await E.expireTimedConditions(other.actor, 9, { turnOf: { uuid: CASTER } });
    ok("S1b a stamp naming another caster is not ended by this one's turn", atWiz.length === 0 && other.gone.length === 0);
  }
  {
    const self = bearer("wiz", { endsAtTurnStartOf: CASTER });
    const none = await E.expireTimedConditions(self.actor, 5);
    ok("S3 a sweep that names no turn ends nothing it should not", none.length === 0 && self.gone.length === 0);
  }
  const CB = read("module", "documents", "combat.mjs");
  ok("S4 both turn-start sweeps name the creature whose turn it is",
    (CB.match(/await expireTimedConditions\(subject, this\.round, \{ turnOf: actor \}\)/g) ?? []).length === 2
    && !/await expireTimedConditions\(subject, this\.round\)\)/.test(CB));
  const EA = read("module", "combat", "effect-application-workflow.mjs");
  ok("S5 the sweep reads both stamps through the one rule", /if \(!dueAtTurnStart\(stamp, \{ round: currentRound, turnOfUuid \}\)\) continue;/.test(EA));
}

/* W — every writer ------------------------------------------------------------ */
{
  const SE = read("module", "magic", "spell-effects.mjs");
  const lines = SE.split("\n");
  const copies = lines.map((l, i) => [l, i]).filter(([l]) => /^\s*if \((\w+)\.expiresRound != null\) [\w.]+(?:\[SYSTEM_ID\])?\.conditionExpiresRound = \1\.expiresRound;$/.test(l));
  const paired = copies.filter(([l, i]) => {
    const t = /if \((\w+)\.expiresRound/.exec(l)[1];
    const f = /\) ([\w.]+(?:\[SYSTEM_ID\])?)\.conditionExpiresRound/.exec(l)[1];
    return lines[i + 1]?.trim() === `if (${t}.turnStartOf) ${f}.endsAtTurnStartOf = ${t}.turnStartOf;`;
  });
  ok("W1 every effect that copies the cast's round clock copies the turn-start stamp beside it", copies.length >= 60 && paired.length === copies.length,
    `${paired.length} of ${copies.length}`);
}

/* R — conditions, and the relay ---------------------------------------------- */
{
  const SE = read("module", "magic", "spell-effects.mjs");
  ok("R1 a spell's condition passes the stamp", /spellEffectEnd: timing\.spellEffectEnd,\n\s+\/\/ "UNTIL THE START OF YOUR NEXT TURN" \(3\.707\.1\)\.\n\s+endsAtTurnStartOf: timing\.turnStartOf \?\? null,/.test(SE)
    && /endsAtTurnStartOf: tetherTiming\.turnStartOf \?\? null,/.test(SE));
  const EA = read("module", "combat", "effect-application-workflow.mjs");
  ok("R2 the condition writer stamps it, only on a condition it laid",
    /if \(endsAtTurnStartOf\) updates\[`flags\.\$\{SYSTEM_ID\}\.\$\{TURN_START_FLAG\}`\] = String\(endsAtTurnStartOf\);/.test(EA)
    && (EA.match(/endsWith: timing\.endsWith, expiresTime: timing\.expiresTime, followOn: timing\.followOn,\n\s+endsAtTurnStartOf, endsAtTurnEndOf\n/g) ?? []).length === 2);
  ok("R3 and hands it to the GM's client", /\{ expiresRound, duration, spellEffect, spellEffectEnd, castId, sourceTraits, endsAtTurnStartOf, endsAtTurnEndOf \},/.test(EA)
    && /"sourceTraits", "endsAtTurnStartOf", "endsAtTurnEndOf"\]\)/.test(read("module", "combat", "target-relay-workflow.mjs")));
  const R = await mod("combat", "target-relay.mjs");
  const seen = [];
  await R.performRelay({ action: R.RELAY_ACTIONS.CONDITIONS, uuid: "Actor.a", payload: { tags: [{ key: "prone" }], options: { endsAtTurnStartOf: CASTER } } },
    { fromUuid: async () => ({ uuid: "Actor.a" }), applyConditionTags: async (t, tags, o) => { seen.push(o.endsAtTurnStartOf); return []; } });
  await R.performRelay({ action: R.RELAY_ACTIONS.CONDITIONS, uuid: "Actor.a", payload: { tags: [], options: { endsAtTurnStartOf: { evil: 1 } } } },
    { fromUuid: async () => ({ uuid: "Actor.a" }), applyConditionTags: async (t, tags, o) => { seen.push(o.endsAtTurnStartOf); return []; } });
  equal("R4 the GM's client lays it as sent — a uuid, and nothing that is not one", seen, [CASTER, null]);
}

/* K — the pack's spells -------------------------------------------------------- */
{
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", "spells"), { valueEncoding: "json" });
  const marked = [];
  try {
    for await (const [k, v] of db.iterator()) {
      if (!k.startsWith("!items!") || v?.type !== "spell") continue;
      if (D.parseSpellDuration(v.system?.duration)?.untilTurnStart) marked.push(v.name);
    }
  } finally { await db.close(); }
  equal("K1 the six spells with this duration all read it", marked.sort(), ["Guidance", "Gust", "Invulnerability", "Stone Shield", "True Target", "Weapon Surge"]);
}

/* F — one foe ------------------------------------------------------------------- */
{
  const { wardFoeRefusal } = await mod("magic", "ward.mjs");
  const stone = { effects: [{ kind: "ward", foes: 1 }] };
  equal("F1 one foe raised against; none or three refused, saying why",
    [wardFoeRefusal(stone, 1, "Stone Shield"), wardFoeRefusal(stone, 0, "Stone Shield"), wardFoeRefusal(stone, 3, "Stone Shield")],
    ["", "Stone Shield: target the foe to raise it against.", "Stone Shield is raised against one foe — you have 3 enemies targeted. Target only the one."]);
  ok("F2 a ward that declares no number is not limited (Forbidding Ward, Anticipations)", wardFoeRefusal({ effects: [{ kind: "ward" }] }, 4) === "" && wardFoeRefusal({}, 0) === "");
  const CW = read("module", "magic", "cast-workflow.mjs");
  const at = CW.indexOf("const refusedFoes = wardFoeRefusal(spellData, hostile, spell.name);");
  ok("F3 asked after the target set is final and before anything is spent",
    at > CW.indexOf("const refusal = dispositionRefusal(actor, spell, Array.from(game.user?.targets ?? []));")
    && at < CW.indexOf("const castReceipt = apPaid ? null : await spendActionCost(actor, totalCastAP, spell.name);"));
  ok("F4 counting enemies as the applier does", /keepByDisposition\(Number\(t\.document\?\.disposition \?\? 0\), casterDisposition, "enemies"\)\)\.length;/.test(CW)
    && /if \(refusedFoes\) \{\n\s+ui\.notifications\.warn\(refusedFoes\);\n\s+return null;/.test(CW));
}

const EXPECTED = 29;
checks += 1;
if (checks !== EXPECTED) failures.push(`Z the suite ran ${checks} checks, expected ${EXPECTED}`);
if (failures.length) {
  console.log(`verify-turn-start-clock: FAILED — ${failures.length} of ${checks}`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-turn-start-clock: OK — ${checks} checks`);
