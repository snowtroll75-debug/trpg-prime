/**
 * PERILS, IN FOUNDRY — the half of peril.mjs that rolls and writes (3.620.0,
 * block 38; Chapter 12, Graham's R17; haunts at 3.629.0, Pillars of Faith
 * Chapter 8, Graham's design of 8 October 2026).
 *
 *   rollPerilDetection   the GM's button: a secret check for each PC on the
 *                        scene — the best of the skills the peril's
 *                        Detection line allows them — and, for a spiritual
 *                        presence, Spirit Sense's word without a roll
 *   perilForAction       a disabling action (Disable Device, Disable a
 *                        Peril, Dispel) against a targeted peril: its DC,
 *                        its skill, its situational bonuses
 *   perilDisableAttempt  the result banked on the peril — disabled, or a
 *                        haunt suppressed
 *   applyPerilAttempt    the write, on the GM's client (relayed for a player)
 *   triggerPeril         the GM's Trigger: its Effect rolled and applied,
 *                        and a complex peril into the combat
 *   usePerilRoutine      a routine action's Use, rolled and applied
 *   resolvePeril         Resolution: ended for good
 *   perilTakesDamage     a peril struck: Hardness is the sheet's own; at 0 HP
 *                        it is broken, at a negative half destroyed, and it
 *                        never dies; a peril with no body takes nothing
 *   resetPeril           its Reset
 *   rearmSuppressedPerils  a suppression whose clock has run out ends
 */

import {
  isPeril, normalisePeril, perilAfterAttempt, perilDamageState,
  perilDetectionEligible, perilDisableSkillAllowed, perilDetectionEntries,
  perilEntryMatches, perilCanAct, perilStateAfterTrigger, perilHasNoBody,
  perilRearmDue, perilCounteract, perilCounteractable
} from "./peril.mjs";
import { perilEffectSpec, perilEffectOutcome, perilIncreaseRows } from "./peril-effect.mjs";
import { tokenSquares } from "./combat/geometry.mjs";

const SYSTEM_ID = "trg-prime";
/** A blank rung reads its neighbour, the way peril-effect.mjs reads a ladder. */
const FALLBACK_RUNG = Object.freeze({ heroic: "critical", blunder: "fumble" });
const { DialogV2 } = foundry.applications.api;
const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const cap = (s) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
const now = () => Number(game.time?.worldTime ?? 0);
/** A printed line as one sentence: "1 hour." stays "1 hour.", "Midnight" gains its stop (3.629.1). */
const sentence = (text) => { const t = String(text ?? "").trim(); return /[.!?]$/.test(t) ? t : `${t}.`; };

async function card(actor, title, lines, { whisperGM = false } = {}) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    ...(whisperGM ? { whisper: ChatMessage.getWhisperRecipients("GM").map((u) => u.id) } : {}),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/** The actions that disable a peril. */
const DISABLING_ACTIONS = Object.freeze(["disableADevice", "disablePeril", "dispel"]);

/** A peril's level. */
const levelOf = (peril) => Math.max(0, Math.floor(Number(peril?.system?.identity?.level ?? 0) || 0));

/** The peril's token on the canvas: its own (an unlinked token's actor), or the first placed. */
function perilToken(peril) {
  return peril?.token ?? peril?.getActiveTokens?.(true, true)?.[0] ?? null;
}

/**
 * A skill's modifiers on a PC, core or specialist ("lore:spiritLore" →
 * the specialist skill whose label is that Lore's). Null when they have none.
 */
function skillFor(actor, entry) {
  if (!entry.skill.startsWith("lore:")) {
    const skill = actor.system?.skills?.[entry.skill];
    return skill ? { key: entry.skill, label: skill.label ?? entry.label, stat: skill, ranks: Number(skill.ranks ?? 0) } : null;
  }
  for (const [slug, skill] of Object.entries(actor.system?.specialistSkills ?? {})) {
    if (perilEntryMatches(entry, `specialist:${slug}`)) {
      return { key: slug, label: skill?.label ?? entry.label, stat: skill, ranks: Number(skill?.ranks ?? 0), specialist: true };
    }
  }
  return null;
}

/** Does this PC carry a spiritual sense that reaches the peril? */
function spiritSenseReaches(actor, pcToken, token, senses) {
  const spiritual = senses.filter((s) => String(s.modality ?? "").toLowerCase() === "spiritual" || /spirit sense|veil/i.test(String(s.name ?? "")));
  if (!spiritual.length) return null;
  if (!pcToken || !token) return spiritual[0];
  const distance = canvas?.grid?.measurePath?.([pcToken.object?.center ?? pcToken, token.object?.center ?? token])?.distance ?? null;
  const best = spiritual.find((s) => s.rangeFeet === null || distance === null || distance <= Number(s.rangeFeet));
  return best ?? null;
}

