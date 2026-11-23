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
import { PARTY_TYPE } from "./party.mjs";
import { MEMBER_STATUS, activeMembers, liveResolvers, resolveActorUuids, resolvePartyRoster } from "./party-members.mjs";

/**
 * THE ENCOUNTER'S STORAGE VERSION (3.712.0, Stage 5). Version 1 stored
 * `{threat, creatures: [{uuid, count}]}`. Version 2 adds, per creature, the
 * `tokens` an import counted it from, so importing the same combat or the
 * same selection twice adds nothing the second time. A version 1 encounter
 * reads as version 2 with no tokens recorded: nothing in it is changed,
 * and it is written as version 2 the next time the GM changes it.
 */
export const ENCOUNTER_VERSION = 2;

/** The stored encounter, cleaned up: `{version, threat, creatures: [{uuid, count, tokens}]}`. */
export function normaliseEncounter(raw) {
  const threat = threatLevel(raw?.threat) ? raw.threat : "medium";
  const seen = new Map();
  for (const entry of Array.isArray(raw?.creatures) ? raw.creatures : []) {
    const uuid = String(entry?.uuid ?? "").trim();
    if (!uuid) continue;
    const count = Math.max(1, Math.floor(Number(entry?.count) || 1));
    const tokens = (Array.isArray(entry?.tokens) ? entry.tokens : []).map((t) => String(t ?? "").trim()).filter(Boolean);
    const held = seen.get(uuid);
    if (held) {
      held.count += count;
      for (const t of tokens) if (!held.tokens.includes(t)) held.tokens.push(t);
    } else {
      seen.set(uuid, { uuid, count, tokens: [...new Set(tokens)] });
    }
  }
  return { version: ENCOUNTER_VERSION, threat, creatures: [...seen.values()] };
}

/* ------------------------------------------------------------------ */
/* Importing adversaries (3.712.0, Stage 5)                            */
/* ------------------------------------------------------------------ */

/**
 * WHICH CREATURE A TOKEN IS: its actor's UUID. A linked token's actor is
 * the world actor, so two linked tokens of one actor are one creature. An
 * unlinked token's actor is its own synthetic one (`Scene.….Token.….Actor.…`),
 * so three unlinked goblins are three. This is the identity the encounter
 * stores.
 */
export function tokenIdentity(token) {
  const actor = token?.actor ?? null;
  if (!actor) return null;
  // A linked token's actor IS the world actor; an unlinked one's is synthetic.
  return actor.uuid;
}

/**
 * The import list: one row per token or combatant, with why a row is
 * not ticked. Graham's ruling (23 Nov 2026): defeated and Friendly start
 * unticked; hidden adversaries are included (the page is the GM's); a party
 * member is never offered.
 *
 * @param {Array<{tokenUuid: string, token: object|null, name?: string, defeated?: boolean, hidden?: boolean}>} sources
 * @param {object} options
 * @param {string[]} options.members the party's member UUIDs
 * @param {object} options.encounter the normalised encounter
 * @param {number} [options.friendly] the Friendly disposition value (CONST.TOKEN_DISPOSITIONS.FRIENDLY)
 */
export function encounterCandidates(sources = [], { members = [], encounter = { creatures: [] }, friendly = 1 } = {}) {
  const memberSet = new Set(members);
  const rows = [];
  const missing = [];
  const seenIdentity = new Set();
  for (const source of sources) {
    const token = source?.token ?? null;
    const actor = token?.actor ?? null;
    if (!token || !actor) { missing.push(source?.name || "a token that no longer exists"); continue; }
    const identity = tokenIdentity(token);
    const base = actor.token ? actor.baseActor?.uuid ?? null : actor.uuid;
    const isMember = memberSet.has(identity) || memberSet.has(actor.uuid) || (token.actorLink && base && memberSet.has(base));
    if (isMember || actor.type === "party") continue;
    const entry = encounter.creatures.find((e) => e.uuid === identity);
    const counted = Boolean(entry?.tokens?.includes(source.tokenUuid));
    // A linked actor already in the list is that creature already, however it got there.
    const sameCreature = Boolean(entry) && identity === base;
    const handAdded = !entry && Boolean(base) && encounter.creatures.some((e) => e.uuid === base && !(e.tokens?.length));
    const disposition = Number(token.disposition ?? token.document?.disposition);
    const reasons = [];
    if (counted) reasons.push("already imported");
    else if (sameCreature) reasons.push("already in the encounter");
    if (seenIdentity.has(identity)) reasons.push("another token of the same creature");
    if (source.defeated) reasons.push("defeated");
    if (disposition === friendly) reasons.push("friendly");
    if (handAdded) reasons.push(`${actor.name} is in the encounter already, added by hand`);
    seenIdentity.add(identity);
    rows.push({
      tokenUuid: source.tokenUuid,
      uuid: identity,
      linked: identity === base,
      name: source.name || token.name || actor.name,
      img: actor.img ?? null,
      hidden: Boolean(source.hidden),
      defeated: Boolean(source.defeated),
      ticked: reasons.length === 0,
      blocked: counted || sameCreature,
      reasons
    });
  }
  return { rows, missing };
}

