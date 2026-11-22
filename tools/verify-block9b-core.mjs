#!/usr/bin/env node
/**
 * verify-block9b-core — TRG Prime 3.689.0: the seams Eldritch Arts' Block 9b
 * (the 34 armour, shield and weapon runes and the 9 specific items) needs,
 * from its audit (ELDRITCH_ARTS_BLOCK9_AUDIT.md §6) as Graham answered it on
 * 13 November 2026 ("Go with your recommendation for all questions and
 * proceed": Q185–Q210; H19–H25 approved).
 *
 *   H21 eleven more things a registered rune may declare, each read where the
 *       system already does that thing, while the rune's item counts:
 *       control levels, a Spell Adder, resistances, Max Dex, donning time, the
 *       armour casting penalty waived, the critical injury roll, DR shared to
 *       an uncovered location, defence rows (and an attack kind alone as their
 *       scope; a summoned attacker), the control-overflow Will save, and
 *       Sleeping in Armour with advantage
 *   H22 the strike's natural die and its confirmed fumble on
 *       `trgPrimeStrikeResolved`, and a `trgPrimeWeaponFumble` hook
 *
 *   node tools/verify-block9b-core.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") { checks += 1; if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); }
function equal(label, actual, expected) { ok(label, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const imp = (rel) => import(new URL(`../module/${rel}`, import.meta.url));

const api = await imp("module-api.mjs");
const rd = await imp("rune-declarations.mjs");
const re = await imp("rune-effects.mjs");
const dd = await imp("combat/defence-dc.mjs");
const sa = await imp("magic/spell-adder.mjs");
const cr = await imp("codex-runes.mjs");
const cw = strip(read("module", "magic", "cast-workflow.mjs"));
const aw = strip(read("module", "combat", "attack-workflow.mjs"));
const act = strip(read("module", "documents", "actor.mjs"));
const crw = strip(read("module", "magic", "control-register-workflow.mjs"));
const iw = strip(read("module", "items-workflow.mjs"));
const ddSrc = strip(read("module", "combat", "defence-dc.mjs"));

api.resetModuleRegistry();
const T = (prices) => prices.map(([level, price]) => ({ level, price }));
api.registerRunes([
  { key: "eaArcanumSeal", name: "Arcanum Seal", on: ["armour"], tiers: T([[5, 1250], [10, 8000], [15, 55000]]), declares: { spellAdder: [1, 2, 3] } },
  { key: "eaSummonersBrand", name: "Summoner's Brand", on: ["weapon"], level: 10, price: 6000, declares: { controlLevelBonus: 2 } },
  { key: "eaForceWarding", name: "Force Warding", on: ["armour"], level: 10, price: 8000, declares: { resistances: ["force"] } },
  { key: "eaComfort", name: "Comfort", on: ["armour"], level: 5, price: 1250, declares: { maxDexBonus: 1, sleepAdvantage: true } },
  { key: "eaSwiftbind", name: "Swiftbind", on: ["armour"], level: 6, price: 2000, declares: { donAP: { light: 1, medium: 2, heavy: 3, fullExtra: 1 } } },
  { key: "eaTranscendent", name: "Transcendent", on: ["armour", "shield"], level: 8, armourPrice: 4200, shieldPrice: 3000, declares: { armourCastingPenalty: 0 } },
  { key: "eaAstralEchoes", name: "Astral Echoes", on: ["armour"], tiers: T([[6, 2000], [12, 16000], [18, 180000]]), declares: { criticalRollModifier: { value: [-5, -10, -15], exceptFaces: [66, 100] } } },
  { key: "eaAegisflow", name: "Aegisflow", on: ["armour"], tiers: T([[8, 4200], [14, 36000]]), declares: { uncoveredDR: { share: [0.5, 1] } } },
  { key: "eaBoundCircle", name: "Bound Circle", on: ["armour"], tiers: T([[4, 750], [10, 8000], [16, 80000]]), declares: { defenceDC: [{ dc: "defence", value: [1, 2, 3], type: "untyped", label: "conjured or summoned attacker", when: { sourceTraits: ["conjured", "summoned"] } }] } },
  { key: "eaLeyBinding", name: "Ley Binding", on: ["armour"], tiers: T([[4, 750], [8, 4200], [12, 16000]]), declares: { defenceDC: [{ dc: "defence", value: [1, 2, 3], type: "circumstance", label: "attack spells", when: { attackKinds: ["spell"] } }] } },
  { key: "eaBindingSigils", name: "Binding Sigils", on: ["armour"], tiers: T([[4, 750], [8, 4200], [12, 16000]]), declares: { controlSaveModifier: [-2, -4, -6] } },
  { key: "eaAetherfang", name: "Aetherfang", on: ["weapon"], level: 10, price: 6000, declares: { ignoreResistance: ["bludgeoning", "piercing", "slashing", "physical"] } },
  { key: "eaLeybound", name: "Leybound", on: ["weapon"], level: 8, price: 3000, declares: { extraBaseDie: { when: (ctx) => ctx.nearLine === true } } },
  { key: "eaGravitas", name: "Gravitas", on: ["weapon"], level: 11, price: 8000, declares: { fumbleDCModifier: 2 } }
], "test");

const armour = (runes, extra = {}) => ({ id: `a-${runes}`, type: "armour", name: "Mail", flags: {}, system: { equipped: true, runes, category: "Medium", coversTorso: true, ...extra } });
const weapon = (runes, equipped = true) => ({ id: `w-${runes}`, type: "weapon", name: "Blade", flags: {}, system: { equipped, runes, traits: "", damageType: "slashing" } });

/* ================================================================== H21 */
equal("H21 a number list is read by tier, the last for a tier beyond it", [rd.runeDeclaredSum([armour("Binding Sigils II")], "controlSaveModifier"), rd.runeDeclaredSum([armour("Binding Sigils IV")], "controlSaveModifier")], [-4, -6]);

