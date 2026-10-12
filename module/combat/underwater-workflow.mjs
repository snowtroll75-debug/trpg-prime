/**
 * Underwater combat — the Foundry side of underwater.mjs (page 201).
 *
 * NEW at 3.580.0, for the block-20 audit's D2 and Graham's R2 of
 * 21 September 2026: "Yes", declared by a Region flag.
 *
 * WHAT LIVES HERE. Finding the water a token is standing in, keeping the
 * Submerged effect in step with it, and answering "is this creature in
 * the water" for the attack path. The rules themselves are pure and live
 * in underwater.mjs.
 *
 * THE REGION IS ASKED THE WAY `surfaces.mjs` LEARNED TO ASK IT (3.579.1,
 * F4): the Region's own token set first, because Foundry maintains it as
 * tokens move, and the PLACEABLE's `testPoint` as the fallback — never
 * the document's, which answers false for a point plainly inside.
 */

import { CHANGE_TYPE } from "../effect-change-types.mjs";
import { restoreAir, startHoldingBreath } from "../drowning-workflow.mjs";
import { regionContains } from "./surfaces.mjs";
import { speedValue } from "./speed-pool.mjs";
import { breathOnWaterline, underwaterFlatFooted, underwaterRegion, UNDERWATER_MARAUDER, UNDERWATER_RESISTANCES } from "./underwater.mjs";
import { hasCreatureTrait } from "../creature-traits.mjs";

const SYSTEM_ID = "trg-prime";

/** The effect this rule owns, so it only ever lifts its own. */
const SUBMERGED_EFFECT = "Submerged";

/**
 * The water this token is in, if any.
 *
 * @param {object} scene
 * @param {object} tokenDocument
 * @param {{x: number, y: number}} [centre]
 * @returns {{label: string}|null}
 */
function waterUnder(scene, tokenDocument, centre = null) {
  for (const region of Array.from(scene?.regions ?? [])) {
    const spec = underwaterRegion(region);
    if (!spec) continue;
    const inside = region.tokens?.has?.(tokenDocument)
      ?? (centre ? regionContains(region, centre) : false);
    if (inside) return spec;
  }
  return null;
}

/**
 * Is this creature underwater right now?
 *
 * TAKES A TOKEN, NOT AN ACTOR, because water is a place and an actor is
 * not in one — the same distinction the sidebar-versus-token defects of
 * 3.468.0, 3.579.1 and 3.579.2 were all about. A creature with no token
 * on a scene is not in any water.
 *
 * @param {object} tokenDocument
 * @returns {boolean}
 */
export function tokenIsUnderwater(tokenDocument) {
  try {
    const doc = tokenDocument?.document ?? tokenDocument ?? null;
    if (!doc) return false;
    const scene = doc.parent ?? doc.scene ?? null;
    return Boolean(waterUnder(scene, doc, tokenDocument?.center ?? doc.object?.center ?? null));
  } catch {
    return false;
  }
}

/**
 * The actor's swim Speed, for the flat-footed exemption.
 *
 * `system.combat.movement.swim`, MEASURED (3.580.1, F1). The first
 * version guessed three paths — `attributes.speeds.swim`,
 * `combat.speeds.swim`, `speeds.swim` — and every one of them is
 * `undefined` on a real actor, so a shark with a swim Speed of 30 was
 * flat-footed in its own sea and the card told it so: "for want of a
 * swim Speed".
 *
 * READ THROUGH `speedValue`, which is the project's own answer to this
 * exact class of mistake: a movement pool has two shapes and only that
 * helper knows both. `verify-speed-pool` refuses a raw
 * `Number(...movement.x.total)` anywhere in the tree — and it caught the
 * first draft of this fix, which is the check doing precisely what it
 * was built for.
 */
function swimSpeedOf(actor) {
  return speedValue(actor?.system?.combat?.movement?.swim) || 0;
}

/**
 * Put the Submerged effect on, or take it off, so it matches where the
 * token actually is.
 *
 * ONE EFFECT CARRYING BOTH HALVES. The page grants acid and fire
 * resistance in the same breath as it takes away your footing, and both
 * end when you leave the water, so they are one document rather than two
 * that can fall out of step.
 *
 * FLAT-FOOTED IS APPLIED SEPARATELY and only without a swim Speed:
 * "unless you have a swim Speed" is an exemption from that bullet alone —
 * a shark is still acid- and fire-resistant in its own sea.
 *
 * @param {Actor} actor
 * @param {object} tokenDocument
 * @returns {Promise<boolean>} whether anything changed
 */
