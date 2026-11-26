/**
 * SPELL-MATRIX VERIFY — the calculation layer, every generated case, driven
 * through the ENGINE's own pure functions and compared with the rules model.
 *
 *   node tools/spell-matrix/generate.mjs && node tools/spell-matrix/verify.mjs [--sweep]
 *
 * What it drives (no Foundry needed; these modules are pure):
 *   buildMetamagicOptions / aggregateMetamagicSelection   (magic/metamagic.mjs)
 *   aggregateWarpSelection / warpMaxTimes / warpScalesWithRepeats (magic/spell-warp.mjs)
 *   castingDC / maxPPPerCast / specialistMaxPP            (magic/casting.mjs)
 * and the cast workflow's own total-PP expression, re-stated in `engineTotal`
 * below WITH A SOURCE CHECK that fails if cast-workflow.mjs changes it.
 *
 * What it can NOT prove: that the cast applies what it charged for. Range,
 * area, targets, HP, effects, permissions — those are the live runner's job
 * (live/matrix-driver.js). A green run here means "the numbers agree with
 * the book", not "the spell works".
 *
 * Findings are classified:
 *   DEFECT        engine and book disagree, and the book is clear
 *   NOTE-ONLY     an option the engine charges for and only describes
 *   INTERPRETATION engine chose one reading of an unclear rule
 *   REVIEW        heuristic disagreement (text parser vs authored data) for a person to check
 * --sweep additionally walks EVERY legal configuration of each spell whose full
 * space at L20 is under FULL_SWEEP_LIMIT, comparing PP totals.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import * as R from "./rules-model.mjs";
import { buildMetamagicOptions, aggregateMetamagicSelection } from "../../module/magic/metamagic.mjs";
import { aggregateWarpSelection, warpMaxTimes, warpScalesWithRepeats, WARP_UNLIMITED } from "../../module/magic/spell-warp.mjs";
import { castingDC, maxPPPerCast, specialistMaxPP } from "../../module/magic/casting.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const DATA = path.join(HERE, "data");
const SWEEP = process.argv.includes("--sweep");
const FULL_SWEEP_LIMIT = 20000;

/* The cast workflow's total, pinned to its source so a change there fails here. */
const workflow = fs.readFileSync(path.join(ROOT, "module/magic/cast-workflow.mjs"), "utf8");
const TOTAL_EXPR = "basePP + mmx.basePPAdd + warpPP + metamagicPP + mm.ppDelta - signatureDiscount";
if (!workflow.includes(TOTAL_EXPR)) { console.error(`FAIL: cast-workflow's total-PP expression changed; re-read it and update engineTotal()`); process.exit(2); }
const engineTotal = (base, warpPP, mmPP, ppDelta, cantrip = false) => (cantrip ? 0 : Math.max(1, base + warpPP + mmPP + ppDelta));
const NOTE_ONLY_KINDS = new Set([undefined]);          // aggregate's `default:` branch
const ALL_MM = Object.keys(R.METAMAGIC);

const inventory = JSON.parse(fs.readFileSync(path.join(DATA, "inventory.json"), "utf8"));
const bySpell = new Map(inventory.map((s) => [s.uuid, s]));
const rawSpells = new Map();          // uuid -> system data, for the engine calls
{
  const { ClassicLevel } = await import("classic-level");
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "smv-"));
  fs.cpSync(path.join(ROOT, "packs/spells"), tmp, { recursive: true });
  try { fs.rmSync(path.join(tmp, "LOCK")); } catch { /* none */ }
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!")) rawSpells.set(`Compendium.trg-prime.spells.Item.${v._id}`, v.system);
  await db.close();
  const modDir = path.join(DATA, "modules");
  if (fs.existsSync(modDir)) for (const f of fs.readdirSync(modDir).filter((n) => n.endsWith(".json"))) {
    const m = JSON.parse(fs.readFileSync(path.join(modDir, f), "utf8"));
    for (const sp of m.spells ?? []) rawSpells.set(`Compendium.${m.spellPack}.Item.${sp._id}`, sp.system);
  }
}

const findings = [];
const seen = new Set();
const find = (cls, code, spell, detail, extra = {}) => {
  const key = `${cls}|${code}|${spell}|${detail}`;
  if (seen.has(key)) return; seen.add(key);
  findings.push({ class: cls, code, spell, detail, ...extra });
};
const stats = { cases: 0, compared: 0, agree: 0, disagree: 0, liveOnly: 0, sweepSpells: 0, sweepConfigs: 0, sweepDisagree: 0 };

