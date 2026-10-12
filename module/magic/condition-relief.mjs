/**
 * A SPELL THAT TAKES A CONDITION DOWN.
 *
 * NEW at 3.517.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * RESTORATION (PP 2, touch, Essence / Healing / Soul)
 *
 *   "You channel healing energy into the target… This reduces the
 *    fatigued condition by 1. … a creature may only benefit from one
 *    restoration spell each day."
 *      +1 PP: instead reduce the dazed or weakened conditions by 1
 *      +2 PP: instead reduce the injured condition by 1
 *      +2 PP: increase the amount of a condition reduced by 1
 *             (or 5 for soul drain)
 *      +4 PP: instead cure 5 points of soul drain
 *      +6 PP: instead reduce the Doomed Condition
 *
 * The pack shipped it with `effects: []` and SIX warps carrying
 * `mods: {}` — the largest cluster of inert warps on any one spell in the
 * pack, measured across all 702 of them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * EVERY CONDITION IT NAMES ALREADY EXISTS, and every one is VALUED —
 * `fatigued`, `dazed`, `weakened`, `injured`, `doomed`, `soulDrain` are
 * all in the registry with steps to come down. That is why this spell was
 * chosen: the vocabulary was already there and only the sentence was
 * missing.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SOUL DRAIN IS COUNTED IN FIVES, which is the book's own unit for it:
 * "cure 5 points of soul drain", and "(or 5 for soul drain)" on the
 * amount warp. Every other condition moves one step at a time. Declared
 * once in the table below rather than branched at each use, so a seventh
 * condition needs no edit anywhere else.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT IS DELIBERATELY NOT HERE: Restoration's "+5 PP: cast time changes
 * to 3 AP". Casting time changes the CAST, not what the cast does, and it
 * is its own channel — five warps across five spells (Regenerate,
 * Lifekeeping, Restoration, Crackling Tempest, Restore Senses) say some
 * version of it and not one is built. Adding a `castAP` key here to
 * finish one spell's list would make the next four special cases of this
 * one, which is the boundary this project drew for bleed relief too.
 */

const text = (v) => String(v ?? "").trim();
const int = (v) => Math.trunc(Number(v) || 0);

/**
 * The conditions a relief spell may take down, and the unit each one
 * moves in.
 */
export const RELIEVABLE = Object.freeze({
  fatigued: Object.freeze({ label: "Fatigued", step: 1 }),
  dazed: Object.freeze({ label: "Dazed", step: 1 }),
  weakened: Object.freeze({ label: "Weakened", step: 1 }),
  injured: Object.freeze({ label: "Injured", step: 1 }),
  doomed: Object.freeze({ label: "Doomed", step: 1 }),
  soulDrain: Object.freeze({ label: "Soul Drain", step: 5 }),
  // BLEEDING JOINS THEM (3.577.0) — not for a spell, for the block-17
  // alchemy: Blood-Block "reduces the bleed by 1 point" and Firqueline will
  // "stop 5 points of bleeding" (pages 179-180). The same relief, applied
  // by the same case, from a bottle.
  bleeding: Object.freeze({ label: "Bleeding", step: 1 }),
  // TWO MORE FOR PILLARS OF FAITH (3.625.0): Bloom of Renewal "reduce
  // either Fatigued or Sickened", Share Burden "Dazed, Fatigued, Frightened,
  // Sickened or Weakened". The same relief, the same step, on two valued
  // conditions the core never relieved. (Dazzled is not valued and so has
  // no step to come down — Sunveil's removal stays a card line.)
  sickened: Object.freeze({ label: "Sickened", step: 1 }),
  frightened: Object.freeze({ label: "Frightened", step: 1 }),
  // AND DYING (3.630.0): Soulvine "reduce that creature's Dying condition
  // by 1", Divine Nectar "reduce Dying to 0". Reaching 0 is a recovery from
  // Dying, with its Fatigued, and a dead creature is not relieved — the
  // applier asks both.
  dying: Object.freeze({ label: "Dying", step: 1 })
});

