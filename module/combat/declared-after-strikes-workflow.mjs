/**
 * After-strike effects a creature declares, the Foundry half (3.627.0).
 * The rule is in declared-after-strikes.mjs; this rolls the struck
 * creature's save through TRGCheck (as a rune's after-strike does), applies
 * the degree's conditions with their own clocks, records an end-of-turn
 * escape save where one is printed, and exposes the target to a named
 * affliction at the attacker's level.
 */
import { currentFormKey } from "../change-shape.mjs";
import {
  EXPOSED_FLAG, declaredAfterStrikeDC, declaredAfterStrikeFires, declaredAfterStrikes, ownAfflictionItem, weaponAfterStrikes,
  declaredConditionTag, withRolledRounds, exposureBlocked, exposureKey, escalatingDrainValue, amountFormulaBySeverity,
  stackedConditionValue, thresholdConditions } from "./declared-after-strikes.mjs";
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
export async function applyDeclaredAfterStrikes(actor, weapon, targetActor, { critical = null, damageTaken = 0 } = {}) {
  const lines = [];
  if (!actor || !weapon || !targetActor) return lines;
  const specs = declaredAfterStrikes(declarationCarriers(actor));
  // A WEAPON MAY CARRY ITS OWN (3.633.0, F&F 3.0 R3): "Tentacle … plus
  // Slime" is that tentacle's rider, so it fires for that weapon only.
  // THE WEAPON'S OWN WINS WHERE THE CREATURE'S WOULD NOT FIRE (3.658.1; found
  // live testing block 25): the Shade Wing's Soul Claws print "plus shadow
  // hand", and its Codex Shadow Hand names only a "soul touch" — the same key
  // kept the Codex's and dropped the claws'.
  for (const spec of weaponAfterStrikes(weapon)) {
    const at = specs.findIndex((s) => s.key === spec.key);
    if (at < 0) specs.push(spec);
    else if (specs[at].weaponNames.length && !specs[at].weaponNames.includes(String(weapon.name ?? "").trim().toLowerCase())) specs[at] = spec;
  }
  if (!specs.length) return lines;
  const used = actor.getFlag?.(SYSTEM_ID, USED_FLAG) ?? {};
  const defences = actorDefences(targetActor.system ?? {}, ownedCreatureTypeSystem(targetActor));
  const ctxBase = {
    weaponName: weapon.name,
    critical: critical || null,
    criticalImmune: Boolean(defences.immunities?.has?.("critical")),
    used,
    targetTypes: creatureTypesOf(targetActor.system ?? {}),
    form: currentFormKey(actor.effects),
    targetTraits: creatureTraits(targetActor.system ?? {}),
    // THE TARGET'S CONDITIONS NOW, after the injury (3.652.0, block 19 R8).
    targetConditions: specs.some((s) => s.requiresTargetCondition?.length)
      ? Array.from(targetActor.effects ?? []).filter((e) => !e.disabled).flatMap((e) => Array.from(e.statuses ?? []))
      : [],
    damageTaken
  };
  const level = Math.max(0, Math.floor(Number(actor.system?.identity?.level ?? 0) || 0));
  let next = null;
  for (const spec of specs) {
    const marker = `declared:${spec.key}`;
    if (!declaredAfterStrikeFires(spec, { ...ctxBase, marker })) continue;
    // STILL IMMUNE (3.660.0; block 29 R3): "temporarily immune to spectral
    // corruption for 1 minute" — this creature's rider passes it by.
    if (spec.immuneOn) {
      const { afterStrikeImmunityKey, afterStrikeImmune } = await import("./declared-after-strikes.mjs");
      if (afterStrikeImmune(targetActor.getFlag?.(SYSTEM_ID, IMMUNE_FLAG), afterStrikeImmunityKey(actor.uuid, spec.key), Number(game.time?.worldTime ?? 0))) {
        lines.push(`<em>${spec.label}: ${targetActor.name} is still immune to ${actor.name}'s ${spec.label}.</em>`);
        continue;
      }
    }
    if (spec.livingOnly) {
      const { isLivingCreature } = await import("../kind-targeting.mjs");
      if (!isLivingCreature(targetActor.system ?? {})) { lines.push(`<em>${spec.label}: ${targetActor.name} is not a living creature.</em>`); continue; }
    }
    if (spec.selfHeal > 0) {
      const { healActor } = await import("../magic/spell-effects.mjs");
      const healed = Number(await healActor(actor, spec.selfHeal, { magical: false })) || 0;
      lines.push(`<strong>${spec.label}</strong> — ${actor.name} is healed <strong>${healed} HP</strong>.`);
    }
    if (spec.selfCondition) lines.push(...await applySelfCondition(actor, spec));
    if (spec.expose) lines.push(...await exposeFromStrike(actor, targetActor, spec, level));
    if (spec.save) lines.push(...await rollDeclaredSave(actor, targetActor, spec, level, critical, damageTaken));
    if (spec.dispel) lines.push(...await dispelFromStrike(actor, targetActor, spec, level));
    if (spec.castChoice) lines.push(...await castChoiceFromStrike(actor, targetActor, spec));
    if (spec.oncePerRound) next = { ...(next ?? used), [marker]: true };
  }
  if (next && actor.setFlag) await actor.setFlag(SYSTEM_ID, USED_FLAG, next);
  return lines;
}

