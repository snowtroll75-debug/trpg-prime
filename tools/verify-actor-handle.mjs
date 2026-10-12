#!/usr/bin/env node
/**
 * verify-actor-handle — naming a creature so it can be found again.
 *
 * NEW at 3.469.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * AN ACTOR ID DOES NOT NAME A CREATURE.
 *
 * An UNLINKED token has a SYNTHETIC actor whose `.id` is the BASE actor's
 * id, so `game.actors.get(someActorId)` returns the sheet in the sidebar
 * and not the creature on the map. Most NPCs are unlinked.
 *
 * IT IS INVISIBLE FROM THE CARD, which is why this file exists rather
 * than a note in a header. Every affected site prints the right name —
 * the sheet and the token share it. The only symptom is an HP bar that
 * does not move or a reaction pool that never empties.
 *
 * FOUND BY DRIVING WAR CRY on 2 September 2026: the card read "a further
 * 6 sonic to ZZ Undead Foe (1d6 rolled 6)", the base actor fell to 24/30,
 * and the token that had been hit sat at 27/30. Surveying the tree
 * afterwards found ten more sites of the same shape.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SECTION S IS A RATCHET, AND IT MAY ONLY SHRINK.
 *
 * Three sites were converted at 3.469.0 — the ones a normal session hits.
 * The rest are DECLARED, with what each would do wrong, so that they are
 * a list somebody is working through rather than a thing nobody
 * remembers. The same shape as the printed-damage backlog and the
 * uncalled-export ratchet: a new one is a failure, a fixed one must be
 * removed.
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  HANDLE_KEYS, actorHandle, handleIsPrecise, handleIsEmpty,
  preferredHandleKey, IMPRECISE_HANDLE_NOTE
} from "../module/actor-handle.mjs";

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

/* ── H. THE HANDLE ───────────────────────────────────────────────── */
const TOKEN = { id: "tok1" };
const SYNTH = { id: "base1", uuid: "Scene.s1.Token.tok1.Actor.base1" };
const WORLD = { id: "base1", uuid: "Actor.base1" };

ok("H1 a handle records all three keys",
  JSON.stringify(actorHandle(SYNTH, TOKEN))
  === JSON.stringify({ actorId: "base1", tokenId: "tok1", actorUuid: "Scene.s1.Token.tok1.Actor.base1" }));
ok("H2 a world actor with no token still records what it has",
  actorHandle(WORLD, null).tokenId === null && actorHandle(WORLD, null).actorUuid === "Actor.base1");
ok("H3 an empty handle is recognised", handleIsEmpty(actorHandle(null, null)) === true);
ok("H4 and a populated one is not", handleIsEmpty(actorHandle(SYNTH, TOKEN)) === false);

/*
 * H5 IS THE WHOLE POINT OF THE FILE. A handle carrying only an actorId
 * cannot tell an unlinked token from the sheet it was stamped from, so it
 * is NOT precise — and code holding one should say so rather than act as
 * though it knew which creature it meant.
 */
ok("H5 AN ID-ONLY HANDLE IS NOT PRECISE",
  handleIsPrecise({ actorId: "base1", tokenId: null, actorUuid: null }) === false,
  "it names a species, not a creature");
ok("H6 a token id makes it precise", handleIsPrecise({ actorId: "base1", tokenId: "tok1" }) === true);
ok("H7 so does a uuid", handleIsPrecise({ actorId: "base1", actorUuid: "Scene.s1.Token.tok1.Actor.base1" }) === true);

/*
 * O. THE ORDER IS THE FIX.
 *
 * Token first (the creature on the map), then uuid (exact across
 * scenes), then the bare id — which is the only key that can resolve to
 * the wrong document, and is tried LAST precisely because of that. A
 * resolver that asked the id first would be the original defect with
 * more fields, and would pass every other check in this file.
 */
ok("O1 the token is preferred", preferredHandleKey(actorHandle(SYNTH, TOKEN)) === "tokenId");
ok("O2 then the uuid", preferredHandleKey({ actorUuid: "Actor.base1", actorId: "base1" }) === "actorUuid");
ok("O3 THE BARE ID IS LAST", preferredHandleKey({ actorId: "base1" }) === "actorId",
  "it is the only key that can name the wrong document");
