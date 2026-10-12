/**
 * Charged items, wired up (Chapter 11).
 *
 * `charged-items.mjs` holds the arithmetic — how a charged item's level
 * is worked out, how much it recovers each day, which check you roll to
 * cast from it. Until this file existed, **nothing called any of it**.
 * Every function was exported, tested against the chapter's own worked
 * examples, and dead. Live testing found that, the same way it found
 * `syncCompanionLevels` had no caller in 3.233.2.
 *
 * A PURE FUNCTION'S TESTS SAY NOTHING ABOUT WHETHER IT IS CALLED, and a
 * harness that only imports the module is agreeing with itself. The
 * checks that matter here are the ones that assert the call sites exist:
 * see section O of verify-magic-items.mjs.
 *
 * What is wired:
 *   - casting from a charged item, spending the item's own PP, with
 *     both check paths offered and the depletion table rolled when the
 *     pool goes below zero;
 *   - daily preparation recharging every invested charged item;
 *   - the "one charged item at a time" warning, on the sheet.
 */

import {
  castFromItemOptions, chargedItemWarnings, itemRecharge, warpCeiling
} from "./charged-items.mjs";
import { rollItemDepletion } from "./magic-items-workflow.mjs";
import { castingDC, castingOutcome } from "./magic/casting.mjs";
import { TRGCheck } from "./dice/check.mjs";
import { contentPack } from "./content-packs.mjs";

const SYSTEM_ID = "trg-prime";
const DialogV2 = foundry.applications.api.DialogV2;

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
    content: `<div class="trg-prime trg-check-card"><header class="check-header"><div class="check-heading"><span class="check-actor">${actor.name}</span><h3>${esc(title)}</h3></div></header>${lines.join("")}</div>`
  });
}

/** The charged-item block on an item, or null if it is not one. */
export function chargedItemData(item) {
  const flag = item?.flags?.[SYSTEM_ID]?.chargedItem;
  if (!flag || !Number.isFinite(Number(flag.maximumPP))) return null;
  return flag;
}

/** Every charged item an actor is carrying. */
export function chargedItemsOf(actor) {
  return Array.from(actor?.items ?? []).filter((i) => chargedItemData(i));
}

/**
 * "Be aware that a character may only wield one charged item at any one
 * time." Reported, not enforced (magic-items.mjs does the same for
 * duplicate worn items) — a GM may be mid-shuffle, and a sheet that
 * refused to let someone hold a second wand would be arguing with the
 * table.
 */
export function chargedItemSheetWarnings(actor) {
  return chargedItemWarnings(
    chargedItemsOf(actor).filter((i) => i.system?.equipped).map((i) => i.name)
  );
}

/**
 * A spell's traditions, looked up by name.
 *
 * The item records its spells as name and PP, which is what the book
 * prints. The tradition lives on the spell itself, so it is read from
 * the actor's own copy first (a house-ruled spell should win) and from
 * the compendium otherwise. A spell that cannot be found reports no
 * tradition rather than guessing one, and `castFromItemOptions` then
 * says so.
 */
export async function spellTraditionFor(actor, spellName) {
  const wanted = String(spellName ?? "").trim().toLowerCase();
  if (!wanted) return "";
  const owned = Array.from(actor?.items ?? []).find(
    (i) => i.type === "spell" && String(i.name).trim().toLowerCase() === wanted
  );
  if (owned) return owned.system?.tradition ?? "";
  const pack = contentPack("spells");
  if (!pack) return "";
  const index = await pack.getIndex({ fields: ["system.tradition"] });
  const hit = index.find((e) => String(e.name).trim().toLowerCase() === wanted);
  return hit?.system?.tradition ?? "";
}

