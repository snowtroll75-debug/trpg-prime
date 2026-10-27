/**
 * Death guards, the Foundry half (3.627.0). The rule is in death-guard.mjs;
 * this asks it, rolls the save or asks the question, and writes the 1 HP.
 *
 * Called from `applyDamageDirect` at the moment a blow would take a creature
 * to 0, before Dying, massive damage or destruction. Returns a damage
 * result in the same shape that function returns, or null to let the blow
 * land as it would have.
 */
import {
  DECLARED_USED_TODAY_FLAG, DEATH_GUARD_ACTION, declaredDeathGuards, declaredDeathGuardSources, deathGuardDC,
  deathGuardExcepted, deathGuardGrantEffect, deathGuardHealTo, deathGuardHolds, deathGuardTypeUnknown
} from "./death-guard.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";
import { runeDeathGuardCarriers } from "../rune-declarations.mjs";

const SYSTEM_ID = "trg-prime";
const line = (html) => `<p style="margin:2px 0">${html}</p>`;

async function postGuardCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading">`
      + `<span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/**
 * @param {Actor} actor the creature about to reach 0
 * @param {object} ctx
 * @param {string[]} [ctx.damageTypes] what the blow dealt, when the caller knows
 * @param {number|null} [ctx.sourceLevel] the attacker's level, when known
 * @param {string} [ctx.sourceName]
 * @returns {Promise<object|null>}
 */
export async function tryDeathGuards(actor, { damageTypes = [], sourceLevel = null, sourceName = "", massive = false, noDeathState = false } = {}) {
  // AND A WORN RUNE'S GUARD (3.673.0, C1): Karmic Resilience, read off the
  // armour while it counts. See rune-declarations.mjs `runeDeathGuardCarriers`.
  const effects = [...declarationCarriers(actor), ...runeDeathGuardCarriers(Array.from(actor?.items ?? []))];
  if (!declaredDeathGuards(effects).length) return null;
  const sources = declaredDeathGuardSources(effects);
  const { actorDefences } = await import("../creature-traits.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
  const { levelDC } = await import("../dice/resolution.mjs");
  const defences = actorDefences(actor.system ?? {}, ownedCreatureTypeSystem(actor));
  const usedToday = actor.getFlag?.(SYSTEM_ID, DECLARED_USED_TODAY_FLAG) ?? {};
  const lines = [];

  for (const { spec, effect } of sources) {
    const why = deathGuardExcepted(spec, { damageTypes, weaknesses: defences.weaknesses, usedToday, massive, noDeathState });
    if (why) { lines.push(line(`<em>${spec.label} cannot answer this blow — ${why}.</em>`)); continue; }
    if (deathGuardTypeUnknown(spec, damageTypes)) {
      lines.push(line(`<em>${spec.label}: the blow's damage type was not reported, so its essence and weakness exception could not be checked.</em>`));
    }

    if (spec.offer) {
      const { reactionRefusal, spendReaction } = await import("./action-points-workflow.mjs");
      const refused = spec.reaction ? reactionRefusal(actor) : "";
      if (refused) { lines.push(line(`<em>${spec.label} cannot answer — ${refused}</em>`)); continue; }
      const content = `<p><strong>${actor.name}</strong> would be reduced to 0 HP${sourceName ? ` by ${sourceName}` : ""}. `
        + `Use <strong>${spec.label}</strong>${spec.frequency === "daily" ? " (once per day)" : ""}${spec.reaction ? " (a reaction)" : ""}`
        + `${spec.spell ? ` — become as if affected by ${spec.spell}` : ""} and stay at 1 HP?</p>`;
      let yes;
      if (spec.askOwner) {
        const { askOwner } = await import("../owner-query-workflow.mjs");
        yes = await askOwner(actor, { title: spec.label, content, yes: `Use ${spec.label}`, no: "Not now" });
      } else {
        const { DialogV2 } = foundry.applications.api;
        yes = await DialogV2.confirm({ window: { title: spec.label }, content, rejectClose: false });
      }
      if (!yes) { lines.push(line(`<em>${spec.label} not used.</em>`)); continue; }
      if (spec.reaction && !await spendReaction(actor, spec.label)) { lines.push(line(`<em>${spec.label} not used — no reaction to spend.</em>`)); continue; }
      lines.push(line(`<strong>${spec.label}</strong> is used.`));
    } else if (spec.auto) {
      // Second Heart (3.630.0): no save, no question — it holds.
      lines.push(line(`<strong>${spec.label}</strong> — ${actor.name} stays at <strong>1 HP</strong> instead of falling, and does not gain Dying from this blow.`));
    } else {
      const { dc, level, from } = deathGuardDC(sourceLevel, actor.system?.identity?.level ?? 0, levelDC);
      const save = spec.save;
      const { TRGCheck } = await import("../dice/check.mjs");
      const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
      const check = await TRGCheck.roll(withCheckModifiers({
        actor,
        label: `${actor.name} — ${save.charAt(0).toUpperCase()}${save.slice(1)} Save`,
        subtitle: `${spec.label} — opposed, level-based: DC ${dc} (${from === "source" ? `${sourceName || "the attacker"}, level ${level}` : `no known source; own level ${level}`})`,
        type: "save",
        save,
        dc,
        actionKey: DEATH_GUARD_ACTION
      }));
      const degree = check?.outcome?.degree;
      if (!deathGuardHolds(degree?.key)) {
        lines.push(line(`<strong>${spec.label}</strong> — ${save} save ${degree?.label ?? "failed"} against DC ${dc}: the blow lands.`));
        continue;
      }
      lines.push(line(`<strong>${spec.label}</strong> — ${save} save <strong>${degree?.label ?? "Success"}</strong> against DC ${dc}: ${actor.name} drops to <strong>1 HP</strong> instead.`));
    }

    if (spec.frequency === "daily") {
      await actor.setFlag(SYSTEM_ID, DECLARED_USED_TODAY_FLAG, { ...usedToday, [spec.label]: true });
    }
    await actor.update({ "system.resources.hp.value": 1 });
    if (spec.spell) lines.push(...await applyGuardSpell(actor, spec));
    if (spec.grants) lines.push(...await applyGuardGrants(actor, spec));
    if (spec.once) lines.push(...await spendGuard(actor, effect, spec));
    await postGuardCard(actor, spec.label, lines);
    return { case: "death-guard", guard: spec.label, newHP: 1 };
  }

  if (lines.length) await postGuardCard(actor, "Death guards", lines);
  return null;
}