/**
 * THE STRIKER'S OWN CONDITION (3.635.0, F&F 3.0 block 5 R5) — Dusty Haze's
 * Concealed "until the beginning of its next turn": one round while a
 * combat runs, as a strike rider's condition is (strike-riders-workflow.mjs);
 * outside one there is no round to count, so it is left for the GM to lift.
 */
async function applySelfCondition(actor, spec) {
  const { CONDITIONS } = await import("../conditions/registry.mjs");
  const cond = CONDITIONS[spec.selfCondition.key];
  if (!cond) return [`<em>${spec.label} names an unknown condition "${spec.selfCondition.key}".</em>`];
  const { applyConditionTags, formatAppliedTags } = await import("./effect-application-workflow.mjs");
  const rounds = spec.selfCondition.rounds;
  const applied = await applyConditionTags(actor, [{ key: spec.selfCondition.key, label: cond.label, value: null }], {
    expiresRound: rounds && game.combat?.started ? Number(game.combat.round ?? 0) + rounds : null,
    spellEffect: true
  });
  return [`<strong>${spec.label}</strong> — ${actor.name}: ${formatAppliedTags(applied)}${rounds && game.combat?.started ? " until the beginning of its next turn" : ""}.`];
}

/** Where a target keeps its immunity to a creature's rider (3.660.0). */
const IMMUNE_FLAG = "afterStrikeImmunity";

async function rollDeclaredSave(actor, targetActor, spec, level, severity, damageTaken = 0) {
  const lines = [];
  const save = spec.save;
  const dc = declaredAfterStrikeDC(spec, levelDC(level), severity);
  const raised = dc - levelDC(level);
  const { TRGCheck } = await import("../dice/check.mjs");
  const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
  const check = await TRGCheck.roll(withCheckModifiers({
    actor: targetActor,
    label: `${targetActor.name} — ${save.charAt(0).toUpperCase()}${save.slice(1)} Save`,
    subtitle: spec.dc > 0
      ? `${spec.label} — DC ${dc} (printed)`
      : `${spec.label} — against ${actor.name}'s Level DC ${dc}${raised ? ` (${severity} injury, +${raised})` : ""}`,
    type: "save",
    save,
    dc
  }));
  const degree = check?.outcome?.degree?.key ?? "failure";
  const outcome = afterStrikeOutcome(spec, degree);
  const label = check?.outcome?.degree?.label ?? degree;
  lines.push(`<strong>${spec.label}</strong> — ${targetActor.name} rolls ${save} against DC ${dc}: <strong>${label}</strong>.${outcome.text ? ` ${outcome.text}` : ""}`);
  // THE HIT'S DAMAGE BECOMES SOUL DRAIN (3.660.0; block 29 R3).
  const taken = Math.max(0, Math.trunc(Number(damageTaken) || 0));
  if (spec.damageAsDrain?.includes(degree) && taken > 0) {
    const { healActor } = await import("../magic/spell-effects.mjs");
    await healActor(targetActor, taken, { magical: true });
    const { applyConditionTags, formatAppliedTags } = await import("./effect-application-workflow.mjs");
    const { relayConditionTags } = await import("./target-relay-workflow.mjs");
    const { conditionLabel } = await import("../conditions/condition-rules.mjs");
    const drainTags = [{ key: "soulDrain", value: taken, label: conditionLabel("soulDrain") }];
    const drained = await relayConditionTags(targetActor, drainTags, {}, () => applyConditionTags(targetActor, drainTags, {}));
    lines.push(`The attack's <strong>${taken}</strong> damage becomes Soul Drain — ${targetActor.name}: ${formatAppliedTags(drained)}.`);
  }
  // …OR IMMUNITY TO IT FOR A WHILE.
  if (spec.immuneOn?.degrees.includes(degree) && targetActor.setFlag) {
    const { afterStrikeImmunityKey } = await import("./declared-after-strikes.mjs");
    const record = targetActor.getFlag?.(SYSTEM_ID, IMMUNE_FLAG) ?? {};
    await targetActor.setFlag(SYSTEM_ID, IMMUNE_FLAG, { ...record, [afterStrikeImmunityKey(actor.uuid, spec.key)]: Number(game.time?.worldTime ?? 0) + spec.immuneOn.seconds });
    lines.push(`<em>${targetActor.name} is immune to ${actor.name}'s ${spec.label} for ${Math.round(spec.immuneOn.seconds / 60) || 1} minute(s).</em>`);
  }
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
  const tags = [];
  for (const row of outcome.conditions) {
    let { resave, ...tag } = declaredConditionTag(row, clock);
    // A DURATION THAT IS DICE (3.662.0; block 31 R2), rolled as it lands.
    if (tag.roundsDice) { const r = await new Roll(tag.roundsDice).evaluate(); lines.push(`${conditionLabel(row.key)} for ${tag.roundsDice} → ${r.total} round${r.total === 1 ? "" : "s"}.`); tag = withRolledRounds(tag, r.total, clock); }
    // STACKING (3.639.0, Petrifying Bite): the declared value adds to the
    // target's own.
    if (spec.stack && tag.value !== null && tag.value !== undefined) {
      const had = targetActor.getConditionValue?.(tag.key) ?? 0;
      tag.value = stackedConditionValue(spec, had, tag.value);
    }
    tags.push({ ...tag, label: conditionLabel(row.key), ...(resave ? { conditionSave: { save, onSuccess: "end", label: spec.label, saveDC: dc } } : {}) });
  }
  // THRESHOLDS (3.639.0): "once a creature's actions are reduced to 0, it
  // becomes petrified" — read from the values this save is about to lay.
  const reached = thresholdConditions(spec, Object.fromEntries(tags.map((t) => [t.key, Number(t.value) || 0])));
  for (const key of reached) if (!tags.some((t) => t.key === key)) tags.push({ key, value: null, label: conditionLabel(key) });
  const applied = await relayConditionTags(targetActor, tags, {}, () => applyConditionTags(targetActor, tags, {}));
  lines.push(`Applied to ${targetActor.name}: ${formatAppliedTags(applied)}.`);
  for (const tag of tags.filter((t) => t.conditionSave)) {
    if (!applied.some((a) => a.key === tag.key && !a.immune)) continue;
    lines.push(`<em>${targetActor.name} may attempt a new ${save} save (DC ${dc}) at the end of each of its turns to end the ${tag.label.toLowerCase()}.</em>`);
  }
  return lines;
}

