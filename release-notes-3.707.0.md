# TRG Prime 3.707.0: Stone Shield, fully implemented

21 November 2026. Follows 3.706.1. Branch `fix/spell-stone-shield`, from `main` at `6af3921` (3.706.1).

Graham: "despite your repeated assurances that the core system is fully implemented I am discovering things that are not. The latest is the Spell Stone Shield … Can you please fully implement this".

## What was wrong

Since 3.406.0 Stone Shield gave **+4 circumstance to DB against the one foe chosen**, correctly scoped. Nothing else in the spell was automated. It sat in a note:

> If the opponent's attack misses you by 4 or less it strikes the shield instead. Hardness 8, Hits 15.

So:

- a near miss struck nothing;
- the shield had no Hits to lose, and nothing ended the spell;
- the earth-or-stone requirement was never asked;
- the reaction was cast by hand from the sheet.

**Owned copies were also stale:** no owned-copy repair was ever written for Stone Shield. A copy on a sheet from before 3.406.0 still gave +4 against **every** attacker.

## Graham's rulings, 21 November 2026

1. **Cover:** "+4 DB only, as printed". Stone Shield doesn't add the Reflex bonus that the Cover rules give standard cover, and it doesn't count as cover for Take Cover. This is what was already live.
2. **Area damage:** "Area damage does not attack against your DB so why would it be needed. A damage the shield button for the GM would however be useful when used for the actual parameters of the spell." Area damage is not automated. The GM has a **Damage the shield** button.
3. **Earth or stone:** "Ask, and refuse on No".
4. **Reaction:** "this spell is a reaction cast so a GM prompt (similar to what is used for Nimble Dodge) could work".

## What happens now

### Raising the shield

- **As a reaction when attacked.** When an attack is made against a creature that has Stone Shield, the attack waits while that creature's player is asked first, the same way Nimble Dodge is offered.
  - This covers a Strike, a spell attack, a bomb and Spiritual Weapon.
  - The prompt states the requirement: "Only if you are adjacent to a large area of earth or stone, such as the ground or a wall". Taking it is the Yes, so the cast doesn't ask again. A second dialog would run against the attack's 30-second wait.
  - Taking it casts Stone Shield against the attacker, spending the reaction and 2 PP. The attack then rolls against the raised DB.
- **When it isn't offered:**
  - the creature can't cast the spell (not prepared, too little PP, no reaction left);
  - a shield already stands against **this** attacker. One raised against a different foe doesn't stop it being offered.
- **From the sheet:** the cast asks "Are you adjacent to a large area of earth or stone, such as the ground or a wall?". On No, the cast is refused before any PP or the reaction is spent: "Stone Shield cannot be cast — you must be adjacent to …".
- **The cast card** names the foe and the shield (Hardness 8, 15 Hits), and carries the GM's **Damage the shield** button.

### The shield in play

- **A miss by 1 to 4 from the chosen foe strikes the shield instead.**
  - It covers the foe's Strike, spell attack, bomb and Spiritual Weapon.
  - Another creature's near miss doesn't strike it: the shield stands between you and one foe.
- **The damage:**
  - **Strike:** the weapon's damage is rolled with no creature under it. There's no critical (it missed) and no Sneak Attack or Precision dice (those need a flat-footed or flanked creature, not a slab of stone). The card is "Club — Damage to Stone Shield".
  - **Spell attack:** the spell's own damage.
  - **Bomb:** the flask's damage. It breaks on the shield rather than scattering, and its splash lands there, beside the target (placed by hand, as every splash is).
  - **Spiritual Weapon:** its damage.
- **Hardness 8** comes off first, and the rest comes off the 15 Hits. The shield's card gives the working and what's left, for example "takes 2 (10 damage, Hardness 8 stops 8): 13/15 Hits left".
- **At 0 Hits** the shield is destroyed, the spell ends and the ward is removed: "is destroyed — the spell ends and the shield crumbles away."
- **Through the GM:** when the client that rolled doesn't own the shielded caster (a player's Strike on the GM's NPC), the GM's client writes the damage (`BARRIER_DAMAGE`). It reads the shield's Hardness and Hits from the effect itself, never from the request.
- **The GM's button** (hidden from players) takes any damage by hand, through Hardness: area effects, or anything else the GM rules reaches the shield.
- **Typed extra damage** on a Strike that strikes the shield (a Flaming rune, say) is named on the card for the GM to add with the button. Only the blow's own damage is dealt automatically.
- **A near miss that would also be a stray shot** (firing into melee) strikes the shield. The slab is between this attacker and the target, so the blow meets it first.

