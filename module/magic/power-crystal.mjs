/**
 * POWER CRYSTAL — power points you can hold in your hand (3.594.0).
 *
 * Page 306, PP 2: "You create a small crystal of raw magical energy…
 * The crystal 'contains' 1 PP, which any character holding it can use as
 * if it was part of their PP reserve. The crystal dissolves into
 * nothingness when the Duration expires or when all the PPs it contains
 * are used up." Warp: "+1 PP: increase the PPs contained by 1."
 *
 * Graham, 25 September 2026: "R8. Please build in full."
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE CRYSTAL IS DERIVED AND NOT SPENT.
 *
 * The obvious build intercepts spending: find every place that takes
 * power points and teach each one to check the caster's pockets first.
 * There are EIGHT writers of `system.resources.pp.value` in this system
 * — the cast workflow alone has four — and a ninth will be added by
 * somebody who has never heard of this spell. `pending-cast-workflow`
 * settled this argument for hit points already, and the reasoning
 * carries word for word: hooking the pipeline "would have meant finding
 * every entrance and being wrong about one".
 *
 * So nothing intercepts anything. A held crystal raises the holder's PP
 * MAXIMUM, which makes its points part of the pool in the most literal
 * sense the data model allows — "as if it was part of their PP reserve"
 * is the page's own phrasing, and this is that sentence as arithmetic.
 * Every existing spender then draws on it without knowing it exists.
 *
 * CRYSTAL POINTS ARE SPENT FIRST, and the crystal's own flag is what
 * records how many are left. It does NOT infer that from where the pool
 * is resting, and the first draft of this file did — which was wrong, and
 * wrong in a way only a live drive found (3.594.1, 26 September 2026).
 *
 * The inference was "the crystal's share is the top of the pool, so what
 * remains is however far the value stands above the holder's own
 * maximum". That is true for a holder at FULL pool and false for
 * everybody else: a caster at 3 of 56 who gains a 3 PP crystal stands 53
 * BELOW their own maximum, so the arithmetic reads the crystal as already
 * empty and the next pool update dissolves it — with a card announcing
 * that its points were spent. Measured in Graham's world: he would have
 * paid 2 PP for a rock that vanished without ever being usable.
 *
 * Raising the value on creation does not rescue it either; 6 is still
 * below 56. The resting position simply cannot tell "below my own
 * maximum" from "crystal used up", and most casters are below their own
 * maximum most of the time.
 *
 * So the SPEND is watched instead of the position: a decrease in the pool
 * draws on crystals first, up to what they hold, and an increase leaves
 * them alone — a rest does not refill a crystal that was emptied.
 *
 * AND IT TRAVELS. Because the pool is derived from the items a creature
 * is carrying, handing the crystal to somebody else moves its points
 * with it — which the page requires ("any character holding it") and
 * which a flag written onto one actor could not do.
 */

const SYSTEM_ID = "trg-prime";

/** Where a crystal keeps what it holds. */
export const CRYSTAL_FLAG = "powerCrystal";

const int = (v) => Math.trunc(Number(v) || 0);

/**
 * The power points this item holds, or 0 if it is not a crystal.
 *
 * @param {object} item an Item document or its source object
 * @returns {number}
 */
export function crystalPoints(item) {
  const flags = item?.flags?.[SYSTEM_ID] ?? item?.system?.flags?.[SYSTEM_ID] ?? null;
  const held = flags?.[CRYSTAL_FLAG];
  /*
   * NO `typeof` GUARD. One was written here and taken out again: a flag
   * holding 5, "abc" or [3] all answer `undefined` for `.pp`, which
   * `int` turns into 0 — so the guard could not change a single answer,
   * and the mutation that removed it changed nothing. An `if` that
   * cannot be false is a reassurance nothing has earned, which is the
   * position `qualityGrantFor` reached at 3.591.0 for the same reason.
   */
  return Math.max(0, int(held?.pp));
}

/**
 * What every crystal a creature is carrying adds up to.
 *
 * @param {Iterable} items the actor's items
 * @returns {number}
 */
export function crystalTotal(items) {
  let total = 0;
  for (const item of items ?? []) total += crystalPoints(item);
  return Math.max(0, total);
}

/**
 * How much of a spend the crystals pay for.
 *
 * WATCHES THE CHANGE, not the resting position — see the header for the
 * live failure that taught this. Only a DECREASE draws on them: a rest,
 * a refund or a modifier raising the pool leaves a crystal alone, because
 * points already spent out of one do not come back.
 *
 * @param {number} before the pool before the change
 * @param {number} after the pool after it
 * @param {number} total what the crystals hold between them
 * @returns {number} how much of that total this spend consumes
 */
