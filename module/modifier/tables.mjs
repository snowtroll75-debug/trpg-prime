import { CRITICAL_TABLES } from "../data/critical-tables.mjs";
import { FUMBLE_TABLES } from "../data/fumble-tables.mjs";
import { lookupTableRow, criticalSeverity } from "../combat/attack.mjs";
import { rollCriticalInjury } from "../combat/attack-workflow.mjs";
import {
  extractConditionTags,
  extractSelfDamage,
  extractTextDuration,
  applySerratedBonus
} from "../effect-parser.mjs";
import {
  applyConditionTags,
  formatAppliedTags,
  applySelfDamage
} from "../combat/effect-application-workflow.mjs";
import { applyDamageAndCheckDying } from "../combat/dying-workflow.mjs";
import { recordWrapped } from "./transactions.mjs";

/**
 * Table workflows for the Universal Modifier: roll (or directly enter) a
 * critical injury or attack fumble and apply the result as one auditable,
 * undoable transaction.
 *
 * Criticals reuse the system's own rollCriticalInjury — hit location, armour
 * coverage, chaos, persistence, Death/Fatal saves, condition application —
 * wrapped so HP and every condition change is captured for exact undo.
 * (Item/armour side-damage from a critical is NOT yet captured; the summary
 * says so rather than pretending.)
 */

export const CRITICAL_TABLE_KEYS = Object.keys(CRITICAL_TABLES);
export const FUMBLE_TABLE_KEYS = Object.keys(FUMBLE_TABLES);

/** Everything a critical can touch on the target, watched for undo. */
const CRITICAL_WATCH = {
  paths: [
    { path: "system.resources.hp.value", label: "HP" },
    { path: "system.resources.hp.temp", label: "Temp HP" }
  ],
  statusIds: ["*"]
};

/**
 * Resolve severity from the inputs the GM gave: either a direct severity or
 * an Attack Value plus the target's Critical Resistance.
 * @returns {{severity: string|null, note: string|null}}
 */
export function resolveSeverityInput({ severity = "", av = null, criticalResistance = 0 }) {
  if (["minor", "serious", "deadly"].includes(severity)) return { severity, note: null };
  const result = criticalSeverity(Number(av) || 0, Number(criticalResistance) || 0);
  if (!result) {
    return {
      severity: null,
      note: `AV ${av} with Critical Resistance ${criticalResistance} does not reach a critical threshold (needs effective AV 5+).`
    };
  }
  return { severity: result.severity, note: null };
}

/**
 * Roll a critical injury against a target as a transaction.
 *
 * @param {object} txn An open transaction.
 * @param {object} options
 * @param {Actor} options.attacker Speaker/flag holder; defaults to target.
 * @param {Actor} options.targetActor The creature suffering the injury.
 * @param {string} options.damageType Critical table key.
 * @param {string} options.severity "minor" | "serious" | "deadly".
 * @param {number} [options.attackBonus] Feeds Death/Fatal save DCs.
 * @param {number} [options.modifier] Flat table-roll modifier.
 * @param {number|null} [options.forcedResult] Direct percentile entry.
 */
export async function criticalTransaction(txn, {
  attacker = null, targetActor, damageType, severity,
  attackBonus = 0, modifier = 0, forcedResult = null
}) {
  const speaker = attacker ?? targetActor;

  const outcome = await recordWrapped(txn, targetActor, CRITICAL_WATCH, () =>
    rollCriticalInjury(speaker, {
      targetActor,
      damageType,
      severity,
      attackBonus: Number(attackBonus) || 0,
      modifier: Number(modifier) || 0,
      forcedResult
    })
  );

  txn.summary.push(
    `${targetActor.name}: ${severity} ${damageType} critical — rolled ${outcome.result} ` +
    `(${outcome.row.min}–${outcome.row.max}, ${outcome.hitLocation}${outcome.locationArmoured ? ", armoured" : ""}).`
  );
  txn.summary.push(`Result: ${outcome.row.effect}`);
  if (outcome.save) {
    txn.summary.push(`${outcome.save.descriptor} — save DC ${outcome.save.dc}; target reduced to 0 HP.`);
  }
  if (outcome.armourAmended) {
    txn.summary.push("Armour absorbed the worst of it — armour item damage applies (not captured by undo; adjust the armour item by hand if undone).");
  }
  return outcome;
}

