# TRG Prime 3.522.0 — The Row's Own Extra

**7 September 2026.** The half of your Cure report that was still open,
and the identical gap on Inflict that nobody had noticed.

---

## What you reported, and what shipped when

On 7 September you sent three things about Cure's warping options. Two
shipped quickly:

- *"The first and third option should be able to be selected multiple times
  (with no limit)"* → **3.515.0**, which also found 140 other warps the
  chooser had been capping at one.
- The bleed clauses → **3.516.0**.

The third clause has been open through **six releases**:

> *"+2 PP: the amount of healing increases by 1d8 **and the extra healing for
> the 2-action version increases by 8**."*

`damageDice: "1d8"` bought the die. **The eight reached nothing.** A caster who
paid 2 PP got one and not the other, and nothing on the card said so.

**Inflict prints the same sentence** — *"the amount of damage increases by 1d8
**or 1d8+8 for the 2 AP version**"* — with the same half built and the same
half missing. That one was never reported; it was found by measuring the axis
your report pointed at.

---

## The row's own number, not an eight

Both spells print exactly **8** on their two-action row, so *"add 8"* and
*"add the row's own extra again"* cannot be told apart in this data.

The second is what's built, because it keeps the number in **one place** — the
AP row's own formula:

| Cure's row | unwarped | warped ×1 | warped ×2 |
|---|---|---|---|
| 1 AP | 1d8 | **2d8** | 3d8 |
| 2 AP | 1d8 + 8 | **2d8 + 16** | 3d8 + 24 |
| 3 AP | 1d8 | **2d8** | 3d8 |

**A row with no flat term is untouched**, which is what makes the rule safe
rather than clever: Cure's 1 AP and 3 AP rows print a bare `1d8` and gain only
the die — exactly what the sentence says. And a row printing something other
than 8 would get its own, so authoring the eight as a warp mod would have put
one number in two places and waited.

Both halves scale together with the purchase count, since your ruling made this
warp repeatable without limit.

---

## A superseded fix, marked rather than rewritten

Applying the two new rows made `gentle-repose-unlimited` refuse: last release's
correction had already changed the value it declared. `data-fixes.json` has a
`supersededBy` field for exactly this, and it is now used — so the record keeps
both the `castApDelta` that was tried and the `castApSet` that stands. A fix
quietly edited to match a later correction would leave no trace of the mistake
the sweep caught.

---

## Checks

`verify-row-extra` — 32 checks. `mutate-row-extra` — 8 mutations, all caught.
Full sweep **257 of 257**.

**Section S is the one that matters most.** Every damage and heal formula in
the pack now passes through this function on every cast, so the check runs all
of them through it and asserts that **nothing moves when nothing is bought** —
and that a formula without a trailing constant does not move even when it is.

One anchor was fixed before the sweep could complain: `mutate-row-extra` W1
named the vocabulary list's last key *plus its closing brace*, which is the A3
shape the ratchet started refusing last release. Caught by remembering rather
than by running, which is the first time that has happened.

---

## Still open

- **Wildshape forms** — 9 spells, 27 variants whose stat lines live in label
  strings, 56 inert warps hanging off forms that do not exist. The biggest
  unbuilt cluster, and the size-step and movement-speed channels both dead-end
  on it. This one needs your appetite before I start: it is two or three
  releases, not one.
- **Size** — 3 warps on the real `identity.size`, plus Size Alteration's and
  Divine Might's unbuilt base rules. Small, and the size table already drives
  reach, HP, Str/Dex, flanking and weapon hands.
- **The target-redirect key** and the picker-ordering problem behind it.
- **Animal Healing's condition warps**, **Shroud**, **Breeze**, **Pass Without
  Trace**.
- **Slide's range warp** points at a key nothing reads for it.
- The **duplicate fade card** and **Elemental Shield**, neither ruled on.
