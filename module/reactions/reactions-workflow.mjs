/**
 * THE REACTIONS, ASKED (3.681.0; Eldritch Arts Block 3b). The five moments a
 * module's reaction is asked at, each a short loop over its registry. Every
 * offer is the module's to make or not, and each answers a plain object; a
 * failing offer is logged and passed over, so one module cannot stop another
 * being asked. See module-api.mjs for each registry's contract and
 * reactions.mjs for the readings.
 */
import {
  registeredCheckReactions, registeredDamageReactions,
  registeredCastReactions, registeredCriticalReactions, registeredCriticalAfterReactions
} from "../module-api.mjs";
import { degreeVerdict, reactionCheckType, biasWithDisadvantage, withoutConvictionDie, diceExploded } from "./reactions.mjs";
import { grantDefence, clearInstanceGrants, askOnceThisCast, currentCastScope } from "../combat/granted-defences.mjs";

const said = (out) => (typeof out?.line === "string" && out.line.trim() ? out.line.trim() : "");

async function tokenOf(actor) {
  try {
    const { activeToken } = await import("../combat/geometry.mjs");
    return activeToken(actor) ?? null;
  } catch {
    return null;
  }
}

/**
 * A BEFORE ANSWER'S MODIFIERS (3.683.0; Eldritch Arts Block 5, seam C2):
 * `{ modifiers: [{label, value, type}] }`, each kept only when its value is a
 * finite, non-zero whole number. Voidbound Resolve's and Glyph Unleashed's
 * "+2 racial bonus to the saving throw". The type is the bonus type ("racial",
 * stacking as every racial bonus does), "untyped" when none is given; the
 * label is the answer's own, or the reaction's key. Pure.
 *
 * @param {object|null} out a before(ctx) answer
 * @param {string} fallbackLabel the reaction's key
 * @returns {Array<{label: string, value: number, type: string}>}
 */
export function reactionModifiersOf(out, fallbackLabel = "") {
  const rows = Array.isArray(out?.modifiers) ? out.modifiers : [];
  const fallback = String(out?.label ?? "").trim() || String(fallbackLabel ?? "").trim() || "A reaction";
  const kept = [];
  for (const row of rows) {
    const value = Math.trunc(Number(row?.value));
    if (!Number.isFinite(value) || value === 0) continue;
    kept.push({
      label: String(row?.label ?? "").trim() || fallback,
      value,
      type: String(row?.type ?? "").trim().toLowerCase() || "untyped"
    });
  }
  return kept;
}

/**
 * A BEFORE ANSWER THAT DECLARES THE RESULT (3.683.0; seam C2): `{ declare:
 * "success" }`. Anchor in Nothing: "choose to get a success result on the
 * save before the dice are rolled". Only "success" is a declaration; any
 * other value is no answer. Pure.
 *
 * @param {object|null} out
 * @returns {""|"success"}
 */
export function reactionDeclaredDegree(out) {
  return String(out?.declare ?? "").trim().toLowerCase() === "success" ? "success" : "";
}

/**
 * BEFORE THE DICE (Prophetic Warning). Asked of an attack check, a save or a
 * skill check; an answer of advantage is combined with the roll's bias, as
 * every other source of advantage is.
 *
 * TWO MORE ANSWERS (3.683.0; Eldritch Arts Block 5, seam C2):
 *   modifiers  pushed onto the check before the dice, and carried on a
 *              reroll of the same check as the advantage is
 *              (`reactionModifiers`);
 *   declare    "success": the check's declared degree, so TRGCheck.roll's
 *              declared-degree path makes it exactly a Success that reads
 *              "Declared — the dice do not count", and the result is locked
 *              (no Conviction, no reroll, no conversion, no after-reaction).
 *              Once one answer declares, no further reaction is asked.
 * @param {TRGCheck} check
 * @param {object} BIAS the check's bias constants
 * @returns {Promise<string[]>} the lines to show
 */
