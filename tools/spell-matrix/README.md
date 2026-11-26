# tools/spell-matrix — every spell, every legal Warping and Metamagic configuration

Built 26 November 2026 on 3.715.1. It generates the test cases from the **rules**, checks the engine's numbers against them, and drives the hard cases live from a GM and a Player client at once.

| File | What it does |
|---|---|
| `rules-model.mjs` | The book, written independently of `module/`: cast cap, Casting DC, cantrips, warp repeats, each Metamagic feat's eligibility from its text, and the forbidden or unclear pairs. Every rule cites Core 3.7. |
| `generate.mjs` | Reads the packs, and module exports in `data/modules/`. Writes `inventory.json`, `metamagic.json`, `summary.json` and `cases.jsonl`: per spell and caster profile, base, each option ×1 / ×max / ×over, ineligible probes, every pair, and a cap fill. It also counts the full legal space. |
| `verify.mjs` | Drives `buildMetamagicOptions`, `aggregate*Selection`, `warpMaxTimes`, `castingDC` and the cap for every case, and classifies each disagreement (DEFECT / NOTE-ONLY / INTERPRETATION / REVIEW). `--sweep` walks every warp combination where the space allows; `--compare` diffs the run against the baseline; `--update-baseline` resets it. |
| `report.mjs` | Writes the inventory, matrix, warping, metamagic and combination reports at the repo root from `data/`. |
| `live/matrix-driver.js` | The browser console driver, for both clients (see its header). |
| `data/live-*.json` | Live evidence, one file per run. |

**A green `verify.mjs` is not a verified spell.** It proves the numbers agree with the book. The effects, targets, HP, clocks and permissions are proved only by `data/live-*.json`.

`cases.jsonl` (about 80 MB) and `calc-results.jsonl` are git-ignored. They regenerate in seconds and are deterministic.
