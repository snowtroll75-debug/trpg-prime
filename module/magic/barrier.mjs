/**
 * A BARRIER A SPELL PUTS UP — a shield of stone between you and one foe.
 *
 * NEW at 3.707.0. Pure; no Foundry. The Foundry side is
 * magic/barrier-workflow.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * STONE SHIELD (Core, Chapter 10):
 *
 *   "The stone shield provides you with cover from that enemy until the
 *    beginning of your next turn, granting you a +4-circumstance bonus to
 *    DB. If the opponent's attack misses you by 4 or less, the attack
 *    strikes the shield instead. The stone shield has Hardness 8 and
 *    Hits 15. If the shield is destroyed, the spell ends and the shield
 *    crumbles away into nothingness. Spells and effects that damage an
 *    area deal damage to the shield."
 *
 * Since 3.406.0 the +4 was a ward scoped to the chosen enemy (ward.mjs),
 * and EVERYTHING ELSE was a note: a miss by 4 struck nothing, the shield
 * had no Hits to lose, and nothing ended the spell. This is the rest.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE BARRIER RIDES ON THE WARD'S OWN EFFECT, as Mage Armour's pool rides
 * on its spell's (spell-armour.mjs). The scope that decides who the +4
 * applies against is the same scope that decides whose miss the shield
 * catches, so it is read from ONE place — the ward's `sourceUuids` are
 * copied into the barrier when it is written, and the two cannot name
 * different foes.
 *
 * GRAHAM'S RULINGS, 21 November 2026:
 *   - the bonus is "+4 DB only, as printed" — not Reflex, not a cover the
 *     Take Cover action could raise. The ward already says exactly that.
 *   - area damage: "Area damage does not attack against your DB so why
 *     would it be needed. A damage the shield button for the GM would
 *     however be useful." So areas are not automated; the GM's button
 *     takes any damage, through Hardness, by hand.
 *   - "You cannot use this spell if you are not adjacent to a large area
 *     of earth or stone": asked at the cast, and a No refuses it before
 *     anything is spent. See `castQuestionsOf`.
 *   - it is a reaction, offered when the caster is attacked, as Nimble
 *     Dodge is (combat/defence-offer.mjs).
 */

/** The flag on the ward effect that carries the barrier. */
export const BARRIER_FLAG = "barrier";

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const text = (v) => String(v ?? "").trim();
const uuids = (list) => (Array.isArray(list) ? list : list ? [list] : [])
  .map((u) => text(u)).filter(Boolean);

/**
 * A ward row's `barrier`, or null.
 *
 * `{ hardness, hits, missWithin }` — Stone Shield's is 8, 15 and 4. All
 * three are required: a barrier with no Hits is destroyed the moment it is
 * raised, and one that catches no miss is a note again.
 *
 * @param {object} raw the `barrier` object on the authored row
 * @returns {{hardness:number, hits:number, missWithin:number}|null}
 */
export function normaliseBarrier(raw) {
  if (!raw || typeof raw !== "object") return null;
  const hardness = Math.max(0, Math.trunc(num(raw.hardness)));
  const hits = Math.trunc(num(raw.hits));
  const missWithin = Math.trunc(num(raw.missWithin));
  if (!(hits > 0) || !(missWithin > 0)) return null;
  return { hardness, hits, missWithin };
}

/**
 * The state written onto the ward effect at the cast.
 *
 * @param {{hardness, hits, missWithin}} spec
 * @param {object} opts
 * @param {string} opts.label the shield's name on cards ("Stone Shield")
 * @param {string[]} opts.sourceUuids the foe(s) the ward is aimed at
 * @param {string} [opts.spellName]
 * @param {string|null} [opts.castId]
 */
export function barrierAtCast(spec, { label = "", sourceUuids = [], spellName = "", castId = null } = {}) {
  if (!spec) return null;
  const against = uuids(sourceUuids);
  if (!against.length) return null;
  return {
    label: text(label) || text(spellName) || "Barrier",
    spellName: text(spellName) || text(label),
    hardness: spec.hardness,
    hits: spec.hits,
    max: spec.hits,
    missWithin: spec.missWithin,
    sourceUuids: against,
    castId: castId ?? null
  };
}

/**
 * By how much an attack missed: the defence it met, less its total. A hit
 * is 0 or less. Null when either number is missing.
 */
export function missMargin(total, db) {
  if (!Number.isFinite(Number(total)) || !Number.isFinite(Number(db))) return null;
  if (total === null || db === null || total === "" || db === "") return null;
  return Number(db) - Number(total);
}

/**
 * Does this miss strike the barrier instead?
 *
 * "If the OPPONENT'S attack misses you by 4 or less". The opponent is the
 * foe the shield was raised against, by uuid — a second ogre's swing that
 * misses by 2 does not hit a slab raised against the first. "Misses by 4
 * or less" is a miss (1 or more) of at most `missWithin`.
 *
 * @param {object|null} barrier the state on the effect
 * @param {{attackerUuid: string, missBy: number|null, hits?: boolean}} attack
 */
