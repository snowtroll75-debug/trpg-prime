import {
  listTargets, getTarget, readTarget,
  previewPoolBonus, previewFieldChange,
  TARGET_CATEGORIES, BONUS_TYPE_KEYS, DAMAGE_TYPE_KEYS
} from "./registry.mjs";
import {
  beginTransaction, commitTransaction, undoTransaction, getModifierLog,
  applyPoolBonus, applyFieldChange, applySelectChange, applyConditionChange,
  recordWrapped, applyItemUpdate,
  getModifierPresets, saveModifierPreset, deleteModifierPreset
} from "./transactions.mjs";
import {
  criticalTransaction, fumbleTransaction, resolveSeverityInput,
  CRITICAL_TABLE_KEYS, FUMBLE_TABLE_KEYS
} from "./tables.mjs";
import { BONUS_TYPES } from "../dice/resolution.mjs";
import { CONDITIONS } from "../conditions/registry.mjs";
import { resolveAgainstDefences, applyTypedDamage } from "../combat/damage-workflow.mjs";
import { ownedCreatureTypeSystem } from "../creature-type-rules.mjs";
import { itemStatus, applyItemDamage } from "../items.mjs";

/**
 * The Universal Modifier — the GM-facing window over the transaction engine.
 *
 * One interface: choose targets, choose an operation, preview, apply, and
 * undo from the log. Everything it does routes through the semantic target
 * registry (never a guessed path) and the transaction engine (always
 * previewable, always audited, always reversible).
 */

const SYSTEM_ID = "trg-prime";

function esc(text) {
  return foundry.utils.escapeHTML(String(text ?? ""));
}

function _signed(value) {
  const n = Number(value) || 0;
  return n >= 0 ? `+${n}` : String(n);
}

