/**
 * Refreshing owned items from the compendium they came from.
 *
 * When a compendium item's statistics change — as the whole armour table
 * did in 3.97.0 — the compendium updates on install but every copy already
 * sitting in a character's inventory keeps its old numbers, because those
 * copies are independent documents. This walks the world and brings them
 * back into line.
 *
 * The hard part is not copying the numbers across. It is knowing which
 * fields are the item's *statistics* (which the rulebook owns, and which
 * should be refreshed) and which are the *state of this particular copy*
 * (which the player owns, and which must survive untouched). Getting that
 * wrong un-equips armour mid-combat, heals a shield that was nearly broken,
 * or silently deletes an expert Mithril customisation. So the split is
 * explicit and conservative, every change is previewed before anything is
 * written, and nothing runs without the GM confirming what they can see.
 *
 * This is deliberately not part of migration.mjs. That handles schema
 * changes and runs itself on world load; this is a content refresh, it is
 * a judgement call whether a given world wants it, and it only ever runs
 * when a human asks for it.
 */
import { clearKnownPrerequisiteNames } from "./picker-workflow.mjs";
import { packExtendsSystem } from "./content-packs.mjs";
import { PRESERVED_FIELDS, leafName, preserveSpent } from "./refresh-ownership.mjs";
import {
  computeFullCustomisation,
  computeItemWeight,
  computeArmourModifiers,
  computeShieldModifiers,
  computeWeaponModifiers
} from "./item-quality.mjs";
import { parseGrantList } from "./grants.mjs";
import { deletionValue } from "./deletion.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * WHICH FIELDS THE PLAYER OWNS now lives in `module/refresh-ownership.mjs`
 * — pure, importable, and therefore checkable. It moved at 3.406.1 after
 * a missing entry (`prepared`) meant a refresh proposed un-preparing every
 * prepared spell in the world; the rule was pure all along and sat in this
 * file, which no harness can import. See that file's header.
 */
/**
 * Paths holding "how much of this is left", where the maximum belongs to
 * the rulebook and the current value belongs to the player.
 *
 * Refreshing the maximum and copying the current value across with it
 * silently refills a half-used set of healer's tools — which is exactly
 * what the first live run of this migration proposed to do. The rule is:
 * the amount *spent* is what survives, so the maximum can move without
 * inventing or destroying charges.
 */
const CONSUMED_PAIRS = Object.freeze(["hp", "uses"]);

/**
 * Fields the customisation system computes rather than copies. Refreshing
 * these from the compendium directly would throw away the quality tier's
 * contribution; instead the new compendium value becomes the new *base*
 * and the customisation is recomputed on top of it.
 */
const DERIVED_FROM_BASE = Object.freeze(["itemLevel", "price", "weight", "hp.max"]);

/** Item types that carry a customisable base. */
const CUSTOMISABLE_TYPES = Object.freeze(["weapon", "armour", "shield"]);

/**
 * Item types whose effects and content flags are AUTHORED — generated
 * from a data table into the pack, never hand-made on a character — and
 * so are safe to replace wholesale on refresh.
 *
 * Everything a race, heritage, background, feat or ability actually DOES
 * lives in those two places. Equipment is excluded on purpose: a GM may
 * hang their own effect on a specific sword, and refresh must not eat it.
 */
const EFFECT_SYNCED_TYPES = Object.freeze([
  "race", "heritage", "background", "feat", "ability", "class", "divine-aspect", "wizard-school",
  "creature-type"
]);

/**
 * Item types whose PORTRAIT a refresh replaces with the compendium's.
 *
 * A superset of EFFECT_SYNCED_TYPES, and deliberately a separate list
 * rather than the same one: the two questions are not the same question.
 * "Is this item's mechanical payload authored?" excludes equipment,
 * because a GM may hang their own effect on one specific sword. "Is this
 * item's picture the rulebook's?" now includes equipment, because as of
 * 3.231.0 every weapon, armour, shield and spell in the packs carries
 * bespoke art instead of a Foundry core placeholder, and Graham's ruling
 * on this release was that an existing character's gear should pick that
 * art up rather than keep the placeholder until the item is re-added.
 *
 * The cost of that ruling, stated plainly because it is real: anyone who
 * hand-picked their own image for an owned weapon, armour, shield or
 * spell loses it the next time Refresh Items runs. Effects and flags on
 * those four are still untouched — only the picture moves.
 */
