# TRG Prime 3.512.0 — one casting at a time

**7 September 2026.** Six spells print a rule saying only one of them can be
running, and none of it was built. Two other spells print the opposite.

---

## The measurement first

Across the 692-spell pack:

| | |
|---|---|
| Spells printing a one-at-a-time rule | **6** |
| Spells printing the opposite — "multiple uses of this spell stack" | **2** |
| Of the six, spells that registered an active-spell entry before this release | **2** |

The six:

- **Vital Beacon** — "You can have only one vital beacon active at a time."
- **Light** — "If you cast this spell again on a second object, the light spell on the first object ends."
- **Contingency** — "If you cast contingency again, the newer casting supersedes the older."
- **Veiled Secret** — "…any previous Veiled Secret spell you had cast will be nullified, and its effects will cease."
- **Breeze** — "You can only have one breeze active at any one time." *and* "…the previous casting is dispelled."
- **Pass Without Trace** — "…you can benefit from the effects of only one casting of this spell at a time."

The two that say the reverse are **Fatigue** and **Waves Of Fatigue**, both
of which print "multiple uses of this spell stack, with a second casting and
a failed save resulting in multiple fatigued levels."

Those two are why `singleCasting` is a **declared field** and not a rule
inferred from a spell's shape. Every heuristic wide enough to catch the six —
"a buff", "a long flat duration", "a spell that names itself in its own text"
— catches Fatigue as well, and the failure mode is a second Fatigue quietly
cancelling the first instead of stacking with it. Nobody would report that as
a bug. They would report that Fatigue felt weak.

---

## Two rulings

**Caster-scoped.** Five of the six are plainly about the caster — "if *you*
cast this again". Pass Without Trace words its half about the beneficiary
instead ("you can *benefit* from only one casting"), which would have meant a
new casting reaching onto another caster's sheet to end their spell and
release their PP. Ruled the same as the other five: your recast ends your own
earlier casting, and two different casters covering one creature is the GM's.

**They show on the panel.** Four of the six were never active-spell entries at
all — Breeze, Veiled Secret, Contingency and Pass Without Trace have no PP
lock, are not sustained, and print no (D). There was no record of which casting
was live and nothing for a recast to end. So `singleCasting` is now a **fifth
registration reason** beside lock, sustained, live emanation and (D), which is
how (D) itself became the fourth at 3.494.0: a rule about ending a spell needs
the spell to be something the system is holding.

Their rows say **"One at a time"** — a fifth state word. Without it the panel's
fallback would have called all four "Dismissible", which is the same mistake as
the two-way branch `activeSpellState` was written to replace: a fallback true
only while the list held nothing else.

---

## What it cost the two that *were* entries

Vital Beacon and Light both lock PP "until your next daily preparations", so
both were already on the panel — and both are where the gap actually cost
something. A second Vital Beacon locked a second block of PP and left the
first block held for the rest of the day, for one beacon. Light left the first
object glowing for good.

---

## Three broken anchors, all the same mistake

Adding a fifth clause to the registration gate broke three mutation anchors
and one source assertion, none of which were about anything that changed:

- `mutate-dismissible-spells` **G1** and `mutate-emanation` **E2d** both
  anchored on the whole gate line, closing `) {` included.
- `mutate-dismissible-spells` **P1** anchored on the panel's fall-through
  chain down to `return "Dismissible";`.
- `verify-dismissible-spells` **G1** asserted the gate's full text.

`A3 NO ANCHOR CARRIES A CLOSING DELIMITER IT DOES NOT CHANGE` refuses an anchor
on a growing list's *delimiter*. All three of these carried its last *element*
instead, which is the same fact wearing different punctuation — and the ratchet
does not currently catch it. All four now anchor on the clause they change.
`verify-emanation` and `verify-light-shift` already assert the prefix for
exactly this reason and were untouched by the change; their comments were the
model for the repair.

---

## What this release does not claim

Two of the four PP 2 spells deferred out of 3.504.0 get **half** their build
here, and the release notes say which half so nobody reads more into it:

- **Breeze** — the one-at-a-time rule, yes. The bonus is not built: "+2
  circumstance bonus on saves against very hot conditions, severe heat, breath
  weapons, cloud vapours and gases" needs a way to scope a save by what it is
  a save *against*, and no axis in the conditional engine says that today.
- **Pass Without Trace** — the one-at-a-time rule, yes. The tracking DC is not
  built, and the blocker is not the spell. "+4 status bonus to the DC of checks
  made to track you, or your spell DC, whichever is higher" has nowhere to
  land: the **Track** action is authored `against: "none"`, so nothing on the
  quarry's sheet is ever consulted — even though **Cover Tracks**' own
  description says trackers roll "against your Tracking DC". That is the
  Mount/Dismount shape one door over, and it needs a ruling on which DC that
  is before the spell can raise it.

---

## Checks

`verify-single-casting` — 55 checks. `mutate-single-casting` — 13 mutations,
all caught. Full sweep **237 of 237**.

Section **X** is the one the file exists for: it asserts that Fatigue and
Waves Of Fatigue both print "multiple uses of this spell stack" and that
neither declares the rule, and then asserts the general form — nothing in the
pack may both stack and not stack. Section **M** asserts the four-of-six
measurement from the pack rather than stating it in a comment, because it is
the fact that decided `singleCasting` had to be a registration reason.

Section **E** runs the registry write against a stand-in actor rather than
trusting that the field is stored. That is the 3.508.0 banner lesson: the rule
was right, the plumbing was right, and the field the display reads came from
somewhere no check had run.

**S5c** was added after writing the mutations. `S5` and `S5b` both pass with
the nameless-spell guard deleted — their entries are all named, so an empty
name matches none of them either way. A check that cannot catch its own
assertion being neutered is the defect class this project has now recorded
four times.

### What the harness still cannot reach

The registration reason itself — `|| singleCasting` in the cast workflow — is
Foundry-coupled glue, and no mutation can run it. Two workflow mutations
survived earlier this week for that reason. The repair taken both times was to
move the *decision* into a pure module rather than write a check that greps
the source for its own text, and that is what `supersededEntries` is: it takes
the spell data and answers the whole question. What is left in the glue is one
`||` and one `for` loop.

---

## Still open

- Two PP 2 spells remain fully unbuilt: **Magic Stone** and **Shroud**.
- **Breeze** and **Pass Without Trace** each have the half described above.
- Two older items, reported and neither ruled on: the **duplicate fade card**,
  and **Elemental Shield** firing on a landed blow where the book says
  "attacks you".
- New this release: **Track** rolls against nothing, so Cover Tracks' own
  "Tracking DC" is a number the system never consults.
