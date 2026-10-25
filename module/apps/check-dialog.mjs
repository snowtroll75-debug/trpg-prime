import { BIAS } from "../dice/check.mjs";
import { applyPendingSelections, clearPendingModifiers, consumePendingModifiers,
  pendingModifierRows } from "../pending-modifiers.mjs";
import { pendingFitsCheck } from "../combat/dedicated-rows.mjs";
import { DIFFICULTIES, levelDC } from "../dice/resolution.mjs";
import { CONVICTION_SPENDS, convictionEnabled, getConvictionState } from "../conviction.mjs";
import {
  applyConditionalSelections,
  collectConditionals,
  conditionalRows,
  resolveBias, scalingFor } from "../conditionals.mjs";
import { patternDisruptionApplies } from "../rogue.mjs";
import {
  huntPreyCheckModifiers,
  huntedPrey,
  terrainMasteryAuraOffer
} from "../ranger.mjs";
import { hasClassAbility } from "../crusader.mjs";
import { activeToken, distanceBetween } from "../combat/geometry.mjs";
import { lightPenaltyRow, perceivedLightShift } from "../light-check.mjs";
import { toolPenaltyRow } from "../tools-requirement.mjs";
import { allyAuraConditionalsFor } from "../creature-aura-workflow.mjs";
import { lightLevelForToken } from "../light-workflow.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Terrain Mastery (Ranger, 9th), seen from an ALLY's dialog: any
 * friendly token whose actor is a Ranger with the in-favoured-terrain
 * toggle on, within 30 feet, extends its aura to this check. Canvas
 * geometry stays here in the glue; the eligibility arithmetic is
 * ranger.mjs's. Best-effort — a missing canvas offers nothing.
 */
/**
 * The light penalty on a Perception check, offered as a row.
 *
 * Canvas geometry and Foundry lookups stay here in the glue; the rule is
 * light-check.mjs's. Best-effort in the same way terrainMasteryAuraRows
 * is — a missing canvas or an actor with no token offers nothing rather
 * than throwing on the way to a roll.
 */
function lightRows(actor, subject) {
  try {
    const token = activeToken(actor);
    if (!token) return [];
    const { level } = lightLevelForToken(token.document ?? token);
    const row = lightPenaltyRow({
      ambientLevel: level,
      items: Array.from(actor.items ?? []),
      subject,
      // SHROUD (3.606.0) — the light this creature's own effects dim.
      shift: perceivedLightShift(Array.from(actor.effects ?? []))
    });
    return row ? [row] : [];
  } catch (_e) {
    return [];
  }
}

function terrainMasteryAuraRows(actor, subject) {
  try {
    const myToken = activeToken(actor);
    if (!myToken) return [];
    const myDisposition = Number(myToken.document?.disposition ?? 0);
    const rows = [];
    for (const token of canvas?.tokens?.placeables ?? []) {
      const ranger = token?.actor;
      if (!ranger || ranger.id === actor.id) continue;
      if (Number(token.document?.disposition ?? 0) !== myDisposition) continue;
      const bonus = terrainMasteryAuraOffer({
        rangerHasAbility: hasClassAbility(ranger, "Terrain Mastery"),
        toggleOn: Boolean(ranger.getFlag?.(SYSTEM_ID, "terrainMasteryActive")),
        rangerLevel: Number(ranger.system?.identity?.level ?? 0),
        distance: distanceBetween(myToken, token),
        subject
      });
      if (bonus) {
        rows.push({
          label: `Terrain Mastery (${ranger.name}'s aura)`,
          value: bonus,
          type: "circumstance",
          hint: `${ranger.name} is in a favoured terrain within 30 ft — applies if you can see or hear them and this check is made in that terrain`
        });
      }
    }
    return rows;
  } catch (_e) {
    return [];
  }
}

const { DialogV2 } = foundry.applications.api;

