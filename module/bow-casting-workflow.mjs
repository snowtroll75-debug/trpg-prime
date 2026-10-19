/**
 * Bow casting: the Foundry half (3.655.0; F&F 3.0 block 22 R5). The rules
 * are bow-casting.mjs's. Called from the Strike once it is known to hit,
 * before injury and damage; returns true when a spell was carried, in which
 * case the arrow deals nothing and no injury is rolled.
 */
import { carriedSpells, severityDCBonus } from "./bow-casting.mjs";

const SYSTEM_ID = "trg-prime";

export async function castThroughStrike(actor, weapon, targetActor, spec, severity = null) {
  const spells = carriedSpells(actor?.items ?? []);
  if (!spells.length) return false;
  const pool = Number(actor.system?.resources?.pp?.value ?? 0);
  const dcBonus = severity ? severityDCBonus(severity, spec.dcPerSeverity) : 0;
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${spec.source} — ${weapon.name} hits ${targetActor.name}` }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>Carry a spell to ${targetActor.name}? It lands instead of the arrow's damage`
      + `${spec.heighten ? ", Heightened" : ""}${dcBonus ? `, its DC +${dcBonus} for the ${severity} critical (no injury)` : ""}. ${actor.name} has ${pool} PP.</p></div>`,
    buttons: [...spells.map((s, i) => ({ action: `s${i}`, label: `${s.name} (${s.system.ppCost} PP)` })), { action: "none", label: "None — the arrow strikes", default: true }],
    rejectClose: false
  }).catch(() => null);
  const index = /^s(\d+)$/.exec(String(picked ?? ""))?.[1];
  if (index === undefined) return false;
  const spell = spells[Number(index)];
  const token = targetActor.token?.object ?? targetActor.getActiveTokens?.()?.[0] ?? null;
  if (token) token.setTarget(true, { user: game.user, releaseOthers: true });
  const { castSpell } = await import("./magic/cast-workflow.mjs");
  const cast = await castSpell(actor, spell, { presetTargets: Boolean(token), apPaid: true, carried: { label: spec.source, heighten: spec.heighten, dcBonus, severity } });
  // A CAST REFUSED BEFORE IT BEGAN (3.655.1) carries nothing: the arrow strikes as normal.
  if (!cast) return false;
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><p><strong>${spec.source}</strong> — ${weapon.name} carries <strong>${spell.name}</strong> to ${targetActor.name}; `
      + `the arrow deals no damage${severity ? " and its critical rolls no injury" : ""}.</p></div>`
  });
  return true;
}
