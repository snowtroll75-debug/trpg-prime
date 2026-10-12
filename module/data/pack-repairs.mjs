/**
 * What each pack fix CHANGED, recorded as old → new.
 *
 * NEW at 3.431.0. Pure data; no Foundry.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO KEEP DEAD.
 *
 * Found on 28 August 2026, by opening a spell instead of casting it.
 *
 * Borin Slatevein's Protective Ward was about to be driven live. His
 * copy read `area: "10-foot-radius centred on you"`, `sustained: false`,
 * `sustainGrowth: {0, 0}` and the `+5 (max +25)` warp — the data as it
 * was BEFORE 3.430.0 fixed it. Casting it would have shown a ward that
 * did not follow, could not be sustained and sold a warp five times its
 * printed strength, and the obvious conclusion would have been that the
 * release was broken.
 *
 * A SPELL ON A CHARACTER IS A COPY. Editing the compendium does not
 * reach anybody who already owns the spell, and this project has been
 * editing the compendium for weeks. A sweep of Graham's world found one
 * stale copy per pack fix shipped that week:
 *
 *   - Borin's Protective Ward     — area, sustained, sustainType, warps
 *   - Grokash's Song Of Despair   — effects: no recovery floor at all
 *   - Merrick's Bless             — warps: still sells freezeMembership
 *                                   for 2 PP and buys nothing
 *
 * So three defects recorded as FIXED were, on the characters who
 * actually own those spells, still live. The fix was real and
 * unreachable from where it was needed — the same shape as every other
 * expensive defect here, one layer further out.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY OLD → NEW, AND NOT "MAKE IT MATCH THE PACK".
 *
 * Overwriting every owned copy from the compendium would repair these
 * three and silently destroy any spell a GM had house-ruled. Graham's
 * ruling, 28 August 2026: a declared repair, old-value matched.
 *
 * A field is touched ONLY where the owned value still deep-equals the
 * value this table records as the pre-fix one. A house-ruled copy
 * matches neither `from` nor `to` and is left completely alone; an
 * already-repaired copy matches `to` and is skipped, which is what makes
 * the pass idempotent by construction rather than by argument.
 *
 * THE ASYMMETRY THAT DECIDES THE DESIGN. A migration runs once,
 * unattended, against irreplaceable data — and one of this project's own
 * blanked every player sheet in this world on 26 August 2026, two days
 * before this file was written. Graham re-levelled six characters by
 * hand rather than restore a backup. Everything here can be re-cast or
 * re-rolled; that could not. See claude/incident-2026-08-26.
 *
 * ─────────────────────────────────────────────────────────────────────
 * ADDING AN ENTRY — AND THIS IS THE STEP THAT GETS FORGOTTEN.
 *
 * WHENEVER ANY TOOL EDITS A PACK FIELD THE ENGINE READS, the same change
 * belongs here with its old value. That means `tools/declare-*.mjs` AND
 * `tools/author-*.mjs` AND anything else that writes to a pack — the
 * original wording named only `declare-*`, and between 3.596.0 and 3.600.0
 * five releases of `author-*` tools built eight spells without a single
 * entry. Every one of them reached the compendium and stopped there.
 *
 * THE RELEASE IS NOT DONE UNTIL THIS FILE HAS THE ENTRY. A spell on a
 * character is a copy; the compendium is not where the game is played.
 *
 * GETTING THE `from` SIDE RIGHT: read it out of the PREVIOUS RELEASE'S ZIP
 * rather than from memory. The shipped zips are this project's archive, and
 * an old-value match typed from recollection silently repairs nothing —
 * which looks exactly like success.
 *
 * `verify-pack-repairs` holds the `to` side against the live pack (E5), the
 * `from` side against it too (E7), and the migration's own gate against the
 * newest entry here (F1b) — that last one is what caught the gate sitting
 * at 3.435.0 while ten new entries were added above it.
 */

/**
 * @typedef {object} PackRepair
 * @property {string} id       stable identifier, for the report and the log
 * @property {string} pack     the compendium the item comes from
 * @property {string} name     the item's name, matched case-insensitively
 * @property {string} field    a `system` field name
 * @property {*}      from     the pre-fix value; only this is repaired
 * @property {*}      to       the value the pack carries now
 * @property {string} since    the release that changed it
 * @property {string} reason   why it matters that an owned copy is stale
 */