// Control levels.
equal("H21 control levels: Summoner's Brand +2 while its weapon is equipped, nothing in the pack",
  [rd.runeControlLevelBonus([weapon("Summoner's Brand")]), rd.runeControlLevelBonus([weapon("Summoner's Brand", false)]), rd.runeControlLevelBonus([weapon("Summoner's Brand"), { ...weapon("Summoner's Brand"), id: "w2" }])], [2, 0, 4]);
ok("H21 …added to C12's figure on the sheet",
  /system\.magic\.controlLevelBonus = declaredControlLevelBonus\(\n\s*Array\.from\(actor\.items \?\? \[\]\),\n\s*Array\.from\(actor\.appliedEffects \?\? \[\]\)\n\s*\) \+ runeControlLevelBonus\(Array\.from\(actor\.items \?\? \[\]\)\);/.test(act));

// Spell Adder.
equal("H21 a Spell Adder: Arcanum Seal I/II/III are +1/+2/+3, while worn",
  [rd.runeSpellAdders([armour("Arcanum Seal")]), rd.runeSpellAdders([armour("Arcanum Seal III")]), rd.runeSpellAdders([armour("Arcanum Seal II", { equipped: false })])],
  [[{ label: "Mail (Arcanum Seal I)", value: 1 }], [{ label: "Mail (Arcanum Seal III)", value: 3 }], []]);
equal("H21 …among the Spell Adder sources", sa.spellAdderSources({ items: [armour("Arcanum Seal II")] }), { sources: [{ label: "Mail (Arcanum Seal II)", value: 2 }], total: 2, unstructured: [] });

// Resistances.
equal("H21 resistances: Force Warding's force, through the actor's rune effects, once",
  [rd.runeDeclaredResistances(armour("Force Warding")), re.runeBonusesForActor([armour("Force Warding")]).resistances.filter((r) => r === "force").length], [["force"], 1]);
equal("H21 …and none from a rune not worn", re.runeBonusesForActor([armour("Force Warding", { equipped: false })]).resistances, []);

