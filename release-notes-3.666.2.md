# TRG Prime 3.666.2

22 October 2026. Adds the Runestone to the gear list, as Graham asked.

- **Install over 3.666.1.**
- **There is no migration**: the Runestone is a new compendium item.
- **Companion modules are unaffected:** Inner Tempest 0.3.3, Pillars of Faith 0.11.1 and Fiends & Fables Prime 0.45.2 work with it unchanged.

## The Runestone

Graham's entry: "RUNESTONE — MAGICAL — Level 1 — Price 80 gp — Usage held in 1 hand; Weight 1 lb."

**In the Gear compendium,** among the Goods. It is Magical, level 1, 80 gp, held in one hand, and weighs 1 lb. The description is Graham's text verbatim, except that "Transfer Runes Crafting check" reads "Transfer Runes check" (see the ruling below), plus one italic line saying how to use it on the sheet.

**Storing a rune.**
- A runestone's sheet has a **Runestone panel** holding its one stored rune, typed as the book prints it (Flaming I, Wildform IV, Spell Effect (Fireball, 3/day)).
- "You can inscribe only one rune upon the stone at any one time": a second rune is refused, with a message saying why.
- A Spell Effect rune's own comma is not counted as a second rune.

**Its traits follow the rune.** "Once the stone is etched, it gains the school and tradition traits of the rune etched upon it. When a rune is transferred from the runestone to another object, the runestone loses these traits."
- Etching a rune adds that rune's school and tradition traits to the stone's own Magical. The traits are read from the rune catalogue: Chapter 11's runes, the Creature Codex's, and any a companion module registers. For example, Flaming adds Invocation, Reflecting adds Warding, and Wildform adds Alteration and Verdant.
- When the rune leaves, by Transfer Runes or by clearing the field, exactly those traits go. Any trait a GM typed stays.
- **Why the traits are written, not worked out each time.** The stone records which traits its rune lent it, so the right ones come off. A worked-out list would show in the Traits box, and saving the sheet would store it permanently, so the stone would keep the traits after the rune had gone.

**A stored rune does nothing.** A rune on a runestone gives its carrier nothing: it is stored, not worn.

**Transfer Runes already knew a runestone,** and the new item plugs into it:
- the stone's rune is offered as a source with no between-items +5;
- a Partial cracks it, and a Failure or Fumble destroys it, as printed.

**And a rune can now go onto a runestone.** Graham, 22 October 2026: "A rune can be transferred onto a runestone from an item."
- An **empty, uncracked** runestone is now offered as a destination.
- A stone already holding a rune is not offered, because it holds one at a time.
- Moving a rune off an item is the between-items transfer, with its +5 and its outcomes.
- The stone takes the rune's school and tradition traits as it is etched.
- The action's description says so.

A cracked stone's field is locked. It can still give up the rune it holds, but it never takes another ("useless for future rune storing").

**Graham's other ruling of the same morning:** the entry's "Transfer Runes **Crafting** check" is a slip. Transfer Runes stays a check with one of the four magical skills (Arcana, Religion, Occultism or Nature), as the Core Rulebook prints it.

## Checks

- **New harness pair:** `verify/mutate-runestone`, 26 checks and 19 mutations, all caught. Two of the checks are Graham's runestone-as-destination ruling.
- **The uncalled-export ratchet:**
  - `isRunestone` and `isCracked`, two rune-transfer rules that had sat in the backlog, are now called, so the backlog shrinks to 514;
  - the stone's two pure rules are kept for their harness, with reasons.
- **Full sweep: 615 of 615 green.** It ran on a clean stage: the 3.666.1 release plus exactly this release's changed files and the gear pack.
