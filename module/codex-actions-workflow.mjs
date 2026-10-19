/**
 * THE CODEX'S OWN USE BUTTONS (3.631.0; Fiends & Fables 3.0 block 1,
 * Chapter 2 — Graham's ruling of 9 October 2026: "all automated").
 *
 * Abilities whose Use is a mechanism of their own rather than an area save
 * (creature-area.mjs) or a move-and-strike (combat/compound-action.mjs).
 * Declared on the entry as `creatureAbility.action = { kind, … }`:
 *
 *   constrict         1 AP: the Constrict damage to every creature this one
 *                     has Grabbed, each with a basic Fortitude save
 *   rend              Free: "strikes a target twice with the listed attack
 *                     type" this turn — the attack's damage again
 *   tearFlesh         1 AP after a damaging Bite: the previous attack's
 *                     result again, its critical rolled again
 *   abyssalHealing    1 AP, PP up to its level: heal 1d6/level, Bleeding
 *                     -1/level, or Injured -1 per 2 levels (max 5)
 *   swallow           1 AP vs a Grabbed target one size smaller: Athletics
 *                     against its Reflex DC; swallowed — Grabbed, Slowed 1,
 *                     acid at the start of each of its turns
 *   magicDispelling   a Dispel at 0 PP, 3/day
 *   whispersOfTheGrave 1 minute: Level-based Meditation, the ladder, then a
 *                     Hard exhaustion check; 24-hour immunity per target
 *   amorphousSplit    the split, offered: a copy with half the HP each
 *   eternalSummons    2 AP: kindred eternals 4 / 6 / 8 levels lower, placed
 *                     adjacent, 1 minute per 5 levels
 *   trample           3 AP: twice its Speed through smaller creatures' spaces,
 *                     the slam +1 die to each, basic Reflex; no reactions
 *   draconicShifting  1 AP: the humanoid form, toggled — Strikes become
 *                     unarmed subdual while it lasts
 *   carrionFeast      1 AP: an adjacent body heals the declared dice, once
 *                     per body per feeder (3.647.0)
 *   sizeShift         2 AP, once a day: an unwilling target one size step
 *                     larger or smaller, for as long as its Fortitude save
 *                     allows (3.647.0)
 *   strikeBurst       a Strike with an extra damage packet, then an area
 *                     save around the striker (Thundering Strike; 3.649.0)
 *   sweepingStrike    one attack roll against every creature within reach
 *                     + N feet, one damage roll (Lightning Strike; 3.649.0)
 *   toggleEffect      an effect the creature turns on and off (3.650.0)
 *
 * Routed from useCreatureAbility (creature-activation-workflow.mjs).
 */
const SYSTEM_ID = "trg-prime";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const cap = (s) => (s ? `${s[0].toUpperCase()}${s.slice(1)}` : s);
const now = () => Number(game.time?.worldTime ?? 0);
const levelOf = (a) => Math.max(0, Math.floor(Number(a?.system?.identity?.level ?? 0) || 0));

async function card(actor, title, lines, flags = null) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`,
    ...(flags ? { flags: { [SYSTEM_ID]: flags } } : {})
  });
}

async function spendAp(actor, ap, label) {
  if (!(Number(ap) > 0)) return true;
  const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  if (!(await ensureActionPoints(actor, ap, label))) return false;
  await spendActionPoints(actor, ap, label);
  return true;
}

/** Every creature on the scene this one has Grabbed. */
function grabbedByActor(actor) {
  const out = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    const t = token.actor;
    if (!t || t.id === actor.id) continue;
    if (!t.hasCondition?.("grabbed")) continue;
    if (String(t.getFlag?.(SYSTEM_ID, "grabbedBy")?.uuid ?? "") !== String(actor.uuid)) continue;
    out.push(t);
  }
  return out;
}

async function rollSave(actor, save, dc, label, subtitle) {
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  return TRGCheck.roll(withCheckModifiers({ actor, label, subtitle, type: "save", save, dc }));
}

async function dealTyped(target, amount, type, source) {
  const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
  const dealt = await applyTypedDamage(target, { amount, type, sourceLevel: levelOf(source), sourceName: source.name });
  return describeDamage(dealt.packet, target.name);
}

/* ------------------------------------------------------------------ */

async function constrict(actor, item, spec) {
  // MANDIBLES (3.639.0, F&F 3.0 block 9 R4): "any creature that is grabbed
  // AND PARALYZED" — `requireCondition` narrows the held to those.
  const { constrictTargets, constrictSaveResult, constrictExtraPackets } = await import("./codex-action-rules.mjs");
  const held = constrictTargets(grabbedByActor(actor), spec, (t, key) => Boolean(t.hasCondition?.(key)));
  if (!held.length) { ui.notifications?.warn(`${item.name}: ${actor.name} has nobody Grabbed${spec.requireCondition ? ` and ${spec.requireCondition}` : ""}.`); return false; }
  if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  const weapon = Array.from(actor.items ?? []).find((i) => i.type === "weapon" && /constrict/i.test(i.name));
  const formula = String(spec.dice ?? weapon?.system?.damage ?? "").trim();
  if (!formula) { await card(actor, item.name, [line("No Constrict damage is listed on this creature — add a weapon named Constrict.")]); return true; }
  const { basicSavingThrow, levelDC } = await import("./dice/resolution.mjs");
  const dc = levelDC(levelOf(actor));
  const type = String(spec.damageType ?? weapon?.system?.damageType ?? "bludgeoning");
  const lines = [line(`<strong>${formula} ${type}</strong> ${constrictExtraPackets(spec).map((x) => ` plus <strong>${x.dice} ${x.type}</strong>`).join("")} to each creature it holds${spec.requireCondition ? ` that is ${spec.requireCondition}` : ""}; basic Fortitude save, DC ${dc}${spec.saveAvoidsCriticalOnly ? " — the save avoids only the critical; full damage is still inflicted" : ""}.`)];
  for (const target of held) {
    const roll = await new Roll(formula).evaluate();
    const check = await rollSave(target, "fortitude", dc, `${target.name} — Fortitude Save`, `${item.name} — DC ${dc}`);
    const bs = constrictSaveResult(basicSavingThrow(check?.outcome?.degree?.key ?? "failure", check?.outcome?.margin ?? null), spec);
    let total = roll.total;
    if (bs.bonusBaseDamage > 0) total += (await new Roll(`${bs.bonusBaseDamage}d${/d(\d+)/.exec(formula)?.[1] ?? 6}`).evaluate()).total;
    const amount = Math.floor(total * bs.damageMultiplier);
    // DRAINING KISS (3.640.0, F&F 3.0 block 10 R7): what was dealt heals the
    // creature; a condition lands, capped; a second save follows.
    let dealtLine = "no damage.";
    let applied = 0;
    if (amount > 0) {
      const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
      const dealt = await applyTypedDamage(target, { amount, type, sourceLevel: levelOf(actor), sourceName: actor.name });
      applied = Number(dealt?.applied ?? 0) || 0;
      dealtLine = describeDamage(dealt.packet, target.name);
    }
    // A SECOND PACKET (3.654.0; block 21 R9 — the Ochre Jelly's "2d8+6
    // bludgeoning plus 1d6 acid"): rolled for each creature, met by its own
    // defences, under the same save.
    for (const extra of constrictExtraPackets(spec)) {
      const xr = await new Roll(extra.dice).evaluate();
      const xAmount = Math.floor(xr.total * bs.damageMultiplier);
      if (xAmount > 0) {
        const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
        const xd = await applyTypedDamage(target, { amount: xAmount, type: extra.type, sourceLevel: levelOf(actor), sourceName: actor.name });
        applied += Number(xd?.applied ?? 0) || 0;
        dealtLine = dealtLine === "no damage." ? describeDamage(xd.packet, target.name) : `${dealtLine} Plus ${describeDamage(xd.packet, target.name)}`;
      }
    }
    lines.push(line(`${target.name}: Fortitude <strong>${check?.outcome?.degree?.label ?? "?"}</strong> — ${dealtLine}`));
    lines.push(...await constrictRiders(actor, item, spec, target, applied));
  }
  await card(actor, item.name, lines);
  return true;
}

/** Draining Kiss's riders on one held creature (3.640.0): heal, condition, follow-up save. */
async function constrictRiders(actor, item, spec, target, applied) {
  const out = [];
  const { cappedConditionValue } = await import("./codex-action-rules.mjs");
  if (spec.healSelf && applied > 0) {
    const { healActor } = await import("./magic/spell-effects.mjs");
    const healed = Number(await healActor(actor, applied, { magical: false })) || 0;
    out.push(line(`${actor.name} regains <strong>${healed} HP</strong>.`));
  }
  if (spec.condition?.key) {
    const add = cappedConditionValue(target.getConditionValue?.(spec.condition.key) ?? 0, spec.condition.value, spec.condition.max);
    if (add > 0) {
      const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
      const { relayConditionTags } = await import("./combat/target-relay-workflow.mjs");
      const { conditionLabel } = await import("./conditions/condition-rules.mjs");
      const tags = [{ key: spec.condition.key, value: add, label: conditionLabel(spec.condition.key) }];
      const done = await relayConditionTags(target, tags, {}, () => applyConditionTags(target, tags, {}));
      out.push(line(`${target.name}: ${formatAppliedTags(done ?? [])}${spec.condition.max ? ` (at most ${spec.condition.max})` : ""}.`));
    } else if (spec.condition.max) out.push(line(`${target.name} is already at ${spec.condition.max} — no more.`));
  }
  if (spec.followSave?.save) {
    const key = String(spec.followSave.save).toLowerCase();
    const { levelDC } = await import("./dice/resolution.mjs");
    const dc = Number(spec.followSave.dc) || levelDC(levelOf(actor));
    const check = await rollSave(target, key, dc, `${target.name} — ${cap(key)} Save`, `${item.name} — DC ${dc}`);
    const failed = !check?.outcome?.degree?.success;
    out.push(line(`${target.name}: ${cap(key)} <strong>${check?.outcome?.degree?.label ?? "?"}</strong> against DC ${dc}${failed && spec.followSave.failure ? ` — ${spec.followSave.failure}` : failed ? "." : " — unaffected."}`));
  }
  return out;
}

/**
 * A BASIC ACTION WITH ITS CHECK REPLACED (3.640.0, F&F 3.0 block 10 R7) —
 * the Succubus's Embrace: "makes a grapple check using its diplomacy
 * skill". The basic action runs as itself (its AP, its outcomes, the hold
 * it lays), rolled with the named skill.
 */
async function basicAction(actor, item, spec) {
  const { BASIC_ACTIONS } = await import("./data/basic-actions.mjs");
  const base = BASIC_ACTIONS.find((a) => a.key === spec.action);
  if (!base) { ui.notifications?.warn(`${item.name}: no basic action "${spec.action}".`); return false; }
  const { basicActionWithSkill } = await import("./codex-action-rules.mjs");
  const action = basicActionWithSkill(base, spec, item.name);
  const { resolveAction } = await import("./combat/action-workflow.mjs");
  await resolveAction(actor, action, { invokedSkillKey: spec.skill ?? null });
  return true;
}

async function rend(actor, item, spec) {
  const log = Array.isArray(actor.getFlag?.(SYSTEM_ID, "strikeLog")) ? actor.getFlag(SYSTEM_ID, "strikeLog") : [];
  const round = Number(game.combat?.round ?? 0), turn = Number(game.combat?.turn ?? 0);
  const pattern = spec.weapon ? new RegExp(String(spec.weapon), "i") : /./;
  const thisTurn = log.filter((e) => e.round === round && e.turn === turn && e.damage > 0 && pattern.test(e.weaponName));
  const byTarget = new Map();
  for (const e of thisTurn) byTarget.set(e.targetUuid, [...(byTarget.get(e.targetUuid) ?? []), e]);
  const pair = Array.from(byTarget.entries()).find(([, hits]) => hits.length >= 2);
  if (!pair) { ui.notifications?.warn(`${item.name}: no target has been hit twice this turn by ${spec.weapon ?? "the listed attack"}.`); return false; }
  const [uuid, hits] = pair;
  const doc = await fromUuid(uuid).catch(() => null);
  const target = doc?.actor ?? doc;
  const last = hits[hits.length - 1];
  const weapon = actor.items?.get?.(last.weaponId);
  const { weaponDamageFormula } = await import("./creature-area.mjs");
  const formula = weapon ? weaponDamageFormula(weapon, { bab: Number(actor.system?.combat?.bab?.total ?? 0), strength: Number(actor.system?.attributes?.strength?.total ?? 0) }) : String(last.rolled);
  const roll = await new Roll(formula).evaluate();
  const lines = [line(`${last.weaponName} struck ${last.targetName} twice this turn — "an additional amount of damage equal to the attack's damage".`)];
  lines.push(line(target ? `${formula} = ${roll.total}: ${await dealTyped(target, roll.total, last.damageType || weapon?.system?.damageType || "slashing", actor)}` : `${formula} = ${roll.total} (the target is no longer on the scene).`));
  await card(actor, item.name, lines);
  return true;
}

async function tearFlesh(actor, item, spec) {
  const log = Array.isArray(actor.getFlag?.(SYSTEM_ID, "strikeLog")) ? actor.getFlag(SYSTEM_ID, "strikeLog") : [];
  const last = log[log.length - 1];
  const pattern = new RegExp(String(spec.weapon ?? "bite"), "i");
  if (!last || !pattern.test(last.weaponName) || last.damage <= 0) { ui.notifications?.warn(`${item.name}: its previous action must have been a damaging ${spec.weapon ?? "Bite"}.`); return false; }
  if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  const doc = await fromUuid(last.targetUuid).catch(() => null);
  const target = doc?.actor ?? doc;
  const lines = [line(`Hits again automatically with the previous ${last.weaponName}'s result: <strong>${last.rolled}</strong> ${last.damageType}.`)];
  if (target) {
    lines.push(line(await dealTyped(target, last.rolled, last.damageType || "piercing", actor)));
    if (last.critical) {
      const { rollCriticalInjury } = await import("./combat/attack-workflow.mjs");
      await rollCriticalInjury(actor, { targetActor: target, damageType: last.damageType || "piercing", severity: last.critical, attackBonus: Number(actor.system?.combat?.attack?.total ?? 0) });
      lines.push(line(`The ${last.critical} critical is rolled again.`));
    }
  }
  await card(actor, item.name, lines);
  return true;
}