/* ── Per spell: offered metamagic, warp repeat caps, authored dice ─── */
for (const s of inventory) {
  const sys = rawSpells.get(s.uuid);
  if (!sys || s.cantrip) continue;
  for (const profileCL of [10, 20]) {
    const trads = String(sys.tradition ?? "").split(/,\s*/).filter(Boolean);
    const tradition = trads.includes("divinity") ? "divinity" : (trads[0] ?? "arcane");
    const offered = buildMetamagicOptions({ featNames: ALL_MM, elementalTypes: ["fire"], spellData: sys,
      basePP: Number(sys.ppCost) || 0, casterLevel: profileCL, tradition, charisma: 3 });
    const offeredIds = new Set(offered.map((o) => o.id));
    for (const [name, m] of Object.entries(R.METAMAGIC)) {
      if (!m.castTime) continue;
      const book = m.eligible({ ...sys, name: s.name, ppCost: Number(sys.ppCost) || 0 }, { casterLevel: profileCL, tradition });
      const eng = offeredIds.has(m.id);
      if (book === "eligible" && !eng) find("DEFECT", "MM-NOT-OFFERED", s.name, `${name} is eligible by its text but not offered`, { source: s.source });
      if (book === "ineligible" && eng) find("DEFECT", "MM-OFFERED-INELIGIBLE", s.name, `${name} is offered but the spell lacks the parameter`, { source: s.source });
      if (book === "unresolved") find("INTERPRETATION", "MM-UNRESOLVED", s.name, `${name}: book unclear; engine ${eng ? "offers" : "withholds"} it`, { source: s.source });
      const o = offered.find((x) => x.id === m.id);
      if (o && eng) {
        const bookMax = m.max({ ...sys, ppCost: Number(sys.ppCost) || 0 }, { casterLevel: profileCL, tradition });
        if (Number.isFinite(bookMax) && bookMax !== o.max && m.id !== "temporal")
          find("DEFECT", "MM-MAX", s.name, `${name}: engine allows ${o.max}×, book ${bookMax}×`);
        if (!Number.isFinite(bookMax) && Number.isFinite(o.max))
          find("DEFECT", "MM-ARBITRARY-CAP", "(all)", `${name}: engine caps at ${o.max}×; the feat prints no ceiling (the cast cap is the limit)`);
        if (m.id === "temporal" && o.max !== bookMax)
          find("DEFECT", "MM-MAX", s.name, `Temporal Extension: engine allows ${o.max} step(s) from "${sys.duration}", ladder allows ${bookMax}`);
        // NOTE-ONLY: what the aggregate does with it
        const agg = aggregateMetamagicSelection([o], { [`mm-${o.id}`]: o.kind === "select" ? "animal" : 1 },
          { damageFormula: String(sys.damage?.formula ?? ""), baseDamage: String(sys.baseDamage ?? "") });
        const mechanical = agg.ppDelta || agg.dcDelta || agg.apDelta || agg.componentsOff.length || agg.extend || agg.temporalSteps || agg.heightenSave || agg.elementalType || agg.extraDamageDice;
        if (!mechanical) find("NOTE-ONLY", "MM-NOTE-ONLY", "(all)", `${name}: charges ${o.kind === "select" ? "its choice's" : `+${o.ppCost}`} PP and sets no mechanical field (aggregate default branch)`);
      }
    }
  }
  (sys.warps ?? []).forEach((w, i) => {
    const engMax = warpMaxTimes(w, String(sys.area ?? ""), 20);
    const book = R.bookWarpMax(w);
    const scales = warpScalesWithRepeats(w);
    if (book.max === 1 && engMax === WARP_UNLIMITED)
      find("REVIEW", "WARP-REPEAT", s.name, `warp ${i} "${w.text.slice(0, 70)}": engine sells unlimited repeats; text reads as ${book.why}`);
    if (book.max === Infinity && engMax === 1 && !scales && Object.keys(w.mods ?? {}).length)
      find("INTERPRETATION", "WARP-CHECKBOX", s.name, `warp ${i}: book says repeatable; engine offers once because a repeat changes nothing`);
    if (Number.isFinite(book.max) && book.max > 1 && Number.isFinite(engMax) && engMax !== book.max)
      find("REVIEW", "WARP-MAX", s.name, `warp ${i} "${w.text.slice(0, 70)}": engine max ${engMax}, text max ${book.max}`);
    const textDice = R.textDamageDice(w);
    const modsDice = w.mods?.damageDice ?? null;
    if (textDice && modsDice && textDice !== modsDice)
      find("REVIEW", "WARP-DICE", s.name, `warp ${i} text says ${textDice}, authored ${modsDice}`);
    if (textDice && !modsDice && !Object.keys(w.mods ?? {}).length)
      find("REVIEW", "WARP-DICE-UNAUTHORED", s.name, `warp ${i} promises ${textDice} damage and has no mods (spell-specific code, or not applied — live)`);
    if (!Object.keys(w.mods ?? {}).length && R.warpNature(w) === "mechanical")
      find("REVIEW", "WARP-EMPTY-MECHANICAL", s.name, `warp ${i} (+${w.ppCost} PP) "${w.text.slice(0, 80)}" — no structured mods; live must show it applied`);
  });
}

