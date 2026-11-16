# TRG Prime 3.689.0

13 November 2026. The seams Eldritch Arts' Block 9b (its 34 runes and 9 specific items) needs: **H21**, more things a registered rune may declare, and **H22**, the Strike's natural die and its fumble for modules. Both from the Block 9 audit as Graham answered it ("Go with your recommendation for all questions and proceed", 13 November, 00:23). Built on 3.688.4. No migration; no world data is touched. Every addition is read only for a rune that declares it, so nothing already in a world behaves differently.

Eldritch Arts 0.14.0 needs this release.

## H21: what a rune may declare

Each is read where the system already does that thing, and only while the rune's item counts (equipped; runed clothing not under body armour), as every rune declaration before it:

| Key | Read by | First used by |
|---|---|---|
| `controlLevelBonus` | the sheet's control levels (C12's sum) | Summoner's Brand: +2 whilst wielded |
| `spellAdder` (per tier) | the Spell Adder sources | Arcanum Seal I–III: +1 to +3 |
| `resistances` | the actor's resistances | Force Warding, Soul Warding |
| `maxDexBonus` | the armour piece's Max Dex (a specific item's printed figure too) | Comfort: +1 |
| `donAP` | the item sheet's donning time | Swiftbind: 1 / 2 / 3 AP, full suits +1 |
| `armourCastingPenalty: 0` | the cast's armour penalty: the tradition's and High Magic's DR × 4 | Transcendent |
| `criticalRollModifier` | the critical injury roll against the wearer (not below 1; not on the faces it names) | Astral Echoes: −5 / −10 / −15, not on an unmodified 66 or 100 |
| `uncoveredDR` | on a critical to a location the armour does not cover, a share of its DR | Aegisflow: half / all |
| `defenceDC` (rows, per tier) | the defence rows a Strike and a spell attack meet | Bound Circle, Ley Binding |
| `controlSaveModifier` | the page-242 DC 20 Will save of a creature over its controller's cap | Binding Sigils: −2 / −4 / −6 |
| `sleepAdvantage` | Sleeping in Armour's save, with advantage | Comfort |
| `ignoreResistance` | the Strike's own damage packet ignores these resistances | Aetherfang: physical, not immunity |
| `extraBaseDie` (`true`, or a module's `when`) | one more base die on the Strike | Leybound: within 30 feet of a ley line |
| `fumbleDCModifier` | the weapon's Fumble DC | Gravitas: +2 |

And beside them:

- **A rune's defence row may be scoped by its attack kind alone.** Ley Binding names nothing but "attack spells", and it is read only while its armour counts. Only the rune path is given this; every other row keeps the 3.684.0 rule that a kind alone is still "every attacker", so no existing row changes.
- **A summoned attacker.** A creature somebody holds in their control register as bound or conjured carries the attacker trait "summoned" (and "conjured" for a conjured entry) on a Strike and a spell attack, beside its own traits. Bound Circle reads it.
- **A resistance suppressed for a time.** A live effect flagged `suppressedResistances: [types]` takes those types out of the creature's resistances while it lasts. Essencebreaker uses it.
- **One item, several cast-item choices.** A cast-item offer may name a `slot`, so one shield can offer each catalyst embedded in it. An offer without a slot is one per item, as before.
- **A module helper for the Exhaustion check** (`rollExhaustionCheck`), for Chrono's turn-end check.

## H22: the Strike's natural die and fumble

- `trgPrimeStrikeResolved` now carries **`natural`**, the attack check's unmodified d20 (the rerolled one, if a reaction rerolled it), and **`fumble`**, true for a confirmed weapon fumble.
- **A new hook, `trgPrimeWeaponFumble`** `{ attacker, weapon, target, row, natural, melee }`, fires once per swing for a confirmed weapon fumble, whether or not a creature was targeted, after the fumble table is read.

## The harness

- **New pair `verify-block9b-core`** (48 checks) and **`mutate-block9b-core`** (46 mutations, all caught).
- **Re-anchored, no change of meaning** (each marked in the file):
  - `verify-block2-core` A6, `verify-block6-core` C10, `verify-block7-core` C9 and its mutation: the resolved-Strike hook's last lines, which now carry the natural die and the fumble.
  - `verify-ea-block6d-core` D5/D6b, `verify-stance-declarations` F2, `verify-opposed-aura` E1 and their mutations, and `mutate-ward`: a summoned attacker's register traits now join its own on the Strike's and the spell attack's defence rows.
  - `verify-it-fixes-3668-1` C8, `verify-chapter6-gear-171-180` D8e and their mutations, `verify-damage-riders` C2 (span widened), `verify-item-fixes-3626-1` B1: Leybound's die joins the Strike's base dice.
  - `verify-ff30-block28` S4 and its mutation: Aetherfang's kept resistances on the main packet.
  - `verify-ea-block5d-core` L5: Summoner's Brand's control levels.
  - `verify-block4-core` C3: the stance flag is now read as `stanceRow`.
  - `mutate-block9a-core` H19: an offer is keyed by item and slot.
  - `mutate-chapter6-gear-144-150`: the Comfort rune's Max Dex sits after the Fortification block.
- **Version pins** raised to 3.689.0.
- **Full sweep on the final tree:** 739 harness files in four shards, 0 failed, none unpaired, none missed.
- **Independent review:** found Chrono never setting its state, Aegisflow counting DR twice on a covered location, and five smaller gaps in the module's automation (fixed in Eldritch Arts 0.14.0). A second look at the defence-row scope change found no defect.
