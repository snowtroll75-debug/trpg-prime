/**
 * DOING WHAT THE FUMBLE ROWS SAY.
 *
 * NEW at 3.582.0, for the pages 221-230 audit's D1 and Graham's rulings
 * of 22 September 2026 (R1, R3–R6, R15).
 *
 * The rules themselves are pure and live in `fumble-riders.mjs`; this is
 * the half that touches Foundry — rolling the attack that lands on an
 * ally, taking the weapon out of the fumbler's hands, breaking it,
 * charging the Interact actions that free them.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ORDER IS THE ROW'S OWN ORDER, and it matters in one place: a row
 * that both breaks the weapon and calls for a save (100 on three tables)
 * breaks it FIRST, because the save is the shards flying off the thing
 * that has already broken.
 *
 * WHAT IS ROLLED AND WHAT IS OFFERED. Graham's R3 is "Auto" — a row
 * saying you have hit an ally is not offering a choice, so the attack is
 * rerolled without asking. The one thing that IS a button is the
 * "2 Interact actions to free yourself" escape, because spending actions
 * is a decision the player makes on their own turn, and the same shape
 * Cold 90's escape took at 3.581.0.
 *
 * EVERY DOCUMENT IS THE ONE FOUNDRY HANDED OVER. Blocks 19 to 21 cost
 * five releases to names that looked right and were not, so the weapon
 * dropped is the `weapon` argument this function was given, the actor is
 * the `actor` argument, and the allies are read from the canvas rather
 * than from `game.actors` — which has no token actors in it.
 */
import {
  allyRerollRider, breakWeaponRider, dropWeaponRider, fumbleSaveDC,
  ignoresDR, levelDCSaveRider, randomMovementRider, reactionRider,
  typeSplitDamageRider, untilHealedConditions
} from "./fumble-riders.mjs";
import { breakItemValue } from "../items.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { actorHandle } from "../actor-handle.mjs";
// THE RANGE THE ROW MEANS (3.582.2) — the attack workflow's own measures,
// asked of the same helpers it asks, so the two cannot disagree.
import { distanceBetween } from "./geometry.mjs";
import { weaponReachExtension } from "./attack.mjs";

/** Adjacency, and the band a ranged Strike is refused beyond. */
const ADJACENT_FEET = 5;
const SIX_INCREMENTS = 6;

const SYSTEM_ID = "trg-prime";

/** The damage types the split rider tells apart. */
const BLEEDING_TYPES = Object.freeze(["piercing", "slashing"]);

/**
 * A weapon's damage type.
 *
 * `system.damageType` is where it lives; the object form is accepted too
 * because a few item shapes in this system carry `damage: { formula,
 * type }` instead, and a reader that knows only one of them is a reader
 * that silently answers "" for the other.
 */
function weaponDamageType(weapon) {
  const direct = weapon?.system?.damageType;
  if (typeof direct === "string" && direct.trim()) return direct.trim().toLowerCase();
  const nested = weapon?.system?.damage;
  if (nested && typeof nested === "object" && typeof nested.type === "string") {
    return nested.type.trim().toLowerCase();
  }
  return "";
}

/*
 * IS THIS A BOW? (found by driving Missile 21-25 in a live world.)
 *
 * The row splits on it — "If you are attacking with a BOW, the string has
 * snapped requiring 3 interact actions to fix. For any other missile
 * weapon, it is broken" — so getting it wrong is the difference between
 * a repairable string and a destroyed weapon.
 *
 * The first draft asked the weapon's NAME with `\bbow\b`, and a
 * SHORTBOW is not matched by it: there is no word boundary inside
 * "Shortbow". A live drive broke the bow it should have restrung.
 *
 * THE GROUP IS THE SYSTEM'S OWN ANSWER, and it was already being used
 * two hundred lines away — the Archer archetype's fumble-DC bonus asks
 * `group === "bow"` in exactly these words. Asking the same field means
 * a weapon the system calls a bow is a bow here too, whatever it is
 * named. The name is kept only as a fallback for a weapon whose group
 * nobody filled in.
 */
function weaponIsABow(weapon) {
  const group = String(weapon?.system?.group ?? "").trim().toLowerCase();
  if (group) return group === "bow";
  return /bow\b/i.test(String(weapon?.name ?? ""));
}

