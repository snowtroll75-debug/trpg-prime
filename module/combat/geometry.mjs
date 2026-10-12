import { SIZE_FOOTPRINT } from "./flanking.mjs";

/**
 * Canvas glue for the ranged-attack and flanking rules. Every function here
 * is defensive: a missing canvas, an unlinked actor, or a token that hasn't
 * been placed on a scene degrades to "no automatic data" rather than
 * throwing, so the attack workflow always falls back cleanly to manual
 * play. This file is deliberately thin — all the actual rules logic lives
 * in the pure ranged.mjs and flanking.mjs modules, tested independently of
 * Foundry.
 */

/**
 * The active token for an actor.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE ARGUMENT THIS USED TO PASS WAS A MISREAD, and it had 17 call sites.
 *
 * It read `getActiveTokens(true)`, and the doc comment above it said
 * "preferring one currently on the canvas". Foundry's first parameter is
 * `linked`, not "on the canvas" — so it asked for tokens whose actorLink
 * is true and got NOTHING for every unlinked token. Measured live in
 * Graham's world on 28 August 2026:
 *
 *   Grokash (linked token)          getActiveTokens() 1   (true) 1
 *   Test Kit: Fighter (unlinked)    getActiveTokens() 1   (true) 0
 *   Test Kit: Target Dummy          getActiveTokens() 1   (true) 0
 *
 * Every monster and NPC in a normal game is unlinked, so this answered
 * null for all of them. It surfaced as Cutting Words only ever offering
 * itself on a LINKED actor's card — a friendly player's — which is how
 * Graham reported it. The comment described the intention; the code
 * carried a different one.
 *
 * THE AMBIGUITY THAT REMAINS IS REAL AND IS NOT THIS FUNCTION'S TO FIX.
 * Three goblins from one stat block are three tokens of one actor, and
 * "the actor's first token" is a guess between them. Callers that know
 * WHICH token they mean should say so rather than ask here — the check
 * card carries `speaker.token`, for instance. This answers the weaker
 * question honestly instead of answering it wrongly for monsters.
 */
