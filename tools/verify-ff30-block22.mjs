#!/usr/bin/env node
/**
 * verify-ff30-block22 — 3.655.0, Fiends & Fables 3.0 block 22 (the Ogre to
 * the Pixie; Graham, 17 October 2026: "Option A for both rulings needed. Fix
 * everything else.").
 *
 *   R0   Flyby Attack on a creature with no claw: its natural Strikes stand in
 *   R1   an area that exposes to an affliction (Emit Spores), and on death
 *   R4   a rebirth on death through Resurrection's own effect (the Phoenix)
 *   R5   a Strike that carries a spell (Pixie Bow Casting)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const imp = (...p) => import(pathToFileURL(path.join(SYSTEM_ROOT, "module", ...p)).href);

const CA = await imp("combat", "compound-action.mjs");
const CR = await imp("codex-action-rules.mjs");
const BC = await imp("bow-casting.mjs");
const { CODEX_DECLARATIONS } = await import(pathToFileURL(path.join(SYSTEM_ROOT, "tools", "ff30-codex-declarations.mjs")).href);

/* ---- R0 ---- */
const flyby = { strikes: [{ weapon: "claw", count: 2, separateTargets: true, fallbackNatural: true }] };
const w = (name, natural = true, type = "weapon") => ({ id: name, name, type, system: { natural } });
{
  const { strikes, missing } = CA.compoundStrikes(flyby, [w("Hoof"), w("Wing"), w("Javelin", false), w("Unarmed Strike")]);
  equal("B1 no claw: its natural Strikes, one pick for both attacks, not a manufactured weapon or the unarmed strike",
    [strikes.map((s) => s.weaponName), strikes.map((s) => s.count), strikes.every((s) => s.pickGroup === 0 && s.separateTargets && s.standsInFor === "claw"), missing], [["Hoof", "Wing"], [2, 2], true, []]);
}
{
  const one = CA.compoundStrikes(flyby, [w("Hoof")]).strikes;
  const claw = CA.compoundStrikes(flyby, [w("Claw"), w("Bite")]).strikes;
  const none = CA.compoundStrikes({ strikes: [{ weapon: "claw", count: 2 }] }, [w("Hoof")]);
  equal("B2 one natural weapon is no pick; a claw is used as before; without the declaration nothing stands in",
    [one.map((s) => [s.weaponName, s.pickGroup]), claw.map((s) => [s.weaponName, s.standsInFor ?? null]), none.missing], [[["Hoof", null]], [["Claw", null]], ["claw"]]);
  equal("B3 the pick counts as two strikes", CA.compoundStrikeTotal(CA.compoundStrikes(flyby, [w("Hoof"), w("Wing")]).strikes), 2);
}
ok("B4 the Codex's Flyby Attack declares the fallback", CODEX_DECLARATIONS["Flyby Attack"]?.flags?.creatureAbility?.compound?.strikes?.[0]?.fallbackNatural === true);

/* ---- R1 ---- */
const spores = { flags: { "trg-prime": { creatureAbility: { deathArea: { scope: "area", radiusFeet: 10, expose: { affliction: "Violet Spore" } } } } }, id: "x", name: "Emit Spores" };
const fiery = { flags: { "trg-prime": { creatureAbility: { deathArea: { save: "reflex" } } } }, id: "y", name: "Fiery Death" };
const neither = { flags: { "trg-prime": { creatureAbility: { deathArea: { scope: "area" } } } }, id: "z", name: "Nothing" };
equal("B5 a death area that only exposes is offered; a save is offered as before; one with neither is not", CR.deathAreasOf([spores, fiery, neither]).map((d) => d.name), ["Emit Spores", "Fiery Death"]);

/* ---- R4 ---- */
equal("B6 a rebirth is read with its wait", CR.deathRebirthsOf([{ id: "p", name: "Reborn from the Ashes", flags: { "trg-prime": { creatureAbility: { deathRebirth: { afterSeconds: 60 } } } } }, { id: "q", name: "X", flags: {} }]),
  [{ itemId: "p", name: "Reborn from the Ashes", afterSeconds: 60 }]);
equal("B7 the wait in words", [CR.rebirthWaitText(60), CR.rebirthWaitText(7200), CR.rebirthWaitText(90), CR.rebirthWaitText(0)], ["after 1 minute", "after 2 hours", "after 90 seconds", "at once"]);

/* ---- R5 ---- */
const pixie = [{ name: "Pixie Bow Casting", flags: { "trg-prime": { creatureAbility: { derives: { bowCasting: { groups: ["Bow"], heighten: true, dcPerSeverity: 1 } } } } } }];
equal("B8 a bow carries a spell; a sword or a creature without the declaration does not",
  [BC.bowCastingFor(pixie, { system: { group: "Bow" } }), BC.bowCastingFor(pixie, { system: { group: "Sword" } }), BC.bowCastingFor([], { system: { group: "Bow" } })],
  [{ source: "Pixie Bow Casting", heighten: true, dcPerSeverity: 1 }, null, null]);
