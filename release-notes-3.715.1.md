# TRG Prime 3.715.1: Tumble gives its Stride, asks for its enemy, and fails properly

26 November 2026. Branch `fix/skill-tumble`, on top of 3.715.0 (`feature/spellbook-free-spells`).

- **Install over 3.715.0.** No migration, and no world data changes.
- **Modules:** nothing new is needed. Inner Tempest 1.1.1, Eldritch Arts 0.18.3 and Pillars of Faith 0.13.3 run on it.

## The report

Graham, 26 November 2026, after Wednesday's game: "the Tumble action on the Acrobatics skill. This is not working." At the table:
- the move after the Tumble cost extra AP;
- it still provoked Attacks of Opportunity;
- the DC was wrong, or there was no target.

The book (Acrobatics): "Action 1 AP. You take a Stride action as part of this action. During this movement, you can try to either move through an enemy's threatened area or move through the space of one enemy without provoking a reaction. Attempt an Acrobatics check against the enemy's Fortitude DC or Acrobatics DC (whichever is higher)." Failure: "Your movement ends, and you trigger reactions as if you had moved out of the square you started in." And: "The DC is increased by 2 if you are trying to move through the enemy's space."

## What was wrong

- **No Stride.** The 1 AP paid for the check and nothing else. Dragging the token afterwards was charged as a separate Stride.
- **Reactions from everyone.** That Stride provoked from every enemy, including the one the Tumble had beaten.
- **No enemy.** The DC came from whoever happened to be targeted. With nobody targeted there was no DC, and the +2 for going through the enemy's space was never added.
- **A failure did nothing.** It neither ended the movement nor drew reactions.

## What it does now

1. **Pick the enemy.** Pressing Tumble lists every enemy your Stride can bring you into the threatened area of (within your land Speed plus its reach), nearest first. Each appears twice:
   - **past it, through its threatened area;**
   - **through its space (+2 DC).**

   The list opens on your current target if it is one of them, past it. The choice becomes your target, so the DC and the card name the same creature. **Cancel spends nothing.** With Shift-click and a target already in range, it goes past that target without asking.
2. **The DC** is that enemy's Fortitude DC or Acrobatics DC, whichever is higher. Through its space, +2 is added, and the card says so.
3. **On a success or critical, in combat,** your next drag is the Tumble's Stride:
   - up to your land Speed, at **no further AP**;
   - **the Tumbled enemy gets no reaction** to it, but other enemies still may;
   - it must be your next action, as Agile Display's Step must. Doing something else first removes it, with the notice "Tumble: the free move is removed".
   
   Through its space, its squares count as difficult terrain on a success and normal movement on a critical, as before.
4. **On a failure or fumble, in combat,** the card says your movement ends. Every enemy whose reach covers your square is offered its Attack of Opportunity, as if you had left that square. A fumble also leaves you Prone, as before.
5. **No token on the scene, or no enemy in range:** Tumble behaves as before. The target, if any, sets the DC.

## Readings for Graham

- **Whose reactions the Stride escapes.** Built as *the Tumbled enemy only*. The book's check is against "the enemy" (one), so other enemies you pass still get their reactions. If you meant the whole Stride to provoke nothing, it is a one-line change.
- **The failure's reactions** are offered from the square you are standing in. No token moves, so "as if you had moved out of the square you started in" is read as every enemy threatening that square.
- **Offensive Momentum (Inner Tempest).** It makes a Tumble and then arms its own movement, which provokes. So inside Offensive Momentum, the Tumbled enemy still gets its reaction, as it did before this release. Should Offensive Momentum's movement carry the Tumble's exemption? That would be an Inner Tempest change.
- **Text source.** The Tumble wording above is from the Core 3.7 text in the repo. I have no 3.8 copy here to check against, so please flag it if 3.8 changed Tumble.

## Also changed

- **The "next action" lapse notice** says "the free move is removed" for a leg that isn't a Step. Agile Display and Effortless Motion still say "the free Step is removed", word for word.
- **`movementReactors` and `detectMovementAoO`** take an optional `{ exemptTokenIds }`. The new `detectDepartureAoO(actor)` offers movement reactions from the actor's own square.

## Harness

- **New: `verify-skill-tumble`, 48 checks.** Driven: the candidates, the choice, the +2, every degree's plan, the leg and its card line, the per-enemy exemption against stub tokens, the departure reactors, and both lapse notices. Also checked in source: the wiring in `resolveAction`, the outcome, the movement hook and the opportunity file.
- **New: `mutate-skill-tumble`:** all 35 mutations caught.
- **Re-pointed:** `verify-chapter7-combat-191-200` O9 now reads the new outcome code (145 checks; its 112 mutations all caught). One `mutate-agile-display` anchor was moved for the notice wording (60 checks; all 93 mutations caught).
- **Version pins:** re-pinned to 3.715.1.
