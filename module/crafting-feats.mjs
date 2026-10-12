/**
 * The five General feats that change what, and how fast, you can craft.
 *
 *   SPECIALIST CRAFTER    pick a crafting specialty; you may create and
 *                         repair items of it. Repeatable, a new specialty
 *                         each time.
 *   ACCOMPLISHED ARTISAN  in your specialty you count as 2 levels higher
 *                         for crafting times.
 *   MASTERFUL CRAFTER     in your specialty the work you complete in the
 *                         timescale is doubled.
 *   SCRIBE SCROLL         you may Create magical scrolls.
 *   INVENTIVE CRAFTER     you may invent a formula you do not know, for
 *                         half the item's cost in raw materials.
 *
 * WHAT THIS BATCH MOSTLY DOES IS REPLACE AN HONOUR SYSTEM. The Create
 * workflow asked the player to tick "I have the specialty or feat this
 * item type requires" — a self-declaration, and the only gate there was.
 * Scribe Scroll is the feat that tick was standing in for where the
 * requirement names ONE feat, so there the tick becomes a real check.
 *
 * SPECIALIST CRAFTER IS NOT IMPLEMENTED HERE, AND THE FIRST VERSION OF
 * THIS FILE WAS. That is worth writing down. 3.361.0 gave the feat its own
 * thirteen-item specialty list, its own picker button, and its own flag on
 * each copy — for a feature the system already had in full: SKILL_SPECIALTIES
 * carries the same thirteen options, `specialtyCap` ALREADY counted
 * Specialist Crafter copies (its featNames list names it), the Skills tab
 * already had a picker, and the Create action
 * already refused a character with no specialty. Live on 22 Aug 2026, the
 * feat's own picker said "Fletching" while Create said "needs a Crafting
 * specialty — choose one on the character sheet first", and the Create
 * dialog then offered a specialty the character did not hold in the store
 * that decides anything. Two places deciding one question, both mine.
 *
 * The parallel store is gone. Taking the feat raises the cap, exactly as it
 * always did; the specialty is chosen in the Skill Specialties manager,
 * exactly as Artistic Specialist and Perform Specialist are.
 *
 * "TWO LEVELS HIGHER" IS A TRANSLATION, and worth saying so plainly.
 * Chapter 4 computes a day's work as SKILL RANKS × ITEM LEVEL × a success
 * modifier, and exactly one number in that is the crafter's own — their
 * ranks. So Accomplished Artisan's "you are considered to be 2 levels
 * higher for the purpose of determining your crafting times" is applied as
 * ranks + 2. The item's level is the item's, not yours, and the feat says
 * "you".
 */

const has = (featNames, name) => Array.from(featNames ?? [])
  .some((n) => String(n).trim().toLowerCase() === name);

/* ------------------------------------------------------------------ */
/* What a character may craft                                          */
/* ------------------------------------------------------------------ */

/**
 * May this character start this kind of project?
 *
 * ONE ANSWER FOR THE THREE THIS SYSTEM CAN CHECK — a mundane item needs a
 * specialty, a scroll needs Scribe Scroll, and everything alchemical or
 * magical still needs the feat its type names. What it deliberately does
 * NOT do is refuse anything it cannot judge: the Create workflow keeps its
 * self-declaration tick for those, because a gate that guesses is worse
 * than one that asks.
 *
 * A MUNDANE ITEM WITHOUT ANY SPECIALTY IS STILL ALLOWED. Chapter 4's
 * Create action is open to anyone trained in Crafting; Specialist Crafter
 * is what lets you make items OF THAT SPECIALTY, and the chapter does not
 * say a character with no specialty at all can make nothing. Refusing them
 * would be inventing a restriction to make a feat look useful.
 *
 * HERBS ARE THE ONE TYPE WHOSE FEAT IS A DC RATHER THAN A DOOR (3.577.1,
 * Graham's R5): with Alchemical Crafting, Crafting or Nature at the normal
 * DC; without it, Nature only, as a Very Hard check (DC +5). Crafting is
 * refused to a featless herbalist because the ruling gives them the herb,
 * not the skill — Chapter 4's table made herbs Nature, and the feat is
 * what adds Crafting to it. So the gate needs to know the skill.
 *
 * @param {object} state
 * @param {string} state.itemTypeKey   from ITEM_TYPES
 * @param {string} state.requiredFeat  that type's declared feat, if any
 * @param {string[]} state.featNames
 * @param {string} [state.skillKey]    the skill Create was invoked through
 * @returns {{allowed: boolean, reason: string, selfDeclared: boolean, note?: string, dcModifier?: number}}
 */
