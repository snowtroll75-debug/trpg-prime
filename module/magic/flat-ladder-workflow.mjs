/**
 * The Foundry side of a flat degree ladder (see flat-ladder.mjs).
 *
 * NEW at 3.485.0.
 *
 * ─────────────────────────────────────────────────────────────────────
 * NOTHING HERE IS NEW EXCEPT THE ARRANGEMENT.
 *
 * Every piece this needs already existed and was found before anything
 * was written:
 *
 *   instant death        `reapDead` + the Dying/Death State rule built
 *                        at 3.457.0 for the fourteen critical rows that
 *                        said "target dies instantly" and killed nobody.
 *   a critical injury    `rollCriticalInjury`, which already takes a
 *                        `modifier` — Serenity's "-20 critical injury"
 *                        needed no new argument.
 *   temporary immunity   `temporary-immunity.mjs`, general in shape and
 *                        already carrying Guidance and held bonuses.
 *   damage + defences    `resolveAgainstDefences` and
 *                        `applyDamageAndCheckDying`, as everywhere else.
 *
 * The one genuinely new thing is Serenity's repeat — a curse that bites
 * on every offensive action — and that is recorded as an effect and read
 * by the action workflow rather than built as a second clock.
 */

import {
  flatOutcome, flatResolution, flatOutcomeLine, flatCurseLine, flatNoRungLine
} from "./flat-ladder.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Where a repeating curse records what the target rolled.
 *
 * NOT EXPORTED. Only this file reads or writes it, and
 * `verify-rules-have-callers` was right to flag the exported version:
 * "an exported rule nobody calls is not automation — it is a
 * well-tested opinion."
 */
const CURSE_FLAG = "flatLadderCurse";

/**
 * Apply one rung to one creature.
 *
 * @returns {Promise<string[]>} lines for the card
 */
