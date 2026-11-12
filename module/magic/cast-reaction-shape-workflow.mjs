/**
 * A CAST REACTION THAT SHAPES THE SPELL, applied (3.684.0; Eldritch Arts
 * Block 6, G17). The arithmetic is magic/cast-reaction-shape.mjs; this is the
 * one place the cast's own state is touched, right after the cast reactions
 * are asked and before anything is placed, rolled or saved.
 *
 * What it writes, and where it is read:
 *   area      `warpMods.areaOverride` — the template and every area reader
 *             go through `warpedAreaText`, which an override wins outright;
 *   duration  `warpMods.durationText` — `warpedDurationText`, likewise;
 *   dice      `warpMods.diceScale` — the spell attack's and the spell save's
 *             damage formulas (cast-workflow `resolveSpellAttack`,
 *             `resolveSpellSave`) pass through `scaleDiceCount`;
 *   targets   halved: the caster's targets are cut to the first N (said);
 *             doubled: the card says how many it may now affect, and the
 *             caster adds them — targets were chosen before the check;
 *   saveBias  `warpMods.saveBias` — read by the spell save's roll, only when
 *             nothing above could be scaled ("If the spell has no such
 *             variables, all targets … receive advantage");
 *   retarget  the caster's own token becomes the sole target (Reflective
 *             Warding: "as though they had cast it on themselves, using
 *             their own save DC" — the cast's DC is already the caster's).
 *             An area spell is said for the GM to resolve.
 */
import { warpedAreaText } from "./warp-area.mjs";
import { warpedDurationText } from "./active-spells.mjs";
import { scaledVariables, scaledLine } from "./cast-reaction-shape.mjs";

/** Set this user's targets to exactly these tokens (the targeting dialog's way). */
function setUserTargets(tokens) {
  const ids = new Set(tokens.map((t) => t?.id).filter(Boolean));
  if (globalThis.game?.user?.updateTokenTargets) {
    game.user.updateTokenTargets([...ids]);
    return;
  }
  for (const token of globalThis.canvas?.tokens?.placeables ?? []) {
    token.setTarget?.(ids.has(token.id), { user: game.user, releaseOthers: false });
  }
}

/**
 * @param {{actor: Actor, spell: Item, spellData: object, warpMods: object, effArea: string, isArea: boolean, reacted: {scale: number, saveBias: string, retargetCaster: boolean}}} ctx
 * @returns {Promise<string[]>} card lines (HTML)
 */
export async function applyCastReactionShape({ actor, spell, spellData = {}, warpMods, effArea = "", isArea = false, reacted = {} } = {}) {
  const lines = [];
  if (!warpMods || !reacted) return lines;
  const name = String(spell?.name ?? "The spell");

  /*
   * TURNED BACK (3.685.0, H5; Argent Reversal: "the effect is reflected back
   * to its source … When a spell is redirected using this spell, you use the
   * result of your Spellcraft check and Save DC to determine its results").
   * The sole target becomes the source's token, or the one the answer names;
   * the reactor's check and Save DC ride the warp channel, where the attack
   * and the save read them (`warpMods.turnBack`).
   */
  if (reacted.turnBack) {
    const tb = reacted.turnBack;
    const named = tb.target ? await fromUuid(tb.target).catch(() => null) : null;
    const token = named?.documentName === "Token" ? (named.object ?? null)
      : named?.documentName === "Actor" ? (named.getActiveTokens?.()?.[0] ?? null)
      : named ? null : (actor?.getActiveTokens?.()?.[0] ?? null);
    warpMods.turnBack = { checkTotal: tb.checkTotal, saveDC: tb.saveDC };
    if (isArea || !token) {
      lines.push(`<em>${name} is turned back${token?.name ? ` on ${token.name}` : ""}: an area spell (or a target with no token) is resolved by the GM${tb.saveDC ? ` — Save DC ${tb.saveDC}` : ""}.</em>`);
    } else {
      setUserTargets([token]);
      lines.push(`<strong>${name} is turned back on ${token.name}</strong>${tb.checkTotal !== null ? ` — the reactor's check, ${tb.checkTotal}, is the casting check` : ""}${tb.saveDC ? `, and its Save DC is ${tb.saveDC}` : ""}.`);
    }
  }
  /*
   * SPARED (3.685.0, H5; Spectral Aegis, Q152: "an area spell spares only
   * the target"). A targeted spell loses the creature from its targets; an
   * area spell leaves it out of whatever its template catches.
   */
  if (Array.isArray(reacted.exclude) && reacted.exclude.length) {
    warpMods.excludeUuids = [...new Set([...(warpMods.excludeUuids ?? []), ...reacted.exclude])];
    const before = Array.from(globalThis.game?.user?.targets ?? []);
    const kept = before.filter((t) => !reacted.exclude.includes(t?.actor?.uuid) && !reacted.exclude.includes(t?.document?.uuid));
    if (kept.length !== before.length) setUserTargets(kept);
    const spared = before.filter((t) => !kept.includes(t)).map((t) => t?.name ?? t?.actor?.name ?? "?");
    lines.push(`<strong>${name} does not land on ${spared.length ? spared.join(", ") : "the creature that warded itself"}</strong>${isArea ? " — the area spares it." : "."}`);
  }

  if (reacted.retargetCaster) {
    const own = actor?.getActiveTokens?.()?.[0] ?? null;
    if (isArea || !own) {
      lines.push(`<em>${name} is turned back on its caster: an area spell (or a caster with no token) is resolved by the GM — centre it on ${actor?.name ?? "the caster"}.</em>`);
    } else {
      setUserTargets([own]);
      lines.push(`<strong>${name} is turned back on ${actor.name}</strong> — as though cast on themselves, at their own DC.`);
    }
  }

  const scale = Number(reacted.scale ?? 1);
  const targetsNow = Array.from(globalThis.game?.user?.targets ?? []);
  const variables = scaledVariables({
    scale,
    areaText: warpedAreaText(effArea, warpMods),
    durationText: warpedDurationText(spellData.duration, warpMods),
    damageFormula: String(spellData.damage?.formula ?? ""),
    targetCount: reacted.retargetCaster ? 0 : targetsNow.length,
    isArea
  });
  if (scale !== 1) {
    if (variables.area) warpMods.areaOverride = variables.area;
    if (variables.duration) warpMods.durationText = variables.duration;
    if (variables.dice) warpMods.diceScale = scale;
    lines.push(scaledLine(name, scale, variables, { targetsBefore: targetsNow.length }));
    if (variables.targets !== null) {
      if (variables.targets < targetsNow.length) {
        const kept = targetsNow.slice(0, variables.targets);
        setUserTargets(kept);
        lines.push(`<em>Targets cut to ${kept.length}: ${kept.map((t) => t?.name ?? t?.actor?.name ?? "?").join(", ")} (the first chosen).</em>`);
      } else if (variables.targets > targetsNow.length) {
        lines.push(`<em>${name} may now affect up to ${variables.targets} targets — target the others and the GM applies it to them.</em>`);
      }
    }
  }
  // NO VARIABLE, SO THE SAVES (Counter Channel's "else" rung).
  if (reacted.saveBias && !(scale !== 1 && variables.any)) {
    warpMods.saveBias = reacted.saveBias;
    lines.push(`<strong>Every target saves against ${name} with ${reacted.saveBias}.</strong>`);
  }
  return lines;
}