const PORTRAIT_SYNCED_TYPES = Object.freeze([
  ...EFFECT_SYNCED_TYPES, "weapon", "armour", "shield", "spell"
]);

/**
 * Content flags a refresh must never remove, because they belong to the
 * CHARACTER rather than to the compendium entry: who granted this item,
 * and what a heritage took away when it landed. The compendium copy has
 * neither, so a plain "delete what the source doesn't have" sweep would
 * strip both and orphan the cleanup contract.
 *
 * `baseCustomisation` is the refresh's own record of an item's
 * pre-customisation state, written further down for weapons, armour and
 * shields. It is here for that reason and to close a latent trap: without
 * it the flag sweep would target `flags.trg-prime.baseCustomisation` for
 * deletion in the same update that writes it — and since Foundry 14 (see
 * the sweep below), a deletion and an assignment to the same key are the
 * SAME object property, so whichever runs later in this function would
 * silently win over the other. The two blocks are gated on disjoint type
 * lists today, so nothing pairs them yet — but "nothing pairs them yet"
 * is not a guarantee worth relying on twice; that trap has now cost this
 * system two bugs.
 */
export const PRESERVED_FLAGS = Object.freeze([
  "grantedBy", "abilitiesRemoved", "baseCustomisation"
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * The item's *stored* system data, not its prepared data.
 *
 * Documents carry derived fields on `system` that were never written to
 * the database — totalWeight is one — and diffing prepared against prepared
 * puts those in the report and then writes them. Plain objects (test
 * fixtures, and raw pack JSON) are returned as they are.
 */
function storedSystem(document) {
  if (typeof document?.toObject === "function") return document.toObject().system ?? {};
  return document?.system ?? {};
}

/**
 * Carry a spent amount across a change of maximum: what was used stays
 * used, and an item whose maximum was never initialised comes back full.
 */
/**
 * Flatten a system object to dotted paths so two versions can be compared
 * field by field without caring how deeply nested any of them are.
 */
function flatten(source, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(source ?? {})) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isObject(value)) Object.assign(out, flatten(value, path));
    else out[path] = value;
  }
  return out;
}

/**
 * Locate the compendium document an owned item came from.
 *
 * Prefers the recorded source UUID, which survives renaming. Falls back to
 * a name match within the packs this system ships, which is how items added
 * before the source was recorded are found — and which is why a rename
 * breaks the link and the item is reported as unmatched rather than
 * silently skipped.
 */
async function findSource(item, packsByType) {
  const uuid = item._stats?.compendiumSource;
  if (uuid) {
    try {
      // foundry.utils.fromUuid in V13+, the bare global before it. Same
      // fallback shape the system already uses for loadTemplates.
      const resolve = foundry.utils?.fromUuid ?? globalThis.fromUuid;
      const document = await resolve(uuid);
      if (document) return { document, matchedBy: "source" };
    } catch (error) {
      console.warn(`TRG Prime | Could not resolve ${uuid} for "${item.name}"`, error);
    }
  }

  const candidates = packsByType.get(item.type) ?? [];
  const matches = candidates.filter((entry) => entry.name === item.name);
  if (matches.length === 1) {
    const document = await matches[0].pack.getDocument(matches[0]._id);
    if (document) return { document, matchedBy: "name" };
  }
  // Two compendium items sharing a name is ambiguous, and guessing which
  // one an inventory item descends from is exactly the kind of quiet
  // wrong answer this whole exercise exists to avoid.
  if (matches.length > 1) return { document: null, matchedBy: "ambiguous" };
  return { document: null, matchedBy: "none" };
}

