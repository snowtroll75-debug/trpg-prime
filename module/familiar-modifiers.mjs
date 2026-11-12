/**
 * A FAMILIAR'S MODIFIERS FROM A SOURCEBOOK (3.680.0; Eldritch Arts Block 3a,
 * D8).
 *
 * The core familiar mirrors its master — level, saves, BAB and BDB, half the
 * master's hit points, skills — and nothing a module could add to. The Witch's
 * Soulbound Familiar "is treated as a familiar but gains a Base DR of 2, gains
 * additional HP equal to your level, and can add your Charisma ability score as
 * a class bonus to all saving throws".
 *
 * Base DR is an ordinary effect on the familiar. The other two need the
 * derivation: the hit points are overwritten after resources are prepared, so
 * an effect on them would be lost, and the master's Charisma is not on the
 * familiar at all. So a module registers `modify(familiar, mirror)`, the
 * mirror now carries the master's ability totals, and this file asks.
 *
 * Pure but for the registry read. A module that throws costs its own answer.
 */
import { registeredFamiliarModifiers } from "./module-api.mjs";

const SAVES = Object.freeze(["fortitude", "reflex", "will"]);
const whole = (v) => {
  const n = Math.trunc(Number(v));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Every module's answer for this familiar, cleaned.
 * @returns {Array<{key: string, label: string, hp: number, saves: {fortitude: number, reflex: number, will: number}, type: string}>}
 */
export function familiarModifierResults(familiar, mirror) {
  const out = [];
  if (!mirror) return out;
  for (const { key, modify } of registeredFamiliarModifiers()) {
    let got;
    try {
      got = modify(familiar, mirror);
    } catch (err) {
      console.error(`TRG Prime | familiar modifier "${key}" failed`, err);
      continue;
    }
    if (!got || typeof got !== "object") continue;
    const saves = {};
    for (const save of SAVES) {
      saves[save] = typeof got.saves === "object" && got.saves !== null ? whole(got.saves[save]) : whole(got.saves);
    }
    const hp = whole(got.hp);
    if (!hp && !SAVES.some((s) => saves[s])) continue;
    out.push({ key, label: String(got.label ?? key).trim() || key, hp, saves, type: String(got.type ?? "class").trim() || "class" });
  }
  return out;
}

/** The save pool entries the modifiers give, keyed by target path. */
export function familiarModifierSaveEntries(results = []) {
  const out = {};
  for (const r of results) {
    for (const save of SAVES) {
      if (!r.saves[save]) continue;
      const target = `system.combat.saves.${save}`;
      (out[target] ??= []).push({ label: r.label, value: r.saves[save], type: r.type, source: "familiarModifier" });
    }
  }
  return out;
}

/** The hit points the modifiers add, after the familiar's own maximum. */
export function familiarModifierHP(results = []) {
  return results.reduce((sum, r) => sum + r.hp, 0);
}