const DICE_AMOUNT = /^\s*\d*\s*d\s*\d+(\s*[+-]\s*\d+)?\s*$/i;

/**
 * A condition-relief row, or null when it is malformed.
 *
 * REFUSED RATHER THAN GUESSED when the condition is unknown. A row naming
 * something outside the table would reduce nothing and print a line
 * saying it had, which is the failure this whole tier of work exists to
 * remove.
 *
 * @param {object} raw the authored effect row
 * @returns {object|null}
 */
export function normaliseConditionRelief(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (text(raw.kind) !== "conditionRelief") return null;

  const condition = text(raw.condition);
  if (!RELIEVABLE[condition]) return null;

  return {
    condition,
    // DEFAULTING TO THE CONDITION'S OWN STEP rather than to 1 — a Soul
    // Drain row that forgot to say 5 would otherwise cure a single point
    // of something the book only ever moves in fives.
    amount: Math.max(1, int(raw.amount) || RELIEVABLE[condition].step),
    /*
     * THE DAILY LIMIT IS A KEY, NOT A BOOLEAN. "A creature may only
     * benefit from one restoration spell each day" limits the
     * BENEFICIARY and names ONE spell; a shared boolean would have let a
     * Restoration block some future relief spell on the same creature.
     */
    oncePerDay: text(raw.oncePerDay) || null,
    /*
     * A CHOICE THE ROW ITSELF OFFERS (3.591.0).
     *
     * Until now the only way to offer a caster two conditions was a
     * WARP \u2014 Restoration's "instead reduce X". Metabolism prints the
     * choice in its base text: "restore 1 point of the dazed, injured or
     * weakened condition". Three rows would take down all three; one row
     * naming one of them would flatten a choice the page makes, which is
     * the same defect as a flattened degree ladder wearing different
     * clothes.
     *
     * THE SHAPE IS `suppress`'s, deliberately. Delay Pain and Indomitable
     * have offered a base-text choice since 3.587.0, and a reader who has
     * met one should not have to learn a second vocabulary for the same
     * idea. Unknown conditions are dropped rather than refused, so a typo
     * narrows the offer instead of silently voiding the row.
     */
    choices: (Array.isArray(raw.choices) ? raw.choices : [])
      .map((c) => text(c))
      .filter((c) => RELIEVABLE[c]),
    /*
     * THE CASTER TAKES IT ON (3.625.1). Pillars of Faith's Share Burden:
     * "reduce one of the target's conditions by 1 … You then gain or
     * increase the same condition by 1 yourself. If you are immune to the
     * condition the spell fails." The relieved condition, whichever the
     * prompt chose, is applied to the caster one step higher than they
     * hold it — through the ordinary condition application, so an
     * immunity refuses it out loud the way it refuses any condition.
     */
    casterGains: raw.casterGains === true,
    ...reliefExtras(raw)
  };
}

/**
 * The 3.630.0 additions, present only when the row uses them so an older
 * row normalises exactly as it did:
 *
 *   amount: "1d6"            a rolled amount (Nine-Herb Restorative)
 *   choiceAmounts: { injured: "1d4" }   per choice, where the page differs
 *   targetItems: ["Unliving Zombie", …] only a creature holding one of these
 *                            (Embalmer's Black Resin: "a Skeleton, Zombie,
 *                            Ghoul or Mummy")
 */
function reliefExtras(raw) {
  const out = {};
  const formula = text(raw.amount);
  if (DICE_AMOUNT.test(formula)) out.amountFormula = formula;
  const per = raw.choiceAmounts && typeof raw.choiceAmounts === "object" ? raw.choiceAmounts : null;
  if (per) {
    const kept = {};
    for (const [k, v] of Object.entries(per)) {
      if (!RELIEVABLE[text(k)]) continue;
      const f = text(v);
      if (DICE_AMOUNT.test(f) || int(f) > 0) kept[text(k)] = f;
    }
    if (Object.keys(kept).length) out.choiceAmounts = kept;
  }
  const items = (Array.isArray(raw.targetItems) ? raw.targetItems : []).map((n) => text(n).toLowerCase()).filter(Boolean);
  if (items.length) out.targetItems = items;
  return out;
}

