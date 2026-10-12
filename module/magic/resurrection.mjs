/**
 * WHAT COMING BACK COSTS (3.602.0).
 *
 * Graham's R6 of block 31, 26 September 2026: "Build."
 *
 * PRINTED (Resurrection, page 311), PP 12, 10 minutes, a dead creature of
 * 12th level or lower, dead no longer than 7 days:
 *
 *   "the character is restored to life with 1 Hit Point, 0 Power Points, NO
 *   POINTS IN ANY POOLS OR ANY OTHER DAILY RESOURCES, and still with any
 *   long-term debilitations of the old body."
 *   "if the spell check fails, IT CANNOT BE ATTEMPTED AGAIN ON THE SAME
 *   TARGET."
 *   "giving it the injured 2 condition for 1 week; this condition CANNOT BE
 *   REMOVED OR REDUCED BY ANY MEANS."
 *   "the targets Death State is REDUCED BY 1 EACH TIME it occurs. If a
 *   targets Death State is reduced to 0, their soul is destroyed or
 *   corrupted (GM discretion)."
 *
 * The pack entry carried `effects: []`. Four automatable consequences, none
 * of them automated, on the spell whose whole point is that it is expensive.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE POOLS, NAMED RATHER THAN GUESSED AT.
 *
 * "No points in any pools or any other daily resources" is a sentence about a
 * character sheet, so the sheet decides what it means. This system's creature
 * template carries seven: `hp`, `pp`, `endeavour`, `conviction`, `luck`, `ap`
 * and `reactions`.
 *
 * FOUR ARE EMPTIED AND THREE ARE NOT. HP is set to 1 and PP to 0 because
 * the page says those numbers; endeavour and conviction are pools that refill
 * on a daily cycle and so are emptied. AP and reactions are refilled every
 * TURN, not every day — emptying them would mean a creature raised in combat
 * could not act until its next turn, which is a rule the page does not
 * contain and a punishment it does not name.
 *
 * LUCK IS LEFT ALONE (3.624.0, block 40's R17). It never refills on a daily
 * cycle, it belongs to the player rather than the character (Appendix 5),
 * and 0 sat below the page's own floor of 2.
 *
 * ─────────────────────────────────────────────────────────────────────
 * DEATH STATE IS THE ONE PERMANENT THING HERE.
 *
 * `system.combat.deathState` is real and read by `dyingIsFatal`, the coup de
 * grace and the dying workflow — it is how many dying steps a creature can
 * take before it is gone. Reducing it is the most consequential write this
 * project has ever made from a spell, and it is the reason the card names the
 * old value and the new one every time.
 */

const int = (v) => Math.trunc(Number(v) || 0);

/** The flag recording that Resurrection has already failed on this creature. */
export const FAILED_FLAG = "resurrectionFailed";

/**
 * The canonical values, frozen so nothing can edit the rule itself.
 *
 * PRIVATE. Callers never receive this object — see below for why.
 */
const RESTORED_POOLS = Object.freeze({
  "system.resources.hp.value": 1,
  "system.resources.pp.value": 0,
  "system.resources.endeavour.value": 0,
  "system.resources.conviction.value": 0
});

/**
 * The pools a returned creature holds, as dotted update keys.
 *
 * RETURNS THE UPDATE, not the actor, so the harness can read exactly what
 * would be written. `hp` and `pp` carry the page's own numbers; the three
 * daily pools are emptied; AP and reactions are deliberately absent.
 *
 * ─────────────────────────────────────────────────────────────────────
 * A FRESH, EXTENSIBLE COPY EVERY CALL — and 3.602.0 shipped without one.
 *
 * This used to return the frozen object itself. `Actor#update` WRITES to the
 * update it is handed (it adds `_id`), so handing it a frozen object threw
 * "Cannot add property _id, object is not extensible" — and it threw AFTER the
 * applier had already cleared dead, dying and unconscious. The live test found
 * a creature pulled out of Dead with 0 Hit Points, no injury, no Death State
 * cost and none of its pools emptied: every consequence of the spell skipped,
 * and the corpse standing up for free.
 *
 * The freeze was right; giving it away was not. The canonical values stay
 * frozen where nothing can reach them, and every caller gets its own copy that
 * Foundry is free to scribble on. There is no longer a way to call this wrongly,
 * which is worth more than a comment telling the next call site to spread it.
 */
