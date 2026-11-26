/**
 * SPELL-MATRIX GENERATOR — every spell, every legal Warping and Metamagic
 * configuration class, generated from the RULES (rules-model.mjs) and the
 * pack data, never hand-listed.
 *
 *   node tools/spell-matrix/generate.mjs            # core packs + any module exports
 *
 * Inputs
 *   packs/spells, packs/feats                (core, read from LevelDB)
 *   tools/spell-matrix/data/modules/*.json   (module spells/feats exported from the
 *                                             running world by live/export-packs.js)
 * Outputs (tools/spell-matrix/data/)
 *   inventory.json   one row per spell: identity, mechanics, warps, metamagic eligibility
 *   metamagic.json   every Metamagic-trait feat found, with its rules model
 *   cases.jsonl      one test case per line (see CASE SHAPE below)
 *   summary.json     counts, including the size of each spell's FULL legal space
 *
 * WHY CLASSES AND NOT EVERY CONFIGURATION. A spell with five repeatable
 * warps and a caster cap of 21 has tens of thousands of legal
 * configurations; the engine aggregates them option by option, so the
 * distinct mechanical paths are: each option alone, at its boundary, past
 * its boundary, every pair together, and the cap filled. Those are all
 * generated. The full space is COUNTED per spell (summary.json) so the
 * matrix accounts for it, and verify.mjs additionally sweeps every legal
 * configuration of the calculation layer where the space is under
 * FULL_SWEEP_LIMIT.
 *
 * CASE SHAPE
 *   { id, spell, uuid, source, profile, caster, config, picks:[{kind,id,index?,times,ppCost}],
 *     legal: true|false|"unresolved", why, expected:{total,raw,cap,castingDC,warpPP,mmPP},
 *     roles:["GM","Player"] }
 *
 * The ids are stable (spell uuid + profile + picks), so a later run can be
 * diffed against an earlier one and only changed cases retested.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { ClassicLevel } from "classic-level";
import * as R from "./rules-model.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "data");
fs.mkdirSync(OUT, { recursive: true });

/* ── Read packs (a copy, so a running Foundry's LOCK never matters) ──── */
async function readPack(rel) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sm-"));
  fs.cpSync(path.join(ROOT, rel), tmp, { recursive: true });
  try { fs.rmSync(path.join(tmp, "LOCK")); } catch { /* none */ }
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const rows = [];
  for await (const [k, v] of db.iterator()) if (k.startsWith("!items!")) rows.push(v);
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  return rows;
}

const system = JSON.parse(fs.readFileSync(path.join(ROOT, "system.json"), "utf8"));
const sources = [{ id: "trg-prime", version: system.version, spells: await readPack("packs/spells"), feats: await readPack("packs/feats"), packSpells: "trg-prime.spells" }];
const modDir = path.join(OUT, "modules");
if (fs.existsSync(modDir)) {
  for (const f of fs.readdirSync(modDir).filter((n) => n.endsWith(".json")).sort()) {
    const m = JSON.parse(fs.readFileSync(path.join(modDir, f), "utf8"));
    sources.push({ id: m.module, version: m.version, spells: m.spells ?? [], feats: m.feats ?? [], packSpells: m.spellPack });
  }
}

/* ── Metamagic inventory: every feat whose traits say Metamagic ─────── */
const metamagic = [];
for (const src of sources) for (const f of src.feats) {
  if (!/\bmetamagic\b/i.test(String(f.system?.traits ?? ""))) continue;
  const key = f.name.toLowerCase();
  const model = R.METAMAGIC[key];
  metamagic.push({ name: f.name, source: src.id, id: f._id, traits: f.system.traits,
    prerequisites: f.system.prerequisites ?? "", modelled: Boolean(model), castTime: model?.castTime ?? null,
    note: model ? "" : "NOT IN THE CORE MODEL — module metamagic, offered through the module API; live only" });
}

/* ── Profiles: who casts it ─────────────────────────────────────────── */
function profilesFor(s) {
  const trads = String(s.tradition ?? "").split(/,\s*/).filter(Boolean);
  const tradition = trads.includes("divinity") ? "divinity" : (trads[0] ?? "arcane");
  if (s.specialist) {
    const min = Math.max(1, s.ppCost);
    return [["min", { level: min, casterLevel: min, tradition }], ["L10", { level: 10, casterLevel: 10, tradition }], ["L20", { level: 20, casterLevel: 20, tradition }]]
      .filter(([, c], i, a) => i === 0 || c.level > a[0][1].level);
  }
  const minCL = Math.max(1, s.ppCost - 1);
  return [["min", { level: minCL, casterLevel: minCL, tradition }], ["L10", { level: 10, casterLevel: 10, tradition }], ["L20", { level: 20, casterLevel: 20, tradition }]]
    .filter(([, c], i, a) => i === 0 || c.casterLevel > a[0][1].casterLevel);
}

