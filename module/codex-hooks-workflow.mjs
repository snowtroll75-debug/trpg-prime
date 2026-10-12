/**
 * THE CODEX'S LISTENERS (3.631.0; Fiends & Fables 3.0 block 1, Chapter 2 —
 * Graham's ruling of 9 October 2026: "all automated").
 *
 * Abilities that act when something ELSE happens — a kill, a cast, a hit's
 * secondary damage, a grabbed creature's turn — rather than on a Use:
 *
 *   Souldrinker        "Trigger The creature kills a living creature which
 *                      cannot be more than 4 levels lower than it. The
 *                      creature immediately gains healing equivalent to
 *                      that of a cure or restoration spell warped to a
 *                      caster level equal to the creature's level."
 *                      — on the kill (dying-workflow's trgPrimeCreatureSlain):
 *                      Cure's 1d8 per caster level, rolled and applied.
 *   Undead Spawn       "A target slain by one of the creature's natural
 *                      attacks that inflicts soul drain rises as an undead
 *                      the following day at dusk" — the reminder, on the kill.
 *   Alien Mind         "If the creature is targeted with a mental effect …
 *                      the creator of that effect takes 4d6 mental damage
 *                      (basic Will)" — on the cast (trgPrimeSpellCast).
 *   Reflective Scales  "Trigger The creature is targeted with a spell. The
 *                      creature makes a Dispel (Power Manipulation) check
 *                      against the incoming spell. If the result of the
 *                      check is a critical, then the spell is reflected upon
 *                      its caster as if using the Spell Turning spell."
 *                      — on the cast: the reaction spent, the check rolled.
 *   Corrode            "Any secondary damage inflicted by the creature is
 *                      also inflicted upon any metal armour that the target
 *                      has … split between armour and shield 50%."
 *                      — on the hit's secondary packet (trgPrimeSecondaryDamage).
 *   Elemental Grasp    "Any grabbed target takes 3d6 elemental damage at the
 *                      beginning of their turns. With a basic Reflex save to
 *                      avoid." — at the grabbed creature's turn start.
 *   Elemental Blood    "If the creature takes any recurring bleed damage,
 *                      all targets take an equal amount of elemental splash
 *                      damage each turn." — at the bleeding creature's turn
 *                      start, to every adjacent creature.
 *   Garlic Repulsion   a GM toggle on the token ("near garlic") — Sickened
 *                      1, 2 within 5 feet; the toggle is the GM's word.
 *
 * Declared on the entries (creature-ability-rules.mjs reads the derives):
 *   derives.souldrinker: { levelsBelow: 4 }
 *   derives.undeadSpawn: true
 *   derives.retaliate: { traits: ["mental"], damage: "4d6", type: "mental", save: "will" }
 *   derives.reflectSpells: true
 *   derives.corrode: true
 *   derives.grabbedTurnDamage: { dice: "3d6", save: "reflex" }  (type from the name)
 *   derives.bleedSplash: true                                   (type from the name)
 *
 * Every hook is guarded by isActingGM() where it writes — one client acts.
 */
import { isActingGM } from "./acting-gm.mjs";
import { abilityDerives, elementOfName } from "./creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const levelOf = (a) => Math.max(0, Math.floor(Number(a?.system?.identity?.level ?? 0) || 0));

async function card(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor?.name ?? ""}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/** The first ability of this creature whose derives carry `key`, with its rule. */
function abilityRule(items, key) {
  for (const { item, derives } of abilityDerives(items)) {
    if (derives?.[key]) return { item, rule: derives[key] };
  }
  return null;
}

/** The creature on the scene whose name the damage carried — the killer. */
function actorsNamed(name) {
  const wanted = String(name ?? "").trim().toLowerCase();
  if (!wanted) return [];
  const out = [];
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor && String(token.actor.name).trim().toLowerCase() === wanted) out.push(token.actor);
  }
  return out;
}

/** Creatures whose token is adjacent to this actor's token. */
function adjacentActors(actor) {
  const token = actor?.token?.object ?? actor?.getActiveTokens?.(true, true)?.[0]?.object ?? actor?.getActiveTokens?.()?.[0] ?? null;
  if (!token) return [];
  const out = [];
  for (const other of canvas?.tokens?.placeables ?? []) {
    if (other === token || other.id === token.id || !other.actor) continue;
    const d = canvas?.grid?.measurePath?.([token.center, other.center])?.distance ?? Infinity;
    const reach = (Number(canvas?.scene?.grid?.distance ?? 5) || 5) * (Math.max(1, Number(token.document?.width ?? 1)) + Math.max(1, Number(other.document?.width ?? 1))) / 2;
    if (d <= reach) out.push(other.actor);
  }
  return out;
}

