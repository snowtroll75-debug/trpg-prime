/**
 * The pre-roll dialogs for Identify Power, Subsist and the two jumps —
 * the Foundry side of general-skill-options.mjs and jumping.mjs.
 *
 * All are asked BEFORE the AP is spent, like every other pre-roll
 * choice in the action workflow, so cancelling out of one costs nothing.
 * All are radio/checkbox lists inside the content rather than a row of
 * footer buttons, for the reason promptStudyTime records: four footer
 * buttons wrap their labels to three lines at chat width.
 */
import {
  IDENTIFY_POWER_DEFAULT,
  SUBSIST_EXTRA_PERSON_PENALTY,
  SUBSIST_HURRIED_PENALTY,
  identifyPowerTime,
  ladderOption,
  timeLadder
} from "./general-skill-options.mjs";
import { jumpDC, jumpPrompt } from "./jumping.mjs";

/**
 * "+2" / "-5" / "+0" as the dialog should show it.
 *
 * ZERO IS SIGNED TOO, because the chapter prints "10 minutes (+0)" and a
 * rung reading "(0)" beside three that read "(-2)", "(-5)" and "(-10)"
 * invites the reader to wonder whether it is a modifier at all.
 */
function signed(value) {
  return `${value >= 0 ? "+" : ""}${value}`;
}

/**
 * Any printed time ladder: how long do you spend?
 *
 * ONE DIALOG, FIVE LADDERS, because the five differ only in their rungs
 * and their wording — and writing five near-identical dialogs is how the
 * three distinct scales would end up quietly converging on one.
 *
 * @param {object} ladder A TIME_LADDERS entry.
 * @returns {Promise<object|null>} The chosen rung, or null if cancelled.
 */
