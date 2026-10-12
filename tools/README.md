# tools/ — the harness, rebuilt

**23 August 2026, at 3.368.1.**

The original harness — 99 verify files, 91 mutation files, a 436-row feat
register, and two ratchets — existed only inside a disposable cloud
container and was lost with it. This directory is not that harness. It is
the part of it that could be rebuilt honestly.

## What is here

| file | what it asks |
|---|---|
| `verify-no-undefined-names.mjs` | Does every identifier resolve? (lesson 5.2) |
| `verify-rules-have-callers.mjs` | Is every exported rule named outside its own file? (lesson 5.1) |
| `verify-checks-can-fail.mjs` | Do the two above actually go red? (lesson 5.3) |
| `verify.mjs` | Runs all three. `npm run verify`. |
| `lib/mutation-safety.mjs` | `guardFiles()` — snapshot, restore on every exit path, pid lock. |
| `lib/sources.mjs` | File discovery and parsing. A file it cannot parse is a **failure**, never a skip. |
| `foundry-globals.json` | Host globals, read off a running client rather than guessed. |
| `uncalled-exports.json` | The ratchet. May only shrink. |

Run: `npm install` once, then `npm run verify`. Twelve seconds.

## What is NOT here, and what that costs

This is the important half of this file.

- **The 99 per-rule verify files.** They encoded what each rule is
  supposed to do, chapter by chapter. Nothing here replaces them.
- **The 91 mutation files**, and with them `verify-driven-coverage` and
  the driven-coverage budgets. **Nothing here measures whether a rule is
  tested by driving it rather than reading it** — which the project's own
  history says is the distinction that matters most.
- **`verify-feat-coverage` and the feat register.** The checker is
  rebuildable; the 409 rows of evidence are not, and re-deriving them by
  reading code is precisely how you get a register that calls something
  automated when it has no caller.

**A green `npm run verify` therefore means "no undefined names, and no new
uncalled exports". It does not mean any rule is correct.** Do not report
a batch as verified on the strength of it. Until the per-rule corpus
exists again, live testing in the world carries the proof burden.

## Why these three and not a fast reconstruction of the other 190

Rewriting the per-rule corpus from the code it checks is §5.3 exactly — a
check written beside the code encodes the same mistake — and it would
produce 190 green files that prove nothing while *looking* like restored
coverage. Three real checks are worth more than that, and the gap above
is stated so nobody mistakes one for the other.

The three that are here were chosen because they are **generic**: they
analyse whatever source is put in front of them and encode no per-rule
knowledge, so a rebuild is the real thing rather than a replica. That
they reproduce, unprompted, all five harness-only keeps and all thirteen
dead exports the handover recorded is the evidence that they work.

## The numbers, and why they are not the old numbers

Fresh baselines were taken at 3.368.1 rather than inherited.

| | original | now |
|---|---|---|
| uncalled exports | 532 | **679** |
| uncalled *functions* (at 3.363.0) | 61 | **400** |
| sweep time | ~25 min | ~12 s |

**The jump is not rot.** The original counted a rule as called when a
mutation file drove it, and that corpus is gone — so several hundred
exports which had a harness caller now read as having none. Expect the
number to fall sharply if the mutation files are ever rebuilt. Both
differences are recorded in `uncalled-exports.json` under `_baseline` so
that a later reader cannot mistake them for a regression.

The sweep time is short for the same reason: it is running three checks,
not two hundred.

## Conventions kept from the original

- **Declared and checked, never inferred.** Deliberate keeps live in
  `uncalled-exports.json` under `keep`, each with a **required** reason.
  An empty reason fails the check. A keep that acquires a real caller is
  reported, because the reason it was held back has stopped being true.
- **The anti-silence rule.** Three keeps carry the reason *"no specific
  reason was recorded in the handover, and I have not invented one"* —
  they need Graham to supply one or agree the export can go. That is
  deliberately uncomfortable to read.
- **The ratchet may only shrink.** A new orphan fails immediately. A
  shrunk backlog is recorded with `npm run verify:callers:update`, never
  silently.
- **Never run two at once.** `guardFiles` takes a pid lock and refuses,
  naming the process that holds it. A lock whose pid is dead is reclaimed
  with a message, not obeyed forever.

## Do not lose it again

This directory was rebuilt because the last one lived only in a
disposable container. Push it somewhere, or keep the repo in a folder on
a real machine. Everything in here is cheap to lose and expensive to
rebuild — and the 190 files that could not be rebuilt are the proof.
