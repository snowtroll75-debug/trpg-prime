# TRG Prime 3.706.1: what the 3.706.0 live test found

21 November 2026. Follows 3.706.0. Branch `fix/live-test-3706-1`, from `fix/live-test-rulings` at `24dcce5`.

The live test of 3.706.0 (`live-testing-report-3.706.0.md`) passed everything it set out to check, and found two defects. No data changes and no migration.

## A. Combat Grapple's Grabbed ended a round early (R-0012)

**What happened:** a Combat Grapple hit in round 1 stamped Grabbed to expire at round 2. A Grapple Attack laid in the same round expires at round 3.

**Why:** 3.706.0 set the clock one round on. "Until the end of your next turn" is two rounds on the clock (`extractDurationRounds`, which a Grapple Attack's card goes through). The expiry sweep runs at the start of the grabbed creature's turn, so one round ended the grab before the grappler's next turn whenever the grabbed creature acted first.

**Fix:** two rounds, the same as a Grapple Attack.

## B. An Attack of Opportunity with a Thrown weapon was made as a throw (R-0013)

**What happened:** the player moved from adjacent to 15 ft, provoking the foe. The GM's Attack of Opportunity button then made "Club — Attack (thrown) … thrown 15 ft … Threw Club — that was the last one", with the range penalty.

**Why:** an Attack of Opportunity doesn't measure reach again ("the provoker WAS in reach when it triggered"), but the decision to throw a melee weapon with the Thrown trait at a distant target still read the distance. This predates 3.706.0.

**Fix:** an Attack of Opportunity is never thrown by distance. It is the melee Strike the rule makes it.

## Harness

- **New:** `verify-live-fixes-3706-1` (11 checks) and `mutate-live-fixes-3706-1` (4 mutations).
  - The clock checked against `extractDurationRounds` and the Grapple Attack's own reading.
  - The throw decision's new condition.
- **Changed:** `verify-live-rulings-3706` B1's expectation, and its mutation anchor, for the new clock.
- **Version pins** raised to 3.706.1.

## Testing

- **Core:** 189 verify and 141 mutation scripts, plus `verify-checks-read-source`, `mutate-fixes-3685-3b` (56 min) and `mutate-checks-read-source` (52 min). **All pass.**
- **Modules:** the six module verify scripts that read a changed core file give the same results as on 3.703.1.
- **Pack:** unchanged and not rebuilt. Restored from git after the runs.
- **Live Foundry:** 3.706.0 was live-tested (see the report). For 3.706.1, check:
  - a Combat Grapple hit's Grabbed reads the same round as a Grapple Attack's;
  - the foe's Attack of Opportunity on a player who has moved away is a melee Strike, and keeps the Club.
