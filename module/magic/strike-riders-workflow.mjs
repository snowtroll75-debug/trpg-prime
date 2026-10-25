/**
 * Strike riders against real documents.
 *
 * NEW at 3.437.0. The Foundry half of `strike-riders.mjs`, kept apart so
 * the rule stays importable by the harness — the split this project has
 * now paid for seven times.
 */

import { declaresUnarmedAbilities, unarmedAbilityCarriers } from "../combat/unarmed-profile.mjs";
import { runeStrikeRiderSpecs } from "../rune-declarations.mjs";
import {
  STRIKE_RIDER_FLAG, normaliseStrikeRider, riderPacketsFor, ridersSpentBy, ridersBurntBy, riderConditionReaches,
  weaponRiderRequirement,
  enchantableWeapons
} from "./strike-riders.mjs";
import { abilityElementalStrikes } from "../creature-ability-rules.mjs";

const SYSTEM_ID = "trg-prime";
/** The per-round marker map on the actor for once-per-round riders (3.625.0): effect id → true. */
const STRIKE_RIDERS_USED_FLAG = "strikeRidersUsed";

/**
 * The pre-cast gate: a spell that enchants a weapon you are wielding
 * needs you to be wielding one.
 *
 * NEW at 3.438.0. Returns false (and warns) to abort, true to proceed —
 * the same shape as `traitGate` and `componentGate`, and called from the
 * same place, so a blocked attempt costs no PP and no AP. See
 * `weaponRiderRequirement` in strike-riders.mjs for why this asks only
 * about the caster and why that is what stops it duplicating the
 * applier's own refusal.
 *
 * EQUIPPED IS THE SAME TEST `promptRiderWeapon` USES, deliberately: a
 * gate that admitted a cast the prompt would then find nothing for would
 * be worse than no gate, because the PP would be gone and the reason
 * would have moved.
 *
 * @returns {boolean}
 */
export function weaponRiderGate(actor, spellSystem, spellName = "This spell") {
  if (!weaponRiderRequirement(spellSystem)) return true;
  const wielding = enchantableWeapons(Array.from(actor?.items ?? [])).length > 0;
  if (wielding) return true;
  ui.notifications.warn(
    `${spellName} targets a weapon you are wielding, and ${actor?.name ?? "the caster"} is wielding none`
    + " (an Unarmed Strike or other natural attack is not a weapon)."
  );
  return false;
}

/**
 * Every live rider on this actor, paired with the effect carrying it.
 *
 * A DISABLED EFFECT CARRIES NOTHING. `spendHeldBonus` takes the same
 * position, and for the same reason: a GM who switched an effect off
 * expects it to stop happening.
 *
 * @returns {Array<{effectId: string, spec: object}>}
 */
function strikeRidersOn(actor) {
  const out = [];
  // THE APPLIED EFFECTS, NOT ONLY THE ACTOR'S OWN (3.627.0). A feat's
  // transferred effect never sits in `actor.effects`, so a rider a FEAT
  // declares — Grave-Cold Touch's 1d6 cold — was invisible here and had to
  // be copied onto the actor by a Use handler first. `appliedEffects` is
  // the actor's own effects plus every transferred one, without the
  // disabled or suppressed. A transferred rider is permanent: the spend
  // path looks it up in `actor.effects`, finds nothing and leaves it.
  for (const effect of actor?.appliedEffects ?? actor?.effects ?? []) {
    if (effect.disabled) continue;
    const raw = effect.flags?.[SYSTEM_ID]?.[STRIKE_RIDER_FLAG];
    if (!raw) continue;
    const spec = normaliseStrikeRider(raw);
    if (!spec) continue;
    // The effect's id travels with the spec (3.625.0), so a once-per-round
    // rider's marker is keyed by the effect rather than by a label two
    // effects might share.
    spec.id = String(effect.id ?? "");
    out.push({ effectId: effect.id, spec });
  }
  return out;
}

/**
 * The identity a rider is matched against — one place, so the strike
 * path and the spend path cannot disagree about what "this weapon" is.
 */