export async function settleSubmersion(actor, tokenDocument) {
  if (!actor) return false;
  const underwater = tokenIsUnderwater(tokenDocument);
  const existing = Array.from(actor.effects ?? [])
    .find((e) => e.getFlag?.(SYSTEM_ID, "submerged"));

  if (!underwater) {
    if (!existing) return false;
    await existing.delete();
    if (existing.getFlag?.(SYSTEM_ID, "submergedFlatFooted")) {
      await actor.toggleStatusEffect("flatFooted", { active: false });
    }
    // AIR IS RESTORED BY LEAVING THE WATER (page 202). The breath began
    // when they went under, so it ends when they come up — and page
    // 202's own caveat applies: they wake only if nothing else is
    // holding them down.
    // AN AQUATIC CREATURE comes out of the water into air it cannot breathe
    // (3.632.0, ruling 6): the breath starts here instead.
    if (breathOnWaterline({ entering: false, aquatic: hasCreatureTrait(actor.system, "aquatic") }) === "hold") {
      await startHoldingBreath(actor, { source: "Aquatic — out of the water" });
    } else {
      await restoreAir(actor);
    }
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
        + `<strong>${actor.name} leaves the water.</strong> The acid and fire resistance `
        + "page 201 grants goes with it.</p></div>"
    });
    return true;
  }

  if (existing) return false;

  // UNDERWATER MARAUDER (3.632.0): "You are not flat-footed whilst in water."
  const marauder = Array.from(actor.items ?? []).some((i) => i?.type === "feat" && String(i.name ?? "").trim().toLowerCase() === UNDERWATER_MARAUDER.toLowerCase());
  const flatFooted = !marauder && underwaterFlatFooted({ underwater: true, swimSpeed: swimSpeedOf(actor) });
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: SUBMERGED_EFFECT,
    img: "icons/svg/water.svg",
    // A COMMA-LED STRING, which is how every other source of resistance
    // in this system writes to this field — `prepareTextLists` tidies the
    // leading comma when nothing wrote first. It is a TEXT field, not a
    // numeric one, so a numeric change mode would write nothing at all.
    changes: [{
      key: "system.combat.resistances",
      type: CHANGE_TYPE.ADD,
      value: `, ${UNDERWATER_RESISTANCES.join(", ")}`,
      priority: 20
    }],
    flags: { [SYSTEM_ID]: { submerged: true, submergedFlatFooted: flatFooted } }
  }]);
  if (flatFooted) await actor.toggleStatusEffect("flatFooted", { active: true });

  /*
   * GOING UNDER IS WHERE A BREATH IS TAKEN (page 202, R3).
   *
   * A rule needs a way in, and this is the one the table will actually
   * use: nobody remembers to press a button called "hold your breath"
   * in the round they are dragged into a lake. A swim Speed is not the
   * test — a creature can swim and still need to breathe — so the air
   * counter starts for anyone entering the water and `restoreAir` ends
   * it when they leave. A creature that does not need to breathe at all
   * is the GM's to exempt, the same way it always was.
   */
  // AN AQUATIC CREATURE breathes the water (3.632.0, ruling 6).
  if (breathOnWaterline({ entering: true, aquatic: hasCreatureTrait(actor.system, "aquatic") }) === "hold") {
    await startHoldingBreath(actor);
  } else {
    await restoreAir(actor);
  }

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: '<div class="trg-prime trg-check-card"><p style="margin:2px 0">'
      + `<strong>${actor.name} is underwater</strong> — acid and fire resistance, and `
      + (flatFooted
        ? "<strong>flat-footed</strong> while fighting or moving, for want of a swim Speed"
        : "no flat-footed, thanks to a swim Speed")
      + " (page 201).</p></div>"
  });
  return true;
}

/**
 * Watch tokens move in and out of water.
 *
 * `updateToken` rather than `preMoveToken`, because this is a
 * CONSEQUENCE of a move rather than a veto on one, and because a token
 * dragged, teleported or nudged by a forced-movement effect crosses the
 * waterline exactly as a walked one does.
 */
export function registerUnderwaterHooks() {
  Hooks.on("updateToken", (tokenDocument, changes) => {
    if (!("x" in changes) && !("y" in changes) && !("elevation" in changes)) return;
    const actor = tokenDocument?.actor ?? null;
    if (!actor) return;
    void settleSubmersion(actor, tokenDocument);
  });
}
