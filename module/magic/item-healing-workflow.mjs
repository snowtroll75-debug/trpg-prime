/**
 * WHAT AN ITEM ADDS TO A HEAL (3.626.0). The Foundry half of
 * healing-riders.mjs's item riders and rune-declarations.mjs's `onHealed`:
 *
 *   Hands of Mercy    "After rolling the spell's healing dice, select one
 *                      healing die and maximise it" (1/day; two dice for a
 *                      Healer with the Lifebinder Calling)
 *   Rod of Merciful   "Expend 1 PP from the rod … select one creature that
 *   Channeling         regained HP from it. That creature regains an
 *                      additional 1d8 HP."
 *   Last Vigil (rune) "Trigger: You regain Hit Points from a spell with the
 *                      Healing trait … reduce either Fatigued or Sickened by
 *                      1. If the triggering spell required at least 4 PP …
 *                      Dazed or Weakened … 6 PP Injured" (1/day)
 *
 * Asked, because each is an activation. ONCE PER CAST for the maximise
 * (the formula is transformed before the first target's roll); the rod
 * asks per healed creature until one is chosen; Last Vigil asks the
 * WEARER's own rune, once a day, after the heal lands.
 */

import { itemHealingRiders, itemRiderAvailable, maximiseDice } from "./healing-riders.mjs";
import { activeDeclaredRunesOn, runeFrequencyAllows, runeMarkersOf, runeUseUpdates } from "../rune-declarations.mjs";
import { RELIEVABLE } from "./condition-relief.mjs";

const SYSTEM_ID = "trg-prime";
const esc = (v) => foundry.utils.escapeHTML?.(String(v ?? "")) ?? String(v ?? "");

/** What a cast has already decided, keyed by castId: { maximised, rodSpent, declined: Set }. */
const CAST_MEMORY = new Map();
function castMemory(castId) {
  const key = String(castId ?? "") || "no-cast";
  if (!CAST_MEMORY.has(key)) {
    if (CAST_MEMORY.size > 40) CAST_MEMORY.delete(CAST_MEMORY.keys().next().value);
    CAST_MEMORY.set(key, { maximised: new Set(), rodSpent: new Set(), declined: new Set() });
  }
  return CAST_MEMORY.get(key);
}

function featNamesOf(actor) {
  return Array.from(actor?.items ?? []).filter((i) => i.type === "feat" || i.type === "ability").map((i) => i.name);
}

/**
 * The heal formula after the caster's item riders had their say — asked
 * once per cast, before the first target's roll.
 * @returns {Promise<{formula: string, lines: string[]}>}
 */
export async function offerItemMaximise(caster, { formula, castId }) {
  const lines = [];
  let out = String(formula ?? "");
  if (!caster || !/\d+d\d+/.test(out)) return { formula: out, lines };
  const memory = castMemory(castId);
  const riders = itemHealingRiders(Array.from(caster.items ?? []), { featNames: featNamesOf(caster) }).filter((r) => r.maximiseDice > 0);
  for (const rider of riders) {
    if (!itemRiderAvailable(rider) || memory.declined.has(rider.id)) continue;
    if (memory.maximised.has(rider.id)) { out = maximiseDice(out, rider.maximiseDice); continue; }
    const { DialogV2 } = foundry.applications.api;
    const yes = await DialogV2.confirm({
      window: { title: rider.label },
      content: `<p><strong>${esc(rider.label)}</strong>: maximise ${rider.maximiseDice === 1 ? "one healing die" : `${rider.maximiseDice} healing dice`} of this spell (${esc(out)})? ${rider.frequency === "daily" ? "Once a day." : ""}</p>`,
      rejectClose: false
    });
    if (!yes) { memory.declined.add(rider.id); continue; }
    memory.maximised.add(rider.id);
    out = maximiseDice(out, rider.maximiseDice);
    lines.push(`${rider.label}: ${rider.maximiseDice === 1 ? "one healing die" : `${rider.maximiseDice} healing dice`} maximised`);
    const item = caster.items.get(rider.itemId);
    if (item && rider.frequency === "daily") {
      await item.setFlag(SYSTEM_ID, "runeUsedToday", { ...(item.flags?.[SYSTEM_ID]?.runeUsedToday ?? {}), healingRider: true });
    }
  }
  return { formula: out, lines };
}

/**
 * The rod's extra die for one healed creature, asked after the heal.
 * @returns {Promise<string[]>} card lines
 */