// Max Dex.
equal("H21 Max Dex: Comfort +1 for its own piece", [rd.runeMaxDexBonus(armour("Comfort")), rd.runeMaxDexBonus(armour("Arcanum Seal"))], [1, 0]);
ok("H21 …added to the piece's Max Dex, a specific item's printed figure included (Q206)",
  /if \(item\.type === "armour" && maxDexBonus !== -1\) \{\n\s*const comfort = runeMaxDexBonus\(item, Array\.from\(items \?\? \[\]\)\);\n\s*if \(comfort\) maxDexBonus \+= comfort;/.test(act)
  && act.indexOf("const comfort = runeMaxDexBonus") > act.indexOf("const printedFinal") && act.indexOf("const comfort = runeMaxDexBonus") < act.indexOf("if (abilitiesIgnoreArmourPenalties"));

// Donning.
equal("H21 donning: Swiftbind's 1/2/3 AP by category, full suits +1",
  [rd.runeDonningAP(armour("Swiftbind"), "light"), rd.runeDonningAP(armour("Swiftbind"), "heavy", { fullSuit: true }), rd.runeDonningAP(armour("Comfort"), "light")],
  [{ ap: 1, rune: "Swiftbind", fullExtra: 0 }, { ap: 4, rune: "Swiftbind", fullExtra: 1 }, null]);
equal("H21 …the item sheet's time replaces the chapter's (2 AP for a medium chain shirt, not 4 minutes)",
  (({ ap, rune, improved, doubled }) => ({ ap, rune, improved, doubled }))(cr.donningTimeFor(armour("Swiftbind"), { fullSuit: false })), { ap: 2, rune: "Swiftbind", improved: true, doubled: false });
equal("H21 …a full suit is the rune's +1, not the doubling", cr.donningTimeFor(armour("Swiftbind", { category: "Heavy" }), { fullSuit: true }).ap, 4);
equal("H21 …and plain armour keeps the chapter's", cr.donningTimeFor(armour("Comfort"), { fullSuit: false }).rune, "");

// Casting penalty.
equal("H21 Transcendent waives its piece's casting penalty while worn", [rd.runeWaivesArmourCastingPenalty(armour("Transcendent")), rd.runeWaivesArmourCastingPenalty(armour("Comfort")), rd.runeWaivesArmourCastingPenalty(armour("Transcendent", { equipped: false }))], [true, false, false]);
ok("H21 …its piece left out of the armour the cast reads (tradition and High Magic, Q199)",
  /const equippedArmourItems = Array\.from\(actor\.items \?\? \[\]\)\n\s*\.filter\(\(item\) => item\.type === "armour" && item\.system\?\.equipped\)\n\s*\.filter\(\(item\) => !runeWaivesArmourCastingPenalty\(item, Array\.from\(actor\.items \?\? \[\]\)\)\);/.test(cw)
  && /const equippedArmour = equippedArmourItems\.map\(\(item\) => item\.system\);/.test(cw) && /\? highMagicArmourPenalty\(equippedArmour\)/.test(cw));

// Critical roll.
equal("H21 the critical injury roll: Astral Echoes −5/−10/−15, nothing on an unmodified 66 or 100",
  [rd.runeCriticalRollModifier([armour("Astral Echoes")], 40), rd.runeCriticalRollModifier([armour("Astral Echoes III")], 40)?.value, rd.runeCriticalRollModifier([armour("Astral Echoes")], 66), rd.runeCriticalRollModifier([armour("Astral Echoes")], 100), rd.runeCriticalRollModifier([armour("Comfort")], 40)],
  [{ value: -5, label: "Mail (Astral Echoes I)" }, -15, null, null, null]);
ok("H21 …applied to a rolled injury of the struck creature, never below 1, on the card",
  /if \(targetActor && forced === null\) \{\n\s*const \{ runeCriticalRollModifier \} = await import\("\.\.\/rune-declarations\.mjs"\);\n\s*const echo = runeCriticalRollModifier\(Array\.from\(targetActor\.items \?\? \[\]\), percentile\.value\);\n\s*if \(echo\) \{\n\s*const before = result;\n\s*result = Math\.max\(1, result \+ echo\.value\);/.test(aw)
  && aw.indexOf("runeCriticalRollModifier(Array.from") > aw.indexOf("let result = percentile.value + Number(modifier || 0);")
  && aw.indexOf("runeCriticalRollModifier(Array.from") < aw.indexOf("percentile.value === CRITICAL_CHAOS_FACE && spellResonance"));

// Uncovered DR.
equal("H21 Aegisflow shares half (I) or all (II) of its armour's DR", [rd.runeUncoveredDRShare(armour("Aegisflow")), rd.runeUncoveredDRShare(armour("Aegisflow II")), rd.runeUncoveredDRShare(armour("Comfort"))], [0.5, 1, 0]);
ok("H21 …to a struck location it does not cover, on a critical, at that share — and not where another worn piece covers it",
  /const locationCovered = Boolean\(critical && hitLocation\) && targetItemList\.some\(\(item\) => item\.type === "armour" && item\.system\?\.equipped && armourContributesToHit\(item, \{ isCritical: true, hitLocation \}\)\);/.test(aw)
  && /if \(locationCovered \|\| item\.type !== "armour" \|\| !item\.system\?\.equipped \|\| !critical \|\| !hitLocation\) return false;\n\s*const share = runeUncoveredDRShare\(item, targetItemList\);\n\s*if \(share > 0\) uncoveredShare\.set\(item, share\);\n\s*return share > 0;/.test(aw)
  && /const dr = uncoveredShare\.has\(item\) \? Math\.floor\(full \* uncoveredShare\.get\(item\)\) : full;/.test(aw));

// Defence rows.
const actorWith = (items) => ({ items, effects: [], appliedEffects: [] });
const boundRow = (traits, tier = "") => dd.defenceDCBonus(actorWith([armour(`Bound Circle${tier}`)]), "defence", "", [], "x", [], traits, { attackKind: "weapon" }).total;
equal("H21 Bound Circle: +1/+2/+3 DB against a conjured or summoned attacker, nothing against another",
  [boundRow(["conjured"]), boundRow(["summoned"], " III"), boundRow(["undead"])], [1, 3, 0]);
const leyRow = (kind, tier = "") => dd.defenceDCBonus(actorWith([armour(`Ley Binding${tier}`)]), "defence", "", [], "x", [], [], { attackKind: kind }).total;
equal("H21 Ley Binding: +1/+2 DB against a spell attack (an attack kind alone is a scope), nothing against a Strike",
  [leyRow("spell"), leyRow("spell", " II"), leyRow("weapon")], [1, 2, 0]);
equal("H21 …a row not worn is not read", dd.defenceDCBonus(actorWith([armour("Ley Binding", { equipped: false })]), "defence", "", [], "x", [], [], { attackKind: "spell" }).total, 0);
ok("H21 the defence rows read a rune's rows beside the items' and effects' flags",
  /for \(const item of owned\) \{\n\s*for \(const raw of runeDefenceRows\(item, owned\)\) \{/.test(ddSrc)
  && /normaliseDefenceDC\(raw, \{ id: item\.id, name: item\.name \}, \{ fromStance: false, kindIsScope: true \}\)/.test(ddSrc)
  && /const kindScoped = kindIsScope && attackKinds\.length > 0;\n\s*const stanceGated = stanceRow \|\| kindScoped;\n\s*if \(!stanceGated && !actions\.length/.test(ddSrc)
  && /fromStance: Boolean\(stanceRow \|\| fromStance\),/.test(ddSrc));
equal("H21 …and a row scoped by nothing is still refused", dd.normaliseDefenceDC({ dc: "defence", value: 1, when: {} }, { id: "x", name: "x" }), null);
equal("H21 …a kind alone is scope for a rune's row only; any other row keeps the 3.684.0 rule",
  [Boolean(dd.normaliseDefenceDC({ dc: "defence", value: 1, when: { attackKinds: ["spell"] } }, { id: "x", name: "x" }, { kindIsScope: true })),
   dd.normaliseDefenceDC({ dc: "defence", value: 1, when: { attackKinds: ["spell"] } }, { id: "x", name: "x" }),
   dd.normaliseDefenceDC({ dc: "defence", value: 1, when: {} }, { id: "x", name: "x" }, { kindIsScope: true })], [true, null, null]);
equal("H21 …and a rune's row is not a stance's", dd.normaliseDefenceDC({ dc: "defence", value: 1, when: { attackKinds: ["spell"] } }, { id: "x", name: "x" }, { kindIsScope: true })?.fromStance, false);
ok("H21 a summoned attacker: the register's bound and conjured entries name it, beside its own traits, on the Strike and the spell attack",
  /if \(!\["bound", "conjured"\]\.includes\(entry\?\.source\)\) continue;/.test(crw) && /out\.add\("summoned"\);\n\s*if \(entry\.source === "conjured"\) out\.add\("conjured"\);/.test(crw)
  && /\[\.\.\.creatureTraits\(actor\.system \?\? \{\}\), \.\.\.summonedTraitsOf\(actor\)\], \{ attackKind: "weapon" \}/.test(aw)
  && /\.summonedTraitsOf\(actor\)\], \{ attackKind: "spell", lightLevel \}/.test(cw));

// Control save.
equal("H21 Binding Sigils: −2/−4/−6, summed", [rd.runeDeclaredSum([armour("Binding Sigils")], "controlSaveModifier"), rd.runeDeclaredSum([armour("Binding Sigils III")], "controlSaveModifier")], [-2, -6]);
ok("H21 …on the page-242 DC 20 Will save of the creature over the cap",
  /const sigils = runeDeclaredSum\(Array\.from\(actor\.items \?\? \[\]\), "controlSaveModifier"\);/.test(crw)
  && /\.\.\.\(sigils \? \[\{ label: `\$\{actor\.name\}'s binding runes`, value: sigils, type: "untyped" \}\] : \[\]\)/.test(crw));

// Sleeping in Armour.
equal("H21 Comfort: Sleeping in Armour with advantage, while worn", [rd.runeSleepAdvantage([armour("Comfort")]), rd.runeSleepAdvantage([armour("Comfort", { equipped: false })])], ["Mail (Comfort)", ""]);
ok("H21 …the save rolled with advantage, and said on the card",
  /\.\.\.\(comfort \? \{ bias: "advantage" \} : \{\}\),\n\s*label: "Sleeping in Armour",/.test(iw) && /\.\.\.\(comfort \? \[line\(`\$\{comfort\}: rolled with advantage\.`\)\] : \[\]\),/.test(iw));

// Nothing else moves.
equal("H21 a rune declaring none of it changes nothing", [rd.runeControlLevelBonus([armour("Comfort")]), rd.runeSpellAdders([armour("Comfort")]), rd.runeDeclaredResistances(armour("Comfort")), rd.runeUncoveredDRShare(armour("Force Warding"))], [0, [], [], 0]);

// The weapon's own (3.689.0, the weapon runes).
equal("H21 Aetherfang: the Strike ignores physical resistance; another weapon nothing",
  [rd.runeIgnoredResistances(weapon("Aetherfang")), rd.runeIgnoredResistances(weapon("Gravitas"))], [{ types: ["bludgeoning", "piercing", "slashing", "physical"], label: "Aetherfang" }, null]);
ok("H21 …the Strike's own packet reads the resistances without them (Unstoppable Force still beats it), and the card says so",
  /const runeIgnores = unstoppable \? null : runeIgnoredResistances\(weapon\);/.test(aw)
  && /resistances: unstoppable \? new Set\(\) : keptResistances\(targetDefences\.resistances\),/.test(aw)
  && /const kept = Array\.from\(list \?\? \[\]\)\.filter\(\(k\) => !runeIgnores\.types\.includes\(String\(k\)\.trim\(\)\.toLowerCase\(\)\)\);/.test(aw));
equal("H21 Leybound: one more base die when its module says so, none otherwise; a rune's `when` that throws is no",
  [rd.runeExtraBaseDice(weapon("Leybound"), { nearLine: true }), rd.runeExtraBaseDice(weapon("Leybound"), { nearLine: false }).dice, rd.runeExtraBaseDice(weapon("Gravitas"), {}).dice],
  [{ dice: 1, labels: ["Leybound"] }, 0, 0]);
ok("H21 …added to the Strike's base dice, with a line on the damage card",
  /extraBaseDiceOverride\(weaponData\.damage, extraBaseDice \+ \(brace\?\.extraDice \?\? 0\) \+ runeBaseDice\.dice\)/.test(aw)
  && /const runeBaseDice = runeExtraBaseDice\(weapon, \{ actor, target: targetActor \?\? null, token: attackerToken \?\? null \}\);/.test(aw)
  && /\.\.\.\(runeBaseDice\.dice \? \[`\$\{runeBaseDice\.labels\.join\(", "\)\}: \+\$\{runeBaseDice\.dice\} die of the weapon's base damage`\] : \[\]\)/.test(aw));
equal("H21 Gravitas: Fumble DC +2", [rd.runeFumbleDCModifier(weapon("Gravitas")), rd.runeFumbleDCModifier(weapon("Leybound"))], [2, 0]);
ok("H21 …on the weapon's fumble check", /abilityFumbleDCShift\(Array\.from\(actor\.items \?\? \[\]\)\) \+ runeFumbleDCModifier\(weapon\)\);/.test(aw));

// A resistance suppressed by a live effect (Essencebreaker).
const ct = await imp("creature-traits.mjs");
const sysWith = (resists, effects) => ({ combat: { resistances: resists }, parent: { appliedEffects: effects, items: [] } });
equal("H21 a live effect's suppressedResistances takes them out of the creature's resistances; a disabled one does not",
  [[...ct.actorDefences(sysWith("fire, cold", [{ flags: { "trg-prime": { suppressedResistances: ["fire"] } } }])).resistances], [...ct.actorDefences(sysWith("fire, cold", [{ disabled: true, flags: { "trg-prime": { suppressedResistances: ["fire"] } } }])).resistances], [...ct.actorDefences(sysWith("fire", [])).resistances]],
  [["cold"], ["fire", "cold"], ["fire"]]);

// Slots in one item for a cast-item offer (the Catalyst rune's embedded catalysts).
const cis = await imp("magic/cast-items.mjs");
const shieldItem = { id: "s1", name: "Shield", system: { quantity: 1 } };
const slotted = cis.cleanCastItemOffers([{ itemId: "s1", slot: "0", label: "Leydust", consume: false }, { itemId: "s1", slot: "1", label: "Spell Incense", consume: false }, { itemId: "s1", slot: "1", label: "dup" }], (id) => (id === "s1" ? shieldItem : null));
equal("H21 a cast item's offers: one per item and slot, the slot kept", slotted.map((o) => [o.itemId, o.slot, o.label, o.consume]), [["s1", "0", "Leydust", false], ["s1", "1", "Spell Incense", false]]);
equal("H21 …an offer with no slot is one per item, as before", cis.cleanCastItemOffers([{ itemId: "s1" }, { itemId: "s1" }], () => shieldItem).length, 1);
const kinds = [{ key: "catalyst", label: "Catalyst", offers: slotted }];
equal("H21 …the prompt names each slot and the form reads it back", [/value="s1#1">Spell Incense/.test(cis.castItemPromptHTML(kinds)), cis.readCastItemForm(kinds, { [Object.keys(Object.fromEntries([...cis.castItemPromptHTML(kinds).matchAll(/name="([^"]+)"/g)].map((m) => [m[1], 1])))[0]]: "s1#1" })[0]?.offer?.label], [true, "Spell Incense"]);
ok("H21 the module helpers expose the Exhaustion check (Chrono)", /rollExhaustionCheck: async \(actor, opts = \{\}\) => \(await import\("\.\/combat\/exhaustion-workflow\.mjs"\)\)\.rollExhaustionCheck\(actor, opts\),/.test(read("module", "module-api-workflow.mjs")));

/* ================================================================== H22 */
ok("H22 the strike resolved carries the natural d20 and the confirmed fumble",
  /natural: Number\(check\?\.dice\?\.unmodified \?\? 0\) \|\| 0,\n\s*fumble: Boolean\(confirmedFumble\)(?:,\n(?:\s*\/\/[^\n]*\n)*\s*total: Number\(check\?\.outcome\?\.total \?\? check\?\.total \?\? NaN\))?\n\s*\}\);/.test(aw)); // RE-ANCHORED AT 3.692.0: the attack total may follow
ok("H22 a confirmed weapon fumble is announced, target or none, after the table is read",
  /confirmedFumble = Boolean\(fumbled\);\n\s*if \(fumbled\) \{\n\s*Hooks\.callAll\("trgPrimeWeaponFumble", \{\n\s*attacker: actor, weapon, target: targetActor \?\? null, row: fumbled,\n\s*natural: Number\(check\?\.dice\?\.unmodified \?\? 0\) \|\| 0, melee: !isRanged\n\s*\}\);/.test(aw));
ok("H22 …once a swing (inside the one-fumble-a-swing branch)", aw.indexOf('Hooks.callAll("trgPrimeWeaponFumble"') > aw.indexOf("if (outcome.fumbleRisk && !presetDice) {"));

/* ================================================================== Z */
const sys = JSON.parse(read("system.json"));
equal("Z1 the version is 3.690.0, and the download names it", [sys.version, sys.download], ["3.710.2", "https://github.com/snowtroll75-debug/trpg-prime/releases/download/v3.710.2/trg-prime.zip"]);
equal("Z2 package.json agrees", JSON.parse(read("package.json")).version, "3.710.2");

if (failures.length) { for (const f of failures) console.log(`  ✗ ${f}`); console.log(`verify-block9b-core: ${failures.length} failure(s) of ${checks}`); process.exit(1); }
console.log(`verify-block9b-core: all ${checks} checks pass`);