export async function checkReactionsBefore(check, BIAS) {
  const type = reactionCheckType(check);
  if (!type || !check?.actor || check.flat || check.presetDice) return [];
  // A REROLL OF A CHECK ALREADY ASKED keeps what the asking gave: the same
  // advantage, not a second question (found in review).
  if (check.checkReactionsBeforeAsked) {
    const carried = Array.from(check.reactionAdvantages ?? []).map(String).filter(Boolean);
    if (carried.length) {
      const { resolveBias } = await import("../conditionals.mjs");
      check.bias = resolveBias(check.bias, ["advantage"], BIAS);
      for (const label of carried) check.modifiers.push({ label: `${label}: advantage`, value: 0, type: "untyped" });
    }
    // …AND THE SAME BONUSES (3.683.0, C2): the +2 was declared once.
    for (const row of reactionModifiersOf({ modifiers: check.reactionModifiers ?? [] })) check.modifiers.push(row);
    return [];
  }
  const specs = registeredCheckReactions().filter((s) => s.before);
  if (!specs.length) return [];
  check.checkReactionsBeforeAsked = true;
  if (!Array.isArray(check.reactionAdvantages)) check.reactionAdvantages = [];
  if (!Array.isArray(check.reactionModifiers)) check.reactionModifiers = [];
  const ctx = {
    check, actor: check.actor, type, subject: check.subject ?? "", label: check.label ?? "",
    dc: Number.isFinite(Number(check.dc)) && check.dc !== null ? Number(check.dc) : null,
    traits: check.traits ?? "", token: await tokenOf(check.actor),
    // WHAT FORCED IT (3.683.0, C2), off the check as its caller set it:
    // Voidbound Resolve's "targeted by a spell" (not an area), Glyph
    // Unleashed's "that spell from that caster", Veilstride's melee attack.
    isArea: Boolean(check.isArea), saveSource: String(check.saveSource ?? ""),
    sourceUuid: String(check.sourceUuid ?? ""), attackMode: String(check.attackMode ?? ""),
    // THE WEAPON SWUNG, AND HOW (3.684.0; Eldritch Arts Block 6, G25): Arcane
    // Fencer's "a melee Strike with a one-handed weapon". A weapon attack's
    // only; blank and false otherwise.
    weaponUuid: String(check.weaponUuid ?? ""), twoHanded: check.twoHanded === true
  };
  const lines = [];
  for (const spec of specs) {
    try {
      const out = await spec.before(ctx);
      if (out?.advantage) {
        const { resolveBias } = await import("../conditionals.mjs");
        check.bias = resolveBias(check.bias, ["advantage"], BIAS);
        const label = String(out.label ?? "").trim() || spec.key;
        check.modifiers.push({ label: `${label}: advantage`, value: 0, type: "untyped" });
        check.reactionAdvantages.push(label);
      }
      for (const row of reactionModifiersOf(out, spec.key)) {
        check.modifiers.push(row);
        check.reactionModifiers.push(row);
      }
      if (said(out)) lines.push(said(out));
      const declared = reactionDeclaredDegree(out);
      if (declared) {
        check.declaredDegree = declared;
        lockCheck(check, String(out.label ?? "").trim() || spec.key);
        break;
      }
    } catch (error) {
      console.error(`TRG Prime | check reaction "${spec.key}" (before)`, error);
    }
  }
  return lines;
}

/**
 * THE SECOND ROLL (Q27): fresh dice under the first roll's modifiers less its
 * Conviction die, and the result locked. Nothing after it may modify or
 * reroll it: no Conviction, no Lucky Break, no fumble reroll, no card button.
 * @param {TRGCheck} check
 * @param {string} by what rerolled it
 */
async function rerollForReaction(check, by = "") {
  check.modifiers = withoutConvictionDie(check.modifiers);
  await check.reroll();
  lockCheck(check, by);
  return check;
}

/** A result that "cannot be modified further or rerolled using any other effect". */
function lockCheck(check, by = "") {
  check.locked = by || "a reaction";
  check.luckUsed = true;
  check.chanceUsed = check.chanceUsed || check.locked;
  check.convictionDecided = true;
  check.saveReactionResolved = true;
  check.fumbleRerolled = true;
}

/**
 * ONCE THE RESULT IS FINAL (Missed Chance, Second Chance). For a save or a
 * skill check, from TRGCheck.roll; for an attack, from the attack workflow,
 * which alone knows the hit (`verdict`). The first answer that rerolls ends
 * the asking: one reroll a check, and the second result stands.
 *
 * @param {TRGCheck} check
 * @param {{type?: string, succeeded?: boolean, failed?: boolean, target?: Actor|null,
 *   reroll?: (check) => Promise<TRGCheck>}} [verdict] an attack's; a save's or
 *   a skill's is read off its degree. `reroll` replaces the in-place reroll
 *   (a spell attack's dice are swapped, not rolled in place).
 * @returns {Promise<{check: TRGCheck, rerolled: boolean, lines: string[]}>}
 */
