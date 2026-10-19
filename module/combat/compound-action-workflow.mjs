/**
 * The Foundry half of compound actions (3.631.0). See combat/compound-action.mjs.
 *
 *   useCompoundAction       the Use button: cooldown, AP, the self effect,
 *                           the first movement leg armed, the strike card
 *   registerCompoundHooks   the strike buttons on that card
 *
 * THE LEG IS ARMED, NOT MOVED. The movement workflow already arms Step,
 * Crawl and Charge so the player's own drag carries the action's rules;
 * a compound leg is armed the same way under the key `compoundLeg`, with
 * its limit on the actor (`flags.trg-prime.compoundLeg`) and no AP of its
 * own — the action already paid.
 */
import { compoundOf, compoundLegs, compoundStrikes, compoundMapRule, compoundStrikeOptions, compoundAvailable, compoundChooseLimit, compoundStrikeAllowed, compoundPickAllowed, compoundStrikeTotal,
  compoundModes, compoundWithMode, compoundStrikeCount } from "./compound-action.mjs";
import { bindOnce } from "../dice/check-card-interactions.mjs";
import { CHANGE_TYPE } from "../effect-change-types.mjs";

const SYSTEM_ID = "trg-prime";
const COMPOUND_LEG_FLAG = "compoundLeg";
const line = (text) => `<p style="margin:2px 0">${text}</p>`;

function speedsOf(actor) {
  const mv = actor?.system?.combat?.movement ?? {};
  const read = (k) => { const v = mv[k]; return Number(typeof v === "object" ? v?.total ?? v?.base : v) || 0; };
  return { land: read("land"), fly: read("fly"), swim: read("swim"), climb: read("climb"), burrow: read("burrow") };
}

/** Arm one movement leg on the actor, free of AP. */
export async function armCompoundLeg(actor, leg, label) {
  const { armMovementAction } = await import("./movement-workflow.mjs");
  await actor.setFlag(SYSTEM_ID, COMPOUND_LEG_FLAG, { ...leg, label, armedRound: Number(game.combat?.round ?? 0) });
  return armMovementAction(actor, "compoundLeg");
}

