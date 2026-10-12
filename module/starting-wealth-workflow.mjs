import {
  GP_PER_WEALTH_POINT,
  purseAfterGrant,
  startingWealthFor,
  startingWealthGranted
} from "./starting-wealth.mjs";

const SYSTEM_ID = "trg-prime";

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${title}</h3></div></header>${lines.join("")}</div>`
  });
}

/** "Charisma +2, Background: Merchant +2, Class: Rogue +2" */
export function breakdownText(wealth) {
  return (wealth?.parts ?? [])
    .map((part) => {
      const value = Number(part.value) || 0;
      const sign = value >= 0 ? `+${value}` : `${value}`;
      return part.note ? `${part.label} ${sign} (${part.note})` : `${part.label} ${sign}`;
    })
    .join(", ");
}

/**
 * Pay a character their starting coin, once.
 *
 * Chapter 6 ends with a case that is NOT a payout: "a characters wealth
 * score may start below 0 and this will indicate a character who begins
 * in debt or is indebted to an employer, lord, master etc. If your
 * character begins with a wealth score of 0 or less you will have to
 * determine the exact details with your GM."
 *
 * So a score of 0 or less posts the card and records that the character
 * has taken their starting wealth — because they have, and it was
 * nothing — rather than adding a negative number of gold pieces to a
 * purse. The debt itself is a table conversation the system has no
 * business inventing terms for.
 */
export async function grantStartingWealth(actor) {
  if (!actor) return null;

  if (startingWealthGranted(actor)) {
    ui.notifications.warn(`${actor.name} has already taken their starting wealth.`);
    return null;
  }

  const wealth = startingWealthFor(actor);

  if (wealth.pending) {
    ui.notifications.warn(
      "This character's background prints a wealth formula that has not been rolled. " +
      "Remove and re-add the background to roll it."
    );
    return null;
  }

  const breakdown = breakdownText(wealth);

  if (wealth.indebted) {
    await actor.setFlag(SYSTEM_ID, "startingWealthGranted", true);
    await postCard(actor, "Starting Wealth", [
      line(`<strong>Wealth score ${wealth.score}</strong> — ${breakdown}.`),
      line(
        "A wealth score of 0 or less means a character who begins in debt, or indebted to " +
        "an employer, lord or master. <strong>Settle the exact details with your GM</strong> " +
        "(Chapter 6). No starting coin has been added."
      )
    ]);
    return wealth;
  }

  await actor.update({
    "system.currency": purseAfterGrant(actor.system?.currency, wealth.gp),
    [`flags.${SYSTEM_ID}.startingWealthGranted`]: true
  });

  // A NEW CHARACTER ABOVE 1ST LEVEL (3.619.0; Chapter 12, page 393, Graham's
  // R5): the table's figure for the level, instead of the Chapter 6 score —
  // startingWealthFor has already put it in `gp`, and cleared `pending` and
  // `indebted`, which are the score's questions.
  await postCard(actor, "Starting Wealth", wealth.byLevel
    ? [
      line(`A new character entering play at <strong>level ${wealth.level}</strong> starts with <strong>${wealth.gp} gp</strong> (Chapter 12's Starting Wealth Table), added to the purse.`),
      line("<em>Above 1st level the table replaces the Chapter 6 wealth score.</em>")
    ]
    : [
      line(`<strong>Wealth score ${wealth.score}</strong> — ${breakdown}.`),
      line(`${wealth.score} × ${GP_PER_WEALTH_POINT} gp = <strong>${wealth.gp} gp</strong>, added to the purse.`)
    ]);

  return wealth;
}
