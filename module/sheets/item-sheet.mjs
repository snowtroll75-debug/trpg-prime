import { weaponUsage } from "../weapon-rune-usage.mjs";
import { isRunedClothing } from "../rune-bearing.mjs";
import { isCracked, isRunestone } from "../rune-transfer.mjs";
import { RUNESTONE_TRAITS_FLAG } from "../runestone.mjs";
import { DAMAGE_TYPES, SIZE_TABLE, TRADITIONS } from "../config.mjs";
import { donningTimeFor, runeUsageNotes } from "../codex-runes.mjs";
import { isFullSuit } from "../donning.mjs";
import { potencySummary, roman } from "../runes.mjs";
import { QUALITY_TIERS, MATERIALS, SUPERIOR_TRAITS, computeFullCustomisation, dragonhideLabel } from "../item-quality.mjs";
import { parseGrantList } from "../grants.mjs";
import { promptCustomiseItem } from "../item-customize-workflow.mjs";
import { runeActionsFor, runeStateOf, usesRemaining } from "../rune-actions.mjs";
import { eventRunesFor, eventUsesRemaining } from "../rune-events.mjs";
import { frequencyFor, spellEffectRunesOf } from "../rune-spell-effect.mjs";
import { useRuneAction } from "../rune-actions-workflow.mjs";
import { openSpellBookPick, spellBookContext } from "../magic/spellbook-workflow.mjs";
import { spellBookSpells } from "../magic/spellbook.mjs";
import { spellListFilterOptions, wireSpellListFilters } from "./list-filters.mjs";
import { itemRequiredHands } from "../held-items.mjs";

const { ItemSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

export class TRGItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["trg-prime", "sheet", "item"],
    position: {
      width: 620,
      height: 650,
      // See the matching comment in actor-sheet.mjs — this theory was
      // also disproven, but the explicit position is kept regardless.
      top: 120,
      left: 120
    },
    window: {
      icon: "fa-solid fa-gem",
      resizable: true
    },
    form: {
      closeOnSubmit: false,
      submitOnChange: true
    },
    actions: {
      editImage: TRGItemSheet.editImage,
      addStage: TRGItemSheet.addStage,
      removeStage: TRGItemSheet.removeStage,
      customiseItem: TRGItemSheet.customiseItem,
      useRuneAction: TRGItemSheet.useRuneAction,
      addToSpellBook: TRGItemSheet.addToSpellBook,
      openBookSpell: TRGItemSheet.openBookSpell
    }
  };

  static PARTS = {
    form: {
      template: "systems/trg-prime/templates/item/item-sheet.hbs"
    }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    context.editable = this.isEditable;
    context.typeLabel =
      this.item.type.charAt(0).toUpperCase() + this.item.type.slice(1);
    context.damageTypeChoices = Object.fromEntries(
      Object.entries(DAMAGE_TYPES).map(([key, entry]) => [key, entry.label])
    );
    // A creature type's elemental immunity/weakness (Elemental only — the
    // book never fixes which element a given Elemental favours, so this
    // is a per-instance GM choice) is optional, unlike a weapon's damage
    // type — the blank option is what "not an Elemental" or "hasn't been
    // set yet" looks like.
    context.damageTypeChoicesWithNone = { "": "—", ...context.damageTypeChoices };
    // A CLOSED-LIST SIZE DROPDOWN WAS TRIED AT 3.368.0 AND REVERTED. The
    // field is not only a size: `S/1h` and `S/2h` carry a hand requirement
    // alongside it, and a dozen entries hold `-`. A select would have
    // rewritten every one of those to a bare category the first time
    // anybody opened the sheet, losing what they said. The vocabulary fix
    // that mattered — `L` and `Large` meaning the same thing — lives in
    // `normaliseSize`, where every reader shares it.

    // HANDS IS SHOWN, NOT ASKED FOR (3.370.0). `system.hands` was an
    // editable number on every weapon sheet that NO RULE READ. The real
    // hand cost comes from the weapon's size against the wielder's, plus
    // the 2-Handed trait — and the two disagreed on 25 of 76 pack
    // weapons. A Greataxe's box said 1 while the system charged 2, and
    // the box is the one that looks authoritative to somebody editing an
    // item. Two places deciding one question, with the wrong one holding
    // the pen. The field is gone from the schema and the input is now a
    // read-only display of the answer that actually applies.
    //
    // SIZED AGAINST THE OWNER WHERE THERE IS ONE. Hand cost is relative,
    // so an unowned item has no true answer — it is labelled as assuming
    // a Medium wielder rather than quietly presenting one size's answer
    // as universal.
    const wielderSize = this.item.actor?.system?.identity?.size ?? null;
    const hands = itemRequiredHands(this.item, wielderSize ?? "medium");
    context.handsDisplay = {
      // null from itemRequiredHands means "cannot be wielded at all by a
      // creature this size", which is a different fact from "zero hands"
      // and must not be printed as 0.
      text: hands === null ? "Cannot be wielded" : `${hands}`,
      unwieldable: hands === null,
      assumedMedium: !wielderSize,
      wielderSize: wielderSize ?? "medium"
    };
    // MOUNTED USE (3.576.0): the lance needs a mount, the composite
    // longbow refuses one. See combat/mounted.mjs.
    context.mountedUseChoices = {
      "": "Either",
      required: "Only while mounted",
      forbidden: "Never while mounted"
    };
    context.attackModeChoices = {
      melee: "Melee",
      missile: "Missile",
      thrown: "Thrown",
      unarmed: "Unarmed"
    };
    context.sizeChoices = Object.fromEntries(
      Object.entries(SIZE_TABLE).map(([key, entry]) => [key, entry.label])
    );

    context.isPhysical = [
      "weapon",
      "armour",
      "shield",
      "gear",
      "consumable",
      "ammunition"
    ].includes(this.item.type);
    context.isWeapon = this.item.type === "weapon";
    context.isArmour = this.item.type === "armour";
    context.isShield = this.item.type === "shield";

    if (context.isWeapon || context.isArmour || context.isShield) {
      const quality = this.item.system.quality || "standard";
      const material = this.item.system.material || "";
      const traitKeys = parseGrantList(this.item.system.superiorTraits || "");
      const traitDefs = SUPERIOR_TRAITS[this.item.type] ?? {};

      context.qualityLabel = QUALITY_TIERS[quality]?.label ?? "Standard";
      context.materialLabel = material ? (MATERIALS[material]?.label ?? material) : "None";
      // DRAGONHIDE SAYS WHICH DRAGON (3.574.0), or says that none has been
      // chosen — because a suit with no dragon grants neither the
      // resistance nor the shield's DB, and the sheet is where a player
      // would look to find out why.
      if (material === "dragonhide") {
        const dragon = dragonhideLabel(this.item.system);
        context.materialLabel += dragon ? ` (${dragon})` : " (no dragon chosen — Customise to pick one)";
      }
      context.traitsLabel = traitKeys.length
        ? traitKeys.map((key) => traitDefs[key]?.label ?? key).join(", ")
        : "None";

      this._runeContext(context);
    }

    context.isGear = this.item.type === "gear";
    // RUNED CLOTHING (3.577.0, R9): Travellers "can be upgraded like
    // armour", so its sheet carries the same Runes panel.
    if (context.isGear && isRunedClothing(this.item)) this._runeContext(context);
    // A RUNESTONE (3.666.2): its one stored rune, what that rune lends the
    // stone, and whether a Partial has cracked it. See runestone.mjs.
    context.runestone = context.isGear && isRunestone(this.item)
      ? {
        cracked: isCracked(this.item),
        traitsLabel: (this.item.flags?.["trg-prime"]?.[RUNESTONE_TRAITS_FLAG] ?? []).join(", "),
        plural: (this.item.flags?.["trg-prime"]?.[RUNESTONE_TRAITS_FLAG] ?? []).length > 1
      }
      : null;
    // A gear item that carries the growing Spell Book itself (currently
    // only the Wizard's Spellbook, granted free through GRANT_FIELDS.class
    // — see grants-workflow.mjs) renders its own slot ladder here rather
    // than on the Magic tab: the book is what the rules say holds the
    // spells, so this is where a player actually looks to grow it.
    // `this.item.actor` is null for an unowned copy (compendium, or a
    // world item not on anyone's sheet) — spellBookContext needs a real
    // actor and is left null in that case, same as it already returns
    // null for any character whose class isn't book-style.
    context.isSpellbookContainer = context.isGear && Boolean(this.item.system.spellbookContainer);
    if (context.isSpellbookContainer) {
      const owner = this.item.actor;
      context.spellBook = owner ? spellBookContext(owner) : null;
      // The book's actual contents — every spell the owner has ever
      // added, whether or not it's currently memorised for the day.
      // Deliberately NOT filtered on `system.prepared`: that's the
      // Magic tab's job (an unprepared book pick still belongs to the
      // book, it just isn't castable today) — see actor-sheet.mjs's
      // #groupItems, which hides an unprepared book pick from the Magic
      // tab's own spell list for the opposite reason.
      context.spellBookSpells = owner
        ? spellBookSpells(owner)
            .map((spell) => ({
              id: spell.id,
              name: spell.name,
              img: spell.img,
              tradition: spell.system?.tradition ?? "",
              ppCost: spell.system?.ppCost ?? 0,
              prepared: Boolean(spell.system?.prepared)
            }))
            .sort((a, b) => a.name.localeCompare(b.name))
        : [];
      // Tradition/PP filter options (Graham, 3.230.5) — derived from
      // the book's own contents, not a fixed list; see list-filters.mjs.
      context.spellBookFilters = spellListFilterOptions(context.spellBookSpells, TRADITIONS);
    }
    context.isConsumable = this.item.type === "consumable";
    if (context.isConsumable) {
      // WHICH SPELL DOES THIS RELEASE (3.310.0). The builder writes this
      // flag; hand-made and imported consumables need somewhere to say it,
      // or the Use button on the sheet has nothing to release. A name and
      // its PP, not a compendium picker: a world may have house spells the
      // pack has never heard of, and the use workflow resolves by name
      // against the actor's own spells first for exactly that reason.
      const consumable = this.item.flags?.["trg-prime"]?.consumable ?? {};
      const spell = consumable.spell ?? {};
      context.consumableKindChoices = {
        potion: "Potion",
        unguent: "Unguent",
        scroll: "Scroll",
        other: "Other"
      };
      context.consumableKind = String(consumable.kind ?? "");
      context.consumableSpellName = typeof spell === "string" ? spell : String(spell.name ?? "");
      context.consumableSpellPP = typeof spell === "string" ? 0 : Number(spell.pp ?? 0);
      context.consumableSpellUuid = typeof spell === "string" ? "" : String(spell.uuid ?? "");
      context.consumableNeedsCheck = context.consumableKind === "scroll";
    }
    context.isAmmunition = this.item.type === "ammunition";
    context.isSpell = this.item.type === "spell";
    context.spellCategoryChoices = {
      utility: "Utility",
      save: "Save",
      attack: "Attack"
    };
    context.isAffliction = this.item.type === "affliction";
    context.afflictionTypeChoices = {
      poison: "Poison",
      disease: "Disease",
      curse: "Curse",
      other: "Other"
    };
    context.savingThrowChoices = {
      fortitude: "Fortitude",
      reflex: "Reflex",
      will: "Will"
    };
    context.rarityChoices = {
      common: "Common",
      uncommon: "Uncommon",
      rare: "Rare"
    };
    // Creature Type (Creature Codex): a full item type in its own right,
    // rendered standalone rather than nested in the shared Feature
    // block — the same precedent as Affliction just above — since it
    // carries ability modifiers, a Death State, Critical Resistance,
    // natural DR, an elemental immunity/weakness pair and four
    // structural combat flags no other feature type has.
    context.isCreatureType = this.item.type === "creature-type";
    context.isFeature = [
      "feat",
      "ability",
      "skill",
      "class",
      "race",
      "heritage",
      "background",
      "origin"
    ].includes(this.item.type);
    context.isFeat = this.item.type === "feat";
    context.isAbility = this.item.type === "ability";
    // Race and Heritage carried four and five schema fields respectively
    // that the sheet never rendered — including the heritage's
    // sourceRace, which is the single field the heritage picker filters
    // on. A blank one silently offers that heritage to every race, and
    // there was no way to see or correct it in the app.
    context.isRace = this.item.type === "race";
    context.isHeritage = this.item.type === "heritage";
    // Backgrounds carried grant fields that the sheet never rendered
    // either — the Soldier entry has had a Specialist Skill and a Skill
    // Bonuses line since 3.35.1 with no way to see or correct them.
    context.isBackground = this.item.type === "background";
    // A campaign origin carries a background's grant fields, so it gets a
    // background's editor rather than a second one that would drift.
    context.isOrigin = this.item.type === "origin";
    context.isBackgroundLike = context.isBackground || context.isOrigin;
    // A class carries five schema fields the sheet never rendered, plus
    // the progression table added in 3.203.0. Unlike the race and
    // background cases this is not only tidiness: the character sheet now
    // DERIVES its BAB, defence, saves, HP, PP and caster level from this
    // table, so an unreadable class item is a character sheet full of
    // numbers with no visible origin.
    context.isClass = this.item.type === "class";
    if (context.isClass) {
      // Read-only, as a table. Twenty rows of nine numbers is not
      // something to edit through an input grid; the pack is where it is
      // authored and this is where it is checked.
      context.progressionRows = (this.item.system.progression ?? []).map((row) => ({
        ...row,
        // The book prints "-" for a class with no casting. Blank cells
        // and zeroes mean different things here — a Fighter has NO
        // caster level, which is not the same as a caster level of 0.
        casterLevelText: row.casterLevel === null || row.casterLevel === undefined
          ? "—" : row.casterLevel,
        ppText: row.pp === null || row.pp === undefined ? "—" : row.pp,
        // The Cleric's and the Druid's tables have no Bonus Feats column
        // at all, which is a different statement from the Ranger printing
        // 0 in one — so it reads as a dash rather than as twenty zeros.
        bonusFeatsText: row.bonusFeats === null || row.bonusFeats === undefined
          ? "—" : row.bonusFeats
      }));
    }
    context.classTypeChoices = {
      "": "—",
      Adept: "Adept",
      Expert: "Expert",
      Martial: "Martial",
      "Adept/Expert": "Adept/Expert"
    };
    context.featCategoryChoices = {
      "": "—",
      Racial: "Racial",
      Archetype: "Archetype",
      Class: "Class",
      General: "General"
    };
    context.abilityCategoryChoices = {
      "": "—",
      Racial: "Racial",
      Class: "Class",
      Proficiency: "Proficiency"
    };
    context.isUsable = ["feat", "ability"].includes(this.item.type);
    context.stagesForDisplay = (this.item.system.stages ?? []).map(
      (stage, index) => ({ ...stage, index, number: index + 1 })
    );

    return context;
  }

  /** Wires the Spell Book contents list's Tradition/PP filter row —
   * plain DOM row-hiding, not sheet state (see list-filters.mjs). */
  _onRender(context, options) {
    super._onRender?.(context, options);
    wireSpellListFilters(this.element, {
      rowSelector: ".book-spell-row",
      filters: [
        { select: ".spell-filter-tradition", data: "tradition", mode: "list" },
        { select: ".spell-filter-pp", data: "pp" }
      ]
    });
  }

  /** Opens Foundry's own file picker to change the item's icon. */
  static async editImage() {
    const FilePickerImpl = foundry.applications?.apps?.FilePicker ?? globalThis.FilePicker;
    const picker = new FilePickerImpl({
      type: "image",
      current: this.item.img,
      callback: (path) => this.item.update({ img: path })
    });
    return picker.render(true);
  }

  static async addStage() {
    const stages = foundry.utils.deepClone(this.item.system.stages ?? []);
    stages.push({
      effect: "",
      interval: "",
      criticalOnFailure: false,
      criticalDamageType: "poison"
    });
    await this.item.update({
      "system.stages": stages,
      "system.maxStage": stages.length
    });
  }

  static async removeStage(event, target) {
    const index = Number(target.closest("[data-stage-index]")?.dataset.stageIndex);
    if (!Number.isInteger(index)) return;
    const stages = foundry.utils.deepClone(this.item.system.stages ?? []);
    stages.splice(index, 1);
    await this.item.update({
      "system.stages": stages,
      "system.maxStage": Math.max(1, stages.length)
    });
  }

  /**
   * Opens the Quality/Material/Superior Traits dialog for this item
   * (weapon/armour/shield) and applies the result.
   *
   * The item's own system.itemLevel/price/hp.max may already reflect
   * an earlier customisation — recomputing from those directly would
   * double-apply that earlier change on top of itself. The item's
   * true, un-customised base values are captured into flags the first
   * time this runs (if not already present) and always used as the
   * starting point for the computation, however many times the item
   * gets recustomised afterward.
   */
  static async customiseItem() {
    const item = this.item;
    const existingBase = item.flags?.["trg-prime"]?.baseCustomisation;
    const base = existingBase ?? {
      level: item.system.itemLevel ?? 0,
      price: item.system.price ?? 0,
      hp: item.system.hp?.max ?? 0,
      weight: item.system.weight ?? 0
    };
    // An item customised before 3.97.1 has a baseCustomisation flag with no
    // weight recorded, because weight was never part of it. Backfill from the
    // item's current weight — for those items that is still the untouched
    // base, since nothing had ever changed it.
    if (base.weight === undefined) base.weight = item.system.weight ?? 0;

    const baseData = {
      ...base,
      // A shield's size is its category; see computeFullCustomisation.
      category: item.system.category ?? "",
      // A shield's `metal`, so Dragonhide is refused for a wooden one.
      metal: item.type === "shield" ? Boolean(item.system.metal) : undefined
    };

    const currentTraitKeys = parseGrantList(item.system.superiorTraits || "");
    const choice = await promptCustomiseItem(item.type, baseData, {
      title: `Customise ${item.name}`,
      quality: item.system.quality || "standard",
      material: item.system.material || "",
      dragonType: item.system.dragonType || "",
      traitKeys: currentTraitKeys,
      runes: item.system.runes || "",
      usage: item.type === "weapon" ? weaponUsage(item.system) : null
    });
    if (!choice) return;

    const result = computeFullCustomisation(item.type, baseData, choice);

    const updates = {
      "system.quality": choice.quality,
      "system.material": choice.material,
      "system.dragonType": choice.dragonType ?? "",
      "system.superiorTraits": choice.traitKeys.join(","),
      // The runes the dialog produced, in the field the item's own
      // derivation reads (`_applyRunes`). Before 3.241.0 this dialog did
      // not touch them at all, which is why inscribing a rune moved no
      // price: the two halves never met.
      "system.runes": choice.runes ?? "",
      "system.itemLevel": result.effectiveLevel,
      "system.price": result.price,
      "system.weight": result.weight,
      "flags.trg-prime.baseCustomisation": base
    };

    if (item.system.hp) {
      const wasFullHealth = item.system.hp.value >= item.system.hp.max;
      updates["system.hp.max"] = result.hpMax;
      updates["system.hp.value"] = wasFullHealth
        ? result.hpMax
        : Math.min(item.system.hp.value, result.hpMax);
    }

    await item.update(updates);
  }

  /**
   * The Spell Book container's own "Add to Book" button — only ever
   * rendered when `isSpellbookContainer` is true (see `_prepareContext`),
   * but guarded again here since actions dispatch straight off the DOM.
   * Delegates to the same `openSpellBookPick` the Magic tab's card used
   * to call directly; the actor is this item's OWNER, not the item.
   */
  /**
   * One of the item's activated runes. The actor is the item's OWNER —
   * a rune on a weapon in a chest has nobody to animate it for.
   */
  static async useRuneAction(event, target) {
    const actor = this.item.actor;
    if (!actor) {
      ui.notifications.warn("Give this item to a character first — a rune needs someone to use it.");
      return null;
    }
    return useRuneAction(actor, this.item, target.dataset.rune);
  }

  static async addToSpellBook() {
    const actor = this.item.actor;
    if (!actor) {
      ui.notifications.warn("Add this book to a character's inventory first — it has nothing to grow on its own.");
      return null;
    }
    return openSpellBookPick(actor);
  }

  /**
   * Opens one of the book's own spells in its own item sheet — this
   * card is a browse/open list, not an editor, so clicking a row hands
   * off to the spell's ordinary sheet rather than trying to reproduce
   * its fields here.
   */
  static async openBookSpell(event, target) {
    const actor = this.item.actor;
    const spellId = target.closest("[data-spell-id]")?.dataset.spellId;
    const spell = spellId ? actor?.items.get(spellId) : null;
    if (spell) spell.sheet.render(true);
  }

  /**
   * The Runes panel's context, for any item that carries runes — a weapon,
   * armour, a shield, or (3.577.0) runed clothing. Moved out of
   * `_prepareContext` unchanged so the clothing branch asks the same code.
   *
   * NOT `#private`, for the reason given above `_prepareContext`'s
   * neighbours.
   *
   * @param {object} context
   */
  _runeContext(context) {
    context.runedClothing = isRunedClothing(this.item);
    // RUNES (Chapter 11). The item's own derivation has already worked
    // out what they do (`_applyRunes` in documents/item.mjs); the sheet
    // reports it — including the problems, which are REPORTED rather
    // than enforced. A GM mid-build should see "that needs a potency
    // rune first", not have their typing deleted.
    context.isRuneBearing = true;
    const runeModifiers = this.item.system.runeModifiers ?? null;
    // The label beside this already says "Potency", so the value does
    // not repeat it — "Potency: Potency II — +2 to attack" was what the
    // first version printed.
    // DONNING (Chapter 6), on the armour that has to be put on. The
    // chapter's own time, and Fleetguard's if the rune is inscribed —
    // both, because the rune REPLACES the printed time rather than
    // reducing it, and a sheet that showed only the new figure would
    // hide what the rune is worth.
    //
    // THE FULL-SUIT DOUBLING IS APPLIED (3.573.0). This used to say the
    // item could not know whether it was "a full suit of armour" and
    // that guessing would double a helmet — which was right about the
    // guess and wrong about the knowing. Page 149 defines a suit as one
    // that includes greaves and bracers, i.e. that covers the legs and
    // arms as well as the torso, and every armour item already records
    // its coverage. A helmet covers none of the three. See `isFullSuit`.
    context.donning = this.item.type === "armour"
      ? donningTimeFor(this.item, { fullSuit: isFullSuit(this.item) })
      : null;
    // THE SUMMARY IS BUILT IN `runes.mjs`, not here. It was built here,
    // and it passed the tier — already a numeral string — through
    // `roman()`, which takes a number: every potency rune in every
    // world printed "Potency: — +1 to attack" with the numeral missing,
    // and nothing could have caught it because nothing on this sheet is
    // reachable from a harness. See `potencySummary`.
    context.runeSummary = potencySummary(runeModifiers, { isWeapon: context.isWeapon });
    // ALWAYS THE NUMERAL, including tier I. "Flaming" and "Flaming I"
    // are the same rune, but the book prints the numeral and a player
    // comparing the sheet to the page should see the same thing.
    context.runeOthers = (runeModifiers?.others ?? [])
      .map((rune) => `${rune.label} ${roman(rune.tier)}`).join(", ")
      || "None";
    context.runeProblems = runeModifiers?.problems ?? [];
    // THE CODEX RUNES' PRINTED USAGE LINES, reported beside the runes
    // rather than enforced against them. Live testing of 3.284.0
    // inscribed Wildform IV — "non-metal armour" — onto Full Platemail
    // and nothing anywhere said a word. See `runeUsageNotes`.
    //
    // `warn` rather than `met` reaching the template, because a
    // template asking "is met false?" has to distinguish false from
    // null and Handlebars cannot: `{{#if met}}` treats both the same,
    // and the unanswerable case would come out looking like a broken
    // one. The three-way answer is collapsed here, on purpose, once.
    context.runeUsage = runeUsageNotes(this.item)
      .map((note) => ({ ...note, warn: note.met === false }));
    // The runes you press a button on (Chapter 11, group 2). Rendered
    // from the registry rather than hand-written per rune, so a fifth
    // activated rune is a table entry and not a new panel.
    // The runes that wait for an event (group 3). Listed so a player
    // can see the item carries them — they fire on their own, except
    // Reflecting, which is a reaction and so gets a button alongside
    // the group 2 runes below.
    context.runeEvents = eventRunesFor(this.item).map((rune) => ({
      ...rune,
      remaining: eventUsesRemaining(this.item, rune),
      unlimited: eventUsesRemaining(this.item, rune) === Infinity,
      pressable: rune.key === "reflecting"
    }));
    context.runeActions = runeActionsFor(this.item).map((action) => ({
      ...action,
      active: action.state ? runeStateOf(this.item, action.state) : false,
      remaining: usesRemaining(this.item, action),
      unlimited: usesRemaining(this.item, action) === Infinity
    }));
    // The Spell Effect rune (group 4). Named on the sheet with what it
    // carries and how often, because "Spell Effect" alone tells a
    // player nothing about what their sword actually does — and
    // whether the spell is currently ON the wearer, which is the
    // question a player asks when the item is in their pack.
    context.runeSpells = spellEffectRunesOf(this.item).map((rune) => ({
      ...rune,
      frequencyLabel: frequencyFor(rune.frequency).label,
      granted: Boolean(this.item.actor?.items?.some(
        (candidate) => candidate.flags?.["trg-prime"]?.spellEffectRune?.itemId === this.item.id)),
      equipped: Boolean(this.item.system?.equipped)
    }));
  }
}