/**
 * AN AREA THAT EXPOSES (3.655.0; F&F 3.0 block 22 R1 — the Oryceps's Emit
 * Spores, "all creatures within the radius are affected by Violet Spores"):
 * the same exposure a strike makes, for each creature an area reaches.
 * @returns {Promise<string[]>}
 */
export async function exposeFromArea(actor, targetActor, { label, expose }, level) {
  if (!actor || !targetActor || !expose?.affliction) return [];
  return exposeFromStrike(actor, targetActor, { label, expose: { level: "actorLevel", ...expose, affliction: String(expose.affliction) } }, level);
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
/**
 * ONE OF SEVERAL SPELLS, CAST AT THE STRUCK CREATURE (3.654.0, block 21 R7 —
 * Enchanting Touch). The attacker's side chooses; the spell is released as an
 * innate casting at the printed DC, free of AP and PP, aimed at the target —
 * the path Da Big Itter's Fear takes (weapon-rune-workflow). The save and the
 * effect are the spell's own.
 */
async function castChoiceFromStrike(actor, targetActor, spec) {
  const { spells, dc } = spec.castChoice;
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${spec.label} — ${targetActor.name}` }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>${targetActor.name} is subjected to one of these${dc ? ` (DC ${dc})` : ""}:</p></div>`,
    buttons: [...spells.map((n, i) => ({ action: `s${i}`, label: n, default: i === 0 })), { action: "none", label: "None" }],
    rejectClose: false
  }).catch(() => null);
  const index = /^s(\d+)$/.exec(String(picked ?? ""))?.[1];
  if (index === undefined) return [`<em>${spec.label}: no spell chosen.</em>`];
  const name = spells[Number(index)];
  const { contentPack } = await import("../content-packs.mjs");
  const pack = contentPack("spells");
  const pidx = pack ? await pack.getIndex() : [];
  const entry = Array.from(pidx).find((e) => String(e.name).toLowerCase() === name.toLowerCase());
  if (!entry) return [`<em>${spec.label}: no spell called ${name} is in the compendium — apply it by hand at DC ${dc}.</em>`];
  const source = (await pack.getDocument(entry._id)).toObject();
  source.system.components = { somatic: false, verbal: false, material: false, focus: false };
  const token = targetActor.token?.object ?? targetActor.getActiveTokens?.()?.[0] ?? null;
  if (token) token.setTarget(true, { user: game.user, releaseOthers: true });
  const holder = Array.from(actor.items ?? []).find((i) => String(i.name).trim().toLowerCase() === String(spec.label).trim().toLowerCase())
    ?? { name: spec.label, id: "", system: {} };
  const { releaseItemSpell } = await import("../consumable-use-workflow.mjs");
  await releaseItemSpell(actor, holder, { name: source.name, uuid: entry.uuid ?? "", pp: Number(source.system?.ppCost ?? 0), warp: null }, {
    data: source, apPaid: true, presetTargets: Boolean(token), fixedDC: dc || null
  });
  return [`<strong>${spec.label}</strong> — ${targetActor.name} is subjected to <strong>${name}</strong>${dc ? ` (DC ${dc})` : ""}; the spell's own card follows.`];
}

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
