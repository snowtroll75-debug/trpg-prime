/**
 * The save a creature owes for beginning its turn in a sustained area.
 *
 * NEW at 3.609.0 (block 33's R3, Turn Undead). The rule is in
 * magic/turn-save.mjs; this file is the half that reads the board and rolls.
 * Called from the combat tracker at the start of a turn, beside Luminance's
 * own question, because "begins its turn in the area" is the same clock.
 */

import { runningEmanations } from "./emanation-workflow.mjs";
import { emanationMembers } from "./emanation.mjs";
import { tokenCentreFeet } from "../creature-aura-workflow.mjs";
import { steppedSeverity, turnSaveLine, turnSaveOutcome, turnSaveReaches } from "./turn-save.mjs";

/**
 * Roll every turn save this creature owes now.
 * @returns {Promise<string[]>} card lines
 */
export async function applyTurnSaves(actor, token) {
  const lines = [];
  if (!actor || !token) return lines;

  for (const record of runningEmanations()) {
    const spec = record.emanation?.turnSave ?? null;
    if (!spec) continue;
    // THE CASTER IS NEVER TURNED BY THEIR OWN SPELL.
    if (record.token?.id === token.id) continue;
    const dc = Number(record.emanation.saveDC);
    if (!(dc > 0)) continue;

    const inside = emanationMembers({
      centreFeet: tokenCentreFeet(record.token.document),
      radiusFeet: record.emanation.radiusFeet,
      subjects: [{ id: token.id, centreFeet: tokenCentreFeet(token.document), disposition: token.document.disposition }],
      casterDisposition: record.token.document.disposition,
      mode: record.emanation.mode
    });
    if (!inside.length) continue;

    // THE KIND THE SPELL IS KEYED AT, asked of the same rule its cast used.
    if (spec.kindGate) {
      const { kindGateResult } = await import("../kind-targeting.mjs");
      if (!kindGateResult(record.actor?.system, actor.system, spec.kindGate, actor.name).allowed) continue;
    }
    const level = Number(actor.system?.identity?.level ?? 0) || 0;
    if (!turnSaveReaches(spec, level)) {
      lines.push(`<em>${record.emanation.name}: ${actor.name} (level ${level}) is above the level it reaches `
        + `(${spec.maxLevel}).</em>`);
      continue;
    }

    const { TRGCheck } = await import("../dice/check.mjs");
    const saveName = spec.save.charAt(0).toUpperCase() + spec.save.slice(1);
    const saveData = actor.system?.combat?.saves?.[spec.save];
    const check = await TRGCheck.roll({
      actor,
      label: `${actor.name} — ${saveName} Save`,
      subtitle: `vs ${record.emanation.name} — DC ${dc}`,
      type: "save",
      saveSource: record.emanation.name,
      sourceUuid: record.actor?.uuid ?? "",
      subject: spec.save,
      dc,
      modifiers: saveData?.checkModifiers ?? [
        { label: `${saveName} save`, value: Number(saveData?.total ?? 0), type: "untyped" }
      ]
    });
    const degree = check?.outcome?.degree?.key ?? "partial";
    const outcome = turnSaveOutcome(spec, degree);
    lines.push(turnSaveLine(record.emanation.name, actor.name, check?.outcome?.degree?.label ?? degree,
      check?.outcome?.total ?? 0, dc, outcome));
    if (spec.remark) lines.push(`<em>${spec.remark}</em>`);

    if (outcome.rows.length) {
      const { applySpellEffects } = await import("./spell-effects.mjs");
      const cardLines = [];
      await applySpellEffects(record.actor, {
        name: record.emanation.name, img: record.emanation.img, uuid: "",
        system: { duration: "", effects: [] }
      }, {
        targets: [actor],
        saveResults: [{ target: actor, degree, margin: check?.outcome?.margin ?? null, saved: Boolean(check?.outcome?.degree?.success) }],
        saveDC: dc,
        lines: cardLines,
        effects: outcome.rows.map((row) => ({ ...row, target: "targets" }))
      });
      // The engine writes HTML paragraphs; the tracker wraps its own, so the
      // tags are stripped back to the sentence.
      for (const l of cardLines) lines.push(String(l).replace(/^<p[^>]*>|<\/p>$/g, ""));
    }
    if (outcome.critical) {
      const severity = steppedSeverity(outcome.critical.severity, {
        casterLevel: spec.casterLevel, level, stepLevels: spec.stepLevels
      });
      lines.push(`${actor.name} takes a <strong>${severity} ${outcome.critical.damageType} critical</strong>`
        + `${severity !== outcome.critical.severity ? ` (raised from ${outcome.critical.severity}: level ${level} against caster level ${spec.casterLevel})` : ""}.`);
      const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
      await rollCriticalInjury(record.actor, {
        targetActor: actor,
        damageType: outcome.critical.damageType,
        severity,
        attackBonus: dc
      });
    }
  }
  return lines;
}
