/**
 * A PLAYER'S SCREEN OPENS ON THEIR OWN TOKEN'S LEVEL (3.666.3).
 *
 * Found live on 22 October 2026, logged in as Lewi. Foundry V14 scenes have
 * levels, and a client that loads a scene opens on its default level. On
 * Oldwatch Main every token stands on "Upper Signal Room", so Lewi's screen
 * drew none of them: his Orb of Fire had nobody to target (Graham: "Some
 * attack spells are not asking for a target"), and nothing that measures from
 * his own token (range, reach, flanking, the defence offer) could find it.
 *
 * So when a player's canvas is drawn on a level that shows none of their own
 * tokens, and one of their tokens stands on another level they may view, the
 * view moves there: their character's token first, else any token they own.
 * A player already looking at one of their tokens is left alone, so a level
 * they chose stays chosen. The GM, who looks wherever they like, is never
 * moved. The picker does the same for the acting creature at the moment it is
 * needed (targeting.mjs), for the GM too.
 */
import { levelForActor } from "./target-prompt.mjs";

/** Scene+level pairs already tried this session, so a refused view is not retried in a loop. */
const tried = new Set();

async function viewOwnLevel(cnv) {
  try {
    if (!globalThis.game?.user || game.user.isGM) return;
    const scene = cnv?.scene ?? null;
    if (!scene?.levels?.size || !cnv.level) return;
    const tokens = Array.from(scene.tokens ?? []);
    if (tokens.some((t) => t.isOwner && t.level === cnv.level.id)) return;
    const character = game.user.character ?? null;
    const actorId = (character && tokens.some((t) => t.actorId === character.id))
      ? character.id
      : tokens.find((t) => t.isOwner && t.level)?.actorId ?? "";
    if (!actorId) return;
    const level = levelForActor({
      tokens: tokens.filter((t) => t.isOwner).map((t) => ({ id: t.id, actorId: t.actorId, level: t.level ?? null })),
      actorId,
      viewedLevel: cnv.level.id
    });
    if (!level || !scene.levels.get(level)) return;
    const available = scene.availableLevels ? Array.from(scene.availableLevels).map((l) => l.id) : null;
    if (available && !available.includes(level)) return;
    const key = `${scene.id}:${level}`;
    if (tried.has(key)) return;
    tried.add(key);
    await scene.view({ level });
  } catch (error) {
    console.warn("TRG Prime | could not view your token's level", error);
  }
}

/** Installed once at ready. */
export function registerOwnLevelView() {
  Hooks.on("canvasReady", (cnv) => { viewOwnLevel(cnv); });
  // The canvas may already be drawn by the time this is installed.
  if (globalThis.canvas?.ready) viewOwnLevel(globalThis.canvas);
}
