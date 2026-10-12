/**
 * ALIGNED DETECTION (3.632.0; Fiends & Fables 3.0 Appendix, block 2 ruling 14).
 *
 * "Passive Detection: If you possess an aligned trait, you may make a
 * Perception check (opposed level based) to sense creatures or items sharing
 * your trait within 60 feet. Be aware that this enables you to sense that
 * creatures are present, but not their specific location or identity.
 * Active Detection: If using a spell or ability like Detect Aura, you can
 * discern creatures or objects with the same trait more precisely. You gain
 * a +1-circumstance bonus to such detection if your trait matches."
 *
 * The Sense Aligned action rolls the Perception once and compares it with
 * each sharing creature's Level DC (opposed level based). The table sees how
 * many presences answer and which trait; the GM is whispered who they are.
 * With Detect Aura running on the senser, the detection is ACTIVE: the +1
 * circumstance is added and the strength of each aura is reported to the
 * table (the spell's own warp adds location — the GM's whisper has it).
 */
import { ACTIVE_DETECTION_BONUS, PASSIVE_DETECTION_FEET, auraStrength, sharedAlignedTraits } from "./aligned.mjs";
import { activeToken, distanceBetween } from "./combat/geometry.mjs";

const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const levelOf = (a) => Math.max(0, Math.floor(Number(a?.system?.identity?.level ?? 0) || 0));

/** Is Detect Aura running on this actor? */
function detectAuraActive(actor) {
  return Array.from(actor?.effects ?? []).some((e) => !e.disabled && /detect aura/i.test(String(e.name ?? "")));
}

export async function resolveSenseAligned(actor, action = {}) {
  const mine = activeToken(actor);
  if (!mine) { ui.notifications?.warn("Sense Aligned: place your token on the scene."); return null; }
  const sharing = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.id === mine.id || !token.actor) continue;
    const shared = sharedAlignedTraits(actor.system, token.actor.system);
    if (!shared.length) continue;
    const feet = Number(distanceBetween(mine, token));
    if (!(feet <= PASSIVE_DETECTION_FEET)) continue;
    sharing.push({ token, shared, feet });
  }
  const active = detectAuraActive(actor);
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const { levelDC } = await import("./dice/resolution.mjs");
  const config = withCheckModifiers({
    actor, type: "skill", subject: "perception",
    // One roll against several DCs: the card shows the total, not a
    // "Set DC" prompt (3.632.2, found live).
    suppressDegree: true,
    label: `${actor.name} — Perception (Sense Aligned)`,
    subtitle: active ? "Active detection — Detect Aura" : "Passive detection, 60 feet"
  });
  if (active) config.modifiers = [...(config.modifiers ?? []), { label: "Active detection", ...ACTIVE_DETECTION_BONUS }];
  const check = await TRGCheck.roll(config);
  const total = Number(check?.outcome?.total ?? check?.total ?? 0);
  const sensed = sharing.filter((s) => total >= levelDC(levelOf(s.token.actor)));
  const byTrait = {};
  for (const s of sensed) for (const t of s.shared) (byTrait[t] ??= []).push(s);
  const publicLines = [line(`Perception <strong>${total}</strong> against each presence's Level DC, within ${PASSIVE_DETECTION_FEET} ft.`)];
  if (!sensed.length) publicLines.push(line("Nothing sharing your aligned traits answers."));
  for (const [trait, list] of Object.entries(byTrait)) {
    const strengths = active ? ` — ${list.map((s) => auraStrength(levelOf(s.token.actor), { mortal: !/eternal/i.test(String(s.token.actor.system?.details?.creatureType ?? "")) }).label).join(", ")}` : "";
    publicLines.push(line(`<strong>${list.length}</strong> ${trait} presence${list.length === 1 ? "" : "s"}${strengths}.`));
  }
  if (!active) publicLines.push(line("<em>Presence only — not where, not who.</em>"));
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${action.name ?? "Sense Aligned"}</h3></div></header>${publicLines.join("")}</div>`
  });
  if (sharing.length) {
    await ChatMessage.create({
      whisper: ChatMessage.getWhisperRecipients?.("GM")?.map((u) => u.id) ?? [],
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card">${line(`<strong>Sense Aligned (GM)</strong> — ${actor.name} rolled ${total}.`)}${sharing.map((s) => line(`${s.token.name} (${s.shared.join(", ")}, ${Math.round(s.feet)} ft, Level DC ${levelDC(levelOf(s.token.actor))}): <strong>${sensed.includes(s) ? "sensed" : "not sensed"}</strong>.`)).join("")}</div>`
    });
  }
  return sensed;
}
