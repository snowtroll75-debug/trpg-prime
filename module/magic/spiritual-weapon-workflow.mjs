/**
 * The Foundry half of Spiritual Weapon (see spiritual-weapon.mjs).
 *
 * NEW at 3.608.0. TWO CALLERS, ONE STRIKE:
 *   - the spell applier, once, at the cast (`recordSpiritualWeapon`, then
 *     `spiritualStrike`)
 *   - the Sustain action, every time this casting is sustained
 *     (`strikeOnSustain`)
 *
 * THE RECORD RIDES AN ACTIVE EFFECT ON THE CASTER, stamped with the cast's
 * id, so the spell's lapse, a Dismiss and its minute all end the weapon by
 * the one route every other spell effect is ended by.
 */

import { attackCountOf, setAttackCount } from "../combat/turn-records.mjs";
import {
  SPIRITUAL_WEAPON_FLAG, spiritualDamageFormula, spiritualStrikeHeadline
} from "./spiritual-weapon.mjs";

const SYSTEM_ID = "trg-prime";
const line = (html) => `<p style="margin:2px 0">${html}</p>`;

/** The live force weapon for a cast, or null. */
function recordFor(actor, castId) {
  for (const effect of actor?.effects ?? []) {
    if (effect.disabled) continue;
    if (effect.getFlag?.(SYSTEM_ID, "castId") !== castId) continue;
    const record = effect.getFlag?.(SYSTEM_ID, SPIRITUAL_WEAPON_FLAG);
    if (record) return record;
  }
  return null;
}

/** The creature the weapon strikes: the first marked target that is not the caster. */
function markedTarget(caster) {
  return Array.from(game.user?.targets ?? [])
    .map((t) => t.actor ?? null)
    .find((a) => a && a !== caster) ?? null;
}

/**
 * One strike of the force weapon.
 *
 * @returns {Promise<{lines: string[], rolls: Roll[]}>}
 */
