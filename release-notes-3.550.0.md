# TRG Prime 3.550.0 — the ability collapse rule

10 September 2026. R5 from the pages 6–15 audit, implemented as automatic consequences on Graham's ruling. This completes the block: pages 6–15 are now audited, fixed, pinned and closed.

## What the rule is

Page 13 gives each ability score a consequence at −5, and until now nothing in the system compared any attribute against any threshold. A drain that pushed Constitution to −5 sat on the sheet as a number and the character carried on fighting.

Strength −5 is "too weak to move in any way and is unconscious". Dexterity −5 is "incapable of moving and is effectively immobile (but not unconscious)". Constitution −5 "is dead". Intelligence −5 is "comatose (unless it is mindless)". Wisdom −5 is "incapable of rational thought and is unconscious". Charisma −5 is "not able to exert himself in any way and is unconscious".

All six now apply as they happen, announce themselves on a card carrying the printed sentence, and lift again when the score recovers.

## Three readings, each a judgement rather than a transcription

**"−5" is read as "−5 or worse."** The book states the score exactly, but a −6 is not less collapsed than a −5, and a drain that overshoots must not step over the rule entirely.

**Comatose is applied as Unconscious.** There is no Comatose condition in Appendix 2 — the register runs to 34 and none of them is it. Unconscious is the nearest thing the system has and carries the consequences that matter, so Intelligence −5 lands as Unconscious with the printed word said on the card. A distinct condition would be a rules addition, which is not this release's business.

**The mindless exemption is widened to Charisma, and this one needs your ruling.** The book writes "unless it is mindless" against Intelligence alone. But this system's own Mindless rule applies a −5 penalty to Intelligence *and* Charisma — so read literally, every mindless creature in the game, every zombie and ooze and construct, would be permanently Unconscious from its Charisma while being expressly excused the identical consequence one attribute along. That cannot be what the sentence means. The exemption is keyed off the Mindless penalty's own attribute list rather than a list written out separately, so the carve-out and the penalty can never drift apart: whatever the Mindless rule drives to −5, the Mindless rule also excuses. If you rule that Charisma should collapse a mindless creature after all, it is one constant, not a rewrite.

Constitution is not on that list, so nothing can excuse a fatal Constitution — including mindlessness. That is asserted rather than assumed.

## How it is built

The decision is pure and lives in `module/combat/ability-collapse.mjs`; `ability-collapse-workflow.mjs` is the trigger and the write and nothing else — the same split as the death watch beside it.

**Death stayed one question with one answer.** `isDead` now also answers a fatal Constitution, rather than a second death path being written. `reapDead` guards on that predicate, the death watch tests it, and the turn-start dying check skips on it, so all three picked up the Constitution death without being told. A separate path would have been three places to remember and one of them would have been missed.

**Why a hook rather than a call site.** An attribute total is derived from six slots plus the size table, so there is no single place it changes: the sheet, an effect created or updated or deleted, an item added or removed, a drain spell. Watching the documents catches every route by construction. It cannot go in `prepareDerivedData`, where the totals are actually computed — derivation runs on every client on every re-render and must not write, or the condition re-enters derivation and every connected client races to apply it. Gated on the acting GM for that same reason.

**It lifts again, and that is the half worth the care.** A rule that only ever applies is a trap: restore a drained Constitution and the character would stay Unconscious for ever with nothing on the sheet to say why. So the conditions come back off — but only the ones this rule applied, tracked on a flag, and never while another reason to be unconscious is standing. A character unconscious at 0 HP is not woken by an unrelated recovery; that would be a worse bug than the one being fixed. Immobilised still lifts in that case, because the exception belongs to Unconscious alone.

Death does not lift. Restoring a dead character's Constitution does not un-kill them; that is a resurrection and it is yours to perform.

## The harness, and what it caught in me

`verify-chapter1.mjs` is now 284 checks and `mutate-chapter1.mjs` 45 mutations, all caught. Full sweep green.

Three of my own mutations survived on the first run, and all three were the same failure: I had written checks that read the source for a function *name* rather than asking whether the rule was *reached*. A mutation disconnecting the call while leaving the definition in place walked straight past them — which is precisely the defect shape this project keeps finding, written into the thing meant to detect it.

The fix was not a better regex. The recovery logic — the ownership rule and the 0-HP exception, the half of this rule with the actual judgement in it — was sitting inside the hook where nothing could drive it. It is now a pure function, `collapseTransition`, and section O drives every case: a fresh collapse, one already standing, a recovery, a recovery blocked by 0 HP, a condition somebody else applied and this rule must never claim or remove. The two source-reading checks became eight driven ones.

## Measured before shipping

Nothing in the system's own packs sits at or below −4 on any attribute — companions, familiars and creature types were all read directly — so the only route to −5 in shipped data is the Mindless penalty, which is exempted. The bestiary and monsters packs in the system are empty; creatures come from Fiends & Fables, which is not in this tree and could not be checked. If a creature there carries a Charisma or Constitution at −5 without the Mindless trait, this rule will now act on it. Every application announces itself on a card, so it will be visible immediately rather than mysterious — worth watching for on the first import.
