# TRG Prime 3.629.0 — haunts: perils extended

8 October 2026. This release adds what Pillars of Faith's Chapter 8 (Spirits & Haunts) needs. It follows Graham's design of the same day (`claude/pillars-of-faith-chapter8-design.md`), with all four questions answered as recommended:

- the core extends perils;
- Trigger and Routine roll the saves and apply the results;
- suppression spans re-arm on world time, and named times wait for the GM;
- the Spirit Presence is an NPC template.

The book calls haunts "Echo Perils", so this is Chapter 12's peril, extended. **Every addition is opt-in.** A peril built at 3.620.0 behaves exactly as it did.

## The Peril section, new fields (GM tab of an NPC)

| Field | What it does |
|---|---|
| **Detection line** | The stat block's own line, as printed, e.g. "Perception DC 17; Occultism or Religion DC 17, Rank 1". Each skill gets its own DC, and a ", Rank n" applies to the group just before it. A line here replaces the single skill and DC above it. |
| **Disable line** | Any skill with its DC, e.g. "Religion DC 18 … or Occultism DC 20". A specialist Lore is matched by name ("Spirit Lore"). A pasted "Three successes are required" sets the successes. |
| **A finished Disable** | *Disables it*, as before, or *Suppresses it* (a haunt). |
| **Suppressed for** | "24 hours", "1 hour", "10 minutes". Blank means until its next Reset. |
| **Counteract level / DC** | 0 means its level and its Level DC (level + 14), the book's default. |
| **Spiritual presence** | Spirit Sense reveals it at detection without a roll. |
| **No physical body** | Strikes are refused and damage passes through. An NPC's HP maximum is derived (a Medium one has 30), so a haunt has to say so. |
| **Disable bonuses** | "+2 circumstance: speaking a remembered name"; separate several with ";". |
| **Effect** | What Trigger rolls and applies (see below). |
| **Anchor, Resolution** | Text. |
| **Automation** | A module's registered automation, for an Effect that is more than a save. |

- **New buttons:** **Trigger** and **Resolve**.
- **New states:** **Suppressed** and **Resolved**.
- Under the lines, the sheet shows **how it read them** — each skill and DC, the successes, the Counteract level and DC — plus what Trigger will apply and how long a suppression has left. The GM sees the reading before the table does.

## Detecting

*Roll Detection* now gives each PC a secret check with **the best of the listed skills they may use**: the highest total against that skill's DC. A minimum rank still needs the PC to be Searching.

For a peril marked as a spiritual presence, a PC whose spiritual sense reaches it is told **"reveals a spiritual presence and its general direction"** without a roll. Pillars of Faith's Spirit Sense, Veil Sight and similar count.

## Disabling, suppressing, counteracting

- **Disable a Peril** is now also offered under **Diplomacy, Linguistics and Perform, and any specialist skill** (`specialistSkills: true`). A peril's line still refuses any skill it doesn't name, and the refusal names the ones it does.
- **The DC is the line's DC for the skill used.** The peril's situational bonuses are offered unticked in the check dialog; `promptCheckConfiguration` accepts `extraConditionals`.
- **A suppressing peril** is suppressed when its last success lands, for its span or until its Reset.
  - "A suppressed haunt … cannot trigger, use reactions, perform its Routine, make attacks, or produce its supernatural effects."
  - Trigger and its routine actions are refused while it's suppressed.
- **Dispel** against a suppressing peril opens its dialog on the peril's Counteract level and DC, and suppresses on a success. It is one check, not banked successes.
- **New spell effect kind `counteractPeril {suppress: {critical, success, failure…}}`.** It rolls the Counteract check (now pre-filled with level and DC: `rollCounteractCheck(actor, {targetLevel, dc})`) and suppresses for the rung's span.
  - New warp mod **`perilSuppress`** replaces rungs ("doubled on a Critical or Success").
  - A rung that suppresses on a Failure ("until the beginning of your next turn") forces it.
