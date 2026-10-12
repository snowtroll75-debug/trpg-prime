/**
 * Skill Specialties — the Foundry side: per-actor selection stored on a flag,
 * the feat-based cap on how many may be held, and the manager dialog for
 * choosing them. The check gate itself lives in action-workflow.mjs.
 */
import { deletionValue } from "./deletion.mjs";
import {
  SKILL_SPECIALTIES,
  specialtyCap,
  specialtyLabel
} from "./skill-specialties.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "skillSpecialties";
/** Provenance for specialties a race/heritage/background handed out. */
const GRANT_FLAG = "grantedSkillSpecialties";

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/**
 * All selected specialties: { artistry:[keys], crafting:[keys], perform:[keys] }.
 *
 * Clamped to the current cap on the way out, not just filtered for
 * validity. The cap can FALL after selections were made — a Dengar dwarf
 * picks two crafting specialties and then the heritage is removed — and
 * a stored list longer than the cap would otherwise keep being honoured
 * by the trained-check gate until the player happened to open the
 * manager and press Apply. The flag is left alone; only what is
 * ANSWERED changes, so re-adding the source restores the second pick
 * rather than having silently destroyed it.
 */
export function getSkillSpecialties(actor, { clamp = true } = {}) {
  const stored = actor?.getFlag?.(SYSTEM_ID, FLAG) ?? {};
  const out = {};
  for (const skillKey of Object.keys(SKILL_SPECIALTIES)) {
    const list = Array.isArray(stored[skillKey]) ? stored[skillKey] : [];
    // Keep only keys that are still valid options for the skill.
    const valid = SKILL_SPECIALTIES[skillKey].options.map((o) => o.key);
    const kept = list.filter((k) => valid.includes(k));
    out[skillKey] = clamp ? kept.slice(0, specialtyCap(specialtyFeatCount(actor, skillKey))) : kept;
  }
  return out;
}

/** The selected specialty keys for one skill. */
export function getSkillSpecialty(actor, skillKey) {
  return getSkillSpecialties(actor)[skillKey] ?? [];
}

export async function setSkillSpecialties(actor, selection) {
  await actor.setFlag(SYSTEM_ID, FLAG, selection);
}

/**
 * How many matching Specialist feats the actor holds — each adds one to the
 * specialty cap. Matched by name (the feats are compendium content that may
 * not exist yet; until one named to match is added, this is 0 and the cap is
 * the base 1).
 */
export function specialtyFeatCount(actor, skillKey) {
  // A LIST, NOT AN ALTERNATION (3.362.0). Crafting names two feats either
  // of which raises the cap; that used to be the single string
  // "specialist crafter|artificer" and was consumed with String#includes,
  // so it was tested as one literal and matched neither — no crafting feat
  // in the game could raise the crafting cap. The consumer was fixed then;
  // the shape that invited the mistake is gone now.
  const needles = Array.from(SKILL_SPECIALTIES[skillKey]?.featNames ?? [])
    .map((part) => String(part).trim().toLowerCase())
    .filter(Boolean);
  if (!needles.length) return 0;
  const feats = Array.from(actor?.items ?? []).filter((item) => {
    if (item.type !== "feat") return false;
    const name = String(item.name ?? "").toLowerCase();
    return needles.some((needle) => name.includes(needle));
  }).length;
  return feats + specialtyGrantCount(actor, skillKey);
}

/**
 * Additional specialty slots granted by something that isn't a Specialist
 * feat — the Dengar dwarf's "additional crafting specialty" (Chapter 2).
 * Carried as an effect flag so any later source (a background, a class
 * feature) can raise the cap the same way without touching this file.
 *
 * appliedEffects, not effects: a heritage's effects are transferred and in
 * V12+ live on the ITEM, so actor.effects alone would never see them.
 */
export function specialtyGrantCount(actor, skillKey) {
  if (!skillKey) return 0;
  const wanted = String(skillKey).toLowerCase();
  let total = 0;
  for (const effect of actor?.appliedEffects ?? actor?.effects ?? []) {
    if (effect.disabled) continue;
    const grant = effect.getFlag?.(SYSTEM_ID, "specialtyGrant");
    if (!grant) continue;
    // One flag may carry a single {skill, count} or an array of them.
    for (const entry of Array.isArray(grant) ? grant : [grant]) {
      if (String(entry?.skill ?? "").toLowerCase() !== wanted) continue;
      total += Math.max(0, Math.floor(Number(entry?.count ?? 1)) || 0);
    }
  }
  return total;
}

