# TRG Prime 3.628.2 — the Sourcebook menu is always there

8 October 2026. Graham, on installing 3.628.1: "no filters are appearing on archetype or class feats."

## Why the menu hid (picker-workflow, sourcebooks)

The menu listed only the books that had something on offer *after* the character's gates (class, prerequisites, feat gates), and, like every filter, hid itself when that came to one book.

On Pillars 1 (a 1st-level Human with no class yet), the class feat picker offered 4 core feats and the archetype feat picker 3. Every Pillars of Faith and Fiends & Fables feat had been gated away, so there was one book and no menu. On the Test Cleric the same pickers did show it (Core/F&F, Core/PoF), which is why the 3.628.0 check passed.

The Sourcebook facet now takes its books from the **whole pack**, before the gates. The menu is shown whenever the list spans books. Choosing a book with nothing this character can take says so ("0 of 4 shown"). The rows are still only what the character may take.

## 3.628.1 confirmed live

- **Fiends & Fables, automatically.** After the reload, with no help from the console, races, heritages, abilities and feats each list core, then Pillars of Faith, then F&F.
- **The empty-list fallback.** On a character with no race, the ability picker's defaults (Kind: Racial, Sourcebook: Core Rulebook) showed nothing. The Sourcebook menu stepped back to All, and the picker opened on "197 of 300 shown".

## Harness

- **verify/mutate-sourcebooks:** now 26 checks and 20 mutations (B5, E8 added).
- **Sweep:** 515 of 515 green on the first run.
