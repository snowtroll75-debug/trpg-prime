/**
 * After-strike effects a creature declares, the Foundry half (3.627.0).
 * The rule is in declared-after-strikes.mjs; this rolls the struck
 * creature's save through TRGCheck (as a rune's after-strike does), applies
 * the degree's conditions with their own clocks, records an end-of-turn
 * escape save where one is printed, and exposes the target to a named
 * affliction at the attacker's level.
 */
import {
  EXPOSED_FLAG, declaredAfterStrikeDC, declaredAfterStrikeFires, declaredAfterStrikes, ownAfflictionItem, weaponAfterStrikes,
  declaredConditionTag, exposureBlocked, exposureKey, escalatingDrainValue, amountFormulaBySeverity } from "./declared-after-strikes.mjs";
import { afterStrikeOutcome } from "../rune-declarations.mjs";
import { levelDC } from "../dice/resolution.mjs";
import { creatureTypesOf } from "../aligned.mjs";
import { creatureTraits, actorDefences } from "../creature-traits.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";

const SYSTEM_ID = "trg-prime";
const USED_FLAG = "strikeRidersUsed";

/**
 * @param {Actor} actor the attacker
 * @param {Item} weapon
 * @param {Actor} targetActor
 * @param {{critical?: string|null}} opts the critical's severity, or null
 * @returns {Promise<string[]>} lines for the damage card
 */
export async function applyDeclaredAfterStrikes(actor, weapon, targetActor, { critical = null } = {}) {
  const lines = [];
  if (!actor || !weapon || !targetActor) return lines;
  const specs = declaredAfterStrikes(declarationCarriers(actor));
  // A WEAPON MAY CARRY ITS OWN (3.633.0, F&F 3.0 R3): "Tentacle … plus
  // Slime" is that tentacle's rider, so it fires for that weapon only.
  for (const spec of weaponAfterStrikes(weapon)) if (!specs.some((s) => s.key === spec.key)) specs.push(spec);
  if (!specs.length) return lines;
  const used = actor.getFlag?.(SYSTEM_ID, USED_FLAG) ?? {};
  const defences = actorDefences(targetActor.system ?? {}, ownedCreatureTypeSystem(targetActor));
  const ctxBase = {
    weaponName: weapon.name,
    critical: critical || null,
    criticalImmune: Boolean(defences.immunities?.has?.("critical")),
    used,
    targetTypes: creatureTypesOf(targetActor.system ?? {}),
    targetTraits: creatureTraits(targetActor.system ?? {})
  };
  const level = Math.max(0, Math.floor(Number(actor.system?.identity?.level ?? 0) || 0));
  let next = null;
  for (const spec of specs) {
    const marker = `declared:${spec.key}`;
    if (!declaredAfterStrikeFires(spec, { ...ctxBase, marker })) continue;
    if (spec.livingOnly) {
      const { isLivingCreature } = await import("../kind-targeting.mjs");
      if (!isLivingCreature(targetActor.system ?? {})) { lines.push(`<em>${spec.label}: ${targetActor.name} is not a living creature.</em>`); continue; }
    }
    if (spec.selfHeal > 0) {
      const { healActor } = await import("../magic/spell-effects.mjs");
      const healed = Number(await healActor(actor, spec.selfHeal, { magical: false })) || 0;
      lines.push(`<strong>${spec.label}</strong> — ${actor.name} is healed <strong>${healed} HP</strong>.`);
    }
    if (spec.expose) lines.push(...await exposeFromStrike(actor, targetActor, spec, level));
    if (spec.save) lines.push(...await rollDeclaredSave(actor, targetActor, spec, level, critical));
    if (spec.dispel) lines.push(...await dispelFromStrike(actor, targetActor, spec, level));
    if (spec.oncePerRound) next = { ...(next ?? used), [marker]: true };
  }
  if (next && actor.setFlag) await actor.setFlag(SYSTEM_ID, USED_FLAG, next);
  return lines;
}

