# TRG Prime 3.708.0: Party Sheet V2, Stage 1 (foundation, live updating, performance and security)

22 November 2026. Branch `feature/party-sheet-v2-stage1`, from `main` at `dd8bbc1` (3.707.3). This is the first of the five Party Sheet V2 stages. The look of the sheet is unchanged apart from three small additions: the missing-entry reasons, the GM's "needs attention" note, and the name-and-portrait row for a gated NPC.

Graham's two rulings for this stage (22 Nov 2026):
- **Member statistics:** player characters stay visible to everyone who can open the sheet. An NPC member's statistics are shown only to a GM, or to a user with Observer or better on that NPC. Anyone else sees its name and portrait.
- **The Rewards tab is the GM's.** Players see Roster and Loot.

## 1. Live member synchronisation

**Before:** an open Party sheet showed what was true when it was opened. Damage, a condition, a level-up, a new portrait or a deleted member all needed the sheet closing and reopening.

**Now:** `module/party-live-sync.mjs` keeps one registry shared by every open Party sheet. Each sheet registers the UUIDs it read after each render and leaves when it closes.
- **Hooks:** one set (11 hooks) however many sheets are open. They are installed when the first sheet opens and removed when the last one closes.
- **What reaches a sheet:**
  - a member's own update (HP and max, PP and max, level, class, race, name, portrait, conviction and other resources);
  - items on the member (equipped armour and so on);
  - effects on the member or on its items (conditions);
  - its creation or deletion;
  - the deletion of the token whose actor it is.
- **Unrelated actors** cost one map lookup and render nothing.
- **An actor in two parties** re-renders both sheets.
- **A burst of changes is one render.** If the user is typing in one of the sheet's fields, the render waits until focus leaves the field, so typed text isn't lost.
- **Not stored:** nothing about a member is copied onto the party or kept between renders.
- **No loops:** a render only reads documents. An update made with `render: false` is respected.
- **On the GM's Rewards tab** the adversaries are watched the same way.
- **Scroll position** in each tab is kept across a live re-render.

## 2. Member resolution, once per render

**Before:** the roster tab and the Rewards tab each looked every UUID up with one `await fromUuid` at a time, so each render did the work twice.

**Now:** `module/party-members.mjs` turns a roster into actors in one batch. World and token actors that are already in memory are read without waiting, and only the rest are fetched, in parallel. Roster order is kept.
- **The sheet resolves the roster once** and hands the actors to the Rewards tab (`rewardsContext(party, { members })`).
- **The XP award and Begin Session** use the same resolver.
- **Adversaries** are resolved in one batch too.

Each entry has a status:
- **ok**;
- **missing**: deleted, or no longer available;
- **ineligible**: a companion, familiar or party put on the roster by an older world or a macro;
- **error**: the lookup failed.

## 3. Membership integrity

- **Unchanged:** duplicates refused, characters and NPCs only, no party inside itself, Remove on every row.
- **A missing or failed entry is never removed automatically.** Its row says why and keeps its Remove button. The GM sees a note when any entry needs attention.
- **An ineligible entry** is flagged rather than shown as a member. It no longer counts toward the APL or an XP split (see "Behaviour changes").
- **Data:** no change to stored data and no migration. `system.members` is still a list of UUIDs.

## 4. Item and document validation (R-0021, R-0022)

- **R-0021: hidden embedded items.** An item dropped on the party went straight to Foundry's default handler, which creates any item type. A spell or feat dropped by the GM became an embedded item that the loot list then filtered out, so it sat on the actor unseen.
  - **Fix:** `planLootDrop` (`party.mjs`) is checked before anything is created: GM only, a `LOOT_ITEM_TYPES` type, and a quantity of at least 1 read from the item itself. Anything else is refused with the reason.
  - A row dragged within the pile is still a re-sort. An effect dropped on the party is refused.
  - Loot already on the party is untouched.
- **R-0022: loot copied by dragging.** Foundry v14 lets anyone who can see a sheet start a drag from it (`_canDragStart` returns true), and the character sheet's default drop creates a copy. A player could drag a loot row onto their own character and keep it while the party kept it too.
  - **Fix:** only a GM may start a drag from the loot pile, and a `dropActorSheetData` guard (`refusePartyLootDrag`) refuses a non-GM's drop of party loot onto any actor sheet.
  - Players take through the Take button and the GM relay, which moves the item rather than copying it.
  - A GM can still drag a copy, since a GM can create any item anyway. Stage 4 replaces that drag with a proper transfer.

## 5. Security and visibility

**Viewing:**
- NPC members are gated by Graham's ruling.
- The Rewards tab, and the context behind it, are built for a GM only.
- The sheet's template context no longer carries the whole `system` object (the encounter and the GM's notes), only what the template prints.

**Requesting:** unchanged. Take Item and Take Coin go through the GM relay.

**Changing documents:** unchanged and enforced in the workflow code:
- XP and Begin Session refuse a player;
- the relay decides ownership from the GM's own copy of the world, and one connection of one GM acts.

