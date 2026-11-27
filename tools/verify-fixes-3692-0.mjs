#!/usr/bin/env node
/**
 * verify-fixes-3692-0 — TRG Prime 3.692.0: the fixes Graham asked for before
 * Eldritch Arts Block 10 (15 November 2026, "Work through the fixes before
 * moving onto Block 10"; his answers to the four questions).
 *   A. An innate spell is not stored ("Innate spells aren't stored").
 *   B. A ritual's cast items are told the skill its check uses (`checkSkill`),
 *      so a module can drop a Spellcraft catalyst on a tradition-skill ritual.
 *   C–G. Block 7's five deferred seams ("All five"):
 *   C. a thorns row whose type its owner chooses each time they are struck
 *      (Glyph of Retribution), asked through a new owner choice query;
 *   D. a Region that gives off light (Arcane Mycelium's dim light);
 *   E. an action resolved at a total already rolled (Spirit Arrow), and the
 *      attack total on `trgPrimeStrikeResolved`;
 *   F. a halved speed (Eaog Balls);
 *   G. a Sustain hook a module can answer (Metamagic Resonance).
 *
 *   node tools/verify-fixes-3692-0.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

let checks = 0;
const failures = [];
const ok = (label, cond, detail = "") => { checks += 1; if (!cond) failures.push(`${label}${detail ? ` — ${detail}` : ""}`); };
const equal = (label, a, e) => ok(label, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const mod = (...p) => import(new URL(`../module/${p.join("/")}`, import.meta.url));

const cw = strip(read("module", "magic", "cast-workflow.mjs"));

/* A — innate spells aren't stored ---------------------------------- */
ok("A a cast stores only the caster's own, non-innate spell",
  /const storesThisCast = castsOwnSpell && !spell\?\.system\?\.innate;\n\s*const storingNow = !stored && !isStoringSpell && !ritual && !heldRelease && storesThisCast && Boolean\(readArmed\(actor\)\);/.test(cw));

/* B — the ritual's check skill, for its cast items ----------------- */
ok("B a ritual's cast items are told the skill its check uses",
  /checkSkill: String\(ritualPlan\.skill\?\.key \?\? ""\)/.test(cw));

/* C — thorns whose type is chosen when struck ---------------------- */
const T = await mod("magic", "thorns.mjs");
const glyph = T.normaliseThorns({ label: "Glyph", damage: "1d6", damageType: "sonic", typeChoices: ["Acid", "cold", "acid", "", " electricity ", "fire"] });
equal("C the offered types, cleaned and kept in order", glyph.typeChoices, ["acid", "cold", "electricity", "fire"]);
equal("C a row with none offers none (Vibrant Thorns untouched)", [T.normaliseThorns({ damage: "1", damageType: "piercing" }).typeChoices, T.normaliseThorns({ damage: "1", damageType: "piercing", typeChoices: ["", " "] }).typeChoices], [undefined, undefined]);
equal("C the owner's pick is dealt when offered; otherwise the printed type",
  [T.thornsDamageTypeFor(glyph, "FIRE"), T.thornsDamageTypeFor(glyph, ""), T.thornsDamageTypeFor(glyph, "sonic"), T.thornsDamageTypeFor(glyph, "poison")], ["fire", "sonic", "sonic", "sonic"]);
