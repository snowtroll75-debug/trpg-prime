# TRG Prime 3.681.2

3 November 2026. One fix, from a Vhalendar session: the weapon damage card now says who took the damage.

- **Install over 3.681.1.** No migration and no world data changes.
- **Runs unchanged on it:** Eldritch Arts 0.6.1, Inner Tempest 1.0.4 and Vhalendar 0.2.2 / 0.2.3.

## Fixed

**The damage card's one line named nobody, so it read as the attacker being hurt.**
- **Reported:** "the attack is made against Borin but damages himself!" A Resonance Soldier threw its Spear at Borin Slatevein. The attack card read "Spear — Attack (thrown) vs Borin Slatevein — Hit". Below it, the damage card read "Resonance Soldier of 2221 (2) · Spear — Damage · 2 Piercing taken".
- **What really happened:** the damage landed on Borin. The card's breakdown said so ("vs Borin Slatevein: 4 Piercing, DR 2 → 2 taken. Now 50 / 54 HP"), the Soldier was untouched at 74 / 74, and Borin was 2 HP down. But the breakdown is hidden until the card is opened. The header is the attacker's name, because it is the attacker's card, so "2 Piercing taken" under it read as a sentence about the attacker.
- **Now:** the line names the creature the damage was resolved against:
  - "Borin Slatevein takes 2 Piercing".
  - A blow wholly stopped by DR still names its target: "Goblin Warrior takes 0 Piercing".
  - A stray shot names the bystander it struck, because that is who the damage step resolved it against.
  - A damage roll with no target says "7 Slashing — no target", as the attack card's "no target" does, instead of a bare number under the attacker's name.
- **Where:** every weapon damage card, which is every Strike, thrown or fired, natural or held. The line is built by a new pure helper, `damageCardSummary` (`module/combat/damage-summary.mjs`). The name is escaped, so a token named with markup prints as typed.
- **Nothing else changes.** Who the damage is applied to was already right. This is the card's wording only.

## Checked live before this fix (3.681.1, world TRG V14)

Thirteen weapon attacks by Vhalendar's Resonance Soldiers and Greater Resonance Echo against Borin, plus a temporary Soldier armed with ten weapons: Greatsword, Warhammer, Dagger, Spear (melee and thrown), Claw, Slam, Javelin, Short Bow with arrows and Whip.
- **Every hit landed on the creature the attack card named,** with its critical injuries. The attacker's HP never moved.
- **The one injury to an attacker was its own fumble:** a Javelin's thrown fumble table rolled 83, "You are Injured 2 until healed", applied to the thrower as printed.
- **The Short Bow's miss** became a stray shot into the Goblin Warrior in the melee (page 192).
- **The Whip** refused an adjacent target: "can't be used against an adjacent creature".

## Harness

- **New pair: `verify-fixes-3681-2` (12 checks) and `mutate-fixes-3681-2` (10 mutations, all caught).**
  - S1–S5 drive the line: the live case, 0 taken, no target, no name, and a name with markup.
  - W1–W5 read the wiring: the import, the target's name (not the attacker's) handed over, the card posted with it, the old nameless line gone, and the damage step's own target.
  - The mutations include the defect itself (the old line put back) and the attacker's name handed over in place of the target's.
- **`verify-fixes-3681-1`'s** version check is now "3.681.1 or later".
- **Version pins** moved to 3.681.2 in seventeen mutation files. `system.json`'s download names v3.681.2.
- **Full sweep:** see below.

## Packs

- **Packs:** unchanged. The release ships the 3.676.1 pack files byte for byte.
