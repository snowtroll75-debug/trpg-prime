/**
 * ARMOUR RENDING BY DECLARATION (3.668.0).
 *
 * Armour Rending (AR) is a weapon trait (Chapter 6) and, since ammunition,
 * something a projectile adds. Inner Tempest gives it from abilities, scoped
 * like a conditional:
 *
 *   Challenge (Oathblade): "Your melee attacks against it gain AR equal to
 *   your class bonus."
 *   Distant Honour: the same for bow attacks within the first range increment.
 *   Oath of Vengeance: Retribution's Strike "increases its AR by 2".
 *   Oath of Fealty: the Sworn Charge's "attacks against your challenged
 *   target gain AR 1".
 *
 * Declared on an item or effect, in the conditionals' own vocabulary:
 *
 *   flags.trg-prime.strikeRending = [{
 *     value: 2 | valueFrom: "classBonus", valueMin?,
 *     label: "Challenge",
 *     when: { targetUuids: [...], attackModes: ["melee"], attackGroups: ["bow"] },
 *     oneShot?: true          // spent by the Strike it joined (an effect only)
 *   }]
 *
 * Scoped exactly as a conditional is (`matchesCheck`), against the Strike's
 * damage context. An entry scoped by nothing is refused: AR "against
 * everything" is a different claim from any the book makes. What it adds is
 * summed with the weapon's own AR and the ammunition's, as ammunition's is
 * (Graham's ruling for ammunition).
 *
 * Pure: no Foundry.
 */
import { matchesCheck, normaliseConditional } from "../conditionals.mjs";

const FLAG = "trg-prime";

/**
 * Every rending row among these carriers (items and effects), disabled
 * effects skipped, normalised with the actor's scaling figures.
 *
 * @param {Iterable<object>} carriers items and applied effects
 * @param {object} scaling `scalingFor(actor)`
 * @returns {object[]} normalised rows: {id, label, value, when, not, oneShot, sourceId, sourceKind}
 */
export function declaredRendingRows(carriers = [], scaling = {}) {
  const out = [];
  for (const carrier of carriers ?? []) {
    if (!carrier || carrier.disabled) continue;
    const raw = carrier.flags?.[FLAG]?.strikeRending;
    if (!raw) continue;
    const kind = carrier.documentName === "ActiveEffect" || carrier.kind === "effect" ? "effect" : "item";
    (Array.isArray(raw) ? raw : [raw]).forEach((row, index) => {
      if (!row || typeof row !== "object") return;
      const entry = normaliseConditional(
        { ...row, kind: "modifier", type: "untyped" },
        { id: carrier.id ?? carrier._id ?? "", name: carrier.name ?? "", kind },
        index,
        scaling
      );
      if (entry && entry.value > 0) out.push(entry);
    });
  }
  return out;
}

/**
 * The AR these rows add to one Strike, with a card line per row, and the
 * one-shot effects it spends.
 *
 * @param {object[]} rows declaredRendingRows(...)
 * @param {object} context the Strike's conditional context (targetUuid,
 *   attackMode, attackForm, attackGroup, …)
 * @returns {{total: number, lines: string[], spent: Array<{sourceId: string, label: string}>}}
 */
export function declaredRending(rows = [], context = {}) {
  const matched = (rows ?? []).filter((row) => matchesCheck(row, { ...context, checkType: "damage" }));
  const total = matched.reduce((sum, row) => sum + row.value, 0);
  const lines = matched.map((row) => `${row.label}: AR ${row.value}`);
  const spent = matched
    .filter((row) => row.oneShot && row.sourceKind === "effect" && row.sourceId)
    .map((row) => ({ sourceId: row.sourceId, label: row.label }));
  return { total, lines, spent };
}
