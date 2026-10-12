# TRG Prime 3.572.0 — a favoured weapon may be a group

18 September 2026. One mechanism for Pillars of Faith 0.5.0 (Chapter 7, Divine Aspects).

## The group match

Appendix 4 prints a favoured weapon as a family head — Mace, Scythe, Longbow — and the aspect reaches the family by name suffix ("Heavy Mace" ends in "mace"). Pillars' twenty-two aspects print weapon GROUPS: Sword, Hammer, Knife, Polearm. The suffix rule reached most of a Sword or Hammer by accident of English and none of a Knife's (Dagger, Sickle, Main-Gauche) or a Polearm's (Halberd, Glaive, Bardiche). The proficiency rules already compared the favoured line with the weapon's group; the attack bonus and the Crusader's Devotion did not.

`favouredWeaponGroupMatches(favoured, weaponGroup)` (divine-aspect.mjs, pure) is the letters-only equality; `favouredWeaponSources`, `favouredWeaponAttackModifiers` and `grantsProficiency` take the weapon's group as a third argument and match by name or group, and the attack workflow hands `weapon.system.group` over at both of its sites. The ten appendix families are unchanged: Death's Scythe does not reach a Glaive through the Polearm group, because a name is matched as a name and a group as a group.

## Harness

`verify-favoured-weapon-group.mjs` (18): the group match driven (exact, case-blind, no prefix or suffix, empty never), the three callers by group and by name, the appendix families pinned, the two workflow sites structural. `mutate-favoured-weapon-group.mjs` — 5 mutations, all caught. Full sweep green.
