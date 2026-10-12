/**
 * A PENALTY THAT ONLY BITES AGAINST ONE NAMED CREATURE.
 *
 * NEW at 3.415.0. Pure; no Foundry. The mirror of `ward.mjs`.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE SENTENCE THIS EXISTS FOR.
 *
 *   ENCHANTING UTTERANCE, on a successful Will save:
 *   "The target suffers a -1 circumstance penalty to attack rolls and a
 *    -1 penalty to damage rolls AGAINST YOU."
 *
 * A ward is carried by the DEFENDER and asks "who is attacking me". This
 * is carried by the ATTACKER and asks "who am I attacking" — the same
 * uuid scoping read from the other end, which is why it is a sibling
 * rather than a special case of the other.
 *
 * The distinction is the whole spell. A -1 that applied to every swing
 * the enemy made would be a general debuff; the book gives a penalty
 * that vanishes the moment they turn on somebody else, and expressing
 * that difference is the entire reason `targetUuids` was built.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ONE CHANNEL, NOT TWO — AND WHY THAT MATTERS HERE.
 *
 * `ward.mjs` had to write two flags for one sentence, because DB is a
 * static number an attacker rolls against while saves are rolls the
 * defender makes. A hindrance has no such split: attack rolls and damage
 * rolls are both rolls the hindered creature makes, so both go down the
 * conditional engine and there is only one place for them to disagree —
 * which is none.
 *
 * That is worth stating because ward's two-channel split is exactly what
 * hid a nine-release defect: the DB half worked, the save half never
 * did, and each half was individually perfect. See conditionals.mjs.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `auto`, AND ONLY BECAUSE THE SCOPE IS EXACT.
 *
 * The same test ward applies: a conditional may resolve itself only when
 * the check's own identity settles the question with nothing left for a
 * person to judge. "Is this attack aimed at THAT creature" is true or
 * false, never a reading — so it applies without being asked, which is
 * essential, because the alternative is the roll-configuration dialog and
 * a great many attacks never open one.
 */

/**
 * The rolls a hindrance can cover.
 *
 * NOT EXPORTED: nothing outside this file needs the list, and an export
 * nobody calls is a well-tested opinion rather than automation. Ward
 * exports its equivalent and it has sat in the uncalled backlog ever
 * since; one of those is enough.
 */
const HINDER_SLOTS = Object.freeze(["attack", "damage"]);

/** Is this a roll a hindrance knows how to reach? Local, as above. */
function isHinderSlot(slot) {
  return HINDER_SLOTS.includes(String(slot ?? "").trim().toLowerCase());
}

/**
 * The slots one hindrance covers.
 *
 * AN EFFECT THAT DECLARES NOTHING COVERS BOTH, for the reason ward gives:
 * the sentence that needed this file names attack and damage together,
 * and making every author retype the pair is two chances to drop one.
 */
export function hinderSlots(effect) {
  const raw = effect?.slots;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((s) => String(s ?? "").trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [...HINDER_SLOTS];
}

/** Any slot on this effect that is not a roll a hindrance can reach. */
export function unknownHinderSlots(effect) {
  return hinderSlots(effect).filter((slot) => !isHinderSlot(slot));
}

const cleanUuids = (uuids) => (Array.isArray(uuids) ? uuids : uuids ? [uuids] : [])
  .map((u) => String(u ?? "").trim())
  .filter(Boolean);

/**
 * The conditional entries for one hindrance.
 *
 * @param {object} options
 * @param {number} options.value the penalty, normally NEGATIVE
 * @param {string} options.bonusType Appendix-1 pool
 * @param {string} options.label what the card and the roll call it
 * @param {string[]} options.targetUuids the creature(s) it bites against
 * @param {string[]} [options.slots]
 * @returns {object[]} conditionals to write onto the hindered creature
 */
export function hinderFlagData({ value, bonusType, label, targetUuids, slots } = {}) {
  const amount = Math.trunc(Number(value) || 0);
  const type = String(bonusType ?? "circumstance").trim().toLowerCase() || "circumstance";
  const name = String(label ?? "Hindered");
  const against = cleanUuids(targetUuids);
  const covered = hinderSlots({ slots }).filter(isHinderSlot);

  // A HINDRANCE AGAINST NOBODY IS NOT A HINDRANCE. Writing an unscoped
  // entry would apply the penalty to every roll the creature makes,
  // which is Stone Shield's defect with the sign flipped — the same
  // mistake, the same silence, and a strictly worse spell rather than a
  // strictly better one.
  if (!amount || !against.length || !covered.length) return [];

  return covered.map((slot) => ({
    kind: "modifier",
    value: amount,
    type,
    label: name,
    scope: `against the named creature`,
    // AUTO for the reason in the header: the scope is exact, and a great
    // many attacks never open a dialog to be asked in.
    auto: true,
    when: { checkTypes: [slot], targetUuids: against }
  }));
}

/**
 * Do the entries of one written hindrance still describe one rule?
 *
 * Ward needs this because its halves live in two engines. This one does
 * not — every entry goes down the same channel — so the question here is
 * narrower and still worth asking: a later author adding a third slot
 * must not be able to give it a different value or a different scope
 * from the two beside it.
 *
 * @param {object[]} entries
 * @returns {string[]} the disagreements, empty when consistent
 */
export function hinderEntriesDisagree(entries) {
  const list = Array.isArray(entries) ? entries : [];
  const problems = [];
  if (list.length < 2) return problems;

  const [first] = list;
  for (const other of list.slice(1)) {
    if (other.value !== first.value) {
      problems.push(`value: ${first.when?.checkTypes?.[0]} ${first.value} vs ${other.when?.checkTypes?.[0]} ${other.value}`);
    }
    if (other.type !== first.type) {
      problems.push(`type: "${first.type}" vs "${other.type}"`);
    }
    const a = cleanUuids(first.when?.targetUuids).join("|");
    const b = cleanUuids(other.when?.targetUuids).join("|");
    if (a !== b) problems.push(`scope: [${a}] vs [${b}]`);
  }
  return problems;
}
