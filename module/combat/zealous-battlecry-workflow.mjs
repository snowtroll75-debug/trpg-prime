/**
 * Zealous Battlecry against a live combat — the Foundry half of
 * zealous-battlecry.mjs (3.614.0, Graham's R7 of block 35).
 */

import {
  ZEALOUS_BATTLECRY, ZEALOUS_RANGE_FEET, ZEALOUS_PAIRS_FLAG, INIT_DIE_FLAG,
  zealousInitiatives, zealousLine
} from "./zealous-battlecry.mjs";

const SYSTEM_ID = "trg-prime";
const fold = (v) => String(v ?? "").trim().toLowerCase();
const esc = (v) => foundry.utils.escapeHTML?.(String(v ?? "")) ?? String(v ?? "");

/**
 * Before a combatant rolls initiative: may it cast Zealous Battlecry with an
 * ally within 10 feet who has not rolled yet? Records the pair on the combat.
 * @param {Combat} combat
 * @param {Combatant} combatant
 */
export async function offerZealousBattlecry(combat, combatant) {
  const actor = combatant?.actor;
  if (!actor?.isOwner) return;
  const pairs = combat.getFlag(SYSTEM_ID, ZEALOUS_PAIRS_FLAG) ?? [];
  if (pairs.some((p) => p.a === combatant.id || p.b === combatant.id)) return;
  const spell = Array.from(actor.items ?? []).find((i) => i.type === "spell" && fold(i.name) === fold(ZEALOUS_BATTLECRY));
  if (!spell) return;
  if (Number(actor.system?.resources?.pp?.value ?? 0) < Number(spell.system?.ppCost ?? 0)) return;
  const token = combatant.token?.object ?? null;
  if (!token) return;
  const { distanceBetween } = await import("./geometry.mjs");
  const side = Number(combatant.token?.disposition ?? 0);
  const allies = combat.combatants.filter((c) => c.id !== combatant.id
    && (c.initiative === null || c.initiative === undefined)
    && Number(c.token?.disposition ?? 0) === side && c.token?.object
    && !pairs.some((p) => p.a === c.id || p.b === c.id)
    && distanceBetween(token, c.token.object) <= ZEALOUS_RANGE_FEET);
  if (!allies.length) return;

  const options = allies.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join("");
  const { DialogV2 } = foundry.applications.api;
  const picked = await DialogV2.wait({
    window: { title: `${ZEALOUS_BATTLECRY} — ${actor.name}`, icon: "fa-solid fa-bullhorn" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${esc(actor.name)}</strong> is about to roll initiative. Cast <strong>${ZEALOUS_BATTLECRY}</strong>
      as a reaction? You and an ally within 10 feet each roll the d100 and both use the higher.</p>
      ${allies.length > 1 ? `<div class="form-group"><label>Ally</label><select name="ally">${options}</select></div>` : `<p class="hint">Ally: ${esc(allies[0].name)}.</p>`}
    </div>`,
    buttons: [
      { action: "cast", label: `Cast ${ZEALOUS_BATTLECRY}`, icon: "fa-solid fa-bullhorn",
        callback: (_e, button) => { const v = button.form?.elements?.ally?.value; return v === undefined ? "0" : String(v); } },
      { action: "decline", label: "Roll normally", icon: "fa-solid fa-xmark", default: true }
    ],
    rejectClose: false
  });
  const ally = allies[Number(picked)];
  if (picked === null || picked === undefined || picked === "decline" || !ally) return;

  // CAST THROUGH THE ORDINARY PIPELINE, the ally targeted for its length.
  const previous = Array.from(game.user?.targets ?? []).map((t) => t.id);
  const setTargets = (ids) => {
    const wanted = new Set(ids);
    for (const t of canvas.tokens?.placeables ?? []) {
      if (t.isTargeted !== wanted.has(t.id)) t.setTarget(wanted.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
    }
  };
  let result = null;
  try {
    setTargets([ally.token.id]);
    const { castSpell } = await import("../magic/cast-workflow.mjs");
    result = await castSpell(actor, spell, { reaction: { presetTargets: true } });
  } finally {
    setTargets(previous);
  }
  if (!result?.cast) return;
  await combat.setFlag(SYSTEM_ID, ZEALOUS_PAIRS_FLAG, [...pairs, { a: combatant.id, b: ally.id, settled: false }]);
}

/**
 * After initiative is rolled: settle every pair whose two members have both
 * rolled, moving each to the higher d100.
 * @param {Combat} combat
 */
export async function settleZealousBattlecry(combat) {
  const pairs = foundry.utils.deepClone(combat.getFlag(SYSTEM_ID, ZEALOUS_PAIRS_FLAG) ?? []);
  if (!pairs.length) return;
  const updates = [];
  const lines = [];
  for (const pair of pairs) {
    if (pair.settled) continue;
    const a = combat.combatants.get(pair.a);
    const b = combat.combatants.get(pair.b);
    if (!a || !b) continue;
    const settled = zealousInitiatives(
      { initiative: a.initiative, die: a.getFlag(SYSTEM_ID, INIT_DIE_FLAG) ?? null },
      { initiative: b.initiative, die: b.getFlag(SYSTEM_ID, INIT_DIE_FLAG) ?? null });
    if (!settled) continue;
    updates.push({ _id: a.id, initiative: settled.a }, { _id: b.id, initiative: settled.b });
    lines.push(zealousLine(a.name, b.name, settled.die, settled));
    pair.settled = true;
  }
  if (!updates.length) return;
  await combat.updateEmbeddedDocuments("Combatant", updates);
  await combat.setFlag(SYSTEM_ID, ZEALOUS_PAIRS_FLAG, pairs);
  await ChatMessage.create({ content: `<div class="trg-prime">${lines.map((l) => `<p>${l}</p>`).join("")}</div>` });
}