async function abyssalHealing(actor, item, spec) {
  const level = levelOf(actor);
  const { DialogV2 } = foundry.applications.api;
  const current = Number(actor.system?.resources?.pp?.value ?? 0);
  const max = Math.min(level, current);
  if (max <= 0) { ui.notifications?.warn(`${item.name}: no Power Points to spend.`); return false; }
  const choice = await DialogV2.wait({
    window: { title: item.name }, classes: [SYSTEM_ID], position: { width: 420 },
    content: `<div class="trg-prime trg-check-dialog"><p>1 AP; PP up to its level (${level}). Spend <input type="number" name="pp" value="${max}" min="1" max="${max}" style="width:4em"> PP and choose:</p>
      <label><input type="radio" name="mode" value="heal" checked> Healing — 1d6 HP per PP</label><br>
      <label><input type="radio" name="mode" value="bleed"> Bleed Control — Bleeding −1 per PP</label><br>
      <label><input type="radio" name="mode" value="injury"> Injury Recovery — Injured −1 per 2 PP (max 5)</label></div>`,
    buttons: [
      { action: "ok", label: "Use", default: true, callback: (ev, button) => new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(button.form ?? button.closest("form")).object },
      { action: "cancel", label: "Cancel" }
    ],
    rejectClose: false
  });
  if (!choice || choice === "cancel") return false;
  const pp = Math.max(1, Math.min(max, Math.floor(Number(choice.pp) || 1)));
  if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  const { applyPowerPointCost } = await import("./power-points-workflow.mjs");
  const paid = await applyPowerPointCost(actor, pp, item.name);
  const lines = [line(`<strong>${pp} PP</strong> spent${paid.note ? ` — ${paid.note}` : ""}.`)];
  if (choice.mode === "heal") {
    const roll = await new Roll(`${pp}d6`).evaluate();
    const { healActor } = await import("./magic/spell-effects.mjs");
    const healed = Number(await healActor(actor, roll.total, { magical: true })) || 0;
    lines.push(line(`Healing: ${pp}d6 = ${roll.total} — <strong>${healed} HP</strong> regained.`));
  } else {
    const key = choice.mode === "bleed" ? "bleeding" : "injured";
    const amount = choice.mode === "bleed" ? pp : Math.min(5, Math.floor(pp / 2));
    const before = Number(actor.getConditionValue?.(key) ?? 0);
    const after = Math.max(0, before - amount);
    await actor.toggleStatusEffect(key, { active: after > 0, value: after });
    lines.push(line(`${cap(key)} ${before} → <strong>${after}</strong> (−${amount}).`));
  }
  await card(actor, item.name, lines);
  return true;
}

async function swallow(actor, item, spec) {
  const held = grabbedByActor(actor);
  const { sizeSteps } = await import("./combat/space.mjs");
  const candidates = held.filter((t) => sizeSteps(actor.system?.identity?.size, t.system?.identity?.size) >= 1);
  if (!candidates.length) { ui.notifications?.warn(`${item.name}: needs a Grabbed target at least one size smaller.`); return false; }
  const target = candidates[0];
  if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const reflexDC = Number(target.system?.combat?.saves?.reflex?.dc ?? (Number(target.system?.combat?.saves?.reflex?.total ?? 0) + 10));
  const skill = actor.system?.skills?.athletics;
  const check = await TRGCheck.roll(withCheckModifiers({
    actor, label: `${actor.name} — Athletics`, subtitle: `${item.name} — against ${target.name}'s Reflex DC ${reflexDC}`,
    type: "skill", subject: "athletics", dc: reflexDC,
    modifiers: skill?.checkModifiers ?? [{ label: "Athletics", value: Number(skill?.total ?? 0), type: "untyped" }]
  }));
  const lines = [line(`Athletics <strong>${check?.outcome?.degree?.label ?? "?"}</strong> against ${target.name}'s Reflex DC ${reflexDC}.`)];
  if (check?.outcome?.degree?.success) {
    const bite = Array.from(actor.items ?? []).find((i) => i.type === "weapon" && /bite/i.test(i.name));
    const { weaponDamageFormula } = await import("./creature-area.mjs");
    const biteFormula = bite ? weaponDamageFormula(bite, { bab: Number(actor.system?.combat?.bab?.total ?? 0), strength: Number(actor.system?.attributes?.strength?.total ?? 0) }) : "1d6";
    const { applyConditionTags, formatAppliedTags } = await import("./combat/effect-application-workflow.mjs");
    const { relayConditionTags } = await import("./combat/target-relay-workflow.mjs");
    const tags = [{ key: "grabbed", label: "Grabbed" }, { key: "slowed", label: "Slowed", value: 1 }];
    const applied = await relayConditionTags(target, tags, {}, () => applyConditionTags(target, tags, {}));
    await target.setFlag(SYSTEM_ID, "swallowedBy", { uuid: actor.uuid, name: actor.name, biteFormula, maxHP: Number(actor.system?.resources?.hp?.max ?? 0) });
    const { startHoldingBreath } = await import("./drowning-workflow.mjs");
    try { await startHoldingBreath(target); } catch (_e) { /* a creature that does not breathe */ }
    lines.push(line(`<strong>${target.name} is swallowed</strong>: ${formatAppliedTags(applied)}; holding its breath. Takes <strong>2 × (${biteFormula}) acid</strong> now and at the start of each of its turns — opposed Level-based basic Fortitude, Very Hard (+5).`));
    lines.push(...await swallowedAcid(actor, target, { biteFormula }));
    lines.push(line(`<em>Escape: the Escape action, or cut free from inside — flat-footed to it, but it resists such attacks; more than ${Math.ceil(Number(actor.system?.resources?.hp?.max ?? 0) * 0.1)} damage (10% of its HP) tears free.</em>`));
  }
  await card(actor, item.name, lines);
  return true;
}

/** The acid a swallowed creature takes, now and at the start of each of its turns. */
async function swallowedAcid(swallower, target, { biteFormula }) {
  const { basicSavingThrow, levelDC } = await import("./dice/resolution.mjs");
  const dc = levelDC(levelOf(swallower)) + 5;
  const check = await rollSave(target, "fortitude", dc, `${target.name} — Fortitude Save`, `Swallowed by ${swallower.name} — DC ${dc} (Level DC, Very Hard +5)`);
  const bs = basicSavingThrow(check?.outcome?.degree?.key ?? "failure", check?.outcome?.margin ?? null);
  const roll = await new Roll(`2*(${biteFormula})`).evaluate();
  const amount = Math.floor(roll.total * bs.damageMultiplier);
  return [line(`${target.name}: Fortitude <strong>${check?.outcome?.degree?.label ?? "?"}</strong> — ${amount > 0 ? await dealTyped(target, amount, "acid", swallower) : "no acid damage."}`)];
}

async function magicDispelling(actor, item, spec) {
  const usesMax = Math.max(1, Number(spec.perDay ?? 3));
  const uses = Number(item.system?.usesValue ?? usesMax);
  if (uses <= 0) { ui.notifications?.warn(`${item.name}: no uses left today (resets at Daily Preparation).`); return false; }
  const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  if (!target) { ui.notifications?.warn(`${item.name}: target the creature or object whose magic it dispels.`); return false; }
  if (!(await spendAp(actor, spec.ap ?? 2, item.name))) return false;
  await item.update({ "system.usesValue": uses - 1, "system.usesPerDay": String(usesMax) });
  const { levelDC } = await import("./dice/resolution.mjs");
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const dc = levelDC(levelOf(target));
  const skill = actor.system?.skills?.powerManipulation;
  const check = await TRGCheck.roll(withCheckModifiers({
    actor, label: `${actor.name} — Dispel (Power Manipulation)`, subtitle: `${item.name} — 0 PP, ${uses - 1} use(s) left today; against ${target.name}'s Level DC ${dc}`,
    type: "skill", subject: "powerManipulation", dc,
    modifiers: skill?.checkModifiers ?? [{ label: "Power Manipulation", value: Number(skill?.total ?? 0), type: "untyped" }]
  }));
  const active = Array.from(target.effects ?? []).filter((e) => !e.disabled && (e.getFlag?.(SYSTEM_ID, "castId") || e.getFlag?.(SYSTEM_ID, "spellEffect")));
  await card(actor, item.name, [line(`Dispel <strong>${check?.outcome?.degree?.label ?? "?"}</strong> against DC ${dc} at 0 PP. ${target.name} carries ${active.length ? active.map((e) => e.name).join(", ") : "no active spell effects"}${check?.outcome?.degree?.success && active.length ? " — end one (counteracted)." : "."}`)]);
  return true;
}