async function basicSaveDamage(source, target, { formula, type, save, title, dcAdd = 0 }) {
  const { TRGCheck } = await import("./dice/check.mjs");
  const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
  const { basicSavingThrow, levelDC } = await import("./dice/resolution.mjs");
  const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
  const dc = levelDC(levelOf(source)) + dcAdd;
  const check = await TRGCheck.roll(withCheckModifiers({ actor: target, label: `${target.name} — ${save[0].toUpperCase()}${save.slice(1)} Save`, subtitle: `${title} — DC ${dc}`, type: "save", save, dc }));
  const bs = basicSavingThrow(check?.outcome?.degree?.key ?? "failure", check?.outcome?.margin ?? null);
  const roll = await new Roll(formula).evaluate();
  let total = roll.total;
  if (bs.bonusBaseDamage > 0) total += (await new Roll(`${bs.bonusBaseDamage}d${/d(\d+)/.exec(formula)?.[1] ?? 6}`).evaluate()).total;
  const amount = Math.floor(total * bs.damageMultiplier);
  if (amount <= 0) return `${target.name}: ${save} <strong>${check?.outcome?.degree?.label ?? "?"}</strong> — no damage.`;
  const dealt = await applyTypedDamage(target, { amount, type, sourceLevel: levelOf(source), sourceName: source.name });
  return `${target.name}: ${save} <strong>${check?.outcome?.degree?.label ?? "?"}</strong> — ${describeDamage(dealt.packet, target.name)}`;
}

/* ---------------------------------------------------------------- kills */

async function onCreatureSlain({ victim, sourceName }) {
  if (!isActingGM() || !victim) return;
  const { isLivingCreature } = await import("./kind-targeting.mjs");
  for (const killer of actorsNamed(sourceName)) {
    const items = Array.from(killer.items ?? []);
    const drink = abilityRule(items, "souldrinker");
    if (drink && isLivingCreature(victim.system ?? {})) {
      const below = Math.max(0, Number(drink.rule?.levelsBelow ?? 4) || 4);
      if (levelOf(victim) >= levelOf(killer) - below) {
        const level = Math.max(1, levelOf(killer));
        const roll = await new Roll(`${level}d8`).evaluate();
        const { healActor } = await import("./magic/spell-effects.mjs");
        const healed = Number(await healActor(killer, roll.total, { magical: true })) || 0;
        await card(killer, drink.item.name, [line(`${killer.name} slew ${victim.name} (level ${levelOf(victim)}, within ${below} of its own): healed as a Cure at caster level ${level} — ${level}d8 = ${roll.total}, <strong>${healed} HP</strong> regained.`)]);
      } else {
        await card(killer, drink.item.name, [line(`${victim.name} is more than ${below} levels below ${killer.name} — no healing.`)]);
      }
    }
    const spawn = abilityRule(items, "undeadSpawn");
    if (spawn) {
      // THE CREATOR, RECORDED (3.632.0, ruling 8): if the victim rises with
      // the Spawn trait, Aligned Control reads who made it.
      if (victim.isOwner) await victim.setFlag(SYSTEM_ID, "spawnCreator", { uuid: killer.uuid, name: killer.name });
      await card(killer, spawn.item.name, [line(`${victim.name} was slain by ${killer.name}. If the blow was a natural attack that inflicts soul drain, ${victim.name} rises as an undead the following day at dusk — usually the same kind as ${killer.name} — with the Spawn trait.`)]);
    }
  }
}

/* ---------------------------------------------------------------- casts */

