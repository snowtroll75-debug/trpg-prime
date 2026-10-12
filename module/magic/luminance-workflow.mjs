/**
 * Luminance — the Foundry half: the turn-start heal, and the Sustain
 * that chooses what to grow.
 *
 * NEW at 3.435.0. See magic/luminance.mjs for the rules and for Graham's
 * four rulings of 29 August 2026.
 *
 * ─────────────────────────────────────────────────────────────────────
 * IT HANGS OFF THE TURN CLOCK, NOT THE MOVEMENT SWEEP.
 *
 * Every other live emanation is reconciled when a token moves, because
 * every other one asks "are you inside right now". Luminance asks "did
 * you BEGIN YOUR TURN inside", which movement cannot answer — so this is
 * called from the turn-start pass in documents/combat.mjs, beside the
 * expiry sweep, and the movement machinery never touches it.
 *
 * A creature that walks in and out between turns is therefore never
 * healed, which is what the spell says and the opposite of how the other
 * four behave.
 */

import { emanationMembers } from "./emanation.mjs";
import { normalisePerTurn, perTurnFires, perTurnReaches, perTurnHealLine } from "./per-turn.mjs";
import { luminanceChoiceRefusal, luminanceState, luminanceSustain, luminanceSustainOptions, luminanceTurnEffect, luminanceWarpedLimits } from "./luminance.mjs";
import { runningEmanations } from "./emanation-workflow.mjs";
import { getActiveSpells, setActiveSpells } from "./active-spells.mjs";
import { tokenCentreFeet } from "../creature-aura-workflow.mjs";
import { isUndead } from "../aligned.mjs";

const SYSTEM_ID = "trg-prime";

/** The per-turn rule a spell's effects declare, or null. */
function perTurnRule(emanation) {
  const rows = Array.isArray(emanation?.effects) ? emanation.effects : [];
  return rows.find((e) => String(e?.kind ?? "") === "perTurn") ?? null;
}

/**
 * Heal (or burn) one creature that has just begun its turn inside a
 * per-turn emanation.
 *
 * ROLLED ONCE PER CREATURE PER TURN, and the roll is real: the formula
 * grows with the Sustains the caster has spent, so a card that printed a
 * flat 1d8 would be lying by the second round.
 *
 * @param {Actor} actor the creature whose turn is starting
 * @param {Token} token its token
 * @returns {Promise<string[]>} lines for the turn card
 */
/**
 * A per-turn emanation that resolves for the WHOLE CIRCLE on its
 * caster's turn.
 *
 * NEW at 3.461.0 for Aura of Vitality — see magic/per-turn.mjs for
 * Graham's ruling and for why this is a separate shape rather than a
 * flag inside the one below.
 *
 * ONLY ON THE CASTER'S TURN. `perTurnFires` is asked rather than
 * re-derived here, so the rule lives in the pure file where a harness
 * can drive it and this function only carries out the answer.
 *
 * @param {object} record a running emanation
 * @param {object} spec the normalised per-turn row
 * @param {Actor} actor the creature whose turn is beginning
 * @param {Token} token its token
 * @returns {Promise<string[]>}
 */