function weaponIdentity(weapon, actor = null) {
  // UNARMED ABILITIES WITH THIS WEAPON (3.671.0, B7-6): an unarmed-scoped
  // rider reaches the Soul-Bound Weapon and the Zen Archer's bows.
  const abilityUnarmed = Boolean(actor) && declaresUnarmedAbilities(unarmedAbilityCarriers(actor), weapon);
  return {
    // ITS NAME (3.625.0), for a rider bound to named weapons.
    name: String(weapon?.name ?? ""),
    attackMode: String(weapon?.system?.attackMode ?? "melee"),
    // THE CATEGORY TRAVELS TOO (3.465.0), so an `unarmed`-scoped rider
    // can ask it. Read from the same field combat/strike.mjs stamps on
    // the Unarmed Strike stub.
    category: String(weapon?.system?.category ?? ""),
    // AND WHAT ELSE `isUnarmedAttack` READS (3.576.0) — the natural flag,
    // the declared `unarmed` of a gauntlet, and the trait line — so the
    // unarmed scope gets the same answer every other unarmed rule does.
    natural: Boolean(weapon?.system?.natural),
    unarmed: weapon?.system?.unarmed === true || abilityUnarmed,
    traits: String(weapon?.system?.traits ?? ""),
    weaponId: String(weapon?.id ?? ""),
    // ITS OWN DIE AND TYPE (3.613.0, R12), for a rider that adds "an
    // additional die of damage" — Weapon Surge.
    damage: String(weapon?.system?.damage ?? ""),
    damageType: String(weapon?.system?.damageType ?? "")
  };
}

/**
 * The secondary-damage packets this actor's riders add to a Strike with
 * this weapon, in the shape `runeDamageFor` returns.
 */
export function strikeRiderPackets(actor, weapon, ctx = {}) {
  return riderPacketsFor(
    [...strikeRidersOn(actor).map((entry) => entry.spec), ...weaponRuneRiders(weapon), ...elementalStrikeRiders(actor, weapon)],
    weaponIdentity(weapon, actor),
    { ...ctx, used: actor?.getFlag?.(SYSTEM_ID, STRIKE_RIDERS_USED_FLAG) ?? {} }
  );
}

/**
 * THE WEAPON'S OWN RIDERS (3.626.0): a registered rune inscribed on it
 * that declares secondary damage — Pillars of Faith's Requiem I–III, "the
 * first successful Strike you make each round against a creature with the
 * Undead or Unliving trait inflicts additional secondary essence damage",
 * Banishing's 2d6 on a critical. The same gates and the same packets as a
 * caster's riders, keyed by rune and weapon so the once-per-round marker
 * is this weapon's. Never spent: a rune is not an effect.
 */
/**
 * ELEMENTAL STRIKES (Creature Codex; 3.631.0): "all its physical attacks
 * inflict 1d6 secondary elemental damage. Any attacks that the creature
 * already possesses which inflict secondary elemental damage, have that
 * damage doubled." The die is a rider on every physical weapon the creature
 * swings; a weapon-declared rider of the same element is doubled in
 * weaponDeclaredRiders. Pure data; never spent.
 */
function elementalStrikeRiders(actor, weapon) {
  const rule = abilityElementalStrikes(Array.from(actor?.items ?? []));
  if (!rule || weapon?.type !== "weapon") return [];
  const type = String(weapon?.system?.damageType ?? "").toLowerCase();
  if (!["bludgeoning", "piercing", "slashing", ""].includes(type)) return [];
  const spec = normaliseStrikeRider({ dice: rule.dice, damageType: rule.type, scope: "any", label: "Elemental Strikes" });
  if (!spec) return [];
  spec.id = `ability:elemental-strikes:${weapon?.id ?? ""}`;
  return [spec];
}

function weaponRuneRiders(weapon) {
  return [...runeStrikeRiderSpecs(weapon), ...weaponDeclaredRiders(weapon)]
    .map((raw) => { const spec = normaliseStrikeRider(raw); if (spec) spec.id = String(raw.id ?? ""); return spec; })
    .filter(Boolean);
}

/**
 * RIDERS A WEAPON DECLARES OF ITSELF (3.627.0): Pillars of Faith's Bony
 * Hand "deals 1d8 bludgeoning damage plus 1d6 essence damage" — the second
 * die is part of the attack, secondary damage in the core's sense (never
 * multiplied by a critical). `flags.trg-prime.strikeRiders` on the weapon,
 * each a strike-rider row; keyed by weapon so a once-a-round marker is the
 * weapon's own. Never spent.
 */
