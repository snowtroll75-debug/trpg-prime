/**
 * The rows tools/declare-ea-block8a-core.mjs declares and applies (TRG Prime
 * 3.686.0; H17's Remove Curse half and H18). Data only, so a harness may read
 * them without running the declaration.
 */
import { INSANITY_TURN_TABLE } from "../module/magic/turn-table.mjs";

export const INSANITY_NOTE = [{
  kind: "note",
  text: "On a failed Will save the target is insane for 1 round per 2 over the DC — roll d10 each turn: 2-4 stunned 1d3, 5-7 slowed 1d3, 8-10 confused."
}];

/** The three rows (H17's Remove Curse; H18's Insanity and its warp). */
export const BLOCK8A_CORE_FIXES = Object.freeze([
  {
    id: "ea8a-remove-curse-counteract", pack: "spells", name: "Remove Curse", path: "system.effects",
    from: [],
    to: [{ kind: "counteract", target: "targets", traits: ["curse"], limit: 1, label: "Remove Curse" }],
    declaredAt: "2026-11-08", systemVersion: "3.686.0",
    reason: "H17 (Eldritch Arts Block 8 audit; Graham, 8 November 2026, 17:22: \"As recommended\", H17's Remove Curse half approved knowing it changes a core spell in every world). The page: \"You touch the target and attempt to counteract one curse afflicting them.\" The spell had no effect rows, so it ended nothing and \"can only be removed with a Remove Curse spell\" (Symbols of Pain and Weakness, Q183) had nothing to gate on. The core's `counteract` row with `traits: [\"curse\"]` finds any effect whose source carried the Curse trait (a condition a spell laid carries its traits since 3.613.0), `limit: 1` is the page's \"one curse\" (the caster picks when there are several), and the counteract check is the core's own (asked for the DC; prefilled when the effect carries `counteractAs`). The item clause (\"allows the target to discard the item but does not remove the curse from it\") stays on the card."
  },
  {
    id: "ea8a-insanity-turn-table", pack: "spells", name: "Insanity", path: "system.effects",
    from: INSANITY_NOTE,
    to: [JSON.parse(JSON.stringify(INSANITY_TURN_TABLE))],
    declaredAt: "2026-11-08", systemVersion: "3.686.0",
    reason: "H18 (Eldritch Arts Block 8 audit; Graham, 8 November 2026, 17:22: \"As recommended\", H18 approved knowing it automates the core spell in every world). The page: \"The target is insane for 1 round per 2 failure and must roll on the following table at the beginning of each of their turns to determine their behaviour. D10: 1 Target is unaffected this round. 2-4 Target is stunned 1d3. 5-7 Target is slowed 1d3. 8-10 Target is confused.\" The note row left the d10 to the table every turn. The `turnTable` row (magic/turn-table.mjs) marks each creature that failed for 1 round per 2 points of failure (at least one, rounded down, as Holy Shout's) and rolls the d10 at the start of each of its turns, before AP are regained; each roll's condition is that turn's, removed at the next roll and when the insanity ends. Eldritch Arts' Symbol of Insanity reaches the same row."
  },
  {
    id: "ea8a-insanity-warp-per", pack: "spells", name: "Insanity", path: "system.warps.1.mods",
    from: {},
    to: { turnTablePer: 1 },
    declaredAt: "2026-11-08", systemVersion: "3.686.0",
    reason: "H18. \"+4 PP: the target is insane for 1 round per 1 failure.\" The warp carried `mods: {}` and bought nothing. `turnTablePer` is the turn table's rate, read by the `turnTable` row (a set: the smaller rate wins)."
  }
]);
