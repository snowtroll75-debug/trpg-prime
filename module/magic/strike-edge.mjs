/**
 * AN ATTACK THAT SEES THROUGH WHAT WOULD HINDER IT.
 *
 * NEW at 3.609.0, for block 33's R7. Pure; no Foundry.
 *
 *   TRUE STRIKE (PP 2)  "You gain advantage on the next Strike you make with
 *                        the weapon you were wielding … before the end of
 *                        your turn. The attack also ignores circumstance
 *                        penalties to the attack roll and the concealed or
 *                        hidden conditions."
 *   TRUE TARGET (PP 14) "The first time each target makes an attack roll
 *                        against that creature during the spell's duration,
 *                        the attacker gains advantage. The attacker also
 *                        ignores circumstance penalties to the attack roll
 *                        and any penalties due to the creature being
 *                        concealed or hidden."
 *
 * THE ADVANTAGE IS A ONE-SHOT CONDITIONAL — the channel Clarity uses — so
 * it is offered on the roll, pre-ticked, and spent there; for True Target
 * it is scoped to the one creature by `targetUuids`. What the conditional
 * engine cannot say is the other half: a penalty that never reaches the
 * roll, and a miss-chance check that is never made. Those ride the SAME
 * effect as a flag, so spending the advantage spends them too — one
 * document, one lifetime, the lesson Grapple's critical taught.
 *
 * ONLY CIRCUMSTANCE PENALTIES, and only the ones the attack workflow lays
 * down itself (Unsteady, subdual shots, Aid against the wrong creature);
 * a status penalty, or a bonus of any kind, is untouched.
 */
import { COVER_TYPES } from "../combat/ranged.mjs";

/** The flag an effect carries the edge on. */
export const STRIKE_EDGE_FLAG = "strikeEdge";

/**
 * The edge this attacker holds against this target, from its effects, or
 * null. An edge naming a target applies to that target alone; one naming
 * none applies to any.
 *
 * @param {Array<object>} effects documents or plain objects
 * @param {string} targetUuid
 * @param {string} systemId
 */
export function strikeEdgeFrom(effects, targetUuid = "", systemId = "trg-prime") {
  let best = null;
  for (const e of Array.isArray(effects) ? effects : []) {
    if (!e || e.disabled) continue;
    const edge = e.flags?.[systemId]?.[STRIKE_EDGE_FLAG];
    if (!edge || typeof edge !== "object") continue;
    const against = String(edge.targetUuid ?? "").trim();
    if (against && against !== String(targetUuid ?? "")) continue;
    best = {
      ignoreCircumstance: Boolean(edge.ignoreCircumstance || best?.ignoreCircumstance),
      ignoreConcealment: Boolean(edge.ignoreConcealment || best?.ignoreConcealment),
      // COVER STEPPED DOWN (3.682.0; Eldritch Arts' Shooting Star: "reduces
      // the target's cover by one degree (greater → standard, standard →
      // lesser, lesser → none)"). Degrees; the largest edge wins.
      reduceCover: Math.max(Math.trunc(Number(edge.reduceCover) || 0), best?.reduceCover ?? 0),
      label: String(edge.label ?? best?.label ?? "")
    };
  }
  return best;
}

/** Page 198's cover degrees, least first, with the circumstance DB each is worth. */
export const COVER_DEGREES = Object.freeze(["", "lesser", "standard", "greater"].map((k) => [k, COVER_TYPES[k || "none"].bonus]));

/**
 * COVER, ONE DEGREE DOWN (3.682.0). The circumstance DB a cover degree is
 * worth (page 198's table, `COVER_TYPES`): greater 8, standard 4, lesser 2, none 0.
 * Stepping `steps` degrees down from `level` gives back the DB it no longer
 * gives. Pure.
 *
 * @param {string} level "greater" | "standard" | "lesser" | ""
 * @param {number} steps degrees to step down
 * @returns {{from: string, to: string, lost: number}}
 */
export function coverSteppedDown(level, steps = 1) {
  const at = COVER_DEGREES.findIndex(([name]) => name === String(level ?? ""));
  const n = Math.max(0, Math.trunc(Number(steps) || 0));
  if (at <= 0 || n <= 0) return { from: at > 0 ? COVER_DEGREES[at][0] : "", to: at > 0 ? COVER_DEGREES[at][0] : "", lost: 0 };
  const to = Math.max(0, at - n);
  return { from: COVER_DEGREES[at][0], to: COVER_DEGREES[to][0], lost: COVER_DEGREES[at][1] - COVER_DEGREES[to][1] };
}

/**
 * THE COVER'S OWN ENTRY in the DB breakdown (3.684.4, live test). Take Cover
 * lays its +2/+4/+8 as an effect, and the breakdown lists it as its own
 * circumstance entry whose `source` is that effect's UUID; the sheet's own
 * circumstance slot (`source: "sheet"`) holds only what was typed on the
 * sheet. Up to 3.684.3 only the "sheet" slot was read, so a taken cover was
 * never found and Shooting Star never stepped it. `coverSource` is the Take
 * Cover effect (its uuid and id) or a uuid string; the entry is matched by
 * that uuid, by an id ending, or by the effect's name; failing those, the
 * "sheet" slot. Pure.
 *
 * @param {Array<object>} entries
 * @param {object|string|null} coverSource
 * @returns {object|null}
 */
