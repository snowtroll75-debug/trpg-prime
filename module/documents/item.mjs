import { isCompanion, resizedNaturalDamage } from "../companion.mjs";
import { weaponUsage } from "../weapon-rune-usage.mjs";
import { runeKindOf } from "../rune-bearing.mjs";
import { companionCurrentSize } from "../companion-feats.mjs";
import { computeRuneModifiers } from "../runes.mjs";
import { carriedWeightOf } from "../items.mjs";
import { grantedInnateTakesFocus, withFocusTrait } from "../combat/refocus.mjs";
import { wealthRollNeeded } from "../starting-wealth.mjs";
import { abilityScoresOf, classMinimumShortfall, classMinimumWarning } from "../class-progression.mjs";
import { focusDefaultUses } from "../uses.mjs";
import { focusExtraUses } from "../focus-declarations.mjs";
import { declarationCarriers } from "../declaration-carriers.mjs";
import { secondAspectRefusal } from "../aspect-rules.mjs";
import { exclusiveFeatRefusal } from "../module-api.mjs";
import { applyCodexInheritance } from "../codex-inheritance-workflow.mjs";
import { formLosesOf, naturalAlwaysReady } from "../combat/natural-ready.mjs";
import { RUNESTONE_TRAITS_FLAG, runestoneRefusal, runestoneTraitsUpdate } from "../runestone.mjs";
import { isCracked, isRunestone } from "../rune-transfer.mjs";

// WHICH ITEMS CARRY RUNES: `runeKindOf` (rune-bearing.mjs), since 3.577.0.

const SYSTEM_ID = "trg-prime";

export class TRGItem extends Item {
  /**
   * A GRANTED INNATE SPELL TAKES THE FOCUS TRAIT (3.311.3).
   *
   * Graham's rule: "unless a granted innate spell states specifically that
   * it can be used at will, constant or so many times per day it should
   * have the focus trait." `grantedInnateTakesFocus` (refocus.mjs) is that
   * rule; this is the one place it is applied.
   *
   * ONE SEAM, NOT TWELVE. A dozen places in feats-workflow, plus
   * grants-workflow, rune-spell-workflow and spell-effects, create innate
   * spells, and stamping the trait at each would guarantee the thirteenth
   * forgot. Every one of them ends up here, because every one of them ends
   * up creating or updating a document.
   *
   * SCOPED TO GRANTED SPELLS, per the wording of the rule. A creature's
   * own authored spell-likes and the temporary document a potion casts
   * through are untouched — neither is "granted", and a monster's Fireball
   * is not waiting on anybody's Refocus.
   */
  _applyGrantedFocusTrait(system) {
    if (this.type !== "spell") return null;
    if (!system?.innate) return null;
    if (!this.getFlag?.(SYSTEM_ID, "grantedBy")) return null;
    if (!grantedInnateTakesFocus(system)) return null;
    return withFocusTrait(system.traits);
  }

  /**
   * ONE RACE, ONE HERITAGE, ONE BACKGROUND — CHOSEN AT 1ST LEVEL, NEVER
   * CHANGED (3.549.0 for background; widened to all three at 3.552.0).
   *
   * Chapter 2, page 20: "During character creation, you'll choose one
   * race, one heritage, and a background... Once your race, heritage, and
   * background are decided, they cannot be changed later."
   *
   * The background half shipped at 3.549.0 and the other two did not,
   * because the block-1 audit only reached page 15. The pages 18-30 audit
   * found the asymmetry that left: a level-8 player could not drop their
   * background but could freely swap Dwarf for Ascendan — which changes
   * ability modifiers, size, speed, Power Points, specialist skills, core
   * languages and the entire racial feat list. The lesser rule was
   * enforced and the greater one was not. Graham's ruling, 10 September
   * 2026: lock all three.
   *
   * A second race or heritage is not a cosmetic duplicate either. Both
   * items' transferred effects apply at once, so the actor carries two
   * sets of ability modifiers and two size/speed overrides, while the
   * identity header shows only the first — the sheet saying one thing
   * while the arithmetic does another, which is the same failure the
   * background rule was written for.
   *
   * HERE, NOT IN THE SHEET, because the picker is one of four ways an
   * item arrives — a compendium drag, a drag between actors, a macro, and
   * the picker — and a rule enforced at one of them is a rule three paths
   * walk around.
   *
   * WHAT THIS DOES NOT DO: it does not require level 1 to add the FIRST
   * of any of them. Building a 12th-level character or an NPC from
   * scratch is ordinary work. The printed restriction is on CHANGING one,
   * which is the deletion rule below.
   */
  static LOCKED_IDENTITY_TYPES = Object.freeze(["race", "heritage", "background"]);