/**
 * Index every item in this system's packs by type, so a name fallback
 * doesn't have to load every document in the world's compendiums.
 */
export async function indexSystemPacks() {
  // The prerequisite gate memoises every feat and ability name for the
  // session. A refresh is the one thing that can change that list while
  // a world is open, so it is dropped here rather than left stale — a
  // renamed feat would otherwise go on gating under its old name until
  // somebody reloaded.
  clearKnownPrerequisiteNames();
  const packsByType = new Map();
  // MODULE PACKS INDEX TOO (3.560.0) — any Item pack that extends one of
  // ours, by manifest flag or runtime registration, is part of the same
  // federation the choosers read, so a refresh must see it as well.
  for (const pack of game.packs ?? []) {
    if (pack.metadata?.type !== "Item") continue;
    if (pack.metadata?.packageName !== SYSTEM_ID && !packExtendsSystem(pack)) continue;
    const index = await pack.getIndex({ fields: ["type"] });
    for (const entry of index) {
      if (!entry.type) continue;
      if (!packsByType.has(entry.type)) packsByType.set(entry.type, []);
      packsByType.get(entry.type).push({ ...entry, pack });
    }
  }
  return packsByType;
}

/**
 * Recompute an item's customisation against a new base.
 *
 * @returns {object|null} Dotted-path updates, or null if the item is not
 *   customisable or carries no customisation worth recomputing.
 */
function recomputeCustomisation(item, source, base) {
  if (!CUSTOMISABLE_TYPES.includes(item.type)) return null;

  const own = storedSystem(item);
  const src = storedSystem(source);

  const choice = {
    quality: own.quality || "standard",
    material: own.material || "",
    traitKeys: parseGrantList(own.superiorTraits || "")
  };

  const result = computeFullCustomisation(item.type, {
    level: base.level,
    price: base.price,
    hp: base.hp,
    weight: base.weight,
    // system.size is the CREATURE size ("medium" on every shield), not
    // the shield's; its size is its category. See computeFullCustomisation.
    category: src.category ?? own.category ?? ""
  }, choice);

  const updates = {
    "system.itemLevel": result.effectiveLevel,
    "system.price": result.price,
    "system.weight": result.weight,
    [`flags.${SYSTEM_ID}.baseCustomisation`]: base
  };

  if (own.hp) {
    updates["system.hp.max"] = result.hpMax;
    updates["system.hp.value"] = preserveSpent(own.hp.value, own.hp.max, result.hpMax);
  }

  return updates;
}

/**
 * Work out what would change on one owned item, without changing it.
 *
 * @returns {{changes: object[], updates: object}|null}
 */
