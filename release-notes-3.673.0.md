# TRG Prime 3.673.0

26 October 2026. The seams Inner Tempest's Block 9 needs: Chapter 9's magic items and the aging Appendix. They come from its audit (C1–C10, and C7b, C11 and C12 found while building) and Graham's rulings of 26 October (B9-1 to B9-11).

- **Install over 3.672.1.** Inner Tempest 0.10.0 needs it.
- **These modules work on it unchanged:** Inner Tempest 0.9.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.**
- **Nothing changes for a game that declares none of the new things.**

## What a module can now declare

**C1 — a rune that keeps its wearer from Dying (Karmic Resilience).**
- A registered rune may declare `deathGuard`. It is read from worn armour beside the effects the death guard already reads.
- `reaction: true`: the guard needs a reaction and spends one.
- `askOwner: true`: the question goes to the wearer's own player, wherever the blow is resolved (Q below).
- `grants { label, seconds, conditionals }`: once the guard holds, the creature carries an effect with those conditionals for the given time. It ends by world clock and by round. Karmic Resilience's "+2 circumstance bonus to all dying checks for 1 minute" uses this.
- The dying check carries the action key `dyingCheck`, so such a conditional can be scoped to it.

**C2 — a rune that eases bleeding (Staunching I–III).**
- `bleedFlatCheckReduction` makes the Light Bleeding flat check easier. A number, or one per tier (`[2, 3, 4]`).
- `bleedReduceCheck` (per tier: `{ dc, bands: "moderate" | "any" }`) gives the bands above Light a flat check at the end of the wearer's turn. On a success the largest bleed falls by 1.

**C3 — a value by the wearer's class (Harmony, Karmic Resilience).** A declared bonus, conditional or change may carry `classValue: { classes, value }`. The row takes `value` when the wearer has one of those classes ("+2 … increases to +3 if you are a Disciple or Mystic").

**C4 — the creature struck answers a critical (Guarded).** A rune declaring `criticalGuard { frequency }` is asked of the wearer's player when a critical hit lands on them, before the damage is rolled.
- On a yes, the reaction is spent and the rune's day is marked on their armour.
- The critical's extra dice are rolled separately and are not dealt.
- The wearer heals half of what those dice rolled, rounded up. This reads "the additional HP damage inflicted by the critical hit" as the critical's own dice, before DR. Interpretation 5 had said after DR; the extra dice are not dealt at all, so DR never meets them.

**C5 — the attacker's advantage on the critical roll (Harmony Edge).** A weapon rune declaring `criticalAdvantage { frequency }` is asked when its wielder scores a critical, before the injury roll.
- On a yes, the injury is rolled at advantage.
- Against a minor critical's own disadvantage, the two cancel (B9-3).

**C6 — a module's energy rune (Soulful Strike).** `energy { type, tiers: [{ dice, secondaryCritical }] }` makes a registered rune Command on and off like the core's five energy runes: a Command button, a state, secondary damage of its type and its secondary critical. B9-2 reads Soulful's "severity −3 / −1" as −40 / −20.

