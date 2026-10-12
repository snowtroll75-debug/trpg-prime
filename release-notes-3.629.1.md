# TRG Prime 3.629.1 — the Chapter 8 live test's polish

8 October 2026. These are the seven cosmetic findings from the 0.10.0 live test (`claude/pillars-of-faith-live-testing-report-0.10.0.md`), plus the Secret-action outcome card. Graham: "Yes please fix them." Nothing here changes a rule. **Pillars of Faith 0.10.0 is unchanged** and runs on this release.

1. **Reset line.** "Reset — 1 hour.." is now one sentence with one full stop. A printed Reset that lacks a stop ("Midnight") gains one.
2. **"As Fumble" rungs** print what they inherit. For example: "As Fumble (Frightened 2 and cannot willingly approach the bed for 1 minute.), but the target immediately spends its next available action moving away…". It goes one step only, and the conditions applied are unchanged.
3. **Blank rungs.** A rung that prints nothing and applies nothing now says "— unaffected.". These are the rungs above an inline "On a Failure or worse" ladder, such as the Drowned Procession's Success.
4. **Disable bonus row.** It names the peril once ("+2 circumstance — Speaking a remembered name … — against The Empty Chair") instead of repeating the label.
5. **Strike refusal.** It reads "has no physical body to strike — it cannot be attacked." The damage card reads "the damage passes through it." The "(a peril without HP)" aside is gone, because a haunt has derived HP and is marked as having no body.
6. **Suppression time left** reads as a GM reads it: "24 hours", "2 days", "1 hour 30 minutes", "2 minutes". Before, it read "1440 minute(s)".
7. **The old single skill and DC fields** (Detection skill, Detection DC, Minimum ranks, Disable with, Disable DC) are greyed out when a printed Detection or Disable line is set, because the line replaces them. Their values are kept.
8. **A Secret action's outcome card** is whispered to the GM. Its check is already rolled blind, so the outcome is the GM's to tell. This was found on Interpret Haunt, whose check was blind but whose outcome card ("Success: You identify the general nature of the haunt…") was public. It applies to every action with the Secret trait. Recall Knowledge, Search and the like now report to the GM, who tells the table what is found.

## Harness

- **verify/mutate-haunt-perils:** now 61 checks and 48 mutations (new section H: the time-left wording, the inherited rung, "unaffected", the Reset stop and bonus scope, the greyed fields, the secret outcome).
- **Sweep: 517 of 517 green.**
