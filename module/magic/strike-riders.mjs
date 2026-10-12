/**
 * A RIDER ON A STRIKE — secondary damage a spell hangs on a weapon.
 *
 * NEW at 3.437.0. Pure; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THIS MECHANISM ALREADY EXISTED, WEARING A RUNE'S NAME.
 *
 * `module/rune-damage.mjs` says it in its own header: *"The damage is
 * SECONDARY: a separate packet of a different type"*, and
 * `resolveWeaponDamage` already rolls each such packet, resolves it
 * against THIS target's own defences, applies it and prints a line for
 * it. A fire-resistant creature resists a Flaming rune's 1d4 and takes
 * the sword's slashing in full.
 *
 * Three PP 1 spells are that same sentence:
 *
 *   Arrow Of The Wild Hunt  "On a hit, deal normal damage plus 1d6
 *                            force damage"
 *   Talon Strike            "Your attacks with the target weapon ...
 *                            inflicting 1d6 secondary slashing damage"
 *   Spoil The Profane       "it also takes 1d6 secondary aligned damage"
 *
 * The book uses the word SECONDARY for all three, which is the same word
 * the rune chapter uses. §"Search the module tree for a rule's own words
 * before writing it" — so this file produces entries in EXACTLY the shape
 * `runeDamageFor` returns, and the strike loop consumes both from one
 * list. A parallel loop would have been a second place deciding how
 * secondary damage meets a defence, and the two would have drifted.
 *
 * ─────────────────────────────────────────────────────────────────────
 * SPOIL THE PROFANE IS CONDITIONAL, AND THAT IS NOT A SHORTCUT.
 *
 * "If the target has an opposing aura, it also takes 1d6 secondary
 * aligned damage." Nothing in this system knows what an opposing aura
 * is — the phrase appears in no module — and Radiant Aegis and
 * Wellspring Of Valour are waiting on the same question.
 *
 * The rune loop already has the right answer for this, and it was
 * written for Bane and Aligned: *"depend on WHO is being hit, which
 * nothing here can know, so they are printed for the table rather than
 * applied."* So Spoil's die is declared `conditional` and prints
 * "1d6 extra damage against a target with an opposing aura. Apply if it
 * applies." Inventing an aura test here would be a rule wearing this
 * spell's name.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `damageType` IS REQUIRED, AND THE EMPTY STRING IS REFUSED.
 *
 * A rune with an empty `type` means something specific — "the weapon's
 * own; Bane and Aligned add to the strike rather than alongside it". A
 * spell row that simply forgot its type would inherit that meaning
 * silently and roll into the weapon's damage instead of beside it. So a
 * missing type is a malformed rider, not a defaulted one.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHAT A RIDER IS SCOPED BY, AND WHAT IT IS NOT.
 *
 * `scope`     "any" | "melee" | "ranged", matched against the weapon's
 *             `attackMode`. Arrow Of The Wild Hunt says "Make a ranged
 *             weapon Strike", so it is `ranged`; Spoil says "melee or
 *             ranged", so it is `any`.
 * `weaponId`  set at cast time ONLY for a rider that names one weapon
 *             for a duration (Talon Strike: "the target weapon"). A
 *             1-minute rider left unscoped would arm every weapon the
 *             character owns, which is a different spell.
 *
 * A rider is NOT scoped by trait, tradition or target — those are not
 * on the weapon, and a scope that can never match is worse than one
 * that was never offered. Same position `held-bonus.mjs` takes.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `once` AND WHEN IT IS SPENT — a ruling, recorded as one.
 *
 * Spoil The Profane is "make a Strike" — one Strike, and the spell is
 * gone whether it lands or not. Arrow Of The Wild Hunt is "on a hit,
 * deal normal damage plus 1d6", and the book never says what a miss
 * costs; its only expiry clause is about not firing at all.
 *
 * A once-rider is therefore spent WHEN THE STRIKE RESOLVES, hit or
 * miss. That is exactly right for Spoil and is the conservative reading
 * for Arrow — the generous alternative would let a player miss all day
 * on one PP. It is a ruling and not a reading, so it is written here
 * rather than left implicit in a call site.
 */

/** The system flag carrying one strike rider's specification. */
export const STRIKE_RIDER_FLAG = "strikeRider";