**C7 — a rune action that waits for the next Strike (Tranquil Quiver).**
- A declared action with no duration but with conditionals or a `strikeRider` lays an effect on the wielder. The effect carries the offer and a once-rider, both spent by the next Strike its scope reaches, hit or miss.
- A strike rider may declare `beyondFeet` (dealt only when the target is farther than that) and `precision` (dealt as the weapon's own damage type; nothing against precision immunity, and resistance halves it).
- The Strike now tells its riders how far away the target is.

**C7b — until the beginning of your next turn (Mindful).** An action effect declaring `untilTurnStart: true` is given the round it ends in while its user fights in a running combat. The start-of-turn sweep then lifts it at their next turn. Out of combat it waits for the next attack.

**C8 — another skill's road to Create (Monastic Items).** `registerCreateRoute({ key, label, skill, itemTypes, requires, dcStep, ticks })`.
- The skill joins Create's list.
- A creature holding one of `requires` (by item name) may then Create those item types through it.
- `dcStep` is added to the DC.
- The `ticks` join the setup dialog's requirements.
- A Create through a skill that is neither native nor routed is warned against.

**C9 — an aura that runs only while lit (Mystic Incense Burner).**
- An item aura may declare `whileState`. It is emitted only while the item's `runeState` holds that key.
- `startItemTimer(actor, item, { key, state, label, durationSeconds, ending })` (module API) switches a state on for a time. A rune timer may now carry its own `ending` lines.

**C10 — age that takes no Hit Points (B9-11).** An effect flagged `flags.trg-prime.age` has its ability changes left out of maximum Hit Points' Constitution and the skill budget's Intelligence. Every other figure follows them.

**C11 — an item's spell at the item's own PP (Restorative Mat).** The helper `releaseItemSpell(actor, item, { name, uuid, pp }, { apPaid, fixedDC })` casts a spell the way a potion or wand releases one: as an item cast at `pp`, none of the user's PP, with its activation already paid when `apPaid`.

**C12 — a value by the rune's tier, and one name on two kinds of item (Centred I–III).**
- A declared bonus or conditional may give `value: [1, 2, 3]`. It takes the inscribed tier's number.
- Two registered runes may share a name when they go on different items (Centred on armour, Centred on weapons, at their two price ladders). Each item's rune line finds its own.

**Q — asking a creature's own player.** `askOwner(actor, { title, content, yes, no, then, data })` puts a yes/no to the actor's active player through Foundry's user query, otherwise to the GM, otherwise here.
- A registered step (`registerOwnerQueryStep`) runs on the answering client.
- Silence after a minute is a no.

## Found in review

An independent review of the build, before release, found these; all are fixed above.
1. **The GM relay gave up before a player could answer.** A blow relayed to the GM's client that reached Karmic Resilience asked the wearer's player for up to a minute, but the attacker's client stopped waiting after 8 seconds, reported "Damage not applied … the GM needs to apply it by hand", while the GM's client went on to apply it — inviting it twice. The GM's client now says at once that it has a request (`target.working`), and the asker then waits for its answer, up to 90 seconds. No GM still fails in 8.
2. **A yes after the minute still spent the reaction and the rune's day.** The blow had already gone on without it. The answering client's dialog now closes itself 5 seconds before the asker gives up, and a later answer runs nothing.
3. **Harmony Edge was offered on a deadly critical**, which is already rolled at advantage; a yes spent the day for nothing. It is no longer asked there.
4. **A distance that could not be measured read as 0 feet,** so Tranquil Quiver's rider said "0 feet away, not more than 30". It is now unknown.
5. **Guarded answered only weapon Strikes.** "The wielder takes a critical hit" is any critical hit; a spell attack's critical, which adds its Base Damage dice, now asks too. On a yes those dice are rolled, not dealt, and half is healed.
6. **A registered rune could not say what it may be inscribed on.** `registerRunes` now takes `usage` (`{ melee, ranged, thrown, damage, keen, text }`), read by the same check as the core's seven printed usage lines: a rune on a weapon it does not fit is suppressed, with no button and no declarations. Tranquil Quiver: "any ranged weapon".
7. **An item timer could only lapse.** `stopItemTimer(actor, item, key)` (module API) ends one by hand, saying its manual ending; the Incense Burner's Use puts it out.

## Checks

- **New harness pair `verify/mutate-block9-core`:** 66 checks and 86 mutations, all caught (the review's fixes included).
- **Re-anchored to the new code, checks unchanged in meaning:**
  - `verify-chapter6-gear-171-180` (C13b): Create's setup now also hands over its route.
  - `verify-relay-actions` (A1) and `mutate-relay-actions`: WORKING, like RESULT, is a reply and has no handler case.
  - `verify/mutate-chapter7-critical-201-210` (D6/D4) and `verify/mutate-ff30-block28` (S4): a guarded critical's dice leave the blow as a drained one's do.
  - `verify/mutate-ff30-codex` (B17): death guards also read worn runes.
  - `mutate-block37-weapons` (B1): a registered energy rune is switched like the core's.
- **The full sweep on the staged 3.673.0:** 651 harnesses, 642 passed. The 9 failures were the anchors above and the uncalled-exports ratchet; all were re-run on the stage and are green. `tierValued` (C12) is recorded as a deliberate keep: it is called in its own file and exported for the harness.
- **Version pins moved to 3.673.0:**
  - `mutate-block6-core`, `mutate-block7-core` and `mutate-block8-core`
  - `mutate-fixes-3669-2` and `mutate-fixes-3670-1`
  - `mutate-release-links`