/**
 * DETECTION (R17): "secretly roll an appropriate detection check against
 * the peril's Stealth DC for each PC". The GM ticks who is Searching, which
 * matters only for an entry with a minimum rank. Each check is a blind roll;
 * the summary is whispered to the GM.
 *
 * SEVERAL SKILLS (3.629.0). A haunt's Detection line can offer several, each
 * with its own DC ("Perception DC 17; Occultism or Religion DC 17"): each
 * PC rolls the one that serves them best — the highest total against its
 * DC — among those they are eligible for.
 *
 * SPIRIT SENSE (3.629.0). "Spirit Sense can reveal that a haunt is present
 * and its general direction": a PC whose spiritual sense reaches a peril
 * marked as a spiritual presence is told so, without a roll.
 */
export async function rollPerilDetection(peril) {
  if (!game.user?.isGM || !isPeril(peril)) return null;
  const p = normalisePeril(peril.system?.gm?.peril);
  const entries = perilDetectionEntries(p).filter((e) => e.dc > 0);
  if (!entries.length) {
    ui.notifications?.warn(`${peril.name}: set its Detection first.`);
    return null;
  }
  const token = perilToken(peril);
  const scene = token?.parent ?? canvas?.scene ?? null;
  const seen = new Set();
  const pcs = [];
  for (const t of scene?.tokens ?? []) {
    const actor = t.actor;
    if (actor?.type !== "character" || seen.has(actor.uuid)) continue;
    seen.add(actor.uuid);
    pcs.push({ actor, token: t });
  }
  if (!pcs.length) {
    ui.notifications?.warn("No player characters are on this scene.");
    return null;
  }
  let searching = new Set();
  const ranked = entries.filter((e) => e.minRank > 0);
  if (ranked.length) {
    const need = ranked.map((e) => `${e.label} ${e.minRank} ranks`).join(", ");
    const rows = pcs.map(({ actor }) => `<label class="checkbox-field"><input type="checkbox" name="s-${actor.id}"> ${actor.name} is Searching</label>`).join("");
    const picked = await DialogV2.wait({
      window: { title: `${peril.name} — Detection`, icon: "fa-solid fa-eye" },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog"><p class="hint">Part of this peril's Detection needs ranks (${need}): only a PC actively Searching with them may use it.</p>${rows}</div>`,
      buttons: [
        { action: "roll", label: "Roll", default: true, callback: (event, button) =>
          pcs.filter(({ actor }) => button.form.elements[`s-${actor.id}`]?.checked).map(({ actor }) => actor.uuid) },
        { action: "cancel", label: "Cancel" }
      ],
      rejectClose: false
    });
    if (!Array.isArray(picked)) return null;
    searching = new Set(picked);
  }

  const { TRGCheck } = await import("./dice/check.mjs");
  const { BLIND_ROLL_MODE } = await import("./traits.mjs");
  const { actorSenses } = await import("./senses.mjs");
  const lines = [];
  for (const { actor, token: pcToken } of pcs) {
    if (p.spiritPresence) {
      const sense = spiritSenseReaches(actor, pcToken, token, actorSenses(actor.system, Array.from(actor.items ?? [])));
      if (sense) lines.push(line(`${actor.name}: <strong>${sense.name}</strong> reveals a spiritual presence and its general direction.`));
    }
    const options = [];
    const refusals = [];
    for (const entry of entries) {
      const skill = skillFor(actor, entry);
      if (!skill) continue;
      const eligible = perilDetectionEligible({ minRank: entry.minRank, searching: searching.has(actor.uuid), ranks: skill.ranks });
      if (!eligible.eligible) { refusals.push(`${entry.label}: ${eligible.reason.replace("Perception", entry.label)}`); continue; }
      options.push({ entry, skill, edge: Number(skill.stat?.total ?? 0) - entry.dc });
    }
    if (!options.length) {
      lines.push(line(`${actor.name}: no check${refusals.length ? ` — ${refusals.join("; ")}` : ""}.`));
      continue;
    }
    const { entry, skill } = options.sort((a, b) => b.edge - a.edge)[0];
    const check = await TRGCheck.roll({
      actor,
      label: `${skill.label} — Detection`,
      subtitle: "A secret check (Chapter 12)",
      type: "skill",
      subject: skill.key,
      dc: entry.dc,
      rollMode: BLIND_ROLL_MODE,
      modifiers: skill.stat?.checkModifiers ?? [{ label: skill.label, value: Number(skill.stat?.total ?? 0), type: "untyped" }]
    });
    const found = Boolean(check?.outcome?.degree?.success);
    lines.push(line(`${actor.name} (${skill.label}): ${check?.outcome?.total ?? "?"} vs DC ${entry.dc} — <strong>${found ? "notices it" : "does not"}</strong>.`));
  }
  await card(peril, `${peril.name} — Detection`, lines, { whisperGM: true });
  return lines.length;
}

/**
 * THE PERIL A DISABLING ACTION IS AIMED AT, and the DC to use: called before
 * the roll. Null when the action is not a disabling one, or no peril is
 * targeted.
 *
 * The DC is the one its Disable line gives the skill used (3.629.0); for
 * Dispel against a haunt, its Counteract DC. `bonuses` are the situational
 * ones the stat block prints ("+2 circumstance if that name belonged to
 * somebody who once lived in the house"), offered unticked in the check
 * dialog. `mode` tells the bank a Counteract from a Disable.
 *
 * @returns {{peril: Actor, dc: number|null, refused: string, bonuses: object[], mode: string}|null}
 */