/**
 * The scopes a rider may be narrowed to.
 *
 * NOT EXPORTED, and neither are the four helpers below. The
 * uncalled-export ratchet asked for them, and the honest answer was to
 * stop exporting rather than to add four "harness-only" keeps: every one
 * of them is reachable by driving `normaliseStrikeRider`,
 * `riderPacketsFor` or `ridersSpentBy`, which is what ships. A check that
 * reaches past the public surface is testing a private opinion.
 */

import { isNaturalAttack, isUnarmedAttack } from "../combat/unarmed.mjs";

/*
 * "UNARMED" IS A SCOPE, NOT A WEAPON (3.465.0).
 *
 * Force Punch: *"For the duration of the spell, your unarmed attacks
 * inflict 1d6 secondary force damage."* That is this file's sentence
 * exactly — the book's own word "secondary" again — and the only thing it
 * needed was a way to say WHICH strikes, since the spell infuses a hand
 * rather than a weapon.
 *
 * NOT `weaponScoped` TO THE UNARMED STRIKE ITEM. That would have been the
 * quick way and it is wrong twice over: a creature with claws and a bite
 * has two unarmed attacks and the spell covers both, and
 * `existingUnarmedStrike` creates its stub lazily, so a caster who has
 * never punched anybody has no item to scope to at cast time.
 *
 * The category is what the system already uses to mean this —
 * combat/strike.mjs stamps `category: "Unarmed"` on the stub precisely so
 * it is not "the ONE unarmed attack in the game" — so the scope asks that.
 */
const RIDER_SCOPES = Object.freeze(["any", "melee", "ranged", "unarmed"]);

/*
 * WHAT "UNARMED" MEANS is no longer decided here (3.576.0). This file
 * compared the category with "unarmed", which is right for a bite and the
 * Unarmed Strike and wrong for a gauntlet — "a strike with a gauntlet is
 * otherwise considered an unarmed attack" (Chapter 6). The one rule lives
 * in combat/unarmed.mjs, and Force Punch now reaches a gauntleted fist.
 */

/**
 * The die formulae this system will actually roll.
 *
 * The same refusal `isHeldDie` makes and for the same reason: "1d6+1"
 * is a plausible thing to write and would either throw at strike time
 * or roll something nobody checked.
 */
const DICE_PATTERN = /^([1-9]\d*)d([1-9]\d*)$/i;

function isRiderDice(formula) {
  return DICE_PATTERN.test(String(formula ?? "").trim());
}

const text = (value) => String(value ?? "").trim();

/**
 * Validate and normalise one authored strike rider.
 *
 * RETURNS NULL RATHER THAN THROWING — a typo in one spell costs that
 * spell, not every Strike the character makes. `verify-strike-riders`
 * is what makes a dropped row loud at build time.
 *
 * IDEMPOTENT, because the applier stores the normalised spec on the
 * effect flag and the strike path normalises it again on the way back
 * out. `held-bonus.mjs` records what forgetting that cost: four spells
 * applied cleanly and then did nothing at all. So every field this
 * returns must be a field this accepts.
 */