/* ── Options a spell offers, per the book ───────────────────────────── */
function optionsFor(s, caster) {
  const opts = [];
  (s.warps ?? []).forEach((w, i) => {
    const bm = R.bookWarpMax(w);
    opts.push({ kind: "warp", id: `warp-${i}`, index: i, ppCost: Number(w.ppCost) || 0, bookMax: bm.max, why: bm.why,
      dimension: R.warpDimension(w, s), nature: R.warpNature(w), structured: Boolean(w.mods && Object.keys(w.mods).length), text: w.text });
  });
  const mm = [];
  for (const [name, m] of Object.entries(R.METAMAGIC)) {
    if (!m.castTime) continue;
    const e = m.eligible(s, caster);
    mm.push({ kind: "mm", id: m.id, feat: name, eligibility: e, ppOf: (n) => m.cost(s, n, caster), bookMax: m.max(s, caster),
      select: typeof m.select === "function" ? m.select(s) : m.select });
  }
  return { warps: opts, mm };
}

const pickOf = (o, times) => o.kind === "warp"
  ? { kind: "warp", id: o.id, index: o.index, times, ppCost: o.ppCost }
  : { kind: "mm", id: o.id, feat: o.feat, times, ppCost: o.ppOf(times), ...(o.select ? { choice: o.select } : {}) };

/** Count every legal configuration (each option 0..max, total ≤ cap). */
function countSpace(base, cap, options) {
  const room = cap - base;
  if (room < 0) return 0;
  let ways = new Array(room + 1).fill(0); ways[0] = 1;
  for (const o of options) {
    const next = new Array(room + 1).fill(0);
    for (let used = 0; used <= room; used++) {
      if (!ways[used]) continue;
      for (let n = 0; ; n++) {
        if (n > (Number.isFinite(o.max) ? o.max : room)) break;
        const c = o.cost(n);
        if (used + c > room) break;
        next[used + c] += ways[used];
        if (c === 0 && n > 0 && !Number.isFinite(o.max)) break;  // a free unlimited option: one more state, not infinitely many
      }
    }
    ways = next;
  }
  return ways.reduce((a, b) => a + b, 0);
}

/* ── Generate ───────────────────────────────────────────────────────── */
const inventory = [];
const casesOut = fs.createWriteStream(path.join(OUT, "cases.jsonl"));
const summary = { generated: new Date().toISOString(), core: system.version, sources: sources.map((s) => `${s.id}@${s.version}:${s.spells.length}`),
  spells: 0, cases: 0, legal: 0, illegal: 0, unresolved: 0, byConfig: {}, fullSpace: {}, emptyMechanicalWarps: 0 };

