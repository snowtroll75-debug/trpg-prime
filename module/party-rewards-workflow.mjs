/**
 * THE PARTY SHEET'S REWARDS TAB — the Foundry half of rewards.mjs (3.619.0,
 * block 38; Chapter 12, Graham's R2, R3, R6 and R8).
 *
 *   an encounter: Threat Level, budget, creatures dropped in, their XP
 *   Award XP: the encounter's total, split evenly across the members
 *   the five accomplishment awards and a custom amount, split the same way
 *   Treasure by Level as a guide line
 *   Begin Session: Hero's Resolve's point for each member who has it
 *
 * WHO GETS XP. The split is across every member counted in the APL —
 * "include any permanent NPCs" — so an NPC companion takes a share; only a
 * character's share is written, since only a character's level comes from
 * XP. The card says so.
 */

import {
  ACCOMPLISHMENT_AWARDS, THREAT_LEVELS, averagePartyLevel, effectiveLevelOf,
  encounterSummary, splitXP, threatLevel, treasureGuide
} from "./rewards.mjs";
import { normaliseMembers } from "./party.mjs";

/** The stored encounter, cleaned up: `{threat, creatures: [{uuid, count}]}`. */
export function normaliseEncounter(raw) {
  const threat = threatLevel(raw?.threat) ? raw.threat : "medium";
  const seen = new Map();
  for (const entry of Array.isArray(raw?.creatures) ? raw.creatures : []) {
    const uuid = String(entry?.uuid ?? "").trim();
    if (!uuid) continue;
    const count = Math.max(1, Math.floor(Number(entry?.count) || 1));
    seen.set(uuid, (seen.get(uuid) ?? 0) + count);
  }
  return { threat, creatures: [...seen].map(([uuid, count]) => ({ uuid, count })) };
}

async function resolve(uuid) {
  try { return await fromUuid(uuid); } catch { return null; }
}

/** The members as actors (missing ones dropped). */
async function partyMembers(party) {
  const out = [];
  for (const uuid of normaliseMembers(party?.system?.members)) {
    const actor = await resolve(uuid);
    if (actor) out.push(actor);
  }
  return out;
}

/** Everything the Rewards tab shows. */
export async function rewardsContext(party) {
  const members = await partyMembers(party);
  const levels = members.map((actor) => Number(actor.system?.identity?.level ?? 0));
  const apl = averagePartyLevel(levels);
  const encounter = normaliseEncounter(party?.system?.encounter);
  const creatures = [];
  for (const entry of encounter.creatures) {
    const actor = await resolve(entry.uuid);
    creatures.push({
      uuid: entry.uuid,
      count: entry.count,
      missing: !actor,
      name: actor?.name ?? "(missing actor)",
      img: actor?.img ?? null,
      level: Number(actor?.system?.identity?.level ?? 0),
      el: actor ? effectiveLevelOf(actor.system) : 0
    });
  }
  const live = creatures.filter((creature) => !creature.missing);
  const summary = encounterSummary({ creatures: live, apl: apl.apl, threat: encounter.threat, members: apl.members });
  const byUuid = new Map(summary.rows.map((row) => [row.uuid, row]));
  return {
    apl,
    threat: encounter.threat,
    threatOptions: THREAT_LEVELS.map((entry) => ({
      key: entry.key,
      label: `${entry.label} (${entry.xp} XP each)`,
      selected: entry.key === encounter.threat
    })),
    creatures: creatures.map((creature) => ({ ...creature, ...(byUuid.get(creature.uuid) ?? { xpEach: 0, xp: 0 }) })),
    summary,
    split: splitXP(summary.total, apl.members),
    accomplishments: ACCOMPLISHMENT_AWARDS,
    treasure: treasureGuide(apl.apl)
  };
}

/** Add creatures (by uuid) to the encounter. */
export async function addEncounterCreatures(party, uuids = []) {
  const encounter = normaliseEncounter(party.system?.encounter);
  for (const uuid of uuids) {
    const existing = encounter.creatures.find((entry) => entry.uuid === uuid);
    if (existing) existing.count += 1;
    else encounter.creatures.push({ uuid, count: 1 });
  }
  await party.update({ "system.encounter": encounter });
}