export function activeToken(actor) {
  try {
    return actor?.getActiveTokens?.()?.[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * A token's occupied grid squares as {col, row} integers, sized from its
 * actor's Chapter 1 size category and from the token's own footprint on
 * the canvas.
 *
 * THE LARGER OF THE TWO WINS (3.311.0). It used to take the actor's size
 * where there was one and fall back to the token's width otherwise, which
 * is right until a GM stretches a token — a Medium actor drawn across 2x2
 * to represent something sprawling would have measured from one square of
 * the four it visibly fills, and the player would be looking at a token
 * touching theirs while the sheet said 10 ft. Whichever says the creature
 * is bigger is the one that decides, because a distance gate that refuses
 * an attack has to agree with what is on the screen.
 */
export function tokenSquares(token) {
  try {
    const grid = canvas?.grid?.size ?? 100;
    const col = Math.round(token.document.x / grid);
    const row = Math.round(token.document.y / grid);
    const bySize = SIZE_FOOTPRINT[token.actor?.system?.identity?.size] ?? 0;
    const byToken = Math.max(1, Math.round(token.document.width ?? 1));
    const span = Math.max(1, bySize, byToken);

    const squares = [];
    for (let dc = 0; dc < span; dc++) {
      for (let dr = 0; dr < span; dr++) {
        squares.push({ col: col + dc, row: row + dr });
      }
    }
    return squares;
  } catch {
    return [];
  }
}

/** The top-left square of a token, for the flanking geometry functions. */
export function tokenOrigin(token) {
  try {
    const grid = canvas?.grid?.size ?? 100;
    return {
      col: Math.round(token.document.x / grid),
      row: Math.round(token.document.y / grid),
      size: token.actor?.system?.identity?.size ?? "medium"
    };
  } catch {
    return null;
  }
}

/**
 * The centre point of a grid square, in pixels.
 *
 * The centre rather than the corner because it is unambiguous under ANY
 * rounding convention. Foundry's square grid floors, so a top-left corner
 * happens to resolve to its own square today and the two are
 * indistinguishable — verified by mutation, which is why there is no test
 * pinning the choice. It is a hedge against a grid that rounds, not a
 * behaviour, and it costs one addition.
 */
function squareCentre(square, grid) {
  return { x: square.col * grid + grid / 2, y: square.row * grid + grid / 2 };
}

/**
 * Distance in feet from a point to the nearest square a token occupies.
 *
 * The point-to-creature half of `distanceBetween`, and it lives here beside
 * it deliberately: movement provokes, swift pursuit and a spell's range
 * clamp all ask this question, and three answers to it is how a giant ends
 * up 10 ft away for one rule and 5 ft for another.
 *
 * NEAREST SQUARE, NOT CENTRE, since 3.311.0. Measured against a Huge
 * creature's middle square, a character could walk the whole length of its
 * flank without ever "leaving its reach", and the attack of opportunity
 * never fired.
 */
export function feetFromPointToToken(point, token) {
  try {
    const grid = canvas?.grid?.size ?? 100;
    const squares = tokenSquares(token);
    if (!squares.length) {
      const measured = canvas.grid.measurePath([
        { x: point.x, y: point.y },
        { x: token.center.x, y: token.center.y }
      ]);
      return Math.round(measured.distance);
    }
    let best = null;
    for (const square of squares) {
      const measured = canvas.grid.measurePath([
        { x: point.x, y: point.y },
        squareCentre(square, grid)
      ]);
      const feet = Math.round(measured.distance);
      if (best === null || feet < best) best = feet;
      if (best <= 0) return 0;
    }
    return best;
  } catch (_e) {
    return null;
  }
}

/**
 * Distance in feet between two tokens, honouring the scene's configured
 * diagonal measurement rule (the rulebook's 5-10-5-10 alternating count
 * matches Foundry's "Alternating" Grid Diagonals setting).
 *
 * MEASURED FROM THE NEAREST SQUARES EACH CREATURE OCCUPIES, not from the
 * point at their middles.
 *
 * Graham, 14 Aug 2026: "Ranges are not working correctly. I think that the
 * system is measuring from the centre of a creature's icon when it should
 * measure from the edge."
 *
 * Exactly right. This used to feed `tokenA.center` and `tokenB.center` to
 * `measurePath`, and Foundry resolves each pixel point to the ONE grid
 * square containing it — so a token wider than a square was measured from
 * the middle of its footprint. For two Medium creatures that is the same
 * answer and nothing was ever wrong; for anything Large or bigger it
 * inflated every distance by roughly half each creature's width:
 *
 *   A Medium fighter stands flush against a Huge (3x3) giant. The giant's
 *   centre sits in the middle square of its nine, so this returned 10 ft.
 *   `reachPenalty` then read 10 > 5 and REFUSED THE STRIKE — "beyond
 *   reach" — with the two tokens touching on the canvas. Against a
 *   Colossal creature it read 15.
 *
 * And the error was invisible from the other side, because a Huge
 * creature's own reach is 15 and absorbed it.
 *
 * The fix measures the minimum over both creatures' occupied squares. That
 * is what a grid game means by distance: two adjacent creatures are 5 ft
 * apart whatever size they are. For Medium-vs-Medium it reduces to exactly
 * the old single measurement, so nothing about ordinary play moves.
 *
 * WHY NOT JUST SUBTRACT HALF EACH WIDTH. Because diagonals. The scene's
 * alternating 5-10-5 rule is applied by `measurePath` per step, and a
 * subtraction after the fact would be measuring a straight line and then
 * correcting it with a number from a different metric. Measuring the real
 * squares keeps one metric throughout.
 *
 * `tokenSquares` has existed since this file was written and had NO CALLER
 * — the size-aware primitive was sitting beside the size-blind measurement
 * the whole time.
 *
 * The square-set product is bounded in practice: Colossal is 5x5, so the
 * worst case is 25 x 25 = 625 measurePath calls, and only for a pair of
 * Colossal creatures. The overwhelmingly common case is 1 x 1.
 */
export function distanceBetween(tokenA, tokenB) {
  try {
    const grid = canvas?.grid?.size ?? 100;
    const squaresA = tokenSquares(tokenA);
    const squaresB = tokenSquares(tokenB);
    // A token that could not be resolved to squares (no canvas, no
    // document) falls back to its centre, which is what this always did —
    // degrading to the old answer beats returning null and silently
    // switching every range gate off.
    if (!squaresA.length || !squaresB.length) {
      const measured = canvas.grid.measurePath([
        { x: tokenA.center.x, y: tokenA.center.y },
        { x: tokenB.center.x, y: tokenB.center.y }
      ]);
      return Math.round(measured.distance);
    }

    let best = null;
    for (const a of squaresA) {
      const from = squareCentre(a, grid);
      for (const b of squaresB) {
        const measured = canvas.grid.measurePath([from, squareCentre(b, grid)]);
        const feet = Math.round(measured.distance);
        if (best === null || feet < best) best = feet;
        // Nothing beats touching, and overlapping footprints measure 0.
        if (best <= 0) return 0;
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Other tokens within melee reach of a given token — hostile-to-that-token
 * by disposition, excluding itself — used both for "is the attacker
 * engaged" and "who else is in this melee" (firing into melee / stray
 * shots).
 *
 * @param {Token} token
 * @param {object} [options]
 * @param {number} [options.reach] Feet; defaults to the token actor's own
 *   combat.reach, or 5.
 * @param {Token[]} [options.exclude] Additional tokens never to include.
 * @returns {Token[]}
 */
export function tokensEngaging(token, { reach, exclude = [] } = {}) {
  try {
    // A REACH OF ZERO IS A REACH (3.579.0; page 197, R12). `|| 5` turned
    // a Tiny creature's printed 0' into 5, so a pixie engaged the square
    // beside it. Asked in order, and each answer taken if it is a number.
    const declared = [reach, token.actor?.system?.combat?.reach]
      .map((v) => Number(v))
      .find((v) => Number.isFinite(v));
    const reachFeet = declared === undefined ? 5 : Math.max(0, declared);
    const excludeIds = new Set([token.id, ...exclude.map((t) => t?.id)]);

    return canvas.tokens.placeables.filter((other) => {
      if (excludeIds.has(other.id)) return false;
      if (other.document.disposition === token.document.disposition) {
        return false;
      }
      const distance = distanceBetween(token, other);
      return distance !== null && distance <= reachFeet;
    });
  } catch {
    return [];
  }
}

/** Tokens sharing the attacker's disposition (potential flanking allies),
 * excluding the attacker and the target. */
export function tokensAlliedWith(token, exclude = []) {
  try {
    const excludeIds = new Set([token.id, ...exclude.map((t) => t?.id)]);
    return canvas.tokens.placeables.filter(
      (other) =>
        !excludeIds.has(other.id) &&
        other.document.disposition === token.document.disposition
    );
  } catch {
    return [];
  }
}