export function normaliseStrikeRider(raw) {
  if (!raw || typeof raw !== "object") return null;

  // ONE OF THE WEAPON'S OWN DICE (3.613.0, R12 — Weapon Surge: "the weapon
  // deals an additional die of damage"). DECLARED, never inferred from
  // empty dice: the die and its type are the weapon's, read when the
  // Strike is made, so the row carries neither.
  const weaponDie = raw.weaponDie === true;
  const dice = weaponDie ? "" : text(raw.dice);
  // A CONDITION-ONLY RIDER (3.630.0): Pillars of Faith's Rose of Thorns —
  // "the first creature damaged by the treated weapon takes 2 bleed
  // damage" — and Tangleweed carry a condition and no die. Allowed only
  // when the row names its condition; a row with neither is still malformed.
  const conditionOnly = !weaponDie && !text(raw.dice) && Boolean(text(raw.condition));
  if (!weaponDie && !conditionOnly && !isRiderDice(dice)) return null;

  // See the header: an empty type is a rune's way of saying "the
  // weapon's own", and a spell must not acquire that meaning by
  // omission — which is why the weapon's own die has to SAY so.
  const damageType = weaponDie || conditionOnly ? "" : text(raw.damageType).toLowerCase();
  if (!weaponDie && !conditionOnly && !damageType) return null;

  const scope = (text(raw.scope) || "any").toLowerCase();
  if (!RIDER_SCOPES.includes(scope)) return null;

  const conditional = Boolean(raw.conditional);
  // A CONDITIONAL RIDER MUST SAY WHAT IT IS CONDITIONAL ON. The line it
  // prints is "extra damage against ___. Apply if it applies." — with an
  // empty `against` that sentence names nothing and the table cannot act
  // on it, which is the anti-silence rule with a full stop in it.
  const against = text(raw.against);
  if (conditional && !against) return null;

  // A condition the rider applies to the target on a hit (Spoil's
  // weakened 1). DECLARED, never inferred from a value being present.
  const condition = text(raw.condition).toLowerCase();
  const conditionValue = condition
    ? Math.max(1, Math.trunc(Number(raw.conditionValue ?? 1)) || 1)
    : 0;

  /*
   * GATES THE STRIKE CAN ANSWER ITSELF (3.625.0). Pillars of Faith's
   * Consecrated Armament — "once per round, when you score a Critical
   * hit with that weapon against an Undead creature … an additional 1d6
   * Essence damage" — and Final Sanction — "once per round … if that
   * creature currently has half its maximum Hit Points or fewer, increase
   * the Judgement damage by 1d6" — are riders whose condition is a FACT
   * the damage roll already holds: the target's creature types, whether
   * the blow was a critical, the target's hit points, which weapon swung.
   * A rider declaring any of these is RESOLVED by riderPacketsFor rather
   * than printed as "apply if it applies", and one marked `oncePerRound`
   * burns a marker instead of being spent.
   */
  const targetTypes = (Array.isArray(raw.targetTypes) ? raw.targetTypes : [])
    .map((t) => text(t).toLowerCase()).filter(Boolean);
  // OR A CREATURE TRAIT (3.626.0): Requiem's "a creature with the Undead
  // or Unliving trait" — a word on the traits line (or granted), which is
  // not the creature-type item `targetTypes` reads. Either axis holds.
  const targetTraits = (Array.isArray(raw.targetTraits) ? raw.targetTraits : [])
    .map((t) => text(t).toLowerCase()).filter(Boolean);
  const weaponNames = (Array.isArray(raw.weaponNames) ? raw.weaponNames : [])
    .map((t) => text(t).toLowerCase()).filter(Boolean);
  const onCritical = raw.onCritical === true;
  const lowHalfHp = raw.lowHalfHp === true;
  // ON A STRIKE OF A GIVEN DAMAGE TYPE (3.627.0): Pillars of Faith's
  // Grave-Cold Touch — "when you deal essence damage with an unarmed
  // attack or natural attack, the attack also deals 1d6 cold damage." The
  // strike knows its type once Versatile or a type option has been asked.
  const whenDamageTypes = (Array.isArray(raw.whenDamageTypes) ? raw.whenDamageTypes : (raw.whenDamageType ? [raw.whenDamageType] : []))
    .map((t) => text(t).toLowerCase()).filter(Boolean);
  const oncePerRound = raw.oncePerRound === true;
  // SPENT ON A HIT ONLY (3.625.0): the core ruling spends a once-rider
  // when the Strike RESOLVES, hit or miss (Spoil The Profane, Arrow Of
  // The Wild Hunt). Pillars of Faith's Dragon's Breath Reed prints "the
  // next SUCCESSFUL weapon or unarmed Strike you make … deals an
  // additional 1d6 fire damage. The dose is then expended." — a miss
  // keeps it. Declared, so the core spells keep their ruling.
  // AND KEPT THROUGH THE ROUND TRIP (3.625.1, found live on 0.7.0): the
  // spec this returns is what the effect stores, and it is normalised
  // AGAIN when the Strike reads it — by then the key is `spendOnHit`, not
  // `spendOn`, and the reed was being spent on a miss after all.
  const spendOnHit = raw.spendOnHit === true
    || String(raw.spendOn ?? "").trim().toLowerCase() === "hit";

  // HOW LONG THE CONDITION LASTS (3.630.0). Spoil The Profane's "until the
  // beginning of your next turn" is the default, one round. `null` (the row
  // says `conditionRounds: 0`) leaves it until removed — Bleeding stops
  // when it is staunched, not on a clock.
  const rawRounds = raw.conditionRounds;
  const conditionRounds = rawRounds === undefined || rawRounds === null || rawRounds === ""
    ? 1
    : (Math.max(0, Math.trunc(Number(rawRounds) || 0)) || null);
  // AND A SAVE AGAINST IT (3.630.0): Tangleweed's Reflex save, at the DC the
  // row carries (the herb's level DC, stamped when it is applied).
  const saveName = text(raw.conditionSave?.save).toLowerCase();
  const conditionSave = condition && ["fortitude", "reflex", "will"].includes(saveName)
    ? { save: saveName, dc: Math.max(0, Math.trunc(Number(raw.conditionSave?.dc) || 0)) }
    : null;

  const out = {
    label: text(raw.label) || "Strike rider",
    dice,
    damageType,
    scope,
    conditional,
    against,
    condition,
    conditionValue,
    // A once-per-round rider is never spent; it is reused next round.
    once: oncePerRound ? false : raw.once !== false,
    weaponScoped: Boolean(raw.weaponScoped),
    weaponId: text(raw.weaponId),
    weaponDie,
    spendOnHit,
    targetTypes,
    targetTraits,
    weaponNames,
    onCritical,
    lowHalfHp,
    whenDamageTypes,
    oncePerRound
  };
  // Added only when they differ from 3.629's shape, so an older rider reads as it did.
  if (conditionOnly) out.conditionOnly = true;
  if (condition && conditionRounds !== 1) out.conditionRounds = conditionRounds;
  if (conditionSave) out.conditionSave = conditionSave;
  return out;
}