ok("O4 an empty handle prefers nothing", preferredHandleKey({}) === null);
ok("O5 the declared order matches", HANDLE_KEYS.join(",") === "tokenId,actorUuid,actorId");
/*
 * O6 READS ONLY `resolveActorHandle`'s BODY, and the first draft did not.
 *
 * It ran `indexOf` over the whole file — and `handleIsEmpty` lists all
 * three keys in exactly the right order thirty lines ABOVE the resolver.
 * So the check measured that function instead, and the mutation that
 * inverted the real order SURVIVED. A claim about one function has to be
 * asked of that function.
 */
ok("O6 and the resolver follows it", (() => {
  const src = strip(read("module", "actor-handle.mjs"));
  const at = src.indexOf("export async function resolveActorHandle");
  if (at === -1) return false;
  const body = src.slice(at);
  const t = body.indexOf("handle?.tokenId");
  const u = body.indexOf("handle?.actorUuid");
  const a = body.indexOf("handle?.actorId");
  return t > -1 && u > -1 && a > -1 && t < u && u < a;
})(), "resolveActorHandle must try token, then uuid, then id");
ok("O7 there is a sentence for an imprecise card", IMPRECISE_HANDLE_NOTE.length > 20);

/* ── C. THE SITES CONVERTED AT 3.469.0 ───────────────────────────── */
const action = strip(read("module", "combat", "action-workflow.mjs"));
const cards = strip(read("module", "dice", "check-card-interactions.mjs"));
const reactions = strip(read("module", "combat", "reaction-feats-workflow.mjs"));
const attack = strip(read("module", "combat", "attack-workflow.mjs"));

