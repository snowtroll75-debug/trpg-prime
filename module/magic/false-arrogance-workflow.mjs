/**
 * False Arrogance's penalty, written when a marked creature fails an attack
 * roll or a skill check (3.612.0, block 34's R8). The rule and the reasons
 * are in false-arrogance.mjs.
 *
 * CALLED FROM `TRGCheck.roll` once the degree is final — the one place every
 * attack roll and skill check passes through — and only for a creature
 * carrying the marker, so every other roll in the game pays one lookup.
 */

import {
  ARROGANCE_PENALTY_FLAG, arroganceTriggers, nextArrogancePenalty,
  arroganceWindow, arroganceLine
} from "./false-arrogance.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * @param {TRGCheck} check the roll just made
 * @returns {Promise<string|null>} a line for its card, or null
 */
export async function onArroganceCheck(check) {
  const actor = check?.actor;
  const degree = check?.outcome?.degree;
  if (!actor || !arroganceTriggers(check.type, Boolean(degree?.success), Boolean(degree))) return null;
  const { findMarker } = await import("./markers.mjs");
  if (!findMarker(actor, "falseArrogance")) return null;
  if (!actor.isOwner) return null;

  const existing = Array.from(actor.effects ?? [])
    .find((e) => !e.disabled && Number(e.flags?.[SYSTEM_ID]?.[ARROGANCE_PENALTY_FLAG]) > 0) ?? null;
  const penalty = nextArrogancePenalty(existing ? existing.flags[SYSTEM_ID][ARROGANCE_PENALTY_FLAG] : 0);

  const combat = game.combat?.started ? game.combat : null;
  const ownTurn = Boolean(combat) && combat.combatant?.actor?.uuid === actor.uuid;
  const window = arroganceWindow(ownTurn);
  const { parseSpellDuration, bonusTargetFor } = await import("./spell-effects.mjs");
  const parsed = parseSpellDuration(window);

  const flags = { [SYSTEM_ID]: { spellBuff: true, [ARROGANCE_PENALTY_FLAG]: penalty } };
  if (combat && parsed?.rounds) {
    flags[SYSTEM_ID].conditionExpiresRound = Number(combat.round ?? 0) + Number(parsed.rounds);
  } else if (parsed?.seconds) {
    flags[SYSTEM_ID].spellEffect = true;
    flags[SYSTEM_ID].spellEffectEnd = Number(game.time?.worldTime ?? 0) + Number(parsed.seconds);
  }
  const keys = ["attack", ...Object.keys(actor.system?.skills ?? {})]
    .map((k) => bonusTargetFor(k)).filter(Boolean);
  const data = {
    name: `False Arrogance (−${penalty})`,
    img: "icons/svg/downgrade.svg",
    changes: keys.map((key) => ({ key: `${key}.status`, type: CHANGE_TYPE.CUSTOM, value: String(-penalty) })),
    flags
  };
  // REPLACED, NOT STACKED: the page's −2 is the penalty, not −1 more on top.
  if (existing) await existing.delete();
  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  return arroganceLine(actor.name, penalty, window);
}