export function coverEntryIn(entries, coverSource = null) {
  const circ = (Array.isArray(entries) ? entries : []).filter((e) => e?.type === "circumstance" && Number(e.value) > 0);
  const uuid = typeof coverSource === "string" ? coverSource : String(coverSource?.uuid ?? "");
  const id = typeof coverSource === "string" ? "" : String(coverSource?.id ?? "");
  const name = typeof coverSource === "string" ? "" : String(coverSource?.name ?? "");
  const bySource = circ.find((e) => {
    const src = String(e.source ?? "");
    return (uuid && src === uuid) || (id && src.endsWith(`.ActiveEffect.${id}`));
  });
  if (bySource) return bySource;
  if (name) {
    const byName = circ.find((e) => String(e.label ?? "") === name && e.source !== "sheet");
    if (byName) return byName;
  }
  return circ.find((e) => e.source === "sheet") ?? null;
}

/**
 * WHAT THE STEP TAKES FROM THE DB ITSELF (3.682.0, review). Take Cover's DB is
 * a circumstance bonus, and circumstance bonuses do not stack (the highest
 * applies). So a step that takes 2 from a standard cover of +4 beside another
 * +3 circumstance bonus takes only 1, and nothing when no entry holds the
 * cover. `entries` is the defence breakdown's; the cover's entry is found by
 * `coverEntryIn` (3.684.4). Pure.
 *
 * @param {Array<{type: string, value: number, source: string}>} entries
 * @param {number} lost the degree step's loss, from coverSteppedDown
 * @param {object|string|null} [coverSource] the Take Cover effect, or its uuid
 * @returns {number}
 */
export function coverLossInDefence(entries, lost, coverSource = null) {
  const take = Math.max(0, Math.trunc(Number(lost) || 0));
  const circ = (Array.isArray(entries) ? entries : []).filter((e) => e?.type === "circumstance" && Number(e.value) > 0);
  const slot = coverEntryIn(entries, coverSource);
  if (!slot || !take) return 0;
  const others = circ.filter((e) => e !== slot).map((e) => Number(e.value));
  const before = Math.max(Number(slot.value), ...others);
  const after = Math.max(0, Number(slot.value) - take, ...others);
  return Math.max(0, before - after);
}

/**
 * The DB entries with a taken cover stepped down (3.684.3, review): the
 * cover's entry (the one `coverLossInDefence` reads, 3.684.4) less the step,
 * so the Strike's own circumstance rows stack against the stepped cover, not
 * the full one. Entries are copied; the rest are untouched.
 */
export function steppedCoverEntries(entries, lost, coverSource = null) {
  const list = Array.isArray(entries) ? entries : [];
  const take = Math.max(0, Math.trunc(Number(lost) || 0));
  const slot = coverEntryIn(list, coverSource);
  if (!slot || !take) return list;
  return list.map((e) => (e === slot ? { ...e, value: Math.max(0, Number(e.value) - take) } : e));
}

/**
 * WHICH COVER IS STEPPED (3.684.5). A target can have its own Take Cover and
 * also the Standard cover (+4) an attacker firing into melee gives it. Graham,
 * 5 November 2026, asked "Should it step whichever cover is higher instead?":
 * "Yes." So the higher of the two is stepped, one degree, once. When they are
 * equal either gives the same DB; the firing-into-melee cover is the one
 * stepped then, so the step shows on the card's own cover line. `taken` is the
 * Take Cover's degree value when the DB holds it (0 when it does not, as on a
 * Paralyzed or Unconscious target); `intoMelee` is the firing-into-melee
 * cover's value. Pure.
 *
 * @param {{taken?: number, intoMelee?: number}} covers
 * @returns {{step: ""|"taken"|"intoMelee", both: boolean, tie: boolean}}
 */
export function coverToStep({ taken = 0, intoMelee = 0 } = {}) {
  const t = Math.max(0, Number(taken) || 0);
  const m = Math.max(0, Number(intoMelee) || 0);
  const both = t > 0 && m > 0;
  if (!t && !m) return { step: "", both, tie: false };
  if (t > m) return { step: "taken", both, tie: false };
  return { step: "intoMelee", both, tie: both && t === m };
}

/**
 * The modifier list with its circumstance PENALTIES taken out, and what
 * was taken. Bonuses stay; other types stay.
 */
export function withoutCircumstancePenalties(modifiers) {
  const kept = [];
  const removed = [];
  for (const m of Array.isArray(modifiers) ? modifiers : []) {
    if (String(m?.type ?? "").toLowerCase() === "circumstance" && Number(m?.value) < 0) removed.push(m);
    else kept.push(m);
  }
  return { kept, removed };
}