export async function spiritualStrike(caster, record, targetActor) {
  const lines = [];
  const rolls = [];
  if (!targetActor) {
    lines.push(line(`<em>${record.label}: no target marked — the weapon waits. Mark one and Sustain to strike.</em>`));
    return { lines, rolls };
  }
  lines.push(line(spiritualStrikeHeadline(record, caster.name, targetActor.name)));

  // AN ATTACK MEETS WHAT EVERY ATTACK MEETS: a ward, then concealment.
  const { sanctuaryCheck } = await import("../combat/sanctuary-gate.mjs");
  const ward = await sanctuaryCheck(caster, targetActor, record.label);
  if (ward.blocked) {
    lines.push(line(`<strong>${record.label} cannot be brought to bear on ${targetActor.name}</strong> — Sanctuary.`));
    return { lines, rolls };
  }
  // THE DEFENDER'S REACTION, BEFORE THE STRIKE IS ROLLED (3.666.1) — see
  // combat/defence-offer.mjs. The DB below is read after it.
  {
    const { offerDefences } = await import("../combat/defence-offer-workflow.mjs");
    await offerDefences(caster, targetActor, { kind: "spiritualWeapon", what: record.label });
  }
  const { missChanceAvoidance } = await import("../combat/targeting.mjs");
  const avoided = await missChanceAvoidance(targetActor, {
    attackerName: caster.name, sourceName: record.label, attackerActor: caster
  });
  if (avoided.avoided) {
    lines.push(line(`<strong>${record.label} doesn't reach ${targetActor.name}</strong> — ${avoided.condition}, `
      + `passed the DC ${avoided.dc} avoidance flat check.`));
    return { lines, rolls };
  }

  const { attackOutcome, mapPenalty } = await import("../combat/attack.mjs");
  const mapBefore = attackCountOf(caster);
  const map = mapPenalty(mapBefore);
  // THE DEFENDER'S DB ROWS (3.707.0; found wiring Stone Shield): a ward's
  // "+4 to DB against that enemy" and every other `defenceDC` row reached the
  // Strike, the bomb and the spell attack, and not this strike, which read
  // the sheet's DB alone. Asked as the spell attack asks them: the weapon is
  // the spell's, so a row "against spells" counts.
  const sheetDB = Number(targetActor.system?.combat?.defence?.total ?? NaN);
  let dbRows = { total: 0, entries: [] };
  {
    const { defenceDCBonus } = await import("../combat/defence-dc.mjs");
    const { alignedTraitsOf, creatureTypesOf } = await import("../aligned.mjs");
    const { creatureTraits } = await import("../creature-traits.mjs");
    dbRows = defenceDCBonus(targetActor, "defence", "", creatureTypesOf(caster.system ?? {}), caster?.uuid ?? "",
      alignedTraitsOf(caster.system ?? {}), creatureTraits(caster.system ?? {}), { attackKind: "spell" });
    const esc = (t) => globalThis.foundry?.utils?.escapeHTML?.(String(t)) ?? String(t);
    for (const entry of dbRows.entries ?? []) {
      const lost = dbRows.notCounted?.find((n) => n.entry === entry);
      lines.push(line(`<em>${targetActor.name}'s ${esc(entry.label)}: ${entry.value > 0 ? "+" : ""}${entry.value} DB${entry.scope ? ` (${esc(entry.scope)})` : ""}${lost ? ` — not counted: ${esc(lost.reason.toLowerCase())}` : ""}.</em>`));
    }
  }
  const db = Number.isFinite(sheetDB) ? sheetDB + Number(dbRows.total ?? 0) : NaN;
  const { TRGCheck } = await import("../dice/check.mjs");
  // AN ATTACK LIKE ANY OTHER (3.622.0; block 39's A12 and R7): the Word
  // aftermath, and the target's conditions.
  const { wordAftermathModifier } = await import("../traits-workflow.mjs");
  const wordPenalty = wordAftermathModifier(caster);
  const { attackTermsAgainst, distanceBetweenActors } = await import("../conditions/condition-events-workflow.mjs");
  const weaponTerms = attackTermsAgainst(targetActor, caster, { distanceFeet: await distanceBetweenActors(caster, targetActor) });
  const check = await TRGCheck.roll({
    actor: caster,
    ...(weaponTerms.advantage ? { bias: "advantage" } : {}),
    type: "spellcraft",
    subject: "spellcraft",
    label: `${record.label} — ${targetActor.name}`,
    dc: Number.isFinite(db) ? db : null,
    suppressDegree: true,
    modifiers: [
      ...(caster.system?.magic?.spellcraft?.checkModifiers ?? [{
        label: "Spellcraft", value: Number(caster.system?.magic?.spellcraft?.total ?? 0), type: "untyped"
      }]),
      { label: record.label, value: Number(record.itemBonus) || 0, type: "item" },
      ...(map ? [{ label: "Multiple attack penalty", value: map, type: "untyped" }] : []),
      ...(wordPenalty ? [wordPenalty] : []),
      ...weaponTerms.rows,
      ...(weaponTerms.advantage ? [{ label: `Advantage — ${weaponTerms.advantage}`, value: 0, type: "untyped" }] : [])
    ]
  });
  await setAttackCount(caster, mapBefore + 1);
  // A DEFENCE THAT LASTED ONE ATTACK (3.666.0) — see combat/one-attack.mjs.
  {
    const { consumeOneAttackEffects } = await import("../combat/target-relay-workflow.mjs");
    await consumeOneAttackEffects(targetActor, { kind: "spiritualWeapon", attackerUuid: caster?.uuid ?? "" });
  }
  const outcome = attackOutcome({
    unmodified: check?.dice?.unmodified ?? 0,
    total: check?.outcome?.total ?? 0,
    db: Number.isFinite(db) ? db : null,
    proficient: true,
    criticalResistance: Number(targetActor.system?.combat?.criticalResistance ?? 0)
  });
  if (!outcome.resolved) {
    lines.push(line(`<em>vs ${targetActor.name}: no Defence Bonus found — resolve the strike by hand.</em>`));
    return { lines, rolls };
  }
  const ability = Number(caster.system?.attributes?.[caster.system?.magic?.castingAbility]?.total ?? 0);
  const formula = spiritualDamageFormula(record, ability);
  if (!outcome.hits) {
    lines.push(line(`<strong>Miss</strong> vs ${targetActor.name} — ${check?.outcome?.total ?? "?"} vs DB ${db}.`));
    // A SPELL'S SHIELD IN THE WAY (3.707.0; Stone Shield) — see magic/barrier.mjs.
    const { missMargin } = await import("./barrier.mjs");
    const { barrierInTheWay, barrierCatchLine, strikeBarrierWith } = await import("./barrier-workflow.mjs");
    const missBy = missMargin(check?.outcome?.total, db);
    const inTheWay = barrierInTheWay(targetActor, caster, { missBy, hits: false });
    if (inTheWay) {
      lines.push(line(barrierCatchLine(inTheWay, missBy, targetActor.name)));
      const shieldRoll = await new Roll(formula).evaluate();
      rolls.push(shieldRoll);
      lines.push(line(`<em>${record.label}'s damage to the shield: ${formula} = ${shieldRoll.total}.</em>`));
      await strikeBarrierWith(targetActor, inTheWay, shieldRoll.total, `${record.label} misses ${targetActor.name} by ${missBy}`);
    }
    return { lines, rolls };
  }

  const roll = await new Roll(formula).evaluate();
  rolls.push(roll);
  let dealt = roll.total;
  // A CRITICAL ADDS THE WEAPON'S OWN DIE AGAIN, as a weapon's critical does.
  let critNote = "";
  if (outcome.critical) {
    const extra = await new Roll(record.dice).evaluate();
    rolls.push(extra);
    dealt += extra.total;
    critNote = ` + ${record.dice} critical`;
  }
  const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
  // A DAMAGE REACTION, BEFORE THE DEFENCES (3.681.0; found in review).
  {
    const { spellDamageReactionsFor } = await import("../reactions/reactions-workflow.mjs");
    for (const said of await spellDamageReactionsFor(targetActor, record.damageType, { spellName: record?.label ?? "", source: caster })) lines.push(line(said));
  }
  const packet = resolveAgainstDefences(targetActor.system ?? {}, {
    amount: dealt,
    type: record.damageType,
    creatureTypeSystem: ownedCreatureTypeSystem(targetActor),
    magical: true,
    targeted: true,
    area: false,
    sourceTraits: record.sourceTraits ?? []
  });
  let newHP = null;
  if (packet.taken > 0) {
    const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
    const applied = await applyDamageAndCheckDying(targetActor, packet.taken, { isCritical: Boolean(outcome.critical) });
    newHP = applied?.newHP ?? null;
  }
  lines.push(line(`<strong>Hit</strong> vs ${targetActor.name} — ${check?.outcome?.total} vs DB ${db}`
    + `${outcome.critical ? ` <strong>Critical Hit (${outcome.critical.severity})</strong>` : ""}. `
    + (packet.immune
      ? `${targetActor.name} is <strong>immune</strong> to ${record.damageType}.`
      : `<strong>${packet.taken}</strong> ${record.damageType} (${formula}${critNote})`
        + `${newHP !== null ? ` — now ${newHP} HP` : ""}.`)));
  if (outcome.critical && !packet.immune) {
    const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
    await rollCriticalInjury(caster, {
      targetActor,
      damageType: record.damageType,
      severity: outcome.critical.severity,
      attackBonus: check?.outcome?.total ?? 0
    });
  }
  return { lines, rolls };
}

/**
 * Strike again because this casting was sustained. Returns card lines, or
 * [] when the sustained spell is not a spiritual weapon.
 */
export async function strikeOnSustain(caster, castId) {
  try {
    const record = recordFor(caster, castId);
    if (!record) return [];
    const { lines } = await spiritualStrike(caster, record, markedTarget(caster));
    return lines;
  } catch (error) {
    console.error("TRG Prime | a spiritual weapon could not strike", error);
    return [line(`<em>The spiritual weapon could not strike — resolve it by hand.</em>`)];
  }
}

/** The marked target for the cast's own first strike. */
export function firstStrikeTarget(caster) {
  return markedTarget(caster);
}
