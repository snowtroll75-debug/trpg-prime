/**
 * A familiar's derivation — the half that has to touch `system`.
 *
 * Kept out of documents/actor.mjs for the reason class-derive.mjs is:
 * actor.mjs extends the Foundry `Actor` global at module scope and
 * cannot be imported outside a live world, so anything living there can
 * only ever be grepped. These functions take a plain `system` object and
 * can be RUN (lesson 2).
 *
 * WHAT THIS DOES, IN ONE SENTENCE: it swaps a familiar's class
 * progression for a snapshot of its master's, so that every downstream
 * rule in the system — saves, BAB, BDB, the tooltips that name them —
 * produces the master's numbers without knowing familiars exist.
 */

import {
  familiarMaxHP, familiarProgression, hasFamiliarAbility
} from "./familiar.mjs";

/**
 * Put the master's class-table numbers where the class's would go.
 *
 * MUST RUN IMMEDIATELY AFTER `prepareClassProgression` and before
 * anything that reads `system.progression` — which is conditions (they
 * read the saves), attributes, resources and the whole of prepareCombat.
 * Running it a line late would leave a familiar deriving from a class
 * item it does not have, which is to say from null, which is to say from
 * the manual fields: every save at just its own ability modifier, and no
 * BAB at all.
 *
 * Graham's ruling (2026-08-10), and the reason this is a progression
 * substitution rather than a copy of the master's totals: "it uses the
 * characters base values, modified by its own ability scores". The
 * class-table base is what goes in; the familiar's own Con, Dex and Wis
 * are added by the ordinary save derivation on top.
 */
export function prepareFamiliarProgression(system) {
  const mirror = system?.familiar?.mirror;
  if (!mirror) return;
  system.progression = familiarProgression(mirror);
  // The class-table columns prepareCombat reads for BAB and BDB. They
  // are set from `progression` for a character too; set here as well
  // rather than relying on ordering, because a familiar has no class
  // item and the code that normally fills them is keyed to one.
  if (system.combat) {
    system.combat.classTableBAB = Number(mirror.bab) || 0;
    system.combat.classTableBDB = Number(mirror.bdb) || 0;
  }
}

/**
 * "A familiar develops no skill ranks of its own, but instead has an
 * amount of ranks equal to any you develop in each skill. Furthermore, a
 * familiar also gains any class bonuses that you have to skills."
 *
 * Both halves, and the second is the one worth spelling out: a class
 * SKILL is what earns the class bonus in this system, so mirroring the
 * master's `classSkill` flags is what "gains any class bonuses that you
 * have to skills" actually means mechanically. The bonus itself is then
 * applied by the ordinary class-skill path.
 *
 * The third sentence — "a familiar can only use a skill if it would be
 * physically possible to do so with its form" — is deliberately NOT
 * implemented. It is a GM adjudication about a form the system does not
 * model (the book is explicit that the form "has little bearing"), and
 * inventing a list of which skills an owl may attempt would be inventing
 * rules. It is on the sheet as a note instead.
 */
export function prepareFamiliarSkills(system) {
  const mirrored = system?.familiar?.mirror?.skills;
  if (!mirrored || !system?.skills) return;
  for (const [key, skill] of Object.entries(system.skills)) {
    const source = mirrored[key];
    if (!source) continue;
    skill.ranks = Math.max(0, Math.floor(Number(source.ranks) || 0));
    skill.classSkill = Boolean(source.classSkill);
  }
}

/**
 * "A familiar has an amount of hit points equal to half of your
 * characters (round up)."
 *
 * Replaces the derived maximum outright rather than adjusting it. The
 * ordinary formula is size base + Con per level + class HP per level,
 * and every one of those three terms is wrong for a familiar: it would
 * give a Tiny creature 10 + 0 + 0 = 10 hit points at every level
 * regardless of whose familiar it is.
 *
 * Runs AFTER prepareResources, so it overwrites a computed value; that
 * is the point, and it is why this is a separate exported function
 * rather than a branch inside the formula.
 */
export function prepareFamiliarHitPoints(system, abilityNames = []) {
  const mirror = system?.familiar?.mirror;
  const hp = system?.resources?.hp;
  if (!mirror || !hp) return;
  hp.max = familiarMaxHP({
    masterMaxHP: mirror.maxHP,
    level: system.identity?.level ?? 1,
    hasTough: hasFamiliarAbility(abilityNames, "Tough")
  });
}

/**
 * "A familiar gains a special +2 racial bonus to any saving throws made
 * to resist magic", and Resilience's "+2 racial bonus to all Saving
 * Throws".
 *
 * The first is CONDITIONAL — it applies only against magic — so it is
 * not pooled here at all. It is an authored conditional on the familiar
 * class item instead, which puts it in the check dialog as a row the
 * player ticks when the save is against a spell. Pooling it would give a
 * familiar +2 against a pit trap.
 *
 * Resilience is unconditional and is pooled, typed `racial` exactly as
 * the book words it.
 */
export function familiarSaveEntries(abilityNames = []) {
  if (!hasFamiliarAbility(abilityNames, "Resilience")) return {};
  const entry = { label: "Resilience", value: 2, type: "race", source: "familiarAbility" };
  return {
    "system.combat.saves.fortitude": [entry],
    "system.combat.saves.reflex": [entry],
    "system.combat.saves.will": [entry]
  };
}
