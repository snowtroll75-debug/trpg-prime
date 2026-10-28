/**
 * ANIMAL SOUL (Chapter 5, Druid/Ranger; requires Animal Companion):
 *
 *   "Your link with your animal companion allows you to ignore harmful
 *    magic that cannot affect your wild side. You can choose not to allow
 *    spells and effects to affect you if they would not be capable of
 *    affecting both your creature type and that of your animal companion."
 *
 * THE GATE IS ALREADY THERE. A spell's `kindGate` says which creature kind
 * it can touch (kind-gate.mjs), and the question this feat asks is whether
 * that gate would shut the companion out while letting the Druid through.
 * If it would, the Druid may step out with them. `animalSoulRefusable`
 * (combat/grant-feats.mjs) holds the rule; this reads the two actors it
 * needs and puts the choice to the player.
 *
 * ASKED, NOT ASSUMED. Graham's ruling, 21 August 2026: the printed rule is
 * "you CAN CHOOSE", and a system that decided for the player would sooner
 * or later decline an ally's healing on their behalf. So the prompt is the
 * rule, and the ordinary case costs nothing because a spell with no kind
 * gate — which is nearly all of them — never reaches the prompt at all.
 *
 * WHERE IT SITS. On the RECIPIENT's side of `applySpellEffects`, because
 * "not to allow spells and effects to affect you" is about what lands on
 * you rather than about who cast it — which means it covers a foe's curse
 * and an ally's blessing alike, exactly as written.
 */

import { animalSoulRefusable } from "../combat/grant-feats.mjs";
import { creatureTypesOf } from "../aligned.mjs";

const { DialogV2 } = foundry.applications.api;

/** The creature types of every companion bound to this actor. */
function companionTypes(actor) {
  const types = [];
  try {
    // Imported lazily: companion-workflow reaches into `game.actors`, and
    // this module is loaded by the spell engine long before a world exists
    // in the harness.
    // BY THE STORED MASTER ID (3.674.0, C9; found reading the companion code
    // for Inner Tempest's dragons). This looked for a `companionMaster` flag
    // and `system.details.masterId`, neither of which companion creation has
    // ever written — it writes `system.companion.masterId` — so no companion
    // was ever found and Animal Soul never knew its own companion's type.
    const bound = Array.from(game?.actors ?? []).filter(
      (a) => a?.type === "companion" && actor?.id
        && String(a?.system?.companion?.masterId ?? "").trim() === actor.id
    );
    for (const companion of bound) types.push(...creatureTypesOf(companion.system));
  } catch { /* no world, no companions */ }
  return types;
}

/**
 * Ask whether this recipient steps out of the spell.
 *
 * NOTHING HERE MAY THROW INTO A CAST. A refusal that failed to be offered
 * is a nuisance; an exception escaping into `applySpellEffects` would
 * abort a spell that has already been paid for.
 *
 * @param {Actor} recipient
 * @param {object} spellData the spell's `system`
 * @param {string} spellName
 * @returns {Promise<boolean>} true when the recipient refuses the spell
 */
export async function animalSoulRefuses(recipient, spellData, spellName = "the spell") {
  try {
    const featNames = Array.from(recipient?.items ?? [])
      .filter((i) => i.type === "feat").map((i) => i.name);
    const companions = companionTypes(recipient);
    const verdict = animalSoulRefusable({
      featNames,
      kindGate: spellData?.kindGate ?? "",
      ownTypes: creatureTypesOf(recipient?.system),
      companionTypes: companions,
      hasCompanion: companions.length > 0
    });
    if (!verdict.refusable) return false;

    const refuse = await DialogV2.confirm({
      window: { title: `Animal Soul — ${recipient.name}`, icon: "fa-solid fa-paw" },
      classes: ["trg-prime"],
      content: `<div class="trg-prime trg-check-dialog">
        <p><strong>${spellName}</strong> would affect <strong>${recipient.name}</strong>, but ${verdict.reason}.</p>
        <p>Step out of it with your wild side, and let it pass you by?</p>
      </div>`,
      yes: { icon: "fa-solid fa-paw", label: "Refuse the spell" },
      no: { icon: "fa-solid fa-xmark", label: "Let it affect me", default: true },
      rejectClose: false
    });
    return Boolean(refuse);
  } catch (_error) {
    return false;
  }
}
