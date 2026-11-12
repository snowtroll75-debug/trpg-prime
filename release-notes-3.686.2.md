# TRG Prime 3.686.2

11 November 2026. **Graham's 3.686.1, kept, with the defects its review found fixed.** Graham sent 3.686.1, built on 3.686.0. An independent review found serious problems in it, and Graham chose "fix first". This release keeps everything 3.686.1 meant to do and fixes the defects. Built on 3.686.1.

- **Install over 3.686.0 or 3.686.1.** No migration. The packs are 3.686.0's (below).
- **Modules:** Eldritch Arts 0.11.x, Inner Tempest and Pillars of Faith run on it unchanged.

## Graham's 3.686.1, kept

- **One automation writer per GM account** (`module/gm-connection.mjs`, new). `game.users.activeGM` names a user, not a browser tab. With two tabs or two browser profiles on the GM account, every tab acted. `isActingGM()` now also asks `isGMConnectionWriter()`, so only one connection of the active GM writes. The election was reworked in this release (below); its purpose is Graham's.
- **A condition-writer queue** (`module/condition-writer.mjs`, new). Encumbrance and ability collapse write one actor's conditions one at a time, keyed by the full token UUID.
- **The Codex kill hook has no acting-GM guard.** `trgPrimeCreatureSlain` is a local `Hooks.callAll` on the client that applied the damage, so the elected writer never hears it. With the guard, a kill made on any other client harvested nothing.
- **The pending-cast relay:**
  - every casting records a `castId`;
  - the startup sweep asks for a live holder before it lapses a casting;
  - `askHolder` also asks when the holder is this user, because another tab of the same account may hold the casting;
  - a tab of the holder's account that does not hold the casting does not acknowledge an ask.
- **Focus-extra top-ups** are written by `isActingClientFor(actor)`, not by "the creating user", since one user can have two tabs.
- **Refocus uses the uses-pool owner** (`usesPoolItem`). A Wild Shape form alias has no counter of its own. The state, the restore and the "restores all" question are all read from Shape Of The Animal. The sweep visits the owner once, not once per alias.
- **Wild Shape keeps spent uses.** Configuring Wild Shape is not a rest. Only a new or unconfigured pool starts full.
- **The distance tether reads committed coordinates** (`toObject()`) for both ends. Foundry V14 animates the placeable and the document while a move plays.
- **Submerged and the aura trait effect** use `icons/svg/waterfall.svg`.

## What 3.686.2 fixed, and why

Numbering follows the review.

**1 (HIGH). A GM whose only tab was in the background lost writer status.**
- **The cause:** Chrome throttles a hidden tab's timer to about once a minute. After 6 seconds without a tick, 3.686.1's `isLeader()` reset itself and answered false, then false again through its 400 ms settle. Socket and document hooks still arrived, so turn automation (`TRGCombat.automates`, `_onStartTurn`) and every other `isActingGM` hook were skipped without a word. In the review's simulation, with a hook every 30 seconds, `isActingGM()` was true 0 times out of 40.
- **The fix:** leadership now depends on what the other tabs can see, not on the local timer.
  - A connection that knows of no other tab is the writer: from the end of its 400 ms settle window (see the second review, below), and always after that.
  - An owner is replaced only when it fails to answer a **probe**. Probes and hellos are answered from the socket handler, which throttling does not delay.
  - A stale local gap triggers a re-hello. It never costs the owner the role.
- **The result:** the review's simulations now give true on 40 of 40 (sim3, hooks every 30 s), 590 of 590 (every 2 s), and so on for every interval. sim2's both-writer count is 0 at every hook interval tried.

**2 (HIGH). Startup was unsettled.**
- **The cause:** the `setup` hook did nothing, because `game.user` is not set at setup. The election therefore started at `ready` with a 400 ms settle, and ready hooks in the same pass skipped their work. Four were affected:
  - the pending-cast startup sweep;
  - the encumbrance sweep;
  - ally auras' `canvasReady`;
  - ward zones' `canvasReady`.
