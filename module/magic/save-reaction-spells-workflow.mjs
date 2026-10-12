/**
 * Fateful Temptation and Lucky Break, offered from inside a saving throw
 * (3.612.0, block 34's R4). The rules and the reasons are in
 * save-reaction-spells.mjs; this file finds who may cast, asks, and casts.
 *
 * ASKED OF WHOEVER IS AT THE KEYBOARD, for a caster they may act for — the
 * save-advantage family's position (magic/save-reactions.mjs). A creature
 * this user does not own is not offered: the cast would write its PP.
 */

import {
  FATEFUL_TEMPTATION, LUCKY_BREAK, FATEFUL_RANGE_FEET, LUCKY_BREAK_IMMUNITY_SECONDS,
  isNamedSpell, luckyBreakTriggers, fatefulBonus, fatefulModifier, reactionCasterEligible,
  fatefulLine, luckyBreakLine,
  UNITY, UNITY_RANGE_FEET, UNITY_WINDOW_FLAG, unitySourceKey, unityMoment, unityWindowOpen, unityModifier
} from "./save-reaction-spells.mjs";
import { saveRerollOf, offerableDegrees, rerollCovers, rerollModifier, saveRerollLine } from "./save-reroll.mjs";

const SYSTEM_ID = "trg-prime";
const esc = (v) => foundry.utils.escapeHTML?.(String(v ?? "")) ?? String(v ?? "");

function spellOf(actor, name) {
  return Array.from(actor?.items ?? []).find((i) => isNamedSpell(i, name)) ?? null;
}

async function inCombat(actor) {
  const { actorInCombat } = await import("../combat/action-points-workflow.mjs");
  return actorInCombat(actor);
}

/**
 * Cast `spell` as a reaction with the user's targets set to `targetTokenIds`
 * for the length of the cast, then put the user's own targets back — the
 * cast that forced the save is still running and has its own.
 */
async function castAsReaction(caster, spell, targetTokenIds = []) {
  const tokens = canvas?.tokens?.placeables ?? [];
  const previous = Array.from(game.user?.targets ?? []).map((t) => t.id);
  const setTargets = (ids) => {
    const wanted = new Set(ids);
    for (const t of tokens) {
      if (t.isTargeted !== wanted.has(t.id)) t.setTarget(wanted.has(t.id), { user: game.user, releaseOthers: false, groupSelection: true });
    }
  };
  const preset = targetTokenIds.length > 0;
  try {
    if (preset) setTargets(targetTokenIds);
    const { castSpell } = await import("./cast-workflow.mjs");
    return await castSpell(caster, spell, { reaction: { presetTargets: preset } });
  } finally {
    if (preset) setTargets(previous);
  }
}

/**
 * Before the dice: may anyone cast Fateful Temptation on this save?
 * @param {TRGCheck} check
 * @returns {Promise<{modifier: object, shift: string, line: string}|null>}
 */
