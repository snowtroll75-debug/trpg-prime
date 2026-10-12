# Live testing — TRG Prime 3.518.0

**7 September 2026.** World "TRG V14", scene "Charnel House", Foundry 14.367,
driven as *Testing Dude* (GM). Caster: **ZZ Test Caster (Cleric of Dawn)**,
3 AP / 63 PP, in a started combat. Target: Borin Slatevein.

**Every result below was produced through the actor sheet and the real
dialogs** — see "The rig lied" at the end for why that matters.

---

## The five warps

| # | case | expected | observed |
|---|---|---|---|
| 1 | **Regenerate**, warp not bought | refused | refused — card printed |
| 2 | **Regenerate**, +1 PP bought | 2 AP | **2 AP spent** |
| 3 | **Restoration**, +5 PP bought | 3 AP | **3 AP spent**, card names the warp |
| 4 | **Crackling Tempest**, its only warp unbought | refused | refused |
| 5 | **Lifekeeping**, +2 PP ×1 | 3→2 AP | **2 AP spent** |
| 6 | **Lifekeeping**, +2 PP ×3 | floor holds at 1 | **1 AP spent**, 6 PP charged |
| 7 | **Restore Senses**, unwarped | 2 AP | **2 AP spent** |
| 8 | **Restore Senses**, +4 PP bought | refused | refused — 300 AP named |
| 9 | **Consecrate** (control: 10 min, no cast-time warp) | refused at once | refused, no chooser |

The refusal, verbatim from the chat card:

> **Regenerate — Not Cast.** Regenerate takes 1 minute to cast — about 30 AP
> at 2 seconds an action, and a cast longer than 3 AP cannot be made during
> an encounter.

Nothing is spent on a refusal: AP and PP both untouched in cases 1, 4, 8, 9.

---

## The gate ordering — the thing no check covers

`mutate-cast-time`'s header says plainly that the two gates in
`cast-workflow.mjs` are wiring no check runs, and that live testing is what
covers them. Both were exercised:

- **Regenerate unbought** opened the **Warp? chooser first** and only refused
  after it was declined. A spell that sells a shorter cast must not be refused
  before the player can reach the option that removes the refusal.
- **Consecrate**, which sells nothing, was refused **before** any chooser.
- **The second pool gate fired**: with 1 AP in the pool and Regenerate warped
  to a 2 AP cast, "Regenerate — Cast a Spell — Not Enough AP" appeared. That
  branch exists only because the first gate cannot price a cast the warps have
  not settled yet.

## The chooser's boxes

Lifekeeping's four warps, read out of the rendered dialog: warps 0, 1 and 3 are
**checkboxes**; warp 2 — the AP reduction — is a **number input with no `max`**.
The uncapped box, and its three siblings unchanged.

## No interference with 3.517.0

Restoration cast with **both** the cast-time warp and the "instead reduce
injured" redirect: 9 PP (2 base + 5 + 2), 3 AP spent, both warps printed.

---

## The rig lied, twice — and this is the part worth keeping

**Neither is a defect in the system. Both are faults in how I drove it.**

1. **`delete CONFIG.Dice.randomUniform` does not restore Foundry's RNG** — it
   removes the function. Every roll after that throws `randomUniform is not a
   function`, and a cast aborts silently part-way through: no error surfaces,
   the promise resolves, and the cast simply did less than it should have.
   Save the original and assign it back.

2. **A wholesale `DialogV2` stub produces false resource accounting.** Casting
   Restore Senses with `prompt`/`wait`/`confirm` stubbed reports **0 AP spent**;
   the identical cast through the real dialogs spends **2 AP**. I could not pin
   the mechanism — it is not the target list (setting real targets changes
   nothing), not the conditions form (`{}` yields exactly the documented
   defaults), and the cast still posts both its Cast and Result cards.

   The consequence is the general one, and it is the same lesson already
   written into `cast-workflow.mjs` about the potion prompt: **the harness
   answers every prompt, so a workflow that quietly stops looks identical to
   one that finished.** Scripted casts in this project can be trusted for
   *whether a card appears and what it says*; they cannot be trusted for
   *what was spent*. Every number in the table above was re-taken by hand.

   This also explains the three failed scripted attempts at Cure's 3 AP radius
   version recorded in earlier sessions.

**Worth doing before the next live pass:** a harness that drives the real
dialogs by DOM rather than replacing them. The one written here does that and
worked for every case; it belongs in `tools/` rather than being retyped.

---

## Rig restored

Removed exactly what I added: the Crackling Tempest copy, the combat I started,
the token I placed. AP and PP back to 3 / 63, targets cleared, sheet closed.
Regenerate, Restoration, Lifekeeping and Restore Senses were already on that
actor; I refreshed them from the pack, so they now carry the new warps rather
than the pre-fix snapshots. The test chat cards were left in place.
