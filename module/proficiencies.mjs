/**
 * What a character is PROFICIENT with, gathered from everywhere that
 * says so.
 *
 * Nothing displayed this. The class prints an armour-and-weapons
 * sentence, several feats grant a category, a heritage can grant a
 * whole weapon group, a divine aspect grants its favoured weapon, and
 * the attack workflow reads all of it when it decides whether to apply
 * the -4 non-proficiency penalty — but the sheet showed none of it, so
 * the penalty appeared on a roll with nothing on the character to
 * explain it. Reported by Graham.
 *
 * Pure, so the harness runs it rather than grepping the sheet.
 */

import { classProficiencyEntry, deityWeaponsApply } from "./proficiency-rules.mjs";

const SYSTEM_ID = "trg-prime";

/**
 * Feats that grant a proficiency, keyed by normalised name.
 *
 * The book states each as its own feat rather than as a category with a
 * parameter, so this is a lookup rather than a parse — and a feat added
 * later is a line of data.
 */
export const PROFICIENCY_FEATS = Object.freeze({
  "armour proficiency, light": { kind: "armour", label: "Light armour" },
  "armour proficiency, medium": { kind: "armour", label: "Medium armour" },
  "armour proficiency, heavy": { kind: "armour", label: "Heavy armour" },
  "shield proficiency, light": { kind: "shield", label: "Light shields" },
  "shield proficiency, heavy": { kind: "shield", label: "Heavy shields" },
  "shield proficiency, tower": { kind: "shield", label: "Tower shields" }
  // "Weapon Proficient" is deliberately absent. It grants ONE named
  // weapon, chosen when the feat is taken and recorded on a choice
  // effect — so it is picked up below with the other effects, where the
  // weapon's actual name is, rather than listed here as a category.
});

/**
 * Every proficiency feat in the pack, checked against the lookup above.
 *
 * The first draft of that table invented four feats that do not exist —
 * "Shield Proficiency", "Martial Weapon Proficiency" and two more — so
 * four of its eight entries could never have fired. Named here so the
 * harness can hold the two lists together.
 */
export const PROFICIENCY_FEAT_NAMES = Object.freeze(Object.keys(PROFICIENCY_FEATS));

const normalise = (value) => String(value ?? "").trim().toLowerCase();

/**
 * Everything the character is proficient with, by where it came from.
 *
 * @param {object} actor
 * @returns {{classLine: string, entries: Array<{label: string, source: string, kind: string}>}}
 */
export function proficiencySummary(actor) {
  const items = Array.from(actor?.items ?? []);
  const entries = [];
  const seen = new Set();
  const add = (label, source, kind) => {
    const key = `${normalise(label)}|${normalise(source)}`;
    if (!label || seen.has(key)) return;
    seen.add(key);
    entries.push({ label, source, kind });
  };

  // The class's printed sentence — the bulk of it, and the only part
  // that is prose rather than a list.
  const classItem = items.find((i) => i.type === "class");
  const classLine = String(classItem?.system?.proficiencies ?? "").trim();

  // Feats that grant one outright.
  for (const item of items) {
    if (item.type !== "feat") continue;
    const grant = PROFICIENCY_FEATS[normalise(item.name)];
    if (grant) add(grant.label, item.name, grant.kind);
  }

  // A divine aspect's favoured weapon: "you add this weapon to your list
  // of those with which you are proficient." Only where the rules engine
  // grants it (3.623.0, R10) — listed for everyone, the panel disagreed
  // with the roll.
  const deityWeapons = deityWeaponsApply(classProficiencyEntry(classItem?.name)?.entry, items);
  for (const item of deityWeapons ? items : []) {
    if (item.type !== "divine-aspect") continue;
    const weapon = String(item.system?.favouredWeapon ?? "").trim();
    if (weapon) add(weapon, item.name, "weapon");
  }

  // Recorded choices and transferred effects: Weapon Proficient names a
  // single weapon, Morgar grants whole weapon groups. Both are read by
  // the attack workflow, so both belong here.
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect.disabled) continue;
    const named = effect.getFlag?.(SYSTEM_ID, "weaponProficientName");
    if (named) add(String(named), effect.name, "weapon");
    const groups = effect.getFlag?.(SYSTEM_ID, "weaponGroupProficiency");
    if (groups) {
      for (const group of Array.isArray(groups) ? groups : [groups]) {
        if (group) add(`${titleCase(String(group))} group`, effect.name, "weapon");
      }
    }
  }

  return { classLine, entries };
}

function titleCase(text) {
  return String(text ?? "").replace(/(^|\s)([a-z])/g, (_, lead, ch) => lead + ch.toUpperCase());
}

/** True when the character has no proficiency information at all. */
export function proficiencySummaryIsEmpty(summary) {
  return !summary?.classLine && !(summary?.entries?.length);
}
