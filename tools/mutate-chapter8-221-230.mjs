#!/usr/bin/env node
/**
 * mutate-chapter8-221-230 — can the pages 221-230 checks fail?
 *
 * NEW at 3.582.1. SURVIVED and an unmatched anchor are both failures.
 *
 * THE SHIPPED DEFECTS FIRST, each put back where one line can put it
 * back: fifty-five fumble rows that told the system to do something and
 * were printed and ignored, a Sickened tied to a bleed that never ended,
 * a travel table that did not exist, a climb speed that still rolled, a
 * climber who was never flat-footed, a burrower who never held their
 * breath, food and water that counted nothing, a daily preparation
 * anybody could press at any hour, and a falling reduction the GM did by
 * hand.
 *
 * THEN THE TWO THIS BLOCK'S OWN LIVE DRIVE FOUND, before the harness was
 * written: a shortbow that was not a bow, and a No Reactions effect that
 * nothing consulted.
 *
 * Then every new rule, one line at a time.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const RIDERS = at("combat", "fumble-riders.mjs");
const RIDERSWF = at("combat", "fumble-riders-workflow.mjs");
const TRAVEL = at("travel.mjs");
const FOOD = at("sustenance.mjs");
const PREP = at("rest", "daily-preparation-gate.mjs");
const RESTWF = at("rest", "rest-workflow.mjs");
const USESWF = at("uses-workflow.mjs");
const DEGREES = at("combat", "action-degrees.mjs");
const ACTIONWF = at("combat", "action-workflow.mjs");
const BASIC = at("combat", "basic-action-conditions.mjs");
const REACTIONS = at("combat", "reactions.mjs");
const FALLING = at("combat", "falling.mjs");
const ATTACKWF = at("combat", "attack-workflow.mjs");
const DUR = at("combat", "critical-durations.mjs");
const CARD = at("travel-card.mjs");
const DIALOG = at("travel-dialog.mjs");
const FOODWF = at("sustenance-workflow.mjs");
const SCRIPT = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs");
const CHECK = path.join(SYSTEM_ROOT, "tools", "verify-chapter8-221-230.mjs");

const MUTATIONS = [
  /* ── D1: the riders ────────────────────────────────────────────── */
  { file: RIDERS, name: "D1 THE DEFECT: no row asks for an ally reroll",
    from: "  const reroll = /\\breroll\\s+(?:this\\s+|the\\s+)?attack\\b/i.exec(str);",
    to: "  const reroll = null;", breaks: "B1/B2" },
  { file: RIDERS, name: "D1: every reroll takes a random ally, even the closest-creature one",
    from: "  const closest = /\\bclosest\\s+creature\\b/i.test(tail);", to: "  const closest = false;", breaks: "B3" },
  { file: RIDERS, name: "D1: the MAP waiver is lost",
    from: "    ignoresMAP: /\\bignoring\\s+MAP\\b/i.test(tail),", to: "    ignoresMAP: false,", breaks: "B4" },
  { file: RIDERS, name: "D1: 'critically hit yourself' becomes an ally's problem",
    from: "  if (/\\bcritically\\s+hit\\s+yourself\\b/i.test(str)) {", to: "  if (false) {", breaks: "B5" },
  { file: RIDERS, name: "D1 THE DEFECT: the Level DC save is never asked for",
    from: "  const match = str.match(\n    /\\b(?:basic\\s+)?(Fortitude|Reflex|Will)\\s+Saving\\s+throw",
    to: "  const match = null && str.match(\n    /\\b(?:basic\\s+)?(Fortitude|Reflex|Will)\\s+Saving\\s+throw", breaks: "B1/B8" },
  { file: RIDERS, name: "D1: Hard becomes very hard, the audit's own guess",
    from: "FUMBLE_SAVE_DIFFICULTY = \"hard\";",
    to: "FUMBLE_SAVE_DIFFICULTY = \"veryHard\";", breaks: "B7" },
  { file: RIDERS, name: "D1: the save reaches everyone on every row",
    from: "    scope: /\\ball\\s+targets\\s+including\\s+yourself\\b/i.test(str) ? \"everyone\" : \"self\",",
    to: "    scope: \"everyone\",", breaks: "B8" },
  { file: RIDERS, name: "D1 THE DEFECT: nobody drops a weapon",
    from: "  if (!/\\byou\\s+drop\\s+(?:it|the\\s+weapon)\\b/i.test(str)) return null;", to: "  return null;", breaks: "B1/B10" },
  { file: RIDERS, name: "D1: the bomb clause is lost, so a dropped bomb goes off",
    from: "  return { drops: true, dud: /\\bmust\\s+be\\s+a\\s+dud\\b/i.test(str) };",
    to: "  return { drops: true, dud: false };", breaks: "B11" },
  { file: RIDERS, name: "D1 THE DEFECT: no weapon ever breaks",
    from: "  if (!snapped && !broken) return null;", to: "  return null;", breaks: "B1/B12" },
  { file: RIDERS, name: "D1: a snapped string is read as a break",
    from: "  const snapped = /\\bstring\\s+has\\s+snapped\\b/i.exec(str);", to: "  const snapped = null;", breaks: "B13" },
  { file: RIDERS, name: "D1: the repair cost is forgotten",
    from: "    ? Math.max(1, Math.trunc(Number((str.match(/requiring\\s+(\\d+)\\s+interact\\s+actions/i) ?? [])[1]) || 1))",
    to: "    ? 1", breaks: "B13" },
  { file: RIDERS, name: "D1: melee 100 starts breaking the weapon too",
    from: "  const broken = /\\b(?:weapon\\s+breaks|weapon\\s+is\\s+broken|it\\s+is\\s+broken)\\b/i.test(str);",
    to: "  const broken = /\\bweapon\\b/i.test(str);", breaks: "B14" },
  { file: RIDERS, name: "D1 THE DEFECT: the damage type never splits the row",
    from: "  const match = str.match(\n    /For\\s+Piercing\\s+or\\s+Slashing\\s+weapons",
    to: "  const match = null && str.match(\n    /For\\s+Piercing\\s+or\\s+Slashing\\s+weapons", breaks: "B1/B15" },
  { file: RIDERS, name: "D1 THE DEFECT: reactions are neither taken nor provoked",
    from: "  if (!triggers && !blocked) return null;", to: "  return null;", breaks: "B1/B16" },
  { file: RIDERS, name: "D1: a row that provokes is read as one that blocks",
    from: "  const blocked = /\\b(?:use\\s+)?no\\s+Reactions\\b/i.test(str);", to: "  const blocked = triggers;", breaks: "B17" },
  { file: RIDERS, name: "D1 THE DEFECT: nobody is moved anywhere",
    from: "  const match = str.match(/\\byou\\s+move\\s+(\\d+)'\\s+in\\s+a\\s+random\\s+direction\\b/i);",
    to: "  const match = null;", breaks: "B1/B18" },
  { file: RIDERS, name: "D1 THE DEFECT: the Interact escape is never offered",
    from: "  const match = str.match(/\\buntil\\s+you\\s+spend\\s+(\\d+)\\s+Interact\\s+actions?\\s+to\\s+free\\s+yourself\\b/i);",
    to: "  const match = null;", breaks: "B1/B19" },
  { file: RIDERS, name: "D1: the escape frees the wrong condition",
    from: "    frees: before.length ? before[before.length - 1].key : null", to: "    frees: null", breaks: "B19" },
  { file: RIDERS, name: "R15 THE DEFECT: 'until healed' is never said",
    from: "  const match = /\\buntil\\s+healed\\b/i.exec(str);\n  if (!match) return [];", to: "  return [];", breaks: "B1/B20" },
  { file: RIDERS, name: "R15: the clause reaches back over the 'and' and calls Prone permanent",
    from: "  while ((found = conjunction.exec(clause))) cut = found.index + found[0].length;", to: "", breaks: "B21" },
  { file: RIDERS, name: "D1: 'ignoring DR' stops being recognised",
    from: "  return /\\bignoring\\s+(?:DR\\s*&?\\s*)?[Rr]esistance\\b/i.test(String(text ?? \"\"));",
    to: "  return false;", breaks: "B1/B22" },
  { file: ATTACKWF, name: "D1 THE DEFECT: the fumble path never asks for the riders",
    from: "    const { applyFumbleRiders } = await import(\"./fumble-riders-workflow.mjs\");",
    to: "    const applyFumbleRiders = async () => ({});", breaks: "K3" },
  { file: ATTACKWF, name: "D2 THE DEFECT: the fumble path loses the critical path's clocks",
    from: "      await stampRowDurations(tags, row.effect, { persistenceRounds: duration.rounds });",
    to: "      ({ timed: [], plain: tags, notes: [] });", breaks: "K4" },
  { file: ATTACKWF, name: "D2: the fumble branch's stamper import is stubbed, leaving the critical path's",
    from: "    const { stampRowDurations } = await import(\"./linked-conditions-workflow.mjs\");\n    const { timed: textTimed, plain, notes: durationNotes } =",
    to: "    const stampRowDurations = async (t) => ({ timed: [], plain: t, notes: [] });\n    const { timed: textTimed, plain, notes: durationNotes } =",
    breaks: "K4b" },

  /* ── D2: until the bleed damage stops ──────────────────────────── */
  { file: DUR, name: "D2 THE DEFECT: 'bleed damage' stops matching again",
    from: "(bleeding|bleeds|bleed|recurring|damage)(?:\\s+damage)?\\s+(?:stops?|ends?)",
    to: "(bleeding|bleeds|bleed|recurring(?:\\s+damage)?|damage)\\s+(?:stops?|ends?)", breaks: "C1" },

  /* ── D3: travel ────────────────────────────────────────────────── */
  { file: TRAVEL, name: "D3: a speed covers the wrong distance in a minute",
    from: "FEET_PER_MINUTE_PER_SPEED = 10;",
    to: "FEET_PER_MINUTE_PER_SPEED = 5;", breaks: "D1/D2" },
  { file: TRAVEL, name: "D3: miles per hour drift",
    from: "SPEED_PER_MPH = 10;", to: "SPEED_PER_MPH = 12;", breaks: "D1/D2" },
  { file: TRAVEL, name: "D3: the travelling day grows",
    from: "TRAVEL_HOURS_PER_DAY = 8;", to: "TRAVEL_HOURS_PER_DAY = 10;", breaks: "D1/D2" },
  { file: TRAVEL, name: "D3: difficult terrain stops halving",
    from: "  difficult: 2,", to: "  difficult: 1,", breaks: "D3/D4b" },
  { file: TRAVEL, name: "D3: formidable terrain only halves",
    from: "  formidable: 4", to: "  formidable: 2", breaks: "D4/D4b" },
  { file: TRAVEL, name: "D3: the party travels at its FASTEST",
    from: "  for (const member of list) if (member.speed < slowest.speed) slowest = member;",
    to: "  for (const member of list) if (member.speed > slowest.speed) slowest = member;", breaks: "D5" },
  { file: TRAVEL, name: "D3: a terrain nobody named is silently treated as difficult",
    from: "  const key = TERRAIN_DIVISORS[String(terrain ?? \"normal\").toLowerCase()] ? String(terrain).toLowerCase() : \"normal\";",
    to: "  const key = \"difficult\";", breaks: "D1" },

  /* ── D4/D5: the movement speeds ────────────────────────────────── */
  { file: DEGREES, name: "D4 THE DEFECT: a climb speed still rolls",
    from: "  if (speedReplacesCheck(action, state)) return false;", to: "", breaks: "E1/E2" },
  { file: DEGREES, name: "D4: the hazard clause is ignored, so nobody ever rolls again",
    from: "  if (state?.hazardous === true) return false;", to: "", breaks: "E4" },
  { file: DEGREES, name: "D4: a fly speed starts answering its own checks",
    from: "SPEED_REPLACES_CHECK = Object.freeze({ climb: \"climb\", swim: \"swim\" });",
    to: "SPEED_REPLACES_CHECK = Object.freeze({ climb: \"climb\", swim: \"swim\", fly: \"fly\" });",
    breaks: "E5/E5b" },
  { file: DEGREES, name: "D4: a speed of zero counts as having one",
    from: "  return Number(state?.speeds?.[key] ?? 0) > 0;", to: "  return true;", breaks: "E3" },
  { file: DEGREES, name: "D4: the card stops naming the speed",
    from: "  if (speedReplacesCheck(action, state)) {\n    const key = SPEED_REPLACES_CHECK[String(action?.key ?? \"\")];",
    to: "  if (false) {\n    const key = SPEED_REPLACES_CHECK[String(action?.key ?? \"\")];", breaks: "E7" },
  { file: BASIC, name: "D5 THE DEFECT: nobody is flat-footed while climbing",
    from: "  return [{ target: \"self\", conditionKey: \"flatFooted\", active: true }];", to: "  return [];", breaks: "F1" },
  { file: BASIC, name: "D5: a climb speed stops waiving it",
    from: "  if (Number(climbSpeed) > 0) return [];", to: "", breaks: "F2" },
  { file: BASIC, name: "D5: the +2 DC trade-off buys nothing",
    from: "  if (ignoresFlatFooted === true) return [];", to: "", breaks: "F3" },

  /* ── D7: burrowing ─────────────────────────────────────────────── */
  { file: ACTIONWF, name: "D7 THE DEFECT: burrowing does not hold your breath",
    from: "  if (action?.key !== \"burrow\") return [];", to: "  return [];", breaks: "G1" },
  { file: ACTIONWF, name: "D7: the no-roll branch loses its call (block 20's F3 again)",
    from: "    await applyBasicActionStance(actor, action.key);\n    for (const said of await burrowingBreathLines(actor, action)) lines.push(line(said));",
    to: "    await applyBasicActionStance(actor, action.key);", breaks: "G2" },

  /* ── D8: food and water ────────────────────────────────────────── */
  { file: FOOD, name: "D8: a full ration counts as short",
    from: "  return (Number(pounds) || 0) < Math.max(0, Number(required) || 0);", to: "  return true;", breaks: "H2b" },
  { file: FOOD, name: "D8 THE DEFECT: hunger owes no checks",
    from: "    checks += foodDays;", to: "", breaks: "H3" },
  { file: FOOD, name: "D8: the hourly water clock starts before the day is out",
    from: "  const hourly = waterDays >= 1;", to: "  const hourly = hours > 0;", breaks: "H6" },
  { file: FOOD, name: "D8: the dry day itself is charged as an hourly check",
    from: "    const due = Math.floor(hours / WATER_CHECK_INTERVAL_HOURS);", to: "    const due = hours + 1;", breaks: "H4" },
  { file: FOOD, name: "D8: drinking cures hunger",
    from: "    next.daysWithoutWater = 0;\n    next.hoursSinceWaterFailed = 0;",
    to: "    next.daysWithoutWater = 0;\n    next.hoursSinceWaterFailed = 0;\n    next.daysWithoutFood = 0;", breaks: "H7b" },
  { file: FOOD, name: "D8: a fed day still counts against you",
    from: "  if (foodIsShort(pounds)) next.daysWithoutFood += 1;", to: "  next.daysWithoutFood += 1;", breaks: "H8" },

  /* ── D9: daily preparation ─────────────────────────────────────── */
  { file: PREP, name: "D9 THE DEFECT: anybody may prepare at any hour",
    from: "    allowed: rested >= required,", to: "    allowed: true,", breaks: "I2" },
  { file: PREP, name: "D9: a permanent spell is ended every morning",
    from: "  if (!Number.isFinite(seconds) || seconds <= 0) return false;", to: "", breaks: "I7" },
  { file: PREP, name: "D9: a week-long spell ends too",
    from: "  return seconds <= DAY_SECONDS;", to: "  return true;", breaks: "I6" },
  { file: PREP, name: "D9: something that is not a spell is ended",
    from: "  if (!flags.spellEffect) return false;", to: "", breaks: "I8" },
  { file: PREP, name: "D9: a day stops being 24 hours",
    from: "DAY_SECONDS = 86400;", to: "DAY_SECONDS = 3600;", breaks: "I5" },
  { file: USESWF, name: "D9 THE DEFECT: the gate warns instead of refusing",
    from: "    if (!gate.allowed) {", to: "    if (false) {", breaks: "I11" },
  { file: USESWF, name: "D9 THE DEFECT: the 24-hour reminder comes back",
    from: "    line(endedSpellsSaid)",
    to: "    line(\"<em>Reminder — handle manually: spells ending.</em>\")", breaks: "I10" },
  { file: RESTWF, name: "D9: a rest stops recording its own length",
    from: "  await actor.setFlag(SYSTEM_ID, \"lastRest\", {", to: "  await (async () => null)(SYSTEM_ID, \"lastRest\", {", breaks: "I12" },
  /*
   * THE LIVE DEFECT, PUT BACK (3.586.2). This is the exact line that
   * locked Graham's whole party out of daily preparation: `?? 0` turns
   * "no rest has ever been recorded" into "rested for zero hours", and
   * zero is a finite number smaller than eight.
   */
  { file: PREP, name: "I THE LIVE DEFECT: an unrecorded rest reads as a rest of zero hours",
    from: `  const unrecorded = hoursRested === null || hoursRested === undefined
    || !Number.isFinite(Number(hoursRested));`,
    to: "  const unrecorded = false;", breaks: "I4" },
  { file: PREP, name: "I: an unrecorded rest passes in silence, with nothing on the card",
    from: "    return { allowed: true, short: 0, requiredHours: required, unrecorded: true };",
    to: "    return { allowed: true, short: 0, requiredHours: required, unrecorded: false };",
    breaks: "I5" },
  // THE FIX HANDING BACK THE BUG. `|| 0` and a truthiness test both fold
  // a RECORDED zero into "unrecorded", which would let a genuinely
  // unrested character prepare.
  { file: PREP, name: "I: a recorded zero is mistaken for no record at all",
    from: `  const unrecorded = hoursRested === null || hoursRested === undefined
    || !Number.isFinite(Number(hoursRested));`,
    to: "  const unrecorded = !Number(hoursRested);", breaks: "I7" },
  { file: USESWF, name: "I: the caller goes back to reading a missing flag as zero",
    from: "      hoursRested: lastRest?.hours ?? null,",
    to: "      hoursRested: Number(lastRest?.hours ?? 0),", breaks: "I4" },

  /* ── D10: the falling soft landing ─────────────────────────────── */
  { file: FALLING, name: "D10 THE DEFECT: a soft landing reduces nothing",
    from: "  if (!soft) return 0;", to: "  return 0;", breaks: "J2" },
  { file: FALLING, name: "D10: the depth stops capping the reduction",
    from: "  return Math.max(0, Math.min(worth, Math.trunc(Number(depth) || 0)));", to: "  return worth;", breaks: "J2" },
  { file: FALLING, name: "D10: a deliberate dive is worth no more than a fall",
    from: "  const worth = dove ? DOVE_IN_FEET : SOFT_LANDING_FEET;", to: "  const worth = SOFT_LANDING_FEET;", breaks: "J3" },
  { file: FALLING, name: "D10: the two printed figures drift",
    from: "SOFT_LANDING_FEET = 20;", to: "SOFT_LANDING_FEET = 10;", breaks: "J1/J6" },
  { file: FALLING, name: "D10: grabbing an edge is worth nothing",
    from: "  if (options.grabbedAnEdge) {", to: "  if (false) {", breaks: "J6" },
  { file: FALLING, name: "D10: a plain fall is reduced anyway",
    from: "  return { effective: Math.max(0, fallen - reduction), reduction, reasons };",
    to: "  return { effective: Math.max(0, fallen - 20), reduction, reasons };", breaks: "J7" },

  /* ── L: the two defects this block's live drive found ──────────── */
  { file: RIDERSWF, name: "L THE LIVE DEFECT: a shortbow stops being a bow",
    from: "  const group = String(weapon?.system?.group ?? \"\").trim().toLowerCase();\n  if (group) return group === \"bow\";",
    to: "", breaks: "L1" },
  { file: RIDERSWF, name: "L: the name fallback gets its word boundary back",
    from: "  return /bow\\b/i.test(String(weapon?.name ?? \"\"));",
    to: "  return /\\bbow\\b/i.test(String(weapon?.name ?? \"\"));", breaks: "L1b" },
  { file: REACTIONS, name: "L THE LIVE DEFECT: a fumble's No Reactions is decorative again",
    from: "  if (fumbled) return FUMBLE_REACTION_BLOCK;", to: "", breaks: "L2" },
  { file: REACTIONS, name: "L: the gate stops asking whether a fumble blocked them",
    from: "    fumbled: fumbleBlocksReactions(actor)", to: "    fumbled: false", breaks: "L4" },
  { file: REACTIONS, name: "L: a disabled effect still blocks",
    from: "    (effect) => !effect.disabled && effect.getFlag?.(\"trg-prime\", \"fumbleNoReactions\") === true",
    to: "    (effect) => effect.getFlag?.(\"trg-prime\", \"fumbleNoReactions\") !== undefined", breaks: "L3b" },
  { file: REACTIONS, name: "L: the fumble block outranks Flat-Footed",
    from: "  if (flatFooted) return FLAT_FOOTED_BLOCK;\n  if (confused)",
    to: "  if (fumbled) return FUMBLE_REACTION_BLOCK;\n  if (flatFooted) return FLAT_FOOTED_BLOCK;\n  if (confused)",
    breaks: "L2b" },

  /* ── K: the wiring ─────────────────────────────────────────────── */
  { file: RIDERSWF, name: "K: the damage type is read from the formula again",
    from: "  const direct = weapon?.system?.damageType;", to: "  const direct = weapon?.system?.damage?.type;", breaks: "K5" },
  { file: RIDERSWF, name: "K: a break invents a flag nobody reads",
    from: "        await weapon.update({ \"system.hp.value\": breakItemValue(current) });",
    to: "        await weapon.update({ [`flags.${SYSTEM_ID}.broken`]: true });", breaks: "K6" },
  { file: RIDERSWF, name: "K: allies are looked for in game.actors, which has no token actors",
    from: "  return (globalThis.canvas?.tokens?.placeables ?? []).filter((token) => {",
    to: "  return Array.from(globalThis.game.actors ?? []).filter((token) => {", breaks: "K7" },

  /* ── M: THE RULES REACH A PLAYER ───────────────────────────────── *
   *
   * THE HOLE THE FIRST FULL SWEEP FOUND. travel.mjs and sustenance.mjs
   * shipped at 3.582.0 with thirty checks between them and no
   * production file importing either. These put each half of the
   * wiring back the way it was: present, verified, unreachable.
   * ─────────────────────────────────────────────────────────────── */
  { file: CARD, name: "M THE DEFECT: the card is paced by the fastest traveller",
    from: "  const party = partyTravelSpeed(members);", to: "  const party = { speed: Math.max(...members.map((m) => m.speed)), pacedBy: \"Quick\", members };",
    breaks: "M1/M2" },
  { file: CARD, name: "M: the journey is never answered",
    from: "  if (miles > 0) {", to: "  if (false) {", breaks: "M3" },
  { file: CARD, name: "M: only the pace-setter gets a row",
    from: "  const rows = party.members", to: "  const rows = party.members.filter((m) => m.name === party.pacedBy)", breaks: "M4" },
  { file: CARD, name: "M: the card ignores the terrain it was given",
    from: "  const pace = travelSpeed(party.speed, terrain);", to: "  const pace = travelSpeed(party.speed, \"normal\");", breaks: "M5" },
  { file: CARD, name: "M: an empty party divides by nothing",
    from: "  if (!party.speed) return \"<p>No one in the party has a Speed to travel at.</p>\";", to: "", breaks: "M6" },
  { file: DIALOG, name: "M THE OLD MISTAKE: the speed pool is read as a number",
    from: "  return speedValue(actor?.system?.combat?.movement?.land);",
    to: "  return Number(actor?.system?.combat?.movement?.land) || 0;", breaks: "M7" },
  { file: SCRIPT, name: "M THE DEFECT: no button opens the travel dialog",
    from: "      title: \"Travel\",", to: "      title: \"Nothing\",", breaks: "M8" },
  { file: FOODWF, name: "M: the fed line stops quoting the page's range",
    from: "    return `<em>Fed and watered — about ${FOOD_POUNDS_PER_DAY}–${FOOD_POUNDS_GENEROUS} lb of food `",
    to: "    return `<em>Fed and watered.</em>${FOOD_POUNDS_PER_DAY}${FOOD_POUNDS_GENEROUS}`; // eslint-disable-line\n    return `<em>x `",
    breaks: "M9" },
  { file: FOODWF, name: "M: hunger stops being counted out loud",
    from: "  if (state.daysWithoutFood) {", to: "  if (false) {", breaks: "M10" },
  { file: FOODWF, name: "M: the dry line stops warning about the hourly clock",
    from: "      + `${state.daysWithoutWater === 1 ? \"\" : \"s\"} without water — Exhaustion checks every hour from now`);",
    to: "      + `${state.daysWithoutWater === 1 ? \"\" : \"s\"} without water.`);", breaks: "M11" },
  { file: RESTWF, name: "M THE DEFECT: every breather costs a day's rations",
    from: "  if (wholeHours >= restHours) {", to: "  if (true) {", breaks: "M12" },
  { file: RESTWF, name: "M THE DEFECT: the rest never advances the day",
    from: "    sustenanceLines.push(...await advanceSustenanceDay(actor, { ate, drank }));", to: "", breaks: "M13" },
  { file: RESTWF, name: "M: the dialog stops asking about food",
    from: "          <td><label><input type=\"checkbox\" name=\"ate-${actor.id}\" checked> Ate</label></td>",
    to: "", breaks: "M14" },
  { file: RESTWF, name: "M: the answers never reach the rest (F2's shape in another file)",
    from: "      ate: Boolean(result[`ate-${actor.id}`]),", to: "      ate: true,", breaks: "M15" },
  { file: RESTWF, name: "M: the card says nothing about the day",
    from: "  for (const said of summary.sustenanceLines ?? []) lines.push(summaryLine(said));", to: "", breaks: "M16" },
  { file: SCRIPT, name: "M THE DEFECT: the hourly water check never ticks",
    from: "        await sweepSustenanceHours(actor, worldTime);", to: "", breaks: "M17" },
  { file: SCRIPT, name: "M: the gate is a flag name copied into the script",
    from: "      if (isDehydrated(actor)) {",
    to: "      if (Number(actor.getFlag?.(\"trg-prime\", \"sustenance\")?.daysWithoutWater) > 0) {", breaks: "M18" },
  { file: FOODWF, name: "M: the water stamp throws its remainder away every nudge",
    from: "  await store(actor, { ...state, waterClockAt: since + (checks * WATER_INTERVAL_SECONDS) });",
    to: "  await store(actor, { ...state, waterClockAt: Number(worldTime) || 0 });", breaks: "M19" },

  /* ── N: the live defects of 3.582.1 → 3.582.2 ──────────────────── */
  { file: RIDERSWF, name: "N THE LIVE DEFECT: the ally search stops measuring a distance",
    from: "    return distanceBetween(ownToken, token) <= maxFeet;", to: "    return true;", breaks: "N1" },
  { file: RIDERSWF, name: "N: a second distance function is written instead of the system's",
    from: "import { distanceBetween } from \"./geometry.mjs\";",
    to: "const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) / 20;", breaks: "N2" },
  { file: RIDERSWF, name: "N: the range stops coming from the attack that fumbled",
    from: "    const rangeFeet = attackRangeFeet(actor, weapon);", to: "    const rangeFeet = 500;", breaks: "N3" },
  { file: RIDERSWF, name: "N: a missile weapon reaches one increment, not six",
    from: "    return increment > 0 ? increment * SIX_INCREMENTS : ADJACENT_FEET;",
    to: "    return increment > 0 ? increment : ADJACENT_FEET;", breaks: "N4" },
  { file: RIDERSWF, name: "N: the Reach trait stops lengthening a melee reach",
    from: "  return reach + weaponReachExtension(system);", to: "  return reach;", breaks: "N5" },
  { file: RIDERSWF, name: "N: an actor with no token finds every ally on the scene",
    from: "  if (!ownToken) return [];", to: "", breaks: "N6" },
  { file: RIDERSWF, name: "N: the card goes back to the sentence that hid the defect",
    from: "        `<strong>${pick ? \"\" : `No ally within ${rangeFeet} ft — `}`",
    to: "        `<strong>${pick ? \"\" : `No ally is in range — `}`", breaks: "N7" },
  { file: FOODWF, name: "N THE LIVE DEFECT: Number(null) is 0, and 0 is finite",
    from: "    waterClockAt: stored === null || stored === undefined || stored === \"\"\n      || !Number.isFinite(stamp) ? null : stamp",
    to: "    waterClockAt: Number.isFinite(stamp) ? stamp : null", breaks: "N8" }
];