export function perilForAction(action, targetActor, skillKey) {
  if (!DISABLING_ACTIONS.includes(action?.key) || !isPeril(targetActor)) return null;
  const raw = targetActor.system?.gm?.peril;
  const p = normalisePeril(raw);
  const allowed = perilDisableSkillAllowed(raw, skillKey, { level: levelOf(targetActor) });
  const bonuses = p.disableBonuses.map((b, i) => ({
    id: `peril-bonus-${i}`, kind: "modifier", value: b.value, type: b.type, label: b.label,
    scope: `against ${targetActor.name}`, when: { checkTypes: ["skill"] }
  }));
  return {
    peril: targetActor,
    dc: allowed.ok ? (allowed.dc || p.disableDC || null) : null,
    refused: allowed.ok ? "" : allowed.reason,
    bonuses,
    mode: action.key === "dispel" ? "counteract" : "disable"
  };
}

/** The level and DC a Dispel's dialog should open on for a targeted peril, or null. */
export function perilDispelDefaults(targetActor) {
  if (!isPeril(targetActor) || !perilCounteractable(targetActor.system?.gm?.peril)) return null;
  return perilCounteract(targetActor.system?.gm?.peril, levelOf(targetActor));
}

/** "for 1 hour", "until its next Reset" — said on the card. */
function suppressionPhrase(until) {
  if (until === null || until === undefined) return "until its next Reset";
  const left = Math.max(0, Number(until) - now());
  if (left >= 86400 && left % 3600 === 0) return `for ${left / 3600} hours`;
  if (left >= 3600 && left % 60 === 0) return `for ${left >= 7200 ? `${left / 3600} hours` : left === 3600 ? "1 hour" : `${left / 60} minutes`}`;
  if (left >= 60) return `for ${Math.round(left / 60)} minute${left >= 120 ? "s" : ""}`;
  return `for ${left} seconds`;
}

/**
 * Bank a rolled disabling attempt on the peril (relayed when this client
 * does not own it). Returns the card lines.
 *
 * @param {Actor} peril
 * @param {string} degree
 * @param {{mode?: "disable"|"counteract", seconds?: number|null, force?: boolean}} [how]
 *   a counteracting effect's own suppression, in seconds (null: until
 *   Reset), and whether its ladder suppresses on this degree whatever it is
 */
export async function perilDisableAttempt(peril, degree, how = {}) {
  if (!peril || !degree) return [];
  const { relayPerilAttempt } = await import("./combat/target-relay-workflow.mjs");
  let result;
  try {
    result = await relayPerilAttempt(peril, degree, () => applyPerilAttempt(peril, degree, { direct: true, ...how }), how);
  } catch (error) {
    return [line(`<em>${peril.name}: the attempt could not be recorded — ${error?.message ?? error}.</em>`)];
  }
  if (!result) return [];
  if (result.triggered) return [line(`<strong>${peril.name} is triggered!</strong> A fumble or blunder on an attempt to disable or counteract it sets it off (Chapter 12).`)];
  if (["broken", "destroyed", "resolved"].includes(result.state)) return [line(`${peril.name} is already ${result.state}.`)];
  if (result.done && result.state === "suppressed") {
    return [line(`<strong>${peril.name} is suppressed</strong> ${suppressionPhrase(result.suppressedUntil)} — it cannot trigger, act or produce its effects, but the circumstances that created it remain.`)];
  }
  if (result.done) return [line(`<strong>${peril.name} is disabled</strong> — ${result.progress} of ${result.required} success${result.required === 1 ? "" : "es"}.`)];
  if (result.earned) return [line(`${peril.name}: ${result.earned} success${result.earned === 1 ? "" : "es"} banked — <strong>${result.progress} of ${result.required}</strong>.`)];
  return [line(`${peril.name}: no progress (${result.progress} of ${result.required}).`)];
}

/** The write, on a client that owns the peril. */
export async function applyPerilAttempt(peril, degree, { direct = false, mode = "disable", seconds, force = false } = {}) {
  if (!peril || (!direct && !peril.isOwner)) return null;
  const result = perilAfterAttempt(peril.system?.gm?.peril, degree, {
    now: now(), mode, force: Boolean(force), ...(seconds !== undefined ? { seconds } : {})
  });
  await peril.update({
    "system.gm.peril.progress": result.progress,
    "system.gm.peril.state": result.state,
    "system.gm.peril.suppressedUntil": result.suppressedUntil
  });
  return result;
}

/**
 * A PERIL STRUCK (R17): "Dealing damage to a mechanical trap or another
 * physical peril follows the rules for damaging objects". Its HP fall, below
 * 0 if need be; broken at 0 ("can no longer be activated, though it remains
 * repairable"), destroyed at a negative half ("it cannot be repaired"). It
 * never dies, so none of the dying machinery runs. Its Hardness is the NPC's
 * natural-armour DR, which the damage pipeline has already taken off.
 *
 * NO BODY (3.629.0): "Unless its stat block provides DB, HP or another
 * relevant statistic, it cannot be directly damaged." A peril with no
 * maximum HP takes nothing.
 *
 * @returns {Promise<object>} the shape applyDamageAndCheckDying returns
 */