function extractForm(form) {
  if (!form) return {};
  const FDE =
    foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
  return new FDE(form).object;
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Should the configuration dialog be bypassed for this event?
 * Holding Shift or Ctrl rolls immediately with the defaults.
 * @param {Event} event
 * @returns {boolean}
 */
export function skipDialog(event) {
  return Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
}

/**
 * Prompt for the situational elements of a check.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {boolean} [options.allowModifiers] False for flat checks.
 * @param {number|null} [options.dc]
 * @returns {Promise<object|null>} Check configuration, or null if cancelled.
 */
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

export async function promptCheckConfiguration({
  extraConditionals = [],
  title = "Roll Check",
  allowModifiers = true,
  dc = null,
  actor = null,
  checkType = "generic",
  // The key within the check type — a skill key, save key, attribute key
  // or specialist slug — and the Skill/Basic Action a check was invoked
  // from, if any. Both exist so a permanent-but-scoped conditional can
  // tell a Swim check from an Athletics check, and Sense Power from
  // Power Manipulation generally.
  subject = "",
  actionKey = "",
  // Traits of whatever provoked the check (an affliction's Poison, a
  // spell's Sleep), so a scoped entry can settle its own scope.
  traits = "",
  // The magical tradition of whatever provoked it, where a caller knows.
  // Every caller of THIS dialog today is a roll made from the sheet, where
  // the source is a thing happening at the table and not on the sheet — so
  // it stays blank, and a tradition-scoped entry correctly falls back to
  // its manual row instead of pre-ticking on a guess.
  traditions = "",
  sourceTypes = "",
  // The creature type of whoever the check is AIMED AT (3.567.0). Unlike
  // the axes above this one a sheet roll CAN sometimes answer, because
  // the skill workflow that opens this dialog for Deception or Diplomacy
  // knows which token is targeted — so Dracoris's Wyrm bonus pre-ticks
  // there, and stays blank (and unoffered) on a roll aimed at nobody.
  targetTypes = "",
  // THE TARGET'S TRAITS (3.664.0), beside its type.
  targetTraits = "",
  // THE TWO UUID AXES (3.415.0). Same contract as `sourceTypes`: only a
  // caller holding both actors can fill them, and every caller of THIS
  // dialog today is a sheet roll that cannot — so they stay blank, and a
  // uuid-scoped entry correctly matches nothing rather than guessing.
  //
  // ACCEPTED HERE ANYWAY, and that is the point. `sourceUuids` shipped at
  // 3.406.0 read by `matchesCheck` and supplied by NOBODY on either path,
  // so it matched nothing for its whole life. An axis the dialog cannot
  // even be handed is one no caller can ever fix.
  sourceUuid = "",
  targetUuid = "",
  // MELEE OR RANGED (3.650.0), accepted for the same reason.
  attackMode = "",
  // WHAT IT IS STRUCK WITH (3.667.3), accepted for the same reason.
  attackForm = "",
  // THE WEAPON'S GROUP (3.668.0), accepted for the same reason.
  attackGroup = "",
  // HOW FAR IT REACHES (3.668.0), accepted for the same reason.
  rangeBand = "",
  // THE TARGET'S STATE (3.668.0), accepted for the same reason.
  targetStates = "",
  defaultDifficulty = "medium"
} = {}) {
  // The Advantage conviction spend covers saving throws and skill checks.
  let conviction = null;
  if (
    actor &&
    CONVICTION_SPENDS.advantage.checkTypes.includes(checkType)
  ) {
    const state = getConvictionState(actor);
    // Not offered at all where the world does not use Conviction (R11).
    if (state.value > 0 && convictionEnabled()) conviction = state;
  }
  // LUCK (3.624.0, block 40's R11): offered on a skill check or saving throw
  // while the world uses it. Attacks open no dialog; luck reaches them armed
  // from the sheet.
  const luckOffered = Boolean(actor) && ["skill", "save", "attack"].includes(checkType)
    && Boolean(globalThis.game?.settings?.get?.("trg-prime", "enableLuck"));
  const luckScore = Number(actor?.system?.resources?.luck?.value ?? 0);
  const difficultyOptions = DIFFICULTIES.map(
    (entry) =>
      `<option value="${entry.key}"${entry.key === defaultDifficulty ? " selected" : ""}>${entry.label}</option>`
  ).join("");

  // Pattern Disruption (Rogue, 2nd): "When disarming magical traps,
  // devices and locks, you treat the difficulty as Medium (+0) instead
  // of Very Hard." Offered as a tickbox on the two Thievery actions the
  // wording reaches — whether the device is actually MAGICAL is the one
  // thing the dice cannot see, so that stays the box's question.
  const patternDisruption = Boolean(actor) &&
    patternDisruptionApplies({ actor, actionKey });

  // Hunt Prey (Ranger, 1st): while a prey is designated, checks offer
  // "this is against my hunted prey" — the class bonus on any check,
  // Stalker Hunter's circumstance on its three skills, Warden Hunter's
  // on saving throws. One box, because they share one question; whether
  // THIS roll is really against the prey stays the player's answer,
  // exactly like Pattern Disruption's "is it magical".
  const prey = allowModifiers && actor ? huntedPrey(actor) : null;
  const preyModifiers = prey
    ? huntPreyCheckModifiers({
        actor,
        classBonus: Number(actor.system?.identity?.classBonus ?? 0),
        checkType,
        subject,
        level: Number(actor.system?.identity?.level ?? 0)
      })
    : [];
  const preySummary = preyModifiers
    .map((m) => `+${m.value} ${m.type} (${m.label})`)
    .join(", ");

  // Terrain Mastery (Ranger, 9th): an allied Ranger's aura, offered on
  // the three named skills while their toggle is on and they are within
  // 30 feet of this token.
  const auraRows = allowModifiers && actor && checkType === "skill"
    ? terrainMasteryAuraRows(actor, subject)
    : [];

  // Chapter 8's light penalty, on Perception only, and already adjusted
  // for whatever special senses this creature carries.
  const lightPenalties = allowModifiers && actor && checkType === "skill"
    ? lightRows(actor, subject)
    : [];

  // Chapter 4's Tools rule, on the actions whose own text names a tool.
  // Offered rather than applied, because the chapter hands the size of the
  // consequence to the GM ("up to -10… or may not allow the check at all")
  // and keeps only "do you have it" for the system to answer. Force Open's
  // difficulty step is the one printed number, and it is applied by the
  // action workflow before this dialog opens rather than offered here.
  const toolPenalties = allowModifiers && actor && actionKey
    ? [toolPenaltyRow({ actionKey, items: Array.from(actor.items ?? []) })].filter(Boolean)
    : [];

  const rollModes = Object.entries(CONFIG.ChatMessage.modes)
    .map(([key, label]) => {
      const text = game.i18n.localize(label.label ?? label);
      const selected =
        key === game.settings.get("core", "messageMode") ? " selected" : "";
      return `<option value="${key}"${selected}>${text}</option>`;
    })
    .join("");

  // Modifiers a Skill Action granted earlier and that are waiting for the
  // roll they apply to. Offered rather than applied: the number and its
  // type came from the rulebook, but whether *this* roll is the one they
  // were scoped to is the judgement the text leaves to a person.
  // AN ENTRY THAT NAMES ITS ACTION WAITS FOR THAT ACTION (3.666.3): Subsist's
  // "-2 to Subsist checks" is not offered on an Acrobatics check.
  const pending = allowModifiers && actor
    ? pendingModifierRows(actor).filter((row) => pendingFitsCheck(row, actionKey))
    : [];
  const pendingRows = pending.length
    ? `
      <div class="form-group trg-pending-modifiers">
        <label>Granted modifiers</label>
        ${pending
          .map(
            (entry) => `
          <div class="trg-inline">
            <input type="checkbox" name="pending" value="${entry.id}"${entry.auto && (!entry.checkTypes?.length || entry.checkTypes.includes(checkType)) ? " checked" : ""}>
            <span><strong>${escapeHTML(entry.lead)}</strong> — ${escapeHTML(entry.summary)}</span>
          </div>`
          )
          .join("")}
        <p class="hint">Tick any that apply to this roll; ones whose own wording leaves no judgement arrive ticked.${actor?.isOwner ? ` <a data-action="clearPending" style="cursor:pointer;text-decoration:underline">Clear all</a>.` : ""}</p>
      </div>`
    : "";

  // Permanent-but-scoped bonuses the character simply has: the Dwarf's
  // +2 against poison, Lead Boots' -4 to swim, the Tolderni's advantage
  // on Subsist. Only the ones whose scope could reach THIS check are
  // offered, and the ones whose scope the check's own identity fully
  // settles arrive pre-ticked — see module/conditionals.mjs.
  const conditionals =
    allowModifiers && actor
      ? conditionalRows(
          collectConditionals(
            Array.from(actor.items ?? []),
            Array.from(actor.appliedEffects ?? actor.effects ?? []),
            [
              ...(actor.system?.combat?.runeConditionals ?? []),
              // Ally auras: read off the canvas rather than the actor,
              // because standing inside a circle is not a fact about the
              // character sheet. See module/aura-conditionals.mjs.
              ...allyAuraConditionalsFor(actor),
              // What the thing being acted on brings (3.629.0): a peril's
              // situational Disable bonuses. See peril-workflow.mjs.
              ...(Array.isArray(extraConditionals) ? extraConditionals : [])
            ],
            scalingFor(actor)
          ),
          {
            checkType, subject, actionKey, traits, traditions,
            sourceTypes, targetTypes, sourceUuid, targetUuid, attackMode, targetTraits, attackForm, attackGroup, rangeBand, targetStates
          }
        )
      : [];
  const conditionalBlock = conditionals.length
    ? `
      <div class="form-group trg-conditional-modifiers">
        <label>Racial, feature &amp; equipment bonuses</label>
        ${conditionals
          .map(
            (entry) => `
          <div class="trg-inline">
            <input type="checkbox" name="conditional" value="${escapeHTML(entry.id)}"${entry.auto ? " checked" : ""}>
            <span><strong>${escapeHTML(entry.detail)}</strong> — ${escapeHTML(entry.summary)}</span>
          </div>`
          )
          .join("")}
        <p class="hint">Ticked ones apply. Untick any this roll falls outside.</p>
      </div>`
    : "";

  const modifierRows = allowModifiers
    ? `
      ${conditionalBlock}
      ${pendingRows}
      <div class="form-group">
        <label for="trg-situational">Situational modifier</label>
        <input id="trg-situational" type="number" name="situational" value="0">
      </div>
      <div class="form-group">
        <label for="trg-taking-time">Taking Time</label>
        <div class="trg-inline">
          <input id="trg-taking-time" type="checkbox" name="takingTime">
          <span class="hint">+4 circumstance bonus, at least twice the time</span>
        </div>
      </div>`
    : `<p class="hint">A flat check never includes any modifiers, bonuses or penalties.</p>`;

  const content = `
    <div class="trg-prime trg-check-dialog">
      <div class="form-group">
        <label for="trg-dc-mode">Difficulty Check</label>
        <select id="trg-dc-mode" name="dcMode">
          <option value="unknown">Set by the GM (roll total only)</option>
          <option value="fixed"${dc !== null ? " selected" : ""}>Fixed DC</option>
          <option value="level">Level-based DC (level + 14)</option>
        </select>
      </div>
      <div class="form-group">
        <label for="trg-dc">DC / Task level</label>
        <input id="trg-dc" type="number" name="dcValue" value="${dc ?? ""}" placeholder="—">
      </div>
      <div class="form-group">
        <label for="trg-difficulty">Difficulty modifier</label>
        <select id="trg-difficulty" name="difficulty">${difficultyOptions}</select>
      </div>
      ${
        patternDisruption
          ? `<div class="form-group">
        <label for="trg-pattern-disruption">Pattern Disruption</label>
        <div class="trg-inline">
          <input id="trg-pattern-disruption" type="checkbox" name="patternDisruption">
          <span class="hint">This is a magical trap, device or lock — a Very hard (+5) difficulty is treated as Medium (+0)</span>
        </div>
      </div>`
          : ""
      }
      ${
        preyModifiers.length
          ? `<div class="form-group">
        <label for="trg-hunt-prey">Hunt Prey</label>
        <div class="trg-inline">
          <input id="trg-hunt-prey" type="checkbox" name="huntPrey">
          <span class="hint">This check is made against your hunted prey${prey?.name ? ` (${escapeHTML(prey.name)})` : ""} — ${escapeHTML(preySummary)}</span>
        </div>
      </div>`
          : ""
      }
      ${
        lightPenalties.length
          ? `<div class="form-group trg-light-penalty">
        <label>Light</label>
        ${lightPenalties
          .map(
            (row, index) => `
        <div class="trg-inline">
          <input type="checkbox" name="lightPenalty" value="light-${index}">
          <span class="hint"><strong>${row.value} ${row.type}</strong> — ${escapeHTML(row.hint)}</span>
        </div>`
          )
          .join("")}
        <p class="hint">Tick if this check relies on sight.</p>
      </div>`
          : ""
      }
      ${
        toolPenalties.length
          ? `<div class="form-group trg-tool-penalty">
        <label>Tools</label>
        ${toolPenalties
          .map(
            (row, index) => `
        <div class="trg-inline">
          <input type="checkbox" name="toolPenalty" value="tool-${index}" checked>
          <span class="hint"><strong>${row.value} ${row.type}</strong> — ${escapeHTML(row.hint)}</span>
        </div>`
          )
          .join("")}
        <p class="hint">Adjust with the situational modifier, or untick if the GM allows the task without them.</p>
      </div>`
          : ""
      }
      ${
        auraRows.length
          ? `<div class="form-group trg-terrain-aura">
        <label>Terrain Mastery</label>
        ${auraRows
          .map(
            (row, index) => `
        <div class="trg-inline">
          <input type="checkbox" name="terrainAura" value="aura-${index}">
          <span class="hint"><strong>+${row.value} circumstance</strong> — ${escapeHTML(row.hint)}</span>
        </div>`
          )
          .join("")}
      </div>`
          : ""
      }
      ${modifierRows}
      <div class="form-group">
        <label for="trg-bias">Roll</label>
        <select id="trg-bias" name="bias">
          <option value="${BIAS.NORMAL}">Normal</option>
          <option value="${BIAS.ADVANTAGE}">Advantage</option>
          <option value="${BIAS.DISADVANTAGE}">Disadvantage</option>
        </select>
      </div>
      ${
        conviction
          ? `<div class="form-group">
        <label for="trg-conviction-adv">Conviction</label>
        <div class="trg-inline">
          <input id="trg-conviction-adv" type="checkbox" name="convictionAdvantage"${conviction.ok ? "" : " disabled"}>
          <span class="hint">${
            conviction.ok
              ? `Spend 1 point (${conviction.value} left) to gain Advantage`
              : conviction.reason
          }</span>
        </div>
      </div>`
          : ""
      }
      ${
        luckOffered
          ? `<div class="form-group">
        <label for="trg-use-luck">Luck</label>
        <div class="trg-inline">
          <input id="trg-use-luck" type="checkbox" name="useLuck">
          <span class="hint">Make a luck check first (luck ${luckScore}): Advantage on a success, the worse of Disadvantage and −5 on a fumble. Once a round; not with Conviction.</span>
        </div>
      </div>`
          : ""
      }
      <div class="form-group">
        <label for="trg-roll-mode">Visibility</label>
        <select id="trg-roll-mode" name="rollMode">${rollModes}</select>
      </div>
    </div>`;

  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-dice-d20" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content,
    buttons: [
      {
        action: "roll",
        label: "Roll",
        icon: "fa-solid fa-dice-d20",
        default: true,
        callback: (event, button) =>
          extractForm(button.form ?? button.closest?.("form"))
      },
      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark"
      }
    ],
    rejectClose: false,
    // THE GM'S ESCAPE HATCH, WIRED (3.363.0). `clearPendingModifiers`'s own
    // doc comment described it as "the GM's escape hatch, and used by a
    // full rest"; it was called by nothing, so a granted modifier that was
    // never ticked stayed on the actor and reappeared in every roll dialog
    // for the life of the character, with no way to remove it.
    //
    // NOT WIRED TO REST, deliberately, though the stale comment invited it:
    // these entries are scoped in their own words — "-4 on all FUTURE
    // Detect Deception checks against the target" has no duration and does
    // not end at dawn — and nothing records which are time-bounded. A
    // blanket clear at rest would quietly delete rules that are still in
    // force. Clearing is a judgement, so it is a button.
    render: (event, dialog) => {
      const root = dialog?.element ?? dialog;
      root.querySelector?.('[data-action="clearPending"]')?.addEventListener("click", async () => {
        await clearPendingModifiers(actor);
        for (const box of root.querySelectorAll?.('input[name="pending"]') ?? []) {
          box.closest(".trg-inline")?.remove();
        }
        root.querySelector?.(".trg-pending-modifiers")?.remove();
      });
    }
  });

  if (!result || result === "cancel") return null;

  const raw = numberOrNull(result.dcValue);
  let dcResult = null;
  if (result.dcMode === "fixed") dcResult = raw;
  else if (result.dcMode === "level" && raw !== null) dcResult = levelDC(raw);

  const modifiers = [];
  let conditionalKinds = [];
  // Kept separate from `conditionalKinds` and COMBINED at the bias line
  // rather than assigned into it, so a ticked advantage conditional and
  // a ticked disadvantage from a pending swing cancel each other the way
  // two manually chosen biases would.
  let pendingKinds = [];
  if (allowModifiers) {
    // A single checkbox posts a string, several post an array — the same
    // shape the pending block below has to handle.
    const tickedConditionals =
      result.conditional === undefined
        ? []
        : [result.conditional].flat().filter(Boolean).map(String);
    const selection = applyConditionalSelections(conditionals, tickedConditionals);
    modifiers.push(...selection.modifiers);
    conditionalKinds = selection.kinds;

    // A conditional that says "the next one" is spent by being used. The
    // effect goes, not the row — deleting the effect is what also ends
    // the spell that placed it, which is what Clarity's own text says
    // happens. Items are never spent; see spentConditionalSources.
    for (const { sourceId, label } of selection.spent ?? []) {
      const effect = actor?.effects?.get?.(sourceId);
      if (effect?.delete) await effect.delete();
      // NOT SILENT. Measured live: `effects.get` misses an effect an
      // item transferred, and those are filtered out upstream — so a
      // miss here means something else (a race, an unowned actor). A
      // one-shot that was used and not spent stays on offer for ever,
      // which is the failure this whole change exists to end.
      else ui.notifications?.warn?.(
        `${label || "A one-shot bonus"} was used but could not be cleared — remove it by hand.`);
    }

    const situational = Number(result.situational ?? 0);
    if (situational) {
      modifiers.push({
        label: "Situational",
        value: situational,
        type: "untyped"
      });
    }
    if (result.takingTime) {
      modifiers.push({
        label: "Taking Time",
        value: 4,
        type: "circumstance"
      });
    }
    // Hunt Prey's box carries every prey-scoped modifier this check
    // qualifies for — the class bonus, plus whichever Hunter's Method
    // rider (Stalker on its skills, Warden on saves) applies.
    if (result.huntPrey) {
      modifiers.push(...preyModifiers);
    }
    // A single checkbox posts a string, several post an array — and the
    // value is a prefixed string, not a bare index, so FormDataExtended
    // can never coerce a legitimate first row ("0") into a false.
    const tickedAuras = result.terrainAura === undefined
      ? []
      : [result.terrainAura].flat().filter(Boolean).map(String);
    for (const ticked of tickedAuras) {
      const row = auraRows[Number(ticked.replace("aura-", ""))];
      if (row) {
        modifiers.push({ label: row.label, value: row.value, type: row.type });
      }
    }

    // Same prefixed-value shape as the aura rows above, for the same
    // reason: a bare index of 0 would come back falsy.
    const tickedLight = result.lightPenalty === undefined
      ? []
      : [result.lightPenalty].flat().filter(Boolean).map(String);
    for (const entry of tickedLight) {
      const row = lightPenalties[Number(entry.replace("light-", ""))];
      if (row) modifiers.push({ label: row.label, value: row.value, type: row.type });
    }

    // The tool row arrives PRE-TICKED, unlike light and the pending rows.
    // Those ask a question the check cannot answer for itself ("does this
    // rely on sight?"); this one states a fact it already knows — the kit
    // is not on the sheet. Unticking is the GM overruling the default, and
    // it is the GM's to overrule.
    const tickedTools = result.toolPenalty === undefined
      ? []
      : [result.toolPenalty].flat().filter(Boolean).map(String);
    for (const entry of tickedTools) {
      const row = toolPenalties[Number(entry.replace("tool-", ""))];
      if (row) modifiers.push({ label: row.label, value: row.value, type: row.type });
    }

    // A single checkbox posts a string, several post an array.
    const ticked = result.pending === undefined
      ? []
      : [result.pending].flat().filter(Boolean).map(String);
    if (ticked.length) {
      // Split by the rule rather than here. A swing carries value 0, and
      // the loop this replaced pushed every ticked row into `modifiers`
      // unconditionally — which would have added "disadvantage" as a +0
      // and done nothing at all, loudly enough to look implemented.
      const selection = applyPendingSelections(pending, ticked);
      modifiers.push(...selection.modifiers);
      pendingKinds = selection.kinds;
      if (selection.consume.length) await consumePendingModifiers(actor, selection.consume);
    }
  }

  // Pattern Disruption's swap, literal: only a Very Hard difficulty is
  // downgraded — the text names that tier, not "one step easier".
  const chosenDifficulty =
    patternDisruption && result.patternDisruption && (result.difficulty ?? "medium") === "veryHard"
      ? "medium"
      : result.difficulty ?? "medium";

  return {
    dc: dcResult,
    difficulty: chosenDifficulty,
    // The dropdown and the ticked advantage/disadvantage conditionals
    // are reconciled together, so one of each cancels exactly as two
    // manually chosen biases would.
    bias: resolveBias(result.bias ?? BIAS.NORMAL, [...conditionalKinds, ...pendingKinds], BIAS),
    // Every matching conditional was offered above, so TRGCheck.roll must
    // not apply the automatic ones a second time.
    conditionalsResolved: allowModifiers,
    rollMode: result.rollMode,
    convictionAdvantage: Boolean(result.convictionAdvantage),
    useLuck: Boolean(result.useLuck),
    modifiers
  };
}
