# TRG Prime 3.667.2

23 October 2026. The conviction bonus is asked on the chat card, after the dice and before the result is known.

- **Install over 3.667.0 or 3.667.1.** It contains 3.667.1: Deep Focus's uses, and the Resolve conviction point.
- **Unchanged and still working:** Inner Tempest 0.4.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.**

## The +1d6 for conviction, on the card

**Graham, 23 October:** "This should appear after the dice is rolled but before the result is known", and "it needs to appear on the chat card but actually change the result."

**Before.** Since 3.645.0 the bonus has been asked in a dialog on the roller's screen, before the workflow reads the roll. The dialog printed the total against the DB, or the DC and the degree, so the result was known before the choice. The card's older +1d6 button doesn't help here: it only re-adds a total the attack or save has already read.

**Now.** When the bonus is offered:
- **The card.** The roll posts a card at once. It shows the dice and the total, and nothing of the DB, the DC or the degree. It carries two buttons: **Spend Conviction (+1d6)** and **No**.
- **The wait.** The roll waits on that card. The character's owner or the GM can press, from any screen. Anyone else sees no buttons.
- **A spend.** The point is spent and the +1d6 is rolled. It is added to the check before anything reads it: the hit, the critical, the save's degree and the damage all use the new total.
- **The record.** The card then records the choice: "Conviction spent: +1d6 rolled 4 — total 22 → 26", or "No conviction spent: the total 22 stands". The full check card follows as before.
- **Roll modes.** A blind or private roll asks privately too.

**When it is offered: unchanged.**
- Always on an attack or a Spellcraft check, except an attack's unmodified 1.
- On a save or a skill check whose DC is known, only when +6 could change the degree (your 14 October ruling). This means the card appearing on a save does hint that the roll was close. Say if you'd rather it asked on every such save.
- A save or skill check still waiting on the GM's DC keeps its button on the full card, as before.

**Alter the Thread (Inner Tempest),** as you confirmed: the attacker's conviction card comes first. The Mystic is then offered the reroll on the final total, before damage.

## Checks

- **New harness pair:** `verify/mutate-conviction-now`, 19 checks and 18 mutations, all caught.
- **The uncalled-export ratchet:** the backlog shrank from 514 to 513, because `applyMessageMode` now has a caller. The new card's three pure helpers are declared keeps, with reasons.
- **Full sweep: 623 of 623 green**, the new pair included. It ran on a clean stage: the 3.667.1 release plus exactly this release's changed files.
- **Tested live:** see live-testing-report-3.667.2. Everything passed.