/* ------------------------------------------------------------------ */

function run() {
  try {
    execFileSync(process.execPath, [CHECK], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

const files = Array.from(new Set(MUTATIONS.map((m) => m.file)));
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

if (!run()) {
  console.error("mutate-chapter8-221-230: the check FAILS before any mutation.");
  process.exit(1);
}

let survived = 0;
let unmatched = 0;
for (const mutation of MUTATIONS) {
  const original = originals.get(mutation.file);
  if (!original.includes(mutation.from)) {
    console.error(`  ANCHOR MISSING  ${mutation.name}`);
    unmatched++;
    continue;
  }
  if (original.split(mutation.from).length - 1 > 1) {
    console.error(`  ANCHOR AMBIGUOUS  ${mutation.name}`);
    unmatched++;
    continue;
  }
  fs.writeFileSync(mutation.file, original.replace(mutation.from, mutation.to));
  const stillPasses = run();
  fs.writeFileSync(mutation.file, original);
  if (stillPasses) {
    console.error(`  SURVIVED  ${mutation.name} (expected ${mutation.breaks} to fail)`);
    survived++;
  } else {
    console.log(`  caught    ${mutation.name}`);
  }
}

for (const [file, original] of originals) fs.writeFileSync(file, original);

process.stdout.write(survived + unmatched
  ? `\nmutate-chapter8-221-230: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter8-221-230: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
