# TRG Prime 3.514.0 — the two clocks, doing the same job

**7 September 2026.** A comment said "both routes an effect can end by".
There were three, and the third had been leaving spell-made items behind
since 3.493.0.

---

## Found live, in the 3.513.0 test session

Magic Stone's live test ended with the pebbles crumbling correctly on the
world clock — and no card saying so. Chasing that silence turned up something
larger.

A spell effect can end on either of two clocks:

| | counts | announced | removed the spell's items |
|---|---|---|---|
| `expireTimedConditions` | **rounds** | yes | **no** |
| `expireSpellEffects` | **world time** | **no** | yes |

Each was doing exactly half the job, and each was doing the half the other
missed. Which clock ends a given effect is an accident: in a combat
`spellExpiryTiming` stamps **both** on the same effect, and rounds pass without
the world clock moving at all.

**Driven before building anything.** Magic Stone cast at round 1, combat
advanced to round 12:

```
round 14 · "Magic Stone expires."   ← the card was correct
effect     gone                      ← the effect was correctly deleted
PEBBLES    Magic Stone ×3            ← still in the inventory
```

Three permanent +1 pebbles. **Wild Morph has carried the same hole since
3.493.0**, and there it is worse: a grown claw is a natural weapon, so one that
outlives its minute is a permanent extra attack.

---

## Both halves

**The round clock now takes away what the spell built.** `expireTimedConditions`
reads the castId before deleting the effect — afterwards there is nothing left
to ask — and then calls `removeSpellItemsByCastId`, exactly as the other two
routes always did.

**The world clock now says what it ended.** `expireSpellEffects` has *always*
returned the labels of what it expired; its only caller in the system threw
them away. Every other sweep in either clock announces itself — rage, sustained
lapses, active-spell expiry, orphaned rows, region expiry. This was the one
that did not.

The sentence itself moved into `module/combat/effect-expiry.mjs` so that both
clocks print the same one and it can be run by a check. **The wording is the
round clock's, unchanged** — it was the one that had a sentence at all, players
have been reading it for months, and a fix is not an excuse to reword something
that worked.

---

## The comment was the bug

```js
 * Both routes an effect can end by — the world clock in
 * `expireSpellEffects` and dismissal in `removeEffectsByCastId` — call
 * this, so a form cannot survive one ending and not the other.
```

That is a list of callers written into prose, and it went stale the moment
somebody added one. It had been wrong for twenty releases, and it read as
reassurance the whole time — which is why the code beneath it was never
re-checked. The header now says what happened rather than what was intended.

---

## Checks

`verify-effect-expiry` — 31 checks. `mutate-effect-expiry` — 11 mutations, all
caught. Full sweep **241 of 241**.

**Both sweeps are RUN, against a stand-in actor.** They are Foundry-coupled but
only shallowly — between them they touch `actor.effects`, `actor.items`,
`getFlag`, `effect.delete` and `actor.deleteEmbeddedDocuments`, which is a small
enough surface to stand in for. That is the point: the alternative is a check
that greps the source for `removeSpellItemsByCastId` and passes whether or not
it is ever reached, which is the defect class this project has recorded three
times — and the "both routes" comment is what it looks like from the inside.

Section **A** is the release in one assertion: both clocks are run against the
*same* starting state and the results compared. Either half alone looks
reasonable; the failure was that they differed.

**K2 survived and the fixture was wrong.** The mutation that drops the castId
test from the item filter — so one spell ending strips every temporary item on
the sheet — passed the checks, because the two items meant to survive (a flask
and some arrows) declare no `endsWithSpell` and were excluded by the *other*
half of the test anyway. Only an item that says it ends with a spell **and
belongs to a different spell** can tell the two halves apart. Added a second
casting's Wild Morph claw, which is also the real case: a caster running Wild
Morph and Magic Stone at once, one of them ending. **Fifth time** this project
has recorded a check that could not catch its own assertion being neutered.


### Two more checks that grepped instead of running

**`verify-session-fixes-0829` D3** asserted the round clock's sentence by
matching its *source text*, and this release broke it by moving that sentence —
unchanged — into a pure module. Nothing about naming whose condition ended
changed, and the check failed anyway. That is the defect class from both
directions at once: a source grep passes when the rule is neutered and fails
when the rule is merely moved. It runs the rule now.

**`mutate-wild-morph` C4** went `ANCHOR x2`, because the line it anchored on —
`const castId = effect.getFlag?.(…) ?? null;` — is now written twice, once in
each clock. That is a cousin of `A3`: an anchor that is one ordinary line is
ambiguous the moment the same line is written somewhere else, because it
anchors on text rather than on the rule the text belongs to. Widened with the
comment unique to the world clock's copy.

---

## Still open

- **Shroud** — needs a per-creature perception offset; every light mechanism
  here changes an area for everyone in it.
- **Breeze's bonus** — no Breath trait exists to scope to, and Breeze is the
  only document in 2587 that mentions severe heat.
- **Pass Without Trace's tracking DC** — blocked because **Track** is authored
  `against: "none"`, so Cover Tracks' own "Tracking DC" is a number nothing
  consults.
- Two older items, reported and neither ruled on: the **duplicate fade card**,
  and **Elemental Shield** firing on a landed blow where the book says
  "attacks you".
- **Merrick Thorne's Light** is a pre-fix owned copy and does not carry the
  one-at-a-time rule.
