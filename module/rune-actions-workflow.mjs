/**
 * Using the activated runes (Chapter 11, group 2).
 *
 * `rune-actions.mjs` decides WHAT each rune offers; this presses the
 * button. One handler per rune, dispatched from one place, so the item
 * sheet needs a single action rather than four.
 *
 * EVERY ONE POSTS A CARD. These are the runes whose effect is a thing
 * that happens at the table rather than a number on a sheet, so the card
 * is the feature — it is how the GM and the other players find out that
 * the shield is now flying.
 */

import {
  RUNE_ACTIONS, runeActionsFor, runeFocusExpended, runeStateOf, shiftableForms, usesRemaining
} from "./rune-actions.mjs";
import { swarmedThrow, wildformOn } from "./codex-runes.mjs";
import { hasClassAbility } from "./crusader.mjs";
import { CONE_ANGLE, placeSpellTemplate, tokensInTemplate } from "./magic/spell-template.mjs";
import { WILD_SHAPE_ABILITY } from "./magic/wildshape-feats.mjs";
import { deletionValue } from "./deletion.mjs";
import { contentPack } from "./content-packs.mjs";

const SYSTEM_ID = "trg-prime";
const DialogV2 = foundry.applications.api.DialogV2;

/** What a shifted weapon takes from its new form beyond its damage (B11). */
const SHIFT_FIELDS = Object.freeze(["attackMode", "hands", "fumbleDC", "armourRending", "category"]);

function line(text) {
  return `<p style="margin:2px 0">${text}</p>`;
}