export function craftingFeatGate({ itemTypeKey = "", requiredFeat = "", featNames = [], skillKey = "" } = {}) {
  const type = String(itemTypeKey).trim().toLowerCase();

  if (type === "herbs") {
    const dc = featlessHerbDC({ itemTypeKey: type, featNames });
    if (!dc) return { allowed: true, reason: "", selfDeclared: false };
    if (String(skillKey).trim().toLowerCase() === "crafting") {
      return {
        allowed: false,
        reason: "Making herbs with Crafting needs the Alchemical Crafting feat — without it, use Nature (DC +5).",
        selfDeclared: false
      };
    }
    return {
      allowed: true,
      reason: "",
      selfDeclared: false,
      note: `Without Alchemical Crafting this is a Very Hard check (DC +${dc}).`,
      dcModifier: dc
    };
  }

  if (type === "scrolls") {
    return has(featNames, "scribe scroll")
      ? { allowed: true, reason: "", selfDeclared: false }
      : { allowed: false, reason: "Scribing a scroll needs the Scribe Scroll feat.", selfDeclared: false };
  }

  // ONE NAMED FEAT IS CHECKED, WHICHEVER TYPE NAMES IT (3.577.0). The five
  // alchemical types all name Alchemical Crafting, and page 178 says it
  // outright: "To craft alchemical items you must have the Alchemical
  // Crafting feat." Until the block-17 audit (D1) they kept the tick, so a
  // character with no such feat could brew an elixir by ticking a box —
  // the very honour system Scribe Scroll replaced, one row further down.
  const feat = singleNamedFeat(requiredFeat);
  if (feat) {
    return has(featNames, feat.toLowerCase())
      ? { allowed: true, reason: "", selfDeclared: false }
      : { allowed: false, reason: `This item type needs the ${feat} feat.`, selfDeclared: false };
  }

  // Everything else keeps the tick: the named requirement may be one of
  // several feats ("Brew Potion, Magical Crafting or Scribe Scroll"), and
  // reading a prose alternation as a gate is how a legitimate crafter gets
  // refused.
  return { allowed: true, reason: "", selfDeclared: Boolean(requiredFeat) };
}

/** How much a herb's DC rises without Alchemical Crafting: Very Hard. */
export const FEATLESS_HERB_DC = 5;

/**
 * The DC a Create check adds for a herb made without Alchemical Crafting
 * (Graham's R5) — 0 for any other type, and 0 once the feat is held.
 *
 * ONE FUNCTION FOR THE GATE AND THE CHECK. The setup dialog's note and the
 * DC the roll is made against must say the same number, and the day's
 * re-check asks again rather than remembering day one's answer: a
 * character who takes the feat mid-project stops paying the +5 from the
 * next day's work, as every other crafting feat starts applying.
 *
 * @param {object} state
 * @param {string} state.itemTypeKey
 * @param {string[]} state.featNames
 * @returns {number}
 */
export function featlessHerbDC({ itemTypeKey = "", featNames = [] } = {}) {
  if (String(itemTypeKey).trim().toLowerCase() !== "herbs") return 0;
  return has(featNames, "alchemical crafting") ? 0 : FEATLESS_HERB_DC;
}

/**
 * The item types a character may Create through this skill ON A FEAT
 * ALONE, with no specialty of that skill.
 *
 * FOUND LIVE IN 3.577.0 (F1 of its live-testing report). Crafting's
 * trained actions are gated on holding a Crafting specialty, and Create is
 * one — so a character with Alchemical Crafting and trained Crafting but
 * no specialty was told "needs a Crafting specialty" before the setup
 * dialog opened. Graham's R6 put alchemy under its feat and NOT a
 * specialty ("alchemy needs the appropriate feat"), and R5 says a feat
 * holder "may use either the Crafting or Nature skills". The specialty
 * gate is right for a blacksmith and wrong for an alchemist.
 *
 * So: the types whose one named feat the character holds. For Crafting
 * that is the five alchemical types; mundane items name no feat and stay
 * behind the specialty. An alternation ("Brew Potion or Magical
 * Crafting") is never read, for the reason `singleNamedFeat` gives.
 *
 * @param {Array<{key: string, feat?: string}>} types the skill's item types
 * @param {string[]} featNames
 * @returns {string[]} the type keys
 */
export function featGovernedCreateTypes(types = [], featNames = []) {
  return Array.from(types ?? [])
    .filter((t) => {
      const feat = singleNamedFeat(t?.feat);
      return Boolean(feat) && has(featNames, feat.toLowerCase());
    })
    .map((t) => t.key);
}

/**
 * The feat a requirement names, when it names exactly one — or "".
 * "Brew Potion or Magical Crafting" is an alternation, and a gate that
 * read it would refuse a legitimate crafter; "Alchemical Crafting" is not.
 *
 * @param {string} requiredFeat
 * @returns {string}
 */
