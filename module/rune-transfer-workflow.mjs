/**
 * Transfer Runes — the Foundry side: the setup chooser, the rune
 * actually moving between two items, and the destruction the printed
 * outcomes call for.
 *
 * WHY THE DESTRUCTION IS CONFIRMED RATHER THAN SILENT. Every other
 * printed consequence in this project is applied without asking, and
 * this one nearly was. It is different in one respect that matters: it
 * DELETES A DOCUMENT. A condition applied wrongly is a click to undo; an
 * enchanted greatsword deleted wrongly is gone from the sheet and has to
 * be rebuilt by hand. So the rule is applied — the dialog opens by
 * itself, at the moment the degree is known, naming exactly what the
 * book says is lost, and destroying is its default button — but a GM who
 * was mid-way through explaining a house ruling gets to say no. The card
 * records which of the two happened, so nothing is quietly skipped.
 */
import {
  TRANSFER_SOURCES,
  TRANSFER_TIME_DEFAULT,
  TRANSFER_TIME_OPTIONS,
  addRuneEntry,
  removeRuneEntry,
  sourceKind,
  splitRuneEntries,
  transferDCIncrease,
  transferOutcome,
  transferSources,
  transferTargets
} from "./rune-transfer.mjs";

const SYSTEM_ID = "trg-prime";

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * The setup: which rune, off what, onto what, and how fast.
 *
 * Source and rune are ONE control rather than two. A rune only exists on
 * an item, so "which rune" already answers "off what", and two selects
 * that can disagree with each other is two selects that eventually will.
 *
 * @param {Actor} actor
 * @returns {Promise<object|null>} null if cancelled or impossible.
 */
export async function promptRuneTransfer(actor) {
  const { DialogV2 } = foundry.applications.api;
  const items = Array.from(actor?.items ?? []);
  const sources = transferSources(items);
  const targets = transferTargets(items);

  if (!sources.length) {
    ui.notifications.warn(
      `${actor?.name ?? "This character"} carries nothing with a rune on it to transfer.`
    );
    return null;
  }
  if (!targets.length) {
    ui.notifications.warn(
      `${actor?.name ?? "This character"} carries no weapon, armour or shield that could receive a rune.`
    );
    return null;
  }

  const runeOptions = sources
    .flatMap(({ item, entries }) =>
      entries.map(
        (entry) =>
          `<option value="${esc(item.id)}::${esc(entry)}">${esc(entry)} — ${esc(item.name)}</option>`
      )
    )
    .join("");
  const targetOptions = targets
    .map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`)
    .join("");
  const timeRows = TRANSFER_TIME_OPTIONS.map(
    (option) =>
      `<label style="display:flex;align-items:center;gap:8px;margin:3px 0;cursor:pointer">` +
      `<input type="radio" name="transferTime" value="${option.key}"` +
      `${option.key === TRANSFER_TIME_DEFAULT ? " checked" : ""} style="margin:0">` +
      `<span>${option.label} <span style="opacity:.7">(${
        option.dcIncrease ? `DC +${option.dcIncrease}` : "no increase"
      })</span></span>` +
      `</label>`
  ).join("");

  const result = await DialogV2.wait({
    window: { title: "Transfer Runes", icon: "fa-solid fa-gem" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <div class="form-group">
        <label for="trg-transfer-rune">Rune to transfer</label>
        <select id="trg-transfer-rune" name="rune" style="width:100%">${runeOptions}</select>
      </div>
      <div class="form-group">
        <label for="trg-transfer-target">Transfer it to</label>
        <select id="trg-transfer-target" name="target" style="width:100%">${targetOptions}</select>
      </div>
      <p class="hint" style="margin:8px 0 4px">Time spent</p>
      ${timeRows}
      <p class="hint" style="font-size:.82em;margin:6px 0 0">Transferring from an item rather than a runestone adds a further DC +5 — and on a Failure it destroys the item you transferred from.</p>
    </div>`,
    buttons: [
      {
        action: "transfer",
        label: "Begin",
        icon: "fa-solid fa-gem",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          return {
            rune: root?.querySelector?.('[name="rune"]')?.value ?? "",
            target: root?.querySelector?.('[name="target"]')?.value ?? "",
            timeKey:
              root?.querySelector?.('input[name="transferTime"]:checked')?.value
              ?? TRANSFER_TIME_DEFAULT
          };
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });

  if (!result || result === "cancel") return null;

  const separator = String(result.rune ?? "").indexOf("::");
  if (separator < 0) return null;
  const sourceId = result.rune.slice(0, separator);
  const entry = result.rune.slice(separator + 2);
  const source = actor.items.get(sourceId);
  const target = actor.items.get(result.target);
  if (!source || !target) return null;
  if (source.id === target.id) {
    ui.notifications.warn("A rune cannot be transferred to the item it is already on.");
    return null;
  }

  const kind = sourceKind(source);
  const time = TRANSFER_TIME_OPTIONS.find((option) => option.key === result.timeKey)
    ?? TRANSFER_TIME_OPTIONS[0];
  return {
    sourceId: source.id,
    sourceName: source.name,
    targetId: target.id,
    targetName: target.name,
    entry,
    kind,
    timeKey: time.key,
    timeLabel: time.label,
    dcIncrease: transferDCIncrease({ timeKey: time.key, source: kind })
  };
}