/**
 * The specialty SLOTS a source item grants without naming one — the
 * Entertainer's "Bonus Perform Specialty". Reported on the Apply Grants
 * card, because a slot that creates nothing otherwise produced no line at
 * all and the player had no way to know the row had done anything.
 *
 * @param {Item} sourceItem
 * @returns {Array<{skill: string, label: string, count: number, developed: boolean}>}
 */
export function grantedSpecialtySlots(sourceItem) {
  const slots = new Map();
  for (const effect of sourceItem?.effects ?? []) {
    if (effect.disabled) continue;
    // A slot that also NAMES its specialty is reported by the grant
    // itself; only the unnamed ones need announcing here.
    const select = effect.getFlag?.(SYSTEM_ID, "specialtySelect")
      ?? effect.flags?.[SYSTEM_ID]?.specialtySelect;
    if (select) continue;
    const grant = effect.getFlag?.(SYSTEM_ID, "specialtyGrant")
      ?? effect.flags?.[SYSTEM_ID]?.specialtyGrant;
    if (!grant) continue;
    for (const entry of Array.isArray(grant) ? grant : [grant]) {
      const skill = String(entry?.skill ?? "");
      if (!SKILL_SPECIALTIES[skill]) continue;
      const count = Math.max(0, Math.floor(Number(entry?.count ?? 1)) || 0);
      if (!count) continue;
      slots.set(skill, (slots.get(skill) ?? 0) + count);
    }
  }
  const actor = sourceItem?.parent;
  return [...slots].map(([skill, count]) => ({
    skill,
    count,
    label: SKILL_SPECIALTIES[skill]?.label ?? skill,
    developed: Boolean(actor && isSkillDeveloped(actor, skill))
  }));
}

/**
 * Specialties a source item hands the character outright.
 *
 * The Cook's "Crafting (Cooking)" needs the Cooking specialty to exist
 * before its scoped bonus can ever apply, so the background supplies it —
 * and the same effect raises the cap by one, because spending the
 * character's single free pick to satisfy a background is a cost the
 * rulebook never charged.
 *
 * Provenance lives in an actor flag for the same reason specialist skills'
 * does: the selection is a plain array in a flag, so a marker written
 * alongside it would be indistinguishable from a player's own pick.
 *
 * @returns {Promise<string[]>} Labels added.
 */
export async function applySpecialtySelectionGrants(actor, sourceItem) {
  const wanted = [];
  for (const effect of sourceItem?.effects ?? []) {
    // The cap raise is read from appliedEffects, which skips disabled
    // effects — both flags live on the SAME effect, so the two readers
    // have to agree or a disabled effect grants the specialty without the
    // cap that pays for it, and every clamped read then hides it.
    if (effect.disabled) continue;
    const select = effect.getFlag?.(SYSTEM_ID, "specialtySelect")
      ?? effect.flags?.[SYSTEM_ID]?.specialtySelect;
    for (const entry of Array.isArray(select) ? select : select ? [select] : []) {
      if (entry?.skill && entry?.key) wanted.push(entry);
    }
  }
  if (!wanted.length) return [];

  const selection = getSkillSpecialties(actor, { clamp: false });
  const added = [];
  const record = { ...(actor.getFlag(SYSTEM_ID, GRANT_FLAG) ?? {}) };
  const mine = new Set(record[sourceItem.id] ?? []);

  for (const { skill, key } of wanted) {
    const options = SKILL_SPECIALTIES[skill]?.options ?? [];
    if (!options.some((o) => o.key === key)) continue;
    const held = selection[skill] ?? [];
    // Already chosen by the player: leave it, and do NOT claim it — a
    // record here would take their own pick away when the background goes.
    if (held.includes(key)) continue;
    selection[skill] = [...held, key];
    mine.add(`${skill}:${key}`);
    added.push(specialtyLabel(skill, key));
  }
  if (!added.length) return [];

  await setSkillSpecialties(actor, selection);
  record[sourceItem.id] = [...mine];
  await actor.setFlag(SYSTEM_ID, GRANT_FLAG, record);
  return added;
}

/**
 * Takes back the specialties a source granted, and forgets it.
 *
 * @returns {Promise<string[]>} Labels removed.
 */