/** Does the rider declare a gate the strike resolves itself? */
export function riderIsGated(spec) {
  return Boolean(spec && (spec.targetTypes?.length || spec.targetTraits?.length || spec.onCritical || spec.lowHalfHp || spec.whenDamageTypes?.length));
}

/**
 * Whether a gated rider's gates all hold for THIS strike.
 * @param {object} spec a normalised rider
 * @param {{targetTypes?: string[], critical?: boolean, targetHp?: number, targetMax?: number}} ctx
 */
export function riderGatesHold(spec, ctx = {}) {
  if (!spec) return false;
  if (spec.targetTypes?.length || spec.targetTraits?.length) {
    const types = (Array.isArray(ctx.targetTypes) ? ctx.targetTypes : []).map((t) => String(t ?? "").trim().toLowerCase());
    const traits = (Array.isArray(ctx.targetTraits) ? ctx.targetTraits : []).map((t) => String(t ?? "").trim().toLowerCase());
    const byType = (spec.targetTypes ?? []).some((t) => types.includes(t));
    const byTrait = (spec.targetTraits ?? []).some((t) => traits.includes(t));
    if (!byType && !byTrait) return false;
  }
  if (spec.onCritical && !ctx.critical) return false;
  if (spec.whenDamageTypes?.length && !spec.whenDamageTypes.includes(String(ctx.damageType ?? "").trim().toLowerCase())) return false;
  if (spec.lowHalfHp) {
    const max = Number(ctx.targetMax) || 0;
    const hp = Number(ctx.targetHp);
    if (!(max > 0) || !Number.isFinite(hp) || hp > Math.floor(max / 2)) return false;
  }
  return true;
}

/**
 * The rider on this spell that needs a weapon in the caster's own hands,
 * or null.
 *
 * NEW at 3.438.0, after the 3.437.0 live pass. Talon Strike cast with
 * empty hands refused out loud — and the card still read "1 PP spent".
 * `castSpell`'s own comments state the pattern for a cast the caster
 * physically cannot perform: the Rage gate, `traitGate` and
 * `componentGate` are *"checked before anything is spent or rolled, so a
 * blocked attempt costs nothing."* The weapon check was not one of those;
 * it lived in the effect applier, downstream of the Spellcraft check and
 * the PP debit. Graham's ruling, 29 August 2026: gate it, and let a
 * blocked attempt cost nothing, like every other physical impossibility
 * in this system.
 *
 * ─────────────────────────────────────────────────────────────────────
 * `target: "self"` ONLY, AND THAT IS WHAT KEEPS THIS FROM BECOMING A
 * SECOND COPY OF THE APPLIER'S REFUSAL.
 *
 * `cast-workflow.mjs` records what two copies of one rule cost: the PP
 * guard "used to read `!isInnate && totalPP > ppPool`, and that second
 * copy masked the first: mutating either one alone changed no behaviour,
 * because the other still covered it, so neither was actually under
 * test."
 *
 * A pre-cast gate can only ask about the CASTER — the recipients are not
 * settled until the target prompt, which comes later. So this gates only
 * a row aimed at the caster themselves, which is what Talon Strike
 * declares. A weapon rider aimed at an ALLY is not gated here and is
 * still the applier's business, so the two guards answer different
 * questions and neither can stand in for the other.
 *
 * A malformed row returns null rather than gating: "this spell is
 * unusable" is the applier's message to give, and refusing the cast for
 * "you are wielding no weapon" would name the wrong fault.
 *
 * @param {object} spellSystem a spell's `system`
 * @returns {object|null} the normalised rider, or null
 */
