# TRG Prime 3.628.0 — filter by sourcebook

7 October 2026. Graham: "Any item that is selectable by a character (such as feats, spells etc) needs to have a filter by sourcebook option. The default will be Core Rulebook and then we will need one for Fiends & Fables and Pillars of Faith. This will also need to link to future sourcebooks as they are released."

## The Sourcebook menu (new sourcebooks.mjs; picker-workflow)

Every picker a character takes something from now has a **Sourcebook** menu beside its other filters:

- the sheet's add buttons: race, heritage, background, class, every kind of feat, abilities, spells, weapons, armour, gear and the magic-item lists;
- the spell pickers: spell book, repertoire, learning a spell, feat and archetype casting.

It's added inside `pickFromPack`, which all of them pass through, so no call site had to remember it.

- It **always opens on Core Rulebook**, as Graham chose. Choosing All or another book applies to that picker only.
- The options are the books that actually have something on offer. When everything in a list comes from one book, the menu isn't shown, the same as any other filter.
- If Core Rulebook has nothing on offer, the menu opens on All rather than on an empty list.

## Where a book's name comes from

The first answer wins:

1. **The system's own packs** are the Core Rulebook.
2. **A module that registers one:** `game.trgPrime.modules.registerSourcebook("my-module", "My Book")` (new in the module API).
3. **A module's manifest:** `"flags": { "trg-prime": { "sourcebook": "My Book" } }`. This is the line a future sourcebook adds beside its packs' `extends` flags. Pillars of Faith 0.9.3 carries it.
4. **A built-in table** (`KNOWN_SOURCEBOOKS`) for books that shipped before the API: Fiends & Fables and Pillars of Faith.
5. **The module's own title,** without a leading "TRG Prime:".

## Fiends & Fables joins the pickers

Fiends & Fables Prime's packs declare no `extends`, so none of its content reached a picker before. Graham chose (7 Oct) that the core recognise the module as installed. While it is active, its four character packs join the core lists:

| F&F pack | Count | Joins |
|---|---|---|
| races | 113 | races |
| heritages | 191 | heritages |
| abilities and afflictions | 190 | abilities |
| feats | 3 | feats |

They sit behind the Sourcebook menu like any book's content.

- **Load order.** A pack that declares `extends` is listed before one joined this way. A name two books both print therefore resolves to the book that declared itself, wherever the first match is taken.
- **Upgrading F&F later.** If F&F gains its own `extends` flags, the table steps aside for any pack that declares them.

## The same name in two books (grants, grants-workflow)

With F&F's abilities federated, five names are printed twice:

- Fast Healing, Endless Hunger, Life Sense and the Phylactery of Eternal Resurgence, in both Pillars of Faith and F&F;
- Constrict, in both the core and F&F.

Name-matched grants treated a tie as unresolved, so Pillars of Faith's Unliving Vampire would have stopped receiving Fast Healing.

`matchGrants` now breaks a tie by **the granting item's own book first, then the core's**. The book is read from where the owned item was copied (`_stats.compendiumSource`). A tie left after that is still reported rather than guessed, so the Rogue/Ranger Trap Finder rule is unchanged.

## Harness

- **New pair:** verify/mutate-sourcebooks (22 checks, 16 mutations).
- **Rules-have-callers backlog:** unchanged.
- **Sweep:** 515 of 515 green. On the first run, mutate-module-api's two federation mutations had lost their anchors, because `contentPacksFor` was restructured to order declared packs first. They were re-anchored and rerun green.
