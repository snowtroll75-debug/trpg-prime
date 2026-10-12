/**
 * The effect sheet.
 *
 * Foundry's own ActiveEffect configuration is a form about attribute
 * paths, change modes and priorities. That is the right window for
 * someone building a rule; it is the wrong one to hand a player who has
 * just been blessed. Per Graham: same styling as the rest of the sheet,
 * plainer wording, and the technical half hidden rather than removed —
 * behind a tickbox on the actor's GM tab, so it is there when a GM needs
 * it and absent when nobody does.
 *
 * Nothing is taken away. Every field Foundry's own window exposes is
 * still here and still submits through the same document paths; the
 * technical ones are simply not rendered unless asked for.
 */
import { CONDITIONS } from "../conditions/registry.mjs";
import { spellEffectDurationLabel } from "../magic/spell-effects.mjs";

const { ActiveEffectConfig } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const SYSTEM_ID = "trg-prime";
export const SHOW_INTERNALS_FLAG = "showEffectInternals";

/**
 * Foundry 14 changed the shape of an effect change: `mode` (a number) is
 * gone, replaced by a named `type` and a `phase`, and the array moved from
 * `changes` to `system.changes`. Built against the old shape first, which
 * the live test caught — the form accepted every edit and the document
 * kept none of it. Read from CONST rather than transcribed, so the next
 * core change is a relabelling rather than a silent failure.
 */
function labelled(values) {
  return Object.fromEntries(
    values.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1)])
  );
}

export class TRGActiveEffectSheet extends HandlebarsApplicationMixin(ActiveEffectConfig) {
  static DEFAULT_OPTIONS = {
    classes: ["trg-prime", "sheet", "effect"],
    position: { width: 560, height: "auto" },
    window: { icon: "fa-solid fa-sparkles", resizable: true },
    form: { closeOnSubmit: false, submitOnChange: true },
    actions: {
      addChange: TRGActiveEffectSheet.addChange,
      removeChange: TRGActiveEffectSheet.removeChange
    }
  };

  static PARTS = {
    form: { template: "systems/trg-prime/templates/effect/effect-sheet.hbs" }
  };

  /**
   * Whether to show the technical half.
   *
   * Read from the actor the effect belongs to, so the choice travels with
   * the character rather than being a global mode. An effect with no
   * parent actor — one being edited in the sidebar — shows everything,
   * since only a GM can be looking at it.
   */
  get showInternals() {
    const parent = this.document.parent;
    if (!parent?.getFlag) return true;
    return Boolean(parent.getFlag(SYSTEM_ID, SHOW_INTERNALS_FLAG));
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const effect = this.document;

    context.effect = effect;
    context.editable = this.isEditable;
    context.showInternals = this.showInternals;

    // A condition-backed effect is not a hand-built one: its name, icon
    // and value are owned by the rules, so the sheet says so rather than
    // inviting someone to rename Stunned.
    const conditionId = effect.flags?.[SYSTEM_ID]?.condition ?? null;
    context.conditionId = conditionId;
    context.conditionLabel = conditionId ? CONDITIONS[conditionId]?.label ?? conditionId : null;
    context.conditionValue = conditionId ? effect.flags?.[SYSTEM_ID]?.value ?? null : null;

    const stored = effect.toObject();
    context.changeRows = (stored.system?.changes ?? []).map((change, index) => ({
      index,
      key: change.key ?? "",
      type: change.type ?? "add",
      value: change.value ?? "",
      phase: change.phase ?? "initial",
      priority: change.priority ?? null
    }));
    context.typeChoices = labelled(Object.keys(CONST.ACTIVE_EFFECT_CHANGE_TYPES));
    context.phaseChoices = labelled([...CONST.ACTIVE_EFFECT_CHANGE_PHASES]);
    context.durationUnitChoices = labelled([...CONST.ACTIVE_EFFECT_DURATION_UNITS]);
    context.expiryChoices = {
      "": "—",
      ...labelled([...CONST.ACTIVE_EFFECT_EXPIRY_EVENTS])
    };

    // OUR OWN CLOCK FIRST (3.476.0) — see spellExpiryTiming.
    context.durationSummary = spellEffectDurationLabel(effect);
    context.statusList = Array.from(effect.statuses ?? []).join(", ");

    return context;
  }

  /**
   * Rebuild `changes` as an array before submitting.
   *
   * The form names its change rows `changes.0.key`, `changes.1.key` and so
   * on, which expand into an object keyed "0", "1" rather than an array —
   * and the ActiveEffect schema quietly discards that, so every edit to a
   * change row was accepted by the form and thrown away on the way to the
   * document. Found by typing into the field and watching nothing happen.
   */
  _prepareSubmitData(event, form, formData, updateData) {
    const submitData = super._prepareSubmitData(event, form, formData, updateData);
    const changes = submitData?.system?.changes;
    if (changes && !Array.isArray(changes)) {
      submitData.system.changes = Object.keys(changes)
        .sort((a, b) => Number(a) - Number(b))
        .map((index) => changes[index]);
    }
    return submitData;
  }

  /** Append a blank change row. */
  static async addChange() {
    const changes = this.document.toObject().system?.changes ?? [];
    changes.push({ key: "", type: "add", value: "", phase: "initial", priority: null });
    return this.document.update({ "system.changes": changes });
  }

  /** Drop one change row. */
  static async removeChange(event, target) {
    const index = Number(target.dataset.index);
    const changes = (this.document.toObject().system?.changes ?? []).filter(
      (change, i) => i !== index
    );
    return this.document.update({ "system.changes": changes });
  }
}