export async function perilTakesDamage(peril, incoming) {
  const hp = peril.system?.resources?.hp ?? {};
  if (perilHasNoBody(peril)) {
    await card(peril, peril.name, [line(`<em>It has no physical body — the damage passes through it.</em>`)]);
    return { case: "peril", newHP: Number(hp.value ?? 0), state: normalisePeril(peril.system?.gm?.peril).state, noBody: true };
  }
  const max = Number(hp.max ?? 0);
  const newHP = Number(hp.value ?? 0) - Math.max(0, Math.floor(Number(incoming) || 0));
  const damageState = perilDamageState(newHP, max);
  const before = normalisePeril(peril.system?.gm?.peril).state;
  const state = damageState === "armed" ? before : damageState;
  await peril.update({ "system.resources.hp.value": newHP, "system.gm.peril.state": state });
  if (state !== before && (state === "broken" || state === "destroyed")) {
    await card(peril, peril.name, [line(state === "broken"
      ? `<strong>Broken</strong> — it can no longer be activated, though it remains repairable (Chapter 12).`
      : `<strong>Destroyed</strong> — it cannot be repaired (Chapter 12).`)]);
  }
  return { case: "peril", newHP, state };
}

/** Reset: armed again, its progress gone. A resolved peril does not Reset. */
export async function resetPeril(peril) {
  if (!peril?.isOwner) return null;
  const p = normalisePeril(peril.system?.gm?.peril);
  if (p.state === "resolved") {
    ui.notifications?.warn(`${peril.name} has been resolved — "a haunt that has been permanently resolved does not Reset". Set its state by hand to bring it back.`);
    return false;
  }
  await peril.update({ "system.gm.peril.state": "armed", "system.gm.peril.progress": 0, "system.gm.peril.suppressedUntil": null });
  await card(peril, peril.name, [line(`<strong>Reset</strong>${p.reset ? ` — ${sentence(p.reset)}` : "."}`)]);
  return true;
}

/**
 * RESOLUTION (3.629.0): "A haunt's Resolution entry describes how it can be
 * permanently ended." The GM's button: it never triggers, acts or resets
 * again.
 */
export async function resolvePeril(peril) {
  if (!game.user?.isGM || !isPeril(peril)) return null;
  const p = normalisePeril(peril.system?.gm?.peril);
  await peril.update({ "system.gm.peril.state": "resolved", "system.gm.peril.progress": 0, "system.gm.peril.suppressedUntil": null });
  await card(peril, `${peril.name} — Resolved`, [
    line(`<strong>Resolved.</strong> It is ended for good and will not Reset.`),
    ...(p.resolution ? [line(`<em>${p.resolution}</em>`)] : [])
  ]);
  return true;
}

/** A suppression whose clock has run out ends: armed again, with a word. */
async function rearm(peril) {
  await peril.update({ "system.gm.peril.state": "armed", "system.gm.peril.suppressedUntil": null, "system.gm.peril.progress": 0 });
  await card(peril, peril.name, [line(`Its suppression has ended — <strong>armed</strong> again.`)], { whisperGM: true });
}

/**
 * Every suppressed peril whose clock has run out, re-armed. The world-time
 * hook's work, on the GM's client: world actors and unlinked tokens alike.
 */
async function rearmSuppressedPerils(at = now()) {
  if (!game.user?.isGM) return 0;
  const seen = new Set();
  const candidates = [...(game.actors ?? [])];
  for (const scene of game.scenes ?? []) {
    for (const t of scene.tokens ?? []) if (!t.actorLink && t.actor) candidates.push(t.actor);
  }
  let count = 0;
  for (const actor of candidates) {
    if (!actor || seen.has(actor.uuid) || !isPeril(actor)) continue;
    seen.add(actor.uuid);
    if (!perilRearmDue(actor.system?.gm?.peril, at)) continue;
    await rearm(actor);
    count += 1;
  }
  return count;
}

/** Install the world-time hook. Called once from the ready hook. */
export function registerPerilHooks() {
  Hooks.on("updateWorldTime", (worldTime) => {
    if (!game.user?.isGM) return;
    rearmSuppressedPerils(Number(worldTime)).catch((error) => console.error("TRG Prime | perils could not re-arm", error));
  });
}

/* ------------------------------------------------------------------ */
/* What a peril does (3.629.0)                                          */
/* ------------------------------------------------------------------ */

/**
 * The creatures an effect reaches: everyone in its radius round the token,
 * or the GM's targets — or, for a registered automation that has chosen
 * them ("a different random living creature within range"), those.
 */
