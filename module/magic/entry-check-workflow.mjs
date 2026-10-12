/**
 * Web's check, rolled when a creature moves through it (3.612.0, block 34's
 * R6). The rule and the reasons are in entry-check.mjs; this records the
 * row on the Region at the cast and answers each move.
 *
 * THE HAZARD FAMILY'S HOOK SHAPE (magic/hazard-terrain-workflow.mjs): the
 * acting GM alone answers, once per movement id, only for a move governed by
 * a Speed (Graham's 1 September ruling for terrain that answers a move), and
 * the Region itself is asked which squares it covers, so a reshaped web
 * answers for where it now is.
 */

import {
  ENTRY_CHECK_FLAG, normaliseEntryCheck, entryCheckSkill, entryCheckOutcome,
  entryCheckCalled, entryTurnKey, entryCheckLine, entryGateHolds, entryBarred, entryBarFor
} from "./entry-check.mjs";
import { hazardTriggers, squaresEntered } from "./hazard-terrain.mjs";
import { isActingGM } from "../acting-gm.mjs";
import { SKILLS } from "../config.mjs";

const SYSTEM_ID = "trg-prime";
/** Where a Critical's "no further checks this turn" is remembered on the mover. */
const CLEARED_FLAG = "entryCheckCleared";
/** Region id → a bar on crossing it (3.630.0): { turn } | { until } | { spell }. */
const BAR_FLAG = "entryBar";
/** Region id → the round key it last rolled in, for "only the first time … each round". */
const ROLLED_FLAG = "entryRolledRound";

const answered = new Set();
const ANSWERED_CAP = 500;
function alreadyAnswered(id) {
  const key = String(id ?? "").trim();
  if (!key) return false;
  if (answered.has(key)) return true;
  answered.add(key);
  if (answered.size > ANSWERED_CAP) answered.delete(answered.values().next().value);
  return false;
}

function pathPoints(movement) {
  const points = [];
  const push = (p) => {
    if (p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) points.push({ x: Number(p.x), y: Number(p.y) });
  };
  push(movement?.origin);
  for (const w of movement?.passed?.waypoints ?? []) push(w);
  push(movement?.destination);
  return points;
}

function actionOf(movement) {
  const waypoints = [...(movement?.passed?.waypoints ?? []), ...(movement?.pending?.waypoints ?? [])];
  const withAction = waypoints.filter((w) => w?.action);
  return withAction.length ? withAction.at(-1).action : "walk";
}

/**
 * Record the check on the Region a spell's template created.
 * @returns {Promise<object|null>} the normalised spec, or null
 */
export async function recordEntryCheck(region, row, { dc, casterUuid = null, spellUuid = null, spellName = "", castId = null } = {}) {
  const spec = normaliseEntryCheck(row);
  if (!spec || !region?.setFlag || !(Number(dc) > 0)) return null;
  await region.setFlag(SYSTEM_ID, ENTRY_CHECK_FLAG, {
    ...row, label: spec.label || spellName, dc: Number(dc), casterUuid, spellUuid, spellName, castId
  });
  return spec;
}

/** The card line the cast prints for a recorded check. */
export function entryCheckRecordedLine(spec, dc) {
  // A THRESHOLD (3.630.0) says who it stops and what they roll.
  if (spec.save) {
    const who = spec.gate?.length ? "A creature it stops" : "A creature";
    return `${who} trying to cross into it ${spec.oncePerRound ? "(the first time each round) " : ""}attempts a `
      + `<strong>${spec.save.charAt(0).toUpperCase()}${spec.save.slice(1)}</strong> save against DC <strong>${dc}</strong>.`;
  }
  const skills = spec.skills.map((k) => SKILLS[k]?.label ?? k).join(" or ");
  return `A creature that starts to move through it or enters it during a move rolls <strong>${skills}</strong> `
    + `against DC <strong>${dc}</strong>.`;
}

