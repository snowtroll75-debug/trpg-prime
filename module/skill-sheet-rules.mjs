/**
 * Two skill rules ruled by Graham on 18 November 2026 (core 3.699.0; the
 * joint TRG Prime Codex / Fiends & Fables audit). Pure, so the harness can
 * drive them without a world.
 *
 * RD-03 SWIM AND CLIMB SPEED. "Having a Climb (or Swim) speed grants a +4
 * circumstance bonus to the matching skill check" (Chapter 8) applies only
 * when actually swimming or climbing: an automatic row on the Swim action of
 * Athletics and the Climb action of Climbing, not a +4 pooled into the whole
 * skill. The sheet totals then match the printed stat blocks.
 *
 * RD-04 KEEN SENSE. "A special +2 racial bonus to Perception skill checks"
 * applies to every Perception check, so it is pooled into the Perception
 * total the sheet shows. Acute Sense ("+2 to any specific action related to
 * that sense") stays a row on the check.
 */
import { speedValue } from "./combat/speed-pool.mjs";

/**
 * The Swim Speed and Climb Speed rows (3.699.0, RD-03): +4 circumstance,
 * automatic, on the Swim action of Athletics and the Climb action of
 * Climbing. Pure, so the harness can drive it.
 * @param {object} movement system.combat.movement
 * @returns {object[]} conditional rows
 */
export function movementSkillConditionals(movement = {}) {
  const rows = [];
  if (speedValue(movement.swim) > 0) rows.push({
    kind: "modifier", value: 4, type: "circumstance", label: "Swim Speed", auto: true,
    scope: "Athletics checks to Swim",
    when: { checkTypes: ["skill"], subjects: ["athletics"], actions: ["swim"] }
  });
  if (speedValue(movement.climb) > 0) rows.push({
    kind: "modifier", value: 4, type: "circumstance", label: "Climb Speed", auto: true,
    scope: "Climbing checks to Climb",
    when: { checkTypes: ["skill"], subjects: ["climbing"], actions: ["climb"] }
  });
  return rows;
}

/** Whether an actor holds Keen Sense (3.699.0, RD-04), by base name. */
export function hasKeenSense(actor) {
  return Array.from(actor?.items ?? []).some((item) => item?.type === "ability" && isKeenSenseName(item.name));
}

/** "Keen Sense", "Keen Sense (Perception)" — not "Keen Sight", not Acute Sense. */
export function isKeenSenseName(name) {
  return String(name ?? "").trim().toLowerCase().replace(/\s*\(.*?\)\s*$/, "") === "keen sense";
}

