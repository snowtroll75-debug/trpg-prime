#!/usr/bin/env node
/**
 * verify-block36b — block 36 (pages 361–370), part two: 3.616.0.
 *
 * NEW at 3.616.0. The audit is claude/audit-pages-361-370.md; Graham ruled
 * R1–R20 on 2 October 2026, and on 3 October that staves and wands are held
 * in one hand. This pair covers what 3.615.0 left for this release:
 *
 *   A  the 3.615.0 drive: F1 the double delete, F2 the charged item that
 *      paid for nothing, G1 the Indestructible card, O1 one hand
 *   B  Arrow Catching's diversion and concealment (R6, B3)
 *   C  Reflecting (R7)
 *   D  Air Drake Armour's Fly and its rest (R11)
 *   E  the rods: metamagic (R12), PP (R13), Accuracy and Alertness (R14)
 *   F  the weapon forms (R15)
 *   G  Charge Depletion (R16)
 *   H  Other Charged Items (B13)
 *   I  the packs, the repairs and the version
 */

import fs from "node:fs";
import path from "node:path";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import {
  ARROW_CATCHING_FEET, arrowCatchingActive, divertingCatcher, ignoresConcealmentOf, diversionLine
} from "../module/arrow-catching.mjs";
import { reflectionAvailable, reflectionSpendUpdates } from "../module/rune-events.mjs";
import { grantCooldownSpec, grantCooldownUntil, runeCooldownLeft, GRANT_COOLDOWN_KEY } from "../module/rune-timers.mjs";
import {
  metamagicRodsOf, metamagicRodApplies, ppSourceRodFor, rodDrawSplit, accuracyRodOf, accuracyRow,
  advantageRodFor, rodPaysLine
} from "../module/rod-powers.mjs";
import { buildMetamagicOptions, aggregateMetamagicSelection } from "../module/magic/metamagic.mjs";
import {
  weaponFormGrants, reconcileWeaponForms, weaponFormSignature, weaponFormName, weaponFormSystem, WEAPON_FORM_FLAG
} from "../module/charged-weapon-forms.mjs";
import { itemRequiredHands } from "../module/held-items.mjs";
import { shouldOfferCustomisation } from "../module/customise-on-add.mjs";
import {
  ITEM_DEPLETION_TABLE, itemDepletionResult, depletionExplosion, depletionRefill, chargedItemBroken, UNTRACKED_BROKEN_HP
} from "../module/magic-items.mjs";
import { levelDC } from "../module/dice/resolution.mjs";
import { resonanceModifierTotal } from "../module/magic/casting.mjs";
import { buildCharged, otherChargedFigures } from "../module/magic-item-builder.mjs";
import { chargedItemLevel, chargedItemPrice } from "../module/charged-items.mjs";
import { spellEffectRunesOf } from "../module/rune-spell-effect.mjs";
import { spellEffectGrants } from "../module/rune-spell-workflow.mjs";
import { TRG_SCHEMA_VERSION } from "../module/migration.mjs";
import { PACK_REPAIRS } from "../module/data/pack-repairs.mjs";

let checks = 0;
const failures = [];
function ok(label, condition, detail = "") {
  checks += 1;
  if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
}
const read = (...p) => fs.readFileSync(path.join(SYSTEM_ROOT, ...p), "utf8");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const body = (src, head) => {
  const at = src.indexOf(head);
  return at === -1 ? "" : src.slice(at, src.indexOf("\n}", at));
};
const EXPIRY = strip(read("module", "combat", "effect-application-workflow.mjs"));
const CHARGEDF = strip(read("module", "charged-items-workflow.mjs"));
const ATTACK = strip(read("module", "combat", "attack-workflow.mjs"));
const TARGETING = strip(read("module", "combat", "targeting.mjs"));
const CAST = strip(read("module", "magic", "cast-workflow.mjs"));
const TURNING = strip(read("module", "magic", "spell-turning-workflow.mjs"));
const RAW = strip(read("module", "rune-actions-workflow.mjs"));
const CHECK = strip(read("module", "dice", "check.mjs"));
const DEPLETE = strip(read("module", "magic-items-workflow.mjs"));
const FORMSF = strip(read("module", "charged-weapon-forms-workflow.mjs"));
const BUILDERF = strip(read("module", "magic-item-builder-workflow.mjs"));
const BOOT = read("scripts", "trg-prime.mjs");