/** What a held guard leaves behind (3.673.0, C1): Karmic Resilience's minute of help with dying checks. */
async function applyGuardGrants(actor, spec) {
  const data = deathGuardGrantEffect(spec.grants, {
    worldTime: Number(game.time?.worldTime ?? 0),
    round: game.combat?.started ? Number(game.combat.round ?? 0) : null
  });
  if (!data) return [];
  await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  const minutes = Math.round(spec.grants.seconds / 60);
  return [line(`${actor.name} gains <strong>${spec.grants.label}</strong> for ${minutes >= 1 ? `${minutes} minute${minutes === 1 ? "" : "s"}` : `${spec.grants.seconds} seconds`}.`)];
}

/** A one-use guard goes once it has answered (3.630.0). */
async function spendGuard(actor, effect, spec) {
  try {
    if (effect?.id && effect.parent?.effects?.get?.(effect.id)) await effect.delete();
    return [line(`<em>${spec.label} ends.</em>`)];
  } catch (_e) {
    return [line(`<em>${spec.label} should now end — delete its effect by hand.</em>`)];
  }
}

/**
 * "WOULD DIE" GUARDS (3.630.0) — Phoenix Root: "the first time your Dying
 * condition would exceed your Death State, your Dying condition is instead
 * reduced to 0 and you regain 1 Hit Point … and you increase your Fatigued
 * condition by 1 as normal for recovering from Dying"; Prism Lotus
 * (Preservation): "the first time you would die, negate only the death,
 * reduce Dying to 0 and regain Hit Points equal to half your maximum".
 *
 * ASKED BY THE REAPER, the one place every death in the system passes
 * through, before the skull goes on. A death a guard can answer is a death
 * BY DYING — Dying past the Death State, which is also how massive damage
 * and destruction at 0 are written. An instant death from Doomed, Fatigue
 * 20, Soul Drain or Constitution leaves its cause in place, so negating it
 * would only have the creature die again; those are not answered.
 *
 * Recovery is the ordinary one (`applyDyingRecovery`): Dying goes and
 * Fatigued rises by 1, the rule Phoenix Root cites and Prism Lotus inherits.
 *
 * @returns {Promise<{label: string, hp: number}|null>} the guard that spared it
 */
