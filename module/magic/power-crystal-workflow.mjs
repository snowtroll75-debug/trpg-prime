/**
 * POWER CRYSTAL — the two moments the pool and the pocket must agree
 * (3.594.0). See magic/power-crystal.mjs for why the crystal is derived
 * into the maximum rather than intercepting anybody's spending.
 *
 * Deriving the points is most of the work, and it is the half that needs
 * no code here: raising `resources.pp.max` makes every existing spender
 * draw on a crystal without knowing it exists. What is left is the two
 * moments where the arithmetic and the item would otherwise drift apart.
 *
 *   HELD. A crystal arrives — conjured, handed over, bought — and its
 *         points join the pool it has just raised the ceiling of.
 *   SPENT. The pool falls; the crystals that paid for it have to go.
 *   GONE.  A crystal leaves with points still in it, and they go with it.
 *
 * ARRIVING IS A HOOK AND NOT A LINE IN THE SPELL APPLIER (3.594.2). It was
 * a line in the applier at 3.594.1, which is why a crystal was worth its
 * points to the caster who made it and worth nothing to anybody they gave
 * it to — "any character holding it" cannot be honoured at the one moment
 * a single character is holding it. See power-crystal.mjs for what that
 * looked like in Graham's world.
 *
 * ONE HOOK EACH, AND EACH ON ONE CLIENT: two clients racing to delete the
 * same crystal would have one of them delete a document that is already
 * gone, and the second failure is noisier than the first.
 *
 * WHICH CLIENT IS NOT THE SAME QUESTION FOR ALL THREE (3.685.3). All three
 * asked `game.user.isGM` until then, and that was wrong two different ways:
 *
 *   HELD, GONE  `createItem` and `deleteItem` fire on EVERY connected
 *               client, so with two GMs both settled the pool, and a crystal
 *               could be counted in or taken out twice. They now ask
 *               `isActingGM()`, the one GM Foundry designates.
 *   SPENT       `preUpdateActor` fires ONLY on the client that made the
 *               update — there is nothing to de-duplicate. Asking `isGM`
 *               there meant a spend a player made on their own client (a
 *               cast, a sustain, a feat) never drew a crystal down: the
 *               hook ran, on the player's client, and returned. It now asks
 *               whether this client owns the actor, which is exactly what
 *               the settlement's writes need — the crystals are that
 *               actor's own items, and the card is an ordinary chat message.
 */

import { isActingGM } from "../acting-gm.mjs";

import {
  CRYSTAL_FLAG, crystalArrival, crystalDeparture, crystalDraw, crystalPoints, crystalSpentLine,
  crystalTotal, drawFromCrystals
} from "./power-crystal.mjs";

const SYSTEM_ID = "trg-prime";

/** The crystals a creature is carrying, as the draw-down rule wants them. */
function heldCrystals(actor) {
  return Array.from(actor?.items ?? [])
    .map((item) => ({ id: item.id, pp: crystalPoints(item) }))
    .filter((c) => c.pp > 0);
}

/**
 * ONE SETTLEMENT AT A TIME, PER CREATURE (3.685.3).
 *
 * A cast and its surcharge write the pool twice in a row
 * (cast-workflow's `casterPPSpent`, then `surcharge.pp`), so two
 * settlements are queued a moment apart. Each reads the crystal's points
 * from the local item, and a flag write does not change the local item
 * until the server answers. Run side by side, the second read the points
 * the first had not yet written, and wrote its own answer over the first:
 * a 3 PP crystal spent 2 and then 1 was left holding 2, not dissolved.
 *
 * So each settlement on this client waits for the last one on the same
 * creature to finish, every write awaited. Foundry's update promise
 * resolves after the local document has the change, so the next one
 * reads what the last one wrote. Arrival and departure queue on the same
 * line, so a GM's own sequence of the three cannot interleave either.
 *
 * A BOUNDED WAIT (3.685.3, the second review). A write that never comes
 * back — a dropped socket, a server that refused it silently — would hold
 * every later settlement for that creature on this client for ever. So the
 * queue waits at most `QUEUE_WAIT_MS` for the one before, then moves on and
 * says so in the console.
 */