async function whispersOfTheGrave(actor, item, spec) {
  const target = Array.from(game.user?.targets ?? [])[0]?.actor ?? null;
  if (!target) { ui.notifications?.warn(`${item.name}: target the spirit or undead.`); return false; }
  const windows = actor.getFlag?.(SYSTEM_ID, "whispersWindows") ?? {};
  const k = String(target.uuid).replace(/\./g, "_");
  if (Number(windows[k]) > now()) { ui.notifications?.warn(`${item.name}: ${target.name} is immune for 24 hours after the last attempt.`); return false; }
  const { levelDC } = await import("./dice/resolution.mjs");
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const dc = levelDC(levelOf(target));
  const skill = actor.system?.skills?.meditation;
  const check = await TRGCheck.roll(withCheckModifiers({
    actor, label: `${actor.name} — Meditation`, subtitle: `${item.name} — 1 minute; opposed, against ${target.name}'s Level DC ${dc}`,
    type: "skill", subject: "meditation", dc,
    modifiers: skill?.checkModifiers ?? [{ label: "Meditation", value: Number(skill?.total ?? 0), type: "untyped" }]
  }));
  const ladder = {
    heroic: "Communicates with the target (as a Critical).", critical: "Communicates with the target spirit or sentient undead (it need not answer, nor grow friendlier).",
    success: "Communicates with the target, but its answers are cryptic and possibly whimsical.", partial: "A general empathic sense of the target, nothing further.",
    failure: "No effect.", fumble: "No effect.", blunder: "The target spirit or sentient undead dominates the creature for 1 minute (GM discretion)."
  };
  const key = check?.outcome?.degree?.key ?? "failure";
  await actor.setFlag(SYSTEM_ID, "whispersWindows", { ...windows, [k]: now() + 86400 });
  const exhaustDC = levelDC(levelOf(actor)) + 2;
  const ex = await rollSave(actor, "fortitude", exhaustDC, `${actor.name} — Exhaustion check`, `${item.name} — Hard (DC +2) exhaustion check, DC ${exhaustDC}`);
  await card(actor, item.name, [
    line(`Meditation <strong>${check?.outcome?.degree?.label ?? "?"}</strong> against DC ${dc}: ${ladder[key] ?? ladder.failure}`),
    line(`Exhaustion check (Hard, DC ${exhaustDC}): <strong>${ex?.outcome?.degree?.label ?? "?"}</strong>${ex?.outcome?.degree?.success ? "." : " — Fatigued +1."}`),
    line(`<em>${target.name} is immune to this ability for 24 hours.</em>`)
  ]);
  if (ex && !ex.outcome?.degree?.success) {
    const fat = Number(actor.getConditionValue?.("fatigued") ?? 0);
    await actor.toggleStatusEffect("fatigued", { active: true, value: fat + 1 });
  }
  return true;
}

async function amorphousSplit(actor, item, spec) {
  const hp = Number(actor.system?.resources?.hp?.value ?? 0);
  if (hp <= 20) { ui.notifications?.warn(`${item.name}: at ${hp} HP it cannot split (20 or less).`); return false; }
  const token = actor.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
  const half = Math.floor(hp / 2);
  const other = hp - half;
  await actor.update({ "system.resources.hp.value": half });
  const lines = [line(`Split: ${actor.name} keeps <strong>${half} HP</strong>; its twin has <strong>${other} HP</strong>.`)];
  if (token?.parent) {
    const size = canvas?.dimensions?.size ?? 100;
    const data = token.toObject();
    delete data._id;
    data.x = Number(token.x) + size * Math.max(1, Number(token.width ?? 1));
    if (!token.actorLink) {
      data.delta = foundry.utils.mergeObject(data.delta ?? {}, { system: { resources: { hp: { value: other } } } });
      await token.parent.createEmbeddedDocuments("Token", [data]);
    } else {
      const twin = await Actor.create({ ...actor.toObject(), name: `${actor.name} (split)`, _id: undefined, system: foundry.utils.mergeObject(actor.toObject().system, { resources: { hp: { value: other } } }) });
      data.actorId = twin.id; data.name = twin.name;
      await token.parent.createEmbeddedDocuments("Token", [data]);
    }
    lines.push(line("A twin token is placed beside it."));
  } else {
    lines.push(line("<em>No token on the scene — place the twin by hand.</em>"));
  }
  await card(actor, item.name, lines);
  return true;
}

async function eternalSummons(actor, item, spec) {
  const level = levelOf(actor);
  const { DialogV2 } = foundry.applications.api;
  const configs = [{ n: 1, below: 4 }, { n: 2, below: 6 }, { n: 4, below: 8 }].filter((c) => level - c.below >= 1);
  if (!configs.length) { ui.notifications?.warn(`${item.name}: nothing 4 or more levels below a level ${level} creature.`); return false; }
  const { creatureTraits } = await import("./creature-traits.mjs");
  const myTraits = new Set(creatureTraits(actor.system ?? {}).map((t) => String(t).toLowerCase()));
  const packs = Array.from(game.packs ?? []).filter((p) => p.documentName === "Actor" && p.metadata?.system === SYSTEM_ID);
  const found = [];
  for (const pack of packs) {
    const docs = await pack.getDocuments();
    for (const doc of docs) {
      if (doc.type !== "npc") continue;
      const { creatureTypesOf } = await import("./aligned.mjs");
      const types = creatureTypesOf(doc.system ?? {}).map((t) => String(t).toLowerCase());
      if (!types.includes("eternal")) continue;
      const traits = creatureTraits(doc.system ?? {}).map((t) => String(t).toLowerCase());
      const kindred = traits.some((t) => myTraits.has(t) && !["eternal", "extraplanar"].includes(t));
      if (!kindred) continue;
      found.push({ doc, level: levelOf(doc), pack: pack.collection });
    }
  }
  const options = configs.map((c) => ({ ...c, candidates: found.filter((f) => f.level === level - c.below) })).filter((c) => c.candidates.length);
  if (!options.length) { await card(actor, item.name, [line(`No kindred eternal exactly ${configs.map((c) => c.below).join(" / ")} levels below ${actor.name} is in the installed compendia — summon by hand.`)]); return true; }
  const html = options.map((c, i) => `<p><label><input type="radio" name="config" value="${i}" ${i === 0 ? "checked" : ""}> <strong>${c.n} × level ${level - c.below}</strong></label><br>
    <select name="pick${i}">${c.candidates.map((f, j) => `<option value="${j}">${f.doc.name}</option>`).join("")}</select></p>`).join("");
  const choice = await DialogV2.wait({
    window: { title: item.name }, classes: [SYSTEM_ID], position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog"><p>Kindred eternals of the same subtype, 2 AP, for ${Math.max(1, Math.floor(level / 5))} minute(s):</p>${html}</div>`,
    buttons: [{ action: "ok", label: "Summon", default: true, callback: (ev, button) => new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(button.form ?? button.closest("form")).object }, { action: "cancel", label: "Cancel" }],
    rejectClose: false
  });
  if (!choice || choice === "cancel") return false;
  const c = options[Number(choice.config) || 0];
  const picked = c.candidates[Number(choice[`pick${Number(choice.config) || 0}`]) || 0];
  if (!(await spendAp(actor, spec.ap ?? 2, item.name))) return false;
  const token = actor.token ?? actor.getActiveTokens?.(true, true)?.[0] ?? null;
  const data = picked.doc.toObject();
  delete data._id;
  data.name = `${picked.doc.name} (summoned)`;
  data.prototypeToken = foundry.utils.mergeObject(data.prototypeToken ?? {}, { disposition: token?.disposition ?? 0 });
  foundry.utils.setProperty(data, `flags.${SYSTEM_ID}.summonedBy`, { uuid: actor.uuid, name: actor.name, until: now() + Math.max(1, Math.floor(level / 5)) * 60 });
  const created = await Actor.createDocuments(Array.from({ length: c.n }, () => foundry.utils.deepClone(data)));
  const lines = [line(`<strong>${c.n} × ${picked.doc.name}</strong> (level ${picked.level}) answer the call for ${Math.max(1, Math.floor(level / 5))} minute(s); they act after ${actor.name} on its count and cannot use Eternal Summons themselves.`)];
  if (token?.parent) {
    const size = canvas?.dimensions?.size ?? 100;
    const placements = created.map((a, i) => ({
      ...a.prototypeToken.toObject(), actorId: a.id, name: a.name,
      x: Number(token.x) + size * ((i % 3) + 1), y: Number(token.y) + size * Math.floor(i / 3), disposition: token.disposition
    }));
    await token.parent.createEmbeddedDocuments("Token", placements);
    lines.push(line("Placed adjacent to the summoner; dismiss (1 AP) or slay by deleting the tokens."));
  }
  await card(actor, item.name, lines);
  return true;
}


/**
 * TRAMPLE (3 AP): "moves up to twice its speed (minimum of 20 feet), moving
 * through the spaces of targets which are at least one size smaller. Each
 * target whose space it passes through … takes damage from the creature's
 * slam attack … with +1 base die. Targets can attempt a basic Reflex save
 * to avoid damage. Trample does not provoke reactions." The leg is armed
 * (no reactions); the GM targets the creatures trampled and presses the
 * card's button, which rolls the basic Reflex for each.
 */
async function trample(actor, item, spec) {
  if (!(await spendAp(actor, spec.ap ?? 3, item.name))) return false;
  const { armCompoundLeg } = await import("./combat/compound-action-workflow.mjs");
  const mv = actor.system?.combat?.movement?.land;
  const speed = Number(typeof mv === "object" ? mv?.total ?? mv?.base : mv) || 0;
  const maxFeet = Math.max(20, speed * 2);
  await armCompoundLeg(actor, { speedKey: "land", maxFeet, note: "through the spaces of creatures at least one size smaller", provokes: false }, item.name);
  // THE SLAM, ELSE THE NAMED FALLBACK (3.639.0, F&F 3.0 block 9 R8): a
  // Centaur has no Slam and tramples with its hooves; it no longer falls to
  // whichever weapon comes first (its longbow).
  const { trampleWeapon } = await import("./codex-action-rules.mjs");
  const weapon = trampleWeapon(actor.items ?? [], spec);
  const { weaponDamageFormula } = await import("./creature-area.mjs");
  const formula = weapon ? weaponDamageFormula(weapon, { bab: Number(actor.system?.combat?.bab?.total ?? 0), strength: Number(actor.system?.attributes?.strength?.total ?? 0), extraDice: 1 }) : "1d8";
  const type = String(weapon?.system?.damageType ?? "bludgeoning");
  await card(actor, item.name, [
    line(`<strong>Move:</strong> drag the token up to <strong>${maxFeet} ft</strong> (twice its Speed, minimum 20), through the spaces of smaller creatures; no reactions provoked.`),
    line(`Then <strong>target</strong> every creature whose space it passed through and press: <button type="button" data-trg-trample="1" data-actor="${actor.uuid}" data-formula="${formula}" data-type="${type}" data-title="${item.name}">Resolve Trample — ${formula} ${type}, basic Reflex</button>`)
  ], { trample: { actorUuid: actor.uuid, formula, type, title: item.name } });
  return true;
}

