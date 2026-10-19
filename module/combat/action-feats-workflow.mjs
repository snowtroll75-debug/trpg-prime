/**
 * The Foundry side of the eleven action-economy feats.
 *
 * See action-feats.mjs for the rules and for why the multiple attack
 * penalty is the part of this batch most likely to go wrong.
 *
 * EVERY STRIKE GOES THROUGH `strikePlan`. The previous batch shipped a
 * feat rolled at the wrong penalty because its table said one thing and
 * its call site did another; here there is exactly one place that turns
 * a feat's declared rule into attack options, and exactly one that
 * advances the counter afterwards.
 */

import { hasFreeHandAvailable } from "../held-items.mjs";
import { hasQuickLoadTrait, needsReloading } from "./reload.mjs";
import { spendActionCost } from "./action-points-workflow.mjs";
import { activeToken, distanceBetween } from "./geometry.mjs";
import { hitLocationFromUnitDie } from "./hit-location.mjs";
import { chooseMeleeAttack, usableAttacks } from "./strike.mjs";
import {
  ACTION_FEATS,
  SWIPE_MAX_TARGETS,
  VITAL_STRIKE_LOCATIONS,
  actionFeatState,
  distractingStrike,
  ladderOwed,
  mapPlanFor,
  nextResultAtLocation,
  stridingCharge,
  sweepAppliesToAll,
  swipeOutcome
} from "./action-feats.mjs";

const SYSTEM_ID = "trg-prime";
const { DialogV2 } = foundry.applications.api;

