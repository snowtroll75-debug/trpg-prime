#!/usr/bin/env node
/**
 * verify-block5-core — TRG Prime 3.669.0: the seams Inner Tempest's Block 5
 * (the racial feats of Chapter 5) asked for, docs/INNER_TEMPEST_BLOCK5_AUDIT
 * C1-C9 and Graham's rulings of 24 October 2026 (B5-3, B5-4).
 *
 *   A  C1 feat access limited to a heritage
 *   B  C2 a spell choice from a named list, by trait
 *   C  C3 an area that leaves allies out, and the area rail handed to modules
 *   D  C4 a reroll after your own fumble: skill, save, and the attack's
 *      confirmed fumble before the table
 *   E  C5 an ally stepping in: who may, and the attack retargeted
 *   F  C6 a push made shorter by a declaration
 *   G  C7 one roll against several creatures: the die met again, a DC per
 *      creature, the action's own immunity set aside
 *   H  C8 two more daily firsts: exactly a degree, and advantage
 *   I  C9 a light a module declares; lights a player places and moves
 *   J  B5-3 a conviction point not expended on a good result
 *   K  an ally aura switched on by a Use
 *   L  the version
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

/* A — C1 */
{
  const api = await mod("module-api.mjs");
  api.resetModuleRegistry();
  api.registerFeatAccess("race", "Miraku", ["Animal Sense", { name: "Bestial Resilience", heritages: ["Mujina"] }], "m");
  api.registerFeatAccess("class", "Kensai", [{ name: "Quick Draw", heritages: ["Mujina"] }], "m");
  const can = (kind, owner, feat, heritage) => api.hasRegisteredFeatAccess(kind, owner, feat, heritage);
  equal("A1 a plain name opens the feat to the whole race; a bracketed heritage to that heritage only",
    [can("race", "Miraku", "Animal Sense", "Ren"), can("race", "Miraku", "Bestial Resilience", "Mujina"), can("race", "Miraku", "Bestial Resilience", "Ren"), can("race", "Miraku", "Bestial Resilience", "")], [true, true, false, false]);
  equal("A2 a heritage limit means nothing to a class", can("class", "Kensai", "Quick Draw", ""), true);
  api.registerFeatAccess("race", "Miraku", ["Bestial Resilience"], "m");
  api.registerFeatAccess("race", "Miraku", [{ name: "Bestial Resilience", heritages: ["Ren"] }], "m");
  equal("A3 opened to the race, a later limit does not narrow it", can("race", "Miraku", "Bestial Resilience", "Kitsune"), true);
  api.resetModuleRegistry();
  ok("A4 the racial picker asks with the actor's heritage, and the sheet hands it over",
    /hasRegisteredFeatAccess\("race", race, entry\.name, heritage\)/.test(read("module", "picker-filters.mjs"))
    && /heritage: items\.find\(\(i\) => i\.type === "heritage"\)\?\.name \?\? "",/.test(read("module", "sheets", "actor-sheet.mjs")));
}

