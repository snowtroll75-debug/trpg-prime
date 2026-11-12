# TRG Prime 3.684.6

5 November 2026. Graham's answers of 5 November about Agile Display's Step: two to the 3.684.5 questions, then three more to this build's own questions. Also fixes from two reviews of this build. Built on 3.684.5.

- **Install over 3.684.5.** No migration, and no world data changes.
- **Modules:** nothing new for modules. Eldritch Arts 0.9.1, Eldritch Arts 0.9.0 and Inner Tempest 1.0.4 run on it.

## For every world

- **A reaction keeps Agile Display's Step** (Graham: "A reaction should not affect it").
  - **Before:** a reaction Strike (an attack of opportunity) or a reaction-cost basic action removed the Step.
  - **Now:** nothing made with the reaction removes it. That covers:
    - an attack of opportunity, and a reaction feat's Strike;
    - a readied Strike or readied action (Ready's reaction pays for it);
    - a reaction-cost basic action;
    - a reaction spell or feat.
  - **Example:** a Gymnast uses Agile Display, then an orc moves past and she makes an attack of opportunity. Her reaction is spent, and the Step is still ready to drag.
- **A refused or cancelled action keeps the Step** (Graham, asked "Should an action that is refused or cancelled keep the Step?": "Yes").
  - **Before:** the Step went when you clicked the action, so it went even when the action was then refused or cancelled.
  - **Now:** the Step goes only when the action is actually taken: when its cost is spent and kept, or, for a Strike, once its attack is rolled.
    - **A refused basic action keeps it.** This covers refusals for a condition (Flat-Footed against a reaction, for example), a trait, Full Defence, Rage, and skill training or rank.
    - **A cancelled Strike keeps it.** That's a Strike cancelled at its target dialog, or at a prompt after its AP (see the next item).
    - **A cancelled spell keeps it.** When the spell's targeting is cancelled and its AP refunded, the Step comes back, and a notice says "Agile Display: the free Step is back — the action was cancelled and its AP returned."
  - **Example:** a Flat-Footed Gymnast clicks Arrest a Fall after Agile Display. It's refused, and the Step is still ready.
- **A Strike cancelled after its AP gets the AP back** (Graham, asked "Should that AP also come back?": "Yes").
  - **Before:** cancelling at the Versatile, Unsteady or Blunt Arrows prompt, which come after the Strike's 1 AP, lost that AP.
  - **Now:** the AP is refunded, and the Step is kept. A Strike paid for by Fight Defensively gets its Strike back the same way.
- **A Strike wasted by Sanctuary keeps the Step** (Graham, asked "should a Sanctuary-wasted Strike keep the Step?": "Yes"). Its AP is still spent, as the book says.
- **A feat or spell that costs no AP and isn't a reaction leaves the Step ready** (Graham, asked "Should it remove it?": "No"). This is now his ruling, not an open question.

## Fixed (found in review of this build)

- **A cancelled spell could bring back a Step another action had removed.**
  - **Before:** use Agile Display at 2 AP, then take a Free basic action (the Step is removed), then cast a 1-AP spell and cancel its targeting. "The free Step is back." A free Strike did the same.
  - **Why:** the refund compared AP with the AP at Agile Display, not with the AP before the cancelled spell.
  - **Now:** only an AP spend keeps the Step it removes for a refund, along with the AP just before that spend. A refund brings it back only when AP is back to that figure. Once any other action is taken, that spend stands and the kept Step is dropped. A cast's extra AP for an option (Runic Stabiliser) counts as part of the same spend.
- **Two cancelled actions in a row** now keep the Step both times, for example a Strike cancelled at Versatile and then a spell cancelled at its targeting.
- **A Strike stopped by the target's miss-chance flat check** (hidden, concealed, invisible) now removes the Step, unless it was a reaction. The Strike was made. Before, its AP was spent and the Step stayed.
- **Ending Take Cover** ("a free action") now removes the Step, as any other free action does. Before, it kept it, because the Step no longer goes at the click.
- **A refund is never read as an action** (found in re-review).
  - **Before:** use Agile Display at 2 AP. A Strike wasted by Sanctuary leaves 1 AP, and the Step is kept. The next Strike, cancelled at Versatile, had its AP refunded, but the refund was taken as an action below the Step's figure, so the Step was removed.
  - **Now:** a refund's AP write is marked like the Strike's own spend, so it never removes the Step. This covers every refund: cancelled Strikes, cancelled spells, and cancelled drinks.
- **A cancelled Strike gets back a Strike-only point** (found in re-review).
  - **Before:** a hasted character with 4 AP, one of them Haste's Strike-only point, who cancelled a Strike at Versatile got the point back as a general one, so it could pay for a spell.
  - **Now:** the Strike's refund puts back the turn's restricted points as they were before it. The character has 4 AP again, and one is still only for a Strike.
  - **Casts unchanged:** a cancelled spell's refund still returns general AP. A spell never spends a restricted point unless it is cast with "Proceed anyway" beyond the general points. That case keeps its old behaviour.
  - **Two Strikes open at once** (found in the final review, left as built): the Strike saves the restricted points before it spends and puts that list back when it is cancelled. Say Strike A's Versatile prompt is still open, Strike B is made, and A is then cancelled. B's point comes back as Strike-only too, so the character has lost a point's flexibility, not gained one. It would only grant something if Haste were cast while a Strike's prompt was open.

## Harnesses

- **`verify-agile-display`:** N11–N27 are new (54 checks in all). The harness actor now applies flag writes and can call the AP-write hook as Foundry does. They call the real `resolveAction`, `rollWeaponAttack`, `spendActionCost`, `refundActionCost` and the AP-write hook on a Gymnast with the Step armed. They check:
  - reactions, refusals and readied actions keep the Step;
  - basic actions and Strikes that are taken still remove it;
  - Strikes cancelled at the target dialog, Versatile or Unsteady keep it and get their AP back;
  - a Fight Defensively Strike cancelled gets its counted Strike back;
  - cancelled casts give it back, including twice in a row and with option AP;
  - none of these bring it back: a part refund, a Step armed in between, a Free action's or free Strike's removal, a feat's own AP write, a cast that stood, a Strike's own spend after a cast that stood;
  - the AP is compared with the AP before the spend, not the AP at Agile Display;
  - Sanctuary keeps it, with its AP spent;
  - the miss-chance flat check removes it, but not for an attack of opportunity;
  - ending Take Cover removes it;
  - a refund isn't read as an action, even after a Strike Sanctuary wasted;
  - a hasted Strike cancelled at Versatile gets Haste's Strike-only point back;
  - Natural Leaper's actionless jump keeps it;
  - the turn reset drops the kept Step;
  - the wiring.
- **N6–N8 re-pointed.**
- **Pins re-pointed:**
  - `verify-restricted-ap` S2 and S5;
  - `verify-block5-core` E5;
  - `verify-session-fixes-1022` D10;
  - `verify-session-decisions-1015` D6;
  - `verify-live-fixes-3-627-1` L2;
  - `verify-riding-reflexes-batch` D10, which now also checks that its anchor is found.

  `verify-sanctuary` G2c is back to its 3.684.5 form.
- **Mutations:** 50 new in `mutate-agile-display` (90 in all), and two old ones removed. Anchors re-pointed in `mutate-restricted-ap`, `mutate-session-decisions-1015`, `mutate-chapter7-combat-191-200` and `mutate-area-region-life` (W6).
- **`uncalled-exports.json`:** `prepare.mjs#isReactionCost` comes off the backlog. `resolveAction` now calls it.

## For Graham

- **Natural Leaper's automatic jump.** When the jump needs no action at all, as built it keeps the Step, since no action was taken. When it costs an action, it removes the Step. Is that right?
- **What a cancelled Strike still leaves behind.** A Strike cancelled after its AP (Versatile, Unsteady, Blunt Arrows) now gets the AP back, but these still stand:
  - its traits' per-turn counts (Flourish, Open, Press and the like);
  - the attacker's own Sanctuary has ended;
  - the target's Fixation has ended;
  - a queued Power Attack is used up;
  - the Crimson Covenant state has moved on;
  - Opportunist is marked used.

  Should a cancelled Strike undo these too?
