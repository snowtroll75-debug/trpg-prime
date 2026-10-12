/**
 * EARNING ENDEAVOUR FROM A CHECK — Chapter 12, page 392 (3.619.0, block 38;
 * Graham's R12, "your recommendation").
 *
 *   Heroic success with risk       2
 *   Heroic success without risk    1
 *   Blunder with risk              1
 *   Significant Challenge          1
 *
 *   "Be aware that a character can only earn one amount of endeavour from a
 *    single check."
 *
 * The field stays hand-edited (Graham's earlier decision, endeavour.mjs):
 * whether there was risk, and whether a task was a Significant Challenge,
 * are the GM's judgements. What this adds is the GM's buttons on the check
 * card itself — offered by the degree the dice produced, only while the
 * optional rule is on, only on a character's card, and spent once: after
 * one award the card says what was given and offers nothing more.
 */

const SYSTEM_ID = "trg-prime";

/** The four rows of the reward table. */
export const ENDEAVOUR_AWARDS = Object.freeze({
  heroicRisk: { amount: 2, label: "Heroic success with risk", degrees: ["heroic"] },
  heroic: { amount: 1, label: "Heroic success without risk", degrees: ["heroic"] },
  blunderRisk: { amount: 1, label: "Blunder with risk", degrees: ["blunder"] },
  challenge: { amount: 1, label: "Significant Challenge", degrees: null }
});

/** The flag on a check card that records its one award. */
const ENDEAVOUR_AWARD_FLAG = "endeavourAward";

/**
 * Which awards a card of this degree may offer, in the table's order. A
 * Significant Challenge is a success at a task beyond the character's
 * skill — any successful degree.
 *
 * @param {string} degree the card's degree key
 * @returns {string[]} award keys
 */
export function endeavourAwardsFor(degree) {
  const key = String(degree ?? "");
  const successful = ["success", "critical", "heroic"].includes(key);
  return Object.entries(ENDEAVOUR_AWARDS)
    .filter(([award, row]) => row.degrees ? row.degrees.includes(key) : (award === "challenge" && successful))
    .map(([award]) => award);
}

/**
 * May this card still award Endeavour? One amount per check.
 *
 * @param {{characterCard: boolean, enabled: boolean, alreadyAwarded: boolean, flat?: boolean}} state
 */
export function endeavourAwardOpen({ characterCard, enabled, alreadyAwarded, flat = false }) {
  return Boolean(characterCard && enabled && !alreadyAwarded && !flat);
}

/* ------------------------------------------------------------------ */
/* Foundry                                                             */
/* ------------------------------------------------------------------ */

/**
 * Add the GM's award buttons to a posted check card, or the line saying
 * what it gave. Called from the chat-render hook.
 */
export async function maybeAddEndeavourAward(message, html, cardActor) {
  if (!game.user?.isGM) return;
  const raw = message.getFlag(SYSTEM_ID, "checkCard");
  const check = message.getFlag(SYSTEM_ID, "check");
  if (!raw || !check) return;
  const card = html.querySelector?.(".trg-check-card");
  if (!card || card.querySelector(".endeavour-award")) return;

  const given = message.getFlag(SYSTEM_ID, ENDEAVOUR_AWARD_FLAG);
  if (given) {
    const note = document.createElement("div");
    note.className = "endeavour-award hint";
    note.innerHTML = `<i class="fa-solid fa-mountain"></i> Endeavour awarded: <strong>+${given.amount}</strong> (${given.label}).`;
    card.appendChild(note);
    return;
  }

  let enabled = false;
  try { enabled = Boolean(game.settings.get(SYSTEM_ID, "endeavourEnabled")); } catch { enabled = false; }
  if (!enabled) return;
  const actor = await cardActor(raw);
  if (!endeavourAwardOpen({ characterCard: actor?.type === "character", enabled, alreadyAwarded: false, flat: raw.flat })) return;

  const awards = endeavourAwardsFor(check.degree);
  if (!awards.length) return;
  // ONE SET OF BUTTONS (3.620.0; the 3.619.0 drive's F2). The render hook
  // fires again on every update, and each call awaited the actor above
  // before appending — three renders, three rows of buttons. Asked again
  // here, after the last await, so the check and the append are one step.
  if (card.querySelector(".endeavour-award")) return;

  const container = document.createElement("div");
  container.className = "endeavour-award conviction-bonus-control";
  container.innerHTML = awards.map((key) => {
    const row = ENDEAVOUR_AWARDS[key];
    return `<button type="button" class="gold-button small-button" data-endeavour-award="${key}" data-tooltip="${row.label} (Chapter 12). One award per check.">`
      + `<i class="fa-solid fa-mountain"></i> +${row.amount} Endeavour — ${row.label}</button>`;
  }).join("");
  card.appendChild(container);

  for (const button of container.querySelectorAll("[data-endeavour-award]")) {
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      for (const other of container.querySelectorAll("button")) other.disabled = true;
      await awardEndeavourFromCard(message, button.dataset.endeavourAward, cardActor);
    });
  }
}

/** Give a card's one award: the character's Endeavour rises, and the card records it. */
async function awardEndeavourFromCard(message, key, cardActor) {
  const row = ENDEAVOUR_AWARDS[key];
  if (!row || !game.user?.isGM) return null;
  // RE-READ, so a second GM click (or a second GM) cannot award twice.
  if (message.getFlag(SYSTEM_ID, ENDEAVOUR_AWARD_FLAG)) return null;
  const raw = message.getFlag(SYSTEM_ID, "checkCard");
  const actor = await cardActor(raw);
  if (actor?.type !== "character") return null;
  const before = Number(actor.system?.resources?.endeavour?.value ?? 0) || 0;
  await message.setFlag(SYSTEM_ID, ENDEAVOUR_AWARD_FLAG, { key, amount: row.amount, label: row.label });
  await actor.update({ "system.resources.endeavour.value": before + row.amount });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>Endeavour</h3></div></header>`
      + `<p style="margin:2px 0"><strong>+${row.amount} Endeavour</strong> — ${row.label}.</p>`
      + `<p style="margin:2px 0">Endeavour ${before} → <strong>${before + row.amount}</strong>.</p></div>`
  });
  return row.amount;
}
