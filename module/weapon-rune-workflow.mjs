/**
 * The weapon runes that do something at the moment of a critical, rolled
 * (3.618.0, block 37's C6; Graham's R11 and R15).
 *
 *   Life Stealing  the target saves or takes 1d6 Soul Drain, which heals you
 *   Da Big Itter   its critical may cast Fear (DC 20) on the creature struck
 *
 * Both used to print a sentence for the table. The save is the TARGET's and
 * is rolled for it, as an area's saves are (burst-workflow.mjs); the Soul
 * Drain and the healing land.
 */

import { levelDC } from "./dice/resolution.mjs";

const SYSTEM_ID = "trg-prime";
const DialogV2 = foundry.applications.api.DialogV2;

/** "1d6 Soul Drain" — the drain Life Stealing deals on a failed save. */
const LIFE_STEALING_DRAIN = "1d6";

/**
 * Whose level sets a weapon's Level DC (R11): the WEAPON's — "the level used
 * to determine the DC … of the item is determined by the items level and not
 * yours". Level + 14.
 *
 * @param {object} weapon
 * @returns {number}
 */
export function weaponLevelDC(weapon) {
  return levelDC(Math.max(0, Number(weapon?.system?.itemLevel ?? 0) || 0));
}

/**
 * LIFE STEALING, on a critical: "the target must make a Fortitude saving throw
 * to avoid taking 1d6 Soul Drain. This Soul Drain immediately heals the
 * wielder. Furthermore, any bleed damage inflicted by this weapon changes to
 * recurring essence damage."
 *
 * @returns {Promise<string[]>} card lines
 */
export async function lifeStealingStrike(actor, weapon, target) {
  if (!actor || !weapon || !target) return [];
  const dc = weaponLevelDC(weapon);
  const { TRGCheck } = await import("./dice/check.mjs");
  const saves = target.system?.combat?.saves?.fortitude;
  const check = await TRGCheck.roll({
    actor: target,
    label: `Fortitude Save — ${weapon.name} (Life Stealing)`,
    subject: "fortitude",
    subtitle: `DC ${dc}, the weapon's Level DC`,
    type: "save",
    dc,
    modifiers: [...(saves?.checkModifiers ?? [{ label: "Fortitude", value: Number(saves?.total ?? 0), type: "untyped" }])]
  });
  const success = Boolean(check?.outcome?.degree?.success);
  const lines = [];
  if (success) {
    lines.push(`<strong>${weapon.name} reaches for ${target.name}'s life</strong> — ${target.name} makes the Fortitude save (DC ${dc}) and keeps it.`);
  } else {
    const drain = await new Roll(LIFE_STEALING_DRAIN).evaluate();
    const { applyConditionTags } = await import("./combat/effect-application-workflow.mjs");
    await applyConditionTags(target, [{ key: "soulDrain", label: "Soul Drain", value: drain.total }]);
    const { healActor } = await import("./magic/spell-effects.mjs");
    const healed = await healActor(actor, drain.total);
    lines.push(`<strong>${weapon.name} steals life</strong> — ${target.name} fails the Fortitude save (DC ${dc}) and takes <strong>${drain.total} Soul Drain</strong>; ${actor.name} heals <strong>${Number(healed) || 0}</strong>.`);
  }
  lines.push(`<em>${weapon.name}: any bleed this critical inflicts is recurring essence damage instead.</em>`);
  return lines;
}

/**
 * A SPELL CAST BY A WEAPON'S CRITICAL (R15). Da Big Itter: "Activate Command
 * (1 AP); Frequency Upon a successful critical hit. The weapon casts a Fear
 * (DC 20) spell on the target of the critical hit."
 *
 * Offered, as a reaction is: the wielder chooses at the moment of the
 * critical, pays the Command's AP, and the spell is the weapon's — an innate
 * casting at the printed DC, aimed at the creature struck.
 *
 * Declared on the item as `flags.trg-prime.specificItem.onCritical =
 * {spell, dc, ap}`.
 *
 * @returns {Promise<string|null>} a card line, or null when nothing was offered
 */
export async function offerCriticalSpell(actor, weapon, target) {
  const spec = weapon?.flags?.[SYSTEM_ID]?.specificItem?.onCritical ?? null;
  if (!spec?.spell || !actor || !target) return null;
  const ap = Math.max(0, Number(spec.ap ?? 1) || 0);
  const yes = await DialogV2.confirm({
    window: { title: `${weapon.name} — ${spec.spell}`, icon: "fa-solid fa-skull" },
    content: `<p>The critical lands. Command <strong>${weapon.name}</strong> (${ap} AP) to cast <strong>${spec.spell} (DC ${spec.dc})</strong> on ${target.name}?</p>`,
    rejectClose: false
  });
  if (!yes) return null;
  // ASKED FIRST, SPENT ONLY ON A CASTING (3.618.1, F2 of the 3.618.0 drive):
  // a refused casting must not leave the Command's AP gone.
  const label = `${weapon.name} — ${spec.spell}`;
  const { ensureActionPoints, spendActionPoints } = await import("./combat/action-points-workflow.mjs");
  if (!await ensureActionPoints(actor, ap, label)) return null;
  const { contentPack } = await import("./content-packs.mjs");
  const pack = contentPack("spells");
  const index = pack ? await pack.getIndex() : [];
  const entry = Array.from(index).find((e) => String(e.name).toLowerCase() === String(spec.spell).toLowerCase());
  if (!entry) return `<em>${weapon.name}: no spell called ${spec.spell} is in the compendium — cast it by hand at DC ${spec.dc}.</em>`;
  const { releaseItemSpell } = await import("./consumable-use-workflow.mjs");
  const source = (await pack.getDocument(entry._id)).toObject();
  // THE WEAPON CASTS IT (3.618.1, F2): "The weapon casts a Fear (DC 20) spell"
  // — so nothing is asked of the wielder's hands or voice. Found live: the
  // two-handed hammer's own Fear was refused for want of a free hand.
  source.system.components = { somatic: false, verbal: false, material: false, focus: false };
  // AT THE TARGET STRUCK, the Command's AP paid below once it is cast.
  const token = target.token?.object ?? target.getActiveTokens?.()?.[0] ?? null;
  if (token) token.setTarget(true, { user: game.user, releaseOthers: true });
  const released = await releaseItemSpell(actor, weapon, { name: source.name, uuid: entry.uuid ?? "", pp: Number(source.system?.ppCost ?? 0), warp: null }, {
    data: source, apPaid: true, presetTargets: Boolean(token), fixedDC: Number(spec.dc) || null
  });
  if (released?.cast) await spendActionPoints(actor, ap, label);
  return null;
}