async function onSpellCast({ actor: caster, spell, spellData, targets }) {
  if (!isActingGM() || !caster || !Array.isArray(targets)) return;
  const traits = String(spellData?.traits ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean);
  for (const target of targets) {
    if (!target || target === caster) continue;
    const items = Array.from(target.items ?? []);
    const retaliate = abilityRule(items, "retaliate");
    if (retaliate) {
      const wanted = (Array.isArray(retaliate.rule.traits) ? retaliate.rule.traits : ["mental"]).map((t) => String(t).toLowerCase());
      if (wanted.some((t) => traits.includes(t))) {
        const text = await basicSaveDamage(target, caster, {
          formula: String(retaliate.rule.damage ?? "4d6"), type: String(retaliate.rule.type ?? "mental"),
          save: String(retaliate.rule.save ?? "will"), title: `${retaliate.item.name} — ${spell?.name ?? "the effect"} targeted ${target.name}`
        });
        await card(target, retaliate.item.name, [line(`${target.name}'s mind is so alien that ${spell?.name ?? "the effect"}'s creator suffers for touching it.`), line(text)]);
      }
    }
    const reflect = abilityRule(items, "reflectSpells");
    if (reflect) {
      const reactions = Number(target.system?.resources?.reactions?.value ?? 0);
      if (game.combat?.started && reactions <= 0) {
        await card(target, reflect.item.name, [line(`${target.name} has no reaction left to answer ${spell?.name ?? "the spell"}.`)]);
        continue;
      }
      if (game.combat?.started) await target.update({ "system.resources.reactions.value": reactions - 1 });
      const { TRGCheck } = await import("./dice/check.mjs");
      const { withCheckModifiers } = await import("./dice/check-modifiers.mjs");
      const { levelDC } = await import("./dice/resolution.mjs");
      const dc = levelDC(levelOf(caster));
      const skill = target.system?.skills?.powerManipulation;
      const check = await TRGCheck.roll(withCheckModifiers({
        actor: target, label: `${target.name} — Dispel (Power Manipulation)`, subtitle: `${reflect.item.name} — against ${spell?.name ?? "the spell"}, DC ${dc} (${caster.name}'s Level DC)`,
        type: "skill", subject: "powerManipulation", dc,
        modifiers: skill?.checkModifiers ?? [{ label: "Power Manipulation", value: Number(skill?.total ?? 0), type: "untyped" }]
      }));
      const key = check?.outcome?.degree?.key ?? "failure";
      const lines = [line(`Reaction: Dispel <strong>${check?.outcome?.degree?.label ?? "?"}</strong> against DC ${dc}.`)];
      if (["heroic", "critical"].includes(key)) lines.push(line(`<strong>Reflected</strong> — ${spell?.name ?? "the spell"} turns back upon ${caster.name} as if by Spell Turning: resolve it against the caster instead of ${target.name}.`));
      else if (check?.outcome?.degree?.success) lines.push(line(`Dispelled — ${spell?.name ?? "the spell"} does not affect ${target.name} (counteracted).`));
      else lines.push(line(`The spell takes effect as cast.`));
      await card(target, reflect.item.name, lines);
    }
  }
}

/* ---------------------------------------------------------------- hits */

async function onSecondaryDamage({ attacker, target, amount, type }) {
  if (!isActingGM() || !attacker || !target) return;
  const corrode = abilityRule(Array.from(attacker.items ?? []), "corrode");
  if (!corrode || !(Number(amount) > 0)) return;
  const items = Array.from(target.items ?? []);
  const isMetal = (i) => /\bmetal\b/i.test(String(i.system?.traits ?? "")) || i.system?.metal === true;
  const armour = items.filter((i) => i.type === "armour" && i.system?.equipped && isMetal(i));
  const shield = items.find((i) => i.type === "shield" && i.system?.equipped && isMetal(i));
  if (!armour.length && !shield) return;
  const lines = [];
  const hit = async (item, dmg) => {
    const hp = Number(item.system?.hp?.value ?? 0);
    const after = Math.max(0, hp - dmg);
    await item.update({ "system.hp.value": after });
    lines.push(line(`${item.name}: ${dmg} ${type} — HP ${hp} → <strong>${after}</strong>${after <= 0 ? " (broken)" : ""}.`));
  };
  if (armour.length && shield) {
    const half = Math.floor(Number(amount) / 2);
    await hit(armour[0], Number(amount) - half);
    await hit(shield, half);
  } else {
    await hit(armour[0] ?? shield, Number(amount));
  }
  await card(attacker, corrode.item.name, [line(`${amount} ${type} secondary damage also corrodes ${target.name}'s metal protection.`), ...lines]);
}

/* ---------------------------------------------------------------- turn starts */