export async function offerRodExtraHeal(caster, target, { castId, healed = 0, healActor }) {
  const lines = [];
  if (!caster || !target || !(Number(healed) > 0)) return lines;
  const memory = castMemory(castId);
  const riders = itemHealingRiders(Array.from(caster.items ?? [])).filter((r) => r.extraDice);
  for (const rider of riders) {
    if (memory.rodSpent.has(rider.id) || memory.declined.has(`${rider.id}:${target.uuid}`)) continue;
    const item = caster.items.get(rider.itemId);
    if (!item) continue;
    const { DialogV2 } = foundry.applications.api;
    const yes = await DialogV2.confirm({
      window: { title: rider.label },
      content: `<p><strong>${esc(rider.label)}</strong>: ${rider.ppCost ? `expend ${rider.ppCost} PP from the rod (${Number(item.system?.uses ?? 0)} held) so that ` : ""}<strong>${esc(target.name)}</strong> regains an additional ${esc(rider.extraDice)} HP?${rider.oneTarget ? " One creature per spell." : ""}</p>`,
      rejectClose: false
    });
    if (!yes) { memory.declined.add(`${rider.id}:${target.uuid}`); continue; }
    const roll = await new Roll(rider.extraDice).evaluate();
    const extra = await healActor(target, roll.total, { magical: true });
    if (rider.oneTarget) memory.rodSpent.add(rider.id);
    if (rider.ppCost > 0) {
      const { spendFromRod } = await import("../charged-items-workflow.mjs");
      lines.push(await spendFromRod(caster, item, rider.ppCost));
    }
    lines.push(`${rider.label}: ${target.name} regains <strong>${extra}</strong> more HP (${rider.extraDice}).`);
  }
  return lines;
}

/**
 * The healed creature's own rune (Last Vigil): a relief step chosen by
 * the PP the spell required.
 * @returns {Promise<string[]>}
 */
export async function offerOnHealedRelief(target, { spellName = "", spellTraits = "", ppRequired = 0, healed = 0 }) {
  const lines = [];
  if (!target || !(Number(healed) > 0) || !/\bhealing\b/i.test(String(spellTraits ?? ""))) return lines;
  const items = Array.from(target.items ?? []);
  const now = Number(game.time?.worldTime ?? 0);
  for (const item of items) {
    for (const entry of activeDeclaredRunesOn(item, items)) {
      const spec = entry.declares?.onHealed;
      if (!spec || typeof spec !== "object") continue;
      const frequency = String(spec.frequency ?? "daily");
      if (!runeFrequencyAllows(runeMarkersOf(item), entry.key, frequency, now)) continue;
      const steps = (Array.isArray(spec.steps) ? spec.steps : []).filter((s) => Number(s?.minPP ?? 0) <= Number(ppRequired));
      const offered = [...new Set(steps.flatMap((s) => Array.isArray(s.conditions) ? s.conditions : []))].filter((c) => RELIEVABLE[c]);
      const held = offered.filter((c) => Number(target.conditions?.rawValues?.get?.(c) ?? target.getConditionValue?.(c) ?? 0) > 0);
      if (!held.length) continue;
      const { promptSlotChoice } = await import("./slot-choice-workflow.mjs");
      // ASKED EVEN WHEN ONLY ONE CONDITION QUALIFIES (3.626.1; found live on
      // 0.8.0: the rune's one daily use went on a Fatigued 2 nobody was
      // asked about). A daily reaction is the wearer's to spend.
      let picked;
      if (held.length === 1) {
        const { DialogV2 } = foundry.applications.api;
        const yes = await DialogV2.confirm({
          window: { title: `${entry.label} — ${target.name}` },
          content: `<p>${spellName || "The healing"} landed. Invoke <strong>${entry.label}</strong> to reduce ${target.name}'s <strong>${RELIEVABLE[held[0]].label}</strong> by 1?${frequency === "daily" ? " Once a day." : ""}</p>`,
          rejectClose: false
        });
        picked = yes ? held : null;
      } else {
        picked = await promptSlotChoice(`${entry.label} — ${target.name}`, held, 1, { question: `${spellName || "The healing"} landed — reduce which condition by 1?`, noun: "these conditions", confirm: "Reduce" });
      }
      const condition = picked?.[0];
      if (!condition) continue;
      const had = Number(target.conditions?.rawValues?.get?.(condition) ?? target.getConditionValue?.(condition) ?? 0);
      const left = Math.max(0, had - 1);
      if (left > 0) await target.toggleStatusEffect?.(condition, { value: left });
      else await target.toggleStatusEffect?.(condition, { active: false });
      const updates = runeUseUpdates(runeMarkersOf(item), entry.key, frequency, now);
      for (const [flag, value] of Object.entries(updates)) await item.setFlag(SYSTEM_ID, flag, value);
      lines.push(`${entry.label}: ${target.name}'s ${RELIEVABLE[condition].label} ${had} → ${left}${frequency === "daily" ? " (used today)" : ""}.`);
    }
  }
  return lines;
}