async function rollDeclaredSave(actor, targetActor, spec, level, severity) {
  const lines = [];
  const save = spec.save;
  const dc = declaredAfterStrikeDC(spec, levelDC(level), severity);
  const raised = dc - levelDC(level);
  const { TRGCheck } = await import("../dice/check.mjs");
  const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
  const check = await TRGCheck.roll(withCheckModifiers({
    actor: targetActor,
    label: `${targetActor.name} — ${save.charAt(0).toUpperCase()}${save.slice(1)} Save`,
    subtitle: `${spec.label} — against ${actor.name}'s Level DC ${dc}${raised ? ` (${severity} injury, +${raised})` : ""}`,
    type: "save",
    save,
    dc
  }));
  const degree = check?.outcome?.degree?.key ?? "failure";
  const outcome = afterStrikeOutcome(spec, degree);
  const label = check?.outcome?.degree?.label ?? degree;
  lines.push(`<strong>${spec.label}</strong> — ${targetActor.name} rolls ${save} against DC ${dc}: <strong>${label}</strong>.${outcome.text ? ` ${outcome.text}` : ""}`);
  // A FAILED SAVE'S OWN AMOUNT (3.631.0): Life Drain escalates per target;
  // Shadow Hand rolls a die by the critical's severity ("a minimum of a
  // success" — a Partial fails it).
  const failed = !check?.outcome?.degree?.success;
  if (failed && (spec.drain || spec.amountBySeverity)) {
    let value = 0; let note = "";
    if (spec.drain) {
      const record = targetActor.getFlag?.(SYSTEM_ID, "drainedBy") ?? {};
      const k = String(actor.uuid).replace(/\./g, "_");
      const esc = escalatingDrainValue(spec.drain, record[k]);
      value = esc.value; note = esc.hits > 1 ? ` (${esc.hits - 1} earlier drain(s) by ${actor.name})` : "";
      if (targetActor.setFlag) await targetActor.setFlag(SYSTEM_ID, "drainedBy", { ...record, [k]: esc.hits });
    } else {
      const formula = amountFormulaBySeverity(spec, severity);
      if (formula) { const r = await new Roll(formula).evaluate(); value = r.total; note = ` (${formula}${["serious", "deadly"].includes(String(severity).toLowerCase()) ? `, ${severity}` : ""})`; }
    }
    if (value > 0) {
      const key = spec.drain?.key ?? spec.amountBySeverity?.key ?? "soulDrain";
      const { applyConditionTags, formatAppliedTags } = await import("./effect-application-workflow.mjs");
      const { relayConditionTags } = await import("./target-relay-workflow.mjs");
      const { conditionLabel } = await import("../conditions/condition-rules.mjs");
      const tags = [{ key, value, label: conditionLabel(key) }];
      const applied = await relayConditionTags(targetActor, tags, {}, () => applyConditionTags(targetActor, tags, {}));
      lines.push(`Applied to ${targetActor.name}: ${formatAppliedTags(applied)}${note}.`);
    }
  }
  if (!outcome.conditions.length) return lines;
  const { applyConditionTags, formatAppliedTags } = await import("./effect-application-workflow.mjs");
  const { relayConditionTags } = await import("./target-relay-workflow.mjs");
  const { conditionLabel } = await import("../conditions/condition-rules.mjs");
  const clock = { combatRound: game.combat?.started ? Number(game.combat.round ?? 0) : null, worldTime: Number(game.time?.worldTime ?? 0) };
  // "MAY ATTEMPT A NEW SAVE AT THE END OF EACH OF ITS TURNS TO END" — the
  // core's escape-save rail (magic/condition-save.mjs), at the same DC,
  // carried ON THE TAG so it is stamped wherever the condition lands (the
  // GM's client, for a player's strike on the GM's creature).
  const tags = outcome.conditions.map((row) => {
    const { resave, ...tag } = declaredConditionTag(row, clock);
    return { ...tag, label: conditionLabel(row.key), ...(resave ? { conditionSave: { save, onSuccess: "end", label: spec.label, saveDC: dc } } : {}) };
  });
  const applied = await relayConditionTags(targetActor, tags, {}, () => applyConditionTags(targetActor, tags, {}));
  lines.push(`Applied to ${targetActor.name}: ${formatAppliedTags(applied)}.`);
  for (const tag of tags.filter((t) => t.conditionSave)) {
    if (!applied.some((a) => a.key === tag.key && !a.immune)) continue;
    lines.push(`<em>${targetActor.name} may attempt a new ${save} save (DC ${dc}) at the end of each of its turns to end the ${tag.label.toLowerCase()}.</em>`);
  }
  return lines;
}

