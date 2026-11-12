# TRG Prime 3.684.3

5 November 2026. Three rules fixes from Graham's answers of 5 November to the 3.684.1 questions: Economic Spell's Casting DC, the Strike's other DB bonuses, and a ritual variant's price. Built on 3.684.2.

- **Install over 3.684.2.** No migration, and no world data changes.
- **Modules:** nothing new for modules. Eldritch Arts 0.9.1, Eldritch Arts 0.9.0 and Inner Tempest 1.0.4 run on it.

## For every world

- **Economic Spell raises the Casting DC by 2 for each PP lowered** (Graham, asked "Did you mean the DC ends up 2 higher for each PP lowered?": "Yes").
  - **Before:** the Casting DC was read from the lowered PP, then raised by 2 for each PP lowered. Each PP already moves the DC by about 1.5, so lowering by 1 raised the DC by only about 0.5 overall.
  - **Now:** the Casting DC is the DC the spell would have at its unlowered PP, +2 for each PP lowered. A 5 PP spell lowered by 2 is cast at 3 PP and rolls against the 5 PP DC + 4.
  - **The card** shows the DC's own part, "Economic Spell, the DC of 5 PP", beside "Metamagic +4". The cost line says the cap and save DC read the lowered PP, and that the Casting DC reads the unlowered PP + 2 for each PP lowered.
  - **Unchanged:** the payment, the cap per cast, the overcast and the save DC all read the lowered PP (3.684.1). Metamagic Adept's "as if paid" PP are counted on top of the unlowered PP.
  - **Signature Spell is unchanged.** Its text ("the total PP cost of the spell is reduced by 1 PP") has no DC rule, so its PP stay off the Casting DC.
- **The Strike's other DB bonuses stack by type** (Graham, asked "Should they stack by type with the defence rows too?": "Yes").
  - **Before:** cover, Aid Defensive, Warden Hunter, Trap Finder, Arrow Catching, Shielded Stride and Dragonhide were added to the DB on top of everything else, untyped. A target in Standard cover from firing into melee, who had also Taken Cover, got +8. Aid Defensive's +2 beside Warden Hunter's +1 gave +3.
  - **Now:** they stack with the defender's DB rows, Fearful Power and the defender's own DB entries under Appendix 1, as 3.684.1 did for Fearful Power. Each takes the type its text gives it:
    - **Circumstance:** cover ("Standard Cover: +4 circumstance to DB"), Aid Defensive, Warden Hunter and Trap Finder. Only the highest circumstance bonus counts.
    - **Untyped:** Arrow Catching and Shielded Stride, which each increase a bonus that is already counted, and Dragonhide, which has no type. These still add in full, as before.
  - **The Strike card** says "— not counted: …" beside any of them that lost to a higher bonus. Aid Defensive now has its own line, which it never had.
  - **A thrown bomb's cover** is a circumstance row in the same way.
  - **Shooting Star's step-down** of firing-into-melee cover now takes off what the DB actually loses, not the table's difference. Taking off the full difference would be wrong when another circumstance bonus holds part of the cover up.
  - **Shooting Star against a target that has Taken Cover** steps the cover down before the Strike's own bonuses stack against it, so one the full cover held down counts again. Standard cover (+4) with Aid Defensive's +4, stepped to lesser (+2): the DB keeps the Aid's +4, so it loses nothing. With Aid's +3 it loses 1. The card's step line gives what the DB actually loses, and is left off when that is nothing. (Found in review: the first build took the full step off and also counted the Aid as lost.)
  - **A Paralyzed or Unconscious target that has Taken Cover** loses nothing to Shooting Star's step. Its DB keeps no cover to step down. Since 3.682.0 the step still took up to 2 off it, and the card said so.
  - **Spell attacks and actions** add no flat DB bonuses of this kind: Dragonhide is untyped and Spell Resilience is a class bonus, and both always add. They are unchanged.
- **Economic Spell and Signature Spell lower a ritual variant's price** (Graham, asked "When a ritual variant substitutes its own PP price, Economic and Signature don't reduce it. Should they?": "Yes").
  - **Before:** a vital, material or communal sacrifice paid the full price before either feat.
  - **Now:** their PP come off the substituted price as they come off an ordinary one, from the warps and metamagic first, and the degree splits what is left.

## Graham's answers of 5 November, recorded

- **Economic's cut comes off the warps and metamagic first.** Confirmed, as built in 3.684.1. Unchanged.
- **The Casting DC with Economic is a net +2 for each PP lowered.** Built above.
- **The Strike's other DB bonuses stack by type.** Built above.
- **Economic and Signature lower a ritual variant's own price.** Built above.

## For Graham

- **A Strike before Agile Display's Step** (from 3.684.2, still open). The default stands: the Step stays armed until your next turn or another basic action, so you can Strike first and still take the free Step. Should using anything else forfeit it?
