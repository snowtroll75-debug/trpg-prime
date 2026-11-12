#!/usr/bin/env node
/** mutate-block8b-core — the mutation half of verify-block8b-core. NEW at 3.687.0 (H13–H16). */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { guardFiles } from "./lib/mutation-safety.mjs";
import { SYSTEM_ROOT } from "./lib/sources.mjs";

const m = (...p) => path.join(SYSTEM_ROOT, "module", ...p);
const RR = m("magic", "ritual-rules.mjs"), CW = m("magic", "cast-workflow.mjs"), API = m("module-api.mjs"), APW = m("module-api-workflow.mjs"),
  RATE = m("rest", "rest-rate.mjs"), REST = m("rest", "rest-workflow.mjs"), ST = m("magic", "storm.mjs"), SW = m("magic", "storm-workflow.mjs"),
  CB = m("documents", "combat.mjs"), TP = path.join(SYSTEM_ROOT, "scripts", "trg-prime.mjs"), SJ = path.join(SYSTEM_ROOT, "system.json"), PJ = path.join(SYSTEM_ROOT, "package.json");
const MUTATIONS = [
  // H13
  { name: "H13 partialCasts is not a known rules function", file: API, from: "\"liftsCap\", \"partialCasts\", \"minSecondaries\"];", to: "\"liftsCap\", \"minSecondaries\"];", breaks: "H13 register" },
  { name: "H13 any truthy answer casts a Partial", file: RR, from: "      if ((await spec.partialCasts(ctx)) === true) return true;", to: "      if (await spec.partialCasts(ctx)) return true;", breaks: "H13 strict" },
  { name: "H13 a throw casts it", file: RR, from: "      console.error(`TRG Prime | ritual rules \"${key}\": partialCasts failed`, err);", to: "      return true;", breaks: "H13 strict" },
  { name: "H13 ritualCasts ignores the Partial flag", file: RR, from: " || (partial === true && d === \"partial\");", to: ";", breaks: "H13 degrees" },
  { name: "H13 ritualCasts casts every degree with the flag", file: RR, from: " || (partial === true && d === \"partial\");", to: " || partial === true;", breaks: "H13 degrees" },
  { name: "H13 the ritual never asks", file: CW, from: "  const partialCasts = degree === \"partial\" && await ritualPartialCasts({ ...ritualContext, degree });", to: "  const partialCasts = false;", breaks: "H13 ritual" },
  { name: "H13 the ritual asks of every degree", file: CW, from: "  const partialCasts = degree === \"partial\" && await ritualPartialCasts({ ...ritualContext, degree });", to: "  const partialCasts = await ritualPartialCasts({ ...ritualContext, degree });", breaks: "H13 ritual" },
  { name: "H13 castSpell is not told", file: CW, from: "variant: ritualPlan.variant, partialCasts, alone, gated:", to: "variant: ritualPlan.variant, alone, gated:", breaks: "H13 told" },
  { name: "H13 castingOutcome ignores castsPartial", file: m("magic", "casting.mjs"), from: "      return { cast: castsPartial === true, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 };", to: "      return { cast: false, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 };", breaks: "H13 castingOutcome" },
  { name: "H13 castingOutcome casts every Partial", file: m("magic", "casting.mjs"), from: "      return { cast: castsPartial === true, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 };", to: "      return { cast: true, ppSpent: 0, fumbleRoll: false, fumbleModifier: 0 };", breaks: "H13 castingOutcome" },
  { name: "H13 the price is not told", file: CW, from: "  const outcome = castingOutcome(degree, {\n    castsPartial: ritualPartial,\n", to: "  const outcome = castingOutcome(degree, {\n", breaks: "H13 castSpell" },
  { name: "H13 what is paid is not told", file: CW, from: "paidReduction),\n      castsPartial: ritualPartial,\n", to: "paidReduction),\n", breaks: "H13 castSpell" },
  { name: "H13 castSpell casts any ritual Partial", file: CW, from: "  const ritualPartial = ritual?.partialCasts === true && degree === \"partial\";", to: "  const ritualPartial = Boolean(ritual) && degree === \"partial\";", breaks: "H13 castSpell" },
  { name: "H13 a cast Partial is still a failed ritual", file: CW, from: "\n    && !(ritual.partialCasts === true && String(ritual.degree) === \"partial\");", to: ";", breaks: "H13 failed" },
  { name: "H13 Variable Success upgrades a ritual's Partial", file: CW, from: "  if (degree === \"partial\" && !isCantrip && !threaded && !ritual &&", to: "  if (degree === \"partial\" && !isCantrip && !threaded &&", breaks: "H13 VS" },
  { name: "H13 the card says the spell fails", file: CW, from: "    lines.push(line(\"<strong>Partial: the ritual's partial result is applied.</strong>", to: "    lines.push(line(\"<strong>The spell fails.</strong>", breaks: "H13 card" },
  { name: "H16 a cast's turn-start storm gets no clock (found live)", file: CW, from: "baseDamage: spellData.baseDamage ?? \"\", until: stormUntil\n", to: "baseDamage: spellData.baseDamage ?? \"\"\n", breaks: "H16 cast clock" },
  { name: "H16 a cast's storm clock ignores the duration", file: CW, from: "? Number(parseSpellDuration(warpedDurationText(spellData.duration, warpMods))?.seconds ?? 0)", to: "? 0", breaks: "H16 cast clock" },
  { name: "H16 a turn-start storm's own clock does not count as running", file: SW, from: "  if (record.ownExpiry === true) return true;\n", to: "", breaks: "H16 own clock" },
  { name: "H15 the dialog ignores the rates", file: CW, from: "      gained = applyRestRates({ hp: 0, pp: gained }, rates).pp;\n", to: "", breaks: "H15 dialog" },
  // H14
  { name: "H14 a zero answer is refused", file: RR, from: "      if (n !== null && n !== undefined && n !== \"\" && Number(n) === 0) return true;", to: "      if (n === 1) return true;", breaks: "H14 rules" },
  { name: "H14 a blank answer allows it", file: RR, from: "      if (n !== null && n !== undefined && n !== \"\" && Number(n) === 0) return true;", to: "      if (Number(n) === 0) return true;", breaks: "H14 rules" },
  { name: "H14 a throw allows it", file: RR, from: "      console.error(`TRG Prime | ritual rules \"${key}\": minSecondaries failed`, err);", to: "      return true;", breaks: "H14 rules" },
  { name: "H14 every ritual may be alone", file: CW, from: "  if (!secondaryCount && !alone) {", to: "  if (false) {", breaks: "H14 refusal" },
  { name: "H14 none may be alone", file: CW, from: "  if (!secondaryCount && !alone) {", to: "  if (!secondaryCount) {", breaks: "H14 refusal" },
  { name: "H14 the card does not say it", file: CW, from: "  if (alone) lines.push(line(\"<em>Performed by the primary caster alone", to: "  if (false) lines.push(line(\"<em>Performed by the primary caster alone", breaks: "H14 card" },
  // H15
  { name: "H15 a rate of 0 is taken", file: RATE, from: "  if (!Number.isFinite(n) || n < MIN_RATE || n > MAX_RATE) return 1;", to: "  if (!Number.isFinite(n) || n > MAX_RATE) return 1;", breaks: "H15 normalise" },
  { name: "H15 a huge rate is taken", file: RATE, from: "  if (!Number.isFinite(n) || n < MIN_RATE || n > MAX_RATE) return 1;", to: "  if (!Number.isFinite(n) || n < MIN_RATE) return 1;", breaks: "H15 normalise" },
  { name: "H15 a disabled effect's rate counts", file: RATE, from: "    if (!effect || effect.disabled || effect.isSuppressed) continue;", to: "    if (!effect) continue;", breaks: "H15 rates" },
  { name: "H15 rates do not multiply (the last wins)", file: RATE, from: "    hp *= spec.hp;", to: "    hp = spec.hp;", breaks: "H15 rates" },
  { name: "H15 rounded up", file: RATE, from: "    hp: Math.max(0, Math.floor(Math.max(0, Number(totals?.hp) || 0) * hpRate)),", to: "    hp: Math.max(0, Math.ceil(Math.max(0, Number(totals?.hp) || 0) * hpRate)),", breaks: "H15 apply" },
  { name: "H15 PP takes the HP rate", file: RATE, from: "    pp: Math.max(0, Math.floor(Math.max(0, Number(totals?.pp) || 0) * ppRate))", to: "    pp: Math.max(0, Math.floor(Math.max(0, Number(totals?.pp) || 0) * hpRate))", breaks: "H15 apply" },
  { name: "H15 the rest ignores the rates", file: REST, from: "  ({ hp: hpHealed, pp: ppRecovered } = applyRestRates({ hp: hpHealed, pp: ppRecovered }, restRates));\n", to: "", breaks: "H15 wired" },
  { name: "H15 the card does not say it", file: REST, from: "    if (said) lines.push(summaryLine(`<em>${said}</em>`));", to: "    if (false) lines.push(summaryLine(`<em>${said}</em>`));", breaks: "H15 card" },
  // H16
  { name: "H16 every storm is rolled", file: ST, from: "  const pick = text(raw.pick).toLowerCase() === \"roll\" ? \"roll\" : \"choose\";", to: "  const pick = \"roll\";", breaks: "H16 defaults" },
  { name: "H16 every storm strikes at the turn start", file: ST, from: "  const strikes = text(raw.strikes) === \"turnStart\" ? \"turnStart\" : \"sustain\";", to: "  const strikes = \"turnStart\";", breaks: "H16 defaults" },
  { name: "H16 a storm follows when not asked", file: ST, from: "follow: raw.follow === true };", to: "follow: raw.follow !== false };", breaks: "H16 defaults" },
  { name: "H16 a rolled storm cannot repeat", file: ST, from: "  if (spec?.pick === \"roll\") return [...(spec?.modes ?? [])];\n", to: "", breaks: "H16 offered" },
  { name: "H16 the face is off by one", file: ST, from: "? modes[n - 1] : null;", to: "? modes[n] ?? null : null;", breaks: "H16 face" },
  { name: "H16 a cast's storm expires on its own", file: ST, from: "  return record?.ownExpiry === true && Number.isFinite(until)", to: "  return Number.isFinite(until)", breaks: "H16 expiry" },
  { name: "H16 a rolled storm is chosen", file: SW, from: "  if (spec.pick !== \"roll\") return { mode: await promptStormMode(spec, last, label), lines: [] };", to: "  return { mode: await promptStormMode(spec, last, label), lines: [] };", breaks: "H16 pick" },
  { name: "H16 a turn-start storm strikes on a Sustain", file: SW, from: "  if (spec.strikes === \"turnStart\") return [];\n", to: "", breaks: "H16 sustain" },
  { name: "H16 the turn start strikes every storm", file: SW, from: "      if (spec.strikes !== \"turnStart\" || String(record.casterUuid ?? \"\") !== String(actor.uuid ?? \"\")) continue;", to: "      if (spec.strikes !== \"turnStart\") continue;", breaks: "H16 board: another creature" },
  { name: "H16 an ended cast's storm still strikes", file: SW, from: "      if (!(await stormCastRunning(actor, record))) continue;\n", to: "", breaks: "H16 board: ended cast" },
  { name: "H16 a module's storm never passes", file: SW, from: "      if (stormExpired(record, now)) {", to: "      if (false) {", breaks: "H16 board: passes" },
  { name: "H16 the turn start does not call it", file: CB, from: "      for (const said of await applyStormTurnStarts(actor)) lines.push(TRGCombat.#chatLine(said));\n", to: "", breaks: "H16 called" },
  { name: "H16 any client moves the storm", file: SW, from: "export async function followStorms(tokenDocument, changed = {}) {\n  if (!isActingGM()) return 0;", to: "export async function followStorms(tokenDocument, changed = {}) {", breaks: "H16 board: acting GM" },
  { name: "H16 the follower reads the stale document", file: SW, from: "  const x = Number(changed.x ?? tokenDocument.x ?? 0)", to: "  const x = Number(tokenDocument.x ?? 0)", breaks: "H16 board: follows" },
  { name: "H16 every token's move moves it", file: SW, from: "    if (!record.followTokenId || record.followTokenId !== tokenDocument.id) continue;", to: "    if (!record.followTokenId) continue;", breaks: "H16 board: other token" },
  { name: "H16 the clock is not registered", file: SW, from: "    expireStorms(worldTime).catch(", to: "    (async () => 0)(worldTime).catch(", breaks: "H16 registered?" },
  { name: "H16 the storms are not registered", file: TP, from: "  registerStorms();\n", to: "", breaks: "H16 registered" },
  { name: "H16 placeStorm's storm keeps no clock", file: SW, from: "  const lines = await castStorm(region, row, { caster: actor, castId, dc, spellName: label, baseDamage, follow, until });", to: "  const lines = await castStorm(region, row, { caster: actor, castId, dc, spellName: label, baseDamage, follow });", breaks: "H16 board: placeStorm" },
  { name: "H16 placeStorm's follow is ignored", file: SW, from: "  const follows = follow === null ? spec.follow : follow === true;", to: "  const follows = spec.follow;", breaks: "H16 board: placeStorm" },
  { name: "H16 placeStorm raises one with no radius", file: SW, from: "  if (!scene || !at || !feet) return", to: "  if (!scene || !at) return", breaks: "H16 board: no radius" },
  { name: "H16 no helper for modules", file: APW, from: "      placeStorm: async (...args) => (await import(\"./magic/storm-workflow.mjs\")).placeStorm(...args),", to: "      placeStorm: null,", breaks: "H16 helper" },
  // Z
  { name: "Z the version is not raised", file: SJ, from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.686.2\"", breaks: "Z1" },
  { name: "Z the download names the last release", file: SJ, from: "releases/download/v3.687.1/trg-prime.zip", to: "releases/download/v3.686.2/trg-prime.zip", breaks: "Z1" },
  { name: "Z package.json is left behind", file: PJ, from: "\"version\": \"3.687.1\"", to: "\"version\": \"3.686.2\"", breaks: "Z2" }
];
function run() { try { execFileSync(process.execPath, [path.join(SYSTEM_ROOT, "tools", "verify-block8b-core.mjs")], { stdio: ["ignore", "pipe", "pipe"] }); return true; } catch { return false; } }
const guard = guardFiles([...new Set(MUTATIONS.map((x) => x.file))]);
const results = [];
try {
  if (!run()) { process.stderr.write("mutate-block8b-core: verify already fails on an unmodified tree.\n"); guard.release(); process.exit(2); }
  for (const mu of MUTATIONS) {
    const original = fs.readFileSync(mu.file, "utf8");
    const n = original.split(mu.from).length - 1;
    if (n !== 1) { results.push({ name: mu.name, state: n === 0 ? "ANCHOR MISSING" : `ANCHOR AMBIGUOUS (${n})` }); continue; }
    fs.writeFileSync(mu.file, original.replace(mu.from, mu.to));
    const survived = run();
    fs.writeFileSync(mu.file, original);
    results.push({ name: mu.name, state: survived ? "SURVIVED" : "caught", breaks: mu.breaks });
  }
} finally { guard.restore(); guard.release(); }
const bad = results.filter((r) => r.state !== "caught");
for (const r of results) { process.stdout.write(`  ${r.state === "caught" ? "caught  " : r.state.padEnd(8)}  ${r.name}\n`); if (r.state === "SURVIVED") process.stdout.write(`            should have broken: ${r.breaks}\n`); }
process.stdout.write(bad.length ? `\nmutate-block8b-core: FAILED — ${bad.length} of ${results.length} not caught.\n` : `\nmutate-block8b-core: OK — all ${results.length} mutations caught, tree restored.\n`);
if (bad.length) process.exitCode = 1;
