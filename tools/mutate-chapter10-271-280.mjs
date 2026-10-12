#!/usr/bin/env node
/**
 * mutate-chapter10-271-280 — can the pages 271-280 checks fail?
 *
 * NEW at 3.589.0. SURVIVED and an unmatched anchor are both failures.
 *
 * ─────────────────────────────────────────────────────────────────────
 * THE MUTATIONS THAT MATTER MOST PUT BACK A CONFIDENT WRONG ANSWER.
 *
 * Six spells in this block applied one flat condition on every failing
 * degree: a successful Will save against Dominate dominated the target, a
 * successful save against Enthrall fixated it, and every Fatigue and
 * Flare was permanent. None of those looked broken on a card. Section B
 * reverses each one, because a check that cannot catch the defect it was
 * written for is decoration.
 *
 * Section F reverses the thing I got wrong MYSELF: the claim that a bonus
 * row cannot grant a fly speed. The check that replaced it asserts the
 * sentence the mechanism really exists for, and F1 puts back a flat
 * reading of `feet` to prove it bites.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const at = (...parts) => path.join(SYSTEM_ROOT, "module", ...parts);
const DRAIN = at("magic", "resource-drain.mjs");
const SPEEDS = at("combat", "granted-speeds.mjs");
const POOL = at("combat", "speed-pool.mjs");
const VISION = at("magic", "seers-vision.mjs");
const EFFECTS = at("magic", "spell-effects.mjs");
const TAGS = at("combat", "effect-application-workflow.mjs");
const PPWF = at("power-points-workflow.mjs");
const CHECK = at("dice", "check.mjs");
const ACTOR = at("documents", "actor.mjs");
const KINDS = at("magic", "effect-kinds.mjs");
const SAFETY = path.join(SYSTEM_ROOT, "tools", "lib", "mutation-safety.mjs");
const BLANK = path.join(SYSTEM_ROOT, "tools", "lib", "blank-read.mjs");
const VERIFY = path.join(SYSTEM_ROOT, "tools", "verify-chapter10-271-280.mjs");

const MUTATIONS = [
  /* ── A: the new kinds reach something ──────────────────────────── */
  { file: KINDS, name: "A: the resource kind is authored but never declared handled",
    from: `  "resource",`, to: ``, breaks: "A1" },
  { file: KINDS, name: "A: the speedGrant kind is authored but never declared handled",
    from: `  "speedGrant",`, to: ``, breaks: "A1" },
  { file: EFFECTS, name: "A: the PP drain bypasses Chapter 4's below-zero charge",
    from: `            const spend = await applyPowerPointCost(target, asked, drain.label);`,
    to: `            const spend = { spent: asked, shortfall: 0, soulDrain: 0 };
            await target.update({ "system.resources.pp.value": Math.max(0, Number(target.system?.resources?.pp?.value ?? 0) - asked) });`,
    breaks: "A3" },
  { file: EFFECTS, name: "A: soul drain is written without the rule that can kill",
    from: `            await setSoulDrain(target, held + asked);`,
    to: `            await target.toggleStatusEffect("soulDrain", { value: held + asked });`,
    breaks: "A4" },
  { file: EFFECTS, name: "A: the granted speed is an item nothing derives from",
    from: `                creatureAbility: { derives: { movement: grant } },`,
    to: `                grantedSpeed: grant,`, breaks: "A5" },
  { file: EFFECTS, name: "A: the granted speed loses its teardown and becomes permanent",
    from: `          const gsFlags = { [SYSTEM_ID]: { spellBuff: true, grantedItems: [madeSpeed.id] } };`,
    to: `          const gsFlags = { [SYSTEM_ID]: { spellBuff: true } };`, breaks: "A6" },
  { file: EFFECTS, name: "A THE NaN: a condition's rolled value stops being rolled",
    from: `          if (cond.valued && effect.formula) {`, to: `          if (false) {`, breaks: "A7" },
  { file: EFFECTS, name: "A: a condition stops carrying its damage type",
    from: `            ...(effect.damageType ? { damageType: String(effect.damageType) } : {})`,
    to: `            ...({})`, breaks: "A8" },
  { file: TAGS, name: "A THE WRONG ELEMENT: the tag's damage type is dropped again",
    from: `        ...(tag.damageType ? { damageType: String(tag.damageType) } : {})`,
    to: `        ...({})`, breaks: "A9" },

  /* ── B: the six confident wrong answers, put back ──────────────── */
  { file: EFFECTS, name: "B THE FLAT ROW: the applier stops asking the degree selector",
    from: `          : recipientsForEffect(effect, ladderResults, targets);`,
    to: `          : targets;`, breaks: "B9b" },
  { file: at("magic", "spell-degrees.mjs"),
    name: "B: a gated row applies on every degree",
    from: `  return declared.includes(String(degree ?? "").trim().toLowerCase());`,
    to: `  return true;`, breaks: "B9c" },
  { file: at("magic", "spell-degrees.mjs"),
    name: "B: a row's declared degrees are ignored",
    from: `  const list = Array.isArray(raw) ? raw : [raw];`,
    to: `  const list = [];`, breaks: "B1" },
  { file: EFFECTS, name: "B: a row's own duration stops being read, so the spell's is used",
    from: `    const durationSource = effectDurationText(effect, spellDurationSource);`,
    to: `    const durationSource = spellDurationSource;`, breaks: "B6" },

  /* ── C: the resource drain ─────────────────────────────────────── */
  { file: DRAIN, name: "C: a drain may name any resource",
    from: `  if (!DRAINABLE.includes(asked)) return null;`, to: `  ;`, breaks: "C1" },
  { file: DRAIN, name: "C: a drain with unparseable dice is accepted",
    from: `  if (!formula || !DICE.test(formula)) return null;`, to: `  if (false) return null;`,
    breaks: "C2" },
  { file: DRAIN, name: "C: soul drain may be shared back with the caster",
    from: `  const casterGains = resource === "pp" && Object.hasOwn(SHARES, share) ? share : "";`,
    to: `  const casterGains = Object.hasOwn(SHARES, share) ? share : "";`, breaks: "C3" },
  { file: DRAIN, name: "C: half of 3 rounds up",
    from: `  return Math.floor(had * rate);`, to: `  return Math.ceil(had * rate);`, breaks: "C4" },
  { file: DRAIN, name: "C: a share with no warp bought still pays out",
    from: `  const rate = SHARES[String(share ?? "").toLowerCase()];
  if (!rate) return 0;`, to: `  const rate = SHARES[String(share ?? "").toLowerCase()] ?? 1;`,
    breaks: "C4" },
  { file: EFFECTS, name: "C THE MINTED POINTS: the caster gains from the ROLL, not the take",
    from: `            const gained = casterGainFrom(spend.spent - spend.shortfall, drain.casterGains);`,
    to: `            const gained = casterGainFrom(asked, drain.casterGains);`, breaks: "C5" },
  { file: DRAIN, name: "C: the card stops distinguishing the roll from the take",
    from: `  const head = taken === rolled
    ? \`<strong>\${taken} PP</strong> drained\`
    : \`<strong>\${taken} PP</strong> drained of \${rolled} rolled\`;`,
    to: `  const head = \`<strong>\${taken} PP</strong> drained\`;`, breaks: "C6" },
  { file: PPWF, name: "C: the overspend goes back to being unable to kill",
    from: `    const { setSoulDrain } = await import("./combat/dying-workflow.mjs");`,
    to: `    const setSoulDrain = async (a, v) => a.toggleStatusEffect("soulDrain", { value: v });`,
    breaks: "C8" },

  /* ── E: the recorded roll ──────────────────────────────────────── */
  { file: VISION, name: "E: every record may replace an attack roll",
    from: `  return list.length ? [...new Set(list)] : [...DEFAULT_RECORD_TYPES];`,
    to: `  return [...RECORDABLE_TYPES];`, breaks: "E3" },
  { file: VISION, name: "E: the type test goes back to being hardcoded",
    from: `  return normaliseRecordTypes(pending.types).includes(type);`,
    to: `  return type === "save" || type === "skill";`, breaks: "E2" },
  { file: VISION, name: "E: a blind roll may be spent on",
    from: `  if (String(rollMode ?? "").trim().toLowerCase() === BLIND_ROLL_MODE) return false;`,
    to: `  ;`, breaks: "E5" },
  { file: VISION, name: "E THE SHARED SLOT: one spell's record cancels the other's",
    from: `  const kept = recordedRolls(raw).filter((r) => String(r.source ?? SEERS_VISION_NAME) !== record.source);`,
    to: `  const kept = [];`, breaks: "E6" },
  { file: VISION, name: "E: a legacy single record stops being read",
    from: `  if (raw && typeof raw === "object" && Number.isFinite(Number(raw.value))) return [raw];`,
    to: `  ;`, breaks: "E4b" },
  { file: VISION, name: "E: the applicable record is chosen without asking the check",
    from: `    if (seersVisionConsumes(checkType, rollMode, record)) return record;`,
    to: `    return record;`, breaks: "E8" },
  { file: CHECK, name: "E: the check stops telling the rule what is being rolled",
    from: `      const pending = pendingSeersVision(this.actor, this.type, this.rollMode);`,
    to: `      const pending = pendingSeersVision(this.actor);`, breaks: "E9" },
  { file: CHECK, name: "E: spending one record clears them all",
    from: `      await consumeSeersVision(this.actor, pending.source ?? "");`,
    to: `      await consumeSeersVision(this.actor);`, breaks: "E10" },
  { file: VISION, name: "E: the card names Seer's Vision's list whatever the record says",
    from: `  const list = normaliseRecordTypes(types);`,
    to: `  const list = [...DEFAULT_RECORD_TYPES];`, breaks: "E11" },

  /* ── F: the granted speed, and the claim I withdrew ────────────── */
  { file: SPEEDS, name: "F THE WITHDRAWN CLAIM'S REAL POINT: feet stop deferring to land",
    // RE-ANCHORED 3.613.0: the land figure is `share` now (half-Speed grants).
    from: `  return grant.orLand ? Math.max(grant.feet, share) : grant.feet;`,
    to: `  return grant.feet;`, breaks: "F1" },
  { file: SPEEDS, name: "F: a flat grant starts deferring to land",
    from: `  return grant.orLand ? Math.max(grant.feet, share) : grant.feet;`,
    to: `  return Math.max(grant.feet, share);`, breaks: "F1b" },
  { file: SPEEDS, name: "F: a grant may name a speed that does not exist",
    from: `  if (!speedKeys.includes(key)) return null;`, to: `  ;`, breaks: "F2" },
  { file: SPEEDS, name: "F: a grant of nothing is accepted",
    from: `  if (!feet && !orLand) return null;`, to: `  if (false) return null;`, breaks: "F3" },
  { file: SPEEDS, name: "F: grants stop being read off items",
    from: `    const grant = normaliseGrantedSpeed(raw, speedKeys);`,
    to: `    const grant = null;`, breaks: "F4" },
  { file: POOL, name: "F THE SLOWED DRAGON: a grant overwrites a better speed",
    from: `    movement[grant.key].total = Math.max(Number(movement[grant.key].total ?? 0), feet);`,
    to: `    movement[grant.key].total = feet;`, breaks: "F6" },
  { file: POOL, name: "F: a grant leaves base at 0, so nothing knows the creature has the speed",
    from: `    movement[grant.key].base = Math.max(Number(movement[grant.key].base ?? 0), feet);`,
    to: ``, breaks: "F8" },
  { file: POOL, name: "F: every speed key is created whether granted or not",
    from: `  for (const grant of grantedSpeeds) {`,
    to: `  for (const grant of SPEED_KEYS.map((k) => ({ key: k, feet: 0, orLand: false }))) {`,
    breaks: "F7" },
  { file: ACTOR, name: "F: the derivation stops reading grants off the actor",
    from: `    const granted = grantedSpeeds(Array.from(actor.items ?? []), SPEED_KEYS);`,
    to: `    const granted = [];`, breaks: "F9" },
  { file: SPEEDS, name: "F: the withdrawal stops being recorded",
    from: ` * WHAT THIS IS FOR, AND THE CLAIM I HAD TO WITHDRAW.`,
    to: ` * A NOTE.`, breaks: "F11" },
  { file: EFFECTS, name: "F: the granted speed is announced without reading it back",
    from: `          const shownFeet = Number(
            target.system?.combat?.movement?.[grant.key]?.total ?? 0) || grant.feet;`,
    to: `          const shownFeet = grant.feet;`, breaks: "F14" },

  /* ── J: the harness's own crash recovery ───────────────────────── */
  { file: SAFETY, name: "J THE INCIDENT: a reclaimed stale lock stops restoring",
    from: `      restoreFromSnapshot();`, to: ``, breaks: "J3" },
  { file: SAFETY, name: "J: the originals are never written to disk",
    from: `      fs.writeFileSync(DEFAULT_SNAPSHOT, JSON.stringify({`,
    to: `      (() => {})(JSON.stringify({`, breaks: "J2" },
  { file: SAFETY, name: "J: a finished run leaves its snapshot behind as a trap",
    from: `      try { fs.rmSync(DEFAULT_SNAPSHOT, { force: true }); } catch { /* nothing left to try */ }`,
    to: ``, breaks: "J4" },
  { file: SAFETY, name: "J: restoring overwrites work that finished properly",
    from: `      if (fs.existsSync(file) && fs.readFileSync(file).equals(want)) continue;`,
    to: `      ;`, breaks: "J5" },
  { file: BLANK, name: "J THE BLINDFOLD ITSELF: the blanking hook stops blanking",
    from: `      if (typeof file === "string" && path.resolve(file) === target) {`,
    to: `      if (false) {`, breaks: "J7" }
];

const files = [...new Set(MUTATIONS.map((m) => m.file))];
guardFiles(files);
const originals = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));

const run = () => {
  try {
    execFileSync(process.execPath, [VERIFY], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
};

if (!run()) {
  console.error("verify-chapter10-271-280 does not pass on the unmutated tree — nothing to measure.");
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
  ? `\nmutate-chapter10-271-280: FAILED — ${survived} survived, ${unmatched} unmatched.\n`
  : `\nmutate-chapter10-271-280: OK — all ${MUTATIONS.length} mutations caught, tree restored.\n`);
process.exit(survived + unmatched ? 1 : 0);