/**
 * The formula this relief rolls for the condition chosen, or "" when the
 * amount is a plain number (3.630.0).
 */
export function reliefAmountFormula(spec, condition) {
  if (!spec) return "";
  const per = spec.choiceAmounts?.[condition];
  if (per) return DICE_AMOUNT.test(per) ? per : "";
  return condition === spec.condition ? (spec.amountFormula ?? "") : "";
}

/** A flat per-choice amount, when the page prints a number for that choice. */
export function reliefChoiceAmount(spec, condition) {
  const per = spec?.choiceAmounts?.[condition];
  return per && !DICE_AMOUNT.test(per) ? Math.max(1, int(per)) : 0;
}

/** Whether the creature is one this relief reaches (Embalmer's Black Resin). */
export function reliefReaches(spec, itemNames = []) {
  if (!spec?.targetItems?.length) return true;
  const held = new Set(Array.from(itemNames ?? []).map((n) => text(n).toLowerCase()));
  return spec.targetItems.some((n) => held.has(n));
}

/** What the card says when the caster takes the relieved condition on. */
export function casterGainsLine(casterName, label, from, to) {
  return `<strong>${casterName}</strong> takes it on: <strong>${label} ${Math.max(0, int(to))}</strong>${int(from) > 0 ? ` (was ${Math.max(0, int(from))})` : ""}.`;
}

/**
 * The conditions this casting may take down — one, or two when a warp
 * bought a choice between them.
 *
 * THE "INSTEAD" WARPS REPLACE THE CONDITION rather than adding a second
 * one, which is the book's own word. A caster who buys two of them has
 * chosen twice and gets the last, and the pair that arrives together
 * stays together: "+1 PP: instead reduce the dazed OR weakened
 * conditions" is ONE purchase offering TWO, not two purchases.
 *
 * @param {object} spec a normaliseConditionRelief result
 * @param {object} warpMods the aggregated warp mods
 * @returns {string[]} in offer order; the first is what an unanswered
 *   prompt falls back to
 */
export function reliefChoices(spec, warpMods = {}) {
  if (!spec) return [];
  const swap = (Array.isArray(warpMods?.reliefConditions) ? warpMods.reliefConditions : [])
    .map((c) => text(c))
    .filter((c) => RELIEVABLE[c]);
  // A WARP'S "INSTEAD" STILL WINS. The row's own choices are what the
  // page offers; a warp that says "instead" replaces the offer outright,
  // which is the word the book uses and the behaviour Restoration has
  // had since 3.517.0.
  if (swap.length) return swap;
  const own = Array.isArray(spec.choices) ? spec.choices.filter((c) => RELIEVABLE[c]) : [];
  if (!own.length) return [spec.condition];
  // THE DECLARED CONDITION LEADS, because an unanswered prompt falls back
  // to the first offer and the row's own `condition` is what the author
  // named as the default.
  return own.includes(spec.condition) ? [spec.condition, ...own.filter((c) => c !== spec.condition)] : own;
}

/** Whether this casting has to ask the caster which condition to take down. */
export function reliefNeedsPrompt(spec, warpMods = {}) {
  return reliefChoices(spec, warpMods).length > 1;
}

/**
 * What this casting actually reduces, once the warps and the caster's
 * answer are taken into account.
 *
 * @param {object} spec a normaliseConditionRelief result
 * @param {object} warpMods the aggregated warp mods
 * @param {string} chosen the condition picked at the prompt, when one was
 *   offered
 * @returns {{condition: string, label: string, amount: number}|null}
 */
