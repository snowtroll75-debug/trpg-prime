# TRG Prime 3.720.0: a token is the size its creature is

28 November 2026. Branch `fix/token-size-link`, on top of 3.719.1.

- **Install over 3.719.1.** No migration: the world is not asked to migrate. The first time the GM opens the world, and each scene, tokens are resized where they disagree with their creature's Size (see "What you will see the first time").
- **Companion modules:** none needs an update.

## The fault

- **Reported:** by Graham on 28 November 2026: "there seems to be no link between the Size characteristic of the actor and its token size. This affects a number of things such as starting character size and changes if a temporary effect changes an actors size (such as size alteration)."
- **What was there:** three special cases resized a token (Change Shape, Luna Frenzy and a companion's growth). Nothing else did. A character made Small or Large on the sheet kept a one-square token, and Size Alteration changed the statistics and left the token alone.

## Now

A creature's token takes its width, height and depth (X, Y and Z) from its Size:

| Size | Token |
|---|---|
| Diminutive | 0.4 |
| Tiny | 0.6 |
| Small | 0.8 |
| Medium | 1 |
| Large | 2 |
| Huge | 3 |
| Gargantuan | 4 |
| Colossal | 5 |

- **Which Size:** the one the sheet shows, after any effect has changed it. Size Alteration, a form, a frenzy, a companion's growth and a Size typed on the sheet all go through the same link.
- **When:**
  - **A new token** is created at its creature's Size, whoever drops it.
  - **A change of Size** resizes every token of that creature on every scene, a moment after the change, and again when the effect ends. An unlinked token follows its own copy of the creature.
  - **The prototype token** follows too, so the next token dragged out is right.
- **Not a move:** in combat the resize costs no AP and provokes nothing, as a form's resize already did.
- **A token that grows out of a quarter square:** Foundry lets a 0.4 or 0.6 token stand at quarter squares. When such a token grows to Small or larger it takes the square its centre was in, rather than being left across two.
- **Which actors:** characters, NPCs, companions and familiars. A party, a vehicle and a peril (a trap or a haunt) keep whatever token size they were given.

## Distances for tokens under a square

A Small, Tiny or Diminutive creature still occupies its one square for reach, flanking and distance: the smaller token is the drawing, not the space. The square such a token stands in is now read from its centre. Before, it was read from its left and top edge, which is wrong for a token Foundry has snapped half-way across a square.

## What you will see the first time

- **Tokens already on a scene** are resized when the GM opens that scene. In practice that is every Small, Tiny and Diminutive token, which were all one square, and any creature whose token did not match its Size.
- **Every world actor's prototype token** is checked once each time the GM's client starts. Only those that disagree are written.
- **A token size set by hand** on a creature is put back to its Size. If you want one creature drawn at a different size from its Size, tell me and I will add a per-token "keep this size" tick box.

## Limits

- **A GM must be connected** for a resize to happen. If a player's effect changes a Size with no GM online, the token catches up when the GM next opens the scene.
- **Change Shape and Luna Frenzy** still resize the token themselves first, in whole squares. For a form under Medium the token is briefly one square and then its real size.
- **Small tokens sit in the top-left of their square.** That is where Foundry snaps a 0.8 token; it is not centred in the square.

## Testing

- `verify-fixes-3720-0`: 48 checks. `mutate-fixes-3720-0`: 39 mutations, all caught.
- All 412 per-rule verify files passed, run one by one, with `verify-no-undefined-names` and `verify-rules-have-callers`. Two anchors were updated for the new table (`verify-block10-core` C3) and the version.
- The 31 mutate files that touch `geometry.mjs`, `movement-workflow.mjs` or `companion-workflow.mjs` passed.
- **Not run:** `verify-checks-read-source`, `verify-checks-can-fail`, the mutate files that touch none of those three sources, and the companion modules' own suites. The change adds no API a module uses and does not alter distances for tokens a square or more across.
- **In the Test world, before installing** (Foundry 14.367, the new code loaded in the browser only, temporary actors and tokens, all deleted):
  - A Small NPC's prototype token became 0.8 × 0.8 × 0.8, and its new tokens, linked and unlinked, were created at 0.8.
  - Size set to Large on the actor: both tokens and the prototype went to 2.
  - An effect made with Size Alteration's own change (`sizeStepChange`, one step up): Huge, tokens at 3; effect deleted: back to 2.
  - An effect on an unlinked token's own actor resized only that token.
  - A Tiny token parked at a quarter square (3.5, 3.25) and made Medium went to square (3, 3).
  - Diminutive gave 0.4 and Colossal 5. A character made Diminutive then Colossal went 0.4 to 5.
  - A blank Size left the token alone, and an unrelated actor update wrote nothing.
- **Still owed once installed:** the resize in combat (no AP charged, no move refused), which uses the installed movement hook; a real Size Alteration cast; the first-run correction of a scene; and a player's view.
