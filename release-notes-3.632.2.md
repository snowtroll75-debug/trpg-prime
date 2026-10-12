# TRG Prime 3.632.2 — the live test of block 2

11 October 2026. Three fixes from the live test of 3.632.1 (report: `claude/fiends-and-fables-3.0-live-testing-report-3.632.1.md`).

## Fixed
- **A Swarm shares space.** Page 198's "you cannot end your turn in a space another creature occupies" refused the Rat Swarm moving onto its prey, so the swarm attack's move-in trigger could never fire. Chapter 3's Swarm trait is exactly a creature that "moves into or occupies an area occupied by another creature". Now a Swarm passes through and ends in another creature's space, and a creature may do the same with a swarm's (`space.mjs` `mayEndInSquare` / `passageThrough`, read by the movement gate). Every other creature keeps page 198's rules.
- **Aligned Control's card names what it applied.** It read "Applied: undefined" because the Controlled tag carried no label. It now reads "Applied: Controlled (permanent)", and the same for 1 minute and 1 hour.
- **Sense Aligned's roll card asks for no DC.** It rolls once against several Level DCs and its own card reports each one, so the check card shows the total without a "Set DC" prompt.

## Confirmed live, no change
Module breaths (the dragon flag, a printed sentence, a printed DC of 20), Draconic Roar on the Shade Dragon's coldfire breath, Scaly Resilience (+1, resistance, one reaction per breath), the swarm's turn-start bite, Crimson Covenant's full cycle on a real critical, Howling Kinship at 5 ft and out of range, Spawn's Injured 2 and the Fed button, Aligned Control's rolled save and register, the hostile-action re-save, the Spawn's degree shift against its creator, Sense Aligned passive and active, Aquatic in and out of the water, the Enhanced-sense prerequisites. The module's familiar button is the registered one and every Chapter 3 feat appears once.

## Harness
- `verify-ff30-block2` A16, B20 and B21 are new (42 checks); `mutate-ff30-block2` has 44 mutations, all caught.