function singleNamedFeat(requiredFeat) {
  const text = String(requiredFeat ?? "").trim();
  if (!text || /\bor\b|,|\//i.test(text)) return "";
  return text;
}

/**
 * What the setup dialog should do about one item type's requirement.
 *
 * THREE OUTCOMES, AND THE MIDDLE ONE IS THE EASY ONE TO LOSE: a type may be
 * refused outright (a scroll without Scribe Scroll), asked about (a prose
 * alternation this cannot read), or nobody's business at all (a mundane item
 * requires no feat, and asking anyway is how a tick becomes furniture nobody
 * reads before ticking).
 *
 * EXTRACTED SO IT CAN BE DRIVEN. It was three expressions inside a dialog
 * render callback, which is a place no harness can reach — the same shape as
 * the Warp Manipulation budget, and the same shape as every other defect
 * this project has been caught by. `craftingFeatGate` decides what is true;
 * this decides what the dialog does about it.
 *
 * THE KIT IS THE SECOND QUESTION (3.577.0, Graham's R4 of the block-17
 * audit). An item type whose kit the book names — alchemist's tools, a
 * herbalism kit, a scribe's kit — has that kit checked
 * (`createKitShortfall` in tools-requirement.mjs), so its "I have the
 * tools" tick is hidden, and a missing kit blocks Begin with the reason.
 *
 * @param {{allowed: boolean, reason: string, selfDeclared: boolean}} gate
 * @param {object} [kit]
 * @param {boolean} [kit.checked] this type's kit is checked, not ticked
 * @param {{reason: string}|null} [kit.shortfall] what is missing, if anything
 * @returns {{blocked: boolean, showTick: boolean, showToolsTick: boolean, notice: string}}
 */
export function createTypeGateView(gate, { checked = false, shortfall = null } = {}) {
  const allowed = gate?.allowed !== false;
  const kitMissing = Boolean(checked && shortfall);
  return {
    blocked: !allowed || kitMissing,
    showTick: Boolean(gate?.selfDeclared),
    showToolsTick: !checked,
    // AN ALLOWED TYPE MAY STILL HAVE SOMETHING TO SAY (3.577.1): a featless
    // herb is allowed at DC +5, and a player should read that before
    // pressing Begin rather than find it on the card afterwards.
    notice: [
      allowed ? String(gate?.note ?? "") : String(gate?.reason ?? ""),
      kitMissing ? String(shortfall?.reason ?? "") : ""
    ].filter(Boolean).join(" ")
  };
}

/* ------------------------------------------------------------------ */
/* Accomplished Artisan and Masterful Crafter                          */
/* ------------------------------------------------------------------ */

/** How many effective ranks Accomplished Artisan adds, in your specialty. */
export const ACCOMPLISHED_ARTISAN_RANKS = 2;
/** What Masterful Crafter multiplies a day's work by, in your specialty. */
export const MASTERFUL_CRAFTER_MULTIPLIER = 2;

/**
 * The ranks and multiplier a day of crafting actually uses.
 *
 * BOTH FEATS ARE SCOPED TO THE SPECIALTY, and neither says so twice: the
 * caller decides whether this project is in one, and this decides what
 * that is worth. A project outside every specialty gets the plain numbers,
 * which is the case that would otherwise be easy to miss.
 *
 * @param {object} state
 * @param {string[]} state.featNames
 * @param {number} state.ranks
 * @param {boolean} state.inSpecialty
 * @returns {{ranks: number, multiplier: number, artisan: boolean, masterful: boolean}}
 */
export function craftingWorkModifiers({ featNames = [], ranks = 0, inSpecialty = false } = {}) {
  const base = Math.max(0, Math.trunc(Number(ranks) || 0));
  const artisan = inSpecialty && has(featNames, "accomplished artisan");
  const masterful = inSpecialty && has(featNames, "masterful crafter");
  return {
    ranks: base + (artisan ? ACCOMPLISHED_ARTISAN_RANKS : 0),
    multiplier: masterful ? MASTERFUL_CRAFTER_MULTIPLIER : 1,
    artisan,
    masterful
  };
}

/* ------------------------------------------------------------------ */
/* Inventive Crafter                                                   */
/* ------------------------------------------------------------------ */

/**
 * "You may attempt to invent a formula for an item you do not yet know…
 * You don't need the formula for the item. You must supply raw materials
 * equal to HALF the cost of the item you are creating, not the cost of the
 * formula."
 *
 * THE OPTION WAS ALREADY OFFERED TO EVERYBODY. The Create workflow has had
 * an "Inventing a new formula (DC +5)" tick since before this feat was
 * read, with no gate on it at all — so the feat that grants the whole
 * activity granted nothing, and anyone could do it. This is the gate.
 *
 * "BE AWARE THAT YOU MUST STILL HAVE THE REQUIRED FEAT for specialist
 * items such as alchemical and magical items" — so inventing does not
 * bypass the type's own requirement, and this says nothing about it.
 */
export function inventiveCrafterAllowed(featNames = []) {
  return has(featNames, "inventive crafter");
}

/** The raw materials an invented formula costs: half the item's value. */
export function inventedFormulaMaterials(itemValue) {
  const value = Math.max(0, Number(itemValue) || 0);
  return Math.floor(value / 2);
}