/** The facts about the caster that the two paths are judged against. */
export function casterContext(actor) {
  const system = actor?.system ?? {};
  const skills = system.skills ?? {};
  return {
    casterLevel: Number(
      system.magic?.casterLevelValue ?? system.magic?.casterLevel
        ?? system.identity?.level ?? 0
    ),
    casterTradition: String(system.magic?.tradition ?? ""),
    // Every skill's ranks, so an option can be built for each of a
    // spell's traditions without knowing in advance which they are.
    skillRanks: Object.fromEntries(
      Object.entries(skills).map(([key, entry]) => [key, Number(entry?.ranks ?? 0)])
    ),
    // And every skill's TOTAL, which is a different question. Ranks gate
    // the attempt ("your Nature ranks are below the spell's 6 PP"); the
    // total is the bonus, and a bonus is what a DC gets built from. Used
    // by `consumableSaveDC` for the untrained scroll reader — see the note
    // on `highestTraditionSkill`.
    skillTotals: Object.fromEntries(
      Object.entries(skills).map(([key, entry]) => [key, Number(entry?.total ?? 0)])
    ),
    // WHETHER THIS READER IS A CASTER AT ALL, which decides whether a
    // scroll's Save DC is their own or is scraped together from a
    // tradition skill. A casting ability score is what makes the ordinary
    // `10 + PP + ability` formula mean anything; without one it collapses
    // to `10 + PP` — which is exactly the inference Graham overturned on
    // 14 Aug 2026.
    isCaster: Number(
      system.attributes?.[system.magic?.castingAbility]?.total ??
        system.magic?.castingAbilityScore ?? 0
    ) > 0,
    hasUseMagicDevice: Array.from(actor?.items ?? []).some(
      (i) => i.type === "feat" && String(i.name).trim().toLowerCase() === "use magic device"
    )
  };
}

/**
 * Roll the check that releases a spell from an item — the wand's, the
 * staff's, and the scroll's, because they are one question.
 *
 * "You did not write this; can you read it back?" `castFromItemOptions`
 * has always answered which ladder applies. What was missing until
 * 3.312.0 was anybody rolling it: the charged-item card listed the
 * options and their difficulty and stopped there, so a wand described a
 * check instead of making one.
 *
 * THE DEGREE IS A CASTING DEGREE. It goes to `castingOutcome`, the same
 * function an ordinary Spellcraft roll feeds, which is what makes
 * Graham's ruling ("Follow castingOutcome") a matter of calling the
 * existing rule rather than writing a second one: Partial spends nothing,
 * Failure spends half, Fumble and Blunder spend the lot, and Critical and
 * Heroic discount it. The only difference from an ordinary cast is whose
 * pool it comes out of.
 *
 * An unavailable path is offered anyway, with its reason, matching how
 * this system reports rather than enforces wherever a GM might overrule
 * it.
 *
 * @returns {Promise<{check:object, degree:string, outcome:object, option:object}|null>}
 *   null when the player cancelled.
 */
