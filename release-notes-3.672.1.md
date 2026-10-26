# TRG Prime 3.672.1

26 October 2026. One wording fix, found while live testing Inner Tempest 0.9.0.

- **Install over 3.672.0.**
  - No migration prompt.
  - Inner Tempest 0.9.1, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2 work on it unchanged.

## Fixed

**A spell that raises a save DC named the DC by its internal key.**
- Root's cast card read "+4 circumstance to the fortitudeDC DC anyone rolls against to move or trip it". The line removed `skillDC:` from a skill's key and nothing else, so a save DC printed as its key. Root was the first spell to raise one.
- It now reads "the Fortitude DC" (and Reflex DC, Will DC, Attack DC, Defence (DB)).
- A skill's DC reads as it did before, for example "the deception DC".

## Checks

- **`verify/mutate-block8-core`:** 65 checks and 79 mutations (63 and 76 before), all caught. The new check drives the wording for every DC a defence row may name and checks that the card uses it.
- **Version pins moved to 3.672.1** in `mutate-block6-core`, `mutate-block7-core`, `mutate-fixes-3669-2`, `mutate-fixes-3670-1` and `mutate-release-links`.
