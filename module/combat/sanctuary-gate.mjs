/**
 * THE SANCTUARY GATE (3.598.0) — the half that touches the world.
 *
 * The rule itself is in magic/sanctuary.mjs, which is pure and which the
 * harness drives without a Foundry actor. This file finds the ward, rolls
 * the opponent's save, records the verdict and posts the card.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THE SPLIT, AND WHY THE GATE SITS WHERE IT DOES.
 *
 * "The creature can't attack the target and WASTES THE ACTION" and "can't
 * ATTEMPT further attacks … this turn" are two different costs, so the gate
 * has to sit either side of the AP spend:
 *
 *   an opponent already locked out   — cannot attempt it at all, pays nothing
 *   an opponent who fails the save   — the action IS wasted, so AP is spent
 *
 * `sanctuaryCheck` is therefore called BEFORE the spend and answers both
 * questions at once; the caller spends as it normally would and then honours
 * `blocked`. Spending here instead would have meant duplicating the Fight
 * Defensively and reaction logic that decides whether a Strike costs
 * anything — a rule hand-rolled at a second call site.
 */

import {
  SANCTUARY_FLAG, sanctuaryBlockedTurnLine, sanctuaryFumbledLine, sanctuaryPassedLine,
  sanctuaryRecordAfter, sanctuaryStillBlockedLine, sanctuaryVerdict, SANCTUARY
} from "../magic/sanctuary.mjs";

// The system id, as every other module in this tree declares it: a local
// const rather than a shared export, which is the established convention.
const SYSTEM_ID = "trg-prime";

/*
 * WHO ROLLED, PER CREATURE RATHER THAN PER SHEET (3.609.1, the 3.609.0
 * live test's F5). Both wards remembered an opponent by `actor.id`, which
 * every unlinked token of one NPC shares: after one goblin rolled against
 * Visage Of Horror, its twin attacked with no save at all. An unlinked
 * creature is remembered by its token; a linked one by its actor, which is
 * the key every record written before this release already uses. No dots —
 * the key becomes a flag path.
 */
function opponentKey(attacker) {
  const tokenId = attacker?.isToken ? attacker?.token?.id : null;
  return tokenId ? `token-${tokenId}` : String(attacker?.id ?? "");
}

/** The flag that marks an effect as a Sanctuary ward. */
export const WARD_FLAG = "sanctuaryWard";

/**
 * The active Sanctuary wards on this creature.
 *
 * `appliedEffects` FIRST, so a suppressed ward does not protect — the same
 * read `missChanceAvoidance` uses for See Invisible.
 */
export function sanctuaryWardsOn(actor) {
  return Array.from(actor?.appliedEffects ?? actor?.effects ?? [])
    .filter((e) => !e.disabled && e.getFlag?.(SYSTEM_ID, WARD_FLAG));
}

/** The round now, or null when no combat is running. */
export function currentRound() {
  const round = game.combat?.round;
  return Number.isFinite(Number(round)) && Number(round) > 0 ? Number(round) : null;
}

/**
 * May `attacker` attack `targetActor`?
 *
 * Rolls the Will save when the opponent has not faced this ward yet, records
 * the verdict on the ward, and posts a card for whatever happened.
 *
 * @returns {Promise<{blocked: boolean, wastesAction: boolean}>} whether the
 *   attack must not happen, and whether the page says the action is spent
 *   anyway. THE TWO ARE NOT THE SAME: a failed save "wastes the action",
 *   while an opponent already locked out "can't ATTEMPT" it and pays
 *   nothing. The caller spends between the two answers.
 */
export async function sanctuaryCheck(attacker, targetActor, sourceName = "the attack") {
  /*
   * ONE DOOR FOR EVERYTHING AN ATTACK MUST GET PAST (3.609.0). Sanctuary
   * first, then Visage Of Horror, then the attacker's own Painful Rebuke.
   * Every call site that asks this already sits where an attack or a
   * targeted spell is committed, so the two new rules are asked there too
   * without a second import anybody could forget. See
   * magic/aggression-wards.mjs.
   */
  const ward = await sanctuaryOnlyCheck(attacker, targetActor, sourceName);
  if (ward.blocked) return { ...ward, blockedBy: "Sanctuary" };
  const horror = await horrorCheck(attacker, targetActor, sourceName);
  if (!horror.blocked) await rebukeCheck(attacker, targetActor, sourceName);
  return horror.blocked
    ? { blocked: true, wastesAction: horror.wastesAction, blockedBy: "Visage Of Horror" }
    : { blocked: false, wastesAction: false, blockedBy: null };
}