export function planItemRefresh(item, source, options = {}) {
  const { refreshDescriptions = false } = options;

  const ownSystem = storedSystem(item);
  const sourceSystem = storedSystem(source);
  const current = flatten(ownSystem);
  const incoming = flatten(sourceSystem);

  const changes = [];
  const updates = {};

  const record = (path, from, to) => {
    // Arrays and objects are compared by VALUE. `flatten` treats an array
    // as a leaf, so a class's twenty-row progression table reached here
    // as two array references — never `===`, so every refresh reported it
    // as changed and printed "[object Object],[object Object]" twenty
    // times into the GM's confirmation dialog for a table that had not
    // moved. Primitives are unaffected.
    if (from === to) return;
    if (typeof from === "object" || typeof to === "object") {
      if (JSON.stringify(from ?? null) === JSON.stringify(to ?? null)) return;
    }
    changes.push({ path, from, to });
    updates[`system.${path}`] = to;
  };

  for (const [path, value] of Object.entries(incoming)) {
    const leaf = leafName(path);
    if (PRESERVED_FIELDS.includes(leaf)) continue;
    // On a customisable item these are recomputed from the base further
    // down. On everything else — gear, consumables, ammunition — there is
    // no customisation to recompute, so the compendium's figure applies
    // directly and skipping it here would leave gear prices and weights
    // permanently stale.
    if (DERIVED_FROM_BASE.includes(path) && CUSTOMISABLE_TYPES.includes(item.type)) continue;
    // Handled by the spent-preserving pass below, not copied across.
    if (CONSUMED_PAIRS.some((pair) => path === `${pair}.value`)) continue;
    if (path === "description" && !refreshDescriptions) continue;

    // A field the compendium has and this item doesn't is almost always a
    // template addition rather than a content change; adding it is right.
    record(path, current[path], value);
  }

  // Maximums move with the rulebook; what has been spent against them
  // stays spent. hp on a customisable item is dealt with by the
  // customisation pass instead, which knows the customised maximum.
  for (const pair of CONSUMED_PAIRS) {
    if (pair === "hp" && CUSTOMISABLE_TYPES.includes(item.type)) continue;
    const incomingMax = incoming[`${pair}.max`];
    if (incomingMax === undefined || !isObject(ownSystem[pair])) continue;
    record(
      `${pair}.value`,
      current[`${pair}.value`],
      preserveSpent(current[`${pair}.value`], current[`${pair}.max`], incomingMax)
    );
  }

  // The customisation-derived values, handled through the base rather than
  // copied across.
  if (CUSTOMISABLE_TYPES.includes(item.type)) {
    const existingBase = item.flags?.[SYSTEM_ID]?.baseCustomisation;
    const newBase = {
      level: sourceSystem.itemLevel ?? 0,
      price: sourceSystem.price ?? 0,
      hp: sourceSystem.hp?.max ?? 0,
      weight: sourceSystem.weight ?? 0
    };
    // A SPECIFIC ITEM'S FIGURES ARE THE PAGE'S FINAL ONES (3.615.0, R3 of
    // block 36): its master or expert quality is part of what was printed,
    // not a customisation to be priced on top — so it takes the
    // compendium's figures directly, like any uncustomised item.
    const specific = Boolean(item.flags?.[SYSTEM_ID]?.specificItem ?? source?.flags?.[SYSTEM_ID]?.specificItem);
    const customised = !specific && (
      (ownSystem.quality && ownSystem.quality !== "standard") ||
      Boolean(ownSystem.material && ownSystem.material !== sourceSystem.material) ||
      Boolean(ownSystem.superiorTraits) ||
      Boolean(existingBase));

    if (customised) {
      const recomputed = recomputeCustomisation(item, source, newBase);
      for (const [path, value] of Object.entries(recomputed ?? {})) {
        if (!path.startsWith("system.")) {
          updates[path] = value;
          continue;
        }
        record(path.slice("system.".length), current[path.slice("system.".length)], value);
      }
    } else {
      // Uncustomised: the compendium's own figures apply directly.
      for (const path of DERIVED_FROM_BASE) {
        const value = path === "hp.max" ? sourceSystem.hp?.max : sourceSystem[path];
        if (value === undefined) continue;
        record(path, current[path], value);
      }
      if (sourceSystem.hp?.max !== undefined && isObject(ownSystem.hp)) {
        record(
          "hp.value",
          current["hp.value"],
          preserveSpent(current["hp.value"], current["hp.max"], sourceSystem.hp.max)
        );
      }
    }
  }

  // Transferred effects and content flags, for the item types whose whole
  // mechanical behaviour lives in them.
  //
  // Refresh copied `system.*` and nothing else, which was fine while
  // foundation items were inert text. The Chapter 2 batches changed that:
  // a Soldier background on a live sheet is `effects: []` from 3.35.1, and
  // a refresh that updated its description to promise "+1 class bonus to
  // Athletics, Culture, Intimidate" while leaving no effect behind would
  // be worse than not refreshing it at all — the sheet would state a rule
  // it does not apply.
  //
  // Scoped to types whose effects are authored, never hand-made. A weapon
  // or armour may carry a GM's own rider, so those stay untouched.
  if (EFFECT_SYNCED_TYPES.includes(item.type)) {
    const ownEffects = ownEffectData(item);
    const sourceEffects = ownEffectData(source);
    if (JSON.stringify(ownEffects.map(effectSignature)) !==
      JSON.stringify(sourceEffects.map(effectSignature))) {
      changes.push({
        path: "effects",
        from: `${ownEffects.length} effect(s)`,
        to: `${sourceEffects.length} effect(s)`
      });
      updates.effects = sourceEffects;
    }
    const own = item.flags?.[SYSTEM_ID] ?? {};
    const incomingFlags = source.flags?.[SYSTEM_ID] ?? {};
    const ownFlags = JSON.stringify(own);
    const sourceFlags = JSON.stringify(incomingFlags);
    if (ownFlags !== sourceFlags) {
      changes.push({ path: `flags.${SYSTEM_ID}`, from: ownFlags, to: sourceFlags });
      // Per-KEY, not a whole-namespace replace. The first version paired
      // `flags.-=trg-prime` with `flags.trg-prime` in one update, and the
      // two cancelled: the delete won, the item ended with NO content
      // flags at all, and a refreshed chooser background lost the prompt
      // its Use button reads. Proved live on a simulated legacy Soldier.
      //
      // So: set what the compendium has, and force-delete only the keys
      // it no longer has. Nothing is both set and deleted in the same
      // update.
      for (const [key, value] of Object.entries(incomingFlags)) {
        updates[`flags.${SYSTEM_ID}.${key}`] = value;
      }
      for (const key of Object.keys(own)) {
        if (key in incomingFlags) continue;
        // Provenance is the ACTOR's record of where this item came from,
        // not authored content — refresh must never strip it.
        if (PRESERVED_FLAGS.includes(key)) continue;
        // Foundry 14 deprecated the `-=key: null` deletion syntax in
        // favour of the plain key taking the ForcedDeletion sentinel as
        // its value — the old spelling now warns on every refresh.
        updates[`flags.${SYSTEM_ID}.${key}`] = deletionValue();
      }
    }
  }

  // The portrait, on its OWN list rather than nested inside the effects
  // block above. Added 3.222.4 (when the race pack gained real portraits
  // and every race item already on a character was still the generic
  // mystery-man placeholder), it sat inside the EFFECT_SYNCED_TYPES
  // branch because at the time those were exactly the types with
  // authored art. 3.231.0 gave bespoke art to armour, shields, weapons
  // and all 692 spells too, and those four are excluded from effect
  // syncing for an unrelated reason — a GM's own rider on one specific
  // sword. Keeping the icon nested would have tied "your sword keeps the
  // effect you added" to "your sword keeps the placeholder icon," which
  // are not the same promise. See PORTRAIT_SYNCED_TYPES above.
  if (PORTRAIT_SYNCED_TYPES.includes(item.type) && item.img !== source.img) {
    changes.push({ path: "img", from: item.img, to: source.img });
    updates.img = source.img;
  }

  if (!changes.length) return null;
  return { changes, updates };
}

