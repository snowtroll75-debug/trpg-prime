import { readPath } from "./registry.mjs";
import { applyConditionTags, formatAppliedTags } from "../combat/effect-application-workflow.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";

/**
 * The Universal Modifier transaction engine.
 *
 * Every operation the Universal Modifier performs — typed bonuses, field
 * changes, conditions, damage, healing — becomes one transaction: a set of
 * recorded changes that succeed together, appear in the audit log together,
 * and can be undone together (spec Sections 5, 22).
 *
 * Undo is exact and conflict-aware: each change stores the before AND after
 * state, and undo refuses (without `force`) when the current state no longer
 * matches the recorded after-state — i.e. something else changed the value
 * since, and silently restoring the before-image would destroy that change.
 *
 * The log lives in a world setting so it survives reloads and is shared by
 * all GM clients. It is capped; the oldest entries fall off the end.
 */

const SYSTEM_ID = "trg-prime";
const LOG_SETTING = "modifierLog";
const LOG_CAP = 120;

export const TXN_FLAG = "modifierTxn";
export const UM_FLAG = "universalModifier";

const PRESET_SETTING = "modifierPresets";

/** Register the world settings that store the audit log and presets. */
export function registerModifierSettings() {
  game.settings.register(SYSTEM_ID, LOG_SETTING, {
    name: "Universal Modifier Audit Log",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
  game.settings.register(SYSTEM_ID, PRESET_SETTING, {
    name: "Universal Modifier Presets",
    scope: "world",
    config: false,
    type: Array,
    default: []
  });
}

/** Read the saved presets. */
export function getModifierPresets() {
  try {
    const presets = game.settings.get(SYSTEM_ID, PRESET_SETTING);
    return Array.isArray(presets) ? presets : [];
  } catch {
    return [];
  }
}

/**
 * Save a preset: a named snapshot of one tab's configuration, referring to
 * semantic target keys and registry identifiers only (spec §21 — never raw
 * document paths that could go stale).
 */
export async function saveModifierPreset({ name, tab, form }) {
  const presets = getModifierPresets();
  presets.unshift({
    id: foundry.utils.randomID(),
    name: String(name || "Preset"),
    tab,
    form,
    savedBy: game.user?.name ?? "GM",
    ts: Date.now(),
    systemVersion: game.system?.version ?? null
  });
  await game.settings.set(SYSTEM_ID, PRESET_SETTING, presets.slice(0, 60));
  return presets[0];
}

/** Delete a preset by id. */
export async function deleteModifierPreset(id) {
  const presets = getModifierPresets().filter((p) => p.id !== id);
  await game.settings.set(SYSTEM_ID, PRESET_SETTING, presets);
}

/** Read the audit log (newest first). */
export function getModifierLog() {
  try {
    const log = game.settings.get(SYSTEM_ID, LOG_SETTING);
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

async function writeModifierLog(log) {
  await game.settings.set(SYSTEM_ID, LOG_SETTING, log.slice(0, LOG_CAP));
}

/* -------------------------------------------------------------------------- */
/*  Building transactions                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Begin a transaction. Changes are appended by the apply* helpers below and
 * the whole thing is persisted by commitTransaction.
 * @param {{name: string}} options
 */
export function beginTransaction({ name }) {
  return {
    id: foundry.utils.randomID(),
    ts: Date.now(),
    userId: game.user?.id ?? null,
    userName: game.user?.name ?? "GM",
    name: String(name || "Universal Modifier"),
    targets: [],
    changes: [],
    summary: [],
    undone: false
  };
}

function noteTarget(txn, actor) {
  const uuid = actor.uuid;
  if (!txn.targets.find((t) => t.uuid === uuid)) {
    txn.targets.push({ uuid, name: actor.name });
  }
}

/** Two stored values are "the same" for conflict detection. */
export function valuesMatch(a, b) {
  if (typeof a === "number" || typeof b === "number") {
    return Number(a ?? 0) === Number(b ?? 0);
  }
  return (a ?? null) === (b ?? null);
}

function effectSnapshot(actor, statusId) {
  return Array.from(actor.effects ?? [])
    .filter((e) => statusId === "*" ? (e.statuses?.size ?? 0) > 0 : e.statuses?.has?.(statusId))
    .map((e) => e.toObject());
}

function statusEffectIds(actor, statusId) {
  return Array.from(actor.effects ?? [])
    .filter((e) => statusId === "*" ? (e.statuses?.size ?? 0) > 0 : e.statuses?.has?.(statusId))
    .map((e) => e.id);
}

/** Compare two condition-effect snapshots for conflict detection. */
export function snapshotsMatch(a = [], b = []) {
  if (a.length !== b.length) return false;
  const key = (e) => `${e._id}:${e.flags?.[SYSTEM_ID]?.value ?? ""}:${e.disabled ? 1 : 0}`;
  const setA = a.map(key).sort().join("|");
  const setB = b.map(key).sort().join("|");
  return setA === setB;
}

/* -------------------------------------------------------------------------- */
/*  Apply helpers — each performs the mutation AND records it                  */
/* -------------------------------------------------------------------------- */

/**
 * Duration options for effect-based modifiers.
 * mode: "permanent" | "rounds" | "time"
 * Returns {flagUpdates, duration, summaryNote}
 */
export function resolveTiming({ mode = "permanent", rounds = 0, seconds = 0 } = {}) {
  const result = { flags: {}, duration: null, note: null };

  if (mode === "rounds" && rounds > 0) {
    const combat = game.combat?.started ? game.combat : null;
    if (combat) {
      result.flags.conditionExpiresRound = (combat.round ?? 0) + Number(rounds);
      result.duration = { rounds: Number(rounds) };
      result.note = `${rounds} round${rounds === 1 ? "" : "s"}`;
    } else {
      // No active combat: fall back to world time at 6 seconds a round so the
      // effect still expires rather than silently becoming permanent.
      const secs = Number(rounds) * 6;
      result.flags.spellEffect = true;
      result.flags.spellEffectEnd = Number(game.time?.worldTime ?? 0) + secs;
      result.duration = { seconds: secs };
      result.note = `${rounds} round${rounds === 1 ? "" : "s"} (no combat — expires after ${secs}s of world time)`;
    }
  } else if (mode === "time" && seconds > 0) {
    result.flags.spellEffect = true;
    result.flags.spellEffectEnd = Number(game.time?.worldTime ?? 0) + Number(seconds);
    result.duration = { seconds: Number(seconds) };
    result.note = formatSeconds(seconds);
  } else {
    result.note = "permanent (until removed)";
  }
  return result;
}

function formatSeconds(seconds) {
  const s = Number(seconds) || 0;
  if (s % 3600 === 0) return `${s / 3600} hour${s === 3600 ? "" : "s"}`;
  if (s % 60 === 0) return `${s / 60} minute${s === 60 ? "" : "s"}`;
  return `${s} seconds`;
}

/**
 * Apply a typed bonus to a pool target by creating an Active Effect whose
 * CUSTOM change routes through the Appendix 1 pools.
 */
export async function applyPoolBonus(txn, actor, entry, {
  value, bonusType = "untyped", label, timing = {}
}) {
  noteTarget(txn, actor);
  const timingResolved = resolveTiming(timing);
  const name = label || `${txn.name}: ${entry.label}`;

  const effectData = {
    name,
    img: Number(value) >= 0 ? "icons/svg/upgrade.svg" : "icons/svg/downgrade.svg",
    changes: [{
      key: `${entry.path}.${bonusType}`,
      type: CHANGE_TYPE.CUSTOM,
      value: String(Number(value) || 0),
      priority: 20
    }],
    flags: {
      [SYSTEM_ID]: {
        [UM_FLAG]: true,
        [TXN_FLAG]: txn.id,
        ...timingResolved.flags
      }
    }
  };
  if (timingResolved.duration) {
    effectData.duration = {
      ...timingResolved.duration,
      startTime: Number(game.time?.worldTime ?? 0)
    };
  }

  const [effect] = await actor.createEmbeddedDocuments("ActiveEffect", [effectData]);
  txn.changes.push({
    kind: "effectCreated",
    actorUuid: actor.uuid,
    actorName: actor.name,
    effectId: effect.id,
    effectName: name
  });
  const signedValue = Number(value) >= 0 ? `+${Number(value)}` : String(Number(value));
  txn.summary.push(`${actor.name}: ${signedValue} ${bonusType} to ${entry.label} — ${timingResolved.note}`);
  return effect;
}

/**
 * Apply a direct field change (add or set) to a stored source value.
 */
export async function applyFieldChange(txn, actor, entry, {
  operation = "add", value = 0, after: precomputedAfter = null
}) {
  noteTarget(txn, actor);
  const before = Number(readPath(actor, entry.path) ?? 0);
  let after = precomputedAfter;
  if (after === null || after === undefined) {
    after = operation === "set" ? Number(value) : before + Number(value);
    if (entry.min !== undefined && after < entry.min) after = entry.min;
  }

  await actor.update({ [entry.path]: after });
  txn.changes.push({
    kind: "update",
    actorUuid: actor.uuid,
    actorName: actor.name,
    path: entry.path,
    label: entry.label,
    before,
    after
  });
  txn.summary.push(`${actor.name}: ${entry.label} ${before} → ${after}`);
  return after;
}

/** Apply a select-field change (e.g. size category). */
export async function applySelectChange(txn, actor, entry, { value }) {
  noteTarget(txn, actor);
  const before = readPath(actor, entry.path) ?? null;
  await actor.update({ [entry.path]: value });
  txn.changes.push({
    kind: "update",
    actorUuid: actor.uuid,
    actorName: actor.name,
    path: entry.path,
    label: entry.label,
    before,
    after: value
  });
  txn.summary.push(`${actor.name}: ${entry.label} ${before ?? "—"} → ${value}`);
  return value;
}

/**
 * Apply or remove a condition through the system's own choke point
 * (Actor#toggleStatusEffect / applyConditionTags), snapshotting the
 * condition's effect documents before and after for exact undo.
 *
 * options:
 *   remove      Remove the condition instead of applying it.
 *   value       Value for valued conditions.
 *   setExact    Overwrite the value outright rather than raise-to-at-least.
 *   damageType  For Recurring Damage.
 *   force       GM override of immunity (recorded).
 *   reason      Required note when force is used.
 *   timing      Duration options (rounds only meaningfully supported).
 */
export async function applyConditionChange(txn, actor, entry, {
  remove = false, value = null, setExact = false, damageType = null,
  force = false, reason = "", timing = {}
} = {}) {
  noteTarget(txn, actor);
  const statusId = entry.conditionId;
  const before = effectSnapshot(actor, statusId);
  let resultNote = "";

  if (remove) {
    await actor.toggleStatusEffect(statusId, { active: false });
    resultNote = `${entry.label} removed`;
  } else if (actor.isImmuneToCondition?.(statusId) && !force) {
    // Prevention is reported, never silent (spec: Non-Negotiable Boundaries).
    txn.summary.push(`${actor.name}: IMMUNE to ${entry.label} — not applied (override available)`);
    txn.changes.push({
      kind: "prevented",
      actorUuid: actor.uuid,
      actorName: actor.name,
      label: entry.label,
      why: "immune"
    });
    return { prevented: true };
  } else if (entry.valued && setExact && value !== null) {
    await actor.toggleStatusEffect(statusId, {
      active: true, value: Number(value), damageType: damageType ?? undefined, force
    });
    resultNote = `${entry.label} set to ${value}`;
  } else {
    const timingResolved = resolveTiming(timing);
    const tags = [{
      key: statusId,
      label: entry.label,
      value: entry.valued ? Number(value ?? 1) : null,
      ...(damageType ? { damageType } : {})
    }];
    const applied = await applyConditionTags(actor, tags, {
      expiresRound: timingResolved.flags.conditionExpiresRound ?? null
    });
    resultNote = formatAppliedTags(applied);
    if (timingResolved.flags.conditionExpiresRound) resultNote += ` — ${timingResolved.note}`;
  }

  const after = effectSnapshot(actor, statusId);
  txn.changes.push({
    kind: "conditionSnapshot",
    actorUuid: actor.uuid,
    actorName: actor.name,
    statusId,
    label: entry.label,
    before,
    after,
    ...(force ? { forced: true, reason } : {})
  });
  txn.summary.push(`${actor.name}: ${resultNote}${force ? ` (GM override: ${reason || "no reason given"})` : ""}`);
  return { prevented: false };
}

/**
 * Apply a change to an embedded item and record it for undo.
 */
export async function applyItemUpdate(txn, actor, item, { path, after, label }) {
  noteTarget(txn, actor);
  const before = foundry.utils.getProperty(item, path);
  await item.update({ [path]: after });
  txn.changes.push({
    kind: "itemUpdate",
    actorUuid: actor.uuid,
    actorName: actor.name,
    itemId: item.id,
    itemName: item.name,
    path,
    label: label ?? item.name,
    before,
    after
  });
  return after;
}

/**
 * Run an arbitrary mutation while recording before/after for the listed
 * value paths and condition statuses. This is how compound operations
 * (damage, healing, table results) become undoable without re-implementing
 * their logic. Pass statusIds: ["*"] to watch every condition at once —
 * used for table rolls whose condition output is not known in advance.
 *
 * @param {object} txn
 * @param {Actor} actor
 * @param {{paths?: Array<{path: string, label: string}>, statusIds?: string[]}} watch
 * @param {Function} mutate Async function performing the real work.
 */
export async function recordWrapped(txn, actor, { paths = [], statusIds = [] } = {}, mutate) {
  noteTarget(txn, actor);
  const beforeValues = paths.map((p) => ({ ...p, before: readPath(actor, p.path) ?? 0 }));
  const beforeStatuses = statusIds.map((id) => ({ id, before: effectSnapshot(actor, id) }));

  const result = await mutate();

  for (const p of beforeValues) {
    const after = readPath(actor, p.path) ?? 0;
    if (valuesMatch(p.before, after)) continue;
    txn.changes.push({
      kind: "update",
      actorUuid: actor.uuid,
      actorName: actor.name,
      path: p.path,
      label: p.label,
      before: p.before,
      after
    });
  }
  for (const s of beforeStatuses) {
    const after = effectSnapshot(actor, s.id);
    if (snapshotsMatch(s.before, after)) continue;
    txn.changes.push({
      kind: "conditionSnapshot",
      actorUuid: actor.uuid,
      actorName: actor.name,
      statusId: s.id,
      label: s.id,
      before: s.before,
      after
    });
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/*  Commit, chat and undo                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Persist a transaction to the audit log and (optionally) post a GM-whispered
 * chat card summarising it.
 */
export async function commitTransaction(txn, { chat = true } = {}) {
  if (!txn.changes.length && !txn.summary.length) return null;

  const log = getModifierLog();
  log.unshift(txn);
  await writeModifierLog(log);

  if (chat) {
    const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
    const lines = txn.summary.map((s) => `<p style="margin:2px 0">${foundry.utils.escapeHTML(s)}</p>`).join("");
    await ChatMessage.create({
      whisper: gmIds,
      speaker: { alias: "Universal Modifier" },
      content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">${foundry.utils.escapeHTML(txn.name)}</h3>${lines}<p style="margin:4px 0 0 0; font-size: 0.85em; opacity: 0.8">Transaction ${txn.id} — undo from the Universal Modifier log.</p></div>`
    });
  }
  return txn;
}

/**
 * Undo a transaction by id.
 *
 * @param {string} txnId
 * @param {{force?: boolean}} options force = restore before-images even where
 *   the current state no longer matches the recorded after-state.
 * @returns {Promise<{ok: boolean, conflicts: string[], notes: string[]}>}
 */
export async function undoTransaction(txnId, { force = false } = {}) {
  const log = getModifierLog();
  const txn = log.find((t) => t.id === txnId);
  if (!txn) return { ok: false, conflicts: ["Transaction not found in the log."], notes: [] };
  if (txn.undone) return { ok: false, conflicts: ["Transaction is already undone."], notes: [] };

  const conflicts = [];
  const notes = [];

  // First pass: detect conflicts so undo is all-or-nothing unless forced.
  for (const change of txn.changes) {
    const actor = await fromUuid(change.actorUuid);
    if (!actor) {
      conflicts.push(`${change.actorName}: actor no longer exists (${change.actorUuid}).`);
      continue;
    }
    if (change.kind === "update") {
      const current = readPath(actor, change.path);
      if (!valuesMatch(current, change.after)) {
        conflicts.push(`${change.actorName}: ${change.label ?? change.path} is now ${current}, expected ${change.after} — changed since this transaction.`);
      }
    } else if (change.kind === "itemUpdate") {
      const item = actor.items?.get?.(change.itemId);
      if (!item) {
        conflicts.push(`${change.actorName}: item "${change.itemName}" no longer exists.`);
      } else {
        const current = foundry.utils.getProperty(item, change.path);
        if (!valuesMatch(current, change.after)) {
          conflicts.push(`${change.actorName}: ${change.itemName} ${change.path} is now ${current}, expected ${change.after} — changed since this transaction.`);
        }
      }
    } else if (change.kind === "conditionSnapshot") {
      const current = effectSnapshot(actor, change.statusId);
      if (!snapshotsMatch(current, change.after)) {
        conflicts.push(`${change.actorName}: ${change.label} effects changed since this transaction.`);
      }
    }
  }

  if (conflicts.length && !force) return { ok: false, conflicts, notes };

  // Second pass: apply the reversal, newest change first.
  for (const change of [...txn.changes].reverse()) {
    const actor = await fromUuid(change.actorUuid);
    if (!actor) continue;

    if (change.kind === "update") {
      await actor.update({ [change.path]: change.before });
      notes.push(`${change.actorName}: ${change.label ?? change.path} restored to ${change.before}.`);
    } else if (change.kind === "itemUpdate") {
      const item = actor.items?.get?.(change.itemId);
      if (item) {
        await item.update({ [change.path]: change.before });
        notes.push(`${change.actorName}: ${change.itemName} restored to ${change.before}.`);
      } else {
        notes.push(`${change.actorName}: item "${change.itemName}" is gone — nothing to restore.`);
      }
    } else if (change.kind === "effectCreated") {
      const effect = actor.effects.get(change.effectId);
      if (effect) {
        await effect.delete();
        notes.push(`${change.actorName}: removed "${change.effectName}".`);
      } else {
        notes.push(`${change.actorName}: "${change.effectName}" was already gone.`);
      }
    } else if (change.kind === "conditionSnapshot") {
      const currentIds = statusEffectIds(actor, change.statusId);
      if (currentIds.length) await actor.deleteEmbeddedDocuments("ActiveEffect", currentIds);
      if (change.before.length) {
        await actor.createEmbeddedDocuments("ActiveEffect", change.before, { keepId: true });
      }
      notes.push(`${change.actorName}: ${change.label} restored to its prior state.`);
    }
  }

  txn.undone = true;
  txn.undoneTs = Date.now();
  txn.undoneBy = game.user?.name ?? "GM";
  await writeModifierLog(log);

  const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
  await ChatMessage.create({
    whisper: gmIds,
    speaker: { alias: "Universal Modifier" },
    content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">Undone: ${foundry.utils.escapeHTML(txn.name)}</h3>${notes.map((n) => `<p style="margin:2px 0">${foundry.utils.escapeHTML(n)}</p>`).join("")}</div>`
  });

  return { ok: true, conflicts, notes };
}