const QUEUE_WAIT_MS = 10000;
const settling = new Map();
function waitBounded(before, label) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`TRG Prime | a Power Crystal settlement for ${label} did not finish in ${QUEUE_WAIT_MS / 1000} seconds; the next one goes ahead`);
      resolve();
    }, QUEUE_WAIT_MS);
    before.then(() => { clearTimeout(timer); resolve(); });
  });
}
function inTurn(actor, work) {
  const key = actor?.uuid ?? actor?.id ?? "";
  const before = settling.get(key);
  const gate = before ? waitBounded(before, actor?.name ?? key) : Promise.resolve();
  const run = gate
    .then(() => work())
    .catch((error) => { console.error("TRG Prime | Power Crystal settlement", error); return null; });
  settling.set(key, run);
  run.then(() => { if (settling.get(key) === run) settling.delete(key); });
  return run;
}

/**
 * THE DEPARTURE'S OWN WRITE IS NOT A SPEND (3.685.3). `settleCrystalDeparture`
 * takes a leaving crystal's points out of the pool with an ordinary update,
 * and `preUpdateActor` read that fall as a spend against the crystals still
 * held: own maximum 10, crystals of 3 and 2, pool 15 — the 3 expired, the
 * pool went to 12, and the 2 was drawn down and dissolved as well, leaving 12
 * over a maximum of 10. The write now carries this option and the spend hook
 * passes it by. The arithmetic is unchanged: 15 − 3 = 12, under the new
 * maximum of 12.
 */
const DEPARTURE_OPTION = "trgCrystalDeparture";

/**
 * Draw down the crystals a spend has just consumed.
 *
 * TAKES THE CHANGE, not the resting position. The first version read
 * where the pool had come to rest and worked out the crystal's share from
 * the holder's own maximum — which is correct only for a holder at FULL
 * pool, and dissolved every crystal handed to anybody else. See the
 * header of power-crystal.mjs for what that looked like in Graham's
 * world.
 *
 * @param {Actor} actor
 * @param {number} before the pool before this update
 * @param {number} after the pool after it
 */