/* B — C2 */
{
  globalThis.foundry ??= { applications: { api: { DialogV2: {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (x) => x }, sheets: {}, ux: {} }, utils: {}, abstract: {}, data: { fields: {} } };
  globalThis.CONFIG ??= {}; globalThis.game ??= {}; globalThis.Hooks ??= { on() {}, once() {} };
  const fw = await mod("feats-workflow.mjs");
  const S = (name, traits, pp = 2) => ({ name, system: { traits, ppCost: pp, tradition: "arcane" } });
  const pool = [S("Burning Hands", "Fire, Invocation"), S("Ice Slick", "Cold, Invocation"), S("Magic Stone", "Essence, Soul"), S("Fireball", "Fire, Invocation", 6)];
  const pick = (spec) => pool.filter(fw.backgroundSpellFilter(spec)).map((s) => s.name);
  equal("B1 the printed names, those carrying a trait of the element, and the named additions",
    [pick({ names: ["Burning Hands", "Ice Slick", "Magic Stone"], traitsAny: ["fire"] }), pick({ names: ["Burning Hands", "Ice Slick", "Magic Stone"], traitsAny: ["earth", "acid"], alsoNames: ["Magic Stone"] }), pick({ names: ["Burning Hands", "Ice Slick", "Magic Stone"] })],
    [["Burning Hands"], ["Magic Stone"], ["Burning Hands", "Ice Slick", "Magic Stone"]]);
  equal("B2 the old shape is unchanged: by PP alone", pick({ ppCost: 6 }), ["Fireball"]);
  ok("B3 a module hands its spec to the same chooser", /chooseSpell: \(actor, item, spec\) => chooseSpellFor\(actor, item, spec\),/.test(read("module", "feats-workflow.mjs")));
}

/* C — C3 */
{
  const pw = read("module", "peril-workflow.mjs");
  ok("C1 an area that leaves allies out skips its own side", /const ally = t\.disposition === token\.disposition;\n      if \(spec\.enemiesOnly && ally\) continue;\n      const centre = t\.object\?\.center \?\? null;/.test(pw));
  ok("C2 the area rail is handed to modules, with who rolled what", /runAreaEffect: async \(actor, spec, opts = \{\}\) => \{\n[^\n]*perilEffectSpec[^\n]*\n[^\n]*runDeclaredAreaEffect[^\n]*\n\s*return runDeclaredAreaEffect\(actor, perilEffectSpec\(spec\), opts\);/.test(read("module", "module-api-workflow.mjs"))
    && /const record = \{ actorId: actor\.id, uuid: actor\.uuid, name: actor\.name, degree: key, damage: 0 \};\n    if \(Array\.isArray\(results\)\) results\.push\(record\);/.test(pw));
}

/* D — C4 */
{
  const fr = await mod("fumble-reroll.mjs");
  const items = [{ type: "feat", name: "Fortune's Reversal", flags: { "trg-prime": { fumbleReroll: { checkTypes: ["attack", "skill", "save"], reaction: true, label: "Fortune's Reversal" } } } },
    { type: "ability", name: "Off", system: { active: false }, flags: { "trg-prime": { fumbleReroll: { label: "Off" } } } },
    { type: "feat", name: "Saves only", flags: { "trg-prime": { fumbleReroll: { checkTypes: ["save"], reaction: false } } } }];
  equal("D1 the items that answer each kind of fumble, an inactive ability not among them",
    ["attack", "skill", "save", "damage"].map((k) => fr.fumbleRerollRows(items, k).map((r) => [r.label, r.reaction])),
    [[["Fortune's Reversal", true]], [["Fortune's Reversal", true]], [["Fortune's Reversal", true], ["Saves only", false]], []]);
  const ck = read("module", "dice", "check.mjs");
  ok("D2 a skill check's or a save's Fumble is offered once, rerolled, and the second result stands — never on a shared roll's later creatures",
    /if \(check\.actor && !check\.flat && !check\.fumbleRerolled && !check\.presetDice && \["skill", "save"\]\.includes\(check\.type\)\n\s*&& (?:check\.outcome\?\.degree\?\.key === "fumble"|\["fumble", "blunder"\]\.includes\(check\.outcome\?\.degree\?\.key\))\) \{[\s\S]{0,420}offerFumbleReroll\(check\.actor, check\.type(?:, \{ degree: firstDegree \})?\);\n\s*if \(taken\) \{\n\s*check\.fumbleRerolled = true;\n\s*await check\.reroll\(\);/.test(ck));
  const aw = read("module", "combat", "attack-workflow.mjs");
  const early = aw.indexOf("  let fumbleConfirmedEarly = null;");
  ok("D3 an attack's fumble is confirmed and the reroll offered straight after the roll, for one who could take it",
    early > aw.indexOf("  let check = await TRGCheck.roll(attackCheckConfig);")
    && /if \(risk && fumbleRerollAvailable\(actor, "attack"\)\) \{\n[^\n]*\n\s*fumbleConfirmedEarly = await confirmAttackFumble\(actor, weapon, \{ dcHalved, weaponData \}\);/.test(aw));
  ok("D4 …rerolled IN PLACE, before the Strike spends anything (found in review): its ammunition, Aim, Aid, a once-rider, the multiple attack count",
    /check = await TRGCheck\.roll\(\{ \.\.\.attackCheckConfig, conditionalChoices: check\.conditionalChoices \?\? \[\], allowConviction: false \}\);\n\s*fumbleRerolled = true;\n\s*fumbleConfirmedEarly = null;/.test(aw)
    && ["  const spinCarried = Math.max(0, Number(weaponData.spinBonus ?? 0));", "  if (aidDefence) await consumeAidBonus(targetActor, aidDefence.effect);", "    await setSharedMapCount(actor, attackIndex + mapSteps);"].every((n) => aw.indexOf(n) > early)
    && !/return rollWeaponAttack\(actor, weapon, \{\n\s*\.\.\.callOptions/.test(aw));
  ok("D5 a fumble confirmed early is not checked again; one averted early is not tabled",
    /const fumbled = await rollFumbleCheck\(actor, weapon, \{ dcHalved: outcome\.fumbleDcHalved, weaponData, thrown: thrownAttack, confirmed: fumbleConfirmedEarly \}\);/.test(aw)
    && /if \(confirmed === false\) return null;\n(?:[^\n]*\n){1,6}?\s*if \(confirmed !== true && !\(await confirmAttackFumble\(actor, weapon, \{ dcHalved, weaponData \}\)\)\) return null;\n\s*return fumbleTableAfterConfirmation\(actor, weapon, category\);/.test(aw));
  const wf = read("module", "fumble-reroll-workflow.mjs");
  ok("D6 the reroll costs the reaction in combat and a counted use", /if \(row\.reaction && inCombat && !\(await spendReaction\(actor, row\.label, \{ traits: String\(row\.item\.system\?\.traits \?\? ""\) \}\)\)\) return null;/.test(wf) && /await row\.item\.update\(\{ "system\.usesValue": Math\.max\(0, itemUsesRemaining\(row\.item\) - 1\) \}\);/.test(wf));
}

/* E — C5 */
{
  const dof = await mod("combat", "defence-offer.mjs");
  dof.registerDefenceOffer("Test Intercession", { forAlly: true, reachFeet: 3, against: "weapon" }, "t");
  const row = dof.registeredDefenceOffers().find((r) => r.key === "test intercession");
  equal("E1 an offer for an ally is kept as one, its reach at least 5 feet", [row?.forAlly, row?.reachFeet], [true, 5]);
  const tokens = [{ id: "T", actorId: "t", disposition: 1, distance: 0 }, { id: "M", actorId: "m", disposition: 1, distance: 5 }, { id: "far", actorId: "f", disposition: 1, distance: 10 }, { id: "foe", actorId: "x", disposition: -1, distance: 5 }, { id: "A", actorId: "a", disposition: 1, distance: 5 }, { id: "thing", actorId: "", disposition: 1, distance: 5 }];
  equal("E2 who may step in: beside the attacked one, on its side, not it, not the attacker, not a token without a creature",
    dof.interceptorCandidates(tokens, { targetId: "T", attackerId: "A", disposition: 1, reachFeet: 5 }).map((t) => t.id), ["M"]);
  const dow = read("module", "combat", "defence-offer-workflow.mjs");
  ok("E3 a creature's own reactions and those for an ally are asked apart", /function defenceOffersAgainst\(defender, event, \{ forAlly = false \} = \{\}\)/.test(dow) && /const specs = registeredDefenceOffers\(\)\.filter\(\(s\) => Boolean\(s\.forAlly\) === Boolean\(forAlly\)\);/.test(dow));
  const aw = read("module", "combat", "attack-workflow.mjs");
  const ask = aw.indexOf("    const interceptor = await offerIntercepts(actor, targetToken, attackerToken ?? null, { kind: \"weapon\", what: weapon.name });");
  ok("E4 an attack the player aims is offered to the allies, and retargets on a yes, the one who steps in taking the target's place",
    /if \(targetToken && targetActor && !isReaction && !skipTargetPrompt\) \{\n\s*const \{ offerIntercepts \} = await import\("\.\/defence-offer-workflow\.mjs"\);/.test(aw)
    && /targetToken = interceptor;\n\s*targetActor = interceptor\.actor;\n\s*try \{ targetToken\.setTarget\?\.\(true, \{ user: game\.user, releaseOthers: true \}\); \} catch \{ \/\* the attack goes on regardless \*\/ \}\n\s*\}/.test(aw));
  ok("E5 …asked once the Strike is committed — after its refusals, the GM's leave and the AP — and before the defender's own reactions (found in review)",
    aw.indexOf("    await spendActionPoints(actor, \"1\", `${weapon.name} — Strike`, { use: \"strike\" });") > 0 && aw.indexOf("  if (sanctuary.blocked) return null;") > 0
    && ask > aw.indexOf("    await spendActionPoints(actor, \"1\", `${weapon.name} — Strike`, { use: \"strike\" });")
    && ask > aw.indexOf("  if (sanctuary.blocked) return null;")
    && ask < aw.indexOf("    await offerDefences(actor, targetActor, { kind: \"weapon\", what: weapon.name });"));
}

/* F — C6 */
{
  const fm = await mod("combat", "forced-movement.mjs");
  const carriers = [{ flags: { "trg-prime": { forcedMovementReduction: 5 } } }, { flags: { "trg-prime": { forcedMovementReduction: "x" } } }, { flags: {} }];
  equal("F1 the reduction is summed from the carriers; a push never goes below 0",
    [fm.forcedMovementReduction(carriers), fm.reducedPushFeet(10, 5), fm.reducedPushFeet(5, 5), fm.reducedPushFeet(5, 10)], [5, 5, 0, 0]);
  equal("F2 the card says why", [fm.describePush({ ok: true, moved: true, movedFeet: 5, requestedFeet: 5, reducedBy: 5, reducedLabel: "Immovable Plating" }, "Kabuto"), fm.describePush({ ok: true, moved: false, movedFeet: 0, requestedFeet: 0, reducedBy: 5, reducedLabel: "Immovable Plating" }, "Kabuto")],
    ["Kabuto is pushed 5 ft (5 ft shorter: Immovable Plating).", "Kabuto is not moved (5 ft shorter: Immovable Plating)."]);
  ok("F3 the push reads the target's own carriers", /const reduction = forcedMovementReduction\(targetToken\.actor \? declarationCarriers\(targetToken\.actor\) : \[\]\);\n[^\n]*\n\s*feet = reducedPushFeet\(feet, reduction\);/.test(read("module", "combat", "forced-movement-workflow.mjs")));
}

/* G — C7 */
{
  const acw = read("module", "combat", "action-workflow.mjs");
  ok("G1 the action takes the four options", /presetDice = null, dcOverride = null, dcLabel = "", ignoreActionImmunity = false,?\n(?:\s*\/\/[^\n]*\n)*(?:\s*presetConvictionDie = 0,?\n)?(?:\s*\/\/[^\n]*\n)*(?:\s*presetModifiers = null\n)?\} = \{\}\) \{/.test(acw));
  ok("G2 the DC named replaces the action's", /if \(dcOverride !== null && dcOverride !== undefined && Number\.isFinite\(Number\(dcOverride\)\)\) \{\n\s*finalDC = Number\(dcOverride\);/.test(acw));
  ok("G3 the first roll's die is met again", /\.\.\.\(presetDice \? \{ presetDice(?:, presetConvictionDie)? \} : \{\}\),/.test(acw));
  ok("G4 the action's own immunity is neither asked nor stamped", /if \(targetActor && ACTION_IMMUNITIES\[action\.key\] && !ignoreActionImmunity\) \{/.test(acw) && /if \(targetActor && rawDegree && ACTION_IMMUNITIES\[action\.key\] && !ignoreActionImmunity\) \{/.test(acw)
    && /ignoreActionImmunity: Boolean\(stored\?\.ignoreActionImmunity\),/.test(acw));
}

/* H — C8 */
{
  const df = await mod("daily-firsts.mjs");
  const exact = [{ name: "TD", flags: { "trg-prime": { dailyFirst: [{ action: "refocus", set: "critical", exact: true, label: "TD" }] } } }];
  const kept = [{ name: "X", flags: { "trg-prime": { dailyFirst: [{ action: "refocus", set: "critical", label: "X" }] } } }];
  equal("H1 \"treated as a Critical without the need for a roll\": exactly a Critical, even over a Heroic; the old set keeps a better roll",
    [df.dailyFirstDegree(exact, "refocus", "heroic")?.degree, df.dailyFirstDegree(exact, "refocus", "fumble")?.exact, df.dailyFirstDegree(kept, "refocus", "heroic")?.degree], ["critical", true, "heroic"]);
  const adv = [{ name: "TM", flags: { "trg-prime": { dailyFirst: [{ actions: ["cleansingTrance", "clearMind"], slot: "tm", advantage: true }] } } }];
  equal("H2 advantage on the day's first of several actions, one slot between them",
    [df.dailyFirstAdvantage(adv, "clearMind", {})?.slot, df.dailyFirstAdvantage(adv, "clearMind", { dailyFirsts: { tm: true } }), df.dailyFirstAdvantage(adv, "refocus", {})], ["tm", null, null]);
  const acw = read("module", "combat", "action-workflow.mjs");
  ok("H3 the action rolls it with advantage and spends the slot", /\.\.\.\(firstAdvantage \? \["advantage"\] : \[\]\)/.test(acw) && /if \(check && firstAdvantage\) \{\n\s*await actor\.setFlag\(SYSTEM_ID, DAILY_FIRSTS_FLAG, \{ \.\.\.\(actor\.getFlag\(SYSTEM_ID, DAILY_FIRSTS_FLAG\) \?\? \{\}\), \[firstAdvantage\.slot\]: true \}\);/.test(acw));
}

/* I — C9 */
{
  const api = await mod("module-api.mjs");
  const ls = await mod("light-sources.mjs");
  api.resetModuleRegistry();
  const n = api.registerLightSources([
    { key: "test-beacon", label: "Test", steps: 3, cap: null, magical: true, radiusFeet: 20, dimFeet: 40, brightFeet: 20 },
    { key: "test-dim", steps: 1, radiusFeet: 10, brightFeet: 0 },
    { key: "torch", steps: 5, radiusFeet: 99 },
    { key: "bad", steps: 0, radiusFeet: 10 }
  ], "m", Object.keys(ls.LIGHT_SOURCES));
  equal("I1 a module's lights register; a core key and a light of no steps are refused and reported", [n, api.registrationProblems().length], [2, 2]);
  equal("I2 a registered light is a light the system knows, and a core key is still the core's", [ls.isLightSourceKey("test-beacon"), ls.isLightSourceKey("nothing"), ls.lightSource("torch").steps, ls.lightSource("test-beacon").module], [true, false, 2, true]);
  const cfg = (k) => { const c = ls.foundryLightConfig(k); return [c.dim, c.bright]; };
  equal("I3 what is drawn may differ from what is counted: 40 and 20; a dim light with no bright ring; a torch as before", [cfg("test-beacon"), cfg("test-dim"), cfg("torch")], [[40, 20], [10, 0], [20, 10]]);
  equal("I4 the ladder counts it as any light", [ls.applyLightSource(4, "test-beacon"), ls.applyLightSource(4, "test-dim"), ls.resolvedLevelWithSources({ level: 4, source: "scene" }, ["test-dim"]).level], [7, 5, 5]);
  api.resetModuleRegistry();
  equal("I5 and forgets it when the registry does", ls.isLightSourceKey("test-beacon"), false);
  ok("I6 an ended light redraws the brightest left, on one client and directly (found in review)",
    /const here = isActingGM\(\) \|\| \(!globalThis\.game\?\.users\?\.activeGM && actor\.isOwner\);\n\s*if \(!here\) return;\n\s*refreshAttachedLight\(actor, \{ direct: true \}\)\.catch\(\(err\) => \{/.test(read("module", "light-attach-workflow.mjs")));
  const st = read("module", "magic", "spell-template.mjs");
  ok("I7 the area aim can move a thing: its own commit, a start where the thing is, and a limit from it",
    /const commit = typeof opts\?\.commit === "function" \? opts\.commit : async/.test(st) && /if \(!isDirectional && opts\?\.fromPoint\) \{/.test(st)
    && /const withinMove = \(candidate\) => !from\n\s*\|\| Number\(canvas\.grid\.measurePath\?\.\(\[from, candidate\]\)\?\.distance \?\? 0\) <= Number\(opts\.maxFeetFrom\);/.test(st)
    && /const o = from \?\? center;/.test(st));
  const pl = read("module", "magic", "placed-light-workflow.mjs");
  ok("I8 a placed light is a circle that raises the light a step where it stands, keyed to its Use, with its own clock",
    /lightShift: \{ steps, floor: 1, cap: spec\.cap \?\? 10 \},\n\s*castId,\n\s*\[LIGHT_CIRCLE_FLAG\]/.test(pl) && /\[REGION_EXPIRY_FLAG\]: regionExpiryRecord\(\{ castId, spellName: name, ends \}\)/.test(pl));
  ok("I9 moving one updates its circle; removing takes the Use's circles, on the scene they were placed on",
    /await region\.update\(\{ shapes: \[shape\] \}\);/.test(pl) && /await circles\[0\]\.parent\.deleteEmbeddedDocuments\("Region", circles\.map\(\(r\) => r\.id\)\);/.test(pl)
    && /return \(sceneId \? globalThis\.game\?\.scenes\?\.get\?\.\(sceneId\) : null\) \?\? globalThis\.canvas\?\.scene \?\? null;/.test(pl));
  ok("I11 a player's move or removal goes through the acting GM when it may not write the Region, and the GM moves only a light circle",
    /if \(!writesHere\(region\)\) return askGM\("lightCircle\.move", \{/.test(pl) && /if \(!circles\.every\(\(r\) => writesHere\(r\)\)\) return askGM\("lightCircle\.remove"/.test(pl)
    && /if \(!action\.startsWith\("lightCircle\."\) \|\| !isActingGM\(\)\) return;/.test(pl) && /if \(region\?\.getFlag\?\.\(SYSTEM_ID, LIGHT_CIRCLE_FLAG\)\) await moveCircle\(region/.test(pl)
    && /\n  registerPlacedLights\(\);\n/.test(read("scripts", "trg-prime.mjs")));
  const apiw = read("module", "module-api-workflow.mjs");
  ok("I10 a module may register lights and is handed the light helpers",
    /registerLightSources: \(entries, moduleId\) => registerLightSources\(entries, moduleId, Object\.keys\(LIGHT_SOURCES\)\),/.test(apiw)
    && ["refreshTokenLight", "placeLightCircles", "moveLightCircles", "removeLightCircles", "lightCirclesOf"].every((h) => apiw.includes(`      ${h}: async`)));
}

/* J — B5-3 */
{
  const cr = await mod("conviction-refund.mjs");
  const items = [{ type: "feat", name: "Adaptive Mind", flags: { "trg-prime": { convictionRefund: { skills: ["mentalFocus"], degrees: ["success", "critical", "heroic"], label: "Adaptive Mind" } } } }];
  const r = (subject, degree, checkType = "skill") => cr.convictionRefundRow(items, { checkType, subject, degree })?.label ?? null;
  equal("J1 refunded on the named skill at the named degrees, and nowhere else", [r("mentalFocus", "success"), r("mentalFocus", "heroic"), r("mentalFocus", "partial"), r("perception", "success"), r("mentalFocus", "success", "save")], ["Adaptive Mind", "Adaptive Mind", null, null, null]);
  const ck = read("module", "dice", "check.mjs");
  ok("J2 the roll refunds it after Scoundrel's Luck, never with it, and never for a point Luck of Heroes kept",
    /\} else if \(advantageSpent && !advantageKept && check\.actor\) \{\n[^\n]*\n[^\n]*\n\s*const \{ convictionRefundRow, convictionRefundLine \} = await import\("\.\.\/conviction-refund\.mjs"\);/.test(ck)
    && /if \(refund\) \{\n\s*await awardConviction\(check\.actor, 1\);\n\s*await check\.actor\.unsetFlag\(SYSTEM_ID, "convictionSpent"\);\n\s*check\.convictionRefunded = true;/.test(ck));
  ok("J3 the card remembers it, so a late DC does not give it twice", /convictionRefunded: Boolean\(this\.convictionRefunded\),/.test(ck)
    && /if \(!raw\.convictionRefunded && !raw\.scoundrelRefunded &&\n\s*raw\.modifiers\.some\(\(m\) => m\.label === "Conviction: Advantage"\)\) \{/.test(read("module", "dice", "check-card-interactions.mjs")));
}

/* J2 — innate spells only */
{
  const sdc = await mod("magic", "spell-dc-bonus.mjs");
  const fx = [{ flags: { "trg-prime": { spellDCBonus: { label: "EA", value: 1, type: "race", traits: ["fire"], innateOnly: true } } } }];
  equal("J4 a DC bonus for innate spells reaches an innate fire spell, not a prepared one (found in review)", [sdc.declaredSpellDCBonuses(fx, "Fire", { innate: true }).length, sdc.declaredSpellDCBonuses(fx, "Fire", { innate: false }).length, sdc.declaredSpellDCBonuses(fx, "Fire").length], [1, 0, 0]);
  const cw = read("module", "magic", "cast-workflow.mjs");
  ok("J5 the cast says whether it is innate, and an innate spell's attack names itself", /declaredSpellDCBonuses\(\n\s*Array\.from\(actor\.appliedEffects \?\? actor\.effects \?\? \[\]\), spellData\.traits, \{ innate: isInnate \}\)/.test(cw) && /label: `\$\{spell\.name\} — Innate Attack`,\n[^\n]*\n[^\n]*\n\s*actionKey: "innateSpellAttack",/.test(cw));
}

/* K — an ally aura switched on by a Use */
{
  const aae = await mod("ally-aura-effects.mjs");
  const acond = await mod("aura-conditionals.mjs");
  const aura = { id: "a", name: "Beacon", kind: "ally", radius: 20, includeSelf: true, emitterState: "beacon", allyEffect: aae.allyEffectOf({ statuses: ["concealed"] }) };
  const emitters = (states) => [{ id: "E", name: "E", centreFeet: { x: 0, y: 0 }, widthFeet: 5, disposition: 1, states, auras: [aura] }];
  const subjects = [{ id: "E", centreFeet: { x: 0, y: 0 }, widthFeet: 5, disposition: 1 }, { id: "A", centreFeet: { x: 10, y: 0 }, widthFeet: 5, disposition: 1 }];
  const count = (states) => { const w = aae.wantedAllyGrants({ subjects, emitters: emitters(states) }); return [w.get("E").length, w.get("A").length]; };
  equal("K1 an ally aura gated on a state lays nothing while it is off", [count(["beacon"]), count([])], [[1, 1], [0, 0]]);
  const grantAura = { ...aura, allyEffect: null, grants: { kind: "modifier", value: 1, scope: "x" } };
  const rows = (states) => acond.allyConditionalsInForce({ subject: { id: "A", centreFeet: { x: 10, y: 0 }, disposition: 1 }, emitters: [{ ...emitters(states)[0], auras: [grantAura] }] }).length;
  equal("K2 …nor grants anything at the roll", [rows(["beacon"]), rows([])], [1, 0]);
  ok("K3 the switch arriving or leaving brings the auras into step", /for \(const hook of \["createActiveEffect", "deleteActiveEffect"\]\) \{\n\s*Hooks\.on\(hook, \(effect\) => \{ if \(effect\?\.getFlag\?\.\(SYSTEM_ID, "auraSwitch"\)\) syncAllyAuraEffects\(\); \}\);/.test(read("module", "ally-aura-effects-workflow.mjs")));
}

/* L — the version */
// AT LEAST 3.669.0 (re-pinned at 3.669.1): these seams arrived there.
{ const v = JSON.parse(read("system.json")).version.split(".").map(Number); ok("L1 the system is 3.669.0 or later", v[0] > 3 || (v[0] === 3 && (v[1] > 669 || (v[1] === 669 && v[2] >= 0)))); }

const EXPECTED = 51;
equal("Z the suite ran every check it is meant to", checks + 1, EXPECTED);
if (failures.length) { console.log(`verify-block5-core: ${checks} checks — ${failures.length} FAILED\n`); for (const x of failures) console.log(`  ✗ ${x}`); process.exitCode = 1; }
else console.log(`verify-block5-core: ${checks} checks — all green.`);