export function crystalDraw(before, after, total) {
  const held = Math.max(0, int(total));
  /*
   * NO `held === 0` SHORT-CIRCUIT. One was written here and taken out:
   * `Math.min(0, spent)` is already 0, so the guard could not change an
   * answer — the third unfalsifiable `if` removed today, after the
   * `typeof` check above and `Math.max(0, qualityRank(from))`. The
   * `spent <= 0` line below is NOT of that kind: without it a rest
   * returns a negative draw.
   */
  const spent = int(before) - int(after);
  if (spent <= 0) return 0;
  return Math.min(held, spent);
}

/**
 * The pool a holder is left with when a crystal ARRIVES.
 *
 * THE OTHER HALF OF "AS IF IT WAS PART OF THEIR PP RESERVE", and it was
 * missing until the 3.594.1 live drive went looking for it (3.594.2).
 *
 * 3.594.1 raised the pool where the crystal was MADE, by hand, in the
 * spell applier — so a crystal was worth its points to its creator and
 * worth nothing at all to anybody they handed it to. Measured in Graham's
 * world: a holder at 20 of 90 received a 2 PP crystal, went to 20 of 92,
 * spent 3 PP, and the card announced that the crystal's 2 points had been
 * spent while their own reserve paid for all three. The page says "any
 * character HOLDING it", so arriving is the moment that matters, not being
 * conjured — and one rule on the arrival covers both, where a line in the
 * applier could only ever cover one.
 *
 * @param {number} value the pool before the crystal arrived
 * @param {number} max the maximum AFTER it arrived (it already counts it)
 * @param {number} points what the arriving crystal holds
 * @returns {number} the pool the holder should be left with
 */
export function crystalArrival(value, max, points) {
  return Math.min(int(max), int(value) + Math.max(0, int(points)));
}

/**
 * The pool a holder is left with when a crystal LEAVES with points in it.
 *
 * Expired, handed over, sold. Those points were in the pool — `crystalArrival`
 * put them there — so they go out with the stone, and the holder keeps every
 * point of their own. A PART-SPENT crystal takes only what is left in it.
 *
 * NOT A CLAMP, which is what 3.594.1 had. Clamping to the new maximum is the
 * right answer only for a holder who was resting at full pool: a caster at 30
 * of 67 who hands over a 2 PP crystal has a new maximum of 65, is already
 * below it, and so kept both points while the crystal took them to its next
 * holder as well. Two points minted by a hand-over.
 *
 * @param {number} value the pool before the crystal left
 * @param {number} points what it still held
 * @returns {number} the pool the holder should be left with
 */
export function crystalDeparture(value, points) {
  return Math.max(0, int(value) - Math.max(0, int(points)));
}

/**
 * Which crystals to draw down, and by how much.
 *
 * SMALLEST FIRST, so a spend empties and clears one crystal rather than
 * leaving several part-used. A player carrying three singles and a four
 * should finish with the four intact, not with four crumbs.
 *
 * @param {Array<{id: string, pp: number}>} crystals what is held
 * @param {number} spent how much of the crystal total has gone
 * @returns {Array<{id: string, from: number, to: number, gone: boolean}>}
 */
export function drawFromCrystals(crystals, spent) {
  let owed = Math.max(0, int(spent));
  const order = (Array.isArray(crystals) ? crystals : [])
    .map((c) => ({ id: String(c?.id ?? ""), pp: Math.max(0, int(c?.pp)) }))
    .filter((c) => c.id && c.pp > 0)
    .sort((a, b) => a.pp - b.pp || a.id.localeCompare(b.id));
  const out = [];
  for (const c of order) {
    if (owed <= 0) break;
    const take = Math.min(c.pp, owed);
    owed -= take;
    out.push({ id: c.id, from: c.pp, to: c.pp - take, gone: c.pp - take === 0 });
  }
  return out;
}

/** The line the card prints when a crystal is made. */
export function crystalLine(points, holderName) {
  return `<strong>${holderName}</strong> holds a <strong>Power Crystal</strong> containing `
    + `<strong>${points} PP</strong> &mdash; usable as part of their own reserve, and spent first. `
    + "It dissolves when emptied, or when the spell ends.";
}

/** The line the card prints when one is used up. */
export function crystalSpentLine(holderName, points) {
  return `<strong>${holderName}</strong>&rsquo;s Power Crystal dissolves &mdash; `
    + `its ${points === 1 ? "point is" : `${points} points are`} spent.`;
}
