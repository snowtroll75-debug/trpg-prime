/**
 * Vibrant Thorns against real documents.
 *
 * NEW at 3.440.0. The Foundry half of `thorns.mjs`, kept apart so the
 * rule stays importable by the harness — the split this project has now
 * paid for eight times.
 */

import {
  THORNS_FLAG, normaliseThorns, thornsTriggered, thornsIntensified, thornsFormula,
  thornsSaveNote, thornsSaveMultiplier, thornsLadderRows,
  intensifiesThorns
} from "./thorns.mjs";

const SYSTEM_ID = "trg-prime";
const STAMP = "thornsIntensifiedRound";

/** Every live thorns effect on this creature, with the effect carrying it. */
function thornsOn(actor) {
  const out = [];
  // APPLIED EFFECTS (3.640.0): a creature ability's transferred effect
  // stays on its item in V12+, and the Aroch's Reactive Slime is one.
  for (const effect of actor?.appliedEffects ?? actor?.effects ?? []) {
    if (effect.disabled) continue;
    const spec = normaliseThorns(effect.flags?.[SYSTEM_ID]?.[THORNS_FLAG]);
    if (spec) out.push({ effect, spec });
  }
  return out;
}

/**
 * The thorns' answer to a blow that has just landed on their owner.
 *
 * CALLED FROM THE DAMAGE STEP, beside the Vicious rune's feedback, which
 * is the nearest existing shape: a packet resolved against the person
 * who swung rather than the person who was hit.
 *
 * @param {Actor} attacker the creature that struck
 * @param {Actor} defender the creature wearing the thorns
 * @param {object} blow {melee, unarmed, distanceFeet}
 * @returns {Promise<string[]>} lines for the damage card
 */
export async function applyThorns(attacker, defender, blow = {}) {
  const lines = [];
  if (!attacker || !defender) return lines;

  const round = game.combat?.started ? Number(game.combat.round ?? 0) : null;
  for (const { effect, spec } of thornsOn(defender)) {
    if (!thornsTriggered(spec, { ...blow, hit: true })) continue;

    const intensified = thornsIntensified(spec, {
      stampedRound: effect.flags?.[SYSTEM_ID]?.[STAMP] ?? null,
      currentRound: round
    });
    const formula = thornsFormula(spec, intensified);
    if (!formula && !spec.ladder) continue;

    // A REACTION (3.640.0): spent from the defender's pool; with none left
    // in combat, nothing happens.
    if (spec.reaction && game.combat?.started && game.combat.combatants?.some?.((c) => c.actor?.id === defender.id)) {
      const left = Number(defender.system?.resources?.reactions?.value ?? 0);
      if (left <= 0) { lines.push(`<em>${spec.label}: ${defender.name} has no reaction left this round.</em>`); continue; }
      const { spendReaction } = await import("../combat/action-points-workflow.mjs");
      await spendReaction(defender, spec.label);
    }
    // A CONDITION LADDER IN PLACE OF DAMAGE (3.685.0, H1; Prismatic Guard):
    // the attacker rolls the save, and its rung's rows land on it through the
    // spell engine — "as soon as the attack has been resolved".
    if (spec.ladder && !spec.damage) {
      lines.push(...await applyThornsLadder(attacker, defender, spec));
      continue;
    }
    let roll = await new Roll(formula).evaluate();
    // A ROLLED SAVE (3.640.0): the attacker saves; basic, so a success
    // halves and a failure adds the critical's dice — unless the save only
    // avoids the critical.
    let saveLine = "";
    let rolledTotal = roll.total;
    const rawTotal = roll.total;
    if (spec.saveRoll) {
      const { TRGCheck } = await import("../dice/check.mjs");
      const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
      const { basicSavingThrow, levelDC } = await import("../dice/resolution.mjs");
      const dc = thornsSaveDC(spec, defender, levelDC);
      const key = spec.saveRoll.key;
      const check = await TRGCheck.roll(withCheckModifiers({ actor: attacker, label: `${attacker.name} — ${key.charAt(0).toUpperCase()}${key.slice(1)} Save`, subtitle: `${spec.label} — DC ${dc}`, type: "save", save: key, dc }));
      const degree = check?.outcome?.degree?.key ?? "failure";
      const bs = spec.saveRoll.basic ? basicSavingThrow(degree, check?.outcome?.margin ?? null) : { damageMultiplier: check?.outcome?.degree?.success ? 0 : 1, bonusBaseDamage: 0 };
      if (bs.bonusBaseDamage > 0) {
        const die = /d(\d+)/i.exec(formula)?.[1] ?? "6";
        rolledTotal += (await new Roll(`${bs.bonusBaseDamage}d${die}`).evaluate()).total;
      }
      const mult = thornsSaveMultiplier(spec, bs.damageMultiplier);
      rolledTotal = Math.floor(rolledTotal * mult);
      saveLine = ` — ${attacker.name}'s ${key} save: ${check?.outcome?.degree?.label ?? degree}${spec.saveRoll.avoidsCriticalOnly ? " (avoids only the critical)" : ""}`;
    }
    roll = { total: rolledTotal };
    const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
    const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
    const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

    // AGAINST THE ATTACKER'S OWN DEFENCES. A creature immune to piercing
    // walks through a briar patch unharmed, and a packet that skipped
    // this would be the one place in the system where it did not.
    // A DAMAGE REACTION, BEFORE THE DEFENCES (3.681.0; found in review).
    {
      const { spellDamageReactionsFor } = await import("../reactions/reactions-workflow.mjs");
      lines.push(...await spellDamageReactionsFor(attacker, spec.damageType, { spellName: spec?.label ?? "", source: defender }));
    }
    const packet = resolveAgainstDefences(attacker.system ?? {}, {
      amount: roll.total,
      type: spec.damageType,
      creatureTypeSystem: ownedCreatureTypeSystem(attacker),
      // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
      // A thorns reaction answers the attacker who touched the ward; it
      // has no area and makes no attack roll.
      magical: true
    });
    if (packet.taken > 0) await applyDamageAndCheckDying(attacker, packet.taken, { isCritical: false });

    // WHAT LANDED, AND WHAT WAS ROLLED. Luminance's lesson: without the
    // roll beside the result a GM cannot tell an immunity from a bad die.
    lines.push(
      `<strong>${spec.label}</strong> — ${attacker.name} takes <strong>${packet.taken}</strong> `
      + `${spec.damageType} (${formula} rolled ${rawTotal}${rawTotal !== roll.total ? `, ${roll.total} after the save` : ""}`
      + `${packet.taken !== roll.total ? ", reduced by their defences" : ""})`
      + `${intensified ? " <em>— intensified</em>" : ""}${saveLine}.`
    );
    // A SAVE THE SPELL NAMES IS PRINTED, NOT SWALLOWED — see the note on
    // `save` in thorns.mjs. Elemental Shield has one; Vibrant Thorns does
    // not, and passes an empty string that adds no line.
    const saveNote = thornsSaveNote(spec);
    if (saveNote) lines.push(`<em>${saveNote}</em>`);
  }
  return lines;
}