export async function removeSpecialtySelectionGrants(actor, sourceId) {
  const record = actor?.getFlag?.(SYSTEM_ID, GRANT_FLAG) ?? {};
  const mine = record[sourceId] ?? [];
  if (!mine.length) return [];

  const selection = getSkillSpecialties(actor, { clamp: false });
  const removed = [];
  for (const entry of mine) {
    const [skill, key] = String(entry).split(":");
    if (!selection[skill]?.includes(key)) continue;
    selection[skill] = selection[skill].filter((k) => k !== key);
    removed.push(specialtyLabel(skill, key));
  }
  await setSkillSpecialties(actor, selection);
  // `setFlag` merges recursively, so writing the object back with the key
  // omitted would silently RETAIN it. Only the ForcedDeletion sentinel
  // (Foundry 14; replaces the old `-=` prefix) actually deletes it.
  await actor.update({ [`flags.${SYSTEM_ID}.${GRANT_FLAG}.${sourceId}`]: deletionValue() });
  return removed;
}

/** Cap + selection snapshot for a skill. Cap is 0 until the skill is developed. */
export function specialtyStatus(actor, skillKey) {
  const selected = getSkillSpecialty(actor, skillKey);
  const developed = isSkillDeveloped(actor, skillKey);
  const cap = developed ? specialtyCap(specialtyFeatCount(actor, skillKey)) : 0;
  return {
    selected,
    developed,
    cap,
    used: selected.length,
    options: SKILL_SPECIALTIES[skillKey].options
  };
}

/**
 * Whether the actor has *developed* the skill — invested at least one rank.
 * You only pick a specialty "when you first develop this skill", so a skill
 * with no ranks has no specialty (cap 0) and is never gated or shown.
 */
export function isSkillDeveloped(actor, skillKey) {
  return Number(actor?.system?.skills?.[skillKey]?.ranks ?? 0) >= 1;
}

/** Whether the actor holds at least one specialty in a skill. */
export function hasAnySpecialty(actor, skillKey) {
  return getSkillSpecialty(actor, skillKey).length > 0;
}

/**
 * The specialty LABELS a character actually holds in one skill — what a
 * dialog should offer them.
 *
 * WHY THIS IS A FUNCTION AND NOT TWO EXPRESSIONS AT THE CALL SITE. 3.361.0
 * gave Specialist Crafter a second specialty store on the feat items, and
 * the Create dialog read that one while the Create action's own gate read
 * this one. Live, the dialog offered a specialty the character did not hold
 * and both crafting work-modifier feats paid out on it. There is one store;
 * this is the one way to ask it what to show.
 *
 * @param {Actor} actor
 * @param {string} skillKey
 * @returns {string[]} printed labels, in the order the book lists them
 */
export function specialtyChoices(actor, skillKey) {
  return getSkillSpecialty(actor, skillKey).map((key) => specialtyLabel(skillKey, key));
}

/** A short "Musical Composition, Criticism" summary for the sheet, or "None". */
export function specialtySummary(actor, skillKey) {
  const selected = getSkillSpecialty(actor, skillKey);
  if (!selected.length) return "None";
  return selected.map((k) => specialtyLabel(skillKey, k)).join(", ");
}

/**
 * The manager: pick specialties for Artistry, Crafting and Perform, capped
 * per skill at 1 + matching feats. Unchecked options disable once a skill is
 * at its cap; Apply saves the checked set (clamped to the cap as a backstop).
 */