function effectTargets(peril, spec, chosen = null) {
  if (Array.isArray(chosen)) {
    const actors = chosen.filter((a) => a && !isPeril(a));
    return { actors, note: actors.length ? "" : "Nobody is chosen." };
  }
  const token = perilToken(peril);
  // A SWARM'S SPACE (3.632.0, ruling 9): every creature whose squares overlap
  // the user's — enemies only when the attack says "each enemy".
  if (spec.scope === "sharedSpace") {
    if (!token?.object) return { actors: [], note: `${peril.name} has no token on the scene, so the creatures in its space cannot be read.` };
    const mine = new Set(tokenSquares(token.object).map((q) => `${q.col}:${q.row}`));
    const actors = [];
    for (const t of token.parent?.tokens ?? []) {
      if (t.id === token.id || !t.actor || isPeril(t.actor) || !t.object) continue;
      if (spec.enemiesOnly && t.disposition === token.disposition) continue;
      if (tokenSquares(t.object).some((q) => mine.has(`${q.col}:${q.row}`))) actors.push(t.actor);
    }
    return { actors, note: "" };
  }
  if (spec.scope === "area") {
    if (!token) return { actors: [], note: `${peril.name} has no token on the scene, so its ${spec.radiusFeet}-foot reach cannot be measured — target the creatures and use its routine instead.` };
    const origin = token.object?.center ?? null;
    const actors = [];
    for (const t of token.parent?.tokens ?? []) {
      if (t.id === token.id || !t.actor || isPeril(t.actor)) continue;
      const centre = t.object?.center ?? null;
      const distance = origin && centre ? canvas?.grid?.measurePath?.([origin, centre])?.distance ?? null : null;
      if (distance === null || distance <= spec.radiusFeet) actors.push(t.actor);
    }
    return { actors, note: "" };
  }
  const actors = Array.from(game.user?.targets ?? []).map((t) => t.actor).filter((a) => a && !isPeril(a));
  return { actors, note: actors.length ? "" : "No creature is targeted — target those it affects (the triggering creature, those in the room or the line) and press it again." };
}

/**
 * Roll and apply one Effect or routine action: a save for each creature it
 * reaches, against the printed DC or the peril's Level DC, the rung's
 * conditions on their clocks, and its damage — basic, halved and doubled.
 *
 * @returns {Promise<string[]>} the card lines
 */
/**
 * THE SAME ROLL FOR ANY CREATURE (3.631.0; Fiends & Fables 3.0 block 1,
 * Graham: "all automated"). A Codex ability that declares an area effect —
 * Sonic Moan, Howl, Paralysing Gaze, Entangling Vines, Crush, a dragon's
 * breath — is a peril's Effect with a creature behind it: every creature in
 * reach saves against the user's Level DC, the rung's conditions land, the
 * damage is basic. The gate in usePerilRoutine stays a peril's; this is the
 * door a creature's Use button comes through (creature-activation-workflow).
 */
export async function runDeclaredAreaEffect(actor, spec, opts = {}) {
  return runPerilEffect(actor, spec, opts);
}

