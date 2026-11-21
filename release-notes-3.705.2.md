# TRG Prime 3.705.2: what the player-perspective live test found

21 November 2026. Follows 3.705.1. Branch `fix/live-test-3705-2`, from `fix/feat-lunge` at `0463a95`.

Graham asked for everything not yet tested to be tested, from a player's seat, with the PC Tester profile. That pass (`live-testing-report-3.705.1-player.md`) found four defects. All four are fixed here. No data changes, and no migration.

## A. A Lunge made with an action feat posted no Lunge card

**What happened:** Lunge → Vital Strike, Distracting Strike, Combat Grapple or Quick Draw. The Strike got the Reach trait and its −2 at 10 ft, and the AP were right, but the card saying it was a Lunge never appeared. For Lunge → Strike, Trip and the other basic actions, it does appear.

**Why:** `runLunge` posts its card only when the action returns something, and reads nothing as "cancelled". Those four feat handlers ended by posting their own card and returned nothing.

**Fix:** each now returns `struckOrNull(checks)`. That is its Strikes when at least one was made, and null when every Strike was refused (a target still out of reach, no weapon). A refused feat is not a Lunge that happened, so it gets no Lunge card.

## B. Coup de Grace printed "[object Object] critical"

**What happened:** the card read "Automatic hit (treated as an unmodified 20): AV 11 — [object Object] critical."

**Why:** since 3.548.0, the critical has been an object (severity, bonus dice, injury immunity), and the card still printed it as the string it used to be. The same change keeps the critical against a critical-immune target, which is right for a Strike (Graham's ruling of 10 September 2026). So an immune target's card also printed "[object Object] critical", not "no critical".

**Fix:** `coupDeGraceHitLine` prints the severity ("deadly critical" and so on). When the GM answers that the target is immune, it prints "no critical (target is immune)", as Coup de Grace's own sentence says: "the coup de grace does not deal critical damage or effects".

## C. Reactive Disarm could never be taken

**What happened:** the player fumbled a Strike (forced) against a creature with Reactive Disarm. The GM's "Disarm ZZ PC Lunger" button did nothing, and the console showed `TypeError: game.user.updateTokenTargets is not a function`.

**Why:** `updateTokenTargets` is not in Foundry V14. The button has thrown since it was written (3.631.0), before anything happened.

**Fix:**

- **Targeting:** the fumbler is targeted with `Token#setTarget`, as every other reaction does.
- **When it is used up:** the card and the once-a-round frequency used to be marked *before* the Disarm was tried. With 3.705.0's reach check, a fumbler out of reach (a Lunge, a reach weapon) would have used up the round's Reactive Disarm for nothing. They are now marked only when the Disarm was actually taken (`reactiveDisarmTaken`). After a refusal or a cancelled dialog, the button stays usable.

## D. Disarm Block said it grabbed before its Disarm was refused

**What happened:** the player's Lunge at 10 ft missed by the foe's shield DB (forced). The foe's Disarm Block was refused for reach, as it should be ("Yes disarm does use reach"). But the log already showed "turns the blow and grabs for the weapon" above the refusal.

**Fix:** the Disarm is tried first. The Disarm Block card follows only a Disarm that happened, reworded to follow it: "turned the blow and grabbed for the weapon: the Disarm above."

## Not changed: observations for Graham

- **Whip, adjacent Trip:** a Trip against an adjacent foe while holding the Whip is made "with Whip", taking the Whip's −4. The Whip "can't be used against adjacent creatures". Should the Trip fall back to a free hand, or be refused?
- **Combat Grapple:** its card says the target is Grabbed, but the condition isn't applied. A plain Grapple Attack does apply it.
- **Lunge's tooltip:** the Use button says "1 AP", but the chosen action pays its own cost (Double Slice and Charge are 3).
- **Reaction offer cards:** they are whispered to the GMs, but the player whose attack created one can also read it. The buttons are hidden, but the player can see which reactions the foe has.
- **A weapon feat on a target out of reach** spends its AP and then makes no Strike ("No Strike was made"). This holds for every Strike feat, with or without Lunge: the feat pays before its Strike is checked.
- **Lunging Stance's +5 ft for Attacks of Opportunity** is still not automated.

## Code

- `combat/action-feats-workflow.mjs`: `struckOrNull`. The Combat Grapple, Distracting Strike, Quick Draw and Vital Strike handlers return it.
- `combat/coup-de-grace.mjs`: `coupDeGraceHitLine`. `combat/action-workflow.mjs` uses it.
- `combat/reactive-disarm-workflow.mjs`: `Token#setTarget`; `reactiveDisarmTaken`; card and round marked after; button re-enabled.
- `combat/reaction-feats-workflow.mjs`: Disarm Block's card after its Disarm.

## Harness

- **New:** `verify-live-findings-3705-2` (32 checks) and `mutate-live-findings-3705-2` (12 mutations).
  - The four defects reproduced (R).
  - `struckOrNull` driven, and every feat the Lunge chooser offers checked to return it (A).
  - `coupDeGraceHitLine` driven with real outcomes, immune and not (B).
  - `reactiveDisarmTaken` driven, plus the targeting call and the order of try, gate and mark (C).
  - Disarm Block's order (D).
- **Re-anchored:** `verify-lunge-actions-3705` E8 and two `mutate-lunge-actions-3705` anchors (the reactions' Disarm calls are now assigned to `result`). The intent is unchanged: both are still reach-checked.
- **Version pins** raised to 3.705.2. The schema and migration gates stay at 3.705.1, since there's no new pass.

## Testing

- **Core:**
  - Every script reading a changed file or carrying a version pin, plus the whole-tree checks: 158 verify and 111 mutation scripts. **All pass.**
  - `verify-checks-read-source`: 726 s, pass.
  - The two long mutation files: `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (50 min) both pass.
- **Modules:** the four module scripts that read the action workflow (Pillars of Faith `verify-foundation`, `verify-classes`, `verify-automation`; Inner Tempest `verify-block6`) give the same results as on 3.703.1. `verify-classes` fails as it did then, on the module's own version pin (0.12.6 against 0.12.5).
- **Pack:** unchanged and not rebuilt. After the runs, every pack folder was restored from git and is byte-identical to 3.705.1.
- **Live Foundry: not yet run for 3.705.2.** What to check:
  - A Lunge with Vital Strike (or any of the four feats) posts its Lunge card.
  - Coup de Grace prints the severity, or "no critical (target is immune)".
  - Reactive Disarm: refused at 10 ft with the button still usable, then taken against an adjacent fumbler.
  - Disarm Block out of reach posts no grab card.
