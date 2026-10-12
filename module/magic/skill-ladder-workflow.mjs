/**
 * The Foundry side of the skill ladder (see skill-ladder.mjs).
 *
 * NEW at 3.605.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE GM SAYS WHO WAS STANDING THERE. GRAHAM'S RULING, 29 SEPT 2026.
 *
 * Shape Stone is "Range touch; Targets cube of stone 10 feet across or
 * smaller". There is no template, no area and no radius — the spell
 * targets a piece of stone the caster is touching, and nothing in the
 * scene records which creatures are standing on THAT piece rather than
 * beside it. A ten-foot cube is two squares of the grid at most, and a
 * token's position cannot tell the difference between standing on the
 * stone and standing next to it.
 *
 * So the system does not guess. The picker lists the tokens nearest the
 * caster and the GM ticks whoever is up there — honest about what the
 * system can and cannot see, which is one click in a spell that already
 * takes a deliberate action.
 *
 * NOBODY IS PRE-TICKED, for the same reason the Rune of Warding's picker
 * starts empty: the printed default is not "everyone nearby", and a
 * Continue nobody read should knock nobody over.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ORDERED BY DISTANCE, AND NOT FILTERED BY ONE.
 *
 * The obvious move is to offer only tokens within some radius of the
 * caster. The book gives no radius — it gives a cube of stone whose size
 * the caster chose — so any number here would be invented, and an invented
 * number that HIDES a creature from the list is worse than a long list: a
 * GM can ignore a name, but cannot tick one that was never offered.
 *
 * So every token on the scene is offered, nearest first, and the caster's
 * own is left out because a caster touching the stone is not standing on
 * it being reshaped.
 */

import {
  skillLadderOutcome, skillLadderLabels, skillLadderOpeningLine,
  skillLadderNobodyLine, skillLadderResultLine, skillLadderJudgedLine
} from "./skill-ladder.mjs";
import { SKILLS } from "../config.mjs";

const text = (v) => String(v ?? "").trim();

/**
 * The tokens a GM might mean, nearest the caster first.
 *
 * PURE ENOUGH TO DRIVE: takes the list and the centre, not the canvas.
 */
export function bystanderCandidates(tokens, casterTokenId, centre) {
  const list = (Array.isArray(tokens) ? tokens : [])
    .filter((t) => t && t.id !== casterTokenId && t.actor);
  if (!centre) return list;
  const distance = (t) => {
    const x = Number(t.x ?? 0) - Number(centre.x ?? 0);
    const y = Number(t.y ?? 0) - Number(centre.y ?? 0);
    return Math.sqrt((x * x) + (y * y));
  };
  return [...list].sort((a, b) => distance(a) - distance(b));
}

/**
 * Ask which of them were standing on it.
 *
 * NOT EXPORTED. Nothing outside this file asks the question — the ratchet
 * on uncalled exports caught it exported for no reason, which is how a
 * "well-tested opinion" starts. `bystanderCandidates` above IS exported,
 * because the harness drives it directly.
 */