### Found on the way: Spiritual Weapon ignored DB bonuses (fixed)

A Spiritual Weapon strike read the target's sheet DB and nothing else. A ward's "+4 against that enemy", and every other `defenceDC` row, applied to the Strike, the bomb and the spell attack, but never to this strike. Now it reads them as the spell attack does, and its card lists them.

## Data

- **Pack:** Stone Shield's effect row is now the ward plus `barrier: { hardness: 8, hits: 15, missWithin: 4 }` and the `castQuestion`, with no note. It is declared as `stone-shield-barrier-3707` in `tools/data-fixes.json`, and `stone-shield-ward-scope` is retired by it.
  - A record diff against 3.706.1 shows exactly one change: the Stone Shield record (`AhyJzFZyhCo351iH`).
  - The other packs are byte-identical.
- **Owned copies:** the `PACK_REPAIRS` row `stone-shield-barrier-3707` brings an owned Stone Shield to the same row. It recognises both the 3.406.0 row and the pre-3.406.0 one (+4 against everyone) as stale. A house-ruled copy is kept, and the report says so.
- **Migration:** the pack-copy pass is re-gated to 3.707.0 and the schema is stamped 3.707.0. A world at 3.706.1 is offered it once.

## New in the engine (for modules)

- `magic/barrier.mjs` (pure) and `magic/barrier-workflow.mjs`: a `ward` row may carry a `barrier`. Any effect row may carry a `castQuestion`, asked before the cast and refused on No.
- `castAsReaction(caster, spell, tokenIds, { castQuestionsAnswered })`.
- A defence offer's `requires(actor, item, event)` now receives the attack, `{ kind, attackerUuid }`.

## For Graham

- **"Until the start of your next turn" ends on a round clock.** Stone Shield's ward is stamped to end at the next round and on the world clock (+6 s). That has two effects:
  - cast as a reaction **after** your own turn, it ends at the start of your next turn, as printed;
  - cast **before** your own turn in the same round, it lasts one turn longer than printed.

  This is the clock every spell with this duration uses, so I've left it unchanged. Do you want "start of your next turn" timed to the caster's own turn?
- **Several foes targeted from the sheet:** casting from the sheet with more than one enemy targeted wards against all of them. That has been so since 3.406.0. The reaction always picks just the attacker. Should a sheet cast be limited to one foe?

## Harness

- **New:** `verify-stone-shield` (64 checks) and `mutate-stone-shield` (23 mutations, all caught).
- **Re-anchored:** 9 checks and 2 mutation anchors whose lines this release changed, each still asserting the same thing:
  - `verify-area-rider` F2;
  - `verify-chapter7-combat-191-200` B5;
  - `verify-chapter6-gear-161-170` B3c (3 subdual sites);
  - `verify-chapter6-gear-181-190` F11 (3 ammo-coat sites);
  - `verify-block34b` C18;
  - `verify-ea-block3b-core` W27;
  - `verify-session-fixes-1022` D12, D13;
  - `verify-fixes-3681-2` W3, W5;
  - `mutate-fixes-3681-2` and `mutate-ea-block3b-core` (one anchor each).
- **Ratchet:** `castAsReaction` leaves the uncalled-exports keep list. It now has a core caller.
- **Version, schema and pack-copy gate pins** raised to 3.707.0.

## Testing

- **Core verify:** all 393 verify scripts at the final commit, run one at a time in a clean worktree, with the packs restored after each. **393 of 393 pass.**
- **Core mutation:** every mutation script that reads a changed file or carries a pin: 291 scripts. **291 of 291 pass**, after the `castAsReaction` anchor in `mutate-ea-block3b-core` was re-anchored and re-run (103 of 103 caught).
- **Long whole-tree mutations:** `mutate-fixes-3685-3b` and `mutate-checks-read-source` (about 55 min each) were started at the final commit and had **not finished** when this was written. They are not counted as run.
- **Modules:** every verify script of Pillars of Faith (0.12.6), Inner Tempest (1.0.4) and Eldritch Arts (0.17.2), run against 3.706.1 and against 3.707.0 (`TRG_PRIME_ROOT`), gives **identical results**. The only failures, on both, are the modules' own version pins.
- **Pack:** a record diff against 3.706.1 shows exactly one change: Stone Shield. The other packs are byte-identical. The zip's pack reads back with 692 spells.
- **Live Foundry:** not yet run. The Test world is on 3.706.1, waiting for Graham to install 3.707.0.