export function restoredResourceUpdate() {
  return { ...RESTORED_POOLS };
}

/** The pools this rule deliberately leaves alone, and why — for the card. */
/**
 * THE CONDITIONS OF DEATH, IN THE ORDER THEY ARE CLEARED (3.624.1; the
 * 3.624.0 drive's F1, Graham's R1).
 *
 * DEAD GOES LAST. Removing an effect fires the death watch
 * (combat/death-watch-workflow.mjs), which asks `isDead` and puts Dead back
 * on anything that still meets it. The old order cleared Dead first, while
 * Dying 7 still stood against a Death State of 5 — so a creature that died
 * by Dying was reaped again the instant it was raised, and stayed Dead with
 * 1 Hit Point. With Dying and Unconscious gone first, the watch finds a
 * living creature when Dead is removed.
 */
export const DEATH_CONDITIONS_CLEARED = Object.freeze(["bleeding", "dying", "unconscious", "dead"]);

/*
 * …AND THE BLEEDING THAT KILLED IT (3.624.2; the 3.624.1 drive's O1,
 * Graham's R1). A ZZ Fighter died of a severed leg and came back with its
 * Bleeding 4 still on it — at 1 Hit Point, one bleed tick from Dying again.
 * Bleeding is the death's ongoing damage, not one of the "long-term
 * debilitations of the old body" the page keeps; those are the week of
 * Injured 2 below. First in the list, where removing it changes nothing the
 * death watch asks.
 */

/** What the card says when the bleeding stops. */
export function bleedingStoppedLine(targetName) {
  return `The bleeding that killed <strong>${targetName}</strong> stops — it is the death's own damage, not a debilitation the body keeps.`;
}

export const POOLS_LEFT_ALONE = Object.freeze(["ap", "reactions"]);

/**
 * The Death State after one return, floored at zero.
 *
 * FLOORED, because a negative Death State is not a worse fate than a
 * destroyed soul — it is a number nothing reads correctly. Zero is where the
 * page stops, so zero is where this stops.
 */
export function deathStateAfterReturn(current) {
  return Math.max(0, int(current) - 1);
}

/** "If a targets Death State is reduced to 0, their soul is destroyed." */
export function soulIsDestroyed(next) {
  return int(next) <= 0;
}

/** Has Resurrection already failed on this creature? */
export function resurrectionRefused(record) {
  return Boolean(record);
}

/**
 * Does a FAILED check on this spell close the door on its target for ever?
 *
 * ASKED OF THE EFFECT LIST, not of the spell's name — the same shape
 * `spellDefersItsSave` takes, and for the same reason: a later spell with the
 * same clause answers without this file learning its name.
 *
 * THIS HAS TO LIVE OUTSIDE THE EFFECT APPLIER. The applier runs only when the
 * cast SUCCEEDS, and the whole point of this rule is what happens when it does
 * not — so the cast workflow asks the question on the failure branch.
 */
export function spellFailureIsFinal(effects) {
  return (Array.isArray(effects) ? effects : []).some((e) => e?.kind === "resurrect");
}

/* ═════════════════════════════════════════════════════════════════════
 * THE CARD
 * ═══════════════════════════════════════════════════════════════════ */

/** What the card says when the spell may not even be attempted. */
export function alreadyFailedLine(targetName) {
  return `<em>Resurrection has already failed on ${targetName} — it cannot be attempted again on the `
    + "same target.</em>";
}

/** And when a failed check closes the door. */
export function failureClosesLine(targetName) {
  return `<strong>The spell check fails.</strong> Resurrection can never be attempted on `
    + `<strong>${targetName}</strong> again.`;
}