function esc(text) {
  return String(text ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

async function postCard(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${esc(actor?.name ?? "")}</span><h3>${esc(title)}</h3></div></header>${lines.join("")}</div>`
  });
}

/** Spend one of a limited rune's daily uses. Unlimited spends nothing. */
async function spendUse(item, action) {
  if (action.usesPerDay === Infinity) return true;
  const remaining = usesRemaining(item, action);
  if (remaining <= 0) {
    ui.notifications.warn(`${item.name}: ${action.label} has no uses left today.`);
    return false;
  }
  const spent = Number(item.flags?.[SYSTEM_ID]?.runeState?.spent?.[action.key] ?? 0);
  await item.update({ [`flags.${SYSTEM_ID}.runeState.spent.${action.key}`]: spent + 1 });
  return true;
}

/** Set or clear one of the item's rune states. */
async function setState(item, state, value) {
  return item.update({ [`flags.${SYSTEM_ID}.runeState.${state}`]: value });
}

/**
 * ANIMATED. "When activated the shield floats into the air next to you,
 * granting you its bonus to DB automatically. You can't use the shield
 * for reactions such as Shield Block and you still suffer any penalties
 * for using the shield. You do however have both hands free. … Once the
 * rune has been activated, its effects last for 1 minute, after which the
 * shield drops to the ground, ending its floating effect and may not be
 * activated again for 1 minute."
 *
 * A MINUTE, NOT A TOGGLE (3.615.0, Graham's R5 of block 36). Until then
 * this read "the chapter gives it no duration", which it does. The minute
 * is a timer effect on the wearer (rune-timers.mjs); pressing the button
 * again ends it early, and the cooldown runs either way.
 */
async function useAnimated(actor, item, action) {
  const { stopRuneTimer, runeReady, payRuneActivation, startRuneTimer } = await import("./rune-timers-workflow.mjs");
  if (runeStateOf(item, "animated")) {
    if (await stopRuneTimer(actor, item, "animated")) return null;
    // A state with no timer behind it (set before 3.615.0): clear it.
    await setState(item, "animated", false);
    return postCard(actor, `${item.name} — Animated`, [
      line("The shield settles back into your hand. Shield Block is available again, and it occupies a hand once more.")
    ]);
  }
  if (!runeReady(item, "animated", action.label)) return null;
  if (usesRemaining(item, action) <= 0) {
    ui.notifications.warn(`${item.name}: ${action.label} has no uses left today.`);
    return null;
  }
  if (!await payRuneActivation(actor, action.apCost, `${item.name} — ${action.label}`)) return null;
  if (!await spendUse(item, action)) return null;
  await startRuneTimer(actor, item, {
    key: "animated", state: "animated", label: action.label,
    durationSeconds: action.durationSeconds, cooldownSeconds: action.cooldownSeconds
  });
  const left = usesRemaining(item, action);
  return postCard(actor, `${item.name} — Animated`, [
    line("The shield floats free beside you <strong>for 1 minute</strong>. You keep its bonus to DB and <strong>both hands are free</strong>."),
    line("<em>You cannot Shield Block with it while it is animated, and its penalties still apply. When the minute is up it drops to the ground, and it cannot be activated again for 1 minute.</em>"),
    line(left === Infinity
      ? "<em>Unlimited uses per day.</em>"
      : `<em>${left} use${left === 1 ? "" : "s"} left today.</em>`)
  ]);
}

/**
 * ARROW CATCHING. "Activate Engage (1 AP) … When activated the armour or
 * shield increases its bonus to DB by +1 against missile attacks."
 *
 * ACTIVATED FOR A MINUTE (3.615.0, Graham's R6 of block 36). Until then the
 * +1 applied to every ranged attack, always, with nothing to activate.
 */
async function useArrowCatching(actor, item, action) {
  const { stopRuneTimer, payRuneActivation, startRuneTimer } = await import("./rune-timers-workflow.mjs");
  if (runeStateOf(item, "arrowCatching")) {
    if (await stopRuneTimer(actor, item, "arrowCatching")) return null;
    await setState(item, "arrowCatching", false);
    return null;
  }
  if (!await payRuneActivation(actor, action.apCost, `${item.name} — ${action.label}`)) return null;
  await startRuneTimer(actor, item, {
    key: "arrowCatching", state: "arrowCatching", label: action.label,
    durationSeconds: action.durationSeconds, cooldownSeconds: action.cooldownSeconds
  });
  return postCard(actor, `${item.name} — Arrow Catching`, [
    line("For <strong>1 minute</strong>, +1 DB against missile attacks."),
    line("<em>Missiles aimed at a creature within 5 feet of you are drawn to you instead, unless you have greater cover; and attackers using ranged weapons against you ignore any concealment.</em>")
  ]);
}

/**
 * GLAMOURED. A toggle and a card — the armour keeps every property
 * including its weight, so nothing mechanical changes and saying so
 * clearly is the whole job.
 */
async function useGlamoured(actor, item, action) {
  const on = runeStateOf(item, "glamoured");
  // "Activate Contemplative (1 AP)" — the disguise is put on with a
  // thought; dropping it costs nothing (3.615.0, R10 of block 36).
  if (!on) {
    const { payRuneActivation } = await import("./rune-timers-workflow.mjs");
    if (!await payRuneActivation(actor, action?.apCost ?? 0, `${item.name} — Glamoured`)) return null;
  }
  await setState(item, "glamoured", !on);
  return postCard(actor, `${item.name} — Glamoured`, [
    line(on
      ? "The illusion drops and the armour is plainly armour again."
      : "The armour takes the shape of ordinary clothing."),
    line("<em>It keeps every property, including its weight. Only a creature benefiting from true seeing may attempt to disbelieve, DC 26.</em>")
  ]);
}

/**
 * CALLED. "As long as the weapon is within the rune's effect range it
 * will be teleported instantly into your hand (even if restrained or
 * trapped). If another creature is in possession of your weapon they can
 * attempt a Will save against your Level DC to prevent the weapon from
 * returning to you. A critical on this save also breaks your investment."
 *
 * WHO IS HOLDING IT IS ASKED, not assumed: this system does not track
 * where a dropped weapon has got to, and guessing would be worse than a
 * question with two buttons.
 */
async function useCalled(actor, item, action) {
  const held = await DialogV2.wait({
    window: { title: `${item.name} — Called`, icon: "fa-solid fa-hand-sparkles" },
    classes: ["trg-prime"],
    content: `<div class="trg-prime trg-check-dialog">
      <p>Calling <strong>${esc(item.name)}</strong> — it returns from ${esc(action.range)}.</p>
      <p class="hint">Is another creature holding it? If so they may resist with a Will save against your Level DC.</p>
    </div>`,
    buttons: [
      { action: "free", label: "It is loose or mine", icon: "fa-solid fa-hand", default: true },
      { action: "held", label: "Someone else holds it", icon: "fa-solid fa-hand-fist" },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!held || held === "cancel") return null;
  // "Command, Contemplative (2 AP)" (3.618.0, A5): it cost nothing.
  const { payRuneActivation } = await import("./rune-timers-workflow.mjs");
  if (!await payRuneActivation(actor, action.apCost ?? 2, `${item.name} — ${action.label}`)) return null;

  // THE WEAPON'S LEVEL DC (3.618.0, A5; Graham's R11): level + 14, and the
  // level is the item's — "the items level and not yours". It printed
  // 10 + the character's level.
  const { weaponLevelDC } = await import("./weapon-rune-workflow.mjs");
  const dc = weaponLevelDC(item);
  const lines = [line(`You call <strong>${esc(item.name)}</strong> to your outstretched hand, from ${esc(action.range)}.`)];
  if (held === "held") {
    lines.push(line(
      `<strong>${esc(item.name)} is held by another creature.</strong> They may attempt a <strong>Will save against DC ${dc}</strong> (the weapon's Level DC) to keep it.`));
    lines.push(line(
      "<em>On a success the weapon stays where it is. On a CRITICAL success it also breaks your investment in it.</em>"));
  } else {
    lines.push(line("<em>It arrives instantly — even if you are restrained or trapped.</em>"));
  }
  return postCard(actor, `${item.name} — Called`, lines);
}

/**
 * SHIFTING. "The weapon changes shape and becomes another melee weapon
 * based upon the rune's level. All material and quality bonuses still
 * apply to the new form as well as any magical runes. If a specific
 * quality or rune cannot be applied to the new form, it is suppressed
 * until it returns to its original form."
 *
 * So the item KEEPS its quality, material, runes, level and price, and
 * changes only what it is: name, damage, group, size, traits. The
 * original is recorded so it can change back — and the record is what
 * makes "until it returns to its original form" possible at all.
 */
async function useShifting(actor, item, action) {
  const original = item.flags?.[SYSTEM_ID]?.runeState?.shiftedFrom ?? null;
  if (original) {
    await item.update({
      name: original.name,
      "system.damage": original.damage,
      "system.damageType": original.damageType,
      "system.baseDamage": original.baseDamage,
      "system.size": original.size,
      "system.group": original.group,
      "system.traits": original.traits,
      // AND WHAT IT HANDLES LIKE (3.618.0, B11) — recorded since 3.618.0.
      ...Object.fromEntries(SHIFT_FIELDS.filter((field) => original[field] !== undefined)
        .map((field) => [`system.${field}`, original[field]])),
      [`flags.${SYSTEM_ID}.runeState.shifted`]: false,
      [`flags.${SYSTEM_ID}.runeState.shiftedFrom`]: null
    });
    return postCard(actor, `${item.name} — Shifting`, [
      line(`It flows back into its true form: <strong>${esc(original.name)}</strong>.`),
      line("<em>Anything suppressed in the other form applies again.</em>")
    ]);
  }

  const pack = contentPack("weapons");
  const index = pack ? await pack.getIndex({ fields: ["system.size", "system.damage", "system.group", "system.attackMode", "system.natural"] }) : [];
  const candidates = shiftableForms(
    Array.from(index).map((entry) => ({
      id: entry._id, name: entry.name, size: entry.system?.size ?? "medium",
      // "another MELEE weapon" (3.618.0, B11).
      attackMode: entry.system?.attackMode ?? "melee",
      natural: Boolean(entry.system?.natural)
    })),
    { fromSize: item.system?.size ?? "medium", steps: action.sizeSteps, exclude: item.name }
  );
  if (!candidates.length) {
    ui.notifications.warn(`${item.name}: no other weapon is ${action.sizeSteps ? "within one size" : "of the same size"}.`);
    return null;
  }

  const picked = await DialogV2.wait({
    window: { title: `${item.name} — Shift Into`, icon: "fa-solid fa-shuffle" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint">${esc(action.description)}</p>
      <div class="form-group"><label>New form</label><select name="choice">${
        candidates.map((c) => `<option value="${c.id}">${esc(c.name)} (${esc(c.size)})</option>`).join("")
      }</select></div></div>`,
    buttons: [
      {
        action: "ok", label: "Shift", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!picked || picked === "cancel") return null;

  const form = await pack.getDocument(picked.choice);
  if (!form) return null;
  // "Activate Engage (1 AP)" (3.618.0, A5): it cost nothing.
  const { payRuneActivation } = await import("./rune-timers-workflow.mjs");
  if (!await payRuneActivation(actor, action.apCost ?? 1, `${item.name} — ${action.label}`)) return null;

  await item.update({
    name: `${form.name} (${item.name})`,
    "system.damage": form.system.damage,
    "system.damageType": form.system.damageType,
    "system.baseDamage": form.system.baseDamage ?? form.system.damage,
    "system.size": form.system.size,
    "system.group": form.system.group,
    "system.traits": form.system.traits,
    // THE NEW FORM'S HANDLING TOO (3.618.0, B11): attack mode, hands, fumble
    // DC, armour rending and category. A shifted longsword kept the club's.
    ...Object.fromEntries(SHIFT_FIELDS.map((field) => [`system.${field}`, form.system[field]])),
    [`flags.${SYSTEM_ID}.runeState.shifted`]: true,
    // WHAT IT WAS, so it can be what it was again. Quality, material,
    // runes, level and price are deliberately NOT recorded here: they do
    // not change, so there is nothing to put back.
    [`flags.${SYSTEM_ID}.runeState.shiftedFrom`]: {
      name: item.name,
      damage: item.system.damage,
      damageType: item.system.damageType,
      baseDamage: item.system.baseDamage,
      size: item.system.size,
      group: item.system.group,
      traits: item.system.traits,
      ...Object.fromEntries(SHIFT_FIELDS.map((field) => [field, item.system[field]]))
    }
  });
  return postCard(actor, `${form.name} — Shifting`, [
    line(`The weapon reshapes itself into <strong>${esc(form.name)}</strong>.`),
    line("<em>Its quality, material and runes come with it. Anything that cannot apply to this form is suppressed until it changes back.</em>")
  ]);
}

/**
 * REFLECTING (Chapter 11, group 3, but pressed like group 2).
 *
 * "Activate Reaction; Trigger the wielder is the trigger of a spell ...
 * The shield's wielder can reflect a spell back upon its caster as if
 * using the spell turning spell."
 *
 * TIER II HAS TWO ALLOWANCES AT ONCE — once a day up to PP 18, three
 * times up to PP 14 — so the question is not "any uses left" but "a use
 * left that reaches this spell", and the tightest one that fits is spent
 * so the generous one stays for a spell that needs it.
 */
async function useReflecting(actor, item, action) {
  const { eventRunesFor, reflectionAvailable } = await import("./rune-events.mjs");
  const rune = eventRunesFor(item).find((entry) => entry.key === "reflecting");
  if (!rune) return null;

  const entered = await DialogV2.wait({
    window: { title: `${item.name} — Reflecting`, icon: "fa-solid fa-shield-halved" },
    classes: ["trg-prime"],
    position: { width: 420 },
    content: `<div class="trg-prime trg-check-dialog">
      <p class="hint">${esc(rune.description)}</p>
      <div class="form-group"><label>The spell's PP</label>
      <input type="number" name="pp" value="0" min="0" step="1"></div></div>`,
    buttons: [
      {
        action: "ok", label: "Reflect", icon: "fa-solid fa-check", default: true,
        callback: (event, button) =>
          new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(
            button.form ?? button.closest("form")
          ).object
      },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!entered || entered === "cancel") return null;

  const spellPP = Math.max(0, Math.floor(Number(entered.pp) || 0));
  const spent = item.flags?.[SYSTEM_ID]?.runeState?.spent ?? {};
  const check = reflectionAvailable(rune, spellPP, spent);
  if (!check.available) {
    ui.notifications.warn(`${item.name}: ${check.reason}`);
    return null;
  }
  // BOTH COUNTS (3.616.0, R7): the allowance, and the rune's own count
  // that the sheet reads. See `reflectionSpendUpdates`.
  const { reflectionSpendUpdates } = await import("./rune-events.mjs");
  const updates = {};
  for (const [k, v] of Object.entries(reflectionSpendUpdates(spent, check.maxPP))) {
    updates[`flags.${SYSTEM_ID}.runeState.spent.${k}`] = v;
  }
  await item.update(updates);
  return postCard(actor, `${item.name} — Reflecting`, [
    line(`The shield turns the spell back upon its caster, as the <em>spell turning</em> spell.`),
    line(`<em>Reflected a PP ${spellPP} spell on this shield's up-to-PP-${check.maxPP} allowance — ${check.remaining - 1} of those left today.</em>`)
  ]);
}

/**
 * DREADCARVE. "Activate Command (1 AP); Frequency at will."
 *
 * A toggle, like Animated and Glamoured, and for the same reason: the
 * rune prints no duration, so it is a state the item is in and the
 * wearer ends it the way they began it.
 *
 * WHAT MAKES THIS ONE DIFFERENT is that the state is visible to the
 * whole table. Raising it emits an aura, which draws a Region on the
 * canvas that follows the wearer and asks anything entering it for a
 * Will save. The redraw is not done here — `creature-aura-workflow.mjs`
 * watches item updates for exactly this — so the button's only job is
 * the flag and the card.
 */
async function useDreadcarve(actor, item, action) {
  const up = runeStateOf(item, "dreadcarve");
  await setState(item, "dreadcarve", !up);
  return postCard(actor, `${item.name} — ${action.label}`, [
    line(up
      ? "The carved faces still and the fear goes out of the air."
      : `The carvings twist into something that watches. <strong>${action.description}</strong>`),
    up ? "" : line("<em>The circle follows you. Anything that steps into it is asked for the save.</em>")
  ].filter(Boolean));
}

/**
 * SWARMED. "As you hurl your weapon, it replicates in midair, sweeping
 * across a 30-foot cone. Each creature in the area takes damage equal to
 * twice the weapon's damage dice with a basic Reflex save to avoid."
 *
 * THE FIRST RUNE THAT PUTS A TEMPLATE ON THE MAP, and it borrows the
 * spell machinery to do it rather than growing a second one: the cone is
 * `placeSpellTemplate`, the creatures caught are `tokensInTemplate`, and
 * both have been drawing and catching for spells since 3.230.8.
 *
 * ROLLED ONCE, SAVED SEPARATELY. The weapon replicates and sweeps a
 * cone; it does not roll a fresh handful of dice per victim, so the
 * damage is one roll and each creature is named with the DC to halve it.
 * The saves themselves are theirs to make — the same stance every area
 * effect in this system takes.
 *
 * THE THROWN TRAIT IS REPORTED, NOT ENFORCED. "inscribed onto a thrown
 * weapon" is a crafting restriction, and an inscribed weapon that has
 * lost the trait (or a homebrew one that never had it) is a data problem
 * to say out loud rather than a button to refuse — the same treatment
 * every rune restriction in `priceSelection` gets.
 */
async function useSwarmed(actor, item, action) {
  const throwing = swarmedThrow(item);
  if (!throwing) return null;

  const lines = [line(action.description)];
  if (!/\bthrown\b/i.test(String(item.system?.traits ?? ""))) {
    lines.push(line(`<em>${esc(item.name)} does not carry the Thrown trait, and this rune is inscribed onto a thrown weapon.</em>`));
  }

  const placed = await placeSpellTemplate(
    { t: "cone", distance: throwing.coneFeet, angle: CONE_ANGLE, shape: "cone" },
    actor, null, `${item.name} — ${action.label}`);

  // `placeSpellTemplate` returns the template descriptor itself, which
  // is exactly what `tokensInTemplate` takes — the same pair
  // cast-workflow uses. Null when there is no canvas, or when the aiming
  // was cancelled.
  const caught = placed ? tokensInTemplate(placed) : [];
  if (!caught.length) {
    lines.push(line(placed
      ? "<em>Nothing is standing in the cone.</em>"
      : "<em>No canvas to place the cone on — measure the 30-foot cone at the table.</em>"));
    lines.push(line(`Each takes ${esc(throwing.damage)} (twice the weapon's dice), <strong>basic Reflex save, DC ${throwing.dc}</strong>.`));
    return postCard(actor, `${item.name} — ${action.label}`, lines);
  }

  // ROLLED AND APPLIED (3.632.0; Fiends & Fables 3.0 block 2, ruling 12):
  // the cone's creatures through the declared-area rail — one damage roll,
  // each creature's basic Reflex against the rune's DC, the typed damage
  // through its defences (and a Swarm's Weakness to area effects).
  const { perilEffectSpec } = await import("./peril-effect.mjs");
  const { runDeclaredAreaEffect } = await import("./peril-workflow.mjs");
  const spec = perilEffectSpec({
    save: "reflex", basic: true, dc: throwing.dc,
    damage: { formula: throwing.damage, type: String(item.system?.damageType ?? "piercing").toLowerCase() }
  }, "");
  spec.isCreatureArea = true;
  const rolled = await runDeclaredAreaEffect(actor, spec, {
    title: `${item.name} — ${action.label}`,
    targets: caught.map((t) => t.actor ?? t.document?.actor).filter((a) => a && a.id !== actor.id)
  });
  lines.push(line(`Caught in the cone: <strong>${caught.map((t) => esc(t.name)).join(", ")}</strong> — ${esc(throwing.damage)}, twice the weapon's dice.`));
  return postCard(actor, `${item.name} — ${action.label}`, [...lines, ...rolled]);
}

/**
 * WILDFORM. Two runes behind one name, and the button knows which.
 *
 * A WEARER WITH WILD SHAPE SHOULD NEVER PRESS THIS. "Rather than the
 * above effect, a druid gains an additional daily use of Wildshape each
 * day per power level" — so for them the rune is a counter on their own
 * ability, added where that count is decided (feats-workflow's Wild
 * Shape button), and pressing this would be asking for an animal form
 * the rune does not grant them. The card says so and spends nothing.
 *
 * For everybody else it is a daily casting of Shape of the Animal, and
 * the tier is how much of the spell's own Warping Options list the rune
 * pays for. The spell itself is the player's to cast — this states the
 * allowance and spends the day's use, the same stance every "as if using
 * the spell" rune takes.
 */
async function useWildform(actor, item, action) {
  const hasWildshape = hasClassAbility(actor, WILD_SHAPE_ABILITY);
  const form = wildformOn([item], { hasWildshape });
  if (!form) return null;

  if (form.branch === "wildshape") {
    return postCard(actor, `${item.name} — ${action.label}`, [
      line(`<strong>You have Wild Shape, so this rune grants no animal form.</strong> Instead it is worth <strong>${form.extraWildshapeUses} extra use${form.extraWildshapeUses === 1 ? "" : "s"} of Wild Shape a day</strong>.`),
      line("<em>Press Wild Shape's own button to refresh the daily count — the rune is counted there. Nothing has been spent here.</em>")
    ]);
  }

  if (!await spendUse(item, action)) return null;
  const left = usesRemaining(item, action);
  return postCard(actor, `${item.name} — ${action.label}`, [
    line(`<strong>${esc(form.spell)}</strong>, as the rune's own casting.`),
    form.warpingPP
      ? line(`Up to <strong>${form.warpingPP} PP</strong> of the spell's ${esc(form.warpingOptionsCalled)} are paid for by the rune.`)
      : line(`The <strong>base casting</strong> — this tier pays for no ${esc(form.warpingOptionsCalled)}.`),
    line(left === Infinity
      ? "<em>Unlimited uses per day.</em>"
      : `<em>${left} use${left === 1 ? "" : "s"} left today.</em>`)
  ]);
}

/**
 * THE ENERGY RUNES (3.618.0, A4 and C5; Graham's R9). "Activate Command
 * (1 AP) … When active, the weapon inflicts secondary … damage." Command
 * (1 AP) switches it on; it stays on until switched off, which is free.
 * A weapon whose page makes it always on (Flametooth's "eternal" flames)
 * has nothing to switch, and the card says so.
 */
async function useEnergyRune(actor, item, action) {
  const always = (item.flags?.[SYSTEM_ID]?.specificItem?.alwaysActive ?? []).includes(action.key);
  if (always) {
    return postCard(actor, `${item.name} — ${action.label}`, [
      line(`<strong>${esc(item.name)}</strong>'s ${esc(action.label)} rune never goes out: its secondary ${esc(action.energy)} damage is always on.`)
    ]);
  }
  const on = runeStateOf(item, action.state);
  if (!on) {
    const { payRuneActivation } = await import("./rune-timers-workflow.mjs");
    if (!await payRuneActivation(actor, action.apCost ?? 1, `${item.name} — ${action.label}`)) return null;
  }
  await setState(item, action.state, !on);
  return postCard(actor, `${item.name} — ${action.label}`, [
    line(on
      ? `${esc(action.label)} goes quiet: no more secondary ${esc(action.energy)} damage until it is activated again.`
      : `${esc(action.label)} is <strong>active</strong>: each hit deals its secondary ${esc(action.energy)} damage until you switch it off (free).`)
  ]);
}

const HANDLERS = Object.freeze({
  acidic: useEnergyRune,
  flaming: useEnergyRune,
  frost: useEnergyRune,
  shock: useEnergyRune,
  thundering: useEnergyRune,
  reflecting: useReflecting,
  animated: useAnimated,
  arrowCatching: useArrowCatching,
  glamoured: useGlamoured,
  called: useCalled,
  shifting: useShifting,
  dreadcarve: useDreadcarve,
  swarmed: useSwarmed,
  wildform: useWildform
});

/** Press one of an item's rune buttons. */
export async function useRuneAction(actor, item, key) {
  // REFLECTING IS AN EVENT RUNE, not one of RUNE_ACTIONS, so the lookup
  // below never found it and the sheet's button did nothing (3.616.0, A4 of
  // block 36). It is offered by itself when a spell targets the wielder;
  // the button stays for a spell the system did not see cast.
  if (key === "reflecting") return useReflecting(actor, item, { key, label: "Reflecting" });
  const action = runeActionsFor(item).find((entry) => entry.key === key);
  if (!action) return null;
  if (action.declared) return useDeclaredRune(actor, item, action);
  const handler = HANDLERS[key];
  if (!handler) return null;
  return handler(actor, item, action);
}

/**
 * A REGISTERED RUNE'S ACTION (3.626.0) — see rune-actions.mjs
 * `declaredRuneAction`. One press: the AP is paid, a daily or Focus use
 * is spent, and a timer effect on the wearer carries whatever the rune's
 * `effect` declares — Sanctuary's ally aura — for the rune's minute;
 * pressing again while it runs switches it off. A Focus rune's use comes
 * back with Refocus.
 */
async function useDeclaredRune(actor, item, action) {
  const { stopRuneTimer, payRuneActivation, startRuneTimer } = await import("./rune-timers-workflow.mjs");
  if (action.durationSeconds > 0 && runeStateOf(item, action.state)) {
    if (await stopRuneTimer(actor, item, action.key)) return null;
    await setState(item, action.state, false);
    return null;
  }
  if (action.focus && runeFocusExpended(item, action.key)) {
    ui.notifications.warn(`${item.name}: ${action.label} is expended — Refocus restores it.`);
    return null;
  }
  if (!await payRuneActivation(actor, action.apCost, `${item.name} — ${action.label}`)) return null;
  if (!action.focus && !await spendUse(item, action)) return null;
  if (action.focus) await item.update({ [`flags.${SYSTEM_ID}.runeState.focusExpended.${action.key}`]: true });
  const extra = {};
  for (const k of ["auras", "conditionals", "bonuses"]) if (Array.isArray(action.effect?.[k])) extra[k] = action.effect[k];
  if (action.durationSeconds > 0) {
    await startRuneTimer(actor, item, {
      key: action.key, state: action.state, label: action.label,
      durationSeconds: action.durationSeconds, cooldownSeconds: action.cooldownSeconds,
      extraFlags: extra, changes: Array.isArray(action.effect?.changes) ? action.effect.changes : []
    });
  }
  return postCard(actor, `${item.name} — ${action.label}`, [
    line(action.description || "Activated."),
    ...(action.focus ? [line("<em>The rune is expended — Refocus restores it.</em>")] : []),
    ...(action.durationSeconds > 0 ? [line(`<em>Press again to end it early; it ends on its own after ${Math.round(action.durationSeconds / 60) || 1} minute${action.durationSeconds > 60 ? "s" : ""}.</em>`)] : [])
  ]);
}

/** Daily preparation restores every limited rune's uses. */
export async function resetRuneUses(actor) {
  const lines = [];
  const updates = [];
  for (const item of actor?.items ?? []) {
    const spent = item.flags?.[SYSTEM_ID]?.runeState?.spent ?? null;
    if (!spent || !Object.keys(spent).length) continue;
    const names = Object.keys(spent)
      .map((key) => RUNE_ACTIONS[key]?.label ?? key)
      .join(", ");
    updates.push({
      _id: item.id,
      [`flags.${SYSTEM_ID}.runeState.spent`]: deletionValue()
    });
    lines.push(`${item.name}'s ${names} rune is ready again.`);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  return lines;
}
