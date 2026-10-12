# TRG Prime 3.519.0 — Spell Range

**7 September 2026.** A touch spell landed on a creature across the room,
and had done since the system was written.

---

## Nothing ever checked

Every spell in the pack carries a printed `range`. Measured before
building, the only things that ever read it were a Cure feat's
ranged/melee split, area template placement, and Reach Spell's
eligibility test. **No distance was ever compared to it.**

**142 spells print "touch"** and not one of them asked whether you could
reach. A 30-foot spell landed at two hundred feet.

A weapon has refused exactly this all along:

> *Toben is 40 ft away — beyond Longsword's reach (max 10 ft).*

So this release is not a new kind of rule. It is one rule reaching the
other half of the game, and the wording, the refusal and the decision to
name the distance rather than only the verdict are all copied from there.

---

## Your ruling, and what it did not need

> *"Enforce spell range, then build it."*

**Touch needed no second ruling.** It is the caster's own
`system.combat.reach` — the same field `meleeReach` reads for a weapon
with no reach trait, defaulting to 5 feet. A Large caster with a ten-foot
reach touches at ten feet exactly as they punch at ten feet, and the two
halves of the game cannot drift apart because they read one number.

The refusal names the three facts the weapon refusal names, in the same
order:

> **Toben** is 40 ft away — beyond **Cure**'s range of touch (5 ft) (max 5 ft).

And it names **every** target that is too far, not the first. A cleric who
caught four allies in one cast and walked one of them out of range should
be told which one.

---

## The part a careless gate breaks

| | spells |
|---|---|
| gated — a real distance to enforce | **464** |
| **ungated** — no limit to enforce | **228** |

217 of those print no range at all; the rest say "planetary" (6),
"varies" (3), "unlimited" and "see text". **Every one must stay ungated.**
A range nothing can read is not a range of zero, and a gate that guessed
would refuse casts the book permits — which is worse than the defect being
fixed, because it stops play rather than permitting too much.

That is one line of code, and it has to be said out loud: **`9999 > null`
is true in JavaScript.** Without the guard, all 228 would refuse every
target on the board. It is the first mutation in the new file.

---

## The warps

Ten of the twenty-five inert range warps are live:

| spell | printed | warp | now |
|---|---|---|---|
| Fatigue | touch | +1 PP | 30 feet |
| Lifekeeping | touch | +2 PP | 30 feet |
| Remove Fear | touch | +2 PP | 30 feet |
| Trade Essence | touch | +2 PP | 30 feet |
| Mana Drain | 30 feet | +4 PP | **unlimited** |
| Whispering Wind | 10 miles | +4 PP | 100 miles |
| Blindness | 30 feet | +4 PP | 60 feet **+ 30-ft radius** |
| Flame Prison | 30 feet | +2 PP | 60 feet **+ 20-ft radius** |
| Force Prison | 30 feet | +3 PP | 60 feet **+ 20-ft radius** |
| Dance Macabre | touch | +4 PP | 50 feet **+ 20-ft radius** |

One key, `rangeOverride`, in the shape of `areaOverride` rather than
`areaGrowth`: every one of the twenty-five names a new range, none says
"+10 feet per purchase". **Mana Drain goes the other way** — "unlimited"
is one of the values that returns no limit, so its 4 PP buys freedom from
the check this same release introduced.

**The four compound ones buy their area too**, because `areaOverride` has
existed since 3.445.0 and each of those sentences changes two things. All
four print *no* area, so the override **creates** the template rather than
moving it — verified by running the workflow's own two calls, not by
reading them.

**Fifteen are still inert, deliberately.** They redirect a *target*
("the range becomes touch, and you may target another creature") rather
than only lengthening a reach, and that needs a key this release does not
build. Lifekeeping now has no inert warp at all — its other one went live
last release.

---

## Three redundant guards, found before shipping

`mutate-spell-range` had three survivors on its first run, and all three
said the same thing:

- **the ninth** — a list of ungated words ("self", "planetary", "varies").
  `parseRangeFeet` already refuses "self" and "personal" by name and every
  other word has no digit in it, so the answer was null either way.
- **the tenth** — `feet && feet > 0` over a function whose last line is
  already `d > 0 ? d : null`.
- **the eleventh** — an early exit for an ungated spell, in front of a
  filter that already empties the list for exactly that case.

All deleted rather than defended. The difference from the eighth, found
last release, is that these were caught **before** they shipped.

A fourth was avoided while writing: a guard on the *distance* in
`outOfSpellRange`. `null > 30` is already false, so the comparison answers
it. The comment now says so, in the place the guard would have been.

---

## A data-fix fragility, fixed properly

Two fixes **refused** mid-build, and the refusal was the safety rule
working. `target-warp-restore-senses` set one warp's `mods` but declared
the whole `system.warps` **array** as its from/to — so it began reporting
that somebody had changed its target the moment 3.518.0 touched a
*different* warp on the same spell.

Measured rather than patched twice: **51 fixes** were shaped that way.
Every one was already applied and correct, and every one was a landmine
waiting for a sibling to change. All 51 now name
`system.warps.<i>.mods`. The 141 fixes that genuinely author a whole
array still declare the whole array, which is right — the rule is that
**the declaration matches the edit**, not that arrays are forbidden.

---

## Found, not fixed

**Slide's "+1 PP: the range increases by 5 feet"** carries
`bonusValue: 5`, and `bonusValue` is read by sacrificing-shield,
magic-stone, spell-conditional and slot-choice — none of them Slide. The
number is aggregated and then read by nobody. It is also pointed at the
wrong thing: Slide's printed range is "touch", and the thirty feet its
warp lengthens is the **slide distance** in its description, which the
spell does not model at all (`effects: []`).

A check now pins it so it cannot be quietly lost, and it is named here
rather than fixed because teleport distance is its own unbuilt mechanism.

---

## Checks

`verify-spell-range` — 78 checks. `mutate-spell-range` — 17 mutations,
all caught. Full sweep **251 of 251**.

`verify-warp-area` **E3 and E4 both failed, correctly.** E3 counted eight
authored area warps and there are now twelve. E4 demanded that an area
warp *move* an existing template — which read my four as inert when they
are the opposite, since an override that gives an area to a spell that had
none is the largest change an area warp can make. E4 now requires the
**warped** area to parse either way, and treats a created area as the real
change it is.

**And three of my own numbers were assumptions.** The first draft of the
new check asserted 475 gated / 217 ungated and 25 range warps; the truth
is 464 / 228 and 28. Corrected from the data, with the correction recorded
in the check so the next reader knows which figure was measured.

---

## Also in this release

**`tools/live/cast-driver.js`** — the harness I said belonged in the repo
rather than being retyped. It clicks the **real** dialogs instead of
stubbing `DialogV2`, because a stubbed run reported "0 AP spent" for a
cast that really spent 2. It also saves and restores
`CONFIG.Dice.randomUniform` rather than deleting it, which is the trap
that silently aborted half of last session's casts.

---

## Still open

- **The target-redirect key** — 15 range warps and several others want it.
- **Size steps** — 18 warps across the 9 Shape Of The ___ spells, still
  needing a ruling on what a size step changes.
- **Cure's "+8 for the 2-action version"**, **Animal Healing's condition
  warps**, **Shroud**, **Breeze**, **Pass Without Trace**.
- The **duplicate fade card** and **Elemental Shield**, neither ruled on.
- **Merrick Thorne's Light** is a pre-fix owned copy.