/**
 * Roll (or directly enter) an attack fumble for an actor as a transaction.
 * Standalone table resolution — no weapon required, so the GM can process a
 * fumble for any attack form (spec §13.4 manual controls).
 *
 * @param {object} txn An open transaction.
 * @param {object} options
 * @param {Actor} options.actor The fumbling creature (results apply to it).
 * @param {string} options.category "melee" | "missile" | "thrown" | "unarmed".
 * @param {number} [options.modifier] Flat table-roll modifier.
 * @param {number|null} [options.forcedRoll] Direct percentile entry.
 * @returns {{roll: number, result: number, row: object, applied: string, selfDamageLine: string|null}}
 */
export async function fumbleTransaction(txn, {
  actor, category, modifier = 0, forcedRoll = null
}) {
  const table = FUMBLE_TABLES[category] ?? FUMBLE_TABLES.melee;

  let rollTotal;
  const rolls = [];
  if (forcedRoll !== null && forcedRoll !== undefined && forcedRoll !== "") {
    rollTotal = Math.max(1, Math.min(100, Math.trunc(Number(forcedRoll) || 1)));
  } else {
    const roll = await new Roll("1d100").evaluate();
    rolls.push(roll);
    rollTotal = roll.total;
  }
  const result = rollTotal + (Number(modifier) || 0);
  const row = lookupTableRow(table, result);

  let appliedText = "";
  let selfDamageLine = null;

  await recordWrapped(txn, actor, CRITICAL_WATCH, async () => {
    const tags = applySerratedBonus(extractConditionTags(row.effect), false);
    if (tags.length) {
      const duration = extractTextDuration(row.effect);
      const expiresRound = duration.autoExpires && duration.rounds && game.combat?.started
        ? (game.combat.round ?? 0) + duration.rounds
        : null;
      const applied = await applyConditionTags(actor, tags, { expiresRound });
      appliedText = formatAppliedTags(applied);
    }
    const selfDamage = extractSelfDamage(row.effect);
    if (selfDamage) {
      const { line } = await applySelfDamage(actor, selfDamage, applyDamageAndCheckDying);
      selfDamageLine = line;
    }
  });

  txn.summary.push(
    `${actor.name}: ${category} fumble — rolled ${rollTotal}` +
    `${modifier ? ` ${modifier > 0 ? "+" : ""}${modifier} = ${result}` : ""} (${row.min}–${row.max}).`
  );
  txn.summary.push(`Result: ${row.effect}`);
  if (appliedText) txn.summary.push(`Applied: ${appliedText}.`);
  if (selfDamageLine) txn.summary.push(selfDamageLine.replace(/<[^>]+>/g, ""));

  // The card the table result deserves — same shape as the system's own.
  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    whisper: gmIds,
    rolls,
    content: `<div class="trg-prime trg-check-card">
      <h3 style="margin:0 0 4px 0">Fumble — ${category}</h3>
      <p style="margin:2px 0">Rolled <strong>${rollTotal}</strong>${modifier ? ` ${modifier > 0 ? "+" : ""}${modifier} = <strong>${result}</strong>` : ""} (${row.min}–${row.max}).</p>
      <p style="margin:2px 0"><em>${row.effect}</em></p>
      ${appliedText ? `<p style="margin:2px 0">Applied: ${appliedText}.</p>` : ""}
      ${selfDamageLine ?? ""}
    </div>`
  });

  return { roll: rollTotal, result, row, applied: appliedText, selfDamageLine };
}
