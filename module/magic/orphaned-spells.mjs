/**
 * A PANEL ROW WITH NOTHING BEHIND IT.
 *
 * NEW at 3.511.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE OLDEST OPEN ITEM IN THIS PROJECT, AND IT WAS NEVER A BUG.
 *
 * A sustained spell's registry entry deliberately gets no clock.
 * `cast-workflow.mjs` says why, and the refusal is right: 42 of the 52
 * sustained spells print a cap — "Bless, Sustained (1 minute)" — and
 * stamping that cap here would decide that Bless STOPS at a minute even
 * while its caster keeps sustaining it. That is a rules change with a
 * 42-spell blast radius, and the code refused to make it on its own.
 *
 * So two things could end such a row and out of combat neither fires:
 * `sweepSustainedLapses` needs a round to count, and there is no stamp
 * for `sweepActiveSpellExpiry` to read. The row stays.
 *
 * ─────────────────────────────────────────────────────────────────────
 * GRAHAM'S RULING, 7 September 2026: end the row when its effects are
 * gone. No new clock, and no decision about what a sustained spell DOES
 * — only about a panel showing something with nothing behind it.
 *
 * Bless cast out of combat: its effects already expire at the printed
 * minute, on `spellEffectEnd`. The row now goes with them. Mage Hand,
 * which prints no cap and expires nothing, is untouched — because
 * nothing says it should end.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THREE GUARDS, AND EACH ONE IS A SPELL THIS WOULD OTHERWISE HAVE ENDED
 * ON ITS FIRST ROUND. They are the whole reason this is a declared rule
 * rather than one line in a sweep.
 */

/**
 * Has this entry lost everything it applied?
 *
 * @param {object} entry an active-spell registry entry
 * @param {boolean} carriesCastId whether any actor it touched still holds
 *   an effect or an `endsWithSpell` item stamped with this entry's id
 * @returns {boolean}
 */
export function spellIsOrphaned(entry, carriesCastId) {
  if (!entry?.id) return false;

  // A LOCKED SPELL IS NOT ITS EFFECTS. "Until your next daily
  // preparations" locks PP, and the lock is the row's own reason to
  // exist — the PP stays held whether or not anything is still buffed.
  // Sweeping one would hand the caster their points back early.
  if (entry.lock) return false;

  // AN EMANATION HAS NOBODY IN IT BETWEEN VISITORS. Protective Ward
  // gives its bonus to whoever walks inside; with the area momentarily
  // empty it carries no effects at all, and ending it then would delete
  // a ward that is still standing. Its own stamped clock ends it.
  if (entry.emanation) return false;

  // A SPELL THAT APPLIED NOTHING NEVER LOST ANYTHING. A composition
  // whose whole trace is a conviction point, a summon, a spell that
  // grants only a card line — all register with an empty target list,
  // and every one of them would look orphaned from the moment it was
  // cast. `targets` is drawn up at the cast from what the effects
  // actually landed on, so an empty list means there was never anything
  // to lose.
  if (!Array.isArray(entry.targets) || !entry.targets.length) return false;

  return !carriesCastId;
}

/**
 * The line the caster is told, so the row does not simply vanish.
 *
 * SAID OUT LOUD, the position every sweep in this system takes. A row
 * disappearing between glances at the panel is indistinguishable from a
 * bug, and this one ends spells that the table may still think are
 * running.
 */
export function orphanedSpellLine(name) {
  return `<strong>${name}</strong> ends — nothing it applied is left.`;
}
