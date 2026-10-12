/**
 * Save conversion, the Foundry half (3.627.0). See save-convert.mjs.
 * Asked after every reroll offer, from the saver's own client side, once the
 * degree is final.
 */
import { convertTarget, convertedOutcome, declaredSaveConverts, declaredSaveConvertSources, saveConvertVerdict } from "./save-convert.mjs";
import { DEGREE_BY_KEY } from "../dice/resolution.mjs";

const SYSTEM_ID = "trg-prime";
const USED_FLAG = "strikeRidersUsed";

/** @returns {Promise<string|null>} the card line */
export async function offerSaveConvert(check) {
  const saver = check?.actor;
  const degree = check?.outcome?.degree;
  if (!saver || !degree?.key || check.type !== "save") return null;
  const effects = Array.from(saver.appliedEffects ?? saver.effects ?? []);
  if (!declaredSaveConverts(effects).length) return null;
  const sources = declaredSaveConvertSources(effects);
  const used = saver.getFlag?.(SYSTEM_ID, USED_FLAG) ?? {};
  const conditions = Array.from(saver.statuses ?? []);
  for (const { spec, effect } of sources) {
    const verdict = saveConvertVerdict(spec, { save: check.subject, degree: degree.key, traits: check.traits, conditions, used });
    if (!verdict) continue;
    const to = convertTarget(spec, degree.key);
    if (!to) continue;
    const toLabel = DEGREE_BY_KEY[to]?.label ?? to;
    const { DialogV2 } = foundry.applications.api;
    const cost = spec.cost ? `become <strong>${spec.cost.condition} ${spec.cost.value}</strong> until the end of your next turn and ` : "";
    const gate = verdict === "ask" ? `<p class="hint">${spec.label} answers a save against ${spec.traits.join(", ")} — the table decides whether this one was.</p>` : "";
    const left = spec.uses ? ` (${spec.uses} use${spec.uses === 1 ? "" : "s"} left.)` : "";
    const yes = await DialogV2.confirm({
      window: { title: `${spec.label} — ${saver.name}` },
      content: `<p><strong>${saver.name}</strong>'s ${check.subject} save is a <strong>${degree.label}</strong>. `
        + `Use ${spec.label} to ${cost}${spec.improve ? "improve it to" : "treat it as"} a <strong>${toLabel}</strong>?${spec.oncePerRound ? " (Once per round.)" : ""}${left}</p>${gate}`,
      rejectClose: false
    });
    if (!yes) continue;
    const first = degree.label;
    check.outcome = convertedOutcome(check.outcome, to);
    if (spec.uses) await spendSaveConvertUse(effect, spec);
    if (spec.cost) {
      const { applyConditionTags } = await import("../combat/effect-application-workflow.mjs");
      const { conditionLabel } = await import("../conditions/condition-rules.mjs");
      await applyConditionTags(saver, [{
        key: spec.cost.condition, label: conditionLabel(spec.cost.condition), value: spec.cost.value,
        // "UNTIL THE END OF YOUR NEXT TURN" — one round on, as the core stamps "next turn".
        ...(game.combat?.started ? { expiresRound: Number(game.combat.round ?? 0) + 1 } : { expiresTime: Number(game.time?.worldTime ?? 0) + 12 })
      }], {});
    }
    if (spec.oncePerRound) await saver.setFlag(SYSTEM_ID, USED_FLAG, { ...used, [`convert:${spec.label}`]: true });
    return `<em>${spec.label}: ${saver.name}'s ${first} is ${spec.improve ? "improved to" : "treated as"} a ${toLabel}${spec.cost ? ` — ${spec.cost.condition} ${spec.cost.value} until the end of ${saver.name}'s next turn` : ""}.</em>`;
  }
  return null;
}

/** One use of a counted conversion spent; the effect goes with the last (3.630.0). */
async function spendSaveConvertUse(effect, spec) {
  try {
    if (!effect?.parent?.effects?.get?.(effect.id)) return;
    const left = Math.max(0, (Number(spec.uses) || 1) - 1);
    if (left <= 0) await effect.delete();
    else await effect.update({ [`flags.${SYSTEM_ID}.saveConvert.uses`]: left });
  } catch (_e) { /* the card has already said it was used */ }
}
