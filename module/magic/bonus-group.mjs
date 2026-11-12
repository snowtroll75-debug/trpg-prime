/**
 * ONE EFFECT FOR SEVERAL BONUS SLOTS (3.685.1; Eldritch Arts 0.10.0's live
 * test, finding 6). Pure; no Foundry.
 *
 * Eldritch Arts' Distracted (Q157) is −1 status to attack checks, every skill,
 * the three saves and Spellcraft. A `bonus` row names ONE slot, so it was six
 * rows and six effects on the creature's Effects tab, each "Animate Moustache
 * (Distracted)". A row may now name several:
 *
 *   { kind: "bonus", target: "targets", slots: ["attack", "allSkills",
 *     "fortitude", "reflex", "will", "spellcraft"], bonusType: "status",
 *     value: -1, name: "Distracted", refresh: true }
 *
 * One effect is laid, carrying one change per slot (`allSkills` and
 * `allSpeeds` expanded against the creature, as for a single row), with the
 * spell's timing and the cast's id, so it ends with the spell.
 *
 *   name     the effect's name in place of "Spell (note)" — the creature's
 *            sheet shows "Distracted".
 *   refresh  a second application FROM THE SAME SPELL replaces the first,
 *            rather than standing beside it. The key is the group's name and
 *            the spell's and the caster's (review, 3.685.1): Animate Moustache's minute is not
 *            cut short by Bubble Buffet's turn, nor ended by dismissing it —
 *            each spell keeps its own one "Distracted". Two of them never
 *            make −2: same-type penalties do not stack (Appendix 1), on every
 *            pool. The effect carries `refreshKey`; the new effect is created
 *            first, and only then is the elder of the same key removed, so a
 *            failed create loses nothing.
 *
 * Default-off: a row without `slots` is the single-slot row it always was.
 */

const SYSTEM_ID = "trg-prime";
const text = (v) => String(v ?? "").trim();

/**
 * @param {object} row a spell `bonus` row
 * @returns {null|{slots: string[], name: string, refreshKey: string}}
 */
export function normaliseBonusGroup(row) {
  if (!row || row.kind !== "bonus" || !Array.isArray(row.slots)) return null;
  const slots = [...new Set(row.slots.map(text).filter(Boolean))];
  if (!slots.length) return null;
  const name = text(row.name);
  return { slots, name, refreshKey: row.refresh === true ? (name || slots.join("+")).toLowerCase() : "" };
}

/**
 * The change keys one group lays on a creature, in slot order: each slot's
 * pooled path and the bonus type. `allSkills` and `allSpeeds` expand into the
 * creature's own skills and speeds; a slot with nowhere to land is named in
 * `refused` and laid nowhere.
 *
 * @param {{slots: string[]}} group
 * @param {object} deps
 * @param {(slot: string) => (string|null)} deps.targetFor `bonusTargetFor`
 * @param {string[]} [deps.skillKeys] the creature's skills
 * @param {string[]} [deps.speedKeys] the creature's speeds
 * @param {string} [deps.bonusType]
 * @returns {{keys: string[], refused: string[]}}
 */
export function bonusGroupKeys(group, { targetFor, skillKeys = [], speedKeys = [], bonusType = "status", allSkills = "allSkills", allSpeeds = "allSpeeds" } = {}) {
  const keys = [];
  const refused = [];
  const type = text(bonusType) || "status";
  for (const slot of group?.slots ?? []) {
    const expanded = slot === allSkills ? skillKeys.map((k) => targetFor(k))
      : slot === allSpeeds ? speedKeys.map((k) => targetFor(k))
        : [targetFor(slot)];
    const placed = expanded.filter(Boolean);
    if (!placed.length) { refused.push(slot); continue; }
    for (const path of placed) {
      const key = `${path}.${type}`;
      if (!keys.includes(key)) keys.push(key);
    }
  }
  return { keys, refused };
}

/**
 * What the cast card names: "attacks, every skill check, Fortitude saves,
 * Reflex saves, Will saves and Spellcraft", from the slots' own words.
 *
 * @param {string[]} slots
 * @param {Record<string, string>} labels the slot words ("to attacks")
 */
export function bonusGroupWords(slots = [], labels = {}) {
  const words = (slots ?? []).map((s) => String(labels?.[s] ?? `to ${s}`).replace(/^to /, ""));
  return words.length > 1 ? `${words.slice(0, -1).join(", ")} and ${words.at(-1)}` : (words[0] ?? "");
}

/**
 * The key an applied group carries: its name, the spell's and the caster's,
 * or "" when the row does not refresh.
 * "distracted@animate moustache@Actor.abc". KEYED TO THE CASTER TOO
 * (re-review): two casters' Animate Moustache on one creature are two
 * effects, so dismissing one does not strip the other's minute; a caster
 * casting it again refreshes their own.
 *
 * @param {{refreshKey: string}} group
 * @param {string} spellName
 * @param {string} [casterUuid]
 */
export function bonusGroupRefreshKey(group, spellName, casterUuid = "") {
  if (!group?.refreshKey) return "";
  return [group.refreshKey, text(spellName).toLowerCase(), text(casterUuid)].filter(Boolean).join("@");
}

/** An effect's refresh key, or "". */
const refreshKeyOf = (effect) => text(effect?.flags?.[SYSTEM_ID]?.refreshKey).toLowerCase();

/**
 * The ids of the creature's effects that new effects refresh: those carrying
 * a refresh key one of the new effects carries. Empty when none of the new
 * effects has a key — the ordinary creation, unchanged.
 *
 * @param {Iterable<object>} existing the creature's effects
 * @param {object[]} incoming the effect data about to be created
 * @returns {string[]}
 */
export function refreshedEffectIds(existing, incoming) {
  const wanted = new Set((Array.isArray(incoming) ? incoming : [incoming]).map(refreshKeyOf).filter(Boolean));
  if (!wanted.size) return [];
  return Array.from(existing ?? []).filter((e) => e?.id && wanted.has(refreshKeyOf(e))).map((e) => e.id);
}
