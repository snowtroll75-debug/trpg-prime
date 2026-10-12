/**
 * WHAT A HELD ROD DOES FOR ITS WIELDER — NEW at 3.616.0, Graham's R12–R14
 * of block 36 (page 369).
 *
 * The rods are charged items whose power is not a spell they release but a
 * thing they do to the wielder's own casting or checks, paid from the rod:
 *
 *   Rod of Extension I–III  "You cast a spell of PP 4 [8, 12] or less that
 *                            has a duration … expend 2 PP from the rod to
 *                            apply the extend Metamagic feat to the spell.
 *                            This does not increase the casting DC of the
 *                            spell or cost you any PP."
 *   Rod of Quickening I     The same, for quicken, on "a spell of PP 4 or
 *                            less that has an AP cost of 1 or 2". Graham's
 *                            R12: a 1 AP spell cannot be quickened, so only
 *                            a 2 AP spell is offered it.
 *   Rod of the Magi,        "You may expend PP from the rod instead of your
 *   Sceptre of the Clergy    own reserve when casting an arcane [a divine]
 *                            spell." (R13)
 *   Rod of Accuracy         "expend 1 PP from the rod to gain a +1-item bonus
 *                            to the attack check portion of the spell check
 *                            or 2 PP to gain a +2." (R14)
 *   Rod of Alertness        "You make a Perception or Sense Motive skill
 *                            check … expend 2 PP from the rod to gain
 *                            advantage on the check." (R14)
 *
 * The pack declares each power on `flags.trg-prime.chargedItem`:
 * `metamagic {kind, maxPP, cost}`, `ppSource {tradition}`,
 * `spellAttack {maxPP}`, `checkAdvantage {subjects, cost}`.
 *
 * HELD, ALWAYS: "A character may wield only one charged item at a time",
 * and a rod in a pack is not being wielded. Equipped is the test.
 *
 * A ROD MAY BE OVERSPENT, like any charged item: "Charge Depletion is rolled
 * whenever a charged item's PP is reduced below 0". So a power is offered
 * whatever the rod holds, and the card says what it holds.
 *
 * Pure; no Foundry. The documents half is in charged-items-workflow.mjs.
 */

const SYSTEM_ID = "trg-prime";

function chargedOf(item) {
  return item?.flags?.[SYSTEM_ID]?.chargedItem ?? null;
}

/** A broken rod does nothing until it is Repaired (R16): tracked HP at 0. */
function broken(item) {
  const max = Math.floor(Number(item?.system?.hp?.max) || 0);
  return max > 0 && Math.floor(Number(item?.system?.hp?.value) || 0) <= 0;
}

function heldRods(items) {
  return Array.from(items ?? []).filter((item) => item?.system?.equipped && chargedOf(item) && !broken(item));
}

function rodRow(item) {
  return {
    itemId: item.id ?? item._id ?? "",
    name: item.name ?? "",
    uses: Math.floor(Number(item.system?.uses ?? 0) || 0)
  };
}

/**
 * The metamagic rods held, for buildMetamagicOptions.
 * @returns {Array<{itemId, name, uses, kind: "extend"|"quicken", maxPP: number, cost: number}>}
 */
export function metamagicRodsOf(items) {
  const out = [];
  for (const item of heldRods(items)) {
    const mm = chargedOf(item).metamagic;
    if (!mm || !["extend", "quicken"].includes(mm.kind)) continue;
    out.push({
      ...rodRow(item),
      kind: mm.kind,
      maxPP: Math.max(0, Math.floor(Number(mm.maxPP) || 0)),
      cost: Math.max(0, Math.floor(Number(mm.cost ?? 2) || 0))
    });
  }
  return out;
}

/**
 * Whether a metamagic rod may be applied to this spell.
 * @param {{kind: string, maxPP: number}} rod
 * @param {{basePP: number, duration?: string, castAP?: number}} spell
 */
export function metamagicRodApplies(rod, { basePP = 0, duration = "", castAP = null } = {}) {
  if (!rod) return false;
  if (Number(basePP) > Number(rod.maxPP)) return false;
  if (rod.kind === "extend") return Boolean(String(duration ?? "").trim());
  // R12: "Nothing for 1 AP Quicken, it cannot quicken it."
  if (rod.kind === "quicken") return Number(castAP) === 2;
  return false;
}

/** Normalise a tradition word: "Divinity" and "divine" are one thing. */
function traditionKey(text) {
  const t = String(text ?? "").toLowerCase();
  if (/divin/.test(t)) return "divinity";
  if (/arcan/.test(t)) return "arcane";
  if (/verdant|primal|natur/.test(t)) return "verdant";
  if (/ether|occult/.test(t)) return "ethereal";
  return t.trim();
}

/**
 * The held rod a spell of this tradition may draw its PP from, or null.
 * @param {Array} items
 * @param {string} tradition the spell's tradition (or traditions)
 */