/** An item's effects as plain data, from a document or a plain object. */
function ownEffectData(item) {
  const effects = typeof item?.toObject === "function" ? item.toObject().effects : item?.effects;
  return Array.isArray(effects) ? effects : Array.from(effects ?? []);
}

/**
 * What makes two authored effects "the same" for refresh purposes.
 *
 * Deliberately not a whole-object compare: `disabled` is the player's
 * (they may have switched a passive off), and ids differ between the
 * compendium copy and the embedded one on older items. Name, changes and
 * system flags are the content.
 */
function effectSignature(effect) {
  return JSON.stringify({
    name: effect?.name ?? "",
    changes: (effect?.changes ?? []).map((c) => ({
      key: c?.key ?? "",
      // A V14 change's own field is the string `type` (key/type/value/
      // phase/priority/effect); `mode` is now a deprecated numeric
      // COMPATIBILITY GETTER on the prototype, and reading it warns. Read
      // explicitly rather than spread either way — a spread would still
      // silently drop a prototype getter and compare every effect equal
      // on this field alone.
      type: c?.type,
      value: String(c?.value ?? ""),
      priority: c?.priority ?? null
    })),
    flags: effect?.flags?.[SYSTEM_ID] ?? {}
  });
}

/**
 * Every document that owns items and might need refreshing: world actors,
 * the unlinked actors that live on scene tokens, and loose world items.
 */