- **A Fumble or Blunder on any attempt triggers it**, including a counteract (Chapter 12).
- **Re-arming:**
  - A suppression with a clock re-arms itself when game time passes it (an `updateWorldTime` hook on the GM's client, which also covers unlinked tokens).
  - "Until sunrise", "midnight" and "until its next Reset" wait for the GM's **Reset**.
  - A **resolved** peril never resets.
- **The relay** carries the mode, the span and the force. The GM's client still reads everything else from the peril's own section.

## What a peril does: Trigger, and its Routine (new peril-effect.mjs)

The **Effect** field takes the stat block's text, with its ladder one degree per line, e.g. "Partial Frightened 2." It is read as follows:

| What the text says | How it is read |
|---|---|
| "Will save against DC 18" | The save. With no DC printed, the peril's Level DC is used. |
| "Basic …" | A basic save: half damage on a Success, extra base dice by the margin of a failure. |
| "3d6 cold damage" | Rolled once, then applied per creature through the full damage pipeline. |
| "Every creature within 30 feet" | An area round the peril's token. Anything else uses **the GM's targets**: the triggering creature, those in the room, the line. |
| "living creatures" | Only living creatures are affected. |
| "A deaf creature is immune" | A Deafened creature is skipped. |
| Each rung's conditions | Applied with their own clocks. |
| "increase Frightened by 1" | Added to what the creature already has. |
| "would exceed 4 instead becomes Dazed 1 … for each additional point" | The excess spills into the named condition. |
| "On a Failure or worse, …" | Applied to every rung from Failure down. |
| "As Fumble" | Inherits the Fumble rung's conditions. |
| "Critical/Success" | Both rungs. |
| "Roll Initiative" | The peril joins the combat. |

**Which conditions a clock belongs to:**
- A clock binds to the run of conditions just before it. "Weakened 2 and Slowed 1 for 1 minute" times both.
- Prose in between takes the clock for itself. In "Frightened 2 and unable to move through the gate until the end of its next turn", the clock belongs to the gate.
- In a run of several, Frightened keeps its own way out, the recovery save. In "Frightened 3 and Dazed 1 until the end of its next turn", only the Dazed is timed.

**Trigger** (GM):
- It refuses a peril that is suppressed, disabled, resolved, broken or destroyed. A suppression whose clock has run out is armed first.
- It rolls each creature's save (with the sheet's modifiers), applies the result, and posts one card.
- A complex peril (or an Effect saying "Roll Initiative") **joins the combat and rolls its Initiative**. If there is no combat on its scene, one is created.
- A simple peril stays Triggered until Reset, unless its Reset is "Immediately".

**A routine action**: an ability on the peril with an Action line and `flags.trg-prime.perilEffect` (the action's text). **Use** rolls and applies it against the GM's targets or its radius, after the same suppression check. `flags.trg-prime.perilAutomation` names a registered automation instead.

**Module API:**
- `registerPerilAutomation(name, {trigger(peril, ctx), use(peril, item, ctx)})`. The automation runs in place of the generic save-and-apply and gets helpers (`runPerilEffect` and others).
- `helpers.applyTypedDamage` and `helpers.describeDamage` are new.
- The new hook **`trgPrimeActionResolved`** `{actor, action, degree, targetActor, invokedSkillKey}` fires after every skill action's outcome card. Pillars of Faith answers Interpret Haunt from it.

## Harness

- **New pair:** verify/mutate-haunt-perils (55 checks, 43 mutations).
- **Re-anchored:**
  - block38-environment F12, F13, F14, F16 and two mutations (the bank passes the mode; Disable a Peril's wider skills; detection by entry; the relay's mode; the inactive-state list);
  - chapter4 I1 and its mutation (Disable a Peril now declares `specialistSkills` too);
  - damage-riders C7 (the check dialog's list gained `extraConditionals`);
  - chapter10-311-320b C6b and its vocabulary mutation (`counteractPeril` has its own no-DC line).
- **A false positive avoided.** peril-effect's ladder array is named `LADDER`, so chapter5-archetype D27's DEGREES-by-key scan does not flag it.
- **First sweep: 506 of 517.** After the fixes above, every failed pair was rerun green.
  - The other three failures were mutate-chapter10-331-340 failing to open the spells pack, because a module suite was reading the core packs at the same time.
  - One of its pack mutations (Vampiric Touch's Basic save) was left in place by that collision. It was restored from 3.628.2's pack, and every core pack was compared to 3.628.2: identical.
  - The lesson is recorded: never run the module suites during a sweep.
- **Confirming sweep: 517 of 517 green.**

## Readings taken (for Graham)

- **A counteract Fumble triggers the haunt.** Chapter 12 says this "including when attempting to counteract", even where Still the Haunt's own Fumble reads "unaffected".
- **Spirit Sense and haunts.** "Spirit Sense can reveal that a haunt is present" is read as automatic for any haunt in range, whether or not the PC is Searching.
- **"Until the end of its next turn"** is 2 rounds, the core's convention.
- **A basic save's failure margin** adds base dice and says the severity on the card. No critical injury is applied, as for spells.
- **A simple haunt** stays Triggered until its Reset, unless the Reset is "Immediately".
- **No combat?** Trigger creates one on the haunt's scene.
- **Detecting first is not enforced.** "The character must first detect the haunt or have it pointed out" stays with the table.