async function packRows(pack) {
  const db = new ClassicLevel(path.join(SYSTEM_ROOT, "packs", pack), { valueEncoding: "json" });
  await db.open({ readOnly: true });
  const rows = new Map();
  for await (const [key, value] of db.iterator()) if (key.startsWith("!items!")) rows.set(value.name, value);
  await db.close();
  return rows;
}

/* ================================================================== *
 * A. The 3.615.0 drive
 * ================================================================== */
{
  // F1 — both sweeps reach one effect at once; it is deleted once, said once.
  const { expireSpellEffects, expireTimedConditions } =
    await import(path.join(SYSTEM_ROOT, "module", "combat", "effect-application-workflow.mjs"));
  const state = { effects: [], deletes: 0, errors: 0 };
  const effect = {
    id: "eff-both", uuid: "Actor.a.ActiveEffect.eff-both", name: "Both Clocks",
    statuses: undefined,
    flags: { "trg-prime": { spellEffect: true, spellEffectEnd: 100, conditionExpiresRound: 5 } },
    getFlag(_s, k) { return this.flags["trg-prime"][k]; },
    async delete() {
      state.deletes += 1;
      await new Promise((r) => setTimeout(r, 5));
      if (!state.effects.includes(this)) { state.errors += 1; throw new Error(`ActiveEffect "${this.id}" does not exist!`); }
      state.effects = state.effects.filter((e) => e !== this);
    }
  };
  state.effects = [effect];
  const actor = {
    name: "Stand-in", uuid: "Actor.a",
    get effects() { const l = state.effects; l.get = (id) => l.find((e) => e.id === id); return l; },
    get items() { return []; },
    async deleteEmbeddedDocuments() { return []; }
  };
  let threw = null;
  let said = [];
  try {
    said = (await Promise.all([expireSpellEffects(actor, 100), expireTimedConditions(actor, 5)])).flat();
  } catch (err) { threw = err; }
  ok("A1 F1 — an effect due on both clocks is deleted once", state.deletes === 1 && state.effects.length === 0,
    `${state.deletes} deletes, ${state.effects.length} left`);
  ok("A1b and nothing is raised at the GM", !threw && state.errors === 0, String(threw?.message ?? ""));
  ok("A1c and it is named once", said.filter((s) => /Both Clocks/.test(String(s))).length === 1, JSON.stringify(said));
  ok("A1d a delete that loses the race is not an error",
    EXPIRY.includes("if (!/does not exist/i.test(String(err?.message ?? err))) throw err;"));

  // F2 — nothing cast, nothing paid.
  const cast = body(CHARGEDF, "export async function castFromChargedItem(");
  ok("A2 F2 — a release that held but cast nothing gives the PP back",
    cast.includes("if (!castResult) {") && cast.includes('await item.update({ "system.uses": remaining });'));
  ok("A2b and the depletion roll waits for the spell",
    cast.includes("if (after < 0 && !releaseHeld) await rollItemDepletion(actor, item);")
    && cast.indexOf("if (!castResult) {") < cast.lastIndexOf("if (after < 0) await rollItemDepletion(actor, item);"));

  // G1 — the armour clause's suffix goes when the rune negates the injury.
  const piece = ATTACK.indexOf("const indestructiblePiece = targetActor && criticalAmendmentApplies(row, targetArmour)");
  const clause = ATTACK.indexOf("const armourClause = selectArmourClause(row, targetArmour);");
  ok("A3 G1 — Indestructible is known before the armour clause is written", piece > -1 && clause > piece);
  ok("A3b and the clause drops \"The armour also takes damage\"",
    ATTACK.includes('+ (armourClause.kind === "unarmoured" || indestructiblePiece ? "" : " The armour also takes damage (Chapter 6).")'));

  // O1 — one hand.
  const charged = await packRows("charged-items");
  const hands = Array.from(charged.values()).filter((i) => Number(i.system?.heldHands) !== 1).map((i) => i.name);
  ok("A4 O1 — every rod, staff and wand is held in one hand", charged.size === 25 && hands.length === 0, hands.join(", "));
  ok("A4b and a gear staff at 1 takes one hand", itemRequiredHands({ type: "gear", system: { heldHands: 1 } }, "medium") === 1);
  ok("A4c and the builder makes a staff one-handed", BUILDERF.includes("heldHands: 1\n") && !BUILDERF.includes('result.kind === "staff" ? 2 : 1'));
  const handRepairs = PACK_REPAIRS.filter((r) => r.field === "heldHands" && r.pack === "charged-items");
  ok("A4d and owned copies at 0 are repaired, one entry per item",
    handRepairs.length === 25 && handRepairs.every((r) => r.from === 0 && r.to === 1 && r.since === "3.616.0")
    && new Set(handRepairs.map((r) => r.name)).size === 25);
}

