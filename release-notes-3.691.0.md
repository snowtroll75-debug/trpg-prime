# TRG Prime 3.691.0: one Rod a cast

14 November 2026. This enforces the Rod trait within a single cast, approved by Graham on 14 November 2026. The gap was found in the review of Eldritch Arts Block 9c. **Eldritch Arts 0.15.2** uses the new channel and needs this release.

> Rod: "You can only gain the benefits of one magical item with this trait each round. Furthermore, you may only use an item with the trait once per turn. …"

## What was wrong

Since 3.622.0 every rod spend has stamped the round, and later rod offers check that stamp. But every rod a cast can take is offered before any of them pays. So within one cast each offer passed the stamp, and one spell could take several rods at once:

- a metamagic rod's power (Extend, Quicken and so on, including a module's rod-paid metamagic);
- a Rod of the Magi's or Sceptre of the Clergy's PP draw;
- a Rod of Accuracy's bonus;
- a module's rod, such as Eldritch Arts' Ley Resonance or Binding Seal.

The Rod of the Magi's draw also never checked the stamp at all. It was offered even when a rod had already been used that round, then stamped a second one.

## What it does now

The cast keeps a list of the rods it has taken, in the order they're chosen: metamagic rods, then the Rod of the Magi's draw, module PP sources, module casting options, and finally the Rod of Accuracy. Two powers of the same rod count as one Rod.

- **Two different metamagic rods picked:** the cast is refused with a warning ("only one Rod may be used each round — X and Y were both taken for this cast"), before any AP or PP is spent.
- **The Rod of the Magi's draw:** not offered when a rod has already been used this round, or when another rod is already in this cast.
- **The Rod of Accuracy:** not offered beside another rod in this cast.
- **Module rods:**
  - The PP-source and casting-option contexts carry `rodsThisCast` (`{itemId, name}`), so a module can leave its rod out.
  - A source's offer or an option's result can return `rodItemId` / `rodName`, and the cast then counts that rod.
  - If a module's rod would still make two, the cast is refused at that point, before anything is spent.
- **Out of combat** there is no round stamp, as before, so only the one-rod-per-cast rule applies.

## Found in the independent review, and fixed

- **Metamagic rods now check the round too.** A metamagic rod (or a module's rod-paid metamagic) was offered even after a Rod had been used that round, and on a spell cast from a scroll, staff or wand. Neither is offered now, matching the Rod of the Magi's draw and the Rod of Accuracy.
- **No Rod of the Magi draw while storing a spell.** Spell Storing takes the whole cost from the pool and returns before any rod pays, so a draw counted towards the cost test but was never charged: it was free PP. A spell being held (Spellhold) pays like any cast, rods included.
- **A cast refused at the casting options gives back its Spell Adder use**, as the overcast's cancel does.

New pure helpers in `trait-rules.mjs`: `castRodsRefusal(rods)` and `otherCastRod(rods, itemId)`.

## The harness

- **New pair `verify-one-rod-per-cast`** (19 checks) and **`mutate-one-rod-per-cast`** (21 mutations, all caught).
- **Re-anchored**, all to the same lines: `verify-block36b` E2d and E3e, `verify-ea-block2b-core` RW and O (with `mutate-ea-block2b-core`), and `verify-block9a-core` H19. The metamagic rods are now offered only when no Rod was used this round; the Magi draw is now `rodCandidate`, not while storing; and applied casting options carry `rods`.
- Version pins raised to 3.691.0.
- **Full core sweep** (4 shards, 745 verifiers and mutation files): 0 failures in the code. The first pass flagged only the re-anchored pairs above, which rerun clean.
- **Independent review:**
  - It confirmed that nothing is spent before the new refusals, apart from the Spell Adder use, now given back.
  - It confirmed that one rod's two powers are one Rod, and that threaded and held releases and item casts see no rods.
  - It confirmed there is no use-before-declaration.
  - Its other points are fixed above.
- **Eldritch Arts 0.15.2:** all 27 module verifiers pass against this release, and `mutate-block9c` catches all 98 of its mutations.
