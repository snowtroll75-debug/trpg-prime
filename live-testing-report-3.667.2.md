# Live testing report: TRG Prime 3.667.2

23 October 2026. Tested in Graham's world "TRG V14" (Foundry 14.367), at 127.0.0.1:30000, in the built-in browser as Testing Dude (GM). A second tab at [::1]:30000 was logged in as PC Tester, who has no password, to press from a player's screen. Chrome was not reachable this session.

**Installed:** TRG Prime 3.667.2 and Inner Tempest 0.4.0. Inner Tempest 0.4.1 is not installed yet, so its fixes were not tested live. These are the free Inner Strike type buttons, Burst Step's Speed text, and Shadowy Stance's 1-minute line.

**Result:** everything tested passed. No defects were found, and no errors came from either release.

## The conviction card (3.667.2)

**On an attack** (ZZ Disciple's Unarmed Strike against ZZ Target, DB 10)
- **No dialog.** The card posted at once: "Rolled 10 on the dice: total 11", with **Spend Conviction (+1d6) — 2 left** and **No**. It showed no DB, no hit or miss, and no degree. The roll waited on the card.
- **Spend** (a real mouse click):
  - The die rolled 5. The card now reads "Conviction spent: +1d6 rolled 5 — total 11 → 16", with no buttons left.
  - The attack card reads 16 against DC 10, with the line "Conviction (+1d6) +5". It was a **minor critical**, not the plain hit that 11 would have been, and the critical injury and the extra damage die followed.
  - Conviction went 2 → 1.
- **No:** "No conviction spent: the total 11 stands". The attack read 11, a hit, and conviction stayed at 1.

**Against a Mystic: the order you confirmed**
- **Before the roll:** the Mystic's reaction offer (Evade, Guarded Centre) came first, as before. It was declined.
- **The conviction card:** "total 20". Alter the Thread was not offered yet.
- **The spend:** +3, 20 → 23.
- **Then Alter the Thread:** offered on the final roll, "rolled 23 against ZZ Mystic's DB 10, which hits". Taken: "23 → 7. The new roll stands", a miss.
- **Conviction:** the Mystic's went 2 → 1. The attacker's spent point stayed spent, as you accepted.

**On a save (Fortitude, DC 14)**
- **The card:** "Rolled 7 on the dice: total 10". The DC was not shown.
- **Spend:** +3, 10 → 13. The save card read 13 against DC 14, **Partial, fails by 1**, with the conviction line.

**The "could +6 change the degree" filter** (Will, DC 45)
- **A total of 19 (Blunder):** +6 gives 25, which still fails by 20, so it stays a Blunder. **No card**, and the save resolved at once.
- **A total of 20 (Blunder):** +6 gives 26, which fails by 19, a Fumble. **The card asked.** No was pressed: "the total 20 stands".

**From another screen**
- **A player who owns the character:** PC Tester was given ownership of ZZ Disciple. The GM rolled the attack. PC Tester's chat showed both buttons. PC Tester pressed Spend, and the GM's waiting roll took it over the socket: 4 → 7, conviction 2 → 1, and the card was settled on both screens.
- **A player who doesn't:** the GM rolled ZZ Mystic's Reflex save. On PC Tester's screen the card showed "Rolled −14 on the dice: total −11", with both buttons hidden. The GM pressed No.
  - The −14 is the system's open-ended low roll (a natural 1, then −15), not a defect.
  - +6 would lift the Blunder to a Fumble, so asking was correct.

## The 3.667.1 fixes

- **A new Disciple:** Burst Step, Guarded Centre and Disciplined Flurry arrived **2 of 2**. Conviction was **2 of 2** from Disciple's Resolve.
- **A new Mystic:** conviction was **2 of 2** from Mystical Resolve. Its techniques were 1 of 1, correctly, since a Mystic has no Deep Focus.
- **Deep Focus arriving after a technique:** Burst Step went 1 of 1 → **2 of 2** as Deep Focus arrived.
- **A technique arriving after Deep Focus:** Guarded Centre came in at **2 of 2**.
- **A spent use stays spent:** Disciplined Flurry was at 0 of 1, then Deep Focus arrived. It read **1 of 2**.

## Not tested live

- **Inner Tempest 0.4.1's fixes:** they need 0.4.1 installed.
- **A Spellcraft check and a skill check:** these go through the same `offerConvictionBonusNow` path as the attack and the save above. They are covered by the harnesses.
- **A blind or private roll asking privately:** covered by the harness only.

## Cleanup

- **Removed:**
  - the ZZ folder and its five actors (ZZ Disciple, ZZ Mystic, ZZ Target, and the two Focus probes);
  - the ZZ scene;
  - the 23 chat messages the test posted.
- **Chat:** back to its 229 messages, ending at the same message as before.
- **Left alone:** no Gamemaster messages were touched.
- **PC Tester:** their tab is closed. Their ownership went with the deleted actor.
- **The GM view** is back on Oldwatch Main.