/** Sanctuary's own gate — what `sanctuaryCheck` did alone before 3.609.0. */
async function sanctuaryOnlyCheck(attacker, targetActor, sourceName = "the attack") {
  const wards = sanctuaryWardsOn(targetActor);
  if (!wards.length || !attacker) return { blocked: false, wastesAction: false };

  const round = currentRound();
  const lines = [];
  let blocked = false;
  let wastesAction = false;

  for (const ward of wards) {
    const record = ward.getFlag(SYSTEM_ID, SANCTUARY_FLAG) ?? {};
    const verdict = sanctuaryVerdict(record, opponentKey(attacker), round);

    if (verdict.blocked) {
      // ALREADY LOCKED OUT: no roll, no cost, and said out loud so the table
      // knows why the button did nothing.
      lines.push(sanctuaryStillBlockedLine(attacker.name, targetActor.name, verdict.reason));
      blocked = true;
      continue;
    }
    if (!verdict.mustSave) continue;   // this opponent has already passed

    const { TRGCheck } = await import("../dice/check.mjs");
    const save = attacker.system?.combat?.saves?.will;
    const dc = Number(ward.getFlag(SYSTEM_ID, "sanctuaryDC") ?? 0) || null;
    const check = await TRGCheck.roll({
      actor: attacker,
      label: `${attacker.name} — Will Save`,
      subtitle: `vs Sanctuary on ${targetActor.name}${dc ? ` — DC ${dc}` : " — DC not recorded"}`,
      type: "save",
      saveSource: "Sanctuary",
      subject: "will",
      dc,
      // THE SAME AXES THE CAST-TIME SAVE GETS. This roll opens no dialog, so
      // a fact the engine is not told here can never be asked about later —
      // the lesson the Ascendan's "-2 against divine magic" taught when it
      // was authored, offered on a sheet roll, and silently absent from the
      // one save that provoked it.
      traits: String(ward.getFlag(SYSTEM_ID, "sanctuaryTraits") ?? ""),
      traditions: String(ward.getFlag(SYSTEM_ID, "sanctuaryTradition") ?? ""),
      sourceUuid: String(ward.getFlag(SYSTEM_ID, "sanctuaryCaster") ?? ""),
      modifiers: save?.checkModifiers ?? [
        { label: "Will save", value: Number(save?.total ?? 0), type: "untyped" }
      ]
    });
    const degree = check?.outcome?.degree?.key ?? null;
    if (!degree) {
      // A ROLL WITH NO DEGREE DECIDES NOTHING, and must not be recorded as a
      // pass — a cancelled or DC-less save leaves the ward exactly as it was.
      lines.push(`<em>${attacker.name}'s Will save against Sanctuary produced no degree — `
        + "the table decides whether the attack proceeds.</em>");
      continue;
    }
    await ward.setFlag(SYSTEM_ID, SANCTUARY_FLAG,
      sanctuaryRecordAfter(record, opponentKey(attacker), degree, round)).catch(() => {});

    const state = sanctuaryRecordAfter({}, opponentKey(attacker), degree, round)[String(opponentKey(attacker))].state;
    if (state === SANCTUARY.PASSED) {
      lines.push(sanctuaryPassedLine(attacker.name, targetActor.name));
    } else if (state === SANCTUARY.BLOCKED_DURATION) {
      lines.push(sanctuaryFumbledLine(attacker.name, targetActor.name));
      blocked = true;
      // A ROLLED SAVE THAT FAILS WASTES THE ACTION, whichever rung it landed
      // on — both printed failures say so in as many words.
      wastesAction = true;
    } else {
      lines.push(sanctuaryBlockedTurnLine(attacker.name, targetActor.name, round !== null));
      blocked = true;
      wastesAction = true;
    }
  }

  if (lines.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header">`
        + `<div class="check-heading"><span class="check-actor">${attacker.name}</span>`
        + `<h3>Sanctuary</h3></div></header>`
        + lines.map((l) => `<p style="margin:2px 0">${l}</p>`).join("")
        + `<p class="hint" style="margin:2px 0">Against ${sourceName}.</p></div>`
    });
  }
  return { blocked, wastesAction };
}