/** Put the mover back outside: the last square it held before it crossed (3.630.0). */
async function pushBackOutside(tokenDocument, points, entered, insideFn, centre) {
  const firstIn = entered.findIndex((p) => insideFn(centre(p)));
  const back = firstIn > 0 ? entered[firstIn - 1] : points[0];
  if (!back) return false;
  try {
    // AS A DISPLACEMENT, NOT A WALK (3.630.1, F11 of the 3.630.0 live test).
    // Put back by a walk, a mover that had already crossed to the far side
    // walked back through the threshold — a crossing from outside, refused
    // and put back again, for ever (957 cards before the Region was
    // deleted). A displacement is no movement the hazard family answers.
    // THE ACTION RIDES ON THE WAYPOINT (found on the 3.630.1 retest): a
    // `movement[id].action` option is ignored by Foundry v14, which recorded
    // the push-back as a walk and the loop went on (1017 cards). A waypoint
    // carrying `action: "displace"` is a displacement.
    await tokenDocument.update({ x: back.x, y: back.y }, {
      movement: { [tokenDocument.id]: { method: "api", waypoints: [{ x: back.x, y: back.y, action: "displace" }] } }
    });
    return true;
  } catch {
    return false;
  }
}

/** The facts a threshold's gate asks of the mover. */
async function gateFacts(mover) {
  const { creatureTraits } = await import("../creature-traits.mjs");
  const { creatureTypesOf } = await import("../aligned.mjs");
  const { isIncorporeal } = await import("../codex-trait-rules.mjs");
  const sys = mover?.system ?? {};
  return { types: creatureTypesOf(sys), traits: creatureTraits(sys), incorporeal: Boolean(isIncorporeal(sys)) };
}

/**
 * Answer one move. Swallows its own failure: the move has already happened.
 */
