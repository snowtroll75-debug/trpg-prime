# TRG Prime 3.551.0 — the double-apply, found by driving it

10 September 2026. Live testing of 3.550.0 in Graham's world confirmed the pages 6–15 fixes and found one defect in the new rule. This closes it, and closes the same latent fault in the death watch.

## What live testing confirmed

Halfling resolves Str −1 / Dex +2 and Gnome Str −1 / Dex +1 on a real sheet, with size, speed and HP right; Dwarf and Orc match their printed lines too. Casting DCs came out 11, 13, 14, 16, 17 for PP 1–5. A second background is refused on the drag and API routes, not only the picker. The ability-collapse rule applies the right condition for each score, lifts it when the drain is removed, refuses to wake a character who is unconscious at 0 HP for reasons of its own, and kills on Constitution −5 with the skull applied and `isDead` agreeing.

Worth recording for future testing: an ability's **base** is clamped at −4 by Chapter 1's own floor, so the −5 rule cannot be reproduced by typing on a sheet. It arrives only by drain — an effect writing a slot, or a direct write to one. That is correct, and it is not obvious.

## The defect

Every condition the rule applied landed **twice**, and its card posted twice. Reproducible on all four attempts, by both routes a drain can arrive by.

The behaviour looked right, because statuses are a set. What was wrong was underneath: the actor carried two identical Active Effect documents, and the player read the same card twice.

The cause is the shape of the rule rather than its logic. Applying a condition is itself a document event, and this rule listens for document events — so the write it makes re-enters it through its own hooks. On that second pass, `actor.statuses` is a DERIVED set that had not yet been rebuilt, so the rule read "nothing applied yet", applied it again, and announced it again. The in-flight guard did not cover it because the re-entry lands after the first pass has already returned.

**The death watch has had the same fault since 3.373.0.** It toggles the Dead status from inside a document hook and tests `actor.statuses` the same way. Nothing had ever exercised it from an effect-creation hook, so it never showed; the Constitution death did, leaving two Dead effects on the actor.

I want to be straight about the diagnosis: the behaviour is certain and reproducible, and I could not fully reconcile my console instrumentation with it — a patch on `toggleStatusEffect` counted one call while two documents persisted. So the fix below removes the defect by construction rather than by relying on my account of the interleaving being complete.

## The fix

Three things, in both workflows.

Presence is now read from the effect **documents** as well as the derived set, unioned so that neither can be the stale one. The documents are authoritative the moment a create resolves, which is exactly the window the second pass fell into.

Every hook now **schedules** rather than settling inline. A single logical change fires several hooks — an effect is created and the actor updates — and each of them used to run the whole rule. Now they all feed one scheduler.

That scheduler **defers and coalesces**. It runs the pass on a later task, outside the dispatch of the event that asked for it, so the rule's own write can no longer land inside the event that triggered it. And a request arriving while a pass is scheduled or running does not start a second pass; it marks the current one to run again when it finishes, so the last word is always computed from the settled state. That is what makes it safe to call from six hooks without counting them.

The death watch gets the identical treatment: `alreadySkulled` asks the documents, and `scheduleReap` defers and coalesces.

## Harness

`verify-chapter1.mjs` is 293 checks and `mutate-chapter1.mjs` 51 mutations, all caught. Full sweep green at 287/287.

Nine new checks pin this specific defect shut, and six new mutations recreate it: presence read from the derived set alone, the death branch trusting the derived set, a single hook settling inline, the scheduler losing its deferral, and both death-watch equivalents. Each of those mutations reproduces the live defect, so it cannot come back unnoticed.

## Still untested live

Resuscitation's failed-stabilisation button and the Refocus blunder's bonus dice and critical injury. Both are pinned in the harness; neither has been driven in the world yet. They are first on the list for this build, along with re-driving the collapse rule to confirm one effect and one card.

Also still undriven: the background removal lock above 1st level. A direct write to `system.identity.level` did not take, so that test ran at level 1 and proves only that a GM can remove one. The player refusal needs a player login.