export function ppSourceRodFor(items, tradition) {
  const wanted = String(tradition ?? "").split(/[,;/]/).map(traditionKey).filter(Boolean);
  for (const item of heldRods(items)) {
    const source = chargedOf(item).ppSource;
    if (!source?.tradition) continue;
    if (wanted.includes(traditionKey(source.tradition))) return rodRow(item);
  }
  return null;
}

/**
 * How a casting's PP divide between the rod and the caster: the rod pays
 * what was drawn from it, up to the spend, and the caster the rest.
 */
export function rodDrawSplit(ppSpent, rodDraw) {
  const spent = Math.max(0, Math.floor(Number(ppSpent) || 0));
  const rod = Math.min(spent, Math.max(0, Math.floor(Number(rodDraw) || 0)));
  return { rod, caster: spent - rod };
}

/** The held Rod of Accuracy, or null. */
export function accuracyRodOf(items) {
  for (const item of heldRods(items)) {
    const spec = chargedOf(item).spellAttack;
    if (spec) return { ...rodRow(item), maxPP: Math.max(1, Math.floor(Number(spec.maxPP ?? 2) || 2)) };
  }
  return null;
}

/** The attack row for the PP spent: +1 per PP, at most the rod's. */
export function accuracyRow(rod, pp) {
  const n = Math.max(0, Math.min(Number(rod?.maxPP ?? 0), Math.floor(Number(pp) || 0)));
  if (!n) return null;
  return { label: rod.name || "Rod of Accuracy", value: n, type: "item" };
}

/**
 * The held rod that buys advantage on this skill check, or null.
 * @param {Array} items
 * @param {string} subject the check's skill key (perception, senseMotive)
 */
export function advantageRodFor(items, subject, { actionKey = "", checkType = "skill" } = {}) {
  const key = String(subject ?? "");
  const action = String(actionKey ?? "");
  for (const item of heldRods(items)) {
    const spec = chargedOf(item).checkAdvantage;
    if (!spec) continue;
    const subjects = Array.isArray(spec.subjects) ? spec.subjects : [];
    // BY ACTION TOO (3.626.0): Pillars of Faith's Rod of Scholarly Recall —
    // "You attempt Recall Knowledge, Identify Power, Analyse Scripture,
    // Recognise Doctrine or Trace Religious Provenance" — names actions,
    // not skills; either axis may match.
    const actions = Array.isArray(spec.actions) ? spec.actions : [];
    const types = Array.isArray(spec.checkTypes) ? spec.checkTypes : [];
    const matches = (key && subjects.includes(key)) || (action && actions.includes(action)) || (types.length && types.includes(String(checkType ?? "")));
    if (!matches) continue;
    return { ...rodRow(item), cost: Math.max(0, Math.floor(Number(spec.cost ?? 2) || 0)) };
  }
  return null;
}

/**
 * THE HELD ROD THAT BUYS A BONUS ON THIS CHECK (3.626.0): `checkBonus
 * { checkTypes?, subjects?, actions?, cost, value, type }` — Pillars of
 * Faith's Rod of Intercession, "+2-item bonus to the triggering Counteract
 * check" for 2 PP. The same shape as the advantage, with a value.
 */
export function bonusRodFor(items, { subject = "", actionKey = "", checkType = "" } = {}) {
  const key = String(subject ?? "");
  const action = String(actionKey ?? "");
  for (const item of heldRods(items)) {
    const spec = chargedOf(item).checkBonus;
    if (!spec || !(Number(spec.value) > 0)) continue;
    const subjects = Array.isArray(spec.subjects) ? spec.subjects : [];
    const actions = Array.isArray(spec.actions) ? spec.actions : [];
    const types = Array.isArray(spec.checkTypes) ? spec.checkTypes : [];
    const matches = (key && subjects.includes(key)) || (action && actions.includes(action)) || (types.length && types.includes(String(checkType ?? "")));
    if (!matches) continue;
    return {
      ...rodRow(item),
      cost: Math.max(0, Math.floor(Number(spec.cost ?? 2) || 0)),
      value: Math.max(0, Math.floor(Number(spec.value) || 0)),
      type: String(spec.type ?? "item"),
      scope: String(spec.scope ?? "")
    };
  }
  return null;
}

/** A rod's line after it pays: what it holds now. */
export function rodPaysLine(rod, pp, after, maximumPP) {
  const max = Number(maximumPP ?? 0);
  return after < 0
    ? `${rod.name} pays ${pp} PP: <strong>0</strong>${max ? ` of ${max}` : ""} PP — overspent by ${-after}, which triggers Charge Depletion.`
    : `${rod.name} pays ${pp} PP: <strong>${after}</strong>${max ? ` of ${max}` : ""} PP remaining.`;
}
