/**
 * PACK ATTACK (Creature Codex, Chapter 2; 3.631.0 — Fiends & Fables 3.0
 * block 1, Graham: "all automated").
 *
 * "The creature's attacks inflict an additional 1d6 precision damage when
 * attacking any creature within reach of at least two of its allies."
 *
 * The same four facts the flank reads (3.579.0, allyThreatens): an ally
 * counts when it could strike the target — in its own reach of it, able to
 * act, not fighting someone else. Two such allies and the die is on; the
 * attack path adds it to the precision dice, so a creature immune to
 * precision takes none of it and one resisting it takes half.
 *
 * `packAttackAllies` is pure; `packAttackDice` reads the canvas.
 */
import { allyThreatens } from "./flanking.mjs";
import { distanceBetween, tokensAlliedWith } from "./geometry.mjs";

const SYSTEM_ID = "trg-prime";
const PACK_ATTACK_DICE = 1;

/** Does the creature carry Pack Attack (the item, or a declared flag)? */
function hasPackAttack(items = []) {
  return Array.from(items ?? []).some((i) =>
    i?.type === "ability" && (String(i.name ?? "").trim().toLowerCase() === "pack attack"
      || i?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.packAttack === true));
}

/**
 * How many allies threaten the target.
 * @param {Array<{conditions: string[], reachFeet: number, distanceFeet: number|null, canStrike: boolean}>} allies
 */
export function packAttackAllies(allies = []) {
  return Array.from(allies ?? []).filter((a) => allyThreatens(a).threatens).length;
}

/** The precision dice Pack Attack adds to this Strike: 1 with two allies in reach of the target, else 0. */
export function packAttackDice(actor, targetToken, { attackerToken = null } = {}) {
  if (!actor || !targetToken || !attackerToken) return 0;
  if (!hasPackAttack(Array.from(actor.items ?? []))) return 0;
  const allies = tokensAlliedWith(attackerToken, [targetToken]).map((token) => ({
    conditions: Array.from(token.actor?.statuses ?? []),
    reachFeet: Number(token.actor?.system?.combat?.reach ?? 5),
    distanceFeet: distanceBetween(token, targetToken),
    canStrike: Boolean(token.actor)
  }));
  return packAttackAllies(allies) >= 2 ? PACK_ATTACK_DICE : 0;
}