/* ================================================================== *
 * B. Arrow Catching (R6, B3)
 * ================================================================== */
{
  const on = { missileDefence: 1 };
  ok("B1 the rune is active only while its +1 is", arrowCatchingActive(on) && !arrowCatchingActive({ missileDefence: 0 }));
  const near = { id: "w", active: true, distanceToTarget: 5, cover: "" };
  const far = { id: "f", active: true, distanceToTarget: 10, cover: "" };
  ok("B2 R6 — a missile aimed within 5 ft of an active wearer goes to the wearer",
    ARROW_CATCHING_FEET === 5 && divertingCatcher([near, far], { attackerId: "a", targetId: "t", ranged: true })?.id === "w");
  ok("B2b but not one aimed further away", divertingCatcher([far], { attackerId: "a", targetId: "t", ranged: true }) === null);
  ok("B2c nor a melee blow", divertingCatcher([near], { attackerId: "a", targetId: "t", ranged: false }) === null);
  ok("B2d nor from a wearer in greater cover",
    divertingCatcher([{ ...near, cover: "greater" }], { attackerId: "a", targetId: "t", ranged: true }) === null
    && divertingCatcher([{ ...near, cover: "standard" }], { attackerId: "a", targetId: "t", ranged: true })?.id === "w");
  ok("B2e nor from a wearer whose rune is off", divertingCatcher([{ ...near, active: false }], { ranged: true, targetId: "t" }) === null);
  ok("B2f nor to the attacker or the target themselves",
    divertingCatcher([{ ...near, id: "a" }, { ...near, id: "t" }], { attackerId: "a", targetId: "t", ranged: true }) === null);
  ok("B2g two wearers: the nearer catches it",
    divertingCatcher([{ ...near, id: "x", distanceToTarget: 5 }, { ...near, id: "y", distanceToTarget: 0 }], { targetId: "t", ranged: true })?.id === "y");
  ok("B3 B3 — a ranged attacker ignores an active wearer's concealment",
    ignoresConcealmentOf(on, { ranged: true }) && !ignoresConcealmentOf(on, { ranged: false }) && !ignoresConcealmentOf({ missileDefence: 0 }, { ranged: true }));
  ok("B3b the card names both creatures", /Arrow Catching rune draws the shot/.test(diversionLine({ toName: "W", fromName: "T" })));
  const ranged = ATTACK.indexOf("const isRanged = inherentRanged || thrownByDistance;");
  const divert = ATTACK.indexOf("const catcher = divertingCatcher(candidates, { attackerId: attackerToken?.id ?? \"\", targetId: targetToken.id, ranged: true });");
  const avoid = ATTACK.indexOf("const avoidance = await missChanceAvoidance(targetActor, {");
  ok("B4 the diversion is asked once the attack is known to be ranged, before anything reads the target",
    ranged > -1 && divert > ranged && avoid > divert);
  ok("B4b and it moves the target, the actor and the distance",
    ATTACK.includes("targetToken = catcher.token;") && ATTACK.includes("targetActor = catcher.token.actor;")
    && ATTACK.includes("if (positional) distanceToTarget = distanceBetween(attackerToken, targetToken);"));
  ok("B4c the candidates are read through the +1's own sum, and their Take Cover",
    ATTACK.includes("active: arrowCatchingActive(runeBonusesForActor(Array.from(t.actor.items ?? [])))")
    && ATTACK.includes("cover: takeCoverLevelOf(c.token.actor)"));
  ok("B5 the avoidance check is told to ignore concealment",
    ATTACK.includes("ignoreConcealed: ignoresConcealmentOf(runeBonusesForActor(Array.from(targetActor.items ?? [])), { ranged: isRanged })")
    && TARGETING.includes("const concealed = !ignoreConcealed && ("));
  ok("B5b and the diversion is on the card", ATTACK.includes("if (diversionNote) lines.push(line(diversionNote));"));
}

