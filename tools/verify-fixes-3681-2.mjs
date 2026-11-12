#!/usr/bin/env node
/**
 * verify-fixes-3681-2 — TRG Prime 3.681.2: the damage card's collapsed line
 * names the creature that took the damage.
 *
 * Graham, 3 November 2026: "the attack is made against Borin but damages
 * himself!" The damage had landed on Borin. The card's header is the
 * attacker's name and its line read "2 Piercing taken", so the card read as
 * the attacker being hurt.
 *
 *   S  the line, driven: who took it, how much, and when nobody did
 *   W  the weapon damage card uses it, with the creature it resolved against
 *   Z  the version
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

/* S — the line itself, driven */
const { damageCardSummary } = await import(new URL("../module/combat/damage-summary.mjs", import.meta.url));
const live = damageCardSummary({ targetName: "Borin Slatevein", taken: 2, total: 4, typeLabel: "Piercing" });
ok("S1 THE DEFECT: the line names who took the damage (the live case: Borin, 2 Piercing)", live === "Borin Slatevein takes 2 Piercing", live);
ok("S2 a blow wholly stopped still names its target (0 taken is still taken)",
  damageCardSummary({ targetName: "Goblin Warrior", taken: 0, total: 1, typeLabel: "Piercing" }) === "Goblin Warrior takes 0 Piercing");
const none = damageCardSummary({ targetName: null, taken: null, total: 7, typeLabel: "Slashing" });
ok("S3 a roll with no target says so, rather than a bare number under the attacker's name", none === "7 Slashing — no target", none);
ok("S4 a target that took damage but has no name keeps the old wording",
  damageCardSummary({ targetName: "", taken: 3, total: 5, typeLabel: "Fire" }) === "3 Fire taken");
const hostile = damageCardSummary({ targetName: "<b>Ogre</b> & co", taken: 5, total: 5, typeLabel: "Bludgeoning" });
ok("S5 the name is printed as text, not HTML", hostile === "&lt;b&gt;Ogre&lt;/b&gt; &amp; co takes 5 Bludgeoning", hostile);
ok("S6 the target is never the attacker's to supply: nothing about the attacker is asked",
  !/attacker|actorName/i.test(fs.readFileSync(new URL("../module/combat/damage-summary.mjs", import.meta.url), "utf8").split("export function damageCardSummary")[1] ?? "x"));

/* W — the wiring */
const aw = read("module", "combat", "attack-workflow.mjs");
ok("W1 the attack workflow imports the line", /import \{ damageCardSummary \} from "\.\/damage-summary\.mjs";/.test(aw));
ok("W2 the weapon damage card's line is built from it, naming the creature the damage was resolved against",
  /const damageCompactSummary = \(\) => damageCardSummary\(\{\s*targetName: finalTaken !== null \? targetActor\?\.name \?\? null : null,\s*taken: finalTaken,\s*total,\s*typeLabel\s*\}\);/.test(aw));
ok("W3 …and it is that line the card is posted with",
  /await postCard\(actor, `\$\{weapon\.name\} — Damage`, lines, \[roll\], \{\s*compactSummary: damageCompactSummary\(\)\s*\}\);/.test(aw));
ok("W4 the old, nameless line is gone", !aw.includes("`${finalTaken} ${typeLabel} taken`"));
ok("W5 `targetActor` there is the damage step's own (the user's target, or a stray shot's bystander)",
  /const targetTokenHere = targetTokenOverride \?\? firstTargetToken\(\) \?\? null;\s*const targetActor = targetTokenHere\?\.actor \?\? null;/.test(aw));

/* Z — the version */
const sys = JSON.parse(read("system.json"));
const [zMaj, zMin, zPat] = String(sys.version).split(".").map(Number);
ok("Z 3.681.2 or later, and its download names it",
  (zMaj > 3 || (zMaj === 3 && (zMin > 681 || (zMin === 681 && zPat >= 2)))) && (sys.download ?? "").includes(`/v${sys.version}/`));

if (failures.length) {
  console.error(`verify-fixes-3681-2: ${failures.length} of ${checks} checks FAILED`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`verify-fixes-3681-2: all ${checks} checks pass.`);