export async function applyFlatLadder(caster, spec, target, degree, castId = null) {
  const lines = [];
  if (!target || !spec) return lines;
  const rung = flatOutcome(spec, degree);
  /*
   * A MISSING RUNG IS SAID OUT LOUD (3.486.0).
   *
   * This returned an empty array, and that silence hid the whole
   * seven-degrees defect for a release: a blunder matched no rung, the
   * card printed "is affected" and then simply stopped, and nothing
   * anywhere reported that a rung had been asked for and not found.
   *
   * `flatOutcome` now maps the rolled degree itself, so reaching here
   * means the key was not a degree at all — but the diagnostic stays,
   * because the cost of a line nobody ever reads is nothing beside the
   * cost of the silence that replaced it.
   */
  if (!rung) {
    lines.push(flatNoRungLine(spec, target.name, degree));
    return lines;
  }

  const currentHP = Number(target.system?.resources?.hp?.value ?? 0);
  const resolution = flatResolution(rung, currentHP);

  const { resolveAgainstDefences } = await import("../combat/damage-workflow.mjs");
  const { applyDamageAndCheckDying } = await import("../combat/dying-workflow.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");

  let taken = resolution.damage;
  if (resolution.damage > 0) {
    const packet = resolveAgainstDefences(target.system ?? {}, {
      amount: resolution.damage,
      type: spec.damageType,
      creatureTypeSystem: ownedCreatureTypeSystem(target),
      // A SPELL IS A MAGICAL SOURCE (3.548.0) — see magic/spell-source.mjs.
      // `area` IS DELIBERATELY LEFT AT ITS DEFAULT. A flat-check ladder
      // is a resolution shape, not a delivery shape: it says nothing
      // about whether the effect had an area, and answering here would
      // be a guess wearing a comment.
      magical: true
    });
    taken = packet.taken;
    if (taken > 0) await applyDamageAndCheckDying(target, taken, { isCritical: false });
  }

  /*
   * DEATH GOES THROUGH THE RULE, NOT ROUND IT.
   *
   * "Dies instantly" is Dying past the creature's own Death State — the
   * shape 3.457.0 settled after fourteen critical rows printed the
   * sentence and left the creature standing.
   *
   * ─────────────────────────────────────────────────────────────────
   * AND AT 3.485.0 THIS COMMENT WAS TRUE AND THE CODE WAS NOT.
   *
   * The line below used to be:
   *
   *     await target.update({ "system.conditions.dying.value": ds + 1 })
   *
   * which writes a system field. `getConditionValue("dying")` does not
   * read that field, so it kept reporting the 2 the damage had left,
   * `isDead` came back false, and `reapDead` returned without reaping.
   * Driven live on 4 September 2026: Word Of Death killed a creature at
   * exactly 100 HP, the card said "dies", and the corpse stayed in the
   * initiative order at Dying 2 — precisely the defect 3.457.0 exists to
   * prevent, in the file whose header claims to reuse that fix.
   *
   * A comment asserting a reading the code never implements is the same
   * shape as `alchemical-workflow`'s splash sentence and Healing
   * Channel's "+10 is IN ADDITION". It is why this project does not
   * accept a comment as evidence — including its own.
   *
   * `toggleStatusEffect` is what every death path in `dying-workflow`
   * uses, and it is now what this one uses.
   */
  if (resolution.dies) {
    const { actorDeathState, reapDead } = await import("../combat/death-state.mjs");
    const deathState = Number(actorDeathState(target)) || 5;
    const hp = Number(target.system?.resources?.hp?.value ?? 0);
    if (hp > 0) await applyDamageAndCheckDying(target, hp, { isCritical: true });
    await target.toggleStatusEffect("dying", { value: deathState + 1 });
    await reapDead(target, game.combat ?? null);
  } else if (resolution.finalHP !== null) {
    /*
     * "otherwise it drops to -10 HP" — a stated destination, not damage,
     * AND STILL A DROP INTO DYING (Graham's ruling, 4 September 2026).
     *
     * This used to write the hit points and tell the dying machinery
     * nothing, leaving a creature sitting at -10 with no Dying condition
     * — the only route to zero-or-below in the system that did not go
     * through the rule. `enterDyingAt` is that rule's own branch, and it
     * lives next to `reached-zero` in `dying-workflow` so the two cannot
     * drift apart quietly.
     */
    const { enterDyingAt } = await import("../combat/dying-workflow.mjs");
    await enterDyingAt(target, resolution.finalHP);
  }

  lines.push(flatOutcomeLine(spec, target.name, degree, resolution, taken));

  // A CRITICAL INJURY, AT THE MODIFIER THE RUNG NAMES. `rollCriticalInjury`
  // already took a `modifier`, so Serenity's "-20 critical injury" needed
  // nothing new — only to be passed.
  if (rung.criticalInjury && !resolution.dies) {
    const { rollCriticalInjury } = await import("../combat/attack-workflow.mjs");
    await rollCriticalInjury(caster, {
      targetActor: target,
      damageType: spec.damageType,
      severity: "minor",
      attackBonus: 0,
      modifier: rung.criticalModifier
    });
  }

  /*
   * AND THE CURSE IS RECORDED, not re-rolled. Graham's ruling of
   * 4 September 2026: the save is rolled ONCE and its result suffered
   * again on every offensive action. So the DEGREE is what is stored —
   * the target carries the verdict, and each later trigger re-applies
   * that rung rather than asking the dice again.
   */
  if (spec.repeatsOnOffensiveAction && !resolution.dies) {
    // THE NORMALISED LADDER IS STORED, AND RE-NORMALISED ON EVERY BITE.
    // That round trip is only safe because `normaliseFlatLadder` is
    // idempotent — which it was not at 3.485.0, where the second pass
    // read the `null`s the first pass wrote as a death threshold of 0
    // and turned Serenity's 10 Mental into "drops to 0 HP". See that
    // function's own comment; the fix is there, where any future caller
    // storing a normalised row inherits it, rather than here.
    await target.setFlag(SYSTEM_ID, CURSE_FLAG, {
      label: spec.label, degree, castId: castId ?? null,
      damageType: spec.damageType, ladder: spec.ladder
    }).catch(() => {});
    lines.push(flatCurseLine(spec, target.name, degree));
  }

  // "Once targeted, the target is then temporarily immune for 10 minutes."
  if (spec.immuneSeconds > 0) {
    const { withImmunity, IMMUNITY_FLAG } = await import("../temporary-immunity.mjs");
    const now = Number(game.time?.worldTime ?? 0);
    const record = target.getFlag(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
    await target.setFlag(SYSTEM_ID, IMMUNITY_FLAG,
      withImmunity(record, spec.label, spec.immuneSeconds, now)).catch(() => {});
  }

  return lines;
}

/**
 * A repeating curse biting on an offensive action.
 *
 * ─────────────────────────────────────────────────────────────────────
 * FOUND BY THE UNCALLED-EXPORT RATCHET, 4 September 2026.
 *
 * The first draft of this file RECORDED the curse and nothing ever read
 * it: `CURSE_FLAG` was exported, `applyFlatLadder` wrote a degree onto
 * the target, and no code anywhere consumed it. Serenity would have
 * shipped as a spell that says "it bites again on every offensive
 * action" and never bites — the card telling the table about a rule
 * nothing implements.
 *
 * `verify-rules-have-callers` caught it before a single cast: "an
 * exported rule nobody calls is not automation — it is a well-tested
 * opinion." That is exactly what it was.
 *
 * IT RE-APPLIES THE RECORDED DEGREE rather than rolling again — Graham's
 * ruling of 4 September 2026 that the save is made once and its result
 * suffered repeatedly.
 *
 * @param {Actor} actor the cursed creature taking an action
 * @param {object} action the action they are committing to
 * @returns {Promise<boolean>} whether a curse bit
 */
export async function biteOffensiveCurses(actor, action) {
  try {
    const record = actor?.getFlag?.(SYSTEM_ID, CURSE_FLAG);
    if (!record?.degree) return false;
    const { isOffensiveAction, normaliseFlatLadder } = await import("./flat-ladder.mjs");
    if (!isOffensiveAction(action)) return false;
    const spec = normaliseFlatLadder({
      kind: "flatLadder", label: record.label, damageType: record.damageType,
      ladder: record.ladder
    });
    if (!spec) return false;
    const lines = await applyFlatLadder(actor, spec, actor, record.degree, record.castId);
    if (lines.length) {
      const { postCurseCard } = await import("./flat-ladder-card.mjs");
      await postCurseCard(actor, record.label, lines);
    }
    return true;
  } catch (error) {
    // SWALLOWED. This runs inside the action commit path; a throw here
    // would lose the player's action after the AP was already spent.
    console.error("TRG Prime | a curse could not bite this action", error);
    return false;
  }
}