/* ── Per case: the numbers ──────────────────────────────────────────── */
let interp = 0;
const rl = readline.createInterface({ input: fs.createReadStream(path.join(DATA, "cases.jsonl")) });
const results = fs.createWriteStream(path.join(DATA, "calc-results.jsonl"));
for await (const line of rl) {
  const c = JSON.parse(line);
  stats.cases++;
  const sys = rawSpells.get(c.uuid);
  if (!sys) continue;
  const base = Number(sys.ppCost) || 0;
  const offered = buildMetamagicOptions({ featNames: ALL_MM, elementalTypes: ["fire"], spellData: sys, basePP: base,
    casterLevel: c.caster.casterLevel, tradition: c.caster.tradition, charisma: 3 });
  const form = {};
  let notOffered = [];
  for (const p of c.picks) {
    if (p.kind === "warp") form[`warp-${p.index}`] = p.times;
    else { const o = offered.find((x) => x.id === p.id); if (!o) notOffered.push(p.id); else form[`mm-${p.id}`] = o.kind === "select" ? p.choice : p.times; }
  }
  const warp = aggregateWarpSelection(sys.warps ?? [], form);
  const mm = aggregateMetamagicSelection(offered, form, { damageFormula: String(sys.damage?.formula ?? ""), baseDamage: String(sys.baseDamage ?? "") });
  const cantrip = base === 0 && !sys.innate;
  const total = engineTotal(base, warp.ppSpent, mm.ppSpent, mm.ppDelta, cantrip);
  const cap = sys.specialist ? specialistMaxPP(c.caster.level) : maxPPPerCast(c.caster.casterLevel);
  const dc = castingDC(total - mm.ppDelta) + mm.dcDelta;   // Economic: DC from the unlowered PP, +2 per PP lowered
  const engineAllows = !notOffered.length && total <= cap && c.picks.every((p) => {
    if (p.kind === "warp") { const w = (sys.warps ?? [])[p.index]; return p.times <= warpMaxTimes(w, String(sys.area ?? ""), c.caster.casterLevel); }
    const o = offered.find((x) => x.id === p.id); return o && (o.kind === "select" || p.times <= o.max);
  });
  const e = c.expected;
  const diffs = [];
  if (c.legal === true) {
    stats.compared++;
    if (total !== e.total) diffs.push(`total ${total}≠${e.total}`);
    if (cap !== e.cap) diffs.push(`cap ${cap}≠${e.cap}`);
    if (!cantrip && dc !== e.castingDC) diffs.push(`castingDC ${dc}≠${e.castingDC}`);
    if (!engineAllows) {
      // WHY it refuses decides the class: a warp drawn as a checkbox because a
      // second purchase changes nothing is the engine's reading, not a fault;
      // Selective/Split's fixed ceilings are one finding, reported once above.
      const w = c.picks.find((p) => p.kind === "warp" && p.times > warpMaxTimes((sys.warps ?? [])[p.index], String(sys.area ?? ""), c.caster.casterLevel));
      if (w && !warpScalesWithRepeats((sys.warps ?? [])[w.index])) { interp++; results.write(JSON.stringify({ id: c.id, legal: c.legal, pass: null, interpretation: "WARP-CHECKBOX" }) + "\n"); continue; }
      if (c.picks.some((p) => p.id === "selective" || p.id === "split")) { interp++; results.write(JSON.stringify({ id: c.id, legal: c.legal, pass: null, interpretation: "MM-ARBITRARY-CAP" }) + "\n"); continue; }
      diffs.push(`engine refuses a legal cast (${notOffered.length ? `not offered: ${notOffered}` : total > cap ? "over cap" : "repeat cap"})`);
    }
  } else if (c.legal === false) {
    stats.compared++;
    // An illegal case must be refused somewhere. A metamagic not offered, a repeat the
    // dialog will not take, or a total over the cap (the cast refuses or asks to overcast).
    if (engineAllows) diffs.push(`engine accepts an illegal cast (${c.why})`);
  } else stats.liveOnly++;
  if (diffs.length) {
    stats.disagree++;
    let code = diffs[0].startsWith("engine accepts") ? "ILLEGAL-ACCEPTED" : diffs[0].startsWith("engine refuses") ? "LEGAL-REFUSED" : "CALC";
    let cls = "DEFECT";
    // A refused repeat on a warp whose text prints a ceiling: the model's text
    // parser reads "(max 50 feet)" as a count, the engine as a size from the
    // printed base. A person checks these; they are not counted as defects.
    if (code === "LEGAL-REFUSED" && c.picks.every((p) => p.kind !== "warp" || /\bmax/i.test((sys.warps ?? [])[p.index]?.text ?? ""))) { cls = "REVIEW"; code = "WARP-CEILING-PARSE"; }
    find(cls, code, c.spell, `${c.config}: ${c.picks.map((p) => `${p.id}×${p.times}`).join(" + ") || "base"} — ${diffs.join("; ")}`, { caseId: c.id });
  } else if (c.legal !== "unresolved") stats.agree++;
  results.write(JSON.stringify({ id: c.id, legal: c.legal, engine: { total, cap, dc, allows: engineAllows }, pass: c.legal === "unresolved" ? null : !diffs.length, diffs }) + "\n");
}
await new Promise((r) => results.end(r));