export async function offerFatefulTemptation(check) {
  const saver = check.actor;
  if (!canvas?.ready) return null;
  const { activeToken, distanceBetween } = await import("../combat/geometry.mjs");
  const saverToken = activeToken(saver);
  if (!saverToken) return null;
  const side = Number(saverToken.document?.disposition ?? 0);

  const able = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const actor = token.actor;
    const spell = spellOf(actor, FATEFUL_TEMPTATION);
    if (!spell) continue;
    const isSaver = token.id === saverToken.id;
    const verdict = reactionCasterEligible({
      hasSpell: true,
      canAct: Boolean(actor.isOwner),
      pp: Number(actor.system?.resources?.pp?.value ?? 0),
      ppCost: Number(spell.system?.ppCost ?? 0),
      inCombat: await inCombat(actor),
      reactions: Number(actor.system?.resources?.reactions?.value ?? 0),
      feet: isSaver ? 0 : distanceBetween(token, saverToken),
      rangeFeet: FATEFUL_RANGE_FEET,
      sameSide: isSaver || Number(token.document?.disposition ?? 0) === side
    });
    if (verdict.ok) able.push({ token, actor, spell });
  }
  if (!able.length) return null;

  const saveName = String(check.subject || "saving").replace(/^./, (c) => c.toUpperCase());
  const against = check.saveSource ? ` against <strong>${esc(check.saveSource)}</strong>` : "";
  const options = able.map((a, i) => `<option value="${i}">${esc(a.actor.name)}</option>`).join("");
  const { DialogV2 } = foundry.applications.api;
  const picked = await DialogV2.wait({
    window: { title: `${FATEFUL_TEMPTATION} — ${saver.name}`, icon: "fa-solid fa-dice" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${esc(saver.name)}</strong> must attempt a ${esc(saveName)} save${against}.</p>
      <p>Cast <strong>${FATEFUL_TEMPTATION}</strong> as a reaction? +2 status to the save (more with the warp);
      a Success becomes a Critical — and a Failure a Fumble.</p>
      ${able.length > 1 ? `<div class="form-group"><label>Caster</label><select name="caster">${options}</select></div>` : `<p class="hint">Caster: ${esc(able[0].actor.name)}.</p>`}
    </div>`,
    buttons: [
      {
        action: "cast", label: `Cast ${FATEFUL_TEMPTATION}`, icon: "fa-solid fa-dice",
        callback: (_e, button) => {
          const value = button.form?.elements?.caster?.value;
          return value === undefined ? "0" : String(value);
        }
      },
      { action: "decline", label: "Save normally", icon: "fa-solid fa-xmark", default: true }
    ],
    rejectClose: false
  });
  const chosen = able[Number(picked)];
  if (picked === null || picked === undefined || picked === "decline" || !chosen) return null;

  const result = await castAsReaction(chosen.actor, chosen.spell, [saverToken.id]);
  // A FAILED CASTING GIVES NOTHING, and its own card says so.
  if (!result?.cast) return null;
  const bonus = fatefulBonus(result.warpMods);
  return { modifier: fatefulModifier(bonus), shift: "fateful", line: fatefulLine(chosen.actor.name, bonus) };
}

/**
 * Once the degree is known: may the saver cast Lucky Break and throw again?
 * Rerolls `check` in place when they do.
 * @param {TRGCheck} check
 * @returns {Promise<string|null>} the card line, or null when nothing happened
 */
export async function offerLuckyBreak(check) {
  const actor = check.actor;
  const degree = check.outcome?.degree;
  if (!luckyBreakTriggers(degree?.key)) return null;
  const spell = spellOf(actor, LUCKY_BREAK);
  if (!spell) return null;

  const { IMMUNITY_FLAG, immunityRemaining, prunedImmunities, withImmunity } =
    await import("../temporary-immunity.mjs");
  const now = Number(game.time?.worldTime ?? 0);
  const record = actor.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};
  const verdict = reactionCasterEligible({
    hasSpell: true,
    canAct: Boolean(actor.isOwner),
    pp: Number(actor.system?.resources?.pp?.value ?? 0),
    ppCost: Number(spell.system?.ppCost ?? 0),
    inCombat: await inCombat(actor),
    reactions: Number(actor.system?.resources?.reactions?.value ?? 0),
    immune: immunityRemaining(record, LUCKY_BREAK, now) > 0
  });
  if (!verdict.ok) return null;

  const saveName = String(check.subject || "saving").replace(/^./, (c) => c.toUpperCase());
  const { DialogV2 } = foundry.applications.api;
  const taken = await DialogV2.confirm({
    window: { title: `${LUCKY_BREAK} — ${actor.name}`, icon: "fa-solid fa-clover" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${esc(actor.name)}</strong>'s ${esc(saveName)} save is a <strong>${esc(degree.label)}</strong>
      (${Number(check.outcome?.total ?? 0)} vs DC ${check.outcome?.dc ?? "?"}).</p>
      <p>Cast <strong>${LUCKY_BREAK}</strong> as a reaction to reroll it? The second result must be used,
      and ${esc(actor.name)} is then temporarily immune for 10 minutes.</p>
    </div>`,
    yes: { icon: "fa-solid fa-clover", label: `Cast ${LUCKY_BREAK}` },
    no: { icon: "fa-solid fa-xmark", label: `Keep the ${degree.label}`, default: true },
    rejectClose: false
  });
  if (!taken) return null;

  const result = await castAsReaction(actor, spell, []);
  if (!result?.cast) return null;
  const first = check.outcome;
  await check.reroll();
  await actor.setFlag(SYSTEM_ID, IMMUNITY_FLAG,
    withImmunity(prunedImmunities(record, now), LUCKY_BREAK, LUCKY_BREAK_IMMUNITY_SECONDS, now));
  return luckyBreakLine(first.degree.label, first.total, actor.name);
}

