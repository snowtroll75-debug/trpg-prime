#!/usr/bin/env node
/**
 * verify-session-fixes-1022 — 3.666.1: the three defects Graham reported
 * after the session of 21–22 October 2026.
 *
 *   A  "The spell orb of fire is inflicting no damage (and not adding its
 *      critical effect)." A player's critical laid recurring fire on the GM's
 *      creature with a direct toggle, which threw and lost the whole cast.
 *      Every condition toggle on a creature the user does not own now goes
 *      through the GM, from the Actor itself.
 *   B  The other direct writes on that path: a death rung's reaping, a drop
 *      to a stated HP below zero, and Soul Destruction's mark.
 *   C  "The spell Hurling is not adding magical ability score to its
 *      damage." `addAbility: "casting"`, the cast's own ability, the pack,
 *      and the owned copies.
 *   D  "Nimble Dodge still isn't giving any option for the player to use."
 *      A reaction to being attacked is offered to the defender's player
 *      before every attack rolls.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

/* ------------------------------------------------------------------ */
/* A — a condition on somebody else's creature goes through the GM     */
/* ------------------------------------------------------------------ */
const relay = await mod("combat", "target-relay.mjs");
const player = { isGM: false };
const gm = { isGM: true };
equal("A1 a player toggling a creature it does not own relays; its own does not",
  [relay.statusRelayNeeded({ isOwner: false }, player), relay.statusRelayNeeded({ isOwner: true }, player)], [true, false]);
equal("A2 the GM never relays, nor a client with no user",
  [relay.statusRelayNeeded({ isOwner: false }, gm), relay.statusRelayNeeded({ isOwner: false }, null)], [false, false]);
equal("A3 the options carried are plain data, and only the ones the GM's toggle reads",
  relay.relayableStatusOptions({ value: "3", damageType: "fire", active: 1, overlay: 0, render: () => 1, extra: { a: 1 } }),
  { active: true, value: 3, damageType: "fire", overlay: false });
equal("A4 a player cannot ask for the GM's immunity override through the relay",
  relay.relayableStatusOptions({ value: 2, force: true }), { value: 2 });
