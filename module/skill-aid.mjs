/**
 * Aid Another, for skill checks — who receives the bonus, and what it is.
 *
 * NEW at 3.380.0, and it exists because the action was a CALCULATOR.
 *
 * `rollAidAnother` asked which skill and what the lead's DC was, rolled,
 * and posted a card. It never named an ally and never applied anything to
 * anyone: no recipient, no stored bonus, nothing recorded about which
 * check it was for. A player read the number off the card and typed it in
 * by hand, or forgot. Chapter 4 says the result "becomes a circumstance
 * bonus to the lead's roll", and it became nothing.
 *
 * The COMBAT form — Aid Defensive and Aid Offensive — has done this
 * properly for some time: it picks an ally off the canvas and writes a
 * scoped effect onto that ally's own actor. So the machinery for handing
 * a scoped bonus to somebody else already existed; it was simply wired to
 * attack and defence checks and not to skill checks.
 *
 * WHAT THIS DOES NOT DO, deliberately: it does not invent a second
 * storage mechanism. The grant is delivered through `pending-modifiers`,
 * which already exists for exactly this shape of problem — a scoped
 * number waiting for the roll it belongs to, offered in that roll's
 * dialog with its wording shown verbatim. That module's own header makes
 * the argument better than this one could: the number, its type and its
 * existence are not judgement calls, and those are what was being lost;
 * whether it applies to THIS roll is the one thing a person should decide.
 *
 * AID CAN HURT. The Bonus Check Table runs from +4 down to -2, so a
 * fumbled Aid hands the lead a penalty. That is the half a calculator
 * lets everyone quietly forget, and it is applied here on the same terms
 * as the bonus.
 */

import { bonusCheckModifier } from "./dice/resolution.mjs";

/**
 * Who can receive a skill Aid bonus.
 *
 * TWO POOLS, IN ORDER, because skill Aid is not a combat action and the
 * combat form's canvas-only picker would come up empty for two characters
 * helping each other in a library. An empty picker that silently grants
 * nothing is the exact defect this module exists to remove, so a fallback
 * matters more here than tidiness.
 *
 * @param {object} options
 * @param {Array<{id: string, name: string}>} [options.sceneAllies]
 *   Same-side tokens' actors on the current scene.
 * @param {Array<{id: string, name: string}>} [options.partyCharacters]
 *   Player characters, used when the scene offers nobody.
 * @param {string} options.selfId The aiding actor — never aids themselves.
 * @returns {{candidates: Array<object>, source: string, reason: string|null}}
 */
export function aidRecipientPool({ sceneAllies = [], partyCharacters = [], selfId = "" } = {}) {
  const notSelf = (list) => (Array.isArray(list) ? list : [])
    .filter((a) => a && a.id && a.id !== selfId);
  // De-duplicated by id: the same actor can be both a token on the scene
  // and a party character, and offering them twice looks like a bug.
  const unique = (list) => {
    const seen = new Set();
    return list.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  };

  const onScene = unique(notSelf(sceneAllies));
  if (onScene.length) return { candidates: onScene, source: "scene", reason: null };

  const party = unique(notSelf(partyCharacters));
  if (party.length) return { candidates: party, source: "party", reason: null };

  return {
    candidates: [],
    source: "none",
    reason: "there is nobody to aid — no allies on this scene and no other player characters"
  };
}

/**
 * The grant a rolled Aid produces, or null when it produces nothing.
 *
 * @param {object} options
 * @param {string} options.degree The degree key rolled.
 * @param {string} options.skillLabel The skill Aided with.
 * @param {string} [options.purpose] What the lead is attempting, in the
 *   player's own words. Carried into the scope verbatim.
 * @param {string} [options.aiderName]
 * @returns {{value: number, type: string, label: string, scope: string,
 *   oneShot: boolean, helpful: boolean}|null}
 */
export function aidGrant({ degree, skillLabel, purpose = "", aiderName = "An ally", boost = null } = {}) {
  let value = bonusCheckModifier(String(degree ?? "").trim().toLowerCase());
  // A plain failure is the one outcome that grants nothing at all. It
  // must return null rather than a zero-valued entry, or the lead's roll
  // dialog fills with rows worth nothing that they still have to read.
  if (!value) return null;
  // A HELPFUL AID MADE MORE SO (3.625.0): Pillars of Faith's Practical
  // Counsel — "If you achieve at least a Success on the Aid check, increase
  // the circumstance bonus granted by 1, to a maximum of +4." Only a bonus
  // grows; a fumble's penalty is left alone. See `aidBoosts`.
  const success = ["success", "critical", "heroic"].includes(String(degree ?? "").trim().toLowerCase());
  if (success && value > 0 && boost && boost.value > 0) value = Math.min(boost.max, value + boost.value);

  const skill = String(skillLabel ?? "a skill").trim() || "a skill";
  const what = String(purpose ?? "").trim();
  // THE SCOPE IS THE RULE. `pending-modifiers` shows this string verbatim
  // in the lead's roll dialog, and it is the only thing telling them
  // which check it belongs to — the module's own header is emphatic that
  // paraphrasing the scope is what introduces the error.
  const scope = what
    ? `The ${skill} check to ${what} that ${aiderName} aided`
    : `The ${skill} check ${aiderName} aided`;

  return {
    value,
    type: "circumstance",
    label: `Aid Another (${aiderName})`,
    scope,
    oneShot: true,
    helpful: value > 0
  };
}

/**
 * INNATE TEAMWORK (Racial, Chapter 5): "When you Aid an ally at a
 * non-attack skill check... After successfully aiding one ally, you
 * possess the ability to extend your aid to additional allies who make
 * the same skill check for the same purpose within the same round."
 *
 * NEW at 3.380.0, and only buildable now: until this release the thing it
 * extends delivered nothing to anybody.
 *
 * "AFTER SUCCESSFULLY AIDING" IS A GATE, and the sharp edge of the whole
 * feat. The Bonus Check Table hands out a PENALTY on a fumble or blunder,
 * and this must not spread that around the party. Only a grant that
 * actually helped may be extended.
 *
 * The skill Aid this hangs off is by definition a non-attack check — the
 * Attack-trait Aids are Aid Defensive and Aid Offensive, which are a
 * separate pair of Basic Actions and do not come through here — so the
 * feat's "non-attack" clause needs no test of its own.
 *
 * @param {object} options
 * @param {string[]} [options.featNames]
 * @param {object|null} [options.grant] From `aidGrant`.
 * @returns {boolean}
 */
export function innateTeamworkExtends({ featNames = [], grant = null } = {}) {
  const owns = (Array.isArray(featNames) ? featNames : [])
    .some((n) => String(n ?? "").trim().toLowerCase() === "innate teamwork");
  if (!owns) return false;
  return Boolean(grant?.helpful);
}

/**
 * The Aid boost the aider's effects declare (3.625.0), or null:
 *   flags["trg-prime"].aidBoost = { label: "Practical Counsel", value: 1, max: 4 }
 * The largest boost wins; they do not stack.
 */
export function aidBoosts(effects = []) {
  let best = null;
  for (const effect of effects ?? []) {
    if (!effect || effect.disabled) continue;
    const raw = effect.flags?.["trg-prime"]?.aidBoost;
    if (!raw || typeof raw !== "object") continue;
    const value = Math.max(0, Math.floor(Number(raw.value) || 0));
    if (!value) continue;
    const boost = { label: String(raw.label ?? effect.name ?? "Aid"), value, max: Math.max(value, Math.floor(Number(raw.max) || 0) || 99) };
    if (!best || boost.value > best.value) best = boost;
  }
  return best;
}