/** The toggle: a form change that lasts until it is pressed again. */
async function draconicShifting(actor, item, spec) {
  const on = item.flags?.[SYSTEM_ID]?.shifted === true;
  if (!on && !(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  await item.setFlag(SYSTEM_ID, "shifted", !on);
  await card(actor, item.name, [line(on
    ? `${actor.name} resumes its true form — its Strikes deal their own damage again.`
    : `${actor.name} assumes the form of a Small or Medium humanoid. Speed and Strike modifiers are unchanged; its Strikes are now <strong>unarmed subdual</strong> attacks (the attack card says so). Press again to shift back.`)]);
  return true;
}

/**
 * HARMONIZE (3.634.0; F&F 3.0 block 4 R10): the Virtue's 1 AP aid to a
 * companion's innate spell. Target the companion; the Perform Aid check is
 * rolled against this Virtue's own Level DC and read on the Bonus Check
 * Table (±2 at most); the bonus waits on the companion for its next innate
 * spell's save DC this round. See harmonize.mjs.
 */
async function harmonize(actor, item, spec) {
  const companion = Array.from(game.user?.targets ?? []).map((t) => t.actor).find((a) => a && a !== actor) ?? null;
  if (!companion) { ui.notifications?.warn(`${item.name}: target the companion whose spell you aid.`); return false; }
  const ap = Math.max(0, Number(spec.ap ?? 1) || 0);
  if (ap) {
    const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    if (!(await ensureActionPoints(actor, ap, item.name))) return false;
    await spendActionPoints(actor, ap, item.name);
  }
  const { levelDC } = await import("./dice/resolution.mjs");
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const dc = levelDC(levelOf(actor));
  const check = await TRGCheck.roll(withCheckModifiers({
    actor, type: "skill", subject: String(spec.skill ?? "perform"), dc,
    label: `${actor.name} — ${item.name} (Aid)`, subtitle: `Aiding ${companion.name}'s next innate spell — DC ${dc}`
  }));
  const { harmonizeBonus, withHarmony, HARMONIZE_FLAG } = await import("./harmonize.mjs");
  const degree = check?.outcome?.degree;
  const bonus = harmonizeBonus(degree?.key ?? "failure");
  const when = { combatId: game.combat?.started ? game.combat.id : "", round: game.combat?.started ? Number(game.combat.round ?? 0) : 0, worldTime: Number(game.time?.worldTime ?? 0) };
  if (bonus) {
    const record = withHarmony(companion.getFlag?.(SYSTEM_ID, HARMONIZE_FLAG), { by: actor.uuid, bonus, when });
    if (companion.isOwner) await companion.setFlag(SYSTEM_ID, HARMONIZE_FLAG, record);
    else ui.notifications?.warn(`${item.name}: only the GM can record the aid on ${companion.name}.`);
  }
  await card(actor, item.name, [line(`${degree?.label ?? "Rolled"}: ${bonus > 0 ? `<strong>+${bonus}</strong>` : bonus < 0 ? `<strong>${bonus}</strong>` : "no bonus"} to the save DC of <strong>${companion.name}</strong>'s next innate spell this round${bonus ? "" : "."}${bonus ? ` (max ±2 per Virtue).` : ""}`)]);
  return true;
}

/**
 * CHANGE SHAPE (3.636.0; F&F 3.0 block 6 R10): the Barghest's and Gravhek's
 * 1 AP shift between declared forms. The chosen form's effect replaces the
 * last; the weapons a form loses are unequipped while it lasts and
 * re-equipped when it ends. See change-shape.mjs.
 */
/** Every token of the creature on the canvas, to a side of `side` squares. */
async function resizeActorTokens(actor, side) {
  // NOT AS A MOVE (3.652.1): see resizeTokenInPlace.
  const { resizeTokenInPlace } = await import("./combat/movement-workflow.mjs");
  for (const doc of actor.getActiveTokens?.(false, true) ?? []) {
    if (doc?.update) await resizeTokenInPlace(doc, side);
  }
}

/** Abilities a form grants, copied from core's packs onto the creature: their new ids, and any name not found. */
async function grantFormAbilities(actor, names) {
  const out = { ids: [], missing: [] };
  if (!names.length) return out;
  // THROUGH THE CONTENT-PACK LOOKUP, as every pack read is (verify-module-api C5).
  const { contentPack } = await import("./content-packs.mjs");
  const packs = ["creature-abilities", "abilities", "feats"].map((p) => contentPack(p)).filter(Boolean);
  const data = [];
  for (const name of names) {
    let found = null;
    for (const pack of packs) {
      const index = await pack.getIndex();
      const entry = Array.from(index.values?.() ?? index).find((e) => String(e.name).trim().toLowerCase() === name.toLowerCase());
      if (entry) { found = (await pack.getDocument(entry._id))?.toObject(); break; }
    }
    if (!found) { out.missing.push(name); continue; }
    delete found._id;
    found.flags = { ...(found.flags ?? {}), [SYSTEM_ID]: { ...(found.flags?.[SYSTEM_ID] ?? {}), grantedByForm: true } };
    data.push(found);
  }
  if (data.length) out.ids = (await actor.createEmbeddedDocuments("Item", data)).map((i) => i.id);
  return out;
}

/**
 * LEAVING THE CURRENT FORM: its effect goes, the Strikes it took come back,
 * those it brought go, and the token takes its own size again. Returns the
 * token's own size, carried to the next form (3.651.2). Shared by Change
 * Shape and Luna Frenzy's forced return to hybrid form (3.652.0).
 */
async function leaveCurrentForm(actor) {
  const { CHANGE_SHAPE_FLAG } = await import("./change-shape.mjs");
  const current = Array.from(actor.effects ?? []).find((e) => e.getFlag?.(SYSTEM_ID, CHANGE_SHAPE_FLAG));
  if (!current) return 0;
  let priorTokenSize = 0;
  const was = current.getFlag(SYSTEM_ID, CHANGE_SHAPE_FLAG) ?? {};
  const lost = was.loses ?? [];
  // THE STRIKES THE OLD FORM BROUGHT GO WITH IT (3.651.0), and those it
  // took come back. Its granted abilities leave with the effect.
  const brought = was.equips ?? [];
  const back = Array.from(actor.items ?? []).filter((i) => i.type === "weapon" && (lost.includes(i.name) || brought.includes(i.name)))
    .map((i) => ({ _id: i.id, "system.equipped": lost.includes(i.name) }));
  if (back.length) await actor.updateEmbeddedDocuments("Item", back);
  // AND THE TOKEN ITS OWN SIZE AGAIN (3.651.1).
  if (Number(was.priorTokenSize) > 0) { priorTokenSize = Number(was.priorTokenSize); await resizeActorTokens(actor, priorTokenSize); }
  // AND WHAT IT SET ASIDE COMES BACK (3.653.0, block 20 R0a). Cleared from
  // the effect first, so the deletion hook does not restore it twice.
  await restoreStashedItems(actor, current);
  // MARKED AS LEFT (3.653.1), so the deletion hook below — there for an
  // effect removed by hand — does not undo the next form's Strikes.
  await current.update({ [`flags.${SYSTEM_ID}.${CHANGE_SHAPE_FLAG}.left`]: true });
  await current.delete();
  return priorTokenSize;
}

/**
 * THE ABILITIES A FORM SET ASIDE, BACK ON THE CREATURE (3.653.0, block 20
 * R0a). Kept whole on the form's effect, and made again with their own ids;
 * then cleared from the effect, so nothing restores them twice. Called when
 * the form ends here, and by the deletion hook when the effect is removed
 * any other way.
 */
async function restoreStashedItems(actor, effect) {
  const { CHANGE_SHAPE_FLAG } = await import("./change-shape.mjs");
  const flag = effect?.getFlag?.(SYSTEM_ID, CHANGE_SHAPE_FLAG) ?? {};
  const stashed = Array.isArray(flag.stashed) ? flag.stashed : [];
  if (!stashed.length) return 0;
  if (effect.id && actor.effects?.get?.(effect.id)) await effect.update({ [`flags.${SYSTEM_ID}.${CHANGE_SHAPE_FLAG}.stashed`]: [] });
  const missing = stashed.filter((d) => !actor.items?.get?.(d._id));
  if (missing.length) await actor.createEmbeddedDocuments("Item", missing, { keepId: true });
  return missing.length;
}

/**
 * SHIFT FORM'S CHECK (3.652.0; block 19 R6): the level-based check that sets
 * the AP. Rolled after the form is chosen; the AP is spent by the degree.
 * @returns {Promise<{rung: string, ap: number, changes: boolean, frenzy: boolean, label: string, dc: number}|null>}
 */
async function rollShiftCheck(actor, item, check, formLabel) {
  const { levelDC } = await import("./dice/resolution.mjs");
  const { levelCheckDC, shiftOutcome } = await import("./lycanthrope.mjs");
  const { DIFFICULTY_BY_KEY } = await import("./dice/resolution.mjs");
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const dc = levelCheckDC(levelDC(levelOf(actor)), check.difficulty);
  const skill = actor.system?.skills?.[check.skill];
  const name = check.skill === "mentalFocus" ? "Mental Focus" : "Meditation";
  const roll = await TRGCheck.roll(withCheckModifiers({
    actor, label: `${actor.name} — ${name}`,
    subtitle: `${item.name} to ${formLabel} — ${DIFFICULTY_BY_KEY[check.difficulty]?.label ?? check.difficulty}, DC ${dc}`,
    type: "skill", subject: check.skill, dc,
    modifiers: skill?.checkModifiers ?? [{ label: name, value: Number(skill?.total ?? 0), type: "untyped" }]
  }));
  if (!roll) return null;
  return { ...shiftOutcome(check, roll.outcome?.degree?.key ?? "failure"), label: roll.outcome?.degree?.label ?? "?", dc };
}

async function changeShape(actor, item, spec) {
  const { CHANGE_SHAPE_FLAG, changeShapeEffectData, changeShapeForms, changeShapeSummary } = await import("./change-shape.mjs");
  const { inLunaFrenzy, reachableForms, shiftCheckSpec } = await import("./lycanthrope.mjs");
  // "FORCED TO ENTER ITS HYBRID FORM" (3.652.0, R7): no shifting out of it
  // while Luna Frenzy holds.
  if (inLunaFrenzy(actor.effects)) { ui.notifications?.warn(`${item.name}: ${actor.name} is in a Luna Frenzy, held in its hybrid form until the full moon ends.`); return false; }
  const forms = changeShapeForms(spec);
  const current = Array.from(actor.effects ?? []).find((e) => e.getFlag?.(SYSTEM_ID, CHANGE_SHAPE_FLAG));
  const currentKey = current?.getFlag(SYSTEM_ID, CHANGE_SHAPE_FLAG)?.key ?? forms.find((f) => f.own)?.key;
  // ONE STEP AT A TIME (3.652.0, R6): only the neighbouring forms are offered.
  const choices = reachableForms(forms, currentKey, spec.oneStep === true);
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${item.name} — which form?` }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>${actor.name} is in: <strong>${forms.find((f) => f.key === currentKey)?.label ?? "its own form"}</strong>.</p></div>`,
    buttons: choices.map((f, i) => ({ action: f.key, label: f.label, default: i === 0 })),
    rejectClose: false
  });
  const form = forms.find((f) => f.key === picked);
  if (!form) return false;
  // THE CHECK SETS THE COST (3.652.0, R6); without one, the declared AP.
  const check = shiftCheckSpec(spec.check);
  let shift = null;
  if (check) {
    const { ensureActionPoints } = await import("./combat/action-points-workflow.mjs");
    const cheapest = Math.min(...Object.values(check.ap).filter((n) => n > 0));
    if (Number.isFinite(cheapest) && !(await ensureActionPoints(actor, cheapest, item.name))) return false;
    shift = await rollShiftCheck(actor, item, check, form.label);
    if (!shift) return false;
    if (!(await spendAp(actor, shift.ap, item.name))) {
      await card(actor, item.name, [line(`${shift.label} against DC ${shift.dc}: it would take <strong>${shift.ap} AP</strong>, and ${actor.name} has too few — no change.`)]);
      return true;
    }
    if (!shift.changes) {
      await card(actor, item.name, [line(`${shift.label} against DC ${shift.dc}: ${actor.name} expends <strong>${shift.ap} AP</strong> and does not change form. It may try again on its next turn.`)]);
      return true;
    }
  } else if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  // LEAVING THE OLD FORM: its effect goes and the Strikes it took come back.
  const priorTokenSize = await leaveCurrentForm(actor);
  const { speedBase } = await import("./combat/speed-pool.mjs");
  const mv = actor.system?.combat?.movement ?? {};
  const baseLand = speedBase(mv.land);
  const baseSpeeds = Object.fromEntries(["climb", "swim", "fly", "burrow"].map((m) => [m, speedBase(mv[m])]));
  const baseSize = String(actor._source?.system?.identity?.size ?? actor.system?.identity?.size ?? "");
  const data = changeShapeEffectData(form, { baseLand, itemName: item.name, baseSpeeds, baseSize });
  if (data) {
    // THE ABILITIES THE FORM BRINGS (3.651.0, R11): made from core's packs
    // and listed on the effect, so the granted-item cleanup removes them
    // whichever way the form ends.
    const granted = await grantFormAbilities(actor, form.grants ?? []);
    if (granted.ids.length) data.flags[SYSTEM_ID].grantedItems = granted.ids;
    // THE FORM'S SPACE ON THE MAP (3.651.1): the token resized to the form's
    // footprint, its own size kept on the effect for the way back.
    const { SIZE_FOOTPRINT } = await import("./combat/flanking.mjs");
    const { formTokenSize } = await import("./change-shape.mjs");
    // NOT COMPARED WITH THE TOKEN'S WIDTH NOW (3.651.2, found live): a size
    // change animates, and until it finishes the document still reads the
    // old width — so a spider's 2 was read back, as "already Large", by the
    // eagle that followed it, and the eagle stood on one square. The size
    // the creature had before ANY form is carried from form to form.
    const side = formTokenSize(form, SIZE_FOOTPRINT);
    const own = actor.getActiveTokens?.(false, true)?.[0] ?? null;
    if (side && own) {
      data.flags[SYSTEM_ID][CHANGE_SHAPE_FLAG].priorTokenSize = Number(priorTokenSize) || Number(own.width) || 1;
      await resizeActorTokens(actor, side);
    }
    // WHAT THE FORM SETS ASIDE (3.653.0, block 20 R0a): kept whole on the
    // effect, and off the creature until the form ends.
    const { suppressedItems } = await import("./change-shape.mjs");
    const aside = suppressedItems(actor.items, form.suppresses);
    if (aside.length) data.flags[SYSTEM_ID][CHANGE_SHAPE_FLAG].stashed = aside.map((i) => i.toObject());
    await actor.createEmbeddedDocuments("ActiveEffect", [data]);
    if (aside.length) await actor.deleteEmbeddedDocuments("Item", aside.map((i) => i.id));
    const swap = Array.from(actor.items ?? []).filter((i) => i.type === "weapon" && (form.loses.includes(i.name) || (form.equips ?? []).includes(i.name)))
      .map((i) => ({ _id: i.id, "system.equipped": (form.equips ?? []).includes(i.name) }));
    if (swap.length) await actor.updateEmbeddedDocuments("Item", swap);
    if (granted.missing.length) ui.notifications?.warn(`${item.name}: no ability named ${granted.missing.join(", ")} in core's packs — add it by hand.`);
  }
  const lines = [];
  if (shift) lines.push(line(`${shift.label} against DC ${shift.dc}: <strong>${shift.ap} AP</strong>.`));
  lines.push(line(`${actor.name} ${changeShapeSummary(form, baseLand)}`));
  await card(actor, item.name, lines);
  // "UPON COMPLETION OF THE CHANGE, THE LYCANTHROPE ENTERS A LUNA FRENZY" (R6's Fumble).
  if (shift?.frenzy) {
    const frenzyItem = Array.from(actor.items ?? []).find((i) => i.flags?.[SYSTEM_ID]?.creatureAbility?.action?.kind === "lunaFrenzy");
    if (frenzyItem) await enterLunaFrenzy(actor, frenzyItem, frenzyItem.flags[SYSTEM_ID].creatureAbility.action, `the ${item.name} fumbled`);
    else ui.notifications?.warn(`${item.name}: the Fumble brings on a Luna Frenzy, but ${actor.name} has no Luna Frenzy ability — apply it by hand.`);
  }
  return true;
}