/**
 * "If the target uses a hostile action, the spell ends."
 *
 * CALLED FROM EVERY PLACE A HOSTILE THING IS COMMITTED TO — the three action
 * commit points that already call `biteOffensiveCurses`, and the attack
 * workflow, which none of them cover. A Strike is the most obvious hostile
 * action there is and it does not pass through `resolveAction`, so a gate
 * wired only to the action paths would have let a warded fighter swing all
 * day with the spell still up.
 *
 * @param {Actor} actor the protected creature taking the action
 * @param {object|null} action the action being committed, when there is one
 * @returns {Promise<boolean>} whether a ward ended
 */
export async function endSanctuaryOnHostileAction(actor, action = null) {
  try {
    const wards = sanctuaryWardsOn(actor);
    if (!wards.length) return false;
    // AN ACTION IS TESTED; A STRIKE IS NOT ASKED ABOUT. `null` means the
    // caller has already decided this is hostile, which is what the attack
    // path is by construction.
    if (action) {
      const { isOffensiveAction } = await import("../magic/flat-ladder.mjs");
      if (!isOffensiveAction(action)) return false;
    }
    const { sanctuaryEndedLine } = await import("../magic/sanctuary.mjs");
    for (const ward of wards) await ward.delete();
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="trg-prime trg-check-card"><p style="margin:2px 0">`
        + `${sanctuaryEndedLine(actor.name)}</p></div>`
    });
    return true;
  } catch (error) {
    // SWALLOWED, for the reason `biteOffensiveCurses` gives: this runs on the
    // commit path and a throw would lose the player's action after the AP
    // was already spent.
    console.error("TRG Prime | a sanctuary ward could not be ended", error);
    return false;
  }
}

/** The active Visage Of Horror wards on this creature (3.609.0). */
function horrorWardsOn(actor) {
  return Array.from(actor?.appliedEffects ?? actor?.effects ?? [])
    .filter((e) => !e.disabled && e.getFlag?.(SYSTEM_ID, "horrorWard"));
}

/**
 * VISAGE OF HORROR (3.609.0, block 33's R6): the opponent saves Will before
 * an aggressive move against the warded creature, and is then immune until
 * the end of its next turn. Failure frightens it and lets it act; Fumble
 * frightens it and wastes the action. See magic/aggression-wards.mjs.
 */
async function horrorCheck(attacker, targetActor, sourceName) {
  const wards = horrorWardsOn(targetActor);
  if (!wards.length || !attacker) return { blocked: false, wastesAction: false };
  const { HORROR, HORROR_MEMORY_FLAG, horrorMemoryAfter, horrorMustSave, horrorOutcome } =
    await import("../magic/aggression-wards.mjs");
  const { TRGCheck } = await import("../dice/check.mjs");
  const round = currentRound();
  const lines = [];
  let blocked = false;
  for (const ward of wards) {
    const memory = ward.getFlag(SYSTEM_ID, HORROR_MEMORY_FLAG) ?? {};
    if (!horrorMustSave(memory, opponentKey(attacker), round)) continue;
    const save = attacker.system?.combat?.saves?.will;
    const dc = Number(ward.getFlag(SYSTEM_ID, "horrorDC") ?? 0) || null;
    const check = await TRGCheck.roll({
      actor: attacker,
      label: `${attacker.name} — Will Save`,
      subtitle: `vs Visage Of Horror on ${targetActor.name}${dc ? ` — DC ${dc}` : " — DC not recorded"}`,
      type: "save",
      saveSource: "Visage Of Horror",
      subject: "will",
      dc,
      traits: String(ward.getFlag(SYSTEM_ID, "horrorTraits") ?? ""),
      traditions: String(ward.getFlag(SYSTEM_ID, "horrorTradition") ?? ""),
      sourceUuid: String(ward.getFlag(SYSTEM_ID, "horrorCaster") ?? ""),
      modifiers: save?.checkModifiers ?? [{ label: "Will save", value: Number(save?.total ?? 0), type: "untyped" }]
    });
    const degree = check?.outcome?.degree?.key ?? null;
    if (degree === null) {
      lines.push(`<em>${attacker.name}'s Will save against Visage Of Horror produced no degree — the table decides.</em>`);
      continue;
    }
    await ward.setFlag(SYSTEM_ID, HORROR_MEMORY_FLAG, horrorMemoryAfter(memory, opponentKey(attacker), round)).catch(() => {});
    const outcome = horrorOutcome(degree);
    const immune = round === null ? "" : " It is immune until the end of its next turn.";
    if (outcome === HORROR.PASSED) {
      lines.push(`${attacker.name} sees ${targetActor.name}'s horrifying form and is unaffected.${immune}`);
      continue;
    }
    const { applyConditionTags } = await import("./effect-application-workflow.mjs");
    await applyConditionTags(attacker, [{ key: "frightened", label: "Frightened", value: 2 }]);
    if (outcome === HORROR.WASTED) {
      blocked = true;
      lines.push(`<strong>${attacker.name}</strong> recoils from ${targetActor.name}: <strong>frightened 2</strong>, `
        + `and the action fails and is wasted.${immune}`);
    } else {
      lines.push(`<strong>${attacker.name}</strong> is <strong>frightened 2</strong> by ${targetActor.name}'s form `
        + `before it acts.${immune}`);
    }
  }
  if (lines.length) {
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: attacker }),
      content: `<div class="trg-prime trg-check-card"><header class="check-header">`
        + `<div class="check-heading"><span class="check-actor">${attacker.name}</span>`
        + `<h3>Visage Of Horror</h3></div></header>`
        + lines.map((l) => `<p style="margin:2px 0">${l}</p>`).join("")
        + `<p class="hint" style="margin:2px 0">Against ${sourceName}.</p></div>`
    });
  }
  return { blocked, wastesAction: blocked };
}