async function applyCasterTurnEmanation(record, spec, actor, token) {
  const lines = [];
  const isCaster = record.token?.id === token.id;
  if (!perTurnFires(spec, { isCaster })) return lines;

  // EVERY MEMBER, ASKED OF THE SAME FUNCTION THE SELF PATH USES. The
  // emanation's own `mode` decides whether that means allies, enemies or
  // everyone, so "each ally" is the pack entry's word rather than an
  // assumption made here.
  const subjects = (canvas?.tokens?.placeables ?? []).map((t) => ({
    id: t.id,
    centreFeet: tokenCentreFeet(t.document),
    disposition: t.document.disposition
  }));
  const inside = emanationMembers({
    centreFeet: tokenCentreFeet(record.token.document),
    radiusFeet: record.emanation.radiusFeet,
    subjects,
    casterDisposition: record.token.document.disposition,
    mode: record.emanation.mode
  });
  if (!inside.length) return lines;

  // `emanationMembers` RETURNS IDS, NOT SUBJECTS (fixed 3.464.0).
  //
  // 3.461.0 wrote `for (const member of inside)` and then
  // `member.id` — reading the shape it PASSED IN rather than the shape it
  // got back. `inside` is `["C87n…", "gexS…", …]`, so `member.id` was
  // undefined for every member, `memberToken` was undefined, and all five
  // creatures hit `if (!target) continue`. Zero lines, no error, no card:
  // Aura Of Vitality healed nobody for THREE releases while every part of
  // it measured correct.
  //
  // NOTHING CAUGHT IT BECAUSE NOTHING ELSE DEREFERENCES A MEMBER. The
  // Luminance path below this asks `inside.length` and never looks
  // inside, so the shape had no second reader to disagree with. And
  // driving it could not catch it either: a silent `continue` and an
  // empty return look exactly like an emanation that legitimately caught
  // nobody — which is what I spent two releases assuming it was.
  for (const memberId of inside) {
    const memberToken = canvas.tokens.placeables.find((t) => t.id === memberId);
    const target = memberToken?.actor;
    if (!target) continue;

    // ONE ROLL PER CREATURE, because a single roll shared across the
    // circle would print the same number for everybody and hide the
    // variance the dice are there to produce — the reason hazardous
    // terrain rolls per square.
    const roll = await new Roll(spec.formula).evaluate();
    const amount = Math.max(0, roll.total);

    const hp = target.system?.resources?.hp ?? {};
    const beforeHP = Number(hp.value) || 0;
    const max = Number(hp.max) || 0;
    const healed = Math.min(amount, Math.max(0, max - beforeHP));
    if (healed > 0) await target.update({ "system.resources.hp.value": beforeHP + healed });

    let bleedNote = "";
    if (spec.bleedRemoved > 0) {
      const current = Number(target.getConditionValue?.("bleeding") ?? 0);
      if (current > 0) {
        const next = Math.max(0, current - spec.bleedRemoved);
        await target.toggleStatusEffect("bleeding", { active: next > 0, value: next || undefined });
        bleedNote = ` Bleeding <strong>${current}</strong> &rarr; <strong>${next}</strong>.`;
      }
    }

    lines.push(perTurnHealLine(
      record.emanation.name, target.name, healed, spec.formula, amount, bleedNote));
  }
  return lines;
}

export async function applyPerTurnEmanations(actor, token) {
  const lines = [];
  if (!actor || !token) return lines;

  for (const record of runningEmanations()) {
    const rule = perTurnRule(record.emanation);
    if (!rule) continue;

    // A ROW THAT FIRES ON THE CASTER'S TURN IS A DIFFERENT SHAPE (3.461.0).
    //
    // Graham's ruling of 1 September 2026 on Aura of Vitality: "at the
    // beginning of your turn, EACH ALLY within the radius is healed" —
    // one moment each round for the whole circle, rather than each
    // creature on its own turn. Luminance keeps the behaviour it has had
    // since August, because "all creatures that begin their turn in the
    // radius" is its own printed sentence and `on` defaults to `self`.
    //
    // HANDLED FIRST AND `continue`d, so the Luminance path below is
    // reached only by rows that mean what it does. Folding a
    // whole-circle sweep into a function shaped around one creature
    // would have been two rules in one loop.
    const general = normalisePerTurn(rule);
    if (general && perTurnReaches(general) === "all") {
      lines.push(...await applyCasterTurnEmanation(record, general, actor, token));
      continue;
    }

    const inside = emanationMembers({
      centreFeet: tokenCentreFeet(record.token.document),
      radiusFeet: record.emanation.radiusFeet,
      subjects: [{
        id: token.id,
        centreFeet: tokenCentreFeet(token.document),
        disposition: token.document.disposition
      }],
      casterDisposition: record.token.document.disposition,
      mode: record.emanation.mode
    });
    if (!inside.length) continue;

    const state = luminanceState(record.entry?.luminance, record.emanation.maxDice);
    const undead = isUndead(actor.system);
    const effect = luminanceTurnEffect({ state, undead });

    const roll = await new Roll(effect.formula).evaluate();
    const amount = Math.max(0, roll.total);

    if (effect.mode === "damage") {
      // A DAMAGE PACKET, not a negative heal — so resistances and
      // immunities to essence apply, which a subtraction would skip.
      const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
      const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
      const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
      const packet = resolveAgainstDefences(actor.system ?? {}, {
        amount, type: effect.damageType, creatureTypeSystem: ownedCreatureTypeSystem(actor),
        // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
        // Luminance emanates over a radius, so it is area damage.
        magical: true,
        area: true
      });
      if (packet.taken > 0) await applyDamageAndCheckDying(actor, packet.taken);
      // WHAT LANDED, AND WHAT WAS ROLLED — the same shape the heal line
      // below uses, and for the same reason. A creature immune to
      // essence prints "0 essence damage", and without the roll beside
      // it a GM cannot tell an immunity from a bad die. Driven on 29
      // August 2026 against an undead made immune to essence: the packet
      // came back 0 from a 5d8 that rolled 27.
      lines.push(`<strong>${record.emanation.name}</strong>: positive energy sears the undead — `
        + `<strong>${packet.taken}</strong> ${effect.damageType} damage `
        + `(${effect.formula} rolled ${amount}${packet.taken < amount ? " — reduced by its defences" : ""}).`);
      continue;
    }

    const hp = actor.system?.resources?.hp ?? {};
    const before = Number(hp.value) || 0;
    const max = Number(hp.max) || 0;
    const healed = Math.min(amount, Math.max(0, max - before));
    if (healed > 0) await actor.update({ "system.resources.hp.value": before + healed });

    let bleedNote = "";
    if (effect.bleedRemoved > 0) {
      const current = Number(actor.getConditionValue?.("bleeding") ?? 0);
      if (current > 0) {
        const next = Math.max(0, current - effect.bleedRemoved);
        await actor.toggleStatusEffect("bleeding", { active: next > 0, value: next || undefined });
        bleedNote = ` Bleeding <strong>${current}</strong> &rarr; <strong>${next}</strong>.`;
      }
    }

    // WHAT ACTUALLY HAPPENED, not what was rolled. A creature at full
    // health is healed of nothing, and saying "healed 6" over an
    // unchanged HP bar is the card lying — the lesson Song Of Despair's
    // recovery line taught on 28 August 2026.
    lines.push(`<strong>${record.emanation.name}</strong>: `
      + (healed > 0
        ? `healed <strong>${healed}</strong> HP (${effect.formula} rolled ${amount}).`
        : `already at full health — no healing (${effect.formula} rolled ${amount}).`)
      + bleedNote);
  }
  return lines;
}