/**
 * LUNA FRENZY (3.652.0; block 19 R7). See lycanthrope.mjs. The Use button
 * offers the delay check or lets the frenzy take hold; while it holds, it
 * offers to end it when the full moon ends.
 */
async function lunaFrenzy(actor, item, spec) {
  const { inLunaFrenzy, LUNA_DELAY_FLAG } = await import("./lycanthrope.mjs");
  if (inLunaFrenzy(actor.effects)) {
    const end = await foundry.applications.api.DialogV2.wait({
      window: { title: `${item.name} — ${actor.name}` }, classes: [SYSTEM_ID],
      content: `<div class="trg-prime trg-check-dialog"><p>${actor.name} is in a Luna Frenzy. It ends only when the full moon comes to an end.</p></div>`,
      buttons: [{ action: "end", label: "The full moon has ended", default: true }, { action: "cancel", label: "Not yet" }],
      rejectClose: false
    }).catch(() => null);
    if (end !== "end") return false;
    await endLunaFrenzy(actor, item);
    return true;
  }
  const delay = actor.getFlag?.(SYSTEM_ID, LUNA_DELAY_FLAG) ?? null;
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${item.name} — ${actor.name}` }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>The full moon calls. ${actor.name} may try to delay the change with a Mental Focus check${Number(delay?.count) > 0 ? ` (delayed ${delay.count} time${delay.count === 1 ? "" : "s"} already — each attempt is one step harder)` : ""}, or the frenzy takes hold.</p></div>`,
    buttons: [{ action: "delay", label: "Try to delay it", default: true }, { action: "enter", label: "It takes hold" }],
    rejectClose: false
  }).catch(() => null);
  if (picked === "enter") { await enterLunaFrenzy(actor, item, spec, ""); return true; }
  if (picked !== "delay") return false;
  return delayLunaFrenzy(actor, item, spec);
}

async function delayLunaFrenzy(actor, item, rawSpec) {
  const { lunaFrenzySpec, lunaDelayDifficulty, lunaDelaySeconds, levelCheckDC, LUNA_DELAY_FLAG } = await import("./lycanthrope.mjs");
  const { levelDC, DIFFICULTY_BY_KEY } = await import("./dice/resolution.mjs");
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const spec = lunaFrenzySpec(rawSpec);
  const prior = Number(actor.getFlag?.(SYSTEM_ID, LUNA_DELAY_FLAG)?.count ?? 0) || 0;
  const difficulty = lunaDelayDifficulty(spec.delay.difficulty, prior);
  const dc = levelCheckDC(levelDC(levelOf(actor)), difficulty);
  const skill = actor.system?.skills?.[spec.delay.skill];
  const name = spec.delay.skill === "mentalFocus" ? "Mental Focus" : "Meditation";
  const roll = await TRGCheck.roll(withCheckModifiers({
    actor, label: `${actor.name} — ${name}`, subtitle: `${item.name} — delay the change: ${DIFFICULTY_BY_KEY[difficulty]?.label ?? difficulty}, DC ${dc}`,
    type: "skill", subject: spec.delay.skill, dc,
    modifiers: skill?.checkModifiers ?? [{ label: name, value: Number(skill?.total ?? 0), type: "untyped" }]
  }));
  if (!roll) return false;
  const seconds = lunaDelaySeconds(spec, roll.outcome?.degree?.key ?? "failure");
  const label = roll.outcome?.degree?.label ?? "?";
  if (seconds > 0) {
    await actor.setFlag(SYSTEM_ID, LUNA_DELAY_FLAG, { count: prior + 1, until: now() + seconds });
    await card(actor, item.name, [line(`${name} <strong>${label}</strong> against DC ${dc}: the change is delayed for <strong>${seconds >= 3600 ? `${seconds / 3600} hour${seconds === 3600 ? "" : "s"}` : `${seconds / 60} minutes`}</strong>. A further delay is one step harder.`)]);
    return true;
  }
  await enterLunaFrenzy(actor, item, rawSpec, `${name} ${label} against DC ${dc}`);
  return true;
}

