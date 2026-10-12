# Live testing — TRG Prime 3.521.0

**7 September 2026.** World "TRG V14", scene "Charnel House", Foundry 14.367,
as *Testing Dude* (GM). Caster: **ZZ Test Caster (Cleric of Dawn)**.

---

## The two defects, fixed where a player would feel them

| # | case | expected | observed |
|---|---|---|---|
| 1 | **Levitate** warped to 10 minutes (printed *"1 minute (D)"*) | stays dismissible | **`dismissible: true`**, panel reads **"Dismissible"** |
| 2 | **Continual Light** warped to *"permanent"* (printed *"unlimited"*) | PP stays locked | **`lock: "unlimited"`**, panel reads **"PP locked (unlimited)"**, 3 PP held |
| 3 | **Darkvision** warped to daily preparations | locks, then releases | **`lock: "dailyPrep"`** → daily preparation **released it and the panel emptied**, 4 PP returned |
| 4 | **Gentle Repose** warped | checkbox, 3 AP | **checkbox** (no `max`), **3 AP spent** against a printed 2 |

**Case 1 is the eighteen-warp defect.** Levitate's warp authors `"10 minutes"`
with no `(D)`, and the rule carried the dismissal forward — so the entry
registers as dismissible and the Dismiss control is there. Before this release
it was not.

**Case 3 exercised the whole chain end to end**: cast → lock recorded → the
real `releaseDailyPrepAndSustained` → entry gone, PP back.

**Case 4 is the correction the sweep forced mid-release.** The chooser draws a
**checkbox**, not the uncapped number box the delta produced, and the cast
spent one more action than the spell prints.

---

## And a claim of mine that the testing corrected

I wrote in the release notes that the fourteen warps were now live, and led
with *"Tongues to 8 hours"*. Casting it showed the card printing **"+4 PP: the
duration is 8 hours"** and **no effect created at all** — because **Tongues has
`effects: []`**. There is nothing for a duration to attach to.

Measured across all fourteen:

| what the warp actually buys | count |
|---|---|
| **changes a PP lock** — held, shown on the panel, released at daily preparation | **11** |
| lengthens a **timed effect** | **0** |
| **changes only what the card prints** | **2** — Tongues, Deflect Flame |

(Possession's two also carry a `(D)` forward, which is mechanical; one of them
changes a lock as well.)

So the channel is real, but **not uniformly so**, and my summary was too
smooth. The eleven lock warps buy an enforced thing. Tongues and Deflect Flame
buy a printed line, because those two spells have no effect rows — the same
"note, honestly" boundary this project has drawn before, and I should have
named it in the notes rather than letting the table imply otherwise.

Nothing needs changing in the code: authoring the duration is still correct —
it is what the card says and what any future effect row would read. What was
wrong was the claim, not the data.

---

## The harness behaved

The 3.520.1 fixes both showed: the trail now records `(targets ticked: 1/10)`
and `→ Continue` for every button pressed, and no dialog stalled the loop
across five casts. Third session was the charm.

---

## Rig restored

Combat and the driver's token removed, active-spell panel cleared, AP and PP
back to 3 / 63, targets cleared, no dialogs open. The five spells I added
(Levitate, Tongues, Darkvision, Gentle Repose, Continual Light) are left on the
test caster as fresh pack copies, so they carry the new warps rather than
pre-fix snapshots.
