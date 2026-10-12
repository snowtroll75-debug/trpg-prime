/**
 * TANGLING CREEPERS' VINE, AGAIN (3.609.0, block 33's R10).
 *
 *   "As part of casting the spell and then once per round as a 1 AP attack
 *    action, you can make a vine lash out from any square within the
 *    expanse of creepers. This vine has a 15-foot reach is a grapple attack
 *    using your Spellcraft bonus."
 *
 * The cast's own lash is the `maneuver` row. Every lash after it is this
 * button on the cast card: it spends 1 AP and runs the SAME row through the
 * same engine against the presser's current target, so the second lash
 * cannot be resolved differently from the first. "Once per round" and the
 * 15-foot reach from the creepers are the table's — nothing here measures
 * from an expanse of squares.
 */

/**
 * @param {string} casterUuid
 * @param {string} spellName
 * @returns {Promise<void>}
 */
export async function onVineLash(casterUuid, spellName = "Tangling Creepers") {
  const caster = await fromUuid(casterUuid);
  const actor = caster?.actor ?? caster;
  if (!actor) return;
  const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  if (!target) {
    ui.notifications?.warn?.(`${spellName}: target the creature the vine lashes at first.`);
    return;
  }
  const { spendActionPoints } = await import("../combat/action-points-workflow.mjs");
  await spendActionPoints(actor, "1", `${spellName} — vine lash`);
  const { applySpellEffects } = await import("./spell-effects.mjs");
  const lines = [];
  await applySpellEffects(actor, { name: spellName, img: "", uuid: "", system: { duration: "", effects: [] } }, {
    targets: [target],
    lines,
    effects: [{ kind: "maneuver", target: "targets", label: `${spellName} vine`, penalty: 0, action: "grappleAttack" }]
  });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${spellName} — vine lash</h3></div></header>`
      + lines.join("") + `</div>`
  });
}