/** The frenzy takes hold: hybrid form, a size larger, Intelligence down, confused and raging. */
async function enterLunaFrenzy(actor, item, rawSpec, why = "") {
  const { lunaFrenzySpec, lunaFrenzyEffectData, LUNA_DELAY_FLAG, LUNA_FRENZY_FLAG } = await import("./lycanthrope.mjs");
  const spec = lunaFrenzySpec(rawSpec);
  // "FORCED TO ENTER ITS HYBRID FORM": the creature's own stat block.
  const priorTokenSize = await leaveCurrentForm(actor);
  const ownSize = String(actor._source?.system?.identity?.size ?? actor.system?.identity?.size ?? "");
  const intelligence = Number(actor.system?.attributes?.intelligence?.total ?? 0);
  const data = lunaFrenzyEffectData(spec, { ownSize, intelligence, itemName: item.name });
  const { size, intDelta, ...effect } = data;
  // THE TOKEN TAKES THE LARGER SPACE, its own size kept for the way back.
  const { SIZE_FOOTPRINT } = await import("./combat/flanking.mjs");
  const side = Number(SIZE_FOOTPRINT?.[size]) || 0;
  const own = actor.getActiveTokens?.(false, true)?.[0] ?? null;
  if (side && own) {
    effect.flags[SYSTEM_ID][LUNA_FRENZY_FLAG].priorTokenSize = Number(priorTokenSize) || Number(SIZE_FOOTPRINT?.[ownSize.toLowerCase()]) || Number(own.width) || 1;
    await resizeActorTokens(actor, side);
  }
  await actor.createEmbeddedDocuments("ActiveEffect", [effect]);
  // "CONSIDERED TO BE RAGING AND GAINS ALL SUCH MODIFIERS", and confused —
  // core's own rage, entered confused, with no minute on it: it lasts until
  // the full moon ends, and cannot be revoked.
  const { beginRage, rageEffect, isRaging } = await import("./combat/rage-workflow.mjs");
  if (!isRaging(actor)) {
    await beginRage(actor, { degree: "success", confused: true });
    const rage = rageEffect(actor);
    if (rage) {
      const state = rage.getFlag(SYSTEM_ID, "rage") ?? null;
      // NO MINUTE ON IT (3.652.1, found live): Foundry 14's duration is
      // `value` and `units`; 3.652.0 cleared `seconds`, which it ignores, so
      // the rage would have ended itself after a minute.
      await rage.update({ "duration.value": null, [`flags.${SYSTEM_ID}.rage`]: { ...(state ?? {}), endsAtWorldTime: null, endsOnRound: null, mustRideOut: true, lunaFrenzy: true } });
    }
  } else {
    const { applyConditionTags } = await import("./combat/effect-application-workflow.mjs");
    await applyConditionTags(actor, [{ key: "confused", label: "Confused", value: null }]);
  }
  await actor.unsetFlag?.(SYSTEM_ID, LUNA_DELAY_FLAG);
  const bits = [];
  if (size && size !== ownSize.toLowerCase()) bits.push(`${size.charAt(0).toUpperCase()}${size.slice(1)} size`);
  if (intDelta) bits.push(`Intelligence ${intDelta} (racial)`);
  bits.push("Confused", "raging");
  await card(actor, item.name, [line(`${why ? `${why}: ` : ""}<strong>${actor.name} enters a Luna Frenzy</strong> — forced into its hybrid form; ${bits.join("; ")}. It ends only when the full moon does.`)]);
}

/** The full moon ends: the frenzy, its rage and its confusion go, and the token its own size again. */
async function endLunaFrenzy(actor, item) {
  const { LUNA_FRENZY_FLAG } = await import("./lycanthrope.mjs");
  const effects = Array.from(actor.effects ?? []).filter((e) => e.getFlag?.(SYSTEM_ID, LUNA_FRENZY_FLAG));
  const prior = Math.max(0, ...effects.map((e) => Number(e.getFlag(SYSTEM_ID, LUNA_FRENZY_FLAG)?.priorTokenSize) || 0));
  if (effects.length) await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map((e) => e.id));
  if (prior > 0) await resizeActorTokens(actor, prior);
  const { endRage, isRaging } = await import("./combat/rage-workflow.mjs");
  let ended = null;
  if (isRaging(actor)) ended = await endRage(actor, { fatigue: 1 });
  if (actor.hasCondition?.("confused")) await actor.toggleStatusEffect?.("confused", { active: false });
  await card(actor, item.name, [line(`The full moon has ended: <strong>${actor.name}'s Luna Frenzy is over</strong>${ended ? " — and with it the rage (Fatigued 1 for an hour, as any rage ends)" : ""}.`)]);
}

/**
 * A HELD ADVANTAGE (3.639.0, F&F 3.0 block 9 R7) — Foresight Gaze: "Free
 * action (focus). Trigger The cyclops is about to roll a d20. Effect The
 * cyclops gains advantage on the check." Spends the ability's use (its
 * Focus) and lays core's held advantage (magic/held-bonus.mjs): a button on
 * the creature's next d20 card that rolls again and keeps the better.
 */
async function heldAdvantage(actor, item, spec) {
  const { itemUsesMax, itemUsesRemaining } = await import("./uses-workflow.mjs");
  const usesMax = itemUsesMax(item);
  const counted = Number.isFinite(usesMax) && usesMax !== null;
  const left = counted ? itemUsesRemaining(item) : null;
  if (counted && left <= 0) { ui.notifications?.warn(`${item.name}: no uses remain — Refocus to restore it.`); return false; }
  if (!(await spendAp(actor, spec.ap ?? 0, item.name))) return false;
  const { heldAdvantageRow } = await import("./codex-action-rules.mjs");
  const { HELD_BONUS_FLAG, normaliseHeldBonus } = await import("./magic/held-bonus.mjs");
  const held = normaliseHeldBonus(heldAdvantageRow(item, spec));
  if (!held) { ui.notifications?.warn(`${item.name}: its held advantage is malformed.`); return false; }
  await actor.createEmbeddedDocuments("ActiveEffect", [{ name: held.label, img: item.img, changes: [], flags: { [SYSTEM_ID]: { [HELD_BONUS_FLAG]: held } } }]);
  if (counted) await item.update({ "system.usesValue": left - 1 });
  await card(actor, item.name, [
    line(`${actor.name} holds <strong>advantage</strong> on its next d20 check — press the button on that check's card to roll again and keep the better.`),
    ...(counted ? [line(`<em>${left - 1} of ${usesMax} use(s) left${/\bfocus\b/i.test(String(item.system?.traits ?? "")) ? " — Refocus restores it" : ""}.</em>`)] : [])
  ]);
  return true;
}

/*
 * WEAPON STRIKE (3.643.0, F&F 3.0 block 13 R6): Xithra and Screech. The
 * ability's use is counted (its Focus), its AP spent, then the named weapon
 * is struck with the AP already paid.
 */
async function weaponStrike(actor, item, spec) {
  const { weaponStrikeWeapon } = await import("./codex-action-rules.mjs");
  const weapon = weaponStrikeWeapon(Array.from(actor.items ?? []), spec);
  if (!weapon) { ui.notifications?.warn(`${item.name}: ${actor.name} has no weapon named "${spec.weapon}".`); return false; }
  const { itemUsesMax, itemUsesRemaining } = await import("./uses-workflow.mjs");
  const usesMax = itemUsesMax(item);
  const counted = Number.isFinite(usesMax) && usesMax !== null;
  const left = counted ? itemUsesRemaining(item) : null;
  if (counted && left <= 0) { ui.notifications?.warn(`${item.name}: no uses remain — Refocus to restore it.`); return false; }
  if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  const { rollWeaponAttack } = await import("./combat/attack-workflow.mjs");
  const result = await rollWeaponAttack(actor, weapon, { apPaid: true, viaAbility: true });
  if (counted) {
    await item.update({ "system.usesValue": left - 1 });
    await card(actor, item.name, [line(`<em>${left - 1} of ${usesMax} use(s) left${/\bfocus\b/i.test(String(item.system?.traits ?? "")) ? " — Refocus restores it" : ""}.</em>`)]);
  }
  return result !== undefined;
}

/*
 * A STRIKE WITH AN INNATE SPELL (3.656.0; F&F 3.0 block 23 R6 — Graham, 17
 * October 2026: "Go with your recommendations"). Air Blast Magic: "The primal
 * may make an air blast attack combining it with any one verdant innate spell
 * that it has knowledge of. If the spell has the attack trait, it uses the
 * primals attack bonus rather than innate bonus when making the attack."
 * The spell is chosen first, the AP spent once, the Strike rolled at the
 * target, and the innate then cast free at the same target — its attack, if
 * it has one, on the Strike's own bonus.
 */
async function strikeWithInnate(actor, item, spec) {
  const { weaponStrikeWeapon, strikeInnateSpells, strikeAttackBonus } = await import("./codex-action-rules.mjs");
  const weapon = weaponStrikeWeapon(Array.from(actor.items ?? []), spec);
  if (!weapon) { ui.notifications?.warn(`${item.name}: ${actor.name} has no weapon named "${spec.weapon}".`); return false; }
  const target = Array.from(game.user?.targets ?? [])[0] ?? null;
  if (!target?.actor || game.user.targets.size !== 1) { ui.notifications?.warn(`${item.name}: target one creature first.`); return false; }
  const spells = strikeInnateSpells(Array.from(actor.items ?? []), spec);
  if (!spells.length) { ui.notifications?.warn(`${item.name}: ${actor.name} has no innate spell to combine.`); return false; }
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: `${item.name} — ${target.actor.name}` }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>${weapon.name} at ${target.actor.name}, combined with which innate spell?</p></div>`,
    buttons: spells.map((s, i) => ({ action: `s${i}`, label: s.name, default: i === 0 })),
    rejectClose: false
  }).catch(() => null);
  const index = /^s(\d+)$/.exec(String(picked ?? ""))?.[1];
  if (index === undefined) return false;
  const spell = spells[Number(index)];
  if (!(await spendAp(actor, spec.ap ?? 2, item.name))) return false;
  const { rollWeaponAttack } = await import("./combat/attack-workflow.mjs");
  const check = await rollWeaponAttack(actor, weapon, { apPaid: true, skipTargetPrompt: true });
  if (!check) return true;
  // ITS BONUS, NOT THAT ROLL'S (3.656.1): the Strike's multiple attack penalty,
  // range increment and circumstance belonged to the Strike alone.
  const attackBonus = Array.isArray(check?.modifiers) ? strikeAttackBonus(check.modifiers) : Number.NaN;
  target.setTarget(true, { user: game.user, releaseOthers: true });
  const { castSpell } = await import("./magic/cast-workflow.mjs");
  await castSpell(actor, spell, { presetTargets: true, apPaid: true, carried: { label: weapon.name, attackBonus: Number.isFinite(attackBonus) ? attackBonus : undefined } });
  await card(actor, item.name, [line(`${weapon.name} combined with <strong>${spell.name}</strong> at ${target.actor.name}; the spell's own card follows${Number.isFinite(attackBonus) ? `, any attack it makes at +${attackBonus}` : ""}.`)]);
  return true;
}

/*
 * CARRION FEAST (3.647.0, F&F 3.0 block 15 R7). The Ghoul's 1d6 and the
 * Ghast's 3d6, from a body adjacent to it. "Died within the last hour" is
 * the table's to know — the chooser asks it in its wording — and "once from
 * each body" is marked on the body itself, so a second Ghoul still may.
 */
