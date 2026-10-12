/**
 * block32d-plan — what 3.608.1 writes to the spells pack, as data.
 *
 * GRAHAM'S RULINGS OF 30 SEPTEMBER 2026 on the two questions the 3.606.0
 * live test raised:
 *
 *   "A refused Resurrection should still cost the PP" — which is what the
 *   system already does (the PP are spent before the applier refuses), so
 *   nothing here; see magic/resurrection.mjs.
 *
 *   "On Speak with Dead, heroic should also haunt the caster." A gated row
 *   treats a better-than-printed save as escaping it; the corpse's Heroic
 *   now reads at the Critical rung — the haunting and the Critical's words.
 *   Ruled for Speak With Dead; other gated Criticals are unchanged.
 *
 * SUPERSEDES the Speak With Dead `effects` of tools/block32-plan.mjs, which
 * stays as the record of what 3.606.0 wrote.
 */

const note = (text, onSave) => (onSave ? { kind: "note", onSave, text } : { kind: "note", text });

export const PLAN = {
  "Speak With Dead": {
    effects: [
      { kind: "marker", target: "self", marker: "haunted", onSave: ["heroic", "critical"],
        duration: "1 day", note: "(the corpse's spirit)" },
      note("May deceive you or withhold its answers.", ["heroic", "critical"]),
      note("May ignore your questions or answer them falsely.", ["success"]),
      note("Answers truthfully, but cryptically.", ["failure"]),
      note("Answers truthfully and directly.", ["fumble"]),
      note("A WILLING CORPSE DOES NOT SAVE. The save is rolled for every cast; when the corpse "
        + "is willing, ignore it and play the Fumble rung. Up to three questions; fails if the "
        + "spell was cast on this corpse in the last month.")
    ]
  }
};

/** The fields each spell's plan writes — what the pack-repair manifest must cover. */
export function plannedFields() {
  const out = {};
  for (const [name, fields] of Object.entries(PLAN)) out[name] = Object.keys(fields);
  return out;
}