/* ================================================================== *
 * C. Reflecting (R7)
 * ================================================================== */
{
  const rune = { label: "Reflecting II", allowances: [{ uses: 1, maxPP: 18 }, { uses: 3, maxPP: 14 }] };
  const spent = { pp14: 1, reflecting: 1 };
  const u = reflectionSpendUpdates(spent, 14);
  ok("C1 a reflection spends its allowance and the rune's own count", u.pp14 === 2 && u.reflecting === 2);
  ok("C1b the allowance still chooses the tightest fit", reflectionAvailable(rune, 10, {}).maxPP === 14 && reflectionAvailable(rune, 16, {}).maxPP === 18);
  ok("C2 the sheet button reaches it", RAW.includes('if (key === "reflecting") return useReflecting(actor, item, { key, label: "Reflecting" });'));
  ok("C2b and the sheet button writes both counts",
    body(RAW, "async function useReflecting(").includes("reflectionSpendUpdates(spent, check.maxPP)"));
  const offer = body(TURNING, "export async function offerReflecting(");
  ok("C3 R7 — offered to a targeted wielder with an allowance, as a reaction",
    offer.includes('equippedEventRune(Array.from(holder.items ?? []).filter((i) => i.type === "shield"), "reflecting")')
    && offer.includes("reflectionAvailable(rune, spellPP, spent)") && offer.includes("await spendReaction(holder, rune.label);"));
  ok("C3b no check: the rune turns it", !offer.includes("TRGCheck"));
  ok("C3c and the caster takes the wielder's place",
    offer.includes("token.setTarget?.(false, { releaseOthers: false, groupSelection: true });")
    && offer.includes("casterToken?.setTarget?.(true, { releaseOthers: false, groupSelection: true });"));
  ok("C3d a wielder with no reaction left is told, not asked",
    offer.includes("if (actorInCombat(holder) && Number(holder.system?.resources?.reactions?.value ?? 0) < 1) {"));
  const at = CAST.indexOf("const reflected = await offerReflecting(actor, spell, { spellPP: reflectPP });");
  const block = CAST.slice(Math.max(0, at - 700), at);
  ok("C4 the cast offers it, item casts too", at > -1 && block.includes("if (outcome.cast) {") && !/if \(outcome\.cast && !isItemCast\) \{\s*const \{ castCanBeTurned \} = await import\("\.\/spell-turning\.mjs"\);\s*if \(castCanBeTurned\(spellData\)\) \{\s*const \{ offerReflecting/.test(CAST));
  ok("C4b at the spell's own PP, which an item cast does not pay",
    CAST.includes("? Math.max(0, Number(itemCast.pp ?? spellData.ppCost ?? 0) || 0)"));
}

/* ================================================================== *
 * D. Air Drake Armour's Fly (R11)
 * ================================================================== */
{
  const armour = { flags: { "trg-prime": { specificItem: { activationAP: 1, cooldownSeconds: 600, effectSeconds: 60 } } } };
  const spec = grantCooldownSpec(armour);
  ok("D1 its rest is read off the item", spec?.cooldownSeconds === 600 && spec?.effectSeconds === 60 && grantCooldownSpec({}) === null);
  ok("D1b the minute, then the ten minutes", grantCooldownUntil(spec, 1000) === 1660);
  ok("D1c and the same clock the timed runes keep",
    runeCooldownLeft({ flags: { "trg-prime": { runeState: { cooldown: { [GRANT_COOLDOWN_KEY]: 1660 } } } } }, GRANT_COOLDOWN_KEY, 1600) === 60);
  const runes = spellEffectRunesOf({ type: "armour", system: { runes: "Potency II, Energy Resistance I (electricity), Spell Effect (Fly, At Will)" } });
  ok("D2 its Fly is a Spell Effect at will", runes.length === 1 && runes[0].spell === "Fly" && runes[0].frequency === "atWill");
  const grants = spellEffectGrants([{ id: "ad", name: "Air Drake Armour", type: "armour", system: { equipped: true, runes: "Potency II, Spell Effect (Fly, At Will)" }, flags: armour.flags }]);
  ok("D2b granted at the armour's Command (1 AP), unlimited", grants[0]?.castAP === 1 && grants[0]?.usesPerDay === "unlimited");
  const refuse = CAST.indexOf("const left = runeCooldownLeft(grantSource, GRANT_COOLDOWN_KEY, Number(game.time?.worldTime ?? 0));");
  const commit = CAST.indexOf("if (totalPP > ppPool + rodDraw) {");
  ok("D3 R11 — refused while it rests, before anything is spent", refuse > -1 && commit > refuse
    && /const left = runeCooldownLeft\(grantSource, GRANT_COOLDOWN_KEY, [^\n]*\n\s*if \(left > 0\) \{\n\s*ui\.notifications\.warn\([^\n]*\n\s*return null;/.test(CAST));
  ok("D3b and the rest starts when it is cast",
    CAST.includes("[`flags.${SYSTEM_ID}.runeState.cooldown.${GRANT_COOLDOWN_KEY}`]: grantCooldownUntil(grantRest, Number(game.time?.worldTime ?? 0))"));
}

/* ================================================================== *
 * E. The rods (R12–R14)
 * ================================================================== */
{
  const rod = (name, chargedItem, extra = {}) => ({
    id: name.toLowerCase().replace(/\W+/g, "-"), name, system: { equipped: true, uses: 10, hp: { max: 0, value: 0 }, ...extra },
    flags: { "trg-prime": { chargedItem } }
  });
  const ext1 = rod("Rod of Extension I", { metamagic: { kind: "extend", maxPP: 4, cost: 2 } });
  const quick = rod("Rod of Quickening I", { metamagic: { kind: "quicken", maxPP: 4, cost: 2 } });
  const rods = metamagicRodsOf([ext1, quick, rod("Stowed", { metamagic: { kind: "extend", maxPP: 12 } }, { equipped: false })]);
  ok("E1 the held metamagic rods, and only the held", rods.length === 2 && rods[0].kind === "extend" && rods[0].maxPP === 4);
  ok("E1b R12 — Extension reaches a spell of its PP or less, with a duration",
    metamagicRodApplies(rods[0], { basePP: 4, duration: "1 minute" }) && !metamagicRodApplies(rods[0], { basePP: 5, duration: "1 minute" })
    && !metamagicRodApplies(rods[0], { basePP: 2, duration: "" }));
  ok("E1c Quickening only a 2 AP spell — a 1 AP spell cannot be quickened",
    metamagicRodApplies(rods[1], { basePP: 4, castAP: 2 }) && !metamagicRodApplies(rods[1], { basePP: 4, castAP: 1 }));
  const options = buildMetamagicOptions({ rods, featNames: ["quicken spell"], spellData: { duration: "1 minute", castAP: 2 }, basePP: 4 });
  const rodExtend = options.find((o) => o.rodItemId === ext1.id);
  ok("E2 the rod's Extend is offered at no PP", rodExtend?.kind === "extend" && rodExtend.ppCost === 0);
  const agg = aggregateMetamagicSelection(options, { [`mm-${rodExtend.id}`]: true, [`mm-rod-${quick.id}`]: true, "mm-quicken": true });
  ok("E2b the rods pay, the caster does not", agg.extend && agg.ppSpent === 8
    && agg.rodSpends.length === 2 && agg.rodSpends.every((s) => s.pp === 2), JSON.stringify(agg));
  ok("E2c a feat's Quicken and a rod's are one Quicken", agg.apDelta === -1);
  ok("E2d the cast offers them", CAST.includes("rods: metamagicRodsOf(Array.from(actor.items ?? [])),"));
  ok("E2e and takes each rod's spend once the cast is settled",
    CAST.includes("for (const spend of mm.rodSpends ?? []) {") && CAST.includes("rodLines.push(await spendFromRod(actor, rodItem, spend.pp));"));

  const magi = rod("Rod of the Magi", { ppSource: { tradition: "arcane" } });
  const sceptre = rod("Sceptre of the Clergy", { ppSource: { tradition: "divinity" } });
  ok("E3 R13 — the Rod of the Magi lends to an arcane spell, the Sceptre to a divine one",
    ppSourceRodFor([magi, sceptre], "arcane")?.name === "Rod of the Magi"
    && ppSourceRodFor([magi, sceptre], "Divinity")?.name === "Sceptre of the Clergy"
    && ppSourceRodFor([magi], "verdant") === null);
  ok("E3b the rod pays what was drawn, up to the spend, the caster the rest",
    JSON.stringify(rodDrawSplit(6, 4)) === JSON.stringify({ rod: 4, caster: 2 })
    && JSON.stringify(rodDrawSplit(3, 4)) === JSON.stringify({ rod: 3, caster: 0 }));
  ok("E3c the pool test counts the draw", CAST.includes("if (totalPP > ppPool + rodDraw) {"));
  ok("E3d the caster is charged only their share",
    CAST.includes('"system.resources.pp.value": Math.max(0, ppPool - casterPPSpent)')
    && CAST.includes("rodPaid = rodDraw > 0 ? rodDrawSplit(ppSpent, rodDraw).rod : 0;"));
  ok("E3e nothing to draw for a spell nobody pays for",
    CAST.includes("const rodSource = (isCantrip || isInnate || isItemCast || stored || totalPP <= 0)"));

  const acc = accuracyRodOf([rod("Rod of Accuracy", { spellAttack: { maxPP: 2 } })]);
  ok("E4 R14 — the Rod of Accuracy buys +1 per PP, at most +2, as an item bonus",
    accuracyRow(acc, 1)?.value === 1 && accuracyRow(acc, 5)?.value === 2 && accuracyRow(acc, 2)?.type === "item" && accuracyRow(acc, 0) === null);
  ok("E4b to the attack comparison, through the stacking pool",
    CAST.includes("extraAttackRows: accuracyAttackRow ? [accuracyAttackRow] : []")
    && CAST.includes(".concat(Array.isArray(extraAttackRows) ? extraAttackRows : []), {});"));
  const alert = rod("Rod of Alertness", { checkAdvantage: { subjects: ["perception", "senseMotive"], cost: 2 } });
  ok("E5 R14 — the Rod of Alertness on Perception and Sense Motive only",
    advantageRodFor([alert], "perception")?.cost === 2 && advantageRodFor([alert], "senseMotive") && advantageRodFor([alert], "stealth") === null);
  ok("E5b offered before the dice, combined through resolveBias",
    CHECK.includes('if (check.actor && ["skill", "spellcraft"].includes(check.type) && !check.flat && !check.rodAdvantageResolved) {')
    && CHECK.indexOf("advantageRodFor(Array.from(check.actor.items ?? []), check.subject, rodCtx)") < CHECK.indexOf("await check.evaluate();"));
  ok("E6 a broken rod does nothing",
    metamagicRodsOf([rod("Rod of Extension I", { metamagic: { kind: "extend", maxPP: 4 } }, { hp: { max: 1, value: 0 } })]).length === 0);
  ok("E6b and an overspent rod says so", /overspent by 1/.test(rodPaysLine({ name: "R" }, 2, -1, 10)));
  ok("E6c and rolls Charge Depletion", body(CHARGEDF, "export async function spendFromRod(").includes("if (after < 0) await rollItemDepletion(actor, item);"));
}

/* ================================================================== *
 * F. The weapon forms (R15)
 * ================================================================== */
{
  const staff = (equipped, form = { base: "Staff", quality: "expert", material: "", runes: "Potency I" }) => ({
    id: "sf", name: "Staff of Fire", system: { equipped }, flags: { "trg-prime": { chargedItem: { weaponForm: form } } }
  });
  const grants = weaponFormGrants([staff(true)]);
  ok("F1 R15 — an equipped staff grants its weapon", grants.length === 1 && grants[0].base === "Staff" && weaponFormGrants([staff(false)]).length === 0);
  ok("F1b named for the staff, with its printed quality and rune",
    weaponFormName(grants[0]) === "Staff of Fire (Staff)" && weaponFormSystem(grants[0]).quality === "expert" && weaponFormSystem(grants[0]).runes === "Potency I");
  const sig = weaponFormSignature(grants[0]);
  ok("F2 kept while it matches, replaced when it changes, removed when unequipped",
    reconcileWeaponForms(grants, [{ id: "w1", signature: sig }]).create.length === 0
    && reconcileWeaponForms(weaponFormGrants([staff(true, { base: "Staff" })]), [{ id: "w1", signature: sig }]).remove[0] === "w1"
    && reconcileWeaponForms([], [{ id: "w1", signature: sig }]).remove[0] === "w1");
  const form = { type: "weapon", system: { size: "medium", traits: "Double, Hand & a Half" }, flags: { "trg-prime": { [WEAPON_FORM_FLAG]: { itemId: "sf" } } } };
  ok("F3 the form takes no hand of its own", itemRequiredHands(form, "medium") === 0);
  ok("F3b and opens no Customise", shouldOfferCustomisation({ ...form, parent: {} }, "u", { currentUserId: "u" }) === false);
  ok("F4 synced on every item change, from the weapons compendium",
    BOOT.includes("registerWeaponFormHooks();") && FORMSF.includes('const pack = contentPack("weapons");')
    && FORMSF.includes("sourceId: grant.itemId"));
}

/* ================================================================== *
 * G. Charge Depletion (R16)
 * ================================================================== */
{
  ok("G1 every row says what it does", ITEM_DEPLETION_TABLE.every((r) => r.kind)
    && itemDepletionResult(5).kind === "explode" && itemDepletionResult(20).kind === "crumble"
    && itemDepletionResult(50).kind === "break" && itemDepletionResult(66).kind === "resonance"
    && itemDepletionResult(95).kind === "recharge" && itemDepletionResult(100).kind === "rechargePlus");
  const boom = depletionExplosion(3, levelDC);
  ok("G2 01–10 — 10 ft and 1d4 force per level, against the level's DC",
    boom.radiusFeet === 30 && boom.formula === "3d4" && boom.damageType === "force" && boom.dc === levelDC(3));
  // 3.617.0: the burst is shared with the Pearl of Force — burst-workflow.mjs.
  const BURST = strip(read("module", "burst-workflow.mjs"));
  ok("G2b everyone in the burst saves, holder included",
    DEPLETE.includes("center: holder,") && DEPLETE.includes("radiusFeet: explosion.radiusFeet,")
    && BURST.includes("if (token.id === center.id || distanceBetween(center, token) <= radiusFeet) caught.push(token.actor);")
    && BURST.includes("const basic = basicSavingThrow(degree, check?.outcome?.margin ?? null);")
    && BURST.includes("await applyTypedDamage(victim, { amount: dealt, type: damageType })"));
  ok("G3 11–40 — the item is gone", DEPLETE.includes("if (crumbles || explosion) await item.delete();"));
  ok("G4 41–65 — an item with no hit points breaks too",
    UNTRACKED_BROKEN_HP.max === 1 && UNTRACKED_BROKEN_HP.value === 0 && chargedItemBroken({ system: { hp: UNTRACKED_BROKEN_HP } })
    && !chargedItemBroken({ system: { hp: { max: 0, value: 0 } } })
    && DEPLETE.includes('await item.update({ "system.hp.max": UNTRACKED_BROKEN_HP.max, "system.hp.value": UNTRACKED_BROKEN_HP.value });'));
  ok("G4b and a broken item casts nothing",
    body(CHARGEDF, "export async function castFromChargedItem(").includes("if (chargedItemBroken(item)) {"));
  ok("G5 66 — a Resonance Event at +20",
    resonanceModifierTotal({ extra: 20 }) === 20 && DEPLETE.includes("modifiers: { extra: 20 }"));
  ok("G6 91–99 refill; 100 refills and holds one more",
    JSON.stringify(depletionRefill("recharge", 10)) === JSON.stringify({ uses: 10, maximumPP: 10 })
    && JSON.stringify(depletionRefill("rechargePlus", 10)) === JSON.stringify({ uses: 11, maximumPP: 11 })
    && depletionRefill("depleted", 10) === null);
}

/* ================================================================== *
 * H. Other Charged Items (B13)
 * ================================================================== */
{
  const other = buildCharged("other", { spells: [{ name: "A", pp: 2 }, { name: "B", pp: 4 }] });
  ok("H1 B13 — each spell twice at base cost; the highest spell's PP + 1",
    other.maximumPP === 12 && other.level === 5 && JSON.stringify(otherChargedFigures([2, 4])) === JSON.stringify({ level: 5, maximumPP: 12 }));
  ok("H1b priced from the Staff/Other column", other.price === chargedItemPrice("staff", 5));
  ok("H1c and its level is read back the same way", chargedItemLevel({ kind: "other", spells: [{ pp: 2 }, { pp: 4 }] }) === 5);
  ok("H2 the builder offers it", BUILDERF.includes('<option value="other">'));
}

/* ================================================================== *
 * I. The packs, the repairs and the version
 * ================================================================== */
{
  const specific = await packRows("specific-items");
  const drake = specific.get("Air Drake Armour");
  ok("I1 R11 — Air Drake Armour carries its Fly and its rest",
    drake?.system?.runes === "Potency II, Energy Resistance I (electricity), Spell Effect (Fly, At Will)"
    && drake?.flags?.["trg-prime"]?.specificItem?.activationAP === 1
    && drake?.flags?.["trg-prime"]?.specificItem?.cooldownSeconds === 600);
  const entry = PACK_REPAIRS.find((r) => r.id === "air-drake-armour-runes-3615");
  ok("I1b and owned copies from 3.615.0 are repaired too",
    entry?.to === drake?.system?.runes && entry?.alsoFrom?.includes("Potency II, Energy Resistance I (electricity)"));
  const charged = await packRows("charged-items");
  const cf = (n) => charged.get(n)?.flags?.["trg-prime"]?.chargedItem ?? {};
  ok("I2 R12 — the metamagic rods",
    cf("Rod of Extension I").metamagic?.maxPP === 4 && cf("Rod of Extension II").metamagic?.maxPP === 8
    && cf("Rod of Extension III").metamagic?.maxPP === 12 && cf("Rod of Quickening I").metamagic?.kind === "quicken");
  ok("I3 R13 — the PP rods", cf("Rod of the Magi").ppSource?.tradition === "arcane" && cf("Sceptre of the Clergy").ppSource?.tradition === "divinity");
  ok("I4 R14 — Accuracy and Alertness", cf("Rod of Accuracy").spellAttack?.maxPP === 2
    && JSON.stringify(cf("Rod of Alertness").checkAdvantage?.subjects) === JSON.stringify(["perception", "senseMotive"]));
  const staves = Array.from(charged.values()).filter((i) => i.flags?.["trg-prime"]?.chargedItem?.kind === "staff");
  ok("I5 R15 — every staff is a staff, and the Sceptre a light mace",
    staves.length === 10 && staves.every((s) => s.flags["trg-prime"].chargedItem.weaponForm?.base === "Staff")
    && cf("Sceptre of the Clergy").weaponForm?.base === "Light Mace" && cf("Staff of Fire").weaponForm?.runes === "Potency I"
    && cf("Staff of Salinor Alshar").weaponForm?.material === "densewood");
  const runes = await packRows("runes");
  ok("I6 the rune notes say what now happens",
    /are drawn to the wearer/.test(runes.get("Arrow Catching (Armour)")?.system?.description ?? "")
    && /offered as a reaction/.test(runes.get("Reflecting I")?.system?.description ?? ""));
  const sys = JSON.parse(read("system.json"));
  const gate = /runIf\("(\d+\.\d+\.\d+)", "stale owned copies/.exec(read("module", "migration.mjs"))?.[1];
  const atLeast = (v) => { const [a, b] = String(v).split(".").map(Number); return a > 3 || (a === 3 && b >= 616); };
  ok("I7 the version and schema are 3.616 or later, and the gate is too",
    // THE SCHEMA MAY TRAIL THE VERSION (3.616.1): a point release that
    // changes no stored shape keeps the schema at its newest migration pass,
    // which verify-speed-pool F4 requires. It may never lead it.
    atLeast(sys.version) && atLeast(TRG_SCHEMA_VERSION) && TRG_SCHEMA_VERSION.localeCompare(sys.version, undefined, { numeric: true }) <= 0 && atLeast(gate));
}

if (failures.length) {
  console.log(`verify-block36b: ${checks} checks\n\n${failures.length} FAILED:`);
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
console.log(`verify-block36b: OK — ${checks} checks. The drive's four, the diversion, Reflecting, the Fly's rest, the rods, the staves as weapons, depletion and Other Charged Items.`);
