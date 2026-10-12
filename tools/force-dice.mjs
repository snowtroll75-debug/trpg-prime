/**
 * force-dice — choose the die faces during a live test.
 *
 * NEW at 3.372.1. THIS FILE IS PASTED INTO A BROWSER CONSOLE, not run by
 * Node. It lives in tools/ because the alternative is where it lived
 * before: nowhere. It was solved on 23 August 2026, used for an
 * afternoon, and would have evaporated with the session — the same way
 * the harness and the audit tracker did, both of which had to be rebuilt
 * that morning for exactly that reason.
 *
 * WHY IT EXISTS. An outcome that depends on a roll cannot be tested until
 * the roll can be chosen. Coup de Grace's "or die" needs a failed save;
 * Grapple, Trip and Shove's condition applications need a success. The
 * chapter-7 prerequisites note asked for this to be "solved properly
 * rather than worked around again".
 *
 * WHAT WAS WRONG BEFORE. Earlier sessions stubbed
 * `CONFIG.Dice.randomUniform` with a CONSTANT. An open-ended chain
 * re-rolls on an extreme face, so a constant high value never terminates
 * — the roll either hangs or produces something nobody asked for. This
 * uses a QUEUE: forced faces are consumed one per roll and the real RNG
 * resumes when it empties, so a chain can be handed a high face followed
 * by one that ends it.
 *
 * TWO THINGS THAT HAD TO BE MEASURED, not assumed:
 *
 *   1. FOUNDRY'S MAPPING IS INVERTED. Forcing the uniform for face `f`
 *      yields `(die + 1) - f`. Asking for 97 / 42 / 13 on a d100 produced
 *      4 / 59 / 88 — each pair summing to 101. `forceFaces` inverts it so
 *      callers ask for the face they want.
 *
 *   2. THE UNIFORM IS PER-DIE. The first version divided by 100 whatever
 *      the die, so a d6 silently ignored the request and returned 6
 *      twice. A forced roll that quietly is not forced is worse than no
 *      forcing at all, because the result still looks deliberate. Verified
 *      exact across d4, d6, d8, d20 and d100 before being trusted.
 *
 * USAGE — paste the block below into the console of a live world:
 *
 *   __dice.forceFaces(100, 1);        // next d100 rolls a 1
 *   __dice.forceFaces(100, 100, 50);  // a 100, then a 50 to end the chain
 *   __dice.forceFaces(6, 6, 3, 1);    // works on any die size
 *   __dice.remaining();               // faces still queued
 *   __dice.clear();                   // stop forcing, keep the stub
 *   __dice.restore();                 // PUT THE REAL RNG BACK — always
 *
 * ALWAYS CALL `__dice.restore()` BEFORE LEAVING. A world left with a
 * stubbed RNG rolls whatever the last tester queued, and nothing on
 * screen says so.
 */

export const FORCE_DICE_SNIPPET = String.raw`
(() => {
  const real = globalThis.__dice?.__real ?? CONFIG.Dice.randomUniform;
  let queue = [];
  CONFIG.Dice.randomUniform = function () {
    return queue.length ? queue.shift() : real.apply(this, arguments);
  };
  globalThis.__dice = {
    __real: real,
    /** Raw uniforms, if you need them. */
    forceRaw: (...us) => { queue = us.slice(); return queue.length; },
    /**
     * Ask for the faces you actually want.
     * Foundry maps the uniform inverted, so face F on a d<die> needs
     * ((die + 1) - F - 0.5) / die — the midpoint of that face's band.
     */
    forceFaces: (die, ...faces) => {
      queue = faces.map(F => (((die + 1) - F) - 0.5) / die);
      return queue.length;
    },
    remaining: () => queue.length,
    clear: () => { queue = []; },
    restore: () => { CONFIG.Dice.randomUniform = real; delete globalThis.__dice; }
  };
  return 'force-dice ready — __dice.forceFaces(100, 1) … and __dice.restore() when done';
})()
`;

/**
 * The self-test that was run before this was trusted. Paste after the
 * snippet; every row must read ok:true.
 */
export const FORCE_DICE_SELFTEST = String.raw`
(async () => {
  const out = {};
  for (const [die, asked] of [[100,[100,50,1]],[20,[20,11,1]],[8,[8,5,1]],[6,[6,3,1]],[4,[4,2,1]]]) {
    __dice.forceFaces(die, ...asked);
    const got = [];
    for (let i = 0; i < asked.length; i++) got.push((await new Roll('1d' + die).evaluate()).total);
    out['d' + die] = { asked, got, ok: JSON.stringify(asked) === JSON.stringify(got) };
  }
  return out;
})()
`;