function weaponDeclaredRiders(weapon) {
  const rows = weapon?.flags?.[SYSTEM_ID]?.strikeRiders;
  // ELEMENTAL STRIKES doubles a secondary die of its own element (3.631.0).
  const elemental = abilityElementalStrikes(Array.from(weapon?.actor?.items ?? []));
  return (Array.isArray(rows) ? rows : []).map((row, i) => ({
    ...row,
    ...(elemental?.doubles && String(row?.damageType ?? "").toLowerCase() === elemental.type && /^(\d+)d(\d+)$/i.test(String(row?.dice ?? ""))
      ? { dice: String(row.dice).replace(/^(\d+)d/i, (m, n) => `${Number(n) * 2}d`) }
      : {}),
    once: false,
    id: `weapon:${weapon?.id ?? weapon?.name ?? ""}:${i}`
  }));
}

/**
 * Burn the once-per-round riders this hit used (3.625.0). Called from the
 * damage path, after the packets were rolled, so a rider whose gate did
 * not hold is not burnt by a strike it did not join.
 * @returns {Promise<string[]>} a line per rider burnt
 */
export async function burnStrikeRiders(actor, weapon, ctx = {}) {
  const used = actor?.getFlag?.(SYSTEM_ID, STRIKE_RIDERS_USED_FLAG) ?? {};
  const burnt = ridersBurntBy([...strikeRidersOn(actor).map((entry) => entry.spec), ...weaponRuneRiders(weapon)], weaponIdentity(weapon, actor), { ...ctx, used });
  if (!burnt.length) return [];
  const next = { ...used };
  for (const spec of burnt) next[spec.id] = true;
  if (actor?.setFlag) await actor.setFlag(SYSTEM_ID, STRIKE_RIDERS_USED_FLAG, next);
  return burnt.map((spec) => `<em>${spec.label} — used this round.</em>`);
}

/**
 * Spend the once-riders this Strike used up.
 *
 * ONE FUNCTION, NOT TWO — `held-bonus-workflow.mjs` records why: "is it
 * still there?" and "consume it" as separate calls is how two cards
 * rendered at the same moment both spend the same thing.
 *
 * CALLED WHETHER THE STRIKE HIT OR MISSED, which is the ruling recorded
 * in `strike-riders.mjs`. So it must be reached from the attack path
 * and not from the damage path — a spend that only ran on a hit would
 * be a different rule wearing this one's name.
 *
 * @returns {Promise<string[]>} a line per rider spent
 */
export async function spendStrikeRiders(actor, weapon, { hit = true, ctx = null } = {}) {
  const lines = [];
  const identity = weaponIdentity(weapon, actor);
  for (const { effectId, spec } of strikeRidersOn(actor)) {
    if (!ridersSpentBy([spec], identity, { hit, ctx }).length) continue;
    const effect = actor?.effects?.get?.(effectId);
    if (!effect) continue;
    try {
      await effect.delete();
    } catch (err) {
      // LOGGED, NOT SWALLOWED, and the line is still printed: the Strike
      // has already had the benefit, so a failure to tidy up must not
      // read to the table as a rider that is still in hand.
      console.warn(`${SYSTEM_ID} | could not delete spent strike rider "${spec.label}"`, err);
    }
    lines.push(`<em>${spec.label} is spent.</em>`);
  }
  return lines;
}

/**
 * The condition a rider applies to the creature it hit.
 *
 * Spoil The Profane's "the target becomes weakened 1 until the beginning
 * of your next turn". Applied through the same door every spell-applied
 * condition uses, so the condition registry stays the one place that
 * knows what a condition is.
 *
 * @returns {Promise<string[]>} lines for the strike card
 */
