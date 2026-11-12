# TRG Prime 3.675.0

28 October 2026. The seams Eldritch Arts' Block 1 needs: Chapter 2's races and heritages, the background feats, Chapter 4's actions and Chapter 6's exotic weapons. They come from the Block 1 audit (C1–C9, `trg-eldritch-arts/docs/ELDRITCH_ARTS_BLOCK1_AUDIT.md`), as proposed there and still open for Graham's ruling (B1-1 to B1-18).

- **Rebuilt 29 October: the first 3.675.0 zip was rooted wrong.** Its top folder was `trpg-prime/`, the checkout's folder name, not `trg-prime/`, the system's id. Foundry installed it into a folder that does not match the id and dropped the system from its list. The rebuilt zip holds the same files under `trg-prime/`. `build-zip` now roots the archive on the id and refuses to finish if any entry falls outside it.
- **Install over 3.674.2.** Eldritch Arts 0.1.0 needs it. Inner Tempest 1.0.3 runs on it unchanged.
- **No migration prompt.**
- **Nothing changes for a game that declares none of the new things.** Every new rule is opt-in: an item, an effect or a module has to declare it.

## What content can now declare

**C1 — a bonus to a spell's damage roll.** `flags.trg-prime.spellDamageBonus { label, value | valueFrom, type, traits? }` on an effect the caster carries.
- `valueFrom` names an attribute (`"charisma"`): its total is the bonus. This is the Emberkin's Elemental Surge.
- `traits` limits it to spells carrying one of them.
- Bonuses stack by type, as every other typed bonus does.
- It is added once, to the spell's damage roll, on both the attack and the save path, and named on the card. A second packet, splash, recurring damage and healing take nothing.

**C2 — Spell Resilience under another name, and a feat that lowers it.**
- A `creatureAbility.derives.spellResilience` may be `{ label, type }` instead of `true`. The row is then named and typed as declared. This is the Nyrinn's Null Aura: the core's rule, under its own name.
- Two abilities with the same label give one row, not two.
- `flags.trg-prime.spellResilienceReduction { value, labels, label }` on a caster's item or effect lowers the named rows on its targets, never below 0. This is Spell Penetration: "Spell Resilience" only, so a Null Aura is not lowered.
- Both the attack path and the save path read it. The card says by how much a row was lowered.

**C3 — extra PP a casting must pay.** Module API `registerCastSurcharge(key, ctx => ({ pp, label, lines }))`.
- The surcharge is asked before the PP check, so a caster who cannot pay it cannot cast.
- It is paid on top of the spell's PP. It raises no casting DC and counts against no per-cast cap (B1-6). It is paid whatever the degree.
- A spell cast from an item is not asked.
- A surcharge that throws is logged and noted on the card. The casting goes on without it.
- This is the Zhal-vryn heritage: "All creatures within your Null Aura must expend an additional PP to cast spells (including cantrips)."

**C4 — a fumble reroll on named skills.** `fumbleReroll.subjects` limits a reroll to those skills. This is Esoteric Insight's Arcana and Occultism. A reroll without `subjects` reads as before.

**C5 — a feat's own time ladder.** A skill action may declare `timeLadderByFeat: { "<feat name>": ladder }`. An actor holding the feat is offered that ladder instead. This is Focused Ley Sense's five rungs.

**C6 — another way to read a scroll.** Module API `registerReleasePath(key, async ctx => option)`.
- The path is offered in the scroll's release dialog beside Spellcraft and the tradition skills.
- `option` is `{ key, label, skill, difficulty, dcAdjustment, available, reason }`. An unavailable path is still listed, with its reason, as the core's own are.
- A difficulty the check does not know falls back to Medium.
- Scrolls only. A path that throws is logged and left out.
- This is Chapter 4's Lingual Casting.

**C7 — a heritage's racial weapon.** The Exotic racial clause now reads the heritage as well as the race. The Clamhscrios carries "Wyrmdral", a Scaelyn heritage.

**C8 — a weapon trait that changes the category for a class type.** Module API `registerWeaponTraitRule(trait, { categoryAs: "Simple" | "Martial", classTypes })`.
- A class's type is read from the class item. A Bard's "Adept/Expert" is both.
- The friendliest category any rule gives wins: an Adept Emberkin's Brikail Naomhtha is Simple, not Martial.
- A rule never makes a weapon harder to use than its own category.
- The proficiency panel names the clause that applied.
- This is Chapter 6's Adept trait.

**C9 — a spell's second damage packet.** `system.secondaryDamage { formula, type }` on an attack spell.
- On a hit it is dealt after the main packet, against the target's own defences for its type.
- The caster-level modifiers gain `secondary`: a flat amount per step.
- This is Orb of Water: "1d6 bludgeoning and 1 secondary cold … CL 4+: The damage increases by 1d6 & the secondary by 1."

## Found in review, before release

**C10 — a gate row on the casting DC only.** A spell-check gate's row may say `castingOnly: true`.
- It decides the casting's degree against its casting DC, as any gate row does.
- It is left out of an attack spell's attack against DB. Before this, a gate's row lowered both.
- An innate or item attack, which has no casting DC, never takes it.
- This is Null Aura: "Spellcraft checks … have their casting DC increased".

**C11 — Invest Item's rules for another way to invest.** The module helpers gain `investRefusal(actor, item)`. It returns why the item cannot be invested now (the one-Staff rule, the slot limit, already invested), or "". This is Quickbind, "instead of using the Invest Item action".

## Harness

- **`verify-ea-block1-core`:** 71 checks; **`mutate-ea-block1-core`:** 53 mutations, all caught.
- **Re-anchored:** every `tools/mutate-*` version pin to 3.675.0; `verify-ff30-codex`'s B26 pattern now accepts the caster argument C2 added.
- **Re-anchored after the seams moved their lines:** verify/mutate-block2-core, -block5-core, -block8-core, -block34, -block36b, -fixes-3669-2, -spell-storing, -spell-attack-bonus, -chapter6-gear-151-160 and -181-190, mutate-release-links. Each still catches what it was written for.
- **`tools/uncalled-exports.json`:** keeps added for `spellResilienceReductions`, `investRefusal`, `normaliseSurcharge`, `totalSurcharge` and `traitRuleCategory`.
- **The sweep:** all 655 pass.
- **Inner Tempest 1.0.3's harnesses on 3.675.0:** Blocks 1–4 and 6–10 and the weapons are all green. Block 5 needs the Inner Tempest book's markdown, which was not in this workspace.

## Not in this release

Nothing is pushed or published. The zip is built for Graham to install.