/**
 * The encounter after an import. Each picked token is recorded on its
 * creature; a creature is added, or counted once more, only for a token
 * not seen before. An entry is never removed or lowered by an import.
 *
 * @returns {{encounter: object, added: number, skipped: number}}
 */
export function mergeEncounterImport(encounter, picks = []) {
  const out = normaliseEncounter(encounter);
  let added = 0;
  let skipped = 0;
  for (const pick of picks) {
    const uuid = String(pick?.uuid ?? "").trim();
    const tokenUuid = String(pick?.tokenUuid ?? "").trim();
    if (!uuid || !tokenUuid) { skipped += 1; continue; }
    const entry = out.creatures.find((e) => e.uuid === uuid);
    if (!entry) {
      out.creatures.push({ uuid, count: 1, tokens: [tokenUuid] });
      added += 1;
    } else if (entry.tokens.includes(tokenUuid) || pick.linked) {
      // The same token twice, or another token of a linked actor already here.
      if (!entry.tokens.includes(tokenUuid)) entry.tokens.push(tokenUuid);
      skipped += 1;
    } else {
      entry.tokens.push(tokenUuid);
      entry.count += 1;
      added += 1;
    }
  }
  return { encounter: out, added, skipped };
}

/** Write an import. Returns what was added and skipped. */
export async function importEncounterPicks(party, picks = []) {
  const { encounter, added, skipped } = mergeEncounterImport(party.system?.encounter, picks);
  if (added) await party.update({ "system.encounter": encounter });
  return { added, skipped };
}

/**
 * The members as actors: the roster entries that resolved and may be on a
 * roster (3.708.0: through party-members.mjs, the one resolver, in one
 * batch). A missing or ineligible entry is not counted.
 */
async function partyMembers(party) {
  return activeMembers(await resolvePartyRoster(party));
}

/**
 * Everything the Rewards tab shows.
 *
 * 3.708.0: `members` may be passed in, already resolved, by a caller that
 * has the roster (the sheet resolves it once per render for every panel).
 * Without it the roster is resolved here. The adversaries are resolved in
 * one batch too, and the result's `watchEntries` tells the sheet which
 * documents its encounter rows were read from.
 *
 * @param {Actor} party
 * @param {{members?: Actor[]}} [options]
 */
export async function rewardsContext(party, { members = null } = {}) {
  members = members ?? await partyMembers(party);
  const levels = members.map((actor) => Number(actor.system?.identity?.level ?? 0));
  const apl = averagePartyLevel(levels);
  const encounter = normaliseEncounter(party?.system?.encounter);
  const counts = new Map(encounter.creatures.map((entry) => [entry.uuid, entry.count]));
  const resolved = await resolveActorUuids(
    encounter.creatures.map((entry) => entry.uuid), liveResolvers(),
    (actor) => actor?.type !== PARTY_TYPE
  );
  const creatures = [];
  for (const { uuid, actor: found, status } of resolved) {
    const actor = status === MEMBER_STATUS.OK ? found : null;
    const entry = { uuid, count: counts.get(uuid) ?? 1 };
    creatures.push({
      uuid: entry.uuid,
      count: entry.count,
      // How many tokens an import counted it from (version 2), for the GM's tooltip.
      tokens: encounter.creatures.find((e) => e.uuid === uuid)?.tokens?.length ?? 0,
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
    treasure: treasureGuide(apl.apl),
    watchEntries: resolved
  };
}

/** Add creatures (by uuid) to the encounter: an actor dropped on the tab. */
export async function addEncounterCreatures(party, uuids = []) {
  const encounter = normaliseEncounter(party.system?.encounter);
  for (const uuid of uuids) {
    const existing = encounter.creatures.find((entry) => entry.uuid === uuid);
    if (existing) existing.count += 1;
    else encounter.creatures.push({ uuid, count: 1, tokens: [] });
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
export async function awardPartyXP(party, total, reason, { members: given = null } = {}) {
  if (!game.user?.isGM) {
    ui.notifications?.warn("Only the GM awards experience.");
    return null;
  }
  // 3.710.0: the Party sheet's confirmation resolves the members once and
  // passes them, so the split the GM confirmed is the split written.
  const members = given ?? await partyMembers(party);
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