export async function applyRiderConditions(actor, weapon, targetActor, ctx = {}) {
  const lines = [];
  if (!targetActor) return lines;
  const identity = weaponIdentity(weapon, actor);
  const { CONDITIONS } = await import("../conditions/registry.mjs");
  const { applyConditionTags, formatAppliedTags } =
    await import("../combat/effect-application-workflow.mjs");
  // The same question the damage half is asked (3.627.0): this weapon,
  // these gates, this round's marker. See riderConditionReaches.
  const reachCtx = { ...ctx, used: actor?.getFlag?.(SYSTEM_ID, STRIKE_RIDERS_USED_FLAG) ?? {} };

  for (const { spec } of strikeRidersOn(actor)) {
    if (!riderConditionReaches(spec, identity, reachCtx)) continue;
    const cond = CONDITIONS[spec.condition];
    if (!cond) {
      lines.push(`<em>${spec.label} names an unknown condition "${spec.condition}".</em>`);
      continue;
    }
    // A SAVE AGAINST THE CONDITION (3.630.0) — Tangleweed's Reflex. Success
    // or better resists; the card says so either way.
    if (spec.conditionSave) {
      const { TRGCheck } = await import("../dice/check.mjs");
      const { withCheckModifiers } = await import("../dice/check-modifiers.mjs");
      const save = spec.conditionSave.save;
      const dc = spec.conditionSave.dc || null;
      const check = await TRGCheck.roll(withCheckModifiers({
        actor: targetActor,
        label: `${targetActor.name} — ${save.charAt(0).toUpperCase()}${save.slice(1)} Save`,
        subtitle: `${spec.label}${dc ? ` — DC ${dc}` : ""}`,
        type: "save", save, dc
      }));
      const key = check?.outcome?.degree?.key ?? "";
      if (["heroic", "critical", "success"].includes(key)) {
        lines.push(`${targetActor.name} resists ${spec.label} (${save} ${check.outcome.degree.label}).`);
        continue;
      }
      if (!key) {
        lines.push(`<em>${spec.label}: no save result — apply ${spec.condition} ${spec.conditionValue} if it failed.</em>`);
        continue;
      }
    }
    // HOW LONG (3.630.0): one round by default — "until the beginning of
    // your next turn" — or until removed when the rider says so.
    const rounds = spec.conditionRounds === undefined ? 1 : spec.conditionRounds;
    const applied = await applyConditionTags(targetActor, [{
      key: spec.condition,
      label: cond.label,
      value: cond.valued ? spec.conditionValue : null
    }], {
      // "UNTIL THE BEGINNING OF YOUR NEXT TURN" is one round, and only
      // while a combat is running. Outside one there is no round to
      // count, so the tag is left for the GM rather than given an
      // invented expiry.
      expiresRound: rounds && game.combat?.started ? Number(game.combat.round ?? 0) + rounds : null,
      spellEffect: true
    });
    lines.push(`${targetActor.name}: ${formatAppliedTags(applied)}.`);
  }
  return lines;
}

/**
 * Which weapon a duration rider is bound to.
 *
 * "TARGETS A WEAPON YOU ARE CURRENTLY WIELDING" — so the candidates are
 * the EQUIPPED weapons, and a character holding one is not asked. A
 * character holding none gets null, and the applier refuses the rider
 * loudly rather than arming a weapon that is not in their hands.
 *
 * @returns {Promise<string|null>} the weapon's id
 */
export async function promptRiderWeapon(actor, spellName = "This spell") {
  const weapons = enchantableWeapons(Array.from(actor?.items ?? []));
  if (!weapons.length) return null;
  if (weapons.length === 1) return weapons[0].id;

  const { DialogV2 } = foundry.applications.api;
  const rows = weapons
    .map((w, i) => `<label style="display:flex;align-items:center;gap:8px;padding:2px 0">
        <input type="radio" name="weapon" value="${w.id}" ${i === 0 ? "checked" : ""}>
        <span>${w.name}</span></label>`)
    .join("");

  const picked = await DialogV2.wait({
    window: { title: `${spellName} — which weapon?`, icon: "fa-solid fa-wand-sparkles" },
    classes: ["trg-prime"],
    position: { width: 380 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint" style="margin:0 0 6px">The spell targets a weapon you are wielding.</p>${rows}</div>`,
    buttons: [
      {
        action: "confirm", label: "Enchant", icon: "fa-solid fa-wand-sparkles", default: true,
        callback: (event, button) => {
          const form = button.form ?? button.closest?.("form");
          const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
          return new FDE(form).object.weapon;
        }
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!picked || picked === "cancel") return null;
  return String(picked);
}