async function applyEntryChecks(tokenDocument, movement) {
  try {
    const mover = tokenDocument?.actor;
    if (!mover) return;
    if (!hazardTriggers(actionOf(movement))) return;
    if (alreadyAnswered(movement?.id)) return;

    const regions = [];
    for (const region of canvas?.scene?.regions ?? []) {
      const raw = region.getFlag?.(SYSTEM_ID, ENTRY_CHECK_FLAG) ?? null;
      const spec = normaliseEntryCheck(raw);
      if (spec) regions.push({ region, spec, raw });
    }
    if (!regions.length) return;

    const points = pathPoints(movement);
    const gridSize = canvas?.scene?.grid?.size ?? 0;
    const entered = squaresEntered(points, gridSize);
    const elevation = tokenDocument.elevation ?? 0;
    const inside = (region, p) => {
      try { return region.testPoint({ x: p.x, y: p.y, elevation }); } catch { return false; }
    };
    // THE TOKEN'S CENTRE, as the hazard family measures: origin and waypoints
    // are top-left corners, so half a square is added to each.
    const half = gridSize / 2;
    const centre = (p) => ({ x: p.x + half, y: p.y + half });

    const combat = game.combat?.started ? game.combat : null;
    const turnKey = entryTurnKey({ combatId: combat?.id ?? null, round: combat?.round ?? null, turn: combat?.turn ?? null });

    for (const { region, spec, raw } of regions) {
      const startedInside = points.length ? inside(region, centre(points[0])) : false;
      const enteredInside = entered.filter((p) => inside(region, centre(p))).length;
      // A THRESHOLD IS CROSSED FROM OUTSIDE (3.630.0): "a creature already
      // inside the area … may leave normally". Web asks anyone moving in it.
      if (spec.crossingOnly) {
        if (startedInside || !enteredInside) continue;
      } else if (!entryCheckCalled(startedInside, enteredInside, entered.length)) continue;

      const cleared = mover.getFlag?.(SYSTEM_ID, CLEARED_FLAG) ?? null;
      if (turnKey && cleared?.region === region.id && cleared?.turn === turnKey) continue;

      // WHO IT STOPS (3.630.0): the gate, and "hostile" — the opposite side
      // from the caster's token, read from dispositions.
      if (spec.gate?.length && !entryGateHolds(spec, await gateFacts(mover))) continue;
      if (spec.hostileOnly) {
        const caster = raw.casterUuid ? await fromUuid(raw.casterUuid).catch(() => null) : null;
        const casterSide = Number(caster?.getActiveTokens?.()?.[0]?.document?.disposition ?? caster?.prototypeToken?.disposition ?? 1);
        if (Number(tokenDocument.disposition ?? 0) === casterSide) continue;
      }
      const now = Number(game.time?.worldTime ?? 0);
      const bars = mover.getFlag?.(SYSTEM_ID, BAR_FLAG) ?? {};
      if (entryBarred(bars, region.id, { now, turnKey })) {
        await pushBackOutside(tokenDocument, points, entered, (p) => inside(region, p), centre);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor: mover }),
          content: `<div class="trg-prime trg-card"><p><strong>${spec.label}</strong> — ${mover.name} cannot cross; it is put back outside.</p></div>`
        });
        continue;
      }
      // "ONLY THE FIRST TIME IT TRIES TO CROSS DURING EACH ROUND."
      const roundKey = combat ? `${combat.id}:${combat.round}` : null;
      if (spec.oncePerRound && roundKey) {
        const rolled = mover.getFlag?.(SYSTEM_ID, ROLLED_FLAG) ?? {};
        if (rolled[region.id] === roundKey) continue;
        await mover.setFlag(SYSTEM_ID, ROLLED_FLAG, { ...rolled, [region.id]: roundKey });
      }

      const dc = Number(raw.dc);
      const { TRGCheck } = await import("../dice/check.mjs");
      let check;
      let skill = "";
      let rollLabel;
      if (spec.save) {
        rollLabel = `${spec.save.charAt(0).toUpperCase()}${spec.save.slice(1)} save`;
        check = await TRGCheck.roll({
          actor: mover,
          label: `${mover.name} — ${rollLabel}`,
          subtitle: `${spec.label} — crossing it`,
          type: "save",
          save: spec.save,
          dc,
          sourceUuid: raw.casterUuid ?? ""
        });
      } else {
        const totals = Object.fromEntries(spec.skills.map((k) => [k, Number(mover.system?.skills?.[k]?.total ?? 0)]));
        skill = entryCheckSkill(spec, totals);
        const skillData = mover.system?.skills?.[skill] ?? null;
        rollLabel = SKILLS[skill]?.label ?? skill;
        check = await TRGCheck.roll({
          actor: mover,
          label: `${rollLabel} Check`,
          subtitle: `${spec.label} — moving through it`,
          type: "skill",
          subject: skill,
          dc,
          modifiers: skillData?.checkModifiers ?? [
            { label: `${rollLabel} bonus`, value: Number(skillData?.total ?? 0), type: "untyped" }
          ]
        });
      }
      const outcome = entryCheckOutcome(spec, check?.outcome?.degree?.key ?? "failure", skill);

      const lines = [entryCheckLine(mover.name, spec, outcome, rollLabel, check?.outcome?.total ?? "—", dc)];
      if (outcome.endsChecksThisTurn && turnKey) {
        await mover.setFlag(SYSTEM_ID, CLEARED_FLAG, { region: region.id, turn: turnKey });
      }
      // STOPPED AT THE LINE (3.630.0): put back outside, and barred for as
      // long as the rung says.
      if (outcome.pushBack) {
        const moved = await pushBackOutside(tokenDocument, points, entered, (p) => inside(region, p), centre);
        lines.push(moved ? `${mover.name} is put back outside the boundary; the movement is still spent.`
          : `<em>Move ${mover.name} back outside the boundary by hand.</em>`);
      }
      const bar = entryBarFor({ bar: outcome.bar }, { now, turnKey });
      if (bar) await mover.setFlag(SYSTEM_ID, BAR_FLAG, { ...bars, [region.id]: bar });
      if (outcome.rows.length) {
        // THE SPELL ENGINE APPLIES THE RUNG — see entry-check.mjs.
        const caster = raw.casterUuid ? await fromUuid(raw.casterUuid).catch(() => null) : null;
        const item = raw.spellUuid ? await fromUuid(raw.spellUuid).catch(() => null) : null;
        const spell = item ?? { name: raw.spellName || spec.label, img: "", uuid: null, system: { duration: "", effects: outcome.rows } };
        const { applySpellEffects } = await import("./spell-effects.mjs");
        const applied = [];
        await applySpellEffects(caster ?? mover, spell, {
          targets: [mover], effects: outcome.rows, lines: applied, saveDC: dc
        });
        lines.push(...applied);
      }
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: mover }),
        content: `<div class="trg-prime trg-card"><header class="trg-card-header"><h3>${spec.label}</h3></header>`
          + lines.map((l) => (String(l).startsWith("<p") ? l : `<p>${l}</p>`)).join("") + "</div>"
      });
    }
  } catch (error) {
    console.error("TRG Prime | A Web check could not be answered for this move", error);
  }
}

/** Hook it up. Called from the system's ready hook beside the hazards. */
export function registerEntryChecks() {
  Hooks.on("moveToken", async (tokenDocument, movement) => {
    if (!isActingGM()) return;
    await applyEntryChecks(tokenDocument, movement);
  });
}
