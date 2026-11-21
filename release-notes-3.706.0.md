# TRG Prime 3.706.0: Graham's answers to the player-perspective live test

21 November 2026. Follows 3.705.2 (not yet installed), which it includes. Branch `fix/live-test-rulings`, from `fix/live-test-3705-2` at `23d1ed2`.

The player-perspective live test of 3.705.1 raised five questions. Graham answered on 21 November 2026:

1. The Whip and an adjacent Trip: **"Free hand"**.
2. Should Combat Grapple apply Grabbed: **"Yes"**.
3. Should a Strike feat stop costing AP when its Strike is refused: **"Yes"**.
4. Should Lunge's "1 AP" tooltip change: **"No"**. Unchanged.
5. Lunging Stance's Attacks of Opportunity, and reaction offers the player can read: **"Please automate and players should not be able to read this card"**.

Reproducing answer 2 live as the player found one more defect (C below). It is fixed here too.

## A. The Whip's adjacent Trip is made with a free hand (R-0006)

The Whip "Can't be used against adjacent creatures". A Trip against an adjacent foe while holding it was still made "with Whip", with the Whip's −4 for an exotic weapon.

- **Now:** against an adjacent target, a weapon that can't be used adjacent is passed over. The Trip is the ordinary unarmed one, or is made with another Trip weapon in hand.
- **At reach:** at 10 or 15 ft the Whip is still the Trip's weapon, with its −2.
- **How it's decided:** "adjacent" is 5 ft or less between the tokens, measured when the check is built. With positional automation off, nothing changes.

## B. Combat Grapple applies Grabbed (R-0007)

"If the Strike hits, you may use your free hand to automatically Grab your target. The target remains grabbed until the end of your next turn or until they … Escape". The card said so, but nothing was applied. On a hit, the creature struck is now:

- **Grabbed**, with the clock to the end of the grappler's next turn (in an encounter; out of one, the card says to clear it by hand);
- **recorded as held by the grappler**, as a Grapple Attack records it, so Constrict and the other grabbed-only abilities read it.

The card names the creature. If it can't be Grabbed (immune), the card says so.

## C. A player's conditions on the GM's creature (R-0008; found reproducing B)

**What happened:** a player's successful Grapple Attack on the GM's creature, live in the Test world, laid Grabbed and then failed with "User PC Tester lacks permission to update ActiveEffect …". The outcome card never posted, and nobody was recorded as holding the grab.

**Why:** the status toggle already goes through the GM's client (3.666.1). But the clock ("until the end of your next turn") and any conditionals were then written onto that effect from the player's client, and so was the grabbed-by record. The same was true of a player's Feint or Create a Diversion (flat-footed, and who caused it), and of any action condition with a clock.

**Fix:**

- **Conditions with a clock:** the target's share of an action's conditions, with its clock and conditionals, is laid by the GM's client (`CONDITION_EFFECTS`), by the same function.
- **Who laid them:** the grabbed-by and flat-footed-from records are written by the GM's client from the asker's own creature (`INFLICTED_BY`), and only while the condition stands.
- **Same route:** both Grab strikes (the Grab trait and grab-only attacks) now record the holder this way too.
- **Safeguard:** the GM's client accepts a request only for a creature the asking player owns.

## D. A Strike feat pays when its Strike is made (R-0009)

**What happened:** Vital Strike against a target out of reach spent its 2 AP, and then its Strike was refused ("No Strike was made"). Every Strike feat paid before the attack could be refused for being out of reach or range, unloaded, or with no free hand.

**Fix:** the feats whose action is a Strike (Combat Grapple, Distracting Strike, Double Shot, Quick Draw, Reverse Strike, Swipe, Vital Strike) now pay through the Strike.

- **When it pays:** the feat's AP is spent once, by the first of its Strikes to pass every refusal, at the point where a Strike's own 1 AP is spent.
- **If no Strike is made:** nothing is spent, and the card adds "No AP was spent."
- **Cancelling** a feat's own question (Vital Strike's location, Swipe's or Reverse Strike's targets) now costs nothing either.
- **Lunge** already paid this way.
- **Not changed:** Skirmish, Striding Charge and Void Step aren't a Strike made there and then.

**Quick Draw:** the draw and the Strike are one motion. When the Strike is refused, the weapon goes back where it was (in hand, sheathed or stowed, with its grip). From 3.702.0 to 3.705.2 it stayed drawn, but the AP had been charged; a draw kept for no AP would be a free Interact.

## E. Lunging Stance: Attacks of Opportunity reach as far as a Lunge (R-0010)

The feat: "you have the capability to make an Attack of Opportunity against an opponent positioned beyond your regular reach but still within the range achievable with Lunge … extend the reach of your Strike by 5 feet. Furthermore, any penalties associated with performing standard Lunge strikes are completely negated." This was the one part of R-0001 left to the table.