for (const src of sources) for (const raw of src.spells) {
  const s = { ...raw.system, name: raw.name };
  s.ppCost = Number(s.ppCost) || 0;
  const uuid = `Compendium.${src.packSpells}.Item.${raw._id}`;
  const cantrip = R.isCantrip(s);
  const inv = { name: raw.name, source: src.id, uuid, id: raw._id, tradition: s.tradition, category: s.category,
    specialist: Boolean(s.specialist), innate: Boolean(s.innate), cantrip, traits: s.traits, ppCost: s.ppCost, castAP: s.castAP,
    range: s.range, area: s.area, targets: s.targets, defence: s.defence, damage: s.damage?.formula ?? "", damageType: s.damage?.type ?? "",
    baseDamage: s.baseDamage ?? "", duration: s.duration, sustained: Boolean(s.sustained), components: s.components,
    warps: (s.warps ?? []).map((w, i) => ({ i, pp: w.ppCost, text: w.text, structured: Boolean(w.mods && Object.keys(w.mods).length), nature: R.warpNature(w),
      bookMax: R.bookWarpMax(w).max, textDice: R.textDamageDice(w), modsDice: w.mods?.damageDice ?? null })),
    metamagic: {}, fullSpace: {} };
  for (const w of inv.warps) if (!w.structured && w.nature === "mechanical") summary.emptyMechanicalWarps++;
  summary.spells++;

  for (const [profile, caster] of profilesFor(s)) {
    const { warps, mm } = optionsFor(s, caster);
    if (profile === "L20") for (const o of mm) inv.metamagic[o.feat] = o.eligibility;
    const cap = s.specialist ? R.specialistCap(caster.level) : R.castCap(caster.casterLevel);
    const usable = cantrip ? [] : [...warps, ...mm.filter((o) => o.eligibility === "eligible" || o.eligibility === "unresolved")];
    const emit = (config, picks, legalHint = null) => {
      const exp = R.expectedCost(s, caster, picks);
      let legal = true, why = "";
      if (cantrip && picks.length) { legal = false; why = "cantrips cannot be warped (l.19811)"; }
      for (const p of picks) {
        const o = [...warps, ...mm].find((x) => x.id === p.id);
        if (!o) continue;
        if (o.kind === "mm" && o.eligibility === "ineligible") { legal = false; why = `${o.feat}: spell lacks the parameter`; }
        if (o.kind === "mm" && o.eligibility === "unresolved" && legal === true) { legal = "unresolved"; why = `${o.feat}: rules unclear for this spell`; }
        if (p.times > o.bookMax) { legal = false; why = `${o.id} bought ${p.times}× (book max ${o.bookMax})`; }
      }
      if (legal !== false && !exp.fitsCap) { legal = false; why = `total ${exp.total} PP > cap ${exp.cap}`; }
      if (legalHint && legal !== false) { legal = legalHint.legal; why = legalHint.why; }
      const id = `${raw._id}|${profile}|${picks.map((p) => `${p.id}x${p.times}`).join("+") || "base"}`;
      const row = { id, spell: raw.name, uuid, source: src.id, profile, caster, config, picks, legal, why, expected: exp, roles: ["GM", "Player"] };
      casesOut.write(JSON.stringify(row) + "\n");
      summary.cases++; summary.byConfig[config] = (summary.byConfig[config] ?? 0) + 1;
      if (legal === true) summary.legal++; else if (legal === false) summary.illegal++; else summary.unresolved++;
    };

    emit("base", []);
    if (cantrip) {
      // A cantrip's rejection test: the first warp, if any, and Extend.
      if (warps[0]) emit("warp", [pickOf(warps[0], 1)]);
      continue;
    }
    for (const o of usable) {
      const unit = o.kind === "warp" ? o.ppCost : o.ppOf(1) || 1;
      const byCap = o.id === "economic" ? o.bookMax : Math.floor((cap - s.ppCost) / Math.max(1, unit));
      const maxLegal = Math.max(0, Math.min(Number.isFinite(o.bookMax) ? o.bookMax : Infinity, byCap));
      const cfg = o.kind === "warp" ? "warp" : "metamagic";
      emit(cfg, [pickOf(o, 1)]);
      if (maxLegal > 1) emit(`${cfg}-max`, [pickOf(o, maxLegal)]);
      if (!o.select) emit(`${cfg}-over`, [pickOf(o, Math.max(2, maxLegal + 1))]);
    }
    for (const o of mm.filter((x) => x.eligibility === "ineligible")) emit("metamagic-ineligible", [pickOf(o, 1)]);
    for (let i = 0; i < usable.length; i++) for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i], b = usable[j];
      const ruling = R.pairRuling(a, b);
      const cfg = a.kind === "warp" && b.kind === "warp" ? "warp-pair" : a.kind === "mm" && b.kind === "mm" ? "metamagic-pair" : "combined";
      emit(cfg, [pickOf(a, 1), pickOf(b, 1)], ruling.legal === true ? null : ruling);
    }
    // FILL: every option once in order while it fits, then the cheapest repeatable to the cap.
    const fill = []; let room = cap - s.ppCost;
    for (const o of usable) {
      if (o.id === "economic") continue;
      const c = o.kind === "warp" ? o.ppCost : o.ppOf(1);
      if (c > 0 && c <= room && fill.every((p) => R.pairRuling(o, [...warps, ...mm].find((x) => x.id === p.id)).legal === true)) { fill.push(pickOf(o, 1)); room -= c; }
    }
    if (fill.length > 1) emit("fill-cap", fill);

    const space = countSpace(s.ppCost, cap, usable.filter((o) => o.id !== "economic").map((o) => ({
      max: o.bookMax, cost: (n) => (o.kind === "warp" ? o.ppCost * n : o.ppOf(n)) })));
    inv.fullSpace[profile] = space;
    summary.fullSpace[profile] = (summary.fullSpace[profile] ?? 0) + space;
  }
  inventory.push(inv);
}
await new Promise((r) => casesOut.end(r));
fs.writeFileSync(path.join(OUT, "inventory.json"), JSON.stringify(inventory, null, 1));
fs.writeFileSync(path.join(OUT, "metamagic.json"), JSON.stringify(metamagic, null, 1));
fs.writeFileSync(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