**A limit of the platform, not fixed here:** Foundry sends every world document to every connected client. A player's client therefore holds the party actor (its encounter list and notes included) and every NPC actor, whatever the sheets show. Stage 1 controls what the Party sheet builds and displays. It cannot make data secret from a player's browser console. A truly private GM field would need storing somewhere players aren't sent, which matters for Stage 5's GM notes.

## 6. Foundry v14 tabs

- **The sheet's copy of `selectTab` is gone.** The nav uses ApplicationV2's own `tab` action and `changeTab`, checked against the installed v14 client's `application.mjs`. The nav gains the `tabs` class that `changeTab` looks in.
- **Two small overrides:**
  - a click on a tab's icon or label counts as a click on the tab (Foundry reads `event.target`);
  - `aria-selected` and `aria-hidden` stay in step with the open tab, as before.
- **Lifecycle:** the only listeners added are the registry's hooks (removed with the last sheet) and a one-shot `focusout` while a render waits. The drag guard is installed once, at init.

## Behaviour changes worth knowing

1. **NPC members** show only name and portrait to a player without Observer on them. Player characters are unchanged.
2. **Players no longer see the Rewards tab.**
3. **A companion, familiar or party on a roster** from older data no longer counts toward APL or XP, and is flagged for removal. It could not be added through the sheet before this either.
4. **A GM dropping a non-loot item** on the party gets a warning instead of a hidden item.
5. **Players can't drag loot rows.** They use Take.

## Files

**Added:**
- `module/party-members.mjs`
- `module/party-live-sync.mjs`
- `tools/verify-party-sheet-stage1.mjs`
- `tools/mutate-party-sheet-stage1.mjs`
- `release-notes-3.708.0.md`

**Changed:**
- `module/party.mjs`
- `module/sheets/party-sheet.mjs`
- `module/party-rewards-workflow.mjs`
- `templates/actor/party-sheet.hbs`
- `styles/trg-prime.css` (one rule)
- `scripts/trg-prime.mjs` (installs the drag guard)
- `system.json`
- `package.json`
- `CHANGELOG.md`
- `TRG_PRIME_REPAIR_LOG.md`
- `tools/uncalled-exports.json` (three harness seams, with reasons)
- `tools/verify-block38-rewards.mjs` (I1 re-anchored, same meaning)
- version pins raised in 72 harness files

## Reused, not reimplemented

- `normaliseMembers`, `addMember`, `removeMember`, `canJoinRoster`, `memberSummary`, `lootSummary`, `isLootItem` and `LOOT_ITEM_TYPES` (`party.mjs`)
- the GM relay (`party-socket.mjs`), unchanged
- `rewardsContext`, `awardPartyXP` and `beginSession` (`party-rewards-workflow.mjs`)
- `rewards.mjs`
- `actor.conditions` and `CONDITIONS` for the condition labels
- `coinValueInGP`
- Foundry's own tab and scroll-state handling

## Testing

See the Stage 1 completion report (`claude/party-sheet-v2-stage1-report.md` in the project) for the full results.

## Live-test plan (not yet run; Foundry wasn't reachable from this session)

In the **Test** world, as Gamemaster and as Testing Dude, with two throwaway parties: A (ZZ Wizard, ZZ Bard, ZZ Ally NPC) and B (ZZ Bard, plus a ZZ character).
1. **Damage, PP, a condition and a level change.** Open both sheets, then damage the ZZ Bard from its own sheet. Both parties' HP bars update without reopening. Spend PP, apply Weakened 2, raise its XP past a level, and change its portrait and name. Each update appears.
2. **Unrelated actors.** Change an actor on neither roster. No re-render: put `console.count` on `Hooks.on("renderTRGPartySheet")` and expect no count.
3. **Burst.** Apply three conditions in one macro. Expect one render per sheet.
4. **Typing.** Type in the custom XP box on the GM's Rewards tab while a macro damages a member. The typed value survives, and the sheet updates when the box loses focus.
5. **Deletion.** Delete a throwaway member. Its row becomes "deleted, or no longer available" with Remove, and the GM's note appears. Remove it.
6. **Unlinked token.** Put an unlinked token's actor on the roster, then delete the token. The row reports it missing.
7. **Open and close.** Open and close a Party sheet ten times, then run `game.trgPrime` or console `Hooks.events.updateActor.length`. The count goes back to its value before the first open.
8. **Drops (GM).** Drop a spell, a feat and an affliction on the party: each is refused with the reason, and `actor.items.size` is unchanged. Drop a sword: it is accepted. Re-order loot rows by dragging.
9. **Drops (player).** As Testing Dude, try to drag a loot row onto your character: the drag doesn't start or is refused. Take works.
10. **Visibility.** As Testing Dude (no Observer on ZZ Ally), the Ally row shows name and portrait only, while PCs show HP and PP. There is no Rewards tab. Grant Observer on the Ally and the row fills in after a re-render.
11. **Tabs.** Click each tab's icon, its label and its button edge. Tabs switch, a re-render keeps the open tab, and the look of the nav is unchanged (the new `tabs` class must not pull in core nav styling).
12. **Existing workflows.** Take Item (partial stack), Take Coin, Award XP on the throwaway party (confirm the dialog only on the real party), Begin Session and Add Selected Tokens.
13. **Two GM tabs.** With two GM tabs open, a player's Take moves the item once.

No data change and no migration.