async function promptBystanders(spellName, candidates, spec = null) {
  const list = Array.isArray(candidates) ? candidates : [];
  if (!list.length) return [];
  const rows = list.map((t) => `<label style="display:block"><input type="checkbox" `
    + `name="bystander" value="${t.uuid}"> ${t.name}</label>`).join("");
  // THE WORDS ARE THE SPELL'S (3.606.0). Shape Stone's are the default;
  // Shroud's picker asks a different question — who is resisting — and a
  // dialog titled "Who is standing on it?" over a list of shroud targets
  // would be asking the GM the wrong thing.
  const targetsMode = spec?.candidates === "targets";
  const title = targetsMode ? `${spellName} — Who resists?` : `${spellName} — Who is standing on it?`;
  const hint = spec?.prompt || (targetsMode
    ? "Tick any target that is UNWILLING; each rolls to avoid it. Anyone left unticked accepts it."
    : "The system cannot see which creatures are on the stone rather than beside it. Tick "
      + "whoever is up there; each rolls to keep their balance.");
  try {
    const picked = await foundry.applications.api.DialogV2.wait({
      window: { title },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">${hint}</p>`
        + `<form>${rows}</form></div>`,
      buttons: [
        {
          action: "ok", label: targetsMode ? "Continue" : "Shape it", default: true,
          callback: (_event, button) => {
            const form = button.form ?? button.closest?.("form")
              ?? button.parentElement?.querySelector?.("form");
            if (!form) return [];
            return Array.from(form.querySelectorAll("input[name=bystander]:checked"))
              .map((el) => text(el.value)).filter(Boolean);
          }
        },
        { action: "cancel", label: targetsMode ? "All willing" : "Nobody", icon: "fa-solid fa-xmark" }
      ],
      rejectClose: false
    });
    return Array.isArray(picked) ? picked.map(text).filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Roll the ladder for each creature the GM named, and apply what it says.
 *
 * THE CHECK IS A REAL SKILL CHECK, built the way the character sheet
 * builds one — `skill.checkModifiers` when the actor has them, the skill's
 * own total otherwise — so a creature's conditionals, auras and item
 * bonuses all reach a roll the spell forced. A bare `1d20 + total` would
 * have been a different, quieter number.
 */
export async function resolveSkillLadder(spell, spec, { dc, lines = [], casterToken = null, targets = [] } = {}) {
  /*
   * WHO IS OFFERED (3.606.0). Shape Stone offers every token on the scene,
   * nearest first; a ladder aimed at the cast's own targets offers those
   * and nobody else, because Shroud's check belongs to the creature the
   * shroud was cast on.
   */
  const targetsMode = spec.candidates === "targets";
  const targetTokens = targetsMode
    ? (Array.isArray(targets) ? targets : [])
      .map((a) => a?.getActiveTokens?.()[0]?.document ?? null).filter(Boolean)
    : null;
  const scene = casterToken?.parent ?? canvas?.scene ?? null;
  const centre = casterToken ? { x: casterToken.x, y: casterToken.y } : null;
  const candidates = targetsMode
    ? targetTokens
    : bystanderCandidates(Array.from(scene?.tokens ?? []), casterToken?.id ?? null, centre);
  const chosen = await promptBystanders(spell.name, candidates, spec);

  // THE WILLING, IN TARGETS MODE, ARE EVERY TARGET NOBODY TICKED. They
  // are not asked to roll; they take the spell as cast.
  const governed = [];
  if (targetsMode) {
    for (const actor of Array.isArray(targets) ? targets : []) {
      const uuid = actor?.getActiveTokens?.()[0]?.document?.uuid ?? null;
      if (!uuid || !chosen.includes(uuid)) governed.push({ actor, resisted: false, outcome: null });
    }
  }

  if (!chosen.length) {
    lines.push(skillLadderNobodyLine(spell.name, spec));
    return { rolled: [], governed };
  }

  const actors = [];
  for (const uuid of chosen) {
    const doc = await fromUuid(uuid).catch(() => null);
    const actor = doc?.actor ?? null;
    if (actor) actors.push(actor);
  }
  lines.push(skillLadderOpeningLine(spell.name, spec, dc, actors.map((a) => a.name)));

  const { TRGCheck } = await import("../dice/check.mjs");
  const { applyConditionTags } = await import("../combat/effect-application-workflow.mjs");
  const rolled = [];
  for (const actor of actors) {
    // THE BEST OF THE OFFERED SKILLS. Web prints "an Athletics or
    // Acrobatics check" and Transmute Rock & Mud "a Reflex saving throw or
    // an Acrobatics check" — a choice the creature makes, and a creature
    // choosing badly on purpose is not a rule anybody plays. Shape Stone
    // offers one, so this picks it.
    let best = spec.skills[0];
    for (const key of spec.skills) {
      const a = Number(actor.system?.skills?.[key]?.total ?? 0);
      const b = Number(actor.system?.skills?.[best]?.total ?? 0);
      if (a > b) best = key;
    }
    const skill = actor.system?.skills?.[best] ?? null;
    const label = SKILLS[best]?.label ?? best;
    const check = await TRGCheck.roll({
      actor,
      label: `${label} Check`,
      subtitle: `${spell.name} — ${spec.purpose || "to keep their balance"}`,
      type: "skill",
      subject: best,
      dc,
      modifiers: skill?.checkModifiers ?? [
        { label: `${label} bonus`, value: Number(skill?.total ?? 0), type: "untyped" }
      ]
    });
    const degree = check?.outcome?.degree?.key ?? "failure";
    const outcome = skillLadderOutcome(spec, degree);
    if (outcome.conditions.length) {
      await applyConditionTags(actor, outcome.conditions.map((c) => ({
        key: c.key, label: c.key.charAt(0).toUpperCase() + c.key.slice(1),
        value: c.value || undefined
      })), {});
    }
    lines.push(skillLadderResultLine(
      actor.name, spec, outcome, check?.outcome?.total ?? "—", dc));
    rolled.push({ actor: actor.name, degree, at: outcome.at });
    governed.push({ actor, resisted: true, outcome });
  }
  lines.push(skillLadderJudgedLine(spec));
  return { rolled, governed };
}