/** Set one creature's count (0 removes it). */
export async function setEncounterCount(party, uuid, count) {
  const encounter = normaliseEncounter(party.system?.encounter);
  const n = Math.max(0, Math.floor(Number(count) || 0));
  encounter.creatures = encounter.creatures
    .map((entry) => (entry.uuid === uuid ? { ...entry, count: n } : entry))
    .filter((entry) => entry.count > 0);
  await party.update({ "system.encounter": encounter });
}

/**
 * Split an XP total evenly across the party and write each character's
 * share (R2). Returns the card's lines.
 *
 * @param {Actor} party
 * @param {number} total
 * @param {string} reason
 */
export async function awardPartyXP(party, total, reason) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Only the GM awards experience.");
    return null;
  }
  const members = await partyMembers(party);
  const xp = Math.max(0, Math.floor(Number(total) || 0));
  if (!members.length || !xp) {
    ui.notifications?.warn(members.length ? "There is no XP to award." : "The party has no members to award XP to.");
    return null;
  }
  const { each, remainder } = splitXP(xp, members.length);
  const lines = [`<p style="margin:2px 0"><strong>${xp} XP</strong> — ${reason}: <strong>${each} XP</strong> each across ${members.length} member${members.length === 1 ? "" : "s"}${remainder ? ` (${remainder} XP does not divide evenly and is not awarded)` : ""}.</p>`];
  for (const actor of members) {
    if (actor.type !== "character") {
      lines.push(`<p style="margin:2px 0">${actor.name}: ${each} XP share — an NPC's level does not come from XP, so nothing is written.</p>`);
      continue;
    }
    const before = Number(actor.system?.identity?.xp?.value ?? 0) || 0;
    const levelBefore = Number(actor.system?.identity?.level ?? 0);
    await actor.update({ "system.identity.xp.value": before + each });
    const levelAfter = Number(actor.system?.identity?.level ?? 0);
    lines.push(`<p style="margin:2px 0">${actor.name}: ${before} → <strong>${before + each}</strong> XP${levelAfter > levelBefore ? ` — <strong>level ${levelAfter}</strong>` : ""}.</p>`);
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: party }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${party.name}</span><h3>Experience Awarded</h3></div></header>${lines.join("")}</div>`
  });
  return { each, remainder };
}

/**
 * BEGIN SESSION (R8): Hero's Resolve — "You regain a conviction point at the
 * beginning of each game session." The system cannot see a session begin,
 * so the GM says so here; each member holding the feat regains one point,
 * never above the maximum.
 */
export async function beginSession(party) {
  if (!game.user?.isGM) return null;
  const { CONVICTION_FEATS, convictionEnabled, hasConvictionFeat } = await import("./conviction.mjs");
  const members = await partyMembers(party);
  const lines = [];
  if (convictionEnabled()) {
    for (const actor of members) {
      if (!hasConvictionFeat(actor, CONVICTION_FEATS.resolve)) continue;
      const resource = actor.system?.resources?.conviction ?? {};
      const value = Number(resource.value ?? 0);
      const max = Number(resource.max ?? 0);
      if (value >= max) {
        lines.push(`<p style="margin:2px 0">${actor.name} (Hero's Resolve): already at ${value}/${max}.</p>`);
        continue;
      }
      await actor.update({ "system.resources.conviction.value": value + 1 });
      lines.push(`<p style="margin:2px 0">${actor.name} (Hero's Resolve): conviction ${value} → <strong>${value + 1}</strong>.</p>`);
    }
  }
  if (!lines.length) lines.push(`<p style="margin:2px 0">No member holds Hero's Resolve${convictionEnabled() ? "" : " (Conviction is not used in this world)"}.</p>`);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: party }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${party.name}</span><h3>A New Session Begins</h3></div></header>${lines.join("")}</div>`
  });
  return lines.length;
}
