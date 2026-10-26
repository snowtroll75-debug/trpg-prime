/**
 * Foretell Failure at the table (3.672.0; C8). See dice/foretell.mjs for the
 * rule and the sum.
 *
 * ASKED IN `TRGCheck.roll`, before the dice — the one door every d20 check in
 * the system passes, so the next check is the next check whatever started it.
 *
 * WHO ANSWERS. A known DC is answered by the sum. A DC the GM sets afterwards
 * is put to the GM (Graham's B8-6) through Foundry's own user query, and the
 * check waits. The GM rolling answers in their own dialog; with no GM
 * connected, the roller is asked to give the GM's answer.
 *
 * "YOU MUST TAKE THE ACTION" (interpretation 4): when a 10 succeeds the check
 * is rolled, no question asked.
 *
 * "YOU CAN TAKE A DIFFERENT ACTION". A skill action asks before it spends
 * anything (`withdrawable`, from `TRGCheck.preview` in action-workflow), and
 * when a 10 would fail it may be called back at no cost. Any other check — a
 * Strike, whose AP and defender's reactions are already spent by its roll; a
 * save; a casting's check — is told at the roll, and the card says the answer
 * without offering what it cannot give.
 *
 * SPENT EITHER WAY: the foretelling is used by the check it answered.
 */
import { FORETELL_FLAG, foretellApplies, foretellEffects, foretellLine, foretellVerdict } from "./foretell.mjs";

/** The user query a GM answers when the DC is theirs to set. */
const FORETELL_QUERY = "trg-prime.foretell";

/** Registered at init: the GM's side of the question. */
export function registerForetellQuery() {
  if (!globalThis.CONFIG) return;
  CONFIG.queries ??= {};
  CONFIG.queries[FORETELL_QUERY] = async (data) => askLocally(data);
}

/** The question itself, on whichever client is answering. */
async function askLocally({ actorName = "", label = "", total = 0, spellName = "", relayed = false } = {}) {
  const { DialogV2 } = foundry.applications.api;
  const answer = await DialogV2.wait({
    window: { title: `${spellName || "Foretell Failure"} — would a 10 succeed?` },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><p><strong>${actorName}</strong> is about to roll `
      + `<strong>${label}</strong>, and its DC has not been set.</p><p>With a 10 on the die the total is `
      + `<strong>${total}</strong>. Would that succeed?</p>`
      + (relayed ? `<p class="hint">No GM is connected — answer as the GM rules it.</p>` : "")
      + `</div>`,
    buttons: [
      { action: "yes", label: "It would succeed" },
      { action: "no", label: "It would not", default: true }
    ],
    rejectClose: false
  });
  return answer === "yes";
}

/** Ask the GM, or answer here when this client is the GM or none is connected. */
async function gmAnswer(payload) {
  const gm = game.users?.activeGM ?? null;
  if (!gm || gm.isSelf || gm.id === game.user?.id) return askLocally({ ...payload, relayed: !gm });
  if (typeof gm.query !== "function") return askLocally({ ...payload, relayed: true });
  try {
    return Boolean(await gm.query(FORETELL_QUERY, payload, { timeout: 5 * 60 * 1000 }));
  } catch (err) {
    console.warn("TRG Prime | the GM did not answer Foretell Failure; asking here", err);
    return askLocally({ ...payload, relayed: true });
  }
}

/**
 * Answer a waiting foretelling for this check.
 *
 * @param {object} check the TRGCheck about to be evaluated
 * @param {{withdrawable?: boolean}} [options]
 * @returns {Promise<"take"|"withdraw"|null>} null when nothing was foretold
 */
export async function answerForetell(check, { withdrawable = false } = {}) {
  if (!foretellApplies(check)) return null;
  const waiting = foretellEffects(check.actor.appliedEffects ?? check.actor.effects ?? []);
  if (!waiting.length) return null;
  const effect = waiting[0];
  const spellName = String(effect.name ?? "").trim() || "Foretell Failure";

  // A CONDITION THAT FORCES THE RESULT (review): Immobilised and Paralyzed
  // fail every Reflex save, so a 10 cannot succeed.
  const { reflexAutoFail } = await import("../conditions/condition-rules.mjs");
  const forcedFailure = check.type === "save" && String(check.subject ?? "").toLowerCase() === "reflex"
    && Boolean(reflexAutoFail(check.actor?.conditions?.effective));
  let verdict = foretellVerdict(check, { forcedFailure });
  let gmAnswered = false;
  // A DC NOBODY HAS SET, ON A CHECK ALREADY UNDER WAY: the answer changes
  // nothing, so the GM is not kept waiting for it (review). The card gives
  // the sum.
  if (!verdict.known && !withdrawable) {
    await effectGone(effect, spellName, check);
    check.extraDetailLines = [...(check.extraDetailLines ?? []),
      `<strong>${spellName}:</strong> a 10 on the die makes ${verdict.total}; the DC is not set yet, so the GM says whether that succeeds.`];
    return "take";
  }
  if (!verdict.known) {
    const succeeds = await gmAnswer({
      actorName: check.actor.name, label: check.label, total: verdict.total, spellName
    });
    verdict = { ...verdict, known: true, succeeds };
    gmAnswered = true;
  }

  // SPENT BY THE CHECK IT ANSWERED, whatever is decided next.
  await effectGone(effect, spellName, check);

  const said = foretellLine(spellName, verdict, { gmAnswered });
  if (verdict.succeeds) {
    check.extraDetailLines = [...(check.extraDetailLines ?? []), said];
    return "take";
  }
  if (!withdrawable) {
    check.extraDetailLines = [...(check.extraDetailLines ?? []), `${said} <em>This roll is already under way, so it is made.</em>`];
    return "take";
  }
  const { DialogV2 } = foundry.applications.api;
  const choice = await DialogV2.wait({
    window: { title: `${spellName} — ${check.label}` },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog"><p>${said}</p><p class="hint">You may take a different action instead; `
      + `nothing has been spent on this one.</p></div>`,
    buttons: [
      { action: "take", label: "Take it anyway" },
      { action: "withdraw", label: "Take a different action", default: true }
    ],
    rejectClose: false
  });
  if (choice === "take") {
    check.extraDetailLines = [...(check.extraDetailLines ?? []), `${said} <em>Taken anyway.</em>`];
    return "take";
  }
  return "withdraw";
}

/** Spend the foretelling; a failure to clear it is said on the card. */
async function effectGone(effect, spellName, check) {
  try {
    await effect.delete();
  } catch (err) {
    console.warn(`TRG Prime | could not spend ${spellName}`, err);
    check.extraDetailLines = [...(check.extraDetailLines ?? []), `<em>${spellName} was used but could not be cleared — remove it by hand.</em>`];
  }
}

export { FORETELL_FLAG };