export async function checkReactionsAfter(check, verdict = null) {
  const specs = registeredCheckReactions().filter((s) => s.after);
  const type = verdict?.type ?? reactionCheckType(check);
  const lines = [];
  if (!type || !check?.actor || check.flat || check.presetDice || check.locked || !specs.length) return { check, rerolled: false, lines };
  const degree = check.outcome?.degree?.key ?? "";
  const fromDegree = degreeVerdict(degree);
  const succeeded = verdict ? Boolean(verdict.succeeded) : fromDegree.succeeded;
  const failed = verdict ? Boolean(verdict.failed) : fromDegree.failed;
  if (!succeeded && !failed) return { check, rerolled: false, lines };
  const ctx = {
    check, actor: check.actor, type, subject: check.subject ?? "", label: check.label ?? "",
    degree, succeeded, failed, exploded: diceExploded(check.dice), total: Number(check.outcome?.total ?? 0),
    dc: check.dc ?? null, traits: check.traits ?? "", target: verdict?.target ?? null,
    token: await tokenOf(check.actor)
  };
  for (const spec of specs) {
    let out = null;
    try {
      out = await spec.after(ctx);
    } catch (error) {
      console.error(`TRG Prime | check reaction "${spec.key}" (after)`, error);
      continue;
    }
    if (said(out)) lines.push(said(out));
    // A HIT MADE A MISS (3.685.0, H6): an attack that hit, answered `miss`,
    // misses. The first such answer ends the asking; nothing is rerolled.
    if (out?.miss === true && type === "attack" && succeeded) {
      return { check, rerolled: false, missed: true, missedBy: String(out.label ?? "").trim() || spec.key, lines };
    }
    if (!out?.reroll) continue;
    const first = check.outcome;
    let next = check;
    if (typeof verdict?.reroll === "function") {
      // The caller's own reroll drops the first roll's Conviction die itself:
      // a spell attack's total is not rebuilt from its modifiers.
      next = await verdict.reroll(check);
      lockCheck(next, spec.key);
    } else {
      await rerollForReaction(check, spec.key);
    }
    next.extraDetailLines = [...(next.extraDetailLines ?? []),
      `${String(out.label ?? "").trim() || spec.key}: rerolled (${first?.total ?? "?"} → ${next.outcome?.total ?? "?"}); the second result stands and cannot be modified or rerolled.`];
    return { check: next, rerolled: true, lines };
  }
  return { check, rerolled: false, lines };
}

/**
 * BEFORE DAMAGE MEETS THE DEFENCES (Phase Familiar, Resist Magic). Asked of
 * the creature about to be damaged; an answer is held as a granted defence
 * (combat/granted-defences.mjs) that `actorDefences` reads. A creature is
 * asked once a cast (`askOnceThisCast`): its other packets from that cast
 * keep whatever it answered.
 *
 * @param {Actor} target
 * @param {{kind?: string, types?: string[], magical?: boolean, spellName?: string,
 *   sourceName?: string, sourceUuid?: string, source?: Actor|null}} event
 * @returns {Promise<string[]>} the lines to show
 */
export async function damageReactionsBefore(target, event = {}) {
  const specs = registeredDamageReactions();
  if (!target || !specs.length) return [];
  // THE SCOPE THIS QUESTION BELONGS TO, read before it waits on anyone.
  const scopeKey = currentCastScope();
  if (askOnceThisCast(target, scopeKey)) return [];
  clearInstanceGrants(target);
  const ctx = {
    target, kind: String(event.kind ?? "other"),
    types: Array.from(event.types ?? []).map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean),
    magical: Boolean(event.magical), spellName: String(event.spellName ?? ""),
    sourceName: String(event.sourceName ?? ""), sourceUuid: String(event.sourceUuid ?? ""),
    source: event.source ?? null
  };
  const lines = [];
  for (const offer of specs) {
    try {
      const out = await offer(ctx);
      if (!out) continue;
      const granted = grantDefence(target, {
        resist: out.resist ?? null, immune: out.immune ?? null, weak: out.weak ?? null,
        scope: out.scope === "cast" ? "cast" : "instance", label: said(out), castKey: scopeKey
      });
      if (granted && said(out)) lines.push(said(out));
    } catch (error) {
      console.error("TRG Prime | a damage reaction failed", error);
    }
  }
  return lines;
}