export function weaponRiderRequirement(spellSystem) {
  const rows = Array.isArray(spellSystem?.effects) ? spellSystem.effects : [];
  for (const row of rows) {
    if (String(row?.kind ?? "") !== "strikeRider") continue;
    if (String(row?.target ?? "") !== "self") continue;
    const spec = normaliseStrikeRider(row);
    if (spec?.weaponScoped) return spec;
  }
  return null;
}

/**
 * The weapons a "weapon you are wielding" spell may bind to.
 *
 * NATURAL ATTACKS ARE NOT WEAPONS (3.576.0). Page 166: "abilities and
 * effects that work with weapons do not work with natural attacks." The
 * gate and the prompt both took every equipped `weapon` item, and the
 * Unarmed Strike is one — created equipped the first time a character
 * strikes with nothing in hand — so a caster holding nothing could put
 * Flaming Weapon on their fist. Flaming, Freezing and Disrupting Weapon,
 * Talon Strike and Gravity Weapon all choose through here.
 *
 * @param {Array} items the wielder's items
 * @returns {Array} equipped, non-natural weapons, in the order given
 */
export function enchantableWeapons(items) {
  return (Array.isArray(items) ? items : Array.from(items ?? []))
    .filter((item) => item?.type === "weapon" && item?.system?.equipped && !isNaturalAttack(item?.system));
}

/**
 * Does this rider reach a Strike made with this weapon?
 *
 * @param {object} spec a normalised rider
 * @param {{attackMode?: string, weaponId?: string}} weapon
 */
function riderAppliesTo(spec, weapon = {}) {
  if (!spec) return false;
  // `attackMode` is "melee" or "missile" on a weapon; the books say
  // "ranged". One vocabulary at the boundary, and the translation lives
  // here rather than in three call sites.
  const ranged = String(weapon.attackMode ?? "melee") === "missile";
  if (spec.scope === "melee" && ranged) return false;
  if (spec.scope === "ranged" && !ranged) return false;
  // AN UNARMED SCOPE ASKS THE CATEGORY, and a weapon that names no
  // category is NOT unarmed. Defaulting the other way would have put
  // Force Punch's 1d6 on every sword swing by a caster whose weapon
  // entry happened to be incomplete — the failure that costs the table a
  // die it cannot see the source of.
  if (spec.scope === "unarmed" && !isUnarmedAttack(weapon)) return false;
  // A rider bound to one weapon reaches that weapon and no other. A
  // rider that WANTS a weapon and never got one reaches nothing, rather
  // than quietly arming the whole armoury.
  if (spec.weaponScoped) {
    if (!spec.weaponId) return false;
    if (spec.weaponId !== String(weapon.weaponId ?? "")) return false;
  }
  // A rider bound to NAMED weapons (3.625.0) — Consecrated Armament's
  // "the favoured weapon of your Divine Aspect" — reaches those and no
  // other, by name, the way the aspect's own proficiency does.
  if (spec.weaponNames?.length) {
    const name = String(weapon.name ?? "").trim().toLowerCase();
    if (!name || !spec.weaponNames.includes(name)) return false;
  }
  return true;
}

