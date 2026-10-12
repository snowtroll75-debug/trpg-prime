# TRG Prime 3.625.1 — what the 0.7.0 live test found

7 October 2026. Five fixes and one small opening, every one found by casting the Pillars of Faith 0.7.0 content in Graham's world on 3.625.0. Nothing here changes a core spell's behaviour.

## A once-per-creature marker that was never found (magic/caster-damage-riders)

Consecrated Flame's marker is keyed by rider and target — and a token actor's uuid is `Scene.X.Token.Y.Actor.Z`. `setFlag` expands a dotted key into nested objects, so the marker was written as a tree and read back as a flat key, never matched, and the rider fired on every fire spell in the round. The dots are swapped for `|` in the key; the key is only ever compared with itself. Pair verify/mutate-caster-damage-riders (13/6).

## A spend-on-hit rider spent on a miss (magic/strike-riders)

`normaliseStrikeRider` reads `raw.spendOn === "hit"` and returns `spendOnHit: true`; the effect stores what it returns, and the Strike normalises the stored spec AGAIN — by then the key is `spendOnHit`, not `spendOn`, so Dragon's Breath Reed went back to being spent by a miss. The round trip now keeps it. Pair verify/mutate-gated-riders (21/8).

## "Once per round" has no round outside combat (magic/spell-effects)

The healing riders' marker resets with the combat round; between fights — where most healing is cast — nothing reset it, and Vital Surge fired once a day. Outside a started combat the marker is neither read nor written: every cast is its own round. Pair verify/mutate-healing-riders (20/7).

## A relief prompt that asks only what the creature holds (magic/spell-effects)

Bloom of Renewal asked "Fatigued or Sickened?" four times for an emanation of four allies, three of whom had neither. The prompt now offers only the conditions this creature holds: one held is taken without asking; none held says "nothing to reduce" without asking; the prompt opens only when the choice is real, and is titled with the creature's name.

## The caster takes the condition on (magic/condition-relief)

A `conditionRelief` row may declare `casterGains: true` — Share Burden's "You then gain or increase the same condition by 1 yourself. If you are immune to the condition the spell fails." The relieved condition, whichever the prompt chose, is applied to the caster one step above what they hold, through the ordinary condition application, so an immunity refuses it out loud. Never on a self-cast. Mutations in mutate-condition-relief (27).

## The save-reroll line says its figure (magic/save-reroll)

"Immune to Saintly Intercession for a while" now reads "for 10 minutes" — the row's own `immunity`. Pair verify/mutate-save-reroll (19/8).

## Seen and left alone — for Graham

- A rune's or a strike rider's secondary packet is resolved without the `magical` fact the main blow carries, so a creature "immune to non-magical" damage shrugs off a Flaming rune's fire and Consecrated Armament's essence while the sword itself gets through. Core behaviour since the rune packets; your ruling of 10 September ("a weapon carrying a Potency rune is magical") suggests a rune's own damage is magical too. Not changed here.
- The Aid card's "Bonus Check grants a +3" line reads the table; Practical Counsel's +1 lands on the waiting modifier ("+4 circumstance waiting for …"), which is the one that applies. Cosmetic.

Sweep green.
