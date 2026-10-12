/**
 * WHAT CARRIES A DECLARATION (3.631.0).
 *
 * The declared rails of 3.627.0 — death guards, after-strikes, always-on
 * Defensive Casting — read "any applied effect": a feat's transferred effect
 * is what carried them in Pillars of Faith. A Creature Codex ability is an
 * ITEM, and carries nothing on an effect, so Undead Fortitude declared on
 * the Codex entry would never have been read. One list, every reader: the
 * actor's applied effects, then its active ability items. An ability marked
 * inactive (`system.active === false`) is a note, not a rule.
 *
 * Pure.
 */
export function declarationCarriers(actor) {
  const effects = Array.from(actor?.appliedEffects ?? actor?.effects ?? []);
  const abilities = Array.from(actor?.items ?? []).filter(
    (i) => i?.type === "ability" && i?.system?.active !== false
  );
  return [...effects, ...abilities];
}
