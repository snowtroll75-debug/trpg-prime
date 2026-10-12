#!/usr/bin/env node
/**
 * verify-drive-3622 — the 3.622.0 drive's findings, 3.622.1.
 *
 * Graham's rulings of 5 October 2026 (R1–R8, "your recommendation") on
 * claude/live-testing-report-3.622.0.md.
 *
 *   A  R1: spells meet trait immunity (Mindless against Mental, Emotion, Fear)
 *   B  R2: a late GM-set DC takes the Rare/Uncommon raise; G3 the label
 *   C  R3: the Light trait's default step is a registered live emanation
 *   D  R4: inherited per-turn records are overwritten; the repair pass
 *   E  R6: a combat's end clears the attack count and the trait record
 *   F  R5: dice splash (Shard Bomb); a flask with no splash says so
 *   G  R7/R8: the cosmetic points G1, G2, G4, G5, G6
 *   H  the version
 */

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

globalThis.foundry ??= { applications: { api: { DialogV2: class {}, ApplicationV2: class {}, HandlebarsApplicationMixin: (c) => c } }, utils: {} };

const STI = await import("../module/magic/spell-trait-immunity.mjs");
const TR = await import("../module/trait-rules.mjs");
const EM = await import("../module/magic/emanation.mjs");
const AS = await import("../module/magic/active-spells.mjs");
const TRec = await import("../module/combat/turn-records.mjs");
const SPL = await import("../module/magic/splash.mjs");
const CR = await import("../module/conditions/condition-rules.mjs");

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const ACTION = strip(read("module", "combat", "action-workflow.mjs"));
const CARD = strip(read("module", "dice", "check-card-interactions.mjs"));
const TWS = strip(read("module", "traits-workflow.mjs"));
const COMBAT = strip(read("module", "documents", "combat.mjs"));
const MIGRATION = strip(read("module", "migration.mjs"));
const MAIN = strip(read("scripts", "trg-prime.mjs"));
const BOMB = strip(read("module", "alchemical-workflow.mjs"));
const EFFECTS = strip(read("module", "magic", "spell-effects.mjs"));
const EVENTS = strip(read("module", "conditions", "condition-events-workflow.mjs"));
const CHECK = strip(read("module", "dice", "check.mjs"));