export function reliefPlan(spec, warpMods = {}, chosen = "") {
  if (!spec) return null;

  const offered = reliefChoices(spec, warpMods);
  const picked = text(chosen);
  // A PICK THE WARPS DID NOT OFFER IS IGNORED — the same refusal
  // `slotChoiceRows` makes. Whatever a prompt returns, only what this
  // casting actually bought may be applied.
  const condition = offered.includes(picked) ? picked : offered[0];

  const base = condition === spec.condition ? spec.amount : RELIEVABLE[condition].step;

  /*
   * THE BUMP IS THE CONDITION'S OWN STEP, which is the whole content of
   * the book's "(or 5 for soul drain)": one more of whatever unit this
   * condition is counted in. Written as the step rather than as a
   * 1-or-5 branch, so the parenthesis needs no special case.
   *
   * A WARP ONLY EVER BUYS MORE — the floor every numeric channel in this
   * system carries, and the gap that survived two mutation runs in this
   * project before anybody wrote it down.
   */
  const bumps = Math.max(0, int(warpMods?.reliefBump));
  return {
    condition,
    label: RELIEVABLE[condition].label,
    amount: base + bumps * RELIEVABLE[condition].step
  };
}

/**
 * Has this creature already had one of these today?
 *
 * TAKES THE RECORD, NOT THE ACTOR, so a check can run it. The record is
 * the TARGET's own flag, cleared by THEIR daily preparations rather than
 * the caster's — the book limits the beneficiary, and Graham ruled on
 * 7 September 2026 that it is tracked on them.
 *
 * @param {object} record the target's relief record
 * @param {string|null} key the row's `oncePerDay` key
 * @returns {boolean} false whenever the row declares no limit
 */
export function alreadyRelievedToday(record, key) {
  /*
   * THIS OPENED `if (!key) return false;` AND THAT GUARD WAS DEAD.
   *
   * The mutation runner said so: with no key, `record[undefined]` is
   * undefined, which is not `true`, so the line below already answered
   * false. The SEVENTH dead guard this project has deleted rather than
   * written a check around.
   *
   * `markRelievedToday`'s identical-looking guard below is NOT dead —
   * there it decides whether a key is written into the record at all.
   */
  return Boolean(record && key && record[key] === true);
}

/** That record with this casting written into it. */
export function markRelievedToday(record, key) {
  if (!key) return { ...(record ?? {}) };
  return { ...(record ?? {}), [key]: true };
}

/**
 * What the card says when the condition came down.
 *
 * THE NUMBERS ON BOTH SIDES, because "reduces the fatigued condition by
 * 1" is invisible on a sheet that already showed a number: a reader
 * cannot otherwise tell a spell that worked from one that found less to
 * reduce than it could clear.
 */
export function reliefLine(targetName, label, from, to) {
  const before = Math.max(0, int(from));
  const after = Math.max(0, int(to));
  if (after <= 0) return `<strong>${targetName}</strong> is no longer <strong>${label}</strong> (was ${before}).`;
  return `<strong>${targetName}</strong>: <strong>${label} ${before}</strong> &rarr; <strong>${label} ${after}</strong>.`;
}

/**
 * What the card says when there was nothing to take down.
 *
 * SAID OUT LOUD, AND THE PP IS STILL SPENT — the spell was cast. A caster
 * who touched an ally that turned out not to be Fatigued would otherwise
 * see a card with no line on it and no way to tell that from a spell that
 * failed to apply.
 */
export function reliefNothingLine(targetName, label, spentNoun = "spell") {
  // A HERB OR AN ITEM IS NOT A SPELL (3.630.1, F4 of the 3.630.0 live test):
  // Soulvine on a creature that was not Dying said "the spell is spent".
  return `<em>${targetName} is not ${label} — nothing to reduce, and the ${spentNoun} is spent.</em>`;
}

/**
 * What the card says when this creature has already had one today.
 *
 * NAMES THE RULE, not just the refusal. "Nothing happened" is the shape
 * this project spends its releases removing.
 */
export function alreadyRelievedLine(targetName, spellName) {
  return `<em>${targetName} has already benefited from ${spellName} today — a creature may `
    + "only benefit from one each day, so nothing was applied.</em>";
}
