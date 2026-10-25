/**
 * WHAT AN ALLY AURA GIVES, AS AN EFFECT ON THE CREATURES INSIDE IT (3.634.0;
 * Fiends & Fables 3.0 block 4, ruling R1 — Graham, 12 October 2026).
 *
 * The angels' and agothians' auras give allies standing bonuses:
 *
 *   Radiant Aura (Dracoral)   +1 status DB and saves; essence and evil
 *                             resistance; healing spells warped 2 PP free
 *   Calming Aura (Luporal)    +1 status Will saves
 *   Archangel Aura            +2 status DB and saves against evil creatures;
 *                             healing spells warped 2 PP free
 *   Guardian Aura             +1 status DB; essence resistance
 *   Seraphim Aura             +2 status DB and base damage against evil
 *   Inspiring Aura (Virtue)   +1 status attack rolls and saves against fear
 *
 * Every one of those already has a rail when it sits on an ACTIVE EFFECT: a
 * custom change into the bonus pools (DB, saves, attack), a text change on
 * resistances, a `defenceDC` entry scoped to evil attackers, a conditional
 * row for "saves against fear", a `versusDamage` record against an
 * alignment, Healer's Grace's `warpFreeSchool` on the Healing trait. So an
 * ally aura declares the effect it lays —
 *
 *   auras: [{ kind: "ally", radius: 20, allyEffect: { changes, conditionals,
 *            defenceDC, versusDamage, warpFreeSchool } }]
 *
 * — and the workflow keeps one such effect on each ally inside, laid when
 * they come in and lifted when they leave. Nothing new reads a bonus; the
 * aura only decides who carries one.
 *
 * WHO IS AN ALLY: not the emitter ("allies"), and not a creature of plainly
 * the opposing side (aura-conditionals.mjs `plainlyOpposed`). REACH: the
 * emitter's space plus the radius, to the subject's space — the same
 * measure Mucus Cloud uses (creature-auras.mjs `aurasCatching`).
 *
 * Pure.
 */
import { auraReachFeet, withinAura } from "./creature-auras.mjs";
import { plainlyOpposed } from "./aura-conditionals.mjs";

const SYSTEM_ID = "trg-prime";
export const ALLY_GRANT_FLAG = "allyAuraGrant";

const arr = (v) => (Array.isArray(v) ? v : []);

/** An aura's declared ally effect, normalised; null when it lays none. */
export function allyEffectOf(raw) {
  if (!raw || typeof raw !== "object") return null;
  const changes = arr(raw.changes).filter((c) => c && typeof c.key === "string" && c.key.startsWith("system.") && c.value !== undefined)
    .map((c) => ({ key: c.key, value: String(c.value), type: c.type === "add" ? "add" : "custom", priority: Number(c.priority) || 20 }));
  const conditionals = arr(raw.conditionals).filter((c) => c && typeof c === "object");
  const defenceDC = arr(raw.defenceDC).filter((d) => d && typeof d === "object");
  const versusDamage = raw.versusDamage && typeof raw.versusDamage === "object" ? { ...raw.versusDamage } : null;
  const warpFreeSchool = raw.warpFreeSchool && typeof raw.warpFreeSchool === "object" ? { ...raw.warpFreeSchool } : null;
  // AURA OF ASHES (3.644.0, F&F 3.0 block 14 R5): "All creatures within this
  // 20-foot aura are concealed" — a condition laid while inside, lifted on
  // leaving, as the rest of the effect is.
  const statuses = arr(raw.statuses).map((s) => String(s ?? "").trim().toLowerCase()).filter(Boolean);
  if (!changes.length && !conditionals.length && !defenceDC.length && !versusDamage && !warpFreeSchool && !statuses.length) return null;
  return { changes, conditionals, defenceDC, versusDamage, warpFreeSchool, statuses };
}

/** The grant key: one per emitter per aura, so two Dracorals are two grants. */
function allyGrantKey(emitterId, auraId) {
  return `${emitterId}:${auraId}`;
}

/**
 * Which ally effects each subject should carry right now.
 * @param {{subjects: {id, centreFeet, widthFeet, disposition}[], emitters: {id, name, centreFeet, widthFeet, disposition, auras}[]}} args
 * @returns {Map<string, {key, aura, emitter}[]>} subject id → grants
 */
export function wantedAllyGrants({ subjects = [], emitters = [] } = {}) {
  const out = new Map();
  for (const subject of subjects) {
    const list = [];
    for (const emitter of emitters) {
      const self = emitter.id === subject.id;
      // AN ENEMY TAKES THE MIRROR (3.640.0): an aura with an `enemyEffect`
      // lays it on a creature plainly of the other side.
      const opposed = plainlyOpposed(emitter.disposition, subject.disposition);
      for (const aura of emitter.auras ?? []) {
        if (aura?.kind !== "ally") continue;
        // ITS OWN SOURCE ONLY WHEN DECLARED (3.646.0, `includeSelf`).
        if (self && !aura.includeSelf) continue;
        // ONLY WHILE SWITCHED ON (3.669.0; Inner Tempest's Spirit Beacon and
        // Mist Veil, auras a Use raises for a while): the gate the save
        // auras already keep (creature-auras.mjs `aurasCatching`).
        if (aura.emitterState && !(emitter.states ?? []).includes(aura.emitterState)) continue;
        const effect = opposed ? aura.enemyEffect : aura.allyEffect;
        if (!effect) continue;
        const reach = auraReachFeet(aura.radius, emitter.widthFeet) + Math.max(0, (Number(subject.widthFeet) || 5) - 5) / 2;
        if (!withinAura(emitter.centreFeet, subject.centreFeet, reach)) continue;
        list.push({ key: `${allyGrantKey(emitter.id, aura.id)}${opposed ? ":enemy" : ""}`, aura, emitter, effect, enemy: opposed });
      }
    }
    out.set(subject.id, list);
  }
  return out;
}

/** The ActiveEffect one grant lays. */
export function allyGrantEffectData({ key, aura, emitter, effect = null, enemy = false }) {
  const fx = effect ?? aura.allyEffect;
  const flags = { [ALLY_GRANT_FLAG]: key };
  if (fx.conditionals.length) flags.conditionals = fx.conditionals.map((c, i) => ({ id: `${key}:${i}`, ...c, label: c.label ?? aura.name }));
  if (fx.defenceDC.length) flags.defenceDC = fx.defenceDC.map((d) => ({ ...d, label: d.label ?? aura.name }));
  if (fx.versusDamage) flags.versusDamage = { kind: "versusDamage", label: aura.name, ...fx.versusDamage };
  if (fx.warpFreeSchool) flags.warpFreeSchool = { label: aura.name, ...fx.warpFreeSchool };
  return {
    name: `${aura.name} (${emitter.name})${enemy ? " — against" : ""}`,
    img: "icons/svg/aura.svg",
    changes: fx.changes.map((c) => ({ key: c.key, value: c.value, type: c.type, priority: c.priority })),
    ...(fx.statuses?.length ? { statuses: [...fx.statuses] } : {}),
    flags: { [SYSTEM_ID]: flags }
  };
}

/** Of the effects a subject carries, which to lay and which to lift. */
export function allyGrantDelta(existingKeys = [], wanted = []) {
  const have = new Set(existingKeys);
  const want = new Set(wanted.map((g) => g.key));
  return {
    add: wanted.filter((g) => !have.has(g.key)),
    remove: [...have].filter((k) => !want.has(k))
  };
}