async function carrionFeast(actor, item, spec) {
  const { activeToken, distanceBetween } = await import("./combat/geometry.mjs");
  const { isDead } = await import("./combat/death-state.mjs");
  const { CARRION_FED_FLAG, carrionFeastAllowed } = await import("./codex-action-rules.mjs");
  const mine = activeToken(actor);
  if (!mine) { ui.notifications?.warn(`${item.name}: ${actor.name} has no token on this scene.`); return false; }
  const bodies = (canvas?.tokens?.placeables ?? []).filter((t) => {
    if (!t.actor || t.id === mine.id) return false;
    const dead = isDead(t.actor) || t.actor.hasCondition?.("dead") || Number(t.actor.system?.resources?.hp?.value ?? 1) <= 0;
    if (!dead) return false;
    const feet = distanceBetween(mine, t);
    return feet !== null && feet <= 5;
  });
  if (!bodies.length) { ui.notifications?.warn(`${item.name}: there is no body adjacent to ${actor.name}.`); return false; }
  const fresh = bodies.filter((t) => carrionFeastAllowed(t.actor.getFlag?.(SYSTEM_ID, CARRION_FED_FLAG), actor.uuid));
  if (!fresh.length) { ui.notifications?.warn(`${item.name}: ${actor.name} has already fed on every body beside it.`); return false; }
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: item.name }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>Which body? It must have died within the last hour.</p></div>`,
    buttons: [...fresh.map((t, i) => ({ action: t.id, label: t.name, default: i === 0 })), { action: "cancel", label: "Cancel" }],
    rejectClose: false
  });
  const body = fresh.find((t) => t.id === picked);
  if (!body) return false;
  if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  const roll = await new Roll(String(spec.heal ?? "1d6")).evaluate();
  const { healActor } = await import("./magic/spell-effects.mjs");
  const healed = Number(await healActor(actor, roll.total, { magical: false })) || 0;
  const fedBy = [...(body.actor.getFlag?.(SYSTEM_ID, CARRION_FED_FLAG) ?? []), actor.uuid];
  if (body.actor.isOwner) await body.actor.setFlag(SYSTEM_ID, CARRION_FED_FLAG, fedBy);
  await card(actor, item.name, [
    line(`${actor.name} feeds on <strong>${body.name}</strong>: ${spec.heal ?? "1d6"} = ${roll.total} — <strong>${healed} HP</strong> regained.`),
    line(`<em>It may not feed on this body again.</em>`)
  ]);
  return true;
}

/*
 * SIZE SHIFT (3.647.0, F&F 3.0 block 15 R8) — Efreet Shifting's once-a-day
 * use on an unwilling target. The target's Fortitude save against the
 * creature's Level DC sets how long; core's size step makes the change.
 */
async function sizeShift(actor, item, spec) {
  const target = Array.from(game.user?.targets ?? []).map((t) => t.actor).find((a) => a && a !== actor) ?? null;
  if (!target) { ui.notifications?.warn(`${item.name}: target the creature to resize — changing its own form is the card's to describe.`); return false; }
  const { itemUsesMax, itemUsesRemaining } = await import("./uses-workflow.mjs");
  const usesMax = itemUsesMax(item);
  const counted = Number.isFinite(usesMax) && usesMax !== null;
  const left = counted ? itemUsesRemaining(item) : null;
  if (counted && left <= 0) { ui.notifications?.warn(`${item.name}: already used today.`); return false; }
  const dir = await foundry.applications.api.DialogV2.wait({
    window: { title: `${item.name} — ${target.name}` }, classes: [SYSTEM_ID],
    content: `<div class="trg-prime trg-check-dialog"><p>Make <strong>${target.name}</strong> one size step…</p></div>`,
    buttons: [{ action: "larger", label: "Larger", default: true }, { action: "smaller", label: "Smaller" }, { action: "cancel", label: "Cancel" }],
    rejectClose: false
  });
  if (dir !== "larger" && dir !== "smaller") return false;
  if (!(await spendAp(actor, spec.ap ?? 2, item.name))) return false;
  if (counted) await item.update({ "system.usesValue": left - 1 });
  const { levelDC } = await import("./dice/resolution.mjs");
  const dc = Number(spec.dc) || levelDC(levelOf(actor));
  const check = await rollSave(target, "fortitude", dc, `${target.name} — Fortitude Save`, `vs ${item.name} — DC ${dc}`);
  const degree = check?.outcome?.degree;
  const { sizeShiftOutcome } = await import("./codex-action-rules.mjs");
  const outcome = sizeShiftOutcome(degree?.key, dir === "larger" ? 1 : -1, Boolean(check?.outcome?.chaos));
  if (!outcome) { await card(actor, item.name, [line(`${degree?.label ?? "Saved"}: <strong>${target.name}</strong> is unaffected.`)]); return true; }
  const { sizeStepChange, sizeStepLine, sizeStepRefusedLine } = await import("./magic/size-step.mjs");
  const from = String(target.system?.identity?.size ?? "").trim().toLowerCase();
  const change = sizeStepChange(from, outcome.steps);
  if (!change) { await card(actor, item.name, [line(sizeStepRefusedLine(target.name, from, outcome.steps))]); return true; }
  const flags = { [SYSTEM_ID]: { spellBuff: true } };
  if (outcome.seconds) { flags[SYSTEM_ID].spellEffect = true; flags[SYSTEM_ID].spellEffectEnd = now() + outcome.seconds; }
  if (outcome.rounds && game.combat?.started) { flags[SYSTEM_ID].spellEffect = true; flags[SYSTEM_ID].conditionExpiresRound = Number(game.combat.round ?? 0) + outcome.rounds; }
  const { createEffectsOn } = await import("./combat/target-relay-workflow.mjs");
  await createEffectsOn(target, [{ name: `${item.name} (${actor.name})`, img: item.img, changes: [change], flags }]);
  await card(actor, item.name, [
    line(`${degree?.label ?? ""}${check?.outcome?.chaos ? " — Chaos: the direction is reversed" : ""}.`),
    line(`${sizeStepLine(target.name, from, change.value, outcome.steps)} ${outcome.label}.`),
    ...(counted ? [line(`<em>${left - 1} of ${usesMax} use(s) left today.</em>`)] : [])
  ]);
  return true;
}

/*
 * THUNDERING STRIKE (3.649.0; F&F 3.0 block 16 R4 — Graham, 15 October 2026:
 * "apply all recommendations"). The Cloud Giant "spins its weapon in a wide
 * arc and makes an attack that inflicts an additional 2d12 bludgeoning
 * damage. After the strike, all creatures within a 20-foot radius without the
 * air trait must make a basic Fort save to avoid taking 4d8 sonic damage."
 *
 * One Strike with the named weapon, the extra packet riding it; then the
 * burst, hit or miss — "after the strike" — through the area rail, centred on
 * the striker. The AP is spent once the Strike has happened, so a cancelled
 * target prompt costs nothing.
 */
async function strikeBurst(actor, item, spec) {
  const { weaponStrikeWeapon, strikeBurstArea, actionExtraDamage } = await import("./codex-action-rules.mjs");
  const weapon = weaponStrikeWeapon(Array.from(actor.items ?? []), spec);
  if (!weapon) { ui.notifications?.warn(`${item.name}: ${actor.name} has no weapon named "${spec.weapon}".`); return false; }
  const ap = spec.ap ?? 2;
  const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  if (!(await ensureActionPoints(actor, ap, item.name))) return false;
  const { rollWeaponAttack } = await import("./combat/attack-workflow.mjs");
  const check = await rollWeaponAttack(actor, weapon, { apPaid: true, extraTypedDamage: actionExtraDamage(spec) });
  if (check === null || check === undefined) return false;
  await spendActionPoints(actor, ap, item.name);
  const area = strikeBurstArea(spec);
  if (!area) return true;
  const { perilEffectSpec } = await import("./peril-effect.mjs");
  const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
  const burst = perilEffectSpec(area, "");
  burst.isCreatureArea = true;
  const rolled = await runDeclaredAreaEffect(actor, burst, { title: item.name });
  const passed = area.excludeKinds?.length ? ` Creatures with the ${area.excludeKinds.join(" or ")} trait are passed over.` : "";
  await card(actor, item.name, [
    line(`<strong>After the strike:</strong> every creature within ${area.radiusFeet} feet of ${actor.name}.${passed}`),
    ...rolled
  ]);
  return true;
}

/*
 * LIGHTNING STRIKE (3.649.0; F&F 3.0 block 16 R5). The Storm Giant "makes a
 * single melee strike, comparing the result to the DB of all creatures within
 * range +5 feet. The attack inflicts normal strike damage plus 3d12
 * electricity damage."
 *
 * ONE ROLL: the first creature's check rolls the die and each further one is
 * handed it (`presetDice`), so each meets the same result with its own DB; a
 * critical is judged from each creature's own attack value. ONE DAMAGE ROLL:
 * the dice are shared by formula (`sharedDamage`), so every creature hit takes
 * the same dice — save where a critical adds its own. ONE ATTACK for the
 * multiple attack penalty: the first counts it, the rest are rolled at the
 * same penalty and add nothing. Every creature in range, allies too ("all
 * creatures").
 */
async function sweepingStrike(actor, item, spec) {
  const { weaponStrikeWeapon, actionExtraDamage, sweepingStrikeRangeFeet, mapOfCheck } = await import("./codex-action-rules.mjs");
  const weapon = weaponStrikeWeapon(Array.from(actor.items ?? []), spec);
  if (!weapon) { ui.notifications?.warn(`${item.name}: ${actor.name} has no weapon named "${spec.weapon}".`); return false; }
  const { activeToken, distanceBetween } = await import("./combat/geometry.mjs");
  const mine = activeToken(actor);
  if (!mine) { ui.notifications?.warn(`${item.name}: ${actor.name} has no token on this scene.`); return false; }
  const { weaponReachExtension } = await import("./combat/attack.mjs");
  const range = sweepingStrikeRangeFeet({
    reach: actor.system?.combat?.reach ?? 5,
    weaponHasReach: /\breach\b/i.test(String(weapon.system?.traits ?? "")),
    extension: weaponReachExtension(weapon.system),
    plusFeet: spec.plusFeet ?? 5
  });
  const { isDead } = await import("./combat/death-state.mjs");
  const caught = (canvas?.tokens?.placeables ?? []).filter((t) => {
    if (!t.actor || t.id === mine.id || isDead(t.actor)) return false;
    const feet = distanceBetween(mine, t);
    return feet !== null && feet <= range;
  });
  if (!caught.length) { ui.notifications?.warn(`${item.name}: no creature is within ${range} feet of ${actor.name}.`); return false; }
  const ap = spec.ap ?? 3;
  const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  if (!(await ensureActionPoints(actor, ap, item.name))) return false;
  const { rollWeaponAttack } = await import("./combat/attack-workflow.mjs");
  const extraTypedDamage = actionExtraDamage(spec);
  const sharedDamage = {};
  let dice = null;
  let map = 0;
  const struck = [];
  for (const t of caught) {
    t.setTarget(true, { releaseOthers: true, groupSelection: false });
    const later = dice !== null;
    const check = await rollWeaponAttack(actor, weapon, {
      apPaid: true, skipTargetPrompt: true, reachAlreadyEstablished: true, extraTypedDamage, sharedDamage,
      ...(later ? { presetDice: dice, mapFrozen: true, mapOverride: map } : {})
    });
    if (!later) {
      if (check === null || check === undefined) return false;
      dice = check.dice;
      map = mapOfCheck(check.modifiers);
      await spendActionPoints(actor, ap, item.name);
    }
    if (check) struck.push(t.name);
  }
  for (const t of caught) t.setTarget(false, { releaseOthers: false, groupSelection: false });
  await card(actor, item.name, [
    line(`One strike with ${weapon.name}, compared to the DB of every creature within ${range} feet: ${struck.join(", ")}.`),
    line(`<em>It counts as one attack for the multiple attack penalty.</em>`)
  ]);
  return true;
}

