#!/usr/bin/env node
/**
 * verify-item-fixes-3626-1 — the Pillars of Faith 0.8.0 live test's fixes
 * (3.626.1): a conditional scoped to the DAMAGE roll applies to weapon
 * damage (Vowkeeper, Rejuvenating Surge's damage half); a rune's or
 * rider's secondary packet is a magical source; a partly-warded Soul Drain
 * names its ward; Last Vigil asks before its one daily use; a wondrous
 * `use` ability describes itself; a wondrous spell grant carries a printed
 * activation; a consumable's required trait gates the non-potion path too.
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");

const dc = await import(new URL("../module/combat/damage-conditionals.mjs", import.meta.url));
const cond = await import(new URL("../module/conditionals.mjs", import.meta.url));
const weff = await import(new URL("../module/wondrous-effects.mjs", import.meta.url));
const eaw = await import(new URL("../module/combat/effect-application-workflow.mjs", import.meta.url));

/* A. Damage-roll conditionals, pure */
const sword = { id: "w", name: "Broadsword", type: "weapon", system: { equipped: true, traits: "Versatile" } };
const entries = cond.collectConditionals(
  [{ id: "f1", name: "Rejuvenating Surge", type: "feat", system: {}, flags: { "trg-prime": { conditionals: [{ kind: "modifier", value: 2, type: "status", label: "Rejuvenating Surge", auto: true, scope: "Attack and damage rolls this round", when: { checkTypes: ["attack", "damage"] } }] } } }],
  [{ id: "e1", name: "Clarity", flags: { "trg-prime": { conditionals: [{ kind: "advantage", label: "Clarity", when: { checkTypes: ["damage"] } }] } } }],
  [{ kind: "modifier", valueFrom: "classBonus", type: "untyped", label: "Broadsword (Vowkeeper) — pursuing the day's vow", scope: "Damage rolls with the weapon", when: { checkTypes: ["damage"] } },
    { kind: "modifier", value: 1, type: "item", label: "Anchored Soul", when: { checkTypes: ["save"], traits: ["soul"] } }],
  { classBonus: 3, level: 12, halfLevel: 6 }
);
const rows = dc.damageConditionalRows(entries, { traits: sword.system.traits });
equal("A1 only the modifier rows scoped to damage reach the damage roll — not the save's, not an advantage", rows.map((r) => [r.label, r.value, r.type, r.auto]), [["Broadsword (Vowkeeper) — pursuing the day's vow", 3, "untyped", false], ["Rejuvenating Surge", 2, "status", true]]);
equal("A2 the auto rows are ticked in advance; the offered one is not", dc.autoDamageRowIds(rows), [rows[1].id]);
const total = dc.damageConditionalTotal(rows);
equal("A3 the total sums untyped with the typed, and says each", [total.total, total.lines], [5, ["Broadsword (Vowkeeper) — pursuing the day's vow: +3 to damage (Damage rolls with the weapon).", "Rejuvenating Surge: +2 status to damage (Attack and damage rolls this round)."]]);
equal("A4 two bonuses of one type take the higher; a penalty of that type still applies; untyped sums", dc.damageConditionalTotal([
  { label: "a", value: 2, type: "status" }, { label: "b", value: 3, type: "status" }, { label: "c", value: -1, type: "status" }, { label: "d", value: 1, type: "untyped" }, { label: "e", value: 1 }
]).total, 3 - 1 + 1 + 1);
equal("A5 a zero or non-numeric value is not a row", dc.damageConditionalRows(cond.collectConditionals([], [], [{ kind: "modifier", value: 0, type: "item", label: "z", when: { checkTypes: ["damage"] } }], {}), {}).length, 0);

