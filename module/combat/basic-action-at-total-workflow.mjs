/**
 * An action resolved at a total already rolled — the Foundry half of
 * `basicActionAtTotal` (magic/spell-maneuver.mjs). NEW at 3.692.0, for
 * Eldritch Arts Block 7's Spirit Arrow: "is also treated as a Feint, Grapple
 * (1 round), Shove or Trip action using the attackers attack result to
 * determine success".
 *
 * WHAT IT DOES: reads the action's own data (its DC, its difficulty, its
 * size penalty), takes the degree from the reused total, and lands what that
 * degree applies through the same tables and appliers the action and
 * Tanglefoot's spell manoeuvre use — the conditions, a Shove's push, and the
 * outcome text's own clock. It rolls nothing and spends no AP; whoever calls
 * it has already paid for the attack whose total it reuses, so it does not
 * advance the multiple attack penalty either.
 *
 * `rounds` overrides the clock when the caller prints one ("Grapple (1
 * round)"). Without it, the action's outcome text decides, as Spectral
 * Grasp's chosen manoeuvre does.
 */

import { basicActionAtTotal, spellManeuverEffects, maneuverPushFeet, maneuverOutcomeText } from "../magic/spell-maneuver.mjs";

const esc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The action's data, from the basic or the skill actions. */
async function actionData(actionKey) {
  const { BASIC_ACTIONS } = await import("../data/basic-actions.mjs");
  const basic = BASIC_ACTIONS.find((a) => a.key === actionKey);
  if (basic) return basic;
  const { SKILL_ACTIONS } = await import("../data/skill-actions.mjs");
  return SKILL_ACTIONS.find((a) => a.key === actionKey) ?? null;
}

/**
 * Resolve `actionKey` by `actor` against `target` at `total`.
 *
 * @param {Actor} actor
 * @param {Actor} target
 * @param {string} actionKey e.g. "feint", "grappleAttack", "shoveAttack", "tripAttack"
 * @param {{total: number, label?: string, rounds?: number|null}} opts
 * @returns {Promise<{ok: boolean, degree: string, dc: number|null, total: number, lines: string[]}>}
 */
export async function resolveBasicActionAtTotal(actor, target, actionKey, { total, label = "", rounds = null, direct = false } = {}) {
  const lines = [];
  const data = await actionData(String(actionKey ?? ""));
  const name = data?.name?.replace(/ Attack$/, "") ?? String(actionKey ?? "");
  const title = esc(label || name);
  if (!actor || !target || !data) {
    lines.push(`<em>${title}: nothing to resolve (${!data ? "unknown action" : "no target"}).</em>`);
    return { ok: false, degree: "", dc: null, total: Number(total), lines };
  }
  // ON THE GM'S CLIENT WHEN THIS ONE MAY NOT WRITE TO THE TARGET (found in
  // review): the conditions' clock, who holds the grab and a Shove's push are
  // all writes on the target. The relay runs this same function there.
  if (!direct) {
    const { relayActionAtTotal } = await import("./target-relay-workflow.mjs");
    let relayed = null;
    const viaRelay = await relayActionAtTotal(actor, target, { actionKey: data.key, total: Number(total), label: String(label ?? ""), rounds }, async () => {
      relayed = false;
      return null;
    });
    if (relayed === null) {
      if (viaRelay?.lines?.length) return viaRelay;
      lines.push(`<em>${title}: the GM's client did not resolve ${esc(name)} against ${esc(target.name)} (${esc(viaRelay?.reason ?? "no answer")}) — resolve it by hand at ${Number(total)}.</em>`);
      return { ok: false, degree: "", dc: null, total: Number(total), lines };
    }
  }
  const { actionTargetDC } = await import("./action.mjs");
  const against = data.against ?? "none";
  const dcRow = actionTargetDC(against, target.system ?? null, null, actor.system ?? null);
  const res = basicActionAtTotal({
    actionKey: data.key,
    total,
    dc: dcRow.dc,
    difficulty: data.difficulty ?? "medium",
    actorSize: actor.system?.identity?.size,
    targetSize: target.system?.identity?.size
  });
  if (!res.ok) {
    lines.push(`<em>${title}: ${esc(target.name)} has no ${esc(dcRow.label ?? "DC")} to resolve ${esc(name)} against — resolve it by hand.</em>`);
    return { ok: false, degree: "", dc: null, total: res.total, lines };
  }

  const outcomeText = maneuverOutcomeText(data, res.degree);
  let expiresRound = null;
  if (game.combat?.started) {
    let r = Number(rounds);
    if (!(Number.isFinite(r) && r > 0)) {
      const { extractDurationRounds } = await import("../magic/effect-duration.mjs");
      r = Number(extractDurationRounds(outcomeText)) || 0;
    }
    if (r > 0) expiresRound = Number(game.combat.round ?? 0) + r;
  }
  const applied = spellManeuverEffects(data.key, res.degree);
  const { applyBasicActionConditionEffects } = await import("./basic-action-conditions.mjs");
  await applyBasicActionConditionEffects(applied, actor, target, { expiresRound, actionKey: data.key });
  // WHO HOLDS THE GRAB, WHO LEFT IT FLAT-FOOTED (found in review), as the
  // action itself records them (action-workflow.mjs): Constrict and Swallow
  // read "grabbed by it", Unseen Assault "flat-footed to you".
  const SYSTEM_ID = "trg-prime";
  if (data.key === "feint" && target.hasCondition?.("flatFooted") && target.setFlag) {
    await target.setFlag(SYSTEM_ID, "flatFootedFrom", { uuid: actor.uuid, name: actor.name, action: data.key, round: Number(game.combat?.round ?? 0) });
  }
  if (data.key === "grappleAttack" && target.hasCondition?.("grabbed") && target.setFlag) {
    await target.setFlag(SYSTEM_ID, "grabbedBy", { uuid: actor.uuid, name: actor.name, round: Number(game.combat?.round ?? 0) });
  }

  const after = [];
  const pushFeet = maneuverPushFeet(data.key, res.degree);
  if (pushFeet) {
    const { forceMoveAway } = await import("./forced-movement-workflow.mjs");
    const moved = await forceMoveAway(actor, target, pushFeet);
    after.push(`<em>${moved.text}</em>`);
  }
  const sizeNote = res.sizeModifier ? `, ${res.sizeModifier} for size` : "";
  lines.push(
    `${title} — ${esc(name)} against ${esc(target.name)} at the attack total `
    + `${res.total}${sizeNote} vs DC ${res.dc}: <strong>${esc(res.degree)}</strong>`
    + (applied.length
      ? ` — ${applied.map((e) => `${e.target === "self" ? `${esc(actor.name)} ` : ""}${e.active ? "" : "no longer "}${e.conditionKey}`).join(", ")}.`
      : after.length ? "." : " — no effect.")
  );
  lines.push(...after);
  // NO ENCOUNTER, NO CLOCK — said, as the action says it.
  const printedRounds = Number(rounds) > 0 ? Number(rounds) : 0;
  if (!game.combat?.started && applied.some((e) => e.active) && (printedRounds || /until|round|turn/i.test(outcomeText))) {
    lines.push(`<em>${printedRounds ? `Lasts ${printedRounds} round${printedRounds === 1 ? "" : "s"}` : "It has a clock"} — no encounter running, so clear it by hand.</em>`);
  }
  return { ok: true, degree: res.degree, dc: res.dc, total: res.total, lines };
}
