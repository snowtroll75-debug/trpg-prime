# TRG Prime 3.677.1

1 November 2026. One fix, found by the live test of Eldritch Arts 0.2.0 on 3.677.0 (`claude/eldritch-arts-live-testing-report-0.2.0.md`, F1), with Graham's ruling the same day.

- **Install over 3.677.0.**
- **No migration prompt.**
- **Eldritch Arts 0.2.0 is unchanged** and runs on this release.

## Fixed

**A beneficial emanation no longer helps a creature that refused it.**
- **The fault:**
  - A Nyrinn stood inside Protective Ward (an allies-only emanation) when it was cast. They rolled Null Aura's Will save, failed, and the card said "the spell has no effect on them".
  - Moments later the emanation's own membership sweep gave them its +1 DB. The sweep adds its effect to every creature standing in the circle, and it had never been told about this save.
  - The Ascendan had the same gap against a forbidden-tradition emanation, such as Bless.
- **Graham's ruling (1 November 2026):** the save applies after the cast too. This matches his 28 August ruling for Bane's latecomers.
- **The fix:**
  - The circle keeps what the cast's save rolled for each creature.
  - A creature that refused is never added to it.
  - A creature that accepted is not asked again, however often it steps out and back in.
  - A creature that walks in later, and owes the save, rolls it once, against the DC the cast recorded. The roll and its line ("accepts…" or "rejects…") appear in chat, and the answer is remembered for as long as the circle runs.
- **Who owes the save** is decided exactly as at the cast:
  - a Nyrinn, against another caster's beneficial spell;
  - an Ascendan, against a beneficial spell of a forbidden tradition.
  - Everyone else walks in as before.
- **A harmful emanation** (Bane and the like) carries no such record and is unchanged.
- **For modules:** `beneficialTraditionSave` takes an optional `outcomes` Map, which it fills with target → passed. The emanation record carries `benefit: { spell, saveDC, accepted }`. A re-record keeps it, as it keeps `tested`.

## Harness

- **`verify-ea-block1-core`:** 100 checks (was 89).
  - **New, C15:**
    - A harmful circle carries no record.
    - The record still asks the Nyrinn (another's spell) and the Ascendan (a forbidden tradition), and asks no one else.
    - The cast's answers are kept by token, with the DC.
    - Whoever refused is left out of the circle.
    - Only those not yet asked are asked.
    - The wiring: the save reports each answer; the cast records them; the sweep asks a latecomer once, remembers the answer, and builds the circle without whoever refused; a re-record keeps the answers.
- **`mutate-ea-block1-core`:** 74 mutations, all caught (was 66). New: the defect itself (the circle forgets who refused), and seven more.
- **Re-anchored to lines this fix moved:**
  - `verify/mutate-light-shift` N2c/N4 now read the circle as `caught`;
  - `verify-live-3609` C4 now counts the two write-backs that run inside a refresh;
  - `mutate-emanation`'s "the tested record is dropped" goes at the record that now also keeps `benefit`.
  - Each still catches what it was written for: 71 checks / 31 mutations, 46 / 23, 103 / 52.
- **`tools/uncalled-exports.json`:** a keep for `benefitSpellSnapshot`. It is called by `benefitRecord` in its own file, and the verify file drives it.
- **Re-pinned to 3.677.1:** the version anchors of the mutation files and the release link.
- **Full sweep on the staged 3.677.1:** all 657 harnesses pass. An earlier run caught three of the re-anchorings above; it was then repeated in full on a fresh copy of the tree, checked identical to the release tree before and after.
- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