export async function openSpecialtyManager(actor) {
  if (!actor) return;
  const { DialogV2 } = foundry.applications.api;

  const developedSkills = Object.entries(SKILL_SPECIALTIES).filter(([skillKey]) =>
    isSkillDeveloped(actor, skillKey)
  );

  // A skill something GRANTED a slot for but the character hasn't
  // developed yet. The Entertainer's bonus Perform specialty is real and
  // waiting, but "you pick a specialty when you first develop the skill"
  // still binds — so say so, rather than leaving a player who read their
  // background's description staring at a dialog that doesn't mention
  // Perform at all.
  const waiting = Object.entries(SKILL_SPECIALTIES).filter(
    ([skillKey]) => !isSkillDeveloped(actor, skillKey) && specialtyGrantCount(actor, skillKey) > 0
  );

  const sections = developedSkills
    .map(([skillKey, config]) => {
      const status = specialtyStatus(actor, skillKey);
      // Seeded UNCLAMPED. The clamp exists so an over-cap pick stops being
      // HONOURED when a cap falls, deliberately without destroying it —
      // but seeding the checkboxes from the clamped list meant opening
      // this dialog for an unrelated skill and pressing Apply wrote the
      // clamped list back and destroyed it for good.
      const selected = new Set(getSkillSpecialties(actor, { clamp: false })[skillKey] ?? []);
      const rows = config.options
        .map(
          (o) =>
            `<label style="display:flex;gap:8px;align-items:flex-start;margin:2px 0;cursor:pointer">` +
            `<input type="checkbox" name="spec:${skillKey}" value="${o.key}"${selected.has(o.key) ? " checked" : ""} style="margin:2px 0 0">` +
            `<span><strong>${esc(o.label)}</strong> <span style="opacity:.6;font-size:.85em">— ${esc(o.items)}</span></span>` +
            `</label>`
        )
        .join("");
      return `<fieldset data-skill="${skillKey}" data-cap="${status.cap}" style="margin:0 0 10px;border:1px solid var(--trg-line,#c9b98f);border-radius:4px;padding:6px 8px">
        <legend style="padding:0 6px"><strong>${esc(config.label)}</strong>
          <span class="spec-count" style="opacity:.7;font-weight:normal">(${status.used}/${status.cap})</span></legend>
        ${rows}
      </fieldset>`;
    })
    .join("");

  const selection = await DialogV2.wait({
    window: { title: "Skill Specialties", icon: "fa-solid fa-palette" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 8px">Pick your specialties. Each skill allows one, plus one per matching Specialist feat or heritage grant. You may only make a skill's trained checks in a specialty you hold.</p>
      <div style="max-height:56vh;overflow-y:auto;padding-right:4px">${
        sections ||
        "<p><em>You haven't developed Artistry, Crafting or Perform yet — gain a rank in one before choosing a specialty.</em></p>"
      }${waiting.map(([key, config]) =>
        `<p class="hint" style="margin:6px 0 0"><strong>${esc(config.label)}:</strong> you have ` +
        `${specialtyGrantCount(actor, key)} granted specialty slot(s) waiting — spend a rank in ` +
        `${esc(config.label)} and they become available here.</p>`).join("")}</div>
    </div>`,
    buttons: [
      {
        action: "apply",
        label: "Apply",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button, dialog) => {
          const root = dialog?.element ?? button?.form;
          // Start from the stored selection so undeveloped skills (not shown)
          // keep whatever they held; only the developed skills are rewritten.
          // UNCLAMPED deliberately: an undeveloped skill's over-cap picks
          // should survive being written back, not be quietly trimmed by a
          // dialog the player opened to change a different skill.
          const result = getSkillSpecialties(actor, { clamp: false });
          for (const [skillKey] of developedSkills) {
            const cap = specialtyCap(specialtyFeatCount(actor, skillKey));
            const stored = result[skillKey] ?? [];
            const checked = Array.from(
              root?.querySelectorAll?.(`input[name="spec:${skillKey}"]:checked`) ?? []
            ).map((el) => el.value);
            // Only ADDITIONS are capped. Seeding unclamped fixed half the
            // problem — the boxes showed both of an over-cap pair — but
            // the write still truncated to the cap by DOM order, so
            // opening this dialog for an unrelated skill and pressing
            // Apply deleted the second pick anyway. Found live.
            //
            // So: anything already held that is STILL ticked survives
            // (the player has to untick it to lose it), and new picks
            // fill up to the cap on top of that.
            const keptStored = stored.filter((key) => checked.includes(key));
            const added = checked.filter((key) => !stored.includes(key));
            result[skillKey] = [...keptStored, ...added]
              .slice(0, Math.max(cap, keptStored.length));
          }
          return result;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false,
    render: (event, dialog) => {
      const root = dialog?.element ?? dialog;
      const enforce = () => {
        for (const fieldset of root.querySelectorAll?.("fieldset[data-skill]") ?? []) {
          const cap = Number(fieldset.dataset.cap);
          const boxes = Array.from(fieldset.querySelectorAll('input[type="checkbox"]'));
          const checked = boxes.filter((b) => b.checked).length;
          boxes.forEach((b) => {
            b.disabled = !b.checked && checked >= cap;
          });
          const count = fieldset.querySelector(".spec-count");
          if (count) count.textContent = `(${checked}/${cap})`;
        }
      };
      root.querySelectorAll?.('input[type="checkbox"]').forEach((b) => b.addEventListener("change", enforce));
      enforce();
    }
  });

  if (selection && typeof selection === "object") {
    await setSkillSpecialties(actor, selection);
  }
}