/**
 * "This will be destroyed" — named, and answerable.
 *
 * @param {string[]} names
 * @returns {Promise<boolean>}
 */
export async function confirmRuneDestruction(names = []) {
  if (!names.length) return false;
  const { DialogV2 } = foundry.applications.api;
  const list = names.map((name) => `<li>${esc(name)}</li>`).join("");
  const result = await DialogV2.wait({
    window: { title: "Transfer Runes — destruction", icon: "fa-solid fa-triangle-exclamation" },
    classes: ["trg-prime"],
    position: { width: 400 },
    content: `<div class="trg-prime trg-check-dialog">
      <p style="margin:0 0 4px">The result destroys the following:</p>
      <ul style="margin:2px 0 6px;padding-left:20px">${list}</ul>
      <p class="hint" style="font-size:.82em;margin:0">Destroying deletes ${
        names.length === 1 ? "it" : "them"
      } from the sheet. Declining leaves ${names.length === 1 ? "it" : "them"} in place for the GM to handle.</p>
    </div>`,
    buttons: [
      {
        action: "destroy",
        label: names.length === 1 ? "Destroy it" : "Destroy them",
        icon: "fa-solid fa-fire",
        default: true
      },
      { action: "keep", label: "Leave it to the GM", icon: "fa-solid fa-hand" }
    ],
    rejectClose: false
  });
  return result === "destroy";
}

/**
 * Apply a resolved Transfer Runes check.
 *
 * @param {Actor} actor
 * @param {string} degreeKey
 * @param {object} setup The object promptRuneTransfer returned.
 * @returns {Promise<{lines: string[]}>}
 */
export async function applyRuneTransfer(actor, degreeKey, setup) {
  if (!actor || !setup) return { lines: [] };
  const outcome = transferOutcome(degreeKey, { source: setup.kind });
  const lines = [outcome.text];

  const source = actor.items.get(setup.sourceId);
  const target = actor.items.get(setup.targetId);

  if (outcome.transferred && source && target) {
    await source.update({ "system.runes": removeRuneEntry(source.system?.runes ?? "", setup.entry) });
    await target.update({ "system.runes": addRuneEntry(target.system?.runes ?? "", setup.entry) });
    lines.push(
      `<strong>${esc(setup.entry)}</strong> moves from ${esc(setup.sourceName)} to <strong>${esc(setup.targetName)}</strong>.`
    );
  }

  if (outcome.crackSource && source) {
    await source.setFlag(SYSTEM_ID, "runestoneCracked", true);
    lines.push(`<em>${esc(setup.sourceName)} is cracked and can never store a rune again.</em>`);
  }

  const doomed = [];
  if (outcome.destroySource && source) doomed.push(source);
  if (outcome.destroyTarget && target) doomed.push(target);
  if (doomed.length) {
    const destroy = await confirmRuneDestruction(doomed.map((item) => item.name));
    if (destroy) {
      await actor.deleteEmbeddedDocuments("Item", doomed.map((item) => item.id));
      lines.push(
        `<em style="color:#b00">Destroyed: ${doomed.map((item) => esc(item.name)).join(", ")}.</em>`
      );
    } else {
      lines.push(
        `<em>The GM declined the destruction of ${doomed
          .map((item) => esc(item.name))
          .join(", ")} — apply it by hand if you change your mind.</em>`
      );
    }
  }

  return { lines };
}

/** Exposed so the workflow can describe a setup on the card before rolling. */
export function runeTransferNote(setup) {
  if (!setup) return null;
  const between = setup.kind === TRANSFER_SOURCES.ITEM;
  const parts = [
    `Transferring <strong>${esc(setup.entry)}</strong> from ${esc(setup.sourceName)} to ${esc(setup.targetName)} over ${esc(setup.timeLabel)}`
  ];
  if (setup.dcIncrease > 0) {
    parts.push(
      `difficulty increased by ${setup.dcIncrease}${
        between ? " (including +5 for an item-to-item transfer)" : ""
      }`
    );
  }
  return `<em>${parts.join(" — ")}.</em>`;
}

/** Whether an item still has the entry it is about to give up. */
export function stillHasEntry(item, entry) {
  return splitRuneEntries(item?.system?.runes ?? "").includes(String(entry ?? "").trim());
}