export async function useCompoundAction(actor, item) {
  let spec = compoundOf(item);
  if (!spec || !actor) return false;
  // MODES (3.640.0, Storm of Blades): asked first, before any AP.
  const modes = compoundModes(spec);
  if (modes.length) {
    const { DialogV2 } = foundry.applications.api;
    const picked = await DialogV2.wait({
      window: { title: item.name },
      classes: ["trg-prime"],
      content: `<div class="trg-prime"><p>Which way does ${actor.name} use ${item.name}?</p></div>`,
      buttons: modes.map((m, i) => ({ action: `mode-${i}`, label: m.label, default: i === 0, callback: () => i })),
      rejectClose: false
    }).catch(() => null);
    if (picked === null || picked === undefined || !modes[picked]) return false;
    spec = compoundWithMode(spec, modes[picked]);
  }
  const worldTime = Number(game.time?.worldTime ?? 0);
  const available = compoundAvailable(item, worldTime);
  if (!available.ok) { ui.notifications?.warn(`${item.name}: ${available.reason}.`); return false; }

  const ap = Math.max(0, Number(spec.ap) || 0);
  if (ap > 0) {
    const { ensureActionPoints, spendActionPoints } = await import("./action-points-workflow.mjs");
    if (!(await ensureActionPoints(actor, ap, item.name))) return false;
    await spendActionPoints(actor, ap, item.name);
  }
  if (Number(spec.cooldownSeconds) > 0) await item.setFlag(SYSTEM_ID, "lastUsedAt", worldTime);

  const legs = compoundLegs(spec, speedsOf(actor));
  const { strikes, missing } = compoundStrikes(spec, Array.from(actor.items ?? []));
  const mapRule = compoundMapRule(spec);
  const choose = compoundChooseLimit(spec);
  const lines = [];
  if (ap > 0) lines.push(line(`<strong>Cost:</strong> ${ap} AP${Number(spec.cooldownSeconds) > 0 ? ` — once every ${Math.round(Number(spec.cooldownSeconds) / 60)} minutes` : ""}.`));

  if (legs.length) {
    const first = legs[0];
    await armCompoundLeg(actor, first, item.name);
    lines.push(line(`<strong>Move:</strong> drag the token — up to <strong>${first.maxFeet} ft</strong> of ${first.speedKey} Speed, no AP${first.provokes ? "" : ", no reactions provoked"}.${first.note ? ` <em>${first.note}</em>` : ""}`));
  }

  // "ANY ATTACKS MADE AGAINST THE CREATURE WHEN IT TAKES THIS ACTION SUFFER
  // A -4 CIRCUMSTANCE PENALTY" (Pouncing Assault): a circumstance bonus to
  // its own DB until its next turn, on the round-expiry sweep.
  if (spec.selfEffect && Number(spec.selfEffect.defenceCircumstance)) {
    const round = Number(game.combat?.round ?? 0);
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: String(spec.selfEffect.label ?? item.name),
      img: item.img,
      changes: [{ key: "system.combat.defence.circumstance", type: CHANGE_TYPE.CUSTOM, value: String(Number(spec.selfEffect.defenceCircumstance)) }],
      flags: { [SYSTEM_ID]: { conditionExpiresRound: round + Math.max(1, Number(spec.selfEffect.rounds) || 1), compoundSelfEffect: item.name } }
    }]);
    lines.push(line(`<strong>Until its next turn:</strong> attacks against ${actor.name} are at -${Number(spec.selfEffect.defenceCircumstance)} (DB +${Number(spec.selfEffect.defenceCircumstance)} circumstance).`));
  }

  const buttons = [];
  const targetCount = game.user?.targets?.size ?? 0;
  strikes.forEach((strike, index) => {
    strike.count = compoundStrikeCount(strike, targetCount);
    for (let n = 0; n < strike.count; n += 1) {
      const extras = [strike.bonus ? `${strike.bonus.value > 0 ? "+" : ""}${strike.bonus.value} ${strike.bonus.type}` : "", strike.extraBaseDice ? `+${strike.extraBaseDice} base die` : "",
        strike.extraDamage ? `+${strike.extraDamage} damage${strike.onCritical ? `, ×${strike.onCritical.extraDamageMultiplier} and ${strike.onCritical.severityUp ? "deadly" : ""} on a critical` : ""}` : ""].filter(Boolean).join(", ");
      buttons.push(`<button type="button" data-action="compoundStrike" data-strike="${index}" data-nth="${n}">Strike: ${strike.weaponName}${extras ? ` (${extras})` : ""}</button>`);
    }
  });
  if (buttons.length) {
    const notes = [];
    if (strikes.some((s) => s.separateTargets)) notes.push("the strikes must be made against separate targets");
    if (mapRule.kind === "after") notes.push("the multiple attack penalty is counted after all the strikes");
    if (mapRule.kind === "fixed") notes.push(`each strike at a fixed ${mapRule.fixed} multiple attack penalty`);
    if (strikes.some((st) => st.perTarget)) notes.push(`one strike for each of the ${targetCount || 1} creature(s) targeted when it was used`);
    if (strikes.some((st) => st.pickGroup !== null && st.pickGroup !== undefined)) notes.push(`pick one of ${strikes.filter((st) => st.pickGroup !== null && st.pickGroup !== undefined).map((st) => st.weaponName).join(", ")} — the others are refused once it is made`);
    const standIn = strikes.find((st) => st.standsInFor);
    if (standIn) notes.push(`${actor.name} has no ${standIn.standsInFor}, so its natural Strikes stand in`);
    if (choose) notes.push(`choose ${choose === 1 ? "one" : choose} of them — the rest are refused once ${choose === 1 ? "it is" : "they are"} made`);
    lines.push(line(`<strong>Strikes:</strong> target each in turn and press its button${notes.length ? ` — ${notes.join("; ")}` : ""}.`));
    lines.push(`<p style="margin:6px 0 2px">${buttons.join(" ")}</p>`);
  }
  if (missing.length) lines.push(line(`<em>No weapon matched ${missing.join(", ")} on ${actor.name} — those strikes are not offered.</em>`));

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${item.name}${spec.modeLabel ? ` — ${spec.modeLabel}` : ""}</h3></div></header>${lines.join("")}</div>`,
    flags: { [SYSTEM_ID]: { compoundAction: { actorUuid: actor.uuid, itemId: item.id, strikes, mapRule, choose, label: item.name, used: {} } } }
  });
  return true;
}

/** A strike button pressed: roll it with the action's bonus and MAP rule. */
async function pressCompoundStrike(message, strikeIndex, nth) {
  const raw = message.getFlag(SYSTEM_ID, "compoundAction");
  if (!raw) return null;
  const key = `${strikeIndex}:${nth}`;
  if (raw.used?.[key]) return null;
  if (!compoundPickAllowed(raw.strikes, strikeIndex, raw.used)) { ui.notifications?.warn(`${raw.label}: only one of those strikes may be made.`); return null; }
  if (!compoundStrikeAllowed(raw.choose, raw.used)) { ui.notifications?.warn(`${raw.label}: only ${Number(raw.choose) === 1 ? "one strike" : `${raw.choose} strikes`} may be made.`); return null; }
  const actorDoc = await fromUuid(raw.actorUuid).catch(() => null);
  const actor = actorDoc?.actor ?? actorDoc;
  const strike = raw.strikes?.[strikeIndex];
  const weapon = actor?.items?.get?.(strike?.weaponId);
  if (!actor || !weapon) { ui.notifications?.warn("That creature or weapon is no longer there."); return null; }
  const { rollWeaponAttack } = await import("./attack-workflow.mjs");
  const options = compoundStrikeOptions(strike, raw.mapRule, raw.label);
  const result = await rollWeaponAttack(actor, weapon, options);
  const used = { ...(raw.used ?? {}), [key]: true };
  await message.setFlag(SYSTEM_ID, "compoundAction", { ...raw, used });
  // "Double Strike counts towards multiple attack penalty but not until
  // after the attacks have been resolved": when the last strike has been
  // pressed, the counter advances by the number of strikes made.
  const total = compoundStrikeTotal(raw.strikes ?? []);
  if (raw.mapRule?.kind === "after" && Object.keys(used).length >= total) {
    const { sharedMapCount, setSharedMapCount } = await import("./mounted-workflow.mjs");
    await setSharedMapCount(actor, (await sharedMapCount(actor)) + total);
  }
  return result;
}

export function registerCompoundHooks() {
  Hooks.on("renderChatMessageHTML", (message, html) => {
    const raw = message.getFlag?.(SYSTEM_ID, "compoundAction");
    if (!raw) return;
    for (const button of html.querySelectorAll?.('[data-action="compoundStrike"]') ?? []) {
      const key = `${button.dataset.strike}:${button.dataset.nth}`;
      if (raw.used?.[key]) { button.disabled = true; button.textContent = `✓ ${button.textContent.replace(/^✓ /, "")}`; continue; }
      if (!compoundStrikeAllowed(raw.choose, raw.used) || !compoundPickAllowed(raw.strikes, Number(button.dataset.strike), raw.used)) { button.disabled = true; continue; }
      bindOnce(button, "click", async (event) => {
        event.preventDefault();
        button.disabled = true;
        try { await pressCompoundStrike(message, Number(button.dataset.strike), Number(button.dataset.nth)); }
        catch (err) { button.disabled = false; throw err; }
      });
    }
  });
}