- **The rule:** in the stance, wielding a melee weapon (its requirement), a creature threatens as far as a Lunge reaches.
- **How far:** 5 ft further, or a held reach weapon's own reach where that is longer, since Lunge adds nothing to a weapon that already has Reach.
- **What it covers:** this decides which moves, manipulate actions and ranged attacks provoke.
- **The Strike:** an Attack of Opportunity is never measured again once offered, and the stance negates the Reach −2 besides, so the Strike has no penalty.
- **What it doesn't change:** a Charge's reach and an ordinary Strike's reach.
- **The stance's card** now says: "Attacks of Opportunity: you threaten 5 ft further (as far as a Lunge reaches) — automatic."

## F. Reaction offers are read only by those who may take them (R-0011)

A whisper's author always reads it. So when a player's move or attack raised an offer for the GM's creatures, the player could read it, though the buttons were hidden. Two offers, Reactive Disarm and Savage Jaw, weren't whispered at all.

**Fix:**

- **Who reads an offer:** every offer is now whispered to the GMs and to the players who own a creature it offers to.
- **Who creates it:** the card is created on this client only when this client is one of those readers. Otherwise the GM's client creates it (`OFFER_CARD`), so the GM is its author.
- **Covered:**
  - Attacks of Opportunity, and "nobody in reach can answer";
  - the reaction feats (Disarm Block, Offensive Parry, Guardian Defence and the rest);
  - a creature's reaction moves;
  - Knife Flurry (the feat is the player's own, so its player still reads it; the button stays the GM's);
  - Swift Pursuit;
  - Reactive Disarm and Savage Jaw (whispered now, to the GM and the defender's own players).
- **The GM's client** keeps only the system's offer flags, and only real users as readers.
- **No GM connected:** nothing is posted, as nobody could take it.

## Harness

- **New:** `verify-live-rulings-3706` (62 checks) and `mutate-live-rulings-3706` (29 mutations).
  - Each item reproduced.
  - `maneuverWeapon` with and without adjacency.
  - `combatGrappleGrab`.
  - The relay's three new requests driven through `performRelay`: the GM's client lays, records and creates; it refuses a creature the asker doesn't own, a record without its condition, and an offer to nobody.
  - `recordInflictedBy` driven.
  - The Strike feats found from the handlers themselves and matched to `paysAtStrike`.
  - The commit's place after every refusal.
  - `lungingStanceThreatExtension` and `opportunityReachOf` driven.
  - `offerRecipients`, `offerCreatedHere` and `relayableOfferCard` driven.
  - Every offer's flag kept.
  - Every offer site posting through `postOfferCard` to its readers.
- **Re-anchored, intent unchanged:**
  - `verify-block4-core` E8 and `verify-ff30-codex` B21 (the Feint's and the Grapple's records);
  - `verify-ff30-block19` S1 and `verify-ff30-block24` S4 (both Grab strikes);
  - `verify-quick-draw-3702` D6 (the weapon goes back);
  - `verify-session-decisions-1015` D5 (the AoO offer's readers);
  - their mutation anchors.
- **Version pins** raised to 3.706.0. The schema and migration gates stay at 3.705.1: no data change, no new pass.

## Testing

- **Core:**
  - Scope: every script reading a changed file or carrying a 3.706.0 pin, plus the whole-tree checks.
  - 246 verify scripts and 206 mutation scripts, plus `verify-checks-read-source`, `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (50 min). **All pass.**
  - Two mutation anchors that the change made stale were re-anchored first:
    - `mutate-fixes-3692-0`: the asker-owns line now appears in three relay cases;
    - `mutate-live-findings-3705-2`: Quick Draw's card.
- **Modules:** the 21 module verify scripts that read a changed core file give the same results as on 3.703.1. Their only failures are the modules' own version pins and a missing local book file, as before.
- **Pack:** unchanged and not rebuilt. Every pack folder was restored from git after the runs.

**Live Foundry: not yet run for 3.706.0** (or for 3.705.2). What to check, as PC Tester with the GM answering:

- **3.705.2's four fixes.**
- **Whip:** a Trip against an adjacent foe while holding the Whip is an unarmed check.
- **Combat Grapple** hit: the foe is Grabbed (with a clock), and grabbed-by is recorded.
- **A player's Grapple Attack** on the GM's creature: Grabbed, the clock, grabbed-by and the outcome card, with no permission error.
- **Vital Strike** at 15 ft: refused, AP unchanged, "No AP was spent". Quick Draw at 15 ft: the weapon goes back.
- **Lunging Stance AoO:** a foe leaving 10 ft is offered the stance-holder's Attack of Opportunity; without the stance, it isn't.
- **Offer cards:** the player's chat log no longer shows the Reaction or Attack of Opportunity offers, nor Reactive Disarm or Savage Jaw; the GM's shows them, and the buttons work.