/** @type {PackRepair[]} */
export const PACK_REPAIRS = Object.freeze([
  /* ---------------------------------------------------------------- *
   * PROTECTIVE WARD (3.430.0) — four faults in one entry, each of
   * which disabled a different part of the spell.
   * ---------------------------------------------------------------- */
  {
    id: "protective-ward-area", pack: "spells", name: "Protective Ward",
    field: "area", since: "3.430.0",
    from: "10-foot-radius centred on you",
    // HYPHENATED AT 3.441.0, following Core 3.7, which prints
    // "10-foot-emanation" exactly. Behaviourally identical — the gate
    // asks /emanation/i and does not care about the hyphen — but this
    // manifest repairs OWNED copies, and E5 is here to stop it writing a
    // value the pack no longer ships. A migration that repairs to a
    // string that exists nowhere is writing history rather than truth.
    to: "10-foot-emanation",
    reason: "`emanationIsLive` asks /emanation/i of this string. Without the word the "
      + "circle is placed identically and never follows its caster."
  },
  {
    id: "protective-ward-sustained", pack: "spells", name: "Protective Ward",
    field: "sustained", since: "3.430.0", from: false, to: true,
    reason: "One flag closes three doors: no Magic-tab row, nothing for Sustain a Spell "
      + "to target, and no emanation record — that record hangs off the active-spell entry."
  },
  {
    id: "protective-ward-sustain-type", pack: "spells", name: "Protective Ward",
    field: "sustainType", since: "3.430.0", from: "", to: "round",
    reason: "\"round\" is the shape whose Sustain buys something other than time. "
      + "\"duration\" would lapse a ward whose printed duration is a flat minute."
  },
  {
    id: "protective-ward-growth", pack: "spells", name: "Protective Ward",
    field: "sustainGrowth", since: "3.430.0",
    from: { stepFeet: 0, maxFeet: 0 },
    to: { stepFeet: 5, maxFeet: 30 },
    reason: "The growth was prose in a note. Without these numbers a Sustain widens nothing."
  },
  {
    id: "protective-ward-warp", pack: "spells", name: "Protective Ward",
    field: "warps", since: "3.430.0",
    from: [{ ppCost: 2, text: "status bonus increases by 5 (max +25)", mods: { bonusValue: 5, bonusMax: 25 } }],
    to: [{ ppCost: 2, text: "status bonus increases by 1 (max +5)", mods: { bonusValue: 1, bonusMax: 5 } }],
    reason: "THE ONE THAT WAS LIVE. `aggregateWarpSelection` reads bonusValue and bonusMax, "
      + "so eight Power Points bought a +25 status bonus to DB — the strongest defensive "
      + "effect in the game, behind a typo."
  },

  /* ---------------------------------------------------------------- *
   * BLESS AND BANE (3.426.2) — the warp that charged 2 PP for a
   * behaviour everybody already had for free.
   * ---------------------------------------------------------------- */
  {
    id: "bless-freeze-warp", pack: "spells", name: "Bless",
    field: "warps", since: "3.426.2",
    from: [
      { ppCost: 2, text: "you increase the bonus by +1 (max +4)", mods: { bonusValue: 1, bonusMax: 4 } },
      { ppCost: 2, text: "the spell affects all targets in range at the beginning of the spell after which the targets may move out of the area", mods: {} }
    ],
    to: [
      { ppCost: 2, text: "you increase the bonus by +1 (max +4)", mods: { bonusValue: 1, bonusMax: 4 } },
      { ppCost: 2, text: "the spell affects all targets in range at the beginning of the spell after which the targets may move out of the area", mods: { freezeMembership: true } }
    ],
    reason: "`mods: {}` is inert by construction: the option is offered, the PP is charged, "
      + "the card says Warped, and membership is not frozen."
  },
  {
    id: "bane-freeze-warp", pack: "spells", name: "Bane",
    field: "warps", since: "3.426.2",
    from: [
      { ppCost: 2, text: "you increase the penalty by -1 (max -4)", mods: { bonusValue: 1, bonusMax: 4 } },
      { ppCost: 2, text: "as target that fails their save is still affected for the duration if they leave the area of effect", mods: {} }
    ],
    to: [
      { ppCost: 2, text: "you increase the penalty by -1 (max -4)", mods: { bonusValue: 1, bonusMax: 4 } },
      { ppCost: 2, text: "as target that fails their save is still affected for the duration if they leave the area of effect", mods: { freezeMembership: true } }
    ],
    reason: "The same inert warp, sold in Bane's own words."
  },
  {
    id: "bane-area-targeting", pack: "spells", name: "Bane",
    field: "areaTargeting", since: "3.428.1", from: "all", to: "enemies",
    reason: "Bane's first line reads \"Adversaries in the area\". Reading `all` meant it "
      + "baned its own caster."
  },
  {
    id: "bane-degree-gated-effects", pack: "spells", name: "Bane",
    field: "effects", since: "3.428.0",
    from: [{ kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: -1 }],
    to: [
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: -1, onSave: ["failure"] },
      { kind: "bonus", target: "targets", slot: "attack", bonusType: "status", value: -2, onSave: ["fumble"] }
    ],
    reason: "Bane prints -1 on a Failure and -2 on a Fumble. One ungated row gave a "
      + "fumbling creature the failure's penalty."
  },

  /* ---------------------------------------------------------------- *
   * LUMINANCE (3.435.0) — an empty entry for a spell whose text
   * describes an emanation, a per-turn heal and a sustain that grows it.
   * ---------------------------------------------------------------- */
  {
    id: "luminance-area", pack: "spells", name: "Luminance",
    field: "area", since: "3.435.0",
    from: "",
    to: "10-foot emanation",
    reason: "The pack read \"\" \u2014 no area at all \u2014 while the spell's first sentence is \"A bright light emanates from you in a 10-foot radius\". `emanationIsLive` asks /emanation/i of this string, so with it empty nothing followed the caster, no Region was placed, and no membership was ever computed. The whole spell"
  },
  {
    id: "luminance-sustained", pack: "spells", name: "Luminance",
    field: "sustained", since: "3.435.0",
    from: false,
    to: true,
    reason: "The pack read `false`, so no active-spell entry was registered: no Magic-tab row, nothing for Sustain a Spell to target, and no emanation record \u2014 the record hangs off that entry. The spell says \"At the beginning of each of your turns, you can Sustain the spell\"."
  },
  {
    id: "luminance-sustain-type", pack: "spells", name: "Luminance",
    field: "sustainType", since: "3.435.0",
    from: "",
    to: "round",
    reason: "NOT \"duration\". Its printed duration is \"1 minute (D)\" \u2014 a flat clock \u2014 so `sustainedLapses` would have killed it two rounds after the last Sustain. \"round\" is the shape Lightning Storm and Spiritual Weapon already carry: the duration is the spell's own, and a Sustain buys the thing the text names. "
  },
  {
    id: "luminance-effects", pack: "spells", name: "Luminance",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind": "perTurn", "target": "targets", "formula": "1d8", "mode": "heal", "undeadMode": "damage", "undeadDamageType": "essence"}, {"kind": "light", "source": "luminance", "target": "self"}],
    alsoFrom: [[{"kind": "perTurn", "target": "targets", "formula": "1d8", "mode": "heal", "undeadMode": "damage", "undeadDamageType": "essence"}, {"kind": "note", "text": "Light within the radius is increased by three steps."}]],
    reason: "At 3.611.0 the three light steps became a light source rather than a note, and a copy carrying the 3.435.0 rows is recognised through `alsoFrom`. The effects array was EMPTY, so the spell healed nobody. `perTurn` is a fifth effect kind: not a bonus, a save, a floor or a growing circle, but an event on a clock \u2014 \"all creatures that BEGIN THEIR TURN in the radius\". Declared rather than parsed from the sentence, and the undead inversion is decla"
  },
  {
    id: "luminance-sustain-choices", pack: "spells", name: "Luminance",
    field: "sustainChoices", since: "3.435.0",
    from: null,
    to: [{"key": "healing", "field": "healingDice", "step": 1, "max": 5}, {"key": "bleed", "field": "bleedRemoved", "step": 1, "max": null}],
    reason: "Graham's ruling, 29 August 2026: the Sustain ASKS each time. Declared on the entry so the picker is built from the spell rather than from a list in the workflow, and so the warp that lifts the cap has one place to lift it."
  },

  /* ---------------------------------------------------------------- *
   * CUTTING WORDS (3.434.0) — the enemies-only rule, moved off the
   * spell's NAME and onto the spell itself.
   * ---------------------------------------------------------------- */
  {
    id: "cutting-words-enemies-only", pack: "spells", name: "Cutting Words",
    field: "areaTargeting", since: "3.434.0", from: "all", to: "enemies",
    reason: "Graham's ruling of 28 August 2026 shipped as a match on the spell's NAME, which "
      + "3.432.0 recorded at the time as the weak part of that fix. The gate reads this "
      + "declaration now, so an owned copy still saying \"all\" is a Bard who can cut at their "
      + "own party."
  },


  /* ================================================================== *
   * THE GRIMOIRE AUTHORING OF 26-28 SEPTEMBER 2026 (3.596.0 - 3.600.0).
   *
   * Ten entries at once, and that number is the point: this file had not
   * gained a single entry across five releases of pack authoring, so every
   * spell those releases built reached the compendium and stopped there.
   * Found on 28 September by driving Scorching Ray and watching it open no
   * AP chooser — the caster's copy still had `apOptions: []` while the pack
   * had three modes. Exactly the defect this file was written for at
   * 3.431.0, recurring because nothing REQUIRED an entry.
   *
   * `verify-pack-repairs` now refuses an authored spell with no entry here,
   * so the gap cannot reopen quietly. The `from` values were recovered from
   * the shipped 3.595.3 zip rather than typed from memory: the releases are
   * the archive, and an old-value match typed by hand would silently repair
   * nothing.
   * ================================================================== */

  {
    id: "restore-senses-effects", pack: "spells", name: "Restore Senses",
    field: "effects", since: "3.596.0",
    from: [],
    to: [{"kind":"counteract","target":"targets","conditions":["blinded","deafened"],"label":"Restore Senses"},{"kind":"note","text":"The counteract check addresses TEMPORARY OR PERMANENT effects alike, and its DC is the DC of whatever inflicted the condition — which this system does not record, so the check asks for it."},{"kind":"note","text":"IT CANNOT HEAL A PHYSICAL INJURY OR NATURAL LOSS: a creature blinded by losing its eyes is not restored by this. The +4 PP option regenerates one damaged or destroyed eye or ear and changes the casting time to 10 minutes — judged at the table."}],
    reason: "A PP 4 spell whose whole content is a counteract check carried no rows at all, so an owned copy does nothing when cast — and its extra-target warp points at a spell that applies nothing to the extra target."
  },
  {
    id: "scrying-effects", pack: "spells", name: "Scrying",
    field: "effects", since: "3.596.0",
    from: [],
    to: [{"kind":"tempImmunity","target":"targets","onSave":["critical"],"length":"1 week","label":"Scrying"},{"kind":"tempImmunity","target":"targets","onSave":["success"],"length":"1 day","label":"Scrying"},{"kind":"note","onSave":["critical"],"text":"The spell fails, and the target gains a glimpse of YOU and learns its rough distance and direction from you."},{"kind":"note","onSave":["success"],"text":"The spell fails."},{"kind":"note","onSave":["failure"],"text":"The spell succeeds: place the sensor within 30 feet of the target. 1 AP (Concentrate) to perceive through it; it does not move, but you may rotate its viewpoint as part of that action, and you may Search (Perception) through it."},{"kind":"note","onSave":["fumble"],"text":"The spell succeeds AND THE EYE FOLLOWS the target if it moves, travelling up to 60 feet."},{"kind":"note","text":"STUDY TARGET MAKES IT WORSE BY ONE DEGREE: a target you have stored with the Study Target action treats its saving throw as one degree worse. Nothing in this system shifts a save degree — the mechanism does not exist for any spell — so this is applied at the table."},{"kind":"note","text":"The sensor is invisible, intangible and cannot be interacted with or detected by normal means; spells and effects that reveal invisible or hidden objects find it."}],
    reason: "Both better degrees buy temporary immunity and all four are printed on the card. An owned copy still says `[]`, so the saving throw decides nothing at all."
  },
  {
    id: "shadow-weapon-effects", pack: "spells", name: "Shadow Weapon",
    field: "effects", since: "3.596.0",
    from: [],
    to: [{"kind":"conjuredWeapon","label":"Shadow Weapon","target":"self","categories":["Simple","Martial"],"hands":1,"melee":true,"damageType":"force"},{"kind":"note","text":"The weapon is MAGICAL and IGNORES THE CONCEALED CONDITION when striking. The magical half is on the weapon; the concealment half is applied by skipping the defender's avoidance flat check, because nothing in this system can waive that check for one weapon."},{"kind":"note","text":"+4 PP: the weapon gains a +1 magical bonus to attacks and treats all armour DR as half (round up). Both by hand: the conjured-weapon rail copies a pack weapon and has no channel for a bonus or for halving DR."}],
    reason: "The `conjuredWeapon` rail was built for Eldritch Weapon at 3.543.0 and the one other weapon-conjuring spell in the Grimoire never used it. An owned copy conjures nothing."
  },
  {
    id: "scintillating-pattern-effects", pack: "spells", name: "Scintillating Pattern",
    field: "effects", since: "3.596.0",
    from: [{"kind":"condition","target":"targets","condition":"dazzled"}],
    to: [{"kind":"condition","target":"targets","condition":"dazzled","label":"Scintillating Pattern"},{"kind":"condition","target":"targets","condition":"confused","onSave":["failure"],"durationRoll":"1d4 rounds","label":"Scintillating Pattern"},{"kind":"condition","target":"targets","condition":"stunned","onSave":["fumble"],"durationRoll":"1d4 rounds","label":"Scintillating Pattern"},{"kind":"condition","target":"targets","condition":"confused","onSave":["fumble"],"label":"Scintillating Pattern"},{"kind":"note","onSave":["critical","success"],"text":"Unaffected by the pattern's confusion — still dazzled while inside it."},{"kind":"note","text":"ON A FUMBLE THE CONFUSION FOLLOWS THE STUN: both are applied now, the stun for its 1d4 rounds and the confusion for the spell's remaining duration. Nothing in this system starts one condition when another ends, so the overlap is the table's to trim."},{"kind":"note","text":"THE DAZZLE REACHES 20 FEET BEYOND THE PATTERN as well as inside it. Only the pattern's own 20-foot radius is placed — a spell has one area — so dazzle the ring by hand."},{"kind":"note","text":"A creature attempts the save if it is inside when you cast it, enters, ends its turn inside, or uses Search or Interact on the pattern; a creature already affected does not save again. The re-save triggers are the table's: this system rolls the save for everyone the area catches at the cast."}],
    reason: "The saving throw itself was missing: an owned copy applies the dazzle and neither the failure's 1d4-round confusion nor the fumble's stun."
  },
  {
    id: "see-invisible-effects", pack: "spells", name: "See Invisible",
    field: "effects", since: "3.597.0",
    from: [],
    to: [{"kind":"avoidanceSight","target":"self","sight":"seeInvisible","level":"concealed","label":"See Invisible"},{"kind":"note","text":"ETHEREAL BEINGS GET THE SAME TREATMENT: the page gives them the concealed condition to you exactly as it does invisible creatures, so a creature the GM has marked invisible is covered whichever reason it is unseen for. This system does not model the ethereal plane as a separate place, so an ethereal creature that is NOT marked invisible is the table's to mark."},{"kind":"note","text":"IT DOES NOT FIND ANYBODY. The spell lifts the veil on creatures you are already aiming at — it is read when an attack resolves, not when you look for someone. Searching an invisible creature out is still the Search (Perception) action against its Stealth DC, which is what makes it hidden to you in the first place."}],
    reason: "The spell had no rows at all, so an owned copy lifts no veil — and 3.597.0 made the `invisible` condition mean something for the first time, which is what it now counters."
  },
  {
    id: "see-invisible-warps", pack: "spells", name: "See Invisible",
    field: "warps", since: "3.597.0",
    from: [{"ppCost":2,"text":"the spell has a duration of 8 hours","mods":{"durationText":"8 hours"}},{"ppCost":4,"text":"invisible creatures can be seen clearly and are not concealed","mods":{}}],
    to: [{"ppCost":2,"text":"the spell has a duration of 8 hours","mods":{"durationText":"8 hours"}},{"ppCost":4,"text":"invisible creatures can be seen clearly and are not concealed","mods":{"sightLevel":"clear"}}],
    reason: "The +4 PP option carried `mods: {}` — offered, charged for, and buying nothing. `verify-emanation` E2b exists for exactly this shape."
  },
  {
    id: "sanctuary-effects", pack: "spells", name: "Sanctuary",
    field: "effects", since: "3.598.0",
    from: [],
    to: [{"kind":"sanctuary","target":"targets","label":"Sanctuary"},{"kind":"note","text":"THE SAVE IS THE OPPONENT'S, NOT THE PROTECTED CREATURE'S. Nobody rolls anything when this is cast; each opponent rolls Will the first time it tries to attack the warded creature, against this spell's DC. A creature that passes never rolls again."},{"kind":"note","text":"THE PAGE NAMES THREE RUNGS AND THIS SYSTEM ROLLS SEVEN DEGREES, so the rest are read with the rule that already exists: a Heroic save lets the attack through, a Partial blocks it for the turn (a non-success is clamped to the harsher side rather than rewarded), and a Blunder blocks for the whole duration as a worse Fumble."},{"kind":"note","text":"OUT OF COMBAT EACH ATTEMPT SAVES AFRESH. \"This turn\" needs a round to mean anything; with no combat running a failed save would otherwise lock the attacker out for ever. The Fumble lockout is unaffected — it is measured by the spell's duration, not by turns."},{"kind":"note","text":"A HOSTILE ACTION BY THE PROTECTED CREATURE ENDS THE SPELL: a Strike, Double Slice, any action with the attack trait, and a spell aimed at an enemy. Moving, drinking a potion and healing an ally do not."}],
    reason: "The whole page is one mechanism and the entry carried `effects: []`, so an owned copy wards nobody: no opponent ever rolls the Will save the spell is made of."
  },
  {
    id: "shadow-tether-effects", pack: "spells", name: "Shadow Tether",
    field: "effects", since: "3.599.0",
    from: [{"kind":"condition","target":"targets","condition":"immobilised"},{"kind":"note","text":"The immobilisation only triggers if the target moves more than 30 ft from you; 2d8 essence damage is dealt regardless (Basic Reflex)."}],
    to: [{"kind":"distanceTrigger","target":"targets","condition":"immobilised","feet":30,"from":"caster","label":"Shadow Tether"},{"kind":"note","text":"THE DAMAGE IS DEALT REGARDLESS (Basic Reflex); only the immobilisation waits for the tether. A failed save arms it, and it snaps taut the moment the target is more than 30 feet from you — measured when the TARGET moves, because \"if they move\" is the printed subject: a caster cannot immobilise somebody by retreating."},{"kind":"note","text":"IF THE TARGET IS ALREADY BEYOND 30 FEET WHEN THE SAVE FAILS, the tether is taut as it lands and the condition applies at once — the spell reaches 60 feet, so this is a common case rather than a corner. \"More than 30 feet\" is read as the DISTANCE from you, not as 30 feet of displacement; at exactly 30 feet the tether is slack."},{"kind":"note","text":"IT FIRES ONCE. \"Becomes immobilised for the duration\" — so the tether is spent when it triggers and the condition then lasts as long as the spell. If the caster's token leaves the scene the tether has nothing to measure from and is removed, with a line on the card saying so."}],
    reason: "The one place this project has found a rule INVENTED rather than missing. A bare condition row pins the target where it stands on a failed save; the page says it is immobilised only if it moves more than 30 feet away."
  },
  {
    id: "scorching-ray-effects", pack: "spells", name: "Scorching Ray",
    field: "effects", since: "3.600.0",
    from: [],
    to: [{"kind":"note","text":"ONE RAY PER ACTION, EACH AT A DIFFERENT TARGET — mark every creature you mean to hit before casting, then pick the AP mode. Two tokens of one creature count as one target, so a three-ray volley needs three different creatures; if fewer are marked, only that many rays fly and only that many attacks are counted."},{"kind":"note","text":"ONE CAST A SPELL CHECK, COMPARED AGAINST EACH TARGET SEPARATELY. In this system the Cast a Spell check IS the attack roll, so a volley rolls once and measures that total against each creature's Defence Bonus — one ray can hit while another misses. Because the multiple attack penalty does not move until every ray has resolved, three separate rolls would share one penalty anyway; the only thing they would add is three chances at the dice, which the page does not offer."},{"kind":"note","text":"THE PENALTY CLIMBS AFTERWARDS, BY THE NUMBER OF RAYS. A three-ray volley leaves you three attacks further up the ladder for anything else you do this turn — the half of this rule that used to be charged before the rays flew rather than after."}],
    reason: "The rows that tell the table to mark its targets before casting, and which reading of the rays and the deferred penalty is being applied."
  },
  {
    id: "scorching-ray-apOptions", pack: "spells", name: "Scorching Ray",
    field: "apOptions", since: "3.600.0",
    from: [],
    to: [{"ap":1,"label":"1 AP — 1 ray (2d6 fire)","rays":1,"range":"30 feet","area":""},{"ap":2,"label":"2 AP — 2 rays at 2 different targets","rays":2,"range":"30 feet","area":""},{"ap":3,"label":"3 AP — 3 rays at 3 different targets","rays":3,"range":"30 feet","area":""}],
    reason: "Without the modes the extra actions buy nothing: an owned copy fires ONE ray and, before 3.600.0, charged three actions' worth of multiple attack penalty for it."
  },

  /* ---------------------------------------------------------------- *
   * SHAPE STONE (3.605.0) — the last spell of block 31, and a check
   * its bystanders were never asked to make.
   * ---------------------------------------------------------------- */
  {
    id: "shape-stone-effects", pack: "spells", name: "Shape Stone",
    field: "effects", since: "3.605.0",
    from: [],
    to: [{"kind": "skillLadder", "label": "Shape Stone", "skills": ["acrobatics"], "degrees": {"success": {"text": "is unaffected"}, "failure": {"text": "falls <strong>prone</strong> atop the stone", "conditions": [{"key": "prone"}]}, "fumble": {"text": "falls off the stone (if there is anywhere to fall) and lands <strong>prone</strong>", "conditions": [{"key": "prone"}]}}}, {"kind": "note", "text": "THE GM SAYS WHO WAS STANDING ON IT. The spell is Range touch targeting a cube of stone up to 10 feet across \u2014 there is no template and no area, and a token's square cannot tell standing ON the stone from standing BESIDE it. So the picker lists the tokens nearest the caster, nearest first, with nobody ticked, and the GM names whoever is up there. Every token is offered rather than only those within some invented radius: a GM can ignore a name but cannot tick one that was never on the list."}, {"kind": "note", "text": "THREE RUNGS OF SEVEN ARE PRINTED, and the rest are read the way every gated spell in the Grimoire is read. Heroic and Critical are better than the Success rung, and Success is \"unaffected\" \u2014 so nothing happens, by the ordinary route rather than a special case. A Partial falls to Failure and a Blunder to Fumble, because letting the worst roll in the game fall off the bottom of a ladder would make it safer than the second worst. The card names both the degree rolled and the rung it was read at."}, {"kind": "note", "text": "\"IF APPLICABLE\" IS THE TABLE'S. The spell cannot know whether there is anywhere to fall off to \u2014 a boulder in a field and a floor being reshaped are the same ten-foot cube to this system \u2014 so a Fumble applies prone and says the rest out loud for the GM to settle."}],
    reason: "A PP 8 spell whose printed Acrobatics check \u2014 Success unaffected, Failure prone "
      + "atop the stone, Fumble off it and prone \u2014 was not asked for at all. An owned copy "
      + "reshapes the stone and knocks nobody over."
  },
  /* ---------------------------------------------------------------- *
   * THE INSCRIBED RUNES (3.604.0) — both rituals did nothing, and
   * both had an Area no template parser could read.
   * ---------------------------------------------------------------- */
  {
    id: "rune-of-warding-area", pack: "spells", name: "Rune Of Warding",
    field: "area", since: "3.604.0",
    from: "10-radius",
    to: "10-foot radius",
    reason: "THE UNIT WAS MISSING AND NOTHING HAD NEEDED IT. `parseSpellArea` requires a unit "
      + "word, so \"10-radius\" returned null, no Region could be drawn, and the ward "
      + "built at 3.604.0 would have run against a rune that cannot exist. Every other "
      + "radius spell in the pack carries the unit; these two were transcribed without it."
  },
  {
    id: "rune-of-warding-effects", pack: "spells", name: "Rune Of Warding",
    field: "effects", since: "3.604.0",
    from: [],
    to: [{"kind": "runeWard", "label": "Rune of Warding"}, {"kind": "note", "text": "DESIGNATION IS FIXED AS THE RUNE IS INSCRIBED. The picker lists every creature standing inside the radius as the ten-minute ritual finishes, and nobody starts ticked: \"all creatures you designate\" names no default set, so a Continue nobody read wards nobody rather than silently warding an enemy who happened to be standing there. A creature outside the radius at that moment cannot be designated at all."}, {"kind": "note", "text": "THE BONUS COMES AND GOES WITH THE RADIUS, not with the designation. A designated ally who walks out loses the +1 and regains it on stepping back in \u2014 measured as they cross the edge, so an ally who ducks behind the rune is warded for the attack that follows rather than from their next turn."}, {"kind": "note", "text": "\"+1-STATUS TO DB AND SAVING THROWS\" IS FOUR BONUSES on this system's sheet: Defence, Fortitude, Reflex and Will. All four are status bonuses, so they do not stack with another status bonus to the same number."}, {"kind": "note", "text": "JUDGED AT THE TABLE: whether the inscribed surface survives eight hours, and whether a creature examining the rune recognises what it is."}],
    reason: "A PP 4 ten-minute ritual that did nothing at all: no ward, no designation, no bonus. "
      + "An owned copy would keep doing nothing."
  },
  {
    id: "rune-of-warning-area", pack: "spells", name: "Rune Of Warning",
    field: "area", since: "3.604.0",
    from: "30-radius centred on the object",
    to: "30-foot radius centred on the object",
    reason: "The same missing unit as the ward's, and the same consequence."
  },
  {
    id: "rune-of-warning-effects", pack: "spells", name: "Rune Of Warning",
    field: "effects", since: "3.604.0",
    from: [],
    to: [{"kind": "runeWarning", "label": "Rune of Warning"}, {"kind": "note", "text": "THE TRAIT IS TYPED IN AS THE RUNE IS INSCRIBED \u2014 the page's examples are elf and orc, and this system's trait vocabulary is not a closed list of ancestries, so a fixed menu would refuse a rune set for something invented at the table. Matched as a whole word and case-insensitively: a rune set for \"elf\" does not answer a Half-Elf."}, {"kind": "note", "text": "THE GLOW IS TOLD TO THE GM AND NOBODY ELSE. The rune fires whether or not a character is standing there to see it, so the GM is told which creature crossed the boundary and decides who noticed. A public card would hand the players knowledge their characters may not have."}, {"kind": "note", "text": "IT FIRES ON ENTERING, not on being inside. A creature of the named trait who stands still inside the radius does not set the rune off again every time anything else moves; one who walks out and back in sets it off twice."}],
    reason: "A PP 2 ritual whose whole rule — the rune glows when a named race enters — was "
      + "unbuilt. An owned copy inscribed nothing that could ever fire."
  },
  /* ---------------------------------------------------------------- *
   * THE DAMAGE TYPE THE CASTER PICKS (3.603.0) — three spells whose
   * page offers a choice and whose items each froze it at one answer.
   * ---------------------------------------------------------------- */
  {
    id: "shadow-blast-effects", pack: "spells", name: "Shadow Blast",
    field: "effects", since: "3.603.0",
    from: [{"kind": "note", "text": "Choose the damage type (acid/bludgeoning/cold/electricity/fire/force/piercing/slashing/sonic) and the shape (30-ft cone / 15-ft burst within 120 ft / 50-ft line). 5d8, Basic Reflex."}],
    to: [{"kind": "damageTypeChoice", "damageTypes": ["acid", "bludgeoning", "cold", "electricity", "fire", "force", "piercing", "slashing", "sonic"], "label": "Shadow Blast"}, {"kind": "note", "text": "THE TYPE IS CHOSEN AT CAST, AND IT CHANGES THE SPELL. Damage Reduction treats the nine differently: bludgeoning, piercing and slashing are reduced in full, the five energy types by half, and force not at all. The card names which rule the chosen type brought with it."}, {"kind": "note", "text": "THE SHAPE IS CHOSEN AT CAST TOO, from the three the page prints \u2014 a 30-foot cone, a 15-foot burst within 120 feet, or a 50-foot line. All three cost the same 2 AP; the chooser exists to set the template, not to price it."}, {"kind": "note", "text": "AUTHORED AS FORCE UNTIL 3.603.0, which was the one answer on its own list that ignores Damage Reduction entirely. Anyone comparing old play to new should expect this spell to do LESS against armoured targets now."}],
    reason: "A PP 10 spell whose page offers nine damage types and three shapes, carried as one "
      + "note. The authored type was FORCE — the only answer on its own list that Damage "
      + "Reduction does not touch — so an owned copy has been dealing 5d8 straight through "
      + "every suit of armour in the world, whatever the caster said they chose."
  },
  {
    id: "shadow-blast-apOptions", pack: "spells", name: "Shadow Blast",
    field: "apOptions", since: "3.603.0",
    from: [],
    to: [{"ap": 2, "label": "30-foot cone", "range": "", "area": "30-foot cone"}, {"ap": 2, "label": "15-foot burst within 120 feet", "range": "120 feet", "area": "15-foot burst"}, {"ap": 2, "label": "50-foot line", "range": "", "area": "50-foot line"}],
    reason: "Without the modes the area stays \"varies\" and no template can be drawn at all: the "
      + "cone, the burst and the line are the spell's whole delivery, and all three cost "
      + "the same 2 AP."
  },
  {
    id: "shadow-blast-modeLabel", pack: "spells", name: "Shadow Blast",
    field: "modeLabel", since: "3.603.1",
    from: "",
    to: "Shape",
    reason: "FOUND BY THE LIVE TEST OF 3.603.0. The shapes were repaired onto a carried copy "
      + "and the chooser that presents them was titled \"Shadow Blast — Action Points\", "
      + "because the release repaired `effects` and `apOptions` and forgot the two fields that "
      + "say what the modes ARE. A cone, a burst and a line are not a choice of action cost, "
      + "and `modeLabel` exists precisely to stop the system saying they are."
  },
  {
    id: "shadow-blast-modePrompt", pack: "spells", name: "Shadow Blast",
    field: "modePrompt", since: "3.603.1",
    from: "",
    to: "Shadow Blast is moulded into one of three shapes. Choose this casting's:",
    reason: "The other half of the same gap: without it a repaired copy told the caster that "
      + "\"Shadow Blast scales with the actions you spend\", which is not what its three "
      + "printed shapes are."
  },
  {
    id: "energy-bolt-effects", pack: "spells", name: "Energy Bolt",
    field: "effects", since: "3.603.0",
    from: [{"kind": "note", "text": "Choose the element when you cast (acid / cold / electricity / fire) \u2014 you must have an appropriate source to draw upon. 1d8 of the chosen type."}],
    to: [{"kind": "damageTypeChoice", "damageTypes": ["acid", "cold", "electricity", "fire"], "label": "Energy Bolt", "printSource": true}, {"kind": "note", "text": "THE SOURCE IS THE TABLE'S CALL. The page requires an appropriate element to draw upon \u2014 packed earth for acid, snow or ice for cold, an overcast sky for electricity, an open flame for fire. The system models no weather, terrain or nearby flames, so the card names the requirement the chosen element carries and the GM settles whether one is at hand."}],
    reason: "The page says the caster selects one of four elements; the item was authored as fire "
      + "and every cast of it had been fire ever since. The row also carries the source "
      + "requirement the page prints, which the card now names for whichever element is "
      + "chosen."
  },
  {
    id: "searing-burst-effects", pack: "spells", name: "Searing Burst",
    field: "effects", since: "3.603.0",
    from: [{"kind": "note", "text": "Choose the element when you cast (acid / cold / electricity / fire) \u2014 you must have an appropriate source. 5d8 of the chosen type, Basic Reflex."}],
    to: [{"kind": "damageTypeChoice", "damageTypes": ["acid", "cold", "electricity", "fire"], "label": "Searing Burst", "printSource": true}, {"kind": "note", "text": "THE SOURCE IS THE TABLE'S CALL \u2014 the same requirement Energy Bolt prints, word for word, and treated the same way: named on the card, judged at the table, never enforced by a system that cannot see the weather."}],
    reason: "The same sentence Energy Bolt prints, word for word, and the same frozen fire."
  },
  /* ---------------------------------------------------------------- *
   * RESURRECTION (3.602.0) — the four printed consequences of coming
   * back, none of which an owned copy carried.
   * ---------------------------------------------------------------- */
  {
    id: "resurrection-effects", pack: "spells", name: "Resurrection",
    field: "effects", since: "3.602.0",
    from: [],
    to: [{"kind":"resurrect","target":"targets","label":"Resurrection"},{"kind":"note","text":"THE POOLS THIS EMPTIES, and the two it does not. \"No points in any pools or any other daily resources\" is read as HP to 1, PP to 0, and endeavour, conviction and luck to nothing. Action points and reactions are left alone: they refill every TURN rather than every day, and emptying them would stop a creature raised mid-combat from acting at all — a punishment the page does not name."},{"kind":"note","text":"DEATH STATE IS PERMANENT. It falls by 1 every time this spell lands on the same creature, and at 0 the soul is destroyed or corrupted (GM discretion). This is the only spell in the Grimoire that writes a permanent reduction to a creature's ability to survive dying, so the card names the old value and the new one every time."},{"kind":"note","text":"THE +2 PP WARP IS PRINTED, NOT AUTOMATED: \"the target can have been dead for up to 1 year\" needs a time of death, and nothing in this system records one. Whether the body is whole and present, the soul free and willing, how long they have been dead, and the gemstones worth 200 gp × level are all judged at the table — as is the personality or appearance change a returned character often carries."}],
    reason: "A PP 12 spell whose whole aftermath lived in the GM's memory: the pools it "
      + "empties, the week of Injured 2 that nothing can lift, the permanent Death State "
      + "cost, and the point at which the soul is destroyed. An owned copy restored a "
      + "creature to life and charged it nothing."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 32, R3–R8 (3.608.0) — riders, sizes, maneuvers, reactions, zones.
   * Written from tools/block32c-plan.mjs; `from` read off the 3.607.0 pack.
   * ---------------------------------------------------------------- */
  {
    id: "shock-bolt-damage-3608", pack: "spells", name: "Shock Bolt",
    field: "damage", since: "3.608.0",
    from: {"formula":"2d12","type":"electricity","persistent":""},
    to: {"formula":"2d12","type":"electricity","persistent":"","critSplash":{"fraction":0.5,"save":"reflex","basic":true,"requires":"metalArmour","reachFeet":5}},
    reason: "The critical's arc to adjacent creatures in metal armour — half damage, basic Reflex — was printed and read by nothing."
  },
  {
    id: "shocking-grasp-damage-3608", pack: "spells", name: "Shocking Grasp",
    field: "damage", since: "3.608.0",
    from: {"formula":"2d12","type":"electricity","persistent":"1"},
    to: {"formula":"2d12","type":"electricity","persistent":"1","metal":{"attack":1,"recurringOnlyVsMetal":true,"doubleOnCritical":true}},
    reason: "The recurring electricity landed on every hit against anybody; the page gives it, and the +1 to the attack, only against metal — and doubles it on a critical."
  },
  {
    id: "shocking-grasp-warps-3608", pack: "spells", name: "Shocking Grasp",
    field: "warps", since: "3.608.0",
    from: [{"ppCost":2,"text":"the damage increases by 1d12, and the persistent electricity damage increases by 1","mods":{"damageDice":"1d12","persistent":1}}],
    to: [{"ppCost":2,"text":"the damage increases by 1d12, and the recurring electricity damage increases by 1","mods":{"damageDice":"1d12","persistent":1}}],
    reason: "The warp's text said persistent where the book says recurring; its mods are unchanged."
  },
  {
    id: "size-alteration-effects-3608", pack: "spells", name: "Size Alteration",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"sizeStep","target":"targets","label":"Size Alteration","steps":1,"largestAffected":"medium","floor":"tiny","reversible":true}],
    reason: "`effects: []` on a spell whose whole content is a size step."
  },
  {
    id: "size-alteration-warps-3608", pack: "spells", name: "Size Alteration",
    field: "warps", since: "3.608.0",
    from: [{"ppCost":2,"text":"reduce the size of a creature (tiny min)","mods":{}},{"ppCost":2,"text":"effect an additional target","mods":{"extraTargets":1}},{"ppCost":3,"text":"increase the duration to 10 minutes","mods":{"durationText":"10 minutes"}},{"ppCost":6,"text":"change the targets size by two steps, or a large creature by one step","mods":{}}],
    to: [{"ppCost":2,"text":"reduce the size of a creature (tiny min)","mods":{"sizeReverse":true}},{"ppCost":2,"text":"effect an additional target","mods":{"extraTargets":1}},{"ppCost":3,"text":"increase the duration to 10 minutes","mods":{"durationText":"10 minutes"}},{"ppCost":6,"text":"change the targets size by two steps, or a large creature by one step","mods":{"sizeReach":1}}],
    reason: "Two of four warps (reduce instead; two steps or a Large creature by one) carried `mods: {}` and bought nothing."
  },
  {
    id: "smash-effects-3608", pack: "spells", name: "Smash",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"versusDamage","target":"self","label":"Smash","value":1,"bonusType":"status","vsTypes":["construct"],"max":5,"discharge":2},{"kind":"note","text":"OBJECTS ARE THE TABLE'S: nothing marks a door as something a Strike is aimed at, so add the bonus by hand when you smash one. Against a construct it is added — and offered for discharge — automatically."}],
    reason: "`effects: []`: no damage bonus against constructs and no discharge."
  },
  {
    id: "solid-fog-effects-3608", pack: "spells", name: "Solid Fog",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"zone","target":"area","label":"Solid Fog","condition":"concealed","obscuresOutward":true},{"kind":"difficultTerrain","target":"area","label":"Solid Fog"},{"kind":"note","text":"A MOVING CLOUD is the GM's: drag the fog's Region 10 feet each round and whoever it covers is concealed the moment it arrives."}],
    reason: "`effects: []`: no concealment either way and no difficult terrain."
  },
  {
    id: "sonic-bolt-damage-3608", pack: "spells", name: "Sonic Bolt",
    field: "damage", since: "3.608.0",
    from: {"formula":"4d10","type":"sonic","persistent":""},
    to: {"formula":"4d10","type":"sonic","persistent":"","critArmourBypass":"light"},
    reason: "A critical that bypasses light armour when the injury table is read was printed and read by nothing."
  },
  {
    id: "sonic-bolt-warps-3608", pack: "spells", name: "Sonic Bolt",
    field: "warps", since: "3.608.0",
    from: [{"ppCost":2,"text":"the damage increases by 1d10","mods":{"damageDice":"1d10"}},{"ppCost":2,"text":"the type of armour ignored increases by one step","mods":{}}],
    to: [{"ppCost":2,"text":"the damage increases by 1d10","mods":{"damageDice":"1d10"}},{"ppCost":2,"text":"the type of armour ignored increases by one step","mods":{"armourStep":1}}],
    reason: "The armour-step warp carried `mods: {}` and bought nothing."
  },
  {
    id: "sonic-rupture-damage-3608", pack: "spells", name: "Sonic Rupture",
    field: "damage", since: "3.608.0",
    from: {"formula":"4d6","type":"bleed","persistent":""},
    to: {"formula":"4d6","type":"bleed","persistent":"","asCondition":{"condition":"bleeding","criticalType":"sonic"},"immuneAlternate":{"immuneTo":"bleeding","formula":"5d8","type":"sonic","ignoresImmunity":true}},
    reason: "4d6 of a damage type no table defines, reduced by armour, and nothing at all for a bleed-immune creature; now Bleeding scaled by the save, and 5d8 sonic through any sonic immunity for the bleed-immune."
  },
  {
    id: "sonic-rupture-effects-3608", pack: "spells", name: "Sonic Rupture",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"note","text":"BLEED DAMAGE IS BLEEDING. The save scales the 4d6 and the result is the Bleeding value (Chapter 7's Bleed Damage; the alchemical bombs read \"bleed damage\" the same way). A creature immune to bleeding takes the vibration instead — 5d8 sonic, rolled once, scaled by its own save, through any immunity to sonic."}],
    reason: "Says how the page's bleed damage is read."
  },
  {
    id: "spectral-grasp-effects-3608", pack: "spells", name: "Spectral Grasp",
    field: "effects", since: "3.608.0",
    from: [{"kind":"note","text":"Spectral limbs make a Disarm, Grapple, Shove or Trip (attack actions) using your Spellcraft check at -4. +2 PP: gains sustained, one option each turn."}],
    to: [{"kind":"maneuver","target":"targets","label":"Spectral Grasp","penalty":-4,"actions":["disarmAttack","grappleAttack","shoveAttack","tripAttack"]},{"kind":"note","text":"The +2 and +4 PP options (sustained, one option each turn; a new target each Sustain) are printed and not yet automated — cast again each turn for now."}],
    reason: "A note where a Disarm, Grapple, Shove or Trip at Spellcraft -4 should be."
  },
  {
    id: "spell-drain-effects-3608", pack: "spells", name: "Spell Drain",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"spellDrain","target":"targets","label":"Spell Drain","onSave":["success"],"penalty":-2},{"kind":"spellDrain","target":"targets","label":"Spell Drain","onSave":["failure"],"forced":"failure","absorb":true},{"kind":"spellDrain","target":"targets","label":"Spell Drain","onSave":["fumble"],"forced":"fumble","absorb":true},{"kind":"note","text":"CAST IT WHEN THE SPELL IS ANNOUNCED, before the target's casting is rolled — Cutting Words' road. The rung waits on the target and is spent by its next casting."}],
    reason: "`effects: []` on a reaction with a printed four-rung ladder."
  },
  {
    id: "spell-turning-effects-3608", pack: "spells", name: "Spell Turning",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"spellTurning","target":"self","label":"Spell Turning"}],
    reason: "`effects: []`: a PP 14 ward that turned nothing."
  },
  {
    id: "spider-climb-effects-3608", pack: "spells", name: "Spider Climb",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"speedGrant","target":"targets","key":"climb","feet":0,"orLand":true}],
    reason: "`effects: []` on a spell whose whole content is a climb Speed equal to Speed."
  },
  {
    id: "spiritual-weapon-effects-3608", pack: "spells", name: "Spiritual Weapon",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"spiritualWeapon","target":"self","label":"Spiritual Weapon","itemBonus":1,"damageType":"force"},{"kind":"note","text":"Mark the creature it strikes before casting and before each Sustain. It strikes from your direction and cannot flank."}],
    reason: "`effects: []`: a sustained force weapon that never struck."
  },
  {
    id: "stone-call-effects-3608", pack: "spells", name: "Stone Call",
    field: "effects", since: "3.608.0",
    from: [],
    to: [{"kind":"difficultTerrain","target":"area","label":"Stone Call"}],
    reason: "The minute of debris-strewn difficult terrain was absent."
  },
  {
    id: "stoneskin-effects-3608", pack: "spells", name: "Stoneskin",
    field: "effects", since: "3.608.0",
    from: [{"kind":"note","text":"You gain physical resistance (adamantine). Each physical hit you take reduces the remaining duration by 1 minute."}],
    to: [{"kind":"defence","target":"self","field":"resistance","value":"physical (adamantine)"},{"kind":"wearingClock","target":"self","on":"physical","seconds":60,"label":"Stoneskin"}],
    reason: "A note where physical resistance (adamantine) and a duration worn down by each physical hit should be."
  },
  {
    id: "stoneskin-warps-3608", pack: "spells", name: "Stoneskin",
    field: "warps", since: "3.608.0",
    from: [{"ppCost":4,"text":"the resistance applies to adamantine damage as well","mods":{}}],
    to: [{"ppCost":4,"text":"the resistance applies to adamantine damage as well","mods":{"defenceValue":"physical"}}],
    reason: "The adamantine warp carried `mods: {}` and bought nothing."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 32, R1 AND R2 (3.606.0) — Spirit Trap and Shroud.
   * Written from tools/block32b-plan.mjs; `from` read off the 3.605.1 pack.
   * ---------------------------------------------------------------- */
  {
    id: "shroud-effects-3606", pack: "spells", name: "Shroud",
    field: "effects", since: "3.606.0",
    from: [],
    to: [{"kind": "skillLadder", "label": "Shroud", "skills": ["acrobatics"], "candidates": "targets", "governs": true, "purpose": "to avoid the shroud", "prompt": "Tick any target that is UNWILLING; each rolls Acrobatics to avoid the shroud. Anyone left unticked accepts it for its full duration.", "nobody": "no target resisted — each is shrouded for the full duration.", "judged": "Judged at the table: whether a target is willing. A creature sensitive to light may well welcome it.", "degrees": {"critical": {"text": "avoids the shroud entirely", "unaffected": true}, "success": {"text": "is shrouded for <strong>1 round</strong>", "duration": "1 round"}, "failure": {"text": "is shrouded for the full duration"}}}, {"kind": "lightPerception", "target": "targets", "steps": -2, "label": "Shroud"}, {"kind": "conditional", "label": "Shroud", "target": "targets", "grants": [{"kind": "modifier", "value": 2, "type": "circumstance", "label": "Shroud", "scope": "saving throws against light effects", "when": {"checkTypes": ["save"], "traits": ["light"]}, "auto": true}]}],
    reason: "A shroud that dimmed nothing and protected against nothing, whose Acrobatics check was never asked — an effects list of [] on a spell with three printed outcomes."
  },
  {
    id: "spirit-trap-effects-3606", pack: "spells", name: "Spirit Trap",
    field: "effects", since: "3.606.0",
    from: [],
    to: [{"kind": "movementBind", "target": "targets", "label": "Spirit Trap", "save": "will", "rungs": {"critical": {}, "success": {"difficult": true, "resave": true}, "failure": {"leashFeet": 5, "resave": true}, "fumble": {"leashFeet": 5}}}, {"kind": "note", "text": "THE NEW SAVE RE-READS THE WHOLE LADDER. Apocalypse prints the same sentence and there a fresh save plainly re-runs its rungs, so here the degree rolled at the start of the creature's turn picks the next round's rung: a Critical frees it, a Success means heavy ground, a Failure a 5-foot leash from where it now stands, and a Fumble locks the leash for the rest of the minute."}, {"kind": "note", "text": "NO SHADOW, NO TRAP. The spell fails outright on a creature that casts no shadow, and ends if the creature is ever entirely in an area with no illumination — both judged at the table; end it from the Spellcasting panel."}],
    reason: "The shadow was pinned and the creature walked away: no heavy ground, no leash, no new save — an effects list of []."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 32, R1 (3.606.0) — nine save ladders from pages 325-333.
   * Written from tools/block32-plan.mjs; `from` read off the 3.605.1 pack.
   * ---------------------------------------------------------------- */
  {
    id: "slay-the-soul-effects-3606", pack: "spells", name: "Slay The Soul",
    field: "effects", since: "3.606.0",
    from: [],
    to: [{"kind": "saveLadder", "target": "targets", "damageType": "essence", "ladder": {"success": "", "partial": "margin", "failure": "", "fumble": ""}, "criticalOn": {"partial": "serious"}, "dropsToOn": {"failure": 0}, "slaysOn": ["fumble"]}, {"kind": "note", "text": "THE PAGE PRINTS NO CRITICAL RUNG. Success is \"unaffected\", so a Critical or Heroic save reads there too; a Blunder reads at the Fumble. The Partial's damage is one per point the save fell short, so a Partial by 3 is 3 essence and a serious critical."}],
    reason: "A PP 10 spell whose ladder kills on a Fumble and drops a creature to Dying on a Failure carried no rows at all — every save against it did nothing."
  },
  {
    id: "snagging-pit-effects-3606", pack: "spells", name: "Snagging Pit",
    field: "effects", since: "3.606.0",
    from: [],
    to: [{"kind": "condition", "target": "targets", "condition": "stunned", "value": 1, "onSave": ["success"]}, {"kind": "fall", "target": "targets", "feet": 10, "onSave": ["failure"]}, {"kind": "fall", "target": "targets", "feet": 10, "noReactions": true, "onSave": ["fumble"]}, {"kind": "note", "text": "THE AREA IS A 5-FOOT SQUARE, and no area in this system is square yet — the backlog item this spell shares with Harrow and Flaming Sphere. So it places no template: target whoever is standing on the pit. The warps (+5 feet deep, spikes, a 10-foot radius) are printed and not yet automated."}],
    reason: "The pit opened and nobody fell into it: the stun, the fall and the no-reactions Fumble were all prose."
  },
  {
    id: "soul-destruction-effects-3606", pack: "spells", name: "Soul Destruction",
    field: "effects", since: "3.606.0",
    from: [],
    to: [{"kind": "saveLadder", "target": "targets", "damageType": "essence", "ladder": {"critical": "2d10", "success": "", "partial": "", "failure": "", "fumble": ""}, "criticalOn": {"success": "minor", "partial": "serious", "failure": "deadly"}, "slaysOn": ["fumble"], "soulDestroyedOn": ["fumble"]}, {"kind": "resource", "target": "targets", "resource": "soulDrain", "formula": "4d10", "label": "Soul Destruction", "onSave": ["success"]}, {"kind": "resource", "target": "targets", "resource": "soulDrain", "formula": "6d10", "label": "Soul Destruction", "onSave": ["partial"]}, {"kind": "resource", "target": "targets", "resource": "soulDrain", "formula": "10d10", "label": "Soul Destruction", "onSave": ["failure"]}, {"kind": "note", "onSave": ["fumble"], "text": "Fumble: the target dies and its soul is destroyed — Resurrection refuses this body, and says so, until the GM lifts it."}, {"kind": "note", "text": "\"A MORTAL CRITICAL\" is read as DEADLY — the book defines minor, serious and deadly and no fourth severity. Awaiting Graham's word."}],
    reason: "A PP 20 spell that destroys a soul carried a stored 2d10 and no rows, and a non-basic save never rolls stored damage — so it did nothing to anybody."
  },
  {
    id: "sound-burst-effects-3606", pack: "spells", name: "Sound Burst",
    field: "effects", since: "3.606.0",
    from: [{"kind": "condition", "target": "targets", "condition": "deafened", "onSave": ["failure", "fumble"], "duration": "1 round"}, {"kind": "note", "onSave": ["failure"], "text": "Full damage and deafened for 1 round."}, {"kind": "note", "onSave": ["fumble"], "text": "Full damage, deafened, and a Minor critical."}],
    to: [{"kind": "saveLadder", "target": "targets", "damageType": "sonic", "ladder": {"critical": "", "success": "half", "failure": "full", "fumble": "full"}, "criticalOn": {"fumble": "minor"}}, {"kind": "condition", "target": "targets", "condition": "deafened", "onSave": ["failure", "fumble"], "duration": "1 round"}],
    reason: "The deafened rows were right; the 2d10 sonic was stored where no non-basic save ever reads it, so the burst dealt no damage at all."
  },
  {
    id: "speak-with-dead-defence-3606", pack: "spells", name: "Speak With Dead",
    field: "defence", since: "3.606.0",
    from: "",
    to: "Will",
    reason: "No save meant no rung could ever be reached, the haunting Critical included."
  },
  {
    id: "speak-with-dead-effects-3606", pack: "spells", name: "Speak With Dead",
    field: "effects", since: "3.608.1",
    from: [],
    alsoFrom: [[{"kind": "marker", "target": "self", "marker": "haunted", "onSave": ["critical"], "duration": "1 day", "note": "(the corpse's spirit)"}, {"kind": "note", "onSave": ["critical"], "text": "May deceive you or withhold its answers."}, {"kind": "note", "onSave": ["success"], "text": "May ignore your questions or answer them falsely."}, {"kind": "note", "onSave": ["failure"], "text": "Answers truthfully, but cryptically."}, {"kind": "note", "onSave": ["fumble"], "text": "Answers truthfully and directly."}, {"kind": "note", "text": "A WILLING CORPSE DOES NOT SAVE. The save is rolled for every cast; when the corpse is willing, ignore it and play the Fumble rung. Up to three questions; fails if the spell was cast on this corpse in the last month."}]],
    to: [{"kind": "marker", "target": "self", "marker": "haunted", "onSave": ["heroic", "critical"], "duration": "1 day", "note": "(the corpse's spirit)"}, {"kind": "note", "onSave": ["heroic", "critical"], "text": "May deceive you or withhold its answers."}, {"kind": "note", "onSave": ["success"], "text": "May ignore your questions or answer them falsely."}, {"kind": "note", "onSave": ["failure"], "text": "Answers truthfully, but cryptically."}, {"kind": "note", "onSave": ["fumble"], "text": "Answers truthfully and directly."}, {"kind": "note", "text": "A WILLING CORPSE DOES NOT SAVE. The save is rolled for every cast; when the corpse is willing, ignore it and play the Fumble rung. Up to three questions; fails if the spell was cast on this corpse in the last month."}],
    reason: "Four printed outcomes and a day-long haunting, none of them on the card. Rewritten at 3.608.1 on Graham's ruling of 30 September 2026 \u2014 \"heroic should also haunt the caster\" \u2014 and a copy already carrying the 3.606.0 rows is recognised through `alsoFrom`."
  },
  {
    id: "speed-effects-3606", pack: "spells", name: "Speed",
    field: "effects", since: "3.606.0",
    from: [{"kind": "condition", "target": "targets", "condition": "quickened"}, {"kind": "note", "text": "The extra action may only be used for Strike or Stride. When the spell ends the target makes a Will save or is fatigued (1 on a crit, up to 4 on a fumble)."}],
    to: [{"kind": "condition", "target": "targets", "condition": "quickened", "endSave": {"save": "will", "condition": "fatigued", "values": {"critical": 1, "success": 2, "failure": 3, "fumble": 4}, "criticalOn": {"fumble": "minor"}, "criticalType": "mental"}}, {"kind": "note", "text": "The extra action may only be used for Strike or Stride. When the spell ends — its minute, a Dismiss, a Dispel, or anything else that takes quickened away — the target rolls the Will save automatically and is charged the fatigue it prints."}],
    reason: "The fatigue Speed charges when it ends lived in a note; the save is now owed by the quickened effect itself."
  },
  {
    id: "startle-effects-3606", pack: "spells", name: "Startle",
    field: "effects", since: "3.606.0",
    from: [{"kind": "note", "text": "On a failed Will save the target takes a forced Step away from you; on a fumble it is also frightened 1."}],
    to: [{"kind": "forcedMove", "target": "targets", "label": "Startle", "feet": 5, "direction": "away", "onSave": ["failure", "fumble"]}, {"kind": "condition", "target": "targets", "condition": "frightened", "value": 1, "onSave": ["fumble"]}],
    reason: "The forced Step and the Fumble's frightened 1 were a note for the GM to apply."
  },
  {
    id: "suggestion-effects-3606", pack: "spells", name: "Suggestion",
    field: "effects", since: "3.606.0",
    from: [],
    to: [{"kind": "note", "onSave": ["critical"], "text": "Unaffected — and knows you tried to control it."}, {"kind": "note", "onSave": ["success"], "text": "Unaffected — and thinks you were simply talking to it."}, {"kind": "note", "onSave": ["failure"], "text": "Follows your suggestion for 1 minute, or until a finite suggestion is complete, or it becomes self-destructive or plainly harmful."}, {"kind": "note", "onSave": ["fumble"], "text": "As failure, but for 1 hour."}, {"kind": "note", "text": "An obviously harmful suggestion negates the spell. The suggestion is a sentence or two and must sound reasonable — judged at the table."}],
    reason: "No outcome of the save reached the card; each rung now says what the target does."
  },
  {
    id: "sunburst-effects-3606", pack: "spells", name: "Sunburst",
    field: "effects", since: "3.606.0",
    from: [],
    to: [{"kind": "condition", "target": "targets", "condition": "blinded", "onSave": ["fumble"], "duration": "permanent"}],
    reason: "The Fumble's permanent blindness was absent — a Basic save's arithmetic carries the damage and nothing else."
  },
  /* ---------------------------------------------------------------- *
   * SONG OF DESPAIR (3.429.0) — the floor, without which the spell's
   * whole rule is missing.
   * ---------------------------------------------------------------- */
  {
    id: "song-of-despair-floor", pack: "spells", name: "Song Of Despair",
    field: "effects", since: "3.429.0",
    from: [
      { kind: "condition", target: "targets", condition: "frightened", value: 1 },
      { kind: "note", text: "Foes in the area can't reduce their frightened below 1 while they remain in it." }
    ],
    to: [
      { kind: "condition", target: "targets", condition: "frightened", value: 1, floor: true },
      { kind: "note", text: "Foes in the area can't reduce their frightened below 1 while they remain in it." }
    ],
    reason: "Without `floor: true` the spell applies frightened 1 and nothing stops a "
      + "creature recovering from it — which is the entire rule the spell prints."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 33 (3.609.0) — pages 331-340 and Graham's rulings of 1 October 2026.
   * Written from tools/block33-plan.mjs; `from` read off the 3.608.3 pack.
   * ---------------------------------------------------------------- */
  {
    id: "gust-effects-3609", pack: "spells", name: "Gust",
    field: "effects", since: "3.609.0",
    from: [{"kind":"condition","target":"targets","condition":"prone","onSave":["failure","fumble"]},{"kind":"note","onSave":["success"],"text":"Cannot move against the wind."},{"kind":"note","onSave":["partial"],"text":"Moving against the wind counts as difficult terrain."},{"kind":"note","onSave":["failure"],"text":"Knocked prone. A FLYING creature suffers the fumble result instead."},{"kind":"note","onSave":["fumble"],"text":"Pushed 30 feet downwind, knocked prone, and takes 2d6 bludgeoning."},{"kind":"note","text":"The push and the flyer's worse result are applied by hand: nothing reads whether a target is airborne at the moment a rung is chosen."}],
    to: [{"kind":"saveLadder","target":"targets","ladder":{"critical":"","success":"","partial":"","failure":"","fumble":"2d6"}},{"kind":"condition","target":"targets","condition":"prone","onSave":["failure","fumble"]},{"kind":"forcedMove","target":"targets","label":"Gust","feet":30,"direction":"away","onSave":["fumble"]},{"kind":"note","onSave":["success"],"text":"Cannot move against the wind."},{"kind":"note","onSave":["partial"],"text":"Moving against the wind counts as difficult terrain."},{"kind":"note","onSave":["failure"],"text":"Knocked prone. A FLYING creature suffers the fumble result instead — by hand."},{"kind":"note","onSave":["fumble"],"text":"Pushed 30 feet downwind, knocked prone, and takes 2d6 bludgeoning."}],
    reason: "The Fumble's 2d6 bludgeoning and 30-foot push were prose; both are applied now."
  },
  {
    id: "incandescence-effects-3609", pack: "spells", name: "Incandescence",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"saveLadder","target":"targets","ladder":{"critical":"","success":"half","failure":"full","fumble":"double"},"persistentOn":{"failure":1,"fumble":2}},{"kind":"note","text":"Target the creature wearing or carrying the metal item. A creature holding the item may drop it to improve its save by one step — by hand. On an unattended item the spell needs no save and is harmless."}],
    reason: "A Reflex save (not Basic) never rolled the 3d6, and a save spell never applied its recurring rider. Now half, full and double, with no, full and double recurring fire."
  },
  {
    id: "incandescence-warps-3609", pack: "spells", name: "Incandescence",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"damage increases by 1d6 and the persistent by 1d4","mods":{"damageDice":"1d6","persistent":1}}],
    to: [{"ppCost":2,"text":"damage increases by 1d6 and the persistent by 1d4","mods":{"damageDice":"1d6","persistentDice":"1d4"}}],
    reason: "\"and the persistent by 1d4\" was stored as +1; the recurring die now grows by a die."
  },
  {
    id: "meteor-swarm-warps-3609", pack: "spells", name: "Meteor Swarm",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"The bludgeoning damage increases by 1d10, and the fire damage increases by 2d6","mods":{"damageDice":"1d10"}}],
    to: [{"ppCost":2,"text":"The bludgeoning damage increases by 1d10, and the fire damage increases by 2d6","mods":{"damageDice":"1d10","secondaryDice":"2d6"}}],
    reason: "\"and the fire damage increases by 2d6\" never reached the second pool."
  },
  {
    id: "painful-rebuke-effects-3609", pack: "spells", name: "Painful Rebuke",
    field: "effects", since: "3.609.0",
    from: [{"kind":"note","text":"REACTIVE, and applied by hand: each time the target attacks you, targets you with a harmful spell, or acts to harm you, it takes 2d6 mental (once only on a success, then the spell ends; every time for 1 minute on a failure; a fumble adds a Minor Critical). Nothing in this system watches one creature for actions aimed at another."},{"kind":"note","onSave":["critical"],"text":"Unaffected."}],
    to: [{"kind":"rebuke","target":"targets","onSave":["success"],"formula":"2d6","damageType":"mental","once":true},{"kind":"rebuke","target":"targets","onSave":["failure"],"formula":"2d6","damageType":"mental","duration":"1 minute"},{"kind":"rebuke","target":"targets","onSave":["fumble"],"formula":"2d6","damageType":"mental","duration":"1 minute","critical":"minor"},{"kind":"note","onSave":["critical"],"text":"Unaffected."},{"kind":"note","text":"The bite comes when the rebuked creature attacks you or aims a spell attack at you; other harm it does you is the table's."}],
    reason: "A Will save (not Basic) never rolled the 2d6, and the rebuke was applied by hand. The rebuked creature now carries what its save bought, and turning on the caster costs it."
  },
  {
    id: "phantasmal-killer-effects-3609", pack: "spells", name: "Phantasmal Killer",
    field: "effects", since: "3.609.0",
    from: [{"kind":"condition","target":"targets","condition":"frightened","value":1,"onSave":["success"]},{"kind":"condition","target":"targets","condition":"frightened","value":2,"onSave":["partial","failure"]},{"kind":"condition","target":"targets","condition":"frightened","value":4,"onSave":["fumble"]},{"kind":"note","onSave":["critical"],"text":"Unaffected."},{"kind":"note","onSave":["success"],"text":"4d6 mental damage and frightened 1."},{"kind":"note","onSave":["partial"],"text":"6d6 mental damage, a Minor Critical and frightened 2."},{"kind":"note","onSave":["failure"],"text":"8d6 mental damage, a Serious Critical and frightened 2."},{"kind":"note","onSave":["fumble"],"text":"A Fortitude save or the target DIES. Surviving it: 12d6 mental, a Deadly Critical, fleeing until the end of its next turn, and frightened 4."},{"kind":"note","text":"The mental damage and the criticals are rolled by hand — this is a five-rung ladder and the system's save ladder carries four."}],
    to: [{"kind":"saveLadder","target":"targets","damageType":"mental","ladder":{"critical":"","success":"4d6","partial":"6d6","failure":"8d6","fumble":"12d6"},"criticalOn":{"partial":"minor","failure":"serious","fumble":"deadly"}},{"kind":"condition","target":"targets","condition":"frightened","value":1,"onSave":["success"]},{"kind":"condition","target":"targets","condition":"frightened","value":2,"onSave":["partial","failure"]},{"kind":"condition","target":"targets","condition":"frightened","value":4,"onSave":["fumble"]},{"kind":"condition","target":"targets","condition":"fleeing","onSave":["fumble"],"duration":"1 round"},{"kind":"followUpSave","target":"targets","onSave":["fumble"],"save":"fortitude","label":"Phantasmal Killer — so afraid it might die","rungs":{"success":[],"failure":{"slays":true}}},{"kind":"note","onSave":["critical"],"text":"Unaffected."},{"kind":"note","onSave":["success"],"text":"4d6 mental damage and frightened 1."},{"kind":"note","onSave":["partial"],"text":"6d6 mental damage, a Minor Critical and frightened 2."},{"kind":"note","onSave":["failure"],"text":"8d6 mental damage, a Serious Critical and frightened 2."},{"kind":"note","onSave":["fumble"],"text":"A Fortitude save or the target DIES. Surviving it: 12d6 mental, a Deadly Critical, fleeing until the end of its next turn, and frightened 4."}],
    reason: "The mental damage and the criticals were rolled by hand, and the Fumble's Fortitude save that kills was prose. All of it is applied now."
  },
  {
    id: "phantasmal-killer-kindgate-3609", pack: "spells", name: "Phantasmal Killer",
    field: "kindGate", since: "3.609.0",
    from: "",
    to: "living",
    reason: "\"Targets 1 living creature\": undead and constructs are not living, and nothing kept the spell off them."
  },
  {
    id: "phantasmal-killer-warps-3609", pack: "spells", name: "Phantasmal Killer",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":1,"text":"the damage increases by 1d6 on a failure and by 2d6 on a fumble","mods":{"damageDice":"1d6"}}],
    to: [{"ppCost":1,"text":"the damage increases by 1d6 on a failure and by 2d6 on a fumble","mods":{"rungDice":{"failure":"1d6","fumble":"2d6"}}}],
    reason: "\"+1d6 on a failure and +2d6 on a fumble\" was stored as +1d6 to a damage roll the ladder never reads."
  },
  {
    id: "portal-maelstrom-effects-3609", pack: "spells", name: "Portal Maelstrom",
    field: "effects", since: "3.609.0",
    from: [{"kind":"condition","target":"targets","condition":"prone","onSave":["failure"]},{"kind":"note","onSave":["critical"],"text":"Leaps free — unaffected."},{"kind":"note","onSave":["success"],"text":"4d8 force damage and slowed 1 for 1 round."},{"kind":"note","onSave":["failure"],"text":"8d8 force damage, teleported 1d4×10 feet in a random direction, landing prone."},{"kind":"note","onSave":["fumble"],"text":"12d8 force damage and shunted into an adjacent plane for 1 round."},{"kind":"note","text":"Every target also takes a force critical as if the save were Basic, the save recurs at the start of each turn, and the area is difficult terrain. Rolled by hand."}],
    to: [{"kind":"saveLadder","target":"targets","recurring":{"save":"reflex","on":"startOfTurn","damageType":"force","basicCriticals":true,"ladder":{"critical":"","success":"4d8","failure":"8d8","fumble":"12d8"}}},{"kind":"difficultTerrain","label":"Portal Maelstrom","target":"area"},{"kind":"note","onSave":["critical"],"text":"Leaps free — unaffected."},{"kind":"note","onSave":["success"],"text":"4d8 force damage and slowed 1 for 1 round."},{"kind":"note","onSave":["failure"],"text":"8d8 force damage, teleported 1d4×10 feet in a random direction, landing prone."},{"kind":"note","onSave":["fumble"],"text":"12d8 force damage and shunted into an adjacent plane for 1 round."},{"kind":"note","text":"Each creature saves when it BEGINS its turn in the maelstrom; the damage and the force critical are rolled then. The slow, the teleport and the shunt are applied by hand."}],
    reason: "The 4d8/8d8/12d8 and the force critical were rolled by hand. Now a save at the start of each creature's turn in the maelstrom, with the critical read as a Basic save's, and the area difficult terrain."
  },
  {
    id: "sunburst-warps-3609", pack: "spells", name: "Sunburst",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"The fire damage increases by 1d10, and the essence damage against undead increases by 1d4","mods":{"damageDice":"1d10"}}],
    to: [{"ppCost":2,"text":"The fire damage increases by 1d10, and the essence damage against undead increases by 1d4","mods":{"damageDice":"1d10","secondaryDice":"1d4"}}],
    reason: "\"and the essence damage against undead increases by 1d4\" never reached the second pool."
  },
  {
    id: "tame-effects-3609", pack: "spells", name: "Tame",
    field: "effects", since: "3.609.0",
    from: [{"kind":"attitude","target":"targets","steps":1},{"kind":"note","text":"Once the spell ends the target is temporarily immune for 1 day."}],
    to: [{"kind":"attitude","target":"targets","steps":1},{"kind":"tempImmunity","target":"targets","length":"1 day","label":"Tame"},{"kind":"note","text":"Once the spell ends the target is temporarily immune for 1 day."}],
    reason: "The day's immunity after the spell is a temporary immunity, not a note."
  },
  {
    id: "tangling-creepers-areachoice-3609", pack: "spells", name: "Tangling Creepers",
    field: "areaChoice", since: "3.609.0",
    from: false,
    to: true,
    reason: "The vine lashes one creature, chosen from those the creepers caught."
  },
  {
    id: "tangling-creepers-effects-3609", pack: "spells", name: "Tangling Creepers",
    field: "effects", since: "3.609.0",
    from: [{"kind":"note","text":"Creepers make the area difficult terrain and impose -10 ft Speed. As part of casting and then once per round as a 1 AP attack action, make a vine lash (Spellcraft) to Grapple a creature in the area."}],
    to: [{"kind":"zone","label":"Tangling Creepers","speedPenalty":-10},{"kind":"maneuver","target":"targets","label":"Tangling Creepers vine","penalty":0,"action":"grappleAttack"},{"kind":"lash","target":"self"},{"kind":"note","text":"Tick only the creature the first vine lashes at. Each round after, the card's button lashes again (1 AP) at your current target; the 15-foot reach from the creepers is the table's to judge."}],
    reason: "The note gave the creepers difficult terrain the page does not. Now the -10 ft circumstance penalty to Speeds inside them, and the vine's Grapple at the cast and from a button each round."
  },
  {
    id: "telekinetic-manoeuvre-effects-3609", pack: "spells", name: "Telekinetic Manoeuvre",
    field: "effects", since: "3.609.0",
    from: [{"kind":"note","text":"Make a Disarm, Shove or Trip (attack actions) using your Spellcraft check (no penalty) instead of a Combat check."}],
    to: [{"kind":"maneuver","target":"targets","label":"Telekinetic Manoeuvre","penalty":0,"actions":["disarmAttack","shoveAttack","tripAttack"]}],
    reason: "Disarm, Shove or Trip with Spellcraft was a note; it is the maneuver chooser now."
  },
  {
    id: "telepathic-demand-effects-3609", pack: "spells", name: "Telepathic Demand",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"tempImmunity","target":"targets","onSave":["success"],"length":"1 day","label":"Telepathic Demand"},{"kind":"tempImmunity","target":"targets","onSave":["critical"],"length":"1 month","label":"Telepathic Demand"},{"kind":"note","onSave":["critical"],"text":"Resists, and is immune to your demands for 1 month."},{"kind":"note","onSave":["success"],"text":"Resists, and is immune to your demands for 1 day."},{"kind":"note","onSave":["failure","fumble"],"text":"Acts on your message as a suggestion. A message of 25 words or fewer; the target may reply in as many."}],
    reason: "The save's immunities (1 day, or 1 month on a Critical) had no rows, and no rung said what the target does."
  },
  {
    id: "time-stop-effects-3609", pack: "spells", name: "Time Stop",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"timeStop","target":"self","formula":"1d6+3"}],
    reason: "Nothing happened: the 1d6+3 AP are rolled for the GM and added to the caster's pool."
  },
  {
    id: "time-stop-warps-3609", pack: "spells", name: "Time Stop",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"you gain an additional 1d6 actions","mods":{}}],
    to: [{"ppCost":2,"text":"you gain an additional 1d6 actions","mods":{"damageDice":"1d6"}}],
    reason: "\"you gain an additional 1d6 actions\" carried no mod, so the purchase bought nothing."
  },
  {
    id: "touch-of-undeath-effects-3609", pack: "spells", name: "Touch Of Undeath",
    field: "effects", since: "3.609.0",
    from: [{"kind":"note","text":"1d6 essence (Fortitude): half on success; full + a minor critical on a failure; double + a light critical on a fumble."}],
    to: [{"kind":"saveLadder","target":"targets","ladder":{"critical":"","success":"half","failure":"full","fumble":"double"},"criticalOn":{"failure":"minor","fumble":"minor"}}],
    reason: "A Fortitude save (not Basic) never rolled the 1d6 essence. Now half, full and a minor critical, double and a minor critical."
  },
  {
    id: "touch-of-undeath-kindgate-3609", pack: "spells", name: "Touch Of Undeath",
    field: "kindGate", since: "3.609.0",
    from: "",
    to: "living",
    reason: "\"Targets 1 living creature\": undead and constructs are not living, and nothing kept the spell off them."
  },
  {
    id: "trade-essence-effects-3609", pack: "spells", name: "Trade Essence",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"essenceTrade","target":"targets","perLevel":2,"label":"Trade Essence"},{"kind":"note","text":"With the +4 PP option, up to four willing creatures share PP in any arrangement — move it a pair at a time."}],
    reason: "Nothing happened: PP move from one target to the other, within the caster's limit, the donor's pool and the recipient's maximum."
  },
  {
    id: "trade-essence-warps-3609", pack: "spells", name: "Trade Essence",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"increase the transferable amount by +1 PP per caster level","mods":{}},{"ppCost":2,"text":"the range increases to 30 feet","mods":{"rangeOverride":"30 feet"}},{"ppCost":4,"text":"you can link up to four willing creatures, redistributing PP among them in any arrangement you choose","mods":{}}],
    to: [{"ppCost":2,"text":"increase the transferable amount by +1 PP per caster level","mods":{"bonusValue":1}},{"ppCost":2,"text":"the range increases to 30 feet","mods":{"rangeOverride":"30 feet"}},{"ppCost":4,"text":"you can link up to four willing creatures, redistributing PP among them in any arrangement you choose","mods":{}}],
    reason: "\"+1 PP per caster level\" carried no mod."
  },
  {
    id: "transmute-rock-mud-apoptions-3609", pack: "spells", name: "Transmute Rock & Mud",
    field: "apOptions", since: "3.609.0",
    from: [],
    to: [{"ap":3,"label":"Mud to Rock — creatures in the mud save (Reflex or Acrobatics)","area":"10-foot radius","defence":"Reflex","saveAlternative":"acrobatics","effects":[{"kind":"condition","target":"targets","condition":"prone","onSave":["success"]},{"kind":"condition","target":"targets","condition":"grabbed","onSave":["failure"],"duration":"1 round"},{"kind":"condition","target":"targets","condition":"immobilised","onSave":["fumble"],"duration":"1 round"},{"kind":"note","onSave":["critical"],"text":"Escapes the mud and stands atop the stone."},{"kind":"note","onSave":["success"],"text":"Climbs out and is prone atop the stone."},{"kind":"note","onSave":["failure"],"text":"Partially stuck: grabbed for 1 round or until it Escapes."},{"kind":"note","onSave":["fumble"],"text":"Entirely stuck: immobilised for 1 round or until it Escapes."},{"kind":"note","text":"The drawn circle stands in for the two adjacent 10-foot areas — reshape the Region to fit."}]},{"ap":3,"label":"Rock to Mud — the stone becomes mud","area":"10-foot radius","defence":"","effects":[{"kind":"difficultTerrain","label":"Transmute Rock & Mud","target":"area"},{"kind":"note","text":"Mud 3 feet deep or more is formidable terrain or needs a DC 10 Swim (Athletics) check; too deep to touch bottom, swimming is required. Cast on a ceiling, the falling mud causes a light bludgeoning critical (Reflex to avoid) and the difficult terrain widens by 10 feet — by hand."},{"kind":"note","text":"The drawn circle stands in for the two adjacent 10-foot areas — reshape the Region to fit."}]}],
    reason: "Nothing happened: Mud to Rock's ladder (prone, grabbed, immobilised) and Rock to Mud's difficult terrain are two modes now."
  },
  {
    id: "transmute-rock-mud-modelabel-3609", pack: "spells", name: "Transmute Rock & Mud",
    field: "modeLabel", since: "3.609.0",
    from: "",
    to: "Which way",
    reason: "The chooser for the two directions."
  },
  {
    id: "transmute-rock-mud-modeprompt-3609", pack: "spells", name: "Transmute Rock & Mud",
    field: "modePrompt", since: "3.609.0",
    from: "",
    to: "Transmute Rock & Mud — which way does the earth change?",
    reason: "The chooser for the two directions."
  },
  {
    id: "true-seeing-effects-3609", pack: "spells", name: "True Seeing",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"avoidanceSight","target":"self","sight":"seeInvisible","level":"clear","label":"True Seeing"},{"kind":"note","text":"Within 60 feet you also see through normal and magical darkness, displacement and blur, visual illusions, and polymorphed creatures' true forms — the table's to apply."}],
    reason: "Nothing happened: invisible creatures are seen clearly."
  },
  {
    id: "true-strike-effects-3609", pack: "spells", name: "True Strike",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"conditional","label":"True Strike","target":"self","duration":"1 round","edge":{"ignoreCircumstance":true,"ignoreConcealment":true},"grants":[{"kind":"advantage","label":"True Strike","scope":"your next Strike before the end of your turn","when":{"checkTypes":["attack"]},"auto":true,"oneShot":true}]}],
    reason: "Nothing happened: advantage on the next Strike, ignoring circumstance penalties and concealment."
  },
  {
    id: "true-target-effects-3609", pack: "spells", name: "True Target",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"conditional","label":"True Target","target":"allies","againstChosenFoe":true,"edge":{"ignoreCircumstance":true,"ignoreConcealment":true},"grants":[{"kind":"advantage","label":"True Target","scope":"the first attack roll against the chosen creature","when":{"checkTypes":["attack"]},"auto":true,"oneShot":true}]},{"kind":"note","text":"Target the allies and the one foe together; the foe is the hostile creature among them."}],
    reason: "Nothing happened: the allies' first attack against the chosen foe gains advantage and sees through what would hinder it."
  },
  {
    id: "true-target-warps-3609", pack: "spells", name: "True Target",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":1,"text":"you may affect another creature","mods":{}}],
    to: [{"ppCost":1,"text":"you may affect another creature","mods":{"extraTargets":1}}],
    reason: "\"+1 PP: you may affect another creature\" carried no mod."
  },
  {
    id: "turn-undead-effects-3609", pack: "spells", name: "Turn Undead",
    field: "effects", since: "3.609.0",
    from: [{"kind":"note","text":"Undead only. On a failed Will save undead are stunned 1 (success) up to destroyed by degree; affects 1st-level undead in the emanation that can see or hear you."}],
    to: [{"kind":"turnSave","label":"Turn Undead","save":"will","maxLevel":1,"stepLevels":4,"rungs":{"critical":[],"success":[{"kind":"condition","condition":"stunned","value":1,"ignoreImmunity":true}],"failure":[{"kind":"condition","condition":"fleeing","duration":"1 round"}],"fumble":[{"kind":"condition","condition":"fleeing","duration":"1 round"}]},"criticalOn":{"fumble":{"severity":"minor","damageType":"essence"}},"remark":"Only undead that can see or hear the caster are turned — the table's call."}],
    reason: "Turn Undead did nothing, and its note invented a destroyed rung. Now each undead of the level it reaches that begins its turn in the circle saves Will: stunned 1 even if immune, fleeing, fleeing and a stepped essence critical."
  },
  {
    id: "turn-undead-warps-3609", pack: "spells", name: "Turn Undead",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":1,"text":"increase the level of affected undead by 1","mods":{}}],
    to: [{"ppCost":1,"text":"increase the level of affected undead by 1","mods":{"levelBump":1}}],
    reason: "\"+1 PP: increase the level of affected undead by 1\" carried no mod."
  },
  {
    id: "twisted-fate-effects-3609", pack: "spells", name: "Twisted Fate",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"pending","target":"targets","onSave":["failure"],"swing":"disadvantage","span":"endOfNextTurn","oneShot":false,"auto":true,"scope":"all checks during its next turn"},{"kind":"conditional","label":"Twisted Fate","target":"targets","onSave":["fumble"],"grants":[{"kind":"disadvantage","label":"Twisted Fate","scope":"all checks for the duration","when":{"always":true},"auto":true}]},{"kind":"note","onSave":["success","failure","fumble"],"text":"Cannot benefit from chance effects for the duration — the table's call."},{"kind":"note","onSave":["critical"],"text":"Unaffected."}],
    reason: "Nothing happened: disadvantage on all checks for the next turn on a Failure, and for the whole duration on a Fumble."
  },
  {
    id: "umbral-blast-effects-3609", pack: "spells", name: "Umbral Blast",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"followUpSave","target":"targets","trigger":"critical","save":"fortitude","label":"Umbral Blast — the darkness in its eyes","rungs":{"success":[],"failure":[{"kind":"condition","condition":"blinded","roundsPerMargin":1}],"fumble":[{"kind":"condition","condition":"blinded","duration":"permanent"}]}},{"kind":"note","text":"Any light effects the blast overlaps may be countered — by hand."}],
    reason: "\"A target that takes a critical injury must also make a Fortitude Save\": blinded a round per point of failure, or for good on a Fumble."
  },
  {
    id: "umbral-blast-warps-3609", pack: "spells", name: "Umbral Blast",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"The cold damage increases by 1d10, and the essence damage by 1d4","mods":{"damageDice":"1d10"}}],
    to: [{"ppCost":2,"text":"The cold damage increases by 1d10, and the essence damage by 1d4","mods":{"damageDice":"1d10","secondaryDice":"1d4"}}],
    reason: "\"and the essence damage by 1d4\" never reached the second pool."
  },
  {
    id: "unprepared-combatant-effects-3609", pack: "spells", name: "Unprepared Combatant",
    field: "effects", since: "3.609.0",
    from: [{"kind":"bonus","target":"targets","slot":"defence","bonusType":"circumstance","value":-2},{"kind":"note","text":"-2 circumstance to DB on a failure; on a fumble the penalty is -4 to DB and to Reflex saves."}],
    to: [{"kind":"bonus","target":"targets","slot":"defence","bonusType":"circumstance","value":-2,"onSave":["failure"]},{"kind":"bonus","target":"targets","slot":"defence","bonusType":"circumstance","value":-4,"onSave":["fumble"]},{"kind":"bonus","target":"targets","slot":"reflex","bonusType":"circumstance","value":-4,"onSave":["fumble"]}],
    reason: "One ungated -2 DB row served both Failure and Fumble; the Fumble prints -4 to DB and to Reflex saves."
  },
  {
    id: "unshakable-effects-3609", pack: "spells", name: "Unshakable",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"defence","target":"self","field":"immunity","value":"stunned"},{"kind":"note","text":"The +4 PP option (range touch, arcane only) is cast by hand on another creature."}],
    reason: "\"You are immune to the stunned condition\" had no row."
  },
  {
    id: "untamed-journey-effects-3609", pack: "spells", name: "Untamed Journey",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"terrainFreedom","target":"targets"},{"kind":"note","text":"With the +4 PP option the targets also ignore formidable terrain from the environment — by hand."}],
    reason: "Nothing happened: the targets ignore environmental Speed penalties and difficult terrain."
  },
  {
    id: "untamed-journey-warps-3609", pack: "spells", name: "Untamed Journey",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"the spell lasts until your next daily preparation","mods":{}},{"ppCost":4,"text":"the targets also ignore formidable terrain from environmental properties","mods":{}}],
    to: [{"ppCost":2,"text":"the spell lasts until your next daily preparation","mods":{"durationText":"until your next daily preparation"}},{"ppCost":4,"text":"the targets also ignore formidable terrain from environmental properties","mods":{}}],
    reason: "\"until your next daily preparation\" carried no duration."
  },
  {
    id: "unwelcome-halo-effects-3609", pack: "spells", name: "Unwelcome Halo",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"light","source":"unwelcome-halo","target":"targets","onSave":["success"],"duration":"1 round"},{"kind":"light","source":"unwelcome-halo","target":"targets","onSave":["failure","fumble"]},{"kind":"bonus","target":"targets","slot":"defence","bonusType":"circumstance","value":-2,"onSave":["fumble"]},{"kind":"note","onSave":["success"],"text":"Sheds light until the beginning of its next turn."}],
    reason: "The halo's light, already defined as a light source, was never placed; the Fumble's +2 to attacks against the target had no row."
  },
  {
    id: "vampiric-touch-effects-3609", pack: "spells", name: "Vampiric Touch",
    field: "effects", since: "3.609.0",
    from: [{"kind":"note","text":"You gain temporary HP equal to half the damage the target takes, lost after 1 minute — apply by hand; the tempHP effect rolls a formula and cannot yet read the damage actually dealt."}],
    to: [{"kind":"siphon","target":"self","share":0.5,"duration":"1 minute","label":"Vampiric Touch"}],
    reason: "The temporary HP equal to half the damage taken was applied by hand; it is counted by the save that dealt the damage now, and lost after a minute."
  },
  {
    id: "vampiric-touch-kindgate-3609", pack: "spells", name: "Vampiric Touch",
    field: "kindGate", since: "3.609.0",
    from: "",
    to: "living",
    reason: "\"Targets 1 living creature\": undead and constructs are not living, and nothing kept the spell off them."
  },
  {
    id: "vigour-effects-3609", pack: "spells", name: "Vigour",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"turnHeal","target":"targets","amount":2,"label":"Vigour"}],
    reason: "Nothing happened: 2 HP at the end of each of the target's turns."
  },
  {
    id: "vigour-kindgate-3609", pack: "spells", name: "Vigour",
    field: "kindGate", since: "3.609.0",
    from: "",
    to: "living",
    reason: "\"Targets 1 living creature\": undead and constructs are not living, and nothing kept the spell off them."
  },
  {
    id: "visage-of-horror-effects-3609", pack: "spells", name: "Visage Of Horror",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"horror","target":"targets"},{"kind":"note","text":"With the +2 PP option, a hostile action that strikes several warded creatures at once needs only one save — by hand."}],
    reason: "Nothing happened: the save is the attacker's, at the moment it moves against the warded creature, with frightened 2 and a wasted action on a Fumble."
  },
  {
    id: "vision-of-havoc-effects-3609", pack: "spells", name: "Vision Of Havoc",
    field: "effects", since: "3.609.1",
    from: [],
    to: [{"kind":"followUpSave","target":"targets","onSave":["fumble"],"save":"reflex","label":"Vision Of Havoc — trapped in the vision","rungs":{"success":[],"failure":[{"kind":"condition","condition":"stunned","value":1,"duration":"1 minute","hold":true,"conditionSave":{"save":"will","onSuccess":"end","label":"Vision Of Havoc"}}],"fumble":[{"kind":"condition","condition":"stunned","value":1,"duration":"1 minute","hold":true,"conditionSave":{"save":"will","onSuccess":"end","label":"Vision Of Havoc"}}]}},{"kind":"note","onSave":["fumble"],"text":"Believes it is trapped in a dire circumstance from the vision; a Will save at the end of each of its turns disbelieves it and ends the stun."}],
    alsoFrom: [[{"kind":"followUpSave","target":"targets","onSave":["fumble"],"save":"reflex","label":"Vision Of Havoc — trapped in the vision","rungs":{"success":[],"failure":[{"kind":"condition","condition":"stunned","value":1,"duration":"1 minute","conditionSave":{"save":"will","onSuccess":"end","label":"Vision Of Havoc"}}],"fumble":[{"kind":"condition","condition":"stunned","value":1,"duration":"1 minute","conditionSave":{"save":"will","onSuccess":"end","label":"Vision Of Havoc"}}]}},{"kind":"note","onSave":["fumble"],"text":"Believes it is trapped in a dire circumstance from the vision; a Will save at the end of each of its turns disbelieves it and ends the stun."}]],
    reason: "The Fumble's Reflex save, the minute's stun and the Will save each turn that ends it were prose. At 3.609.1 the stun is held at 1 for the minute rather than spent at the first turn, and a copy carrying the 3.609.0 rows is recognised through `alsoFrom`."
  },
  {
    id: "vital-beacon-warps-3609", pack: "spells", name: "Vital Beacon",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"the beacon restores an additional die of HP","mods":{}},{"ppCost":4,"text":"the beacon may also stop bleeding at a rate of 1 point per die of healing used","mods":{}}],
    to: [{"ppCost":2,"text":"the beacon restores an additional die of HP","mods":{"damageDice":"1d12"}},{"ppCost":4,"text":"the beacon may also stop bleeding at a rate of 1 point per die of healing used","mods":{"stopsBleeding":true}}],
    reason: "Both options carried no mod, so neither the extra die nor the bleed stopping reached the beacon."
  },
  {
    id: "voice-of-healing-warps-3609", pack: "spells", name: "Voice Of Healing",
    field: "warps", since: "3.609.0",
    from: [{"ppCost":2,"text":"ignore the injured condition","mods":{"suppressConditions":["injured"]}},{"ppCost":2,"text":"the amount of healing increases by 1d6+6","mods":{"damageDice":"1d6"}},{"ppCost":2,"text":"ignore a further -1 injury (max -5)","mods":{"suppressBump":1,"suppressMax":5}},{"ppCost":2,"text":"reduce a bleeding wound by 1","mods":{"bleedPoints":1}}],
    to: [{"ppCost":2,"text":"ignore the injured condition","mods":{"suppressConditions":["injured"]}},{"ppCost":2,"text":"the amount of healing increases by 1d6+6","mods":{"healDice":"1d6","healBonus":6}},{"ppCost":2,"text":"ignore a further -1 injury (max -5)","mods":{"suppressBump":1,"suppressMax":5}},{"ppCost":2,"text":"reduce a bleeding wound by 1","mods":{"bleedPoints":1}}],
    reason: "\"the amount of healing increases by 1d6+6\" was authored as +1d6, losing the six."
  },
  {
    id: "volcanic-inferno-effects-3609", pack: "spells", name: "Volcanic Inferno",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"saveLadder","target":"targets","ladder":{"critical":"","success":"half","failure":"full","fumble":"full"},"criticalOn":{"fumble":"minor"},"regardless":{"formula":"3d6","type":"fire","reachFeet":5}},{"kind":"condition","target":"targets","condition":"slowed","value":1,"onSave":["failure","fumble"],"escape":true},{"kind":"bonus","target":"targets","slot":"allSpeeds","bonusType":"circumstance","value":-10,"onSave":["failure","fumble"],"escape":true},{"kind":"note","onSave":["failure","fumble"],"text":"Encased in rock: Escape against the spell DC breaks free, or 50 damage to the rock (by hand)."},{"kind":"note","text":"A flying creature that is encased descends 20 feet, taking no falling damage — by hand."}],
    reason: "A Reflex save (not Basic) never rolls a spell's damage, so the 14d6 was dealt to nobody. Now the printed ladder, the 3d6 heat regardless of saves out to 5 feet, and the encasing rock an Escape against the spell DC breaks."
  },
  {
    id: "wail-of-the-banshee-effects-3609", pack: "spells", name: "Wail Of The Banshee",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"saveLadder","target":"targets","ladder":{"heroic":"","critical":"half","success":"full","failure":"full","fumble":"double","blunder":""},"criticalOn":{"failure":"serious","fumble":"deadly"},"slaysOn":["blunder"]}],
    reason: "A Fortitude save (not Basic) never rolls a spell's damage, so the 8d10 was dealt to nobody. The page prints six rungs: none, half, full, full and a serious critical, double and a deadly critical, death."
  },
  {
    id: "wail-of-the-banshee-kindgate-3609", pack: "spells", name: "Wail Of The Banshee",
    field: "kindGate", since: "3.609.0",
    from: "",
    to: "living",
    reason: "\"Each living foe\": undead and constructs are not living, and nothing kept the wail off them."
  },
  {
    id: "wake-effects-3609", pack: "spells", name: "Wake",
    field: "effects", since: "3.609.0",
    from: [],
    to: [{"kind":"wake","target":"targets"}],
    reason: "Nothing happened: a sleeping creature wakes."
  },
  {
    id: "wall-of-light-damage-3609", pack: "spells", name: "Wall Of Light",
    field: "damage", since: "3.609.0",
    from: {"formula":"2d8","type":"positive","persistent":""},
    to: {"formula":"2d8","type":"essence","persistent":""},
    reason: "\"positive\" is not one of the system's damage types; the page says essence."
  },
  {
    id: "wall-of-light-damagescope-3609", pack: "spells", name: "Wall Of Light",
    field: "damageScope", since: "3.609.0",
    from: "",
    to: "kinds:undead,ooze",
    reason: "\"Each undead and ooze\" — the essence damage reaches nobody else."
  },
  {
    id: "warp-mind-effects-3609", pack: "spells", name: "Warp Mind",
    field: "effects", since: "3.609.0",
    from: [{"kind":"condition","target":"targets","condition":"confused","onSave":["failure"],"duration":"1 minute"},{"kind":"condition","target":"targets","condition":"confused","onSave":["fumble"],"duration":"permanent"},{"kind":"note","onSave":["success"],"text":"Spends the first action of its next turn confused."},{"kind":"note","onSave":["failure"],"text":"Confused for 1 minute."},{"kind":"note","onSave":["fumble"],"text":"Confused PERMANENTLY."},{"kind":"note","text":"Whatever the result, the target is immune to this spell for 10 minutes."}],
    to: [{"kind":"condition","target":"targets","condition":"confused","onSave":["failure"],"duration":"1 minute"},{"kind":"condition","target":"targets","condition":"confused","onSave":["fumble"],"duration":"permanent"},{"kind":"note","onSave":["success"],"text":"Spends the first action of its next turn confused."},{"kind":"note","onSave":["failure"],"text":"Confused for 1 minute."},{"kind":"note","onSave":["fumble"],"text":"Confused PERMANENTLY."},{"kind":"tempImmunity","target":"targets","onSave":["heroic","critical","success","partial","failure","fumble","blunder"],"length":"10 minutes","label":"Warp Mind"}],
    reason: "\"Regardless of the outcome, the target becomes temporarily immune to the spell for 10 minutes\" was a note."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 33's WALLS AND STORM (3.610.0) — Graham's R9 of 1 October 2026.
   * Written from tools/block33-walls-plan.mjs; `from` read off the 3.609.2 pack.
   * ---------------------------------------------------------------- */
  {
    id: "storm-of-vengeance-damage-3610", pack: "spells", name: "Storm Of Vengeance",
    field: "damage", since: "3.610.0",
    from: {"formula":"4d8","type":"acid","persistent":""},
    to: {"formula":"","type":"","persistent":""},
    reason: "Acid Rain's 4d8 sat on the spell itself and was rolled against Thunderclap's save; each strike rolls its own now."
  },
  {
    id: "storm-of-vengeance-defence-3610", pack: "spells", name: "Storm Of Vengeance",
    field: "defence", since: "3.610.0",
    from: "Fortitude",
    to: "",
    reason: "The pack held a Fortitude save the spell does not have; each of the five strikes carries its own."
  },
  {
    id: "storm-of-vengeance-effects-3610", pack: "spells", name: "Storm Of Vengeance",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"storm","label":"Storm Of Vengeance","modes":[{"key":"acidRain","label":"Acid Rain","formula":"4d8","type":"acid"},{"key":"hail","label":"Hail","formula":"4d10","type":"bludgeoning","save":"fortitude","basic":true},{"key":"lightning","label":"Lightning","formula":"4d12","type":"electricity","save":"reflex","basic":true,"bolts":10},{"key":"rainWind","label":"Rain and Wind","terrain":true,"screen":true},{"key":"thunderclap","label":"Thunderclap","save":"fortitude","condition":"deafened","duration":"10 minutes","immunity":"1 hour"}]},{"kind":"note","text":"Gales: ranged weapon attacks in or through the storm take −4 (applied). The air is greater difficult terrain for flying creatures — by hand."}],
    reason: "None of the five strikes happened. Now one is chosen at the cast and at each Sustain, never the same twice in a row."
  },
  {
    id: "wall-of-blades-effects-3610", pack: "spells", name: "Wall Of Blades",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"2 inches","snap":"centre","crossing":true,"stopsOnFumble":true,"turn":"endOfTurn"},{"kind":"note","text":"The wall provides cover — by hand. A creature in the wall's space that succeeds at its save when the wall is created is pushed to the nearest space on the side of its choice — move it by hand."}],
    reason: "The wall carried no area, so nothing was placed and its 8d8 force was rolled once against whoever was targeted. Now a line placed anywhere in range: the save for those in its space, for each creature that moves into it (stopped on a Fumble), and for each that ends its turn in it."
  },
  {
    id: "wall-of-blades-warps-3610", pack: "spells", name: "Wall Of Blades",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}},{"ppCost":2,"text":"increase the damage by 1d8","mods":{"damageDice":"1d8"}}],
    to: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}},{"ppCost":2,"text":"increase the damage by 1d8","mods":{"damageDice":"1d8"}}],
    reason: "\"increase the length of the wall by 10 feet\" carried no mod; it lengthens the placed wall now."
  },
  {
    id: "wall-of-dispelling-effects-3610", pack: "spells", name: "Wall Of Dispelling",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":40,"height":20,"thickness":"2 inches","snap":"centre"},{"kind":"note","text":"An invisible wall: it counters spell effects that pass through it — by hand."}],
    reason: "The wall carried no area, so nothing was placed and the card said nothing of where it stood. Now a placed line; its countering is the table's."
  },
  {
    id: "wall-of-dispelling-warps-3610", pack: "spells", name: "Wall Of Dispelling",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}}],
    to: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}}],
    reason: "\"increase the length of the wall by 10 feet\" carried no mod; it lengthens the placed wall now."
  },
  {
    id: "wall-of-fire-effects-3610", pack: "spells", name: "Wall Of Fire",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"5 feet","snap":"centre","forms":["line","ring"],"ringRadius":10,"crossing":true,"turn":"startOfTurn","screen":true}],
    reason: "The wall carried no area, so nothing was placed and its 4d6 fire was rolled once at the cast, which the page does not do. Now a line or a ring: the save for crossing it or beginning a turn in it, and concealment through it."
  },
  {
    id: "wall-of-fire-warps-3610", pack: "spells", name: "Wall Of Fire",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}},{"ppCost":2,"text":"increase the radius of the ring by 5 feet","mods":{}},{"ppCost":2,"text":"the damage increases by 1d6","mods":{"damageDice":"1d6"}}],
    to: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}},{"ppCost":2,"text":"increase the radius of the ring by 5 feet","mods":{"wallRadius":5}},{"ppCost":2,"text":"the damage increases by 1d6","mods":{"damageDice":"1d6"}}],
    reason: "The length and ring-radius options carried no mod; they size the placed wall now."
  },
  {
    id: "wall-of-force-effects-3610", pack: "spells", name: "Wall Of Force",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"no discernible thickness","snap":"border","block":{"move":"normal","sight":"none","light":"none","sound":"none"},"unobstructed":true,"sections":{"size":0,"db":0,"hardness":30,"hp":60}},{"kind":"note","text":"Immune to critical hits and precision damage. Blocks incorporeal and ethereal creatures; teleportation and visual effects pass. Immune to counteracting of its level or lower; destroyed by a disintegrate spell of any level, a rod of cancellation or a sphere of annihilation — by hand."}],
    reason: "The wall carried no area, so nothing was placed and it blocked nothing. Now an invisible wall on the map that stops movement, refused if a creature stands in its path, with its HP and Hardness on the card."
  },
  {
    id: "wall-of-force-warps-3610", pack: "spells", name: "Wall Of Force",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":1,"text":"the HP of the wall increases by 5","mods":{"bonusValue":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}}],
    to: [{"ppCost":1,"text":"the HP of the wall increases by 5","mods":{"wallHp":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}}],
    reason: "The HP option was a bare bonus nothing read, and the length option carried no mod."
  },
  {
    id: "wall-of-ice-effects-3610", pack: "spells", name: "Wall Of Ice",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"1 foot","snap":"border","forms":["line","ring"],"ringRadius":10,"block":{"move":"normal","sight":"normal","light":"normal","sound":"normal"},"unobstructed":true,"sections":{"size":10,"db":0,"hardness":5,"hp":40}},{"kind":"note","text":"Immune to critical hits, cold and precision damage; weakness to fire. A section destroyed by fire melts away; one destroyed otherwise leaves chilling ice that is difficult terrain and deals 2d6 cold to a creature passing through it — by hand."}],
    reason: "The wall carried no area, so nothing was placed and it blocked nothing. Now an opaque line or ring on the map that stops movement and sight, refused if a creature stands in its path, with each section's HP on the card."
  },
  {
    id: "wall-of-ice-warps-3610", pack: "spells", name: "Wall Of Ice",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":2,"text":"the HP of each section increase by 5","mods":{"bonusValue":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}},{"ppCost":2,"text":"increase the radius of the ring by 5 feet","mods":{}},{"ppCost":4,"text":"the cold damage dealt to creatures crossing a destroyed section increases by 1d6","mods":{"damageDice":"1d6"}}],
    to: [{"ppCost":2,"text":"the HP of each section increase by 5","mods":{"wallHp":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}},{"ppCost":2,"text":"increase the radius of the ring by 5 feet","mods":{"wallRadius":5}},{"ppCost":4,"text":"the cold damage dealt to creatures crossing a destroyed section increases by 1d6","mods":{}}],
    reason: "The HP, length and ring-radius options carried no mod the wall could read."
  },
  {
    id: "wall-of-light-effects-3610", pack: "spells", name: "Wall Of Light",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"5 feet","snap":"centre","crossing":true},{"kind":"note","text":"Sight-based checks made through the light take −30 — by hand."}],
    reason: "The wall carried no area, so nothing was placed and its 2d8 essence was rolled against whoever was targeted. Now a line placed anywhere in range: the save for undead and oozes in it at the cast and for each that moves into it."
  },
  {
    id: "wall-of-light-warps-3610", pack: "spells", name: "Wall Of Light",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}},{"ppCost":2,"text":"increase the damage by 1d8","mods":{"damageDice":"1d8"}}],
    to: [{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}},{"ppCost":2,"text":"increase the damage by 1d8","mods":{"damageDice":"1d8"}}],
    reason: "\"increase the length of the wall by 10 feet\" carried no mod; it lengthens the placed wall now."
  },
  {
    id: "wall-of-stone-effects-3610", pack: "spells", name: "Wall Of Stone",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"1 inch","snap":"border","block":{"move":"normal","sight":"normal","light":"normal","sound":"normal"},"unobstructed":true,"sections":{"size":5,"db":0,"hardness":14,"hp":50}},{"kind":"note","text":"Immune to critical hits and precision damage. A destroyed section can be crossed, and its rubble is difficult terrain — by hand. A wall that is not vertical (a bridge, stairs) is drawn by hand."}],
    reason: "The wall carried no area, so nothing was placed and it blocked nothing. Now a wall along square edges that stops movement, sight, light and sound, refused if a creature stands in its path, with each section's HP on the card."
  },
  {
    id: "wall-of-stone-warps-3610", pack: "spells", name: "Wall Of Stone",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":2,"text":"the HP of each section increase by 5","mods":{"bonusValue":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}}],
    to: [{"ppCost":2,"text":"the HP of each section increase by 5","mods":{"wallHp":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}}],
    reason: "The HP and length options carried no mod the wall could read."
  },
  {
    id: "wall-of-thorns-effects-3610", pack: "spells", name: "Wall Of Thorns",
    field: "effects", since: "3.610.0",
    from: [{"kind":"hazard","target":"area","label":"Wall Of Thorns","damage":"2d8","damageType":"piercing"},{"kind":"note","text":"Each 5-foot section has DB 0, Hardness 5 and 20 HP, is immune to critical hits and precision damage, and gives cover to both sides. A destroyed section can be crossed freely — track section HP by hand."}],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"5 feet","snap":"centre","block":{"move":"none","sight":"limited","light":"none","sound":"none"},"unobstructed":true,"sections":{"size":5,"db":0,"hardness":5,"hp":20}},{"kind":"difficultTerrain","target":"area","label":"Wall Of Thorns"},{"kind":"hazard","target":"area","label":"Wall Of Thorns","damage":"2d8","damageType":"piercing"},{"kind":"note","text":"Both sides of the wall have cover from the other — by hand. It grows over one minute. A destroyed section can be crossed freely."}],
    reason: "The wall carried no area, so nothing was placed and its hazard row had no Region to live on. Now a placed line that is difficult terrain, bites 2d8 piercing for each space entered, and partly blocks sight."
  },
  {
    id: "wall-of-thorns-warps-3610", pack: "spells", name: "Wall Of Thorns",
    field: "warps", since: "3.610.0",
    from: [{"ppCost":2,"text":"the HP of each section increase by 5","mods":{"bonusValue":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{}},{"ppCost":2,"text":"the piercing damage dealt to creatures crossing a destroyed section increases by 1d8","mods":{"damageDice":"1d8"}}],
    to: [{"ppCost":2,"text":"the HP of each section increase by 5","mods":{"wallHp":5}},{"ppCost":2,"text":"increase the length of the wall by 10 feet or its height by 5 feet","mods":{"wallLength":10}},{"ppCost":2,"text":"the piercing damage dealt to creatures crossing a destroyed section increases by 1d8","mods":{}}],
    reason: "The HP and length options carried no mod the wall could read."
  },
  {
    id: "wall-of-wind-effects-3610", pack: "spells", name: "Wall Of Wind",
    field: "effects", since: "3.610.0",
    from: [],
    to: [{"kind":"wall","target":"area","length":20,"height":10,"thickness":"5 feet","snap":"centre","wind":true},{"kind":"difficultTerrain","target":"area","label":"Wall Of Wind"},{"kind":"note","text":"Gases, and creatures in gaseous form, cannot pass. A creature flying through it saves Fortitude: Critical moves normally; Success moves, the wall difficult terrain; Failure its movement stops; Fumble stopped and pushed 10 feet away — by hand."}],
    reason: "The wall carried no area, so nothing was placed and none of its effects happened. Now a placed line that is difficult terrain, turns arrows and bolts aside, and costs a thrown weapon -2."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 34 (3.611.0) — pages 341–350, Graham's rulings of 2 October 2026.
   * Written from tools/block34-plan.mjs; `from` read off the 3.610.1 pack.
   * ---------------------------------------------------------------- */
  {
    id: "animal-healing-effects-3611", pack: "spells", name: "Animal Healing",
    field: "effects", since: "3.611.0",
    from: [{"kind":"heal","target":"targets","formula":"2d6"},{"kind":"note","text":"Also reduces the animal's bleed by 1 (warpable to reduce dazed/weakened/injured)."}],
    to: [{"kind":"heal","target":"targets","formula":"2d6","bleedAlternative":1,"bleedAndHeal":true},{"kind":"conditionRelief","target":"targets","label":"Animal Healing","condition":"dazed","amount":1,"choices":["dazed","weakened"],"unlockedBy":"dazedOrWeakened"},{"kind":"conditionRelief","target":"targets","label":"Animal Healing","condition":"injured","amount":1,"unlockedBy":"injured"}],
    reason: "The bleed reduction was a note, and the dazed, weakened and injured warps had nothing to unlock."
  },
  {
    id: "animal-healing-kindgate-3611", pack: "spells", name: "Animal Healing",
    field: "kindGate", since: "3.611.0",
    from: null,
    to: "animal",
    reason: "\"Targets 1 willing living animal\" — it reached any creature."
  },
  {
    id: "animal-healing-warps-3611", pack: "spells", name: "Animal Healing",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":1,"text":"the amount of healing increases by 1d6","mods":{"damageDice":"1d6"}},{"ppCost":2,"text":"the amount bleeding reduced increases by 1","mods":{"bonusValue":1}},{"ppCost":2,"text":"reduce the dazed or weakened condition by 1","mods":{}},{"ppCost":3,"text":"reduce the injured condition by 1","mods":{}}],
    to: [{"ppCost":1,"text":"the amount of healing increases by 1d6","mods":{"damageDice":"1d6"}},{"ppCost":2,"text":"the amount bleeding reduced increases by 1","mods":{"bleedPoints":1}},{"ppCost":2,"text":"reduce the dazed or weakened condition by 1","mods":{"unlocks":["dazedOrWeakened"]}},{"ppCost":3,"text":"reduce the injured condition by 1","mods":{"unlocks":["injured"]}}],
    reason: "Three of its four warps bought nothing."
  },
  {
    id: "augment-conjuration-effects-3611", pack: "spells", name: "Augment Conjuration",
    field: "effects", since: "3.611.0",
    from: [{"kind":"bonus","target":"targets","slot":"defence","bonusType":"status","value":1},{"kind":"note","text":"The +1 status bonus also applies to all of the target's checks and DCs (warpable to +5)."}],
    to: [{"kind":"bonus","target":"targets","slot":"defence","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"attack","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"fortitude","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"reflex","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"will","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"allSkills","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"spellcraft","bonusType":"status","value":1},{"kind":"note","text":"The bonus also applies to the creature's DCs — by hand."}],
    reason: "Only DB was a row; the page says all checks, DCs and DB."
  },
  {
    id: "banish-fatigue-effects-3611", pack: "spells", name: "Banish Fatigue",
    field: "effects", since: "3.611.1",
    from: [{"kind":"suppress","target":"targets","condition":"fatigued","amount":1,"label":"Banish Fatigue"},{"kind":"note","text":"+4 PP removes the fatigue permanently rather than suppressing it — apply that by hand."}],
    to: [{"kind":"suppress","target":"targets","condition":"fatigued","amount":1,"label":"Banish Fatigue","supersededBy":"permanent"},{"kind":"conditionRelief","target":"targets","label":"Banish Fatigue","condition":"fatigued","amount":1,"unlockedBy":"permanent"}],
    alsoFrom: [[{"kind":"suppress","target":"targets","condition":"fatigued","amount":1,"label":"Banish Fatigue"},{"kind":"conditionRelief","target":"targets","label":"Banish Fatigue","condition":"fatigued","amount":1,"unlockedBy":"permanent"}]],
    reason: "Rewritten at 3.611.1 after the 3.611.0 drive; a copy carrying the 3.611.0 rows is recognised through `alsoFrom`. \"removes the fatigue permanently\" was a note."
  },
  {
    id: "banish-fatigue-warps-3611", pack: "spells", name: "Banish Fatigue",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":2,"text":"ignore an additional point of fatigue","mods":{"suppressBump":1}},{"ppCost":4,"text":"the spell removes the fatigue permanently","mods":{}}],
    to: [{"ppCost":2,"text":"ignore an additional point of fatigue","mods":{"suppressBump":1,"reliefBump":1}},{"ppCost":4,"text":"the spell removes the fatigue permanently","mods":{"unlocks":["permanent"]}}],
    reason: "The +4 PP option carried no mod."
  },
  {
    id: "battle-s-call-areatargeting-3611", pack: "spells", name: "Battle’s Call",
    field: "areaTargeting", since: "3.611.0",
    from: "all",
    to: "allies",
    reason: "\"Every ally within the area\" — the area reached foes too."
  },
  {
    id: "battle-s-call-effects-3611", pack: "spells", name: "Battle’s Call",
    field: "effects", since: "3.611.0",
    from: [{"kind":"tempHP","target":"targets","formula":"5"},{"kind":"note","text":"Trigger (rolling initiative): allies in the area also gain a +10 status bonus to their initiative roll."}],
    to: [{"kind":"tempHP","target":"targets","formula":"5"},{"kind":"bonus","target":"targets","slot":"initiative","bonusType":"status","value":10,"duration":"1 round"},{"kind":"note","text":"Cast as initiative is about to be rolled; roll it after the cast so the bonus is on the roll."}],
    reason: "The +10 initiative was a note. Now a bonus row."
  },
  {
    id: "battle-s-call-warps-3611", pack: "spells", name: "Battle’s Call",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":4,"text":"increase the bonus and HP by +5 (max +20)","mods":{"bonusValue":5,"bonusMax":20}}],
    to: [{"ppCost":4,"text":"increase the bonus and HP by +5 (max +20)","mods":{"bonusValue":5,"bonusMax":20,"tempHPBonus":5}}],
    reason: "\"increase the bonus and HP by +5\" reached neither the bonus nor the temporary HP."
  },
  {
    id: "charm-undead-effects-3611", pack: "spells", name: "Charm Undead",
    field: "effects", since: "3.611.0",
    from: [{"kind":"attitude","target":"targets","to":"friendly","onSave":["failure","fumble","blunder"]},{"kind":"note","text":"It can't take hostile actions against you, and the spell ends if you use hostile actions against it — both GM-adjudicated."}],
    to: [{"kind":"attitude","target":"targets","to":"friendly","onSave":["failure"]},{"kind":"attitude","target":"targets","to":"helpful","onSave":["fumble","blunder"]},{"kind":"note","text":"It can't take hostile actions against you, and any act that threatens it breaks the spell — both GM-adjudicated. A mindless undead gets no save and becomes your minion, commanded when you Sustain."}],
    reason: "Its Fumble made the target friendly; the page says helpful."
  },
  {
    id: "cloud-mind-effects-3611", pack: "spells", name: "Cloud Mind",
    field: "effects", since: "3.611.0",
    from: [{"kind":"note","text":"1d6 mental (Basic Will). On a fumbled save the target is also Dazed 1 until the end of its next turn."}],
    to: [{"kind":"condition","target":"targets","onSave":["fumble","blunder"],"condition":"dazed","value":1,"duration":"until the end of its next turn"}],
    reason: "The Fumble's dazed 1 was a note."
  },
  {
    id: "cloud-mind-warps-3611", pack: "spells", name: "Cloud Mind",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":2,"text":"Increase the damage by 1d6 (max 5d6) and Dazed by 1 (max 5)","mods":{"damageDice":"1d6"}}],
    to: [{"ppCost":2,"text":"Increase the damage by 1d6 (max 5d6) and Dazed by 1 (max 5)","mods":{"damageDice":"1d6","conditionBump":1,"conditionMax":5}}],
    reason: "\"and Dazed by 1 (max 5)\" carried no mod."
  },
  {
    id: "coercive-retribution-effects-3611", pack: "spells", name: "Coercive Retribution",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"note","onSave":["failure"],"text":"For the FIRST action on its next turn, it must use a single action to do as commanded."},{"kind":"note","onSave":["fumble"],"text":"It must use ALL its actions on its next turn to obey the command."},{"kind":"note","text":"The target can't Delay or take reactions until it has obeyed. Requirement: your most recent action dealt it damage — the table's call."}],
    reason: "\"the effects of the spell command\" — it had none."
  },
  {
    id: "death-s-defiance-apoptions-3611", pack: "spells", name: "Death’s Defiance",
    field: "apOptions", since: "3.611.0",
    from: [],
    to: [{"ap":1,"label":"1 AP — 1 living creature within 20 feet","range":"20 feet","area":"","targets":"1 living creature"},{"ap":2,"label":"2 AP — 2 living creatures within 20 feet","range":"20 feet","area":"","targets":"2 living creatures"},{"ap":3,"label":"3 AP — 3 living creatures within 20 feet","range":"20 feet","area":"","targets":"3 living creatures"}],
    reason: "It had none, so it was always cast for 1 AP; one creature per AP spent now."
  },
  {
    id: "death-s-defiance-area-3611", pack: "spells", name: "Death’s Defiance",
    field: "area", since: "3.611.0",
    from: "20-foot radius",
    to: "",
    reason: "It healed everyone in its radius; it targets one living creature per AP within 20 feet."
  },
  {
    id: "death-s-defiance-effects-3611", pack: "spells", name: "Death’s Defiance",
    field: "effects", since: "3.611.0",
    from: [{"kind":"heal","target":"targets","formula":"5d6"},{"kind":"note","text":"Spend 1–3 AP to heal that many creatures; a target pulled out of Dying by this healing doesn't gain the usual Fatigued."}],
    to: [{"kind":"heal","target":"targets","formula":"5d6","noDyingFatigue":true}],
    reason: "\"Coming back from dying due to this healing doesn't increase its Fatigued condition\" was a note."
  },
  {
    id: "death-s-defiance-kindgate-3611", pack: "spells", name: "Death’s Defiance",
    field: "kindGate", since: "3.611.0",
    from: null,
    to: "living",
    reason: "\"1 living creature per action\"."
  },
  {
    id: "death-s-defiance-modelabel-3611", pack: "spells", name: "Death’s Defiance",
    field: "modeLabel", since: "3.611.0",
    from: null,
    to: "Action Points",
    reason: "The title of the new 1–3 AP chooser (Graham's R7)."
  },
  {
    id: "death-s-defiance-modeprompt-3611", pack: "spells", name: "Death’s Defiance",
    field: "modePrompt", since: "3.611.0",
    from: null,
    to: "Death's Defiance heals one living creature within 20 feet for each AP you spend. Choose how to cast it:",
    reason: "The prompt of the new 1–3 AP chooser (Graham's R7)."
  },
  {
    id: "death-s-defiance-range-3611", pack: "spells", name: "Death’s Defiance",
    field: "range", since: "3.611.0",
    from: "",
    to: "20 feet",
    reason: "The 20-foot radius, as the reach of a targeted spell."
  },
  {
    id: "deflect-flame-duration-3611", pack: "spells", name: "Deflect Flame",
    field: "duration", since: "3.611.0",
    from: "",
    to: "until the end of the current turn",
    reason: "A reaction's resistance, until the end of the turn it was cast in (Graham's R3)."
  },
  {
    id: "deflect-flame-effects-3611", pack: "spells", name: "Deflect Flame",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"defence","target":"targets","field":"resistance","value":"fire"}],
    reason: "It had no rows; fire resistance on the target now (Graham's R3)."
  },
  {
    id: "destructive-roar-damage-3611", pack: "spells", name: "Destructive Roar",
    field: "damage", since: "3.611.0",
    from: {"formula":"1d8","type":"sonic","persistent":""},
    to: {"formula":"1d8","type":"sonic","persistent":"","upgrade":{"from":8,"to":12,"ask":"Have you dealt damage to an enemy earlier this turn with a Strike or a spell?","because":"damage already dealt to an enemy this turn"}},
    reason: "The d12 when the caster has already dealt damage this turn (Graham's R5: asked at the cast)."
  },
  {
    id: "devastating-might-effects-3611", pack: "spells", name: "Devastating Might",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"bonus","target":"targets","slot":"dr","bonusType":"status","value":-3},{"kind":"note","text":"The +6, +8 and +10 PP options (negating physical resistance except adamantine, all physical resistance, then all resistance) are applied at the table."}],
    reason: "It had no rows; DR -3 to everyone in the radius now."
  },
  {
    id: "devastating-might-warps-3611", pack: "spells", name: "Devastating Might",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":4,"text":"increase the amount you reduce by 1","mods":{}},{"ppCost":6,"text":"also negate physical resistance (except adamantine)","mods":{}},{"ppCost":8,"text":"also negate all physical resistance","mods":{}},{"ppCost":10,"text":"negate all resistance","mods":{}}],
    to: [{"ppCost":4,"text":"increase the amount you reduce by 1","mods":{"bonusValue":1}},{"ppCost":6,"text":"also negate physical resistance (except adamantine)","mods":{}},{"ppCost":8,"text":"also negate all physical resistance","mods":{}},{"ppCost":10,"text":"negate all resistance","mods":{}}],
    reason: "\"increase the amount you reduce by 1\" carried no mod."
  },
  {
    id: "element-ward-duration-3611", pack: "spells", name: "Element Ward",
    field: "duration", since: "3.611.0",
    from: "",
    to: "until the end of the current turn",
    reason: "A reaction's resistance, until the end of the turn it was cast in (Graham's R3)."
  },
  {
    id: "element-ward-effects-3611", pack: "spells", name: "Element Ward",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"defence","target":"self","field":"resistance","value":"fire","valueChoices":["acid","cold","electricity","fire"]}],
    reason: "It had no rows. Now a resistance of the type chosen at the cast."
  },
  {
    id: "element-ward-warps-3611", pack: "spells", name: "Element Ward",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":8,"text":"you instead gain immunity","mods":{}}],
    to: [{"ppCost":8,"text":"you instead gain immunity","mods":{"defenceField":"immunity"}}],
    reason: "\"you instead gain immunity\" carried no mod."
  },
  {
    id: "ember-of-devotion-effects-3611", pack: "spells", name: "Ember Of Devotion",
    field: "effects", since: "3.611.0",
    from: [{"kind":"bonus","target":"targets","slot":"will","bonusType":"status","value":1},{"kind":"note","text":"An aura (allies only) that also sheds dim light (+1 light level)."}],
    to: [{"kind":"bonus","target":"targets","slot":"will","bonusType":"status","value":1},{"kind":"light","source":"ember-of-devotion","target":"self"}],
    reason: "The +1 light level was a note; it is a light source on the caster now."
  },
  {
    id: "fluidity-effects-3611", pack: "spells", name: "Fluidity",
    field: "effects", since: "3.611.0",
    from: [{"kind":"bonus","target":"self","slot":"speed","bonusType":"status","value":5},{"kind":"note","text":"You ignore difficult terrain for the duration, and may Stride or Step as part of casting."}],
    to: [{"kind":"bonus","target":"self","slot":"speed","bonusType":"status","value":5},{"kind":"terrainFreedom","target":"self"},{"kind":"note","text":"You may Stride or Step as part of casting."}],
    reason: "\"ignore difficult terrain\" was a note."
  },
  {
    id: "guiding-stone-damage-3611", pack: "spells", name: "Guiding Stone",
    field: "damage", since: "3.611.0",
    from: {"formula":"2d6","type":"bludgeoning","persistent":""},
    to: {"formula":"2d6","type":"bludgeoning","persistent":"","addAbility":"strength"},
    reason: "\"plus your melee damage modifier\" — Strength (Graham's R10)."
  },
  {
    id: "gustborn-movement-effects-3611", pack: "spells", name: "Gustborn Movement",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"speedGrant","target":"self","key":"fly","feet":0,"orLand":true},{"kind":"note","text":"Still airborne when the spell ends, you drift down as Feather Fall. The +2 PP option (no difficult terrain flying against the wind) is applied at the table."}],
    reason: "It had no rows; a fly Speed equal to your Speed now."
  },
  {
    id: "haunting-miasma-effects-3611", pack: "spells", name: "Haunting Miasma",
    field: "effects", since: "3.611.0",
    from: [{"kind":"condition","target":"targets","condition":"frightened","value":1},{"kind":"note","text":"Enemies in the aura are frightened 1 and can't diminish the effect while inside."}],
    to: [{"kind":"condition","target":"targets","condition":"frightened","value":1,"floor":true}],
    reason: "\"incapable of diminishing the effect\" was a note; a floor holds it."
  },
  {
    id: "inspiration-warps-3611", pack: "spells", name: "Inspiration",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":2,"text":"you may use Inspiration to modify an attack check or a saving throw","mods":{}},{"ppCost":2,"text":"increase the die by one step (max d10)","mods":{}},{"ppCost":6,"text":"roll an additional die","mods":{}}],
    to: [{"ppCost":2,"text":"you may use Inspiration to modify an attack check or a saving throw","mods":{"heldChecks":["attack","save"]}},{"ppCost":2,"text":"increase the die by one step (max d10)","mods":{"heldDieStep":1,"heldDieFrom":"1d6"}},{"ppCost":6,"text":"roll an additional die","mods":{"heldDice":1}}],
    reason: "All three carried no mod: wider checks, a bigger die and a second die now."
  },
  {
    id: "inspire-courage-effects-3611", pack: "spells", name: "Inspire Courage",
    field: "effects", since: "3.611.0",
    from: [{"kind":"bonus","target":"targets","slot":"attack","bonusType":"status","value":1},{"kind":"note","text":"Also +1 status bonus to saves against fear effects."}],
    to: [{"kind":"bonus","target":"targets","slot":"attack","bonusType":"status","value":1},{"kind":"conditional","label":"Inspire Courage","target":"targets","grants":[{"kind":"modifier","value":1,"type":"status","label":"Inspire Courage","scope":"saving throws against fear effects","when":{"checkTypes":["save"],"traits":["fear"]},"auto":true}]}],
    reason: "\"and saves against fear effects\" was a note."
  },
  {
    id: "inspire-defence-effects-3611", pack: "spells", name: "Inspire Defence",
    field: "effects", since: "3.611.0",
    from: [{"kind":"bonus","target":"targets","slot":"defence","bonusType":"status","value":1},{"kind":"note","text":"The +1 status bonus also applies to all of the affected allies' saving throws."}],
    to: [{"kind":"bonus","target":"targets","slot":"defence","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"fortitude","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"reflex","bonusType":"status","value":1},{"kind":"bonus","target":"targets","slot":"will","bonusType":"status","value":1}],
    reason: "\"and saving throws\" was a note."
  },
  {
    id: "localised-quake-apoptions-3611", pack: "spells", name: "Localised Quake",
    field: "apOptions", since: "3.611.0",
    from: [],
    to: [{"ap":2,"label":"15-foot emanation","range":"","area":"15-foot emanation"},{"ap":2,"label":"15-foot cone","range":"","area":"15-foot cone"}],
    reason: "\"a 15-foot emanation or a 15-foot cone\" — the cone was never offered."
  },
  {
    id: "localised-quake-effects-3611", pack: "spells", name: "Localised Quake",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"note","text":"Only creatures standing on solid ground are affected — a flying creature is not."}],
    reason: "The solid-ground limit, said on the card."
  },
  {
    id: "localised-quake-modelabel-3611", pack: "spells", name: "Localised Quake",
    field: "modeLabel", since: "3.611.0",
    from: null,
    to: "Shape",
    reason: "The title of the new emanation-or-cone chooser."
  },
  {
    id: "localised-quake-modeprompt-3611", pack: "spells", name: "Localised Quake",
    field: "modePrompt", since: "3.611.0",
    from: null,
    to: "Localised Quake shakes a 15-foot emanation or a 15-foot cone. Choose the shape:",
    reason: "The prompt of the new emanation-or-cone chooser."
  },
  {
    id: "waves-of-fatigue-effects-3611", pack: "spells", name: "Waves Of Fatigue",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"condition","target":"targets","onSave":["success"],"condition":"fatigued","value":1,"duration":"1 round"},{"kind":"condition","target":"targets","onSave":["failure"],"condition":"fatigued","value":1,"duration":"1 minute"},{"kind":"condition","target":"targets","onSave":["fumble"],"condition":"fatigued","value":1},{"kind":"note","text":"Castings stack: a second casting and a failed save leaves two levels of fatigue."}],
    reason: "It had no rows. Now fatigued 1 for 1 round, for 1 minute, or until removed, by degree."
  },
  {
    id: "waves-of-fatigue-warps-3611", pack: "spells", name: "Waves Of Fatigue",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":2,"text":"increase the level of fatigue by 1 (max 5)","mods":{}}],
    to: [{"ppCost":2,"text":"increase the level of fatigue by 1 (max 5)","mods":{"conditionBump":1,"conditionMax":5}}],
    reason: "\"increase the level of fatigue by 1 (max 5)\" carried no mod."
  },
  {
    id: "windy-escape-duration-3611", pack: "spells", name: "Windy Escape",
    field: "duration", since: "3.611.0",
    from: "",
    to: "until the end of the current turn",
    reason: "A reaction's resistance, until the end of the turn it was cast in (Graham's R3)."
  },
  {
    id: "windy-escape-effects-3611", pack: "spells", name: "Windy Escape",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"defence","target":"self","field":"resistance","value":"mundane"}],
    reason: "It had no rows; resistance to non-magical damage now (Graham's R3)."
  },
  {
    id: "windy-escape-warps-3611", pack: "spells", name: "Windy Escape",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":4,"text":"the spell effects magical physical attacks","mods":{}}],
    to: [{"ppCost":4,"text":"the spell effects magical physical attacks","mods":{"defenceValue":"physical"}}],
    reason: "\"the spell effects magical physical attacks\" carried no mod."
  },
  {
    id: "wits-areachoice-3611", pack: "spells", name: "Wits",
    field: "areaChoice", since: "3.611.1",
    from: null,
    to: true,
    reason: "\"You may affect up to 6 targets in a 30-foot radius\" — the caster's choice, held to six by the warp (3.611.1)."
  },
  {
    id: "wits-effects-3611", pack: "spells", name: "Wits",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"bonus","target":"targets","chooseFrom":"mental","value":1,"bonusType":"status","label":"Wits"}],
    reason: "It had no rows. Now +1 to Intelligence, Wisdom or Charisma, chosen at the cast."
  },
  {
    id: "woeful-dread-effects-3611", pack: "spells", name: "Woeful Dread",
    field: "effects", since: "3.611.0",
    from: [],
    to: [{"kind":"criticalInjury","target":"targets","onSave":["success"],"damageType":"mental","modifier":-20},{"kind":"condition","target":"targets","onSave":["success"],"condition":"frightened","value":1},{"kind":"criticalInjury","target":"targets","onSave":["partial"],"damageType":"mental","modifier":-10},{"kind":"condition","target":"targets","onSave":["partial"],"condition":"frightened","value":2},{"kind":"criticalInjury","target":"targets","onSave":["failure"],"damageType":"mental"},{"kind":"condition","target":"targets","onSave":["failure"],"condition":"frightened","value":2},{"kind":"followUpSave","target":"targets","onSave":["fumble"],"save":"fortitude","label":"Woeful Dread — a fear that risks its life","rungs":{"success":[{"kind":"criticalInjury","damageType":"mental","modifier":10},{"kind":"condition","condition":"fleeing","duration":"until the end of its next turn"},{"kind":"condition","condition":"frightened","value":4}],"failure":{"slays":true}}},{"kind":"note","text":"Only the targeted creatures can perceive the apparitions. The +2 PP option (ignoring abilities that improve fear saves or lower the condition, but not fear immunity) is applied at the table."}],
    reason: "It had no rows, so a PP 18 fear spell printed \"apply by hand\". Now each rung's mental critical injury at its printed modifier and its frightened value, and the Fumble's Fortitude save that kills on a failure."
  },
  {
    id: "word-of-blinding-effects-3611", pack: "spells", name: "Word Of Blinding",
    field: "effects", since: "3.611.1",
    from: [{"kind":"condition","target":"targets","condition":"dazzled","onSave":["critical"],"duration":"1 round"},{"kind":"condition","target":"targets","condition":"dazzled","onSave":["success"],"duration":"1 minute"},{"kind":"condition","target":"targets","condition":"blinded","onSave":["failure"],"durationRoll":"1d4 minutes"},{"kind":"condition","target":"targets","condition":"blinded","onSave":["fumble"],"duration":"permanent"},{"kind":"note","onSave":["failure"],"text":"Blinded for 1d4 minutes."},{"kind":"note","onSave":["fumble"],"text":"Blinded PERMANENTLY."},{"kind":"note","text":"Once affected, the target is immune to this spell for 10 minutes."}],
    to: [{"kind":"condition","target":"targets","condition":"dazzled","onSave":["critical"],"duration":"1 round"},{"kind":"condition","target":"targets","condition":"dazzled","onSave":["success"],"duration":"1 minute"},{"kind":"condition","target":"targets","condition":"blinded","onSave":["failure"],"durationRoll":"1d4 minutes"},{"kind":"condition","target":"targets","condition":"blinded","onSave":["fumble"],"duration":"permanent"},{"kind":"tempImmunity","target":"targets","onSave":["critical","success","failure","fumble"],"length":"10 minutes","label":"Word Of Blinding"}],
    alsoFrom: [[{"kind":"condition","target":"targets","condition":"dazzled","onSave":["critical"],"duration":"1 round"},{"kind":"condition","target":"targets","condition":"dazzled","onSave":["success"],"duration":"1 minute"},{"kind":"condition","target":"targets","condition":"blinded","onSave":["failure"],"durationRoll":"1d4 minutes"},{"kind":"condition","target":"targets","condition":"blinded","onSave":["fumble"],"duration":"permanent"},{"kind":"tempImmunity","target":"targets","onSave":["heroic","critical","success","partial","failure","fumble","blunder"],"length":"10 minutes","label":"Word Of Blinding"}]],
    reason: "Rewritten at 3.611.1 after the 3.611.0 drive; a copy carrying the 3.611.0 rows is recognised through `alsoFrom`. The 10-minute immunity was a note, beside two notes repeating rows."
  },
  {
    id: "word-of-death-effects-3611", pack: "spells", name: "Word Of Death",
    field: "effects", since: "3.611.0",
    from: [{"kind":"flatLadder","label":"Word Of Death","target":"targets","damageType":"untyped","save":"Will","immuneSeconds":600,"ladder":{"critical":{"damage":20},"success":{"damage":50,"diesIfReducedToZero":true},"failure":{"diesAtOrBelow":100,"dropsTo":-10},"fumble":{"dies":true}}}],
    to: [{"kind":"flatLadder","label":"Word Of Death","target":"targets","damageType":"untyped","save":"Will","immuneSeconds":600,"ladder":{"critical":{"damage":20},"success":{"damage":50,"diesIfReducedToZero":true},"failure":{"diesAtOrBelow":100,"dropsTo":0},"fumble":{"dies":true}}}],
    reason: "Graham's R1: the 3.8.1 rulebook drops the creature to 0 HP, not -10."
  },
  {
    id: "word-of-distraction-effects-3611", pack: "spells", name: "Word Of Distraction",
    field: "effects", since: "3.611.0",
    from: [{"kind":"condition","target":"targets","condition":"flatFooted"}],
    to: [{"kind":"condition","target":"targets","condition":"flatFooted","duration":"until the end of its next turn"}],
    reason: "The flat-footed row had no duration, and nor has the spell, so it never ended. Now \"until the end of its next turn\"."
  },
  {
    id: "word-of-stunning-effects-3611", pack: "spells", name: "Word Of Stunning",
    field: "effects", since: "3.611.1",
    from: [{"kind":"note","text":"By degree (target then immune 10 min): stunned 1 (crit) / stunned 2 (success) / stunned 1 round (failure) / stunned 1d6 rounds (fumble)."}],
    to: [{"kind":"condition","target":"targets","onSave":["critical"],"condition":"stunned","value":1},{"kind":"condition","target":"targets","onSave":["success"],"condition":"stunned","value":2},{"kind":"condition","target":"targets","onSave":["failure"],"condition":"stunned","value":3},{"kind":"condition","target":"targets","onSave":["fumble"],"condition":"stunned","value":3,"hold":true,"durationRoll":"1d6 rounds"},{"kind":"tempImmunity","target":"targets","onSave":["critical","success","failure","fumble"],"length":"10 minutes","label":"Word Of Stunning"}],
    alsoFrom: [[{"kind":"condition","target":"targets","onSave":["critical"],"condition":"stunned","value":1},{"kind":"condition","target":"targets","onSave":["success"],"condition":"stunned","value":2},{"kind":"condition","target":"targets","onSave":["failure"],"condition":"stunned","value":3},{"kind":"condition","target":"targets","onSave":["fumble"],"condition":"stunned","value":3,"hold":true,"durationRoll":"1d6 rounds"},{"kind":"tempImmunity","target":"targets","onSave":["heroic","critical","success","partial","failure","fumble","blunder"],"length":"10 minutes","label":"Word Of Stunning"}]],
    reason: "Rewritten at 3.611.1 after the 3.611.0 drive; a copy carrying the 3.611.0 rows is recognised through `alsoFrom`. One note named all four rungs and applied none. Now stunned 1, stunned 2, a full turn stunned, and a held stun for 1d6 rounds, with the 10 minutes of immunity."
  },
  {
    id: "zealous-conviction-effects-3611", pack: "spells", name: "Zealous Conviction",
    field: "effects", since: "3.611.0",
    from: [{"kind":"tempHP","target":"targets","formula":"5"},{"kind":"bonus","target":"targets","slot":"will","bonusType":"status","value":2,"note":"(vs mental effects)"}],
    to: [{"kind":"tempHP","target":"targets","formula":"5"},{"kind":"conditional","label":"Zealous Conviction","target":"targets","ppBelow":14,"grants":[{"kind":"modifier","value":2,"type":"status","label":"Zealous Conviction","scope":"Will saves against mental effects","when":{"checkTypes":["save"],"subjects":["will"],"traits":["mental"]},"auto":true}]},{"kind":"conditional","label":"Zealous Conviction","target":"targets","ppAtLeast":14,"grants":[{"kind":"modifier","value":3,"type":"status","label":"Zealous Conviction","scope":"Will saves against mental effects (14 PP or more)","when":{"checkTypes":["save"],"subjects":["will"],"traits":["mental"]},"auto":true}]},{"kind":"note","text":"A target compelled by your command complies; at the end of each of its turns it can attempt a Will save to end the spell on itself — GM-adjudicated."}],
    reason: "The +2 to Will applied to every Will save; the page says against mental effects. And R2's +3 at 14 PP."
  },
  {
    id: "zealous-conviction-warps-3611", pack: "spells", name: "Zealous Conviction",
    field: "warps", since: "3.611.0",
    from: [{"ppCost":2,"text":"increase temporary HP by 1. PP 14: the status bonus increases to +15","mods":{}}],
    to: [{"ppCost":2,"text":"increase temporary HP by 1","mods":{"tempHPBonus":1}}],
    reason: "Both warps were one inert entry; \"+1 temporary HP\" now buys it, and the +3 is automatic at 14 PP."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 34, PART TWO (3.612.0) — Graham's R4, R6 and R8 of 2 October 2026.
   * Written from tools/block34b-plan.mjs; `from` read off the 3.611.1 pack.
   * ---------------------------------------------------------------- */
  {
    id: "elemental-fury-effects-3612", pack: "spells", name: "Elemental Fury",
    field: "effects", since: "3.612.0",
    from: [],
    to: [{"kind":"note","text":"Applied at the table: if your next action is to Cast a Spell from your wizard repertoire that is an invocation dealing acid, cold, electricity or fire damage, foes within 10 feet of you take 1 damage per PP of that spell, of its type (choose one if several), combined with that spell's damage against any foe both affect, before bonuses, penalties, resistance and weakness."}],
    reason: "It had no rows and printed \"apply by hand\" with nothing to apply; the card now says what the table applies (Graham's R8)."
  },
  {
    id: "false-arrogance-effects-3612", pack: "spells", name: "False Arrogance",
    field: "effects", since: "3.612.0",
    from: [],
    to: [{"kind":"marker","target":"targets","marker":"falseArrogance","onSave":["success"],"duration":"1 round"},{"kind":"marker","target":"targets","marker":"falseArrogance","onSave":["partial"],"duration":"1 minute"},{"kind":"marker","target":"targets","marker":"falseArrogance","onSave":["failure"],"duration":"10 minutes"},{"kind":"marker","target":"targets","marker":"falseArrogance","onSave":["fumble"],"duration":"24 hours"},{"kind":"tempImmunity","target":"targets","onSave":["critical","success","partial","failure","fumble"],"length":"24 hours","label":"False Arrogance"}],
    reason: "It had no rows. Now the penalty after each failed attack roll or skill check, lasting by degree, and 24 hours of immunity (Graham's R8)."
  },
  {
    id: "fateful-temptation-effects-3612", pack: "spells", name: "Fateful Temptation",
    field: "effects", since: "3.612.1",
    from: [],
    to: [{"kind": "note", "sheetCastOnly": true, "text": "Cast in answer to a saving throw: when you or an ally within 120 feet is about to roll one, the save offers Fateful Temptation before the dice — +2 status (+1 per warp, max +5), a Success becomes a Critical and a Failure a Fumble. Cast from here it has no save to answer."}],
    alsoFrom: [[{"kind":"note","text":"Cast in answer to a saving throw: when you or an ally within 120 feet is about to roll one, the save offers Fateful Temptation before the dice — +2 status (+1 per warp, max +5), a Success becomes a Critical and a Failure a Fumble. Cast from here it has no save to answer."}]],
    reason: "Rewritten at 3.612.1 after the 3.612.0 drive: its sheet-cast note is no longer printed on the reaction cast itself (G1); a copy carrying the 3.612.0 rows is recognised through `alsoFrom`. It had no rows, and nothing could cast it in answer to a save. It is offered inside the save now (Graham's R4); the row says so on a cast from the sheet."
  },
  {
    id: "inspire-heroics-effects-3612", pack: "spells", name: "Inspire Heroics",
    field: "effects", since: "3.612.0",
    from: [],
    to: [{"kind":"heldBonus","target":"targets","heldKind":"advantage","checkTypes":["skill"],"perRound":true,"label":"Inspire Heroics"}],
    reason: "It had no rows. Now one skill check each round with advantage, for you and the allies in the composition (Graham's R8)."
  },
  {
    id: "inspire-heroics-warps-3612", pack: "spells", name: "Inspire Heroics",
    field: "warps", since: "3.612.0",
    from: [{"ppCost":4,"text":"the spell may also be used with saving throws","mods":{}},{"ppCost":8,"text":"the spell may be used with saving throws & attack checks","mods":{}},{"ppCost":12,"text":"the spell may be used with any check","mods":{}}],
    to: [{"ppCost":4,"text":"the spell may also be used with saving throws","mods":{"heldChecks":["save"]}},{"ppCost":8,"text":"the spell may be used with saving throws & attack checks","mods":{"heldChecks":["save","attack"]}},{"ppCost":12,"text":"the spell may be used with any check","mods":{"heldChecks":["attack","save","skill","specialist","attribute","cast","spellcraft","initiative"]}}],
    reason: "All three warps carried no mod; they widen the advantage to saves, attacks, or any check."
  },
  {
    id: "lucky-break-effects-3612", pack: "spells", name: "Lucky Break",
    field: "effects", since: "3.612.1",
    from: [],
    to: [{"kind": "note", "sheetCastOnly": true, "text": "Cast in answer to your own failed save: when a save you roll is a Partial or a Failure, the save offers Lucky Break before its result is used — the save is rolled again and the second result stands, and you are then temporarily immune for 10 minutes. Cast from here it has no save to answer."}],
    alsoFrom: [[{"kind":"note","text":"Cast in answer to your own failed save: when a save you roll is a Partial or a Failure, the save offers Lucky Break before its result is used — the save is rolled again and the second result stands, and you are then temporarily immune for 10 minutes. Cast from here it has no save to answer."}]],
    reason: "Rewritten at 3.612.1 after the 3.612.0 drive: its sheet-cast note is no longer printed on the reaction cast itself (G1); a copy carrying the 3.612.0 rows is recognised through `alsoFrom`. It had no rows, and nothing could reroll a save. It is offered inside a failed save now (Graham's R4); the row says so on a cast from the sheet."
  },
  {
    id: "web-effects-3612", pack: "spells", name: "Web",
    field: "effects", since: "3.612.1",
    from: [],
    to: [{"kind": "difficultTerrain", "target": "area", "label": "Web"}, {"kind": "entryCheck", "target": "area", "label": "Web", "skills": ["athletics", "acrobatics"], "clearsWith": "athletics", "degrees": {"heroic": {"unaffected": true, "endsChecksThisTurn": true, "clears": true}, "critical": {"unaffected": true, "endsChecksThisTurn": true, "clears": true}, "success": {"unaffected": true, "clears": true}, "failure": {"text": "takes a −10-foot circumstance penalty to its Speeds until the start of its next turn", "rows": [{"kind": "bonus", "target": "targets", "slot": "allSpeeds", "bonusType": "circumstance", "value": -10, "duration": "until the start of its next turn"}]}, "fumble": {"text": "is immobilised until the start of its next turn, then takes a −10-foot circumstance penalty to its Speeds for 1 round", "rows": [{"kind": "condition", "target": "targets", "condition": "immobilised", "duration": "until the start of its next turn"}, {"kind": "bonus", "target": "targets", "slot": "allSpeeds", "bonusType": "circumstance", "value": -10, "duration": "2 rounds"}]}}}, {"kind": "note", "text": "Each space of the web has a DB of 10 and automatically fails saving throws. A single attack or effect dealing at least 5 slashing or 1 fire damage clears a space — remove it from the Region by hand. A creature that breaks free is no longer slowed by the web."}],
    alsoFrom: [[{"kind":"difficultTerrain","target":"area","label":"Web"},{"kind":"entryCheck","target":"area","label":"Web","skills":["athletics","acrobatics"],"clearsWith":"athletics","degrees":{"heroic":{"unaffected":true,"endsChecksThisTurn":true,"clears":true},"critical":{"unaffected":true,"endsChecksThisTurn":true,"clears":true},"success":{"unaffected":true,"clears":true},"failure":{"text":"takes a −10-foot circumstance penalty to its Speeds until the start of its next turn","rows":[{"kind":"bonus","target":"targets","slot":"allSpeeds","bonusType":"circumstance","value":-10,"duration":"until the start of its next turn","note":"webbed"}]},"fumble":{"text":"is immobilised until the start of its next turn, then takes a −10-foot circumstance penalty to its Speeds for 1 round","rows":[{"kind":"condition","target":"targets","condition":"immobilised","duration":"until the start of its next turn"},{"kind":"bonus","target":"targets","slot":"allSpeeds","bonusType":"circumstance","value":-10,"duration":"2 rounds","note":"webbed"}]}}},{"kind":"note","text":"Each space of the web has a DB of 10 and automatically fails saving throws. A single attack or effect dealing at least 5 slashing or 1 fire damage clears a space — remove it from the Region by hand. A creature that breaks free is no longer slowed by the web."}]],
    reason: "Rewritten at 3.612.1 after the 3.612.0 drive: the speed-penalty rows lost a stray \"webbed\" note word (G3); a copy carrying the 3.612.0 rows is recognised through `alsoFrom`. It had no rows: not difficult terrain, and no check on moving through it. Now both, with the four printed outcomes (Graham's R6)."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 35, PART ONE (3.613.0) — Graham's R1, R3, R5, R12, R13 and R14 of 2 October 2026, and the audit's no-ruling fixes.
   * Written from tools/block35-plan.mjs; `from` read off the 3.612.1 pack.
   * ---------------------------------------------------------------- */
  {
    id: "physical-boost-effects-3613", pack: "spells", name: "Physical Boost",
    field: "effects", since: "3.613.0",
    from: [{"kind":"heldBonus","target":"targets","label":"Physical Boost","value":1,"bonusType":"status","checkTypes":["attribute"],"subjects":["strength","dexterity","constitution"]}],
    to: [{"kind":"heldBonus","target":"targets","label":"Physical Boost","value":1,"bonusType":"status","checkTypes":["attribute","skill","specialist","save","attack","initiative"],"abilities":["strength","dexterity","constitution"]}],
    reason: "It reached attribute checks only. Now any check a Constitution, Strength or Dexterity score affects (Graham's R1)."
  },
  {
    id: "protector-s-sphere-area-3613", pack: "spells", name: "Protector’s Sphere",
    field: "area", since: "3.613.0",
    from: "15-foot radius",
    to: "15-foot emanation",
    reason: "\"A shielding aura radiates from you\": the 15-foot radius is centred on the caster, and recorded as the emanation it is so the resistance travels (Graham's R3)."
  },
  {
    id: "protector-s-sphere-effects-3613", pack: "spells", name: "Protector’s Sphere",
    field: "effects", since: "3.613.0",
    from: [],
    to: [{"kind":"defence","target":"targets","field":"resistance","value":"physical (adamantine)"}],
    reason: "It had no rows. Now physical (adamantine) resistance for you and every ally inside, held while inside (Graham's R3)."
  },
  {
    id: "protector-s-sphere-warps-3613", pack: "spells", name: "Protector’s Sphere",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":6,"text":"The resistance also applies against adamantine","mods":{}},{"ppCost":10,"text":"The resistance applies against all damage","mods":{}}],
    to: [{"ppCost":6,"text":"The resistance also applies against adamantine","mods":{"defenceValue":"physical"}},{"ppCost":10,"text":"The resistance applies against all damage","mods":{"defenceValue":"all damage"}}],
    reason: "Both warps carried no mod; they widen the resistance to adamantine, then to all damage."
  },
  {
    id: "purge-the-unlife-kindgate-3613", pack: "spells", name: "Purge The Unlife",
    field: "kindGate", since: "3.613.0",
    from: null,
    to: "undead",
    reason: "\"Each undead creature within the area\" — it burned the living too. Now gated to undead."
  },
  {
    id: "renewal-s-touch-warps-3613", pack: "spells", name: "Renewal’s Touch",
    field: "warps", since: "3.614.0",
    from: [{"ppCost":2,"text":"increase the healing by 1d8+8","mods":{"damageDice":"1d8"}},{"ppCost":2,"text":"target may reduce bleeding by an additional 1","mods":{}},{"ppCost":2,"text":"the target may also reduce the injured condition by 1 or the dazed and weakened conditions by 2","mods":{}},{"ppCost":2,"text":"reduce the fatigued condition (or another condition if you have used that option) by an additional 1","mods":{}},{"ppCost":4,"text":"the target may also reduce the soul drain condition by 5","mods":{}}],
    to: [{"ppCost":2,"text":"increase the healing by 1d8+8","mods":{"healDice":"1d8","healBonus":8}},{"ppCost":2,"text":"target may reduce bleeding by an additional 1","mods":{"bleedBump":1}},{"ppCost":2,"text":"the target may also reduce the injured condition by 1 or the dazed and weakened conditions by 2","mods":{"unlocks":["injuredOption"]}},{"ppCost":2,"text":"reduce the fatigued condition (or another condition if you have used that option) by an additional 1","mods":{"conditionBump":1}},{"ppCost":4,"text":"the target may also reduce the soul drain condition by 5","mods":{"unlocks":["soulDrainOption"]}}],
    alsoFrom: [[{"ppCost":2,"text":"increase the healing by 1d8+8","mods":{"healDice":"1d8","healBonus":8}},{"ppCost":2,"text":"target may reduce bleeding by an additional 1","mods":{}},{"ppCost":2,"text":"the target may also reduce the injured condition by 1 or the dazed and weakened conditions by 2","mods":{}},{"ppCost":2,"text":"reduce the fatigued condition (or another condition if you have used that option) by an additional 1","mods":{}},{"ppCost":4,"text":"the target may also reduce the soul drain condition by 5","mods":{}}]],
    reason: "Rewritten at 3.614.0 (Graham's R8): the other four warps feed the turn options now; a copy carrying the 3.613.0 warps is recognised through `alsoFrom`. \"+2 PP: increase the healing by 1d8+8\" added only the 1d8. The other four warps feed the turn options built at 3.614.0."
  },
  {
    id: "resilient-fortitude-duration-3613", pack: "spells", name: "Resilient Fortitude",
    field: "duration", since: "3.613.0",
    from: "",
    to: "until the end of the current turn",
    reason: "A reaction against one attack or effect: it lasts until the end of the current turn, as Element Ward does."
  },
  {
    id: "resilient-fortitude-effects-3613", pack: "spells", name: "Resilient Fortitude",
    field: "effects", since: "3.613.0",
    from: [],
    to: [{"kind":"defence","target":"self","field":"resistance","value":"all damage"},{"kind":"note","text":"The resistance is against the triggering attack or effect only — if something else damages you before the turn ends, remove it first."}],
    reason: "It had no rows. Now resistance against the triggering attack or effect."
  },
  {
    id: "resilient-fortitude-warps-3613", pack: "spells", name: "Resilient Fortitude",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":10,"text":"you instead gain immunity","mods":{}}],
    to: [{"ppCost":10,"text":"you instead gain immunity","mods":{"defenceField":"immunity"}}],
    reason: "The immunity warp carried no mod; it turns the resistance into immunity, as Element Ward's does."
  },
  {
    id: "shifting-form-apoptions-3613", pack: "spells", name: "Shifting Form",
    field: "apOptions", since: "3.613.0",
    from: [],
    to: [{"ap":1,"label":"+20-foot status bonus to your Speed","range":"","area":"","effects":[{"kind":"bonus","target":"self","slot":"speed","bonusType":"status","value":20}]},{"ap":1,"label":"A climb Speed equal to half your Speed","range":"","area":"","effects":[{"kind":"speedGrant","target":"self","key":"climb","feet":0,"orLand":true,"landFraction":0.5}]},{"ap":1,"label":"A swim Speed equal to half your Speed","range":"","area":"","effects":[{"kind":"speedGrant","target":"self","key":"swim","feet":0,"orLand":true,"landFraction":0.5}]},{"ap":1,"label":"Darkvision","range":"","area":"","effects":[{"kind":"grantAbility","target":"self","uuid":"Compendium.trg-prime.abilities.Item.vCbewmPdYNpHNnHl","label":"Darkvision"}]},{"ap":1,"label":"A pair of claws (1d6 slashing, agile, finesse)","range":"","area":"","effects":[{"kind":"grantAbility","target":"self","uuid":"Compendium.trg-prime.creature-attacks.Item.QlUfedrLQVBoECCY","label":"Claws (Shifting Form)","system":{"damage":"1d6","damageType":"slashing","traits":"Agile, Finesse","size":"medium","equipped":true}}]},{"ap":1,"label":"Scent","range":"","area":"","effects":[{"kind":"grantAbility","target":"self","uuid":"Compendium.trg-prime.abilities.Item.gnDD0w96yHR7sVNv","label":"Scent"}]}],
    reason: "The five abilities, one of which the cast grants: +20 ft Speed, a climb or swim Speed of half your Speed, darkvision, 1d6 slashing claws, or scent (Graham's R5)."
  },
  {
    id: "shifting-form-effects-3613", pack: "spells", name: "Shifting Form",
    field: "effects", since: "3.613.0",
    from: [],
    to: [{"kind":"note","text":"Choose one ability as you cast: +20 ft Speed, a climb or swim Speed of half your Speed, darkvision, a pair of claws, or scent."}],
    reason: "It had no rows. The ability is chosen as you cast (Graham's R5)."
  },
  {
    id: "shifting-form-modelabel-3613", pack: "spells", name: "Shifting Form",
    field: "modeLabel", since: "3.613.0",
    from: null,
    to: "Ability",
    reason: "The cast's chooser names what is being chosen (Graham's R5)."
  },
  {
    id: "shifting-form-modeprompt-3613", pack: "spells", name: "Shifting Form",
    field: "modePrompt", since: "3.613.0",
    from: null,
    to: "Shifting Form changes your form in a minor way. Choose the ability you gain:",
    reason: "The cast's chooser says what the choice is (Graham's R5)."
  },
  {
    id: "sickly-ray-effects-3613", pack: "spells", name: "Sickly Ray",
    field: "effects", since: "3.613.0",
    from: [{"kind":"condition","target":"targets","condition":"sickened","value":1},{"kind":"note","text":"Spell attack, no HP damage: on a hit the target is sickened 1; on a critical, sickened 2 and slowed 1 for as long as it stays sickened."}],
    to: [{"kind":"condition","target":"targets","condition":"sickened","value":1,"onAttack":["hit"]},{"kind":"condition","target":"targets","condition":"sickened","value":2,"onAttack":["critical"]},{"kind":"condition","target":"targets","condition":"slowed","value":1,"onAttack":["critical"],"endsWith":"sickened"}],
    reason: "A critical gave sickened 1; the Critical was a note. Now sickened 2 and slowed 1 for as long as it is sickened (Graham's R13)."
  },
  {
    id: "soothing-ballad-effects-3613", pack: "spells", name: "Soothing Ballad",
    field: "effects", since: "3.613.0",
    from: [{"kind":"heal","target":"targets","formula":"8d8"},{"kind":"note","text":"Also attempts to counteract fear and paralysis on the targets, and lowers one Injury's severity by 1 (once per injury)."}],
    to: [{"kind":"heal","target":"targets","formula":"8d8"},{"kind":"counteract","target":"targets","label":"Soothing Ballad","conditions":["frightened","fleeing","paralyzed"],"traits":["fear"]},{"kind":"note","text":"The spell also lowers the severity of one Injury on each target by 1 (only once per injury) — applied at the table."}],
    reason: "The counteracts against fear and paralysis were a note. Now a counteract row (Graham's R14); the injury stays at the table."
  },
  {
    id: "soothing-words-effects-3613", pack: "spells", name: "Soothing Words",
    field: "effects", since: "3.613.0",
    from: [{"kind":"bonus","target":"targets","slot":"will","bonusType":"status","value":1},{"kind":"note","text":"The bonus is +2 against emotion effects, and you may counteract one emotion effect on the target as you cast."}],
    to: [{"kind":"bonus","target":"targets","slot":"will","bonusType":"status","value":1},{"kind":"conditional","label":"Soothing Words","target":"targets","grants":[{"kind":"modifier","value":2,"type":"status","label":"Soothing Words","scope":"Will saves against emotion effects","when":{"checkTypes":["save"],"subjects":["will"],"traits":["emotion"]},"auto":true}]},{"kind":"counteract","target":"targets","label":"Soothing Words","conditions":["frightened","fleeing"],"traits":["emotion"],"limit":1}],
    reason: "The +2 against emotion effects and the counteract were a note. Now a conditional and a counteract of one emotion effect (Graham's R14)."
  },
  {
    id: "spoil-the-profane-warps-3613", pack: "spells", name: "Spoil The Profane",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":2,"text":"increase secondary damage by 1d6 (max 5d6)","mods":{"damageDice":"1d6"}},{"ppCost":3,"text":"increase the weakened by 1 (max +5)","mods":{}}],
    to: [{"ppCost":2,"text":"increase secondary damage by 1d6 (max 5d6)","mods":{"damageDice":"1d6"}},{"ppCost":3,"text":"increase the weakened by 1 (max +5)","mods":{"conditionBump":1,"conditionMax":5}}],
    reason: "\"Increase the weakened by 1 (max +5)\" carried no mod."
  },
  {
    id: "stasis-effects-3613", pack: "spells", name: "Stasis",
    field: "effects", since: "3.614.0",
    from: [],
    to: [{"kind":"condition","target":"targets","condition":"stunned","value":1,"onSave":["success"]},{"kind":"stasis","target":"targets","label":"Stasis","onSave":["failure"],"rounds":1},{"kind":"stasis","target":"targets","label":"Stasis","onSave":["fumble"],"rounds":3,"saveEachTurn":true},{"kind":"note","text":"An inanimate object that is unattended automatically fumbles its save — the table applies it."}],
    alsoFrom: [[{"kind":"condition","target":"targets","condition":"stunned","value":1,"onSave":["success"]},{"kind":"note","onSave":["failure"],"text":"Stasis for 1 round: impervious to all damage, cannot be targeted, no rounds pass for its timed effects, and immovable — applied at the table until 3.614.0."},{"kind":"note","onSave":["fumble"],"text":"Stasis for 3 rounds: as a Failure, and at the end of each of its turns a new Will save reduces the remaining duration by 1 round, or ends it on a Critical — applied at the table until 3.614.0."}]],
    reason: "Rewritten at 3.614.0 (Graham's R2): the Failure and Fumble are stasis rows now, not notes; a copy carrying the 3.613.0 rows is recognised through `alsoFrom`. It had no rows. The Success rung (stunned 1) is a row now; the stasis itself is printed on the card until 3.614.0."
  },
  {
    id: "surge-of-the-tempest-effects-3613", pack: "spells", name: "Surge Of The Tempest",
    field: "effects", since: "3.613.0",
    from: [{"kind":"condition","target":"targets","condition":"dazzled","onSave":["fumble"],"duration":"1 round"},{"kind":"note","text":"On a fumble the target also takes 1 persistent electricity damage (+1 per 2 PP warped) — apply by hand."}],
    to: [{"kind":"condition","target":"targets","condition":"dazzled","onSave":["fumble"],"duration":"1 round"},{"kind":"condition","target":"targets","condition":"recurring","value":1,"damageType":"electricity","onSave":["fumble"]}],
    reason: "The Fumble's recurring electricity damage was a note \"apply by hand\". It is a recurring condition row now."
  },
  {
    id: "surge-of-the-tempest-warps-3613", pack: "spells", name: "Surge Of The Tempest",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":2,"text":"The initial damage increases by 1d12, and the persistent electricity damage on a fumble increases by 1","mods":{"damageDice":"1d12","persistent":1}}],
    to: [{"ppCost":2,"text":"The initial damage increases by 1d12, and the recurring electricity damage on a fumble increases by 1","mods":{"damageDice":"1d12","conditionBump":1}}],
    reason: "The warp's \"+1 recurring\" was a mod nothing read. It grows the recurring condition now."
  },
  {
    id: "talon-strike-warps-3613", pack: "spells", name: "Talon Strike",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":4,"text":"increase the secondary damage to 2d6","mods":{}}],
    to: [{"ppCost":4,"text":"increase the secondary damage to 2d6","mods":{"damageDice":"1d6","once":true}}],
    reason: "\"Increase the secondary damage to 2d6\" carried no mod. It does now, once."
  },
  {
    id: "unliving-vitality-beneficial-3613", pack: "spells", name: "Unliving Vitality",
    field: "beneficial", since: "3.613.0",
    from: null,
    to: true,
    reason: "A beneficial undead-keyed spell, so Alignment Channel does not widen it."
  },
  {
    id: "unliving-vitality-effects-3613", pack: "spells", name: "Unliving Vitality",
    field: "effects", since: "3.613.0",
    from: [{"kind":"note","text":"The undead target gains fast healing 5 for the duration (warpable to fast healing 10)."}],
    to: [{"kind":"healingRate","target":"targets","rate":"fastHealing","value":5,"label":"Unliving Vitality"}],
    reason: "Its fast healing 5 was a note. It is granted now, through the healing rate Metabolism uses."
  },
  {
    id: "unliving-vitality-kindgate-3613", pack: "spells", name: "Unliving Vitality",
    field: "kindGate", since: "3.613.0",
    from: null,
    to: "undead",
    reason: "\"1 willing undead creature\" — it reached the living too."
  },
  {
    id: "unliving-vitality-warps-3613", pack: "spells", name: "Unliving Vitality",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":1,"text":"The fast healing increases by 1 (max 10)","mods":{"bonusValue":1,"bonusMax":10}}],
    to: [{"ppCost":1,"text":"The fast healing increases by 1 (max 10)","mods":{"healingRateBump":1,"healingRateMax":10}}],
    reason: "The warp raised a bonus the spell does not have; it raises the fast healing now (max 10)."
  },
  {
    id: "veiled-secret-effects-3613", pack: "spells", name: "Veiled Secret",
    field: "effects", since: "3.613.0",
    from: [],
    to: [{"kind":"conditional","label":"Veiled Secret","target":"targets","grants":[{"kind":"modifier","value":4,"type":"status","label":"Veiled Secret","scope":"skill checks to conceal the secret","when":{"checkTypes":["skill"]}},{"kind":"modifier","value":4,"type":"status","label":"Veiled Secret","scope":"saves against spells or effects that aim to extract or coerce the secret","when":{"checkTypes":["save"]}}]},{"kind":"note","text":"Only those who know the chosen secret benefit. Casting it again ends any previous Veiled Secret of yours."}],
    reason: "It had no rows. Now the +4 to concealing skill checks and to saves against extraction, offered rather than automatic."
  },
  {
    id: "vibrant-thorns-effects-3613", pack: "spells", name: "Vibrant Thorns",
    field: "effects", since: "3.613.0",
    from: [{"kind":"thorns","target":"self","label":"Vibrant Thorns","damage":"1","intensified":"1d6","damageType":"piercing","reachFeet":5},{"kind":"note","text":"+4 PP: the damage increases by 1, or to 1d6 after you cast an essence spell — warped by hand."}],
    to: [{"kind":"thorns","target":"self","label":"Vibrant Thorns","damage":"1","intensified":"1d6","damageType":"piercing","reachFeet":5,"warpStep":{"damage":1,"intensified":"1d6"}}],
    reason: "The +4 PP warp was \"warped by hand\". The thorns grow with it now; the note is gone."
  },
  {
    id: "vibrant-thorns-warps-3613", pack: "spells", name: "Vibrant Thorns",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":4,"text":"The damage increases by 1, or 1d6 after you cast a positive spell","mods":{"bonusValue":1}}],
    to: [{"ppCost":4,"text":"The damage increases by 1, or 1d6 after you cast an essence spell","mods":{"bonusValue":1}}],
    reason: "The warp read \"positive spell\" where the page says essence."
  },
  {
    id: "wash-away-sin-effects-3613", pack: "spells", name: "Wash Away Sin",
    field: "effects", since: "3.613.0",
    from: [{"kind":"heal","target":"allies","formula":"1d8"},{"kind":"note","text":"Cone: allies heal 1d8 and gain +1 status to saves vs fear & disease until your next turn; creatures with an opposed aura instead take 1d8 essence."}],
    to: [{"kind":"heal","target":"allies","formula":"1d8"},{"kind":"conditional","label":"Wash Away Sin","target":"allies","duration":"until the start of your next turn","grants":[{"kind":"modifier","value":1,"type":"status","label":"Wash Away Sin","scope":"saves against fear and disease","when":{"checkTypes":["save"],"traits":["fear","disease"]},"auto":true}]}],
    reason: "The allies' +1 to saves against fear and disease was a note. Now a conditional until the start of your next turn."
  },
  {
    id: "wash-away-sin-warps-3613", pack: "spells", name: "Wash Away Sin",
    field: "warps", since: "3.613.0",
    from: [{"ppCost":2,"text":"increase both the healing and damage by 1 die","mods":{}},{"ppCost":4,"text":"cone increases to 30-feet","mods":{"areaOverride":"30-foot cone"}}],
    to: [{"ppCost":2,"text":"increase both the healing and damage by 1 die","mods":{"damageDice":"1d8"}},{"ppCost":4,"text":"cone increases to 30-feet","mods":{"areaOverride":"30-foot cone"}}],
    reason: "\"Increase both the healing and damage by 1 die\" carried no mod."
  },
  {
    id: "weapon-surge-duration-3613", pack: "spells", name: "Weapon Surge",
    field: "duration", since: "3.613.0",
    from: "",
    to: "until the start of your next turn",
    reason: "\"On your next Strike with that weapon before the start of your next turn\": it had no duration."
  },
  {
    id: "weapon-surge-effects-3613", pack: "spells", name: "Weapon Surge",
    field: "effects", since: "3.613.0",
    from: [{"kind":"heldBonus","target":"self","label":"Weapon Surge","value":1,"bonusType":"status","checkTypes":["attack"]}],
    to: [{"kind":"heldBonus","target":"self","label":"Weapon Surge","value":1,"bonusType":"status","checkTypes":["attack"]},{"kind":"strikeRider","target":"self","label":"Weapon Surge","weaponDie":true,"scope":"any","once":true,"weaponScoped":true},{"kind":"note","text":"If the weapon leaves your possession, Weapon Surge ends — remove it."}],
    reason: "The additional die of damage was missing. It is one more of the weapon's own dice on the next Strike (Graham's R12)."
  },
  {
    id: "wizard-strike-effects-3613", pack: "spells", name: "Wizard Strike",
    field: "effects", since: "3.613.0",
    from: [{"kind":"heldBonus","target":"self","label":"Wizard Strike","value":1,"bonusType":"status","checkTypes":["attack"]}],
    to: [{"kind":"heldBonus","target":"self","label":"Wizard Strike","heldKind":"advantage","checkTypes":["attack"]}],
    reason: "It held a +1 status bonus; the page says the attack gains advantage."
  },
  /* ---------------------------------------------------------------- *
   * BLOCK 35, PART TWO (3.614.0) — Graham's R2, R6–R11 and R15 of 2 October 2026.
   * Written from tools/block35b-plan.mjs; `from` read off the 3.613.0 pack.
   * ---------------------------------------------------------------- */
  {
    id: "nature-s-bounty-duration-3614", pack: "spells", name: "Nature’s Bounty",
    field: "duration", since: "3.614.0",
    from: "",
    to: "1 minute",
    reason: "\"If the food remains uneaten, it deteriorates and disintegrates into dust after 1 minute\": the minute the conjured fruit keeps."
  },
  {
    id: "nature-s-bounty-effects-3614", pack: "spells", name: "Nature’s Bounty",
    field: "effects", since: "3.614.0",
    from: [{"kind":"note","text":"Conjures food in your free hand; eating it (1 AP Interact) restores 3d10+12 HP and a meal's nourishment. Disintegrates after 1 minute if uneaten."}],
    to: [{"kind":"conjureItem","label":"Nature’s Bounty","target":"self","pack":"consumables","itemName":"Bountiful Fruit","quantity":1,"healOnUse":"3d10 + 12"},{"kind":"note","text":"You choose the fruit or vegetable. Whoever eats it (1 AP, Interact) regains the HP and the nourishment of a meal; hand it over to let someone else eat it."}],
    reason: "Its food was a note. It conjures a Bountiful Fruit now, which heals 3d10+12 when eaten, warped by the +2 PP option (Graham's R10)."
  },
  {
    id: "precious-metals-effects-3614", pack: "spells", name: "Precious Metals",
    field: "effects", since: "3.614.0",
    from: [],
    to: [{"kind":"materialShift","target":"self","label":"Precious Metals"},{"kind":"note","text":"Chosen from your own metal weapons, armour and shields. Ammunition and loose metal (up to 1 bulk) change at the table."}],
    reason: "It had no rows. It changes the chosen item's metal for the minute now, and puts it back (Graham's R11)."
  },
  {
    id: "precious-metals-warps-3614", pack: "spells", name: "Precious Metals",
    field: "warps", since: "3.614.0",
    from: [{"ppCost":8,"text":": Add adamantine, Eaog and mithril to the list of metals you can transform the item into","mods":{}}],
    to: [{"ppCost":8,"text":": Add adamantine, Eaog and mithril to the list of metals you can transform the item into","mods":{"unlocks":["preciousMetals"]}}],
    reason: "The +8 PP warp carried no mod; it adds adamantine, Eaog and mithril to the choice."
  },
  {
    id: "renewal-s-touch-effects-3614", pack: "spells", name: "Renewal’s Touch",
    field: "effects", since: "3.614.0",
    from: [{"kind":"heal","target":"targets","formula":"2d8 + 16"},{"kind":"note","text":"Each of the target's turns it may spend 2 AP to heal 1d8+8, stop 1 bleed, reduce fatigue by 1, or ignore fumble/blunder on a recovery check."}],
    to: [{"kind":"heal","target":"targets","formula":"2d8 + 16"},{"kind":"turnOptions","target":"targets","label":"Renewal’s Touch","apCost":2,"heal":"1d8 + 8","bleed":1,"reduce":{"fatigued":1},"recovery":true,"unlockable":{"injuredOption":{"injured":1,"dazed":2,"weakened":2},"soulDrainOption":{"soulDrain":5}}}],
    reason: "Its turn options were a note. They are a card at the start of each of the target's turns now, 2 AP for one (Graham's R8)."
  },
  {
    id: "unity-effects-3614", pack: "spells", name: "Unity",
    field: "effects", since: "3.614.0",
    from: [],
    to: [{"kind":"note","sheetCastOnly":true,"text":"Cast in answer to a saving throw: when you and allies within 30 feet are made to save against the same spell or ability, an ally's save offers Unity before the dice, and each ally may then use your save modifier instead of its own. Cast from here it has no save to answer."}],
    reason: "It had no rows, and nothing could cast it in answer to a save. It is offered inside an ally's save now (Graham's R6); the row says so on a cast from the sheet."
  },
  {
    id: "wellspring-of-valour-effects-3614", pack: "spells", name: "Wellspring Of Valour",
    field: "effects", since: "3.614.0",
    from: [{"kind":"bonus","target":"targets","slot":"attack","bonusType":"status","value":1,"opposedAura":true},{"kind":"note","text":"Whenever an ally in the aura first takes damage each round, they regain 1d6 HP — apply by hand; the on-damage trigger is not yet automated."}],
    to: [{"kind":"bonus","target":"targets","slot":"attack","bonusType":"status","value":1,"opposedAura":true},{"kind":"damageHeal","target":"targets","label":"Wellspring Of Valour","dice":"1d6"}],
    reason: "The heal on first taking damage each round was a note \"not yet automated\". It is automated now, for each ally in the aura (Graham's R9)."
  },
  {
    id: "wild-morph-warps-3614", pack: "spells", name: "Wild Morph",
    field: "warps", since: "3.614.0",
    from: [{"ppCost":2,"text":"You gain an additional natural attack form (max 3)","mods":{"morphForms":1}},{"ppCost":2,"text":"You instead gain a movement type from one of your Studied Targets","mods":{}},{"ppCost":4,"text":"instead gain special ability from one of your Studied Targets","mods":{}}],
    to: [{"ppCost":2,"text":"You gain an additional natural attack form (max 3)","mods":{"morphForms":1}},{"ppCost":2,"text":"You instead gain a movement type from one of your Studied Targets","mods":{"morphMovement":true}},{"ppCost":4,"text":"instead gain special ability from one of your Studied Targets","mods":{"morphAbility":true}}],
    reason: "The two \"instead\" warps carried no mod. The movement type is granted from the studied target now; the special ability is said on the card for the GM (Graham's R15)."
  },
  {
    id: "zealous-battlecry-effects-3614", pack: "spells", name: "Zealous Battlecry",
    field: "effects", since: "3.614.0",
    from: [],
    to: [{"kind":"note","sheetCastOnly":true,"text":"Cast as initiative is rolled: when you and an ally within 10 feet are about to roll, your initiative roll offers Zealous Battlecry, and both of you then use the higher d100. Cast from here there is no initiative to answer."}],
    reason: "It had no rows. It is offered as initiative is rolled now, and both use the higher d100 (Graham's R7); the row says so on a cast from the sheet."
  },
  {
    id: "air-drake-armour-runes-3615", pack: "specific-items", name: "Air Drake Armour",
    field: "runes", since: "3.616.0",
    from: "Potency II",
    // THE 3.615.0 VALUE, recognised too: at 3.616.0 the armour's Fly joined
    // its runes (R11 of block 36).
    alsoFrom: ["Potency II, Energy Resistance I (electricity)"],
    to: "Potency II, Energy Resistance I (electricity), Spell Effect (Fly, At Will)",
    reason: "Its printed \"Electricity Resistance\" was not in its runes, so it resisted nothing (block 36, B1); and its at-will Fly, with a 10-minute rest, was description only (R11)."
  },
  {
    id: "diplomat-armour-coverstorso-3615", pack: "specific-items", name: "Diplomat Armour",
    field: "coversTorso", since: "3.615.0",
    from: false,
    to: true,
    reason: "Reinforced leather that covered nothing: a critical to the chest ignored it (block 36, A11)."
  },
  {
    id: "quick-plate-coverstorso-3615", pack: "specific-items", name: "Quick Plate",
    field: "coversTorso", since: "3.615.0",
    from: false,
    to: true,
    reason: "A breastplate that covered nothing: a critical to the chest ignored it (block 36, A11)."
  },
  {
    id: "quick-plate-runes-3615", pack: "specific-items", name: "Quick Plate",
    field: "runes", since: "3.615.0",
    from: "Potency I",
    to: "Potency I, Spell Effect (Haste, 1/day)",
    reason: "Its Haste, 1/day for a minute, was description only. It is a 1/day innate spell while worn now (block 36, B2)."
  },
  /* ---------------------------------------------------------------- *
   * RODS, STAVES AND WANDS ARE HELD IN ONE HAND (3.616.0, O1 of the
   * 3.615.0 drive; Graham, 3 October 2026: "Yes staves and wands should
   * be held in one hand"). The page prints "Usage held in 1 hand". The
   * compendium has carried 1 for a while; the copies on the drive's rig
   * carried 0, so a staff took no hand at all and a wizard could hold a
   * staff, a shield and a sword together. One entry per item, because an
   * entry is matched by name.
   * ---------------------------------------------------------------- */
  ...["Animal Staff", "Rod of Accuracy", "Rod of Alertness", "Rod of Extension I", "Rod of Extension II", "Rod of Extension III", "Rod of Quickening I", "Rod of the Magi", "Sceptre of the Clergy", "Shock Staff", "Staff of Cure", "Staff of Fire", "Staff of Healing", "Staff of Imagery", "Staff of Salinor Alshar", "Staff of the Coast Runner", "Verdant Staff", "Versarians Sight", "Wand of Acid Arrow", "Wand of Burning Hands", "Wand of Charm Kind", "Wand of Confusion", "Wand of Cure", "Wand of Darkvision - Flexible", "Wand of Magic Missile"].map((name) => ({
    id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heldhands-3616`,
    pack: "charged-items", name,
    field: "heldHands", since: "3.616.0",
    from: 0,
    to: 1,
    reason: "\"Usage held in 1 hand\": an owned copy at 0 occupied no hand, so it never competed with a shield or a weapon (block 36, O1)."
  })),
  /* ---------------------------------------------------------------- *
   * BLOCK 37 (3.617.0) — consumables and wondrous items.
   * ---------------------------------------------------------------- */
  {
    id: "potion-of-flying-activation-3617", pack: "consumables", name: "Potion of Flying",
    field: "activation", since: "3.617.0",
    from: "Engage (2 AP)",
    to: "Interact (2 AP)",
    reason: "Every other potion is Interact (2 AP); Graham's R6 of block 37 reads Flying's \"Engage\" as the same."
  },
  {
    id: "water-breathing-effects-3617", pack: "spells", name: "Water Breathing",
    field: "effects", since: "3.617.0",
    from: [],
    to: [{ kind: "marker", target: "targets", marker: "waterBreathing" }],
    reason: "\"The targets can breathe water freely\" did nothing: the drowning clock still started for the caster's targets and for a drinker of the potion (block 37, B5)."
  },
  {
    id: "faiths-eye-slot-3617", pack: "wondrous", name: "Faith’s Eye",
    field: "slot", since: "3.617.0",
    from: "",
    to: "neck",
    reason: "\"This golden amulet\" had no slot at all (block 37, A14)."
  },
  /* ---------------------------------------------------------------- *
   * MAGE ARMOUR IS ARMOUR (3.617.2; Graham, 4 October 2026, MA1–MA4).
   * The 3.591.0 row was a +1 status bonus that added to worn armour and
   * ignored BSB. Copies owned since before 3.591.0 still carry no rows at
   * all — the 3.339.6 player pass measured `effects: []` — and 3.591.0
   * declared no repair, so both are recognised.
   * ---------------------------------------------------------------- */
  {
    id: "mage-armour-effects-3617", pack: "spells", name: "Mage Armour",
    // MOVED TO 3.617.3: the 3.617.2 row had no `target`, so it reached
    // nobody (found driving 3.617.2). That value is recognised too.
    field: "effects", since: "3.617.3",
    from: [
      { kind: "bonus", target: "self", slot: "dr", bonusType: "status", value: 1 },
      { kind: "note", text: "THE DR SCALES WITH YOUR BSB, as armour DR scales with a non-caster's BDB: a BSB of 6 gives DR 2, and the +4 PP warp raises that total. The row grants the printed 1; add the BSB step by hand until the scaling is built." },
      { kind: "note", text: "The armour also has 20 HP and is destroyed at 0, after which the spell cannot be cast again for 1 hour. Tracked at the table: this is a durable object with its own hit points, which no spell effect models." },
      { kind: "note", text: "CASTER LEVEL: CL 4+ adds 20 armour HP; CL 6+ raises the DR multiplier by 1; CL 8+ grants CR 1; CL 10 makes the armour rigid for injury purposes." }
    ],
    alsoFrom: [[], [
      { kind: "spellArmour", label: "Mage Armour", baseDR: 1, hp: 20,
        hpStep: { every: 4, value: 20 }, multiplierStep: { every: 6, value: 1 },
        crStep: { every: 8, value: 1 }, rigidAt: 10, lockoutMinutes: 60 }
    ]],
    to: [
      { kind: "spellArmour", target: "self", label: "Mage Armour", baseDR: 1, hp: 20,
        hpStep: { every: 4, value: 20 }, multiplierStep: { every: 6, value: 1 },
        crStep: { every: 8, value: 1 }, rigidAt: 10, lockoutMinutes: 60 }
    ],
    reason: "A +1 status bonus on top of worn armour, blind to BSB: the page's BSB-6 Wizard got DR 1, not 2, and nothing tracked the 20 HP, its destruction, the hour's lockout or CL 4–10."
  },
  /* ---------------------------------------------------------------- *
   * SELF SPELLS WHOSE ROWS REACHED NOBODY (3.617.3). Found beside Mage
   * Armour's by magic/self-rows.mjs: no range and no target, so the cast
   * has no targets, and a "targets" row lands on nobody.
   * ---------------------------------------------------------------- */
  {
    id: "invisibility-effects-3617", pack: "spells", name: "Invisibility",
    field: "effects", since: "3.617.3",
    from: [
      { kind: "condition", target: "targets", condition: "invisible" },
      { kind: "note", text: "Target is undetected (creatures can Search to make it hidden). The spell ends after the target takes a hostile action." }
    ],
    to: [
      { kind: "condition", target: "self", condition: "invisible" },
      { kind: "note", text: "Target is undetected (creatures can Search to make it hidden). The spell ends after the target takes a hostile action." }
    ],
    reason: "Cast with nothing targeted, Invisibility made nobody invisible: \"finds nobody to affect\"."
  },
  {
    id: "invisibility-warps-3617", pack: "spells", name: "Invisibility",
    field: "warps", since: "3.617.3",
    from: [
      { ppCost: 1, text: "the spells range becomes touch, and you may target another creature", mods: { rangeOverride: "touch" } },
      { ppCost: 4, text: "if you make a hostile action, the spell ends until the beginning of your next turn", mods: {} },
      { ppCost: 10, text: "you remain invisible even if you make a hostile action", mods: {} }
    ],
    to: [
      { ppCost: 1, text: "the spells range becomes touch, and you may target another creature", mods: { rangeOverride: "touch", retargetSelfRows: true } },
      { ppCost: 4, text: "if you make a hostile action, the spell ends until the beginning of your next turn", mods: {} },
      { ppCost: 10, text: "you remain invisible even if you make a hostile action", mods: {} }
    ],
    reason: "With its rows on the caster, the touch warp must move them onto the creature touched."
  },
  {
    id: "shield-of-faith-effects-3617", pack: "spells", name: "Shield Of Faith",
    field: "effects", since: "3.617.3",
    from: [{ kind: "bonus", target: "targets", slot: "defence", bonusType: "status", value: 1 }],
    to: [{ kind: "bonus", target: "self", slot: "defence", bonusType: "status", value: 1 }],
    reason: "Cast with nothing targeted, Shield Of Faith shielded nobody: \"finds nobody to affect\"."
  },
  {
    id: "shield-of-faith-warps-3617", pack: "spells", name: "Shield Of Faith",
    field: "warps", since: "3.617.3",
    from: [
      { ppCost: 2, text: "increase the range to touch", mods: { rangeOverride: "touch" } },
      { ppCost: 6, text: "increase the bonus by +1 (max +3)", mods: { bonusValue: 1, bonusMax: 3 } }
    ],
    to: [
      { ppCost: 2, text: "increase the range to touch", mods: { rangeOverride: "touch", retargetSelfRows: true } },
      { ppCost: 6, text: "increase the bonus by +1 (max +3)", mods: { bonusValue: 1, bonusMax: 3 } }
    ],
    reason: "With its row on the caster, the touch warp must move it onto the creature touched."
  },
  /* ---------------------------------------------------------------- *
   * 3.618.0 — block 37's specific weapons (R14). Their flags (Flametooth's
   * always-on flames, Da Big Itter's Fear) are not system fields, so an
   * owned copy takes them only when dragged from the compendium again.
   * ---------------------------------------------------------------- */
  {
    id: "dabigitter-damage-3618", pack: "specific-items", name: "Da Big Itter",
    field: "damage", since: "3.618.0",
    from: "1d12+1",
    to: "1d12",
    reason: "The printed line is base plus quality, and quality was added again on top: +2/+2/+4 too much (block 37, A8; R14). Bare dice now; potency adds +1 a tier (R7)."
  },
  {
    id: "dabigitter-basedamage-3618", pack: "specific-items", name: "Da Big Itter",
    field: "baseDamage", since: "3.618.0",
    from: "1d12+1",
    to: "1d12",
    reason: "The same, for the base the weapon keeps when it is shifted or customised (A8, R14)."
  },
  {
    id: "dabigitter-damagetype-3618", pack: "specific-items", name: "Da Big Itter",
    field: "damageType", since: "3.618.0",
    from: "B",
    to: "bludgeoning",
    reason: "\"B\"/\"S\" is no damage type: criticals fell back to the slashing table and bludgeoning defences never matched (A8)."
  },
  {
    id: "dabigitter-fumbledc-3618", pack: "specific-items", name: "Da Big Itter",
    field: "fumbleDC", since: "3.618.0",
    from: 0,
    to: 18,
    reason: "Fumble DC 0, so it never fumbled; the base weapon's now (R14: Scimitar 8, Morning Star 16, Mattock 18)."
  },
  {
    id: "dabigitter-size-3618", pack: "specific-items", name: "Da Big Itter",
    field: "size", since: "3.618.0",
    from: "L",
    to: "large",
    reason: "\"M\"/\"L\" is not a size word: Shifting found no forms for it (B11)."
  },
  {
    id: "flametooth-damage-3618", pack: "specific-items", name: "Flametooth",
    field: "damage", since: "3.618.0",
    from: "1d6+1",
    to: "1d6",
    reason: "The printed line is base plus quality, and quality was added again on top: +2/+2/+4 too much (block 37, A8; R14). Bare dice now; potency adds +1 a tier (R7)."
  },
  {
    id: "flametooth-basedamage-3618", pack: "specific-items", name: "Flametooth",
    field: "baseDamage", since: "3.618.0",
    from: "1d6+1",
    to: "1d6",
    reason: "The same, for the base the weapon keeps when it is shifted or customised (A8, R14)."
  },
  {
    id: "flametooth-damagetype-3618", pack: "specific-items", name: "Flametooth",
    field: "damageType", since: "3.618.0",
    from: "S",
    to: "slashing",
    reason: "\"B\"/\"S\" is no damage type: criticals fell back to the slashing table and bludgeoning defences never matched (A8)."
  },
  {
    id: "flametooth-material-3618", pack: "specific-items", name: "Flametooth",
    field: "material", since: "3.618.0",
    from: "cold iron",
    to: "coldIron",
    reason: "\"cold iron\" is not the material key, so the cold iron did nothing (A8)."
  },
  {
    id: "flametooth-fumbledc-3618", pack: "specific-items", name: "Flametooth",
    field: "fumbleDC", since: "3.618.0",
    from: 0,
    to: 8,
    reason: "Fumble DC 0, so it never fumbled; the base weapon's now (R14: Scimitar 8, Morning Star 16, Mattock 18)."
  },
  {
    id: "flametooth-size-3618", pack: "specific-items", name: "Flametooth",
    field: "size", since: "3.618.0",
    from: "M",
    to: "medium",
    reason: "\"M\"/\"L\" is not a size word: Shifting found no forms for it (B11)."
  },
  {
    id: "scourge-damage-3618", pack: "specific-items", name: "Scourge of the Unlife",
    field: "damage", since: "3.618.0",
    from: "1d8+2",
    to: "1d8",
    reason: "The printed line is base plus quality, and quality was added again on top: +2/+2/+4 too much (block 37, A8; R14). Bare dice now; potency adds +1 a tier (R7)."
  },
  {
    id: "scourge-basedamage-3618", pack: "specific-items", name: "Scourge of the Unlife",
    field: "baseDamage", since: "3.618.0",
    from: "1d8+2",
    to: "1d8",
    reason: "The same, for the base the weapon keeps when it is shifted or customised (A8, R14)."
  },
  {
    id: "scourge-damagetype-3618", pack: "specific-items", name: "Scourge of the Unlife",
    field: "damageType", since: "3.618.0",
    from: "B",
    to: "bludgeoning",
    reason: "\"B\"/\"S\" is no damage type: criticals fell back to the slashing table and bludgeoning defences never matched (A8)."
  },
  {
    id: "scourge-fumbledc-3618", pack: "specific-items", name: "Scourge of the Unlife",
    field: "fumbleDC", since: "3.618.0",
    from: 0,
    to: 16,
    reason: "Fumble DC 0, so it never fumbled; the base weapon's now (R14: Scimitar 8, Morning Star 16, Mattock 18)."
  },
  {
    id: "scourge-size-3618", pack: "specific-items", name: "Scourge of the Unlife",
    field: "size", since: "3.618.0",
    from: "M",
    to: "medium",
    reason: "\"M\"/\"L\" is not a size word: Shifting found no forms for it (B11)."
  },
]);

/* ==================================================================== *
 * EFFECT REPAIRS (3.627.1)
 *
 * PACK_REPAIRS reaches `system` fields. A creature type's immunities are
 * not a field: they are the CHANGES of an Active Effect the type item
 * carries, and an NPC that already owns the type owns a copy of that
 * effect. Same discipline, one level further in — declared old → new,
 * touched only where the owned copy still deep-equals the old value, so a
 * house-ruled copy is left alone and a repaired one is skipped.
 *
 * The pack side is tools/data-fixes.json (`editEffect` rows with the same
 * values); verify-live-fixes-3-627-1 holds the two in step.
 * ==================================================================== */

const UNDEAD_IMMUNITY_CHANGE = (value) => ({ key: "system.combat.immunities", mode: 2, value: `, ${value}`, priority: 20 });

/**
 * @typedef {object} EffectRepair
 * @property {string} id
 * @property {string} itemType   the owning item's type
 * @property {string} name       the owning item's name, matched case-insensitively
 * @property {string} effect     the effect's name, exactly
 * @property {string} since
 * @property {object} from       field → pre-fix value
 * @property {object} to         field → the value the pack carries now
 * @property {string} reason
 */

/** @type {EffectRepair[]} */
export const EFFECT_REPAIRS = Object.freeze([
  {
    id: "undead-disease-immunity", itemType: "creature-type", name: "Undead", effect: "Undead: immunities",
    since: "3.627.1",
    from: {
      changes: ["bleeding", "poison", "sleep", "paralyzed", "soul drain", "subdual", "stunned"].map(UNDEAD_IMMUNITY_CHANGE),
      description: "Immune to bleeding, poison, sleep, paralyzed, soul drain, subdual, stunned."
    },
    to: {
      changes: ["bleeding", "poison", "sleep", "disease", "paralyzed", "soul drain", "subdual", "stunned"].map(UNDEAD_IMMUNITY_CHANGE),
      description: "Immune to bleeding, poison, sleep, disease, paralyzed, soul drain, subdual, stunned."
    },
    reason: "The Creature Codex prints \"Undead are immune to bleed, poison, sleep, disease, paralysis, soul drain, "
      + "subdual damage and stunning\"; the effect carried every word but disease, so a Ghoul Fever bite or a "
      + "Zombie Plague exposure reached an undead NPC. Graham, 7 Oct 2026: Undead should have disease immunity."
  }
]);

/**
 * The update one owned effect needs, or null.
 *
 * Field by field: a field still holding its `from` value takes its `to`;
 * one already at `to`, or holding anything else, is left alone.
 *
 * @param {EffectRepair} repair
 * @param {object} effectSource the owned effect's source data
 * @returns {object|null} `{changes?, description?}`
 */
export function effectRepairUpdate(repair, effectSource) {
  if (!repair || !effectSource || effectSource.name !== repair.effect) return null;
  const update = {};
  for (const [field, from] of Object.entries(repair.from ?? {})) {
    const current = effectSource[field];
    const norm = (v) => JSON.stringify(Array.isArray(v)
      ? v.map((c) => (c && typeof c === "object" ? { key: c.key, mode: Number(c.mode), value: String(c.value), priority: c.priority ?? null } : c))
      : v);
    if (norm(current) === norm(from)) update[field] = foundry_clone(repair.to[field]);
  }
  return Object.keys(update).length ? update : null;
}

/** A deep copy without Foundry, so the harness can call the above. */
function foundry_clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}
