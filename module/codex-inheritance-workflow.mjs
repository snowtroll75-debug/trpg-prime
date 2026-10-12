/**
 * The Foundry half of Codex inheritance (3.631.0). See codex-inheritance.mjs.
 *
 *   buildCodexIndexFromPacks   at ready: the two packs' entries → the index
 *   applyCodexInheritance      called from TRGItem.prepareBaseData
 *   registerCodexInheritance   builds the index, then resets every actor so
 *                              prepared data (senses, DR, auras) sees it
 *
 * THE INDEX IS BUILT ONCE PER SESSION and never from a world item: the
 * packs are locked, so an entry cannot change between two prepares, and a
 * world's own ability items are copies, not entries.
 */
import { buildCodexIndex, inheritedCodexFlags, CODEX_PACKS } from "./codex-inheritance.mjs";
import { contentPacksFor } from "./content-packs.mjs";

const SYSTEM_ID = "trg-prime";
let INDEX = null;

/** The live index, or null before ready. Exposed for the harness and the console. */
export function codexIndex() { return INDEX; }

async function buildCodexIndexFromPacks() {
  const entries = [];
  // Federated (3.628.0): the system's pack first, then every module pack
  // that extends it — a module's Codex addition is as much an entry as ours.
  for (const name of CODEX_PACKS) {
    for (const pack of contentPacksFor(name)) {
      const member = pack.collection ?? `${pack.metadata?.packageName}.${pack.metadata?.name}`;
      const docs = await pack.getDocuments();
      for (const doc of docs) {
        if (doc.type !== "ability") continue;
        entries.push({ pack: name, member, name: doc.name, flags: doc.flags });
      }
    }
  }
  INDEX = buildCodexIndex(entries);
  return INDEX;
}

/** In prepareBaseData: the copy takes its entry's declarations, in memory. */
export function applyCodexInheritance(item) {
  if (!INDEX || item?.type !== "ability") return false;
  const merged = inheritedCodexFlags({ type: item.type, name: item.name, flags: item.flags }, INDEX);
  if (!merged) return false;
  item.flags[SYSTEM_ID] = merged;
  return true;
}

export async function registerCodexInheritance() {
  try {
    await buildCodexIndexFromPacks();
  } catch (err) {
    console.warn("TRG Prime | Codex inheritance: the packs could not be indexed", err);
    return;
  }
  // Everything prepared before the index existed prepared without it.
  for (const actor of game.actors ?? []) actor.reset?.();
  for (const token of canvas?.tokens?.placeables ?? []) {
    if (token.actor && !token.document?.actorLink) token.actor.reset?.();
  }
  console.info(`TRG Prime | Codex inheritance: ${INDEX.size} Codex entries indexed.`);
}