/**
 * TOGGLE AN EFFECT (3.650.0; block 17 R6, the Glimmerwick's Luminous Aura:
 * "may turn this aura on or off as a Free Action"). Used, it lays the
 * declared effect — its light, its offered bonuses — or takes it off again.
 * Free unless `ap` says otherwise. The light goes with the effect: attached
 * here, restored by the deleteActiveEffect cleanup every light source uses.
 */
async function toggleEffect(actor, item, spec) {
  const on = Array.from(actor.effects ?? []).find((e) => e.getFlag?.(SYSTEM_ID, "toggledBy") === item.name);
  const ap = Math.max(0, Number(spec.ap) || 0);
  if (ap) {
    const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
    if (!(await ensureActionPoints(actor, ap, item.name))) return false;
    await spendActionPoints(actor, ap, item.name);
  }
  if (on) {
    await on.delete();
    await card(actor, item.name, [line(`${actor.name} turns ${item.name} <strong>off</strong>.`)]);
    return true;
  }
  const { toggledEffectData } = await import("./creature-reactions.mjs");
  const [created] = await actor.createEmbeddedDocuments("ActiveEffect", [toggledEffectData(item, spec)]);
  if (created && spec.lightSource) {
    const { attachTokenLight } = await import("./light-attach-workflow.mjs");
    await attachTokenLight(actor, spec.lightSource);
  }
  const lines = [line(`${actor.name} turns ${item.name} <strong>on</strong>.`)];
  if (spec.note) lines.push(line(`<em>${spec.note}</em>`));
  await card(actor, item.name, lines);
  return true;
}

const KINDS = Object.freeze({ strikeWithInnate, constrict, rend, tearFlesh, abyssalHealing, swallow, magicDispelling, whispersOfTheGrave, amorphousSplit, eternalSummons, trample, draconicShifting, harmonize, changeShape, lunaFrenzy, heldAdvantage, basicAction, weaponStrike, carrionFeast, sizeShift, strikeBurst, sweepingStrike, toggleEffect });

/** The declared action on an item, or null. */
function codexActionOf(item) {
  const a = item?.flags?.[SYSTEM_ID]?.creatureAbility?.action;
  return a && typeof a === "object" && KINDS[a.kind] ? a : null;
}

/** Run it. True when handled (whether or not it went ahead), null when not declared. */
export async function useCodexAction(actor, item) {
  const spec = codexActionOf(item);
  if (!spec) return null;
  return KINDS[spec.kind](actor, item, spec);
}

/** The swallowed creature's turn begins: the acid again, or nothing once free. */
/**
 * DEATH THROES (3.640.0, F&F 3.0 block 10 R5) — "When a Balor dies it
 * explodes in a 100-foot radius … Each target may make a basic Reflex save."
 * A creature ability declares `creatureAbility.deathArea` (the area rail's
 * shape); when the creature gains Dead, the acting GM gets a card with a
 * button that resolves it from where the body lies.
 */
async function offerDeathAreas(actor) {
  const { deathAreasOf } = await import("./codex-action-rules.mjs");
  for (const d of deathAreasOf(actor?.items ?? [])) {
    await card(actor, d.name, [
      line(`<strong>${actor.name} dies.</strong> ${d.area.intro ?? ""}`),
      line(`<button type="button" data-trg-death-area="1">Resolve ${d.name}</button>`)
    ], { deathArea: { actorUuid: actor.uuid, itemId: d.itemId, used: false } });
  }
  // REBORN FROM THE ASHES (3.655.0, block 22 R4): a card whose button the GM
  // presses when the wait has passed — core cannot know whether the ashes
  // were disturbed in the meantime.
  const { deathRebirthsOf, rebirthWaitText } = await import("./codex-action-rules.mjs");
  for (const r of deathRebirthsOf(actor?.items ?? [])) {
    await card(actor, r.name, [
      line(`<strong>${actor.name} dies</strong> and becomes a pile of smouldering ashes. ${rebirthWaitText(r.afterSeconds).replace(/^./, (c) => c.toUpperCase())}, the ashes reform, as if restored with a Resurrection spell.`),
      line(`<button type="button" data-trg-death-rebirth="1">${r.name}</button>`)
    ], { deathRebirth: { actorUuid: actor.uuid, itemId: r.itemId, used: false } });
  }
}

/** Press the rebirth button: Resurrection's own effect, on the creature itself. */
async function pressDeathRebirth(message, button) {
  const spec = message.getFlag?.(SYSTEM_ID, "deathRebirth");
  if (!spec || spec.used) { button.disabled = true; return; }
  button.disabled = true;
  const doc = await fromUuid(String(spec.actorUuid ?? "")).catch(() => null);
  const actor = doc?.actor ?? doc;
  const item = actor?.items?.get?.(spec.itemId);
  if (!actor || !item) { ui.notifications?.warn("That creature or its ability is no longer there."); return; }
  await message.setFlag(SYSTEM_ID, "deathRebirth", { ...spec, used: true });
  const lines = [];
  const { applySpellEffects } = await import("./magic/spell-effects.mjs");
  await applySpellEffects(actor, { name: item.name, system: {} }, {
    targets: [actor], lines, effects: [{ kind: "resurrect", target: "targets", label: item.name }]
  });
  await card(actor, item.name, lines.length ? lines : [line(`${actor.name} rises from the ashes.`)]);
}

export function registerCodexActionHooks() {
  // A FORM'S EFFECT REMOVED BY HAND gives back what it set aside (3.653.0).
  Hooks.on("deleteActiveEffect", async (effect) => {
    const { isActingGM } = await import("./acting-gm.mjs");
    if (!isActingGM()) return;
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor") return;
    const { CHANGE_SHAPE_FLAG } = await import("./change-shape.mjs");
    const was = effect.getFlag?.(SYSTEM_ID, CHANGE_SHAPE_FLAG);
    if (!was || was.left) return;
    const stashed = was.stashed;
    if (Array.isArray(stashed) && stashed.length) await restoreStashedItems(actor, effect);
    // AND ITS STRIKES AND ITS SPACE (3.653.1, found live): a form removed by
    // hand left the Bite unequipped. The Strikes it took come back, those it
    // brought go, and the token takes the creature's own size.
    const lost = was.loses ?? [];
    const brought = was.equips ?? [];
    const back = Array.from(actor.items ?? []).filter((i) => i.type === "weapon" && (lost.includes(i.name) || brought.includes(i.name)))
      .map((i) => ({ _id: i.id, "system.equipped": lost.includes(i.name) }));
    if (back.length) await actor.updateEmbeddedDocuments("Item", back);
    if (Number(was.priorTokenSize) > 0) await resizeActorTokens(actor, Number(was.priorTokenSize));
  });
  Hooks.on("createActiveEffect", async (effect) => {
    const { isActingGM } = await import("./acting-gm.mjs");
    if (!isActingGM()) return;
    const actor = effect?.parent;
    if (actor?.documentName !== "Actor" || !effect.statuses?.has?.("dead")) return;
    await offerDeathAreas(actor);
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const button = html.querySelector?.("[data-trg-death-rebirth]");
    if (!button) return;
    if (message.getFlag?.(SYSTEM_ID, "deathRebirth")?.used) { button.disabled = true; return; }
    button.addEventListener("click", () => pressDeathRebirth(message, button));
  });
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const button = html.querySelector?.("[data-trg-death-area]");
    if (!button) return;
    const spec = message.getFlag?.(SYSTEM_ID, "deathArea");
    if (!spec || spec.used) { button.disabled = true; return; }
    button.addEventListener("click", async () => {
      button.disabled = true;
      const doc = await fromUuid(String(spec.actorUuid ?? "")).catch(() => null);
      const actor = doc?.actor ?? doc;
      const item = actor?.items?.get?.(spec.itemId);
      const area = item?.flags?.[SYSTEM_ID]?.creatureAbility?.deathArea;
      if (!actor || !area) { ui.notifications?.warn("That creature or its ability is no longer there."); return; }
      await message.setFlag(SYSTEM_ID, "deathArea", { ...spec, used: true });
      const { perilEffectSpec } = await import("./peril-effect.mjs");
      const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
      const areaSpec = perilEffectSpec(area, "");
      areaSpec.isCreatureArea = true;
      const rolled = await runDeclaredAreaEffect(actor, areaSpec, { title: item.name });
      await card(actor, item.name, rolled);
    });
  });

  // THE TRAMPLE BUTTON: the GM's targets, each with a basic Reflex save.
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const button = html.querySelector?.("[data-trg-trample]");
    if (!button) return;
    button.addEventListener("click", async () => {
      const spec = message.getFlag?.(SYSTEM_ID, "trample") ?? {};
      const doc = await fromUuid(String(spec.actorUuid ?? button.dataset.actor ?? "")).catch(() => null);
      const actor = doc?.actor ?? doc;
      const targets = Array.from(game.user?.targets ?? []).map((t) => t.actor).filter((a) => a && a !== actor);
      if (!actor || !targets.length) { ui.notifications?.warn("Trample: target the creatures whose spaces it passed through."); return; }
      const { basicSavingThrow, levelDC } = await import("./dice/resolution.mjs");
      const dc = levelDC(levelOf(actor));
      const lines = [];
      for (const target of targets) {
        const roll = await new Roll(String(spec.formula ?? button.dataset.formula)).evaluate();
        const check = await rollSave(target, "reflex", dc, `${target.name} — Reflex Save`, `${spec.title ?? "Trample"} — DC ${dc}`);
        const bs = basicSavingThrow(check?.outcome?.degree?.key ?? "failure", check?.outcome?.margin ?? null);
        let total = roll.total;
        if (bs.bonusBaseDamage > 0) total += (await new Roll(`${bs.bonusBaseDamage}d${/d(\d+)/.exec(String(spec.formula ?? ""))?.[1] ?? 8}`).evaluate()).total;
        const amount = Math.floor(total * bs.damageMultiplier);
        lines.push(line(`${target.name}: Reflex <strong>${check?.outcome?.degree?.label ?? "?"}</strong> — ${amount > 0 ? await dealTyped(target, amount, String(spec.type ?? "bludgeoning"), actor) : "no damage."}`));
      }
      await card(actor, spec.title ?? "Trample", lines);
    });
  });
  Hooks.on("updateCombat", async (combat, changed) => {
    const { isActingGM } = await import("./acting-gm.mjs");
    if (!isActingGM()) return;
    if (!("turn" in changed) && !("round" in changed)) return;
    const actor = combat.combatant?.actor;
    const swallowed = actor?.getFlag?.(SYSTEM_ID, "swallowedBy");
    if (!actor || !swallowed) return;
    if (!actor.hasCondition?.("grabbed")) { await actor.unsetFlag(SYSTEM_ID, "swallowedBy"); return; }
    const doc = await fromUuid(swallowed.uuid).catch(() => null);
    const swallower = doc?.actor ?? doc;
    if (!swallower) { await actor.unsetFlag(SYSTEM_ID, "swallowedBy"); return; }
    await card(swallower, "Swallowed", await swallowedAcid(swallower, actor, { biteFormula: swallowed.biteFormula }));
  });
}