export function barrierCatches(barrier, { attackerUuid = "", missBy = null, hits = false } = {}) {
  if (!barrier || hits) return false;
  if (!(num(barrier.hits) > 0)) return false;
  const who = text(attackerUuid);
  if (!who || !uuids(barrier.sourceUuids).includes(who)) return false;
  const by = Number(missBy);
  if (!Number.isFinite(by) || missBy === null) return false;
  return by >= 1 && by <= num(barrier.missWithin);
}

/**
 * Damage dealt to the barrier: its Hardness first, then its Hits.
 *
 * Hardness is what an object's damage meets (as Petrified's "Hardness 8"
 * is the DR its damage meets, documents/actor.mjs). What is left comes off
 * the Hits; at 0 the barrier is destroyed.
 *
 * @param {object} barrier
 * @param {number} damage the damage rolled against it
 */
export function barrierAfterDamage(barrier, damage) {
  const rolled = Math.max(0, Math.trunc(num(damage)));
  const hardness = Math.max(0, Math.trunc(num(barrier?.hardness)));
  const before = Math.max(0, Math.trunc(num(barrier?.hits)));
  const taken = Math.max(0, rolled - hardness);
  const after = Math.max(0, before - taken);
  return {
    rolled,
    stopped: Math.min(rolled, hardness),
    taken,
    before,
    after,
    max: Math.max(before, Math.trunc(num(barrier?.max, before))),
    destroyed: before > 0 && after <= 0
  };
}

/** The card's line for damage that met the barrier. */
export function barrierDamageLine(barrier, result, { how = "" } = {}) {
  const name = text(barrier?.label) || "The barrier";
  const lead = how ? `${how} — ` : "";
  const math = `${result.rolled} damage, Hardness ${Math.max(0, Math.trunc(num(barrier?.hardness)))} stops ${result.stopped}`;
  if (result.destroyed) {
    return `${lead}<strong>${name}</strong> takes ${result.taken} (${math}) and is <strong>destroyed</strong> — `
      + "the spell ends and the shield crumbles away.";
  }
  return `${lead}<strong>${name}</strong> takes ${result.taken} (${math}): `
    + `<strong>${result.after}/${result.max} Hits</strong> left.`;
}

/** The line the cast card prints for a barrier raised. */
export function barrierRaisedLine(barrier, foeNames = "") {
  const name = text(barrier?.label) || "The barrier";
  return `<strong>${name}</strong> stands between you and ${foeNames ? `<strong>${foeNames}</strong>` : "the chosen foe"}: `
    + `Hardness ${barrier.hardness}, ${barrier.hits} Hits. A miss by ${barrier.missWithin} or less from `
    + `${foeNames || "that foe"} strikes the shield instead; at 0 Hits the spell ends. `
    + "<em>Area damage reaches the shield by the GM's Damage the shield button.</em>";
}

/**
 * The barrier on a list of effects aimed at this attacker, or null.
 *
 * Pure over effect-like objects `{ id, disabled, flags }`, so the harness
 * runs it with no Foundry. The newest standing barrier against this foe is
 * the one in the way; a disabled effect is not up.
 *
 * @param {Array<object>} effects
 * @param {string} attackerUuid
 * @param {string} [systemId]
 * @returns {{effectId: string, barrier: object}|null}
 */
export function barrierAgainst(effects, attackerUuid, systemId = "trg-prime") {
  const who = text(attackerUuid);
  if (!who) return null;
  let found = null;
  for (const effect of Array.from(effects ?? [])) {
    if (!effect || effect.disabled) continue;
    const barrier = effect.flags?.[systemId]?.[BARRIER_FLAG];
    if (!barrier || !(num(barrier.hits) > 0)) continue;
    if (!uuids(barrier.sourceUuids).includes(who)) continue;
    found = { effectId: String(effect.id ?? effect._id ?? ""), barrier };
  }
  return found;
}

/** Every standing barrier on a list of effects (for the GM's button). */
export function barriersOn(effects, systemId = "trg-prime") {
  return Array.from(effects ?? [])
    .filter((e) => e && !e.disabled && num(e.flags?.[systemId]?.[BARRIER_FLAG]?.hits) > 0)
    .map((e) => ({ effectId: String(e.id ?? e._id ?? ""), barrier: e.flags[systemId][BARRIER_FLAG] }));
}

/* ------------------------------------------------------------------ *
 * A QUESTION ASKED BEFORE THE CAST.
 *
 * "You cannot use this spell if you are not adjacent to a large area of
 * earth or stone such as the ground or a wall." Nothing on the canvas says
 * what a token stands beside, so the caster is asked (Graham: "Ask, and
 * refuse on No"). Declared on any effect row as `castQuestion`, so the
 * next spell with a requirement of its own needs no new code.
 * ------------------------------------------------------------------ */

/**
 * The questions a spell asks before it is cast, deduplicated.
 * @param {object} spellData the spell's system data
 * @returns {string[]}
 */
export function castQuestionsOf(spellData) {
  const asked = [];
  for (const row of Array.isArray(spellData?.effects) ? spellData.effects : []) {
    const q = text(row?.castQuestion);
    if (q && !asked.includes(q)) asked.push(q);
  }
  return asked;
}

/** What the notification says when a question is answered No. */
export function castQuestionRefusal(spellName, question) {
  return `${text(spellName) || "This spell"} cannot be cast — ${text(question).replace(/\?$/, "").replace(/^are you /i, "you must be ")}.`;
}
