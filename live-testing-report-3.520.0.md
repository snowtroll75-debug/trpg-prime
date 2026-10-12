# Live testing — TRG Prime 3.520.0

**7 September 2026.** World "TRG V14", scene "Charnel House", Foundry 14.367,
as *Testing Dude* (GM). Caster: **ZZ Test Caster (Cleric of Dawn)**, **caster
level 12**, PP limit 13 per cast.

---

## The count gate

| # | case | expected | observed |
|---|---|---|---|
| 1 | **Dream Message** unwarped (printed cap 1), 2 chosen | refused | **refused** |
| 2 | same, **+4 PP warp** (cap 10), 2 chosen | casts | **cast landed**, 10 PP |
| 3 | **Visage Of Horror** +2 PP warp (cap 5), 7 chosen | refused | **refused** |
| 4 | same, exactly 5 chosen | casts | **cast landed**, 16 PP |
| 5 | **Command** +8 PP warp (**cap 12 at caster level 12**), 7 chosen | count gate silent | **silent** — cap really is 12 |
| 6 | **Clarity** (prints no targets line), 6 targeted | no cap invented | **none invented** |

The refusal names the arithmetic *and* the remedy:

> *Dream Message targets 1 creature or object; 2 were chosen. Untick 1 of them,
> **or warp the spell to reach more**.*

> *Visage Of Horror targets 5 creatures or objects; 7 were chosen. Untick 2 of
> them, or warp the spell to reach more.*

**Case 5 is the one your ruling decided.** Seven targets against a printed cap
of one, and the count gate stayed silent — the per-level warp had raised it to
twelve off `casterLevelOf`, exactly as the workflow now passes it. What refused
instead was the *range* gate, naming the three that were too far. Two gates,
right order, each doing its own job.

**Case 6 is the one that must never move.** Clarity prints no targets line, so
no cap exists to enforce and none was invented — six targets went through the
count gate untouched.

---

## Two earlier releases confirmed in passing

**3.518.0**: Dream Message's ten-minute cast was refused outright in combat —
*"about 300 AP at 2 seconds an action"* — which is why case 1 had to be run out
of combat. The gate fired before any picker opened.

**3.519.1**: the range refusals read cleanly with the number said once —
*"beyond **Command**'s range of 30 feet"*, *"beyond **Clarity**'s range of
touch (5 ft)"*. No `(max N ft)` anywhere.

---

## One harness defect found — 3.520.1

**The driver could hang on any dialog it did not recognise.** Its fallback was
`buttons[0]`, and a DialogV2 window's first button is its `toggleControls`
icon — no text, no effect. Visage Of Horror costs 16 PP against this caster's
limit of 13, so it opened *Overcasting — Sacrifice* with **Yes/No** buttons;
the driver clicked the header icon instead, the loop spun, the call timed out,
and the cast looked like it had hung the system.

`clearDialogs` had the same blind spot — it looked for the words "cancel" or
"close", so the Yes/No confirm stayed standing across every later call.

Both fixed: the driver now filters to buttons with visible text, recognises
`yes`, records which button it pressed in its trail, and `clearDialogs` answers
No/Cancel/Close or falls back to the window's own close control.

**Third session running that the harness was wrong and the system was not.**
The pattern is consistent enough to be worth stating plainly: when a scripted
cast produces a result that looks like a system defect, the harness is the
first suspect, not the second.

---

## Rig restored

The token the driver created is removed, positions saved before I moved them
are restored, targets cleared, AP and PP back to 3 / 63, no dialogs left open.
The combat had already been ended as part of case 1. Test chat cards left in
place.

**Four tokens from the previous session** — Toben, Lysa, Borin Slatevein and
Keldran — are still where that session left them; I only recorded positions
from this session's moves onward.