/**
 * A SPELL'S DAMAGE, ASKED (3.681.0; found in review): the one line each
 * spell-damage site adds before its packet meets the defences — a storm, a
 * flat ladder, a spiritual weapon, a directed strike, a recurring ladder, the
 * nexus, an emanation, an area's save, a hazard, thorns, a sanctuary's bite.
 * Inside a cast its answer is that cast's; on a later turn, that blow's.
 * @returns {Promise<string[]>} the lines to show
 */
export async function spellDamageReactionsFor(target, type, { spellName = "", source = null } = {}) {
  return damageReactionsBefore(target, {
    kind: "spell", types: [String(type ?? "").trim().toLowerCase()].filter(Boolean), magical: true,
    spellName: String(spellName ?? ""), sourceName: source?.name ?? "", sourceUuid: source?.uuid ?? "", source
  });
}

/**
 * AFTER A CAST'S CHECK, BEFORE IT LANDS (Disrupting Magic). The first answer
 * that stops it ends the asking.
 *
 * AND ONE THAT SHAPES IT (3.684.0; Eldritch Arts Block 6, G17): Counter
 * Channel's `scale` (0.5 or 2) and `saveBias`, Reflective Warding's
 * `retargetCaster`. Folded by magic/cast-reaction-shape.mjs
 * `castReactionShape` (the first of each holds) and applied by the cast.
 * @returns {Promise<{stop: boolean, lines: string[], scale: number, saveBias: string, retargetCaster: boolean}>}
 */
export async function castReactionsFor(ctx) {
  const specs = registeredCastReactions();
  const lines = [];
  const none = { scale: 1, saveBias: "", retargetCaster: false, exclude: [], turnBack: null };
  if (!specs.length || !ctx?.actor) return { stop: false, lines, ...none };
  const full = { ...ctx, token: ctx.token ?? await tokenOf(ctx.actor) };
  const answers = [];
  for (const offer of specs) {
    try {
      const out = await offer(full);
      if (said(out)) lines.push(said(out));
      // A stop holds alone: nothing lands, so nothing is shaped.
      if (out?.stop) return { stop: true, lines };
      if (out && typeof out === "object") answers.push(out);
    } catch (error) {
      console.error("TRG Prime | a cast reaction failed", error);
    }
  }
  const { castReactionShape } = await import("../magic/cast-reaction-shape.mjs");
  const shape = castReactionShape(answers);
  return { stop: false, lines, scale: shape.scale, saveBias: shape.saveBias, retargetCaster: shape.retargetCaster, exclude: shape.exclude, turnBack: shape.turnBack };
}

/**
 * AFTER A CRITICAL'S ROLL IS READ (3.685.0, H7; Arcane Bastion). The first
 * answer that lowers the severity holds.
 * @returns {Promise<{steps: number, lines: string[]}>}
 */
export async function criticalAfterReactionsFor(ctx) {
  const specs = registeredCriticalAfterReactions();
  const lines = [];
  if (!specs.length || !ctx?.target) return { steps: 0, lines };
  const { severityStepsFrom } = await import("../combat/critical-severity.mjs");
  for (const offer of specs) {
    try {
      const out = await offer({ ...ctx });
      if (said(out)) lines.push(said(out));
      const steps = severityStepsFrom([out]);
      if (steps < 0) return { steps, lines };
    } catch (error) {
      console.error("TRG Prime | a critical reaction (after) failed", error);
    }
  }
  return { steps: 0, lines };
}

/**
 * BEFORE A CRITICAL'S ROLL, FROM THE CREATURE STRUCK (Eternity Resilience).
 * @returns {Promise<{bias: string, lines: string[]}>}
 */
export async function criticalReactionsFor(ctx) {
  const specs = registeredCriticalReactions();
  let bias = String(ctx?.bias ?? "normal");
  const lines = [];
  if (!specs.length || !ctx?.target) return { bias, lines };
  for (const offer of specs) {
    try {
      const out = await offer({ ...ctx, bias });
      if (out?.disadvantage) bias = biasWithDisadvantage(bias);
      if (said(out)) lines.push(said(out));
    } catch (error) {
      console.error("TRG Prime | a critical reaction failed", error);
    }
  }
  return { bias, lines };
}