async function runPerilEffect(peril, spec, { title = "", targets = null, results = null } = {}) {
  const lines = [];
  if (!spec) return lines;
  const { levelDC } = await import("./dice/resolution.mjs");
  const level = levelOf(peril);
  const dc = Number(spec.dc) || levelDC(level);
  if (spec.intro) lines.push(line(`<em>${spec.intro}</em>`));
  if (!spec.save) {
    for (const n of spec.notes ?? []) lines.push(line(`<em>${n}</em>`));
    return lines;
  }
  const { actors, note } = effectTargets(peril, spec, targets);
  if (note) { lines.push(line(`<strong>${note}</strong>`)); return lines; }
  if (!actors.length) { lines.push(line("Nobody is within its reach.")); return lines; }

  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const { isLivingCreature } = await import("./kind-targeting.mjs");
  const { basicSavingThrow } = await import("./dice/resolution.mjs");
  const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
  const { relayConditionTags } = await import("./combat/target-relay-workflow.mjs");
  const { conditionLabel } = await import("./conditions/condition-rules.mjs");
  const { declaredConditionTag } = await import("./combat/declared-after-strikes.mjs");
  const clock = { combatRound: game.combat?.started ? Number(game.combat.round ?? 0) : null, worldTime: now() };

  let damageRoll = null;
  if (spec.damage?.formula) {
    damageRoll = await new Roll(spec.damage.formula).evaluate();
    await damageRoll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: peril }), flavor: `${title || peril.name} — ${spec.damage.type} damage` });
    lines.push(line(`Damage rolled: <strong>${damageRoll.total}</strong> ${spec.damage.type} (${spec.basic ? "basic" : ""} ${cap(spec.save)} save).`));
  }
  const die = /d(\d+)/i.exec(spec.damage?.formula ?? "")?.[1] ?? "6";
  // FURTHER PACKETS (3.633.0, F&F 3.0 R10): rolled once, like the first,
  // and met per target by that target's own defences.
  const extraRolls = [];
  for (const extra of spec.extraDamage ?? []) {
    const roll = await new Roll(extra.formula).evaluate();
    extraRolls.push({ ...extra, roll });
    lines.push(line(`…plus <strong>${roll.total}</strong> ${extra.type} (${extra.formula}).`));
  }

  for (const actor of actors) {
    if (spec.livingOnly && !isLivingCreature(actor.system ?? {})) {
      lines.push(line(`${actor.name}: not a living creature — unaffected.`));
      continue;
    }
    const immune = (spec.immuneIf ?? []).find((key) => actor.hasCondition?.(key));
    if (immune) {
      lines.push(line(`${actor.name}: ${conditionLabel(immune)} — immune to this effect.`));
      continue;
    }
    // "IMMUNE FOR 10 MINUTES AFTER MAKING A SAVE" (3.631.0): Howl, Aura of
    // Confusion's critical. A window on the creature, keyed by the ability.
    const windowKey = String(title || peril.name).trim().toLowerCase();
    const windows = actor.getFlag?.(SYSTEM_ID, "areaImmunities") ?? {};
    if (Number(windows[windowKey]) > now()) {
      lines.push(line(`${actor.name}: still immune to ${title || peril.name} (saved against it within the window).`));
      continue;
    }
    const parts0 = [];
    // SCALY RESILIENCE (3.632.0; Fiends & Fables 3.0 block 2, ruling 4): a
    // declared breath reaching the character — the reaction spent in combat,
    // +1 circumstance to the save, and resistance to the breath's damage.
    let scaly = null;
    if (spec.isBreath) {
      const { scalyResilience, ownsCodexFeat, SCALY_RESILIENCE } = await import("./codex-feat-rules.mjs");
      const inCombat = Boolean(game.combat?.started && game.combat.combatants?.some?.((c) => c.actor?.id === actor.id));
      const reactions = Number(actor.system?.resources?.reactions?.value ?? 0);
      scaly = scalyResilience({ ownsFeat: ownsCodexFeat(actor.items, SCALY_RESILIENCE), isBreath: true, reactionAvailable: !inCombat || reactions > 0 });
      if (scaly) {
        if (inCombat) {
          const { spendReaction } = await import("./combat/action-points-workflow.mjs");
          await spendReaction(actor, SCALY_RESILIENCE);
        }
        parts0.push(`${actor.name}: <strong>${SCALY_RESILIENCE}</strong> — reaction, +1 to the save, resistance to the breath.`);
      }
    }
    const saveConfig = withCheckModifiers({
      actor,
      label: `${actor.name} — ${cap(spec.save)} Save`,
      subtitle: `${title || peril.name} — DC ${dc}${spec.dc ? "" : ` (${peril.name}'s Level DC)`}`,
      type: "save",
      save: spec.save,
      dc
    });
    if (scaly) saveConfig.modifiers = [...(saveConfig.modifiers ?? []), scaly.saveModifier];
    const check = await TRGCheck.roll(saveConfig);
    const degree = check?.outcome?.degree;
    let key = degree?.key ?? "failure";
    // "A CREATURE AT LEAST TWO SIZES LARGER TREATS ITS SAVE RESULT AS ONE
    // DEGREE BETTER" (Wing Buffet, 3.631.0): `degreeShift: { largerBy: 2, steps: 1 }`.
    if (spec.degreeShift?.largerBy) {
      const { sizeSteps } = await import("./combat/space.mjs");
      const { DEGREE_ORDER } = await import("./creature-activation.mjs");
      const larger = sizeSteps(actor.system?.identity?.size, peril.system?.identity?.size);
      if (larger >= Number(spec.degreeShift.largerBy)) {
        const at = DEGREE_ORDER.indexOf(key);
        const shifted = DEGREE_ORDER[Math.max(0, at - (Number(spec.degreeShift.steps) || 1))];
        if (shifted && shifted !== key) { parts0.push(`${actor.name} is ${larger} sizes larger: ${key} read as <strong>${shifted}</strong>.`); key = shifted; }
      }
    }
    const outcome = perilEffectOutcome(spec, key, clock);
    if (Number(spec.immunitySeconds) > 0 && actor.setFlag) {
      await actor.setFlag(SYSTEM_ID, "areaImmunities", { ...windows, [windowKey]: now() + Number(spec.immunitySeconds) });
    }
    // WHO TOOK WHAT (3.631.0): a breath's follow-ups read this next turn.
    const record = { actorId: actor.id, uuid: actor.uuid, name: actor.name, degree: key, damage: 0 };
    if (Array.isArray(results)) results.push(record);
    // A rung that prints nothing and applies nothing is unaffected (3.629.1):
    // an inline "On a Failure or worse" ladder leaves the rungs above it blank.
    // The rung's own damage (3.631.0) counts as an effect; it is rolled below.
    const rungFormula = spec.damageByRung?.[key] ?? spec.damageByRung?.[FALLBACK_RUNG[key] ?? ""];
    const unaffected = !outcome.text && !outcome.rows.length && !damageRoll && !rungFormula;
    const parts = [...parts0, `${actor.name}: ${cap(spec.save)} <strong>${degree?.label ?? "?"}</strong>${outcome.text ? ` — ${outcome.text}` : unaffected ? " — unaffected." : ""}`];

    // "Increase Frightened by 1", and what spills past its cap.
    const increased = perilIncreaseRows(outcome.rows, (k) => Number(actor.getConditionValue?.(k) ?? 0), spec.overflow)
      .map((r) => declaredConditionTag(r, clock));
    const tags = [...outcome.tags, ...increased].map((t) => ({ ...t, label: conditionLabel(t.key) }));
    if (tags.length) {
      const applied = await relayConditionTags(actor, tags, {}, () => applyConditionTags(actor, tags, {}));
      parts.push(`Applied: ${formatAppliedTags(applied ?? [])}.`);
    }

    // A CRITICAL INJURY BY RUNG (3.631.0): Crush — "Partial … and a Minor
    // critical, Failure … a Serious critical, Fumble … a Deadly critical".
    const rungSeverity = String(spec.criticals?.[key] ?? spec.criticals?.[FALLBACK_RUNG[key] ?? ""] ?? "").trim().toLowerCase();
    if (rungSeverity && ["minor", "serious", "deadly"].includes(rungSeverity)) {
      const { rollCriticalInjury } = await import("./combat/attack-workflow.mjs");
      await rollCriticalInjury(peril, { targetActor: actor, damageType: spec.damage?.type || "bludgeoning", severity: rungSeverity, attackBonus: 0 });
      parts.push(`A <strong>${rungSeverity}</strong> critical injury.`);
    }

    // DAMAGE BY RUNG (3.631.0): Crush's 1d10 / 2d10 / 4d10 / 6d10 / 8d10, Wing
    // Buffet's wing damage — no basic halving, the rung IS the amount.
    if (rungFormula && !damageRoll) {
      const rungRoll = await new Roll(String(rungFormula)).evaluate();
      const amount = Math.max(0, Math.floor(rungRoll.total));
      if (amount > 0) {
        const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
        const dealt = await applyTypedDamage(actor, { amount, type: spec.damageType || "bludgeoning", drBypassed: spec.drBypassed === true, sourceLevel: level, sourceName: peril.name, area: spec.isCreatureArea === true });
        record.damage = Number(dealt?.applied ?? 0) || 0;
        parts.push(`${rungFormula}: ${describeDamage(dealt.packet, actor.name)}`);
      }
    }

    if (damageRoll) {
      const bs = spec.basic ? basicSavingThrow(key, check?.outcome?.margin ?? null) : { damageMultiplier: degree?.success ? 0 : 1, bonusBaseDamage: 0 };
      let total = damageRoll.total;
      if (bs.bonusBaseDamage > 0) {
        const bonus = await new Roll(`${bs.bonusBaseDamage}d${die}`).evaluate();
        total += bonus.total;
        parts.push(`${bs.criticalSeverity ?? "Missed badly"}: +${bs.bonusBaseDamage} base (${bonus.total}).`);
      }
      const amount = Math.floor(total * bs.damageMultiplier);
      if (amount > 0) {
        const { applyTypedDamage, describeDamage, setResistanceBypass, clearResistanceBypass } = await import("./combat/damage-workflow.mjs");
        // PENETRATING BREATH (3.631.0): "bypasses DR … and ignores Energy Resistance".
        if (spec.ignoreResistance) setResistanceBypass([spec.damage.type], 5);
        const dealt = await applyTypedDamage(actor, { amount, type: spec.damage.type, drBypassed: spec.drBypassed === true, sourceLevel: level, sourceName: peril.name, extraResistance: scaly?.resist ? spec.damage.type : "",
          // A creature's declared area is an area effect; a Swarm's attack halves DR (3.632.0).
          area: spec.isCreatureArea === true, attackerIsSwarm: spec.scope === "sharedSpace" });
        if (spec.ignoreResistance) clearResistanceBypass();
        record.damage = Number(dealt?.applied ?? 0) || 0;
        parts.push(describeDamage(dealt.packet, actor.name));
      } else {
        parts.push("No damage.");
      }
      // …AND EACH FURTHER PACKET, under the same save's multiplier.
      for (const extra of extraRolls) {
        const extraAmount = Math.floor(extra.roll.total * bs.damageMultiplier);
        if (extraAmount <= 0) continue;
        const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
        const dealt = await applyTypedDamage(actor, { amount: extraAmount, type: extra.type, drBypassed: spec.drBypassed === true, sourceLevel: level, sourceName: peril.name, extraResistance: scaly?.resist ? extra.type : "",
          area: spec.isCreatureArea === true, attackerIsSwarm: spec.scope === "sharedSpace" });
        record.damage += Number(dealt?.applied ?? 0) || 0;
        parts.push(describeDamage(dealt.packet, actor.name));
      }
    }
    lines.push(line(parts.join(" ")));

    // A PUSH BY RUNG (3.631.0): Wing Buffet — "pushed 5 / 10 / 20 feet
    // directly away". Offered as a button on its own card, per Graham's
    // ruling of 23 August 2026 (forced movement is offered, not applied).
    const pushFeet = Number(spec.push?.[key] ?? spec.push?.[FALLBACK_RUNG[key] ?? ""] ?? 0) || 0;
    if (pushFeet > 0) {
      const { pushButtonsHtml, resolvePushTokens } = await import("./combat/forced-movement-workflow.mjs");
      const { involuntaryMovementPrompts } = await import("./combat/forced-movement.mjs");
      const tokens = resolvePushTokens(peril, actor);
      const buttons = tokens ? pushButtonsHtml({ feet: pushFeet, upTo: false }, Number(canvas?.scene?.grid?.distance ?? 5), involuntaryMovementPrompts(actor)) : "";
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: peril }),
        content: `<div class="trg-prime"><p>${title || peril.name}: ${actor.name} is pushed <strong>${pushFeet} ft</strong> directly away.</p>${buttons || "<p><em>Both tokens must be on the scene for the push button.</em></p>"}</div>`,
        ...(tokens ? { flags: { [SYSTEM_ID]: { forcedMovement: { ...tokens, offeredFeet: pushFeet, upTo: false } } } } : {})
      });
    }
  }
  for (const n of spec.notes ?? []) lines.push(line(`<em>${n}</em>`));
  return lines;
}

