/**
 * Abilities that fire when a creature begins its turn.
 *
 * Three of the Codex's abilities key off "at the beginning of its turn"
 * or "begins its turn in sunlight". The aura work already found the only
 * moment Foundry announces a turn starting, so this rides the same
 * signal — but what it does when it gets there is deliberately different
 * from what an aura does, and the difference is worth stating.
 *
 * NOTHING HERE APPLIES ITSELF. Each ability posts a card with its
 * numbers already worked out and a button, exactly as the aura workflow
 * offers a save rather than rolling it. Two reasons, both from the page:
 *
 *  - Regeneration prints its own off-switch — "if a creature takes
 *    damage of an amount equal to or greater than its regeneration in a
 *    given round, its regeneration is disabled for 1 turn." Tracking
 *    damage-per-round to honour that is a bigger mechanism than this
 *    one, and healing a creature that should not have healed is a defect
 *    nobody would spot for weeks. The card carries the number and the
 *    disable rule beside it, and a person decides.
 *
 *  - Both Sunlight abilities begin "if this creature begins its turn IN
 *    SUNLIGHT". Foundry knows scene darkness and token light; it does
 *    not know whether the fiction is outdoors at noon. Inferring that
 *    from a darkness value would be the same guess as inventing a sense
 *    range.
 *
 * Pure and Foundry-free, so every number below is run in the harness
 * rather than read back.
 */

const SYSTEM_ID = "trg-prime";

/** The turn-start block an ability may declare, or null. */
export function turnStartOf(item) {
  const t = item?.flags?.[SYSTEM_ID]?.creatureAbility?.derives?.turnStart;
  return t && typeof t === "object" ? t : null;
}

/**
 * Regeneration — "regains an amount of HP equal to its level at the
 * beginning of its turn."
 */
export function regenerationHealing(level) {
  const lvl = Number(level);
  if (!Number.isFinite(lvl) || lvl <= 0) return 0;
  return Math.floor(lvl);
}

/**
 * Sunlight Vulnerability — "takes 2 Essence damage per level".
 */
export function sunlightEssenceDamage(level) {
  const lvl = Number(level);
  if (!Number.isFinite(lvl) || lvl <= 0) return 0;
  return Math.floor(lvl) * 2;
}

/**
 * What to announce for one creature at the start of its turn.
 *
 * Returns a plain array of descriptors — name, the worked-out number,
 * the lines to print, and whether a person has to decide something
 * before it applies. The workflow turns these into cards; it makes no
 * decisions of its own.
 *
 * @param {Array<object>} items The creature's items.
 * @param {number} level The creature's level.
 */
export function turnStartAnnouncements(items = [], level = 0) {
  const out = [];
  for (const item of items ?? []) {
    const turnStart = turnStartOf(item);
    if (!turnStart) continue;

    if (turnStart.kind === "regeneration") {
      const amount = regenerationHealing(level);
      out.push({
        ability: item.name,
        kind: "regeneration",
        amount,
        needsDecision: true,
        lines: [
          `Regains <strong>${amount} HP</strong> (level ${Math.max(0, Math.floor(Number(level)) || 0)}).`,
          "Regeneration is disabled for 1 turn if it took damage equal to or " +
          "greater than its regeneration in the last round."
        ]
      });
      continue;
    }

    if (turnStart.kind === "sunlight") {
      // Sunlight Vulnerability's own text: "it is also treated as having
      // Sunlight Weakness (see below)." So the vulnerable creature's
      // card carries both sets of consequences, and a creature with both
      // abilities is not announced twice for the weaker one.
      const damage = sunlightEssenceDamage(level);
      const lines = turnStart.severity === "vulnerability"
        ? [
          `Takes <strong>${damage} Essence damage</strong> (2 per level) and loses any ability to heal its wounds.`,
          "Also treated as having Sunlight Weakness: <strong>injured 2</strong> and " +
          "<strong>slowed 2</strong> for as long as it remains in the sunlight."
        ]
        : [
          "<strong>Injured 2</strong> and <strong>slowed 2</strong> for as long as it remains in the sunlight."
        ];
      out.push({
        ability: item.name,
        kind: "sunlight",
        severity: turnStart.severity,
        amount: turnStart.severity === "vulnerability" ? damage : 0,
        needsDecision: true,
        condition: "Only if the creature begins its turn in sunlight.",
        lines
      });
    }
  }

  // A creature with both Sunlight abilities gets one card, not two:
  // Vulnerability already states everything Weakness does.
  if (out.some((o) => o.kind === "sunlight" && o.severity === "vulnerability")) {
    return out.filter((o) => !(o.kind === "sunlight" && o.severity === "weakness"));
  }
  return out;
}
