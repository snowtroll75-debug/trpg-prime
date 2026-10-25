# TRG Prime 3.667.3

23 October 2026. Two changes from the live test of Inner Tempest 0.4.1:
- a weapon attack now says what it is struck with, so a modifier can apply to unarmed attacks only;
- a weapon attack or a Spellcraft check now asks its tick-boxes before the dice.

- **Install over 3.667.2,** then Inner Tempest 0.4.2, which needs this release.
- **Unchanged and still working:** Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.**

## 1. Inner Strike's +1 to unarmed attacks never applied

**Found live.** Inner Strike's rider dealt its damage, but the attack card never listed its +1 status.

**Cause.**
- **No way to say "unarmed".** A modifier could be scoped to attacks, and to melee or ranged ones, but not to unarmed ones. So the module wrote the +1 as a tick-box.
- **Tick-boxes need the dialog.** They were offered only in the check dialog, and a weapon attack never opens it.

**Fix: a new scope, the attack form.**
- **What it says:** a weapon attack's check now carries its form:
  - **"unarmed":** the fists, a weapon the core declares unarmed (Gauntlet, Spiked Gauntlet, Brass Knuckles, Cestus), or a weapon with the Monastic trait. This is the same rule as Powerful Fists.
  - **"natural":** a claw, a bite, a slam and the other natural attacks.
  - **"weapon":** everything else.
- **How a modifier uses it:** it can be scoped to a form (`when.attackForms`) or exclude one (`not.attackForms`). Every other roll carries no form, so a modifier scoped to one matches nothing else.
- **Inner Tempest 0.4.2** uses it to apply Inner Strike's +1 automatically on unarmed melee attacks.

## 2. Tick-boxes on a weapon attack or a Spellcraft check

**Graham, 23 October:** "Please build the proposed fix". Scope: "Attacks + Spellcraft".

**Before.** A tick-box is a modifier its author left for a person to judge, such as "+1 against a creature possessing another — tick if the target is one". It was offered only in the check dialog. That dialog opens for checks rolled from the sheet and for skill actions; a weapon attack and a Spellcraft check never open it. So these were never offered, and never applied:
- **Inner Tempest:**
  - Spirit Stance's possession clause;
  - Echoes Beyond on an attack or a Spellcraft check;
  - Maintain Clarity on a Spellcraft check for a Concentrate or Mental spell.
- **Pillars of Faith:** five Spellcraft rows. They are Hedge Witch, Mend the Spirit, Cleansing Hands, Break the Working and Forbidden Research.

**Now.**
- **The prompt:** when a weapon attack or a Spellcraft check matches a tick-box, one small prompt comes before the dice. It lists the matching tick-boxes, all unticked, with a **Roll** button. Ticked ones apply; closing the prompt applies none.
- **Most rolls are unchanged.** Nothing is asked when no tick-box matches, and the automatic modifiers apply unasked, as before.
- **Shift skips it,** as Shift skips the dialog. This holds for a weapon attack, a sheet roll and a skill action.
- **Who is asked:** the rolling screen, when its user owns the character or is the GM. Anyone else isn't asked, as before.
- **Alter the Thread's reroll** keeps the first roll's answer and doesn't ask again.
- **A one-shot tick-box** (Echoes Beyond) is spent when ticked, exactly as in the dialog.

**Not changed, by your choice: forced saves.** A save forced by a spell or an ability still asks nothing. 62 save tick-boxes (15 core, 44 Pillars of Faith, 3 Inner Tempest) are written as "tick if this save is against X". Asking them on every forced save, X or not, would be noise. Initiative is unchanged too.

**One to watch.** While Spirit Stance is active, every attack against a creature that isn't a spirit asks its possession tick-box. That is how the row is written: "tick if the target is one".

## Checks

- **New harness pair `verify/mutate-attack-forms`:** 20 checks and 13 mutations, all caught. Covered:
  - the forms of the pack's own fists, gauntlets, claws and swords, and a Monastic weapon;
  - the scope matching only its form, and nothing on a roll with no form;
  - the exclusion;
  - the wiring from the attack to the check.
- **New harness pair `verify/mutate-offered-conditionals`:** 29 checks and 23 mutations, all caught. Covered:
  - the prompt's rules, run against a stand-in dialog: which rows, when, and who is asked;
  - a ticked row applying and an unticked one not;
  - a forced save not asked, and a Spellcraft check asked;
  - Shift, the dialog's own answer, another player's screen, the reroll, and a one-shot spent;
  - the wiring in the check, the sheet, the skill action and the attack.
- **`verify-conditionals`:** 94 checks, 12 scopes.
  - Its every-scope-is-supplied checks now cover the new scope.
  - Its scan now reads the one context the automatic modifiers and the prompt share, with a new check (F1c) that both read it.
- **Re-anchored, without changing what they test:**
  - two `mutate-stance-declarations` anchors;
  - `verify/mutate-block3-core` D4, which reads Alter the Thread's reroll line, now longer by the kept answer.
- **The uncalled-export ratchet:** backlog unchanged at 513. The prompt's four pure rules are declared keeps, with reasons.
- **Full sweep: 625 of 627 green** on a clean stage (the 3.667.2 release plus exactly this release's changed files), the two new pairs included. The two failures were `verify/mutate-block3-core` D4's text anchor. It was re-anchored, and both were re-run on the stage: 59 checks and 59 mutations, all green.
- **Tested live:** see live-testing-report-3.667.3. Everything passed; the prompt's row layout is fixed in 3.667.4.
