# TRG Prime 3.665.1

21 October 2026. This release fixes one gap in 3.665.0, found in the live test of 3.665.0. **Install over 3.665.0.** Inner Tempest 0.2.0 and Fiends & Fables Prime 0.45.1 are unchanged and work with it. There is no new migration.

## The fix: a Focus use with no printed count is now spent when used

- **The gap.** 3.665.0 (D1) gave every Focus feat or ability with no printed count a count of one. In the live test:
  - the count arrived correctly on a dropped feat and on an imported creature;
  - Refocus offered the item once it was spent;
  - but **using it never spent it, and a spent one was not refused**. Void Step ran again and again, and so did a Quasit's Abyssal Healing.
- **The cause.** Those items' Use handlers were written when they had no count, so none of them spends one. Only the creature area-ability path did.
- **The fix.** The Use button is the one place every feat and ability passes through: the sheet, Reactive Stance, a creature's activation and an ability choice. For an item whose count comes from the D1 default, the button now:
  - **refuses** the Use when the use is spent ("its Focus use is spent — Refocus restores it"), before anything happens;
  - **spends** the use after the handler, if the handler did something (this actor posted a card) and did not spend the use itself.
    - A cancelled dialog or a refused Use spends nothing.
    - The area-ability path, which already spends, is not charged twice.
- **Unchanged:** items that print a count (Crusader's Mercy, every Inner Tempest Focus item) keep their own handlers' spending, and the button leaves them alone.
- **Driven live before release.** The same gate code was run against the real Void Step and Abyssal Healing handlers in the 3.665.0 world:

  | Item | Result |
  |---|---|
  | Void Step | spent on the first Use, refused on the second |
  | Abyssal Healing | a cancelled dialog left the use; a Use spent it (1 PP, 6 HP healed); the next was refused |

## Checks

- `verify/mutate-focus-default`: 21 checks (6 new, section F), 20 mutations (7 new), all caught. Two existing mutation anchors were moved past the new comment block, without changing what they mutate.
- **Full sweep: 605 of 605 green**, run on a clean stage: the 3.665.0 release plus exactly this release's files (`module/uses.mjs`, `module/feats-workflow.mjs`, the D1 harness pair, `system.json` and these notes).