- **The fix:**
  - A lone GM is the writer once the 400 ms settle window has passed with no other tab heard (fix 1; the first draft made it the writer at once, which the second review showed made two writers while a joiner's hello was in flight).
  - Several tabs settle within the 400 ms window.
  - New `gmConnectionReady()` resolves once this connection's view has settled. `gmConnectionSettled()` says whether it already has, so a hook that was synchronous stays synchronous.
  - The once-only startup sweeps now wait for it before asking `isActingGM`: the pending-cast sweep, the encumbrance sweep, the orphaned-`action` purge and the migration offer. The two `canvasReady` handlers wait for it too.
  - `waitForGMConnection` is kept as an alias of `gmConnectionReady`.

**8 (LOW). `ready` awaited the election before registering listeners.** `scripts/trg-prime.mjs` no longer awaits anything before it registers the target relay, the party socket, GM authorisation and the other listeners, so an early request now finds its listener. The election settles later, just before the one-time sweeps.

**5 (MEDIUM). Two tabs could both be the writer after a throttled tab resumed.**
- **The cause:** 3.686.1 settled a conflict by id order (`[owner, id].sort()[0]`), not by who already held the role.
- **The fix:** every claim now carries a **term**.
  - A takeover claims one term higher than any it has seen, so a resumed tab holding an older claim yields to the newer one. Only claims of the same term fall back to id order.
  - A brand-new tab claims term 0 (provisional) and makes it real after the settle window. A late joiner therefore follows the established writer.
  - A non-owner returning from a gap does not elect itself until it has heard a pulse interval of traffic.
  - A reconnecting page (a new socket id) carries the peers it knew, so it listens before it claims.
  - A tab whose timer is throttled but which still answers probes is never replaced.

**7 (MEDIUM). GM-side writers bypassed the election.** Each site compared `game.users.activeGM.id` with this user by hand, so every tab of the active GM acted, and a relayed hit could be applied twice. All 14 listed sites were checked. Each now goes through the election:
- **The target relay and the party relay** (`shouldHandleAsGM`, `handleRelayMessage`, `handlePartyMessage`): they take a `connectionWriter` argument, passed `isGMConnectionWriter()` by their socket listeners. It defaults to true, so the pure two-argument contract still holds.
- **The migration offer:** keeps its own active-GM check and adds `isActingGM()`.
- **Five `deleteActiveEffect` hooks and Aligned Control:** linked conditions, material shift, stasis, end saves, rune timers and the Aligned Control resave now use `isActingClientFor(creature)`. This is the acting GM's elected connection. With no GM connected, it is one owner. That is the 3.685.3 rule, where these hooks used to run on every client.
- **A lent spell rune's return:** `shouldHandleAsGM(game.user, activeGM, isGMConnectionWriter())`, with the owner fallback unchanged.
- **Rage switched off:** `isActingClientFor(effect.parent)`.
- **The world-clock sweep:** `isActingGM()`.
- **The orphaned-`action` purge:** `isActingGM()`, after the settle.
- **Not on the review's list, found by the grep:** a light-shift circle following its creature now uses `isActingGM()`. It was the same rule written by hand.
- **Left as they are, deliberately:** `activeGM` read only to address a question to a user (`defenceAnswerer`, `askOwner`, Foretell, the GM-authorisation and emanation "is a GM connected?" checks). These are not writers. See "For Graham".

**The socket test.** `isGMConnectionWriter` treats only `connected === false` as disconnected. A harness's fake socket with no `connected` property counts as connected. A player is never the writer, even with no socket.

**The import-time hook.** `gm-connection.mjs` registers nothing when it is imported. `registerGMConnection()` is called from the system's `init` hook and registers the setup/ready start and the `pagehide` goodbye. Without it, the election still starts lazily on the first `isActingGM`.

**4 (MEDIUM). Foundry V14 had rewritten 11 packs** in 3.686.1: races, heritages, backgrounds, creature-types, companions, abilities, feats, consumables, afflictions, vehicles and familiars.
- **What changed:** every document was re-saved. `_stats.coreVersion` changed, ActiveEffect `changes`/`mode` became `system.changes`/`type`, and schema defaults were filled in. That broke `verify-chapter1`, `verify-chapter2`, `verify-backgrounds`, `verify-chapter6-gear-171-180`, `verify-live-fixes-3-627-1` and every tool that reads raw packs.
- **How it was checked:** a normalised content diff against 3.686.0's packs, covering every key of every document, embedded effects included.
  - The only values that changed were `_stats.coreVersion` and `changes` (moved, not altered).
  - `system.changes` carries the same key, value and priority as 3.686.0's `changes`, with `mode` mapped to `type`.
  - Every other difference was an added schema default.
  - No document was added or removed.
- **The decision:** this showed no deliberate content edit, so the 11 directories were restored whole from 3.686.0.
- `packs/creature-abilities` and `packs/spells` were already identical in content to 3.686.0's (record hash). They carry the new 16-character ids, Remove Curse and Insanity, and were kept.
- `verify-pack-ids` is green: 18 checks, 2,613 records in 31 pack directories.

**6 (MEDIUM). An ask with no live holder waited out its timeouts.**
- **The cause:** when the casting's tab was gone, no tab acknowledged an ask. The asker waited 10 seconds and warned. Stop and Complete failed and left a stale flag. `payPendingCastTurn` stalled Phase 1 for 10 seconds every turn. Two cases trigger it: the tab closed or reloaded while its user stayed connected, or the holder is the asker's own account.
- **The fix:**
  - A tab of the holder's account that does not hold the casting now answers at once with a **ghost** answer. The asker gives the account's other tabs 750 ms to accept, then reads the ask as "nobody holds it", so the local fallback runs: Phase 1 goes on, and Stop clears the flag and posts its card.
  - When the holder is the asker's own account and no other tab answers at all, a 1.5-second wait means "nobody holds it", not a timeout.
  - A real acknowledgement always wins over a ghost.
- **The race at the flag:** the casting's resolver is now registered **before** its flag is written. Before, a fast probe or ask from another client found no `waiting` entry. If the flag write fails, the entry is removed again.
- **The `randomID` fallback:** `foundry.utils.randomID` is used when present. A harness without it gets a local fallback (this was `verify-fixes-3685-3`'s crash).

**9 (LOW). Focus-extra top-ups were not idempotent.** The top-up added to the current count, so a second run added again. Each top-up now records its carrier on the item (`flags.trg-prime.focusExtraGiven.<carrier id>`), and a carrier that has already topped an item up is skipped. Another carrier still tops up.

**10 (LOW). A pending Refocus restore written on a pool member before 3.686.1 was never applied.** The sweep now moves a member's legacy flag to the pool owner and clears it from the member. A pool has one Refocus state (a new attempt rewrites it whole), so the owner's own state and every member's are merged: the earliest restore, a next-turn restore if any had one, the latest block, daily preparation if any (`mergeRefocusStates`). It is then applied once. (The first draft kept the owner's state and dropped the members'; the second review's LOW 6.)

## The second review (no HIGH), fixed

**MEDIUM 1. GM authorisation went only to the elected tab.** Its listener asked `isActingGM()`, which since 3.686.1 includes the election, so only the writer tab showed the off-turn-strike dialog and a player waited out the 120 s if that tab was out of sight. It now asks the new `isActiveGMAccount()` (3.686.0's `isActingGM`, without the election): every tab of the active GM shows the question and the asker takes the first answer, as defence offers and `askOwner` do. The first draft of these notes wrongly said it already did.

**MEDIUM 2. The join window.** With real message delay, a tab that had heard nobody counted itself lone at once, so a joiner was a second writer for a round trip (90 ms at 50 ms each way, 190 ms at 100 ms), and at 250 ms or more its provisional claim became real before it heard the writer, and equal terms went to the lower id, so the joiner took over. Now:
- a brand-new tab is not the writer until another tab has answered or the 400 ms settle window has passed (a lone GM is the writer at about 400 ms; the startup sweeps already wait for it);
- equal terms go to the OLDER connection (its start time, `Date.now()`, carried on every message), and only then to id order.
- Measured with the review's `lat3.mjs`: 0 ms of two writers at 50 and 100 ms each way, and the established writer kept at 250 and 400 ms. Where a round trip is longer than the settle window an overlap remains (100 ms at 250 ms each way), and the joiner yields when it hears the writer.

**LOW 3. A real answer after the asker's window.** The asker now sends a cancel when its window lapses, and a holder does not act on a cancelled ask. Because a cancel can still arrive after the holder has acknowledged, the holder also waits for the asker's **go** (sent on the acknowledgement while the asker still waits) before it does anything; an asker that has lapsed never sends it. A relayed Complete that finds the flag gone settles the holder's promise (as stopped), and a holder whose flag another client removes settles its promise too (an `updateActor` that removes the flag), instead of waiting for the actor's next casting.

**LOW 4. Reconnect.** A reconnecting connection carries the highest term it has seen as well as its peers, so it never claims below it. A tab whose owner is lost adopts a live claim it has already heard rather than claiming itself. The live wrapper now keeps one election per socket (Foundry has one; a harness modelling several clients in one process has several), so the elections no longer restart each other.

**LOW 5.** When a follower probes a silent owner, it re-runs the election 1.55 s later on its own timer, so a hidden follower decides without waiting for its next hook or throttled tick.

**LOW 6.** The Refocus merge (finding 10, above).

**LOW 7.** `light-attach-workflow.mjs:185` (`isActingGM() || (!activeGM && actor.isOwner)`) was left as it is, as asked: it already goes through the election when a GM is connected.

**LOW 8. Test gaps.** The `canvasReady` waits (ward zones, ally auras) and the pending-cast startup wait are now driven on an unsettled GM page (`verify-fixes-3686-2` S1–S3), GM authorisation on a GM tab that is not the writer (S4), and A3's counters really count (A3b is the control). Each fix has a mutation that reverts it, and each is caught.

**Under load.** `verify-area-region-life`, `verify-chapter2` and `verify-spell-degrees` failing once each when run two at a time in the same tree is LevelDB's lock, not timing: each opens `packs/spells` (or another pack), and a second process opening the same pack directory gets `LEVEL_LOCKED` ("lock …/packs/spells/LOCK: Resource temporarily unavailable"). About 268 tools open packs the same way. They were not changed: the remedy is one tree per concurrent process, which is how every sweep for this release was run.

## The third review (no HIGH), fixed

**MEDIUM 1. A lone GM lost hooks after a reconnect.** A socket that reconnects with a new id got a fresh election that was 0 ms old, so it waited out the settle window again; and in a hidden tab the rebuild only happened at the next `isActingGM()`, so the first hook after the reconnect (a player's `updateCombat`) was skipped. Now a rebuild for the same account whose old election knew no peers and had settled starts settled (`createConnectionElection({ settled })` back-dates its start), and the rebuild happens on the socket's own `connect` event, which a hidden tab does not throttle. The review's `reconnect-lone.mjs`: true at the first hook after the reconnect, at 200 ms and at 450 ms.

**LOW 2. Two tabs reconnecting together could both claim.** The claim grace for a non-lowest tab ran from the reconnect, and the 1.5 s revalidation used it up, so both claimed the same term. It now runs from the END of revalidation (`lostAt = time` there): the lowest-id tab claims and is heard first. `simul-reconnect.mjs`: 0 hooks with two writers at 20 and 60 ms, every hook interval and phase tried (a few hooks during the revalidation itself have no writer, as before).

**LOW 3. A lost go stalled the asker.** A holder whose go never came returned silently, so an asker that had seen the acknowledgement waited RELAY_WORK_MS (5 minutes) and Phase 1 stalled. The holder now answers `{ result: null, refused: false }` when its wait ends; a lapsed asker ignores it, a waiting one settles at once. The mutation `if (!(await go)) return;` → `await go;` had survived; it is now caught (X10).

**LOW 4. The flag-removal hook could end a new casting.** A remote removal of the PREVIOUS casting's flag landing between holding the new casting and writing its flag resolved the new one as stopped. Each held casting now records `{ resolve, castId, flagWritten }`, and a removal is ignored until this casting's flag has been written (X11; X11b checks a removal after the write still ends it).

**INFO (a).** GM authorisation: the other GM tabs hear the answer too, close their own dialog for that request, and send nothing (S5).

**INFO (b).** `refocusRestoreDue` now comes due by whichever half applies first: a merged state's minute restore no longer waits for a turn that never comes out of combat. One Refocus never writes both, so a single attempt's state reads exactly as before (R8).

**INFO (c).** The record comment is corrected; a NEW socket object for an account whose old socket is disconnected retires the old record (interval cleared, listener removed, dropped from `live`) and carries over what it knew.

**INFO (d).** Revalidation, like the probe, re-runs the election on its own timer when it is due to end.

## Harnesses

- **`verify-gm-connection` / `mutate-gm-connection` (new, 63 checks, 33 mutations after the third review; K1–K5 are its reconnect checks):**
  - a lone tab is the writer from the end of its settle window, and through 20 minutes of throttling;
  - with real message delay (J, the review's lat model): a late joiner whose id sorts first makes no second writer at 50 or 100 ms each way and never wins at 250; equal terms go to the older connection; a throttled writer keeps the role while its follower is asked every 10 ms; a probed owner is decided on the follower's own timer; a reconnect keeps the highest term it saw (pure and live); a lost owner gives way to a live claim already heard;
  - two tabs agree on one writer, and a late joiner follows;
  - a throttled tab, as writer or follower, never makes two writers or none; this is sim2, at three hook intervals, plus both tabs hidden;
  - a frozen owner that is replaced yields on resume;
  - a follower back from a gap, and a reconnected page, do not claim before hearing traffic;
  - a closed tab hands over at once, and a vanished one after the probe;
  - a disconnected socket is not the writer, and a socket with no `connected` property is;
  - a player is never the writer, and another account is ignored;
  - nothing is registered at import;
  - the settle wait;
  - `isActingGM` stands down for a stronger claim;
  - `ready` registers its listeners before it waits.
  - Several mutations put back 3.686.1's own defects.
- **`verify-fixes-3686-2` / `mutate-fixes-3686-2` (new, 35 checks, 44 mutations after the third review; S5 and R8 are new):**
  - the relays driven with `connectionWriter: false`;
  - every re-routed writer read;
  - a scan that no hand-rolled `activeGM.id !== game.user` guard is left on a writer;
  - Graham's condition-writer queue driven (ordering, the UUID key, a failure not jamming it);
  - Refocus on the pool driven, including finding 10's legacy flag and the merge of several (R3, R6, R7);
  - the startup waits driven on an unsettled GM page (S1 ally auras, S2 ward zones, S3 the pending-cast sweep) and GM authorisation on a GM tab that is not the writer (S4);
  - Graham's Wild Shape, tether and icon changes held;
  - the version.
- **`verify-fixes-3685-3b`:** new X1–X9 (with X7b, X7c) cover finding 6 and the second review's LOW 3 (a holder hearing an ask after its window: no AP, one card, the promise settled, the go handshake), driven across tabs (a ghost answer, two tabs of the player, the asker's own account with and without another tab, the resolver before the flag); the crash on the import-time hook is gone. `mutate-fixes-3685-3b` has 13 new mutations for these (56 in all; X10, X11 and X11b are the third review's); two of its anchors moved with the cancel and were re-anchored. Its GM clients now wait for `gmConnectionReady()` before the first test, since a lone GM is the writer only after the settle window. `verify-session-decisions-1015` D2d re-pinned to `isActiveGMAccount()`, with a mutation that puts the elected-tab guard back.
- **Re-pinned to Graham's intended behaviour** (checks changed, none deleted):
  - `verify-ff30-block28` S2 now asserts the kill hook has no guard. `mutate-ff30-block28` gains the guard put back as a mutation.
  - `verify-block3-core` H6 now asserts the top-up uses `isActingClientFor`, and H3 the recorded carrier. H3b is new, for idempotence. `mutate-block3-core` has 3 new mutations and H6 re-anchored.
  - `verify-focus-declarations` G3 now asserts Refocus asks the pool's owner. `mutate-focus-declarations` is re-anchored, with one new mutation.
  - `verify-fixes-3685-3` Q9 reads the ready hook's new opening (relay, settle, live-holder probe).
  - `verify-chapter10-321-330` E5c reads the end-save hook's new guard. `mutate-chapter10-321-330`'s anchor moved with it.
  - `mutate-fixes-3685-2` and `mutate-fixes-3685-3` were re-anchored on `acting-gm.mjs`'s 3.686.1 form. `mutate-fixes-3685-3`'s two lapse mutations were re-anchored on Graham's live-holder line.
  - `verify-pending-cast` E1 now asserts the resolver is held before the flag and returned at the end. `mutate-pending-cast` gains "the cast is never held".
  - `verify-chapter6-gear-144-150` H5 now allows the encumbrance sweep's settle wait. `mutate-chapter6-gear-144-150` gains "the sweep does not wait for the election".
  - `mutate-block3-core`'s "a spent use is refilled" and `mutate-drive-36221`'s "every client moves the circle" were re-anchored on the new lines.
  - `mutate-pack-ids`' undeclared-directory seed now creates its own `bestiary` directory. 3.686.1's tree no longer carries the stale undeclared pack directories (bestiary, monsters and the rest) that 3.686.0's working tree had, so the seed could not open one.
- **Version pins re-pinned to 3.686.2:**
  - `verify-control-register-api` Z1 (exact version and download);
  - the `"version": "3.686.0"` / `v3.686.0` mutation anchors in 23 `mutate-*` files: arcanist-book, block10-core, block6-core, block7-core, block8-core, block9-core, chapter4, control-register-api, ea-block1-core, ea-block2-core, ea-block2b-core, ea-block3a-core, ea-block3b-core, ea-block4-core, fixes-3669-2, fixes-3670-1, fixes-3681-1, fixes-3681-2, fixes-3685-2, fixes-3685-3, fixes-3685-3b, release-links and teleport-movement.

## Run

All of these were executed; none of the figures is estimated. Run on 11 November.
- **The full sweep:** every `tools/verify-*.mjs` and `tools/mutate-*.mjs`, 725 scripts in all. That is 3.686.1's 721 plus the 4 new ones.
  - Each shard ran in its own fresh scratch copy of the tree, never in the main tree.
  - Scripts whose files changed after a shard's copy was taken were run again in a fresh copy of the final tree. The final result for each script is from a copy whose `module/`, `scripts/` and `system.json` are identical to the release.
  - **Verifies:** 364, all green.
  - **Mutates:** 361, all green, with 9,509 mutations, all caught.
  - The sweep found 6 failures along the way, all fixed and re-run green:
    - 4 anchors moved by this release's code (block3-core, drive-36221, fixes-3685-3, chapter6-gear-144-150's H5);
    - `verify-pending-cast` E1 (re-pinned);
    - `mutate-pack-ids`' seed (above).
  - One survivor was found: X3 did not notice a ghost answer pre-empting the holder, because the holder acted anyway. X3 now also requires exactly one Stopped card, posted by the holder, and the mutation is caught.
- **The run times:** `mutate-checks-read-source` took 2,825 s. `verify-checks-read-source` took 574 s, and was run again on the final tree: green, 564 s. `mutate-fixes-3685-3b` took about 2,145 s, because `verify-fixes-3685-3b` now takes about 41 s.
- **The review's simulations** (`sim.mjs`, `sim2.mjs`, `sim3.mjs`), against the new `gm-connection.mjs`:
  - sim: true at every hook (in the first sweep it was also true from t = 0 at startup; since the second review a lone tab is the writer from t = 400 ms);
  - sim2 at hooks every 300, 700, 1,500 and 5,000 ms: both-writer 0 and no-writer 0 every time;
  - sim3: 590/590, 169/169, 79/79, 40/40, 26/26 and 13/13.
- **The packs:** after the sweep, the main tree's `packs/` was restored whole from the snapshot taken right after the 11 directories were restored. That snapshot is Graham's untouched directories plus 3.686.0's eleven. `git status` shows only those 11 directories changed against 3.686.1. `verify-pack-ids` is green: 18 checks, 2,613 records in 31 pack directories.
- **After the second review** (11–12 November), on fresh scratch copies, niced, beside the coordinator's own sweep:
  - every `verify-*` except `verify-checks-read-source`: 363 files; 361 green at once, and the two red (`verify-rules-have-callers`, `verify-checks-can-fail`: the new `mergeRefocusStates` read as uncalled, because the harness named it only as a property) green after the harness was fixed. `verify-checks-read-source`: green, 678 s.
  - the 22 `mutate-*` touching the changed files (gm-connection, acting-gm, gm-authorisation, pending-cast, refocus, ward zones, ally auras, focus, encumbrance, and every mutate driving a changed verify, plus `mutate-checks-read-source`, 2,745 s): 834 mutations, all caught on the final tree. Found on the way: one survivor (the cancel mutation removed only one of three calls; it now disables the cancel itself), two anchors moved in `mutate-fixes-3685-3b` and one made ambiguous in `mutate-pending-cast`; all fixed. The two re-anchored `mutate-fixes-3685-3b` mutations were run on their own on the final tree after its 51 others were caught in a full run on code identical to the final.
  - Everything that reads `pending-cast-workflow.mjs` or the election was run once more on a copy of the final tree: 7 verifies and 6 mutates, all green.
  - The review's simulations: `lat3` 0 ms of two writers at 100 ms each way (100 ms at 250, 400 ms at 400, the writer kept each time); `lat2` 12 runs, 0 both, 0 none; `live`: not the writer at start, ready after 404 ms, writer again 1,514 ms after a reconnect with a silent peer; sim3 still 13/13 … 590/590.
  - `packs/` restored from the same snapshot afterwards (a verify run in the main tree had rewritten `packs/spells`' LOG files); only the 11 restored folders differ from c413d74, and `verify-pack-ids` is green.
- **After the third review** (12 November), on fresh scratch copies, niced, one process per copy and never two in one tree, beside the coordinator's sweep:
  - every `verify-*`, 364 files including `verify-checks-read-source`, `verify-no-undefined-names`, `verify-rules-have-callers` and `verify-checks-can-fail`, run one after another in one copy: all green.
  - the 13 `mutate-*` reading the changed files (gm-connection, gm-authorisation, pending-cast, refocus, refocus-workflow, and every mutate driving a changed verify) plus `mutate-checks-read-source` (5 mutations, 2,999 s): 496 mutations, all caught on the final tree. On the way three anchors had moved with LOW 4's new lines (one in `mutate-pending-cast`, two in `mutate-fixes-3685-3b`) and one mutation survived (J4, the probe's own timer: since (d) the revalidation path also decides on its own timer, so J4 now keeps a third tab talking to make it the probe path). All four were fixed; `mutate-pending-cast` was re-run whole (58 caught) and the two re-anchored `mutate-fixes-3685-3b` mutations, with the new third-review one, on their own (3 caught) after its full run caught the other 54 on identical code.
  - The review's sims: `reconnect-lone.mjs` writer at the first hook after a reconnect, and at 200 and 450 ms; `simul-reconnect.mjs` 0 two-writer hooks in all ten runs; `crash-hidden.mjs` a hidden follower is the writer by its second hook after the owner crashes, at 2, 10 and 20 s hook intervals.
- **Not done:** no live test in Foundry. Two things in particular need one: the election's behaviour across real tabs, including a hidden tab, and the 400 ms settle at startup. No zip was built and nothing was committed.

## For Graham

- **A question addressed to the GM goes to every tab of the GM account.** Defence offers, reaction asks, the attack reroll and (since the second review) GM authorisation are answered on any tab of the active GM: every tab shows the dialog, the asker takes the first answer. A second answer clicked in another tab would act too. Sending them only to the elected tab would risk the dialog appearing in a tab out of sight. Your call.
- **With no GM connected**, the five `deleteActiveEffect` writers, Aligned Control and rage now act on one owner's client (`isActingClientFor`). Before, they acted on every connected client. If you would rather they keep the old "every client" fallback, it is one line each.
- **The election's known windows.** Where one round trip between two tabs takes longer than the 400 ms settle window, a joining tab and the writer overlap until the joiner hears the writer (then it yields). And: A tab that is completely frozen (not throttled), whose queued socket messages are then dropped, holds its old claim for one round trip after it resumes. The newer term then wins. Throttled tabs, which answer probes, never get there.
- **Pulse traffic:** each GM tab still pulses once a second on the system socket, as in 3.686.1.