function refreshTargets({ actorIds = null } = {}) {
  const targets = [];

  for (const actor of game.actors ?? []) {
    if (actorIds && !actorIds.includes(actor.id)) continue;
    targets.push({ owner: actor, label: actor.name, kind: "actor" });
  }

  // Unlinked token actors are separate documents with their own items, and
  // are the single easiest thing to miss — a mistake already made once in
  // this project, when damage applied to a token actor was looked for on
  // the base actor and reported as not applied at all.
  for (const scene of game.scenes ?? []) {
    for (const token of scene.tokens ?? []) {
      if (token.actorLink) continue;
      const actor = token.actor;
      if (!actor) continue;
      if (actorIds && !actorIds.includes(actor.id)) continue;
      targets.push({
        owner: actor,
        label: `${actor.name} (token on ${scene.name})`,
        kind: "token"
      });
    }
  }

  if (!actorIds) {
    for (const item of game.items ?? []) {
      targets.push({ owner: null, item, label: item.name, kind: "world-item" });
    }
  }

  return targets;
}

/**
 * Survey the world and report everything that would change.
 *
 * Reads only. Nothing is written by this function, which is what makes it
 * safe to run first and always.
 */
export async function previewRefresh(options = {}) {
  const packsByType = await indexSystemPacks();
  const report = {
    scanned: 0,
    changed: [],
    unmatched: [],
    ambiguous: [],
    unchanged: 0
  };

  const inspect = async (item, ownerLabel) => {
    report.scanned++;
    const { document: source, matchedBy } = await findSource(item, packsByType);
    if (matchedBy === "ambiguous") {
      report.ambiguous.push({ owner: ownerLabel, name: item.name, type: item.type });
      return;
    }
    if (!source) {
      report.unmatched.push({ owner: ownerLabel, name: item.name, type: item.type });
      return;
    }
    const plan = planItemRefresh(item, source, options);
    if (!plan) {
      report.unchanged++;
      return;
    }
    report.changed.push({
      owner: ownerLabel,
      ownerId: item.parent?.id ?? null,
      itemId: item.id,
      name: item.name,
      type: item.type,
      matchedBy,
      ...plan
    });
  };

  for (const target of refreshTargets(options)) {
    if (target.kind === "world-item") {
      await inspect(target.item, "World items directory");
      continue;
    }
    for (const item of target.owner.items ?? []) {
      await inspect(item, target.label);
    }
  }

  return report;
}

/**
 * Apply a preview report. Takes the report rather than re-deriving it, so
 * what gets written is exactly what the GM was shown and approved.
 */
export async function applyRefresh(report) {
  const byParent = new Map();

  for (const entry of report.changed) {
    const key = entry.ownerId ?? "__world__";
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push({ _id: entry.itemId, ...entry.updates });
  }

  let updated = 0;
  for (const [key, updates] of byParent) {
    if (key === "__world__") {
      await Item.implementation.updateDocuments(updates);
      updated += updates.length;
      continue;
    }
    const actor =
      game.actors?.get(key) ??
      game.scenes?.contents.flatMap((s) => s.tokens.contents).find((t) => t.actor?.id === key)?.actor;
    if (!actor) {
      console.warn(`TRG Prime | Refresh: owner ${key} vanished before the update was applied.`);
      continue;
    }
    await actor.updateEmbeddedDocuments("Item", updates);
    updated += updates.length;
  }

  return { updated };
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]
  );
}

function formatValue(value) {
  if (value === undefined) return "<em>not set</em>";
  if (value === "") return "<em>empty</em>";
  return escapeHTML(value);
}