/* A — R1, trait immunity on the spell path */
{
  const mindless = { name: "Husk", system: { details: { traits: "Mindless" } } };
  const plain = { name: "Foe", system: { details: { traits: "" } } };
  const fear = STI.partitionTraitImmune([mindless, plain], "Enchantment, Fear");
  ok("A1 Fear (Fear → Emotion → Mental) passes a Mindless creature by, and nobody else",
    fear.kept.length === 1 && fear.kept[0] === plain && fear.skipped.length === 1
    && fear.skipped[0].trait === "mental" && fear.skipped[0].reason === "Husk is immune to the mental trait", JSON.stringify(fear.skipped));
  ok("A2 Command (Mental) is turned too, and an untraited spell is not",
    STI.partitionTraitImmune([mindless], "Enchantment, Linguistic, Mental").skipped.length === 1
    && STI.partitionTraitImmune([mindless], "Evocation, Fire").skipped.length === 0
    && STI.partitionTraitImmune([mindless], "Emotion").skipped[0]?.trait === "mental");
  ok("A3 the typed immunities field is the same rule's (a construct and Essence; a GM's own)",
    STI.partitionTraitImmune([{ name: "Golem", system: { details: { traits: "Construct" } } }], "Essence, Soul").skipped[0]?.trait === "essence"
    && STI.partitionTraitImmune([{ name: "Wight", system: { combat: { immunities: "poison" }, details: {} } }], "Poison").skipped[0]?.trait === "poison");
  ok("A4 a targeted spell prunes the immune and refuses a cast with nobody left, before anything is spent",
    /if \(!isAreaSpell\(spellData\) && spellNeedsTarget\(spellData\) && !storingNow\) \{/.test(CAST)
    && /const immunity = partitionTraitImmune\(targeted\.map\(\(t\) => t\.actor\), spellData\.traits \?\? "", ownedCreatureTypeSystem\);/.test(CAST)
    && /if \(!immunity\.kept\.length\) \{[\s\S]{0,160}return null;/.test(CAST)
    && /if \(!immunity\.kept\.includes\(token\.actor\)\) token\.setTarget\(false/.test(CAST)
    && /kindSkipped = \[\.\.\.kindSkipped, \.\.\.immunity\.skipped\];/.test(CAST));
  ok("A5 and it is asked after the kind gate and before the PP is reckoned",
    CAST.indexOf("const immunity = partitionTraitImmune(") > CAST.indexOf("const gate = applyKindGate(actor, spell, spellData);")
    && CAST.indexOf("const immunity = partitionTraitImmune(") < CAST.indexOf("const basePP = isInnate ? 0"));
  ok("A6 an area meets it against what its template caught, named on the card",
    /const areaImmunity = partitionTraitImmune\(areaTargets, spellData\.traits \?\? "", ownedCreatureTypeSystem\);\s*areaTargets = areaImmunity\.kept;/.test(CAST)
    && /kindSkippedText\(\[\.\.\.kindFiltered\.skipped, \.\.\.areaImmunity\.skipped\]\)/.test(CAST));
}

/* B — R2, a late DC; G3 the label */
{
  const late = TR.lateSetDC(20, { value: 5, name: "the Basilisk" });
  ok("B1 a Rare target's late DC is raised and said", late.dc === 25 && late.note === "(+5: the Basilisk is Rare)", JSON.stringify(late));
  ok("B2 Uncommon +2; no raise, no note",
    TR.lateSetDC(15, { value: 2, name: "X" }).dc === 17 && /Uncommon/.test(TR.lateSetDC(15, { value: 2, name: "X" }).note)
    && TR.lateSetDC(15, null).dc === 15 && TR.lateSetDC(15, null).note === "" && TR.rarityRaiseNote("X", 0) === "");
  ok("B3 the roll stores the raise only when no DC was settled",
    /const lateRarityRaise = targetActor && \(finalDC === null \|\| finalDC === undefined\)\s*\? rarityRaiseForAction\(action\.key, creatureTraits\(targetActor\.system \?\? \{\}\)\)/.test(ACTION)
    && /if \(lateRarityRaise\) pendingOutcome\.rarityRaise = \{ value: lateRarityRaise, name: targetActor\.name \};/.test(ACTION));
  ok("B4 Set DC adds it, and the subtitle does not stack on a corrected DC",
    /const late = lateSetDC\(parsed, raw\.pendingOutcome\?\.rarityRaise \?\? null\);\s*raw\.baseDC = late\.dc;/.test(CARD)
    && /raw\.subtitleBeforeDC = raw\.subtitleBeforeDC \?\? raw\.subtitle \?\? "";/.test(CARD)
    && CARD.indexOf("raw.baseDC = late.dc;") < CARD.indexOf("const pending = raw.pendingOutcome;"));
  ok("B5 G3 — a DC the GM typed is named as a DC, not \"No target DC\"",
    /const baseLabel = resolved\.missingTarget \|\| \/\^no target\/i\.test\(String\(resolved\.label \?\? ""\)\)\s*\? `DC \$\{finalDC\}` : \(resolved\.label \?\? "DC"\);/.test(ACTION)
    && /resolved\.label = `\$\{baseLabel\} \$\{rarityRaiseNote\(targetActor\.name, rarityRaise\)\}`;/.test(ACTION));
}

/* C — R3, the Light trait's step is registered */
{
  const fairy = { traits: "Evocation, Light", duration: "10 minutes", area: "10-foot burst", effects: [{ kind: "note" }] };
  const row = TR.lightTraitDefaultRow(fairy, "Fairy Fire");
  ok("C1 THE OLD DEFECT, measured: asked of the printed rows, Fairy Fire registers nothing",
    !EM.emanationIsLive(fairy) && !AS.castWillRegister({ durationText: "10 minutes", emanationLive: false }));
  ok("C2 with its default row it is a live emanation, and registers",
    Boolean(row) && EM.emanationIsLive({ ...fairy, effects: [...fairy.effects, row] })
    && AS.castWillRegister({ durationText: "10 minutes", emanationLive: true }));
  ok("C3 the registration gate asks about the default row",
    /emanationLive: emanationIsLive\(spellData\)\s*\|\| Boolean\(outcome\.cast && \(await import\("\.\.\/trait-rules\.mjs"\)\)\.lightTraitDefaultRow\(spellData, spell\.name\)\),/.test(CAST));
  ok("C4 and the Region clean-up still reads the printed rows (the template is not the light's circle)",
    /if \(shouldClearAreaRegion\(placedArea\?\.regionId, \{ effects: effEffects \}, emanationIsLive\(spellData\), castRefunded\)\) \{/.test(CAST));
}

/* D — R4, inherited records */
{
  // An unlinked token: its own delta over its base actor's flags. Deleting
  // from the delta lets the base show through, as Foundry's ActorDelta does.
  const synthetic = (baseFlags, deltaFlags = {}) => {
    const delta = { ...deltaFlags };
    let writes = 0;
    return {
      uuid: Math.random().toString(36),
      name: "Token",
      get writes() { return writes; },
      getFlag: (_s, k) => (Object.prototype.hasOwnProperty.call(delta, k) ? delta[k] : baseFlags[k]),
      unsetFlag: async (_s, k) => { writes += 1; delete delta[k]; },
      setFlag: async (_s, k, v) => { writes += 1; delta[k] = v; }
    };
  };
  ok("D1 a record is clear only when every count is zero",
    TRec.traitUsageIsClear(undefined) && TRec.traitUsageIsClear({ actions: 0, word: 0, wordPenalty: false })
    && !TRec.traitUsageIsClear({ actions: 50 }) && !TRec.traitUsageIsClear({ wordPenalty: true })
    && TRec.attackCountIsClear(0) && TRec.attackCountIsClear(undefined) && !TRec.attackCountIsClear(2));
  const inherited = synthetic({ traitUsage: { actions: 50, word: 0 }, attackCount: 3 });
  await TRec.clearTraitUsageRecord(inherited);
  await TRec.clearAttackCount(inherited);
  ok("D2 THE OLD DEFECT, cured: an inherited record is overwritten, not left showing",
    TRec.traitUsageIsClear(inherited.getFlag("trg-prime", "traitUsage"))
    && TRec.attackCountIsClear(inherited.getFlag("trg-prime", "attackCount")));
  const own = synthetic({}, { traitUsage: { actions: 2 } });
  await TRec.clearTraitUsageRecord(own);
  const clean = synthetic({});
  await TRec.clearTraitUsageRecord(clean);
  await TRec.clearAttackCount(clean);
  ok("D3 its own record is simply deleted, and a clear one costs no write",
    own.getFlag("trg-prime", "traitUsage") === undefined && own.writes === 1 && clean.writes === 0);
  ok("D4 the turn start uses both",
    /const \{ clearTraitUsageRecord \} = await import\("\.\/combat\/turn-records\.mjs"\);\s*await clearTraitUsageRecord\(actor\);/.test(TWS)
    && /const \{ clearAttackCount \} = await import\("\.\.\/combat\/turn-records\.mjs"\);\s*await clearAttackCount\(actor\);/.test(COMBAT)
    && !/await actor\.unsetFlag\(SYSTEM_ID, "attackCount"\);/.test(COMBAT));
  // "3.622.1 OR LATER" SINCE 3.624.0, whose own pass raised the schema again.
  const schema = /export const TRG_SCHEMA_VERSION = "([\d.]+)";/.exec(MIGRATION)?.[1] ?? "0";
  ok("D5 the repair pass is registered at the schema it raises",
    schema.localeCompare("3.622.1", undefined, { numeric: true }) >= 0
    && /runIf\("3\.622\.1", "stale per-turn trait records and attack counts",\s*\(\) => migrateStaleTurnRecords\(actors, tokenActors\)\)/.test(MIGRATION)
    && /result\.staleTurnRecords\?\.length/.test(MIGRATION));
  const M = await import("../module/migration.mjs");
  const stale = synthetic({ traitUsage: { actions: 10, attack: 10 } });
  stale.name = "Luicen";
  const fighting = synthetic({ attackCount: 2 });
  fighting.name = "Mid-fight";
  const fresh = synthetic({});
  fresh.name = "Fresh";
  globalThis.game = { combats: [{ started: true, combatants: [{ actor: fighting }] }] };
  const cleared = await M.migrateStaleTurnRecords([stale, fresh], [fighting]);
  ok("D6 the repair clears stale records, leaves a running fight's alone, and is idempotent",
    cleared.length === 1 && cleared[0] === "Luicen" && TRec.traitUsageIsClear(stale.getFlag("trg-prime", "traitUsage"))
    && fighting.getFlag("trg-prime", "attackCount") === 2
    && (await M.migrateStaleTurnRecords([stale, fresh], [])).length === 0, JSON.stringify(cleared));
}

/* E — R6, the end of a combat */
{
  const handlers = {};
  globalThis.Hooks = { on: (name, fn) => { handlers[name] = fn; } };
  TRec.registerTurnRecordHooks();
  const mk = (name, flags) => {
    const f = { ...flags };
    return { uuid: name, name, getFlag: (_s, k) => f[k], unsetFlag: async (_s, k) => { delete f[k]; }, setFlag: async (_s, k, v) => { f[k] = v; } };
  };
  const w = mk("W", { attackCount: 2, traitUsage: { actions: 3, wordPenalty: true } });
  let unsets = 0;
  const unset = w.unsetFlag;
  w.unsetFlag = async (...a) => { unsets += 1; return unset(...a); };
  const combat = { combatants: [{ actor: w }, { actor: w }, { actor: null }] };
  globalThis.game = { user: { isGM: false } };
  await handlers.deleteCombat?.(combat);
  const untouchedByPlayer = w.getFlag("trg-prime", "attackCount") === 2;
  globalThis.game = { user: { isGM: true } };
  await handlers.deleteCombat?.(combat);
  ok("E1 a combat's creatures are cleared once each, and a vanished token is passed over", unsets === 2, `unsets ${unsets}`);
  ok("E2 THE OLD DEFECT, cured: the GM's client clears the attack count and the trait record when the combat ends",
    typeof handlers.deleteCombat === "function" && untouchedByPlayer
    && TRec.attackCountIsClear(w.getFlag("trg-prime", "attackCount")) && TRec.traitUsageIsClear(w.getFlag("trg-prime", "traitUsage")));
  ok("E3 the hook is registered at start-up",
    /import \{ registerTurnRecordHooks \} from "\.\.\/module\/combat\/turn-records\.mjs";/.test(MAIN) && /registerTurnRecordHooks\(\);/.test(MAIN));
}

/* F — R5, splash */
{
  ok("F1 a dice splash is recognised; a number and prose are not",
    SPL.splashIsDice("1d4") && SPL.splashIsDice("1d4+1") && SPL.splashIsDice("d6")
    && !SPL.splashIsDice("2") && !SPL.splashIsDice("0") && !SPL.splashIsDice("") && !SPL.splashIsDice("1d4 splash"));
  ok("F2 THE OLD DEFECT: the printed field read as a number has no splash",
    !SPL.hasSplash("1d4") && SPL.hasSplash(3));
  ok("F3 a bomb rolls its dice splash once, after the AP is spent",
    /let splash = profile\.splash;[\s\S]{0,80}if \(splashIsDice\(profile\.splash\)\) \{\s*const rolledSplash = await new Roll\(String\(profile\.splash\)\)\.evaluate\(\);\s*splash = Math\.max\(0, Math\.trunc\(Number\(rolledSplash\.total\) \|\| 0\)\);/.test(BOMB)
    && BOMB.indexOf("let splash = profile.splash;") > BOMB.indexOf("await spendActionPoints(actor, String(BOMB_STRIKE_AP)"));
  ok("F4 and every reader takes the rolled number: the target's share, the scatter, the splash line",
    /const splashOnTarget = splashOnHit\(splashAmount\(splash\), critical\?\.severity \?\? null\);/.test(BOMB)
    && /\} else if \(hasSplash\(splash\) && distance !== null\) \{/.test(BOMB)
    && /if \(hasSplash\(splash\) && reaches\) \{/.test(BOMB)
    && !/(hasSplash|splashAmount)\(profile\.splash\)/.test(BOMB));
  ok("F5 a flask with no splash says so on a miss",
    /A miss — the flask breaks off target\. \$\{item\.name\} has no splash\./.test(BOMB)
    && !/the flask still breaks, and the splash still lands/.test(BOMB));
}

/* G — the cosmetic points */
{
  ok("G1 natural armour is an increase in words, not \"status bonus to naturalArmourFlat\"",
    /if \(effect\.slot === "naturalArmourFlat" \|\| effect\.slot === "naturalArmourBase"\) \{/.test(EFFECTS)
    && /"increase"\} to natural armour DR`/.test(EFFECTS));
  ok("G2 \"an Auditory action\"",
    /flat check for \$\{\/\^\[aeiou\]\/i\.test\(String\(spec\.trait\)\) \? "an" : "a"\} \$\{spec\.trait\} action\./.test(EVENTS));
  const fumbled = CR.senseFumbleOutcome({ total: 19, dc: 12, margin: 7, degree: { key: "success" } }, "blinded");
  const already = CR.senseFumbleOutcome({ total: -3, dc: 12, margin: -15, degree: { key: "fumble" } }, "blinded");
  ok("G4 a sense fumble's margin agrees with its degree",
    fumbled.degree?.key === "fumble" && fumbled.margin === -10 && fumbled.total === 2 && fumbled.autoFailed?.condition === "blinded"
    && already.margin === -15 && already.autoFailed?.by === 15
    && /return senseFumbleOutcome\(outcome, this\.senseFumble\);/.test(CHECK), JSON.stringify(fumbled));
  ok("G5 a Secret spell's Result card is whispered to the GM, and the table told only that it was cast",
    /if \(secretRollMode\(spellData\)\) \{\s*const gms = ChatMessage\.getWhisperRecipients\?\.\("GM"\)\?\.map\(\(u\) => u\.id\) \?\? \[\];\s*await postCard\(actor, `\$\{spell\.name\} — Result`, lines, cardRolls, \{ whisper: gms \}\);/.test(CAST)
    && /async function postCard\(actor, title, lines, rolls = \[\], extra = \{\}\) \{/.test(CAST) && /\.\.\.extra\n/.test(CAST));
  ok("G6 R7 — the underwater Electricity card says to apply it by hand",
    /Apply by hand: the spell below resolves as it was aimed\./.test(CAST));
}

/* H — the version */
{
  const sys = JSON.parse(read("system.json"));
  ok("H1 the version is 3.622.1 or later, and the schema no newer",
    String(sys.version).localeCompare("3.622.1", undefined, { numeric: true }) >= 0
    && "3.622.1".localeCompare(sys.version, undefined, { numeric: true }) <= 0);
}

if (failures.length) {
  console.log(`verify-drive-3622: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-drive-3622: OK — ${checks} checks. Spells meet trait immunity; a late DC takes rarity; the Light step registers; inherited turn records clear and are repaired; a combat's end clears them; dice splash; the cosmetic points.`);
