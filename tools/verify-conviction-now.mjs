#!/usr/bin/env node
/**
 * verify-conviction-now — 3.667.2: the conviction bonus is asked on the chat
 * card, after the dice and before the result is known, and the press changes
 * the result. Graham, 23 October 2026 (after the live test of 3.667.0): "This
 * should appear after the dice is rolled but before the result is known" and
 * "it needs to appear on the chat card but actually change the result."
 *
 *   A  the card that asks shows the dice and the total, never the DB, the DC
 *      or the degree; the decided card says what was chosen
 *   B  the roll waits on the card, and a spend is added before anything reads
 *      the result
 *   C  any screen may answer: the owner's or the GM's, by the socket
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const cn = await import(new URL("../module/dice/conviction-now-workflow.mjs", import.meta.url));

/* A — the cards */
const asking = cn.convictionNowCard({ actorName: "Keldran", label: "Longsword — Attack", diceTotal: 14, total: 22, pointsLeft: 2 });
const plain = asking.replace(/<[^>]+>/g, " ");
ok("A1 the card shows the dice and the total", /Rolled\s+14\s+on the dice: total\s+22/.test(plain));
ok("A2 …and nothing of the DB, the DC or the result", !/\bDB\b|\bDC\b|hits|misses|Success|Failure|Critical|Fumble|Partial/i.test(plain));
ok("A3 it offers Spend and No", /data-action="convictionNowSpend"/.test(asking) && /data-action="convictionNowPass"/.test(asking) && /2 left/.test(plain));
ok("A4 names are escaped", !/<script>/.test(cn.convictionNowCard({ actorName: "<script>x</script>" })));
const spent = cn.convictionDecidedCard({ actorName: "Keldran", label: "Longsword — Attack", total: 22, spent: true, die: 4, newTotal: 26 }).replace(/<[^>]+>/g, " ");
ok("A5 the decided card says what the die added", /Conviction spent: \+1d6 rolled\s+4\s+— total\s+22\s+→\s+26/.test(spent));
ok("A6 …or that none was spent, and offers nothing to press",
  /No conviction spent: the total\s+22\s+stands/.test(cn.convictionDecidedCard({ total: 22, spent: false }).replace(/<[^>]+>/g, " "))
  && !/data-action/.test(cn.convictionDecidedCard({ total: 22, spent: false })));
equal("A7 the owner or the GM may answer, nobody else", [cn.mayAnswer({ isGM: true }), cn.mayAnswer({ isOwner: true }), cn.mayAnswer({})], [true, true, false]);

/* B — the roll waits on the card */
const ck = read("module", "dice", "check.mjs");
const body = ck.slice(ck.indexOf("async function offerConvictionBonusNow(check) {"), ck.indexOf("async function askPerceptionSense("));
ok("B1 no dialog any more: the card asks", !/DialogV2/.test(body) && /const \{ spend, message \} = await askConvictionOnCard\(check, state\);/.test(body));
ok("B2 the card is posted after the dice, inside the roll, before anything reads the result",
  /await offerConvictionBonusNow\(check\);\n\n    \/\/ A DECLARED SUCCESS/.test(ck));
ok("B3 a spend is checked again, then added to the check itself (the result the workflow reads)",
  /if \(!getConvictionState\(check\.actor\)\.ok\) \{\s*await settleConvictionCard\(message, \{ \.\.\.card, spent: false \}\);\s*return;\s*\}\s*const roll = await new Roll\("1d6"\)\.evaluate\(\);/.test(body)
  && /check\.applyExtraModifier\(\{ label: "Conviction \(\+1d6\)", value: roll\.total, type: "untyped" \}\);/.test(body)
  && /await markConvictionSpent\(check\.actor\);/.test(body));
ok("B4 the card records the choice either way",
  /if \(!spend\) \{ await settleConvictionCard\(message, \{ \.\.\.card, spent: false \}\); return; \}/.test(body)
  && /await settleConvictionCard\(message, \{ \.\.\.card, spent: true, die: roll\.total, newTotal: check\.outcome\.total \}\);/.test(body));
const wf = read("module", "dice", "conviction-now-workflow.mjs");
ok("B5 the card waits for its answer, keyed by its own request", /const answer = new Promise\(\(resolve\) => waiting\.set\(requestId, resolve\)\);/.test(wf) && /const spend = Boolean\(await answer\);/.test(wf));
ok("B6 the card follows the check's roll mode", /applyMessageMode\(data, check\.rollMode\);/.test(wf));

/* C — any screen may answer */
ok("C1 a press on the asking screen answers there; another screen's goes by the socket",
  /if \(flag\.askerId === game\.user\?\.id\) \{\s*const resolve = waiting\.get\(flag\.requestId\);/.test(wf)
  && /game\.socket\?\.emit\(SOCKET, \{ action: ANSWER, requestId: flag\.requestId, userId: flag\.askerId, spend \}\);/.test(wf));
ok("C2 the asking screen hears its own answer only", /if \(data\?\.action !== ANSWER \|\| data\.userId !== game\.user\?\.id\) return;/.test(wf));
ok("C3 only the owner or the GM is shown the buttons, and a decided card binds nothing",
  /Hooks\.on\("renderChatMessageHTML", async \(message, html\) => \{\s*const flag = message\?\.getFlag\?\.\(SYSTEM_ID, FLAG\);\s*if \(!flag \|\| flag\.decided\) return;/.test(wf) && /if \(!allowed\) \{ button\.style\.display = "none"; continue; \}/.test(wf));
ok("C4 a press is refused to anyone else", /if \(!mayAnswer\(\{ isGM: game\.user\?\.isGM, isOwner: Boolean\(actor\?\.isOwner\) \}\)\) \{/.test(wf));
ok("C5 registered at start-up", /registerConvictionNow\(\);/.test(read("scripts", "trg-prime.mjs")));

const EXPECTED = 19;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-conviction-now: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-conviction-now: ${checks} checks — all green.`);