export async function trySparingGuards(actor) {
  const sources = declaredDeathGuardSources(Array.from(actor?.appliedEffects ?? actor?.effects ?? []), { trigger: "death" });
  if (!sources.length) return null;
  // The reaper has already ruled out an instant death (see death-state.mjs).
  const { applyDyingRecovery, clearUnconsciousIfConscious } = await import("./death-state.mjs");
  const usedToday = actor.getFlag?.(SYSTEM_ID, DECLARED_USED_TODAY_FLAG) ?? {};
  for (const { spec, effect } of sources) {
    if (deathGuardExcepted(spec, { usedToday })) continue;
    if (spec.offer) {
      const { DialogV2 } = foundry.applications.api;
      const yes = await DialogV2.confirm({
        window: { title: spec.label },
        content: `<p><strong>${actor.name}</strong> would die. Use <strong>${spec.label}</strong>?</p>`,
        rejectClose: false
      });
      if (!yes) continue;
    }
    const hp = deathGuardHealTo(spec, actor.system?.resources?.hp?.max);
    await actor.update({ "system.resources.hp.value": hp });
    await actor.toggleStatusEffect("dying", { value: 1 });
    const state = await applyDyingRecovery(actor);
    await clearUnconsciousIfConscious(actor);
    if (spec.frequency === "daily") await actor.setFlag(SYSTEM_ID, DECLARED_USED_TODAY_FLAG, { ...usedToday, [spec.label]: true });
    const lines = [line(`<strong>${spec.label}</strong> — ${actor.name} does not die. Dying is reduced to 0 and they regain <strong>${hp} HP</strong>`
      + `${state?.fatigued ? `; Fatigued ${state.fatigued}, as for recovering from Dying` : ""}.`)];
    if (state?.blocked) lines.push(line(`<em>${state.note ?? "A fatal injury keeps them Dying."}</em>`));
    if (spec.once) lines.push(...await spendGuard(actor, effect, spec));
    await postGuardCard(actor, spec.label, lines);
    return { label: spec.label, hp };
  }
  return null;
}

/** Gaseous Escape: the named spell's own effect rows, on the creature itself, at no cost. */
async function applyGuardSpell(actor, spec) {
  const { contentPack } = await import("../content-packs.mjs");
  const pack = contentPack("spells");
  const index = pack ? await pack.getIndex() : [];
  const entry = Array.from(index.values?.() ?? index).find((e) => String(e.name).trim().toLowerCase() === spec.spell.toLowerCase());
  if (!entry) return [line(`<em>${spec.label}: no spell named ${spec.spell} was found — apply it by hand.</em>`)];
  const doc = await pack.getDocument(entry._id);
  const spell = new Item.implementation(doc.toObject(), { parent: actor });
  const lines = [];
  const { applySpellEffects } = await import("../magic/spell-effects.mjs");
  await applySpellEffects(actor, spell, { targets: [actor], lines });
  return [line(`${actor.name} becomes as if affected by <strong>${spec.spell}</strong> (${doc.system?.duration ?? ""}).`), ...lines];
}