/**
 * HOW FAR THE ATTACK THAT JUST FUMBLED COULD REACH.
 *
 * ADDED AT 3.582.2, after the live drive of 3.582.1 found `alliesOf`
 * filtering on DISPOSITION ALONE. The row says "reroll this attack
 * against a randomly selected ally WITHIN RANGE", and the sentence after
 * it — "if no allies are within range you inflict a Critical Injury to
 * yourself" — is the whole rule: a fumbler alone in a corridor hurts
 * themselves. With no range measured, a sabre swung in an empty corridor
 * reached across the entire scene and gashed a player character standing
 * five hundred feet away. Measured, not believed: the card said "within
 * range" and nothing had ever asked how far that was.
 *
 * THE FIGURES ARE THE ATTACK WORKFLOW'S OWN, not a second set invented
 * here. Melee is `system.combat.reach` plus the weapon's Reach trait,
 * which is what `attack-workflow.mjs` measures a Strike against; a
 * missile or thrown weapon reaches six range increments, which is the
 * band beyond which that same workflow refuses the Strike outright.
 *
 * @param {Actor} actor
 * @param {Item|null} weapon
 * @returns {number} feet
 */
function attackRangeFeet(actor, weapon) {
  const system = weapon?.system ?? {};
  const mode = String(system.attackMode ?? "melee").trim().toLowerCase();
  if (mode === "missile" || mode === "thrown") {
    const increment = Number(system.rangeIncrement) || 0;
    // A thrown weapon with no increment recorded is still a thrown
    // weapon; five feet is the honest floor, not the whole scene.
    return increment > 0 ? increment * SIX_INCREMENTS : ADJACENT_FEET;
  }
  const reach = Number(actor?.system?.combat?.reach ?? ADJACENT_FEET) || ADJACENT_FEET;
  return reach + weaponReachExtension(system);
}

/**
 * Allies of `actor` standing within that attack's range.
 *
 * NO TOKEN, NO RANGE. An actor with nothing on the canvas cannot be
 * measured from, and the honest answer is then "no ally is in range" —
 * which sends the row down its own printed fallback and hurts the
 * fumbler. Guessing the other way reaches out and hurts somebody else's
 * character, which is exactly what this function did before.
 *
 * @param {Actor} actor
 * @param {number} maxFeet
 * @returns {Array} tokens
 */
function alliesOf(actor, maxFeet) {
  const ownToken = actor?.token?.object ?? actor?.getActiveTokens?.()?.[0] ?? null;
  if (!ownToken) return [];
  const disposition = ownToken.document?.disposition ?? null;
  return (globalThis.canvas?.tokens?.placeables ?? []).filter((token) => {
    if (!token.actor || token.id === ownToken.id) return false;
    if (disposition !== null && token.document?.disposition !== disposition) return false;
    return distanceBetween(ownToken, token) <= maxFeet;
  });
}

/**
 * Do everything the row asks for beyond conditions and self-damage.
 *
 * @param {Actor} actor the fumbler
 * @param {object} row the fumble table row
 * @param {object} context { weapon, category, lines, rolls, line }
 * @returns {Promise<object>} flags for the card, for anything that
 *   became a button
 */
