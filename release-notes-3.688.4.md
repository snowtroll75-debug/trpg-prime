# TRG Prime 3.688.4

13 November 2026. One change, approved by Graham: the Magic Ritual dialog's "Secondary casters with a different tradition" count is held to the secondaries recorded in the rows. Built on 3.688.3. No migration; no world data is touched. Eldritch Arts 0.13.1 runs on it unchanged.

## The different-tradition count is held to the recorded secondaries

- **Before:** the count was its own box, read straight into the ritual DC (+2 each). Nothing tied it to the rows: 3 could be entered with no secondary recorded, and the DC rose by 6 for casters who were not there.
- **Now** a count above the number of secondaries recorded is refused, with a warning, before anything is rolled or spent: "*N* secondary casters of a different tradition entered, but *M* are recorded. Record each one's result, or lower the count." It is refused rather than trimmed, so a miscount is seen and corrected, not silently changed.
- **People, not seats.** A Ritual Expert's second seat (Eldritch Arts) is not a second caster, so the count is held to the rows recorded.
- **Before the sourcebooks are asked.** The check runs before a sourcebook's ritual preparation, which may already spend: Eldritch Arts' Ritual Censor takes its 5 gp of incense there. A ritual this refuses takes nothing. (The independent review found the first draft of this check placed after that step; it was moved before release.)
- The rule's own sum is unchanged: +2 DC per secondary caster of a different tradition.

## Not changed (raised with Graham)

- The core's other ritual refusals — "needs at least one secondary caster", the overcast limit, and a variant's PP cap or unprepared spell — still come after the sourcebooks' preparation. With a Ritual Censor ticked, each such refusal takes the 5 gp of incense for a ritual that never happens.

## The harness

- **New pair `verify-fixes-3688-4`** (7 checks, including that the check comes before `prepareRitual`) and **`mutate-fixes-3688-4`** (7 mutations, all caught).
- **Version pins** raised to 3.688.4.
- **Every `verify-*` and `mutate-*` on the final tree (the full sweep, four shards):** 737 scripts, 0 failures; unpaired 0, missed 0.
- **Eldritch Arts 0.13.1's 24 verifiers** on this core: all pass.
- **Independent review:** found the check placed after the sourcebooks' preparation (so a Ritual Censor's incense was taken before the refusal), and the verifier's order test unable to fail. Both fixed before release; "people, not seats" and the version bump confirmed.