/** Render a preview report as HTML for the confirmation dialog. */
export function renderReport(report) {
  if (!report.changed.length) {
    return `<p>Scanned ${report.scanned} owned items. Everything already matches the compendium.</p>`;
  }

  const rows = report.changed
    .map((entry) => {
      const fields = entry.changes
        .map(
          (change) =>
            `<li><strong>${escapeHTML(change.path)}</strong>: ${formatValue(change.from)} → ${formatValue(change.to)}</li>`
        )
        .join("");
      const matched = entry.matchedBy === "name" ? " <em>(matched by name)</em>" : "";
      return `
        <li>
          <strong>${escapeHTML(entry.name)}</strong> — ${escapeHTML(entry.owner)}${matched}
          <ul>${fields}</ul>
        </li>`;
    })
    .join("");

  const notes = [];
  if (report.unmatched.length) {
    notes.push(
      `<p><strong>${report.unmatched.length} item(s) could not be matched to a compendium entry</strong> and will be left alone: ${escapeHTML(
        report.unmatched.map((u) => `${u.name} (${u.owner})`).join(", ")
      )}. These are usually renamed or hand-made items.</p>`
    );
  }
  if (report.ambiguous.length) {
    notes.push(
      `<p><strong>${report.ambiguous.length} item(s) matched more than one compendium entry by name</strong> and will be left alone: ${escapeHTML(
        report.ambiguous.map((u) => u.name).join(", ")
      )}.</p>`
    );
  }

  return `
    <div class="trg-prime compendium-refresh-report">
      <p>
        Scanned ${report.scanned} owned items. ${report.changed.length} would change,
        ${report.unchanged} already match.
      </p>
      <p>
        Equipped state, quantity, quality, special materials, superior traits and
        expended uses are preserved. Where a maximum changes, the amount already
        spent or damaged against it is carried across unchanged.
      </p>
      <ul class="refresh-rows">${rows}</ul>
      ${notes.join("")}
    </div>`;
}

/**
 * The GM-facing entry point: survey, show exactly what would change, and
 * write only on confirmation.
 */
export async function openRefreshDialog(options = {}) {
  if (!game.user?.isGM) {
    ui.notifications.warn("Only the GM can refresh items from the compendium.");
    return null;
  }

  ui.notifications.info("TRG Prime | Scanning owned items…");
  const report = await previewRefresh(options);

  if (!report.changed.length) {
    await foundry.applications.api.DialogV2.prompt({
      window: { title: "Refresh Items from Compendium" },
      classes: ["trg-prime"],
      content: renderReport(report),
      ok: { label: "Close" },
      position: { width: 620 },
      rejectClose: false
    });
    return report;
  }

  // Explicit buttons rather than DialogV2.confirm, so that Cancel is the
  // default and closing the window is the same as cancelling. A migration
  // that writes to every actor in the world should never be one stray
  // Enter keypress away.
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: "Refresh Items from Compendium", icon: "fa-solid fa-arrows-rotate" },
    classes: ["trg-prime"],
    content: renderReport(report),
    // No fixed HEIGHT. A fixed 640 clipped the buttons off the bottom
    // once the report was long enough, so the dialog could not be
    // confirmed at all; the list scrolls inside itself instead (see
    // .refresh-rows in the stylesheet).
    position: { width: 620 },
    buttons: [
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark", default: true },
      {
        action: "apply",
        label: `Update ${report.changed.length} item(s)`,
        icon: "fa-solid fa-check"
      }
    ],
    rejectClose: false
  });

  if (choice !== "apply") {
    ui.notifications.info("TRG Prime | Refresh cancelled. Nothing was changed.");
    return report;
  }

  const { updated } = await applyRefresh(report);
  ui.notifications.info(`TRG Prime | Refreshed ${updated} item(s) from the compendium.`);
  console.info("TRG Prime | Compendium refresh applied", report);
  return report;
}