export class UniversalModifierApp extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "trg-universal-modifier",
    classes: ["trg-prime", "trg-universal-modifier"],
    window: {
      title: "Universal Modifier",
      icon: "fa-solid fa-sliders",
      resizable: true
    },
    position: { width: 820, height: 720 },
    actions: {
      umTab: UniversalModifierApp.#onTab,
      umPreview: UniversalModifierApp.#onPreview,
      umApplyModifier: UniversalModifierApp.#onApplyModifier,
      umApplyCondition: UniversalModifierApp.#onApplyCondition,
      umApplyDamage: UniversalModifierApp.#onApplyDamage,
      umDamageItem: UniversalModifierApp.#onDamageItem,
      umRepairItem: UniversalModifierApp.#onRepairItem,
      umRollTable: UniversalModifierApp.#onRollTable,
      umSavePreset: UniversalModifierApp.#onSavePreset,
      umLoadPreset: UniversalModifierApp.#onLoadPreset,
      umDeletePreset: UniversalModifierApp.#onDeletePreset,
      umUndo: UniversalModifierApp.#onUndo,
      umRefresh: UniversalModifierApp.#onRefresh
    }
  };

  /** Sticky form state, preserved across re-renders. */
  state = {
    tab: "modify",
    targetMode: "controlled",
    pickedActorId: "",
    category: "Combat",
    targetKey: "",
    bonusType: "status",
    value: "1",
    label: "",
    fieldOp: "add",
    durationMode: "permanent",
    durationRounds: "3",
    durationAmount: "10",
    durationUnit: "60",
    conditionKey: "frightened",
    conditionAction: "apply",
    conditionValue: "1",
    conditionExact: false,
    conditionDamageType: "fire",
    conditionForce: false,
    conditionReason: "",
    conditionRounds: "",
    dmgKind: "damage",
    dmgFormula: "1d6",
    dmgType: "slashing",
    dmgPerTarget: false,
    dmgIgnoreDefences: false,
    dmgCritical: false,
    inspectorUuid: "",
    itemActorUuid: "",
    itemAmount: "5",
    itemIgnoreHardness: false,
    tblMode: "critical",
    tblActorUuid: "",
    tblDamageType: "slashing",
    tblSeverityMode: "serious",
    tblAV: "15",
    tblCR: "0",
    tblAttackBonus: "0",
    tblModifier: "0",
    tblForced: "",
    tblCategory: "melee",
    presetName: ""
  };

  /** Transient preview HTML injected after a Preview click. */
  previewHTML = "";

  /** An actor pinned by the sheet header button (covers unlinked tokens). */
  pinnedActor = null;

  /* ------------------------------------------------------------------ */
  /*  State helpers                                                      */
  /* ------------------------------------------------------------------ */

  /** Capture every named control into the sticky form state. */
  #captureForm() {
    const root = this.element;
    if (!root) return;
    for (const input of root.querySelectorAll("[name]")) {
      if (input.type === "checkbox") this.state[input.name] = input.checked;
      else this.state[input.name] = input.value;
    }
  }

  /** Resolve the current target actors from the acquisition controls. */
  resolveTargets() {
    const mode = this.state.targetMode;
    let actors = [];
    if (mode === "controlled") {
      actors = (canvas?.tokens?.controlled ?? []).map((t) => t.actor);
    } else if (mode === "targeted") {
      actors = Array.from(game.user?.targets ?? []).map((t) => t.actor);
    } else if (mode === "combatants") {
      actors = Array.from(game.combat?.combatants ?? []).map((c) => c.actor);
    } else if (mode === "actor") {
      const actor = game.actors?.get(this.state.pickedActorId);
      actors = actor ? [actor] : [];
    } else if (mode === "pinned") {
      actors = this.pinnedActor ? [this.pinnedActor] : [];
    }
    const seen = new Set();
    return actors.filter((a) => {
      if (!a || seen.has(a.uuid)) return false;
      seen.add(a.uuid);
      return true;
    });
  }

  #currentEntry(targets) {
    const actor = targets[0] ?? null;
    return this.state.targetKey ? getTarget(this.state.targetKey, actor) : null;
  }

  #timingFromForm() {
    if (this.state.durationMode === "rounds") {
      return { mode: "rounds", rounds: Math.max(1, Number(this.state.durationRounds) || 1) };
    }
    if (this.state.durationMode === "time") {
      const seconds = Math.max(1, Number(this.state.durationAmount) || 1) * (Number(this.state.durationUnit) || 60);
      return { mode: "time", seconds };
    }
    return { mode: "permanent" };
  }

  /* ------------------------------------------------------------------ */
  /*  Rendering                                                          */
  /* ------------------------------------------------------------------ */

  async _renderHTML() {
    const targets = this.resolveTargets();
    const tab = this.state.tab;

    const tabs = [
      ["modify", "Modify"],
      ["conditions", "Conditions"],
      ["damage", "Damage & Healing"],
      ["items", "Items"],
      ["tables", "Tables"],
      ["presets", "Presets"],
      ["inspector", "Inspector"],
      ["log", "Log"]
    ].map(([key, label]) =>
      `<a class="um-tab ${tab === key ? "active" : ""}" data-action="umTab" data-tab="${key}">${label}</a>`
    ).join("");

    let body = "";
    if (tab === "modify") body = this.#renderModify(targets);
    else if (tab === "conditions") body = this.#renderConditions(targets);
    else if (tab === "damage") body = this.#renderDamage(targets);
    else if (tab === "items") body = this.#renderItems(targets);
    else if (tab === "tables") body = this.#renderTables(targets);
    else if (tab === "presets") body = this.#renderPresets();
    else if (tab === "inspector") body = this.#renderInspector(targets);
    else body = this.#renderLog();

    return `
      <div class="um-root">
        ${this.#renderTargetBar(targets)}
        <nav class="um-tabs">${tabs}</nav>
        <section class="um-body">${body}</section>
      </div>`;
  }

  _replaceHTML(result, content) {
    content.innerHTML = result;
  }

  #renderTargetBar(targets) {
    const modes = [
      ["controlled", "Controlled tokens"],
      ["targeted", "Targeted tokens"],
      ["combatants", "All combatants"],
      ["actor", "Pick an actor"]
    ];
    if (this.pinnedActor) modes.push(["pinned", `Pinned: ${this.pinnedActor.name}`]);
    const options = modes
      .map(([v, l]) => `<option value="${v}" ${this.state.targetMode === v ? "selected" : ""}>${esc(l)}</option>`).join("");

    const actorOptions = (game.actors?.contents ?? [])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((a) => `<option value="${a.id}" ${this.state.pickedActorId === a.id ? "selected" : ""}>${esc(a.name)}</option>`)
      .join("");

    const chips = targets.length
      ? targets.map((a) => `<span class="um-chip">${esc(a.name)}</span>`).join("")
      : `<span class="um-chip um-chip-empty">No targets resolved</span>`;

    return `
      <div class="um-targetbar">
        <select name="targetMode" data-um-rerender>${options}</select>
        <select name="pickedActorId" data-um-rerender ${this.state.targetMode === "actor" ? "" : "style=\"display:none\""}>
          <option value="">— choose actor —</option>${actorOptions}
        </select>
        <button type="button" data-action="umRefresh" title="Re-resolve targets"><i class="fa-solid fa-rotate"></i></button>
        <div class="um-chips">${chips}</div>
      </div>`;
  }

  #renderModify(targets) {
    const actor = targets[0] ?? null;
    const all = listTargets(actor).filter((e) => e.kind !== "condition");
    const categories = TARGET_CATEGORIES.filter((c) =>
      c !== "Conditions" && all.some((e) => e.category === c));

    if (!categories.includes(this.state.category)) this.state.category = categories[0];
    const inCategory = all.filter((e) => e.category === this.state.category);
    if (!inCategory.find((e) => e.key === this.state.targetKey)) {
      this.state.targetKey = inCategory[0]?.key ?? "";
    }
    const entry = inCategory.find((e) => e.key === this.state.targetKey) ?? null;

    const categoryOptions = categories.map((c) =>
      `<option value="${c}" ${this.state.category === c ? "selected" : ""}>${c}</option>`).join("");
    const targetOptions = inCategory.map((e) =>
      `<option value="${e.key}" ${this.state.targetKey === e.key ? "selected" : ""}>${esc(e.label)}</option>`).join("");

    let current = "";
    if (actor && entry) {
      const read = readTarget(actor, entry);
      const tooltip = read.tooltip ? ` title="${esc(read.tooltip)}"` : "";
      current = `<div class="um-current"${tooltip}>
        ${esc(actor.name)}: <strong>${esc(read.value)}</strong>${read.max !== null ? ` / ${read.max}` : ""}
        <span class="um-kind">[${entry.kind === "pool" ? "derived — typed bonus pool" : entry.kind === "select" ? "stored selection" : "stored value"}]</span>
      </div>`;
    }

    let controls = "";
    if (entry?.kind === "pool") {
      const typeOptions = BONUS_TYPE_KEYS.map((t) =>
        `<option value="${t}" ${this.state.bonusType === t ? "selected" : ""}>${BONUS_TYPES[t].label} (${BONUS_TYPES[t].stacking})</option>`).join("");
      controls = `
        <div class="um-row">
          <label>Value <input type="number" name="value" value="${esc(this.state.value)}" step="1"></label>
          <label>Bonus type <select name="bonusType">${typeOptions}</select></label>
          <label>Label <input type="text" name="label" value="${esc(this.state.label)}" placeholder="e.g. Bless, GM ruling"></label>
        </div>
        ${this.#renderDuration()}`;
    } else if (entry?.kind === "select") {
      const opts = (entry.options ?? []).map((o) =>
        `<option value="${o}" ${this.state.value === o ? "selected" : ""}>${o}</option>`).join("");
      controls = `
        <div class="um-row">
          <label>New value <select name="value">${opts}</select></label>
        </div>`;
    } else if (entry) {
      controls = `
        <div class="um-row">
          <label>Operation <select name="fieldOp">
            <option value="add" ${this.state.fieldOp === "add" ? "selected" : ""}>Add / subtract</option>
            <option value="set" ${this.state.fieldOp === "set" ? "selected" : ""}>Set to value</option>
          </select></label>
          <label>Value <input type="number" name="value" value="${esc(this.state.value)}" step="1"></label>
        </div>`;
    }

    const notes = [];
    if (entry?.note) notes.push(entry.note);
    if (entry?.derivedImpact) notes.push(`Derived impact: ${entry.derivedImpact}`);
    if (entry?.refreshes) notes.push(entry.refreshes);

    return `
      <div class="um-row">
        <label>Category <select name="category" data-um-rerender>${categoryOptions}</select></label>
        <label>Target <select name="targetKey" data-um-rerender>${targetOptions}</select></label>
      </div>
      ${current}
      ${controls}
      ${notes.length ? `<p class="um-note">${notes.map(esc).join("<br>")}</p>` : ""}
      <div class="um-actions">
        <button type="button" data-action="umPreview"><i class="fa-solid fa-eye"></i> Preview</button>
        <button type="button" data-action="umApplyModifier" class="um-primary"><i class="fa-solid fa-check"></i> Apply</button>
      </div>
      <div class="um-preview">${this.previewHTML}</div>`;
  }

  #renderDuration() {
    const mode = this.state.durationMode;
    return `
      <div class="um-row">
        <label>Duration <select name="durationMode" data-um-rerender>
          <option value="permanent" ${mode === "permanent" ? "selected" : ""}>Permanent (until removed)</option>
          <option value="rounds" ${mode === "rounds" ? "selected" : ""}>Rounds</option>
          <option value="time" ${mode === "time" ? "selected" : ""}>World time</option>
        </select></label>
        ${mode === "rounds" ? `<label>Rounds <input type="number" name="durationRounds" value="${esc(this.state.durationRounds)}" min="1" step="1"></label>` : ""}
        ${mode === "time" ? `
          <label>Amount <input type="number" name="durationAmount" value="${esc(this.state.durationAmount)}" min="1" step="1"></label>
          <label>Unit <select name="durationUnit">
            <option value="60" ${this.state.durationUnit === "60" ? "selected" : ""}>Minutes</option>
            <option value="3600" ${this.state.durationUnit === "3600" ? "selected" : ""}>Hours</option>
            <option value="86400" ${this.state.durationUnit === "86400" ? "selected" : ""}>Days</option>
          </select></label>` : ""}
      </div>`;
  }

  #renderConditions(targets) {
    const conditionOptions = Object.entries(CONDITIONS)
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([id, def]) =>
        `<option value="${id}" ${this.state.conditionKey === id ? "selected" : ""}>${esc(def.label)}${def.valued ? " (valued)" : ""}</option>`)
      .join("");

    const def = CONDITIONS[this.state.conditionKey] ?? null;
    const damageTypeOptions = DAMAGE_TYPE_KEYS.map((t) =>
      `<option value="${t}" ${this.state.conditionDamageType === t ? "selected" : ""}>${t}</option>`).join("");

    const currentLines = targets.map((a) => {
      const has = a.hasCondition?.(this.state.conditionKey);
      const value = def?.valued ? a.getConditionValue?.(this.state.conditionKey) : null;
      const immune = a.isImmuneToCondition?.(this.state.conditionKey);
      let state = has ? (value !== null && value !== undefined ? `has ${def.label} ${value}` : `has ${def?.label}`) : "—";
      if (immune) state += " (IMMUNE)";
      return `<p class="um-line">${esc(a.name)}: ${esc(state)}</p>`;
    }).join("");

    return `
      <div class="um-row">
        <label>Condition <select name="conditionKey" data-um-rerender>${conditionOptions}</select></label>
        <label>Action <select name="conditionAction" data-um-rerender>
          <option value="apply" ${this.state.conditionAction === "apply" ? "selected" : ""}>Apply</option>
          <option value="remove" ${this.state.conditionAction === "remove" ? "selected" : ""}>Remove</option>
        </select></label>
      </div>
      ${this.state.conditionAction === "apply" && def?.valued ? `
        <div class="um-row">
          <label>Value <input type="number" name="conditionValue" value="${esc(this.state.conditionValue)}" min="1" step="1"></label>
          <label class="um-check"><input type="checkbox" name="conditionExact" ${this.state.conditionExact ? "checked" : ""}> Set exact value (otherwise raises to at least this value)</label>
          ${this.state.conditionKey === "recurring" ? `<label>Damage type <select name="conditionDamageType">${damageTypeOptions}</select></label>` : ""}
        </div>` : ""}
      ${this.state.conditionAction === "apply" ? `
        <div class="um-row">
          <label>Expires after rounds (blank = no auto-expiry) <input type="number" name="conditionRounds" value="${esc(this.state.conditionRounds)}" min="1" step="1"></label>
        </div>
        <div class="um-row">
          <label class="um-check"><input type="checkbox" name="conditionForce" ${this.state.conditionForce ? "checked" : ""}> GM override (apply even if immune)</label>
          <label>Override reason <input type="text" name="conditionReason" value="${esc(this.state.conditionReason)}" placeholder="required when overriding"></label>
        </div>` : ""}
      <div class="um-currentblock">${currentLines}</div>
      <div class="um-actions">
        <button type="button" data-action="umApplyCondition" class="um-primary"><i class="fa-solid fa-check"></i> ${this.state.conditionAction === "remove" ? "Remove" : "Apply"}</button>
      </div>
      <div class="um-preview">${this.previewHTML}</div>`;
  }

  #renderDamage(targets) {
    const kind = this.state.dmgKind;
    const typeOptions = DAMAGE_TYPE_KEYS.map((t) =>
      `<option value="${t}" ${this.state.dmgType === t ? "selected" : ""}>${t}</option>`).join("");

    const hpLines = targets.map((a) => {
      const hp = a.system?.resources?.hp ?? {};
      return `<p class="um-line">${esc(a.name)}: HP ${hp.value ?? 0}/${hp.max ?? 0}${hp.temp ? ` (+${hp.temp} temp)` : ""}</p>`;
    }).join("");

    return `
      <div class="um-row">
        <label>Operation <select name="dmgKind" data-um-rerender>
          <option value="damage" ${kind === "damage" ? "selected" : ""}>Damage</option>
          <option value="heal" ${kind === "heal" ? "selected" : ""}>Healing</option>
          <option value="tempHP" ${kind === "tempHP" ? "selected" : ""}>Temporary HP</option>
        </select></label>
        <label>Amount / formula <input type="text" name="dmgFormula" value="${esc(this.state.dmgFormula)}" placeholder="12 or 3d6+2"></label>
        ${kind === "damage" ? `<label>Type <select name="dmgType">${typeOptions}</select></label>` : ""}
      </div>
      ${kind === "damage" ? `
        <div class="um-row">
          <label class="um-check"><input type="checkbox" name="dmgPerTarget" ${this.state.dmgPerTarget ? "checked" : ""}> Roll separately per target</label>
          <label class="um-check"><input type="checkbox" name="dmgIgnoreDefences" ${this.state.dmgIgnoreDefences ? "checked" : ""}> Ignore DR / Resistance / Immunity (GM override)</label>
          <label class="um-check"><input type="checkbox" name="dmgCritical" ${this.state.dmgCritical ? "checked" : ""}> Count as critical for Dying</label>
        </div>` : `
        <div class="um-row">
          <label class="um-check"><input type="checkbox" name="dmgPerTarget" ${this.state.dmgPerTarget ? "checked" : ""}> Roll separately per target</label>
        </div>`}
      <div class="um-currentblock">${hpLines}</div>
      <div class="um-actions">
        <button type="button" data-action="umPreview"><i class="fa-solid fa-eye"></i> Preview</button>
        <button type="button" data-action="umApplyDamage" class="um-primary"><i class="fa-solid fa-check"></i> Apply</button>
      </div>
      <div class="um-preview">${this.previewHTML}</div>`;
  }

  /** Pick one actor out of the resolved targets via a named select. */
  #actorFromTargets(targets, formKey) {
    if (!targets.find((a) => a.uuid === this.state[formKey])) {
      this.state[formKey] = targets[0]?.uuid ?? "";
    }
    return targets.find((a) => a.uuid === this.state[formKey]) ?? null;
  }

  #actorSelect(targets, formKey) {
    const options = targets.map((a) =>
      `<option value="${a.uuid}" ${this.state[formKey] === a.uuid ? "selected" : ""}>${esc(a.name)}</option>`).join("");
    return `<select name="${formKey}" data-um-rerender>${options}</select>`;
  }

  #renderItems(targets) {
    const actor = this.#actorFromTargets(targets, "itemActorUuid");
    if (!actor) return `<p class="um-note">Resolve at least one target to work with items.</p>`;

    const physical = ["weapon", "armour", "shield", "gear", "consumable", "ammunition"];
    const items = Array.from(actor.items ?? []).filter((i) => physical.includes(i.type));
    if (!items.length) {
      return `<div class="um-row"><label>Actor ${this.#actorSelect(targets, "itemActorUuid")}</label></div>
        <p class="um-note">${esc(actor.name)} carries no physical items.</p>`;
    }

    const rows = items.map((item) => {
      const hp = item.system?.hp ?? {};
      const status = itemStatus(hp.value, hp.max);
      const hardness = Number(item.system?.hardness ?? 0);
      const statusBadge = status === "intact" ? "" :
        ` <span class="um-badge">${status.toUpperCase()}</span>`;
      return `<tr>
        <td>${esc(item.name)}${statusBadge}</td>
        <td>${esc(item.type)}${item.system?.equipped ? " (equipped)" : ""}</td>
        <td>${status === "untracked" ? "—" : `${hp.value ?? 0} / ${hp.max ?? 0}`}</td>
        <td>${hardness || "—"}</td>
        <td>
          <button type="button" data-action="umDamageItem" data-item-id="${item.id}" ${status === "untracked" ? "disabled" : ""}><i class="fa-solid fa-burst"></i></button>
          <button type="button" data-action="umRepairItem" data-item-id="${item.id}" ${status === "untracked" ? "disabled" : ""}><i class="fa-solid fa-hammer"></i></button>
        </td>
      </tr>`;
    }).join("");

    return `
      <div class="um-row">
        <label>Actor ${this.#actorSelect(targets, "itemActorUuid")}</label>
        <label>Amount <input type="number" name="itemAmount" value="${esc(this.state.itemAmount)}" min="0" step="1"></label>
        <label class="um-check"><input type="checkbox" name="itemIgnoreHardness" ${this.state.itemIgnoreHardness ? "checked" : ""}> Ignore hardness</label>
      </div>
      <table class="um-table">
        <thead><tr><th>Item</th><th>Type</th><th>HP</th><th>Hardness</th><th>Damage / Repair</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="um-note">Broken at 0 HP (broken armour protects at half DR); destroyed at −50% of maximum. Repair removes Broken automatically once HP climbs above 0.</p>
      <div class="um-preview">${this.previewHTML}</div>`;
  }

  #renderTables(targets) {
    const actor = this.#actorFromTargets(targets, "tblActorUuid");
    const mode = this.state.tblMode;

    const modeSelect = `
      <label>Table <select name="tblMode" data-um-rerender>
        <option value="critical" ${mode === "critical" ? "selected" : ""}>Critical injury</option>
        <option value="fumble" ${mode === "fumble" ? "selected" : ""}>Attack fumble</option>
      </select></label>`;

    if (!actor) {
      return `<div class="um-row">${modeSelect}</div>
        <p class="um-note">Resolve at least one target — table results are applied to the selected actor.</p>`;
    }

    let controls = "";
    if (mode === "critical") {
      const typeOptions = CRITICAL_TABLE_KEYS.map((t) =>
        `<option value="${t}" ${this.state.tblDamageType === t ? "selected" : ""}>${t}</option>`).join("");
      const sevMode = this.state.tblSeverityMode;
      controls = `
        <div class="um-row">
          <label>Damage type <select name="tblDamageType">${typeOptions}</select></label>
          <label>Severity <select name="tblSeverityMode" data-um-rerender>
            <option value="minor" ${sevMode === "minor" ? "selected" : ""}>Minor (disadvantage)</option>
            <option value="serious" ${sevMode === "serious" ? "selected" : ""}>Serious</option>
            <option value="deadly" ${sevMode === "deadly" ? "selected" : ""}>Deadly (advantage)</option>
            <option value="av" ${sevMode === "av" ? "selected" : ""}>From Attack Value</option>
          </select></label>
          ${sevMode === "av" ? `
            <label>Attack Value <input type="number" name="tblAV" value="${esc(this.state.tblAV)}" step="1"></label>
            <label>Critical Resistance <input type="number" name="tblCR" value="${esc(this.state.tblCR)}" min="0" step="1"></label>` : ""}
        </div>
        <div class="um-row">
          <label>Attack bonus (for Death/Fatal DCs) <input type="number" name="tblAttackBonus" value="${esc(this.state.tblAttackBonus)}" step="1"></label>
          <label>Table modifier <input type="number" name="tblModifier" value="${esc(this.state.tblModifier)}" step="1"></label>
          <label>Direct result (blank = roll) <input type="number" name="tblForced" value="${esc(this.state.tblForced)}" min="1" max="100" step="1"></label>
        </div>`;
    } else {
      const catOptions = FUMBLE_TABLE_KEYS.map((c) =>
        `<option value="${c}" ${this.state.tblCategory === c ? "selected" : ""}>${c}</option>`).join("");
      controls = `
        <div class="um-row">
          <label>Category <select name="tblCategory">${catOptions}</select></label>
          <label>Table modifier <input type="number" name="tblModifier" value="${esc(this.state.tblModifier)}" step="1"></label>
          <label>Direct result (blank = roll) <input type="number" name="tblForced" value="${esc(this.state.tblForced)}" min="1" max="100" step="1"></label>
        </div>
        <p class="um-note">Fumble results (self-damage, conditions) apply to the selected actor — the one who fumbled.</p>`;
    }

    return `
      <div class="um-row">
        ${modeSelect}
        <label>${mode === "critical" ? "Victim" : "Fumbling actor"} ${this.#actorSelect(targets, "tblActorUuid")}</label>
      </div>
      ${controls}
      <div class="um-actions">
        <button type="button" data-action="umRollTable" class="um-primary"><i class="fa-solid fa-dice"></i> ${this.state.tblForced ? "Apply entered result" : "Roll & apply"}</button>
      </div>
      <div class="um-preview">${this.previewHTML}</div>`;
  }

  #renderPresets() {
    const presets = getModifierPresets();
    const savable = ["modify", "conditions", "damage", "tables"];
    const rows = presets.map((p) => `
      <div class="um-txn">
        <div class="um-txn-head">
          <strong>${esc(p.name)}</strong>
          <span>${esc(p.tab)} — saved by ${esc(p.savedBy)}</span>
          <span>
            <button type="button" data-action="umLoadPreset" data-preset-id="${p.id}"><i class="fa-solid fa-folder-open"></i> Load</button>
            <button type="button" data-action="umDeletePreset" data-preset-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
          </span>
        </div>
      </div>`).join("");

    return `
      <div class="um-row">
        <label>Preset name <input type="text" name="presetName" value="${esc(this.state.presetName)}" placeholder="e.g. Bless the party"></label>
        <label>Save which tab's settings <select name="presetTab">
          ${savable.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select></label>
        <button type="button" data-action="umSavePreset"><i class="fa-solid fa-floppy-disk"></i> Save preset</button>
      </div>
      <p class="um-note">Loading a preset restores its settings on the matching tab; you still choose targets and press Apply there. Presets store semantic target keys, never raw document paths.</p>
      ${rows || `<p class="um-note">No presets saved yet.</p>`}`;
  }

  #renderInspector(targets) {
    const pool = targets.length ? targets : [];
    if (!pool.find((a) => a.uuid === this.state.inspectorUuid)) {
      this.state.inspectorUuid = pool[0]?.uuid ?? "";
    }
    const actor = pool.find((a) => a.uuid === this.state.inspectorUuid) ?? null;
    if (!actor) return `<p class="um-note">Resolve at least one target to inspect.</p>`;

    const actorOptions = pool.map((a) =>
      `<option value="${a.uuid}" ${this.state.inspectorUuid === a.uuid ? "selected" : ""}>${esc(a.name)}</option>`).join("");

    const entries = listTargets(actor);
    const sections = TARGET_CATEGORIES.map((category) => {
      const inCat = entries.filter((e) => e.category === category);
      if (!inCat.length) return "";
      const rows = inCat.map((e) => {
        const read = readTarget(actor, e);
        if (e.kind === "condition") {
          if (read.value === false) return "";
          const label = read.value === true ? "active" : `value ${read.value}`;
          return `<tr><td>${esc(e.label)}</td><td>${label}</td><td>condition</td></tr>`;
        }
        const tooltip = read.tooltip ? ` title="${esc(read.tooltip)}"` : "";
        const kindLabel = e.kind === "pool" ? "derived (pool)" : e.kind === "select" ? "stored" : "stored";
        return `<tr${tooltip}><td>${esc(e.label)}</td><td>${esc(read.value)}${read.max !== null ? ` / ${read.max}` : ""}</td><td>${kindLabel}</td></tr>`;
      }).filter(Boolean).join("");
      if (!rows) return "";
      return `<details ${category === "Combat" ? "open" : ""}><summary>${category}</summary>
        <table class="um-table"><tbody>${rows}</tbody></table></details>`;
    }).join("");

    const effects = Array.from(actor.effects ?? []).map((e) => {
      const um = e.getFlag?.(SYSTEM_ID, "universalModifier") ? " <span class=\"um-badge\">UM</span>" : "";
      const state = e.disabled ? " (disabled)" : "";
      return `<p class="um-line">${esc(e.name)}${um}${state}</p>`;
    }).join("") || `<p class="um-line">No active effects.</p>`;

    return `
      <div class="um-row"><label>Actor <select name="inspectorUuid" data-um-rerender>${actorOptions}</select></label></div>
      ${sections}
      <details><summary>Active Effects</summary>${effects}</details>
      <p class="um-note">Hover a derived row for its full breakdown, including suppressed bonuses.</p>`;
  }

  #renderLog() {
    const log = getModifierLog();
    if (!log.length) return `<p class="um-note">No transactions recorded yet.</p>`;

    const rows = log.map((txn) => {
      const when = new Date(txn.ts).toLocaleString();
      const lines = (txn.summary ?? []).map((s) => `<p class="um-line">${esc(s)}</p>`).join("");
      const state = txn.undone
        ? `<span class="um-undone">undone by ${esc(txn.undoneBy ?? "GM")}</span>`
        : `<button type="button" data-action="umUndo" data-txn-id="${txn.id}"><i class="fa-solid fa-rotate-left"></i> Undo</button>`;
      return `
        <div class="um-txn ${txn.undone ? "um-txn-undone" : ""}">
          <div class="um-txn-head">
            <strong>${esc(txn.name)}</strong>
            <span>${esc(when)} — ${esc(txn.userName)}</span>
            ${state}
          </div>
          ${lines}
        </div>`;
    }).join("");

    return `<div class="um-log">${rows}</div>`;
  }

  _onRender() {
    // Re-render when a structural select changes; plain inputs are captured
    // lazily when an action fires.
    for (const el of this.element.querySelectorAll("[data-um-rerender]")) {
      el.addEventListener("change", () => {
        this.#captureForm();
        this.previewHTML = "";
        this.render();
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /*  Actions                                                            */
  /* ------------------------------------------------------------------ */

  static #onTab(event, target) {
    this.#captureForm();
    this.state.tab = target.dataset.tab;
    this.previewHTML = "";
    this.render();
  }

  static #onRefresh() {
    this.#captureForm();
    this.render();
  }

  static async #onPreview() {
    this.#captureForm();
    const targets = this.resolveTargets();
    if (!targets.length) {
      ui.notifications.warn("Universal Modifier: no targets resolved.");
      return;
    }

    const lines = [];
    if (this.state.tab === "modify") {
      const entry = this.#currentEntry(targets);
      if (!entry) return;
      for (const actor of targets) {
        const perActor = getTarget(entry.key, actor);
        if (!perActor) { lines.push(`${actor.name}: target not available.`); continue; }
        if (perActor.kind === "pool") {
          const preview = previewPoolBonus(actor, perActor, {
            value: Number(this.state.value) || 0,
            type: this.state.bonusType,
            label: this.state.label
          });
          if (preview.error) { lines.push(`${actor.name}: ${preview.error}`); continue; }
          let text = `${actor.name}: ${perActor.label} ${preview.before} → ${preview.after}`;
          if (!preview.applied) text += ` — new bonus is SUPPRESSED by a higher ${this.state.bonusType} bonus`;
          if (preview.suppresses.length) text += ` — suppresses ${preview.suppresses.join(", ")}`;
          lines.push(text);
        } else if (perActor.kind === "select") {
          const current = readTarget(actor, perActor);
          lines.push(`${actor.name}: ${perActor.label} ${current.value} → ${this.state.value}`);
        } else {
          const read = readTarget(actor, perActor);
          const preview = previewFieldChange(perActor, read.value, read.max, this.state.fieldOp, Number(this.state.value) || 0);
          lines.push(`${actor.name}: ${perActor.label} ${preview.before} → ${preview.after}${preview.clamped ? " (clamped)" : ""}`);
        }
      }
    } else if (this.state.tab === "damage") {
      const amount = await this.#resolveAmount(false);
      for (const actor of targets) {
        if (this.state.dmgKind === "damage") {
          if (this.state.dmgIgnoreDefences) {
            lines.push(`${actor.name}: ${amount} ${this.state.dmgType} — defences ignored (GM override).`);
          } else {
            const packet = resolveAgainstDefences(actor.system, {
              amount,
              type: this.state.dmgType,
              creatureTypeSystem: ownedCreatureTypeSystem(actor)
            });
            lines.push(`${actor.name}: ${packet.steps.join(" → ")} = ${packet.taken} taken${packet.immune ? " (IMMUNE)" : ""}`);
          }
        } else if (this.state.dmgKind === "heal") {
          const hp = actor.system?.resources?.hp ?? {};
          const after = Math.min(Number(hp.max ?? 0), Number(hp.value ?? 0) + amount);
          lines.push(`${actor.name}: HP ${hp.value ?? 0} → ${after} (max ${hp.max ?? 0})`);
        } else {
          const hp = actor.system?.resources?.hp ?? {};
          const after = Math.max(Number(hp.temp ?? 0), amount);
          lines.push(`${actor.name}: Temp HP ${hp.temp ?? 0} → ${after} (keep higher — temporary HP does not stack)`);
        }
      }
      if (this.state.dmgPerTarget) {
        lines.push("Note: separate rolls per target on Apply — previewed with one shared roll.");
      }
    }

    this.previewHTML = lines.map((l) => `<p class="um-line">${esc(l)}</p>`).join("");
    this.render();
  }

  static async #onApplyModifier() {
    this.#captureForm();
    if (!game.user.isGM) return;
    const targets = this.resolveTargets();
    if (!targets.length) {
      ui.notifications.warn("Universal Modifier: no targets resolved.");
      return;
    }
    const entry = this.#currentEntry(targets);
    if (!entry) return;

    const txn = beginTransaction({
      name: this.state.label || `Modify ${entry.label}`
    });

    for (const actor of targets) {
      const perActor = getTarget(entry.key, actor);
      if (!perActor) {
        txn.summary.push(`${actor.name}: SKIPPED — ${entry.label} not available on this actor.`);
        continue;
      }
      if (perActor.kind === "pool") {
        await applyPoolBonus(txn, actor, perActor, {
          value: Number(this.state.value) || 0,
          bonusType: this.state.bonusType,
          label: this.state.label || `Universal Modifier: ${perActor.label}`,
          timing: this.#timingFromForm()
        });
      } else if (perActor.kind === "select") {
        await applySelectChange(txn, actor, perActor, { value: this.state.value });
      } else {
        const read = readTarget(actor, perActor);
        const preview = previewFieldChange(perActor, read.value, read.max, this.state.fieldOp, Number(this.state.value) || 0);
        await applyFieldChange(txn, actor, perActor, {
          operation: this.state.fieldOp,
          value: Number(this.state.value) || 0,
          after: preview.after
        });
      }
    }

    await commitTransaction(txn);
    this.previewHTML = `<p class="um-line um-ok">Applied. Transaction recorded in the log.</p>`;
    this.render();
  }

  static async #onApplyCondition() {
    this.#captureForm();
    if (!game.user.isGM) return;
    const targets = this.resolveTargets();
    if (!targets.length) {
      ui.notifications.warn("Universal Modifier: no targets resolved.");
      return;
    }
    const def = CONDITIONS[this.state.conditionKey];
    if (!def) return;

    if (this.state.conditionForce && !this.state.conditionReason.trim()) {
      ui.notifications.warn("Universal Modifier: a reason is required for a GM immunity override.");
      return;
    }

    const entry = {
      key: `condition.${this.state.conditionKey}`,
      label: def.label,
      kind: "condition",
      conditionId: this.state.conditionKey,
      valued: def.valued
    };

    const remove = this.state.conditionAction === "remove";
    const rounds = Number(this.state.conditionRounds) || 0;
    const txn = beginTransaction({
      name: remove ? `Remove ${def.label}` : `Apply ${def.label}`
    });

    for (const actor of targets) {
      await applyConditionChange(txn, actor, entry, {
        remove,
        value: def.valued ? Number(this.state.conditionValue) || 1 : null,
        setExact: this.state.conditionExact,
        damageType: this.state.conditionKey === "recurring" ? this.state.conditionDamageType : null,
        force: this.state.conditionForce,
        reason: this.state.conditionReason,
        timing: rounds > 0 ? { mode: "rounds", rounds } : {}
      });
    }

    await commitTransaction(txn);
    this.previewHTML = `<p class="um-line um-ok">Done. Transaction recorded in the log.</p>`;
    this.render();
  }

  static async #onApplyDamage() {
    this.#captureForm();
    if (!game.user.isGM) return;
    const targets = this.resolveTargets();
    if (!targets.length) {
      ui.notifications.warn("Universal Modifier: no targets resolved.");
      return;
    }

    const kind = this.state.dmgKind;
    const perTarget = this.state.dmgPerTarget;
    const sharedAmount = perTarget ? null : await this.#resolveAmount(true);

    const txn = beginTransaction({
      name: kind === "damage"
        ? `Damage (${this.state.dmgType})`
        : kind === "heal" ? "Healing" : "Temporary HP"
    });

    for (const actor of targets) {
      const amount = perTarget ? await this.#resolveAmount(true) : sharedAmount;

      if (kind === "damage") {
        await recordWrapped(txn, actor, {
          paths: [
            { path: "system.resources.hp.value", label: "HP" },
            { path: "system.resources.hp.temp", label: "Temp HP" }
          ],
          statusIds: ["dying", "unconscious"]
        }, async () => {
          const { packet, applied } = await applyTypedDamage(actor, {
            amount,
            type: this.state.dmgType,
            isCritical: this.state.dmgCritical,
            ignoreDefences: this.state.dmgIgnoreDefences
          });
          const taken = packet ? packet.taken : amount;
          let text = `${actor.name}: ${amount} ${this.state.dmgType} → ${taken} taken`;
          if (packet?.immune) text = `${actor.name}: IMMUNE to ${this.state.dmgType} — no damage`;
          if (packet && !packet.immune && packet.steps?.length > 1) text += ` (${packet.steps.join(" → ")})`;
          if (this.state.dmgIgnoreDefences) text += " — defences ignored (GM override)";
          if (applied?.case && !["reduced", "absorbed"].includes(applied.case)) text += ` — ${applied.case.replaceAll("-", " ")}`;
          txn.summary.push(text);
        });
      } else if (kind === "heal") {
        const hp = actor.system?.resources?.hp ?? {};
        const before = Number(hp.value ?? 0);
        const after = Math.min(Number(hp.max ?? 0), before + amount);
        await recordWrapped(txn, actor, {
          paths: [{ path: "system.resources.hp.value", label: "HP" }]
        }, async () => {
          await actor.update({ "system.resources.hp.value": after });
        });
        txn.summary.push(`${actor.name}: healed ${after - before} (HP ${before} → ${after})`);
      } else {
        const hp = actor.system?.resources?.hp ?? {};
        const before = Number(hp.temp ?? 0);
        const after = Math.max(before, amount);
        await recordWrapped(txn, actor, {
          paths: [{ path: "system.resources.hp.temp", label: "Temp HP" }]
        }, async () => {
          await actor.update({ "system.resources.hp.temp": after });
        });
        txn.summary.push(after === before
          ? `${actor.name}: kept existing ${before} temp HP (higher than ${amount})`
          : `${actor.name}: temp HP ${before} → ${after}`);
      }
    }

    await commitTransaction(txn);
    this.previewHTML = `<p class="um-line um-ok">Done. Transaction recorded in the log.</p>`;
    this.render();
  }

  /** The form keys each tab's preset snapshot captures. */
  static PRESET_KEYS = {
    modify: ["category", "targetKey", "bonusType", "value", "label", "fieldOp",
      "durationMode", "durationRounds", "durationAmount", "durationUnit"],
    conditions: ["conditionKey", "conditionAction", "conditionValue", "conditionExact",
      "conditionDamageType", "conditionForce", "conditionReason", "conditionRounds"],
    damage: ["dmgKind", "dmgFormula", "dmgType", "dmgPerTarget", "dmgIgnoreDefences", "dmgCritical"],
    tables: ["tblMode", "tblDamageType", "tblSeverityMode", "tblAV", "tblCR",
      "tblAttackBonus", "tblModifier", "tblCategory"]
  };

  static async #onDamageItem(event, target) {
    await this.#itemOperation(target.dataset.itemId, "damage");
  }

  static async #onRepairItem(event, target) {
    await this.#itemOperation(target.dataset.itemId, "repair");
  }

  async #itemOperation(itemId, operation) {
    this.#captureForm();
    if (!game.user.isGM) return;
    const targets = this.resolveTargets();
    const actor = targets.find((a) => a.uuid === this.state.itemActorUuid) ?? targets[0];
    const item = actor?.items?.get?.(itemId);
    if (!item) return;

    const amount = Math.max(0, Number(this.state.itemAmount) || 0);
    const hp = item.system?.hp ?? {};
    const before = Number(hp.value ?? 0);
    const max = Number(hp.max ?? 0);
    let after;
    let summary;

    if (operation === "damage") {
      // REDUCED BY DR, NOT `hardness` (3.573.0). Chapter 6: "each time
      // an item takes HP damage, reduce it by an amount equal to the
      // items DR." This read `system.hardness`, which is 0 on all
      // twenty-six armour and all twelve shields in the pack — so the GM
      // tool applied every point in full while the item sheet's own
      // Damage button, reading `system.dr` on the same item, did not.
      // Two buttons, one item, two answers.
      //
      // `hardness` is left in place and still shown: the rulebook does
      // use the word elsewhere (vehicles, Repair's fumble clause), so
      // the field is not meaningless — it is simply not what page 146
      // says reduces item damage. The larger of the two is taken so a
      // world that HAS populated hardness is not quietly downgraded.
      const dr = Math.max(
        Number(item.system?.dr ?? 0) || 0,
        Number(item.system?.hardness ?? 0) || 0
      );
      const reduction = this.state.itemIgnoreHardness ? 0 : dr;
      after = applyItemDamage(before, amount, reduction);
      const got = before - after;
      summary = `${actor.name}: ${item.name} takes ${got} damage` +
        `${reduction ? ` (${amount} − DR ${reduction})` : ""} — HP ${before} → ${after}` +
        ` [${itemStatus(after, max)}]`;
    } else {
      // "A DESTROYED ITEM CAN'T BE REPAIRED" (Chapter 6, Item Damage).
      // The Crafting-Repair path has always refused one; this arm did
      // not, so a destroyed sword could be clicked back to full.
      if (itemStatus(before, max) === "destroyed") {
        ui.notifications?.warn(
          `${item.name} is destroyed — a destroyed item can't be Repaired.`
        );
        return;
      }
      after = Math.min(max, before + amount);
      summary = `${actor.name}: ${item.name} repaired ${after - before} — HP ${before} → ${after}` +
        ` [${itemStatus(after, max)}]`;
      if (before <= 0 && after > 0) summary += " — Broken removed";
    }

    const txn = beginTransaction({
      name: operation === "damage" ? `Item damage: ${item.name}` : `Repair: ${item.name}`
    });
    await applyItemUpdate(txn, actor, item, { path: "system.hp.value", after, label: item.name });
    txn.summary.push(summary);
    await commitTransaction(txn);
    this.previewHTML = `<p class="um-line um-ok">${esc(summary)}</p>`;
    this.render();
  }

  static async #onRollTable() {
    this.#captureForm();
    if (!game.user.isGM) return;
    const targets = this.resolveTargets();
    const actor = targets.find((a) => a.uuid === this.state.tblActorUuid) ?? targets[0];
    if (!actor) {
      ui.notifications.warn("Universal Modifier: no target actor for the table result.");
      return;
    }

    const forced = String(this.state.tblForced ?? "").trim();
    const forcedValue = forced === "" ? null : Number(forced);

    if (this.state.tblMode === "critical") {
      const { severity, note } = resolveSeverityInput({
        severity: this.state.tblSeverityMode === "av" ? "" : this.state.tblSeverityMode,
        av: this.state.tblAV,
        criticalResistance: this.state.tblCR
      });
      if (!severity) {
        this.previewHTML = `<p class="um-line">${esc(note)}</p>`;
        this.render();
        return;
      }
      const txn = beginTransaction({ name: `Critical injury (${this.state.tblDamageType}, ${severity})` });
      await criticalTransaction(txn, {
        targetActor: actor,
        damageType: this.state.tblDamageType,
        severity,
        attackBonus: Number(this.state.tblAttackBonus) || 0,
        modifier: Number(this.state.tblModifier) || 0,
        forcedResult: forcedValue
      });
      await commitTransaction(txn);
    } else {
      const txn = beginTransaction({ name: `Fumble (${this.state.tblCategory})` });
      await fumbleTransaction(txn, {
        actor,
        category: this.state.tblCategory,
        modifier: Number(this.state.tblModifier) || 0,
        forcedRoll: forcedValue
      });
      await commitTransaction(txn);
    }

    this.previewHTML = `<p class="um-line um-ok">Table result applied and recorded — see chat and the log.</p>`;
    this.render();
  }

  static async #onSavePreset() {
    this.#captureForm();
    const tab = this.element.querySelector("[name=presetTab]")?.value ?? "modify";
    const keys = UniversalModifierApp.PRESET_KEYS[tab] ?? [];
    const snapshot = {};
    for (const key of keys) snapshot[key] = this.state[key];
    if (!this.state.presetName.trim()) {
      ui.notifications.warn("Universal Modifier: give the preset a name.");
      return;
    }
    await saveModifierPreset({ name: this.state.presetName.trim(), tab, form: snapshot });
    this.state.presetName = "";
    this.render();
  }

  static async #onLoadPreset(event, target) {
    this.#captureForm();
    const preset = getModifierPresets().find((p) => p.id === target.dataset.presetId);
    if (!preset) return;
    Object.assign(this.state, preset.form ?? {});
    this.state.tab = preset.tab;
    this.previewHTML = `<p class="um-line um-ok">Preset "${esc(preset.name)}" loaded — choose targets and apply.</p>`;
    this.render();
  }

  static async #onDeletePreset(event, target) {
    this.#captureForm();
    await deleteModifierPreset(target.dataset.presetId);
    this.render();
  }

  static async #onUndo(event, target) {
    this.#captureForm();
    if (!game.user.isGM) return;
    const txnId = target.dataset.txnId;

    let result = await undoTransaction(txnId);
    if (!result.ok && result.conflicts.length) {
      const { DialogV2 } = foundry.applications.api;
      const proceed = await DialogV2.confirm({
        window: { title: "Undo conflicts detected" },
        classes: ["trg-prime"],
        content: `<div class="trg-prime"><p>The world has changed since this transaction:</p>
          ${result.conflicts.map((c) => `<p style="margin:2px 0">• ${esc(c)}</p>`).join("")}
          <p><strong>Force the undo anyway?</strong> Later changes to these values will be overwritten.</p></div>`,
        rejectClose: false
      });
      if (proceed) result = await undoTransaction(txnId, { force: true });
    }

    if (result.ok) ui.notifications.info("Universal Modifier: transaction undone.");
    else if (result.conflicts.length) ui.notifications.warn(result.conflicts[0]);
    this.render();
  }

  /** Resolve the damage/heal amount, rolling dice formulas as needed. */
  async #resolveAmount(postRoll) {
    const raw = String(this.state.dmgFormula ?? "").trim() || "0";
    if (/^\d+$/.test(raw)) return Number(raw);
    try {
      const roll = new Roll(raw);
      await roll.evaluate();
      if (postRoll) {
        await roll.toMessage({
          flavor: "Universal Modifier",
          whisper: game.users.filter((u) => u.isGM).map((u) => u.id)
        });
      }
      return Math.max(0, Math.floor(roll.total));
    } catch {
      ui.notifications.warn(`Universal Modifier: cannot evaluate "${raw}" — using 0.`);
      return 0;
    }
  }
}

/** Singleton opener — the toolbar, sheet button, macro and API all use this. */
let appInstance = null;

export function openUniversalModifier({ actor = null } = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn("The Universal Modifier is a GM tool.");
    return null;
  }
  if (!appInstance) appInstance = new UniversalModifierApp();
  if (actor) {
    if (actor.isToken || !game.actors?.get(actor.id)) {
      appInstance.pinnedActor = actor;
      appInstance.state.targetMode = "pinned";
    } else {
      appInstance.state.targetMode = "actor";
      appInstance.state.pickedActorId = actor.id;
    }
  }
  appInstance.render({ force: true });
  return appInstance;
}
