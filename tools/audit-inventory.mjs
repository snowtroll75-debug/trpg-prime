#!/usr/bin/env node
/**
 * audit-inventory — every mechanically relevant core compendium entry, with
 * the machinery measured behind it (3.697.0).
 *
 * WHAT IT IS. The generator behind TRG_CORE_AUTOMATION_AUDIT.md. It reads
 * every core pack (from a copy, so the LevelDB files are never opened in
 * place) and, for each entry, records which of the system's automation routes
 * reach it:
 *
 *   data        an embedded Active Effect with changes, or a trg-prime flag
 *               beyond the note markers (bleedReduction, conditionals, …)
 *   structured  a spell's or item's own structured fields: effects rows,
 *               damage formula, defence/save, uses, charges
 *   grants      it hands over named abilities, spells or feats
 *   code        its name (or its camelCase / kebab key) appears in the rules
 *               source with comments stripped
 *   composed    feats only: one of the names feat-evidence.mjs's
 *               COMPOSED_NAME_TABLES build, which no text search can see
 *   parsed      its description names a registered condition, which the cast
 *               and consumable workflows read off the text at use time
 *   harness     its name appears in a verify-*.mjs file (a check names it)
 *   live        its name appears in a live-testing report in this repository
 *
 * WHAT IT IS NOT. Measuring that machinery EXISTS is not the same as proving
 * it is RIGHT, and this tool never claims an A–D class. That judgement was
 * made rule by rule in the forty-block Core audit (claude/audit-pages-*.md in
 * the project), and is repeated here only where this session re-examined an
 * entry. An entry with no route at all is flagged REVIEW, never "broken": the
 * feat-evidence header records four separate passes in which "nothing
 * implements this" turned out to be a route the tool could not see.
 *
 *   node tools/audit-inventory.mjs [--json out.json] [--md out.md]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as acorn from "acorn";
import { ClassicLevel } from "classic-level";
import { SYSTEM_ROOT } from "./lib/sources.mjs";
import { COMPOSED_NAME_TABLES } from "./feat-evidence.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);

/** Packs whose entries carry rules. Macros, vehicles and test items are reported separately. */
const RULE_PACKS = ["abilities", "afflictions", "alchemical", "ammunition", "armour", "backgrounds", "charged-items",
  "classes", "companions", "consumables", "creature-abilities", "creature-attacks", "creature-classes", "creature-types",
  "divine-aspects", "familiars", "feats", "gear", "heritages", "origins", "races", "runes", "shields", "specific-items",
  "spells", "weapons", "wizard-schools", "wondrous"];

/** Item fields the engine reads directly (see routesFor). */
const ENGINE_FIELDS = ["stages", "spellbookContainer", "damageTypeOverride", "compatibleWeaponGroup", "allowsSubdual",
  "maxDexBonus", "lightSource", "light", "capacity", "investable", "potency", "runes"];

const NOTE_FLAGS = new Set(["featNote", "featPassive", "sourceId", "grantedBy", "core", "exportSource"]);

async function readPack(name) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `trg-${name}-`));
  fs.cpSync(path.join(SYSTEM_ROOT, "packs", name), tmp, { recursive: true });
  const db = new ClassicLevel(tmp, { valueEncoding: "json" });
  const items = [], effects = new Map();
  for await (const [k, v] of db.iterator()) {
    if (k.startsWith("!items!")) items.push(v);
    else if (k.startsWith("!items.effects!")) {
      const parent = k.slice("!items.effects!".length).split(".")[0];
      if (!effects.has(parent)) effects.set(parent, []);
      effects.get(parent).push(v);
    }
  }
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  return { items, effects };
}

/** Comments blanked with acorn, as feat-evidence does: a name in a comment is not machinery. */
function stripComments(src) {
  const comments = [];
  acorn.parse(src, { ecmaVersion: "latest", sourceType: "module", ranges: true, onComment: comments });
  let out = src;
  for (const c of comments.sort((a, b) => b.start - a.start)) out = out.slice(0, c.start) + " ".repeat(c.end - c.start) + out.slice(c.end);
  return out;
}
function readTree(dir, ext) {
  const out = [];
  (function rec(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) rec(p); else if (p.endsWith(ext)) out.push(p);
    }
  })(dir);
  return out;
}
const words = (n) => String(n).match(/[A-Za-z0-9]+/g) ?? [];
function nameVariants(name) {
  const w = words(name);
  if (!w.length) return [];
  const camel = w[0].toLowerCase() + w.slice(1).map((x) => x[0].toUpperCase() + x.slice(1).toLowerCase()).join("");
  return [String(name).toLowerCase(), camel.toLowerCase(), w.join("-").toLowerCase(), w.join("_").toLowerCase()];
}
const plain = (html) => String(html ?? "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ").trim();
const descOf = (sys) => plain(typeof sys?.description === "object" ? sys.description?.value : sys?.description);

const ruleSource = readTree(path.join(SYSTEM_ROOT, "module"), ".mjs").map((f) => stripComments(fs.readFileSync(f, "utf8"))).join("\n").toLowerCase();
const harnessSource = readTree(path.join(SYSTEM_ROOT, "tools"), ".mjs").filter((f) => /\/verify-[^/]+\.mjs$/.test(f)).map((f) => fs.readFileSync(f, "utf8")).join("\n").toLowerCase();
const liveSource = fs.readdirSync(SYSTEM_ROOT).filter((f) => /^live-testing-report.*\.md$/.test(f)).map((f) => fs.readFileSync(path.join(SYSTEM_ROOT, f), "utf8")).join("\n").toLowerCase();

