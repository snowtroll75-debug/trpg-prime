# TRG Prime 3.703.0: the Manipulate Attack of Opportunity, and donning armour

19 November 2026. Follows 3.702.0. Branch `release/3.703.0`.

## An Attack of Opportunity offered for an action that never happened

**Found in the 3.702.0 live test.** At 0 AP, an Interact inside a foe's reach posted the foe's Attack of Opportunity offer. Then the "Not Enough AP" prompt cancelled the Interact. The foe had been offered an attack for an action that was never taken.

**Why:** the offer was made at the top of `resolveAction`, before the AP gate and before any cancel.

**Graham:** "Yes do the fix."

**Now:** the offer is made when the action is **taken**. It comes from `basicActionTaken`, which every commit point passes through. The two prepared-reaction payments, which don't, make the offer themselves. A cancelled, refused or unaffordable Manipulate action provokes nothing. The rule hasn't changed:
- a Manipulate action provokes;
- an exempt one doesn't (Release, a change of grip);
- the Attack of Opportunity itself doesn't;
- only in a started combat.

## Armour now takes its time

**The book (Chapter 6, Donning & Removing Armour):** "Donning light armour takes 5 rounds, medium armour takes 4 minutes, and heavy armour takes 10 minutes; these times are doubled when donning a full suit of armour."

**What was wrong:** the sheet's Worn box put armour on and took it off at a click, in combat or out of it. The donning time was only something the item sheet printed. Quick Donning rolled its check and printed its times, and nothing used them.

**Graham:** "As for armour, please implement the rules correctly."

**His rulings, 19 November 2026:**

- **R1 Removing** takes the same time as donning, doubled for a full suit. The chapter prints donning times only; this is a ruling, and the code says so.
- **R2 In combat,** a suit is paid for over your turns:
  - Ticking (or unticking) the Worn box starts a **Donning** (or **Removing**) task for the whole time in AP, and pays this turn's AP towards it.
  - Each card has a **Continue donning / Continue removing** button. It pays every AP you have this turn, or what is still owed if that's less.
  - Progress is kept between turns, and you may take other actions in between.
  - The armour goes on (or comes off) when the last AP is paid.
  - Clicking the box on a task already under way asks **Continue** or **Abandon**. Abandoning loses the progress.
  - Starting on another piece asks whether to abandon the first.
  - A GM is asked "Start donning" or "Just set it (no action)".
- **R3 Out of combat,** it's done at once, with a card stating how long it took. The world clock is not advanced.
  - If combat ends part-way through a task, the next Continue finishes it at once, the same way.
- **R4 A single piece** (category "Other": helmets, bracers, greaves):
  - in combat, a **1 AP Interact**, with the Manipulate gates and the Attack of Opportunity offer, and a GM may just set it;
  - out of combat, free.
- **R5 Quick Donning** sets the time of that creature's **next** donning or removal:
  - The roller chooses "you or an ally" from yourself and any creatures they have targeted.
  - The result waits on that creature until the Worn box next puts on or takes off a suit, and is then used up.
  - For an ally the player doesn't own, it goes through the GM's client (a new relay action, `target.quickDonning`, which accepts only a degree the check can report).

**The times, in AP (3 AP to a round, 30 to a minute):**

| | Light | Medium | Heavy | Remove |
|---|---|---|---|---|
| Usual | 15 (5 rounds) | 120 (4 min) | 300 (10 min) | as donning |
| Full suit | 30 | 240 | 600 | as donning |
| Quick Donning Critical / Heroic | 6 (2 rounds) | 30 (1 min) | 30 (1 min) | 6 (2 rounds) |
| Quick Donning Success | 15 (5 rounds) | 60 (2 min) | 60 (2 min) | 15 (5 rounds) |
| Quick Donning Failure / Partial | usual | usual | usual | usual |
| Quick Donning Fumble / Blunder | twice usual | twice usual | twice usual | twice usual |

Fleetguard and registered runes (Swiftbind) still set the armour's own time through `donningTimeFor`, and that figure is used in both directions. A rune's free action (0 AP) is done at once, even in combat.

### Readings I took — please confirm or overrule

- **Q1 Donning provokes.** Each turn's payment is a Manipulate action of that many AP, so it offers an Attack of Opportunity to foes in reach, and Grabbed and the rest apply. Quick Donning itself carries the Manipulate trait. If you'd rather donning never provoked, it's one line.
- **Q2 Quick Donning and a full suit:** the Critical and Success times are printed as absolutes ("2 minutes to don medium or heavy armour"), so they are **not** doubled for a full suit. The Fumble's "twice the usual time" doubles whatever the usual time is, full-suit doubling and runes included.
- **Q3 Quick Donning and a rune:** the shorter of the two times stands, and the card says which.

## Harness

- `verify-manipulate-aoo-3703` (15 checks) / `mutate-manipulate-aoo-3703` (6 mutations).
- `verify-armour-change-3703` (85 checks) / `mutate-armour-change-3703` (26 mutations).
- Version pins raised to 3.703.0. No data or migration change.
