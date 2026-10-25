# TRG Prime 3.668.1

23 October 2026. What Inner Tempest 0.5.1 needs: a fix for the 0.5.0 live test, and Chapter 6's three new weapon traits, which Graham asked for ("Add the weapons from chapter 6").

- **Install over 3.668.0,** then Inner Tempest 0.5.1, which needs this release.
- **Nothing changes for a game without Inner Tempest.** No core item declares the new option, and no core weapon carries any of the three traits (a harness reads both weapon packs to check). The one change everyone sees is the penalty label in section 2.
- **Unchanged and still working:** Pillars of Faith 0.11.1, Fiends & Fables Prime 0.45.2 and Vhalendar 0.2.2.
- **No migration prompt.**

## 1. A Use that manages its own Focus use

The live test of Inner Tempest 0.5.0 found a problem with Combat Form, a Focus ability with no printed count. The Use button spends a use whenever the ability's handler posts a card without spending one itself. Learning a form posts a card, so learning spent Combat Form. The next press was refused: "its Focus use is spent".

A module automation can now declare **`ownsFocusUse: true`**. For that item the Use button does two things differently:
- it does not refuse the press when the use is spent;
- it does not spend the use itself.

The handler then does both. Only a module's automation can declare it; the core's own automations and the type tables cannot. Inner Tempest's Combat Form declares it:
- **learning a form is free,** even while Combat Form is expended;
- **entering a form still needs the use and spends it.**

## 2. A penalty a Strike was given, named for what gave it

Flow Strike is made "as if it was your third strike of the turn". Its card read "Multiple Attack Penalty (attack 2) −10". The value was right, but the label counted the attack the Strike would otherwise have been.

When the caller sets the penalty (`mapOverride`) and names itself (`optionLabel`), the row now names the ability instead: "Multiple Attack Penalty (Flow Strike) −10". Everything else still reads "attack N", including Sweeping Strike and Torrent of Strikes, which set the penalty without a name.

## 3. Chapter 6's weapon traits: Backswing, Brace and Twin

Inner Tempest 0.5.1 adds Chapter 6's sixteen weapons. Three of their traits need the system. The rules are read in a new file, `combat/weapon-chapter6-traits.mjs`.

**Backswing** (the Nunchaku): "Your multiple attack penalty is only considered after a successful attack (one that inflicts damage)."
- **On a miss, or a hit that inflicts no damage,** the attack is taken back off the count, and a short card says so.
- **Read as "inflicts damage"**: the damage the target actually took from the hit, after DR and resistance. That includes its runes' and riders' own damage: a flaming blade whose fire lands when DR stops the steel did inflict damage.
- **Never taken back when the Strike added nothing to the count:**
  - a reaction;
  - a Strike off your turn;
  - a Strike whose action keeps the count itself.
- **Nor when there is no target to judge by.**
- **Nor for a blow held to land later** (Black Lotus), since its damage is still to come.
- **Actions that keep the count themselves:**
  - **Double Slice** counts as two attacks. With a Backswing weapon, a swing that inflicted no damage is not counted.
  - **A compound action that counts its Strikes afterwards** (Double Strike) leaves out a Backswing Strike that inflicted no damage.
  - **A feat that prices the whole action** (counts as two; two Strikes then one or two) costs its count when one of its Strikes inflicted damage, and nothing when none did. This follows how the system already reads those feats: the cost is the action's, owed once the action happened.

**Brace** (the Nodachi): "If you use a Ready action to attack a mounted target with this weapon, your attack gains a +2-circumstance bonus and inflicts an additional die of base damage on a successful hit."
- **A Strike made through Ready now says so** (`readied`), from the Ready action through to the Strike.
- **Brace applies** when that Strike is made with a Brace weapon against a target that is mounted.
- **What it adds:** the +2 circumstance bonus on the attack, and one more base damage die on a hit.

**Twin** (the Tonfa and the Butterfly Sword): "If both weapons successfully hit and inflict damage whilst using the Double Slice action, their base damage increases by 1."
- **Each swing has dealt its damage by the time the pair is known,** so the increase is dealt after the pair: 1 per weapon, of the type that swing dealt.
- **DR is not met again,** because the swing's own damage already met it. Resistance and immunity still are.
- **One packet per damage type,** so two blades of one type are one blow of 2.
- **Nothing to a creature the pair has already dropped.** The +1 belongs to each swing's own blow. A separate packet after the blow that dropped it would count as another blow and worsen Dying.
- **It needs two weapons,** both Twin, both hitting and inflicting damage. A double weapon's two ends are one weapon.
- **The Double Slice card** names each Twin increase.
- **What the swing dealt:** a Strike now reports the damage its hit dealt the target (`damageTaken`) and its type. Double Slice reads these for Twin and Backswing.

## Found in review, before the sweep

An independent review of the new code found four things, all fixed before the sweep:
- **Twin could worsen Dying.** Its two extra packets landed on a creature the pair had just dropped, and each counted as a blow. Fixed as above.
- **Backswing read only the weapon's own damage.** A rune's damage that got through counted for nothing. It now counts everything the hit dealt the target.
- **Backswing was skipped by the feats and compound actions that keep the count themselves.** Covered as above.
- **The new penalty label changed Sweeping Strike's and Torrent of Strikes' rows** to "set by this Strike". They read "attack N" again.

One finding is left to Graham: Twin accepts any two Twin weapons (a Tonfa with a Butterfly Sword), where "These weapons are used as a pair" may mean a matched pair.

## Checks

- **New harness pair `verify/mutate-it-fixes-3668-1`:** 26 checks and 36 mutations, all caught. Covered:
  - the declaration, and that the Use button skips both the gate and the spend for it;
  - that only a module can declare it;
  - the penalty label;
  - the three traits' rules, driven;
  - their wiring in the Strike, Ready, Double Slice, the action feats and compound actions;
  - the four review fixes;
  - that no core weapon carries any of them.
- **Re-anchored; nothing they test changed:**
  - `verify-block2-core` A6 (a wider window to the one-attack defences, past the new lines);
  - `verify/mutate-chapter6-gear-171-180` D8e (Brace's die joins the damage override);
  - `verify-focus-default` F5 (a wider window to the spent-use gate);
  - `verify-map-combat-only` (Double Slice now advances the count by what it counted).
- **The uncalled-export ratchet:** backlog unchanged at 513.
- **Full sweep (`node tools/verify.mjs` on the staged release): 630 of 631 passed.**
  - **The one failure was a clash, not the code.** `mutate-bleed-relief` found its verify failing before any mutation, because I was running Inner Tempest's harnesses against the same staged copy at that moment, and both opened the spells pack at once.
  - **Re-run alone on the stage:** `verify-bleed-relief` 45 checks green, and `mutate-bleed-relief` caught all 14 mutations.
