# Live testing — TRG Prime 3.519.0

**7 September 2026.** World "TRG V14", scene "Charnel House", Foundry 14.367,
as *Testing Dude* (GM). Caster: **ZZ Test Caster (Cleric of Dawn)**, reach 5 ft,
in a started combat. Tokens placed at measured distances: Toben 25 ft,
Lysa 30 ft, Grokash 40 ft, Edda 165 ft.

Driven with **`tools/live/cast-driver.js`** — the harness shipped in this
release — so the pass tested the driver as well as the system.

---

## The range gate

| # | case | expected | observed |
|---|---|---|---|
| 1 | **Fatigue** (touch, 5 ft) on Toben at 25 ft | refused | refused, 0 AP, 0 PP |
| 2 | same, **+1 PP range warp bought** | casts at 30 ft | **cast landed**, 2 AP / 2 PP |
| 3 | Fatigue warped, Lysa at **exactly 30 ft** | in range | **cast landed** — the boundary is inclusive |
| 4 | **Divine Favour** (no printed range), token targeted at **165 ft** | not refused | **cast landed** |
| 5 | **Remove Fear** (touch) on Toben *and* Lysa | both named | **both named, with their own distances** |
| 6 | **Blindness** (30 feet) on Grokash at 40 ft | refused | refused, 0 AP, 0 PP |
| 7 | same, **+4 PP warp to 60 feet** | casts | **cast landed**, 2 AP / 10 PP |

**Case 4 is the one that mattered most.** A token targeted at 165 feet and a
spell that names no range: the gate correctly did nothing. That is the
228-spell population a careless gate would have broken, tested at the sharpest
point — a target selected, and no limit to enforce.

**Case 1 also confirmed the gate's placement.** The warp chooser opened
*before* the refusal, so the option that removes the refusal stays reachable —
the same ordering the cast-time channel needed, and the thing no check covers.

Nothing is spent on a refusal, in any case: AP and PP untouched every time.

---

## One defect found, and fixed — 3.519.1

The refusal read:

> Toben is 25 ft away — beyond **Fatigue**'s range of touch (5 ft) **(max 5 ft)**.

and worse, on a numeric range:

> Grokash is 40 ft away — beyond **Blindness**'s range of 30 feet **(max 30 ft)**.

**The same number twice.** The suffix was copied from the weapon refusal
("beyond Longsword's reach (max 10 ft)"), but a weapon's *reach* is a word and
a spell's range is already a number, so the copy said it twice. `rangeLabel`
expands touch to the caster's reach precisely so the sentence never has to.

Now:

> Toben is 25 ft away — beyond **Fatigue**'s range of touch (5 ft).
> Grokash is 40 ft away — beyond **Blindness**'s range of 30 feet.

A check pins both forms, so the suffix cannot come back.

---

## Two things that were NOT defects

**The stray space in "Fatigue 's"** is my report stripping HTML tags to a
space. The card itself renders `<strong>Fatigue</strong>'s` correctly. Checked
against the raw message before writing it down.

**Blindness's warped area places no template under the harness** — and neither
does **Fireball**, which prints a 20-foot radius natively with no warp
involved. Both post their Cast card and stop; **Bless**, a 30-foot *emanation*
centred on the caster, completes normally. So the difference is placed-radius
vs emanation, not override vs printed: the warped area is on the ordinary
aiming path and is waiting for a click the harness cannot give. The release
note's claim was already hedged to what was actually verified — that the two
workflow calls produce a parseable config — and it stays that way.

---

## Two harness bugs, both mine — fixed in 3.519.1

Both produced results that looked like system defects:

- **Stale targets.** The picker pre-checks whatever is currently targeted and
  the driver only ever *ticked* boxes, so a second cast kept the first cast's
  target, went over the spell's printed target cap, and was refused by the
  target-**count** gate — which warns without a card. The run came back with no
  cards, no refusal and nothing spent, which reads exactly like a silent
  failure in the workflow. It was three lines in the driver.
- **Only the first match ticked**, so the two-target test was quietly a
  one-target test until I pre-targeted by hand.

The driver now sets *every* row from the regex — ticking the matches and
unticking the rest — and reports how many it selected, so neither can recur
silently.

That is the second session running in which the harness lied and the system
did not. Both lies are now written into the driver's own comments.

---

## Rig restored

The combat and the token the driver created are removed; AP and PP back to
3 / 63; targets cleared; sheet closed. **Four tokens are left where I moved
them** — Toben, Lysa, Borin Slatevein and Keldran — since I had to place them
at measured distances and cannot know where you want them. The test chat cards
were left in place.
