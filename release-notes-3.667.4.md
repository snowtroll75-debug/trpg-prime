# TRG Prime 3.667.4

23 October 2026. One layout fix from the live test of 3.667.3.

- **Install over 3.667.3.**
- **Unchanged and still working:** Inner Tempest 0.4.2, Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.**

## The tick-box prompt squeezed its rows

**Found live.** The prompt that asks a weapon attack's or a Spellcraft check's tick-boxes worked, but each row's text was squeezed into one narrow column, a few words to a line.

**Cause.** The rows sat inside a form-group, whose grid gives each item one column.

**Fix.** The rows sit in a plain block, so each runs the width of the prompt, with its tick-box on the left. Checked live with a preview of the new layout before the fix was made.

## Checks

- **`verify/mutate-offered-conditionals`:** 30 checks and 24 mutations, all caught. A new check, A4b, and a mutation hold the rows out of the form-group grid.
- **The uncalled-export ratchet:** backlog unchanged at 513.
- **Full sweep (`node tools/verify.mjs`, run on the staged release):** all 627 checks pass, every mutation caught.
