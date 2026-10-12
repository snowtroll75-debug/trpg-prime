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
  const held = grabbedByActor(actor);
  if (!held.length) { ui.notifications?.warn(`${item.name}: ${actor.name} has nobody Grabbed.`); return false; }
  if (!(await spendAp(actor, spec.ap ?? 1, item.name))) return false;
  const weapon = Array.from(actor.items ?? []).find((i) => i.type === "weapon" && /constrict/i.test(i.name));
  const formula = String(spec.dice ?? weapon?.system?.damage ?? "").trim();
  if (!formula) { await card(actor, item.name, [line("No Constrict damage is listed on this creature — add a weapon named Constrict.")]); return true; }
  const { basicSavingThrow, levelDC } = await import("./dice/resolution.mjs");
  const dc = levelDC(levelOf(actor));
  const type = String(spec.damageType ?? weapon?.system?.damageType ?? "bludgeoning");
  const lines = [line(`<strong>${formula} ${type}</strong> to each creature it holds; basic Fortitude save, DC ${dc}.`)];
  for (const target of held) {
    const roll = await new Roll(formula).evaluate();
    const check = await rollSave(target, "fortitude", dc, `${target.name} — Fortitude Save`, `${item.name} — DC ${dc}`);
    const bs = basicSavingThrow(check?.outcome?.degree?.key ?? "failure", check?.outcome?.margin ?? null);
    let total = roll.total;
    if (bs.bonusBaseDamage > 0) total += (await new Roll(`${bs.bonusBaseDamage}d${/d(\d+)/.exec(formula)?.[1] ?? 6}`).evaluate()).total;
    const amount = Math.floor(total * bs.damageMultiplier);
    lines.push(line(`${target.name}: Fortitude <strong>${check?.outcome?.degree?.label ?? "?"}</strong> — ${amount > 0 ? await dealTyped(target, amount, type, actor) : "no damage."}`));
  }
  await card(actor, item.name, lines);
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
  const weapon = Array.from(actor.items ?? []).find((i) => i.type === "weapon" && new RegExp(String(spec.weapon ?? "slam"), "i").test(i.name))
    ?? Array.from(actor.items ?? []).find((i) => i.type === "weapon");
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

const KINDS = Object.freeze({ constrict, rend, tearFlesh, abyssalHealing, swallow, magicDispelling, whispersOfTheGrave, amorphousSplit, eternalSummons, trample, draconicShifting });

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
export function registerCodexActionHooks() {
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