async function settleCrystals(actor, before, after) {
  const total = crystalTotal(actor?.items ?? []);
  if (total <= 0) return null;

  const spent = crystalDraw(before, after, total);
  if (spent <= 0) return null;

  const draws = drawFromCrystals(heldCrystals(actor), spent);
  const emptied = draws.filter((d) => d.gone);
  const reduced = draws.filter((d) => !d.gone);

  for (const d of reduced) {
    await actor.items.get(d.id)?.setFlag(SYSTEM_ID, CRYSTAL_FLAG, { pp: d.to }).catch(() => {});
  }
  if (emptied.length) {
    /*
     * EMPTIED FIRST, THEN DISSOLVED. The flag is written to 0 before the
     * item goes, and that is not bookkeeping for its own sake: the
     * departure hook charges the holder for whatever a leaving crystal
     * still holds, and an emptied one holds nothing. Delete it with its
     * original points still on it and the holder pays for them twice —
     * once in the spend that emptied it, once on the way out.
     *
     * THE POINTS ARE ALREADY GONE FROM THE POOL — the holder spent them,
     * which is how we knew to delete these. So the value is NOT adjusted
     * here; only the maximum moves, and it moves because the item did.
     */
    for (const d of emptied) {
      await actor.items.get(d.id)?.setFlag(SYSTEM_ID, CRYSTAL_FLAG, { pp: 0 }).catch(() => {});
    }
    await actor.deleteEmbeddedDocuments("Item", emptied.map((d) => d.id)).catch(() => {});
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><p style="margin:2px 0">`
        + crystalSpentLine(actor.name, emptied.reduce((n, d) => n + d.from, 0))
        + "</p></div>"
    }).catch(() => {});
  }
  return { spent, emptied: emptied.length, reduced: reduced.length };
}

/**
 * A crystal has arrived, and its points join the pool.
 *
 * CONJURED, HANDED OVER, BOUGHT, LOOTED — one moment, one rule. The
 * maximum has already grown by what it holds (the derivation reads the
 * items), so all that is left is to put the points under that ceiling.
 */
async function settleCrystalArrival(actor, points) {
  const pp = actor?.system?.resources?.pp;
  if (!pp) return null;
  const value = Number(pp.value ?? 0);
  const raised = crystalArrival(value, Number(pp.max ?? 0), points);
  if (raised === value) return null;
  await actor.update({ "system.resources.pp.value": raised });
  return { from: value, to: raised };
}

/**
 * A crystal has left the sheet with points still in it.
 *
 * Expired, handed over, sold. Those points were in the pool, so they go
 * out with the stone and the holder keeps every point of their own.
 *
 * NOT A CLAMP. 3.594.1 clamped to the new maximum, which is the right
 * answer only for a holder resting at full pool — everybody else kept the
 * crystal's points AND passed them on. See power-crystal.mjs.
 *
 * NOTHING HAPPENS FOR AN EMPTIED CRYSTAL: `settleCrystals` writes its flag
 * to 0 before deleting it, so there is nothing left to take.
 */
async function settleCrystalDeparture(actor, points) {
  const pp = actor?.system?.resources?.pp;
  if (!pp) return null;
  const value = Number(pp.value ?? 0);
  const left = crystalDeparture(value, points);
  if (left === value) return null;
  await actor.update({ "system.resources.pp.value": left }, { [DEPARTURE_OPTION]: true });
  return { from: value, to: left };
}

/** Both moments, watched. */
export function registerPowerCrystalHooks() {
  /*
   * BOTH SIDES OF THE CHANGE, which is why this is `preUpdateActor` and
   * the first version's `updateActor` was wrong twice over: the change
   * has not landed yet, so the document still holds the value BEFORE it,
   * and the update itself carries the value after. Reading only the
   * resting position — which is all `updateActor` can offer — is what
   * made a crystal dissolve in the hand of anybody who was not at full
   * pool.
   *
   * THE CLIENT THAT MADE THE SPEND SETTLES IT (3.685.3). Foundry runs
   * `preUpdate*` on the requesting client only, so this runs once per
   * update with no guard at all; `isOwner` is not there to de-duplicate.
   * It states what the settlement needs: every write below is to this
   * actor's own items, so a client that owns the actor may make them, and
   * one that does not must not try. A GM owns every actor, so a GM's spend
   * — or a relay the GM writes for a player — settles as it always did.
   */
  Hooks.on("preUpdateActor", (actor, changed, options) => {
    if (!actor?.isOwner) return;
    if (options?.[DEPARTURE_OPTION]) return;
    const after = changed?.system?.resources?.pp?.value;
    if (after === undefined) return;
    const before = Number(actor.system?.resources?.pp?.value ?? 0);
    // Next tick, so the spend has landed before the crystals follow it
    // down and the card describes a pool that has already moved.
    globalThis.setTimeout(() => { inTurn(actor, () => settleCrystals(actor, before, Number(after))); }, 0);
  });

  // THE ACTING GM (3.685.3): this fires on every client.
  Hooks.on("createItem", (item) => {
    if (!isActingGM()) return;
    const points = crystalPoints(item);
    if (points <= 0) return;
    const actor = item.parent;
    if (!actor?.system?.resources?.pp) return;
    // Next tick, so the derived maximum already counts the crystal the
    // arriving points have to fit under.
    globalThis.setTimeout(() => { inTurn(actor, () => settleCrystalArrival(actor, points)); }, 0);
  });

  // THE ACTING GM (3.685.3): this fires on every client.
  Hooks.on("deleteItem", (item) => {
    if (!isActingGM()) return;
    const points = crystalPoints(item);
    if (points <= 0) return;
    const actor = item.parent;
    if (!actor?.system?.resources?.pp) return;
    // Next tick, so the actor's derived maximum has lost the crystal
    // before its points are taken out from under it.
    globalThis.setTimeout(() => { inTurn(actor, () => settleCrystalDeparture(actor, points)); }, 0);
  });
}