// EVERY BRANCH, and the first draft asked for one. `healCard` is built
// three ways — a heal, a condition reduction, and (3.549.0) a condition
// INCREASE for Resuscitation's failed stabilisation — and a check
// satisfied by any one of them let the mutation that stripped another
// survive on the strength of the rest.
//
// COUNTED AGAINST THE BUILDS THEMSELVES, not against a number typed here
// (3.549.0). The bare `=== 2` went red the moment a legitimate third
// branch arrived, which is the right alarm for the wrong reason: what
// matters is that no build lacks a handle. Both halves are asserted, so
// a branch that loses its handle AND a branch that quietly disappears
// are each caught.
const healCardBuilds = (action.match(/healCard: \{/g) ?? []).length;
const healCardHandles = (action.match(/handle: healHandle/g) ?? []).length;
ok("C1 the heal card records a handle",
  healCardBuilds === 3 && healCardHandles === healCardBuilds,
  `healCard is built for a heal, a condition reduction AND a condition increase — ` +
    `found ${healCardBuilds} builds carrying ${healCardHandles} handles`);
ok("C2 and the heal resolves by it first",
  cards.includes("(await resolveActorHandle(raw.handle))")
  && cards.indexOf("await resolveActorHandle(raw.handle)")
     < cards.indexOf("raw.targetActorId ? game.actors.get(raw.targetActorId)"),
  "an unlinked patient keeps its wound while the sidebar sheet gains the HP");
// THE TOKEN WAS ALREADY IN THE TUPLE AND WAS BEING DISCARDED.
ok("C3 reaction offers keep the candidate's token",
  reactions.includes("for (const { actor, token } of candidates)")
  && reactions.includes("actorHandle(actor, token ?? null)"),
  "reaction-feat-detection builds {actor, token} and only the actor was kept");
ok("C4 and a reaction resolves by the row's handle",
  reactions.includes("await resolveActorHandle(row?.handle)"),
  "otherwise an unlinked NPC's reaction pool never empties");
// C5 MATCHES THE FIELD NAMES, not one formatting of their arguments —
// the target handle now wraps across two lines because it takes the token
// from the actor, and a check pinned to the old single line failed on a
// change that was correct.
ok("C5 the critical-adjust card records both handles",
  /actorHandle: actorHandle\(/.test(attack) && /targetHandle: actorHandle\(/.test(attack));
// C6 IS PINNED INSIDE ITS OWN HANDLER (3.579.0). It used to look for the
// call anywhere in the file, and two more card buttons now make the same
// call — the subdual re-read and the Fatal-injury clear, both added for
// the block-19 audit — so removing it from `criticalAdjust` stopped
// failing this check. Pinned to the handler that the mutation edits.
ok("C6 and resolves by them first",
  /criticalAdjust[\s\S]{0,600}const targetActor = \(await resolveActorHandle\(raw\.targetHandle\)\)/.test(cards),
  "re-rolling a critical would apply dying and bleed to the sidebar sheet");

/* ── S. THE RATCHET ──────────────────────────────────────────────── */
/*
 * SITES STILL RESOLVING A MUTATED CREATURE BY BARE ACTOR ID.
 *
 * Each entry is a file that calls `game.actors.get(...)` on an id that
 * can come from a token, and then MUTATES what it gets. They are listed
 * so the remainder is a worklist rather than folklore. THE LIST MAY ONLY
 * SHRINK — removing a file means it was converted, and a file that
 * appears here without being added is a new instance of a defect this
 * project has already paid for once.
 */
const BARE_ID_BACKLOG = Object.freeze(new Map([
  ["module/combat/action-workflow.mjs",
    "restoreOutcomeContext resolves a resumed action's actor and target by id; "
    + "Rally's frightened reduction and a dying value land on the sidebar sheet"],
  ["module/skills.mjs",
    "Aid Another queues its +2 on the sidebar sheet, so the token's next roll never offers it"],
  ["module/combat/swift-pursuit.mjs",
    "an unlinked ranger's reaction is spent on the sidebar sheet, so the token pursues free every round"],
  ["module/combat/action-feat-detection.mjs",
    "Knife Flurry rolls from the sidebar sheet and its multiple-attack penalty lands there"],
  ["module/compendium-refresh.mjs",
    "item updates gathered from unlinked token actors are written to the sidebar actors; "
    + "the token fallback exists but is second, so it is unreachable for the case it was written for"],
  ["module/dice/check.mjs",
    // A RECORDING-SIDE GAP, NOT A RESOLVING ONE — and the distinction
    // cost this file a failing check. check.mjs never calls
    // `game.actors.get`; it writes `actorId: this.actor?.id` and
    // check-card-interactions.mjs resolves it later. Testing it for a
    // resolution it does not contain reported it as already converted.
    ["every check card records only actorId, so conviction, held bonuses and Natural Defence "
      + "are spent on the sidebar sheet", "records"]]
]));

/*
 * AN ENTRY IS EITHER A STRING OR A [why, kind] PAIR — and getting that
 * wrong cost three runs. The first draft wrote the pair as two extra
 * elements of the Map entry itself: `[file, why, kind]`. `new Map` takes
 * only the first two, so the kind was DISCARDED without complaint and
 * every entry read as "resolves". The check then reported check.mjs as
 * converted, which is the answer it was written to prevent.
 */
const backlogWhy = (v) => (Array.isArray(v) ? v[0] : v);
const backlogKind = (v) => (Array.isArray(v) ? v[1] : "resolves");
ok("S1 the backlog is declared with a reason each",
  [...BARE_ID_BACKLOG.values()].every((v) => backlogWhy(v).length > 30));
// TWO DIFFERENT GAPS, SAID APART. A file that RESOLVES by bare id is
// fixed by resolving differently; a file that RECORDS only an id is
// fixed where the record is written, and contains no resolution to find.
ok("S1b and says which half of the defect it is",
  [...BARE_ID_BACKLOG.values()].every((v) => ["resolves", "records"].includes(backlogKind(v))));
// EVERY FILE NAMED MUST EXIST. A backlog entry for a file that has been
// renamed or deleted is a line nobody can act on — the same half
// verify-printed-damage's B2 learned to add.
for (const file of BARE_ID_BACKLOG.keys()) {
  ok(`S2 ${file} is still in the tree`,
    fs.existsSync(path.join(SYSTEM_ROOT, file)),
    "a backlog entry must name something that exists");
}
/*
 * S3 IS THE RATCHET ITSELF. It counts files that both resolve by bare id
 * AND mutate, and refuses any that is not declared. It is deliberately
 * file-level rather than line-level: a line number would move on every
 * edit and the check would become noise nobody reads.
 */
/*
 * WHAT COUNTS AS MUTATING — AND THE GAP IN IT, WRITTEN DOWN.
 *
 * This test is FILE-LOCAL: it sees a mutation only if the call appears in
 * the same file as the resolution. `skills.mjs` resolves an ally by bare
 * id and mutates it one call away, through `addPendingModifier`, which
 * sets the flag in pending-modifiers.mjs — so the first draft of this
 * check declared skills.mjs in the backlog and then failed S4 for it,
 * because the detector could not see its own backlog entry.
 *
 * NAMED HELPERS ARE LISTED for the ones already known to mutate at one
 * remove. That closes the gap for those and not in general: a NEW helper
 * that mutates elsewhere would still be missed here. So S3 is a floor,
 * not a proof — the survey that produced the backlog was done by reading,
 * and reading is still what finds these.
 */
const MUTATES = new RegExp([
  "\\.update\\(", "toggleStatusEffect\\(", "applyDamageAndCheckDying\\(",
  "setFlag\\(", "createEmbeddedDocuments\\(", "updateEmbeddedDocuments\\(",
  // Mutating helpers that live in another file.
  "addPendingModifier\\(", "spendReaction\\(", "reapDead\\(",
  "awardConviction\\(", "markConvictionSpent\\(", "spendHeldBonus\\("
].join("|"));
const RESOLVES = /game\.actors\??\.get\??\.?\(/;
const offenders = [];
const resolvers = [];
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.name.endsWith(".mjs")) continue;
    const rel = path.relative(SYSTEM_ROOT, full).split(path.sep).join("/");
    const src = strip(fs.readFileSync(full, "utf8"));
    if (!RESOLVES.test(src)) continue;
    resolvers.push(rel);
    if (!MUTATES.test(src)) continue;
    offenders.push(rel);
  }
};
walk(path.join(SYSTEM_ROOT, "module"));

const CLEARED = new Set([
  // Converted at 3.469.0 — these still contain a bare-id FALLBACK, which
  // is deliberate: a card written before this version carries no handle.
  "module/combat/reaction-feats-workflow.mjs",
  "module/dice/check-card-interactions.mjs",
  "module/combat/attack-workflow.mjs",
  // Correct before this file existed, and the shape it was copied from.
  "module/combat/opportunity.mjs",
  "module/modifier/app.mjs",
  // Base actors by design: a familiar's or companion's master is a world
  // actor bound by id, and the compendium's own documents are not tokens.
  "module/companion-workflow.mjs",
  "module/familiar-workflow.mjs",
  "module/sheets/actor-sheet.mjs",
  "module/foundry-integration-check.mjs",
  "module/actor-handle.mjs",
  // Fixed at 3.468.0 — War Cry, the site that started all this. It keeps
  // a bare-id fallback for a record written before that version.
  "module/magic/spell-effects.mjs"
]);

const undeclared = offenders.filter((f) => !BARE_ID_BACKLOG.has(f) && !CLEARED.has(f));
ok("S3 NO NEW SITE RESOLVES A MUTATED CREATURE BY BARE ACTOR ID",
  undeclared.length === 0,
  `${undeclared.length} undeclared: ${undeclared.join(", ")}`);
// AND THE BACKLOG MAY NOT OUTLIVE ITSELF.
// S4 ASKS WHETHER THE FILE STILL RESOLVES BY BARE ID, which is what the
// backlog entry actually names. Asking `offenders` instead would make an
// entry disappear the moment my mutation detector stopped recognising it,
// which is how the first draft failed for skills.mjs.
const goneClean = [...BARE_ID_BACKLOG.entries()].filter(([file, v]) => (
  // GONE MEANS THE DEFECT IS NO LONGER THERE — and the first draft of
  // this predicate said "still there" for the recording half, which put
  // check.mjs in the converted list for exactly the reason it should have
  // stayed out of it. The two halves must both mean "fixed".
  backlogKind(v) === "records"
    ? !(/actorId:/.test(strip(read(...file.split("/"))))
        && !/actorHandle\(/.test(strip(read(...file.split("/")))))
    : !resolvers.includes(file)
)).map(([file]) => file);
ok("S4 and no backlog entry outlives the defect it names",
  goneClean.length === 0,
  `converted, so remove from the list: ${goneClean.join(", ")}`);

if (failures.length) {
  process.stderr.write(`verify-actor-handle: ${failures.length} of ${checks} FAILED\n`);
  for (const f of failures) process.stderr.write(`  - ${f}\n`);
  process.exit(1);
}
process.stdout.write(
  `verify-actor-handle: OK — ${checks} checks, ${BARE_ID_BACKLOG.size} files still resolving a mutated creature by bare id.\n`);
