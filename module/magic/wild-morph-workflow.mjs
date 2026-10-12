/**
 * The Foundry side of Wild Morph (see wild-morph.mjs).
 *
 * NEW at 3.493.0.
 *
 * TWO PROMPTS, AND THE SECOND KNOWS ABOUT THE FIRST. Which Studied
 * Target, then which form — and where the target resolves to a creature
 * on the scene, its own natural attacks fill the second prompt's list so
 * nobody retypes "1d6 slashing" for a Claw the system can already read.
 */

import { getStudiedTargets } from "../study-target-workflow.mjs";
import { speedValue } from "../combat/speed-pool.mjs";

const { DialogV2 } = foundry.applications.api;

const esc = (v) => String(v ?? "").replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
);

/**
 * Ask which Studied Target the form is drawn from.
 *
 * EVERY RECORDED TARGET IS LISTED, flawed ones included and marked. The
 * same shape the resonance picker took on Graham's ruling of 27 August:
 * a filtered list cannot be argued with by the person reading it, and a
 * flawed study is still a study.
 *
 * @returns {Promise<{name: string, actor: Actor|null}|null>} null on cancel
 */
export async function promptMorphSource(actor, spellName) {
  const targets = getStudiedTargets(actor);
  if (!targets.length) return null;

  const rows = targets.map((t, i) => {
    const flaw = t.flawed ? " <em>&mdash; flawed study</em>" : "";
    return `<label style="display:block;margin:3px 0"><input type="radio" name="src" value="${i}"`
      + `${i === 0 ? " checked" : ""}> ${esc(t.name)}${flaw}</label>`;
  }).join("");

  const chosen = await DialogV2.wait({
    window: { title: `${spellName} — Which Studied Target?`, icon: "fa-solid fa-paw" },
    classes: ["trg-prime"],
    content: `<p>Whose form do you take a piece of?</p>${rows}`,
    buttons: [
      {
        action: "ok",
        label: "Draw",
        icon: "fa-solid fa-paw",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return String(new FDE(form).object.src ?? "");
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);

  if (chosen === null || chosen === undefined || chosen === "" || chosen === "cancel") return null;
  const entry = targets[Number(chosen)];
  if (!entry) return null;

  // A `creature` ENTRY MAY STILL NOT RESOLVE. The id belongs to an actor
  // that may have been deleted, or to an unlinked token that no longer
  // exists — so the creature is a bonus, never a requirement, and the
  // prompt below works without it.
  const source = entry.type === "creature" && entry.id ? (game.actors?.get(entry.id) ?? null) : null;
  return { name: entry.name, actor: source };
}

/**
 * Ask what form is grown, prefilled from the creature where there is one.
 *
 * @returns {Promise<{name: string, damage: string, damageType: string}|null>}
 */
export async function promptMorphForm(spellName, sourceName, sourceActor) {
  // THE CREATURE'S OWN NATURAL ATTACKS, when it resolved. Read off the
  // actor rather than guessed from its name, and offered as a starting
  // point the player confirms — which is the ruling: they name the form.
  const natural = Array.from(sourceActor?.items ?? [])
    .filter((i) => i.type === "weapon" && (i.system?.natural || /brawling/i.test(String(i.system?.group ?? ""))))
    .map((i) => ({
      name: i.name,
      damage: String(i.system?.damage ?? "1d4"),
      damageType: String(i.system?.damageType ?? "slashing")
    }));

  const options = natural.length
    ? `<p class="hint">${esc(sourceName)}'s own natural attacks:</p>`
      + natural.map((n, i) => `<label style="display:block;margin:3px 0">`
        + `<input type="radio" name="preset" value="${i}"${i === 0 ? " checked" : ""}> `
        + `${esc(n.name)} (${esc(n.damage)} ${esc(n.damageType)})</label>`).join("")
      + `<label style="display:block;margin:3px 0"><input type="radio" name="preset" value="own"> `
      + "Something else &mdash; described below</label>"
    : "";

  const first = natural[0];
  const result = await DialogV2.wait({
    window: { title: `${spellName} — Which form?`, icon: "fa-solid fa-dragon" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `${options}
      <p class="hint">The attack form you grow. The GM settles what suits ${esc(sourceName)}.</p>
      <p><label>Name <input type="text" name="name" value="${esc(first?.name ?? "Claw")}" style="width:100%"></label></p>
      <p><label>Damage <input type="text" name="damage" value="${esc(first?.damage ?? "1d6")}" style="width:100%"></label></p>
      <p><label>Type <input type="text" name="damageType" value="${esc(first?.damageType ?? "slashing")}" style="width:100%"></label></p>`,
    buttons: [
      {
        action: "ok",
        label: "Grow it",
        icon: "fa-solid fa-check",
        default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          const data = new FDE(form).object;
          const preset = String(data.preset ?? "");
          // A CHOSEN PRESET WINS OVER THE BOXES, because the boxes were
          // prefilled from the FIRST preset and a player who picked the
          // third would otherwise get the first.
          if (preset && preset !== "own" && natural[Number(preset)]) {
            return JSON.stringify(natural[Number(preset)]);
          }
          return JSON.stringify({
            name: String(data.name ?? "").trim(),
            damage: String(data.damage ?? "").trim(),
            damageType: String(data.damageType ?? "").trim()
          });
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);

  if (!result || result === "cancel") return null;
  try {
    const form = JSON.parse(result);
    return form.name ? form : null;
  } catch {
    return null;
  }
}

/**
 * Ask which movement type is taken — Wild Morph's "+2 PP: You instead gain a
 * movement type from one of your Studied Targets" (3.614.0, Graham's R15).
 *
 * PREFILLED FROM THE CREATURE WHERE IT RESOLVES — its own fly, swim, climb
 * or burrow at its own figure — and otherwise asked: the GM settles what
 * suits a studied target the system cannot read, as the attack form is.
 *
 * @returns {Promise<{key: string, feet: number}|null>}
 */
export async function promptMorphMovement(spellName, sourceName, sourceActor) {
  const KEYS = ["fly", "swim", "climb", "burrow"];
  const theirs = KEYS
    .map((key) => ({ key, feet: Math.trunc(speedValue(sourceActor?.system?.combat?.movement?.[key])) }))
    .filter((m) => m.feet > 0);
  const first = theirs[0] ?? { key: "climb", feet: 20 };
  const options = theirs.length
    ? `<p class="hint">${esc(sourceName)}'s own movement:</p>`
      + theirs.map((m, i) => `<label style="display:block;margin:3px 0"><input type="radio" name="preset" value="${i}"${i === 0 ? " checked" : ""}> `
        + `${esc(m.key)} ${m.feet} ft</label>`).join("")
      + `<label style="display:block;margin:3px 0"><input type="radio" name="preset" value="own"> Something else &mdash; set below</label>`
    : "";
  const result = await DialogV2.wait({
    window: { title: `${spellName} — Which movement?`, icon: "fa-solid fa-feather" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `${options}
      <p class="hint">The movement you take. The GM settles what suits ${esc(sourceName)}.</p>
      <p><label>Type <select name="key">${KEYS.map((k) => `<option value="${k}"${k === first.key ? " selected" : ""}>${k}</option>`).join("")}</select></label></p>
      <p><label>Feet <input type="number" name="feet" value="${first.feet}" min="5" step="5"></label></p>`,
    buttons: [
      {
        action: "ok", label: "Take it", icon: "fa-solid fa-check", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          const data = new FDE(form).object;
          const preset = String(data.preset ?? "");
          if (preset && preset !== "own" && theirs[Number(preset)]) return JSON.stringify(theirs[Number(preset)]);
          return JSON.stringify({ key: String(data.key ?? ""), feet: Number(data.feet ?? 0) });
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  }).catch(() => null);
  if (!result || result === "cancel") return null;
  try {
    const m = typeof result === "string" ? JSON.parse(result) : result;
    const feet = Math.trunc(Number(m.feet) || 0);
    return KEYS.includes(m.key) && feet > 0 ? { key: m.key, feet } : null;
  } catch {
    return null;
  }
}
