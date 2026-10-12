/**
 * AN ATTACK THAT SEES THROUGH WHAT WOULD HINDER IT.
 *
 * NEW at 3.609.0, for block 33's R7. Pure; no Foundry.
 *
 *   TRUE STRIKE (PP 2)  "You gain advantage on the next Strike you make with
 *                        the weapon you were wielding … before the end of
 *                        your turn. The attack also ignores circumstance
 *                        penalties to the attack roll and the concealed or
 *                        hidden conditions."
 *   TRUE TARGET (PP 14) "The first time each target makes an attack roll
 *                        against that creature during the spell's duration,
 *                        the attacker gains advantage. The attacker also
 *                        ignores circumstance penalties to the attack roll
 *                        and any penalties due to the creature being
 *                        concealed or hidden."
 *
 * THE ADVANTAGE IS A ONE-SHOT CONDITIONAL — the channel Clarity uses — so
 * it is offered on the roll, pre-ticked, and spent there; for True Target
 * it is scoped to the one creature by `targetUuids`. What the conditional
 * engine cannot say is the other half: a penalty that never reaches the
 * roll, and a miss-chance check that is never made. Those ride the SAME
 * effect as a flag, so spending the advantage spends them too — one
 * document, one lifetime, the lesson Grapple's critical taught.
 *
 * ONLY CIRCUMSTANCE PENALTIES, and only the ones the attack workflow lays
 * down itself (Unsteady, subdual shots, Aid against the wrong creature);
 * a status penalty, or a bonus of any kind, is untouched.
 */

/** The flag an effect carries the edge on. */
export const STRIKE_EDGE_FLAG = "strikeEdge";

/**
 * The edge this attacker holds against this target, from its effects, or
 * null. An edge naming a target applies to that target alone; one naming
 * none applies to any.
 *
 * @param {Array<object>} effects documents or plain objects
 * @param {string} targetUuid
 * @param {string} systemId
 */
export function strikeEdgeFrom(effects, targetUuid = "", systemId = "trg-prime") {
  let best = null;
  for (const e of Array.isArray(effects) ? effects : []) {
    if (!e || e.disabled) continue;
    const edge = e.flags?.[systemId]?.[STRIKE_EDGE_FLAG];
    if (!edge || typeof edge !== "object") continue;
    const against = String(edge.targetUuid ?? "").trim();
    if (against && against !== String(targetUuid ?? "")) continue;
    best = {
      ignoreCircumstance: Boolean(edge.ignoreCircumstance || best?.ignoreCircumstance),
      ignoreConcealment: Boolean(edge.ignoreConcealment || best?.ignoreConcealment),
      label: String(edge.label ?? best?.label ?? "")
    };
  }
  return best;
}

/**
 * The modifier list with its circumstance PENALTIES taken out, and what
 * was taken. Bonuses stay; other types stay.
 */
export function withoutCircumstancePenalties(modifiers) {
  const kept = [];
  const removed = [];
  for (const m of Array.isArray(modifiers) ? modifiers : []) {
    if (String(m?.type ?? "").toLowerCase() === "circumstance" && Number(m?.value) < 0) removed.push(m);
    else kept.push(m);
  }
  return { kept, removed };
}
