/**
 * EXTRA PP A CASTING MUST PAY (3.675.0; Eldritch Arts Block 1, C3).
 *
 *   ZHAL-VRYN (Nyrinn heritage): "All creatures within your Null Aura must
 *   expend an additional PP to cast spells (including cantrips)."
 *
 * A module registers `registerCastSurcharge(key, ctx => ({pp, label, lines}))`
 * and is asked when the casting's PP is tested. The surcharge is paid ON TOP:
 * it is not PP spent on the spell, so it raises no casting DC, counts against
 * no per-cast cap, and is paid whatever the degree (Graham's B1-6 proposal).
 * A caster who cannot pay it cannot cast, as with any cost.
 *
 * A FAILING SURCHARGE COSTS ITS OWN ANSWER, NOT THE CASTING: logged, and said
 * on the card, as a spell-check gate's is.
 */
import { registeredCastSurcharges } from "../module-api.mjs";

/**
 * What one surcharge said, cleaned: a whole number of PP ≥ 0, a label, lines.
 * @returns {{pp: number, label: string, lines: string[]}}
 */
export function normaliseSurcharge(out) {
  if (!out || typeof out !== "object") return { pp: 0, label: "", lines: [] };
  const pp = Math.max(0, Math.floor(Number(out.pp) || 0));
  const label = String(out.label ?? "").trim();
  const lines = (Array.isArray(out.lines) ? out.lines : []).filter((l) => typeof l === "string" && l.trim()).map((l) => l.trim());
  return { pp, label, lines };
}

/** The total of several answers, and the card's words. */
export function totalSurcharge(answers = []) {
  const rows = (answers ?? []).map(normaliseSurcharge).filter((a) => a.pp > 0 || a.lines.length);
  const pp = rows.reduce((sum, a) => sum + a.pp, 0);
  const labels = rows.filter((a) => a.pp > 0).map((a) => `${a.label || "a surcharge"} +${a.pp} PP`);
  return { pp, labels, lines: rows.flatMap((a) => a.lines) };
}

/**
 * Ask every registered surcharge, in registration order.
 * @param {object} ctx `{ actor, spell, spellData, innate, cantrip, itemCast, basePP, totalPP }`
 */
export async function runCastSurcharges(ctx) {
  const answers = [];
  const failed = [];
  for (const surcharge of registeredCastSurcharges()) {
    try {
      answers.push(await surcharge(ctx));
    } catch (err) {
      console.error("TRG Prime | a module's casting surcharge failed", err);
      failed.push("<em>A module's surcharge on this casting failed — see the console.</em>");
    }
  }
  const total = totalSurcharge(answers);
  return { ...total, lines: [...total.lines, ...failed] };
}