async function exposeFromStrike(actor, targetActor, spec, level) {
  const { affliction, oncePerDay } = spec.expose;
  const key = exposureKey(actor.uuid, affliction);
  const now = Number(game.time?.worldTime ?? 0);
  const exposures = targetActor.getFlag?.(SYSTEM_ID, EXPOSED_FLAG) ?? {};
  if (oncePerDay && exposureBlocked(exposures, key, now)) {
    return [`<em>${spec.label}: ${targetActor.name} has already been exposed to ${actor.name}'s ${affliction} today.</em>`];
  }
  // THE ATTACKER'S OWN FIRST (3.633.0, F&F 3.0 R3): the Aboleth carries
  // its Slime as an affliction item of its own, with the printed stages;
  // the shared pack is the fallback, as before.
  const own = ownAfflictionItem(actor, affliction);
  let data;
  if (own) {
    data = own.toObject();
  } else {
    const { contentPack } = await import("../content-packs.mjs");
    const pack = contentPack("afflictions");
    const index = pack ? await pack.getIndex() : [];
    const entry = Array.from(index.values?.() ?? index).find((e) => String(e.name).trim().toLowerCase() === affliction.toLowerCase());
    if (!entry) return [`<em>${spec.label}: no affliction named ${affliction} is installed — expose ${targetActor.name} by hand.</em>`];
    const doc = await pack.getDocument(entry._id);
    data = doc.toObject();
  }
  delete data._id;
  // "THE DISEASE LEVEL IS EQUAL TO YOUR LEVEL."
  data.system.level = spec.expose.level === "actorLevel" ? level : spec.expose.level;
  data.flags = { ...(data.flags ?? {}), [SYSTEM_ID]: { ...(data.flags?.[SYSTEM_ID] ?? {}), exposedBy: { uuid: actor.uuid, name: actor.name, feat: spec.label } } };
  // THE MARK AND THE EXPOSURE TOGETHER, on whichever client may write the
  // target — the GM's, through the relay, for a player's strike (3.627.0).
  const { exposeToAffliction } = await import("./affliction-workflow.mjs");
  const { relayAffliction } = await import("./target-relay-workflow.mjs");
  await relayAffliction(targetActor, data, { exposureKey: oncePerDay ? key : "", now }, async () => {
    if (oncePerDay) await targetActor.setFlag(SYSTEM_ID, EXPOSED_FLAG, { ...exposures, [key]: now });
    return exposeToAffliction(targetActor, data);
  });
  return [`<strong>${spec.label}</strong> — ${targetActor.name} is exposed to <strong>${affliction}</strong> (level ${data.system.level}); the save is on its own card.`];
}

/**
 * Hunger Beyond Pain (3.627.0): healing for felling a living creature with a
 * named attack, once a round. See combat/on-fell.mjs.
 * @returns {Promise<string[]>}
 */
export async function applyOnFell(actor, weapon, targetActor, damageCase) {
  if (!actor || !weapon || !targetActor) return [];
  const { declaredOnFell, onFellFires, onFellHealing } = await import("./on-fell.mjs");
  const specs = declaredOnFell(Array.from(actor.appliedEffects ?? actor.effects ?? []));
  if (!specs.length) return [];
  const { isLivingCreature } = await import("../kind-targeting.mjs");
  const used = actor.getFlag?.(SYSTEM_ID, USED_FLAG) ?? {};
  const lines = [];
  let next = null;
  for (const spec of specs) {
    if (!onFellFires(spec, { damageCase, weaponName: weapon.name, targetLiving: isLivingCreature(targetActor.system ?? {}), used })) continue;
    const amount = onFellHealing(spec, { level: actor.system?.identity?.level ?? 0, abilities: actor.system?.attributes ?? {} });
    const { healActor } = await import("../magic/spell-effects.mjs");
    const healed = await healActor(actor, amount, { magical: false });
    lines.push(`<strong>${spec.label}</strong> — ${targetActor.name} falls, and ${actor.name} regains <strong>${Number(healed?.healed ?? healed ?? amount)}</strong> HP (${amount}).`);
    if (spec.oncePerRound) next = { ...(next ?? used), [`fell:${spec.label}`]: true };
  }
  if (next && actor.setFlag) await actor.setFlag(SYSTEM_ID, USED_FLAG, next);
  return lines;
}

/**
 * DISPELLING STRIKE (Creature Codex; 3.631.0): "The creature attempts a
 * dispel attempt using 0 PP" on a melee hit — a Power Manipulation
 * counteract check against the target's Level DC, the target's active
 * spell effects listed for the GM to end on a success.
 */
async function dispelFromStrike(actor, targetActor, spec, level) {
  const { TRGCheck } = await import("../dice/check.mjs");
  const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
  const targetLevel = Math.max(0, Math.floor(Number(targetActor.system?.identity?.level ?? 0) || 0));
  const dc = levelDC(targetLevel);
  const skill = actor.system?.skills?.powerManipulation;
  const check = await TRGCheck.roll(withCheckModifiers({
    actor,
    label: `${actor.name} — Dispel (Power Manipulation)`,
    subtitle: `${spec.label} — 0 PP, against ${targetActor.name}'s Level DC ${dc}`,
    type: "skill",
    subject: "powerManipulation",
    dc,
    modifiers: skill?.checkModifiers ?? [{ label: "Power Manipulation", value: Number(skill?.total ?? 0), type: "untyped" }]
  }));
  const degree = check?.outcome?.degree;
  const active = Array.from(targetActor.effects ?? []).filter((e) => !e.disabled && (e.getFlag?.(SYSTEM_ID, "castId") || e.getFlag?.(SYSTEM_ID, "spellEffect")));
  const list = active.length ? active.map((e) => e.name).join(", ") : "no active spell effects";
  return [`<strong>${spec.label}</strong> — Dispel <strong>${degree?.label ?? "?"}</strong> against DC ${dc} (0 PP). ${targetActor.name} carries ${list}${degree?.success && active.length ? " — end one of them (counteracted)." : "."}`];
}