/** Into the combat, and its Initiative rolled: "When triggered, it rolls Initiative." */
async function joinCombat(peril) {
  const token = perilToken(peril);
  if (!token) return line(`<em>${peril.name} has no token on the scene — place it and roll its Initiative by hand.</em>`);
  let combat = game.combats?.find?.((c) => c.scene?.id === token.parent?.id && c.active) ?? game.combat ?? null;
  if (!combat) combat = await Combat.implementation.create({ scene: token.parent?.id ?? null, active: true });
  let combatant = combat.combatants.find((c) => c.tokenId === token.id);
  if (!combatant) [combatant] = await combat.createEmbeddedDocuments("Combatant", [{ tokenId: token.id, sceneId: token.parent?.id, actorId: peril.id }]);
  if (combatant && (combatant.initiative === null || combatant.initiative === undefined)) await combat.rollInitiative([combatant.id]);
  return line(`<strong>It rolls Initiative</strong> and performs its Routine each round.`);
}

/**
 * TRIGGER (3.629.0): "Once the Trigger occurs, resolve the haunt's Reaction
 * or Free Action according to its stat block." The GM's button. A peril
 * that is suppressed, disabled, resolved, broken or destroyed refuses; a
 * suppression whose clock has run out is armed first.
 *
 * A module may register an automation for a peril whose Effect is more than
 * a save (the Hungry Reliquary's redistribution): it runs in place of the
 * generic one, with the same targets and DC.
 */
