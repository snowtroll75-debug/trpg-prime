# TRG Prime 3.666.3

22 October 2026. Fixes Graham's two reports from this morning.

- **Install over 3.666.2.** Inner Tempest 0.3.3, Pillars of Faith 0.11.1 and Fiends & Fables Prime 0.45.2 work with it unchanged.
- **There is a migration prompt.** It clears the duplicate queued modifiers already on sheets: see below.

## Keldran's Detect Deception penalty on every roll

Graham: "One of my characters Keldran has the attached options appearing on skill checks… lots of duplicates and this is not a Detect Deception check so should not even apply here."

Keldran's Acrobatics dialog offered ten copies of "-4 circumstance — Detect Deception: on all future Detect Deception checks against the target until you achieve a Critical against them with this skill". All ten were queued within an hour on 17 September.

**Cause.**
- Since 3.101.0, every outcome row naming a circumstance bonus or penalty has been read by a generic reader and queued as a "granted modifier". A queued modifier is offered on the character's next rolls.
- Since 3.565.0, Detect Deception's Fumble has had its own proper rule: a -4 against *that* target, on Detect Deception only, cleared when you score a Critical against them.
- Nobody told the generic reader. So every Fumble also queued an unscoped copy, offered on every roll the character made, for ever, one more copy per Fumble.
- **Aid Defensive and Aid Offensive** had the same fault. Their bonus already goes onto the ally as an effect, and the reader queued a second copy on the *aider*.

**Fix.**
- **The generic reader now leaves those three actions alone.** Their own rules apply them. Detect Deception's -4 against the target, and its clearing on a Critical, are unchanged.
- **A queued modifier that names its own action waits for that action.** For example, Subsist's Fumble ("-2 to Subsist checks for 1 week") is offered only on Subsist, not on Acrobatics.
- **A lasting modifier is queued once.** Owing "-2 for all future Subsist checks" twice is still owing it once. A "next roll" one (two Treat Disease results, say) may still be owed twice.
- **The migration clears the copies already on sheets.** It removes the stale Detect Deception and Aid copies, and every repeat of a lasting modifier, from characters and placed creatures, and reports how many it removed from whom. Keldran's ten go. The report also says who else had any.

## Orb of Fire with no target dialog: the scene's levels

Graham: "Some attack spells are not asking for a target when casting (and need it doing manually) such as orb of fire. Hurling works, but orb spells do not." He then asked: "can you please log in as Lewi and try this again with the Orb of Fire."

**Found logged in as Lewi.**
- Oldwatch Main has three **levels** (Foundry V14): Level, Upper Signal Room and Cellar. All seven tokens stand on Upper Signal Room.
- A client that loads a scene opens on its **default level**, and Foundry draws only the viewed level's tokens. So Lewi's screen held no tokens at all.
- The target picker, finding nothing to offer, returned "go on" in silence. Orb of Fire then went off at nobody: "No target selected — resolve the attack against the target by hand".
- Joe's screen was on Upper Signal Room, which is why his Hurling found the Elf. The orbs were never the difference.
- **Reproduced:** as Lewi, Orb of Fire went straight to Casting Conditions.
- **With the fix's logic applied:** after viewing Upper Signal Room, the same cast asked "Orb Of Fire — Select Target" with all seven tokens listed. That cast was cancelled, so nothing was posted.

**Fix, in three parts.**
- **A player's screen opens on their own token's level.**
  - If a player's canvas is drawn on a level showing none of their tokens, it moves to the level where their character's token stands (or any token they own), when they may view it.
  - A player already looking at one of their tokens is left where they are.
  - The GM is never moved.
- **The target picker moves to the caster's level first.** If the screen has no tokens, the picker views the level the acting creature's token is on, for the GM too, and says so ("Viewing Upper Signal Room, where Borin Slatevein is.").
- **If there is still nothing to pick, it asks.** The dialog says why:
  - the canvas is switched off; or
  - this scene's tokens are on another level, named with how many tokens each holds; or
  - the scene has no tokens at all, naming the GM's active scene.
- **The dialog's buttons.** It offers a **View <level>** button for each level holding tokens, which views it and asks again. **Go back** (the default) stops before anything is spent. **Continue with no target** keeps the old behaviour.

This applies to everything that uses the picker: spells, Strikes, actions and items.

## Checks

- **New harness pair:** `verify/mutate-dedicated-rows`, 26 checks and 29 mutations, all caught. Section E covers the levels.
- **Re-anchored, without changing what they test:**
  - block2-core H6, now `readsGenericModifier`;
  - ff30-block17 S2, the automatic pending path's new line;
  - session-fixes-1022 C8, where the stamp now *reaches* 3.666.1;
  - the stamp mutations in drive-3622 and focus-default;
  - drive-36222 B1, now `let actorToken`.
- **The uncalled-export ratchet:** the dedicated-action list is kept for its harness, with a reason.
- **Schema stamp:** 3.666.3, the new pass.
- **Full sweep: 617 of 617 green.** It ran on a clean stage: the 3.666.2 release plus exactly this release's changed files.