/**
 * PAINFUL REBUKE (3.609.0, block 33's R2): the attacker carries what its
 * save bought, naming the caster; turning on that caster costs it 2d6
 * mental, a Minor Critical too on a Fumble, and a Success's rebuke is spent
 * by its first bite. Never blocks the attack.
 */
async function rebukeCheck(attacker, targetActor, sourceName) {
  if (!attacker || !targetActor?.uuid) return;
  const { REBUKE_FLAG, rebukesAgainst } = await import("../magic/aggression-wards.mjs");
  const carried = Array.from(attacker.appliedEffects ?? attacker.effects ?? [])
    .filter((e) => !e.disabled && e.getFlag?.(SYSTEM_ID, REBUKE_FLAG))
    .map((e) => ({ effect: e, spec: e.getFlag(SYSTEM_ID, REBUKE_FLAG) }));
  const biting = rebukesAgainst(carried, targetActor.uuid);
  if (!biting.length) return;
  const { resolveAgainstDefences } = await import("./damage-workflow.mjs");
  const { applyDamageAndCheckDying } = await import("./dying-workflow.mjs");
  const { ownedCreatureTypeSystem } = await import("../creature-type-rules.mjs");
  const lines = [];
  const rolls = [];
  for (const { effect, spec } of biting) {
    const roll = await new Roll(spec.formula).evaluate();
    rolls.push(roll);
    const packet = resolveAgainstDefences(attacker.system ?? {}, {
      amount: roll.total, type: spec.type, creatureTypeSystem: ownedCreatureTypeSystem(attacker), magical: true
    });
    let after = null;
    if (packet.taken > 0) after = (await applyDamageAndCheckDying(attacker, packet.taken))?.newHP ?? null;
    lines.push(`<strong>${spec.label}</strong>: ${attacker.name} turns on ${targetActor.name} and takes `
      + (packet.immune ? `nothing — immune to ${spec.type}` : `<strong>${packet.taken}</strong> ${spec.type}`
        + `${after !== null ? ` — now ${after} HP` : ""}`) + ` (${spec.formula} rolled ${roll.total}).`);
    if (spec.critical && !packet.immune) {
      const { rollCriticalInjury } = await import("./attack-workflow.mjs");
      await rollCriticalInjury(targetActor, { targetActor: attacker, damageType: spec.type, severity: spec.critical, attackBonus: spec.dc ?? 0 });
    }
    if (spec.once) {
      await effect.delete();
      lines.push(`<em>The rebuke is spent and ${spec.label} ends.</em>`);
    }
  }
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: attacker }),
    content: `<div class="trg-prime trg-check-card">`
      + lines.map((l) => `<p style="margin:2px 0">${l}</p>`).join("")
      + `<p class="hint" style="margin:2px 0">Against ${sourceName}.</p></div>`,
    rolls
  });
}