async function onTurnStart(combat, changed) {
  if (!isActingGM()) return;
  if (!("turn" in changed) && !("round" in changed)) return;
  const actor = combat.combatant?.actor;
  if (!actor) return;

  // ELEMENTAL GRASP: this creature is Grabbed by one whose grasp burns.
  const grabbedBy = actor.getFlag?.(SYSTEM_ID, "grabbedBy");
  if (grabbedBy?.uuid && actor.hasCondition?.("grabbed")) {
    const doc = await fromUuid(grabbedBy.uuid).catch(() => null);
    const holder = doc?.actor ?? doc;
    const grasp = holder ? abilityRule(Array.from(holder.items ?? []), "grabbedTurnDamage") : null;
    if (grasp) {
      const type = String(grasp.rule.type ?? elementOfName(grasp.item.name) ?? "fire");
      const text = await basicSaveDamage(holder, actor, { formula: String(grasp.rule.dice ?? "3d6"), type, save: String(grasp.rule.save ?? "reflex"), title: grasp.item.name });
      await card(holder, grasp.item.name, [line(`${actor.name} begins its turn in ${holder.name}'s grasp.`), line(text)]);
    }
  }

  // ELEMENTAL BLOOD: this creature bleeds, and its blood burns those beside it.
  const blood = abilityRule(Array.from(actor.items ?? []), "bleedSplash");
  const bleeding = Number(actor.getConditionValue?.("bleeding") ?? 0);
  if (blood && bleeding > 0) {
    const type = String(blood.rule?.type ?? elementOfName(blood.item.name) ?? "fire");
    const { applyTypedDamage, describeDamage } = await import("./combat/damage-workflow.mjs");
    const lines = [line(`${actor.name} is Bleeding ${bleeding}: ${bleeding} ${type} splash to every adjacent creature.`)];
    for (const other of adjacentActors(actor)) {
      const dealt = await applyTypedDamage(other, { amount: bleeding, type, sourceLevel: levelOf(actor), sourceName: actor.name });
      lines.push(line(describeDamage(dealt.packet, other.name)));
    }
    if (lines.length === 1) lines.push(line("Nobody is adjacent."));
    await card(actor, blood.item.name, lines);
  }

  // GARLIC REPULSION: the GM has marked the token as near garlic.
  const garlic = abilityRule(Array.from(actor.items ?? []), "garlicRepulsion");
  const near = actor.getFlag?.(SYSTEM_ID, "nearGarlic");
  if (garlic && near) {
    const value = near === "adjacent" ? 2 : 1;
    const current = Number(actor.getConditionValue?.("sickened") ?? 0);
    if (current < value) {
      await actor.toggleStatusEffect("sickened", { active: true, value });
      await card(actor, garlic.item.name, [line(`Near garlic (${near === "adjacent" ? "within 5 feet" : "in range of the odour"}): <strong>Sickened ${value}</strong> — this overrides any immunity or resistance to the condition.`)]);
    }
  }
}

/*
 * CRIMSON COVENANT (3.632.0; Fiends & Fables 3.0 block 2, ruling 2). The
 * critical-injury hook fires on the one client that rolled the injury, so
 * each write is made where the document is owned rather than gated on the
 * GM: a player's live covenant is the player's flag, a monster's crit on a
 * PC runs on the GM's client, which owns both.
 */
async function onCriticalInjury({ attacker, target, tags }) {
  const { CRIMSON_COVENANT, CRIMSON_COVENANT_FLAG, crimsonCovenantArms, crimsonCovenantStopsBleeding } = await import("./codex-feat-rules.mjs");
  if (target?.isOwner && crimsonCovenantArms(target.items, tags)) {
    await target.setFlag(SYSTEM_ID, CRIMSON_COVENANT_FLAG, { state: "armed" });
    await card(target, CRIMSON_COVENANT, [line(`A bleed result of 5 or more — ${target.name}'s next attack gains <strong>+4 luck</strong>.`)]);
  }
  if (attacker?.isOwner && crimsonCovenantStopsBleeding(attacker.getFlag?.(SYSTEM_ID, CRIMSON_COVENANT_FLAG))) {
    await attacker.unsetFlag(SYSTEM_ID, CRIMSON_COVENANT_FLAG);
    const bleeding = Number(attacker.getConditionValue?.("bleeding") ?? 0);
    if (bleeding > 0) await attacker.toggleStatusEffect("bleeding", { active: false });
    await card(attacker, CRIMSON_COVENANT, [line(bleeding > 0
      ? `The covenant's attack dealt a critical injury — ${attacker.name}'s <strong>bleeding stops</strong> (Bleeding ${bleeding} removed).`
      : `The covenant's attack dealt a critical injury; ${attacker.name} was no longer bleeding.`)]);
  }
}

export function registerCodexHooks() {
  Hooks.on("trgPrimeCriticalInjury", (ctx) => { onCriticalInjury(ctx ?? {}).catch((e) => console.error(`${SYSTEM_ID} | Crimson Covenant hook`, e)); });
  Hooks.on("trgPrimeCreatureSlain", (ctx) => { onCreatureSlain(ctx).catch((e) => console.error(`${SYSTEM_ID} | Codex kill hook`, e)); });
  Hooks.on("trgPrimeSpellCast", (ctx) => { onSpellCast(ctx).catch((e) => console.error(`${SYSTEM_ID} | Codex cast hook`, e)); });
  Hooks.on("trgPrimeSecondaryDamage", (ctx) => { onSecondaryDamage(ctx).catch((e) => console.error(`${SYSTEM_ID} | Codex secondary-damage hook`, e)); });
  Hooks.on("updateCombat", (combat, changed) => { onTurnStart(combat, changed).catch((e) => console.error(`${SYSTEM_ID} | Codex turn-start hook`, e)); });
}