const composedNames = new Set();
for (const [rel, exported] of COMPOSED_NAME_TABLES) {
  const table = (await import(`file://${path.join(SYSTEM_ROOT, rel)}`))[exported];
  for (const k of Object.keys(table ?? {})) composedNames.add(String(k).trim().toLowerCase());
}

const { CONDITIONS } = await import(path.join(SYSTEM_ROOT, "module", "conditions", "registry.mjs"));
const conditionLabels = Object.values(CONDITIONS).map((c) => String(c.label ?? "").toLowerCase()).filter(Boolean);

/** Whether a word or phrase appears as a whole word. */
const hasWord = (hay, needle) => new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`).test(hay);

function routesFor(pack, item, effects) {
  const sys = item.system ?? {};
  const flags = item.flags?.["trg-prime"] ?? {};
  const r = [];
  const effs = effects.get(item._id) ?? [];
  if (effs.some((e) => (e.changes ?? []).length) || Object.keys(flags).some((k) => !NOTE_FLAGS.has(k))
    || effs.some((e) => Object.keys(e.flags?.["trg-prime"] ?? {}).some((k) => !NOTE_FLAGS.has(k)))) r.push("data");
  const structured = (Array.isArray(sys.effects) && sys.effects.length) || sys.damage?.formula || (typeof sys.damage === "string" && sys.damage)
    || sys.baseDamage || (sys.defence && sys.defence !== "none") || sys.usesPerDay || sys.charges || sys.formula || sys.progression
    || (Array.isArray(sys.warps) && sys.warps.length) || sys.dr || sys.defenceBonus || sys.attack;
  if (structured) r.push("structured");
  // THE ENGINE READS SOME ENTRIES BY WHAT THEY ARE. A weapon, armour, shield
  // or ammunition item is consumed by the attack, defence and DR pipelines
  // through its type and fields; an affliction runs on its stages; a spell
  // book is a container the casting workflow reads.
  if (["weapon", "armour", "shield", "ammunition"].includes(item.type) || ENGINE_FIELDS.some((k) => {
    const v = sys[k]; return v && !(typeof v === "object" && !Array.isArray(v) && !Object.values(v).some(Boolean));
  }) || Number(sys.uses?.max) > 0) r.push("engine");
  if (["grantedAbilities", "grantedSpells", "grantedFeats", "classAbilities"].some((k) => sys[k] || flags[k])) r.push("grants");
  const vs = nameVariants(item.name);
  if (vs.some((v) => v.length > 3 && hasWord(ruleSource, v))) r.push("code");
  if (pack === "feats" && composedNames.has(String(item.name).toLowerCase())) r.push("composed");
  const d = descOf(sys).toLowerCase();
  if (conditionLabels.some((c) => hasWord(d, c))) r.push("parsed");
  return r;
}

const rows = [];
const totals = {};
for (const pack of RULE_PACKS) {
  if (!fs.existsSync(path.join(SYSTEM_ROOT, "packs", pack))) continue;
  const { items, effects } = await readPack(pack);
  for (const item of items.sort((a, b) => a.name.localeCompare(b.name))) {
    const routes = routesFor(pack, item, effects);
    const lower = String(item.name).toLowerCase();
    const harness = harnessSource.includes(lower);
    const live = liveSource.includes(lower);
    const mech = routes.filter((x) => x !== "parsed");
    const status = mech.length ? (harness ? "mechanism + check" : "mechanism, no named check") : (routes.includes("parsed") ? "parsed only" : "REVIEW");
    totals[pack] ??= { entries: 0, "mechanism + check": 0, "mechanism, no named check": 0, "parsed only": 0, REVIEW: 0 };
    totals[pack].entries++; totals[pack][status]++;
    rows.push({
      pack, name: item.name, id: item._id, type: item.type,
      source: String(item.system?.source ?? "").trim(),
      intent: descOf(item.system).split(/(?<=[.!?])\s/)[0]?.slice(0, 160) ?? "",
      routes, harness, live, status
    });
  }
}

if (opt("--json")) fs.writeFileSync(opt("--json"), JSON.stringify({ totals, rows }, null, 1));
const md = [];
md.push("| Compendium | Entries | Mechanism + named check | Mechanism, no named check | Parsed from text only | REVIEW |", "|---|---|---|---|---|---|");
for (const [p, t] of Object.entries(totals)) md.push(`| ${p} | ${t.entries} | ${t["mechanism + check"]} | ${t["mechanism, no named check"]} | ${t["parsed only"]} | ${t.REVIEW} |`);
const sum = (k) => Object.values(totals).reduce((a, t) => a + t[k], 0);
md.push(`| **All** | **${sum("entries")}** | **${sum("mechanism + check")}** | **${sum("mechanism, no named check")}** | **${sum("parsed only")}** | **${sum("REVIEW")}** |`);
if (opt("--md")) fs.writeFileSync(opt("--md"), md.join("\n") + "\n");
process.stdout.write(md.join("\n") + "\n");
