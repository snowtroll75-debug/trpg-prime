/**
 * A PLACED AREA THAT HIDES WHOEVER STANDS IN IT — and hides the world
 * from them.
 *
 * NEW at 3.608.0, for R7 of the pages 321–330 audit. Pure; no Foundry.
 *
 * SOLID FOG (PP 8, page 326), 20-foot radius, 1 minute
 *   "All creatures within the mist become concealed, and all creatures
 *    outside the mist become concealed to creatures within it. The area
 *    is also difficult terrain."
 *
 * ─────────────────────────────────────────────────────────────────────
 * RIDES THE EMANATION MACHINERY, PUT DOWN WHERE IT WAS CAST.
 *
 * "Creatures within the mist" is a membership that changes as creatures
 * walk in and out, which is the one question the live-emanation sweep
 * exists to answer. What was missing was a circle that stays where the
 * TEMPLATE was placed rather than following the caster — and that already
 * exists too: `anchorTokenId: null` is Umbral Veil's dropped decoy, whose
 * membership is read back off its own Region. A GM who drags the Region
 * (the page's "move 10 ft. away from you each round") moves the fog, and
 * the membership follows the Region.
 *
 * TWO HALVES, TWO SIDES OF AN ATTACK.
 *
 *   Inside: the creature carries the condition, as an effect with the
 *   status, so every reader of `concealed` sees it — the avoidance flat
 *   check above all.
 *
 *   Outside, seen from inside: a fact about the ATTACKER, not the target.
 *   The attacker's own fog effect carries `obscuresOutward`, and an
 *   attack from a creature holding it against a creature NOT in the same
 *   cloud is an attack against a concealed target. Two creatures in the
 *   same cloud are both concealed by the first half already.
 */

/** The flag an obscuring zone's effect carries. */
export const OBSCURING_ZONE_FLAG = "obscuringZone";

/** The effect kind an obscuring area is authored as. */
const ZONE_KIND = "zone";

const text = (v) => String(v ?? "").trim();

/**
 * A zone row, or null.
 *
 *   { kind: "zone", target: "area", condition: "concealed", obscuresOutward: true, label }
 */
function normaliseZone(raw) {
  if (!raw || typeof raw !== "object" || text(raw.kind) !== ZONE_KIND) return null;
  const condition = text(raw.condition);
  /*
   * OR A SPEED PENALTY, OR BOTH (3.609.0, block 33's R10). TANGLING
   * CREEPERS: "Any creature moving on the land, or Climbing or Swimming
   * within the creepers, takes a –10-foot circumstance penalty to its
   * Speeds while in the area." The same placed membership Solid Fog's
   * concealment rides; the penalty is laid on every Speed the creature has
   * when it walks in, and lifted when it walks out.
   */
  const speedPenalty = Math.min(0, Math.trunc(Number(raw.speedPenalty) || 0));
  if (!condition && !speedPenalty) return null;
  return { condition, speedPenalty, obscuresOutward: raw.obscuresOutward === true, label: text(raw.label) };
}

/**
 * Is this spell's area put down where it was cast, rather than carried by
 * its caster? A zone row on a spell whose printed area is not an
 * emanation.
 */
export function zoneIsPlaced(spellData) {
  const rows = Array.isArray(spellData?.effects) ? spellData.effects : [];
  if (!rows.some((r) => normaliseZone(r))) return false;
  return !/emanation/i.test(text(spellData?.area));
}

/** What the effect on a creature inside carries: statuses and a flag. */
export function zoneEffectParts(rows, castId) {
  const zones = (Array.isArray(rows) ? rows : []).map(normaliseZone).filter(Boolean);
  if (!zones.length) return null;
  const speedPenalty = Math.min(0, ...zones.map((z) => z.speedPenalty || 0));
  return {
    statuses: [...new Set(zones.map((z) => z.condition).filter(Boolean))],
    flag: {
      castId: text(castId),
      obscuresOutward: zones.some((z) => z.obscuresOutward),
      label: zones.find((z) => z.label)?.label ?? "",
      ...(speedPenalty ? { speedPenalty } : {})
    }
  };
}

/**
 * Does the attacker's cloud hide this target from it?
 *
 * @param {Array<object>} attackerZones the attacker's zone flags
 * @param {Array<object>} targetZones the target's zone flags
 * @returns {object|null} the attacker's zone that obscures, or null
 */
export function obscuredFromInside(attackerZones, targetZones) {
  const theirs = new Set((targetZones ?? []).map((z) => text(z?.castId)).filter(Boolean));
  return (attackerZones ?? []).find((z) => z?.obscuresOutward && text(z.castId) && !theirs.has(text(z.castId)))
    ?? null;
}

/** The zone flags an actor's live effects carry. */
export function zoneFlagsOf(effects, systemId = "trg-prime") {
  return Array.from(effects ?? [])
    .filter((e) => !e?.disabled)
    .map((e) => e?.getFlag?.(systemId, OBSCURING_ZONE_FLAG) ?? e?.flags?.[systemId]?.[OBSCURING_ZONE_FLAG] ?? null)
    .filter(Boolean);
}

/**
 * The flag an effect carries when its creature ignores Speed penalties from
 * the environment (3.609.0 — Untamed Journey: "immune to Speed penalties
 * caused by vegetation, rubble, winds, or other environmental factors,
 * regardless of whether they are magical").
 */
export const ENVIRONMENT_SPEED_IMMUNE_FLAG = "ignoresEnvironmentalSpeed";
