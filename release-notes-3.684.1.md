# TRG Prime 3.684.1

4 November 2026. Graham's answers to 3.684.0's questions, and one seam Eldritch Arts 0.9.1 needs. Built on 3.684.0.

- **Install over 3.684.0.** No migration, and no world data changes.
- **Eldritch Arts 0.9.1 needs it.** Eldritch Arts 0.9.0 and Inner Tempest 1.0.4 run on it.

## For every world

- **Same-type bonuses to DB no longer stack** (Graham: "Status bonuses to DB should NOT stack"). This applies to the defender's defence rows (`defenceDC`: wards, auras, spell rows, feats such as Thengar's) on every attack path: Strikes, bombs, actions and spell attacks.
  - **The rule:** the one the core already uses everywhere else (`applyStacking`). Of the status, circumstance, item and the other "highest" types, only the biggest bonus counts, and only the worst penalty. Race, class, dodge and untyped always add.
  - **Against your own DB:** a defence row stacks with the defender's own DB entries, so it adds only what it raises the DB by. A +4 status ward over a +1 status already on the DB adds +3.
  - **Example:** Anticipations (+4 status) and Forbidding Ward (+1 status) together now give +4, not +5. The Strike, bomb, action and spell cards list the defender's rows and name the one that didn't count.
  - **Against a restricted DB:** a Paralyzed or Unconscious defender's DB keeps only magic, armour and penalties, and a row stacks against those entries only. A Petrified defender's DB is 0, and a row stacks against nothing.
  - **A row's type** is read in any case ("Status", "natural armour"), and a blank `type` falls back to `bonusType`.
  - **Rows with no type** (Thengar's, Storgar's) stay untyped, so they still add.
  - **Wards, auras and spell rows** now carry their type on the DB half, as they already did on the saves half.
  - **A ward, aura or spell row placed before this release** has no type on its DB row, so it keeps stacking until it expires or is placed again.
  - **Fearful Power** now stacks as a status row with the defence rows too. In 3.684.0 it was checked only against the sheet's own status bonus, so it stacked with a status ward. The card says when it didn't count.
  - **Formless Cut** pays back what the stance actually adds to the DB once stacking is applied: the stacked DB with the stance less the stacked DB without it. A +4 status stance row over a +1 status pays back +3. A +2 status ward that the stance was holding down counts again, so it pays back +2.
  - **The other DB bonuses on a Strike are unchanged.** They are added flat on top of the stacked DB, outside the typed stacking: firing-into-melee cover, Aid Defensive, Warden Hunter, Trap Finder, Arrow Catching, Dragonhide and Shielded Stride. So is a bomb's firing-into-melee cover, and a spell attack's Dragonhide and resilience. Abjurer's Strike still removes the item slot. So Aid Defensive (+circumstance) still adds beside a circumstance ward.
- **DB bonuses on spell attacks stay as 3.684.0 built them** (Graham: "Every DB bonus should apply to spell attacks (unless specified otherwise)"). A row names `attackKinds` when it is limited.
- **Two-skill prerequisites are checked for every feat** (Graham: "Yes for the skill rank prerequisites"). In 3.684.0 they were read only for Eldritch Arts feats that opted in.
  - **The full list is read.** The book prints Scribe Scroll's as "Arcana, Nature, Occultism or Religion 1 rank", and the comma split used to hand the parser only "Occultism or Religion 1 rank". The core now rejoins the list, so an Arcana caster still qualifies. "Either …" and an Oxford comma are read too.
  - **Any of the skills:** Scribe Scroll, Brew Potion, Spell Recognition, Magical Crafting (2 ranks), Mastermind (seven skills, 2 ranks), Alchemical Crafting (Crafting or Nature), and twelve Eldritch Arts feats.
  - **Both skills:** ten "A & B" feats (Animal Affinity and its kin) and Silent Spellstrike.
  - **Still pass open,** as before, because the parser can't read them: Inventive Crafter ("any skill that has both the create and research actions"), Loremaster, and Armoured Counter's armour clause.
  - **Owned feats are never removed or refused.** The gate only hides feats in the picker; importing or copying a character is unaffected.
- **Economic Spell and Signature Spell lower what you pay** (Graham: "Yes for Economic and Signature spell").
  - **Before:** they lowered the spell's PP total on the card, but the pool paid the full price.
  - **Now:** the pool pays the lowered price. The Casting DC, the cap and the save DC read the lowered total, as the book's "lower the PP cost" says, and the degree splits the lowered price.

## New for modules

- **`castPP` on a G1 metamagic option's `apply(ctx)`.** It is the PP the spell is cast at:
  - the base (an innate spell's printed PP, an item's release PP);
  - plus the chosen warps;
  - plus every metamagic option's PP, the asking option's own included. Core options count as ticked; rod-paid options count 0.
  - Economic and Signature come off it; G4 payment discounts don't. Cantrips are 0.
  - `basePP` is unchanged. Eldritch Arts' Wellspring Conduit reads `castPP`.
  - **It is not the settled cast's `castPP`** (the number G12's per-PP riders read). The two differ in three ways:
    - `apply(ctx).castPP` counts options paid in AP (G3, or `payment.kind: "ap"`) or in a resource at their PP. The settled number drops them.
    - The settled number adds the Component Savant swap's PP and every option's `basePPAdd` (Spellthread), which aren't known until `apply` has run.
    - Each applies Signature Spell's −1 by its own count.
  - With nothing paid in AP or a resource, no swap queued and no `basePPAdd`, the two are the same. They are documented in the G1 contract rather than lined up, because whether AP-paid metamagic counts as "PP expended" is a rules question.

## For Graham

- **Economic Spell's DC.** The book: "lower the PP cost of a spell by up to your caster level (min 1 PP). The DC to cast the spell increases by 2 for every PP you lower by." As built, the Casting DC is read from the lowered PP and then raised by 2 for each PP lowered. Since the DC rises about 1.5 per PP, lowering by 1 nets about +0.5 DC. Is that right, or did you mean a net +2 per PP lowered?
- **The Strike's other DB bonuses.** Cover, Aid Defensive, Warden Hunter, Trap Finder and the rest still add flat, outside the typed stacking. Should they stack by type with the defence rows too?
- **A ritual's own price.** When a ritual variant substitutes its own PP price, Economic and Signature don't reduce it. Should they?
- **Economic Spell and a Critical.** As built, Economic's cut is taken off what you pay for warps and metamagic first, the order Q93 set for G4's discounts. Only what's left comes off the spell's own cost. So a Critical halves the full base.
  - **Example:** a 4 PP spell with 2 PP of warps, lowered by 2 (Success: 4 PP). On a Critical it pays half of 4 = 2.
  - **The other reading:** if Economic lowers the spell's own cost instead, the base becomes 2 and the warps stay 2. A Critical then pays half of 2 + 2 = 3. The Critical saves less, so the caster pays more.
  - Which do you mean: off the warps first (as built), or off the spell's own cost?