/**
 * One rider as a secondary-damage packet, in the shape
 * `resolveWeaponDamage`'s loop already consumes.
 *
 * `secondaryCritical` is NULL, always. The rune chapter grants one only
 * where a tier prints a modifier, and `module/combat/damage.mjs` is
 * explicit that "the critical belongs to the weapon's own damage, full
 * stop". No spell in this batch prints one, and inventing one here
 * would hand three PP 1 spells a critical the book never gave them.
 *
 * `feedbackOf` is null for the same reason: Vicious costs its wielder
 * because Vicious says so.
 */
function riderPacket(spec, weapon = {}) {
  if (!spec || spec.conditionOnly) return null;
  const own = spec.weaponDie ? weaponOwnDie(weapon) : null;
  if (spec.weaponDie && !own) return null;
  return {
    key: `rider:${spec.label}`,
    label: spec.label,
    dice: own ? own.dice : spec.dice,
    type: own ? own.type : spec.damageType,
    secondaryCritical: null,
    conditional: spec.conditional,
    against: spec.against,
    parameter: "",
    feedbackOf: null,
    // The rune packet's shape since 3.618.0: a rider is never resolved
    // against its target here, so a conditional one stays "apply if it
    // applies", and it is never added to the strike itself.
    resolved: false,
    applies: !spec.conditional,
    why: "",
    addsToStrike: false
  };
}

/**
 * One die of the weapon's own damage, and its type (3.613.0, R12).
 *
 * "An additional die of damage" is ONE die of the size the weapon rolls:
 * a 2d6 greatsword adds 1d6, not 2d6. The type is the weapon's first
 * printed type. A weapon with no readable die gives nothing, rather than
 * a guess the table cannot see the source of.
 *
 * @param {{damage?: string, damageType?: string}} weapon
 * @returns {{dice: string, type: string}|null}
 */
export function weaponOwnDie(weapon = {}) {
  const m = /^\s*\d*\s*d\s*(\d+)/i.exec(String(weapon?.damage ?? ""));
  if (!m) return null;
  const type = String(weapon?.damageType ?? "").split(/[,/]| or /i)[0].trim().toLowerCase();
  return { dice: `1d${m[1]}`, type: type || "untyped" };
}

/**
 * Every rider on this actor that reaches this Strike, as packets.
 *
 * TAKES PLAIN ROWS, not Foundry documents, so the harness can drive the
 * selection without a client. The workflow half reads the effects and
 * hands the specs in.
 *
 * @param {Array<object>} specs normalised riders
 * @param {{attackMode?: string, weaponId?: string}} weapon
 */
export function riderPacketsFor(specs, weapon = {}, ctx = {}) {
  return (Array.isArray(specs) ? specs : [])
    .filter((spec) => riderAppliesTo(spec, weapon))
    // A once-per-round rider whose marker is burnt sits this strike out.
    .filter((spec) => !(spec.oncePerRound && ctx?.used?.[spec.id ?? spec.label]))
    .map((spec) => {
      const packet = riderPacket(spec, weapon);
      if (!packet) return null;
      // A GATED RIDER IS RESOLVED HERE (3.625.0): the strike knows the
      // target's kind, the critical and the hit points, so the packet
      // arrives decided rather than "apply if it applies".
      if (riderIsGated(spec)) {
        const holds = riderGatesHold(spec, ctx);
        packet.resolved = true;
        packet.applies = holds;
        packet.conditional = !holds;
        packet.against = packet.against || riderGateText(spec);
        packet.why = holds ? "" : "its condition did not hold on this strike";
      }
      return packet;
    })
    .filter(Boolean);
}

/**
 * Does a rider's CONDITION land on this hit? (3.627.0)
 *
 * The damage half of a rider has always been asked the weapon, the gates
 * and the once-a-round marker (riderPacketsFor). The condition half was
 * asked none of them: `applyRiderConditions` checked only whether a once-
 * rider reached the weapon, so a rider scoped to named weapons, to a
 * critical or to an Undead target put its condition on every hit with
 * anything. Found in the Pillars of Faith Chapter 9 audit. One question,
 * asked of both halves.
 */
export function riderConditionReaches(spec, weapon = {}, ctx = {}) {
  if (!spec?.condition) return false;
  if (!riderAppliesTo(spec, weapon)) return false;
  if (spec.oncePerRound && ctx?.used?.[spec.id ?? spec.label]) return false;
  if (riderIsGated(spec) && !riderGatesHold(spec, ctx)) return false;
  return true;
}

