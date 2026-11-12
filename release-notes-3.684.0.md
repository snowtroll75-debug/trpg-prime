# TRG Prime 3.684.0

4 November 2026. The seams Eldritch Arts' Block 6 needs: G1–G26 in `ELDRITCH_ARTS_BLOCK6_AUDIT.md`, as Graham answered it the same day ("proposed except Q89: One release"). Block 6 is Chapter 5's 23 archetypes and 97 class feats, and the module's metamagic. Built on 3.683.0.

- **Install over 3.683.0.** No migration, and no world data changes.
- **Eldritch Arts 0.9.0 needs it.** Eldritch Arts 0.8.0 and Inner Tempest 1.0.4 run on it. The changes they will notice are listed under "For every world".

## For every world

- **DB bonuses now apply against spell attacks** (G20, a fix).
  - **Before:** a spell attack read only the target's own DB, Dragonhide and Resilience. So Forbidding Ward's "+1 status bonus to DB … against the target's attacks, spells and other effects" missed every spell.
  - **Now:** a spell attack adds every defence-DB row the target has, as a Strike does. Every row in the core, Inner Tempest and Eldritch Arts was checked by the review, and none is limited to weapons by its own text:
    - Thengar's;
    - the wards: Stone Shield, Forbidding Ward, Anticipations;
    - Radiant Aegis;
    - Inner Tempest's Challenge (its −2 against everyone else now shows on spells too), Oath of Honour, Interpret Style, Read Intent, Spirit Stance and Martial Affinity.
  - **Rows the review could not check:** Pillars of Faith, Blood Lords and Vhalendar aura data weren't on disk to check. A row there worded "melee", "ranged" or "weapon" would need `attackKinds: ["weapon"]`, which every attack path now honours.
  - **A one-attack ward is read before it is spent** (for example, Inner Tempest's Observe Technique +2). The Strike and bomb paths already did this; the spell path now does too.
- **Storing Rune now stores** (G16, a fix). A spell store was read only from an Arcane Bond, so a Rune Sorcerer's Storing Rune answered "no bonded item". A store can now be held by the bond, by the spell itself (Storing Rune) or by an item.
  - **The sheet** lists every store, each with its own Release button.
  - **Casting Spell Storing** no longer clears a rune's store.
- **Spell damage names its caster** on `trgPrimeDamageApplied` (G23). So Inner Tempest's Dread Wolf and the Oaths now answer damage from a spell as well as a Strike, which matches their text.
- **Faster damage in large worlds.** The new "sustained by another creature" check (G24) runs only when someone is sustaining a spell for another creature.

## New seams (for modules)

| # | Seam | What it does |
|---|---|---|
| **G1** | **`registerMetamagic`** | Module metamagic in the Warp? dialog, in the same totals as the core's: its PP raise the Casting DC, count against the cap, and are refunded by degree.<br>• An option may be gated, spend a Focus use (Q96: when the cast pays its PP), pay in PP, AP or a resource, add riders after the cast (`after(ctx)` is told the Save DC), or be granted by an effect or a rod.<br>• Its effects: advantage on the check, added traits, a new damage pool, Save DC rows, a second target at half damage, a recipient for a self-only spell, ×1.5 range, duration or area, a die step, fumble and Resonance bias, a free warp, and Spellthread's woven second spell.<br>• It applies to learned and innate casts. On an innate cast its PP come from the pool, not the free innate budget (Q95). Item casts take it only with `itemMetamagic`, up to `itemMetamagicCeiling` (Q130). Never on cantrips, scrolls, potions or stored spells (Q94).<br>• The cast hooks carry `metamagic`, `metamagicTaken`, `metamagicPP`, `metamagicPayments` and `threaded`. `helpers.metamagicCatalogue(actor, {spell})` lists it all. |
| **G2** | **`registerCastPPSource`** | Another way to pay a cast's PP, after the rod and before the caster; counted in the availability test and split by degree. The cast-option ctx sees `ppSources: [{key, label, drawn}]`. |
| **G3** | **`registerMetamagicPayment`** | An option's PP paid in AP instead, while the Casting DC counts them as if paid. |
| **G4** | **`registerCastCostModifier`** | PP off what is paid, with a floor. Payment only: the DC, the cap and the save DC read the PP as cast (Q93). |
| **G5** | **`registerFumbleModifier`, `registerResonanceModifier`** | Bias on the fumble and Resonance rolls; a single roll for High Magic; a forced Resonance, rolled with the cast's own context (Q148). The ctx says whether the cast was a stored release. |
| **G6** | **`registerChargedItemRule`** | One spend path for every charged-item cast. A rule may set the wield limit, cut the cost, pay from the wielder's PP, allow metamagic, and add an after-release step. Item Depletion with disadvantage keeps the lower roll (Q131). |
| **G7** | **The 0 HP moment** | `registerUnconsciousOffer` is asked before you fall. It runs on the client that applies the damage; a module asking the player goes through `askReactor`. A zero-HP guard may heal to half, and `trgPrimeDeathGuardHeld` fires when a guard holds. `dyingCheckWaived` skips one Dying check. |
| **G8** | **Archetype progression** | An archetype flagged `progressionSinceTaken` is stamped with the level (and owner) it was taken at. "+N levels" then counts the levels since. "Cannot progress" never passes. The core's Archer is not opted in, so it is unchanged (Q90). |
| **G9** | **Prerequisites** | "A or B N ranks" is read for a feat flagged `compoundSkillPrerequisites`. `registerFeatEligibility(name, actor => reason)` covers what the parser can't read. |
| **G10** | **Casting while raging** | `castsWhileRaging` lifts the rage's cast refusals and Sustain a Spell's Concentrate bar; other Concentrate actions stay barred (Q104). |
| **G11** | **A BSB floor** | `registerPPGrant(name, { stat: "bsb", halfLevel: "up" })`. |
| **G12** | **Per-PP riders** | `castPP` (the PP as cast; for an innate spell, its printed PP plus warps and metamagic) on the cast hooks. `perPP` damage and healing riders; `spellDamageBonus { valueFrom: "spellPP" }`. |
| **G13** | **Sense ranges** | `senseRangeBonus: { sense, feet }`. |
| **G14** | **Cast options** | An attack-only bonus and a one-target Save DC; an attack-only gate row. |
| **G15** | **Damage-type warps** | `registerSpellWarps` matches by any trait or damaging spells; a warp may change the damage type. |
| **G16** | **Spell stores** | A store held by the bond, the spell or an item. `storeForeignSpell` keeps an absorbed spell, released as the storer's own cast (Q115). Its copy is stripped of the original caster's innate, item and book state. |
| **G17** | **Cast reactions that reshape** | `{ scale: 0.5 | 2, saveBias, retargetCaster }` (Q118). The ctx carries `castPP`, the PP as cast (Q119). |
| **G18** | **Conviction refund on saves and skills** | `checkTypes` and `frequency: "daily"`. The day's use is remembered on the card, so a DC change on the card is honoured. |
| **G19** | **Rune damage past resistance** | `runeDamageBypass`. |
| **G20** | **Defence rows on spell attacks** | `when.attackKinds` (`spell`, `weapon`, `bomb`, `action`) and `when.lightLevels` on DB rows. |
| **G21** | **Extra daily uses** | `registerExtraUses(featName, { ability, perCopy })`. |
| **G22** | **A free somatic component by tradition** | `freeSomatic: { traditions, needsPouch, label }` (Q112). |
| **G23** | **The caster on damage** | `applyTypedDamage({ sourceUuid })` from every spell damage path. |
| **G24** | **Range from another token; a sustainer** | `castSpell(…, { rangeFrom })`; `helpers.setSpellSustainer`. |
| **G25** | **Small helpers** | `helpers.innateSaveDCFor`, `helpers.spellCastable`, the weapon on an attack's reaction ctx, `cantripBonus`, `meleeAbility`, target-scoped riders, `warpFreeSchool: "*"`, `castSpell(…, { preparedSymbol })`, Combat Inscription's DC part. |
| **G26** | **`registerPendingCastStep`** | A step before a pending cast's interruption settles (Q149). |

## Found in review (two independent reviews, before release)

- **Spell Storing could wipe a Storing Rune's spell,** and the sheet's Release reached only the bond. Fixed (see above).
- **An absorbed spell kept its original caster's flags.** So a monster's innate spell would have released as innate, with no check and no PP. It is stripped now, and it can't be refused after its record is cleared.
- **A one-attack ward was spent before it was read** on a spell attack. Fixed.
- **No row could say "weapon attacks only".** Every attack path now names its kind.
- **The item metamagic ceiling** counted only PP-paid options; it counts AP- and resource-paid ones too. A rod-paid option counts 0.
- **The cast-reaction ctx gave an innate spell 0 PP.** Eldritch Arts' Absolute Denial would have stopped every innate spell. `castPP` is now on it.
- **A preset metamagic option couldn't spend its Focus.** It finds its feat now.
- **Fate's Favour's daily use** was lost when the DC was changed on the card. Fixed.
- **A copied archetype kept another character's level stamp.** It is re-stamped on its new owner.
- **The sweep's 13 mutation failures** were each a check pinned to code the seams had moved, or one too loose to see a second call. None was a regression. Each check is now pinned to the exact call. That covers Sustain a Spell's dispatch, the attack path's damage-type choice and Scorching Ray's per-ray multiple attack penalty.

## For Graham

- **G20's breadth:** every DB row now meets spell attacks (see "For every world"). It follows the book's wording of the rows checked. Say if any row should stay weapon-only.
- **Two older defects found, and not changed without your word:**
  - **Typed stacking on DB:** defence rows are summed untyped on both Strikes and spells. So two status bonuses to DB (Anticipations +4, Forbidding Ward +1) give +5.
  - **Economic Spell and Signature Spell** lower a spell's PP total but not the PP actually paid.
- **G9's compound prerequisites are opt-in.** 17 core feats print the same "A or B N ranks" shape (Spell Recognition among them) and still pass open. Say if the core should gate them.
