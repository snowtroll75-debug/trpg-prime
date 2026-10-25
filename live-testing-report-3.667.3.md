# Live testing report: TRG Prime 3.667.3 with Inner Tempest 0.4.2

23 October 2026. Tested in Graham's world "TRG V14" (Foundry 14.367), at 127.0.0.1:30000, in the built-in browser as Testing Dude (GM).

**Result:** everything tested works. One layout slip was found: the tick-box prompt squeezed its rows into a narrow column. It is fixed in 3.667.4. No errors came from either release.

## Set-up

| Character | Level | Built with |
|---|---|---|
| ZZ Disciple | 16th | Inner Strike, Spirit Stance, an Unarmed Strike and a Short Sword |
| ZZ Mystic | 4th | Alter the Thread, Echoes Beyond and an Unarmed Strike |
| ZZ Wizard | 4th | Dancing Lights, and a test effect with one Spellcraft tick-box and one save tick-box |
| ZZ Target | — | An NPC |

## Inner Strike's +1 (Inner Tempest 0.4.2)

- **The effect:** Inner Strike (Force) carries its +1 as an automatic modifier, scoped to unarmed melee attacks.
- **The fists:** the attack card read "BAB and ability +16, **Inner Strike Status +1**", for a total of +17.
- **The Short Sword:** "+16, Non-proficient −4", with **no Inner Strike +1**. The force rider still applied to both, as it is written for "your Strikes".

## The tick-box prompt (3.667.3)

**On a weapon attack, in Spirit Stance, against ZZ Target (not a spirit)**
- **The prompt:** it came before the dice, after the Versatile choice. It was titled "Unarmed Strike — Attack — before the roll" and listed "+1 circumstance — Spirit Stance — Attacks against a creature possessing another creature — tick if the target is one", **unticked**.
- **Ticked** (a real mouse click), then Roll pressed: the attack card listed "**Spirit Stance Circumstance +1**".
  - The target was prone from an earlier critical, so its +4 circumstance outranked the +1: circumstance bonuses don't stack. That is correct.
- **Not ticked**, Roll pressed: no Spirit Stance line.
- **With Shift:** no prompt, and no Spirit Stance line.

**Alter the Thread's reroll keeps the answer**
- **The attack:** ZZ Disciple, in Spirit Stance, against ZZ Mystic.
- **The prompts, in order:** the Mystic's reaction offer (declined), the Versatile choice, the tick-box prompt (ticked), the conviction card (No), and Alter the Thread (taken).
- **The reroll:** "37 → 31. The new roll stands". The final card still listed Spirit Stance +1. The prompt was asked **once**.

**Echoes Beyond on an attack**
- **The use:** the Mystic used Echoes Beyond, and its effect, "Echoes Beyond (advantage)", was laid.
- **The prompt:** the Mystic's Strike asked "Advantage — Echoes Beyond — …". It was ticked; the attack rolled at advantage, and the one-shot effect was removed.
- **A caveat:** the immobilised target gave advantage too, so this roll can't show the advantage came from Echoes Beyond alone. The harness covers that case.

**On a Spellcraft check**
- **The cast:** ZZ Wizard cast Dancing Lights on the penalised path, a Casting DC 10 check.
- **The prompt:** after the casting-conditions dialog, it asked "+2 circumstance — ZZ probe — …". It was ticked, and the casting card listed "**ZZ probe Circumstance +2**".
- **The result:** the cast fumbled on an open-ended low roll, which is just the dice.

**A forced save stays quiet** (Graham's scope)
- **The save:** ZZ Wizard made a Will save against DC 40, rolled directly as a spell's forced save would be.
- **The result:** **no prompt.** The save tick-box was not applied: only "Wisdom and Wizard base".

## Found, fixed in 3.667.4

**The prompt's rows were squeezed** into a narrow column, a few words to a line.
- **Cause:** they sat in a form-group, whose grid gives each item one column.
- **The fix:** the rows sit in a plain block.
- **Checked:** a live preview of the new layout showed full-width rows before the fix was made.

## Cleanup

- **Removed:** the ZZ folder and its four actors, the ZZ scene, and the 46 chat messages the test posted.
- **A window closed:** one weapon-customise window, which opened when the Short Sword was added, was cancelled.
- **Chat:** back to its 229 messages, ending at the same message as before. No Gamemaster messages were touched.
- **The view:** the GM view is on Oldwatch Main, and the viewport is reset.