/**
 * The Sustain picker for a spell that declares choices.
 *
 * Returns null when the spell declares none, which is every spell but
 * this one — so the sustain path asks unconditionally and this answers
 * for itself.
 */
export async function promptLuminanceChoice(actor, entry) {
  const choices = Array.isArray(entry?.emanation?.sustainChoices)
    ? entry.emanation.sustainChoices : [];
  if (!choices.length) return null;

  const state = luminanceState(entry.luminance, entry.emanation?.maxDice);
  const options = luminanceSustainOptions(state);
  const { DialogV2 } = foundry.applications.api;
  const rows = options
    .map((o, i) => `<label style="display:flex;align-items:center;gap:8px;padding:2px 0${o.available ? "" : ";opacity:.5"}">
        <input type="radio" name="choice" value="${o.key}" ${i === 0 && o.available ? "checked" : ""} ${o.available ? "" : "disabled"}>
        <span>${o.label}</span></label>`)
    .join("");

  const picked = await DialogV2.wait({
    window: { title: `Sustain ${entry.name}`, icon: "fa-solid fa-sun" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">What does this Sustain buy?</p>${rows}</div>`,
    buttons: [
      {
        action: "confirm", label: "Sustain", icon: "fa-solid fa-sun", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.choice;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!picked || picked === "cancel") return null;
  return String(picked);
}

/**
 * Why the chosen option would buy nothing, or null.
 *
 * READS THE ENTRY, so the sustain path can ask without knowing anything
 * about this spell's state shape.
 */
export function luminanceRefusal(entry, choice, name = "This spell") {
  const choices = Array.isArray(entry?.emanation?.sustainChoices)
    ? entry.emanation.sustainChoices : [];
  if (!choices.length) return null;
  return luminanceChoiceRefusal(
    luminanceState(entry.luminance, entry.emanation?.maxDice), choice, name);
}

/**
 * Spend one Sustain on the chosen growth and record it.
 *
 * WRITTEN ON THE ACTIVE-SPELL ENTRY, beside the emanation descriptor,
 * because it is a fact about THIS CASTING that changes over its life —
 * the same reasoning `growEmanation` records for Protective Ward's
 * radius.
 *
 * @returns {Promise<{changed: boolean, note: string}|null>}
 */
export async function sustainLuminance(actor, castId, choice) {
  const entries = getActiveSpells(actor);
  const entry = entries.find((e) => e.id === castId);
  if (!entry || !Array.isArray(entry.emanation?.sustainChoices) || !entry.emanation.sustainChoices.length) {
    return null;
  }
  const state = luminanceState(entry.luminance, entry.emanation?.maxDice);
  const result = luminanceSustain(state, choice);
  if (result.changed) {
    entry.luminance = {
      healingDice: result.state.healingDice,
      bleedRemoved: result.state.bleedRemoved
    };
    await setActiveSpells(actor, entries);
  }
  return { changed: result.changed, note: result.note };
}

/** The dice and cap a casting starts with, after its warps. */
export function luminanceOpeningState(warpMods) {
  const { startingDice, maxDice } = luminanceWarpedLimits(warpMods);
  return { luminance: { healingDice: startingDice, bleedRemoved: 0 }, maxDice };
}
