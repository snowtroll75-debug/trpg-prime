# TRG Prime 3.629.2 — greyed fields that look greyed

8 October 2026. This fixes the one finding from the 3.629.1 live test.

3.629.1 disabled a peril's old single skill and DC fields (Detection skill, Detection DC, Minimum ranks, Disable with, Disable DC) whenever a printed Detection or Disable line is set. The fields could not be edited, but they looked exactly like live ones, because the sheet's theme has no disabled style.

A rule in `styles/trg-prime.css` now dims them and shows a not-allowed cursor. Stylesheet only; no code changed.

**Harness:** verify/mutate-haunt-perils is now 62 checks and 49 mutations. H7 checks the style. verify-effect-grouping, which reads the stylesheet, passes. No full sweep was run, because nothing but CSS changed.

The rest of 3.629.1 passed the live test: Reset lines, "— unaffected.", "against The Empty Chair", the strike refusal, "24 hours" left, the Secret outcome whispered (and a non-Secret one still public), and the inherited Fumble text.
