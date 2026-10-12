# TRG Prime 3.520.0 — Target Counts

**7 September 2026.** One key existed and three sentences needed saying.

---

## A total is not an increment

3.498.0 built `extraTargets` for the 46 warps that sell *"you can target an
additional creature"*. It is an **increment**, and it was the right shape for
those. Measured this release: **twelve more warps name a TOTAL**, and none of
them could be authored at all.

| | |
|---|---|
| 8 | a flat total — *"you can target up to 10 targets"* |
| 3 | a total per level — *"target up to 1 creature per level"* |
| 2 | an area instead — *"the spell effects all targets in a 10-foot radius"* |

**Folding a total into the increment would have been the quiet disaster.**
"Up to 10" becomes **eleven** on a `1 creature` spell and **twelve** on a
`2 creatures` one — the printed number meaning something different on every
spell that bought it. Nothing would error, and the card would print the right
sentence. That is the first mutation in the new file.

So a total **replaces** the printed cap and an increment **adds** to it, in
that order, and `targetCapFor` — which the target-count gate has called since
3.498.0 — combines them. These warps buy an **enforced permission**, not a
printed line.

---

## Your ruling

> *"Caster level — the same as everywhere else."*

So *"target up to 1 creature per level"* scales off the same `casterLevelOf`
the system uses for max PP per cast, overcasting DC and resting recovery —
including an **item cast**, whose level is the consumable's rather than the
reader's, because the workflow already computes that distinction and this now
reads the same number.

Two guards that fall out of the ruling, both mutation-tested:

- **Never below the printed cap.** A level-3 caster who pays 8 PP must not end
  up with *fewer* targets than the spell prints.
- **An unreadable level buys the printed cap, not zero.** Zero would refuse
  every target on the spell the caster just paid to widen.

---

## The thirteen

| spell | warp | now |
|---|---|---|
| Sudden Sickening | +6 PP | up to **10** |
| Pariah | +4 PP | up to **10** |
| Dream Message | +4 PP | up to **10** |
| Visage Of Horror | +2 PP | up to **5** |
| Neutralise Poison | +2 PP | up to **10** + 20-ft emanation |
| Rage | +4 PP | up to **10** + 20-ft radius |
| Brawn | +8 PP | up to **6** + 30-ft radius |
| Wits | +8 PP | up to **6** + 30-ft radius |
| Command | +8 PP | **1 per caster level** |
| Charm Kind | +8 PP | **1 per caster level** |
| Charm Animal | +8 PP | **1 per caster level** |
| Clarity | +2 PP | 10-ft radius |
| Cloak Of Greying | +6 PP | 50-ft radius |

**Dream Message is the neat one**: its range is "planetary", one of the values
the range gate deliberately leaves unenforced, so the **count** is the only
limit the spell has — and until now it had none either.

**Clarity gets no cap, deliberately.** It prints no targets line at all, so
`parseTargetCount` gives no cap and the gate never runs for it. Adding one
would invent a restriction the book never printed. The area is the whole of
what its warp buys.

---

## What must not move

**A spell whose printed line gives no number stays uncapped, warp or no warp.**
"Ten" is not larger than "no limit", and refusing there would turn an unparsed
line into a restriction — the same rule the range gate follows for its 228
ungated spells, and the same one `parseApCost` has always followed.

---

## Left inert, and why

**The six self-to-another redirects** — Invisibility, True Seeing, Nightvision,
Darkvision, Jump, Deathless. They looked like the obvious other half of this
channel until they were measured: **four of the six carry `effects: []`**, so a
redirect would move nothing at all. Invisibility's one effect already targets
`targets` rather than `self`. Only **Jump** has an effect a redirect would
genuinely move.

They also need the picker to open on a spell whose printed `targets` line is
empty — and the picker runs *before* the warp chooser, so a warp cannot summon
it. That is a real ordering problem worth its own release rather than a
special case bolted here.

---

## Checks

`verify-target-cap` — 49 checks. `mutate-target-cap` — 10 mutations, all
caught. Full sweep **253 of 253**.

**One mutation survived: the twelfth dead guard.** A `Math.max(0, …)` around
the caster level, discarded on the very next line by the `Math.max(base, flat,
scaled)` that picks the largest offer. That is the **fourth found this way in
two releases**, and the pattern is always identical — a test placed in front of
a comparison that had already answered it.

---

## And the ratchet's own blind spot

`mutate-spell-range` W1 died one release after it was written — anchored on
`rangeOverride: null` **plus the list's closing brace**, so appending a key
after it broke the anchor. That is precisely the shape `verify-mutation-anchors`
A3 exists to refuse, and it exists because the same thing happened three times
in one session at 3.499.1.

**It did not catch it.** The rule tested `to.endsWith("\n" + last)`, and an
anchor that deletes a list's *last* entry replaces `key: null\n  };` with
`  };` alone — the delimiter with no newline in front of it. The narrowest form
of the shape was invisible to the check written to refuse it.

Widened, the rule immediately found **three more** anchors of the same kind,
in `mutate-chapter5-batch`, `mutate-difficult-terrain` and
`mutate-resume-outcome`, all previously silent and all now re-anchored on the
lines they actually change. Two fixture checks and a mutation pin the narrow
form, so the hole cannot reopen.

That is the check catching its own defect, one release late — which is the
best outcome available once the defect exists, and an argument for the ratchet
rather than against it.

---

## Still open

- **The target-redirect key** and the picker-ordering problem behind it.
- **Size steps** — 18 warps across the 9 Shape Of The ___ spells, still needing
  a ruling on what a size step changes.
- **Cure's "+8 for the 2-action version"**, **Animal Healing's condition
  warps**, **Shroud**, **Breeze**, **Pass Without Trace**.
- **Slide's range warp** points at a key nothing reads for it (found 3.519.0).
- The **duplicate fade card** and **Elemental Shield**, neither ruled on.
