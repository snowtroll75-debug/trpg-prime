#!/usr/bin/env node
/**
 * verify-session-faults-1014 — 3.645.0, the seven faults from Graham's
 * session of 14 October 2026:
 *   F1  the Conviction d6 animated twice under Dice So Nice 5
 *   F2  the Conviction d6 changed the card but not the attack or cast
 *   F3  Song Of Despair from a player: the area's writes need the GM
 *   F4  an off-turn strike took the multiple attack penalty; the AoO button
 *   F5  Hand & a Half two-handed rolls the die one size larger
 *   F6  a feat's or reaction's Strike asks which weapon
 *   F7  a readied action is paid for by Ready and kept until it happens
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, "module", ...p), "utf8");
const src = {
  cci: read("dice", "check-card-interactions.mjs"),
  check: read("dice", "check.mjs"),
  em: read("magic", "emanation-workflow.mjs"),
  at: read("combat", "attack-workflow.mjs"),
  opp: read("combat", "opportunity.mjs"),
  af: read("combat", "action-feats-workflow.mjs"),
  rf: read("combat", "reaction-feats-workflow.mjs"),
  strike: read("combat", "strike.mjs"),
  aw: read("combat", "action-workflow.mjs"),
  cast: read("magic", "cast-workflow.mjs")
};

// F1
ok("F1a the card shows the d6 by hand only when Dice So Nice will not", /if \(extraRoll && game\.dice3d && !diceSoNiceAnimatesUpdates\(\)\) \{/.test(src.cci));
ok("F1b Dice So Nice 5 and later are the ones that animate an update", /return Number\.isFinite\(major\) && major >= 5;/.test(src.cci));

// F2
ok("F2a the bonus is offered inside the roll, before the result is read", /await offerConvictionBonusNow\(check\);\n\n    \/\/ A DECLARED SUCCESS/.test(src.check));
ok("F2b an attack or a cast always asks; a save or skill only with a DC", /const readsNow = check\.type === "attack" \|\| check\.type === "spellcraft";/.test(src.check)
  && /if \(!readsNow && \(dc === null \|\| dc === undefined\)\) return;/.test(src.check));
ok("F2c a save or skill asks only when +6 could move the degree", /if \(!readsNow && !check\.convictionCouldMove\(\)\) return;/.test(src.check));
ok("F2d the die goes on the roll, the total and the spend", /check\.rolls\.push\(roll\);\n  check\.applyExtraModifier\(\{ label: "Conviction \(\+1d6\)", value: roll\.total, type: "untyped" \}\);/.test(src.check)
  && /await markConvictionSpent\(check\.actor\);/.test(src.check));
ok("F2e a decided card offers no second button", /!this\.flat && !this\.convictionDecided &&/.test(src.check) && /bonusUsed: Boolean\(this\.convictionDecided\),/.test(src.check));
ok("F2f an unmodified 1 on an attack is not offered the die", /if \(check\.type === "attack" && Number\(check\.dice\?\.unmodified\) === 1\) return;/.test(src.check));

// F3
ok("F3a a player's refresh asks the GM's client", /if \(!isActingGM\(\)\) return askGMClient\("emanation\.refresh", \{ castId: record\?\.entry\?\.id \?\? "" \}\);/.test(src.em));
ok("F3b a player's cast hands adoption and the reconcile to the GM", /if \(!isActingGM\(\)\) \{\n      await askGMClient\("emanation\.refresh", \{ castId, adopt: true \}\);/.test(src.em));
ok("F3c a player's end asks the GM to clear the circle", /if \(!isActingGM\(\)\) \{\n    await askGMClient\("emanation\.end"/.test(src.em));
ok("F3d the GM's client listens and adopts before reconciling", /game\.socket\?\.on\(EMANATION_SOCKET/.test(src.em) && /if \(data\.adopt\) \{[\s\S]{0,140}await adoptCastEffects\(data\.castId\);/.test(src.em));

// F4
ok("F4a an off-turn strike pays no penalty", /const baseMap = \(isReaction \|\| offTurn\) \? 0/.test(src.at));
ok("F4b ...and adds nothing to the count", /if \(!isReaction && !mapFrozen && !offTurn\) \{/.test(src.at));
ok("F4c off-turn is a started combat on another combatant's turn", /if \(!combat\?\.started \|\| !actor\) return false;/.test(src.at) && /return !mine\.some\(\(c\) => c\.id === current\?\.id\);/.test(src.at));
ok("F4d the reactor's own player sees the AoO button", /if \(!game\.user\.isGM && !reactorActor\?\.isOwner\) \{/.test(src.opp));

// F5
const { steppedCreatureDamage } = await import(new URL("../module/creature-attacks.mjs", import.meta.url));
equal("F5a one size larger: d8 to d10, d10 to d12, 2d6 to 2d8", [steppedCreatureDamage("1d8", 1), steppedCreatureDamage("1d10", 1), steppedCreatureDamage("2d6", 1)], ["1d10", "1d12", "2d8"]);
ok("F5b the two-handed Hand & a Half grip rolls the stepped die", /const handAndAHalfDamage = usedTwoHanded && heldInTwoHandGrip\(weapon\)\n    \? steppedCreatureDamage\(damageOverride \?\? weaponData\.damage, 1\)/.test(src.at)
  && /buildWeaponDamageFormula\(handAndAHalfDamage \?\? damageOverride \?\? weaponData\.damage,/.test(src.at));

// F6
ok("F6a the chooser asks only when two melee attacks are ready, held weapons first", /if \(melee\.length < 2\) return undefined;/.test(src.strike) && /\[\.\.\.melee\.filter\(\(w\) => !w\.system\?\.natural\), \.\.\.melee\.filter\(\(w\) => w\.system\?\.natural\)\]/.test(src.strike));
ok("F6b a feat asks before its AP is spent, and a cancel costs nothing", /const chosen = MELEE_WEAPON_FEATS\.has\(state\.key\) \? await chooseMeleeAttack\(actor, entry\.label\) : undefined;\n  if \(chosen === null\) return null;\n  if \(entry\.apCost !== "0"\)/.test(src.af));
ok("F6c Swipe is one of them, and every handler uses the choice", /"skirmish", "striding charge", "swipe", "vital strike"/.test(src.af) && !/const weapon = meleeWeapon\(actor\);/.test(src.af));
ok("F6d an AoO and a reaction strike ask too", /const picked = await chooseMeleeAttack\(reactor, "Attack of Opportunity"\);/.test(src.opp) && /const picked = await chooseMeleeAttack\(reactor, label\);/.test(src.rf));

// F7
ok("F7a a readied action costs no AP and is spent only once it happens", /resolveAction\(actor, \{ \.\.\.storedAction, apCost: "0" \}/.test(src.aw) && /if \(done\) \{\n          await consumeReadiedAction\(actor\);/.test(src.aw));
ok("F7b a readied cast likewise", /const cast = await castSpell\(actor, spell, \{ apPaid: true \}\);\n          if \(cast\) \{\n            await consumeReadiedAction\(actor\);/.test(src.aw));
ok("F7c the cast skips the AP gate and the spend when paid", /\} else if \(!apPaid && !\(await ensureActionPoints/.test(src.cast) && /if \(!apPaid\) await spendActionCost\(actor, totalCastAP, spell\.name\);/.test(src.cast));
ok("F7d a readied Strike is paid", /apPaid: String\(action\.apCost \?\? ""\)\.trim\(\) === "0"/.test(src.aw));

const EXPECTED = 27;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-session-faults-1014: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-session-faults-1014: ${checks} checks — all green.`);
