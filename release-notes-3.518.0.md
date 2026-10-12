# TRG Prime 3.518.0 — Casting Time

**7 September 2026.** Five inert warps, one live defect underneath them,
and your ruling that turned the second into the reason the first was
worth building.

---

## A ten-minute ritual cost ten Action Points

Before anything was built, the measurement. The cast workflow converted a
casting time into AP with a function that reads a string's **leading
number** and knows nothing about its unit. So:

| printed cast time | AP it charged | spells |
|---|---|---|
| 10 minutes | **10 AP** | 43 |
| 1 minute | 1 AP | 31 |
| 1 hour | 1 AP | 4 |
| 7 days | **7 AP** | 1 |

**81 spells**, every one mispriced. And because the affordability gate
refuses a cost the pool cannot cover, casting a ten-minute ritual during
an encounter was rejected for being *seven AP short* — with a "proceed
anyway" button beside it.

The system already had the right answer: `parseApCost` returns 0 for any
label it cannot read as a number. This was **one conversion disagreeing
with the rest of the system**, not a missing rule.

I confirmed it by running the expression rather than reading it, which is
how the "7 days → 7 AP" row turned up.

---

## Your ruling is the keystone

> *"Anything with a cast time of more than 3 AP cannot be cast in combat.
> A combat round is 6 seconds so an AP equates to about 2 seconds. A 1
> minute casting would be 30 AP and a 10 minutes casting 300 AP, no
> combat would ever last that long."*

Two constants and a refusal come straight out of that sentence, and
everything else in the new module is arithmetic. A minute is 30 AP; ten
minutes is 300; seven days is 302,400.

**A refusal, not a warn-and-override.** The not-enough-AP gate offers
"proceed anyway" because a GM override or an unmodelled bonus might
legitimately apply — that reasoning is about the *size of the pool* and
does not transfer. No bonus-AP source makes a ten-minute ritual fit
inside six seconds, so there is nothing for an override to represent.

The refusal **shows its working**, because "you cannot cast this" reads
like a bug and "a minute is about 30 actions" reads like a rule:

> *Crackling Tempest takes 1 minute to cast — about 30 AP at 2 seconds an
> action — and a cast longer than 3 AP cannot be made during an encounter.*

**Nothing changes outside combat.** AP is not tracked turn-by-turn there,
so a ten-minute cast is a ten-minute cast.

---

## The five warps

| spell | printed | warp | now |
|---|---|---|---|
| Regenerate | 1 minute | +1 PP | **2 AP** |
| Restoration | 1 minute | +5 PP | **3 AP** |
| Crackling Tempest | 1 minute | +4 PP | **3 AP** |
| Lifekeeping | 3 AP | +2 PP | **−1 AP, min 1** |
| Restore Senses | 2 AP | +4 PP | **10 minutes** |

They speak two ways, so there are two keys: `castApSet` **replaces** the
printed time and `castApDelta` **adjusts** it. The set is applied first
and the delta to what it produced — the only order that reads the two
sentences as written.

**Your ruling is what makes three of these worth their PP.** Regenerate,
Restoration and Crackling Tempest each print a one-minute cast, which is
now uncastable in a fight; their warps are not a convenience, they are
the permission. Crackling Tempest's is its *only* warp, so a 20 PP spell
raining 10d12 electricity had nothing to warp into at all.

**Restore Senses goes the other way**, and that is the shape the ruling
rescued. Its +4 PP option pushes a 2 AP cast out to ten minutes — so
buying it mid-encounter buys a spell you can no longer cast, and the gate
says so before the check is rolled. Priced at zero AP it would have been
*cheaper* than the unwarped version.

**Lifekeeping's "(min 1)" is the clue it was always meant to be bought
more than once** — a single purchase off a 3 AP cast could never reach
the floor. It is the 145th warp in the pack with no ceiling; the other
four name a new time and rightly stayed checkboxes.

---

## Two things the measurement said *not* to build

**Regenerate's "(somatic, verbal)"** restates what the spell already has
— its components are exactly those two — so it needed no key. A mod there
would have been something nothing reads.

**Restore Senses' eye/ear regeneration is a note, honestly.** The base
rule is a counteract that *"cannot heal a physical injury or natural
loss"*, and the warp lifts precisely that sentence. There is no
damaged-organ state to clear; Regenerate's own base rule ("replaces a
lost or destroyed limb, organ, or body part") is narrative for the same
reason. The warp text already prints on the card, so the table reads what
was bought without the system pretending to model an eye.

---

## Checks

`verify-cast-time` — 101 checks. `mutate-cast-time` — 29 mutations, all
caught. Full sweep **249 of 249**.

**Four checks failed on the first sweep, every one correctly:**

- **`verify-difficult-terrain` W6 and W7** matched the workflow's *source
  text*, so they broke when the arithmetic was **moved** without being
  changed — and would have passed had it been neutered in place. That is
  the third time this project has recorded that shape. W7 now runs the
  rule; the arithmetic became two real functions so that it could.
- **`verify-spell-storing` G5e** caught that storing a spell must spend
  the **warped** cast time, not the printed one.
- **`verify-warp-repeats` P2** 144 → 145, exactly as Lifekeeping should
  move it.
- **`verify-mutation-anchors` A4** refused two anchors leading with
  `export`. Re-anchored on the values.

**And three mutation anchors went missing on the second sweep** — in
`mutate-difficult-terrain` and `mutate-spell-storing` — for the same
reason W6 and W7 failed: they quoted lines that had moved. Re-anchored,
and the one that mattered now points at the function rather than at the
place the function used to be inlined.

**One mutation survived, and it found the eighth dead guard.**
`castTimeIsCombatLegal` opened with `ap === null || ap <= MAX_COMBAT_AP`,
and removing the first half changed nothing — **`null <= 3` is true in
JavaScript**, because null coerces to 0. Deleting it alone would have left
the rule working by accident, correct until somebody reversed the
comparison, so the function now asks `castTimeApCost` instead, which has
one honest answer for a cast outside the AP economy.

**And a check caught its own author.** D8 asserted that a cast warped out
to ten minutes would come back as the words "10 minutes"; it comes back
as **300**, its true AP equivalent, because that is what the conversion
says. The check now pins the coupling that actually protects the pool —
that 300 is a real number kept away from `spendActionCost` by the
legality gate and nothing else.

---

## Still open

- **Cure's "+8 for the 2-action version"** — shares an axis with Inflict.
- **Animal Healing's two condition warps** — additions to a heal rather
  than an "instead".
- **Shroud**, **Breeze's bonus**, **Pass Without Trace's tracking DC** —
  each blocked on a missing rule.
- The **duplicate fade card** and **Elemental Shield**, neither ruled on.
- **Merrick Thorne's Light** is a pre-fix owned copy.
- **Cure's 3 AP radius version across a mixed group** is still unverified
  live; both branches of the per-target rule are verified separately.
