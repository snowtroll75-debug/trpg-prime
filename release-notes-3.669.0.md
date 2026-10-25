# TRG Prime 3.669.0

24 October 2026. The seams Inner Tempest's Block 5 (the racial feats of Chapter 5) needs, from its audit (C1–C9) and Graham's rulings of 24 October.

- **Install over 3.668.2.** Inner Tempest 0.6.0 needs it. Inner Tempest 0.5.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.
- **No migration prompt.**
- **One change for every game:** when a light effect ends while another light is still running (a cast Light ending over a lit torch), the token now shows the light that is left. Before, it kept drawing the light that had ended.

## What a module can now declare

**C1 — a racial feat opened to one heritage.** `registerFeatAccess("race", race, [ "Animal Sense", { name: "Bestial Resilience", heritages: ["Mujina"] } ])`. A plain name opens the feat to the whole race, as before. A heritage limit opens it only to a character of that race with one of those heritages; the racial feat picker asks with the character's heritage. Once a feat is opened to the whole race, a later limit does not narrow it.

**C2 — a spell choice from a printed list, by trait.** The spell chooser takes `names` (the printed list), `traitsAny` (keep a spell with any of these traits) and `alsoNames` (on the list, kept whatever their traits). A module hands its own spec to the chooser (`helpers.chooseSpell(actor, item, spec)`).

**C3 — an area that leaves allies out, and the area rail for modules.** A creature area declared `enemiesOnly` skips its own side. `helpers.runAreaEffect(actor, spec, { targets, results })` runs the creature abilities' area or targeted save, with its ladder, for a module ability that spends its own AP and uses first; `results` collects each creature's degree.

**C4 — a reroll after your own fumble.** `fumbleReroll: { checkTypes: ["attack", "skill", "save"], reaction: true, label }` on a feat or active ability:
- a skill check or save that comes out a Fumble is offered the reroll before anybody reads it; the second result stands, even if worse;
- an attack that could fumble has its fumble check made as soon as it is rolled, when the reroll is there to answer it. If the fumble stands, the reroll is offered before anything else happens: the attack roll is made again at the same penalty, nothing else in the Strike runs twice, and the table is not rolled. A fumble averted there is not checked again;
- it costs the reaction in combat and a counted use; a reroll is never offered again;
- a roll shared by several creatures (C7) is never offered it for the later ones.

**C5 — an ally stepping in.** A defence offer registered `forAlly: true` (with `reachFeet`, 5 at least) is asked of the creatures beside the attacked one, on its side, once a Strike the player aims is committed (after its refusals, the GM's leave and the AP) and before the defender's own reactions. A yes makes the one who stepped in the attack's target. A creature's own reactions and those for an ally are never asked together.

**C6 — a push made shorter.** `forcedMovementReduction: 5` on a declaration carrier takes that many feet off a push, never below 0. The card names what shortened it.

**C7 — one roll against several creatures.** `resolveAction(actor, action, { presetDice, dcOverride, dcLabel, ignoreActionImmunity })`: the first roll's die met again, the DC this creature is met at, and the action's own temporary immunity neither asked nor stamped (the ability keeps its own).

**C8 — two more daily firsts.**
- `{ action, set: "critical", exact: true }`: "treated as a Critical result without the need for a roll". Exactly that degree, even over a better roll; the card says the dice are not read.
- `{ actions: [...], slot, advantage: true }`: advantage on the day's first of these actions, one slot between them.

**C9 — a light a module declares, and lights a player places.**
- `registerLightSources([{ key, label, steps, cap, magical, radiusFeet, dimFeet?, brightFeet? }])`. A registered light is a light like a torch: an effect flagged `lightSource: key` raises the light level, draws the token's glow and crosses the GM relay. `dimFeet` and `brightFeet` say what is drawn when it differs from what is counted. A core key cannot be replaced; the clash is reported.
- `helpers.refreshTokenLight(actor)` makes the token's glow match the lights its effects carry.
- `helpers.placeLightCircles`, `moveLightCircles`, `removeLightCircles`, `lightCirclesOf`: circles that raise the light level where they stand, placed and moved with the area aim (which can now start from a point and keep within a distance of it), with their own clock. They are found on the scene they were placed on, and a player who cannot write a circle moves or removes it through the GM.

**The conviction refund (B5-3).** `convictionRefund: { skills, degrees, label }`: a conviction point spent on Advantage for one of those skills is given back, and does not count as the round's spend, when the result is one of those degrees. Inner Tempest's Adaptive Mind. Read after Scoundrel's Luck and never with it, never for a point Luck of Heroes kept, and once per card when a DC arrives later.

**Innate spells.** An innate spell's attack is the action `innateSpellAttack`, so a conditional can ask for it. A spell DC bonus declared `innateOnly: true` reaches only an innate spell's DC. Inner Tempest's Elemental Attunement.

**A switched ally aura.** An ally aura declared with `emitterState` now lays its effect, and grants its conditionals, only while an effect switches it on (`auraSwitch: { state, until }`), as the save auras already did. The aura effects are brought into step when the switch arrives or leaves.

## Found in review

An independent review of the build, before release, found these; all are fixed above.
1. Fortune's Reversal on an attack re-ran the whole Strike (its AP, its reactions, its rune and ammunition steps) and could be offered again on the second roll. The attack roll alone is now made again, once.
2. A creature met by a shared roll (Spirit Roar's later enemies) was offered a fumble reroll of a roll it did not make.
3. An ally was asked to step in before the Strike had checked its refusals and spent its AP, so a reaction could be spent on a Strike that then refused. It is asked after.
4. When a light effect ended, every client redrew the token's light. One does now.
5. A player moving or removing Foxfire's circles wrote Regions it could not, and a circle on another scene was not found. Both go through the GM, by scene.
6. An `innateOnly` spell DC bonus did not exist, so Elemental Attunement reached prepared spells.

## Checks

- **New harness pair `verify/mutate-block5-core`:** 51 checks and 58 mutations, all caught.
- **Re-anchored to the new code, checks unchanged in meaning:** `verify-defence-disadvantage` (D3), `verify-temporary-immunity` (D13), `verify-it-fixes-3668-1` (C7, C9), `verify-chapter6-gear-161-170` (F3b), `verify-session-fixes-1022` (D13, D15), `verify-spell-aim` (D1), `verify-live-3612` (A4: nine uses of the card's resolver, the new refund among them), and the mutations `mutate-defence-disadvantage`, `mutate-temporary-immunity`, `mutate-it-fixes-3668-1`, `mutate-module-feats`, `mutate-spell-aim` (D1).
- **Full sweep** on the staged build: 635 harnesses. The first run found four mutation anchors made ambiguous or moved by the new code (`mutate-block3-core`, `mutate-ff30-block2`, `mutate-offered-conditionals`, `mutate-spell-aim`); the new lines were reworded so the old anchors stay unique, `mutate-spell-aim` was re-anchored, and those four pairs and the ten others reading the same lines were run again on the stage: all green, every mutation caught. `verify-no-undefined-names`, `verify-rules-have-callers` (backlog unchanged at 513) and `verify-checks-can-fail` green.
