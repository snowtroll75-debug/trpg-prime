/**
 * A SUCCESS DECLARED INSTEAD OF ROLLED (3.630.0). Pillars of Faith, Prism
 * Lotus (Fate): "once within the next 24 hours, before rolling a d20 check,
 * attack roll or saving throw, you may declare the result a Success without
 * rolling; it cannot become a Critical or Heroic result."
 *
 * Asked from TRGCheck.roll once the dice are evaluated but before anybody
 * has seen them — the card is not posted until after this — so the choice
 * is made blind, which is what "before rolling" protects. A yes makes the
 * degree exactly Success (no shift, no bonus from a better one), says so on
 * the card, and spends the effect. Reroll and conversion offers are then
 * skipped: there is nothing left to improve.
 *
 *   flags.trg-prime.fateDeclare = { label: "Prism Lotus (Fate)" }
 */
import { convertedOutcome } from "../magic/save-convert.mjs";

const SYSTEM_ID = "trg-prime";

/** The first effect on the actor that carries a declared Success. */
function fateDeclareSource(actor) {
  for (const effect of Array.from(actor?.appliedEffects ?? actor?.effects ?? [])) {
    if (effect?.disabled) continue;
    const raw = effect?.flags?.[SYSTEM_ID]?.fateDeclare;
    if (raw && typeof raw === "object") return { effect, label: String(raw.label ?? effect.name ?? "Fate") };
  }
  return null;
}

/** @returns {Promise<string|null>} the card line */
export async function offerFateDeclare(check) {
  if (!check?.actor || check.flat || !check.outcome?.degree?.key) return null;
  const source = fateDeclareSource(check.actor);
  if (!source) return null;
  if (!check.actor.isOwner) return null;
  const { DialogV2 } = foundry.applications.api;
  const yes = await DialogV2.confirm({
    window: { title: `${source.label} — ${check.actor.name}` },
    content: `<p>${check.label ? `<strong>${check.label}</strong>: ` : ""}declare this a <strong>Success</strong> without rolling? `
      + `It cannot become a Critical or Heroic result, and ${source.label} is then spent.</p>`,
    rejectClose: false
  });
  if (!yes) return null;
  const converted = convertedOutcome(check.outcome, "success");
  check.outcome = { ...converted, shiftedFrom: undefined, declared: true };
  // NO CONVICTION ON A DECLARED SUCCESS (3.630.1, F2): "+1d6" to dice that
  // do not count bought nothing, and the card still offered it. Marked as a
  // fortune effect, which is what closes the button and every reroll.
  check.luckUsed = true;
  try {
    if (source.effect?.parent?.effects?.get?.(source.effect.id)) await source.effect.delete();
  } catch (_e) { /* the line below still tells the table */ }
  return `${source.label}: a <strong>Success</strong> is declared — the dice do not count. ${source.label} is spent.`;
}