equal("C the choices survive the cast's stamp and a second read", T.normaliseThorns(T.spellThorns(glyph, { casterLevel: 4 })).typeChoices, ["acid", "cold", "electricity", "fire"]);
const tw = strip(read("module", "magic", "thorns-workflow.mjs"));
ok("C the defender's player is asked before the damage, one offer taken without asking, nothing asked when nothing is dealt",
  /let damageType = spec\.damageType;[\s\S]{0,400}if \(\(spec\.typeChoices \?\? \[\]\)\.length && Number\(roll\.total\) > 0\) \{\n\s*let picked = spec\.typeChoices\.length === 1 \? spec\.typeChoices\[0\] : "";\n\s*if \(!picked\) \{[\s\S]{0,200}picked = await askOwnerChoice\(defender, \{/.test(tw));
ok("C …and the chosen type is the one resolved, reacted to and printed",
  /damageType = thornsDamageTypeFor\(spec, picked\);/.test(tw)
  && /spellDamageReactionsFor\(attacker, damageType, \{/.test(tw)
  && /amount: roll\.total,\n\s*type: damageType,/.test(tw)
  && /\+ `\$\{damageType\} \(\$\{formula\} rolled/.test(tw)
  && /\$\{saveLine\}\$\{typeLine\}\.`/.test(tw)
  && !/type: spec\.damageType/.test(tw));
const oq = strip(read("module", "owner-query-workflow.mjs"));
ok("C the choice query is registered beside the yes/no one",
  /CONFIG\.queries\[OWNER_CHOICE_QUERY\] = async \(data\) => chooseHere\(data, \{ windowMs: ANSWER_WINDOW_MS \}\);/.test(oq)
  && /const OWNER_CHOICE_QUERY = "trg-prime\.ownerChoice";/.test(oq));
ok("C askOwnerChoice asks the owner's client, the GM, or here — and an unanswered question is \"\"",
  /export async function askOwnerChoice\(actor, question\) \{[\s\S]{0,300}answeringUserId\(owners,[\s\S]{0,200}if \(!id\) return chooseHere\(question\);[\s\S]{0,200}user\.query\(OWNER_CHOICE_QUERY, question, \{ timeout: WAIT_MS \}\)[\s\S]{0,200}return "";/.test(oq));
ok("C a late or unknown answer is no answer",
  /if \(!offered\.some\(\(c\) => String\(c\.action\) === picked\)\) return "";\n\s*if \(windowMs > 0 && !answeredInTime\(askedAt, Date\.now\(\), windowMs\)\) \{[\s\S]{0,120}return "";/.test(oq));

/* D — a Region that gives off light -------------------------------- */
const L = await mod("light.mjs");
equal("D the brightest emitting Region counts; junk is ignored",
  [L.regionEmittedLight([null, { level: 5, label: "Mycelium" }, { level: 3 }, { level: 11 }, { level: "x" }]), L.regionEmittedLight([]), L.regionEmittedLight([{ level: 4 }])],
  [{ level: 5, label: "Mycelium" }, null, { level: 4, label: "emitted light" }]);
equal("D it raises to at least its level and never dims", [L.withEmittedLight(2, { level: 5 }), L.withEmittedLight(8, { level: 5 }), L.withEmittedLight(5, null)], [5, 8, 5]);
{
  // AS A MAGICAL LIGHT SOURCE (found in review): nothing in Abyssal Darkness; Supernatural Darkness does not stop it.
  const LS = await mod("light-sources.mjs");
  const asSource = (base) => LS.applyLightSource(base, { steps: 5 - base, cap: 5, magical: true });
  equal("D …and in darkness it answers as a magical source would: Abyssal (1) stays, Supernatural (2) and Pitch Black (3) light to 5",
    [1, 2, 3].map((b) => [L.withEmittedLight(b, { level: 5 }), asSource(b)]), [[1, 1], [5, 5], [5, 5]]);
}
{
  globalThis.game = { settings: { get: () => null } };
  globalThis.canvas = { scene: null };
  const warn = console.warn; console.warn = () => {};
  const LW = await mod("light-workflow.mjs");
  const region = (flags) => ({ getFlag: (_s, k) => flags[k] });
  const scene = (level) => ({ getFlag: (_s, k) => (k === "lightLevel" ? level : undefined), environment: { darknessLevel: 0 }, tokens: [] });
  const at = (sceneLevel, regions) => LW.lightLevelForToken({ id: "t", parent: scene(sceneLevel), regions });
  const glow = region({ emitsLight: { level: 5, label: "Arcane Mycelium (dim light)" } });
  equal("D at a token: a dark scene lit to Dim inside the Region, a bright one untouched, outside untouched",
    [at(2, [glow]), at(8, [glow]).level, at(2, []).level], [{ level: 5, source: "Arcane Mycelium (dim light)" }, 8, 2]);
  equal("D …and it lands before the spells that shift the level: Darkness's −3 takes it from 5",
    at(2, [glow, region({ lightShift: { steps: -3, floor: 1 } })]).level, 2);
  console.warn = warn;
}
const lw = strip(read("module", "light-workflow.mjs"));
ok("D it is read with the sources, before the shifts",
  lw.indexOf("const emitted = regionEmittedLight(") > lw.indexOf("const sourced = resolveLightLevelWithSources(ambient, tokenDocument, scene);")
  && lw.indexOf("const emitted = regionEmittedLight(") < lw.indexOf("const shifts = regionLightShifts(tokenDocument?.regions);"));

/* E — an action at a total already rolled -------------------------- */
const SM = await mod("magic", "spell-maneuver.mjs");
equal("E the degree from the reused total against the action's DC",
  [SM.basicActionAtTotal({ actionKey: "tripAttack", total: 20, dc: 18 }).degree, SM.basicActionAtTotal({ actionKey: "tripAttack", total: 28, dc: 18 }).degree, SM.basicActionAtTotal({ actionKey: "tripAttack", total: 12, dc: 18 }).degree],
  ["success", "critical", "failure"]);
equal("E the action's printed difficulty raises the DC (a Feint is Hard, +2)", [SM.basicActionAtTotal({ actionKey: "feint", total: 20, dc: 19, difficulty: "hard" }).dc, SM.basicActionAtTotal({ actionKey: "feint", total: 20, dc: 19, difficulty: "hard" }).degree], [21, "partial"]);
equal("E the action's size penalty applies (Graham's Tanglefoot ruling)", [SM.basicActionAtTotal({ actionKey: "grappleAttack", total: 20, dc: 18, actorSize: "medium", targetSize: "huge" }).total, SM.basicActionAtTotal({ actionKey: "grappleAttack", total: 20, dc: 18, actorSize: "medium", targetSize: "huge" }).sizeModifier], [16, -4]);
equal("E nothing to resolve without a DC or a total", [SM.basicActionAtTotal({ actionKey: "feint", total: 20, dc: null }).ok, SM.basicActionAtTotal({ actionKey: "feint", total: NaN, dc: 10 }).ok, SM.basicActionAtTotal({ total: 20, dc: 10 }).ok], [false, false, false]);
{
  const W = await mod("combat", "basic-action-at-total-workflow.mjs");
  globalThis.game = { combat: { started: true, round: 4 }, settings: { get: () => null } };
  const toggled = [];
  const mk = (name, extra = {}) => {
    const a = { name, uuid: `Actor.${name}`, isOwner: true, flags: {}, conditions: new Set(), system: { identity: { size: "medium", level: 5 }, combat: { saves: { fortitude: { dc: 18 } } }, skills: { acrobatics: { dc: 15 }, senseMotive: { dc: 12 } }, ...extra }, effects: [], items: [] };
    a.toggleStatusEffect = async (key, o) => { toggled.push([name, key, o.active]); if (o.active) a.conditions.add(key); return { update: async () => {} }; };
    a.hasCondition = (k) => a.conditions.has(k);
    a.setFlag = async (sc, k, v) => { (a.flags[sc] ??= {})[k] = v; };
    return a;
  };
  const archer = mk("Archer"), deer = mk("Deer");
  const trip = await W.resolveBasicActionAtTotal(archer, deer, "tripAttack", { total: 25, label: "Spirit Arrow" });
  equal("E the workflow: a Trip at 25 against the better of Acrobatics and Fortitude (18) — a success, the target prone", [trip.ok, trip.dc, trip.degree, toggled.at(-1)], [true, 18, "success", ["Deer", "prone", true]]);
  const { levelDC } = await mod("dice", "resolution.mjs");
  const feint = await W.resolveBasicActionAtTotal(archer, deer, "feint", { total: levelDC(5) + 2, label: "Spirit Arrow" });
  equal("E …a Feint is read from the skill actions: the Level DC (above Sense Motive) made Hard, a success flat-foots the target", [feint.ok, feint.dc, feint.degree, toggled.at(-1)], [true, levelDC(5) + 2, "success", ["Deer", "flatFooted", true]]);
  equal("E …who left it flat-footed is recorded, as the Feint action records it", deer.flags["trg-prime"]?.flatFootedFrom?.uuid, "Actor.Archer");
  const boar = mk("Boar");
  const grab = await W.resolveBasicActionAtTotal(archer, boar, "grappleAttack", { total: 19, label: "Spirit Arrow", rounds: 1 });
  equal("E …a Grapple: grabbed, held by the archer", [grab.degree, toggled.at(-1), boar.flags["trg-prime"]?.grabbedBy?.uuid], ["success", ["Boar", "grabbed", true], "Actor.Archer"]);
  globalThis.game = { combat: null, settings: { get: () => null } };
  const outside = await W.resolveBasicActionAtTotal(archer, mk("Hare"), "grappleAttack", { total: 19, label: "Spirit Arrow", rounds: 1 });
  ok("E …out of combat its clock is said, to be cleared by hand", outside.lines.some((l) => /Lasts 1 round — no encounter running, so clear it by hand/.test(l)));
  globalThis.game = { combat: { started: true, round: 4 }, settings: { get: () => null } };
  const none = await W.resolveBasicActionAtTotal(archer, deer, "noSuchAction", { total: 25 });
  equal("E …an unknown action resolves nothing and says so", [none.ok, /unknown action/.test(none.lines[0])], [false, true]);
}
const api = strip(read("module", "module-api-workflow.mjs"));
{
  // ON THE GM'S CLIENT for a target this one does not own (found in review).
  const bw = strip(read("module", "combat", "basic-action-at-total-workflow.mjs"));
  ok("E a target this client may not write to is resolved through the relay, unless told it is the GM's own call",
    /if \(!direct\) \{\n\s*const \{ relayActionAtTotal \} = await import\("\.\/target-relay-workflow\.mjs"\);/.test(bw));
  const TR = await mod("combat", "target-relay.mjs");
  const ran = [];
  const deps = (owns) => ({
    fromUuid: async (u) => ({ uuid: u, name: u }),
    userOwns: () => owns,
    actionAtTotal: async (actor, target, key, opts) => { ran.push([actor.uuid, target.uuid, key, opts]); return { ok: true, lines: ["done"] }; }
  });
  const req = (payload) => ({ action: TR.RELAY_ACTIONS.ACTION_AT_TOTAL, uuid: "Actor.Boar", userId: "u1", payload });
  const good = await TR.performRelay(req({ actorUuid: "Actor.Archer", actionKey: "grappleAttack", total: 19, label: "Spirit Arrow", rounds: 1 }), deps(true));
  const notOwner = await TR.performRelay(req({ actorUuid: "Actor.Archer", actionKey: "grappleAttack", total: 19 }), deps(false));
  const noTotal = await TR.performRelay(req({ actorUuid: "Actor.Archer", actionKey: "grappleAttack", total: "x" }), deps(true));
  equal("E the GM's client runs it for the asker's own creature, and only with a total",
    [good.ok, ran[0], notOwner.ok, noTotal.ok, ran.length], [true, ["Actor.Archer", "Actor.Boar", "grappleAttack", { total: 19, label: "Spirit Arrow", rounds: 1 }], false, false, 1]);
  const trw = strip(read("module", "combat", "target-relay-workflow.mjs"));
  ok("E …and calls the workflow directly there", /actionAtTotal: async \(actor, target, actionKey, opts\) => \{\n\s*const \{ resolveBasicActionAtTotal \} = await import\("\.\/basic-action-at-total-workflow\.mjs"\);\n\s*return resolveBasicActionAtTotal\(actor, target, actionKey, \{ \.\.\.opts, direct: true \}\);/.test(trw));
}
ok("E the helper is on the module helpers", /resolveBasicActionAtTotal: async \(actor, target, actionKey, opts = \{\}\) =>\n\s*\(await import\("\.\/combat\/basic-action-at-total-workflow\.mjs"\)\)\.resolveBasicActionAtTotal\(actor, target, actionKey, opts \?\? \{\}\),/.test(api));
const aw = strip(read("module", "combat", "attack-workflow.mjs"));
ok("E trgPrimeStrikeResolved carries the attack total", /fumble: Boolean\(confirmedFumble\),\n\s*total: Number\(check\?\.outcome\?\.total \?\? check\?\.total \?\? NaN\)\n\s*\}\);/.test(aw));

/* F — a halved speed ----------------------------------------------- */
const GS = await mod("combat", "granted-speeds.mjs");
const halfItem = { flags: { "trg-prime": { creatureAbility: { derives: { [GS.HALVED_SPEED_PATH]: true } } } } };
const halfEffect = { flags: { "trg-prime": { [GS.HALVED_SPEED_PATH]: true } } };
equal("F an item or an effect halves; none, a false one, or a disabled effect does not",
  [GS.speedsHalved([halfItem]), GS.speedsHalved([halfEffect]), GS.speedsHalved([]), GS.speedsHalved([{ flags: { "trg-prime": { creatureAbility: { derives: { [GS.HALVED_SPEED_PATH]: false } } } } }]), GS.speedsHalved([{ ...halfEffect, disabled: true }])],
  [true, true, false, false, false]);
{
  const SP = await mod("combat", "speed-pool.mjs");
  const run = (halved, extra = {}) => SP.resolveMovement({
    movement: { land: { base: 30, total: 30 }, fly: { base: 25, total: 25 }, swim: { base: 0, total: 0 } },
    halved, roundToGrid: true, landSpeed: ({ base }) => ({ speed: base, immobilised: false }), ...extra
  });
  const h = run(true), plain = run(false);
  equal("F halved: every speed, rounded down to 5 feet; none it lacks; unhalved untouched",
    [h.land.total, h.fly.total, h.swim.total, h.halved, plain.land.total, plain.fly.total, plain.halved], [15, 10, 0, true, 30, 25, undefined]);
  equal("F …after armour and load (the speed it actually has)", run(true, { landSpeed: ({ base }) => ({ speed: base - 10, immobilised: false }) }).land.total, 10);
}
const actor = strip(read("module", "documents", "actor.mjs"));
ok("F the derivation reads it from items and applied effects and hands it to resolveMovement",
  /const halved = speedsHalved\(\[\.\.\.Array\.from\(actor\.items \?\? \[\]\), \.\.\.Array\.from\(actor\.appliedEffects \?\? \[\]\)\]\);/.test(actor) && /setSpeeds: replaced,\n\s*halved,/.test(actor)
  && /import \{ grantedSpeeds, setSpeeds, speedsHalved \} from "\.\.\/combat\/granted-speeds\.mjs";/.test(actor));
const se = strip(read("module", "magic", "spell-effects.mjs"));
{
  const hv = se.slice(se.indexOf('case "speedHalve": {'), se.indexOf('case "sizeStep": {'));
  ok("F the speedHalve row lays a relayed effect under the cast, for the row's own duration if it has one — no item (a player may not make one on the GM's creature)",
    /const halveDuration = ownDuration \? parseSpellDuration\(ownDuration\) : parsedDuration;/.test(hv)
    && /parsedDuration: halveDuration, castId, registersCast\n\s*\}\);\n\s*hvData\.flags\[SYSTEM_ID\]\[HALVED_SPEED_PATH\] = true;/.test(hv)
    && /await createEffectsOn\(target, \[hvData\]\);/.test(hv)
    && !/createEmbeddedDocuments/.test(hv));
}
const EK = await mod("magic", "effect-kinds.mjs");
ok("F speedHalve is a handled kind", EK.HANDLED_EFFECT_KINDS.includes("speedHalve"));

/* G — the Sustain hook --------------------------------------------- */
const sw = strip(read("module", "magic", "sustain-workflow.mjs"));
ok("G a Sustain that did not run out announces itself, with the cast id",
  /if \(!ranOut\) \{\n\s*Hooks\.callAll\("trgPrimeSpellSustained", \{\n\s*actor, entry: sustained, castId: String\(sustained\.id \?\? ""\), spellName: String\(sustained\.name \?\? ""\)\n\s*\}\);\n\s*\}\n\n\s*return sustained;/.test(sw));

ok("G Effortless Spell's free Sustain announces itself too (found in review)",
  /const entry = await sustainActiveSpell\(actor, id, game\.combat\?\.round \?\? 0\);[\s\S]{0,500}if \(entry\) Hooks\.callAll\("trgPrimeSpellSustained", \{ actor, entry, castId: String\(entry\.id \?\? ""\), spellName: String\(entry\.name \?\? ""\), effortless: true \}\);/.test(strip(read("module", "feats-workflow.mjs"))));

/* Z ---------------------------------------------------------------- */
const sys = JSON.parse(read("system.json"));
equal("Z the version is 3.692.0, and the download names it", [sys.version, JSON.parse(read("package.json")).version, sys.download.includes("/v3.717.1/")], ["3.717.1", "3.717.1", true]);

if (failures.length) {
  console.log(`verify-fixes-3692-0: ${checks} checks, ${failures.length} failure(s).`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exitCode = 1;
} else console.log(`verify-fixes-3692-0: OK — ${checks} checks.`);
