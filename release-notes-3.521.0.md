# TRG Prime 3.521.0 — Durations

**7 September 2026.** Fourteen warps needed data and nothing else. Two
defects around them needed rules.

---

## The machinery was already finished

67 duration warps were live on `durationText`; fourteen were not. The
measurement said why they were left, and the answer turned out to be: no
reason at all.

`ppLockCondition` already reads *"until … daily preparations"* and
*"unlimited"* off a duration string. `registerActiveSpell` already records
the lock. `releaseDailyPrepAndSustained` already ends every locked entry when
the caster prepares. And `warpMods.durationText` already reached all of it.

So the fourteen are data — Invisible Item and Detect Scrying and the
Nightvision/Darkvision pair to daily preparations, six more to unlimited,
Tongues to 8 hours, Deflect Flame given the duration it never printed.

**They do not all buy the same amount, and the live pass made me say so.**
Measured across the fourteen: **eleven change a PP lock** — held, shown on the
panel, released at daily preparation — and **two change only what the card
prints**. Tongues and Deflect Flame both carry `effects: []`, so there is
nothing for a duration to attach to; authoring it is still right, because it is
what the card says and what any future effect row would read, but it buys a
line rather than a mechanism. The first draft of these notes led with Tongues
and implied otherwise.

**Gentle Repose got a second key.** *"The spell takes one more action to
cast"* now costs one, through the cast-time channel built at 3.518.0 for
Lifekeeping's reduction — the first warp in the pack to push it upward.

---

## Eighteen warps were taking the (D) away

`(D)` on a printed duration means the spell can be dismissed, and
`isDismissibleDuration` reads it straight off the text. A warp that
**replaces** that text dropped it.

**Measured: eighteen live warps did this** — Levitate, Cloudkill, Iron Body,
Lock, Alarm, Aura, Size Alteration and seven of the nine Shape spells. A
caster paid PP for a longer duration and silently lost the ability to end it
early. An upgrade that took something away.

Fixed as a **rule**, not as eighteen data rows: lengthening a duration says
nothing about dismissing it, and a warp that genuinely meant to remove (D)
would have to say so. None of the eighteen does.

Possession's two new warps are authored **without** the (D) on purpose. Adding
it by hand would work, and would hide the rule behind one lucky row — so if
the rule ever goes, the newest rows fail alongside the oldest.

---

## And three were releasing PP that a shorter duration held

Antipathy and Sympathy replace *"Until next daily preparation"* with
**"permanent"**; Continual Light replaces *"unlimited"* with it. `ppLockCondition`
matched neither word, so **buying a longer duration released the PP that the
shorter one was holding.** "Permanent" now locks like "unlimited".

---

## One answer for six readers

The cast card, the effect application, the PP lock, the Region's expiry, the
wildshape rider and the effects engine each carried their own copy of
`warpMods?.durationText || spellData.duration`. Six copies of one question is
the shape this project keeps paying for, and here it had already gone wrong in
all six at once. They now all ask `warpedDurationText`.

---

## The sweep caught me mid-release

`verify-warp-repeats` P2 moved **145 → 146**, and that single number was the
whole message. *"One more action to cast"* is phrased relatively, so I authored
it as `castApDelta: 1` — and a delta **accumulates**, so the chooser drew an
uncapped number box for an option whose second purchase buys no extra duration
and costs a second extra action. **A warp that penalises a repeat purchase is
not a warp.**

It is a `castApSet` now, which is not multiplied and stays the checkbox it
reads as. The correction is its own declared fix so the record shows both the
mistake and the reason, and the check pins the value against Gentle Repose's
**printed** cast time rather than against the literal 3 — change the printed
time and the check fails rather than the warp quietly meaning something else.

---

## Checks

`verify-warped-duration` — 44 checks. `mutate-warped-duration` — 9 mutations,
all caught. Full sweep **255 of 255**.

**`verify-region-expiry` W3 failed, correctly — and for the fourth time it was
the same defect class**: a check that matches the workflow's *source text*, so
it breaks when a rule is **moved** and would pass if the rule were **neutered
in place**. It now has a second half that runs the resolver, so a neutered rule
fails even when the call site is spelled correctly.

---

## Still open

- **The target-redirect key** and the picker-ordering problem behind it.
- **Wildshape forms** — 9 spells, 27 variants whose stat lines live in label
  strings, 56 inert warps hanging off forms that do not exist. The biggest
  unbuilt cluster, and the size-step and movement-speed channels both dead-end
  on it.
- **Size** — 3 warps on the real `identity.size`, plus Size Alteration's and
  Divine Might's unbuilt base rules.
- **Cure's "+8 for the 2-action version"**, **Animal Healing's condition
  warps**, **Shroud**, **Breeze**, **Pass Without Trace**.
- **Slide's range warp** points at a key nothing reads for it.
- The **duplicate fade card** and **Elemental Shield**, neither ruled on.
