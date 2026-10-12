/**
 * The "increase the difficulty for a benefit" prompt — the Foundry side
 * of difficulty-tradeoffs.mjs.
 *
 * A COUNT, NOT A TICK, for the repeatable options. Four of the chapter's
 * trade-offs say "each time you increase the difficulty in this way…",
 * and a checkbox can say whether a player bought extra targets but not
 * how many. Graham's ruling, 19 August 2026.
 *
 * Asked AFTER the situational dialog, like First Aid's, so the increase
 * lands on whatever DC the player actually settled on there rather than
 * on the one the action started with.
 *
 * EVERYTHING DEFAULTS TO ZERO. None of these is a consequence of a
 * situation the system can see — how many people you are shouting at,
 * whether your other hand is full — so a pre-filled field would be the
 * system asserting a thing only the player knows.
 */
import { optionMax, resolveTradeoffs, tradeoffOptions } from "./difficulty-tradeoffs.mjs";

/**
 * Ask which trade-offs the player is buying.
 *
 * @param {string} actionKey
 * @param {string} actionName
 * @returns {Promise<{dcIncrease:number, chosen:Array}|null>} null if cancelled.
 */
export async function promptDifficultyTradeoffs(actionKey, actionName = "This action", { waivers = {} } = {}) {
  const options = tradeoffOptions(actionKey);
  if (!options.length) return { dcIncrease: 0, chosen: [] };

  const { DialogV2 } = foundry.applications.api;

  const rows = options
    .map((option) => {
      const max = optionMax(option);
      // A WAIVED OPTION SAYS SO ON ITS OWN ROW. Group Coercion and
      // Experienced Tracker both buy one of these outright, and a player
      // whose feat has made something free should see that where the price
      // is printed rather than have to infer it from a smaller total.
      const waiver = waivers?.[option.key] ?? {};
      const freeUnits = Math.max(0, Math.floor(Number(waiver.freeCount) || 0));
      const perDC = waiver.dc === undefined ? option.dc : Math.max(0, Number(waiver.dc) || 0);
      const per = perDC === 0
        ? "free"
        : freeUnits
          ? `first ${freeUnits} free, then +${perDC} DC`
          : `+${perDC} DC`;
      if (!option.repeatable) {
        return (
          `<label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer">` +
          `<input type="checkbox" name="${option.key}" style="margin:0">` +
          `<span>${option.label} <span style="opacity:.7">(${per})</span></span>` +
          `</label>`
        );
      }
      return (
        `<label style="display:flex;align-items:center;gap:8px;margin:4px 0">` +
        `<input type="number" name="${option.key}" value="0" min="0" max="${max}" step="1" ` +
        `style="width:3.4em;margin:0;text-align:center">` +
        `<span>${option.label} <span style="opacity:.7">(${per === "free" || freeUnits ? per : `${per} each`}, repeatable)</span></span>` +
        `</label>`
      );
    })
    .join("");

  const result = await DialogV2.wait({
    window: { title: `${actionName} — Difficulty Trade-offs`, icon: "fa-solid fa-scale-unbalanced" },
    classes: ["trg-prime"],
    position: { width: 440 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">The chapter lets you buy these by raising the check's difficulty. Leave everything alone to roll as printed.</p>
      ${rows}
      <p class="hint" style="font-size:.82em;margin:8px 0 0">Applies to the DC you just set, not to your roll &mdash; these raise the bar rather than lowering your result.</p>
    </div>`,
    buttons: [
      {
        action: "confirm",
        label: "Continue",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          const counts = {};
          for (const option of options) {
            const field = root?.querySelector?.(`[name="${option.key}"]`);
            if (!field) continue;
            counts[option.key] = field.type === "checkbox"
              ? (field.checked ? 1 : 0)
              : Number(field.value) || 0;
          }
          return counts;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  return resolveTradeoffs(actionKey, result, { waivers });
}

/**
 * The card line summarising what was bought, or "" if nothing was.
 *
 * THE `applied` FLAG IS NOT COSMETIC, and it was found by driving this
 * live rather than by reading it. When the difficulty is left on "Set by
 * the GM (roll total only)" there is no DC yet, so the increase has
 * nowhere to land and the workflow correctly does not apply it — but the
 * first version of this note said "Traded difficulty (+5 DC)" anyway.
 * That reads as "+5 was added", when in truth nothing was added and the
 * GM, who sets the DC after the roll, was never told to add it. The
 * election is still real and still worth printing; what changes is whose
 * job the arithmetic is.
 *
 * @param {{dcIncrease:number, chosen:Array}} traded
 * @param {object} [options]
 * @param {boolean} [options.applied] Whether the increase reached a DC.
 * @returns {string}
 */
export function tradeoffNote(traded, { applied = true } = {}) {
  if (!traded?.chosen?.length) return "";
  const parts = traded.chosen.map((c) => c.description);
  const header = applied
    ? `Traded difficulty (+${traded.dcIncrease} DC)`
    : `Traded difficulty (+${traded.dcIncrease} DC — add this to the DC you set)`;
  return `<strong>${header}:</strong> ${parts.join("; ")}`;
}