const actorSrc = read("module", "documents", "actor.mjs");
const toggle = actorSrc.slice(actorSrc.indexOf("async toggleStatusEffect(statusId, options = {}) {"));
const iImmune = toggle.indexOf("this.isImmuneToCondition(statusId)");
const iRelay = toggle.indexOf("if (statusRelayNeeded(this, game.user)) {");
const iSuper = toggle.indexOf("if (!condition?.valued) return super.toggleStatusEffect(statusId, options);");
ok("A5 the Actor's own toggle relays — after its immunity guard, before any write", iImmune > 0 && iRelay > iImmune && iSuper > iRelay);
ok("A6 …through relayStatus with the plain options, and says so when no GM answers",
  /const ok = await relayStatus\(this, statusId, relayableStatusOptions\(options\), \(\) => false\);\s*if \(!ok\) \{\s*ui\.notifications\?\.warn\?\./.test(toggle));
ok("A7 a valued condition asked with no value is refused, not sent to open a dialog on the GM's screen",
  /if \(condition\?\.valued && options\.value === undefined && options\.active !== false\) \{[\s\S]{0,200}return undefined;/.test(toggle.slice(iRelay, iSuper)));
const toggled = [];
const perf = await relay.performRelay({ action: relay.RELAY_ACTIONS.STATUS, uuid: "Actor.x", payload: { status: "recurring", options: { value: 2, damageType: "fire" } } }, {
  fromUuid: async () => ({ id: "x" }), toggleStatus: async (t, s, o) => { toggled.push([s, o]); }
});
equal("A8 the GM's client lays the recurring fire it was asked to, with its value and type", [perf.ok, toggled], [true, [["recurring", { value: 2, damageType: "fire" }]]]);
const castSrc = read("module", "magic", "cast-workflow.mjs");
ok("A9 THE ORB OF FIRE PATH: a spell attack's recurring rider is still laid by the Actor's toggle (now relayed)",
  /await targetActor\.toggleStatusEffect\("recurring", \{\s*value: next\.value, damageType: next\.damageType\s*\}\);/.test(castSrc));

/* ------------------------------------------------------------------ */
/* B — the other direct writes on a player's cast                      */
/* ------------------------------------------------------------------ */
const ds = await mod("combat", "death-state.mjs");
equal("B1 a player's client never reaps a creature it does not own; the GM's death watch does",
  [ds.reapsHere({ isOwner: false }, player), ds.reapsHere({ isOwner: true }, player), ds.reapsHere({ isOwner: false }, gm), ds.reapsHere({ isOwner: false }, null)],
  [false, true, true, true]);
const dsSrc = read("module", "combat", "death-state.mjs");
ok("B2 reapDead asks it before anything is read or written", /if \(!actor\) return out;\s*(\/\/[^\n]*\n\s*)*if \(!reapsHere\(actor, globalThis\.game\?\.user \?\? null\)\) return out;/.test(dsSrc));
const dyingSrc = read("module", "combat", "dying-workflow.mjs");
ok("B3 a drop to a stated HP on a creature not ours goes through the GM",
  /export async function enterDyingAt\(actor, finalHP, \{ isCritical = false \} = \{\}\) \{\s*if \(!actor\) return \{ case: "none", newHP: 0 \};[\s\S]{0,600}if \(!actor\.isOwner\) \{\s*const \{ relayDyingAt \} = await import\("\.\/target-relay-workflow\.mjs"\);\s*return relayDyingAt\(actor, finalHP, \{ isCritical \}, \(\) => null\);/.test(dyingSrc));
const dropped = [];
const perfDrop = await relay.performRelay({ action: relay.RELAY_ACTIONS.DYING_AT, uuid: "Actor.x", payload: { finalHP: "-10", isCritical: true } }, {
  fromUuid: async () => ({ id: "x" }), enterDyingAt: async (t, hp, o) => { dropped.push([hp, o]); return { case: "dropped-below-zero", newHP: hp }; }
});
equal("B4 the GM's client runs the dying rule's own branch with the numbers it reads", [perfDrop.ok, dropped], [true, [[-10, { isCritical: true }]]]);
const perfBad = await relay.performRelay({ action: relay.RELAY_ACTIONS.DYING_AT, uuid: "Actor.x", payload: { finalHP: "lots" } }, { fromUuid: async () => ({}), enterDyingAt: async () => { throw new Error("must not run"); } });
equal("B5 …and refuses a request that names no number", perfBad.ok, false);
const recorded = [];
const perfSoul = await relay.performRelay({ action: relay.RELAY_ACTIONS.INJURY_RECORD, uuid: "Actor.x", payload: { kind: "soulDestroyed", entry: { spellName: "Soul Destruction", worldTime: 5 } } }, {
  fromUuid: async () => ({}), recordInjury: async (t, kind, entry) => { recorded.push([kind, entry]); return true; }
});
equal("B6 Soul Destruction's mark is a named record the GM may write", [perfSoul.ok, recorded[0]?.[0]], [true, "soulDestroyed"]);
ok("B7 …and the cast writes it through the relay, not directly",
  /await relayInjuryRecord\(target, "soulDestroyed", \{ spellName: spell\.name, worldTime \},\s*\(\) => target\.setFlag\?\.\(SYSTEM_ID, SOUL_DESTROYED_FLAG, soulDestroyedRecord\(spell\.name, worldTime\)\)\);/.test(castSrc)
  && !/await target\.setFlag\?\.\(SYSTEM_ID, SOUL_DESTROYED_FLAG,\s*soulDestroyedRecord\(spell\.name, Number/.test(castSrc));
const rwSrc = read("module", "combat", "target-relay-workflow.mjs");
ok("B8 the GM's client builds the mark from the two fields it reads, and runs enterDyingAt itself",
  /if \(kind === "soulDestroyed"\) \{[\s\S]{0,300}soulDestroyedRecord\(String\(entry\.spellName \?\? ""\), Number\(entry\.worldTime\) \|\| 0\)\);/.test(rwSrc)
  && /enterDyingAt: async \(target, finalHP, options\) => \{[\s\S]{0,120}return enterDyingAt\(target, finalHP, options\);/.test(rwSrc));

/* ------------------------------------------------------------------ */
/* C — Hurling's "+ magical ability score"                             */
/* ------------------------------------------------------------------ */
const sda = await mod("magic", "spell-damage-ability.mjs");
const caster = { attributes: { intelligence: { total: 4 }, wisdom: { total: 2 }, strength: { total: 1 } }, magic: { castingAbility: "intelligence" } };
equal("C1 a row may say \"casting\"; a named ability still reads as before; nonsense reads as none",
  [sda.damageAbility({ addAbility: "Casting" }), sda.damageAbility({ addAbility: "strength" }), sda.damageAbility({ addAbility: "luck" })], ["casting", "strength", ""]);
equal("C2 HURLING: 1d6 + the ability the cast was made with",
  sda.withDamageAbility("1d6", { addAbility: "casting" }, caster, "wisdom"), { formula: "1d6 + 2", added: 2, ability: "wisdom" });
equal("C3 with no key handed in, the sheet's own casting ability",
  sda.withDamageAbility("1d6", { addAbility: "casting" }, caster), { formula: "1d6 + 4", added: 4, ability: "intelligence" });
equal("C4 a negative score subtracts; Guiding Stone's Strength is unchanged",
  [sda.withDamageAbility("1d6", { addAbility: "casting" }, { attributes: { charisma: { total: -1 } } }, "charisma").formula,
    sda.withDamageAbility("2d6", { addAbility: "strength" }, caster, "wisdom").formula], ["1d6 - 1", "2d6 + 1"]);
ok("C5 the spell attack hands the cast's key to the damage formula",
  /dmg, actor\.system \?\? \{\}, castingAbilityKey\)\.formula;/.test(castSrc)
  && /extraAttackRows = \[\],\s*\/\/[^\n]*\n\s*castingAbilityKey = ""\s*\} = \{\}\) \{/.test(castSrc)
  && /castingAbilityKey: castAbilityKey\s*\}\);/.test(castSrc));
ok("C6 …and that key is the innate spell's own, else the Spellcraft swap, else the sheet's",
  /const castAbilityKey = String\(\(isInnate \? innateAbilityAttr : \(swapAbility \?\? system\.magic\?\.castingAbility\)\) \?\? ""\);/.test(castSrc));
const { PACK_REPAIRS } = await mod("data", "pack-repairs.mjs");
const hurl = PACK_REPAIRS.filter((r) => r.name === "Hurling");
equal("C7 owned copies are repaired: the damage row and the retired note, since 3.666.1",
  hurl.map((r) => [r.field, r.since, r.to?.addAbility ?? r.to]), [["damage", "3.666.1", "casting"], ["effects", "3.666.1", []]]);
const mig = read("module", "migration.mjs");
// THE STAMP MAY MOVE ON PAST THE PASS (3.666.3 raised it for the stale
// queued copies); what matters is that it still reaches 3.666.1.
const stamp1022 = (/export const TRG_SCHEMA_VERSION = "([\d.]+)";/.exec(mig)?.[1] ?? "0").split(".").map(Number);
const reaches1022 = stamp1022[0] > 3 || (stamp1022[0] === 3 && (stamp1022[1] > 666 || (stamp1022[1] === 666 && stamp1022[2] >= 1)));
ok("C8 the migration's pack-copy pass is raised to 3.666.1, and the stamp reaches it",
  /runIf\("3\.666\.1", "stale owned copies of repaired pack items"/.test(mig) && reaches1022);
const fixes = JSON.parse(read("tools", "data-fixes.json")).fixes.filter((f) => f.name === "Hurling");
equal("C9 the pack edit is declared in data-fixes", fixes.map((f) => f.path), ["system.damage", "system.effects"]);
const spellDir = path.join(SYSTEM_ROOT, "packs", "spells");
let packHurling = null;
if (fs.existsSync(spellDir)) {
  const { ClassicLevel } = await import("classic-level");
  const db = new ClassicLevel(spellDir, { valueEncoding: "json" });
  await db.open();
  for await (const [key, value] of db.iterator()) if (key.startsWith("!items!") && value?.name === "Hurling") packHurling = value.system;
  await db.close();
}
equal("C10 the pack's Hurling adds the casting ability and no longer says to add it by hand",
  [packHurling?.damage?.addAbility, (packHurling?.effects ?? []).some((e) => /by hand/i.test(e?.text ?? ""))], ["casting", false]);

/* ------------------------------------------------------------------ */
/* D — a reaction to being attacked, offered before the roll           */
/* ------------------------------------------------------------------ */
const dof = await mod("combat", "defence-offer.mjs");
const nimble = { key: "nimble dodge", label: "Nimble Dodge", summary: "+2", against: "attack", has: true };
const offered = (o) => dof.defenceOffersFor({ candidates: [nimble], event: { kind: "weapon" }, inCombat: true, reactions: 1, blockReason: null, ...o });
equal("D1 THE COMPLAINT: a defender with Nimble Dodge and a reaction is offered it", offered({}).offered.map((r) => r.key), ["nimble dodge"]);
equal("D2 with no reaction left in combat it is held, not offered; out of combat it is offered",
  [offered({ reactions: 0 }).held.map((r) => r.reason), offered({ reactions: 0, inCombat: false }).offered.length], [["no reaction left this round"], 1]);
equal("D3 a condition that forbids reactions holds it, with its reason",
  offered({ blockReason: "Flat-footed creatures cannot use Reactions" }).held.map((r) => r.reason), ["Flat-footed creatures cannot use Reactions"]);
equal("D4 its own requirement holds it (an ACP); already up, or not owned, asks nothing",
  [offered({ candidates: [{ ...nimble, requiresReason: "not while subject to an ACP or encumbered" }] }).held.length,
    offered({ candidates: [{ ...nimble, alreadyUp: true }] }), offered({ candidates: [{ ...nimble, has: false }] })],
  [1, { offered: [], held: [] }, { offered: [], held: [] }]);
equal("D5 a weapon-only reaction is offered against a Strike and not a spell; a general one against both",
  [dof.defenceAnswersAttack("weapon", { kind: "weapon" }), dof.defenceAnswersAttack("weapon", { kind: "spell" }),
    dof.defenceAnswersAttack("attack", { kind: "spell" }), dof.defenceAnswersAttack("attack", { kind: "bomb" }), dof.defenceAnswersAttack("attack", { kind: "action" })],
  [true, false, true, true, false]);
const users = [
  { id: "gm", active: true, isGM: true, owner: true, characterId: null },
  { id: "jason", active: true, isGM: false, owner: true, characterId: "luicen" },
  { id: "lewi", active: true, isGM: false, owner: true, characterId: "other" },
  { id: "away", active: false, isGM: false, owner: true, characterId: "luicen" }
];
equal("D6 the defender's own player answers; then any connected owner; then the acting GM",
  [dof.defenceAnswerer({ actorId: "luicen", users, activeGMId: "gm" }),
    dof.defenceAnswerer({ actorId: "pet", users: users.filter((u) => u.id !== "jason"), activeGMId: "gm" }),
    dof.defenceAnswerer({ actorId: "luicen", users: users.filter((u) => u.isGM || !u.active), activeGMId: "gm" }),
    dof.defenceAnswerer({ actorId: "luicen", users: [], activeGMId: null })],
  ["jason", "lewi", "gm", null]);
equal("D7 an answer takes only what was offered", dof.defenceAnswerKeys(["Nimble Dodge", "Shield Block"], [{ key: "nimble dodge" }]), ["nimble dodge"]);
const reg = dof.registeredDefenceOffers().find((r) => r.key === "nimble dodge");
equal("D8 core registers Nimble Dodge against any attack, refusing an ACP or encumbrance, using the feat's own Use",
  [reg?.against, reg?.use, reg?.requires?.({ system: { combat: { acp: { total: 1 } } } }) !== null, reg?.requires?.({ system: { combat: { acp: { total: 0 } } }, hasCondition: () => false })],
  ["attack", null, true, null]);
equal("D9 a module may register one; nonsense is refused",
  [dof.registerDefenceOffer("Test Evade", { summary: "x", against: "weapon" }, "trg-inner-tempest"), dof.registerDefenceOffer("", {}), dof.registeredDefenceOffers().find((r) => r.key === "test evade")?.against],
  [true, false, "weapon"]);
const awSrc = read("module", "combat", "attack-workflow.mjs");
const iOffer = awSrc.indexOf("await offerDefences(actor, targetActor, { kind: \"weapon\", what: weapon.name });");
const iSpend = awSrc.indexOf("await spendActionPoints(actor, \"1\", `${weapon.name} — Strike`, { use: \"strike\" });");
const iDB = awSrc.indexOf("const typedDefence = targetActor");
// Re-anchored at 3.667.0: the check is rolled from its config (and again if
// the defender rerolls it).
const iRoll = awSrc.indexOf("let check = await TRGCheck.roll(attackCheckConfig);", iOffer);
ok("D10 a Strike asks after it is committed and before its DB is read or its die rolled", iOffer > iSpend && iSpend > 0 && iDB > iOffer && iRoll > iOffer);
const iSpellOffer = castSrc.indexOf("await offerDefences(actor, defender, { kind: \"spell\", what: spell.name });");
const iSpellCheck = castSrc.indexOf("const check = noCheckCantrip");
ok("D11 a spell attack asks each marked target before its Spellcraft check is rolled", iSpellOffer > 0 && iSpellCheck > iSpellOffer
  && /if \(isAttack\) \{\s*const \{ offerDefences \}[\s\S]{0,200}for \(const defender of new Set\(Array\.from\(game\.user\?\.targets \?\? \[\]\)\.map\(\(t\) => t\.actor\)\.filter\(Boolean\)\)\) \{/.test(castSrc));
const alSrc = read("module", "alchemical-workflow.mjs");
const swSrc = read("module", "magic", "spiritual-weapon-workflow.mjs");
ok("D12 a bomb and a spiritual weapon ask before their DB is read",
  alSrc.indexOf("await offerDefences(actor, targetActor, { kind: \"bomb\", what: item.name });") > 0
  && alSrc.indexOf("await offerDefences(actor, targetActor, { kind: \"bomb\"") < alSrc.indexOf("const base = Number(targetActor.system?.combat?.defence?.total ?? NaN);")
  && swSrc.indexOf("kind: \"spiritualWeapon\", what: record.label") > 0
  && swSrc.indexOf("kind: \"spiritualWeapon\", what: record.label") < swSrc.indexOf("const db = Number(targetActor.system?.combat?.defence?.total ?? NaN);"));
const dowSrc = read("module", "combat", "defence-offer-workflow.mjs");
ok("D13 the answering client re-asks what is still open before it acts, and runs the feat's own Use",
  /const \{ offered \} = defender\s*\? defenceOffersAgainst\(defender, \{ kind: String\(data\.kind \?\? "weapon"\) \}, \{ forAlly: Boolean\(data\.forAlly\) \}\)/.test(dowSrc)
  && /const stillOpen = offered\.filter\(\(o\) => asked\.includes\(o\.key\)\);[\s\S]{0,200}offered: stillOpen \}\);/.test(dowSrc)
  && /if \(spec\.use\) await spec\.use\(defender, item, attack\);\s*else \{\s*const \{ useFeat \} = await import\("\.\.\/feats-workflow\.mjs"\);\s*await useFeat\(defender, item\);/.test(dowSrc));
ok("D14 a defender's player who never answers cannot hold the attack: it times out as a no",
  /const WAIT_MS = 30000;/.test(dowSrc) && /if \(taken === null\) \{\s*ui\.notifications\?\.warn\?\.\([^;]*takes no reaction\.`\);\s*return \[\];/.test(dowSrc));
ok("D15 asked only of the answerer, and only when there is something to offer",
  /if \(data\?\.action !== ASK \|\| data\.answererId !== game\.user\?\.id\) return;/.test(dowSrc) && /const \{ offered \} = defenceOffersAgainst\(defender, event, \{ forAlly: Boolean\(attack\.forAlly\) \}\);\s*if \(!offered\.length\) return \[\];/.test(dowSrc));
const boot = read("scripts", "trg-prime.mjs");
const api = read("module", "module-api-workflow.mjs");
ok("D16 the listener is registered at boot, and modules can register their own reactions",
  /\n  registerDefenceOffers\(\);\n/.test(boot) && /registerDefenceOffer: \(name, spec, moduleId\) => registerDefenceOffer\(name, spec, moduleId\),/.test(api));

const EXPECTED = 44;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-session-fixes-1022: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-session-fixes-1022: ${checks} checks — all green.`);
