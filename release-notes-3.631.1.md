# TRG Prime 3.631.1 — the live test of 3.631.0

10 October 2026. One fix from the live test of the Codex automation (TRG V14, Testing Dude; report: `claude/fiends-and-fables-3.0-live-testing-report-3.631.0.md`).

## Fixed
- **A rung that prints its own line applies only its own conditions.** Wing Buffet's Partial is "pushed 5 feet directly away" and nothing more; its Failure is "pushed 10 feet and falls prone". The area rail's Partial fell back to the Failure's conditions — the 3.629 convention for an inline "On a Failure or worse" ladder, where the Partial prints nothing of its own — so a Partial against Wing Buffet was knocked prone. Now a rung with a printed outcome of its own reads only its own conditions; an inline ladder still reaches its Partial. (`peril-effect.mjs`; verify A16b, mutated.)

## Confirmed live, no change needed
- Codex inheritance builds at ready (271 names, the system's two packs and Fiends & Fables' abilities pack federated); a creature's Stench copy carries the entry's rolled-aura declaration in memory, its source untouched.
- Stench rolls on entering (a Critical: unaffected, 60-second immunity honoured on the next entry, re-rolled after it lapses); an undead is told the aura does not reach it. Aura of Fire: 4d6 basic Reflex, a Blunder adding base dice through the typed-damage path. Frightful Aura: frightened 3 and fleeing applied, the fleeing expiring on its clock.
- Sonic Moan (3d6 sonic, basic Will) and Howl (frightened by rung, the higher Frightened kept; "still immune" for everyone who rolled within the 10-minute window). Wing Buffet: push by rung offered, the wing's damage borrowed with BAB dice and Strength. Trample: the leg armed on the token (80 ft, no reactions), the button rolling basic Reflex and the slam +1 die against each target. Constrict: the Constrict weapon's damage to each creature it holds, basic Fortitude — and a clear line when the creature carries no Constrict weapon (the module's Constrictor has only a Bite; a stat-block matter for the creature blocks).
- Powerful Charge: the Stride ×2 leg armed, the Gore button at +2 circumstance with +1 base die (4d10+6 on a Minor critical), through the Strike workflow and the target picker.
- Slow (I): the Zombie regains 2 AP. Hover: the Wysp airborne at 10 ft ends its turn with no Fly action and does not fall. Regeneration: +14 at turn start on the token actor; disabled the turn after 20 damage; back the turn after. Undead Fortitude: refused against slashing (a weakness), rolled against fire — Success, 1 HP. Life Drain: a Partial → Soul Drain 5, the drain recorded per target, the drinker healed 0 at full HP.

## Noted for later
- Foundry 14 token movement animates on the canvas ticker; with the client's tab hidden, a scripted `TokenDocument.update({x, y})` leaves the placeable where it was until the tab is visible. Nothing in the system; the test placed tokens with `animate: false` and a redraw.