/* B. The attack workflow asks before the formula and adds the number */
const aw = read("module", "combat", "attack-workflow.mjs");
ok("B1 the hit path resolves the declared damage bonus before resolveWeaponDamage and hands it over", /const declaredDamage = await declaredDamageBonus\(actor, weapon, \{ skipPrompt: skipDialog\(event\) \}\);\s*damageOutcome = await resolveWeaponDamage\(actor, weapon, \{/.test(aw) && /declaredBonus: declaredDamage\.bonus,\s*declaredBonusLines: declaredDamage\.lines,/.test(aw));
ok("B2 the formula carries the signed total and the card says each row", /const declaredDamageTotal = Math\.trunc\(Number\(declaredBonus\) \|\| 0\);\s*if \(declaredDamageTotal\) \{\s*formula \+= declaredDamageTotal > 0 \? ` \+ \$\{declaredDamageTotal\}` : ` - \$\{Math\.abs\(declaredDamageTotal\)\}`;/.test(aw) && /for \(const said of Array\.isArray\(declaredBonusLines\) \? declaredBonusLines : \[\]\) lines\.push\(line\(said\)\);/.test(aw));
const dw = read("module", "combat", "damage-conditionals-workflow.mjs");
ok("B3 the workflow reads items, effects, rune conditionals and ally auras, takes the auto rows, asks only when a row needs a person, and spends a one-shot effect", /collectConditionals\(\s*Array\.from\(actor\.items \?\? \[\]\),\s*Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\),\s*\[\.\.\.\(actor\.system\?\.combat\?\.runeConditionals \?\? \[\]\), \.\.\.allyAuraConditionalsFor\(actor\)\],/.test(dw) && /let ticked = autoDamageRowIds\(rows\);/.test(dw) && /if \(offered\.length && !skipPrompt && DialogV2\) \{/.test(dw) && /const \{ spent \} = applyConditionalSelections\(rows, ticked\);/.test(dw));

/* C. Secondary packets are magical */
ok("C1 the strike's magical-source answer is decided once and the main packet reads it", /const strikeIsMagical = Boolean\(weapon\?\.system\?\.runeModifiers\?\.potency\) \|\| ammoPotencyTier\(ammo\) > 0/.test(aw) && /magical: strikeIsMagical,/.test(aw));
ok("C2 a rune's or rider's packet is magical; an unguent's is as magical as the blade", /magical: rune\.mundane \? strikeIsMagical : true/.test(aw) && /\.map\(\(packet\) => \(\{ \.\.\.packet, mundane: true \}\)\);/.test(aw));

/* D. A partly-warded Soul Drain says so */
equal("D1 the applied tags name a full ward and a partial one", eaw.formatAppliedTags([
  { label: "Soul Drain", value: 0, warded: "Scale (Soul Ward)" },
  { label: "Soul Drain", value: 14, wardedPartly: "Scale (Soul Ward), 12 → 2" },
  { label: "Frightened", value: 1 }
]), "Soul Drain (turned aside by Scale (Soul Ward)), Soul Drain 14 (reduced by Scale (Soul Ward), 12 → 2), Frightened 1");
const ea = read("module", "combat", "effect-application-workflow.mjs");
ok("D2 the partial ward is recorded on the applied tag", /wardedBy = `\$\{ward\.label\}, \$\{incomingValue\} → \$\{kept\}`;/.test(ea) && /\.\.\.\(wardedBy \? \{ wardedPartly: wardedBy \} : \{\}\)/.test(ea));

/* E. Last Vigil asks */
const ih = read("module", "magic", "item-healing-workflow.mjs");
ok("E1 one qualifying condition is a yes/no, not a silent spend", /if \(held\.length === 1\) \{\s*const \{ DialogV2 \} = foundry\.applications\.api;\s*const yes = await DialogV2\.confirm\(/.test(ih) && /picked = yes \? held : null;/.test(ih));

/* F. Wondrous descriptions and activations */
equal("F1 a `use` ability describes itself; a note says its note", [
  weff.describe({ kind: "use", label: "Past-Life Insight", activation: "Free (0 AP)", frequency: "daily" }),
  weff.describe({ kind: "use", label: "Open the Last Road", activation: "Engage (1 AP)", frequency: "atWill" }),
  weff.describe({ kind: "use", label: "Reveal the Unseen", frequency: "focus" }),
  weff.describe({ kind: "note", note: "Requires the Unliving trait." })
], ["Past-Life Insight (Free (0 AP), 1/day)", "Open the Last Road (Engage (1 AP), at will)", "Reveal the Unseen (Focus)", "Requires the Unliving trait."]);
const lantern = { id: "l", name: "Lantern of the Veil", type: "gear", system: { invested: true, equipped: true }, flags: { "trg-prime": { wondrous: { abilities: [{ kind: "spell", spell: "Veil Sight", frequency: "focus", label: "Open the Lantern", duration: "10 minutes", castAP: 1 }] } } } };
const granted = weff.wondrousBonusesFor(lantern, {}).spells;
equal("F2 a wondrous spell grant carries its printed activation and duration", [granted[0]?.spell, granted[0]?.castAP, granted[0]?.duration], ["Veil Sight", 1, "10 minutes"]);
equal("F3 without a printed activation the grant carries none", weff.wondrousBonusesFor({ ...lantern, flags: { "trg-prime": { wondrous: { abilities: [{ kind: "spell", spell: "Veil Sight", frequency: "daily" }] } } } }, {}).spells[0]?.castAP, undefined);
const rs = read("module", "rune-spell-workflow.mjs");
ok("F4 the grant hands the activation to the spell the way a specific item's does", /\.\.\.\(Number\(grant\.castAP\) > 0 \? \{ castAP: Number\(grant\.castAP\) \} : \{\}\)/.test(rs));

/* G. A consumable's required trait, on the other path */
const cw = read("module", "consumable-use-workflow.mjs");
ok("G1 the non-potion path asks the recipients' traits before the release — the user for self rows, the targets for target rows", /if \(!rows\.length \|\| rows\.some\(\(row\) => String\(row\?\.target \?\? "self"\) === "self"\)\) recipients\.push\(actor\);/.test(cw) && /for \(const token of game\.user\?\.targets \?\? \[\]\) if \(token\.actor\) recipients\.push\(token\.actor\);/.test(cw) && cw.split("const refusal = consumableTraitRefusal(").length - 1 === 2 && cw.lastIndexOf("const refusal = consumableTraitRefusal(") < cw.lastIndexOf("released = await releaseItemSpell(actor, item, ref, {"));

const EXPECTED = 19;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-item-fixes-3626-1: ${checks} checks — ${failures.length} FAILED\n`); for (const f of failures) console.log(`  ✗ ${f}`); process.exitCode = 1; }
else console.log(`verify-item-fixes-3626-1: ${checks} checks — all green.`);