/** What the card says about the body that came back. */
export function restoredLine(targetName) {
  return `<strong>${targetName}</strong> is restored to life with <strong>1 Hit Point</strong>, `
    + "<strong>0 Power Points</strong> and nothing in any daily pool — endeavour and conviction "
    + "are spent. Luck is the player's and is untouched; so are action points and reactions, "
    + "which refill each turn, not each day.";
}

/** And about the week it takes to stop being dead. */
export function debilitatedLine(targetName, remaining) {
  return `<strong>${targetName}</strong> is <strong>Injured 2</strong> for ${remaining}, and it `
    + "<strong>cannot be removed or reduced by any means</strong> — no Restoration, no item, no "
    + "rest. (A GM may still clear it by hand; the seal is a rule about the fiction, not about "
    + "the table.)";
}

/** And the permanent cost. */
export function deathStateLine(targetName, was, now) {
  return `<strong>${targetName}</strong>'s Death State falls from <strong>${was}</strong> to `
    + `<strong>${now}</strong> — being restored to life is traumatic, and this does not come back.`;
}

/** And the end of the road. */
export function soulDestroyedLine(targetName) {
  return `<strong>${targetName}</strong>'s Death State has reached <strong>0</strong>: their soul is `
    + "<strong>destroyed or corrupted</strong>. What that means is the GM's to decide — the spell "
    + "has nothing further to say.";
}

/** And the halves the spell leaves to the table. */
export function judgedAtTheTableLine() {
  return "<em>Judged at the table: whether the body is whole and present, whether the soul is free "
    + "and willing, how long they have been dead, the gemstones worth 200 gp × level, and the "
    + "personality or appearance change a returned character often carries.</em>";
}

/* ═════════════════════════════════════════════════════════════════════
 * A SOUL SOMETHING ELSE DESTROYED (3.606.0, block 32's R1)
 * ═══════════════════════════════════════════════════════════════════ */

/**
 * SOUL DESTRUCTION, Fumble (page 327): "The target dies and their soul is
 * destroyed, making resurrection impossible (GM discretion)."
 *
 * A SEPARATE FLAG FROM `FAILED_FLAG`, deliberately. That one records that
 * THIS spell was tried and failed, and its refusal says so — "a previous
 * Resurrection failed". Reusing it would print a history that never
 * happened on a body nobody has tried to raise.
 *
 * A REFUSED RESURRECTION STILL COSTS ITS PP. Graham's ruling, 30 September
 * 2026, on the question the 3.606.0 live test raised: "A refused Resurrection
 * should still cost the PP." Which is what happens — the casting has paid
 * by the time the applier reaches this refusal — so the ruling confirms the
 * behaviour rather than changing it. Nothing here refunds, and nothing should.
 *
 * "(GM DISCRETION)" IS READ AS: THE SPELL REFUSES, AND SAYS WHY, AND THE GM
 * MAY OVERRULE IT. The refusal names the spell that destroyed the soul
 * and how to lift it — clear the flag — because a table that decides this
 * soul is corrupted rather than gone must not have to fight the system to
 * say so. Ruled that way pending Graham's word; see the 3.606.0 notes.
 */
export const SOUL_DESTROYED_FLAG = "soulDestroyed";

/** The record written onto the body. */
export function soulDestroyedRecord(spellName, worldTime) {
  return { by: String(spellName ?? "").trim() || "a spell", at: Math.trunc(Number(worldTime) || 0) };
}

/** Is this body's soul gone? A record present is the whole answer. */
export function soulIsGone(record) {
  return Boolean(record && typeof record === "object" && String(record.by ?? "").trim());
}

/** What the card says at the moment the soul is destroyed. */
export function soulDestroyedByLine(targetName, spellName) {
  return `<strong>${targetName}</strong>'s soul is <strong>destroyed</strong> by ${spellName} — `
    + "resurrection is impossible (GM discretion).";
}

/** And what Resurrection says when it meets that body later. */
export function soulGoneRefusalLine(targetName, record) {
  return `<strong>${targetName}</strong> cannot be resurrected: their soul was destroyed by `
    + `<strong>${String(record?.by ?? "a spell")}</strong>. <em>GM discretion — clear the `
    + "“soulDestroyed” flag on the body to allow it.</em>";
}