/**
 * Before the dice: may this ally use a Unity caster's save modifier? Casts
 * Unity first when nobody has yet, from the first ally's save against the
 * source (3.614.0, R6). See save-reaction-spells.mjs.
 * @param {TRGCheck} check
 * @returns {Promise<{modifier: object, line: string}|null>}
 */
export async function offerUnity(check) {
  const saver = check.actor;
  const key = unitySourceKey(check);
  if (!key || !canvas?.ready) return null;
  const { activeToken, distanceBetween } = await import("../combat/geometry.mjs");
  const saverToken = activeToken(saver);
  if (!saverToken) return null;
  const side = Number(saverToken.document?.disposition ?? 0);
  const combat = game.combat?.started ? game.combat : null;
  const moment = unityMoment({ worldTime: game.time?.worldTime ?? 0, combatId: combat?.id ?? null, round: combat?.round ?? null, turn: combat?.turn ?? null });
  const subject = String(check.subject ?? "").toLowerCase();
  const saveName = subject.replace(/^./, (c) => c.toUpperCase()) || "Save";
  const ownTotal = Number(saver.system?.combat?.saves?.[subject]?.total ?? 0);

  // AN ALLY ALREADY CAST IT AGAINST THIS SOURCE, AT THIS MOMENT?
  const allies = (canvas.tokens?.placeables ?? []).filter((t) => t.id !== saverToken.id && t.actor
    && Number(t.document?.disposition ?? 0) === side);
  let caster = allies.find((t) => unityWindowOpen(t.actor.getFlag?.(SYSTEM_ID, UNITY_WINDOW_FLAG), key, moment)
    && distanceBetween(t, saverToken) <= UNITY_RANGE_FEET) ?? null;

  if (!caster) {
    const able = [];
    for (const token of allies) {
      const spell = spellOf(token.actor, UNITY);
      if (!spell) continue;
      const verdict = reactionCasterEligible({
        hasSpell: true,
        canAct: Boolean(token.actor.isOwner),
        pp: Number(token.actor.system?.resources?.pp?.value ?? 0),
        ppCost: Number(spell.system?.ppCost ?? 0),
        inCombat: await inCombat(token.actor),
        reactions: Number(token.actor.system?.resources?.reactions?.value ?? 0),
        feet: distanceBetween(token, saverToken),
        rangeFeet: UNITY_RANGE_FEET,
        sameSide: true
      });
      // NOTHING TO OFFER WHEN THE CASTER'S MODIFIER IS NO BETTER.
      const theirs = Number(token.actor.system?.combat?.saves?.[subject]?.total ?? 0);
      if (verdict.ok && theirs > ownTotal) able.push({ token, actor: token.actor, spell });
    }
    if (!able.length) return null;
    const against = check.saveSource ? ` against <strong>${esc(check.saveSource)}</strong>` : "";
    const options = able.map((a, i) => `<option value="${i}">${esc(a.actor.name)} (${saveName} ${a.actor.system?.combat?.saves?.[subject]?.total ?? 0})</option>`).join("");
    const { DialogV2 } = foundry.applications.api;
    const picked = await DialogV2.wait({
      window: { title: `${UNITY} — ${saver.name}`, icon: "fa-solid fa-people-group" },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog">
        <p><strong>${esc(saver.name)}</strong> must attempt a ${esc(saveName)} save${against}.</p>
        <p>Cast <strong>${UNITY}</strong> as a reaction? Each ally targeted by it may use the caster's save
        modifier instead of its own, deciding one by one.</p>
        ${able.length > 1 ? `<div class="form-group"><label>Caster</label><select name="caster">${options}</select></div>` : `<p class="hint">Caster: ${esc(able[0].actor.name)}.</p>`}
      </div>`,
      buttons: [
        { action: "cast", label: `Cast ${UNITY}`, icon: "fa-solid fa-people-group",
          callback: (_e, button) => { const v = button.form?.elements?.caster?.value; return v === undefined ? "0" : String(v); } },
        { action: "decline", label: "Save normally", icon: "fa-solid fa-xmark", default: true }
      ],
      rejectClose: false
    });
    const chosen = able[Number(picked)];
    if (picked === null || picked === undefined || picked === "decline" || !chosen) return null;
    const result = await castAsReaction(chosen.actor, chosen.spell, [saverToken.id]);
    if (!result?.cast) return null;
    await chosen.actor.setFlag(SYSTEM_ID, UNITY_WINDOW_FLAG, { key, moment, source: check.saveSource ?? "" });
    caster = chosen.token;
  }

  const casterTotal = Number(caster.actor.system?.combat?.saves?.[subject]?.total ?? 0);
  const modifier = unityModifier(caster.actor.name, saveName, casterTotal, ownTotal);
  if (!modifier) return null;
  // "EACH ALLY DECIDES INDIVIDUALLY WHICH MODIFIER TO USE."
  const { DialogV2 } = foundry.applications.api;
  const use = await DialogV2.confirm({
    window: { title: `${UNITY} — ${saver.name}'s choice`, icon: "fa-solid fa-people-group" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><p>Use <strong>${esc(caster.actor.name)}</strong>'s ${esc(saveName)} modifier
      (${casterTotal >= 0 ? "+" : ""}${casterTotal}) instead of ${esc(saver.name)}'s own (${ownTotal >= 0 ? "+" : ""}${ownTotal})?</p></div>`,
    yes: { label: `Use ${caster.actor.name}'s`, icon: "fa-solid fa-check", default: true },
    no: { label: "Keep my own", icon: "fa-solid fa-xmark" },
    rejectClose: false
  });
  if (!use) return null;
  return { modifier, line: `<em>${UNITY}: ${esc(saver.name)} uses ${esc(caster.actor.name)}'s ${esc(saveName)} modifier.</em>` };
}

/**
 * A SPELL WITH A saveReroll ROW, CAST BY ANYONE ON THE SAVER'S SIDE (3.625.0).
 * Lucky Break's offer, generalised to a row and to a caster who need not be
 * the saver — Pillars of Faith's Saintly Intercession. Offered once the
 * degree is known, like Lucky Break; the first candidate's spell range
 * gates the distance; the cast's warps may extend the degrees answered or
 * add a status bonus to the second roll. See magic/save-reroll.mjs.
 * @param {TRGCheck} check
 * @returns {Promise<string|null>} the card line, or null when nothing happened
 */
export async function offerSaveRerollSpells(check) {
  const saver = check.actor;
  const degree = check.outcome?.degree;
  if (!saver || !degree?.key || !canvas?.ready) return null;
  const { activeToken, distanceBetween } = await import("../combat/geometry.mjs");
  const saverToken = activeToken(saver);
  if (!saverToken) return null;
  const side = Number(saverToken.document?.disposition ?? 0);
  const { IMMUNITY_FLAG, immunityRemaining, prunedImmunities, withImmunity } = await import("../temporary-immunity.mjs");
  const { spellRangeFeet } = await import("./spell-range.mjs").catch(() => ({ spellRangeFeet: null }));
  const now = Number(game.time?.worldTime ?? 0);
  const record = saver.getFlag?.(SYSTEM_ID, IMMUNITY_FLAG) ?? {};

  const able = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor) continue;
    for (const spell of Array.from(actor.items ?? []).filter((i) => i.type === "spell")) {
      const spec = saveRerollOf(spell.system);
      if (!spec) continue;
      if (!offerableDegrees(spec, spell.system?.warps).includes(degree.key)) continue;
      const isSaver = token.id === saverToken.id;
      const rangeFeet = typeof spellRangeFeet === "function" ? spellRangeFeet(spell.system?.range) : null;
      const verdict = reactionCasterEligible({
        hasSpell: true,
        canAct: Boolean(actor.isOwner),
        pp: Number(actor.system?.resources?.pp?.value ?? 0),
        ppCost: Number(spell.system?.ppCost ?? 0),
        inCombat: await inCombat(actor),
        reactions: Number(actor.system?.resources?.reactions?.value ?? 0),
        feet: isSaver ? 0 : distanceBetween(token, saverToken),
        rangeFeet: rangeFeet ?? null,
        sameSide: isSaver || Number(token.document?.disposition ?? 0) === side,
        immune: immunityRemaining(record, spell.name, now) > 0
      });
      if (verdict.ok) able.push({ token, actor, spell, spec });
    }
  }
  if (!able.length) return null;

  const saveName = String(check.subject || "saving").replace(/^./, (c) => c.toUpperCase());
  const options = able.map((a, i) => `<option value="${i}">${esc(a.actor.name)} — ${esc(a.spell.name)}</option>`).join("");
  const { DialogV2 } = foundry.applications.api;
  const picked = await DialogV2.wait({
    window: { title: `${able[0].spell.name} — ${saver.name}`, icon: "fa-solid fa-hands-praying" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${esc(saver.name)}</strong>'s ${esc(saveName)} save is a <strong>${esc(degree.label)}</strong>
      (${Number(check.outcome?.total ?? 0)} vs DC ${check.outcome?.dc ?? "?"}).</p>
      <p>Cast a reaction to reroll it? The second result must be used, and ${esc(saver.name)} is then temporarily immune to that spell.</p>
      ${able.length > 1 ? `<div class="form-group"><label>Caster</label><select name="caster">${options}</select></div>` : `<p class="hint">${esc(able[0].actor.name)} — ${esc(able[0].spell.name)}.</p>`}
    </div>`,
    buttons: [
      { action: "cast", label: "Cast it", icon: "fa-solid fa-hands-praying", callback: (_e, button) => { const v = button.form?.elements?.caster?.value; return v === undefined ? "0" : String(v); } },
      { action: "decline", label: `Keep the ${degree.label}`, icon: "fa-solid fa-xmark", default: true }
    ],
    rejectClose: false
  });
  const chosen = able[Number(picked)];
  if (picked === null || picked === undefined || picked === "decline" || !chosen) return null;

  const result = await castAsReaction(chosen.actor, chosen.spell, [saverToken.id]);
  if (!result?.cast) return null;
  // THE WARPS DECIDE WHAT THE CAST ANSWERS. A Fumble answered without the
  // warp that buys it is a cast that bought nothing, and the card says so.
  if (!rerollCovers(chosen.spec, result.warpMods, degree.key)) {
    return `<em>${esc(chosen.spell.name)}: cast, but a ${esc(degree.label)} is beyond what it was warped to answer — the result stands.</em>`;
  }
  const first = check.outcome;
  const bonus = rerollModifier(result.warpMods, chosen.spell.name);
  if (bonus) check.modifiers.push(bonus);
  await check.reroll();
  if (chosen.spec.immunitySeconds > 0) {
    await saver.setFlag(SYSTEM_ID, IMMUNITY_FLAG, withImmunity(prunedImmunities(record, now), chosen.spell.name, chosen.spec.immunitySeconds, now));
  }
  return saveRerollLine(chosen.spell.name, chosen.actor.name, first.degree.label, first.total, saver.name, bonus?.value ?? 0, chosen.spec.immunitySeconds);
}

/**
 * A SAVE REROLL AN ITEM OFFERS (3.626.0) — see rune-declarations.mjs
 * `itemSaveRerolls`. Asked after the spells, and only if they found
 * nothing: a save is rerolled once. The saver's own worn consumable
 * (Soulguard Talisman: broken whatever the second result) and an ally's
 * shield rune (Intercession: a reaction, 1/day, within its radius). The
 * printed trigger's traits are said in the dialog — the roll does not
 * always know what it was against — so the table ticks or declines.
 * @returns {Promise<string|null>}
 */
export async function offerSaveRerollItems(check) {
  const saver = check.actor;
  const degree = check.outcome?.degree;
  if (!saver || !degree?.key || !canvas?.ready) return null;
  const { activeToken, distanceBetween } = await import("../combat/geometry.mjs");
  const { itemSaveRerolls, runeMarkersOf, runeFrequencyAllows, runeUseUpdates } = await import("../rune-declarations.mjs");
  const saverToken = activeToken(saver);
  if (!saverToken) return null;
  const side = Number(saverToken.document?.disposition ?? 0);
  const now = Number(game.time?.worldTime ?? 0);

  const able = [];
  for (const token of canvas.tokens?.placeables ?? []) {
    const actor = token.actor;
    if (!actor) continue;
    const isSaver = token.id === saverToken.id;
    if (!isSaver && Number(token.document?.disposition ?? 0) !== side) continue;
    const items = Array.from(actor.items ?? []);
    for (const item of items) {
      for (const spec of itemSaveRerolls(item, items)) {
        if (!spec.degrees.includes(degree.key)) continue;
        if (spec.source === "consumable" && !isSaver) continue;
        if (spec.ally && isSaver) continue;
        if (!spec.ally && !isSaver) continue;
        if (!isSaver && spec.radius > 0 && distanceBetween(token, saverToken) > spec.radius) continue;
        if (!actor.isOwner) continue;
        if (spec.source === "rune" && !runeFrequencyAllows(runeMarkersOf(item), spec.key, spec.frequency, now)) continue;
        if (spec.source === "rune" && !isSaver && Number(actor.system?.resources?.reactions?.value ?? 0) <= 0 && await inCombat(actor)) continue;
        able.push({ token, actor, item, spec });
      }
    }
  }
  if (!able.length) return null;

  const saveName = String(check.subject || "saving").replace(/^./, (c) => c.toUpperCase());
  const options = able.map((a, i) => `<option value="${i}">${esc(a.actor.name)} — ${esc(a.spec.label)}</option>`).join("");
  const gate = able[0].spec.traits.length ? ` <em>(${esc(able[0].spec.label)} answers a save against ${esc(able[0].spec.traits.join(", "))} — the table decides whether this one was.)</em>` : "";
  const { DialogV2 } = foundry.applications.api;
  const picked = await DialogV2.wait({
    window: { title: `${able[0].spec.label} — ${saver.name}`, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p><strong>${esc(saver.name)}</strong>'s ${esc(saveName)} save is a <strong>${esc(degree.label)}</strong>
      (${Number(check.outcome?.total ?? 0)} vs DC ${check.outcome?.dc ?? "?"}).</p>
      <p>Reroll it? The second result must be used.${gate}</p>
      ${able.length > 1 ? `<div class="form-group"><label>Source</label><select name="source">${options}</select></div>` : `<p class="hint">${esc(able[0].actor.name)} — ${esc(able[0].spec.label)}.</p>`}
    </div>`,
    buttons: [
      { action: "use", label: "Reroll", icon: "fa-solid fa-dice", callback: (_e, button) => { const v = button.form?.elements?.source?.value; return v === undefined ? "0" : String(v); } },
      { action: "decline", label: `Keep the ${degree.label}`, icon: "fa-solid fa-xmark", default: true }
    ],
    rejectClose: false
  });
  const chosen = able[Number(picked)];
  if (picked === null || picked === undefined || picked === "decline" || !chosen) return null;

  const first = check.outcome;
  if (chosen.spec.source === "rune") {
    const updates = runeUseUpdates(runeMarkersOf(chosen.item), chosen.spec.key, chosen.spec.frequency, now);
    for (const [flag, value] of Object.entries(updates)) await chosen.item.setFlag(SYSTEM_ID, flag, value);
    if (chosen.actor !== saver) {
      const { spendReaction } = await import("../combat/action-points-workflow.mjs");
      await spendReaction(chosen.actor, chosen.spec.label);
    }
  }
  if (chosen.spec.bonus > 0) check.modifiers.push({ label: chosen.spec.label, value: chosen.spec.bonus, type: "status" });
  await check.reroll();
  if (chosen.spec.destroy) {
    const { useConsumableUp } = await import("../consumable-use-workflow.mjs");
    await useConsumableUp(chosen.actor, chosen.item);
  }
  return `<em>${esc(chosen.spec.label)}${chosen.actor !== saver ? ` (${esc(chosen.actor.name)})` : ""}: ${esc(saver.name)}'s ${esc(first.degree.label)} (${first.total}) is rerolled — the second result stands${chosen.spec.destroy ? `; ${esc(chosen.item.name)} is destroyed` : ""}.</em>`;
}