export async function promptTimeLadder(ladder) {
  if (!ladder) return null;
  const { DialogV2 } = foundry.applications.api;
  const rows = ladder.options.map(
    (option) =>
      `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">` +
      `<input type="radio" name="ladderTime" value="${option.key}"` +
      `${option.key === ladder.defaultKey ? " checked" : ""} style="margin:0">` +
      `<span>${option.label} <span style="opacity:.7">(${signed(option.modifier)})</span></span>` +
      `</label>`
  ).join("");

  const result = await DialogV2.wait({
    window: { title: ladder.title, icon: ladder.icon },
    classes: ["trg-prime"],
    position: { width: 360 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">${ladder.hint}</p>
      ${rows}
    </div>`,
    buttons: [
      {
        action: "choose",
        label: ladder.button,
        icon: ladder.icon,
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return root?.querySelector?.('input[name="ladderTime"]:checked')?.value
            ?? ladder.defaultKey;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  return ladderOption(ladder, result);
}

/**
 * Identify Power: how long do you spend?
 *
 * Kept as its own entry point rather than folded away, because it is what
 * the 3.335.0 harness pins and what the action workflow has called since.
 * It is now a thin call through to the shared dialog — the ladder itself
 * is the same frozen array either way.
 *
 * @returns {Promise<object|null>} An IDENTIFY_POWER_TIME_OPTIONS entry,
 *   or null if cancelled.
 */
export async function promptIdentifyPowerTime() {
  const chosen = await promptTimeLadder(timeLadder("identifyPower"));
  if (!chosen) return null;
  return identifyPowerTime(chosen.key) ?? identifyPowerTime(IDENTIFY_POWER_DEFAULT);
}

/**
 * Subsist: the two penalties the character may elect to take.
 *
 * BOTH DEFAULT OFF. Neither is a consequence of the situation the system
 * can see — how long you spent and how many mouths you are feeding are
 * both facts only the player has — so a pre-ticked box would be the
 * system asserting something it does not know.
 *
 * @returns {Promise<{hurried:boolean, extraPerson:boolean}|null>}
 */
export async function promptSubsistOptions() {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: "Subsist", icon: "fa-solid fa-campground" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Eight hours of foraging and shelter-building is assumed. Tick anything that applies.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">
        <input type="checkbox" name="hurried" style="margin:0">
        <span>Fewer than 8 hours spent <span style="opacity:.7">(${signed(SUBSIST_HURRIED_PENALTY)})</span></span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">
        <input type="checkbox" name="extraPerson" style="margin:0">
        <span>Provide for an additional person <span style="opacity:.7">(${signed(SUBSIST_EXTRA_PERSON_PENALTY)})</span></span>
      </label>
      <p class="hint" style="font-size:.82em;margin:6px 0 0">Both are circumstance penalties, so taking both applies the worse of the two (Appendix 1) rather than their sum.</p>
    </div>`,
    buttons: [
      {
        action: "subsist",
        label: "Subsist",
        icon: "fa-solid fa-campground",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            hurried: Boolean(root?.querySelector?.('input[name="hurried"]')?.checked),
            extraPerson: Boolean(root?.querySelector?.('input[name="extraPerson"]')?.checked)
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;
  return result;
}

/**
 * High Jump / Long Jump: how far, and did you get the run-up?
 *
 * ONE DIALOG, TWO QUESTIONS — Graham's ruling R1 of 16 September 2026.
 * Both facts are the player's own declaration and neither is visible to
 * the system, so both are asked in the same breath and the arithmetic is
 * done from the pair.
 *
 * ASKED BEFORE THE CHECK DIALOG, not inside the trade-off prompt that
 * follows it. The audit proposed folding it into that prompt, which runs
 * AFTER the GM has already been asked to set a DC — and a computed DC
 * arriving then would either be overruled by a number the GM had no way
 * to know, or silently overrule it. Asked here, the DC reaches the check
 * dialog pre-filled, where "The DC may also be increased or decreased due
 * to the situation, as determined by the GM" is a field the GM can edit
 * rather than a sentence on a card.
 *
 * EVERYTHING DEFAULTS TO NOTHING. Zero feet computes no DC; the Stride
 * box is phrased as the DEVIATION ("I did NOT Stride") because the
 * printed action includes the Stride, so an untouched dialog asserts
 * nothing and behaves exactly as this action did before.
 *
 * @param {string} actionKey "highJump" or "longJump".
 * @returns {Promise<object|null|undefined>} A jumpDC result; `null` when
 *   the player declared no distance and the GM keeps the call; and
 *   `undefined` when the dialog was cancelled. The workflow needs all
 *   three — see its own `=== undefined` test.
 */
export async function promptJumpDistance(actionKey) {
  const prompt = jumpPrompt(actionKey);
  if (!prompt) return null;
  const { DialogV2 } = foundry.applications.api;

  const result = await DialogV2.wait({
    window: { title: prompt.title, icon: "fa-solid fa-person-running" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">${prompt.hint}</p>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="number" name="jumpFeet" value="0" min="0" step="1"
          style="width:4.4em;margin:0;text-align:center">
        <span>${prompt.distanceLabel}</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer">
        <input type="checkbox" name="noRunUp" style="margin:0">
        <span>${prompt.strideLabel}</span>
      </label>
      <p class="hint" style="font-size:.82em;margin:8px 0 0">The DC lands in the
        next dialog, where you can still adjust it for the situation.</p>
    </div>`,
    buttons: [
      {
        action: "jump",
        label: prompt.button,
        icon: "fa-solid fa-person-running",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            feet: Number(root?.querySelector?.('input[name="jumpFeet"]')?.value) || 0,
            strode: !root?.querySelector?.('input[name="noRunUp"]')?.checked
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  // CANCELLED IS NOT THE SAME AS "LEAVE IT TO THE GM", and the workflow
  // has to tell them apart: one abandons the action before any AP is
  // spent, the other rolls it with no computed DC. `undefined` is the
  // cancel; a jumpDC result — or its null — is the declaration.
  if (!result || result === "cancel") return undefined;
  return jumpDC({ actionKey, feet: result.feet, strode: result.strode });
}

/* ------------------------------------------------------------------ *
 * DISPEL (Chapter 4, page 91)                                         *
 * ------------------------------------------------------------------ */

/**
 * How much PP to pour into a Dispel, and what it is being dispelled.
 *
 * "You expend an amount of PP up to the maximum that you can use to cast
 * a spell and then make the check (which classes as a counteract check)
 * against the target magical item or effect."
 *
 * THREE NUMBERS, AND ONLY ONE OF THEM IS A CHOICE. The PP is declared by
 * the caster; the effect's DC and its level-or-PP are the GM's, because
 * `counteract.mjs` has recorded since it was written that the rulebook
 * never states what an arbitrary effect's counteract DC equals. Graham's
 * ruling R5, 17 September 2026 — "Your recommendation works fine" — was
 * to that: prompt for both rather than guess at one.
 *
 * THE CEILING IS OFFERED, NOT ENFORCED. `maxPPPerCast` is shown as the
 * printed maximum and the box is capped at it, but the pool is NOT: page
 * 91's NEGATIVE PP rule exists precisely so that spending past what you
 * hold is a price rather than a refusal (Graham's R3, same day).
 *
 * @param {number} maxPP the caster's own per-cast PP ceiling
 * @param {number} poolPP what they actually hold, for the hint
 * @returns {Promise<{pp:number, dc:number|null, effectValue:number}|undefined>}
 *   `undefined` when cancelled.
 */
export async function promptDispel(maxPP, poolPP, { level = 0, dc = 0 } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const ceiling = Math.max(1, Math.trunc(Number(maxPP) || 1));
  const held = Math.max(0, Math.trunc(Number(poolPP) || 0));
  const start = Math.max(1, Math.min(ceiling, held || 1));

  const result = await DialogV2.wait({
    window: { title: "Dispel — declare the counteract", icon: "fa-solid fa-wand-sparkles" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">This check <strong>classes as a counteract
        check</strong>: it is modified by &plusmn;2 for each level or PP difference between
        your attempt and the effect you are unravelling.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="number" name="dispelPP" value="${start}" min="1" max="${ceiling}" step="1"
          style="width:4.4em;margin:0;text-align:center">
        <span>PP to expend (max ${ceiling}; you hold ${held})</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="number" name="effectValue" value="${Math.max(0, Math.trunc(Number(level) || 0))}" min="0" step="1"
          style="width:4.4em;margin:0;text-align:center">
        <span>The effect's level or PP &mdash; 0 if unknown</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="number" name="effectDC" value="${Math.max(0, Math.trunc(Number(dc) || 0))}" min="0" step="1"
          style="width:4.4em;margin:0;text-align:center">
        <span>The effect's DC &mdash; 0 to set it in the next dialog</span>
      </label>
      <p class="hint" style="font-size:.82em;margin:8px 0 0">Spending more than you hold is
        allowed: your pool floors at 0 and you take 5 Soul Drain per PP below it.</p>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Dispel",
        icon: "fa-solid fa-wand-sparkles",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          const num = (name) => Number(root?.querySelector?.(`input[name="${name}"]`)?.value) || 0;
          return { pp: num("dispelPP"), effectValue: num("effectValue"), dc: num("effectDC") };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return undefined;
  return {
    pp: Math.max(1, Math.min(ceiling, Math.trunc(result.pp) || 1)),
    effectValue: Math.max(0, Math.trunc(result.effectValue) || 0),
    // A DC OF ZERO IS "NOT SET", NOT "trivially easy". The next dialog
    // takes it, which is where every other action with an unstated DC
    // already lands.
    dc: result.dc > 0 ? Math.trunc(result.dc) : null
  };
}

/* ------------------------------------------------------------------ *
 * RECHARGE ITEM (Chapter 4, page 91)                                  *
 * ------------------------------------------------------------------ */

/**
 * Which charged item is being recharged, and the DC its level sets.
 *
 * ONLY INVESTED ITEMS ARE OFFERED. "You concentrate on a charged magical
 * item THAT YOU HAVE INVESTED" — and an uninvested item regains nothing
 * from natural recharging either (`dailyRecharge`'s own `invested`
 * flag), so accelerating a process that is not running is not a thing
 * the action can do.
 *
 * AN ITEM ALREADY IMMUNE IS SHOWN AND DISABLED rather than hidden. "You
 * may only make one successful recharge check per item per day" is a
 * rule the player needs to SEE, and an item that silently vanishes from
 * the list reads as the sheet losing it.
 *
 * @param {Actor} actor
 * @returns {Promise<{itemId:string, itemName:string, level:number, dc:number}|undefined>}
 *   `undefined` when cancelled or when there is nothing to recharge.
 */
export async function promptRechargeItem(actor) {
  const { DialogV2 } = foundry.applications.api;
  const { chargedItemsOf, chargedItemData } = await import("./charged-items-workflow.mjs");
  const { chargedItemLevelOf } = await import("./charged-items.mjs");
  const { levelDC } = await import("./dice/resolution.mjs");
  const { SYSTEM_ID } = await import("./content-packs.mjs");

  const rows = chargedItemsOf(actor)
    .filter((item) => item.system?.invested)
    .map((item) => {
      // The item's printed level (3.615.0, A13 of block 36).
      const level = chargedItemLevelOf(item);
      return {
        id: item.id,
        name: item.name,
        level,
        dc: levelDC(level),
        pp: Number(item.system?.uses ?? 0),
        max: Math.max(0, Number(chargedItemData(item)?.maximumPP ?? 0)),
        immune: Boolean(item.flags?.[SYSTEM_ID]?.rechargeImmuneUntilPrep)
      };
    });

  if (!rows.length) {
    ui.notifications.warn("Recharge Item: you have no invested charged item to recharge.");
    return undefined;
  }

  const options = rows.map((r) =>
    `<option value="${r.id}" data-dc="${r.dc}" data-level="${r.level}"${r.immune ? " disabled" : ""}>`
    + `${r.name} — level ${r.level}, DC ${r.dc} (${r.pp}/${r.max} PP)`
    + `${r.immune ? " — already recharged today" : ""}</option>`
  ).join("");

  const first = rows.find((r) => !r.immune);
  if (!first) {
    ui.notifications.warn(
      "Recharge Item: every invested item has already been recharged — one successful check per item per day."
    );
    return undefined;
  }

  const result = await DialogV2.wait({
    window: { title: "Recharge Item — which item?", icon: "fa-solid fa-bolt" },
    classes: ["trg-prime"],
    position: { width: 480 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Ten minutes holding the item and chanting. The DC is
        the item's own <strong>level DC</strong>.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <select name="rechargeItem" style="flex:1 1 auto;margin:0">${options}</select>
      </label>
      <p class="hint" style="font-size:.82em;margin:8px 0 0">Costs 2 PP. A Fumble blocks the item's
        natural recharging for 24 hours and may trigger a Magical Resonance Event.</p>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Recharge",
        icon: "fa-solid fa-bolt",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return root?.querySelector?.('select[name="rechargeItem"]')?.value ?? "";
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return undefined;
  const chosen = rows.find((r) => r.id === result) ?? first;
  return { itemId: chosen.id, itemName: chosen.name, level: chosen.level, dc: chosen.dc };
}

/* ------------------------------------------------------------------ *
 * SENSE POWER (Chapter 4, page 91)                                    *
 * ------------------------------------------------------------------ */

/**
 * Whether a hard aura is present, which kind, and the DC it opposes.
 *
 * EVERY BOX STARTS UNTICKED AND THE DC AT ZERO, so a player who presses
 * the button and takes the default gets the action exactly as it behaved
 * before this dialog existed: a plain pulse that finds ordinary magic
 * with no check to beat. The opposed check is the exception the table
 * describes, not the normal case.
 *
 * @returns {Promise<{keys:string[], dc:number|null}|undefined>}
 *   `undefined` when cancelled.
 */
export async function promptSensePowerAura() {
  const { DialogV2 } = foundry.applications.api;
  const { AURA_MODIFIERS } = await import("./sense-power.mjs");

  const boxes = AURA_MODIFIERS.map((row) =>
    `<label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer">
      <input type="checkbox" name="aura-${row.key}" style="margin:0">
      <span>${row.label} <strong>(${row.modifier})</strong></span>
    </label>`
  ).join("");

  const result = await DialogV2.wait({
    window: { title: "Sense Magic — a harder aura?", icon: "fa-solid fa-eye" },
    classes: ["trg-prime"],
    position: { width: 470 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Ordinary magic is simply found — leave this alone
        and no check is opposed. Tick a row only for an aura the table calls harder to locate.</p>
      ${boxes}
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0 0">
        <input type="number" name="auraDC" value="0" min="0" step="1"
          style="width:4.4em;margin:0;text-align:center">
        <span>The aura's spell DC &mdash; or its level DC if unknown</span>
      </label>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Sense",
        icon: "fa-solid fa-eye",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            keys: AURA_MODIFIERS
              .map((row) => row.key)
              .filter((key) => root?.querySelector?.(`input[name="aura-${key}"]`)?.checked),
            dc: Number(root?.querySelector?.('input[name="auraDC"]')?.value) || 0
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return undefined;
  return { keys: result.keys ?? [], dc: result.dc > 0 ? Math.trunc(result.dc) : null };
}

/* ------------------------------------------------------------------ *
 * SNEAK (Chapter 4, page 93)                                          *
 * ------------------------------------------------------------------ */

/**
 * The cover maintained through the movement, and whether it was at full
 * Speed.
 *
 * DEFAULTS TO NO COVER AND HALF SPEED — the printed action ("you can
 * move up to half your speed") with nothing claimed on top, so an
 * untouched dialog asserts nothing.
 *
 * @returns {Promise<{cover:string, fullSpeed:boolean}|undefined>}
 */
export async function promptSneakOptions() {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: "Sneak — cover and speed", icon: "fa-solid fa-user-ninja" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Cover maintained <em>throughout</em> the movement.
        Taking Cover's larger bonus does not apply while you are moving.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <select name="sneakCover" style="flex:1 1 auto;margin:0">
          <option value="none" selected>No cover maintained</option>
          <option value="standard">Cover maintained (+2)</option>
          <option value="greater">Greater cover maintained (+4)</option>
        </select>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0 0;cursor:pointer">
        <input type="checkbox" name="sneakFullSpeed" style="margin:0">
        <span>Sneak at full Speed <strong>(-4)</strong> instead of half</span>
      </label>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Sneak",
        icon: "fa-solid fa-user-ninja",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            cover: root?.querySelector?.('select[name="sneakCover"]')?.value ?? "none",
            fullSpeed: Boolean(root?.querySelector?.('input[name="sneakFullSpeed"]')?.checked)
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return undefined;
  return { cover: result.cover, fullSpeed: result.fullSpeed };
}

/* ------------------------------------------------------------------ *
 * COVER TRACKS (Chapter 4, page 95)                                   *
 * ------------------------------------------------------------------ */

/**
 * How many characters' tracks are being hidden.
 *
 * DEFAULTS TO FOUR, which is the largest party that costs nothing —
 * "beyond the first four characters". A default of 1 would be tidier
 * and would understate the commonest case at a table.
 *
 * @returns {Promise<number|undefined>}
 */
export async function promptCoverTracks() {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: "Cover Tracks — how many?", icon: "fa-solid fa-shoe-prints" },
    classes: ["trg-prime"],
    position: { width: 440 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Covering the tracks of a small group is easy.
        Each character beyond the first four lowers your Tracking DC by 2.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="number" name="coverTracksCount" value="4" min="1" step="1"
          style="width:4.4em;margin:0;text-align:center">
        <span>Characters whose tracks you are hiding</span>
      </label>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Cover",
        icon: "fa-solid fa-shoe-prints",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return Number(root?.querySelector?.('input[name="coverTracksCount"]')?.value) || 1;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return undefined;
  return Math.max(1, Math.trunc(Number(result) || 1));
}

/* ------------------------------------------------------------------ *
 * GATHER HERBS (Chapter 4, page 95)                                   *
 * ------------------------------------------------------------------ */

/**
 * How many herbs are being sought, and whether this is the day's sole
 * activity.
 *
 * THE RANK CEILING IS ENFORCED BY THE INPUT'S max AND AGAIN ON RETURN.
 * "The input's `max` attribute does not stop a typed value either; only
 * this does" — the lesson `_preUpdate` records about skill ranks, which
 * cost a live test at 3.321.1.
 *
 * @param {number} allowed from herbsAtOnce()
 * @returns {Promise<{herbs:number, soleActivity:boolean}|undefined>}
 */
export async function promptGatherHerbs(allowed) {
  const { DialogV2 } = foundry.applications.api;
  const cap = Math.max(1, Math.trunc(Number(allowed) || 1));
  const result = await DialogV2.wait({
    window: { title: "Gather Herbs — what are you looking for?", icon: "fa-solid fa-seedling" },
    classes: ["trg-prime"],
    position: { width: 470 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">Your Survival ranks let you search for
        <strong>${cap}</strong> herb${cap === 1 ? "" : "s"} at once. Each has its own
        level-based difficulty — roll once per herb.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="number" name="herbCount" value="1" min="1" max="${cap}" step="1"
          style="width:4.4em;margin:0;text-align:center">
        <span>Herbs sought this day</span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:8px 0 0;cursor:pointer">
        <input type="checkbox" name="herbSole" style="margin:0">
        <span>Eight hours doing nothing else <strong>(+1 yield of each)</strong></span>
      </label>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Gather",
        icon: "fa-solid fa-seedling",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            herbs: Number(root?.querySelector?.('input[name="herbCount"]')?.value) || 1,
            soleActivity: Boolean(root?.querySelector?.('input[name="herbSole"]')?.checked)
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return undefined;
  return {
    herbs: Math.max(1, Math.min(cap, Math.trunc(Number(result.herbs) || 1))),
    soleActivity: Boolean(result.soleActivity)
  };
}

/* ------------------------------------------------------------------ *
 * PICK POCKET (Chapter 4, page 96)                                    *
 * ------------------------------------------------------------------ */

/**
 * The two circumstances the printed action asks about.
 *
 * THE COMBAT HALF IS NOT ASKED. Whether the mark is in combat is a fact
 * the system holds, and asking the player to declare it would let them
 * answer it wrongly. "On guard" is the GM's reading of the scene and has
 * no other source, so it is the only box here.
 *
 * @param {boolean} inCombat what the system already knows
 * @returns {Promise<{guarded:boolean, onGuard:boolean}|undefined>}
 */
export async function promptPickPocket(inCombat) {
  const { DialogV2 } = foundry.applications.api;
  const warning = inCombat
    ? `<p class="hint" style="margin:0 0 6px"><strong>The mark is in combat — this check
        automatically fails.</strong> Page 96.</p>`
    : "";
  const result = await DialogV2.wait({
    window: { title: "Pick Pocket — where is it?", icon: "fa-solid fa-hand" },
    classes: ["trg-prime"],
    position: { width: 470 },
    content: `<div class="trg-prime trg-check-dialog">
      ${warning}
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer">
        <input type="checkbox" name="pickGuarded" style="margin:0">
        <span>In a pocket, purse or otherwise closely guarded <strong>(DC +5)</strong></span>
      </label>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0;cursor:pointer">
        <input type="checkbox" name="pickOnGuard" style="margin:0">
        <span>The creature is <strong>on guard</strong> — the check automatically fails</span>
      </label>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Lift it",
        icon: "fa-solid fa-hand",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            guarded: Boolean(root?.querySelector?.('input[name="pickGuarded"]')?.checked),
            onGuard: Boolean(root?.querySelector?.('input[name="pickOnGuard"]')?.checked)
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return undefined;
  return { guarded: Boolean(result.guarded), onGuard: Boolean(result.onGuard) };
}

/* ------------------------------------------------------------------ *
 * ASSESS TRACKS (Chapter 5 class feat, page 115)                      *
 * ------------------------------------------------------------------ */

/**
 * Is the quarry actively covering their tracks?
 *
 * ONE QUESTION, AND IT PICKS THE DC. "Make a Level based Survival check
 * against the creature you are tracking OR against their Survival DC, IF
 * they are actively covering their tracks" — a condition, not a
 * whichever-is-higher, so it has to be asked rather than derived. See
 * module/assess-tracks.mjs for why the engine's two-DC array form is the
 * wrong tool.
 *
 * DEFAULTS TO NO, because the commonest quarry is a creature that walked
 * where it was going without a thought for who might follow. A default of
 * yes would quietly raise the DC on every reading of an animal's trail.
 *
 * @returns {Promise<{covering: boolean}|undefined>}
 */
export async function promptAssessTracks() {
  const { DialogV2 } = foundry.applications.api;
  const result = await DialogV2.wait({
    window: { title: "Assess Tracks", icon: "fa-solid fa-magnifying-glass" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">You read the trail for what it can tell you.
        The check is against the creature's Level DC — unless they are working to hide it,
        in which case their own Survival DC applies instead.</p>
      <label style="display:flex;align-items:center;gap:8px;margin:4px 0">
        <input type="checkbox" name="covering" style="margin:0">
        <span>They are actively covering their tracks</span>
      </label>
    </div>`,
    buttons: [
      {
        action: "roll",
        label: "Read the trail",
        icon: "fa-solid fa-magnifying-glass",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return { covering: Boolean(root?.querySelector?.('input[name="covering"]')?.checked) };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return undefined;
  return { covering: Boolean(result.covering) };
}