export async function triggerPeril(peril) {
  if (!game.user?.isGM || !isPeril(peril)) return null;
  const raw = peril.system?.gm?.peril;
  const p = normalisePeril(raw);
  const can = perilCanAct(raw, now());
  if (can.rearm) await rearm(peril);
  else if (!can.ok) {
    ui.notifications?.warn(`${peril.name} cannot trigger — ${can.reason}.`);
    return false;
  }
  const lines = [];
  if (p.trigger) lines.push(line(`<strong>Trigger:</strong> ${p.trigger}`));
  const spec = perilEffectSpec(p.effect, p.effectText);
  const automation = p.automation ? await registeredPerilAutomationFor(p.automation) : null;
  if (automation?.trigger) {
    lines.push(...await automation.trigger(peril, { spec, lines: [], helpers: perilHelpers() }));
  } else if (spec) {
    lines.push(...await runPerilEffect(peril, spec, { title: peril.name }));
  } else {
    lines.push(line("<em>No Effect is written on its sheet — resolve it from the stat block.</em>"));
  }
  const complex = p.actionType === "complex" || Boolean(spec?.initiative);
  await peril.update({ "system.gm.peril.state": complex ? "triggered" : perilStateAfterTrigger(raw) });
  if (complex) lines.push(await joinCombat(peril));
  else if (p.reset) lines.push(line(`<strong>Reset:</strong> ${p.reset}`));
  await card(peril, `${peril.name} — Triggered`, lines);
  return true;
}

/**
 * A ROUTINE ACTION'S USE (3.629.0): an ability on a peril that declares an
 * Effect (`flags.trg-prime.perilEffect`, text or object, or a registered
 * `perilAutomation`) is rolled and applied against the GM's targets — or
 * everyone in its radius. "A suppressed haunt … cannot perform its Routine."
 *
 * @returns {Promise<boolean|null>} null when this is not a peril's routine action
 */
export async function usePerilRoutine(actor, item) {
  const declared = item?.flags?.[SYSTEM_ID]?.perilEffect;
  const automationKey = String(item?.flags?.[SYSTEM_ID]?.perilAutomation ?? "").trim();
  if (!isPeril(actor) || (!declared && !automationKey)) return null;
  const can = perilCanAct(actor.system?.gm?.peril, now());
  if (can.rearm && actor.isOwner) await rearm(actor);
  else if (!can.ok) {
    ui.notifications?.warn(`${item.name}: ${actor.name} cannot act — ${can.reason}.`);
    return false;
  }
  const spec = perilEffectSpec(declared, "");
  const automation = automationKey ? await registeredPerilAutomationFor(automationKey) : null;
  const lines = automation?.use
    ? await automation.use(actor, item, { spec, helpers: perilHelpers() })
    : await runPerilEffect(actor, spec, { title: item.name });
  await card(actor, item.name, lines);
  return true;
}

/** A module's registered peril automation, or null. */
async function registeredPerilAutomationFor(key) {
  const { registeredPerilAutomation } = await import("./module-api.mjs");
  return registeredPerilAutomation(key);
}

/** What a registered automation gets to work with. */
function perilHelpers() {
  return Object.freeze({ line, card, runPerilEffect, effectTargets, levelOf, perilToken, now });
}