/**
 * THE DC A THORNS SAVE IS ROLLED AGAINST (3.685.0, H1): the row's own, which
 * for a spell's `dc: "spell"` is the cast's Save DC stamped on the effect;
 * else the defender's Level DC, as a creature ability's has always read.
 */
function thornsSaveDC(spec, defender, levelDC) {
  return Number(spec?.saveRoll?.dc) > 0
    ? Number(spec.saveRoll.dc)
    : levelDC(Math.max(0, Math.floor(Number(defender?.system?.identity?.level ?? 0) || 0)));
}

/** The ladder's half of `applyThorns` (3.685.0, H1). */
async function applyThornsLadder(attacker, defender, spec) {
  const lines = [];
  const { TRGCheck } = await import("../dice/check.mjs");
  const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
  const { levelDC } = await import("../dice/resolution.mjs");
  const dc = thornsSaveDC(spec, defender, levelDC);
  const key = spec.saveRoll.key;
  const word = `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
  const check = await TRGCheck.roll(withCheckModifiers({ actor: attacker, label: `${attacker.name} — ${word} Save`, subtitle: `${spec.label} — DC ${dc}`, type: "save", save: key, dc }));
  const degree = check?.outcome?.degree?.key ?? "failure";
  const { at, rows } = thornsLadderRows(spec, degree);
  const read = at && at !== degree ? ` (read as ${at})` : "";
  lines.push(`<strong>${spec.label}</strong> — ${attacker.name}'s ${word} save: ${check?.outcome?.degree?.label ?? degree}${read}${rows.length ? "" : " — unaffected"}.`);
  if (rows.length) {
    const { applySpellEffects } = await import("./spell-effects.mjs");
    const applied = [];
    await applySpellEffects(defender, { name: spec.spellName || spec.label, img: "", uuid: null, system: { duration: "", effects: rows } }, {
      targets: [attacker], effects: rows, lines: applied, saveDC: dc
    });
    lines.push(...applied);
  }
  return lines;
}

/**
 * Casting an essence spell sharpens the thorns.
 *
 * A ROUND STAMP, NOT A DURATION — see thorns.mjs. Written on the effect
 * that carries the thorns, so it travels and expires with them and there
 * is no second record to fall out of step.
 *
 * @returns {Promise<string[]>} a line per effect intensified
 */
export async function intensifyThorns(actor, spell) {
  const lines = [];
  if (!intensifiesThorns(spell?.system?.traits)) return lines;
  const round = game.combat?.started ? Number(game.combat.round ?? 0) : 0;
  for (const { effect, spec } of thornsOn(actor)) {
    if (!spec.intensified) continue;
    await effect.setFlag(SYSTEM_ID, STAMP, round);
    lines.push(
      `<strong>${spec.label}</strong> intensifies — <strong>${spec.intensified}</strong> `
      + `${spec.damageType} until the beginning of your next turn.`);
  }
  return lines;
}

/**
 * The caster's own turn beginning closes the window.
 *
 * Called from the turn-start pass in documents/combat.mjs, beside the
 * expiry sweep, because "until the beginning of your next turn" is a
 * question only the turn clock can answer.
 */
export async function clearThornsIntensity(actor) {
  for (const { effect } of thornsOn(actor)) {
    if (effect.flags?.[SYSTEM_ID]?.[STAMP] === undefined) continue;
    await effect.unsetFlag(SYSTEM_ID, STAMP);
  }
}