/** What a gated rider is conditional on, for the card when it does not fire. */
export function riderGateText(spec) {
  const parts = [];
  if (spec?.targetTypes?.length || spec?.targetTraits?.length) parts.push([...(spec.targetTypes ?? []), ...(spec.targetTraits ?? [])].join(" or "));
  if (spec?.onCritical) parts.push("a Critical hit");
  if (spec?.lowHalfHp) parts.push("a target at half HP or fewer");
  if (spec?.whenDamageTypes?.length) parts.push(`a Strike dealing ${spec.whenDamageTypes.join(" or ")} damage`);
  return parts.join(", ");
}

/** The once-per-round riders this strike's applied packets burn (3.625.0). */
export function ridersBurntBy(specs, weapon = {}, ctx = {}) {
  return (Array.isArray(specs) ? specs : [])
    .filter((spec) => spec?.oncePerRound && riderAppliesTo(spec, weapon) && !ctx?.used?.[spec.id ?? spec.label])
    .filter((spec) => !riderIsGated(spec) || riderGatesHold(spec, ctx));
}

/**
 * Which riders a resolved Strike spends.
 *
 * SPENT ON THE STRIKE, NOT ON THE HIT — see the header. A rider that
 * did not reach this weapon is not spent by it, which is the whole
 * point of scoping one to a weapon in the first place.
 *
 * @param {Array<object>} specs normalised riders
 * @param {{attackMode?: string, weaponId?: string}} weapon
 * @returns {Array<object>} the subset to remove
 */
export function ridersSpentBy(specs, weapon = {}, { hit = true, ctx = null } = {}) {
  return (Array.isArray(specs) ? specs : [])
    .filter((spec) => spec?.once && riderAppliesTo(spec, weapon))
    // A rider that waits for a hit is not spent by a miss (3.625.0).
    .filter((spec) => hit || !spec.spendOnHit)
    // NOR BY A HIT ITS GATE REFUSED (3.630.0): Emberthistle's "the next time
    // you deal fire damage" is not used up by a slashing blow. Asked only
    // when the strike's facts are handed in.
    .filter((spec) => !ctx || !riderIsGated(spec) || riderGatesHold(spec, ctx));
}

/**
 * What the CAST card says the target is now carrying.
 *
 * SAYS WHETHER IT WILL BE APPLIED OR PRINTED, because those read very
 * differently to a player: Spoil's die is a reminder for the table and
 * announcing it as damage would promise automation the spell does not
 * have. `held-bonus.mjs` learned this when an advantage announced
 * itself as "+0 status".
 */
export function riderCastLine(spec) {
  if (!spec) return "";
  const where = spec.scope === "any" ? "Strike" : `${spec.scope} Strike`;
  const when = spec.once ? `your next ${where}` : `every ${where} with it`;
  // THE WEAPON'S OWN DIE IS NAMED AS SUCH (3.613.0): there is no number to
  // print until the Strike says which weapon.
  if (spec.weaponDie) return `<strong>one more of the weapon's own damage dice</strong> on ${when}`;
  // A CONDITION AND NO DIE (3.630.0).
  if (spec.conditionOnly) {
    const save = spec.conditionSave ? ` (${spec.conditionSave.save} save${spec.conditionSave.dc ? ` DC ${spec.conditionSave.dc}` : ""} resists)` : "";
    return `<strong>${spec.condition} ${spec.conditionValue}</strong>${save} on the first creature ${when.replace(/^your next /, "your next ")} damages`;
  }
  // THE TWO HALVES ARE ANNOUNCED SEPARATELY, because Spoil The Profane
  // has one of each: a die that waits on an aura nothing can read, and
  // a condition that waits on nothing at all. An early return on
  // `conditional` would have dropped the condition off the card — the
  // spell would apply it and never say so, which is the anti-silence
  // rule with the halves the wrong way round.
  const rider = spec.conditional
    ? `<strong>${spec.dice} ${spec.damageType}</strong> on ${when}`
      + ` <em>against ${spec.against}</em> — printed on the strike card for you to apply`
    : `<strong>+${spec.dice} ${spec.damageType}</strong> on ${when}`;
  if (!spec.condition) return rider;
  return `${rider}, and <strong>${spec.condition} ${spec.conditionValue}</strong> on a hit`;
}