export async function applyFumbleRiders(actor, row, { weapon = null, category = "", lines = [], rolls = [], line } = {}) {
  const effect = String(row?.effect ?? "");
  const say = typeof line === "function" ? line : (html) => `<p>${html}</p>`;
  const flags = {};

  /* ── the weapon breaks, before anything that follows from it ────── */
  const broken = breakWeaponRider(effect);
  if (broken && weapon) {
    if (broken.bowString && weaponIsABow(weapon)) {
      lines.push(say(
        `<strong>${weapon.name}'s string has snapped</strong> — `
        + `${broken.interacts} Interact actions to fix it.`));
    } else {
      /*
       * BROKEN IS A HIT-POINT STATE IN THIS SYSTEM, not a flag — see
       * `itemStatus` in items.mjs, which every other reader of an item's
       * condition already asks (the attack path checks it before a swing).
       * So the break is recorded the way the rest of the system records
       * one: `breakItemValue` drops the weapon to 0, and nothing new is
       * invented for the fumble path to be the only thing that honours.
       *
       * AND AN UNTRACKED ITEM IS SAID, NOT FAKED. `itemStatus` calls a
       * weapon with no max HP "untracked", which is most of them — a GM
       * sets per-item HP only when they care. Writing 0 to such a weapon
       * changes nothing anybody reads, so the card says the break could
       * not be recorded rather than claiming it was.
       */
      const hp = weapon.system?.hp ?? {};
      const current = Number(hp.value ?? 0);
      const max = Number(hp.max ?? 0);
      if (max > 0) {
        await weapon.update({ "system.hp.value": breakItemValue(current) });
        lines.push(say(`<strong>${weapon.name} is broken</strong> — reduced to 0 HP.`));
      } else {
        lines.push(say(
          `<strong>${weapon.name} is broken.</strong> <em>It has no maximum HP set, so the `
          + "system cannot record the break — give it one on the item sheet if you track item "
          + "damage.</em>"));
      }
    }
  }

  /* ── the weapon is dropped (R5: unequip) ───────────────────────── */
  const dropped = dropWeaponRider(effect);
  if (dropped && weapon) {
    if (weapon.system?.equipped) await weapon.update({ "system.equipped": false });
    lines.push(say(
      `<strong>${weapon.name} is dropped at ${actor.name}'s feet</strong> — unequipped.`
      + (dropped.dud ? " A bomb or other volatile item does not go off: it is a dud." : "")));
  }

  /* ── damage split by the weapon's own type ─────────────────────── */
  const split = typeSplitDamageRider(effect);
  if (split) {
    /*
     * `system.damageType`, MEASURED IN A LIVE WORLD BEFORE THIS SHIPPED.
     * A weapon's `system.damage` is the FORMULA — the string "1d8" — and
     * its type is a field of its own beside it. The first draft read
     * `system.damage.type`, which on a string is `undefined`: it would
     * have parsed, run, and quietly sent every split row down the
     * "names none" branch. That is the shape blocks 19 to 21 spent five
     * releases on.
     */
    const type = weaponDamageType(weapon);
    const packet = BLEEDING_TYPES.includes(type) ? split.piercingSlashing
      : type === "bludgeoning" ? split.bludgeoning
        : null;
    if (!packet) {
      lines.push(say(
        `<em>The row splits by damage type and ${weapon?.name ?? "this weapon"} names none — `
        + "the GM picks: " + `${split.piercingSlashing.formula} recurring bleed (piercing or slashing), `
        + `or ${split.bludgeoning.formula} damage (bludgeoning).</em>`));
    } else if (packet.type === "bleed") {
      const roll = await new globalThis.Roll(packet.formula).evaluate();
      rolls.push(roll);
      const { applyConditionTags } = await import("./effect-application-workflow.mjs");
      await applyConditionTags(actor, [{ key: "bleeding", label: "Bleeding", value: roll.total }]);
      lines.push(say(
        `<strong>${actor.name} gains Bleeding ${roll.total}</strong> (${packet.formula}, `
        + `${type} weapon).`));
    } else {
      const roll = await new globalThis.Roll(packet.formula).evaluate();
      rolls.push(roll);
      const { applyDamageAndCheckDying } = await import("./dying-workflow.mjs");
      await applyDamageAndCheckDying(actor, roll.total);
      lines.push(say(
        `<strong>${actor.name} takes ${roll.total} damage</strong> (${packet.formula}, `
        + `bludgeoning weapon)${packet.ignoresDR ? ", ignoring DR and resistance" : ""}.`));
    }
  } else if (ignoresDR(effect)) {
    // REPORTED, NOT ENFORCED — self-damage never ran the DR pipeline, so
    // this row has always been right and only the card was silent.
    lines.push(say("<em>That damage ignores DR and resistance.</em>"));
  }

  /* ── reactions ─────────────────────────────────────────────────── */
  const reactions = reactionRider(effect);
  if (reactions?.triggers) {
    lines.push(say(`<em><strong>${actor.name} triggers reactions.</strong></em>`));
  }
  if (reactions?.blockedRounds) {
    const round = Number(globalThis.game?.combat?.round ?? 0);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "No Reactions",
      img: "icons/svg/downgrade.svg",
      changes: [],
      flags: {
        [SYSTEM_ID]: {
          fumbleNoReactions: true,
          conditionExpiresRound: round + reactions.blockedRounds
        }
      }
    }]);
    lines.push(say(
      `<strong>No Reactions</strong> until the end of ${actor.name}'s next turn.`));
  }

  /* ── forced movement ───────────────────────────────────────────── */
  const movement = randomMovementRider(effect);
  if (movement) {
    const roll = await new globalThis.Roll("1d8").evaluate();
    rolls.push(roll);
    const compass = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
    lines.push(say(
      `<strong>${actor.name} moves ${movement.feet} feet ${compass[roll.total - 1]}</strong> (1d8)`
      + `${movement.triggersReactions ? ", triggering reactions" : ""}. The GM moves the token.`));
  }

  /* ── the attack that lands on a friend (R3: auto) ──────────────── */
  const reroll = allyRerollRider(effect);
  if (reroll) {
    const rangeFeet = attackRangeFeet(actor, weapon);
    const allies = reroll.target === "self" ? [] : alliesOf(actor, rangeFeet);
    const pick = allies.length
      ? allies[Math.floor((await new globalThis.Roll(`1d${allies.length}`).evaluate()).total) - 1]
      : null;
    const { rollCriticalInjury } = await import("./attack-workflow.mjs");

    if (reroll.target === "self" || (!pick && reroll.fallback === "self")) {
      lines.push(say(
        `<strong>${pick ? "" : `No ally within ${rangeFeet} ft — `}`
        + `${actor.name} inflicts a critical injury on themselves.</strong>`));
      await rollCriticalInjury(actor, {
        targetActor: actor,
        damageType: weaponDamageType(weapon) || "bludgeoning",
        severity: "minor",
        attackBonus: 0
      });
    } else if (pick) {
      lines.push(say(
        `<strong>The attack lands on ${pick.actor.name}</strong>`
        + `${reroll.ignoresMAP ? ", ignoring the multiple attack penalty" : ""}.`));
      await rollCriticalInjury(actor, {
        targetActor: pick.actor,
        damageType: weaponDamageType(weapon) || "bludgeoning",
        severity: "minor",
        attackBonus: 0
      });
    } else {
      lines.push(say(`<em>No ally within ${rangeFeet} ft, and the row offers no fallback.</em>`));
    }
  }

  /* ── the Level DC (Hard) save ──────────────────────────────────── */
  const save = levelDCSaveRider(effect);
  if (save) {
    const level = Number(actor.system?.identity?.level ?? 1);
    flags.fumbleLevelDCSave = {
      save: save.save,
      scope: save.scope,
      dc: fumbleSaveDC(level),
      damageType: weaponDamageType(weapon) || "bludgeoning",
      actorHandle: actorHandle(actor, actor?.token ?? actor?.getActiveTokens?.()?.[0] ?? null)
    };
    lines.push(say(
      `<button type="button" data-action="fumbleLevelDCSave" style="width:100%">`
      + `${save.scope === "everyone" ? "Everyone in reach" : actor.name}: `
      + `${save.save === "reflex" ? "Reflex" : save.save === "will" ? "Will" : "Fortitude"} save `
      + `(DC ${fumbleSaveDC(level)} — Level DC, Hard)</button>`));
  }

  /* ── "until you spend 2 Interact actions to free yourself" ─────── */
  const { untilInteractRider } = await import("./fumble-riders.mjs");
  const escape = untilInteractRider(effect);
  if (escape) {
    flags.fumbleInteractEscape = {
      interacts: escape.interacts,
      frees: escape.frees,
      actorHandle: actorHandle(actor, actor?.token ?? actor?.getActiveTokens?.()?.[0] ?? null)
    };
    lines.push(say(
      `<button type="button" data-action="fumbleInteractEscape" style="width:100%">`
      + `Spend ${escape.interacts} Interact actions to free yourself`
      + `${escape.frees ? ` — clears ${CONDITIONS[escape.frees]?.label ?? escape.frees}` : ""}</button>`));
  }

  /* ── "until healed" (R15) ──────────────────────────────────────── */
  const untilHealed = untilHealedConditions(effect);
  if (untilHealed.length) {
    lines.push(say(
      `<em><strong>${untilHealed.map((key) => CONDITIONS[key]?.label ?? key).join(", ")}</strong> `
      + "lasts until healed — it has no clock and will not expire on its own.</em>"));
  }

  return flags;
}
