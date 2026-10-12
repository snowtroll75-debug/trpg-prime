/**
 * A DECLARED EFFECT (3.630.0): one row that puts a timed effect on its
 * target carrying flags another subsystem reads. Pure; no Foundry.
 *
 * The rails already existed, each read off "any applied effect":
 *
 *   deathGuard       combat/death-guard.mjs        — Second Heart, Phoenix Root, Prism Lotus
 *   saveConvert      magic/save-convert.mjs        — Communal Litany's one-degree improvement
 *   strikeRider      magic/strike-riders.mjs       — Emberthistle on a fire Strike
 *   nextSpellDamage  magic/next-spell-damage.mjs   — Blackfire Ivy, Emberthistle on a fire spell
 *   fateDeclare      dice/fate-declare.mjs         — Prism Lotus (Fate)
 *
 * What they had no way to do was arrive FROM a spell or a herb: each was
 * written by a feat's transferred effect, so Second Heart was a note. This
 * row is the door. It writes only the flags above, under these names,
 * and only one change — a bonus to Death State (Worldroot Fragment) —
 * because a row that could write any path would be an editor, not a rule.
 *
 *   { kind: "declare", target: "targets", label: "Second Heart",
 *     flags: { deathGuard: { label: "Second Heart", auto: true, once: true, notOutright: true } },
 *     deathState: 1,          // optional: +N Death State while it lasts
 *     noStack: true,          // optional: a second copy on the same creature is refused
 *     text: "…" }             // optional: the cast line's description
 */
import { normaliseStrikeRider } from "./strike-riders.mjs";

/** The flags a declared effect may carry. */
const DECLARABLE_FLAGS = Object.freeze([
  "deathGuard", "saveConvert", "strikeRider", "nextSpellDamage", "fateDeclare",
  // A plain "true": the reaction gate's own flag (combat/reactions.mjs) —
  // Writ of Restraint's Success, "cannot use Reactions until the end of its
  // next turn".
  "fumbleNoReactions"
]);

/** The flag that marks an effect as a declared one, keyed by its label. */
const DECLARED_KEY_FLAG = "declaredKey";
/** The flag that makes Death State's loss trim Dying rather than kill (Worldroot Fragment). */
const DEATH_STATE_CLAMP_FLAG = "deathStateClamp";

const text = (v) => String(v ?? "").trim();

/**
 * @param {object} row the spell row
 * @param {object} [ctx]
 * @param {string} [ctx.spellName]
 * @returns {null|{label: string, key: string, flags: object, deathState: number, noStack: boolean, text: string}}
 */
export function normaliseDeclaredEffect(row, { spellName = "" } = {}) {
  if (!row || typeof row !== "object") return null;
  const flags = {};
  const raw = row.flags && typeof row.flags === "object" ? row.flags : {};
  for (const key of DECLARABLE_FLAGS) {
    if (raw[key] === undefined || raw[key] === null) continue;
    if (key === "strikeRider") {
      const spec = normaliseStrikeRider(raw[key]);
      if (!spec) return null;
      flags[key] = spec;
    } else if (key === "fumbleNoReactions") {
      if (raw[key] !== true) return null;
      flags[key] = true;
    } else if (typeof raw[key] === "object") {
      flags[key] = raw[key];
    } else {
      return null;
    }
  }
  const deathState = Math.trunc(Number(row.deathState) || 0);
  if (!Object.keys(flags).length && !deathState) return null;
  const label = text(row.label) || text(spellName) || "Declared effect";
  // A SHORTER LIFE THAN THE SPELL'S (3.630.0): "until the end of its next
  // turn" is one round, whatever the spell's own duration.
  const rounds = Math.max(0, Math.trunc(Number(row.rounds) || 0));
  return {
    label,
    key: label.toLowerCase(),
    flags,
    deathState,
    noStack: row.noStack === true,
    text: text(row.text),
    ...(rounds ? { rounds } : {})
  };
}

/**
 * The ActiveEffect changes and system flags for a declared effect. The
 * caller adds timing and origin.
 */
export function declaredEffectData(spec, systemId = "trg-prime", changeAdd = "add") {
  const flags = { ...spec.flags, [DECLARED_KEY_FLAG]: spec.key };
  const changes = [];
  if (spec.deathState) {
    changes.push({ key: "system.combat.deathState", type: changeAdd, value: String(spec.deathState) });
    // "When the effect ends, reduce your Dying condition to your normal
    // Death State if it is currently higher" — the end trims, never kills.
    if (spec.deathState > 0) flags[DEATH_STATE_CLAMP_FLAG] = true;
  }
  return { name: spec.label, changes, flags: { [systemId]: flags } };
}

/** Is a copy of this declared effect already on the creature? */
export function declaredAlreadyOn(effects = [], spec, systemId = "trg-prime") {
  if (!spec?.noStack) return false;
  return Array.from(effects ?? []).some((e) => e?.flags?.[systemId]?.[DECLARED_KEY_FLAG] === spec.key);
}

/** What the cast card says the target now carries. */
export function declaredCastLine(spec) {
  if (!spec) return "";
  if (spec.text) return spec.text;
  const parts = [];
  if (spec.flags.deathGuard) {
    const g = spec.flags.deathGuard;
    parts.push(g.trigger === "death"
      ? `the first time it would die, Dying drops to 0 and it regains ${g.heal === "half" ? "half its maximum HP" : "1 HP"}`
      : "the first blow that would drop it to 0 HP leaves it on 1 HP instead");
  }
  if (spec.flags.saveConvert) parts.push(`it may improve a qualifying saving throw by one degree${Number(spec.flags.saveConvert.uses) > 1 ? ` (${spec.flags.saveConvert.uses} times)` : " (once)"}`);
  if (spec.flags.nextSpellDamage) {
    const n = spec.flags.nextSpellDamage;
    parts.push(`its next ${(n.damageTypes ?? []).join(" or ")} spell${n.extraDie ? " deals one more damage die" : n.dice ? ` deals +${n.dice}` : ""}${n.ignoreResistance ? ` and ignores ${(n.damageTypes ?? []).join(" or ")} resistance` : ""}`);
  }
  if (spec.flags.strikeRider) parts.push(`its next Strike dealing ${(spec.flags.strikeRider.whenDamageTypes ?? []).join(" or ") || spec.flags.strikeRider.damageType} damage adds +${spec.flags.strikeRider.dice}`);
  if (spec.flags.fateDeclare) parts.push("once, before a d20 roll, it may declare a Success without rolling");
  if (spec.flags.fumbleNoReactions) parts.push(`it cannot use Reactions${spec.rounds === 1 ? " until the end of its next turn" : ""}`);
  if (spec.deathState) parts.push(`Death State ${spec.deathState > 0 ? "+" : ""}${spec.deathState}`);
  return parts.join("; ");
}