export async function rollReleaseCheck(actor, {
  itemName = "",
  spellName = "",
  pp = 0,
  title = "",
  icon = "fa-solid fa-wand-sparkles",
  hint = ""
} = {}) {
  const cost = Math.max(0, Math.floor(Number(pp) || 0));
  const options = castFromItemOptions({
    spellPPCost: cost,
    spellTradition: await spellTraditionFor(actor, spellName),
    ...casterContext(actor)
  });
  const rows = options.map((option, i) =>
    `<option value="${i}">${esc(option.label)} — ${option.difficulty}${
      option.available ? "" : ` (unavailable: ${esc(option.reason)})`}</option>`
  ).join("");

  const picked = await DialogV2.wait({
    window: { title: title || `${itemName} — Release the Spell`, icon },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">
      <p style="margin:0 0 6px">Releasing <strong>${esc(spellName)}</strong> at ${cost} PP — Casting DC ${castingDC(cost)}.</p>
      <div class="form-group stacked"><label>How are you releasing it?</label>
        <select name="choice">${rows}</select></div>
      <p class="hint" style="margin:4px 0 0">${hint || "An unavailable path is still offered — the GM may allow the attempt."}</p>
    </div>`,
    buttons: [
      {
        action: "ok", label: "Release", icon: "fa-solid fa-check", default: true,
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

  const option = options[Number(picked.choice)] ?? options[0];
  if (!option) return null;

  const skill = option.skill ? actor.system?.skills?.[option.skill] : null;
  const modifiers = option.skill
    ? (skill?.checkModifiers ?? [
      { label: skill?.label ?? option.label, value: Number(skill?.total ?? 0), type: "untyped" }
    ])
    : (actor.system?.magic?.spellcraft?.checkModifiers ?? [
      { label: "Spellcraft", value: Number(actor.system?.magic?.spellcraft?.total ?? 0), type: "untyped" }
    ]);

  const check = await TRGCheck.roll({
    actor,
    label: title || `${itemName} — Release the Spell`,
    subtitle: `${option.label} — ${option.difficulty} check against Casting DC ${castingDC(cost)}${
      option.available ? "" : ` (the GM allowed this despite: ${option.reason})`}`,
    type: option.skill ? "skill" : "spellcraft",
    dc: castingDC(cost),
    difficulty: option.difficulty,
    modifiers: [...modifiers]
  });

  const degree = check.outcome?.degree?.key ?? "failure";
  const outcome = castingOutcome(degree, { basePP: cost });

  // A FUMBLE ON A RELEASE IS A FUMBLE ON A CASTING, whichever object it
  // came out of. The Spell Fumble Table (Chapter 9) is rolled here, in the
  // shared ladder, rather than by each caller — because when only the
  // scroll path did it, the same degree on the same roll produced the table
  // for a page and nothing at all for a wand. Found by verify-item-cast,
  // 14 Aug 2026, and the fix is to state the rule once at the point both
  // paths pass through.
  if (outcome.fumbleRoll) {
    const { rollSpellFumble } = await import("./magic/cast-workflow.mjs");
    await rollSpellFumble(actor, {
      tradition: await spellTraditionFor(actor, spellName),
      blunder: degree === "blunder",
      pp: cost
    }).catch(() => null);
  }

  return { check, degree, outcome, option, options };
}

/**
 * Cast from a charged item: pick what to release, pick how, spend the
 * item's own PP.
 *
 * The PP comes from the ITEM, per Graham's ruling and the chapter's own
 * "charged items contain power points which may be used to release
 * spells or other effects" — the wielder's pool is never touched.
 *
 * Both check paths are always shown, with WHY an unavailable one is
 * unavailable, because between them they fail for four different
 * reasons and a dialog that silently omits the path you cannot use
 * leaves a player guessing which requirement they missed.
 */
/** The spell document an item names: the actor's own copy, else the compendium's. */
async function spellDocumentFor(actor, spellName) {
  const wanted = String(spellName ?? "").trim().toLowerCase();
  if (!wanted) return null;
  const owned = Array.from(actor?.items ?? []).find(
    (i) => i.type === "spell" && String(i.name).trim().toLowerCase() === wanted);
  if (owned) return owned;
  const pack = contentPack("spells");
  if (!pack) return null;
  const hit = (await pack.getIndex()).find((e) => String(e.name).trim().toLowerCase() === wanted);
  return hit ? pack.getDocument(hit._id) : null;
}

/**
 * The warp for one release from a staff or a flexible wand (3.615.0, B10
 * and Graham's R19 of block 36), chosen from the spell's own options.
 *
 *   STAFF          "Each spell … may be warped using its own pool of power
 *                  to a maximum PP of no more than the items level." The
 *                  spell starts at the cost the staff lists.
 *   FLEXIBLE WAND  "freely use its warping options within the confines of
 *                  its PP limits" — from the spell's own base cost (Darkvision
 *                  4) up to the wand's printed PP (6).
 *
 * @returns {Promise<object|null>} the choice to release, or null if cancelled
 *   or over the item's limit
 */
async function chooseItemWarp(actor, item, choice, { flexible = false, ceiling = 0 } = {}) {
  const spell = await spellDocumentFor(actor, choice.name);
  const listed = Math.max(0, Math.floor(Number(choice.basePP ?? choice.pp) || 0));
  const base = flexible && spell ? Math.max(0, Math.floor(Number(spell.system?.ppCost ?? listed) || 0)) : listed;
  const warps = Array.isArray(spell?.system?.warps) ? spell.system.warps : [];
  if (!spell || !warps.length) return { ...choice, pp: base };
  const { buildWarpChooser, aggregateWarpSelection } = await import("./magic/spell-warp.mjs");
  const form = await DialogV2.prompt({
    window: { title: `${choice.name} — Warp?` },
    classes: ["trg-prime", "trg-check-dialog"],
    content: `<p class="hint">Released from <strong>${esc(item.name)}</strong> at ${base} PP. The item pays for any warp, up to <strong>${ceiling} PP</strong> in all.</p>`
      + buildWarpChooser(spell, base),
    ok: {
      label: "Continue",
      callback: (event, button) => {
        const FDE = foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended;
        return new FDE(button.form).object;
      }
    },
    rejectClose: false
  });
  if (form === null || form === undefined) return null;
  const selection = aggregateWarpSelection(warps, form);
  const spent = Math.max(0, Math.floor(Number(selection?.ppSpent) || 0));
  const total = base + spent;
  if (total > ceiling) {
    ui.notifications.warn(`${item.name}: ${choice.name} warped to ${total} PP — this item warps to at most ${ceiling} PP.`);
    return null;
  }
  if (!spent) return { ...choice, pp: base };
  return {
    ...choice,
    pp: total,
    basePP: base,
    warpedFrom: base,
    warpedTo: total,
    // `form` is what `releaseItemSpell` re-aggregates against the spell's
    // own warps, as it does a warp baked in at the workbench.
    warp: { form, mods: selection.mods ?? {}, notes: Array.isArray(selection.notes) ? selection.notes : [] }
  };
}

export async function castFromChargedItem(actor, item) {
  const charged = chargedItemData(item);
  if (!charged) return null;
  // A BROKEN ITEM CASTS NOTHING (3.616.0, R16): Charge Depletion's 41–65,
  // until it is Repaired.
  const { chargedItemBroken } = await import("./magic-items.mjs");
  if (chargedItemBroken(item)) {
    ui.notifications.warn(`${item.name} is broken: it casts nothing until it is Repaired.`);
    return null;
  }
  // A ROD, ONCE A ROUND (3.622.0; Graham's R11 of block 39): "You can only
  // gain the benefits of one magical item with this trait each round …
  // you may only use an item with the trait once per turn."
  const { itemHasTrait } = await import("./trait-rules.mjs");
  const isRod = itemHasTrait(item, "rod");
  if (isRod) {
    const { rodUseRefusal } = await import("./trait-rules-workflow.mjs");
    const refused = rodUseRefusal(actor);
    if (refused) {
      ui.notifications.warn(`${item.name}: ${refused}.`);
      return null;
    }
  }

  const spells = Array.isArray(charged.spells) ? charged.spells : [];
  const remaining = Number(item.system?.uses ?? 0);

  // WHAT TO RELEASE. An item with a spell list offers it; a rod, whose
  // effect is a flat cost written into its own text, asks for the cost.
  // WARPING (Chapter 11). "Each spell that you can cast from a staff may
  // be warped using its own pool of power to a maximum PP of no more
  // than the items level." A wand cannot be warped at the table at all —
  // its cost was fixed when it was made — unless it was built flexible,
  // and a scroll never can. The dialog therefore offers a warp box only
  // where the rules allow one, and SAYS WHY when it does not.
  const warp = warpCeiling({
    kind: charged.kind,
    level: Number(item.system?.itemLevel ?? 0),
    maximumPP: charged.maximumPP,
    flexible: Boolean(charged.flexible)
  });

  let choice = null;
  if (spells.length) {
    // A BAKED-IN WARP HAS TO SHOW. From 3.310.0 the builder can warp a
    // spell into the item at the workbench — which for a wand is not an
    // option but the rule: "the spell in a wand must be warped to the
    // amount of PP that it will be cast with and this amount of PP can
    // never change". `pp` is that warped cost and `basePP` is what the
    // spell prints; showing only the first makes a Wand of Cure look like
    // a 6 PP spell nobody can find in the book, and showing only the
    // second understates what a release costs the item.
    const options = spells.map((s, i) => {
      const base = Number(s.basePP ?? s.pp);
      const warped = Number(s.pp) > base ? ` (${base} warped to ${s.pp})` : "";
      return `<option value="${i}">${esc(s.name)} — ${s.pp} PP${warped}${s.pp > remaining ? " · not enough charge" : ""}</option>`;
    }).join("");
    const bakedNotes = spells
      .flatMap((s) => (s.warp?.notes ?? []).map((n) => `${s.name}: ${n}`))
      .map((n) => `<p class="hint" style="margin:2px 0"><em>Built in — ${esc(n)}</em></p>`)
      .join("");
    // THE WARP IS CHOSEN FROM THE SPELL'S OWN OPTIONS, next (3.615.0, B10
    // of block 36). A "Warp to (PP)" box used to raise the cost and apply
    // nothing — the item paid for a warp whose options were never picked.
    const warpRow = warp.allowed
      ? `<p class="hint" style="margin:2px 0">Warping is chosen next, from the spell's own options — at most ${warp.ceiling} PP in all on this item.</p>`
      : `<p class="hint" style="margin:2px 0"><em>No warping: ${esc(warp.reason)}.</em></p>`;
    const picked = await DialogV2.wait({
      window: { title: `${item.name} — Cast from Item`, icon: "fa-solid fa-wand-sparkles" },
      classes: ["trg-prime"],
      position: { width: 440 },
      content: `<div class="trg-prime trg-check-dialog">
        <p style="margin:0 0 6px">${remaining} of ${charged.maximumPP} PP remaining.</p>
        <div class="form-group"><label>Spell</label><select name="choice">${options}</select></div>
        ${bakedNotes}${warpRow}</div>`,
      buttons: [
        {
          action: "ok", label: "Choose", icon: "fa-solid fa-check", default: true,
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
    choice = spells[Number(picked.choice)] ?? null;
    if (choice && warp.allowed) {
      const warped = await chooseItemWarp(actor, item, choice, { flexible: Boolean(charged.flexible), ceiling: warp.ceiling });
      if (!warped) return null;
      choice = warped;
    }
  } else {
    const entered = await DialogV2.wait({
      window: { title: `${item.name} — Spend Power Points`, icon: "fa-solid fa-wand-sparkles" },
      classes: ["trg-prime"],
      position: { width: 420 },
      content: `<div class="trg-prime trg-check-dialog">
        <p style="margin:0 0 6px">${remaining} of ${charged.maximumPP} PP remaining. This item's effect and its cost are in its own description.</p>
        <div class="form-group"><label>Power points to spend</label>
        <input type="number" name="pp" value="2" min="0" step="1"></div></div>`,
      buttons: [
        {
          action: "ok", label: "Spend", icon: "fa-solid fa-check", default: true,
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
    choice = { name: item.name, pp: Math.max(0, Math.floor(Number(entered.pp) || 0)) };
  }
  if (!choice) return null;

  // THE CHECK IS ROLLED, AND WHAT IT COSTS THE ITEM FOLLOWS FROM IT.
  //
  // Until 3.312.0 everything below this point was a description. The card
  // listed which checks were available and at what difficulty, deducted the
  // spell's full PP from the item regardless, and never cast anything —
  // Graham: "Charged items need to cast."
  //
  // Two things change. The check is actually made (`rollReleaseCheck`), and
  // its degree decides the cost through `castingOutcome` — the same rule an
  // ordinary Spellcraft roll obeys, per Graham's ruling on 14 Aug 2026. A
  // Partial now costs the wand nothing instead of a full charge, which is
  // both kinder and the only reading consistent with casting.
  //
  // A rod, which has no spell list, has no ladder to climb either: its
  // effect and its cost are printed in its own text and the wielder simply
  // spends the points. `rollReleaseCheck` is skipped there, and the spend is
  // what it always was.
  const release = spells.length
    ? await rollReleaseCheck(actor, {
      itemName: item.name,
      spellName: choice.name,
      pp: choice.pp,
      title: `${item.name} — Cast from Item`,
      hint: "An unavailable path is still offered — the GM may allow the attempt. A Partial costs the item nothing; a Failure costs it half."
    })
    : null;
  // Cancelled at the ladder: nothing spent, nothing cast, no card. The
  // spell was chosen but never released.
  if (spells.length && !release) return null;

  const ppSpent = release ? release.outcome.ppSpent : choice.pp;

  // OVERSPENDING IS ALLOWED, because that is what the depletion table is
  // for — "rolled whenever a charged item's PP is reduced below 0". The
  // pool is then emptied rather than left negative: the overspend is
  // what triggers the roll, and a wand holding minus four power points
  // is not a state the chapter describes. Flagged to Graham as a
  // ruling, since the book says what triggers the roll and not what the
  // pool reads afterwards.
  const after = remaining - ppSpent;
  const overspent = Math.max(0, -after);
  const stored = Math.max(0, after);
  const lines = [
    line(choice.warpedTo
      ? `Releases <strong>${esc(choice.name)}</strong>, warped from ${choice.warpedFrom} to <strong>${choice.warpedTo} PP</strong>.`
      : `Releases <strong>${esc(choice.name)}</strong> for <strong>${choice.pp} PP</strong>${
  Number(choice.basePP ?? choice.pp) < Number(choice.pp) ? ` (${choice.basePP} printed, warped when the item was made)` : ""}.`),
    ...((choice.warp?.notes ?? []).map((n) => line(`<em>Built in — ${esc(n)}</em>`)))
  ];
  if (release) {
    lines.push(release.outcome.cast
      ? line(`<strong>${esc(release.option.label)} holds</strong> — the spell is released${
        ppSpent < choice.pp ? `, and the ${release.degree} discounts it to ${ppSpent} PP` : ""}.`)
      : release.degree === "partial"
        ? line("<strong>The release falters</strong> — nothing comes out, and the item is untouched.")
        : line(`<strong>The release fails</strong> — nothing is cast, and the item loses ${ppSpent} PP.`));
  }
  lines.push(overspent
    ? line(`${item.name}: <strong>0</strong> of ${charged.maximumPP} PP — overspent by ${overspent}, which triggers Charge Depletion.`)
    : line(`${item.name}: <strong>${stored}</strong> of ${charged.maximumPP} PP remaining.`));

  await item.update({ "system.uses": stored });
  if (isRod) {
    const { stampRodUse } = await import("./trait-rules-workflow.mjs");
    await stampRodUse(actor, item);
  }
  await postCard(actor, `${item.name} — Cast from Item`, lines);

  // "Charge Depletion is rolled whenever a charged item's PP is reduced
  // below 0" — the table already existed; nothing had ever driven it.
  //
  // NOT YET WHEN THE RELEASE HELD (3.616.0, F2 of the 3.615.0 drive): the
  // spell can still be refused below, and a refused spell gives the PP
  // back, so the roll waits until the spell is out.
  const releaseHeld = Boolean(release?.outcome.cast);
  if (after < 0 && !releaseHeld) await rollItemDepletion(actor, item);

  // AND NOW IT CASTS. Dynamically imported to keep this file and
  // consumable-use-workflow from importing each other in a cycle — the same
  // treatment cast-workflow already gets throughout this module.
  //
  // The release check is handed over as `itemCheck`: for an attack spell it
  // IS the attack roll, exactly as a caster's own Spellcraft roll is theirs
  // (Graham, 14 Aug 2026). The item's AP cost is the spell's own casting AP,
  // which arrives for free by going through `castSpell` rather than around
  // it.
  //
  // `release?.` AND NOT `!release ||`. A rod has no spell list, so it never
  // climbs the ladder and `release` is null BY DESIGN — the earlier form
  // read that null as "no check was needed, go ahead" and sent every rod
  // into the spell resolver hunting for a spell named after the rod. It
  // found none and told the player so on every single use. Nothing else
  // moved (a rod casts nothing either way and its spend was already right),
  // which is exactly why it survived until a harness drove a rod and read
  // the notifications. Found by verify-item-cast, 14 Aug 2026.
  let castResult = null;
  if (release?.outcome.cast) {
    const { releaseItemSpell } = await import("./consumable-use-workflow.mjs");
    const released = await releaseItemSpell(actor, item, {
      name: choice.name,
      uuid: choice.uuid ?? "",
      pp: choice.pp,
      warp: choice.warp ?? null
    }, {
      kind: charged.kind ?? "",
      itemCheck: release?.check ?? null
    });
    if (released.missing) {
      ui.notifications.warn(
        `${item.name} carries "${choice.name}", which is not in this world or its spell compendium.`
      );
    }
    castResult = released.result;
    // NOTHING CAST, NOTHING PAID (3.616.0, F2 of the 3.615.0 drive). The
    // item paid on the release, and only then did `castSpell` ask its own
    // questions — the AP shortfall, Cure's 1 or 2 AP, the targets. Backing
    // out of any of them cast nothing and left the wand poorer. A spell
    // missing from the world is the item's data at fault, not the
    // player's, so it is refunded too.
    if (!castResult) {
      await item.update({ "system.uses": remaining });
      await postCard(actor, `${item.name} — Cast from Item`, [
        line(`Nothing was cast, so <strong>${item.name}</strong> keeps its ${ppSpent} PP: <strong>${remaining}</strong> of ${charged.maximumPP} PP.`)
      ]);
      return { spell: choice, remaining, overspent: 0, ppSpent: 0, release, cast: false, refunded: true };
    }
    if (after < 0) await rollItemDepletion(actor, item);
  }

  return { spell: choice, remaining: stored, overspent, ppSpent, release, cast: Boolean(castResult) };
}

/**
 * Daily preparation: "during daily preparation, an invested, charged
 * item will regain 1 PP for every 10 PP (or part thereof) it has at
 * maximum charge each day."
 *
 * Returns the lines for the daily-preparation card, so a player can see
 * what recovered — an item silently topping itself up is indistinguishable
 * from one that is broken.
 */
export async function rechargeChargedItems(actor) {
  const updates = [];
  const lines = [];
  for (const item of chargedItemsOf(actor)) {
    const charged = chargedItemData(item);
    const max = Math.max(0, Math.floor(Number(charged.maximumPP) || 0));
    const current = Number(item.system?.uses ?? 0);
    // A FUMBLED RECHARGE ITEM BLOCKS THIS (Chapter 4, page 91): "Your
    // efforts not only fail but block the items natural recharging
    // process. The item regains no PP during this 24-hour period."
    //
    // A TIMESTAMP RATHER THAN A FLAG TO SWEEP, because the block is 24
    // hours and Daily Preparation is not reliably 24 hours apart — a
    // party that rests twice in a day would clear it early, and one that
    // pushes through two days would carry it. It expires by world time,
    // which is the only thing that matches "this 24-hour period".
    const blockedUntil = Number(item.flags?.[SYSTEM_ID]?.rechargeBlockedUntil ?? 0);
    if (blockedUntil > Number(game?.time?.worldTime ?? 0)) {
      lines.push(`${item.name} recovers nothing — its recharging is blocked by a fumbled Recharge Item.`);
      continue;
    }
    // THE PRINTED RECHARGE, where the book prints one (3.615.0, R18).
    const gain = itemRecharge(charged, { invested: Boolean(item.system?.invested) });
    if (!gain) {
      // Worth saying. An uninvested item recovering nothing is the rule
      // working, but it looks identical to the rule not running.
      if (current < max) {
        lines.push(`${item.name} recovers nothing — it is not invested.`);
      }
      continue;
    }
    if (current >= max) continue;
    const next = Math.min(max, current + gain);
    updates.push({ _id: item.id, "system.uses": next });
    lines.push(`${item.name} regains ${next - current} PP (${next} of ${max}).`);
  }
  if (updates.length) await actor.updateEmbeddedDocuments("Item", updates);
  return lines;
}

/**
 * A ROD PAYS FOR ITS POWER (3.616.0, Graham's R12–R14 of block 36): a
 * metamagic rod's Extend or Quicken, the PP a Rod of the Magi or a Sceptre
 * of the Clergy lends a spell, a Rod of Accuracy's bonus, a Rod of
 * Alertness's advantage. The same overspend rule as a release: the pool
 * empties, and below 0 rolls Charge Depletion.
 *
 * @returns {Promise<string>} the card line
 */
export async function spendFromRod(actor, item, pp) {
  const { rodPaysLine } = await import("./rod-powers.mjs");
  // THE ROUND'S ROD (3.622.0; R11) — see trait-rules-workflow.mjs.
  const { stampRodUse } = await import("./trait-rules-workflow.mjs");
  await stampRodUse(actor, item);
  const cost = Math.max(0, Math.floor(Number(pp) || 0));
  const before = Number(item.system?.uses ?? 0);
  const after = before - cost;
  const charged = chargedItemData(item);
  await item.update({ "system.uses": Math.max(0, after) });
  if (after < 0) await rollItemDepletion(actor, item);
  return rodPaysLine({ name: item.name }, cost, after, charged.maximumPP);
}