const spells = [{ type: "spell", name: "Hold Kind", system: { innate: false, ppCost: 6 } }, { type: "spell", name: "Sleep", system: { innate: false, ppCost: 2 } },
  { type: "spell", name: "Ghost Sound", system: { innate: false, ppCost: 0 } }, { type: "spell", name: "Shield", system: { innate: true, ppCost: 2 } }, { type: "feat", name: "Sleepy", system: { ppCost: 2 } }];
equal("B9 its own spells only — not an innate, not a cantrip — cheapest first", BC.carriedSpells(spells).map((s) => s.name), ["Sleep", "Hold Kind"]);
equal("B10 +1 per level of severity", [BC.severityDCBonus("minor", 1), BC.severityDCBonus("serious", 1), BC.severityDCBonus("Deadly", 1), BC.severityDCBonus(null, 1), BC.severityDCBonus("deadly", 2)], [1, 2, 3, 0, 6]);

/* ---- source ---- */
const src = { pw: read("module", "peril-workflow.mjs"), daw: read("module", "combat", "declared-after-strikes-workflow.mjs"), cw: read("module", "codex-actions-workflow.mjs"),
  aw: read("module", "combat", "attack-workflow.mjs"), cast: read("module", "magic", "cast-workflow.mjs"), bw: read("module", "bow-casting-workflow.mjs"), caw: read("module", "combat", "compound-action-workflow.mjs") };
ok("S1 an area with no save that exposes: each creature it reaches is exposed, through the strike's own exposure",
  /if \(!spec\.save && spec\.expose\?\.affliction\) \{[\s\S]{0,500}?for \(const target of actors\) for \(const l of await exposeFromArea\(peril, target,/.test(src.pw)
  && /export async function exposeFromArea\(actor, targetActor, \{ label, expose \}, level\) \{[\s\S]{0,200}?return exposeFromStrike\(actor, targetActor,/.test(src.daw));
ok("S2 on death the rebirth card is posted, and its button runs Resurrection's own effect on the creature, once",
  /for \(const r of deathRebirthsOf\(actor\?\.items \?\? \[\]\)\) \{/.test(src.cw)
  && /await message\.setFlag\(SYSTEM_ID, "deathRebirth", \{ \.\.\.spec, used: true \}\);[\s\S]{0,200}?await applySpellEffects\(actor, \{ name: item\.name, system: \{\} \}, \{\n\s+targets: \[actor\], lines, effects: \[\{ kind: "resurrect", target: "targets", label: item\.name \}\]/.test(src.cw)
  && /html\.querySelector\?\.\("\[data-trg-death-rebirth\]"\)/.test(src.cw));
ok("S3 a hit that carries a spell rolls no injury and no damage",
  /if \(bowCast\) \{\n\s+const \{ castThroughStrike \} = await import\("\.\.\/bow-casting-workflow\.mjs"\);\n\s+spellCarried = await castThroughStrike\(actor, weapon, targetActor, bowCast, outcome\.critical\?\.severity \?\? null\);/.test(src.aw)
  && /const strikeLands = !grabOnly && !hitCondition && !spellCarried;/.test(src.aw)
  // Re-anchored at 3.667.0: a strike series' later criticals roll no injury either.
  && /if \(strikeLands && outcome\.critical && !outcome\.critical\.injuryImmune && !injuryReplaced && !noCriticalInjury\) \{/.test(src.aw)
  // Re-anchored at 3.668.0: a held blow (Black Lotus) defers its damage.
  && /if \(outcome\.hits && strikeLands( && !held)?\) \{/.test(src.aw));
ok("S4 the carried spell is cast through core's own cast, its AP already paid, Heightened, the severity on its DC",
  /await castSpell\(actor, spell, \{ presetTargets: Boolean\(token\), apPaid: true, carried: \{ label: spec\.source, heighten: spec\.heighten, dcBonus, severity \} \}\);/.test(src.bw)
  && /highMagicHeightens\(actor, mm\.heightenSave \|\| carried\?\.heighten === true\)/.test(src.cast)
  && /\.\.\.\(Number\(carried\?\.dcBonus\) > 0 \? \[\{ label: `\$\{carried\.label/.test(src.cast));
ok("S5 the card says what stands in for the claw", /if \(standIn\) notes\.push\(`\$\{actor\.name\} has no \$\{standIn\.standsInFor\}, so its natural Strikes stand in`\);/.test(src.caw));

// 3.655.1 — found live testing 3.655.0.
ok("S6 the carried spell asks no free hand (the bow is the somatic hand), and a cast refused before it began carries nothing",
  /: carried && !isInnate\n\s+\? componentGate\(actor, \{ \.\.\.spellData, components: \{ \.\.\.\(spellData\.components \?\? \{\}\), somatic: false \} \}, spell\.name\)/.test(src.cast)
  && /const cast = await castSpell\(actor, spell,[^\n]*\n[^\n]*\n\s+if \(!cast\) return false;/.test(src.bw));

const EXPECTED = 17;
ok(`Z1 the check count is ${EXPECTED}`, checks + 1 === EXPECTED, `ran ${checks + 1}`);
if (failures.length) { process.stderr.write(`verify-ff30-block22: ${failures.length} of ${checks} failed\n${failures.map((f) => `  ✗ ${f}`).join("\n")}\n`); process.exit(1); }
process.stdout.write(`verify-ff30-block22: ${checks} checks\n  all pass\n`);
