/**
 * HELD IN SOMETHING YOU CAN BREAK OUT OF.
 *
 * NEW at 3.609.0, for block 33's R1. Pure; no Foundry.
 *
 * VOLCANIC INFERNO (PP 14, page 340)
 *   "The lava quickly solidifies, trapping creatures within hardened rock.
 *    A creature trapped in the rock becomes slowed 1 and suffers a
 *    -10-foot circumstance penalty to its Speeds. … A trapped creature can
 *    attempt to Escape against your spell DC to break free. Otherwise, it
 *    must inflict a total of 50 damage to the rock to break free."
 *      Failure  "The creature takes full damage and is encased."
 *      Fumble   "… a light fire critical and is encased."
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE CONDITIONS ALREADY EXIST; THE WAY OUT DID NOT.
 *
 * Slowed is a condition and "-10 ft to Speeds" is the `allSpeeds` bonus
 * slot False Mire uses. What nothing could say is "until it Escapes
 * against the spell DC". The Escape action (Chapter 4) breaks Grabbed and
 * Immobilised and nothing else, and it carries no DC of its own — "against
 * that effect's DC", which the player was left to type.
 *
 * SO THE EFFECTS CARRY THEIR OWN DC. A row marked `escape: true` stamps the
 * spell's save DC on what it applied. Escape then reads it — the DC is the
 * highest one the creature is held by — and a success or better removes
 * every effect so marked. The rock's 50 hit points stay the table's: a
 * cylinder of stone is not a creature, and nothing records damage dealt
 * to a thing that is not on the map.
 *
 * ONLY WHAT THIS CAST APPLIED IS STAMPED. A creature already slowed by
 * something else keeps that slowing when it climbs out of the rock.
 */

/** The flag an escapable effect carries: the DC that frees it. */
export const ESCAPE_DC_FLAG = "escapeDC";
/** And what holds it, for the card. */
export const ESCAPE_LABEL_FLAG = "escapeFrom";

const int = (v) => Math.trunc(Number(v));

/**
 * Everything on a creature that an Escape could break, read from its
 * effects (plain objects or documents).
 *
 * @param {Array<object>} effects
 * @param {string} systemId
 * @returns {Array<{id: string, dc: number, from: string}>}
 */
export function escapableEffects(effects, systemId = "trg-prime") {
  const out = [];
  for (const e of Array.isArray(effects) ? effects : []) {
    if (!e || e.disabled) continue;
    const flags = e.flags?.[systemId] ?? {};
    const dc = int(flags[ESCAPE_DC_FLAG]);
    if (!Number.isFinite(dc) || dc <= 0) continue;
    out.push({ id: String(e.id ?? e._id ?? ""), dc, from: String(flags[ESCAPE_LABEL_FLAG] ?? "").trim() });
  }
  return out;
}

/**
 * The DC an Escape is rolled against, or null when nothing holds the
 * creature this way. THE HIGHEST, because one Escape against the strongest
 * hold is the attempt that frees it from all of them — the page gives one
 * Escape, not one per effect.
 */
export function escapeDCFor(held) {
  const dcs = (Array.isArray(held) ? held : []).map((h) => h.dc).filter((dc) => dc > 0);
  return dcs.length ? Math.max(...dcs) : null;
}

/** Does this Escape degree break free? The action's own two: Success and Critical (and better). */
export function escapeFrees(degree) {
  return ["heroic", "critical", "success"].includes(String(degree ?? "").trim().toLowerCase());
}

/** The card line for a creature that broke out. */
export function escapedLine(name, held) {
  const from = [...new Set((held ?? []).map((h) => h.from).filter(Boolean))];
  return `<strong>${name}</strong> breaks free${from.length ? ` of ${from.join(", ")}` : ""}.`;
}
