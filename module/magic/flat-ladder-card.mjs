/**
 * The chat card a repeating curse posts when it bites.
 *
 * NEW at 3.485.0. Its own file so `flat-ladder-workflow.mjs` can be read
 * by a harness without dragging ChatMessage in behind it.
 */
export async function postCurseCard(actor, label, lines) {
  if (!lines?.length) return null;
  const body = lines.map((l) => `<p>${l}</p>`).join("");
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header">`
      + `<div class="check-heading"><span class="check-actor">${actor.name}</span>`
      + `<h3>${label} — the curse bites</h3></div></header>${body}</div>`
  });
}
