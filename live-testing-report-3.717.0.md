# Live testing report: TRG Prime 3.717.0 (the metamagic that chooses who is affected)

27 November 2026. Tested in the Test world, on a throwaway scene called "ZZ SM Live 3717", with TRG Prime 3.717.0 as Graham installed it. Both clients ran `tools/spell-matrix/live/matrix-driver.js`, which clicks the real dialogs. The data is in `tools/spell-matrix/data/live-3.717.0.json`.

## Setup

- **GM:** Testing Dude at `localhost:30000`.
- **Player:** PC Tester at `127.0.0.1:30000`, logged in at the same time.
- **Casters**, all owned by the player:
  - **ZZ SM Wizard** (arcane, level 10, caster level 10), with Imposing Will, Selective, Split, Distant and Extend, and a component pouch.
  - **ZZ SM Cleric** (divinity), with Aligned Spell.
  - **ZZ SM Druid** (verdant).
  - **ZZ SM Bard** (ethereal, caster level 5).
- **Targets:**
  - **ZZ SM Ally:** friendly, player-owned.
  - **GM-only NPCs with 30 HP each:**
    - **ZZ SM Foe Evil:** Humanoid, Evil.
    - **ZZ SM Foe Good:** Humanoid, Good.
    - **ZZ SM Zombie:** Undead, Mindless.
- **Dice:** the player's d20 was fixed on 15 and the GM's on 3, so a save die of 3 on a player's cast came from the GM's client.

## Results

16 cases: 14 from the Player, 2 from the GM. All passed, and three found a defect (D1–D3), fixed in 3.717.1.

| # | Seat | Case | Seen | Verdict |
|---|---|---|---|---|
| IW1 | Player | Command at the Mindless zombie, no feat | Refused after the Warp dialog: "ZZ SM Zombie is immune to the mental trait". 0 PP | Pass |
| IW2 | Player | The same with Imposing Will: undead | 10 PP (2 + 8). The zombie's Will save was rolled on the GM's client (3, a fumble) and it was affected. The card says Imposing Will let it through | Pass, with D1 |
| IW3 | GM | The same | Partial save (18 vs 20); affected | Pass |
| X1 | Player | Acid Bolt at two foes, no Split | Refused: "targets 1 creature … 2 were chosen". 0 PP | Pass |
| X2 | Player | Acid Bolt + Split ×1 at two foes | 8 PP. One attack roll (25 vs DB 10) for both. Each hit took 4d4 instead of 4d6. The card names the extra target and says this was one attack for the multiple attack penalty | Pass, with D2 |
| X3 | GM | Acid Bolt + Split ×2 | 12 PP is over the cap of 11, so the cast was an overcast: DC 30 and Soul Drain. It was a Partial, so the spell failed | Pass (the overcast rules, not Split) |
| X4 | GM | Acid Bolt + Split ×1 at Foe Good and the zombie | 8 PP. Attack 28 against both; HP 30 → 12 and 30 → 11 | Pass, with D2 |
| S1 | Player | Chill Storm + Selective ×1 | 5 PP; the template caught three. Ticking two asked again ("2 ticked — you bought 1."); ticking one excluded Foe Good, whose HP did not change. The others' saves were rolled on the GM's client | Pass |
| A1 | Player | Cleric's Command + Aligned: good, at Foe Evil | Refused: "ZZ SM Foe Evil has no good trait (Aligned Spell)". 0 PP | Pass |
| A2 | Player | Cleric's Sound Burst + Aligned: evil | 5 PP; the template caught three. Foe Good and the zombie were named as not affected; Foe Evil took 13 sonic and was Deafened | Pass |
| G1 | Player | Geas with the unwilling warp, at Foe Good | 10 PP. "Save: Will Negates against DC 20", rolled on the GM's client; affected | Pass |
| G2 | Player | Geas's 1-year warp + Extend | "Not Cast … Nothing was spent" (U8) | Pass |
| U1 | Player | Wizard (arcane): Unshakable's touch warp, on the Ally | 10 PP. The Ally became immune to Stunned; the Wizard did not | Pass, with D3 |
| U2 | Player | Bard (ethereal): the same warp | "Not Cast — A warp you chose is arcane only, and your tradition is ethereal. Nothing was spent." | Pass |
| P1 | Player | Druid: Pass Without Trace's area warp | 6 PP. The emanation on the Druid caught five allies. The chooser ticked everyone except the Druid, and the card said it spared the Druid | Pass; see Q1 |
| D1 | Player | Wizard (arcane): Mage Armour + Distant, on the Ally | 6 PP (2 + 4, not 6); Mage Armour landed on the Ally (R-0041) | Pass |

## Defects, fixed in 3.717.1

- **D1, cosmetic.** Imposing Will's card line ended "…immunity to the mental trait..", with two full stops, because the metamagic notes add their own.
- **D2.** Under Split Spell, the critical's extra dice kept the unstepped die: "4d4 + 2d6 critical". The book steps "the damage die of the spell attack", and a spell's critical dice come from its Base Damage entry, so they now step with the hit: 2d6 becomes 2d4.
- **D3.** Unshakable still carried a note saying "The +4 PP option (range touch, arcane only) is cast by hand on another creature". That warp has been automated since 3.716.0, and the note contradicted what had just happened. The note has been removed from the pack and from characters' existing copies.

## For Graham

**Q1: should the caster be ticked by default in the chooser for a beneficial area spell?** Pass Without Trace's area warp uses the "choose who in the area" dialog. That dialog leaves the caster unticked, which is Missile Storm's convention, since you rarely want your own storm to hit you. For Pass Without Trace the caster is usually the first person who wants it. The caster can tick themselves, so I have left it unchanged until you say.

## Not covered

- **Selective's "Exclude nobody":** tested by the harness only.
- **Aligned with two traits, and a non-divine caster not being offered Aligned:** tested by the harness only.
- **Geas's "unlimited" warp:** Geas has no effect rows, so there is no clock to check.
- **The multiple attack penalty after Split:** checked in code, not counted live, since it was out of combat.

## Cleanup

- **Deleted:** the actors, the scene, and the test users' messages after index 296.
- **Restored:** Caves is active again, world time is 96, and the game is paused.
- **Dice:** restored on both clients.