  /** What the printed rule calls this slot, for the refusal message. */
  static #identityLabel(type) {
    return type === "background" ? "background" : type;
  }

  /**
   * @returns {boolean} true when this creation must be refused
   */
  _refusedAsDuplicateIdentity(options) {
    const type = this.type;
    if (!TRGItem.LOCKED_IDENTITY_TYPES.includes(type)) return false;
    const actor = this.parent;
    if (!actor?.items) return false;
    // Migration and repair tooling declares itself rather than being
    // guessed at, so a future fix-up can rebuild an actor without this
    // rule silently eating half of it.
    if (options?.trgAllowSecondBackground) return false;
    const existing = Array.from(actor.items).filter((i) => i.type === type);
    if (!existing.length) return false;
    const label = TRGItem.#identityLabel(type);
    ui.notifications?.warn(
      `${actor.name} already has a ${label}: ${existing.map((i) => i.name).join(", ")}. ` +
        `A character selects one ${label} at 1st level and keeps it — remove the existing one first.`
    );
    return true;
  }

  /**
   * ONE DIVINE ASPECT (3.623.0, block 40, Graham's R5). "Any PC or NPC
   * that utilises the Divinity Tradition to cast spells must select a
   * Divine Aspect" — one. A second used to stack two class skills, two
   * favoured weapons and two sets of bonus spells. Refused here, at the
   * same four arrival paths the identity lock covers; removing the first
   * already cleans up everything it granted.
   *
   * @returns {boolean} true when this creation must be refused
   */
  _refusedAsSecondAspect(options) {
    if (this.type !== "divine-aspect") return false;
    const actor = this.parent;
    if (actor?.documentName !== "Actor" || !actor.items) return false;
    const existing = Array.from(actor.items).filter((i) => i.type === "divine-aspect" && i.id !== this.id);
    const refusal = secondAspectRefusal(existing, actor.name, options);
    if (!refusal) return false;
    ui.notifications?.warn(refusal);
    return true;
  }

  /**
   * ONE FEAT OF AN EXCLUSIVE GROUP (3.627.0). "A character may only ever
   * select one Unliving Archetype Feat" (Pillars of Faith, Chapter 9). The
   * picker hides the rest of the group once one is owned; this is the half
   * that holds for a compendium drag, a copy between actors or a macro —
   * the same four arrival paths the second-aspect refusal guards.
   * `options.trgAllowExclusiveFeat` lets a deliberate script through.
   */
  _refusedAsExclusiveFeat(options) {
    if (this.type !== "feat") return false;
    const actor = this.parent;
    if (actor?.documentName !== "Actor" || !actor.items) return false;
    const owned = Array.from(actor.items).filter((i) => i.type === "feat" && i.id !== this.id).map((i) => i.name);
    const refusal = exclusiveFeatRefusal(this.name, owned, actor.name, options);
    if (!refusal) return false;
    ui.notifications?.warn(refusal);
    return true;
  }

  /**
   * THE CLASS'S MINIMUM ABILITY SCORE — WARNED, NEVER REFUSED.
   *
   * Graham's ruling of 15 September 2026 (pages 41–50, R1). Page 43 gives
   * every class one ability score with a minimum requirement, and until
   * now the line sat on the class item as free text that nothing read —
   * its own tooltip admitted as much. The three options put to him were
   * leave it, warn, or refuse the class the way the identity lock above
   * refuses a second background; he took the middle one.
   *
   * SO THIS RETURNS NOTHING AND IS CALLED FOR ITS NOTIFICATION. It sits
   * beside `_refusedAsDuplicateIdentity` because it belongs to the same
   * moment and the same four arrival paths — compendium drag, drag
   * between actors, macro, picker — but it must never grow a `return
   * false`, or a ruling becomes its opposite by a one-word edit.
   *
   * CHARACTERS ONLY. An NPC or a companion carrying a class item for its
   * table is not a player building a character against the class entry,
   * and a stat-block that scolds the GM is noise.
   */
  _warnBelowClassMinimum() {
    if (this.type !== "class") return;
    const actor = this.parent;
    if (actor?.documentName !== "Actor" || actor.type !== "character") return;
    const shortfall = classMinimumShortfall(this, abilityScoresOf(actor));
    if (!shortfall) return;
    ui.notifications?.warn(classMinimumWarning(shortfall));
  }

  /**
   * The other half of the same rule: race, heritage and background
   * "cannot be changed later", so removing one above 1st level is
   * refused.
   *
   * THE GM IS EXEMPT (Graham's ruling, 10 September 2026). A GM
   * rebuilding a character, correcting a mis-clicked pick or running a
   * story reason to change someone's past is doing something the rule
   * exists to stop a PLAYER doing casually. Refusing the GM would leave a
   * wrong race permanently welded to the sheet, which is a worse failure
   * than the one being prevented.
   *
   * @returns {boolean} true when this deletion must be refused
   */
  _refusedAsIdentityRemoval(options) {
    const type = this.type;
    if (!TRGItem.LOCKED_IDENTITY_TYPES.includes(type)) return false;
    const actor = this.parent;
    if (!actor) return false;
    if (options?.trgAllowSecondBackground) return false;
    if (game.user?.isGM) return false;
    const level = Number(actor.system?.identity?.level ?? 1);
    if (!(level > 1)) return false;
    const label = TRGItem.#identityLabel(type);
    ui.notifications?.warn(
      `${this.name} cannot be removed: a ${label} is chosen at 1st level and cannot be changed ` +
        `at higher levels (${actor.name} is level ${level}). Ask your GM if it needs to change.`
    );
    return true;
  }

  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (this._refusedAsDuplicateIdentity(options)) return false;
    if (this._refusedAsSecondAspect(options)) return false;
    if (this._refusedAsExclusiveFeat(options)) return false;
    this._warnBelowClassMinimum();
    const traits = this._applyGrantedFocusTrait(this.system);
    if (traits !== null) this.updateSource({ "system.traits": traits });
    // …AND ARRIVES WITH THAT ONE USE AVAILABLE (3.562.0). The default count
    // lives in focusDefaultUses; a stored 0 would read as spent. A Focus
    // feat or ability is primed the same way (3.665.0, D1).
    const focusUses = focusDefaultUses({ ...this.system, traits: traits ?? this.system?.traits }, this.type);
    if (focusUses !== null) {
      // …WITH EVERY USE IT HAS (3.667.1): the extra uses the owner's carriers
      // declare (Inner Tempest's Deep Focus) arrive full too. Found in the
      // live test of 3.667.0: a Disciple's techniques arrived 1 of 2.
      const owner = this.parent?.documentName === "Actor" ? this.parent : null;
      const extra = owner
        ? focusExtraUses({ name: this.name, system: { ...this.system, traits: traits ?? this.system?.traits } }, declarationCarriers(owner))
        : 0;
      const full = focusUses + extra;
      if (Number(this.system?.usesValue ?? 0) < full) this.updateSource({ "system.usesValue": full });
    }
    await this._recordWealthRoll();
    // A RUNESTONE ARRIVING WITH A RUNE ON IT (3.666.2) carries that rune's
    // school and tradition traits; one arriving with two is refused.
    if (this._refusedAsRunestone(this.system?.runes ?? "", "")) return false;
    const stone = runestoneTraitsUpdate(this, this.system?.runes ?? "");
    if (stone) {
      this.updateSource({ "system.traits": stone.traits, [`flags.${SYSTEM_ID}.${RUNESTONE_TRAITS_FLAG}`]: stone.added });
    }
    return allowed;
  }

  /**
   * THE RUNESTONE'S ONE RUNE (3.666.2): "You can inscribe only one rune upon
   * the stone at any one time", and a cracked stone stores none. Refused
   * with the reason rather than trimmed, so nothing typed is silently lost.
   */
  _refusedAsRunestone(after, before) {
    if (this.type !== "gear" || !isRunestone(this)) return false;
    const reason = runestoneRefusal({ after, before, cracked: isCracked(this) });
    if (!reason) return false;
    ui.notifications?.warn?.(`${this.name}: ${reason}.`);
    return true;
  }

  /**
   * The Gambler's 1d4-2, rolled ONCE.
   *
   * Chapter 6 prints one background's wealth as a formula. A formula
   * re-rolled whenever the sheet derived would make a character's
   * starting wealth a thing that changed while you looked at it, so the
   * roll happens here — before the document exists, so nothing is
   * written from inside a hook — and the RESULT is what everything
   * downstream reads.
   *
   * Only ever writes to a document that has none recorded: an item
   * copied between actors, or restored from a backup, keeps the number
   * the character was created with.
   */
  async _recordWealthRoll() {
    // The DECISION is in starting-wealth.mjs, where the harness can run
    // it. This method is the part that cannot leave: rolling dice and
    // writing the answer onto a document.
    const printed = wealthRollNeeded(this);
    if (!printed) return;

    try {
      const roll = await new Roll(printed).evaluate();
      this.updateSource({ [`flags.${SYSTEM_ID}.wealthRoll`]: Math.trunc(Number(roll.total) || 0) });
    } catch (error) {
      console.warn(`${SYSTEM_ID} | could not roll wealth formula "${printed}"`, error);
    }
  }

  async _preDelete(options, user) {
    const allowed = await super._preDelete(options, user);
    if (allowed === false) return false;
    if (this._refusedAsIdentityRemoval(options)) return false;
    return allowed;
  }

  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;
    // A RUNESTONE'S RUNE CHANGING (3.666.2): one at a time, and the stone's
    // traits follow it — a Transfer Runes off the stone takes them away. See
    // runestone.mjs.
    if (changed?.system?.runes !== undefined) {
      if (this._refusedAsRunestone(changed.system.runes, this.system?.runes ?? "")) return false;
      const stone = runestoneTraitsUpdate(this, changed.system.runes, changed.system.traits);
      if (stone) {
        foundry.utils.setProperty(changed, "system.traits", stone.traits);
        foundry.utils.setProperty(changed, `flags.${SYSTEM_ID}.${RUNESTONE_TRAITS_FLAG}`, stone.added);
      }
    }
    // Several feats convert an existing spell by setting `system.innate`
    // on it, which never passes through _preCreate. Same rule, applied to
    // what the document is ABOUT to become.
    const next = foundry.utils.mergeObject(
      foundry.utils.deepClone(this.system ?? {}),
      changed?.system ?? {},
      { inplace: false }
    );
    if (!next?.innate) return allowed;
    if (changed?.system?.traits !== undefined) return allowed;
    const traits = this._applyGrantedFocusTrait(next);
    if (traits !== null) foundry.utils.setProperty(changed, "system.traits", traits);
    return allowed;
  }

  /**
   * Produce a normalised copy of this Item's stored system data, suitable for
   * use as the `system` payload of a migration update.
   *
   * Reads from `_source` rather than `toObject()` so that derived values such
   * as `totalWeight` are never written back into the stored document.
   *
   * @returns {object} The migrated system data.
   */
  migrateSystemData() {
    const source = foundry.utils.deepClone(this._source?.system ?? {});

    // `totalWeight` is derived in prepareDerivedData and must never persist.
    delete source.totalWeight;

    const template = foundry.utils.deepClone(
      game.model?.Item?.[this.type] ?? {}
    );

    // Stored values win; the template only restores fields that are absent.
    return foundry.utils.mergeObject(template, source, {
      insertKeys: true,
      insertValues: true,
      overwrite: true,
      recursive: true,
      inplace: true
    });
  }

  prepareBaseData() {
    super.prepareBaseData();
    // CODEX INHERITANCE (3.631.0): a Codex ability's copy takes its entry's
    // declarations before anything derives from them. See codex-inheritance.mjs.
    applyCodexInheritance(this);
  }

  prepareDerivedData() {
    super.prepareDerivedData();
    this._resizeNaturalAttack();
    this._readyNaturalAttack();
    this._applyRunes();

    if (!Object.hasOwn(this.system, "weight")) return;

    // THE THIRD MULTIPLICATION, AND THE ONE THAT SHOWS.
    //
    // `carriedWeightOf` (items.mjs) was written on 12 Aug 2026 to be the
    // ONE place weight is totalled, precisely because a bundle's printed
    // weight covers the whole bundle: "Arrows (20)" ships `quantity: 20`,
    // `weight: 3` and `batchSize: 20`, and the 3 lb is all twenty. Its own
    // comment says "three multiplications in three files is how they stop
    // agreeing". Two of the three were converted — the actor's encumbrance
    // and the party loot pile. THIS ONE WAS NOT.
    //
    // It is the sole producer of `system.totalWeight`, which the Inventory
    // tab prints verbatim, so the sheet has been disagreeing with itself
    // ever since: a quiver of arrows read 60 lb in its own row and 3 lb in
    // the Encumbrance box beside it. Reported by Graham on 14 Aug 2026,
    // with a screenshot of the row: "Arrows (20) · Qty 20 · Wt 60".
    //
    // A harness now reads this file (verify-batch-weight, section C) —
    // nothing in tools/ ever did, which is how a fix declared complete
    // shipped two-thirds done.
    this.system.totalWeight = Math.round(
      carriedWeightOf(this, {
        worn: this.type === "armour" && this.system.equipped
      }) * 100
    ) / 100;
  }

  /**
   * A companion's natural attack, stepped to the size it has grown to.
   *
   * Increase Size makes a companion bigger and its bite bigger with it.
   * The pack authors a natural weapon per size — Bite (Tiny/Small/Medium)
   * — but only as far as Medium, and a Bear's maximum is Huge, so past
   * the authored ladder the damage has to be computed. Rather than swap
   * items at some sizes and compute at others, it is always computed
   * from whatever size the item itself is written for.
   *
   * WHY HERE RATHER THAN ON THE ACTOR. An item's derived data is prepared
   * before the actor's, so an actor-side pass would have to reach into
   * every owned item after the fact and would be undone by any later
   * item preparation. Doing it in the item's own derivation is the
   * ordinary place, and it needs nothing derived to work: starting size,
   * maximum size and the companion's feats are all SOURCE data, which is
   * available at this point in the cycle where `actor.system.identity.size`
   * (an ActiveEffect result) is not yet.
   *
   * `_source.system.damage` is the input every cycle, never the already
   * derived value — re-stepping a stepped die would climb the ladder
   * once per preparation.
   *
   * NOT A `#private` METHOD, and that is not a style choice. Foundry
   * calls `prepareData` from inside `DataModel`'s own constructor, by way
   * of `_initialize` — so it runs while `super()` is still executing,
   * BEFORE a subclass's private methods have been installed on the
   * instance. A `#` method here throws "Receiver must be an instance of
   * class TRGItem" for every document built that way, which is every
   * compendium entry in the world: 3690 caught errors on one page load,
   * found live at 3.233.7 while the feature itself appeared to work
   * perfectly, because `_safePrepareData` swallows them.
   */
  /**
   * What this item's runes do to it (Chapter 11).
   *
   * The rune model has existed since 3.235.0 and until now nothing read
   * an item's runes — this is the method that makes inscribing Potency
   * II on a sword move a number rather than describe one.
   *
   * TWO RESULTS, and they leave by different doors. A WEAPON's potency
   * is an item bonus to attack, and the attack workflow already reads
   * `system.attackBonus`, so it is folded in there. ARMOUR AND SHIELDS
   * get an item bonus to DB, which is an ACTOR-level number — armour has
   * no DB field of its own — so the figure is published here and the
   * actor's defence block picks it up from every equipped piece.
   *
   * `_source.system.attackBonus` IS THE INPUT EVERY CYCLE, never the
   * already-derived value. Adding the rune bonus to the derived field
   * would compound it on every preparation, which is the same trap
   * `_resizeNaturalAttack` documents above — and prepareDerivedData runs
   * far more often than anyone expects.
   *
   * NOT `#private`, for the reason given above this method's neighbour.
   */
  _applyRunes() {
    // `runeKindOf` (3.577.0): Travellers clothing "can be upgraded like
    // armour" (R9), so a gear item flagged as runed clothing is prepared
    // exactly as armour is.
    const kind = runeKindOf(this);
    if (!kind) return;
    if (!Object.hasOwn(this.system ?? {}, "runes")) return;
    // A DIVINE RUNE IS NOT AN ETCHED ONE (3.331.0). Blade Ally writes
    // this flag when it imbues the weapon and clears it on release; it
    // spares that one rune the potency prerequisite and the additional-
    // rune allowance, and changes nothing about what the rune does.
    // Read from the item's own flag because this method runs on the
    // ITEM and cannot see the actor's Divine Ally ability.
    const onLoan = this.flags?.["trg-prime"]?.bladeAllyRune;
    const modifiers = computeRuneModifiers({
      kind,
      runes: this.system.runes,
      quality: this.system.quality,
      exempt: onLoan ? [onLoan] : [],
      // A RUNE THE WEAPON CANNOT TAKE (3.618.0, B10) is listed as suppressed.
      usage: this.type === "weapon" ? weaponUsage(this.system) : null
    });
    this.system.runeModifiers = modifiers;

    if (this.type === "weapon") {
      const authored = Number(this._source?.system?.attackBonus ?? 0) || 0;
      this.system.runeAttackBonus = modifiers.attack;
      // +1 damage a potency tier (3.618.0, R7), read by the damage roll.
      this.system.runeDamageBonus = modifiers.damage;
      this.system.attackBonus = authored + modifiers.attack;
      return;
    }
    // Published for the actor's defence block, which is where an item
    // bonus to DB has to be applied.
    this.system.runeDefenceBonus = modifiers.db;
    this.system.runeHitPoints = modifiers.hp;
  }

  /**
   * A CHARACTER'S NATURAL ATTACK IS ALWAYS READY (3.666.0; Graham, 21 Oct
   * 2026). Read as equipped wherever `system.equipped` is read — see
   * combat/natural-ready.mjs for who, and for the form that sets one aside.
   * Derived, never written: the stored value is left as it was.
   */
  _readyNaturalAttack() {
    if (this.type !== "weapon" || !this.system?.natural || this.system.equipped) return;
    const actor = this.actor;
    if (!actor) return;
    const loses = formLosesOf(actor.effects, "trg-prime", "changeShapeForm");
    if (naturalAlwaysReady({ type: this.type, natural: true, name: this.name }, actor.type, loses)) this.system.equipped = true;
  }

  _resizeNaturalAttack() {
    if (this.type !== "weapon" || !this.system?.natural) return;
    const actor = this.actor;
    if (!isCompanion(actor)) return;
    const companion = actor._source?.system?.companion ?? actor.system?.companion;
    const grown = companionCurrentSize({
      startingSize: companion?.startingSize,
      maximumSize: companion?.maximumSize,
      featNames: Array.from(actor.items ?? [])
        .filter((i) => i.type === "feat")
        .map((i) => i._source?.name ?? i.name)
    });
    const authored = String(this.system.size ?? "");
    const printed = String(this._source?.system?.damage ?? this.system.damage ?? "");
    if (!grown || !authored || grown === authored) return;
    const resized = resizedNaturalDamage(printed, authored, grown);
    // Null when either size or the damage expression is unrecognised —
    // a homebrew "2d6+1" or a size this system does not know. Leave the
    // printed value alone rather than blanking a weapon's damage.
    if (!resized) return;
    this.system.damage = resized;
    // What the attack actually is now, for the sheet and the card. The
    // item's NAME is deliberately left as authored ("Bite (Small)"):
    // grant reconciliation matches owned items against pack entries, and
    // a derived rename would make a grown companion look like it was
    // missing its granted attack.
    this.system.naturalSize = grown;
  }
}
