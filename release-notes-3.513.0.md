# TRG Prime 3.513.0 — Magic Stone, and half a bonus that did not exist

**7 September 2026.** Three pebbles a sling can throw. The spell was cheap;
the field it needed was not.

---

## Why this one and not the other two

All three remaining PP 2 spells were measured against what the system can
actually express, and they are not equally ready.

**Magic Stone** turned out to be nearly free. The pebbles are a real piece of
ammunition, and almost everything they do already existed:

- `ammunitionFitsWeapon` matches a round to a weapon by **group**, and the
  Sling's group is `"Sling"`.
- `roundsRemaining` and the consume step spend one round per shot — which is
  *"crumbles to dust after it is used"* with nothing added.
- The attack workflow already folds a round's damage modifier into the formula.

**What did not exist was half the bonus.** Ammunition could change damage,
damage type, range, armour rending, splash and subdual — everything except
whether the shot lands. Your ruling that *"+1 item (magic) bonus"* covers
attack **and** damage is the ordinary reading of an enhancement bonus, and
there was no field for the first half.

So `attackModifier` joined the ammunition template. That is a wider change than
this spell: every one of the nine authored rounds can now declare one, and
**all nine declare zero** — asserted, not assumed.

---

## The `item` type is deliberate, and it costs the spell something

A +1 Magic Stone fired from a **+2 sling gives +2, not +3**. Two item bonuses
on one roll do not stack, which is the right reading of an enhancement bonus.

That only works because `ammunitionAttackModifier` returns a **typed row**
rather than a number for the workflow to add up. Drop the type and the shot
still lands, the number is still plausible, and nothing anywhere says two
enhancement bonuses were stacked. It is the mutation in this release that
would have been hardest to notice, so it has its own section of checks.

---

## The Disruptive trait is printed, not applied

Measured before building: **"Disruptive" appears in no pack and in no line of
code anywhere in this system.** "Magical" exists on three documents and nothing
reads it either.

There is no rule for the pebbles to carry. Automating it would mean inventing
the trait, the thing it disrupts, and the check it interrupts — none of which
the book gives here. So the trait goes on the item where a reader sees it, and
the card says so out loud:

> *The pebbles carry the Disruptive trait — no rule in this system reads it, so
> what it disrupts is settled at the table.*

A check asserts the measurement, not the memory of it: **if anybody ever
authors a Disruptive item, that check fires** and the card should stop
apologising.

---

## Wild Morph's shape, deliberately

The pebbles have no clock of their own. The items are stamped `endsWithSpell`
and a companion effect carries the duration that the world-time sweep expires;
deleting that effect is what removes them. Without it Magic Stone would hand
out permanent +1 ammunition.

That is exactly what Wild Morph does, and the comment beside it says so in as
many words. Following it rather than inventing a sixth registration reason kept
the change to one spell.

`target: "self"` matches **Healing Earth**, the closer analogue than Bless
Water: both name an *object* as the target ("up to 3 pebbles", "a handful of
dirt or mud"), and the caster is who ends up carrying the result. The player
hands them on through the inventory like any other item.

---

## The warp that was inert

*"+2 PP: increase the bonus to +2"* shipped with `mods: {}` — offered, charged,
the card saying the spell was warped, and nothing happening. The same shape as
the 46 additional-target warps, the two phantom-key clauses, and Resistance's
all-saves warp before it.

Declared as `bonusValue: 1` rather than a set-to-2, so the same
`warpedBonusValue` that caps every other numeric warp caps this one.
`bonusMax: 2` is the printed words: the bonus *becomes* +2, so taking the
option twice must not reach +3.

---

## Why not the other two

**Shroud** is half precedented and half new. Its degree-gated duration is
Unwelcome Halo's shape, and "+2 vs light effects" scopes cleanly to the Light
trait (26 documents carry it). But *"perceives light as two steps lower"* is a
**per-creature perception offset**, and every light mechanism here changes an
area for everyone standing in it. `lightShift` moves a circle; it cannot move
one creature's eyes.

**Breeze's bonus** is mostly unbuildable, and not for coding reasons:

- *cloud vapours and gases* — scopes to the Poison trait, but over-catches
  Ghoul Touch and Verdant Retribution, which are Poison and not gases.
- *breath weapons* — **nothing to scope to.** There is no Breath trait. The
  four "…Breath" creature abilities are *riders that trigger off* a breath
  weapon, not breath weapons; and the only granted one, Shape Of The Wyrm's,
  declares elemental / focus / invocation / save.
- *very hot conditions, severe heat* — **Breeze is the only document in 2587**
  that mentions them. There is no environmental heat rule to save against.

---

## Checks

`verify-magic-stone` — 48 checks. `mutate-magic-stone` — 16 mutations, all
caught. Full sweep **239 of 239**, and the uncalled-export ratchet shrank 627 → 626 because
`ammunitionFitsWeapon` finally has a caller.

Section **I** holds the item against its *readers* rather than against a list
typed out by hand — the shape `verify-healing-earth` established. The pebbles
are run through the real `ammunitionFitsWeapon` against the real Sling from the
pack, and then against every other weapon group in the game to confirm they fit
nothing else.

Section **F3** is the one that guards the rest of the game: this release
widened a shared item type, and every authored round must be exactly where it
was.

Three ratchets fired on my own work and all three were right. **A4** refused
three anchors that led with `export` — an anchor on `export const
MAGIC_STONE_GROUP = "Sling";` names who may call the constant rather than what
it says, so changing its visibility would disarm the mutation; re-anchored on
the values. **verify-pp2-bonuses** failed because its V section asserts the
four deferred spells stay untouched, and Magic Stone is no longer one of them
— that section is working exactly as written, and Resistance left the same list
the same way at 3.507.0.

**T4 was wrong and the mutation runner said so.** It asserted that a round with
no name still names something — by calling with the argument omitted, which
never reaches the guard at all, because the signature's own default has already
supplied the word. The mutation `String(ammoName || "Ammunition")` →
`String(ammoName ?? "")` SURVIVED. The guard exists for a name that *arrives*
and is empty — the workflow passes `ammo?.name`, and an item created without
one gives `""`. Fixed by handing it one. Fourth time this project has recorded
a check that could not catch its own assertion being neutered, and the second
this week.

### Not checked, and said rather than grepped

Live testing of 3.512.0 found that **a failed recast does not end your running
spell** — the cast fumbled, printed no supersede line, and the running Vital
Beacon survived. That is correct, and it falls out of *where* the supersede
step sits: inside the registration block, which a failed cast never reaches.
It is a fact about position in Foundry-coupled glue, not a rule, so there is no
pure function to run. Writing a check that greps the source for its own
location would be the defect class this project has recorded three times, so it
is written down here instead.

---

## Still open

- **Shroud** and **Breeze's bonus**, both blocked as described above.
- **Pass Without Trace's tracking DC** — the blocker is that **Track** is
  authored `against: "none"`, so Cover Tracks' own "Tracking DC" is a number
  nothing consults.
- Two older items, reported and neither ruled on: the **duplicate fade card**,
  and **Elemental Shield** firing on a landed blow where the book says
  "attacks you".
- **Merrick Thorne's Light** is a pre-fix owned copy and does not carry the
  one-at-a-time rule. One drag from the compendium fixes it.