/* ── Optional: every legal configuration, where the space is small ──── */
if (SWEEP) {
  for (const s of inventory) {
    const sys = rawSpells.get(s.uuid);
    if (!sys || s.cantrip || (s.fullSpace.L20 ?? 0) > FULL_SWEEP_LIMIT || !(s.fullSpace.L20 > 1)) continue;
    stats.sweepSpells++;
    const base = Number(sys.ppCost) || 0, cap = maxPPPerCast(20);
    const warps = sys.warps ?? [];
    const maxes = warps.map((w) => Math.min(warpMaxTimes(w, String(sys.area ?? ""), 20), Math.floor((cap - base) / Math.max(1, w.ppCost))));
    const walk = (i, form, spent) => {
      if (i === warps.length) {
        stats.sweepConfigs++;
        const agg = aggregateWarpSelection(warps, form);
        if (agg.ppSpent !== spent) { stats.sweepDisagree++; find("DEFECT", "SWEEP-PP", s.name, `warp form ${JSON.stringify(form)}: engine ${agg.ppSpent} PP, sum ${spent}`); }
        return;
      }
      for (let n = 0; n <= maxes[i] && base + spent + n * warps[i].ppCost <= cap; n++) walk(i + 1, { ...form, [`warp-${i}`]: n }, spent + n * warps[i].ppCost);
    };
    walk(0, {}, 0);
  }
}

stats.interpretationCases = interp;
/*
 * THE REGRESSION BASELINE. Every case that does not pass today, by id, with why.
 * `--compare` diffs this run against the committed baseline: a case that now
 * fails and did not is a REGRESSION (exit 3); one that now passes is a FIX.
 * `--update-baseline` rewrites it, which is what a repair release does on purpose.
 */
const nowFailing = {};
for await (const line of readline.createInterface({ input: fs.createReadStream(path.join(DATA, "calc-results.jsonl")) })) {
  const r = JSON.parse(line);
  if (r.pass === false) nowFailing[r.id] = r.diffs?.[0] ?? "fail";
}
const BASE = path.join(DATA, "baseline-failures.json");
if (process.argv.includes("--compare") && fs.existsSync(BASE)) {
  const was = JSON.parse(fs.readFileSync(BASE, "utf8")).failing;
  const regressions = Object.keys(nowFailing).filter((id) => !(id in was));
  const fixed = Object.keys(was).filter((id) => !(id in nowFailing));
  stats.regressions = regressions.length; stats.fixedSinceBaseline = fixed.length;
  fs.writeFileSync(path.join(DATA, "regression-diff.json"), JSON.stringify({ regressions: regressions.map((id) => ({ id, why: nowFailing[id] })), fixed }, null, 1));
  if (regressions.length) process.exitCode = 3;
}
if (process.argv.includes("--update-baseline") || !fs.existsSync(BASE)) {
  fs.writeFileSync(BASE, JSON.stringify({ core: JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8")).version, generated: new Date().toISOString(), count: Object.keys(nowFailing).length, failing: nowFailing }));
}
const tally = findings.reduce((t, f) => ((t[`${f.class}:${f.code}`] = (t[`${f.class}:${f.code}`] ?? 0) + 1), t), {});
fs.writeFileSync(path.join(DATA, "calc-findings.json"), JSON.stringify({ stats, tally, findings }, null, 1));
console.log(JSON.stringify({ stats, tally }, null, 1));
process.exitCode ??= findings.some((f) => f.class === "DEFECT") ? 1 : 0;
