# TRG Prime 3.700.0 — Skirmish

Branch `release/3.700.0`, from 3.699.0. 19 November 2026.

## Skirmish didn't grant its Step

**The book:** "Action 1 AP. You may take a Strike action and Step action together for 1 AP. It matters not, which order you carry the actions out in."

**Graham, 19 November 2026:** "Skirmish is not working."

**What was wrong:**
- The 1 AP rolled the Strike straight away, and the card told the player to move the token.
- No Step was granted. The drag that followed was charged again, as a Step of its own.
- The Step could never come first, because the Strike was already rolled.
- Only melee weapons were offered, though the page says "a Strike action" and the feat is a Ranger feat as well as a Rogue one.

**Now:**
- **The 1 AP pays for both.** In combat a free Step is armed: up to your Step distance, no AP, no reactions provoked, and it counts as a Step.
- **The Strike waits on the card.** Target the creature and press **Strike: <weapon>**.
- **Either order.** Drag first and then press, or press first and then drag.
- **The card's Strike keeps the Step.** Any other action taken first removes whatever half is left, as Agile Display's Step goes. A reaction does not.
- **The Strike button is refused** once it has been made, on a later turn, or once another action has spent AP since. A Strike the attack workflow refused (out of reach, no target, no ammunition) leaves the button live.
- **Any Strike.** When two or more attacks are ready you're asked which: held melee first, then ranged, then natural. You're asked before any AP is spent, so cancelling costs nothing.
- **Out of combat:** no AP, the token moves freely, and the Strike button works as normal.

## For a ruling

- **Ranged Skirmish.** I read "a Strike action" as melee or ranged. If you meant melee only, it's a one-line change back.

## Tests

- **New:** `verify-skirmish-3700` (33 checks) and `mutate-skirmish-3700` (15 of 15 mutations caught).
- **Anchors updated:** `verify-session-faults-1014` F6b/F6c (Skirmish moved to the any-weapon chooser) and `verify-agile-display` N8 (a Strike's Step lapse now skips the `keepsStep` case).
- Full regression results are in TRG_CORE_TEST_REPORT.md §11.
