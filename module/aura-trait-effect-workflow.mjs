/**
 * AN AURA THAT GRANTS A TRAIT FOR A WHILE (3.633.0; Fiends & Fables 3.0
 * block 3, ruling R7 — the Aboleth's Mucus Cloud).
 *
 * "…must make fortitude save or lose the ability to breath air but gain the
 * ability to breath water for 2 hours."
 *
 * Losing air and gaining water IS the Aquatic trait as 3.632.0 reads it
 * (combat/underwater.mjs `breathOnWaterline`): an aquatic creature holds its
 * breath out of the water, not in it. So a failed save lays an effect that
 * grants Aquatic (the `grantedTraits` flag a Form spell uses) for the declared seconds,
 * stamped with the world-time clock the condition sweep already honours
 * (`conditionExpiresTime`). The breath is then settled for where the
 * creature stands NOW — a hero on the bank begins holding their breath at
 * once; one already under water stops — and settled again when the effect
 * ends.
 */
import { isActingGM } from "./acting-gm.mjs";
import { hasCreatureTrait } from "./creature-traits.mjs";

const SYSTEM_ID = "trg-prime";
const FLAG = "auraTraitEffect";
const END_TIME_FLAG = "conditionExpiresTime";

/** Settle breathing for the actor's present place and traits. */
async function settleBreath(actor, source) {
  const token = actor?.getActiveTokens?.()[0]?.document ?? null;
  const { tokenIsUnderwater } = await import("./combat/underwater-workflow.mjs");
  const { breathOnWaterline } = await import("./combat/underwater.mjs");
  const { startHoldingBreath, restoreAir } = await import("./drowning-workflow.mjs");
  const underwater = token ? tokenIsUnderwater(token) : false;
  const aquatic = hasCreatureTrait(actor.system ?? {}, "aquatic");
  const want = breathOnWaterline({ entering: underwater, aquatic });
  if (want === "hold") await startHoldingBreath(actor, { source });
  else await restoreAir(actor);
}

/**
 * Lay the declared trait effect on the actor; the card line.
 * @param {Actor} actor
 * @param {{name: string, seconds: number, traits: string, text?: string}} effect
 */
export async function applyAuraTraitEffect(actor, effect, { source = "" } = {}) {
  if (!actor || !effect) return "";
  const now = Number(game.time?.worldTime ?? 0);
  // ONE AT A TIME: a second failure renews the clock rather than stacking.
  const existing = Array.from(actor.effects ?? []).find((e) => e.getFlag?.(SYSTEM_ID, FLAG)?.name === effect.name);
  // THE GRANT RIDES AS A FLAG (`grantedTraits`), which actor preparation
  // rebuilds into the derived field every time (form-traits.mjs
  // `effectGrantedTraits`) — so the trait leaves with the effect.
  const flags = { [SYSTEM_ID]: { [FLAG]: { name: effect.name, traits: effect.traits, source }, grantedTraits: effect.traits, [END_TIME_FLAG]: now + effect.seconds } };
  if (existing) {
    await existing.update({ [`flags.${SYSTEM_ID}.${END_TIME_FLAG}`]: now + effect.seconds });
  } else {
    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: effect.name,
      img: "icons/svg/water.svg",
      duration: { seconds: effect.seconds },
      flags
    }]);
    await settleBreath(actor, effect.name);
  }
  const hours = effect.seconds % 3600 === 0 ? `${effect.seconds / 3600} hour${effect.seconds === 3600 ? "" : "s"}` : `${effect.seconds} seconds`;
  return `<strong>${effect.name}</strong> — ${actor.name} gains <strong>${effect.traits}</strong> for ${hours}${effect.text ? `: ${effect.text}` : ""}.`;
}

export function registerAuraTraitEffectHooks() {
  Hooks.on("deleteActiveEffect", (effect) => {
    if (!isActingGM() || !effect.getFlag?.(SYSTEM_ID, FLAG)) return;
    const actor = effect.parent;
    if (!actor || actor.documentName !== "Actor") return;
    settleBreath(actor, `${effect.name} ends`).catch((e) => console.error(`${SYSTEM_ID} | aura trait effect`, e));
  });
}