const line = (text) => `<p style="margin:2px 0">${text}</p>`;
const esc = (text) => String(text ?? "").replace(
  /[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/**
 * The line a feat prints when the attack workflow refused its Strikes.
 *
 * EXPORTED SO IT CAN BE DRIVEN. Left private, the only thing a harness
 * could do was assert the sentence exists somewhere in the file — and a
 * mutation that made it unreachable left the sentence exactly where it
 * was. Reading found nothing; running finds it at once.
 */
export function refusedLine(checks) {
  const refused = checks?.refused ?? 0;
  if (!refused) return "";
  return line(refused === 1 && (checks?.resolved ?? 0) === 0
    ? "<strong>No Strike was made</strong> — see the warning above for why. The multiple attack penalty was not advanced."
    : `<strong>${refused} of the Strikes could not be made</strong> — see the warning above for why.`);
}

async function card(actor, title, lines) {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="trg-prime trg-check-card"><h3 style="margin:0 0 4px 0">${esc(title)}</h3>${lines.filter(Boolean).join("")}</div>`
  });
}

/* ------------------------------------------------------------------ */
/* Reading the sheet for the requirement questions                     */
/* ------------------------------------------------------------------ */

/**
 * What `meetsRequirement` asks about, read off a live actor.
 *
 * EXPORTED AND PLAIN, so the harness drives the real reading rather than
 * a description of it — the same discipline as the reaction feats'
 * `actorReactionState`.
 */
export function actorActionState(actor) {
  const items = Array.from(actor?.items ?? []);
  const size = actor?.system?.identity?.size ?? "medium";
  const equipped = items.filter((i) => i.system?.equipped && i.type === "weapon");
  const ranged = equipped.find((w) => w.system?.attackMode === "missile" || w.system?.attackMode === "ranged");

  return {
    freeHand: hasFreeHandAvailable(items, size),
    rangedWeapon: Boolean(ranged),
    // "…and can reload it for 0 actions." A weapon that needs no
    // reloading at all qualifies, and so does one whose Quick Load makes
    // the first reload of the round free — which is exactly the pair of
    // cases the bow family splits into.
    freeReload: Boolean(ranged) && (
      !needsReloading(ranged.system?.traits) || hasQuickLoadTrait(ranged.system?.traits)
    ),
    knife: equipped.some((w) => String(w.system?.group ?? "").trim().toLowerCase() === "knife"),
    flankers: countFlankers(actor)
  };
}

/** How many enemies are adjacent on opposite sides — Reverse Strike's gate. */
function countFlankers(actor) {
  const mine = activeToken(actor);
  if (!mine) return 0;
  return (canvas?.tokens?.placeables ?? []).filter((t) => {
    if (!t.actor || t.id === mine.id) return false;
    if (Number(t.document?.disposition ?? 0) === Number(mine.document?.disposition ?? 0)) return false;
    const feet = distanceBetween(mine, t);
    return feet !== null && feet <= 5;
  }).length;
}

/** The feat's state on this actor, requirements included. */
export function featStateFor(actor, featName) {
  return actionFeatState(featName, actorActionState(actor));
}

/* ------------------------------------------------------------------ */
/* Striking                                                            */
/* ------------------------------------------------------------------ */

/**
 * Roll a feat's Strikes and settle the multiple attack penalty once.
 *
 * ONE PLACE. `mapPlanFor` says how many Strikes, whether each is frozen,
 * and how far the counter then moves; this is the only code that acts on
 * that answer. Double Slice established the shape (roll frozen, then
 * advance by hand) and this generalises it.
 *
 * @returns {Array} the checks, in order
 */
export async function strikePlan(actor, weapon, featKey, { extraModifiers = [], targetsPerStrike = [] } = {}) {
  const entry = ACTION_FEATS[featKey];
  const plan = mapPlanFor(entry?.map);
  const { rollWeaponAttack } = await import("./attack-workflow.mjs");

  const before = Number(actor.getFlag(SYSTEM_ID, "attackCount") ?? 0);
  const checks = [];

  // NO WEAPON, NO STRIKE — and said, not thrown. `meleeWeapon` returns
  // null for a character carrying nothing usable, and handing that to
  // `rollWeaponAttack` threw on the target prompt's `weapon.name`. The
  // feat's AP is already spent by then, so an exception here would leave
  // the action half-taken with nothing on the card to explain it.
  // ONE ENDING, NOT TWO. This used to return here with its own hand-made
  // record, which meant the "what does the ladder owe" rule below was
  // never reached on the commonest refusal there is. Falling through to
  // the shared ending instead — with no Strikes rolled — is both simpler
  // and the only way a harness can drive the two together.
  const noWeapon = !weapon;
  if (noWeapon) {
    ui.notifications.warn(`${entry?.label ?? "This feat"}: you have no weapon to strike with.`);
  }
  for (let i = 0; noWeapon ? false : i < plan.strikes; i += 1) {
    const token = targetsPerStrike[i] ?? null;
    if (token) token.setTarget(true, { user: game.user, releaseOthers: true });
    checks.push(await rollWeaponAttack(actor, weapon, {
      apPaid: true,               // the feat already charged its own AP
      mapFrozen: plan.frozen,
      skipTargetPrompt: Boolean(token),
      extraModifiers: [
        ...extraModifiers,
        ...(entry?.strikePenalty
          ? [{ label: `${entry.label} (${entry.strikePenalty})`, value: entry.strikePenalty, type: "circumstance" }]
          : [])
      ]
    }));
  }
  // ADVANCED ONCE, AFTER ALL OF THEM, AND ONLY FOR STRIKES THAT
  // HAPPENED. `advanceBy: 0` means the attack workflow already did it
  // for an ordinary Strike; adding to it here would move the ladder
  // twice. And a Strike the workflow REFUSED — no ammunition, no reach,
  // no free hand — rolled nothing and owes nothing. See `ladderOwed`.
  const resolved = checks.filter(Boolean).length;
  const owed = ladderOwed(plan.advanceBy, resolved);
  if (owed > 0) {
    await actor.setFlag(SYSTEM_ID, "attackCount", before + owed);
  }
  // AND THE CARD SAYS SO. A feat that charged its AP and produced no
  // Strike is the most confusing possible outcome; the warning that
  // refused it scrolls away, and the summary card would otherwise
  // describe an action that never happened.
  return Object.assign(checks, { resolved, refused: plan.strikes - resolved });
}

/* ------------------------------------------------------------------ */
/* Choosers                                                            */
/* ------------------------------------------------------------------ */

async function chooseFrom(title, label, options) {
  if (!options.length) return null;
  const opts = options.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("");
  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-hand-fist" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog"><div class="form-group stacked">`
      + `<label>${esc(label)}</label><select name="choice">${opts}</select></div></div>`,
    buttons: [
      { action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
        callback: (e, b) => new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(b.form ?? b.closest("form")).object },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return null;
  return result.choice ?? null;
}

/** Tick-list of nearby enemies — Striding Charge's path, Swipe's arc. */
async function chooseMany(title, label, tokens) {
  if (!tokens.length) return [];
  const rows = tokens.map((t, i) =>
    `<div class="form-group"><label><input type="checkbox" name="t${i}" value="${t.id}"> ${esc(t.actor?.name ?? "creature")}</label></div>`
  ).join("");
  const result = await DialogV2.wait({
    window: { title, icon: "fa-solid fa-people-line" },
    classes: ["trg-prime"],
    position: { width: 460 },
    content: `<div class="trg-prime trg-check-dialog">${line(esc(label))}${rows}</div>`,
    buttons: [
      { action: "ok", label: "Confirm", icon: "fa-solid fa-check", default: true,
        callback: (e, b) => new (foundry.applications?.ux?.FormDataExtended ?? globalThis.FormDataExtended)(b.form ?? b.closest("form")).object },
      { action: "cancel", label: "Cancel", icon: "fa-solid fa-xmark" }
    ],
    rejectClose: false
  });
  if (!result || result === "cancel") return [];
  const chosen = Object.values(result).filter(Boolean);
  return tokens.filter((t) => chosen.includes(t.id));
}

/** Enemies within `feet` of this actor. */
export function nearbyEnemies(actor, feet = 5) {
  const mine = activeToken(actor);
  if (!mine) return [];
  return (canvas?.tokens?.placeables ?? []).filter((t) => {
    if (!t.actor || t.id === mine.id) return false;
    if (Number(t.document?.disposition ?? 0) === Number(mine.document?.disposition ?? 0)) return false;
    const d = distanceBetween(mine, t);
    return d !== null && d <= feet;
  });
}

function meleeWeapon(actor) {
  const attacks = usableAttacks(Array.from(actor?.items ?? []));
  return attacks.find((w) => w.system?.attackMode === "melee") ?? attacks[0] ?? null;
}

/** The action feats whose Strike is made with a melee weapon. */
const MELEE_WEAPON_FEATS = new Set([
  "combat grapple", "distracting strike", "quick draw", "reverse strike",
  "skirmish", "striding charge", "swipe", "vital strike"
]);

/* ------------------------------------------------------------------ */
/* The eleven                                                          */
/* ------------------------------------------------------------------ */

/**
 * Run one action feat.
 *
 * The AP is charged here, once, from the table — so no handler can
 * forget to pay for itself or invent a different price.
 */
export async function runActionFeat(actor, item) {
  const state = featStateFor(actor, item?.name);
  if (!state.known) return null;
  if (!state.usable) {
    ui.notifications.warn(`${state.label}: ${state.reason}.`);
    return null;
  }
  const entry = ACTION_FEATS[state.key];
  const chosen = MELEE_WEAPON_FEATS.has(state.key) ? await chooseMeleeAttack(actor, entry.label) : undefined;
  if (chosen === null) return null;
  if (entry.apCost !== "0") {
    await spendActionCost(actor, entry.apCost, entry.label, { traits: entry.traits });
  }
  const run = RUN[state.key];
  return run ? run(actor, item, entry, chosen ?? null) : null;
}

const RUN = {
  async "combat grapple"(actor, item, entry, chosen = null) {
    const weapon = chosen ?? meleeWeapon(actor);
    const checks = await strikePlan(actor, weapon, "combat grapple");
    const check = checks[0];
    const hit = Boolean(check?.attackOutcome?.hits);
    await card(actor, entry.label, [
      refusedLine(checks),
      line(hit
        ? `<strong>${esc(actor.name)}</strong> lands the blow and takes hold with the free hand — the target is <strong>Grabbed</strong>.`
        : `<strong>${esc(actor.name)}</strong> misses, and there is nothing to take hold of.`),
      hit ? line("<em>Grabbed until the end of your next turn, or until they Escape.</em>") : ""
    ]);
  },

  async "distracting strike"(actor, item, entry, chosen = null) {
    const weapon = chosen ?? meleeWeapon(actor);
    const checks = await strikePlan(actor, weapon, "distracting strike");
    const check = checks[0];
    const result = distractingStrike({
      hits: Boolean(check?.attackOutcome?.hits),
      critical: Boolean(check?.attackOutcome?.critical)
    });
    await card(actor, entry.label, [
      refusedLine(checks),
      line(result.flatFooted
        ? `The blow lands as a distraction — the target is <strong>flat-footed</strong> until the beginning of their next turn.`
        : `The manoeuvre misses.`),
      result.flatFooted
        ? line(result.damage
          ? "<em>A critical, so it deals its <strong>normal damage</strong> as well.</em>"
          : "<em>It deals <strong>no damage</strong> — that is the trade.</em>")
        : ""
    ]);
  },

  async "double shot"(actor, item, entry, chosen = null) {
    const foes = nearbyEnemies(actor, 999);
    const picks = await chooseMany(entry.label, "Two different targets — tick exactly two:", foes);
    if (picks.length !== 2) {
      ui.notifications.warn(`${entry.label}: pick exactly two different targets.`);
      return;
    }
    const weapon = Array.from(actor.items).find((i) => i.type === "weapon" && i.system?.equipped
      && (i.system?.attackMode === "missile" || i.system?.attackMode === "ranged"));
    const checks = await strikePlan(actor, weapon, "double shot", { targetsPerStrike: picks });
    await card(actor, entry.label, [
      refusedLine(checks),
      line(`Two shots, at <strong>${esc(picks[0].actor?.name)}</strong> and <strong>${esc(picks[1].actor?.name)}</strong>, each at <strong>-2</strong>.`),
      line("<em>Both count toward your multiple attack penalty, but it did not climb between them.</em>")
    ]);
  },

  async "quick draw"(actor, item, entry, chosen = null) {
    const weapon = chosen ?? meleeWeapon(actor);
    const checks = await strikePlan(actor, weapon, "quick draw");
    await card(actor, entry.label, [
      refusedLine(checks),
      line(`<strong>${esc(actor.name)}</strong> draws and strikes in one motion — the Interact and the Strike together for <strong>1 AP</strong>.`)
    ]);
  },

  async "reverse strike"(actor, item, entry, chosen = null) {
    const foes = nearbyEnemies(actor, 5);
    const picks = await chooseMany(entry.label, "Two of the enemies flanking you — tick exactly two:", foes);
    if (picks.length !== 2) {
      ui.notifications.warn(`${entry.label}: pick exactly two flanking enemies.`);
      return;
    }
    const weapon = chosen ?? meleeWeapon(actor);
    const checks = await strikePlan(actor, weapon, "reverse strike", { targetsPerStrike: picks });
    await card(actor, entry.label, [
      refusedLine(checks),
      line(`<strong>${esc(actor.name)}</strong> turns the flank against itself — one Strike each at `
        + `<strong>${esc(picks[0].actor?.name)}</strong> and <strong>${esc(picks[1].actor?.name)}</strong>.`),
      line("<em>Both at the same multiple attack penalty, and together they count as one attack for raising it.</em>")
    ]);
  },

  async skirmish(actor, item, entry, chosen = null) {
    const weapon = chosen ?? meleeWeapon(actor);
    const checks = await strikePlan(actor, weapon, "skirmish");
    await card(actor, entry.label, [
      refusedLine(checks),
      line(`<strong>${esc(actor.name)}</strong> strikes and steps — both for <strong>1 AP</strong>.`),
      line("<em>Take the Step in whichever order you like; move your token to match.</em>")
    ]);
  },

  async "striding charge"(actor, item, entry, chosen = null) {
    const inTheWay = nearbyEnemies(actor, 60);
    const blockers = await chooseMany(entry.label,
      "Tick every creature you are barging through, in the order you meet them:", inTheWay);
    const { TRGCheck } = await import("../dice/check.mjs");
    const results = [];
    for (const token of blockers) {
      const dc = Number(token.actor?.system?.combat?.saves?.fortitude?.dc
        ?? 10 + Number(token.actor?.system?.identity?.level ?? 0));
      const check = await TRGCheck.roll({
        actor, label: `${entry.label} — Athletics`, subtitle: `through ${token.actor?.name}`,
        type: "skill", dc
      });
      results.push({ name: token.actor?.name ?? "a creature", dc, roll: Number(check?.outcome?.total ?? 0) });
    }
    const outcome = stridingCharge(results);
    await card(actor, entry.label, [
      ...outcome.passed.map((p) => line(`Barged past <strong>${esc(p.name)}</strong> (DC ${p.dc}).`)),
      outcome.stoppedBy
        ? line(`<strong>Stopped</strong> before <strong>${esc(outcome.stoppedBy.name)}</strong> (DC ${outcome.stoppedBy.dc}) — your movement ends there.`)
        : line("<strong>You reach your target</strong> — take the 1 AP Attack action now."),
      line("<em>This movement does not provoke reactions.</em>")
    ]);
  },

  async swipe(actor, item, entry, chosen = null) {
    const foes = nearbyEnemies(actor, 5);
    const picks = await chooseMany(entry.label,
      `Up to ${SWIPE_MAX_TARGETS} adjacent foes to catch in the arc:`, foes);
    if (!picks.length) return;
    const weapon = chosen ?? meleeWeapon(actor);
    // TARGET THE FIRST OF THE ARC. Without this the player is asked who
    // is in the arc and then asked AGAIN who to hit — two target
    // questions for one action, found in the live pass. The Strike is
    // rolled against the first pick; the second is a comparison on the
    // card, which is exactly what "compare the attack result to the DB
    // of up to two adjacent foes" describes.
    const checks = await strikePlan(actor, weapon, "swipe", { targetsPerStrike: [picks[0]] });
    const check = checks[0];
    const total = Number(check?.outcome?.total ?? 0);
    const results = swipeOutcome(total, picks.map((t) => ({
      name: t.actor?.name,
      db: Number(t.actor?.system?.combat?.defence?.total ?? t.actor?.system?.combat?.defence ?? 0)
    })));
    await card(actor, entry.label, [
      refusedLine(checks),
      line(`One arc, result <strong>${total}</strong>:`),
      ...results.map((r) => line(`<strong>${esc(r.name)}</strong> — DB ${r.db}: ${r.hit ? "<strong>hit</strong>" : "missed"}.`)),
      line("<em>One damage roll, applied to each it reached — resolve it against each of their own DR.</em>"),
      sweepAppliesToAll(weapon?.system?.traits)
        ? line("<em>Sweep: its modifier applies to <strong>all</strong> Swipe attacks, not only the second.</em>")
        : "",
      line("<em>This counts as <strong>two</strong> attacks for your multiple attack penalty.</em>")
    ]);
  },

  async "vital strike"(actor, item, entry, chosen = null) {
    const location = await chooseFrom(entry.label, "Aim for which location?",
      Object.entries(VITAL_STRIKE_LOCATIONS).map(([k, v]) => [k, v]));
    if (!location) return;
    const weapon = chosen ?? meleeWeapon(actor);
    const checks = await strikePlan(actor, weapon, "vital strike");
    const check = checks[0];
    const critical = Boolean(check?.attackOutcome?.critical);
    await card(actor, entry.label, [
      refusedLine(checks),
      line(`<strong>${esc(actor.name)}</strong> aims for the <strong>${esc(VITAL_STRIKE_LOCATIONS[location])}</strong>.`),
      critical
        ? line(`<em>A critical — when you roll the injury, you may step the result up to the next one that strikes the ${esc(VITAL_STRIKE_LOCATIONS[location])}. `
          + `From a roll of R that is <strong>${esc(String(nextResultAtLocation(1, location, hitLocationFromUnitDie)))}</strong> and every tenth after it.</em>`)
        : line("<em>No critical, so the aim buys nothing this time.</em>")
    ]);
    if (critical) await actor.setFlag(SYSTEM_ID, "vitalStrikeLocation", location);
  },

  async "void step"(actor, item, entry, chosen = null) {
    const watchers = nearbyEnemies(actor, 60);
    const pick = await chooseFrom(entry.label, "Slip out of whose sight?",
      watchers.map((t) => [t.id, t.actor?.name ?? "creature"]));
    const target = watchers.find((t) => t.id === pick) ?? null;
    const { TRGCheck } = await import("../dice/check.mjs");
    const dc = Number(target?.actor?.system?.combat?.perception?.dc
      ?? 10 + Number(target?.actor?.system?.identity?.level ?? 0));
    const check = target
      ? await TRGCheck.roll({ actor, label: `${entry.label} — Stealth`, subtitle: `against ${target.actor?.name}`, type: "skill", dc })
      : null;
    const hidden = Boolean(check && Number(check.outcome?.total ?? 0) >= dc);
    await card(actor, entry.label, [
      line("<strong>Stride</strong> without provoking reactions."),
      target
        ? line(hidden
          ? `<strong>Hidden</strong> from <strong>${esc(target.actor?.name)}</strong> until the start of your next turn.`
          : `<strong>${esc(target.actor?.name)}</strong> keeps you in sight.`)
        : line("<em>No watcher chosen — the movement alone is the benefit.</em>"),
      hidden ? line("<em>It ends the moment you attack or do anything else noticeable.</em>") : ""
    ]);
  }
};

/** Knife Flurry is triggered, not pressed — see action-feat-detection.mjs. */
export async function runKnifeFlurry(actor) {
  const entry = ACTION_FEATS["knife flurry"];
  const state = featStateFor(actor, "Knife Flurry");
  if (!state.usable) {
    ui.notifications.warn(`${entry.label}: ${state.reason}.`);
    return null;
  }
  const { resolveAction } = await import("./action-workflow.mjs");
  const { SKILL_ACTIONS } = await import("../data/skill-actions.mjs");
  const feint = (SKILL_ACTIONS ?? []).find((a) => a.key === "feint");
  await card(actor, entry.label, [
    line(`<strong>${esc(actor.name)}</strong> follows the knife with a feint — <strong>0 AP</strong>.`),
    line("<em>It carries the attack trait, so your multiple attack penalty applies and then climbs.</em>")
  ]);
  if (feint) await resolveAction(actor, { ...feint, apCost: "0" });
  // THE PENALTY CLIMBS. "This action has the attack trait and is
  // therefore subject to your multiple attack penalty" — subject to it
  // means it is one of your attacks, so it advances the ladder too.
  const before = Number(actor.getFlag(SYSTEM_ID, "attackCount") ?? 0);
  await actor.setFlag(SYSTEM_ID, "attackCount", before + 1);
  return true;
}
